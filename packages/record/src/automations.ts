/**
 * Automations as a person and an agent read them: the list, one with its runs, and what a body would do before it is
 * installed.
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

import { CAPABILITIES, capability, serves, touches } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { automationNames, listsNamed, type NamesRead } from './automation-names.ts';

/* THE KERNEL'S ONE CAPABILITY TABLE, HANDED ON FOR THE GRAMMAR AN AGENT READS (`packages/mcp/src/automations.ts`).
   `@braindog/mcp` depends on this package and not on the kernel, and `31 §2` forbids reaching into another package by a
   relative path, so the grammar takes the table from here, at `@braindog/record/automations`: what installs and what
   runs is one row, whichever of the lint, the runner, this dry run or the grammar reads it. */
export { CAPABILITIES, capability, notInThisBuild, serves, type Capability, type Hosts } from '@braindog/kernel';

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
 * The steps that do not run on every host this build ships, read from the kernel's one table (`capabilities.ts`), which
 * the lint and the runner read too: a step whose row does not run (`flow.ts` fails a run that reaches it with
 * `NOT_IN_THIS_BUILD`, after taking every step before it), and one that runs only on a host that answers Slash, which
 * the lint refuses at install elsewhere. `ask_person` is not here: it opens its question in Decide and the decision
 * wakes the run. Nor is `script`: `flow.ts`'s `startScript` queues the script's run and the run goes on.
 *
 * A LIST WRITTEN BY HAND HERE WENT STALE ONCE ALREADY: it named `script` after the runner stopped failing it, and the dry
 * run of Work's `rule.close_follow_ups` ended its one step with "Not in this build: a run stops here", on a record
 * where the same rule ran to `done` (`apps/selfhost/test/follow-ups.test.ts`). Read from the table, it moves when the
 * row does.
 *
 * SAID IN THE DRY RUN BECAUSE THE DRY RUN IS NOT THE LINT. A step whose row installs and does not run is one the canvas
 * can still draw, and an agent told only what it would do files the rule, the owner accepts it, and the first run fails
 * at that step while its author reads the dry run as a promise. `call` was such a step until the runner learned to
 * queue it and park the run on its answer.
 */
export const WAITS_ON_OTHERS: readonly string[] = CAPABILITIES.filter((c) => c.of === 'step' && !c.name.includes('.') && (!c.runs || c.hosts !== 'every')).map((c) => c.name);

/** Whether a step's row says a run takes it on this host. A verb the table does not hold is the lint's to refuse. */
const runsHere = (verb: string, slash: boolean): boolean => {
  const row = capability(verb);
  return row === undefined || (row.runs && serves(row, slash));
};

const NOT_BUILT = ' Not in this build: a run stops here, after the steps before it.';
const NOT_INSTALLED = ' Not in this build: a rule with this step is refused at install.';
/** `flow.ts`'s `ASK_PERSON_WAIT`, copied for the reason the three above are and held by the same test. */
const ASK_PERSON_WAIT = '7d';
/** `flow.ts`'s `ASK_SLASH_WAIT_MS` as a span, copied likewise and held by `automations-slash.test.ts`. */
const ASK_SLASH_WAIT = '1d';
/** `flow.ts`'s `CALL_WAIT_MS` as a span, copied likewise: how long a run waits on a call's answer. */
const CALL_WAIT = '1d';

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
 * 40 KB body off the wire with a 20,000-deep array in one `notify.say` threw
 * `RangeError: Maximum call stack size exceeded` out of here through the READ+ `dryRun`. Eight levels print every
 * predicate tree the lint lets install in full, which is what an `if` line shows, and past that a reader learns the
 * shape.
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
      /* THE KERNEL READS `when:` OVER THE ROW THE ARRIVAL WROTE, or with no row over its JSON body's top-level keys
         (`flow.ts`'s `onArrival`), so the sentence says both. */
      const when = body.when === undefined ? '' : `, if ${words(body.when)} of the row it files, or of the body when it files none`;
      return `When something arrives${at}${by}${state}, ${verified}${when}. A redelivery starts nothing.`;
    }
    case 'every': {
      /* HOW LATE A TURN MAY BE TAKEN, where the clock says: a later one is recorded as skipped (`flow.ts`'s `onClock`). */
      const late = typeof on.late === 'string' ? ` A turn reached more than ${on.late} late is skipped and said.` : '';
      const monthly = calendarSaid(on);
      if (monthly !== null) return `${monthly}${late}`;
      const at = typeof on.at === 'string' ? ` at ${on.at}` : '';
      const day = typeof on.day === 'string' ? ` on ${on.day}` : '';
      return `Every ${words(on.every)}${at}${day}.${late}`;
    }
    case 'manual':
      return "When somebody presses Run now in the app, or an agent runs it while the owner lets agents do everything without asking.";
    case 'metric': {
      /* READ EACH HOUR, AND A CROSSING IS A CHANGE OF SIDE (`flow.ts`'s `onMetrics`): the first reading only sets the
         side, which the sentence says, since a rule whose figure is already past the line starts nothing until it
         comes back and crosses again. */
      const spec = isObject(on.metric) ? on.metric : {};
      const line = spec.crosses === 'target' ? 'its target' : isObject(spec.crosses) && 'gte' in spec.crosses ? `${words(spec.crosses.gte)}, going either way` : isObject(spec.crosses) && 'lte' in spec.crosses ? `${words(spec.crosses.lte)}, going either way` : words(spec.crosses);
      return `When the figure ${words(spec.id)} crosses ${line}, read each hour. The first reading only says which side it is on.`;
    }
    default: {
      /* ONCE PER QUESTION DECIDED (`flow.ts`'s `onDecided`), narrowed by the declaration that filed it and the answer. */
      const spec = isObject(on.decided) ? on.decided : {};
      const about = typeof spec.about === 'string' ? ` that ${spec.about} put there` : '';
      const option = typeof spec.option === 'string' ? `, and the answer is ${JSON.stringify(spec.option)}` : '';
      return `When a question in Decide${about} is decided${option}. The run reads the row the question is about, where it names one.`;
    }
  }
}

/**
 * How deep a branch may nest before the dry run stops saying it: the lint's `DEPTH_CEILING` (3) and a margin.
 *
 * THE DRY RUN IS A READ, AND IT RAN BEFORE THE LINT. `propose` lints first and refuses depth over 3, but the READ+
 * `dryRun` route takes any body a read token sends, and a body nested some 2,000 `if` levels deep (about 50 KB) blew
 * the stack in `stepLines`, so the host answered INTERNAL. Past this depth the record refuses instead, and `stepLines`
 * stops descending on its own. That bounded the branches and not the values: this comment said `said` was then safe
 * whoever calls it, and a deep array in one step still blew the stack in `words`. `PRINT_DEPTH` bounds the values, and
 * only the two together make it so.
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
  if (!isObject(step)) return line(`A step BrainDog cannot read: ${words(step)}.`);
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
    /* WHAT THE RUNNER DOES WITH IT (`flow.ts`): the run waits on the answer, up to a day, and a call the host stops ends
       the run with the host's sentence. The day is `CALL_WAIT_MS`, copied for the reason the waits above are. */
    const as = spec('call').as === undefined ? '' : `, and keep its answer as ${words(spec('call').as)}`;
    if (!runsHere('call', slash)) return line(`Call ${words(spec('call').ingest)}, a declared call${as}.${NOT_BUILT}`);
    return line(`Call ${words(spec('call').ingest)}, a declared call${as}. The run waits up to ${CALL_WAIT} for the answer, and stops here without one.`);
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
    if (!runsHere('ask_slash', slash)) return line(`${asked}${NOT_INSTALLED}`);
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
    /* IN DECIDE, WHERE ANYONE WHO DECIDES ANSWERS IT, unless `to:` puts it to one member, whom `govern.ts`'s `decide`
       holds it to with an owner beside them. The line says that and names nobody: `to:` is an id, or a hole the run fills
       from the row, and neither is a name a person reads. */
    const ask = spec('ask_person');
    const wait = typeof ask.wait === 'string' ? ask.wait : ASK_PERSON_WAIT;
    /* `to:` IS SAID ONLY WHERE ITS ROW INSTALLS; where it does not, the line says what the lint will say. */
    const to = ask.to === undefined ? '' : capability('ask_person.to')?.installs === true ? ' Only the one member it is put to, or an owner, answers it.' : NOT_INSTALLED;
    return line(`Ask in Decide ${JSON.stringify(words(ask.question))}, ${listed(ask.options)}, and keep the answer as ${words(ask.as)}. If nobody answers within ${wait}, the run stops here.${to}`);
  }
  if ('meet' in s) {
    /* WHO IT MEETS AND WHERE IT SAYS THEY WERE MET, which is what the owner accepting it is asked. */
    const meet = spec('meet');
    const who = ['name', 'email', 'handle'].filter((k) => meet[k] !== undefined).map((k) => `${k} ${JSON.stringify(words(meet[k]))}`).join(', ');
    return line(`Meet the person with ${who} into People, as met at ${JSON.stringify(words(meet.where))}: matched by email or handle, added when nobody matches, and a merge asked in Decide when the name is somebody else's. Nobody is met when all of it is empty.`);
  }
  if ('run_job' in s) {
    const job = spec('run_job');
    const as = job.as === undefined ? '' : `, and keep how it ended (ok, needs_decision or error) as ${words(job.as)}`;
    return line(`Start a ${words(job.kind)} job on the owner's machine${as}. The run waits up to a day for it to end, and stops here without an end.`);
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
  if ('create' in s) {
    /* THE LIST AND WHAT IT FILLS, which is what the owner accepting it is asked: the fields by name, since their values
       are filled when the run takes the step and a dry run reads no row. */
    const create = spec('create');
    const filled = isObject(create.fields) ? Object.keys(create.fields) : [];
    const fields = filled.length === 0 ? '' : `, filling ${filled.length === 1 ? filled[0] : `${filled.slice(0, -1).join(', ')} and ${filled.at(-1)}`}`;
    const crossed = Array.isArray(create.each) && create.each.length > 0 ? `, one for each ${create.each.map(words).join(' and ')} the row holds` : '';
    return line(`Create up to ${words(create.bound)} rows in ${words(create.register)}${crossed}${fields}.`);
  }
  if ('suggest' in s) return line(`Ask on Decide ${JSON.stringify(words(spec('suggest').question))}, ${listed(spec('suggest').options)}.`);
  if ('run' in s) return line(`Send the declared call ${words(s.run)}.`);
  if ('stop' in s) return line('Stop, and take no further step.');
  return line(`A step BrainDog does not know: ${words(step)}.`);
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
  /**
   * What its card says: `name`, else the title of the one script it starts, else the id.
   *
   * THE SCRIPT'S TITLE BEFORE THE ID: a rule whose one step starts a script is that script
   * to a person, and Automations listed it as "Close follow ups" while Scripts called it "Close the follow-ups of a
   * finished task". A name the rule gives itself still comes first, since several rules may start one script.
   */
  name: string;
  /** The script its one step starts, by id and title, or `null` for a rule that does anything else. */
  script: { id: string; title: string } | null;
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
  /**
   * The instant it last fired, or `null` when the record holds nothing from it: when its newest run started, and for an
   * inline rule, which leaves no run, the newest line of the log it signed (`rule:<id>`).
   */
  lastFired: string | null;
  /** This calendar month so far, UTC, from the runs themselves. An inline rule's firings are events, not runs. */
  month: { runs: number; done: number; failed: number; cancelled: number };
  /**
   * How many times its work has landed, ever: an inline rule's patch on one row, or a run opened. The kernel's
   * `rule_stat` (migration 34), raised where the work lands and back-filled once from the log, so it is the whole count
   * and not a page of history. 0 is the page's "never".
   */
  fired: number;
  /** When it last did, from the same row, or `null` when `fired` is 0. */
  last_at: string | null;
  /** One sentence on why it has not fired, when `fired` is 0, and `null` otherwise (`idleSaid`). */
  why_idle: string | null;
  /** How many times it ran or landed its work in the last seven days, counted as `fired` is. */
  week: number;
  /**
   * How many times it ran or landed its work in this calendar month so far, UTC, counted as `fired` is: the kernel's
   * `rule_month` (migration 48), a dated count, so "this month" over a rule is the month's and never the whole count.
   */
  month_fired: number;
  /**
   * The same key for every rule that does the same thing to the same list: the list, the path, and each action with
   * the field it acts on (`familyOf`). The page draws "Category by payee, 57 rules" as one line by it. A handle, never
   * words, and `null` for a body with no list or nothing to do.
   */
  family: string | null;
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

/**
 * One automation with a page of its runs, newest first. `older` is the run to pass as `before` for the page after this
 * one, or `null` when this page reaches the first run the record keeps.
 */
/**
 * One automation as its read answers it: the row, its body, a page of its runs, and `names`, the title of every list,
 * field, person, call, script, door, figure and kind of job the body names, keyed by the id as the body holds it
 * (`automation-names.ts`). An id the caller cannot see, or one that is gone, has no name.
 */
export type Automation = AutomationRow & { body: Body; runs: AutomationRun[]; older: string | null; names: Record<string, string> };

/** How many runs one automation shows. Ten: the list is for reading what just happened, not an archive. */
export const RUNS_SHOWN = 10;

/**
 * The most runs one page holds when a caller asks for more than `RUNS_SHOWN`: each run carries its steps, read one query
 * a run, so a page is held to what one answer should cost. Older runs are the next page's.
 */
export const RUNS_PAGE_MOST = 50;

/** Which page of an automation's runs to read: those started before the run `before`, at most `limit` of them. */
export type RunsPage = { before?: string | undefined; limit?: number | undefined };

type Declared = { id: string; version: number; body: string; pack_id: string | null };

/**
 * A caller held to some rows of a list a rule touches, as the record's door reads them (sec3, 2 Nov): which runs she is
 * shown, by the row that started each, which rows an inline rule wrote she is shown, and a run's sentence as she is
 * shown it. `null` where she reads every list whole, and nothing is held.
 *
 * WHY. A contractor shared one project's tasks was handed every run of a Tasks rule, the other projects' among them,
 * and a failure's words quoting a row of another project, on the canvas and through MCP alike.
 */
export type RunsHeld = {
  /** The ids among these runs she is shown: a run started by a row she reads, and none started by no row. */
  runs: (runs: readonly { id: string; trigger: string }[]) => Set<string>;
  /** The ids among these rows she is shown. */
  rows: (ids: readonly string[]) => Set<string>;
  /** A run's or a step's words as she is shown them: as said, or one plain line when they name a row held from her. */
  said: (words: string | null) => string | null;
};

type RunRead = { id: string; trigger: string; state: RunState; started_at: string; finished_at: string | null; say: string | null };

/** Every run of one rule she is shown, newest first. */
const heldRuns = (sql: Sql, bare: string, held: RunsHeld): RunRead[] => {
  const all = sql.all<RunRead>('SELECT id, trigger, state, started_at, finished_at, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC', bare);
  const shown = held.runs(all);
  return all.filter((r) => shown.has(r.id));
};

/** The instants an inline rule's work landed on rows she is shown, one a write, as `writesOf` counts them. */
const heldWrites = (sql: Sql, bare: string, held: RunsHeld): string[] => {
  const all = sql.all<{ target: string; ts: string }>(
    `SELECT target, max(ts) AS ts FROM event WHERE actor = ? AND target_kind = 'entry' AND target LIKE 'entry:%' AND kind <> 'note'
      GROUP BY coalesce(batch, id), target`,
    `rule:${bare}`,
  );
  const shown = held.rows([...new Set(all.map((w) => w.target.slice('entry:'.length)))]);
  return all.filter((w) => shown.has(w.target.slice('entry:'.length))).map((w) => w.ts);
};

/** The most entries one idle sentence counts. Past it the sentence says "1,000 or more", and the read stays one page. */
export const IDLE_COUNTED_MOST = 1_000;

/** What a person calls a list: the name its declaration gives it, or its id with `_` as a space. `ingest.ts`'s `listName`. */
function listName(sql: Sql, register: string): string {
  let name: unknown;
  try {
    const d = sql.one<{ body: string }>(`SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0`, `register.${register}`);
    name = d ? (JSON.parse(d.body) as Body).name : undefined;
  } catch {
    name = undefined;
  }
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  const said = register.replace(/_/g, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/**
 * Why a rule that has never fired has not, in one sentence a person reads.
 *
 * THE COUNT READS THE LIST, NEVER THE LOG. A record whose history was pruned would say "34 were added" of a list that
 * holds fewer, so what was added is the list's own entries made since the rule's first version was installed, the ones
 * still there, counted no further than `IDLE_COUNTED_MOST`. A rule woken by a change and not by an addition counts the
 * entries changed since instead. A rule about no list says what it waits for.
 */
function idleSaid(sql: Sql, id: string, body: Body): string {
  if (body.enabled === false) return 'It is turned off.';
  const register = subjectOf(body);
  const trigger = triggerOf(body);
  if (register === null) {
    if (trigger === 'every') return 'Its time has not come round since it was turned on.';
    if (trigger === 'manual') return 'Nobody has started it since it was turned on.';
    if (trigger === 'arrival') return 'Nothing it waits for has arrived since it was turned on.';
    if (trigger === 'metric') return 'The number it watches has not crossed its mark since it was turned on.';
    if (trigger === 'decided') return 'No decision has woken it since it was turned on.';
    return 'Nothing has started it since it was turned on.';
  }
  /* FROM THE LIVE VERSION, the one turned on or edited last: the first one's day would count entries a rule written
     since never saw, and "since it was turned on" would not be true of them. */
  const since =
    sql.one<{ at: string | null }>('SELECT created_at AS at FROM declaration WHERE id = ? AND superseded_at IS NULL ORDER BY version DESC LIMIT 1', id)?.at ?? '';
  const written = isObject(body.on) && isObject(body.on.written) ? body.on.written : null;
  const changed = Array.isArray(written?.op) && !written.op.includes('create');
  const n =
    sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM (SELECT 1 FROM entry WHERE register = ? AND deleted_at IS NULL AND ${changed ? 'updated_at' : 'created_at'} >= ? LIMIT ?)`,
      register,
      since,
      IDLE_COUNTED_MOST,
    )?.n ?? 0;
  const list = listName(sql, register);
  const verb = changed ? 'changed in' : 'added to';
  if (n === 0) return `No entry has been ${verb} ${list} since it was turned on.`;
  if (n === 1) return `One entry was ${verb} ${list} and it did not match.`;
  const many = n >= IDLE_COUNTED_MOST ? `${IDLE_COUNTED_MOST.toLocaleString('en-US')} or more` : String(n);
  return `${many} were ${verb} ${list} and none matched.`;
}

/**
 * The key every rule that does the same thing to the same list shares: its list, its path, and each action it takes
 * with the field that action acts on, sorted, so the order a body lists them in does not split a family.
 *
 * READ FROM THE BODY'S SHAPE AND NOTHING ELSE. No list and no add-on is named here: fifty-seven rules that each set
 * Category on Ledger for one payee share a key because their bodies have one shape, and a pack that ships the same
 * shape on another list gets its own family by the same sum. What a rule matches (`when`) and the value it writes are
 * what differ inside a family, so neither is in the key.
 */
export function familyOf(body: Body): string | null {
  const register = subjectOf(body);
  const did = Array.isArray(body.then) ? body.then : Array.isArray(body.steps) ? body.steps : null;
  if (register === null || did === null) return null;
  const parts = new Set<string>();
  for (const step of did) {
    if (!isObject(step)) continue;
    /* AN ACTION OR A STEP IS NAMED BY ITS ONE KEY, and a branch by `if` whatever else it carries. */
    const verb = 'if' in step ? 'if' : Object.keys(step)[0];
    if (verb === undefined) continue;
    const arg = step[verb];
    const field = verb !== 'if' && isObject(arg) && typeof arg.field === 'string' ? arg.field : null;
    parts.add(field === null ? verb : `${verb}:${field}`);
  }
  if (parts.size === 0) return null;
  return `${register}/${pathOf(body)}/${[...parts].sort().join('+')}`;
}

const OPEN = "state IN ('pending', 'running', 'waiting')";

/** How many runs a rule has opened, the whole of them. */
const runsOf = (sql: Sql, bare: string): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run WHERE rule = ?', bare)?.n ?? 0;

/**
 * How many times an inline rule's work landed, from the log: a line it signed on an entry, outside a note, once per entry
 * per triggering write, since one patch writes a line per field. The same sum migration 34 back-filled `rule_stat` by.
 */
const writesOf = (sql: Sql, bare: string, since = ''): number =>
  sql.one<{ n: number }>(
    `SELECT count(*) AS n FROM (SELECT 1 FROM event WHERE actor = ? AND target_kind = 'entry' AND target LIKE 'entry:%' AND kind <> 'note' AND ts >= ?
     GROUP BY coalesce(batch, id), target)`,
    `rule:${bare}`,
    since,
  )?.n ?? 0;

/** The script a body's one step starts, with its title (the id where it has none), or `null`. */
function scriptOf(sql: Sql, body: Body): { id: string; title: string } | null {
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const only = steps.length === 1 && isObject(steps[0]) && isObject(steps[0].script) ? steps[0].script : null;
  const id = only && typeof only.id === 'string' && only.id !== '' ? only.id : null;
  if (id === null) return null;
  let title: unknown;
  try {
    const d = sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'script' AND superseded_at IS NULL AND retired = 0", `script.${id}`);
    title = d ? (JSON.parse(d.body) as Body).title : undefined;
  } catch {
    title = undefined;
  }
  return { id, title: typeof title === 'string' && title.trim() !== '' ? title.trim() : id };
}

function row(sql: Sql, d: Declared, nowMs: number, held: RunsHeld | null = null): { row: AutomationRow; body: Body } {
  const body = JSON.parse(d.body) as Body;
  const bare = d.id.slice('rule.'.length);
  const script = scriptOf(sql, body);
  if (held !== null) return { body, row: heldRow(sql, d, body, bare, script, nowMs, held) };
  /* THE CLOCK ROW `flow.ts` KEYS `flow.every:<id>`, which the install arms one interval out. `firing` counts as armed:
     the drain holds a row there while it takes the turn, and the next due time is written back when it lets go. */
  const next = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = ? AND state IN ('pending', 'firing')", `flow.every:${bare}`);
  const open = sql.one<{ n: number }>(`SELECT count(*) AS n FROM automation_run WHERE rule = ? AND ${OPEN}`, bare)?.n ?? 0;
  const last = sql.one<{ id: string; state: RunState; started_at: string; finished_at: string | null; say: string | null }>(
    'SELECT id, state, started_at, finished_at, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC LIMIT 1',
    bare,
  );
  /* AN INLINE RULE'S FIRINGS ARE EVENTS, NOT RUNS, so `last` is `null` for one however often it fired, and the web read
     a page of the log to say when (`firedOf` in `apps/web/src/lib/flow/source.ts`), which says "nothing lately" of a
     rule whose last turn sits below that page. The log is the record's own, and every write a rule makes is signed
     `rule:<id>` (`rules.ts`), so the newest one is read here, by `event_actor`. A rule with runs fired when its newest
     run started, since the lines after that are the same firing's steps. */
  const signed = sql.one<{ ts: string | null }>('SELECT max(ts) AS ts FROM event WHERE actor = ?', `rule:${bare}`)?.ts ?? null;
  const lastFired = last ? (signed !== null && pathOf(body) === 'inline' && signed > last.started_at ? signed : last.started_at) : signed;
  /* KEYED BY THE BODY'S OWN NAME, as `rules.ts` raises it and `rule:<name>` signs the log; the bare id is the same name
     on every rule this build installs. */
  const stat = sql.one<{ fired: number; last_at: string | null }>(
    'SELECT fired, last_at FROM rule_stat WHERE rule = ?',
    typeof body.rule === 'string' && body.rule !== '' ? body.rule : bare,
  );
  /* A RESTORED OR IMPORTED RECORD HAS NO `rule_stat`, which is `local` and travels in no export (migration 34), while
     the log it carries still says the rule fired. A rule the log signs is never said to have matched nothing: its count
     is read from the log as the migration back-filled it, its runs or its writes, and is never under one. */
  let fired = stat?.fired ?? 0;
  let last_at = fired > 0 ? (stat?.last_at ?? null) : null;
  if (fired === 0 && lastFired !== null) {
    fired = Math.max(1, last ? runsOf(sql, bare) : writesOf(sql, bare));
    last_at = lastFired;
  }
  const month = { runs: 0, done: 0, failed: 0, cancelled: 0 };
  for (const r of sql.all<{ state: string; n: number }>(
    'SELECT state, count(*) AS n FROM automation_run WHERE rule = ? AND started_at >= ? GROUP BY state',
    bare,
    `${new Date(nowMs).toISOString().slice(0, 7)}-01T00:00:00.000Z`,
  )) {
    month.runs += r.n;
    if (r.state === 'done' || r.state === 'failed' || r.state === 'cancelled') month[r.state] += r.n;
  }
  /* THIS MONTH, from the dated count kept beside the whole one (`rule_month`, migration 48). A record whose whole count
     came from the log above (restored or imported, no `rule_stat`) has none kept either, so its month is read from the
     log the same way: its writes, or its runs, since the first of the month. */
  const monthKey = new Date(nowMs).toISOString().slice(0, 7);
  const monthFrom = `${monthKey}-01T00:00:00.000Z`;
  const month_fired =
    stat !== undefined && stat !== null
      ? (sql.one<{ fired: number }>('SELECT fired FROM rule_month WHERE rule = ? AND month = ?', typeof body.rule === 'string' && body.rule !== '' ? body.rule : bare, monthKey)?.fired ?? 0)
      : fired === 0
        ? 0
        : last
          ? (sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run WHERE rule = ? AND started_at >= ?', bare, monthFrom)?.n ?? 0)
          : writesOf(sql, bare, monthFrom);
  /* THE LAST SEVEN DAYS, counted the way the whole count is: an inline rule by its writes, any other by its runs. */
  const weekFrom = new Date(nowMs - 7 * 86_400_000).toISOString();
  const week =
    pathOf(body) === 'inline'
      ? writesOf(sql, bare, weekFrom)
      : (sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run WHERE rule = ? AND started_at >= ?', bare, weekFrom)?.n ?? 0);
  return {
    body,
    row: {
      id: d.id,
      rule: bare,
      name: typeof body.name === 'string' && body.name.trim() !== '' ? body.name : script && script.title !== script.id ? script.title : bare,
      script,
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
      lastFired,
      month,
      fired,
      last_at,
      why_idle: fired > 0 ? null : idleSaid(sql, d.id, body),
      week,
      month_fired,
      family: familyOf(body),
    },
  };
}

/**
 * One rule's row as a caller held to some rows is shown it: every count, the last run and when it last fired worked out
 * from the runs and writes she is shown (`RunsHeld`), so how often it ran on rows she cannot see is not told either.
 */
function heldRow(sql: Sql, d: Declared, body: Body, bare: string, script: AutomationRow['script'], nowMs: number, held: RunsHeld): AutomationRow {
  const next = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'rule' AND key = ? AND state IN ('pending', 'firing')", `flow.every:${bare}`);
  const monthFrom = `${new Date(nowMs).toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  const weekFrom = new Date(nowMs - 7 * 86_400_000).toISOString();
  const runs = heldRuns(sql, bare, held);
  const last = runs[0];
  const month = { runs: 0, done: 0, failed: 0, cancelled: 0 };
  for (const r of runs) {
    if (r.started_at < monthFrom) continue;
    month.runs += 1;
    if (r.state === 'done' || r.state === 'failed' || r.state === 'cancelled') month[r.state] += 1;
  }
  const inline = pathOf(body) === 'inline';
  const times = inline ? heldWrites(sql, bare, held).sort().reverse() : runs.map((r) => r.started_at);
  const lastFired = times[0] ?? null;
  const fired = times.length;
  return {
    id: d.id,
    rule: bare,
    name: typeof body.name === 'string' && body.name.trim() !== '' ? body.name : script && script.title !== script.id ? script.title : bare,
    script,
    version: d.version,
    trigger: triggerOf(body),
    path: pathOf(body),
    register: subjectOf(body),
    project: typeof body.project === 'string' ? body.project : null,
    enabled: body.enabled !== false,
    pack: d.pack_id,
    next: next?.due_at ?? null,
    open: runs.filter((r) => r.state === 'pending' || r.state === 'running' || r.state === 'waiting').length,
    last: last ? { run: last.id, state: last.state, at: last.finished_at ?? last.started_at, say: held.said(last.say) } : null,
    lastFired,
    month,
    fired,
    last_at: lastFired,
    why_idle: fired > 0 ? null : idleSaid(sql, d.id, body),
    week: times.filter((t) => t >= weekFrom).length,
    month_fired: times.filter((t) => t >= monthFrom).length,
    family: familyOf(body),
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
 * reached the member invited to Inbox alone. Who may see a rule is every list its body touches, which only the body
 * says, and a rule held back costs no query of its runs.
 */
export function automations(sql: Sql, nowMs: number, shown: (id: string, body: Body) => boolean = () => true, held: RunsHeld | null = null): AutomationRow[] {
  return sql
    .all<Declared>(`SELECT id, version, body, pack_id FROM declaration WHERE ${LIVE} ORDER BY id`)
    .filter((d) => shown(d.id, JSON.parse(d.body) as Body))
    .map((d) => row(sql, d, nowMs, held).row);
}

/* ── the names one automation's body points at ─────────────────────── */

/** A live declaration's body by its id, or `undefined` when there is none or it is not a map. */
function declared(sql: Sql, id: string): Body | undefined {
  try {
    const d = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', id);
    const body: unknown = d ? JSON.parse(d.body) : undefined;
    return isObject(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

/** An id said as words, `_` and `-` as spaces: what `listName` and the canvas call a thing that names itself nothing. */
const inWords = (id: string): string => {
  const spoken = id.replace(/[_-]+/g, ' ').trim();
  return spoken.charAt(0).toUpperCase() + spoken.slice(1);
};

/** The first of `keys` a body holds as text. */
const textAt = (body: Body | undefined, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const v = body?.[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
};

/**
 * Whether the caller sees every list a script or a figure reads, by the kernel's one walk (`touches`, the question
 * Decide and the automations read ask), never a copy of it here. A figure counting another figure is placed through
 * that one's body, and a figure nothing places (`unknown`) is held, as is one naming no list (`ANY_LIST`) from anybody
 * who does not read every list.
 *
 * MEASURED: the first form of this walked `register.<id>` strings alone, so a figure with a leg naming its list by a
 * bare `register:` key read as touching only its other list, and was named to a member held from the first.
 */
function seesAll(sql: Sql, id: string, body: Body, sees: (list: string) => boolean): boolean {
  const { lists, unknown } = touches(id, body, {
    figure: (figure) => {
      const found = declared(sql, `metric.${figure}`);
      return found === undefined ? [] : [found];
    },
    door: (door) => declared(sql, `ingest.${door}`),
    fields: () => new Set(),
  });
  return unknown.size === 0 && [...lists].every(sees);
}

/**
 * The list playing People and the field holding a person's name, as `roles.ts`'s `meetsRole` reads it: the one list
 * declaring `meets:`. Two declaring lists are none, as there. A record older than the key, whose list is found by its
 * old name, is not read here: the core spells no add-on's id, so that list's people keep the web's words until the
 * kernel hands the role itself to the record.
 */
function peopleList(sql: Sql): { list: string; name: string } | null {
  const lists = sql
    .all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0")
    .flatMap((d) => {
      try {
        const body: unknown = JSON.parse(d.body);
        return isObject(body) ? [{ list: d.id.slice('register.'.length), body }] : [];
      } catch {
        return [];
      }
    });
  const declaring = lists.filter((l) => l.body.meets !== undefined);
  if (declaring.length > 1) return null;
  const [one] = declaring;
  return one ? { list: one.list, name: (isObject(one.body.meets) ? textAt(one.body.meets, ['name']) : null) ?? 'name' } : null;
}

/**
 * What the read of one automation can name, from the record's own tables, held to `sees`.
 *
 * A LIST THE CALLER CANNOT READ GIVES NO NAME, and neither do its fields, a person on it, or a figure or a script that
 * reads it: its title is the first thing `views` keeps from somebody it is not shared with. A door's and a call's
 * titles are the record's, which `actions` shows any reader, and a kind of job is the owner's approved list.
 */
function namesOf(sql: Sql, body: Body, sees: (list: string) => boolean): Record<string, string> {
  const lists = new Map<string, Body | undefined>();
  const list = (id: string): Body | undefined => {
    if (!lists.has(id)) lists.set(id, sees(id) ? declared(sql, `register.${id}`) : undefined);
    return lists.get(id);
  };
  let people: { list: string; name: string } | null | undefined;
  const read: NamesRead = {
    listTitle: (id) => {
      const decl = list(id);
      return decl === undefined ? null : (textAt(decl, ['name']) ?? inWords(id));
    },
    fieldTitle: (of, id) => {
      const fields = list(of)?.fields;
      const field = Array.isArray(fields) ? fields.find((f): f is Body => isObject(f) && f.id === id && f.retired !== true) : undefined;
      return field === undefined ? null : (textAt(field, ['label']) ?? inWords(id));
    },
    /* A MEMBER BY THE NAME THE RECORD HOLDS FOR THEM (`ask_person.to`), and otherwise somebody on the list playing People,
       by the field its role says holds a name. Never an email, which is not a name. */
    personName: (id) => {
      const member = sql.one<{ name: string | null }>('SELECT name FROM person WHERE id = ?', id)?.name?.trim();
      if (member) return member;
      people ??= peopleList(sql);
      if (people === null || list(people.list) === undefined) return null;
      const row = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ? AND register = ? AND deleted_at IS NULL', id, people.list);
      try {
        const fields: unknown = row ? JSON.parse(row.fields) : undefined;
        return isObject(fields) ? textAt(fields, [people.name]) : null;
      } catch {
        return null;
      }
    },
    declarationTitle: (id) => {
      const decl = declared(sql, id);
      if (decl === undefined) return null;
      if (id.startsWith('script.') && !seesAll(sql, id, decl, sees)) return null;
      return textAt(decl, ['name', 'title', 'heading']) ?? inWords(id.slice(id.indexOf('.') + 1));
    },
    figureTitle: (id) => {
      const decl = declared(sql, `metric.${id}`);
      if (decl === undefined || !seesAll(sql, `metric.${id}`, decl, sees)) return null;
      return textAt(decl, ['name', 'title', 'label']) ?? inWords(id);
    },
    door: (name) => declared(sql, `ingest.${name}`),
  };
  return automationNames(body, read);
}

/**
 * The sight a read of one automation holds when its caller hands none: the lists its body names. The record shows a
 * rule only to whoever reads every list it touches (`automations` in `index.ts`), so these are lists the caller reads;
 * a list it does not name, the one playing People or one a figure reads, is unseen here and gives no name.
 */
const seenIn = (sql: Sql, body: Body): ((list: string) => boolean) => {
  const named = listsNamed(body, (name) => declared(sql, `ingest.${name}`));
  return (list) => named.has(list);
};

/**
 * One live rule, by `chase` or `rule.chase`, with its body and a page of its runs, newest first; `null` when there is
 * none.
 *
 * THE PAGE IS KEYED BY A RUN, NOT BY A NUMBER OF RUNS SKIPPED. Runs are started while somebody reads the list, and an
 * offset counted from the newest would show a run twice or skip one as they arrive; the runs before a named run are
 * the same runs however many start after it. Ordered as the first page always was, by when each started and then by
 * the order the table holds them, so two runs of one instant keep one order. A `before` that names no run of this rule
 * reads as no page at all, and the caller refuses it first (`automations` in `index.ts`).
 *
 * `names` IS HELD TO `sees`, the caller's sight of one list. Without it, the lists the body itself names are the sight,
 * since the read is refused to anybody who cannot read them; nothing else gets a name.
 */
export function automation(sql: Sql, named: string, nowMs: number, page: RunsPage = {}, sees?: (list: string) => boolean, held: RunsHeld | null = null): Automation | null {
  const id = named.startsWith('rule.') ? named : `rule.${named}`;
  const d = sql.one<Declared>(`SELECT id, version, body, pack_id FROM declaration WHERE id = ? AND ${LIVE}`, id);
  if (!d) return null;
  const { row: shown, body } = row(sql, d, nowMs, held);
  const limit = Math.min(Math.max(1, Math.floor(page.limit ?? RUNS_SHOWN)), RUNS_PAGE_MOST);
  type Read = Omit<AutomationRun, 'steps' | 'trigger'> & { trigger: string };
  /* HELD: THE RUNS SHE IS SHOWN, PAGED HERE. A `before` she is not shown is refused by the door before this. */
  const heldPage = (h: RunsHeld): Read[] => {
    const all = sql.all<Read>('SELECT id, version, state, trigger, actor, started_at, finished_at, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC', shown.rule);
    const seen = h.runs(all);
    const mine = all.filter((r) => seen.has(r.id));
    const at = page.before === undefined ? -1 : mine.findIndex((r) => r.id === page.before);
    const from = page.before === undefined ? 0 : at < 0 ? mine.length : at + 1;
    return mine.slice(from, from + limit + 1);
  };
  /* ONE MORE THAN THE PAGE, so whether an older page exists is read here and not asked again. */
  const read = held !== null ? heldPage(held) : sql.all<Read>(
    page.before === undefined
      ? 'SELECT id, version, state, trigger, actor, started_at, finished_at, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC LIMIT ?'
      : `SELECT r.id, r.version, r.state, r.trigger, r.actor, r.started_at, r.finished_at, r.say
           FROM automation_run r JOIN automation_run b ON b.id = ? AND b.rule = r.rule
          WHERE r.rule = ? AND (r.started_at < b.started_at OR (r.started_at = b.started_at AND r.rowid < b.rowid))
          ORDER BY r.started_at DESC, r.rowid DESC LIMIT ?`,
    ...(page.before === undefined ? [shown.rule, limit + 1] : [page.before, shown.rule, limit + 1]),
  );
  const older = read.length > limit ? (read[limit - 1]?.id ?? null) : null;
  const runs = read
    .slice(0, limit)
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
      const steps = sql.all<AutomationRun['steps'][number]>('SELECT n, kind, state, answer, at FROM automation_step WHERE run = ? ORDER BY n', r.id);
      return {
        ...r,
        trigger: kind,
        ...(held === null ? {} : { say: held.said(r.say) }),
        steps: held === null ? steps : steps.map((st) => ({ ...st, answer: held.said(st.answer) })),
      };
    });
  return { ...shown, body, runs, older, names: namesOf(sql, body, sees ?? seenIn(sql, body)) };
}

/* ── the installed scripts, and how their runs went ────────────────── */

/* THE READ IS THE KERNEL'S (`script-rows.ts`), so a page's `scripts` block and this method answer the same rows. */
export { scriptRows as scripts, type ScriptRow } from '@braindog/kernel';
