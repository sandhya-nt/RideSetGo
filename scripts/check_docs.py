"""Validate the structure of the generated Markdown documentation."""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FENCE = "`" * 3

files = ["README.md"] + sorted(glob.glob("docs/*.md"))
issues = []

print(f"{'file':28} {'lines':>6} {'endsNL':>7} {'mermaid':>8} {'fences':>7} {'bal':>6} {'h2':>4} {'tbl':>4}")
for rel in files:
    path = os.path.join(ROOT, rel)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    fences = text.count(FENCE)
    mermaid = text.count(FENCE + "mermaid")
    h2 = len(re.findall(r"^## ", text, re.M))
    tables = len(re.findall(r"^\|.*\|$", text, re.M))
    balanced = fences % 2 == 0
    ends_nl = text.endswith("\n")
    if not balanced:
        issues.append(f"{rel}: unbalanced code fences ({fences})")
    if not ends_nl:
        issues.append(f"{rel}: no trailing newline")
    if "�" in text:
        issues.append(f"{rel}: contains U+FFFD replacement characters")
    for bad in ("â€", "Ã©", "Ã¢"):
        if bad in text:
            issues.append(f"{rel}: possible mojibake sequence {bad!r}")
    print(f"{rel:28} {text.count(chr(10)):6} {str(ends_nl):>7} {mermaid:8} {fences:7} {str(balanced):>6} {h2:4} {tables:4}")

print()
print("ISSUES:", *(issues or ["none"]), sep="\n  ")
sys.exit(1 if issues else 0)
