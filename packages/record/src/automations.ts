/**
 * Automations as a person and an agent read them: the list, one with its runs, and what a body would do before it is
 * installed (`loop/research-shell-automations.md` section 5, Brief D).
 *
 * THE RUNNER HAD LANDED AND NOTHING OUTSIDE THE KERNEL COULD SEE IT. `automation_run` and `automation_step` held every run
 * and every step's outcome from 94ba1ad8 on, and the only reader of either was the runner itself: no method listed an
 * automation, none showed a run, and the dry run a `propose` needs refused every body with steps as "A rule names a
 * register and what it would then do", because the only one there was is the inline pass's (`rules.ts` `dryRun`), which
 * walks `then` over a register's rows. So the canvas had nothing to draw and an agent had nothing to read back.
 *
 * READS ONLY. Nothing here writes a row, arms a schedule or starts a run: starting and cancelling are the kernel's
 * `automationRun` and `cancelRun`, behind the record's ADMIN gate.
 *
 * THREE LINES OF THE KERNEL ARE COPIED, AND HELD. `pathOf`, `triggerOf` and `subjectOf` are `flow-lint.ts`'s, which the
 * kernel does not export and which `31 §2` forbids reaching into by a relative path. They decide which of two answers a
 * dry run gives, so `packages/mcp/test/automations.test.ts` runs both copies over every shape of trigger and fails the
 * day they part.
 */

import type { Sql } from '@braindog/ports';

type Body = Record<string, unknown>;

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

const TRIGGERS: readonly string[] = ['written', 'arrival', 'every', 'metric', 'decided', 'manual'];

/** The one trigger a body names, or `written` when it names none. `flow-lint.ts`'s `triggerOf`. */
export const triggerOf = (body: Body): string => {
  const on = body.on;
  if (on === undefined || typeof on === 'string' || !isObject(on)) return 'written';
  return Object.keys(on).find((k) => TRIGGERS.includes(k)) ?? 'written';
};

/** `inline` runs inside the write, `run` after it, step by step. `flow-lint.ts`'s `pathOf`. */
export function pathOf(body: Body): 'inline' | 'run' {
  if (body.steps !== undefined) return 'run';
  if (body.on === undefined || typeof body.on === 'string') return 'inline';
  const written = isObject(body.on) ? body.on.written : undefined;
  if (!isObject(written)) return 'run';
  return written.op === undefined && written.fields === undefined && written.from_rules === undefined ? 'inline' : 'run';
}

/** The list whose row a run is about, or `null` for a clock, a button or an arrival. `flow-lint.ts`'s `subjectOf`. */
export function subjectOf(body: Body): string | null {
  if (typeof body.register === 'string') return body.register;
  const written = isObject(body.on) ? body.on.written : undefined;
  return isObject(written) && typeof written.register === 'string' ? written.register : null;
}

/* ── what a body would do ───────────────────────────────────────────── */

/**
 * The steps that hand off to somebody else and come back later. `flow.ts` fails a run that reaches one with
 * `NOT_IN_THIS_BUILD`, after taking every step before it, until Brief C lands.
 *
 * SAID IN THE DRY RUN BECAUSE THE LINT LETS THEM INSTALL, so that the canvas can draw them. An agent told only "would ask
 * the owner" files the rule, the owner accepts it, and the first run fails at that step while its author reads the dry
 * run as a promise. The test that holds this list runs a real one.
 */
export const WAITS_ON_OTHERS: readonly string[] = ['call', 'script', 'ask_spark', 'ask_person'];

const NOT_BUILT = ' Not in this build: a run stops here, after the steps before it.';

export type Said = {
  path: 'inline' | 'run';
  /** What starts it, as one sentence. */
  trigger: string;
  /** What each step would do, one line each, a branch's arms indented under it. Nothing in it has happened. */
  steps: string[];
};

const words = (x: unknown): string => (typeof x === 'string' ? x : JSON.stringify(x));
const listed = (x: unknown): string => (Array.isArray(x) ? x.map(words).join(' or ') : words(x));

/** What starts a body, in one sentence a person reads on Decide. */
function started(body: Body): string {
  const on = isObject(body.on) ? body.on : {};
  switch (triggerOf(body)) {
    case 'written': {
      const spec = isObject(on.written) ? on.written : {};
      const ops = Array.isArray(spec.op)
        ? spec.op.map((o) => (o === 'create' ? 'added' : o === 'update' ? 'changed' : o === 'delete' ? 'deleted' : words(o))).join(' or ')
        : 'written';
      const fields = Array.isArray(spec.fields) ? `, when ${listed(spec.fields)} changes` : '';
      const when = body.when === undefined ? '' : `, if ${words(body.when)}`;
      const chained = spec.from_rules === true ? ', counting writes other automations make' : '';
      const where = pathOf(body) === 'inline' ? ', inside the write itself.' : ', as a run after the write.';
      return `When a row of ${subjectOf(body) ?? 'no list'} is ${ops}${fields}${when}${chained}${where}`;
    }
    case 'arrival': {
      const spec = isObject(on.arrival) ? on.arrival : {};
      const at = typeof spec.ingest === 'string' ? ` at ${spec.ingest}` : '';
      const by = typeof spec.channel === 'string' ? ` by ${spec.channel}` : '';
      const state = Array.isArray(spec.state) ? ` and is left ${listed(spec.state)}` : '';
      const verified = spec.unverified === true ? 'whether or not its sender was verified' : 'from a sender that was verified';
      return `When something arrives${at}${by}${state}, ${verified}. A redelivery starts nothing.`;
    }
    case 'every': {
      const at = typeof on.at === 'string' ? ` at ${on.at}` : '';
      const day = typeof on.day === 'string' ? ` on ${on.day}` : '';
      return `Every ${words(on.every)}${at}${day}.`;
    }
    case 'manual':
      return 'When somebody presses Run now in the app. No agent and no token can press it.';
    case 'metric': {
      const spec = isObject(on.metric) ? on.metric : {};
      return `When ${words(spec.id)} crosses ${words(spec.crosses)}. Nothing in this build watches a figure for that.`;
    }
    default:
      return 'When a decision is taken. Nothing in this build starts a rule that way.';
  }
}

/**
 * How deep a branch may nest before the dry run stops saying it: the lint's `DEPTH_CEILING` (3) and a margin.
 *
 * THE DRY RUN IS A READ, AND IT RAN BEFORE THE LINT. `propose` lints first and refuses depth over 3, but the READ+
 * `dryRun` route takes any body a read token sends, and a body nested some 2,000 `if` levels deep (about 50 KB) blew the
 * stack in `stepLines`, so the host answered INTERNAL. Past this depth the record refuses instead, and `stepLines` stops
 * descending on its own, so `said` is safe whoever calls it.
 */
export const SAID_DEPTH = 3 + 5;

/** Whether any branch in a list of steps nests past `limit`. It never descends further than that, however deep it goes. */
export function nestedPast(list: unknown, limit: number = SAID_DEPTH, depth = 0): boolean {
  if (!Array.isArray(list)) return false;
  for (const step of list) {
    if (!isObject(step) || !('if' in step)) continue;
    if (depth >= limit) return true;
    if (nestedPast(step.then, limit, depth + 1) || nestedPast(step.else, limit, depth + 1)) return true;
  }
  return false;
}

/** One step, or a branch and its arms, as lines. */
function stepLines(step: unknown, depth: number, out: string[]): void {
  const pad = '  '.repeat(depth);
  if (depth > SAID_DEPTH) {
    out.push(`${pad}Nested deeper than ${SAID_DEPTH} branches, so not said.`);
    return;
  }
  const line = (text: string): void => {
    out.push(`${pad}${text}`);
  };
  if (!isObject(step)) return line(`A step this record cannot read: ${words(step)}.`);
  const s = step;
  if ('if' in s) {
    line(`If ${words(s.if)}:`);
    for (const inner of Array.isArray(s.then) ? s.then : []) stepLines(inner, depth + 1, out);
    if (s.else !== undefined) {
      line('Otherwise:');
      for (const inner of Array.isArray(s.else) ? s.else : []) stepLines(inner, depth + 1, out);
    }
    return;
  }
  const spec = (key: string): Body => (isObject(s[key]) ? (s[key] as Body) : {});
  if ('set_var' in s) return line(`Keep ${JSON.stringify(words(spec('set_var').to))} as ${words(spec('set_var').name)}.`);
  if ('wait' in s) return line(`Wait ${words(s.wait)}.`);
  if ('call' in s) {
    const as = spec('call').as === undefined ? '' : `, and keep its answer as ${words(spec('call').as)}`;
    return line(`Call ${words(spec('call').ingest)}, a declared call${as}.${NOT_BUILT}`);
  }
  if ('script' in s) return line(`Run script.${words(spec('script').id)}, and keep its answer as ${words(spec('script').as)}.${NOT_BUILT}`);
  if ('ask_spark' in s) return line(`Ask Spark ${JSON.stringify(words(spec('ask_spark').question))}, and keep the answer as ${words(spec('ask_spark').as)}.${NOT_BUILT}`);
  if ('ask_person' in s) {
    const ask = spec('ask_person');
    const who = typeof ask.to === 'string' ? ask.to : 'the owner';
    const wait = typeof ask.wait === 'string' ? ` It waits ${ask.wait} for an answer.` : '';
    return line(`Ask ${who} ${JSON.stringify(words(ask.question))}, ${listed(ask.options)}, and keep the answer as ${words(ask.as)}.${wait}${NOT_BUILT}`);
  }
  if ('tag' in s) return line(`Tag the row ${words(s.tag)}.`);
  if ('untag' in s) return line(`Take the tag ${words(s.untag)} off the row.`);
  if ('set' in s) return line(`Set ${words(spec('set').field)} to ${words(spec('set').to)}.`);
  if ('move' in s) return line(`Move the row to ${words(s.move)}.`);
  if ('link' in s) {
    const to = isObject(spec('link').to) ? (spec('link').to as Body) : {};
    return line(`Link ${words(spec('link').field)} to the ${words(to.register)} row whose ${words(to.by)} is ${words(to.value)}.`);
  }
  if ('note' in s) return line(`Note on the row: ${words(s.note)}`);
  if ('notify' in s) return line(`Tell the owner: ${words(spec('notify').say)}${spec('notify').urgent === true ? ' At once, as an interrupt.' : ''}`);
  if ('schedule' in s) return line(`In ${words(spec('schedule').in)}, come back to the row: ${words(spec('schedule').note)}`);
  if ('create' in s) return line(`Create up to ${words(spec('create').bound)} rows in ${words(spec('create').register)}.`);
  if ('suggest' in s) return line(`Ask on Decide ${JSON.stringify(words(spec('suggest').question))}, ${listed(spec('suggest').options)}.`);
  if ('run' in s) return line(`Send the declared call ${words(s.run)}.`);
  if ('stop' in s) return line('Stop, and take no further step.');
  return line(`A step this record does not know: ${words(step)}.`);
}

/**
 * What a body would do, said and not done: which path, what starts it, and each step as a line.
 *
 * IT READS NO ROW, SO IT NEEDS NO ROW. The inline pass's own dry run walks a register's rows and says what each would
 * get, and it still does for an inline body (the record puts its answer beside this one). A run is about a row that has
 * not been written yet, a clock that has not ticked or a button nobody has pressed, so what can be said before it is
 * installed is the sentence and the steps, which is what Decide and the agent that filed it both read.
 */
export function said(body: Body): Said {
  const out: string[] = [];
  const list = body.steps ?? body.then;
  for (const step of Array.isArray(list) ? list : []) stepLines(step, 0, out);
  return { path: pathOf(body), trigger: started(body), steps: out };
}

/* ── what is installed, and how its runs went ───────────────────────── */

export type RunState = 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

export type AutomationRow = {
  /** `rule.<id>`, the declaration's own id. */
  id: string;
  /** The bare id, as `automationRun` and `braindog:automation/<id>` take it. */
  rule: string;
  /** What its card says: `name`, or the id when it has none. */
  name: string;
  version: number;
  trigger: string;
  path: 'inline' | 'run';
  /** The list whose rows start it, or `null` for a clock, a button or an arrival. */
  register: string | null;
  project: string | null;
  enabled: boolean;
  pack: string | null;
  /** When a clock next starts it, while one is armed. */
  next: string | null;
  /** Runs not finished yet: due, being taken, or parked on a wait. */
  open: number;
  last: { run: string; state: RunState; at: string; say: string | null } | null;
  /** This calendar month so far, UTC, from the runs themselves. An inline rule's firings are events, not runs. */
  month: { runs: number; done: number; failed: number; cancelled: number };
};

export type AutomationRun = {
  id: string;
  /** The version it started under, which it keeps for its life. */
  version: number;
  state: RunState;
  trigger: string;
  actor: string;
  started_at: string;
  finished_at: string | null;
  say: string | null;
  steps: { n: number; kind: string; state: string; answer: string | null; at: string }[];
};

export type Automation = AutomationRow & { body: Body; runs: AutomationRun[] };

/** How many runs one automation shows. The brief's ten: the list is for reading what just happened, not an archive. */
export const RUNS_SHOWN = 10;

type Declared = { id: string; version: number; body: string; pack_id: string | null };

const OPEN = "state IN ('pending', 'running', 'waiting')";

function row(sql: Sql, d: Declared, nowMs: number): { row: AutomationRow; body: Body } {
  const body = JSON.parse(d.body) as Body;
  const bare = d.id.slice('rule.'.length);
  /* THE CLOCK ROW `flow.ts` KEYS `flow.every:<id>`, which the install arms one interval out. `firing` counts as armed:
     the drain holds a row there while it takes the turn, and the next due time is written back when it lets go. */
  const next = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = ? AND state IN ('pending', 'firing')", `flow.every:${bare}`);
  const open = sql.one<{ n: number }>(`SELECT count(*) AS n FROM automation_run WHERE rule = ? AND ${OPEN}`, bare)?.n ?? 0;
  const last = sql.one<{ id: string; state: RunState; started_at: string; finished_at: string | null; say: string | null }>(
    'SELECT id, state, started_at, finished_at, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC LIMIT 1',
    bare,
  );
  const month = { runs: 0, done: 0, failed: 0, cancelled: 0 };
  for (const r of sql.all<{ state: string; n: number }>(
    'SELECT state, count(*) AS n FROM automation_run WHERE rule = ? AND started_at >= ? GROUP BY state',
    bare,
    `${new Date(nowMs).toISOString().slice(0, 7)}-01T00:00:00.000Z`,
  )) {
    month.runs += r.n;
    if (r.state === 'done' || r.state === 'failed' || r.state === 'cancelled') month[r.state] += r.n;
  }
  return {
    body,
    row: {
      id: d.id,
      rule: bare,
      name: typeof body.name === 'string' && body.name.trim() !== '' ? body.name : bare,
      version: d.version,
      trigger: triggerOf(body),
      path: pathOf(body),
      register: subjectOf(body),
      project: typeof body.project === 'string' ? body.project : null,
      enabled: body.enabled !== false,
      pack: d.pack_id,
      next: next?.due_at ?? null,
      open,
      last: last ? { run: last.id, state: last.state, at: last.finished_at ?? last.started_at, say: last.say } : null,
      month,
    },
  };
}

const LIVE = "kind = 'rule' AND superseded_at IS NULL AND retired = 0";

/**
 * Every live rule, inline ones included, by id.
 *
 * EVERY RULE IS AN AUTOMATION (§2.1): one installed before `on:` existed is one whose trigger is a write, and the canvas
 * opens it like any other. A rule a pack turned off has retired its declaration, so it is not in the list.
 */
export function automations(sql: Sql, nowMs: number): AutomationRow[] {
  return sql.all<Declared>(`SELECT id, version, body, pack_id FROM declaration WHERE ${LIVE} ORDER BY id`).map((d) => row(sql, d, nowMs).row);
}

/** One live rule, by `chase` or `rule.chase`, with its body and its last runs, newest first; `null` when there is none. */
export function automation(sql: Sql, named: string, nowMs: number): Automation | null {
  const id = named.startsWith('rule.') ? named : `rule.${named}`;
  const d = sql.one<Declared>(`SELECT id, version, body, pack_id FROM declaration WHERE id = ? AND ${LIVE}`, id);
  if (!d) return null;
  const { row: shown, body } = row(sql, d, nowMs);
  const runs = sql
    .all<Omit<AutomationRun, 'steps' | 'trigger'> & { trigger: string }>(
      'SELECT id, version, state, trigger, actor, started_at, finished_at, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC LIMIT ?',
      shown.rule,
      RUNS_SHOWN,
    )
    .map((r) => {
      /* THE TRIGGER BY ITS KIND. The run row keeps the whole of what started it, the row id and the arrival id among it,
         and those are the run's to read, not a list's. */
      let kind = 'written';
      try {
        const t = JSON.parse(r.trigger) as { kind?: unknown };
        if (typeof t.kind === 'string') kind = t.kind;
      } catch {
        /* A row this build did not write keeps the default: every run of a rule began as a write until it had `on:`. */
      }
      return {
        ...r,
        trigger: kind,
        steps: sql.all<AutomationRun['steps'][number]>('SELECT n, kind, state, answer, at FROM automation_step WHERE run = ? ORDER BY n', r.id),
      };
    });
  return { ...shown, body, runs };
}
