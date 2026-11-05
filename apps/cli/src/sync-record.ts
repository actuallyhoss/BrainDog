/**
 * What every setup sync verb shares: the record reached as this machine's own sign-in, the Setup sync add-on's lists
 * found by what they declare, the sealed files the record keeps, this machine's own note of having joined, and the lock
 * two pushes take turns on (`docs/48-SPEC-CLI.md` §5.20).
 *
 * THE MACHINE'S OWN SIGN-IN, NEVER AN AGENT'S. The sealed files and the add-on's lists are personal: only the owner's
 * own session or his own plain or device key reaches them, and a token `setup` made for an agent app does not. So the
 * record is reached with the login `braindog login` kept, whatever app this command runs inside, and with no session
 * headers, so a sync names no run and opens none.
 *
 * THE SEALED FILES ARE FOUR RECORD METHODS, called by name through the same client every record method goes through:
 * `sealedPut { key, part, parts, bytes, sha256, size }`, `sealedGet { key, part }`, `sealedList { prefix? }` and
 * `sealedDelete { key }`. A file goes in parts of at most 4 MiB, at most eight of them and 25 MiB in all, each part
 * naming the SHA-256 of the whole sealed file. The host never sees what is inside: the bytes are sealed here first
 * (`sealer.ts`). A host older than the four answers that it has no such method, and every verb says to update it.
 *
 * WHERE THINGS ARE KEPT, by key: `sync/key` the sync key's copy under his passphrase; `carry/<n>/<version>` what thing
 * `n` of Carry held, one archive a version; `bundle/<machine>.<when>.<random>/manifest` each bundle's list of what it
 * holds, so a bundle is found by its machine and its time from the list of keys alone; `machine/<machine>/retired` a
 * machine retired, sealed, so a host cannot forge one.
 *
 * THIS MACHINE'S NOTE (`~/.braindog/sync.json`, 0600) holds, for each record by its host, the record's address, the
 * name this machine joined as, when it joined, pushed and last tried, the day claimed for the daily push, its last
 * bundle and what that bundle held, and the last bundle placed from each other machine. Names, times and keys of
 * sealed files: never a value, and never the sync key, which only the secret store keeps.
 */

import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { refused, type Result } from '@braindog/ports';

import { systemOf, type CarryKind, type System } from './carry.ts';
import { profilesIn } from './doctor.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { keyFromText, open } from './sealer.ts';
import { storeFor, syncKeyItem, type SecretStore } from './secret-store.ts';
import type { Git } from './sync.ts';
import { saidDay } from './said-day.ts';

type Env = Record<string, string | undefined>;

/** One record method, called with its arguments, and the record's answer. A test hands its own. */
export type Call = (method: string, args: Record<string, unknown>) => Promise<Result<unknown>>;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/* ── the record, as this machine ───────────────────────────────────────── */

/**
 * The record and this machine's own sign-in: `--host`, `BRAINDOG_HOST` or the default, with `BRAINDOG_TOKEN` or the
 * hosts file's login, and never the token `setup` made for an agent app. Throws one sentence when there is no host.
 */
export function ownTarget(host: string | undefined, env: Env): Target {
  return target(host, { ...env, BRAINDOG_AGENT: undefined, CLAUDECODE: undefined }, hostsPath(env));
}

/**
 * The one way a sync verb calls the record: the client every command uses, with no session headers, and a deadline
 * long enough for a 4 MiB part on a slow line, never shorter than the command's own budget allows. `quick` keeps to
 * the budget alone, for a read that sends nothing large.
 */
export function callerFor(to: Target, env: Env, quick = false): Call {
  const ms = quick ? budgetOf(env) : Math.max(budgetOf(env) * 3, 120_000);
  return (method, args) => clientFor(to, async () => ({}), AbortSignal.timeout(ms)).call(method, args);
}

/** How a call went wrong, said once by whichever verb made it. */
export type Fail = { fail: 'away' | 'older' | 'refused'; said: string };

/** The codes of a sign-in the sealed files and the personal lists do not take: an agent app's, a narrowed or a child key. */
const NOT_OWN = new Set(['FORBIDDEN', 'LEVEL_REQUIRED']);

/**
 * A refusal as a `Fail`, the record's own sentence when it sent one. A host with no such method is older than setup
 * sync (`ROUTE_UNKNOWN`); a self-host with nowhere to keep sealed files says why in its own words (`NOT_IN_THIS_BUILD`);
 * a sign-in that is not this machine's own is refused at the door (`FORBIDDEN`, `LEVEL_REQUIRED`); and a day's upload
 * allowance used up, shared with attachments, is the record's sentence (`RATE_LIMITED`).
 */
export function failOf(r: Result<unknown>, host: string): Fail {
  if (refused(r)) {
    const { code, fix } = r.refusal;
    if (code === 'UNREACHABLE') return { fail: 'away', said: `${host} did not answer.` };
    if (code === 'ROUTE_UNKNOWN') return { fail: 'older', said: `${host} does not keep sealed files yet. Update it, then try again.` };
    if (code === 'NOT_IN_THIS_BUILD') return { fail: 'older', said: `${host} cannot keep sealed files: ${fix.slice(0, 240)}` };
    if (NOT_OWN.has(code))
      return { fail: 'refused', said: `${host} refused this sign-in for setup sync, which takes this machine's own login and never an agent app's or a narrowed key. Run braindog login ${host} on this machine, and leave BRAINDOG_TOKEN unset.` };
    return { fail: 'refused', said: fix.slice(0, 300) };
  }
  return { fail: 'refused', said: 'Something changed under this command. Run it again.' };
}

export const isFail = (x: unknown): x is Fail => isObject(x) && typeof x.fail === 'string' && typeof x.said === 'string';

/**
 * The record's own address, which names its sync key: `boot`'s answer, else the last part of the host's address, else
 * its host name. Asked once, at join, and kept in this machine's note.
 */
export async function recordName(call: Call, to: Target): Promise<string> {
  const got = await call('boot', {});
  const said = got.ok && isObject(got.value) && isObject(got.value.record) && typeof got.value.record.slug === 'string' ? got.value.record.slug : '';
  const name = said !== '' ? said : (new URL(to.key).pathname.split('/').filter(Boolean).at(-1) ?? new URL(to.key).hostname);
  return name.toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 100) || 'record';
}

/* ── the add-on's lists ────────────────────────────────────────────────── */

/** A field of a list as `schemas` declares it. */
export type Field = { id: string; type?: unknown; to?: unknown; of?: unknown; required?: unknown; retired?: unknown };
/** A list as `schemas` declares it: its id, title field, role, closed states and fields. */
export type Decl = { id: string; title: string; role?: unknown; done?: unknown; fields: Field[] };

const isDecl = (x: unknown): x is Decl => isObject(x) && typeof x.id === 'string' && typeof x.title === 'string' && Array.isArray(x.fields);

/** The live field of a list by its id, or `undefined` for none or a retired one. */
export const fieldOf = (d: Decl, id: string): Field | undefined => d.fields.find((f) => f.id === id && f.retired !== true);

/** The Setup sync add-on's three lists: Carry by its role, and Bundles and Drills beside it, by the fields they hold. */
export type Lists = { carry: Decl; bundles: Decl | null; drills: Decl | null; all: Record<string, unknown> };

/**
 * The lists, found as `profile-place.ts` finds Places: Carry is the list that plays `role: carry`, and the add-on that
 * holds it says which of its other lists are Bundles (a machine, `host` as Profiles names one, and the sealed files)
 * and Drills (a machine and a grade). `none` when no list plays the role, which is a record without the add-on.
 */
export async function findLists(call: Call, host: string): Promise<Lists | 'none' | Fail> {
  const schemas = await call('schemas', { every: true });
  if (!schemas.ok) return failOf(schemas, host);
  const all = isObject(schemas.value) && isObject(schemas.value.lists) ? schemas.value.lists : {};
  const carry = Object.entries(all)
    .map(([id, d]) => (isObject(d) ? { ...d, id } : d))
    .find((d): d is Decl => isDecl(d) && d.role === 'carry');
  if (carry === undefined) return 'none';
  const packs = await call('packs', {});
  if (!packs.ok) return failOf(packs, host);
  const pack = (Array.isArray(packs.value) ? packs.value : []).find(
    (k): k is { registers: string[] } => isObject(k) && (k.disabled_at === null || k.disabled_at === undefined) && Array.isArray(k.registers) && k.registers.includes(carry.id),
  );
  const beside = (pack?.registers ?? [])
    .filter((id) => id !== carry.id)
    .map((id) => (isObject(all[id]) ? { ...(all[id] as object), id } : null))
    .filter(isDecl);
  const bundles = beside.find((d) => fieldOf(d, 'host') !== undefined && fieldOf(d, 'sealed') !== undefined) ?? null;
  const drills = beside.find((d) => fieldOf(d, 'host') !== undefined && fieldOf(d, 'grade') !== undefined) ?? null;
  return { carry, bundles, drills, all };
}

/** One row as `list` answers it. */
export type Row = { id: string; seq: number; version: number; state: string | null; fields: Record<string, unknown> };
const isRow = (x: unknown): x is Row => isObject(x) && typeof x.id === 'string' && typeof x.seq === 'number' && typeof x.version === 'number' && isObject(x.fields);

/** The most pages of one list read: a person's carried things, machines and drills fill a few. */
const PAGES = 20;

/** Every row of one list, a page at a time, or how it failed. */
export async function rowsOf(call: Call, register: string, host: string): Promise<Row[] | Fail> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES; page++) {
    const got = await call('list', { register, limit: 200, ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) return failOf(got, host);
    const value = got.value;
    if (!isObject(value) || !Array.isArray(value.rows)) return { fail: 'refused', said: `${host} answered a list in a way this command does not read.` };
    rows.push(...value.rows.filter(isRow).map((r) => ({ ...r, state: typeof r.state === 'string' ? r.state : null })));
    cursor = typeof value.cursor === 'string' && value.cursor !== '' ? value.cursor : null;
    if (cursor === null) break;
  }
  return rows;
}

/** How a write went: written, asked on Decide, or failed. */
export type Wrote = 'written' | 'asked' | Fail;

const wrote = (got: Result<unknown>, host: string): Wrote => (!got.ok ? failOf(got, host) : isObject(got.value) && isObject(got.value.asked) ? 'asked' : 'written');

/** Only the fields a list declares and keeps, so an older version of the add-on is never handed one it lacks. */
export const declared = (d: Decl, fields: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(fields).filter(([id]) => fieldOf(d, id) !== undefined));

/** A row made through the normal write path, so his settings and the ladder decide it as they decide any write. */
export async function createRow(call: Call, d: Decl, fields: Record<string, unknown>, host: string): Promise<Wrote> {
  return wrote(await call('create', { register: d.id, fields: declared(d, fields) }), host);
}

/** A row changed against the version read. */
export async function updateRow(call: Call, d: Decl, row: Row, patch: Record<string, unknown>, host: string): Promise<Wrote> {
  return wrote(await call('update', { register: d.id, seq: row.seq, patch: declared(d, patch), version: row.version }), host);
}

/* ── the sealed files ──────────────────────────────────────────────────── */

/** One part's most bytes, the most parts, and the most bytes in a whole sealed file (the contract's). */
export const PART_BYTES = 4 * 1024 * 1024;
export const MOST_PARTS = 8;
export const MOST_BYTES = 25 * 1024 * 1024;

/** One sealed file as `sealedList` names it. */
export type Sealed = { key: string; parts: number; size: number; sha256: string; complete: boolean; at: string };

const isSealed = (x: unknown): x is Sealed =>
  isObject(x) && typeof x.key === 'string' && typeof x.parts === 'number' && typeof x.size === 'number' && typeof x.sha256 === 'string' && typeof x.complete === 'boolean';

export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Every sealed file whose key starts with `prefix`, or how the call failed. */
export async function sealedList(call: Call, host: string, prefix?: string): Promise<Sealed[] | Fail> {
  const got = await call('sealedList', prefix === undefined ? {} : { prefix });
  if (!got.ok) return failOf(got, host);
  const files = isObject(got.value) && Array.isArray(got.value.files) ? got.value.files : [];
  return files.filter(isSealed).map((f) => ({ ...f, at: typeof f.at === 'string' ? f.at : '' }));
}

/**
 * A sealed file put, part by part from part 0, which the host takes first and which replaces a file kept under another
 * hash. Over 25 MiB is refused here before anything is sent. The last part's answer says `complete` only once the host
 * has read every part back and hashed it whole; a `CHECKSUM_MISMATCH` there is put again from part 0, once.
 */
export async function sealedPut(call: Call, host: string, key: string, sealed: Uint8Array): Promise<true | Fail> {
  if (sealed.length > MOST_BYTES) return { fail: 'refused', said: `It is ${String(Math.ceil(sealed.length / 1024 / 1024))} MB sealed, over the 25 MB one sealed file holds.` };
  const parts = Math.max(1, Math.ceil(sealed.length / PART_BYTES));
  const sha256 = sha256Of(sealed);
  for (let tries = 0; tries < 2; tries++) {
    let complete = false;
    let mismatch = false;
    for (let part = 0; part < parts; part++) {
      const bytes = Buffer.from(sealed.subarray(part * PART_BYTES, (part + 1) * PART_BYTES)).toString('base64');
      const got = await call('sealedPut', { key, part, parts, bytes, sha256, size: sealed.length });
      if (!got.ok) {
        if (refused(got) && got.refusal.code === 'CHECKSUM_MISMATCH') {
          mismatch = true;
          break;
        }
        return failOf(got, host);
      }
      complete = isObject(got.value) && got.value.complete === true;
    }
    if (complete) return true;
    if (!mismatch) break;
  }
  return { fail: 'refused', said: `${host} did not keep the sealed file whole. Run the command again.` };
}

/**
 * A sealed file read back whole, its parts in order, and held to the SHA-256 it was put with, or to `want` when the
 * caller knows what it should be. `null` when there is no such file, or what came back does not match.
 */
export async function sealedGet(call: Call, host: string, key: string, want?: string): Promise<Buffer | null | Fail> {
  const first = await call('sealedGet', { key, part: 0 });
  if (!first.ok) return refused(first) && first.refusal.code === 'NOT_FOUND' ? null : failOf(first, host);
  const v = first.value;
  if (!isObject(v) || typeof v.parts !== 'number' || typeof v.size !== 'number' || typeof v.sha256 !== 'string' || typeof v.bytes !== 'string') return null;
  if (!Number.isInteger(v.parts) || v.parts < 1 || v.parts > MOST_PARTS || v.size > MOST_BYTES) return null;
  const parts = [Buffer.from(v.bytes, 'base64')];
  for (let part = 1; part < v.parts; part++) {
    const got = await call('sealedGet', { key, part });
    if (!got.ok) return refused(got) && got.refusal.code === 'NOT_FOUND' ? null : failOf(got, host);
    if (!isObject(got.value) || typeof got.value.bytes !== 'string') return null;
    parts.push(Buffer.from(got.value.bytes, 'base64'));
  }
  const whole = Buffer.concat(parts);
  const sha = sha256Of(whole);
  return whole.length === v.size && sha === v.sha256 && (want === undefined || sha === want) ? whole : null;
}

/** A sealed file taken away, and whether it was there. */
export async function sealedDelete(call: Call, host: string, key: string): Promise<boolean | Fail> {
  const got = await call('sealedDelete', { key });
  if (!got.ok) return failOf(got, host);
  return isObject(got.value) && got.value.deleted === true;
}

/* ── keys of sealed files ──────────────────────────────────────────────── */

export const SYNC_KEY = 'sync/key';
export const carryKey = (seq: number, version: string): string => `carry/${String(seq)}/${version}`;
export const manifestKey = (id: string): string => `bundle/${id}/manifest`;
export const retiredKey = (slug: string): string => `machine/${slug}/retired`;

/** A machine's name as a key holds it: lower case, every run of anything but letters and digits one `-`. */
export const slugOf = (machine: string): string =>
  machine
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40) || 'machine';

/** A machine's name as a person gives it: one line, at most 64 characters, starting with a letter or a digit. */
export const MACHINE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} '\u2019._()-]{0,63}$/u;

/** When, as a bundle's id holds it: `yyyymmddhhmmss` in UTC. */
const stampOf = (now: number): string => new Date(now).toISOString().replace(/\D/gu, '').slice(0, 14);

/** A new bundle's id: the machine, when, and four random hex characters, so two at one second never share one. */
export const bundleId = (machine: string, now: number): string => `${slugOf(machine)}.${stampOf(now)}.${randomBytes(2).toString('hex')}`;

/** A bundle by its manifest's key: its id, its machine, and when it was made. */
export type BundleRef = { key: string; id: string; slug: string; at: string; complete: boolean };

const MANIFEST = /^bundle\/(([a-z0-9-]+)\.(\d{14})\.[0-9a-f]{4,16})\/manifest$/u;

/** Each machine's bundles, newest first, read off the keys alone. */
export function bundlesIn(files: readonly Sealed[]): Map<string, BundleRef[]> {
  const by = new Map<string, BundleRef[]>();
  for (const f of files) {
    const m = MANIFEST.exec(f.key);
    if (m === null) continue;
    const [, id = '', slug = '', stamp = ''] = m;
    const at = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`;
    by.set(slug, [...(by.get(slug) ?? []), { key: f.key, id, slug, at, complete: f.complete }]);
  }
  for (const list of by.values()) list.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return by;
}

/* ── a bundle's manifest ───────────────────────────────────────────────── */

/** One thing in a bundle: its number in Carry, its name and kind then, the sealed file it is in, and what it held. */
export type BundleRow = { seq: number; name: string; kind: CarryKind; key: string; sha256: string; files: number; size: number; runs: boolean; places?: Partial<Record<System, string>> };

/** What one bundle holds, sealed itself, so a host cannot change what a machine is told to place. */
export type Manifest = { v: 1; id: string; machine: string; system: System; at: string; rows: BundleRow[] };

const SYSTEMS = new Set(['mac', 'windows', 'linux']);
const KINDS = new Set(['files', 'env', 'patches', 'memory', 'sign_ins']);

/**
 * Where the machine that sealed a thing said it goes, each system's place as Carry held it then. A bundle from before
 * it was sealed has none, and its places are Carry's alone, as they always were.
 */
const sealedPlaces = (x: unknown): { places?: Partial<Record<System, string>> } => {
  if (!isObject(x)) return {};
  const places = Object.fromEntries(Object.entries(x).filter(([system, place]) => SYSTEMS.has(system) && typeof place === 'string')) as Partial<Record<System, string>>;
  return { places };
};

/** A manifest read, or `null` for anything out of shape. */
export function readManifest(x: unknown): Manifest | null {
  if (!isObject(x) || x.v !== 1 || typeof x.id !== 'string' || typeof x.machine !== 'string' || !SYSTEMS.has(String(x.system)) || typeof x.at !== 'string' || !Array.isArray(x.rows)) return null;
  const rows: BundleRow[] = [];
  for (const r of x.rows) {
    if (!isObject(r) || typeof r.seq !== 'number' || typeof r.name !== 'string' || !KINDS.has(String(r.kind)) || typeof r.key !== 'string' || typeof r.sha256 !== 'string') return null;
    if (!r.key.startsWith(`carry/${String(r.seq)}/`)) return null;
    rows.push({ seq: r.seq, name: r.name, kind: r.kind as CarryKind, key: r.key, sha256: r.sha256, files: typeof r.files === 'number' ? r.files : 0, size: typeof r.size === 'number' ? r.size : 0, runs: r.runs === true , ...sealedPlaces(r.places) });
  }
  return { v: 1, id: x.id, machine: x.machine, system: x.system as System, at: x.at, rows };
}

/** A bundle's manifest fetched and opened, or `null` when it is not there or does not open under this key. */
export async function openManifest(call: Call, host: string, key: Buffer, ref: BundleRef): Promise<Manifest | null | Fail> {
  const got = await sealedGet(call, host, ref.key);
  if (got === null || isFail(got)) return got;
  const bytes = open(key, ref.key, got);
  if (bytes === null) return null;
  try {
    const m = readManifest(JSON.parse(bytes.toString('utf8')));
    return m !== null && m.id === ref.id ? m : null;
  } catch {
    return null;
  }
}

/** A retired machine, as its sealed note says: its name and when. */
export type Retired = { machine: string; at: string };

/**
 * Every machine retired, by its key's name: each `machine/<name>/retired` opened under the sync key, so a note a host
 * made, or moved from another machine, is no note. A note that does not open is passed over, which leaves that machine
 * live: the safe way round, since a live machine's sign-ins are never moved.
 */
export async function retiredMachines(call: Call, host: string, key: Buffer): Promise<Map<string, Retired> | Fail> {
  const files = await sealedList(call, host, 'machine/');
  if (isFail(files)) return files;
  const out = new Map<string, Retired>();
  for (const f of files) {
    const m = /^machine\/([a-z0-9-]+)\/retired$/u.exec(f.key);
    if (m === null || !f.complete) continue;
    const got = await sealedGet(call, host, f.key);
    if (isFail(got)) return got;
    const bytes = got === null ? null : open(key, f.key, got);
    if (bytes === null) continue;
    try {
      const note: unknown = JSON.parse(bytes.toString('utf8'));
      if (isObject(note) && typeof note.machine === 'string' && typeof note.at === 'string' && note.slug === m[1]) out.set(m[1] ?? '', { machine: note.machine, at: note.at });
    } catch {
      /* Not a note. */
    }
  }
  return out;
}

/* ── this machine's note ───────────────────────────────────────────────── */

/** This machine's note for one record. */
export type Joined = {
  /** The record's address, which names the sync key in the secret store. */
  record: string;
  /** The name this machine joined as. */
  machine: string;
  joined: string;
  /** When it last sent a bundle, and when it last tried. */
  pushed?: string | undefined;
  tried?: string | undefined;
  /** The day the daily push was claimed for. */
  day?: string | undefined;
  /** Its last bundle, and the sealed key of each thing in it by its number. */
  bundle?: string | undefined;
  rows?: Record<string, string> | undefined;
  /** The last bundle placed here from each other machine, by that machine's key name. */
  placed?: Record<string, string> | undefined;
};

export const syncFile = (home: string): string => join(home, '.braindog', 'sync.json');

const isJoined = (x: unknown): x is Joined => isObject(x) && typeof x.record === 'string' && typeof x.machine === 'string' && typeof x.joined === 'string';

function readNote(home: string): Record<string, unknown> {
  try {
    const x: unknown = JSON.parse(readFileSync(syncFile(home), 'utf8'));
    return isObject(x) && isObject(x.records) ? x.records : {};
  } catch {
    return {};
  }
}

/** This machine's note for a record, by its host's key, or `null` when it has not joined. */
export function readJoined(home: string, host: string): Joined | null {
  const held = readNote(home)[host];
  return isJoined(held) ? held : null;
}

/** This machine's note for a record kept, or taken out with `null`; written whole and renamed, at 0600. */
export function keepJoined(home: string, host: string, value: Joined | null): void {
  const records = readNote(home);
  if (value === null) delete records[host];
  else records[host] = value;
  const file = syncFile(home);
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ v: 1, records }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/* ── the lock ──────────────────────────────────────────────────────────── */

/** How long a lock is held before it is read as left by a run that died. */
const LOCK_STALE_MS = 30 * 60_000;

/**
 * The lock two runs that write take turns on, made whole or not at all (`wx`), and its release; `null` while another run
 * holds it. One left by a run that died is taken over after half an hour.
 */
export function takeLock(home: string, now: number = Date.now()): (() => void) | null {
  const folder = join(home, '.braindog', 'locks');
  const file = join(folder, 'sync.lock');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = openSync(file, 'wx', 0o600);
      writeFileSync(fd, `${String(process.pid)}\n`);
      closeSync(fd);
      return () => {
        try {
          unlinkSync(file);
        } catch {
          /* Gone already. */
        }
      };
    } catch {
      try {
        if (existsSync(file) && now - statSync(file).mtimeMs > LOCK_STALE_MS) unlinkSync(file);
        else return null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* ── what every verb starts with ───────────────────────────────────────── */

/** What a sync verb needs from its process, passed in so a test can hold all of it. */
export type SyncIo = {
  env: Env;
  /** The folder `.braindog`, the profiles and every `~` place are under. */
  home: string;
  cwd: string;
  /** One line to stdout, and one to stderr. */
  out: (line: string) => void;
  say: (line: string) => void;
  /** Whether a person is at the terminal to answer: standard input and error both one, unless a test says. */
  terminal?: boolean | undefined;
  /** One y/N at the terminal, `null` when there is nobody to ask. */
  ask?: ((question: string) => Promise<boolean | null>) | undefined;
  /** One line typed and not shown, for a passphrase; `null` when there is nobody to ask. */
  hidden?: ((question: string) => Promise<string | null>) | undefined;
  /** The record, when a test holds it; the machine's own sign-in otherwise. */
  call?: Call | undefined;
  /** The secret store, when a test holds it; this system's otherwise. */
  store?: SecretStore | undefined;
  git?: Git | undefined;
  platform?: string | undefined;
  now?: (() => number) | undefined;
  signal?: AbortSignal | undefined;
};

/** Everything a verb has once the start went well. */
export type Ready = {
  to: Target;
  call: Call;
  joined: Joined;
  store: SecretStore;
  key: Buffer;
  lists: Lists;
  /** Each retired machine, by its key's name, as its sealed note says. */
  retired: Map<string, Retired>;
  system: System;
  /** This machine's agent app folders, for the hard lines: its profiles, and Codex's. */
  apps: string[];
};

/** The exit for a call that failed: 3 for a host that did not answer, 1 for anything else (`48 §4.4`). */
export const exitOf = (f: Fail): number => (f.fail === 'away' ? 3 : 1);

/**
 * The bundle a pull, a drill or `sync patches` reads: its machine by key name, its manifest, whether that machine is
 * retired, and this machine's own newest bundle beside it, for a pull to tell which copy of a thing is newer.
 */
export type Source = { slug: string; ref: BundleRef; manifest: Manifest; retired: boolean; mine: BundleRef | null };

/**
 * The bundle to read: the newest from the machine `from` names, else the newest from any other machine, retired or not,
 * or with `own` from any machine at all. Each machine's bundles are tried newest first until one opens under this
 * machine's key, so a half-written newest bundle is passed over for the one before it.
 */
export async function sourceBundle(r: Ready, from: string | undefined, o: { own?: boolean } = {}): Promise<Source | { none: string } | Fail> {
  const files = await sealedList(r.call, r.to.key, 'bundle/');
  if (isFail(files)) return files;
  const by = bundlesIn(files.filter((f) => f.complete));
  const me = slugOf(r.joined.machine);
  const mine = by.get(me)?.[0] ?? null;
  let slug: string | undefined;
  if (from !== undefined) {
    slug = slugOf(from);
    if (!by.has(slug)) return { none: `No machine called ${from} has sent a bundle to this BrainDog.` };
  } else
    slug = [...by]
      .filter(([s]) => o.own === true || s !== me)
      .map(([s, refs]) => ({ s, at: refs[0]?.id.split('.')[1] ?? '' }))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0]?.s;
  if (slug === undefined) return { none: o.own === true ? 'No machine has sent a bundle yet. Run braindog sync push first.' : 'No other machine has sent a bundle yet. Run braindog sync push on it first.' };
  for (const ref of by.get(slug) ?? []) {
    const manifest = await openManifest(r.call, r.to.key, r.key, ref);
    if (isFail(manifest)) return manifest;
    if (manifest !== null) return { slug, ref, manifest, retired: r.retired.has(slug), mine };
  }
  return { none: `The bundles from ${from ?? slug} do not open with this machine's sync key.` };
}

/**
 * The start every verb but `join` shares, in order, each with its one sentence and exit when it does not hold: a host
 * and a sign-in, this machine joined, the sync key in its secret store, the add-on installed, and this machine not
 * retired. A machine that finds itself retired forgets its key and its note at once, so it sends and places nothing
 * more, and says how to join again.
 */
export async function ready(io: SyncIo, host: string | undefined, verb: string): Promise<Ready | number> {
  let to: Target;
  try {
    to = ownTarget(host, io.env);
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  if (to.token === undefined && io.call === undefined) {
    io.say(`This machine is not signed in to ${to.key}. Run braindog login ${to.key}, then braindog sync join.`);
    return 1;
  }
  const joined = readJoined(io.home, to.key);
  if (joined === null) {
    io.say(`This machine has not joined setup sync on ${to.key}, so there is nothing to ${verb}. Run braindog sync join first.`);
    return 1;
  }
  const platform = io.platform ?? process.platform;
  const store = io.store ?? storeFor(platform);
  const held = await store.read(syncKeyItem(joined.record));
  if (!held.ok) {
    io.say(`${held.why} The sync key is kept there, so nothing was done.`);
    return 1;
  }
  const key = keyFromText(held.value);
  if (key === null) {
    io.say(`The sync key is not in ${store.name} on this machine. Run braindog sync join again, with the sync passphrase.`);
    return 1;
  }
  const call = io.call ?? callerFor(to, io.env);
  const lists = await findLists(call, to.key);
  if (lists === 'none') {
    io.say('Install the Setup sync plugin first: its Carry list says what each machine carries.');
    return 1;
  }
  if (isFail(lists)) {
    io.say(lists.said);
    return exitOf(lists);
  }
  const retired = await retiredMachines(call, to.key, key);
  if (isFail(retired)) {
    io.say(retired.said);
    return exitOf(retired);
  }
  const mine = retired.get(slugOf(joined.machine));
  if (mine !== undefined) {
    await store.remove(syncKeyItem(joined.record));
    keepJoined(io.home, to.key, null);
    io.say(
      `This machine was retired as ${joined.machine} on ${saidDay(mine.at)}, so it sends and places nothing more. Its sync key is gone from ${store.name}. To use it again, join under a new name with braindog sync join --name <name>.`,
    );
    return 1;
  }
  const env = io.env;
  const apps = [...profilesIn(io.home, [], env), env.CODEX_HOME || join(io.home, '.codex')];
  return { to, call, joined, store, key, lists, retired, system: systemOf(platform), apps };
}

/* ── what `sync inventory` says of it ──────────────────────────────────── */

/**
 * What setup sync keeps for a record this machine has joined, as `sync inventory` says it: each machine that has sent a
 * bundle, with its newest bundle's time and how many it sent, and the sealed files in all by count and size. Read off
 * the list of sealed files alone, so nothing is opened and the sync key is never asked for.
 */
export type SealedSeen =
  | { host: string; machine: string; machines: { slug: string; newest: string; bundles: number }[]; files: number; size: number }
  | { host: string; machine: string; unread: string };

/**
 * `SealedSeen` for the record `host` names, or `null` when this machine is not signed in to it or has not joined it.
 * One read, within the command's own budget; a record that does not answer is said, never thrown.
 */
export async function sealedSeen(host: string | undefined, env: Env, home: string, call?: Call): Promise<SealedSeen | null> {
  let to: Target;
  try {
    to = ownTarget(host, env);
  } catch {
    return null;
  }
  const joined = readJoined(home, to.key);
  if (joined === null || (to.token === undefined && call === undefined)) return null;
  const files = await sealedList(call ?? callerFor(to, env, true), to.key);
  if (isFail(files)) return { host: to.key, machine: joined.machine, unread: files.said };
  const machines = [...bundlesIn(files.filter((f) => f.complete))]
    .map(([slug, refs]) => ({ slug, newest: refs[0]?.at ?? '', bundles: refs.length }))
    .sort((a, b) => (a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0));
  return { host: to.key, machine: joined.machine, machines, files: files.length, size: files.reduce((n, f) => n + f.size, 0) };
}
