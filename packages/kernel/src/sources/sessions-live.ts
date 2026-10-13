/**
 * `sessions.live`: the runs that are not finished, the most recently seen first.
 *
 * ITS ROWS ARE ROWS OF THE LIST OF RUNS, so it is not a read of the whole record: `registersOf` names that list and
 * the list of projects beside it. Moved out of `pages.ts` with its answer unchanged (`sources/index.ts`).
 */

import { evaluate } from '@braindog/where';

import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/**
 * The runs that are not finished, as rows of `session`, the most recently seen first.
 *
 * WHICH RUNS ARE LIVE IS THE HOST'S TO SAY, from the register's own `done` list, so a page and a
 * briefing agree. The order is the host's too: `order:` is refused rather than ignored.
 */
function liveBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, projectsOf, isQuiet, SESSION } = kit;
  if (!deps.sessionsLive)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its live runs onto a page yet.', at: 'source' }) };
  const schema = deps.schemaOf(SESSION);
  if (!schema) return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: 'This record keeps no runs.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.live comes the most recently seen first, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => f !== 'seq' && !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${SESSION} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
    };
  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps.sessionsLive().filter((r) => evaluate(said.predicate, r.fields, schema));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const rows = kept.slice(0, limit);
  /* AND WHICH OF THEM HAVE GONE QUIET, read here so a page and the rail agree on the one clock: open is not working, and
     four runs reading "Working now" that nobody had heard from in hours was the board the owner saw. Open and not working
     (`isQuiet` over `presenceOf`): a run that left a step is never quiet, even one carried in with no `last_seen`. */
  return { ...base, rows, matched: kept.length, ...projectsOf(deps, rows), quiet: rows.map((r) => isQuiet(r, deps.ctx.nowMs)) };
}

export const sessionsLive: Source = { read: liveBlock };
