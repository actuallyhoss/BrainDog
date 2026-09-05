/**
 * A page declaration, resolved.
 *
 * ONE DECLARATION, ONE PAGE PER ROW. A project page is the register's own numbers with a
 * `thing is Kiln` on the front — that sentence was written in a comment above the old metric switch
 * and was false in the code under it. Four projects meant four page rows with the name typed into
 * every predicate, every metric id and every heading, and the page route stripped the repeated
 * clause back out with a string heuristic, which is the admission that the clause should never have
 * been typed in the first place.
 *
 * A page declaring `for:` is a template. Every `{{field}}` in it resolves against one row of that
 * register, and the template becomes one page per row its `where` admits.
 *
 * THE SLUG COMES FROM THE ROW, NOT FROM A COUNTER. `/p/kiln` was a hand-written page and stays
 * `/p/kiln`; a fifth project gets `/p/<its own name>`. A counter would have renamed every existing
 * link the day somebody reordered the register, and a link into a record is a thing people paste
 * into messages.
 *
 * SUBSTITUTION IS ONE PASS OVER STRINGS AND IT IS NOT A TEMPLATE LANGUAGE — no expressions, no
 * conditionals, no filters. A `{{field}}` the row does not carry is left as it was written, so it
 * reaches the block's refusal surface as the unresolved path it is rather than as an empty string
 * that quietly matches everything.
 */

import { REGISTERS, ROWS } from './data.ts';
import { compile, matches } from './where.ts';
import type { Entry, PageBlock, PageDecl } from './schema.ts';

const FIELD = /\{\{([a-z][a-z0-9_]*)\}\}/gi;

/** One string, with the row's own values in it. Unresolved names are left alone, on purpose. */
export function fill(text: string, row: Entry): string {
  return text.replace(FIELD, (whole, field: string) => {
    const value = row.fields[field];
    return value === null || value === undefined || value === '' ? whole : String(value);
  });
}

/** A URL segment from a row's title: what a person would type, not what a counter would produce. */
export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

const fillBlock = (b: PageBlock, row: Entry): PageBlock => ({
  ...b,
  ...(b.heading === undefined ? {} : { heading: fill(b.heading, row) }),
  ...(b.where === undefined ? {} : { where: fill(b.where, row) }),
  ...(b.empty === undefined ? {} : { empty: fill(b.empty, row) }),
  ...(b.body === undefined ? {} : { body: fill(b.body, row) }),
  ...(b.cells === undefined
    ? {}
    : { cells: b.cells.map((c) => ({ metric: fill(c.metric, row), label: fill(c.label, row) })) }),
  ...(b.authored === undefined
    ? {}
    : { authored: b.authored.map((r) => ({ ...r, cells: r.cells.map((c) => fill(c, row)) })) }),
});

/**
 * Every page there actually is: the ones declared outright, plus one per row for each template.
 *
 * Recomputed on read rather than cached, because the rows it depends on are the record. In the real
 * client this is the same expansion the kernel does when it answers `pages()`.
 */
export function resolvePages(declared: Record<string, PageDecl>): Record<string, PageDecl> {
  const out: Record<string, PageDecl> = {};
  const taken = new Set<string>();

  for (const decl of Object.values(declared)) {
    if (!decl.for) {
      out[decl.page] = decl;
      taken.add(decl.page);
    }
  }

  for (const decl of Object.values(declared)) {
    if (!decl.for) continue;
    const register = decl.for.register;
    const reg = REGISTERS[register];
    if (!reg) continue;

    const w = compile(register, decl.for.where);
    /* A template whose own `for:` predicate cannot be read produces NO pages rather than one per
       row of the register. The same rule as everywhere else: an unreadable filter matches nothing. */
    if (w.bad.length) continue;

    const rows = (ROWS[register] ?? []).filter((e) => matches(e, w, Date.now()));
    rows.forEach((row, n) => {
      const title = String(row.fields[reg.title] ?? `${register}#${row.seq}`);
      /* A collision keeps the row's number, so two projects called the same thing are still two
         pages and neither of them silently replaces the other. */
      const base = slugify(title);
      const slug = taken.has(base) ? `${base}-${row.seq}` : base;
      taken.add(slug);

      out[slug] = {
        ...decl,
        page: slug,
        title: fill(decl.title, row),
        param: { register, seq: row.seq, title },
        identity: { register, seq: row.seq },
        ...(decl.nav ? { nav: { ...decl.nav, order: decl.nav.order + n } } : {}),
        blocks: decl.blocks.map((b) => fillBlock(b, row)),
      };
    });
  }

  return out;
}
