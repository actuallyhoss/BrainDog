/**
 * `braindog session show|next|tried|note|end`: the handoff from a shell
 * (`loop/research-agent-path.md` §6).
 *
 * NO VERB NAMES A RUN. Each one addresses the run the session file for this folder names, which is how
 * every other command names one: the session headers carry it, and `handoff` refuses a token that names
 * a run explicitly. A folder with no session file is told so before anything is sent.
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
import { readSession, sessionPath } from './hooks.ts';
import { positionOf } from './position.ts';
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

/** The three states a run may be left in. `active` is not one: `end` is how a run stops. */
const STATES = ['idle', 'handoff', 'done'] as const;
type State = (typeof STATES)[number];
const isState = (x: string): x is State => (STATES as readonly string[]).includes(x);

const BAD_STATE = 'braindog session end takes --state idle, handoff or done.';
const NO_SESSION = 'No session is open in this folder. Start a Claude Code session here, or run braindog hook start.';
const NO_RUN = 'The host has no open run for this folder. Start a session here and try again.';

const SAID: Record<Line, (spoken: string) => string> = {
  next: (spoken) => `${spoken} now carries that next step.`,
  tried: (spoken) => `${spoken} now carries that as already tried.`,
  note: (spoken) => `${spoken} now carries that note.`,
};

const ENDED: Record<State, (spoken: string) => string> = {
  idle: (spoken) => `${spoken} is idle.`,
  handoff: (spoken) => `${spoken} is handed off.`,
  done: (spoken) => `${spoken} is done.`,
};

/* ── the pieces every verb shares ──────────────────────────────────────── */

/** One line of somebody else's words: control characters and runs of space collapsed, and long text cut. */
const clip = (said: string, max: number): string => {
  const one = said.replace(/[\x00-\u001f\s]+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
};

/** A printed line ends in a full stop, whoever wrote the words inside it. */
const stopped = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Whether this folder has a session file at all, read before anything is sent. */
const openHere = (io: AgentIo): boolean => readSession(sessionPath(io.env, io.cwd)) !== null;

/** The handoff, the one line when it lands, and the exit code. */
async function send(at: Connected, args: Parameters<Client['handoff']>[0], io: AgentIo, line: string): Promise<number> {
  const out = await at.client.handoff(args);
  if (out.ok) {
    io.out(line);
    return 0;
  }
  /* THE HOST'S FIX, NEVER AN EXCEPTION'S MESSAGE. An unreachable refusal carries one inside its fix, so
     that one case gets the fixed sentence `connect` uses. */
  if (refused(out) && out.refusal.code === 'UNREACHABLE') {
    io.say(`${at.to.key} did not answer.`);
    return UNREACHABLE;
  }
  io.say(fixOf(out));
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
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  const c = at.context;
  if (c.session === null) {
    io.say(NO_RUN);
    return REFUSED;
  }

  const place = c.project ? `project ${clip(c.project.name, 60)}` : 'no project here';
  io.out(c.session.state === null ? `${c.session.spoken} · ${place}.` : `${c.session.spoken} is ${c.session.state} · ${place}.`);

  if (c.handoff === null) io.out('No handoff has been left here.');
  else {
    io.out(stopped(`Last handoff (${c.handoff.from}, ${ago(c.handoff.age_s)}): ${clip(c.handoff.next, 200)}`));
    for (const tried of c.handoff.tried.slice(-TRIED)) io.out(stopped(`  Already tried: ${clip(tried, 160)}`));
  }

  const own = c.session.spoken;
  const others = c.live.same_repo.filter((r) => r.spoken !== own);
  if (others.length === 0) io.out('Nobody else is live in this repository.');
  else {
    const named = others.slice(0, PER_LINE).map((r) => `${r.spoken} ${r.state ?? 'unknown'}${r.doing ? ` "${clip(r.doing, 60)}"` : ''}, seen ${ago(r.age_s)}`);
    io.out(`Also live here: ${named.join('; ')}.`);
  }
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
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  if (at.context.session === null) {
    io.say(NO_RUN);
    return REFUSED;
  }
  const said = text.trim();
  const body = verb === 'next' ? { next: said } : verb === 'tried' ? { tried: said } : { note: said };
  return send(at, body, io, SAID[verb](at.context.session.spoken));
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
  const state = values.state ?? 'idle';
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
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  if (at.context.session === null) {
    io.say(NO_RUN);
    return REFUSED;
  }
  /* Where the run stopped, as the end hook sends it. A folder git cannot read sends neither field. */
  const where = await positionOf(io.cwd);
  return send(
    at,
    {
      state,
      ...(next === undefined ? {} : { next }),
      ...(where.branch === null ? {} : { branch: where.branch }),
      ...(where.head === null ? {} : { head: where.head }),
    },
    io,
    ENDED[state](at.context.session.spoken),
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
