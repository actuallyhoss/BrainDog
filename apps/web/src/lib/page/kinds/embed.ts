/**
 * An `embed` block, written from the record's answer: one authored row, `url | title | aspect`, drawn by
 * `braindog-render` as a facade that becomes a sandboxed frame when a reader presses Load
 * (`packages/render/src/embed.ts`).
 *
 * AUTHORED ROWS ONLY. An embed is one bounded thing a page's author chose, never rows of a list, and the record
 * refuses one over a `source:` at install; a block that arrives with neither is the empty state every kind says.
 * The address is written as typed and the renderer checks it against `EMBED_PROVIDERS`, the same list the record
 * copied, so an address nobody frames is the author's fence with the sentence that says which providers there are.
 */

import type { KindDrawer } from './index.ts';
import { authoredOf, escapeCell, fenced } from './dialect.ts';

export const embed: KindDrawer = {
  draw(result, opts) {
    const [first] = authoredOf(result);
    return fenced('embed', first ? [first.cells.slice(0, 3).map(escapeCell).join(' | ')] : [], opts);
  },
};
