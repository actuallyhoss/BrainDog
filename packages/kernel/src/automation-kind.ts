/**
 * What an edit of an automation changes: only what happens inside the record, or something that reaches out of it.
 *
 * WHY THIS EXISTS (SHL-D15). Every accept that installs a rule, a script, a digest or an ingest is the owner's in a
 * browser, so an agent's renamed step waits exactly as a new call does. His words: "Only Mara in a browser turns on what
 * runs unattended" (HD.359), "(default: only egress change)" (H.514), and "Agents suggest by default and climb one kind
 * of change at a time" (section 37). So the record needs one fact it does not have: whether an edit of a rule changes
 * nothing outside the record (a step renamed, a `when` made narrower), which is a kind the ladder may grant one agent,
 * or reaches out, which stays on the `outside` floor whatever the ladder says. This file is that fact, worked out from
 * the two bodies and never taken from whoever sends them, the way `change-kind.ts` works out every other kind.
 *
 * INSIDE IS NARROW ON PURPOSE. An edit is `automation.inside` only when all of these hold:
 *   - the steps that reach out (`REACHING`, at any depth, both arms of an `if`) are the same steps, word for word;
 *   - `enabled` does not turn true, since turning a rule on is the owner's (HD.359);
 *   - `limits` do not rise, an absent limit being the kernel's ceiling;
 *   - the trigger's kind does not change;
 *   - and, on a body that holds a step that reaches out, what starts it (`on`, `register`, `once_per`, `project`) is
 *     unchanged, its `when` is the same or narrower, and the steps that decide what goes out (`skeleton`: each call in its
 *     place under its `if`s, a `stop`, a value a call may say) are the same, an `if` only narrower, since a wider door
 *     sends the same call more often.
 * Anything else, a new rule, and every script, digest or ingest body is `automation.reaches`. A script's own change is
 * always under the floor, which closes the risk the unit names: a step judged inside reaching out through a later change
 * to what it names.
 *
 * NO WORDS A PERSON READS ARE HERE. `stepsDiff` says what changed as facts; `packages/record` says them in a person's words.
 */

import { egressOf } from './actions.ts';
import { AUTOMATION, type ChangeKind } from './change-kind.ts';
import { flowGrammar, type Verb } from './flow-grammar.ts';
import { RUNS_PER_DAY_CEILING, STEP_CEILING, triggerOf } from './flow-lint.ts';
import type { FlowDecl } from './rules.ts';

/** The two kinds an automation's edit is. */
export const AUTOMATION_INSIDE = 'automation.inside';
export const AUTOMATION_REACHES = 'automation.reaches';

/**
 * The steps that reach out of the record: a script, a declared call, a call run on the row, a question to Slash, a
 * notice, and a job on the owner's machine. Typed by the grammar's verbs, so a verb the grammar drops does not compile.
 *
 * NOT READ OFF `flowGrammar()` AS THIS FILE LOADS: `change-kind.ts` imports this file, and the grammar's tables read
 * `flow-lint.ts`, which reaches `change-kind.ts` through its own imports, so a process that loads `flow-lint.ts` first
 * met the grammar before its words were set. `automation-kind.test.ts` holds the six to the grammar's own verbs.
 */
export const REACHING: readonly Verb[] = ['script', 'call', 'run', 'ask_slash', 'notify', 'run_job'];

type Body = Record<string, unknown>;

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** A value as text with its keys sorted, so two bodies that say the same thing compare equal. */
export const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(',')}]`
    : isObject(v)
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
          .join(',')}}`
      : (JSON.stringify(v) ?? 'null');

/** The one verb a step names, or `null`: the lint refuses a step naming none or two. */
export function verbOf(step: unknown): Verb | null {
  if (!isObject(step)) return null;
  const verbs = flowGrammar()
    .steps.map((s) => s.verb)
    .filter((v) => v in step);
  return verbs.length === 1 ? verbs[0]! : null;
}

/** A body's steps, `steps` or the inline pass's `then`. */
export const stepsOf = (body: Body): unknown[] => list(body.steps ?? body.then);

/**
 * The steps that decide what goes out and when, in order: each step that reaches out, every `if` that holds one (with
 * its arms), a `stop`, and a step whose value a later call may say (`set_var`, `set`, `ask_person`'s answer). A step the
 * lint could not read (no verb, or two) is kept whole, since what it does is not known. Every other step only changes
 * the record, so it is left out and may change freely. A flat list of the calls was not enough: a call moved from one
 * arm of an `if` to the other, or a `stop` taken from in front of one, sends the same call more often.
 */
type Node = { if: unknown; then: Node[]; else: Node[] } | { leaf: string; reaches: boolean };
const DECIDING: readonly Verb[] = ['stop', 'set_var', 'set', 'ask_person'];

function skeleton(steps: unknown[]): Node[] {
  const out: Node[] = [];
  for (const step of steps) {
    const verb = verbOf(step);
    if (verb === 'if') {
      const then = skeleton(list((step as Body).then));
      const otherwise = skeleton(list((step as Body).else));
      if (then.length > 0 || otherwise.length > 0) out.push({ if: (step as Body).if, then, else: otherwise });
    } else if (verb === null || REACHING.includes(verb)) out.push({ leaf: canon(step), reaches: true });
    else if (DECIDING.includes(verb)) out.push({ leaf: canon(step), reaches: false });
  }
  return out;
}

/** Whether a skeleton holds a step that reaches out, or one that cannot be read. */
const reachesOut = (nodes: Node[]): boolean => nodes.some((n) => ('leaf' in n ? n.reaches : reachesOut(n.then) || reachesOut(n.else)));

/**
 * Whether `after` sends nothing `before` would not: the same steps in the same places, an `if`'s condition the same or,
 * when it has no otherwise that matters, narrower (a narrower condition widens its otherwise).
 */
function noWider(before: Node[], after: Node[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((b, i) => {
    const a = after[i]!;
    if ('leaf' in b || 'leaf' in a) return 'leaf' in b && 'leaf' in a && b.leaf === a.leaf;
    const n = narrowing(b.if, a.if);
    if (n === 'other' || (n === 'narrower' && (b.else.length > 0 || a.else.length > 0))) return false;
    return noWider(b.then, a.then) && noWider(b.else, a.else);
  });
}

/** Whether a body is a rule's, as opposed to a script's, a digest's or an ingest's, which all have their own keys. */
const isRule = (b: unknown): b is Body =>
  isObject(b) && !('script' in b) && !('digest' in b) && !('channel' in b) && !('ingest' in b) && (Array.isArray(b.steps) || Array.isArray(b.then));

/** A limit as it holds: the declared number, or the kernel's ceiling when there is none. */
function limitOf(body: Body, key: 'runs_per_day' | 'steps_per_run'): number {
  const n = isObject(body.limits) ? body.limits[key] : undefined;
  return typeof n === 'number' ? n : key === 'runs_per_day' ? RUNS_PER_DAY_CEILING : STEP_CEILING;
}

/* MADE WHEN ASKED, NOT AT LOAD: change-kind.ts imports this file, so AUTOMATION is not yet bound while it loads. */
const insideKind = (): ChangeKind => ({ key: AUTOMATION_INSIDE, list: null, verb: AUTOMATION, floor: null });
const reachesKind = (): ChangeKind => ({ key: AUTOMATION_REACHES, list: null, verb: AUTOMATION, floor: 'outside' });

/**
 * Whether a condition stayed the same, became narrower, or anything else. Narrower is only what is plainly so: a `when`
 * where there was none, a sentence that keeps every clause it had and adds more on the comma (clauses AND there, see
 * `@braindog/where`'s sentence grammar), or an `all` that keeps every part. A sentence that ORs is the same or other.
 */
export function narrowing(before: unknown, after: unknown): 'same' | 'narrower' | 'other' {
  if (canon(before) === canon(after)) return 'same';
  if (before === undefined || before === null) return 'narrower';
  if (after === undefined || after === null) return 'other';
  if (typeof before === 'string' && typeof after === 'string') {
    const clauses = (s: string) => s.split(',').map((c) => c.trim().toLowerCase()).filter((c) => c !== '');
    const was = clauses(before);
    const now = clauses(after);
    if ([...was, ...now].some((c) => c.startsWith('or '))) return 'other';
    return was.every((c) => now.includes(c)) && now.length > was.length ? 'narrower' : 'other';
  }
  if (isObject(after) && Array.isArray(after.all)) {
    const was = isObject(before) && Array.isArray(before.all) ? before.all.map(canon) : [canon(before)];
    const now = after.all.map(canon);
    return was.every((c) => now.includes(c)) && now.length > was.length ? 'narrower' : 'other';
  }
  return 'other';
}

/** Where a step sits, counted from one: `[2]`, or `[2, 'then', 1]` for the first step under the second's then. */
export type StepAt = readonly (number | 'then' | 'else')[];

/** One thing an edit did to a body's steps or its conditions, as facts. `at` is where the step sits after, or before for a removed one. */
export type StepChange =
  | { change: 'added'; at: StepAt; verb: Verb | null; step: unknown }
  | { change: 'removed'; at: StepAt; verb: Verb | null; step: unknown }
  | { change: 'renamed'; at: StepAt; verb: Verb; from: string; to: string }
  | { change: 'changed'; at: StepAt; verb: Verb }
  | { change: 'when'; at: StepAt | null; from: unknown; to: unknown; narrowed: boolean };

/**
 * A step's own words: its `name` when it carries one, or the first argument the grammar requires that is text a person
 * wrote (picking no id), so a note's text or a move's state. `null` for a step with none, which is every step that names
 * a call, a script or a job (those are ids) and a `wait` (a span is not a name): a change there is `changed`, never
 * `renamed`, so history never says "renamed step 3 to 2d".
 */
export function wordsOf(step: unknown): string | null {
  const verb = verbOf(step);
  if (verb === null) return null;
  const s = step as Body;
  if (typeof s.name === 'string' && s.name.trim() !== '') return s.name.trim();
  const arg = flowGrammar()
    .steps.find((g) => g.verb === verb)!
    .args.find((a) => a.required && a.from === undefined && a.type === 'text');
  if (arg === undefined) return null;
  let at: unknown = s;
  for (const part of arg.name.split('.')) at = isObject(at) ? at[part] : undefined;
  return typeof at === 'string' && at.trim() !== '' ? at.trim() : null;
}

/** The pairs of equal steps two lists keep, in order: a longest common run, by canonical text. */
function kept(b: string[], a: string[]): [number, number][] {
  const len = b.map(() => a.map(() => 0));
  for (let i = b.length - 1; i >= 0; i--)
    for (let j = a.length - 1; j >= 0; j--)
      len[i]![j] = b[i] === a[j] ? 1 + (len[i + 1]?.[j + 1] ?? 0) : Math.max(len[i + 1]?.[j] ?? 0, len[i]![j + 1] ?? 0);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < b.length && j < a.length; )
    if (b[i] === a[j]) out.push([i++, j++]);
    else if ((len[i + 1]?.[j] ?? 0) >= (len[i]![j + 1] ?? 0)) i++;
    else j++;
  return out;
}

/** Two lists of steps compared: the steps kept as they were, then in each gap a step of the same verb paired, the rest added or removed. */
function listDiff(before: unknown[], after: unknown[], at: StepAt, out: StepChange[]): void {
  const b = before.map(canon);
  const a = after.map(canon);
  const pairs = [...kept(b, a), [b.length, a.length] as [number, number]];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of pairs) {
    const gone = Array.from({ length: pi - i }, (_, k) => i + k);
    const come = Array.from({ length: pj - j }, (_, k) => j + k);
    for (const bi of gone) {
      const verb = verbOf(before[bi]);
      const match = verb === null ? -1 : come.findIndex((aj) => verbOf(after[aj]) === verb);
      if (match < 0) {
        out.push({ change: 'removed', at: [...at, bi + 1], verb, step: before[bi] });
        continue;
      }
      /* THE STEPS PASSED OVER TO REACH THE PAIR ARE NEW, and a later step pairs only after this one, so the order holds. */
      const passed = come.splice(0, match + 1);
      const aj = passed.pop()!;
      for (const k of passed) out.push({ change: 'added', at: [...at, k + 1], verb: verbOf(after[k]), step: after[k] });
      stepDiff(before[bi], after[aj], [...at, aj + 1], out);
    }
    for (const aj of come) out.push({ change: 'added', at: [...at, aj + 1], verb: verbOf(after[aj]), step: after[aj] });
    i = pi + 1;
    j = pj + 1;
  }
}

/** Two steps of one verb compared: an `if`'s condition and both its arms, or any other step's words. */
function stepDiff(before: unknown, after: unknown, at: StepAt, out: StepChange[]): void {
  if (canon(before) === canon(after)) return;
  const verb = verbOf(after)!;
  const b = before as Body;
  const a = after as Body;
  if (verb === 'if') {
    const n = narrowing(b.if, a.if);
    if (n !== 'same') out.push({ change: 'when', at, from: b.if, to: a.if, narrowed: n === 'narrower' });
    listDiff(list(b.then), list(a.then), [...at, 'then'], out);
    listDiff(list(b.else), list(a.else), [...at, 'else'], out);
    return;
  }
  const from = wordsOf(before);
  const to = wordsOf(after);
  out.push(from !== null && to !== null && from !== to ? { change: 'renamed', at, verb, from, to } : { change: 'changed', at, verb });
}

/**
 * What an edit did to a rule's steps and its `when`, in order: the rule's own `when` first, then the steps as they sit.
 * Empty for two bodies whose steps and `when` say the same thing. A `before` of `null` is a new rule: every step added.
 */
export function stepsDiff(before: unknown | null, after: unknown): StepChange[] {
  const b = isObject(before) ? before : {};
  const a = isObject(after) ? after : {};
  const out: StepChange[] = [];
  const n = narrowing(b.when, a.when);
  if (n !== 'same') out.push({ change: 'when', at: null, from: b.when, to: a.when, narrowed: n === 'narrower' });
  listDiff(stepsOf(b), stepsOf(a), [], out);
  return out;
}

/**
 * The kind an edit of an automation is: `automation.inside` when it changes nothing outside the record, which the ladder
 * may grant one agent, or `automation.reaches` on the `outside` floor. `before` is the installed body, `null` for a new
 * one. The header says what inside asks.
 */
export function kindOfAutomationChange(before: unknown | null, after: unknown): ChangeKind {
  if (before === null || !isRule(before) || !isRule(after)) return reachesKind();
  /* WHAT CALLS OUT ON ITS OWN, as the plan and the install read it: a body `egressOf` answers is never inside. */
  if (egressOf(after) !== null || egressOf(before) !== null) return reachesKind();
  if (before.enabled === false && after.enabled !== false) return reachesKind();
  if (limitOf(after, 'runs_per_day') > limitOf(before, 'runs_per_day') || limitOf(after, 'steps_per_run') > limitOf(before, 'steps_per_run')) return reachesKind();
  if (triggerOf(before as FlowDecl) !== triggerOf(after as FlowDecl)) return reachesKind();
  const was = skeleton(stepsOf(before));
  const now = skeleton(stepsOf(after));
  if (!reachesOut(was) && !reachesOut(now)) return insideKind();
  /* A WIDER DOOR ON A RULE THAT REACHES OUT sends the same calls more often, so it is not inside either: what starts it,
     which project's items, how often per item, its `when`, and the steps that decide what goes out. */
  for (const key of ['on', 'register', 'once_per', 'project'] as const) if (canon(before[key]) !== canon(after[key])) return reachesKind();
  if (narrowing(before.when, after.when) === 'other') return reachesKind();
  return noWider(was, now) ? insideKind() : reachesKind();
}
