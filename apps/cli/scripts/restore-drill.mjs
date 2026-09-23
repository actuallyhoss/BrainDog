#!/usr/bin/env node
/**
 * The restore drill: a sealed nightly copy of a Cloud record, opened, verified, restored and counted (ROADMAP W55-8).
 *
 *   node apps/cli/scripts/restore-drill.mjs latest.brainl.age --identity <age identity file> [--key <pubkey|url>]
 *
 * WHY IT EXISTS. Until this, the only code that had ever opened one of the Cloud's copies was a test's decryptor, and the
 * only restore of one was a probe in a scratch clone (`loop/research-restore.md` answer 1). A backup nobody has put back
 * is a hope, and `53 §5.4`'s drill could not be run as written: `age` is not on this machine, `init` then `import` is
 * `IMPORT_NOT_EMPTY`, and `shred` is not on Windows (section 7, measured). This runs all of it with Node alone.
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
 *   6. prints PASS or FAIL and the line for the ops record, and removes the folder, plaintext and record with it.
 *
 * NOTHING HERE WRITES TO A NETWORK, and no production record is touched. The copy is a file he fetched himself (the
 * command is in `loop/research-restore.md`, "Drill"); the one request this can make is the GET a `--key` URL asks for.
 *
 * THE DECRYPTOR IS A THIRD READING OF THE AGE SPEC, written from https://age-encryption.org/v1 over `node:crypto` and
 * sharing no code with the Worker's sealer (`apps/worker/src/seal.ts`, WebCrypto and its own ChaCha20) or the tests'
 * reader (`apps/worker/test/age-open.ts`). Once he has run it on a real night with the real identity, the sealer has been
 * read by something other than its own tests. An already opened `.brainl` (from `age -d`) is taken as it is, with no
 * `--identity`, so the stock CLI can stand in for step 1 when it is installed.
 */

import { spawnSync } from 'node:child_process';
import { createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman, hkdfSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

import { openRecord } from '@braindog/kernel';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const say = (line) => process.stderr.write(`${line}\n`);
const out = (line) => process.stdout.write(`${line}\n`);

const USAGE =
  'The drill takes one copy and the identity that opens it, as in node apps/cli/scripts/restore-drill.mjs latest.brainl.age --identity <a file outside this repository>, and --key <pubkey|url> to pin the signature.';

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

async function main() {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: { identity: { type: 'string' }, key: { type: 'string' } } }));
  } catch {
    say(USAGE);
    return 1;
  }
  const [copyPath, ...more] = positionals;
  if (copyPath === undefined || more.length > 0) {
    say(USAGE);
    return 1;
  }
  const began = performance.now();

  let sealed;
  try {
    sealed = readFileSync(copyPath);
  } catch {
    say(`${copyPath} could not be read.`);
    return 1;
  }
  const isSealed = sealed.subarray(0, 32).toString('latin1').startsWith('age-encryption.org/');
  if (sealed.subarray(0, 40).toString('latin1').startsWith('-----BEGIN AGE ENCRYPTED FILE-----')) {
    say(`${copyPath} is armored age text, and the Cloud puts binary copies. Fetch the object again with wrangler, which writes the bytes as they are.`);
    return 1;
  }
  out(`restore drill · ${copyPath} · ${sealed.length} bytes`);

  // 1 · OPEN ───────────────────────────────────────────────────────────────────────────────────────────────────────
  let plain = sealed;
  if (isSealed) {
    if (values.identity === undefined) {
      say(`${copyPath} is sealed, so the drill needs the identity that opens it: add --identity <file>, the age identity kept outside this repository.`);
      return 1;
    }
    const idPath = resolve(values.identity);
    const within = relative(resolve(REPO), idPath);
    /* `..` AS A PATH STEP, NOT AS TWO CHARACTERS: a key saved in the repository as `..backup.key` is relative `..backup.key`,
       and a bare `startsWith('..')` let it through and read it (measured with path.win32.relative). */
    if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within))) {
      say(`The identity file is inside the repository, and it must never be. Move it out of ${resolve(REPO)} and delete it from the tree before anything is committed; it was not read.`);
      return 1;
    }
    let idText;
    try {
      idText = readFileSync(idPath, 'latin1');
    } catch {
      say('The identity file could not be read.');
      return 1;
    }
    if (idText.startsWith('age-encryption.org/')) {
      say('The identity file is itself sealed with a passphrase. Open it with age -d into a file outside this repository, run the drill with that, and delete it after.');
      return 1;
    }
    const lines = idText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
    const keys = lines.map(secretOf);
    if (lines.length === 0 || keys.some((k) => k === null)) {
      /* THE SENTENCE NAMES NO LINE AND QUOTES NOTHING, because the line it would quote is the secret. */
      say('The identity file holds a line that is not an age identity (AGE-SECRET-KEY-1 and its checksum), so it was copied with a character wrong or it is not the file.');
      return 1;
    }
    const ids = keys.map(keyOf);
    const opened = ageOpen(sealed, ids);
    if (opened.refused) {
      say(opened.refused);
      return 1;
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
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  try {
    const plainFile = join(scratch, 'copy.brainl');
    writeFileSync(plainFile, plain, { mode: 0o600 });
    const lines = plain.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

    // 2 · VERIFY ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const verified = spawnSync(process.execPath, [MAIN, 'verify', plainFile, ...(values.key === undefined ? [] : ['--key', values.key])], {
      encoding: 'utf8',
      cwd: scratch,
    });
    out('  verify     braindog verify');
    for (const line of verified.stdout.split(/\r?\n/)) if (line.trim() !== '') out(`  ${line}`);
    if (verified.status !== 0) {
      for (const line of verified.stderr.split(/\r?\n/)) if (line.trim() !== '') say(line);
      out(`FAIL ${copyPath} · braindog verify refused it (exit ${verified.status}), so nothing was restored`);
      return 1;
    }

    // 3 · RESTORE ────────────────────────────────────────────────────────────────────────────────────────────────────
    /* WITH `braindog init drill --from`, THE COMMAND A HOST RUNS, into a throwaway data directory. This imported the file
       into an empty kernel, which no host does, and it said PASS for the audit's copy (a suspended first owner and two
       more people) while `init --from` turned the same file into a record none of them could open (audit fifty-seven
       §7). BRAINDOG_KEK_FILE is left out so the child makes a root key of its own in the scratch folder and reads no real
       one, and BRAINDOG_OWNER is emptied so a value in his shell does not choose the owner for the copy. */
    const data = join(scratch, 'data');
    const env = { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '' };
    delete env.BRAINDOG_KEK_FILE;
    const init = spawnSync(process.execPath, [MAIN, 'init', 'drill', '--from', plainFile], { encoding: 'utf8', cwd: scratch, env });
    if (init.status !== 0) {
      for (const line of init.stderr.split(/\r?\n/)) if (line.trim() !== '') say(line);
      out(`FAIL ${copyPath} · braindog init --from refused it (exit ${init.status}), so no host could serve this copy`);
      return 1;
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
        out(`FAIL ${copyPath} · the restored record would not export: ${exported.refusal?.fix ?? JSON.stringify(exported)}`);
        return 1;
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
       never named is a difference too, and reading only the copy's names left it unread (audit fifty-seven §7). */
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

    // 6 · SAY SO ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const took = mmss(performance.now() - began);
    if (failed > 0) out(`FAIL ${record} · ${failed} of the copy's tables, lists and people did not come back as they were`);
    else out(`PASS ${record} · ${tables} tables and ${lists.copy.size} lists came back as the copy's manifest says, and ${reach.filter((p) => p.got !== 'suspended').length} people can open it`);
    out(`drill ${record} · ${rows} rows · ${sealed.length} bytes · restore ${took}`);
    return failed > 0 ? 1 : 0;
  } finally {
    cleanup();
  }
}

process.exitCode = await main();
