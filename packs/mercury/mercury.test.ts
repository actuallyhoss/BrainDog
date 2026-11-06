/**
 * Mercury, pulled, as a pack file: the company's bank balances arriving on their own instead of being typed in.
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `mercuryPack` in `packages/seed/src/packs/mercury.ts` built it in
 * code, so the shell carried one bank as TypeScript. It became `mercury.pack.json`, with the four things a person
 * supplied named under `fill` and filled by a function in this test that no stranger could run.
 *
 * WHY A BANK AND WHY THIS ONE. Company cash (Mercury and Stripe pulls) is the one money
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
 * RED FIRST, MEASURED: with no pack file every test that fills it failed, and
 * with the file written the re-export test still failed on `packages/seed/src/packs/index.ts`, the barrel that gave
 * `mercuryPack` a second name.
 *
 * THE LEDGER CAME SECOND. The balances were half of
 * what Mercury answers; the transactions, the part a person reads to know what the company spent on, stayed typed in,
 * because a pull cannot read a sign (the last section below, which still holds). `ledger.js` is a script beside the
 * pull, carried in the pack file byte for byte. Measured before it was in the file: all six ledger
 * tests below failed at their first read of the pack, "mercury.pack.json declares no script, so nothing in the pack
 * can write a transaction", the whole path on a self-host included.
 *
 * 1.2.0 COUNTS THE MONEY ONCE. A row typed in by hand before the pack is taken by the
 * transaction it stands for instead of being written beside it, and a transaction whose row a person deleted is not
 * written again. The tests after "A TRANSACTION A PERSON VOIDED" hold both, and the whole path holds them against the
 * record's own `list`. They were written from reading the code, before any of them had run.
 *
 * `mercury` 1.0.0 IS THE SAME PACK UNDER ITS OWN ID, WITH SETTINGS WHERE THE FILL WAS.
 * The key's label and how often it asks are `grant` and `every` beside `book`, filled by the record's own door when it
 * is planned and installed, and read by the ledger from `ctx.config`. A setting holds no id, so a record holds one
 * Mercury, and `mercury-company` is yanked from the catalogue with the reason "Replaced by Mercury".
 *
 * `mercury` 1.1.0 KEEPS THE PAYEE. Each transaction carries `counterpartyName` in `counterparty_text`, the field
 * money-core 3.10.0 declares on its ledger, so the floor moves to 3.10.0 and the pack lays only `mercury_id`, and the
 * record can resolve the payee to one organisation by its key. The two tests after "ONE ROW TYPED BY HAND" hold it, and the whole path holds the record's own field taking it.
 *
 * `mercury` 1.2.0 KEEPS THE ACCOUNTS IT FINDS. The balances pull is gone and the script writes the balances before the
 * transactions, finding each account by Mercury's own id in `mercury_account`. The pull found an account by its name
 * only, so on a record whose typed company accounts were named for people or for a bank's welcome line it wrote one
 * beside each, and company cash counted twice. First contact adopts the one typed account of the same currency whose
 * folded name is Mercury's name or nickname, and writes any other as an account that does not count as cash, noted,
 * while a typed account could be the same money. The tests under "the accounts, kept by Mercury's id" hold it, and
 * `both-feeds.test.ts` holds Mercury and Stripe on one record with either key refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { configReads, fillConfig, openRecord } from '../../packages/kernel/src/index.ts';
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

/** Some of the pack's settings, as a person sets them on its page. What is not named keeps its default. */
type Settings = { grant?: string; every?: string; book?: number };
type Script = Record<string, unknown> & { script: string; runs: { every: string }; egress: string[]; keys: string[]; reads: string[]; writes: string[]; limits?: Record<string, number>; source: string };

const scriptOf = (doc: Record<string, unknown>): Script => (doc.declarations as Record<string, unknown>[]).find((d) => typeof d.script === 'string') as Script;

/** Each setting's default, read from the file, so a test never holds a second copy of what the file says. */
const defaults = (file: Record<string, unknown>): Record<string, Json> =>
  Object.fromEntries(Object.entries(file.config as Record<string, { default: Json }>).map(([k, c]) => [k, c.default]));

/**
 * The file's declarations as a record stores them: every `{{config:<key>}}` filled with the settings' defaults and
 * whatever `set` changes, through the kernel's own `fillConfig`, which is what a plan does before it installs.
 *
 * FOR THE TESTS THAT HAND ONE DECLARATION STRAIGHT TO A KERNEL OR A SANDBOX, never for one that installs the file
 * through the record's door: that door fills the settings itself, and those tests hand it the file as it ships.
 */
function settled(file: Record<string, unknown>, set: Settings = {}): Record<string, unknown> {
  const doc = structuredClone(file);
  doc.declarations = fillConfig(doc.declarations as Json, { ...defaults(file), ...set });
  return doc;
}

/** What `ctx.config` holds for a run of the ledger: the settings' defaults and whatever `set` changes. */
const configOf = (set: Settings = {}): Json => ({ ...defaults(template()), ...set });

/* ── where the pack lives ─────────────────────────────────────────────────────────────────────── */

test('the file reads clean as an add-on somebody opens from disk, one Mercury a record, with its key and its clock as settings', async () => {
  const file = await readPackFile(readFileSync(PACK_FILE, 'utf8'));
  assert.ok(file.ok, fixOf(file));
  /* ITS OWN ID, AND ONE OF IT A RECORD. mercury-company was filled into mercury-<id>, one pack a Mercury profile, by a
     function no stranger could run; a setting holds no id, so a record holds one Mercury. */
  assert.equal(file.value.pack.manifest.pack, 'mercury');
  /* A TITLE OF ITS OWN, where it had none and a person read its id, "mercury-company", as its name. */
  assert.equal(file.value.title, 'Mercury');
  assert.equal('fill' in file.value.doc, false, 'the file still carries fill marks');
  const config = template().config as Record<string, { type: string; values?: string[]; default: Json }>;
  assert.deepEqual(
    Object.entries(config).map(([k, c]) => [k, c.type, c.default]),
    [
      ['grant', 'text', 'Mercury (read only)'],
      ['every', 'enum', '1h'],
      ['book', 'number', 0],
    ],
  );
  assert.deepEqual(config.every!.values, ['1h', '6h', '1d']);
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

/* ── nothing moved but the settings ───────────────────────────────────────────────────────────── */

test('THE KEY AND THE CLOCK ARE READ WHERE THE SCRIPT READS THEM, AND NOWHERE ELSE', () => {
  /* ONE DECLARATION SINCE 1.2.0, the script, where a pull beside it read the same two settings. It runs on the
     `every` clock and declares the `grant` key, which its source reads from `ctx.config`, because a source cannot read
     its own declaration. */
  const reads = (template().declarations as Record<string, unknown>[]).flatMap((d, i) => configReads(d).map((r) => `${i}.${r.at} ${r.key}${r.whole ? '' : ' in text'}`));
  assert.deepEqual(reads, ['0.runs.every every', '0.keys[0] grant']);
  const source = readFileSync(new URL('./ledger.js', import.meta.url), 'utf8');
  assert.ok(source.includes('keyOf(ctx.config)') && source.includes('bookOf(ctx.config)'), 'ledger.js no longer reads its key and its book from its settings');
});

/**
 * Each set of settings, with what the file says once a record has filled it: the script's clock and key. The name of
 * the script and the host are the file's whatever is set.
 *
 * WRITTEN OUT AND NOT RECOMPUTED, because a table computed from the settings agrees with them by construction.
 */
for (const [name, set, want] of [
  ['nothing set', {}, ['1h', 'Mercury (read only)']],
  ['every six hours, a key of its own', { every: '6h', grant: 'Ops' }, ['6h', 'Ops']],
] as const satisfies readonly (readonly [string, Settings, readonly [string, string]])[])
  test(`SET, THE FILE CHANGES WHERE THE SETTINGS SAY AND NOWHERE ELSE: ${name}`, async () => {
    const filled = settled(template(), set);
    const script = scriptOf(filled);
    const [every, grant] = want;
    assert.deepEqual([script.script, script.runs.every, script.egress, script.keys], ['mercury_ledger', every, ['https://api.mercury.com'], [grant]]);

    /* AND EVERYTHING THE SETTINGS DO NOT NAME IS THE FILE'S, key order included: the version, the range on Money, the
       fields it lays, the source. */
    const blanked = (doc: Record<string, unknown>): string => {
      const d = structuredClone(doc);
      const s = scriptOf(d);
      s.runs.every = '';
      s.keys = [];
      return JSON.stringify(d);
    };
    assert.equal(blanked(filled), blanked(template()));
  });

/**
 * A vault entry as a row: a label and the host it opens, and no bytes, because a test's `openKey` is the key store.
 *
 * NEEDED SINCE THE LEDGER: install refuses a script whose key is not in the vault ("Add the key called ... to the
 * keychain, then install.").
 *
 * SEALED UNDER 'connector' AND NOT THE DEFAULT: this key is opened by the ledger script's own scheduled run, never
 * by a person at a screen. `sealed_under` defaults to `'record'`
 * (`packages/kernel/src/migrations/0010_grant_sealed_under.ts`), which is right for a key a person deposits to use
 * themselves, but `runnerCannotOpen` (`packages/kernel/src/actions.ts`) refuses to approve a call out with a
 * record-sealed key and `sealedGrant` (`packages/kernel/src/vault.ts`) refuses to open one at run time, both with
 * "was added for you to use, not for a connector". Leaving this row at the default made every test below fail that
 * check instead of exercising the script, so it is sealed the way a real connector key would be.
 */
const grantFor = (sql: Pick<NodeSql, 'exec'>, label: string): void =>
  sql.exec(
    "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at, sealed_under) VALUES ('g_mercury', ?, 'api.mercury.com', 'api_token', 'none', 'kek', 'k_test', ?, 'connector')",
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
  '“Mercury balances and transactions” reads accounts, transactions and categories and may send what it reads to api.mercury.com.',
  /* SINCE SHL-C05 (key-own-host-100) a key is held to its project and its host, so the list ends on who else can open it. */
  'A scheduled action opens this key with nobody present, so the server that runs it can open it too.',
];


test('INSTALLED THROUGH THE RECORD’S OWN DOOR, once the key is in the keychain and the owner approves the call out and the ledger script', async () => {
  const { sql, plan, put, close } = await withMoney();
  /* THE FILE AS IT SHIPS, settings and all: the record's door fills them with their defaults. */
  const doc = template();
  /* NOT BEFORE THE KEY IS IN THE VAULT: a script naming a key is refused at install. */
  const early = await put(doc, true);
  assert.equal(early.ok, false, 'installed with no key in the keychain');
  assert.equal(fixOf(early as never), 'Add the key called "Mercury (read only)" to the keychain, then install.');
  grantFor(sql, 'Mercury (read only)');
  /* THE SCRIPT'S LINES AND NOTHING ELSE. Before 1.2.0 a line for the balances pull came first, and it read that the
     pull sent no key while every run sent one; with the pull gone, every line he approves names the key it sends. */
  assert.deepEqual((await plan(doc)).approve, LEDGER_LINES);
  assert.equal((await put(doc, false)).ok, false, 'never without approval');
  assert.ok((await put(doc, true)).ok);
  close();
});

/**
 * One Mercury account, as `/api/v1/accounts` answers it. `currentBalance` is the balance kept; `createdAt` and
 * Mercury's own `kind` ride along and are neither the day of the balance nor this record's kind.
 */
const account = (name: string, balance: number, extra: Record<string, unknown> = {}) => ({
  id: `acc_${name.length}${balance}`,
  name,
  nickname: null,
  kind: 'checking',
  type: 'mercury',
  status: 'active',
  currentBalance: balance,
  availableBalance: balance,
  createdAt: '2024-02-11T10:04:00Z',
  ...extra,
});

const OPS = account('Mercury Checking ••4417', 18_420.5, { id: 'acc_ops' });
const RESERVE = account('Mercury Savings ••9002', 250_000, { id: 'acc_res' });

/* ── what the pack says, before anything runs ────────────────────────────────────────────────── */

test('THE PACK NAMES A KEY AND CARRIES NONE, and lays the field it finds an account by', () => {
  const doc = settled(template()) as {
    pack: string;
    requires: { packs: Record<string, string> };
    extends: Record<string, { fields: Record<string, unknown>[] }>;
    declarations: Record<string, unknown>[];
  };
  assert.equal(doc.pack, 'mercury');
  /* BELOW 4.0.0 AND NOT A CARET ON 1.x: money-core 2.0.0 took `holdings` away, which nothing here writes into, and a
     `^1.0.0` refused this pack beside it (`packages/seed/test/money-core-major.test.ts` plans it on both). 3.0.0 took
     pages and card wordings and kept the accounts and transactions this pack writes, so 1.1.1 widened to it. The floor
     moved in 1.3.0, to 3.1.0, whose `books` the `book` setting files each row in, and in 1.1.0 of this id to 3.10.0, whose
     ledger declares the `counterparty_text` the script writes, and in 1.3.0 of this id to 3.31.0, whose accounts declare
     the `no_feed` the script marks each account it keeps with. */
  assert.deepEqual(doc.requires.packs, { 'money-core': '>=3.31.0 <4.0.0' });

  /* THE PULL IS GONE (1.2.0): one script, one key path, balances then transactions. */
  assert.deepEqual(doc.declarations.map((d) => (typeof d.script === 'string' ? `script ${d.script}` : `other ${String(d.ingest ?? '')}`)), ['script mercury_ledger']);
  /* MERCURY'S OWN ID ON EACH ACCOUNT, indexed because every run reads the accounts by it, and the note an account it
     could not match carries. */
  assert.deepEqual(doc.extends['register.accounts']?.fields, [
    { id: 'mercury_account', label: 'Mercury account', type: 'text', index: true },
    { id: 'mercury_note', label: 'Note', type: 'text' },
  ]);

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

/** The ledger script, as a record stores it unless a file is given, or a failure that says the pack does not carry one. */
const ledger = (doc: Record<string, unknown> = settled(template())): Script => {
  const s = scriptOf(doc);
  assert.ok(s !== undefined, 'mercury.pack.json declares no script, so nothing in the pack can write a transaction');
  return s;
};

test('THE PACK CARRIES ledger.js AS ITS SOURCE, byte for byte, on its host, key and clock', () => {
  const doc = template();
  const s = ledger(doc);
  const filled = ledger();
  assert.equal(s.source, LEDGER_SOURCE, 'mercury.pack.json and ledger.js disagree; copy ledger.js into the source');
  assert.deepEqual(filled.runs, { every: '1h' });
  assert.deepEqual(filled.egress, ['https://api.mercury.com']);
  assert.deepEqual(filled.keys, ['Mercury (read only)']);
  assert.deepEqual([...s.reads].sort(), ['accounts', 'categories', 'transactions']);
  /* AND THE ACCOUNTS, which it keeps itself since 1.2.0 and filed in the `book` setting's book since 1.3.0. */
  assert.deepEqual(s.writes, ['transactions', 'accounts']);
  /* THE SCRIPT STOPS QUEUING AT ITS OWN LIMIT, so the two numbers are one. A limit lower than the script's constant
     would refuse the whole run past it, and every row with it. */
  assert.ok(s.source.includes(`const WRITES = ${s.limits?.writes};`), `limits.writes is ${s.limits?.writes} and ledger.js stops at another number`);
  assert.ok(s.source.includes(`const FETCHES = ${s.limits?.fetches};`), `limits.fetches is ${s.limits?.fetches} and ledger.js stops at another number`);
  /* AND IT LAYS THE ONE FIELD IT FINDS A TRANSACTION AGAIN BY, and not the payee it writes since 1.1.0: money-core 3.10.0
     declares `counterparty_text` itself, and every bank door laying it too made two fields under one id, or, in Money's
     own shape, a ledger staged as the record's own list that refused Money's next update. */
  const payee = (REGISTERS.transactions as { fields: readonly { id: string }[] }).fields.find((f) => f.id === 'counterparty_text');
  assert.ok(payee, 'Money declares no payee field to write');
  assert.deepEqual((doc.extends as Record<string, { fields: Record<string, unknown>[] }>)['register.transactions']?.fields, [
    { id: 'mercury_id', label: 'Mercury transaction', type: 'text' },
  ]);
  const cards = JSON.parse(readFileSync(new URL('../card-alerts/card-alerts.pack.json', import.meta.url), 'utf8')) as { extends?: unknown };
  assert.equal(cards.extends, undefined, 'another bank door lays the payee field again');
  assert.deepEqual([doc.version, typeof doc.changes], ['1.3.2', 'string']);
  /* THE CHANGES LINE IS READ BY A PERSON ON THE ADD-ON'S PAGE: plain words, no dash for a comma, no id. */
  assert.equal(/[—–]|mercury_|#\d/.test(String(doc.changes)), false, String(doc.changes));
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
function mercuryHost(state: {
  accounts: Row[];
  transactions: Row[];
  categories: Row[];
  /** What `/api/v1/accounts` answers; the checking account alone unless a test names more. */
  mercury?: unknown[];
  /** The checking account's transactions; every other account has none unless `more` names them. */
  txns?: unknown[];
  more?: Record<string, unknown[]>;
  status?: number;
}): CtxHost & { asked: HostRequest[]; lists: [string, Json, Json][] } {
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
      const at = /^\/api\/v1\/account\/([^/]+)\/transactions$/.exec(url.pathname);
      const listed = at === null ? [] : at[1] === 'acc_ops' ? (state.txns ?? OPS_TXNS) : (state.more?.[at[1]!] ?? []);
      const body = url.pathname === '/api/v1/accounts' ? { accounts: state.mercury ?? [OPS] } : { total: listed.length, transactions: listed };
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
    config: configOf(),
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

/* ── the accounts, kept by Mercury's id ──────────────────────────────────────────────────────── */

const TODAY = new Date(NOW).toISOString().slice(0, 10);
const NOTE = 'Not yet matched to an account you typed';
type Fixture = { id: string; name: string; currentBalance: number };
/** An account the script already keeps: Mercury's id on it, and its balance as of today, in cents. */
const keptRow = (a: Fixture, extra: Record<string, Json> = {}): Row =>
  rowOf('accounts', { name: a.name, kind: 'bank', balance: { amount: Math.round(a.currentBalance * 100), currency: 'USD' }, as_of: TODAY, liquid: true, mercury_account: a.id, no_feed: false, ...extra });
const opsHeld = (): Row => keptRow(OPS);
/** An account a person typed in, which no feed keeps. */
const typedRow = (name: string, amount: number, currency = 'USD', extra: Record<string, Json> = {}): Row =>
  rowOf('accounts', { name, kind: 'bank', balance: { amount, currency }, as_of: '2026-09-01', liquid: true, ...extra });
/** The account as the script writes it when it meets a Mercury account it cannot pair. */
const createdAccount = (a: Fixture, liquid: boolean, extra: Record<string, Json> = {}): ScriptWrite => ({
  op: 'create',
  register: 'accounts',
  fields: { name: a.name, kind: 'bank', balance: { amount: Math.round(a.currentBalance * 100), currency: 'USD' }, as_of: TODAY, liquid, mercury_account: a.id, no_feed: false, ...(liquid ? {} : { mercury_note: NOTE }), ...extra },
});

test('A FRESH RECORD: ONE ACCOUNT A MERCURY ACCOUNT, counted as cash, in cents, dated the hour it ran, carrying Mercury’s id', async () => {
  /* NOTHING TYPED COULD BE THE SAME MONEY, so each counts as cash from the first hour. Their transactions wait for the
     next hour, when the accounts they belong to have ids. */
  const h = mercuryHost({ accounts: [], transactions: [], categories: [], mercury: [OPS, RESERVE] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a), [createdAccount(OPS, true), createdAccount(RESERVE, true)]);
  assert.deepEqual(h.asked.map((r) => new URL(r.url).pathname), ['/api/v1/accounts']);
  assert.match(a.log, /"Mercury Savings ••9002" is new to the record this hour, so its transactions arrive next hour/);
  assert.doesNotMatch(a.log, /not yet matched/);
});

test('THE NEXT HOUR KEEPS EACH ON ITS OWN ACCOUNT: renamed is still found, a moved balance moves, and one Mercury stopped listing is left', async () => {
  /* RENAMED BY A PERSON, AND UNMOVED: nothing is written, the name least of all. */
  const ops = keptRow(OPS, { name: 'Company checking' });
  /* MOVED SINCE YESTERDAY, and set by a person not to count as cash, which stays theirs. */
  const reserve = keptRow(RESERVE, { balance: { amount: 24_000_000, currency: 'USD' }, as_of: '2026-09-19', liquid: false });
  /* AN ACCOUNT MERCURY NO LONGER LISTS keeps its last balance: an answer that left it out did not close it. */
  const gone = keptRow(account('Mercury Treasury', 900, { id: 'acc_gone' }) as Fixture);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops, reserve, gone], transactions: [], categories: [], mercury: [OPS, RESERVE], txns: [] }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `accounts#${reserve.seq}`, patch: { balance: { amount: 25_000_000, currency: 'USD' }, as_of: TODAY }, version: 1 }]);
});

test('TWO MERCURY ACCOUNTS UNDER ONE NAME ARE TWO ACCOUNTS, where the pull keyed on the name wrote one over the other', async () => {
  /* BEFORE 1.2.0 THE REGISTER HELD ONE, the company's cash short by the other's balance, and the run counted two
     written. Mercury's own id is the key the pull wanted and the register could not hold. */
  const one = account('Mercury Operating', 10_000, { id: 'acc_a' }) as Fixture;
  const two = account('Mercury Operating', 250, { id: 'acc_b' }) as Fixture;
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [], transactions: [], categories: [], mercury: [one, two] }));
  assert.deepEqual(writesOf(a), [createdAccount(one, true), createdAccount(two, true)]);
});

test('FIRST CONTACT TAKES THE ONE ACCOUNT A PERSON TYPED UNDER MERCURY’S NAME OR NICKNAME, case folded, keeping the name, and reads it the same hour', async () => {
  const ops = { ...OPS, nickname: 'Ops' };
  const reserve = { ...RESERVE, nickname: 'Reserve' };
  /* MERCURY'S NAME, CASED AND SPACED BY HAND, as the 1.1.0 pull's own account is too, under the very name. */
  const typedOps = typedRow('mercury checking  ••4417 ', 1_700_000, 'USD', { book: 'books#2' });
  /* THE NICKNAME, in capitals. */
  const typedReserve = typedRow('RESERVE', 24_000_000);
  /* NOT CANDIDATES: the same name in pounds, and one Stripe keeps under the nickname. */
  const pounds = typedRow('Mercury Checking ••4417', 50_000, 'GBP');
  const stripes = typedRow('Reserve', 100, 'USD', { stripe_kind: 'available' });
  const h = mercuryHost({ accounts: [typedOps, typedReserve, pounds, stripes], transactions: [], categories: [], mercury: [ops, reserve], txns: [] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${typedOps.seq}`, patch: { mercury_account: 'acc_ops', balance: { amount: 1_842_050, currency: 'USD' }, as_of: TODAY, no_feed: false }, version: 1 },
    { op: 'update', spoken: `accounts#${typedReserve.seq}`, patch: { mercury_account: 'acc_res', balance: { amount: 25_000_000, currency: 'USD' }, as_of: TODAY, no_feed: false }, version: 1 },
  ]);
  assert.match(a.log, /Took over "mercury checking {2}••4417 ": it is "Mercury Checking ••4417" at Mercury/);
  assert.match(a.log, /Took over "RESERVE"/);
  /* TAKEN, SO THEIR TRANSACTIONS ARE READ THIS HOUR: each account's id is the typed row's, which stood before the run. */
  assert.deepEqual(h.asked.map((r) => new URL(r.url).pathname), ['/api/v1/accounts', '/api/v1/account/acc_ops/transactions', '/api/v1/account/acc_res/transactions']);
});

test('HIS CASE: COMPANY ACCOUNTS TYPED UNDER OTHER NAMES ARE NOT GUESSED: each Mercury account is its own account, not cash, noted, and counted in the log', async () => {
  /* TYPED FOR PEOPLE AND FOR A BANK'S WELCOME LINE, which share no name with Mercury's. Either could be the same money,
     so neither is taken, nothing is written over them, and Mercury's accounts count for nothing until a person says
     which is which. Before 1.2.0 the pull wrote these two as cash beside them, and the company's cash counted twice. */
  const people = typedRow('Wren and Ada', 1_842_050);
  const welcome = typedRow('Welcome to Mercury', 25_000_000);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [people, welcome], transactions: [], categories: [], mercury: [OPS, RESERVE] }));
  assert.deepEqual(writesOf(a), [createdAccount(OPS, false), createdAccount(RESERVE, false)]);
  assert.match(a.log, /2 Mercury accounts are not yet matched to an account you typed, so they do not count as cash until you say which ones they are, or that they are new\./);
});

test('TWO ACCOUNTS UNDER MERCURY’S NAME ARE NOT GUESSED BETWEEN: Mercury’s is its own account, not cash, and the log names both', async () => {
  const first = typedRow('Mercury Checking ••4417', 1_800_000);
  const second = typedRow('MERCURY CHECKING ••4417', 1_842_050);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [first, second], transactions: [], categories: [] }));
  assert.deepEqual(writesOf(a), [createdAccount(OPS, false)]);
  assert.match(a.log, /"Mercury Checking ••4417" and "MERCURY CHECKING ••4417" could each be "Mercury Checking ••4417" at Mercury, so none was taken\./);
  assert.match(a.log, /1 Mercury account is not yet matched to an account you typed, so it does not count as cash/);
});

test('ONE TYPED ACCOUNT TWO MERCURY ACCOUNTS BOTH NAME IS TAKEN BY NEITHER: taking it for the first listed would guess which money it is', async () => {
  /* TWO MERCURY ACCOUNTS UNDER ONE NAME, and one account a person typed under it. Either could be the typed one, so both
     are written, neither counts as cash, and the typed account is left as it was and said once. */
  const one = account('Mercury Operating', 10_000, { id: 'acc_a' }) as Fixture;
  const two = account('Mercury Operating', 250, { id: 'acc_b' }) as Fixture;
  const typed = typedRow('mercury operating', 1_000_000);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [typed], transactions: [], categories: [], mercury: [one, two] }));
  assert.deepEqual(writesOf(a), [createdAccount(one, false), createdAccount(two, false)]);
  assert.equal(a.log.split('"mercury operating" could be more than one Mercury account of that name, so none was taken.').length, 2, a.log);
  assert.match(a.log, /2 Mercury accounts are not yet matched to an account you typed/);
});

test('THE CURRENCY IS MERCURY’S FOR THE ACCOUNT, on its balance and on each of its transactions, in that currency’s minor units', async () => {
  /* A EURO ACCOUNT, said in Mercury's lower case; an account that names none is in dollars (the tests above). */
  const euros = account('Mercury EUR', 1_200.5, { id: 'acc_eur', currency: 'eur' }) as Fixture;
  const held = rowOf('accounts', { name: 'Company euros', kind: 'bank', balance: { amount: 100_000, currency: 'EUR' }, as_of: '2026-09-19', liquid: true, mercury_account: 'acc_eur', no_feed: false });
  const more = { acc_eur: [txn('txn_e', -12.3, 'sent', 'Lisbon Cafe', '2026-09-19T08:00:00Z', '2026-09-19T09:00:00Z')] };
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [held], transactions: [], categories: [], mercury: [euros], more }));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${held.seq}`, patch: { balance: { amount: 120_050, currency: 'EUR' }, as_of: TODAY }, version: 1 },
    {
      op: 'create',
      register: 'transactions',
      fields: { what: 'Lisbon Cafe', on: '2026-09-19', direction: 'out', amount: { amount: 1_230, currency: 'EUR' }, account: held.id, state: 'cleared', counterparty_text: 'Lisbon Cafe', mercury_id: 'txn_e' },
    },
  ]);
});

test('AN ACCOUNT A PERSON SET TO COUNT AS CASH HAS BEEN ANSWERED: the note goes, and nothing they set moves', async () => {
  const answered = keptRow(OPS, { mercury_note: NOTE });
  /* STILL WAITING: not cash, so the note stays. */
  const waiting = keptRow(RESERVE, { liquid: false, mercury_note: NOTE });
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [answered, waiting], transactions: [], categories: [], mercury: [OPS, RESERVE], txns: [] }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `accounts#${answered.seq}`, patch: { mercury_note: null }, version: 1 }]);
});

test('AN ACCOUNT KEPT BEFORE 1.3.0 SAYS IT IS FED THE NEXT HOUR, in Money’s own No bank feed, and one a person marked fed is left', async () => {
  /* MONEY READS `no_feed` BEFORE IT POSTS A REPEATING LINE ITSELF, and never this pack's own field, so a row this pack
     kept before it said so is marked once, with nothing else of it moved. */
  const before = rowOf('accounts', { name: OPS.name, kind: 'bank', balance: { amount: Math.round(OPS.currentBalance * 100), currency: 'USD' }, as_of: TODAY, liquid: true, mercury_account: OPS.id });
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [before, keptRow(RESERVE)], transactions: [], categories: [], mercury: [OPS, RESERVE], txns: [] }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `accounts#${before.seq}`, patch: { no_feed: false }, version: 1 }]);
});

test('THE NOTE IN THE SCRIPT IS THE ONE A PERSON READS, word for word', () => {
  assert.ok(LEDGER_SOURCE.includes(`export const NOT_MATCHED = '${NOTE}';`), 'ledger.js notes an unmatched account in other words');
});

/* ── the transactions ────────────────────────────────────────────────────────────────────────── */
test('EACH TRANSACTION IS ONE LEDGER ROW, WITH ITS DIRECTION FROM THE SIGN, on the account it keeps', async () => {
  /* ONLY THE CHECKING ACCOUNT IS IN THE RECORD, so the savings account is written this hour, as cash because nothing
     typed could be the same money, and its transactions are not asked about until it has an id. */
  const ops = opsHeld();
  const software = rowOf('categories', { name: 'Software', direction: 'out', state: 'live' });
  const h = mercuryHost({ accounts: [ops], transactions: [], categories: [software], mercury: [OPS, RESERVE] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a), [
    createdAccount(RESERVE, true),
    {
      op: 'create',
      register: 'transactions',
      /* MINUS 1,240.75 IS 124,075 CENTS OUT, dated the day it posted and not the day it was started, and filed under
         Mercury's own category because the record has a live one of that name facing out. */
      fields: { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'cleared', counterparty_text: 'Fenwick Cloud', mercury_id: 'txn_1', category: software.id },
    },
    {
      op: 'create',
      register: 'transactions',
      /* PENDING HAS NO POSTED DAY, so it is dated the day it was started, and it is not counted as cleared. */
      fields: { what: 'Halden Studio', on: '2026-09-20', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: ops.id, state: 'pending', counterparty_text: 'Halden Studio', mercury_id: 'txn_2' },
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
  assert.match(a.log, /"Mercury Savings ••9002" is new to the record this hour/);
});

test('A CATEGORY SOMEBODY PINNED IS KEPT: the next hour moves the bank’s facts and nothing a person set', async () => {
  const ops = opsHeld();
  const software = rowOf('categories', { name: 'Software', direction: 'out', state: 'live' });
  /* FILED BY MERCURY'S CATEGORY WHILE PENDING, THEN REFILED BY HAND to a category Mercury has never heard of, with a
     description the person tidied. */
  const fenwick = rowOf(
    'transactions',
    { what: 'Fenwick hosting', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'pending', counterparty_text: 'Fenwick Cloud', mercury_id: 'txn_1', category: 'cat_hosting' },
    4,
  );
  const halden = rowOf('transactions', { what: 'Halden Studio', on: '2026-09-20', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: ops.id, state: 'pending', counterparty_text: 'Halden Studio', mercury_id: 'txn_2' }, 1);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [fenwick, halden], categories: [software] }));
  /* ONE WRITE. The Fenwick payment cleared, so its state moves; its category, its description and everything else
     a person set are not in the patch. Halden is unchanged and is not written at all.

     CHECKED THE OTHER WAY. With `ledger.js` changed to look Mercury's category up for every
     transaction and restate it on an update, this test and the whole path both went red: the patch carried
     `category: <Software>` here, and on the self-host the row the person had moved to Hosting was back under Software
     an hour later. A first attempt at that check changed only the update and left the lookup to new rows, and both
     stayed green, because the category a restatement needs was never looked up. */
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${fenwick.seq}`, patch: { state: 'cleared' }, version: 4 }]);
});

test('A TRANSACTION MERCURY CANCELS AFTER IT WAS HELD IS VOID, and a status nobody has heard of is said, not guessed', async () => {
  const ops = opsHeld();
  const held = rowOf('transactions', { what: 'Coffee Stall', on: '2026-09-20', direction: 'out', amount: { amount: 6_000, currency: 'USD' }, account: ops.id, state: 'pending', counterparty_text: 'Coffee Stall', mercury_id: 'txn_3' }, 2);
  const txns = [OPS_TXNS[2], txn('txn_9', -10, 'blocked', 'Tollgate', '2026-09-21T09:00:00Z', null)];
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [held], categories: [], txns }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${held.seq}`, patch: { state: 'void' }, version: 2 }]);
  assert.match(a.log, /Mercury calls a transaction of 2026-09-21 on "Mercury Checking ••4417" "blocked", which this pack does not know/);
});

test('A TRANSACTION A PERSON VOIDED STAYS VOID, because Mercury never sends one it cancelled and only a person voids a sent one', async () => {
  /* THE BREAK, MEASURED ON THE SELF-HOST PATH BELOW. A person voided the Fenwick payment,
     which he had already typed in by hand before the pack arrived, and the next hour put it back to `cleared`, so the
     duplicate he had just taken out of every Ledger figure was counted again, and would be every hour for thirty days.
     `cancelled` and `failed` are the end of a Mercury transaction, so a held row that is void was made void either by
     this script, which Mercury will not contradict, or by a person, whom it must not. The rest of the bank's facts
     still move. */
  const ops = opsHeld();
  const voided = rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_000, currency: 'USD' }, account: ops.id, state: 'void', counterparty_text: 'Fenwick Cloud', mercury_id: 'txn_1' }, 3);
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
  counterparty_text: 'Halden Studio',
  mercury_id: 'txn_2',
});

test('A TRANSACTION WHOSE ROW A PERSON DELETED IS NOT WRITTEN AGAIN, because the ledger is read with its deleted rows as well', async () => {
  /* THE BREAK: he deleted the Fenwick row, and the next hour wrote it back, because the list read live rows
     only. The ledger is asked again, deleted rows included, about the transactions it holds no live row for. */
  const ops = opsHeld();
  const deleted: Row = {
    ...rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'cleared', mercury_id: 'txn_1' }),
    deleted_at: '2026-09-19T20:00:00.000Z',
  };
  const h = mercuryHost({ accounts: [ops], transactions: [deleted], categories: [], txns: [OPS_TXNS[0], OPS_TXNS[1]] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a), [{ op: 'create', register: 'transactions', fields: haldenOn(ops.id) }]);
  assert.match(a.log, /1 Mercury transaction that a person deleted was left out, as deleted/);
  assert.deepEqual(
    h.lists.filter(([, , options]) => options !== null),
    [['transactions', { field: 'mercury_id', in: ['txn_1', 'txn_2'] }, { includeDeleted: true }]],
  );
});

test('A ROW TYPED IN BY HAND BEFORE THE PACK IS TAKEN, NOT WRITTEN AGAIN: what the person set is kept, and the day moves to the bank’s', async () => {
  const ops = opsHeld();
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
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${typed.seq}`, patch: { on: '2026-09-19', counterparty_text: 'Fenwick Cloud', mercury_id: 'txn_1' }, version: 2 }]);
  assert.match(a.log, /1 transaction typed in by hand was the same money as a Mercury transaction/);
});

test('TWO ROWS THAT COULD BE THE SAME MONEY ARE NOT GUESSED BETWEEN: the transaction is written as its own row, and the log names its day and amount', async () => {
  const ops = opsHeld();
  const money = { amount: 124_075, currency: 'USD' };
  const one = rowOf('transactions', { what: 'Fenwick', on: '2026-09-19', direction: 'out', amount: money, account: ops.id, state: 'cleared' });
  const two = rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-20', direction: 'out', amount: money, account: ops.id, state: 'pending' });
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [one, two], categories: [], txns: [OPS_TXNS[0]] }));
  assert.deepEqual(writesOf(a), [
    { op: 'create', register: 'transactions', fields: { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: money, account: ops.id, state: 'cleared', counterparty_text: 'Fenwick Cloud', mercury_id: 'txn_1' } },
  ]);
  assert.match(a.log, /2 transactions typed in by hand could be Mercury's 1,240\.75 USD out on 2026-09-19, so none was taken/);
});

test('ONE ROW TYPED BY HAND IS TAKEN ONCE: two Mercury transactions of the same money on one day take it and write one', async () => {
  /* TWO COFFEES OF 60.00 ON THE 19TH, and one typed in. The first takes it; the second finds it taken, since the
     update is queued and the ledger still answers it as a row with no Mercury transaction, and is written. */
  const ops = opsHeld();
  const typed = rowOf('transactions', { what: 'Coffee', on: '2026-09-19', direction: 'out', amount: { amount: 6_000, currency: 'USD' }, account: ops.id, state: 'cleared' }, 1);
  const txns = [
    txn('txn_a', -60, 'sent', 'Coffee Stall', '2026-09-19T08:00:00Z', '2026-09-19T09:00:00Z'),
    txn('txn_b', -60, 'sent', 'Coffee Stall', '2026-09-19T14:00:00Z', '2026-09-19T15:00:00Z'),
  ];
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [typed], categories: [], txns }));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `transactions#${typed.seq}`, patch: { counterparty_text: 'Coffee Stall', mercury_id: 'txn_a' }, version: 1 },
    { op: 'create', register: 'transactions', fields: { what: 'Coffee Stall', on: '2026-09-19', direction: 'out', amount: { amount: 6_000, currency: 'USD' }, account: ops.id, state: 'cleared', counterparty_text: 'Coffee Stall', mercury_id: 'txn_b' } },
  ]);
});

/**
 * THE PAYEE IS KEPT AS MERCURY NAMES IT (1.1.0), in `counterparty_text`, so the record can make it a payee key and find
 * the shop or the person it was. Spellings are not folded here: case, a processor's prefix and a trailing city are the
 * kernel's key to fold, so the text stays what the bank said and a person can see where a match came from.
 */
test('THE PAYEE IS KEPT AS MERCURY NAMES IT, and a transaction that names nobody gets none, never the nickname or the bank line', async () => {
  const ops = opsHeld();
  const named = (id: string, counterpartyName: string | undefined, extra: Record<string, string> = {}) => {
    const t: Record<string, unknown> = { ...txn(id, -18.5, 'sent', counterpartyName ?? '', '2026-09-19T08:00:00Z', '2026-09-19T09:00:00Z'), ...extra };
    if (counterpartyName === undefined) delete t.counterpartyName;
    return t;
  };
  const txns = [
    /* TWO SPELLINGS OF ONE SHOP, each kept as printed; that they are one shop is the kernel's to say. */
    named('txn_t1', 'Talabat'),
    named('txn_t2', 'talabat.com'),
    /* SPACES AROUND IT ARE NOT PART OF A NAME. */
    named('txn_s', '  Halden Studio '),
    /* NO NAME: the description falls back on the nickname a person gave, and no payee is made up from it. */
    named('txn_n', undefined, { counterpartyNickname: 'Our landlord', bankDescription: 'ACH DEBIT 0042' }),
  ];
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [], categories: [], txns }));
  const made = writesOf(a).map((w) => (w as { fields: Record<string, Json> }).fields);
  assert.deepEqual(
    made.map((f) => [f.mercury_id, f.what, f.counterparty_text]),
    [
      ['txn_t1', 'Talabat', 'Talabat'],
      ['txn_t2', 'talabat.com', 'talabat.com'],
      ['txn_s', '  Halden Studio ', 'Halden Studio'],
      ['txn_n', 'Our landlord', undefined],
    ],
  );
  assert.ok(!('counterparty_text' in made[3]!), 'a transaction that names nobody was given a payee');
});

test('A ROW HELD BEFORE 1.1.0 GAINS ITS PAYEE THE NEXT HOUR, and a payee a person corrected is kept', async () => {
  const ops = opsHeld();
  /* WRITTEN BY 1.0.x, with no payee, and nothing else to move: the payee is the whole patch. */
  const before = rowOf('transactions', { what: 'Fenwick Cloud', on: '2026-09-19', direction: 'out', amount: { amount: 124_075, currency: 'USD' }, account: ops.id, state: 'cleared', mercury_id: 'txn_1' }, 5);
  /* A PAYEE A PERSON PUT RIGHT, which the bank's own spelling does not undo. */
  const corrected = rowOf('transactions', { what: 'Halden Studio', on: '2026-09-20', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: ops.id, state: 'pending', counterparty_text: 'Halden Studio Ltd', mercury_id: 'txn_2' }, 2);
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [ops], transactions: [before, corrected], categories: [], txns: [OPS_TXNS[0], OPS_TXNS[1]] }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: `transactions#${before.seq}`, patch: { counterparty_text: 'Fenwick Cloud' }, version: 5 }]);
});

test('A KEY MERCURY REFUSES STOPS THE RUN WITH A SENTENCE AND WRITES NOTHING', async () => {
  const a = await runInQuickJs(ledgerDecl(), mercuryHost({ accounts: [], transactions: [], categories: [], status: 401 }));
  assert.ok('refused' in a, JSON.stringify(a));
  assert.equal(a.refused.code, null);
  assert.match(a.refused.why, /Mercury refused the key labelled "Mercury \(read only\)" \(401\)/);
});

test('THE LEDGER ASKS WITH THE KEY ITS SETTING NAMES, the one the pack declares, and asks nothing with none set', async () => {
  /* A LABEL THE OWNER SET, filled into the declaration's `keys` at install and read by the source from `ctx.config`, so
     the key the script asks for is the key it declares. */
  const h = { ...mercuryHost({ accounts: [], transactions: [], categories: [] }), config: configOf({ grant: 'Ops' }) };
  const a = await runInQuickJs(ledgerDecl(ledger(settled(template(), { grant: 'Ops' }))), h);
  assert.ok('writes' in a, JSON.stringify(a));
  assert.ok(h.asked.length > 0 && h.asked.every((r) => r.key === 'Ops'), JSON.stringify(h.asked));

  const none = { ...mercuryHost({ accounts: [], transactions: [], categories: [] }), config: configOf({ grant: '  ' }) };
  const refused = await runInQuickJs(ledgerDecl(), none);
  assert.ok('refused' in refused, JSON.stringify(refused));
  assert.match(refused.refused.why, /No key is set, so Mercury was not asked/);
  assert.equal(none.asked.length, 0);
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
    const doc = template();
    await put(doc);
    const s = ledger(doc);

    /* THE ACCOUNT A PERSON TYPED, UNDER MERCURY'S NAME, at a balance a day old. The first hour takes it as the checking
       account rather than writing one beside it, and reads its transactions the same hour. */
    const opsRow = said<{ id: string }>(await api.create({ register: 'accounts', fields: { name: OPS.name, kind: 'bank', balance: { amount: 1_842_050, currency: 'USD' }, as_of: '2026-09-19', liquid: true } }, owner));
    /* THE HALDEN PAYMENT, TYPED IN BY HAND BEFORE THE PACK, a day after Mercury dates it and under the person's own
       words. The first hour takes it rather than writing Mercury's copy beside it, which is the record's own `list`
       answering the question `twinsOf` in `ledger.js` asks. */
    said(await api.create({ register: 'transactions', fields: { what: 'Halden, September invoice', on: '2026-09-21', direction: 'in', amount: { amount: 500_000, currency: 'USD' }, account: opsRow.id, state: 'pending' } }, owner));
    said(await api.create({ register: 'categories', fields: { name: 'Software', direction: 'out' } }, owner));
    const hosting = said<{ id: string }>(await api.create({ register: 'categories', fields: { name: 'Hosting', direction: 'out' } }, owner));
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
    assert.match(outcome.log ?? '', /1 transaction typed in by hand was the same money as a Mercury transaction/);
    assert.match(outcome.log ?? '', /Took over "Mercury Checking ••4417"/);
    /* ONE ACCOUNT, THE ONE HE TYPED, now carrying Mercury's id and today's balance. */
    assert.deepEqual(
      running.sql
        .all<{ id: string; mercury: string; amount: number }>(
          "SELECT id, json_extract(fields, '$.mercury_account') AS mercury, json_extract(fields, '$.balance.amount') AS amount FROM entry WHERE register = 'accounts' AND deleted_at IS NULL",
        )
        .map((r) => [r.id, r.mercury, r.amount]),
      [[opsRow.id, 'acc_ops', 1_842_050]],
    );
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

    /* EACH CARRIES THE PAYEE AS MERCURY NAMES IT, the one he typed included, so the record's own field took it. */
    assert.deepEqual(
      running.sql
        .all<{ id: string; payee: string | null }>(
          "SELECT json_extract(fields, '$.mercury_id') AS id, json_extract(fields, '$.counterparty_text') AS payee FROM entry WHERE register = 'transactions' AND deleted_at IS NULL ORDER BY id",
        )
        .map((r) => [r.id, r.payee]),
      [
        ['txn_1', 'Fenwick Cloud'],
        ['txn_2', 'Halden Studio'],
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
       the ledger was read live rows only; the record's own deleted rows are what say
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

test('AN ARCHIVED ACCOUNT ADDS NO ROW AND SPENDS NO READ, and one a row already holds still has its balance kept', async () => {
  const shutNew = account('Mercury Checking ••1111', 0, { id: 'acc_shut', status: 'archived' }) as Fixture;
  const shutHeld = account('Mercury Checking ••2222', 0, { id: 'acc_held', status: 'archived' }) as Fixture;
  const held = keptRow(shutHeld, { balance: { amount: 500, currency: 'USD' } });
  const h = mercuryHost({ accounts: [opsHeld(), held], transactions: [], categories: [], mercury: [shutNew, shutHeld, OPS] });
  const a = await runInQuickJs(ledgerDecl(), h);
  assert.deepEqual(writesOf(a).filter((w) => w.op === 'create' && w.register === 'accounts'), []);
  const moved = writesOf(a).filter((w) => w.op === 'update');
  assert.equal(moved.length, 1);
  assert.deepEqual((moved[0] as unknown as { patch: Record<string, Json> }).patch.balance, { amount: 0, currency: 'USD' });
  assert.deepEqual(h.asked.map((r) => new URL(r.url).pathname), ['/api/v1/accounts', '/api/v1/account/acc_ops/transactions']);
});

test('A ROW WHOSE TAG HOLDS MERCURY’S ID IS THAT ACCOUNT, under any name, before a name is compared', async () => {
  const tagged = account('Mercury Checking ••7001', 1_000.5, { id: 'acc_tag', nickname: 'Payroll' }) as Fixture;
  const row = typedRow('Old checking', 80_000, 'USD', { tags: ['import:company:mercury:acc_tag:checking'] });
  const h = mercuryHost({ accounts: [row], transactions: [], categories: [], mercury: [tagged] });
  const a = await runInQuickJs(ledgerDecl(), h);
  const w = writesOf(a);
  const patch = (w[0] as unknown as { patch: Record<string, Json> }).patch;
  assert.deepEqual(w.map((x) => x.op), ['update']);
  assert.equal(patch.mercury_account, 'acc_tag');
  assert.deepEqual(patch.balance, { amount: 100_050, currency: 'USD' });
  assert.match(a.log, /Took over "Old checking"/);
});
