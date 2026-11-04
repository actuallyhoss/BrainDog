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
  argsFor,
  actionsOf,
  depthCeilingOf,
  flowVerbsOf,
  onceOf,
  stepGroups,
  notYet,
  verbOf,
  verbsOf,
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
import { forgetGrammar, holdGrammar, type FlowGrammar } from './grammar.ts';

/*
 * THE GRAMMAR, WRITTEN HERE AND NOT READ FROM THE KERNEL, in the shape the record's `flowGrammar` answers: the canvas
 * keeps no list of steps, so every test reads the one it is handed. `meet` and `run_job` are in it, as on the record.
 */
const a = (name: string, type = 'text', required = false, from?: string) => ({ name, type, required, ...(from ? { from } : {}) });
const step = (verb: string, group: 'action' | 'flow', args: ReturnType<typeof a>[], { row = false, once = false } = {}) => ({ verb, group, row, once, args });
const GRAMMAR: FlowGrammar = {
  triggers: [
    { id: 'written', args: [a('register', 'text', true, 'list'), a('op', 'list'), a('fields', 'list')] },
    { id: 'arrival', args: [a('ingest', 'text', false, 'door')] },
    { id: 'every', args: [a('every', 'span', true), a('at')] },
    { id: 'metric', args: [a('id', 'text', true, 'figure')] },
    { id: 'decided', args: [a('about')] },
    { id: 'manual', args: [] },
  ],
  steps: [
    step('tag', 'action', [a('tag', 'text', true)], { row: true }),
    step('untag', 'action', [a('untag', 'text', true)], { row: true }),
    step('set', 'action', [a('field', 'text', true, 'field'), a('to')], { row: true }),
    step('move', 'action', [a('move', 'text', true)], { row: true }),
    step('link', 'action', [a('field', 'text', true, 'field'), a('to.register', 'text', true, 'list'), a('to.by', 'text', true, 'field'), a('to.value', 'text', true)], { row: true }),
    step('note', 'action', [a('note', 'text', true)], { row: true }),
    step('notify', 'action', [a('say', 'text', true)], { once: true }),
    step('schedule', 'action', [a('in', 'span', true), a('note', 'text', true)], { row: true }),
    step('create', 'action', [a('register', 'text', true, 'list'), a('bound', 'number', true), a('fields', 'map')], { once: true }),
    step('suggest', 'action', [a('question', 'text', true), a('options', 'list', true)], { once: true }),
    step('run', 'action', [a('run', 'text', true, 'call')], { row: true, once: true }),
    step('stop', 'action', []),
    step('if', 'flow', [a('if', 'condition', true)]),
    step('set_var', 'flow', [a('name', 'name', true), a('to')]),
    step('script', 'flow', [a('id', 'text', true, 'script'), a('as', 'name')]),
    step('call', 'flow', [a('ingest', 'text', true, 'call'), a('as', 'name')], { once: true }),
    step('ask_slash', 'flow', [a('question', 'text', true), a('shape'), a('choices', 'list'), a('about', 'list', false, 'field'), a('as', 'name', true)], { once: true }),
    step('ask_person', 'flow', [a('question', 'text', true), a('options', 'list', true), a('to', 'text', false, 'person'), a('as', 'name', true), a('wait', 'span')], { once: true }),
    step('wait', 'flow', [a('wait', 'span', true)]),
    step('meet', 'flow', [a('name'), a('email'), a('handle'), a('keys', 'list'), a('kind'), a('where', 'text', true)]),
    step('run_job', 'flow', [a('kind', 'text', true, 'job'), a('args', 'map'), a('as', 'name')], { once: true }),
  ],
  ceilings: { steps: 50, depth: 3, runsPerDay: 1000, vars: 64 },
};
holdGrammar(GRAMMAR);

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
const verbs = (nodes: readonly Node[]): string[] => nodes.map((n) => verbOf(n.step, GRAMMAR) ?? '?');

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
 * gate refuses (31 §3 layer 3). So both functions were run over these eight bodies from a scratch
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
  for (const v of verbsOf(GRAMMAR)) {
    const said = sayStep(blankStep(v));
    assert.ok(said.length > 0, v);
    assert.doesNotMatch(said, /—/, v);
  }
  assert.equal(sayStep({ wait: '2h' }), 'Wait 2 hours');
  assert.equal(sayStep({ set: { field: 'state', to: 'paid' } }), 'Set state to paid');
  assert.equal(sayStep({ notify: { say: 'Gold is {{vars.rate}}' } }), 'Tell you: Gold is rate');
});

test('A NUMBER IS COMPARED AS A LEAF, because the sentence grammar has no word for more than, and it is said back in words', () => {
  assert.equal(sayStep({ if: { field: 'rate', gt: 70 } }), 'If Rate is more than 70');
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
 * menu still did not offer it.
 */
test('THE MENU OFFERS EVERY VERB THE RECORD READS AND INSTALLS, ONCE, in the five groups', () => {
  for (const slash of [false, true]) {
    const offered = stepGroups(slash).flatMap((g) => g.verbs);
    assert.deepEqual([...offered, ...notYet(slash)].sort(), verbsOf(GRAMMAR).sort(), `slash: ${slash}`);
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

/* ONLY WHAT IS NOT PICKED YET IS SAID HERE, worked out from the grammar's `required` (HD.438). An empty automation, a
   branch with nothing under it and a step this host cannot run are the record's to say, through `checkAutomation` on
   the card its `at` names. */
test('A MISSING REQUIRED ARGUMENT IS THE ONE HINT, and nothing the record alone decides', () => {
  const blank = draftOf('w', { rule: 'w', on: { manual: true }, steps: [{ ask_slash: { question: '', as: 'why' } }] });
  assert.deepEqual(faultsOf(blank, { grammar: GRAMMAR }), [{ key: blank.steps[0]!.key, say: 'Write the question for Slash.' }]);
  assert.deepEqual(faultsOf(branched()), []);

  const empty = draftOf('x', { rule: 'x', on: { every: '1h' }, steps: [] });
  assert.deepEqual(faultsOf(empty), [], 'an automation with no steps is the record to say');
  const bare = draftOf('y', { rule: 'y', on: { manual: true }, steps: [{ if: 'a is 1', then: [] }] });
  assert.deepEqual(faultsOf(bare), [], 'a branch with nothing under it is the record to say');
  const asks = draftOf('s', { rule: 's', on: { manual: true }, steps: [{ ask_slash: { question: 'Why?', as: 'why' } }] });
  assert.deepEqual(faultsOf(asks, { slash: false }), [], 'whether this host answers Slash is the record to say');
});

test("A TRIGGER'S REQUIRED ARGUMENT NOT PICKED IS SAID ON THE TRIGGER, from the grammar's triggers", () => {
  const d = { ...blankDraft('x'), trigger: { written: { register: '' } }, steps: nodesOf([{ notify: { say: 'hi' } }]) };
  assert.deepEqual(faultsOf(d), [{ key: null, say: 'Say which list it watches.' }]);
  const figure = { ...d, trigger: { metric: { id: ' ', crosses: 'target' as const } } };
  assert.deepEqual(faultsOf(figure), [{ key: null, say: 'Say which figure it watches.' }]);
});

test('A REQUIRED ARGUMENT THIS BUILD HAS NO WORDS FOR IS STILL SAID, by its name in words', () => {
  const grown: FlowGrammar = { ...GRAMMAR, steps: [...GRAMMAR.steps, step('hand_over', 'flow', [a('desk_name', 'text', true)])] };
  const d = draftOf('h', { rule: 'h', on: { manual: true }, steps: [{ hand_over: { desk_name: '' } }] });
  assert.deepEqual(faultsOf(d, { grammar: grown }), [{ key: d.steps[0]!.key, say: 'Desk name is not picked yet.' }]);
  holdGrammar(grown);
  try {
    assert.equal(sayStep({ hand_over: { desk_name: 'Front' } }), 'Hand over: Front', 'a verb with no words is its id in words and what it holds');
  } finally {
    holdGrammar(GRAMMAR);
  }
});

/* ── the grammar is the record's, and nothing here lists it again ─────────── */

test('THE VERBS, ONCE AND THE DEPTH CEILING ARE THE GRAMMAR HANDED IN, and over none there are none', () => {
  assert.deepEqual(verbsOf(GRAMMAR), GRAMMAR.steps.map((s) => s.verb));
  assert.ok(flowVerbsOf(GRAMMAR).includes('meet') && flowVerbsOf(GRAMMAR).includes('run_job'));
  assert.ok(!actionsOf(GRAMMAR).includes('if') && actionsOf(GRAMMAR).includes('tag'));
  assert.deepEqual(onceOf(GRAMMAR), ['notify', 'create', 'suggest', 'run', 'call', 'ask_slash', 'ask_person', 'run_job']);
  assert.equal(depthCeilingOf(GRAMMAR), 3);
  const shallow: FlowGrammar = { ...GRAMMAR, ceilings: { ...GRAMMAR.ceilings, depth: 1 } };
  assert.equal(depthCeilingOf(shallow), 1);
  assert.deepEqual(verbsOf(null), []);
  assert.deepEqual(stepGroups(true, null), [], 'an older record is offered nothing');
  assert.equal(depthCeilingOf(null), 0);
});

test('A JOB STARTED ABOUT A ROW GETS ONCE FOR EACH ROW, because the grammar says run_job is once', () => {
  const d = draftOf('j', { rule: 'j', on: { written: { register: 'tasks', op: ['create'] } }, steps: [{ run_job: { kind: 'job.weekly-notes' } }] });
  assert.deepEqual(bodyOf(d).once_per, ['entry']);
  const quiet: FlowGrammar = { ...GRAMMAR, steps: GRAMMAR.steps.map((s) => (s.verb === 'run_job' ? { ...s, once: false } : s)) };
  assert.equal(bodyOf(d, quiet).once_per, undefined, 'read from the grammar, not a list here');
});

test('MEET AND RUN_JOB ARE OFFERED, START BLANK AND HAVE FORMS, like any other step', () => {
  const offered = stepGroups(true).flatMap((g) => g.verbs);
  assert.ok(offered.includes('meet') && offered.includes('run_job'));
  assert.ok(stepGroups(true).find((g) => g.label === 'Change')!.verbs.includes('meet'));
  assert.ok(stepGroups(true).find((g) => g.label === 'Call out')!.verbs.includes('run_job'));
  assert.deepEqual(blankStep('run_job'), { run_job: { kind: '', args: {} } });
  assert.deepEqual(blankStep('meet'), { meet: { where: '' } });
  const kind = argsFor('run_job').find((x) => x.name === 'kind')!;
  assert.equal(kind.from, 'job', 'the job is picked from the jobs the owner approved, never typed as an id');
  assert.deepEqual(kind.path, ['run_job', 'kind']);
  assert.ok(kind.required && kind.missing === 'Say which job to start.');
  assert.deepEqual(argsFor('meet').map((x) => x.label), ['Their name', 'Their email', 'Their handle', 'Known by', 'A person or an organisation', 'Where you met them']);
});

test('THEIR CARDS SAY NAMES AND WORDS, never a stored id', () => {
  assert.equal(sayStep({ run_job: { kind: 'job.weekly-notes', as: 'notes' } }), 'Start the job Weekly notes');
  assert.equal(sayStep(blankStep('run_job')), 'Start a job');
  assert.equal(sayStep({ meet: { name: 'Ines Okafor', where: 'the harbour market' } }), 'Meet Ines Okafor: the harbour market');
  assert.equal(sayStep({ meet: { keys: ['bank:{{trigger.row.counterparty}}'], where: 'a bank text' } }), 'Meet the person it names: a bank text');
  assert.doesNotMatch(sayStep({ meet: { keys: ['bank:{{trigger.row.counterparty}}'], where: 'x' } }), /bank:|counterparty/u);
});

test('A DRAFT WITH RUN_JOB READS BACK AS THE BODY IT WAS, and keeps its run for later steps', () => {
  const body = {
    rule: 'notes',
    name: 'Weekly notes',
    on: { every: '1w', at: '09:00', day: 'mon' },
    steps: [{ run_job: { kind: 'job.weekly-notes', args: { week: '{{trigger.at}}' }, as: 'notes' } }, { notify: { say: 'Notes started as {{vars.notes}}' } }],
  };
  const d = draftOf('notes', body);
  assert.deepEqual(bodyOf(d), body);
  assert.deepEqual(varsBefore(d.steps, d.steps[1]!.key), ['vars.notes']);
  assert.deepEqual(faultsOf(d), []);
});

test('OVER NO GRAMMAR A STEP IS STILL NAMED BY ITS SHAPE, and an inline rule keeps its form', () => {
  forgetGrammar();
  try {
    assert.equal(verbOf({ meet: { where: 'x' } }), 'meet');
    assert.equal(verbOf({ if: 'a', then: [] }), 'if');
    assert.equal(verbOf({ tag: 'x', note: 'y' }), null);
    const d = draftOf('x', { rule: 'x', register: 'tasks', then: [{ tag: 'seen' }] });
    assert.deepEqual(bodyOf(d), { rule: 'x', register: 'tasks', then: [{ tag: 'seen' }] });
    assert.deepEqual(faultsOf(d), []);
  } finally {
    holdGrammar(GRAMMAR);
  }
});

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

/* ── the words a stranger meets ───────────────────────────────────────────── */

/*
 * THE FAULT WAS A TEMPLATE, AND HALF OF WHAT IT MADE WAS NOT ENGLISH. Worked from `ARGS`, a freshly
 * added card said "Tell you needs say.", "Add a note needs note." and "Ask Slash needs keep the answer as.": a verb's
 * label, the word "needs", and a field label lower-cased. Each required argument now carries its own sentence.
 */
test('EVERY REQUIRED ARGUMENT LEFT BLANK FAULTS WITH A WHOLE SENTENCE OF ITS OWN, never "<label> needs <label>."', () => {
  for (const verb of verbsOf(GRAMMAR)) {
    for (const arg of argsFor(verb, GRAMMAR).filter((x) => x.required)) {
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
 * A TREE CONDITION WAS LOST BETWEEN THE CARD AND THE FILE. An installed rule that tags only bills above 500 drew
 * its trigger card as "When an item in bills is added or changed", because `draftOf` put a tree `when` in `rest` where
 * nothing drew it; typing a sentence then filed the tree anyway, because `...others` came after `...when`; and switched
 * to a clock, `faultsOf` said nothing while the record refused the body on Send.
 */
const bigBills = { rule: 'paid-tag', register: 'bills', when: { field: 'amount', gt: 500 }, then: [{ tag: 'big' }] };

test('C2: A TREE CONDITION IS HELD IN THE DRAFT WHERE THE CARD CAN SEE IT, and a typed sentence is what gets filed', () => {
  const d = draftOf('paid-tag', bigBills);
  assert.deepEqual(d.whenTree, { field: 'amount', gt: 500 }, 'the tree is the draft’s, not hidden in rest');
  assert.equal(sayStart(d), 'When an item in bills is added or changed, only when Amount is more than 500');
  assert.deepEqual(bodyOf(d), bigBills, 'opened and not touched, it files what it read');
  const typed = { ...d, when: 'what is Rent' };
  assert.equal(bodyOf(typed).when, 'what is Rent', 'the sentence the person typed is the one filed');
  assert.equal(sayStart(typed), 'When an item in bills is added or changed, only when what is Rent', 'and the card says the one filed');
  assert.deepEqual(bodyOf({ ...typed, when: '  ' }).when, bigBills.when, 'the box emptied again, the tree it opened with comes back');
  const deep = draftOf('x', { ...bigBills, when: { any: [{ field: 'amount', gt: 500 }, { field: 'what', is: 'Rent' }] } });
  /* A TREE IS SAID IN ITS WORDS NOW (audit 6g, AG3), and one with nothing to say is still named. */
  assert.equal(sayStart(deep), 'When an item in bills is added or changed, only when Amount is more than 500 or What is Rent');
  assert.equal(sayStart(draftOf('x', { ...bigBills, when: { all: [] } })), 'When an item in bills is added or changed, only when the condition holds', 'a tree the builder cannot read is still named');
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
  for (const v of verbsOf(GRAMMAR)) assert.equal(sayParts(blankStep(v)).map((p) => p.text).join(''), sayStep(blankStep(v)), v);
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
 * A NEW ID MUST NOT TAKE ONE THE MEMBER CANNOT SEE. A member who cannot see the owner's clocks reads an empty
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

/* A DECISION TRIGGER AND AN EMPTY `else` ARE READ AND WRITTEN BACK AS THEY WERE FILED. */
test('A RULE STARTED BY A DECISION ROUND-TRIPS, `about` and `option` and all, and is said in words', () => {
  const chased = { rule: 'chased', on: { decided: { about: 'rule.chase', option: 'Chase it' } }, steps: [{ notify: { say: 'Chasing' } }] };
  const d = draftOf('chased', chased);
  assert.deepEqual(d.trigger, { decided: { about: 'rule.chase', option: 'Chase it' } });
  assert.deepEqual(bodyOf(d), chased);
  assert.equal(sayTrigger(d.trigger), 'When a question from chase is decided in Needs you, when the answer is "Chase it"');
  const any = { rule: 'any', on: { decided: {} }, steps: [{ notify: { say: 'x' } }] };
  assert.deepEqual(bodyOf(draftOf('any', any)), any, 'a decision with nothing narrowing it is still a decision, not a button');
});

test('AN EMPTY `else` A BODY WROTE IS KEPT, and a branch drawn on the canvas files none', () => {
  const kept = { rule: 'k', on: { manual: true }, steps: [{ if: 'amount is 5', then: [{ notify: { say: 'x' } }], else: [] }] };
  assert.deepEqual(bodyOf(draftOf('k', kept)), kept);
  const none = { rule: 'n', on: { manual: true }, steps: [{ if: 'amount is 5', then: [{ notify: { say: 'x' } }] }] };
  assert.deepEqual(bodyOf(draftOf('n', none)), none);
});
