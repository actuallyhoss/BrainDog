/**
 * WHAT A RECORD LOOKS LIKE AS IT GROWS, which nothing had ever asserted.
 *
 * The ask, word for word: *"seed a record with 1 row, then 10, then 400, and
 * diff the rendered controls. What appears should appear because there is now something for it to
 * do."* A browser gate can count the controls; this covers the half where the bugs actually are —
 * the arithmetic underneath them, at sizes nothing has ever run at.
 *
 * The measurement that provoked it: between 38 rows and 528 rows the register gained 490 rows, 24,485
 * DOM nodes and **no new kind of control**. `ENOUGH_TO_SIFT = 8` is the only disclosure threshold in
 * the product, and after it fires nothing else ever appears.
 *
 * THE LIST ITSELF IS A RECORD GROWN TO EACH SIZE, under the seed's own declaration of obligations,
 * because the thing under test is behaviour at a row count the seed does not have, and a list the
 * record does not hold is not what a grid pages through (see "a record at each size" below). The
 * projection and the search still read `held.ts`'s `ROWS`, a mutable export, so those two swap it
 * for rows at each size and put it back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { DOM_CAP, PAGE, columnsFor } from './api.ts';
import { search } from './fixtures/readers.ts';
import { NOW, REGISTERS } from './fixtures/sample.ts';
import { ROWS } from './held.ts';
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

/* ── a record at each size ───────────────────────────────────────────────── */

/**
 * A RECORD THAT GROWS, AND THE SAMPLE CANNOT. The list tests below swapped the fixture's `ROWS` for rows at each size and
 * asked the fixture's `list`, which answered out of those rows. Since the app has had one engine the fixture's `list` asks a kernel seeded
 * once and never written to (`fixtures/readers.ts`), so a swapped `ROWS` reaches nothing and every size answered the
 * seed's own. What a grid pages through on a live tab is the record's `list` (`data/record.ts` `ask`, a page of `PAGE`
 * at a time on the record's cursor), so that is what is grown and asked here.
 *
 * THE LIST IS SHAPED LIKE OBLIGATIONS, its declaration as the seed installs it with the links left out (a link needs a
 * row at the other end, and what is measured is the size of one list), under its own name, so no seeded row is in it.
 */
type Sql = Parameters<typeof openRecord>[0];
function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Sql;
}

const GROWN = 'growth';
type Field = { id: string; type: string; values?: string[] };
const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok, 'the seed did not install');
  const d = (k.declarations() as { id: string; body: string | Record<string, unknown> }[]).find((x) => x.id === 'register.obligations');
  assert.ok(d, 'the seed no longer declares obligations');
  const body = (typeof d.body === 'string' ? JSON.parse(d.body) : d.body) as { fields: Field[] };
  const fields = body.fields.filter((f) => f.type !== 'ref');
  const installed = await k.install([{ id: `register.${GROWN}`, kind: 'register', body: { ...body, id: GROWN, name: 'Growth', fields } as never }]);
  assert.ok(installed.ok, JSON.stringify(installed));
  return { k, fields, held: 0 };
})();

/** The grown record, holding at least `n` rows written the way `synthetic` shapes them, one transaction a growth. */
async function grownTo(n: number): Promise<Kernel> {
  const r = await record;
  if (r.held >= n) return r.k;
  r.k.transaction(() => {
    for (let i = r.held + 1; i <= n; i++) {
      const fields: Record<string, unknown> = {};
      for (const f of r.fields) {
        if (f.type === 'money') fields[f.id] = { amount: (i * 7919) % 1_000_000, currency: 'GBP' };
        else if (f.type === 'day') fields[f.id] = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
        else if (f.type === 'enum') fields[f.id] = f.values![i % f.values!.length];
        else if (f.type === 'int' || f.type === 'decimal') fields[f.id] = i;
        else if (f.type === 'text') fields[f.id] = `${f.id} ${i}`;
      }
      const made = r.k.create(GROWN, fields, { actor: 'p_owner' });
      assert.ok(made.ok, JSON.stringify(made));
    }
  });
  r.held = n;
  return r.k;
}

type Page = { rows: { seq: number | null; fields: Record<string, unknown> }[]; matched: number; cursor: string | null };
const pageOf = (k: Kernel, q: Parameters<Kernel['list']>[0]): Page => {
  const out = k.list(q);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as Page;
};

/** Every page of one question, `PAGE` rows at a time as a grid asks, each page's `matched` beside it. */
function walked(k: Kernel, q: Omit<Parameters<Kernel['list']>[0], 'limit' | 'cursor'>, most = Infinity): { seqs: number[]; pages: Page[] } {
  const seqs: number[] = [];
  const pages: Page[] = [];
  let cursor: string | null = null;
  do {
    const page = pageOf(k, { ...q, limit: PAGE, ...(cursor === null ? {} : { cursor }) });
    assert.ok(page.rows.length <= PAGE, `a page held ${page.rows.length} rows`);
    seqs.push(...page.rows.map((r) => r.seq!));
    pages.push(page);
    assert.ok(pages.length < 200, 'the walk did not terminate');
    cursor = page.cursor;
  } while (cursor !== null && seqs.length < most);
  return { seqs, pages };
}

test('a list never returns fewer rows than it says it holds', async () => {
  for (const n of SIZES) {
    const k = await grownTo(n);
    const { seqs, pages } = walked(k, { register: GROWN });
    for (const p of pages) assert.equal(p.matched, n, `${n} rows: matched is ${p.matched}`);
    assert.equal(seqs.length, n, `${n} rows: ${seqs.length} came back`);
    assert.equal(new Set(seqs).size, n, `${n} rows: a row came back on two pages`);
  }
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
        const found = search('what', limit);
        assert.ok(found.hits.length <= limit, `search(${limit}) returned ${found.hits.length}`);
        assert.ok(found.hits.length > 0, `search found nothing among ${n} rows`);
        /* AND IT SAYS WHAT IT DID NOT RETURN. The palette caps at twelve and the record holds
           thousands; a hit list that cannot report its own total is a list nobody can page past. */
        assert.ok(found.total >= found.hits.length, `total ${found.total} < hits ${found.hits.length}`);
      }
    });
});

test('an order over five thousand rows is still an order', async () => {
  const k = await grownTo(5_000);
  const up: number[] = [];
  let cursor: string | null = null;
  do {
    const page = pageOf(k, { register: GROWN, order: [{ field: 'amount', dir: 'asc' }], limit: PAGE, ...(cursor === null ? {} : { cursor }) });
    up.push(...page.rows.map((r) => (r.fields.amount as { amount: number }).amount));
    cursor = page.cursor;
  } while (cursor !== null);
  assert.equal(up.length, 5_000);
  for (let i = 1; i < up.length; i++) assert.ok(up[i - 1]! <= up[i]!, `row ${i} is out of order: ${up[i - 1]} then ${up[i]}`);
});

test('a filter over five thousand rows narrows to the rows it names', async () => {
  const k = await grownTo(5_000);
  const decl = REGISTERS.obligations!;
  const state = decl.fields.find((f) => f.id === decl.state)!;
  const value = state.values![0]!;
  const { seqs, pages } = walked(k, { register: GROWN, where: { field: state.id, is: value } as never });
  const matched = pages[0]!.matched;
  assert.ok(matched > 0 && matched < 5_000, `matched ${matched} of 5,000`);
  assert.equal(seqs.length, matched, 'the pages are not the rows the filter said it matched');
  assert.ok(
    pages.every((p) => p.rows.every((r) => r.fields[state.id] === value)),
    'a row that does not match came back',
  );
  assert.equal(pageOf(k, { register: GROWN, limit: 1 }).matched, 5_000, 'the list stopped being its own count');
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
  /* TWO BODIES, TWO ASSERTIONS. The register is the only route with both a grid and a card list, and
     one regex matching "either of them is sliced" was satisfied by whichever survived: uncapping the
     grid alone left this green, and uncapping the cards alone did too. Only uncapping both went red,
     which is the one state nobody would ever reach by accident. */
  ['r/[register]/+page.svelte', 'the register grid', /toRows\(id, result\.entries\.slice\(0, DOM_CAP\)/],
  ['r/[register]/+page.svelte', 'the register’s phone cards', /<ListCards[^>]*entries=\{result\.entries\.slice\(0, DOM_CAP\)\}/],
  /* AND THE SAVED VIEW'S TWO, WHICH ARE ONE SLICE READ TWICE, so the guard has to name the binding
     rather than the holder. This row said `result.entries.slice(0, DOM_CAP)` until the live half
     landed and the answer stopped being called `result`: the cap never moved, the spelling did, and
     the test went red on a rename. A guard that fails on a rename is a guard reporting something
     other than the rule, so what is pinned now is that SOME name is the entries sliced to the cap
     and that THAT name is what each body draws, which is `13 §4.3`'s sentence and not this file's
     vocabulary. The backreference is the whole point: with `\1` replaced by `\w+` both rows stay
     green while the cards are handed the uncapped list, which is the state the register's own pair
     of rows exists to catch. */
  ['v/[view]/+page.svelte', 'the saved view’s grid', /(\w+) = \$derived\(entries\.slice\(0, DOM_CAP\)\)[\s\S]*toRows\(register, \1,/],
  ['v/[view]/+page.svelte', 'the saved view’s phone cards', /(\w+) = \$derived\(entries\.slice\(0, DOM_CAP\)\)[\s\S]*<RowCards[^>]*entries=\{\1\}/],
  ['audit/+page.svelte', 'the log, which grows with writes', /lines = \$derived\(sameMinute\(rolledRuns\(burstsOf\(matched[\s\S]*lines\.slice\(0, Math\.min\(wanted, DOM_CAP\)\)/],
  ['inbox/+page.svelte', 'arrivals that matched no rule', /INBOX\.slice\(0, DOM_CAP\)/],
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
  for (const route of ['audit/+page.svelte', 'inbox/+page.svelte']) {
    const src = readFileSync(join(routes, route), 'utf8');
    /* The line has to be ABOUT the capped list, so it carries the count — a bare `<CapLine />` with
       no numbers would satisfy a substring check and say nothing. */
    assert.match(src, /<CapLine shown=\{[^}]+\} total=\{[^}]+\} \/>/, `${route} caps its list and never says so`);
  }
  const table = readFileSync(join(routes, 'r/[register]/parts/ListTable.svelte'), 'utf8');
  assert.ok(/cap=\{DOM_CAP\}/.test(table), 'r/[register]/parts/ListTable.svelte slices to the cap and does not pass it to Table');
  /* A SAVED VIEW DRAWS THE LIST'S OWN TABLE (money F10), so the cap reaches `Table` through
     `ListTable` above, over rows the view has sliced to the same cap. */
  const view = readFileSync(join(routes, 'v/[view]/+page.svelte'), 'utf8');
  assert.match(view, /<ListTable\b/, 'v/[view]/+page.svelte draws a table of its own and not the list\'s');
  assert.match(view, /entries\.slice\(0, DOM_CAP\)/, 'v/[view]/+page.svelte does not slice to the cap');
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
/** THE MOST ROWS ONE `list` CALL ANSWERS, which is the record's own ceiling (`limit` in the kernel's `list`). */
const RECORD_CEILING = 500;

/** The whole answer to one question in the fewest calls the record allows, `RECORD_CEILING` rows at a time. */
function whole(k: Kernel, q: Omit<Parameters<Kernel['list']>[0], 'limit' | 'cursor'>): number[] {
  const seqs: number[] = [];
  let cursor: string | null = null;
  do {
    const page = pageOf(k, { ...q, limit: RECORD_CEILING, ...(cursor === null ? {} : { cursor }) });
    seqs.push(...page.rows.map((r) => r.seq!));
    cursor = page.cursor;
  } while (cursor !== null);
  return seqs;
}

test('walking the cursor yields the whole answer, once each, in order', async () => {
  const k = await grownTo(5_000);
  const q = { register: GROWN, order: [{ field: 'amount', dir: 'asc' as const }] };
  const all = whole(k, q);
  const { seqs, pages } = walked(k, q);
  assert.equal(all.length, 5_000);
  assert.deepEqual(seqs, all, 'the pages are not the answer');
  assert.equal(new Set(seqs).size, seqs.length, 'a row came back on two pages');
  assert.equal(pages.length, Math.ceil(all.length / PAGE), `${pages.length} pages for ${all.length} rows`);
});

test('a page is capped at the record\'s ceiling, and the grid\'s page is inside it', async () => {
  /* A CALLER ASKING FOR MORE GETS THE CEILING rather than what it asked for, and says where the rest starts. This held
     `33 §2`'s 200 and a whole answer for no `limit`, which were the fixture's own paging over its rows; the record is
     what a grid pages through now, with its own ceiling, and a count reads `matched` rather than every row. */
  const k = await grownTo(5_000);
  const most = pageOf(k, { register: GROWN, limit: 10_000 });
  assert.equal(most.rows.length, RECORD_CEILING);
  assert.ok(most.cursor !== null, 'a page cut at the ceiling offered no next page');
  assert.equal(pageOf(k, { register: GROWN, limit: 1 }).rows.length, 1);
  assert.ok(PAGE <= RECORD_CEILING, 'the grid asks for a page the record would cut short');
  assert.equal(pageOf(k, { register: GROWN, limit: PAGE }).rows.length, PAGE);
});

test('a cursor from another answer is refused, not an empty page', async () => {
  /**
   * THE ONE FAILURE THAT LOOKS LIKE SUCCESS. If a cursor is read against an answer it was not minted
   * for, returning `[]` is indistinguishable from reaching the end of the list, and the grid would
   * stop with two thirds of the rows unfetched and nothing on screen saying so. The record refuses
   * it, which makes the caller start again, as `50 §5.2` step 5 already requires of a changed order.
   * The fixture's list said `stale` for this; the record says it with a refusal.
   */
  const k = await grownTo(5_000);
  const up = pageOf(k, { register: GROWN, order: [{ field: 'amount', dir: 'asc' }], limit: PAGE });
  assert.ok(up.cursor !== null);

  /* The same cursor against an answer in another order, and against the record's own order. */
  const down = k.list({ register: GROWN, order: [{ field: 'amount', dir: 'desc' }], limit: PAGE, cursor: up.cursor });
  assert.ok(!down.ok, 'a cursor from the ascending answer paged the descending one');
  const unsorted = k.list({ register: GROWN, limit: PAGE, cursor: up.cursor });
  assert.ok(!unsorted.ok, 'a cursor from a sorted answer paged the unsorted one');
  const junk = k.list({ register: GROWN, limit: PAGE, cursor: 'junk' });
  assert.ok(!junk.ok, 'a cursor the record never minted paged from the start');
});

test('the cap is the end of the sequence, not a slice of it', async () => {
  /* `DOM_CAP` is 2,000 and a page is 200, so the grid stops after ten pages — and the row it stops
     at has to be the two-thousandth of the answer, not the two-thousandth of a re-sliced one. */
  const k = await grownTo(5_000);
  const all = whole(k, { register: GROWN });
  const { seqs } = walked(k, { register: GROWN }, DOM_CAP);
  assert.equal(seqs.length, DOM_CAP);
  assert.deepEqual(seqs, all.slice(0, DOM_CAP), 'the first 2,000 paged are not the first 2,000');
});
