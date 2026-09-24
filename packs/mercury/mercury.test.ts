/**
 * Mercury, pulled, as a pack file: the company's bank balances arriving on their own instead of being typed in
 * (`loop/research-m3-dynamic.md` section 3, brief B7; `loop/DIRECTION.md` sections 22 and 24).
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `mercuryPack` in `packages/seed/src/packs/mercury.ts` built it in
 * code, so the shell carried one bank as TypeScript. It is now `mercury.pack.json`, a legal pack as it stands, with the
 * four things a person supplies named under `fill`. Nothing in the tree offers a Mercury pull to a record, so the fill
 * is `fillMercury` below and nowhere else; while the builder is still in the tree, the file filled is held equal to
 * what it built, byte for byte, through `readPackFile`.
 *
 * WHY A BANK AND WHY THIS ONE. `loop/research-switch.md` names company cash (Mercury and Stripe pulls) as the one money
 * figure the record cannot answer without somebody retyping it. A bank answers the Money page's question, what is in
 * the account today, in one request with no pagination, `GET /api/v1/accounts`, so `read.rows` is `accounts` and there
 * is no page loop. Mercury publishes 100 requests a minute and this asks once an hour.
 *
 * THE KEY IS NAMED AND NEVER CARRIED. `fetch.auth` is `bearer` against a grant LABEL, the only thing about a credential
 * a pack may hold (`42 §4.7`, `SECRET_IN_PACK`). With no key behind the label the run refuses before a byte leaves:
 * `packages/connect/test/mercury.test.ts` watches `PULL_AUTH_REJECTED` pause the run with the `Http` port never called.
 *
 * WHAT IS ASSERTED BELOW IS THE ROW COUNT, because that is the one thing a connector gets wrong that nobody notices. A
 * run that writes the same balance a second time looks exactly like a run that worked, and the Money page then adds up
 * two accounts that are one and reports twice the company's cash. The bytes differ between runs on purpose: `inbox_raw`
 * is unique on `(channel, sha256)`, so replaying identical bytes proves nothing about the declaration. Every fixture
 * carries a `requestId`, and the only thing between the second run and a duplicate row is `dedupe:`.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 24TH AGAINST `facafeed`: with no pack file every test that fills it failed, and
 * with the file written the re-export test still failed on `packages/seed/src/packs/index.ts`, the barrel that gave
 * `mercuryPack` a second name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { openRecord, type Declaration, type Kernel } from '../../packages/kernel/src/index.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { REGISTERS, declarations, firstPartyDocument } from '../../packages/seed/src/index.ts';
import { mercuryPack } from '../../packages/seed/src/packs/mercury.ts';

const NOW = Date.UTC(2026, 8, 20, 9);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./mercury.pack.json', import.meta.url);
const template = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

type MercurySpec = { id: string; grant: string; every?: string; base?: string };
type Pull = Record<string, unknown> & { fetch: Record<string, unknown> & { auth: Record<string, unknown>; schedule: Record<string, unknown> } };

/** A spec's id as an identifier: lower case, digits, and underscores for everything else. */
const ident = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_+/gu, '_');

/**
 * The file filled for one Mercury profile. `base` and `every` default to what the file says, so a spec naming neither
 * asks Mercury itself once an hour.
 *
 * BOTH INTERVALS ARE WRITTEN, BECAUSE TWO SCHEDULERS READ THEM. The record arms the pull off the top-level `every` and
 * `@braindog/connect` computes the next slot off `fetch.schedule.every`; a file carrying two different numbers fires
 * on a cadence nothing else agrees with.
 */
function fillMercury(file: Record<string, unknown>, spec: MercurySpec): Record<string, unknown> {
  const { fill: _marks, ...doc } = structuredClone(file);
  const pull = (doc.declarations as Pull[])[0]!;
  const base = spec.base ?? (pull.fetch.base as string);
  const every = spec.every ?? (pull.every as string);
  doc.pack = `mercury-${spec.id}`;
  doc.summary = `Reads the balance of every Mercury account from ${new URL(base).host} every ${every}, into Money's accounts.`;
  pull.ingest = `mercury_${ident(spec.id)}`.slice(0, 32).replace(/_+$/u, '');
  pull.every = every;
  pull.fetch.base = base;
  pull.fetch.auth.grant = spec.grant.trim();
  pull.fetch.schedule.every = every;
  return doc;
}

const SPEC: MercurySpec = { id: 'kiln', grant: 'Mercury (read only)', base: 'https://api.mercury.example' };

type Ingest = Record<string, unknown> & { ingest: string };

/** The pack's one declaration, with whatever a test wants taken off it. */
const declOf = (over: Record<string, unknown> = {}, drop: string[] = []): Ingest => {
  const doc = fillMercury(template(), SPEC) as { declarations: Ingest[] };
  const body = { ...doc.declarations[0]!, ...over };
  for (const key of drop) delete body[key];
  return body;
};

/* ── where the pack lives ─────────────────────────────────────────────────────────────────────── */

test('the file reads clean as an add-on somebody opens from disk, and says what a person fills', async () => {
  const file = await readPackFile(readFileSync(PACK_FILE, 'utf8'));
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'mercury-company');
  assert.deepEqual(Object.keys((file.value.doc.fill ?? {}) as object), ['id', 'grant', 'every', 'base']);
});

test('THE SEED NO LONGER OFFERS THE BUILDER UNDER A SECOND NAME', () => {
  /* `packages/seed/src/packs/index.ts` WAS A BARREL NOTHING IMPORTED, and it re-exported `mercuryPack` and its three
     constants beside the rates builder. A second name for a document that is now a file here is a second place a
     caller finds it in `packages/seed`. */
  const src = new URL('../../packages/seed/src/', import.meta.url);
  const offering: string[] = [];
  for (const rel of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
    const path = rel.replaceAll('\\', '/');
    if (!path.endsWith('.ts') || path === 'packs/mercury.ts') continue;
    if (/export\s*\{[^}]*\b(?:mercuryPack|MercurySpec|MERCURY_[A-Z]+)\b[^}]*\}\s*from/u.test(readFileSync(new URL(path, src), 'utf8'))) offering.push(path);
  }
  assert.deepEqual(offering, []);
});

/* ── nothing moved but the file ───────────────────────────────────────────────────────────────── */

for (const [name, spec] of [
  ['the file as it ships', { id: 'company', grant: 'Mercury (read only)' }],
  ['a test host, a key label with spaces round it', { ...SPEC, grant: '  Mercury (read only)  ' }],
  ['every six hours, an id past what an ingest name holds', { id: 'kiln-and-tallow-holding-company-operating', grant: 'Ops', every: '6h' }],
] as const satisfies readonly (readonly [string, MercurySpec])[])
  test(`FILLED, THE FILE IS THE BUILDER'S DOCUMENT BYTE FOR BYTE: ${name}`, async () => {
    const built = JSON.stringify(mercuryPack(spec));
    const filled = fillMercury(template(), spec);
    assert.equal(JSON.stringify(filled), built);
    const read = await readPackFile(JSON.stringify(filled));
    assert.ok(read.ok, fixOf(read));
    assert.equal(JSON.stringify(read.value.doc), built);
  });

test('the file as it ships, with its marks taken off, is its own example filled', () => {
  const { fill: _marks, ...shipped } = template();
  assert.equal(JSON.stringify(shipped), JSON.stringify(fillMercury(template(), { id: 'company', grant: 'Mercury (read only)' })));
});

/** A record holding Money and what it points at, and the two presses a person makes: read the plan, then install it. */
async function withMoney(): Promise<{ plan: (doc: unknown) => Promise<{ planHash: string; approve: string[] }>; put: (doc: unknown, approve: boolean) => Promise<{ ok: boolean }>; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  const plan = async (doc: unknown): Promise<{ planHash: string; approve: string[] }> => {
    const r = await api.planPack({ doc, source: { kind: 'local' } } as never, owner);
    assert.ok(r.ok, fixOf(r as never));
    return (r.value as { diff: { planHash: string; approve: string[] } }).diff;
  };
  const put = async (doc: unknown, approve: boolean): Promise<{ ok: boolean }> => {
    const diff = await plan(doc);
    return api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: approve ? diff.approve : [] } as never, owner);
  };
  for (const id of ['portfolio', 'people', 'money-core']) {
    const r = await put(firstPartyDocument(id, { seeds: [] }), true);
    assert.ok(r.ok, fixOf(r as never));
  }
  return { plan, put, close: () => sql.close() };
}

test('INSTALLED THROUGH THE RECORD’S OWN DOOR, once the owner approves the one call out, naming the host and the interval', async () => {
  const { plan, put, close } = await withMoney();
  const doc = fillMercury(template(), { id: 'kiln', grant: 'Mercury (read only)' });
  const approve = (await plan(doc)).approve;
  assert.equal(approve.length, 1);
  assert.ok(approve[0]!.startsWith('CALLS OUT api.mercury.com · every 1h · '), approve[0]);
  assert.equal((await put(doc, false)).ok, false, 'never without approval');
  assert.ok((await put(doc, true)).ok);
  close();
});

test(
  'AND THE LINE HE APPROVES NAMES THE KEY THE PULL SENDS',
  {
    todo: 'egressOf in packages/kernel/src/actions.ts reads the key from a top-level grant, which a pull does not have: its key is fetch.auth.grant, so this plan reads grant "none" for a pull that sends a bearer key every hour',
  },
  async () => {
    /* MEASURED WHILE MOVING THIS PACK, AND NOT THIS PACK'S TO REPAIR. The line printed is
       `CALLS OUT api.mercury.com · every 1h · grant "none"`, and it is the only line, so the owner approving a bank
       pull reads that it sends no key while every run sends one. */
    const { plan, close } = await withMoney();
    const doc = fillMercury(template(), { id: 'kiln', grant: 'Mercury (read only)' });
    assert.deepEqual((await plan(doc)).approve, ['CALLS OUT api.mercury.com · every 1h · grant "Mercury (read only)"']);
    close();
  },
);

/**
 * One Mercury account, as `/api/v1/accounts` answers it.
 *
 * THE FIELDS ARE THE ONES THE DECLARATION READS PLUS THE ONES IT DELIBERATELY DOES NOT, because a
 * fixture holding only what is mapped cannot show that `createdAt` is not `as_of` and that
 * Mercury's own `kind` is not this record's.
 */
const account = (name: string, balance: number) => ({
  id: `acc_${name.length}${balance}`,
  name,
  nickname: null,
  kind: 'checking',
  type: 'mercury',
  status: 'active',
  currentBalance: balance,
  availableBalance: balance,
  createdAt: '2024-02-11T10:04:00Z',
});

const body = (requestId: string, ...accounts: ReturnType<typeof account>[]): string => JSON.stringify({ requestId, accounts });

async function record(decl: Ingest): Promise<{ k: Kernel; sql: NodeSql; decl: Ingest }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);

  const decls: Declaration[] = [
    { id: 'register.accounts', kind: 'register', body: REGISTERS.accounts as never },
    { id: `ingest.${decl.ingest}`, kind: 'ingest', body: decl as never },
  ];
  const put = await k.install(decls);
  assert.ok(put.ok, fixOf(put));
  return { k, sql, decl };
}

/**
 * One run of the connector: the page read by the record's own extractor, then written.
 *
 * THE EXTRACTOR IS THE RECORD'S AND NOT A STUB, which is the whole reason this test is here rather
 * than in `@braindog/connect`: what turns Mercury's JSON into an `accounts` row is
 * `kernel.extract`, and a stub that agreed with the declaration would be a test of the fixture.
 */
function run(k: Kernel, sql: NodeSql, decl: Ingest, n: number, page: string): { wrote: number; kept: number } {
  const outbox = `ob_${n}`;
  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
     VALUES (?, ?, 'pull.fetch', ?, 'leased', ?, 1)`,
    outbox,
    new Date(NOW).toISOString(),
    JSON.stringify({ ingest: decl.ingest }),
    new Date(NOW + 300_000).toISOString(),
  );
  const got = k.extract(decl as never, { ts: new Date(NOW).toISOString(), body: page });
  const out = k.applyPage({
    outbox,
    n,
    raw: { sha256: `${n}`.padStart(64, 'f'), headers: { 'content-type': 'application/json' }, bytes: page.length, body: null, state: 'matched' },
    rows: got.rows,
    cursor: { watermark: null },
  });
  assert.ok(out.ok, fixOf(out));
  return out.value;
}

const balances = (sql: NodeSql): [string, number][] =>
  sql
    .all<{ name: string; amount: number }>(
      `SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.balance.amount') AS amount
       FROM entry WHERE register = 'accounts' AND deleted_at IS NULL ORDER BY name`,
    )
    .map((r) => [r.name, r.amount]);

/**
 * The four fields the declaration STATES rather than reads, as they land.
 *
 * WITHOUT THIS QUERY THE FIXTURE PROVED NOTHING. `account()` above carries `createdAt` and Mercury's
 * own `kind` so that a reader can see they are not `as_of` and not this record's `kind`, and until
 * these rows were asserted, replacing `as_of: { arrived: true }` with `{ path: 'createdAt' }`, or
 * `kind: 'bank'` with `'card'`, or the currency with `EUR`, left every test in this file green.
 * `liquid` reads back as SQLite's `1` because a bool is stored as an integer.
 */
const stated = (sql: NodeSql): [string, string, string, string, number][] =>
  sql
    .all<{ name: string; currency: string; as_of: string; kind: string; liquid: number }>(
      `SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.balance.currency') AS currency,
              json_extract(fields, '$.as_of') AS as_of, json_extract(fields, '$.kind') AS kind,
              json_extract(fields, '$.liquid') AS liquid
       FROM entry WHERE register = 'accounts' AND deleted_at IS NULL ORDER BY name`,
    )
    .map((r) => [r.name, r.currency, r.as_of, r.kind, r.liquid]);

const OPS = account('Mercury Checking ••4417', 18_420.5);
const RESERVE = account('Mercury Savings ••9002', 250_000);

/* ── the red ─────────────────────────────────────────────────────────────────────────────────── */

test('WITHOUT A KEY THE SECOND HOUR WRITES THE COMPANY A SECOND SET OF ACCOUNTS', async () => {
  /* THIS IS THE FAILURE THE PACK EXISTS TO PREVENT, measured rather than described. `existingRow`
     answers `undefined` for a declaration that names nothing to match on, which `07 §3` calls
     `on_conflict: new` by construction, so every hour is a fresh pair of rows and the Money page
     adds them all up. Two hours is four accounts and twice the cash. */
  const { k, sql, decl } = await record(declOf({}, ['dedupe', 'on_conflict']));
  assert.deepEqual(run(k, sql, decl, 1, body('req_a', OPS, RESERVE)), { wrote: 2, kept: 0 });
  assert.deepEqual(run(k, sql, decl, 2, body('req_b', OPS, RESERVE)), { wrote: 2, kept: 0 });
  assert.equal(balances(sql).length, 4);
  sql.close();
});

/* ── the green ───────────────────────────────────────────────────────────────────────────────── */

test('THE PACK AS SHIPPED WRITES ONE ROW AN ACCOUNT, however many times the hour runs', async () => {
  const { k, sql, decl } = await record(declOf());
  assert.deepEqual(run(k, sql, decl, 1, body('req_a', OPS, RESERVE)), { wrote: 2, kept: 0 });

  /* THE SAME TWO ACCOUNTS, DIFFERENT BYTES. `update` rewrites the row it found rather than skipping
     it, so the count is `wrote` again and the register still holds two. */
  assert.deepEqual(run(k, sql, decl, 2, body('req_b', OPS, RESERVE)), { wrote: 2, kept: 0 });
  assert.deepEqual(balances(sql), [
    ['Mercury Checking ••4417', 1_842_050],
    ['Mercury Savings ••9002', 25_000_000],
  ]);

  /* AND THE DATE IS THE HOUR THE ANSWER ARRIVED, not the day the account was opened. The fixture's
     `createdAt` is 2024-02-11 and the record's clock is 2026-09-20, so a map that read the wrong one
     would date every balance two years and seven months ago and the Money page would call all of
     them stale. */
  assert.deepEqual(stated(sql), [
    ['Mercury Checking ••4417', 'USD', '2026-09-20', 'bank', 1],
    ['Mercury Savings ••9002', 'USD', '2026-09-20', 'bank', 1],
  ]);
  sql.close();
});

test('A BALANCE THAT MOVED MOVES THE ROW, and does not arrive beside the figure it replaces', async () => {
  const { k, sql, decl } = await record(declOf());
  assert.deepEqual(run(k, sql, decl, 1, body('req_a', OPS, RESERVE)), { wrote: 2, kept: 0 });

  /* A WIRE WENT OUT. Mercury restates the same account with a smaller balance, and the register has
     to hold one account with today's figure rather than two accounts with yesterday's and today's.
     `on_conflict: 'update'` is the whole of that, and `skip` would have kept the stale one. */
  const spent = account('Mercury Checking ••4417', 11_920.5);
  assert.deepEqual(run(k, sql, decl, 2, body('req_c', spent, RESERVE)), { wrote: 2, kept: 0 });
  assert.deepEqual(balances(sql), [
    ['Mercury Checking ••4417', 1_192_050],
    ['Mercury Savings ••9002', 25_000_000],
  ]);
  sql.close();
});

test('AN ACCOUNT THAT WAS CLOSED IS NOT DELETED, because a pull that stopped mentioning a row is not a pull that closed it', async () => {
  /* SAID RATHER THAN LEFT TO BE FOUND. A connector writes and updates; nothing in `applyPage`
     retires a row the provider stopped sending, and `25 §…`'s partial-refresh rule is the reason:
     an outage that answers with two accounts instead of three must not empty the third. So a
     closed Mercury account keeps its last balance until a person retires it. */
  const { k, sql, decl } = await record(declOf());
  run(k, sql, decl, 1, body('req_a', OPS, RESERVE));
  run(k, sql, decl, 2, body('req_b', OPS));
  assert.equal(balances(sql).length, 2);
  sql.close();
});

test('TWO ACCOUNTS UNDER ONE NAME BECOME ONE ROW, which is the price of keying on a name', async () => {
  /* THE PRICE OF KEYING ON A NAME, measured here because it is the one way this
     pack can be wrong without anybody seeing it. `name` is a field a person edits in Mercury, so two
     accounts can end up carrying one name, and then `existingRow` finds the first row for the second
     account and `on_conflict: 'update'` writes over it: the register holds one account, the company's
     cash is short by the balance of the other, and the run reports two rows written, which is what a
     working hour looks like in the meter.

     THE REPAIR IS NOT AVAILABLE HERE. The honest key is Mercury's own `id`, and `accounts` declares
     exactly five fields (`packages/seed/src/modules/money.ts`: `name`, `kind`, `balance`, `as_of`,
     `liquid`), none of which can hold a provider's identifier. So this is a measurement of what the
     register costs rather than a bug in the declaration, and the day `accounts` grows a field for a
     provider's own id, this test is what says why it wanted one. */
  const { k, sql, decl } = await record(declOf());
  const renamed = account('Mercury Operating', 250);
  assert.deepEqual(run(k, sql, decl, 1, body('req_a', account('Mercury Operating', 10_000), renamed)), { wrote: 2, kept: 0 });
  assert.deepEqual(balances(sql), [['Mercury Operating', 25_000]]);
  sql.close();
});

/* ── what the pack says, before anything runs ────────────────────────────────────────────────── */

test('THE PACK NAMES A KEY AND CARRIES NONE, and both intervals agree', () => {
  const doc = fillMercury(template(), { id: 'kiln', grant: 'Mercury (read only)' }) as {
    pack: string;
    requires: { packs: Record<string, string> };
    declarations: Record<string, unknown>[];
  };
  assert.equal(doc.pack, 'mercury-kiln');
  /* BELOW 3.0.0 AND NOT A CARET ON 1.x: money-core 2.0.0 took `holdings` away, which nothing here writes into, and a
     `^1.0.0` refused this pack beside it (`packages/seed/test/money-core-major.test.ts` plans it on both). The floor is unmoved. */
  assert.deepEqual(doc.requires.packs, { 'money-core': '>=1.0.0 <3.0.0' });

  const decl = doc.declarations[0] as {
    ingest: string; every: string; dedupe: string[]; on_conflict: string;
    fetch: { base: string; path: string; auth: Record<string, string>; schedule: { every: string } };
    writes: { register: string };
  };
  assert.equal(decl.ingest, 'mercury_kiln');
  assert.equal(decl.fetch.base, 'https://api.mercury.com');
  assert.equal(decl.fetch.path, '/api/v1/accounts');
  assert.deepEqual(decl.fetch.auth, { kind: 'bearer', grant: 'Mercury (read only)' });
  assert.equal(decl.writes.register, 'accounts');
  assert.deepEqual(decl.dedupe, ['name']);
  assert.equal(decl.on_conflict, 'update');

  /* THE TWO INTERVALS ARE READ BY TWO DIFFERENT SCHEDULERS, so they have to be the same number. */
  assert.equal(decl.every, decl.fetch.schedule.every);

  /* NO CREDENTIAL ANYWHERE IN THE DOCUMENT. The label is the only thing about a key a pack holds,
     and `42 §5.3`'s `SECRET_IN_PACK` is what refuses the other kind at install. A `Bearer ` prefix,
     a `Authorization` header or a token-shaped literal would all be findable in the serialised
     document, so this looks at the serialised document. */
  const text = JSON.stringify(doc);
  for (const forbidden of ['Authorization', 'Bearer ', 'secret_', 'sk_live_', 'api_key']) assert.equal(text.includes(forbidden), false, forbidden);
});

/* ── the half that cannot be built, measured ─────────────────────────────────────────────────── */

/**
 * One Mercury transaction, as `/api/v1/account/<id>/transactions` answers it.
 *
 * THE DIRECTION IS THE SIGN OF `amount` AND THERE IS NO OTHER SIGNAL. `kind` says what sort of
 * movement it was and not which way the money went: `externalTransfer` and `treasuryTransfer` are
 * both, and `status` is `pending`, `sent`, `cancelled` or `failed`.
 */
const TRANSACTION = {
  id: 'txn_7f2a',
  amount: -1240.75,
  kind: 'externalTransfer',
  status: 'sent',
  counterpartyName: 'Fenwick Cloud',
  bankDescription: 'FENWICK CLOUD',
  createdAt: '2026-09-19T14:02:00Z',
  postedAt: '2026-09-19T18:30:00Z',
};

test('A TRANSACTIONS PULL WRITES NOTHING, because a map cannot turn a signed amount into a direction', async () => {
  /* THIS IS A MEASUREMENT AND NOT A WISH. The claim this pack rests on is that the
     ledger cannot be filled by a connector today, and a claim about a grammar is worth nothing
     until somebody has watched the rows fail to land.
     
     THE DECLARATION BELOW IS THE BEST ONE AVAILABLE. `map:`'s `enum` arm writes the provider's own
     value through when it is listed in `values:` and falls back to `other:` otherwise
     (`packages/kernel/src/map.ts`), so there are exactly two things `direction` can be told to do
     with `kind`: pass `externalTransfer` through to a field whose values are `in` and `out`, which
     the register refuses, or default every row to one of them, which files every customer payment
     as money going out. This asserts the first, because a refused row is at least visible.

     THE DAY `map:` CAN READ A SIGN, THIS TEST CHANGES. The `extract:` grammar already has the form
     that would do it, `{ enum: { map: { literal: value } } }` (`42 §4.7`), and `42 §4.7` forbids
     `extract:` on a `pull`. One row in that table and one arm in `mapField` is the whole repair. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);

  const ledger = {
    ingest: 'mercury_kiln_txns',
    channel: 'pull',
    every: '1h',
    fetch: {
      base: 'https://api.mercury.example',
      path: '/api/v1/account/acc_1/transactions',
      method: 'GET',
      auth: { kind: 'bearer', grant: 'Mercury (read only)' },
      schedule: { every: '1h' },
      read: { rows: 'transactions' },
      page: { kind: 'none' },
    },
    map: {
      what: { path: 'counterpartyName', type: 'text' },
      on: { path: 'postedAt', type: 'day' },
      direction: { path: 'kind', type: 'enum', values: ['in', 'out'] },
      amount: { path: 'amount', type: 'money', currency: 'USD' },
      account: { value: 'accounts#1' },
      state: { value: 'cleared' },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: { near: { on: ['account', 'amount', 'direction'], day: 'on', prefix: { field: 'what', chars: 16 } } },
    on_conflict: 'update',
  };
  const put = await k.install([...declarations(), { id: `ingest.${ledger.ingest}`, kind: 'ingest', body: ledger as never }]);
  assert.ok(put.ok, fixOf(put));

  /* THE DECLARATION INSTALLS CLEAN, which is the part that makes this expensive to find: nothing
     at the door says the ledger will stay empty. */
  sql.exec(
    `INSERT INTO outbox (id, created, kind, payload, state, leased_until, attempts)
     VALUES ('ob_t', ?, 'pull.fetch', ?, 'leased', ?, 1)`,
    new Date(NOW).toISOString(),
    JSON.stringify({ ingest: ledger.ingest }),
    new Date(NOW + 300_000).toISOString(),
  );
  const page = JSON.stringify({ total: 1, transactions: [TRANSACTION] });
  const got = k.extract(ledger as never, { ts: new Date(NOW).toISOString(), body: page });
  assert.equal(got.rows.length, 1);
  /* `undefined` AND NOT `null`: the field is absent from the row rather than present and empty,
     because `mapField`'s enum arm found `externalTransfer` outside `values:` and the declaration
     named no `other:`, so `readRow` counted it as missed and left it off. */
  assert.equal(got.rows[0]?.fields.direction, undefined, 'the map found a direction after all, so a ledger pull can be written now');
  /* AND THAT IS WHAT MAKES THE ROW `needs-review`: one unreadable field is the whole row, and
     `applyPage` counts a `needs-review` row and never writes it (`47 §5.1` step 6.8). */
  assert.equal(got.rows[0]?.confidence, 'needs-review');
  assert.equal(got.rows[0]?.outcome.direction, 'invalid');

  const out = k.applyPage({
    outbox: 'ob_t',
    n: 1,
    raw: { sha256: 'e'.repeat(64), headers: {}, bytes: page.length, body: null, state: 'matched' },
    rows: got.rows,
    cursor: { watermark: null },
  });
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(out.value, { wrote: 0, kept: 1 });
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'transactions'")?.n, 0);
  sql.close();
});
