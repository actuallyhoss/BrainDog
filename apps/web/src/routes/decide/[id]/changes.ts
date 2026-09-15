/**
 * What a `rowset` proposal would change in rows the record already has, field by field.
 *
 * A DOCUMENT OR A LONG TEXT IS DRAWN AS A DIFF, with the render package's own line diff, so there is one
 * diff in the product and not two. Everything else is a plain before and after. Rows the proposal would
 * create are not here: they have no before, and they keep the drawing they had.
 *
 * PURE: the declarations, the rows and the formatter are handed in, so `node --test` reads it.
 */

import { diffRows, type Block } from 'braindog-render';

/** Past this many characters, or across a line, a text field is read as prose and diffed. */
export const LONG = 120;

export const words = {
  heading: 'What changes',
  before: 'Before',
  after: 'After',
  empty: 'Empty',
} as const;

export type Change =
  | { field: string; label: string; long: true; block: Block }
  | { field: string; label: string; long: false; before: string | null; after: string | null };

export type Updated = { at: string; title: string; changes: Change[] };

type Decl = { title?: string; fields: readonly { id: string; type: string; label?: string }[] };
type Row = { seq: number; version: number; fields: Record<string, unknown> };

const text = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** A `diff` block, as a fence of `- `, `+ ` and two-space rows would parse. */
export const diffBlock = (before: string, after: string): Block => ({
  type: 'block',
  kind: 'diff',
  rows: diffRows(before, after).map((line) => ({ cells: [line] })),
  raw: '',
  start: 0,
  end: 0,
});

/** Whether a field's change is prose to diff rather than a value to show twice. */
export function isLong(type: string, before: unknown, after: unknown): boolean {
  if (type === 'document') return true;
  if (type !== 'text') return false;
  const a = text(before);
  const b = text(after);
  return /\r|\n/u.test(a + b) || Math.max(a.length, b.length) > LONG;
}

/**
 * The update rows of a proposal, each with its changed fields. A row the record does not have, and a
 * field whose value would not move, draw nothing.
 */
export function updatesOf(
  body: { register: string; rows: readonly Record<string, unknown>[] } | undefined,
  registers: Readonly<Record<string, Decl | undefined>>,
  rows: Readonly<Record<string, readonly Row[] | undefined>>,
  show: (register: string, field: string, value: unknown) => string | null,
): Updated[] {
  if (!body) return [];
  const decl = registers[body.register];
  const held = rows[body.register] ?? [];
  const out: Updated[] = [];
  for (const r of body.rows) {
    if (typeof r.at !== 'string' || typeof r.patch !== 'object' || r.patch === null) continue;
    const seq = Number(/(\d+)$/u.exec(r.at)?.[1]);
    const row = held.find((e) => e.seq === seq);
    if (!row) continue;
    const changes: Change[] = [];
    for (const [field, after] of Object.entries(r.patch as Record<string, unknown>)) {
      const before = row.fields[field];
      if (text(before) === text(after)) continue;
      const f = decl?.fields.find((x) => x.id === field);
      const label = f?.label ?? field.replace(/_/g, ' ').replace(/^./u, (c) => c.toUpperCase());
      changes.push(
        isLong(f?.type ?? 'text', before, after)
          ? { field, label, long: true, block: diffBlock(text(before), text(after)) }
          : { field, label, long: false, before: show(body.register, field, before), after: show(body.register, field, after) },
      );
    }
    if (changes.length === 0) continue;
    const title = decl?.title ? row.fields[decl.title] : undefined;
    out.push({ at: r.at, title: typeof title === 'string' && title !== '' ? title : r.at, changes });
  }
  return out;
}
