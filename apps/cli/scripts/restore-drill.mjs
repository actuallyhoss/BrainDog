#!/usr/bin/env node
/**
 * The restore drill: a sealed nightly copy of a Cloud record, opened, verified, restored and counted.
 *
 *   node apps/cli/scripts/restore-drill.mjs latest.brainl.age --identity <age identity file> [--key <pubkey|url>]
 *   node apps/cli/scripts/restore-drill.mjs --record <rec_id> [--record <rec_id>] [--directory] --identity-cmd "<command>"
 *                                           [--bucket <name>] [--report <origin>] [--no-round-trip]
 *   node apps/cli/scripts/restore-drill.mjs --print-timer --record <rec_id> --directory --identity-cmd "<command>" ...
 *
 * FETCHED AS THE OPERATOR. The Worker never serves a copy as a file (`apps/worker/src/route.ts`
 * `copyAsked`), and only the operator holds the key that opens one, so `--record` and `--directory` fetch the night's
 * sealed object with `wrangler r2 object get --remote`, signed in as the operator wrangler already is, into a folder
 * under the OS temp directory that goes when the drill ends. `--record` is repeatable, and the run is PASS only when
 * every copy is. `--directory` fetches the Directory's copy (`apps/worker/src/directory-copy.ts`, `latest.dirl.age`),
 * loads it into an empty Directory in memory and asks, for every open record it lists, whether its owner can sign in.
 * `--identity-cmd` reads the identity from a command's output, the rehearsal's rule (`migration-rehearsal.mjs`), so the
 * key stays in the keychain or the password manager. After the count, each restored record goes round
 * (`drill-trip.mjs` `roundTrip`). `--report <origin>` posts the counts to the operator door `/account/ops/drill` with
 * `PROVISION_KEY` from the environment. `--print-timer` prints a monthly launchd file for the same arguments and
 * installs nothing.
 *
 * WHY IT EXISTS. Until this, the only code that had ever opened one of the Cloud's copies was a test's decryptor, and the
 * only restore of one was a probe in a scratch clone. A backup nobody has put back
 * is a hope, and `53 §5.4`'s drill could not be run as written: `age` is not on this machine, `init` then `import` is
 * `IMPORT_NOT_EMPTY`, and `shred` is not on Windows (measured). This runs all of it with Node alone.
 *
 * WHAT IT DOES, IN ORDER, and it stops at the first step that fails:
 *   1. opens the copy with the identity file he names. The file is read once, where he keeps it, and never copied,
 *      logged or printed; a path inside this repository is refused before it is read, so a key that wandered into the
 *      tree is caught at the drill and not in a commit. Only the identity's RECIPIENT is printed, which is public and is
 *      what `AGE_RECIPIENT` in `apps/worker/wrangler.jsonc` must equal.
 *   2. runs `braindog verify` on the opened copy, the real command in a child process, with `--key` passed through.
 *   3. restores it with `braindog init drill --from`, the command a host runs, into a throwaway data directory under the
 *      OS temp directory, with a root key of its own made there.
 *   4. asks, for every person the copy puts on the record, whether the restored Directory and record let them in, as a
 *      sign-in would. A record whose tables all match and whose people come back as strangers is a FAIL.
 *   5. exports the restored record again and compares its manifest with the copy's, table by table over the union of
 *      both, count and hash, and counts each list's rows in the copy against the restored record.
 *   6. takes the restored record round (`drill-trip.mjs`), unless `--no-round-trip` says not to.
 *   7. prints PASS or FAIL and the line for the ops record, and removes the folder, plaintext and record with it.
 *
 * NO PRODUCTION RECORD IS WRITTEN. A copy is a file he fetched himself or one wrangler reads for him; the requests this
 * makes are that read, the GET a `--key` URL asks for, and the one POST `--report` asks for, which carries counts only.
 *
 * THE DECRYPTOR IS A THIRD READING OF THE AGE SPEC, written from https://age-encryption.org/v1 over `node:crypto` and
 * sharing no code with the Worker's sealer (`apps/worker/src/seal.ts`, WebCrypto and its own ChaCha20) or the tests'
 * reader (`apps/worker/test/age-open.ts`). Once he has run it on a real night with the real identity, the sealer has been
 * read by something other than its own tests. An already opened `.brainl` (from `age -d`) is taken as it is, with no
 * `--identity`, so the stock CLI can stand in for step 1 when it is installed.
 */

import { spawnSync } from 'node:child_process';
import { createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman, hkdfSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

import { openRecord } from '@braindog/kernel';

import { roundTrip } from './drill-trip.mjs';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const say = (line) => process.stderr.write(`${line}\n`);
const out = (line) => process.stdout.write(`${line}\n`);

const USAGE =
  'The drill takes the copies it opens and the identity that opens them, as in node apps/cli/scripts/restore-drill.mjs --record <rec_id> --directory --identity-cmd "<a command that prints the age identity>", or a copy he fetched himself with --identity <a file outside this repository>. --key <pubkey|url> pins the signature, --report <origin> sends the counts, and --print-timer prints the monthly timer for the same arguments.';

/** The production bucket (`apps/worker/wrangler.jsonc`, `env.production`); `--bucket` names another. */
const BUCKET = 'braindog-blobs';
/** Where the night's newest copies are (`snapshots.ts` for a record, `directory-copy.ts` for the Directory). */
const RECORD_COPY = (rec) => `${rec}/snapshots/latest.brainl.age`;
const DIRECTORY_COPY = 'directory/snapshots/latest.dirl.age';
const REC_ID = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;
/** The door that keeps the host's last drill. */
const DRILL_DOOR = '/account/ops/drill';

// ─── bech32, for the identity he holds and the recipient it answers to ─────────────────────────────────────────────

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values) {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= gen[i];
  }
  return chk >>> 0;
}

const expand = (hrp) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

function regroup(values, from, to, pad) {
  const outBits = [];
  let acc = 0;
  let bits = 0;
  for (const v of values) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      outBits.push((acc >>> bits) & ((1 << to) - 1));
    }
    acc &= (1 << bits) - 1;
  }
  if (pad && bits > 0) outBits.push((acc << (to - bits)) & ((1 << to) - 1));
  /* LEFTOVER BITS MUST BE ZERO PADDING, or two strings would decode to one key. */
  else if (!pad && (bits >= from || acc !== 0)) return null;
  return outBits;
}

/** The 32 bytes of an `AGE-SECRET-KEY-1...` line, or null when it is not one or its checksum does not hold. */
function secretOf(line) {
  const s = line.toLowerCase();
  const at = s.lastIndexOf('1');
  if (s.slice(0, at) !== 'age-secret-key-') return null;
  const data = [...s.slice(at + 1)].map((c) => CHARSET.indexOf(c));
  if (data.length < 7 || data.some((d) => d < 0)) return null;
  if (polymod([...expand('age-secret-key-'), ...data]) !== 1) return null;
  const bytes = regroup(data.slice(0, -6), 5, 8, false);
  return bytes && bytes.length === 32 ? Buffer.from(bytes) : null;
}

function recipientOf(pub) {
  const data = regroup(pub, 8, 5, true);
  const mod = polymod([...expand('age'), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const check = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `age1${[...data, ...check].map((d) => CHARSET[d]).join('')}`;
}

/** An X25519 private key from its 32 raw bytes: RFC 8410's PKCS #8 wrapping, which is sixteen fixed bytes and the key. */
function keyOf(scalar) {
  const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), scalar]), format: 'der', type: 'pkcs8' });
  const pub = Buffer.from(createPublicKey(priv).export({ format: 'jwk' }).x, 'base64url');
  return { priv, pub, recipient: recipientOf(pub) };
}

// ─── age v1, opened ───────────────────────────────────────────────────────────────────────────────────────────────

const unb64 = (s) => {
  if (s.includes('=')) throw new Error('padded');
  return Buffer.from(s, 'base64');
};
const hkdf = (ikm, salt, info) => Buffer.from(hkdfSync('sha256', ikm, salt, info, 32));

function chacha(key, nonce, sealed) {
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}

/**
 * The copy's plaintext, or `{ refused }` with the sentence that says which of two things went wrong.
 *
 * THE TWO FAILURES ARE TOLD APART ON PURPOSE. A stanza no identity opens is the wrong key, and the fix is in his
 * password manager; a header MAC or a chunk tag that fails AFTER the stanza opened is a copy whose bytes changed, and the
 * fix is to fetch it again. One sentence for both would send him to the wrong place half the time.
 */
function ageOpen(file, ids) {
  const text = file.toString('latin1');
  const end = text.indexOf('\n---');
  const macEnd = text.indexOf('\n', end + 1);
  if (!text.startsWith('age-encryption.org/v1\n') || end < 0 || macEnd < 0) return { refused: 'The copy does not start like an age file, so it was not the object the Cloud puts. Fetch it again.' };
  const header = text.slice(0, end + 4);
  const lines = header.split('\n');

  let fileKey = null;
  let scrypt = false;
  for (let i = 1; i < lines.length - 1; i++) {
    const args = lines[i].split(' ');
    if (args[0] !== '->') continue;
    const body = [];
    /* A STANZA'S BODY ENDS AT ITS FIRST LINE SHORTER THAN 64 COLUMNS, which may be empty. */
    for (let j = i + 1; j < lines.length - 1; j++) {
      body.push(lines[j]);
      i = j;
      if (lines[j].length < 64) break;
    }
    if (args[1] === 'scrypt') scrypt = true;
    if (args[1] !== 'X25519' || args.length !== 3 || fileKey) continue;
    for (const id of ids) {
      try {
        const share = unb64(args[2]);
        const shared = diffieHellman({ privateKey: id.priv, publicKey: createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: share.toString('base64url') }, format: 'jwk' }) });
        fileKey = chacha(hkdf(shared, Buffer.concat([share, id.pub]), 'age-encryption.org/v1/X25519'), Buffer.alloc(12), unb64(body.join('')));
        break;
      } catch {
        /* Not this identity's stanza; the next identity, or the next stanza, may be. */
      }
    }
  }
  if (!fileKey || fileKey.length !== 16) {
    if (scrypt) return { refused: 'The copy is sealed with a passphrase, and the Cloud never seals that way, so it is not a nightly copy.' };
    return {
      refused: `The copy is not sealed to the identity you named, whose recipient is ${ids.map((id) => id.recipient).join(' and ')}. The Cloud seals each copy to AGE_RECIPIENT in apps/worker/wrangler.jsonc for the environment it came from; the identity must be the one that recipient was made from.`,
    };
  }

  const mac = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(Buffer.from(header, 'latin1')).digest();
  const said = text.slice(end + 4, macEnd);
  let macOk = false;
  try {
    macOk = said.startsWith(' ') && unb64(said.slice(1)).equals(mac);
  } catch {
    macOk = false;
  }
  if (!macOk) return { refused: 'The copy is damaged: the identity opened its key, and its header does not match the MAC it carries. Fetch it again.' };

  const rest = file.subarray(macEnd + 1);
  if (rest.length < 16 + 16) return { refused: 'The copy is damaged: it ends before its first chunk. Fetch it again.' };
  const key = hkdf(fileKey, rest.subarray(0, 16), 'payload');
  const payload = rest.subarray(16);
  const CHUNK = 64 * 1024 + 16;
  const parts = [];
  for (let at = 0, counter = 0; ; at += CHUNK, counter++) {
    const last = at + CHUNK >= payload.length;
    const nonce = Buffer.alloc(12);
    nonce.writeUIntBE(counter, 5, 6);
    if (last) nonce[11] = 1;
    let plain;
    try {
      plain = chacha(key, nonce, payload.subarray(at, at + CHUNK));
    } catch {
      return { refused: `The copy is damaged: chunk ${counter + 1} does not match its tag, so its bytes changed after it was sealed. Fetch it again.` };
    }
    /* AN EMPTY LAST CHUNK AFTER A FULL ONE IS A TRUNCATION the spec says to refuse. */
    if (last && plain.length === 0 && counter > 0) return { refused: 'The copy is damaged: it ends on an empty chunk after a full one. Fetch it again.' };
    parts.push(plain);
    if (last) break;
  }
  return { plain: Buffer.concat(parts) };
}

// ─── the identity, from a file or a command ───────────────────────────────────────────────────────────────────────

/**
 * The identities in a text, from a file or from a command. `what` begins each sentence.
 *
 * THE SENTENCE NAMES NO LINE AND QUOTES NOTHING, because the line it would quote is the secret.
 */
function keysIn(text, what) {
  if (text.startsWith('age-encryption.org/'))
    return { refused: `${what} is itself sealed with a passphrase. Give the drill the opened identity, through --identity-cmd or a file outside this repository deleted after.` };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  const keys = lines.map(secretOf);
  if (lines.length === 0 || keys.some((k) => k === null))
    return { refused: `${what} holds a line that is not an age identity (AGE-SECRET-KEY-1 and its checksum), so it was copied with a character wrong or it is not the key.` };
  return { ids: keys.map(keyOf) };
}

/**
 * The identities in the file he names. The file is read once, where he keeps it, and never copied, logged or printed.
 *
 * `..` AS A PATH STEP, NOT AS TWO CHARACTERS: a key saved in the repository as `..backup.key` is relative `..backup.key`,
 * and a bare `startsWith('..')` let it through and read it (measured with path.win32.relative).
 */
function identitiesFromFile(path) {
  const idPath = resolve(path);
  const within = relative(resolve(REPO), idPath);
  if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within)))
    return { refused: `The identity file is inside the repository, and it must never be. Move it out of ${resolve(REPO)} and delete it from the tree before anything is committed; it was not read.` };
  let text;
  try {
    text = readFileSync(idPath, 'latin1');
  } catch {
    return { refused: 'The identity file could not be read.' };
  }
  return keysIn(text, 'The identity file');
}

/**
 * The identities a command prints: the keychain's or a password manager's command line, run by the shell, its output
 * read and never shown. The rehearsal's rule (`migration-rehearsal.mjs` `identitiesFromCommand`), in the drill's words.
 *
 * ITS OWN ERROR OUTPUT IS NOT SAID EITHER. A password manager that fails may print the item it was asked for, and the
 * exit code is enough to say what went wrong.
 */
function identitiesFromCommand(command) {
  const r = spawnSync(command, { shell: true, encoding: 'latin1', stdio: ['inherit', 'pipe', 'pipe'], maxBuffer: 1 << 20 });
  if (r.error) return { refused: `The identity command could not be run (${r.error.code ?? 'no reason given'}), so no identity was read.` };
  if (r.status !== 0) return { refused: `The identity command exited ${r.status}, so no identity was read. Run it by itself to see why.` };
  return keysIn(String(r.stdout ?? ''), 'What the identity command printed');
}

// ─── fetched as the operator ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The wrangler the drill runs: `BRAINDOG_WRANGLER` when it is set (a test's stand-in, or another install), else the one
 * `apps/worker` installs. A `.mjs` or `.js` is run by this Node, so a stand-in needs no shebang.
 */
function wrangler() {
  const named = process.env.BRAINDOG_WRANGLER;
  const bin = named && named !== '' ? named : join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'wrangler');
  return /\.(m?js)$/.test(bin) ? { command: process.execPath, first: [bin] } : { command: bin, first: [] };
}

/**
 * One object of the bucket, read with `wrangler r2 object get --remote` into `dest`, or the sentence that says why not.
 *
 * RUN FROM `apps/worker`, so wrangler reads that project's account the way a deploy does. Its output is not echoed on a
 * success, and on a failure only its last lines are, which name the object and never a key.
 */
function fetchObject(bucket, key, dest) {
  const w = wrangler();
  const r = spawnSync(w.command, [...w.first, 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', '--file', dest], {
    encoding: 'utf8',
    cwd: join(REPO, 'apps', 'worker'),
    timeout: 300_000,
  });
  if (r.error) return { refused: `wrangler could not be run (${r.error.code ?? 'no reason given'}), so ${key} was not fetched. Install the Worker's packages, or name one with BRAINDOG_WRANGLER.` };
  if (r.status !== 0 || !existsSync(dest)) {
    const said = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-3);
    return { refused: `wrangler did not fetch ${key} from ${bucket} (exit ${r.status}). Sign in with wrangler login as the operator, and check the night wrote it.`, said };
  }
  return { ok: true };
}

// ─── the file's own tables ────────────────────────────────────────────────────────────────────────────────────────

/** One table of a `.brainl`, as its column names and rows. Empty when the file has no such table. */
function tableOf(lines, name) {
  const at = lines.findIndex((l) => l.startsWith(`#table ${name} `));
  if (at < 0) return { columns: [], rows: [] };
  const columns = lines[at].slice(`#table ${name} `.length).split(' ')[0].split(',');
  const rows = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    if (line.trim() !== '') rows.push(JSON.parse(line));
  }
  return { columns, rows };
}

const manifestOf = (lines) => new Map(tableOf(lines, 'dog_manifest').rows.map(([name, n, sha]) => [name, { n, sha }]));

/** A migration ledger as its versions and checksums, which is the build, without the instants, which are the install. */
function ledger(lines) {
  const { columns, rows } = tableOf(lines, 'migration');
  const v = columns.indexOf('version');
  const c = columns.indexOf('checksum');
  return JSON.stringify(rows.map((r) => [r[v], r[c]]));
}

function listsOf(lines) {
  const { columns, rows } = tableOf(lines, 'entry');
  const at = columns.indexOf('register');
  const counts = new Map();
  for (const row of rows) counts.set(row[at], (counts.get(row[at]) ?? 0) + 1);
  return counts;
}

/** The `Sql` port over `node:sqlite`, as `packages/kernel/test/sqlite.ts` builds it, for the one throwaway file. */
function openSql(path) {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...params)),
    all: (text, ...params) => db.prepare(text).all(...params),
    one: (text, ...params) => db.prepare(text).get(...params),
    transactionSync(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

const row = (a, b, c, mark) => `  ${a.padEnd(28)}${String(b).padStart(9)}${String(c).padStart(10)}  ${mark}`.trimEnd();
const mmss = (ms) => `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// ─── the drill ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One record's copy, drilled: opened, verified, restored, counted and taken round. Answers what the run line and the
 * report need, `{ pass, record, rows, tables, lists, people, bytes }`, and prints its own lines as it goes.
 *
 * `ctx.identities()` IS ASKED ONLY FOR A SEALED COPY, and answers the same identities for every copy of one run, so a
 * password manager asks once.
 */
async function drillCopy(copyPath, ctx) {
  const failedEarly = (bytes = 0) => ({ pass: false, record: null, rows: 0, tables: 0, lists: 0, people: 0, bytes });
  const began = performance.now();

  let sealed;
  try {
    sealed = readFileSync(copyPath);
  } catch {
    say(`${copyPath} could not be read.`);
    return failedEarly();
  }
  const isSealed = sealed.subarray(0, 32).toString('latin1').startsWith('age-encryption.org/');
  if (sealed.subarray(0, 40).toString('latin1').startsWith('-----BEGIN AGE ENCRYPTED FILE-----')) {
    say(`${copyPath} is armored age text, and the Cloud puts binary copies. Fetch the object again with wrangler, which writes the bytes as they are.`);
    return failedEarly(sealed.length);
  }
  out(`restore drill · ${ctx.label ?? copyPath} · ${sealed.length} bytes`);

  // 1 · OPEN ───────────────────────────────────────────────────────────────────────────────────────────────────────
  let plain = sealed;
  if (isSealed) {
    const got = ctx.identities();
    if (got.refused) {
      say(got.refused);
      return failedEarly(sealed.length);
    }
    const ids = got.ids;
    const opened = ageOpen(sealed, ids);
    if (opened.refused) {
      say(opened.refused);
      return failedEarly(sealed.length);
    }
    plain = opened.plain;
    out(`  opened     ${plain.length} bytes of .brainl with the identity whose recipient is ${ids.map((id) => id.recipient).join(', ')}`);
  } else {
    out('  opened     already: the copy is not sealed, so it is read as it is');
  }

  /* THE PLAINTEXT GOES IN ONE FOLDER, AND THE FOLDER GOES WHATEVER HAPPENS. `braindog verify` reads a file, and the
     throwaway record is a file, so both live here and one `rmSync` removes both. Ctrl-C removes it too. */
  const scratch = mkdtempSync(join(tmpdir(), 'braindog-drill-'));
  const cleanup = () => rmSync(scratch, { recursive: true, force: true });
  const interrupted = () => {
    cleanup();
    process.exit(130);
  };
  process.once('SIGINT', interrupted);
  try {
    const plainFile = join(scratch, 'copy.brainl');
    writeFileSync(plainFile, plain, { mode: 0o600 });
    const lines = plain.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

    // 2 · VERIFY ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const verified = spawnSync(process.execPath, [MAIN, 'verify', plainFile, ...(ctx.key === undefined ? [] : ['--key', ctx.key])], {
      encoding: 'utf8',
      cwd: scratch,
    });
    out('  verify     braindog verify');
    for (const line of verified.stdout.split(/\r?\n/)) if (line.trim() !== '') out(`  ${line}`);
    if (verified.status !== 0) {
      for (const line of verified.stderr.split(/\r?\n/)) if (line.trim() !== '') say(line);
      out(`FAIL ${ctx.label ?? copyPath} · braindog verify refused it (exit ${verified.status}), so nothing was restored`);
      return failedEarly(sealed.length);
    }

    // 3 · RESTORE ────────────────────────────────────────────────────────────────────────────────────────────────────
    /* WITH `braindog init drill --from`, THE COMMAND A HOST RUNS, into a throwaway data directory. This imported the file
       into an empty kernel, which no host does, and it said PASS for a copy with a suspended first owner and two
       more people while `init --from` turned the same file into a record none of them could open. BRAINDOG_KEK_FILE is left out so the child makes a root key of its own in the scratch folder and reads no real
       one, and BRAINDOG_OWNER is emptied so a value in his shell does not choose the owner for the copy. */
    const data = join(scratch, 'data');
    const env = { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '' };
    delete env.BRAINDOG_KEK_FILE;
    const init = spawnSync(process.execPath, [MAIN, 'init', 'drill', '--from', plainFile], { encoding: 'utf8', cwd: scratch, env });
    if (init.status !== 0) {
      for (const line of init.stderr.split(/\r?\n/)) if (line.trim() !== '') say(line);
      out(`FAIL ${ctx.label ?? copyPath} · braindog init --from refused it (exit ${init.status}), so no host could serve this copy`);
      return failedEarly(sealed.length);
    }
    out(`  restored   with braindog init drill --from, into a throwaway data directory in ${scratch}, removed when the drill ends`);
    for (const line of init.stderr.split(/\r?\n/)) if (line.trim() !== '') out(`  ${line.trim()}`);

    const sql = openSql(join(data, 'drill', 'record.brain'));
    let again;
    let lists;
    let reach;
    try {
      const k = await openRecord(sql, { now: () => Date.now() });

      // 4 · WHO CAN OPEN IT ──────────────────────────────────────────────────────────────────────────────────────────
      /* EVERY PERSON THE COPY PUTS ON THE RECORD, ASKED AS A SIGN-IN ASKS: the Directory's id for their address, then
         the record's `access` for that id. A restore whose tables all match and whose people come back as strangers is a
         record nobody can open, and that was the PASS this step exists to stop. A person the copy suspends is shown and
         not scored, because the record refusing them is the copy working. */
      const dir = new DatabaseSync(join(data, 'directory.sqlite'), { readOnly: true });
      try {
        const people = tableOf(lines, 'person');
        const members = tableOf(lines, 'member');
        const col = (t, name) => t.columns.indexOf(name);
        const levelIn = new Map();
        for (const m of members.rows) {
          const id = m[col(members, 'person_id')];
          const level = m[col(members, 'register')] === '*' ? m[col(members, 'level')] : 'lists';
          if (!levelIn.has(id) || level !== 'lists') levelIn.set(id, level);
        }
        reach = people.rows
          .filter((p) => levelIn.has(p[col(people, 'id')]))
          .map((p) => {
            const email = String(p[col(people, 'email')] ?? '');
            const suspended = Boolean(p[col(people, 'suspended_at')]);
            const known = email.includes('@') ? dir.prepare('SELECT id FROM dir_person WHERE lower(email) = lower(?)').get(email.trim()) : undefined;
            const held = known ? k.access(known.id) : null;
            const got = held ? (held.level ?? 'lists') : suspended ? 'suspended' : 'nobody';
            return { email: email || p[col(people, 'id')], want: levelIn.get(p[col(people, 'id')]), got, ok: held !== null || suspended };
          });
      } finally {
        dir.close();
      }

      // 5 · COUNT ──────────────────────────────────────────────────────────────────────────────────────────────────
      /* THE RESTORED RECORD IS EXPORTED AGAIN AND ITS MANIFEST IS THE MEASURE, not a `count(*)` per table: the export
         counts what travels and leaves out what does not (its own `export` event among them), which is exactly what the
         copy's manifest counted, and it hashes each table, so equal counts of different rows still fail. */
      const exported = await k.export({ redactGrants: false });
      if (!exported.ok) {
        out(`FAIL ${ctx.label ?? copyPath} · the restored record would not export: ${exported.refusal?.fix ?? JSON.stringify(exported)}`);
        return failedEarly(sealed.length);
      }
      again = exported.value;
      const restoredLists = new Map(sql.all('SELECT register, count(*) AS n FROM entry GROUP BY register').map((r) => [r.register, Number(r.n)]));
      lists = { copy: listsOf(lines), restored: restoredLists };
    } finally {
      sql.close();
    }

    const record = (() => {
      const { columns, rows } = tableOf(lines, 'record');
      return rows[0]?.[columns.indexOf('id')] ?? 'a record the copy does not name';
    })();
    const theirs = manifestOf(lines);
    const ours = manifestOf(again);
    let failed = 0;
    let tables = 0;
    let rows = 0;
    out(row('table', 'manifest', 'restored', ''));
    /* THE UNION OF BOTH MANIFESTS, not the copy's alone: a table the restored record exports with rows in it and the copy
       never named is a difference too, and reading only the copy's names left it unread. */
    for (const name of ours.keys()) if (!theirs.has(name) && ours.get(name).n > 0) theirs.set(name, { n: 0, sha: '' });
    for (const [name, want] of theirs) {
      /* THE LINE'S ROWS ARE THE RECORD'S, counted as `dumpOf` counts them for the copy's metadata and for Settings: the
         four `dog_` tables describe the file, and on the first run they were 38 of its 74. */
      if (!name.startsWith('dog_')) rows += want.n;
      /* `migration` IS THIS BUILD'S LEDGER, NOT THE COPY'S. The import never writes it (`brainl.ts` `SKIPPED`), so it is
         said and not scored, and it is compared by version and checksum only: its hash never matched, because each row
         carries the instant its migration ran, and the throwaway record ran them a minute ago (measured on the first
         run of this drill, 13 rows against 13 and two hashes). A difference in the pairs means this checkout is not the
         build that wrote the copy, and then a table whose columns changed between the two fails honestly below. */
      const got = ours.get(name) ?? { n: 0, sha: '' };
      if (name === 'migration') {
        if (ledger(lines) !== ledger(again)) out(`  migration: this checkout's ledger (${got.n}) is not the copy's (${want.n}), so run the drill at the commit that wrote it`);
        continue;
      }
      const same = got.n === want.n && got.sha === want.sha;
      if (!same) failed++;
      if (want.n > 0) tables++;
      if (want.n > 0 || !same) out(row(name, want.n, got.n, same ? '✓' : got.n === want.n ? '✗ same count, different rows' : '✗'));
    }
    out(row('list', 'in copy', 'restored', ''));
    for (const [list, n] of [...lists.copy].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const got = lists.restored.get(list) ?? 0;
      if (got !== n) failed++;
      out(row(list, n, got, got === n ? '✓' : '✗'));
    }
    out(row('person', 'in copy', 'reaches', ''));
    for (const p of reach) {
      if (!p.ok) failed++;
      out(row(p.email, p.want, p.got, p.got === 'suspended' ? '' : p.ok ? '✓' : '✗'));
    }
    if (!reach.some((p) => p.got !== 'suspended' && p.ok)) {
      failed++;
      out('  nobody the copy names can open the restored record');
    }
    const took = mmss(performance.now() - began);

    // 6 · ROUND TRIP ─────────────────────────────────────────────────────────────────────────────────────────────────
    /* ON THE RECORD JUST COUNTED, AFTER THE COUNT AND BEFORE THE FOLDER GOES, as `drill-trip.mjs` asks: step 5 of the
       trip puts the copy back over itself, so the count above is of the copy as it came. Each step is one line of
       counts, and a red step is one more thing that did not come back. `--no-round-trip` leaves it out and says so,
       and the verdict line says so too, so a PASS without it is never read as the whole drill. */
    let tripped = 'not run';
    if (ctx.trip === false) out('  round trip not run: --no-round-trip');
    else {
      const trip = await roundTrip(data, { main: MAIN });
      out('  round trip');
      for (const s of trip.steps) out(`    ${s.pass ? '✓' : '✗'} ${s.name}: ${s.said}`);
      const red = trip.steps.filter((s) => !s.pass).length;
      if (!trip.pass) failed += Math.max(red, 1);
      tripped = trip.pass ? `${trip.steps.length} steps` : `${red} of ${trip.steps.length} steps red`;
    }

    // 7 · SAY SO ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const people = reach.filter((p) => p.got !== 'suspended').length;
    if (failed > 0) out(`FAIL ${record} · ${failed} of the copy's tables, lists, people and round trip steps did not come back as they were`);
    else out(`PASS ${record} · ${tables} tables and ${lists.copy.size} lists came back as the copy's manifest says, and ${people} people can open it`);
    out(`drill ${record} · ${rows} rows · ${sealed.length} bytes · restore ${took} · round trip ${tripped}`);
    return { pass: failed === 0, record, rows, tables, lists: lists.copy.size, people, bytes: sealed.length };
  } finally {
    process.removeListener('SIGINT', interrupted);
    cleanup();
  }
}

// ─── the Directory's copy ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The Directory's copy, drilled: opened, loaded into an empty Directory in memory, and asked, for every open record it
 * lists, whether that record has an owner who can sign in. Answers `{ pass, records, owners, people, passkeys, bytes }`.
 *
 * WHY THIS IS THE QUESTION. Lose the Directory and every record survives with nobody able to reach one
 * (`directory-copy.ts`). A copy that loads and still leaves a record with no way in is the same loss, found a month
 * late. CAN SIGN IN is what the Directory alone can answer: the person is there, is not suspended, has an address a
 * sign-in link can reach, is a member of the record, and the record has a live name that leads to it. A passkey is
 * counted and not required, because a link signs a person in without one. A record that names no founding owner (an
 * older row, `owner` empty) passes when one of its members can sign in, and its line says so.
 *
 * `load` IS THE DIRECTORY'S OWN (`packages/record/src/directory.ts`), the one a host runs to put a copy back, and it
 * refuses a copy written at another Directory version: then the drill is run at the commit that wrote it.
 */
async function drillDirectory(copyPath, ctx) {
  const failed = (bytes = 0) => ({ pass: false, records: 0, owners: 0, people: 0, passkeys: 0, bytes });
  let file;
  try {
    file = readFileSync(copyPath);
  } catch {
    say(`${copyPath} could not be read.`);
    return failed();
  }
  out(`restore drill · the Directory · ${file.length} bytes`);
  let plain = file;
  if (file.subarray(0, 32).toString('latin1').startsWith('age-encryption.org/')) {
    const got = ctx.identities();
    if (got.refused) {
      say(got.refused);
      return failed(file.length);
    }
    const opened = ageOpen(file, got.ids);
    if (opened.refused) {
      say(opened.refused);
      return failed(file.length);
    }
    plain = opened.plain;
    out(`  opened     ${plain.length} bytes of the Directory's lines with the identity whose recipient is ${got.ids.map((id) => id.recipient).join(', ')}`);
  }
  const lines = plain.toString('utf8').replace(/^﻿/, '').split(/\r?\n/);

  /* IN MEMORY, SO NOTHING OF IT IS EVER A FILE. The lines hold every address on the deployment. */
  const { createDirectory } = await import('../../../packages/record/src/directory.ts');
  const sql = openSql(':memory:');
  try {
    const directory = createDirectory(sql, { now: () => Date.now() });
    const loaded = directory.load(lines);
    if (!loaded.ok) {
      say(loaded.refusal?.fix ?? 'The Directory would not load the copy.');
      out(`FAIL the Directory · it would not load into an empty Directory (${loaded.refusal?.code ?? 'refused'})`);
      return failed(file.length);
    }
    out(`  loaded     ${loaded.value.tables} tables and ${loaded.value.rows} rows into an empty Directory, in memory`);

    const signsIn = (person) =>
      sql.one("SELECT 1 AS x FROM dir_person WHERE id = ? AND suspended_at IS NULL AND email LIKE '%_@_%'", person) !== undefined;
    const open = sql.all(
      `SELECT r.id AS id, r.owner AS owner,
              (SELECT s.slug FROM dir_slug s WHERE s.record = r.id AND s.released_at IS NULL) AS slug
         FROM dir_record r WHERE r.closed_at IS NULL ORDER BY r.id`,
    );
    let owners = 0;
    let unnamed = 0;
    for (const r of open) {
      const name = r.slug ?? 'a record with no live name';
      let why = null;
      if (r.slug === null) why = 'no live name leads to it';
      else if (r.owner === '') {
        const members = sql.all('SELECT person FROM dir_member WHERE record = ?', r.id).map((m) => m.person);
        if (members.some(signsIn)) unnamed++;
        else why = 'it names no founding owner, and none of its members can sign in';
      } else if (sql.one('SELECT 1 AS x FROM dir_person WHERE id = ?', r.owner) === undefined) why = 'its owner is not in the copy';
      else if (!signsIn(r.owner)) why = 'its owner is suspended or has no address a sign-in link can reach';
      else if (!directory.reaches(r.id, r.owner)) why = 'its owner is not a member of it';
      if (why === null) owners++;
      else out(row(name, '', '', `✗ ${why}`));
    }
    const people = Number(sql.one('SELECT count(*) AS n FROM dir_person')?.n ?? 0);
    const passkeys = Number(sql.one('SELECT count(*) AS n FROM dir_passkey')?.n ?? 0);
    const pass = owners === open.length && open.length > 0;
    if (unnamed > 0) out(`  ${unnamed} of them name no founding owner, and a member of each can sign in`);
    if (open.length === 0) out('FAIL the Directory · the copy lists no open record, so it is not a night of a host anybody uses');
    else if (pass) out(`PASS the Directory · ${open.length} open records, each with an owner who can sign in · ${people} people · ${passkeys} passkeys`);
    else out(`FAIL the Directory · ${open.length - owners} of ${open.length} open records have no owner who can sign in`);
    return { pass, records: open.length, owners, people, passkeys, bytes: file.length };
  } finally {
    sql.close();
  }
}

// ─── the report, and the timer ────────────────────────────────────────────────────────────────────────────────────

/**
 * The run's counts, posted to the host's operator door, and the sentence that says what became of them.
 *
 * COUNTS ONLY: when, whether it passed, how many copies, rows, lists and people, and how many records the Directory
 * lists. No id, name or address leaves this machine. THE KEY GOES ONLY OVER HTTPS, or to this machine for a test.
 * A 404 is the door not being there yet, which is told apart from a refused key.
 */
async function report(origin, run, key) {
  if (key === '') return 'not sent: no key';
  const url = new URL(DRILL_DOOR, origin);
  const body = {
    at: new Date().toISOString(),
    pass: run.pass,
    copies: run.copies.length,
    rows: run.copies.reduce((n, c) => n + c.rows, 0),
    lists: run.copies.reduce((n, c) => n + c.lists, 0),
    people: run.copies.reduce((n, c) => n + c.people, 0),
    records: run.directory?.records ?? null,
  };
  let answer;
  try {
    /* NO REDIRECT IS FOLLOWED, so the key goes to the origin he named and nowhere it points on to. */
    answer = await fetch(url, { method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return `not sent: ${url.host} could not be reached`;
  }
  if (answer.status === 404) return 'not sent: no door';
  if (answer.status === 401) return 'not sent: the host refused the key';
  if (!answer.ok) return `not sent: the host answered ${answer.status}`;
  return `sent to ${url.host}`;
}

/** An origin the report may carry the key to, or null. */
function reportOrigin(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.origin : null;
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The monthly launchd file for these arguments, printed and never installed: he or the loop puts it in
 * `~/Library/LaunchAgents` and loads it. The first of the month at 09:17 on the Mac's clock, which is after the night's
 * copies at 03:17 UTC wherever the Mac is from UTC+5 westward.
 *
 * IT CARRIES NO SECRET. The identity comes from the command it names, and `PROVISION_KEY` is not written into it: a
 * timer with no key reports "not sent: no key", which is said in its log, until the key has a home a command can read.
 */
function timer(args) {
  const logs = join(homedir(), 'Library', 'Logs', 'braindog-restore-drill.log');
  const argv = [process.execPath, fileURLToPath(import.meta.url), ...args];
  const path = [dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key><string>dog.brain.restore-drill</string>',
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...argv.map((a) => `    <string>${xml(a)}</string>`),
    '  </array>',
    `  <key>WorkingDirectory</key><string>${xml(resolve(REPO))}</string>`,
    '  <key>EnvironmentVariables</key>',
    `  <dict><key>PATH</key><string>${xml(path)}</string></dict>`,
    '  <key>StartCalendarInterval</key>',
    '  <dict><key>Day</key><integer>1</integer><key>Hour</key><integer>9</integer><key>Minute</key><integer>17</integer></dict>',
    `  <key>StandardOutPath</key><string>${xml(logs)}</string>`,
    `  <key>StandardErrorPath</key><string>${xml(logs)}</string>`,
    '</dict>',
    '</plist>',
  ].join('\n');
}

// ─── the run ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      strict: true,
      options: {
        identity: { type: 'string' },
        'identity-cmd': { type: 'string' },
        key: { type: 'string' },
        record: { type: 'string', multiple: true },
        directory: { type: 'boolean' },
        bucket: { type: 'string' },
        report: { type: 'string' },
        'print-timer': { type: 'boolean' },
        'no-round-trip': { type: 'boolean' },
      },
    }));
  } catch {
    say(USAGE);
    return 1;
  }
  const records = values.record ?? [];
  if (positionals.length === 0 && records.length === 0 && !values.directory) {
    say(USAGE);
    return 1;
  }
  const odd = records.find((r) => !REC_ID.test(r));
  if (odd !== undefined) {
    say(`--record takes a record's id as the bucket names it (rec_ and 26 letters and digits), and ${odd} is not one.`);
    return 1;
  }
  if (values.identity !== undefined && values['identity-cmd'] !== undefined) {
    say('The drill takes the identity one way: --identity <file> or --identity-cmd "<command>", not both.');
    return 1;
  }
  const origin = values.report === undefined ? undefined : reportOrigin(values.report);
  if (origin === null) {
    say(`--report takes the host's origin, as in https://app.brain.dog, and ${values.report} is not one the key may go to.`);
    return 1;
  }

  /* THE TIMER IS PRINTED FROM THE SAME ARGUMENTS IT WILL RUN, less this flag, after they are checked, and never with a
     copy on disk: a file fetched by hand is gone by next month. */
  if (values['print-timer']) {
    if (positionals.length > 0) {
      say('The timer drills what the bucket holds that night, so it takes --record and --directory, and no file.');
      return 1;
    }
    out(timer(process.argv.slice(2).filter((a) => a !== '--print-timer')));
    return 0;
  }

  /* THE OPERATOR KEY IS TAKEN OUT OF THE ENVIRONMENT BEFORE ANY CHILD RUNS: the identity command, wrangler, `braindog`
     and the round trip's host would each inherit it, and only the report needs it. */
  const provisionKey = (process.env.PROVISION_KEY ?? '').trim();
  delete process.env.PROVISION_KEY;

  let held;
  const identities = () =>
    (held ??=
      values['identity-cmd'] !== undefined
        ? identitiesFromCommand(values['identity-cmd'])
        : values.identity !== undefined
          ? identitiesFromFile(values.identity)
          : { refused: 'The copy is sealed, so the drill needs the identity that opens it: add --identity-cmd "<a command that prints it>", or --identity <file>, the age identity kept outside this repository.' });
  const ctx = { identities, key: values.key, trip: !values['no-round-trip'] };
  const bucket = values.bucket ?? BUCKET;

  /* THE SEALED OBJECTS WRANGLER FETCHES GO IN ONE FOLDER, which goes whatever happens. They are ciphertext, and still
     nothing of a record is left lying in the temp folder after a drill. */
  const fetched = mkdtempSync(join(tmpdir(), 'braindog-drill-fetch-'));
  /* CTRL-C TAKES IT TOO. A copy's own handler removes its plaintext and exits, and the exit removes this folder; between
     copies nobody else listens, so this one exits. */
  const gone = () => rmSync(fetched, { recursive: true, force: true });
  const interrupted = () => {
    if (process.listenerCount('SIGINT') === 1) process.exit(130);
  };
  process.on('exit', gone);
  process.on('SIGINT', interrupted);
  const run = { copies: [], directory: null };
  try {
    for (const copyPath of positionals) run.copies.push(await drillCopy(copyPath, ctx));
    for (const rec of records) {
      const dest = join(fetched, `${rec}.brainl.age`);
      const got = fetchObject(bucket, RECORD_COPY(rec), dest);
      if (got.refused) {
        say(got.refused);
        for (const line of got.said ?? []) say(`  ${line}`);
        out(`FAIL ${rec} · its night's copy was not fetched`);
        run.copies.push({ pass: false, record: rec, rows: 0, tables: 0, lists: 0, people: 0, bytes: 0 });
        continue;
      }
      out(`  fetched    ${RECORD_COPY(rec)} from ${bucket}, with wrangler as the operator`);
      run.copies.push(await drillCopy(dest, { ...ctx, label: rec }));
      rmSync(dest, { force: true });
    }
    if (values.directory) {
      const dest = join(fetched, 'directory.dirl.age');
      const got = fetchObject(bucket, DIRECTORY_COPY, dest);
      if (got.refused) {
        say(got.refused);
        for (const line of got.said ?? []) say(`  ${line}`);
        out("FAIL the Directory · its night's copy was not fetched");
        run.directory = { pass: false, records: 0, owners: 0, people: 0, passkeys: 0, bytes: 0 };
      } else {
        out(`  fetched    ${DIRECTORY_COPY} from ${bucket}, with wrangler as the operator`);
        run.directory = await drillDirectory(dest, ctx);
      }
    }
  } finally {
    process.removeListener('SIGINT', interrupted);
    process.removeListener('exit', gone);
    gone();
  }

  const all = [...run.copies, ...(run.directory ? [run.directory] : [])];
  run.pass = all.length > 0 && all.every((c) => c.pass);
  if (all.length > 1) {
    const red = all.filter((c) => !c.pass).length;
    out(run.pass ? `ALL PASS · ${all.length} copies` : `FAIL · ${red} of ${all.length} copies did not come back as they were`);
  }
  if (origin !== undefined) out(`report ${await report(origin, run, provisionKey)}`);
  return run.pass ? 0 : 1;
}

/* THE AGE READER IS THE REHEARSAL'S TOO (`migration-rehearsal.mjs`), and importing this file runs nothing. */
export { ageOpen, identitiesFromCommand, keyOf, secretOf };
if (import.meta.main) process.exitCode = await main();
