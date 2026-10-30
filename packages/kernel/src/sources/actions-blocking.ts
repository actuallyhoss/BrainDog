/**
 * `actions.blocking`: one project's scheduled actions that are paused, failing or late.
 *
 * An action belongs to no list, so the block is shown to a reader of the whole record. Moved out of `pages.ts` with
 * its answer unchanged (`sources/index.ts`).
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/** The source a block names for one project's actions in its way. */
export const ACTIONS_BLOCKING = 'actions.blocking';

/**
 * What an `actions.blocking` block's `where` and columns may name: one action in a project's way. `name` is the action
 * as a person reads it, `why` paused, failed or late, `since` when it last ran well, `status` the provider's last answer
 * and `said` its one sentence.
 */
const BLOCKING: Schema = {
  register: ACTIONS_BLOCKING,
  fields: {
    name: { type: 'text' },
    why: { type: 'enum', values: ['paused', 'failed', 'late'] },
    since: { type: 'instant' },
    status: { type: 'int' },
    said: { type: 'text' },
  },
};

/**
 * One project's scheduled actions that are paused, failing or late, in the order the record lists its actions: the
 * project `about:` names by its row. THE SAME READ AS THE SIGN'S (`actionsBlocking`), so a project page never says an
 * action is in its way that Health does not, nor leaves out one it does. `order:` is refused, as for the steps left.
 */
function blockingBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, typesOf } = kit;
  if (!deps.blocking) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read what is in a project\'s way onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'actions.blocking comes in the order the record lists its actions, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(BLOCKING.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `An action in the way has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(BLOCKING.fields) }) };
  /* THE PROJECT AS AN ACTION NAMES IT: its row (things#1), its row id, or the words its declaration holds. */
  const about = typeof block.about === 'string' ? block.about.trim() : '';
  if (about === '')
    return { ...base, refusals: also({ code: 'VALUE_MALFORMED', fix: 'about: names the project, such as things#1: an action in the way is one project\'s.', at: 'about' }) };
  const said = predicateOf(block.where, BLOCKING, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps
    .blocking(about)
    .map(
      (a): Entry => ({
        id: a.action,
        register: ACTIONS_BLOCKING,
        seq: null,
        fields: { name: a.name, why: a.why, since: a.since, status: a.status, said: a.said },
        state: a.why,
        version: 1,
        created_at: a.since ?? '',
        updated_at: a.since ?? '',
        deleted_at: null,
      }),
    )
    .filter((r) => evaluate(said.predicate, r.fields, BLOCKING, r));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  return { ...base, rows: kept.slice(0, limit), matched: kept.length, types: typesOf(BLOCKING) };
}

export const actionsBlocking: Source = { whole: true, read: blockingBlock };
