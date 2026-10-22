/**
 * This machine's place for its profile in the Profiles add-on (`profile-place.ts`), kept by the bridge.
 *
 * WHAT IS HELD: the place is written at most once a day for each profile on each machine, and updated on a later day;
 * the lists are found by the role and the add-on that declares them, never by their ids; a record without the add-on
 * costs one read and writes nothing; a host away gives the day back; a place he retired is left alone and a stale one is
 * live again once heard; a write his settings ask is a question, and the day is spent; nothing is written once the
 * session closes; ten sessions at once write once; and the bridge does it after its first pulse that finds a run.
 *
 * THE RECORD IS A STAND-IN, because what is tested is what the command asks and when; the write path is the record's.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { serveBridge, type ApiOutcome } from '../src/bridge.ts';
import type { Target } from '../src/http.ts';
import { keepPlace, placedToday, placesPath, QUIET_DAYS, type PlaceIo } from '../src/profile-place.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-profile-place-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const homeOf = () => join(scratch, `home${String(n++)}`);

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 22, 9, 30).getTime();

const PROFILES = {
  id: 'profiles',
  name: 'Profiles',
  title: 'name',
  role: 'profiles',
  personal: true,
  state: 'state',
  done: ['retired'],
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['active', 'paused', 'retired'] },
  ],
};
const PLACES = {
  id: 'profile_places',
  name: 'Places',
  title: 'host',
  personal: true,
  state: 'state',
  done: ['retired'],
  fields: [
    { id: 'copy_of', type: 'ref', to: 'profiles', required: true },
    { id: 'host', type: 'text', required: true },
    { id: 'dir', type: 'text' },
    { id: 'build', type: 'text' },
    { id: 'hooks', type: 'bool' },
    { id: 'heard', type: 'instant' },
    { id: 'state', type: 'enum', values: ['live', 'stale', 'retired'] },
  ],
};
/* Tools links to the profiles too, by a list of refs: a list of the agents add-on, never the places. */
const TOOLS = { id: 'tools', name: 'Tools', title: 'name', role: 'tools', fields: [{ id: 'name', type: 'text' }, { id: 'profiles', type: 'list', of: 'ref', to: 'profiles' }] };

type Row = { id: string; seq: number; version: number; state: string | null; fields: Record<string, unknown> };
type Call = { method: string; body: Record<string, unknown> };

/** A record holding the add-on's lists, or not, and what each method answers; every call is kept. */
function record(o: { addOn?: boolean; off?: boolean; profiles?: string[]; places?: Row[]; asks?: boolean; away?: string } = {}) {
  const calls: Call[] = [];
  const addOn = o.addOn ?? true;
  const rows: Record<string, Row[]> = {
    profiles: (o.profiles ?? ['Copperleaf', 'lanternfish']).map((name, i) => ({ id: `e_${name.toLowerCase()}`, seq: i + 1, version: 1, state: 'active', fields: { name } })),
    profile_places: o.places ?? [],
  };
  const ask = async (method: string, body: Record<string, unknown>): Promise<ApiOutcome> => {
    calls.push({ method, body });
    if (o.away === method) return { kind: 'gone' };
    if (method === 'schemas') return { kind: 'ok', value: { lists: addOn ? { tools: TOOLS, profiles: PROFILES, profile_places: PLACES } : { tools: TOOLS }, refused: {}, blocks: {} } };
    if (method === 'packs')
      return {
        kind: 'ok',
        value: [
          { id: 'agents', version: '1.13.0', disabled_at: null, registers: ['tools'] },
          ...(addOn ? [{ id: 'profiles', version: '1.0.0', disabled_at: o.off ? '2026-10-01T00:00:00Z' : null, registers: ['profile_places', 'profiles'] }] : []),
        ],
      };
    if (method === 'list') return { kind: 'ok', value: { rows: rows[String(body.register)] ?? [], matched: 0, cursor: null } };
    if (o.asks && (method === 'create' || method === 'update')) return { kind: 'ok', value: { asked: { id: 'SG4', question: 'Add a place?', why: 'Suggest' } } };
    if (method === 'create') {
      const row: Row = { id: `e_place${String(rows.profile_places!.length + 1)}`, seq: rows.profile_places!.length + 1, version: 1, state: 'live', fields: body.fields as Record<string, unknown> };
      rows.profile_places!.push(row);
      return { kind: 'ok', value: row };
    }
    if (method === 'update') {
      const row = rows.profile_places!.find((r) => r.seq === body.seq)!;
      if (row.version !== body.version) return { kind: 'refused', code: 'VERSION_STALE' };
      const patch = body.patch as Record<string, unknown>;
      Object.assign(row.fields, patch);
      if (typeof patch.state === 'string') row.state = patch.state;
      row.version++;
      return { kind: 'ok', value: row };
    }
    return { kind: 'refused', code: 'ROUTE_UNKNOWN' };
  };
  return { calls, ask, rows, writes: () => calls.filter((c) => c.method === 'create' || c.method === 'update') };
}

const io = (r: ReturnType<typeof record>, home: string, more: Partial<PlaceIo> = {}): PlaceIo => ({
  ask: r.ask,
  home,
  host: 'https://brain.example/ada',
  profile: 'copperleaf',
  machine: 'studio-desktop',
  build: '2026.10.22+abc1234',
  hooks: true,
  now: NOW,
  ...more,
});

test('THE PLACE IS WRITTEN ONCE A DAY for a profile on a machine, found by name, and a later day updates it', async () => {
  const r = record();
  const home = homeOf();
  assert.equal(await keepPlace(io(r, home)), 'written');
  /* FOUND BY THE ROLE AND THE ADD-ON, its name matched without case; the row says names, never a folder. */
  assert.deepEqual(r.writes(), [
    {
      method: 'create',
      body: { register: 'profile_places', fields: { copy_of: 'e_copperleaf', host: 'studio-desktop', build: '2026.10.22+abc1234', hooks: true, heard: new Date(NOW).toISOString() } },
    },
  ]);
  assert.ok(!JSON.stringify(r.writes()).includes('/Users'), 'a folder was written');

  /* THE SAME DAY: nothing is asked at all. */
  const asked = r.calls.length;
  assert.equal(await keepPlace(io(r, home, { now: NOW + 3 * 3_600_000 })), 'already');
  assert.equal(r.calls.length, asked);

  /* THE NEXT DAY: the same row, updated against its version, with the new build and hooks. */
  const later = NOW + DAY;
  assert.equal(await keepPlace(io(r, home, { now: later, hooks: false, build: '2026.10.23+def5678' })), 'written');
  assert.deepEqual(r.writes().at(-1), {
    method: 'update',
    body: { register: 'profile_places', seq: 1, patch: { build: '2026.10.23+def5678', hooks: false, heard: new Date(later).toISOString() }, version: 1 },
  });
  assert.equal(r.rows.profile_places!.length, 1);
  /* ONLY TODAY'S DAYS ARE KEPT, so the file stays a line a profile. */
  const kept = JSON.parse(readFileSync(placesPath(home), 'utf8')) as { placed: { day: string }[] };
  assert.equal(kept.placed.length, 1);

  /* ANOTHER MACHINE, OR ANOTHER PROFILE, IS A PLACE OF ITS OWN, the same day. */
  assert.equal(await keepPlace(io(r, home, { now: later, machine: 'travel-laptop' })), 'written');
  assert.equal(await keepPlace(io(r, home, { now: later, profile: 'lanternfish' })), 'written');
  assert.deepEqual(r.rows.profile_places!.map((p) => [p.fields.copy_of, p.fields.host]), [['e_copperleaf', 'studio-desktop'], ['e_copperleaf', 'travel-laptop'], ['e_lanternfish', 'studio-desktop']]);
});

test('WITHOUT THE ADD-ON IT COSTS ONE READ A DAY and writes nothing; a profile no row is named for writes nothing either', async () => {
  const none = record({ addOn: false });
  const home = homeOf();
  assert.equal(await keepPlace(io(none, home)), 'none');
  assert.deepEqual(none.calls.map((c) => c.method), ['schemas']);
  assert.equal(await keepPlace(io(none, home)), 'already');
  assert.equal(none.calls.length, 1);

  const off = record({ off: true });
  assert.equal(await keepPlace(io(off, homeOf())), 'none');
  assert.deepEqual(off.writes(), []);

  const unnamed = record({ profiles: ['Everyday'] });
  assert.equal(await keepPlace(io(unnamed, homeOf(), { profile: 'default' })), 'none');
  assert.deepEqual(unnamed.writes(), []);
});

test('A HOST AWAY GIVES THE DAY BACK, and the next session keeps the place', async () => {
  const home = homeOf();
  for (const method of ['schemas', 'packs', 'list', 'create']) {
    const r = record({ away: method });
    assert.equal(await keepPlace(io(r, home)), 'away', method);
    assert.equal(placedToday(home, { host: 'https://brain.example/ada', profile: 'copperleaf', machine: 'studio-desktop' }, NOW), false, method);
  }
  const back = record();
  assert.equal(await keepPlace(io(back, home)), 'written');
  assert.equal(placedToday(home, { host: 'https://brain.example/ada', profile: 'copperleaf', machine: 'studio-desktop' }, NOW), true);
});

test('A PLACE HE RETIRED IS LEFT ALONE, and a stale one is live again once its machine is heard', async () => {
  const place = (state: string): Row => ({ id: 'e_p1', seq: 1, version: 4, state, fields: { copy_of: 'e_copperleaf', host: 'STUDIO-DESKTOP', heard: '2026-09-01T00:00:00.000Z' } });
  const retired = record({ places: [place('retired')] });
  assert.equal(await keepPlace(io(retired, homeOf())), 'none');
  assert.deepEqual(retired.writes(), []);

  const stale = record({ places: [place('stale')] });
  assert.equal(await keepPlace(io(stale, homeOf())), 'written');
  assert.deepEqual(stale.writes().map((c) => c.body.patch), [{ build: '2026.10.22+abc1234', hooks: true, heard: new Date(NOW).toISOString(), state: 'live' }]);
  assert.equal(stale.rows.profile_places![0]!.state, 'live');
});

test('A WRITE HIS SETTINGS ASK IS A QUESTION, and the place then waits 30 days, so he is asked once a month at most', async () => {
  const r = record({ asks: true });
  const home = homeOf();
  const day = 86_400_000;
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(await keepPlace(io(r, home, { now })), 'asked');
  assert.equal(await keepPlace(io(r, home, { now })), 'already');
  assert.equal(await keepPlace(io(r, home, { now: now + day })), 'already');
  assert.equal(await keepPlace(io(r, home, { now: now + (QUIET_DAYS - 1) * day })), 'already');
  assert.equal(r.writes().length, 1);
  assert.equal(await keepPlace(io(r, home, { now: now + (QUIET_DAYS + 1) * day })), 'asked');
  assert.equal(r.writes().length, 2);
});

test('NOTHING IS WRITTEN ONCE THE SESSION CLOSES, and the day goes back', async () => {
  const r = record();
  const home = homeOf();
  assert.equal(await keepPlace(io(r, home, { stopped: () => true })), 'away');
  assert.deepEqual(r.writes(), []);
  assert.equal(await keepPlace(io(r, home)), 'written');
});

test('TEN SESSIONS STARTING TOGETHER IN ONE PROFILE WRITE ONCE', async () => {
  const r = record();
  const home = homeOf();
  const out = await Promise.all(Array.from({ length: 10 }, () => keepPlace(io(r, home))));
  assert.deepEqual(out.filter((o) => o === 'written').length, 1);
  assert.equal(out.filter((o) => o === 'already').length, 9);
  assert.equal(r.writes().length, 1);
});

/* ── through the bridge ──────────────────────────────────────────────────── */

const TARGET: Target = { key: 'https://brain.example/ada', base: 'https://brain.example', token: 'bd_place_test_token_never_printed' };

test('THE BRIDGE KEEPS THE PLACE AFTER ITS FIRST PULSE THAT FINDS A RUN, once, as the session, and only with a profile said', async () => {
  const r = record();
  const sent: { path: string; headers: Headers }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    sent.push({ path, headers: new Headers(init?.headers) });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json', 'braindog-build': 'b1' } });
    if (path === '/mcp') {
      const m = body as { id?: number; method?: string; params?: { protocolVersion?: string } };
      if (m.method === 'initialize') return json({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'braindog', version: 'b1' } } });
      return m.id === undefined ? new Response(null, { status: 202 }) : json({ jsonrpc: '2.0', id: m.id, result: {} });
    }
    if (path === '/api/whoami') return json({ ok: true, value: { effective: {} } });
    if (path === '/api/pulse') return json({ ok: true, value: { run: 'S883', stamp: 'v1', changed: false, pending: [], stop: null, lines: [] } });
    const got = await r.ask(path.slice('/api/'.length), body);
    return json(got.kind === 'ok' ? { ok: true, value: got.value } : { ok: false, refusal: { code: got.kind === 'refused' ? got.code : 'UNREACHABLE', fix: 'no' } });
  }) as typeof globalThis.fetch;

  const serve = (profile: string | null) => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const home = homeOf();
    const hints = async () => ({ 'x-braindog-host': 'studio-desktop', 'x-braindog-agent': 'claude', 'x-braindog-client': 'sess-1', ...(profile === null ? {} : { 'x-braindog-profile': profile }) });
    const done = serveBridge({ input, output, home, env: { XDG_CONFIG_HOME: join(home, 'config') }, fetch, pulseMs: 20, heldMs: 10, channel: false, endGraceMs: 0, say: () => undefined }, TARGET, hints);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.304' } } })}\n`);
    return { input, done, home };
  };
  const until = async (ok: () => boolean, ms = 3_000) => {
    const end = Date.now() + ms;
    while (!ok()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((done) => setTimeout(done, 5));
    }
  };
  const pulses = () => sent.filter((s) => s.path === '/api/pulse').length;

  const b = serve('copperleaf');
  await until(() => r.writes().length === 1);
  const at = pulses();
  await until(() => pulses() >= at + 4);
  b.input.end();
  await b.done;
  /* ONCE A PROCESS: one read of the lists and one write, however many pulses after. */
  assert.equal(r.calls.filter((c) => c.method === 'schemas').length, 1);
  assert.deepEqual(r.writes().map((c) => [c.method, (c.body.fields as Record<string, unknown>).host]), [['create', 'studio-desktop']]);
  /* AS THE SESSION: the write carries its headers and the machine's bearer. */
  const create = sent.find((s) => s.path === '/api/create')!;
  assert.equal(create.headers.get('x-braindog-client'), 'sess-1');
  assert.equal(create.headers.get('authorization'), `Bearer ${TARGET.token}`);
  assert.equal(JSON.parse(readFileSync(placesPath(b.home), 'utf8')).placed.length, 1);

  /* A SESSION THAT SAYS NO PROFILE, Codex's, asks nothing about places. */
  const before = r.calls.length;
  const codex = serve(null);
  const seen = pulses();
  await until(() => pulses() >= seen + 3);
  codex.input.end();
  await codex.done;
  assert.equal(r.calls.length, before);
});
