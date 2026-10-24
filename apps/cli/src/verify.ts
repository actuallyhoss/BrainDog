/**
 * `braindog verify <file> [--key <pubkey|url>]`: a file checked on this machine, against a key you name.
 *
 * THERE WAS ONCE NO SUCH COMMAND, and the check it runs could be passed by a forgery. A probe took a
 * Cloud copy, changed its record's name, recomputed that table's hash, and signed it again with a key
 * made for the purpose: `checkBrainl` answered ok and the file imported. The key inside a file proves
 * that nothing changed since that key signed it and nothing about whose key it is. `--key` is where
 * the second fact comes from (`docs/48-SPEC-CLI.md` §5.6), and without it the block says so rather
 * than printing a tick that means less than it looks.
 *
 * OFFLINE, BUT FOR THE URL FORM OF `--key`, which is one GET the person asked for by typing it. The
 * file, the key and WebCrypto are the whole of the rest, so a copy can be checked on a machine that
 * has never signed in anywhere.
 *
 * A SEALED CLOUD COPY IS REFUSED BY WHAT IT IS, BEFORE ANY CHECK, because the check would answer it
 * with a sentence about damage that is not true: a `.brainl.age` is text nobody can read until
 * `age -d` opens it, and `checkBrainl` would call it `FILE_MALFORMED`.
 *
 * A SELF-HOST COPY IS CHECKED AGAINST THE SIGNATURE BESIDE IT. It is a SQLite `.brain`, the whole
 * file, and its `dog_sig` holds no row (§2.2 measured 0 rows), so the host signs it from outside:
 * `<copy>.brain.sig` holds the record's key and its signature over the file's SHA-256
 * (`apps/selfhost/src/snapshots.ts`). A copy with no `.sig` beside it is said to be unsigned, never
 * to be damaged, because "the signature does not verify" would send somebody looking for a
 * tampering that never happened.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { checkBrainl, keyIdOf } from '@braindog/kernel';

import { refuse } from './json.ts';
import type { AgentIo } from './skills.ts';

/**
 * `DOG!` AS A SQLite `application_id`, which is the number a real self-host file carries.
 *
 * NOT `48 §5.6`'s 1145193761. That decimal is `0x44424521`, the bytes `DBE!`, copied from `03 §2`'s
 * table into three documents; `packages/kernel/src/migrate.ts` writes the hex, `0x444F4721`, and
 * 1146046241 was read off a real self-host copy. Checked against the
 * spec's number, every self-host copy was "not a .brain file", which is exactly wrong.
 */
const APPLICATION_ID = 0x444f4721;

/** `03 §4`'s key: 32 raw Ed25519 bytes in base64url, which is 43 characters and no padding. */
const RAW_KEY = /^[A-Za-z0-9_-]{43}$/;

/** `docs/48-SPEC-CLI.md` §4.5's reply type for `verify`. */
export type Verified = {
  container: 'dog' | 'dogl';
  format: number;
  tables: number;
  rows: number;
  manifest: 'ok';
  signature: { valid: true; key_id: string; pinned: boolean };
  produced: { at: string; by: string };
  partial?: ('data' | 'origin' | 'governance')[];
};

export type VerifyIo = Pick<AgentIo, 'cwd' | 'out' | 'say' | 'answer'> & { fetch?: typeof fetch };

const USAGE =
  'braindog verify takes one file, and --key <pubkey|url> when you name the key it must be signed by, as in braindog verify latest.brainl --key https://app.brain.dog/.well-known/braindog-key.';

export async function verify(args: string[], io: VerifyIo): Promise<number> {
  let parsed: { values: { key?: string | undefined }; positionals: string[] };
  /* `--key <value>` IS JOINED INTO `--key=<value>` FIRST, because a key is base64url and one in 64 begins with `-`.
     `parseArgs` in strict mode reads `--key -Qx…` as an option with no value followed by an unknown flag and throws,
     so a real key got the usage line. CI 35930451270 drew such a key and went red on `verify.test.ts`'s forgery test,
     which passed on the desk only because its key happened not to. */
  const joined = args.flatMap((a, i) => (a === '--key' && i + 1 < args.length ? [] : args[i - 1] === '--key' && i > 0 ? [`--key=${a}`] : [a]));
  try {
    parsed = parseArgs({ args: joined, allowPositionals: true, strict: true, options: { key: { type: 'string' } } });
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [file, ...more] = parsed.positionals;
  if (file === undefined || more.length > 0) {
    io.say(USAGE);
    return 1;
  }

  /* THE KEY FIRST, because a mistyped key is the person's to fix and the file has nothing to say
     about it. */
  let key: string | undefined;
  if (parsed.values.key !== undefined) {
    const got = await keyFrom(parsed.values.key, io.fetch ?? fetch);
    if (typeof got !== 'string') {
      io.say(got.error);
      return 1;
    }
    key = got;
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(resolve(io.cwd, file));
  } catch (e) {
    /* A FILE THAT IS NOT THERE IS SAID SO (audit D, W8): "could not be read" left a person to guess at a typo or a lock. */
    io.say((e as { code?: unknown }).code === 'ENOENT' ? `There is no file at ${file}. Check the path, or run braindog export to make one.` : `${file} could not be read.`);
    return 1;
  }

  const kind = containerOf(bytes);
  if (kind === 'age') {
    io.say(
      `${file} is a sealed copy, and it has to be opened before it can be checked. Open it with age -d -i <your identity file> ${file} > copy.brainl, then run braindog verify copy.brainl.`,
    );
    return 1;
  }
  if (kind === 'selfhost') return verifyCopy(file, resolve(io.cwd, file), bytes, key, io);
  if (kind === 'sqlite') {
    io.say(`${file} is not a .brain file: it is a SQLite database, and not one BrainDog wrote.`);
    return 1;
  }

  const lines = bytes.toString('utf8').replace(/^﻿/, '').split(/\r?\n/);
  const checked = await checkBrainl(lines, { key });
  if (!checked.ok) return refuse(io, checked);

  const verified = describe(lines, checked.pinned);
  for (const line of block(verified)) io.out(line);
  io.answer?.({ value: verified });
  return 0;
}

/**
 * The format a self-host copy's `.sig` names. `apps/selfhost/src/snapshots.ts` writes it as `COPY_SIGNATURE`, and the
 * CLI cannot import the self-host, so the name and the bytes it signs are written again here and nowhere else.
 */
const COPY_SIGNATURE = 'braindog-copy-signature/1';

/** The bytes a copy's signature is over: the format, the record, and the copy's SHA-256, a line each. */
const copySigned = (record: string, sha256: string) => new TextEncoder().encode(`${COPY_SIGNATURE}\n${record}\n${sha256}\n`);

/**
 * A self-host copy checked against the `.sig` beside it, and against `--key` when one was named.
 *
 * THE SAME FOUR CHECKS A `.brainl` GETS, IN THE SAME ORDER: the bytes against the hash the signature is over, the key id
 * against the key, the signature under that key, and the key against the one named. Each refusal is
 * `SIGNATURE_INVALID` with its own sentence, because each is a different repair.
 */
async function verifyCopy(file: string, path: string, bytes: Buffer, key: string | undefined, io: VerifyIo): Promise<number> {
  let raw: string;
  try {
    raw = readFileSync(`${path}.sig`, 'utf8');
  } catch {
    io.say(
      `${file} is a self-host copy with no signature beside it (${file}.sig), so there is nothing to check it against. Copies taken before signing began, or by a record with no signing key, are unsigned. Take a new copy, or export a .brainl from the record and verify that instead.`,
    );
    return 1;
  }
  const no = (fix: string, at = `${file}.sig`): number => refuse(io, { ok: false, refusal: { code: 'SIGNATURE_INVALID', at, fix } });

  let s: Record<string, unknown>;
  try {
    s = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return no(`${file}.sig is not readable. Take a new copy to get a new signature.`);
  }
  const { format, record, sha256, key_id, public_key, sig, signed_at } = s;
  if (
    format !== COPY_SIGNATURE ||
    typeof record !== 'string' ||
    typeof sha256 !== 'string' ||
    typeof key_id !== 'string' ||
    typeof public_key !== 'string' ||
    !RAW_KEY.test(public_key) ||
    typeof sig !== 'string' ||
    typeof signed_at !== 'string'
  )
    return no(`${file}.sig is not a copy signature this build reads. Take a new copy, or update braindog.`);

  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    return no(`${file} has changed since it was signed: its bytes are not the ones its signature is over.`, file);

  const publicKey = new Uint8Array(Buffer.from(public_key, 'base64url'));
  if ((await keyIdOf(publicKey)) !== key_id) return no(`The key id in ${file}.sig is not the id of the key beside it. The signature has been edited.`);

  let valid = false;
  try {
    const verifier = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
    valid = await crypto.subtle.verify('Ed25519', verifier, new Uint8Array(Buffer.from(sig, 'base64url')), copySigned(record, sha256));
  } catch {
    valid = false;
  }
  if (!valid) return no(`The signature beside ${file} does not verify: the copy or its signature was changed after it was signed.`);

  /* A PINNED KEY IS COMPARED WHOLE. A copy re-signed by a key made for the purpose passes every check above, and this is
     the one that says it is not the record's. */
  const pinned = key !== undefined;
  if (pinned && key !== public_key)
    return no(`${file} is signed by key ${key_id}, which is not the key you named, so it is not a copy of the record you meant.`);

  const verified: Verified = {
    container: 'dog',
    /* `PRAGMA user_version`, the `.brain` format revision, is the big-endian integer at offset 60 of the header. */
    format: bytes.length >= 64 ? bytes.readUInt32BE(60) : 0,
    ...(await countsOf(path)),
    manifest: 'ok',
    signature: { valid: true, key_id, pinned },
    produced: { at: signed_at, by: record },
  };
  for (const line of block(verified)) io.out(line);
  io.answer?.({ value: verified });
  return 0;
}

/**
 * How many tables and rows a copy holds, read with the file opened read-only and immutable so checking it writes
 * nothing beside it. A copy SQLite will not open is counted as empty: its signature has already been checked.
 *
 * `node:sqlite` IS IMPORTED HERE, NOT AT THE TOP OF THE FILE, because `main.ts` imports `verify` statically for
 * every command this CLI runs. A top-level `import { DatabaseSync } from 'node:sqlite'` would load the experimental
 * module, and Node prints its `ExperimentalWarning` to stderr, on `braindog login` and every other command that
 * never touches a self-host copy. Loading it only when a copy is actually being counted keeps that warning off
 * everything else.
 */
async function countsOf(path: string): Promise<{ tables: number; rows: number }> {
  let db: DatabaseSync | undefined;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const at = pathToFileURL(path);
    at.searchParams.set('immutable', '1');
    db = new DatabaseSync(at, { readOnly: true });
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%'").all() as { name: string }[]).map(
      (t) => t.name,
    );
    let rows = 0;
    for (const name of names) rows += Number((db.prepare(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: number }).n);
    return { tables: names.length, rows };
  } catch {
    return { tables: 0, rows: 0 };
  } finally {
    db?.close();
  }
}

/**
 * The key `--key` names, as base64url, or the sentence that says why it names none.
 *
 * HTTPS ONLY, BUT FOR THIS MACHINE. A key fetched over plain HTTP is a key anybody on the path can
 * replace, and then the pin proves that the file matches the attacker's key, which is the forgery
 * this command exists to catch. Loopback is allowed because nothing crosses a network to reach it.
 *
 * AND EVERY ADDRESS IT IS SENT ON TO PASSES THE SAME TEST. A review found the test made once, on the
 * address typed, and `fetch` then left to follow redirects on its own: Node 24's `fetch`, asked an https address that
 * answers 302 to an http one, follows it and hands back the http answer with `redirected: true` (measured against a
 * local https server). So an https address was as good as an http one to anybody who could make it redirect, or who
 * sat on the path of the second request. The moves are followed here, one at a time, and the first one that fails
 * the test ends the read before that address is asked anything.
 */
async function keyFrom(given: string, get: typeof fetch): Promise<string | { error: string }> {
  if (RAW_KEY.test(given)) return given;
  const wrong = {
    error: '--key is a public key, 43 characters of base64url, or an https address that answers { "key_id", "public_key" }.',
  };
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return wrong;
  }
  if (!safe(url)) return wrong;

  let body: unknown;
  try {
    let res: Response;
    /* FIVE MOVES, which is more than any key address needs and far short of `fetch`'s twenty: a chain longer than
       that is an address nobody should be pinning to. */
    for (let moves = 0; ; moves++) {
      res = await get(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' }, redirect: 'manual' });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location === null) break;
      const next = new URL(location, url);
      if (!safe(next))
        return { error: `${url.origin} sent the request for the key on to ${next.href}, which is not https, so nothing was checked.` };
      if (moves === 5) return { error: `${given} moved more than five times, so nothing was checked.` };
      url = next;
    }
    if (!res.ok) return { error: `${url.origin} answered ${res.status} for the key, so nothing was checked.` };
    body = await res.json();
  } catch {
    return { error: `${url.origin} did not answer with a key, so nothing was checked.` };
  }
  const { key_id, public_key } = (body ?? {}) as { key_id?: unknown; public_key?: unknown };
  if (typeof public_key !== 'string' || !RAW_KEY.test(public_key))
    return { error: `${url.origin} answered, and not with a public key in base64url, so nothing was checked.` };
  /* THE ADDRESS'S OWN ID IS CHECKED AGAINST ITS KEY, for the reason `checkBrainl` recomputes a file's:
     an answer that names one key and carries another is a claim nobody checked. */
  if (typeof key_id === 'string' && key_id !== (await keyIdOf(new Uint8Array(Buffer.from(public_key, 'base64url')))))
    return { error: `${url.origin} answered a key whose id is not ${key_id}, so nothing was checked.` };
  return public_key;
}

/** https, or http to this machine: the one test every address a key is read from has to pass. */
function safe(url: URL): boolean {
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  return url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
}

/** What the first bytes say the file is. The name is not asked: a copy renamed is still what it is. */
function containerOf(bytes: Buffer): 'age' | 'selfhost' | 'sqlite' | 'text' {
  const head = bytes.subarray(0, 64).toString('latin1');
  if (head.startsWith('age-encryption.org/') || head.startsWith('-----BEGIN AGE ENCRYPTED FILE-----')) return 'age';
  if (head.startsWith('SQLite format 3\0'))
    /* `application_id` is the big-endian integer at offset 68 of the header, which is where
       `PRAGMA application_id` reads it from: no SQLite needed, and nothing opened for writing. */
    return bytes.length >= 72 && bytes.readUInt32BE(68) === APPLICATION_ID ? 'selfhost' : 'sqlite';
  return 'text';
}

/** One table's rows, out of a file that `checkBrainl` has already found sound. */
function rowsOf(lines: readonly string[], table: string): { columns: string[]; rows: unknown[][] } {
  const at = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  if (at < 0) return { columns: [], rows: [] };
  const columns = lines[at]!.slice(`#table ${table} `.length).trim().split(',');
  const rows: unknown[][] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    if (line.trim() !== '') rows.push(JSON.parse(line) as unknown[]);
  }
  return { columns, rows };
}

/** `48 §5.6`'s counts, read out of the file once it has passed. */
function describe(lines: readonly string[], pinned: boolean): Verified {
  const format = Number(lines.find((l) => l.trim() !== '')!.trim().slice('#dogl '.length));
  const manifest = rowsOf(lines, 'dog_manifest').rows as [string, number, string][];
  const listed = new Set(manifest.map(([name]) => name));
  const [, keyId, , , signedAt] = rowsOf(lines, 'dog_sig').rows[0] as string[];

  const record = rowsOf(lines, 'record');
  const id = record.rows[0]?.[record.columns.indexOf('id')];

  /* PARTIAL WHEN A TRAVELLING SECTION HAS A TABLE THE MANIFEST DOES NOT LIST, and then the sections
     it does carry are named (`48 §5.6` step 5). `header` is left out: `dog_manifest` and `dog_sig`
     are header tables no manifest can hold. */
  const present = new Set<string>();
  let missing = false;
  for (const [name, section] of rowsOf(lines, 'dog_section').rows as [string, string][]) {
    if (section === 'local' || section === 'header') continue;
    if (listed.has(name)) present.add(section);
    else missing = true;
  }
  const order = ['data', 'origin', 'governance'] as const;

  return {
    container: 'dogl',
    format,
    /* The manifest's rows, and the two tables it cannot hold: itself and `dog_sig`. */
    tables: manifest.length + 2,
    rows: manifest.reduce((sum, [, n]) => sum + n, 0),
    manifest: 'ok',
    signature: { valid: true, key_id: keyId!, pinned },
    produced: { at: signedAt!, by: typeof id === 'string' ? id : 'a record this file does not name' },
    ...(missing ? { partial: order.filter((s) => present.has(s)) } : {}),
  };
}

/** `48 §5.6`'s block: two cells a line, the second column at a fixed width so the ticks line up. */
function block(v: Verified): string[] {
  const pair = (a: string, b: string) => `  ${a.padEnd(32)}${b}`;
  const signature = v.signature.pinned
    ? `✓ signature valid, key ${v.signature.key_id} pinned`
    : `✓ signature valid (key ${v.signature.key_id} from the file; pass --key to pin)`;
  return [
    pair(`✓ ${v.container}`, `✓ format ${v.format}`),
    pair(`✓ ${v.tables} tables, ${v.rows.toLocaleString('en')} rows`, '✓ manifest hashes match'),
    `  ${signature}`,
    `  produced ${v.produced.at} by ${v.produced.by}`,
    ...(v.partial ? [`  partial: ${v.partial.join(', ')}`] : []),
  ];
}
