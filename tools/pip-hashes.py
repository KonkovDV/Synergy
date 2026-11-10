"""Write lab/requirements.txt in hash-checking form (5.29).

Each line `name==version` gets the SHA-256 of every file PyPI publishes for that release (all platforms), the form
`pip-compile --generate-hashes` writes. pip then installs in hash-checking mode: a replaced file on the index fails the
install. Standard library only. After changing a version by hand: python3 tools/pip-hashes.py
The list must name every dependency (pip refuses an unlisted one in this mode): that is checked by the CI job «lab».
"""
import json
import pathlib
import re
import urllib.request

HEADER = """# Lab of the jam (CI job «lab»): exact versions, each with the hashes of every file PyPI has for it — pip installs
# in hash-checking mode (OpenSSF Scorecard «Pinned-Dependencies»). Written by tools/pip-hashes.py; change a version on
# its line, then run python3 tools/pip-hashes.py. Every dependency is listed: pip refuses an unlisted one in this mode.
"""

path = pathlib.Path(__file__).resolve().parent.parent / "lab" / "requirements.txt"
pins = re.findall(r"^([A-Za-z0-9_.-]+)==([\w.]+)", path.read_text(encoding="utf-8"), re.M)
out = [HEADER]
for name, version in pins:
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=60) as response:
        files = json.load(response)["urls"]
    hashes = sorted({f["digests"]["sha256"] for f in files})
    if not hashes:
        raise SystemExit(f"{name}=={version}: на PyPI нет файлов")
    out.append(f"{name}=={version} \\\n" + " \\\n".join(f"    --hash=sha256:{h}" for h in hashes) + "\n")
path.write_text("".join(out), encoding="utf-8", newline="\n")
print(f"{path.name}: {len(pins)} пакетов, hash у каждого файла PyPI")
