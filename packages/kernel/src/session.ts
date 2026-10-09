/**
 * The kernel's `session` register, and the ladder that gives every agent write a run to belong to.
 *
 * AN AGENT'S WRITE IS SIGNED BY ITS RUN, NOT BY ITS TOKEN. A token names the person who minted it,
 * and three agents working under one token are three runs; the question worth answering a week
 * later is which run wrote a row. So a token's write carries `event.actor = 'S42'` (`30 §3`), and
 * the rungs below find that run, or say a new one is needed, in at most three indexed reads.
 *
 * ONE RUN PER HOST SESSION. A run is what one Claude Code session, one Codex session or one chat is,
 * so a write that names no run joins its token's newest open run rather than opening another, unless
 * that run says it is on another machine, in another repository or another kind of agent. One
 * opened per such write is how the owner's record came to hold 732 runs, 491 of the newest 500
 * abandoned and 439 of them called "Agent run" and a day.
 *
 * STALENESS IS DERIVED AND DEATH IS WRITTEN. A run that crashes never says goodbye, so nothing
 * stores "stale" or "quiet": a reader compares `last_seen` with the clock through `isStale` and
 * `isQuiet`. After twelve hours the hourly sweep in `schedule.ts` writes the run `abandoned`, as a
 * real write with an event, and every feed leaves that event out, because it is the record keeping
 * its books and not a change anybody made (`bookkeeping` in `index.ts`).
 */

import type { Sql } from '@braindog/ports';

import { STALE_MS, heardAt, presenceOf } from './presence.ts';

import type { Json } from './coerce.ts';
import type { Declaration } from './declare.ts';
import { SESSION_BODY } from './migrations/0028_runs.ts';

/** The register's id. */
export const SESSION = 'session';

/**
 * The kernel's declaration, parsed from the bytes of the newest migration that seats it, 28, so that there is one copy
 * of it.
 *
 * The id is read out of the body rather than written here: this is an envelope around the row the
 * migration seats, not a second declaration.
 *
 * THE NEWEST, NOT THE FIRST. Migration 2's body lacks the app a run is in and three kinds of agent, so every default
 * read from it (`RUNS`, the kinds `agentOf` takes, a page's fields) described a register no record holds any more, and
 * installing it over a record that had run migration 22 wrote migration 2's body back as a newer version. Migration
 * 22's lacks when a run started, for which the same holds.
 */
export function sessionDeclaration(): Declaration {
  const body = JSON.parse(SESSION_BODY) as Record<string, Json>;
  return { id: `register.${String(body.id)}`, kind: 'register', body, pack: 'kernel' };
}

const DECLARED = sessionDeclaration().body;
/**
 * What a run is called out loud: `S` for `S42`, taken from the declaration so there is one copy.
 *
 * Exported because a run's NAME is what its writes are signed with (`event.actor = 'S42'`), so any
 * reader joining an event back to the run that made it needs the same prefix the ladder wrote.
 */
export const SESSION_PREFIX = String(DECLARED.seq_prefix);

const PREFIX = SESSION_PREFIX;
/** The states a run does not come back from, which is what a page of live runs leaves out. */
export const FINISHED = DECLARED.done as readonly string[];

/** The kinds of agent the kernel's register lets a run be, which a register of a later version may add to. */
const KINDS: readonly string[] =
  ((DECLARED.fields as { id: string; values?: string[] }[]).find((f) => f.id === 'agent')?.values ?? []) as readonly string[];

/**
 * The fields only the record writes: when the run was last heard from, the project it resolved to,
 * the token that opened it, and when it started; and migration 28's nine (`0028_runs.ts`), which say how its work went
 * and how its step closed. A caller's patch naming one is refused `IMMUTABLE_FIELD`.
 */
export const KERNEL_WRITTEN: readonly string[] = [
  'last_seen',
  'project',
  'token_id',
  'started',
  'stretch_at',
  'next_at',
  'closed_as',
  'closed_at',
  'taken_by',
  'took',
  'parent',
  'wrote',
  'seen_before',
];

/**
 * The clock lives in `presence.ts`: working, stale and quiet, and the reads that compare `last_seen` with it. Exported
 * again from here so a reader that imported them from the ladder keeps working.
 */
export { QUIET_MS, STALE_MS, isQuiet, isStale } from './presence.ts';

/**
 * The states a run leaves for `active` when the ladder re-attaches it, because a run that writes is working. `handoff`
 * is one: a session that left a step and is resumed and worked in is working again, and the step it left is no longer
 * fresh (`stretch_at`). A resumed session that only reads writes nothing, so its step still waits.
 */
export const REVIVED: readonly string[] = ['idle', 'handoff', 'done', 'abandoned'];

/**
 * Whether a run left a next step in its current stretch of work, the one a later session should take up.
 *
 * FRESH IS WRITTEN SINCE THE STRETCH BEGAN (`next_at` at or after `stretch_at`). A session resumed and worked in starts
 * a new stretch, so the step it was handed and did not write again is not what it leaves. A run from before these two
 * fields with a step and no times is given the benefit: a step kept that should have gone costs a line on a card, a
 * step dropped that should have stayed costs the next session its start.
 */
export function leftFreshStep(fields: Record<string, Json>): boolean {
  if (typeof fields.next !== 'string' || fields.next.trim() === '') return false;
  const stretch = typeof fields.stretch_at === 'string' ? Date.parse(fields.stretch_at) : NaN;
  if (!Number.isFinite(stretch)) return true;
  const at = typeof fields.next_at === 'string' ? Date.parse(fields.next_at) : NaN;
  return Number.isFinite(at) && at >= stretch;
}

/** Whether a run works for another, by the `parent` it was opened with: a helper, whose steps are its parent's. */
export const isHelper = (fields: Record<string, Json>): boolean => typeof fields.parent === 'string' && fields.parent !== '';

/**
 * How long a run has been going, in whole seconds: from its start to now while it works, and to the last time it was
 * heard from once it has stopped, gone quiet or finished.
 *
 * AN AGE THAT FREEZES WHEN THE RUN ENDS, as Claude Code's agent view freezes a session's at completion. Counted to the
 * clock, a run that stopped three days ago read as three days of work, and every quiet run aged as if it were busy.
 */
export function runAge(row: { state?: string | null; fields: Record<string, Json>; created_at: string; updated_at: string }, nowMs: number): number {
  const working = presenceOf(row, nowMs) === 'working';
  return Math.max(0, Math.floor(((working ? nowMs : heardAt(row)) - Date.parse(row.created_at)) / 1000));
}

/** Whether a writer's signature is a run's name, `S42`. */
export const isRunName = (actor: string): boolean => actor.startsWith(PREFIX) && /^[1-9][0-9]*$/u.test(actor.slice(PREFIX.length));

/**
 * What an agent says about its run: its request headers, or `_meta.session` over MCP.
 *
 * Every key but `spoken` is a field of the register when the register declares it, written as it
 * stands when the ladder opens a run. The host checks each one and drops what fails, so the kernel
 * takes them as given.
 */
export type SessionHints = {
  /** `S42`: the run the caller says it is. */
  spoken?: string | undefined;
  /**
   * The host session's own id for the run, Claude Code's `session_id`, which is what re-attaches it. The start hook
   * passes it, and a tool call that carries the same id is the same run: one run per host session.
   */
  client_id?: string | undefined;
  agent?: string | undefined;
  /**
   * The client's own name and version, as MCP's `clientInfo` gives them on every request since the 2026-07-28 revision
   * (`claude-code`, `2.1.4`). The name says which kind of agent a run is when `agent` does not, and what to call it.
   * The register keeps them where it declares `client` and `client_version`, and leaves them out where it does not.
   */
  client?: string | undefined;
  client_version?: string | undefined;
  doing?: string | undefined;
  repo?: string | undefined;
  remote?: string | undefined;
  cwd?: string | undefined;
  host?: string | undefined;
  branch?: string | undefined;
  head?: string | undefined;
  /** `S42`: the run a subagent works for, which places the subagent's run where its parent is when nothing else does. */
  parent?: string | undefined;
  /** Commits HEAD moved since the last handoff here, `12`, for the briefing's card. The run register declares no such field. */
  ahead?: string | undefined;
};

/**
 * A run the ladder found, with the project it was last placed in and the rung that found it. A run
 * found by its `client_id` is being re-attached, which is when the ladder places it again.
 */
export type Found = {
  id: string;
  seq: number;
  state: string | null;
  project: string | null;
  by: 'spoken' | 'client' | 'adopted';
  /** The run was opened by another token, so the caller may not be it. The caller is refused, never merged in. */
  foreign: boolean;
};

/**
 * Rungs one to four of the ladder. `null` is rung five: open a run.
 *
 *   1. `spoken` names a run that exists and is not finished: that run.
 *   2. A name that matches nothing, or a finished run, is dropped and the next rung is tried. It is
 *      never recorded, so a stale `S7` in a header cannot conjure a row called `S7`.
 *   3. `client_id` matches a run in any state: that run, re-attached. A `client_id` that matches
 *      nothing is a host session the record has not met, so it opens its own run: adopting another
 *      would merge two agents working side by side in one checkout.
 *   4. With no run named, the newest run of the caller's own token that is active or idle and was
 *      heard from in the last 45 minutes: adopted, the one on the same machine and repository first,
 *      then the one on the same machine. Every write a host session makes without saying which run it
 *      is, a command run from a scratch folder or a remote client's call, lands in the run that
 *      session already has. Each such write used to open a run of its own wherever it said nothing of
 *      a repository: 337 deletes one afternoon were 337 runs. A run on another machine, in another
 *      repository or of another kind of agent, where both the caller and the run say which, is another
 *      host session and is never adopted.
 *   4b. A call with no token id takes the newest live run on the same host and repository: any run
 *      when it reads without an owner, as a person's view does, and only a run no token opened
 *      otherwise.
 *
 * A RUN BELONGS TO THE TOKEN THAT OPENED IT (`token_id`). Rungs 1 and 3 name a run outright, so a run
 * of another token found there comes back `foreign`, and the caller refuses it: a person's other key,
 * or another person's, never writes, hands off or attaches as that run. Rung 4 only guesses, so it
 * looks at the caller's own runs and a collision on one machine and repository opens a run instead.
 * A run with no `token_id` was made by a person, from the app, for an agent to take up, which is how a
 * run is shared: any key may name it. `token` is the caller's token id; `undefined` reads without an
 * owner, as a person's view does.
 */
export function findSession(sql: Sql, hints: SessionHints, nowMs: number, token?: string | null): Found | null {
  const pick = (by: Found['by'], where: string, ...params: (string | number | null)[]): Found | null => {
    const row = sql.one<Omit<Found, 'by' | 'foreign'> & { token_id: string | null }>(
      `SELECT id, seq, state, json_extract(fields, '$.project') AS project, json_extract(fields, '$.token_id') AS token_id FROM entry
       WHERE register = '${SESSION}' AND deleted_at IS NULL AND ${where}`,
      ...params,
    );
    if (!row) return null;
    const foreign = token !== undefined && owned(row.token_id, token);
    return { id: row.id, seq: row.seq, state: row.state, project: row.project ?? null, by, foreign };
  };
  const since = new Date(nowMs - STALE_MS).toISOString();

  const n = hints.spoken?.startsWith(PREFIX) ? hints.spoken.slice(PREFIX.length) : '';
  if (/^[1-9][0-9]*$/.test(n)) {
    const named = pick('spoken', 'seq = ?', Number(n));
    if (named && !FINISHED.includes(named.state ?? '')) return named;
  }

  if (hints.client_id) return pick('client', "json_extract(fields, '$.client_id') = ?", hints.client_id);

  /* THE PREFERENCE IS AN ORDER: a caller that says where it is still joins its session's run when that run said nothing
     of where, and of two open runs the one where the caller is wins. `IS` compares a missing hint as NULL, so a remote
     client that names no machine prefers the run that names none either.

     AND A DIFFERENCE IS A FILTER: another machine, another repository or another kind of agent, said by both, is
     another host session. Taken as an order alone, a Codex write from the Lanternfish checkout would join Claude's open run
     in BrainDog: signed as that run, its task filed under BrainDog, and the same write naming Lanternfish refused for
     leaving the run's project. `coalesce(... , 1)` lets a side that says nothing through. */
  if (typeof token === 'string') {
    const host = hints.host || null;
    const repo = hints.repo || null;
    const kind = kindSaid(hints);
    const client = appKey(hints.client);
    /* THE APP AND THE KIND ARE FILTERS TOO, and read in code because an app's name is matched as `clientOf` reads it.
       `other` is every ChatGPT, VS Code and unknown run, so as a kind it said nothing: a ChatGPT call on a key Claude
       also holds joined Claude's open run, and the run's app and name flipped with every call after. Now a run of
       another kind, or of another app, where both sides say which, is another host session; and a run that is `other`
       is taken for an agent of a known kind only while it names no app. */
    const rows = sql.all<{ id: string; seq: number; state: string | null; project: string | null; agent: string | null; client: string | null }>(
      `SELECT id, seq, state, json_extract(fields, '$.project') AS project, json_extract(fields, '$.agent') AS agent,
         json_extract(fields, '$.client') AS client FROM entry
       WHERE register = '${SESSION}' AND deleted_at IS NULL
         AND state IN ('active', 'idle') AND json_extract(fields, '$.last_seen') > ? AND json_extract(fields, '$.token_id') = ?
         AND coalesce(json_extract(fields, '$.host') = ?, 1) AND coalesce(json_extract(fields, '$.repo') = ?, 1)
       ORDER BY (json_extract(fields, '$.host') IS ? AND json_extract(fields, '$.repo') IS ?) DESC,
         (json_extract(fields, '$.host') IS ?) DESC, json_extract(fields, '$.last_seen') DESC LIMIT 32`,
      since,
      token,
      host,
      repo,
      host,
      repo,
      host,
    );
    const run = rows.find((r) => sameAgent(kind, client, r.agent, r.client));
    return run ? { id: run.id, seq: run.seq, state: run.state, project: run.project ?? null, by: 'adopted', foreign: false } : null;
  }

  if (hints.host && hints.repo)
    return pick(
      'adopted',
      `json_extract(fields, '$.host') = ? AND json_extract(fields, '$.repo') = ? AND state IN ('active', 'idle')
       AND json_extract(fields, '$.last_seen') > ?${token === undefined ? '' : " AND json_extract(fields, '$.token_id') IS NULL"}
       ORDER BY json_extract(fields, '$.last_seen') DESC LIMIT 1`,
      hints.host,
      hints.repo,
      since,
    );

  return null;
}

/**
 * The kind of agent a caller definitely is, or `null` when it does not say. `other` counts only when an app the record
 * knows implies it, as ChatGPT's does: an agent that says `other` of itself has said nothing.
 */
function kindSaid(hints: Pick<SessionHints, 'agent' | 'client'>): string | null {
  const { agent } = agentOf(hints);
  if (agent === undefined || agent === '') return null;
  return agent !== 'other' || clientOf(hints.client) !== undefined ? agent : null;
}

/** The app a caller or a run names, as one key for every way it spells itself: what a person calls it, lower case. */
function appKey(said: unknown): string | null {
  const name = typeof said === 'string' ? said.trim().toLowerCase() : '';
  return name === '' ? null : (clientOf(name)?.called.toLowerCase() ?? name);
}

/**
 * Whether a run of kind `agent` in app `runClient` can be the session of a caller of kind `kind` in app `client`
 * (`appKey`). A side that says nothing lets the
 * other through; a run that is `other` passes a caller of a known kind only while it names no app, because then nothing
 * says which agent it is.
 */
function sameAgent(kind: string | null, client: string | null, agent: string | null, runClient: string | null): boolean {
  const app = appKey(runClient);
  if (client !== null && app !== null && client !== app) return false;
  if (kind === null || agent === null || agent === '' || agent === kind) return true;
  return agent === 'other' && app === null;
}

/**
 * Whether a run's `token_id` keeps the caller out: it names another token. A run no token opened is a
 * person's, shared with any key that names it.
 */
export function owned(owner: unknown, token: string | null): boolean {
  return typeof owner === 'string' && owner !== token;
}

/**
 * What the live declaration of `session` holds that the ladder asks about: whether it has a field, and which kinds of
 * agent its `agent` field takes. The kernel's own (`sessionDeclaration`) when nothing newer was declared.
 */
export type RunRegister = { has: (field: string) => boolean; kinds: readonly string[] };

const DECLARED_FIELDS = new Set((DECLARED.fields as { id: string }[]).map((f) => f.id));
/** The kernel's own register, for a caller that has no live declaration to hand. */
export const RUNS: RunRegister = { has: (field) => DECLARED_FIELDS.has(field), kinds: KINDS };

/**
 * What a run's row is stamped with as it is made, `now` being the instant the row is created at: when the run started,
 * where the register keeps that.
 *
 * ONCE, AND NEVER MOVED. It is written only as the row is made, by the ladder's run and by one a person makes by hand
 * alike, and `started` is one of `KERNEL_WRITTEN`, so no later write names it: a run that goes quiet, is written off by
 * the sweep and re-attaches the next day is the same run, started when it first was. `last_seen` is the other end, and
 * the two are what draws a run as a span of time. A run made before the field has its row's `created_at`, which is
 * this same instant (migration 26).
 *
 * A START THE RECORD'S OWN STAMP ALREADY CARRIES IS LEFT AS IT IS, so the caller asks only where the row has none: a
 * sample's runs are planted through `stamp` with the hours they are meant to span, and stamping the clock over that
 * would start every one of them at the moment the sample was written.
 */
export function begun(now: string, register: RunRegister = RUNS): Record<string, Json> {
  return register.has('started') ? { started: now } : {};
}

/**
 * The fields a run opened by the ladder starts with: every hint but its name, that the register declares a field for,
 * with the kind of agent its client names when it said none, and what it is doing cut to a name's length.
 */
export function opening(hints: SessionHints, register: RunRegister = RUNS): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(hints))
    if (key !== 'spoken' && typeof value === 'string' && value !== '' && register.has(key) && !KERNEL_WRITTEN.includes(key)) out[key] = value;
  const { agent } = agentOf(hints, register.kinds);
  if (agent !== undefined && (out.agent === undefined || out.agent === 'other')) out.agent = agent;
  if (typeof out.doing === 'string') out.doing = clipTitle(out.doing);
  return out;
}

/* ── what a run is called ────────────────────────────────────────────────── */

/** The longest a run's name runs, so that a board of runs reads one line a run, on a phone too. */
export const TITLE_MAX = 60;

/**
 * A line as a run's name: its spaces closed up, and at most `TITLE_MAX` characters, cut at a word with an ellipsis.
 * Counted in characters a person sees, so an accent or a symbol is never split in two.
 */
export function clipTitle(said: string, max = TITLE_MAX): string {
  const chars = [...said.replace(/\s+/gu, ' ').trim()];
  if (chars.length <= max) return chars.join('');
  const room = chars.slice(0, max - 1).join('');
  const space = room.lastIndexOf(' ');
  const cut = space >= Math.floor(max / 2) ? room.slice(0, space) : room;
  return `${cut.replace(/[\s,;:.!?-]+$/u, '')}…`;
}

/** What each kind of agent is called, and what a run of an agent nobody named is. */
const KIND_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
  other: 'Agent',
};

/**
 * Agents by the name they give themselves, MCP's `clientInfo.name`: the kind of agent each is, and what a person calls
 * it. The first that matches the name, lower case, wins.
 *
 * A KIND THE REGISTER HAS NO VALUE FOR stays `other` and keeps its name, so a Gemini run is "Gemini in Kiln" with the
 * app's glyph until a version of the register lists `gemini`. An agent nobody listed is `other` and named for its kind.
 */
const CLIENTS: readonly { name: RegExp; agent: string; called: string }[] = [
  { name: /^claude[\s._-]*code/u, agent: 'claude', called: 'Claude Code' },
  { name: /^(?:claude|anthropic)/u, agent: 'claude', called: 'Claude' },
  { name: /^(?:openai[\s._-]*)?codex/u, agent: 'codex', called: 'Codex' },
  { name: /^cursor/u, agent: 'cursor', called: 'Cursor' },
  { name: /^gemini/u, agent: 'gemini', called: 'Gemini' },
  { name: /^(?:github[\s._-]*)?copilot/u, agent: 'copilot', called: 'Copilot' },
  { name: /^windsurf/u, agent: 'windsurf', called: 'Windsurf' },
  { name: /^(?:chatgpt|openai)/u, agent: 'other', called: 'ChatGPT' },
  { name: /^(?:visual studio code|vs[\s._-]*code)/u, agent: 'other', called: 'VS Code' },
];

/** Every name a title the record made can start with, longest first, so "Claude Code" is read before "Claude". */
const NAMES = [...new Set([...CLIENTS.map((c) => c.called), ...Object.values(KIND_NAMES)])].sort((a, b) => b.length - a.length);

const clientOf = (said: unknown) => {
  const name = typeof said === 'string' ? said.trim().toLowerCase() : '';
  return name === '' ? undefined : CLIENTS.find((c) => c.name.test(name));
};

/**
 * The kind of agent a run is and what to call it, from what its caller says of itself. A kind the caller named, other
 * than `other`, wins over the one its client's name implies; a kind the register does not take is left out, so the
 * register's default stands. `agent` is `undefined` when nothing names one.
 */
export function agentOf(hints: Pick<SessionHints, 'agent' | 'client'>, kinds: readonly string[] = KINDS): { agent: string | undefined; name: string } {
  const client = clientOf(hints.client);
  const said = hints.agent !== undefined && hints.agent !== '' && hints.agent !== 'other' ? hints.agent : undefined;
  const implied = client && kinds.includes(client.agent) ? client.agent : undefined;
  const agent = said ?? implied ?? (hints.agent === '' ? undefined : hints.agent);
  const name = client && (said === undefined || said === client.agent) ? client.called : (KIND_NAMES[agent ?? 'other'] ?? KIND_NAMES.other!);
  return { agent, name };
}

/** An agent's name and where it works, "Claude Code in BrainDog", or the agent's alone where nothing says where. */
const titled = (name: string, place: string | null): string => (place ? clipTitle(`${name} in ${place}`) : `${name} run`);

/**
 * What a run is called before its agent says what it is doing, so a new run is never an untitled row.
 *
 * THE AGENT AND WHERE IT WORKS: the project it was placed in, else its repository, "Claude Code in BrainDog"; and the
 * agent alone, "Claude run", where nothing says where. NEVER A DAY. "Agent run, 1 Oct" told a person reading a board of
 * runs nothing the board did not already say, 439 times. It is only a starting title: the agent's `doing`, through
 * `attach` or `handoff`, replaces it, and so does its first proposal's question, and while it stands it follows what the
 * record learns about the run (`learned`).
 */
export function provisionalTitle(hints: SessionHints, project: string | null, kinds: readonly string[] = KINDS): string {
  return titled(agentOf(hints, kinds).name, project ?? (hints.repo ? hints.repo : null));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Whether a run's name is one the record gave it rather than words an agent or a person wrote, and the agent's name it
 * carries when it carries one; `null` when somebody named the run.
 *
 * READ OFF THE NAME, because no field says who wrote it, and the record's names have shapes nobody types: "Claude Code
 * in BrainDog" and "Claude run" now, and before them "Claude run, 1 Oct" and "Lanternly, 1 Oct" on the day the run
 * opened, and "braindog on master" or "braindog" after its repository. A run with no name at all is the record's to
 * name too. `project` is the name of the project the run is in, which is the only project an old "Lanternly, 1 Oct"
 * is read as; `known` the names of the record's other projects, so a name the record gave in a project the run has
 * since left is still the record's.
 *
 * AND ONLY THOSE SHAPES, because what is taken for the record's is written over on the run's next call, silently. Read
 * looser, "Standup notes, 2 Oct", "Claude in the loop" and "Cursor in dark mode", each an agent's or a person's own
 * `doing`, would all become "Claude in braindog". So the place after "in" is a project the record knows or the run's own
 * repository, exactly as the record wrote it, a branch is one word, and a day follows only an agent's run or the run's own project.
 */
export function recordNamed(
  run: { fields: Record<string, Json>; created_at: string },
  project: string | null = null,
  known: readonly string[] = [],
): { name: string | null } | null {
  const doing = run.fields.doing;
  if (typeof doing !== 'string' || doing.trim() === '') return { name: null };
  const real = (name: string): string | null => (name === KIND_NAMES.other ? null : name);
  const repo = typeof run.fields.repo === 'string' && run.fields.repo.trim() !== '' ? run.fields.repo : null;
  const places = [project, repo, ...known].filter((p): p is string => p !== null && p.trim() !== '');
  for (const name of NAMES) if (doing === `${name} run` || places.some((place) => doing === titled(name, place))) return { name: real(name) };
  const day = `${String(Number(run.created_at.slice(8, 10)))} ${MONTHS[Number(run.created_at.slice(5, 7)) - 1] ?? ''}`;
  if (doing.endsWith(`, ${day}`)) {
    const head = doing.slice(0, -(day.length + 2));
    const name = head.endsWith(' run') ? head.slice(0, -' run'.length) : null;
    if (name !== null && NAMES.includes(name)) return { name: real(name) };
    return project !== null && head === project ? { name: null } : null;
  }
  const branch = repo !== null && doing.startsWith(`${repo} on `) ? doing.slice(repo.length + 4) : '';
  if ((repo !== null && doing === repo) || /^\S+$/u.test(branch)) return { name: null };
  return null;
}

/**
 * What the record learns about a run from a call made as it, beside whatever the call itself writes, and only what
 * changes: the kind of agent when the run said none, the client's name and version where the register keeps them, and
 * the name that follows while the run's name is still the record's own.
 *
 * `project` is the name of the project the run is in now, `keep` the fields the call writes itself, which are left
 * as it wrote them: an agent saying what it is doing has named its run, and `known` the names of the record's projects
 * (`recordNamed`).
 *
 * THE RECORD NOTING WHO A RUN IS IS NOT AN EDIT ANYBODY MADE, so the ladder writes this the way it writes the heartbeat
 * and the project, with no event (`attribute` in `index.ts`). Without it a run opened by a hook that could not read git
 * kept "Claude run, 1 Oct" through every re-attach that told the record exactly where it was.
 */
export function learned(
  run: { fields: Record<string, Json>; created_at: string },
  hints: SessionHints,
  project: string | null,
  register: RunRegister = RUNS,
  keep: readonly string[] = [],
  known: readonly string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  const was = typeof run.fields.agent === 'string' && run.fields.agent !== '' ? run.fields.agent : 'other';
  const { agent } = agentOf(hints, register.kinds);
  if (!keep.includes('agent') && was === 'other' && agent !== undefined && agent !== 'other' && register.kinds.includes(agent)) out.agent = agent;
  /* A RUN'S APP IS LEARNED ONCE, NEVER SWAPPED: written while the run names none, and its version kept up while the
     caller is the same app, however it spells itself. A call from another app naming the run outright does not turn
     Claude's run into ChatGPT's. */
  const app = appKey(run.fields.client);
  const same = app === null || appKey(hints.client) === app;
  for (const key of ['client', 'client_version'] as const) {
    const said = hints[key];
    const open = key === 'client' ? app === null : same;
    if (open && !keep.includes(key) && register.has(key) && typeof said === 'string' && said !== '' && said !== run.fields[key]) out[key] = said;
  }
  const made = keep.includes('doing') ? null : recordNamed(run, project, known);
  if (made) {
    const client = clientOf(app === null ? hints.client : run.fields.client);
    const name = client?.called ?? made.name ?? KIND_NAMES[out.agent ?? was] ?? KIND_NAMES.other!;
    const repo = typeof run.fields.repo === 'string' && run.fields.repo !== '' ? run.fields.repo : null;
    const title = titled(name, project ?? repo);
    if (title !== run.fields.doing) out.doing = title;
  }
  return out;
}
