/**
 * The lint of an automation: a rule that has grown a trigger and steps (`loop/research-shell-automations.md` §2 to §4).
 *
 * AN AUTOMATION IS NOT A KIND OF ITS OWN. `04 §1` closes the list (nine since `script` joined it, `declare.ts`'s
 * `KINDS`) and enforces it in three places, so a `rule` body grows `on:` and `steps:` instead, and every rule installed before either existed is already an automation whose
 * trigger is `written`. This file is the half of that promise that can be checked before anything runs: what a body may
 * say, and which of the two paths it takes.
 *
 * TWO PATHS, ONE DECLARATION, AND NOBODY DECLARES WHICH. `inline` is today's rule, run by `runRules` inside the write's
 * own transaction. `run` is everything else: a clock, an arrival, a button, a filter the inline pass does not read, or
 * a step that waits. `pathOf` decides, and the lint refuses the bodies that would install on one path and silently do
 * nothing on it, which is the failure this tree keeps recording: a declaration that looks complete, installs, and is
 * read by nothing.
 *
 * THE RUNNER IS `flow.ts`, AND THIS FILE REFUSES WHAT IT WOULD NOT DO. `ask_person` runs (Brief C), so its shape is
 * held here to what the runner and the gate accept: two options or more, each once, since `propose` refuses a choice
 * of one, and no `to:`, since nothing addresses a question to one person. `ask_slash` is held to its shape and to what
 * its question may carry, and no further: whether THIS host answers the `infer.ask` job it queues is a fact about the
 * host, which a context-free lint cannot know, so that refusal is `unserved` in `index.ts`, beside `stranded`, and
 * `slashAskAt` below is what it asks. A `script` step runs since 24 September: `flow.ts`'s `startScript` queues the
 * script's run and the run goes on, and whether the script is installed, says `runs: { rule: true }` and is not paused
 * is asked there, when a run reaches the step, because a pause is a fact of the moment and no install can know it. A
 * `call` step still installs and fails at the run with a sentence, which is why the lint is strict about everything it
 * CAN know now.
 */

import type { Refusal } from '@braindog/ports';

import { CALENDAR_STEPS, calendarOf, isMonthDay, monthsIn, MONTHS, timeOf } from './clock.ts';
import type { Known } from './declare.ts';
import { nextOccurrence } from './digest.ts';
import { figureFault } from './figure.ts';
import { FLOOR_MS, intervalMs } from './pull.ts';
import type { FlowDecl } from './rules.ts';

/**
 * THE KERNEL'S CEILINGS, and a declaration's `limits` can only lower them (§3, rule 3).
 *
 * FIFTY STEPS IS COUNTED OVER THE WHOLE DEFINITION, BOTH ARMS OF EVERY BRANCH. A run walks one arm, so this is stricter
 * than "steps per run" read literally; it is also the only form of the number that can be checked before a run exists,
 * and a canvas column past fifty cards is not a thing a person reviews.
 */
export const STEP_CEILING = 50;
/** Three, as `21 §4.4`'s nested groups: the fourth level is where a sentence builder stops being read. */
export const DEPTH_CEILING = 3;
export const RUNS_PER_DAY_CEILING = 1000;
/** A run's `vars` are bounded at sixty-four names (§3's `RunContext`), so a body naming more could never hold them. */
export const VARS_CEILING = 64;

const TRIGGERS = ['written', 'arrival', 'every', 'metric', 'decided', 'manual'] as const;
const OPS = ['create', 'update', 'delete'] as const;
/** The words a rule's `on:` was written with before it was an object. `create` is the only one any rule ever carried. */
const LEGACY_WORDS = ['create'] as const;
const CHANNELS = ['webhook', 'email', 'paste', 'api', 'pull'] as const;
const SHAPES = ['text', 'number', 'choice'] as const;

/** Every action a rule had before steps, closed. The inline pass's dispatch has one arm for each. */
export const ACTIONS = ['tag', 'untag', 'set', 'move', 'link', 'note', 'notify', 'schedule', 'create', 'suggest', 'run', 'stop'] as const;
/** The verbs only a step has. */
const FLOW = ['if', 'set_var', 'script', 'call', 'ask_slash', 'ask_person', 'wait'] as const;
/**
 * Every verb a rule or a step may name. Exported so that `flow-secret-verbs.test.ts` asks each one what it does with a
 * secret, and a verb added here without an answer there fails that test.
 */
export const VERBS: readonly string[] = [...ACTIONS, ...FLOW];

/**
 * THE VERBS THAT ARE ABOUT A ROW. `tag` on a clock tick has nothing to tag: `runRules` hands each of these the entry that
 * was written, and a run started by `every`, `metric` or `manual` has none. `call` is not listed because a call that
 * sends no fields needs no row; the walk in `flowFault` holds a call that does send them to the same rule as `run`. Installing one would be a step that reaches
 * for a row that is not there, on every fire, for ever.
 */
const ROW_VERBS: readonly string[] = ['tag', 'untag', 'set', 'move', 'link', 'note', 'schedule', 'run'];
/** Triggers with no subject row. `arrival` is left out: a matched arrival writes rows, and §4.1 has its run read them. */
const ROWLESS: readonly string[] = ['every', 'metric', 'manual'];

/** The verbs §3 says need `once_per` on a trigger about a row: notifies, creates, calls or asks. */
const ONCE: readonly string[] = ['notify', 'create', 'suggest', 'run', 'call', 'ask_slash', 'ask_person'];

/**
 * Field types whose value never leaves the record with a question: `ask_slash`'s `about:` is refused them here, and
 * the runner leaves them out of the `infer.ask` payload again, as `queueCall` leaves them out of what a call sends.
 */
export const UNSENDABLE: readonly string[] = ['secret', 'file'];

/**
 * The type by which a field never leaves the record, `secret` or `file`, or `null` for a field that may.
 *
 * A `list<T>` IS READ BY ITS ELEMENT TYPE, as the write path reads it (`index.ts` seals `field.of === 'secret'`) and
 * `redacts` reads a `list<money>`. Asking the field's own type, which is `list`, let a `list<secret>` stored past
 * `declare.ts`'s refusal of one be put in a question, named in `about:` and copied into a text field; measured on 23
 * September through the runner, a stored rule queued `Rate for hunter2 ["hunter2"]?` with `about: { keys: ['hunter2'] }`.
 * `flow.ts` asks this too, so the lint and the runner cannot come to read one field two ways.
 */
export const sealedAs = (field: { type?: unknown; of?: unknown } | undefined): string | null => {
  const kind = String(field?.type === 'list' ? field.of : field?.type);
  return UNSENDABLE.includes(kind) ? kind : null;
};

/** A name a step's answer lands under, read back as `{{vars.<name>}}`. */
const NAME = /^[a-z][a-z0-9_]{0,31}$/;
/** `trigger` and `vars` are the run context's own two keys, so a var called either would shadow the path to itself. */
const RESERVED: readonly string[] = ['trigger', 'vars'];

/**
 * A `when:` that names a day relative to today. A copy of the test `rulesAboutTime` in `index.ts` uses to pick the rules
 * it re-reads each hour, exported so that function can import it: until it does, the two are held together by hand, and
 * an edit to one that misses the other lets the lint and the sweep disagree about which rules are about time.
 */
export const RELATIVE_DAY = /\b(?:today|yesterday|tomorrow)\b|[+-]\d+[dwmy]\b/u;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const bad = (code: string, fix: string, at?: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  ...(at === undefined ? {} : { at }),
  ...(allowed === undefined ? {} : { allowed }),
});

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** The one trigger key a body names, or `written` when it names none. Only meaningful after `triggerFault` passed. */
export const triggerOf = (decl: FlowDecl): string => {
  if (decl.on === undefined || typeof decl.on === 'string') return 'written';
  return Object.keys(decl.on).find((k) => (TRIGGERS as readonly string[]).includes(k)) ?? 'written';
};

/**
 * `inline` or `run`, decided from the body and never declared.
 *
 * INLINE IS EXACTLY WHAT `runRules` CAN DO: a `written` trigger with no filter, and a `then` list. Three things send a
 * `written` body to the run path even though §2.2 would call them synchronous, and each is a thing the inline pass
 * would read wrongly rather than refuse:
 *
 *   - `op` and `fields`: the pass fires on every write of the register and has no idea which fields changed, so a rule
 *     saying `op: [create]` would fire on every edit too.
 *   - `from_rules`: a rule's own writes run with the pass turned off (`rules.ts`'s header), so inline chaining cannot
 *     happen at all.
 *   - `steps`: the pass walks `then` and nothing else, and has no arm for `if` or `set_var`.
 */
export function pathOf(decl: FlowDecl): 'inline' | 'run' {
  if (decl.steps !== undefined) return 'run';
  if (decl.on === undefined || typeof decl.on === 'string') return 'inline';
  const written = (decl.on as { written?: unknown }).written;
  if (!isObject(written)) return 'run';
  return written.op === undefined && written.fields === undefined && written.from_rules === undefined ? 'inline' : 'run';
}

/** The register whose row a run is about, where the trigger has one: the top-level `register` or `on.written.register`. */
export function subjectOf(decl: FlowDecl): string | null {
  if (typeof decl.register === 'string') return decl.register;
  const written = decl.on === undefined ? undefined : (decl.on as { written?: { register?: unknown } }).written;
  return typeof written?.register === 'string' ? written.register : null;
}

/**
 * Every action of a body with where it sits: `then`'s items, or every `RuleAction` among the steps, both arms of every
 * branch included. `declare.ts` runs its per-action checks (`schedule` spans, `create` bounds, `run` calls) over this,
 * so a `create` inside an `if` meets the same bound as one in `then`.
 */
export function actionsOf(decl: FlowDecl): { action: Record<string, unknown>; at: string }[] {
  const out: { action: Record<string, unknown>; at: string }[] = [];
  const walk = (list: unknown, at: string) => {
    if (!Array.isArray(list)) return;
    for (const [i, step] of list.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${i}]`;
      if ('if' in step) {
        walk(step.then, `${here}.then`);
        walk(step.else, `${here}.else`);
      } else if ((ACTIONS as readonly string[]).some((a) => a in step)) out.push({ action: step, at: here });
    }
  };
  walk(decl.then, 'then');
  walk(decl.steps, 'steps');
  return out;
}

/**
 * A call a rule or a step may start, checked against what is installed.
 *
 * A RULE NAMES AN ACTION, NEVER AN ADDRESS. The host, the key and the fields it sends are on the call, approved when it
 * was installed, so a rule can reach nothing the owner did not already see; and a call sends fields of ONE register,
 * which has to be the one the rule is about or it would post a row it was never given. Moved here from `declare.ts`'s
 * `run` loop, word for word, so that `run:` and the `call` step cannot come to disagree about what a call is.
 */
export function callFault(id: string, name: unknown, at: string, register: string | null, installed?: Known): Refusal | null {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))
    return bad('DECLARATION_INVALID', `${id} runs ${JSON.stringify(name)}, and run: is the id of a declared call.`, at);
  if (installed === undefined) return null;
  const call = installed.get(`ingest.${name}`) as { channel?: unknown; trigger?: unknown; sends?: unknown } | undefined;
  if (call === undefined) return bad('DECLARATION_UNKNOWN', `${id} runs ${name}, and there is no action called ${name}.`, at);
  if (call.channel !== 'call' || (call.trigger !== 'rule' && call.trigger !== 'both'))
    return bad('DECLARATION_INVALID', `${id} runs ${name}, which is not a call a rule may start. Give ${name} trigger: rule or trigger: both.`, at);
  const from = sendsFrom(call);
  if (from !== null && register !== null && from !== register)
    return bad('DECLARATION_INVALID', `${id} is about ${register}, and ${name} sends fields of ${from}.`, at);
  return null;
}

/** The register whose fields a call sends, or `null` for a call that sends none, such as the GET of a price. */
function sendsFrom(call: { sends?: unknown } | undefined): string | null {
  const sends = call?.sends;
  return Array.isArray(sends) && typeof sends[0] === 'string' ? (sends[0].split('.')[0] ?? null) : null;
}

/**
 * The register of the row a run has in hand when it starts, or `null` when it has none.
 *
 * AN ARRIVAL'S ROW IS THE ONE ITS DOOR WRITES, and only a named door says which register that is. `onArrival` hands a
 * run the first row the arrival wrote, so `on: { arrival: { ingest: invoices } }` brings an invoice row and
 * `on: { arrival: {} }` brings a row of whatever register the door that matched writes, which no lint can know.
 */
function rowOf(decl: FlowDecl, trigger: string, installed: Known): string | null {
  if (trigger !== 'written' && trigger !== 'arrival') return null;
  return rowRegisterOf(decl, (door) => installed.get(`ingest.${door}`));
}

/**
 * `rowOf` for a caller that holds the doors some other way: the register of the row a run of this rule acts on and
 * reads its `if` against, given a lookup from a door's id to its body.
 *
 * EXPORTED FOR THE READERS OF A LIST, which `subjectOf` alone undercounted. `loop/research-batch-thirty-six-audit.md` §1
 * opened `lane` to text under an automation started by arrivals at a door writing Projects: its `if: lane is Parked`
 * answered "then" before and "else" after, and the widening refusal never asked it, because its subject is `null`.
 */
export function rowRegisterOf(decl: FlowDecl, doorOf: (door: string) => unknown): string | null {
  const trigger = triggerOf(decl);
  if (trigger === 'written') return subjectOf(decl);
  if (trigger !== 'arrival') return null;
  const door = (decl.on as { arrival?: { ingest?: unknown } }).arrival?.ingest;
  if (typeof door !== 'string') return null;
  const writes = (doorOf(door) as { writes?: { register?: unknown } } | undefined)?.writes?.register;
  return typeof writes === 'string' ? writes : null;
}

/**
 * A path the run fills from its own context before the step acts (`flow.ts`'s `fill`), so the word exists only at the run.
 *
 * THE WHOLE OF `flow.ts`'s `PATH`, NOT ITS PREFIX. Read as `{{vars.` alone, `{{vars.a-b}}` and an unclosed `{{trigger.x`
 * were let through over a `list<enum>` of `[chase]`; `fill` leaves both as typed, and the run failed "tags has no value
 * {{vars.a-b}}." while a list whose values held that literal took it. Not the `g` regex itself, whose `lastIndex` a
 * `test` would move.
 */
const RUN_FILLED = /\{\{\s*(?:vars|trigger)\.[A-Za-z0-9_.]+\s*\}\}/;

/**
 * The path a run fills from its own context: `{{vars.x}}`, `{{trigger.row.amount}}`, spaces allowed inside the braces.
 *
 * `flow.ts`'s `fill` IMPORTS THIS, so the lint that asks what a question reaches and the runner that fills it read the
 * braces one way. It lives here and not there because `flow.ts` already imports this file, and the lint's own copy is
 * how `{{ trigger.row.pin }}` with spaces would have been read as naming nothing while the run filled it with `hunter2`.
 */
export const RUN_PATH = /\{\{\s*(vars|trigger)\.([A-Za-z0-9_.]+)\s*\}\}/g;

/**
 * The row's own `{{field}}` and `{{kind:field}}`, as `rules.ts`'s `fill` reads them.
 *
 * A COPY, AND THE ONE PLACE THE TWO CAN DRIFT. `fill` writes its pattern inline and exports none, and it is the
 * pass's own file, so the lint holds this beside it and `flow-waits.test.ts` holds the pair to agreeing on every
 * spelling the question test names. Whoever next edits `fill` should import this instead.
 */
const ROW_FILL = /\{\{(\w+)(?::(\w+))?\}\}/g;

/**
 * The fields of a row that a question would carry off the record, by the spelling that reaches each: the row's
 * `{{pin}}` and `{{money:pin}}`, the run's `{{trigger.row.pin}}`, and `{{trigger.row}}`, which names no field and is
 * written as the JSON of the whole row (`flow.ts`'s `fill`, where a path reaches an object).
 *
 * `hidden` IS EVERY FIELD OF THE LIST THAT NEVER LEAVES THE RECORD, retired ones included: a field put away keeps its
 * type in the declaration, and nothing says the rows written before it was retired forgot their values.
 *
 * `rowFill: false` IS FOR A WORD ONLY THE RUN FILLS. A `tag` step's word is filled by `flow.ts`'s `fill` and never by
 * the pass's (`rules.ts` says no `fill` reads it), so `tag: '{{pin}}'` tags the braces as typed, and reading them as the
 * field would refuse a rule that sends nothing.
 *
 * `runFill: false` IS FOR A WORD ONLY THE PASS FILLS, which is a `set` on the inline path: `rules.ts`'s `fill` reads the
 * row's `{{field}}` and leaves `{{trigger.row.pin}}` as typed, so the braces are the words written.
 */
function hiddenIn(question: string, hidden: ReadonlyMap<string, string>, rowFill = true, runFill = true): { field: string; type: string; spelled: string } | null {
  if (rowFill) for (const m of question.matchAll(ROW_FILL)) {
    const field = m[2] ?? m[1]!;
    const type = hidden.get(field);
    if (type !== undefined) return { field, type, spelled: m[0] };
  }
  if (runFill) for (const m of question.matchAll(RUN_PATH)) {
    if (m[1] !== 'trigger') continue;
    const [head, field] = m[2]!.split('.');
    if (head !== 'row') continue;
    if (field === undefined) {
      const [first] = hidden;
      if (first) return { field: first[0], type: first[1], spelled: m[0] };
      continue;
    }
    const type = hidden.get(field);
    if (type !== undefined) return { field, type, spelled: m[0] };
  }
  return null;
}

/**
 * Where a secret or file field entered a variable: the `set_var` that put it there, the variable it went into first,
 * the field, and the spelling that reached it.
 */
type Carried = { at: string; name: string; field: string; type: string; spelled: string };

/** A field of a list as its declaration says it, which is all the lint reads of one. */
type Declared = { id?: unknown; type?: unknown; of?: unknown; retired?: unknown };

/** The fields `register` declares, retired ones included, or `undefined` where the list is not known. */
const fieldsOf = (installed: Known, register: string | null): Declared[] | undefined =>
  register === null ? undefined : (installed.get(`register.${register}`) as { fields?: Declared[] } | undefined)?.fields;

/** Every field of `register` that never leaves the record, by its type, retired ones included (`hiddenIn` says why). */
function hiddenOf(installed: Known, register: string | null): Map<string, string> {
  return new Map((fieldsOf(installed, register) ?? []).flatMap((f) => {
    const sealed = sealedAs(f);
    return sealed === null ? [] : [[String(f.id), sealed] as const];
  }));
}

/**
 * What a `set` or a `tag` may not write, as the refusal, or `null`: a field named any way but by its id, and a value
 * that copies a secret or file field into a field that may leave the record.
 *
 * THE FIELD IS READ AS TYPED, AND SO IT HAS TO BE THE FIELD. `set: { field: '{{vars.f}}', to: '{{pin}}' }` with `f` set
 * to `note` installed, and the pass wrote `note`: the lint read the braces and found no field to follow, and the
 * runner's `writes()` held back `{{vars.f}}` rather than `note`, so the question after it went out as `Rate for
 * hunter2?` (`loop/research-batch-fifty-one-audit.md` §3, L4). A field the list does not have fails every run at the
 * write path, which refuses it `FIELD_UNKNOWN`, so it is refused here with that code. `tags` is one every list takes.
 *
 * A SECRET IS COPIED ONLY WHERE IT STILL NEVER LEAVES. The walk used to follow a field a step wrote from `pin` to the
 * questions and calls later in the same list, and a record has more than one rule: `rule.write` wrote `note` from
 * `{{pin}}` on create, `rule.ask` asked about `note` on an ordinary edit, each installed clean, and the edit queued
 * `Rate for hunter2?` with `about: { note: 'hunter2' }` (the same audit, L1). The write also put the secret in a text
 * field every reader of the list sees. Refusing the copy closes every reader at once, in this rule or any other, so no
 * reader follows a written field any more; a field typed secret or file is already one no reader may send.
 *
 * `run: false` IS THE INLINE PATH, where nothing fills `{{trigger.…}}` or a tag and no variable exists, so only a
 * `set`'s row fill is read (`hiddenIn`'s `runFill`).
 */
function writeFault(
  id: string,
  verb: 'set' | 'tag',
  step: Record<string, unknown>,
  here: string,
  row: string | null,
  fields: Declared[] | undefined,
  hidden: ReadonlyMap<string, string>,
  carried: ReadonlyMap<string, Carried>,
  run: boolean,
): Refusal | null {
  const spec = verb === 'set' && isObject(step.set) ? step.set : undefined;
  const named = verb === 'set' ? spec?.field : 'tags';
  const list = row ?? 'its list';
  if (typeof named !== 'string' || named.trim() === '')
    return bad('DECLARATION_INVALID', `${id}'s ${here}.set.field is ${JSON.stringify(named ?? null)}, and a set names the field it writes by its id in ${list}.`, `${here}.set.field`);
  if (named.includes('{{'))
    return bad(
      'DECLARATION_INVALID',
      `${id} writes ${named} at ${here}, and a set names the field it writes by its id in ${list}, never by braces the run fills. Write the field's id.`,
      `${here}.set.field`,
    );
  const target = fields?.find((f) => f.id === named && f.retired !== true);
  if (fields !== undefined && target === undefined && named !== 'tags')
    return bad(
      'FIELD_UNKNOWN',
      `${id} writes ${named} at ${here}, and ${list} has no field called ${named}.`,
      `${here}.set.field`,
      fields.filter((f) => f.retired !== true).map((f) => String(f.id)),
    );
  const to = verb === 'set' ? spec?.to : step.tag;
  if (typeof to !== 'string' || sealedAs(target) !== null) return null;
  const direct = hidden.size === 0 ? null : hiddenIn(to, hidden, verb === 'set', run);
  const through = direct || !run ? null : carriedIn(to, carried);
  if (!direct && !through) return null;
  const whole = (spelled: string, field: string) => (spelled.replace(/\s/g, '') === '{{trigger.row}}' ? `the whole ${list} row, ${field} in it` : null);
  const lead = direct
    ? `${id} writes ${named} from ${direct.spelled} at ${here}${whole(direct.spelled, direct.field) === null ? '' : `, which is ${whole(direct.spelled, direct.field)}`}`
    : `${id} writes ${named} from ${through!.spelled} at ${here}, and ${through!.name} holds ${whole(through!.from.spelled, through!.from.field) ?? through!.from.field}${through!.from.name === through!.name ? '' : `, by way of ${through!.from.name}`}: ${through!.from.at} put it there with ${through!.from.spelled}`;
  const type = direct ? direct.type : through!.from.type;
  return bad(
    'DECLARATION_INVALID',
    `${lead}, and a ${type} field is copied only into another secret or file field, which ${named} is not. Write ${named} from fields that may leave.`,
    verb === 'set' ? `${here}.set.to` : `${here}.tag`,
  );
}

/**
 * The first `{{vars.x}}` in `text`, any spacing, naming a variable that `carried` says holds a field that never leaves the
 * record, or `null`. Read with `RUN_PATH`, the pattern `fill` writes the variable in with, so a spelling this misses is
 * one the run leaves as typed.
 */
function carriedIn(text: string, carried: ReadonlyMap<string, Carried>): { name: string; spelled: string; from: Carried } | null {
  for (const m of text.matchAll(RUN_PATH)) {
    if (m[1] !== 'vars') continue;
    const name = m[2]!.split('.')[0]!;
    const from = carried.get(name);
    if (from) return { name, spelled: m[0], from };
  }
  return null;
}

/**
 * Whether the text at `path` in an action is one the inline pass fills from the row (`rules.ts`'s `runRules`): the
 * places `fillSites` lists. `flow.ts` leaves these as typed for the pass to fill once, with the run's own paths handed
 * over beside them, and fills every other string of a step itself.
 */
export function passFilled(path: readonly string[]): boolean {
  if (path[0] === 'create') return path[1] === 'fields' && path.length === 3;
  const at = path.join('.');
  return at === 'set.to' || at === 'note' || at === 'notify.say' || at === 'schedule.note' || at === 'suggest.question' || at === 'link.to.value';
}

/**
 * The verbs that put text somewhere other than a field of the run's own row, which `writeFault` holds. The rest put
 * none: `untag` writes back words the row already has, less one; `run` and `call` send the call's declared fields,
 * which `queueCall` holds to the ones that may leave; `if` is read and not written; `set_var` is carried, and followed
 * into every verb here that writes it out; `ask_slash` has its own checks below; `stop` and `wait` carry nothing.
 */
const COPIERS: readonly string[] = ['move', 'link', 'note', 'notify', 'schedule', 'create', 'suggest', 'script', 'ask_person'];

/** Where a text of a step goes, as a refusal names it, from its path inside the step. */
function placeOf(path: readonly string[], spec: Record<string, unknown>): string {
  const at = path.join('.');
  if (path[0] === 'create' && path[1] === 'fields' && path.length === 3) return `${path[2]} of the ${String(spec.register)} row it creates`;
  if (path[0] === 'suggest' && path[1] === 'options') return 'an answer it offers in the queue';
  if (path[0] === 'script' && path[1] === 'input') return `the input ${path[2]} it hands a script`;
  const named: Record<string, string> = {
    note: 'a note',
    'notify.say': 'a notification',
    'schedule.note': 'a reminder',
    'suggest.question': 'a question in the queue',
    'link.to.value': 'the value it links by',
    'ask_person.question': 'its question to a person',
    move: 'the state it moves the row to',
  };
  return named[at] ?? `its ${at}`;
}

/**
 * What a step or an item of `then:` may not copy, as the refusal, or `null`: a secret or file field reached by any
 * spelling that fills it, put into any place its verb puts text, unless that place is a field of another list that
 * never leaves either. `set` and `tag` are `writeFault`'s, and a question to Slash has its own checks in the walk.
 *
 * THE CHECK FOLLOWED `set` AND `tag` AND NOTHING ELSE, measured on 23 September at HEAD `afb3b1b2` over a list whose
 * `pin` is secret (`flow-secret-verbs.test.ts`): `note`, `notify`, `schedule`, `create` into another list's text field,
 * `suggest` and `link` each installed holding `{{pin}}` on the inline path and `{{trigger.row.pin}}`, `{{trigger.row}}`
 * or a variable set from `pin` as a step, and so did a `move`, a script's `input`, a question to a person, and a
 * `create` crossing `each: [pin]`. Every one of those writes where the list's readers, or another list's, can see it.
 *
 * `run: false` IS THE INLINE PATH, where only the texts the pass fills are filled, from the row alone, and no variable
 * exists. On the run path every string of the step is filled from the run first, so every one is read.
 *
 * A QUESTION TO A PERSON IS REFUSED WITH THE REST. `slash-vars-hidden.test.ts` let one read a variable set from `pin`,
 * "which stays in the record"; it stays in the record's one queue, where a `suggest` beside it was the same leak, and
 * everyone who decides reads it.
 */
function copyFault(
  id: string,
  verb: string,
  step: Record<string, unknown>,
  here: string,
  t: { row: string | null; hidden: ReadonlyMap<string, string>; carried: ReadonlyMap<string, Carried>; run: boolean; installed: Known | undefined },
): Refusal | null {
  if (!COPIERS.includes(verb)) return null;
  const spec = isObject(step[verb]) ? (step[verb] as Record<string, unknown>) : {};
  /* A CREATE THAT CROSSES ONE COPIES IT WITH NO TEXT AT ALL: each value becomes `{{each.0}}` and the `_each` of every row
     it makes. */
  if (verb === 'create' && Array.isArray(spec.each)) {
    const field = spec.each.map(String).find((f) => t.hidden.has(f));
    if (field !== undefined)
      return bad(
        'DECLARATION_INVALID',
        `${id} crosses ${field} at ${here}, so every ${String(spec.register)} row it creates would hold a value of it, and a ${t.hidden.get(field)} field is copied only into another secret or file field. Cross fields that may leave.`,
        `${here}.create.each`,
      );
  }
  if (t.hidden.size === 0 && t.carried.size === 0) return null;
  const theirs = verb === 'create' && t.installed !== undefined ? fieldsOf(t.installed, String(spec.register)) : undefined;
  const list = t.row ?? 'its list';
  const texts: { path: string[]; text: string }[] = [];
  const collect = (v: unknown, path: string[]): void => {
    if (typeof v === 'string') texts.push({ path, text: v });
    else if (Array.isArray(v)) v.forEach((one, i) => collect(one, [...path, String(i)]));
    else if (isObject(v)) for (const [k, one] of Object.entries(v)) collect(one, [...path, k]);
  };
  collect(step[verb], [verb]);
  for (const { path, text } of texts) {
    const rowFill = passFilled(path) || path.join('.') === 'ask_person.question';
    if (!t.run && !passFilled(path)) continue;
    if (path[0] === 'ask_person' && path[1] !== 'question') continue;
    /* INTO A FIELD OF THE OTHER LIST THAT NEVER LEAVES EITHER, which no reader of it can see. */
    if (path[0] === 'create' && path.length === 3 && sealedAs(theirs?.find((f) => f.id === path[2] && f.retired !== true)) !== null) continue;
    const direct = t.hidden.size === 0 ? null : hiddenIn(text, t.hidden, rowFill, t.run);
    const through = direct || !t.run ? null : carriedIn(text, t.carried);
    if (!direct && !through) continue;
    const where = `${here}.${path.join('.')}`;
    const place = placeOf(path, spec);
    if (direct) {
      const whole = direct.spelled.replace(/\s/g, '') === '{{trigger.row}}' ? `the whole ${list} row, ${direct.field} in it` : direct.field;
      return bad(
        'DECLARATION_INVALID',
        `${id} copies ${whole} into ${place} at ${here} with ${direct.spelled}, and a ${direct.type} field is copied only into another secret or file field. Take ${direct.spelled} out.`,
        where,
      );
    }
    const from = through!.from;
    const held = from.spelled.replace(/\s/g, '') === '{{trigger.row}}' ? `the whole ${list} row, ${from.field} in it` : from.field;
    return bad(
      'DECLARATION_INVALID',
      `${id} copies ${through!.spelled} into ${place} at ${here}, and ${through!.name} holds ${held}${from.name === through!.name ? '' : `, by way of ${from.name}`}: ${from.at} put it there with ${from.spelled}, and a ${from.type} field is copied only into another secret or file field. Take ${through!.spelled} out, or set ${through!.name} from fields that may leave.`,
      where,
    );
  }
  return null;
}

/**
 * The name a step keeps its answer under, or `null` when it keeps none: `set_var`'s `name`, or the `as:` of a `script`,
 * a `call` or either ask. `stepFault` has already held each to `NAME` by the time the walk asks this.
 */
function keptBy(verb: string, step: Record<string, unknown>): string | null {
  const spec = step[verb];
  if (!isObject(spec)) return null;
  const name = verb === 'set_var' ? spec.name : verb === 'script' || verb === 'call' || verb === 'ask_slash' || verb === 'ask_person' ? spec.as : undefined;
  return typeof name === 'string' ? name : null;
}

/**
 * The first `{{vars.x}}` a step reads whose `x` no step before it certainly kept, as the refusal, or `null`.
 *
 * NOTHING ASKED THIS FOR ANY KIND UNTIL 24 SEPTEMBER. `stepFault` held a name to `NAME` where it was kept and nothing
 * looked at a name where it was read, so `{{vars.nope}}` with no step keeping `nope`, a read after a `call` with no
 * `as:`, and (once `db7074ad` made its `as:` optional) a read after a `script` with none, each linted clean, installed
 * and ran `done`, and `fill` wrote a dash where the name was (`flow.ts`'s `pathValue`). Audit sixty-six, finding 7,
 * measured the note reading "queued as —" (`flow-lint-as-read.test.ts`).
 *
 * EVERY STRING OF THE STEP IS A READ, because on the run path `fill` fills every one from the run before the step acts,
 * a condition's included; an `if`'s arms are its children and are walked as their own steps. Only the first segment is
 * the name: `{{vars.r.value}}` reads `r`.
 *
 * `kept` IS WHAT CERTAINLY RAN, which is why the refusal says which of two things went wrong: a name no step keeps is
 * missing an `as:`, and one kept only later or in one arm of a branch is in the wrong place.
 */
function unkeptIn(id: string, verb: string, step: Record<string, unknown>, here: string, kept: ReadonlySet<string>, anywhere: ReadonlySet<string>): Refusal | null {
  const texts: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (isObject(v)) Object.values(v).forEach(collect);
  };
  collect(step[verb]);
  for (const text of texts)
    for (const m of text.matchAll(RUN_PATH)) {
      if (m[1] !== 'vars') continue;
      const name = m[2]!.split('.')[0]!;
      if (kept.has(name)) continue;
      return anywhere.has(name)
        ? bad(
            'DECLARATION_INVALID',
            `${id} reads ${m[0]} at ${here}, and ${name} is kept only by a step that does not certainly run before it: a later step, or one arm of a branch. Keep ${name} before this step on every way to it, or take ${m[0]} out.`,
            here,
            kept.size === 0 ? undefined : [...kept],
          )
        : bad(
            'DECLARATION_INVALID',
            `${id} reads ${m[0]} at ${here}, and no step keeps an answer called ${name}, so the run would write a dash in its place. Keep it with as: ${name} on the step that makes it, or take ${m[0]} out.`,
            here,
            kept.size === 0 ? undefined : [...kept],
          );
    }
  return null;
}

/**
 * Where the first `ask_slash` step of a body sits, as `steps[1]` or `steps[0].then[2]`, or `null` when it asks nothing.
 *
 * ITS OWN WALK, BOTH ARMS OF EVERY BRANCH, because `actionsOf` returns only `ACTIONS` and `ask_slash` is a step's verb.
 * `index.ts`'s `unserved` asks this at every install path, and refuses the step at this place on a host that has not said
 * it answers one.
 */
export function slashAskAt(decl: FlowDecl): string | null {
  const walk = (list: unknown, at: string): string | null => {
    if (!Array.isArray(list)) return null;
    for (const [i, step] of list.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${i}]`;
      if ('ask_slash' in step) return here;
      if ('if' in step) {
        const inner = walk(step.then, `${here}.then`) ?? walk(step.else, `${here}.else`);
        if (inner !== null) return inner;
      }
    }
    return null;
  };
  return walk(decl.then, 'then') ?? walk(decl.steps, 'steps');
}

/**
 * Every `tag` and `untag` of a rule that a list's declared `tags` would refuse, with where it sits and, for a
 * `list<enum>`, the word the enum lacks. Empty when the list takes every one.
 *
 * THE SHAPE ALONE WAS THE FIRST QUESTION, AND IT REFUSED A LIST THAT WORKS. Wave thirty-eight's check read any `tags` that
 * was not `list<text>` as refusing every tag, so `tags: list<enum>` of `[late, chase]` under `rule.late` tagging `late` was
 * refused `FIELD_TYPE_CHANGED` "would refuse every tag it writes", though every write that rule makes is a value the enum
 * takes. An enum is asked word by word:
 *
 *   - A `tag` whose word the values lack is refused, since the pass writes the row's tags plus that word in one patch with
 *     everything else the rule does. Measured over `[chase]` with `then: [{ tag: late }, { set: note }]`: the Rent went
 *     in holding `what` alone, neither the tag nor the note, and nothing was refused.
 *   - An `untag` never is: the pass writes back the words the row already holds, less one, and the list took those.
 *   - A tag on the run path holding `{{vars.…}}` or `{{trigger.…}}` is filled from the run, so no word exists to compare
 *     at install. It is let through in silence rather than guessed at. On the `then:` path nothing fills a tag, so the
 *     braces there are the literal word and are judged like any other.
 *
 * ANY OTHER SHAPE REFUSES EVERY ONE, `untag` included, because the pass always writes an array.
 *
 * AND SO DOES A RETIRED `tags`, WHATEVER ITS SHAPE. Both callers passed over a retired one ("not a shape this check
 * reads"), and the write path answers `FIELD_UNKNOWN` for a field put away, so the pass's one patch went whole: the
 * audit of wave thirty-nine (finding 3) retired a `list<text>` under `rule.late` doing `[{ tag: late }, { set: note }]`,
 * and the Rent went in holding `what` alone. It was let through where `tags: int` under the same rule is refused.
 */
export function tagsRefusing(
  decl: FlowDecl,
  tags: { type?: unknown; of?: unknown; values?: unknown; retired?: unknown },
): { verb: 'tag' | 'untag'; at: string; word?: string }[] {
  if (tags.retired === true)
    return actionsOf(decl).flatMap(({ action, at }): { verb: 'tag' | 'untag'; at: string }[] =>
      'tag' in action ? [{ verb: 'tag', at }] : 'untag' in action ? [{ verb: 'untag', at }] : [],
    );
  if (tags.type === 'list' && tags.of === 'text') return [];
  const out: { verb: 'tag' | 'untag'; at: string; word?: string }[] = [];
  const enumOf = tags.type === 'list' && tags.of === 'enum';
  const values = enumOf && Array.isArray(tags.values) ? new Set(tags.values.map(String)) : new Set<string>();
  for (const { action, at } of actionsOf(decl)) {
    if (!('tag' in action) && !('untag' in action)) continue;
    const verb = 'tag' in action ? 'tag' : 'untag';
    if (!enumOf) {
      out.push({ verb, at });
      continue;
    }
    const word = action.tag;
    if (verb === 'untag' || typeof word !== 'string') continue;
    if (at.startsWith('steps') && RUN_FILLED.test(word)) continue;
    if (!values.has(word)) out.push({ verb, at, word });
  }
  return out;
}

/** The words `tagsRefusal` names a declared `tags` by: its type, or "a retired tags", which has no type a write can meet. */
export const tagsShape = (tags: { type?: unknown; of?: unknown; retired?: unknown }): string =>
  tags.retired === true ? 'a retired tags' : `${String(tags.type)}${tags.of === undefined ? '' : `<${String(tags.of)}>`}`;

/**
 * The refusal of a list's `tags` under a rule that tags it, ONE SENTENCE WHICHEVER ARRIVED SECOND. The list narrowed
 * under the rule and the rule installed over the narrowed list are the same fault, and a person who meets both should
 * read the same words; only `at` moves, to the declaration the change sent.
 */
export function tagsRefusal(
  register: string,
  rule: string,
  found: { verb: 'tag' | 'untag'; at: string; word?: string },
  shape: string,
  at: string,
): Refusal {
  const lead = `register.${register}.tags: every list takes tags as list<text>, and ${rule} ${found.verb}s ${register}`;
  return found.word === undefined
    ? bad('FIELD_TYPE_CHANGED', `${lead} at ${found.at}, so ${shape} would refuse every tag it writes. Leave tags out, or declare it as list<text>.`, at)
    : bad(
        'FIELD_TYPE_CHANGED',
        `${lead} ${found.word} at ${found.at}, so list<enum> without ${found.word} would refuse every write that tags it. Leave tags out, declare it as list<text>, or add ${found.word} to its values.`,
        at,
      );
}

/**
 * What an automation body may not say, as the first refusal, or `null`.
 *
 * A BODY WITH NO `on:` AND NONE OF THE NEW KEYS MEETS ONE NEW CHECK HERE, that it names a register. Before this, a rule
 * with no register installed and was selected by nothing: the pass reads rules with `r.register === register`, and
 * `undefined` equals no register. Every other check below is about a key that did not exist yesterday, so a rule
 * installed yesterday lints the same today.
 */
export function flowFault(id: string, body: Record<string, unknown>, installed?: Known): Refusal | null {
  const decl = body as FlowDecl;

  const triggered = triggerFault(id, body.on, installed);
  if (triggered) return triggered;

  if (body.then !== undefined && body.steps !== undefined)
    return bad('DECLARATION_INVALID', `${id} declares both then: and steps:, and a rule does one list of things. Move then: into steps:.`, 'steps');
  if (body.then === undefined && body.steps === undefined)
    return bad('REQUIRED_MISSING', `${id} says when, and does not say what it would then do.`, 'then');
  if (body.steps !== undefined && (!Array.isArray(body.steps) || body.steps.length === 0))
    return bad('DECLARATION_INVALID', `${id}'s steps: is a list of at least one step.`, 'steps');

  /* BOTH PATHS, BECAUSE THE INLINE ONE ONLY REFUSED `false`. `enabled: 'false'` installed there beside a refused
     `enabled: false`, and `name: 42` installed on either path and reached the canvas card as a number. */
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean')
    return bad('DECLARATION_INVALID', `${id}'s enabled: is true or false.`, 'enabled');
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === ''))
    return bad('DECLARATION_INVALID', `${id}'s name: is the words its card shows.`, 'name');

  const path = pathOf(decl);
  const trigger = triggerOf(decl);
  const written = trigger === 'written' && isObject(body.on) ? (body.on.written as { register: string }) : null;

  if (path === 'inline') {
    /* THE INLINE PASS SELECTS A RULE BY ITS TOP-LEVEL `register`, and by nothing else. So `on: { written: { register }
       }` alone would be a rule the pass never finds; writing both is redundant, and it is the price of keeping one pass
       that reads rules exactly as it did before `on:` existed. */
    if (typeof body.register !== 'string' || body.register === '')
      return written
        ? bad('REQUIRED_MISSING', `${id} runs on writes to ${written.register}. Write register: ${written.register} beside it, which is the key the write path reads.`, 'register')
        : bad('REQUIRED_MISSING', `${id} names no register and no trigger, so nothing would ever start it. Give it register: or on:.`, 'register');
    if (written && written.register !== body.register)
      return bad('DECLARATION_INVALID', `${id} is about ${body.register} and runs on writes to ${written.register}. One rule, one register.`, 'on.written.register');
    /* THREE KEYS THE INLINE PASS WOULD READ AS NOTHING. `enabled: false` would keep firing, `limits` would never count,
       and `project` would fire for every project's rows. Refused until the pass reads them, because a switch that is
       drawn and does nothing is worse than no switch. */
    for (const key of ['project', 'limits'] as const)
      if (body[key] !== undefined)
        return bad('NOT_IN_THIS_BUILD', `${id} runs inside the write, and the inline pass does not read ${key}: yet. Give it a trigger other than a plain write, or drop ${key}:.`, key);
    if (body.enabled === false)
      return bad('NOT_IN_THIS_BUILD', `${id} runs inside the write, and the inline pass does not read enabled: yet. Retire the rule to stop it.`, 'enabled');
    /* THE FIGURE LINT IS ASKED HERE AND NOT INSIDE `inlineFault`, so that it runs at install and nowhere else.
       `rules.ts` also asks `inlineFault` of each item the inline pass acts, and skips the item on NOT_IN_THIS_BUILD,
       so putting it there would change what the pass does to a body stored before this lint, which is a separate
       decision. Before this line the inline rule installed and wrote `{{metric.total}}` into the row as typed, since
       the inline pass fills no figure. */
    return inlineFault(id, decl, installed) ?? figureFault(id, body, 'inline', installed);
  }

  /* A RUN KEEPS ITS REGISTER IN ITS TRIGGER. A top-level `register` is what the inline pass selects by, so a clock rule
     carrying one would ALSO fire inside every write of that register, running a body meant for a tick against a row. */
  if (body.register !== undefined && body.on === undefined)
    return bad('DECLARATION_INVALID', `${id} declares steps:, which run after the write rather than inside it. Move register: into on: { written: { register: ${String(body.register)} } }.`, 'register');
  if (body.register !== undefined)
    return written
      ? bad('DECLARATION_INVALID', `${id} runs as a run, and a top-level register: would also run it inside every write of ${String(body.register)}. Keep the register in on.written only.`, 'register')
      : bad('DECLARATION_INVALID', `${id} is started by ${trigger}, and a top-level register: would also start it on every write of ${String(body.register)}. Drop register:.`, 'register');

  if (body.on === undefined)
    return bad('REQUIRED_MISSING', `${id} names no register and no trigger, so nothing would ever start it. Give it on:.`, 'on', TRIGGERS);
  if (body.project !== undefined && (typeof body.project !== 'string' || body.project === ''))
    return bad('DECLARATION_INVALID', `${id}'s project: is the id of a project.`, 'project');
  const limited = limitsFault(id, body.limits);
  if (limited) return limited;

  const rowless = ROWLESS.includes(trigger);
  if (rowless && body.when !== undefined)
    return bad('DECLARATION_INVALID', `${id} is started by ${trigger}, which has no row for when: to be about. Put the condition in an if step.`, 'when');
  /* AN ARRIVAL'S `when:` WOULD BE READ AGAINST THE RAW PAYLOAD, and the runner does not read it: a run starts for every
     arrival its `ingest`, `channel` and `state` admit. Refused rather than installed as a filter that filters nothing. */
  if (trigger === 'arrival' && body.when !== undefined)
    return bad('NOT_IN_THIS_BUILD', `${id} is started by an arrival, and the runner does not read when: on one yet. Narrow it with ingest:, channel: or state:, or test the row in an if step.`, 'when');
  /* A RULE ABOUT TIME IS RE-READ EACH HOUR ONLY ON THE INLINE PATH. `rulesAboutTime` hands every such rule to
     `applyRule`, which finds its rows by the top-level `register:`, and a run-path rule has none: measured on 22
     September, a rule saying `due before today` with `once_per` installed here, its row went past due, and a sweep
     by hand started nothing. Refused until the sweep starts runs; without `once_per` the sweep skips an inline rule
     too, so that body reads on writes alone on either path and is let through. */
  if (trigger === 'written' && Array.isArray(body.once_per) && body.once_per.length > 0 && RELATIVE_DAY.test(JSON.stringify(body.when ?? '')))
    return bad(
      'NOT_IN_THIS_BUILD',
      `${id} names a day relative to today in when:, and only a rule that runs inside the write is read again as the days pass. Write it with register: and then:, and no op:, fields:, from_rules: or steps:.`,
      'when',
    );

  /* THE WALK: shape, verbs, depth, count and names, over `then` or `steps` alike, since on this path `then` is a flat
     list of steps. */
  const names = new Set<string>();
  let count = 0;
  const row = installed === undefined ? null : rowOf(decl, trigger, installed);
  const fields = installed === undefined ? undefined : fieldsOf(installed, row);
  const hidden = installed === undefined ? new Map<string, string>() : hiddenOf(installed, row);
  /* EVERY VARIABLE A `set_var` FILLED FROM A FIELD THAT NEVER LEAVES THE RECORD, by the step that did it, as it stands
     on the way into each step. Read in the walk's own order, which is the order the plan takes the steps in, so only a
     step before the question counts.

     ONE MAP PER WAY THROUGH A BRANCH, JOINED AFTER IT. Each arm starts from what held before the `if` and is walked
     with its own copy, and a variable carried out of either arm is carried after the branch, since the lint cannot
     tell which arm the row will take. The first form of this kept one map for the whole walk, so `pin` set in a `then`
     refused a question in its own `else`, which no run reaches after that `then`: a plan has no loops, and `plan` puts
     a jump past the `else` at the end of every `then` that has one.

     A `set_var` OF THE SAME NAME THAT CARRIES NOTHING TAKES IT OFF, on the way it is on. A run's `vars` holds the last
     write, and the runner drops what it kept for a name whose second fill matches its first (`flow.ts`'s `set_var`), so
     the question reads the plain value: `slash-vars-hidden.test.ts` has `r` set from `pin` then `note` asked about as
     `plain`.
     Taken off inside one arm, it is still carried out of the other, so a question after the branch is refused unless
     both arms set it plainly. A write that reads the name it writes, `to: 'again {{vars.p}}'`, carries it, so it is not
     plain and takes nothing off. An answer written with `as:` is left carried: the runner drops the kept dash for it
     too, and the lint has not been taught that.

     NO FIELD OF THE ROW IS CARRIED THIS WAY, because no step may write one from a secret (`writeFault`). A second map
     held the fields a step wrote from one, for the questions and calls later in the same list, and it could see no
     further than that list. */
  /* EVERY NAME THE BODY KEEPS ANYWHERE, so that `unkeptIn` can tell a missing `as:` from a name kept in the wrong place.
     `names` is filled as the walk goes, and so does not yet hold a name kept by a later step. */
  const anywhere = new Set<string>();
  const keptAnywhere = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const step of list) {
      if (!isObject(step)) continue;
      for (const verb of FLOW) {
        const name = verb in step ? keptBy(verb, step) : null;
        if (name !== null) anywhere.add(name);
      }
      if ('if' in step) {
        keptAnywhere(step.then);
        keptAnywhere(step.else);
      }
    }
  };
  keptAnywhere(body.steps ?? body.then);
  /* `kept` IS THE NAMES A RUN CERTAINLY HOLDS ON THE WAY INTO EACH STEP, walked per arm as `carried` is, but joined the
     other way after a branch: a variable is carried out of a branch if EITHER arm carried it, since either may run, and
     a name is kept after one only if BOTH arms kept it, since either may not. */
  const walk = (list: unknown, at: string, depth: number, carried: Map<string, Carried>, kept: Set<string>): Refusal | null => {
    if (!Array.isArray(list)) return bad('DECLARATION_INVALID', `${id}'s ${at} is a list of steps.`, at);
    for (const [i, step] of list.entries()) {
      const here = `${at}[${i}]`;
      if (!isObject(step)) return bad('DECLARATION_INVALID', `${id}'s ${here} is not a step.`, here, VERBS);
      count++;
      if (count > STEP_CEILING)
        return bad('OUT_OF_BOUNDS', `${id} declares more than ${STEP_CEILING} steps, the most one automation holds. Split it in two.`, here);
      const verbs = Object.keys(step).filter((k) => VERBS.includes(k));
      if (verbs.length !== 1)
        return bad('DECLARATION_INVALID', `${id}'s ${here} names ${verbs.length === 0 ? 'no step' : verbs.join(' and ')}. A step is exactly one of these.`, here, VERBS);
      const verb = verbs[0]!;
      if (rowless && ROW_VERBS.includes(verb))
        return bad('DECLARATION_INVALID', `${id} is started by ${trigger}, which has no row, and ${here} is ${verb}, which acts on one.`, here);
      const fault = stepFault(id, verb, step, here, subjectOf(decl), installed, names);
      if (fault) return fault;
      /* `about:` IS FIELDS OF THE RUN'S ROW, SO IT NEEDS ONE, and the fields have to be on it. The runner reads each
         from the row it holds and would send `null` for a field the list does not have, which is a question with its
         facts missing and no sentence to say so. A field the lint cannot place, on an arrival at no named door, is
         left to the runner. */
      if (verb === 'ask_slash' && (step.ask_slash as { about?: unknown }).about !== undefined) {
        const about = (step.ask_slash as { about: string[] }).about;
        if (rowless) return bad('DECLARATION_INVALID', `${id} is started by ${trigger}, which has no row, and ${here} sends fields of one with about:.`, `${here}.ask_slash.about`);
        if (fields !== undefined)
          for (const name of about) {
            const field = fields.find((f) => f.id === name);
            if (!field) return bad('FIELD_UNKNOWN', `${id} sends ${name} to Slash at ${here}, and ${row} has no field called ${name}.`, `${here}.ask_slash.about`);
            const sealed = sealedAs(field);
            if (sealed !== null) return bad('DECLARATION_INVALID', `${id} sends ${name} to Slash at ${here}, and a ${sealed} field never leaves the record.`, `${here}.ask_slash.about`);
          }
      }
      /* A VARIABLE CARRIES WHAT IT WAS SET FROM. `set_var` fills `to` from the whole row, before `sendable` is anywhere
         near it, so the question's own braces were checked and a variable was not: audit forty-six measured, through a
         real self-host, `set_var: { to: '{{trigger.row.pin}}' }` then `{{vars.p}}` installing clean and the model's
         request body holding "What rate applies to Rent, given hunter2?". A variable set from another carried one
         carries it too, and the refusal names the `set_var` where the field went in. */
      if (verb === 'set_var') {
        const spec = step.set_var as { name: string; to: string };
        const direct = hidden.size === 0 ? null : hiddenIn(spec.to, hidden);
        const through = direct ? null : carriedIn(spec.to, carried);
        if (direct) carried.set(spec.name, { at: here, name: spec.name, ...direct });
        else if (through) carried.set(spec.name, through.from);
        else carried.delete(spec.name);
      }
      /* A STEP THAT WRITES THE ROW MAY NOT COPY A SECRET INTO IT (`writeFault` says why, and what the audits measured).
         This is the one place the row is followed: with the copy refused, a question, `about:` or a call later in this
         list or in another rule reads a field no step filled from a secret, which is why the checks here that followed
         a written field to a question and to a call are gone. `note` and `create` write no field of this row, and
         `move` writes the state, which `declare.ts` holds to an enum of the list's own words. */
      if (verb === 'set' || verb === 'tag') {
        const fault = writeFault(id, verb, step, here, row, fields, hidden, carried, true);
        if (fault) return fault;
      }
      /* AND A STEP THAT PUTS TEXT ANYWHERE ELSE MAY NOT COPY ONE THERE EITHER (`copyFault`). */
      const copied = copyFault(id, verb, step, here, { row, hidden, carried, run: true, installed });
      if (copied) return copied;
      if (verb === 'ask_slash') {
        const via = carriedIn(String((step.ask_slash as { question: unknown }).question), carried);
        if (via) {
          const held = via.from.spelled.replace(/\s/g, '') === '{{trigger.row}}' ? `the whole ${row ?? 'trigger'} row, ${via.from.field} in it` : via.from.field;
          return bad(
            'DECLARATION_INVALID',
            `${id} puts ${via.spelled} in its question to Slash at ${here}, and ${via.name} holds ${held}${via.from.name === via.name ? '' : `, by way of ${via.from.name}`}: ${via.from.at} put it there with ${via.from.spelled}, and a ${via.from.type} field never leaves the record. Take ${via.spelled} out of the question, or set ${via.name} from fields that may leave.`,
            `${here}.ask_slash.question`,
          );
        }
      }
      /* AND THE QUESTION ITSELF LEAVES THE RECORD, so what it names is held to the rule `about:` is. `about:` was
         checked and the question was not: over a list whose `pin` is secret, `{{pin}}` in the question installed, and
         the checker measured on 23 September, through `ask_person`, whose question is filled the same way, that
         `{{trigger.row.pin}}` and `{{ trigger.row.pin }}` were asked as `hunter2` and `{{trigger.row}}` as the JSON of
         the whole row, `pin` in it. Each spelling is read with the pattern that fills it (`ROW_FILL`, `RUN_PATH`). */
      if (verb === 'ask_slash' && !rowless) {
        const found = hidden.size === 0 ? null : hiddenIn(String((step.ask_slash as { question: unknown }).question), hidden);
        if (found)
          return bad(
            'DECLARATION_INVALID',
            found.spelled.replace(/\s/g, '') === '{{trigger.row}}'
              ? `${id} puts the whole ${row} row in its question to Slash at ${here} with ${found.spelled}, and ${found.field} is a ${found.type} field, which never leaves the record. Name the fields the question needs instead.`
              : `${id} puts ${found.field} in its question to Slash at ${here} with ${found.spelled}, and a ${found.type} field never leaves the record. Take it out of the question.`,
            `${here}.ask_slash.question`,
          );
      }
      /* A CALL THAT SENDS A ROW NEEDS ONE, AS A STEP OR AS `run:`. `run:` was refused on a clock by `ROW_VERBS` and the
         same call as a step installed on a clock, a button and any arrival (audit thirty-two, section 4): an hourly
         post of a row nobody handed it, and a pattern of sending the owner approved as once per row and never saw.
         A call that sends nothing, the price GET of `07 §6.2`, needs no row and installs on a clock. `written` is
         `callFault`'s to check, against the register the rule is about. */
      if (installed !== undefined && trigger !== 'written' && (verb === 'call' || verb === 'run')) {
        const name = verb === 'call' ? (step.call as { ingest?: unknown }).ingest : step.run;
        const from = sendsFrom(installed.get(`ingest.${String(name)}`) as { sends?: unknown } | undefined);
        if (from !== null && from !== row)
          return bad(
            'DECLARATION_INVALID',
            `${id} is started by ${trigger}, which brings ${row === null ? `no ${from} row` : `a ${row} row`}, and ${here} ${verb === 'call' ? 'calls' : 'runs'} ${String(name)}, which sends fields of ${from}. Start it from writes to ${from}${trigger === 'arrival' ? `, or from arrivals at an ingest that writes ${from}` : ''}.`,
            here,
          );
      }
      /* A READ OF A NAME NOTHING KEPT YET, asked before this step's own name is added, since a step reads before it keeps.
         AFTER THE SECRET CHECKS AT THE SAME STEP, so that a question reading a variable set from `pin` in one arm is
         told about `pin`, which is the refusal that matters more, and `slash-vars-hidden.test.ts` holds that sentence. */
      const unkept = unkeptIn(id, verb, step, here, kept, anywhere);
      if (unkept) return unkept;
      const keeps = keptBy(verb, step);
      if (keeps !== null) kept.add(keeps);
      if (verb === 'if') {
        if (depth >= DEPTH_CEILING)
          return bad('OUT_OF_BOUNDS', `${id} nests a branch ${depth + 1} deep at ${here}, and ${DEPTH_CEILING} is the most. Lift the inner branch into its own step.`, here);
        /* AN `if` WITH NO `else` HAS AN EMPTY ONE, so what held before the branch is one of the two ways out of it. */
        const yes = new Map(carried);
        const no = new Map(carried);
        const keptYes = new Set(kept);
        const keptNo = new Set(kept);
        const inner =
          walk(step.then, `${here}.then`, depth + 1, yes, keptYes) ?? (step.else === undefined ? null : walk(step.else, `${here}.else`, depth + 1, no, keptNo));
        if (inner) return inner;
        carried.clear();
        for (const [name, from] of [...no, ...yes]) carried.set(name, from);
        for (const name of keptYes) if (keptNo.has(name)) kept.add(name);
      }
    }
    return null;
  };
  const walked = walk(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then', 0, new Map(), new Set());
  if (walked) return walked;

  const ceiling = isObject(body.limits) && typeof body.limits.steps_per_run === 'number' ? body.limits.steps_per_run : STEP_CEILING;
  if (count > ceiling)
    return bad('OUT_OF_BOUNDS', `${id} declares ${count} steps and limits itself to ${ceiling}. Raise the limit or cut a step.`, 'limits.steps_per_run');
  if (names.size > VARS_CEILING)
    return bad('OUT_OF_BOUNDS', `${id} names ${names.size} answers, and a run holds ${VARS_CEILING}.`, 'steps');

  /* ONCE_PER ON A TRIGGER ABOUT A ROW, as `notify` has always needed on the inline path: a run that asks or calls on
     every write of a row is the same question sent again each time somebody fixes a typo. A trigger with no row has no
     tuple to be once per, and each of its fires is already one event. */
  if (!rowless && trigger !== 'arrival' && !(Array.isArray(body.once_per) && body.once_per.length > 0)) {
    const loud = firstVerb(body.steps ?? body.then, ONCE);
    if (loud) return bad('REQUIRED_MISSING', `${id} ${loud}s about a row and declares no once_per, so it would do it on every write of the row.`, 'once_per');
  }

  /* A CHOICE IS BETWEEN TWO OR MORE, EACH ONCE, because the gate's `propose` refuses anything less and the runner opens
     its question through it: a question of one installed here and failed at every run. Held after `once_per` and not
     inside the walk, so that a body missing both is told about the key it is missing first, as it always was. */
  const choice = (list: unknown, at: string): Refusal | null => {
    if (!Array.isArray(list)) return null;
    for (const [i, step] of list.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${i}]`;
      const options = isObject(step.ask_person) ? step.ask_person.options : undefined;
      if (Array.isArray(options) && (options.length < 2 || new Set(options).size !== options.length))
        return bad('OUT_OF_BOUNDS', `${id} asks a person at ${here} to choose from ${options.length < 2 ? 'one answer' : 'the same answer twice'}. A choice is between at least two, each once.`, `${here}.ask_person.options`);
      if ('if' in step) {
        const inner = choice(step.then, `${here}.then`) ?? choice(step.else, `${here}.else`);
        if (inner) return inner;
      }
    }
    return null;
  };
  /* A FIGURE IS NAMED AT INSTALL, as a trigger's `metric.id` is. Measured on 24 September before this was asked:
     `{{metric.nope}}` installed and wrote `x —`, and `{{metric:total}}` wrote the same dash, into a row nobody would
     trace back to the rule. */
  return choice(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then') ?? fillFault(id, decl, installed) ?? figureFault(id, body, 'run', installed);
}

/**
 * What the inline path refuses about the items of `then:`, alone: a verb only a step has, then every value the pass
 * fills or writes that is not text. `flowFault` asks it at install, and it is exported for a caller holding a body that
 * never came through install, which is the dry run (`loop/research-batch-forty-audit.md` finding 6).
 *
 * THE INLINE PASS HAS AN ARM FOR EACH OF `ACTIONS` AND FOR NOTHING ELSE (`rules.ts`'s `runRules`). It walks `then` and
 * acts on the first action each item carries, so a step's verb there is read as nothing and whatever sits beside it is
 * acted on. Audit forty, finding 3: `{ if, then: [], set: { to: 5 } }` installed and threw out of every write, and an
 * `if` whose arm set a field installed and its arm never ran. Measured on 23 September, after the `fill` guard: the
 * first now sets the field whatever the condition says, `wait: 1h` beside a `set` wrote the note at once, and `set_var`
 * and `ask_person` did nothing at all. `actionsOf` walks an `if`'s arms and not the verbs beside it, which is why the
 * fill lint never saw that `set`; refusing the `if` here means nothing on this path is beside one.
 *
 * ONLY ON THE INLINE PATH, SINCE A RUN'S `then:` IS A LIST OF STEPS. `flowFault` asks this only once `pathOf` said
 * `inline`, but a dry run need not: checked on 23 September, `{ on: { written: { register: jobs, op: [create] } },
 * then: [{ if, then: [...] }] }` installs, and this refused it "does not branch" before the path was asked here.
 */
export function inlineFault(id: string, decl: FlowDecl, installed?: Known): Refusal | null {
  const then: unknown = decl.then;
  if (Array.isArray(then) && pathOf(decl) === 'inline')
    for (const [i, item] of then.entries()) {
      if (!isObject(item)) continue;
      const verb = (FLOW as readonly string[]).find((v) => v in item);
      if (verb === undefined) continue;
      const here = `then[${i}]`;
      const register = typeof decl.register === 'string' ? decl.register : 'its list';
      return bad(
        'NOT_IN_THIS_BUILD',
        `${id}'s ${here} is ${verb}, and a rule that runs inside the write ${verb === 'if' ? 'does not branch' : `has no ${verb}`}. Move then: into steps: and register: into on: { written: { register: ${register} } }, where it runs as a run after the write.`,
        `${here}.${verb}`,
      );
    }
  return fillFault(id, decl, installed) ?? inlineWrites(id, decl, installed);
}

/**
 * Each item of the inline path held to what a step is: a `set`'s field by id and no secret copied into a field that may
 * leave (`writeFault`), and no secret copied into any other place the pass fills from the row (`copyFault`).
 *
 * THE INLINE PASS READS THE LIST ITS OWN WAY, so this is not the walk `flowFault` takes over steps. It fills a `set`'s
 * `to` with `rules.ts`'s `fill` alone, which reads `{{field}}` and `{{kind:field}}` and leaves `{{trigger.row.token}}`
 * as typed, and it reads no variable, since the pass has none. A `tag` is filled by nothing here, so it copies nothing.
 * This replaced a check that followed a `set` from a secret to a `run:` of the same `then:`: measured on 23 September
 * before that check, `then: [{ set: { field: party, to: '{{token}}' } }, { run: paid_hook }]` queued `party:
 * 'hunter2'`, and a second rule running the same call queued it too, which no check of one body could see. The copy
 * is the fault in both, and it is refused whichever rule would send it.
 */
function inlineWrites(id: string, decl: FlowDecl, installed?: Known): Refusal | null {
  if (installed === undefined || pathOf(decl) !== 'inline' || !Array.isArray(decl.then) || typeof decl.register !== 'string') return null;
  const fields = fieldsOf(installed, decl.register);
  const hidden = hiddenOf(installed, decl.register);
  for (const [i, item] of (decl.then as unknown[]).entries()) {
    if (!isObject(item)) continue;
    const here = `then[${i}]`;
    const fault =
      ('set' in item ? writeFault(id, 'set', item, here, decl.register, fields, hidden, new Map(), false) : null) ??
      /* EVERY VERB THE ITEM CARRIES, since the pass acts on the first in its own order and nothing refuses a second. */
      ACTIONS.reduce<Refusal | null>((found, verb) => found ?? (verb in item ? copyFault(id, verb, item, here, { row: decl.register!, hidden, carried: new Map(), run: false, installed }) : null), null);
    if (fault) return fault;
  }
  return null;
}

/**
 * The states a rule's row can be moved to, from its list's `state:` enum, or `null` where the list or its lifecycle is
 * not known, which is every call without `installed` and an arrival at no named door.
 */
function statesOf(decl: FlowDecl, installed?: Known): { register: string; values: string[] } | null {
  if (installed === undefined) return null;
  const register = rowRegisterOf(decl, (door) => installed.get(`ingest.${door}`));
  if (register === null) return null;
  const list = installed.get(`register.${register}`) as { state?: unknown; fields?: { id?: unknown; values?: unknown }[] } | undefined;
  const field = typeof list?.state === 'string' && Array.isArray(list.fields) ? list.fields.find((f) => f.id === list.state) : undefined;
  return Array.isArray(field?.values) && field.values.length > 0 ? { register, values: field.values.map(String) } : null;
}

/**
 * Every value an action hands to `rules.ts`'s `fill`, by where it sits, so that one that is not text is refused here.
 *
 * `fill`'s FIRST LINE IS `template.replace`, AND NOTHING BEFORE IT ASKS WHAT THE TEMPLATE IS. So a create field holding
 * `[late]` installed, and every write to its list then threw `TypeError: template.replace is not a function` out of the
 * write (`loop/research-batch-thirty-eight-audit.md`, found outside the wave). The brief allowed numbers and booleans,
 * and probing each value once found they throw the same way: `n: 5`, `b: true` and `null` in a create, `set.to: 5`,
 * `note: 5` and the rest below. Text is the one form that works, and `n: '5'` made a row holding the number 5, so the
 * sentence for a number or a boolean hands back its quoted form.
 *
 * BOTH PATHS. A step is filled first by the run, which leaves anything but text as it is, and is then acted through the
 * same pass, so on the run path the same value fails the run at that step instead of failing the write.
 *
 * EVERY KEY THE ACTION CARRIES, NOT THE FIRST ONE. Nothing refuses a step with two verbs in it, and the pass takes
 * whichever comes first in its own `if` chain, `set` before `create`. This walk used to stop at its first match with
 * `create` ahead of `set`, so `{ set: { field: n, to: 5 }, create: { ... } }` was read as a create, installed, and
 * threw out of every write. Holding each key to text whichever one the pass acts on cannot disagree with its order.
 */
function fillSites(action: Record<string, unknown>, at: string): { where: string; value: unknown; field?: string; into?: string }[] {
  const of = (x: unknown, key: string): unknown => (isObject(x) ? x[key] : undefined);
  const out: { where: string; value: unknown; field?: string; into?: string }[] = [];
  if ('create' in action) {
    const spec = action.create;
    const fields = of(spec, 'fields');
    /* `createFault` in `declare.ts` answers a create that is not an object; one with no `fields:` would throw at
       `Object.entries` before `fill`, and is left to that check's owner rather than refused here for a new reason. */
    const into = String(of(spec, 'register'));
    if (isObject(fields)) for (const [field, value] of Object.entries(fields)) out.push({ where: `${at}.create.fields.${field}`, value, field, into });
  }
  if ('set' in action) out.push({ where: `${at}.set.to`, value: of(action.set, 'to') });
  if ('note' in action) out.push({ where: `${at}.note`, value: action.note });
  if ('notify' in action) out.push({ where: `${at}.notify.say`, value: of(action.notify, 'say') });
  if ('schedule' in action) out.push({ where: `${at}.schedule.note`, value: of(action.schedule, 'note') });
  if ('link' in action) out.push({ where: `${at}.link.to.value`, value: of(of(action.link, 'to'), 'value') });
  if ('suggest' in action) out.push({ where: `${at}.suggest.question`, value: of(action.suggest, 'question') });
  return out;
}

function fillFault(id: string, decl: FlowDecl, installed?: Known): Refusal | null {
  for (const { action, at } of actionsOf(decl)) {
    /* AND A MOVE'S WORD, WHICH NO `fill` READS EITHER, so `fillSites` never listed it (`loop/research-batch-forty-audit.md`
       finding 11). The pass writes the word into the list's state field as it is, the enum refuses a number, and the
       rule's whole patch goes: measured on 23 September, `then: [{ move: 5 }, { set: note }]` installed over Jobs and the
       Water row was written holding `what` alone. The states are named where the list is known, since the one word that
       helps is one of them. */
    if ('move' in action && typeof action.move !== 'string') {
      const word = action.move;
      const where = `${at}.move`;
      const shown = typeof word === 'number' || typeof word === 'boolean' ? String(word) : word === undefined ? 'missing' : JSON.stringify(word);
      const states = statesOf(decl, installed);
      if (states !== null) {
        const said = states.values.length === 1 ? states.values[0]! : `${states.values.slice(0, -1).join(', ')} or ${states.values.at(-1)!}`;
        return bad('DECLARATION_INVALID', `${id}'s ${where} is ${shown}, and a move names one of ${states.register}'s states as text: ${said}.`, where, states.values);
      }
      return typeof word === 'number' || typeof word === 'boolean'
        ? bad('DECLARATION_INVALID', `${id}'s ${where} is ${shown}, and a move names a state as text. Write "${shown}".`, where)
        : bad('DECLARATION_INVALID', `${id}'s ${where} is ${shown}, and a move names one state. Write it as text.`, where);
    }
    /* AND A TAG'S WORD, WHICH NO `fill` READS BUT WHICH FAILS THE SAME WAY. `tagsRefusing` passed over a word that was
       not a string and nothing else asked (`loop/research-batch-thirty-nine-audit.md` finding 10), so `tag: 5`
       installed; the pass put the 5 into the row's tags as it was, `coerce` refused a number in a `list<enum>` and in
       the `list<text>` every list takes, and the rule's whole patch went, a `set` beside it included. AN `untag` DOES NOT
       FAIL THAT WAY, and is refused for another reason: it untags nothing. Measured by this wave's checker, `untag: 5` and
       `untag: ["late"]` beside a `set` over a Rent tagged `late` kept the note and the `late` alike, in silence. */
    for (const verb of ['tag', 'untag'] as const) {
      if (!(verb in action)) continue;
      const word = action[verb];
      if (typeof word === 'string') continue;
      const where = `${at}.${verb}`;
      return typeof word === 'number' || typeof word === 'boolean'
        ? bad('DECLARATION_INVALID', `${id}'s ${where} is ${String(word)}, and a tag is a word. Write "${String(word)}".`, where)
        : bad('DECLARATION_INVALID', `${id}'s ${where} is ${word === undefined ? 'missing' : JSON.stringify(word)}, and a tag is one word. Write it as text.`, where);
    }
    for (const { where, value, field, into } of fillSites(action, at)) {
      if (typeof value === 'string') continue;
      const quotable = typeof value === 'number' || typeof value === 'boolean';
      if (field !== undefined)
        return quotable
          ? bad('DECLARATION_INVALID', `${id} creates a ${into} row at ${at} with ${field}: ${String(value)}, and a rule fills every value it writes from text. Write ${field}: "${String(value)}", which the field reads as its own type.`, where)
          : bad('DECLARATION_INVALID', `${id} creates a ${into} row at ${at} with ${field}: ${JSON.stringify(value)}, and a rule fills every value it writes from text, so ${Array.isArray(value) ? 'a list' : 'it'} would fail the rule each time it fired. Leave ${field} out of the create.`, where);
      return quotable
        ? bad('DECLARATION_INVALID', `${id}'s ${where} is ${String(value)}, and a rule fills every value it writes from text. Write "${String(value)}".`, where)
        : bad('DECLARATION_INVALID', `${id}'s ${where} is ${value === undefined ? 'missing' : JSON.stringify(value)}, and a rule fills every value it writes from text, so it would fail the rule each time it fired. Write it as text.`, where);
    }
  }
  return null;
}

function firstVerb(list: unknown, among: readonly string[]): string | null {
  if (!Array.isArray(list)) return null;
  for (const step of list) {
    if (!isObject(step)) continue;
    const hit = among.find((v) => v in step);
    if (hit) return hit;
    if ('if' in step) {
      const inner = firstVerb(step.then, among) ?? firstVerb(step.else, among);
      if (inner) return inner;
    }
  }
  return null;
}

function limitsFault(id: string, limits: unknown): Refusal | null {
  if (limits === undefined) return null;
  if (!isObject(limits)) return bad('DECLARATION_INVALID', `${id}'s limits: is { runs_per_day, steps_per_run }.`, 'limits');
  const most = { runs_per_day: RUNS_PER_DAY_CEILING, steps_per_run: STEP_CEILING } as const;
  for (const key of Object.keys(limits)) {
    if (!(key in most)) return bad('DECLARATION_INVALID', `${id}'s limits: has no ${key}.`, `limits.${key}`, Object.keys(most));
    const n = limits[key];
    const top = most[key as keyof typeof most];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1)
      return bad('DECLARATION_INVALID', `${id}'s limits.${key} is a whole number of at least one.`, `limits.${key}`);
    if (n > top) return bad('OUT_OF_BOUNDS', `${id} asks for ${n} ${key.replace(/_/g, ' ')}, and the record holds it at ${top}. A limit can only lower that.`, `limits.${key}`);
  }
  return null;
}

/** The trigger, alone. `undefined` is `written` by the body's own register, and is the inline path's to check. */
function triggerFault(id: string, on: unknown, installed?: Known): Refusal | null {
  if (on === undefined) return null;
  /* A WORD IN `on:` IS AN OLDER SHAPE THAT NOTHING EVER READ, and the one word rules were written with is let through
     as it always was. The first run of the rule suite against this file failed two tests on `on: 'create'`, and
     `digest.test.ts` and `install-known.test.ts` carry the same key: rules written that way are installed, the inline
     pass ignores the word and fires on every write, and refusing them now would break a record's rules on its next
     reinstall for a key that never did anything. It reads as today's meaning, `written` by the body's own register.

     ANY OTHER WORD IS REFUSED. Letting every string through meant `on: 'hourly'` installed as an inline rule and fired
     on every write of its register, which is the opposite of what its author asked for; grepping the seed, the packs,
     the docs and every fixture found `create` and no other word under a rule's `on:`. */
  if (typeof on === 'string') {
    if ((LEGACY_WORDS as readonly string[]).includes(on)) return null;
    const every = /^(?:hourly|daily|weekly)$/.test(on) ? ` Write on: { every: ${on === 'hourly' ? '1h' : on === 'daily' ? '1d' : '1w'} }.` : ' Write a trigger such as on: { every: 1h }.';
    return bad('DECLARATION_INVALID', `${id}'s on: is ${JSON.stringify(on)}, and a rule's trigger is an object naming one of ${TRIGGERS.join(', ')}.${every}`, 'on', TRIGGERS);
  }
  if (!isObject(on)) return bad('DECLARATION_INVALID', `${id}'s on: is one trigger, such as { every: 1h }.`, 'on', TRIGGERS);
  const named = Object.keys(on).filter((k) => (TRIGGERS as readonly string[]).includes(k));
  const stray = Object.keys(on).find((k) => !(TRIGGERS as readonly string[]).includes(k) && !((k === 'at' || k === 'day' || k === 'month') && 'every' in on));
  if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s on: has no trigger called ${stray}.`, `on.${stray}`, TRIGGERS);
  if (named.length !== 1)
    return bad('DECLARATION_INVALID', `${id}'s on: names ${named.length === 0 ? 'no trigger' : named.join(' and ')}, and a rule is started by exactly one.`, 'on', TRIGGERS);
  const kind = named[0]!;
  const value = on[kind];
  const at = `on.${kind}`;

  switch (kind) {
    case 'written': {
      if (!isObject(value) || typeof value.register !== 'string' || value.register === '')
        return bad('REQUIRED_MISSING', `${id} runs on writes, and names no register they are writes to.`, `${at}.register`);
      if (installed !== undefined && !installed.has(`register.${value.register}`))
        return bad('REGISTER_UNKNOWN', `${id} runs on writes to ${value.register}, and there is no such register.`, `${at}.register`);
      if (value.op !== undefined && (!Array.isArray(value.op) || value.op.length === 0 || value.op.some((o) => !(OPS as readonly unknown[]).includes(o))))
        return bad('DECLARATION_INVALID', `${id}'s op: is a list of create, update and delete.`, `${at}.op`, OPS);
      if (value.fields !== undefined && (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.some((f) => typeof f !== 'string' || !NAME.test(f))))
        return bad('DECLARATION_INVALID', `${id}'s fields: is a list of field ids.`, `${at}.fields`);
      if (value.from_rules !== undefined && typeof value.from_rules !== 'boolean')
        return bad('DECLARATION_INVALID', `${id}'s from_rules: is true or false.`, `${at}.from_rules`);
      return null;
    }
    case 'arrival': {
      if (!isObject(value)) return bad('DECLARATION_INVALID', `${id}'s arrival: is { ingest, channel, state, unverified }, each optional.`, at);
      /* `unverified: true` IS HOW A RULE HEARS AN ARRIVAL NOTHING VERIFIED, and without it `onArrival` starts nothing for
         one (audit thirty-three §5). A rule that wants to know about wrong tokens asks for that in writing; `'yes'`
         would have read as absent and silently heard nothing, so anything but true or false is refused. */
      if (value.unverified !== undefined && typeof value.unverified !== 'boolean')
        return bad('DECLARATION_INVALID', `${id}'s unverified: is true or false. True also starts it for arrivals nothing verified.`, `${at}.unverified`);
      if (value.ingest !== undefined) {
        if (typeof value.ingest !== 'string' || !NAME.test(value.ingest))
          return bad('DECLARATION_INVALID', `${id} waits for arrivals at ${JSON.stringify(value.ingest)}, and ingest: is the id of a declared ingest.`, `${at}.ingest`);
        if (installed !== undefined && !installed.has(`ingest.${value.ingest}`))
          return bad('DECLARATION_UNKNOWN', `${id} waits for arrivals at ${value.ingest}, and there is no ingest called ${value.ingest}.`, `${at}.ingest`);
      }
      if (value.channel !== undefined && !(CHANNELS as readonly unknown[]).includes(value.channel))
        return bad('DECLARATION_INVALID', `${id}'s channel: is one of ${CHANNELS.join(', ')}.`, `${at}.channel`, CHANNELS);
      if (value.state !== undefined && (!Array.isArray(value.state) || value.state.some((s) => typeof s !== 'string')))
        return bad('DECLARATION_INVALID', `${id}'s state: is a list of arrival states.`, `${at}.state`);
      return null;
    }
    case 'every': {
      /* THE CLOCK GRAMMAR IS `pull.ts`'s, AND SO IS THE FLOOR. `m` is minutes here, as on a connector, and fifteen of
         them is the shortest clock anything in this record keeps: a run every minute is a meter nobody meant to buy. */
      const { at: time, day, month } = on as { at?: unknown; day?: unknown; month?: unknown };
      /* A CLOCK OF MONTHS IS `clock.ts`'s AND IS READ BEFORE THE INTERVAL, because `mo` is not a unit `intervalMs` has
         and never should be: a month is no number of milliseconds. Measured on 25 September, `1mo` was refused here as
         not a clock, and a bill on the last day of each month could only be carried forward by hand. */
      if (monthsIn(value) !== null) return calendarFault(id, String(value), on as Record<string, unknown>);
      const ms = typeof value === 'string' ? intervalMs(value) : null;
      if (ms === null)
        return bad(
          'DECLARATION_INVALID',
          `${id} runs every ${JSON.stringify(value)}, and a clock is a number and one of m, h, d or w, or a count of months such as 1mo, 3mo or 1y. Write 1h.`,
          at,
        );
      if (ms < FLOOR_MS)
        return bad('DECLARATION_INVALID', `${id} runs every ${String(value)}, and fifteen minutes is the shortest clock this record keeps. Write 15m or more.`, at);
      if (month !== undefined)
        return bad('DECLARATION_INVALID', `${id} runs every ${String(value)}, so month: has nothing to choose. A month belongs to a clock of months, such as every: 3mo.`, 'on.month');
      if (day !== undefined && time === undefined)
        return bad('DECLARATION_INVALID', `${id} names a day and no time. Write at: 08:00 beside it.`, 'on.at');
      if (time === undefined) return null;
      /* `at` IS `digest.ts`'s `nextOccurrence`, which knows a day and a week and nothing else. `every: 6h, at: 08:00`
         has no reading anybody would agree on, so it is refused rather than guessed. */
      if (ms !== DAY_MS && ms !== WEEK_MS)
        return bad('DECLARATION_INVALID', `${id} runs every ${String(value)} at a time of day, and a time of day belongs to every: 1d, every: 1w or a clock of months.`, 'on.at');
      if (ms === WEEK_MS && day === undefined)
        return bad('REQUIRED_MISSING', `${id} runs weekly at ${String(time)} and names no day. Write day: mon.`, 'on.day');
      /* A DAY OF THE MONTH ON A DAY OR A WEEK is somebody reaching for the monthly clock, and is told where it is. */
      const monthly = isMonthDay(day) ? ' A day of the month belongs to every: 1mo.' : '';
      if (ms === DAY_MS && day !== undefined)
        return bad('DECLARATION_INVALID', `${id} runs every day, so day: has nothing to choose. Write every: 1w for a weekday, or every: 1mo for a day of the month.`, 'on.day');
      if (typeof time !== 'string' || (day !== undefined && typeof day !== 'string') || nextOccurrence({ at: time, ...(day === undefined ? {} : { day: day as string }) }, 0, 'UTC') === null)
        return bad('DECLARATION_INVALID', `${id} runs at ${JSON.stringify(time)}${day === undefined ? '' : ` on ${JSON.stringify(day)}`}, and a time is HH:MM and a day is mon to sun.${monthly}`, 'on.at');
      return null;
    }
    case 'metric': {
      if (!isObject(value) || typeof value.id !== 'string' || !NAME.test(value.id))
        return bad('DECLARATION_INVALID', `${id}'s metric: names the id of a declared metric.`, `${at}.id`);
      const crosses = value.crosses;
      const bound =
        isObject(crosses) && Object.keys(crosses).length === 1 && ('lte' in crosses || 'gte' in crosses)
          ? Number.isFinite(crosses.lte ?? crosses.gte) && typeof (crosses.lte ?? crosses.gte) === 'number'
          : false;
      if (crosses !== 'target' && !bound)
        return bad('DECLARATION_INVALID', `${id}'s crosses: is target, { lte: n } or { gte: n }.`, `${at}.crosses`);
      if (installed !== undefined && !installed.has(`metric.${value.id}`))
        return bad('DECLARATION_UNKNOWN', `${id} watches ${value.id}, and there is no metric called ${value.id}.`, `${at}.id`);
      /* NOTHING STARTS IT YET. The four starts are `onWritten`, `onArrival`, `onClock` and the button, and each skips
         every trigger but its own: this body linted clean and was read by nothing. The start belongs where a metric
         is read on a clock, the `snapshot` handler in `index.ts`, and until it lands the rule is refused here. The
         checks above stay first, so a wrong id or a wrong bound is still told what is wrong with it. */
      return bad(
        'NOT_IN_THIS_BUILD',
        `${id} is started by metric ${value.id} crossing a line, and nothing in this build watches a metric for that, so it would install and never start.`,
        at,
      );
    }
    case 'decided':
      return bad('NOT_IN_THIS_BUILD', `${id} is started by a decision, which §4.1 reserves: a run's own asks resume it without this trigger.`, at);
    case 'manual':
      return value === true ? null : bad('DECLARATION_INVALID', `${id}'s manual: is true.`, at);
  }
  return null;
}

/**
 * What is wrong with a clock of months, one thing at a time, or `null` when `clock.ts`'s `calendarOf` reads it.
 *
 * EVERY KEY IS REQUIRED THAT DECIDES WHICH DAY, and none is defaulted. A monthly clock with no `day:` could mean the
 * 1st or the day it was installed on, and the second moves whenever the rule is edited; one with no `at:` has no
 * reading at all. `month:` is required of a count above one for the same reason and refused on a count of one, as
 * `day:` is refused on a daily clock, because it would choose nothing.
 */
function calendarFault(id: string, every: string, on: Record<string, unknown>): Refusal | null {
  const months = monthsIn(every)!;
  const steps = `1mo, 2mo, 3mo, 4mo, 6mo, 12mo or 1y`;
  if (!CALENDAR_STEPS.includes(months))
    return bad('DECLARATION_INVALID', `${id} runs every ${every}, and a clock of months divides the year, so it falls in the same months every year: ${steps}.`, 'on.every');
  if (on.day === undefined)
    return bad('REQUIRED_MISSING', `${id} runs every ${every} and names no day of the month. Write day: 1, or day: last.`, 'on.day');
  if (!isMonthDay(on.day))
    return bad(
      'DECLARATION_INVALID',
      `${id} runs on day ${JSON.stringify(on.day)}, and a day of the month is 1 to 31, or last. A day past a month's end falls on its last day.`,
      'on.day',
    );
  if (on.at === undefined) return bad('REQUIRED_MISSING', `${id} runs every ${every} and names no time. Write at: 09:00 beside it.`, 'on.at');
  if (timeOf(on.at) === null) return bad('DECLARATION_INVALID', `${id} runs at ${JSON.stringify(on.at)}, and a time is HH:MM.`, 'on.at');
  if (months === 1 && on.month !== undefined)
    return bad('DECLARATION_INVALID', `${id} runs every month, so month: has nothing to choose. Write every: 3mo or 1y beside it.`, 'on.month');
  if (months > 1 && on.month === undefined)
    return bad('REQUIRED_MISSING', `${id} runs every ${every} and names no month to count from. Write month: jan.`, 'on.month');
  if (months > 1 && !(typeof on.month === 'string' && MONTHS.includes(on.month)))
    return bad('DECLARATION_INVALID', `${id} counts from month ${JSON.stringify(on.month)}, and a month is one of ${MONTHS.join(', ')}.`, 'on.month', MONTHS);
  return calendarOf(on) === null ? bad('DECLARATION_INVALID', `${id} runs every ${every}, and this record cannot read that clock.`, 'on.every') : null;
}

/** One step's own shape, not its children. `names` collects every answer name the body declares. */
function stepFault(
  id: string,
  verb: string,
  step: Record<string, unknown>,
  at: string,
  register: string | null,
  installed: Known | undefined,
  names: Set<string>,
): Refusal | null {
  const spec = step[verb];
  const named = (as: unknown, where: string): Refusal | null => {
    if (typeof as !== 'string' || !NAME.test(as))
      return bad('DECLARATION_INVALID', `${id}'s ${where} is ${JSON.stringify(as)}, and an answer's name is lower-case letters, digits and underscores.`, where);
    if (RESERVED.includes(as))
      return bad('DECLARATION_INVALID', `${id}'s ${where} is ${as}, which is the run's own name for its ${as === 'vars' ? 'answers' : 'trigger'}. Pick another.`, where);
    names.add(as);
    return null;
  };
  const text = (value: unknown, where: string, what: string): Refusal | null =>
    typeof value === 'string' && value.trim() !== '' ? null : bad('REQUIRED_MISSING', `${id}'s ${where} needs ${what}.`, where);
  const span = (value: unknown, where: string): Refusal | null =>
    typeof value === 'string' && intervalMs(value) !== null
      ? null
      : bad('DECLARATION_INVALID', `${id} waits ${JSON.stringify(value)} at ${where}, and a span is a number and one of m, h, d or w. Write 2h.`, where);

  switch (verb) {
    case 'if': {
      if (typeof spec !== 'string' && !isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.if is a condition.`, `${at}.if`);
      if (!Array.isArray(step.then) || step.then.length === 0)
        return bad('REQUIRED_MISSING', `${id}'s branch at ${at} says if, and not what to do then.`, `${at}.then`);
      return null;
    }
    case 'set_var': {
      if (!isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.set_var is { name, to }.`, `${at}.set_var`);
      return named(spec.name, `${at}.set_var.name`) ?? (typeof spec.to === 'string' ? null : bad('DECLARATION_INVALID', `${id}'s ${at}.set_var.to is text.`, `${at}.set_var.to`));
    }
    case 'script': {
      /* THE SCRIPT ITSELF IS NOT LOOKED UP HERE. A run reaching this step asks whether `script.<id>` is active, says
         `runs: { rule: true }` and is not paused (`startScript` in `flow.ts`), and fails with a sentence when not. Two
         of those three change after install, by a pause or a pack turned off, so the run has to ask them anyway, and
         the id is checked here for shape only. What `input:` copies is held below, by `copyFault`. */
      if (!isObject(spec) || typeof spec.id !== 'string' || !NAME.test(spec.id))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.script names the id of a script.`, `${at}.script.id`);
      if (spec.input !== undefined && (!isObject(spec.input) || Object.values(spec.input).some((v) => typeof v !== 'string')))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.script.input is a map of names to text.`, `${at}.script.input`);
      /* `as:` IS OPTIONAL, AS `call`'S IS. It holds the id of the queued job, `startScript` writes it only when it is a
         string, and until 24 September this refused a step with none, so the canvas had to require a name the run never
         needed (`flow-lint-script-as.test.ts`). An `as` that is present is still held to the name rules. */
      return spec.as === undefined ? null : named(spec.as, `${at}.script.as`);
    }
    case 'call': {
      if (!isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.call is { ingest, as }.`, `${at}.call`);
      if (typeof spec.ingest === 'string' && /[:/.]/.test(spec.ingest))
        return bad('DECLARATION_INVALID', `${id} calls ${spec.ingest}, and a step names a declared call, never an address. Declare the call, then name it here.`, `${at}.call.ingest`);
      const fault = callFault(id, spec.ingest, `${at}.call.ingest`, register, installed);
      if (fault) return fault;
      return spec.as === undefined ? null : named(spec.as, `${at}.call.as`);
    }
    case 'ask_slash': {
      if (!isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_slash is { question, as }.`, `${at}.ask_slash`);
      const fault = text(spec.question, `${at}.ask_slash.question`, 'a question') ?? named(spec.as, `${at}.ask_slash.as`);
      if (fault) return fault;
      if (spec.shape !== undefined && !(SHAPES as readonly unknown[]).includes(spec.shape))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_slash.shape is text, number or choice.`, `${at}.ask_slash.shape`, SHAPES);
      const choices = spec.choices;
      const listed = Array.isArray(choices) && choices.length > 0 && choices.every((c) => typeof c === 'string' && c !== '');
      if (spec.shape === 'choice' && !listed)
        return bad('REQUIRED_MISSING', `${id} asks Slash to choose at ${at} and lists nothing to choose from. Give it choices:.`, `${at}.ask_slash.choices`);
      if (choices !== undefined && spec.shape !== 'choice')
        return bad('DECLARATION_INVALID', `${id} lists choices at ${at} for an answer that is not a choice. Write shape: choice.`, `${at}.ask_slash.choices`);
      const about = spec.about;
      if (about !== undefined && (!Array.isArray(about) || about.length === 0 || about.some((f) => typeof f !== 'string' || !NAME.test(f))))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_slash.about is a list of the row's field ids.`, `${at}.ask_slash.about`);
      return null;
    }
    case 'ask_person': {
      if (!isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_person is { question, options, as }.`, `${at}.ask_person`);
      const fault = text(spec.question, `${at}.ask_person.question`, 'a question') ?? named(spec.as, `${at}.ask_person.as`);
      if (fault) return fault;
      if (!Array.isArray(spec.options) || spec.options.length === 0 || spec.options.some((o) => typeof o !== 'string' || o === ''))
        return bad('DECLARATION_INVALID', `${id} asks a person at ${at} and offers no answers. options: is a list of at least one.`, `${at}.ask_person.options`);
      /* `to:` WOULD BE DRAWN AND DO NOTHING. The runner opens the question in the record's one queue, which everyone who
         decides reads, and nothing in this build addresses a suggestion to one person. */
      if (spec.to !== undefined)
        return bad('NOT_IN_THIS_BUILD', `${id} asks ${JSON.stringify(spec.to)} at ${at}, and a question goes to the record's queue, where anyone who decides answers it. Drop to:.`, `${at}.ask_person.to`);
      return spec.wait === undefined ? null : span(spec.wait, `${at}.ask_person.wait`);
    }
    case 'wait':
      return span(spec, `${at}.wait`);
  }
  return null;
}
