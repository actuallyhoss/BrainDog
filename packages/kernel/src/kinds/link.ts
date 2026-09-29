/**
 * `link`: a list of places to go, each a title, an address and an optional note.
 *
 * OVER A LIST it names two or three columns, the title, the address and a note (`columns: [name, url, note]`), and the
 * address is a `url` or a `text` field, text because a path of this BrainDog is not a url the record stores. It may
 * instead write its rows out, each `{ cells: [title, address, note] }`, the note left off when there is none.
 *
 * AN ADDRESS IS ONE THE RENDERER WILL DRAW AS A LINK: `https:`, `mailto:`, `#` and a path of this BrainDog, exactly
 * `safeHref` in `packages/render/src/inline.ts`, which a drawer asks of every row. A row written out is refused here
 * when it would not be, in the sentence the drawer degrades a list's row with, so an author hears at install what a
 * reader would otherwise see as a link that goes nowhere. A list's rows change after install, and those are the
 * drawer's to degrade. Nothing is fetched and no icon is asked for.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { KindModule } from './index.ts';
import { authoredCells, invalid, listedFault, readListed } from './listed.ts';

/** How many links a block draws when it says no `limit:`, as a table does (`pages.ts`). */
const LINKS_DRAWN = 50;

/** The drawer's own sentence for an address it cannot draw as a link. */
export const LINK_SAID = 'A link is an https address, a mailto or a path of this BrainDog.';

/**
 * Whether the renderer draws an address as a link: `safeHref` in `packages/render/src/inline.ts`, copied because the
 * kernel does not import the renderer (`declare.ts` says why of `BLOCK_KINDS`). A leading slash is not enough: `//host`
 * and `/\host` are another site wearing the shape of a path.
 */
export function linkable(href: string): boolean {
  const h = href.trim();
  if (h.startsWith('#')) return true;
  if (h.startsWith('/')) return !/^\/[/\\]/u.test(h);
  return /^https:\/\//iu.test(h) || /^mailto:/iu.test(h);
}

export const link: KindModule = {
  keys: [],

  validate(block, ctx) {
    const shape = listedFault(block, 'link', { fewest: 2, most: 3, said: 'two or three columns, the title, the address and a note, such as columns: [name, url, note]' }, ctx.stage);
    if (shape) return shape;
    /* THE ADDRESS IS CHECKED AND THE COUNT OF CELLS IS NOT, which a drawer degrades (`declare.ts`, `05 §2.1`). */
    for (const cells of authoredCells(block) ?? []) {
      const address = cells[1];
      if (address === undefined)
        return invalid('A link written out is its title, its address and a note, such as { cells: [Handbook, /p/handbook] }, the note left off when there is none.', 'authored');
      if (typeof address !== 'string' || !linkable(address)) return invalid(LINK_SAID, 'authored');
    }
    return null;
  },

  read(deps, block, base) {
    if (!block.source) return base;
    /* A LIMIT OF ZERO DRAWS NOTHING, which is what it says, as it does on a table. */
    const limit = block.limit === undefined ? LINKS_DRAWN : Math.max(0, Math.floor(block.limit));
    if (limit === 0) return { ...base, matched: 0 };
    const listed = readListed(deps, block, 'link', {
      rules: [null, { types: ['url', 'text'], said: 'the address, a url or a text field' }, null],
      limit,
    });
    if ('refusals' in listed) return { ...base, refusals: [...base.refusals, ...listed.refusals] };
    return { ...base, rows: listed.rows, matched: listed.matched };
  },
};
