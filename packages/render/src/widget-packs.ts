/**
 * THE WIDGETS INSTALLED ADD-ONS SHIP, JOINED TO THE CATALOGUE AT READ TIME (widgets plan §6.5, batch W6). An add-on's
 * manifest carries `widgets: [...]` (checked by `readPackWidgets` in `@braindog/declare`); the record reads the manifests
 * of the add-ons it holds and each widget becomes a template as the catalogue's are, under its add-on, so the sheet, the
 * suggestions and Make your own treat it as one of their own.
 *
 * TWO SPELLINGS ARE READ, as the manifest check reads them: `needs` as ids (`["register.weather"]`) or as `{ lists,
 * figures }`, and `example` as the rows it would show or as `{ figures, rows }`. A one-row card's example is said as
 * figures, by its columns' labels, which is how the sheet draws a one-row card.
 *
 * PURE, so a test holds it in Node.
 */

import { WIDGET_GROUPS, WIDGET_SIZES, WIDGETS, type RowsRead, type WidgetExample, type WidgetGroup, type WidgetSize, type WidgetTemplate } from './widgets.ts';

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

/** One shipped widget as a catalogue template under its add-on, or `null` when it does not read as one. */
export function packTemplate(w: ShippedWidget, by: Shipper): WidgetTemplate | null {
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
  const rows = rowsReadFor(w.block);
  return {
    /* THE ID IS THE ADD-ON'S AND THE WIDGET'S, so two add-ons that both ship a `today` are two widgets. */
    id: id === by.id || id.startsWith(`${by.id}-`) || id.startsWith(`${by.id}.`) ? id : `${by.id}.${id}`,
    title,
    says: text(w.says) ?? `From ${by.title}.`,
    group,
    for: w.for === 'personal' || w.for === 'business' ? w.for : 'both',
    icon: text(w.icon) ?? text(w.block.icon) ?? 'grid',
    block: { heading: title, ...w.block },
    ...(Array.isArray(w.blanks) && w.blanks.length > 0 ? { blanks: w.blanks as WidgetTemplate['blanks'] & object } : {}),
    sizes,
    size,
    needs: { ...(needs.lists.length > 0 ? { lists: needs.lists } : {}), ...(needs.figures.length > 0 ? { figures: needs.figures } : {}), addon: by.id },
    ...(rows && w.block.kind !== 'cards' ? { rows } : {}),
    example: exampleOf(w.example, w.block),
    words: [...strings(w.words), by.title.toLowerCase()],
  };
}

/**
 * The catalogue with every installed add-on's widgets after its own, in add-on order. A shipped widget whose id the
 * catalogue already has is left out: the catalogue's is the one BrainDog checked.
 */
export function withShipped(packs: readonly { by: Shipper; widgets: readonly ShippedWidget[] }[], base: readonly WidgetTemplate[] = WIDGETS): WidgetTemplate[] {
  const out = [...base];
  const seen = new Set(out.map((t) => t.id));
  for (const p of packs)
    for (const w of p.widgets) {
      const t = packTemplate(w, p.by);
      if (t !== null && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
  return out;
}
