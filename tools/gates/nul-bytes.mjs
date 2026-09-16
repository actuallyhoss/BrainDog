/**
 * No tracked text file carries a raw NUL byte (0x00).
 *
 *   node tools/gates/nul-bytes.mjs
 *
 * THIS EXISTS BECAUSE A NUL BYTE IS INVISIBLE TO EVERY OTHER GATE. `apps/web/src/lib/design/nav-shape.ts`
 * held one inside a string literal — the source read `sections.add('\0lists')` where the author
 * meant `sections.add('lists')` — and typecheck passed, every test passed, and the value was
 * silently wrong for as long as nobody happened to print it. `apps/cli/src/brief.ts` held a second
 * one, embedded raw inside a regex character class where `\x00` was meant. Neither is a shape any
 * grep gate here was built to see, because both are syntactically valid TypeScript; the defect is
 * in the byte, not in the code around it.
 *
 * AND GIT ITSELF STOPS SEEING THE FILE. A NUL byte is git's own heuristic for "this is binary", so
 * a source file that picks one up silently stops diffing and stops merging — the tool that is
 * supposed to show every other change in the file goes quiet about this one.
 *
 * SO THIS IS A RAW BYTE SCAN, not a parse. It reads every tracked-looking file as bytes, skips the
 * ones that are genuinely binary by extension, and is red on the first NUL in anything left —
 * naming the file, the byte offset, and the text around it so the reader can tell at a glance
 * whether it sits inside a string literal (as both real findings did) or is some other kind of
 * corruption.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/**
 * Extensions that are binary by construction, so a NUL inside one is the format and not a defect.
 * `skipDir` already keeps this gate out of `node_modules`, `build`, `dist` and every dotted tooling
 * directory; this is the file-level half of the same idea, for a binary asset that lives beside
 * source rather than inside a built directory.
 */
const BINARY_EXT = new Set([
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tiff', 'tif', 'heic', 'psd',
  // fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // audio / video
  'mp4', 'mp3', 'wav', 'ogg', 'flac', 'mov', 'mkv', 'webm', 'avi', 'm4a',
  // archives / packages
  'zip', 'gz', 'tgz', 'bz2', '7z', 'rar', 'tar', 'jar', 'deb', 'rpm', 'dmg', 'iso',
  // documents
  'pdf',
  // compiled / native
  'wasm', 'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'pyc', 'node',
  // databases and other opaque blobs that legitimately carry NUL as part of their format
  'db', 'sqlite', 'sqlite3',
]);

/**
 * `negative` IS THE GATES' OWN SEEDED VIOLATIONS. `self-test.mjs` aims this gate at its own fixture
 * directory directly; an ordinary run over the repository root must not also walk into every other
 * gate's fixtures and report the ones that seed something else entirely. Named the same way
 * `colour-grep`'s `SKIP` set names it, for the same reason.
 */
const SKIP = new Set(['negative']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name) || SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * The text around a NUL, decoded byte-for-byte rather than as UTF-8, so a byte offset that lands
 * mid-character never throws. Other control bytes in the window are made visible too — a run of
 * them is exactly what surrounds a NUL that was meant to be `\x00` — and the NUL itself is marked
 * so it is not just a gap in the printed line.
 */
function excerptAround(buf, offset, radius = 30) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(buf.length, offset + radius);
  return buf
    .slice(start, end)
    .toString('latin1')
    .replace(/\x00/g, '␀')
    .replace(/[\x01-\x09\x0b-\x1f\x7f]/g, '·')
    .replace(/\n/g, '⏎');
}

const lineOf = (buf, offset) => buf.slice(0, offset).toString('latin1').split('\n').length;

const findings = [];
let scanned = 0;

for (const file of walk(root)) {
  const ext = extname(file).slice(1).toLowerCase();
  if (BINARY_EXT.has(ext)) continue;

  scanned++;
  const buf = readFileSync(file);
  const rel = relative(root, file).replace(/\\/g, '/');

  /* EVERY OCCURRENCE, NOT THE FIRST. A file with two stray NUL bytes reported as having one would
     cost a second run to find the other, which is the same argument `stack.mjs` makes for itself. */
  let at = buf.indexOf(0);
  while (at !== -1) {
    findings.push({
      where: `${rel}:${lineOf(buf, at)}`,
      offset: at,
      excerpt: excerptAround(buf, at),
    });
    at = buf.indexOf(0, at + 1);
  }
}

if (findings.length) {
  console.log('');
  for (const f of findings) console.log(`  ${f.where}  a NUL byte at offset ${f.offset}\n      …${f.excerpt}…\n`);
}
console.log(`  nul-bytes: ${scanned} file(s), ${findings.length} finding(s)`);
if (findings.length) process.exitCode = 1;
