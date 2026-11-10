// Who signed an APK (5.10, Red Team C-1): reads the signature block (META-INF/*.RSA|DSA|EC) of the APK's zip
// without unzip (Windows has none) and reports whether it is the throwaway debug key of tools/build-apk.sh.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Bytes of the first zip entry whose name matches `pattern`, or null. */
export function zipEntry(buf, pattern) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0, n = buf.readUInt16LE(eocd + 10); i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (pattern.test(name)) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

/** { signed, debug } for an APK file: debug = signed with the local «Synergy Debug» key. */
export function apkSigner(path) {
  const block = zipEntry(readFileSync(path), /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i);
  return { signed: !!block, debug: !!block && block.includes(Buffer.from('Synergy Debug')) };
}
