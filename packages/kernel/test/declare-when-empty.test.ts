/**
 * A block's `when:` may say a figure has no value: `{ metric, empty: true }`.
 *
 * NO COMPARISON HOLDS OF A FIGURE NOBODY HAS GIVEN A VALUE, so a page could not say "No balance has been typed yet" in
 * the place its sentence about cash goes. `empty` is that one test. This file holds the declaration half: what a page
 * may write and what it is refused. Whether the block draws is `drawnWhen`'s (`pages.ts`), held by its own test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const page = (blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.cash',
  kind: 'page',
  body: { page: 'cash', title: 'Cash', nav: { section: 'Money', order: 20 }, blocks } as never,
});

const note = (when: unknown): Record<string, unknown> => ({ kind: 'note', body: 'No balance has been typed yet.', when });
const refused = (when: unknown) => validateDeclaration(page([note(when)]));

test('`empty: true` AND `empty: false` ARE A WHEN, on a figure and on a figure with its parameter', () => {
  assert.equal(refused({ metric: 'cash-now', empty: true }), null);
  assert.equal(refused({ metric: 'cash-now', empty: false }), null);
  assert.equal(refused({ metric: 'project-owed:{{name}}', empty: true }), null);
  /* AND THE COMPARISONS STAND AS THEY WERE. */
  assert.equal(refused({ metric: 'cash-now', gt: 0 }), null);
});

test('EMPTY IS TRUE OR FALSE, and the refusal says so', () => {
  for (const empty of ['yes', 1, null, 'true']) {
    const out = refused({ metric: 'cash-now', empty });
    assert.equal(out?.code, 'DECLARATION_INVALID', `${JSON.stringify(empty)} was taken`);
    assert.match(out?.fix ?? '', /empty is true or false/);
  }
});

test('EMPTY IS THE WHOLE TEST: beside a comparison one of the two would never be read', () => {
  for (const op of ['gt', 'gte', 'lt', 'lte', 'is', 'not']) {
    const out = refused({ metric: 'cash-now', empty: true, [op]: 0 });
    assert.equal(out?.code, 'DECLARATION_INVALID', `empty and ${op} were taken together`);
    assert.match(out?.fix ?? '', new RegExp(`empty and ${op}\\b`));
  }
});

test('A WHEN STILL NAMES A FIGURE: empty alone is no condition', () => {
  assert.equal(refused({ empty: true })?.code, 'DECLARATION_INVALID');
  assert.equal(refused({ metric: 'Cash now', empty: true })?.code, 'DECLARATION_INVALID');
});

test('A PAGE OF TWO LEAD NOTES, one for a figure with a value and one for none, installs on a record', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([
    page([
      { kind: 'note', body: '{{questions-open}} questions are waiting.', when: { metric: 'questions-open', gt: 0 } },
      { kind: 'note', body: 'Nothing has been asked yet.', when: { metric: 'questions-open', empty: true } },
    ]),
  ]);
  assert.ok(out.ok, JSON.stringify(out));
});
