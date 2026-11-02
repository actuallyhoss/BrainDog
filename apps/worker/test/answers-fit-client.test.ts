/**
 * The Cloud's answers, held to the shapes the web app reads them as.
 *
 * WHY THIS EXISTS. Four answers reach the app from the Cloud and from no self-host a gate ran: the
 * account's usage, the account's billing, Slash's status with a model behind it, and `boot` saying `cloud`. Each is read
 * through a type somebody wrote out by hand on the web's side, and Usage's parted from the Directory's once already:
 * the reader asked for `included` where the answer said `asks`, `toLocaleString` ran on nothing, and `/usage` told an
 * owner the record could not be reached. `apps/web/src/lib/record/usage-contract.test.ts` holds that reader to the
 * Directory's own code. This file holds the other end: THE WORKER'S OWN `fetch`, over a real Directory and a real
 * record (`cloud-serve.ts`), answering over HTTP as it answers a browser, for a month with runs in it and for an empty
 * one, with every key the client's type declares present and of the kind it declares.
 *
 * THE SHAPES ARE WRITTEN HERE AS DATA, AND TIED TO THE TYPES WHERE THE TYPE CAN BE REACHED. `Boot` and `SlashStatus`
 * are `@braindog/client`'s, and each shape below `satisfies` a table with exactly that type's keys, so a key added to
 * the type is a type error here until its kind is said. Usage's and Billing's types live in `apps/web`
 * (`lib/record/actions.ts` `AccountUsage`, `routes/settings/billing.ts` `BillingAnswer` and `billedOf`), which this
 * package cannot import without the web's whole graph, so those two are copied out key for key and say where from.
 *
 * A KEY THE ANSWER HOLDS AND THE TYPE DOES NOT IS LEFT ALONE: a host a release ahead of the bundle is allowed.
 *
 * NOT WORKERD. The harness is the Worker's code over `node:sqlite`, so a fault only workerd shows stays unseen here.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import type { Boot, SlashAsked, SlashStatus } from '../../../packages/client/src/index.ts';

import { startCloud, type Provisioned, type RunningCloud, type Usage } from './cloud-serve.ts';

/* ── a shape, as data ───────────────────────────────────────────────────── */

type Leaf = 'string' | 'number' | 'boolean' | 'null' | 'day' | 'month' | 'instant' | 'any';
type Shape =
  | Leaf
  | { is: readonly string[] }
  | { list: Shape }
  | { or: readonly Shape[] }
  | { map: Shape }
  | { optional: Shape }
  | { keys: { readonly [key: string]: Shape } };

const list = (of: Shape): Shape => ({ list: of });
const or = (...of: Shape[]): Shape => ({ or: of });
const optional = (of: Shape): Shape => ({ optional: of });
const keys = (of: { readonly [key: string]: Shape }): Shape => ({ keys: of });
const is = (...words: string[]): Shape => ({ is: words });
const map = (of: Shape): Shape => ({ map: of });

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const MONTH = /^\d{4}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

const said = (v: unknown): string => (v === undefined ? 'nothing' : v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `${typeof v} ${JSON.stringify(v)}`);

/** Every place `value` parts from `shape`, each as the path and what was there. Empty is a fit. */
function faults(value: unknown, shape: Shape, path: string): string[] {
  const wrong = (wanted: string): string[] => [`${path}: wanted ${wanted}, got ${said(value)}`];
  if (typeof shape === 'string') {
    if (shape === 'any') return value === undefined ? wrong('something') : [];
    if (shape === 'null') return value === null ? [] : wrong('null');
    if (shape === 'number') return typeof value === 'number' && Number.isFinite(value) ? [] : wrong('a number');
    if (shape === 'string' || shape === 'boolean') return typeof value === shape ? [] : wrong(`a ${shape}`);
    const pattern = shape === 'day' ? DAY : shape === 'month' ? MONTH : INSTANT;
    return typeof value === 'string' && pattern.test(value) ? [] : wrong(`${shape === 'instant' ? 'an' : 'a'} ${shape}`);
  }
  if ('is' in shape) return typeof value === 'string' && shape.is.includes(value) ? [] : wrong(`one of ${shape.is.join(', ')}`);
  if ('optional' in shape) return value === undefined ? [] : faults(value, shape.optional, path);
  if ('or' in shape) return shape.or.some((one) => faults(value, one, path).length === 0) ? [] : wrong('one of the kinds its type names');
  if ('list' in shape) return Array.isArray(value) ? value.flatMap((one, i) => faults(one, shape.list, `${path}[${String(i)}]`)) : wrong('a list');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return wrong('an object');
  const held = value as Record<string, unknown>;
  if ('map' in shape) return Object.entries(held).flatMap(([k, v]) => faults(v, shape.map, `${path}.${k}`));
  return Object.entries(shape.keys).flatMap(([k, of]) => faults(held[k], of, path === '' ? k : `${path}.${k}`));
}

/** Throw unless `value` fits, naming every place it does not. */
function fits(value: unknown, shape: Shape, what: string): void {
  const found = faults(value, shape, '');
  assert.deepEqual(found, [], `${what} is not what the client's type says it is:\n  ${found.join('\n  ')}`);
}

/** The checker itself: a shape that could not fail would hold nothing. */
test('THE CHECKER REFUSES WHAT IT SHOULD: a key gone, a kind changed, a word outside its list', () => {
  const shape = keys({ runs: 'number', day: 'day', plan: is('free', 'hosted'), cap: optional(or('number', 'null')), days: list(keys({ day: 'day' })) });
  const good = { runs: 1, day: '2026-09-01', plan: 'free', days: [{ day: '2026-09-01' }] };
  assert.deepEqual(faults(good, shape, ''), []);
  assert.deepEqual(faults({ ...good, cap: null, more: true }, shape, ''), [], 'a key the type does not name, and an optional one sent as null');
  assert.equal(faults({ ...good, runs: undefined }, shape, '').length, 1, 'a key gone');
  assert.equal(faults({ ...good, runs: '1' }, shape, '').length, 1, 'a number sent as text');
  assert.equal(faults({ ...good, day: '1 September' }, shape, '').length, 1, 'a day written another way');
  assert.equal(faults({ ...good, plan: 'gold' }, shape, '').length, 1, 'a word outside the list');
  assert.equal(faults({ ...good, cap: 'none' }, shape, '').length, 1, 'an optional key of the wrong kind');
  assert.equal(faults({ ...good, days: [{ day: '2026-09-01' }, {}] }, shape, '')[0], 'days[1].day: wanted a day, got nothing');
});

/* ── the four shapes ────────────────────────────────────────────────────── */

/** `LedgerTotals` in `apps/web/src/lib/record/actions.ts`: `Totals` with `ms` and `held` always said. */
const TOTALS = { runs: 'number', requests: 'number', bytes: 'number', failures: 'number', ms: 'number', held: 'number' } as const;

/** `AccountUsage`, the same file, key for key. `slash.cap` is the one key no host sends yet; `extra` is `null` on a plan that sells none. */
const USAGE = keys({
  from: 'day',
  to: 'day',
  totals: keys(TOTALS),
  records: list(
    keys({
      record: 'string',
      slug: or('string', 'null'),
      plan: is('free', 'hosted', 'plus', 'selfhost'),
      closed: 'boolean',
      month: keys({
        month: 'month',
        used: keys(TOTALS),
        allowance: or(keys({ runs: 'number', requests: 'number', bytes: 'number', ms: 'number' }), 'null'),
        resets: 'day',
      }),
      totals: keys(TOTALS),
      projects: list(keys({ scope: 'string', ...TOTALS })),
      actions: list(keys({ scope: 'string', action: 'string', ...TOTALS })),
      days: list(keys({ day: 'day', ...TOTALS })),
      counted: list(keys({ action: 'string', ...TOTALS })),
      slash: optional(keys({ included: optional(or('number', 'null')), used: optional('number'), packs: optional('number'), left: optional(or('number', 'null')), asks: 'number', neurons: 'number', days: list(keys({ day: 'day', asks: 'number', neurons: 'number' })), cap: optional(or('number', 'null')) })),
      extra: optional(or(keys({ on: 'boolean', cap_cents: 'number', cents: 'number', reported_cents: 'number', month: 'month', month_cap_cents: 'number' }), 'null')),
    }),
  ),
});

/**
 * `BillingAnswer` in `apps/web/src/routes/settings/billing.ts`, as `billedOf` reads each record off the wire: the three
 * times are `period_end`, `lapsed_at` and `delete_on` there, epoch milliseconds, and a record with none sends none.
 */
const BILLING = keys({
  records: list(
    keys({
      record: 'string',
      slug: or('string', 'null'),
      state: is('active', 'past_due', 'lapsed', 'unbilled', 'comp'),
      plan: is('free', 'cloud', 'plus'),
      price: 'string',
      period_end: optional(or('number', 'null')),
      lapsed_at: optional(or('number', 'null')),
      delete_on: optional(or('number', 'null')),
    }),
  ),
  open: 'boolean',
  plans: list(keys({ id: 'string', name: 'string', price: 'string' })),
});

/** `SlashStatus`. A table with exactly the type's keys, so a key added there is a type error here. */
const SLASH = {
  source: optional(is('included', 'key')),
  tier: is('a', 'b', 'byo'),
  provider: optional(or(is('anthropic', 'openai'), 'null')),
  model: 'string',
  asks: keys({ used: 'number', cap: 'number', resets: 'instant', capped: optional('boolean') }),
  background: optional(keys({ used: 'number', cap: 'number' })),
  deep: optional(keys({ key: 'boolean', model: 'string', harder: 'string', cap_cents: 'number', spent_cents: 'number' })),
} satisfies Record<keyof Required<SlashStatus>, Shape>;

/**
 * `SlashAsked`, an ask as `GET /api/slash/asks` lists it, with exactly the type's keys. `purpose` is optional in the type
 * for a host built before it said so, and the Worker is not that host, so it is held to sending it.
 */
const SLASH_ASKED = {
  id: 'string',
  ts: 'instant',
  kind: 'string',
  purpose: 'string',
  status: 'string',
  code: or('string', 'null'),
  question: or('string', 'null'),
  model: 'string',
  filed: or('string', 'null'),
} satisfies Record<keyof Required<SlashAsked>, Shape>;
const SLASH_ASKS = keys({ asks: list(keys(SLASH_ASKED)) });

/** `LiveRun`, a row of `boot.sessions`. */
const LIVE_RUN = keys({ id: 'string', seq: 'number', spoken: 'string', state: or('string', 'null'), version: 'number', fields: map('any'), stale: 'boolean' });

/** `BootPlace`, a place in the rail. */
const PLACE = keys({ page: 'string', icon: or('string', 'null'), name: 'string', by: is('addon', 'person', 'engine'), section: or('string', 'null') });

/**
 * `Boot`, with exactly the type's keys. What the type leaves optional for a host older than the field is optional here,
 * and the tests below say which of those the Cloud must send all the same.
 */
const BOOT = {
  registers: list(keys({ id: 'string', name: 'string', count: 'number', icon: optional(or('string', 'null')) })),
  now: 'instant',
  sessions: optional(list(LIVE_RUN)),
  waiting: optional(list(keys({ id: 'string', body_kind: 'string', opened_by: 'string', opened_at: 'instant', question: optional('string') }))),
  record: optional(or(keys({ slug: 'string', name: 'string', locale: 'string', currency: optional(or('string', 'null')), money: optional(list('string')) }), 'null')),
  currency: optional(or('string', 'null')),
  money: optional(list('string')),
  zone: optional('string'),
  me: optional(
    keys({
      kind: is('person', 'token', 'system'),
      person: or('string', 'null'),
      name: or('string', 'null'),
      level: or('string', 'null'),
      levels: optional(map('string')),
      prefs: optional(map('any')),
    }),
  ),
  names: optional(map('string')),
  home: or('string', 'null'),
  host: optional(is('cloud', 'self-host')),
  image: optional('boolean'),
  pages: optional(
    list(
      keys({
        slug: 'string',
        title: 'string',
        nav: or(keys({ section: 'string', order: 'number', place: optional('number') }), 'null'),
        icon: or('string', 'null'),
        list: optional(or('string', 'null')),
        about: optional(or(keys({ register: 'string', seq: or('number', 'null'), updated_at: optional('string'), hue: optional(or('number', 'null')) }), 'null')),
      }),
    ),
  ),
  rowPages: optional(list(keys({ register: 'string', rows: list(list(or('number', 'string'))) }))),
  pagesByRow: optional(list('string')),
  counts: optional(keys({ decide: 'number', inbox: or('number', 'null'), decided: optional('number'), arrived: optional(or('number', 'null')) })),
  pen: optional(list('any')),
  whatsNew: optional(keys({ events: list(keys({ id: 'string' })), upTo: or(map('any'), 'string', 'number', 'null'), sinceCapped: 'boolean' })),
  theme: optional(or(keys({ light: map('string'), dark: map('string') }), 'null')),
  looks: optional(list(keys({ id: 'string', name: 'string', from: is('own', 'pack'), pack: optional('string') }))),
  shape: optional('number'),
  waits: optional(keys({ questions: 'number', late: 'number', hard: 'number', inbox: or('number', 'null'), working: 'number' })),
  lateDays: optional('number'),
  working: optional(
    list(keys({ spoken: 'string', seq: or('number', 'null'), agent: or('string', 'null'), doing: or('string', 'null'), project: or('string', 'null'), since: 'instant', last_seen: 'instant', ran_s: 'number' })),
  ),
  voice: optional(keys({ pack: or('string', 'null'), values: map('any'), labels: map('string') })),
  slash: optional('boolean'),
  copies: optional(keys({ last_copy_at: or('string', 'null'), last_copy_bytes: or('number', 'null'), last_export_at: or('string', 'null') })),
  places: optional(keys({ places: list(PLACE), more: list(PLACE) })),
  computed: optional(list(keys({ source: 'string', drawsAs: 'string' }))),
} satisfies Record<keyof Required<Boot>, Shape>;

/* ── one Cloud, two people ──────────────────────────────────────────────── */

/** Mid-September, so the month has days behind it and August is whole. */
const SEPT = Date.UTC(2026, 8, 15, 12);
const THIS_MONTH = 'from=2026-09-01&to=2026-09-15';
const LAST_MONTH = 'from=2026-08-01&to=2026-08-31';

type Answered = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

let c: RunningCloud | undefined;
/** `busy` set a record up, ran an agent and has runs and asks counted this month. `quiet` signed in and did nothing. */
let busy: Provisioned;
let quiet: Provisioned;

/** One GET over the wire, as the browser sends it, answered 200 with the host's envelope; its `value`. */
async function read(who: Provisioned, path: string): Promise<unknown> {
  const res = await fetch(`${c!.base}${path}`, { headers: { cookie: who.cookie, accept: 'application/json', 'sec-fetch-site': 'same-origin' } });
  const out = (await res.json()) as Answered;
  assert.equal(res.status, 200, `${path} answered ${String(res.status)}: ${JSON.stringify(out)}`);
  assert.equal(out.ok, true, `${path} refused: ${JSON.stringify(out)}`);
  return out.value;
}

/** One write over the wire with a cookie or a key; its `value`. */
async function write(headers: Record<string, string>, name: string, body: object): Promise<unknown> {
  const res = await fetch(`${c!.base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const out = (await res.json()) as Answered;
  assert.equal(out.ok, true, `${name} refused: ${JSON.stringify(out)}`);
  return out.value;
}

before(async () => {
  c = await startCloud({ now: SEPT });
  busy = await c.provision('ada@example.test', { slug: 'the-studio', name: 'Ada' });
  quiet = await c.provision('bo@example.test', { slug: 'side-thing', name: 'Bo' });

  /* A RECORD SET UP AND WORKED IN, through the doors a person and an agent use: Solo founder accepted on Decide, a key
     minted, one agent run ended and one left live, so `sessions` and `working` have a row each to be held to. */
  const offered = (await write({ cookie: busy.cookie }, 'propose', { question: 'Set this record up for a solo founder?', body_kind: 'pack', body: { install: 'usecase-founder' } })) as { id: string };
  await write({ cookie: busy.cookie }, 'decide', { id: offered.id, decide: { option: 'accept', reason: 'This is what the record is for.' } });
  const key = (await write({ cookie: busy.cookie }, 'createToken', { scope: 'write', label: 'Studio laptop agent' })) as { bearer: string };
  const agent = { authorization: `Bearer ${key.bearer}` };
  await write(agent, 'handoff', { next: 'Send the September invoices', note: 'Read the open bills first.' });
  await write(agent, 'handoff', { next: 'Send the September invoices', state: 'done' });
  await write(agent, 'handoff', { next: 'Check the licence renewal dates', note: 'Two are due this quarter.' });

  /* THE MONTH'S RUNS AND ASKS, counted by the Directory as a record's alarm and its nightly walk hand them over. */
  const usage: Usage = { runs: 1, requests: 3, bytes: 900, ms: 40, failures: 0, held: 0 };
  await c.meter(busy.record, [
    { event: 'ev_1', at: '2026-09-02T10:00:00.000Z', ingest: 'last_day', scope: 'global', usage },
    { event: 'ev_2', at: '2026-09-09T10:00:00.000Z', ingest: 'last_day', scope: 'global', usage },
    { event: 'ev_3', at: '2026-09-15T11:00:00.000Z', ingest: 'stripe-balance', scope: 'kiln', usage: { ...usage, failures: 1 } },
  ]);
  const ledger = c.cloud.directory as unknown as { meterSlash(record: string, days: { day: string; asks: number; neurons: number }[]): Answered | Promise<Answered> };
  const asked = await c.at(() => ledger.meterSlash(busy.record, [{ day: '2026-09-14', asks: 40, neurons: 12_000 }, { day: '2026-09-15', asks: 1, neurons: 300 }]));
  assert.equal(asked.ok, true, `the ledger would not count Slash's asks: ${JSON.stringify(asked)}`);
});

after(async () => {
  await c?.close();
});

type Ledger = { totals: { runs: number }; records: { slug: string; month: { used: { runs: number } }; projects: unknown[]; actions: unknown[]; days: unknown[]; slash?: { asks: number; neurons: number; days: unknown[] } }[] };

test('USAGE, A MONTH WITH RUNS: every key `/usage` reads is there, and every list it walks has an entry that was checked', async () => {
  const value = await read(busy, `/account/usage?${THIS_MONTH}`);
  fits(value, USAGE, 'GET /account/usage for a month with runs');
  const ledger = value as Ledger;
  assert.equal(ledger.totals.runs, 3);
  assert.equal(ledger.records.length, 1, 'an owner reads their own record and nobody else\'s');
  const [studio] = ledger.records;
  assert.equal(studio?.slug, 'the-studio');
  /* A LIST WITH NOTHING IN IT FITS ANY SHAPE, so each one the page walks is held to having something here. */
  assert.deepEqual([studio?.projects.length, studio?.actions.length, studio?.days.length], [2, 2, 3]);
  assert.deepEqual([studio?.slash?.asks, studio?.slash?.days.length], [41, 2], 'the Cloud says what Slash was asked, and the type only allows it to be absent');
});

test('USAGE, AN EMPTY MONTH: a person who ran nothing, and last month for the one who did, are the same shape with zeroes', async () => {
  for (const [who, range, what] of [
    [quiet, THIS_MONTH, 'a person who ran nothing'],
    [busy, LAST_MONTH, 'the month before anything ran'],
  ] as const) {
    const value = await read(who, `/account/usage?${range}`);
    fits(value, USAGE, `GET /account/usage for ${what}`);
    const ledger = value as Ledger;
    assert.equal(ledger.totals.runs, 0, what);
    assert.equal(ledger.records.length, 1, `${what} still has a record to draw a plan line for`);
    assert.deepEqual([ledger.records[0]?.projects, ledger.records[0]?.actions, ledger.records[0]?.days], [[], [], []], what);
    /* THE MONTH'S CREDITS RIDE BESIDE IT (directory-credits-96): `included`, `used`, `packs` and `left`, the record's month whatever range was asked. */
    const { asks, neurons, days } = ledger.records[0]?.slash ?? {};
    assert.deepEqual({ asks, neurons, days }, { asks: 0, neurons: 0, days: [] }, `${what}: Slash is said as nothing asked, not left out`);
  }
  /* THE MONTH SO FAR IS THE RECORD'S, WHATEVER RANGE WAS ASKED: last month's answer still carries September's count. */
  const past = (await read(busy, `/account/usage?${LAST_MONTH}`)) as Ledger;
  assert.equal(past.records[0]?.month.used.runs, 3);
});

test('BILLING: each person reads one record of their own, in the words Billing knows', async () => {
  for (const who of [busy, quiet]) {
    const value = await read(who, '/account/billing');
    fits(value, BILLING, `GET /account/billing for ${who.slug}`);
    const { records } = value as { records: { record: string; slug: string }[] };
    assert.deepEqual(records.map((r) => [r.record, r.slug]), [[who.record, who.slug]]);
  }
});

test("SLASH'S STATUS: 200 with a key store behind it, and the keys the type lets an older host leave out are all sent", async () => {
  for (const who of [busy, quiet]) {
    const value = await read(who, '/api/slash/status');
    fits(value, keys(SLASH), `GET /api/slash/status for ${who.slug}`);
    const status = value as SlashStatus;
    /* NOTHING HERE CAN ASK A MODEL, so the count is nought for both people; what is held is that it is a count. */
    assert.equal(status.asks.used, 0);
    for (const key of ['source', 'provider', 'background'] as const) assert.notEqual(status[key], undefined, `the Cloud left ${key} out of Slash's status`);
    assert.equal(typeof status.asks.capped, 'boolean', 'the Cloud says whether the asks are capped');
  }
});

test("SLASH'S ASKS: the owner's list answers 200 as a list of asks, each held to the client's type", async () => {
  for (const who of [busy, quiet]) {
    const value = await read(who, '/api/slash/asks');
    fits(value, SLASH_ASKS, `GET /api/slash/asks for ${who.slug}`);
    /* NOTHING HERE CAN ASK A MODEL, so the list is empty for both people and an empty list fits any shape: what this
       holds is the door and its one key. An ask's own keys are held in `packages/slash/test/history-purpose.test.ts`. */
    assert.deepEqual((value as { asks: unknown[] }).asks, []);
  }
});

/** The keys `Boot` leaves optional for an older host and the Cloud's shell reads on every screen. */
const CLOUD_SENDS = ['sessions', 'waiting', 'record', 'me', 'host', 'pages', 'counts', 'whatsNew', 'waits', 'working', 'voice', 'slash', 'copies'] as const;

test('BOOT: the Cloud says it is the Cloud, with a live run and a set-up record on one side and an untouched one on the other', async () => {
  for (const who of [busy, quiet]) {
    const value = await read(who, '/api/boot');
    fits(value, keys(BOOT), `GET /api/boot for ${who.slug}`);
    const boot = value as Boot;
    assert.equal(boot.host, 'cloud');
    assert.equal(boot.now, new Date(SEPT).toISOString(), "the record's instant is the Cloud's clock");
    for (const key of CLOUD_SENDS) assert.notEqual(boot[key], undefined, `the Cloud left ${key} out of boot for ${who.slug}`);
    assert.deepEqual([boot.record?.slug, boot.me?.kind, boot.me?.level], [who.slug, 'person', 'owner']);
  }
  const worked = (await read(busy, '/api/boot')) as Boot;
  assert.equal(worked.sessions?.length, 1, 'one run was ended and one is live');
  assert.equal(worked.working?.length, 1, 'the live run is somebody working');
  assert.ok((worked.pages?.length ?? 0) > 0 && worked.registers.length > 1, 'Solo founder brought pages and lists to be held to');
  const untouched = (await read(quiet, '/api/boot')) as Boot;
  assert.deepEqual([untouched.sessions, untouched.working, untouched.pages], [[], [], []]);
});
