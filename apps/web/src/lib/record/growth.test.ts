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

import { DOM_CAP, PAGE, columnsFor, list, search } from './api.ts';
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
/**
 * Every route, the list it draws, and the expression that has to be capped.
 *
 * THE THIRD COLUMN IS THE POINT. The first version of this asserted `src.includes('DOM_CAP')`, which
 * a surviving import satisfies — removing `/inbox`'s cap entirely, leaving only the unused import
 * and the `<CapLine>`, left the test green. A review that broke it on purpose found that out.
 * Naming the expression means the assertion is about the list being sliced rather than about the
 * word appearing in the file.
 */
const CAPPED: readonly (readonly [route: string, what: string, capped: RegExp])[] = [
  ['r/[register]/+page.svelte', 'the register grid and its phone cards', /entries\.slice\(0, DOM_CAP\)/],
  ['v/[view]/+page.svelte', 'the saved view, which is the same list', /result\.entries\.slice\(0, DOM_CAP\)/],
  ['audit/+page.svelte', 'the log, which grows with writes', /matched\.slice\(0, DOM_CAP\)/],
  ['inbox/+page.svelte', 'arrivals that matched no rule', /INBOX\.slice\(0, DOM_CAP\)/],
  ['decide/+page.svelte', 'every decision ever taken', /DECIDED\.slice\(0, DOM_CAP\)/],
  ['t/[track]/+page.svelte', 'a track’s updates and its sessions', /updates\.slice\(0, DOM_CAP\)/],
];

test('every list surface applies the cap, and there is one cap', () => {
  const routes = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes');
  for (const [route, what, capped] of CAPPED) {
    const src = readFileSync(join(routes, route), 'utf8');
    assert.match(src, capped, `${route} draws ${what} and the list itself is not capped`);
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
    /* The line has to be ABOUT the capped list, so it carries the count — a bare `<CapLine />` with
       no numbers would satisfy a substring check and say nothing. */
    assert.match(src, /<CapLine shown=\{[^}]+\} total=\{[^}]+\} \/>/, `${route} caps its list and never says so`);
  }
  for (const route of ['r/[register]/+page.svelte', 'v/[view]/+page.svelte']) {
    const src = readFileSync(join(routes, route), 'utf8');
    assert.ok(/cap=\{DOM_CAP\}/.test(src), `${route} slices to the cap and does not pass it to Table`);
  }
});


/* ── a page, and where the next one starts ───────────────────────────────── */

/**
 * `13 §4.3` GIVES THREE MECHANISMS AND THE TREE HAD ONE AND A HALF.
 *
 * Rowgroups: built. The cap line: built. The **200-row keyset pages**: absent — `list` took a filter
 * and a sort and returned every row, so `DOM_CAP` was not the end of a paging sequence, it was a
 * substitute for one. `Table` had declared an `onmore` prop and rendered a sentinel since it was
 * written, with no call site and no `IntersectionObserver` anywhere in the repo.
 *
 * What has to hold is that walking the cursor is the same answer, cut up: every row exactly once, in
 * the same order, with nothing repeated across a boundary and nothing dropped at one.
 */
test('walking the cursor yields the whole answer, once each, in order', () => {
  at('obligations', 5_000, () => {
    const whole = list('obligations', { sort: { field: 'amount', dir: 'asc' } }).entries.map((e) => e.seq);

    const walked: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = list('obligations', {
        sort: { field: 'amount', dir: 'asc' },
        limit: PAGE,
        ...(cursor === undefined ? {} : { cursor }),
      });
      assert.equal(page.stale, false, 'a cursor this walk produced did not resolve');
      assert.ok(page.entries.length <= PAGE, `a page held ${page.entries.length} rows`);
      walked.push(...page.entries.map((e) => e.seq));
      pages++;
      assert.ok(pages < 200, 'the walk did not terminate');
      if (page.cursor === null) break;
      cursor = page.cursor;
    }

    assert.deepEqual(walked, whole, 'the pages are not the answer');
    assert.equal(new Set(walked).size, walked.length, 'a row came back on two pages');
    assert.equal(pages, Math.ceil(whole.length / PAGE), `${pages} pages for ${whole.length} rows`);
  });
});

test('a page is capped at the contract ceiling, and no limit means the whole answer', () => {
  /* `33 §2`: `limit` 25 by default, 200 at most. A caller asking for more gets the ceiling rather
     than what it asked for, and a caller asking for nothing gets everything — which is what a count,
     a metric and a forecast read, and why paging is something a GRID does rather than the API. */
  at('obligations', 5_000, () => {
    assert.equal(list('obligations', { limit: 10_000 }).entries.length, PAGE);
    assert.equal(list('obligations', { limit: 1 }).entries.length, 1);
    assert.equal(list('obligations').entries.length, 5_000);
    assert.equal(list('obligations').cursor, null, 'the whole answer still offered a next page');
  });
});

test('a cursor from another answer is stale, not an empty page', () => {
  /**
   * THE ONE FAILURE THAT LOOKS LIKE SUCCESS. If the row a cursor names has left the answer — the
   * filter moved, the row was archived — returning `[]` is indistinguishable from reaching the end
   * of the list, and the grid would stop with two thirds of the rows unfetched and nothing on screen
   * saying so. `stale` makes the caller start again, which is what `50 §5.2` step 5 already requires
   * of a changed order.
   */
  at('obligations', 500, () => {
    const first = list('obligations', { limit: PAGE });
    assert.equal(first.stale, false);
    assert.ok(first.cursor !== null);

    /* The same cursor against an answer that cannot contain it. */
    const elsewhere = list('obligations', {
      limit: PAGE,
      cursor: first.cursor!,
      filters: [{ field: 'seq', op: 'is', values: ['-1'] }],
    });
    assert.equal(elsewhere.stale, true, 'a cursor that resolves to nothing reported a normal page');
    assert.deepEqual(elsewhere.entries, []);
    assert.equal(elsewhere.cursor, null);
  });
});

test('the cap is the end of the sequence, not a slice of it', () => {
  /* `DOM_CAP` is 2,000 and a page is 200, so the grid stops after ten pages — and the row it stops
     at has to be the two-thousandth of the answer, not the two-thousandth of a re-sliced one. */
  at('obligations', 5_000, () => {
    const whole = list('obligations').entries.map((e) => e.seq);
    const walked: number[] = [];
    let cursor: string | undefined;
    while (walked.length < DOM_CAP) {
      const page = list('obligations', { limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
      walked.push(...page.entries.map((e) => e.seq));
      if (page.cursor === null) break;
      cursor = page.cursor;
    }
    assert.equal(walked.length, DOM_CAP);
    assert.deepEqual(walked, whole.slice(0, DOM_CAP), 'the first 2,000 paged are not the first 2,000');
  });
});

void NOW;
