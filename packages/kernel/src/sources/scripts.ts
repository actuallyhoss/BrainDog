/**
 * `scripts`: every installed script, one row each, as the record's `scripts` read answers them (`script-rows.ts`).
 *
 * THE ROWS `/scripts` DRAWS (24 October): the list of scripts was a screen built by hand over that read, and is a
 * declared page now, drawn by the one page reader, so a person or an agent can change it by saying so. A script is no
 * list's row: the block is shown to a reader of the whole record, as the read itself is held to the lists a script
 * touches and a page block cannot be held row by row.
 *
 * WHAT A ROW HOLDS IS THE READ'S, FLAT. What starts it (`every`, its time of day `at`, `door`, `rule`), where it stands (`status`, `next`, and
 * its last run's `last_at`, `last` and `said`), how close it is to pausing (`in_a_row` of `pauses_at`) and this month's
 * runs. No words are made here: the host says "Runs every day" and "Last ran 2 hours ago" from these, as the screen did.
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { ScriptRow } from '../script-rows.ts';
import type { Also, Source } from './index.ts';

/** What a `scripts` block's `where` and columns may name: one row a script. */
const SCRIPTS: Schema = {
  register: 'scripts',
  fields: {
    script: { type: 'text' },
    title: { type: 'text' },
    status: { type: 'enum', values: ['on', 'paused'] },
    every: { type: 'text' },
    at: { type: 'text' },
    door: { type: 'text' },
    rule: { type: 'boolean' },
    next: { type: 'instant' },
    last_at: { type: 'instant' },
    last: { type: 'text' },
    said: { type: 'text' },
    in_a_row: { type: 'decimal' },
    pauses_at: { type: 'decimal' },
    month: { type: 'decimal' },
    month_refused: { type: 'decimal' },
  },
};

/** One script as a row a table or cards block draws, keyed by its declaration, `seq` `null` as it is no list's row. */
function scriptEntry(s: ScriptRow, at: string): Entry {
  return {
    id: `script:${s.script}`,
    register: SCRIPTS.register,
    seq: null,
    fields: {
      script: s.script,
      title: s.title,
      status: s.status,
      every: s.runs.every,
      at: s.runs.at,
      door: s.runs.door,
      rule: s.runs.rule,
      next: s.next,
      last_at: s.last?.at ?? null,
      last: s.last?.outcome ?? null,
      said: s.last?.say ?? null,
      in_a_row: s.refused.in_a_row,
      pauses_at: s.refused.pauses_at,
      month: s.month.runs,
      month_refused: s.month.refused,
    },
    state: s.status,
    version: s.version,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  };
}

/**
 * The installed scripts, in the order the read answers them (by id). `order:` is refused rather than ignored, as a
 * `signs` block refuses it, and a page that wants the paused ones asks for them with `where: status is paused`.
 */
function scriptsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, typesOf } = kit;
  if (!deps.scripts) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read its scripts onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'scripts come in the order BrainDog lists them, so it takes no order:. Use where: status is paused for the paused ones.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(SCRIPTS.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `A script has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(SCRIPTS.fields) }) };
  const said = predicateOf(block.where, SCRIPTS, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const at = new Date(deps.ctx.nowMs).toISOString();
  const kept = deps
    .scripts()
    .map((s) => scriptEntry(s, at))
    .filter((r) => evaluate(said.predicate, r.fields, SCRIPTS));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  /* AND EACH FIELD'S TYPE, as every computed source answers it (`typesOf`): no list declares `last_at`, so without it the
     page printed a script's last run as `2026-10-26T19:02:27.656Z` under "Where it stands" and not as how long ago. */
  return { ...base, rows: kept.slice(0, limit), matched: kept.length, types: typesOf(SCRIPTS) };
}

export const scripts: Source = {
  says: 'every installed script as rows: script, title, status, every, door, rule, next, last_at, last, said, in_a_row, pauses_at, month, month_refused; in the order listed, no order:',
  whole: true,
  read: scriptsBlock,
};
