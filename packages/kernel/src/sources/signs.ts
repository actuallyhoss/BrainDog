/**
 * `signs`: the record's vital signs, one row each.
 *
 * They belong to no list, so the block is shown to a reader of the whole record. Moved out of `pages.ts` with its
 * answer unchanged (`sources/index.ts`).
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { SignState, VitalSign } from '../signs.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/** The states a sign can be in. Anything else a host hands is read as `none`: nothing to read is never green. */
const SIGN_STATES: readonly SignState[] = ['green', 'red', 'none'];

/**
 * What a `signs` block's `where` and columns may name: one row a sign. `sign` is its id, a handle and never what a
 * person reads; `name` is what they read, `value` its number (`null` where it counts nothing) and `said` its own
 * sentence, never one made here.
 */
const SIGNS: Schema = {
  register: 'signs',
  fields: {
    sign: { type: 'text' },
    name: { type: 'text' },
    state: { type: 'enum', values: SIGN_STATES },
    value: { type: 'decimal' },
    said: { type: 'text' },
    /* WHERE A PERSON GOES TO MEND IT (AG7), a path in this app when the sign's reader knows one; the row opens it. */
    to: { type: 'text' },
  },
};

/**
 * One sign as a row a table or cards block draws, keyed by its id, `seq` `null` because it is no list's row. Read now,
 * so the row was last changed when the page was read.
 *
 * A SIGN WITH NOTHING TO READ IS `none`, NEVER GREEN: a state outside the three, from a host or a reading out of shape,
 * is `none`, and so is its number, so a page never draws a sign as well that nobody has read.
 */
function signEntry(s: VitalSign, at: string): Entry {
  const state: SignState = SIGN_STATES.includes(s.state) ? s.state : 'none';
  const value = state !== 'none' && typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null;
  return {
    id: `sign:${s.sign}`,
    register: SIGNS.register,
    seq: null,
    fields: { sign: s.sign, name: s.name, state, value, said: typeof s.said === 'string' ? s.said : '', ...(typeof s.to === 'string' && s.to.startsWith('/') ? { to: s.to } : {}) },
    state,
    version: 1,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  };
}

/**
 * What a filed sign says before anything has ever been filed for it (`signs.ts` `readNow`). Kept here, since a source
 * module imports nothing of the kernel at run time, and the kernel reads it from here.
 */
export const NEVER_FILED = 'Nothing has been filed for this sign yet.';

/** Names said as a person lists them: "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]): string => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`);

/**
 * THE SIGNS NOTHING HAS BEEN FILED FOR YET, AS ONE ROW where there are two or more: Health said "Nothing has been filed
 * for this sign yet." six times, once under each (recheck of 30 October, Low list). The row stands where the first of
 * them stood, its title their names and its sentence said once. One alone keeps its own row.
 */
export function foldUnfiled(rows: readonly Entry[]): Entry[] {
  const unfiled = rows.filter((r) => r.fields.state === 'none' && r.fields.said === NEVER_FILED);
  if (unfiled.length < 2) return [...rows];
  const first = unfiled[0]!;
  const folded: Entry = {
    ...first,
    id: 'sign:never-filed',
    /* A TITLE IS ONE THING (the lists review, L39): the card was titled with five checks' names in a row ("The model
       answers, Agents get the tool list, What agents are told is true…"). Its title says how many, and its sentence
       names them. */
    fields: { ...first.fields, sign: 'never-filed', name: `${unfiled.length} checks with nothing filed yet`, said: `Nothing has been filed yet for ${listed(unfiled.map((r) => String(r.fields.name)))}.` },
  };
  return rows.flatMap((r) => (r === first ? [folded] : unfiled.includes(r) ? [] : [r]));
}

/**
 * The record's vital signs, one row each, in the order of the closed list (`signs.ts` `VITAL_SIGNS`).
 *
 * THE SAME READ AS `braindog signs` AND THE RECORD'S `signs`, so Health, the command line and an agent cannot disagree
 * about what is red. The order is the list's: `order:` is refused rather than ignored, and a page that wants the red
 * ones first asks for them with `where: state is red`.
 */
function signsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, quietSign } = kit;
  if (!deps.signs) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read its vital signs onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'signs come in the order BrainDog lists them, so it takes no order:. Use where: state is red for the red ones.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(SIGNS.fields, f));
  if (unknown.length)
    return { ...base, refusals: also({ code: 'FIELD_UNKNOWN', fix: `A sign has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(SIGNS.fields) }) };
  const said = predicateOf(block.where, SIGNS, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const at = new Date(deps.ctx.nowMs).toISOString();
  /* QUIETED BEFORE IT IS A ROW, so neither a column nor a `where:` reads the inbox's words for a reader held from it. */
  const quiet = deps.reader?.inbox === false;
  const kept = foldUnfiled(
    deps
      .signs()
      .map((s) => signEntry(quiet ? quietSign(s) : s, at))
      .filter((r) => evaluate(said.predicate, r.fields, SIGNS)),
  );
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  return { ...base, rows: kept.slice(0, limit), matched: kept.length };
}

export const signs: Source = { whole: true, read: signsBlock };
