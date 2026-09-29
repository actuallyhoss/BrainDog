/**
 * What the projects earn: the figures the Portfolio Overview draws, read two ways over the same rows.
 *
 * THE PAGE ABOUT THE BUSINESSES DREW NO MONEY. `things.revenue` has been declared since the register
 * was written and the Overview's blocks were a count, a split, cards, four tables and a fold: eight
 * blocks and not one of them a sum of money. The figures below are what the page draws now, and this
 * file is the differential over them.
 *
 * READ TWICE, AS `metrics.test.ts` READS EVERY DECLARED FIGURE. The kernel compiles each predicate to
 * SQL and runs one aggregate; the walk here adds the seed's own `THINGS` rows up in TypeScript, with
 * no predicate parser anywhere in it. The two share a declaration and a set of rows and nothing else,
 * so a disagreement names one of them as wrong. The sweep in `metrics.test.ts` covers these three
 * already because it walks every entry in `METRICS`; this file says what the numbers ARE, which the
 * sweep cannot, because both of its sides are computed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type MetricDecl } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { METRICS, NOW, PAGES, THINGS, installSeed } from '../src/index.ts';

async function seeded(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql };
}

/** A project somebody is working on, which is the set every figure on the Overview is over. */
const live = () => THINGS.filter((t) => t.lane === 'building' || t.lane === 'earning');

/** What one money field on those projects comes to, walked in TypeScript over the seed's own rows. */
const walked = (field: string): number =>
  live().reduce((total, t) => total + ((t[field] as { amount: number } | undefined)?.amount ?? 0), 0);

type Block = { kind: string; heading?: string; source?: string; columns?: { field?: string }[]; cells?: { metric?: string; note?: string }[] };
const blocksOf = (slug: string): Block[] => (PAGES[slug]!.blocks as unknown as Block[]) ?? [];

/* ── the page draws it ───────────────────────────────────────────────────── */

test('THE PORTFOLIO OVERVIEW DRAWS WHAT THE PROJECTS EARN, in a figure and in a block over the rows', () => {
  const blocks = blocksOf('portfolio');

  const cells = blocks.flatMap((b) => (b.cells ?? []).map((c) => c.metric ?? ''));
  assert.ok(cells.includes('projects-earning'), 'no tile on the Overview says what the projects earn in a year');
  assert.ok(cells.includes('projects-earning-change'), 'no tile on the Overview compares the year with the year before');

  /* THE BAR AND THE CARD ARE ASKED FOR SEPARATELY, because one assertion over every block passed
     while the bar was gutted: the `In play` cards also carry a `revenue` column, so "some block
     draws revenue" was answered by the cards alone and the block that puts one project's money
     against another's could be deleted with this file still green. */
  const draws = (kind: string) => blocks.filter((b) => b.kind === kind && (b.columns ?? []).some((c) => c.field === 'revenue'));
  /* A SPLIT SINCE portfolio 1.6.0, one track cut into each project's share, where it was a bar a project: the same two
     columns over the same rows, drawn as parts of one whole. */
  assert.equal(draws('split').length, 1, 'no track on the Overview puts one project’s money against another’s, so the page says a total and nothing under it');
  assert.equal(draws('cards').length, 1, 'the In play cards do not say what a project earns, so the money on the page is a total nobody can attribute');

  /* EVERY ONE OF THEM STILL READS PROJECTS ALONE. The pack needs nothing (`first-party.test.ts` holds
     `portfolio` to `requires: []`), so a money block sourced from the ledger would be a page the
     Overview could not open on a record that keeps only projects. */
  for (const b of blocks)
    if (typeof b.source === 'string' && b.source.startsWith('register.'))
      assert.equal(b.source, 'register.things', `${b.heading ?? b.kind} reads ${b.source}, and the Overview reads Projects alone`);
});

test("and each figure is money in the record's own currency, because a sum with no currency is not money", () => {
  for (const id of ['projects-earning', 'projects-earning-before', 'projects-earning-change']) {
    const decl = METRICS[id];
    assert.ok(decl, `${id} is not declared`);
    assert.equal(decl.format, 'money', `${id} is drawn as ${decl.format}, and a money figure is added up in the record's own currency`);
    assert.equal(decl.source, 'register.things', `${id} reads ${decl.source}, and the Portfolio pack may read Projects alone`);
  }
});

/* ── the two readings agree ──────────────────────────────────────────────── */

test('EACH FIGURE READS THE SAME IN SQL AND IN THE ROWS, and the rows are the seed’s own', async () => {
  const { k, sql } = await seeded();

  const year = walked('revenue');
  const before = walked('earned_before');
  assert.ok(year > 0 && before > 0, 'a sample where nothing earns anything cannot show what the page is for');

  const read = (id: string) => {
    const out = k.metric(METRICS[id] as MetricDecl);
    assert.ok(out.ok, `${id}: ${sayOf(out)}`);
    return out.value;
  };

  const earning = read('projects-earning');
  assert.equal(earning.value, year, `projects-earning: SQL says ${earning.value} and the walk says ${year}`);
  assert.equal(earning.unit, 'GBP');

  const earlier = read('projects-earning-before');
  assert.equal(earlier.value, before, `projects-earning-before: SQL says ${earlier.value} and the walk says ${before}`);
  assert.equal(earlier.unit, 'GBP');

  /* THE COMPARISON IS THE TWO HALVES OVER ONE SET OF ROWS, one less the other, which is why it is a
     `diff:` and not a subtraction done on the page: a page that subtracts two tiles has no way to
     refuse when the two are in different currencies, and the kernel's pair arithmetic does. */
  const change = read('projects-earning-change');
  assert.equal(change.value, year - before, `projects-earning-change: SQL says ${change.value} and the walk says ${year - before}`);
  assert.equal(change.unit, 'GBP');

  sql.close();
});

/* ── a figure over two currencies is not a number ────────────────────────── */

test('A PROJECT EARNING IN ANOTHER CURRENCY IS NEVER ADDED TO THE REST, which is the whole point of the money type', async () => {
  /* Kiln, Marlow & Co and Portage all earn in GBP in the sample, so the figure above is one number.
     Put one of them in USD and the record has two currencies and no rate between them, and the only
     honest answers are a refusal or one amount per currency. A bare number would be the failure:
     1,840,000 pence plus 4,200 dollars read as one total. */
  const { k, sql } = await seeded();

  const gbpOnly = k.metric(METRICS['projects-earning'] as MetricDecl);
  assert.ok(gbpOnly.ok, sayOf(gbpOnly));
  const total = gbpOnly.value.value;

  const moved = k.update('things', 'things#2', { revenue: { amount: 420_000, currency: 'USD' } }, { actor: 'p_seed' });
  assert.ok((moved as { ok: boolean }).ok, sayOf(moved));

  const mixed = k.metric(METRICS['projects-earning'] as MetricDecl);
  if (mixed.ok) {
    assert.equal(mixed.value.value, null, `the figure came back as ${mixed.value.value}, which is two currencies added together`);
    const said = (mixed.value.parts ?? []).map((p) => p.currency).sort();
    assert.deepEqual(said, ['GBP', 'USD'], 'a figure it cannot add up says one amount per currency, and which ones');
  } else {
    assert.equal((mixed as { refusal: { code: string } }).refusal.code, 'MIXED_CURRENCY');
  }
  assert.notEqual(total, null, 'the one-currency reading above was already no number, so this proves nothing');

  sql.close();
});

/* ── a project that has not said is not a project that earned nothing ────── */

/**
 * WHAT AN IMPORTED RECORD ACTUALLY LOOKS LIKE, AND IT IS THE CASE THIS FILE HAD NO ROW FOR.
 *
 * an importer may file a project's monthly revenue as a READING and write no annual
 * field, which is right: a month is not a year and the importer has no year to write. So on an
 * imported record every project in play arrives with `revenue` unset, and the three figures above
 * were declared over `lane is building or earning` with nothing said about whether a row states a
 * figure at all. Measured on a self-host at a real record's size, 27 projects and 14 of them in play with no
 * annual figure on any of them: `projects-earning` answered `value: 0, rows: 14, held: 27, met:
 * true`, so the Overview's Earning tile drew "Earned in a year GBP 0.00" in the good tone with a
 * link into the list, beside a bar that correctly drew "No project in play says what it earns".
 *
 * Every test below adds one project of that shape to the sample and asks what the figures do with
 * it. The sample's own four rows all state a figure, which is why none of this was visible here.
 */
const added = (k: Kernel, fields: Record<string, unknown>) => {
  const made = k.create('things', { lane: 'earning', ...fields }, { actor: 'p_seed' });
  assert.ok((made as { ok: boolean }).ok, sayOf(made));
};

/** One declared figure, read over the record, refusals reported as the failure they are. */
const readingOf = (k: Kernel, id: string) => {
  const out = k.metric(METRICS[id] as MetricDecl);
  assert.ok(out.ok, `${id}: ${sayOf(out)}`);
  return out.value;
};

test('A PROJECT THAT HAS NOT SAID WHAT IT EARNS IS NOT ONE OF THE PROJECTS THE TOTAL IS OVER', async () => {
  const { k, sql } = await seeded();

  const before = readingOf(k, 'projects-earning');
  added(k, { name: 'Imported project' });
  const after = readingOf(k, 'projects-earning');

  assert.equal(after.value, before.value, 'a project with no figure on it moved the total');
  /* `rows` IS WHAT THE READING CLAIMS IT READ, and `held` cannot stand in for it: `held` is the whole
     register by design ("zero matched over rows that exist is good news, zero held is not news at
     all", `kernel/src/metrics.ts`). That rule tells an empty register from an empty match for a
     COUNT. For a sum of a field nobody filled in it says the opposite of the truth, so the one
     number left that can carry it is how many rows the predicate admitted. */
  assert.equal(
    after.rows,
    before.rows,
    `the total says it read ${String(after.rows)} projects where ${String(before.rows)} state a figure, so a record where nobody has said anything reads as a portfolio that earned nothing`,
  );

  sql.close();
});

test('AND A PROJECT THAT STATED LAST YEAR AND NOTHING THIS YEAR DOES NOT PRINT A COLLAPSE', async () => {
  const { k, sql } = await seeded();

  const before = readingOf(k, 'projects-earning-change');
  added(k, { name: 'Back in play', earned_before: { amount: 2_100_000, currency: 'GBP' } });
  const after = readingOf(k, 'projects-earning-change');

  assert.equal(
    after.value,
    before.value,
    `the comparison fell by ${String((before.value ?? 0) - (after.value ?? 0))} for a project that has not said what it earns this year, which is a decline the record never stated`,
  );

  sql.close();
});

test('THE EARNING TILE SAYS HOW MANY PROJECTS THE TOTAL IS OVER, so a total of nothing cannot be read as a year', () => {
  const earning = blocksOf('portfolio').find((b) => (b.cells ?? []).some((c) => c.metric === 'projects-earning'));
  assert.ok(earning, 'no block on the Overview draws projects-earning');

  const cell = (earning.cells ?? []).find((c) => c.metric === 'projects-earning');
  const note = String(cell?.note ?? '');
  assert.ok(
    note.includes('{{projects-earning-said}}'),
    `the tile's note is ${JSON.stringify(note)}, which says nothing about how many projects stated a figure, so GBP 0.00 stands on the page as a year somebody measured`,
  );
  assert.ok(METRICS['projects-earning-said'], 'projects-earning-said is not declared, so the note names a figure the record cannot answer');
});

test('and that count is of the projects that stated a figure, never of the projects in play', async () => {
  const { k, sql } = await seeded();

  const stated = live().filter((t) => t.revenue !== undefined).length;
  assert.equal(readingOf(k, 'projects-earning-said').value, stated, `the sample states a figure on ${String(stated)} projects in play`);

  added(k, { name: 'Imported project' });
  assert.equal(readingOf(k, 'projects-earning-said').value, stated, 'a project with no figure on it was counted as one that stated a figure');
  /* IN PLAY IS COUNTED FROM THE ROWS IN PLAY, NOT FROM `stated` PLUS ONE. The two are the same number
     on this sample only because all three of its live rows state a figure, and that coincidence is
     the very thing the tests above exist to stop being load-bearing: a fifth sample project in play
     with no figure on it would leave `stated` at 3 while `projects-live` read 5, and this line would
     fail over a sample row rather than over the predicate it is here to hold. */
  assert.equal(readingOf(k, 'projects-live').value, live().length + 1, 'the added project is not in play, so nothing here is being told apart');

  sql.close();
});
