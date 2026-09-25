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

import { ROWS } from './data.ts';
import { REGISTERS } from './held.ts';
import { compile, matches } from './where.ts';
import type { Entry, PageBlock, PageDecl } from './schema.ts';

const FIELD = /\{\{([a-z][a-z0-9_]*)\}\}/gi;

/**
 * One string, with the row's own values in it. Unresolved names are left alone, on purpose.
 *
 * `{{spoken}}` is the row's spoken id, `things#1`, which is what an agent run's `project` holds. No
 * field can be called `spoken`, because the record reserves the word. The kernel's own `fill` does not
 * fill it yet, so on a real record a block that reads it draws nothing until it does.
 */
export function fill(text: string, row: Entry, spoken?: string): string {
  return text.replace(FIELD, (whole, field: string) => {
    if (field === 'spoken') return spoken ?? whole;
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

/**
 * One stat cell, filled.
 *
 * A DECLARATION DOES NOT HAVE TO KEEP THE TYPE'S PROMISE, and this one assumed it did.
 * `PageBlock['cells']` writes `label: string`, `label:` is optional wherever these documents are
 * actually authored, and a page is JSON a pack or an agent wrote rather than an object this build
 * constructed. `cells: [{ metric: 'project-open:{{name}}' }]` handed `fill` an `undefined` and got
 * `TypeError: Cannot read properties of undefined (reading 'replace')`, thrown out of `resolvePages`,
 * which the rail, the router and every page listing call, and above the per-block `try/catch` that
 * would have contained it. One optional key missing from one cell of one declaration took every
 * page in the record off the air, which is the same failure class the record's own `fill` records
 * for itself: ONE row called `C:\Repos` made every page unlistable.
 *
 * A REFUSAL IS A VALUE. The page draws, and the cell falls back to the metric it reads, because a
 * figure with a blank caption is a figure nobody can name and the metric id is the truest short
 * sentence available about what is being counted.
 *
 * The parameter is annotated with the shape a document can actually have rather than the shape the
 * type hopes for, so the fallback is a fact the compiler can see rather than one it argues with.
 */
const fillCell = (c: { metric: string; label?: string }, row: Entry): { metric: string; label: string } => ({
  metric: fill(c.metric, row),
  label: fill(c.label ?? c.metric, row),
});

const fillBlock = (b: PageBlock, row: Entry, spoken: string): PageBlock => ({
  ...b,
  ...(b.heading === undefined ? {} : { heading: fill(b.heading, row, spoken) }),
  ...(b.where === undefined ? {} : { where: fill(b.where, row, spoken) }),
  ...(b.empty === undefined ? {} : { empty: fill(b.empty, row, spoken) }),
  ...(b.body === undefined ? {} : { body: fill(b.body, row, spoken) }),
  /* A diff names the row it reads, and on a template that row is the page's own: `row: {{spoken}}`. */
  ...(b.row === undefined ? {} : { row: fill(b.row, row, spoken) }),
  ...(b.cells === undefined ? {} : { cells: b.cells.map((c) => fillCell(c, row)) }),
  ...(b.authored === undefined
    ? {}
    : { authored: b.authored.map((r) => ({ ...r, cells: r.cells.map((c) => fill(c, row)) })) }),
});

/**
 * Every page there actually is: the ones declared outright, plus one per row for each template.
 *
 * Recomputed on read rather than cached, because the rows it depends on are the record. In the real
 * client this is the same expansion the kernel does when it answers `pages()`.
 *
 * `now` IS THE CLOCK THE ROWS ARE MATCHED AT, and the sample's `pages` in `fixtures/readers.ts`
 * passes the sample's with the sample's rows.
 */
export function resolvePages(declared: Record<string, PageDecl>, now: number = Date.now()): Record<string, PageDecl> {
  const out: Record<string, PageDecl> = {};
  const taken = new Set<string>();

  /**
   * A slug nothing else has.
   *
   * THE NUMBERED FALLBACK WAS NEVER CHECKED AGAINST ANYTHING, so the collision it exists to break
   * could happen to it, and `out[slug] = ...` overwrites. A hand-written page `kiln`, a hand-written
   * page `kiln-1` and a template row titled "Kiln" at seq 1 gave nine pages in the record and eight
   * here: the template's Kiln took `kiln-1` from "Kiln one, by hand", and that page was gone from
   * the record's page list entirely. Not listed and unreachable would be bad enough. DELETED.
   *
   * Counting up terminates because `taken` is finite and every step adds to it. It is the record's
   * own `claim`, and it is copied rather than reinvented so the two page lists cannot drift again.
   */
  const claim = (base: string, seq: number | null): string => {
    if (!taken.has(base)) {
      taken.add(base);
      return base;
    }
    let unique = `${base}-${seq ?? taken.size}`;
    for (let n = 2; taken.has(unique); n += 1) unique = `${base}-${seq ?? taken.size}-${n}`;
    taken.add(unique);
    return unique;
  };

  for (const decl of Object.values(declared)) {
    /* THROUGH `claim` TOO, because two declarations may write the same `page:` and one of them was
       overwriting the other in exactly the way the template expansion below did. A pack installs
       pages it did not author beside pages it did. */
    if (!decl.for) out[claim(decl.page, null)] = decl;
  }

  for (const decl of Object.values(declared)) {
    if (!decl.for) continue;
    const register = decl.for.register;
    const reg = REGISTERS[register];
    if (!reg) continue;

    const w = compile(register, decl.for.where, now);
    /* A template whose own `for:` predicate cannot be read produces NO pages rather than one per
       row of the register. The same rule as everywhere else: an unreadable filter matches nothing. */
    if (w.bad.length) continue;

    /**
     * THE RECORD'S CLOCK, WHICH THIS ONE LINE ALONE DID NOT USE.
     *
     * It read `Date.now()` while every other date in the browser resolved against the mock's clock:
     * `filterForBlock` passed it, and `metrics.read` and `forecast.runway` defaulted to it. Only this
     * line did not, so a template whose `for:` said `state is open, due before today` expanded against
     * the wall clock while its blocks then filtered against the record's. Four pages existed
     * where the record has three: the extra one is an obligation falling between the two clocks,
     * it drew a heading and no rows, and the set drifted by a day every day while nothing else
     * on the record moved.
     *
     * The browser disagreed with ITSELF here before it disagreed with the record, which is what
     * makes it a typo rather than a judgement. The shipped project template is undated, so this was
     * latent, and latent is not fixed.
     */
    const rows = (ROWS[register] ?? []).filter((e) => matches(e, w, now));
    rows.forEach((row, n) => {
      const title = String(row.fields[reg.title] ?? `${register}#${row.seq}`);
      /* A collision keeps the row's number, so two projects called the same thing are still two
         pages and neither of them silently replaces the other. */
      const slug = claim(slugify(title), row.seq);
      /* The kernel's spelling of a spoken id (`scope.ts`): the register's prefix, or `register#`. */
      const spoken = `${reg.seq_prefix && reg.seq_prefix !== '#' ? reg.seq_prefix : `${register}#`}${row.seq}`;

      out[slug] = {
        ...decl,
        page: slug,
        title: fill(decl.title, row),
        param: { register, seq: row.seq, title },
        identity: { register, seq: row.seq },
        ...(decl.nav ? { nav: { ...decl.nav, order: decl.nav.order + n } } : {}),
        blocks: decl.blocks.map((b) => fillBlock(b, row, spoken)),
      };
    });
  }

  return out;
}
