/**
 * The canvas's draft model: a rule's trigger and steps as a tree of lists, and every move a drag, a key or a menu can make.
 *
 * WHAT IS CHECKED IS WHAT WOULD BE SILENTLY WRONG. A step that lands one place from where it was dropped, a branch
 * dragged into its own arm (which would make the step vanish from the tree), a body saved as `steps:` that was an
 * inline `then:` rule and so changes which path the record runs it on, and a proposal that differs from the one an
 * agent would file. None of those throws; each is a definition that says something nobody drew.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STEP_GROUPS,
  VERBS,
  blankStep,
  blankTrigger,
  bodyOf,
  callsIn,
  clockOf,
  draftOf,
  faultsOf,
  find,
  freshId,
  getAt,
  idFrom,
  insertAt,
  landing,
  leafOf,
  leafTo,
  listFrom,
  listOf,
  listText,
  moveBetween,
  nudge,
  pairsFrom,
  pairsText,
  pathOf,
  proposalOf,
  removeKey,
  sayCondition,
  sayStep,
  sayTrigger,
  setAt,
  varsBefore,
  withChip,
  type Node,
} from './flow.ts';

/** A body with a branch: two steps before it, one after, and one step in each arm. */
const branched = () =>
  draftOf('gold', {
    rule: 'gold',
    name: 'Gold rate',
    on: { every: '1h' },
    steps: [
      { call: { ingest: 'gold_rate', as: 'rate' } },
      { set_var: { name: 'shown', to: '{{vars.rate}} a gram' } },
      { if: { field: 'rate', gt: 70 }, then: [{ notify: { say: 'Gold is up' } }], else: [{ notify: { say: 'Gold is steady' } }] },
      { wait: '1h' },
    ],
  });

/** The verbs of a list, in order, so an assertion reads as the column reads. */
const verbs = (nodes: readonly Node[]): string[] => nodes.map((n) => VERBS.find((v) => v in n.step) ?? '?');

/* ── moving between branches: the red test this module was written against ── */

test('A STEP MOVES OUT OF THE ROOT LIST AND INTO A BRANCH ARM, and both lists say so', () => {
  const d = branched();
  const branch = d.steps[2]!;
  const wait = d.steps[3]!;
  const out = moveBetween(d.steps, wait.key, { list: `${branch.key}/then`, at: 0 });
  assert.equal(out.moved, true);
  assert.deepEqual(verbs(out.steps), ['call', 'set_var', 'if']);
  assert.deepEqual(verbs(listOf(out.steps, `${branch.key}/then`)!), ['wait', 'notify']);
  assert.deepEqual(verbs(listOf(out.steps, `${branch.key}/else`)!), ['notify']);
});

test('and out of one arm into the other, keeping its own arguments', () => {
  const d = branched();
  const branch = d.steps[2]!;
  const notify = branch.then![0]!;
  const out = moveBetween(d.steps, notify.key, { list: `${branch.key}/else`, at: 1 });
  assert.equal(out.moved, true);
  assert.deepEqual(listOf(out.steps, `${branch.key}/then`), []);
  assert.deepEqual(
    listOf(out.steps, `${branch.key}/else`)!.map((n) => n.step),
    [{ notify: { say: 'Gold is steady' } }, { notify: { say: 'Gold is up' } }],
  );
});

test('A BRANCH CANNOT BE DROPPED INTO ITS OWN ARM, which would take it out of the tree altogether', () => {
  const d = branched();
  const branch = d.steps[2]!;
  const out = moveBetween(d.steps, branch.key, { list: `${branch.key}/then`, at: 0 });
  assert.equal(out.moved, false);
  assert.equal(out.steps, d.steps, 'the tree is handed back untouched');
  assert.match(out.why ?? '', /inside itself/);
});

test('a move that would nest branches past three deep is refused, as the record refuses it', () => {
  const d = draftOf('deep', {
    rule: 'deep',
    on: { manual: true },
    steps: [
      { if: 'a is 1', then: [{ if: 'b is 1', then: [{ if: 'c is 1', then: [{ note: 'x' }] }] }] },
      { if: 'd is 1', then: [{ note: 'y' }] },
    ],
  });
  const inner = d.steps[0]!.then![0]!.then![0]!;
  const loose = d.steps[1]!;
  const out = moveBetween(d.steps, loose.key, { list: `${inner.key}/then`, at: 0 });
  assert.equal(out.moved, false);
  assert.match(out.why ?? '', /three/);
  /* THE BOUNDARY IS ALLOWED. Beside the third branch is three deep, which the record takes, and a check written with
     `>=` refused it while every assertion above still passed. */
  const middle = d.steps[0]!.then![0]!;
  assert.equal(moveBetween(d.steps, loose.key, { list: `${middle.key}/then`, at: 0 }).moved, true);
  assert.equal(moveBetween(d.steps, loose.then![0]!.key, { list: `${inner.key}/then`, at: 0 }).moved, true, 'a step goes inside the third');
});

test('WITHIN ONE LIST A DROP LANDS WHERE THE LINE WAS DRAWN, which is dropIndex and not the raw index', () => {
  const d = branched();
  const call = d.steps[0]!;
  const wait = d.steps[3]!;
  /* Dropped after the wait, the last card. Taken out first, the list is three long, so the raw index 4 would be past the
     end; `landing` has to say 3, the end, or the call lands one place early. */
  const to = landing(d.steps, call.key, { list: 'root', at: 3, edge: 'after' })!;
  assert.deepEqual(to, { list: 'root', at: 3 });
  assert.deepEqual(verbs(moveBetween(d.steps, call.key, to).steps), ['set_var', 'if', 'wait', 'call']);
  /* And dropped either side of itself it stays put. */
  assert.deepEqual(landing(d.steps, call.key, { list: 'root', at: 0, edge: 'after' }), { list: 'root', at: 0 });
});

test('between two lists a drop after a card is the index after it, with nothing taken out first', () => {
  const d = branched();
  const branch = d.steps[2]!;
  const call = d.steps[0]!;
  assert.deepEqual(landing(d.steps, call.key, { list: `${branch.key}/else`, at: 0, edge: 'after' }), { list: `${branch.key}/else`, at: 1 });
});

/* ── the keyboard, which is the same move ─────────────────────────────────── */

test('ALT AND AN ARROW MAKE THE SAME MOVES A DRAG DOES: up, down, into the branch above, out again', () => {
  const d = branched();
  const wait = d.steps[3]!;
  const branch = d.steps[2]!;

  const inside = nudge(d.steps, wait.key, 'in');
  assert.equal(inside.moved, true);
  assert.deepEqual(verbs(listOf(inside.steps, `${branch.key}/then`)!), ['notify', 'wait'], 'into the end of the branch above it');

  const up = nudge(inside.steps, wait.key, 'up');
  assert.deepEqual(verbs(listOf(up.steps, `${branch.key}/then`)!), ['wait', 'notify']);

  const out = nudge(up.steps, wait.key, 'out');
  assert.deepEqual(verbs(out.steps), ['call', 'set_var', 'if', 'wait'], 'out of the branch, just after it');
});

test('a step with no branch beside it has nowhere to go in, and says so rather than moving', () => {
  const d = branched();
  const call = d.steps[0]!;
  const out = nudge(d.steps, call.key, 'in');
  assert.equal(out.moved, false);
  assert.ok(out.why);
  assert.equal(nudge(d.steps, call.key, 'out').moved, false, 'the top list has no outside');
  assert.equal(nudge(d.steps, call.key, 'up').moved, false, 'the first step has nothing above it');
});

test('a step below a branch goes in at the top of the branch below it when there is none above', () => {
  const d = draftOf('x', { rule: 'x', on: { manual: true }, steps: [{ note: 'a' }, { if: 'a is 1', then: [{ note: 'b' }] }] });
  const out = nudge(d.steps, d.steps[0]!.key, 'in');
  assert.deepEqual(listOf(out.steps, `${d.steps[1]!.key}/then`)!.map((n) => n.step), [{ note: 'a' }, { note: 'b' }]);
});

/* ── adding, removing and editing ─────────────────────────────────────────── */

test('a step is added at the gap it was asked for, and removed by its key wherever it is', () => {
  const d = branched();
  const branch = d.steps[2]!;
  const added = insertAt(d.steps, `${branch.key}/else`, 0, { key: 'new', step: blankStep('tag') });
  assert.deepEqual(verbs(listOf(added, `${branch.key}/else`)!), ['tag', 'notify']);
  const gone = removeKey(added, 'new');
  assert.deepEqual(verbs(listOf(gone, `${branch.key}/else`)!), ['notify']);
  assert.equal(find(gone, 'new'), null);
});

test('removing a branch takes its arms with it, and the counts say so', () => {
  const d = branched();
  const gone = removeKey(d.steps, d.steps[2]!.key);
  assert.deepEqual(verbs(gone), ['call', 'set_var', 'wait']);
});

test('an argument is read and written by its path, and the node it was on is a new object', () => {
  const step = { ask_person: { question: 'Pay it?', options: ['Yes', 'No'], as: 'answer' } };
  assert.equal(getAt(step, ['ask_person', 'question']), 'Pay it?');
  const next = setAt(step, ['ask_person', 'question'], 'Pay it now?');
  assert.equal(getAt(next, ['ask_person', 'question']), 'Pay it now?');
  assert.equal(step.ask_person.question, 'Pay it?', 'the old step is not edited in place, so undo has something to go back to');
  assert.deepEqual(setAt({ wait: '1h' }, ['wait'], '2h'), { wait: '2h' });
});

/* ── the body it saves, which is the whole point ──────────────────────────── */

test('A BODY READ IN IS THE BODY WRITTEN OUT, arms and all', () => {
  const body = {
    rule: 'gold',
    name: 'Gold rate',
    on: { every: '1h' },
    steps: [
      { call: { ingest: 'gold_rate', as: 'rate' } },
      { if: { field: 'rate', gt: 70 }, then: [{ notify: { say: 'Gold is up' } }] },
    ],
    project: 'kiln',
  };
  assert.deepEqual(bodyOf(draftOf('gold', body)), body);
  /* A PLAIN WRITE SPELLED WITH `steps` IS A RUN, and must come back one: written as `register` and `then` it would move
     onto the inline path, where nothing waits and nothing is kept between steps. */
  const run = { rule: 'seen', on: { written: { register: 'tasks' } }, steps: [{ tag: 'seen' }] };
  assert.deepEqual(bodyOf(draftOf('seen', run)), run);
});

test('AN INLINE RULE STAYS INLINE: register and then, no on and no steps, or the record would run it another way', () => {
  const body = { rule: 'invoice-late', register: 'invoices', when: 'due before today', then: [{ tag: 'late' }, { notify: { say: 'Late' } }], once_per: ['entry', 'due'] };
  const out = bodyOf(draftOf('invoice-late', body));
  assert.deepEqual(out, body);
  assert.equal(pathOf(out), 'inline');
});

test('and one branch turns it into a run: steps, the register moved into on, and it says so', () => {
  const d = draftOf('invoice-late', { rule: 'invoice-late', register: 'invoices', then: [{ tag: 'late' }] });
  const steps = insertAt(d.steps, 'root', 1, { key: 'b', step: { if: 'amount above 100' }, then: [], else: [] });
  const out = bodyOf({ ...d, steps });
  assert.equal(out.register, undefined);
  assert.deepEqual(out.on, { written: { register: 'invoices' } });
  assert.deepEqual(out.steps, [{ tag: 'late' }, { if: 'amount above 100', then: [] }]);
  assert.equal(pathOf(out), 'run');
});

test('a loud step about a row gets once for each row, which the record would otherwise refuse', () => {
  const d = draftOf('x', { rule: 'x', register: 'tasks', then: [{ notify: { say: 'hi' } }] });
  assert.deepEqual(bodyOf(d).once_per, ['entry']);
  const quiet = draftOf('y', { rule: 'y', register: 'tasks', then: [{ tag: 'seen' }] });
  assert.equal(bodyOf(quiet).once_per, undefined, 'a tag needs none, and none is added');
});

/*
 * THE PATH MIRRORS THE KERNEL, AND THE ANSWERS BELOW ARE THE KERNEL'S, MEASURED. `@braindog/kernel` does not export
 * `pathOf`, and importing `packages/kernel/src/flow-lint.ts` by a relative path is a cross-package import the graph
 * gate refuses (31 §3 layer 3). So on 22 September both functions were run over these eight bodies from a scratch
 * script outside the tree, all eight answered alike, and the kernel's answers are written here. The day the kernel
 * exports `pathOf`, this becomes an import and a loop.
 */
test('THE PATH MIRRORS THE KERNEL, so the canvas never says inline about a body the record runs as a run', () => {
  const measured: [Record<string, unknown>, 'inline' | 'run'][] = [
    [{ rule: 'a', register: 'x', then: [{ tag: 'y' }] }, 'inline'],
    [{ rule: 'b', register: 'x', on: { written: { register: 'x' } }, then: [{ tag: 'y' }] }, 'inline'],
    [{ rule: 'c', on: { written: { register: 'x', op: ['create'] } }, then: [{ tag: 'y' }] }, 'run'],
    [{ rule: 'd', on: { every: '1h' }, steps: [{ note: 'y' }] }, 'run'],
    [{ rule: 'e', register: 'x', on: 'create', then: [{ tag: 'y' }] }, 'inline'],
    [{ rule: 'f', on: { written: { register: 'x', from_rules: true } }, then: [{ tag: 'y' }] }, 'run'],
    [{ rule: 'g', on: { arrival: {} }, then: [{ note: 'y' }] }, 'run'],
    [{ rule: 'h', on: { written: { register: 'x', fields: ['a'] } }, then: [{ tag: 'y' }] }, 'run'],
  ];
  for (const [b, kernel] of measured) assert.equal(pathOf(b), kernel, String(b.rule));
});

test('THE PROPOSAL IS THE ONE AN AGENT FILES: a change to rule.<id>, the whole body, and the version it was drawn from', () => {
  const d = branched();
  const p = proposalOf(d, 4);
  assert.equal(p.body_kind, 'change');
  assert.equal(p.body.declaration_id, 'rule.gold');
  assert.deepEqual(p.body.to, { id: 'rule.gold', kind: 'rule', body: bodyOf(d) });
  assert.equal(p.body.from_version, 4);
  assert.match(p.question, /Gold rate/);
  assert.equal('from_version' in proposalOf(d, null).body, false, 'a new automation is drawn from nothing, and says nothing');
});

test('an id is made from the name in the record grammar, and never starts with a digit', () => {
  assert.equal(idFrom('Chase late invoices!'), 'chase-late-invoices');
  assert.equal(idFrom('2 hour gold'), 'r-2-hour-gold');
  assert.equal(idFrom(''), 'automation');
  assert.ok(idFrom('x'.repeat(80)).length <= 32);
});

/* ── what is said ─────────────────────────────────────────────────────────── */

test('every trigger and every verb is said in a sentence, with no braces and no em dash', () => {
  const triggers = [
    { written: { register: 'invoices' } },
    { written: { register: 'invoices', op: ['create' as const] } },
    { arrival: { ingest: 'gold' } },
    { arrival: {} },
    { every: '1h' },
    { every: '1d', at: '09:00' },
    { metric: { id: 'runway', crosses: 'target' as const } },
    { manual: true as const },
  ];
  for (const t of triggers) {
    const said = sayTrigger(t);
    assert.ok(said.length > 0);
    assert.doesNotMatch(said, /—|\{\{/);
  }
  for (const v of VERBS) {
    const said = sayStep(blankStep(v));
    assert.ok(said.length > 0, v);
    assert.doesNotMatch(said, /—/, v);
  }
  assert.equal(sayStep({ wait: '2h' }), 'Wait 2 hours');
  assert.equal(sayStep({ set: { field: 'state', to: 'paid' } }), 'Set state to paid');
  assert.equal(sayStep({ notify: { say: 'Gold is {{vars.rate}}' } }), 'Tell you: Gold is rate');
});

test('A NUMBER IS COMPARED AS A LEAF, because the sentence grammar has no word for more than, and it is said back in words', () => {
  assert.equal(sayStep({ if: { field: 'rate', gt: 70 } }), 'Only if rate is more than 70');
  assert.deepEqual(leafOf({ field: 'rate', lte: 3 }), { field: 'rate', op: 'lte', value: 3 });
  assert.deepEqual(leafTo('rate', 'gte', 5), { field: 'rate', gte: 5 });
  assert.equal(leafOf({ field: 'rate', gt: '70' }), null, 'a number written as text is not a number the builder can edit');
  assert.equal(leafOf({ all: [{ field: 'rate', gt: 1 }] }), null);
  assert.equal(sayCondition({ all: [] }), 'the condition holds');
  assert.equal(sayCondition('state is open'), 'state is open');
});

test('THE MENU OFFERS EVERY VERB THE RECORD READS, ONCE, in the five groups', () => {
  const offered = STEP_GROUPS.flatMap((g) => g.verbs);
  assert.deepEqual([...offered].sort(), [...VERBS].sort());
  assert.equal(new Set(offered).size, offered.length);
  assert.deepEqual(STEP_GROUPS.map((g) => g.label), ['Check', 'Change', 'Ask', 'Call out', 'Wait']);
});

/* ── what a step may read, and what is wrong before saving ───────────────── */

test('A STEP READS THE ANSWERS OF THE STEPS BEFORE IT, and not of the ones after or in another arm', () => {
  const d = branched();
  const branch = d.steps[2]!;
  assert.deepEqual(varsBefore(d.steps, branch.then![0]!.key), ['vars.rate', 'vars.shown']);
  assert.deepEqual(varsBefore(d.steps, d.steps[0]!.key), []);
  const asked = insertAt(d.steps, `${branch.key}/then`, 0, { key: 'ask', step: { ask_spark: { question: 'Why?', as: 'why' } } });
  assert.deepEqual(varsBefore(asked, d.steps[3]!.key), ['vars.rate', 'vars.shown'], 'an answer inside one arm is not certain after it');
});

test('what the record would refuse is said before saving, in its own terms', () => {
  const empty = draftOf('x', { rule: 'x', on: { every: '1h' }, steps: [] });
  assert.ok(faultsOf(empty).some((f) => /at least one step/.test(f.say)));
  const tagOnClock = draftOf('y', { rule: 'y', on: { every: '1h' }, steps: [{ tag: 'late' }] });
  assert.ok(faultsOf(tagOnClock).some((f) => /no row/.test(f.say)));
  const fast = draftOf('z', { rule: 'z', on: { every: '5m' }, steps: [{ note: 'x' }] });
  assert.ok(faultsOf(fast).some((f) => /15 minutes/.test(f.say)));
  const blank = draftOf('w', { rule: 'w', on: { manual: true }, steps: [{ ask_spark: { question: '', as: '' } }] });
  assert.ok(faultsOf(blank).length >= 1);
  assert.deepEqual(faultsOf(branched()), []);
});

/*
 * TWO REFUSALS ABOUT `when` THE CANVAS CAN SEE AND DID NOT SAY. Measured on 22 September by running the kernel's
 * `flowFault` over `bodyOf` from a scratch script: the sample's own "Chase late payments" with one branch added, and
 * the same rule switched to an arrival, both came back NOT_IN_THIS_BUILD at `when`, while `faultsOf` said nothing and
 * the button was live. The person would have learned it on Decide.
 */
test('A CONDITION THE RECORD WOULD REFUSE IS SAID HERE: a day relative to today on a run, and any condition on an arrival', () => {
  const late = draftOf('late', {
    rule: 'late',
    register: 'obligations',
    when: 'due before today, state is open',
    then: [{ tag: 'late' }, { notify: { say: 'Late' } }],
    once_per: ['entry', 'due'],
  });
  assert.deepEqual(faultsOf(late), [], 'inline, it is read again as the days pass, and the record takes it');
  const branchedLate = { ...late, steps: insertAt(late.steps, 'root', 2, { key: 'b', step: { if: 'amount is 5' }, then: [{ key: 'c', step: { tag: 'big' } }], else: [] }) };
  assert.ok(faultsOf(branchedLate).some((f) => f.key === null && /today/.test(f.say)));
  const onArrival = { ...late, trigger: blankTrigger('arrival') };
  assert.ok(faultsOf(onArrival).some((f) => f.key === null && /arrival/.test(f.say)));
});

/* ── the inspector's text boxes ───────────────────────────────────────────── */

test('A CHIP GOES IN AT THE CARET WITH ITS BRACES, replacing what was selected, and the caret lands after it', () => {
  assert.deepEqual(withChip('Gold is  a gram', 8, 8, 'vars.rate'), { value: 'Gold is {{vars.rate}} a gram', caret: 21 });
  assert.deepEqual(withChip('Gold is X', 8, 9, 'vars.rate'), { value: 'Gold is {{vars.rate}}', caret: 21 });
  assert.equal(withChip('', 40, 50, 'trigger.row.what').value, '{{trigger.row.what}}', 'a caret past the end is the end');
});

test('answers are one a line, and fields are field: value a line split on the first colon only', () => {
  const lines = (...l: string[]) => l.join('\n');
  assert.deepEqual(listFrom(lines(' Yes ', '', 'No', '')), ['Yes', 'No']);
  assert.equal(listText(['Yes', 'No']), lines('Yes', 'No'));
  assert.deepEqual(pairsFrom(lines('title: Chase {{trigger.row.what}}', 'at: 09:30', 'flag', ': nothing')), {
    title: 'Chase {{trigger.row.what}}',
    at: '09:30',
    flag: '',
  });
  assert.equal(pairsText({ title: 'x', at: '09:30' }), lines('title: x', 'at: 09:30'));
});

/* ── triggers, ids and calls ──────────────────────────────────────────────── */

test('A CLOCK KEEPS ITS TIME ONLY WHERE THE RECORD READS ONE, and a weekly time always has a day', () => {
  assert.deepEqual(clockOf('1h', '09:00', 'fri'), { every: '1h' }, 'an hourly clock has no time of day');
  assert.deepEqual(clockOf('1d', '09:00', 'fri'), { every: '1d', at: '09:00' }, 'a daily clock has no day');
  assert.deepEqual(clockOf('1w', '09:00'), { every: '1w', at: '09:00', day: 'mon' }, 'the lint refuses a weekly time with no day');
  assert.deepEqual(clockOf('1w'), { every: '1w' });
});

test('changing the trigger kind starts that kind blank, and a change keeps the list it watched', () => {
  assert.deepEqual(blankTrigger('every'), { every: '1h' });
  assert.deepEqual(blankTrigger('written', { written: { register: 'tasks', op: ['create'] } }), { written: { register: 'tasks' } });
  assert.deepEqual(blankTrigger('manual'), { manual: true });
});

test('A NEW AUTOMATION NEVER TAKES AN ID THE RECORD HAS, which would make it a change to that one', () => {
  assert.equal(freshId('Gold rate', []), 'gold-rate');
  assert.equal(freshId('Gold rate', ['gold-rate']), 'gold-rate-2');
  assert.equal(freshId('Gold rate', ['gold-rate', 'gold-rate-2']), 'gold-rate-3');
  assert.ok(freshId('x'.repeat(40), ['x'.repeat(32)]).length <= 32);
  /* `/automations/new` IS THE ROUTE FOR A BLANK ONE, so an automation named "New" given the id `new` could be filed
     and accepted and then never opened again: its row on the list links to an empty draft. */
  assert.equal(freshId('New', []), 'new-2');
});

test('the calls a flow makes are found in both arms, once each, by call step or run', () => {
  const d = draftOf('x', {
    rule: 'x',
    on: { manual: true },
    steps: [{ call: { ingest: 'gold_rate' } }, { if: 'a is 1', then: [{ call: { ingest: 'fx' } }], else: [{ call: { ingest: 'gold_rate' } }] }],
  });
  assert.deepEqual(callsIn(d.steps), ['gold_rate', 'fx']);
  assert.deepEqual(callsIn(draftOf('y', { rule: 'y', register: 'tasks', then: [{ run: 'hook' }] }).steps), ['hook']);
});
