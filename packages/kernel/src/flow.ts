/**
 * The runner of an automation: start a run, take its steps, park it on a wait, resume it, cancel it, prune it.
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
 * with the rule's own name as the actor. Two things are changed for a step, and both are said where they are done. On a
 * run with no row, `notify`, `suggest` and `create` go past it: the first two straight to the note and the queue, and a
 * `create` to the same `expand` by way of `createAlone`.
 *
 * A STEP THAT ASKS HANDS OFF AND PARKS, AND THE ANSWER IS WHAT WAKES IT. `ask_person` opens a suggestion whose body
 * names the run and the step and what the question asks for (`shape`: a choice of `options`, an amount, a number, a
 * text or a date, held to it when the answer comes back), and the kernel's `decide` hands the pick to `answerStep` in the
 * decision's own transaction; with `to:` the question is put to one member, whom `govern.ts`'s `decide` holds it to.
 * `ask_slash` queues one `infer.ask` outbox row, and the outbox's `ack` hands the model's text to `answerStep` in the
 * ack's transaction. A `call` queues its declared call as one `pull.fetch` row naming the run and the step
 * (`actions.ts`'s `queueCall`), and the ack of that job hands back the provider's answer, or the sentence it stopped on,
 * the same way. Each time the step row says `waiting` and holds what it is waiting on, the suggestion or the job, and
 * the run's schedule row is armed for the end of the wait: a wake that finds the step still `waiting` is the wait
 * running out, and fails the run with a sentence.
 *
 * A CALL'S ANSWER IS KEPT AS ITS JSON, so a later step reads into it: `{{vars.a.rate}}` is 48.5 when the call answered
 * `{"rate":48.5}` under `as: a`. It is held to `VAR_BYTES`, as every answer is, and an answer that is not JSON is kept as
 * its text.
 *
 * ASKING SLASH IS SERVED ONLY WHERE THE HOST SAYS SO (`FlowDeps.answersSlash`, the record's `answersSlash` option). A
 * host that leases no `infer.ask` job leaves the question `pending` for its day and the run fails having asked nobody,
 * so on such a host `advance` fails a run that reaches the step with `NOT_IN_THIS_BUILD` before anything is queued, and
 * install refuses the step (`unserved` in `index.ts`). A host that serves the job admits both, and its pass acks with
 * the answer as `result.text` or a refusal's sentence as `result.failed` (`outbox.ts`'s `ack`).
 *
 * A `script` STEP STARTS A SCRIPT AND DOES NOT WAIT FOR IT (`startScript`). It queues the same `script.run` row a clock
 * queues, for a script that says `runs: { rule: true }`, and the run goes on to its next step; what the script writes
 * lands through `finishScript` when a host has run it, and its answer does not come back into the run.
 *
 * A `meet` STEP MEETS ONE PERSON AS THE RULE, through `people.ts`'s `meet`, the one an agent's `meet` goes through, so a
 * person a rule met is matched, dated and offered for merging exactly as one an agent met (`FlowDeps.meet`). A `run_job`
 * STEP QUEUES ONE JOB OF A KIND THE OWNER APPROVED (`jobs.ts`'s `createJob`, `FlowDeps.job`) and parks the run until the
 * job ends, looking at the job's row every `RUN_JOB_LOOK_MS`, for a day at most; how it ended is the step's answer.
 *
 * WHETHER A STEP RUNS AT ALL IS ITS ROW IN `capabilities.ts`, which the lint and the grammar read too. A step whose row
 * installs and does not run fails the run that reaches it with the row's sentence, after the steps before it, and one
 * whose row does not serve this host (`ask_slash` where nothing answers Slash) the same way.
 *
 * A RUN CAN BE TRIED (`flow-try.ts`): the same steps, taken over a sample inside the kernel's `rehearse`, with the body
 * handed in as `FlowDeps.trial` in place of an installed version, and everything it wrote rolled back.
 *
 * EVERY TRIGGER STARTS A RUN, each where its fact is known: a write (`onWritten`), an arrival (`onArrival`), a clock's
 * turn (`onClock`), a button (`automationRun` in `index.ts`), a figure crossing a line (`onMetrics`, from the hourly
 * sweep), a decision in Decide (`onDecided`, inside the decision), and a relative day passing over a row (`onTime`,
 * from the same sweep).
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { fixOf, no, ok, refused } from '@braindog/ports';
import { compile, evaluate, type Predicate, type Schema } from '@braindog/where';

import { meter, RULE_CALLS_PER_DAY, type CallQueued, type Metered } from './actions.ts';
import { capability, serves } from './capabilities.ts';
import { calendarOf, nextCalendar } from './clock.ts';
import { dayIn } from './finished.ts';
import { liveTarget } from './declare.ts';
import { localParts, nextOccurrence } from './digest.ts';
import { exponentOf, moneyText, senderOf } from './ingest.ts';
import { RELATIVE_DAY, RUNS_PER_DAY_CEILING, asTyped, passFilled, pathOf, sealedAs, triggerOf } from './flow-lint.ts';
import type { Entry } from './index.ts';
import { instant } from './migrate.ts';
import { evaluateMetric, predicateOf, type EvalContext, type MetricDecl } from './metrics.ts';
import { FIGURE, WITHHELD } from './figure.ts';
import { enqueue } from './outbox.ts';
import type { RunBy } from './pages.ts';
import type { MeetArgs, Met } from './people.ts';
import { intervalMs } from './pull.ts';
import {
  createAlone,
  figureText,
  filling,
  marker,
  onceKey,
  present,
  raiseStat,
  runRules,
  runSaid,
  sealedOf,
  ASK_TEXT_CHARS,
  RUN_SPELL,
  type AskShape,
  type FlowDecl,
  type RuleAction,
  type RuleDecl,
  type RulesDeps,
  type RunFill,
  type RunSaid,
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
/**
 * How long a run waits on a call's answer before it stops: a day, the contract's bound.
 *
 * THE LADDER USUALLY ANSWERS FIRST. A call the provider refuses, or one the record holds, answers at once with its
 * sentence, and eight failed attempts end in about four hours with theirs (`outbox.ts`'s `deadLetter`). This is for a
 * host that leases no `pull.fetch` at all, which would otherwise park the run for the ninety days a run is kept.
 */
export const CALL_WAIT_MS = DAY_MS;
/**
 * How long a run waits on a job it started before it stops: a day, the contract's bound for `run_job`. The job itself
 * is not stopped with the run, since the owner approved its kind and started nothing that needs the run to finish it;
 * its own page says how it ends.
 */
export const RUN_JOB_WAIT_MS = DAY_MS;
/**
 * How often a run waiting on a job looks at the job's row, so at most `RUN_JOB_WAIT_MS / RUN_JOB_LOOK_MS` looks a run:
 * 288.
 *
 * A LOOK AND NOT AN ANSWER HANDED BACK, as a call's ack hands one back, because a job ends in many places (its runner's
 * last event, a stop while it waits, the sweep that lets go of a job nobody ran), all in `jobs.ts`, which knows nothing
 * of runs. One look at one row by its key, on the run's own schedule row, finds the end wherever it was written. Five
 * minutes is short beside a job that runs Claude Code for several turns, and a run's next step waits no longer than that.
 */
export const RUN_JOB_LOOK_MS = 5 * 60_000;
/**
 * How a job's end reads to the steps after it (`JOB_ENDS` in `jobs.ts`): the three words the contract names. Every
 * other end (refused, limit, interrupted, cancelled) is `error` to a condition, and the step's own row keeps which it
 * was.
 */
const JOB_ANSWERS: Readonly<Record<string, string>> = { ok: 'ok', needs_decision: 'needs_decision' };
/** A job still going, whose run keeps waiting on it. */
const JOB_GOING: readonly string[] = ['queued', 'claimed'];
/**
 * The text keys of a `meet` step, which are `people.ts`'s `MeetArgs`. `keys` is the one list beside them. `only` is
 * `known` or absent (`flow-lint.ts` refuses any other), and says nobody new is made from this rule's trigger.
 */
const MEET_KEYS = ['name', 'email', 'handle', 'where', 'kind', 'org', 'domain', 'role', 'source', 'only'] as const;

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
   * suggestion's body, which is how `decide` finds the run it answers. `to` is the one member the question is put to,
   * where the step names one; `decide` holds the answer to them or an owner.
   */
  ask: (question: string, options: readonly string[], actor: string, about: AskAbout) => Result<{ id: string }>;
  /**
   * Queue a `call` step's declared call, naming the run and the step so its answer comes back to them
   * (`actions.ts`'s `queueCall`, with the record's action dependencies). `entry` is the run's row, whose `sends:` fields
   * go, or `null` where the run has none.
   *
   * OPTIONAL, because the record's action dependencies are the kernel's to hand, and a runner built without them fails
   * the step with a sentence rather than parking a run on a call nobody queued.
   */
  call?: ((ingest: string, a: { rule: string; entry: Entry | null; run: string; step: number }) => CallQueued) | undefined;
  /**
   * The run that made a row, read from the row's own `create` line and that run's row (`RunBy` in `pages.ts`), or
   * `null` where a person, a rule, an import or the record made it. What a script a rule starts is handed as `made_by`.
   * OPTIONAL: a runner built without it hands no `made_by`, and a script then reads a row as made by nobody it knows.
   */
  madeBy?: ((row: Entry) => RunBy | null) | undefined;
  /**
   * Meet one person as the rule: `people.ts`'s `meet` over the list that plays `meets:`, writing as `actor` (`rule:<id>`)
   * and linking the person to the run's `project`, so the match, the dated line saying where they were met and the
   * merge offer are the ones an agent's `meet` gives.
   *
   * OPTIONAL, as `call` is: the list, the write path and the gate are the kernel's to hand, and a runner built without
   * them fails the step with a sentence rather than meeting nobody and saying it met someone.
   */
  meet?: ((args: MeetArgs, a: { actor: string; project: string | null }) => Result<Met>) | undefined;
  /**
   * Queue one job of an approved kind: `jobs.ts`'s `createJob`, which refuses a kind the owner has not approved, holds
   * `args` to the kind's own, and keeps its ceilings (`JOBS_WAITING_MOST` waiting, `JOBS_A_DAY` a day). `about` is the
   * run's row as a person says it, or `null`.
   *
   * OPTIONAL, for `call`'s reason: the queue's dependencies are the kernel's to hand.
   */
  job?: ((a: { kind: string; args: Record<string, string>; about: string | null }) => Result<{ id: string }>) | undefined;
  /**
   * A body being tried rather than a version installed (`flow-try.ts`): the run takes its steps from this, and is never
   * stopped for a rule that is not live, since a body being tried is one nobody has installed yet.
   */
  trial?: FlowDecl | undefined;
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
  /**
   * The hold the host's ledger put on this record's automations at its monthly allowance (`holdRuns` in `index.ts`), or
   * absent. A run that has not started waits under it (`advance`).
   */
  held?: { until: number; say: string } | null | undefined;
  /**
   * WHO A RUN ACTS FOR, BY ITS RULE: `null` where it runs as the record does, its maker an owner
   * or nobody; `stop` with the sentence a run ends on once its maker can no longer reach the record; else the
   * dependencies of its maker's lens (`deps`, with `bounded` set), and the sentence a run is skipped with when the row
   * it started for is not one that lens shows (`unseen`). Absent, every run runs as the record does.
   */
  boundTo?: ((rule: string) => { stop: string } | { deps: FlowDeps; unseen: string } | null) | undefined;
  /**
   * Set on the dependencies of a run its maker's lens bounds: the sentence a step that reaches outside the rows they may
   * read and change is refused in (`OUTWARD`). Every figure such a run fills is withheld, since it adds up a whole list.
   */
  bounded?: string | undefined;
};

/**
 * The steps that reach outside the rows a run's maker may read and change: a call out, a script or a job (each reads
 * through its own approved reach), a question to Slash (which reads the row whole), and a meet (which writes People).
 * A run bound to a colleague's lens takes none of them (`FlowDeps.bounded`).
 */
export const OUTWARD: ReadonlySet<string> = new Set(['call', 'script', 'run_job', 'ask_slash', 'meet']);

/** A run-path rule as installed: its bare id, the version a run pins, and its body. */
export type Installed = { id: string; version: number; body: FlowDecl };

/**
 * What a run's question carries beside its words and its options, onto the suggestion's body: the run and the step it
 * answers, the one member it is put to, and what it asks for. `shape` is always said, `choice` included, so Decide
 * draws the input the step asked for without reading the rule. `currency` is an `amount`'s code, read
 * from the step or its row when the question was asked; an amount with none asks the person to say their code.
 */
export type AskAbout = { run: string; step: number; to?: string; shape?: AskShape; currency?: string };

/**
 * What a person answers a run's question with: the words of a choice or of what they typed, a number, or an amount in
 * minor units (`{ amount, currency }`) when the screen read it as one. Held to the step's shape by `answerStep`.
 */
export type AskAnswer = string | number | { amount: number; currency?: string };

/** What started a run, as the run row keeps it and `{{trigger.…}}` reads it. */
export type RunTrigger = {
  kind: 'written' | 'arrival' | 'every' | 'manual' | 'metric' | 'decided';
  /** A `metric` trigger's figure, the value read, and the side of the line it was read on (`onMetrics`). */
  id?: string;
  value?: number;
  side?: Side;
  /**
   * A `decided` trigger's question, the words of the answer chosen, and the declaration that filed or proposes it, or
   * `null` where none did (`onDecided`). The row the question names is the run's row, as `entry` and `register`.
   */
  suggestion?: string;
  option?: string;
  about?: string | null;
  /**
   * The instant of the run's turn: when a clock's turn was due, and when anything else started the run. `startRun`
   * stamps it, and `{{trigger.day}}` is its date in the record's zone (`context`). A run started before the stamp has
   * none, and both spellings are the dash there.
   */
  at?: string;
  entry?: string;
  register?: string;
  op?: string;
  /** The fields a write moved, comma separated, read as `{{trigger.changed}}`. Absent on a delete and on a write that moved none. */
  changed?: string;
  arrival?: string;
  channel?: string;
  ingest?: string | null;
  /**
   * The payee a bank door's pattern read, by the name a person reads (`payeeName`), kept whatever became of the row (`Arrived.counterparty`),
   * so `{{trigger.counterparty}}` meets the organisation by its `bank:` key on a list with no field for it.
   */
  counterparty?: string;
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
 * Where a write a rule-started script makes sits in the chain that started the script.
 *
 * MEASURED BEFORE THIS (`script-chain.test.ts`): `onWritten` stops a rule's own write unless the trigger says
 * `from_rules`, and stops a chain past `CHAIN_CEILING`, but it knows a rule's write by the actor, and a script writes
 * as `script:<id>@v<n>`. So a rule whose script wrote the row that fired it started itself again on every run, at depth
 * 0: one update ran the script twelve times in twelve rounds and was still going, each run a sandbox and each a row
 * version. The only stop was `runs_per_day`.
 *
 * `depth` is the depth of the run whose script step queued the job, and a write under the chain is one deeper. `seen`
 * is each run on the chain as `<rule>@<row>`, the run that queued the job last: a rule never starts again on a row it
 * has already run for in the same chain. That is what ends such a rule at its first run, and two rows that each write
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
 * READ BY `automation_step_answer`, the index migration 17 made, so it finds the steps by the job's id. Before it this
 * read every script step the record keeps, once per finished script run: measured, 8.7 ms a finished script at 90,000
 * runs.
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

/**
 * A run's answers by name. Most are text, a number or a flag; a call's answer is the JSON it came back as, so a path
 * reads into it (`reached`).
 */
type Vars = Record<string, unknown>;

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
 * question, and what it holds has to be in its row. Measured with the lint's check off: a `set` of `note` from
 * `{{pin}}` then `{{note}}`, `{{trigger.row.note}}` and `about: [note]` each queueing `hunter2` for Slash. Written
 * whenever `-sendable` is, empty when nothing is held, so a column with `-sendable` and without this is one a build
 * before it parked, and `advance` rebuilds it.
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
 * What the question a run waits on was asked in: an `amount`'s currency, read from the step or its row when it was
 * asked (`ask`), so the answer is kept in the currency the person was shown and not in what the row says a week later.
 *
 * BESIDE THE OTHER THREE, UNDER A KEY NO VARIABLE CAN HAVE, for their reason: the run parks on the question, and what it
 * holds has to be in its row. Written only while the run waits on an `amount`, and gone with the answer, since
 * `answerStep` packs the column again without it.
 */
const ASKED = '-asked';
type Asked = { currency?: string };

/** A packed column with what the question was asked in beside it (`-asked`). */
const withAsked = (packed: string, asked: Asked): string => JSON.stringify({ ...(JSON.parse(packed) as Vars), [ASKED]: asked });

/**
 * A run's stored `vars`, split into the variables, what a question to Slash reads in their place, the fields it reads
 * as absent, and the variables set from a secret. `kept` is `null` when the column has no `-sendable`, which is a run a
 * build before the key parked, or one no step has saved yet, and `unsent` and `sealed` are `null` when the column has
 * no key of theirs, for the same two reasons.
 */
function unpack(stored: string): { vars: Vars; kept: Kept | null; unsent: string[] | null; sealed: string[] | null; asked: Asked | null } {
  const all = JSON.parse(stored) as Vars & { [KEPT]?: Kept; [UNSENT]?: string[]; [SEALED]?: string[]; [ASKED]?: Asked };
  const kept = all[KEPT] ?? null;
  const unsent = Array.isArray(all[UNSENT]) ? all[UNSENT] : null;
  const sealed = Array.isArray(all[SEALED]) ? all[SEALED] : null;
  delete all[KEPT];
  delete all[UNSENT];
  const asked = isObject(all[ASKED]) ? (all[ASKED] as Asked) : null;
  delete all[SEALED];
  delete all[ASKED];
  return { vars: all as Vars, kept, unsent, sealed, asked };
}

/**
 * What a run would have kept, taken again from the steps it has done: each `set_var` filled a second time as `advance`
 * fills it, in the order the run took them, over variables replayed from the same rows, and each answer taking off
 * what was kept under its name as `answerStep` does.
 *
 * FOR A RUN A BUILD BEFORE `-sendable` PARKED. That build wrote `vars` alone, so a run it parked on a wait or an ask
 * between the `set_var` and the question woke under this build with nothing kept, and its question to Slash was filled
 * from `vars`: measured, `Given hunter2, plain, r hunter2?`. This build writes the key on every save, empty when
 * nothing is kept (`pack`), so a column with none is that build's or a run not yet saved, which has no step rows and
 * rebuilds to nothing.
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
      const step = program[done.n]?.step && emptied(done.kind, program[done.n]!.step, { vars, trigger: started, metric }, row);
      const w = step && row && cleaned ? writes(deps, done.kind, step, { vars, trigger: started, metric }, { vars: { ...vars, ...kept }, trigger, metric }, row, cleaned) : null;
      /* AND A FIELD THAT DOES NOT HOLD WHAT THE CLEAN FILL WOULD HAVE WRITTEN IS HELD BACK TOO. Two fills of the row as
         it is now agree once the secret is cleared during the wait, while the field still holds what the step wrote
         from it: measured, `pin` removed while the run waited on a person and the question went out as
         `Rate for hunter2?` with `about: { note: 'hunter2' }`. A field a person edited since is held back as well,
         which costs a question a value it could have carried, on a run only a build before `-unsent` parked. */
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
    const again = varText(spec.to, { vars: { ...vars, ...kept }, trigger, metric });
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
 * AND THE FIELD IS THE ONE THE RUN FILLS IT TO, since `act` hands the pass the filled step. Read as written,
 * `field: '{{vars.f}}'` with `f` set to `note` held back `{{vars.f}}`, the pass wrote `note` from `{{pin}}`, and the
 * question after it went out as `Rate for hunter2 hunter2?` with `about: { note: 'hunter2' }`. The lint refuses a field
 * in braces at install; this is the second line, for a rule stored before it did.
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
 * Leaving it off when nothing was kept made every such run read as an earlier build's and rebuilt from the row as it is
 * now: measured, `p` set from `note` while it said `plain`, `note` edited during the wait, and Slash asked
 * `Given changed?` about a variable holding `plain`, in a rule with no secret in it.
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

/**
 * The variables one run holds from a secret or file field: what its column keeps under `-sealed` while it is parked,
 * and, once it has finished and `finish` has written its answers alone, the same worked out again from its steps
 * (`sealedAgain`). What a tried run's answer holds back (`flow-try.ts`), since a `set_var`'s step row keeps the value it
 * set, whatever that value came from.
 */
export function sealedOfRun(deps: FlowDeps, run: string): Set<string> {
  const r = deps.sql.one<RunRow>('SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE id = ?', run);
  if (!r) return new Set();
  const held = unpack(r.vars).sealed;
  if (held !== null) return new Set(held);
  const decl = deps.trial ?? pinned(deps.sql, r.rule, r.version);
  if (!decl) return new Set();
  const trigger = JSON.parse(r.trigger) as RunTrigger;
  const row = trigger.entry ? (deps.entry(trigger.entry) ?? (trigger.deleted === true ? deletedRow(deps.sql, trigger.entry) : null)) : null;
  return sealedAgain(deps, run, plan(decl.steps ?? decl.then), context(deps, trigger, row), row);
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
 * `pathOf` over every active rule each time: measured with sixty rules of twenty steps, 0.55 ms a call, paid by writes
 * that no automation is about, and 0.18 ms with this cache, which is the select of sixty short rows. The key carries
 * the checksum as well as the version because a version number can be reused: an install that rolls back leaves the
 * next install the same number for different bytes. The bodies handed back are shared between calls, so nothing here or
 * in a caller writes to one.
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
 * THE PIN IS FOR WHAT A RUN DOES, NOT FOR WHETHER IT MAY. Measured: a rule installed with `enabled: false` as version
 * 2, and then retired the rule, while a run of version 1 waited an hour: both times the run woke, wrote `note: chased`
 * and notified, because `startRun` was the only place that read `enabled`. A plain edit still leaves the run on the
 * steps it started with, as migration 11 promises; only a live version that is off, or none at all, stops it.
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
 * rules in `declare.ts` and did not come through here until it was measured why it must: a pack turned off and on again
 * before the wake had its run wake under the rule turned back on, write its row and notify. `advance` still asks at
 * every wake, for a record an earlier build left holding a run of a rule already gone.
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
  'if', 'set_var', 'script', 'call', 'ask_slash', 'ask_person', 'wait', 'meet', 'run_job',
  'tag', 'untag', 'set', 'move', 'link', 'note', 'notify', 'schedule', 'create', 'suggest', 'run', 'stop',
] as const;

/**
 * One place in a plan: its verb, the step as declared, where an `if` or a `jump` goes, and `at`, where the step sits in
 * the declared tree (`steps[1].then[0]`), which is how a lint refusal and a tried run name a step.
 */
export type Op = { verb: string; step: Record<string, unknown>; to: number; at: string };

/**
 * The steps as one flat list, with a branch as a conditional jump.
 *
 * FLAT SO THAT ONE INTEGER SAYS WHERE A RUN IS. A tree would need a path saved beside the run, and a path into an
 * edited tree points somewhere else; an index into the plan of a pinned version cannot. An `if` jumps to its `else`
 * when it is false, and the last step of a `then` that has an `else` is followed by a `jump` past it. A plan has no
 * loops, so each place is reached at most once and is the step row's key.
 *
 * `root` IS WHAT THE LIST IS CALLED IN THE BODY, `steps` or `then`, so `at` reads as the lint's own paths do.
 */
export function plan(list: unknown, root = 'steps'): Op[] {
  const out: Op[] = [];
  const walk = (steps: unknown, at: string) => {
    if (!Array.isArray(steps)) return;
    for (const [i, step] of steps.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${i}]`;
      if ('if' in step) {
        const branch: Op = { verb: 'if', step, to: -1, at: here };
        out.push(branch);
        walk(step.then, `${here}.then`);
        if (step.else === undefined) branch.to = out.length;
        else {
          const jump: Op = { verb: 'jump', step, to: -1, at: here };
          out.push(jump);
          branch.to = out.length;
          walk(step.else, `${here}.else`);
          jump.to = out.length;
        }
      } else out.push({ verb: VERBS.find((v) => v in step) ?? 'unknown', step, to: -1, at: here });
    }
  };
  walk(list, root);
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
  /* A TURN RECORDED AND NOT TAKEN (`skipTurn`, its one `late` step) IS NOT A RUN THE DAY COUNTS: a drain that records
     five late turns and then reaches one on time would otherwise refuse the one it was meant to take. */
  const today = deps.sql.one<{ n: number }>(
    `SELECT count(*) AS n FROM automation_run WHERE rule = ? AND started_at > ?
       AND NOT EXISTS (SELECT 1 FROM automation_step s WHERE s.run = automation_run.id AND s.n = 0 AND s.kind = 'late')`,
    rule.id,
    instant(deps.nowMs - DAY_MS),
  )?.n ?? 0;
  if (today >= limit)
    return no('OUT_OF_BOUNDS', `${name} has started ${today} ${today === 1 ? 'run' : 'runs'} in the last day, and ${limit} is its most. Nothing was started.`, {
      at: 'limits.runs_per_day',
    });

  const id = openRun(deps, rule, trigger, o);
  /* COUNTED HERE AND NOT IN `openRun`, because a try opens its run there too and a try is not a firing. */
  raiseStat(deps.sql, rule.id, trigger.entry ?? null, deps.nowMs);
  if (o.arm !== false) wake(deps, id, deps.nowMs);
  return ok({ run: id });
}

/**
 * The run's row, `pending` at its first step, with the instant of its turn stamped on its trigger. `startRun` asks
 * whether the rule may start one before this; a tried run (`flow-try.ts`) is not a start the day counts, and is
 * written by this alone, inside a rehearsal that takes it out again.
 */
export function openRun(deps: FlowDeps, rule: Installed, trigger: RunTrigger, o: { actor: string; depth?: number }): string {
  const id = deps.mint();
  deps.sql.exec(
    `INSERT INTO automation_run (id, rule, version, trigger, state, step, vars, depth, project, actor, started_at)
     VALUES (?, ?, ?, ?, 'pending', 0, '{}', ?, ?, ?, ?)`,
    id,
    rule.id,
    rule.version,
    JSON.stringify({ ...trigger, at: trigger.at ?? instant(deps.nowMs) }),
    o.depth ?? 0,
    rule.body.project ?? null,
    o.actor,
    instant(deps.nowMs),
  );
  return id;
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
      ...(w.op === 'delete' || w.changed.length === 0 ? {} : { changed: w.changed.join(',') }),
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
  a: { raw: string; channel: string; ingest: string | null; state: string; wrote: readonly string[]; verified: boolean; redelivered?: true; counterparty?: string },
): void {
  if (a.redelivered) return;
  for (const rule of rules) {
    if (triggerOf(rule.body) !== 'arrival') continue;
    const spec = (rule.body.on as Extract<Trigger, { arrival: unknown }>).arrival as Extract<Trigger, { arrival: unknown }>['arrival'] & { unverified?: boolean };
    /* AN ARRIVAL NOTHING VERIFIED STARTS NOTHING UNLESS THE RULE ASKED FOR IT IN WRITING. Measured: five posts with a
       wrong token each started a run on `channel: webhook`, spent a `runs_per_day` of five, and wrote the sender's own
       text into five notes, and the owner's real message after them started nothing. A rule keyed on an `ingest:` was
       already safe, because an unverified arrival is stored with none; a rule on a channel or on `state: [untriaged]`
       was not. */
    if (!a.verified && spec.unverified !== true) continue;
    if (spec.ingest !== undefined && spec.ingest !== a.ingest) continue;
    if (spec.channel !== undefined && spec.channel !== a.channel) continue;
    if (spec.state !== undefined && !spec.state.includes(a.state)) continue;
    const row = a.wrote[0] === undefined ? null : deps.entry(a.wrote[0]);
    if (rule.body.project !== undefined && (row === null || deps.projectOf(row) !== rule.body.project)) continue;
    /* `when:` IS READ OVER THE ROW THE ARRIVAL WROTE, as a write trigger reads it over the written row, and with no row
       over the top-level keys of the arrival's JSON body. The lint refused it as `NOT_IN_THIS_BUILD` until this read it:
       a filter that filtered nothing. */
    if (rule.body.when !== undefined && !(row ? holds(deps, rule.body.when, row) : bodyHolds(deps, rule.body.when, a.raw))) continue;
    startRun(
      deps,
      rule,
      {
        kind: 'arrival',
        arrival: a.raw,
        channel: a.channel,
        ingest: a.ingest,
        verified: a.verified,
        ...(row ? { entry: row.id, register: row.register } : {}),
        ...(a.counterparty === undefined ? {} : { counterparty: a.counterparty }),
      },
      { actor: `ingest:${a.ingest ?? a.channel}` },
    );
  }
}

/**
 * When a clock rule is first due: the next day of the month it names on a clock of months, its time of day where it
 * names one, and one interval from now where it does not.
 */
export function firstDue(body: FlowDecl, nowMs: number, tz: string): number | null {
  const on = body.on as { every?: string; at?: string; day?: string } | undefined;
  if (typeof on?.every !== 'string') return null;
  const calendar = calendarOf(on);
  if (calendar !== null) return nextCalendar(calendar, nowMs, tz);
  const ms = intervalMs(on.every);
  if (ms === null) return null;
  if (typeof on.at === 'string') return nextOccurrence({ at: on.at, ...(typeof on.day === 'string' ? { day: on.day } : {}) }, nowMs, tz);
  return nowMs + ms;
}

/** The most turns one drain records for a clock that fell behind, oldest first. The rest are said in one skipped run. */
export const MISSED_TURNS_CEILING = 12;

/**
 * A clock rule's turn, and every turn after it the drain has also passed: each one recorded, and the next turn ahead.
 *
 * NEVER FOLDED. The first form took the turn it was handed and asked the clock for its next turn from now, so a host
 * that was off from 31 January to 2 May made the January task and none of February's, March's or April's, and said
 * nothing. Each turn from when this one was due up to now is now its own run, stamped with its own instant, or, where
 * the clock says `late:` and the turn is later than that, a run recorded as skipped and not taken (`skipTurn`). Past
 * `MISSED_TURNS_CEILING` turns, the rest are not taken either, and one skipped run says how many and from when, so a
 * clock of fifteen minutes back from a week away is not a thousand runs in one drain.
 *
 * EACH NEXT TURN COUNTS FROM THE TURN BEFORE IT, not from when the drain reached it, so an hourly rule stays on the hour
 * it was installed at and a monthly one on its day. A clock of months is asked the calendar from the turn and never
 * given a length to add: thirty days from the 31st of January is the 2nd of March, and from there the date would walk a
 * day or two further off with every month. A rule retired or edited off its clock ends the row, as a digest whose
 * declaration is gone does.
 */
export function onClock(deps: FlowDeps, rule: string, dueAt: string): number | null {
  const found = installed(deps.sql).find((r) => r.id === rule);
  if (!found || triggerOf(found.body) !== 'every') return null;
  const on = found.body.on as { every: string; at?: string; day?: string; late?: string };
  const calendar = calendarOf(on);
  const ms = calendar === null ? intervalMs(on.every) : null;
  const after = (turn: number): number | null =>
    calendar !== null
      ? nextCalendar(calendar, turn, deps.tz)
      : typeof on.at === 'string'
        ? nextOccurrence({ at: on.at, ...(typeof on.day === 'string' ? { day: on.day } : {}) }, turn, deps.tz)
        : ms === null
          ? null
          : turn + ms;

  /* THE TURN IS WHEN IT WAS DUE, NOT WHEN THE DRAIN GOT TO IT. A host that was off over the first of the month takes
     that turn on the third, and the task it makes is the first's; stamped with the drain's instant, `{{trigger.day}}`
     would have moved a rent due on the first to the day the machine came back. A row with no readable instant is taken
     as due now. */
  const due = Date.parse(dueAt);
  let turn = Number.isFinite(due) ? due : deps.nowMs;
  for (let taken = 0; turn <= deps.nowMs && taken < MISSED_TURNS_CEILING; taken++) {
    takeTurn(deps, found, turn);
    const next = after(turn);
    if (next === null) return null;
    turn = next;
  }
  if (turn <= deps.nowMs) {
    /* PAST THE CEILING, THE TURNS LEFT ARE SAID AND NOT TAKEN, in one run, and the clock is armed for its next turn
       after now. For a clock of a length the next turn keeps its phase; the calendar and a time of day are asked from
       now, which is where they fall next anyway. */
    const from = turn;
    const next = ms !== null && calendar === null && typeof on.at !== 'string' ? turn + Math.ceil((deps.nowMs - turn + 1) / ms) * ms : after(deps.nowMs);
    const left = ms !== null && calendar === null && typeof on.at !== 'string' ? Math.floor((deps.nowMs - from) / ms) + 1 : null;
    if (found.body.enabled !== false)
      skipTurn(
        deps,
        found,
        from,
        `rule.${rule} had missed more turns than one pass takes (${MISSED_TURNS_CEILING}), so ${left === null ? 'the turns' : `${left} ${left === 1 ? 'turn' : 'turns'}`} from ${turnSaid(deps, from)} to now were recorded and not taken.`,
      );
    return next;
  }
  return turn;
}

/**
 * One turn of a clock: a run taken now, or, past the clock's `late:` or its day's `runs_per_day`, a run recorded as
 * skipped. A rule switched off takes nothing and records nothing, since `startRun` refuses it and a turn it never meant
 * to take is not missed.
 */
function takeTurn(deps: FlowDeps, rule: Installed, turn: number): void {
  if (rule.body.enabled === false) return;
  const late = (rule.body.on as { late?: unknown }).late;
  const lateMs = typeof late === 'string' ? intervalMs(late) : null;
  if (lateMs !== null && deps.nowMs - turn > lateMs) {
    skipTurn(deps, rule, turn, `rule.${rule.id}'s turn due ${turnSaid(deps, turn)} was reached ${spanOf(deps.nowMs - turn)} late, past its late: ${String(late)}, so it was recorded and not taken.`);
    return;
  }
  const started = startRun(deps, rule, { kind: 'every', at: instant(turn) }, { actor: `rule:${rule.id}`, arm: false });
  if (started.ok) {
    const at = advance(deps, started.value.run);
    if (at !== null) wake(deps, started.value.run, at);
    return;
  }
  /* A TURN THE DAY'S CEILING REFUSED IS RECORDED TOO, with the refusal's sentence. A drain that takes every missed turn
     can reach `runs_per_day` inside one pass, and a turn dropped there without a row is the silent fold this replaced. */
  skipTurn(deps, rule, turn, fixOf(started));
}

/**
 * A turn recorded and not taken: a run `cancelled` with its sentence, and one step `{ n: 0, kind: 'late', state:
 * 'skipped' }`, which the runs list draws as Skipped.
 *
 * `cancelled` AND NOT A STATE OF ITS OWN, because `automation_run.state`'s CHECK has none for it and a rebuild would
 * cost a migration; the step row is what tells it from a run somebody stopped. Written without `startRun`, so
 * `runs_per_day` never refuses the record of a turn, and `startRun` does not count it, so a record of a turn never
 * spends the day of a turn that is taken. Finished through `finish`, so it writes the free metered line every cancelled
 * run writes.
 */
function skipTurn(deps: FlowDeps, rule: Installed, turn: number, say: string): void {
  const id = deps.mint();
  const project = rule.body.project ?? null;
  const actor = `rule:${rule.id}`;
  const trigger = JSON.stringify({ kind: 'every', at: instant(turn) });
  deps.sql.exec(
    `INSERT INTO automation_run (id, rule, version, trigger, state, step, vars, depth, project, actor, started_at)
     VALUES (?, ?, ?, ?, 'pending', 0, '{}', 0, ?, ?, ?)`,
    id,
    rule.id,
    rule.version,
    trigger,
    project,
    actor,
    instant(deps.nowMs),
  );
  record(deps, id, 0, 'late', 'skipped', null);
  finish(deps, { id, rule: rule.id, version: rule.version, trigger, state: 'pending', step: 0, vars: '{}', depth: 0, project, actor }, 'cancelled', say);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When a turn was due, as a person reads it in the record's zone: "22 Sep at 13:00", with the year when it is not this
 * one. The runs list prints a skipped run's sentence as it is, and time on screen is never an ISO instant. A zone the
 * runtime does not know is read as UTC, as `dayIn` reads it.
 */
function turnSaid(deps: FlowDeps, ms: number): string {
  const partsOf = (t: number): ReturnType<typeof localParts> => {
    try {
      return localParts(t, deps.tz);
    } catch {
      return localParts(t, 'UTC');
    }
  };
  const at = partsOf(ms);
  const now = partsOf(deps.nowMs);
  const year = at.year === now.year ? '' : ` ${at.year}`;
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${at.day} ${MONTHS[at.month] ?? ''}${year} at ${two(at.hour)}:${two(at.minute)}`;
}

/** How late a turn was, in the largest whole unit a person reads it in. */
function spanOf(ms: number): string {
  const [n, unit] = ms >= DAY_MS ? [Math.floor(ms / DAY_MS), 'day'] : ms >= 3_600_000 ? [Math.floor(ms / 3_600_000), 'hour'] : [Math.max(1, Math.floor(ms / 60_000)), 'minute'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/* ── the figure, the decision and the day ───────────────────────────── */

/** The side of its line a watched figure was read on. `above` takes the line itself for `gte`, `below` for `lte`. */
export type Side = 'above' | 'below';

/** How many `metric` triggers one hourly sweep reads, the longest unread first, so every one is read in its turn. */
export const WATCHED_PER_SWEEP = 200;

/**
 * The side of the line a figure stands on now, and the value read, or `null` for a reading that says nothing: no such
 * figure, a `target` it does not declare, or a refusal or a value it could not work out (`MIXED_CURRENCY` is the
 * ordinary one). The line is in the figure's own units, minor units for money, since that is what a reading answers.
 */
function sideOf(deps: FlowDeps, id: string, crosses: unknown): { value: number; side: Side } | null {
  const found = deps.sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'metric' AND superseded_at IS NULL AND retired = 0", `metric.${id}`);
  if (!found) return null;
  /* THE TARGET AS IT STANDS, a setting's value in place of the number written beside it, and no line at all for a
     setting nobody has typed (`declare.ts` `liveTarget`): the reading then has no verdict, and the side is kept. */
  const ctx = deps.rules().ctx;
  const decl = liveTarget(deps.sql, JSON.parse(found.body) as MetricDecl, ctx);
  const read = evaluateMetric(deps.sql, decl, ctx);
  if (!read.ok || read.value.value === null) return null;
  /* A MONEY FIGURE ADDED UP OUT OF THE CURRENCY IT DECLARES CARRIES ITS TARGET CONVERTED (`targetIn`), and that is the
     line its value is read against, as the page reads `met`. With no rate to convert it, `met` is `null` and the
     declared target is in another currency than the value, so the reading says nothing and the side is kept. */
  if (crosses === 'target' && read.value.met === null) return null;
  const line = crosses === 'target' ? (read.value.targetIn?.target ?? decl.target) : crosses;
  if (!isObject(line)) return null;
  const value = read.value.value;
  if (typeof line.gte === 'number') return { value, side: value >= line.gte ? 'above' : 'below' };
  if (typeof line.lte === 'number') return { value, side: value <= line.lte ? 'below' : 'above' };
  return null;
}

/**
 * The hourly read of every figure a `metric` trigger watches: the first reading sets its side and starts nothing, a
 * reading that says nothing keeps the side it had, and a change of side starts one run with trigger `{ kind: 'metric',
 * id, value, side }`. Answers how many runs it started.
 *
 * THE SIDE IS KEPT IN `automation_watch` (migration 17), per rule and per figure, because one reading says where a
 * figure is and nothing about whether it moved. A rule edited to watch another figure keys a new row, so its first
 * reading of that figure starts nothing either. `at` is when the figure was last read, and the sweep reads the longest
 * unread first, so past `WATCHED_PER_SWEEP` every rule is still read in its turn.
 *
 * BEFORE THIS NOTHING READ `on.metric`. `onWritten`, `onArrival`, `onClock` and the button were the four starts, each
 * skipping every trigger but its own, so the lint refused the trigger as `NOT_IN_THIS_BUILD` rather than let it install
 * and never start.
 */
export function onMetrics(deps: FlowDeps, rules: readonly Installed[]): number {
  const specOf = (rule: Installed) => (rule.body.on as Extract<Trigger, { metric: unknown }>).metric;
  /* A WATCH NO RULE HOLDS ANY MORE IS DELETED BEFORE THE READ, so the table keeps one row per installed rule that
     watches a figure, and the read below is no longer than that. A rule retired, or edited to watch another figure or
     off its `metric` trigger, left its row behind, and every such edit made the hourly read one row longer. A rule
     switched off keeps its row, so switching it back on does not start again from a first reading. */
  const held = new Set(rules.filter((r) => triggerOf(r.body) === 'metric').map((r) => `${r.id}\n${specOf(r).id}`));
  const kept = new Map<string, { rule: string; key: string; side: string | null; at: string }>();
  for (const w of deps.sql.all<{ rule: string; key: string; side: string | null; at: string }>('SELECT rule, key, side, at FROM automation_watch'))
    if (held.has(`${w.rule}\n${w.key}`)) kept.set(`${w.rule}\n${w.key}`, w);
    else deps.sql.exec('DELETE FROM automation_watch WHERE rule = ? AND key = ?', w.rule, w.key);
  const watching = rules.filter((r) => triggerOf(r.body) === 'metric' && r.body.enabled !== false);
  if (watching.length === 0) return 0;
  const lastRead = (rule: Installed): string => kept.get(`${rule.id}\n${specOf(rule).id}`)?.at ?? '';
  let started = 0;
  for (const rule of [...watching].sort((a, b) => lastRead(a).localeCompare(lastRead(b))).slice(0, WATCHED_PER_SWEEP)) {
    const spec = specOf(rule);
    const was = kept.get(`${rule.id}\n${spec.id}`);
    const now = sideOf(deps, spec.id, spec.crosses);
    /* A READING THAT SAYS NOTHING IS STILL A READ, and its time is kept with the side it had, or none. Left with no row,
       such a rule sorted first every hour, and past `WATCHED_PER_SWEEP` of them no other figure was read again. */
    deps.sql.exec(
      `INSERT INTO automation_watch (rule, key, side, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (rule, key) DO UPDATE SET side = coalesce(excluded.side, side), at = excluded.at`,
      rule.id,
      spec.id,
      now?.side ?? null,
      instant(deps.nowMs),
    );
    if (now === null || !was || was.side === null || was.side === now.side) continue;
    /* THE SIDE IS KEPT EVEN WHEN THE RUN IS REFUSED, since the figure did cross: a rule at its day's ceiling is not
       started a day late by a crossing that is over. */
    if (startRun(deps, rule, { kind: 'metric', id: spec.id, value: now.value, side: now.side }, { actor: `rule:${rule.id}` }).ok) started++;
  }
  return started;
}

/**
 * A decision just taken in Decide: start every rule its `decided` trigger admits, once per question and rule.
 *
 * `about` IS THE DECLARATION THAT FILED OR PROPOSES THE QUESTION (`index.ts` reads it from the suggestion), and `option`
 * matches the chosen answer's id, else its words exactly: a rule's `suggest` options are words whose ids are their
 * places (`o1`, `o2`), so a rule's author writes the words. `row` is the row the question names, which the run reads
 * as `{{trigger.row.<field>}}` and acts on, or `null` for a question about no row.
 *
 * CALLED IN THE DECISION'S OWN TRANSACTION, so a decision that rolls back starts nothing; the run is armed for now and
 * its steps are the drain's, as every trigger's are, so a person's press never runs a rule's writes. ONCE PER QUESTION:
 * the claim is a marker, as `once_per` is, so a question decided again (a change re-filed and accepted) starts nothing
 * more. A question a run's own `ask_person` asked is that run's answer and starts nothing here (`answerStep`).
 */
export function onDecided(
  deps: FlowDeps,
  rules: readonly Installed[],
  d: { suggestion: string; option: { id: string; label: string }; about: string | null; row: Entry | null; actor: string },
): void {
  for (const rule of rules) {
    if (triggerOf(rule.body) !== 'decided') continue;
    const spec = (rule.body.on as Extract<Trigger, { decided: unknown }>).decided ?? {};
    if (spec.about !== undefined && spec.about !== d.about) continue;
    if (spec.option !== undefined && spec.option !== d.option.id && spec.option !== d.option.label) continue;
    if (rule.body.project !== undefined && (d.row === null || deps.projectOf(d.row) !== rule.body.project)) continue;
    const key = JSON.stringify([rule.id, 'decided', d.suggestion]);
    if (!marker(deps.sql, deps.mint, deps.nowMs, key, { rule: rule.id, suggestion: d.suggestion }, false)) continue;
    const trigger: RunTrigger = {
      kind: 'decided',
      suggestion: d.suggestion,
      option: d.option.label,
      about: d.about,
      ...(d.row ? { entry: d.row.id, register: d.row.register } : {}),
    };
    /* A REFUSAL IS THE DAY'S CEILING OR A SWITCHED-OFF RULE, and the marker goes back, as `onWritten` gives one back. */
    if (!startRun(deps, rule, trigger, { actor: d.actor }).ok) deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ?", key);
  }
}

/**
 * WHAT ONE ANSWER TO A QUESTION STARTS, by the names of the automations whose `decided` trigger names that question's
 * declaration (`about`) and that answer, by its id or its words, as `onDecided` matches them. It is the reason a rule's
 * option carries, since a rule declares none of its own and the automation that acts on the answer says what it does.
 * One that admits any question or any answer is left out: it says nothing about this answer. A switched-off one starts
 * nothing, so it is not said. Empty where nothing acts on the answer.
 */
export function startedBy(rules: readonly Installed[], about: string): (option: { id: string; label: string }) => string {
  const on = rules.filter((r) => triggerOf(r.body) === 'decided' && r.body.enabled !== false && (r.body.on as Extract<Trigger, { decided: unknown }>).decided?.about === about);
  return (o) =>
    on
      .filter((r) => {
        const option = (r.body.on as Extract<Trigger, { decided: unknown }>).decided?.option;
        return option !== undefined && (option === o.id || option === o.label);
      })
      .map((r) => (typeof r.body.name === 'string' ? r.body.name.trim() : ''))
      .filter((name) => name !== '')
      .join(' and ');
}

/** How many rows one run-path rule about a relative day has read each hour, as `rulesAboutTime` reads an inline one. */
export const SWEPT_ROWS = 1000;

/**
 * The hourly re-read of a run-path `written` rule whose `when:` names a day relative to today and which says
 * `once_per`: one run per row its `when:` now holds for and per `once_per` key, claimed with the marker the inline pass
 * writes, so a row the write already started a run for starts none here. Answers how many runs it started.
 *
 * `when:`, `project:` AND `once_per:` ARE READ; `op:`, `fields:` and `from_rules:` are not, because they say which writes
 * start the rule and a day passing writes nothing. `due before today` becomes true of a bill nobody touched, and a rule
 * read only on writes would never see it.
 *
 * MEASURED BEFORE THIS: such a rule installed, its row went past due, and a sweep by hand started nothing, because the
 * hourly re-read handed every rule to `applyRule`, which finds rows by a top-level `register:` and a run-path rule has
 * none. The lint then refused the body as `NOT_IN_THIS_BUILD` until this read it.
 */
export function onTime(deps: FlowDeps, rules: readonly Installed[]): number {
  let started = 0;
  for (const rule of rules) {
    if (triggerOf(rule.body) !== 'written' || rule.body.enabled === false || rule.body.when === undefined) continue;
    if (!rule.body.once_per?.length || !RELATIVE_DAY.test(JSON.stringify(rule.body.when))) continue;
    const register = (rule.body.on as Extract<Trigger, { written: unknown }>).written.register;
    const schema = deps.schemaOf(register);
    if (!schema) continue;
    const said = predicateOf(rule.body.when, schema, deps.rules().ctx);
    if (said.bad.length) continue;
    const w = compile(said.predicate, schema);
    if (w.bad.length) continue;
    for (const { id } of deps.sql.all<{ id: string }>(
      `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND (${w.sql}) ORDER BY seq, rowid LIMIT ?`,
      register,
      ...w.params,
      SWEPT_ROWS,
    )) {
      const entry = deps.entry(id);
      if (!entry) continue;
      if (rule.body.project !== undefined && deps.projectOf(entry) !== rule.body.project) continue;
      const key = onceKey({ rule: rule.id, once_per: rule.body.once_per } as RuleDecl, entry);
      if (key === null || !marker(deps.sql, deps.mint, deps.nowMs, key, { rule: rule.id, entry: entry.id }, false)) continue;
      /* A REFUSAL IS THE DAY'S CEILING OR A SWITCHED-OFF RULE: the marker goes back, and this rule's rows wait for the
         next hour rather than each being refused in turn. */
      if (!startRun(deps, rule, { kind: 'written', entry: entry.id, register }, { actor: 'system' }).ok) {
        deps.sql.exec("DELETE FROM schedule WHERE kind = 'rule' AND key = ?", key);
        break;
      }
      started++;
    }
  }
  return started;
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
  /* A BODY BEING TRIED IS NOBODY'S LIVE VERSION, so neither question is asked of the table for it (`FlowDeps.trial`). */
  const off = deps.trial ? null : stopped(deps.sql, run.rule);
  if (off !== null) {
    finish(deps, run, 'cancelled', off);
    return null;
  }
  /* A RUN A COLLEAGUE TURNED ON READS AND WRITES THROUGH THEIR LENS, and ends, saying why, once they
     can no longer reach the record. Asked at every turn, so a share revoked while a run waits stops it at its wake. */
  const bound = deps.trial ? null : (deps.boundTo?.(run.rule) ?? null);
  if (bound !== null && 'stop' in bound) {
    finish(deps, run, 'cancelled', bound.stop);
    return null;
  }
  if (bound !== null) deps = bound.deps;
  /* AT THE RECORD'S MONTHLY ALLOWANCE A RUN THAT HAS NOT STARTED WAITS FOR THE FIRST OF NEXT MONTH, with the
     Directory's sentence on its row. The answer is the run's next due time, so its schedule row wakes it then; a run
     already under way finishes what it started, and a body being tried is never held. */
  const held = deps.trial ? null : deps.held;
  if (held && held.until > deps.nowMs && run.state === 'pending' && run.step === 0) {
    deps.sql.exec('UPDATE automation_run SET say = ? WHERE id = ?', held.say, run.id);
    return held.until;
  }
  const decl = deps.trial ?? pinned(deps.sql, run.rule, run.version);
  if (!decl) {
    finish(deps, run, 'failed', `rule.${run.rule} version ${run.version}, which this run started under, is not in this BrainDog.`);
    return null;
  }

  const program = plan(decl.steps ?? decl.then);
  const trigger = JSON.parse(run.trigger) as RunTrigger;
  const { vars, kept: stored, unsent: marked, sealed: tainted } = unpack(run.vars);
  let subject = trigger.entry ? deps.entry(trigger.entry) : null;
  /* A ROW ITS MAKER'S LENS DOES NOT SHOW IS NOT THIS RUN'S TO READ: the run is skipped, saying so, before any step. */
  if (bound !== null && subject === null && trigger.entry && trigger.deleted !== true) {
    finish(deps, run, 'cancelled', bound.unseen);
    return null;
  }
  /* WHAT A STEP READS AND WHAT IT WRITES ARE TWO ROWS WHEN A DELETE STARTED THE RUN. Its conditions and templates read
     the row as it was deleted, which is what the rule was written about; its writes get `subject`, which is `null`,
     so a `set` on a deleted row fails with a sentence rather than bringing the row back. A run bound to a colleague's
     lens is not handed the deleted row, which its lens no longer reads. */
  const last = subject === null && trigger.deleted === true && trigger.entry && bound === null ? deletedRow(deps.sql, trigger.entry) : null;
  const read = (): Entry | null => subject ?? last;
  const actor = `rule:${run.rule}`;
  /* WHAT A `create` WITH NO ROW NAMES AS ITS PARENT: the turn on a clock, so a turn delivered twice makes one row, and the
     run anywhere else (`rules.ts`'s `createAlone`). */
  const parent = trigger.kind === 'every' && typeof trigger.at === 'string' ? `${run.rule}@${trigger.at}` : id;
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

  /* WHERE THE RUN IS, SAVED AFTER EVERY STEP THAT IS DONE. This was written only at a wait and at the end, so a run
     that stopped between two steps started again from its last wait and took every step since a second time: measured,
     six notifies in twelve hours from one row. A step that finished is never taken again. */
  const saved = (next: number): number => {
    deps.sql.exec('UPDATE automation_run SET step = ?, vars = ? WHERE id = ?', next, pack(vars, kept, unsent, sealedVars), id);
    return next;
  };

  let i = run.step;
  try {
    while (i < program.length) {
      const op = program[i]!;
      /* A `set` OR A `create` FIELD THAT WOULD FILL WITH NOTHING IS TAKEN AS NOTHING (`emptied`), here and not in the
         pass, because the pass fills from the run through the paths it is handed and cannot tell a hole from a dash. */
      const step = op.verb === 'set' || op.verb === 'create' ? emptied(op.verb, op.step, scope(), subject) : op.step;

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
        const value = varText(spec.to, scope());
        if (value.length > VAR_BYTES) return fail(i, 'set_var', `rule.${run.rule} sets ${spec.name} to ${value.length} characters, and one answer holds ${VAR_BYTES}.`);
        /* AND FILLED A SECOND TIME, FROM WHAT A QUESTION TO SLASH MAY CARRY: the row `sendable` leaves, and every
           variable already kept here read as it was kept, so one set from another carries the cleaning with it. The
           first fill alone is what was measured leaving through a real self-host:
           `set_var: { to: '{{trigger.row.pin}}' }` then `{{vars.p}}` put "given hunter2" in the model's request body,
           and `to: '{{trigger.row}}'` put the row's JSON there with `pin` in it. The lint refuses both at install; this
           is the second line, for a rule an earlier build let install.

           BOTH FILLS READ `vars` AS IT WAS BEFORE THIS STEP. The second was taken after the new value went in, so
           `to: '{{vars.p}} more'` read its own result, the fills differed, and Slash was asked `plain more more` about
           a variable holding `plain more`. */
        const row = read();
        const now = scope();
        const clean = varText(spec.to, { vars: { ...vars, ...kept }, trigger: row ? { ...now.trigger, row: sendable(deps, row, unsent).fields } : now.trigger, metric });
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

      /* A STEP THIS BUILD OR THIS HOST DOES NOT RUN FAILS THE RUN HERE, by its row in `capabilities.ts`, before anything
         is queued. Slash is not asked on a host that would not answer: a question queued for nobody waits its day and
         fails, having asked nobody, and this is for a rule that became live without meeting `unserved`. */
      /* A RUN BOUND TO A COLLEAGUE'S LENS TAKES NO STEP THAT REACHES OUTSIDE THE ROWS (`OUTWARD`), in its own sentence. */
      if (deps.bounded !== undefined && OUTWARD.has(op.verb)) return fail(i, op.verb, deps.bounded);
      const can = capability(op.verb);
      if (can !== undefined && (!can.runs || !serves(can, deps.answersSlash)))
        return fail(i, op.verb, `rule.${run.rule} reached ${op.verb === 'ask_slash' ? 'an' : 'a'} ${op.verb} step, and ${can.says} (NOT_IN_THIS_BUILD). The steps before it were taken.`);

      if (op.verb === 'call') {
        /* THE SECOND TIME A CALL IS REACHED IS THE END OF ITS WAIT, as for an ask: the answer moves the run past the step
           before the drain comes back (`answerStep`), so a wake that finds the row still `waiting` had no answer. */
        const was = deps.sql.one<{ state: string }>('SELECT state FROM automation_step WHERE run = ? AND n = ?', id, i)?.state;
        if (was === 'done') {
          i = saved(i + 1);
          continue;
        }
        const ingest = String((step.call as { ingest?: unknown }).ingest ?? '');
        if (was === 'waiting') return fail(i, 'call', `rule.${run.rule} called ${ingest} at step ${i + 1}, and no answer came back within a day, so the run stopped there.`);
        if (!deps.call) return fail(i, 'call', `rule.${run.rule} reached a call step, and this host wired no way to send one (NOT_IN_THIS_BUILD). The steps before it were taken.`);
        /* THE RUN'S LIVE ROW AND NOT ONE A DELETE LEFT, so a call about a deleted row sends nothing of it: `queueCall`
           refuses a call that sends fields when there is no row to send them from. */
        const queued = deps.call(ingest, { rule: run.rule, entry: subject, run: id, step: i });
        if (queued.outcome !== 'queued' || queued.job === undefined) return fail(i, 'call', queued.say);
        record(deps, id, i, 'call', 'waiting', queued.job);
        deps.sql.exec("UPDATE automation_run SET state = 'waiting', step = ?, vars = ? WHERE id = ?", i, pack(vars, kept, unsent, sealedVars), id);
        return deps.nowMs + CALL_WAIT_MS;
      }

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
          const spec = step[op.verb] as { wait?: string; question?: unknown };
          /* THE QUESTION'S OWN WORDS, never the suggestion id the step row holds while it waits. */
          const said = typeof spec.question === 'string' && spec.question.trim() !== '' ? `"${spec.question.trim()}"` : 'a question';
          return fail(
            i,
            op.verb,
            op.verb === 'ask_person'
              ? `rule.${run.rule} asked ${said} at step ${i + 1}, and nobody answered it within ${spec.wait ?? ASK_PERSON_WAIT}, so the run stopped there.`
              : `rule.${run.rule} asked Slash at step ${i + 1}, and Slash did not answer within a day, so the run stopped there.`,
          );
        }
        const asked = ask(deps, run.rule, op.verb, step, i, id, scope(), kept, unsent, sealedVars, read(), actor);
        if (!asked.ok) return fail(i, op.verb, asked.say);
        record(deps, id, i, op.verb, 'waiting', asked.holds);
        const parked = pack(vars, kept, unsent, sealedVars);
        deps.sql.exec("UPDATE automation_run SET state = 'waiting', step = ?, vars = ? WHERE id = ?", i, asked.currency === undefined ? parked : withAsked(parked, { currency: asked.currency }), id);
        return deps.nowMs + asked.waitMs;
      }

      if (op.verb === 'meet') {
        const met = meetOne(deps, run.rule, step, i, read(), scope(), paths(), sealedFields(), actor, run.project);
        if (!met.ok) return fail(i, 'meet', met.say);
        /* `skipped` AND NOT `done` WHEN NOBODY WAS NAMED, because nothing was met: a transaction with no counterparty
           is not a person, and a row saying `done` would say the rule met one. */
        record(deps, id, i, 'meet', met.person === null ? 'skipped' : 'done', met.said);
        i = saved(i + 1);
        continue;
      }

      if (op.verb === 'run_job') {
        /* THE FIRST TIME THE STEP IS REACHED IT QUEUES THE JOB, AND EVERY WAKE AFTER IT LOOKS AT THE JOB'S ROW
           (`RUN_JOB_LOOK_MS` says why a look). The step row's `at` is when the job was queued, since nothing writes the
           row again until the job ends, so the day is counted from there however many looks there were. */
        const was = deps.sql.one<{ state: string; answer: string | null; at: string }>('SELECT state, answer, at FROM automation_step WHERE run = ? AND n = ?', id, i);
        if (was?.state === 'done') {
          i = saved(i + 1);
          continue;
        }
        const spec = step.run_job as { kind?: unknown; as?: unknown };
        const kind = typeof spec?.kind === 'string' ? spec.kind : 'a job';
        if (was?.state === 'waiting' && was.answer !== null) {
          const status = deps.sql.one<{ status: string }>('SELECT status FROM job WHERE id = ?', was.answer)?.status ?? null;
          if (status !== null && JOB_GOING.includes(status)) {
            const until = Date.parse(was.at) + RUN_JOB_WAIT_MS;
            if (!(deps.nowMs < until))
              return fail(
                i,
                'run_job',
                `rule.${run.rule} started ${kind} as ${was.answer} at step ${i + 1}, and it had not ended within a day, so the run stopped there. The job goes on, and its own page says how it ends.`,
              );
            deps.sql.exec("UPDATE automation_run SET state = 'waiting' WHERE id = ?", id);
            return Math.min(deps.nowMs + RUN_JOB_LOOK_MS, until);
          }
          /* A JOB GONE FROM THE TABLE ENDED AS FAR AS THE RUN CAN TELL, and not well. */
          const ended = status ?? 'gone';
          const answer = JOB_ANSWERS[ended] ?? 'error';
          /* THE ANSWER TAKES THE NAME OFF WHATEVER IT HELD, as a call's does (`answerCall`): the variable now holds how
             the job ended, not the secret a `set_var` of the same name may once have held. */
          if (typeof spec.as === 'string') {
            vars[spec.as] = answer;
            delete kept[spec.as];
            sealedVars.delete(spec.as);
          }
          record(deps, id, i, 'run_job', 'done', answer === ended ? answer : `${answer} (${ended})`);
          i = saved(i + 1);
          continue;
        }
        const started = startJob(deps, run.rule, step, i, subject, read(), scope(), paths(), sealedFields());
        if (!started.ok) return fail(i, 'run_job', started.say);
        record(deps, id, i, 'run_job', 'waiting', started.job);
        deps.sql.exec("UPDATE automation_run SET state = 'waiting', step = ?, vars = ? WHERE id = ?", i, pack(vars, kept, unsent, sealedVars), id);
        return deps.nowMs + RUN_JOB_LOOK_MS;
      }

      if (op.verb === 'script') {
        const started = startScript(deps, run.rule, step, i, read(), paths());
        /* A PAUSED SCRIPT ENDS THE RUN AS A SWITCHED-OFF RULE DOES, cancelled with its sentence: the pause is the fault,
           and `scripts-paused` already names it once. Failed, every write that fired the rule while it was paused was one
           more failed automation on `automations-failed`, the same cause told twice. */
        if (!started.ok && started.paused) {
          finish(deps, { ...run, step: i }, 'cancelled', started.say, vars);
          record(deps, id, i, op.verb, 'skipped', null);
          return null;
        }
        if (!started.ok) return fail(i, op.verb, started.say);
        /* THE JOB ID TAKES THE NAME OFF WHATEVER IT HELD, as an answer does in `answerStep`. Left in `kept` and
           `sealedVars`, a name first set from a secret still read as one: measured, `set_var: job` from `pin`, then
           `script: { as: job }`, then `set: { what: 'queued {{vars.job}}' }` failing the run as a secret copy. */
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

      /* A WRITE TO THE ROW IS FILLED BOTH WAYS TOO, before it is taken, since the row it is filled from is the row as
         it stands now. The field it writes is held back from every question to Slash after it when the two differ, and
         given back by a plain `set` of it: a question reads the row as the step left it, and it was measured that
         `set: { field: note, to: '{{pin}}' }` then `{{note}}`, `{{trigger.row.note}}`, `about: [note]` and a `set_var`
         from `note` each queueing `hunter2` for Slash. The lint refuses those at install, and the step below is refused
         at run time as well, so for a secret this now marks only a copy into a field that never leaves either; what it
         still guards is a run an earlier build took past such a write, whose `-unsent` this column carries on or
         `rebuilt` replays. */
      const cleanRow = (op.verb === 'set' || op.verb === 'tag') && subject ? sendable(deps, subject, unsent) : null;
      const wrote =
        cleanRow && subject && (op.verb === 'set' || op.verb === 'tag')
          ? writes(deps, op.verb, step, scope(), { vars: { ...vars, ...kept }, trigger: { ...scope().trigger, row: cleanRow.fields }, metric }, subject, cleanRow)
          : null;
      /* A STEP THAT WRITES ANYWHERE BUT THE RUN'S OWN ROW COPIES NO SECRET, unless into a field that never leaves
         either. The lint refuses such a step at install (`flow-lint.ts`, `copyFault`); this is the second line, for a
         rule stored before it did. Measured at `afb3b1b2` with the rule written into the table: `note`, `notify`,
         `schedule`, `create` into another list, `suggest`, `tag` and `set` each wrote `hunter2` from
         `{{trigger.row.pin}}`, `{{trigger.row}}` or a variable set from `pin`, into the note event, a Payments row, the
         schedule, the question queue and the row itself. The texts the pass fills are handed to it as typed with the
         run's paths beside them (`handOn`), so each is filled once and the pass refuses the copy there; every other
         string is filled here, and a copy in one of those fails the step here. The sentence names the spelling and
         never the value. */
      const by = paths();
      /* A CREATE'S FIELDS GO TO THE PASS AS TYPED WITH OR WITHOUT A ROW, since `createAlone` fills them as `runRules`
         does, and the copy of a secret is refused by the create either way. Filled here as well, they were filled
         twice: measured, a button's `set_var: { to: 'a {{what}} b' }` then `what: 'x {{vars.label}}'` reached the
         create as `x a {{what}} b` and was refused as reading a row the run does not have, where the braces were only
         what the variable held (`clock-create.test.ts`). */
      const handed = handOn(step, by, subject !== null || op.verb === 'create');
      /* A `tag` OF THE RUN'S OWN ROW IS REFUSED WITH THE REST, and a `set` is refused by the pass, which fills its `to`
         (`rules.ts`). A first repair wrote both and held the field back from what leaves; measured at `b7409d2d`,
         `tag: 'x {{trigger.row.pin}}'` stored past the lint put `x hunter2` in the row's tags, which every reader of
         the list sees. `mark` below is left holding back only what a `set` copies into a field that never leaves
         either, and a field no live declaration types.

         AN `untag` IS LET THROUGH, as the lint lets it install (`flow-lint.ts`'s `COPIERS`). At `b7409d2d` it installed
         and then failed its run whenever the secret held anything, because this check read every string of the step and
         exempted `set` and `tag` alone. It writes the row's own tags back less one word and adds none, so what it tells
         a reader is whether a tag equalled the secret, which an `if` on the field already tells. */
      if (handed.secret !== null && op.verb !== 'untag')
        return fail(
          i,
          op.verb,
          `rule.${run.rule}'s ${op.verb} at step ${i + 1} reads ${handed.secret}, which holds what a secret or file field holds, and such a field is copied only into another secret or file field. The step was not taken; the steps before it were.`,
        );
      const acted = act(deps, run.rule, op.verb, handed.action as RuleAction, subject, id, actor, subject === null ? last : null, by, parent);
      if (!acted.ok) return fail(i, op.verb, acted.say);
      if (op.verb === 'set' || op.verb === 'tag') mark(unsent, op.verb, wrote);
      record(deps, id, i, op.verb, 'done', acted.answer);
      if (subject) subject = deps.entry(subject.id);
      if (acted.stop) break;
      i = saved(i + 1);
    }
  } catch (e) {
    /* A STEP THAT THROWS IS A STEP THAT FAILED, and the run ends here with a sentence. Left to the drain, the throw
       walked its retry ladder over a run still `running`, and each attempt took again every step since the last save;
       the run was never finished, so `pruneRuns` never took it and it held no metered line. What threw when it was
       measured was `{ note: { text } }`, which the lint let through and `fill` could not read, but a driver error or a
       full disk arrives the same way. */
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
  parent: string,
): { ok: true; stop: boolean; answer: string | null } | { ok: false; say: string } {
  const r = deps.rules();
  if (verb === 'stop') return { ok: true, stop: true, answer: null };

  if (subject === null) {
    /* NO ROW: A CLOCK, A BUTTON, OR AN ARRIVAL THAT WROTE NOTHING. The lint keeps the row verbs off the first two;
       an arrival may still reach one, and says so here rather than acting on no row. `notify`, `suggest` and `create`
       need no row, and are taken. */
    if ('notify' in action) {
      if (action.notify.urgent === true) r.interrupt({ actor, say: action.notify.say, ...(typeof action.notify.because === 'string' ? { because: action.notify.because } : {}) });
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
    /* A CREATE MAKES A ROW AND NEEDS NONE TO STAND ON, so it is taken here, keyed on the clock's turn or the run
       (`createAlone` says why). Sent on to the sentence below, a create on a weekly or monthly clock installed and
       failed every turn (measured, `clock-monthly.test.ts`). Its fields reach here as typed (`handOn`), so the create
       fills them once. */
    if ('create' in action) {
      const grown = createAlone(r, rule, action.create, batch, run, parent);
      const first = grown.refusals[0];
      if (first) return { ok: false, say: first.fix };
      return { ok: true, stop: false, answer: null };
    }
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
 * MEASURED BEFORE THIS ARM (`packages/kernel/test/rule-script.test.ts`, at `8a489d4c`): every run that reached a script
 * step failed with "a step that waits on a script is not in this build", and a script declaring `runs: { rule: true }`
 * was read by the egress line that tells the owner about it and by nothing that started one. So a rule could not close
 * a task's follow-ups, and the Work pack declared no cascade.
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
 * the script's, not the clock's. The first attempt read the declaration and nothing else, and that was not enough: a
 * script paused after three refused runs (`pauseAfterRefusals` in `script-run.ts`) was queued again by the next write
 * that fired the rule, so "it will not run again until somebody resumes it" was not true, and each of those runs would
 * have been refused a fourth, fifth and sixth time. `rule-script.test.ts` measured it: the run finished `done` with one
 * row queued for a paused script. The gates, in the order a fire meets them:
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
): { ok: true; job: string } | { ok: false; say: string; paused?: true } {
  const spec = step.script as { id?: unknown; input?: unknown };
  const name = typeof spec?.id === 'string' ? spec.id : '';
  const found = deps.sql.one<{ version: number; body: string }>(
    "SELECT version, body FROM declaration WHERE id = ? AND kind = 'script' AND superseded_at IS NULL AND retired = 0",
    `script.${name}`,
  );
  if (!found) return { ok: false, say: `rule.${rule} starts a script at step ${n + 1}, and there is no script called ${name || '(no name)'} here.` };
  const runs = (JSON.parse(found.body) as { runs?: { rule?: unknown } }).runs;
  if (runs?.rule !== true)
    return {
      ok: false,
      say: `rule.${rule} starts script.${name} at step ${n + 1}, and script.${name} does not say runs: { rule: true }, so no rule may start it. Nothing was queued.`,
    };
  const paused = deps.sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", name)?.state === 'paused';
  /* THE SENTENCE SAYS WHAT HAPPENS TO THIS ROW, which is nothing: a resume starts it for rows written after it, and a
     run that ended here is never taken again. A script that also runs on a clock reaches this row on its next run. */
  if (paused) {
    const clock = typeof (JSON.parse(found.body) as { runs?: { every?: unknown } }).runs?.every === 'string';
    const after = clock ? 'Its next run on its clock after it is resumed reaches this row too.' : 'Once it is resumed, a rule starts it for rows written after that, not for this one.';
    return {
      ok: false,
      paused: true,
      say: `rule.${rule} starts script.${name} at step ${n + 1}, and script.${name} is paused, so nothing was queued and the run stopped there; the steps before it were taken. ${after}`,
    };
  }
  const handed = handOn(isObject(spec.input) ? spec.input : {}, by, false);
  if (handed.secret !== null)
    return {
      ok: false,
      say: `rule.${rule}'s script at step ${n + 1} hands on ${handed.secret}, which holds what a secret or file field holds, and a script's input never carries one. Nothing was queued; the steps before it were taken.`,
    };
  /* WHO MADE THE ROW, WHEN A RUN DID, AS `made_by`: the maker by the row's own `create` line and never the run's actor,
     so it is the maker on an update too. THE RECORD'S WORD AND NEVER THE RULE'S: a rule's own `input:` cannot say it,
     since what the rule wrote under that name is dropped and the key is there only when a run made the row. */
  const { made_by: _said, ...own } = handed.action;
  const maker = row ? (deps.madeBy?.(row) ?? null) : null;
  const input = { ...(row ? { id: row.id, register: row.register, seq: row.seq } : {}), ...own, ...(maker === null ? {} : { made_by: maker }) };
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
  /* AT MOST `RULE_CALLS_PER_DAY` RUNS A DAY THAT RULES START, AS THE APPROVAL LINE SAYS: `scriptEgress` in `actions.ts`
     prints that ceiling as "when a rule runs it, at most ... a day" for every script with `runs: { rule: true }`, and
     nothing counted them, so a bulk change to many rows could start as many sandboxes. Counted by the UTC day, as a
     call is (`queueCall`),
     over the jobs a rule's `script` step queued, which are the ones a step row answers; a clock's run and a door's are
     the script's own and are not counted here. A job shared by two steps (above) is one run and counted once. */
  const day = instant(deps.nowMs).slice(0, 10);
  const today =
    deps.sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM outbox o WHERE o.kind = 'script.run' AND o.created >= ? AND json_extract(o.payload, '$.script') = ?
         AND EXISTS (SELECT 1 FROM automation_step s WHERE s.answer = o.id AND s.kind = 'script')`,
      day,
      name,
    )?.n ?? 0;
  if (today >= RULE_CALLS_PER_DAY)
    return {
      ok: false,
      say: `rule.${rule} starts script.${name} at step ${n + 1}, and rules have started script.${name} ${RULE_CALLS_PER_DAY} times today, the most a day. Nothing was queued, and rules can start it again tomorrow; the steps before it were taken.`,
    };
  return { ok: true, job: enqueue(deps.sql, deps.mint, deps.nowMs, 'script.run', { script: name, version: found.version, input }) };
}

/**
 * One text a `meet` or a `run_job` hands on, filled from the run and, where the run has one, the row, in one pass
 * (`rules.ts`'s `filling`), with the first spelling in it that reached what a secret or file field holds, or `null`.
 *
 * THE ROW'S OWN `{{field}}` IS FILLED AS WELL AS THE RUN'S PATHS, as a note's is, because "meet its counterparty" is
 * written `{{counterparty}}` as often as `{{trigger.row.counterparty}}`. With no row the row's braces are left as typed,
 * as `handOn` leaves them.
 */
function handedText(text: string, row: Entry | null, by: RunFill, sealed: ReadonlySet<string>, nowMs: number): { text: string; secret: string | null } {
  if (row !== null) return filling(text, row, nowMs, { sealed, run: by });
  const handed = handOn({ text }, by, false);
  return { text: String(handed.action.text), secret: handed.secret };
}

/**
 * Meet the person a `meet` step names, as the rule, and say who they turned out to be; `person` is `null` when the step
 * named nobody.
 *
 * A KEY THAT FILLS WITH NOTHING IS LEFT OUT (`nothingIn`), so an empty counterparty is not a person named with the dash a hole writes. When
 * name, email and handle all fill with nothing, nobody is met and the run goes on: a row with no counterparty is not a
 * fault of the rule's. A `where:` that fills with nothing says the rule, so the person's line still says how they
 * were met.
 *
 * A SECRET IS NEVER COPIED INTO A PERSON, whose name and email every reader of People sees. The lint refuses the
 * spelling at install (`flow-lint.ts`'s `copyFault`); this is the second line, for a rule stored before it did, and it
 * names the spelling and never the value.
 */
function meetOne(
  deps: FlowDeps,
  rule: string,
  step: Record<string, unknown>,
  n: number,
  row: Entry | null,
  scope: Record<string, unknown>,
  by: RunFill,
  sealed: ReadonlySet<string>,
  actor: string,
  project: string | null,
): { ok: true; person: string | null; said: string } | { ok: false; say: string } {
  const spec: Record<string, unknown> = isObject(step.meet) ? step.meet : {};
  const named: Partial<Record<(typeof MEET_KEYS)[number], string>> = {};
  for (const key of MEET_KEYS) {
    const text = spec[key];
    if (typeof text !== 'string' || nothingIn(text, scope, row)) continue;
    const filled = handedText(text, row, by, sealed, deps.nowMs);
    if (filled.secret !== null)
      return {
        ok: false,
        say: `rule.${rule}'s meet at step ${n + 1} reads ${filled.secret} into the person's ${key}, which holds what a secret or file field holds, and such a field is copied only into another secret or file field. Nobody was met; the steps before it were taken.`,
      };
    const clean = filled.text.trim();
    if (clean !== '') named[key] = clean;
  }
  /* `keys`, ONE TEMPLATE OR A LIST OF THEM, each `kind:value` (`bank:{{trigger.row.counterparty_text}}`). One that fills
     with nothing, or with a kind and no value (`bank:` on a row with no payee), identifies nobody and is dropped. */
  const keys: string[] = [];
  for (const text of typeof spec.keys === 'string' ? [spec.keys] : Array.isArray(spec.keys) ? spec.keys : []) {
    if (typeof text !== 'string' || nothingIn(text, scope, row)) continue;
    const colon = text.indexOf(':');
    if (colon > 0 && /^[a-z]+$/u.test(text.slice(0, colon)) && nothingIn(text.slice(colon + 1), scope, row)) continue;
    const filled = handedText(text, row, by, sealed, deps.nowMs);
    if (filled.secret !== null)
      return {
        ok: false,
        say: `rule.${rule}'s meet at step ${n + 1} reads ${filled.secret} into the person's keys, which holds what a secret or file field holds, and such a field is copied only into another secret or file field. Nobody was met; the steps before it were taken.`,
      };
    const clean = filled.text.trim();
    if (clean !== '' && !/^[a-z]+:\s*$/u.test(clean)) keys.push(clean);
  }
  /* A NAME WITH NO LETTER IN IT NAMES NOBODY (live check of 30 October, 10): a bank's "0140" and "8307" are the digits of
     an account, and meeting them made two organisations Payees then offered as names. The name is left out, and with it
     a key made of the same digits. */
  if (named.name !== undefined && !/\p{L}/u.test(named.name)) {
    const digits = named.name;
    delete named.name;
    for (let i = keys.length - 1; i >= 0; i--) if (keys[i]!.slice(keys[i]!.indexOf(':') + 1).trim() === digits) keys.splice(i, 1);
  }
  const organisation = named.kind === 'organisation';
  if (named.name === undefined && named.email === undefined && named.handle === undefined && keys.length === 0 && !(organisation && named.domain !== undefined))
    return { ok: true, person: null, said: 'Nobody: the name, email, handle and keys it names were all empty.' };
  if (named.kind !== undefined && named.kind !== 'person' && !organisation)
    return { ok: false, say: `rule.${rule}'s meet at step ${n + 1} met nobody: kind is person or organisation, and it filled with ${named.kind}.` };
  if (!deps.meet) return { ok: false, say: `rule.${rule} reached a meet step, and this host wired no way to meet a person (NOT_IN_THIS_BUILD). The steps before it were taken.` };
  const { kind, only, ...rest } = named;
  const met = deps.meet(
    {
      ...rest,
      ...(kind === undefined ? {} : { kind: organisation ? 'organisation' : 'person' }),
      /* NOBODY NEW FROM THIS RULE when it says so, which only `known` does: anything else filled in is no promise. */
      ...(only === 'known' ? { only } : {}),
      ...(keys.length === 0 ? {} : { keys }),
      where: named.where ?? `rule.${rule}`,
      /* UNTRUSTED ALWAYS: a rule's meet reads its trigger's text, a mail's or a bank text's or an import's, so the
         guard holds whatever its `source` is worded as, and a key it already knows is still met as before. */
      untrusted: true,
    },
    { actor, project },
  );
  if (!met.ok) return { ok: false, say: `rule.${rule}'s meet at step ${n + 1} met nobody: ${fixOf(met)}` };
  if (met.value.mention === true)
    return {
      ok: true,
      person: null,
      said:
        met.value.question !== undefined
          ? 'Nobody added: they look like someone already known, and a question asks whether the new address is theirs.'
          : 'Nobody added: a name alone is kept until an address or a handle comes with it.',
    };
  const { person, created, merge } = met.value;
  /* THE NAME AND NOT THE ID, since the run's history is read by a person. */
  const who = met.value.row?.name || person;
  return { ok: true, person, said: `${who}${created ? ', added' : ''}${merge === null ? '' : ', and a question asks whether to merge them'}` };
}

/**
 * Queue the job a `run_job` step names, and answer its id.
 *
 * THE KIND IS NOT CHECKED HERE, `createJob` checks it: whether `job.<id>` is approved and not retired, and whether
 * `args` are the kind's own and each filled, change after install, so the run asks when it gets here, and a refusal
 * ends the run with `createJob`'s own sentence. A secret or file field is never handed to a job, whose arguments go to
 * the owner's machine and to a model; the lint refuses the spelling at install and this refuses it again.
 *
 * `about` IS THE RUN'S LIVE ROW, never one a delete left, since `createJob` refuses a row that is not there.
 */
function startJob(
  deps: FlowDeps,
  rule: string,
  step: Record<string, unknown>,
  n: number,
  subject: Entry | null,
  row: Entry | null,
  scope: Record<string, unknown>,
  by: RunFill,
  sealed: ReadonlySet<string>,
): { ok: true; job: string } | { ok: false; say: string } {
  const spec: Record<string, unknown> = isObject(step.run_job) ? step.run_job : {};
  const kind = typeof spec.kind === 'string' ? spec.kind : '';
  const args: Record<string, string> = {};
  for (const [name, text] of Object.entries(isObject(spec.args) ? spec.args : {})) {
    if (typeof text !== 'string' || nothingIn(text, scope, row)) continue;
    const filled = handedText(text, row, by, sealed, deps.nowMs);
    if (filled.secret !== null)
      return {
        ok: false,
        say: `rule.${rule}'s run_job at step ${n + 1} hands ${name} ${filled.secret}, which holds what a secret or file field holds, and such a field is copied only into another secret or file field; a job's arguments go to a machine and a model. Nothing was queued; the steps before it were taken.`,
      };
    args[name] = filled.text;
  }
  if (!deps.job) return { ok: false, say: `rule.${rule} reached a run_job step, and this host wired no way to queue a job (NOT_IN_THIS_BUILD). The steps before it were taken.` };
  const about = subject === null ? null : subject.seq === null ? subject.id : `${subject.register}#${subject.seq}`;
  const queued = deps.job({ kind, args, about });
  if (!queued.ok) return { ok: false, say: `rule.${rule} could not start ${kind || 'a job'} at step ${n + 1}: ${fixOf(queued)} Nothing was queued; the steps before it were taken.` };
  return { ok: true, job: queued.value.id };
}

/** The shapes an `ask_person` takes (`rules.ts`'s `AskShape`), by the word a step spells them with. */
const ASK_SHAPE_OF: Readonly<Record<string, AskShape>> = { choice: 'choice', amount: 'amount', number: 'number', text: 'text', date: 'date' };

/** The shape a step asks for, `choice` when it says none, `undefined` for a word that is not a shape. */
const shapeOf = (said: unknown): AskShape | undefined =>
  said === undefined ? 'choice' : typeof said === 'string' && Object.hasOwn(ASK_SHAPE_OF, said) ? ASK_SHAPE_OF[said] : undefined;

/** A currency's code as a step or a row may write it: three letters. */
const CODE = /^[A-Z]{3}$/;

/**
 * The code an `amount` question asks in: the step's own (`currency: EGP`), or the row's, read through one run path
 * (`currency: '{{trigger.row.currency}}'`) when the question is asked, a money field giving its own currency. `code` is
 * `undefined` when the step names none, and the person then says theirs in the answer. A path that reaches no code
 * is a sentence, because asking for an amount in a currency nobody knows would keep a figure no sum can read.
 */
function currencyOf(said: unknown, scope: Record<string, unknown>): { ok: true; code: string | undefined } | { ok: false; say: string } {
  if (said === undefined) return { ok: true, code: undefined };
  if (typeof said !== 'string') return { ok: false, say: 'in a currency that is not a code' };
  const text = said.trim();
  const path = new RegExp(`^${RUN_SPELL.source}$`).exec(text);
  if (path === null) {
    const code = text.toUpperCase();
    return CODE.test(code) ? { ok: true, code } : { ok: false, say: `in ${JSON.stringify(said)}, which is not a currency's code` };
  }
  const at = reached(scope, path[2]!, path[3]!);
  const held = isObject(at) && typeof at.currency === 'string' ? at.currency : typeof at === 'string' ? at : '';
  const code = held.trim().toUpperCase();
  return CODE.test(code) ? { ok: true, code } : { ok: false, say: `in the currency ${text} reads, and it reads no currency's code` };
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
): { ok: true; holds: string; waitMs: number; currency?: string } | { ok: false; say: string } {
  const spec = step[verb] as { question: string; options?: string[]; wait?: string; about?: string[]; shape?: string; choices?: string[]; to?: unknown; currency?: unknown };
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
    /* WHAT THE QUESTION ASKS FOR, read before anything is filed. A shape this build does not know, or a choice with
       fewer than two answers, would open a question nobody can answer right, so the run stops on a sentence instead;
       the lint refuses both at install, and this is the second line, for a rule written into the table. */
    const shape = shapeOf(spec.shape);
    if (shape === undefined)
      return { ok: false, say: `rule.${rule} asks a person for ${JSON.stringify(spec.shape)} at step ${n + 1}, and a question asks for a choice, an amount, a number, a text or a date.` };
    const options = spec.options ?? [];
    if (shape === 'choice' && (options.length < 2 || new Set(options).size !== options.length))
      return { ok: false, say: `rule.${rule} asks a person to choose at step ${n + 1} from ${options.length < 2 ? 'fewer than two answers' : 'the same answer twice'}. A choice is between at least two, each once.` };
    /* READ THROUGH THE CLEANED ROW, as the question is: the code is filed on the body everyone who decides reads. */
    const currency = shape === 'amount' ? currencyOf(spec.currency, scoped) : { ok: true as const, code: undefined };
    if (!currency.ok) return { ok: false, say: `rule.${rule} asks a person for an amount at step ${n + 1} ${currency.say}, so nothing was asked.` };
    const waitMs = intervalMs(spec.wait ?? ASK_PERSON_WAIT);
    if (waitMs === null) return { ok: false, say: `rule.${rule} waits ${JSON.stringify(spec.wait)} for an answer at step ${n + 1}, and a span is a number and one of m, h, d or w.` };
    /* `to:` PUTS THE QUESTION TO ONE MEMBER, by the id the record holds for them, filled from the run as the question
       is so that `{{trigger.row.owner}}` can name one. Asked here, when the run reaches the step, because who is a
       member changes after install: somebody removed or suspended since would be handed a question nobody may answer,
       as only they or an owner may (`govern.ts`'s `decide`). The sentence does not repeat the id, which is not a name
       a person reads. */
    const to = spec.to === undefined ? undefined : String(fill(spec.to, scope)).trim();
    if (to !== undefined) {
      const member = deps.sql.one<{ id: string }>(
        'SELECT m.person_id AS id FROM member m JOIN person p ON p.id = m.person_id WHERE m.person_id = ? AND p.suspended_at IS NULL LIMIT 1',
        to,
      );
      if (!member) return { ok: false, say: `rule.${rule} puts its question at step ${n + 1} to one member, and nobody this BrainDog holds by that id is a member now, so nothing was asked.` };
    }
    const opened = deps.ask(question, shape === 'choice' ? options : [], actor, {
      run,
      step: n,
      ...(to === undefined ? {} : { to }),
      shape,
      ...(currency.code === undefined ? {} : { currency: currency.code }),
    });
    if (!opened.ok) return { ok: false, say: `rule.${rule} could not ask its question at step ${n + 1}: ${fixOf(opened)}` };
    return { ok: true, holds: opened.value.id, waitMs, ...(currency.code === undefined ? {} : { currency: currency.code }) };
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
     queued without it ended its run on "no text", measured through the real kernel. */
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
export function answerStep(deps: FlowDeps, a: { run: string; step: number; by: string; answer?: AskAnswer; failed?: string }): Result<null> {
  const run = deps.sql.one<RunRow>('SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE id = ?', a.run);
  if (!run || run.state !== 'waiting' || run.step !== a.step) return ok(null);
  const row = deps.sql.one<{ kind: string; state: string; answer: string | null }>('SELECT kind, state, answer FROM automation_step WHERE run = ? AND n = ?', a.run, a.step);
  if (!row || row.state !== 'waiting' || row.answer !== a.by || (row.kind !== 'ask_person' && row.kind !== 'ask_slash' && row.kind !== 'call')) return ok(null);

  const stop = (say: string): Result<null> => {
    finish(deps, run, 'failed', say);
    record(deps, run.id, a.step, row.kind, 'failed', null);
    return ok(null);
  };
  if (a.failed !== undefined || a.answer === undefined)
    return stop(a.failed ?? `rule.${run.rule}'s ${row.kind === 'call' ? 'call' : 'question'} at step ${a.step + 1} came back with no answer.`);

  const decl = deps.trial ?? pinned(deps.sql, run.rule, run.version);
  const spec = (decl ? plan(decl.steps ?? decl.then)[a.step]?.step[row.kind] : undefined) as
    | { as?: string; shape?: string; choices?: string[]; options?: string[]; currency?: unknown }
    | undefined;
  /* A HOST'S ANSWER IS TEXT. Only a person's comes typed, so a call's or Slash's that is not text is read as its JSON. */
  const text = typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer);
  if (row.kind === 'call') return answerCall(deps, run, a.step, text, spec, stop);
  if (!spec || typeof spec.as !== 'string') return stop(`rule.${run.rule} version ${run.version} has no ask at step ${a.step + 1} to answer.`);

  /* SLASH'S TEXT IS HELD TO THE SHAPE THE STEP ASKED FOR. A person picks from the options, which `decide` has already
     held them to; a model writes whatever it writes, and a `number` that arrives as "about four" would reach an `if`
     that compares it as text and quietly takes the wrong arm. */
  const said = text.trim();
  let value: unknown = said;
  /* A PERSON'S ANSWER IS HELD TO THE SHAPE THE STEP ASKED FOR, and one of the wrong shape is refused to them with a
     sentence while the run keeps waiting: the person is still there to answer again, where Slash's wrong answer
     stops the run below. `-asked` is the currency the question was shown in (`ask`). */
  if (row.kind === 'ask_person') {
    const read = typedAnswer(spec, a.answer, unpack(run.vars).asked?.currency);
    if (!read.ok) return no('VALUE_MALFORMED', read.say, { at: 'answer' });
    value = read.value;
  }
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
  const written = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : JSON.stringify(value);
  if (written.length > VAR_BYTES) return stop(`The answer at step ${a.step + 1} of rule.${run.rule} runs to ${written.length} characters, and one answer holds ${VAR_BYTES}.`);
  /* AN ANSWER OVERWRITES WHAT WAS KEPT UNDER ITS NAME, since the variable now holds the answer and not the field it was
     set from, and a later question to Slash reading the kept dash would be asking about a value the run no longer has.
     A column with no `-sendable` is left with none, and `advance` rebuilds it with this answer's own step row in it. */
  const stored = unpack(run.vars);
  const vars = { ...stored.vars, [spec.as]: value };
  if (stored.kept) delete stored.kept[spec.as];
  const sealed = stored.sealed?.filter((name) => name !== spec.as) ?? null;
  if (JSON.stringify(vars).length > VARS_BYTES) return stop(`rule.${run.rule}'s answers passed ${VARS_BYTES} characters at step ${a.step + 1}.`);

  record(deps, run.id, a.step, row.kind, 'done', written);
  deps.sql.exec("UPDATE automation_run SET state = 'pending', step = ?, vars = ? WHERE id = ?", a.step + 1, pack(vars, stored.kept, stored.unsent, sealed), run.id);
  wake(deps, run.id, deps.nowMs);
  return ok(null);
}

/**
 * A person's answer to an `ask_person`, held to the step's shape: what it is kept as under `as`, or the sentence that
 * tells them why it was not taken.
 *
 * `choice` IS ONE OF THE OPTIONS, word for word, which is what `decide` hands on. `amount` IS KEPT IN MINOR UNITS WITH
 * ITS CODE (`amountOf`). `number` is a finite number, grouping commas allowed; `date` a real day as `YYYY-MM-DD`; `text`
 * a line of words, `ASK_TEXT_CHARS` at most. A step whose shape is not one of these never reached the queue (`ask`).
 */
function typedAnswer(spec: { shape?: string; options?: string[]; currency?: unknown }, answer: AskAnswer | undefined, asked: string | undefined): { ok: true; value: unknown } | { ok: false; say: string } {
  const shape = shapeOf(spec.shape);
  const words = typeof answer === 'string' ? answer.trim() : typeof answer === 'number' ? String(answer) : '';
  const shown = JSON.stringify(words.slice(0, 80));
  if (shape === 'amount') {
    const currency = asked ?? (typeof spec.currency === 'string' && CODE.test(spec.currency.trim().toUpperCase()) ? spec.currency.trim().toUpperCase() : undefined);
    return amountOf(answer, currency);
  }
  if (shape === 'number') {
    const n = typeof answer === 'number' ? answer : /^-?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(words) && /\d/.test(words) ? Number(words.replace(/,/g, '')) : NaN;
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, say: `${shown} is not a number. Type one, like 1250 or 12.5.` };
  }
  if (shape === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(words);
    const at = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    return at !== null && at.toISOString().slice(0, 10) === words ? { ok: true, value: words } : { ok: false, say: `${shown} is not a day. Type it as YYYY-MM-DD, like 2026-03-01.` };
  }
  if (typeof answer !== 'string') return { ok: false, say: 'The answer is not words. Type them.' };
  if (shape === 'text') {
    if (words === '') return { ok: false, say: 'The answer is empty. Type a line.' };
    return words.length > ASK_TEXT_CHARS ? { ok: false, say: `The answer runs to ${words.length} characters, and a line holds ${ASK_TEXT_CHARS}.` } : { ok: true, value: words };
  }
  /* HELD TRIMMED ON BOTH SIDES, as the answer always was, so an option typed with a space after it is still its own. */
  const options = (spec.options ?? []).map((o) => (typeof o === 'string' ? o.trim() : String(o)));
  return options.includes(words) ? { ok: true, value: words } : { ok: false, say: `${shown} is not one of the answers, which are ${options.join(', ')}.` };
}

/**
 * An amount a person gave, as money: `{ amount: <integer minor units>, currency }`.
 *
 * TYPED AS WORDS (`12.50`, `1,250.00`, `EGP 12.50`) OR HANDED AS MINOR UNITS by a screen that read them already
 * (`{ amount: 1250 }`). The currency is the one the question was asked in; an answer naming another is refused, since
 * two currencies are never added or converted, and with none asked the answer has to name its code. The currency's own
 * decimals and no more (`exponentOf`): `12.505` in a currency of two is refused rather than rounded, as an ingest
 * refuses it, because a rounded figure is a number nobody gave. Nought or more: a question asks how much, not who owes.
 */
function amountOf(answer: AskAnswer | undefined, asked: string | undefined): { ok: true; value: { amount: number; currency: string } } | { ok: false; say: string } {
  const ask = asked === undefined ? '' : ` in ${asked}`;
  const like = asked === undefined ? 'its three-letter code before the figure' : '1,250.00';
  if (isObject(answer)) {
    const code = typeof answer.currency === 'string' ? answer.currency.trim().toUpperCase() : asked;
    if (code === undefined || !CODE.test(code)) return { ok: false, say: `The amount names no currency. Say which, with ${like}.` };
    if (asked !== undefined && code !== asked) return { ok: false, say: `This asks for an amount${ask}, and the answer is in ${code}.` };
    if (!Number.isSafeInteger(answer.amount) || answer.amount < 0) return { ok: false, say: `The amount is not a whole count of the currency's smallest unit, nought or more.` };
    return { ok: true, value: { amount: answer.amount, currency: code } };
  }
  const words = typeof answer === 'string' ? answer.trim() : typeof answer === 'number' ? String(answer) : '';
  const shown = JSON.stringify(words.slice(0, 80));
  /* THE CODE MAY COME BEFORE THE FIGURE OR AFTER IT, `EGP 12.50` or `12.50 egp`, and never as a sign: `$` is five
     currencies. A code is three letters beside a figure, so words that are not an amount are told so. */
  const lead = /^([A-Za-z]{3})\s*([-−]?[\d.,]+)$/.exec(words);
  const trail = lead ? null : /^([-−]?[\d.,]+)\s*([A-Za-z]{3})$/.exec(words);
  const code = lead ? lead[1]!.toUpperCase() : trail ? trail[2]!.toUpperCase() : asked;
  const figure = lead ? lead[2]!.trim() : trail ? trail[1]!.trim() : words;
  if (code === undefined) return { ok: false, say: `${shown} names no currency. Say which, with ${like}.` };
  if (asked !== undefined && code !== asked) return { ok: false, say: `This asks for an amount${ask}, and ${shown} is in ${code}.` };
  if (figure.startsWith('-') || figure.startsWith('−')) return { ok: false, say: `${shown} is under nought. An amount here is nought or more.` };
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(figure);
  if (m === null) return { ok: false, say: `${shown} is not an amount. Type the figure${ask}${asked === undefined ? `, with ${like}` : `, like ${like}`}.` };
  const exp = exponentOf(code);
  const minorPart = m[2] ?? '';
  if (minorPart.length > exp)
    return { ok: false, say: `${code} has ${exp === 0 ? 'no' : exp} decimal place${exp === 1 ? '' : 's'}, and ${shown} has ${minorPart.length}. Type it without rounding.` };
  const amount = Number(m[1]!.replace(/,/g, '') + minorPart.padEnd(exp, '0'));
  if (!Number.isSafeInteger(amount)) return { ok: false, say: `${shown} is more than an amount can hold.` };
  return { ok: true, value: { amount, currency: code } };
}

/**
 * A call's answer, handed to the run waiting on it (`answerStep` above, for the ack of a `call` step's job).
 *
 * KEPT AS THE JSON IT CAME BACK AS, under `as:`, so `{{vars.a.rate}}` reads 48.5 from `{"rate":48.5}`; an answer that is
 * not JSON is kept as its text. HELD TO `VAR_BYTES` BEFORE IT IS READ, as every answer is, and past it the run stops with
 * the size in its sentence rather than keeping half a document. A step with no `as:` keeps nothing, and the run goes on.
 *
 * THE NAME IS TAKEN OFF WHAT IT HELD BEFORE (`-sealed`, `-sendable`), as an ask's answer takes it off: the variable now
 * holds what the provider said, not the secret a `set_var` of the same name may once have held, so a step after it
 * may write it and a question to Slash may carry it. What the call sent is the row's `sends:` fields alone, which
 * `queueCall` holds to the ones that may leave, so nothing the run holds as a secret reached the provider.
 */
function answerCall(deps: FlowDeps, run: RunRow, step: number, answer: string, spec: { as?: unknown } | undefined, stop: (say: string) => Result<null>): Result<null> {
  if (spec === undefined) return stop(`rule.${run.rule} version ${run.version} has no call at step ${step + 1} to answer.`);
  const stored = unpack(run.vars);
  let vars = stored.vars;
  let sealed = stored.sealed;
  if (typeof spec.as === 'string') {
    if (answer.length > VAR_BYTES) return stop(`rule.${run.rule}'s call at step ${step + 1} answered ${answer.length} characters, and one answer holds ${VAR_BYTES}.`);
    let value: unknown = answer;
    try {
      value = JSON.parse(answer);
    } catch {
      /* Text stays text: a provider that answers a word is read by its word. */
    }
    vars = { ...vars, [spec.as]: value };
    if (stored.kept) delete stored.kept[spec.as];
    sealed = sealed?.filter((name) => name !== spec.as) ?? null;
    if (JSON.stringify(vars).length > VARS_BYTES) return stop(`rule.${run.rule}'s answers passed ${VARS_BYTES} characters at step ${step + 1}.`);
  }
  record(deps, run.id, step, 'call', 'done', answer.slice(0, VAR_BYTES));
  deps.sql.exec("UPDATE automation_run SET state = 'pending', step = ?, vars = ? WHERE id = ?", step + 1, pack(vars, stored.kept, stored.unsent, sealed), run.id);
  wake(deps, run.id, deps.nowMs);
  return ok(null);
}

/**
 * Let go of what a run's waiting ask still holds, as the run ends: the question comes out of the queue, and a Slash
 * job nobody has leased yet comes out of the outbox.
 *
 * WITHOUT THIS A CANCELLED RUN LEFT ITS QUESTION OPEN, and the person who answered it a day later was answering
 * nothing: `answerStep` reads the run as over and the pick goes nowhere. A job a host already holds is left to its ack,
 * for the reason `answerStep` gives, and the ack finishes it: `outbox.ts`'s failed branch reads this run and its step
 * row, and a job whose run is no longer waiting on it is marked `done` with no `retry`, so a question out when its rule
 * stopped is asked once and not eight times. The step row is left `waiting` here, so the ack reads the run's own state
 * as well. The Slash job is deleted rather than marked `done`, because nothing was delivered, and its `retry` row goes
 * with it.
 */
function release(deps: FlowDeps, run: RunRow, say: string | null): void {
  const held = deps.sql.all<{ kind: string; answer: string | null }>(
    "SELECT kind, answer FROM automation_step WHERE run = ? AND state = 'waiting' AND kind IN ('ask_person', 'ask_slash', 'call')",
    run.id,
  );
  for (const h of held) {
    if (h.answer === null) continue;
    if (h.kind === 'ask_person') deps.withdraw(h.answer, `rule:${run.rule}`, say ?? `rule.${run.rule}'s run ended before this was answered.`);
    else {
      /* A CALL NOBODY HAS SENT YET GOES THE SAME WAY AS A QUESTION NOBODY HAS ASKED: its post would answer a run that is
         over. One a host holds is left to its ack, which finds the run no longer waiting and retries nothing
         (`outbox.ts`). */
      deps.sql.exec("DELETE FROM outbox WHERE id = ? AND kind = ? AND state IN ('pending', 'failed')", h.answer, h.kind === 'call' ? 'pull.fetch' : 'infer.ask');
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

/**
 * Start a finished run again: a new run of the rule as it is installed now, with the trigger the first one had.
 *
 * THE SAME TRIGGER, ITS TURN INCLUDED, so a clock's turn tried again is that turn (a `create` keyed on it finds the row
 * the first run made, and makes none twice), and a written row's run reads that row as it stands now. The chain a
 * script's write started it in is not carried: this run is somebody's press, not a write under that chain. The version
 * is today's, since the point of trying again is usually that the rule was mended; `startRun` asks whether it is on and
 * under its day's ceiling, as for any start, and the run is armed for the next drain.
 *
 * ONLY A RUN THAT HAS FINISHED. One still going is cancelled first or left to finish; trying it again beside itself
 * would be two runs taking the same steps on the same row.
 */
export function retryRun(deps: FlowDeps, id: string, actor: string): Result<{ run: string }> {
  const run = deps.sql.one<RunRow>('SELECT id, rule, version, trigger, state, step, vars, depth, project, actor FROM automation_run WHERE id = ?', id);
  if (!run) return no('OUT_OF_BOUNDS', `There is no run ${id}.`, { at: 'run' });
  if (run.state === 'pending' || run.state === 'running' || run.state === 'waiting')
    return no('TRANSITION_ILLEGAL', `Run ${id} of rule.${run.rule} is still ${run.state}. Cancel it first, or let it finish.`, { at: 'run', allowed: ['done', 'failed', 'cancelled'] });
  const rule = installed(deps.sql).find((r) => r.id === run.rule);
  if (!rule) return no('DECLARATION_UNKNOWN', `rule.${run.rule} is not installed as an automation that runs as a run any more, so its run cannot be started again.`, { at: 'run' });
  let trigger: RunTrigger;
  try {
    trigger = JSON.parse(run.trigger) as RunTrigger;
  } catch {
    return no('VALUE_MALFORMED', `Run ${id} of rule.${run.rule} kept no trigger this build can read, so it cannot be started again.`, { at: 'run' });
  }
  const { chain: _chain, ...same } = trigger;
  return startRun(deps, rule, same, { actor });
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

/**
 * `{{trigger.…}}`: what started the run, the instant of its turn and that turn's day, the row's fields, and an arrival's
 * JSON body where it has one.
 *
 * `day` IS THE DATE OF THE TURN IN THE RECORD'S ZONE, `YYYY-MM-DD`, which is what a `day` field takes. Before it, a task a
 * monthly rule made had no due day, since nothing a run fills said which day it was, and `{{trigger.at}}` would not do:
 * it is an instant, which a `day` field refuses, and its UTC date is the next day wherever the zone is behind UTC in the
 * evening (`clock-create.test.ts` takes a turn at 20:00 in Los Angeles). Worked out here and never stored, so the zone
 * is the record's as the step is filled, as every other day the record writes is (`finished.ts`'s `dayIn`).
 */
function context(deps: FlowDeps, trigger: RunTrigger, subject: Entry | null): Record<string, unknown> {
  const { chain: _chain, ...said } = trigger;
  const out: Record<string, unknown> = { ...said };
  const turn = trigger.at === undefined ? NaN : Date.parse(trigger.at);
  if (Number.isFinite(turn)) out.day = dayIn(turn, deps.tz);
  if (subject) out.row = subject.fields;
  /* A RUN BOUND TO A MOVED-DOWN MAKER'S LENS READS NO MORE THROUGH ITS TRIGGER than through its steps: an arrival is the
     owner's inbox and a figure's value is read over the whole list, so both are withheld as `{{metric.*}}` is. */
  if (deps.bounded !== undefined) {
    if (trigger.value !== undefined) out.value = WITHHELD;
    if (trigger.arrival) out.body = WITHHELD;
    return out;
  }
  if (trigger.arrival) {
    const raw = deps.sql.one<{ body: string | null; channel: string; headers: string | null }>('SELECT body, channel, headers FROM inbox_raw WHERE id = ?', trigger.arrival);
    let body: unknown = raw?.body ?? null;
    try {
      body = typeof body === 'string' ? JSON.parse(body) : body;
    } catch {
      /* Text stays text. An SMS is read by its words, and only JSON has paths. */
    }
    /* A MAIL IS READ IN THE PARTS A PATTERN MATCHES IT BY (`ingest.ts`'s match fields): `from` word for word, the
       sender read once into `from_name`, `from_address` and `from_domain`, `to`, `subject`, and its words as `body`.
       As text it had no paths, so `{{trigger.body.from_address}}` filled with nothing and the People rule meeting
       whoever writes in met nobody on every mail. */
    if (raw?.channel === 'email' && (body === null || typeof body !== 'object')) body = mailParts(raw.headers, typeof body === 'string' ? body : '');
    out.body = body;
  }
  return out;
}

/** A mail as the run reads it, from the headers its arrival kept and its words. */
function mailParts(headers: string | null, text: string): Record<string, string> {
  let held: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(headers ?? '{}') as unknown;
    if (isObject(parsed)) held = parsed;
  } catch {
    /* headers nobody can read say nothing */
  }
  const header = (name: string): string => (typeof held[name] === 'string' ? (held[name] as string) : '');
  const sender = senderOf(header('from'));
  return {
    from: header('from'),
    from_name: sender.name,
    from_address: sender.address,
    from_domain: sender.domain,
    to: header('to'),
    subject: header('subject'),
    body: text,
  };
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
 * same `replace` as the paths beside it and nothing one wrote is read again as the other. Groups 1 to 4 are a path's
 * form, head, path and `or` words (`rules.ts`'s `RUN_SPELL`), 5 and 6 a figure's head and id.
 */
const RUN_READ = new RegExp(`${RUN_SPELL.source}|${FIGURE.source}`, 'g');

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
    /* A RUN BOUND TO A COLLEAGUE'S LENS IS SHOWN NO FIGURE: one adds up its lists whole, past what they may read. */
    if (deps.bounded !== undefined) return WITHHELD;
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
 * Whether one of `lands` is a list other than the one figure `id` adds up, so that the figure is withheld.
 *
 * MEASURED BEFORE THIS (`figure-privacy.test.ts`): an owner's rule on each new Inbox row set its note to
 * `filed; payroll {{metric.payroll}}`, over a figure summing Salaries. A member invited to Inbox alone is refused
 * `payroll` by the record as a figure that does not exist, and her own Inbox read `filed; payroll GBP 5200.00`. The
 * figure was read with the run's context and nobody was asked who would read where it landed.
 *
 * THE SAME QUESTION THE RECORD ASKS HER, ONE FIGURE WIDE. Its `metric` refuses a figure over a list she does not read
 * (`packages/record/src/index.ts`, "the same leak one number wide"), and reads nothing else of it, so this asks of the
 * figure's `source` alone. A figure over no list, a `series.`, is read by whoever reads a page, and is not hidden.
 *
 * NOT WHO IS A MEMBER AT THE RUN, WHICH WAS THE FIRST REPAIR, BECAUSE THE ROW OUTLIVES THE RUN. The first form asked
 * the `member` rows when the figure was filled, and that held for every note written after an invitation and for none
 * written before it: `figure-privacy-before.test.ts` filed one Inbox row, invited Bea to Inbox alone, and she read
 * `filed; payroll GBP 5200.00` in it. A script whose `reads:` names Inbox and not Salaries was never asked either, and
 * it may send what it reads out through its `egress:`.
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
 * reason `fill` writes one: a sentence with a hole in it reads as a bug, unless the path says `or "words"`, which are
 * written instead. The pattern is `rules.ts`'s `RUN_SPELL`, `flow-lint.ts`'s `RUN_PATH` with its `money:` form and its
 * `or`, and `figure.ts`'s `FIGURE` beside it.
 */
function fill(x: unknown, scope: Record<string, unknown>): unknown {
  if (typeof x === 'string')
    return x.replace(RUN_READ, (_whole, form?: string, head?: string, path?: string, words?: string, figHead?: string, id?: string) =>
      head !== undefined ? pathValue(scope, head, path!, runSaid(form, words)) : pathValue(scope, figHead!, id!),
    );
  if (Array.isArray(x)) return x.map((v) => fill(v, scope));
  if (isObject(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fill(v, scope)]));
  return x;
}

/**
 * What one `{{vars.…}}`, `{{trigger.…}}` or `{{metric.…}}` path is written as. A figure's id is one word with hyphens in
 * it and no dots, so it is handed to the scope's reader whole rather than walked; a scope with no reader writes the dash.
 *
 * `or "words"` IS WHAT A PATH THAT REACHES NOTHING IS WRITTEN AS, in place of the dash: `{{trigger.row.note or "no
 * note"}}` over an empty note writes `no note`, and a note that says something writes what it says. A path with no
 * `or` writes the dash as it always did. `{{money:vars.x}}` writes an amount (`{ amount, currency }`, what an
 * `ask_person` of `shape: amount` keeps) through the kernel's one `moneyText`, and anything else as the bare path would.
 */
function pathValue(scope: Record<string, unknown>, head: string, path: string, said: RunSaid = {}): string {
  if (head === 'metric') return typeof scope.metric === 'function' ? (scope.metric as (id: string) => string)(path) : '—';
  const at = reached(scope, head, path);
  if (hole(at)) return said.or ?? '—';
  if (said.form === 'money' && soundMoney(at)) return moneyText(at.amount, at.currency);
  return typeof at === 'object' ? JSON.stringify(at) : String(at);
}

/** Whole minor units and a code: the money a fill may write as money, and nothing that only has the two keys. */
const soundMoney = (v: unknown): v is { amount: number; currency: string } =>
  isObject(v) && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency);

/** What one `{{vars.…}}` or `{{trigger.…}}` path reaches in `scope`, walked as `pathValue` walks it. */
function reached(scope: Record<string, unknown>, head: string, path: string): unknown {
  let at: unknown = scope[head];
  for (const part of path.split('.')) at = isObject(at) ? at[part] : Array.isArray(at) ? at[Number(part)] : undefined;
  return at;
}

/** What a fill writes the dash for. */
const hole = (at: unknown): boolean => at === undefined || at === null || at === '';

/**
 * Every spelling a text a run writes can hold, in the pass's order (`rules.ts`'s `SPELLED`): a run path (groups 1 to
 * 4, its form, head, path and `or` words), a figure (5 and 6), a create's tuple, and the row's `{{field}}`,
 * `{{kind:field}}` or `{{kind:field-other}}` (7, 8 and 9), the last being one money field less another.
 */
const SPELLING = new RegExp(`${RUN_SPELL.source}|${FIGURE.source}|\\{\\{each\\.\\d\\}\\}|\\{\\{(\\w+)(?::(\\w+)(?:-(\\w+))?)?\\}\\}`, 'g');

/**
 * Whether `text` is spellings that each reach nothing and white space between them, so that filling it would write
 * the dash and nothing else. `row` is the row its `{{field}}`s are filled from, or `null` where nothing fills them.
 *
 * THE DASH IS FOR A HOLE IN A SENTENCE, NOT FOR A WHOLE VALUE. `Paid {{vars.x}}` with nothing in `x` writes `Paid —`,
 * because `Paid ` alone reads as a bug. A text that is nothing but the hole has no sentence around it, and writing the
 * dash there wrote a value where there was none: measured, a `set` from `{{trigger.row.note}}` over an empty note wrote
 * the memo as `—`, and a `packs/pad` question acked `done` with empty text set the note's reply to `—` with `once_per`
 * then never asking again. (`packages/slash`'s own pass refuses a blank answer before it acks, so that second one
 * reaches a record only through a host that acks the outbox itself.) A `day` field refuses the dash, so a `create`
 * whose due day filled with nothing failed its run instead of leaving the day blank (`flow-empty-answer.test.ts`).
 *
 * A FIGURE, A TUPLE, AN `{{id}}` AND A ROW'S FIELD WITH NO ROW ARE NEVER NOTHING HERE: a figure writes its words or
 * `WITHHELD`, a tuple is filled by the create, the id always holds something, and a field with no row is refused by
 * the create in a sentence of its own, which this leaves to say so.
 */
function nothingIn(text: string, scope: Record<string, unknown>, row: Entry | null): boolean {
  let spelled = false;
  for (const m of text.matchAll(SPELLING)) {
    spelled = true;
    if (m[2] !== undefined) {
      /* WORDS AFTER `or` ARE SOMETHING, so a text that is only `{{trigger.row.note or "no note"}}` writes them. */
      if (m[4] !== undefined && runSaid(undefined, m[4]).or !== '') return false;
      if (!hole(reached(scope, m[2], m[3]!))) return false;
      continue;
    }
    const head = m[7];
    /* A SECOND FIELD AFTER A FORM THAT DOES NOT SUBTRACT IS WORDS, left as typed by the pass (`flow-lint.ts`'s
       `asTyped`), so the text holds something. Where the form subtracts, nothing in the first field writes the dash
       whatever the second holds, which is the question asked of field 8 below. */
    if (m[9] !== undefined && asTyped(m)) return false;
    if (head === undefined || head === 'id' || row === null || !hole(row.fields[m[8] ?? head])) return false;
  }
  return spelled && text.replace(SPELLING, '').trim() === '';
}

/** A text a run keeps (a `set_var`), filled as `fill` fills it, and empty where it filled with nothing (`nothingIn`). */
const varText = (text: string, scope: Record<string, unknown>): string => (nothingIn(text, scope, null) ? '' : String(fill(text, scope)));

/**
 * The step as a run takes it: a `set` whose `to`, or a `create` field whose text, would fill with nothing is written
 * as nothing (`nothingIn`). The `set` writes the field empty rather than skipping it, because the rule said what the
 * field is and what it is is nothing; a stale value left in its place would say the rule wrote it. A `create` leaves
 * the field out, and a required one is then refused by the list in its own words rather than holding a dash.
 *
 * THE EMPTY `set` CLEARS A TEXT FIELD AND NOTHING ELSE. Measured: a `set` of a `day` field from nothing still fails the
 * run (`due takes a day, as YYYY-MM-DD`), as it did on the dash, and a `money` one fails the same way, so those two are
 * no worse and no better. And a `create` whose required title filled from an empty field used to make a row titled `—`
 * and now fails the run on `tasks needs what.`, which is the refusal meant.
 */
function emptied(verb: string, step: Record<string, unknown>, scope: Record<string, unknown>, row: Entry | null): Record<string, unknown> {
  if (verb === 'set' && isObject(step.set) && typeof step.set.to === 'string' && nothingIn(step.set.to, scope, row)) return { ...step, set: { ...step.set, to: '' } };
  if (verb !== 'create' || !isObject(step.create) || !isObject(step.create.fields)) return step;
  const fields = Object.entries(step.create.fields);
  const left = fields.filter(([, t]) => !(typeof t === 'string' && nothingIn(t, scope, row)));
  return left.length === fields.length ? step : { ...step, create: { ...step.create, fields: Object.fromEntries(left) } };
}

/** The run's paths as the pass is handed them, from `scope`, saying of none that it reaches a secret. */
const pathsOf = (scope: Record<string, unknown>): RunFill => ({ value: (head, path, said) => pathValue(scope, head, path, said), sealed: () => false });

/**
 * The run's paths as a step that writes is handed them, saying which reach a value a secret or file field gave: a
 * variable in `tainted` that holds something, `{{trigger.row.pin}}` where `pin` never leaves and holds something, and
 * `{{trigger.row}}` where any such field of the row holds something.
 *
 * BY WHERE THE PATH GOES, NEVER BY WHAT IT HOLDS, and by the declared types alone. A first attempt compared the step
 * filled from the row with the step filled from `sendable`'s row, which also drops every field the live list does not
 * declare. Measured with that attempt applied to `afb3b1b2`: on Jobs, a list declaring no secret field, a `note` of
 * `x {{trigger.row.what}} {{vars.v}}` failed "would copy what old holds", because `v` was set from `{{trigger.row}}`
 * and the row carried a value under `old`, a field the list no longer declares. Such a value has no type saying it may
 * not leave, so a question to Slash goes without it, and a note the list's own readers see may carry it. Comparing
 * words would be no better: a `note` that happens to say what `pin` says is not a copy.
 */
function sealedPaths(scope: Record<string, unknown>, row: Entry | null, fields: ReadonlySet<string>, tainted: ReadonlySet<string>): RunFill {
  const vars = scope.vars as Vars;
  return {
    value: (head, path, said) => pathValue(scope, head, path, said),
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
      return v.replace(RUN_READ, (whole: string, form?: string, runHead?: string, runPath?: string, words?: string, figHead?: string, id?: string) => {
        const [head, p] = runHead !== undefined ? [runHead, runPath!] : [figHead!, id!];
        if (by.sealed(head, p)) secret ??= whole;
        return runHead !== undefined ? by.value(head, p, runSaid(form, words)) : by.value(head, p);
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
  for (const m of text.matchAll(RUN_READ)) if (by.sealed(m[2] ?? m[5]!, m[3] ?? m[6]!)) return m[0];
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

/**
 * A `when:` on an arrival that wrote no row, read over the top-level keys of its JSON body: each key a value of the
 * type it holds, as `test` types a run's answers. A body that is not a JSON object has no keys, and holds nothing.
 *
 * ONLY THE TOP LEVEL, AND ONLY WHAT IS TEXT, A NUMBER, TRUE OR FALSE, because the sentence builder reads fields, and a
 * nested object has no sentence a person would write about it; `{{trigger.body.<path>}}` in an `if` step reads deeper.
 */
function bodyHolds(deps: FlowDeps, when: string | Predicate, raw: string): boolean {
  const text = deps.sql.one<{ body: string | null }>('SELECT body FROM inbox_raw WHERE id = ?', raw)?.body;
  let body: unknown = null;
  try {
    body = typeof text === 'string' ? JSON.parse(text) : null;
  } catch {
    return false;
  }
  if (!isObject(body)) return false;
  const keys: Vars = {};
  for (const [key, value] of Object.entries(body))
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') keys[key] = value;
  const said = test(deps, when, null, keys);
  return said.bad === undefined && said.yes;
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

/**
 * Why the live rule would not start for `trigger`, or `null` where it would: its `project:` and its `when:`, read as
 * `onWritten`, `onArrival` and `onDecided` read them.
 *
 * FOR A TRY AND NOTHING ELSE (`flow-try.ts`). A try hands the runner a sample, and without this the Try panel would
 * show steps taken for a row the live rule skips. The trigger's own keys (`op:`, `fields:`, `channel:`) are not read
 * here, because the try builds its trigger from the body and they hold by construction.
 */
export function wouldSkip(deps: FlowDeps, body: FlowDecl, trigger: RunTrigger): string | null {
  const row = trigger.entry === undefined ? null : deps.entry(trigger.entry);
  const reads = trigger.kind === 'written' || trigger.kind === 'arrival' || trigger.kind === 'decided';
  if (reads && body.project !== undefined && (row === null || deps.projectOf(row) !== body.project))
    return `The live rule would not start for this sample, because it is not in project ${body.project}.`;
  if (body.when === undefined || (trigger.kind !== 'written' && trigger.kind !== 'arrival')) return null;
  const yes = row ? holds(deps, body.when, row) : trigger.arrival !== undefined && bodyHolds(deps, body.when, trigger.arrival);
  return yes ? null : 'The live rule would not start for this sample, because its when: does not hold for it.';
}

