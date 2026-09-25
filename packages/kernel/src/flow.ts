/**
 * The runner of an automation: start a run, take its steps, park it on a wait, resume it, cancel it, prune it
 * (`loop/research-shell-automations.md` §4.1, §4.2, §4.5; Brief B).
 *
 * A RUN IS A ROW AND EACH STEP IT TOOK IS A ROW. `automation_run.step` says which step comes next, so a wait of a day
 * survives a deploy: the drain reads the row and carries on from it. Nothing is held in memory between two steps, and
 * nothing is held across a wait but a `schedule` row.
 *
 * THE TRIGGER ONLY RECORDS THAT A RUN IS DUE. A write, an arrival or a button inserts the run `pending` and arms its
 * schedule row for now, inside the transaction that caused it, so a write that rolls back leaves no run; the steps are
 * taken by the next drain. The one exception is a clock, whose handler IS a drain turn, so its run is taken at once.
 *
 * EVERY ACTION A RULE HAS RUNS THROUGH `runRules`, one step at a time, against the run's row. `set`, `move`, `create`
 * and the rest therefore meet the write path, the transitions and `create`'s bound exactly as an inline rule's do,
 * with the rule's own name as the actor. Two things are changed for a step, and both are said where they are done.
 *
 * A STEP THAT ASKS HANDS OFF AND PARKS, AND THE ANSWER IS WHAT WAKES IT (Brief C). `ask_person` opens an `options`
 * suggestion whose body names the run and the step, and the kernel's `decide` hands the pick to `answerStep` in the
 * decision's own transaction. `ask_slash` queues one `infer.ask` outbox row, and the outbox's `ack` hands the model's
 * text to `answerStep` in the ack's transaction. Either way the step row says `waiting` and holds what it is waiting on,
 * the suggestion or the job, and the run's schedule row is armed for the end of the wait: a wake that finds the step
 * still `waiting` is the wait running out, and fails the run with a sentence.
 *
 * ASKING SLASH IS SERVED ONLY WHERE THE HOST SAYS SO (`FlowDeps.answersSlash`, the record's `answersSlash` option). A
 * host that leases no `infer.ask` job leaves the question `pending` for its day and the run fails having asked nobody,
 * so on such a host `advance` fails a run that reaches the step with `NOT_IN_THIS_BUILD` before anything is queued, and
 * install refuses the step (`unserved` in `index.ts`). A host that serves the job admits both, and its pass acks with
 * the answer as `result.text` or a refusal's sentence as `result.failed` (`outbox.ts`'s `ack`).
 *
 * A `script` STEP STARTS A SCRIPT AND DOES NOT WAIT FOR IT (`startScript`). It queues the same `script.run` row a clock
 * queues, for a script that says `runs: { rule: true }`, and the run goes on to its next step; what the script writes
 * lands through `finishScript` when a host has run it, and its answer does not come back into the run. A `call` STEP IS
 * STILL NOT IN THIS BUILD: a run that reaches one fails there with a sentence, and the lint lets it install so that the
 * canvas can draw it.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { fixOf, no, ok, refused } from '@braindog/ports';
import { compile, evaluate, type Predicate, type Schema } from '@braindog/where';

import { meter, type Metered } from './actions.ts';
import { nextOccurrence } from './digest.ts';
import { RUN_PATH, RUNS_PER_DAY_CEILING, passFilled, pathOf, sealedAs, triggerOf } from './flow-lint.ts';
import type { Entry } from './index.ts';
import { instant } from './migrate.ts';
import { predicateOf, type EvalContext } from './metrics.ts';
import { FIGURE, WITHHELD } from './figure.ts';
import { enqueue } from './outbox.ts';
import { intervalMs } from './pull.ts';
import {
  figureText,
  filling,
  marker,
  onceKey,
  present,
  runRules,
  sealedOf,
  type FlowDecl,
  type RuleAction,
  type RuleDecl,
  type RulesDeps,
  type RunFill,
  type Trigger,
} from './rules.ts';

/** Three, as §4.1 says: a run started by a rule's write carries its depth plus one, and the fourth is not started. */
export const CHAIN_CEILING = 3;
/**
 * How deep a chain through rule-started scripts goes: a run at depth eight still starts its script, and a write that
 * script makes starts nothing. Nine levels of follow-ups close under the task somebody finished.
 *
 * NOT `CHAIN_CEILING`, BECAUSE WORK'S CASCADE IS ONE LEVEL PER RUN. `close_follow_ups` closes a task's own follow-ups,
 * and the write to each starts the rule on that follow-up, so under a ceiling of three a tree five levels deep stopped
 * closing at its fifth, and `from_rules` is not something the pack asks for. A loop over rows that already exist is
 * ended by `Chain.seen` at the first row it comes back to, so this bound is met only by a chain that keeps reaching new
 * rows, a script that creates a row per run: measured before it (`script-chain.test.ts`), one create started fifteen
 * runs in fifteen rounds and was still going.
 */
export const SCRIPT_CHAIN_CEILING = 8;
/** §3's `RunContext`: one answer is at most 4 KB and all of them together 64 KB. */
const VAR_BYTES = 4096;
const VARS_BYTES = 65_536;
/** A finished run older than this goes in the hourly sweep. Its metered `pull` event stays, which is its one line. */
export const KEEP_RUNS_MS = 90 * 86_400_000;
const DAY_MS = 86_400_000;
/** §4.3: a question put to a person waits a week unless its step says `wait:`. */
export const ASK_PERSON_WAIT = '7d';
/**
 * How long a run waits on Slash before it stops.
 *
 * A DAY, BECAUSE THE OUTBOX'S OWN LADDER IS OVER LONG BEFORE IT. Eight failed attempts end in about four hours, and that
 * path fails the run at once; this is for the other one, a host that serves no `infer.ask` at all and leaves the row
 * `pending`, which without a bound would park the run for the ninety days a run is kept.
 */
export const ASK_SLASH_WAIT_MS = DAY_MS;

/** The keys of the two kinds of `rule` schedule row this file owns. A rule's own reminders are `<rule>:<row>`. */
export const runKey = (run: string): string => `flow.run:${run}`;
export const clockKey = (rule: string): string => `flow.every:${rule}`;

export type FlowDeps = {
  sql: Sql;
  mint: () => string;
  nowMs: number;
  /** The kernel's own rule-pass dependencies. A step's action runs through them, with two keys replaced below. */
  rules: () => RulesDeps;
  entry: (id: string) => Entry | null;
  schemaOf: (register: string) => Schema | null;
  /** A note with no row to be about: what a `notify` on a clock or a button writes. */
  note: (actor: string, text: string) => void;
  /** The project a row belongs to, by its register's scope field, or `null` for a global row. */
  projectOf: (entry: Entry) => string | null;
  tz: string;
  /**
   * Put a question of options in front of the record's people, through the gate's own `propose`. `about` goes on the
   * suggestion's body, which is how `decide` finds the run it answers.
   */
  ask: (question: string, options: readonly string[], actor: string, about: { run: string; step: number }) => Result<{ id: string }>;
  /** Close a question nobody will read the answer to, as `wont-fix` with the reason. A question already closed is left. */
  withdraw: (suggestion: string, actor: string, why: string) => void;
  /**
   * Whether this host leases `infer.ask` and answers it, as the record was opened with. False fails a run at an
   * `ask_slash` step before anything is queued.
   *
   * HERE AS WELL AS AT INSTALL, because install is not the only way a rule becomes live: `enablePack` restores a
   * retired rule through `stageDeclarations` alone, which asks no host question, and a rule an earlier build let
   * install is still in the table.
   */
  answersSlash: boolean;
};

/** A run-path rule as installed: its bare id, the version a run pins, and its body. */
export type Installed = { id: string; version: number; body: FlowDecl };

/** What started a run, as the run row keeps it and `{{trigger.…}}` reads it. */
export type RunTrigger = {
  kind: 'written' | 'arrival' | 'every' | 'manual';
  entry?: string;
  register?: string;
  op?: string;
  arrival?: string;
  channel?: string;
  ingest?: string | null;
  /** Whether anything proved an arrival came from its sender. Only a rule that says `unverified: true` sees `false`. */
  verified?: boolean;
  /**
   * A delete started the run. A deleted row is hidden from `deps.entry`, so without this a run about a delete had
   * nothing to read: its `if` failed and its `{{trigger.row.…}}` was a hole. A FLAG AND NOT A COPY: the first form of
   * this kept the whole row here, and `eraseSubjects` does not read `automation_run`, so an erased name stayed in a
   * finished run for the ninety days one is kept. `deletedRow` reads the row from `entry`, where an erasure reaches it.
   */
  deleted?: true;
  /**
   * The runs before this one in a chain through scripts, as `Chain.seen` holds them, when a rule-started script's write
   * started it. Kept on the trigger because the trigger is the one thing a run keeps about what started it, and the
   * run's own script step hands it on. Not something `{{trigger.…}}` reads (`context` leaves it out).
   */
  chain?: readonly string[];
};

/**
 * Where a write a rule-started script makes sits in the chain that started the script (audit sixty-four, finding 2).
 *
 * MEASURED BEFORE THIS (`script-chain.test.ts`, the audit's probe L1): `onWritten` stops a rule's own write unless the
 * trigger says `from_rules`, and stops a chain past `CHAIN_CEILING`, but it knows a rule's write by the actor, and a
 * script writes as `script:<id>@v<n>`. So a rule whose script wrote the row that fired it started itself again on every
 * run, at depth 0: one update ran the script twelve times in twelve rounds and was still going, each run a sandbox and
 * each a row version. The only stop was `runs_per_day`.
 *
 * `depth` is the depth of the run whose script step queued the job, and a write under the chain is one deeper.
 * `seen` is each run on the chain as `<rule>@<row>`, the run that queued the job last: a rule never starts again on a
 * row it has already run for in the same chain. That is what ends L1 at its first run, and two rows that each write
 * the other at their second, where a check on the queuing run's own row alone let the pair go on to the ceiling.
 *
 * `stopped` is filled while the script's writes go through, one line per rule a write would have started had the chain
 * not reached `SCRIPT_CHAIN_CEILING`, so that the script's run can say which row the chain stopped at and why. Without
 * it the tenth level of a follow-up tree stayed open and nothing anywhere said so: the seed's `follow-ups.test.ts`
 * found the row open, and the run that closed the ninth read "ran and wrote one row" like every run before it.
 */
export type Chain = { depth: number; seen: readonly string[]; stopped: string[] };

const link = (rule: string, entry: string): string => `${rule}@${entry}`;

/**
 * The chain whose script's writes are going through the write path right now, per record.
 *
 * HELD HERE AND NOT PASSED, for the reason `flowDepth` in `index.ts` gives for a run's depth: the write path hands
 * `onWritten` an actor and nothing else of who asked, and a script's writes are made synchronously inside
 * `finishScript`'s one transaction, so while they are being made they are the only writes this record is making.
 * Keyed by the record's `Sql` so that two records open in one process never read each other's.
 */
const chains = new WeakMap<Sql, Chain>();

/** Make `fn`'s writes under `chain`, or as a stranger's when there is none (a clock's script, or a job queued before this). */
export function underChain<R>(sql: Sql, chain: Chain | null, fn: () => R): R {
  if (chain === null) return fn();
  const was = chains.get(sql);
  chains.set(sql, chain);
  try {
    return fn();
  } finally {
    if (was === undefined) chains.delete(sql);
    else chains.set(sql, was);
  }
}

/**
 * The chain a `script.run` job was queued in, or `null` for a job no rule's step queued (a clock's script, or a run
 * the ninety days have taken): that job's writes are a stranger's, as every script's were before this.
 *
 * READ FROM THE STEP THAT QUEUED IT, NOT CARRIED IN THE JOB. A `script` step's `automation_step` row answers the job's
 * id (`advance`), so the runs that queued a job are found by it, with their depth and trigger. The first form of this
 * repair wrote the chain into the job's payload, and `rule-script.test.ts`, which pins the payload the host hands the
 * sandbox, failed on the extra key: the payload is the sandbox's, and the chain is the record's. It also answers
 * the case `startScript` shares a job in without a merge: two runs whose steps queued the same job both answer it, and
 * the chain is the deeper depth and both lists of runs.
 *
 * NO INDEX ON `answer`, so this reads every script step the record keeps, once per finished script run. The checker
 * measured 8.7 ms a finished script at 90,000 runs, beside a sandbox (a Dynamic Worker on the Worker) that the same
 * finish waits on, and the steps are pruned with their runs after ninety days. The index wants a migration, and the
 * list of migrations is `migrate.ts`'s, which this change did not reach.
 */
export function chainOfJob(sql: Sql, job: string): Chain | null {
  const runs = sql.all<{ rule: string; trigger: string; depth: number }>(
    "SELECT r.rule AS rule, r.trigger AS trigger, r.depth AS depth FROM automation_step s JOIN automation_run r ON r.id = s.run WHERE s.kind = 'script' AND s.answer = ?",
    job,
  );
  if (runs.length === 0) return null;
  let depth = 0;
  const seen = new Set<string>();
  for (const run of runs) {
    depth = Math.max(depth, run.depth);
    let trigger: RunTrigger;
    try {
      trigger = JSON.parse(run.trigger) as RunTrigger;
    } catch {
      continue;
    }
    for (const s of Array.isArray(trigger.chain) ? trigger.chain : []) if (typeof s === 'string') seen.add(s);
    if (typeof trigger.entry === 'string') seen.add(link(run.rule, trigger.entry));
  }
  return { depth, seen: [...seen], stopped: [] };
}

type RunRow = {
  id: string;
  rule: string;
  version: number;
  trigger: string;
  state: string;
  step: number;
  vars: string;
  depth: number;
  project: string | null;
  actor: string;
};

type Vars = Record<string, string | number | boolean | null>;

/**
 * What a question to Slash reads for each variable a `set_var` filled from a field that never leaves the record: the
 * same `to` filled again from the row `sendable` leaves, so `{{trigger.row.pin}}` is the dash a missing field is
 * written as and `{{trigger.row}}` is the row's JSON without `pin`. A variable not here was the same either way.
 *
 * KEPT BESIDE `vars` IN THE RUN'S OWN COLUMN, UNDER A KEY NO VARIABLE CAN HAVE. A run parks at every ask and wait and
 * is read back from its row, so what it keeps has to be in the row, and `automation_run` has one column for it.
 * `-sendable` fails the lint's `NAME` and `RUN_PATH` alike, so no step names it and no `{{vars.…}}` reaches it, and it
 * is taken off before `vars` is read (`unpack`). `finish` writes `vars` alone, so it goes when a run ends with its
 * answers written, since no question follows the last step; a cancelled run, whose column is left as it was, keeps it.
 */
type Kept = Record<string, string>;
const KEPT = '-sendable';

/**
 * The fields of the run's own row that a step wrote from a value a question to Slash may not carry, which the question
 * then reads as if the list did not have them: `sendable` takes them out with the secret fields themselves.
 *
 * BESIDE `-sendable`, UNDER A KEY NO VARIABLE CAN HAVE, for the same reason: a run parks between the `set` and the
 * question, and what it holds has to be in its row. Audit forty-nine §7 measured, with the lint's check off, a `set` of
 * `note` from `{{pin}}` then `{{note}}`, `{{trigger.row.note}}` and `about: [note]` each queueing `hunter2` for Slash.
 * Written whenever `-sendable` is, empty when nothing is held, so a column with `-sendable` and without this is one a
 * build before it parked, and `advance` rebuilds it.
 */
const UNSENT = '-unsent';

/**
 * The variables a `set_var` filled from a secret or file field, or from another such variable, which a step that
 * writes may not copy anywhere but into another such field (`sealedPaths`).
 *
 * NOT `-sendable`, WHICH IS WIDER ON PURPOSE. What a question to Slash reads in a variable's place is filled from
 * `sendable`'s row, which also drops every field the live list does not declare, so a variable set from
 * `{{trigger.row}}` is kept there whenever the row holds one. Refusing a write on that would refuse a note on a list
 * with no secret field. This key holds only what came from a field declared secret or file. Kept beside the other two
 * in the run's column for their reason: a run parks between the `set_var` and the step that writes it.
 */
const SEALED = '-sealed';

/**
 * A run's stored `vars`, split into the variables, what a question to Slash reads in their place, the fields it reads
 * as absent, and the variables set from a secret. `kept` is `null` when the column has no `-sendable`, which is a run a
 * build before the key parked, or one no step has saved yet, and `unsent` and `sealed` are `null` when the column has
 * no key of theirs, for the same two reasons.
 */
function unpack(stored: string): { vars: Vars; kept: Kept | null; unsent: string[] | null; sealed: string[] | null } {
  const all = JSON.parse(stored) as Vars & { [KEPT]?: Kept; [UNSENT]?: string[]; [SEALED]?: string[] };
  const kept = all[KEPT] ?? null;
  const unsent = Array.isArray(all[UNSENT]) ? all[UNSENT] : null;
  const sealed = Array.isArray(all[SEALED]) ? all[SEALED] : null;
  delete all[KEPT];
  delete all[UNSENT];
  delete all[SEALED];
  return { vars: all as Vars, kept, unsent, sealed };
}

/**
 * What a run would have kept, taken again from the steps it has done: each `set_var` filled a second time as `advance`
 * fills it, in the order the run took them, over variables replayed from the same rows, and each answer taking off
 * what was kept under its name as `answerStep` does.
 *
 * FOR A RUN A BUILD BEFORE `-sendable` PARKED. That build wrote `vars` alone, so a run it parked on a wait or an ask
 * between the `set_var` and the question woke under this build with nothing kept, and its question to Slash was filled
 * from `vars`: measured on 23 September, `Given hunter2, plain, r hunter2?`. This build writes the key on every save,
 * empty when nothing is kept (`pack`), so a column with none is that build's or a run not yet saved, which has no
 * step rows and rebuilds to nothing.
 *
 * FILLED FROM THE ROW AS IT IS NOW, since the row as it was at the `set_var` is not kept. A variable is kept wherever
 * the clean fill differs from what its step row recorded, so a text field edited since the `set_var` puts its new
 * words in the question where its old ones stood. That is a value that may leave in place of another that may, and the
 * other way round, comparing against the row as it is now, would let `pin` through for a row whose `pin` was cleared
 * since. A step row holds `VARS_BYTES` and one variable holds `VAR_BYTES`, fewer, so the recorded value is whole.
 *
 * AND EACH `set` AND `tag` FILLED BOTH WAYS AGAIN, as `advance` fills them, so the fields a run parked by a build
 * before `-unsent` wrote from a secret are held as if this build had taken the step. A `set` records no value, so the
 * fill it is compared with is taken again too, from the row as it is now, and the field is compared with the clean fill
 * as well, because the secret it was written from may have been cleared since.
 */
function rebuilt(deps: FlowDeps, run: string, program: Op[], started: Record<string, unknown>, row: Entry | null): { kept: Kept; unsent: Set<string> } {
  const kept: Kept = {};
  const vars: Vars = {};
  const unsent = new Set<string>();
  const metric = figures(deps, () => landsOf(program, row));
  const clean = (): Entry | null => (row ? sendable(deps, row, unsent) : null);
  for (const done of deps.sql.all<{ n: number; kind: string; answer: string | null }>(
    "SELECT n, kind, answer FROM automation_step WHERE run = ? AND state = 'done' AND kind IN ('set_var', 'ask_person', 'ask_slash', 'set', 'tag') ORDER BY n",
    run,
  )) {
    const cleaned = clean();
    const trigger = cleaned ? { ...started, row: cleaned.fields } : started;
    if (done.kind === 'set' || done.kind === 'tag') {
      const step = program[done.n]?.step;
      const w = step && row && cleaned ? writes(deps, done.kind, step, { vars, trigger: started, metric }, { vars: { ...vars, ...kept }, trigger, metric }, row, cleaned) : null;
      /* AND A FIELD THAT DOES NOT HOLD WHAT THE CLEAN FILL WOULD HAVE WRITTEN IS HELD BACK TOO. Two fills of the row as it
         is now agree once the secret is cleared during the wait, while the field still holds what the step wrote from
         it: measured on 23 September, `pin` removed while the run waited on a person and the question went out as
         `Rate for hunter2?` with `about: { note: 'hunter2' }`. A field a person edited since is held back as well, which
         costs a question a value it could have carried, on a run only a build before `-unsent` parked. */
      const tags = row?.fields.tags;
      const held = w !== null && row !== null && (done.kind === 'set' ? String(row.fields[w.field] ?? '') !== w.clean : !(Array.isArray(tags) && tags.includes(w.clean)));
      mark(unsent, done.kind, w && { field: w.field, carries: w.carries || held });
      continue;
    }
    const spec = program[done.n]?.step[done.kind] as { name?: string; to?: string; as?: string } | undefined;
    if (done.kind !== 'set_var') {
      if (typeof spec?.as !== 'string') continue;
      vars[spec.as] = done.answer;
      delete kept[spec.as];
      continue;
    }
    if (typeof spec?.name !== 'string' || typeof spec.to !== 'string') continue;
    const again = String(fill(spec.to, { vars: { ...vars, ...kept }, trigger, metric }));
    vars[spec.name] = done.answer;
    if (again === done.answer) delete kept[spec.name];
    else kept[spec.name] = again;
  }
  return { kept, unsent };
}

/**
 * The field a `set` or a `tag` writes on the run's row, and whether what it writes differs from what the same step
 * would write from the row a question to Slash may carry and the variables as they were kept (`-sendable`). `null`
 * for a step whose shape names no field, which the pass refuses on its own.
 *
 * FILLED AS THE STEP IS: the pass fills a `set`'s `to` from the run and the row in one pass (`rules.ts`'s `filling`),
 * and `advance` fills a tag's word from the run alone. Two fills that agree wrote nothing a question could not already
 * carry.
 *
 * AND THE FIELD IS THE ONE THE RUN FILLS IT TO, since `act` hands the pass the filled step. Read as written, `field:
 * '{{vars.f}}'` with `f` set to `note` held back `{{vars.f}}`, the pass wrote `note` from `{{pin}}`, and the question
 * after it went out as `Rate for hunter2 hunter2?` with `about: { note: 'hunter2' }` (audit fifty-one §3, L4). The lint
 * refuses a field in braces at install; this is the second line, for a rule stored before it did.
 */
function writes(
  deps: FlowDeps,
  verb: 'set' | 'tag',
  step: Record<string, unknown>,
  scope: Record<string, unknown>,
  cleanScope: Record<string, unknown>,
  row: Entry,
  cleanRow: Entry,
): { field: string; carries: boolean; clean: string } | null {
  if (verb === 'tag') {
    if (typeof step.tag !== 'string') return null;
    const clean = String(fill(step.tag, cleanScope));
    return { field: 'tags', carries: fill(step.tag, scope) !== clean, clean };
  }
  const spec = step.set as { field?: unknown; to?: unknown } | undefined;
  if (typeof spec?.field !== 'string' || typeof spec.to !== 'string') return null;
  const as = filling(spec.to, row, deps.nowMs, { run: pathsOf(scope) }).text;
  const clean = filling(spec.to, cleanRow, deps.nowMs, { run: pathsOf(cleanScope) }).text;
  return { field: String(fill(spec.field, scope)), carries: as !== clean, clean };
}

/**
 * What a write does to the fields held back: one that carries adds its field, and a plain `set` takes its field off,
 * since the field now holds the plain value. A plain `tag` takes nothing off, because a tag is added beside the ones
 * already there and the one from the secret is still among them.
 */
function mark(unsent: Set<string>, verb: 'set' | 'tag', w: { field: string; carries: boolean } | null): void {
  if (w === null) return;
  if (w.carries) unsent.add(w.field);
  else if (verb === 'set') unsent.delete(w.field);
}

/**
 * The three again, as the run's column holds them. A `null` `kept` is a column a build before the key wrote, and it is
 * written back as it was, `vars` alone, so that `advance` still rebuilds it; a `null` `unsent` is written back without
 * its key for the same reason.
 *
 * WITH NOTHING KEPT THE KEY IS STILL WRITTEN, EMPTY. The key's presence is the only sign this build parked the run.
 * Leaving it off when nothing was kept made every such run read as an earlier build's and rebuilt from the row as it
 * is now: measured on 23 September, `p` set from `note` while it said `plain`, `note` edited during the wait, and Slash
 * asked `Given changed?` about a variable holding `plain`, in a rule with no secret in it.
 */
function pack(vars: Vars, kept: Kept | null, unsent: Iterable<string> | null, sealed: Iterable<string> | null): string {
  return JSON.stringify(
    kept === null ? vars : { ...vars, [KEPT]: kept, ...(unsent === null ? {} : { [UNSENT]: [...unsent] }), ...(sealed === null ? {} : { [SEALED]: [...sealed] }) },
  );
}

/**
 * The variables a run set from a secret, taken again from the steps it has done, for a column a build before `-sealed`
 * parked. Each `set_var` in the order the run took it, over the row as it is now, since the row as it was is not kept;
 * an answer written under a name takes it off, as `answerStep` does.
 */
function sealedAgain(deps: FlowDeps, run: string, program: Op[], scope: Record<string, unknown>, row: Entry | null): Set<string> {
  const out = new Set<string>();
  const fields = row ? sealedOf(deps.sql, row.register) : new Set<string>();
  for (const done of deps.sql.all<{ n: number; kind: string }>(
    "SELECT n, kind FROM automation_step WHERE run = ? AND state = 'done' AND kind IN ('set_var', 'ask_person', 'ask_slash') ORDER BY n",
    run,
  )) {
    const spec = program[done.n]?.step[done.kind] as { name?: unknown; to?: unknown; as?: unknown } | undefined;
    if (done.kind !== 'set_var') {
      if (typeof spec?.as === 'string') out.delete(spec.as);
      continue;
    }
    if (typeof spec?.name !== 'string' || typeof spec.to !== 'string') continue;
    /* EVERY VARIABLE READ AS HOLDING SOMETHING, since only its step row knows what it held then. */
    const reads = sealedPaths({ ...scope, vars: Object.fromEntries([...out].map((n) => [n, 'x'])) }, row, fields, out);
    if (sealedIn(spec.to, reads) !== null) out.add(spec.name);
    else out.delete(spec.name);
  }
  return out;
}

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/* ── what is installed ──────────────────────────────────────────────── */

/**
 * What `installed` has already parsed, per record, keyed by declaration id, version and checksum. `null` is an inline
 * rule, remembered so that it is not parsed again only to be left out.
 */
const parsed = new WeakMap<Sql, Map<string, Installed | null>>();

/**
 * Every active rule that runs as a run, with its version.
 *
 * `pathOf` DECIDES, AS IT DOES AT INSTALL. An inline rule is `runRules`'s inside the write and is never started here,
 * so a rule is run by exactly one of the two, and a rule installed before `on:` existed is never started twice.
 *
 * A BODY IS PARSED ONCE PER VERSION. This is read on every write of every register, and it ran `JSON.parse` and
 * `pathOf` over every active rule each time: measured on 22 September with sixty rules of twenty steps, 0.55 ms a call,
 * paid by writes that no automation is about, and 0.18 ms with this cache, which is the select of sixty short rows.
 * The key carries the checksum as well as the version because a version number can be reused: an install that rolls
 * back leaves the next install the same number for different bytes. The bodies handed back are shared between calls,
 * so nothing here or in a caller writes to one.
 */
export function installed(sql: Sql): Installed[] {
  const was = parsed.get(sql);
  const now = new Map<string, Installed | null>();
  const out: Installed[] = [];
  for (const r of sql.all<{ id: string; version: number; checksum: string }>(
    "SELECT id, version, checksum FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0",
  )) {
    const key = `${r.id}@${r.version}:${r.checksum}`;
    let hit = was?.get(key);
    if (hit === undefined) {
      const text = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND version = ?', r.id, r.version)?.body;
      const body = text === undefined ? null : (JSON.parse(text) as FlowDecl);
      hit = body !== null && typeof body.rule === 'string' && pathOf(body) === 'run' ? { id: body.rule, version: r.version, body } : null;
    }
    now.set(key, hit);
    if (hit) out.push(hit);
  }
  /* THE MAP IS REPLACED, NOT ADDED TO, so a superseded or retired version leaves it on the next read and a record that
     installs all day does not grow one entry per edit for the life of the process. */
  parsed.set(sql, now);
  return out;
}

/** The body a run started under. A run keeps its version for its life, whatever is installed since. */
function pinned(sql: Sql, rule: string, version: number): FlowDecl | null {
  const row = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND version = ? AND kind = 'rule'", `rule.${rule}`, version);
  return row ? (JSON.parse(row.body) as FlowDecl) : null;
}

/**
 * Why a run of this rule may not take another step, or `null` when the rule is still on.
 *
 * THE PIN IS FOR WHAT A RUN DOES, NOT FOR WHETHER IT MAY. `loop/research-batch-thirty-three-audit.md` §4 installed
 * `enabled: false` as version 2, and then retired the rule, while a run of version 1 waited an hour: both times the run
 * woke, wrote `note: chased` and notified, because `startRun` was the only place that read `enabled`. A plain edit still
 * leaves the run on the steps it started with, as migration 11 promises; only a live version that is off, or none at
 * all, stops it.
 */
function stopped(sql: Sql, rule: string): string | null {
  const live = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'rule' AND superseded_at IS NULL AND retired = 0", `rule.${rule}`);
  if (!live) return `rule.${rule} was retired, so this run stopped before its next step.`;
  if ((JSON.parse(live.body) as FlowDecl).enabled === false) return `rule.${rule} was switched off (enabled: false), so this run stopped before its next step.`;
  return null;
}

/**
 * Cancel every unfinished run of a rule that has just been switched off or retired, with the reason as its sentence.
 *
 * CALLED IN THE TRANSACTION THAT STOPS THE RULE, so the screen that switched it off never shows a run still waiting
 * under it: an install that says `enabled: false`, the kernel's `retire`, and a pack turned off. The last retires its
 * rules in `declare.ts` and did not come through here until audit thirty-five §3 measured why it must: a pack turned off
 * and on again before the wake had its run wake under the rule turned back on, write its row and notify. `advance` still
 * asks at every wake, for a record an earlier build left holding a run of a rule already gone.
 *
 * `because` IS THE SENTENCE WHEN THE CALLER KNOWS MORE THAN THE ROW DOES. A pack's rule reads as retired, and "retired"
 * sends the owner looking for a retire nobody made.
 */
export function cancelRunsOf(deps: FlowDeps, rule: string, because?: string): number {
  const off = stopped(deps.sql, rule);
  if (off === null) return 0;
  const say = because ?? off;
  const open = deps.sql.all<RunRow>(
    "SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE rule = ? AND state IN ('pending', 'running', 'waiting')",
    rule,
  );
  for (const run of open) {
    deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ? AND state = 'pending'", runKey(run.id));
    finish(deps, run, 'cancelled', say);
  }
  return open.length;
}

/* ── the plan ───────────────────────────────────────────────────────── */

const VERBS = [
  'if', 'set_var', 'script', 'call', 'ask_slash', 'ask_person', 'wait',
  'tag', 'untag', 'set', 'move', 'link', 'note', 'notify', 'schedule', 'create', 'suggest', 'run', 'stop',
] as const;

export type Op = { verb: string; step: Record<string, unknown>; to: number };

/**
 * The steps as one flat list, with a branch as a conditional jump.
 *
 * FLAT SO THAT ONE INTEGER SAYS WHERE A RUN IS. A tree would need a path saved beside the run, and a path into an
 * edited tree points somewhere else; an index into the plan of a pinned version cannot. An `if` jumps to its `else`
 * when it is false, and the last step of a `then` that has an `else` is followed by a `jump` past it. A plan has no
 * loops, so each place is reached at most once and is the step row's key.
 */
export function plan(list: unknown): Op[] {
  const out: Op[] = [];
  const walk = (steps: unknown) => {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
      if (!isObject(step)) continue;
      if ('if' in step) {
        const branch: Op = { verb: 'if', step, to: -1 };
        out.push(branch);
        walk(step.then);
        if (step.else === undefined) branch.to = out.length;
        else {
          const jump: Op = { verb: 'jump', step, to: -1 };
          out.push(jump);
          branch.to = out.length;
          walk(step.else);
          jump.to = out.length;
        }
      } else out.push({ verb: VERBS.find((v) => v in step) ?? 'unknown', step, to: -1 });
    }
  };
  walk(list);
  return out;
}

/* ── starting ───────────────────────────────────────────────────────── */

/** Arm the run's own schedule row. `ON CONFLICT` because a run that waits twice re-arms the same row. */
function wake(deps: FlowDeps, run: string, atMs: number): void {
  deps.sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'rule', ?, ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
    deps.mint(),
    instant(atMs),
    runKey(run),
    JSON.stringify({ run }),
  );
}

/**
 * Record that a run is due, and arm it for now unless the caller takes it at once.
 *
 * `runs_per_day` IS COUNTED OVER THE LAST TWENTY-FOUR HOURS, NOT A CALENDAR DAY. A calendar day in which timezone is a
 * question the record would have to answer for every rule, and a rolling window has no midnight at which a rule on a
 * busy register gets a thousand fresh runs at once.
 */
export function startRun(
  deps: FlowDeps,
  rule: Installed,
  trigger: RunTrigger,
  o: { actor: string; depth?: number; arm?: boolean },
): Result<{ run: string }> {
  const name = `rule.${rule.id}`;
  if (rule.body.enabled === false) return no('OUT_OF_BOUNDS', `${name} is switched off (enabled: false), so it starts no runs.`, { at: 'enabled' });
  const limit = rule.body.limits?.runs_per_day ?? RUNS_PER_DAY_CEILING;
  const today = deps.sql.one<{ n: number }>(
    'SELECT count(*) AS n FROM automation_run WHERE rule = ? AND started_at > ?',
    rule.id,
    instant(deps.nowMs - DAY_MS),
  )?.n ?? 0;
  if (today >= limit)
    return no('OUT_OF_BOUNDS', `${name} has started ${today} ${today === 1 ? 'run' : 'runs'} in the last day, and ${limit} is its most. Nothing was started.`, {
      at: 'limits.runs_per_day',
    });

  const id = deps.mint();
  deps.sql.exec(
    `INSERT INTO automation_run (id, rule, version, trigger, state, step, vars, depth, project, actor, started_at)
     VALUES (?, ?, ?, ?, 'pending', 0, '{}', ?, ?, ?, ?)`,
    id,
    rule.id,
    rule.version,
    JSON.stringify(trigger),
    o.depth ?? 0,
    rule.body.project ?? null,
    o.actor,
    instant(deps.nowMs),
  );
  if (o.arm !== false) wake(deps, id, deps.nowMs);
  return ok({ run: id });
}

/**
 * A write happened: start every run-path rule its `written` trigger admits.
 *
 * `op`, `fields`, `project` AND `when` ARE READ HERE, which is the reason those bodies are on the run path at all: the
 * inline pass fires on every write and cannot tell a create from an edit. `once_per` is claimed here too, at the start,
 * with the same marker an inline rule uses, so one row starts one run however many times it is written.
 *
 * A WRITE MADE BY A RULE STARTS NOTHING unless the trigger says `from_rules: true`, and then at the writer's depth plus
 * one, refused past three. Rules have never chained; this keeps that as the default and makes a chain a thing somebody
 * asked for in writing (§8, question 1).
 *
 * A WRITE MADE BY A RULE-STARTED SCRIPT IS NEITHER A STRANGER'S NOR A RULE'S (`Chain`). It starts rules without
 * `from_rules`, because a cascade through a script is what the owner approved when they installed a script that says
 * `runs: { rule: true }`, and Work's follow-ups close that way. But it never starts a rule on a row that rule already
 * ran for in the chain, and it starts at the chain's depth plus one, refused past `SCRIPT_CHAIN_CEILING`.
 */
export function onWritten(
  deps: FlowDeps,
  rules: readonly Installed[],
  w: { entry: Entry; register: string; op: 'create' | 'update' | 'delete'; changed: readonly string[]; byRule: boolean; depth: number; actor: string },
): void {
  const chain = chains.get(deps.sql) ?? null;
  const depth = chain === null ? w.depth : Math.max(w.depth, chain.depth + 1);
  for (const rule of rules) {
    if (triggerOf(rule.body) !== 'written') continue;
    const spec = (rule.body.on as Extract<Trigger, { written: unknown }>).written;
    if (spec.register !== w.register) continue;
    if (w.byRule && spec.from_rules !== true) continue;
    if (w.depth > CHAIN_CEILING) continue;
    if (chain !== null && chain.seen.includes(link(rule.id, w.entry.id))) continue;
    if (spec.op !== undefined && !spec.op.includes(w.op)) continue;
    if (spec.fields !== undefined && w.op !== 'delete' && !spec.fields.some((f) => w.changed.includes(f))) continue;
    if (rule.body.project !== undefined && deps.projectOf(w.entry) !== rule.body.project) continue;
    if (rule.body.when !== undefined && !holds(deps, rule.body.when, w.entry)) continue;
    /* THE BOUND IS ASKED LAST, after everything else that decides whether the rule is for this write, so that what the
       script's run says it stopped is a run that would have started, and not every rule on the list. */
    if (depth > SCRIPT_CHAIN_CEILING) {
      chain?.stopped.push(`rule.${rule.id} on ${w.entry.seq === null ? w.entry.id : `${w.register}#${w.entry.seq}`}`);
      continue;
    }
    const key = rule.body.once_per?.length ? onceKey({ rule: rule.id, once_per: rule.body.once_per } as RuleDecl, w.entry) : null;
    if (key !== null && !marker(deps.sql, deps.mint, deps.nowMs, key, { rule: rule.id, entry: w.entry.id }, false)) continue;
    /* A REFUSAL HERE IS THE DAY'S CEILING OR A SWITCHED-OFF RULE, and neither is the writer's fault: the write stands.
       The marker goes back, as the inline pass gives one back for a rule that did nothing, or the row would be
       counted as run for ever by a run that never started. */
    const trigger: RunTrigger = {
      kind: 'written',
      entry: w.entry.id,
      register: w.register,
      op: w.op,
      ...(w.op === 'delete' ? { deleted: true as const } : {}),
      ...(chain !== null && chain.seen.length > 0 ? { chain: chain.seen } : {}),
    };
    const started = startRun(deps, rule, trigger, { actor: w.actor, depth });
    if (!started.ok && key !== null) deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ?", key);
  }
}

/**
 * An arrival was stored: start every rule its `arrival` trigger admits.
 *
 * NEVER FOR A REDELIVERY. Every webhook sender retries, and the redelivery branch hands back the state it had the
 * first time, so a trigger that read the state alone would start one run per retry: the bug `3′` records beside it.
 * The run's row is the first row the arrival wrote, where it wrote one.
 */
export function onArrival(
  deps: FlowDeps,
  rules: readonly Installed[],
  a: { raw: string; channel: string; ingest: string | null; state: string; wrote: readonly string[]; verified: boolean; redelivered?: true },
): void {
  if (a.redelivered) return;
  for (const rule of rules) {
    if (triggerOf(rule.body) !== 'arrival') continue;
    const spec = (rule.body.on as Extract<Trigger, { arrival: unknown }>).arrival as Extract<Trigger, { arrival: unknown }>['arrival'] & { unverified?: boolean };
    /* AN ARRIVAL NOTHING VERIFIED STARTS NOTHING UNLESS THE RULE ASKED FOR IT IN WRITING. Audit thirty-three §5: five
       posts with a wrong token each started a run on `channel: webhook`, spent a `runs_per_day` of five, and wrote the
       sender's own text into five notes, and the owner's real message after them started nothing. A rule keyed on an
       `ingest:` was already safe, because an unverified arrival is stored with none; a rule on a channel or on
       `state: [untriaged]` was not. */
    if (!a.verified && spec.unverified !== true) continue;
    if (spec.ingest !== undefined && spec.ingest !== a.ingest) continue;
    if (spec.channel !== undefined && spec.channel !== a.channel) continue;
    if (spec.state !== undefined && !spec.state.includes(a.state)) continue;
    const row = a.wrote[0] === undefined ? null : deps.entry(a.wrote[0]);
    if (rule.body.project !== undefined && (row === null || deps.projectOf(row) !== rule.body.project)) continue;
    startRun(
      deps,
      rule,
      { kind: 'arrival', arrival: a.raw, channel: a.channel, ingest: a.ingest, verified: a.verified, ...(row ? { entry: row.id, register: row.register } : {}) },
      { actor: `ingest:${a.ingest ?? a.channel}` },
    );
  }
}

/** When a clock rule is first due: its time of day where it names one, and one interval from now where it does not. */
export function firstDue(body: FlowDecl, nowMs: number, tz: string): number | null {
  const on = body.on as { every?: string; at?: string; day?: string } | undefined;
  if (typeof on?.every !== 'string') return null;
  const ms = intervalMs(on.every);
  if (ms === null) return null;
  if (typeof on.at === 'string') return nextOccurrence({ at: on.at, ...(typeof on.day === 'string' ? { day: on.day } : {}) }, nowMs, tz);
  return nowMs + ms;
}

/**
 * A clock rule's turn: one run, taken now, and the next turn.
 *
 * THE NEXT TURN COUNTS FROM WHEN THIS ONE WAS DUE, not from when the drain reached it, so an hourly rule stays on the
 * hour it was installed at rather than walking later by however late each alarm was. A rule retired or edited off its
 * clock ends the row, as a digest whose declaration is gone does.
 */
export function onClock(deps: FlowDeps, rule: string, dueAt: string): number | null {
  const found = installed(deps.sql).find((r) => r.id === rule);
  if (!found || triggerOf(found.body) !== 'every') return null;
  const started = startRun(deps, found, { kind: 'every' }, { actor: `rule:${rule}`, arm: false });
  if (started.ok) {
    const at = advance(deps, started.value.run);
    if (at !== null) wake(deps, started.value.run, at);
  }
  const on = found.body.on as { every: string; at?: string; day?: string };
  if (typeof on.at === 'string') return nextOccurrence({ at: on.at, ...(typeof on.day === 'string' ? { day: on.day } : {}) }, deps.nowMs, deps.tz);
  const ms = intervalMs(on.every);
  if (ms === null) return null;
  let next = Date.parse(dueAt) + ms;
  if (!Number.isFinite(next)) next = deps.nowMs + ms;
  while (next <= deps.nowMs) next += ms;
  return next;
}

/* ── taking the steps ───────────────────────────────────────────────── */

/**
 * Take a run's steps from where it is, until it finishes or parks on a wait. The wake time when it parked, else `null`.
 *
 * THE ANSWER IS THE SCHEDULE ROW'S NEXT DUE TIME, and that is why it is returned rather than armed here: this is
 * called from the run's own `rule` row while the drain holds it `firing`, and the drain writes `done` over any row a
 * handler answers `null` for. A wait armed from inside would be marked done the moment the handler returned.
 */
export function advance(deps: FlowDeps, id: string): number | null {
  const run = deps.sql.one<RunRow>('SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE id = ?', id);
  if (!run || (run.state !== 'pending' && run.state !== 'running' && run.state !== 'waiting')) return null;
  const off = stopped(deps.sql, run.rule);
  if (off !== null) {
    finish(deps, run, 'cancelled', off);
    return null;
  }
  const decl = pinned(deps.sql, run.rule, run.version);
  if (!decl) {
    finish(deps, run, 'failed', `rule.${run.rule} version ${run.version}, which this run started under, is not in the record.`);
    return null;
  }

  const program = plan(decl.steps ?? decl.then);
  const trigger = JSON.parse(run.trigger) as RunTrigger;
  const { vars, kept: stored, unsent: marked, sealed: tainted } = unpack(run.vars);
  let subject = trigger.entry ? deps.entry(trigger.entry) : null;
  /* WHAT A STEP READS AND WHAT IT WRITES ARE TWO ROWS WHEN A DELETE STARTED THE RUN. Its conditions and templates read
     the row as it was deleted, which is what the rule was written about; its writes get `subject`, which is `null`,
     so a `set` on a deleted row fails with a sentence rather than bringing the row back. */
  const last = subject === null && trigger.deleted === true && trigger.entry ? deletedRow(deps.sql, trigger.entry) : null;
  const read = (): Entry | null => subject ?? last;
  const actor = `rule:${run.rule}`;
  const metric = figures(deps, () => landsOf(program, read()));
  const scope = () => ({ vars, trigger: context(deps, trigger, read()), metric });
  /* A COLUMN WITH NO `-sendable` IS REBUILT BEFORE THE FIRST STEP, not at the question. A `set_var` taken after the wake
     may keep something of its own, and then the question finds the run keeping something and has no sign that `p`,
     set before the wake, is missing from it: with the rebuild moved to the question and done only for a run keeping
     nothing, a run that set `s` from `pin` after the wait asked `Given hunter2, plain, r hunter2, —?`. Only a run with a
     question to Slash still ahead pays for the replay, since nothing else reads what is kept.

     A COLUMN WITH `-sendable` AND NO `-unsent` IS REPLAYED FOR THE FIELDS ALONE, and what it kept is read as it was
     kept, since that build kept it correctly and knew nothing of the row. */
  const again =
    (stored === null || marked === null) && program.slice(run.step).some((o) => o.verb === 'ask_slash') ? rebuilt(deps, id, program, context(deps, trigger, read()), read()) : null;
  const kept = stored ?? again?.kept ?? {};
  const unsent = new Set(marked ?? again?.unsent ?? []);
  const sealedVars = new Set(tainted ?? sealedAgain(deps, id, program, context(deps, trigger, read()), read()));
  /* THE FIELDS OF THE RUN'S ROW THAT NEVER LEAVE, and the run's paths over them, as a step that writes reads them. */
  const sealedFields = (): ReadonlySet<string> => {
    const row = read();
    return row ? sealedOf(deps.sql, row.register) : new Set();
  };
  const paths = (): RunFill => sealedPaths(scope(), read(), sealedFields(), sealedVars);
  deps.sql.exec("UPDATE automation_run SET state = 'running' WHERE id = ?", id);

  /* FINISHED BEFORE THE STEP ROW SAYS FAILED, because `finish` lets go of whatever a `waiting` step row still holds,
     and the expiry of an ask is a failure whose row was `waiting` until this line. */
  const fail = (n: number, kind: string, say: string): null => {
    finish(deps, { ...run, step: n }, 'failed', say, vars);
    record(deps, id, n, kind, 'failed', null);
    return null;
  };

  /* WHERE THE RUN IS, SAVED AFTER EVERY STEP THAT IS DONE. This was written only at a wait and at the end, so a run that
     stopped between two steps started again from its last wait and took every step since a second time: audit
     thirty-three §1 counted six notifies in twelve hours from one row. A step that finished is never taken again. */
  const saved = (next: number): number => {
    deps.sql.exec('UPDATE automation_run SET step = ?, vars = ? WHERE id = ?', next, pack(vars, kept, unsent, sealedVars), id);
    return next;
  };

  let i = run.step;
  try {
    while (i < program.length) {
      const op = program[i]!;
      const step = op.step;

      if (op.verb === 'jump') {
        i = op.to;
        continue;
      }

      if (op.verb === 'if') {
        const said = test(deps, fill(step.if, scope()) as Predicate | string, read(), vars);
        if (said.bad) return fail(i, 'if', `rule.${run.rule} could not read its condition at step ${i + 1}: ${said.bad}`);
        record(deps, id, i, 'if', 'done', said.yes ? 'then' : 'else');
        i = saved(said.yes ? i + 1 : op.to);
        continue;
      }

      if (op.verb === 'wait') {
        /* THE SECOND TIME THIS STEP IS REACHED IS THE WAKE. Its row says `waiting` from the first, and nothing else sets
           a step row to that state, so there is no second clock to compare against and nothing to drift.

           AND A ROW THAT SAYS `done` IS A WAIT ALREADY OVER. A plan has no loops, so a step index is reached once per
           run, and a wait whose row is done has had its span. Reading only `waiting` as the wake parked such a run for
           the whole span again, and the drain's reset of `attempts` on every park kept it from ever failing. */
        const was = deps.sql.one<{ state: string }>('SELECT state FROM automation_step WHERE run = ? AND n = ?', id, i)?.state;
        if (was === 'waiting' || was === 'done') {
          if (was === 'waiting') deps.sql.exec("UPDATE automation_step SET state = 'done', at = ? WHERE run = ? AND n = ?", instant(deps.nowMs), id, i);
          i = saved(i + 1);
          continue;
        }
        const ms = typeof step.wait === 'string' ? intervalMs(step.wait) : null;
        if (ms === null) return fail(i, 'wait', `rule.${run.rule} waits ${JSON.stringify(step.wait)} at step ${i + 1}, and a span is a number and one of m, h, d or w.`);
        record(deps, id, i, 'wait', 'waiting', null);
        deps.sql.exec("UPDATE automation_run SET state = 'waiting', step = ?, vars = ? WHERE id = ?", i, pack(vars, kept, unsent, sealedVars), id);
        return deps.nowMs + ms;
      }

      if (op.verb === 'set_var') {
        const spec = step.set_var as { name: string; to: string };
        const value = String(fill(spec.to, scope()));
        if (value.length > VAR_BYTES) return fail(i, 'set_var', `rule.${run.rule} sets ${spec.name} to ${value.length} characters, and one answer holds ${VAR_BYTES}.`);
        /* AND FILLED A SECOND TIME, FROM WHAT A QUESTION TO SLASH MAY CARRY: the row `sendable` leaves, and every
           variable already kept here read as it was kept, so one set from another carries the cleaning with it. The
           first fill alone is what audit forty-six measured leaving through a real self-host: `set_var: { to:
           '{{trigger.row.pin}}' }` then `{{vars.p}}` put "given hunter2" in the model's request body, and `to:
           '{{trigger.row}}'` put the row's JSON there with `pin` in it. The lint refuses both at install; this is the
           second line, for a rule an earlier build let install.

           BOTH FILLS READ `vars` AS IT WAS BEFORE THIS STEP. The second was taken after the new value went in, so
           `to: '{{vars.p}} more'` read its own result, the fills differed, and Slash was asked `plain more more` about
           a variable holding `plain more`. */
        const row = read();
        const now = scope();
        const clean = String(fill(spec.to, { vars: { ...vars, ...kept }, trigger: row ? { ...now.trigger, row: sendable(deps, row, unsent).fields } : now.trigger, metric }));
        /* AND WHETHER IT TOOK A SECRET, read from where its paths go before the value goes in (`sealedPaths`), for the
           steps after it that write. */
        const secret = sealedIn(spec.to, paths());
        vars[spec.name] = value;
        if (clean === value) delete kept[spec.name];
        else kept[spec.name] = clean;
        if (secret !== null) sealedVars.add(spec.name);
        else sealedVars.delete(spec.name);
        if (JSON.stringify(vars).length > VARS_BYTES) return fail(i, 'set_var', `rule.${run.rule}'s answers passed ${VARS_BYTES} characters at step ${i + 1}.`);
        record(deps, id, i, 'set_var', 'done', value);
        i = saved(i + 1);
        continue;
      }

      /* SLASH IS NOT ASKED ON A HOST THAT WOULD NOT ANSWER: a question queued for nobody waits its day and fails, having
         asked nobody. Checked before anything is queued, for a rule that became live without meeting `unserved`. */
      if (op.verb === 'ask_slash' && !deps.answersSlash)
        return fail(
          i,
          op.verb,
          `rule.${run.rule} reached an ask_slash step, and no host in this build answers an automation's question to Slash (NOT_IN_THIS_BUILD). The steps before it were taken.`,
        );

      if (op.verb === 'ask_person' || op.verb === 'ask_slash') {
        /* THE SECOND TIME AN ASK IS REACHED IS THE END OF ITS WAIT, as for `wait`. An answer moves the run past the
           step before the drain comes back (`answerStep`), so a wake that lands here with the row still `waiting` is
           a wake nobody answered before. */
        const was = deps.sql.one<{ state: string; answer: string | null }>('SELECT state, answer FROM automation_step WHERE run = ? AND n = ?', id, i);
        if (was?.state === 'done') {
          i = saved(i + 1);
          continue;
        }
        if (was?.state === 'waiting') {
          const spec = step[op.verb] as { wait?: string };
          return fail(
            i,
            op.verb,
            op.verb === 'ask_person'
              ? `rule.${run.rule} asked ${was.answer ?? 'a question'} at step ${i + 1}, and nobody answered it within ${spec.wait ?? ASK_PERSON_WAIT}, so the run stopped there.`
              : `rule.${run.rule} asked Slash at step ${i + 1}, and Slash did not answer within a day, so the run stopped there.`,
          );
        }
        const asked = ask(deps, run.rule, op.verb, step, i, id, scope(), kept, unsent, sealedVars, read(), actor);
        if (!asked.ok) return fail(i, op.verb, asked.say);
        record(deps, id, i, op.verb, 'waiting', asked.holds);
        deps.sql.exec("UPDATE automation_run SET state = 'waiting', step = ?, vars = ? WHERE id = ?", i, pack(vars, kept, unsent, sealedVars), id);
        return deps.nowMs + asked.waitMs;
      }

      if (op.verb === 'call')
        return fail(i, op.verb, `rule.${run.rule} reached a call step, and a step that waits on a call is not in this build (NOT_IN_THIS_BUILD). The steps before it were taken.`);

      if (op.verb === 'script') {
        const started = startScript(deps, run.rule, step, i, read(), paths());
        if (!started.ok) return fail(i, op.verb, started.say);
        /* THE JOB ID TAKES THE NAME OFF WHATEVER IT HELD, as an answer does in `answerStep`. Left in `kept` and
           `sealedVars`, a name first set from a secret still read as one: the checker measured `set_var: job` from `pin`,
           then `script: { as: job }`, then `set: { what: 'queued {{vars.job}}' }` failing the run as a secret copy. */
        const spec = step.script as { as?: unknown };
        if (typeof spec.as === 'string') {
          vars[spec.as] = started.job;
          delete kept[spec.as];
          sealedVars.delete(spec.as);
        }
        record(deps, id, i, 'script', 'done', started.job);
        i = saved(i + 1);
        continue;
      }

      /* A WRITE TO THE ROW IS FILLED BOTH WAYS TOO, before it is taken, since the row it is filled from is the row as it
         stands now. The field it writes is held back from every question to Slash after it when the two differ, and
         given back by a plain `set` of it: a question reads the row as the step left it, and audit forty-nine §7
         measured `set: { field: note, to: '{{pin}}' }` then `{{note}}`, `{{trigger.row.note}}`, `about: [note]` and a
         `set_var` from `note` each queueing `hunter2` for Slash. The lint refuses those at install, and since wave
         fifty-five the step below is refused at run time as well, so for a secret this now marks only a copy into a
         field that never leaves either; what it still guards is a run an earlier build took past such a write, whose
         `-unsent` this column carries on or `rebuilt` replays. */
      const cleanRow = (op.verb === 'set' || op.verb === 'tag') && subject ? sendable(deps, subject, unsent) : null;
      const wrote =
        cleanRow && subject && (op.verb === 'set' || op.verb === 'tag')
          ? writes(deps, op.verb, step, scope(), { vars: { ...vars, ...kept }, trigger: { ...scope().trigger, row: cleanRow.fields }, metric }, subject, cleanRow)
          : null;
      /* A STEP THAT WRITES ANYWHERE BUT THE RUN'S OWN ROW COPIES NO SECRET, unless into a field that never leaves
         either. The lint refuses such a step at install (`flow-lint.ts`, `copyFault`); this is the second line, for a
         rule stored before it did.
         Measured on 23 September at HEAD `afb3b1b2` with the rule written into the table: `note`, `notify`,
         `schedule`, `create` into another list, `suggest`, `tag` and `set` each wrote `hunter2` from
         `{{trigger.row.pin}}`, `{{trigger.row}}` or a variable set from `pin`, into the note event, a Payments row, the
         schedule, the question queue and the row itself. The texts the pass fills are handed to it as typed with the
         run's paths beside them (`handOn`), so each is filled once and the pass refuses the copy there; every other
         string is filled here, and a copy in one of those fails the step here. The sentence names the spelling and
         never the value. */
      const by = paths();
      const handed = handOn(step, by, subject !== null);
      /* A `tag` OF THE RUN'S OWN ROW IS REFUSED WITH THE REST, and a `set` is refused by the pass, which fills its `to`
         (`rules.ts`). Wave fifty-four wrote both and held the field back from what leaves; measured at HEAD `b7409d2d`,
         `tag: 'x {{trigger.row.pin}}'` stored past the lint put `x hunter2` in the row's tags, which every reader of
         the list sees. `mark` below is left holding back only what a `set` copies into a field that never leaves
         either, and a field no live declaration types.

         AN `untag` IS LET THROUGH, as the lint lets it install (`flow-lint.ts`'s `COPIERS`). At HEAD `b7409d2d` it
         installed and then failed its run whenever the secret held anything, because this check read every string of
         the step and exempted `set` and `tag` alone. It writes the row's own tags back less one word and adds none,
         so what it tells a reader is whether a tag equalled the secret, which an `if` on the field already tells. */
      if (handed.secret !== null && op.verb !== 'untag')
        return fail(
          i,
          op.verb,
          `rule.${run.rule}'s ${op.verb} at step ${i + 1} reads ${handed.secret}, which holds what a secret or file field holds, and such a field is copied only into another secret or file field. The step was not taken; the steps before it were.`,
        );
      const acted = act(deps, run.rule, op.verb, handed.action as RuleAction, subject, id, actor, subject === null ? last : null, by);
      if (!acted.ok) return fail(i, op.verb, acted.say);
      if (op.verb === 'set' || op.verb === 'tag') mark(unsent, op.verb, wrote);
      record(deps, id, i, op.verb, 'done', acted.answer);
      if (subject) subject = deps.entry(subject.id);
      if (acted.stop) break;
      i = saved(i + 1);
    }
  } catch (e) {
    /* A STEP THAT THROWS IS A STEP THAT FAILED, and the run ends here with a sentence. Left to the drain, the throw walked
       its retry ladder over a run still `running`, and each attempt took again every step since the last save; the run
       was never finished, so `pruneRuns` never took it and it held no metered line. What threw in the audit was
       `{ note: { text } }`, which the lint let through and `fill` could not read, but a driver error or a full disk
       arrives the same way. */
    const why = e instanceof Error ? e.message : String(e);
    return fail(i, program[i]?.verb ?? 'step', `rule.${run.rule} broke at step ${i + 1}: ${why}`);
  }

  finish(deps, { ...run, step: i }, 'done', null, vars);
  return null;
}

/**
 * One action, through the inline pass.
 *
 * TWO KEYS OF THE PASS ARE REPLACED. `rules` hands it this one action as a rule of one line, and `schedule` claims
 * every marker without writing one: `once_per` was held when the run STARTED, and a marker per step would be one more
 * `schedule` row per step of every run, for ever, recording nothing the run row does not. The synthetic rule carries
 * `once_per: [entry]` only so that the pass's own refusal of an unkeyed `notify` does not fire on a step that is
 * already once.
 *
 * AND THE RUN'S PATHS GO WITH THE ACTION (`run`), so the pass fills its texts from the run and the row in one pass and
 * says which reach a secret. `handOn` left those texts as typed for it.
 */
function act(
  deps: FlowDeps,
  rule: string,
  verb: string,
  action: RuleAction,
  subject: Entry | null,
  batch: string,
  actor: string,
  gone: Entry | null,
  run: RunFill,
): { ok: true; stop: boolean; answer: string | null } | { ok: false; say: string } {
  const r = deps.rules();
  if (verb === 'stop') return { ok: true, stop: true, answer: null };

  if (subject === null) {
    /* NO ROW: A CLOCK, A BUTTON, OR AN ARRIVAL THAT WROTE NOTHING. The lint keeps the row verbs off the first two;
       an arrival may still reach one, and says so here rather than acting on no row. */
    if ('notify' in action) {
      if (action.notify.urgent === true) r.interrupt({ actor, say: action.notify.say });
      else deps.note(actor, action.notify.say);
      return { ok: true, stop: false, answer: null };
    }
    if ('suggest' in action) {
      const opened = r.suggest(action.suggest.question, action.suggest.options, actor);
      if (opened.ok) return { ok: true, stop: false, answer: opened.value.id };
      return { ok: false, say: refused(opened) ? opened.refusal.fix : `rule.${rule}'s question clashed with one already open.` };
    }
    if (gone)
      return {
        ok: false,
        say: `rule.${rule}'s ${verb} step acts on ${gone.seq === null ? gone.id : `${gone.register}#${gone.seq}`}, which was deleted, and a step does not write to a deleted row.`,
      };
    return { ok: false, say: `rule.${rule}'s ${verb} step acts on a row, and this run has none to act on.` };
  }

  const one: RuleDecl = { rule, register: subject.register, then: [action], once_per: ['entry'] };
  const out = runRules(
    { ...r, rules: () => [one], schedule: () => true },
    { entry: subject, register: subject.register, batch, actor, run },
  );
  const first: Refusal | undefined = out.refused[0];
  if (first) return { ok: false, say: first.fix };
  const call = out.calls[0];
  if (call && call.outcome !== 'queued') return { ok: false, say: call.say };
  return { ok: true, stop: out.stopped, answer: call ? call.outcome : null };
}

/**
 * A `script` step: queue one run of the script, pinned to the version that is active now, and answer the job's id.
 *
 * ONE `script.run` OUTBOX ROW, THE SHAPE A CLOCK'S FIRE WRITES (`script.ts`'s `ScriptRun`), so the host that already
 * leases a scheduled run leases this one with no code of its own, and `finishScript` applies what it wrote through the
 * ordinary write path. The record never runs the source. What the script hands back does not resume this run, so the
 * step does not wait: it is done when the row is queued.
 *
 * MEASURED BEFORE THIS ARM (`packages/kernel/test/rule-script.test.ts`, and W59-1's stop on 24 September at `8a489d4c`):
 * every run that reached a script step failed with "a step that waits on a script is not in this build", and a script
 * declaring `runs: { rule: true }` was read by the egress line that tells the owner about it and by nothing that
 * started one. So a rule could not close a task's follow-ups, and the Work pack declared no cascade.
 *
 * ONLY A SCRIPT THAT SAYS `runs: { rule: true }`. The owner approved each script's header at install, and `runs:` is the
 * part of it that says when it may start; a script written for a clock is not handed a row because a rule named it.
 *
 * THE INPUT IS THE ROW'S IDENTITY AND WHAT THE STEP'S `input:` SAYS, never the row. `id`, `register` and `seq` are what a
 * script needs to read the row and its neighbours through its own `reads:`, which is where a secret field is taken off
 * (`scriptReads` in `@braindog/host`). `input:` is filled from the run as every other step text is, and one that reaches
 * a secret or file field fails the step, as `handOn` fails a note: the lint refuses it at install (`copyFault`), and this
 * is the second line for a rule stored before it did.
 *
 * AND EVERY GATE A CLOCK'S FIRE PASSES, because a rule is a second way into the same queue and the owner's controls are
 * the script's, not the clock's. The first attempt read the declaration and nothing else, and the checker refused it on
 * 24 September: a script paused after three refused runs (`pauseAfterRefusals` in `script-run.ts`) was queued again by
 * the next write that fired the rule, so "it will not run again until somebody resumes it" was not true, and each of
 * those runs would have been refused a fourth, fifth and sixth time. `rule-script.test.ts` measured it: the run finished
 * `done` with one row queued for a paused script. The gates, in the order a fire meets them:
 *   - installed and active, which is `activeScript`'s query and so also refuses one retired or whose pack is off;
 *   - its schedule row not paused, which `drainSchedule` honours for the clock by firing only a pending row. A record
 *     with no row for the script (installed before migration 12 armed one) has nothing paused to honour;
 *   - no unfinished run already queued for the same work (`fireScript`'s busy check). For the clock that is any
 *     unfinished run, since every one carries `input: null`; for a rule it is one with the same input, since two rows
 *     done in the same minute are two runs, and keyed on the name alone the second row's run would never be queued.
 *     The step then answers the job already queued, which is the one that will do the work.
 */
function startScript(
  deps: FlowDeps,
  rule: string,
  step: Record<string, unknown>,
  n: number,
  row: Entry | null,
  by: RunFill,
): { ok: true; job: string } | { ok: false; say: string } {
  const spec = step.script as { id?: unknown; input?: unknown };
  const name = typeof spec?.id === 'string' ? spec.id : '';
  const found = deps.sql.one<{ version: number; body: string }>(
    "SELECT version, body FROM declaration WHERE id = ? AND kind = 'script' AND superseded_at IS NULL AND retired = 0",
    `script.${name}`,
  );
  if (!found) return { ok: false, say: `rule.${rule} starts a script at step ${n + 1}, and there is no script called ${name || '(no name)'} in this record.` };
  const runs = (JSON.parse(found.body) as { runs?: { rule?: unknown } }).runs;
  if (runs?.rule !== true)
    return {
      ok: false,
      say: `rule.${rule} starts script.${name} at step ${n + 1}, and script.${name} does not say runs: { rule: true }, so no rule may start it. Nothing was queued.`,
    };
  const paused = deps.sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", name)?.state === 'paused';
  if (paused)
    return {
      ok: false,
      say: `rule.${rule} starts script.${name} at step ${n + 1}, and script.${name} is paused, so nothing was queued. It starts again once somebody resumes it; the steps before it were taken.`,
    };
  const handed = handOn(isObject(spec.input) ? spec.input : {}, by, false);
  if (handed.secret !== null)
    return {
      ok: false,
      say: `rule.${rule}'s script at step ${n + 1} hands on ${handed.secret}, which holds what a secret or file field holds, and a script's input never carries one. Nothing was queued; the steps before it were taken.`,
    };
  const input = { ...(row ? { id: row.id, register: row.register, seq: row.seq } : {}), ...handed.action };
  /* COMPARED AS JSON TEXT IN THIS PROCESS, not by `json_extract` in SQL: both sides are `JSON.stringify` of an object
     this function built in the same key order, and SQLite's own rendering of an object is not promised to match it. */
  const same = JSON.stringify(input);
  const waiting = deps.sql
    .all<{ id: string; payload: string }>(
      `SELECT id, payload FROM outbox WHERE kind = 'script.run' AND state IN ('pending', 'leased', 'failed')
       AND json_extract(payload, '$.script') = ? ORDER BY rowid`,
      name,
    )
    .find((r) => JSON.stringify((JSON.parse(r.payload) as { input?: unknown }).input) === same);
  if (waiting) return { ok: true, job: waiting.id };
  return { ok: true, job: enqueue(deps.sql, deps.mint, deps.nowMs, 'script.run', { script: name, version: found.version, input }) };
}

/**
 * Put an ask's question where it will be answered: the suggestion queue for a person, the outbox for Slash. What it
 * hands back is the id the step row holds while it waits, and how long it waits.
 *
 * THE QUESTION IS FILLED FROM THE RUN AND THE ROW, as a `notify` is: `{{vars.…}}` and `{{trigger.…}}`, and the row's
 * own `{{what}}`, in one pass. The options are not filled, because they are the answers an `if` after the step
 * compares against, and an answer that changed with the row would never match the condition written for it.
 */
function ask(
  deps: FlowDeps,
  rule: string,
  verb: 'ask_person' | 'ask_slash',
  step: Record<string, unknown>,
  n: number,
  run: string,
  scope: Record<string, unknown>,
  kept: Kept,
  unsent: ReadonlySet<string>,
  tainted: ReadonlySet<string>,
  row: Entry | null,
  actor: string,
): { ok: true; holds: string; waitMs: number } | { ok: false; say: string } {
  const spec = step[verb] as { question: string; options?: string[]; wait?: string; about?: string[]; shape?: string; choices?: string[] };
  /* A QUESTION TO SLASH IS FILLED FROM THE ROW WITH ITS SECRET AND FILE FIELDS TAKEN OUT, both fills, since the
     question leaves the record as surely as `about:` does. The lint refuses a question that names one, and this is the
     second line, for a rule an earlier build let install or one written into the table. Measured with the switch on
     and this line off (`flow-waits.test.ts`, "A RULE STORED WITH A SECRET"): the question went out as `Rate for Rent,
     hunter2, hunter2, hunter2, {"what":"Rent","note":"hunter2","pin":"hunter2"}, hunter2?`. The last is a text field
     holding the words `{{pin}}`, which the run's fill writes into the question and the row's fill then reads, so the
     field is taken out of both fills and not only the first. Every field a step of this run wrote from such a field
     is taken out with it (`-unsent`). */
  /* A QUESTION TO A PERSON IS FILLED WITH EVERY SECRET AND FILE FIELD TAKEN OUT TOO, and every variable set from one
     read as the dash. It goes into the record's one queue, which everyone who decides reads, and the same queue took a
     `suggest`'s question with the field refused. Measured at HEAD `afb3b1b2` with the rule written into the table:
     `x {{pin}}` and `x {{trigger.row.pin}}` were asked as `x hunter2`, `x {{vars.p}}` with `p` set from `pin` as
     `x k hunter2`, and `x {{trigger.row}}` with `"pin":"hunter2"` in it. The lint refuses that question at install
     now; this is the second line. Only fields declared secret or file are taken out here, so a list with none asks as
     it did. */
  const facts = row === null ? null : verb === 'ask_slash' ? sendable(deps, row, unsent) : withoutSealed(deps, row);
  /* AND EACH VARIABLE SET FROM A FIELD THAT NEVER LEAVES IS READ AS IT WAS KEPT (`advance`'s `set_var`), so a question
     to Slash gets the dash where `{{vars.p}}` held `pin`. */
  const vars = scope.vars as Vars;
  const cleanVars = verb === 'ask_slash' ? { ...vars, ...kept } : { ...vars, ...Object.fromEntries([...tainted].filter((n) => n in vars).map((n) => [n, '—'])) };
  const scoped = { vars: cleanVars, trigger: facts ? { ...(scope.trigger as Record<string, unknown>), row: facts.fields } : scope.trigger, metric: scope.metric };
  /* FILLED ONCE (`rules.ts`'s `filling`), the run's paths and the row's fields in one pass. It was the run's fill and
     then the row's over what it had made, so a text field holding the words `{{pin}}`, put in by
     `{{trigger.row.note}}`, was read a second time as a field of the row. Both fills read the cleaned row, so for
     Slash the second reached nothing the first could not and wrote the dash; for a person, at HEAD `afb3b1b2`, `is
     {{trigger.row.note}}` was asked as `is hunter2`. */
  const question = facts ? filling(spec.question, facts, deps.nowMs, { run: pathsOf(scoped) }).text : String(fill(spec.question, scoped));
  if (question.length > VAR_BYTES) return { ok: false, say: `rule.${rule}'s question at step ${n + 1} runs to ${question.length} characters, and a question holds ${VAR_BYTES}.` };

  if (verb === 'ask_person') {
    const waitMs = intervalMs(spec.wait ?? ASK_PERSON_WAIT);
    if (waitMs === null) return { ok: false, say: `rule.${rule} waits ${JSON.stringify(spec.wait)} for an answer at step ${n + 1}, and a span is a number and one of m, h, d or w.` };
    const opened = deps.ask(question, spec.options ?? [], actor, { run, step: n });
    if (!opened.ok) return { ok: false, say: `rule.${rule} could not ask its question at step ${n + 1}: ${fixOf(opened)}` };
    return { ok: true, holds: opened.value.id, waitMs };
  }

  /* `about` IS THE FIELDS OF THE RUN'S ROW THAT GO WITH THE QUESTION, and nothing else of the record does. A field typed
     secret or file is left out here whatever the lint let through, as `queueCall` leaves one out of what a call sends:
     the install check is one check and this is the second. A field a step of this run wrote from one is left out too. */
  const about: Record<string, unknown> = {};
  const types = row ? deps.schemaOf(row.register)?.fields : undefined;
  for (const field of spec.about ?? []) {
    if (sealedAs(types?.[field]) !== null || unsent.has(field)) continue;
    about[field] = row?.fields[field] ?? null;
  }
  /* `rule` IS WHO ASKS. The host's pass refuses a job without it and never calls Slash (`slash-answers.ts` `askOf`),
     because Slash's ledger row is written as `rule.<id> step <n>` and the owner's key is opened as `rule:<id>`: a job
     queued without it ended its run on "no text", measured through the real kernel (`loop/research-infer-ask-next.md`
     §1.3, B). */
  const job = enqueue(deps.sql, deps.mint, deps.nowMs, 'infer.ask', {
    run,
    rule,
    step: n,
    question,
    shape: spec.shape ?? 'text',
    ...(spec.choices === undefined ? {} : { choices: spec.choices }),
    ...(spec.about === undefined ? {} : { about }),
  });
  return { ok: true, holds: job, waitMs: ASK_SLASH_WAIT_MS };
}

/**
 * An answer to a step that asked: from `decide` for a person, from the outbox's `ack` for Slash. Called in the
 * transaction that carries the answer, so a decision that rolls back never moved the run.
 *
 * AN ANSWER TO A RUN THAT IS NOT WAITING ON THAT STEP CHANGES NOTHING. A run cancelled, switched off or timed out lets
 * go of its question when it ends, but a host may still be holding a Slash job it leased before then, and its ack is not
 * the host's fault; the job is done and the run stays as it ended.
 *
 * `by` IS THE SUGGESTION OR THE JOB THE ANSWER CAME THROUGH, AND IT HAS TO BE THE ONE THE STEP ROW HOLDS. The run and
 * the step ride on a suggestion's body, and the gate lets any proposer put any key there: before this check an agent's
 * own options suggestion carrying a waiting run's id and step, decided by a person who read it as the agent's question,
 * wrote its label into the run as the answer and woke it, and the run's real question stayed open with nothing behind
 * it. Closing such a suggestion unanswered failed the run the same way.
 *
 * THE ANSWER IS WRITTEN AND THE STEP IS PASSED HERE, AND THE NEXT STEP IS THE DRAIN'S. The run goes `pending` with its
 * wake row armed for now, as a trigger leaves one, so the steps after the answer are taken where every other step is,
 * and a decision on a screen never runs a rule's writes inside the person's own request.
 */
export function answerStep(deps: FlowDeps, a: { run: string; step: number; by: string; answer?: string; failed?: string }): Result<null> {
  const run = deps.sql.one<RunRow>('SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE id = ?', a.run);
  if (!run || run.state !== 'waiting' || run.step !== a.step) return ok(null);
  const row = deps.sql.one<{ kind: string; state: string; answer: string | null }>('SELECT kind, state, answer FROM automation_step WHERE run = ? AND n = ?', a.run, a.step);
  if (!row || row.state !== 'waiting' || row.answer !== a.by || (row.kind !== 'ask_person' && row.kind !== 'ask_slash')) return ok(null);

  const stop = (say: string): Result<null> => {
    finish(deps, run, 'failed', say);
    record(deps, run.id, a.step, row.kind, 'failed', null);
    return ok(null);
  };
  if (a.failed !== undefined || a.answer === undefined) return stop(a.failed ?? `rule.${run.rule}'s question at step ${a.step + 1} came back with no answer.`);

  const decl = pinned(deps.sql, run.rule, run.version);
  const spec = (decl ? plan(decl.steps ?? decl.then)[a.step]?.step[row.kind] : undefined) as { as?: string; shape?: string; choices?: string[] } | undefined;
  if (!spec || typeof spec.as !== 'string') return stop(`rule.${run.rule} version ${run.version} has no ask at step ${a.step + 1} to answer.`);

  /* SLASH'S TEXT IS HELD TO THE SHAPE THE STEP ASKED FOR. A person picks from the options, which `decide` has already
     held them to; a model writes whatever it writes, and a `number` that arrives as "about four" would reach an `if`
     that compares it as text and quietly takes the wrong arm. */
  const said = a.answer.trim();
  let value: string | number = said;
  if (row.kind === 'ask_slash' && spec.shape === 'number') {
    const n = Number(said.replace(/,/g, ''));
    if (said === '' || !Number.isFinite(n)) return stop(`Slash answered ${JSON.stringify(said.slice(0, 80))} at step ${a.step + 1} of rule.${run.rule}, which asked for a number.`);
    value = n;
  }
  if (row.kind === 'ask_slash' && spec.shape === 'choice') {
    const hit = (spec.choices ?? []).find((c) => c.toLowerCase() === said.toLowerCase());
    if (hit === undefined)
      return stop(`Slash answered ${JSON.stringify(said.slice(0, 80))} at step ${a.step + 1} of rule.${run.rule}, which asked it to choose one of ${(spec.choices ?? []).join(', ')}.`);
    value = hit;
  }
  if (String(value).length > VAR_BYTES) return stop(`The answer at step ${a.step + 1} of rule.${run.rule} runs to ${String(value).length} characters, and one answer holds ${VAR_BYTES}.`);
  /* AN ANSWER OVERWRITES WHAT WAS KEPT UNDER ITS NAME, since the variable now holds the answer and not the field it was
     set from, and a later question to Slash reading the kept dash would be asking about a value the run no longer has.
     A column with no `-sendable` is left with none, and `advance` rebuilds it with this answer's own step row in it. */
  const stored = unpack(run.vars);
  const vars = { ...stored.vars, [spec.as]: value };
  if (stored.kept) delete stored.kept[spec.as];
  const sealed = stored.sealed?.filter((name) => name !== spec.as) ?? null;
  if (JSON.stringify(vars).length > VARS_BYTES) return stop(`rule.${run.rule}'s answers passed ${VARS_BYTES} characters at step ${a.step + 1}.`);

  record(deps, run.id, a.step, row.kind, 'done', String(value));
  deps.sql.exec("UPDATE automation_run SET state = 'pending', step = ?, vars = ? WHERE id = ?", a.step + 1, pack(vars, stored.kept, stored.unsent, sealed), run.id);
  wake(deps, run.id, deps.nowMs);
  return ok(null);
}

/**
 * Let go of what a run's waiting ask still holds, as the run ends: the question comes out of the queue, and a Slash
 * job nobody has leased yet comes out of the outbox.
 *
 * WITHOUT THIS A CANCELLED RUN LEFT ITS QUESTION OPEN, and the person who answered it a day later was answering nothing:
 * `answerStep` reads the run as over and the pick goes nowhere. A job a host already holds is left to its ack, for the
 * reason `answerStep` gives, and the ack finishes it: `outbox.ts`'s failed branch reads this run and its step row, and a
 * job whose run is no longer waiting on it is marked `done` with no `retry`, so a question out when its rule stopped is
 * asked once and not eight times (audit forty-nine section 1). The step row is left `waiting` here, so the ack reads the
 * run's own state as well. The Slash job is deleted rather than marked `done`, because nothing was delivered, and its
 * `retry` row goes with it.
 */
function release(deps: FlowDeps, run: RunRow, say: string | null): void {
  const held = deps.sql.all<{ kind: string; answer: string | null }>(
    "SELECT kind, answer FROM automation_step WHERE run = ? AND state = 'waiting' AND kind IN ('ask_person', 'ask_slash')",
    run.id,
  );
  for (const h of held) {
    if (h.answer === null) continue;
    if (h.kind === 'ask_person') deps.withdraw(h.answer, `rule:${run.rule}`, say ?? `rule.${run.rule}'s run ended before this was answered.`);
    else {
      deps.sql.exec("DELETE FROM outbox WHERE id = ? AND kind = 'infer.ask' AND state IN ('pending', 'failed')", h.answer);
      deps.sql.exec("DELETE FROM schedule WHERE kind = 'retry' AND key = ?", `outbox:${h.answer}`);
    }
  }
}

function record(deps: FlowDeps, run: string, n: number, kind: string, state: 'done' | 'waiting' | 'failed' | 'skipped', answer: string | null): void {
  deps.sql.exec(
    `INSERT INTO automation_step (run, n, kind, state, answer, ms, at) VALUES (?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT (run, n) DO UPDATE SET state = excluded.state, answer = excluded.answer, at = excluded.at`,
    run,
    n,
    kind,
    state,
    answer === null ? null : answer.slice(0, VARS_BYTES),
    instant(deps.nowMs),
  );
}

/**
 * The run is over: its row says how, and one metered `pull` event says it for the ledger.
 *
 * `meter` IS `actions.ts`'s, UNCHANGED, so a failed or cancelled run is free by the same rule a failed scheduled action
 * is. It writes a scheduled action's actor and target, `ingest:<id>` and `declaration:ingest.<id>`, and those two
 * columns are put right in the same transaction; the usage it counts is the part that has to agree.
 */
function finish(deps: FlowDeps, run: RunRow, state: 'done' | 'failed' | 'cancelled', say: string | null, vars?: Vars): Metered {
  release(deps, run, say);
  deps.sql.exec(
    'UPDATE automation_run SET state = ?, step = ?, vars = coalesce(?, vars), finished_at = ?, say = ? WHERE id = ?',
    state,
    run.step,
    vars === undefined ? null : JSON.stringify(vars),
    instant(deps.nowMs),
    say,
    run.id,
  );
  const metered = meter(
    deps,
    {
      ingest: `rule:${run.rule}`,
      channel: 'flow',
      host: null,
      project: run.project ?? undefined,
      status: null,
      outcome: state === 'done' ? 'ok' : state === 'failed' ? 'failed' : 'dropped',
      requests: 0,
      bytes: 0,
      ms: 0,
      failures: state === 'failed' ? 1 : 0,
    },
    say ?? `rule.${run.rule} ran.`,
  );
  deps.sql.exec('UPDATE event SET actor = ?, target = ? WHERE id = ?', `rule:${run.rule}`, `declaration:rule.${run.rule}`, metered.event);
  return metered;
}

/** Stop a run that has not finished. Its wake row goes with it, so a run cancelled mid-wait never resumes. */
export function cancelRun(deps: FlowDeps, id: string, actor: string): Result<{ run: string; state: 'cancelled' }> {
  const run = deps.sql.one<RunRow>('SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE id = ?', id);
  if (!run) return no('OUT_OF_BOUNDS', `There is no run ${id}.`, { at: 'run' });
  if (run.state !== 'pending' && run.state !== 'running' && run.state !== 'waiting')
    return no('TRANSITION_ILLEGAL', `Run ${id} of rule.${run.rule} is already ${run.state}.`, { at: 'run' });
  deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ? AND state = 'pending'", runKey(id));
  finish(deps, run, 'cancelled', `Cancelled by ${actor}.`);
  return ok({ run: id, state: 'cancelled' });
}

/** A hundred finished runs older than ninety days, and their steps, at a time. The hourly sweep takes the next hundred. */
export function pruneRuns(sql: Sql, nowMs: number): number {
  const old = sql.all<{ id: string }>('SELECT id FROM automation_run WHERE finished_at IS NOT NULL AND finished_at < ? LIMIT 100', instant(nowMs - KEEP_RUNS_MS));
  for (const { id } of old) {
    sql.exec('DELETE FROM automation_step WHERE run = ?', id);
    sql.exec('DELETE FROM automation_run WHERE id = ?', id);
  }
  return old.length;
}

/* ── reading the run's context ──────────────────────────────────────── */

/**
 * The row a delete started the run about, read from `entry` as it stands, or `null` once it is gone for good.
 *
 * AS IT STANDS, NOT AS IT WAS COPIED. An erasure tombstones the fields of a deleted row in place, so a run that reads
 * it afterwards reads the tombstone, which is what every other reader of that row sees.
 */
function deletedRow(sql: Sql, id: string): Entry | null {
  const r = sql.one<{ id: string; register: string; seq: number | null; fields: string; state: string | null; version: number; created_at: string; updated_at: string; deleted_at: string | null }>(
    'SELECT id, register, seq, fields, state, version, created_at, updated_at, deleted_at FROM entry WHERE id = ? AND deleted_at IS NOT NULL',
    id,
  );
  return r ? { ...r, fields: JSON.parse(r.fields) as Entry['fields'] } : null;
}

/** `{{trigger.…}}`: what started the run, the row's fields, and an arrival's JSON body where it has one. */
function context(deps: FlowDeps, trigger: RunTrigger, subject: Entry | null): Record<string, unknown> {
  const { chain: _chain, ...said } = trigger;
  const out: Record<string, unknown> = { ...said };
  if (subject) out.row = subject.fields;
  if (trigger.arrival) {
    const raw = deps.sql.one<{ body: string | null }>('SELECT body FROM inbox_raw WHERE id = ?', trigger.arrival);
    let body: unknown = raw?.body ?? null;
    try {
      body = typeof body === 'string' ? JSON.parse(body) : body;
    } catch {
      /* Text stays text. A mail or an SMS is read by its words, and only JSON has paths. */
    }
    out.body = body;
  }
  return out;
}

/**
 * The row as a question to Slash may carry it: every field the live list types `secret` or `file` taken out, a list of
 * either with it (`sealedAs`), and every field the live list does not declare, since a value with no live type has
 * none to ask whether it may leave. `unsent` is the fields a step of the run wrote from one of those (`-unsent`), which
 * go the same way.
 */
function sendable(deps: FlowDeps, row: Entry, unsent: ReadonlySet<string> = new Set()): Entry {
  const types = deps.schemaOf(row.register)?.fields ?? {};
  const fields = Object.fromEntries(Object.entries(row.fields).filter(([id]) => types[id] !== undefined && sealedAs(types[id]) === null && !unsent.has(id)));
  return { ...row, fields: fields as Entry['fields'] };
}

/**
 * The row with every field its declaration types secret or file taken out, retired ones included (`sealedOf`), and
 * nothing else: what a question to a person reads, since it stays in the record and a field with no live type is one
 * the list's readers already see.
 */
function withoutSealed(deps: FlowDeps, row: Entry): Entry {
  const sealed = sealedOf(deps.sql, row.register);
  return { ...row, fields: Object.fromEntries(Object.entries(row.fields).filter(([id]) => !sealed.has(id))) as Entry['fields'] };
}

/**
 * The run's paths and a figure's `{{metric.<id>}}` (`figure.ts`), in one pattern, so that a figure is filled in the
 * same `replace` as the paths beside it and nothing one wrote is read again as the other. Groups 1 and 2 are a path's
 * head and path, 3 and 4 a figure's head and id.
 */
const RUN_READ = new RegExp(`${RUN_PATH.source}|${FIGURE.source}`, 'g');

/**
 * What a run reads a figure through: `rules.ts`'s `figureText`, asked each time a step is filled.
 *
 * READ AT THE STEP AND NEVER KEPT, because a `set` or a `create` earlier in the same run may change the rows the figure
 * adds up, and a run parked on a wait for a week wakes to the figure as it is then. `step-reads-figure.test.ts` holds the
 * plainest form of it: a second row of 3 beside a first of 12, and the second run's step writes 15. A figure put into a
 * variable is kept, as the words it was when the variable was set.
 */
const figures = (deps: FlowDeps, lands: () => ReadonlySet<string>) => {
  /* ONE ANSWER PER FIGURE PER RUN TURN, since whether it is withheld depends on the figure's declaration and the run's
     steps and not on the rows, and a step that fills the same figure three times would otherwise read the declaration
     three times. The value is still read each time, for the reason above. */
  const hidden = new Map<string, boolean>();
  return (id: string): string => {
    if (!hidden.has(id)) hidden.set(id, hiddenFigure(deps.sql, id, lands()));
    return hidden.get(id) ? WITHHELD : figureText(deps.rules(), id);
  };
};

/**
 * The lists a run's fills may land in: its own row's list, and every list one of its `create` steps writes into.
 *
 * EVERY STEP OF THE RUN, NOT THE ONE BEING FILLED, because a figure kept by a `set_var` is written into the row by a
 * later step, and a question answered by a person or by Slash comes back as a variable the same way. So a figure is
 * withheld wherever this run fills it, a `notify` included, unless every one of these lists is the list it adds up:
 * with the row, a `notify` is also a note on the row's history, which its readers see. A run with no row and nothing to
 * create writes nowhere anybody but the owner reads, and reads every figure.
 */
const landsOf = (program: readonly Op[], row: Entry | null): Set<string> => {
  const out = new Set<string>(row ? [row.register] : []);
  for (const op of program) {
    const made = op.verb === 'create' && isObject(op.step.create) ? op.step.create.register : undefined;
    if (typeof made === 'string') out.add(made);
  }
  return out;
};

/**
 * Whether one of `lands` is a list other than the one figure `id` adds up, so that the figure is withheld (audit
 * sixty-two, finding 4, and audit sixty-four, finding 1).
 *
 * MEASURED BEFORE THIS (`figure-privacy.test.ts`, the audit's probe F1): an owner's rule on each new Inbox row set its
 * note to `filed; payroll {{metric.payroll}}`, over a figure summing Salaries. A member invited to Inbox alone is
 * refused `payroll` by the record as a figure that does not exist, and her own Inbox read `filed; payroll GBP 5200.00`.
 * The figure was read with the run's context and nobody was asked who would read where it landed.
 *
 * THE SAME QUESTION THE RECORD ASKS HER, ONE FIGURE WIDE. Its `metric` refuses a figure over a list she does not read
 * (`packages/record/src/index.ts`, "the same leak one number wide"), and reads nothing else of it, so this asks of the
 * figure's `source` alone. A figure over no list, a `series.`, is read by whoever reads a page, and is not hidden.
 *
 * NOT WHO IS A MEMBER AT THE RUN, WHICH WAS THE FIRST REPAIR, BECAUSE THE ROW OUTLIVES THE RUN (audit sixty-four,
 * finding 1). The first form asked the `member` rows when the figure was filled, and that held for every note written
 * after an invitation and for none written before it: V1 (`figure-privacy-before.test.ts`) filed one Inbox row, invited
 * Bea to Inbox alone, and she read `filed; payroll GBP 5200.00` in it. A script whose `reads:` names Inbox and not
 * Salaries was never asked either, and it may send what it reads out through its `egress:`.
 *
 * SO THE FIGURE IS WRITTEN ONLY WHERE IT ADDS UP THE LIST IT LANDS IN. That is the one rule that holds for a reader who
 * does not exist yet: whoever reads a row of Salaries, today or after next month's invitation, a person or a script,
 * reads Salaries, and so reads anything a figure over Salaries could tell them. A figure over any other list is
 * `WITHHELD` wherever a run with a row fills it, the owner alone on the record included, since nothing the record holds
 * says that a list no member reads today is one nobody will be invited to.
 *
 * WHY NOT ASK AT EACH INVITATION INSTEAD. The other rule that holds for later readers is to refuse the invitation, or
 * the script, that would read Inbox without Salaries while a rule writes Payroll into Inbox. It keeps the owner's
 * cross-list note, but it has to be kept at every door a reader comes in by (an invitation, a level changed, a script
 * installed, an agent's grant), and it still says nothing about the rows a rule removed since wrote. This is one check,
 * in the one place a figure is written.
 *
 * THE RUN IS THE SECOND LINE, NOT THE FIRST. Install refuses a rule whose own words land a figure over another list
 * (`figureFault` in `figure.ts`), so the owner is told there. What reaches this is what the rule's words do not show:
 * the row an arrival wrote, which is the ingest's list, and a figure re-pointed at another list after the rule went in,
 * which `figure-privacy.test.ts` installs to reach this line at all.
 */
function hiddenFigure(sql: Sql, id: string, lands: ReadonlySet<string>): boolean {
  if (lands.size === 0) return false;
  const found = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${id}`);
  const source = found ? (JSON.parse(found.body) as { source?: unknown }).source : undefined;
  if (typeof source !== 'string' || !source.startsWith('register.')) return false;
  const over = source.slice('register.'.length);
  return [...lands].some((list) => list !== over);
}

/**
 * `{{vars.x}}`, `{{trigger.row.amount}}` and `{{metric.total}}`, filled in a string that no fill of the row reads after: a condition, a
 * `set_var`, and a question with no row. A text the pass fills is filled in the same `replace` as the row's own
 * `{{field}}`s instead (`handOn`, `rules.ts`'s `filling`). A path that reaches nothing is an em dash for the same
 * reason `fill` writes one: a sentence with a hole in it reads as a bug. The pattern is `flow-lint.ts`'s `RUN_PATH` with
 * `figure.ts`'s `FIGURE` beside it, so the lint reads a question's braces as this fills them.
 */
function fill(x: unknown, scope: Record<string, unknown>): unknown {
  if (typeof x === 'string') return x.replace(RUN_READ, (_whole, head?: string, path?: string, figHead?: string, id?: string) => pathValue(scope, head ?? figHead!, path ?? id!));
  if (Array.isArray(x)) return x.map((v) => fill(v, scope));
  if (isObject(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fill(v, scope)]));
  return x;
}

/**
 * What one `{{vars.…}}`, `{{trigger.…}}` or `{{metric.…}}` path is written as. A figure's id is one word with hyphens in
 * it and no dots, so it is handed to the scope's reader whole rather than walked; a scope with no reader writes the dash.
 */
function pathValue(scope: Record<string, unknown>, head: string, path: string): string {
  if (head === 'metric') return typeof scope.metric === 'function' ? (scope.metric as (id: string) => string)(path) : '—';
  let at: unknown = scope[head];
  for (const part of path.split('.')) at = isObject(at) ? at[part] : Array.isArray(at) ? at[Number(part)] : undefined;
  if (at === undefined || at === null || at === '') return '—';
  return typeof at === 'object' ? JSON.stringify(at) : String(at);
}

/** The run's paths as the pass is handed them, from `scope`, saying of none that it reaches a secret. */
const pathsOf = (scope: Record<string, unknown>): RunFill => ({ value: (head, path) => pathValue(scope, head, path), sealed: () => false });

/**
 * The run's paths as a step that writes is handed them, saying which reach a value a secret or file field gave: a
 * variable in `tainted` that holds something, `{{trigger.row.pin}}` where `pin` never leaves and holds something, and
 * `{{trigger.row}}` where any such field of the row holds something.
 *
 * BY WHERE THE PATH GOES, NEVER BY WHAT IT HOLDS, and by the declared types alone. The held attempt of wave fifty-three
 * compared the step filled from the row with the step filled from `sendable`'s row, which also drops every field the
 * live list does not declare. Measured on 23 September with that diff applied to `afb3b1b2`: on Jobs, a list declaring
 * no secret field, a `note` of `x {{trigger.row.what}} {{vars.v}}` failed "would copy what old holds", because `v` was
 * set from `{{trigger.row}}` and the row carried a value under `old`, a field the list no longer declares. Such a value
 * has no type saying it may not leave, so a question to Slash goes without it, and a note the list's own readers see
 * may carry it. Comparing words would be no better: a `note` that happens to say what `pin` says is not a copy.
 */
function sealedPaths(scope: Record<string, unknown>, row: Entry | null, fields: ReadonlySet<string>, tainted: ReadonlySet<string>): RunFill {
  const vars = scope.vars as Vars;
  return {
    value: (head, path) => pathValue(scope, head, path),
    sealed: (head, path) => {
      const [first, second] = path.split('.');
      if (head === 'vars') return tainted.has(first!) && present(vars[first!]);
      if (head !== 'trigger' || first !== 'row' || row === null) return false;
      if (second === undefined) return [...fields].some((f) => present(row.fields[f]));
      return fields.has(second) && present(row.fields[second]);
    },
  };
}

/**
 * The step as `act` hands it on: every string filled from the run, except the texts the pass fills itself when there
 * is a row for it to fill them from (`passFilled`), which go on as typed with the run's paths beside them, so each is
 * filled once. `secret` is the first spelling in a string filled here that reached a secret, or `null`.
 */
function handOn(step: Record<string, unknown>, by: RunFill, passes: boolean): { action: Record<string, unknown>; secret: string | null } {
  let secret: string | null = null;
  const walk = (v: unknown, at: string[]): unknown => {
    if (typeof v === 'string') {
      if (passes && passFilled(at)) return v;
      return v.replace(RUN_READ, (whole: string, runHead?: string, runPath?: string, figHead?: string, id?: string) => {
        const [head, p] = runHead !== undefined ? [runHead, runPath!] : [figHead!, id!];
        if (by.sealed(head, p)) secret ??= whole;
        return by.value(head, p);
      });
    }
    if (Array.isArray(v)) return v.map((one, i) => walk(one, [...at, String(i)]));
    if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, one]) => [k, walk(one, [...at, k])]));
    return v;
  };
  const action = walk(step, []) as Record<string, unknown>;
  return { action, secret };
}

/** The first run path in `text` that reaches a secret, or `null`: what a `set_var` taking it would carry. */
function sealedIn(text: string, by: RunFill): string | null {
  for (const m of text.matchAll(RUN_READ)) if (by.sealed(m[1] ?? m[3]!, m[2] ?? m[4]!)) return m[0];
  return null;
}

/**
 * An `if`, read over the run's row and its answers together.
 *
 * ONE SCHEMA FOR BOTH, so `amount is more than 100` and `who is gold` are the same sentence builder a list uses. An
 * answer is typed by what it holds: a number is a decimal, `true` and `false` are a bool, anything else is text. A
 * field of the row wins over an answer of the same name, because the row is what the condition was written against.
 */
function test(deps: FlowDeps, cond: Predicate | string, subject: Entry | null, vars: Vars): { yes: boolean; bad?: string } {
  const fields: Schema['fields'] = {};
  for (const [name, value] of Object.entries(vars))
    fields[name] = { type: typeof value === 'number' ? 'decimal' : typeof value === 'boolean' ? 'bool' : 'text' } as Schema['fields'][string];
  const own = subject ? deps.schemaOf(subject.register) : null;
  const schema: Schema = { ...(own ?? { register: 'vars' }), fields: { ...fields, ...(own?.fields ?? {}) } };
  const said = predicateOf(cond, schema, deps.rules().ctx);
  if (said.bad.length) return { yes: false, bad: said.bad[0]!.fix };
  const values = { ...vars, ...(subject?.fields ?? {}) };
  return { yes: evaluate(said.predicate, values, schema, (subject ?? {}) as Readonly<Record<string, unknown>>) };
}

/** A `when:` on a write trigger, read the way the inline pass reads one: compiled, against the row as stored. */
function holds(deps: FlowDeps, when: string | Predicate, entry: Entry): boolean {
  const schema = deps.schemaOf(entry.register);
  if (!schema) return false;
  const ctx: EvalContext = deps.rules().ctx;
  const said = predicateOf(when, schema, ctx);
  if (said.bad.length) return false;
  const w = compile(said.predicate, schema);
  if (w.bad.length) return false;
  return Boolean(deps.sql.one(`SELECT 1 AS x FROM entry WHERE id = ? AND (${w.sql})`, entry.id, ...w.params));
}

