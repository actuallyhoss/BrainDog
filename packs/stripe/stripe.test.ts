/**
 * Stripe, as a pack: the company's Stripe balance and the payouts on their way to the bank, arriving in Money's
 * accounts every hour instead of being typed in.
 *
 * WHY A SCRIPT AND NOT A PULL, MEASURED BELOW RATHER THAN ARGUED. Stripe's `/v1/balance` answers one entry per currency
 * under `available` and again under `pending`, and a pull's `map:` has no way to put the currency into the row's name:
 * `name` is a literal or a path, never both. So every currency lands on one name, and with `dedupe: [name]` the last
 * currency on the page overwrites the first. The first test after the file's own shows it: USD 18,420.50 and EUR
 * 310.00 went in, and the register held one row, EUR 310.00, with the dollars gone. The payouts are a second address
 * and a sum, which a pull cannot join either. A script lists both, sums, and names each row by kind and currency.
 *
 * THE KEY IS A LABEL. The script declares `keys: ["stripe"]` and `egress: ["https://api.stripe.com"]`; the host opens
 * the vault entry for one request and only if the entry says it opens `api.stripe.com` (`keyRefused` in
 * `packages/host/src/script.ts`). Nothing in the pack file is a key, and the last tests look at the serialised file.
 *
 * RED FIRST, MEASURED: with no `stripe.js` and no `stripe.pack.json` this file failed at its first
 * read, ENOENT, before a single test ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { exponentOf, fillConfig, openRecord, type Declaration } from '../../packages/kernel/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import type { CtxHost, HostRequest, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { REGISTERS, firstPartyDocument } from '../../packages/seed/src/index.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('stripe.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('stripe.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { pack: string; declarations: Record<string, unknown>[]; extends?: Record<string, unknown>; config: Record<string, { default: Json }> };

/** Each setting's default, read from the file, so a test never holds a second copy of what the file says. */
const DEFAULTS: Record<string, Json> = Object.fromEntries(Object.entries(PACK.config).map(([k, c]) => [k, c.default]));

/** What `ctx.config` holds for a run: the settings' defaults and whatever `set` changes. */
const configOf = (set: Record<string, Json> = {}): Json => ({ ...DEFAULTS, ...set });

/**
 * The script's declaration as a record stores it, every `{{config:<key>}}` filled through the kernel's own
 * `fillConfig`, which is what a plan does before it installs. `RAW` is the file as it ships.
 */
const scriptOf = (set: Record<string, Json> = {}) =>
  (fillConfig(PACK.declarations as unknown as Json, { ...DEFAULTS, ...set }) as unknown as Record<string, unknown>[]).find((d) => typeof d.script === 'string') as Script;
type Script = {
  script: string;
  runs: Record<string, unknown>;
  egress: string[];
  keys: string[];
  reads: string[];
  writes: string[];
  limits?: Record<string, number>;
  source: string;
};
const RAW = PACK.declarations.find((d) => typeof d.script === 'string') as Script;
const SCRIPT = scriptOf();

const NOW = '2026-09-25T09:00:00.000Z';
const TODAY = NOW.slice(0, 10);
const API = 'https://api.stripe.com';

/* ── Stripe's answers ─────────────────────────────────────────────────────────────────────────── */

/**
 * `/v1/balance` as Stripe answers it: minor units, lower-case currencies, one entry per currency under each kind.
 * `source_types` rides along because Stripe sends it and the script must not read it as a second amount.
 */
const BALANCE = {
  object: 'balance',
  livemode: false,
  available: [
    { amount: 1_842_050, currency: 'usd', source_types: { card: 1_842_050 } },
    { amount: 31_000, currency: 'eur', source_types: { card: 31_000 } },
  ],
  pending: [
    { amount: 250_000, currency: 'usd', source_types: { card: 250_000 } },
    { amount: 0, currency: 'eur', source_types: { card: 0 } },
  ],
};

/** One payout as `/v1/payouts` answers it. `arrival_date` is Unix seconds, and it is a date, not a moment. */
const payout = (id: string, amount: number, currency: string, arrives: string, status = 'in_transit') => ({
  id,
  object: 'payout',
  amount,
  currency,
  arrival_date: Date.parse(`${arrives}T00:00:00Z`) / 1000,
  created: Date.parse('2026-09-23T10:00:00Z') / 1000,
  status,
  method: 'standard',
});

/**
 * Two dollar payouts in transit, the later one listed first, one in euros, and one in euros still pending, which lands
 * before the euro one in transit.
 */
const ON_ITS_WAY = {
  object: 'list',
  has_more: false,
  url: '/v1/payouts',
  data: [
    payout('po_b', 120_000, 'usd', '2026-09-28'),
    payout('po_a', 80_000, 'usd', '2026-09-26'),
    payout('po_c', 5_000, 'eur', '2026-09-29'),
    payout('po_d', 3_000, 'eur', '2026-09-27', 'pending'),
  ],
};

/** `/v1/payouts` for one request: the list kept to the `status` the address names, as Stripe keeps it. */
const payoutsAt = (payouts: unknown, url: URL): unknown => {
  const list = payouts as { data?: { status: string }[] };
  return { ...list, data: (list.data ?? []).filter((p) => p.status === url.searchParams.get('status')) };
};

/* ── A pull cannot say it ─────────────────────────────────────────────────────────────────────── */

test('RED, AND IT STAYS RED: A PULL OVER A TWO-CURRENCY BALANCE WRITES BOTH CURRENCIES INTO ONE ROW NAME, so the dollars are lost', async () => {
  /* THE BEST PULL AVAILABLE. `money` reads its currency from a second path, which is the part a pull can do; `name`
     is `{ value }` or `{ path }`, and neither puts the currency into it. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.parse(NOW)));
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const pull = {
    ingest: 'stripe_balance',
    channel: 'pull',
    every: '1h',
    fetch: {
      base: API,
      path: '/v1/balance',
      method: 'GET',
      auth: { kind: 'bearer', grant: 'stripe' },
      schedule: { every: '1h' },
      read: { rows: 'available' },
      page: { kind: 'none' },
    },
    map: {
      name: { value: 'Stripe available' },
      kind: { value: 'bank' },
      balance: { path: ['amount', 'currency'], type: 'money', minor: true },
      as_of: { arrived: true },
      liquid: { value: true },
    },
    writes: { register: 'accounts', confidence: 'exact' },
    dedupe: ['name'],
    on_conflict: 'update',
  };
  const decls: Declaration[] = [
    { id: 'register.accounts', kind: 'register', body: REGISTERS.accounts as never },
    /* register.accounts.book (money-core 3.1.0) points at books, so this minimal install carries books too. */
    { id: 'register.books', kind: 'register', body: REGISTERS.books as never },
    { id: 'ingest.stripe_balance', kind: 'ingest', body: pull as never },
  ];
  const put = await k.install(decls);
  assert.ok(put.ok, fixOf(put));
  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts) VALUES ('ob_1', ?, 'pull.fetch', ?, 'leased', ?, 1)`,
    NOW,
    JSON.stringify({ ingest: pull.ingest }),
    new Date(Date.parse(NOW) + 300_000).toISOString(),
  );
  const page = JSON.stringify(BALANCE);
  const got = k.extract(pull as never, { ts: NOW, body: page });
  assert.equal(got.rows.length, 2, 'both currencies were read');
  const out = k.applyPage({ outbox: 'ob_1', n: 1, raw: { sha256: 'a'.repeat(64), headers: {}, bytes: page.length, body: null, state: 'matched' }, rows: got.rows, cursor: { watermark: null } });
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(accountsIn(sql), [['Stripe available', 31_000, 'EUR']], 'the dollars survived a pull after all, so a pull may do');
  sql.close();
});

/** Every account row, as name, amount and currency, by name. */
const accountsIn = (sql: Pick<NodeSql, 'all'>): [string, number, string][] =>
  sql
    .all<{ name: string; amount: number; currency: string }>(
      `SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.balance.amount') AS amount, json_extract(fields, '$.balance.currency') AS currency
       FROM entry WHERE register = 'accounts' AND deleted_at IS NULL ORDER BY name`,
    )
    .map((r) => [r.name, r.amount, r.currency]);

/* ── The pack ──────────────────────────────────────────────────────────────────────────────────── */

test('THE PACK CARRIES stripe.js AS ITS SOURCE, byte for byte, and asks for one host, the key its setting names, and two lists', async () => {
  assert.equal(RAW.source, SOURCE, 'stripe.pack.json and stripe.js disagree; copy stripe.js into the source');
  assert.deepEqual(RAW.runs, { every: '1h' });
  assert.deepEqual(RAW.egress, [API]);
  /* THE KEY IS THE `grant` SETTING (1.4.0), filled at install, `stripe` unless a person sets another. The source reads
     the same setting from `ctx.config`, so the key it asks with is the key it declares. */
  assert.deepEqual(RAW.keys, ['{{config:grant}}']);
  assert.deepEqual(SCRIPT.keys, ['stripe']);
  assert.deepEqual(scriptOf({ grant: 'Ops' }).keys, ['Ops']);
  assert.ok(SOURCE.includes('keyOf(ctx.config)') && SOURCE.includes('bookOf(ctx.config)'), 'stripe.js no longer reads its key and its book from its settings');
  assert.equal(SOURCE.includes('{{config:'), false, 'a setting is written into the source again, where a change to it does nothing');
  /* BOOKS, TO KNOW THE BOOK THE SETTING NAMES BY THE ID THE RECORD HOLDS, so a row in another book is moved. */
  assert.deepEqual(RAW.reads, ['accounts', 'books']);
  assert.deepEqual(RAW.writes, ['accounts']);
  /* THE BALANCE, THE PAYOUTS IN TRANSIT AND THE PAYOUTS PENDING, and not one request more, which the first run below
     counts. */
  assert.deepEqual(RAW.limits, { fetches: 3 });
  /* money-core 3.1.0 AND NOT EARLIER: 3.0.0's walk brings a payout in on the day it lands (`accounts.arrives`), and
     3.1.0 has the `books` the `book` setting (1.2.0) files each row in. 3.31.0 SINCE 1.5.0, whose accounts declare the
     `no_feed` the script marks each row it keeps with. */
  const doc = JSON.parse(TEXT) as { version: string; requires: { packs: Record<string, string> }; config: Record<string, unknown> };
  /* 1.5.1 SINCE 2 November (1767124b5): a refused key is said by its name in the keychain. 1.5.2 SINCE 3 November (7c5f888b3): plugin in its words. */
  assert.equal(doc.version, '1.5.2');
  assert.deepEqual(doc.requires.packs, { 'money-core': '>=3.31.0 <4.0.0' });
  assert.deepEqual(Object.keys(doc.config), ['grant', 'book']);
  assert.deepEqual([DEFAULTS.grant, DEFAULTS.book], ['stripe', 0]);
  /* THE FIELD THE PACK FINDS ITS ROWS BY, laid on Accounts, with words a person reads for each kind. */
  const laid = (PACK.extends?.['register.accounts'] as { fields: { id: string; type: string; values?: string[]; labels?: Record<string, string> }[] }).fields;
  const kind = laid.find((f) => f.id === 'stripe_kind');
  assert.deepEqual([kind?.type, kind?.values, kind?.labels], ['enum', ['available', 'pending', 'in_transit'], { available: 'Available', pending: 'Pending', in_transit: 'In transit' }]);
  /* A CHANGES LINE A PERSON READS: plain words, no dash, no id. */
  const changes = (doc as unknown as { changes: string }).changes;
  assert.match(changes, /Says plugin where it said add-on/);
  assert.equal(/\u2014|books#|\brows?\b/.test(changes), false, changes);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'stripe');
});

/* ── The script, in QuickJS ────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

/**
 * The leaves of a predicate tree the script writes, read as the record reads them: `in`, `is`, `empty` and a `starts`
 * that folds case. Enough to tell a script that asked for the right rows from one that asked for everything.
 */
function holds(row: Row, where: Json): boolean {
  if (where === null) return true;
  const w = where as Record<string, Json>;
  if (Array.isArray(w.all)) return w.all.every((x) => holds(row, x));
  const value = row.fields[String(w.field)];
  if ('in' in w) return (w.in as Json[]).includes(value ?? null);
  if ('is' in w) return value === w.is;
  if ('empty' in w) return value === undefined || value === null || value === '';
  if ('starts' in w) return typeof value === 'string' && value.toLowerCase().startsWith(String(w.starts).toLowerCase());
  throw new Error(`the double does not read ${JSON.stringify(where)}`);
}

/** The books a host double holds, by the number a setting names. */
const BOOKS: Record<string, Json> = { 'books#2': { id: '01K5BOOK000000000000000002', register: 'books', seq: 2, fields: { name: 'Harbour' }, version: 1 } };

/**
 * A host double that answers Stripe's two addresses, records every request, lists `accounts` by the filter the script
 * sends, and gets a book by its number.
 */
function stripeHost(
  answers: { balance: unknown; payouts: unknown; status?: number },
  accounts: Row[] = [],
  set: Record<string, Json> = {},
): CtxHost & { asked: HostRequest[]; filters: Json[]; got: string[] } {
  const asked: HostRequest[] = [];
  const filters: Json[] = [];
  const got: string[] = [];
  return {
    asked,
    filters,
    got,
    fetch: async (request) => {
      asked.push(request);
      const url = new URL(request.url);
      const body = url.pathname === '/v1/balance' ? answers.balance : url.pathname === '/v1/payouts' ? payoutsAt(answers.payouts, url) : { error: { message: 'No such route' } };
      return { status: answers.status ?? 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    },
    list: async (register, where) => {
      filters.push(where);
      return register === 'accounts' ? (accounts.filter((a) => holds(a, where)) as unknown as Json[]) : [];
    },
    get: async (spoken) => {
      got.push(spoken);
      return BOOKS[spoken] ?? null;
    },
    now: () => NOW,
    tz: 'UTC',
    input: null,
    config: configOf(set),
  };
}

/* THE TWO LISTS A RUN ASKS FOR: the pack's own rows by `stripe_kind`, and the ones not marked yet that could be a
   Stripe balance. Never a list by a name the pack wrote. */
const OWN = { field: 'stripe_kind', in: ['available', 'pending', 'in_transit'] };
const LOOSE = { all: [{ field: 'name', starts: 'Stripe' }, { field: 'stripe_kind', empty: true }, { field: 'kind', is: 'bank' }] };

const declOf = (set: Record<string, Json> = {}): ScriptDecl => {
  const script = scriptOf(set);
  return {
    id: script.script,
    version: 1,
    egress: script.egress,
    keys: script.keys,
    reads: script.reads,
    writes: script.writes,
    ...(script.limits === undefined ? {} : { limits: script.limits }),
    source: script.source,
  };
};

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

/** The `stripe_kind` a new row's name says. */
const kindOf = (name: string): string => (name.includes('payout in transit') ? 'in_transit' : name.includes('pending') ? 'pending' : 'available');

const created = (name: string, amount: number, currency: string, liquid: boolean, arrives?: string, book?: string): ScriptWrite => ({
  op: 'create',
  register: 'accounts',
  fields: {
    name,
    kind: 'bank',
    balance: { amount, currency },
    as_of: TODAY,
    liquid,
    ...(arrives === undefined ? {} : { arrives }),
    stripe_kind: kindOf(name),
    no_feed: false,
    ...(book === undefined ? {} : { book }),
  },
});

test('ONE ROW A KIND AND A CURRENCY, AND ONE PAYOUT ROW A CURRENCY: the payouts summed, dated by the soonest to land', async () => {
  const h = stripeHost({ balance: BALANCE, payouts: ON_ITS_WAY });
  const a = await runInQuickJs(declOf(), h);
  assert.deepEqual(writesOf(a), [
    created('Stripe available EUR', 31_000, 'EUR', true),
    created('Stripe available USD', 1_842_050, 'USD', true),
    /* 5,000 IN TRANSIT AND 3,000 STILL PENDING, dated by the pending one, which lands first. While the pack asked for
       payouts in transit alone the 3,000 was in no row at all: it had left the available balance and was not on its
       way yet. */
    created('Stripe payout in transit EUR', 8_000, 'EUR', false, '2026-09-27'),
    /* 120,000 AND 80,000 CENTS, and the one listed second lands first. A script that took the first payout's date
       would say the 28th, two days after the money is in the bank. NOT CASH, because it is not in the bank yet:
       money-core walks it in as money on the day it lands. */
    created('Stripe payout in transit USD', 200_000, 'USD', false, '2026-09-26'),
    created('Stripe pending EUR', 0, 'EUR', false),
    created('Stripe pending USD', 250_000, 'USD', false),
  ]);

  /* THREE REQUESTS, ALL TO STRIPE, ALL NAMING THE KEY BY ITS LABEL, which is the declared `limits.fetches`. The payouts
     are asked for in transit and pending only, so a paid payout, already in the bank's balance, is never counted
     twice. */
  assert.deepEqual(
    h.asked.map((r) => [r.method, r.url, r.key]),
    [
      ['GET', `${API}/v1/balance`, 'stripe'],
      ['GET', `${API}/v1/payouts?status=in_transit&limit=100`, 'stripe'],
      ['GET', `${API}/v1/payouts?status=pending&limit=100`, 'stripe'],
    ],
  );
  assert.equal(h.asked.length, SCRIPT.limits?.fetches);
  assert.deepEqual(h.filters, [OWN, LOOSE]);
  assert.deepEqual(h.got, [], 'a book was read with the book setting at 0');
});

/** An account a person typed, with no `stripe_kind`: by hand, or by this pack before 1.4.0. */
let minted = 0;
const typed = (name: string, amount: number, currency: string, as_of = '2026-09-24', extra: Record<string, Json> = {}): Row => {
  minted += 1;
  return {
    id: `01K5STRIPE${String(minted).padStart(16, '0')}`,
    register: 'accounts',
    seq: minted,
    fields: { name, kind: 'bank', balance: { amount, currency }, as_of, liquid: true, ...extra },
    version: 3,
    updated_at: '2026-09-24T09:00:00.000Z',
  };
};

/** A row this pack wrote on an earlier hour, marked with the `stripe_kind` its name says. */
const held = (name: string, amount: number, currency: string, as_of = '2026-09-24', extra: Record<string, Json> = {}): Row =>
  typed(name, amount, currency, as_of, { stripe_kind: kindOf(name), no_feed: false, ...extra });

test('THE NEXT HOUR UPDATES IN PLACE: a payout that landed goes to zero, an unmoved row is left alone, and a person’s own Stripe account is not touched', async () => {
  const usd = held('Stripe available USD', 1_842_050, 'USD', TODAY);
  const eur = held('Stripe available EUR', 30_000, 'EUR');
  const transit = held('Stripe payout in transit USD', 200_000, 'USD', '2026-09-24', { arrives: '2026-09-25' });
  /* A ROW A PERSON KEEPS UNDER A NAME THAT STARTS THE SAME WAY. The prefix lets it through, and only the exact names
     this pack writes are the pack's, so it is neither zeroed nor rewritten. */
  const theirs = typed('Stripe reserve (kept by hand)', 1_000_000, 'USD');
  const settled = { ...BALANCE, pending: [] };
  const a = await runInQuickJs(declOf(), stripeHost({ balance: settled, payouts: { ...ON_ITS_WAY, data: [] } }, [usd, eur, transit, theirs]));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${eur.seq}`, patch: { balance: { amount: 31_000, currency: 'EUR' }, as_of: TODAY }, version: 3 },
    /* THE DOLLARS LANDED, so the row says nothing is on its way rather than standing at 2,000.00 beside the bank
       balance that now holds the same money. */
    { op: 'update', spoken: `accounts#${transit.seq}`, patch: { balance: { amount: 0, currency: 'USD' }, as_of: TODAY, arrives: null }, version: 3 },
  ]);
});

test('A PAYOUT ROW WRITTEN BEFORE 1.1.0 STOPS COUNTING AS CASH, so the money is not in Cash now and in the walk as well', async () => {
  /* WRITTEN AS CASH BY 1.0.x, with nothing else about it out of date. The next hour sets it not cash and changes
     nothing else. */
  const transit = held('Stripe payout in transit USD', 200_000, 'USD', TODAY, { arrives: '2026-09-26' });
  const payouts = { ...ON_ITS_WAY, data: ON_ITS_WAY.data.filter((p) => p.currency === 'usd') };
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [], pending: [] }, payouts }, [transit]));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `accounts#${transit.seq}`, patch: { balance: { amount: 200_000, currency: 'USD' }, as_of: TODAY, arrives: '2026-09-26', liquid: false }, version: 3 }]);
});

test('A STRIPE BALANCE TYPED IN BY HAND BEFORE THE PACK IS TAKEN OVER ON THE FIRST RUN, and no other Stripe row is', async () => {
  /* "Stripe" WITH ITS CURRENCY ONLY IN ITS BALANCE, AND "Stripe EUR" WITH IT IN ITS NAME, both typed a week ago. The
     first run renames each to the available row of its currency and sets it from Stripe, where it used to write that
     row beside it, so Cash now counted the dollars twice. */
  const dollars = typed('Stripe', 1_800_000, 'USD', '2026-09-18');
  const euros = typed('Stripe EUR', 30_000, 'EUR', '2026-09-18');
  const theirs = typed('Stripe reserve', 1_000_000, 'USD');
  const a = await runInQuickJs(declOf(), stripeHost({ balance: BALANCE, payouts: ON_ITS_WAY }, [dollars, euros, theirs]));
  assert.deepEqual(writesOf(a), [
    {
      op: 'update',
      spoken: `accounts#${dollars.seq}`,
      patch: { stripe_kind: 'available', kind: 'bank', balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY, liquid: true, no_feed: false },
      version: 3,
    },
    {
      op: 'update',
      spoken: `accounts#${euros.seq}`,
      patch: { stripe_kind: 'available', kind: 'bank', balance: { amount: 31_000, currency: 'EUR' }, as_of: TODAY, liquid: true, no_feed: false },
      version: 3,
    },
    /* AND NO AVAILABLE ROW IS WRITTEN BESIDE THEM. "Stripe reserve" is in no write. */
    created('Stripe payout in transit EUR', 8_000, 'EUR', false, '2026-09-27'),
    created('Stripe payout in transit USD', 200_000, 'USD', false, '2026-09-26'),
    created('Stripe pending EUR', 0, 'EUR', false),
    created('Stripe pending USD', 250_000, 'USD', false),
  ]);
  /* MARKED, NOT RENAMED, SINCE 1.4.0: the pack finds it by `stripe_kind` from now on, so the name a person gave it
     stays. */
  assert.match(a.log, /Took over "Stripe": it holds the Stripe balance in USD/);
  assert.match(a.log, /Took over "Stripe EUR": it holds the Stripe balance in EUR/);
});

test('A HAND ROW BESIDE ONE THE PACK ALREADY KEEPS IS LEFT AS IT IS AND SAID, so the pack never takes a row over twice', async () => {
  /* THE PACK'S OWN ROW WINS: it is Stripe's figure already, and a second rename would be two rows under one name. */
  const ours = held('Stripe available USD', 1_842_050, 'USD', TODAY);
  const hand = typed('Stripe USD', 1_800_000, 'USD', '2026-09-18');
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_842_050, currency: 'usd' }], pending: [] }, payouts: { ...ON_ITS_WAY, data: [] } }, [ours, hand]));
  assert.deepEqual(writesOf(a), []);
  assert.match(a.log, /"Stripe USD" was typed in by hand and "Stripe available USD" is already kept from Stripe, so both count/);
});

test('A KEY STRIPE REFUSES STOPS THE RUN WITH A SENTENCE AND WRITES NOTHING, which is what pauses the script after three', async () => {
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } }, payouts: {}, status: 401 }));
  assert.ok('refused' in a, JSON.stringify(a));
  /* `null` BECAUSE IT IS THE SCRIPT'S OWN ERROR and not a rule of the sandbox's. `script-run.ts` counts three refused
     runs in a row and pauses the script, which is the pull's 401 pause said by the only means a script has. */
  assert.equal(a.refused.code, null);
  assert.match(a.refused.why, /Stripe refused the key "Stripe \(read only\)" \(401\)/);
});

/* ── The settings, read on every run (1.4.0) ───────────────────────────────────────────────────── */

test('THE KEY IS THE ONE ITS SETTING NAMES, read on every run, and nothing is asked with none set', async () => {
  /* A LABEL THE OWNER SET, filled into the declaration's `keys` at install and read by the source from `ctx.config`, so
     the key the script asks with is the key it declares. Before 1.4.0 the label was "stripe" in the source itself. */
  const h = stripeHost({ balance: { available: [], pending: [] }, payouts: { data: [] } }, [], { grant: 'Harbour Stripe' });
  const a = await runInQuickJs(declOf({ grant: 'Harbour Stripe' }), h);
  assert.ok('writes' in a, JSON.stringify(a));
  assert.ok(h.asked.length === 3 && h.asked.every((r) => r.key === 'Harbour Stripe'), JSON.stringify(h.asked));

  const none = stripeHost({ balance: BALANCE, payouts: ON_ITS_WAY }, [], { grant: '  ' });
  const refused = await runInQuickJs(declOf(), none);
  assert.ok('refused' in refused, JSON.stringify(refused));
  assert.match(refused.refused.why, /No key is set, so Stripe was not asked/);
  assert.equal(none.asked.length, 0);
});

test('THE BOOK IS THE ONE ITS SETTING NAMES ON THIS RUN: new rows are filed in it, and a row in another book moves to it', async () => {
  /* BEFORE 1.4.0 THE BOOK WAS WRITTEN INTO THE SOURCE AT INSTALL, so a changed setting did nothing, and a row already
     in a book was never moved. Now the run reads the setting, asks the record for that book, and moves a row that is
     elsewhere. A row already in it is left alone. */
  const elsewhere = held('Stripe available USD', 1_842_050, 'USD', TODAY, { book: '01K5BOOK000000000000000001' });
  const there = held('Stripe available EUR', 31_000, 'EUR', TODAY, { book: '01K5BOOK000000000000000002' });
  const h = stripeHost({ balance: { available: BALANCE.available, pending: [{ amount: 250_000, currency: 'usd' }] }, payouts: { data: [] } }, [elsewhere, there], { book: 2 });
  const a = await runInQuickJs(declOf({ book: 2 }), h);
  assert.deepEqual(h.got, ['books#2']);
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${elsewhere.seq}`, patch: { balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY, book: 'books#2' }, version: 3 },
    created('Stripe pending USD', 250_000, 'USD', false, undefined, 'books#2'),
  ]);

  /* A BOOK THAT IS GONE FILES NOTHING AND SAYS SO, in words, and the balances are still kept. */
  const gone = stripeHost({ balance: { available: [{ amount: 100, currency: 'usd' }], pending: [] }, payouts: { data: [] } }, [], { book: 9 });
  const b = await runInQuickJs(declOf({ book: 9 }), gone);
  assert.deepEqual(writesOf(b), [created('Stripe available USD', 100, 'USD', true)]);
  assert.match(b.log, /Book 9 is not in Books, so the Stripe accounts were not filed/);
});

test('A ROW IS FOUND BY ITS KIND AND CURRENCY, NOT ITS NAME: one a person renamed is still kept, and nothing is written beside it', async () => {
  const renamed = held('Harbour on Stripe', 1_800_000, 'USD', '2026-09-24', { stripe_kind: 'available' });
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_842_050, currency: 'usd' }], pending: [] }, payouts: { data: [] } }, [renamed]));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `accounts#${renamed.seq}`, patch: { balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY }, version: 3 }]);
});

test('A SECOND ROW AT ONE ADDRESS IS SAID AND LEFT, and the oldest is the one kept', async () => {
  const first = held('Stripe available USD', 1_800_000, 'USD');
  const copy = held('Stripe available USD (copy)', 1_800_000, 'USD', '2026-09-24', { stripe_kind: 'available' });
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_842_050, currency: 'usd' }], pending: [] }, payouts: { data: [] } }, [copy, first]));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `accounts#${first.seq}`, patch: { balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY }, version: 3 }]);
  assert.match(a.log, /"Stripe available USD \(copy\)" is a second Stripe account for the same money as "Stripe available USD"/);
});

test('THE ROWS THIS PACK WROTE BEFORE 1.4.0 ARE MARKED ON THE FIRST RUN, by the names it wrote, so an upgrade writes nothing twice', async () => {
  /* NO `stripe_kind`, BECAUSE 1.3.0 HAD NONE TO WRITE. Each is marked with the kind its name says, once, and is found
     by the mark from then on. A name a person changed after 1.3.0 is not one the pack wrote, and is left. */
  const usd = typed('Stripe available USD', 1_842_050, 'USD', TODAY);
  const pending = typed('Stripe pending USD', 250_000, 'USD', TODAY, { liquid: false });
  const transit = typed('Stripe payout in transit USD', 200_000, 'USD', TODAY, { liquid: false, arrives: '2026-09-26' });
  const payouts = { data: ON_ITS_WAY.data.filter((p) => p.currency === 'usd') };
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_842_050, currency: 'usd' }], pending: [{ amount: 250_000, currency: 'usd' }] }, payouts }, [usd, pending, transit]));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${usd.seq}`, patch: { balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY, stripe_kind: 'available', no_feed: false }, version: 3 },
    { op: 'update', spoken: `accounts#${transit.seq}`, patch: { balance: { amount: 200_000, currency: 'USD' }, as_of: TODAY, arrives: '2026-09-26', stripe_kind: 'in_transit', no_feed: false }, version: 3 },
    { op: 'update', spoken: `accounts#${pending.seq}`, patch: { balance: { amount: 250_000, currency: 'USD' }, as_of: TODAY, stripe_kind: 'pending', no_feed: false }, version: 3 },
  ]);
});

/* ── Take-over (1.4.0) ─────────────────────────────────────────────────────────────────────────── */

test('HIS CASE: "Stripe available" in dollars, filed in a book, is taken over and kept in that book, and cash holds Stripe once', async () => {
  /* THE NAME ON HIS RECORD (the dump's `accounts.json`). 1.3.0 took over "Stripe" and "Stripe USD" only, so this one
     stood beside a new "Stripe available USD" and Cash now held the dollars twice. With the book setting at 0 it stays
     in the book he filed it in. */
  const his = typed('Stripe available', 1_800_000, 'USD', '2026-09-18', { book: '01K5BOOK000000000000000002' });
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_842_050, currency: 'usd' }], pending: [{ amount: 250_000, currency: 'usd' }] }, payouts: { data: [ON_ITS_WAY.data[0]] } }, [his]));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${his.seq}`, patch: { stripe_kind: 'available', kind: 'bank', balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY, liquid: true, no_feed: false }, version: 3 },
    created('Stripe payout in transit USD', 120_000, 'USD', false, '2026-09-28'),
    created('Stripe pending USD', 250_000, 'USD', false),
  ]);
  /* ONE AVAILABLE ACCOUNT IN DOLLARS, AND IT IS HIS: no write names a second. */
  const available = writesOf(a).filter((w) => w.op === 'create' && (w.fields as Record<string, Json>).stripe_kind === 'available');
  assert.deepEqual(available, []);
  assert.match(a.log, /Took over "Stripe available"/);
});

test('TWO ACCOUNTS THAT COULD BE THE STRIPE BALANCE: nothing is written, and the run ends naming both', async () => {
  /* NOT GUESSED BETWEEN. Taking the wrong one would set a balance a person keeps for something else; taking both would
     count Stripe twice. The run is refused, which shows on Scripts and trips `feeds-behind` until one is renamed. */
  const one = typed('Stripe', 1_800_000, 'USD', '2026-09-18');
  const two = typed('stripe balance', 1_790_000, 'USD', '2026-09-19');
  const h = stripeHost({ balance: BALANCE, payouts: ON_ITS_WAY }, [one, two]);
  const a = await runInQuickJs(declOf(), h);
  assert.ok('refused' in a, JSON.stringify(a));
  /* THE SANDBOX SAYS WHOSE ERROR IT IS FIRST ("stripe threw: "); the sentence is the script's. */
  assert.ok(a.refused.why.endsWith(': Two accounts could be the Stripe balance: "Stripe" and "stripe balance". Rename one.'), a.refused.why);
  /* NO ID, NO DASH AND NO "row" IN WHAT A PERSON READS. */
  assert.equal(/—|#|\brows?\b/.test(a.refused.why), false);

  /* RENAMED, THE NEXT RUN TAKES THE ONE LEFT. */
  const kept = { ...two, fields: { ...two.fields, name: 'Savings (not Stripe)' } };
  const b = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_842_050, currency: 'usd' }], pending: [] }, payouts: { data: [] } }, [one, kept]));
  assert.deepEqual(writesOf(b), [
    { op: 'update', spoken: `accounts#${one.seq}`, patch: { stripe_kind: 'available', kind: 'bank', balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY, liquid: true, no_feed: false }, version: 3 },
  ]);
});

test('WHICH NAMES ARE A TYPED STRIPE BALANCE: "stripe", at most one of "available" or "balance", at most one currency code, any case', async () => {
  /* EACH IN A CURRENCY OF ITS OWN, so no two are in doubt and each is either taken or left. */
  const names: [string, string, boolean][] = [
    ['STRIPE', 'USD', true],
    ['Stripe balance EUR', 'EUR', true],
    ['stripe GBP available', 'GBP', true],
    ['Stripe available balance', 'CAD', false],
    ['Stripe reserve', 'AUD', false],
    ['Stripe USD EUR', 'CHF', false],
    ['Stripey', 'NZD', false],
  ];
  const rows = names.map(([name, currency]) => typed(name, 100, currency));
  const balance = { available: names.map(([, currency]) => ({ amount: 500, currency: currency.toLowerCase() })), pending: [] };
  const a = await runInQuickJs(declOf(), stripeHost({ balance, payouts: { data: [] } }, rows));
  const took = writesOf(a).filter((w) => w.op === 'update').map((w) => rows.find((r) => `accounts#${r.seq}` === w.spoken)?.fields.name);
  assert.deepEqual(took, names.filter(([, , yes]) => yes).map(([name]) => name));
  /* A CARD IS NOT A STRIPE BALANCE, whatever it is called: only a bank account is asked about. */
  assert.equal(holds(typed('Stripe', 1, 'USD', TODAY, { kind: 'card' }), LOOSE), false);
});

/* ── Stripe's special units (1.4.0) ────────────────────────────────────────────────────────────── */

/**
 * EACH CURRENCY STRIPE'S PAGE OF CURRENCIES NAMES AS ZERO-DECIMAL, THREE-DECIMAL OR A SPECIAL CASE: what Stripe sends
 * for one amount, what the record must keep, and the decimals the record keeps it in. Written out here, not read from
 * the script, so a change to the script's table fails a line of its own.
 */
const SPECIAL: [string, number, number, number][] = [
  /* Zero-decimal: 500 is 500 units. */
  ['BIF', 500, 500, 0], ['CLP', 500, 500, 0], ['DJF', 500, 500, 0], ['GNF', 500, 500, 0], ['JPY', 500, 500, 0],
  ['KMF', 500, 500, 0], ['KRW', 500, 500, 0], ['PYG', 500, 500, 0], ['RWF', 500, 500, 0], ['VND', 500, 500, 0],
  ['VUV', 500, 500, 0], ['XAF', 500, 500, 0], ['XOF', 500, 500, 0], ['XPF', 500, 500, 0],
  /* Zero-decimal at Stripe and kept in hundredths by the record: 500 ariary is 50000. */
  ['MGA', 500, 50_000, 2],
  /* Three-decimal: thousandths on both sides, the last digit 0 as Stripe asks. */
  ['BHD', 1_230, 1_230, 3], ['JOD', 1_230, 1_230, 3], ['KWD', 1_230, 1_230, 3], ['OMR', 1_230, 1_230, 3], ['TND', 1_230, 1_230, 3],
  /* Special cases. ISK and UGX: hundredths "for backward compatibility", always ending 00, kept whole: 500 is 5. */
  ['ISK', 500, 5, 0], ['UGX', 500, 5, 0],
  /* HUF and TWD: paid out whole, but the API sends hundredths, as the record keeps them. */
  ['HUF', 1_045, 1_045, 2], ['TWD', 80_045, 80_045, 2],
];

for (const [currency, sent, kept, decimals] of SPECIAL)
  test(`STRIPE'S UNIT FOR ${currency}: ${sent} from Stripe is ${kept} in the record`, async () => {
    /* THE RECORD'S DECIMALS ARE THE KERNEL'S, so the two tables cannot drift apart without this line going red. */
    assert.equal(exponentOf(currency), decimals, `the record keeps ${currency} in ${exponentOf(currency)} decimals`);
    const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: sent, currency: currency.toLowerCase() }], pending: [] }, payouts: { data: [] } }));
    assert.deepEqual(writesOf(a), [created(`Stripe available ${currency}`, kept, currency, true)]);
  });

test('EVERY CURRENCY IN THE SCRIPT\'S TABLE HAS A LINE ABOVE, and one it does not name passes through', async () => {
  const table = /export const UNITS = \{([^}]*)\}/.exec(SOURCE)?.[1] ?? '';
  const named = [...table.matchAll(/([A-Z]{3}):/g)].map((m) => m[1]).sort();
  assert.deepEqual(named, SPECIAL.map(([c]) => c).sort());
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [{ amount: 1_234, currency: 'egp' }], pending: [] }, payouts: { data: [] } }));
  assert.deepEqual(writesOf(a), [created('Stripe available EGP', 1_234, 'EGP', true)]);
});

test('A PAYOUT IN A SPECIAL UNIT IS MOVED AS THE BALANCE IS: ISK on its way is whole krónur', async () => {
  const isk = { data: [payout('po_isk', 1_500_000, 'isk', '2026-09-27')] };
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { available: [], pending: [] }, payouts: isk }));
  assert.deepEqual(writesOf(a), [created('Stripe payout in transit ISK', 15_000, 'ISK', false, '2026-09-27')]);
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: installed from the file, the key opened for api.stripe.com only, and six accounts written', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-stripe-'));
  const sent: { host: string; path: string; auth: string | null }[] = [];
  let answers: { balance: unknown; payouts: unknown } = { balance: BALANCE, payouts: ON_ITS_WAY };
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: {
      /* NOT A KEY: a word that names whose it is, so a leak would say where it came from. */
      openKey: async (grant) => (grant.label === 'stripe' ? 'KEY-OF-stripe' : null),
      send: async (url, init) => {
        sent.push({ host: url.host, path: `${url.pathname}${url.search}`, auth: new Headers(init.headers).get('authorization') });
        const body = url.pathname === '/v1/balance' ? answers.balance : payoutsAt(answers.payouts, url);
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      },
      resolve: async (host) => (host === 'api.stripe.com' ? [{ address: '203.0.113.10', family: 4 }] : []),
    },
  });
  try {
    const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
    const put = async (doc: unknown): Promise<string[]> => {
      const planned = await api.planPack({ doc, source: { kind: 'local' } } as never, owner);
      assert.ok(planned.ok, fixOf(planned as never));
      const diff = (planned.value as { diff: { planHash: string; approve: string[] } }).diff;
      const done = await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner);
      assert.ok(done.ok, fixOf(done as never));
      return diff.approve;
    };
    for (const id of ['portfolio', 'people', 'money-core']) await put(firstPartyDocument(id, { seeds: [] }));
    /* money-core 3.0.0 DECLARES `arrives` ITSELF (`accounts.arrives`, contracts §4.3a), in the very shape this pack lays
       it, so the pack's `extends` lays nothing here and is not refused as a second field under that id. The extension
       is the one 1.0.0 shipped with, before money-core declared the field, and since 1.1.0 asks for money-core 3.0.0 it
       lays nothing on any record this version installs on. */
    const before = api.kernel.register('accounts')?.fields.map((f) => f.id) ?? [];
    assert.equal(before.includes('arrives'), true, 'money-core 3.0.0 does not say when money arrives');
    /* THE VAULT ENTRY FIRST, because install refused the pack without it: "Add the key called "stripe" to the vault,
       then install." It is a row, a label and what it opens and no bytes, because `openKey` above is the key store. */
    running.sql.exec(
      "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at) VALUES ('g_stripe', 'stripe', 'api.stripe.com', 'api_token', 'none', 'kek', 'k_test', ?)",
      NOW,
    );
    const laid = (await api.planPack({ doc: PACK, source: { kind: 'local' } } as never, owner)) as { ok: boolean; value?: { diff: { extends: { id: string; adds: string[]; refusal?: unknown }[] } } };
    assert.ok(laid.ok, fixOf(laid as never));
    /* `stripe_kind` AND NOTHING ELSE: the field the pack finds its rows by (1.4.0), and no second arrives over
       money-core's. */
    assert.deepEqual(
      laid.value?.diff.extends.map((e) => ({ id: e.id, adds: e.adds })),
      [{ id: 'register.accounts', adds: ['stripe_kind'] }],
      'the pack laid a second arrives over money-core\'s, or not its kind',
    );
    const approve = await put(PACK);
    /* THE LINE THE OWNER APPROVES NAMES THE HOST AND THE KEY. */
    assert.equal(approve[0], 'CALLS OUT api.stripe.com · every 1h · key "stripe" to api.stripe.com');
    /* AND IT SAYS WHAT THE SCRIPT COULD CARRY OUT. It reads accounts to find its own rows and books to know the one
       its setting names (1.4.0), and the host still
       tells the owner that what it reads may leave for Stripe, which is true of any script with a read and a fetch. */
    assert.ok(approve.includes('“Stripe balance and payouts” reads accounts and books and may send what it reads to api.stripe.com.'), JSON.stringify(approve));
    assert.ok(api.kernel.register('accounts')?.fields.some((f) => f.id === 'arrives'), 'accounts lost arrives when the pack installed');

    const due = () => running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), SCRIPT.script);
    due();
    await running.poll();

    const [event] = running.sql.all<{ to_v: string | null; note: string }>(
      'SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid',
      `declaration:script.${SCRIPT.script}`,
    );
    const outcome = JSON.parse(event?.to_v ?? '{}') as { outcome?: string; log?: string };
    assert.equal(outcome.outcome, 'ok', `${event?.note ?? 'no run event'} ${outcome.log ?? ''}`);
    assert.deepEqual(sent, [
      { host: 'api.stripe.com', path: '/v1/balance', auth: 'Bearer KEY-OF-stripe' },
      { host: 'api.stripe.com', path: '/v1/payouts?status=in_transit&limit=100', auth: 'Bearer KEY-OF-stripe' },
      { host: 'api.stripe.com', path: '/v1/payouts?status=pending&limit=100', auth: 'Bearer KEY-OF-stripe' },
    ]);
    assert.deepEqual(accountsIn(running.sql), [
      ['Stripe available EUR', 31_000, 'EUR'],
      ['Stripe available USD', 1_842_050, 'USD'],
      ['Stripe payout in transit EUR', 8_000, 'EUR'],
      ['Stripe payout in transit USD', 200_000, 'USD'],
      ['Stripe pending EUR', 0, 'EUR'],
      ['Stripe pending USD', 250_000, 'USD'],
    ]);
    /* ON ITS WAY, SO NOT CASH, AND DATED: the two things money-core's walk reads to bring it in on the day it lands.
       `liquid` reads back as SQLite's 0 because a bool is stored as an integer. */
    const transit = running.sql.one<{ arrives: string; liquid: number }>(
      "SELECT json_extract(fields, '$.arrives') AS arrives, json_extract(fields, '$.liquid') AS liquid FROM entry WHERE register = 'accounts' AND json_extract(fields, '$.name') = 'Stripe payout in transit USD'",
    );
    assert.deepEqual([transit?.arrives, transit?.liquid], ['2026-09-26', 0]);

    /* THE NEXT HOUR, THE DOLLARS LANDED AND ONE EURO PAYOUT IS STILL ON ITS WAY. Six rows still, updated where they
       moved. */
    answers = { balance: { ...BALANCE, available: [{ amount: 2_042_050, currency: 'usd' }, { amount: 31_000, currency: 'eur' }] }, payouts: { ...ON_ITS_WAY, data: [ON_ITS_WAY.data[2]] } };
    due();
    await running.poll();
    assert.deepEqual(accountsIn(running.sql), [
      ['Stripe available EUR', 31_000, 'EUR'],
      ['Stripe available USD', 2_042_050, 'USD'],
      ['Stripe payout in transit EUR', 5_000, 'EUR'],
      ['Stripe payout in transit USD', 0, 'USD'],
      ['Stripe pending EUR', 0, 'EUR'],
      ['Stripe pending USD', 250_000, 'USD'],
    ]);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── What the file says, before anything runs ──────────────────────────────────────────────────── */

test('THE PACK NAMES A KEY AND CARRIES NONE', () => {
  for (const forbidden of ['Authorization', 'Bearer ', 'sk_live_', 'sk_test_', 'rk_live_', 'api_key']) assert.equal(TEXT.includes(forbidden), false, forbidden);
});
