/**
 * A block that adds up reads the whole list (PGS-B05).
 *
 * `bar`, `chips`, `gauge`, `heat`, `progress` and `split` read 200 rows and were refused past that, so the Ledger's
 * "Where it went, 12 months" was dead from the day the Ledger held 201 rows. Each now answers `wholeRead`: its parts by
 * label, and a total over every row its `where` admits. The tests hold each kind's total against the list's own, on
 * 5,000 rows, which is twenty-five times the old ceiling.
 *
 * EACH TEST DRIVES A REAL RECORD, because the answer is about what the database holds and not about a page of it.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { WHOLE_MS, readBlock, wholeLate, type PageDeps, type WholeAsk } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/**
 * `wholeRead` IS HANDED ONLY WHERE `ANSWER_KEYS` LISTS IT (`handsWhole` in `pages.ts`), because the record takes an answer
 * off a held block by that list and by nothing else. `block-keys.ts` is not this job's file, so until it lists the key
 * these tests list it themselves, here and nowhere else; the two tests at the foot hold the gate and the hold.
 */
const key = (listed: boolean): void => {
  const keys = ANSWER_KEYS as string[];
  const at = keys.indexOf('wholeRead');
  if (listed && at < 0) keys.push('wholeRead');
  if (!listed && at >= 0) keys.splice(at, 1);
};
key(true);

/* A WEDNESDAY, so the twelve weeks a heat draws run from Monday 22 June to this day: eighty days. */
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
      { id: 'cleared', type: 'bool' },
    ],
  } as never,
};

const ROWS = 5000;
const CATEGORIES = ['Rent', 'Food', 'Travel', 'Tools', 'Tax', 'Gifts', 'Health'];
/** Row `n`: one in seven has no category, and every third is cleared. */
const row = (n: number) => ({
  what: `Movement ${n}`,
  on: day(n % 70),
  ...(n % 8 === 7 ? {} : { category: CATEGORIES[n % CATEGORIES.length] }),
  amount: { amount: 100 + n, currency: 'EGP' },
  cleared: n % 3 === 0,
});
const TOTAL = Array.from({ length: ROWS }, (_, n) => 100 + n).reduce((a, b) => a + b, 0);
const CLEARED = Array.from({ length: ROWS }, (_, n) => n).filter((n) => n % 3 === 0).length;

type Part = { currency: string; amount: number };
type Whole = {
  rows: { label: unknown; rows: number; value: number | null; unit?: string; parts?: Part[]; of?: number | null }[];
  total: number | null;
  unit?: string | null;
  parts?: Part[];
  of?: number | null;
};
type Answered = { rows?: unknown[]; matched?: number; refusals?: { code: string; fix: string; at?: string }[]; wholeRead?: Whole };

let k: Kernel;
let sql: NodeSql;

before(async () => {
  sql = openSqlite();
  k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([LEDGER]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (let n = 0; n < ROWS; n++) assert.ok(k.create('ledger', row(n), { actor: 'p_1' }).ok);
});
after(() => sql.close());

const read = (block: Record<string, unknown>): Answered & { wholeRead: Whole } => {
  const b = k.block({ source: 'register.ledger', ...block } as never) as Answered;
  assert.deepEqual(b.refusals, [], `a ${String(block.kind)} over ${ROWS} rows was refused`);
  assert.equal(b.matched, ROWS);
  assert.ok(b.wholeRead, `a ${String(block.kind)} answered no wholeRead`);
  return b as Answered & { wholeRead: Whole };
};
const sum = (w: Whole): number => w.rows.reduce((a, r) => a + (r.value ?? 0), 0);

const BY_CATEGORY = [{ field: 'category' }, { field: 'amount' }];

for (const kind of ['bar', 'split'])
  test(`A ${kind.toUpperCase()} OVER 5,000 ROWS ADDS UP TO THE LEDGER'S OWN TOTAL, and it was refused past 200`, () => {
    const { wholeRead: w } = read({ kind, columns: BY_CATEGORY, limit: 4 });
    assert.equal(w.total, TOTAL);
    assert.equal(w.unit, 'EGP');
    /* `limit:` CUTS WHAT IS DRAWN, never what is read: every category is a part, and the rows with none are one more. */
    assert.equal(w.rows.length, CATEGORIES.length + 1);
    assert.equal(sum(w), TOTAL, 'the parts do not add up to the total');
    assert.equal(w.rows.reduce((a, r) => a + r.rows, 0), ROWS);
    const none = w.rows.find((r) => r.label === null);
    assert.equal(none?.rows, ROWS / 8, 'the rows with no category are not a part of their own');
    /* THE LARGEST FIRST, as a figure's parts are. */
    const values = w.rows.map((r) => r.value ?? 0);
    assert.deepEqual(values, [...values].sort((a, b) => b - a));
  });

test('CHIPS COUNT EVERY ROW, by the first column', () => {
  const { wholeRead: w } = read({ kind: 'chips', columns: [{ field: 'category' }] });
  assert.equal(w.total, ROWS);
  assert.equal(sum(w), ROWS);
  assert.equal(w.unit ?? null, null);
});

test('A GAUGE IS ONE SUM OVER EVERY ROW, set against its target', () => {
  const { wholeRead: w } = read({ kind: 'gauge', columns: [{ field: 'what', label: 'Spent' }, { field: 'amount' }], target: 1_000_000 });
  assert.equal(w.total, TOTAL);
  assert.equal(w.unit, 'EGP');
  assert.deepEqual(w.rows, [], 'a gauge has one figure and no parts');
});

test('A PROGRESS BY A YES OR NO COUNTS THE YESES OF EVERY ROW, against all of them', () => {
  const { wholeRead: w } = read({ kind: 'progress', columns: [{ field: 'category' }, { field: 'cleared' }] });
  assert.equal(w.total, CLEARED);
  assert.equal(w.of, ROWS);
  assert.equal(sum(w), CLEARED);
  assert.equal(w.rows.reduce((a, r) => a + (r.of ?? 0), 0), ROWS);
});

test('A HEAT ADDS UP EACH DAY IN THE DATABASE, and its days add up to the total', () => {
  const { wholeRead: w } = read({ kind: 'heat', columns: [{ field: 'on' }, { field: 'amount' }] });
  assert.equal(w.total, TOTAL);
  assert.equal(w.rows.length, 70, 'one part a day');
  assert.equal(sum(w), TOTAL);
  assert.deepEqual(w.rows.map((r) => r.label), Array.from({ length: 70 }, (_, n) => day(69 - n)), 'the days are not oldest first');
});

test('THE WHERE STILL NARROWS IT, and the total is of what it admits', () => {
  const b = k.block({ kind: 'bar', source: 'register.ledger', where: 'cleared is true', columns: BY_CATEGORY } as never) as Answered;
  assert.deepEqual(b.refusals, []);
  assert.equal(b.matched, CLEARED);
  const expected = Array.from({ length: ROWS }, (_, n) => n).filter((n) => n % 3 === 0).reduce((a, n) => a + 100 + n, 0);
  assert.equal(b.wholeRead?.total, expected);
});

test('A BLOCK WHOSE COLUMNS NAME NOTHING TO ADD UP HAS NO WHOLE, and past one read of its rows it still says so', () => {
  /* A BAR SIZED BY A TEXT COLUMN: nothing here adds it up, so 200 of 5,000 rows handed on in silence would be the old fault. */
  const b = k.block({ kind: 'bar', source: 'register.ledger', columns: [{ field: 'category' }, { field: 'what' }] } as never) as Answered;
  assert.equal(b.wholeRead, undefined);
  assert.equal(b.refusals?.[0]?.code, 'OUT_OF_BOUNDS', 'the first 200 rows of 5,000 were handed to be added up');
  assert.deepEqual(b.rows, []);
  /* AND A LIST THAT FITS ONE READ IS DRAWN AS IT WAS, from its rows. */
  const few = k.block({ kind: 'bar', source: 'register.ledger', where: 'what is "Movement 7"', columns: [{ field: 'category' }, { field: 'what' }] } as never) as Answered;
  assert.deepEqual(few.refusals, []);
  assert.equal(few.rows?.length, 1);
});

test('THE PAGE ANSWERS WELL INSIDE A SECOND', () => {
  const started = performance.now();
  read({ kind: 'bar', columns: BY_CATEGORY });
  const took = performance.now() - started;
  assert.ok(took < 1000, `a bar over ${ROWS} rows took ${Math.round(took)} ms`);
});

test('TWO CURRENCIES ARE NEVER ADDED: with no home currency each part and the total say one amount a currency', async () => {
  const other = openSqlite();
  const r = await openRecord(other, fixedClock(NOW));
  assert.ok((await r.install([LEDGER])).ok);
  for (let n = 0; n < 300; n++)
    assert.ok(r.create('ledger', { what: `M ${n}`, on: day(n % 30), category: n % 2 ? 'Rent' : 'Food', amount: { amount: 10, currency: n % 3 ? 'EGP' : 'USD' } }, { actor: 'p_1' }).ok);
  const b = r.block({ kind: 'bar', source: 'register.ledger', columns: BY_CATEGORY } as never) as Answered;
  assert.deepEqual(b.refusals, []);
  const w = b.wholeRead!;
  assert.equal(w.total, null, 'two currencies were added into one number');
  assert.deepEqual(w.parts, [{ currency: 'EGP', amount: 2000 }, { currency: 'USD', amount: 1000 }]);
  for (const part of w.rows) {
    assert.equal(part.value, null);
    assert.equal(part.parts?.length, 2);
  }
  other.close();
});

test('THE BOUND IS TIME: a whole read past 250 ms is refused with the sentence that says to narrow it', () => {
  assert.equal(WHOLE_MS, 250);
  assert.equal(wholeLate(250), null);
  const late = wholeLate(251);
  assert.equal(late?.code, 'OUT_OF_BOUNDS');
  assert.equal(late?.at, 'where');
  assert.match(String(late?.fix), /Narrow this with a where/u);
});

test('A HOST THAT HANDS ONE GROUPED READ IS ASKED ONCE, and the list is not walked', () => {
  const asked: WholeAsk[] = [];
  let listed = 0;
  const schema = k.schemaOf('ledger');
  assert.ok(schema);
  const deps = {
    pages: () => [],
    metric: () => null,
    read: () => ({ ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'There is no such figure.' } }),
    list: () => {
      listed += 1;
      return { ok: true, value: { rows: [], matched: 3, cursor: null } };
    },
    schemaOf: () => schema,
    titleOf: () => 'what',
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => schema },
    whole: (q: WholeAsk) => {
      asked.push(q);
      return {
        ok: true,
        value: [
          { by: ['Rent'], unit: 'EGP', day: null, sum: 700, rows: 2, said: 2 },
          { by: ['Food'], unit: 'EGP', day: null, sum: 50, rows: 1, said: 1 },
        ],
      };
    },
  } as unknown as PageDeps;
  const b = readBlock(deps, { kind: 'bar', source: 'register.ledger', columns: BY_CATEGORY } as never) as Answered;
  assert.deepEqual(b.refusals, []);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], { register: 'ledger', where: undefined, by: [{ field: 'category' }], value: 'amount', dated: null });
  assert.equal(listed, 1, 'the list was walked beside the grouped read');
  assert.deepEqual(b.wholeRead, {
    rows: [
      { label: 'Rent', rows: 2, value: 700, unit: 'EGP' },
      { label: 'Food', rows: 1, value: 50, unit: 'EGP' },
    ],
    total: 750,
    unit: 'EGP',
  });
});

test('WHERE ANSWER_KEYS DOES NOT LIST IT NO WHOLE READ IS HANDED, and a block past 200 rows is refused as it was', () => {
  key(false);
  try {
    const b = k.block({ kind: 'bar', source: 'register.ledger', columns: BY_CATEGORY } as never) as Answered;
    assert.equal(b.wholeRead, undefined, 'a whole read was handed under a key the record does not take off a held block');
    assert.equal(b.refusals?.[0]?.code, 'OUT_OF_BOUNDS', 'the first 200 rows of 5,000 were handed to be added up');
    assert.deepEqual(b.rows, []);
    /* AND A HEAT'S `of:` IS READ BY THE WHOLE READ ALONE, so without one it is a key the block would draw without. */
    const heat = k.block({ kind: 'heat', source: 'register.ledger', where: 'cleared is true', of: 'category is Rent', columns: [{ field: 'on' }] } as never) as Answered;
    assert.equal(heat.refusals?.[0]?.code, 'DECLARATION_INVALID');
    assert.equal(heat.refusals?.[0]?.at, 'of');
  } finally {
    key(true);
  }
});

test('A BLOCK HELD FROM A READER KEEPS NO WHOLE READ: a member who may not read the Ledger is handed no label and no total', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  const NOTES = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } } as never;
  const bar = { kind: 'bar', heading: 'Where it went', source: 'register.ledger', columns: BY_CATEGORY };
  const page = { id: 'page.money', kind: 'page', body: { page: 'money', title: 'Money', blocks: [{ kind: 'table', source: 'register.notes', columns: [{ field: 'what' }] }, bar] } } as never;
  assert.ok((await api.kernel.install([LEDGER, NOTES, page])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.create({ register: 'ledger', fields: { what: 'October rent', category: 'Rent', amount: { amount: 612_345, currency: 'EGP' } } }, owner)).ok);
  assert.ok((await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read' } }, owner)).ok);
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  type Page = { ok: boolean; value?: { blocks: Answered[] } };
  const mine = (await api.page({ slug: 'money' }, owner)) as Page;
  assert.equal(mine.value?.blocks[1]?.wholeRead?.total, 612_345, 'the premise: the owner is handed the whole');
  const hers = (await api.page({ slug: 'money' }, wren)) as Page;
  assert.ok(hers.ok, JSON.stringify(hers));
  const shell = hers.value!.blocks[1]!;
  assert.equal(shell.refusals?.[0]?.code, 'FORBIDDEN');
  assert.equal(shell.wholeRead, undefined, 'the held block kept the whole read');
  assert.ok(!JSON.stringify(hers).includes('612345') && !JSON.stringify(hers).includes('Rent'), 'the Ledger\'s total or a label is on her page');
});
