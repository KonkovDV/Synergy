"""Write MANIFEST.json for the unpacked package. No third-party dependencies."""
import hashlib
import json
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[1]
skip_dirs = {'.git', '.venv', 'node_modules', 'evidence', '__pycache__'}
skip_names = {'MANIFEST.json', '.DS_Store'}

def included(path: Path) -> bool:
    if path.name in skip_names or path.suffix == '.pyc' or path.suffix == '.sqlite3':
        return False
    return not any(part in skip_dirs for part in path.relative_to(root).parts)

files = []
for path in root.rglob('*'):
    if not path.is_file() or not included(path):
        continue
    data = path.read_bytes()
    files.append({
        'path': path.relative_to(root).as_posix(),
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    })
files.sort(key=lambda item: item['path'])
manifest = {
    'app': 'Synergy',
    'version': '3.1.0',
    'built_date': date.today().isoformat(),
    'purpose': 'standalone preparatory MVP; not certified or contest-approved',
    'files': files,
}
(root / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f"Wrote {len(files)} files, version {manifest['version']}, date {manifest['built_date']}")
