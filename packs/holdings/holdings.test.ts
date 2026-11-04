/**
 * Investments and gold, as a pack file: what a person owns beyond cash, each buy of it, and what it is worth now.
 *
 * WHERE IT CAME FROM. The list left Money at money-core 2.0.0 as `holdings`, built in code by `packages/seed` and kept
 * beside this file as `holdings-1.0.0.json`, the one list and nothing else. 1.1.0 to 1.4.2 added a cost script, a value
 * from a price somebody gave, the day of that price, and a question about an account and a holding of one name. 1.4.2,
 * the last of them, is kept beside this file as `holdings-1.4.2.json`, exactly as the catalogue published it, because it
 * is what a record that holds the add-on today updates from.
 *
 * WHY 2.0.0. The add-on becomes Investments and gold. A holding can be gold with a karat, a fund or shares; each buy of
 * it is a row of its own (`holding_buys`: the day, how many, the price each and the fees); a gold rate a gram a karat
 * is a row too (`gold_rates`), set by hand or by a feed (since 3.2.0 this add-on's own, off until chosen); and the script
 * works out what each holding cost from its buys, what it is worth from its own price or the gold rate, and its gain.
 * Two lists and a page are added, a holding can no longer be deleted while a buy points at it, its count and cost each
 * stop being required because buys can say them, and the value of every gold holding now moves with a rate: a change a
 * person notices, so a major.
 *
 * WHAT A 1.x RECORD KEEPS. Every field a 1.x holding has is still a field of the same type, every kind it could hold is
 * still a kind, and every figure and script id it ran is still declared. The tests under "a record on 1.4.2" put rows
 * under the published 1.4.2, update to this file, and hold every row to every value it had, then the daily run to add
 * what is new (how each holding was valued, and a gain where it has a price) without moving what it cost or is worth.
 *
 * THE GOLD RATE IS A LIST AND NOT A SETTING ON THE ADD-ON'S PAGE, because a setting is read into a declaration only
 * when the pack is planned again (`docs/04-PACKS.md`, config), so the page could not show today's rate or its age, and
 * no feed can write a setting. A row a karat can be typed today and written by a feed tomorrow, and keeps its history.
 *
 * RED FIRST, MEASURED. With `holdings-1.4.2.json` copied over the pack file, 22 of these 34 failed: every test of buys,
 * the gold rate, the page and the update, since the lists were unknown registers and a gold holding a kind the list did
 * not hold. The 12 that passed hold what 1.x already did (a price's day, one amount per currency, the question about an
 * account and a holding of one name), and are kept so 2.0.0 cannot lose it. The fixture rows are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import type { CtxHost, Json, ScriptDecl } from '../../packages/script/src/index.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const TODAY = '2026-09-25';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; adds: { id: string }[] };
type Body = Record<string, unknown>;
type Money = { amount: number; currency: string };
type Doc = Body & { version: string; requires: unknown; declarations: Body[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./holdings.pack.json', import.meta.url);
const file = (): Doc => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;
const COST_FILE = new URL('./cost.js', import.meta.url);
const TWIN_FILE = new URL('./twin.js', import.meta.url);
const FEED_FILE = new URL('./feed.js', import.meta.url);

/** 1.0.0 as the builder in `packages/seed` shipped it, and 1.4.2 as the catalogue published it. */
const v100 = (): Doc => JSON.parse(readFileSync(new URL('./holdings-1.0.0.json', import.meta.url), 'utf8')) as never;
const v142 = (): Doc => JSON.parse(readFileSync(new URL('./holdings-1.4.2.json', import.meta.url), 'utf8')) as never;

const list = (doc: Doc, id: string): Body & { fields: Body[] } => doc.declarations.find((d) => d.register === id) as never;
const decl = (doc: Doc, key: string, id: string): Body => doc.declarations.find((d) => d[key] === id)!;

/** A fresh record holding every first-party pack, which is where a person stands when they add this one. */
async function money(): Promise<{ api: Api; clock: ReturnType<typeof fixedClock>; close: () => void; sql: ReturnType<typeof openSqlite> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  return { api, clock, sql, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/**
 * The rules' runs taken to the end the way a host takes them: the schedule drained, then the outbox, with the script
 * run in QuickJS by the runner the self-host builds. The scripts fetch nothing, so the socket, the pin and the key
 * opener are doubles that refuse.
 */
async function settle(api: Api, rounds = 4, now: () => number = () => NOW): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the scripts fetch nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now } as never);
  for (let i = 0; i < rounds; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

const write = (api: Api, register: string, fields: Body): string => said<{ id: string }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).id;
const hold = (api: Api, fields: Body): string => write(api, 'holdings', fields);
const buy = (api: Api, fields: Body): string => write(api, 'holding_buys', fields);
const rate = (api: Api, fields: Body): string => write(api, 'gold_rates', fields);
const fields = (api: Api, id: string): Body => api.kernel.get(id)!.fields as Body;
const edit = (api: Api, register: string, id: string, next: Body): void => void said(api.kernel.update(register, id, next as never, { actor: 'p_1' }));

const egp = (amount: number): Money => ({ amount, currency: 'EGP' });
const eur = (amount: number): Money => ({ amount, currency: 'EUR' });

/** A record whose home currency is the Egyptian pound, with this file on it. */
async function inPounds(): Promise<Awaited<ReturnType<typeof money>>> {
  const made = await money();
  said(made.api.kernel.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }));
  said(await put(made.api, file()));
  return made;
}

/** Three invented holdings in two currencies, as a 1.x record held them: a commodity with a fraction, a certificate, a policy. */
const HELD: readonly Body[] = [
  { label: 'Silver bar', kind: 'commodity', qty: 2.5, unit_cost: eur(40_000), acquired_on: '2026-03-02' },
  { label: 'Term deposit', kind: 'certificate', qty: 1, unit_cost: eur(500_000), acquired_on: '2026-01-15', matures_on: '2029-01-15' },
  { label: 'Life cover', kind: 'policy', qty: 12, unit_cost: { amount: 4_500, currency: 'USD' }, acquired_on: '2025-11-01', matures_on: '2055-11-01' },
];

/* FIFTEEN MINUTES IS THE WIDEST A FIRST RUN IS SPREAD (`jitterMs` in `packages/kernel/src/pull.ts`), so a daily script
   is first due inside a quarter of an hour of the install. */
const SPREAD_MS = 15 * 60_000;

/* ── the file ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('THE FILE IS 2.0.0, Investments and gold, and every field and kind 1.4.2 held is still there as it was', () => {
  const doc = file();
  const old = v142();
  assert.deepEqual([doc.pack, doc.version, doc.title], ['holdings', '3.7.2', 'Investments and gold']);
  assert.equal(old.version, '1.4.2', 'the frozen 1.4.2 moved');
  assert.equal(v100().version, '1.0.0', 'the frozen 1.0.0 moved');
  assert.deepEqual(doc.requires, old.requires);
  const now = list(doc, 'holdings').fields;
  /* A FIELD 1.x WROTE IS A FIELD OF THE SAME TYPE, so no row reads differently and nothing is retyped. */
  for (const f of list(old, 'holdings').fields) {
    const same = now.find((g) => g.id === f.id);
    assert.ok(same, `${String(f.id)} went`);
    assert.equal(same.type, f.type, `${String(f.id)} changed type`);
  }
  /* EVERY KIND A 1.x ROW COULD HOLD IS STILL ONE, and gold, funds and shares join them. */
  const kinds = now.find((f) => f.id === 'kind')!.values as string[];
  assert.deepEqual(kinds.slice(0, 4), ['certificate', 'policy', 'commodity', 'other']);
  assert.deepEqual(kinds.slice(4), ['gold', 'fund', 'stock']);
  /* BUYS CAN SAY THE COUNT AND THE COST, so a holding no longer has to. Nothing new is required of an old row. */
  for (const id of ['qty', 'unit_cost']) assert.equal(now.find((f) => f.id === id)!.required, undefined, `${id} is still required`);
  const added = now.filter((f) => !list(old, 'holdings').fields.some((g) => g.id === f.id));
  assert.deepEqual(added.map((f) => f.id), ['karat', 'unit', 'code', 'valued_by', 'gain', 'gain_pct']);
  for (const f of added) assert.equal(f.required, undefined, `${String(f.id)} is required of rows that never had it`);
  /* AND EVERY DECLARATION 1.4.2 MADE IS STILL MADE, so an update retires nothing a record ran. */
  const ids = (d: Doc): string[] => d.declarations.map((x) => ['register', 'rule', 'script', 'metric', 'page'].map((k) => (typeof x[k] === 'string' ? `${k}.${x[k]}` : '')).join(''));
  for (const id of ids(old)) assert.ok(ids(doc).includes(id), `${id} went`);
});

test('KARATS ARE 24k, 22k, 21k AND 18k, on a holding, a buy and a rate alike', () => {
  const doc = file();
  const karats = (register: string): unknown => list(doc, register).fields.find((f) => f.id === 'karat')!.values;
  for (const register of ['holdings', 'holding_buys', 'gold_rates']) assert.deepEqual(karats(register), ['24k', '22k', '21k', '18k']);
  /* A BUY'S KARAT IS ITS HOLDING'S, read through the link and never typed twice. */
  assert.deepEqual(list(doc, 'holding_buys').fields.find((f) => f.id === 'karat')!.derive, { via: { ref: 'item', field: 'karat' } });
});

test('BEFORE THE PACK: a record with every first-party pack has no holdings, buys, gold rates or Investments page', async () => {
  const { api, close } = await money();
  for (const register of ['holdings', 'holding_buys', 'gold_rates']) assert.equal(api.kernel.register(register), undefined, `${register} is already a list`);
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['metric.holdings-value', 'metric.holdings-by-kind', 'page.holdings', 'page.holding', 'script.holdings_cost']) assert.ok(!ids.includes(id), `${id} is already on the record`);
  close();
});

test('THE SCRIPTS IN THE FILE ARE cost.js, twin.js AND feed.js, byte for byte, each reaching only what it says', () => {
  const doc = file();
  const cost = decl(doc, 'script', 'holdings_cost');
  assert.equal(cost.source, readFileSync(COST_FILE, 'utf8'), 'holdings.pack.json and cost.js disagree; copy cost.js into the source');
  assert.deepEqual([cost.egress, cost.keys, cost.reads, cost.writes, cost.runs], [[], [], ['holdings', 'holding_buys', 'gold_rates'], ['holdings', 'holding_buys', 'gold_rates'], { rule: true, every: '1d' }]);
  const twin = decl(doc, 'script', 'holdings_twin');
  assert.equal(twin.source, readFileSync(TWIN_FILE, 'utf8'), 'holdings.pack.json and twin.js disagree; copy twin.js into the source');
  assert.deepEqual([twin.egress, twin.keys, twin.reads, twin.writes, twin.runs], [[], [], ['holdings', 'accounts'], ['accounts'], { every: '1d' }]);
  /* ONLY THE FEED CALLS OUT (3.2.0), daily, with no key, writing gold rates and nothing else. The cost and the question
     fetch nothing. */
  assert.doesNotMatch(readFileSync(COST_FILE, 'utf8'), /ctx\.fetch/u);
  assert.doesNotMatch(readFileSync(TWIN_FILE, 'utf8'), /ctx\.fetch/u);
  const feed = decl(doc, 'script', 'holdings_gold_feed');
  assert.equal(feed.source, readFileSync(FEED_FILE, 'utf8'), 'holdings.pack.json and feed.js disagree; copy feed.js into the source');
  assert.deepEqual(
    [feed.egress, feed.keys, feed.reads, feed.writes, feed.runs, feed.limits],
    [['https://latest.currency-api.pages.dev', 'https://cdn.jsdelivr.net', 'https://api.gold-api.com'], [], ['gold_rates', 'holdings', 'fx'], ['gold_rates'], { every: '1d' }, { fetches: 2, writes: 8 }],
  );
  /* THREE RULES START THE COST SCRIPT, one a list, and none starts the question: a question a write opened would come mid-edit. */
  assert.deepEqual(doc.declarations.filter((d) => d.rule !== undefined && d.on !== undefined).map((d) => [d.rule, (d.on as { written: { register: string } }).written.register]), [
    ['holdings_cost', 'holdings'],
    ['holdings_buy', 'holding_buys'],
    ['holdings_rate', 'gold_rates'],
  ]);
  /* AND TWO THAT TELL OF A PRICE GROWN OLD (3.1.0), each once a row a day it was priced on, past the age the figures
     `holdings-stale` and `gold-rates-old` count from. */
  assert.deepEqual(
    doc.declarations.filter((d) => d.rule !== undefined && d.on === undefined).map((d) => [d.rule, d.register, d.when, d.once_per]),
    [
      ['holdings_price_old', 'holdings', 'price is set, priced_on before -30d', ['entry', 'priced_on']],
      ['gold_rate_old', 'gold_rates', 'live is true, on before -7d', ['entry', 'on']],
    ],
  );
});

const ADDS = [
  'metric.gold-grams', 'metric.gold-held', 'metric.gold-rate-on', 'metric.gold-rates-current', 'metric.gold-rates-old', 'metric.holding-buys',
  'metric.holdings-at-cost', 'metric.holdings-by-kind', 'metric.holdings-cost', 'metric.holdings-costed', 'metric.holdings-count', 'metric.holdings-gain',
  'metric.holdings-gain-pct', 'metric.holdings-gained', 'metric.holdings-priced-on', 'metric.holdings-stale', 'metric.holdings-uncosted', 'metric.holdings-unpriced', 'metric.holdings-unvalued', 'metric.holdings-value', 'metric.holdings-worth-costed',
  'page.holding', 'page.holdings', 'register.gold_rates', 'register.holding_buys', 'register.holdings',
  'rule.gold_rate_old', 'rule.holdings_buy', 'rule.holdings_cost', 'rule.holdings_price_old', 'rule.holdings_rate', 'script.holdings_cost', 'script.holdings_gold_feed',
  'script.holdings_twin',
];

test('INSTALLED FROM THE FILE: three lists, five rules, three scripts, twenty-one figures and two pages, and nothing refused', async () => {
  const { api, close } = await money();
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.adds.map((a) => a.id).sort(), ADDS);
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'holdings')?.version, '3.7.2');
  close();
});

test('THE SAME FILE PASSES AS AN ADD-ON SOMEBODY OPENS FROM DISK', async () => {
  const opened = said<{ pack: { manifest: { pack: string; version: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.deepEqual([opened.pack.manifest.pack, opened.pack.manifest.version], ['holdings', '3.7.2']);
});

test('NO FILE OF THIS ADD-ON NAMES A CURRENCY IN A FORMAT, so every amount reads in the money somebody chose', () => {
  const dir = new URL('./', import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!/\.(?:json|js)$/u.test(name)) continue;
    assert.doesNotMatch(readFileSync(new URL(name, dir), 'utf8'), /money\.[A-Z]{3}/u, `${name} names a currency in a format`);
  }
  for (const d of file().declarations) if (typeof d.metric === 'string' && d.format !== undefined) assert.ok(['money', 'int', 'decimal', 'pct', 'day'].includes(String(d.format)), `${d.metric} reads as ${String(d.format)}`);
});

/* ── what a holding cost, as 1.x worked it out ───────────────────────────────────────────────────────────────────── */

test('A HOLDING WITH NO BUYS IS COSTED AS BEFORE, how many times what one cost, and worth that until it has a price', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  const ids = HELD.map((row) => hold(api, row));
  await settle(api);
  /* HALF A BAR IS A HOLDING, SO THE PRODUCT IS NOT A WHOLE NUMBER OF UNITS: 2.5 times EUR 400.00 is EUR 1,000.00. */
  assert.deepEqual(ids.map((id) => [fields(api, id).cost, fields(api, id).value, fields(api, id).valued_by]), [
    [eur(100_000), eur(100_000), 'cost'],
    [eur(500_000), eur(500_000), 'cost'],
    [{ amount: 54_000, currency: 'USD' }, { amount: 54_000, currency: 'USD' }, 'cost'],
  ]);
  /* AT WHAT IT COST IS NO GAIN, not a gain of nought: nothing priced it. */
  for (const id of ids) assert.deepEqual([fields(api, id).gain, fields(api, id).gain_pct], [undefined, undefined]);
  edit(api, 'holdings', ids[0]!, { qty: 3 });
  await settle(api);
  assert.deepEqual(fields(api, ids[0]!).cost, eur(120_000));
  /* AND A WORKED-OUT ROW IS LEFT ALONE: the host coming round again writes nothing. */
  const writes = (id: string): number => (api.kernel as unknown as { history(id: string): unknown[] }).history(id).length;
  const before = ids.map(writes);
  await settle(api);
  assert.deepEqual(ids.map(writes), before, 'the script wrote a row again with nothing moved');
  close();
});

test('HOLDINGS VALUE IS ONE AMOUNT PER CURRENCY, never two currencies added as they are', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  for (const row of HELD) hold(api, row);
  await settle(api);
  const read = said<{ value: number | null; parts?: Money[] }>(api.kernel.metric(decl(file(), 'metric', 'holdings-value') as never));
  assert.equal(read.value, null, 'two currencies came back as one number');
  assert.deepEqual((read.parts ?? []).map((p) => [p.currency, p.amount]).sort(), [['EUR', 600_000], ['USD', 54_000]]);
  close();
});

test('A NEGATIVE COUNT IS REFUSED, A HALF UNIT IS KEPT, and a policy is found by being a policy', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  const half = hold(api, { label: 'Silver coin', kind: 'commodity', qty: 0.5, unit_cost: eur(3_000) });
  assert.equal(fields(api, half).qty, 0.5, 'a half unit was rounded away');
  const owed = api.kernel.create('holdings', { label: 'Silver coin', kind: 'commodity', qty: -3, unit_cost: eur(3_000) } as never, { actor: 'p_1' }) as Out;
  assert.equal(owed.ok, false, 'the list took a negative number of units');
  assert.match(owed.refusal?.fix ?? '', /at least 0/u);
  const negative = api.kernel.create('holding_buys', { item: half, bought_on: TODAY, qty: -1, price: eur(3_000) } as never, { actor: 'p_1' }) as Out;
  assert.equal(negative.ok, false, 'a buy took a negative count');
  const ids = HELD.map((row) => hold(api, row));
  assert.deepEqual(api.kernel.search('policy', { registers: ['holdings'], limit: 20 }).map((h) => h.id), [ids[2]]);
  close();
});

test('WHAT A PERSON HOLDS MOVES CASH NOW BY NOTHING, which is the whole reason this is not an account', async () => {
  const { api, close } = await inPounds();
  const cashNow = (firstPartyDocument('money-core') as { declarations: Body[] }).declarations.find((d) => d.metric === 'cash-now')!;
  const read = (): unknown => said<{ value: unknown; parts?: unknown }>(api.kernel.metric(cashNow as never));
  const before = read();
  const gold = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k', unit: 'gram' });
  buy(api, { item: gold, bought_on: '2026-02-01', qty: 10, price: egp(400_000) });
  rate(api, { karat: '24k', per_gram: egp(520_000) });
  for (const row of HELD) hold(api, row);
  await settle(api);
  assert.deepEqual(read(), before, 'what is held leaked into what can be spent');
  close();
});

/* ── buys ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('A BUY IS PAID ITS COUNT TIMES ITS PRICE AND ITS FEES, and its holding counts and costs every buy, from the first day', async () => {
  const { api, close } = await inPounds();
  const gold = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k', unit: 'gram' });
  const first = buy(api, { item: gold, bought_on: '2026-03-01', qty: 10, price: egp(400_000), fees: egp(20_000), kept_at: 'Home safe' });
  const second = buy(api, { item: gold, bought_on: '2026-01-10', qty: 5.5, price: egp(380_000) });
  await settle(api);
  /* 10 g AT 4,000 AND 200 IN FEES IS 40,200; 5.5 g AT 3,800 IS 20,900. */
  assert.deepEqual([fields(api, first).paid, fields(api, second).paid], [egp(4_020_000), egp(2_090_000)]);
  /* THE BUY READS ITS HOLDING'S KARAT through the link, so the table of buys can say it. */
  assert.equal(fields(api, first).karat, '21k');
  const h = fields(api, gold);
  assert.deepEqual([h.qty, h.cost, h.acquired_on], [15.5, egp(6_110_000), '2026-01-10']);
  /* WHAT ONE GRAM COST, SPREAD OVER EVERY BUY: 61,100 over 15.5 g is 3,941.94. */
  assert.deepEqual(h.unit_cost, egp(394_194));
  /* NO RATE YET: worth what it cost, and said so. */
  assert.deepEqual([h.value, h.valued_by, h.gain], [egp(6_110_000), 'cost', undefined]);

  /* A BUY CHANGED IS COUNTED AGAIN, and a buy deleted leaves the holding to the buys that remain. */
  edit(api, 'holding_buys', second, { qty: 6 });
  await settle(api);
  assert.deepEqual([fields(api, gold).qty, fields(api, gold).cost], [16, egp(6_300_000)]);
  said(api.kernel.update('holding_buys', second, { deleted_at: true } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual([fields(api, gold).qty, fields(api, gold).cost, fields(api, gold).acquired_on], [10, egp(4_020_000), '2026-03-01']);
  close();
});

test('A HOLDING WITH MORE THAN FIFTY BUYS COUNTS AND COSTS EVERY ONE', async () => {
  const { api, close } = await inPounds();
  const gold = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k', unit: 'gram' });
  for (let i = 0; i < 70; i++) buy(api, { item: gold, bought_on: '2026-03-01', qty: 1, price: egp(100_000) });
  for (let i = 0; i < 3; i++) await settle(api);
  const h = fields(api, gold);
  assert.deepEqual([h.qty, h.cost], [70, egp(7_000_000)]);
  close();
});

test('A HOLDING CANNOT BE DELETED WHILE A BUY POINTS AT IT, so no buy is left belonging to nothing', async () => {
  const { api, close } = await inPounds();
  const fund = hold(api, { label: 'World index fund', kind: 'fund', unit: 'share' });
  buy(api, { item: fund, bought_on: '2026-04-01', qty: 12, price: egp(25_000) });
  const out = api.kernel.update('holdings', fund, { deleted_at: true } as never, { actor: 'p_1' }) as Out;
  assert.equal(out.ok, false, 'a holding with a buy was deleted');
  close();
});

test('A BUY MOVED TO ANOTHER HOLDING LEAVES THE FIRST AND JOINS THE SECOND', async () => {
  const { api, close } = await inPounds();
  const a = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k' });
  const b = hold(api, { label: 'Gold 18k', kind: 'gold', karat: '18k' });
  buy(api, { item: a, bought_on: '2026-03-01', qty: 10, price: egp(400_000) });
  const moving = buy(api, { item: a, bought_on: '2026-04-01', qty: 4, price: egp(350_000) });
  await settle(api);
  assert.equal(fields(api, a).qty, 14);
  edit(api, 'holding_buys', moving, { item: b });
  await settle(api);
  assert.deepEqual([fields(api, a).qty, fields(api, b).qty, fields(api, b).cost], [10, 4, egp(1_400_000)]);
  close();
});

test('BUYS IN TWO CURRENCIES ARE NEVER ADDED: the holding keeps the count and cost typed on it', async () => {
  const { api, close } = await inPounds();
  const shares = hold(api, { label: 'Harbour Co shares', kind: 'stock', unit: 'share', qty: 3, unit_cost: egp(10_000) });
  buy(api, { item: shares, bought_on: '2026-02-01', qty: 5, price: egp(10_000) });
  buy(api, { item: shares, bought_on: '2026-03-01', qty: 5, price: eur(300) });
  await settle(api);
  assert.deepEqual([fields(api, shares).qty, fields(api, shares).cost], [3, egp(30_000)]);
  close();
});

/* ── the gold rate ────────────────────────────────────────────────────────────────────────────────────────────────── */

test('ONE 24k RATE PRICES EVERY KARAT BY ITS PURITY, and a rate for the karat itself is taken over it', async () => {
  const { api, close } = await inPounds();
  const g21 = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k', unit: 'gram' });
  const g18 = hold(api, { label: 'Gold 18k', kind: 'gold', karat: '18k', unit: 'gram' });
  const bar = hold(api, { label: 'Gold bar 24k', kind: 'gold', karat: '24k', unit: 'gram' });
  buy(api, { item: g21, bought_on: '2026-01-10', qty: 20, price: egp(400_000) });
  buy(api, { item: g18, bought_on: '2026-01-10', qty: 8, price: egp(350_000) });
  buy(api, { item: bar, bought_on: '2026-02-10', qty: 10, price: egp(470_000) });
  const pure = rate(api, { karat: '24k', per_gram: egp(520_000), from: 'hand' });
  await settle(api);
  /* 24k AT 5,200 A GRAM: 21k IS 4,550 AND 18k IS 3,900. */
  assert.deepEqual([fields(api, g21).value, fields(api, g18).value, fields(api, bar).value], [egp(9_100_000), egp(3_120_000), egp(5_200_000)]);
  for (const id of [g21, g18, bar]) assert.equal(fields(api, id).valued_by, 'gold_rate');
  /* THE GAIN IS THE WORTH LESS THE COST, AND ITS PERCENT OF THE COST, to a tenth: 9,100 against 8,000 is 13.8%. */
  assert.deepEqual([fields(api, g21).gain, fields(api, g21).gain_pct], [egp(1_100_000), 13.8]);
  assert.deepEqual([fields(api, g18).gain, fields(api, g18).gain_pct], [egp(320_000), 11.4]);
  /* A RATE WITH NO DAY IS DATED TODAY, and is the one in use. */
  assert.deepEqual([fields(api, pure).on, fields(api, pure).live], [TODAY, true]);

  /* THE SHOP'S OWN 21k RATE IS NOT ALWAYS 21/24 OF 24k, so a rate said for 21k is the one 21k is worth. */
  rate(api, { karat: '21k', per_gram: egp(460_000) });
  await settle(api);
  assert.deepEqual([fields(api, g21).value, fields(api, g18).value], [egp(9_200_000), egp(3_120_000)]);
  close();
});

test('A NEWER RATE TAKES OVER FROM THE OLD ONE, which stays in the history and is no longer in use', async () => {
  const { api, close } = await inPounds();
  const gold = hold(api, { label: 'Gold 24k', kind: 'gold', karat: '24k' });
  buy(api, { item: gold, bought_on: '2026-01-10', qty: 10, price: egp(480_000) });
  const old = rate(api, { karat: '24k', per_gram: egp(500_000), on: '2026-09-01' });
  await settle(api);
  assert.deepEqual(fields(api, gold).value, egp(5_000_000));
  const fresh = rate(api, { karat: '24k', per_gram: egp(530_000), on: '2026-09-24' });
  await settle(api);
  assert.deepEqual(fields(api, gold).value, egp(5_300_000));
  assert.deepEqual([fields(api, old).live, fields(api, fresh).live], [false, true]);
  /* A RATE TYPED LATE FOR AN EARLIER DAY IS HISTORY, NOT TODAY'S: the newest day is the one in use. */
  rate(api, { karat: '24k', per_gram: egp(490_000), on: '2026-08-15' });
  await settle(api);
  assert.deepEqual(fields(api, gold).value, egp(5_300_000));
  /* AND THE RATE IN USE DELETED HANDS OVER TO THE ONE BEFORE IT. */
  said(api.kernel.update('gold_rates', fresh, { deleted_at: true } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual([fields(api, gold).value, fields(api, old).live], [egp(5_000_000), true]);
  close();
});

test('A PRICE OF ITS OWN BEATS THE GOLD RATE, and taken away hands the holding back to the rate', async () => {
  const { api, close } = await inPounds();
  const gold = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k' });
  buy(api, { item: gold, bought_on: '2026-01-10', qty: 10, price: egp(400_000) });
  rate(api, { karat: '24k', per_gram: egp(520_000) });
  await settle(api);
  edit(api, 'holdings', gold, { price: egp(470_000) });
  await settle(api);
  assert.deepEqual([fields(api, gold).value, fields(api, gold).valued_by, fields(api, gold).priced_on], [egp(4_700_000), 'price', TODAY]);
  edit(api, 'holdings', gold, { price: null });
  await settle(api);
  assert.deepEqual([fields(api, gold).value, fields(api, gold).valued_by, fields(api, gold).priced_on], [egp(4_550_000), 'gold_rate', undefined]);
  close();
});

test('GOLD WITH NO KARAT, OR A RATE IN ANOTHER CURRENCY, IS NEVER GUESSED: no karat stands at cost, and two currencies say no gain', async () => {
  const { api, close } = await inPounds();
  const bare = hold(api, { label: 'Old chain', kind: 'gold', unit: 'gram' });
  const coin = hold(api, { label: 'Gold coin', kind: 'gold', karat: '22k', unit: 'gram' });
  buy(api, { item: bare, bought_on: '2026-01-10', qty: 6, price: egp(400_000) });
  buy(api, { item: coin, bought_on: '2026-01-10', qty: 8, price: egp(450_000) });
  rate(api, { karat: '24k', per_gram: { amount: 11_000, currency: 'USD' } });
  await settle(api);
  assert.deepEqual([fields(api, bare).value, fields(api, bare).valued_by], [egp(2_400_000), 'cost']);
  /* 8 g OF 22k AT 22/24 OF USD 110.00 IS USD 806.67, AND NO GAIN, since the cost is in pounds. */
  assert.deepEqual([fields(api, coin).value, fields(api, coin).valued_by, fields(api, coin).gain], [{ amount: 80_667, currency: 'USD' }, 'gold_rate', undefined]);
  close();
});

/* ── the page ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

type Reading = { value: number | null; unit?: string | null; rows: number; parts?: Money[]; groups?: { key: string; value: number; label?: string }[] };
type Block = { kind: string; heading?: string; body?: string; drawn?: boolean; why?: string; refusals: unknown[]; rows?: { fields: Body }[]; values?: Body; readings?: { metric: string; note?: string; reading: Reading }[] };
const drawn = (b: Block): boolean => b.drawn !== false && b.why === undefined;
const pageOf = async (api: Api, slug = 'holdings'): Promise<{ title: string; blocks: Block[] }> => said(await api.page({ slug }, owner));

/** A record with a little of everything: gold in two karats with three buys, a fund priced by hand, a certificate at cost. */
async function portfolio(): Promise<Awaited<ReturnType<typeof inPounds>> & { ids: Record<string, string> }> {
  const made = await inPounds();
  const { api } = made;
  const ids = {
    g21: hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k', unit: 'gram' }),
    bar: hold(api, { label: 'Gold bar 24k', kind: 'gold', karat: '24k', unit: 'gram' }),
    fund: hold(api, { label: 'World index fund', kind: 'fund', unit: 'share', code: 'WIF', price: egp(32_000), priced_on: '2026-09-20' }),
    cert: hold(api, { label: 'Three-year certificate', kind: 'certificate', qty: 1, unit_cost: egp(10_000_000), acquired_on: '2026-01-15', matures_on: '2029-01-15' }),
  };
  buy(api, { item: ids.g21, bought_on: '2025-10-02', qty: 20, price: egp(380_000), fees: egp(40_000), kept_at: 'Bank box' });
  buy(api, { item: ids.g21, bought_on: '2026-04-11', qty: 10, price: egp(420_000) });
  buy(api, { item: ids.bar, bought_on: '2026-06-30', qty: 10, price: egp(480_000), kept_at: 'Home safe' });
  buy(api, { item: ids.fund, bought_on: '2026-02-01', qty: 100, price: egp(25_000) });
  rate(api, { karat: '24k', per_gram: egp(520_000), from: 'hand' });
  await settle(made.api);
  return { ...made, ids };
}

test('THE PAGE READS LIKE THE MOCK: a line, what you hold with its gain, the gold rate, how it splits, the buys and every holding', async () => {
  const { api, ids, close } = await portfolio();
  const page = await pageOf(api);
  assert.equal(page.title, 'Investments and gold');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const on = page.blocks.filter(drawn);
  /* WHAT YOU HOLD LEADS, SINCE 3.7.0 (685d1a053), where a line over it did. */
  assert.deepEqual([on[0]!.kind, on[0]!.heading, (on[0] as { lead?: boolean }).lead], ['stat', 'What you hold', true]);

  /* WHAT YOU HOLD, ONE TILE: worth now, paid in, the gain and its percent. The certificate stands at what it cost, so
     the note says one of four does. */
  const tiles = on.filter((b) => b.heading === 'What you hold');
  assert.equal(tiles.length, 1, 'the tile was drawn twice');
  const cell = (m: string): Reading => tiles[0]!.readings!.find((r) => r.metric === m)!.reading;
  /* 30 g OF 21k AT 4,550 (136,500), 10 g OF 24k AT 5,200 (52,000), 100 SHARES AT 320 (32,000), THE CERTIFICATE AT 100,000. */
  /* WORTH NOW LEAVES OUT WHAT HAS NO COST, SINCE 3.6.0 (1767124b5), and all four here have one, so it is the whole. */
  assert.deepEqual([cell('holdings-worth-costed').value, cell('holdings-worth-costed').unit], [32_050_000, 'EGP']);
  /* PAID: 76,400 AND 42,000 FOR THE 21k, 48,000 FOR THE BAR, 25,000 FOR THE FUND, 100,000 FOR THE CERTIFICATE. */
  assert.equal(cell('holdings-cost').value, 29_140_000);
  /* THE GAIN IS OVER WHAT SOMETHING PRICED, the certificate left out: 136,500 - 118,400, 52,000 - 48,000, 32,000 - 25,000. */
  assert.equal(cell('holdings-gain').value, 1_810_000 + 400_000 + 700_000);
  assert.equal(Math.round(cell('holdings-gain-pct').value! * 1000) / 1000, Math.round((2_910_000 / 19_140_000) * 1000) / 1000);
  const note = tiles[0]!.readings!.find((r) => r.metric === 'holdings-worth-costed')!.note!.replace(/\{\{([a-z-]+)\}\}/gu, (_, id: string) => String(tiles[0]!.values?.[id]));
  assert.equal(note, '1 of 4 at what they cost');

  /* THE GOLD RATE IN USE, a row a karat said. */
  const gold = on.find((b) => b.heading === 'Gold rate')!;
  assert.deepEqual((gold.rows ?? []).map((r) => [r.fields.karat, r.fields.per_gram]), [['24k', egp(520_000)]]);

  /* HOW IT SPLITS BY KIND, one part a kind, by its own name. */
  const split = on.find((b) => b.kind === 'split')!;
  const groups = split.readings![0]!.reading.groups!;
  assert.deepEqual(groups.map((g) => [g.key, g.value, g.label]).sort(), [
    ['certificate', 10_000_000, 'Certificate'],
    ['fund', 3_200_000, 'Fund'],
    ['gold', 18_850_000, 'Gold'],
  ]);

  /* THE BUYS, NEWEST FIRST, each with its holding's karat. */
  const buys = on.find((b) => b.heading === 'Buys')!;
  assert.deepEqual((buys.rows ?? []).map((r) => [r.fields.bought_on, r.fields.karat ?? null]), [
    ['2026-06-30', '24k'],
    ['2026-04-11', '21k'],
    ['2026-02-01', null],
    ['2025-10-02', '21k'],
  ]);
  /* AND EVERY HOLDING. */
  const cards = on.find((b) => b.heading === 'Everything you hold')!;
  assert.deepEqual((cards.rows ?? []).map((r) => r.fields.label).sort(), ['Gold 21k', 'Gold bar 24k', 'Three-year certificate', 'World index fund']);
  /* A HOLDING'S OWN PAGE: the card, then its buys. */
  const own = await pageOf(api, `holdings#${api.kernel.get(ids.g21!)!.seq}`);
  for (const b of own.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused on a holding's page`);
  assert.equal(own.title, 'Gold 21k');
  assert.equal(own.blocks.find((b) => b.heading === 'Buys')!.rows!.length, 2);
  close();
});

test('A FRESH PAGE SAYS WHAT GOES HERE AND OFFERS THE FIRST HOLDING, and draws no tile over nothing', async () => {
  const { api, close } = await inPounds();
  const on = (await pageOf(api)).blocks.filter(drawn);
  assert.deepEqual(on.map((b) => [b.kind, b.heading ?? null]).slice(0, 2), [['note', null], ['capture', 'Add a holding']]);
  /* AND SAYS WHAT A HOLDING IS (holdings 3.2.1): an empty page names the kinds you can add. */
  assert.equal(String(on[0]!.body), 'Nothing held yet. Add a fund, a certificate or gold you own.');
  assert.ok(!on.some((b) => b.heading === 'What you hold' || b.kind === 'split'), 'a tile was drawn over nothing held');
  close();
});

test('NO GOLD RATE YET OFFERS THE BOX TO SET ONE, and a rate over a week old says so in words', async () => {
  const { api, close } = await inPounds();
  const gold = hold(api, { label: 'Gold 21k', kind: 'gold', karat: '21k' });
  buy(api, { item: gold, bought_on: '2026-01-10', qty: 10, price: egp(400_000) });
  await settle(api);
  let on = (await pageOf(api)).blocks.filter(drawn);
  assert.ok(on.some((b) => b.kind === 'capture' && b.heading === "Set today's gold rate"), 'no box to set the first rate');
  const old = rate(api, { karat: '24k', per_gram: egp(520_000), on: '2026-09-18' });
  await settle(api);
  on = (await pageOf(api)).blocks.filter(drawn);
  assert.ok(!on.some((b) => b.kind === 'capture' && b.heading === "Set today's gold rate"), 'the box stayed with a rate in use');
  assert.ok(!on.some((b) => (b as { tone?: string }).tone === 'warn' && /gold rate/u.test(String(b.body))), 'a rate a week old warned');
  edit(api, 'gold_rates', old, { on: '2026-09-17' });
  await settle(api);
  on = (await pageOf(api)).blocks.filter(drawn);
  const warn = on.find((b) => (b as { tone?: string }).tone === 'warn' && /gold rate/u.test(String(b.body)));
  assert.ok(warn, 'a rate over a week old said nothing');
  /* LATE IS NEVER COLOUR ALONE: the words say it. */
  assert.match(String(warn.body), /\{\{bad:over a week ago\}\}/u);
  close();
});

test('EVERY TILE WEARS A GLYPH, the page reads ten things or more, and no word on it says who owes whom', () => {
  for (const page of file().declarations.filter((d) => typeof d.page === 'string')) {
    type B = { kind: string; heading?: string; icon?: string; body?: string; empty?: string; span?: number; cells?: { label?: string; note?: string }[]; columns?: { label?: string }[] };
    const blocks = page.blocks as B[];
    for (const b of blocks) if (b.heading !== undefined) assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${String(page.page)}: ${b.heading} wears no glyph`);
    const read = blocks.flatMap((b) => [b.heading, b.body, b.empty, ...(b.cells ?? []).flatMap((c) => [c.label, c.note]), ...(b.columns ?? []).map((c) => c.label)]).filter((t): t is string => typeof t === 'string');
    assert.ok(read.length >= 10, `${String(page.page)} reads ${read.length} things`);
    for (const t of read) assert.doesNotMatch(t, /\bowe[ds]?\b|\bowing\b|—/iu, `${String(page.page)} says "${t}"`);
    if (page.for === undefined) assert.deepEqual([blocks[0]!.kind, (blocks[0] as { lead?: boolean }).lead], ['note', true], `${String(page.page)} does not open with its line`);
    assert.ok(blocks.length <= 24, `${String(page.page)} declares ${blocks.length} blocks`);
  }
  for (const d of file().declarations) if (typeof d.metric === 'string') assert.doesNotMatch(String(d.name), /\bowe[ds]?\b/iu);
});

/* ── a record on 1.x ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** A record where `doc` went in first and the rows were written under it, its scripts run, then this file on top. */
async function upgraded(doc: Doc, rows: readonly Body[] = HELD): Promise<Awaited<ReturnType<typeof money>> & { ids: string[]; before: Body[] }> {
  const made = await money();
  said(await put(made.api, doc));
  const ids = rows.map((row) => hold(made.api, row));
  await settle(made.api);
  const before = ids.map((id) => ({ ...fields(made.api, id) }));
  const diff = await planOf(made.api, file());
  assert.deepEqual(diff.conflicts, [], 'the update met a conflict');
  said(await put(made.api, file()));
  assert.equal(made.api.kernel.packs().find((p) => p.id === 'holdings')?.version, '3.7.2');
  return { ...made, ids, before };
}

const PRICED: readonly Body[] = [
  ...HELD,
  { label: 'Silver, ten grams', kind: 'commodity', qty: 10, unit_cost: eur(30_000), price: eur(41_000), priced_on: '2026-09-01' },
];

test('A RECORD ON 1.4.2 UPDATES WITH EVERY ROW AS IT WAS, and the next run adds how each was valued and the gain, moving nothing else', async () => {
  const { api, clock, ids, before, close } = await upgraded(v142(), PRICED);
  /* THE UPDATE ITSELF WRITES NO ROW. */
  assert.deepEqual(ids.map((id) => fields(api, id)), before, 'the update moved a row');
  assert.deepEqual(before.map((f) => [f.cost, f.value]), [
    [eur(100_000), eur(100_000)],
    [eur(500_000), eur(500_000)],
    [{ amount: 54_000, currency: 'USD' }, { amount: 54_000, currency: 'USD' }],
    [eur(300_000), eur(410_000)],
  ]);
  clock.advance(SPREAD_MS + 1);
  await settle(api);
  for (const [i, id] of ids.entries()) {
    const now = fields(api, id);
    for (const [k, v] of Object.entries(before[i]!)) assert.deepEqual(now[k], v, `${String(now.label)}'s ${k} moved`);
  }
  assert.deepEqual(ids.map((id) => [fields(api, id).valued_by, fields(api, id).gain ?? null, fields(api, id).gain_pct ?? null]), [
    ['cost', null, null],
    ['cost', null, null],
    ['cost', null, null],
    ['price', eur(110_000), 36.7],
  ]);
  /* AND THE BUYS AND RATES A 1.x HOLDING NEVER HAD CAN BE ADDED TO IT NOW. */
  buy(api, { item: ids[0], bought_on: '2026-03-02', qty: 2.5, price: eur(40_000) });
  await settle(api);
  assert.deepEqual([fields(api, ids[0]!).qty, fields(api, ids[0]!).cost], [2.5, eur(100_000)]);
  close();
});

test('A RECORD ON 1.0.0 UPDATES STRAIGHT TO 2.0.0, and every holding it held is costed with nobody writing a row again', async () => {
  const { api, clock, ids, close } = await upgraded(v100());
  assert.deepEqual(ids.map((id) => fields(api, id).cost), [undefined, undefined, undefined]);
  clock.advance(SPREAD_MS + 1);
  await settle(api);
  assert.deepEqual(ids.map((id) => [fields(api, id).cost, fields(api, id).valued_by]), [
    [eur(100_000), 'cost'],
    [eur(500_000), 'cost'],
    [{ amount: 54_000, currency: 'USD' }, 'cost'],
  ]);
  close();
});

test('THE CATCH-UP READS PAST THE FIRST PAGE OF FIFTY, so sixty unvalued holdings are all worked out in one run', async () => {
  const lots = Array.from({ length: 60 }, (_, i): Body => ({ label: `Lot ${i + 1}`, kind: 'commodity', qty: 2, unit_cost: eur(1_000 + i) }));
  const { api, clock, ids, close } = await upgraded(v100(), lots);
  const done = (): number => ids.filter((id) => fields(api, id).valued_by !== undefined).length;
  clock.advance(SPREAD_MS + 1);
  await settle(api);
  assert.equal(done(), 60);
  for (const [i, id] of ids.entries()) assert.deepEqual(fields(api, id).cost, eur(2 * (1_000 + i)));
  close();
});

/* ── a price said, and its day (1.4.0) ────────────────────────────────────────────────────────────────────────────── */

const SIXTY_AGO = '2026-07-27';

test('A PRICE WRITTEN WITH NO DAY IS STAMPED WITH TODAY, a day somebody typed is kept, and a changed price is dated again', async () => {
  const { api, close } = await inPounds();
  const bare = hold(api, { label: 'Silver, ten grams', kind: 'commodity', qty: 10, unit_cost: egp(300_000), price: egp(410_000) });
  const typed = hold(api, { label: 'Silver, five grams', kind: 'commodity', qty: 5, unit_cost: egp(300_000), price: egp(410_000), priced_on: '2026-09-01' });
  const old = hold(api, { label: 'Silver, two grams', kind: 'commodity', qty: 2, unit_cost: egp(300_000), price: egp(410_000), priced_on: SIXTY_AGO });
  await settle(api);
  assert.deepEqual([fields(api, bare).priced_on, fields(api, typed).priced_on, fields(api, old).priced_on], [TODAY, '2026-09-01', SIXTY_AGO]);
  edit(api, 'holdings', old, { price: egp(455_000) });
  edit(api, 'holdings', typed, { qty: 4 });
  await settle(api);
  assert.deepEqual([fields(api, old).priced_on, fields(api, typed).priced_on], [TODAY, '2026-09-01'], 'a new price kept an old day, or a new count dated a price');
  close();
});

test('THE PAGE SAYS THE OLDEST PRICE, AND OVER THIRTY DAYS OLD IT WARNS IN WORDS, never both', async () => {
  const { api, close } = await inPounds();
  const id = hold(api, { label: 'Lot 1', kind: 'commodity', qty: 1, unit_cost: egp(100_000), price: egp(150_000), priced_on: '2026-08-26' });
  await settle(api);
  const blocks = async (): Promise<Block[]> => (await pageOf(api)).blocks;
  /* PRICES ARE FROM IS A LINE AND NOT A TILE, SINCE 3.7.0 (685d1a053). */
  const line = (bs: Block[]): Block | undefined => bs.find((b) => b.kind === 'note' && /^Prices are from/u.test(String(b.body)));
  const warn = (bs: Block[]): Block | undefined => bs.find((b) => (b as { tone?: string }).tone === 'warn' && /^Priced on/u.test(String(b.body)));
  let bs = await blocks();
  assert.deepEqual([drawn(line(bs)!), drawn(warn(bs)!)], [true, false]);
  assert.equal(line(bs)!.values?.['holdings-priced-on'], '2026-08-26');
  edit(api, 'holdings', id, { priced_on: '2026-08-25' });
  await settle(api);
  bs = await blocks();
  assert.deepEqual([drawn(line(bs)!), drawn(warn(bs)!)], [false, true]);
  assert.match(String(warn(bs)!.body), /\{\{bad:over 30 days ago\}\}/u);
  close();
});

test('A PRICE OVER THIRTY DAYS OLD, AND A GOLD RATE OVER SEVEN, ARE SAID ONCE, and a fresh one says nothing', async () => {
  const { api, sql, close } = await inPounds();
  const told = (): string[] => sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor IN ('rule:holdings_price_old', 'rule:gold_rate_old') ORDER BY rowid").map((n) => n.note);
  const old = hold(api, { label: 'Silver, two grams', kind: 'commodity', qty: 2, unit_cost: egp(300_000), price: egp(410_000), priced_on: SIXTY_AGO });
  hold(api, { label: 'Silver, five grams', kind: 'commodity', qty: 5, unit_cost: egp(300_000), price: egp(410_000), priced_on: '2026-09-20' });
  rate(api, { karat: '21k', per_gram: egp(450_000), on: '2026-09-10', live: true });
  rate(api, { karat: '24k', per_gram: egp(520_000), on: '2026-09-24', live: true });
  await settle(api);
  assert.equal(told().length, 2, told().join(' | '));
  assert.match(told().find((t) => t.startsWith('Silver'))!, /^Silver, two grams was last priced .+, so what it is worth may be out of date\.$/u);
  assert.match(told().find((t) => t.startsWith('The'))!, /^The 21k gold rate was set .+, so what your gold is worth may be out of date\.$/u);
  /* WRITTEN AGAIN WITH THE SAME OLD DAY, NOTHING MORE IS SAID. */
  edit(api, 'holdings', old, { note: 'kept in the safe' });
  await settle(api);
  assert.equal(told().length, 2, 'an old price was said twice');
  close();
});

/**
 * The cost script by itself, handed what a rule hands it: one holding, no buys and no rates, and what it asks to be
 * written. The tests above hold the same end to end.
 */
async function handed(changed: string | undefined, extra: Body): Promise<Body | null> {
  const run = ((await import(COST_FILE.href)) as { default: (ctx: unknown) => Promise<void> }).default;
  let wrote: Body | null = null;
  await run({
    input: { id: 'x', register: 'holdings', ...(changed === undefined ? {} : { changed }) },
    today: () => TODAY,
    record: {
      get: async () => ({ id: 'x', seq: 1, version: 1, fields: { kind: 'commodity', qty: 10, unit_cost: egp(300_000), cost: egp(3_000_000), ...extra } }),
      list: async () => [],
    },
    update: (_at: string, next: Body) => void (wrote = next),
  });
  return wrote;
}

test('THE SCRIPT, TOLD THE PRICE MOVED, DATES IT TODAY, and told the day moved with it, or told nothing, keeps the day', async () => {
  const worked = { valued_by: 'price', gain: egp(1_550_000), gain_pct: 51.7 };
  const old = { price: egp(455_000), value: egp(4_550_000), priced_on: SIXTY_AGO, ...worked };
  assert.deepEqual(await handed('price', old), { priced_on: TODAY });
  assert.equal(await handed('price,priced_on', old), null, 'a day written with the price was written over');
  assert.equal(await handed('qty', old), null, 'a count that moved dated the price');
  assert.equal(await handed(undefined, old), null);
  assert.equal(await handed('—', old), null);
  /* TAKEN AWAY: the worth goes back to the cost, the gain goes, and the day goes with the price. */
  assert.deepEqual(await handed('price', { value: egp(4_550_000), priced_on: SIXTY_AGO, ...worked }), {
    value: egp(3_000_000),
    valued_by: 'cost',
    gain: null,
    gain_pct: null,
    priced_on: null,
  });
});

/* ── an account and a holding that share a name ───────────────────────────────────────────────────────────────────── */

type TwinAsk = { cause: string; question: string; about: string; options: { id: string; label: string; because: string; patches?: Body[] }[] };
async function twin(accounts: readonly Body[], holdings: readonly Body[], today = TODAY): Promise<TwinAsk | null> {
  const run = ((await import(TWIN_FILE.href)) as { default: (ctx: unknown) => Promise<{ ask: TwinAsk } | null> }).default;
  const rows = (rs: readonly Body[]) => rs.map((f, i) => ({ seq: i + 1, version: 3, fields: f }));
  const out = await run({
    input: null,
    today: () => today,
    log: () => undefined,
    record: { list: async (register: string) => (register === 'accounts' ? rows(accounts) : register === 'holdings' ? rows(holdings) : []) },
  });
  return out === null || out === undefined ? null : out.ask;
}
const QUESTION = 'Silver Bar is an account and a holding. It may be counted twice. Stop counting the account as cash?';
const ACCOUNT: Body = { name: 'Silver Bar', kind: 'cash', balance: egp(3_000_000), as_of: TODAY, liquid: true };
const HOLDING: Body = { label: 'silver  bar', kind: 'commodity', qty: 10, unit_cost: egp(300_000) };

test('AN ACCOUNT AND A HOLDING WITH ONE NAME GIVE ONE ASK, whatever the case and the spaces', async () => {
  const ask = await twin([ACCOUNT], [HOLDING]);
  assert.equal(ask?.question, QUESTION);
  assert.deepEqual(ask?.options.map((o) => o.label), ['Stop counting it', 'Keep counting it']);
  assert.deepEqual(ask?.options.map((o) => o.patches ?? []), [[{ id: 'accounts#1', version: 3, fields: { liquid: false } }], []]);
  assert.equal(ask?.cause, 'holdings.twin:1:1');
  const read = [ask!.question, ...ask!.options.flatMap((o) => [o.label, o.because])].join(' ');
  assert.doesNotMatch(read, /—|#\d|\baccounts\b|\bliquid\b/u);
});

test('DIFFERENT NAMES, AN ACCOUNT OUT OF CASH, A CLOSED ONE OR A BLANK NAME ASK NOTHING', async () => {
  assert.equal(await twin([ACCOUNT], [{ ...HOLDING, label: 'Silver coin' }]), null);
  assert.equal(await twin([{ ...ACCOUNT, name: 'Silver Bars' }], [HOLDING]), null);
  assert.equal(await twin([{ ...ACCOUNT, liquid: false }], [HOLDING]), null);
  assert.equal(await twin([{ ...ACCOUNT, state: 'closed' }], [HOLDING]), null);
  assert.equal(await twin([{ ...ACCOUNT, name: '  ' }], [{ ...HOLDING, label: ' ' }]), null);
  assert.equal(await twin([], []), null);
});

test('TWO PAIRS ARE EACH ASKED ABOUT, a night apart, since one run asks one question', async () => {
  const accounts = [ACCOUNT, { ...ACCOUNT, name: 'Term deposit' }];
  const holdings = [HOLDING, { ...HOLDING, label: 'TERM DEPOSIT' }];
  const causes = new Set<string>();
  for (const day of ['2026-09-25', '2026-09-26']) causes.add((await twin(accounts, holdings, day))!.cause);
  assert.deepEqual([...causes].sort(), ['holdings.twin:1:1', 'holdings.twin:2:2']);
});

type Question = { id: string; status: string; by: string; question: string };

/** A record with Money and this add-on, and every question a script of it asked, oldest first. */
async function asking(): Promise<{ api: Api; night: () => Promise<void>; asked: () => Question[]; close: () => void }> {
  const { api, clock, sql, close } = await money();
  said(await put(api, file()));
  const asked = (): Question[] =>
    sql.all<{ id: string; status: string; opened_by: string }>("SELECT id, status, opened_by FROM suggestion WHERE opened_by LIKE 'script:holdings%' ORDER BY opened_at, id").map((s) => ({
      id: s.id,
      status: s.status,
      by: s.opened_by,
      question: sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${s.id}`)?.to_v ?? '',
    }));
  const night = async (): Promise<void> => {
    clock.advance(25 * 3_600_000);
    await settle(api, 4, clock.now);
  };
  return { api, night, asked, close };
}

test('ON A RECORD: the pair is asked about ONCE, by the script, and "Keep counting it" is the last of it', async () => {
  const { api, night, asked, close } = await asking();
  const account = write(api, 'accounts', ACCOUNT);
  hold(api, HOLDING);
  await night();
  const first = asked();
  assert.deepEqual(first.map((q) => [q.status, q.question]), [['open', QUESTION]]);
  assert.match(first[0]!.by, /holdings_twin/u);
  await night();
  assert.equal(asked().length, 1);
  said(api.kernel.decide(first[0]!.id, { decide: { option: 'keep', reason: 'Looked at both.' } } as never, 'p_1'));
  await settle(api);
  assert.equal(fields(api, account).liquid, true, 'keeping it changed the account');
  for (let i = 0; i < 2; i += 1) await night();
  assert.deepEqual(asked().map((q) => q.status === 'open'), [false]);
  close();
});

test('ON A RECORD: "Stop counting it" takes the account out of cash and keeps its balance', async () => {
  const { api, night, asked, close } = await asking();
  const account = write(api, 'accounts', ACCOUNT);
  hold(api, HOLDING);
  await night();
  said(api.kernel.decide(asked()[0]!.id, { decide: { option: 'stop', reason: 'Looked at both.' } } as never, 'p_1'));
  await settle(api);
  assert.deepEqual([fields(api, account).liquid, fields(api, account).balance], [false, egp(3_000_000)]);
  close();
});

/* ── the gold rate feed (3.2.0) ──────────────────────────────────────────────────────────────────────────────────────── */

type FeedRow = { id: string; seq: number; version: number; fields: Body };
type FeedLists = { gold_rates?: FeedRow[]; holdings?: FeedRow[]; fx?: FeedRow[] };

/** The feed as the file declares it, run in QuickJS against lists held in memory and a web that answers `answers`. */
async function feed(set: Record<string, Json>, lists: FeedLists, answers: Record<string, { status?: number; body: unknown }> = {}) {
  const script = decl(file(), 'script', 'holdings_gold_feed') as Body & ScriptDecl & { script: string };
  const asked: string[] = [];
  const matches = (row: FeedRow, where: Json): boolean => {
    if (where === null) return true;
    const w = where as Record<string, Json>;
    if (Array.isArray(w.all)) return (w.all as Json[]).every((x) => matches(row, x));
    const v = row.fields[w.field as string];
    if ('is' in w) return v === w.is;
    if ('present' in w) return (v !== undefined && v !== null) === w.present;
    if ('gte' in w) return typeof v === 'string' && v >= (w.gte as string);
    return true;
  };
  const host: CtxHost = {
    fetch: async (request) => {
      asked.push(request.url);
      const a = answers[new URL(request.url).host];
      return a === undefined ? { status: 503, headers: {}, body: '' } : { status: a.status ?? 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(a.body) };
    },
    list: async (register, where) => ((lists[register as keyof FeedLists] ?? []).filter((r) => matches(r, where)) as unknown as Json[]),
    get: async () => null,
    now: () => new Date(NOW).toISOString(),
    tz: 'UTC',
    input: null,
    /* THE DEFAULTS THE FILE DECLARES, under what the test sets, as the record hands a run its pack's settings. */
    config: { ...Object.fromEntries(Object.entries((file().config ?? {}) as Record<string, { default: Json }>).map(([k, d]) => [k, d.default])), ...set },
  };
  const answer = await runInQuickJs(
    { id: script.script, version: 1, egress: script.egress, keys: script.keys, reads: script.reads, writes: script.writes, ...(script.limits ? { limits: script.limits } : {}), source: script.source } as ScriptDecl,
    host,
  );
  assert.ok('writes' in answer, `the feed was refused: ${JSON.stringify(answer)}`);
  return { writes: answer.writes, log: answer.log, asked };
}

const row = (seq: number, fields: Body): FeedRow => ({ id: `r_${seq}`, seq, version: 1, fields });
const WORLD_HOST = 'latest.currency-api.pages.dev';
/* AN OUNCE AT 200,000 POUNDS IS 6,430.15 A GRAM OF 24k, and 21k is 21 of its 24 parts. Invented figures. */
const WORLD = { [WORLD_HOST]: { body: { date: TODAY, xau: { egp: 200_000, usd: 4_000 } } } };
const GOLD_21K = row(1, { label: 'Ring', kind: 'gold', karat: '21k', qty: 10, unit_cost: egp(500_000) });

test('THE FEED IS OFF UNTIL CHOSEN: a record that never picks a source fetches nothing and is written nothing', async () => {
  const config = file().config as Record<string, { default?: unknown; values?: unknown }>;
  assert.equal(config.gold_source!.default, 'off');
  assert.deepEqual(config.gold_source!.values, ['off', 'world_price', 'spot_in_dollars']);
  const ran = await feed({}, { holdings: [GOLD_21K] }, WORLD);
  assert.deepEqual([ran.writes, ran.asked], [[], []]);
});

test('THE WORLD PRICE WRITES 24k AND THE KARATS HELD, a gram each in pounds, marked as the feed\'s', async () => {
  const ran = await feed({ gold_source: 'world_price' }, { holdings: [GOLD_21K] }, WORLD);
  assert.deepEqual(ran.asked.map((u) => new URL(u).host), [WORLD_HOST]);
  assert.deepEqual(ran.writes, [
    { op: 'create', register: 'gold_rates', fields: { karat: '24k', per_gram: egp(643_015), on: TODAY, from: 'feed', note: 'World price' } },
    { op: 'create', register: 'gold_rates', fields: { karat: '21k', per_gram: egp(562_638), on: TODAY, from: 'feed', note: 'World price' } },
  ]);
});

test('THE PREMIUM IS ADDED OVER THE WORLD PRICE, and the second address is asked when the first does not answer', async () => {
  const mirror = { 'cdn.jsdelivr.net': WORLD[WORLD_HOST] };
  const ran = await feed({ gold_source: 'world_price', gold_premium: 2 }, { holdings: [GOLD_21K] }, mirror);
  assert.deepEqual(ran.asked.map((u) => new URL(u).host), [WORLD_HOST, 'cdn.jsdelivr.net']);
  assert.deepEqual(ran.writes.map((w) => (w as { fields: Body }).fields.per_gram), [egp(655_875), egp(573_891)]);
  assert.equal((ran.writes[0] as { fields: Body }).fields.note, 'World price, plus 2%');
});

test('A RATE TYPED BY HAND FOR THE DAY IS KEPT, and the feed\'s own rate that day is updated in place, never doubled', async () => {
  const rates = [
    row(5, { karat: '21k', per_gram: egp(600_000), on: TODAY, from: 'hand' }),
    row(6, { karat: '24k', per_gram: egp(640_000), on: TODAY, from: 'feed', note: 'World price' }),
  ];
  const ran = await feed({ gold_source: 'world_price' }, { holdings: [GOLD_21K], gold_rates: rates }, WORLD);
  assert.deepEqual(ran.writes, [{ op: 'update', spoken: 'gold_rates#6', patch: { per_gram: egp(643_015), note: 'World price' }, version: 1 }]);
  assert.match(ran.log, /Left the 21k gold rate as it was typed by hand\./u);
  /* AND RUN AGAIN AT THE SAME PRICE, NOTHING IS WRITTEN. */
  const again = await feed({ gold_source: 'world_price' }, { holdings: [GOLD_21K], gold_rates: [rates[0]!, row(6, { ...rates[1]!.fields, per_gram: egp(643_015) })] }, WORLD);
  assert.deepEqual(again.writes, []);
});

test('SPOT IN DOLLARS IS TURNED INTO POUNDS BY MONEY\'S OWN RATE, and with no rate it writes nothing and asks nobody', async () => {
  const spot = { 'api.gold-api.com': { body: { currency: 'USD', price: 4_000, symbol: 'XAU', updatedAt: `${TODAY}T08:00:00Z` } } };
  /* ONE POUND IS 0.02 DOLLARS, read the other way round: fifty pounds a dollar. */
  const fx = [row(9, { currency: 'EGP', base: 'USD', rate: 0.02, as_of: TODAY })];
  const ran = await feed({ gold_source: 'spot_in_dollars', gold_currency: 'egp' }, { holdings: [GOLD_21K], fx }, spot);
  assert.deepEqual(ran.asked.map((u) => new URL(u).host), ['api.gold-api.com']);
  assert.deepEqual(ran.writes.map((w) => (w as { fields: Body }).fields.per_gram), [egp(643_015), egp(562_638)]);
  const none = await feed({ gold_source: 'spot_in_dollars' }, { holdings: [GOLD_21K] }, spot);
  assert.deepEqual([none.writes, none.asked], [[], []]);
  assert.match(none.log, /no exchange rate between dollars and EGP/u);
});

test('WITH NO MONEY TO SET IT IN, the feed writes nothing and says which setting to fill', async () => {
  const ran = await feed({ gold_source: 'world_price' }, {}, WORLD);
  assert.deepEqual([ran.writes, ran.asked], [[], []]);
  assert.match(ran.log, /Gold rate in/u);
});
