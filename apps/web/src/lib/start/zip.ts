/**
 * A zip read in the browser: a workspace export (a folder of tables and pages) arrives as one, and the first run reads
 * every file inside it without a dependency.
 *
 * THE CENTRAL DIRECTORY FIRST, then each entry at the offset it gives: a file stored as it is (method 0) is sliced out,
 * and a deflated one (method 8) goes through the platform's own `DecompressionStream('deflate-raw')`. Nothing else is
 * read; another method is refused by its name, so the person knows to zip it again with the usual settings.
 *
 * THE LIMITS ARE CHECKED TWICE: against the sizes the directory declares before anything is inflated, and against what
 * inflating actually gives, since a directory can lie. Each refusal is one plain sentence the screen shows as it is.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

/** The whole zip, and everything inside it inflated, at most. */
export const ZIP_BYTES_MOST = 30 * 1024 * 1024;
/** The files read from one zip, at most: folders and the Mac's `__MACOSX` copies are not counted. */
export const ZIP_ENTRIES_MOST = 200;
/** One file inside, inflated, at most: the same ten megabytes a file brought alone may hold. */
export const ZIP_ENTRY_MOST = 10 * 1024 * 1024;

export type ZipEntry = { name: string; bytes: Uint8Array };

const MB = (n: number): string => `${Math.round(n / (1024 * 1024))} MB`;

/** The methods a zip tool may pack with, named as the tool names them; none but 0 and 8 is read. */
const METHODS: Readonly<Record<number, string>> = {
  1: 'shrinking',
  6: 'imploding',
  9: 'Deflate64',
  12: 'bzip2',
  14: 'LZMA',
  93: 'Zstandard',
  95: 'XZ',
  98: 'PPMd',
  99: 'a password (AES)',
};

/** The last part of an entry's name, as a person would know the file: never its folders. */
const baseName = (name: string): string => name.split('/').filter((p) => p !== '').pop() ?? name;

/** Whether an entry is passed over: a folder, or a copy the Mac's Finder writes beside every file it zips. */
const passedOver = (name: string): boolean => name.endsWith('/') || name.startsWith('__MACOSX/') || name.includes('/__MACOSX/') || baseName(name).startsWith('._');

/** The end of the central directory, read backwards over a comment of at most 64 KB. */
function endOfDirectory(view: DataView): number {
  for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 22 - 0xffff); at--) if (view.getUint32(at, true) === 0x06054b50) return at;
  return -1;
}

/** One deflated entry inflated, stopped the moment it passes `most` bytes. `null` when it did. */
async function inflate(data: Uint8Array, most: number): Promise<Uint8Array | null> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > most) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/**
 * EVERY FILE IN A ZIP, by its name inside it and its bytes, or why the zip could not be read, in one sentence. Folders
 * and `__MACOSX` are passed over; a zip of more than 200 files, 30 MB in all or 10 MB in one is refused.
 */
export async function readZip(bytes: Uint8Array): Promise<{ entries: ZipEntry[] } | { why: string }> {
  if (bytes.byteLength > ZIP_BYTES_MOST) return { why: `That zip is ${MB(bytes.byteLength)}, and the most one may be is ${MB(ZIP_BYTES_MOST)}.` };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength >= 22 ? endOfDirectory(view) : -1;
  if (end < 0) return { why: 'That file is not a zip, or it was cut short while it was saved.' };
  const count = view.getUint16(end + 10, true);
  const dirAt = view.getUint32(end + 16, true);
  if (count === 0xffff || dirAt === 0xffffffff) return { why: 'That zip is too large a kind to read here; zip fewer files at once.' };
  const decoder = new TextDecoder();
  const found: { name: string; method: number; at: number; packed: number; size: number }[] = [];
  let p = dirAt;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.byteLength || view.getUint32(p, true) !== 0x02014b50) return { why: 'That zip is damaged: its list of files does not read.' };
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const packed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const skip = nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const at = view.getUint32(p + 42, true);
    p += 46 + skip;
    if (passedOver(name)) continue;
    if ((flags & 1) === 1) return { why: `${baseName(name)} in that zip is locked with a password; zip it again without one.` };
    if (method !== 0 && method !== 8) return { why: `${baseName(name)} in that zip is packed with ${METHODS[method] ?? `method ${method}`}, which cannot be opened here; zip it again with the usual settings.` };
    if (size > ZIP_ENTRY_MOST) return { why: `${baseName(name)} in that zip is ${MB(size)}, and the most one file may be is ${MB(ZIP_ENTRY_MOST)}.` };
    found.push({ name, method, at, packed, size });
    if (found.length > ZIP_ENTRIES_MOST) return { why: `That zip holds more than ${ZIP_ENTRIES_MOST} files; zip the ones you want to bring in.` };
  }
  if (found.reduce((n, f) => n + f.size, 0) > ZIP_BYTES_MOST) return { why: `What that zip holds comes to more than ${MB(ZIP_BYTES_MOST)} once it is opened.` };
  const entries: ZipEntry[] = [];
  let total = 0;
  for (const f of found) {
    if (f.at + 30 > bytes.byteLength || view.getUint32(f.at, true) !== 0x04034b50) return { why: `That zip is damaged where ${baseName(f.name)} should be.` };
    const start = f.at + 30 + view.getUint16(f.at + 26, true) + view.getUint16(f.at + 28, true);
    if (start + f.packed > bytes.byteLength) return { why: `That zip is damaged where ${baseName(f.name)} should be.` };
    const data = bytes.subarray(start, start + f.packed);
    /* WHAT INFLATING GIVES IS HELD TO THE SIZE DECLARED, so a directory that says 1 KB cannot open into a gigabyte. */
    const out = f.method === 0 ? data : await inflate(data, Math.min(f.size, ZIP_ENTRY_MOST)).catch(() => undefined);
    if (out === undefined) return { why: `${baseName(f.name)} in that zip is damaged and does not open.` };
    if (out === null || out.byteLength !== f.size) return { why: `${baseName(f.name)} in that zip does not open to the size the zip says it is.` };
    total += out.byteLength;
    if (total > ZIP_BYTES_MOST) return { why: `What that zip holds comes to more than ${MB(ZIP_BYTES_MOST)} once it is opened.` };
    entries.push({ name: f.name, bytes: out });
  }
  return { entries };
}
