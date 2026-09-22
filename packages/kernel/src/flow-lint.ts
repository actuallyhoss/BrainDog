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
 * of one, and no `to:`, since nothing addresses a question to one person. `ask_spark` is refused as not in this build
 * once its shape is checked, because no host serves the `infer.ask` job it queues and a run would wait its day and
 * fail. `call` and `script` still install and fail at the run with a sentence, which is the answer §4.4 gives a
 * `script` step until its runtime lands, and it is why the lint is strict about everything it CAN know now.
 */

import type { Refusal } from '@braindog/ports';

import type { Known } from './declare.ts';
import { nextOccurrence } from './digest.ts';
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
const ACTIONS = ['tag', 'untag', 'set', 'move', 'link', 'note', 'notify', 'schedule', 'create', 'suggest', 'run', 'stop'] as const;
/** The verbs only a step has. */
const FLOW = ['if', 'set_var', 'script', 'call', 'ask_spark', 'ask_person', 'wait'] as const;
const VERBS: readonly string[] = [...ACTIONS, ...FLOW];

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
const ONCE: readonly string[] = ['notify', 'create', 'suggest', 'run', 'call', 'ask_spark', 'ask_person'];

/**
 * Field types whose value never leaves the record with a question: `ask_spark`'s `about:` is refused them here, and
 * the runner leaves them out of the `infer.ask` payload again, as `queueCall` leaves them out of what a call sends.
 */
export const UNSENDABLE: readonly string[] = ['secret', 'file'];

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
 */
export function tagsRefusing(decl: FlowDecl, tags: { type?: unknown; of?: unknown; values?: unknown }): { verb: 'tag' | 'untag'; at: string; word?: string }[] {
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
    return null;
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
  const walk = (list: unknown, at: string, depth: number): Refusal | null => {
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
      if (verb === 'ask_spark' && (step.ask_spark as { about?: unknown }).about !== undefined) {
        const about = (step.ask_spark as { about: string[] }).about;
        if (rowless) return bad('DECLARATION_INVALID', `${id} is started by ${trigger}, which has no row, and ${here} sends fields of one with about:.`, `${here}.ask_spark.about`);
        const fields = row === null ? undefined : ((installed?.get(`register.${row}`) as { fields?: { id?: unknown; type?: unknown }[] } | undefined)?.fields ?? undefined);
        if (fields !== undefined)
          for (const name of about) {
            const field = fields.find((f) => f.id === name);
            if (!field) return bad('FIELD_UNKNOWN', `${id} sends ${name} to Spark at ${here}, and ${row} has no field called ${name}.`, `${here}.ask_spark.about`);
            if (UNSENDABLE.includes(String(field.type)))
              return bad('DECLARATION_INVALID', `${id} sends ${name} to Spark at ${here}, and a ${String(field.type)} field never leaves the record.`, `${here}.ask_spark.about`);
          }
      }
      /* AND THEN NOT IN THIS BUILD, AFTER EVERY CHECK OF ITS SHAPE, as a `metric` trigger is. The runner queues the
         question and the ack hands back the answer, but no host leases an `infer.ask` job yet, so a run that asked
         would wait its day and fail with nobody having been asked. The runner refuses the step too, for a rule an
         earlier build let install. */
      if (verb === 'ask_spark')
        return bad('NOT_IN_THIS_BUILD', `${id} asks Spark at ${here}, and no host in this build answers an automation's question to Spark. Ask a person with ask_person instead.`, `${here}.ask_spark`);
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
      if (verb === 'if') {
        if (depth >= DEPTH_CEILING)
          return bad('OUT_OF_BOUNDS', `${id} nests a branch ${depth + 1} deep at ${here}, and ${DEPTH_CEILING} is the most. Lift the inner branch into its own step.`, here);
        const inner = walk(step.then, `${here}.then`, depth + 1) ?? (step.else === undefined ? null : walk(step.else, `${here}.else`, depth + 1));
        if (inner) return inner;
      }
    }
    return null;
  };
  const walked = walk(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then', 0);
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
  return choice(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then');
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
  const stray = Object.keys(on).find((k) => !(TRIGGERS as readonly string[]).includes(k) && !((k === 'at' || k === 'day') && 'every' in on));
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
      const ms = typeof value === 'string' ? intervalMs(value) : null;
      if (ms === null)
        return bad('DECLARATION_INVALID', `${id} runs every ${JSON.stringify(value)}, and a clock is a number and one of m, h, d or w. Write 1h.`, at);
      if (ms < FLOOR_MS)
        return bad('DECLARATION_INVALID', `${id} runs every ${String(value)}, and fifteen minutes is the shortest clock this record keeps. Write 15m or more.`, at);
      const { at: time, day } = on as { at?: unknown; day?: unknown };
      if (day !== undefined && time === undefined)
        return bad('DECLARATION_INVALID', `${id} names a day and no time. Write at: 08:00 beside it.`, 'on.at');
      if (time === undefined) return null;
      /* `at` IS `digest.ts`'s `nextOccurrence`, which knows a day and a week and nothing else. `every: 6h, at: 08:00`
         has no reading anybody would agree on, so it is refused rather than guessed. */
      if (ms !== DAY_MS && ms !== WEEK_MS)
        return bad('DECLARATION_INVALID', `${id} runs every ${String(value)} at a time of day, and a time of day belongs to every: 1d or every: 1w.`, 'on.at');
      if (ms === WEEK_MS && day === undefined)
        return bad('REQUIRED_MISSING', `${id} runs weekly at ${String(time)} and names no day. Write day: mon.`, 'on.day');
      if (ms === DAY_MS && day !== undefined)
        return bad('DECLARATION_INVALID', `${id} runs every day, so day: has nothing to choose. Write every: 1w.`, 'on.day');
      if (typeof time !== 'string' || (day !== undefined && typeof day !== 'string') || nextOccurrence({ at: time, ...(day === undefined ? {} : { day: day as string }) }, 0, 'UTC') === null)
        return bad('DECLARATION_INVALID', `${id} runs at ${JSON.stringify(time)}${day === undefined ? '' : ` on ${JSON.stringify(day)}`}, and a time is HH:MM and a day is mon to sun.`, 'on.at');
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
      /* THE SCRIPT ITSELF IS NOT LOOKED UP. `script.<id>` is the scripts brief's ninth kind and its runtime; until it
         lands, a run reaching this step fails with a sentence (§4.4), so the id is checked for shape only. */
      if (!isObject(spec) || typeof spec.id !== 'string' || !NAME.test(spec.id))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.script names the id of a script.`, `${at}.script.id`);
      if (spec.input !== undefined && (!isObject(spec.input) || Object.values(spec.input).some((v) => typeof v !== 'string')))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.script.input is a map of names to text.`, `${at}.script.input`);
      return named(spec.as, `${at}.script.as`);
    }
    case 'call': {
      if (!isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.call is { ingest, as }.`, `${at}.call`);
      if (typeof spec.ingest === 'string' && /[:/.]/.test(spec.ingest))
        return bad('DECLARATION_INVALID', `${id} calls ${spec.ingest}, and a step names a declared call, never an address. Declare the call, then name it here.`, `${at}.call.ingest`);
      const fault = callFault(id, spec.ingest, `${at}.call.ingest`, register, installed);
      if (fault) return fault;
      return spec.as === undefined ? null : named(spec.as, `${at}.call.as`);
    }
    case 'ask_spark': {
      if (!isObject(spec)) return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_spark is { question, as }.`, `${at}.ask_spark`);
      const fault = text(spec.question, `${at}.ask_spark.question`, 'a question') ?? named(spec.as, `${at}.ask_spark.as`);
      if (fault) return fault;
      if (spec.shape !== undefined && !(SHAPES as readonly unknown[]).includes(spec.shape))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_spark.shape is text, number or choice.`, `${at}.ask_spark.shape`, SHAPES);
      const choices = spec.choices;
      const listed = Array.isArray(choices) && choices.length > 0 && choices.every((c) => typeof c === 'string' && c !== '');
      if (spec.shape === 'choice' && !listed)
        return bad('REQUIRED_MISSING', `${id} asks Spark to choose at ${at} and lists nothing to choose from. Give it choices:.`, `${at}.ask_spark.choices`);
      if (choices !== undefined && spec.shape !== 'choice')
        return bad('DECLARATION_INVALID', `${id} lists choices at ${at} for an answer that is not a choice. Write shape: choice.`, `${at}.ask_spark.choices`);
      const about = spec.about;
      if (about !== undefined && (!Array.isArray(about) || about.length === 0 || about.some((f) => typeof f !== 'string' || !NAME.test(f))))
        return bad('DECLARATION_INVALID', `${id}'s ${at}.ask_spark.about is a list of the row's field ids.`, `${at}.ask_spark.about`);
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
