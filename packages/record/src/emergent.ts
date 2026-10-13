/**
 * The holding pen: the pages a record would draw for a list if somebody asked, answered on `boot` and placed by nobody
 * (`29 §2`).
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
 * `kind: 'block'` and `kind: 'column'` join `kind: 'page'` under the same `PenItem`. A block item is the block a list's
 * shape asks for on a page that draws the list without it: a calendar for a day, a gallery for pictures, a path for a
 * list of steps, a board for a state of three to seven values, and lines for a number recorded over time. A column item
 * is `29 §3`'s T5: a field filled on at least 80% of at least 20 rows, offered to the page's first table over that
 * list. Each changes a page somebody already has, so each is the page's whole declaration with one thing added at the
 * end, and nothing on it moved.
 *
 * THE WEEK OFFER IS THE ONE DRAWN FROM USE (`weeksOffered`): a list with a day, four or more of its entries falling in
 * this week, read on three different weeks, and no page that groups it by week, is offered a page of its week. It is
 * never made in a record's first `PEN_YOUNG_DAYS` days (ENG-B17: "a fortnight of use is not a habit"), counted from the
 * day the record was made and never from the oldest day its entries say, so an import does not make a record old.
 *
 * ONE OFFER A LIST, IN ONE PLACE, THE BEST FEW AT ONCE (USE-B03). `penRanked` keeps one offer a list and drops a list Slash
 * already asked a page for on Decide; `penFor` shows its first `PEN_SHOWN`, and beside them the offer of any list the
 * person opened in the last day, so a list they are looking at never waits unseen behind three others. An offer's id is
 * made by `signatureOf` alone, so Slash's growing list can name the same offer and ask `pageSpokenFor` before it
 * drafts one.
 */

import type { Declaration, Json, Kernel, RegisterDecl } from '@braindog/kernel';
import { SLASH } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

/** One thing the pen offers, and the whole declaration accepting it would write. */
export type PenItem = {
  /**
   * The dismissal signature, which is also how the item is told apart from every other: `page:<list>`,
   * `block:<page>:<kind>:<list>`, `column:<page>:<block>:<field>` or `week:<list>`.
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
  /**
   * A page item's list, by id, and the page keeping it makes (`change.to`, the same declaration), which is what the card
   * on that list's own screen reads: `offerFor(pen, list)` and the drawing of the draft. Absent on a block or a column.
   */
  list?: string;
  draft?: { id: string; kind: string; body: Record<string, Json> };
};

/** The most items the pen ranks, one a list; past it the rest wait until one is kept or dismissed (`29 §4` (b) 3). */
export const PEN_MOST = 24;
/**
 * The most items `boot` shows at once, the best of the ranked pen (USE-B03: "make sure that the braindog experience is
 * not overwhelming for new users"). The rest wait their turn, and `penRanked` still says how many wait in all.
 */
export const PEN_SHOWN = 3;
/** The most figures a proposed page opens with (`29 §5`, Figures). */
export const PEN_FIGURES_MOST = 3;
/** The most columns a proposed page's table draws. */
export const PEN_COLUMNS_MOST = 6;
/** The rows a proposed page's table draws. */
export const PEN_ROWS_DRAWN = 50;
/** The most dismissals a person's `pen.dismissed` keeps; past it the oldest is let go first. */
export const PEN_DISMISSED_MOST = 500;

/** What an offer is about: a list's page, its week, a block on a page, or a column on a page's table. */
export type PenSignatureKind = 'page' | 'week' | 'block' | 'column';

/**
 * THE ONE MAKER OF AN OFFER'S SIGNATURE, which is its id and what `pen.dismissed` holds, so another rule offering the
 * same thing (Slash's growing list, `slash.ts` `noticeWhole`) makes the same one and a dismissal holds for both.
 */
export const signatureOf = (kind: PenSignatureKind, subject: string): string => `${kind}:${subject}`;

/** The signatures that offer `list` a page of its own: its plain page and its week. */
export const pageSignatures = (list: string): readonly [string, string] => [signatureOf('page', list), signatureOf('week', list)];

/**
 * Whether `list` already has a page offered or turned down: one of its `pageSignatures` held by the pen now or in the
 * person's `pen.dismissed`. Slash asks this before it drafts a page for a list, so one list is offered in one place.
 */
export const pageSpokenFor = (list: string, ...signatures: readonly ReadonlySet<string>[]): boolean =>
  pageSignatures(list).some((s) => signatures.some((held) => held.has(s)));

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
  /**
   * What an offer drawn from use reads: the record's store, for the day the record was made and the days each list was
   * read on (`observation`), and the record's clock. Absent, no offer drawn from use is made.
   */
  use?: { sql: Sql; nowMs: number } | undefined;
  /**
   * The words the record speaks for its lists, by label key as `declare`'s `labelsOf` answers them: `orders` for the
   * list's name (Settings, Words), `orders:one` for one of its entries. Absent, every list is said as it is declared.
   */
  labels?: Readonly<Record<string, string>> | undefined;
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
    if (readByAPage.has(id) || dismissed.has(signatureOf('page', id)) || !reads(id)) continue;
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
      id: signatureOf('page', list.id),
      kind: 'page',
      register: list.id,
      title: list.name,
      why: `${list.name} has ${list.rows.toLocaleString('en')} ${list.rows === 1 ? 'entry' : 'entries'} and no page yet.`,
      change: { to: { id: `page.${slug}`, kind: 'page', body } },
      list: list.id,
      draft: { id: `page.${slug}`, kind: 'page', body },
    });
  }

  /* EVERY ITEM PASSES THE LINT ITS ACCEPTANCE WOULD MEET, so nothing is offered that the record would then refuse. */
  const asDecl = (item: PenItem): Declaration => ({ id: item.change.to.id, kind: 'page', body: item.change.to.body });
  if (items.length === 0 || kernel.lint(items.map(asDecl)) === null) return items;
  return items.filter((item) => kernel.lint([asDecl(item)]) === null);
}

/**
 * The whole holding pen, ranked: what `boot` shows the first `PEN_SHOWN` of, and what waits behind them.
 *
 * WHAT IS OFFERED: a week page first, since it is what the person has been doing, then the pages, since a list no page
 * draws is the strongest case there is (`29 §3` T1), then the blocks and columns the record's own pages ask for,
 * strongest first.
 *
 * ONE OFFER A LIST. A list offered its week is not offered a plain page beside it, and a list offered anything is not
 * offered a second thing beside it, so its screen holds one offer and the pen never counts one list twice. The first
 * kept is the strongest, in the order above; the next waits until that one is kept or dismissed.
 *
 * ONE PLACE A LIST. A list Slash already asked a page for on Decide, still waiting or turned down there, is not offered
 * one here (`slashAsked`): the same question in two places is a nag, and an answer in one must hold in the other.
 *
 * THE RANK (USE-B03): a list the person opened in the last seven days first, then the list with the newest entry, and
 * where those tie, the order above. Both are read from the record's store, so without `use` the order above is the rank.
 */
export function penRanked(deps: PenDeps): PenItem[] {
  const weeks = weeksOffered(deps);
  const weekly = new Set(weeks.map((w) => w.register));
  const asked = slashAsked(deps);
  const offered = [...weeks, ...pagesOffered(deps).filter((p) => !weekly.has(p.register)), ...shapesOffered(deps, PEN_MOST)];
  const lists = new Set<string>();
  const one: PenItem[] = [];
  for (const item of offered) {
    if (lists.has(item.register) || (item.kind === 'page' && asked.has(item.register))) continue;
    lists.add(item.register);
    one.push(item);
  }
  return rank(deps, one).slice(0, PEN_MOST);
}

/** How far back "opened lately" looks, in days: a week, counted from today, so a Monday does not forget a Sunday. */
const OPENED_DAYS = 7;

/**
 * The holding pen `boot` answers: the best `PEN_SHOWN` of `penRanked`, one a list, and after them the offer of every
 * list the person opened in the last `OPENED_DAYS` days, in the same rank. The rest wait their turn.
 *
 * WHY THE OPENED ONES ARE NOT CUT (batch 52, finding 4): Slash yields every list `penRanked` holds, shown or waiting
 * (`pageSpokenFor`), so a list ranked fourth had its page asked for nowhere: not on Decide, and not on its own screen
 * while the person stood on it. What Slash leaves to the pen for a list the person has open, the pen now shows. The
 * most this adds is what `penRanked` holds, `PEN_MOST`, and with no `use` it adds nothing.
 *
 * ONE WINDOW FOR SHOWN AND RANKED (batch 53, finding 3): "opened" is `OPENED_DAYS` here as it is in `rank`. It was two
 * days here, so a list opened three to seven days ago ranked as opened, was yielded by Slash, and was shown nowhere.
 */
export function penFor(deps: PenDeps): PenItem[] {
  const ranked = penRanked(deps);
  if (!deps.use || ranked.length <= PEN_SHOWN) return ranked.slice(0, PEN_SHOWN);
  const looking = openedSince(deps, ranked.slice(PEN_SHOWN).map((i) => i.register), OPENED_DAYS);
  return ranked.filter((item, at) => at < PEN_SHOWN || looking.has(item.register));
}

/**
 * Which of `lists` the record's people opened in the last `days` days, today among them.
 *
 * OPENED IS A READ OF THE LIST ITSELF OR A RENDER OF A PAGE THAT DRAWS IT (`observation`), the signals `weeksRead` reads.
 */
function openedSince(deps: PenDeps, lists: readonly string[], days: number): ReadonlySet<string> {
  const { use, pages } = deps;
  if (!use || lists.length === 0) return new Set();
  const since = new Date(use.nowMs - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const seen = use.sql.all<{ kind: string; subject: string }>(
    "SELECT DISTINCT kind, subject FROM observation WHERE day >= ? AND kind IN ('register.read', 'page.render')",
    since,
  );
  const read = new Set(seen.filter((s) => s.kind === 'register.read').map((s) => s.subject));
  const rendered = new Set(seen.filter((s) => s.kind === 'page.render').map((s) => s.subject));
  return new Set(lists.filter((l) => read.has(l) || pages.some((p) => rendered.has(p.slug) && p.registers.includes(l))));
}

/**
 * The items in the rank `penRanked` describes. A STABLE SORT, so items whose lists tie keep the order they were made in.
 *
 * OPENED is `openedSince` over the last `OPENED_DAYS`. THE NEWEST ENTRY is the latest `created_at` of a live entry, one grouped read for every list in the pen.
 */
function rank(deps: PenDeps, items: readonly PenItem[]): PenItem[] {
  const { use } = deps;
  if (!use || items.length < 2) return [...items];
  const lists = [...new Set(items.map((i) => i.register))];
  const opened = openedSince(deps, lists, OPENED_DAYS);
  const newest = new Map(
    use.sql
      .all<{ register: string; at: string | null }>(
        `SELECT register, MAX(created_at) AS at FROM entry WHERE deleted_at IS NULL AND register IN (${lists.map(() => '?').join(', ')}) GROUP BY register`,
        ...lists,
      )
      .map((r) => [r.register, r.at ?? '']),
  );
  const tier = (i: PenItem): number => (opened.has(i.register) ? 0 : 1);
  const at = (i: PenItem): string => newest.get(i.register) ?? '';
  return [...items].sort((a, b) => tier(a) - tier(b) || (at(a) === at(b) ? 0 : at(a) > at(b) ? -1 : 1));
}

/**
 * The lists Slash already asked a page of its own for: an arrangement it filed (`opened_by` Slash) that adds a page
 * whose only list is that one, drawn whole, still waiting or turned down (`wont-fix`, `incorrect`). One that was kept made
 * the page, which the pen sees as a page reading the list; one taken back asks nothing. Slash's people pages draw a list
 * narrowed to one person (`where`), so they are not a page of the list.
 */
function slashAsked(deps: PenDeps): ReadonlySet<string> {
  const out = new Set<string>();
  if (!deps.use) return out;
  const filed = deps.use.sql.all<{ body: string }>(
    "SELECT body FROM suggestion WHERE opened_by = ? AND body_kind = 'arrange' AND (status <> 'resolved' OR resolved_as IN ('wont-fix', 'incorrect'))",
    SLASH,
  );
  for (const { body } of filed) {
    let parsed: { pages?: unknown };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      continue;
    }
    for (const page of Array.isArray(parsed.pages) ? parsed.pages : []) {
      const { was, body: decl } = (page ?? {}) as { was?: unknown; body?: { requires?: unknown; blocks?: unknown } };
      const requires = decl?.requires;
      if (was !== null || !Array.isArray(requires) || requires.length !== 1 || typeof requires[0] !== 'string' || !requires[0].startsWith('register.')) continue;
      const source = requires[0];
      const blocks = Array.isArray(decl?.blocks) ? (decl.blocks as { source?: unknown; where?: unknown }[]) : [];
      if (blocks.some((b) => b?.source === source && b.where === undefined)) out.add(source.slice('register.'.length));
    }
  }
  return out;
}

/* ── the block a list's shape asks for, and the column its people fill ──────────────────────────────────────────── */

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
        why: `${decl.name} puts a day on its entries in ${labelOf(day)}, and ${page.title} has no calendar of them.`,
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
        why: `${decl.name} records ${lower(labelOf(number))} with a day on ${together.toLocaleString('en')} entries, and ${page.title} does not draw it over time.`,
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
    if (field.retired === true || NOT_A_COLUMN.has(field.type) || shown.has(field.id) || dismissed.has(signatureOf('column', `${page.slug}:${at}:${field.id}`))) continue;
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
      id: signatureOf('column', `${page.slug}:${at}:${best.field.id}`),
      kind: 'column',
      register: list,
      title: `${label} on ${page.title}`,
      why: `${label} is filled on ${share}% of the ${rows.toLocaleString('en')} entries in ${decl.name}, and the table on ${page.title} does not show it.`,
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
      const idOf = (kind: string): string => signatureOf('block', `${page.slug}:${kind}:${list}`);
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

/* ── the week a list is read by ─────────────────────────────────────────────────────────────────────────────────── */

/** The days a record is watched and offered nothing drawn from use: a fortnight of use is not a habit (ENG-B17). */
export const PEN_YOUNG_DAYS = 14;
/** The entries a list holds in this week before its week is worth a page of its own. */
export const PEN_WEEK_FEWEST = 4;
/** The different weeks a list is read on before reading it by the week is a habit. */
export const PEN_WEEKS_READ = 3;
/** How far back the reads are looked for, in weeks. */
const WEEKS_BACK = 12;
/** The most a running-low table draws. */
const LOW_DRAWN = 5;
const DAY_MS = 86_400_000;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** The Monday of the week `day` falls in, at noon in UTC, as `where`'s `bow` reads this week's. */
const mondayOf = (day: string): string => {
  const at = Date.parse(`${day}T12:00:00Z`);
  return dayOf(at - ((new Date(at).getUTCDay() + 6) % 7) * DAY_MS);
};
/**
 * This week on `field`, from this Monday until a week from today, in the words `where` resolves against the record's
 * clock, so a page kept today still reads this week next month. `where` has no word for the end of a week, so late in
 * a week the page reaches a few days into the next.
 */
const thisWeek = (field: string, unfinished: Json | null = null): Json => ({
  all: [{ field, gte: 'bow' }, { field, lt: '+7d' }, ...(unfinished ? [unfinished] : [])],
});
/**
 * This week on `field` exactly, Monday to Sunday of `today`, which is what the offer counts and says. Counted with the
 * page's own words, a Sunday's "4 due this week" was four due in the week after it.
 *
 * `unfinished` NARROWS BOTH TO WHAT IS STILL TO DO (batch 53, finding 1): on a Thursday "4 due this week" counted the
 * orders sent on Monday, beside a line on the same screen that did not. A finished entry is not due.
 */
const weekOf = (field: string, today: string, unfinished: Json | null = null): Json => {
  const monday = mondayOf(today);
  return {
    all: [{ field, gte: monday }, { field, lte: dayOf(Date.parse(`${monday}T12:00:00Z`) + 6 * DAY_MS) }, ...(unfinished ? [unfinished] : [])],
  };
};

/**
 * When the record began: the day it was made, else the first line its log wrote, or `null` when it holds neither. Never
 * the oldest day an entry says about itself, which an import of last year's orders would make a year ago.
 */
function bornOf(sql: Sql): number | null {
  const at =
    sql.one<{ ts: string }>('SELECT created_at AS ts FROM record WHERE singleton = 1')?.ts ??
    sql.one<{ ts: string }>('SELECT ts FROM event ORDER BY rowid LIMIT 1')?.ts;
  const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** The different weeks since `since` that `list` was read on, by itself or through a page that draws it. */
function weeksRead(sql: Sql, list: string, slugs: readonly string[], since: string): number {
  const rendered = slugs.length === 0 ? '' : ` OR (kind = 'page.render' AND subject IN (${slugs.map(() => '?').join(', ')}))`;
  const days = sql.all<{ day: string }>(
    `SELECT DISTINCT day FROM observation WHERE day >= ? AND ((kind = 'register.read' AND subject = ?)${rendered})`,
    since,
    list,
    ...slugs,
  );
  return new Set(days.map((d) => mondayOf(d.day))).size;
}

/** The furthest ahead a "before +N" clause reaches and is still a week's reading: a fortnight. Past it is the month's. */
const AHEAD_DAYS_MOST = 14;
const aheadDays = (n: string, unit: string): number => Number(n) * (unit.toLowerCase() === 'w' ? 7 : 1);
/** `<day> before +Nd`, as a page's sentence writes it (`where/src/sentence.ts`), with an `is` or without. */
const AHEAD_SAID = /(?:^|[\s,])([\p{L}\p{N}_]+)\s+(?:is\s+)?before\s+\+(\d{1,4})([dw])(?=[\s,]|$)/giu;
const AHEAD_WORD = /^\+(\d{1,4})([dw])$/iu;

/**
 * Whether `where` holds one of `days` to the days just ahead: `due before +8d` in a sentence, or `{field, lt: '+7d'}`
 * in a tree, at any depth. That is a page reading the list by the week in other words (batch 53, finding 1): the shop's
 * Due this week says no `bow`, so a shop that had the table was offered a page of the same table.
 */
function daysAhead(where: Json | undefined, days: ReadonlySet<string>): boolean {
  if (typeof where === 'string') {
    return [...where.matchAll(AHEAD_SAID)].some((m) => days.has(m[1]!) && aheadDays(m[2]!, m[3]!) <= AHEAD_DAYS_MOST);
  }
  if (Array.isArray(where)) return where.some((w) => daysAhead(w, days));
  if (where === null || typeof where !== 'object') return false;
  const word = [where.lt, where.lte].find((w): w is string => typeof w === 'string');
  const m = word === undefined ? null : AHEAD_WORD.exec(word);
  if (m && typeof where.field === 'string' && days.has(where.field) && aheadDays(m[1]!, m[2]!) <= AHEAD_DAYS_MOST) return true;
  return Object.values(where).some((w) => daysAhead(w, days));
}

/**
 * Whether `page` already reads `list` by the week: a calendar of it, a figure or a chart of it by week, this week, or
 * the days just ahead on one of the list's `days`.
 */
const byWeek = (page: HeldPage, list: string, days: ReadonlySet<string>): boolean =>
  page.blocks.some(
    (b) =>
      listOf(b) === list &&
      (b.kind === 'calendar' || b.bucket === 'week' || JSON.stringify(b.where ?? null).includes('"bow"') || daysAhead(b.where, days)),
  );

/**
 * What is running low beside `list`: the first other list its pack installed that holds things on hand, its fewest
 * first. A list somebody made by hand has no pack, so it has no neighbour to be sure of and is drawn no such table.
 *
 * THINGS ON HAND CARRY NO DAY. A whole number on a list of dated entries is an order, a hue, minutes or points, never
 * stock: Milestones' order beside Steps or Projects' hue beside Tasks drew "Running low" over what cannot run out. So
 * the neighbour holds no day field, and its count is a plain field, not one it is sorted or looked up by.
 */
function lowBeside(deps: PenDeps, list: string, packOf: ReadonlyMap<string, string | null>): { register: string; block: Block } | null {
  const pack = packOf.get(list);
  if (!pack) return null;
  for (const [other, decl] of deps.kernel.registers()) {
    if (other === list || packOf.get(other) !== pack || !deps.reads(other) || deps.kernel.count(other) === 0) continue;
    const live = decl.fields.filter((f) => f.retired !== true);
    if (live.some((f) => f.type === 'day' || f.type === 'instant')) continue;
    const named = live.find((f) => f.id === decl.title && !NOT_A_COLUMN.has(f.type));
    const count = live.find((f) => f.type === 'int' && f.id !== decl.title && (f as { index?: boolean }).index !== true && f.unique !== true);
    if (!named || !count) continue;
    return {
      register: other,
      block: {
        kind: 'table',
        heading: 'Running low',
        source: `register.${other}`,
        where: { field: count.id, present: true },
        columns: [{ field: named.id, label: labelOf(named) }, { field: count.id, label: fit(labelOf(count), LABEL_BYTES) ?? count.id }],
        order: [{ field: count.id, dir: 'asc' }],
        limit: LOW_DRAWN,
        empty: fit(`Nothing in ${decl.name} is counted yet.`, EMPTY_BYTES) ?? 'Nothing here yet.',
      },
    };
  }
  return null;
}

const NO_WORDS: ReadonlySet<string> = new Set();
const CAPITALISED = /^\p{Lu}\p{Ll}*$/u;

/**
 * A name as it reads inside a sentence: the capital a name starts with goes, every other word stays as typed (`slash.ts`).
 *
 * A PROPER NOUN KEEPS ITS CAPITAL WHERE IT CAN BE TOLD FROM THAT ONE: a word after the first (Orders from Etsy, "orders
 * from Etsy"), a word typed in capitals (HSBC cards), and a word in `proper`, which the person's own singular wrote with
 * a capital (`saidWords`). A name with a capital on every word is a title (Client Work), and reads in lower case.
 */
const inSentence = (name: string, proper: ReadonlySet<string> = NO_WORDS): string => {
  const words = name.match(/\p{L}+/gu) ?? [];
  const title = words.length > 1 && words.every((w) => CAPITALISED.test(w));
  let first = true;
  return name.trim().replace(/\p{L}+/gu, (w) => {
    const lead = first;
    first = false;
    return (lead || title) && CAPITALISED.test(w) && !proper.has(w.toLowerCase()) ? w.toLowerCase() : w;
  });
};

/** Names ending in s that are not a count of things, so "6 savings this week" is never said of them. */
const NOT_MANY = /(?:ss|us|is|ics|news|series|species|savings|earnings|goods|clothes|canvas|atlas|alias|gas)$/iu;

/** Whether a list's name is already the word for many of its entries: Orders, Assignments, HSBC cards. */
const saysMany = (name: string): boolean => {
  const last = /\p{L}+$/u.exec(name.trim())?.[0] ?? '';
  return last.length >= 4 && /s$/iu.test(last) && !NOT_MANY.test(last);
};

/** The plurals English does not build from the singular, by the singular's last word (audit 58, claim 4: "5 childs"). */
const ODD_MANY: ReadonlyMap<string, string> = new Map([
  ['child', 'children'],
  ['life', 'lives'],
  ['man', 'men'],
  ['woman', 'women'],
  ['leaf', 'leaves'],
  ['knife', 'knives'],
]);

/** Many of a declared singular, where English says how: transaction, transactions; log entry, log entries; box, boxes. */
const manyOf = (one: string): string => {
  const word = one.trim();
  const end = /\p{L}+$/u.exec(word)?.[0] ?? '';
  const odd = ODD_MANY.get(end.toLowerCase());
  /* In the word's own capital, as the rest are. */
  if (odd !== undefined) return `${word.slice(0, word.length - end.length)}${/^\p{Lu}/u.test(end) ? `${odd.charAt(0).toUpperCase()}${odd.slice(1)}` : odd}`;
  /* The one plural English does not build from its singular, kept in the word's own capitals. */
  if (/(?:^|\s)person$/iu.test(word)) return word.replace(/(pe)rson$/iu, '$1ople');
  if (/[^aeiou]y$/iu.test(word)) return `${word.slice(0, -1)}ies`;
  return /(?:s|x|z|ch|sh)$/iu.test(word) ? `${word}es` : `${word}s`;
};

/** The singular each list declares for itself (`one`), by list, read off the declarations the record holds. */
function onesOf(declared: readonly { id: string; kind: string; body: string }[]): Map<string, string> {
  const ones = new Map<string, string>();
  for (const row of declared) {
    if (row.kind !== 'register' || !row.body.includes('"one"')) continue;
    try {
      const one = (JSON.parse(row.body) as { one?: unknown }).one;
      if (typeof one === 'string' && one.trim() !== '') ones.set(row.id.slice('register.'.length), one.trim());
    } catch {
      continue;
    }
  }
  return ones;
}

/**
 * What a person calls several of a list's entries, mid-sentence: the list's own name where it is already that word
 * (Orders, "orders"), else many of the singular it declares (Ledger, "transactions"), else its name and "entries"
 * (Ledger with no singular, "ledger entries"). Never "Ledger has 6": nobody says that of a list.
 *
 * THE DECLARED SINGULAR WINS OVER A NAME THAT ONLY LOOKS LIKE MANY: Finances declaring "transaction" holds
 * transactions, never "6 finances". The name is kept where it ends in many of that singular (HSBC cards, "card").
 */
export const manySaid = (name: string, one: string | undefined, proper: ReadonlySet<string> = NO_WORDS): string => {
  if (one === undefined) return saysMany(name) ? inSentence(name, proper) : `${inSentence(name, proper)} entries`;
  const many = manyOf(inSentence(one, proper));
  const last = (said: string): string => (/\p{L}+$/u.exec(said.trim())?.[0] ?? '').toLowerCase();
  return saysMany(name) && last(name) === last(many) ? inSentence(name, proper) : many;
};

/** A list's words as a sentence says them: its name, one of its entries, and the words that keep their capital. */
export type SaidWords = { name: string; one: string | undefined; proper: ReadonlySet<string> };

/**
 * The words a list is said by: the record's own (`labels`, by label key: `orders`, `orders:one`) where it speaks them,
 * else the words the list declares. So a list declared as Orders and shown as Jobs is offered its jobs.
 *
 * A RENAMED LIST LETS ITS DECLARED SINGULAR GO, unless the record says one of its own: "order" names the old word, and
 * many of Jobs is then read off Jobs. A label that is empty, or the declared name again, renames nothing.
 *
 * `proper` IS READ OFF THE PERSON'S OWN SINGULAR ONLY, where a capitalised word stands beside a lower case one (Etsy
 * order): the declared singular is lower case, so a capital typed over it is meant. One capitalised word alone (Job) is
 * the capital a line starts with.
 */
export const saidWords = (list: string, name: string, one: string | undefined, labels: Readonly<Record<string, string>> | undefined): SaidWords => {
  const word = (key: string): string | undefined => {
    const said = labels?.[key];
    return typeof said === 'string' && said.trim() !== '' ? said.trim() : undefined;
  };
  const shown = word(list);
  const renamed = shown !== undefined && shown !== name.trim();
  const mine = word(`${list}:one`);
  const typed = mine?.match(/\p{L}+/gu) ?? [];
  const proper = typed.some((w) => /^\p{Ll}+$/u.test(w)) ? new Set(typed.filter((w) => CAPITALISED.test(w)).map((w) => w.toLowerCase())) : NO_WORDS;
  return { name: renamed ? shown : name, one: mine ?? (renamed ? undefined : one), proper: new Set(proper) };
};

/**
 * The week offer's sentence: what was seen, then the question, as a person would put it. "4 orders due this week. Want
 * a page of their own for them?" The count leads because it is the news; the list is named by its entries.
 */
export const weekSaid = (n: number, name: string, one: string | undefined, due: boolean, proper: ReadonlySet<string> = NO_WORDS): string =>
  `${n.toLocaleString('en')} ${n === 1 ? (one !== undefined ? inSentence(one, proper) : `${inSentence(name, proper)} entry`) : manySaid(name, one, proper)}${due ? ' due' : ''} this week. Want a page of their own for them?`;

/**
 * The week offers: for each list the caller reads with a day on its entries, at least `PEN_WEEK_FEWEST` of them in this
 * week, read on at least `PEN_WEEKS_READ` different weeks, and no page that reads it by the week, one page of its week.
 * The page holds the list's own figures, what falls this week, what is owed when the day is a due day and an unfinished
 * entry's sum is left empty, and what is running low beside it. Its why says what was seen, in the list's own words.
 *
 * NEVER IN THE RECORD'S FIRST `PEN_YOUNG_DAYS` DAYS, never once its `week:<list>` is dismissed, and never when `boot`
 * has the pen off, since `penFor` is then not asked at all. The cheap questions are asked first: the age once, then for
 * each list its dismissal, its count and its pages, and only then its week and its reads.
 */
function weeksOffered(deps: PenDeps): PenItem[] {
  const { kernel, reads, pages, dismissed, use, labels } = deps;
  if (!use) return [];
  const born = bornOf(use.sql);
  if (born === null || use.nowMs - born < PEN_YOUNG_DAYS * DAY_MS) return [];

  const declared = kernel.declarations();
  const held = heldPages(declared);
  const taken = new Set([...pages.map((p) => p.slug), ...held.map((p) => p.slug)]);
  const packOf = new Map(declared.filter((d) => d.kind === 'register').map((d) => [d.id.slice('register.'.length), d.pack_id]));
  const ones = onesOf(declared);
  const since = dayOf(use.nowMs - WEEKS_BACK * 7 * DAY_MS);
  const lastIn = new Map<string, number>();
  for (const p of pages) if (p.nav) lastIn.set(p.nav.section, Math.max(lastIn.get(p.nav.section) ?? 0, p.nav.order));

  const offers: Offer[] = [];
  for (const [id, decl] of kernel.registers()) {
    if (dismissed.has(signatureOf('week', id)) || !reads(id) || kernel.count(id) < PEN_WEEK_FEWEST) continue;
    const live = decl.fields.filter((f) => f.retired !== true);
    const days = live.filter((f) => f.type === 'day');
    const day =
      days.find((f) => f.deadline === true) ?? days.find((f) => (f as { index?: boolean }).index === true || f.unique === true) ?? days[0];
    const shown = live.filter((f) => !NOT_A_COLUMN.has(f.type)).slice(0, PEN_COLUMNS_MOST);
    const slug = [`${id}-week`, `${id}-this-week`].find((s) => !taken.has(s));
    if (!day || shown.length === 0 || slug === undefined || held.some((p) => byWeek(p, id, new Set(days.map((f) => f.id))))) continue;

    /* AN EMPTY SUM IS ONLY OWED ON A LIST THAT SAYS WHEN AN ENTRY IS FINISHED: a renewal with no cost written is not owed,
       an order neither paid nor marked paid is. So Owed asks for a due day, a done state, and a sum that may be empty. */
    const due = day.deadline === true;
    const finished = decl.state !== undefined && (decl.done?.length ?? 0) > 0 ? { field: decl.state, not_in: [...decl.done!] } : null;
    /* WHAT IS DUE IS WHAT IS NOT FINISHED, in the count said and in the table drawn. A day that is not a due day keeps
       every entry: an order made on Monday and sent is still one of this week's. */
    const toDo = due ? finished : null;
    const got = kernel.list({ register: id, where: weekOf(day.id, dayOf(use.nowMs), toDo) as Where, limit: 1 });
    const n = got.ok ? got.value.matched : 0;
    const drawnBy = pages.filter((p) => p.registers.includes(id));
    if (n < PEN_WEEK_FEWEST || weeksRead(use.sql, id, drawnBy.map((p) => p.slug), since) < PEN_WEEKS_READ) continue;

    const source = `register.${id}`;
    const columns = shown.map((f) => ({ field: f.id, label: fit(labelOf(f), LABEL_BYTES) ?? f.id }));
    const order = [{ field: day.id, dir: 'asc' }];
    const cells = figuresByList(declared, new Set([id])).get(id) ?? [];
    const money = due && finished ? live.find((f) => f.type === 'money' && f.required !== true) : undefined;
    const low = lowBeside(deps, id, packOf);
    const blocks: Json[] = [
      ...(cells.length > 0 ? [{ kind: 'stat', cells: cells.map((metric) => ({ metric })) }] : []),
      {
        kind: 'table',
        heading: fit(due ? 'Due this week' : `${decl.name} this week`, HEADING_BYTES) ?? 'This week',
        source,
        where: thisWeek(day.id, toDo),
        columns,
        order,
        limit: PEN_ROWS_DRAWN,
        empty: fit(`Nothing in ${decl.name} falls in this week.`, EMPTY_BYTES) ?? 'Nothing this week.',
      },
      /* OWED IS A DUE DAY COME OR COMING, NOT FINISHED, WITH THE SUM LEFT EMPTY. */
      ...(money
        ? [
            {
              kind: 'table',
              heading: 'Owed',
              source,
              where: { all: [{ field: day.id, lt: '+7d' }, finished!, { field: money.id, empty: true }] },
              columns,
              order,
              limit: PEN_ROWS_DRAWN,
              empty: fit(`Nothing in ${decl.name} is owed.`, EMPTY_BYTES) ?? 'Nothing is owed.',
            },
          ]
        : []),
      ...(low ? [low.block] : []),
    ];
    /* IN THE SECTION OF A PAGE THAT ALREADY DRAWS THE LIST, so the week sits beside it, else in one named after it. */
    const section = drawnBy.find((p) => p.nav)?.nav?.section ?? fit(decl.name, SECTION_BYTES) ?? id;
    const title = fit(`${decl.name} this week`, HEADING_BYTES) ?? decl.name;
    const body: Record<string, Json> = {
      page: slug,
      title,
      origin: 'derived',
      derived_from: source,
      requires: [source, ...(low ? [`register.${low.register}`] : [])],
      nav: { section, order: Math.min((lastIn.get(section) ?? 0) + 10, ORDER_MOST) },
      blocks,
    };
    if (kernel.lint([{ id: `page.${slug}`, kind: 'page', body }]) !== null) continue;
    taken.add(slug);
    const draft = { id: `page.${slug}`, kind: 'page', body };
    /* THE SENTENCE NAMES THE LIST AS THE RECORD SPEAKS OF IT (Settings, Words), so Orders shown as Jobs is "4 jobs". */
    const said = saidWords(id, decl.name, ones.get(id), labels);
    offers.push({
      rows: n,
      item: { id: signatureOf('week', id), kind: 'page', register: id, title, why: weekSaid(n, said.name, said.one, due, said.proper), change: { to: draft }, list: id, draft },
    });
  }
  return offers
    .sort((a, b) => b.rows - a.rows || a.item.id.localeCompare(b.item.id))
    .slice(0, PEN_MOST)
    .map((o) => o.item);
}
