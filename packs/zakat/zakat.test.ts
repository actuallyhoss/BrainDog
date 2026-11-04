/**
 * Zakat, as a pack file: the nisab from the gold rate, the year from the first gold buy or a day somebody sets, each
 * cash account at its lowest over 354 days, the metals, the bills due, and 2.5% of the total.
 *
 * NO KERNEL CHANGE AND NO MIGRATION. No figure says "the lowest an account stood at over a span", so `work.js` walks
 * each cash account back through the ledger and writes the answer as a row in `zakat_cash`, which a page reads with
 * ordinary figures. The tests below put a ledger of invented payments under it and hold the answer by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
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

const PACK_FILE = new URL('./zakat.pack.json', import.meta.url);
const WORK_FILE = new URL('./work.js', import.meta.url);
const HOLDINGS_FILE = new URL('../holdings/holdings.pack.json', import.meta.url);
const file = (): Doc => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;
const holdingsFile = (): Doc => JSON.parse(readFileSync(HOLDINGS_FILE, 'utf8')) as never;
const decl = (doc: Doc, key: string, id: string): Body => doc.declarations.find((d) => d[key] === id)!;

async function money() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  return { api, clock, sql, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> => said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

async function settle(api: Api, rounds = 4): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the scripts fetch nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < rounds; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

const write = (api: Api, register: string, fields: Body): string => said<{ id: string }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).id;
const fieldsOf = (api: Api, id: string): Body => api.kernel.get(id)!.fields as Body;
const edit = (api: Api, register: string, id: string, next: Body): void => void said(api.kernel.update(register, id, next as never, { actor: 'p_1' }));
const rows = (api: Api, register: string): { id: string; fields: Body }[] => said<{ rows: { id: string; fields: Body }[] }>(api.kernel.list({ register, limit: 500 } as never)).rows;

const egp = (amount: number): Money => ({ amount, currency: 'EGP' });
const usd = (amount: number): Money => ({ amount, currency: 'USD' });
const SPREAD_MS = 15 * 60_000;

/** A record with Investments and gold and this add-on on it, the home money the Egyptian pound. */
async function inPounds() {
  const made = await money();
  said(made.api.kernel.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }));
  said(await put(made.api, holdingsFile()));
  said(await put(made.api, file()));
  return made;
}

const account = (api: Api, name: string, balance: Money, extra: Body = {}): string => write(api, 'accounts', { name, kind: 'bank', balance, as_of: TODAY, ...extra });
const pay = (api: Api, acct: string, on: string, direction: 'in' | 'out', amount: number, extra: Body = {}): string =>
  write(api, 'transactions', { what: 'Payment', on, direction, amount: egp(amount), account: acct, ...extra });

/** Work the daily run out: the schedule is first due inside a quarter of an hour of the install. */
async function work(made: Awaited<ReturnType<typeof inPounds>>): Promise<void> {
  made.clock.advance(SPREAD_MS + 1);
  await settle(made.api);
}

const basisOf = (api: Api): Body => rows(api, 'zakat_basis')[0]!.fields;
const cashOf = (api: Api, id: string): Body => rows(api, 'zakat_cash').find((r) => r.fields.account === id)!.fields;

/* ── the file ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('THE FILE IS 2.0.0, NEEDS Investments and gold, and its script is work.js byte for byte, reaching only what it says', () => {
  const doc = file();
  /* 2.0.3 SINCE 1 November (c1737f949): its first step, and where to set the gold rate. */
  assert.equal(doc.version, '2.0.3');
  assert.deepEqual((doc.requires as { packs: Body }).packs, { 'money-core': '>=2.0.0', holdings: '>=2.0.0' });
  const s = decl(doc, 'script', 'zakat_work');
  assert.equal(s.source, readFileSync(WORK_FILE, 'utf8'), 'zakat.pack.json and work.js disagree; copy work.js into the source');
  assert.deepEqual([s.egress, s.keys, s.runs], [[], [], { rule: true, every: '1d' }]);
  assert.deepEqual(s.writes, ['zakat_basis', 'zakat_cash']);
  assert.doesNotMatch(readFileSync(WORK_FILE, 'utf8'), /ctx\.fetch/u);
});

test('THE SAME FILE PASSES AS AN ADD-ON SOMEBODY OPENS FROM DISK', async () => {
  const opened = said<{ pack: { manifest: { pack: string; version: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.deepEqual([opened.pack.manifest.pack, opened.pack.manifest.version], ['zakat', '2.0.3']);
});

test('WITHOUT INVESTMENTS AND GOLD IT IS NOT INSTALLED: the add-on asks for it', async () => {
  const { api, close } = await money();
  const diff = await planOf(api, file()).catch((e: unknown) => e);
  const refused = diff instanceof Error || (diff as Diff).conflicts?.length > 0;
  const result = diff instanceof Error ? null : await put(api, file());
  assert.ok(refused || result?.ok === false, 'the add-on installed with nothing to read gold from');
  close();
});

test('INSTALLED WITH INVESTMENTS AND GOLD: three lists, three rules, a script, figures and a page, and nothing refused', async () => {
  const { api, close } = await money();
  said(await put(api, holdingsFile()));
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  const ids = diff.adds.map((a) => a.id);
  for (const id of ['register.zakat_basis', 'register.zakat_cash', 'register.zakat_paid', 'script.zakat_work', 'page.zakat', 'rule.zakat_inputs', 'rule.zakat_rate', 'rule.zakat_metals', 'metric.zakat-due'])
    assert.ok(ids.includes(id), `${id} is not added`);
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'zakat')?.version, '2.0.3');
  close();
});

/* ── the lowest a cash account stood at ───────────────────────────────────────────────────────────────────────────── */

test('A CASH ACCOUNT COUNTS AT THE LOWEST IT STOOD AT OVER 354 DAYS, worked back from its balance through its payments', async () => {
  const made = await inPounds();
  const { api } = made;
  /* 300,000.00 TODAY. BACK FROM THERE: 1 SEPT OUT 120,000.00 (420,000.00 BEFORE), 20 AUG IN 50,000.00 (370,000.00
     BEFORE), 1 JUNE OUT 100,000.00 (470,000.00), 10 MARCH IN 200,000.00 (270,000.00 BEFORE IT). THE WINDOW BEGINS
     6 OCT 2025 (354 DAYS BACK), AND THE ACCOUNT STOOD AT 270,000.00 THEN, ITS LOWEST. */
  const main = account(api, 'Main', egp(30_000_000));
  pay(api, main, '2026-03-10', 'in', 20_000_000);
  pay(api, main, '2026-06-01', 'out', 10_000_000);
  pay(api, main, '2026-08-20', 'in', 5_000_000);
  pay(api, main, '2026-09-01', 'out', 12_000_000);
  /* A PENDING PAYMENT IS NOT MONEY THAT MOVED. */
  pay(api, main, '2026-09-10', 'out', 99_000_000, { state: 'pending' });
  await work(made);
  const row = cashOf(api, main);
  assert.deepEqual([row.low, row.lowest_on, row.since, row.taken, row.whole], [egp(27_000_000), '2025-10-06', '2025-10-06', true, true]);
  made.close();
});

test('THE LOWEST CAN BE IN THE MIDDLE OF THE YEAR, and a balance below nothing counts as nothing', async () => {
  const made = await inPounds();
  const { api } = made;
  const wallet = account(api, 'Wallet', egp(100_000));
  /* 5 MARCH OUT 400,000 (500,000 BEFORE, 100,000 AFTER)... 1 SEPT IN 300,000 THE BALANCE WAS -200,000 BEFORE. */
  pay(api, wallet, '2026-03-05', 'out', 400_000);
  pay(api, wallet, '2026-09-01', 'in', 300_000);
  const savings = account(api, 'Savings', egp(5_000_000), { kind: 'bank' });
  pay(api, savings, '2026-01-10', 'out', 2_000_000);
  pay(api, savings, '2026-05-10', 'in', 500_000);
  await work(made);
  /* WALLET: END OF 31 AUG IS 100,000 - 300,000 + ... = -200,000 + 400,000 OUT ALREADY IN IT. THE STATEMENT IS TODAY. */
  const w = cashOf(api, wallet);
  assert.equal((w.low as Money).amount, 100_000 - 300_000);
  assert.equal(w.lowest_on, '2026-03-05');
  const s = cashOf(api, savings);
  /* 5,000,000 TODAY; BEFORE 10 MAY 4,500,000; BEFORE 10 JAN (OUT 2,000,000) 6,500,000; LOWEST IS 4,500,000 FROM 10 JAN TO 9 MAY. */
  assert.deepEqual([(s.low as Money).amount, s.lowest_on], [4_500_000, '2026-01-10']);
  /* THE WALLET COUNTS FOR NOTHING IN THE TOTAL, NOT FOR LESS THAN NOTHING. */
  assert.equal((basisOf(api).cash as Money).amount, 4_500_000);
  made.close();
});

test('A LEDGER OF MORE THAN ONE PAGE IS READ WHOLE, in slices of days', async () => {
  const made = await inPounds();
  const { api } = made;
  const big = account(api, 'Big', egp(17_000_000));
  /* 120 DAYS, ONE PAYMENT IN OF 1,000.00 EACH, SO THE ACCOUNT BEGAN THE RUN AT 50,000.00 AND ROSE EVERY DAY. */
  for (let i = 0; i < 120; i++) pay(api, big, new Date(Date.UTC(2026, 4, 28 + i)).toISOString().slice(0, 10), 'in', 100_000);
  await work(made);
  const row = cashOf(api, big);
  assert.deepEqual([(row.low as Money).amount, row.whole, row.moves], [5_000_000, true, 120]);
  made.close();
});

test('A BALANCE CHECK AND A PAYMENT THAT PRINTED ITS BALANCE RESTART THE WORKING, as Money rolls a balance', async () => {
  const made = await inPounds();
  const { api } = made;
  const acct = account(api, 'Checked', egp(9_999_999_00), { as_of: '2026-01-01' });
  /* THE ACCOUNT SAID 1,000.00 ON 1 JAN; A CHECK SAID 2,000.00 ON 1 MAR; A PAYMENT PRINTED 3,500.00 AFTER IT ON 1 JUN. */
  write(api, 'balances', { account: acct, balance: egp(200_000), as_of: '2026-03-01' });
  pay(api, acct, '2026-06-01', 'in', 1_000_000, { balance_after: egp(350_000) });
  pay(api, acct, '2026-08-01', 'out', 100_000);
  await work(made);
  /* TODAY IS 3,500.00 LESS 1,000.00 = 2,500.00; THE LOWEST IS 2,000.00 FROM 1 MAR UNTIL THE JUNE PAYMENT. */
  const row = cashOf(api, acct);
  assert.equal((row.low as Money).amount, 200_000 - 0);
  made.close();
});

/* ── the working ─────────────────────────────────────────────────────────────────────────────────────────────────── */

test('THE WORKING: nisab from the gold rate, the year from the first gold buy, cash, metals, bills due, and 2.5%', async () => {
  const made = await inPounds();
  const { api } = made;
  const main = account(api, 'Main', egp(30_000_000));
  pay(api, main, '2026-03-10', 'in', 20_000_000);
  pay(api, main, '2026-06-01', 'out', 10_000_000);
  pay(api, main, '2026-08-20', 'in', 5_000_000);
  pay(api, main, '2026-09-01', 'out', 12_000_000);
  /* A CARD IS NOT CASH, AND AN ACCOUNT IN ANOTHER CURRENCY IS LEFT OUT, NOT ADDED. */
  account(api, 'Card', egp(-2_000_000), { kind: 'card' });
  account(api, 'Dollars', usd(900_000));
  const gold = write(api, 'holdings', { label: 'Gold bar 24k', kind: 'gold', karat: '24k', unit: 'gram' });
  write(api, 'holding_buys', { item: gold, bought_on: '2025-09-01', qty: 10, price: egp(480_000) });
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(520_000), from: 'hand' });
  /* TWO BILLS DUE: ONE PART PAID, AND ONE NOT YET DUE. */
  write(api, 'obligations', { what: 'Workshop', direction: 'owed_by_me', amount: egp(2_000_000), paid_so_far: egp(500_000), state: 'part', due: '2026-09-01' });
  write(api, 'obligations', { what: 'Later bill', direction: 'owed_by_me', amount: egp(9_000_000), state: 'open', due: '2026-10-30' });
  await work(made);
  const first = basisOf(api);
  /* 85 g AT 5,200.00 IS 442,000.00. CASH 270,000.00 + GOLD 10 g AT 5,200.00 (52,000.00) - BILLS 15,000.00 = 307,000.00. */
  assert.deepEqual([first.nisab, first.nisab_grams, first.measure_used], [egp(44_200_000), 85, 'gold']);
  assert.deepEqual([first.cash, first.metals, first.bills_due], [egp(27_000_000), egp(5_200_000), egp(1_500_000)]);
  assert.deepEqual([first.total, first.met, first.due], [egp(30_700_000), false, egp(0)]);
  /* TWO LEFT OUT: THE DOLLARS ACCOUNT, AND THE SAMPLE POUNDS ACCOUNT THE RECORD COMES WITH. */
  assert.equal(first.left, 2);
  /* THE YEAR: 354 DAYS FROM THE FIRST GOLD BUY, 1 SEPT 2025 -> 21 AUG 2026, COMPLETE BY 25 SEPT. */
  assert.deepEqual([first.hawl_from, first.hawl_by, first.hawl_ends, first.hawl_done], ['2025-09-01', 'gold', '2026-08-21', true]);

  /* CASH DUE TO YOU TAKES IT OVER THE NISAB: 307,000.00 + 150,000.00 = 457,000.00, AND 2.5% IS 11,425.00. */
  edit(api, 'zakat_basis', rows(api, 'zakat_basis')[0]!.id, { lent: egp(15_000_000) });
  await settle(api);
  const next = basisOf(api);
  assert.deepEqual([next.total, next.met, next.due], [egp(45_700_000), true, egp(1_142_500)]);
  made.close();
});

test('A DAY SOMEBODY GIVES FOR THE YEAR BEATS THE FIRST GOLD BUY, and a year not yet run says so', async () => {
  const made = await inPounds();
  const { api } = made;
  const gold = write(api, 'holdings', { label: 'Gold 21k', kind: 'gold', karat: '21k', unit: 'gram' });
  write(api, 'holding_buys', { item: gold, bought_on: '2025-01-01', qty: 5, price: egp(400_000) });
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(520_000) });
  await work(made);
  const id = rows(api, 'zakat_basis')[0]!.id;
  edit(api, 'zakat_basis', id, { hawl_on: '2026-06-01' });
  await settle(api);
  const b = basisOf(api);
  assert.deepEqual([b.hawl_from, b.hawl_by, b.hawl_ends, b.hawl_done], ['2026-06-01', 'typed', '2027-05-21', false]);
  made.close();
});

test('SILVER IS 595 g AT THE SILVER PRICE GIVEN, and silver chosen with no price is worked as gold and says so', async () => {
  const made = await inPounds();
  const { api } = made;
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(520_000) });
  await work(made);
  const id = rows(api, 'zakat_basis')[0]!.id;
  edit(api, 'zakat_basis', id, { mode: 'silver' });
  await settle(api);
  assert.deepEqual([basisOf(api).measure_used, basisOf(api).nisab_grams], ['gold', 85]);
  edit(api, 'zakat_basis', id, { silver_rate: egp(6_000) });
  await settle(api);
  assert.deepEqual([basisOf(api).measure_used, basisOf(api).nisab_grams, basisOf(api).nisab], ['silver', 595, egp(3_570_000)]);
  made.close();
});

test('WITH NO GOLD RATE THERE IS NO NISAB, so nothing is said to be due', async () => {
  const made = await inPounds();
  const { api } = made;
  account(api, 'Main', egp(90_000_000));
  await work(made);
  const b = basisOf(api);
  assert.deepEqual([b.nisab ?? null, b.met, b.due], [null, false, egp(0)]);
  made.close();
});

test('A NEW GOLD RATE WORKS IT OUT AGAIN WITH NOBODY WAITING FOR THE NIGHT, and the daily run adds no second row', async () => {
  const made = await inPounds();
  const { api } = made;
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(520_000), on: '2026-09-01' });
  await work(made);
  assert.equal(rows(api, 'zakat_basis').length, 1);
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(600_000), on: '2026-09-20' });
  await settle(api);
  assert.deepEqual(basisOf(api).nisab, egp(51_000_000));
  made.clock.advance(24 * 3_600_000);
  await settle(api);
  assert.equal(rows(api, 'zakat_basis').length, 1);
  made.close();
});

/* ── history and the page ────────────────────────────────────────────────────────────────────────────────────────── */

test('WHAT YOU GAVE IS KEPT, newest first, whole', async () => {
  const { api, close } = await inPounds();
  write(api, 'zakat_paid', { paid: '2025-09-20', amount: egp(1_000_000), note: 'Local charity' });
  write(api, 'zakat_paid', { paid: '2026-09-20', amount: egp(1_200_000), for_year: '2026-08-20' });
  assert.deepEqual(rows(api, 'zakat_paid').map((r) => r.fields.paid).sort(), ['2025-09-20', '2026-09-20']);
  close();
});

type Block = { kind: string; heading?: string; body?: string; drawn?: boolean; why?: string; refusals: unknown[]; rows?: { fields: Body }[]; readings?: { metric: string; reading: { value: number | null } }[] };
const drawn = (b: Block): boolean => b.drawn !== false && b.why === undefined;
const pageOf = async (api: Api): Promise<{ title: string; blocks: Block[] }> => said(await api.page({ slug: 'zakat' }, owner));

test('THE PAGE SHOWS THE STEPS: a line, what it comes to, the cash accounts, and what was given', async () => {
  const made = await inPounds();
  const { api } = made;
  const main = account(api, 'Main', egp(50_000_000));
  pay(api, main, '2026-02-01', 'in', 1_000_000);
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(520_000) });
  write(api, 'zakat_paid', { paid: '2025-09-20', amount: egp(1_000_000) });
  await work(made);
  const page = await pageOf(api);
  assert.equal(page.title, 'Zakat');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const on = page.blocks.filter(drawn);
  assert.deepEqual([on[0]!.kind, (on[0] as { lead?: boolean }).lead], ['note', true]);
  /* 500,000.00 - 10,000.00 BEFORE THE FEBRUARY PAYMENT IS 490,000.00, AT OR ABOVE THE 442,000.00 NISAB. */
  assert.match(on[0]!.body ?? '', /at or above the nisab/u);
  const tiles = on.find((b) => b.heading === 'What it comes to')!;
  const cell = (m: string): number | null => tiles.readings!.find((r) => r.metric === m)!.reading.value;
  assert.deepEqual([cell('zakat-total'), cell('zakat-nisab'), cell('zakat-due'), cell('zakat-given')], [49_000_000, 44_200_000, 1_225_000, 1_000_000]);
  const cash = on.find((b) => b.heading === 'Step 3. Cash at its lowest over 354 days')!;
  assert.deepEqual((cash.rows ?? []).map((r) => r.fields.low), [egp(49_000_000)]);
  const given = on.find((b) => b.heading === 'What you have given')!;
  assert.equal((given.rows ?? []).length, 1);
  made.close();
});

test('A FRESH PAGE SAYS TO SET THE GOLD RATE, and below the nisab it says no zakat is due', async () => {
  const made = await inPounds();
  const { api } = made;
  await work(made);
  assert.match((await pageOf(api)).blocks.filter(drawn)[0]!.body ?? '', /Set today's gold rate/u);
  write(api, 'gold_rates', { karat: '24k', per_gram: egp(520_000) });
  await settle(api);
  assert.match((await pageOf(api)).blocks.filter(drawn)[0]!.body ?? '', /no zakat is due/u);
  made.close();
});

test('EVERY TILE WEARS A GLYPH, the page reads ten things or more, and no word says who owes whom', () => {
  const page = file().declarations.find((d) => d.page === 'zakat')!;
  type B = { kind: string; heading?: string; icon?: string; body?: string; empty?: string; cells?: { label?: string }[]; columns?: { label?: string }[] };
  const blocks = page.blocks as B[];
  for (const b of blocks) if (b.heading !== undefined) assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${b.heading} wears no glyph`);
  const read = blocks.flatMap((b) => [b.heading, b.body, b.empty, ...(b.cells ?? []).map((c) => c.label), ...(b.columns ?? []).map((c) => c.label)]).filter((t): t is string => typeof t === 'string');
  assert.ok(read.length >= 10);
  for (const t of read) assert.doesNotMatch(t, /\bowe[ds]?\b|\bowing\b|—/iu, `the page says "${t}"`);
  assert.deepEqual([blocks[0]!.kind, (blocks[0] as { lead?: boolean }).lead], ['note', true]);
  assert.ok(blocks.length <= 24);
  assert.ok(blocks.filter((b) => b.kind === 'stat').every((b) => (b.cells ?? []).length <= 6));
  for (const d of file().declarations) if (typeof d.metric === 'string') assert.doesNotMatch(String(d.name), /\bowe[ds]?\b/iu);
});
