#!/usr/bin/env python3
"""Ensure the production hostname has a Cloudflare Access application.

Fails closed: any API error exits non-zero before the workflow deploys.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
HOST = "shopping-organizer.staho.dev"
APP_NAME = "Shopping organizer"
POLICY_NAME = "Allow me"
SERVICE_NAME = "Zakupoholik"
SERVICE_POLICY = "Zakupoholik write"
SESSION = "24h"


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
EMAIL = required("ACCESS_ALLOWED_EMAIL")
mask(TOKEN)
mask(ACCOUNT)
mask(EMAIL)

if "@" not in EMAIL or any(ch.isspace() for ch in EMAIL):
    print("ACCESS_ALLOWED_EMAIL is not a single email address. The Worker was not deployed.", file=sys.stderr)
    sys.exit(1)


def redact(text: str) -> str:
    for secret in (TOKEN, ACCOUNT, EMAIL):
        if secret:
            text = text.replace(secret, "[redacted]")
    text = re.sub(r'"(client_secret|client_id)"\s*:\s*"[^"]*"', r'"\1":"[redacted]"', text)
    return text


def fail(message: str) -> None:
    print(redact(message), file=sys.stderr)
    sys.exit(1)


def api(method: str, path: str, body: dict | None = None, soft_statuses: frozenset[int] = frozenset()) -> dict | None:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header("Authorization", f"Bearer {TOKEN}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            payload = json.loads(raw) if raw else {"success": True, "result": None}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        if error.code in soft_statuses:
            return None
        hint = ""
        if error.code == 403:
            hint = " The token needs Access: Apps and Policies Edit on this account."
        fail(
            f"Cloudflare API {method} {path} returned HTTP {error.code}.{hint} "
            f"The Worker was not deployed.\n{raw[:4000]}"
        )
    except urllib.error.URLError as error:
        fail(f"Cloudflare API {method} {path} failed: {error.reason}. The Worker was not deployed.")
    if not isinstance(payload, dict) or payload.get("success") is False:
        errors = payload.get("errors") if isinstance(payload, dict) else payload
        fail(f"Cloudflare API {method} {path} failed. The Worker was not deployed.\n{errors}")
    return payload


def list_all(path: str) -> list:
    separator = "&" if "?" in path else "?"
    payload = api("GET", f"{path}{separator}page=1&per_page=100")
    if not payload:
        fail(f"Cloudflare API GET {path} returned no body. The Worker was not deployed.")
    result = payload.get("result") or []
    if not isinstance(result, list):
        fail(f"Cloudflare API GET {path} did not return a list. The Worker was not deployed.")
    items = list(result)
    info = payload.get("result_info") or {}
    total_count = int(info.get("total_count") or len(items))
    per_page = int(info.get("per_page") or 100)
    page = 1
    while len(items) < total_count and page < 20:
        page += 1
        payload = api("GET", f"{path}{separator}page={page}&per_page={per_page}")
        page_items = payload.get("result") or []
        if not isinstance(page_items, list) or not page_items:
            break
        items.extend(page_items)
    return items


def host_of(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.split("://")[-1].split("/")[0].lower().rstrip(".")


def app_matches(app: dict) -> bool:
    if host_of(app.get("domain")) == HOST:
        return True
    for destination in app.get("destinations") or []:
        if not isinstance(destination, dict):
            continue
        if host_of(destination.get("uri") or destination.get("hostname")) == HOST:
            return True
    for domain in app.get("self_hosted_domains") or []:
        if isinstance(domain, str) and host_of(domain) == HOST:
            return True
        if isinstance(domain, dict) and host_of(domain.get("domain") or domain.get("uri")) == HOST:
            return True
    return False


def rule_email(rule: dict) -> str:
    email = rule.get("email")
    if isinstance(email, str):
        return email.strip()
    if isinstance(email, dict):
        value = email.get("email")
        return value.strip() if isinstance(value, str) else ""
    return ""


def login_methods(policy: dict) -> list[str]:
    methods = []
    for rule in policy.get("require") or []:
        if not isinstance(rule, dict):
            continue
        login = rule.get("login_method")
        if isinstance(login, dict) and isinstance(login.get("id"), str):
            methods.append(login["id"])
    return methods


def policy_matches(policy: dict, otp_id: str | None) -> bool:
    if policy.get("decision") != "allow":
        return False
    include = policy.get("include") or []
    if len(include) != 1 or not isinstance(include[0], dict):
        return False
    if rule_email(include[0]) != EMAIL:
        return False
    methods = login_methods(policy)
    if otp_id:
        return methods == [otp_id]
    return methods == []


def desired_policy(otp_id: str | None) -> dict:
    policy = {
        "name": POLICY_NAME,
        "decision": "allow",
        "precedence": 1,
        "include": [{"email": {"email": EMAIL}}],
    }
    if otp_id:
        policy["require"] = [{"login_method": {"id": otp_id}}]
    return policy


def provider_type(item: dict) -> str:
    for key, value in item.items():
        if str(key).lower() == "type" and isinstance(value, str):
            return value.strip()
    return ""


def provider_id(item: dict) -> str:
    for key in ("id", "uid"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def is_otp(item: dict) -> bool:
    kind = "".join(ch for ch in provider_type(item).lower() if ch.isalnum())
    if kind in {"onetimepin", "otp"}:
        return True
    name = ""
    for key, value in item.items():
        if str(key).lower() == "name" and isinstance(value, str):
            name = value
    compact = "".join(ch for ch in name.lower() if ch.isalnum())
    return compact in {"onetimepin", "onetimepinlogin", "otp"}


def ensure_otp() -> str | None:
    """Return the One-time PIN provider id when the list shows one.

    This token cannot create identity providers. A missing or forbidden list
    leaves allowed_idps unset so the app accepts every provider on the account.
    """
    path = f"/accounts/{ACCOUNT}/access/identity_providers"
    probe = api("GET", f"{path}?page=1&per_page=100", soft_statuses=frozenset({403}))
    if probe is None:
        print(
            "NOTICE: Identity provider list returned HTTP 403. "
            "allowed_idps will be omitted so the application allows every identity provider on the account."
        )
        return None
    providers = list_all(path)
    types = sorted({provider_type(item) or "(no type)" for item in providers})
    print(f"Identity providers visible: count={len(providers)} types={', '.join(types) or 'none'}")
    matches = [item for item in providers if is_otp(item)]
    if not matches:
        print(
            "NOTICE: No onetimepin provider is visible to this token. "
            "allowed_idps will be omitted so the application allows every identity provider on the account."
        )
        return None
    otp_id = provider_id(matches[0])
    if not otp_id:
        print(
            "NOTICE: The One-time PIN provider had no id. "
            "allowed_idps will be omitted so the application allows every identity provider on the account."
        )
        return None
    print(f"Using existing One-time PIN identity provider {otp_id}")
    return otp_id


def app_body(name: str, otp_id: str | None) -> dict:
    body = {
        "name": name,
        "type": "self_hosted",
        "domain": HOST,
        "session_duration": SESSION,
        "app_launcher_visible": False,
        "destinations": [{"type": "public", "uri": HOST}],
    }
    if otp_id:
        body["auto_redirect_to_identity"] = True
        body["allowed_idps"] = [otp_id]
    return body


def session_ok(app: dict) -> bool:
    return str(app.get("session_duration") or "") in {"24h", "24h0m0s", "1440m"}


def ensure_app(otp_id: str | None) -> tuple[dict, bool]:
    apps = list_all(f"/accounts/{ACCOUNT}/access/apps")
    found = [app for app in apps if app_matches(app)]
    if len(found) > 1:
        ids = ", ".join(str(app.get("id")) for app in found)
        fail(f"More than one Access application matches {HOST}: {ids}. The Worker was not deployed.")
    if not found:
        created = api(
            "POST",
            f"/accounts/{ACCOUNT}/access/apps",
            {**app_body(APP_NAME, otp_id), "policies": [desired_policy(otp_id)]},
        )
        app = created.get("result") or {}
        if not app.get("id"):
            fail("Creating the Access application returned no id. The Worker was not deployed.")
        print(f"Created Access application {app.get('name')} ({app.get('id')})")
        return app, True

    app_id = str(found[0].get("id") or "")
    current = api("GET", f"/accounts/{ACCOUNT}/access/apps/{app_id}").get("result") or found[0]
    name = str(current.get("name") or APP_NAME)
    allowed = current.get("allowed_idps") or []
    idp_ok = True if not otp_id else allowed == [otp_id] and current.get("auto_redirect_to_identity") is True
    needs_update = not session_ok(current) or not idp_ok or host_of(current.get("domain")) != HOST
    if needs_update:
        updated = api("PUT", f"/accounts/{ACCOUNT}/access/apps/{app_id}", app_body(name, otp_id))
        current = updated.get("result") or current
        print(f"Updated Access application {name} ({app_id})")
    else:
        print(f"Found Access application {name} ({app_id})")
    return current, False


def policy_id(policy: dict) -> str:
    return str(policy.get("id") or policy.get("uid") or "")


def service_policy_body(token_id: str) -> dict:
    return {
        "name": SERVICE_POLICY,
        "decision": "non_identity",
        "precedence": 2,
        "include": [{"service_token": {"token_id": token_id}}],
    }


def service_policy_matches(policy: dict, token_id: str) -> bool:
    if policy.get("name") != SERVICE_POLICY or policy.get("decision") != "non_identity":
        return False
    include = policy.get("include") or []
    if len(include) != 1 or not isinstance(include[0], dict):
        return False
    token = include[0].get("service_token")
    if isinstance(token, dict):
        return token.get("token_id") == token_id
    return token == token_id


def create_service_token() -> dict | None:
    path = f"/accounts/{ACCOUNT}/access/service_tokens"
    payload_bytes = json.dumps({"name": SERVICE_NAME, "duration": "8760h"}).encode()
    request = urllib.request.Request(API + path, data=payload_bytes, method="POST")
    request.add_header("Authorization", f"Bearer {TOKEN}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        if error.code == 403:
            error.read()
            print(
                "NOTICE: Creating an Access service token returned HTTP 403. "
                "Add the API token permission Access: Service Tokens Edit "
                "(the API reference also calls this Access: Service Tokens Write). "
                "No Service Auth policy was changed. Browser login is unchanged."
            )
            write_output("service_tokens", "forbidden")
            return None
        detail = redact(error.read().decode("utf-8", "replace")[:500])
        fail(f"Creating the service token returned HTTP {error.code}. The Worker was not deployed.\n{detail}")
    except urllib.error.URLError as error:
        fail(f"Creating the service token failed: {error.reason}. The Worker was not deployed.")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        fail("Creating the service token returned a non-JSON body. The Worker was not deployed.")
    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, dict):
        fail("Creating the service token returned no result. The Worker was not deployed.")
    # The client secret is shown only once. Never print it, and do not keep it on the object.
    result.pop("client_secret", None)
    result.pop("client_id", None)
    print(
        "Created service token Zakupoholik. Its client secret is not stored and is not in the logs. "
        "Roll that token in Zero Trust to copy a new client id and client secret for the bot."
    )
    return result


def ensure_service_token() -> str | None:
    path = f"/accounts/{ACCOUNT}/access/service_tokens"
    probe = api("GET", f"{path}?page=1&per_page=100", soft_statuses=frozenset({403}))
    if probe is None:
        print(
            "NOTICE: The Access service token list returned HTTP 403. "
            "Add the API token permission Access: Service Tokens Edit "
            "(the API reference also calls this Access: Service Tokens Write). "
            "No Service Auth policy was changed. Browser login is unchanged."
        )
        write_output("service_tokens", "forbidden")
        return None
    tokens = list_all(path)
    print(f"Service tokens visible: count={len(tokens)}")
    match = next((item for item in tokens if str(item.get("name") or "") == SERVICE_NAME), None)
    created_now = False
    if match is None:
        match = create_service_token()
        if match is None:
            return None
        created_now = True
    token_id = str(match.get("id") or "")
    if not token_id:
        print("NOTICE: The Zakupoholik service token had no id. No Service Auth policy was changed.")
        return None
    write_output("service_tokens", "created" if created_now else "reused")
    print(f"Using service token {SERVICE_NAME}, created={str(created_now).lower()}")
    return token_id


def ensure_service_policy(app_id: str, policies: list, token_id: str) -> str:
    good = [policy for policy in policies if service_policy_matches(policy, token_id)]
    body = service_policy_body(token_id)
    if good:
        keep = policy_id(good[0])
        print(f"Found Service Auth policy {SERVICE_POLICY}")
        return keep
    existing = next((policy for policy in policies if policy.get("name") == SERVICE_POLICY), None)
    if existing and policy_id(existing):
        updated = api(
            "PUT",
            f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies/{policy_id(existing)}",
            body,
        )
        print(f"Updated Service Auth policy {SERVICE_POLICY}")
        return policy_id(updated.get("result") or {}) or policy_id(existing)
    created = api("POST", f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies", body)
    keep = policy_id(created.get("result") or {})
    if not keep:
        fail("Creating the Service Auth policy returned no id. The Worker was not deployed.")
    print(f"Created Service Auth policy {SERVICE_POLICY}")
    return keep


def ensure_policy(app_id: str, otp_id: str | None, service_token_id: str | None = None) -> None:
    policies = list_all(f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies")
    allow_policies = [policy for policy in policies if policy.get("decision") != "non_identity"]
    good = [policy for policy in allow_policies if policy_matches(policy, otp_id)]
    if good:
        keep = policy_id(good[0])
    elif allow_policies:
        first = policy_id(allow_policies[0])
        if not first:
            fail("Access policy has no id. The Worker was not deployed.")
        updated = api(
            "PUT",
            f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies/{first}",
            desired_policy(otp_id),
        )
        keep = policy_id(updated.get("result") or {}) or first
        print(f"Updated Access policy {keep}")
    else:
        created = api(
            "POST",
            f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies",
            desired_policy(otp_id),
        )
        keep = policy_id(created.get("result") or {})
        if not keep:
            fail("Creating the Access policy returned no id. The Worker was not deployed.")
        print(f"Created Access policy {keep}")

    keep_ids = {keep}
    if service_token_id:
        service_keep = ensure_service_policy(app_id, policies, service_token_id)
        if service_keep:
            keep_ids.add(service_keep)

    for policy in policies:
        current = policy_id(policy)
        if not current or current in keep_ids:
            continue
        if policy.get("decision") == "non_identity":
            print("Left an existing non-identity Access policy in place.")
            continue
        api("DELETE", f"/accounts/{ACCOUNT}/access/apps/{app_id}/policies/{current}")
        print(f"Removed extra Access policy {current}")


def write_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def main() -> None:
    otp_id = ensure_otp()
    app, created = ensure_app(otp_id)
    app_id = str(app.get("id") or "")
    if not app_id:
        fail("Access application has no id. The Worker was not deployed.")
    service_token_id = ensure_service_token()
    ensure_policy(app_id, otp_id, service_token_id)
    fresh = api("GET", f"/accounts/{ACCOUNT}/access/apps/{app_id}").get("result") or app
    aud = str(fresh.get("aud") or "").strip()
    if not aud:
        fail("Access application has no audience tag. The Worker was not deployed.")
    mask(aud)
    name = str(fresh.get("name") or APP_NAME)
    write_output("aud", aud)
    write_output("app_id", app_id)
    write_output("app_name", name)
    write_output("created", "true" if created else "false")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            state = "Created" if created else "Found"
            handle.write(f"{state} Access application **{name}** (`{app_id}`).\n")
    print(f"Access application ready: {name} ({app_id}), created={str(created).lower()}")


if __name__ == "__main__":
    main()
