/**
 * Try an automation before anybody installs it: its steps taken by the real runner over a sample, and an account of
 * each step handed back (`loop/finish/shell.md` §4.0, `tryAutomation`; `loop/finish/contracts.md` §2.2).
 *
 * THE REAL RUNNER AND NOT A SECOND ONE. A try that walked the steps with its own reading of them would say what a
 * second engine does, and the first time the two disagreed the owner would install a rule the try had passed. So this
 * opens a run row (`flow.ts`'s `openRun`) and hands it to `advance`, with the body as `FlowDeps.trial` in place of an
 * installed version. Every step meets the write path, the transitions, the copy check and the capability table as a
 * live run's does.
 *
 * NOTHING HERE STOPS A WRITE. The caller runs this inside the kernel's `rehearse` (`api/rehearse.ts`), which rolls back
 * every row, event, outbox job and schedule row the try made, and that is the whole of why nothing is sent: a call, a
 * script, a question and a notice are all rows the outbox or the queue would have taken, and none of them outlives the
 * rollback. This file only reads back what the run wrote before the rollback takes it.
 *
 * THE TRY STOPS WHERE A LIVE RUN WOULD PARK. A `wait`, a question or a call leaves the run waiting on something that
 * will not come inside one rehearsal, and the steps after it are listed as not reached, with the step that stopped the
 * try named in their sentence.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { advance, openRun, plan, sealedOfRun, wouldSkip, type FlowDeps, type Installed, type Op, type RunTrigger, type Side } from './flow.ts';
import { pathOf, subjectOf, triggerOf } from './flow-lint.ts';
import type { Entry, Patch } from './index.ts';
import { instant } from './migrate.ts';
import type { FlowDecl, Trigger } from './rules.ts';

/** What a try is given to start from: a row, an arrival, a payload for the trigger, and the instant of its turn. */
export type TrySample = { row?: unknown; arrival?: unknown; payload?: unknown; at?: unknown };

/**
 * One step as the try took it.
 *
 * `would` IS A STEP THAT REACHES OUTSIDE THE RECORD OR PUTS SOMETHING IN FRONT OF A PERSON: a call, a script, a
 * question, a notice, another rule's run. The runner took it as far as queueing it, and the queue went with the
 * rollback. `done` is a step that went through inside the rehearsal (a `set`, a `create`, an `if`), and `skipped` is one
 * the run never reached.
 */
export type TriedStep = { path: string; verb: string; state: 'done' | 'would' | 'waiting' | 'failed' | 'skipped'; answer?: string; say: string };

export type Tried = { trigger: Omit<RunTrigger, 'chain'>; steps: TriedStep[] };

/**
 * The verbs a try reports as `would`.
 *
 * `suggest` IS NOT ONE, though it too puts a question on the queue. It is a write of the record's own, with no run
 * waiting on it and nothing sent, and a try that called it `would` would say a create was different in kind.
 */
const REACHES_OUT = new Set(['call', 'script', 'ask_person', 'ask_slash', 'notify', 'run', 'run_job']);

/**
 * What an answer read from a variable set from a secret or file field says in its place.
 *
 * THE SAME SPELLING AS THE HISTORY'S OWN REDACTION (`index.ts`, `REDACTED`), so a reader who has met one knows the
 * other. A try is read by whoever may edit an automation, and a variable filled from `{{trigger.row.pin}}` holds the pin;
 * the step's answer is what the defects list names as the new sink (`loop/finish/defects.md` §5.2, AUT-2).
 */
const SEALED_SAID = '--redacted--';

/**
 * Take `body`'s steps over `trigger` and say what each did.
 *
 * `deps` MUST CARRY `trial: body`, so the runner reads the steps from the body and asks no installed version whether it
 * is live. It is asked for here rather than set here, so that the caller builds the dependencies once and this file
 * cannot hand the runner a body other than the one it reports on.
 */
export function tryRun(deps: FlowDeps, body: FlowDecl, trigger: RunTrigger, actor: string): Result<Tried> {
  if (deps.trial !== body) return no('VALUE_MALFORMED', 'A try hands the runner the body it reports on, and these dependencies carry another.', { at: 'body' });
  const rule: Installed = { id: String(body.rule), version: 0, body };
  /* A SAMPLE THE LIVE RULE WOULD PASS OVER STARTS NO RUN HERE EITHER, and every step says why, so the panel never shows
     steps taken for a row the rule skips. */
  const skip = wouldSkip(deps, body, trigger);
  if (skip !== null) {
    const { chain: _chain, ...asked } = trigger;
    const steps = plan(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then')
      .filter((op) => op.verb !== 'jump')
      .map((op): TriedStep => ({ path: op.at, verb: op.verb, state: 'skipped', say: skip }));
    return ok({ trigger: asked, steps });
  }
  const id = openRun(deps, rule, trigger, { actor });
  /* ONE CALL, NOT A LOOP. `advance` takes steps until the run finishes or parks, and a park is where the try stops. */
  advance(deps, id);

  const run = deps.sql.one<{ state: string; say: string | null; trigger: string }>('SELECT state, say, trigger FROM automation_run WHERE id = ?', id);
  const rows = deps.sql.all<{ n: number; kind: string; state: string; answer: string | null }>(
    'SELECT n, kind, state, answer FROM automation_step WHERE run = ? ORDER BY n',
    id,
  );
  const took = new Map(rows.map((r) => [r.n, r]));
  const sealed = sealedOfRun(deps, id);
  const program = plan(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then');
  const name = `rule.${rule.id}`;

  /* WHERE THE RUN STOPPED, for the sentence every step after it carries: the last step it recorded, if it did not finish. */
  const last = rows.at(-1);
  const stoppedAt = run?.state === 'done' || last === undefined ? null : (program[last.n]?.at ?? null);

  const steps: TriedStep[] = [];
  for (const [n, op] of program.entries()) {
    if (op.verb === 'jump') continue;
    const row = took.get(n);
    if (!row) {
      steps.push({ path: op.at, verb: op.verb, state: 'skipped', say: notReached(op, run?.state ?? 'done', stoppedAt) });
      continue;
    }
    steps.push(tried(name, op, row, run?.say ?? null, sealed));
  }

  let said: RunTrigger;
  try {
    said = JSON.parse(run?.trigger ?? '{}') as RunTrigger;
  } catch {
    said = trigger;
  }
  const { chain: _chain, ...shown } = said;
  return ok({ trigger: shown, steps });
}

/** What `trialTrigger` reads and writes through: a row by reference, and a row written as a sample. */
export type TryIo = {
  get: (ref: string) => Entry | null;
  create: (register: string, fields: Patch, actor: string) => Result<Entry>;
};

/**
 * The trigger a try starts from, built from `sample` for the kind of trigger the body declares.
 *
 * A ROW GIVEN AS FIELDS IS WRITTEN, a row given as an id is read. The written one goes through the write path like any
 * create, inside the same rehearsal, so the try's run reads a row the list would have accepted and the write rolls back
 * with the rest. An arrival given as a payload is stored the same way, as a raw arrival the rollback takes out again.
 *
 * WHAT A SAMPLE LEAVES OUT IS ASKED FOR, not invented. A `written` try with no row, an arrival with nothing arrived and
 * a figure with no value each have nothing for `{{trigger.…}}` to read, and a try that ran them over an empty row would
 * report failures the live rule never meets.
 */
export function trialTrigger(deps: FlowDeps, body: FlowDecl, sample: TrySample, io: TryIo, actor: string): Result<RunTrigger> {
  const name = `rule.${String(body.rule)}`;
  if (pathOf(body) !== 'run')
    return no('DECLARATION_INVALID', `${name} has no steps and no trigger that starts a run, so it runs inside the write that fires it, and a try takes a run. Use dryRun for it.`, { at: 'on' });

  let at: string | undefined;
  if (sample.at !== undefined) {
    const ms = typeof sample.at === 'string' ? Date.parse(sample.at) : NaN;
    if (!Number.isFinite(ms)) return no('VALUE_MALFORMED', `sample.at is ${JSON.stringify(sample.at)}, and it takes an instant such as 2026-09-26T08:00:00Z.`, { at: 'sample.at' });
    at = instant(ms);
  }
  const stamp = at === undefined ? {} : { at };

  /* THE ROW, AS AN ID TO READ OR AS FIELDS TO WRITE INTO `register`, or `null` where the sample names none. */
  const rowOf = (register: string | null): Result<Entry | null> => {
    if (sample.row === undefined || sample.row === null) return ok(null);
    if (typeof sample.row === 'string') {
      const found = io.get(sample.row);
      if (!found) return no('REF_UNKNOWN', `sample.row is ${sample.row}, and there is no such row.`, { at: 'sample.row' });
      if (register !== null && found.register !== register)
        return no('REF_REGISTER_MISMATCH', `sample.row is a row of ${found.register}, and ${name} is about rows of ${register}.`, { at: 'sample.row' });
      return ok(found);
    }
    if (typeof sample.row === 'object' && !Array.isArray(sample.row)) {
      if (register === null) return no('VALUE_MALFORMED', `${name} does not say which list its row is on, so give sample.row as the id of a row.`, { at: 'sample.row' });
      const made = io.create(register, sample.row as Patch, actor);
      if (!made.ok && !('refusal' in made)) return made;
      if (!made.ok) return no(made.refusal.code, `The sample row was not accepted: ${made.refusal.fix}`, { at: `sample.row${made.refusal.at === undefined ? '' : `.${made.refusal.at}`}` });
      return ok(made.value);
    }
    return no('VALUE_MALFORMED', 'sample.row is the id of a row, or the fields of one to write for the try.', { at: 'sample.row' });
  };
  const about = (row: Entry | null) => (row ? { entry: row.id, register: row.register } : {});

  const kind = triggerOf(body);
  const on = (body.on ?? {}) as Record<string, unknown>;

  if (kind === 'written') {
    const spec = (on.written ?? {}) as Extract<Trigger, { written: unknown }>['written'];
    const register = subjectOf(body);
    const row = rowOf(register);
    if (!row.ok) return row;
    if (row.value === null) return no('REQUIRED_MISSING', `${name} starts when a row of ${register ?? 'its list'} is written, so give sample.row: the id of a row, or its fields.`, { at: 'sample.row' });
    /* THE OP THE SAMPLE STANDS FOR: a row written for the try was created, and a row read was edited, unless the trigger
       admits only one op, which is then the one tried. */
    const op = spec.op?.length === 1 ? spec.op[0]! : typeof sample.row === 'string' ? 'update' : 'create';
    return ok({ kind: 'written', ...about(row.value), op, ...stamp });
  }

  if (kind === 'arrival') {
    const spec = (on.arrival ?? {}) as Extract<Trigger, { arrival: unknown }>['arrival'];
    const row = rowOf(null);
    if (!row.ok) return row;
    let raw: { id: string; channel: string } | undefined;
    if (typeof sample.arrival === 'string') {
      raw = deps.sql.one<{ id: string; channel: string }>('SELECT id, channel FROM inbox_raw WHERE id = ?', sample.arrival);
      if (!raw) return no('REF_UNKNOWN', `sample.arrival is ${sample.arrival}, and there is no such arrival.`, { at: 'sample.arrival' });
    } else if (sample.payload !== undefined) {
      /* A PAYLOAD IS STORED AS AN ARRIVAL ON THE CHANNEL THE TRIGGER NAMES, as text when it is text and as JSON when it is
         not. Its hash is a fresh id, because two tries of one payload would otherwise meet the table's redelivery key. */
      const channel = spec.channel ?? 'webhook';
      const id = deps.mint();
      deps.sql.exec(
        "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state, reason) VALUES (?, ?, ?, NULL, ?, ?, 'untriaged', NULL)",
        id,
        at ?? instant(deps.nowMs),
        channel,
        typeof sample.payload === 'string' ? sample.payload : JSON.stringify(sample.payload),
        `try:${id}`,
      );
      raw = { id, channel };
    } else return no('REQUIRED_MISSING', `${name} starts when something arrives, so give sample.payload (what arrived) or sample.arrival (the id of an arrival).`, { at: 'sample.payload' });
    return ok({ kind: 'arrival', arrival: raw.id, channel: raw.channel, ingest: spec.ingest ?? null, verified: true, ...about(row.value), ...stamp });
  }

  if (kind === 'metric') {
    const spec = (on.metric ?? {}) as Extract<Trigger, { metric: unknown }>['metric'];
    const given = isObject(sample.payload) ? sample.payload.value : sample.payload;
    if (typeof given !== 'number' || !Number.isFinite(given))
      return no('REQUIRED_MISSING', `${name} starts when metric.${spec.id} crosses its line, so give sample.payload as the figure's value, or as { value, side }.`, { at: 'sample.payload' });
    const told = isObject(sample.payload) ? sample.payload.side : undefined;
    const crosses = spec.crosses as { lte?: unknown; gte?: unknown } | string;
    const side: Side =
      told === 'above' || told === 'below'
        ? told
        : typeof crosses === 'object' && typeof crosses.lte === 'number'
          ? given <= crosses.lte ? 'below' : 'above'
          : typeof crosses === 'object' && typeof crosses.gte === 'number' && given < crosses.gte
            ? 'below'
            : 'above';
    return ok({ kind: 'metric', id: spec.id, value: given, side, ...stamp });
  }

  if (kind === 'decided') {
    const spec = (on.decided ?? {}) as Extract<Trigger, { decided: unknown }>['decided'];
    const row = rowOf(null);
    if (!row.ok) return row;
    const p = isObject(sample.payload) ? sample.payload : {};
    const option = typeof p.option === 'string' ? p.option : (spec.option ?? '');
    const suggestion = typeof p.suggestion === 'string' ? p.suggestion : 'try';
    return ok({ kind: 'decided', suggestion, option, about: spec.about ?? null, ...about(row.value), ...stamp });
  }

  if (kind === 'every') return ok({ kind: 'every', ...stamp });
  return ok({ kind: 'manual', ...stamp });
}

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** One step the run recorded, as the try reports it. */
function tried(name: string, op: Op, row: { kind: string; state: string; answer: string | null }, runSay: string | null, sealed: ReadonlySet<string>): TriedStep {
  const base = { path: op.at, verb: op.verb };
  if (row.state === 'failed') return { ...base, state: 'failed', say: runSay ?? `${name} stopped at ${op.at}.` };
  if (REACHES_OUT.has(op.verb)) return { ...base, state: 'would', say: wouldSay(op) };
  if (row.state === 'waiting') {
    const span = typeof op.step.wait === 'string' ? op.step.wait : 'its span';
    return { ...base, state: 'waiting', say: `A live run would wait ${span} here, and the try stops at the wait.` };
  }
  if (op.verb === 'if') {
    const yes = row.answer === 'then';
    return { ...base, state: 'done', answer: row.answer ?? 'else', say: yes ? 'The condition held, so the run took the steps under then.' : 'The condition did not hold, so the run went past the steps under then.' };
  }
  if (op.verb === 'set_var') {
    const spec = op.step.set_var as { name?: unknown };
    const v = typeof spec.name === 'string' ? spec.name : '';
    /* A VARIABLE SET FROM A SECRET IS NAMED AND NOT SHOWN, whatever it holds (`SEALED_SAID`). */
    const shown = sealed.has(v) ? SEALED_SAID : (row.answer ?? '');
    return { ...base, state: 'done', answer: shown, say: sealed.has(v) ? `vars.${v} is set from a field that never leaves the record, so the try does not show it.` : `vars.${v} is set.` };
  }
  if (op.verb === 'stop') return { ...base, state: 'done', say: 'The run stops here.' };
  return { ...base, state: 'done', say: `The ${op.verb} went through, and was rolled back with the rest of the try.` };
}

/** What a step that reaches outside the record would have done, in the words the owner reads before turning it on. */
function wouldSay(op: Op): string {
  const spec = op.step[op.verb];
  const text = (key: string): string | null => {
    const v = typeof spec === 'object' && spec !== null ? (spec as Record<string, unknown>)[key] : undefined;
    return typeof v === 'string' && v !== '' ? v : null;
  };
  switch (op.verb) {
    case 'call':
      return `A live run would call ${text('ingest') ?? 'the declared call'} here and wait up to a day for its answer. Nothing was sent, and the try stops here.`;
    case 'script':
      return `A live run would start script.${text('id') ?? '(no name)'} here and go on without waiting for it. Nothing was started.`;
    /* `to:` IS NAMED AND NOT SHOWN: it is a member's id, or a hole the run fills from the row, and neither is a name a
       person reads (`flow.ts`'s `ask` says the same of its own sentence). */
    case 'ask_person':
      return `A live run would put this question to ${text('to') === null ? "the record's people" : 'the one member it names'} and wait for the answer. Nothing was asked, and the try stops here.`;
    case 'ask_slash':
      return 'A live run would ask Slash here and wait up to a day for the answer. Nothing was asked, and the try stops here.';
    case 'notify':
      return 'A live run would send this notice here. Nothing was sent.';
    case 'run_job':
      return `A live run would start ${text('kind') ?? 'a job'} on the owner's machine here and wait up to a day for it to end. Nothing was started, and the try stops here.`;
    default:
      return `A live run would take this ${op.verb} step here. Nothing was started.`;
  }
}

/** Why a step has no row: a branch not taken, a run that finished before it, or a run the try stopped short of it. */
function notReached(op: Op, state: string, stoppedAt: string | null): string {
  if (state === 'done') return 'The run did not reach this step: it is on the branch not taken, or after a stop.';
  if (state === 'failed') return `The run did not reach this step, because it failed at ${stoppedAt ?? 'an earlier step'}.`;
  if (state === 'waiting') return `The run did not reach this step, because the try stops where a live run waits (${stoppedAt ?? 'an earlier step'}).`;
  return `The run did not reach this step (${op.at}); it ended ${state}.`;
}
