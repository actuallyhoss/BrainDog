/**
 * `handoffs.open`: the next steps runs left that nobody has taken.
 *
 * ITS ROWS ARE RUNS, rows of the list of runs, so it is not a read of the whole record: `registersOf` names that list
 * and the list of projects beside it. Moved out of `pages.ts` with its answer unchanged (`sources/index.ts`).
 *
 * ITS SCHEMA IS MADE FROM THE KIT, since it is called by the source's own name, which the built-in figure that counts
 * these steps holds (`built-in-figures.ts` `HANDOFFS_OPEN`), and a module imports nothing of the kernel at run time.
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { OpenStep } from '../built-in-figures.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/**
 * What a `handoffs.open` block's `where` and columns may name: one row a step left. `run` is the run that left it, a
 * handle a host draws as `agent` and links by, never alone; `next` is the step in the run's words, `next_said` the same
 * step as a person reads it, a path said by its last plain words and a handle left out; `left_at` when.
 * `mark` is `next` for the one a new session is handed and `earlier` for the rest, older than a week or passed over.
 */
const handoffsSchema = (kit: SourceKit): Schema => ({
  register: kit.HANDOFFS_OPEN,
  fields: {
    run: { type: 'text' },
    agent: { type: 'text' },
    next: { type: 'text' },
    next_said: { type: 'text' },
    left_at: { type: 'instant' },
    mark: { type: 'enum', values: ['next', 'earlier'] },
  },
});

/**
 * One step as a row, keyed by the run that left it. `project` rides on the row for `projectsOf`, which says the
 * project's name, and is no field a column may name: it is a spoken id, and a person reads the name.
 */
function stepEntry(h: OpenStep, { SESSION, agentOf }: SourceKit): Entry {
  return {
    id: h.id,
    register: SESSION,
    seq: null,
    fields: { run: h.spoken, agent: agentOf({ agent: h.agent ?? undefined, client: h.client ?? undefined }).name, next: h.next, next_said: h.next_said, left_at: h.left_at, mark: h.mark, project: h.project },
    state: 'handoff',
    version: 1,
    created_at: h.left_at,
    updated_at: h.left_at,
    deleted_at: null,
  };
}

/**
 * The next steps runs left and nobody has taken, newest first: one project's, when `about:` names its row, else the
 * whole record's, each with the project it was left in.
 *
 * THE SAME READ AS THE BRIEFING'S (`openHandoffs`), so the Agents page never lists a step the card would not offer, nor
 * leaves out one it would. Newest first is the read's order, so `order:` is refused; `where: mark is next` keeps the
 * steps a new session would be handed.
 */
function handoffsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, typesOf, projectsOf, SPOKEN } = kit;
  const HANDOFFS = handoffsSchema(kit);
  if (!deps.handoffs) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read the steps runs left onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'handoffs.open comes the newest step first, so it takes no order:. Use where: mark is next for the ones to take now.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(HANDOFFS.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `A step left has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(HANDOFFS.fields) }) };
  const about = block.about === undefined ? null : typeof block.about === 'string' ? SPOKEN.exec(block.about) : null;
  if (block.about !== undefined && !about)
    return { ...base, refusals: also({ code: 'VALUE_MALFORMED', fix: 'about: names the project by its row, such as things#1, or is left off for every project.', at: 'about' }) };
  const said = predicateOf(block.where, HANDOFFS, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps
    .handoffs(about ? String(block.about) : null)
    .map((h) => stepEntry(h, kit))
    .filter((r) => evaluate(said.predicate, r.fields, HANDOFFS, r));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const rows = kept.slice(0, limit);
  return { ...base, rows, matched: kept.length, types: typesOf(HANDOFFS), ...projectsOf(deps, rows) };
}

export const handoffsOpen: Source = { read: handoffsBlock };
