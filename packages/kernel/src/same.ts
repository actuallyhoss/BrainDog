/**
 * Which rows of a list are here twice, and what folding them would write (jobs c and d).
 *
 * A LIST SAYS WHAT MAKES TWO OF ITS ROWS ONE, in its own `same:` (`declare.ts`'s `sameFault`), and `entities.ts`'s
 * `rowKeys` reads that as one key a row: `same:<list>:<where>:<what>`. This file reads those keys three ways:
 *
 *   - `sameDoor`: the write path's refusal of a second row saying what a first says, naming the first and carrying the
 *     call that confirms or changes it (`index.ts`, beside the merge door).
 *   - `clashes`: the groups of rows already here twice, each with the one its `keep` keeps.
 *   - `foldPlan`: for every group, the writes that fold it into the one kept.
 *
 * A ROW IS HERE WHEN IT IS LIVE AND NOT FINISHED. A skill retired, or a learning superseded, says nothing now, so it
 * neither blocks a new one nor counts as a second: a folded row is moved to the list's finished state, and once there
 * it stops being here twice. That is why the rows are read from the list itself and not from `entity_key`, where the
 * first live row keeps a key even after it is finished.
 *
 * A ROW HOLDING A SEALED VALUE IS NEVER FOLDED AWAY. For keys the older row is often the import's index row and the
 * newer one holds the sealed value, so whatever `keep` says, a group holding one keeps it, and a second sealed row of
 * the same key stays beside it: throwing one of two sealed values away is the person's to decide, never a plan's.
 *
 * NOTHING HERE WRITES. `clashes` and `foldPlan` read the list and answer; a person's press files the plan as one
 * question (`held-twice.ts` in `packages/record`), and the owner's accept writes it in one batch with one Undo.
 */

import type { Refusal, Sql } from '@braindog/ports';

import { rowKeys, sameLists, type EntityDecl, type SameList, type SameRule } from './entities.ts';
import { sealedAs } from './flow-lint.ts';

/** A field as this file reads it: its id, its type and, for a link, the list it points into. */
type SameField = {
  id: string;
  type: string;
  of?: string;
  to?: string;
  retired?: boolean;
  derived?: boolean;
  deadline?: boolean;
  transitions?: Readonly<Record<string, { to: readonly string[] }>>;
};

/** A list as this file reads it: the parts of a register's declaration it needs. */
export type SameDecl = {
  id: string;
  name?: string;
  title?: string;
  fields: readonly SameField[];
  state?: string;
  done?: readonly string[];
  finished?: string;
  seq_prefix?: string;
  same?: unknown;
};

/** A group of rows that say one thing: the key they share, the row kept, and the rows that would fold into it. */
export type SameGroup = { key: string; keep: string; others: string[] };

/**
 * One write of a fold. A link moved (`patch` names the fields that pointed at a row folded away), a row moved to the
 * list's finished state with `note` saying where it went, or, on a list with no finished state, a row deleted.
 */
export type FoldWrite =
  | { register: string; at: string; patch: Readonly<Record<string, string | readonly string[]>>; note?: string }
  | { register: string; at: string; delete: true; note: string };

/** A group and the writes that fold it, links first, so no write deletes a row another still points at. */
export type FoldGroup = SameGroup & { writes: FoldWrite[] };

/** A row as it is read here: its id, its number, its fields and its state, oldest first. */
type Here = { id: string; seq: number | null; fields: Record<string, unknown>; state: string | null };

/** The list's `same:` as `entities.ts` reads it, or `null` for a list that declares none or one no row can answer. */
export function sameListOf(decl: SameDecl): SameList | null {
  return sameLists([decl as unknown as EntityDecl])[0] ?? null;
}

/** The rule of a list's `same:`, or `null`. */
export const sameRuleOf = (decl: SameDecl): SameRule | null => sameListOf(decl)?.same ?? null;

const parsed = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The rows of the list that are here: live, and not in a finished state, in the order they were made. */
function rowsHere(sql: Pick<Sql, 'all'>, decl: SameDecl): Here[] {
  const done = new Set(decl.done ?? []);
  return sql
    .all<{ id: string; seq: number | null; fields: string; state: string | null }>(
      'SELECT id, seq, fields, state FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY created_at, rowid',
      decl.id,
    )
    .filter((r) => r.state === null || !done.has(r.state))
    .map((r) => ({ id: r.id, seq: r.seq, fields: parsed(r.fields), state: r.state }));
}

/** Whether a row holds a value in one of the list's sealed fields (a secret or a file). */
function holdsSealed(decl: SameDecl, fields: Readonly<Record<string, unknown>>): boolean {
  return decl.fields.some((f) => {
    if (f.retired === true || sealedAs(f) === null) return false;
    const v = fields[f.id];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
}

/**
 * The row of `rows` (oldest first, one key) that the rule keeps: the oldest, the latest, or the one holding a sealed
 * value. A sealed row is kept whatever the rule says, the oldest of them for `oldest` and `sealed`, the latest for
 * `latest`; with none, `sealed` keeps the oldest.
 */
function keptOf(decl: SameDecl, rule: SameRule, rows: readonly Here[]): Here {
  const sealed = rows.filter((r) => holdsSealed(decl, r.fields));
  const from = sealed.length > 0 ? sealed : rows;
  return rule.keep === 'latest' ? from.at(-1)! : from[0]!;
}

/** The rows here grouped by the key they share, each group oldest first, only where two or more share one. */
function grouped(sql: Pick<Sql, 'all'>, decl: SameDecl, list: SameList): Map<string, Here[]> {
  const by = new Map<string, Here[]>();
  for (const row of rowsHere(sql, decl))
    for (const key of rowKeys(list, row.fields)) by.set(key, [...(by.get(key) ?? []), row]);
  for (const [key, rows] of by) if (rows.length < 2) by.delete(key);
  return by;
}

/**
 * The groups of rows here that hold one key, each with the row its `keep` keeps and the others, by row id. A group
 * whose other rows all hold a sealed value folds nothing, so it is not answered. Reads, and writes nothing.
 */
export function clashes(sql: Pick<Sql, 'all'>, list: SameDecl): SameGroup[] {
  const same = sameListOf(list);
  if (same === null) return [];
  const out: SameGroup[] = [];
  for (const [key, rows] of grouped(sql, list, same)) {
    const kept = keptOf(list, same.same, rows);
    const others = rows.filter((r) => r.id !== kept.id && !holdsSealed(list, r.fields)).map((r) => r.id);
    if (others.length > 0) out.push({ key, keep: kept.id, others });
  }
  return out;
}

/** A row as a person says it, `SK4`, or `skills#4` on a list with no prefix of its own. */
const spokenOf = (decl: SameDecl, row: Pick<Here, 'id' | 'seq'>): string =>
  row.seq === null ? row.id : decl.seq_prefix && decl.seq_prefix !== '#' ? `${decl.seq_prefix}${row.seq}` : `${decl.id}#${row.seq}`;

/** A row by its title, as a person reads it, its last stop dropped so a lesson reads inside a sentence, or its spoken id when it has none. */
function calledOf(decl: SameDecl, row: Here): string {
  const said = decl.title === undefined ? undefined : row.fields[decl.title];
  const words = typeof said === 'string' ? said.trim().replace(/[.!?]+$/u, '').trim() : '';
  return words !== '' ? words : spokenOf(decl, row);
}

/** Whether a field links into the list `to`, one row or a list of them. */
const linksInto = (f: SameField, to: string): boolean =>
  f.retired !== true && f.derived !== true && f.to === to && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref'));

/**
 * The finished state a row folded away moves to: the first of the list's `done` its state may move to, or the first of
 * them when its moves say nothing; `null` on a list with no finished state, whose folded rows are deleted.
 */
function finishOf(decl: SameDecl, row: Here): string | null {
  const done = decl.done ?? [];
  if (decl.state === undefined || done.length === 0) return null;
  const moves = decl.fields.find((f) => f.id === decl.state)?.transitions?.[row.state ?? ''];
  return (moves === undefined ? undefined : done.find((d) => moves.to.includes(d))) ?? done[0]!;
}

/**
 * For every group of `clashes`, the writes that fold it: each link of each of `lists` that names one of the others
 * moved to the row kept, then each other moved to the list's first finished state with the note "Folded into <title>",
 * or deleted where the list has none. Reads, and writes nothing.
 *
 * A ROW POINTING INTO TWO GROUPS IS WRITTEN ONCE, with every link it holds moved, under the first group that
 * names it, so two writes of one list of links never undo each other. A row being folded away is not written for its
 * links, since it is finished or deleted in the same plan.
 */
export function foldPlan(sql: Pick<Sql, 'all'>, list: SameDecl, lists: Iterable<SameDecl> = [list]): FoldGroup[] {
  const groups = clashes(sql, list);
  if (groups.length === 0) return [];
  const into = new Map<string, string>();
  const groupOf = new Map<string, number>();
  groups.forEach((g, i) => g.others.forEach((o) => (into.set(o, g.keep), groupOf.set(o, i))));
  const out: FoldGroup[] = groups.map((g) => ({ ...g, writes: [] }));
  /* ONE BOUND VALUE, the ids as a JSON array read with json_each, however many are folded (param-sweep). */
  const gone = JSON.stringify([...into.keys()]);
  const marks = 'SELECT value FROM json_each(?)';

  for (const other of [...lists]) {
    const fields = other.fields.filter((f) => linksInto(f, list.id));
    if (fields.length === 0) continue;
    const near = fields.map((f) =>
      f.type === 'ref' ? `json_extract(fields, '$.${f.id}') IN (${marks})` : `EXISTS (SELECT 1 FROM json_each(fields, '$.${f.id}') WHERE value IN (${marks}))`,
    );
    const rows = sql.all<{ id: string; fields: string }>(
      `SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND (${near.join(' OR ')}) ORDER BY created_at, rowid`,
      other.id,
      ...fields.flatMap(() => gone),
    );
    for (const row of rows) {
      if (into.has(row.id)) continue;
      const held = parsed(row.fields);
      const patch: Record<string, string | readonly string[]> = {};
      let first = Infinity;
      for (const f of fields) {
        const v = held[f.id];
        if (typeof v === 'string' && into.has(v)) {
          patch[f.id] = into.get(v)!;
          first = Math.min(first, groupOf.get(v)!);
        } else if (Array.isArray(v) && v.some((x) => typeof x === 'string' && into.has(x))) {
          for (const x of v) if (typeof x === 'string' && into.has(x)) first = Math.min(first, groupOf.get(x)!);
          patch[f.id] = [...new Set(v.map((x) => (typeof x === 'string' ? (into.get(x) ?? x) : x)).filter((x): x is string => typeof x === 'string'))];
        }
      }
      if (Number.isFinite(first)) out[first]!.writes.push({ register: other.id, at: row.id, patch });
    }
  }

  const here = new Map(rowsHere(sql, list).map((r) => [r.id, r]));
  for (const g of out) {
    const kept = here.get(g.keep);
    const note = `Folded into ${kept === undefined ? 'the one kept' : calledOf(list, kept)}`;
    for (const id of g.others) {
      const row = here.get(id);
      const to = row === undefined ? null : finishOf(list, row);
      g.writes.push(to === null ? { register: list.id, at: id, delete: true, note } : { register: list.id, at: id, patch: { [list.state!]: to }, note });
    }
  }
  return out;
}

/** What the write path hands `sameDoor`: the row as it was, as it will be, what was sent, and who is asking. */
export type SameAsk = {
  current: { id: string; fields: Readonly<Record<string, unknown>>; deleted_at: string | null } | null;
  merged: Readonly<Record<string, unknown>>;
  sent: Readonly<Record<string, unknown>>;
  touched: readonly string[];
  /** Today, `YYYY-MM-DD`, for the call that confirms the first. */
  today: string;
  /** Whether the writer reads this list, so the row holding the key may be named to them (`mergeDoor`'s `reads`). */
  named: boolean;
};

/**
 * The day a list keeps for when a row was last found true, if it keeps one: its first day field that is neither a
 * deadline nor its finished day, on a list holding no sealed value. A key is confirmed by opening it, never by a write
 * saying so, so a list that seals a value has none here.
 */
function confirmDayOf(decl: SameDecl): string | undefined {
  const live = decl.fields.filter((f) => f.retired !== true);
  if (live.some((f) => sealedAs(f) !== null)) return undefined;
  return live.find((f) => f.type === 'day' && f.deadline !== true && f.derived !== true && f.id !== decl.finished)?.id;
}

/**
 * A SECOND ROW SAYING WHAT A FIRST SAYS IS REFUSED AT THE DOOR, or `null`. A create, or a change to one of
 * the rule's fields or its `within`, that leaves the row here (live, not finished) while another row here says the same,
 * is refused `ALREADY_KNOWN`: "Skills already has ponytail. Change that one rather than adding it twice." The row
 * named is the one `clashes` would keep, `at` is the rule's first field, and `try` is the call that confirms the first
 * (its confirming day set to today) or, on a list with none, changes it with the rest of what was sent.
 *
 * NAMED ONLY TO A WRITER WHO READS THE LIST, as the merge door names a person, and then with no `try`: a call naming a
 * row the writer may not read would hand it to them. The caller lets an import and a merge through, as it does for
 * people, and a write that changes none of the rule's fields is never asked, so an old pair is not refused an edit.
 */
export function sameDoor(sql: Pick<Sql, 'all'>, decl: SameDecl, ask: SameAsk): Refusal | null {
  const list = sameListOf(decl);
  if (list === null) return null;
  const rule = list.same;
  const { current, merged, sent } = ask;
  const parts = rule.within === undefined ? rule.fields : [...rule.fields, rule.within];
  if (current !== null && !parts.some((p) => ask.touched.includes(p))) return null;
  const deleted = 'deleted_at' in sent ? sent.deleted_at !== null && sent.deleted_at !== undefined : current?.deleted_at != null;
  const state = decl.state === undefined ? undefined : merged[decl.state];
  if (deleted || (typeof state === 'string' && (decl.done ?? []).includes(state))) return null;
  const key = rowKeys(list, merged)[0];
  if (key === undefined) return null;
  if (current !== null && rowKeys(list, current.fields)[0] === key) return null;
  const twins = rowsHere(sql, decl).filter((r) => r.id !== current?.id && rowKeys(list, r.fields).includes(key));
  if (twins.length === 0) return null;
  const first = keptOf(decl, rule, twins);
  const name = decl.name ?? decl.id;
  const at = rule.fields[0]!;
  const rather = current === null ? 'rather than adding it twice' : 'rather than making this one say the same';
  if (!ask.named) return { code: 'ALREADY_KNOWN', fix: `${name} already has one that says this. Change that one ${rather}.`, at };
  const spoken = spokenOf(decl, first);
  const title = calledOf(decl, first);
  const confirm = confirmDayOf(decl);
  const sealed = new Set(decl.fields.filter((f) => sealedAs(f) !== null).map((f) => f.id));
  const rest = Object.fromEntries(Object.entries(sent).filter(([k, v]) => v !== undefined && !parts.includes(k) && !sealed.has(k) && k !== 'deleted_at' && !k.startsWith('_')));
  const call =
    confirm !== undefined
      ? `update ${JSON.stringify({ spoken, patch: { [confirm]: ask.today } })}`
      : Object.keys(rest).length > 0
        ? `update ${JSON.stringify({ spoken, patch: rest })}`
        : `get ${JSON.stringify({ spoken })}`;
  return {
    code: 'ALREADY_KNOWN',
    fix: `${name} already has ${title === spoken ? spoken : `${title} (${spoken})`}. Change that one ${rather}.`,
    at,
    try: call,
  };
}
