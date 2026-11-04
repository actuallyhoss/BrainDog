/**
 * The widget sheet and the widgets offered from use: `widgetGallery` and `widgetSuggest`, both READ+ and both writing
 * nothing (widgets plan §5.6, §6, §7.3).
 *
 * `widgetGallery({ group?, q? })` IS THE SHEET'S ONE READ, asked only when the sheet opens and never on Today's open (§8:
 * Today's request count stands). Every widget in the catalogue (`braindog-render` `WIDGETS`) the caller may see, each with
 * its block filled from the record (the first project, the currency held), and a small reading drawn by `previewPage`, the
 * method every page is drawn by, so a preview says the number Today will. THE READINGS ARE BATCHED: twelve widgets a
 * `previewPage`, and a batch the record refuses whole is read one widget at a time, so one widget it cannot draw costs only
 * that widget. A widget whose lists or figures the record does not hold is not drawn: it carries its example and says
 * which add-on fills it.
 *
 * `widgetSuggest({ board?, cell? })` IS WHAT SLASH WOULD ADD TO TODAY, from use: the signals (`widget-signals.ts`)
 * weighed by the widget tier (`design-agent.ts` `widgetOffers`), strongest first and three at most, or the one Today's
 * last cell shows with `cell`. `board` is the board's widgets as drawn (key, source, empty), for what is already there and
 * what has drawn nothing for three weeks. Today asks it inside its own read (`today.ts`), so the cell costs no request.
 *
 * THE CATALOGUE IS EVERYBODY'S DECLARATIONS, NOT THE CORE'S LIST (SHL-A22, 30 October). The core offers the three widgets
 * over what it keeps itself (`braindog-render` `WIDGETS`); every other comes from where it is declared: this build's own
 * modules and starters (`@braindog/seed` `SEED_WIDGETS`, read from the build so a record installed before they declared
 * any has them), the manifests of the add-ons the record holds, and, for an add-on it does not hold yet or holds at a
 * version from before its widgets, the newest file the host's catalogue publishes (`catalogueShelf`), which is where
 * "Comes with" its name comes from. A blank's choices are read the way its widget declares them (`from`), drawn by
 * `previewPage` like the widget, so a reader is offered only rows they may see.
 *
 * TO A PERSON WHO READS EVERY LIST, AND WITH THE PEN ON. A suggestion rests on use read across the record, and a reader
 * held to some lists is offered nothing, as the pen offers them nothing (`boot`'s `pen`). `pen.suggest` off is none.
 */

import type { Result } from '@braindog/ports';
import { dayIn, fillConfig, type Json } from '@braindog/kernel';
import {
  WIDGETS,
  WIDGET_GROUPS,
  distill,
  widgetBlock,
  fittedSize,
  widgetById,
  widgetMatches,
  type GalleryAnswer,
  type GalleryWidget,
  type WidgetGroup,
  type WidgetOffer,
  type WidgetTemplate,
  askedWidget,
  composeWidget,
  isWidgetSize,
  type ComposeChoices,
  type WidgetReading,
  type WidgetSize,
  withShipped,
  drawWidgetAsk,
  type ShippedWidget,
  type Shipper,
} from 'braindog-render';
import { previewerOf, type SlashDeclined, type SlashDrafted, type SlashPreviewer } from '../slash.ts';
import { packIdOf } from '@braindog/declare';
import { SEED_WIDGETS } from '@braindog/seed/packs';
import type { CatalogueShelf } from '../arrange.ts';

import { widgetOffers, type WidgetHeld, type WidgetSignal } from '../design-agent.ts';
import { needsMet, widgetSignals, type BoardRead, type SignalRead } from '../widget-signals.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How many widgets one `previewPage` draws for the gallery. */
export const GALLERY_BATCH = 12;
/** The most a search may say. */
export const GALLERY_Q_MOST = 100;
/** The most of the board `widgetSuggest` is handed. */
export const BOARD_MOST = 24;
/** How many suggestions Today's one cell reads, strongest first, for one that draws something: all in one draw. */
export const CELL_TRIES = 3;

/**
 * A reading with no figure and no line, which Today's cell does not show (`SuggestCell.svelte` in `apps/web`). A widget
 * the record could not draw has no reading, and is not blank: its cell says it is waiting, as before.
 */
export const blankReading = (r: WidgetReading | undefined): boolean => r !== undefined && (r.figures?.length ?? 0) === 0 && (r.rows?.length ?? 0) === 0;
/** The most projects or currencies offered for a blank, and the most rows read to find them. */
const CHOICES_MOST = 8;
const CHOICES_READ = 200;

/** The preference the widget brakes are kept in (`index.ts` `PREF_KEYS`). */
export const WIDGETS_HELD_PREF = 'widgets.held';

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => v !== null && typeof v === 'object' && !Array.isArray(v);
const DAY_MS = 86_400_000;

/** What the person said to widget offers, read off their preferences. */
export function heldOf(prefs: Bag): WidgetHeld {
  const kept = isBag(prefs[WIDGETS_HELD_PREF]) ? (prefs[WIDGETS_HELD_PREF] as Bag) : {};
  const notNow = Array.isArray(kept.notNow) ? kept.notNow.filter((k): k is string => typeof k === 'string') : [];
  const never = new Set((Array.isArray(prefs['pen.dismissed']) ? prefs['pen.dismissed'] : []).filter((k): k is string => typeof k === 'string' && k.startsWith('widget')));
  return {
    notNow,
    never,
    ...(typeof kept.last === 'string' ? { last: kept.last } : {}),
    ...(typeof kept.forgot === 'string' ? { forgot: kept.forgot } : {}),
  };
}

/** One of the board's widgets, from what a caller handed: its key, heading and source, and whether it drew nothing. */
export function boardOf(v: unknown): BoardRead[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, BOARD_MOST).flatMap((b): BoardRead[] => {
    if (!isBag(b) || typeof b.key !== 'string') return [];
    return [
      {
        key: b.key,
        ...(typeof b.heading === 'string' ? { heading: b.heading } : {}),
        ...(typeof b.source === 'string' ? { source: b.source } : {}),
        empty: b.empty === true,
        ...(typeof b.where === 'string' ? { where: b.where } : {}),
        ...(typeof b.metric === 'string' ? { metric: b.metric } : {}),
      } as BoardRead,
    ];
  });
}

/**
 * Whether a widget is on the board already: a block there reads what it reads. Same words twice on Today is the clutter
 * the cap is there to stop (risk 2).
 *
 * THE SAME LIST AND THE SAME FILTER, OR THE SAME FIGURE, OR ONE OF TODAY'S OWN TILES THE CATALOGUE SAYS IS THE SAME
 * (`alike`): Today's Cash ahead and Coming up are the catalogue's own, read as Today reads them, so a board that has them
 * is not offered them again. The list alone said People to get back to was on Today because Today shows
 * people, and it is not (the validator's audit of 30 October, 11).
 */
export function onBoardOf(board: readonly (BoardRead & { where?: string; metric?: string })[], values: (s: WidgetSignal) => Record<string, string>, byId: (id: string) => WidgetTemplate | undefined = (id) => widgetById(id)) {
  return (s: WidgetSignal): boolean => {
    const t = byId(s.widget);
    if (t === undefined) return true;
    return readsAsOnBoard(widgetBlock(t, t.size, values(s)), board, t.alike);
  };
}

/** A filter as a set of clauses, so two that say the same in another order are the same. */
const clausesKey = (where: unknown): string =>
  typeof where === 'string'
    ? where
        .split(/,\s*/u)
        .map((c) => c.trim().replace(/\s+/gu, ' '))
        .filter((c) => c !== '')
        .sort()
        .join(', ')
    : '';

/** Whether a block reads what a board widget reads: a figure it shares, its list and filter, or a tile it is alike. */
export function readsAsOnBoard(block: Bag, board: readonly (BoardRead & { where?: string; metric?: string })[], alike: readonly string[] = []): boolean {
  return onBoardAs(block, board, alike) !== null;
}

/**
 * The tile on Today that reads what a widget reads, or `null`. Its heading goes with it, so the sheet can say which tile
 * shows it: "Next up" is Today's "Your work this week" and "Since you were last here" its "Arrivals", and "Today already shows
 * this" under a name Today does not use read as wrong (the validator's recheck of 30 October, 11).
 */
export function onBoardAs(block: Bag, board: readonly (BoardRead & { where?: string; metric?: string })[], alike: readonly string[] = []): BoardRead | null {
  const cells = Array.isArray(block.cells) ? (block.cells as Bag[]) : [];
  const metrics = new Set(cells.flatMap((c) => (typeof c.metric === 'string' ? [c.metric] : [])));
  const source = typeof block.source === 'string' ? block.source : undefined;
  const where = clausesKey(block.where);
  return (
    board.find(
      (b) =>
        alike.includes(b.key) ||
        (metrics.size > 0 ? b.metric !== undefined && metrics.has(b.metric) : source !== undefined && b.source === source && clausesKey(b.where) === where),
    ) ?? null
  );
}

/** What `widgetCompose` answers: the draft block, the size it starts at, its name, how it was made, and its reading. */
export type WidgetComposed = { block: Record<string, unknown>; size: WidgetSize; title: string; from: 'rules' | 'model'; reading: WidgetReading | null; cost?: string; sizes?: WidgetSize[] };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const stripDraft = (b: Bag): Bag => {
  const { draft: _d, ...rest } = b;
  return rest;
};
/** Which fields a composed list's preview reads: the first column is its line, a day and an amount where it has them. */
function rowsReadOf(block: Bag): { title: string; day?: string; amount?: string } | undefined {
  const cols = Array.isArray(block.columns) ? (block.columns as Bag[]).flatMap((c) => (typeof c.field === 'string' ? [c.field] : [])) : [];
  if (cols.length === 0) return undefined;
  const day = cols.find((f) => /^(on|by|day|from|due|as_of|in_touch)$/u.test(f));
  const amount = cols.find((f) => /amount|paid|value|total|budget|target/u.test(f));
  const title = cols.find((f) => f !== day && f !== amount) ?? cols[0]!;
  return { title, ...(day ? { day } : {}), ...(amount ? { amount } : {}) };
}
/** The first block the model's draft holds, or `null`. */
function firstBlock(d: SlashDrafted): Bag | null {
  for (const draft of d.drafts) {
    const to = draft.change.to as { body?: unknown; declarations?: { kind?: string; body?: unknown }[] };
    const bodies = Array.isArray(to.declarations) ? to.declarations.filter((x) => x.kind === 'page').map((x) => x.body) : [to.body];
    for (const body of bodies) {
      const blocks = isBag(body) && Array.isArray(body.blocks) ? (body.blocks as unknown[]) : [];
      const block = blocks.find((b) => isBag(b) && typeof b.kind === 'string');
      if (isBag(block)) return block;
    }
  }
  return null;
}

/** One source of widgets: who ships them, and the widgets as declared. */
type Shipping = { by: Shipper; widgets: ShippedWidget[] };

/** This build's own modules' and starters' widgets, each under the pack id a record holds it by. */
const SEEDED: readonly Shipping[] = SEED_WIDGETS.map((s) => ({
  by: { id: s.pack ?? packIdOf(s.usecase ?? ''), title: s.title },
  widgets: s.widgets as ShippedWidget[],
}));

/** A manifest's settings filled into its widgets, each at what was chosen or else at its default. */
function filledWidgets(m: { widgets?: unknown; config?: unknown; config_values?: unknown }): ShippedWidget[] {
  if (!Array.isArray(m.widgets)) return [];
  const chosen = isBag(m.config_values) ? m.config_values : {};
  const values = Object.fromEntries(
    Object.entries(isBag(m.config) ? m.config : {}).flatMap(([k, d]) => {
      const v = Object.hasOwn(chosen, k) ? chosen[k] : isBag(d) ? d.default : undefined;
      return v === undefined ? [] : [[k, v as Json]];
    }),
  );
  return m.widgets.filter(isBag).map((w) => (Object.keys(values).length > 0 ? (fillConfig(w as Json, values) as Bag) : w));
}

/**
 * THE CATALOGUE'S FILES ARE READ ONCE A VERSION, AND KEPT: a published version never changes (`from-packs.mjs`), so its
 * widgets are the same every time the sheet opens. Kept for each shelf a host hands in.
 */
const shelfWidgets = new WeakMap<CatalogueShelf, Map<string, Promise<ShippedWidget[]>>>();
function publishedWidgets(shelf: CatalogueShelf, id: string, version: string): Promise<ShippedWidget[]> {
  let kept = shelfWidgets.get(shelf);
  if (kept === undefined) shelfWidgets.set(shelf, (kept = new Map()));
  const key = `${id}@${version}`;
  let got = kept.get(key);
  if (got === undefined) {
    got = shelf
      .fetch(id)
      .then((out) => (out !== null && out.ok ? filledWidgets(out.value.doc) : []))
      .catch(() => []);
    kept.set(key, got);
  }
  return got;
}

/** A list's fields as a widget rule reads them: each field's id, and the list a link points at. */
type Shape = { id: string; fields: readonly { id: string; type?: string; to?: string }[] };
const has = (l: Shape, id: string): boolean => l.fields.some((f) => f.id === id);
const linkOf = (l: Shape | undefined, id: string): string | null => l?.fields.find((f) => f.id === id && typeof f.to === 'string')?.to ?? null;

/**
 * THE LEDGER AND THE TO-DO LIST, FOUND BY WHAT THEIR ROWS HOLD AND NOT BY NAME (SHL-A22): the two lists `composeWidget`'s
 * rules read. A ledger's rows have a day `on`, an `amount`, a `direction` and a `category` or a `party`; a to-do list's
 * have `what`, `by` and a link `thing` to the projects. The first readable list of each shape, or `undefined`.
 */
export function ledgerOf(lists: readonly Shape[]): Shape | undefined {
  return lists.find((l) => has(l, 'on') && has(l, 'amount') && has(l, 'direction') && (has(l, 'category') || has(l, 'party')));
}
export function todoOf(lists: readonly Shape[]): Shape | undefined {
  return lists.find((l) => has(l, 'what') && has(l, 'by') && linkOf(l, 'thing') !== null);
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, readable, no, clock } = deps;

  /* ONLY THE ROWS THIS CALLER IS SHOWN NAME A CHOICE: a person shared one project reads `things`, and the names of the
     projects not shared with them are not theirs to be offered (leak matrix P1). */
  const seen = <T extends { id: string }>(ctx: CallContext, register: string, rows: readonly T[]): T[] => {
    const ok = deps.sight.admitted(ctx, register, rows.map((r) => r.id));
    return rows.filter((r) => ok.has(r.id));
  };

  /**
   * THE CATALOGUE, EACH TIME IT IS ASKED (§6.5): the core's, this build's own modules' and starters', the widgets every
   * add-on the record holds ships, read off the manifests it keeps (an add-on switched off ships nothing, and one installed
   * a moment ago is in the sheet at once), and those the host's catalogue says an add-on it does not hold would bring.
   */
  const catalogue = async (): Promise<{ all: WidgetTemplate[]; byId: (id: string) => WidgetTemplate | undefined; addonName: (id: string) => string }> => {
    const own = new Set(SEEDED.map((s) => s.by.id));
    const held = sql.all<{ id: string; manifest: string }>('SELECT id, manifest FROM pack WHERE disabled_at IS NULL ORDER BY id').flatMap((p) => {
      if (own.has(p.id)) return [];
      try {
        const m = JSON.parse(p.manifest) as { title?: unknown; widgets?: unknown; config?: unknown; config_values?: unknown };
        const title = typeof m.title === 'string' && m.title.trim() !== '' ? m.title : p.id;
        return [{ by: { id: p.id, title }, widgets: filledWidgets(m) }];
      } catch {
        return [];
      }
    });
    const heldById = new Map(held.map((h) => [h.by.id, h] as const));
    const published: Shipping[] = [];
    const shelf = deps.catalogueShelf;
    if (shelf !== undefined) {
      const listed = await shelf.listed().catch(() => []);
      for (const e of listed) {
        if (e.kind !== 'pack' || (e.widgets?.length ?? 0) === 0 || own.has(e.id)) continue;
        const h = heldById.get(e.id);
        /* HELD AND SHIPPING ITS OWN: the record's copy is the one its settings were chosen for. */
        if (h !== undefined && h.widgets.length > 0) continue;
        const widgets = await publishedWidgets(shelf, e.id, e.version);
        if (widgets.length > 0) published.push({ by: { id: e.id, title: h?.by.title ?? e.title }, widgets });
      }
    }
    const packs = [...SEEDED, ...[...held.filter((h) => h.widgets.length > 0), ...published].sort((a, b) => (a.by.id < b.by.id ? -1 : a.by.id > b.by.id ? 1 : 0))];
    const all = withShipped(packs);
    const map = new Map(all.map((t) => [t.id, t] as const));
    const names = new Map([...packs, ...held].map((p) => [p.by.id, p.by.title] as const));
    return { all, byId: (id) => map.get(id), addonName: (id) => names.get(id) ?? id };
  };

  /** The caller's person, whose preferences and questions these are, or `null` for a share or a host. */
  const personOf = (ctx: CallContext): string | null => (ctx.principal.kind === 'person' ? ctx.principal.id : ctx.principal.kind === 'token' ? ((ctx.principal as { person?: string }).person ?? null) : null);

  /** What the record holds, as the catalogue's needs read it: the lists this caller reads, the figures, the add-ons. */
  const holds = (ctx: CallContext) => {
    const lists = new Set([...kernel.registers()].map(([id]) => id).filter((id) => readable(ctx, id) === null));
    const decls = kernel.declarations();
    const figures = new Set(decls.filter((d) => d.kind === 'metric').map((d) => d.id.replace(/^metric\./u, '')));
    const addons = new Set(decls.flatMap((d) => (typeof d.pack_id === 'string' && d.pack_id !== '' ? [d.pack_id] : [])));
    return { lists, figures, addons };
  };

  /**
   * THE NAMES A BLANK CAN BE FILLED WITH, read as each blank declares them (`from`): the rows of its list its filter lets
   * through, in its order, drawn by `previewPage` so a reader is offered only the rows they see, each named by its field,
   * once, at most eight. A blank that brings its last day (`until`, a trip's end) and its first (`starts`) carries them
   * beside its names, in the same order (`<blank>_until`, `<blank>_starts`). A name with a quote in it is left out: a
   * widget finds its row by name, written in quotes. The currency most asked after, the dollar, goes first where kept.
   */
  const choicesOf = async (ctx: CallContext, lists: ReadonlySet<string>, templates: readonly WidgetTemplate[]): Promise<Record<string, string[]>> => {
    const out: Record<string, string[]> = {};
    const asked = new Map<string, NonNullable<WidgetTemplate['blanks']>[number]>();
    for (const t of templates)
      for (const b of t.blanks ?? []) {
        const list = b.from?.source.startsWith('register.') ? b.from.source.slice('register.'.length) : null;
        if (b.from !== undefined && list !== null && lists.has(list) && !asked.has(b.id)) asked.set(b.id, b);
      }
    if (asked.size === 0 || deps.previewAs === undefined) return out;
    const blanks = [...asked.values()];
    const blocks = blanks.map((b) => {
      const f = b.from!;
      return {
        kind: 'table',
        source: f.source,
        ...(f.where !== undefined ? { where: f.where } : {}),
        ...(f.order !== undefined ? { order: f.order } : {}),
        columns: [f.field, ...(f.until ? [f.until] : []), ...(f.starts ? [f.starts] : [])].map((field) => ({ field })),
        limit: CHOICES_READ,
      };
    });
    const drawn = await drawAll(blocks, ctx);
    blanks.forEach((b, i) => {
      const f = b.from!;
      const d = drawn[i];
      const rows = isBag(d) && Array.isArray(d.rows) ? (d.rows as unknown[]) : [];
      const names: string[] = [];
      const until: string[] = [];
      const starts: string[] = [];
      for (const r of rows) {
        const fields = isBag(r) && isBag(r.fields) ? r.fields : null;
        const name = fields?.[f.field];
        if (typeof name !== 'string' || name.trim() === '' || name.includes('"') || names.includes(name)) continue;
        const day = (field: string | undefined): string => (field !== undefined && typeof fields?.[field] === 'string' ? String(fields[field]).slice(0, 10) : '');
        if (f.until !== undefined && day(f.until) === '' && day(f.starts) === '') continue;
        names.push(name);
        until.push(day(f.until) || day(f.starts));
        starts.push(day(f.starts));
        if (names.length >= CHOICES_MOST) break;
      }
      /* THE DOLLAR FIRST WHERE IT IS KEPT: "what a dollar is worth" is the rate most asked. */
      if (b.id === 'currency' && names.includes('USD')) names.splice(0, names.length, 'USD', ...names.filter((c) => c !== 'USD'));
      out[b.id] = names;
      if (f.until !== undefined) out[`${b.id}_until`] = until;
      if (f.starts !== undefined) out[`${b.id}_starts`] = starts;
    });
    return out;
  };

  /**
   * What a sentence may name, for the rules: the projects, the categories and the payees, each the list a link of the
   * to-do list or the ledger points at (`ledgerOf`, `todoOf`), and the currencies as the blanks have them.
   */
  const choicesFor = (ctx: CallContext, lists: ReadonlySet<string>, choices: Record<string, string[]>): Omit<ComposeChoices, 'lists' | 'figures'> => {
    const shapes = [...kernel.registers().values()].filter((r) => lists.has(r.id)) as unknown as Shape[];
    const ledger = ledgerOf(shapes);
    const todo = todoOf(shapes);
    const names = (register: string | null): string[] =>
      register !== null && lists.has(register)
        ? [
            ...new Set(
              seen(ctx, register, sql.all<{ id: string; n: string | null }>(`SELECT id, json_extract(fields, '$.name') AS n FROM entry WHERE register = ? AND deleted_at IS NULL`, register))
                .flatMap((r) => (typeof r.n === 'string' && r.n.trim() !== '' ? [r.n] : [])),
            ),
          ].slice(0, 200)
        : [];
    return {
      projects: names(linkOf(todo, 'thing')),
      currencies: choices.currency ?? [],
      categories: names(linkOf(ledger, 'category')),
      payees: names(linkOf(ledger, 'party')),
      ...(ledger !== undefined ? { ledger: ledger.id } : {}),
      ...(todo !== undefined ? { todo: todo.id } : {}),
    };
  };

  /** A template's blanks filled with the first of each one's choices. */
  const filledOf = (t: WidgetTemplate, choices: Record<string, string[]>): Record<string, string> =>
    Object.fromEntries(
      (t.blanks ?? []).flatMap((b) => [b.id, `${b.id}_until`].flatMap((k) => (choices[k]?.[0] !== undefined ? [[k, choices[k]![0]!]] : []))),
    );

  /** A template's blanks' last days, by blank and choice, or nothing where no blank brings one. */
  const untilsOf = (t: WidgetTemplate, choices: Record<string, string[]>): { untils?: Record<string, Record<string, string>> } => {
    const untils = Object.fromEntries(
      (t.blanks ?? []).flatMap((b) => {
        const days = choices[`${b.id}_until`];
        return days ? [[b.id, Object.fromEntries((choices[b.id] ?? []).map((name, i) => [name, days[i] ?? ''] as const).filter(([, d]) => d !== ''))] as const] : [];
      }),
    );
    return Object.keys(untils).length > 0 ? { untils } : {};
  };

  /** Each block drawn by `previewPage`, in order, or `null` where the record would not draw it. */
  const drawAll = async (blocks: readonly Bag[], ctx: CallContext): Promise<(unknown | null)[]> => {
    const preview = deps.previewAs!;
    const out: (unknown | null)[] = [];
    for (let at = 0; at < blocks.length; at += GALLERY_BATCH) {
      const batch = blocks.slice(at, at + GALLERY_BATCH);
      const whole = await preview({ body: { page: 'widget-gallery', title: 'Widgets', blocks: batch } }, ctx);
      if (whole.ok && isBag(whole.value) && Array.isArray(whole.value.blocks) && whole.value.blocks.length === batch.length) {
        out.push(...(whole.value.blocks as unknown[]));
        continue;
      }
      /* REFUSED WHOLE: each on its own, so one the record cannot draw costs only itself. */
      for (const block of batch) {
        const one = await preview({ body: { page: 'widget-gallery', title: 'Widgets', blocks: [block] } }, ctx);
        out.push(one.ok && isBag(one.value) && Array.isArray(one.value.blocks) ? (one.value.blocks[0] ?? null) : null);
      }
    }
    return out;
  };

  /**
   * What fills a widget the record cannot draw yet, said plainly: its own sentence where it declares one (an add-on every
   * record starts with fills in by being used), else the add-on that brings it, else keeping what it shows.
   */
  const needSaid = (t: WidgetTemplate, addons: ReadonlySet<string>, addonName: (id: string) => string = (id) => id): string => {
    if (t.fills !== undefined) return t.fills;
    const addon = t.needs.addon;
    if (addon !== undefined && !addons.has(addon)) return `Comes with ${addonName(addon)}.`;
    return 'Fills in once you start keeping what it shows.';
  };

  /** The offers this caller would be shown, strongest first, with each one's block filled at its size. */
  const offersFor = async (ctx: CallContext, board: readonly BoardRead[], cell: boolean): Promise<WidgetOffer[]> => {
    const person = personOf(ctx);
    if (person === null || deps.readsEveryList?.(ctx) === false) return [];
    const prefs = kernel.prefsOf(person) as Bag;
    if (prefs['pen.suggest'] === false) return [];
    const { lists, figures, addons } = holds(ctx);
    const cat = await catalogue();
    const choices = await choicesOf(ctx, lists, cat.all);
    /* HOW MANY ROWS FALL DUE AS EACH WIDGET THAT DECLARES `due` COUNTS THEM ("bills this week"): one row asked of each, and
       the count it matched, all in one read. */
    const dues = new Map<string, number>();
    const counting = cat.all.filter((t) => t.due !== undefined && typeof t.block.source === 'string' && needsMet(t, { lists, figures }));
    if (deps.previewAs !== undefined && counting.length > 0) {
      const out = await deps.previewAs(
        { body: { page: 'widget-signals', title: 'Signals', blocks: counting.map((t) => ({ kind: 'table', source: t.block.source, where: t.due!.where, columns: [{ field: 'title' }], limit: 1 })) } },
        ctx,
      );
      const blocks = out.ok && isBag(out.value) && Array.isArray(out.value.blocks) ? (out.value.blocks as unknown[]) : [];
      counting.forEach((t, i) => {
        const b = blocks[i];
        if (isBag(b) && typeof b.matched === 'number') dues.set(t.id, b.matched);
      });
    }
    const read: SignalRead = { sql, nowMs: clock.now(), person, lists, figures, addons, dues, board, templates: cat.all, addonName: cat.addonName };
    const pages = new Map((deps.pagesNow?.() ?? kernel.pages()).map((p) => [String((p as { page?: unknown }).page ?? ''), String((p as { title?: unknown }).title ?? '')] as const));
    const signals = widgetSignals(read, pages, choices.project ?? []);
    /* THE RECORD'S DAY, IN ITS OWN ZONE (AH22). */
    const today = dayIn(clock.now(), kernel.identity()?.tz);
    const values = (s: WidgetSignal): Record<string, string> => (s.blank ? { [s.blank.id]: s.blank.value } : (() => {
      const t = cat.byId(s.widget);
      return t ? filledOf(t, choices) : {};
    })());
    const ranked = widgetOffers(signals, heldOf(prefs), today, onBoardOf(board, values, cat.byId), cell).slice(0, cell ? CELL_TRIES : undefined);
    const filledFor = new Map<string, Record<string, string>>();
    const offers = ranked.flatMap((r): WidgetOffer[] => {
      if (r.remove !== undefined)
        return [{ key: r.key, widget: r.widget, title: 'Take it off Today', why: r.why, size: 'small', block: {}, signal: r.signal, score: r.score, remove: r.remove }];
      const t = cat.byId(r.widget);
      if (t === undefined) return [];
      const filled = values(r);
      const block = widgetBlock(t, t.size, filled);
      filledFor.set(r.key, filled);
      return [
        {
          key: r.key,
          widget: t.id,
          title: r.blank ? `${t.title}: ${r.blank.value}` : t.title,
          why: r.why,
          size: t.size,
          block,
          signal: r.signal,
          score: Math.round(r.score * 100) / 100,
          ...(r.asked !== undefined ? { asked: r.asked } : {}),
          ...(r.signal === 'S1' && (t.asked ?? []).length > 0 ? { asks: t.asked!.map((a) => a.match) } : {}),
        },
      ];
    });
    /* EACH ONE DRAWN SMALL ON THE RECORD'S OWN DATA, in one read, so the cell shows the real widget and not a promise. */
    const adding = offers.filter((o) => o.remove === undefined);
    if (deps.previewAs !== undefined && adding.length > 0) {
      const drawn = await drawAll(adding.map((o) => o.block), ctx);
      adding.forEach((o, i) => {
        const t = cat.byId(o.widget);
        if (t !== undefined && drawn[i] !== null && drawn[i] !== undefined) o.reading = distill(t, drawn[i], { now: clock.now() });
        /* OFFERED AT THE SIZE ITS ROWS FILL (`fittedSize`): one person to get back to is a Wide row, not a Tall box. */
        const fit = t === undefined ? o.size : fittedSize(t.sizes, o.size, o.reading);
        if (t !== undefined && fit !== o.size) {
          o.size = fit;
          o.block = widgetBlock(t, fit, filledFor.get(o.key) ?? {});
        }
      });
    }
    /* TODAY'S ONE CELL SHOWS THE FIRST THAT DRAWS SOMETHING (recheck of 30 October): the cell hides a widget whose reading
       holds no figure and no line, so the day's one suggestion drawing nothing left the cell empty all day. The next is
       read in the same draw, never more than `CELL_TRIES`. */
    if (cell) {
      const shown = offers.find((o) => o.remove !== undefined || !blankReading(o.reading));
      return shown === undefined ? [] : [shown];
    }
    return offers;
  };

  return {
    async widgetGallery(args: { group?: unknown; q?: unknown; board?: unknown; addon?: unknown }, ctx: CallContext): Promise<Result<GalleryAnswer>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Bag;
      for (const k of Object.keys(said))
        if (k !== 'group' && k !== 'q' && k !== 'board' && k !== 'addon') return no('VALUE_MALFORMED', `widgetGallery takes group, q, board and addon, and not ${k}.`, { at: k });
      if (said.addon !== undefined && (typeof said.addon !== 'string' || !/^[a-z][a-z0-9-]{0,62}$/u.test(said.addon)))
        return no('VALUE_MALFORMED', 'addon is the id of one plugin, for the widgets it brings.', { at: 'addon' });
      if (said.group !== undefined && !(WIDGET_GROUPS as readonly unknown[]).includes(said.group))
        return no('VALUE_MALFORMED', `group is one of ${WIDGET_GROUPS.join(', ')}.`, { at: 'group', allowed: [...WIDGET_GROUPS] });
      if (said.q !== undefined && (typeof said.q !== 'string' || said.q.length > GALLERY_Q_MOST))
        return no('VALUE_MALFORMED', `q is what was typed in the search, at most ${GALLERY_Q_MOST} characters.`, { at: 'q' });
      if (deps.previewAs === undefined) return no('NOT_IN_THIS_BUILD', 'This host draws no widget previews yet.', { at: 'group' });
      const group = said.group as WidgetGroup | undefined;
      const q = typeof said.q === 'string' ? said.q : '';
      const { lists, figures, addons } = holds(ctx);
      const cat = await catalogue();
      const choices = await choicesOf(ctx, lists, cat.all);
      const addonOnly = typeof said.addon === 'string' ? said.addon : undefined;
      const shown = cat.all.filter((t) => (group === undefined || t.group === group) && (addonOnly === undefined || t.needs.addon === addonOnly) && widgetMatches(t, q));
      const ready = shown.filter((t) => needsMet(t, { lists, figures }) && (t.blanks ?? []).every((b) => (choices[b.id]?.length ?? 0) > 0));
      const filled = new Map(shown.map((t) => [t.id, filledOf(t, choices)] as const));
      const drawn = await drawAll(
        ready.map((t) => widgetBlock(t, t.size, filled.get(t.id)!)),
        ctx,
      );
      const readings = new Map(ready.map((t, i) => [t.id, drawn[i] === null || drawn[i] === undefined ? null : distill(t, drawn[i], { now: clock.now() })] as const));
      const onBoard = boardOf(said.board);
      const widgets: GalleryWidget[] = shown.map((t) => {
        const isReady = readings.has(t.id);
        const reading = readings.get(t.id) ?? null;
        /* AND IN THE GALLERY, A LIST STARTS AT THE SIZE ITS ROWS FILL, as the suggestion does (`fittedSize`). */
        const size = fittedSize(t.sizes, t.size, reading);
        const block = widgetBlock(t, size, filled.get(t.id)!);
        /* A WIDGET THAT FILLS IN BY BEING USED IS NOBODY'S TO ADD (`fills`): no add-on is named for it. */
        const addon = t.needs.addon !== undefined && t.fills === undefined ? { id: t.needs.addon, name: cat.addonName(t.needs.addon) } : null;
        return {
          id: t.id,
          title: t.title,
          says: t.says,
          group: t.group,
          for: t.for,
          icon: t.icon,
          sizes: [...t.sizes],
          size,
          block,
          filled: filled.get(t.id)!,
          ...((): Partial<GalleryWidget> => {
            const on = onBoardAs(block, onBoard, t.alike);
            if (on === null) return {};
            return on.heading !== undefined && on.heading !== '' && on.heading.toLowerCase() !== t.title.toLowerCase() ? { onBoard: true, onBoardAs: on.heading } : { onBoard: true };
          })(),
          choices: Object.fromEntries((t.blanks ?? []).map((b) => [b.id, choices[b.id] ?? []])),
          /* EACH CHOICE'S LAST DAY, where a blank brings one (a trip), so picking another trip moves its day (`chosenWith`). */
          ...untilsOf(t, choices),
          addon,
          ready: isReady && reading !== null,
          need: isReady && reading !== null ? null : needSaid(t, addons, cat.addonName),
          reading,
          example: t.example,
          ...(t.words !== undefined ? { words: [...t.words] } : {}),
          template: { block: { ...t.block }, ...(t.blanks !== undefined ? { blanks: [...t.blanks] } : {}), ...(t.rows !== undefined ? { rows: t.rows } : {}) },
        };
      });
      const suggested = addonOnly !== undefined ? [] : await offersFor(ctx, boardOf(said.board), false).catch(() => []);
      return { ok: true, value: { widgets, suggested } };
    },

    /**
     * `{ said, from?, not? }`: a widget made from what the person said (§5.7), as a draft, drawn, and nothing written.
     * RULES FIRST (`composeWidget`, over the record's own projects, categories, payees and currencies), and a block the
     * record draws without a refusal is the answer; only a line the rules cannot read, or one whose block the record
     * refused, is asked of the model, and that costs an ask and says so. `from` is a widget to change rather than make
     * (the inspector's "Change it by saying it"), which the model is handed; `not` is what was turned down, for Try again.
     * The answer carries the block with its `draft` mark `{ by, why, cost? }`, the size it starts at, and its reading.
     */
    async widgetCompose(args: { said?: unknown; from?: unknown; not?: unknown; draw?: unknown; sizes?: unknown }, ctx: CallContext): Promise<Result<WidgetComposed>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Bag;
      for (const k of Object.keys(a))
        if (!['said', 'from', 'not', 'draw', 'sizes'].includes(k)) return no('VALUE_MALFORMED', `widgetCompose takes said, from, not, draw and sizes, and not ${k}.`, { at: k });
      if (a.draw !== undefined && typeof a.draw !== 'boolean') return no('VALUE_MALFORMED', 'draw is true to have the widget drawn rather than made from the grammar.', { at: 'draw' });
      if (a.sizes !== undefined && (!Array.isArray(a.sizes) || a.sizes.length === 0 || !a.sizes.every(isWidgetSize)))
        return no('VALUE_MALFORMED', 'sizes are the frames a drawn widget draws at: small, wide, tall, large or full.', { at: 'sizes' });
      const drawing = a.draw === true;
      const frames = (Array.isArray(a.sizes) ? a.sizes : ['wide']) as WidgetSize[];
      if (typeof a.said !== 'string' || a.said.trim() === '' || a.said.length > 300) return no('REQUIRED_MISSING', 'said is what you want to see, in a few words, at most 300 characters.', { at: 'said' });
      if (a.from !== undefined && (!isBag(a.from) || typeof a.from.kind !== 'string')) return no('VALUE_MALFORMED', 'from is the widget to change, a block with its kind.', { at: 'from' });
      if (a.not !== undefined && !Array.isArray(a.not)) return no('VALUE_MALFORMED', 'not is the blocks turned down, for Try again.', { at: 'not' });
      const said = a.said.trim();
      const { lists, figures } = holds(ctx);
      const turned = new Set((Array.isArray(a.not) ? a.not : []).map((b) => JSON.stringify(b)));
      const draw = async (block: Bag): Promise<{ drawn: unknown | null; fix: string | null }> => {
        if (deps.previewAs === undefined) return { drawn: null, fix: null };
        const out = await deps.previewAs({ body: { page: 'widget-draft', title: 'Widget', blocks: [block] } }, ctx);
        if (!out.ok) return { drawn: null, fix: 'refusal' in out ? (out.refusal as { fix: string }).fix : null };
        const drawn = isBag(out.value) && Array.isArray(out.value.blocks) ? (out.value.blocks[0] ?? null) : null;
        const refused = isBag(drawn) && Array.isArray(drawn.refusals) && drawn.refusals.length > 0 ? String((drawn.refusals[0] as Bag).fix ?? '') : null;
        return { drawn, fix: refused };
      };
      const readingOf = (block: Bag, drawn: unknown): WidgetReading | null => (drawn === null ? null : distill(((r) => (r === undefined ? { block } : { block, rows: r }))(rowsReadOf(block)), drawn, { now: clock.now() }));

      /* THE RULES, unless this changes a widget, the rules' answer was turned down, or it is to be drawn. */
      if (a.from === undefined && !drawing) {
        const cat = await catalogue();
        const blanks = await choicesOf(ctx, lists, cat.all);
        const choices: ComposeChoices = { ...choicesFor(ctx, lists, blanks), lists, figures };
        const made = composeWidget(said, choices, cat.all);
        if (made !== null && !turned.has(JSON.stringify(stripDraft(made.block)))) {
          const { drawn, fix } = await draw(made.block);
          if (fix === null)
            return ok({ block: { ...made.block, draft: { by: 'Slash', why: said } }, size: made.size, title: made.title, from: 'rules', reading: readingOf(made.block, drawn) });
        }
      }

      /* A CATALOGUE WIDGET IT NAMES THAT AN ADD-ON BRINGS, on a record without the add-on: said, not guessed at. */
      const cat = await catalogue();
      const named = a.from === undefined ? cat.byId(askedWidget(said, cat.all) ?? '') : undefined;
      if (named !== undefined && !needsMet(named, { lists, figures }) && named.needs.addon !== undefined && named.fills === undefined)
        return no('PACK_REQUIRED', `${named.title} comes with ${cat.addonName(named.needs.addon)}. Add it from Plugins, then ask again.`, { at: 'said' });

      /* THE MODEL, an owner's in a browser, as Slash's drafting is. */
      const described = deps.slashDescribed;
      if (described === undefined || deps.admin(ctx, 'ask Slash to make a widget') !== null)
        return no('NOT_IN_THIS_BUILD', 'That is not one the rules can make, and the model cannot be asked here. Try naming a list, a project or a category.', { at: 'said' });
      const from = isBag(a.from) ? stripDraft(a.from) : null;
      /* TRY AGAIN ON A DRAFT WHOSE WORDS ARE A REASON, NOT A REQUEST ("You check Software spend most mornings", as an
         agent says why): the rules cannot read it, so the model is handed the widget turned down beside the reason, and
         makes another way of showing the same thing. */
      const tried = Array.isArray(a.not) ? (a.not as unknown[]).filter(isBag).at(-1) : undefined;
      const asked = drawing
        ? drawWidgetAsk(said, frames)
        : from === null && tried !== undefined
        ? `Make one widget for Today that shows what this one shows, a different way. It was made because: ${said}. The one turned down: ${JSON.stringify(stripDraft(tried))}`
        : from
        ? `Change this one widget on Today, keeping it one block, so that: ${said}. The widget now: ${JSON.stringify(from)}`
        : `Make one widget for Today, a single block in the page grammar over the lists this BrainDog keeps, that shows: ${said}`;
      const not: SlashDeclined[] = [...turned].slice(0, 3).map((b) => ({ change: { to: { id: 'page.widget-draft', kind: 'page', body: { page: 'widget-draft', title: 'Widget', blocks: [JSON.parse(b)] } } } }) as unknown as SlashDeclined);
      const got = await described(
        { asked, page: 'widget-draft', body: { page: 'widget-draft', title: 'Widget', blocks: from ? [from] : [] }, ...(not.length > 0 ? { not } : {}) },
        ctx,
        previewerOf(this, ctx) as SlashPreviewer | null,
      );
      if (!got.ok) return got as Result<never>;
      const block = firstBlock(got.value);
      if (block === null) return no('PROPOSAL_SCHEMA', 'Slash could not make a widget from that. Say it another way, naming what it reads.', { at: 'said' });
      const { drawn, fix } = await draw(block);
      if (fix !== null) return no('PROPOSAL_SCHEMA', `Slash made one BrainDog could not draw: ${fix}`, { at: 'said' });
      const cost = got.value.cost?.said;
      if (drawing && block.kind !== 'drawn') return no('PROPOSAL_SCHEMA', 'Slash made a widget but did not draw it. Ask again, or use Make it.', { at: 'said' });
      const size: WidgetSize = drawing ? frames[0]! : isWidgetSize(block.size) ? block.size : 'wide';
      const { size: _s, ...rest } = block;
      return ok({
        block: { ...rest, draft: { by: 'Slash', why: said, ...(cost ? { cost } : {}) } },
        size,
        title: typeof block.heading === 'string' ? block.heading : 'Your widget',
        from: 'model',
        reading: readingOf(rest, drawn),
        ...(cost ? { cost } : {}),
        ...(drawing ? { sizes: frames } : {}),
      });
    },

    async widgetSuggest(args: { board?: unknown; cell?: unknown }, ctx: CallContext): Promise<Result<{ offers: WidgetOffer[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Bag;
      for (const k of Object.keys(said)) if (k !== 'board' && k !== 'cell') return no('VALUE_MALFORMED', `widgetSuggest takes board and cell, and not ${k}.`, { at: k });
      if (said.cell !== undefined && typeof said.cell !== 'boolean') return no('VALUE_MALFORMED', 'cell is true for the one offer Today shows at its end.', { at: 'cell' });
      if (said.board !== undefined && !Array.isArray(said.board)) return no('VALUE_MALFORMED', "board is the board's widgets, each with its key, source and whether it drew nothing.", { at: 'board' });
      const offers = await offersFor(ctx, boardOf(said.board), said.cell === true);
      return { ok: true, value: { offers: said.cell === true ? offers.slice(0, 1) : offers } };
    },
  };
}

/** Days since a `YYYY-MM-DD` day, for tests and the sheet's lines. */
export const daysSince = (day: string, nowMs: number): number => Math.floor((nowMs - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
