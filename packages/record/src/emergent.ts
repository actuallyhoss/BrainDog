/**
 * The holding pen: the pages a record would draw for a list if somebody asked, answered on `boot` and placed by nobody
 * (`29 §2`, `loop/finish/contracts.md` §7.4).
 *
 * PROPOSE, DO NOT PLACE. `29 §3`'s T1 fires when a list holds a row and no page reads it, and T6 puts a figure whose
 * `source` is that list at the top of what it proposes. What comes back is a whole page declaration a person can look at
 * (`previewChange`) and keep (the owner's `setDeclaration`), and nothing is written until they do. The nav it carries is
 * an offer too: the end of the list's own section, so accepting it appends to a section and never moves anything that
 * is already there (`29 §4`, WCAG 2.2 SC 3.2.3).
 *
 * IN THE RECORD, AND NOT IN THE KERNEL OR THE BROWSER. The kernel holds no page declaration of its own
 * (`no-declarations-in-kernel`), and a pen worked out in the browser was a second engine that read the sample's pages
 * and never the record's. The bodies are built here from the declarations the record already holds, and each passes
 * `kernel.lint` before it is answered, so an item offered is an item that can be kept.
 *
 * A DISMISSAL IS TERMINAL ON EVERY DEVICE, because it is the person's `pen.dismissed` preference in the record and an
 * id in it is never answered again (`29 §4`: "A proposal that returns is worse than one that never appeared").
 *
 * `kind: 'block'` and `kind: 'column'` join `kind: 'page'` under the same `PenItem` (PGS-17). A block item is the block
 * a list's shape asks for on a page that draws the list without it: a calendar for a day, a gallery for pictures, a
 * path for a list of steps, a board for a state of three to seven values, and lines for a number recorded over time.
 * A column item is `29 §3`'s T5: a field filled on at least 80% of at least 20 rows, offered to the page's first table
 * over that list. Each changes a page somebody already has, so each is the page's whole declaration with one thing
 * added at the end, and nothing on it moved.
 */

import type { Declaration, Json, Kernel, RegisterDecl } from '@braindog/kernel';

/** One thing the pen offers, and the whole declaration accepting it would write. */
export type PenItem = {
  /**
   * The dismissal signature, which is also how the item is told apart from every other: `page:<list>`,
   * `block:<page>:<kind>:<list>` or `column:<page>:<block>:<field>`.
   */
  id: string;
  kind: 'page' | 'block' | 'column';
  /** The list the item grew out of. */
  register: string;
  /** What the item is called on the screen: for a page, the list's name. */
  title: string;
  /** One sentence in the record's words, saying why it is offered. */
  why: string;
  /** What accepting it writes: a whole declaration, never a patch. */
  change: { to: { id: string; kind: string; body: Record<string, Json> } };
};

/** The most items the pen answers, strongest first; the rest wait until one is kept or dismissed (`29 §4` (b) 3). */
export const PEN_MOST = 24;
/** The most figures a proposed page opens with (`29 §5`, Figures). */
export const PEN_FIGURES_MOST = 3;
/** The most columns a proposed page's table draws. */
export const PEN_COLUMNS_MOST = 6;
/** The rows a proposed page's table draws. */
export const PEN_ROWS_DRAWN = 50;
/** The most dismissals a person's `pen.dismissed` keeps; past it the oldest is let go first. */
export const PEN_DISMISSED_MOST = 500;

/**
 * THE FIELD TYPES A PROPOSED TABLE NEVER DRAWS AS A COLUMN. A `secret` is revealed deliberately and audited, never by a
 * page nobody wrote (`29 §5`: a header with a secret field has no primary action for the same reason); a `document` or
 * `json` value is not a cell, and a `list` is many.
 */
const NOT_A_COLUMN: ReadonlySet<string> = new Set(['secret', 'document', 'json', 'list']);

/** The byte ceilings the page check holds a nav section and an empty sentence to (`kernel/src/declare.ts`). */
const SECTION_BYTES = 40;
const EMPTY_BYTES = 200;
/** The highest nav order the page check admits. */
const ORDER_MOST = 9999;

/** An installed page, as `kernel.pages()` answers it: the slug it holds, the lists it reads and where it sits. */
export type PenPage = { slug: string; registers: readonly string[]; nav: { section: string; order: number } | null };

export type PenDeps = {
  kernel: Pick<Kernel, 'registers' | 'count' | 'declarations' | 'lint' | 'list'>;
  /** Whether the caller reads this list: `readable(ctx, id) === null`. */
  reads: (register: string) => boolean;
  /** Every installed page, whatever the caller may open, because a slug is taken and a list is read either way. */
  pages: readonly PenPage[];
  /** The person's `pen.dismissed`. */
  dismissed: ReadonlySet<string>;
};

const bytes = (text: string): number => new TextEncoder().encode(text).length;

/** The text, cut by whole characters until it fits in `most` bytes, or `null` when nothing of it is left. */
const fit = (text: string, most: number): string | null => {
  let out = text.trim();
  while (out !== '' && bytes(out) > most) out = [...out].slice(0, -1).join('').trimEnd();
  return out === '' ? null : out;
};

/** A field's words: its label, else its id with `_` as a space, as the kernel reads an unlabelled field (`coerce.ts`). */
const labelOf = (field: { id: string; label?: string | undefined }): string => {
  const said = typeof field.label === 'string' && field.label.trim() !== '' ? field.label.trim() : field.id.replace(/_/gu, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
};

/**
 * The figures whose `source` is each list, by list, in the order a record ranks its own figures: Home's first by their
 * place, then the rest by id.
 *
 * A FIGURE THAT TAKES A PARAMETER IS LEFT OUT. Its `where` names `{{it}}`, which only the page that fills it can say, so
 * a cell naming it bare would draw a refusal where a number was promised.
 */
function figuresByList(declared: readonly { kind: string; body: string }[], wanted: ReadonlySet<string>): Map<string, string[]> {
  const found = new Map<string, { id: string; home: number }[]>();
  for (const row of declared) {
    if (row.kind !== 'metric' || row.body.includes('{{')) continue;
    let body: { metric?: unknown; source?: unknown; home?: unknown };
    try {
      body = JSON.parse(row.body) as typeof body;
    } catch {
      continue;
    }
    if (typeof body.metric !== 'string' || typeof body.source !== 'string' || !body.source.startsWith('register.')) continue;
    const list = body.source.slice('register.'.length);
    if (!wanted.has(list)) continue;
    const home = typeof body.home === 'number' ? body.home : Number.POSITIVE_INFINITY;
    found.set(list, [...(found.get(list) ?? []), { id: body.metric, home }]);
  }
  return new Map(
    [...found].map(([list, figures]) => [
      list,
      figures
        .sort((a, b) => a.home - b.home || a.id.localeCompare(b.id))
        .slice(0, PEN_FIGURES_MOST)
        .map((f) => f.id),
    ]),
  );
}

/**
 * The pen's `kind: 'page'` items: one for each list the caller reads that holds a row and that no installed page reads,
 * strongest first (the most rows), at most `PEN_MOST`, and none whose id the person dismissed.
 *
 * THE WALK IS ONE PASS OVER THE LISTS THE RECORD HOLDS, a row count each (`kernel.count`, which `boot` already asks of
 * every list), then one read of the declarations for the figures and the slugs, taken only when a list qualified, and
 * one lint of the whole answer. Only when that lint refuses is each item linted alone, so at most `PEN_MOST` more.
 */
function pagesOffered(deps: PenDeps): PenItem[] {
  const { kernel, reads, pages, dismissed } = deps;
  const readByAPage = new Set(pages.flatMap((p) => p.registers));

  const waiting: { id: string; name: string; rows: number; decl: RegisterDecl }[] = [];
  for (const [id, decl] of kernel.registers()) {
    if (readByAPage.has(id) || dismissed.has(`page:${id}`) || !reads(id)) continue;
    const rows = kernel.count(id);
    if (rows > 0) waiting.push({ id, name: decl.name, rows, decl });
  }
  if (waiting.length === 0) return [];
  waiting.sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));

  const declared = kernel.declarations();
  const taken = new Set([...pages.map((p) => p.slug), ...declared.filter((d) => d.kind === 'page').map((d) => d.id.slice('page.'.length))]);
  const figures = figuresByList(declared, new Set(waiting.map((w) => w.id)));
  /* THE END OF EACH SECTION, as the installed pages hold it, so a page accepted into one lands after the last of them. */
  const lastIn = new Map<string, number>();
  for (const p of pages) if (p.nav) lastIn.set(p.nav.section, Math.max(lastIn.get(p.nav.section) ?? 0, p.nav.order));

  const items: PenItem[] = [];
  for (const list of waiting) {
    if (items.length === PEN_MOST) break;
    const decl = list.decl;
    const slug = [list.id, `${list.id}-rows`].find((s) => !taken.has(s));
    if (slug === undefined) continue;

    const shown = decl.fields.filter((f) => f.retired !== true && !NOT_A_COLUMN.has(f.type)).slice(0, PEN_COLUMNS_MOST);
    /* A LIST WITH NOTHING A TABLE MAY DRAW IS NOT OFFERED A TABLE, and a table with no `columns` draws the default
       projection, which is where a secret would be a column after all. */
    if (shown.length === 0) continue;
    const day = decl.fields.find((f) => f.type === 'day' && f.retired !== true && ((f as { index?: boolean }).index === true || f.unique === true));
    const section = fit(list.name, SECTION_BYTES) ?? list.id;
    const empty = fit(`Nothing in ${list.name} yet.`, EMPTY_BYTES) ?? 'Nothing here yet.';
    const cells = figures.get(list.id) ?? [];

    const blocks: Json[] = [
      ...(cells.length > 0 ? [{ kind: 'stat', cells: cells.map((metric) => ({ metric })) }] : []),
      {
        kind: 'table',
        source: `register.${list.id}`,
        columns: shown.map((f) => ({ field: f.id, label: labelOf(f) })),
        order: [{ field: day?.id ?? 'seq', dir: 'desc' }],
        limit: PEN_ROWS_DRAWN,
        empty,
      },
    ];
    const body: Record<string, Json> = {
      page: slug,
      title: list.name,
      origin: 'derived',
      derived_from: `register.${list.id}`,
      requires: [`register.${list.id}`],
      /* THE SYSTEM NEVER WRITES NAV (`29 §2`). This is what accepting would write, for the person to keep or not. */
      nav: { section, order: Math.min((lastIn.get(section) ?? 0) + 10, ORDER_MOST) },
      blocks,
    };
    taken.add(slug);
    items.push({
      id: `page:${list.id}`,
      kind: 'page',
      register: list.id,
      title: list.name,
      why: `${list.name} has ${list.rows.toLocaleString('en')} ${list.rows === 1 ? 'row' : 'rows'} and no page yet.`,
      change: { to: { id: `page.${slug}`, kind: 'page', body } },
    });
  }

  /* EVERY ITEM PASSES THE LINT ITS ACCEPTANCE WOULD MEET, so nothing is offered that the record would then refuse. */
  const asDecl = (item: PenItem): Declaration => ({ id: item.change.to.id, kind: 'page', body: item.change.to.body });
  if (items.length === 0 || kernel.lint(items.map(asDecl)) === null) return items;
  return items.filter((item) => kernel.lint([asDecl(item)]) === null);
}

/**
 * The holding pen `boot` answers: the pages first, since a list no page draws is the strongest case there is (`29 §3`
 * T1), then the blocks and columns the record's own pages ask for, strongest first, at most `PEN_MOST` in all.
 */
export function penFor(deps: PenDeps): PenItem[] {
  const pages = pagesOffered(deps);
  return [...pages, ...shapesOffered(deps, PEN_MOST - pages.length)];
}

/* ── the block a list's shape asks for, and the column its people fill (PGS-17) ─────────────────────────────────── */

/** The fewest rows at which one field's share of them is a proportion worth saying (`29 §3` T5). */
export const PEN_COLUMN_ROWS_FEWEST = 20;
/** The share of a list's rows a field fills before it is offered as a column (`29 §3` T5). */
export const PEN_COLUMN_FILLED = 0.8;
/** The rows a number and its day share before they are something recorded over time, and a line is worth drawing. */
export const PEN_LINES_ROWS_FEWEST = 8;
/** The values a state takes for a board to draw it: fewer is a switch, and past seven a lane each is not read at a glance. */
export const PEN_BOARD_LANES = { fewest: 3, most: 7 } as const;
/** The rows holding a file read to find a picture among them, which is the most a gallery draws (`kinds/gallery.ts`). */
const PICTURES_READ = 24;
/** The field types a line is drawn from. Money and a quantity carry a unit, which a line would have to choose between. */
const NUMBERS: ReadonlySet<string> = new Set(['int', 'decimal']);
/** The byte ceilings the page check holds a heading and a column's label to (`kernel/src/declare.ts`). */
const HEADING_BYTES = 80;
const LABEL_BYTES = 40;

type Field = RegisterDecl['fields'][number];
type Where = NonNullable<Parameters<Kernel['list']>[0]['where']>;
type Block = Record<string, Json>;

/** A page the record holds a declaration for, which is the only page a proposal can hand back whole. */
type HeldPage = { id: string; slug: string; title: string; body: Record<string, Json>; blocks: Block[] };

/** One block the shape of a list asks for, before it is made an item. */
type Asked = { kind: string; title: string; why: string; block: Block };

/** One item before its lint, with the rows of its list that back it, which is how strong it is. */
type Offer = { item: PenItem; rows: number };

const isBlock = (value: Json | undefined): value is Block => value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
const listOf = (block: Block): string | null =>
  typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The pages the record holds a declaration for, parsed.
 *
 * A PAGE THAT TAKES A PARAMETER IS LEFT OUT. Its blocks are narrowed to the one row its address names, through `{{it}}`,
 * and a block added to it without that clause would draw every row of the list on each row's page.
 */
function heldPages(declared: readonly { id: string; kind: string; body: string }[]): HeldPage[] {
  const held: HeldPage[] = [];
  for (const row of declared) {
    if (row.kind !== 'page' || row.body.includes('{{')) continue;
    let body: Json;
    try {
      body = JSON.parse(row.body) as Json;
    } catch {
      continue;
    }
    if (!isBlock(body)) continue;
    const blocks = body.blocks;
    if (!Array.isArray(blocks) || !blocks.every(isBlock)) continue;
    const slug = typeof body.page === 'string' ? body.page : row.id.slice('page.'.length);
    const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : slug;
    held.push({ id: row.id, slug, title, body, blocks });
  }
  return held;
}

/**
 * What a list's rows say, each asked of the record once however many pages draw the list.
 *
 * `filled` IS HOW MANY ROWS HOLD EVERY ONE OF THE FIELDS, from the `matched` of a one-row read, so the record counts in
 * SQL and no row is carried here to be counted.
 */
function factsOf(kernel: PenDeps['kernel']) {
  const rows = new Map<string, number>();
  const filled = new Map<string, number>();
  const pictured = new Map<string, boolean>();
  return {
    rows(list: string): number {
      const known = rows.get(list);
      if (known !== undefined) return known;
      const n = kernel.count(list);
      rows.set(list, n);
      return n;
    },
    filled(list: string, fields: readonly string[]): number {
      const key = `${list}:${fields.join(',')}`;
      const known = filled.get(key);
      if (known !== undefined) return known;
      const each = fields.map((field) => ({ field, present: true }));
      const got = kernel.list({ register: list, where: (each.length === 1 ? each[0]! : { all: each }) as Where, limit: 1 });
      const n = got.ok ? got.value.matched : 0;
      filled.set(key, n);
      return n;
    },
    /** Whether any of the first rows holding a file in `field` holds a picture, by the type the store read from its bytes. */
    pictured(list: string, field: string): boolean {
      const key = `${list}:${field}`;
      const known = pictured.get(key);
      if (known !== undefined) return known;
      const got = kernel.list({ register: list, where: { field, present: true } as Where, limit: PICTURES_READ });
      const yes =
        got.ok &&
        got.value.rows.some((row) => {
          const file = row.fields[field];
          return isBlock(file) && typeof file.mime === 'string' && file.mime.startsWith('image/');
        });
      pictured.set(key, yes);
      return yes;
    },
  };
}

type Facts = ReturnType<typeof factsOf>;

/**
 * The blocks `list`'s shape asks for that `page` does not draw over it, in the order `29 §5` names them, skipping a
 * kind `skip` says is spoken for. Each block reads the list by its `source` and names its columns, so it passes the
 * checks each kind's module makes at install (`kernel/src/kinds/`).
 *
 * THE COSTLY QUESTIONS ARE ASKED LAST. A kind the page already draws, or one dismissed, is passed over before the rows
 * are read for a picture or a count.
 */
function blocksAskedFor(page: HeldPage, list: string, decl: RegisterDecl, facts: Facts, skip: (kind: string) => boolean): Asked[] {
  const live = decl.fields.filter((f) => f.retired !== true);
  /* THE ROW'S TITLE IS EVERY BLOCK'S FIRST CELL, and a list whose title is a secret is offered none of them, for the
     reason a proposed table never draws one. */
  const named = live.find((f) => f.id === decl.title && !NOT_A_COLUMN.has(f.type));
  const want = (kind: string): boolean => !skip(kind) && !page.blocks.some((b) => b.kind === kind && listOf(b) === list);
  const source = `register.${list}`;
  const heading = (text: string): string => fit(text, HEADING_BYTES) ?? list;
  const empty = (text: string): string => fit(text, EMPTY_BYTES) ?? 'Nothing here yet.';
  const days = live.filter((f) => f.type === 'day');
  const out: Asked[] = [];

  /* A CALENDAR puts each row on its day. The day a row is due by is the one a person plans around, so it is chosen
     before an indexed day, and that before the first. */
  if (named && days.length > 0 && want('calendar')) {
    const day =
      days.find((f) => f.deadline === true) ?? days.find((f) => (f as { index?: boolean }).index === true || f.unique === true) ?? days[0]!;
    if (facts.filled(list, [day.id]) > 0)
      out.push({
        kind: 'calendar',
        title: `A calendar of ${decl.name}`,
        why: `${decl.name} puts a day on its rows in ${labelOf(day)}, and ${page.title} has no calendar of them.`,
        block: { kind: 'calendar', heading: heading(decl.name), source, columns: [{ field: named.id }, { field: day.id }], empty: empty(`Nothing in ${decl.name} falls in these months.`) },
      });
  }

  /* A GALLERY only where a picture is held, since a file field holding receipts as PDFs would draw a grid of names. */
  if (named && want('gallery')) {
    const file = live.find((f) => f.type === 'file' && facts.pictured(list, f.id));
    if (file)
      out.push({
        kind: 'gallery',
        title: `Pictures from ${decl.name}`,
        why: `${decl.name} holds pictures in ${labelOf(file)}, and ${page.title} does not show them.`,
        block: { kind: 'gallery', heading: heading(labelOf(file)), source, columns: [{ field: named.id }, { field: file.id }], empty: empty(`No pictures in ${decl.name} yet.`) },
      });
  }

  /* A PATH is a steps block over a list that declares `steps:`, which the read draws as done, next and later. */
  if (named && decl.steps !== undefined && want('steps'))
    out.push({
      kind: 'steps',
      title: `The path through ${decl.name}`,
      why: `${decl.name} says which of its steps are done, and ${page.title} does not draw them as a path.`,
      block: { kind: 'steps', heading: heading(decl.name), source, columns: [{ field: named.id }], empty: empty(`No steps in ${decl.name} yet.`) },
    });

  /* A BOARD draws a lane for each value of the list's state, so it is offered only where the lanes fit a screen. */
  const state = live.find((f) => f.type === 'enum' && f.id === (decl.state ?? 'state'));
  const lanes = state?.values?.length ?? 0;
  if (named && state && lanes >= PEN_BOARD_LANES.fewest && lanes <= PEN_BOARD_LANES.most && want('board'))
    out.push({
      kind: 'board',
      title: `A board of ${decl.name}`,
      why: `${decl.name} moves through ${lanes} states in ${labelOf(state)}, and ${page.title} has no board of them.`,
      block: {
        kind: 'board',
        heading: heading(`${decl.name} by ${lower(labelOf(state))}`),
        source,
        columns: [{ field: state.id }, { field: named.id }],
        empty: empty(`Nothing in ${decl.name} yet.`),
      },
    });

  /* LINES are a number recorded on days. The day a row is due by is a plan, not a reading, so it is not the axis. */
  if (want('lines')) {
    const day = days.find((f) => f.deadline !== true);
    const number = live.find((f) => NUMBERS.has(f.type));
    const together = day && number ? facts.filled(list, [day.id, number.id]) : 0;
    if (day && number && together >= PEN_LINES_ROWS_FEWEST)
      out.push({
        kind: 'lines',
        title: `${labelOf(number)} over time`,
        why: `${decl.name} records ${lower(labelOf(number))} with a day on ${together.toLocaleString('en')} rows, and ${page.title} does not draw it over time.`,
        block: { kind: 'lines', heading: heading(labelOf(number)), source, columns: [{ field: day.id }, { field: number.id }], empty: empty(`Nothing recorded in ${decl.name} yet.`) },
      });
  }
  return out;
}

/**
 * `29 §3`'s T5 on `page`: the field of `list` its people fill most, on at least `PEN_COLUMN_FILLED` of at least
 * `PEN_COLUMN_ROWS_FEWEST` rows, that the page's first table over the list does not show, added as its last column.
 *
 * A TABLE THAT NAMES NO COLUMNS IS LEFT ALONE. It draws the record's default projection, and a `columns` naming one more
 * field would narrow it to that one field.
 */
function columnAskedFor(page: HeldPage, list: string, decl: RegisterDecl, rows: number, facts: Facts, dismissed: ReadonlySet<string>): Offer | null {
  if (rows < PEN_COLUMN_ROWS_FEWEST) return null;
  const at = page.blocks.findIndex((b) => b.kind === 'table' && listOf(b) === list);
  const table = page.blocks[at];
  const named = table?.columns;
  if (!table || !Array.isArray(named) || named.length === 0 || !named.every(isBlock)) return null;
  const shown = new Set(named.map((c) => c.field));

  let best: { field: Field; filled: number } | null = null;
  for (const field of decl.fields) {
    if (field.retired === true || NOT_A_COLUMN.has(field.type) || shown.has(field.id) || dismissed.has(`column:${page.slug}:${at}:${field.id}`)) continue;
    const filled = facts.filled(list, [field.id]);
    if (filled >= rows * PEN_COLUMN_FILLED && (best === null || filled > best.filled)) best = { field, filled };
  }
  if (best === null) return null;

  const label = fit(labelOf(best.field), LABEL_BYTES) ?? best.field.id;
  const columns: Json[] = [...named, { field: best.field.id, label }];
  const blocks = page.blocks.map((b, i) => (i === at ? { ...b, columns } : b));
  const share = Math.floor((best.filled / rows) * 100);
  return {
    rows,
    item: {
      id: `column:${page.slug}:${at}:${best.field.id}`,
      kind: 'column',
      register: list,
      title: `${label} on ${page.title}`,
      why: `${label} is filled on ${share}% of the ${rows.toLocaleString('en')} rows in ${decl.name}, and the table on ${page.title} does not show it.`,
      change: { to: { id: page.id, kind: 'page', body: { ...page.body, blocks } } },
    },
  };
}

/**
 * The block and column items, at most `room`, over the pages the record holds declarations for, and only over the lists
 * those pages draw by a block's `source`. A list a page only counts in a figure is not a list it draws, and a calendar
 * offered to a dashboard for it would be a second screen on the first.
 *
 * ONE ITEM PER PAGE IN EACH ANSWER, its strongest. Each item is the page's whole declaration with one thing added, so
 * two offered at once would each be written without the other, and keeping the second would take the first away again
 * with no click that asked for it (`29 §6`). The next waits for the next `boot`, as the rest past `PEN_MOST` do.
 *
 * EVERY ITEM PASSES THE LINT ITS ACCEPTANCE WOULD MEET, each alone, since two items over one page share an id.
 */
function shapesOffered(deps: PenDeps, room: number): PenItem[] {
  if (room <= 0) return [];
  const { kernel, reads, dismissed } = deps;
  const lists = new Map(kernel.registers());
  const facts = factsOf(kernel);

  const perPage: Offer[][] = [];
  for (const page of heldPages(kernel.declarations())) {
    const offers: Offer[] = [];
    const drawn = [...new Set(page.blocks.map(listOf).filter((l): l is string => l !== null))];
    const spoken = new Set<string>();
    for (const list of drawn) {
      const decl = lists.get(list);
      if (!decl || !reads(list)) continue;
      const rows = facts.rows(list);
      if (rows === 0) continue;
      const idOf = (kind: string): string => `block:${page.slug}:${kind}:${list}`;
      /* ONE ITEM PER PAGE AND KIND: the first list the page draws that asks for a calendar is the one offered one. */
      for (const asked of blocksAskedFor(page, list, decl, facts, (kind) => spoken.has(kind) || dismissed.has(idOf(kind)))) {
        spoken.add(asked.kind);
        offers.push({
          rows,
          item: {
            id: idOf(asked.kind),
            kind: 'block',
            register: list,
            title: asked.title,
            why: asked.why,
            change: { to: { id: page.id, kind: 'page', body: { ...page.body, blocks: [...page.blocks, asked.block] } } },
          },
        });
      }
      const column = columnAskedFor(page, list, decl, rows, facts, dismissed);
      if (column) offers.push(column);
    }
    /* A STABLE SORT, so a page's offers over one list keep the order `blocksAskedFor` gave them. */
    if (offers.length > 0) perPage.push(offers.sort((a, b) => b.rows - a.rows));
  }
  perPage.sort((a, b) => b[0]!.rows - a[0]!.rows || a[0]!.item.id.localeCompare(b[0]!.item.id));

  const out: PenItem[] = [];
  for (const offers of perPage) {
    if (out.length === room) break;
    const kept = offers.find(({ item }) => kernel.lint([{ id: item.change.to.id, kind: 'page', body: item.change.to.body }]) === null);
    if (kept) out.push(kept.item);
  }
  return out;
}
