/**
 * `actions`: the record's scheduled actions, one row each.
 *
 * They belong to no list, so the block is shown to a reader of the whole record. `actionEntry` is exported because
 * what a project runs on draws the same rows (`runs-on.ts`). Moved out of `pages.ts` with its answer unchanged
 * (`sources/index.ts`).
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { ActionRow } from '../actions.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/** What an `actions` block's `where`, `order` and columns may name: one row per action, as `listActions` reads it. */
const ACTIONS: Schema = {
  register: 'actions',
  fields: {
    ingest: { type: 'text' },
    channel: { type: 'enum', values: ['pull', 'call', 'poll'] },
    project: { type: 'text' },
    host: { type: 'text' },
    every: { type: 'text' },
    key: { type: 'text' },
    state: { type: 'enum', values: ['pending', 'firing', 'paused', 'done'] },
    next: { type: 'text' },
    last_at: { type: 'text' },
    last_outcome: { type: 'text' },
    /* The last run's HTTP status and note, so a host can say why an action paused or waits. */
    last_status: { type: 'int' },
    last_note: { type: 'text' },
    runs: { type: 'int' },
    failures: { type: 'int' },
  },
};

/** One action as a row a table or cards block draws. The key is its label, and `seq` is `null` because it is no register's row. */
export const actionEntry = (a: ActionRow): Entry => ({
  id: `action:${a.ingest}`,
  register: ACTIONS.register,
  seq: null,
  fields: {
    ingest: a.ingest,
    channel: a.channel,
    project: a.project,
    host: a.host,
    every: a.every,
    key: a.key,
    state: a.state,
    next: a.next,
    last_at: a.last?.at ?? null,
    last_outcome: a.last?.outcome ?? null,
    last_status: a.last?.status ?? null,
    last_note: a.last?.note ?? null,
    runs: a.month.runs,
    failures: a.month.failures,
  },
  state: a.state,
  version: 1,
  created_at: a.last?.at ?? '',
  updated_at: a.last?.at ?? '',
  deleted_at: null,
});

/**
 * The record's scheduled actions, one row each, in the order the record lists them (by ingest id).
 *
 * THE SAME LIST AS THE `actions` READ, so a page and the "Runs on" screen cannot disagree about what runs. A key is
 * its label and nothing sealed is read. The order is the record's: `order:` is refused rather than ignored.
 */
function actionsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf } = kit;
  if (!deps.actions)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its scheduled actions onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'actions come in the order the record lists them, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(ACTIONS.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `An action has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(ACTIONS.fields) }),
    };
  const said = predicateOf(block.where, ACTIONS, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps.actions().map(actionEntry).filter((r) => evaluate(said.predicate, r.fields, ACTIONS));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  return { ...base, rows: kept.slice(0, limit), matched: kept.length };
}

export const actions: Source = { whole: true, read: actionsBlock };
