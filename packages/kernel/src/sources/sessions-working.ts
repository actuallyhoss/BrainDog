/**
 * `sessions.working`: the runs working now, each with its helpers folded under it.
 *
 * ITS ROWS ARE ROWS OF THE LIST OF RUNS, as the live runs' are (`sessions-live.ts`). Moved out of `pages.ts` with its
 * answer unchanged (`sources/index.ts`).
 */

import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/**
 * The runs working now, as rows of `session`, each with its helpers folded under it, the most recently heard from first.
 *
 * ONE NUMBER FOR EVERY READER. The rail's foot, Today's headline and tile and the Agents headline each counted runs
 * their own way, and on the owner's record they said four while two of the four were last heard from hours before.
 * They all read this now, and this reads `workingRuns` in `presence.ts`, so the count is the clock's and nobody's own.
 *
 * NO `where` AND NO `order`. Which runs are working is the clock's to say and the order is the clock's too; a `where`
 * would let a page count a different "working" under the same name, which is the fault this source closes.
 */
function workingBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { projectsOf, SESSION } = kit;
  if (!deps.sessionsWorking)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its working runs onto a page yet.', at: 'source' }) };
  const schema = deps.schemaOf(SESSION);
  if (!schema) return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: 'This record keeps no runs.', at: 'source' }) };
  if (block.where !== undefined)
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.working is every run working now, so it takes no where:. Use sessions.live to choose among runs.', at: 'where' }),
    };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.working comes the most recently heard from first, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => f !== 'seq' && !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${SESSION} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
    };
  const working = deps.sessionsWorking();
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const kept = working.slice(0, limit);
  const rows = kept.map((w) => w.run);
  return { ...base, rows, matched: working.length, ...projectsOf(deps, rows), helpers: kept.map((w) => w.helpers) };
}

export const sessionsWorking: Source = { read: workingBlock };
