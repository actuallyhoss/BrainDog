/**
 * Try an automation before anybody installs it: its steps taken by the real runner over a sample, and an account of
 * each step handed back (`tryAutomation`).
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

import { WITHHELD } from './figure.ts';
import { advance, openRun, plan, sealedOfRun, wouldSkip, type FlowDeps, type Installed, type Op, type RunTrigger, type Side } from './flow.ts';
import { pathOf, subjectOf, triggerOf } from './flow-lint.ts';
import type { Entry, Patch } from './index.ts';
import { instant } from './migrate.ts';
import { sealedOf, type FlowDecl, type Trigger } from './rules.ts';

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
export type TriedStep = {
  path: string;
  verb: string;
  state: 'done' | 'would' | 'waiting' | 'failed' | 'skipped';
  answer?: string;
  say: string;
  /**
   * What the step put under its `as:` (a `set_var`'s under its `name:`), as the run held it when the try ended: a
   * call's answer as its JSON, a question's answer, a variable's text. Held to `OUT_BYTES`, past which it is the JSON
   * text cut there and the sentence says so; a value the record keeps secret is `WITHHELD` in its place.
   */
  out?: unknown;
  /** The name `out` was kept under, which a later step reads as `{{vars.<as>}}`. Present wherever `out` is. */
  as?: string;
  /** True where `out` is the JSON text cut at `OUT_BYTES`, which is no answer to hand back as `given`. */
  cut?: true;
  /** What a `call` the try stopped at would have sent, field by field, with a secret field `WITHHELD`. Nothing was sent. */
  sends?: Record<string, unknown>;
};

export type Tried = { trigger: Omit<RunTrigger, 'chain'>; steps: TriedStep[] };

/**
 * One step tried alone (SHL-D14). `upTo` is the step's path as `TriedStep.path` writes it (`steps[2]`,
 * `steps[1].then[0]`): the try stops after it, and the steps after it are not reached. `given` is the answers of earlier
 * steps by the name each was kept under, as an earlier try's `out` gave them: a step before `upTo` whose name is here is
 * not taken again, and its answer is the run's from the start. A step whose name is not here is taken for real inside
 * the rehearsal, as every step of a whole try is.
 */
export type TryOptions = { upTo?: string | undefined; given?: Record<string, unknown> | undefined };

/** The most of one step's `out` a try hands back, in UTF-8 bytes. The same as one variable may hold (`flow.ts`). */
export const OUT_BYTES = 4096;

/**
 * Where a caller that can hand the kernel only a body puts the options for `tryRun` (`withTry`).
 *
 * A BRIDGE, NOT THE WAY IN. The kernel's `tryAutomation` hands `tryRun` the same body object it was given, so options
 * riding on it under a symbol reach the runner before that method takes them as an argument of its own; a body
 * through JSON loses them, which is a whole try, as before. `tryRun`'s own argument wins where both are given.
 */
const OPTIONS = Symbol('tryRun');

/** `body` with `o` riding on it for `tryRun` (`OPTIONS`). The body itself is not changed. */
export function withTry<B extends FlowDecl>(body: B, o: TryOptions): B {
  return Object.assign({ ...body }, { [OPTIONS]: o }) as B;
}

const optionsOf = (body: FlowDecl): TryOptions => ((body as { [OPTIONS]?: TryOptions })[OPTIONS] ?? {});

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
 * other. A try is read by whoever may edit an automation, and a variable filled from `{{trigger.row.pin}}` holds the
 * pin; the step's answer would be a new place for it to leak.
 */
const SEALED_SAID = '--redacted--';

/**
 * Take `body`'s steps over `trigger` and say what each did.
 *
 * `deps` MUST CARRY `trial: body`, so the runner reads the steps from the body and asks no installed version whether it
 * is live. It is asked for here rather than set here, so that the caller builds the dependencies once and this file
 * cannot hand the runner a body other than the one it reports on.
 *
 * `o` TRIES ONE STEP (`TryOptions`), read off the body (`withTry`) where the caller hands none. Without it, this is the
 * whole try it always was, each step now carrying what it kept (`out`).
 */
export function tryRun(deps: FlowDeps, body: FlowDecl, trigger: RunTrigger, actor: string, o: TryOptions = optionsOf(body)): Result<Tried> {
  if (deps.trial !== body) return no('VALUE_MALFORMED', 'A try hands the runner the body it reports on, and these dependencies carry another.', { at: 'body' });
  const program = plan(body.steps ?? body.then, body.steps !== undefined ? 'steps' : 'then');
  const name = `rule.${String(body.rule)}`;
  /* THE STEP TRIED ALONE, BY ITS PLACE IN THE PLAN. A path the plan does not hold is refused, rather than taken as a whole
     try the caller did not ask for. */
  const upTo = o.upTo === undefined ? program.length - 1 : program.findIndex((op) => op.at === o.upTo && op.verb !== 'jump');
  if (o.upTo !== undefined && upTo < 0) return no('VALUE_MALFORMED', `${name} has no step at ${String(o.upTo)}. Give upTo as a step's path, such as steps[2].`, { at: 'upTo' });
  const given = givenOf(o.given);
  if (!given.ok) return given;

  /* A SAMPLE THE LIVE RULE WOULD PASS OVER STARTS NO RUN HERE EITHER, and every step says why, so the panel never shows
     steps taken for a row the rule skips. */
  const skip = wouldSkip(deps, body, trigger);
  if (skip !== null) {
    const { chain: _chain, ...asked } = trigger;
    const steps = program.filter((op) => op.verb !== 'jump').map((op): TriedStep => ({ path: op.at, verb: op.verb, state: 'skipped', say: skip }));
    return ok({ trigger: asked, steps });
  }

  /* THE BODY THE RUNNER TAKES: the steps before the one tried whose answers are given taken out, and a `stop` after the
     one tried. Every step left is the draft's own object, so each step the runner records is matched back to its path. */
  const reused = new Map<string, unknown>();
  const before = o.upTo === undefined ? program.length : upTo;
  for (const [n, op] of program.entries()) {
    const kept = n < before ? keptAs(op) : null;
    if (kept !== null && Object.hasOwn(given.value, kept)) reused.set(op.at, given.value[kept]);
  }
  const cut = cutBody(body, o.upTo === undefined ? null : program[upTo]!.at, reused);
  const runner: FlowDeps = { ...deps, trial: cut.body };
  const rule: Installed = { id: String(body.rule), version: 0, body: cut.body };
  const id = openRun(runner, rule, trigger, { actor });
  /* THE GIVEN ANSWERS ARE THE RUN'S FROM ITS FIRST STEP, written as a run with no step saved holds them. */
  const seeded = Object.fromEntries([...reused].map(([at, v]) => [keptAs(program.find((op) => op.at === at)!)!, v]));
  if (reused.size > 0) deps.sql.exec('UPDATE automation_run SET vars = ? WHERE id = ?', JSON.stringify(seeded), id);
  /* ONE CALL, NOT A LOOP. `advance` takes steps until the run finishes or parks, and a park is where the try stops. */
  advance(runner, id);

  const run = deps.sql.one<{ state: string; say: string | null; trigger: string; vars: string }>('SELECT state, say, trigger, vars FROM automation_run WHERE id = ?', id);
  const rows = deps.sql.all<{ n: number; kind: string; state: string; answer: string | null }>('SELECT n, kind, state, answer FROM automation_step WHERE run = ? ORDER BY n', id);
  /* EACH ROW BY THE PATH OF THE DRAFT'S STEP IT TOOK, through the runner's own plan of the cut body. */
  const ran = plan(cut.body.steps ?? cut.body.then, 'steps');
  const took = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const at = ran[r.n] ? cut.origin.get(ran[r.n]!.step) : undefined;
    if (at !== undefined && !took.has(at)) took.set(at, r);
  }
  const sealed = sealedOfRun(runner, id);
  const secrets = secretValues(deps, trigger.entry);
  const vars = varsOf(run?.vars);

  /* WHERE THE RUN STOPPED, for the sentence every step after it carries: the last draft step it recorded. */
  const lastAt = [...took.keys()].at(-1) ?? null;
  const stoppedAt = run?.state === 'done' ? null : lastAt;

  const steps: TriedStep[] = [];
  const written = new Map<string, number>();
  for (const [n, op] of program.entries()) {
    if (op.verb === 'jump') continue;
    if (n > upTo) {
      steps.push({ path: op.at, verb: op.verb, state: 'skipped', say: `The try stopped after ${program[upTo]!.at}, the step being tested, so it did not reach this one.` });
      continue;
    }
    if (reused.has(op.at)) {
      const out = shown(reused.get(op.at), secrets);
      const say = 'The answer this step gave in an earlier test was used, so it was not taken again.';
      steps.push({ path: op.at, verb: op.verb, state: 'done', out: out.out, as: keptAs(op)!, ...(out.cut ? { cut: true } : {}), say: out.say === undefined ? say : `${say} ${out.say}` });
      continue;
    }
    const row = took.get(op.at);
    if (!row) {
      steps.push({ path: op.at, verb: op.verb, state: 'skipped', say: notReached(op, run?.state ?? 'done', stoppedAt) });
      continue;
    }
    const step = tried(name, op, row, run?.say ?? null, sealed);
    /* A GIVEN ANSWER IS NOT SEALED BY THE RUNNER, so a step that writes it into text is held to the row's secrets too. */
    if (typeof step.answer === 'string' && hidden(step.answer, secrets) === WITHHELD) step.answer = WITHHELD;
    const kept = keptAs(op);
    if (step.state === 'done' && kept !== null) written.set(kept, steps.length);
    if (step.state === 'would' && op.verb === 'call') {
      const sends = sendsOf(deps, op, trigger.entry, secrets);
      if (sends !== null) step.sends = sends;
    }
    steps.push(step);
  }
  /* WHAT EACH NAME HOLDS IS THE LAST WRITER'S, so only the last step to write a name is handed its value. */
  for (const [kept, at] of written) {
    if (!Object.hasOwn(vars, kept)) continue;
    const step = steps[at]!;
    const value = sealed.has(kept) ? WITHHELD : vars[kept];
    const out = shown(value, secrets);
    step.out = out.out;
    step.as = kept;
    if (out.cut) step.cut = true;
    if (out.say !== undefined) step.say = `${step.say} ${out.say}`;
  }

  let said: RunTrigger;
  try {
    said = JSON.parse(run?.trigger ?? '{}') as RunTrigger;
  } catch {
    said = trigger;
  }
  const { chain: _chain, ...shownTrigger } = said;
  return ok({ trigger: shownTrigger, steps });
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

/* ── one step tried alone ───────────────────────────────────────────── */

/** The name a step keeps its answer under: its `as:`, or a `set_var`'s `name:`. `null` for a step that keeps none. */
function keptAs(op: Op): string | null {
  const spec = op.step[op.verb];
  if (!isObject(spec)) return null;
  const v = op.verb === 'set_var' ? spec.name : spec.as;
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * The earlier answers a try is given, each held to `OUT_BYTES` characters as one variable is.
 *
 * A VALUE GIVEN AS `WITHHELD` IS NOT AN ANSWER. It is what an earlier try showed in place of a secret, and a step run
 * over the mark would write the mark where the secret goes, so that step is taken again for real instead.
 */
function givenOf(given: unknown): Result<Record<string, unknown>> {
  if (given === undefined || given === null) return ok({});
  if (!isObject(given)) return no('VALUE_MALFORMED', 'given is the earlier answers by the name each step keeps it under, such as { a: { rate: 48.5 } }.', { at: 'given' });
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(given)) {
    /* ANYWHERE IN IT, as the web's `reusable` reads it: `{ pin: '--withheld--' }` is as little the answer as the mark alone. */
    if (v === undefined || holdsWithheld(v)) continue;
    /* IN CHARACTERS, AS THE RUNNER HOLDS AN ANSWER (`flow.ts`'s `VAR_BYTES`), so what a run could have kept can be given. */
    if ((JSON.stringify(v) ?? '').length > OUT_BYTES) return no('VALUE_MALFORMED', `given.${k} is longer than ${OUT_BYTES} characters, the most one answer may hold.`, { at: `given.${k}` });
    out[k] = v;
  }
  return ok(out);
}

/**
 * The draft as the runner takes it for one step: each step at a path in `drop` left out, and after the step at `upTo` a
 * `stop` (an `if` tried alone gets one at the head of each arm, so the try ends once it has chosen). `origin` maps each
 * step object the runner will meet back to its path in the draft, walked as `plan` walks it.
 */
function cutBody(body: FlowDecl, upTo: string | null, drop: ReadonlyMap<string, unknown>): { body: FlowDecl; origin: Map<object, string> } {
  const origin = new Map<object, string>();
  const root = body.steps !== undefined ? 'steps' : 'then';
  const walk = (list: unknown, at: string): unknown[] => {
    if (!Array.isArray(list)) return [];
    const out: unknown[] = [];
    for (const [i, step] of list.entries()) {
      const here = `${at}[${i}]`;
      if (!isObject(step)) {
        out.push(step);
        continue;
      }
      if (drop.has(here)) continue;
      if ('if' in step) {
        const arm = (key: 'then' | 'else') => (here === upTo ? [{ stop: true }] : walk(step[key], `${here}.${key}`));
        const copy: Record<string, unknown> = { ...step, then: arm('then') };
        if (step.else !== undefined || here === upTo) copy.else = arm('else');
        origin.set(copy, here);
        out.push(copy);
        continue;
      }
      origin.set(step, here);
      out.push(step);
      if (here === upTo) out.push({ stop: true });
    }
    return out;
  };
  if (upTo === null && drop.size === 0) {
    for (const op of plan(body.steps ?? body.then, root)) if (op.verb !== 'jump') origin.set(op.step, op.at);
    return { body, origin };
  }
  const steps = walk(body.steps ?? body.then, root);
  return { body: (body.steps !== undefined ? { ...body, steps } : { ...body, then: steps }) as FlowDecl, origin };
}

/** The run's variables as it last saved them, less the keys the runner keeps beside them (each starts with a dash). */
function varsOf(stored: string | undefined): Record<string, unknown> {
  try {
    const all = JSON.parse(stored ?? '{}') as unknown;
    return isObject(all) ? Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('-'))) : {};
  } catch {
    return {};
  }
}

/** What the run's row holds in its secret and file fields, for `shown` to find in an answer. Empty with no row. */
function secretValues(deps: FlowDeps, entry: string | undefined): string[] {
  const row = typeof entry === 'string' ? deps.entry(entry) : null;
  if (!row) return [];
  const out: string[] = [];
  for (const field of sealedOf(deps.sql, row.register)) {
    const v = row.fields[field];
    if ((typeof v === 'string' && v !== '') || typeof v === 'number') out.push(String(v));
  }
  return out;
}

/** `value` with every text that holds what a secret field holds written `WITHHELD` (`shown`'s first half). */
function hidden(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value);
    return secrets.some((s) => text === s || (s.length >= 4 && text.includes(s))) ? WITHHELD : value;
  }
  if (Array.isArray(value)) return value.map((x) => hidden(x, secrets));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, hidden(x, secrets)]));
  return value;
}

/** Whether `WITHHELD` sits anywhere in `value`. */
const holdsWithheld = (value: unknown): boolean =>
  value === WITHHELD || (Array.isArray(value) ? value.some(holdsWithheld) : isObject(value) ? Object.values(value).some(holdsWithheld) : false);

/**
 * A value as a try hands it back: every text that holds what a secret field holds written `WITHHELD`, then the whole
 * cut to `OUT_BYTES` as JSON text, with the sentence that says where.
 *
 * A SHORT SECRET IS MATCHED WHOLE, a longer one wherever it sits. Three characters inside a sentence are too often there
 * by chance, and a one-letter field would withhold most of what a step said.
 */
function shown(value: unknown, secrets: readonly string[]): { out: unknown; say?: string; cut?: true } {
  const out = hidden(value, secrets);
  const text = JSON.stringify(out) ?? '';
  const size = bytes(text);
  if (size <= OUT_BYTES) return { out };
  let n = OUT_BYTES;
  while (bytes(text.slice(0, n)) > OUT_BYTES) n -= Math.max(1, Math.ceil((bytes(text.slice(0, n)) - OUT_BYTES) / 4));
  return { out: text.slice(0, n), cut: true, say: `It gave ${size} bytes, more than a test shows, so this is cut at ${OUT_BYTES} bytes, after its first ${n} characters.` };
}

const encoder = new TextEncoder();
const bytes = (text: string): number => encoder.encode(text).length;

/**
 * What a `call` would send: the fields its declaration's `sends:` names, read from the run's row, each secret one
 * `WITHHELD`. `null` where the call is not declared or sends nothing of a row.
 */
function sendsOf(deps: FlowDeps, op: Op, entry: string | undefined, secrets: readonly string[]): Record<string, unknown> | null {
  const spec = op.step.call;
  const ingest = isObject(spec) && typeof spec.ingest === 'string' ? spec.ingest : null;
  if (ingest === null) return null;
  const decl = deps.sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'ingest' AND superseded_at IS NULL AND retired = 0", `ingest.${ingest}`);
  let sends: unknown;
  try {
    sends = decl ? (JSON.parse(decl.body) as { sends?: unknown }).sends : undefined;
  } catch {
    return null;
  }
  if (!Array.isArray(sends) || sends.length === 0) return null;
  const row = typeof entry === 'string' ? deps.entry(entry) : null;
  const sealed = row ? sealedOf(deps.sql, row.register) : new Set<string>();
  const out: Record<string, unknown> = {};
  for (const path of sends) {
    if (typeof path !== 'string') continue;
    const field = path.slice(path.indexOf('.') + 1);
    out[field] = sealed.has(field) ? WITHHELD : (row?.fields[field] ?? null);
  }
  return shown(out, secrets).out as Record<string, unknown>;
}

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
