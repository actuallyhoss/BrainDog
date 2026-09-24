/**
 * Stripe, as a pack: the company's Stripe balance and the payouts on their way to the bank, arriving in Money's
 * accounts every hour instead of being typed in (`loop/research-legacy-parity.md` brief B4, row 57;
 * `loop/research-legacy-keeps.md` K7; `loop/DIRECTION.md` sections 22 and 24).
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
 * RED FIRST, MEASURED ON SEPTEMBER 25TH: with no `stripe.js` and no `stripe.pack.json` this file failed at its first
 * read, ENOENT, before a single test ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { openRecord, type Declaration } from '../../packages/kernel/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import type { CtxHost, HostRequest, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { REGISTERS, firstPartyDocument } from '../../packages/seed/src/index.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('stripe.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('stripe.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { pack: string; declarations: Record<string, unknown>[]; extends?: Record<string, unknown> };
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as {
  script: string;
  runs: Record<string, unknown>;
  egress: string[];
  keys: string[];
  reads: string[];
  writes: string[];
  limits?: Record<string, number>;
  source: string;
};

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
const payout = (id: string, amount: number, currency: string, arrives: string) => ({
  id,
  object: 'payout',
  amount,
  currency,
  arrival_date: Date.parse(`${arrives}T00:00:00Z`) / 1000,
  created: Date.parse('2026-09-23T10:00:00Z') / 1000,
  status: 'in_transit',
  method: 'standard',
});

/** Two dollar payouts in transit, the later one listed first, and one in euros. */
const IN_TRANSIT = {
  object: 'list',
  has_more: false,
  url: '/v1/payouts',
  data: [payout('po_b', 120_000, 'usd', '2026-09-28'), payout('po_a', 80_000, 'usd', '2026-09-26'), payout('po_c', 5_000, 'eur', '2026-09-29')],
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

test('THE PACK CARRIES stripe.js AS ITS SOURCE, byte for byte, and asks for one host, one key and one list', async () => {
  assert.equal(SCRIPT.source, SOURCE, 'stripe.pack.json and stripe.js disagree; copy stripe.js into the source');
  assert.deepEqual(SCRIPT.runs, { every: '1h' });
  assert.deepEqual(SCRIPT.egress, [API]);
  assert.deepEqual(SCRIPT.keys, ['stripe']);
  assert.deepEqual(SCRIPT.reads, ['accounts']);
  assert.deepEqual(SCRIPT.writes, ['accounts']);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'stripe');
});

/* ── The script, in QuickJS ────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };

/** A host double that answers Stripe's two addresses, records every request, and lists `accounts` by name prefix. */
function stripeHost(answers: { balance: unknown; payouts: unknown; status?: number }, accounts: Row[] = []): CtxHost & { asked: HostRequest[]; filters: Json[] } {
  const asked: HostRequest[] = [];
  const filters: Json[] = [];
  return {
    asked,
    filters,
    fetch: async (request) => {
      asked.push(request);
      const url = new URL(request.url);
      const body = url.pathname === '/v1/balance' ? answers.balance : url.pathname === '/v1/payouts' ? answers.payouts : { error: { message: 'No such route' } };
      return { status: answers.status ?? 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    },
    list: async (register, where) => {
      filters.push(where);
      /* THE PREFIX IS APPLIED HERE AS THE RECORD WOULD, so a script that asked for everything and a script that asked
         for the right thing do not look alike. What the script does with a row the prefix lets through is its own. */
      const starts = (where as { starts?: string } | null)?.starts;
      return register === 'accounts' ? (accounts.filter((a) => starts === undefined || String(a.fields.name).startsWith(starts)) as unknown as Json[]) : [];
    },
    now: () => NOW,
    tz: 'UTC',
    input: null,
  };
}

const declOf = (): ScriptDecl => ({
  id: SCRIPT.script,
  version: 1,
  egress: SCRIPT.egress,
  keys: SCRIPT.keys,
  reads: SCRIPT.reads,
  writes: SCRIPT.writes,
  ...(SCRIPT.limits === undefined ? {} : { limits: SCRIPT.limits }),
  source: SCRIPT.source,
});

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

const created = (name: string, amount: number, currency: string, liquid: boolean, arrives?: string): ScriptWrite => ({
  op: 'create',
  register: 'accounts',
  fields: { name, kind: 'bank', balance: { amount, currency }, as_of: TODAY, liquid, ...(arrives === undefined ? {} : { arrives }) },
});

test('ONE ROW A KIND AND A CURRENCY, AND ONE PAYOUT ROW A CURRENCY: the payouts summed, dated by the soonest to land', async () => {
  const h = stripeHost({ balance: BALANCE, payouts: IN_TRANSIT });
  const a = await runInQuickJs(declOf(), h);
  assert.deepEqual(writesOf(a), [
    created('Stripe available EUR', 31_000, 'EUR', true),
    created('Stripe available USD', 1_842_050, 'USD', true),
    created('Stripe payout in transit EUR', 5_000, 'EUR', true, '2026-09-29'),
    /* 120,000 AND 80,000 CENTS, and the one listed second lands first. A script that took the first payout's date
       would say the 28th, two days after the money is in the bank. */
    created('Stripe payout in transit USD', 200_000, 'USD', true, '2026-09-26'),
    created('Stripe pending EUR', 0, 'EUR', false),
    created('Stripe pending USD', 250_000, 'USD', false),
  ]);

  /* TWO REQUESTS, BOTH TO STRIPE, BOTH NAMING THE KEY BY ITS LABEL. The payouts are asked for in transit only, so a
     paid payout, already in the bank's balance, is never counted twice. */
  assert.deepEqual(
    h.asked.map((r) => [r.method, r.url, r.key]),
    [
      ['GET', `${API}/v1/balance`, 'stripe'],
      ['GET', `${API}/v1/payouts?status=in_transit&limit=100`, 'stripe'],
    ],
  );
  assert.deepEqual(h.filters, [{ field: 'name', starts: 'Stripe ' }]);
});

/** A row this pack wrote on an earlier hour. */
let minted = 0;
const held = (name: string, amount: number, currency: string, as_of = '2026-09-24', extra: Record<string, Json> = {}): Row => {
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

test('THE NEXT HOUR UPDATES IN PLACE: a payout that landed goes to zero, an unmoved row is left alone, and a person’s own Stripe account is not touched', async () => {
  const usd = held('Stripe available USD', 1_842_050, 'USD', TODAY);
  const eur = held('Stripe available EUR', 30_000, 'EUR');
  const transit = held('Stripe payout in transit USD', 200_000, 'USD', '2026-09-24', { arrives: '2026-09-25' });
  /* A ROW A PERSON KEEPS UNDER A NAME THAT STARTS THE SAME WAY. The prefix lets it through, and only the exact names
     this pack writes are the pack's, so it is neither zeroed nor rewritten. */
  const theirs = held('Stripe reserve (kept by hand)', 1_000_000, 'USD');
  const settled = { ...BALANCE, pending: [] };
  const a = await runInQuickJs(declOf(), stripeHost({ balance: settled, payouts: { ...IN_TRANSIT, data: [] } }, [usd, eur, transit, theirs]));
  assert.deepEqual(writesOf(a), [
    { op: 'update', spoken: `accounts#${eur.seq}`, patch: { balance: { amount: 31_000, currency: 'EUR' }, as_of: TODAY }, version: 3 },
    /* THE DOLLARS LANDED, so the row says nothing is on its way rather than standing at 2,000.00 beside the bank
       balance that now holds the same money. */
    { op: 'update', spoken: `accounts#${transit.seq}`, patch: { balance: { amount: 0, currency: 'USD' }, as_of: TODAY, arrives: null }, version: 3 },
  ]);
});

test('A KEY STRIPE REFUSES STOPS THE RUN WITH A SENTENCE AND WRITES NOTHING, which is what pauses the script after three', async () => {
  const a = await runInQuickJs(declOf(), stripeHost({ balance: { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } }, payouts: {}, status: 401 }));
  assert.ok('refused' in a, JSON.stringify(a));
  /* `null` BECAUSE IT IS THE SCRIPT'S OWN ERROR and not a rule of the sandbox's. `script-run.ts` counts three refused
     runs in a row and pauses the script, which is the pull's 401 pause said by the only means a script has. */
  assert.equal(a.refused.code, null);
  assert.match(a.refused.why, /Stripe refused the key labelled "stripe" \(401\)/);
});

/* ── The whole path ────────────────────────────────────────────────────────────────────────────── */

test('THE WHOLE PATH ON A SELF-HOST: installed from the file, the key opened for api.stripe.com only, and six accounts written', async () => {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-stripe-'));
  const sent: { host: string; path: string; auth: string | null }[] = [];
  let answers: { balance: unknown; payouts: unknown } = { balance: BALANCE, payouts: IN_TRANSIT };
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
        const body = url.pathname === '/v1/balance' ? answers.balance : answers.payouts;
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
    const before = api.kernel.register('accounts')?.fields.map((f) => f.id) ?? [];
    assert.equal(before.includes('arrives'), false, 'accounts already says when money arrives');
    /* THE VAULT ENTRY FIRST, because install refused the pack without it: "Add the key called "stripe" to the vault,
       then install." It is a row, a label and what it opens and no bytes, because `openKey` above is the key store. */
    running.sql.exec(
      "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at) VALUES ('g_stripe', 'stripe', 'api.stripe.com', 'api_token', 'none', 'kek', 'k_test', ?)",
      NOW,
    );
    const approve = await put(PACK);
    /* THE LINE THE OWNER APPROVES NAMES THE HOST AND THE KEY. */
    assert.equal(approve[0], 'CALLS OUT api.stripe.com · every 1h · key "stripe" to api.stripe.com');
    /* AND IT SAYS WHAT THE SCRIPT COULD CARRY OUT. It reads accounts only to find its own rows, and the host still
       tells the owner that what it reads may leave for Stripe, which is true of any script with a read and a fetch. */
    assert.ok(approve.includes('stripe reads accounts and may send what it reads to api.stripe.com.'), JSON.stringify(approve));
    assert.ok(api.kernel.register('accounts')?.fields.some((f) => f.id === 'arrives'), 'the pack laid no arrives on accounts');

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
    ]);
    assert.deepEqual(accountsIn(running.sql), [
      ['Stripe available EUR', 31_000, 'EUR'],
      ['Stripe available USD', 1_842_050, 'USD'],
      ['Stripe payout in transit EUR', 5_000, 'EUR'],
      ['Stripe payout in transit USD', 200_000, 'USD'],
      ['Stripe pending EUR', 0, 'EUR'],
      ['Stripe pending USD', 250_000, 'USD'],
    ]);
    const arrives = running.sql.one<{ arrives: string }>("SELECT json_extract(fields, '$.arrives') AS arrives FROM entry WHERE register = 'accounts' AND json_extract(fields, '$.name') = 'Stripe payout in transit USD'");
    assert.equal(arrives?.arrives, '2026-09-26');

    /* THE NEXT HOUR, THE DOLLARS LANDED AND A EURO PAYOUT LEFT. Six rows still, updated where they moved. */
    answers = { balance: { ...BALANCE, available: [{ amount: 2_042_050, currency: 'usd' }, { amount: 31_000, currency: 'eur' }] }, payouts: { ...IN_TRANSIT, data: [IN_TRANSIT.data[2]] } };
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
