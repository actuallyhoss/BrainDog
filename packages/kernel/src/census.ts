/**
 * THE PAGES CENSUS: what one page's answer says about itself, counted the same way for every page, so a daily
 * read can say how many pages draw a refused block, print a path that named nothing, or show a dash.
 *
 * READ OFF THE ANSWER, NEVER OFF A SECOND SCANNER. `refused` is each block's own refusals, `unresolved` each block's
 * `unnamed` (`pages.ts`), `drawn` each block's `drawn` (`drawn.ts`). The one count the answer does not hold is the
 * dashes: what draws `—` is the page lint's to say (`packages/record/src/page-lint.ts`), which the kernel cannot import,
 * so the record counts them and hands the number in. The glyph names a host draws are the renderer's, handed in the
 * same way; absent, no glyph is judged.
 *
 * PURE: no clock, no record, no I/O.
 */

import type { PageResult } from './pages.ts';

/**
 * Where a page is held: `stored` is a page the record declares, `generated` one a template made for a row, `web` a page
 * written by hand in the app, which the record does not hold (every page is declared, the hand-written included).
 */
export type Held = 'stored' | 'generated' | 'web';

/** One page counted: its blocks, how many draw, each refusal by the block's place, each path that named nothing, each glyph no host draws, each dash. */
export type Census = {
  slug: string;
  held: Held;
  blocks: number;
  drawn: number;
  /** Each refusal a drawn block carries: `n` is the block's place on the page, from nought, `code` the refusal's code. */
  refused: { n: number; code: string }[];
  /** Every `{{path}}` a drawn block prints that names nothing the record has, each once, in the order the page reads. */
  unresolved: string[];
  /** Every glyph a drawn block's heading names that the host does not draw, each once. Empty when no glyph list was handed. */
  glyphs_unknown: string[];
  /** Every chip, row or figure drawn with no value, as the page lint counts them. */
  dashes: number;
};

/** What a census may be told beside the answer: where the page is held, when not the answer's own, and the glyph names a host draws. */
export type CensusAlso = { held?: Held; glyphs?: ReadonlySet<string> };

/**
 * One page's census from its answer and its dash count. A block not drawn (`drawn: false`) is counted in `blocks` and
 * nowhere else: what nobody sees prints nothing. A page made for a row says so by its `param`, so it is `generated`
 * unless `also.held` says otherwise.
 */
export function censusOf(answer: PageResult, dashes: number, also: CensusAlso = {}): Census {
  const refused: { n: number; code: string }[] = [];
  const unresolved = new Set<string>();
  const unknown = new Set<string>();
  let drawn = 0;
  answer.blocks.forEach((b, n) => {
    if (b.drawn === false) return;
    drawn += 1;
    for (const r of b.refusals ?? []) refused.push({ n, code: r.code });
    for (const path of b.unnamed ?? []) unresolved.add(path);
    if (also.glyphs && typeof b.icon === 'string' && !also.glyphs.has(b.icon)) unknown.add(b.icon);
  });
  const held: Held = also.held ?? (answer.param !== undefined && answer.param !== null ? 'generated' : 'stored');
  return {
    slug: answer.page,
    held,
    blocks: answer.blocks.length,
    drawn,
    refused,
    unresolved: [...unresolved],
    glyphs_unknown: [...unknown],
    dashes: Number.isFinite(dashes) && dashes > 0 ? Math.floor(dashes) : 0,
  };
}
