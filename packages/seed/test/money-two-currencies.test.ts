/**
 * Every Money figure, on a record that holds pounds and dollars, answers one amount, a converted amount, or one amount a
 * currency, and never the bare sum of two currencies' minor units.
 *
 * WHY A GUARD AND NOT A HOPE. His record holds Egyptian pounds and dollars (one rate, typed on 28 September), and an
 * amount is integer minor units with a currency beside it. A figure that adds 50,000 cents to 100,000 pence answers
 * 150,000 of something, and a page prints it as GBP 1,500.00 with nothing on it to say it is wrong. The kernel keeps
 * currencies apart today (`fx.ts`, `across`); this file is what says so for every figure Money declares, including the
 * ones added after it was written, since it reads the installed pack rather than a list of ids.
 *
 * HOW "NEVER THE BARE SUM" IS KNOWN. The same rows are written on four records: both currencies, pounds alone, dollars
 * alone, and both with every dollar relabelled as pounds, which is what a bare sum would read. A part must be what that
 * currency alone reads; one amount must be what its currency alone reads, with nothing in the other; a converted amount
 * must be the pounds plus the dollars at the rate, within a minor unit a row, and must not be the relabelled record's.
 *
 * FOUR WAYS A RECORD STANDS: no home currency; a home currency and the rate; a home currency and no rate; and a home
 * currency with one of its two rates missing. The last checks that a figure does not convert the half it can and print
 * the result as the whole. Built through the record's public methods only: `create` and `setPackConfig`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { fill, openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

/**
 * One currency's rows: the currency they are written in, the word their names carry, how much bigger they are than the
 * pounds, and what a savings account in it holds.
 */
type Side = { currency: string; word: string; times: number; savings: number };

const POUNDS: Side = { currency: 'GBP', word: 'pounds', times: 1, savings: 0 };
/* DOLLARS ARE THREE TIMES THE POUNDS, so a part that came from the wrong currency, or a bare sum, is never the right number
   by chance. AND ONLY THE DOLLARS SAVE: rows in the same shape in both currencies run out on the same day however they are
   added, so the runway of a bare sum could not be told from a converted one without money that is in one currency only.
   Measured: with 1,100,000 saved the bare sum runs out in 340 days and the converted amount in 309, and with no income
   (money-core 3.17.0's `lasts-no-income`) in 279 and 248. Most savings give both the same day for one of the two, since
   the walk steps a month at a time: 700,000, the amount before, kept the runways apart and gave 187 for both with no
   income. Only about 1,080,000 to 1,120,000 keeps both pairs apart and still runs out inside the runway's year. */
const DOLLARS: Side = { currency: 'USD', word: 'dollars', times: 3, savings: 1_100_000 };
/** What a bare sum reads: the dollars' rows, written as pounds. */
const DOLLARS_AS_POUNDS: Side = { ...DOLLARS, currency: 'GBP' };

/** The name a figure about one book or one project is asked with: a book and a project are both called this. */
const KILN = 'Kiln';

/** A way the record stands: its home currency, and the rates it holds, each as what one unit is worth in the base. */
type Stands = { say: string; home: string | null; rates: { currency: string; base: string; rate: number }[] };

const STANDS: Stands[] = [
  { say: 'with no home currency', home: null, rates: [] },
  { say: 'with pounds at home and the rate for dollars', home: 'GBP', rates: [{ currency: 'USD', base: 'GBP', rate: 0.8 }] },
  { say: 'with pounds at home and no rate', home: 'GBP', rates: [] },
  { say: 'with euros at home and the rate for dollars missing', home: 'EUR', rates: [{ currency: 'GBP', base: 'EUR', rate: 1.15 }] },
];

/** A record holding money-core and what it points at, with no example rows. */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

/**
 * One currency's share of everything Money reads: an account that counts as cash and one that arrives later, money in
 * and out of the ledger, bills and invoices due soon and late, a paid invoice, repeating money each way and an
 * instalment. Each is in the book and the project called Kiln, so the figures of one book and one project read them too.
 */
function write(k: Kernel, side: Side, kiln: { book: string; thing: string; category: string }): void {
  const at = (n: number) => ({ amount: n * side.times, currency: side.currency });
  const make = (register: string, fields: Record<string, unknown>) => value(k.create(register, { book: kiln.book, ...fields }, OWNER));
  const cash = value<{ id: string }>(k.create('accounts', { name: `Current in ${side.word}`, kind: 'bank', balance: at(100_000), as_of: day(-1), book: kiln.book }, OWNER));
  if (side.savings > 0) make('accounts', { name: `Savings in ${side.word}`, kind: 'bank', balance: { amount: side.savings, currency: side.currency }, as_of: day(-1) });
  make('accounts', { name: `Deposit in ${side.word}`, kind: 'bank', balance: at(5_000), as_of: day(-1), liquid: false, arrives: day(10) });
  /* AND A CARD THAT SAYS WHAT IS TO PAY ON IT, which no figure of cash counts. */
  make('accounts', { name: `Card in ${side.word}`, kind: 'card', balance: at(-2_000), as_of: day(-1), liquid: false, limit: at(10_000), to_pay: at(2_000), to_pay_on: day(-1) });
  make('transactions', { what: `Paid in ${side.word}`, on: day(-2), direction: 'out', amount: at(1_000), account: cash.id, state: 'cleared', thing: kiln.thing });
  make('transactions', { what: `Software in ${side.word}`, on: day(-1), direction: 'out', amount: at(700), account: cash.id, state: 'cleared', category: kiln.category });
  /* AND ONE LAST MONTH, on a day number this month has reached, for the figures of last month and of last month to this day
     (money-core 3.17.0, spend-figures-63). Thirty-three days back, so no thirty-day figure reads it. */
  make('transactions', { what: `Software last month in ${side.word}`, on: day(-33), direction: 'out', amount: at(600), account: cash.id, state: 'cleared', category: kiln.category });
  make('transactions', { what: `Received in ${side.word}`, on: day(-1), direction: 'in', amount: at(2_500), account: cash.id, state: 'cleared', thing: kiln.thing });
  /* AND MONEY IN THREE MONTHS BACK, 15 June, for what comes in a month (`received-a-month`, `received-three-months-back`,
     money-core 3.32.0), and a payment still waiting to clear this month (`pending-out-month`, money-core 3.31.0). */
  make('transactions', { what: `Received in June in ${side.word}`, on: day(-80), direction: 'in', amount: at(1_800), account: cash.id, state: 'cleared' });
  make('transactions', { what: `Waiting in ${side.word}`, on: day(0), direction: 'out', amount: at(300), account: cash.id, state: 'pending' });
  make('obligations', { what: `Bill in ${side.word}`, direction: 'owed_by_me', amount: at(2_000), due: day(5), state: 'open' });
  make('obligations', { what: `Late bill in ${side.word}`, direction: 'owed_by_me', amount: at(3_000), due: day(-5), state: 'open' });
  make('obligations', { what: `Invoice in ${side.word}`, direction: 'owed_to_me', amount: at(4_000), due: day(7), state: 'open', thing: kiln.thing });
  make('obligations', { what: `Late invoice in ${side.word}`, direction: 'owed_to_me', amount: at(1_500), due: day(-4), state: 'open', chased: day(-1), thing: kiln.thing });
  make('obligations', { what: `Paid invoice in ${side.word}`, direction: 'owed_to_me', amount: at(900), due: day(-40), settled: day(-30), state: 'paid' });
  make('obligations', { what: `Invoice paid this week in ${side.word}`, direction: 'owed_to_me', amount: at(700), due: day(-3), settled: day(-2), state: 'paid' });
  make('recurring', { what: `Rent in ${side.word}`, direction: 'out', amount: at(40_000), every: 'monthly', next_due: day(6), state: 'live', category: kiln.category });
  make('recurring', { what: `Retainer in ${side.word}`, direction: 'in', amount: at(7_000), every: 'monthly', next_due: day(12), state: 'live' });
  /* THE LAPTOP HAS A PART AFTER THIS ONE, so what is left once this is paid is not nought (`installments-after-next-by-plan`,
     which reads the greatest `left_after` of a plan's open parts and would otherwise read nothing in either currency). */
  make('installments', { what: `Laptop in ${side.word}`, plan: `Laptop in ${side.word}`, direction: 'out', amount: at(1_200), due: day(8), state: 'open', left_after: at(800) });
  /* AND TWO PARTS OF THE PLAN CALLED KILN, one paid and one open, for the figures of one plan (`plan-paid`, `plan-left`,
     money-core 3.17.0). */
  make('installments', { what: `Kiln, part 1 in ${side.word}`, plan: KILN, number: 1, direction: 'out', amount: at(900), due: day(-20), state: 'paid' });
  make('installments', { what: `Kiln, part 2 in ${side.word}`, plan: KILN, number: 2, direction: 'out', amount: at(900), due: day(200), state: 'open' });
  /* AND ONE PAST ITS DAY AND STILL OPEN, for what is late on one plan (`plan-late`, money-core 3.29.0), with what is
     left once it is paid, the second part, for the plan's track (`plan-after-next-by-plan`). */
  make('installments', { what: `Kiln, part 3 in ${side.word}`, plan: KILN, number: 3, direction: 'out', amount: at(400), due: day(-10), state: 'open', left_after: at(900) });
  /* AND A CATEGORY WITH A BUDGET IN THIS CURRENCY, for what the budgets add up to (`budgets-total`, money-core 3.29.0). A
     category keeps no book, so it is made without one. */
  value(k.create('categories', { name: `Food in ${side.word}`, direction: 'out', state: 'live', budget: at(5_000) }, OWNER));
  /* AND A WEEK'S BUDGET AND A YEAR'S, for what those add up to a month (money-core 3.31.0). */
  value(k.create('categories', { name: `Coffee in ${side.word}`, direction: 'out', state: 'live', budget: at(500), budget_period: 'week' }, OWNER));
  value(k.create('categories', { name: `Travel in ${side.word}`, direction: 'out', state: 'live', budget: at(24_000), budget_period: 'year' }, OWNER));
}

/** A record holding the rows of each side, standing as `stands` says. */
async function recordOf(sides: Side[], stands: Stands): Promise<Kernel> {
  const k = await moneyCore();
  const book = value<{ id: string }>(k.create('books', { name: KILN }, OWNER)).id;
  const thing = value<{ id: string }>(k.create('things', { name: KILN, lane: 'earning' }, OWNER)).id;
  const category = value<{ id: string }>(k.create('categories', { name: 'Software', direction: 'out', state: 'live' }, OWNER)).id;
  for (const side of sides) write(k, side, { book, thing, category });
  if (stands.home !== null) value(k.setPackConfig('money-core', { home_currency: stands.home }, OWNER));
  for (const r of stands.rates) value(k.create('fx', { ...r, as_of: day(-1) }, OWNER));
  return k;
}

/* ── what each figure answers ─────────────────────────────────────────── */

/** One answer, of a figure or of one part of a grouped figure: the fields this guard asks. */
type Answer = { value: number | null; unit: string | null; rows: number; parts?: { currency: string; amount: number }[]; fx?: { into: string | null; missing: string[] } };
type Read = Answer & { groups?: (Answer & { key: string; label?: string })[] };
type Figure = { metric: string; format?: string; source?: string; value?: unknown; where?: unknown };

/** Every figure money-core installed on this record, a figure of one book or one project asked about Kiln, and a figure of one category about Software, the one category `write` files under (`budget-passed-on`, money-core 3.17.0). */
const figuresOf = (k: Kernel): Figure[] =>
  (k.declarations() as { kind: string; pack_id: string; body: string }[])
    .filter((d) => d.kind === 'metric' && d.pack_id === 'money-core')
    /* NOT A FIGURE OF ONE ACCOUNT (money-core 3.29.0's account page): an account holds one currency, so such a figure has
       no second currency to keep apart, and no book or project is an account. `money-account-page.test.ts` holds them. */
    .filter((d) => !/(?:name|account) is \{\{it\}\}|account-(?:now|lines):\{\{it\}\}/u.test(d.body))
    /* NOR ONE OF ONE PAYEE (money-core 3.32.0's `paid-to-by-week`): `party` names an organisation, and this record holds
       none, so the payee is no name it could be asked about. Its sum is Spending's, read a category at a time above. */
    .filter((d) => !/party is \{\{it\}\}/u.test(d.body))
    /* NOR ONE OF ONE FILING RULE (3c699b60d's `filing-rule-filed`): a count of lines, so no two currencies meet in it, and
       `filed_by` names a rule this record holds none of. `money-rules-page.test.ts` holds it. */
    .filter((d) => !/filed_by is \{\{it\}\}/u.test(d.body))
    .map((d) => {
      const body = JSON.parse(d.body) as Figure;
      return (JSON.stringify(body).includes('{{it}}') ? fill(body, null, JSON.stringify(body).includes('category is {{it}}') ? 'Software' : KILN) : body) as Figure;
    });

/** What every figure answers, by id. A refusal is a fault of its own: a figure the record cannot read answers nothing. */
function readAll(k: Kernel): Map<string, Read> {
  const out = new Map<string, Read>();
  for (const f of figuresOf(k)) out.set(f.metric, value<Read>(k.metric(f as never)));
  return out;
}

const isMoney = (f: Figure): boolean => f.format === 'money' || (f.format ?? '').startsWith('money.');

/**
 * A figure that reads money and answers something else: how many days it lasts, or the day it runs out. A rolled figure
 * that reads an age (`rolled.read`, money-core 3.16.0) reads the balances' days and never their money.
 */
const readsMoney = (f: Figure): boolean =>
  /"(walk|rolled)"/.test(JSON.stringify(f.value ?? null)) && (f.value as { rolled?: { read?: unknown } } | null)?.rolled?.read === undefined;

/* ── what a right answer is ───────────────────────────────────────────── */

/** What one unit of `code` is worth at home on this record, or `null` when it holds no rate for it. */
const worth = (stands: Stands, code: string): number | null =>
  code === stands.home ? 1 : (stands.rates.find((r) => r.currency === code && r.base === stands.home)?.rate ?? null);

/**
 * Why one money answer is wrong, or nothing. `raw` is what each currency's rows alone answer on a record with no home
 * currency, in that currency; `bare` is what the same rows answer with the dollars written as pounds.
 */
function moneyFaults(said: Answer, raw: Record<string, number>, bare: Answer | undefined, stands: Stands, greatest = false): string[] {
  const out: string[] = [];
  const held = Object.keys(raw).filter((c) => raw[c] !== 0);
  /* A MINOR UNIT A ROW, since each amount is converted and rounded on its own before they are added. */
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, said.rows);
  /* A SUM ADDS EACH CURRENCY'S ROWS AT HOME, and a figure that reads the greatest of its rows (`max`) is the greatest of them at home. */
  const atHome = (codes: string[]): number => {
    const each = codes.map((c) => raw[c]! * (worth(stands, c) ?? Number.NaN));
    return greatest ? Math.max(...each) : each.reduce((sum, n) => sum + n, 0);
  };
  const isBare = held.length > 1 && typeof bare?.value === 'number' && said.value === bare.value;
  if (said.parts !== undefined) {
    if (said.value !== null) out.push(`answers ${said.value} and parts at once`);
    const codes = said.parts.map((p) => p.currency);
    if (new Set(codes).size !== codes.length) out.push(`names one currency twice: ${codes.join(', ')}`);
    /* A HELD CURRENCY WITH NO PART OF ITS OWN WAS CONVERTED, and only into the home part. */
    const converted = held.filter((c) => !codes.includes(c) || c === stands.home);
    for (const p of said.parts) {
      const want = p.currency === stands.home ? atHome(converted) : (raw[p.currency] ?? Number.NaN);
      if (!near(p.amount, want)) out.push(`says ${p.currency} ${p.amount} where its rows hold ${want}`);
    }
    for (const c of converted) if (c !== stands.home && (worth(stands, c) === null || !codes.includes(stands.home ?? ''))) out.push(`leaves out the ${c} its rows hold`);
    return out;
  }
  if (said.value === null) return held.length > 0 ? [`answers nothing where ${held.map((c) => `${c} ${raw[c]}`).join(' and ')} is held`] : [];
  if (said.unit === null) return said.value === 0 && held.length === 0 ? [] : [`answers ${said.value} in no currency`];
  if (held.every((c) => c === said.unit)) return near(said.value, raw[said.unit] ?? 0) ? [] : [`answers ${said.unit} ${said.value} where its rows hold ${raw[said.unit] ?? 0}`];
  /* MORE THAN ONE CURRENCY AS ONE AMOUNT IS A CONVERTED AMOUNT, at home, with every rate it needed. */
  if (said.unit !== stands.home) out.push(`adds ${held.join(' and ')} up in ${said.unit}, which is not the home currency`);
  else if (held.some((c) => worth(stands, c) === null)) out.push(`adds ${held.join(' and ')} up without the rate for ${held.filter((c) => worth(stands, c) === null).join(', ')}`);
  else if (!near(said.value, atHome(held))) out.push(`answers ${said.unit} ${said.value} where the rows converted hold ${atHome(held)}`);
  if (isBare) out.push(`answers ${said.value}, the bare sum of ${held.join(' and ')}`);
  return out;
}

/** What each currency's rows alone answer, by figure: the record that holds only them, with no home currency. */
type Alone = Record<string, Map<string, Read>>;

/** A group's answer on another record, found by what a person calls it, since a book's key is a row id that differs. */
const groupOf = (r: Read | undefined, name: string): Answer | undefined => r?.groups?.find((g) => (g.label ?? g.key) === name);

/** Why one figure's answer on the record holding both currencies is wrong, each reason as a sentence, or nothing. */
function figureFaults(f: Figure, said: Read, alone: Alone, bare: Read | undefined, stands: Stands): string[] {
  const rawOf = (pick: (r: Read | undefined) => Answer | undefined): Record<string, number> =>
    Object.fromEntries(Object.entries(alone).map(([code, reads]) => [code, pick(reads.get(f.metric))?.value ?? 0]));
  if (!isMoney(f)) {
    const out: string[] = [];
    /* A SHARE OF TWO SUMS OF MONEY ANSWERS ONCE A CURRENCY BY THE KERNEL'S OWN RULE (metrics.ts, "A HALF IN PARTS ... IS
       THE FIGURE ONCE PER CURRENCY"), so its parts are no fault. No figure is one today. */
    const share = /"ratio"/.test(JSON.stringify(f.value ?? null));
    if ((said.parts !== undefined && !share) || (said.unit !== null && /^[A-Z]{3}$/.test(said.unit))) out.push(`${f.metric} is not money and answers in ${said.unit ?? 'parts'}`);
    /* A RUNWAY ADDS THE CURRENCIES UP BEFORE IT COUNTS DAYS, so it may only answer once every one of them can be. */
    if (readsMoney(f)) {
      const all = Object.keys(alone).every((c) => stands.home !== null && worth(stands, c) !== null);
      if (!all && said.value !== null) out.push(`${f.metric} answers ${said.value} with no rate to add ${Object.keys(alone).join(' and ')} up by`);
      if (all && said.value !== null && said.value === bare?.value) out.push(`${f.metric} answers ${said.value}, what the bare sum of ${Object.keys(alone).join(' and ')} answers`);
    }
    return out;
  }
  const greatest = 'max' in ((f.value ?? {}) as object);
  const out = moneyFaults(said, rawOf((r) => r), bare, stands, greatest).map((why) => `${f.metric} ${why}`);
  /* A FIGURE THAT CANNOT ADD UP NAMES THE RATE IT LACKS, since that is what a person can do about it. */
  if (said.parts !== undefined && stands.home !== null)
    for (const code of Object.keys(alone).filter((c) => worth(stands, c) === null && rawOf((r) => r)[c] !== 0))
      if (!said.fx?.missing.includes(`${code} to ${stands.home}`)) out.push(`${f.metric} does not say it lacks the rate from ${code} to ${stands.home}`);
  for (const g of said.groups ?? []) {
    const name = g.label ?? g.key;
    out.push(...moneyFaults({ ...g, unit: said.unit }, rawOf((r) => groupOf(r, name)), groupOf(bare, name), stands, greatest).map((why) => `${f.metric}, ${name}, ${why}`));
  }
  return out;
}

/* ── the guard ────────────────────────────────────────────────────────── */

const NO_HOME = STANDS[0]!;
let aloneOnce: Promise<Alone> | null = null;
const aloneReads = (): Promise<Alone> =>
  (aloneOnce ??= (async () => ({ GBP: readAll(await recordOf([POUNDS], NO_HOME)), USD: readAll(await recordOf([DOLLARS], NO_HOME)) }))());

/** Every reason any Money figure answers wrongly on a record holding both currencies, standing as `stands` says. */
async function faultsWhere(stands: Stands, answer: (k: Kernel) => Map<string, Read> = readAll): Promise<string[]> {
  const alone = await aloneReads();
  const k = await recordOf([POUNDS, DOLLARS], stands);
  const both = answer(k);
  const bare = readAll(await recordOf([POUNDS, DOLLARS_AS_POUNDS], stands));
  return figuresOf(k).flatMap((f) => figureFaults(f, both.get(f.metric)!, alone, bare.get(f.metric), stands));
}

for (const stands of STANDS)
  test(`EVERY MONEY FIGURE ANSWERS ONE AMOUNT, A CONVERTED ONE, OR ONE A CURRENCY, ${stands.say.toUpperCase()}`, async () => {
    assert.deepEqual(await faultsWhere(stands), []);
  });

test('EVERY MONEY FIGURE IN AN AMOUNT HAS ROWS IN BOTH CURRENCIES HERE, so none passes for holding nothing', async () => {
  const alone = await aloneReads();
  const k = await recordOf([POUNDS, DOLLARS], NO_HOME);
  /* A CROSS-CHECK READS NOUGHT BY DESIGN (money-core 3.17.0's `cash-cross-check`): nought is the figure agreeing with the
     ledger, not a figure holding nothing. */
  /* NOR WHAT IS HELD BEYOND CASH (money-core 3.31.0's `held-beyond-cash`): it adds the add-ons' figures, and a record of
     money-core alone holds no add-on, so it reads nought in each currency by design. */
  const figures = figuresOf(k).filter(isMoney).filter((f) => !/"crosscheck"/.test(JSON.stringify(f.value ?? null)) && f.metric !== 'held-beyond-cash');
  assert.ok(figures.length >= 30, `only ${figures.length} money figures were found, so the pack was not read`);
  const idle = figures.filter((f) => Object.values(alone).some((reads) => (reads.get(f.metric)?.value ?? 0) === 0)).map((f) => f.metric);
  assert.deepEqual(idle, [], 'these figures read nothing in one currency: give `write` a row each reads');
});

/* ── the guard bites ──────────────────────────────────────────────────── */

test('A FIGURE THAT ADDS POUNDS AND DOLLARS AS THEY ARE IS CAUGHT, as one amount, as a part, and as a runway', async () => {
  const rated = STANDS[1]!;
  /* THE PLANT, TWICE: every answer in parts replaced by the bare sum of its parts' minor units, as one amount in pounds
     and then as one part in pounds. */
  const summed = (k: Kernel): Map<string, Read> => {
    const reads = readAll(k);
    for (const [id, r] of reads) {
      const total = (r.parts ?? []).reduce((sum, p) => sum + p.amount, 0);
      if (r.parts === undefined) continue;
      const { parts: _parts, ...rest } = r;
      reads.set(id, { ...rest, value: total, unit: 'GBP' });
    }
    return reads;
  };
  const onePart = (k: Kernel): Map<string, Read> => {
    const reads = readAll(k);
    for (const [id, r] of reads) if (r.parts !== undefined) reads.set(id, { ...r, parts: [{ currency: 'GBP', amount: r.parts.reduce((sum, p) => sum + p.amount, 0) }] });
    return reads;
  };
  assert.ok((await faultsWhere(NO_HOME, summed)).some((why) => why.startsWith('cash-now adds GBP and USD up in GBP')));
  assert.ok((await faultsWhere(NO_HOME, onePart)).some((why) => /^cash-now says GBP \d+ where its rows hold 100000$/.test(why)));
  /* WITH THE RATE: the bare sum dressed as a converted amount, in the home currency. That is what the record holding the
     dollars written as pounds answers, so its answers are planted in place of the real ones. */
  const relabelled = readAll(await recordOf([POUNDS, DOLLARS_AS_POUNDS], rated));
  const dressed = await faultsWhere(rated, () => relabelled);
  assert.ok(dressed.some((why) => /^cash-now answers GBP \d+ where the rows converted hold \d+$/.test(why)), dressed.join('\n'));
  assert.ok(dressed.some((why) => why.startsWith('cash-now answers') && why.endsWith('the bare sum of GBP and USD')), dressed.join('\n'));
  assert.ok(dressed.some((why) => why.startsWith('runway-days answers') && why.endsWith('what the bare sum of GBP and USD answers')), dressed.join('\n'));
});
