/**
 * COMPOSE'S SHAPE RULES ("Two ways to design": Compose), where the record and the browser both reach them: which of a
 * list's fields each shape reads, in order, what each shape is called in a sentence, and the one block a shape makes
 * over a list.
 *
 * MOVED OUT OF THE BROWSER (`apps/web/src/lib/page/compose.ts` kept the reading of a typed line) so the design agent in
 * the record can draw a list as a calendar, or a project's plan as lanes, with the same columns a person gets when they
 * type "renewals as a calendar". One rule, two callers, so the two can never pick different fields.
 *
 * LISTS AND FIELDS ARE READ FROM WHAT IS PASSED, never named here. PURE.
 */

import { KINDS, isKind } from './kinds.ts';

/** A field of a list as a shape reads it: its id, the label a person reads, its type and a choice's values. */
export type ShapeField = { id: string; label?: string | undefined; type?: string | undefined; values?: readonly string[] | undefined };

/** A list a shape is drawn over: its id, its name, its title field and its fields. */
export type ShapeList = { id: string; name: string; title?: string | undefined; fields: readonly ShapeField[] };

/** What each shape is called in a sentence about it. */
export const SHAPE_SAY: Readonly<Record<string, string>> = {
  lines: 'a line chart',
  bar: 'a bar chart',
  split: 'a split',
  ring: 'a ring',
  gauge: 'a gauge',
  heat: 'a heat map',
  calendar: 'a calendar',
  board: 'a board',
  lanes: 'lanes',
  timeline: 'a timeline',
  todo: 'a checklist',
  table: 'a table',
  cards: 'cards',
  roadmap: 'a roadmap',
  steps: 'a path of stages',
};

const DATES: readonly string[] = ['day', 'instant', 'date'];
const NUMBERS: readonly string[] = ['int', 'number', 'decimal', 'money', 'quantity'];
export const isDateField = (f: ShapeField): boolean => DATES.includes(f.type ?? '');
export const isNumberField = (f: ShapeField): boolean => NUMBERS.includes(f.type ?? '');
export const isChoiceField = (f: ShapeField): boolean => f.type === 'enum' || (f.values?.length ?? 0) > 0;

export type ShapeWant = 'date' | 'number' | 'group' | 'choice' | 'title' | 'more';
export type ShapeSlot = { want: ShapeWant; hard?: boolean };

/** What each shape's columns read, in order. A hard slot with no field to fill it means the list cannot be drawn so. */
export const SHAPE_SLOTS: Readonly<Record<string, readonly ShapeSlot[]>> = {
  lines: [{ want: 'date', hard: true }, { want: 'number', hard: true }],
  bar: [{ want: 'group', hard: true }, { want: 'number', hard: true }],
  split: [{ want: 'choice', hard: true }, { want: 'number', hard: true }],
  ring: [{ want: 'title', hard: true }, { want: 'number', hard: true }],
  gauge: [{ want: 'title', hard: true }, { want: 'number', hard: true }],
  heat: [{ want: 'date', hard: true }, { want: 'number' }],
  calendar: [{ want: 'title', hard: true }, { want: 'date', hard: true }],
  board: [{ want: 'choice', hard: true }, { want: 'title', hard: true }],
  lanes: [{ want: 'title', hard: true }, { want: 'date', hard: true }, { want: 'date' }],
  timeline: [{ want: 'date', hard: true }, { want: 'title', hard: true }],
  todo: [{ want: 'title', hard: true }, { want: 'date' }],
  table: [{ want: 'title', hard: true }, { want: 'number' }, { want: 'date' }, { want: 'more' }],
  cards: [{ want: 'title', hard: true }, { want: 'number' }, { want: 'date' }, { want: 'choice' }],
};

/** How many rows a shape shows unless a line says "top 5". A ring is five parts at most. */
export const SHAPE_LIMITS: Readonly<Record<string, number>> = { table: 8, cards: 6, todo: 8, timeline: 8, bar: 8, split: 6, ring: 5 };

/** The kinds that sort their rows by the day they read. */
export const SHAPE_BY_DAY: readonly string[] = ['table', 'cards', 'todo', 'timeline', 'calendar', 'lanes'];

/**
 * The columns a shape reads, filled by what each field is, or `null` where a hard slot has none. `prefer` picks a field
 * a caller was told of (a line that names one) from the slot's pool before its first.
 */
export function shapeColumns(kind: string, list: ShapeList, prefer?: (pool: readonly ShapeField[], want: ShapeWant) => ShapeField | null): ShapeField[] | null {
  const slots = SHAPE_SLOTS[kind];
  if (!slots) return null;
  const fields = list.fields;
  const used = new Set<string>();
  const out: ShapeField[] = [];
  const titleId = list.title && fields.some((f) => f.id === list.title) ? list.title : null;
  for (const slot of slots) {
    const free = fields.filter((f) => !used.has(f.id));
    const pool =
      slot.want === 'date'
        ? free.filter(isDateField)
        : slot.want === 'number'
          ? free.filter(isNumberField)
          : slot.want === 'choice'
            ? free.filter(isChoiceField)
            : slot.want === 'group'
              ? free.filter((f) => !isNumberField(f) && !isDateField(f) && f.type !== 'secret')
              : slot.want === 'title'
                ? [...free.filter((f) => f.id === titleId), ...free.filter((f) => !isNumberField(f) && !isDateField(f) && !isChoiceField(f) && f.type !== 'secret')]
                : free.filter((f) => f.type !== 'secret');
    /* A group reads best by a choice or a link, then by a name: "spend by owner" names its own. */
    const ordered = slot.want === 'group' ? [...pool.filter(isChoiceField), ...pool.filter((f) => f.type === 'ref'), ...pool] : pool;
    const named = slot.want === 'title' || slot.want === 'more' || !prefer ? null : prefer(ordered, slot.want);
    const pick = named ?? ordered[0] ?? null;
    if (!pick) {
      if (slot.hard) return null;
      continue;
    }
    used.add(pick.id);
    out.push(pick);
  }
  return out;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One block of a page's declaration, as a page writes it. */
export type ShapeBlock = { kind: string; [key: string]: unknown };

/**
 * The one block a shape makes over a list, or `null` where the list cannot be drawn so. `where` narrows it (a
 * sentence the caller checked), `heading` names it, and the block always says its empty words, so it passes the
 * design check's empty rule by construction.
 */
export function shapeBlock(i: {
  kind: string;
  list: ShapeList;
  heading?: string;
  where?: string;
  limit?: number;
  span?: number;
  prefer?: (pool: readonly ShapeField[], want: ShapeWant) => ShapeField | null;
}): ShapeBlock | null {
  if (!isKind(i.kind)) return null;
  const cols = shapeColumns(i.kind, i.list, i.prefer);
  if (!cols) return null;
  const limit = i.limit ?? SHAPE_LIMITS[i.kind];
  const sortDay = i.kind === 'lines' || SHAPE_BY_DAY.includes(i.kind) ? (cols.find(isDateField) ?? null) : null;
  return {
    kind: i.kind,
    heading: i.heading ?? cap(i.list.name),
    span: i.span ?? Math.max(KINDS[i.kind].minSpan, 6),
    source: `register.${i.list.id}`,
    columns: cols.map((f) => ({ field: f.id, ...(f.label ? { label: f.label } : {}) })),
    ...(i.where ? { where: i.where } : {}),
    ...(sortDay ? { order: [{ field: sortDay.id, dir: 'asc' }] } : {}),
    ...(limit && limit > 0 ? { limit } : {}),
    empty: `Nothing in ${i.list.name.toLowerCase()} fits.`,
  };
}
