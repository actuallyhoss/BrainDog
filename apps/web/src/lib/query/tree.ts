/**
 * The query builder's model: one `where` tree as rows a person edits, and the three ways back out of it.
 *
 * ONE TREE, FOUR SURFACES (`docs/21 §4.1`). A filter is written in four places in this app: a list's filter, a saved
 * view's narrowing, a page block's filter and an automation's condition. Each had, or was about to have, its own editor,
 * and three editors of one tree is three readings of it that drift. So the tree is edited here and only here, as a
 * group of rows: one condition is one sentence row, two or more are a stack, and groups nest to `MAX_DEPTH`.
 *
 * THE ROWS ARE NOT THE TREE, AND THE DIFFERENCE IS ON PURPOSE. A row being typed has no value yet, and a tree with a
 * half-typed clause in it would narrow the list to nothing under the person typing it. So a row holds what the person
 * sees (the words in the box), and `toWhere` emits only the rows that are whole. A value is read into the record's own
 * shape by the record's own parser (`parseWhere`), never by a second reader here: `GBP 960.00` becomes
 * `{ amount: 96000, currency: 'GBP' }` exactly as the same words in a page's `where:` would.
 *
 * THE WAYS OUT, EACH NAMING WHAT IT CANNOT SAY. `toWhere` is the tree every consumer stores. `toChips` is the list's
 * address (`19 §5`), which carries a flat "and" of chips and nothing else, so it answers `null` for a group. `sentenceOf`
 * is the text lens, the grammar `@braindog/where` parses, which joins one way per sentence and has no brackets, so it
 * answers `null` for a group too. None of them drops a clause to fit.
 *
 * PURE, SO `node --test` CAN IMPORT IT: no runes, no `$lib`, relative imports only.
 */

import {
  clausesOf,
  operatorAllowed,
  parseWhere,
  quoteValue,
  type Operator,
  type Predicate,
  type Schema,
  type SentenceDeps,
} from '@braindog/where';
import { exponentOf, withUnit } from 'braindog-render';
import type { Filter } from '../record/schema.ts';

/** How deep groups nest. At the cap the add-group control disables and shows the meter; it never refuses. */
export const MAX_DEPTH = 3;

/** How long the builder waits after the last change before it asks the record for the count. */
export const COUNT_WAIT_MS = 300;

/**
 * One field the builder may name, in the shape a register's declaration already has, so a list passes its fields as
 * they are. `choices` is the one addition: a link's rows as the caller has them, the value a condition holds beside the
 * title it is said by, since a link names its row by title and never by an id a person cannot read.
 */
export type QueryField = {
  id: string;
  type: string;
  label?: string | undefined;
  of?: string | undefined;
  to?: string | undefined;
  values?: readonly string[] | undefined;
  labels?: Readonly<Record<string, string>> | undefined;
  retired?: boolean | undefined;
  choices?: readonly { value: string; label: string }[] | undefined;
};

export type Join = 'all' | 'any' | 'none';
export const JOINS: readonly Join[] = ['all', 'any', 'none'];

/** The builder's operators. Each is one `where` operator, except `within`, which is `after` a relative day. */
export type OpId =
  | 'is'
  | 'not'
  | 'contains'
  | 'starts'
  | 'ends'
  | 'before'
  | 'after'
  | 'within'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'has'
  | 'lacks'
  | 'empty'
  | 'present';

/**
 * EACH OPERATOR SAID IN ENGLISH, BESIDE THE `where` OPERATOR IT IS. `takes` is how many values it holds: none for the
 * two questions about absence, one for most, and `many` for `is` and `is not`, which become `in` and `not_in` when more
 * than one value is chosen.
 */
export const OPS: Readonly<Record<OpId, { where: Operator; said: string; takes: 0 | 1 | 'many' }>> = {
  is: { where: 'is', said: 'is', takes: 'many' },
  not: { where: 'not', said: 'is not', takes: 'many' },
  contains: { where: 'contains', said: 'contains', takes: 1 },
  starts: { where: 'starts', said: 'starts with', takes: 1 },
  ends: { where: 'ends', said: 'ends with', takes: 1 },
  before: { where: 'before', said: 'before', takes: 1 },
  after: { where: 'after', said: 'after', takes: 1 },
  within: { where: 'after', said: 'within the last', takes: 1 },
  gt: { where: 'gt', said: 'more than', takes: 1 },
  gte: { where: 'gte', said: 'at least', takes: 1 },
  lt: { where: 'lt', said: 'less than', takes: 1 },
  lte: { where: 'lte', said: 'at most', takes: 1 },
  has: { where: 'has', said: 'includes', takes: 1 },
  lacks: { where: 'lacks', said: 'does not include', takes: 1 },
  empty: { where: 'empty', said: 'is empty', takes: 0 },
  present: { where: 'present', said: 'is set', takes: 0 },
};

/**
 * The operators the list's address can carry: every one but `starts` and `ends`, which no chip spells (`whereOf` in
 * `record/api.ts` has the chip operators). A surface that writes the address passes this as `ops`, so the builder never
 * offers a condition the address would have to drop.
 */
export const ADDRESS_OPS: readonly OpId[] = (Object.keys(OPS) as OpId[]).filter((op) => op !== 'starts' && op !== 'ends');

/**
 * WHICH OPERATORS A TYPE IS OFFERED, IN THE ORDER A PERSON REACHES FOR THEM. The family is this file's choice of what
 * to show; whether the record accepts it is `operatorAllowed`'s, which every family is filtered through, so the day the
 * record's table narrows the builder narrows with it. A day compares by `before` and `after`, never by "more than".
 */
function familyOf(type: string): readonly OpId[] {
  switch (type) {
    case 'enum':
    case 'ref':
    case 'bool':
      return ['is', 'not', 'empty', 'present'];
    case 'int':
    case 'decimal':
    case 'duration':
    case 'money':
    case 'quantity':
      return ['is', 'not', 'gt', 'gte', 'lt', 'lte', 'empty', 'present'];
    case 'day':
    case 'instant':
      return ['is', 'before', 'after', 'within', 'empty', 'present'];
    case 'list':
      return ['has', 'lacks', 'empty', 'present'];
    case 'secret':
      return ['empty', 'present'];
    default:
      return ['is', 'not', 'contains', 'starts', 'ends', 'empty', 'present'];
  }
}

/** The operators one field is offered, narrowed to `allowed` when the surface has a narrower grammar. */
export function opsFor(field: QueryField | undefined, allowed?: readonly OpId[]): OpId[] {
  if (!field) return [];
  return familyOf(field.type).filter((op) => operatorAllowed(OPS[op].where, field.type) && (!allowed || allowed.includes(op)));
}

/** The fields a condition may name: every field the register still has. */
export const offered = (fields: readonly QueryField[]): QueryField[] => fields.filter((f) => !f.retired);

/** The name a person reads for a field. Absent a label, the id with `_` as a space (`labelOf`'s rule). */
export const fieldSaid = (f: QueryField): string => f.label ?? f.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* ── the rows ─────────────────────────────────────────────────────────────── */

/** One condition as the person sees it: the field, the operator, and the words in the value box. */
export type Cond = { kind: 'cond'; key: number; field: string; op: OpId; values: string[]; proposed?: true };
/** A group of rows joined one way. The root is a group too. */
export type Grp = { kind: 'group'; key: number; join: Join; items: Item[]; proposed?: true };
export type Item = Cond | Grp;

/** What a condition's controls change. */
export type CondPatch = { field?: string; op?: OpId; values?: string[] };
/** What a group's control changes. */
export type GroupPatch = { join?: Join };

/**
 * A KEY PER ROW, SO SVELTE KEEPS A ROW'S FOCUS AND ITS HALF-TYPED BOX WHEN THE ONE ABOVE IT IS REMOVED. A counter, not a
 * random id: nothing outside this tab ever sees it.
 */
let counter = 0;
const nextKey = (): number => ++counter;

export const emptyRoot = (join: Join = 'all'): Grp => ({ kind: 'group', key: nextKey(), join, items: [] });

/** A new condition on the first field, asking the first thing that field is asked. */
export function newCond(fields: readonly QueryField[], allowed?: readonly OpId[]): Cond {
  const field = offered(fields)[0];
  return { kind: 'cond', key: nextKey(), field: field?.id ?? '', op: opsFor(field, allowed)[0] ?? 'is', values: [] };
}

/** Every item under a group, walked in the order they are drawn. */
function* walk(g: Grp): Generator<Item> {
  for (const item of g.items) {
    yield item;
    if (item.kind === 'group') yield* walk(item);
  }
}

/** A group with one item replaced wherever it sits. `null` from `swap` removes the item. */
function mapItems(g: Grp, swap: (item: Item) => Item | null): Grp {
  const items: Item[] = [];
  for (const item of g.items) {
    const out = swap(item);
    if (out === null) continue;
    items.push(out.kind === 'group' ? mapItems(out, swap) : out);
  }
  return { ...g, items };
}

/**
 * A patch applied to one condition or group.
 *
 * A NEW FIELD TAKES A NEW OPERATOR ONLY WHEN THE OLD ONE DOES NOT APPLY, and always empties the value: "is open" on a
 * status moved to a date would otherwise ask whether a day is the word "open", and the record would refuse a filter the
 * person never wrote.
 */
export function patched(root: Grp, key: number, patch: CondPatch & GroupPatch, fields: readonly QueryField[], allowed?: readonly OpId[]): Grp {
  const apply = (item: Item): Item => {
    if (item.key !== key) return item;
    if (item.kind === 'group') return patch.join ? { ...item, join: patch.join } : item;
    const next: Cond = { ...item };
    if (patch.field !== undefined && patch.field !== item.field) {
      next.field = patch.field;
      next.values = [];
      const ops = opsFor(fields.find((f) => f.id === patch.field), allowed);
      if (!ops.includes(next.op)) next.op = ops[0] ?? 'is';
    }
    if (patch.op !== undefined && patch.op !== next.op) {
      /* WITHIN TAKES A NUMBER OF DAYS AND NOTHING ELSE TAKES THAT, so a value carried across it would be read wrong. */
      if (patch.op === 'within' || next.op === 'within' || OPS[patch.op].takes === 0) next.values = [];
      next.op = patch.op;
    }
    if (patch.values !== undefined) next.values = patch.values;
    return next;
  };
  if (root.key === key) return apply(root) as Grp;
  return mapItems(root, apply);
}

export const removed = (root: Grp, key: number): Grp => mapItems(root, (item) => (item.key === key ? null : item));

export const added = (root: Grp, group: number, item: Item): Grp => {
  if (root.key === group) return { ...root, items: [...root.items, item] };
  return mapItems(root, (x) => (x.key === group && x.kind === 'group' ? { ...x, items: [...x.items, item] } : x));
};

/** How deep a group sits: the root is 1. `0` when the key names no group. */
export function levelOf(root: Grp, key: number, at = 1): number {
  if (root.key === key) return at;
  for (const item of root.items) {
    if (item.kind !== 'group') continue;
    const found = levelOf(item, key, at + 1);
    if (found) return found;
  }
  return 0;
}

/** How deep the deepest group goes, the figure the meter shows. */
export function depthOf(g: Grp): number {
  let deepest = 0;
  for (const item of g.items) if (item.kind === 'group') deepest = Math.max(deepest, depthOf(item));
  return 1 + deepest;
}

/** How many conditions the tree holds, at any depth. */
export const condCount = (g: Grp): number => [...walk(g)].filter((i) => i.kind === 'cond').length;

/** The first proposed row from the top: the only one that may be kept next, since proposals are approved in order. */
export function topProposed(g: Grp): number | null {
  for (const item of walk(g)) if (item.proposed) return item.key;
  return null;
}

/** An item without its proposal mark, and every row under it too, since a kept group is kept whole. */
function unmarked(item: Item): Item {
  if (item.kind === 'group') {
    const { proposed: _group, ...g } = item;
    return { ...g, items: g.items.map(unmarked) };
  }
  const { proposed: _cond, ...c } = item;
  return c;
}

/** One proposal kept: it loses its mark and becomes part of the filter. */
export const approved = (root: Grp, key: number): Grp => mapItems(root, (item) => (item.key === key ? unmarked(item) : item));

/** Every proposal kept at once, which `Approve all` does and nothing does by default. */
export const approvedAll = (root: Grp): Grp => ({ ...root, items: root.items.map(unmarked) });

/** The tree as it stands without anything still proposed: what the surface is handed. */
export const withoutProposed = (root: Grp): Grp => mapItems(root, (item) => (item.proposed ? null : item));

/** Rows appended as proposals, each one marked, so none of them is part of the filter until it is kept. */
export function proposing(root: Grp, draft: Grp): Grp {
  const mark = (item: Item): Item => (item.kind === 'group' ? { ...item, proposed: true, items: item.items.map(mark) } : { ...item, proposed: true });
  /* THE DRAFT'S OWN JOIN IS KEPT. Onto nothing, the draft is the filter's shape; onto rows joined the same way, or as
     one row, its rows join the stack; otherwise it goes in as one group, so "any of" Slash wrote is not read as "all". */
  if (root.items.length === 0) return { ...root, join: draft.join, items: draft.items.map(mark) };
  if (draft.join === root.join || draft.items.length === 1) return { ...root, items: [...root.items, ...draft.items.map(mark)] };
  return { ...root, items: [...root.items, mark(draft)] };
}

/**
 * Whether rows fit the surface they are offered on: no deeper than its `depth`, only its operators, and on a surface
 * of depth 1 only a flat "and", which is all the list's address can carry. Slash's draft is held to this before it is
 * drawn, so a proposal is never a row the surface would then have to refuse.
 */
export function fits(g: Grp, depth: number, ops?: readonly OpId[]): boolean {
  if (depthOf(g) > depth || (depth === 1 && g.join !== 'all')) return false;
  return [...walk(g)].every((i) => i.kind === 'group' || !ops || ops.includes(i.op));
}

/** The count under the builder: how many rows the filter matches, of how many the list holds. */
export type Counted = { n: number; of: number };

/* ── out: the tree ────────────────────────────────────────────────────────── */

/** The schema `@braindog/where` checks a sentence against, from the fields as the builder holds them. */
export function schemaFor(register: string, fields: readonly QueryField[]): Schema {
  const out: Schema['fields'] = {};
  for (const f of offered(fields))
    out[f.id] = {
      type: f.type,
      ...(f.of ? { of: f.of } : {}),
      ...(f.to ? { to: f.to } : {}),
      ...(f.values ? { values: f.values } : {}),
      ...(f.label ? { label: f.label } : {}),
      ...(f.labels ? { labels: f.labels } : {}),
    };
  return { register, fields: out };
}

/** The clause word each compared operator is said by in a sentence, which is what `parseWhere` reads a value through. */
const VERB: Partial<Record<OpId, string>> = { is: 'is', not: 'is not', gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most' };

/** The types whose value is a number, a money or a quantity: read by the record's parser, never by a regex here. */
const READ_BY_RECORD = new Set(['int', 'decimal', 'duration', 'money', 'quantity']);

/** A day as a number of days back, the only value `within` takes: digits, and at most four of them. */
const DAYS = /^\d{1,4}$/;
const DAYS_BACK = /^-(\d{1,4})d$/;

/**
 * One value, in the shape the record's tree holds for the field.
 *
 * A NUMBER, A MONEY OR A QUANTITY IS READ BY `parseWhere` over the one clause the row says, so the literal is the
 * record's and a typed `0x10` is not sixteen. A value the parser refuses goes over as it was typed, so the record
 * refuses it in its own words rather than this file quietly dropping a clause and widening the list.
 */
function valueOf(schema: Schema, field: QueryField, op: OpId, raw: string): unknown {
  const typed = raw.trim();
  if (field.type === 'bool') return typed === 'true' ? true : typed === 'false' ? false : typed;
  const verb = VERB[op];
  if (!verb || !READ_BY_RECORD.has(field.type)) return typed;
  const read = parseWhere(`${field.id} ${verb} ${typed}`, schema, { nowMs: 0 });
  const leaf = read.predicate as Record<string, unknown> | undefined;
  const key = OPS[op].where;
  return read.bad.length === 0 && leaf && Object.hasOwn(leaf, key) ? leaf[key] : typed;
}

/** One whole condition as one leaf, or `null` while it is still being written. */
function leafOf(c: Cond, schema: Schema, fields: readonly QueryField[]): Predicate | null {
  const field = fields.find((f) => f.id === c.field);
  if (!field) return null;
  const spec = OPS[c.op];
  if (spec.takes === 0) return { field: c.field, [spec.where]: true };
  const values = c.values.map((v) => v.trim()).filter((v) => v !== '');
  const first = values[0];
  if (first === undefined) return null;
  if (c.op === 'within') return DAYS.test(first) ? { field: c.field, after: `-${first}d` } : null;
  if (spec.takes === 'many' && values.length > 1)
    return { field: c.field, [c.op === 'is' ? 'in' : 'not_in']: values.map((v) => valueOf(schema, field, 'is', v)) };
  return { field: c.field, [spec.where]: valueOf(schema, field, c.op, first) };
}

function nodeOf(item: Item, schema: Schema, fields: readonly QueryField[]): Predicate | null {
  if (item.kind === 'cond') return leafOf(item, schema, fields);
  const kids = item.items.map((i) => nodeOf(i, schema, fields)).filter((n): n is Predicate => n !== null);
  if (kids.length === 0) return null;
  if (item.join === 'all') return { all: kids };
  if (item.join === 'any') return { any: kids };
  return { none: kids };
}

/**
 * The rows as the `where` tree the record stores, or `undefined` when nothing narrows.
 *
 * ONE CONDITION UNDER "ALL" IS THE LEAF ITSELF, which is how every `where` in the seed is written, so a filter saved
 * from here reads back the way a hand-written one does. A group left empty is dropped, since `{ all: [] }` is a
 * question nobody asked. Proposals are the caller's to strip first (`withoutProposed`): the count is asked with them in.
 */
export function toWhere(root: Grp, register: string, fields: readonly QueryField[]): Predicate | undefined {
  const schema = schemaFor(register, fields);
  const node = nodeOf(root, schema, fields);
  if (node === null) return undefined;
  const kids = (node as { all?: Predicate[] }).all;
  return root.join === 'all' && kids?.length === 1 ? kids[0] : node;
}

/* ── in: the tree ─────────────────────────────────────────────────────────── */

/** A stored value as the words a person types for it: a money as `GBP 960.00`, a quantity as `5 kg`. */
function wordsOf(v: unknown): string {
  if (typeof v === 'object' && v !== null) {
    const o = v as { amount?: unknown; currency?: unknown; value?: unknown; unit?: unknown };
    if (typeof o.amount === 'number' && typeof o.currency === 'string') {
      const places = exponentOf(o.currency);
      return `${o.currency} ${(o.amount / 10 ** places).toFixed(places)}`;
    }
    if (typeof o.value === 'number' && typeof o.unit === 'string') return withUnit(String(o.value), o.unit);
  }
  return String(v);
}

/** The leaf keys the builder draws, each with the row it becomes. `via`, `matches` and `near` are not among them. */
const LEAF_OPS: readonly (readonly [string, OpId])[] = [
  ['is', 'is'],
  ['in', 'is'],
  ['not', 'not'],
  ['not_in', 'not'],
  ['contains', 'contains'],
  ['starts', 'starts'],
  ['ends', 'ends'],
  ['before', 'before'],
  ['after', 'after'],
  ['gt', 'gt'],
  ['gte', 'gte'],
  ['lt', 'lt'],
  ['lte', 'lte'],
  ['has', 'has'],
  ['lacks', 'lacks'],
  ['empty', 'empty'],
  ['present', 'present'],
];

function itemOf(node: unknown, fields: readonly QueryField[]): Item | null {
  if (typeof node !== 'object' || node === null) return null;
  const o = node as Record<string, unknown>;
  for (const join of JOINS) {
    const kids = o[join];
    if (!Array.isArray(kids)) continue;
    const items = kids.map((k) => itemOf(k, fields));
    return items.every((i): i is Item => i !== null) ? { kind: 'group', key: nextKey(), join, items } : null;
  }
  /* A HOP, A TEXT SEARCH OR A FIELD THIS REGISTER DOES NOT HAVE IS NOT A ROW THIS BUILDER CAN DRAW, and drawing it as
     something near it would save a different filter the moment anything else was touched. */
  if (typeof o.field !== 'string' || o.via !== undefined || !fields.some((f) => f.id === o.field)) return null;
  const field = o.field;
  if (Array.isArray(o.between) && o.between.length === 2) {
    const [low, high] = o.between;
    return {
      kind: 'group',
      key: nextKey(),
      join: 'all',
      items: [
        { kind: 'cond', key: nextKey(), field, op: 'gte', values: [wordsOf(low)] },
        { kind: 'cond', key: nextKey(), field, op: 'lte', values: [wordsOf(high)] },
      ],
    };
  }
  for (const [key, op] of LEAF_OPS) {
    if (!Object.hasOwn(o, key)) continue;
    const v = o[key];
    /* `empty: false` IS "IS SET", and `present: false` is "is empty": the record reads both, so both are drawn. */
    if (op === 'empty' || op === 'present') return { kind: 'cond', key: nextKey(), field, op: (v === false) === (op === 'empty') ? 'present' : 'empty', values: [] };
    if (op === 'after' && typeof v === 'string') {
      const back = DAYS_BACK.exec(v);
      if (back) return { kind: 'cond', key: nextKey(), field, op: 'within', values: [back[1] ?? ''] };
    }
    const values = Array.isArray(v) ? v.map(wordsOf) : [wordsOf(v)];
    return { kind: 'cond', key: nextKey(), field, op, values };
  }
  return null;
}

/**
 * A stored `where` tree as rows, or `null` when some part of it cannot be drawn as one.
 *
 * `null` IS AN ANSWER THE SURFACE MUST RESPECT: it keeps the stored filter as it is and says so (`copy.queryUndrawn`),
 * because rows that drew most of a filter would save the rest away the first time anybody pressed anything.
 */
export function fromWhere(where: unknown, fields: readonly QueryField[]): Grp | null {
  if (where === undefined || where === null) return emptyRoot();
  const item = itemOf(where, fields);
  if (item === null) return null;
  return item.kind === 'group' ? item : { kind: 'group', key: nextKey(), join: 'all', items: [item] };
}

/* ── the address ──────────────────────────────────────────────────────────── */

/** A chip value that asks about absence rather than naming a value: `leafOf` in `record/remote.ts` reads the same words. */
const EMPTY_WORDS = new Set(['empty']);
const SET_WORDS = new Set(['set', 'present']);

/**
 * The list's address chips as rows, and the chips the rows cannot draw, which the address keeps as they were.
 *
 * THE CHIP'S OPERATORS ARE `whereOf`'S (`record/api.ts`), read the same way: `in` and `is` are "is", `not-in` and
 * `not-on` are "is not", a lone `empty` or `set` is the question about absence unless the field declares the word, and
 * `after -30d` is "within the last 30 days". A chip this reads as nothing is kept, never dropped.
 */
export function fromChips(filters: readonly Filter[], fields: readonly QueryField[]): { root: Grp; kept: Filter[] } {
  const root = emptyRoot();
  const kept: Filter[] = [];
  for (const f of filters) {
    const field = fields.find((x) => x.id === f.field);
    const one = f.values.length === 1 ? (f.values[0] ?? '') : null;
    const declares = (word: string): boolean => field?.values?.includes(word) === true;
    const cond = (op: OpId, values: string[]): Cond => ({ kind: 'cond', key: nextKey(), field: f.field, op, values });
    if (!field) {
      kept.push(f);
      continue;
    }
    if (f.op === 'in' || f.op === 'is' || f.op === 'on') {
      if (one !== null && EMPTY_WORDS.has(one) && !declares(one)) root.items.push(cond('empty', []));
      else if (one !== null && SET_WORDS.has(one) && !declares(one)) root.items.push(cond('present', []));
      else root.items.push(cond('is', [...f.values]));
    } else if (f.op === 'not-in' || f.op === 'not-on') {
      if (one !== null && EMPTY_WORDS.has(one) && !declares(one)) root.items.push(cond('present', []));
      else if (one !== null && SET_WORDS.has(one) && !declares(one)) root.items.push(cond('empty', []));
      else root.items.push(cond('not', [...f.values]));
    } else if (f.op === 'after' && one !== null && DAYS_BACK.test(one)) {
      root.items.push(cond('within', [DAYS_BACK.exec(one)?.[1] ?? '']));
    } else if (f.op === 'between' && f.values.length === 2) {
      root.items.push(cond('gte', [f.values[0] ?? '']), cond('lte', [f.values[1] ?? '']));
    } else if (one !== null && (ADDRESS_OPS as readonly string[]).includes(f.op) && OPS[f.op as OpId].takes === 1) {
      root.items.push(cond(f.op as OpId, [one]));
    } else {
      kept.push(f);
    }
  }
  return { root, kept };
}

/**
 * The rows as the list's address chips, or `null` when the rows say something the address cannot.
 *
 * THE ADDRESS IS A FLAT "AND" (`chipsOf` in `record/api.ts`; the register route does not read `join=any`), so a group,
 * an "any" or a "none" at the root, or an operator no chip spells, is `null`, and the surface offers none of those
 * (`ADDRESS_OPS`, and `depth` 1). A condition still being written is left out, as `toWhere` leaves it out.
 */
export function toChips(root: Grp, fields: readonly QueryField[]): Filter[] | null {
  if (root.join !== 'all') return null;
  const out: Filter[] = [];
  for (const item of root.items) {
    if (item.kind === 'group' || !ADDRESS_OPS.includes(item.op)) return null;
    const field = fields.find((f) => f.id === item.field);
    const values = item.values.map((v) => v.trim()).filter((v) => v !== '');
    const dated = field?.type === 'day' || field?.type === 'instant';
    if (item.op === 'empty') out.push({ field: item.field, op: 'is', values: ['empty'] });
    else if (item.op === 'present') out.push({ field: item.field, op: 'is', values: ['set'] });
    else if (values.length === 0) continue;
    else if (item.op === 'within') {
      if (DAYS.test(values[0] ?? '')) out.push({ field: item.field, op: 'after', values: [`-${values[0]}d`] });
    } else if (item.op === 'is') out.push({ field: item.field, op: 'in', values });
    else if (item.op === 'not') out.push({ field: item.field, op: dated ? 'not-on' : 'not-in', values: dated ? values.slice(0, 1) : values });
    else out.push({ field: item.field, op: item.op, values: values.slice(0, 1) });
  }
  return out;
}

/* ── the text lens ────────────────────────────────────────────────────────── */

/**
 * The rows as the sentence `@braindog/where` parses, or `null` when they are not one sentence.
 *
 * THE GRAMMAR JOINS ONE WAY PER SENTENCE AND HAS NO BRACKETS (`state is open, or due before today`; never both), so a
 * nested group or a "none of" has no sentence, and neither do `starts with` and `ends with`, which the sentence does not
 * read. The field is said by its label, which the parser matches as it matches the id. One value is quoted where its
 * bare words would not read back as it (`quoteValue`, the record's own rule); several values joined by "or" cannot be.
 */
export function sentenceOf(root: Grp, fields: readonly QueryField[]): string | null {
  if (root.join === 'none') return null;
  const clauses: string[] = [];
  for (const item of root.items) {
    if (item.kind === 'group' || item.op === 'starts' || item.op === 'ends') return null;
    const field = fields.find((f) => f.id === item.field);
    if (!field) return null;
    const name = field.label ?? field.id;
    const values = item.values.map((v) => v.trim()).filter((v) => v !== '');
    const said = values.length === 1 ? quoteValue(values[0] ?? '') : values.join(' or ');
    if (item.op === 'empty') clauses.push(`${name} is empty`);
    else if (item.op === 'present') clauses.push(`${name} is set`);
    else if (values.length === 0) continue;
    else if (item.op === 'within') clauses.push(`${name} after -${values[0] ?? ''}d`);
    else if (item.op === 'is' || item.op === 'not') clauses.push(`${name} ${VERB[item.op] ?? 'is'} ${said}`);
    else clauses.push(`${name} ${VERB[item.op] ?? OPS[item.op].where} ${said}`);
  }
  return clauses.join(root.join === 'any' ? ', or ' : ', ');
}

/** What the text lens read: the rows, or where it stopped and the record's own sentence for why. */
export type Read = { ok: true; root: Grp } | { ok: false; after: string | null; fix: string };

/**
 * Typed text as rows, through the record's own parser.
 *
 * A REFUSAL SAYS WHERE IT STOPPED, not only why: the clause before the first one the parser refuses, so "Could not read
 * after ..." points at the place to look. The rows it last read stay drawn (the caller keeps them), and nothing here
 * clears them. A link is read by title through the caller's `choices`, which is the one lookup the parser asks for.
 */
export function readSentence(text: string, register: string, fields: readonly QueryField[], nowMs: number): Read {
  const schema = schemaFor(register, fields);
  const deps: SentenceDeps = {
    nowMs,
    refByTitle: (_list, title) => {
      const t = title.trim().toLowerCase();
      const ids = fields.flatMap((f) => (f.choices ?? []).filter((c) => c.label.toLowerCase() === t).map((c) => c.value));
      return ids.length ? ids : null;
    },
  };
  const read = parseWhere(text, schema, deps);
  if (read.bad.length > 0) {
    const clauses = clausesOf(text).map((c) => c.trim().replace(/^or\s+/i, ''));
    let at = 0;
    while (at < clauses.length && parseWhere(clauses[at], schema, deps).bad.length === 0) at++;
    return { ok: false, after: at > 0 ? (clauses[at - 1] ?? null) : null, fix: read.bad[0]?.fix ?? '' };
  }
  const root = fromWhere(read.predicate, fields);
  return root ? { ok: true, root } : { ok: false, after: null, fix: '' };
}

/* ── what a row and a group are handed ────────────────────────────────────── */

/**
 * The builder's edits, handed down to every group and row, so the tree has one owner and a row never holds a copy of
 * its own condition that could drift from the one the builder emits.
 */
export type Edits = {
  fields: readonly QueryField[];
  ops: readonly OpId[] | undefined;
  /** The deepest a group may sit, the root being 1. */
  depth: number;
  /** How deep the tree goes now, for the meter. */
  deepest: number;
  /** The one proposal that may be kept next, or `null` when nothing is proposed. */
  next: number | null;
  set(key: number, patch: CondPatch & GroupPatch): void;
  remove(key: number): void;
  addCond(group: number): void;
  addGroup(group: number): void;
  keep(key: number): void;
};
