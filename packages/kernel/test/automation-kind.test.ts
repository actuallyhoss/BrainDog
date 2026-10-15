/**
 * What an agent's edit of an automation changes, inside the record or out of it (SHL-D15).
 *
 * "Only Sam in a browser turns on what runs unattended" (HD.359), and agents climb one kind of change at a time
 * (section 37). So an edit that only renames a step or narrows a `when` is `automation.inside`, a kind the ladder may
 * grant, and one that adds a step reaching out, turns a rule on, raises a limit or changes what starts it stays on the
 * `outside` floor as `automation.reaches`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AUTOMATION_INSIDE, AUTOMATION_REACHES, REACHING, kindOfAutomationChange, narrowing, stepsDiff } from '../src/automation-kind.ts';
import { AUTOMATION } from '../src/change-kind.ts';
import { flowGrammar } from '../src/flow-grammar.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

/** A run-path rule on invoices: a clock-free write trigger, a `when`, and two steps that stay inside. */
const rule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  rule: 'late_invoices',
  name: 'Late invoices',
  on: { written: { register: 'invoices' } },
  when: 'state is open',
  once_per: ['row'],
  steps: [{ tag: 'late' }, { move: 'chasing' }],
  ...over,
});

/** One step of each verb that reaches out, with the arguments the grammar requires. */
const REACHING_STEPS: Record<string, Record<string, unknown>> = {
  script: { script: { id: 'tally', as: 'job' } },
  call: { call: { ingest: 'books_push', as: 'pushed' } },
  run: { run: 'books_push' },
  ask_slash: { ask_slash: { question: 'Is this late?', as: 'answer' } },
  notify: { notify: { say: `${PROJECTS[0]} has a late invoice` } },
  run_job: { run_job: { kind: 'export' } },
};

const kindOf = (before: unknown, after: unknown) => kindOfAutomationChange(before, after).key;

test('the two kinds: inside climbs, reaches sits on the outside floor', () => {
  assert.deepEqual(kindOfAutomationChange(rule(), rule({ name: 'Overdue invoices' })), { key: AUTOMATION_INSIDE, list: null, verb: AUTOMATION, floor: null });
  assert.deepEqual(kindOfAutomationChange(null, rule()), { key: AUTOMATION_REACHES, list: null, verb: AUTOMATION, floor: 'outside' });
});

test('the reaching verbs are read off the grammar, all six of them', () => {
  assert.deepEqual([...REACHING].sort(), ['ask_slash', 'call', 'notify', 'run', 'run_job', 'script']);
  const verbs = new Set(flowGrammar().steps.map((s) => s.verb));
  for (const v of REACHING) assert.ok(verbs.has(v), `${v} is a step the grammar has`);
});

for (const [verb, step] of Object.entries(REACHING_STEPS)) {
  test(`adding a ${verb} step reaches, at the top and inside an if, in either arm`, () => {
    assert.equal(kindOf(rule(), rule({ steps: [{ tag: 'late' }, { move: 'chasing' }, step] })), AUTOMATION_REACHES);
    const branch = (then: unknown[], otherwise?: unknown[]) => rule({ steps: [{ if: 'due before today', then, ...(otherwise ? { else: otherwise } : {}) }] });
    assert.equal(kindOf(branch([{ tag: 'late' }]), branch([{ tag: 'late' }, step])), AUTOMATION_REACHES);
    assert.equal(kindOf(branch([{ tag: 'late' }], [{ note: 'fine' }]), branch([{ tag: 'late' }], [{ note: 'fine' }, step])), AUTOMATION_REACHES);
    const deep = (inner: unknown[]) => rule({ steps: [{ if: 'due before today', then: [{ if: 'amount after 0', then: inner }] }] });
    assert.equal(kindOf(deep([{ tag: 'late' }]), deep([{ tag: 'late' }, step])), AUTOMATION_REACHES);
  });
}

test('a step that reaches out changed in its words still reaches, and one kept as it was does not', () => {
  const said = (say: string) => rule({ steps: [{ tag: 'late' }, { notify: { say } }] });
  assert.equal(kindOf(said('Late'), said('Very late')), AUTOMATION_REACHES);
  assert.equal(kindOf(said('Late'), { ...said('Late'), name: 'Overdue' }), AUTOMATION_INSIDE);
});

test('turning a rule on reaches; turning it off, or leaving it on, does not', () => {
  assert.equal(kindOf(rule({ enabled: false }), rule({ enabled: true })), AUTOMATION_REACHES);
  assert.equal(kindOf(rule({ enabled: false }), rule()), AUTOMATION_REACHES);
  assert.equal(kindOf(rule(), rule({ enabled: false })), AUTOMATION_INSIDE);
  assert.equal(kindOf(rule({ enabled: false }), rule({ enabled: false, name: 'Overdue' })), AUTOMATION_INSIDE);
});

test('limits: runs_per_day up reaches and down is inside, and taking a limit away raises it to the ceiling', () => {
  assert.equal(kindOf(rule({ limits: { runs_per_day: 10 } }), rule({ limits: { runs_per_day: 20 } })), AUTOMATION_REACHES);
  assert.equal(kindOf(rule({ limits: { runs_per_day: 20 } }), rule({ limits: { runs_per_day: 10 } })), AUTOMATION_INSIDE);
  assert.equal(kindOf(rule({ limits: { runs_per_day: 10 } }), rule()), AUTOMATION_REACHES);
  assert.equal(kindOf(rule(), rule({ limits: { steps_per_run: 5 } })), AUTOMATION_INSIDE);
});

test('a renamed step, or a narrower when, is inside', () => {
  assert.equal(kindOf(rule(), rule({ steps: [{ tag: 'late' }, { move: 'closed' }] })), AUTOMATION_INSIDE);
  assert.equal(kindOf(rule(), rule({ steps: [{ tag: 'late' }, { move: 'chasing', name: 'Close it' }] })), AUTOMATION_INSIDE);
  assert.equal(kindOf(rule(), rule({ when: 'state is open, due before today' })), AUTOMATION_INSIDE);
  assert.equal(kindOf(rule({ when: undefined }), rule()), AUTOMATION_INSIDE);
});

test('a changed trigger kind reaches; on a rule that calls out, so does a wider when or another register', () => {
  assert.equal(kindOf(rule(), rule({ on: { every: '1d', at: '09:00' }, when: undefined, steps: [{ create: { register: 'tasks', bound: 1 } }] })), AUTOMATION_REACHES);
  const calls = (over: Record<string, unknown> = {}) => rule({ steps: [{ tag: 'late' }, REACHING_STEPS.call], ...over });
  assert.equal(kindOf(calls(), calls({ when: 'state is open, due before today' })), AUTOMATION_INSIDE);
  assert.equal(kindOf(calls(), calls({ when: 'state is open or chasing' })), AUTOMATION_REACHES);
  assert.equal(kindOf(calls(), calls({ when: undefined })), AUTOMATION_REACHES);
  assert.equal(kindOf(calls(), calls({ on: { written: { register: 'bills' } } })), AUTOMATION_REACHES);
  assert.equal(kindOf(calls(), calls({ once_per: undefined })), AUTOMATION_REACHES);
  /* WITHOUT A STEP THAT REACHES OUT, a wider when only changes which rows it tags. */
  assert.equal(kindOf(rule(), rule({ when: 'state is open or chasing' })), AUTOMATION_INSIDE);
});

test('on a rule that calls out, a call moved to the other arm, a stop taken away or a value it may say changed reaches', () => {
  const notify = { notify: { say: 'Late: {{vars.who}}' } };
  const arms = (then: unknown[], otherwise: unknown[]) => rule({ steps: [{ if: 'due before today', then, else: otherwise }] });
  assert.equal(kindOf(arms([notify], [{ tag: 'fine' }]), arms([{ tag: 'fine' }], [notify])), AUTOMATION_REACHES);
  assert.equal(kindOf(rule({ steps: [{ if: 'due before today', then: [notify] }] }), rule({ steps: [notify] })), AUTOMATION_REACHES);
  const guarded = rule({ steps: [{ if: 'amount after 0', then: [{ stop: true }] }, notify] });
  assert.equal(kindOf(guarded, rule({ steps: [notify] })), AUTOMATION_REACHES);
  const said = (to: string) => rule({ steps: [{ set_var: { name: 'who', to } }, notify] });
  assert.equal(kindOf(said('the client'), said('everyone')), AUTOMATION_REACHES);
  /* A NARROWER IF AROUND A CALL IS INSIDE, unless it has an otherwise, which a narrower condition widens. */
  assert.equal(kindOf(rule({ steps: [{ if: 'due before today', then: [notify] }] }), rule({ steps: [{ if: 'due before today, state is open', then: [notify] }] })), AUTOMATION_INSIDE);
  assert.equal(kindOf(arms([notify], [notify]), rule({ steps: [{ if: 'due before today, state is open', then: [notify], else: [notify] }] })), AUTOMATION_REACHES);
  /* A STEP THE LINT CANNOT READ is never inside: a notify riding on a tag is not hidden by it. */
  assert.equal(kindOf(rule(), rule({ steps: [{ tag: 'late', notify: { say: 'x' } }, { move: 'chasing' }] })), AUTOMATION_REACHES);
  /* A PROJECT TAKEN OFF a rule that calls out sends it for every project's items. */
  const calls = (over: Record<string, unknown> = {}) => rule({ steps: [{ tag: 'late' }, notify], ...over });
  assert.equal(kindOf(calls({ project: 'p1' }), calls()), AUTOMATION_REACHES);
  /* WHAT ONLY CHANGES THE RECORD still moves freely around a call. */
  assert.equal(kindOf(calls(), rule({ steps: [notify, { tag: 'overdue' }, { note: 'chased' }] })), AUTOMATION_INSIDE);
});

test('a wait changed is a change, not a rename', () => {
  assert.deepEqual(stepsDiff(rule({ steps: [{ wait: '2h' }] }), rule({ steps: [{ wait: '2d' }] })), [{ change: 'changed', at: [1], verb: 'wait' }]);
});

test('a new rule reaches, and so does any script, digest or ingest body', () => {
  assert.equal(kindOf(null, rule()), AUTOMATION_REACHES);
  const script = { script: 'export default () => 1', runs: { every: '1d' } };
  assert.equal(kindOf(script, { ...script, script: 'export default () => 2' }), AUTOMATION_REACHES);
  assert.equal(kindOf(script, script), AUTOMATION_REACHES);
  assert.equal(kindOf({ digest: 'weekly', every: '7d' }, { digest: 'weekly', every: '7d' }), AUTOMATION_REACHES);
  const ingest = { ingest: 'books_pull', channel: 'pull', every: '1h', url: 'https://books.example/api' };
  assert.equal(kindOf(ingest, ingest), AUTOMATION_REACHES);
  assert.equal(kindOf(rule(), script), AUTOMATION_REACHES);
});

test('stepsDiff: renamed, added, removed and a narrower when, in the steps own words', () => {
  assert.deepEqual(stepsDiff(rule(), rule()), []);
  assert.deepEqual(stepsDiff(rule(), rule({ steps: [{ tag: 'late' }, { move: 'chasing', name: 'Close it' }], when: 'state is open, due before today' })), [
    { change: 'when', at: null, from: 'state is open', to: 'state is open, due before today', narrowed: true },
    { change: 'renamed', at: [2], verb: 'move', from: 'chasing', to: 'Close it' },
  ]);
  assert.deepEqual(stepsDiff(rule(), rule({ steps: [{ note: 'checked' }, { tag: 'late' }] })), [
    { change: 'added', at: [1], verb: 'note', step: { note: 'checked' } },
    { change: 'removed', at: [2], verb: 'move', step: { move: 'chasing' } },
  ]);
  const call = (ingest: string) => rule({ steps: [{ if: 'due before today', then: [{ call: { ingest } }] }] });
  assert.deepEqual(stepsDiff(call('books_push'), call('books_send')), [{ change: 'changed', at: [1, 'then', 1], verb: 'call' }]);
});

test('narrowing reads a sentence by its comma clauses and a predicate by its all', () => {
  assert.equal(narrowing('state is open', 'state is open'), 'same');
  assert.equal(narrowing(undefined, 'state is open'), 'narrower');
  assert.equal(narrowing('state is open', undefined), 'other');
  assert.equal(narrowing('state is open', 'due before today, state is open'), 'narrower');
  assert.equal(narrowing('state is open', 'state is open, or due before today'), 'other');
  const open = { field: 'state', is: 'open' };
  assert.equal(narrowing(open, { all: [open, { field: 'due', before: 'today' }] }), 'narrower');
  assert.equal(narrowing({ all: [open, { field: 'due', before: 'today' }] }, open), 'other');
});
