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
 * `kind: 'block'` and `kind: 'column'` join `kind: 'page'` here in W2 (PGS-17), under the same `PenItem`.
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
  kernel: Pick<Kernel, 'registers' | 'count' | 'declarations' | 'lint'>;
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
export function penFor(deps: PenDeps): PenItem[] {
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
