/**
 * Setup sync from end to end (`sync-join.ts`, `sync-push.ts`, `sync-pull.ts`, `sync-patches.ts`): machines joining with
 * the sync passphrase, one sealing what it carries, another placing it, a program asked about and pinned, tool sign-ins
 * moving only once their machine is retired, a drill, and a host that tries to change what is placed.
 *
 * THE RECORD IS HELD HERE, IN MEMORY, behind the one `Call` every verb takes: its lists are the Setup sync add-on's own
 * declarations read from `packs/setup-sync`, and its sealed files answer as the contract says (`sealedPut` part 0
 * first, `complete` once every part hashes right, `NOT_FOUND` for a file not there). The secret store is a map. Every
 * home is a temporary folder, so nothing of this machine's is read or written, and no real store is asked anything.
 *
 * `BRAINDOG_TEST_STORE=secret-service` RUNS THE SAME FLOW ON A REAL KEYRING, in a Linux container and nowhere
 * else: each machine keeps its items in the secret service through `secretService`, under a service name of its own
 * (`bd-test-<pid>-<n>-`), so two machines never read each other's key, and every item written is removed at the end.
 * `apps/cli/scripts/linux-keyring.sh` starts the container, its session bus and an unlocked keyring, and runs this file.
 *
 * Every name here is invented; the sign-ins are planted values.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Result } from '@braindog/ports';

import { shown } from '../src/doctor.ts';
import { hostKey } from '../src/http.ts';
import { pinsFile, readPins } from '../src/pins.ts';
import { keyFromText, open } from '../src/sealer.ts';
import { secretService, type Item, type SecretStore } from '../src/secret-store.ts';
import { unpack } from '../src/carry.ts';
import { syncJoin, syncRetire, type JoinIo } from '../src/sync-join.ts';
import { syncPatches } from '../src/sync-patches.ts';
import { syncDrill, syncPull } from '../src/sync-pull.ts';
import { startPush, syncPush } from '../src/sync-push.ts';
import { readJoined, sealedSeen, type Call } from '../src/sync-record.ts';
import { syncInventory } from '../src/sync.ts';
import { dayOf } from '../src/session-start.ts';

const HOST = hostKey('https://brain.example/the-bench');
const PASSPHRASE = 'a lantern by the harbour wall';
const SIGN_INS = JSON.stringify({ 'tracker|1a2b': { accessToken: 'at-planted-value', refreshToken: 'rt-planted-value', expiresAt: 1 } });
const KEY_ITEM = 'braindog-sync-key/the-bench';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-sync-flow-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const text = (file: string, body: string, mode?: number) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  if (mode !== undefined) chmodSync(file, mode);
};

/** One clock for every machine, moved on between pushes so each bundle has a time of its own. */
let now = Date.parse('2026-10-22T09:00:00.000Z');
const later = (ms = 60 * 60_000) => {
  now += ms;
};

/* ── the record ────────────────────────────────────────────────────────── */

type Row = { id: string; seq: number; version: number; state: string | null; fields: Record<string, unknown> };
type Kept = { parts: (Buffer | undefined)[]; sha256: string; size: number; at: string };
type Decl = { register?: string; rule?: string; title?: string; role?: string; fields?: unknown[] };

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** The add-on's lists as `schemas` answers them, from the file the add-on ships, and People beside them. */
function lists(): Record<string, unknown> {
  const doc = JSON.parse(readFileSync(new URL('../../../packs/setup-sync/setup-sync.pack.json', import.meta.url), 'utf8')) as { declarations: Decl[] };
  const out: Record<string, unknown> = { people: { title: 'name', fields: [{ id: 'name', type: 'text' }] } };
  for (const d of doc.declarations) if (d.register !== undefined && d.rule === undefined) out[d.register] = { title: d.title, role: d.role, fields: d.fields };
  return out;
}

/** The record a sync talks to, in memory: its rows by list, its sealed files by key, and the `Call` each verb takes. */
function fakeRecord() {
  const declared = lists();
  const rows = new Map<string, Row[]>();
  const files = new Map<string, Kept>();
  let seq = 0;
  const ok = (value: unknown): Result<unknown> => ({ ok: true, value });
  const no = (code: string, fix: string): Result<unknown> => ({ ok: false, refusal: { code, fix } });
  const add = (register: string, fields: Record<string, unknown>): Row => {
    seq++;
    const r: Row = { id: `r_${String(seq)}`, seq, version: 1, state: typeof fields.state === 'string' ? fields.state : null, fields: { ...fields } };
    rows.set(register, [...(rows.get(register) ?? []), r]);
    return r;
  };
  const whole = (f: Kept) => f.parts.every((p) => p !== undefined) && sha(Buffer.concat(f.parts as Buffer[])) === f.sha256;
  const call: Call = async (method, args) => {
    const a = args as Record<string, unknown>;
    switch (method) {
      case 'boot':
        return ok({ record: { slug: 'the-bench' } });
      case 'schemas':
        return ok({ lists: declared });
      case 'packs':
        return ok([{ id: 'setup-sync', version: '1.0.0', disabled_at: null, registers: ['carry', 'sync_bundles', 'sync_drills'] }]);
      case 'list':
        return ok({ rows: (rows.get(String(a.register)) ?? []).map((r) => structuredClone(r)), cursor: null });
      case 'create':
        return ok(structuredClone(add(String(a.register), a.fields as Record<string, unknown>)));
      case 'update': {
        const r = (rows.get(String(a.register)) ?? []).find((x) => x.seq === a.seq);
        if (r === undefined) return no('ROW_UNKNOWN', 'No such entry.');
        if (a.version !== undefined && a.version !== r.version) return no('VERSION_STALE', 'It changed since it was read.');
        const patch = a.patch as Record<string, unknown>;
        Object.assign(r.fields, patch);
        if (typeof patch.state === 'string') r.state = patch.state;
        r.version++;
        return ok(structuredClone(r));
      }
      case 'sealedPut': {
        const key = String(a.key);
        const part = Number(a.part);
        let f = files.get(key);
        if (part === 0 && (f === undefined || f.sha256 !== a.sha256)) {
          f = { parts: new Array<Buffer | undefined>(Number(a.parts)).fill(undefined), sha256: String(a.sha256), size: Number(a.size), at: new Date(now).toISOString() };
          files.set(key, f);
        }
        if (f === undefined) return no('OUT_OF_BOUNDS', 'Put part 0 first.');
        f.parts[part] = Buffer.from(String(a.bytes), 'base64');
        return ok({ key, part, parts: f.parts.length, complete: whole(f) });
      }
      case 'sealedGet': {
        const f = files.get(String(a.key));
        const p = f?.parts[Number(a.part)];
        if (f === undefined || !whole(f) || p === undefined) return no('NOT_FOUND', 'No sealed file is kept at that key.');
        return ok({ key: a.key, part: a.part, parts: f.parts.length, size: f.size, sha256: f.sha256, bytes: p.toString('base64') });
      }
      case 'sealedList': {
        const prefix = typeof a.prefix === 'string' ? a.prefix : '';
        return ok({ files: [...files].filter(([k]) => k.startsWith(prefix)).map(([k, f]) => ({ key: k, parts: f.parts.length, size: f.size, sha256: f.sha256, complete: whole(f), at: f.at })) });
      }
      case 'sealedDelete':
        return ok({ key: a.key, deleted: files.delete(String(a.key)) });
      default:
        return no('ROUTE_UNKNOWN', `There is no ${method}.`);
    }
  };
  /** A sealed file changed in place, its hash made to match, as a host could. */
  const tamper = (key: string, change: (b: Buffer) => Buffer) => {
    const f = files.get(key);
    assert.ok(f !== undefined, key);
    const bytes = change(Buffer.concat(f.parts as Buffer[]));
    files.set(key, { parts: [bytes], sha256: sha(bytes), size: bytes.length, at: f.at });
  };
  return { call, rows, files, add, tamper, of: (register: string) => rows.get(register) ?? [] };
}
type Record_ = ReturnType<typeof fakeRecord>;

/* ── a machine ─────────────────────────────────────────────────────────── */

/** Whether the flow runs on the real secret service (`apps/cli/scripts/linux-keyring.sh`) rather than a map. */
const REAL = process.env.BRAINDOG_TEST_STORE === 'secret-service';
let stores = 0;
const written: [SecretStore, Item][] = [];
after(async () => {
  for (const [store, item] of written) await store.remove(item);
});

/**
 * A store that keeps what it is handed, by service and account. ON A REAL KEYRING `held` is what this machine wrote and
 * did not remove, kept beside the keyring so a test reads it the same way, and every read goes to the keyring itself.
 */
function fakeStore(): SecretStore & { held: Map<string, string> } {
  const held = new Map<string, string>();
  const name = (i: Item) => `${i.service}/${i.account}`;
  if (REAL) {
    const real = secretService();
    const tag = `bd-test-${String(process.pid)}-${String(stores++)}-`;
    const own = (i: Item): Item => ({ ...i, service: `${tag}${i.service}` });
    return {
      held,
      name: real.name,
      read: async (i) => real.read(own(i)),
      write: async (i, v) => {
        const done = await real.write(own(i), v);
        if (done.ok) {
          held.set(name(i), v);
          written.push([real, own(i)]);
        }
        return done;
      },
      remove: async (i) => {
        const done = await real.remove(own(i));
        if (done.ok) held.delete(name(i));
        return done;
      },
    };
  }
  return {
    held,
    name: 'the test store',
    read: async (i) => ({ ok: true, value: held.get(name(i)) ?? null }),
    write: async (i, v) => {
      held.set(name(i), v);
      return { ok: true };
    },
    remove: async (i) => ({ ok: true, had: held.delete(name(i)) }),
  };
}

/** One machine: its home, what it printed, what it was asked, the answers it gives, and its store. */
function machine(record: Record_, platform = 'linux', terminal = true) {
  const home = newHome();
  const out: string[] = [];
  const said: string[] = [];
  const asked: string[] = [];
  const answers: (boolean | null)[] = [];
  const typed: string[] = [];
  const store = fakeStore();
  const io: JoinIo = {
    env: { BRAINDOG_HOST: HOST, XDG_CONFIG_HOME: join(home, '.config') },
    home,
    cwd: home,
    out: (line) => void out.push(line),
    say: (line) => void said.push(line),
    terminal,
    ask: async (q) => {
      asked.push(q);
      return answers.length > 0 ? (answers.shift() ?? null) : false;
    },
    hidden: async (q) => {
      asked.push(q);
      return typed.length > 0 ? (typed.shift() ?? null) : null;
    },
    call: record.call,
    store,
    platform,
    now: () => now,
  };
  const all = () => [...out, ...said].join('\n');
  const clear = () => {
    out.length = 0;
    said.length = 0;
    asked.length = 0;
  };
  return { home, io, out, said, asked, answers, typed, store, all, clear };
}
type Machine = ReturnType<typeof machine>;

/** A machine joined as `name`, the first making the key and every other opening it. */
async function joined(record: Record_, name: string, platform = 'linux'): Promise<Machine> {
  const m = machine(record, platform);
  m.typed.push(PASSPHRASE, PASSPHRASE);
  const code = await syncJoin(['--name', name], m.io);
  assert.equal(code, 0, m.all());
  m.clear();
  return m;
}

/** What thing `seq` holds in the newest sealed copy, opened with a machine's key: each file's place and text. */
function sealedOf(record: Record_, m: Machine, seq: number): [string, string][] {
  const key = keyFromText(m.store.held.get(KEY_ITEM) ?? null);
  assert.ok(key !== null);
  const names = [...record.files.keys()].filter((k) => k.startsWith(`carry/${String(seq)}/`));
  const newest = names.sort((x, y) => (record.files.get(x)?.at ?? '').localeCompare(record.files.get(y)?.at ?? '')).at(-1);
  assert.ok(newest !== undefined, `nothing sealed for ${String(seq)}`);
  const f = record.files.get(newest)!;
  const bytes = open(key, newest, Buffer.concat(f.parts as Buffer[]));
  assert.ok(bytes !== null);
  return (unpack(bytes)?.entries ?? []).map((e) => [e.path, e.bytes.toString('utf8')]);
}

/** The places of a thing on every system, so one Carry entry serves a Mac and Linux alike. */
const everywhere = (place: string) => ({ mac: place, linux: place });

/* ── joining ───────────────────────────────────────────────────────────── */

test('JOIN: the first machine makes the key, asked for a new passphrase twice; the next opens it; a wrong one three times keeps nothing', async () => {
  const record = fakeRecord();
  const a = machine(record);
  a.typed.push('first passphrase here', 'a second that differs', 'short', PASSPHRASE, PASSPHRASE);
  assert.equal(await syncJoin(['--name', 'Studio Mac'], a.io), 0, a.all());
  assert.match(a.said.join('\n'), /The two do not match/u);
  assert.match(a.said.join('\n'), /at least 12 characters/u);
  const key = a.store.held.get(KEY_ITEM) ?? '';
  assert.match(key, /^[0-9a-f]{64}$/u);
  /* THE RECORD HOLDS ONLY THE COPY SEALED UNDER THE PASSPHRASE, never the key. */
  const copy = Buffer.concat(record.files.get('sync/key')?.parts as Buffer[]);
  assert.ok(!copy.includes(Buffer.from(key)) && !copy.includes(Buffer.from(key, 'hex')), 'the key is in the record');
  assert.deepEqual(JSON.parse(copy.toString('utf8')).kdf, 'pbkdf2-sha256');
  assert.deepEqual([readJoined(a.home, HOST)?.record, readJoined(a.home, HOST)?.machine], ['the-bench', 'Studio Mac']);
  assert.match(a.out.join('\n'), /nothing sealed can be opened again/u);

  const b = machine(record);
  b.typed.push(PASSPHRASE);
  assert.equal(await syncJoin(['--name', 'Field Laptop'], b.io), 0, b.all());
  assert.equal(b.store.held.get(KEY_ITEM), key, 'the second machine holds another key');
  assert.deepEqual(b.asked, ['Sync passphrase: ']);

  const c = machine(record);
  c.typed.push('the wrong passphrase', 'still the wrong one', 'wrong a third time');
  assert.equal(await syncJoin(['--name', 'Spare'], c.io), 1);
  assert.equal(c.store.held.size, 0);
  assert.equal(readJoined(c.home, HOST), null);
  assert.match(c.said.join('\n'), /does not open the sync key, so this machine did not join/u);

  /* JOINED ALREADY IS SAID, AND A MACHINE WITH NOBODY AT ITS TERMINAL JOINS NOTHING. */
  a.clear();
  assert.equal(await syncJoin([], a.io), 0);
  assert.match(a.out.join('\n'), /has joined setup sync on .* already, as Studio Mac/u);
  const d = machine(record, 'linux', false);
  assert.equal(await syncJoin(['--name', 'Server'], d.io), 1);
  assert.match(d.said.join('\n'), /at a terminal/u);
  /* AND THE PASSPHRASE IS NEVER AN ARGUMENT: a flag this verb does not take is refused without being quoted. */
  const e = machine(record);
  assert.equal(await syncJoin(['--passphrase', PASSPHRASE], e.io), 1);
  assert.ok(!e.all().includes(PASSPHRASE));
});

/* ── pushing ───────────────────────────────────────────────────────────── */

test('PUSH: each thing sealed once, one bundle and its Bundles entry; nothing changed sends nothing; a change sends only itself', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const context = record.add('carry', { name: 'Context folder', kind: 'files', ...everywhere('~/.claude/context'), state: 'on' });
  const programs = record.add('carry', { name: 'Local programs', kind: 'files', ...everywhere('~/.local/bin'), runs: true, state: 'on' });
  record.add('carry', { name: 'Auto memory', kind: 'memory', ...everywhere('~/.claude/projects'), state: 'off' });
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is\n');
  text(join(a.home, '.local', 'bin', 'tidy'), '#!/bin/sh\necho tidy\n', 0o755);

  assert.equal(await syncPush([], a.io), 0, a.all());
  assert.match(a.out.join('\n'), /Auto memory: off, so it is not carried/u);
  const sealed = [...record.files.keys()];
  assert.equal(sealed.filter((k) => k.startsWith('carry/')).length, 2);
  assert.equal(sealed.filter((k) => /^bundle\/studio-mac\.\d{14}\.[0-9a-f]{4}\/manifest$/u.test(k)).length, 1);
  for (const [k, f] of record.files) assert.ok(!Buffer.concat(f.parts as Buffer[]).includes(Buffer.from('what each project is')), `${k} holds the bytes in the clear`);
  assert.deepEqual(sealedOf(record, a, context.seq), [['01-projects.md', 'what each project is\n']]);
  assert.deepEqual(sealedOf(record, a, programs.seq), [['tidy', '#!/bin/sh\necho tidy\n']]);
  const [first] = record.of('sync_bundles');
  assert.ok(first !== undefined);
  assert.deepEqual([first.fields.host, first.state, first.fields.files, first.fields.kept], ['Studio Mac', 'latest', 2, 'whole']);
  assert.equal((first.fields.sealed as string[]).length, 2);
  assert.ok(!JSON.stringify(first.fields).includes('what each project is'), 'the entry holds a file');

  /* NOTHING CHANGED: NO BUNDLE, AND THE LATEST ENTRY'S CHECKED TIME MOVES. */
  later();
  a.clear();
  assert.equal(await syncPush([], a.io), 0, a.all());
  assert.match(a.out.join('\n'), /Nothing changed since the last bundle/u);
  assert.equal(record.files.size, sealed.length, 'a file was sent again');
  assert.equal(record.of('sync_bundles').length, 1);
  assert.equal(record.of('sync_bundles')[0]?.fields.heard, new Date(now).toISOString());

  /* ONE FILE CHANGED: ONLY ITS THING IS SENT, AND THE NEW ENTRY IS THE LATEST. */
  later();
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is, and who it is for\n');
  a.clear();
  assert.equal(await syncPush([], a.io), 0, a.all());
  assert.equal([...record.files.keys()].filter((k) => k.startsWith('carry/')).length, 3);
  assert.match(a.out.join('\n'), /Local programs: 1 file, .*, sealed already/u);
  assert.deepEqual(
    record.of('sync_bundles').map((r) => r.state),
    ['older', 'latest'],
  );
  /* A DRY RUN SEALS AND SENDS NOTHING. */
  later();
  text(join(a.home, '.claude', 'context', '02-new.md'), 'new\n');
  const before = record.files.size;
  a.clear();
  assert.equal(await syncPush(['--dry-run'], a.io), 0, a.all());
  assert.equal(record.files.size, before);
  assert.match(a.out.join('\n'), /would be sealed and sent/u);
});

test("PUSH HOLDS THE HARD LINES: an agent app's login and auto memory refused, transcripts never listed, a login copy dropped", async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  record.add('carry', { name: 'Claude login', kind: 'files', ...everywhere('~/.claude/.credentials.json'), state: 'on' });
  record.add('carry', { name: 'Auto memory', kind: 'memory', ...everywhere('~/.claude/projects'), state: 'on' });
  const profile = record.add('carry', { name: 'Profile folder', kind: 'files', ...everywhere('~/.claude'), state: 'on' });
  text(join(a.home, '.claude', 'CLAUDE.md'), 'Keep answers short.\n');
  text(join(a.home, '.claude', '.credentials.json'), '{"planted":"login"}\n');
  text(join(a.home, '.claude', 'projects', '-work-shop', 'session.jsonl'), '{"planted":"transcript"}\n');
  text(join(a.home, '.claude', 'backup.json'), '{"claudeAiOauth":{"planted":"login under another name"}}\n');

  assert.equal(await syncPush([], a.io), 1, 'a refusal is no clean push');
  const said = a.out.join('\n');
  assert.match(said, /Claude login: refused, an agent app's own login/u);
  assert.match(said, /Auto memory: refused, auto memory waits on your yes/u);
  assert.match(said, /Refused, session transcripts, which are never read and never carried: ~.\.claude.projects/u);
  assert.match(said, /Refused, an agent app's own login, which BrainDog never reads, holds or moves: .*backup\.json/u);
  assert.deepEqual(sealedOf(record, a, profile.seq), [['CLAUDE.md', 'Keep answers short.\n']]);
  for (const f of record.files.values()) for (const planted of ['planted', 'transcript']) assert.ok(!Buffer.concat(f.parts as Buffer[]).includes(Buffer.from(planted)));
});

/* ── pulling ───────────────────────────────────────────────────────────── */

test('PULL: data placed, a program shown whole and asked, a yes pinned; a no waits and is written on its thing in Carry', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  record.add('carry', { name: 'Context folder', kind: 'files', ...everywhere('~/.claude/context'), state: 'on' });
  const programs = record.add('carry', { name: 'Local programs', kind: 'files', ...everywhere('~/.local/bin'), runs: true, state: 'on' });
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is\n');
  text(join(a.home, '.local', 'bin', 'tidy'), '#!/bin/sh\necho tidy\n', 0o755);
  assert.equal(await syncPush([], a.io), 0, a.all());

  const tidy = join(b.home, '.local', 'bin', 'tidy');
  const where = shown(tidy, b.home);
  b.answers.push(true);
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.equal(readFileSync(join(b.home, '.claude', 'context', '01-projects.md'), 'utf8'), 'what each project is\n');
  assert.equal(readFileSync(tidy, 'utf8'), '#!/bin/sh\necho tidy\n');
  if (process.platform !== 'win32') assert.equal(statSync(tidy).mode & 0o777, 0o755);
  assert.deepEqual(b.asked, [`Place ${where} on this machine? It runs a program. [y/N] `]);
  assert.ok(b.out.some((line) => line.trim() === 'echo tidy'), 'the program was not shown whole');
  const pins = Object.values(readPins(pinsFile(b.home)) ?? {});
  assert.deepEqual(pins.map((p) => [p.name, p.kind, p.profiles]), [[where, 'carry', ['Local programs']]]);

  /* THE SAME AGAIN IS ALREADY HERE, AND ASKS NOTHING. */
  b.clear();
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.deepEqual(b.asked, []);
  assert.match(b.out.join('\n'), /already here/u);

  /* A CHANGED PROGRAM IS ASKED ABOUT AGAIN; A NO LEAVES IT, AND CARRY SAYS IT WAITS ON THIS MACHINE. */
  later();
  text(join(a.home, '.local', 'bin', 'tidy'), '#!/bin/sh\necho tidier\n', 0o755);
  assert.equal(await syncPush([], a.io), 0, a.all());
  b.clear();
  b.answers.push(false);
  assert.equal(await syncPull([], b.io), 1);
  assert.equal(readFileSync(tidy, 'utf8'), '#!/bin/sh\necho tidy\n');
  assert.deepEqual(record.of('carry').find((r) => r.seq === programs.seq)?.fields.waits, ['Field Laptop']);

  /* WITH NOBODY AT THE TERMINAL, --yes-data PLACES THE DATA AND STILL LEAVES THE PROGRAM. */
  later();
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is, and who it is for\n');
  assert.equal(await syncPush([], a.io), 0, a.all());
  const quiet = { ...b.io, terminal: false };
  b.clear();
  assert.equal(await syncPull([], quiet), 1, 'without --yes-data the run is its plan');
  assert.equal(readFileSync(join(b.home, '.claude', 'context', '01-projects.md'), 'utf8'), 'what each project is\n');
  assert.match(b.out.join('\n'), /Nothing was placed, because no one is at a terminal/u);
  b.clear();
  assert.equal(await syncPull(['--yes-data'], quiet), 1);
  assert.equal(readFileSync(join(b.home, '.claude', 'context', '01-projects.md'), 'utf8'), 'what each project is, and who it is for\n');
  assert.equal(readFileSync(tidy, 'utf8'), '#!/bin/sh\necho tidy\n');
  assert.deepEqual(b.asked, []);
  /* THE FILE IT REPLACED IS KEPT ASIDE UNDER ~/.braindog, never beside itself. */
  assert.ok(!existsSync(`${join(b.home, '.claude', 'context', '01-projects.md')}.bak`));
  assert.match(b.out.join('\n'), /The files replaced here are kept in ~.\.braindog.sync-kept/u);

  /* A YES AT LAST PLACES IT, AND IT NO LONGER WAITS. */
  b.clear();
  b.answers.push(true);
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.equal(readFileSync(tidy, 'utf8'), '#!/bin/sh\necho tidier\n');
  assert.deepEqual(record.of('carry').find((r) => r.seq === programs.seq)?.fields.waits, []);
  assert.equal(Object.keys(readPins(pinsFile(b.home)) ?? {}).length, 1, 'the new version replaced the old pin');
});

test("PULL ASKS BY NAME FOR SOMEBODY ELSE'S ACCOUNT, and advises signing in again; a no leaves it", async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  const sam = record.add('people', { name: 'Sam Rivera' });
  record.add('carry', { name: 'Client cloud login', kind: 'files', ...everywhere('~/.client-cloud'), whose: sam.id, state: 'on' });
  text(join(a.home, '.client-cloud', 'config'), 'tenant = example\n');
  assert.equal(await syncPush([], a.io), 0, a.all());
  b.answers.push(false);
  assert.equal(await syncPull([], b.io), 1);
  assert.match(b.asked[0] ?? '', /^Client cloud login is Sam Rivera's account\. Signing in again on this machine is better than moving it/u);
  assert.ok(!existsSync(join(b.home, '.client-cloud', 'config')));
  b.clear();
  b.answers.push(true);
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.equal(readFileSync(join(b.home, '.client-cloud', 'config'), 'utf8'), 'tenant = example\n');
});

test('TOOL SIGN-INS MOVE ONLY FROM A RETIRED MACHINE, never over sign-ins held here, and a retired machine forgets its key', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac', 'darwin');
  const b = await joined(record, 'Field Laptop');
  record.add('carry', { name: 'Tool sign-ins', kind: 'sign_ins', mac: 'keychain:ccenv-mcp-auth/rowan', linux: '~/.ccenv/shared/mcp-auth.json', state: 'on' });
  assert.deepEqual(await a.store.write({ service: 'ccenv-mcp-auth', account: 'rowan' }, SIGN_INS), { ok: true });
  assert.equal(await syncPush([], a.io), 0, a.all());
  for (const f of record.files.values()) assert.ok(!Buffer.concat(f.parts as Buffer[]).includes(Buffer.from('rt-planted-value')), 'a sign-in in the clear');

  const file = join(b.home, '.ccenv', 'shared', 'mcp-auth.json');
  assert.equal(await syncPull([], b.io), 1, 'a live machine keeps its sign-ins');
  assert.ok(!existsSync(file));
  assert.match(b.out.join('\n'), /stays on Studio Mac while it is live/u);

  /* RETIRED FROM ANOTHER MACHINE: a sealed note, and its Bundles entry marked so. */
  b.clear();
  assert.equal(await syncRetire(['Studio Mac', '--yes'], b.io), 0, b.all());
  assert.ok(record.files.has('machine/studio-mac/retired'));
  assert.deepEqual(record.of('sync_bundles').map((r) => [r.fields.host, r.state]), [['Studio Mac', 'retired']]);

  b.clear();
  b.answers.push(true);
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.match(b.asked[0] ?? '', /^Move the tool sign-ins Studio Mac carried to this machine\?/u);
  assert.equal(readFileSync(file, 'utf8'), SIGN_INS);
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);

  /* SIGN-INS THIS MACHINE HOLDS ALREADY ARE NEVER WRITTEN OVER. */
  writeFileSync(file, '{"its own":true}');
  b.clear();
  assert.equal(await syncPull([], b.io), 1);
  assert.equal(readFileSync(file, 'utf8'), '{"its own":true}');

  /* THE RETIRED MACHINE SENDS NOTHING MORE, AND ITS KEY IS GONE FROM ITS STORE. */
  a.clear();
  assert.equal(await syncPush([], a.io), 1);
  assert.match(a.said.join('\n'), /This machine was retired as Studio Mac/u);
  assert.equal(a.store.held.has(KEY_ITEM), false);
  assert.equal(readJoined(a.home, HOST), null);

  /* AND ITS NAME IS NEVER JOINED AGAIN. */
  const c = machine(record);
  c.typed.push(PASSPHRASE);
  assert.equal(await syncJoin(['--name', 'Studio Mac'], c.io), 1);
  assert.match(c.said.join('\n'), /retired on .* never used again/u);
});

test('RETIRING THIS MACHINE removes its key at once and asks before removing the tool sign-ins it holds', async () => {
  const record = fakeRecord();
  const b = await joined(record, 'Field Laptop');
  record.add('carry', { name: 'Tool sign-ins', kind: 'sign_ins', linux: '~/.ccenv/shared/mcp-auth.json', mac: 'keychain:ccenv-mcp-auth/rowan', state: 'on' });
  const file = join(b.home, '.ccenv', 'shared', 'mcp-auth.json');
  text(file, SIGN_INS);
  b.answers.push(true);
  assert.equal(await syncRetire(['Field Laptop', '--yes'], b.io), 0, b.all());
  assert.equal(b.store.held.has(KEY_ITEM), false);
  assert.equal(readJoined(b.home, HOST), null);
  assert.ok(!existsSync(file), 'the sign-ins stayed after a yes');
  assert.deepEqual(record.of('sync_bundles').map((r) => [r.fields.host, r.state]), [['Field Laptop', 'retired']]);
  assert.match(b.out.join('\n'), /sign out of each tool/u);
});

/* ── a host that tries ─────────────────────────────────────────────────── */

test('A HOST CANNOT CHANGE WHAT IS PLACED: a changed sealed file is not placed, and a forged bundle does not open', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  const context = record.add('carry', { name: 'Context folder', kind: 'files', ...everywhere('~/.claude/context'), state: 'on' });
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is\n');
  assert.equal(await syncPush([], a.io), 0, a.all());
  const carried = [...record.files.keys()].find((k) => k.startsWith(`carry/${String(context.seq)}/`))!;
  const original = Buffer.concat(record.files.get(carried)!.parts as Buffer[]);
  record.tamper(carried, (bytes) => {
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    return changed;
  });
  assert.equal(await syncPull([], b.io), 1);
  assert.match(b.out.join('\n'), /Context folder: not placed, because its sealed file is not in your BrainDog as the bundle names it/u);
  assert.ok(!existsSync(join(b.home, '.claude', 'context', '01-projects.md')));

  /* A BUNDLE THE HOST MADE UP, ITS HASH MATCHING, OPENS UNDER NO MACHINE'S KEY. */
  record.tamper(carried, () => original);
  const manifest = [...record.files.keys()].find((k) => k.startsWith('bundle/'))!;
  record.tamper(manifest, () => Buffer.concat([Buffer.from('BDS1'), Buffer.alloc(64, 1)]));
  b.clear();
  assert.equal(await syncPull([], b.io), 1);
  assert.match(b.out.join('\n'), /do not open with this machine's sync key/u);
  assert.ok(!existsSync(join(b.home, '.claude', 'context', '01-projects.md')));
});

/* ── the drill ─────────────────────────────────────────────────────────── */

test('A HOST CANNOT SAY A SEALED PROGRAM IS NOT ONE: Carry turned to runs off still shows it whole and asks', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  const row = record.add('carry', { name: 'Shell setup', kind: 'files', ...everywhere('~/.config/shellrc'), runs: true, state: 'on' });
  /* NO RUN BIT, so the sealed word is all that says it is a program. */
  text(join(a.home, '.config', 'shellrc', 'startup.sh'), 'echo starting\n', 0o644);
  assert.equal(await syncPush([], a.io), 0, a.all());

  row.fields.runs = false;
  const placed = join(b.home, '.config', 'shellrc', 'startup.sh');
  assert.equal(await syncPull([], b.io), 1, b.all());
  assert.equal(existsSync(placed), false, 'a program went in with no question');
  assert.match(b.asked.join('\n'), /It runs a program/u);
});

test('A HOST CANNOT TURN TOOL SIGN-INS INTO PLAIN FILES: the live machine keeps them, whatever Carry now says they are', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  const row = record.add('carry', { name: 'Tool sign-ins', kind: 'sign_ins', ...everywhere('~/.ccenv/shared/mcp-auth.json'), state: 'on' });
  text(join(a.home, '.ccenv', 'shared', 'mcp-auth.json'), SIGN_INS);
  assert.equal(await syncPush([], a.io), 0, a.all());

  row.fields.kind = 'files';
  assert.equal(await syncPull([], b.io), 1, b.all());
  assert.equal(existsSync(join(b.home, '.ccenv', 'shared', 'mcp-auth.json')), false, 'sign-ins moved off a live machine');
  assert.match(b.out.join('\n'), /stays on Studio Mac while it is live/u);
});

test('A HOST CANNOT MOVE WHERE A THING IS PLACED: a place that is not the sealed one is asked about by where it goes, and --yes-data does not take it', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  const row = record.add('carry', { name: 'Project keys', kind: 'files', ...everywhere('~/work/keys'), state: 'on' });
  text(join(a.home, 'work', 'keys', 'zshrc'), 'export LOOK=here\n');
  assert.equal(await syncPush([], a.io), 0, a.all());

  row.fields.linux = '~/public-site';
  const moved = join(b.home, 'public-site', 'zshrc');
  /* A NO LEAVES IT, AND IT SAYS WHERE. */
  b.answers.push(false);
  assert.equal(await syncPull([], b.io), 1, b.all());
  assert.equal(existsSync(moved), false, 'placed where the host said with no question');
  assert.match(b.asked.join('\n'), /Carry now puts it at .*public-site.*sealed it for ~\/work\/keys/u);

  /* NO TERMINAL AND --yes-data: STILL NOT. */
  const cold = machine(record);
  cold.typed.push(PASSPHRASE);
  assert.equal(await syncJoin(['--name', 'Third'], cold.io), 0, cold.all());
  cold.io.terminal = false;
  assert.equal(await syncPull(['--yes-data'], cold.io), 1, cold.all());
  assert.equal(existsSync(join(cold.home, 'public-site', 'zshrc')), false, '--yes-data took a place the host moved');

  /* A YES PLACES IT, AND THE SAME PLACE SENT AGAIN ASKS NOTHING. */
  b.clear();
  b.answers.push(true);
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.equal(readFileSync(moved, 'utf8'), 'export LOOK=here\n');
  b.clear();
  assert.equal(await syncPull([], b.io), 0, b.all());
  assert.deepEqual(b.asked, []);
});

test('A DRILL OPENS THE NEWEST BUNDLE INTO A SCRATCH FOLDER, checks every file, places nothing, and keeps the outcome in Drills', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  const context = record.add('carry', { name: 'Context folder', kind: 'files', ...everywhere('~/.claude/context'), state: 'on' });
  record.add('carry', { name: 'Local programs', kind: 'files', ...everywhere('~/.local/bin'), runs: true, state: 'on' });
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is\n');
  text(join(a.home, '.local', 'bin', 'tidy'), '#!/bin/sh\necho tidy\n', 0o755);
  assert.equal(await syncPush([], a.io), 0, a.all());

  assert.equal(await syncDrill([], b.io), 0, b.all());
  assert.ok(!existsSync(join(b.home, '.claude')) && !existsSync(join(b.home, '.local')), 'a drill placed something');
  assert.deepEqual(b.asked, [], 'a drill asked about a program it does not run');
  const [drill] = record.of('sync_drills');
  assert.ok(drill !== undefined);
  assert.deepEqual(
    [drill.fields.host, drill.fields.sent_by, drill.fields.grade, drill.fields.files, drill.fields.matched, drill.state],
    ['Field Laptop', 'Studio Mac', 'pass', 2, 2, 'latest'],
  );

  const carried = [...record.files.keys()].find((k) => k.startsWith(`carry/${String(context.seq)}/`))!;
  record.tamper(carried, (bytes) => Buffer.concat([bytes, Buffer.from('x')]));
  b.clear();
  assert.equal(await syncDrill([], b.io), 1);
  assert.match(b.out.join('\n'), /^Failed: /mu);
  assert.deepEqual(
    record.of('sync_drills').map((r) => [r.fields.grade, r.state]),
    [
      ['pass', 'older'],
      ['fail', 'latest'],
    ],
  );
});

/* ── in the background ─────────────────────────────────────────────────── */

test('IN THE BACKGROUND: a hook starts a push only on a joined machine, once a day and ten minutes after the last', async () => {
  const record = fakeRecord();
  const lone = machine(record);
  const started: string[][] = [];
  const start = (args: string[]) => void started.push(args);
  assert.equal(startPush({ home: lone.home, env: lone.io.env, cli: 'main.ts', when: 'end', now, start }), false, 'a machine that has not joined');
  assert.equal(await syncPush(['--auto', 'end'], lone.io), 0);
  assert.equal(lone.all(), '', 'a machine that has not joined was told something');

  const a = await joined(record, 'Studio Mac');
  assert.equal(startPush({ home: a.home, env: a.io.env, cli: 'main.ts', when: 'end', now, start }), true);
  assert.deepEqual(started, [['sync', 'push', '--auto', 'end']]);

  /* THE DAY'S PUSH CLAIMS THE DAY FIRST, AND A RECORD THAT DID NOT ANSWER GIVES IT BACK; THE EXIT IS 0 EITHER WAY. */
  const away: Call = async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'The host did not answer.' } });
  assert.equal(await syncPush(['--auto', 'day'], { ...a.io, call: away }), 0);
  assert.equal(readJoined(a.home, HOST)?.day, undefined, 'the day stayed claimed');
  assert.equal(readJoined(a.home, HOST)?.tried, new Date(now).toISOString(), 'the time tried was not kept');
  later(15 * 60_000);
  assert.equal(await syncPush(['--auto', 'day'], a.io), 0);
  assert.equal(readJoined(a.home, HOST)?.day, dayOf(now));
  assert.equal(startPush({ home: a.home, env: a.io.env, cli: 'main.ts', when: 'day', now, start }), false, 'twice in a day');

  /* THE END OF A SESSION WAITS TEN MINUTES AFTER THE LAST PUSH TRIED, so sessions that end together send once. */
  assert.equal(startPush({ home: a.home, env: a.io.env, cli: 'main.ts', when: 'end', now: now + 60_000, start }), false, 'a minute after the last');
  assert.equal(startPush({ home: a.home, env: a.io.env, cli: 'main.ts', when: 'end', now: now + 11 * 60_000, start }), true);
  const asked: string[] = [];
  const counted: Call = (method, args) => {
    asked.push(method);
    return record.call(method, args);
  };
  later(60_000);
  assert.equal(await syncPush(['--auto', 'end'], { ...a.io, call: counted }), 0);
  assert.deepEqual(asked, [], 'a push a minute after the last asked the record something');
  later(10 * 60_000);
  assert.equal(await syncPush(['--auto', 'end'], { ...a.io, call: counted }), 0);
  assert.ok(asked.length > 0, 'a push ten minutes after the last did not run');
});

/* ── what the inventory says ───────────────────────────────────────────── */

test('THE INVENTORY SAYS WHAT IS SEALED ALREADY, by machine and by the keys alone, on a machine that has joined', async () => {
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  record.add('carry', { name: 'Context folder', kind: 'files', ...everywhere('~/.claude/context'), state: 'on' });
  text(join(a.home, '.claude', 'context', '01-projects.md'), 'what each project is\n');
  assert.equal(await syncPush([], a.io), 0, a.all());

  const seen = await sealedSeen(undefined, a.io.env, a.home, record.call);
  assert.ok(seen !== null && !('unread' in seen));
  assert.deepEqual([seen.machine, seen.machines.map((m) => [m.slug, m.bundles]), seen.files], ['Studio Mac', [['studio-mac', 1]], 3]);
  const inv = await syncInventory([], { home: a.home, env: a.io.env, record: async () => ({ read: false, why: 'signed-out' }), sealed: (host, env, home) => sealedSeen(host, env, home, record.call) });
  assert.ok(inv.lines.some((l) => l.startsWith(`Sealed already: this machine joined setup sync on ${HOST} as Studio Mac.`)), inv.lines.join('\n'));
  assert.ok(inv.lines.some((l) => /^ {2}studio-mac: 1 bundle, the newest sent \d{4}-\d\d-\d\d \d\d:\d\d UTC$/u.test(l)), inv.lines.join('\n'));
  assert.ok(!inv.lines.join('\n').includes('what each project is'));
  assert.equal(inv.report.sealed?.machine, 'Studio Mac');

  /* A MACHINE THAT HAS NOT JOINED IS TOLD NOTHING OF IT, and nothing is asked of the record. */
  const lone = machine(record);
  assert.equal(await sealedSeen(undefined, lone.io.env, lone.home, record.call), null);
});

/* ── unpushed work ─────────────────────────────────────────────────────── */

/** Git in a folder of the test's. */
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * This machine's own git settings set aside for one test, the test's and the command's git alike: a settings file of
 * the test's in place of the global one, no system one, and an ignore file and a hooks folder that are not there, so
 * what git lists, ignores and runs is the test's alone. What it puts back after.
 */
function isolatedGit(): () => void {
  const was = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  const settings = join(scratch, 'gitconfig');
  const at = (name: string) => join(scratch, name).split('\\').join('/');
  writeFileSync(settings, `[core]\n\texcludesFile = ${at('no-ignore')}\n\thooksPath = ${at('no-hooks')}\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n`);
  process.env.GIT_CONFIG_GLOBAL = settings;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  return () => {
    for (const [name, value] of Object.entries(was))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  };
}

test('UNPUSHED WORK: commits, staged and unstaged changes and new files carried, put back on another machine, a key left for the vault', async (t) => {
  t.after(isolatedGit());
  const record = fakeRecord();
  const a = await joined(record, 'Studio Mac');
  const b = await joined(record, 'Field Laptop');
  record.add('carry', { name: 'Work not yet pushed', kind: 'patches', ...everywhere('~/code'), state: 'on' });
  const shop = join(a.home, 'code', 'shop');
  mkdirSync(shop, { recursive: true });
  git(shop, 'init', '--quiet');
  git(shop, 'config', 'user.name', 'Owner');
  git(shop, 'config', 'user.email', 'owner@example.com');
  git(shop, 'config', 'commit.gpgsign', 'false');
  text(join(shop, 'app.js'), 'export {};\n');
  text(join(shop, 'README.md'), '# shop\n');
  git(shop, 'add', 'app.js', 'README.md');
  git(shop, 'commit', '--quiet', '--no-verify', '-m', 'first');
  text(join(shop, 'app.js'), 'export const second = 2;\n');
  git(shop, 'commit', '--quiet', '--no-verify', '-am', 'second');
  const branch = git(shop, 'symbolic-ref', '--short', 'HEAD').trim();
  text(join(shop, 'app.js'), 'export const staged = 3;\n');
  git(shop, 'add', 'app.js');
  text(join(shop, 'README.md'), '# shop\n\nUnstaged.\n');
  text(join(shop, 'notes.md'), 'a new file\n');
  text(join(shop, '.env'), 'SHOP_TOKEN=planted-value\n');

  assert.equal(await syncPush([], a.io), 0, a.all());
  assert.match(a.out.join('\n'), /shop: 2 commits, 1 staged, 1 unstaged and 1 new file/u);
  assert.match(a.out.join('\n'), /\.env looks like a key, so it was left out/u);
  for (const f of record.files.values()) assert.ok(!Buffer.concat(f.parts as Buffer[]).includes(Buffer.from('planted-value')), 'the key rode along');

  assert.equal(await syncPatches([], b.io), 0, b.all());
  const there = join(b.home, 'code', 'shop');
  assert.equal(git(there, 'symbolic-ref', '--short', 'HEAD').trim(), branch);
  assert.deepEqual(git(there, 'log', '--format=%s').trim().split('\n'), ['second', 'first']);
  assert.equal(git(there, 'diff', '--cached', '--name-only').trim(), 'app.js');
  assert.equal(git(there, 'diff', '--name-only').trim(), 'README.md');
  assert.equal(readFileSync(join(there, 'app.js'), 'utf8'), 'export const staged = 3;\n');
  assert.equal(readFileSync(join(there, 'README.md'), 'utf8'), '# shop\n\nUnstaged.\n');
  assert.equal(readFileSync(join(there, 'notes.md'), 'utf8'), 'a new file\n');
  assert.ok(!existsSync(join(there, '.env')), 'the key was placed');
  assert.equal(git(there, 'remote').trim(), '', 'a clone of its own commits names no remote');
  assert.match(b.out.join('\n'), /braindog keys put/u);

  /* AGAIN, THE COPY HERE HAS CHANGES OF ITS OWN, SO NOTHING IS APPLIED OVER THEM. */
  b.clear();
  assert.equal(await syncPatches([], b.io), 1);
  assert.match(b.out.join('\n'), /has changes of its own here, so nothing was applied/u);
});

test('ON A REAL KEYRING the keys above went into the secret service and read back from it', { skip: REAL ? false : 'runs only on a real keyring, through apps/cli/scripts/linux-keyring.sh' }, async () => {
  assert.ok(written.length > 0, 'nothing reached the keyring');
  const [store, item] = written[0]!;
  assert.equal(store.name, 'the secret service');
  const found = await store.read(item);
  assert.ok(found.ok);
});
