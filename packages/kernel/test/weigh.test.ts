/**
 * The cost band, which is the fourth of `19 §6`'s four countermeasures against a rubber stamp.
 *
 * What is under test is the JUDGEMENT, not the plumbing: given a body somebody proposed, which band
 * does the record put it in. The plumbing — that the band reaches a queue in the right order — is in
 * `queue-cost.test.ts` beside it, over a real record.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { COSTS, MANY_ROWS, costOf, costRank, worseCost } from '../src/weigh.ts';

test('the four bands are worst first, which is what makes the rank a sort', () => {
  assert.deepEqual([...COSTS], ['undo', 'shape', 'rows', 'call']);
  assert.ok(costRank('undo') < costRank('shape'));
  assert.ok(costRank('shape') < costRank('rows'));
  assert.ok(costRank('rows') < costRank('call'));
  /* A BAND THIS BUILD DOES NOT KNOW SORTS LAST rather than throwing, because the alternative is a
     queue that will not draw over a record a newer build wrote. */
  assert.equal(costRank('something-else'), COSTS.length);
  assert.equal(worseCost('rows', 'undo'), 'undo');
  assert.equal(worseCost('call', 'call'), 'call');
});

test('a question with nothing attached is the cheapest to get wrong', () => {
  assert.equal(costOf('options', { question: 'Which?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }), 'call');
});

/* THE POINT OF THE WHOLE FILE, in one assertion: a judgement ranks below a write, because pressing
   the other button tomorrow undoes a judgement and does not undo a write. */
test('a judgement ranks below anything that would write', () => {
  assert.ok(costRank(costOf('rowset', { register: 'tasks', rows: [{ fields: {} }] })) < costRank(costOf('options', {})));
});

test('a rowset that only adds rows is cheap, and one that changes a row somebody has is not', () => {
  const adding = { register: 'tasks', rows: [{ fields: { title: 'One' } }, { fields: { title: 'Two' } }] };
  assert.equal(costOf('rowset', adding), 'rows');
  /* `at` IS WHAT SAYS THERE IS SOMETHING UNDER IT (`govern.ts` reads `at`, `version` and `patch`). */
  const changing = { register: 'tasks', rows: [{ fields: { title: 'One' } }, { at: 'tasks#3', version: 2, patch: { title: 'Two' } }] };
  assert.equal(costOf('rowset', changing), 'undo');
});

test('enough rows arriving at once is itself the event', () => {
  const rows = (n: number) => ({ register: 'tasks', rows: Array.from({ length: n }, (_, i) => ({ fields: { title: String(i) } })) });
  assert.equal(costOf('rowset', rows(MANY_ROWS - 1)), 'rows');
  assert.equal(costOf('rowset', rows(MANY_ROWS)), 'shape');
  /* AND IT IS STILL THE DEARER BAND THAT WINS: one update among two hundred creates is an update. */
  const many = rows(MANY_ROWS * 2);
  many.rows[0] = { at: 'tasks#1', version: 1, patch: {} } as unknown as { fields: { title: string } };
  assert.equal(costOf('rowset', many), 'undo');
});

test('a declaration that replaces one is dearer than a declaration that is new', () => {
  assert.equal(costOf('change', { declaration_id: 'page.work', to: { kind: 'page' } }), 'shape');
  assert.equal(costOf('change', { declaration_id: 'page.work', to: { kind: 'page' }, from: { kind: 'page' } }), 'undo');
});

test('turning a pack off is the dearest thing a pack proposal can ask for', () => {
  assert.equal(costOf('pack', { disable: 'money' }), 'undo');
  assert.equal(costOf('pack', { install: 'money' }), 'shape');
  assert.equal(costOf('pack', { enable: 'money' }), 'shape');
  assert.equal(costOf('settings', { pack: 'money', values: { voice: 'plain' } }), 'shape');
});

test('a rule is the rowset it will write every time it matches from here on', () => {
  assert.equal(costOf('pattern', { ingest: { kind: 'ingest' }, samples: ['raw_1'] }), 'rows');
});

test('an arrangement is the dearest of its parts, and it always has one', () => {
  assert.equal(costOf('arrange', { why: ['because'], rows: [{ register: 'tasks', fields: {} }] }), 'rows');
  assert.equal(costOf('arrange', { why: ['because'], pages: [{ id: 'p', kind: 'page', body: {} }] }), 'shape');
  assert.equal(costOf('arrange', { why: ['because'], packs: { install: ['money'] } }), 'shape');
  assert.equal(costOf('arrange', { why: ['because'], settings: [{ pack: 'money', values: {} }] }), 'shape');
  /* ONE DISABLE ANYWHERE IN IT CARRIES THE WHOLE ARRANGEMENT, because `arrange.apply` is one press. */
  assert.equal(costOf('arrange', { why: ['because'], packs: { install: ['money'], disable: ['estate'] }, rows: [] }), 'undo');
});

test('a body this build cannot read is the cheapest band, not a throw', () => {
  assert.equal(costOf('something-newer', { whatever: true }), 'call');
  assert.equal(costOf('rowset', null), 'rows');
  assert.equal(costOf('rowset', { rows: 'not a list' }), 'rows');
  assert.equal(costOf('arrange', undefined), 'rows');
  assert.equal(costOf('pack', { disable: 42 }), 'shape');
});
