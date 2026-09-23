/**
 * `braindog init <slug> --from <file.brainl>`: a copy of a record, from this host or the Cloud, becomes the record this
 * host serves (ROADMAP W55-4, `loop/research-restore.md` sections 4 and 7).
 *
 * THERE WAS NO EMPTY RECORD TO PUT A COPY INTO. `init` creates the record with `createRecord`, which writes the owner,
 * two schedules, an event, a member and three keys, so an import after it answered `IMPORT_NOT_EMPTY` (measured,
 * section 3.4), and `init` had no flag that read a file at all: `init drill --from nightly.brainl` refused "needs an
 * owner", and with one made a new record under a new id (`test/restore-from.test.ts`, red at 1586f2a2).
 *
 * SO THE FILE IS THE RECORD. It is checked first, against itself and against `--key` when one is named; a file is
 * migrated to this build's tables and nothing else; the copy is imported into it, its own id and rows and keys; and only
 * then does the Directory name it, for the person the file says owns it, under that person's id. The order is `init`'s
 * for its reason (`51 §13 D21`): a Directory row never points at a record that failed to arrive.
 *
 * THE RECORD KEEPS THE NAME INSIDE THE FILE. The name typed here is the Directory's, and the record row is left as the
 * copy wrote it, because the proof that a restore is complete is that the record's next export has the copy's manifest
 * table for table, and a rewritten row would be a different file. `server.ts` answers under both names.
 *
 * THE VAULT OPENS ONLY UNDER THE ROOT KEY THAT WRAPPED IT. The keys are bound to the record id and wrapped by the host's
 * KEK (`12 §6`), so a copy from a host with another key file imports whole, its sealed credentials stay shut, and its
 * exports go out unsigned (measured, section 3.4). That is said in one sentence after the one that says it worked.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { checkBrainl } from '@braindog/kernel';
import { fixOf } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';
import { createDirectory } from '@braindog/record/directory';

import { lockDown, openKeyStore, unwrap, type Purpose } from './keys.ts';
import { openSqlite } from './server.ts';

/** What `init --from` did: the sentences to say, or the one sentence that refused. */
export type Restored = { ok: true; said: string[] } | { ok: false; said: string };

/** The rows of one table in a `.brainl` file, as objects by column name. `null` when the file has no such table. */
function rowsOf(lines: readonly string[], table: string): Record<string, unknown>[] | null {
  const at = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  if (at < 0) return null;
  const columns = (lines[at]!.slice(`#table ${table} `.length).split(' ')[0] ?? '').split(',');
  const out: Record<string, unknown>[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('#')) break;
    if (line.trim() === '') continue;
    const values: unknown = JSON.parse(line);
    if (Array.isArray(values)) out.push(Object.fromEntries(columns.map((c, i) => [c, values[i]])));
  }
  return out;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The first bytes of a file sealed with `age`, and of a SQLite database, which is what a self-host's own copy is. */
const AGE = 'age-encryption.org/';
const SQLITE = 'SQLite format 3\u0000';

export async function initFrom(o: {
  /** `BRAINDOG_DATA`. */
  data: string;
  slug: string;
  from: string;
  /** `--key`: the raw public key, in base64url, the copy must have been signed by. */
  key?: string | undefined;
  /** `--owner`: which of the copy's owners the Directory names, when it has more than one. */
  owner?: string | undefined;
  kekFile: string;
  now: () => number;
  say: (line: string) => void;
}): Promise<Restored> {
  const refused = (said: string): Restored => ({ ok: false, said });

  /* ── THE FILE FIRST, BEFORE ANYTHING IS MADE ────────────────────────────────────────────────────────────────────
     A copy that does not check costs nobody a name, a key file or a Directory. */
  let bytes: Buffer;
  try {
    bytes = readFileSync(o.from);
  } catch (e) {
    return refused(`${o.from} could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  const head = bytes.subarray(0, 32).toString('latin1');
  if (head.startsWith(AGE))
    return refused(`${o.from} is sealed with age. Open it first, age -d -i <your identity> ${o.from} > latest.brainl, and restore from that.`);
  if (head.startsWith(SQLITE))
    return refused(`${o.from} is a SQLite file, which is a self-host's own copy of a record and not a .brainl. Serve it where it is with braindog serve ${o.from}, or export a .brainl from the host that made it.`);
  const lines = bytes.toString('utf8').replace(/^﻿/u, '').split(/\r?\n/u);
  const checked = await checkBrainl(lines, o.key === undefined ? {} : { key: o.key });
  if (!checked.ok) return refused(`${o.from} was not restored (${checked.refusal.code}): ${checked.refusal.fix}`);

  let record: string;
  let owner: { id: string; email: string; name: string | null };
  try {
    record = text(rowsOf(lines, 'record')?.[0]?.id);
    const people = new Map((rowsOf(lines, 'person') ?? []).map((p) => [text(p.id), p]));
    const owners = (rowsOf(lines, 'member') ?? [])
      .filter((m) => m.register === '*' && m.level === 'owner')
      .map((m) => people.get(text(m.person_id)))
      .filter((p): p is Record<string, unknown> => p !== undefined && text(p.email).includes('@'))
      .map((p) => ({ id: text(p.id), email: text(p.email).trim().toLowerCase(), name: typeof p.name === 'string' ? p.name : null }));
    const wanted = o.owner?.trim().toLowerCase();
    const chosen = wanted === undefined || wanted === '' ? owners[0] : owners.find((p) => p.email === wanted);
    if (!record) return refused(`${o.from} carries no record row, so it cannot say which record it is. Restore from a whole copy.`);
    if (!chosen)
      return refused(
        wanted
          ? `${wanted} is not an owner of the record in ${o.from}. Its owners are ${owners.map((p) => p.email).join(', ') || 'nobody with an address'}.`
          : `${o.from} names no owner with an address, and a record nobody owns cannot be shared. Restore from a copy of a record somebody owns.`,
      );
    owner = chosen;
  } catch {
    /* `checkBrainl` has read every row against the manifest, so a line that is not JSON here would be a bug in one of
       the two readers, and it is still one sentence rather than a stack. */
    return refused(`${o.from} passed its check and its record row could not be read. Report it with the file's first line.`);
  }

  /* ── THE REFUSALS THAT NEED THIS HOST, STILL BEFORE THE RECORD IS WRITTEN ──────────────────────────────────────── */
  mkdirSync(o.data, { mode: 0o700, recursive: true });
  const store = await openKeyStore(o.kekFile, o.say);
  const dirFile = join(o.data, 'directory.sqlite');
  const dirSql = openSqlite(dirFile);
  lockDown(dirFile, o.say);
  const clock = { now: o.now };
  const directory = createDirectory(dirSql, clock);
  const dir = join(o.data, o.slug);
  const file = join(dir, 'record.brain');
  const refuse = (said: string): Restored => (dirSql.close(), refused(said));

  const wrong = directory.bad(o.slug);
  if (wrong) return refuse(wrong);
  const held = directory.claimed(o.slug);
  if (held === 'taken') return refuse(`${o.slug} is already somebody's record here.`);
  if (held === 'released')
    return refuse(`${o.slug} was the name of another record and cannot be given out again. Every link that still says it would read the wrong record.`);
  /* ONE RECORD, ONE FILE. Two names reaching two files that each say they are one record id is the tenant map lying, and
     the second import would be a second copy nobody could tell from the first. */
  if (directory.knows(record)) {
    const names = directory.namesOf(record).filter((n) => n.released_at === null).map((n) => n.slug);
    return refuse(`${record} is already served here as ${names.join(', ') || 'a record with no name'}. Serve that one, or restore into another data directory.`);
  }
  /* THE OWNER'S ID IS THE RECORD'S. A person the Directory already holds under another id would sign in as somebody the
     record's `member` table does not know, and every request of theirs would be refused. */
  const known = dirSql.one<{ id: string }>('SELECT id FROM dir_person WHERE lower(email) = lower(?)', owner.email);
  if (known && known.id !== owner.id)
    return refuse(
      `${owner.email} is already a person here under another id, and the record in ${o.from} names its owner by id, so they could not sign in to it. Restore it into another data directory.`,
    );
  /* AND THE SAME ID UNDER ANOTHER ADDRESS, asked here and not left to the insert below. Asked by address alone, a
     Directory holding the owner's id under the address they had before answered `UNIQUE constraint failed:
     dir_person.id` from that insert, after the record was imported, and left its folder behind to refuse the retry as
     "already exists" (`test/restore-from.test.ts`). */
  const sameId = known ? undefined : dirSql.one<{ email: string }>('SELECT email FROM dir_person WHERE id = ?', owner.id);
  if (sameId)
    return refuse(
      `The owner of the record in ${o.from}, ${owner.email}, is already a person here as ${sameId.email}. Restore it into another data directory, or change the address here back to ${owner.email} first.`,
    );
  if (existsSync(dir)) return refuse(`${dir} already exists. A record is restored into a name that holds nothing; move it aside or choose another.`);

  /* ── THE RECORD: A FILE MIGRATED TO THIS BUILD'S TABLES, AND THE COPY IMPORTED INTO IT ────────────────────────────
     Removed whole if anything after this refuses, because this command made every byte of it. */
  mkdirSync(join(dir, 'blobs'), { mode: 0o700, recursive: true });
  mkdirSync(join(dir, 'snapshots'), { mode: 0o700, recursive: true });
  const sql = openSqlite(file);
  lockDown(file, o.say);
  const undo = (said: string): Restored => {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
    return refuse(said);
  };
  const api = await createRecordApi({ sql, clock });
  const stopped = api.kernel.refused();
  if (stopped) return undo(`${file} could not be migrated: ${stopped.fix}`);
  const imported = await api.import({ lines }, { principal: { kind: 'system', id: 'restore' } });
  if (!imported.ok) return undo(`${o.from} was not restored: ${fixOf(imported)}`);

  /* ── AND THEN THE NAME ──────────────────────────────────────────────────────────────────────────────────────────
     `person$` mints an id, and the record names its owner by the one in the file, so the Directory's row is written with
     that id when the address is new here. */
  if (!known) dirSql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', owner.id, owner.email, owner.name, new Date(o.now()).toISOString());
  const named = directory.provision({ slug: o.slug, email: owner.email, record, plan: 'selfhost' });
  if (!named.ok) {
    /* THE PERSON THIS COMMAND WROTE GOES WITH THE RECORD IT WROTE. Left behind, the address would be a person here with
       nothing to reach, under the copy's id, and the next restore of a different copy for the same address would be
       refused as "already a person here under another id" by a row the refused restore made. */
    if (!known) dirSql.exec('DELETE FROM dir_person WHERE id = ?', owner.id);
    return undo(fixOf(named));
  }

  /* THE INBOUND TOKEN, as `init` writes it: a record made here takes forwarded mail, and so does one restored here. */
  const inbound = join(dir, 'inbound.token');
  writeFileSync(inbound, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });

  /* WHICH OF ITS KEYS THIS HOST'S ROOT KEY OPENS. Asked of the rows as they now are, through the same `unwrap` a request
     uses, so the sentence is the answer a request would get and not a guess from the file's `kek_id`. */
  const rows = sql.all<{ purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string | null; wrapped_by: string }>(
    "SELECT purpose, wrapped, nonce, kek_id, wrapped_by FROM vault_key WHERE purpose IN ('record', 'signing')",
  );
  const shut: { purpose: Purpose; kek: string }[] = [];
  for (const row of rows) {
    const opened =
      row.wrapped_by === 'kek' && row.kek_id !== null
        ? await unwrap(store, record, row.purpose, { wrapped: row.wrapped, nonce: row.nonce, kek_id: row.kek_id, wrapped_by: 'kek' })
        : null;
    if (opened) opened.fill(0);
    else shut.push({ purpose: row.purpose, kek: row.kek_id ?? row.wrapped_by });
  }
  sql.close();
  dirSql.close();

  const said = [`record ${o.slug} restored from ${o.from} · ${record} · owner ${owner.email}`];
  if (rows.length === 0)
    said.push(
      '  the copy carries no keys, so on this host the record seals nothing and exports unsigned. Restore from a copy exported with its sealed bytes to keep them.',
    );
  else if (shut.length > 0) {
    const vault = shut.some((s) => s.purpose === 'record');
    const signing = shut.some((s) => s.purpose === 'signing');
    const what = vault && signing ? 'its vault and its signing key were' : vault ? 'its vault was' : 'its signing key was';
    const costs = [...(vault ? ['its sealed credentials do not open'] : []), ...(signing ? ['what it exports goes out unsigned'] : [])].join(' and ');
    said.push(
      `  ${what} wrapped by another host’s root key, ${[...new Set(shut.map((s) => s.kek))].join(' and ')}. On this host ${costs}; serve it with that key file as BRAINDOG_KEK_FILE to open ${vault && signing ? 'them' : 'it'}.`,
    );
  }
  return { ok: true, said };
}
