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
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';

import {
  ARGS,
  stepGroups,
  notYet,
  VERBS,
  VERB_LABELS,
  blankDraft,
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
  nodesOf,
  nudge,
  pairsFrom,
  pairsText,
  pathOf,
  proposalOf,
  removeKey,
  sayCondition,
  sayParts,
  sayStart,
  sayStep,
  sayTrigger,
  setAt,
  varsBefore,
  withChip,
  withTrigger,
  words,
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
  /* A NEW ONE SAYS 0, NOT NOTHING. The record stamps an absent version with the live one (`govern.ts` `stamp`), so
     leaving it out made "Add the automation" a whole replacement of whatever already held the id. */
  assert.equal(proposalOf(d, null).body.from_version, 0, 'a new automation is drawn from nothing, and says so');
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
  assert.equal(sayStep({ if: { field: 'rate', gt: 70 } }), 'If rate is more than 70');
  assert.deepEqual(leafOf({ field: 'rate', lte: 3 }), { field: 'rate', op: 'lte', value: 3 });
  assert.deepEqual(leafTo('rate', 'gte', 5), { field: 'rate', gte: 5 });
  assert.equal(leafOf({ field: 'rate', gt: '70' }), null, 'a number written as text is not a number the builder can edit');
  assert.equal(leafOf({ all: [{ field: 'rate', gt: 1 }] }), null);
  assert.equal(sayCondition({ all: [] }), 'the condition holds');
  assert.equal(sayCondition('state is open'), 'state is open');
});

/*
 * ON BOTH KINDS OF HOST, because what the menu leaves out is now a fact about the host. With the flag fixed at false
 * this was the whole test, and it could not see a host with a model, where the record installs `ask_slash` and the
 * menu still did not offer it (`research-worker-spark.md` Brief F).
 */
test('THE MENU OFFERS EVERY VERB THE RECORD READS AND INSTALLS, ONCE, in the five groups', () => {
  for (const slash of [false, true]) {
    const offered = stepGroups(slash).flatMap((g) => g.verbs);
    assert.deepEqual([...offered, ...notYet(slash)].sort(), [...VERBS].sort(), `slash: ${slash}`);
    assert.ok(!offered.some((v) => notYet(slash).includes(v)), 'a verb the record refuses at install is not offered');
    assert.equal(new Set(offered).size, offered.length);
    assert.deepEqual(stepGroups(slash).map((g) => g.label), ['Check', 'Change', 'Ask', 'Call out', 'Wait']);
  }
});

test('WHERE A MODEL IS, THE ASK GROUP OFFERS SLASH AFTER A PERSON, and where there is none it does not', () => {
  const ask = (slash: boolean) => stepGroups(slash).find((g) => g.label === 'Ask')!.verbs;
  assert.deepEqual(ask(true), ['notify', 'suggest', 'ask_person', 'ask_slash']);
  assert.deepEqual(ask(false), ['notify', 'suggest', 'ask_person']);
});

/* ── what a step may read, and what is wrong before saving ───────────────── */

test('A STEP READS THE ANSWERS OF THE STEPS BEFORE IT, and not of the ones after or in another arm', () => {
  const d = branched();
  const branch = d.steps[2]!;
  assert.deepEqual(varsBefore(d.steps, branch.then![0]!.key), ['vars.rate', 'vars.shown']);
  assert.deepEqual(varsBefore(d.steps, d.steps[0]!.key), []);
  const asked = insertAt(d.steps, `${branch.key}/then`, 0, { key: 'ask', step: { ask_slash: { question: 'Why?', as: 'why' } } });
  assert.deepEqual(varsBefore(asked, d.steps[3]!.key), ['vars.rate', 'vars.shown'], 'an answer inside one arm is not certain after it');
});

test('what the record would refuse is said before saving, in its own terms', () => {
  const empty = draftOf('x', { rule: 'x', on: { every: '1h' }, steps: [] });
  assert.ok(faultsOf(empty).some((f) => /at least one step/.test(f.say)));
  const tagOnClock = draftOf('y', { rule: 'y', on: { every: '1h' }, steps: [{ tag: 'late' }] });
  assert.ok(faultsOf(tagOnClock).some((f) => /no row/.test(f.say)));
  const fast = draftOf('z', { rule: 'z', on: { every: '5m' }, steps: [{ note: 'x' }] });
  assert.ok(faultsOf(fast).some((f) => /15 minutes/.test(f.say)));
  const blank = draftOf('w', { rule: 'w', on: { manual: true }, steps: [{ ask_slash: { question: '', as: '' } }] });
  assert.ok(faultsOf(blank).length >= 1);
  const slash = draftOf('s', { rule: 's', on: { manual: true }, steps: [{ ask_slash: { question: 'Why?', as: 'why' } }] });
  assert.deepEqual(faultsOf(branched()), []);
});

/*
 * THE SAME STEP IS RIGHT ON ONE HOST AND REFUSED ON ANOTHER. The record's `unserved` refuses `ask_slash` at install only
 * where the host has not said it answers one, so the canvas asks the same question of the same flag. Before, every
 * `ask_slash` read "not in this build", which was false on a self-host with a model since `eb1a131b`.
 */
const asksSlash = () => draftOf('s', { rule: 's', on: { manual: true }, steps: [{ ask_slash: { question: 'Why?', as: 'why' } }] });

test('WHERE A MODEL IS, NOTHING IS SAID ABOUT AN ASK_SLASH STEP, because the record installs it', () => {
  assert.deepEqual(faultsOf(asksSlash(), { slash: true }), []);
});

test('WHERE THERE IS NO MODEL, AN ASK_SLASH STEP SAYS SO, and not that the build lacks it', () => {
  const slash = asksSlash();
  const key = slash.steps[0]!.key;
  const none = 'This BrainDog has no model for Slash to answer with. Ask a person instead.';
  assert.deepEqual(faultsOf(slash, { slash: false }), [{ key, say: none }], 'an ask_slash an agent wrote is named before Send');
  assert.deepEqual(faultsOf(slash), faultsOf(slash, { slash: false }), 'the default is the host with no model');
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

/* ── the words a stranger meets (loop/research-canvas-ux.md, brief 2) ─────── */

/*
 * THE FAULT WAS A TEMPLATE, AND HALF OF WHAT IT MADE WAS NOT ENGLISH. Worked from `ARGS` on 22 September, a freshly
 * added card said "Tell you needs say.", "Add a note needs note." and "Ask Slash needs keep the answer as.": a verb's
 * label, the word "needs", and a field label lower-cased. Each required argument now carries its own sentence.
 */
test('EVERY REQUIRED ARGUMENT LEFT BLANK FAULTS WITH A WHOLE SENTENCE OF ITS OWN, never "<label> needs <label>."', () => {
  for (const verb of VERBS) {
    for (const arg of ARGS[verb].filter((a) => a.required)) {
      const empty = arg.kind === 'list' ? [] : arg.kind === 'number' ? 0 : '';
      const step = setAt(blankStep(verb), [...arg.path], empty);
      const d = { ...blankDraft('x'), trigger: { written: { register: 'tasks' } }, steps: [{ key: 'k', step, then: [], else: [] }] };
      const said = faultsOf(d)
        .filter((f) => f.key === 'k')
        .map((f) => f.say);
      const where = `${verb} ${arg.path.join('.')}`;
      assert.ok(said.length > 0, `${where} left blank says nothing`);
      for (const s of said) {
        assert.doesNotMatch(s, / needs [a-z ]+\.$/u, where);
        assert.match(s, /^[A-Z"].*\.$/u, `${where}: ${s}`);
      }
    }
  }
});

test('"IF" IS A BRANCH AND SAYS SO: its arms are "If so" and "If not", and the column resumes "Then, either way"', () => {
  assert.equal(VERB_LABELS.if, 'If');
  assert.equal(words.then, 'If so');
  assert.equal(words.otherwise, 'If not');
  assert.equal(words.eitherWay, 'Then, either way');
  assert.equal(sayStep({ ask_person: { question: 'Pay it?' } }), 'Ask the owner: Pay it?');
  assert.doesNotMatch(words.none, /\.$/u, 'an empty state title has no full stop');
});

/*
 * `loop/research-batch-thirty-six-audit.md` FINDING 3, C2 AND C3. An installed rule that tags only bills above 500 drew
 * its trigger card as "When a row in bills is added or changed", because `draftOf` put a tree `when` in `rest` where
 * nothing drew it; typing a sentence then filed the tree anyway, because `...others` came after `...when`; and switched
 * to a clock, `faultsOf` said nothing while the record refused the body on Send.
 */
const bigBills = { rule: 'paid-tag', register: 'bills', when: { field: 'amount', gt: 500 }, then: [{ tag: 'big' }] };

test('C2: A TREE CONDITION IS HELD IN THE DRAFT WHERE THE CARD CAN SEE IT, and a typed sentence is what gets filed', () => {
  const d = draftOf('paid-tag', bigBills);
  assert.deepEqual(d.whenTree, { field: 'amount', gt: 500 }, 'the tree is the draft’s, not hidden in rest');
  assert.equal(sayStart(d), 'When a row in bills is added or changed, only when amount is more than 500');
  assert.deepEqual(bodyOf(d), bigBills, 'opened and not touched, it files what it read');
  const typed = { ...d, when: 'what is Rent' };
  assert.equal(bodyOf(typed).when, 'what is Rent', 'the sentence the person typed is the one filed');
  assert.equal(sayStart(typed), 'When a row in bills is added or changed, only when what is Rent', 'and the card says the one filed');
  assert.deepEqual(bodyOf({ ...typed, when: '  ' }).when, bigBills.when, 'the box emptied again, the tree it opened with comes back');
  const deep = draftOf('x', { ...bigBills, when: { any: [{ field: 'amount', gt: 500 }, { field: 'what', is: 'Rent' }] } });
  assert.equal(sayStart(deep), 'When a row in bills is added or changed, only when the condition holds', 'a tree the builder cannot read is still named');
});

test('C3: A CONDITION IN EITHER FORM ON A TRIGGER WITH NO ROW IS SAID BEFORE SEND', () => {
  const d = draftOf('paid-tag', bigBills);
  const onClock = { ...d, trigger: { every: '1h' }, steps: nodesOf([{ notify: { say: 'x' } }]) };
  assert.ok(
    faultsOf(onClock).some((f) => f.key === null && /no row/u.test(f.say)),
    'the record refuses a when: on a clock, and the canvas said nothing',
  );
  const onArrival = { ...d, trigger: blankTrigger('arrival'), steps: nodesOf([{ notify: { say: 'x' } }]) };
  assert.ok(faultsOf(onArrival).some((f) => f.key === null && /arrival/u.test(f.say)));
});

test('A SWITCH AWAY FROM A CHANGE TAKES THE CONDITION WITH IT, both forms, and an edit of the change keeps it', () => {
  const d = { ...draftOf('paid-tag', bigBills), when: 'what is Rent' };
  const clock = withTrigger(d, blankTrigger('every'));
  assert.equal(clock.when, null);
  assert.equal(clock.whenTree, null, 'the inspector cleared the sentence and left the tree, and the record refused the body');
  assert.equal(bodyOf(clock).when, undefined);
  assert.deepEqual(faultsOf({ ...clock, steps: nodesOf([{ notify: { say: 'x' } }]) }), []);
  const narrowed = withTrigger(d, { written: { register: 'bills', op: ['create'] } });
  assert.equal(narrowed.when, 'what is Rent');
  assert.deepEqual(narrowed.whenTree, bigBills.when);
});

test('A CARD SAYS A REFERENCE AS A PART OF ITS OWN, so it is drawn as a chip, and the parts joined are the sentence', () => {
  const step = { notify: { say: 'Gold is {{vars.rate}} a gram, {{ trigger.row.what }}' } };
  assert.deepEqual(sayParts(step), [
    { text: 'Tell you: Gold is ' },
    { text: 'rate', ref: 'vars.rate' },
    { text: ' a gram, ' },
    { text: 'what', ref: 'trigger.row.what' },
  ]);
  assert.deepEqual(sayParts({ if: 'what is {{vars.name}}' }), [{ text: 'If what is ' }, { text: 'name', ref: 'vars.name' }]);
  for (const v of VERBS) assert.equal(sayParts(blankStep(v)).map((p) => p.text).join(''), sayStep(blankStep(v)), v);
  assert.equal(sayParts(step).map((p) => p.text).join(''), sayStep(step));
});

/* ── a new automation, against a record ───────────────────────────────────── */

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
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
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

/*
 * `loop/research-batch-thirty-six-audit.md` FINDING 4, F. A member who cannot see the owner's clocks reads an empty
 * automations list, so `freshId` hands her "Gold rate" the id `gold-rate`, which the owner's hourly clock already
 * holds. Measured at `8cab17d7`: filed with no `from_version`, the record stamped it at the live 1, and the owner's
 * accept of "Add the automation Gold rate?" replaced the clock's steps with the member's.
 *
 * THE KERNEL, NOT THE RECORD, because `@braindog/record` is not a dependency of this app and a relative import across
 * packages is what the graph gate refuses. The glue is the record's own two lines: `decide` hands back the body and the
 * version it must find, and `install` is given both.
 */
test('F: "ADD THE AUTOMATION" ON A TAKEN ID IS A CONFLICT ON ACCEPT, and the automation already there keeps its steps', async () => {
  const k = await openRecord(openSqlite(), { now: () => Date.UTC(2026, 8, 22, 12) });
  const clock = { rule: 'gold-rate', name: 'Gold rate', on: { every: '1h' }, steps: [{ notify: { say: 'Look at the gold price' } }] };
  const put = await k.install([{ id: 'rule.gold-rate', kind: 'rule', body: clock } as never]);
  assert.ok(put.ok, JSON.stringify(put));

  const drawn = { ...blankDraft(freshId('Gold rate', []), 'Gold rate'), trigger: { every: '1h' }, steps: nodesOf([{ notify: { say: 'Buy bread' } }]) };
  const filed = k.propose(proposalOf(drawn, null) as never, 'p_2');
  assert.ok(filed.ok, JSON.stringify(filed));
  const decided = k.decide(filed.value.id, { decide: { option: 'accept', reason: 'it is useful' } }, 'p_1');
  assert.ok(decided.ok, JSON.stringify(decided));
  const landed = await k.install([decided.value.install as never], decided.value.expect);

  const live = k.declarations().find((d) => d.id === 'rule.gold-rate')!;
  assert.deepEqual((JSON.parse(live.body) as { steps: unknown }).steps, clock.steps, 'the owner’s clock was replaced by a question that said "add"');
  assert.equal(landed.ok, false);
});
