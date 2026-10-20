/**
 * `braindog session show|next|tried|note|end`: the handoff from a shell.
 *
 * NO VERB NAMES A RUN. Each one addresses the caller's own run: inside Claude Code the one its session opened, and
 * elsewhere the one the session file for this folder names, unless no hook has heard from that one in twelve hours
 * (`ownRun` in `hooks.ts`). The session headers carry it, and `handoff` refuses a token that names a run explicitly.
 * A folder with no session file, outside a host session that says its id, is told so before anything is sent.
 *
 * `end` DEFAULTS TO IDLE, and says handoff or done only when asked. A run left at handoff waits to be
 * picked up and a run left idle does not, so one word cannot stand for all three.
 *
 * NO SENTENCE HERE REPEATS WHAT WAS TYPED. `parseArgs` quotes the argument it could not read, and that
 * argument may be a next step or a note, which would end up in an agent's logs.
 */

import { parseArgs } from 'node:util';

import type { Client } from '@braindog/client';
import { refused } from '@braindog/ports';

import { ago } from './brief.ts';
/* `clip` AND NOT `oneLine`: this file has its own `oneLine`, the verb that sends a next step, a tried or a note. */
import { clip } from './clip.ts';
import { asCaller, rememberedIn } from './hooks.ts';
import { hostSessionOf, positionOf } from './position.ts';
import { refuse } from './json.ts';
import { connect, fixOf, type AgentIo, type Connected } from './skills.ts';

/** `48 §4.4`: a refusal or a local failure is 1, and a host that did not answer is 3. */
const REFUSED = 1;
const UNREACHABLE = 3;

/* ── what it says ──────────────────────────────────────────────────────── */

type Line = 'next' | 'tried' | 'note';

const USAGE = 'braindog session takes show, next, tried, note or end.';
const USAGE_SHOW = 'braindog session show takes --host and nothing else.';
const USAGE_END = 'braindog session end takes --state, --next and --host, and nothing else.';
const usageLine = (verb: Line): string => `braindog session ${verb} takes one line of text, in quotes, and --host.`;

/**
 * The three states a run may be left in. `active` is not one: `end` is how a run stops.
 *
 * A SUBSET OF THE REGISTER'S STATES ON PURPOSE, and not a copy of them. The declaration carries
 * `active` and `abandoned` as well, and neither is something a person ends a session by choosing:
 * `active` is where a run already is, and `abandoned` is what the twelve-hour sweep decides. So
 * this list is a policy about what the command offers, which is why it is written here. The test
 * beside it checks every member against the declaration, so the policy cannot drift into naming a
 * state the record has not got.
 */
export const STATES = ['idle', 'handoff', 'done'] as const;
type State = (typeof STATES)[number];
const isState = (x: string): x is State => (STATES as readonly string[]).includes(x);

/* SPELLED FROM THE LIST RATHER THAN BESIDE IT. The sentence and the list sat two lines apart and
   said the same three words twice, so adding a fourth state would have been accepted by the guard
   and denied by the usage line, which is the worst of the two outcomes. */
const BAD_STATE = `braindog session end takes --state ${STATES.slice(0, -1).join(', ')} or ${STATES.at(-1)}.`;
const NO_SESSION = 'No session is open in this folder. Start a Claude Code session here, or run braindog hook start.';
const NO_RUN = 'The host has no open run for this folder. Start a session here and try again.';

const SAID: Record<Line, (spoken: string) => string> = {
  next: (spoken) => `${spoken} now carries that next step.`,
  tried: (spoken) => `${spoken} now carries that as already tried.`,
  note: (spoken) => `${spoken} now carries that note.`,
};

/** What a host with no `end` answers: no such method at all, or a route whose record is older than it (`hooks.ts`). */
const OLDER_HOST: ReadonlySet<string> = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);

const ENDED: Record<State, (spoken: string) => string> = {
  idle: (spoken) => `${spoken} is idle.`,
  handoff: (spoken) => `${spoken} is handed off.`,
  done: (spoken) => `${spoken} is done.`,
};

/* ── the pieces every verb shares ──────────────────────────────────────── */

/** A printed line ends in a full stop, whoever wrote the words inside it. */
const stopped = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * Whether there is a run to address, read before anything is sent: a session file for this folder, or a host session
 * that says its id, which names its run from any folder, a subfolder of the one it started in included.
 */
const openHere = (io: AgentIo): boolean => hostSessionOf(io.env) !== null || rememberedIn(io.env, io.cwd, null) !== null;

/** The handoff, the one line when it lands, and the exit code. */
async function send(at: Connected, args: Parameters<Client['handoff']>[0], io: AgentIo, line: string, value: Record<string, unknown>): Promise<number> {
  const out = await at.client.handoff(args);
  if (out.ok) {
    io.out(line);
    /* WHAT WAS LEFT, NOT WHAT WAS TYPED. The line itself is this file's one rule: a next step or a note
       may be anything somebody pasted, and an envelope is read by the same logs a sentence is. */
    io.answer?.({ value });
    return 0;
  }
  /* THE HOST'S FIX, NEVER AN EXCEPTION'S MESSAGE. An unreachable refusal carries one inside its fix, so
     that one case gets the fixed sentence `connect` uses. */
  if (refused(out) && out.refusal.code === 'UNREACHABLE') return refuse(io, out, `${at.to.key} did not answer.`);
  /* The exit code stays 1 for every other not-ok answer, `handoff`'s conflict included: this verb has
     never returned 2 and nothing in the record declares a conflict on it. */
  refuse(io, out, fixOf(out));
  return REFUSED;
}

/* ── show ──────────────────────────────────────────────────────────────── */

/** The most other runs one line names. */
const PER_LINE = 5;

/** The most tried lines shown, as the briefing shows them. */
const TRIED = 3;

async function show(rest: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  try {
    ({ values } = parseArgs({ args: rest, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a value typed as an argument. */
    io.say(USAGE_SHOW);
    return REFUSED;
  }
  if (!openHere(io)) {
    io.say(NO_SESSION);
    return REFUSED;
  }
  const at = await connect(values.host, asCaller(io).io);
  if (typeof at === 'number') return at;
  const c = at.context;
  if (c.session === null) {
    io.say(NO_RUN);
    return REFUSED;
  }

  const place = c.project ? `project ${clip(c.project.name, 60)}` : 'no project here';
  /* A STATE IS THE RECORD'S WORD, not a closed list: the client types it `string | null`, and `braindog context` clips
     the same field in its headline. Printed as sent here, a DEL and a U+009B in it reached the terminal. THE SPOKEN ID
     IS THE RECORD'S WORD TOO, so it is clipped to the 40 characters `headline` in `context.ts` gives it. */
  const spoken = clip(c.session.spoken, 40);
  io.out(c.session.state === null ? `${spoken} · ${place}.` : `${spoken} is ${clip(c.session.state, 40)} · ${place}.`);

  if (c.handoff === null) io.out('No handoff has been left here.');
  else {
    io.out(stopped(`Last handoff (${clip(c.handoff.from, 40)}, ${ago(c.handoff.age_s)}): ${clip(c.handoff.next, 200)}`));
    for (const tried of c.handoff.tried.slice(-TRIED)) io.out(stopped(`  Already tried: ${clip(tried, 160)}`));
  }

  const own = c.session.spoken;
  const others = c.live.same_repo.filter((r) => r.spoken !== own);
  if (others.length === 0) io.out('Nobody else is live in this repository.');
  else {
    /* OPEN IS NOT WORKING: a run not heard from in fifteen minutes (`WORKING_MS`) is said to have gone quiet, as the record works it out. */
    const stateOf = (r: (typeof others)[number]) => (r.quiet === true ? 'gone quiet' : typeof r.state === 'string' ? clip(r.state, 40) : 'unknown');
    const named = others.slice(0, PER_LINE).map((r) => `${clip(r.spoken, 40)} ${stateOf(r)}${r.doing ? ` "${clip(r.doing, 60)}"` : ''}, seen ${ago(r.age_s)}`);
    io.out(`Also live here: ${named.join('; ')}.`);
  }
  /* The same three facts the lines carry, unclipped: a caller that has to clip them can, and one that
     wants to know whether HEAD has moved needs the handoff's own head rather than forty characters of it. */
  io.answer?.({
    value: {
      run: c.session.spoken,
      state: c.session.state,
      project: c.project?.name ?? null,
      handoff: c.handoff,
      live: others,
    },
  });
  return 0;
}

/* ── next, tried, note ─────────────────────────────────────────────────── */

async function oneLine(verb: Line, rest: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be the line itself. */
    io.say(usageLine(verb));
    return REFUSED;
  }
  const [text, ...more] = positionals;
  /* REFUSED BEFORE ANYTHING IS READ OR SENT. Several of them is one sentence somebody forgot to quote. */
  if (text === undefined || more.length > 0 || !text.trim()) {
    io.say(usageLine(verb));
    return REFUSED;
  }
  if (!openHere(io)) {
    io.say(NO_SESSION);
    return REFUSED;
  }
  const at = await connect(values.host, asCaller(io).io);
  if (typeof at === 'number') return at;
  if (at.context.session === null) {
    io.say(NO_RUN);
    return REFUSED;
  }
  const said = text.trim();
  const body = verb === 'next' ? { next: said } : verb === 'tried' ? { tried: said } : { note: said };
  return send(at, body, io, SAID[verb](clip(at.context.session.spoken, 40)), { run: at.context.session.spoken, left: verb });
}

/* ── end ───────────────────────────────────────────────────────────────── */

async function end(rest: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined; state?: string | undefined; next?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      strict: true,
      options: { host: { type: 'string' }, state: { type: 'string' }, next: { type: 'string' } },
    }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be the next step. */
    io.say(USAGE_END);
    return REFUSED;
  }
  /* REFUSED BEFORE ANYTHING IS READ OR SENT, so a mistake costs nothing. */
  if (positionals.length > 0) {
    io.say(USAGE_END);
    return REFUSED;
  }
  const said = values.state;
  const state = said ?? 'idle';
  if (!isState(state)) {
    io.say(BAD_STATE);
    return REFUSED;
  }
  const next = values.next?.trim();
  if (values.next !== undefined && !next) {
    io.say(USAGE_END);
    return REFUSED;
  }
  if (!openHere(io)) {
    io.say(NO_SESSION);
    return REFUSED;
  }
  const at = await connect(values.host, asCaller(io).io);
  if (typeof at === 'number') return at;
  if (at.context.session === null) {
    io.say(NO_RUN);
    return REFUSED;
  }
  /* Where the run stopped, as the end hook sends it. A folder git cannot read sends neither field. */
  const where = await positionOf(io.cwd);
  /* NO STATE SAID IS THE RECORD'S TO PICK, AS THE END HOOK LEAVES IT (AGT-C04). This wrote `idle` for it, and the twelve-hour
     sweep takes an idle run as abandoned, so a run its own agent ended with `braindog session end` read Abandoned the
     next day. `end` writes done, or a handoff when the run left a fresh step, and the sweep never touches either. A
     step typed here is left first, so the record sees it as one the run left. A host with no `end` is told so and
     keeps the old `idle`, as the hook does. */
  if (said === undefined) {
    const position = { ...(where.branch === null ? {} : { branch: where.branch }), ...(where.head === null ? {} : { head: where.head }) };
    if (next !== undefined) {
      const left = await at.client.handoff({ next, ...position });
      if (!left.ok) {
        refuse(io, left, fixOf(left));
        return REFUSED;
      }
    }
    const ended = await at.client.call('end', position);
    if (ended.ok) {
      const to = (ended.value as { state?: unknown } | undefined)?.state === 'handoff' ? 'handoff' : 'done';
      io.out(ENDED[to](clip(at.context.session.spoken, 40)));
      io.answer?.({ value: { run: at.context.session.spoken, state: to } });
      return 0;
    }
    if (refused(ended) && ended.refusal.code === 'UNREACHABLE') return refuse(io, ended, `${at.to.key} did not answer.`);
    if (!(refused(ended) && OLDER_HOST.has(ended.refusal.code))) {
      refuse(io, ended, fixOf(ended));
      return REFUSED;
    }
  }
  return send(
    at,
    {
      state,
      ...(next === undefined ? {} : { next }),
      ...(where.branch === null ? {} : { branch: where.branch }),
      ...(where.head === null ? {} : { head: where.head }),
    },
    io,
    ENDED[state](clip(at.context.session.spoken, 40)),
    { run: at.context.session.spoken, state },
  );
}

/* ── the command ───────────────────────────────────────────────────────── */

/** `braindog session show|next|tried|note|end`, and the exit code. */
export async function session(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'show') return show(rest, io);
  if (verb === 'next' || verb === 'tried' || verb === 'note') return oneLine(verb, rest, io);
  if (verb === 'end') return end(rest, io);
  io.say(USAGE);
  return REFUSED;
}
