/**
 * WHAT A RECORD LOOKS LIKE AS IT GROWS, which nothing had ever asserted.
 *
 * `loop/USABILITY.md` asks for this test by name: *"seed a record with 1 row, then 10, then 400, and
 * diff the rendered controls. What appears should appear because there is now something for it to
 * do."* A browser gate can count the controls; this covers the half where the bugs actually are —
 * the arithmetic underneath them, at sizes nothing has ever run at.
 *
 * The measurement that provoked it: between 38 rows and 528 rows the register gained 490 rows, 24,485
 * DOM nodes and **no new kind of control**. `ENOUGH_TO_SIFT = 8` is the only disclosure threshold in
 * the product, and after it fires nothing else ever appears.
 *
 * `ROWS` IS A MUTABLE EXPORT and this test puts it back. That is deliberate rather than convenient:
 * the thing under test is behaviour at a row count the seed does not have, and a fixture register
 * would be a second record whose declarations could drift from the real one — which is the whole
 * failure this file exists inside.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOM_CAP, columnsFor, list, search } from './api.ts';
import { NOW, REGISTERS, ROWS } from './data.ts';
import type { Entry } from './schema.ts';

/** The sizes, each one either a documented threshold or the far side of one. */
const SIZES = [1, 8, 20, 200, 300, 2_000, 5_000] as const;

/**
 * `n` rows shaped like the register's own, so `display()`, `sortRows` and `search` all have
 * something real to read. The values vary per row — a column of identical values proves nothing
 * about an order.
 */
function synthetic(register: string, n: number): Entry[] {
  const decl = REGISTERS[register]!;
  const out: Entry[] = [];
  for (let i = 1; i <= n; i++) {
    const fields: Record<string, unknown> = {};
    for (const f of decl.fields) {
      if (f.type === 'money') fields[f.id] = { amount: (i * 7919) % 1_000_000, currency: 'GBP' };
      else if (f.type === 'day') fields[f.id] = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      else if (f.type === 'enum') fields[f.id] = f.values![i % f.values!.length];
      else if (f.type === 'int' || f.type === 'decimal') fields[f.id] = i;
      else if (f.type === 'ref') continue;
      else fields[f.id] = `${f.id} ${i}`;
    }
    out.push({ seq: i, fields } as Entry);
  }
  return out;
}

const at = (register: string, n: number, run: () => void) => {
  const kept = ROWS[register];
  ROWS[register] = synthetic(register, n);
  try {
    run();
  } finally {
    ROWS[register] = kept!;
  }
};

test('a list never returns fewer rows than it says it holds', () => {
  for (const n of SIZES)
    at('obligations', n, () => {
      const got = list('obligations');
      assert.equal(got.total, n, `${n} rows: total is ${got.total}`);
      assert.equal(got.matched, n, `${n} rows: matched is ${got.matched}`);
      assert.equal(got.entries.length, n, `${n} rows: ${got.entries.length} came back`);
    });
});

test('the projection does not grow with the rows', () => {
  /* THE FACT AS IT IS TODAY, held so that changing it is a deliberate edit. `29 §3` T5 says a field
     non-empty on 80% of 20+ rows should be PROPOSED as a column — proposed, in the holding pen, not
     placed. So when that lands, `columnsFor` still answers the same and this test still passes; the
     day it starts answering differently is the day somebody has made the projection a function of
     the data without saying so. */
  const base = columnsFor('obligations').map((c) => c.field).join(',');
  for (const n of SIZES)
    at('obligations', n, () => {
      assert.equal(columnsFor('obligations').map((c) => c.field).join(','), base, `the columns moved at ${n} rows`);
    });
});

test('search answers within its limit and spreads across the lists', () => {
  for (const n of [200, 5_000] as const)
    at('obligations', n, () => {
      for (const limit of [8, 12, 50] as const) {
        const hits = search('what', limit);
        assert.ok(hits.length <= limit, `search(${limit}) returned ${hits.length}`);
        assert.ok(hits.length > 0, `search found nothing among ${n} rows`);
      }
    });
});

test('an order over five thousand rows is still an order', () => {
  at('obligations', 5_000, () => {
    const up = list('obligations', { sort: { field: 'amount', dir: 'asc' } }).entries;
    assert.equal(up.length, 5_000);
    for (let i = 1; i < up.length; i++) {
      const a = (up[i - 1]!.fields.amount as { amount: number }).amount;
      const b = (up[i]!.fields.amount as { amount: number }).amount;
      assert.ok(a <= b, `row ${i} is out of order: ${a} then ${b}`);
    }
  });
});

test('a filter over five thousand rows narrows to the rows it names', () => {
  at('obligations', 5_000, () => {
    const decl = REGISTERS.obligations!;
    const state = decl.fields.find((f) => f.id === decl.state)!;
    const value = state.values![0]!;
    const got = list('obligations', { filters: [{ field: state.id, op: 'in', values: [value] }] });
    assert.ok(got.matched > 0 && got.matched < 5_000, `matched ${got.matched} of 5,000`);
    assert.ok(
      got.entries.every((e) => e.fields[state.id] === value),
      'a row that does not match came back',
    );
    assert.equal(got.total, 5_000, 'total stopped being the list its own count');
  });
});


/* ── no list renders more than it admits to ──────────────────────────────── */

/**
 * EVERY SURFACE THAT DRAWS A RECORD LIST, AND THE CAP IT APPLIES.
 *
 * `13 §4.3` caps the DOM at 2,000 with a visible cap line and the register was the only screen that
 * had ever read that number — it held it as a private `const DOM_CAP = 2000`, so it was the
 * register's rule rather than the product's. A saved view is the same list with a different filter
 * and had no cap at all; `/audit` and Home's feed grow with WRITES rather than rows, which makes
 * them the longest lists on a record of any size; `/inbox` is where one bad ingest rule puts
 * thousands, and it is the screen you need at exactly that moment.
 *
 * The table is the guard. A route that starts drawing a record list and is not in it is not caught
 * — that wants a browser gate counting nodes per route at three record sizes, and it is filed — but
 * a route that has a cap and quietly loses it is, which is the regression this class actually has.
 */
const CAPPED: readonly (readonly [route: string, what: string])[] = [
  ['r/[register]/+page.svelte', 'the register grid and its phone cards'],
  ['v/[view]/+page.svelte', 'the saved view, which is the same list'],
  ['audit/+page.svelte', 'the log, which grows with writes'],
  ['inbox/+page.svelte', 'arrivals that matched no rule'],
  ['decide/+page.svelte', 'every decision ever taken'],
  ['t/[track]/+page.svelte', 'a track’s updates and its sessions'],
];

test('every list surface applies the cap, and there is one cap', () => {
  const routes = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes');
  for (const [route, what] of CAPPED) {
    const src = readFileSync(join(routes, route), 'utf8');
    assert.ok(src.includes('DOM_CAP'), `${route} draws ${what} and does not read the cap`);
    assert.ok(
      !/const DOM_CAP\s*=/.test(src),
      `${route} declares its own cap, so there are two numbers for one rule`,
    );
  }
  assert.equal(DOM_CAP, 2_000, '13 §4.3 gives the number, and it is 2,000');
});

test('and every capped list draws the line that says so', () => {
  /* A CAP WITHOUT A LINE IS THE DEFECT, NOT THE FIX. `13 §4.3` asks for "a visible cap line", and a
     list that silently stops at 2,000 is a list reporting a wrong answer confidently — which is the
     one thing this product must not do. `Table` draws its own; the four ledgers do not have one, so
     they render `CapLine` themselves. */
  const routes = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes');
  for (const route of ['audit/+page.svelte', 'inbox/+page.svelte', 'decide/+page.svelte', 't/[track]/+page.svelte']) {
    const src = readFileSync(join(routes, route), 'utf8');
    assert.ok(src.includes('<CapLine'), `${route} caps its list and never says so`);
  }
  for (const route of ['r/[register]/+page.svelte', 'v/[view]/+page.svelte']) {
    const src = readFileSync(join(routes, route), 'utf8');
    assert.ok(/cap=\{DOM_CAP\}/.test(src), `${route} slices to the cap and does not pass it to Table`);
  }
});

void NOW;
