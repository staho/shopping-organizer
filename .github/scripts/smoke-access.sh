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
    exit 0
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

echo "No redirect to staho.cloudflareaccess.com."
exit 1
