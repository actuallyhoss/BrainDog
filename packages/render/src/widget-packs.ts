/**
 * THE WIDGETS INSTALLED ADD-ONS SHIP, JOINED TO THE CATALOGUE AT READ TIME (widgets plan §6.5, batch W6). An add-on's
 * manifest carries `widgets: [...]` (checked by `readPackWidgets` in `@braindog/declare`); the record reads the manifests
 * of the add-ons it holds and each widget becomes a template as the catalogue's are, under its add-on, so the sheet, the
 * suggestions and Make your own treat it as one of their own.
 *
 * TWO SPELLINGS ARE READ, as the manifest check reads them: `needs` as ids (`["register.<list>"]`) or as `{ lists,
 * figures }`, and `example` as the rows it would show or as `{ figures, rows }`. A one-row card's example is said as
 * figures, by its columns' labels, which is how the sheet draws a one-row card.
 *
 * PURE, so a test holds it in Node.
 */

import { WIDGET_FOR, WIDGET_GROUPS, WIDGET_SIZES, WIDGETS, type RowsRead, type WidgetBlank, type WidgetExample, type WidgetFor, type WidgetGroup, type WidgetSize, type WidgetTemplate } from './widgets.ts';

/** A widget as an add-on's manifest keeps it. Loose, because the record reads manifests a stranger wrote. */
export type ShippedWidget = Readonly<Record<string, unknown>>;
/** The add-on it came with: its id and the name a person knows it by. */
export type Shipper = { id: string; title: string };

const isBag = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A value as an example says it: a day as "29 Oct", anything else as written. */
const said = (v: unknown): string | undefined => {
  const t = text(v);
  const day = t === undefined ? null : /^(\d{4})-(\d{2})-(\d{2})$/u.exec(t);
  return day ? `${Number(day[3])} ${MONTHS[Number(day[2]) - 1] ?? ''}`.trim() : t;
};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The columns of a block, each with its field, label and how a card draws it. */
const columnsOf = (block: Readonly<Record<string, unknown>>): { field: string; label?: string; as?: string }[] =>
  (Array.isArray(block.columns) ? block.columns : []).flatMap((c) =>
    isBag(c) && typeof c.field === 'string' ? [{ field: c.field, ...(typeof c.label === 'string' ? { label: c.label } : {}), ...(typeof c.as === 'string' ? { as: c.as } : {}) }] : [],
  );

/** Which fields a shipped list widget's preview reads: the title column, a day and an amount where it has them. */
export function rowsReadFor(block: Readonly<Record<string, unknown>>): RowsRead | undefined {
  const cols = columnsOf(block);
  if (cols.length === 0) return undefined;
  const day = cols.find((c) => /^(day|on|by|date|due|from)$/u.test(c.field))?.field;
  const amount = cols.find((c) => /amount|paid|value|total|price/u.test(c.field))?.field;
  const title = cols.find((c) => c.as === 'title')?.field ?? cols.find((c) => c.field !== day && c.field !== amount)?.field ?? cols[0]!.field;
  const meta = cols.find((c) => c.field !== title && c.field !== day && c.field !== amount)?.field;
  return { title, ...(day ? { day } : {}), ...(amount ? { amount } : {}), ...(meta ? { meta } : {}) };
}

/** An example as the sheet draws it, from either spelling. */
export function exampleOf(raw: unknown, block: Readonly<Record<string, unknown>>): WidgetExample {
  if (isBag(raw)) {
    const figures = Array.isArray(raw.figures) ? raw.figures.flatMap((f) => (isBag(f) && text(f.label) && text(f.said) ? [{ label: text(f.label)!, said: text(f.said)! }] : [])) : [];
    const rows = Array.isArray(raw.rows) ? raw.rows.flatMap((r) => (isBag(r) && text(r.title) ? [{ title: text(r.title)!, ...(text(r.meta) ? { meta: text(r.meta)! } : {}) }] : [])) : [];
    return { ...(figures.length > 0 ? { figures } : {}), ...(rows.length > 0 ? { rows } : {}) };
  }
  if (!Array.isArray(raw)) return {};
  const rows = raw.filter(isBag);
  const cols = columnsOf(block);
  /* A ONE-ROW CARD IS ITS FIGURES, each by its column's label, as the sheet draws one. */
  if (block.kind === 'cards' && block.limit === 1 && rows.length > 0) {
    const r = rows[0]!;
    const unit = text(r.unit) ?? '';
    /* THE UNIT GOES ON A NUMBER WHOSE LABEL SAYS NONE OF ITS OWN: "Chance of rain %" is not in degrees. */
    const figures = cols.flatMap((c) =>
      c.as === 'title' || said(r[c.field]) === undefined ? [] : [{ label: c.label ?? c.field, said: `${said(r[c.field])}${typeof r[c.field] === 'number' && !/%|\(/u.test(c.label ?? '') ? unit : ''}` }],
    );
    const title = cols.find((c) => c.as === 'title');
    return { figures: figures.slice(0, 4), ...(title && text(r[title.field]) ? { rows: [{ title: text(r[title.field])! }] } : {}) };
  }
  const read = rowsReadFor(block);
  if (rows.length === 0) return {};
  return {
    rows: rows.slice(0, 8).flatMap((r) => {
      const title = text(r[read?.title ?? '']) ?? text(r.what) ?? text(r.title) ?? text(r.name);
      if (title === undefined) return [];
      const meta = [read?.day, read?.meta, ...cols.map((c) => c.field)]
        .filter((f, i, all): f is string => typeof f === 'string' && f !== read?.title && all.indexOf(f) === i)
        .map((f) => said(r[f]))
        .filter((v): v is string => v !== undefined)
        .slice(0, 2)
        .join(' · ');
      return [{ title, ...(meta !== '' ? { meta } : {}) }];
    }),
  };
}

/** The declared keys a shipped widget may carry for the record's signals, read as written and checked by shape. */
const isRows = (v: unknown): v is RowsRead => isBag(v) && typeof v.title === 'string' && Object.values(v).every((x) => typeof x === 'string');
const isBlank = (v: unknown): v is WidgetBlank => isBag(v) && typeof v.id === 'string' && typeof v.asks === 'string' && (v.from === undefined || (isBag(v.from) && typeof v.from.source === 'string' && typeof v.from.field === 'string'));

/**
 * One shipped widget as a catalogue template under its add-on, or `null` when it does not read as one. `taken` is the ids
 * already in the catalogue: A WIDGET KEEPS THE ID ITS ADD-ON GAVE IT unless another already holds it, and then it is
 * `<add-on>.<id>`, so two add-ons that both ship a `today` are two widgets and what a person kept or turned down of a
 * widget that moved out of the core into its add-on (SHL-A22) still counts under the id it always had.
 */
export function packTemplate(w: ShippedWidget, by: Shipper, taken: ReadonlySet<string> = new Set()): WidgetTemplate | null {
  const id = text(w.id);
  const title = text(w.title);
  if (id === undefined || title === undefined || !isBag(w.block) || typeof w.block.kind !== 'string') return null;
  const sizes = strings(w.sizes).filter((s): s is WidgetSize => (WIDGET_SIZES as readonly string[]).includes(s));
  const size = (WIDGET_SIZES as readonly unknown[]).includes(w.size) && sizes.includes(w.size as WidgetSize) ? (w.size as WidgetSize) : sizes[0];
  if (size === undefined) return null;
  const group = typeof w.group === 'string' && (WIDGET_GROUPS as readonly string[]).includes(w.group.toLowerCase()) ? (w.group.toLowerCase() as WidgetGroup) : 'life';
  const needs = Array.isArray(w.needs)
    ? {
        lists: strings(w.needs).flatMap((n) => (n.startsWith('register.') ? [n.slice('register.'.length)] : [])),
        figures: strings(w.needs).flatMap((n) => (n.startsWith('metric.') ? [n.slice('metric.'.length)] : [])),
      }
    : isBag(w.needs)
      ? { lists: strings(w.needs.lists), figures: strings(w.needs.figures) }
      : { lists: [] as string[], figures: [] as string[] };
  const rows = isRows(w.rows) ? w.rows : rowsReadFor(w.block);
  const blanks = Array.isArray(w.blanks) ? w.blanks.filter(isBlank) : [];
  const asked = Array.isArray(w.asked) ? w.asked.flatMap((a) => (isBag(a) && typeof a.match === 'string' && typeof a.about === 'string' ? [{ match: a.match, about: a.about }] : [])) : [];
  return {
    id: taken.has(id) ? `${by.id}.${id}` : id,
    title,
    says: text(w.says) ?? `From ${by.title}.`,
    group,
    for: (WIDGET_FOR as readonly unknown[]).includes(w.for) ? (w.for as WidgetFor) : 'both',
    icon: text(w.icon) ?? text(w.block.icon) ?? 'grid',
    block: { heading: title, ...w.block },
    ...(blanks.length > 0 ? { blanks } : {}),
    sizes,
    size,
    needs: { ...(needs.lists.length > 0 ? { lists: needs.lists } : {}), ...(needs.figures.length > 0 ? { figures: needs.figures } : {}), addon: by.id },
    /* A ONE-ROW CARD IS DRAWN AS FIGURES, so it reads no rows, unless its add-on said which fields it reads. */
    ...(rows && (w.block.kind !== 'cards' || isRows(w.rows)) ? { rows } : {}),
    example: exampleOf(w.example, w.block),
    words: [...strings(w.words), by.title.toLowerCase()],
    ...(strings(w.alike).length > 0 ? { alike: strings(w.alike) } : {}),
    ...(asked.length > 0 ? { asked } : {}),
    ...(strings(w.leads).length > 0 ? { leads: strings(w.leads) } : {}),
    ...(text(w.fills) !== undefined ? { fills: text(w.fills)! } : {}),
    ...(isBag(w.fresh) && text(w.fresh.says) && text(w.fresh.unnamed) ? { fresh: { says: text(w.fresh.says)!, unnamed: text(w.fresh.unnamed)! } } : {}),
    ...(isBag(w.near) && typeof w.near.day === 'string' && typeof w.near.within === 'number' && text(w.near.unnamed)
      ? { near: { day: w.near.day, within: w.near.within, unnamed: text(w.near.unnamed)!, ...(typeof w.near.name === 'string' ? { name: w.near.name } : {}) } }
      : {}),
    ...(isBag(w.due) && typeof w.due.where === 'string' && typeof w.due.least === 'number' && text(w.due.says) ? { due: { where: w.due.where, least: w.due.least, says: text(w.due.says)! } } : {}),
  };
}

/**
 * The catalogue with every add-on's widgets after its own, in the order the add-ons are handed in. A shipped widget
 * whose id is already taken is kept under its add-on's id (`packTemplate`); the same widget handed in twice, from the
 * record's manifest and from the catalogue's, is the caller's to hand once.
 */
export function withShipped(packs: readonly { by: Shipper; widgets: readonly ShippedWidget[] }[], base: readonly WidgetTemplate[] = WIDGETS): WidgetTemplate[] {
  const out = [...base];
  const seen = new Set(out.map((t) => t.id));
  for (const p of packs)
    for (const w of p.widgets) {
      const t = packTemplate(w, p.by, seen);
      if (t !== null && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
  return out;
}
