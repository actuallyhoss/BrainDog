/**
 * No tracked text file carries a raw C0 control byte: NUL and its fifteen neighbours, everything
 * below 0x20 that is not tab, newline or carriage return, plus DEL.
 *
 *   node tools/gates/nul-bytes.mjs
 *
 * THIS EXISTS BECAUSE A NUL BYTE IS INVISIBLE TO EVERY OTHER GATE. `apps/web/src/lib/design/nav-shape.ts`
 * held one inside a string literal (the source read `sections.add('\0lists')` where the author
 * meant `sections.add('lists')`), and typecheck passed, every test passed, and the value was
 * silently wrong for as long as nobody happened to print it. `apps/cli/src/brief.ts` held a second
 * one, embedded raw inside a regex character class where `\x00` was meant. Neither is a shape any
 * grep gate here was built to see, because both are syntactically valid TypeScript; the defect is
 * in the byte, not in the code around it.
 *
 * AND GIT ITSELF STOPS SEEING THE FILE. A NUL byte is git's own heuristic for "this is binary", so
 * a source file that picks one up silently stops diffing and stops merging. The tool that is
 * supposed to show every other change in the file goes quiet about this one.
 *
 * AND NUL WAS NEVER THE ONLY ONE. This gate scanned for 0x00 alone for months, and the paragraph
 * above describes the general defect precisely without noticing that it is general: a byte written
 * raw where an escape was meant. The escape does not have to be the NUL one for that to happen,
 * and eight more had already landed.
 *
 * THREE WERE A WORD-BOUNDARY ESCAPE THAT LOST ITS BACKSLASH and left a literal BACKSPACE behind.
 * A set of working instructions named a scratch directory under TEMP that no shell would resolve; a
 * research note named the repository it was about with two separators missing; and, with a straight
 * face, a comment in `clean-room.mjs` explaining what a regex word boundary does had eaten the
 * boundary. All three read correctly to a human eye, which is the whole of the problem.
 *
 * FIVE WERE DELIBERATE AND STILL WRONG TO WRITE RAW: a UNIT SEPARATOR keying a hash in `actions.ts`
 * and `pull.ts`, and six occurrences in `vault.test.ts` asserting on what that hash is built from.
 * Correct behaviour, in a byte no reader can see and no careless copy survives. They are escapes
 * now and the behaviour is identical, which is exactly why there was never a reason to write them
 * raw.
 *
 * So the rule is every C0 control except the three that are real whitespace, and DEL with them.
 *
 * SO THIS IS A RAW BYTE SCAN, not a parse. It reads every tracked-looking file as bytes, skips the
 * ones that are genuinely binary by extension, and is red on the first NUL in anything left,
 * naming the file, the byte offset, and the text around it so the reader can tell at a glance
 * whether it sits inside a string literal (as both real findings did) or is some other kind of
 * corruption.
 */

import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/**
 * TAB, NEWLINE AND CARRIAGE RETURN ARE THE ONLY CONTROLS A SOURCE FILE HAS ANY BUSINESS HOLDING.
 * Vertical tab and form feed are not exceptions: they are legal whitespace to a compiler and
 * invisible to a reader, which is the whole of what makes this class of defect expensive.
 */
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);
const forbidden = (byte) => (byte < 0x20 && !ALLOWED.has(byte)) || byte === 0x7f;

/** What to call the byte in the finding, so the reader is not left converting hex in their head. */
const NAMES = {
  0x00: 'NUL', 0x07: 'BEL', 0x08: 'BACKSPACE', 0x0b: 'VERTICAL TAB', 0x0c: 'FORM FEED',
  0x1b: 'ESCAPE', 0x1f: 'UNIT SEPARATOR', 0x7f: 'DEL',
};
const nameOf = (byte) => NAMES[byte] ?? `control byte 0x${byte.toString(16).padStart(2, '0')}`;

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
    /* A LINK IS NOT THIS TREE'S FILE: followed, one that holds a link to itself threw ELOOP and read nothing at all. */
    const here = lstatSync(full);
    if (here.isSymbolicLink()) continue;
    if (here.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * The text around a NUL, decoded byte-for-byte rather than as UTF-8, so a byte offset that lands
 * mid-character never throws. Other control bytes in the window are made visible too (a run of
 * them is exactly what surrounds a NUL that was meant to be `\x00`), and the NUL itself is marked
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

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import, and everything
 * above this line is a declaration.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is the handle `self-test` aims
 * this gate at its seeded fixture with, and then to the repository this file sits in. `run.mjs`
 * passes the root it derived from its own location, because an imported gate shares the runner's
 * working directory and that is wherever the operator was standing.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default function nulBytes(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const findings = [];
  let scanned = 0;

  for (const file of walk(root)) {
    const ext = extname(file).slice(1).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;

    scanned++;
    const buf = readFileSync(file);
    const rel = relative(root, file).replace(/\\/g, '/');

    /* EVERY OCCURRENCE, NOT THE FIRST. A file with two stray control bytes reported as having one
       would cost a second run to find the other, which is the same argument `stack.mjs` makes for
       itself. Three of the five real findings were in one class and two files, so a gate that
       stopped at the first would have taken three runs to say what one said. */
    for (let at = 0; at < buf.length; at++) {
      if (!forbidden(buf[at])) continue;
      findings.push({
        where: `${rel}:${lineOf(buf, at)}`,
        offset: at,
        what: nameOf(buf[at]),
        excerpt: excerptAround(buf, at),
      });
    }
  }

  if (findings.length) {
    console.log('');
    for (const f of findings)
      console.log(`  ${f.where}  a raw ${f.what} at offset ${f.offset}\n      …${f.excerpt}…\n`);
  }
  console.log(`  nul-bytes: ${scanned} file(s), ${findings.length} finding(s)`);
  if (findings.length) return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded fixture with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = nulBytes() ?? 0;
