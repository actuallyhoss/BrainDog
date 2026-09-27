/**
 * What a `rowset` proposal would change in rows the record already has, field by field.
 *
 * A DOCUMENT OR A LONG TEXT IS DRAWN AS A DIFF, with the render package's own line diff, so there is one
 * diff in the product and not two. Everything else is a plain before and after. Rows the proposal would
 * create are not here: they have no before, and they keep the drawing they had.
 *
 * PURE: the declarations, the rows and the formatter are handed in, so `node --test` reads it.
 */

import { TYPED, day, diffRows, formatTyped, type Block, type TypedForm } from 'braindog-render';

/**
 * AN INSTANT THE FORMATTER HANDED BACK UNTOUCHED IS DRAWN AS A DAY, the way every other date in the
 * product reads. A field the declaration does not type as a date (a merge's `deleted_at`) came
 * through as `2026-09-16T15:23:18.843Z` beside a person's name.
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;
export const dated = (shown: string | null): string | null => (shown !== null && INSTANT.test(shown) ? day(shown.slice(0, 10)) : shown);

/** Past this many characters, or across a line, a text field is read as prose and diffed. */
export const LONG = 120;

export const words = {
  heading: 'What changes',
  before: 'Before',
  after: 'After',
  empty: 'Empty',
} as const;

/**
 * A MOVE OF WHERE A ROW APPLIES, which is drawn as two chips and not as two row ids (agents C8): the list its
 * projects are in, and the project each side names, as the proposal and the record hold it, `null` for everywhere.
 * `Changes.svelte` names each one from that list; the ids themselves are never drawn.
 */
export type Moved = { to: string; before: string | null; after: string | null };

export type Change =
  | { field: string; label: string; long: true; block: Block }
  | { field: string; label: string; long: false; before: string | null; after: string | null; scope?: Moved };

export type Updated = { at: string; title: string; changes: Change[] };

type Decl = { title?: string; fields: readonly { id: string; type: string; label?: string; to?: string; scope?: unknown; retired?: boolean }[] };

/**
 * The field that says where a row applies: the one that declares `scope:` and is not retired, a ref to one project.
 * The kernel's own reading (`scope.ts` `scopeFieldOf`), over the declaration the record answered for the proposal.
 */
const isScope = (f: Decl['fields'][number] | undefined): f is Decl['fields'][number] & { to: string } =>
  f !== undefined && f.type === 'ref' && typeof f.to === 'string' && f.scope !== undefined && f.scope !== null && f.retired !== true;

/** One side of a move: the project a value names, or `null` for everywhere. */
const placeSaid = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

type Row = { id?: string; seq: number | null; version: number; fields: Record<string, unknown> };

/** A row's internal id, which a proposal may name a row by instead of its spoken id. */
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

const text = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * A TYPED TOKEN IN A FIELD READS AS WHAT IT DRAWS. The diff primitive prints its lines verbatim, which
 * is right for a skill's source but put `{{money:1840000 GBP}}` on both sides of a note's change. The
 * question asks whether the words should change, so the words are filled first; a token whose
 * argument does not parse stays as the author typed it.
 */
const TOKEN = new RegExp(String.raw`\{\{(${TYPED.join('|')}):([^{}|]*)\}\}`, 'gu');
export const filled = (s: string, now?: number): string =>
  s.replace(TOKEN, (whole, form: string, arg: string) => formatTyped(form as TypedForm, arg, now) ?? whole);

/** A `diff` block, as a fence of `- `, `+ ` and two-space rows would parse, with typed tokens filled. */
export const diffBlock = (before: string, after: string): Block => ({
  type: 'block',
  kind: 'diff',
  rows: diffRows(filled(before), filled(after)).map((line) => ({ cells: [line] })),
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
    const at = r.at;
    const seq = Number(/(\d+)$/u.exec(at)?.[1]);
    const row = held.find((e) => e.id === at) ?? (ROW_ID.test(at) ? undefined : held.find((e) => e.seq === seq));
    if (!row) continue;
    const changes: Change[] = [];
    for (const [field, after] of Object.entries(r.patch as Record<string, unknown>)) {
      const before = row.fields[field];
      if (text(before) === text(after)) continue;
      const f = decl?.fields.find((x) => x.id === field);
      const label = f?.label ?? field.replace(/_/g, ' ').replace(/^./u, (c) => c.toUpperCase());
      changes.push(
        isScope(f)
          ? { field, label, long: false, before: null, after: null, scope: { to: f.to, before: placeSaid(before), after: placeSaid(after) } }
          : isLong(f?.type ?? 'text', before, after)
            ? { field, label, long: true, block: diffBlock(text(before), text(after)) }
            : { field, label, long: false, before: dated(show(body.register, field, before)), after: dated(show(body.register, field, after)) },
      );
    }
    if (changes.length === 0) continue;
    const title = decl?.title ? row.fields[decl.title] : undefined;
    out.push({ at: r.at, title: typeof title === 'string' && title !== '' ? title : r.at, changes });
  }
  return out;
}
