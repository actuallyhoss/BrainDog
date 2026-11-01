/**
 * The widget sheet's reading of the record, and how a widget's preview says its figures and rows (widgets plan §5.6).
 *
 * ONE READ, WHEN THE SHEET OPENS: `widgetGallery` answers every widget drawn small on the person's own data, and the few
 * suggested from use, in one request (`packages/record/src/methods/widgets.ts`). Today never asks it, so Today's request
 * count stands (§8). A failed read is no gallery: the sheet draws the catalogue's examples, marked as examples.
 *
 * WORDS ARE PLAIN: a figure in its own currency, whole, a day as "29 Oct", and never a field's id. One currency at a time.
 *
 * PLAIN TYPESCRIPT, so a test can load it in Node.
 */

import { WIDGETS, dayShort, moneyWhole, widgetMatches, type GalleryAnswer, type GalleryWidget, type ReadFigure, type ReadRow, type WidgetOffer, type WidgetSize } from 'braindog-render';

/** The sheet's own words (a unit's new words live in a module it owns, never in `copy.ts`). */
export const sheetWords = {
  title: 'Add a widget',
  search: 'Search widgets',
  suggested: 'Suggested for you',
  example: 'Example',
  add: 'Add to Today',
  added: (title: string) => `${title} is on Today.`,
  addNamed: (title: string) => `Add ${title} to Today`,
  size: 'Size',
  sizes: { small: 'Small', wide: 'Wide', tall: 'Tall', large: 'Large', full: 'Full' } as Readonly<Record<WidgetSize, string>>,
  sizeCannot: (size: string) => `This widget does not come ${size.toLowerCase()}.`,
  nothing: (q: string) => `No widget matches “${q}”.`,
  nothingYet: 'Nothing to show yet.',
  more: (n: number) => `${n} more`,
  back: 'All widgets',
  forPersonal: 'For you',
  forBusiness: 'For work',
  forBoth: 'For you and for work',
  which: 'Which one',
  notReached: 'BrainDog could not be reached, so nothing was added.',
  onToday: 'On Today',
  /** The same, where Today's tile has another name. */
  onTodayAs: (heading: string): string => `Today shows this as ${heading}.`,
  makeOwn: 'Make your own',
  makeOwnLine: 'Say what you want to see, like “my food spending by week”.',
  makeGo: 'Make it',
  drawGo: 'Draw it',
  drawing: 'Drawing it',
  share: 'Share as an add-on',
  shared: (file: string, id: string) => `Saved ${file}. Make it an add-on with: braindog addon new ${id} --from-widget ${file}`,
  shareFailed: 'This browser would not save the file.',
  keptMore: (name: string) => `More for ${name}`,
  making: 'Making it',
  makeAgain: 'Try again',
  makePut: 'Put it on Today',
  makeDraft: 'It goes on Today as a draft, for you to keep or throw away.',
  loading: 'Drawing your widgets',
} as const;

/** The widget a gallery item is, or an offer turned into one for the sheet's Suggested row. */
export type SheetItem = GalleryWidget & { why?: string; offer?: WidgetOffer };

/**
 * The catalogue as the sheet draws it before the record answers, and where it cannot: each widget with its example,
 * nothing filled and nothing read. The sheet is never empty while it waits.
 */
export function catalogueOnly(): GalleryWidget[] {
  return WIDGETS.map((t) => ({
    id: t.id,
    title: t.title,
    says: t.says,
    group: t.group,
    for: t.for,
    icon: t.icon,
    sizes: [...t.sizes],
    size: t.size,
    block: { ...t.block },
    filled: {},
    choices: {},
    addon: null,
    ready: false,
    need: null,
    reading: null,
    example: t.example,
  }));
}

/** The record's gallery, or `null` when it cannot be read. `board` is the board's widgets, so what is on it is not suggested. */
export async function readGallery(base: string, board: readonly Record<string, unknown>[] = [], fetchImpl?: typeof fetch): Promise<GalleryAnswer | null> {
  try {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base, ...(fetchImpl ? { fetch: fetchImpl } : {}) }).call<GalleryAnswer>('widgetGallery', board.length > 0 ? { board } : {});
    return out.ok && Array.isArray(out.value.widgets) ? out.value : null;
  } catch {
    return null;
  }
}

/**
 * A FIGURE AS A WIDGET SAYS IT: money whole in its own currency (`£33,850`), days as days, a day as "11 Sep", a share as a
 * percent, and nothing as a dash. `home` is the record's currency, for money that names none.
 */
export function figureSaid(f: Pick<ReadFigure, 'value' | 'unit' | 'format'>, home: string | null): string {
  if (f.value === null || !Number.isFinite(f.value)) return '—';
  const n = f.value;
  if (f.format === 'money' || f.format.startsWith('money.')) {
    const currency = f.unit ?? (f.format.startsWith('money.') ? f.format.slice('money.'.length) : home);
    if (currency === null) return Math.round(n / 100).toLocaleString('en');
    return moneyWhole(Math.round(n), currency, home ?? currency)?.text ?? '—';
  }
  switch (f.format) {
    case 'pct':
      return `${(n * 100).toLocaleString('en', { maximumFractionDigits: 1 })}%`;
    case 'days':
      return Math.round(n) === 1 ? '1 day' : `${Math.round(n).toLocaleString('en')} days`;
    case 'day':
      return dayShort(new Date(Math.round(n) * 86_400_000).toISOString().slice(0, 10));
    case 'int':
      return Math.round(n).toLocaleString('en');
    default: {
      const said = n.toLocaleString('en', { maximumFractionDigits: 1 });
      return f.unit && f.unit !== 'count' ? `${said} ${f.unit}` : said;
    }
  }
}

/** The line under a row: its amount, its day, its own words, or how far it has come. */
export function rowLine(r: ReadRow, home: string | null): string {
  const parts: string[] = [];
  if (r.done !== undefined && r.of !== undefined && r.of > 0) {
    const left = r.of - r.done;
    const currency = r.amount?.currency ?? home;
    const said = (minor: number): string => (currency ? (moneyWhole(Math.round(minor), currency, home ?? currency)?.text ?? '') : Math.round(minor).toLocaleString('en'));
    parts.push(left >= 0 ? `${said(left)} left of ${said(r.of)}` : `${said(-left)} over ${said(r.of)}`);
  } else if (r.amount) parts.push(moneyWhole(r.amount.amount, r.amount.currency, home ?? r.amount.currency)?.text ?? '');
  if (r.day) parts.push(dayShort(r.day));
  /* A BARE NUMBER IS SAID TO TWO PLACES AT MOST, GROUPED (live check of 30 October, 19): a rate read "51.744321". */
  if (r.meta) parts.push(/^-?\d+(\.\d+)?$/u.test(r.meta) ? Number(r.meta).toLocaleString('en', { maximumFractionDigits: 2 }) : r.meta);
  return parts.filter((p) => p !== '').join(' · ');
}

/** How far a row with a target has come, 0 to 1, or `null` when it has none. */
export const rowShare = (r: ReadRow): number | null => (r.done !== undefined && r.of !== undefined && r.of > 0 ? Math.max(0, Math.min(1, r.done / r.of)) : null);

/** How many figures and rows a widget shows at a size (§3.3). */
export const FIGS_AT: Readonly<Record<WidgetSize, number>> = { small: 1, wide: 2, tall: 3, large: 4, full: 4 };
export const ROWS_SHOWN: Readonly<Record<WidgetSize, number>> = { small: 1, wide: 2, tall: 4, large: 5, full: 4 };

/** The block a widget adds at a size: the gallery's block, its rows capped to what that size shows. */
export function blockAt(w: Pick<GalleryWidget, 'block'>, size: WidgetSize): Record<string, unknown> {
  const block = { ...w.block };
  const most: Readonly<Record<WidgetSize, number>> = { small: 1, wide: 3, tall: 6, large: 8, full: 8 };
  if (typeof block.limit === 'number' && block.kind !== 'kpis') block.limit = Math.min(block.limit as number, most[size]);
  if (block.kind === 'feed' && typeof block.first === 'number') block.first = Math.min(block.first as number, most[size]);
  return block;
}

/**
 * Whether a gallery item matches the sheet's search: its name, its line, its group, its own words, its add-on. The
 * words come with the item (`GalleryWidget.words`), since the catalogue is the record's and not a copy in the web.
 */
export function itemMatches(w: Pick<GalleryWidget, 'title' | 'says' | 'group' | 'for' | 'addon' | 'words'>, q: string): boolean {
  return widgetMatches({ title: w.title, says: w.says, group: w.group, for: w.for, words: [...(w.words ?? []), ...(w.addon ? [w.addon.name] : [])] }, q);
}

/**
 * The template a gallery item was made from, as the record handed it: its block with the blanks unfilled, the blanks,
 * and the fields its preview reads. `null` for one the record sent without it (an older record), which is then added
 * as drawn and cannot be filled again for another choice.
 */
export function templateOf(w: Pick<GalleryWidget, 'template' | 'size'>): (NonNullable<GalleryWidget['template']> & { size: WidgetSize }) | null {
  return w.template === undefined ? null : { ...w.template, size: w.size };
}
