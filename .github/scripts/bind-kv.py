#!/usr/bin/env python3
"""Replace the production KV placeholder in wrangler.jsonc on the runner."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

PLACEHOLDER = "REPLACE_WITH_KV_NAMESPACE_ID"
kv_id = os.environ.get("KV_ID", "").strip()
if not re.fullmatch(r"[A-Fa-f0-9]{32}", kv_id):
    print("KV namespace id is missing or not 32 hex characters. The Worker was not deployed.", file=sys.stderr)
    sys.exit(1)

path = Path("wrangler.jsonc")
text = path.read_text(encoding="utf-8")
if text.count(PLACEHOLDER) != 1:
    print("wrangler.jsonc must contain the production KV placeholder once. The Worker was not deployed.", file=sys.stderr)
    sys.exit(1)
path.write_text(text.replace(PLACEHOLDER, kv_id, 1), encoding="utf-8")
print("Bound SHOPPING on the production Worker.")
