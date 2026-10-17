"""Verify unpacked package files against MANIFEST.json. No dependencies."""
import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'MANIFEST.json').read_text());errors=[]
for item in m['files']:
    p=root/item['path']
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:errors.append(item['path'])
if errors:print('FAILED: '+', '.join(errors));sys.exit(1)
print(f"PASS: {len(m['files'])} files verified, version {m['version']}")
