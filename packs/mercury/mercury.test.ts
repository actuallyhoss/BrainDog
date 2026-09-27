/**
 * Mercury, pulled, as a pack file: the company's bank balances arriving on their own instead of being typed in
 * (`loop/research-m3-dynamic.md` section 3, brief B7; `loop/DIRECTION.md` sections 22 and 24).
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `mercuryPack` in `packages/seed/src/packs/mercury.ts` built it in
 * code, so the shell carried one bank as TypeScript. It is now `mercury.pack.json`, a legal pack as it stands, with the
 * four things a person supplies named under `fill`. Nothing in the tree offers a Mercury pull to a record, so the fill
 * is `fillMercury` below and nowhere else. While the builder was in the tree, the file filled was held equal to what
 * it built, byte for byte; it went on September 24th, and what each spec changes was printed from it that day, before
 * it was deleted, and is written out below as values.
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
 *
 * THE LEDGER CAME ON SEPTEMBER 25TH (`loop/research-legacy-parity.md` brief B4, row 56). The balances were half of
 * what Mercury answers; the transactions, the part a person reads to know what the company spent on, stayed typed in,
 * because a pull cannot read a sign (the last section below, which still holds). `ledger.js` is a script beside the
 * pull, carried in the pack file byte for byte. Measured before it was in the file, against `772c0be1`: all six ledger
 * tests below failed at their first read of the pack, "mercury.pack.json declares no script, so nothing in the pack
 * can write a transaction", the whole path on a self-host included.
 *
 * 1.2.0 COUNTS THE MONEY ONCE (`loop/finish/defects.md` DEF-3). A row typed in by hand before the pack is taken by the
 * transaction it stands for instead of being written beside it, and a transaction whose row a person deleted is not
 * written again. The tests after "A TRANSACTION A PERSON VOIDED" hold both, and the whole path holds them against the
 * record's own `list`. They were written from reading the code, before any of them had run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { openRecord, type Declaration, type Kernel } from '../../packages/kernel/src/index.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { REGISTERS, declarations, firstPartyDocument } from '../../packages/seed/src/index.ts';
import type { CtxHost, HostRequest, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const NOW = Date.UTC(2026, 8, 20, 9);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./mercury.pack.json', import.meta.url);
const template = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

type MercurySpec = { id: string; grant: string; every?: string; base?: string };
type Pull = Record<string, unknown> & { fetch: Record<string, unknown> & { auth: Record<string, unknown>; schedule: Record<string, unknown> } };
type Script = Record<string, unknown> & { script: string; runs: { every: string }; egress: string[]; keys: string[]; reads: string[]; writes: string[]; limits?: Record<string, number>; source: string };

/** The source's two lines a fill rewrites. Written as JSON so a label with a quote in it stays one string. */
const API_LINE = (base: string): string => `const API = ${JSON.stringify(base)};`;
const KEY_LINE = (grant: string): string => `const KEY = ${JSON.stringify(grant)};`;
const scriptOf = (doc: Record<string, unknown>): Script => (doc.declarations as Record<string, unknown>[]).find((d) => typeof d.script === 'string') as Script;

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
  doc.summary = `Reads the balance of every Mercury account from ${new URL(base).host} every ${every}, into Money's accounts, and its last thirty days of transactions into the ledger.`;
  pull.ingest = `mercury_${ident(spec.id)}`.slice(0, 32).replace(/_+$/u, '');
  pull.every = every;
  pull.fetch.base = base;
  pull.fetch.auth.grant = spec.grant.trim();
  pull.fetch.schedule.every = every;

  /* THE LEDGER SCRIPT ASKS THE SAME HOST WITH THE SAME KEY ON THE SAME CLOCK, and its source cannot read its own
     declaration, so the two constants it fetches with are rewritten in the source as well as in the header. A fill
     that set `keys` and left the source naming the shipped label would install, and every run would be refused as a
     key the script does not declare. The name is its own because two profiles on one record are two scripts. */
  const script = scriptOf(doc);
  if (script !== undefined) {
    const shipped = scriptOf(file);
    script.script = `mercury_ledger_${ident(spec.id)}`.slice(0, 32).replace(/_+$/u, '');
    script.runs.every = every;
    script.egress = [new URL(base).origin];
    script.keys = [spec.grant.trim()];
    script.source = script.source
      .split(API_LINE(shipped.egress[0]!))
      .join(API_LINE(new URL(base).origin))
      .split(KEY_LINE(shipped.keys[0]!))
      .join(KEY_LINE(spec.grant.trim()));
  }
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
  /* A TITLE OF ITS OWN, where it had none and a person read its id, "mercury-company", as its name. */
  assert.equal(file.value.title, 'Mercury');
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
    if (!path.endsWith('.ts')) continue;
    if (/export\s*\{[^}]*\b(?:mercuryPack|MercurySpec|MERCURY_[A-Z]+)\b[^}]*\}\s*from/u.test(readFileSync(new URL(path, src), 'utf8'))) offering.push(path);
  }
  assert.deepEqual(offering, []);
});

/* ── nothing moved but the file ───────────────────────────────────────────────────────────────── */

/**
 * Each spec the byte comparison held, with what the builder answered for it on the day it was deleted: the pack's
 * name, the summary, the pull's name, both intervals, the host and the key label. The last four values are the ledger
 * script's, added on September 25th with it: its name, its clock, its one origin and its one key, which its source
 * fetches with too.
 *
 * WRITTEN OUT AND NOT RECOMPUTED, because a table computed by a second copy of `fillMercury` agrees with it by
 * construction. Checked the other way on September 24th: with `.trim()` taken off the grant in `fillMercury`, the
 * spaced label's row went red here and nowhere else in this file.
 */
for (const [name, spec, want] of [
  ['the file as it ships', { id: 'company', grant: 'Mercury (read only)' }, ['mercury-company', 'api.mercury.com', 'mercury_company', '1h', 'https://api.mercury.com', 'Mercury (read only)', 'mercury_ledger_company']],
  ['a test host, a key label with spaces round it', { ...SPEC, grant: '  Mercury (read only)  ' }, ['mercury-kiln', 'api.mercury.example', 'mercury_kiln', '1h', 'https://api.mercury.example', 'Mercury (read only)', 'mercury_ledger_kiln']],
  ['every six hours, an id past what an ingest name holds', { id: 'kiln-and-tallow-holding-company-operating', grant: 'Ops', every: '6h' }, ['mercury-kiln-and-tallow-holding-company-operating', 'api.mercury.com', 'mercury_kiln_and_tallow_holding', '6h', 'https://api.mercury.com', 'Ops', 'mercury_ledger_kiln_and_tallow_h']],
] as const satisfies readonly (readonly [string, MercurySpec, readonly [string, string, string, string, string, string, string]])[])
  test(`FILLED, THE FILE CHANGES WHERE THE SPEC SAYS AND NOWHERE ELSE: ${name}`, async () => {
    const filled = fillMercury(template(), spec);
    const pull = (filled.declarations as Pull[])[0]!;
    const [pack, host, ingest, every, base, grant, ledger] = want;
    assert.deepEqual(
      [filled.pack, filled.summary, pull.ingest, pull.every, pull.fetch.schedule.every, pull.fetch.base, pull.fetch.auth],
      [pack, `Reads the balance of every Mercury account from ${host} every ${every}, into Money's accounts, and its last thirty days of transactions into the ledger.`, ingest, every, every, base, { kind: 'bearer', grant }],
    );
    const script = scriptOf(filled);
    assert.deepEqual([script.script, script.runs.every, script.egress, script.keys], [ledger, every, [base], [grant]]);
    assert.ok(script.source.includes(API_LINE(base)) && script.source.includes(KEY_LINE(grant)), "the ledger fetches with a host or a key its header does not name");

    /* AND EVERYTHING THE SPEC DOES NOT NAME IS THE FILE'S, key order included, which is what the byte comparison
       held and the fields above do not: the version, the range on Money, the path, the map, the dedupe key. */
    const blanked = (doc: Record<string, unknown>): string => {
      const d = structuredClone(doc);
      const p = (d.declarations as Pull[])[0]!;
      d.pack = d.summary = p.ingest = p.every = p.fetch.base = p.fetch.auth.grant = p.fetch.schedule.every = '';
      const s = scriptOf(d);
      s.source = s.source.replace(/^const API = .*;$/mu, '').replace(/^const KEY = .*;$/mu, '');
      s.script = s.runs.every = '';
      s.egress = s.keys = [];
      return JSON.stringify(d);
    };
    const { fill: _marks, ...shipped } = template();
    assert.equal(blanked(filled), blanked(shipped));

    const read = await readPackFile(JSON.stringify(filled));
    assert.ok(read.ok, fixOf(read));
    assert.equal(JSON.stringify(read.value.doc), JSON.stringify(filled));
  });

test('the file as it ships, with its marks taken off, is its own example filled', () => {
  const { fill: _marks, ...shipped } = template();
  assert.equal(JSON.stringify(shipped), JSON.stringify(fillMercury(template(), { id: 'company', grant: 'Mercury (read only)' })));
});

/**
 * A vault entry as a row: a label and the host it opens, and no bytes, because a test's `openKey` is the key store.
 *
 * NEEDED SINCE THE LEDGER: install refuses a script whose key is not in the vault ("Add the key called ... to the
 * vault, then install."), where the pull alone installed without one and was refused on its first run instead.
 */
const grantFor = (sql: Pick<NodeSql, 'exec'>, label: string): void =>
  sql.exec(
    "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at) VALUES ('g_mercury', ?, 'api.mercury.com', 'api_token', 'none', 'kek', 'k_test', ?)",
    label,
    new Date(NOW).toISOString(),
  );

/** A record holding Money and what it points at, and the two presses a person makes: read the plan, then install it. */
async function withMoney(): Promise<{ sql: NodeSql; plan: (doc: unknown) => Promise<{ planHash: string; approve: string[] }>; put: (doc: unknown, approve: boolean) => Promise<{ ok: boolean }>; close: () => void }> {
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
  return { sql, plan, put, close: () => sql.close() };
}

/** What the owner reads for the ledger script, once the key is in the vault: the host, the key, and what it could carry out. */
const LEDGER_LINES = [
  'CALLS OUT api.mercury.com · every 1h · key "Mercury (read only)" to api.mercury.com',
  'mercury_ledger_kiln reads accounts, transactions and categories and may send what it reads to api.mercury.com.',
  'Keys are not kept per project yet, so any action in this record can send any key it names.',
];

test('INSTALLED THROUGH THE RECORD’S OWN DOOR, once the key is in the vault and the owner approves the call out and the ledger script', async () => {
  const { sql, plan, put, close } = await withMoney();
  const doc = fillMercury(template(), { id: 'kiln', grant: 'Mercury (read only)' });
  /* NOT BEFORE THE KEY IS IN THE VAULT. The pull alone installed without one and was refused on its first run; a
     script naming a key is refused at install, so since the ledger the key goes in first. */
  const early = await put(doc, true);
  assert.equal(early.ok, false, 'installed with no key in the vault');
  assert.equal(fixOf(early as never), 'Add the key called "Mercury (read only)" to the vault, then install.');
  grantFor(sql, 'Mercury (read only)');
  const approve = (await plan(doc)).approve;
  assert.ok(approve[0]!.startsWith('CALLS OUT api.mercury.com · every 1h · '), approve[0]);
  assert.deepEqual(approve.slice(1), LEDGER_LINES);
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
       `CALLS OUT api.mercury.com · every 1h · grant "none"`, so the owner approving a bank pull reads that it sends
       no key while every run sends one. Since the ledger the script's own line below it names the same key, which
       makes the pull's line read as a contradiction rather than a promise. */
    const { sql, plan, close } = await withMoney();
    grantFor(sql, 'Mercury (read only)');
    const doc = fillMercury(template(), { id: 'kiln', grant: 'Mercury (read only)' });
    assert.deepEqual((await plan(doc)).approve, ['CALLS OUT api.mercury.com · every 1h · grant "Mercury (read only)"', ...LEDGER_LINES]);
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
  /* BELOW 4.0.0 AND NOT A CARET ON 1.x: money-core 2.0.0 took `holdings` away, which nothing here writes into, and a
     `^1.0.0` refused this pack beside it (`packages/seed/test/money-core-major.test.ts` plans it on both). 3.0.0 took
     pages and card wordings and kept the accounts and transactions this pack writes, so 1.1.1 widened to it. The floor
     is unmoved. */
  assert.deepEqual(doc.requires.packs, { 'money-core': '>=1.0.0 <4.0.0' });

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

/* ── why the ledger is a script: a pull cannot say it, measured ──────────────────────────────── */

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
  /* THIS IS A MEASUREMENT AND NOT A WISH. The claim `ledger.js` rests on is that the
     ledger cannot be filled by a pull today, and a claim about a grammar is worth nothing
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

/* ── the ledger, as a script ─────────────────────────────────────────────────────────────────── */

const LEDGER_SOURCE = readFileSync(new URL('./ledger.js', import.meta.url), 'utf8');

/** The ledger script as the file ships it, or a failure that says the pack does not carry one. */
const ledger = (doc: Record<string, unknown> = template()): Script => {
  const s = scriptOf(doc);
  assert.ok(s !== undefined, 'mercury.pack.json declares no script, so nothing in the pack can write a transaction');
  return s;
};

test('THE PACK CARRIES ledger.js AS ITS SOURCE, byte for byte, beside the pull, on the same host, key and clock', () => {
  const doc = template();
  const s = ledger(doc);
  const pull = (doc.declarations as Pull[])[0]!;
  assert.equal(s.source, LEDGER_SOURCE, 'mercury.pack.json and ledger.js disagree; copy ledger.js into the source');
  assert.deepEqual(s.runs, { every: pull.every });
  assert.deepEqual(s.egress, [pull.fetch.base]);
  assert.deepEqual(s.keys, [pull.fetch.auth.grant]);
  assert.deepEqual([...s.reads].sort(), ['accounts', 'categories', 'transactions']);
  assert.deepEqual(s.writes, ['transactions']);
  /* THE SCRIPT STOPS QUEUING AT ITS OWN LIMIT, so the two numbers are one. A limit lower than the script's constant
     would refuse the whole run past it, and every row with it. */
  assert.ok(s.source.includes(`const WRITES = ${s.limits?.writes};`), `limits.writes is ${s.limits?.writes} and ledger.js stops at another number`);
  /* AND IT LAYS THE ONE FIELD IT FINDS A TRANSACTION AGAIN BY. */
  assert.deepEqual((doc.extends as Record<string, { fields: { id: string }[] }>)['register.transactions']?.fields.map((f) => f.id), ['mercury_id']);
});

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string; deleted_at?: string };
let minted = 0;
const rowOf = (register: string, fields: Record<string, Json>, version = 1): Row => {
  minted += 1;
  return { id: `01K5LEDGER${String(minted).padStart(16, '0')}`, register, seq: minted, fields, version, updated_at: '2026-09-19T09:00:00.000Z' };
};

/**
 * Mercury's transactions for one account, as `/api/v1/account/<id>/transactions` answers them. What is read and what
 * is deliberately not: `kind` rides along and says nothing about direction; a pending one has no `postedAt`.
 */
const txn = (id: string, amount: number, status: string, counterpartyName: string, createdAt: string, postedAt: string | null, mercuryCategory?: string) => ({
  id,
  amount,
  kind: amount < 0 ? 'externalTransfer' : 'incomingDomesticWire',
  status,
  counterpartyName,
  bankDescription: counterpartyName.toUpperCase(),
  createdAt,
  postedAt,
  ...(mercuryCategory === undefined ? {} : { mercuryCategory }),
});

const OPS_TXNS = [
  txn('txn_1', -1240.75, 'sent', 'Fenwick Cloud', '2026-09-19T14:02:00Z', '2026-09-19T18:30:00Z', 'Software'),
  txn('txn_2', 5000, 'pending', 'Halden Studio', '2026-09-20T08:00:00Z', null),
  /* NEVER WENT THROUGH AND NEVER HELD: not worth a row. */
  txn('txn_3', -60, 'cancelled', 'Coffee Stall', '2026-09-20T09:00:00Z', null),
];

/**
 * A host double: Mercury's two addresses, and the three lists the script reads, filtered as the record filters them.
 *
 * A ROW WITH `deleted_at` SET IS ONE A PERSON DELETED, and it is listed only when the script asks for deleted rows as
 * well, which is the record's own rule (`scriptReads` in `packages/host/src/script.ts`). A money `is` compares the
 * amount and the currency, as the record does, and `between` takes both ends.
 */
function mercuryHost(state: { accounts: Row[]; transactions: Row[]; categories: Row[]; txns?: unknown[]; status?: number }): CtxHost & { asked: HostRequest[]; lists: [string, Json, Json][] } {
  const asked: HostRequest[] = [];
  const lists: [string, Json, Json][] = [];
  const same = (a: Json | undefined, b: Json | undefined): boolean => {
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      const x = a as { amount?: Json; currency?: Json };
      const y = b as { amount?: Json; currency?: Json };
      return x.amount === y.amount && x.currency === y.currency;
    }
    return a === b;
  };
  const matches = (row: Row, where: Json): boolean => {
    const w = where as { field?: string; in?: Json[]; is?: Json; all?: Json[]; between?: [string, string]; empty?: boolean } | null;
    if (w === null) return true;
    if (Array.isArray(w.all)) return w.all.every((x) => matches(row, x));
    const value = row.fields[w.field ?? ''];
    if (w.in !== undefined) return w.in.some((v) => same(value, v));
    if (w.between !== undefined) return typeof value === 'string' && value >= w.between[0] && value <= w.between[1];
    if (w.empty === true) return value === undefined || value === null || value === '';
    return same(value, w.is);
  };
  return {
    asked,
    lists,
    fetch: async (request) => {
      asked.push(request);
      const url = new URL(request.url);
      const body =
        url.pathname === '/api/v1/accounts'
          ? { accounts: [{ ...OPS, id: 'acc_ops' }, { ...RESERVE, id: 'acc_res' }] }
          : url.pathname === '/api/v1/account/acc_ops/transactions'
            ? { total: (state.txns ?? OPS_TXNS).length, transactions: state.txns ?? OPS_TXNS }
            : { total: 0, transactions: [] };
      return { status: state.status ?? 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    },
    list: async (register, where, options) => {
      lists.push([register, where, options]);
      const withDeleted = (options as { includeDeleted?: boolean } | null)?.includeDeleted === true;
      const rows = register === 'accounts' ? state.accounts : register === 'transactions' ? state.transactions : register === 'categories' ? state.categories : [];
      return rows.filter((r) => (withDeleted || r.deleted_at === undefined) && matches(r, where)) as unknown as Json[];
    },
    now: () => new Date(NOW).toISOString(),
    tz: 'UTC',
    input: null,
  };
}

const ledgerDecl = (s: Script = ledger()): ScriptDecl => ({
  id: s.script,
  version: 1,
  egress: s.egress,
  keys: s.keys,
  reads: s.reads,
  writes: s.writes,
  ...(s.limits === undefined ? {} : { limits: s.limits }),
  source: s.source,
});

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

test('EACH TRANSACTION IS ONE LEDGER ROW, WITH ITS DIRECTION FROM THE SIGN, on the account the balances pull wrote', async () => {
  /* ONLY THE CHECKING ACCOUNT IS IN THE RECORD, so the savings account is said and never asked about. */
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const software = rowOf('categories', { name: 'Software', direction: 'out', state: 'live' });
  const h = mercuryHost({ accounts: [ops], transactions: [], categories: [software] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a), [
    {
      op: 'create',
      register: 'transactions',
      /* MINUS 1,240.75 IS 124,075 CENTS OUT, dated the day it posted and not the day it was started, and filed under
         Mercury's own category because the record has a live one of that name facing out. */
      fields: { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'cleared', mercury_id: 'txn_1', category: software.id },
    },
    {
      op: 'create',
      register: 'transactions',
      /* PENDING HAS NO POSTED DAY, so it is dated the day it was started, and it is not counted as cleared. */
      fields: { what: 'Halden Studio', on: '2026-09-20', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: ops.id, state: 'pending', mercury_id: 'txn_2' },
    },
  ]);
  assert.deepEqual(
    h.asked.map((r) => [new URL(r.url).pathname, r.key]),
    [
      ['/api/v1/accounts', 'Mercury (read only)'],
      ['/api/v1/account/acc_ops/transactions', 'Mercury (read only)'],
    ],
  );
  assert.equal(new URL(h.asked[1]!.url).searchParams.get('start'), '2026-08-21', 'thirty days back from the run');
  assert.match(a.log, /Mercury Savings ••9002 is not in accounts yet/);
});

test('A CATEGORY SOMEBODY PINNED IS KEPT: the next hour moves the bank’s facts and nothing a person set', async () => {
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const software = rowOf('categories', { name: 'Software', direction: 'out', state: 'live' });
  /* FILED BY MERCURY'S CATEGORY WHILE PENDING, THEN REFILED BY HAND to a category Mercury has never heard of, with a
     description the person tidied. */
  const fenwick = rowOf(
    'transactions',
    { what: 'Fenwick hosting', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'pending', mercury_id: 'txn_1', category: 'cat_hosting' },
    4,
  );
  const halden = rowOf('transactions', { what: 'Halden Studio', on: '2026-09-20', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: ops.id, state: 'pending', mercury_id: 'txn_2' }, 1);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [fenwick, halden], categories: [software] }));
  /* ONE WRITE. The Fenwick payment cleared, so its state moves; its category, its description and everything else
     a person set are not in the patch. Halden is unchanged and is not written at all.

     CHECKED THE OTHER WAY ON SEPTEMBER 25TH. With `ledger.js` changed to look Mercury's category up for every
     transaction and restate it on an update, this test and the whole path both went red: the patch carried
     `category: <Software>` here, and on the self-host the row the person had moved to Hosting was back under Software
     an hour later. A first attempt at that check changed only the update and left the lookup to new rows, and both
     stayed green, because the category a restatement needs was never looked up. */
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${fenwick.seq}`, patch: { state: 'cleared' }, version: 4 }]);
});

test('A TRANSACTION MERCURY CANCELS AFTER IT WAS HELD IS VOID, and a status nobody has heard of is said, not guessed', async () => {
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const held = rowOf('transactions', { what: 'Coffee Stall', on: '2026-09-20', direction: 'out', amount: { amount: 6_000, currency: 'USD' }, account: ops.id, state: 'pending', mercury_id: 'txn_3' }, 2);
  const txns = [OPS_TXNS[2], txn('txn_9', -10, 'blocked', 'Tollgate', '2026-09-21T09:00:00Z', null)];
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [held], categories: [], txns }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${held.seq}`, patch: { state: 'void' }, version: 2 }]);
  assert.match(a.log, /Mercury says txn_9 is "blocked", which this pack does not know/);
});

test('A TRANSACTION A PERSON VOIDED STAYS VOID, because Mercury never sends one it cancelled and only a person voids a sent one', async () => {
  /* THE CHECKER'S BREAK, MEASURED ON SEPTEMBER 25TH ON THE SELF-HOST PATH BELOW. A person voided the Fenwick payment,
     which he had already typed in by hand before the pack arrived, and the next hour put it back to `cleared`, so the
     duplicate he had just taken out of every Ledger figure was counted again, and would be every hour for thirty days.
     `cancelled` and `failed` are the end of a Mercury transaction, so a held row that is void was made void either by
     this script, which Mercury will not contradict, or by a person, whom it must not. The rest of the bank's facts
     still move. */
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const voided = rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_000, currency: 'USD' }, account: ops.id, state: 'void', mercury_id: 'txn_1' }, 3);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [voided], categories: [], txns: [OPS_TXNS[0]] }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${voided.seq}`, patch: { amount: { amount: 124_075, currency: 'USD' } }, version: 3 }]);
});

/** The Halden payment as the script writes it on a record that holds no row for it. */
const haldenOn = (account: string): Record<string, Json> => ({
  what: 'Halden Studio',
  on: '2026-09-20',
  direction: 'in',
  amount: { amount: 500_000, currency: 'USD' },
  account,
  state: 'pending',
  mercury_id: 'txn_2',
});

test('A TRANSACTION WHOSE ROW A PERSON DELETED IS NOT WRITTEN AGAIN, because the ledger is read with its deleted rows as well', async () => {
  /* THE BREAK OF M6: he deleted the Fenwick row, and the next hour wrote it back, because the list read live rows
     only. The ledger is asked again, deleted rows included, about the transactions it holds no live row for. */
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const deleted: Row = {
    ...rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'cleared', mercury_id: 'txn_1' }),
    deleted_at: '2026-09-19T20:00:00.000Z',
  };
  const h = mercuryHost({ accounts: [ops], transactions: [deleted], categories: [], txns: [OPS_TXNS[0], OPS_TXNS[1]] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a), [{ op: 'create', register: 'transactions', fields: haldenOn(ops.id) }]);
  assert.match(a.log, /1 Mercury transaction whose row a person deleted was left out, as deleted/);
  assert.deepEqual(
    h.lists.filter(([, , options]) => options !== null),
    [['transactions', { field: 'mercury_id', in: ['txn_1', 'txn_2'] }, { includeDeleted: true }]],
  );
});

test('A ROW TYPED IN BY HAND BEFORE THE PACK IS TAKEN, NOT WRITTEN AGAIN: what the person set is kept, and the day moves to the bank’s', async () => {
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const money = { amount: 124_075, currency: 'USD' };
  /* TYPED THE DAY BEFORE IT POSTED, under a category and a description of the person's own, with no Mercury
     transaction. */
  const typed = rowOf('transactions', { what: 'Cloud hosting, September', on: '2026-09-18', direction: 'out', amount: money, account: ops.id, state: 'cleared', category: 'cat_hosting' }, 2);
  /* AND THREE ROWS THAT ARE NOT THE SAME MONEY: the same amount coming in, the same amount three days before, and the
     same payment voided by the person, which voiding took out of the figures. */
  const refund = rowOf('transactions', { what: 'Refund', on: '2026-09-19', direction: 'in', amount: money, account: ops.id, state: 'cleared' });
  const early = rowOf('transactions', { what: 'Hosting', on: '2026-09-16', direction: 'out', amount: money, account: ops.id, state: 'cleared' });
  const voided = rowOf('transactions', { what: 'Fenwick', on: '2026-09-19', direction: 'out', amount: money, account: ops.id, state: 'void' });
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [typed, refund, early, voided], categories: [], txns: [OPS_TXNS[0]] }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${typed.seq}`, patch: { on: '2026-09-19', mercury_id: 'txn_1' }, version: 2 }]);
  assert.match(a.log, /1 row typed in by hand was the same money as a Mercury transaction/);
});

test('TWO ROWS THAT COULD BE THE SAME MONEY ARE NOT GUESSED BETWEEN: the transaction is written as its own row, and the log names its day and amount', async () => {
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const money = { amount: 124_075, currency: 'USD' };
  const one = rowOf('transactions', { what: 'Fenwick', on: '2026-09-19', direction: 'out', amount: money, account: ops.id, state: 'cleared' });
  const two = rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-20', direction: 'out', amount: money, account: ops.id, state: 'pending' });
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [one, two], categories: [], txns: [OPS_TXNS[0]] }));
  assert.deepEqual(writesOf(a), [
    { op: 'create', register: 'transactions', fields: { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: money, account: ops.id, state: 'cleared', mercury_id: 'txn_1' } },
  ]);
  assert.match(a.log, /2 rows typed in by hand could be Mercury's 1,240\.75 USD out on 2026-09-19, so none was taken/);
});

test('ONE ROW TYPED BY HAND IS TAKEN ONCE: two Mercury transactions of the same money on one day take it and write one', async () => {
  /* TWO COFFEES OF 60.00 ON THE 19TH, and one typed in. The first takes it; the second finds it taken, since the
     update is queued and the ledger still answers it as a row with no Mercury transaction, and is written. */
  const ops = rowOf('accounts', { name: OPS.name, kind: 'bank' });
  const typed = rowOf('transactions', { what: 'Coffee', on: '2026-09-19', direction: 'out', amount: { amount: 6_000, currency: 'USD' }, account: ops.id, state: 'cleared' }, 1);
  const txns = [
    txn('txn_a', -60, 'sent', 'Coffee Stall', '2026-09-19T08:00:00Z', '2026-09-19T09:00:00Z'),
    txn('txn_b', -60, 'sent', 'Coffee Stall', '2026-09-19T14:00:00Z', '2026-09-19T15:00:00Z'),
  ];
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [typed], categories: [], txns }));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `transactions#${typed.seq}`, patch: { mercury_id: 'txn_a' }, version: 1 },
    { op: 'create', register: 'transactions', fields: { what: 'Coffee Stall', on: '2026-09-19', direction: 'out', amount: { amount: 6_000, currency: 'USD' }, account: ops.id, state: 'cleared', mercury_id: 'txn_b' } },
  ]);
});

test('A KEY MERCURY REFUSES STOPS THE RUN WITH A SENTENCE AND WRITES NOTHING', async () => {
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [], transactions: [], categories: [], status: 401 }));
  assert.ok('refused' in a, JSON.stringify(a));
  assert.equal(a.refused.code, null);
  assert.match(a.refused.why, /Mercury refused the key labelled "Mercury \(read only\)" \(401\)/);
});

test('THE WHOLE PATH ON A SELF-HOST: installed from the file, run on the hour, and the ledger holds one row a transaction', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-mercury-'));
  const sent: { path: string; auth: string | null }[] = [];
  let txns: unknown[] = OPS_TXNS;
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: {
      /* NOT A KEY: a word that names whose it is, so a leak would say where it came from. */
      openKey: async (grant) => (grant.label === 'Mercury (read only)' ? 'KEY-OF-mercury' : null),
      send: async (url, init) => {
        sent.push({ path: url.pathname, auth: new Headers(init.headers).get('authorization') });
        const body = url.pathname === '/api/v1/accounts' ? { accounts: [{ ...OPS, id: 'acc_ops' }] } : { total: txns.length, transactions: txns };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      },
      resolve: async (host) => (host === 'api.mercury.com' ? [{ address: '203.0.113.10', family: 4 }] : []),
    },
  });
  try {
    const person = running.directory.person$('ada@example.test', 'Ada');
    assert.ok(person.ok);
    const api = running.api;
    assert.ok((await api.createRecord({ id: ID, slug: 'kiln', name: 'Kiln', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
    const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
    const said = <T>(r: unknown): T => {
      const x = r as { ok: boolean; value: T };
      assert.ok(x.ok, fixOf(x as never));
      return x.value;
    };
    const put = async (doc: unknown) => {
      const planned = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
      said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
    };
    for (const id of ['portfolio', 'people', 'money-core']) await put(firstPartyDocument(id, { seeds: [] }));
    grantFor(running.sql, 'Mercury (read only)');
    const doc = fillMercury(template(), { id: 'kiln', grant: 'Mercury (read only)' });
    await put(doc);
    const s = ledger(doc);

    /* THE ACCOUNT, AS THE BALANCES PULL WRITES IT, and the pull itself held off so that this hour runs the ledger and
       nothing else. The pull's own rows are the tests above. */
    const opsRow = said<{ id: string }>(await api.create({ register: 'accounts', fields: { name: OPS.name, kind: 'bank', balance: { amount: 1_842_050, currency: 'USD' }, as_of: '2026-09-20', liquid: true } }, owner));
    /* THE HALDEN PAYMENT, TYPED IN BY HAND BEFORE THE PACK, a day after Mercury dates it and under the person's own
       words. The first hour takes it rather than writing Mercury's copy beside it, which is the record's own `list`
       answering the question `twinsOf` in `ledger.js` asks. */
    said(await api.create({ register: 'transactions', fields: { what: 'Halden, September invoice', on: '2026-09-21', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: opsRow.id, state: 'pending' } }, owner));
    said(await api.create({ register: 'categories', fields: { name: 'Software', direction: 'out' } }, owner));
    const hosting = said<{ id: string }>(await api.create({ register: 'categories', fields: { name: 'Hosting', direction: 'out' } }, owner));
    running.sql.exec("UPDATE schedule SET due_at = '2099-01-01T00:00:00.000Z' WHERE kind = 'pull'");
    const hour = async () => {
      running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script' AND key = ?", new Date(Date.now() - 1_000).toISOString(), s.script);
      await running.poll();
    };
    await hour();

    const [event] = running.sql.all<{ to_v: string | null; note: string }>(
      'SELECT note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid',
      `declaration:script.${s.script}`,
    );
    const outcome = JSON.parse(event?.to_v ?? '{}') as { outcome?: string; log?: string };
    assert.equal(outcome.outcome, 'ok', `${event?.note ?? 'no run event'} ${outcome.log ?? ''}`);
    assert.match(outcome.log ?? '', /1 row typed in by hand was the same money as a Mercury transaction/);
    assert.ok(sent.length > 0 && sent.every((r) => r.auth === 'Bearer KEY-OF-mercury'), JSON.stringify(sent));

    type Txn = { seq: number; what: string; direction: string; amount: number; state: string; mercury_id: string; category: string | null };
    const ledgerRows = (): Txn[] =>
      running.sql
        .all<Txn>(
          `SELECT seq, json_extract(fields, '$.what') AS what, json_extract(fields, '$.direction') AS direction, json_extract(fields, '$.amount.amount') AS amount,
                  json_extract(fields, '$.state') AS state, json_extract(fields, '$.mercury_id') AS mercury_id, json_extract(fields, '$.category') AS category
           FROM entry WHERE register = 'transactions' AND deleted_at IS NULL ORDER BY json_extract(fields, '$.mercury_id')`,
        )
        .map((r) => ({ ...r }));
    const software = running.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'categories' AND json_extract(fields, '$.name') = 'Software'")!.id;
    const first = ledgerRows();
    assert.deepEqual(
      first.map(({ seq: _seq, ...r }) => r),
      [
        { what: 'Fenwick Cloud', direction: 'out', amount: 124_075, state: 'cleared', mercury_id: 'txn_1', category: software },
        /* THE ROW HE TYPED, CARRYING MERCURY'S TRANSACTION, with his words kept: two rows and not three. */
        { what: 'Halden, September invoice', direction: 'in', amount: 500_000, state: 'pending', mercury_id: 'txn_2', category: null },
      ],
    );

    /* A PERSON REFILES THE FENWICK PAYMENT, AND THE NEXT HOUR HALDEN'S MONEY CLEARS. Two rows still, Halden cleared,
       and Fenwick where the person put it. */
    said(await api.update({ register: 'transactions', seq: first[0]!.seq, patch: { category: hosting.id } }, owner));
    txns = [OPS_TXNS[0], txn('txn_2', 5000, 'sent', 'Halden Studio', '2026-09-20T08:00:00Z', '2026-09-21T10:00:00Z'), OPS_TXNS[2]];
    await hour();
    assert.deepEqual(
      ledgerRows().map((r) => [r.mercury_id, r.state, r.category]),
      [
        ['txn_1', 'cleared', hosting.id],
        ['txn_2', 'cleared', null],
      ],
    );

    /* HE DELETES THE FENWICK ROW, AND THE NEXT HOUR LEAVES IT DELETED. Before 1.2.0 it was back an hour later, because
       the ledger was read live rows only (`loop/finish/defects.md` M6); the record's own deleted rows are what say
       otherwise now. `deleted_at: true`, because the record stamps the time with its own clock. */
    said(await api.update({ register: 'transactions', seq: first[0]!.seq, patch: { deleted_at: true } }, owner));
    await hour();
    assert.deepEqual(
      ledgerRows().map((r) => r.mercury_id),
      ['txn_2'],
    );
    assert.equal(running.sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'transactions' AND json_extract(fields, '$.mercury_id') = 'txn_1'")?.n, 1);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
