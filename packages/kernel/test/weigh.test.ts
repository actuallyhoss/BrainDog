/**
 * The cost band, which is the fourth of `19 §6`'s four countermeasures against a rubber stamp.
 *
 * What is under test is the JUDGEMENT, not the plumbing: given a body somebody proposed, which band
 * does the record put it in. The plumbing — that the band reaches a queue in the right order — is in
 * `queue-cost.test.ts` beside it, over a real record.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { COSTS, MANY_ROWS, OLD_MS, WAITS, costOf, costRank, waitOf, waitParams, waitRank, worseCost, type WaitRows } from '../src/weigh.ts';

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

test('a rowset that adds rows is cheap, and so is one that changes a row somebody has: the history puts it back', () => {
  const adding = { register: 'tasks', rows: [{ fields: { title: 'One' } }, { fields: { title: 'Two' } }] };
  assert.equal(costOf('rowset', adding), 'rows');
  /* `at` IS WHAT SAYS THERE IS SOMETHING UNDER IT (`govern.ts` reads `at`, `version` and `patch`). */
  const changing = { register: 'tasks', rows: [{ fields: { title: 'One' } }, { at: 'tasks#3', version: 2, patch: { title: 'Two' } }] };
  assert.equal(costOf('rowset', changing), 'rows');
});

test('enough rows arriving at once is itself the event', () => {
  const rows = (n: number) => ({ register: 'tasks', rows: Array.from({ length: n }, (_, i) => ({ fields: { title: String(i) } })) });
  assert.equal(costOf('rowset', rows(MANY_ROWS - 1)), 'rows');
  assert.equal(costOf('rowset', rows(MANY_ROWS)), 'shape');
  /* AND AN UPDATE AMONG THEM CHANGES NOTHING: forty rows, one of them an update with an empty patch, is still the
     many that is the event, and no dearer. */
  const many = rows(MANY_ROWS * 2);
  many.rows[0] = { at: 'tasks#1', version: 1, patch: {} } as unknown as { fields: { title: string } };
  assert.equal(costOf('rowset', many), 'shape');
});

test('a declaration that replaces one is the shape, as a new one is: Put back restores the one it replaced', () => {
  assert.equal(costOf('change', { declaration_id: 'page.work', to: { kind: 'page' } }), 'shape');
  /* THE ONE IT REPLACES IS KEPT AS A PRIOR VERSION, AND PUT BACK INSTALLS IT AGAIN (batch 62, `undo.ts`). Batch 60
     held this at 'undo' while a plan for it had no step. A retype with a `from` is the one change that stays. */
  assert.equal(costOf('change', { declaration_id: 'page.work', to: { kind: 'page' }, from: { kind: 'page' } }), 'shape');
  assert.equal(costOf('change', { declaration_id: 'register.tasks', to: { retype: { field: 'owner', type: 'ref' } }, from: { id: 'register.tasks' } }), 'undo');
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

/* ── how long a question can wait ── */

const NOW = Date.UTC(2026, 9, 9, 9);
const ASKED = new Date(NOW - 3_600_000).toISOString();
/* One list, bills, whose `due` is a deadline; bills#1 falls due tomorrow and bills#2 next month. */
const ROWS: WaitRows = {
  deadlines: (register) => (register === 'bills' ? ['due'] : []),
  held: (register, at) => (register !== 'bills' ? null : at === 'bills#1' ? { due: '2026-10-10' } : at === 'bills#2' ? { due: '2026-11-20' } : null),
};
const ask = (body: unknown, opened_at = ASKED) => ({ body_kind: 'rowset', body, opened_at });

test('THE THREE WAITS ARE SOON FIRST, which is the order the queue meets them in', () => {
  assert.deepEqual([...WAITS], ['soon', 'old', 'new']);
  assert.ok(waitRank('soon') < waitRank('old') && waitRank('old') < waitRank('new'));
  assert.equal(waitRank('later'), WAITS.length);
  assert.deepEqual(waitParams(NOW), ['2026-10-09', '2026-10-11', '2026-10-06T09:00:00.000Z']);
});

test('A QUESTION ABOUT A ROW THAT FALLS DUE INSIDE 48 HOURS IS SOON, whether the row holds the day or the question writes it', () => {
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ at: 'bills#1', patch: { paid: true } }] }), NOW, ROWS), 'soon');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ at: 'bills#2', patch: { due: '2026-10-11' } }] }), NOW, ROWS), 'soon');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ name: 'Rent', due: '2026-10-09T18:00:00.000Z' }] }), NOW, ROWS), 'soon');
  /* Next month, yesterday, a field that is not a deadline, or no record to read: it can wait. */
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ at: 'bills#2', patch: { paid: true } }] }), NOW, ROWS), 'new');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ name: 'Gas', due: '2026-10-08' }] }), NOW, ROWS), 'new');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ name: 'Gas', paid_on: '2026-10-10' }] }), NOW, ROWS), 'new');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ at: 'bills#1', patch: { paid: true } }] }), NOW), 'new');
});

test('A QUESTION THAT MOVES MONEY IS SOON, as the band reads money; a currency that is not three capitals is not money', () => {
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ name: 'Rent', amount: { amount: 120000, currency: 'GBP' } }] }), NOW), 'soon');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ at: 'bills#2', patch: { amount: { amount: 5, currency: 'USD' } } }] }), NOW), 'soon');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ name: 'Rent', amount: { amount: 1.5, currency: 'GBP' } }] }), NOW), 'new');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ name: 'Rent', amount: { amount: 100, currency: 'gbp' } }] }), NOW), 'new');
  /* Only a rowset writes money: an options question naming a sum is a judgement. */
  assert.equal(waitOf({ body_kind: 'options', body: { amount: { amount: 100, currency: 'GBP' } }, opened_at: ASKED }, NOW), 'new');
});

test('OPEN MORE THAN THREE DAYS IS OLD, and soon still comes first; a body that cannot be read only waits', () => {
  const longAgo = new Date(NOW - OLD_MS - 1).toISOString();
  assert.equal(waitOf(ask({ register: 'bills', rows: [] }, longAgo), NOW, ROWS), 'old');
  assert.equal(waitOf(ask({ register: 'bills', rows: [] }, new Date(NOW - OLD_MS).toISOString()), NOW, ROWS), 'new');
  assert.equal(waitOf(ask({ register: 'bills', rows: [{ at: 'bills#1', patch: { paid: true } }] }, longAgo), NOW, ROWS), 'soon');
  assert.equal(waitOf(ask('not json', longAgo), NOW, ROWS), 'old');
  assert.equal(waitOf(ask(JSON.stringify({ register: 'bills', rows: [{ at: 'bills#1', patch: {} }] })), NOW, ROWS), 'soon');
  assert.equal(waitOf(ask(null), NOW, ROWS), 'new');
});
