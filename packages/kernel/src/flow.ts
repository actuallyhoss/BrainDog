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
 * WHAT WAITS ON SOMEBODY ELSE IS NOT IN THIS BUILD. `call`, `script`, `ask_spark` and `ask_person` hand off and come
 * back through machinery Brief C adds; until then a run that reaches one fails there with a sentence, and the lint
 * already lets them install so that the canvas can draw them.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import { compile, evaluate, type Predicate, type Schema } from '@braindog/where';

import { meter, type Metered } from './actions.ts';
import { nextOccurrence } from './digest.ts';
import { RUNS_PER_DAY_CEILING, pathOf, triggerOf } from './flow-lint.ts';
import type { Entry } from './index.ts';
import { instant } from './migrate.ts';
import { predicateOf, type EvalContext } from './metrics.ts';
import { intervalMs } from './pull.ts';
import { marker, onceKey, runRules, type FlowDecl, type RuleAction, type RuleDecl, type RulesDeps, type Trigger } from './rules.ts';

/** Three, as §4.1 says: a run started by a rule's write carries its depth plus one, and the fourth is not started. */
export const CHAIN_CEILING = 3;
/** §3's `RunContext`: one answer is at most 4 KB and all of them together 64 KB. */
const VAR_BYTES = 4096;
const VARS_BYTES = 65_536;
/** A finished run older than this goes in the hourly sweep. Its metered `pull` event stays, which is its one line. */
export const KEEP_RUNS_MS = 90 * 86_400_000;
const DAY_MS = 86_400_000;

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
};

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
 * under it. `advance` asks the same question at every wake as well, because a pack turned off retires its rules in
 * `declare.ts` and not through the kernel's `retire`, and that path does not come through here.
 */
export function cancelRunsOf(deps: FlowDeps, rule: string): number {
  const say = stopped(deps.sql, rule);
  if (say === null) return 0;
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
  'if', 'set_var', 'script', 'call', 'ask_spark', 'ask_person', 'wait',
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
 */
export function onWritten(
  deps: FlowDeps,
  rules: readonly Installed[],
  w: { entry: Entry; register: string; op: 'create' | 'update' | 'delete'; changed: readonly string[]; byRule: boolean; depth: number; actor: string },
): void {
  for (const rule of rules) {
    if (triggerOf(rule.body) !== 'written') continue;
    const spec = (rule.body.on as Extract<Trigger, { written: unknown }>).written;
    if (spec.register !== w.register) continue;
    if (w.byRule && spec.from_rules !== true) continue;
    if (w.depth > CHAIN_CEILING) continue;
    if (spec.op !== undefined && !spec.op.includes(w.op)) continue;
    if (spec.fields !== undefined && w.op !== 'delete' && !spec.fields.some((f) => w.changed.includes(f))) continue;
    if (rule.body.project !== undefined && deps.projectOf(w.entry) !== rule.body.project) continue;
    if (rule.body.when !== undefined && !holds(deps, rule.body.when, w.entry)) continue;
    const key = rule.body.once_per?.length ? onceKey({ rule: rule.id, once_per: rule.body.once_per } as RuleDecl, w.entry) : null;
    if (key !== null && !marker(deps.sql, deps.mint, deps.nowMs, key, { rule: rule.id, entry: w.entry.id }, false)) continue;
    /* A REFUSAL HERE IS THE DAY'S CEILING OR A SWITCHED-OFF RULE, and neither is the writer's fault: the write stands.
       The marker goes back, as the inline pass gives one back for a rule that did nothing, or the row would be
       counted as run for ever by a run that never started. */
    const trigger: RunTrigger = { kind: 'written', entry: w.entry.id, register: w.register, op: w.op, ...(w.op === 'delete' ? { deleted: true as const } : {}) };
    const started = startRun(deps, rule, trigger, { actor: w.actor, depth: w.depth });
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
  const vars = JSON.parse(run.vars) as Vars;
  let subject = trigger.entry ? deps.entry(trigger.entry) : null;
  /* WHAT A STEP READS AND WHAT IT WRITES ARE TWO ROWS WHEN A DELETE STARTED THE RUN. Its conditions and templates read
     the row as it was deleted, which is what the rule was written about; its writes get `subject`, which is `null`,
     so a `set` on a deleted row fails with a sentence rather than bringing the row back. */
  const last = subject === null && trigger.deleted === true && trigger.entry ? deletedRow(deps.sql, trigger.entry) : null;
  const read = (): Entry | null => subject ?? last;
  const actor = `rule:${run.rule}`;
  const scope = () => ({ vars, trigger: context(deps, trigger, read()) });
  deps.sql.exec("UPDATE automation_run SET state = 'running' WHERE id = ?", id);

  const fail = (n: number, kind: string, say: string): null => {
    record(deps, id, n, kind, 'failed', null);
    finish(deps, { ...run, step: n }, 'failed', say, vars);
    return null;
  };

  /* WHERE THE RUN IS, SAVED AFTER EVERY STEP THAT IS DONE. This was written only at a wait and at the end, so a run that
     stopped between two steps started again from its last wait and took every step since a second time: audit
     thirty-three §1 counted six notifies in twelve hours from one row. A step that finished is never taken again. */
  const saved = (next: number): number => {
    deps.sql.exec('UPDATE automation_run SET step = ?, vars = ? WHERE id = ?', next, JSON.stringify(vars), id);
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
        deps.sql.exec("UPDATE automation_run SET state = 'waiting', step = ?, vars = ? WHERE id = ?", i, JSON.stringify(vars), id);
        return deps.nowMs + ms;
      }

      if (op.verb === 'set_var') {
        const spec = step.set_var as { name: string; to: string };
        const value = String(fill(spec.to, scope()));
        if (value.length > VAR_BYTES) return fail(i, 'set_var', `rule.${run.rule} sets ${spec.name} to ${value.length} characters, and one answer holds ${VAR_BYTES}.`);
        vars[spec.name] = value;
        if (JSON.stringify(vars).length > VARS_BYTES) return fail(i, 'set_var', `rule.${run.rule}'s answers passed ${VARS_BYTES} characters at step ${i + 1}.`);
        record(deps, id, i, 'set_var', 'done', value);
        i = saved(i + 1);
        continue;
      }

      if (op.verb === 'call' || op.verb === 'script' || op.verb === 'ask_spark' || op.verb === 'ask_person')
        return fail(
          i,
          op.verb,
          `rule.${run.rule} reached a ${op.verb} step, and a step that waits on ${op.verb === 'call' ? 'a call' : op.verb === 'script' ? 'a script' : op.verb === 'ask_spark' ? 'Spark' : 'a person'} is not in this build (NOT_IN_THIS_BUILD). The steps before it were taken.`,
        );

      const acted = act(deps, run.rule, op.verb, fill(step, scope()) as RuleAction, subject, id, actor, subject === null ? last : null);
      if (!acted.ok) return fail(i, op.verb, acted.say);
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
    { entry: subject, register: subject.register, batch, actor },
  );
  const first: Refusal | undefined = out.refused[0];
  if (first) return { ok: false, say: first.fix };
  const call = out.calls[0];
  if (call && call.outcome !== 'queued') return { ok: false, say: call.say };
  return { ok: true, stop: out.stopped, answer: call ? call.outcome : null };
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
  const out: Record<string, unknown> = { ...trigger };
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

const PATH = /\{\{\s*(vars|trigger)\.([A-Za-z0-9_.]+)\s*\}\}/g;

/**
 * `{{vars.x}}` and `{{trigger.row.amount}}`, filled in every string of a step, before the pass fills the row's own
 * `{{field}}`s. A path that reaches nothing is an em dash for the same reason `fill` writes one: a sentence with a
 * hole in it reads as a bug.
 */
function fill(x: unknown, scope: Record<string, unknown>): unknown {
  if (typeof x === 'string')
    return x.replace(PATH, (_whole, head: string, path: string) => {
      let at: unknown = scope[head];
      for (const part of path.split('.')) at = isObject(at) ? at[part] : Array.isArray(at) ? at[Number(part)] : undefined;
      if (at === undefined || at === null || at === '') return '—';
      return typeof at === 'object' ? JSON.stringify(at) : String(at);
    });
  if (Array.isArray(x)) return x.map((v) => fill(v, scope));
  if (isObject(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fill(v, scope)]));
  return x;
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

