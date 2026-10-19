"""Cross-check the API reference in the documentation against the live app.

Fails if the docs mention a path the application does not serve, or if the
application serves a path the docs do not mention.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))
os.environ.setdefault("DATABASE_URL", "sqlite:///./_doccheck.db")

from app.main import app  # noqa: E402

spec = app.openapi()
live_paths = set(spec["paths"].keys())

api_doc = open(os.path.join(ROOT, "docs", "API.md"), encoding="utf-8").read()

# Every path mentioned in the API reference, in the forms the document uses:
#   `POST /auth/login`   (method + path, in a heading)
#   `/rides/{ride_id}/tracking`  (bare path, in prose or a table)
# Trailing slashes matter: the app serves `/categories/`, not `/categories`.
SEG = r"[A-Za-z0-9_\-]+"
PATH_RE = rf"(?:/{SEG}|/\{{{SEG}\}})+/?"


def paths_in(text: str) -> set:
    found = set(re.findall(rf"`(?:GET|POST|PUT|PATCH|DELETE)\s+({PATH_RE})`", text))
    found |= set(re.findall(rf"`({PATH_RE})`", text))
    return found


mentioned = paths_in(api_doc)
if "`GET /`" in api_doc:
    mentioned.add("/")  # the root endpoint
normalised_mentions = {p for p in mentioned if p.count("/") >= 2 or p in live_paths}

# These four paths are documented on purpose: API.md section 8 lists the
# frontend service calls that have no backend route. They are expected to be
# "documented but not served".
KNOWN_UNIMPLEMENTED = {
    "/driver-applications",
    "/driver-applications/me",
    "/admin/categories",
    "/admin/drivers/applications",
}

# A path in the docs is "real" if it matches a live path, possibly with the
# path-parameter placeholders in a different order.
def matches(live: str, mention: str) -> bool:
    lp = live.strip("/").split("/")
    mp = mention.strip("/").split("/")
    if len(lp) != len(mp):
        return False
    for a, b in zip(lp, mp):
        if a.startswith("{") or b.startswith("{"):
            continue
        if a != b:
            return False
    return True


unmatched = [
    m for m in sorted(normalised_mentions)
    if m not in KNOWN_UNIMPLEMENTED and not any(matches(lp, m) for lp in live_paths)
]

# Which live paths are never mentioned in the API reference?
undocumented = [
    lp for lp in sorted(live_paths)
    if not any(matches(lp, m) for m in normalised_mentions)
]

print(f"live paths: {len(live_paths)}")
print(f"paths mentioned in docs/API.md: {len(normalised_mentions)}")
print()
print(f"Documented but NOT served ({len(unmatched)}):")
for u in unmatched:
    print("   ", u)
print()
print(f"Served but NOT documented ({len(undocumented)}):")
for u in undocumented:
    print("   ", u)

os.remove(os.path.join(ROOT, "backend", "_doccheck.db")) if os.path.exists(
    os.path.join(ROOT, "backend", "_doccheck.db")
) else None

sys.exit(1 if unmatched or undocumented else 0)
