/**
 * `activity`: the record's events as a feed, newest first, grouped by who did them.
 *
 * A FEED READS THE RECORD'S EVENTS, not a list's rows, so it belongs to no list and is shown to a reader of the whole
 * record. Moved out of `pages.ts` with its answer unchanged (`sources/index.ts`).
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { BlockResult, FeedRow, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/** The kinds of actor a feed groups by, `packages/render/src/feed.ts`'s `FEED_BY`, copied as `BLOCK_KINDS` is in `declare.ts`. */
export const FEED_BY = ['agent', 'rule', 'you'] as const;

/** How many events a feed reads. Bursts are counted from events, so a feed of 20 rows reads more than 20. */
const FEED_EVENTS = 500;

/**
 * What a feed's `where:` may ask about an event. `actor` is the kind of actor, which is what the groups are.
 *
 * `list` IS THE LIST THE TARGET IS A ROW OF (`listOf`), so a page about one area draws that area's work with
 * `list is transactions` rather than a pattern over `target`, which a row's spoken id would make a guess. It is `list`
 * and not `register` because this schema already calls itself `activity`, and `governance.open` and `deadlines` say
 * the same word for the same thing.
 */
const ACTIVITY: Schema = {
  register: 'activity',
  fields: { actor: { type: 'enum', values: FEED_BY }, kind: { type: 'text' }, target: { type: 'text' }, list: { type: 'text' } },
};

function activityBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, byOf, listOf, agentRows, feedRows } = kit;
  if (!deps.activity)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its activity onto a page yet.', at: 'source' }) };
  const said = predicateOf(block.where, ACTIVITY, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const read = deps.activity(FEED_EVENTS);
  const kept = read.events.filter((e) => evaluate(said.predicate, { actor: byOf(e.actor), kind: e.kind, target: e.target, list: listOf(e.target) }, ACTIVITY));
  /* EVERY ROW SAYS ITS LIST, as the filter read it, so a host groups or links by the list without parsing `target`. */
  const listed = (rows: FeedRow[]): FeedRow[] => rows.map((r) => ({ ...r, list: listOf(r.target) }));
  /* AN `agents` BLOCK IS THE AGENTS' WORK ONLY, one group per agent, so its `first:` counts each agent's rows. */
  if (block.kind === 'agents') {
    const theirs = kept.filter((e) => byOf(e.actor) === 'agent');
    return { ...base, feed: listed(agentRows(theirs, block.first)), matched: theirs.length };
  }
  return {
    ...base,
    feed: listed(feedRows(kept, block.first)),
    matched: kept.length,
    ...(block.since === 'seen' ? { seen: read.seen } : {}),
  };
}

export const activity: Source = { whole: true, read: activityBlock };
