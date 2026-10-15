/**
 * The one sentence history keeps when an agent changes an automation: who, which one, and what changed, in the steps'
 * own words (SHL-D15, job 2).
 *
 * WHY. Once the owner grants an agent `automation.inside` on the ladder, its edit lands at once instead of waiting on
 * Decide, so the only place the owner sees it is history. The line has to say what the edit did the way the card would:
 * "Priya's agent changed Late invoices: renamed step 2 to Close it, now only when due before today". The facts are the
 * kernel's `stepsDiff` (`automation-kind.ts`); this file only words them, and never says a stored id or a verb key.
 *
 * THE KERNEL'S DIFF IS ASKED BY NAME ON ITS MODULE, as `grammar.ts` reads registries: this builds the day the kernel
 * says nothing of `stepsDiff` and words the edit plainly, and reads it with no edit here from the day it does. A caller
 * or a test may hand one in.
 *
 * AT MOST 200 CHARACTERS, ending "and 3 more" when the changes do not fit, because history shows it on one line.
 */

import * as kernel from '@braindog/kernel';
import type { Verb } from '@braindog/kernel/flow-grammar';

/** The most a line holds. */
export const SAID_MOST = 200;

type Body = Record<string, unknown>;
type At = readonly (number | 'then' | 'else')[];

/** What the kernel's `stepsDiff` answers, as this file reads it. */
export type StepFact =
  | { change: 'added' | 'removed'; at: At; verb: Verb | null; step: unknown }
  | { change: 'renamed'; at: At; verb: Verb; from: string; to: string }
  | { change: 'changed'; at: At; verb: Verb }
  | { change: 'when'; at: At | null; from: unknown; to: unknown; narrowed: boolean };

export type StepsDiffer = (before: unknown | null, after: unknown) => readonly StepFact[];

const exported = (ns: object, name: string): unknown => (Object.hasOwn(ns, name) ? (ns as Record<string, unknown>)[name] : undefined);
const KERNEL_DIFF = exported(kernel, 'stepsDiff') as StepsDiffer | undefined;

/**
 * What each step is called, as the canvas's step menu says it, lower case to sit inside a sentence. Typed by the
 * grammar's verbs, so a verb added there without words here does not compile.
 */
const STEP_WORDS: Record<Verb, string> = {
  if: 'a condition',
  set_var: 'remember a value',
  stop: 'stop here',
  tag: 'add a tag',
  untag: 'take a tag off',
  set: 'set a field',
  move: 'move to a state',
  link: 'link to another item',
  note: 'add a note',
  create: 'add items',
  meet: 'meet a person',
  notify: 'tell you',
  suggest: 'suggest on Decide',
  ask_person: 'ask a person',
  ask_slash: 'ask Slash',
  call: 'call a service',
  run: 'run a call on this item',
  script: 'run a script',
  run_job: 'start a job',
  wait: 'wait',
  schedule: 'come back later',
};

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);
const stepWords = (verb: Verb | null): string => (verb === null ? 'a step this record cannot read' : STEP_WORDS[verb]);

/** Where a step sits, for a person: "step 2", or "step 1 under step 2", or "step 1 under step 2's otherwise". */
function placeOf(at: At): string {
  const parts: string[] = [];
  for (let i = 0; i < at.length; i++) {
    const n = at[i];
    if (typeof n !== 'number') continue;
    const arm = at[i + 1];
    parts.unshift(arm === 'else' ? `step ${n}'s otherwise` : `step ${n}`);
  }
  return parts.join(' under ');
}

/** A condition said: a sentence as written, the clauses a narrower one adds, or plain words for a predicate. */
function conditionSaid(from: unknown, to: unknown, narrowed: boolean): string {
  if (to === undefined || to === null) return 'now with no condition';
  if (typeof to !== 'string') return narrowed ? 'now under a narrower condition' : 'now under another condition';
  if (!narrowed) return `now when ${to}`;
  const had = typeof from === 'string' ? from.split(',').map((c) => c.trim().toLowerCase()) : [];
  const added = to
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '' && !had.includes(c.toLowerCase()));
  return `now only when ${added.join(', ')}`;
}

/** One change as a phrase. */
function factSaid(f: StepFact): string {
  switch (f.change) {
    case 'when': {
      const said = conditionSaid(f.from, f.to, f.narrowed);
      return f.at === null ? said : `${placeOf(f.at)} ${said}`;
    }
    case 'renamed':
      return `renamed ${placeOf(f.at)} to ${f.to}`;
    case 'changed':
      return `changed ${placeOf(f.at)} (${stepWords(f.verb)})`;
    case 'added':
      return `added ${placeOf(f.at)} (${stepWords(f.verb)})`;
    case 'removed':
      return `took out ${placeOf(f.at)} (${stepWords(f.verb)})`;
  }
}

/** The same value, keys in any order. */
const same = (a: unknown, b: unknown): boolean => {
  const canon = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(canon).join(',')}]` : isObject(v) ? `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k])}`).join(',')}}` : String(JSON.stringify(v));
  return canon(a) === canon(b);
};

/** What changed besides the steps and the `when`: its name, on or off, its limits, what starts it, how often per item, its project. */
function settingsSaid(b: Body, a: Body): string[] {
  const out: string[] = [];
  if (typeof a.name === 'string' && a.name !== b.name) out.push(`renamed it to ${a.name}`);
  if ((b.enabled !== false) !== (a.enabled !== false)) out.push(a.enabled === false ? 'turned it off' : 'turned it on');
  const limit = (body: Body, key: string): unknown => (isObject(body.limits) ? body.limits[key] : undefined);
  const runs = limit(a, 'runs_per_day');
  if (!same(limit(b, 'runs_per_day'), runs)) out.push(typeof runs === 'number' ? `now at most ${runs} runs a day` : 'took away its limit on runs a day');
  const steps = limit(a, 'steps_per_run');
  if (!same(limit(b, 'steps_per_run'), steps)) out.push(typeof steps === 'number' ? `now at most ${steps} steps a run` : 'took away its limit on steps a run');
  if (!same(b.on, a.on) || !same(b.register, a.register)) out.push('changed what starts it');
  if (!same(b.once_per, a.once_per)) out.push('changed how often it runs for one item');
  if (!same(b.project, a.project)) out.push(typeof a.project === 'string' && a.project !== '' ? 'changed which project it works in' : 'now works in every project');
  return out;
}

/**
 * The line history keeps for an agent's edit of an automation. `agentName` and `ruleTitle` are names, said as given;
 * `before` is the installed body, `null` for a new one. An edit that changes nothing a person would see says so.
 */
export function automationChangeSaid(agentName: string, ruleTitle: string, before: unknown | null, after: unknown, diff: StepsDiffer | undefined = KERNEL_DIFF): string {
  const a = isObject(after) ? after : {};
  if (before === null) {
    const steps = Array.isArray(a.steps ?? a.then) ? ((a.steps ?? a.then) as unknown[]).length : 0;
    return cut(`${agentName} made ${ruleTitle} with ${steps === 1 ? '1 step' : `${steps} steps`}`, []);
  }
  const b = isObject(before) ? before : {};
  /* THE STEPS FIRST, THEN THE RULE'S OWN CONDITION, the order the card reads them in. */
  const ordered = diff ? [...diff(b, a)].sort((x, y) => Number(x.change === 'when' && x.at === null) - Number(y.change === 'when' && y.at === null)) : null;
  const facts = ordered ? ordered.map(factSaid) : same(b.steps ?? b.then, a.steps ?? a.then) && same(b.when, a.when) ? [] : ['changed its steps'];
  const parts = [...facts, ...settingsSaid(b, a)];
  if (parts.length === 0) return cut(`${agentName} changed nothing a person would see in ${ruleTitle}`, []);
  return cut(`${agentName} changed ${ruleTitle}`, parts);
}

/**
 * The head and as many parts as fit in `SAID_MOST`, the rest counted as "and 3 more". A part that alone will not fit is
 * counted, never cut in the middle of a word.
 */
function cut(head: string, parts: readonly string[]): string {
  const line = (shown: readonly string[], more: number): string =>
    shown.length === 0 ? `${head}: ${more} changes` : `${head}: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}`;
  if (parts.length === 0) return head.length <= SAID_MOST ? head : `${head.slice(0, SAID_MOST - 3).trimEnd()}...`;
  const whole = line(parts, 0);
  if (whole.length <= SAID_MOST) return whole;
  for (let n = parts.length - 1; n >= 0; n--) {
    const said = line(parts.slice(0, n), parts.length - n);
    if (said.length <= SAID_MOST) return said;
  }
  return head.length <= SAID_MOST ? head : `${head.slice(0, SAID_MOST - 3).trimEnd()}...`;
}
