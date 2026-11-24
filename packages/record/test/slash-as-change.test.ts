/**
 * A page draft the model named by its kind (`asChange` in `src/slash.ts`). MEASURED 24 NOVEMBER through the production
 * gateway: asked for "a page that shows my late invoices", the model answered `body_kind: "page"` with the blocks as its
 * body, the record dropped it as "a page proposal", and Make from the bar drafted nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { asChange } from '../src/slash.ts';

const PAGE = { id: 'page.late-invoices', body: { page: 'late-invoices', title: 'Late invoices', blocks: [] } };
const BLOCKS = [{ kind: 'table', source: 'register.obligations', where: 'due before today' }];

test('A PAGE THE MODEL NAMED BY ITS KIND IS A CHANGE TO THE PAGE BEING DESCRIBED, its blocks over the page as it is', () => {
  const got = asChange({ question: 'A page of late invoices?', body_kind: 'page', body: { blocks: BLOCKS } }, PAGE) as { body_kind: string; body: { to: { id: string; kind: string; body: Record<string, unknown> } } };
  assert.equal(got.body_kind, 'change');
  assert.deepEqual(got.body.to, { id: 'page.late-invoices', kind: 'page', body: { page: 'late-invoices', title: 'Late invoices', blocks: BLOCKS } });
});

test('ANOTHER KIND WITH ITS OWN ID IS A CHANGE TO THAT DECLARATION, and a change or a draft with no id is left as it came', () => {
  const metric = asChange({ question: 'Count the late ones?', body_kind: 'metric', body: { id: 'metric.late', body: { register: 'obligations' } } }, undefined) as { body_kind: string; body: unknown };
  assert.deepEqual(metric, { question: 'Count the late ones?', body_kind: 'change', body: { to: { id: 'metric.late', kind: 'metric', body: { register: 'obligations' } } } });
  const change = { question: 'q', body_kind: 'change', body: { to: { id: 'page.x', kind: 'page', body: {} } } };
  assert.equal(asChange(change, PAGE), change);
  const loose = { question: 'q', body_kind: 'metric', body: { register: 'obligations' } };
  assert.equal(asChange(loose, PAGE), loose);
  assert.equal(asChange({ question: 'q', body_kind: 'page', body: { blocks: [] } }, undefined) !== null, true);
});
