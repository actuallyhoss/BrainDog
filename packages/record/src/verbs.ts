/**
 * WHAT A PRESS ON A DECLARED ACTION CALLS, and how it is taken back (PGS-A12, `loop/scope/area-pages-a.md` 2.2,
 * decision 3).
 *
 * A page names a verb from the kernel's table (`packages/kernel/src/row-actions.ts`, `ACTION_VERBS`), which says the
 * level it needs, whether it can be undone and what a press sends. This is the other half: each verb bound to the one
 * record method a press calls, with its params built from what the press sent and the row it was pressed on, and the
 * call that puts it back. The two tables name the same verbs and the same args, and `verbs.test.ts` holds them to it.
 *
 * PURE, AND NO NEW WAY TO WRITE. Every binding calls a method a screen already calls: `create` and `update` as the six
 * writes do (`apps/web/src/lib/page/page-writes.ts`), a delete as `rows-write.ts` archives (`deleted_at`), and `decide`
 * as Decide answers a question. The method's own guard still runs, so a press is refused exactly as the screen's is.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/** Where an arg comes from: the row pressed on, the page, a form the press opens, or the page's own words. */
export type ArgFrom = 'row' | 'page' | 'form' | 'literal';

/** What a press sent, by the verb's arg names. */
export type VerbArgs = Readonly<Record<string, unknown>>;

/**
 * What a tick needs to know of its list: the state field, its values, the ones that mean done, and where a new row
 * starts. The tick write reads the same four off the list's declaration (`tickPatch` in `apps/web`).
 */
export type TickShape = { state: string; values: readonly string[]; done: readonly string[]; start?: string };

/** The row a press was made on: its list and number, its version as read, its fields, or a question's id. */
export type VerbRow = {
  register?: string;
  seq?: number;
  version?: number;
  id?: string;
  fields?: Readonly<Record<string, unknown>>;
  shape?: TickShape;
};

/** One call to the record. */
export type VerbCall = { method: string; params: Record<string, unknown> };

/** One verb's binding. `method` is `null` where this host has no single change for it yet. */
export type VerbBinding = {
  method: string | null;
  /** Each arg the kernel's table names, where it comes from, and whether a press may leave it out. */
  args: Readonly<Record<string, { from: ArgFrom; optional?: true }>>;
  /** How it is taken back, in a sentence for whoever reads the table. */
  undo: string;
};

/**
 * THE TABLE. One binding a verb, in the kernel's order.
 *
 * `rule.from_arrivals` HAS NO SINGLE CHANGE ON THIS HOST. The Inbox's "Make a rule from these" opens the builder
 * (`apps/web/src/routes/inbox/pattern`), where a person points at the words the rule reads, and its save is
 * `setDeclaration` with the rule that pointing made; filing the arrivals is `fileArrival`, one at a time. Nothing takes
 * a set of arrivals and answers a rule and the filings as one change with one Undo, so the verb is refused in the
 * record's own words rather than made of several calls a press could half finish.
 */
export const VERBS = Object.freeze({
  'row.create': { method: 'create', args: { fields: { from: 'form' } }, undo: 'Retired: the new row is deleted, as an archive is.' },
  'row.update': { method: 'update', args: { field: { from: 'page' }, value: { from: 'form' } }, undo: 'The field is written back to the value the row held.' },
  'row.delete': { method: 'update', args: {}, undo: 'Brought back: deleted_at is cleared.' },
  'row.tick': { method: 'update', args: { done: { from: 'form' } }, undo: 'The state moves back, as the tick write does.' },
  'row.move': { method: 'update', args: { field: { from: 'page' }, to: { from: 'form' } }, undo: 'The field is written back to the value the row held.' },
  'suggestion.answer': { method: 'decide', args: { option: { from: 'form' }, reason: { from: 'form', optional: true } }, undo: 'Undo takes the decision back, a look first and then the press.' },
  'rule.from_arrivals': { method: null, args: { arrivals: { from: 'row' } }, undo: 'None on this host yet.' },
} as const satisfies Readonly<Record<string, VerbBinding>>);

export type BoundVerb = keyof typeof VERBS;

/** The verbs this host runs, which the page read passes to the kernel's `cutActions` so no control is sent it refuses. */
export const RUNS: ReadonlySet<string> = new Set(Object.entries(VERBS as Readonly<Record<string, VerbBinding>>).filter(([, b]) => b.method !== null).map(([v]) => v));

/** The reason a question's answer carries when the press sent none. */
export const ANSWERED_ON_PAGE = 'Answered on a page.';

const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** The row's list and number, or the refusal that says a row's verb was pressed on none. */
function rowOf(verb: string, row: VerbRow | null): Result<{ register: string; seq: number; version?: number }> {
  if (!row || !text(row.register) || !Number.isInteger(row.seq))
    return no('REQUIRED_MISSING', `${verb} acts on one row, and this press named none. Press it on a row.`, { at: 'row' });
  return ok({ register: row.register, seq: row.seq!, ...(Number.isInteger(row.version) ? { version: row.version! } : {}) });
}

/**
 * The state a tick moves to, or `null` when the list says no state to move. The same rule as `tickPatch`: done is the
 * first terminal value; not done is where a new row starts when that is one of its values and not terminal, and else
 * the first value that is not terminal.
 */
export function tickTo(shape: TickShape, done: boolean): string | null {
  const started = shape.start !== undefined && shape.values.includes(shape.start) && !shape.done.includes(shape.start) ? shape.start : undefined;
  return (done ? shape.done[0] : (started ?? shape.values.find((v) => !shape.done.includes(v)))) ?? null;
}

/**
 * The record call a press makes, or a refusal: an unknown verb, an arg the press left out, a row's verb pressed on no
 * row, or a verb this host has no single change for. `now` is the record's clock as an ISO instant, which a delete
 * writes as `deleted_at`.
 */
export function verbCall(verb: string, args: VerbArgs, row: VerbRow | null, now: string): Result<VerbCall> {
  const bound = own<VerbBinding>(VERBS, verb);
  if (!bound) return no('DECLARATION_UNKNOWN', `${JSON.stringify(verb)} is not a verb a page may press.`, { at: 'verb', allowed: Object.keys(VERBS) });
  if (bound.method === null)
    return no('NOT_IN_THIS_BUILD', `${verb} is not on this host yet: the record has no single change that files these and writes the rule. Make the rule from the Inbox.`, { at: 'verb' });
  for (const [arg, spec] of Object.entries(bound.args))
    if (!spec.optional && (!Object.hasOwn(args, arg) || args[arg] === undefined))
      return no('REQUIRED_MISSING', `${verb} needs ${arg}, and the press sent none.`, { at: arg, allowed: Object.keys(bound.args) });
  if (verb === 'row.create') {
    const register = text(args.register) ? args.register : row?.register;
    if (!text(register)) return no('REQUIRED_MISSING', 'row.create needs the list the new row goes to.', { at: 'register' });
    if (!isRecord(args.fields)) return no('VALUE_MALFORMED', "row.create's fields are the new row's values by field.", { at: 'fields' });
    return ok({ method: 'create', params: { register, fields: args.fields } });
  }
  if (verb === 'suggestion.answer') {
    if (!row || !text(row.id)) return no('REQUIRED_MISSING', 'suggestion.answer is pressed on one question, and this press named none.', { at: 'row' });
    if (!text(args.option)) return no('VALUE_MALFORMED', "suggestion.answer's option is the one picked.", { at: 'option' });
    return ok({ method: 'decide', params: { id: row.id, decide: { option: args.option, reason: text(args.reason) ? args.reason.trim() : ANSWERED_ON_PAGE } } });
  }
  const at = rowOf(verb, row);
  if (!at.ok) return at;
  const update = (patch: Record<string, unknown>): Result<VerbCall> => ok({ method: 'update', params: { ...at.value, patch } });
  if (verb === 'row.delete') return update({ deleted_at: now });
  if (verb === 'row.tick') {
    if (typeof args.done !== 'boolean') return no('VALUE_MALFORMED', "row.tick's done is true or false.", { at: 'done' });
    const shape = row!.shape;
    const to = shape ? tickTo(shape, args.done) : null;
    if (!shape || to === null) return no('VALUE_MALFORMED', `${at.value.register} says no state a tick can move, so its rows have no tick.`, { at: 'state' });
    return update({ [shape.state]: to });
  }
  /* `row.update` AND `row.move` ARE ONE WRITE, a field set to a value; a move is the value a column or a choice names. */
  if (!text(args.field)) return no('VALUE_MALFORMED', `${verb}'s field names the field it writes.`, { at: 'field' });
  return update({ [args.field]: verb === 'row.move' ? args.to : args.value });
}

/**
 * The call that takes a press back, or a refusal. `answered` is what the press's call answered: a created row's list
 * and number for `row.create`, the decision's id for `suggestion.answer`. A field written back takes the value the row held when it was pressed, so a press on a
 * row read without that field has no way back and is refused rather than written empty.
 *
 * A QUESTION'S ANSWER IS TAKEN BACK IN TWO STEPS, as Undo always takes a decision back: this is the look (`dry`), and
 * its answer carries the hash the second press sends.
 */
export function undoCall(verb: string, args: VerbArgs, row: VerbRow | null, answered: unknown, now: string): Result<VerbCall> {
  const bound = own<VerbBinding>(VERBS, verb);
  if (!bound) return no('DECLARATION_UNKNOWN', `${JSON.stringify(verb)} is not a verb a page may press.`, { at: 'verb', allowed: Object.keys(VERBS) });
  if (bound.method === null) return no('NOT_IN_THIS_BUILD', `${verb} is not on this host yet, so there is nothing to undo.`, { at: 'verb' });
  if (verb === 'row.create') {
    const made = isRecord(answered) ? answered : {};
    if (!text(made.register) || !Number.isInteger(made.seq))
      return no('REQUIRED_MISSING', 'Undo of row.create needs the row it made, and the answer named none.', { at: 'answered' });
    return ok({ method: 'update', params: { register: made.register, seq: made.seq, patch: { deleted_at: now } } });
  }
  /* BY THE DECISION, NOT THE QUESTION: `decide` answers `{ decision: 'D12', suggestion }`, and the record's undo reads
     the log by the decision's own id. The question's id finds nothing there. */
  if (verb === 'suggestion.answer') {
    const made = isRecord(answered) ? answered : {};
    if (!text(made.decision)) return no('REQUIRED_MISSING', 'Undo of suggestion.answer needs the decision it made, and the answer named none.', { at: 'answered' });
    return ok({ method: 'undo', params: { decision: made.decision, dry: true } });
  }
  const at = rowOf(verb, row);
  if (!at.ok) return at;
  const { version: _read, ...where } = at.value;
  const back = (patch: Record<string, unknown>): Result<VerbCall> => ok({ method: 'update', params: { ...where, patch } });
  if (verb === 'row.delete') return back({ deleted_at: null });
  if (verb === 'row.tick') {
    const shape = row!.shape;
    const to = shape && typeof args.done === 'boolean' ? tickTo(shape, !args.done) : null;
    if (!shape || to === null) return no('VALUE_MALFORMED', `${at.value.register} says no state a tick can move back.`, { at: 'state' });
    /* THE STATE THE ROW HELD, where it was read with one: a tick undone puts back `doing`, not the first open value. */
    const held = row!.fields?.[shape.state];
    return back({ [shape.state]: typeof held === 'string' && shape.values.includes(held) ? held : to });
  }
  const field = text(args.field) ? args.field : '';
  if (!field || !row!.fields || !Object.hasOwn(row!.fields, field))
    return no('REQUIRED_MISSING', `Undo of ${verb} needs the value ${field || 'the field'} held, and the row was read without it.`, { at: 'field' });
  return back({ [field]: row!.fields[field] ?? null });
}
