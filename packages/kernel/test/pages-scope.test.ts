/**
 * What a page tells somebody invited to one list, from the kernel's side of the check.
 *
 * A member holding `read` on Obligations alone was driven through `page` and measured two doors the kernel holds open.
 * The record decides who may read what, but it can only refuse the lists the kernel NAMES to it, and it can only filter
 * a refusal whose contents it can tell apart.
 *
 *   a.  `registersOf` never read `from[].register`, so a cash walk over Bills was a block about no
 *       list at all and came back to her with *Severance for Sam* on it. The runs, the open
 *       questions and the scheduled actions named nothing either, and each has a method of its
 *       own that refuses her.
 *   b.  `PAGE_UNKNOWN` listed every slug in `allowed`, and a page per row takes its slug from the
 *       row's title, so one wrong slug read the title of every diary entry.
 *
 * The pure half is asked of `registersOf` directly, because it is a function of the declaration.
 * The refusal is asked of a real record, because the slugs come from rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { registersOf, registersOfBlock, type PageBlock, type PageDecl } from '../src/pages.ts';
import type { MetricDecl } from '../src/metrics.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 20, 12);

const page = (...blocks: PageBlock[]): PageDecl => ({ page: 'desk', title: 'Desk', blocks });

/** The one figure the walk opens from, over a list that is not the one the walk walks. */
const CASH: MetricDecl = { metric: 'cash', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' } } as never;
const metric = (id: string): MetricDecl | null => (id === 'cash' ? CASH : null);

test('A CASH WALK READS THE LISTS ITS LEGS WALK, and it used to name only the list its opening figure reads', () => {
  /* The measured walk: opening from a figure, one leg over Bills. Before this, the answer was `['accounts']`, and the
     record, asking only about Accounts, drew the bill. */
  const walk: PageBlock = {
    kind: 'forecast',
    source: 'forecast.runway',
    opening: { metric: 'cash' },
    from: [
      { register: 'bills', on: 'due', amount: 'amount' },
      { register: 'subscriptions', on: 'renews', amount: 'cost' },
    ],
  } as never;
  assert.deepEqual(registersOf(page(walk), metric).sort(), ['accounts', 'bills', 'subscriptions']);
  assert.deepEqual(registersOfBlock(walk, metric).sort(), ['accounts', 'bills', 'subscriptions'], 'the one-block walk the record blanks by disagreed with the page');

  /* A declaration arrives as JSON somebody wrote. A leg with no list, or a `from:` that is not a
     list of legs, names nothing, and the walk refuses it when it runs. */
  const junk = { kind: 'forecast', source: 'forecast.runway', opening: 0, from: [null, 7, { on: 'due' }, { register: 3 }] } as never;
  assert.deepEqual(registersOf(page(junk)), []);
  assert.deepEqual(registersOf(page({ kind: 'forecast', source: 'forecast.runway', from: 'bills' } as never)), []);
});

test('THE RUNS ARE ROWS OF `session`, whether a block lists them or marks which rows have one working on them', () => {
  /* `sessionsLive` refuses somebody without `read` on `session`; the `sessions.live` block on the
     same page handed her the repo, what the run was doing and its token id, three times. */
  assert.deepEqual(registersOf(page({ kind: 'cards', source: 'sessions.live' } as never)), ['session']);
  /* `working: true` reads every row's history against the live runs, so it answers "an agent is on
     this" from `session` as much as the block above does. */
  assert.deepEqual(registersOf(page({ kind: 'table', source: 'register.obligations', working: true } as never)).sort(), ['obligations', 'session']);
  assert.deepEqual(registersOf(page({ kind: 'table', source: 'register.obligations', working: false } as never)), ['obligations']);
});

test('WHAT READS ACROSS THE RECORD SAYS SO, as `*`, which the record reads as the whole of it', () => {
  /* The open questions, the scheduled actions and the log are none of them a list. Each came back
     as `[]`, which `pages` reads as prose for anybody, and so the queue, the bank key's host and
     label, and the log were on a page the member could open. `*` is the one name `reaches` already
     answers only for a ceiling of the whole record, so `readable(ctx, '*')` refuses her with no
     new branch anywhere. */
  for (const source of ['governance.open', 'actions', 'activity'])
    assert.deepEqual(registersOf(page({ kind: 'table', source } as never)), ['*'], `${source} was reported as touching no list`);
  /* A page that mixes them names both, so a caller reading the rows of Obligations still sees the
     page, and the block over the whole record is the one it blanks. */
  assert.deepEqual(registersOf(page({ kind: 'queue', source: 'governance.open' } as never, { kind: 'table', source: 'register.obligations' } as never)).sort(), ['*', 'obligations']);
  /* And prose is still prose. */
  assert.deepEqual(registersOf(page({ kind: 'note', body: 'Keep the receipts.' } as never)), []);
});

test('THE KERNEL HANDS THE RECORD THE SAME ANSWER, through the call `page` blanks each block by', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const walk = { kind: 'forecast', source: 'forecast.runway', opening: 0, from: [{ register: 'bills', on: 'due', amount: 'amount' }] } as never;
  assert.deepEqual(k.blockRegisters(walk), ['bills']);
  assert.deepEqual(k.blockRegisters({ kind: 'cards', source: 'sessions.live' } as never), ['session']);
  assert.deepEqual(k.blockRegisters({ kind: 'queue', source: 'governance.open' } as never), ['*']);
  sql.close();
});

/* ── the refusal for a page that is not there ────────────────────────────── */

const DIARY: Declaration = {
  id: 'register.diary',
  kind: 'register',
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const PER_ENTRY: Declaration = {
  id: 'page.entry',
  kind: 'page',
  body: { page: 'entry', title: '{{body}}', for: { register: 'diary' }, requires: ['register.diary'], blocks: [{ kind: 'note', body: '{{body}}' }] } as never,
};

const WRITTEN: Declaration = {
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', blocks: [{ kind: 'note', body: 'What is on today.' }] } as never,
};

test('A WRONG SLUG IS TOLD THE PAGES SOMEBODY WROTE, and never the row titles a template made pages of', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([DIARY, PER_ENTRY, WRITTEN])).ok);
  for (const body of ['Dinner with the auditor', 'Told Sam about the redundancy list']) assert.ok(k.create('diary', { body }, { actor: 'p_1' }).ok);

  /* The pages are there, so this is not a test of a record with no templated pages. */
  const slugs = (k.pages() as { slug: string }[]).map((p) => p.slug);
  assert.ok(slugs.includes('dinner-with-the-auditor') && slugs.includes('desk'), `the record did not expand the template: ${slugs.join(', ')}`);

  const out = k.page('nope');
  assert.equal(out.ok, false);
  if (out.ok || !('refusal' in out)) return;
  assert.equal(out.refusal.code, 'PAGE_UNKNOWN');
  /* THE OWNER'S TYPO HELP FOR A PAGE SOMEBODY WROTE IS KEPT: `dsek` still finds `desk`. */
  assert.deepEqual(out.refusal.allowed, ['desk']);
  /* AND THE SENTENCE SAYS WHERE THE REST ARE, so an owner who mistyped a project's page is sent to
     `pages`, which answers each caller with what that caller may open. */
  assert.match(out.refusal.fix, /pages/);
  assert.doesNotMatch(JSON.stringify(out.refusal), /auditor|redundancy/i, 'a row title reached the refusal');

  /* And a page per row still opens by its slug for whoever asks the record for it. */
  assert.ok(k.page('dinner-with-the-auditor').ok);
  sql.close();
});
