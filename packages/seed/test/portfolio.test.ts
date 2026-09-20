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

type Block = { kind: string; heading?: string; source?: string; columns?: { field?: string }[]; cells?: { metric?: string }[] };
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
  assert.equal(draws('bar').length, 1, 'no bar on the Overview puts one project’s money against another’s, so the page says a total and nothing under it');
  assert.equal(draws('cards').length, 1, 'the In play cards do not say what a project earns, so the money on the page is a total nobody can attribute');

  /* EVERY ONE OF THEM STILL READS PROJECTS ALONE. The pack needs nothing (`first-party.test.ts` holds
     `portfolio` to `requires: []`), so a money block sourced from the ledger would be a page the
     Overview could not open on a record that keeps only projects. */
  for (const b of blocks)
    if (typeof b.source === 'string' && b.source.startsWith('register.'))
      assert.equal(b.source, 'register.things', `${b.heading ?? b.kind} reads ${b.source}, and the Overview reads Projects alone`);
});

test('and each figure says which currency it is in, because a sum with no currency is not money', () => {
  for (const id of ['projects-earning', 'projects-earning-before', 'projects-earning-change']) {
    const decl = METRICS[id];
    assert.ok(decl, `${id} is not declared`);
    assert.match(String(decl.format), /^money\.[A-Z]{3}$/u, `${id} is drawn as ${decl.format}, which does not name a currency`);
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
