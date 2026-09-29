/**
 * `braindog init <slug> --from <file.brainl>`: a copy of a record, from this host or the Cloud, becomes the record this
 * host serves.
 *
 * THERE WAS NO EMPTY RECORD TO PUT A COPY INTO. `init` creates the record with `createRecord`, which writes the owner,
 * two schedules, an event, a member and three keys, so an import after it answered `IMPORT_NOT_EMPTY` (measured,
 * section 3.4), and `init` had no flag that read a file at all: `init drill --from nightly.brainl` refused "needs an
 * owner", and with one made a new record under a new id (`test/restore-from.test.ts`, red at 1586f2a2).
 *
 * SO THE FILE IS THE RECORD. It is checked first, against itself and against `--key` when one is named; a file is
 * migrated to this build's tables and nothing else; the copy is imported into it, its own id and rows and keys; and only
 * then does the Directory name it, for an owner the file names who is not suspended, and hold every other member under
 * the id the record knows them by. The order is `init`'s for its reason (`51 §13 D21`): a Directory row never points at
 * a record that failed to arrive.
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

/** One person the copy names, as the Directory would hold them, and whether the record has suspended them. */
type Person = { id: string; email: string; name: string | null; suspended: boolean };

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
  let owner: Person;
  /* EVERY OTHER PERSON THE RECORD HAS A `member` ROW FOR, with an address, and the ids of those without one. */
  let others: Person[];
  let unaddressed: string[];
  try {
    record = text(rowsOf(lines, 'record')?.[0]?.id);
    const people = new Map((rowsOf(lines, 'person') ?? []).map((p) => [text(p.id), p]));
    const addressed = (id: string): Person | null => {
      const p = people.get(id);
      if (p === undefined || !text(p.email).includes('@')) return null;
      return { id, email: text(p.email).trim().toLowerCase(), name: typeof p.name === 'string' ? p.name : null, suspended: text(p.suspended_at) !== '' };
    };
    const members = rowsOf(lines, 'member') ?? [];
    const owners = [...new Set(members.filter((m) => m.register === '*' && m.level === 'owner').map((m) => text(m.person_id)))]
      .map(addressed)
      .filter((p): p is Person => p !== null);
    /* A SUSPENDED OWNER IS NEVER CHOSEN WHEN NOBODY WAS NAMED. The record refuses every request of theirs, so naming them in
       the Directory as the owner restored a record whose one named person could not open it (she was
       `owners[0]` because her id sorted first). */
    const open = owners.filter((p) => !p.suspended);
    const wanted = o.owner?.trim().toLowerCase();
    const chosen = wanted === undefined || wanted === '' ? open[0] : owners.find((p) => p.email === wanted);
    if (!record) return refused(`${o.from} carries no record row, so it cannot say which record it is. Restore from a whole copy.`);
    if (!chosen)
      return refused(
        wanted
          ? `${wanted} is not an owner of the record in ${o.from}. Its owners are ${owners.map((p) => p.email).join(', ') || 'nobody with an address'}.`
          : owners.length > 0
            ? `Every owner of the record in ${o.from} is suspended there (${owners.map((p) => p.email).join(', ')}), so nobody could sign in to it. Lift one suspension on the host that made the copy and export it again.`
            : `${o.from} names no owner with an address, and a record nobody owns cannot be shared. Restore from a copy of a record somebody owns.`,
      );
    if (chosen.suspended)
      return refused(
        `${chosen.email} is suspended on the record in ${o.from}, so they could not sign in to it. ${open.length > 0 ? `Name an owner who is not: ${open.map((p) => p.email).join(', ')}.` : 'Every other owner is suspended too.'}`,
      );
    owner = chosen;
    const ids = [...new Set(members.map((m) => text(m.person_id)))].filter((id) => id !== owner.id);
    others = ids.map(addressed).filter((p): p is Person => p !== null);
    unaddressed = ids.filter((id) => addressed(id) === null);
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

  /* ── EVERYONE ELSE ON THE RECORD, ASKED OF THIS DIRECTORY BEFORE ANYTHING IS WRITTEN ─────────────────────────────
     MEASURED BEFORE THIS (`test/restore-members.test.ts`): only the owner got a `dir_person` row,
     so a second owner, a writer or a reader of one list who signed in here was minted a new id by `person$`, one no
     `member` row names, and the record refused them all. Each is written under the id the record knows them by, when
     this Directory does not already hold their address or their id as somebody else. One it does hold is left as it is
     and named in the closing sentence: rewriting that row would move every record they already reach here onto an id
     those records do not name, and refusing the whole restore would keep the record from the people who can open it. */
  const carried: (Person & { known: boolean })[] = [];
  const left: string[] = unaddressed.map((id) => `${id} has no address in the copy`);
  /* ONE ROW PER ADDRESS, AS THE DIRECTORY HOLDS THEM (`dir_person_email`). The record's `person` table can name one
     address twice, which a restore made before this one leaves behind when a member it could not carry was invited
     again under a fresh id; the second insert threw `UNIQUE constraint failed` and refused the whole restore
     (`test/restore-members.test.ts`). The first is carried and the other is named. */
  const taken = new Set([owner.email]);
  for (const p of others) {
    if (taken.has(p.email)) {
      left.push(`${p.id} has the address ${p.email}, which the copy names for somebody else too`);
      continue;
    }
    taken.add(p.email);
    const byAddress = dirSql.one<{ id: string }>('SELECT id FROM dir_person WHERE lower(email) = lower(?)', p.email);
    const byId = byAddress ? undefined : dirSql.one<{ email: string }>('SELECT email FROM dir_person WHERE id = ?', p.id);
    if (byAddress && byAddress.id !== p.id) left.push(`${p.email} is already a person here under another id`);
    else if (byId) left.push(`${p.email} is named by an id that is already ${byId.email} here`);
    else carried.push({ ...p, known: byAddress !== undefined });
  }

  if (existsSync(dir)) return refuse(`${dir} already exists. A record is restored into a name that holds nothing; move it aside or choose another.`);

  /* ── THE RECORD: A FILE MIGRATED TO THIS BUILD'S TABLES, AND THE COPY IMPORTED INTO IT ────────────────────────────
     Removed whole if anything after this refuses OR THROWS, because this command made every byte of it, and with it
     every Directory row it wrote. A throw used to leave the folder, and the retry was refused "already exists" by the
     half a failed run had made (`test/restore-members.test.ts`, with a clock that stops once the file exists). */
  let sql: ReturnType<typeof openSqlite> | null = null;
  let provisioned = false;
  const wrote: string[] = [];
  const undo = (said: string): Restored => {
    try {
      sql?.close();
    } catch {
      /* Already closed by the step that threw; the folder still goes. */
    }
    rmSync(dir, { recursive: true, force: true });
    if (provisioned) {
      /* THE NAME IS DELETED, NOT RELEASED. A tombstone keeps a name from being handed to somebody else after links to it
         went out, and nothing was ever served under this one: a release would cost the name typed for a restore that
         never happened. `knows(record)` was false above, so every row for this record id is this command's. */
      dirSql.exec('DELETE FROM dir_member WHERE record = ?', record);
      dirSql.exec('DELETE FROM dir_slug WHERE record = ? AND slug = ?', record, o.slug);
      dirSql.exec('DELETE FROM dir_record WHERE id = ?', record);
    }
    /* AND THE PEOPLE IT WROTE GO WITH THE RECORD IT WROTE. Left behind, an address would be a person here with nothing
       to reach, under the copy's id, and the next restore of a different copy for the same address would be refused as
       "already a person here under another id" by a row the refused restore made. */
    for (const id of wrote) dirSql.exec('DELETE FROM dir_person WHERE id = ?', id);
    return refuse(said);
  };

  let rows: { purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string | null; wrapped_by: string }[];
  const shut: { purpose: Purpose; kek: string }[] = [];
  try {
    mkdirSync(join(dir, 'blobs'), { mode: 0o700, recursive: true });
    mkdirSync(join(dir, 'snapshots'), { mode: 0o700, recursive: true });
    const opened = openSqlite(file);
    sql = opened;
    lockDown(file, o.say);
    const api = await createRecordApi({ sql: opened, clock });
    const stopped = api.kernel.refused();
    if (stopped) return undo(`${file} could not be migrated: ${stopped.fix}`);
    const imported = await api.import({ lines }, { principal: { kind: 'system', id: 'restore' } });
    if (!imported.ok) return undo(`${o.from} was not restored: ${fixOf(imported)}`);

    /* ── AND THEN THE NAME ────────────────────────────────────────────────────────────────────────────────────────
       `person$` mints an id, and the record names its people by the ones in the file, so each Directory row is written
       with that id when the address is new here. */
    const since = new Date(o.now()).toISOString();
    if (!known) {
      dirSql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', owner.id, owner.email, owner.name, since);
      wrote.push(owner.id);
    }
    const named = directory.provision({ slug: o.slug, email: owner.email, record, plan: 'selfhost' });
    if (!named.ok) return undo(fixOf(named));
    provisioned = true;
    for (const p of carried) {
      if (!p.known) {
        dirSql.exec('INSERT INTO dir_person (id, email, name, created_at) VALUES (?, ?, ?, ?)', p.id, p.email, p.name, since);
        wrote.push(p.id);
      }
      const joined = directory.join(record, p.id);
      if (!joined.ok) return undo(`${p.email} could not be given the record here: ${fixOf(joined)}`);
    }

    /* THE INBOUND TOKEN, as `init` writes it: a record made here takes forwarded mail, and so does one restored here. */
    writeFileSync(join(dir, 'inbound.token'), randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });

    /* WHICH OF ITS KEYS THIS HOST'S ROOT KEY OPENS. Asked of the rows as they now are, through the same `unwrap` a
       request uses, so the sentence is the answer a request would get and not a guess from the file's `kek_id`. */
    rows = opened.all<{ purpose: Purpose; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string | null; wrapped_by: string }>(
      "SELECT purpose, wrapped, nonce, kek_id, wrapped_by FROM vault_key WHERE purpose IN ('record', 'signing')",
    );
    for (const row of rows) {
      const key =
        row.wrapped_by === 'kek' && row.kek_id !== null
          ? await unwrap(store, record, row.purpose, { wrapped: row.wrapped, nonce: row.nonce, kek_id: row.kek_id, wrapped_by: 'kek' })
          : null;
      if (key) key.fill(0);
      /* A KEY BEHIND THE VAULT PASSPHRASE IS NOT SHUT: it opens here with the same passphrase, and no key file is missing. */
      else if (row.wrapped_by !== 'passphrase') shut.push({ purpose: row.purpose, kek: row.kek_id ?? row.wrapped_by });
    }
    opened.close();
    sql = null;
  } catch (e) {
    return undo(`${o.from} was not restored, and nothing this command wrote is left: ${e instanceof Error ? e.message : String(e)}`);
  }
  dirSql.close();

  const said = [`record ${o.slug} restored from ${o.from} · ${record} · owner ${owner.email}`];
  if (carried.length > 0)
    said.push(`  also here as the people the record names: ${carried.map((p) => (p.suspended ? `${p.email} (suspended on the record)` : p.email)).join(', ')}`);
  if (left.length > 0) said.push(`  not carried, so they cannot open it here: ${left.join('; ')}. Restore it into another data directory to carry them.`);
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
