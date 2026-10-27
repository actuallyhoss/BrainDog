/**
 * `flowGrammar` says what the lint enforces, and nothing else.
 *
 * THE WEB'S COPY DRIFTED FROM THE LINT: its step menu had no `meet` and no `run_job`, and its `once_per` list
 * had no `run_job`. So the grammar is held here to the lint's own tables, and each argument it calls required is held
 * to the lint itself: a body giving only the required arguments of a step or a trigger installs, and the same body
 * missing any one of them is refused, through `validate`, the check every install and `checkAutomation` runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validate } from '../src/declare.ts';
import { flowGrammar, type Arg } from '../src/flow-grammar.ts';
import {
  ACTIONS,
  DEPTH_CEILING,
  FLOW,
  MEET_KEYS,
  ONCE,
  ROW_VERBS,
  RUN_JOB_KEYS,
  RUNS_PER_DAY_CEILING,
  STEP_CEILING,
  TRIGGERS,
  VARS_CEILING,
  VERBS,
} from '../src/flow-lint.ts';

const grammar = flowGrammar();

/** A value the lint takes for an argument, by what it picks from first and then by its type. */
const FROM: Record<string, unknown> = {
  list: 'items',
  field: 'what',
  call: 'price_call',
  script: 'tidy',
  door: 'invoices',
  figure: 'cash-now',
  job: 'job.weekly-notes',
  person: 'p_1',
};
const sample = (arg: Arg): unknown => {
  if (arg.from !== undefined) return FROM[arg.from];
  switch (arg.type) {
    case 'name':
      return 'answer';
    case 'span':
    case 'clock':
      return '1h';
    case 'later':
      return '14d';
    case 'time':
      return '09:00';
    case 'day':
      return 'mon';
    case 'condition':
      return 'state is open';
    case 'steps':
      return [{ set_var: { name: 'inner', to: 'x' } }];
    case 'list':
      return ['Yes', 'No'];
    case 'map':
      return {};
    case 'number':
      return 5;
    case 'boolean':
    case 'true':
      return true;
    case 'choice':
      return arg.values![0];
    case 'crossing':
      return { lte: 0 };
    default:
      return 'Chase it';
  }
};

const setAt = (into: Record<string, unknown>, path: readonly string[], value: unknown): void => {
  let at = into;
  for (const key of path.slice(0, -1)) at = (at[key] ??= {}) as Record<string, unknown>;
  at[path.at(-1)!] = value;
};

/** The arguments named, each at its place. */
const built = (args: readonly Arg[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const arg of args) setAt(out, arg.name.split('.'), sample(arg));
  return out;
};

const rule = (body: Record<string, unknown>) => validate({ id: 'rule.grammar_probe', kind: 'rule', body: { rule: 'grammar_probe', ...body } as never });

/* A STEP WHOSE VALUE IS AN OBJECT OF ITS ARGUMENTS still names its verb with none given (`stop: true`, `meet: {}`); a
   step whose value IS its argument (`wait`, `tag`, `if`) is left without it, which is what leaving that one out means. */
const stepBody = (verb: string, args: readonly Arg[]) => {
  const step = built(args);
  const own = grammar.steps.find((s) => s.verb === verb)!.args.some((a) => a.name === verb && a.type !== 'true');
  if (!(verb in step) && !own) step[verb] = verb === 'stop' ? true : {};
  return rule({ on: { written: { register: 'items' } }, once_per: ['what'], steps: [step] });
};
const triggerBody = (id: string, args: readonly Arg[]) => {
  const on = built(args);
  if (!(id in on)) on[id] = {};
  return rule({ on, once_per: ['what'], steps: [{ set_var: { name: 'x', to: 'y' } }] });
};

const required = (args: readonly Arg[]) => args.filter((a) => a.required);

test('EVERY VERB THE LINT KNOWS IS A STEP, AND NOTHING ELSE IS, with its group, row and once from the lint', () => {
  assert.deepEqual(grammar.steps.map((s) => s.verb), [...VERBS]);
  for (const s of grammar.steps) {
    assert.equal(s.group, (ACTIONS as readonly string[]).includes(s.verb) ? 'action' : 'flow', s.verb);
    assert.equal((FLOW as readonly string[]).includes(s.verb), s.group === 'flow', s.verb);
    assert.equal(s.row, ROW_VERBS.includes(s.verb), s.verb);
    assert.equal(s.once, ONCE.includes(s.verb), s.verb);
  }
  /* THE TWO THE WEB'S COPY LACKED. */
  assert.ok(grammar.steps.some((s) => s.verb === 'meet'));
  assert.equal(grammar.steps.find((s) => s.verb === 'run_job')?.once, true);
  assert.deepEqual(grammar.triggers.map((t) => t.id), [...TRIGGERS]);
});

test('THE CEILINGS ARE THE LINT\'S CONSTANTS', () => {
  assert.deepEqual(grammar.ceilings, { steps: STEP_CEILING, depth: DEPTH_CEILING, runsPerDay: RUNS_PER_DAY_CEILING, vars: VARS_CEILING });
});

test('THE KEYS THE LINT CLOSES ARE THE ARGUMENTS: meet and run_job name every key the lint lets through', () => {
  const names = (verb: string) => grammar.steps.find((s) => s.verb === verb)!.args.map((a) => a.name);
  assert.deepEqual(names('meet'), MEET_KEYS.map((k) => `meet.${k}`));
  assert.deepEqual(names('run_job'), RUN_JOB_KEYS.map((k) => `run_job.${k}`));
});

test('THE GRAMMAR IS PLAIN JSON, so the record answers it as it stands', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(grammar)), grammar);
});

test('EVERY STEP: only its required arguments install, and each one left out is refused by the lint', () => {
  for (const s of grammar.steps) {
    const needed = required(s.args);
    const who = s.oneOf?.[0];
    const given = [...needed, ...(who === undefined ? [] : s.args.filter((a) => a.name === who))];
    assert.equal(stepBody(s.verb, given)?.fix ?? null, null, `${s.verb} with ${given.map((a) => a.name).join(', ')}`);
    for (const left of needed)
      assert.ok(stepBody(s.verb, given.filter((a) => a !== left)) !== null, `${s.verb} without ${left.name} installed`);
  }
});

test('EVERY TRIGGER: only its required arguments install, and each one left out is refused by the lint', () => {
  for (const t of grammar.triggers) {
    const needed = required(t.args);
    assert.equal(triggerBody(t.id, needed)?.fix ?? null, null, `${t.id} with ${needed.map((a) => a.name).join(', ')}`);
    for (const left of needed)
      assert.ok(triggerBody(t.id, needed.filter((a) => a !== left)) !== null, `${t.id} without ${left.name} installed`);
  }
});

test('ONE OF: meet says who by any one of its oneOf, and is refused saying nobody', () => {
  const meet = grammar.steps.find((s) => s.verb === 'meet')!;
  assert.ok(meet.oneOf !== undefined && meet.oneOf.length > 0);
  const needed = required(meet.args);
  assert.equal(stepBody('meet', needed)?.code, 'REQUIRED_MISSING');
  for (const name of meet.oneOf!) {
    const one = meet.args.find((a) => a.name === name)!;
    assert.equal(stepBody('meet', [...needed, one])?.fix ?? null, null, name);
  }
});
