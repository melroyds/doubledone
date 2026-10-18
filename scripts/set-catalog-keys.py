"""Set (add or replace) and remove keys inside one top-level namespace of the app catalogues, keeping that
namespace's keys in alphabetical order, as the catalogues keep them.

  python scripts/set-catalog-keys.py <json file>

The JSON is {"namespace": "landing", "remove": [keys...], "values": {"en": {key: value}, "de": {...}, ...}}.
Values are written as TypeScript string literals (single quotes, or double when the text holds an apostrophe),
so French no-break spaces and curly quotes pass through untouched. Never edit catalogues through a shell heredoc:
this script reads the JSON as UTF-8 and writes UTF-8 bytes."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
ns = spec["namespace"]
remove = set(spec.get("remove", []))


def literal(v: str) -> str:
    if "'" in v and '"' not in v:
        return '"' + v.replace("\\", "\\\\") + '"'
    return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"


for loc, values in spec["values"].items():
    path = ROOT / "client" / "src" / "lib" / "catalogs" / f"{loc}.ts"
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"^  {re.escape(ns)}: \{{\n(.*?)^  \}},\n", text, re.S | re.M)
    if not m:
        sys.exit(f"{loc}: namespace {ns} not found")
    block = m.group(1)
    # One entry per line, `    key: <literal>,` (the namespace is flat; multi-line values are not used here).
    entries = {}
    order = []
    for line in block.splitlines():
        km = re.match(r"^    ([A-Za-z0-9_]+): (.*),$", line)
        if not km:
            sys.exit(f"{loc}: cannot parse line in {ns}: {line!r}")
        entries[km.group(1)] = km.group(2)
        order.append(km.group(1))
    for k in remove:
        entries.pop(k, None)
    for k, v in values.items():
        if "\n" in v:
            sys.exit(f"{loc}.{k}: newline in value")
        entries[k] = literal(v)
    new_block = "".join(f"    {k}: {entries[k]},\n" for k in sorted(entries, key=str.lower))
    text = text[: m.start(1)] + new_block + text[m.end(1) :]
    path.write_bytes(text.encode("utf-8"))
    print(f"{loc}: {len(values)} set, {len(remove)} removed, {len(entries)} keys in {ns}")
