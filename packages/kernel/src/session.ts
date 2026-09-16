/**
 * The kernel's `session` register, and the ladder that gives every agent write a run to belong to.
 *
 * AN AGENT'S WRITE IS SIGNED BY ITS RUN, NOT BY ITS TOKEN. A token names the person who minted it,
 * and three agents working under one token are three runs; the question worth answering a week
 * later is which run wrote a row. So a token's write carries `event.actor = 'S42'` (`30 §3`), and
 * the rungs below find that run, or say a new one is needed, in at most three indexed reads.
 *
 * STALENESS IS DERIVED AND DEATH IS WRITTEN. A run that crashes never says goodbye, so nothing
 * stores "stale": a reader compares `last_seen` with the clock through `isStale`. After twelve hours
 * the hourly sweep in `schedule.ts` writes the run `abandoned`, as a real write with an event.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';
import type { Declaration } from './declare.ts';
import { SESSION_BODY } from './migrations/0002_session.ts';

/** The register's id. */
export const SESSION = 'session';

/**
 * The kernel's declaration, parsed from migration 2's bytes so that there is one copy of it.
 *
 * The id is read out of the body rather than written here: this is an envelope around the row the
 * migration seats, not a second declaration.
 */
export function sessionDeclaration(): Declaration {
  const body = JSON.parse(SESSION_BODY) as Record<string, Json>;
  return { id: `register.${String(body.id)}`, kind: 'register', body, pack: 'kernel' };
}

const DECLARED = sessionDeclaration().body;
const PREFIX = String(DECLARED.seq_prefix);
/** The states a run does not come back from, which is what a page of live runs leaves out. */
export const FINISHED = DECLARED.done as readonly string[];

/**
 * The fields only the record writes: when the run was last heard from, the project it resolved to,
 * and the token that opened it. A caller's patch naming one is refused `IMMUTABLE_FIELD`.
 */
export const KERNEL_WRITTEN: readonly string[] = ['last_seen', 'project', 'token_id'];

/** A run not heard from in 45 minutes is stale. Worked out when read, and never stored. */
export const STALE_MS = 45 * 60_000;

/**
 * The states a run leaves for `active` when the ladder re-attaches it, because a run that writes is
 * working. `handoff` is not one: it is a request waiting for the next run, and a write from the
 * run that asked does not answer it.
 */
export const REVIVED: readonly string[] = ['idle', 'done', 'abandoned'];

/** Whether a run has gone quiet. A row with no `last_seen` is judged by when it last changed. */
export function isStale(row: { fields: Record<string, Json>; updated_at: string }, nowMs: number): boolean {
  const seen = typeof row.fields.last_seen === 'string' ? row.fields.last_seen : row.updated_at;
  return Date.parse(seen) < nowMs - STALE_MS;
}

/**
 * What an agent says about its run: its request headers, or `_meta.session` over MCP.
 *
 * Every key but `spoken` is a field of the register, written as it stands when the ladder opens a
 * run. The host checks each one and drops what fails, so the kernel takes them as given.
 */
export type SessionHints = {
  /** `S42`: the run the caller says it is. */
  spoken?: string | undefined;
  /** The runtime's own id for the run, Claude Code's `session_id`, which is what re-attaches it. */
  client_id?: string | undefined;
  agent?: string | undefined;
  doing?: string | undefined;
  repo?: string | undefined;
  remote?: string | undefined;
  cwd?: string | undefined;
  host?: string | undefined;
  branch?: string | undefined;
  head?: string | undefined;
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
 *   3. `client_id` matches a run in any state: that run, re-attached.
 *   4. With no `client_id`, a run on the same `host` and `repo`, opened by the same token, active or
 *      idle and heard from in the last 45 minutes, the newest first: adopted. A caller whose
 *      `client_id` matched nothing is a different run, and adopting it would merge two agents working
 *      side by side in one checkout.
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

  const n = hints.spoken?.startsWith(PREFIX) ? hints.spoken.slice(PREFIX.length) : '';
  if (/^[1-9][0-9]*$/.test(n)) {
    const named = pick('spoken', 'seq = ?', Number(n));
    if (named && !FINISHED.includes(named.state ?? '')) return named;
  }

  if (hints.client_id) return pick('client', "json_extract(fields, '$.client_id') = ?", hints.client_id);

  if (hints.host && hints.repo)
    return pick(
      'adopted',
      `json_extract(fields, '$.host') = ? AND json_extract(fields, '$.repo') = ? AND state IN ('active', 'idle')
       AND json_extract(fields, '$.last_seen') > ?${token === undefined ? '' : " AND json_extract(fields, '$.token_id') IS ?"}
       ORDER BY json_extract(fields, '$.last_seen') DESC LIMIT 1`,
      hints.host,
      hints.repo,
      new Date(nowMs - STALE_MS).toISOString(),
      ...(token === undefined ? [] : [token ?? null]),
    );

  return null;
}

/**
 * Whether a run's `token_id` keeps the caller out: it names another token. A run no token opened is a
 * person's, shared with any key that names it.
 */
export function owned(owner: unknown, token: string | null): boolean {
  return typeof owner === 'string' && owner !== token;
}

/** The fields a run opened by the ladder starts with: every hint but its name. */
export function opening(hints: SessionHints): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(hints))
    if (key !== 'spoken' && typeof value === 'string' && value !== '') out[key] = value;
  return out;
}
