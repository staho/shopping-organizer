#!/usr/bin/env python3
"""Create or reuse the production KV namespace and prove the token can write.

Exits non-zero before any Worker deploy when Workers KV Storage Edit is missing.
The probe value is the literal "ok"; shopping data is never sent here.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
NAMESPACE = "kamil-shopping-organizer"
PROBE_KEY = "__permission_probe"


def mask(value: str) -> None:
    if value:
        print(f"::add-mask::{value}", flush=True)


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"Missing {name}. The Worker was not deployed.", file=sys.stderr)
        sys.exit(1)
    return value


TOKEN = required("CLOUDFLARE_API_TOKEN")
ACCOUNT = required("CLOUDFLARE_ACCOUNT_ID")
mask(TOKEN)
mask(ACCOUNT)


def redact(text: str) -> str:
    for secret in (TOKEN, ACCOUNT):
        if secret:
            text = text.replace(secret, "[redacted]")
    return text


def fail(message: str) -> None:
    print(redact(message), file=sys.stderr)
    sys.exit(1)


def kv_permission_help() -> str:
    return (
        "The API token is missing Workers KV Storage Edit "
        "(the API reference also calls this Workers KV Storage Write). "
        "Add that permission on the account, then re-run Deploy once. "
        "The Worker was not deployed."
    )


def request(method: str, path: str, body: bytes | None = None, content_type: str | None = None) -> tuple[int, dict | None]:
    req = urllib.request.Request(API + path, data=body, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read()
        status = error.code
    except urllib.error.URLError as error:
        fail(f"Cloudflare API {method} {path} failed: {error.reason}. The Worker was not deployed.")
    if not raw:
        return status, None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        if status == 403:
            print(kv_permission_help(), file=sys.stderr)
            sys.exit(1)
        fail(f"Cloudflare API {method} {path} returned HTTP {status} with a non-JSON body. The Worker was not deployed.")
    if not isinstance(payload, dict):
        fail(f"Cloudflare API {method} {path} returned HTTP {status}. The Worker was not deployed.")
    return status, payload


def write_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        print(f"{name}={value}")
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def namespace_id(payload: dict | None) -> str:
    result = (payload or {}).get("result") or {}
    if isinstance(result, dict):
        return str(result.get("id") or "")
    return ""


def main() -> None:
    status, payload = request("GET", f"/accounts/{ACCOUNT}/storage/kv/namespaces?per_page=100")
    if status == 403:
        print(kv_permission_help(), file=sys.stderr)
        sys.exit(1)
    if status != 200 or not payload or payload.get("success") is False:
        fail(f"Listing KV namespaces returned HTTP {status}. The Worker was not deployed.")
    result = payload.get("result") or []
    if not isinstance(result, list):
        fail("KV namespace list was not a list. The Worker was not deployed.")
    found = [item for item in result if isinstance(item, dict) and item.get("title") == NAMESPACE]
    if len(found) > 1:
        fail(f"More than one KV namespace is titled {NAMESPACE}. The Worker was not deployed.")
    created = False
    if found:
        ns_id = str(found[0].get("id") or "")
        print(f"Found KV namespace {NAMESPACE}")
    else:
        status, payload = request(
            "POST",
            f"/accounts/{ACCOUNT}/storage/kv/namespaces",
            json.dumps({"title": NAMESPACE}).encode(),
            "application/json",
        )
        if status == 403:
            print(kv_permission_help(), file=sys.stderr)
            sys.exit(1)
        ns_id = namespace_id(payload)
        if status != 200 or not ns_id:
            fail(f"Creating KV namespace {NAMESPACE} returned HTTP {status}. The Worker was not deployed.")
        created = True
        print(f"Created KV namespace {NAMESPACE}")
    if not ns_id:
        fail("KV namespace has no id. The Worker was not deployed.")

    probe = request(
        "PUT",
        f"/accounts/{ACCOUNT}/storage/kv/namespaces/{ns_id}/values/{PROBE_KEY}",
        b"ok",
        "text/plain",
    )
    if probe[0] == 403:
        print(kv_permission_help(), file=sys.stderr)
        sys.exit(1)
    if probe[0] not in {200, 204}:
        fail(f"KV write probe returned HTTP {probe[0]}. The Worker was not deployed.")
    removed = request("DELETE", f"/accounts/{ACCOUNT}/storage/kv/namespaces/{ns_id}/values/{PROBE_KEY}")
    if removed[0] not in {200, 204, 404}:
        print(f"NOTICE: KV write probe key could not be deleted (HTTP {removed[0]}).")
    write_output("kv_id", ns_id)
    write_output("kv_created", "true" if created else "false")
    print(f"KV namespace ready, created={str(created).lower()}")


if __name__ == "__main__":
    main()
