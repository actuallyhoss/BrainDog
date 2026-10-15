/**
 * `sessions.live`: the runs that are not finished, the most recently seen first.
 *
 * ITS ROWS ARE ROWS OF THE LIST OF RUNS, so it is not a read of the whole record: `registersOf` names that list and
 * the list of projects beside it. Moved out of `pages.ts` with its answer unchanged (`sources/index.ts`).
 */

import { evaluate } from '@braindog/where';

import type { Json } from '../coerce.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Presence, presenceOf } from '../presence.ts';
import type { Also, Source } from './index.ts';
import { DOING_SAID, saidRefusal, withSaid } from './sessions-working.ts';

/** A `sessions.live` answer: a block's, with the one word each run reads as beside its rows (AGT-C04, AGT-C10), as `presence` on `BlockResult`. */
export type LiveResult = BlockResult;

/** `presenceOf` in `presence.ts`, read off the kit when the kit carries it, since a source imports no kernel file. */
type PresenceOf = typeof presenceOf;

/** The states a run is open in, as `presence.ts` names them. */
const OPEN: readonly string[] = ['active', 'idle'];

/**
 * The one word a run reads as now: the kit's `presenceOf` when the kit carries it, else the same rule said again from
 * `isQuiet`, which the kit has carried since quiet was answered here.
 *
 * SAID AGAIN AND PINNED, never a second clock: `sessions-live-presence.test.ts` holds this to `presenceOf` run by run,
 * so the day the kit carries it nothing a reader sees moves. Never heard from here is from before, whatever the state.
 */
export function presenceFrom(kit: SourceKit, run: { state?: string | null; fields: Record<string, Json> }, nowMs: number): Presence {
  const own = (kit as SourceKit & { presenceOf?: PresenceOf }).presenceOf;
  if (own) return own(run, nowMs);
  const seen = run.fields.last_seen;
  if (typeof seen !== 'string' || seen === '') return 'before';
  const state = run.state ?? (typeof run.fields.state === 'string' ? run.fields.state : '');
  if (state === 'handoff') return 'left';
  if (state === 'done') return 'ended';
  if (state === 'abandoned') return 'stopped';
  /* `isQuiet` is open and not working, so an open run it does not call quiet is at work; any other state is quiet. */
  return OPEN.includes(state) && !kit.isQuiet(run, nowMs) ? 'working' : 'quiet';
}

/**
 * The runs that are not finished, as rows of `session`, the most recently seen first.
 *
 * WHICH RUNS ARE LIVE IS THE HOST'S TO SAY, from the register's own `done` list, so a page and a
 * briefing agree. The order is the host's too: `order:` is refused rather than ignored.
 */
function liveBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): LiveResult {
  const { predicateOf, projectsOf, isQuiet, SESSION } = kit;
  if (!deps.sessionsLive)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its live runs onto a page yet.', at: 'source' }) };
  const schema = deps.schemaOf(SESSION);
  if (!schema) return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: 'This record keeps no runs.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.live comes the most recently seen first, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => f !== 'seq' && f !== DOING_SAID && !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${SESSION} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
    };
  const unread = saidRefusal(block, kit);
  if (unread) return { ...base, refusals: also(unread) };
  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps.sessionsLive().filter((r) => evaluate(said.predicate, r.fields, schema));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const rows = kept.slice(0, limit);
  /* AND WHICH OF THEM HAVE GONE QUIET, read here so a page and the rail agree on the one clock: open is not working, and
     four runs reading "Working now" that nobody had heard from in hours was the board the owner saw. Open and not working
     (`isQuiet` over `presenceOf`): a run that left a step is never quiet, even one carried in with no `last_seen`. */
  const placed = projectsOf(deps, rows);
  /* AND WHAT EACH SAID IT IS DOING, for a block that names `doing_said` (`withSaid`): a row more in the answer, and
     nothing a `where:` can ask about, because it is no field of the list. */
  /* AND THE ONE WORD EACH READS AS (`presenceOf`), in the same order: working, quiet, left a step, ended, stopped or from
     before, so a run that handed on a step, one that finished and one carried in by an import no longer all read
     "Stopped". `quiet` stays as it was for every reader that asks it. */
  return {
    ...base,
    rows: withSaid(deps, block, rows, placed.scopes, kit),
    matched: kept.length,
    ...placed,
    quiet: rows.map((r) => isQuiet(r, deps.ctx.nowMs)),
    presence: rows.map((r) => presenceFrom(kit, r, deps.ctx.nowMs)),
  };
}

export const sessionsLive: Source = { read: liveBlock };
