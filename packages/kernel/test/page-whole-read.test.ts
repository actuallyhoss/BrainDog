/**
 * The grouped read a record hands a page (`pageDeps.whole`, PGS-B05 job c) answers what the walk answers.
 *
 * A block that adds up reads every row. Without a grouped read the page walks the list 500 rows at a time and groups
 * them itself (`wholeParts` in `pages.ts`); a record hands one grouped query in its place. Two readers of one list can
 * disagree without either being refused, so every test here draws the same block both ways over the same 301 rows, one
 * past what a block reads beside its whole and 101 past the old ceiling, and holds the two answers equal: a grouping by
 * day, a grouping by words where some rows hold none and some hold the empty word, money in two currencies with and
 * without a home currency, and rows that hold no amount.
 *
 * AND EACH ANSWER IS HELD AGAINST THE ROWS THEMSELVES, added up here, since two readers wrong the same way are equal.
 *
 * THE LAST TEST IS THE GRANT: a reader held to some of a list's rows is drawn her rows added up and no others.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { readBlock, type PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 9, 12);
const day = (back: number) => new Date(NOW - back * 86_400_000).toISOString().slice(0, 10);

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', index: true },
      { id: 'category', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'hours', type: 'decimal' },
      { id: 'cleared', type: 'bool' },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const ROWS = 301;
const DAYS = 40;
const CATEGORIES = ['Rent', 'Food', 'Travel'];
/** What row `n` is filed under: one in five under nothing, one in thirteen under the empty word, which is nothing too. */
const filed = (n: number): string | undefined => (n % 5 === 4 ? undefined : n % 13 === 0 ? '' : CATEGORIES[n % CATEGORIES.length]);
/** Row `n`'s amount: one in seven holds none, and every fourth of the rest is in dollars, so each word holds both. */
const paid = (n: number): { amount: number; currency: string } | undefined => (n % 7 === 6 ? undefined : { amount: 100 + n, currency: n % 4 === 0 ? 'USD' : 'EGP' });
/** The words row `n` is tagged with: one in three holds none. */
const tagged = (n: number): string[] | undefined => (n % 3 === 0 ? undefined : [n % 2 === 0 ? 'home' : 'work']);
const row = (n: number) => {
  const category = filed(n);
  const amount = paid(n);
  return {
    what: `Movement ${n}`,
    on: day(n % DAYS),
    ...(category === undefined ? {} : { category }),
    ...(amount === undefined ? {} : { amount }),
    hours: (n % 4) + 0.5,
    cleared: n % 2 === 0,
    ...(tagged(n) === undefined ? {} : { tags: tagged(n) }),
  };
};

const ALL = Array.from({ length: ROWS }, (_, n) => n);
type Part = { currency: string; amount: number };
/** Some rows' amounts added up here, one sum a currency, in the order of the currency's name. */
const added = (ns: readonly number[]): Part[] => {
  const sums = new Map<string, number>();
  for (const n of ns) {
    const a = paid(n);
    if (a) sums.set(a.currency, (sums.get(a.currency) ?? 0) + a.amount);
  }
  return [...sums].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency));
};
const sorted = (parts: readonly Part[] | undefined): Part[] => [...(parts ?? [])].sort((a, b) => a.currency.localeCompare(b.currency));
/** What one part says its rows add up to: its amounts a currency, or its one number in the one currency its rows hold. */
const said = (r: WholeRow | undefined): Part[] => (r?.parts ? sorted(r.parts) : r && r.value !== null && r.unit ? [{ currency: r.unit, amount: r.value }] : []);

type WholeRow = { label: unknown; rows: number; value: number | null; unit?: string; parts?: Part[]; of?: number | null };
type Whole = { rows: WholeRow[]; total: number | null; unit?: string | null; parts?: Part[]; converted?: unknown; of?: number | null };
type Answered = { rows?: unknown[]; matched?: number; refusals?: { code: string; fix: string; at?: string }[]; wholeRead?: Whole; fx?: { home: string | null; rates: unknown[] } };

/**
 * The page's reads with no grouped read among them, over the same record: the list is the record's own, so what is
 * walked is what the grouped query reads. `walked` counts the reads of the list, which is how a test knows it walked.
 */
const walking = (k: Kernel, fx?: Answered['fx']): { deps: PageDeps; walked: () => number } => {
  let walked = 0;
  const deps = {
    pages: () => [],
    metric: () => null,
    read: () => ({ ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'There is no such figure.' } }),
    list: (q: Record<string, unknown>) => {
      walked += 1;
      const out = k.list(q as never);
      return out.ok ? { ok: true, value: { rows: out.value.rows, matched: out.value.matched, cursor: out.value.cursor } } : out;
    },
    schemaOf: (register: string) => k.schemaOf(register),
    titleOf: () => 'what',
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: (register: string) => k.schemaOf(register), ...(fx ? { fx: () => fx } : {}) },
  } as unknown as PageDeps;
  return { deps, walked: () => walked };
};

/**
 * One block drawn both ways, and the two held equal: by the record (its one grouped query) and by the walk. Answers
 * the grouped one. THE RATES THE WALK CONVERTS BY ARE THE RECORD'S, as a bar or a split is handed them (`fx`); a kind that is
 * not handed them takes them from a bar read first.
 */
const both = (k: Kernel, block: Record<string, unknown>, fx?: Answered['fx']): Whole => {
  const decl = { source: 'register.ledger', ...block } as never;
  const grouped = k.block(decl) as Answered;
  assert.deepEqual(grouped.refusals, [], `the grouped read of a ${String(block.kind)} was refused`);
  assert.ok(grouped.wholeRead, `a ${String(block.kind)} answered no whole from the grouped read`);
  const { deps, walked } = walking(k, fx ?? grouped.fx);
  const walk = readBlock(deps, decl) as Answered;
  assert.deepEqual(walk.refusals, [], `the walk of a ${String(block.kind)} was refused`);
  assert.ok(walked() >= 2, 'the walk did not read the list beside its first rows, so the two answers are one reader twice');
  assert.deepEqual(grouped.wholeRead, walk.wholeRead, `a ${String(block.kind)} adds up differently in the database and in the walk`);
  assert.equal(grouped.matched, walk.matched);
  return grouped.wholeRead;
};

let k: Kernel;
let sql: NodeSql;

before(async () => {
  sql = openSqlite();
  k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([LEDGER]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const n of ALL) {
    const made = k.create('ledger', row(n), { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
    /* THE EMPTY WORD IS WRITTEN PAST `create`, which keeps none: a row an import or an older build left holding `""` is
       the row the grouped read and the walk could file apart, so it is put there as such a row holds it. */
    if (filed(n) === '') sql.db.prepare("UPDATE entry SET fields = json_set(fields, '$.category', '') WHERE id = ?").run(made.value.id);
  }
});
after(() => sql.close());

const BY_CATEGORY = [{ field: 'category' }, { field: 'amount' }];
const unfiled = ALL.filter((n) => filed(n) === undefined || filed(n) === '');

test('A LIST OF 301 ROWS IS ADDED UP WHOLE, and the grouped read and the walk say the same parts', () => {
  const w = both(k, { kind: 'bar', columns: BY_CATEGORY });
  assert.equal(w.rows.reduce((a, r) => a + r.rows, 0), ROWS, 'a row is in no part, or in two');
  /* TWO CURRENCIES AND NO HOME CURRENCY: one amount a currency, and no number that adds them. */
  assert.equal(w.total, null, 'two currencies were added into one number');
  assert.deepEqual(sorted(w.parts), added(ALL));
  for (const label of CATEGORIES) {
    const part = w.rows.find((r) => r.label === label);
    const ns = ALL.filter((n) => filed(n) === label);
    assert.equal(part?.rows, ns.length, `${label} holds a different number of rows`);
    assert.equal(part?.value, null);
    assert.deepEqual(sorted(part?.parts), added(ns), `${label} adds up differently from its rows`);
  }
});

test('ROWS FILED UNDER NOTHING ARE ONE PART, the rows with no word and the rows with the empty word together', () => {
  const w = both(k, { kind: 'bar', columns: BY_CATEGORY });
  assert.equal(w.rows.length, CATEGORIES.length + 1);
  const none = w.rows.filter((r) => r.label === null);
  assert.equal(none.length, 1, 'the empty word is a part of its own');
  assert.equal(none[0]!.rows, unfiled.length);
  assert.deepEqual(sorted(none[0]!.parts), added(unfiled));
  const held = sql.db.prepare("SELECT COUNT(*) AS n FROM entry WHERE json_extract(fields, '$.category') = ''").get() as { n: number };
  assert.equal(held.n, ALL.filter((n) => filed(n) === '').length, 'the premise: no row holds the empty word');
  /* AND COUNTED, where nothing is added: chips are the rows under each word. */
  const chips = both(k, { kind: 'chips', columns: [{ field: 'category' }] });
  assert.equal(chips.total, ROWS);
  assert.equal(chips.rows.find((r) => r.label === null)?.value, unfiled.length);
  assert.equal(chips.rows.find((r) => r.label === 'Food')?.value, ALL.filter((n) => filed(n) === 'Food').length);
});

test('A GROUPING BY DAY IS ONE PART A DAY, counted and added up, and a row with no amount is in the count alone', () => {
  const counted = both(k, { kind: 'heat', columns: [{ field: 'on' }] });
  assert.equal(counted.rows.length, DAYS);
  assert.equal(counted.total, ROWS);
  for (const part of counted.rows) assert.equal(part.value, ALL.filter((n) => day(n % DAYS) === part.label).length, `${String(part.label)} counts differently`);

  /* A BARE NUMBER ADDS UP TO ONE NUMBER A DAY. */
  const hours = both(k, { kind: 'heat', columns: [{ field: 'on' }, { field: 'hours' }] });
  assert.equal(hours.total, ALL.reduce((a, n) => a + (n % 4) + 0.5, 0));
  assert.equal(hours.rows.find((r) => r.label === day(3))?.value, ALL.filter((n) => n % DAYS === 3).reduce((a, n) => a + (n % 4) + 0.5, 0));

  /* MONEY A DAY, in two currencies: each day says its own amounts (the third day back holds pounds alone, so it is one number), and the days add up to the list's. */
  const money = both(k, { kind: 'heat', columns: [{ field: 'on' }, { field: 'amount' }] });
  assert.equal(money.total, null);
  assert.deepEqual(sorted(money.parts), added(ALL));
  const third = money.rows.find((r) => r.label === day(3));
  assert.deepEqual(said(third), added(ALL.filter((n) => n % DAYS === 3)));
});

test('A LABEL IS THE VALUE THE ROW HOLDS: a yes or no is true or false and a list is its words, never 1 or its JSON text', () => {
  const yesNo = both(k, { kind: 'chips', columns: [{ field: 'cleared' }] });
  assert.deepEqual(
    yesNo.rows.map((r) => [r.label, r.value]).sort((a, b) => Number(a[0]) - Number(b[0])),
    [
      [false, ALL.filter((n) => n % 2 !== 0).length],
      [true, ALL.filter((n) => n % 2 === 0).length],
    ],
  );
  const tags = both(k, { kind: 'bar', columns: [{ field: 'tags' }, { field: 'hours' }] });
  assert.equal(tags.rows.find((r) => Array.isArray(r.label) && r.label[0] === 'home')?.rows, ALL.filter((n) => tagged(n)?.[0] === 'home').length);
  assert.equal(tags.rows.find((r) => r.label === null)?.rows, ALL.filter((n) => tagged(n) === undefined).length);
  assert.ok(tags.rows.every((r) => typeof r.label !== 'string'), 'a list is drawn as its JSON text');
});

test('ONE SUM, A YES OR NO, AND A WHERE: a gauge, a progress and a narrowed split say the same both ways', () => {
  const gauge = both(k, { kind: 'gauge', columns: [{ field: 'what', label: 'Spent' }, { field: 'amount' }], target: 1_000_000 });
  assert.deepEqual(gauge.rows, []);
  assert.deepEqual(sorted(gauge.parts), added(ALL));

  const progress = both(k, { kind: 'progress', columns: [{ field: 'category' }, { field: 'cleared' }] });
  const food = progress.rows.find((r) => r.label === 'Food');
  assert.equal(food?.rows, ALL.filter((n) => filed(n) === 'Food').length);
  assert.equal(food?.value, ALL.filter((n) => filed(n) === 'Food' && n % 2 === 0).length);

  const cleared = ALL.filter((n) => n % 2 === 0);
  const split = both(k, { kind: 'split', where: 'cleared is true', columns: BY_CATEGORY });
  assert.equal(split.rows.reduce((a, r) => a + r.rows, 0), cleared.length);
  assert.deepEqual(sorted(split.parts), added(cleared));
});

test('WITH A HOME CURRENCY EACH AMOUNT IS CONVERTED AT ITS OWN DAY\'S RATE, and the sums a day convert to what the rows do', async () => {
  const other = openSqlite();
  const r = await openRecord(other, fixedClock(NOW));
  assert.ok((await r.install([LEDGER, FX])).ok);
  r.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(r.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  /* TWO RATES, the second from twenty days back, so the day an amount is dated decides what it is worth. */
  for (const [rate, back] of [[40, 60], [50, 20]] as const) assert.ok(r.create('fx', { currency: 'USD', base: 'EGP', rate, as_of: day(back) }, { actor: 'p_1' }).ok);
  for (const n of ALL) assert.ok(r.create('ledger', row(n), { actor: 'p_1' }).ok);

  const held = (r.block({ kind: 'bar', source: 'register.ledger', columns: BY_CATEGORY } as never) as Answered).fx;
  assert.equal(held?.home, 'EGP');
  const w = both(r, { kind: 'bar', columns: BY_CATEGORY });
  /* EVERY DOLLAR AT ITS OWN DAY'S RATE: 40 before the second rate's day, 50 from it on. */
  const home = (ns: readonly number[]): number =>
    ns.reduce((a, n) => {
      const p = paid(n);
      return a + (p === undefined ? 0 : p.currency === 'EGP' ? p.amount : p.amount * (n % DAYS > 20 ? 40 : 50));
    }, 0);
  assert.equal(w.unit, 'EGP');
  assert.equal(w.total, home(ALL), 'the list converts to a different sum from its rows');
  for (const label of CATEGORIES) assert.equal(w.rows.find((p) => p.label === label)?.value, home(ALL.filter((n) => filed(n) === label)), `${label} converts differently`);
  assert.ok(w.converted, 'a converted sum does not say it was converted');

  /* AND BY DAY, where the grouping and the dating are the same field. */
  const heat = both(r, { kind: 'heat', columns: [{ field: 'on' }, { field: 'amount' }] }, held);
  assert.equal(heat.total, home(ALL));
  other.close();
});

test('A READER HELD TO SOME OF A LIST IS HANDED HER ROWS ADDED UP, and nothing of a row past her grant', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
  /* A token of the owner's at `read` on the whole record, held to what is filed under Rent. */
  const narrowed: CallContext = {
    principal: { kind: 'token', id: 't_narrow', scope: 'read', person: 'p_1', level: 'owner' },
    wheres: { ledger: { field: 'category', is: 'Rent' } } as never,
    credentialed: true,
  };
  const page = {
    page: 'money',
    title: 'Money',
    blocks: [
      { kind: 'bar', key: 'went', heading: 'Where it went', source: 'register.ledger', columns: BY_CATEGORY },
      { kind: 'chips', key: 'filed', heading: 'Filed under', source: 'register.ledger', columns: [{ field: 'category' }] },
      { kind: 'heat', key: 'days', heading: 'By day', source: 'register.ledger', columns: [{ field: 'on' }, { field: 'hours' }] },
      { kind: 'heat', key: 'share', heading: 'Cleared, of the day', source: 'register.ledger', where: 'cleared is true', of: 'what is not Nothing', columns: [{ field: 'on' }] },
    ],
  };
  const installed = await api.kernel.install([LEDGER, { id: 'page.money', kind: 'page', body: page } as never]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const n of ALL) assert.ok(api.kernel.create('ledger', row(n), { actor: 'p_1' }).ok);
  const rent = ALL.filter((n) => filed(n) === 'Rent');

  type Page = { ok: boolean; value?: { blocks: (Answered & { key?: string })[] } };
  const read = async (ctx: CallContext) => {
    const out = (await api.page({ slug: 'money' }, ctx)) as Page;
    assert.ok(out.ok, JSON.stringify(out).slice(0, 400));
    return (key: string) => out.value!.blocks.find((b) => b.key === key)!;
  };

  /* THE PREMISE: the owner is handed the whole list, every word of it. */
  const whole = await read(owner);
  assert.deepEqual(sorted(whole('went').wholeRead?.parts), added(ALL));
  assert.equal(whole('filed').wholeRead?.total, ROWS);
  assert.ok(whole('share').wholeRead, 'the owner is handed no share a day');

  const hers = await read(narrowed);
  const went = hers('went');
  assert.deepEqual(went.refusals, []);
  assert.equal(went.matched, rent.length);
  assert.deepEqual(went.wholeRead?.rows.map((r) => r.label), ['Rent'], 'a part of the list she is not shown is on her page');
  assert.deepEqual(sorted(went.wholeRead?.parts), added(rent), 'her total is not her rows added up');
  assert.equal(went.wholeRead?.rows[0]?.rows, rent.length);

  const chips = hers('filed');
  assert.equal(chips.wholeRead?.total, rent.length);
  assert.deepEqual(chips.wholeRead?.rows, [{ label: 'Rent', rows: rent.length, value: rent.length }]);

  const days = hers('days');
  assert.equal(days.wholeRead?.total, rent.reduce((a, n) => a + (n % 4) + 0.5, 0));
  assert.equal(days.wholeRead?.rows.reduce((a, r) => a + r.rows, 0), rent.length);

  /* A SHARE OF THE DAY IS READ PAST HER ROWS (`of:` is each day's whole list), so that block is held from her whole. */
  const share = hers('share');
  assert.equal(share.wholeRead, undefined, 'a day\'s whole list was counted for a reader held to part of it');
  assert.equal(share.refusals?.[0]?.code, 'FORBIDDEN');

  /* AND NO WORD SHE IS NOT SHOWN, nor the list's own count, is anywhere on her page. */
  const said = JSON.stringify(await api.page({ slug: 'money' }, narrowed));
  for (const label of ['Food', 'Travel']) assert.ok(!said.includes(label), `${label} is on her page`);
  assert.ok(!said.includes(`"total":${ROWS}`) && !said.includes(`"matched":${ROWS}`), 'the count of the whole list is on her page');
});

/* LAST, SINCE IT ADDS ROWS: the tests above count the 301. */
test('A LINE WITH NO LABEL COUNTS UNDER THE ONE ITS SECOND FIELD NAMES (`or:`), only where that is a label a line holds', () => {
  const plain = both(k, { kind: 'bar', columns: BY_CATEGORY });
  const food = plain.rows.find((r) => r.label === 'Food')!.rows;
  const none = plain.rows.find((r) => r.label === null)!.rows;
  for (const what of ['19OCT26 FOOD', 'Somebody nobody files']) {
    const made = k.create('ledger', { what, on: day(1), amount: { amount: 500, currency: 'EGP' } }, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  const w = both(k, { kind: 'bar', columns: [{ field: 'category', or: 'what' }, { field: 'amount' }] });
  assert.equal(w.rows.find((r) => r.label === 'Food')?.rows, food + 1, 'the line whose words name Food is not under Food');
  assert.equal(w.rows.find((r) => r.label === null)?.rows, none + 1, 'a line naming nobody known left the rows that hold none');
  assert.equal(w.rows.filter((r) => typeof r.label === 'string' && !CATEGORIES.includes(r.label)).length, 0, 'a line made a label of its own words');
});
