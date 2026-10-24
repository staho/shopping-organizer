#!/usr/bin/env bash
# Fail unless the public hostname redirects to the Access login on the team domain.
set -euo pipefail

url="https://shopping-organizer.staho.dev"
body="$(mktemp)"
headers="$(mktemp)"
trap 'rm -f "$body" "$headers"' EXIT

for attempt in $(seq 1 18); do
  set +e
  code="$(curl -sS -o "$body" -D "$headers" -w '%{http_code}' --max-redirs 0 --connect-timeout 10 --max-time 25 "$url")"
  curl_status=$?
  set -e

  if [[ "$curl_status" -ne 0 ]]; then
    echo "attempt ${attempt}: curl failed (${curl_status})"
    sleep 10
    continue
  fi

  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ { sub(/\r$/, "", $2); print $2; exit }' "$headers")"
  host="$(LOC="$location" python3 -c 'import os; from urllib.parse import urlparse; print(urlparse(os.environ.get("LOC","")).hostname or "")')"
  echo "attempt ${attempt}: http ${code}, redirect host ${host:-none}"

  if [[ "$host" == "staho.cloudflareaccess.com" ]]; then
    echo "Access login redirect confirmed."
    break
  fi

  if grep -q "Kamil's list" "$body" || grep -q "Sample shopping organizer" "$body"; then
    echo "The hostname returned the shopping app without an Access login redirect."
    exit 1
  fi

  if grep -q "Access is not configured" "$body"; then
    echo "The Worker is answering and Access vars are missing."
    exit 1
  fi

  sleep 10
done

if [[ "${host:-}" != "staho.cloudflareaccess.com" ]]; then
  echo "No redirect to staho.cloudflareaccess.com."
  exit 1
fi

reject() {
  local method="$1"
  local path="$2"
  if [[ "$method" == "GET" ]]; then
    code="$(curl -sS -o "$body" -D "$headers" -X GET -w '%{http_code}' --max-redirs 0 --connect-timeout 10 --max-time 25 "https://shopping-organizer.staho.dev${path}")"
  else
    code="$(curl -sS -o "$body" -D "$headers" -X "$method" -H "content-type: application/json" --data "{}" -w '%{http_code}' --max-redirs 0 --connect-timeout 10 --max-time 25 "https://shopping-organizer.staho.dev${path}")"
  fi
  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ { sub(/\r$/, "", $2); print $2; exit }' "$headers")"
  api_host="$(LOC="$location" python3 -c 'import os; from urllib.parse import urlparse; print(urlparse(os.environ.get("LOC","")).hostname or "")')"
  echo "${method} ${path}: http ${code}, redirect host ${api_host:-none}"
  if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then
    echo "The API accepted a request without credentials."
    exit 1
  fi
  if grep -q "Kamil's list" "$body" || grep -q "Sample shopping organizer" "$body"; then
    echo "The API returned the shopping app without an Access login redirect."
    exit 1
  fi
  if [[ "$api_host" == "staho.cloudflareaccess.com" || "$code" == "401" || "$code" == "403" ]]; then
    return 0
  fi
  echo "The API was not rejected."
  exit 1
}

reject GET /api/data
reject PUT /api/data
reject PUT /api/topics/not-a-topic
reject DELETE /api/topics/not-a-topic
echo "Unauthenticated API requests were rejected."
