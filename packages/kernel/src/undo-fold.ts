/**
 * What putting a match back would do, said before it is done (ENG-B04, "shown with Undo").
 *
 * `undoMerge` (`index.ts`) puts a fold back by the fold's own lines, and answers only the names it restored. A screen
 * that draws Undo on a match needs the other half first: is this batch a fold the record made, and what would pressing
 * do, in names, with a fingerprint to hand back. Both are here.
 *
 * READ FROM THE LOG, NEVER BY RUNNING THE UNDO. The plan walks the batch's lines the way `undoMerge` walks them and asks
 * of each field the question `undoMerge` asks, "does it still hold what the fold wrote", without writing anything. It is
 * not `undoMerge` in a transaction rolled back: a transaction inside another is not something this record can do.
 *
 * PURE OVER `sql` AND THE READERS IT IS HANDED. Nothing here knows which list is folded: the list is whichever one the
 * target's own declaration names a fold field for, and its people are said by its own name.
 */

import type { Sql } from '@braindog/ports';

import { foldEnd } from './entities.ts';
import type { UndoPlan, UndoSkip, UndoStep } from './undo.ts';

/** A row as the plan reads one: the kernel's own `Entry` has all of this. */
export type FoldRow = { id: string; register: string; seq: number | null; fields: Record<string, unknown>; deleted_at: string | null };

/** A list as the plan reads one: its name, and each field's type and label. */
export type FoldList = { name?: string; fields: readonly { id: string; type?: string; of?: string; label?: unknown }[] };

export type FoldDeps = {
  sql: Pick<Sql, 'one' | 'all'>;
  /** A row by its id, deleted or not when asked. */
  byId: (id: string, includeDeleted?: boolean) => FoldRow | null;
  /** A row's title, deleted or not, or `null` when it has none. */
  titleOf: (id: string) => string | null;
  /** A list's declaration, or `undefined` when nothing declares it. */
  list: (register: string) => FoldList | undefined;
  /** The field of `register` a fold writes (which row this one was folded into), if its rows can be folded. */
  mergeField: (register: string) => string | undefined;
};

/** What a fold's undo would do. The same shape as any undo's plan, so one screen draws both. */
export type FoldPlan = UndoPlan;

type Line = { target: string; kind: string; field: string | null; from_v: string | null; to_v: string | null };

/** Why a field is left: one reason, since the fold's undo has only one. */
const CHANGED = 'changed since';

/** A short fingerprint of a plan, FNV-1a over 64 bits, as `undo.ts` prints its own. Not a seal: it tells two plans apart. */
const digest = (text: string): string => {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
};

const idOf = (target: string): string => target.replace(/^entry:/, '');
const parse = (v: string | null): unknown => {
  if (v === null) return null;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return null;
  }
};
const text = (v: unknown): string => JSON.stringify(v ?? null);
const redacted = (v: string | null): boolean => v !== null && v.includes('--redacted--');

/** The batch's lines in the order they were written: a batch's own, or the one line of a write that had no batch. */
const linesOf = (sql: FoldDeps['sql'], batch: string): Line[] =>
  sql.all<Line>('SELECT target, kind, field, from_v, to_v FROM event WHERE batch = ? OR id = ? ORDER BY rowid', batch, batch);

/** Whether `l` is the line that folded its row: it set the fold field of the row's own list. */
const folds = (deps: FoldDeps, l: Line): boolean => {
  if (l.kind !== 'edit' || l.field === null || l.to_v === null || !l.target.startsWith('entry:')) return false;
  const row = deps.byId(idOf(l.target), true);
  return row !== null && deps.mergeField(row.register) === l.field;
};

/**
 * Whether `batch` is a fold the record made by itself: its lines fold a row, and none of them is a decision.
 *
 * A FOLD SOMEBODY SAID YES TO IS NOT ONE. That batch holds the decision's own line, and it is put back by undoing the
 * decision, which reopens its question. This one has no question to reopen.
 */
export function isFold(deps: FoldDeps, batch: string): boolean {
  const lines = linesOf(deps.sql, batch);
  return !lines.some((l) => l.kind === 'decide') && lines.some((l) => folds(deps, l));
}

/** What the batch did to one row, gathered as `undoMerge` gathers it. */
type Did = { restore: boolean; from: Map<string, string | null>; to: Map<string, string | null>; tagged: Map<string, unknown[]>; untagged: Map<string, unknown[]> };

/**
 * What undoing the fold `batch` would do, in names, and nothing written. `null` when the batch folded nobody.
 *
 * EACH ROW IS ONE STEP: a folded row comes back, the row it was folded into gives back what it was carried, and a row
 * whose link moved points back. A FIELD THAT NO LONGER HOLDS WHAT THE FOLD WROTE IS LEFT, and said under `skipped`, as
 * `undoMerge` leaves it. The sentence counts the rows of the folded list that stand apart again.
 */
export function foldPlan(deps: FoldDeps, batch: string): FoldPlan | null {
  const { sql, byId } = deps;
  const lines = linesOf(sql, batch);
  const folded = new Set(lines.filter((l) => folds(deps, l)).map((l) => idOf(l.target)));
  if (folded.size === 0) return null;
  const already = sql.one('SELECT 1 AS y FROM undone WHERE batch = ?', batch) !== undefined;

  const did = new Map<string, Did>();
  for (const l of lines) {
    if (!l.target.startsWith('entry:')) continue;
    const id = idOf(l.target);
    const d = did.get(id) ?? { restore: false, from: new Map(), to: new Map(), tagged: new Map(), untagged: new Map() };
    did.set(id, d);
    if (l.kind === 'delete') d.restore = true;
    else if ((l.kind === 'edit' || l.kind === 'state') && l.field !== null) {
      if (!d.from.has(l.field)) d.from.set(l.field, l.from_v);
      d.to.set(l.field, l.to_v);
    } else if ((l.kind === 'tag' || l.kind === 'untag') && l.field !== null) {
      const into = l.kind === 'tag' ? d.tagged : d.untagged;
      const said = l.kind === 'tag' ? l.to_v : l.from_v;
      if (said !== null) into.set(l.field, [...(into.get(l.field) ?? []), parse(said)]);
    }
  }

  /* A LATER FOLD MOVED THINGS ON, so a link is compared by where its chain ends, as `undoMerge` compares it. */
  const endOf = (id: string): string => {
    const row = byId(id, true);
    const field = row === null ? undefined : deps.mergeField(row.register);
    return field === undefined ? id : foldEnd(sql, field, id);
  };
  const onward = (v: unknown): unknown =>
    typeof v === 'string' ? endOf(v) : Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === 'string' ? endOf(x) : x)))] : v;
  const backward = (v: unknown): unknown =>
    typeof v === 'string' ? (folded.has(v) ? v : endOf(v)) : Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === 'string' && !folded.has(x) ? endOf(x) : x)))] : v;
  const specOf = (register: string, field: string) => deps.list(register)?.fields.find((f) => f.id === field);
  const isRef = (register: string, field: string): boolean => {
    const f = specOf(register, field);
    return f !== undefined && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref'));
  };
  const labelOf = (register: string, field: string): string => {
    const label = specOf(register, field)?.label;
    return typeof label === 'string' && label.trim() !== '' ? label.trim().toLowerCase() : field.replace(/[_-]+/gu, ' ');
  };
  const titled = (id: string): string => deps.titleOf(id) ?? 'One with no name';

  const steps: UndoStep[] = [];
  const skipped: UndoSkip[] = [];
  /** The folded rows that come back, and the rows they come apart from. */
  const apart = new Set<string>();
  const foldList = byId([...folded][0]!, true)?.register;
  const ordered = [
    ...[...did].filter(([id]) => folded.has(id)),
    ...[...did].filter(([id]) => !folded.has(id) && byId(id, true)?.register === foldList),
    ...[...did].filter(([id]) => !folded.has(id) && byId(id, true)?.register !== foldList),
  ];
  for (const [id, d] of already ? [] : ordered) {
    const now = byId(id, true);
    if (!now) continue;
    const title = titled(id);
    const fold = folded.has(id);
    const mine = deps.mergeField(now.register);
    const comesBack = fold && d.restore && now.deleted_at !== null;
    /* The fold's own field left as it is leaves the whole row: it is said by the row's name alone. */
    const leave = (field: string): void =>
      void skipped.push({ row: id, title, why: CHANGED, line: `Leaves ${fold && field === mine ? title : `${labelOf(now.register, field)} on ${title}`} as it is: ${CHANGED}.` });
    const put = new Set<string>();
    /** The folded rows a link of this row goes back to. */
    const pointed = new Set<string>();
    let changes = 0;
    let unfolds = false;
    for (const [field, from] of d.from) {
      const to = d.to.get(field) ?? null;
      if (redacted(from) || redacted(to)) continue;
      const held = now.fields[field] ?? null;
      if (isRef(now.register, field)) {
        if (text(onward(held)) !== text(onward(parse(to)))) {
          leave(field);
          continue;
        }
        const back = backward(parse(from));
        if (text(back) === text(held)) continue;
        for (const v of Array.isArray(back) ? back : [back]) if (typeof v === 'string' && folded.has(v)) pointed.add(v);
        if (fold && field === mine) unfolds = true;
      } else if (text(held) !== text(parse(to))) {
        leave(field);
        continue;
      }
      put.add(field);
      changes += 1;
    }
    /* A LIST OF TEXT IS PUT BACK BY ELEMENT: what the fold added comes off while it is still there, and one somebody
       took off since is said as left. */
    for (const field of new Set([...d.tagged.keys(), ...d.untagged.keys()])) {
      if (put.has(field)) continue;
      const held = Array.isArray(now.fields[field]) ? (now.fields[field] as unknown[]) : [];
      const has = (v: unknown): boolean => held.some((h) => text(h) === text(v));
      const added = d.tagged.get(field) ?? [];
      if (added.some(has) || (d.untagged.get(field) ?? []).some((v) => !has(v))) changes += 1;
      if (added.some((v) => !has(v))) leave(field);
    }
    if (!comesBack && changes === 0) continue;
    const list = deps.list(now.register)?.name;
    const at = { row: id, register: now.register, ...(now.seq === null ? {} : { seq: now.seq }), title, ...(list === undefined ? {} : { list }) };
    if (fold) {
      steps.push({ do: 'restore', ...at, line: `Bring ${title} back` });
      const into = mine === undefined ? null : parse(d.to.get(mine) ?? null);
      if (comesBack || unfolds) for (const one of [id, into]) if (typeof one === 'string') apart.add(one);
    } else if (now.register === foldList) steps.push({ do: 'set', ...at, line: `Take what the match added off ${title}` });
    else {
      const names = [...pointed].map(titled).join(' and ');
      steps.push({ do: 'set', ...at, ...(names === '' ? {} : { from: names }), line: names === '' ? `Put ${title} back as it was` : `Point ${title} back at ${names}` });
    }
  }

  const n = apart.size;
  const m = skipped.length;
  const named = (foldList === undefined ? undefined : deps.list(foldList)?.name)?.trim().toLowerCase();
  const say = already
    ? 'This was put back already.'
    : `${n === 0 ? 'Puts nothing back' : `Puts back ${n}${named === undefined || named === '' ? '' : ` ${named}`}`}${m === 0 ? '' : m === 1 ? ', leaves 1 as it is' : `, leaves ${m} as they are`}`;
  const hash = digest(JSON.stringify({ batch, already, steps: steps.map((s) => [s.do, s.row, s.line]), skipped: skipped.map((s) => [s.row, s.line]) }));
  return { say, lines: [...steps.map((s) => s.line), ...skipped.map((s) => s.line)], steps, skipped, notes: 0, hash, already };
}
