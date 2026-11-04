/**
 * THE WIDGET CATALOGUE (widgets plan §3.7, §7.2): what a widget is, the few widgets the core itself offers, and the
 * reading every widget is drawn and offered by.
 *
 * A WIDGET IS A BLOCK ON A BOARD, NOT A NEW TYPE. Each template's `block` is a page block in the grammar every page is
 * written in (docs/06), drawn by the same renderer and read through the same `previewPage`, so the gallery, Today and a
 * page say one number for one figure. What a board adds, a `size` and a `key`, is the board's to write (`widgetBlock`).
 *
 * PERSONAL AND BUSINESS ARE BOTH FIRST-CLASS. Each template says who it is for (`WIDGET_FOR`), and the sheet never hides
 * one from the other.
 *
 * THE CORE OFFERS ONLY WHAT IT KEEPS ITSELF (SHL-A22, 30 October): the questions waiting on you, what changed while you
 * were away, and the agents at work. Every other widget is an add-on's, declared in its manifest's `widgets` beside its
 * lists (`packs/<id>/<id>.pack.json`, and Money's, People's, Work's and Projects' own in the seed), and joined to these
 * at read time (`widget-packs.ts` `withShipped`). Before, this file held twenty-one of them by their lists' and
 * add-ons' ids, and the core knew Money, Goals, Trips and nine more by name. What the core used to know about each one
 * (the question it answers, the page whose lead it shows, the day it counts down to) is declared beside it now.
 *
 * ADD-ONS SHIP TEMPLATES, NEVER PLACEMENTS (§6.5). A template from an add-on names it in `needs.addon`, so the sheet
 * shows it in that add-on's group and, on a record without it, offers the add-on in its place. Nothing here places a
 * widget anywhere: a press does.
 *
 * PURE AND ISOMORPHIC: the record reads it to answer `widgetGallery`, the web to draw the sheet, the design book to
 * print it. `distill` turns a block as `previewPage` answers it into the few figures or rows a preview draws, so the
 * gallery's answer is small (a reading, never a page).
 */

import { kpiView, type KpiInput } from './kpis.ts';
import { moneySet, moneyWhole } from './money.ts';
import { exponentOf } from './format.ts';

import { FIGURES_AT, ROWS_AT, SIZE_SAID, WIDGET_SIZES, isWidgetSize, type WidgetSize } from './widget-sizes.ts';
export { FIGURES_AT, ROWS_AT, SIZE_SAID, WIDGET_SIZES, isWidgetSize, type WidgetSize };

/** The sheet's groups, in the order it draws them (§5.6). */
export const WIDGET_GROUPS = ['money', 'work', 'people', 'projects', 'agents', 'numbers', 'life'] as const;
export type WidgetGroup = (typeof WIDGET_GROUPS)[number];
export const GROUP_NAMES: Readonly<Record<WidgetGroup, string>> = {
  money: 'Money',
  work: 'Work',
  people: 'People',
  projects: 'Projects',
  agents: 'Agents',
  numbers: 'Numbers',
  life: 'Life',
};

/** Who a widget is for. Both is both, and the sheet never hides one from the other. */
export const WIDGET_FOR = ['personal', 'business', 'both'] as const;
export type WidgetFor = (typeof WIDGET_FOR)[number];

/**
 * A blank a widget asks of the record, filled from the record's own things: the rows of the list `from` names, each by
 * its field (a project by its name, a currency by its code). The record picks the first that draws something
 * (`widgetGallery`), and the inspector (W4) offers the rest. `until` brings each choice's last day with it, and
 * `starts` its first.
 */
export type WidgetBlank = {
  id: string;
  asks: string;
  from?: { source: string; field: string; where?: string; order?: readonly { field: string; dir: 'asc' | 'desc' }[]; until?: string; starts?: string };
};

/**
 * What a widget needs before it draws anything: lists the record keeps, figures it declares, an add-on that brings both.
 * Missing, the sheet draws the example and says what would fill it.
 */
export type WidgetNeeds = { lists?: readonly string[]; figures?: readonly string[]; addon?: string };

/** Which fields of a list widget's rows a preview reads: the title, the day, an amount, a line under it. */
export type RowsRead = { title: string; day?: string; amount?: string; meta?: string };

/**
 * An example for the gallery: figures or rows a widget shows before the record holds any. Never stored. Money in it is
 * written `¤1,240`, and said in the record's own currency when drawn (`exampleMoney`): an add-on's sample in another
 * currency on a GBP record read as somebody else's money (the validator's audit of 30 October, 12).
 */
export type WidgetExample = { figures?: readonly { label: string; said: string }[]; rows?: readonly { title: string; meta?: string }[] };

export type WidgetTemplate = {
  id: string;
  title: string;
  /** One line saying what it shows, in the sheet under its name. */
  says: string;
  group: WidgetGroup;
  for: WidgetFor;
  icon: string;
  /** The block, with `{{project}}` and the like for its blanks, never a size, a key or a span. */
  block: Readonly<Record<string, unknown>>;
  blanks?: readonly WidgetBlank[];
  sizes: readonly WidgetSize[];
  size: WidgetSize;
  needs: WidgetNeeds;
  /** For a list widget, the fields its preview reads. */
  rows?: RowsRead;
  example: WidgetExample;
  /** Words a search matches besides its title and line ("bank", "balance"). */
  words?: readonly string[];
  /**
   * The keys of Today's own tiles that show the same thing in other words (`coming-up` for Bills coming up), so the sheet
   * and the suggestions count it as on Today. Read beside the exact match on list, filter and figure.
   */
  alike?: readonly string[];
  /** The questions it answers (signal S1): a pattern for the words, and what they are about, for the reason line. */
  asked?: readonly { match: string; about: string }[];
  /** The pages whose lead it shows, by slug (signal S2). */
  leads?: readonly string[];
  /**
   * What is said while the record does not hold what it reads, in place of "Comes with" its add-on: an add-on every record
   * starts with fills in by being used, not by being added ("Fills in once you add an account").
   */
  fills?: string;
  /** What it says of a row new in its list in the last fortnight (signal S3), with `{{name}}`, and of one with no name. */
  fresh?: { says: string; unnamed: string };
  /** A row starting within `within` days on its `day` field (signal S4): the blank's choice it counts down to. */
  near?: { day: string; within: number; unnamed: string; name?: string };
  /** At least `least` rows of its source that `where` lets through (signal S4), said with `{{count}}`. */
  due?: { where: string; least: number; says: string };
};

const OPEN_WORK = 'Nothing is waiting on you.';

/**
 * THE CORE'S OWN WIDGETS: each over what the record keeps for itself, the questions waiting (`governance.open`), what
 * changed (`activity`) and the sessions of its agents (`sessions.working`), so a record with no add-on at all has them.
 */
export const WIDGETS: readonly WidgetTemplate[] = [
  {
    id: 'needs-you',
    alike: ['needs-you'],
    title: 'Needs you',
    says: 'The questions waiting on your answer, answered where they are.',
    group: 'work',
    for: 'both',
    icon: 'inbox',
    block: { kind: 'queue', heading: 'Needs you', icon: 'inbox', source: 'governance.open', limit: 8, empty: OPEN_WORK, tiles: true },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'wide',
    needs: {},
    rows: { title: 'question' },
    example: { rows: [{ title: 'Does Tallow get retired, or parked for another year?' }] },
    words: ['questions', 'decide', 'inbox', 'approve'],
  },
  {
    id: 'since-last',
    alike: ['arrivals'],
    title: 'Since you were last here',
    says: 'What changed while you were away, and who changed it.',
    group: 'work',
    for: 'both',
    icon: 'activity',
    block: { kind: 'feed', heading: 'Since you were last here', icon: 'activity', source: 'activity', since: 'seen', first: 8, empty: 'Nothing new since you looked.' },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'tall',
    needs: {},
    rows: { title: 'thing' },
    example: { rows: [{ title: 'Kiln', meta: 'Claude edited it' }, { title: 'Filed 2 payments under Software' }] },
    words: ['activity', 'changes', 'feed', 'news'],
  },
  {
    id: 'agents-working',
    alike: ['working'],
    title: 'Agents at work',
    says: 'Which agents are working now, on what, and for which project.',
    group: 'agents',
    for: 'business',
    icon: 'session',
    block: {
      kind: 'table',
      heading: 'Working now',
      icon: 'session',
      source: 'sessions.working',
      columns: [{ field: 'agent' }, { field: 'doing' }, { field: 'project' }, { field: 'last_seen' }],
      limit: 6,
    },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'wide',
    needs: {},
    rows: { title: 'doing', meta: 'agent' },
    example: { rows: [{ title: 'Variable axis QA, instances 3 of 9', meta: 'Claude' }, { title: 'Drafting the specimen page copy', meta: 'Codex' }] },
    words: ['claude', 'codex', 'cursor', 'runs', 'sessions', 'working'],
    asked: [{ match: "\\b(agents?|claude|codex|cursor) (are |is )?(working|doing|on)\\b", about: 'what the agents are doing' }],
    leads: ['agents'],
  },
];

/** A template by its id among `from`, the core's own unless the record's whole catalogue is handed in. */
export const widgetById = (id: string, from: readonly WidgetTemplate[] = WIDGETS): WidgetTemplate | undefined => from.find((w) => w.id === id);

/** Whether a template draws at a size. */
export const widgetFits = (t: Pick<WidgetTemplate, 'sizes'>, size: WidgetSize): boolean => t.sizes.includes(size);

/** Every `{{blank}}` in a block filled from `values`; a blank with no value is left as it is written. Deep, and pure. */
export function fillBlanks<T>(block: T, values: Readonly<Record<string, string>>): T {
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(/\{\{([a-z_]+)\}\}/gu, (all, name: string) => (Object.hasOwn(values, name) ? values[name]! : all));
    if (Array.isArray(v)) return v.map(fill);
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(block) as T;
}

/**
 * The blanks a template's blanks name, which `fillBlanks` leaves alone unless asked: `{{name}}` inside a card is the row's.
 * Each blank may bring its last day with it, `{{<blank>_until}}`, filled from the same choice (a trip and the day it ends).
 */
const OWN_BLANKS = (t: Pick<WidgetTemplate, 'blanks'>): string[] => (t.blanks ?? []).flatMap((b) => [b.id, `${b.id}_until`]);

/**
 * A template as a block a board can hold: its blanks filled, its rows capped to what the size shows, and nothing a
 * board writes for itself (the size and the key are the board's). The board's `onadd({ block, size })` takes this.
 */
export function widgetBlock(t: Pick<WidgetTemplate, 'block' | 'blanks' | 'size'>, size: WidgetSize = t.size, values: Readonly<Record<string, string>> = {}): Record<string, unknown> {
  const own = Object.fromEntries(Object.entries(values).filter(([k]) => OWN_BLANKS(t).includes(k)));
  const block = fillBlanks({ ...t.block }, own) as Record<string, unknown>;
  /* AN `until` NOTHING FILLED IS LEFT OUT: the widget then stays until it is taken away, rather than being refused. */
  if (typeof block.until === 'string' && block.until.includes('{{')) delete block.until;
  if (typeof block.limit === 'number' && block.kind !== 'kpis') block.limit = Math.min(block.limit, ROWS_AT[size]);
  if (block.kind === 'feed' && typeof block.first === 'number') block.first = Math.min(block.first, ROWS_AT[size]);
  return block;
}

/**
 * The blanks as picked once one changed: the new choice, and where the blank brings a last day (a trip), that choice's
 * day as `<blank>_until`, so the widget leaves after the trip picked and not after the first one offered.
 */
export function chosenWith(w: Pick<GalleryWidget, 'untils'>, chosen: Readonly<Record<string, string>>, id: string, value: string): Record<string, string> {
  const next: Record<string, string> = { ...chosen, [id]: value };
  const day = w.untils?.[id]?.[value];
  if (day !== undefined) next[`${id}_until`] = day;
  else delete next[`${id}_until`];
  return next;
}

/**
 * Whether a template matches what was typed in the sheet's search: its name, its line, its group or its own words. An
 * add-on's widget carries its add-on's name among its words (`packTemplate`), so a search for the add-on finds its widgets.
 */
export function widgetMatches(t: Pick<WidgetTemplate, 'title' | 'says' | 'group' | 'for' | 'words'>, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/u).filter((w) => w !== '');
  if (words.length === 0) return true;
  const hay = [t.title, t.says, GROUP_NAMES[t.group], t.for, ...(t.words ?? [])].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ── a reading, as a preview draws it ─────────────────────────────────────────────────────────────────────────── */

/** One figure as a preview draws it: its label, its value in minor units or a number, its unit and format. */
export type ReadFigure = { label: string; value: number | null; unit: string | null; format: string; met: boolean | null; line?: (number | null)[]; said?: string };
/** One row as a preview draws it: its title, a day, an amount in minor units, and a short line under it. */
export type ReadRow = { title: string; day?: string; amount?: { amount: number; currency: string }; meta?: string; done?: number; of?: number };

/**
 * WHAT A WIDGET SHOWS IN THE GALLERY, distilled from its block as `previewPage` answered it: a few figures or a few rows,
 * how many there are in all, and the block's own empty words when it holds nothing. `fix` is the record's sentence when
 * it refused the block. Small on purpose: the sheet asks for two dozen at once.
 */
export type WidgetReading = { figures?: ReadFigure[]; rows?: ReadRow[]; count: number; empty: string | null; fix?: string };

const isBag = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : typeof v === 'number' ? String(v) : undefined);
const amountOf = (v: unknown): { amount: number; currency: string } | undefined =>
  isBag(v) && typeof v.amount === 'number' && typeof v.currency === 'string' ? { amount: v.amount, currency: v.currency } : undefined;

/** How many rows a preview keeps: enough for the largest size's first glance. */
export const PREVIEW_ROWS = 6;
/** How many points of a figure's line a preview keeps, the newest. */
export const PREVIEW_POINTS = 28;

/**
 * THE SIZE A LIST WIDGET STARTS AT, FITTED TO ITS ROWS: a list that holds a row or two is offered one cell high, and not
 * at its template's Tall or Large, where "People to get back to" drew one person in a box five hundred pixels tall, and
 * cut its own name in a one-column card (audit 2, B6). Wide before Small, so the title and the row keep their width.
 * Only ever smaller, only to a size the template allows, and only where the reading is rows and how many it holds is
 * known; figures, a line and a reading not yet in keep the template's size.
 */
export function fittedSize(sizes: readonly WidgetSize[], size: WidgetSize, reading: WidgetReading | null | undefined): WidgetSize {
  if (reading === null || reading === undefined || reading.figures !== undefined || reading.rows === undefined || reading.rows.length === 0) return size;
  const tall = SIZE_SAID[size].rows;
  if (tall <= 1) return size;
  const fits = (to: WidgetSize): boolean => sizes.includes(to) && SIZE_SAID[to].rows < tall && SIZE_SAID[to].cols <= Math.max(SIZE_SAID[size].cols, 2) && reading.count <= ROWS_AT[to];
  return (['wide', 'small'] as const).find(fits) ?? size;
}

/** A block as `previewPage` answered it, distilled to what a widget's preview draws (`WidgetReading`). */
export function distill(t: Pick<WidgetTemplate, 'rows' | 'block'>, drawn: unknown, opts: { now?: number } = {}): WidgetReading {
  const b = isBag(drawn) ? drawn : {};
  const empty = textOf(t.block.empty) ?? null;
  const refusals = Array.isArray(b.refusals) ? (b.refusals as unknown[]) : [];
  const fix = refusals.length > 0 && isBag(refusals[0]) ? textOf(refusals[0].fix) : undefined;
  const matched = typeof b.matched === 'number' ? b.matched : 0;
  /* FIGURES: a stat's readings, each by its cell's label. A progress block carries the figure it sets its rows against
     as a reading too, and is a list. */
  if (Array.isArray(b.readings) && t.block.kind !== 'progress') {
    const figures = (b.readings as unknown[]).flatMap((r): ReadFigure[] => {
      if (!isBag(r)) return [];
      const reading = isBag(r.reading) ? r.reading : null;
      if (reading === null) return [];
      const line = Array.isArray(r.trend) ? (r.trend as unknown[]).map((p) => (typeof p === 'number' ? p : null)).slice(-PREVIEW_POINTS) : undefined;
      const value = typeof reading.value === 'number' ? reading.value : null;
      return [
        {
          label: textOf(r.label) ?? textOf(r.metric) ?? '',
          value,
          unit: typeof reading.unit === 'string' ? reading.unit : null,
          format: typeof r.format === 'string' ? r.format : 'int',
          met: typeof reading.met === 'boolean' ? reading.met : null,
          ...(line && line.some((p) => p !== null) ? { line } : {}),
        },
      ];
    });
    const any = figures.some((f) => f.value !== null);
    return { figures, count: figures.length, empty: any ? null : empty, ...(fix && !any ? { fix } : {}) };
  }
  /* BARS BY WEEK OR MONTH (a `series` over a figure that sums by bucket): the period now, the one before, and the line. */
  if (isBag(b.bars) && Array.isArray(b.bars.values) && Array.isArray(b.bars.values[0])) {
    const now = (b.bars.values[0] as unknown[]).map((v) => (typeof v === 'number' ? v : null));
    const unit = typeof b.bars.unit === 'string' && /^[A-Z]{3}$/u.test(b.bars.unit) ? b.bars.unit : null;
    const per = b.bars.bucket === 'month' ? 'month' : 'week';
    const at = (i: number): number => now.at(i) ?? 0;
    const format = unit !== null ? 'money' : 'decimal';
    const figures: ReadFigure[] = [
      { label: `This ${per}`, value: at(-1), unit, format, met: null, ...(now.filter((v) => v !== null).length > 1 ? { line: now.map((v) => v ?? 0).slice(-PREVIEW_POINTS) } : {}) },
      { label: `Last ${per}`, value: at(-2), unit, format, met: null },
    ];
    return { figures, count: now.length, empty: now.some((v) => v !== null) ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* A LINE OF TOTALS BY WEEK OR MONTH (`lines` over a list): the period now, the one before, and the line. */
  if (Array.isArray(b.measures) && b.measures.length > 0 && isBag(b.measures[0])) {
    const m = b.measures[0] as Record<string, unknown>;
    const now = Array.isArray(m.now) ? (m.now as unknown[]).map((v) => (typeof v === 'number' ? v : null)) : [];
    const cols = Array.isArray(t.block.columns) ? (t.block.columns as unknown[]) : [];
    const money = cols.some((c) => isBag(c) && typeof c.field === 'string' && /amount|paid|value|total|price/u.test(c.field));
    const per = m.bucket === 'month' ? 'month' : 'week';
    const at = (i: number): number => now.at(i) ?? 0;
    const figures: ReadFigure[] = [
      { label: `This ${per}`, value: at(-1), unit: null, format: money ? 'money' : 'decimal', met: null, ...(now.filter((v) => v !== null).length > 2 ? { line: now.slice(-PREVIEW_POINTS) } : {}) },
      { label: `Last ${per}`, value: at(-2), unit: null, format: money ? 'money' : 'decimal', met: null },
    ];
    return { figures, count: now.length, empty: now.some((v) => v !== null) ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* KEY NUMBERS: each with its latest point and its line. */
  if (Array.isArray(b.kpis)) {
    const figures = (b.kpis as unknown[]).slice(0, 5).flatMap((k): ReadFigure[] => {
      if (!isBag(k)) return [];
      const latest = isBag(k.latest) && typeof k.latest.value === 'number' ? k.latest.value : null;
      const points = Array.isArray(k.points) ? (k.points as unknown[]).map((p) => (isBag(p) && typeof p.value === 'number' ? p.value : null)).slice(-PREVIEW_POINTS) : [];
      /* SAID AS TODAY'S CARD SAYS IT (`kpiView`): a flow is its last whole month, not its latest reading, so the sheet and
         Today name one number (the validator's audit of 30 October, 12). */
      let said: string | undefined;
      try {
        /* ON THE RECORD'S OWN CLOCK, as Today reads it: on the machine's, a record whose day is not today counted another
           month as its last whole one ("32 hours" against Today's 28, the validator's recheck of 30 October, 12). */
        const v = kpiView(k as unknown as KpiInput, opts.now !== undefined ? { now: opts.now } : {});
        if (v.figure) said = v.figure.after === '' || /^[A-Z]{3}$/u.test(v.figure.after) ? v.figure.text : v.figure.main;
      } catch {
        said = undefined;
      }
      return [{ label: textOf(k.name) ?? '', value: latest, unit: textOf(k.unit) ?? null, format: 'decimal', met: null, ...(said ? { said } : {}), ...(points.length > 1 ? { line: points } : {}) }];
    });
    return { figures, count: (b.kpis as unknown[]).length, empty: figures.length > 0 ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* THE QUEUE: each question. */
  if (Array.isArray(b.queue)) {
    const rows = (b.queue as unknown[]).slice(0, PREVIEW_ROWS).flatMap((q): ReadRow[] => (isBag(q) && textOf(q.question) ? [{ title: textOf(q.question)! }] : []));
    return { rows, count: Math.max(matched, rows.length), empty: rows.length > 0 ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* THE FEED: what changed. */
  if (Array.isArray(b.feed)) {
    /* EACH THING ONCE, IN PLAIN WORDS: the same filing twice in a row read as a stutter, and a bank's shouted payee as a
       code (the validator's recheck of 30 October, 33). */
    const seen = new Set<string>();
    const rows = (b.feed as unknown[])
      .flatMap((f): ReadRow[] => {
        if (!isBag(f)) return [];
        const title = plainName(textOf(f.thing));
        if (title === undefined || seen.has(title)) return [];
        seen.add(title);
        return [{ title, ...(textOf(f.at) ? { day: textOf(f.at)!.slice(0, 10) } : {}) }];
      })
      .slice(0, PREVIEW_ROWS);
    return { rows, count: Math.max(matched, rows.length), empty: rows.length > 0 ? null : empty };
  }
  /* A LIST: its rows by the fields the template names. */
  const read = t.rows;
  const raw = Array.isArray(b.rows) ? (b.rows as unknown[]) : [];
  const scopes = Array.isArray(b.scopes) ? (b.scopes as unknown[]) : [];
  /* A PROGRESS BLOCK SETS EACH ROW AGAINST ITS FIGURE'S PART FOR THAT ROW: the reading's groups, keyed by the row. */
  const groups = new Map<string, number>();
  if (t.block.kind === 'progress' && Array.isArray(b.readings))
    for (const r of b.readings as unknown[])
      if (isBag(r) && isBag(r.reading) && Array.isArray(r.reading.groups))
        for (const g of r.reading.groups as unknown[]) if (isBag(g) && typeof g.key === 'string' && typeof g.value === 'number') groups.set(g.key, g.value);
  const progressOf = (r: Record<string, unknown>, title: string): { done: number; of: number } | null => {
    if (t.block.kind !== 'progress' || read === undefined) return null;
    const f = r.fields as Record<string, unknown>;
    const target = read.amount ? f[read.amount] : undefined;
    const of = amountOf(target)?.amount ?? (typeof target === 'number' ? target : null);
    if (of === null || of <= 0) return null;
    const spoken = typeof r.register === 'string' && typeof r.seq === 'number' ? `${r.register}#${r.seq}` : '';
    const done = groups.get(String(r.id)) ?? groups.get(spoken) ?? groups.get(title) ?? 0;
    return { done, of };
  };
  const rows = raw.slice(0, PREVIEW_ROWS).flatMap((r, i): ReadRow[] => {
    if (!isBag(r) || !isBag(r.fields) || read === undefined) return [];
    const f = r.fields;
    /* A NAME IN A PERSON'S WORDS WHERE THE ROW KEEPS ONE (a payment's payee), else its title tidied: a bank's capitals
       ("FENWICK CLOUD") said as a name is said (audit of 30 October, 13). */
    const title = plainName(textOf(f.payee) ?? textOf(f[read.title]));
    if (title === undefined) return [];
    const day = read.day ? textOf(f[read.day]) : undefined;
    const amount = read.amount ? amountOf(f[read.amount]) : undefined;
    const said = read.meta ? (textOf(f[read.meta]) ?? (typeof scopes[i] === 'string' ? (scopes[i] as string) : undefined)) : undefined;
    const meta = read.meta === 'agent' ? agentNamed(said) : said;
    const p = progressOf(r, title);
    return [{ title, ...(day ? { day: day.slice(0, 10) } : {}), ...(amount ? { amount } : {}), ...(meta ? { meta } : {}), ...(p ? p : {}) }];
  });
  return { rows, count: Math.max(matched, rows.length), empty: rows.length > 0 ? null : empty, ...(fix && rows.length === 0 ? { fix } : {}) };
}

/* ── the gallery's answer ─────────────────────────────────────────────────────────────────────────────────────── */

/** What the record says of one widget for the sheet: the template's parts, its block filled, and a reading or a need. */
export type GalleryWidget = {
  id: string;
  title: string;
  says: string;
  group: WidgetGroup;
  for: WidgetFor;
  icon: string;
  sizes: WidgetSize[];
  size: WidgetSize;
  /** The block filled from the record, at its own size: what `onadd` hands the board. */
  block: Record<string, unknown>;
  /** The blanks as filled, by id, and the other things the record could fill each with, by name. */
  filled: Record<string, string>;
  choices: Record<string, string[]>;
  /** For a blank that brings its last day (a trip), that day by choice: what `chosenWith` fills `<blank>_until` from. */
  untils?: Record<string, Record<string, string>>;
  /** The add-on it comes with, by id and name, or `null` for one of the core's. */
  addon: { id: string; name: string } | null;
  /** True when the record holds what it reads; false and `need` says what would fill it. */
  ready: boolean;
  need: string | null;
  reading: WidgetReading | null;
  example: WidgetExample;
  /** Its words, for the sheet's search, the add-on's name among them. */
  words?: string[];
  /**
   * The template as declared, its blanks unfilled: what the sheet fills again when another choice is picked
   * (`widgetBlock`), and the fields its preview reads (`distill`). The catalogue is the record's, so the web reads the
   * template here rather than from a copy of its own.
   */
  template?: { block: Record<string, unknown>; blanks?: WidgetBlank[]; rows?: RowsRead };
  /** True when Today already has a widget reading the same thing: the sheet says so, and suggests it nowhere. */
  onBoard?: boolean;
  /** The heading Today shows it under, where that is not the widget's own name ("Your work this week" for Next up). */
  onBoardAs?: string;
};

/** A widget offered from use, with its reason (§6): what `widgetGallery`'s `suggested` and Today's cell carry. */
export type WidgetOffer = {
  /** Stable across readings, `widget:<template>[:<blank>]`, and the id `pen.dismissed` keeps for Forget. */
  key: string;
  widget: string;
  title: string;
  why: string;
  size: WidgetSize;
  block: Record<string, unknown>;
  /** The signal it rests on (S1 to S6), and its score. */
  signal: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  score: number;
  /** On S6, the board key of the widget it suggests taking away, and no block to add. */
  remove?: string;
  /** On S1, how many times the question was asked: the palette says "you've asked this 3 times". */
  asked?: number;
  /** On S1, the patterns of the questions it answers, as its template declares them, so a screen can tell its question. */
  asks?: string[];
  /** The widget drawn small on the record's own data, so the cell shows the real thing; absent where it was not read. */
  reading?: WidgetReading;
};

export type GalleryAnswer = { widgets: GalleryWidget[]; suggested: WidgetOffer[] };

/* ── a question asked again ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHICH WIDGET ANSWERS A QUESTION (signal S1, widgets plan §6.1): the words a question to Slash is matched to a widget by,
 * as each template declares them (`asked`), the first that matches winning. The record counts the days each was asked
 * on; the palette reads the same words to say "you've asked this 3 times" under an answer. Rules, never a model.
 *
 * EACH WIDGET SAYS ITS OWN (SHL-A22): this was one list of eighteen in the core, keyed by the widgets' ids, so the core
 * knew which add-on each word was about. Narrower patterns are listed first in a template, and the
 * templates are asked in the catalogue's order.
 */
export function askedOf(templates: readonly WidgetTemplate[]): { widget: string; re: RegExp; about: string }[] {
  /* EVERY TEMPLATE'S FIRST PATTERN BEFORE ANY TEMPLATE'S SECOND: a widget's broader words are its later ones ("cash" after
     "how long the cash lasts"), and they must not win over another widget's narrow first ones ("what I spent in cash"). */
  const most = Math.max(0, ...templates.map((t) => t.asked?.length ?? 0));
  const out: { widget: string; re: RegExp; about: string }[] = [];
  for (let i = 0; i < most; i++)
    for (const t of templates) {
      const a = t.asked?.[i];
      if (a === undefined) continue;
      try {
        out.push({ widget: t.id, re: new RegExp(a.match, 'iu'), about: a.about });
      } catch {
        /* A pattern that does not compile answers nothing; the manifest check refuses one at install. */
      }
    }
  return out;
}

/** The widget among `templates` a question asks about, by its words, or `null`. */
export const askedWidget = (text: string, templates: readonly WidgetTemplate[] = WIDGETS): string | null => askedOf(templates).find((a) => a.re.test(text))?.widget ?? null;

/**
 * ABOUT WHAT A UNIT OF EACH CURRENCY IS WORTH IN US DOLLARS, for the exchange rate's example only: the gallery says the
 * record's own money against the dollar ("£1 = $1.27" on a GBP record), never somebody else's rate (the coordinator's
 * word of 30 October, after "USD 48.62", an EGP rate, showed on a GBP record). Never a rate anything is worked out from.
 */
const SAMPLE_DOLLARS: Readonly<Record<string, number>> = {
  GBP: 1.27, EUR: 1.08, CHF: 1.13, CAD: 0.73, AUD: 0.66, NZD: 0.6, AED: 0.27, SAR: 0.27, QAR: 0.27, KWD: 3.26, BHD: 2.65,
  OMR: 2.6, JOD: 1.41, EGP: 0.0206, INR: 0.012, PKR: 0.0036, JPY: 0.0067, CNY: 0.14, TRY: 0.029, MAD: 0.1, NGN: 0.00065,
  ZAR: 0.055, KES: 0.0077, SEK: 0.095, NOK: 0.093, DKK: 0.145, PLN: 0.25, BRL: 0.18, MXN: 0.055, SGD: 0.75, HKD: 0.128,
};

/** The sample rate as the record says it: its unit against a dollar, or a dollar against it where its unit is small. */
function sampleRate(home: string | null): string {
  const write = (major: number, currency: string): string =>
    moneySet([Math.round(major * 10 ** exponentOf(currency))], currency, currency).written[0]?.text ?? `${currency} ${major}`;
  if (home === null || home === 'USD') return `${write(1, 'USD')} = ${write(0.92, 'EUR')}`;
  const dollars = SAMPLE_DOLLARS[home];
  if (dollars === undefined) return `${write(1, home)} in dollars`;
  return dollars >= 0.5 ? `${write(1, home)} = ${write(dollars, 'USD')}` : `${write(1, 'USD')} = ${write(1 / dollars, home)}`;
}

/**
 * A sample figure rounded as a person would say it, and plainly a round one: two figures at most (live check of 30
 * October, 4), so "EGP 1,210,000" and "EGP 383,000" read as his own numbers where "EGP 1,200,000" and "EGP 380,000" do not.
 */
const sampleRound = (n: number): number => {
  if (n < 10) return Math.max(1, Math.round(n));
  const keep = 2;
  const step = 10 ** (Math.floor(Math.log10(n)) + 1 - keep);
  return Math.round(n / step) * step;
};

/**
 * An example's money said in the record's currency. Each `¤1,240` is written in US dollars and said as about that much
 * of the record's own money (`SAMPLE_DOLLARS`), so ¤110 is about £87 on a GBP record and about 5,300 pounds on
 * an EGP one, never an EGP figure with a £ in front of it (the validator's recheck of 30 October, 12). A currency the
 * table does not know says the dollars as dollars. `¤fx` is the record's money against the dollar (`sampleRate`). Pure.
 */
export function exampleMoney(text: string, home: string | null): string {
  if (text.includes('¤fx')) text = text.replace(/¤fx/gu, () => sampleRate(home));
  return text.replace(/¤([0-9][0-9,]*)/gu, (_all, n: string) => {
    const dollars = Number(n.replace(/,/gu, ''));
    if (!Number.isFinite(dollars)) return n;
    if (home === null) return dollars.toLocaleString('en');
    const rate = home === 'USD' ? 1 : SAMPLE_DOLLARS[home];
    const currency = rate === undefined ? 'USD' : home;
    const whole = rate === undefined ? dollars : sampleRound(dollars / rate);
    return moneyWhole(whole * 10 ** exponentOf(currency), currency, currency)?.text ?? `${currency} ${whole.toLocaleString('en')}`;
  });
}

/** A name typed as a slug: small letters and digits joined by hyphens or underscores ("kiln-site"). */
const SLUG = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/u;

/**
 * AN AGENT BY ITS OWN SPELLING: a run signs with the bare word ("claude"), and Agents at work listed "claude" and "codex"
 * where every other page says "Claude" and "Codex" (recheck of 30 October, 33). A name not known here is raised at its
 * first letter, which is still a name.
 */
const AGENT_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude',
  'claude-code': 'Claude Code',
  chatgpt: 'ChatGPT',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
};
export function agentNamed(text: string | undefined): string | undefined {
  if (text === undefined || text === '') return text;
  const known = AGENT_NAMES[text.toLowerCase()];
  if (known !== undefined) return known;
  return /[A-Z]/u.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A line a bank shouted, said as a name: "FENWICK CLOUD" as "Fenwick Cloud". Anything already in mixed case is left.
 * AND A NAME TYPED AS A SLUG, said in words as the sidebar says it (the web's `shownName`): the Projects in play preview
 * listed "kiln-site" where the sidebar said "Kiln site" (live check of 30 October, 19).
 */
export function plainName(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (SLUG.test(text)) {
    const words = text.replace(/[-_]+/gu, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  if (!/[A-Z]{3}/u.test(text) || /[a-z]/u.test(text)) return text;
  /* THREE LETTERS OR FEWER ARE INITIALS, as `readable` keeps them: the exchange rate's "USD" read "Usd" (live check of
     30 October, 19). */
  if ((text.match(/\p{L}/gu) ?? []).length <= 3) return text;
  return text.toLowerCase().replace(/(^|[\s/&(-])(\p{L})/gu, (_a, pre: string, ch: string) => pre + ch.toUpperCase());
}
