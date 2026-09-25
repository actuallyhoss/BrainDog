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

import { REFUSED_IN_A_ROW } from '@braindog/kernel';
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
 * The steps that hand off to somebody else and do not come back in this build. `flow.ts` fails a run that reaches a
 * `call` with `NOT_IN_THIS_BUILD`, after taking every step before it, and on a host that does not answer Slash the lint
 * refuses `ask_slash` at install, because nothing there serves the question it would queue. `ask_person` is not here: it
 * opens its question in Decide and the decision wakes the run (Brief C). Nor is `ask_slash` where the host answers it
 * (`said`'s `answersSlash`): the run parks on the step and the model's answer wakes it.
 *
 * NOR IS `script`, SINCE 24 SEPTEMBER. `flow.ts`'s `startScript` queues the script's run and the run goes on, and this
 * list still named it after the runner stopped failing it: the dry run of Work's `rule.close_follow_ups` ended its one
 * step with "Not in this build: a run stops here", on a record where the same rule ran to `done` and closed the task's
 * follow-ups (`apps/selfhost/test/follow-ups.test.ts`). An owner reading that would have refused the one automation
 * the pack ships.
 *
 * SAID IN THE DRY RUN BECAUSE THE DRY RUN IS NOT THE LINT. `call` installs so that the canvas can draw it, and an agent
 * told only "would call" files the rule, the owner accepts it, and the first run fails at that step while its author
 * reads the dry run as a promise. The test that holds this list runs a real one.
 */
export const WAITS_ON_OTHERS: readonly string[] = ['call', 'ask_slash'];

const NOT_BUILT = ' Not in this build: a run stops here, after the steps before it.';
const NOT_INSTALLED = ' Not in this build: a rule with this step is refused at install.';
/** `flow.ts`'s `ASK_PERSON_WAIT`, copied for the reason the three above are and held by the same test. */
const ASK_PERSON_WAIT = '7d';
/** `flow.ts`'s `ASK_SLASH_WAIT_MS` as a span, copied likewise and held by `automations-slash.test.ts`. */
const ASK_SLASH_WAIT = '1d';

export type Said = {
  path: 'inline' | 'run';
  /** What starts it, as one sentence. */
  trigger: string;
  /** What each step would do, one line each, a branch's arms indented under it. Nothing in it has happened. */
  steps: string[];
};

/**
 * How deep `words` prints a value before it names what is left by its kind and size.
 *
 * `words` WAS `JSON.stringify`, WHICH RECURSES INTO ANY VALUE. `SAID_DEPTH` bounds `if` nesting and nothing else, so a
 * 40 KB body off the wire with a 20,000-deep array in one `notify.say` threw `RangeError: Maximum call stack size
 * exceeded` out of here through the READ+ `dryRun` (audit thirty-six, finding 8). Eight levels print every predicate
 * tree the lint lets install in full, which is what an `if` line shows, and past that a reader learns the shape.
 */
export const PRINT_DEPTH = 8;

const counted = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

function printed(x: unknown, depth: number): string {
  if (x === null || typeof x !== 'object') return String(JSON.stringify(x));
  const entries = Array.isArray(x) ? null : Object.entries(x);
  if (depth >= PRINT_DEPTH) return entries === null ? `a list of ${counted((x as unknown[]).length, 'item', 'items')}` : `an object of ${counted(entries.length, 'key', 'keys')}`;
  if (entries === null) return `[${(x as unknown[]).map((v) => printed(v, depth + 1)).join(',')}]`;
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${printed(v, depth + 1)}`).join(',')}}`;
}

const words = (x: unknown): string => (typeof x === 'string' ? x : printed(x, 0));

/**
 * The deepest a dry-run body's JSON may nest: far past any body the lint installs, and far short of a stack.
 *
 * A BODY IS REFUSED PAST IT, NOT ONLY PRINTED SHORT, because `said` is one reader and the kernel's inline walk is
 * another, and what the dry run hands on should be a body some rule could be. The deepest honest shape is three
 * branches (`then` array and step object each), a predicate tree under the last `if`, and a `create`'s fields, which
 * is well under twenty levels. Walked with a stack of its own, so a body of any depth is measured without recursion.
 */
export const BODY_DEPTH = 32;

/** Whether a value nests deeper than `limit`. Iterative, and it looks no deeper than `limit + 1` levels. */
export function deeperThan(value: unknown, limit: number = BODY_DEPTH): boolean {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [x, depth] = stack.pop()!;
    if (x === null || typeof x !== 'object') continue;
    if (depth >= limit) return true;
    for (const v of Array.isArray(x) ? x : Object.values(x)) stack.push([v, depth + 1]);
  }
  return false;
}

const listed = (x: unknown): string => (Array.isArray(x) ? x.map(words).join(' or ') : words(x));

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** The fewest and the most days each month has, a common year's February and a leap year's. */
const SHORTEST = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const LONGEST = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/**
 * A clock of months as a person says one (`clock.ts` in the kernel), or `null` for any other clock.
 *
 * MEASURED BEFORE THIS: `{ every: 1mo, day: last, at: 09:00 }` was said as "Every 1mo at 09:00 on last.", the weekly
 * sentence with a month's words dropped into it. A clock of three months names the four months it falls in rather
 * than `3mo` and a month to count from, because that is the arithmetic a person approving it would otherwise do, and a
 * day some months lack says where it falls in them, so nobody reads "the 31st" and wonders about April.
 *
 * IT READS ONLY WHAT THE KERNEL'S LINT TAKES, `Nmo` or `Ny` with a day and a time, and anything else falls through to the
 * sentence every other clock gets, so a body the lint would refuse is still said as it was written.
 */
function calendarSaid(on: Body): string | null {
  const count = typeof on.every === 'string' ? /^([1-9]\d{0,2})(mo|y)$/u.exec(on.every) : null;
  if (count === null || typeof on.at !== 'string') return null;
  const months = Number(count[1]) * (count[2] === 'y' ? 12 : 1);
  const day = on.day === 'last' ? 'last' : typeof on.day === 'number' && Number.isInteger(on.day) && on.day >= 1 && on.day <= 31 ? on.day : null;
  if (day === null || ![1, 2, 3, 4, 6, 12].includes(months)) return null;
  const which = day === 'last' ? 'the last day' : `the ${ordinal(day)}`;
  if (months === 1) {
    const short = day !== 'last' && day > SHORTEST[1]! ? `, or on the last day of a month that has no ${ordinal(day)}` : '';
    return `On ${which} of each month at ${on.at}${short}.`;
  }
  const from = typeof on.month === 'string' ? MONTH_WORDS.indexOf(on.month) : -1;
  if (from < 0) return null;
  const falling = MONTH_NAMES.map((_, m) => m).filter((m) => (((m - from) % months) + months) % months === 0);
  /* THE FALLBACK IS SAID ONLY WHERE ONE OF THESE MONTHS CAN LACK THE DAY, and a yearly day its month never has is said
     as the last day, which is where `clock.ts` puts it every year. */
  const short = day !== 'last' && falling.some((m) => day > SHORTEST[m]!);
  if (months === 12) {
    const name = MONTH_NAMES[from]!;
    if (day !== 'last' && day > LONGEST[from]!) return `On the last day of ${name} each year at ${on.at}.`;
    return `On ${which} of ${name} each year at ${on.at}${short ? `, or on the last day of ${name} in a year that has no ${ordinal(day as number)}` : ''}.`;
  }
  const falls = falling.map((m) => MONTH_NAMES[m]!);
  const listed = `${falls.slice(0, -1).join(', ')} and ${falls.at(-1)!}`;
  return `On ${which} of ${listed} at ${on.at}${short ? `, or on the last day of a month that has no ${ordinal(day as number)}` : ''}.`;
}

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
      const monthly = calendarSaid(on);
      if (monthly !== null) return monthly;
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
 * descending on its own. That bounded the branches and not the values: this comment said `said` was then safe whoever
 * calls it, and a deep array in one step still blew the stack in `words` (audit thirty-six, finding 8). `PRINT_DEPTH`
 * bounds the values, and only the two together make it so.
 */
export const SAID_DEPTH = 3 + 5;

/**
 * Every other list a body's steps reach and the kernel's walk would look into: a `link`'s target and a `create`'s list,
 * with where each step sits. It descends no further than `SAID_DEPTH` branches, as `stepLines` does.
 */
export function listsReached(body: Body): { register: string; at: string }[] {
  const out: { register: string; at: string }[] = [];
  const walk = (list: unknown, at: string, depth: number): void => {
    if (!Array.isArray(list) || depth > SAID_DEPTH) return;
    for (const [i, step] of list.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${String(i)}]`;
      /* A STEP WITH AN `if` IS STILL READ FOR A `link` AND A `create`, and not skipped once its branches are walked. The
         kernel's `describe` has no `if` case, so `{ if, link }` was looked up in Money for a member refused Money. */
      if ('if' in step) {
        walk(step.then, `${here}.then`, depth + 1);
        walk(step.else, `${here}.else`, depth + 1);
      }
      const link = isObject(step.link) && isObject(step.link.to) ? step.link.to.register : undefined;
      if (typeof link === 'string') out.push({ register: link, at: `${here}.link.to.register` });
      const create = isObject(step.create) ? step.create.register : undefined;
      if (typeof create === 'string') out.push({ register: create, at: `${here}.create.register` });
    }
  };
  walk(body.then, 'rule.then', 0);
  walk(body.steps, 'rule.steps', 0);
  return out;
}

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
function stepLines(step: unknown, depth: number, out: string[], slash: boolean): void {
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
    for (const inner of Array.isArray(s.then) ? s.then : []) stepLines(inner, depth + 1, out, slash);
    if (s.else !== undefined) {
      line('Otherwise:');
      for (const inner of Array.isArray(s.else) ? s.else : []) stepLines(inner, depth + 1, out, slash);
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
  if ('script' in s) {
    /* WHAT THE RUNNER DOES, NOT WHAT THE STEP'S NAME PROMISES. The first cut of this line said "keep its answer", and
       `as:` holds the id of the queued job: the script's answer never comes back into the run (`startScript`). And the
       three ways the step fails are said, because each one is a thing the owner controls from the script's own row. */
    const run = spec('script');
    const as = run.as === undefined ? '' : `, keep the id of its queued run as ${words(run.as)},`;
    return line(
      `Start script.${words(run.id)}${as} and go on without waiting for it: what it writes lands when this host runs it. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused, or if its input hands on what a secret or file field holds.`,
    );
  }
  if ('ask_slash' in s) {
    const ask = spec('ask_slash');
    const asked = `Ask Slash ${JSON.stringify(words(ask.question))}, and keep the answer as ${words(ask.as)}.`;
    if (!slash) return line(`${asked}${NOT_INSTALLED}`);
    /* WHERE THE HOST ANSWERS, WHAT LEAVES THE RECORD, because that is the question the owner accepting it is asked. The
       run sends `about:`'s fields, and the question as `flow.ts`'s `ask` fills it from the row, so a field the braces
       name goes out in the question's own words. Less any secret or file field in both, which this line cannot see
       without the list's schema and the runner drops whatever the lint let through.
       THE BRACES ARE SAID BECAUSE THE FIRST CUT OF THIS LINE LEFT THEM OUT: `Rate for {{what}} and {{trigger.row.note}}?`
       with no `about:` read "goes with no field of the row", and the queued job asked "Rate for Rent and monthly?". */
    const sent = Array.isArray(ask.about) ? ask.about.map(words) : [];
    const about = sent.length === 0 ? 'no field of the row' : `the row's ${sent.length === 1 ? sent[0] : `${sent.slice(0, -1).join(', ')} and ${sent.at(-1)}`}`;
    const goes = words(ask.question).includes('{{') ? `what its braces name filled in, and with ${about === 'no field of the row' ? 'no other field of the row' : about}` : about;
    return line(`${asked} The run waits up to ${ASK_SLASH_WAIT} for this host's model to answer, and stops here without one. The question goes with ${goes}.`);
  }
  if ('ask_person' in s) {
    /* IN DECIDE, WHERE ANYONE WHO DECIDES ANSWERS IT: nothing addresses a question to one person, and the lint refuses
       `to:` for that reason, so the line names no person. */
    const ask = spec('ask_person');
    const wait = typeof ask.wait === 'string' ? ask.wait : ASK_PERSON_WAIT;
    return line(`Ask in Decide ${JSON.stringify(words(ask.question))}, ${listed(ask.options)}, and keep the answer as ${words(ask.as)}. If nobody answers within ${wait}, the run stops here.`);
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
 *
 * `answersSlash` IS THE HOST'S SWITCH, THE ONE THE KERNEL'S LINT READS (`RecordDeps.answersSlash`). Without it every
 * `ask_slash` step read "refused at install", and on a self-host with a model the same rule installed and ran to
 * `waiting` with its question queued (`automations-slash.test.ts`). Absent is no, which is what the lint says too.
 */
export function said(body: Body, { answersSlash = false }: { answersSlash?: boolean } = {}): Said {
  const out: string[] = [];
  const list = body.steps ?? body.then;
  for (const step of Array.isArray(list) ? list : []) stepLines(step, 0, out, answersSlash);
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
  /**
   * The list whose rows start it, or `null` for a clock, a button or an arrival.
   *
   * NOT WHO MAY SEE IT: a rule on Inbox may create rows in Money, and the record's `automations` door asks every list
   * the body touches.
   */
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
 *
 * `shown` IS ASKED OF THE WHOLE BODY, BEFORE A RUN IS COUNTED. The record's door filtered the rows afterwards by
 * `register`, which is the list a rule's row lives in and nothing more, so an Inbox rule whose step creates Money rows
 * reached the member invited to Inbox alone (SEC-4). Who may see a rule is every list its body touches, which only the
 * body says, and a rule held back costs no query of its runs.
 */
export function automations(sql: Sql, nowMs: number, shown: (id: string, body: Body) => boolean = () => true): AutomationRow[] {
  return sql
    .all<Declared>(`SELECT id, version, body, pack_id FROM declaration WHERE ${LIVE} ORDER BY id`)
    .filter((d) => shown(d.id, JSON.parse(d.body) as Body))
    .map((d) => row(sql, d, nowMs).row);
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

/* ── the installed scripts, and how their runs went ────────────────── */

/**
 * One installed script as the `scripts` read answers it: what it may touch, whether it is paused, its last run and how
 * close it is to being paused.
 *
 * NOTHING SEALED AND NO LOG. A key is its vault label, which the declaration already names. A run's log quotes what the
 * script read, so it stays on the run's event, where `lineOf` holds it to an owner who reads every list the version
 * touched; the `say` here is the event's note, which is the record's own sentence and which every whole-record reader
 * already sees in `recentHistory`.
 */
export type ScriptRow = {
  /** `script.<id>`, the declaration's own id. */
  id: string;
  /** The bare id, as `resumeScript` takes it. */
  script: string;
  /** Its `title`, or the id when it has none. */
  title: string;
  version: number;
  pack: string | null;
  runs: { every: string | null; door: string | null; rule: boolean };
  reads: string[];
  writes: string[];
  /** The origins it may fetch from. */
  egress: string[];
  /** The keys it may have opened for a request, by label. */
  keys: string[];
  /** `paused` after three refused runs in a row, until somebody resumes it; `on` otherwise. */
  status: 'on' | 'paused';
  /** When its clock next starts it, while one is armed. */
  next: string | null;
  last: { at: string; version: number | null; outcome: string; say: string } | null;
  /** Refused runs of the version now installed since its last good run or resume, and how many pause it. */
  refused: { in_a_row: number; pauses_at: number };
  /** This calendar month so far, UTC. `runs` counts only runs that ran the source: `ok` and `refused`. */
  month: { runs: number; ok: number; refused: number };
};

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/**
 * Every live script, by id.
 *
 * FROM THE RECORD'S OWN ROWS, as `listActions` is: the declaration, the `schedule` row of kind `script` that every
 * installed script has (one only a door or a rule starts has one too, which pausing reads), and the `pull` events
 * `meter` wrote for its runs, signed `script:<id>@v<n>`. The streak is read the way `pauseAfterRefusals` reads it: only
 * the installed version's `ok` and `refused` runs, a resume (an event with no `to_v`) ending it, so the number here is
 * the one that pauses it.
 */
export function scripts(sql: Sql, nowMs: number): ScriptRow[] {
  const month = `${new Date(nowMs).toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  return sql
    .all<Declared>("SELECT id, version, body, pack_id FROM declaration WHERE kind = 'script' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .map((d): ScriptRow => {
      const body = JSON.parse(d.body) as Body;
      const bare = d.id.slice('script.'.length);
      const target = `declaration:${d.id}`;
      const runs = isObject(body.runs) ? body.runs : {};
      const row = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'script' AND key = ?", bare);
      const every = typeof runs.every === 'string' ? runs.every : null;

      const lastEvent = sql.one<{ ts: string; actor: string; outcome: string; note: string | null }>(
        `SELECT ts, actor, json_extract(to_v, '$.outcome') AS outcome, note FROM event
          WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL AND json_valid(to_v) AND json_extract(to_v, '$.outcome') IS NOT NULL
          ORDER BY rowid DESC LIMIT 1`,
        target,
      );
      const version = lastEvent ? /@v(\d+)$/.exec(lastEvent.actor) : null;

      let inARow = 0;
      for (const e of sql.all<{ outcome: string | null }>(
        `SELECT json_extract(to_v, '$.outcome') AS outcome FROM event
          WHERE kind = 'pull' AND target = ?
            AND (to_v IS NULL OR (actor = ? AND CASE WHEN json_valid(to_v) THEN json_extract(to_v, '$.outcome') END IN ('ok', 'refused')))
          ORDER BY rowid DESC LIMIT 50`,
        target,
        `script:${bare}@v${String(d.version)}`,
      )) {
        if (e.outcome !== 'refused') break;
        inARow += 1;
      }

      const counts = { runs: 0, ok: 0, refused: 0 };
      for (const r of sql.all<{ outcome: string; n: number }>(
        `SELECT json_extract(to_v, '$.outcome') AS outcome, count(*) AS n FROM event
          WHERE kind = 'pull' AND target = ? AND ts >= ? AND to_v IS NOT NULL AND json_valid(to_v) GROUP BY outcome`,
        target,
        month,
      )) {
        if (r.outcome !== 'ok' && r.outcome !== 'refused') continue;
        counts[r.outcome] += r.n;
        counts.runs += r.n;
      }

      return {
        id: d.id,
        script: bare,
        title: typeof body.title === 'string' && body.title.trim() !== '' ? body.title : bare,
        version: d.version,
        pack: d.pack_id ?? (typeof body.pack === 'string' ? body.pack : null),
        runs: { every, door: typeof runs.door === 'string' ? runs.door : null, rule: runs.rule === true },
        reads: strings(body.reads),
        writes: strings(body.writes),
        egress: strings(body.egress),
        keys: strings(body.keys),
        status: row?.state === 'paused' ? 'paused' : 'on',
        next: every !== null && (row?.state === 'pending' || row?.state === 'firing') ? row.due_at : null,
        last: lastEvent ? { at: lastEvent.ts, version: version ? Number(version[1]) : null, outcome: lastEvent.outcome, say: lastEvent.note ?? '' } : null,
        refused: { in_a_row: inARow, pauses_at: REFUSED_IN_A_ROW },
        month: counts,
      };
    });
}
