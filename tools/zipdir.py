"""Zips a directory like `zip -9 -qr out.zip DIR` where there is no zip (Git Bash on Windows, 5.16).

Keeps empty directories (git needs refs/ after gc) and the executable bit of files git records as 100755 — Windows
has no such bit, so it is taken from the index of the repository inside DIR.
Usage: python tools/zipdir.py OUT.zip PARENT DIR
"""
import os
import subprocess
import sys
import zipfile

out, parent, name = sys.argv[1:4]
top = os.path.join(parent, name)
executable = set()
try:
    staged = subprocess.run(["git", "-C", top, "ls-files", "-s"], capture_output=True, text=True, check=True).stdout
    executable = {line.split("\t", 1)[1] for line in staged.splitlines() if line.startswith("100755")}
except (OSError, subprocess.CalledProcessError):
    pass
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(top):
        rel = os.path.relpath(root, parent).replace(os.sep, "/")
        if not dirs and not files:
            info = zipfile.ZipInfo(rel + "/")
            info.external_attr = (0o40755 << 16) | 0x10
            z.writestr(info, b"")
        for f in files:
            path = os.path.join(root, f)
            arc = f"{rel}/{f}"
            inner = os.path.relpath(path, top).replace(os.sep, "/")
            info = zipfile.ZipInfo.from_file(path, arc)
            info.external_attr = ((0o100755 if inner in executable else 0o100644) << 16)
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as fh:
                z.writestr(info, fh.read(), compresslevel=9)
print(f"{out}: {os.path.getsize(out) // 1024} KB")
