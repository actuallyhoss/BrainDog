/**
 * `pages`: one row a page, read off the pages census (PGS-A11 job 3, over PGS-A01): its address and title, how many
 * blocks it has and how many draw, how many are refused, how many paths name nothing, and how many dashes it shows. The
 * census as rows, so a page can draw the record's own health of pages as a table and sort it by what is broken.
 *
 * WHOLE-RECORD ONLY (`whole: true`): the kernel names a block over it `*`, so a reader who does not read the whole record
 * is held from it, as the census across every page is a whole reader's question. Each row is `censusOf` over the page's
 * own answer, and the dashes are the page lint's count (`lintAnswer`), the two `pages-census.ts` counts by.
 *
 * A READ OF IT NEVER READS ITSELF: a page that draws `pages` is counted while it is read, and the census inside that
 * count answers no rows, so one page over the census is never read a page at a time forever.
 */

import { censusOf, viewerOfRead, type PageResult } from '@braindog/kernel';
import type { Schema } from '@braindog/where';

import { ROUND_MS, lintAnswer } from '../page-lint.ts';
import { answerRows, sourceRow, type SourceMaker } from './index.ts';

/** The two findings of the page lint that draw a dash, as `pages-census.ts` counts them. */
const DASH_RULES: ReadonlySet<string> = new Set(['no-reading', 'only-a-dash']);

const SCHEMA: Schema = {
  register: 'pages',
  fields: {
    slug: { type: 'text', label: 'Address' },
    title: { type: 'text', label: 'Page' },
    blocks: { type: 'int', label: 'Blocks' },
    drawn: { type: 'int', label: 'Drawn' },
    refused: { type: 'int', label: 'Refused' },
    unresolved: { type: 'int', label: 'Names that find nothing' },
    dashes: { type: 'int', label: 'Dashes' },
  },
};

/** Whether a census is being read now, so a page over it, read inside the census, answers none rather than itself. */
let reading = false;

export const pages: SourceMaker = ({ kernel, ctx }) => {
  let held: ReturnType<typeof sourceRow>[] | null = null;
  const all = (): ReturnType<typeof sourceRow>[] => {
    if (held) return held;
    held = [];
    if (reading) return held;
    reading = true;
    try {
      const listed = kernel.pages();
      /* THE PAGES SOMEBODY WROTE FIRST, then the ones each template made, and bounded as the census's round is. */
      const order = [...listed.filter((p) => p.template === null), ...listed.filter((p) => p.template !== null)];
      const start = Date.now();
      for (const p of order) {
        if (held.length > 0 && Date.now() - start > ROUND_MS) break;
        let answer: PageResult;
        try {
          const out = kernel.page(p.slug, undefined, { viewer: viewerOfRead(ctx) });
          if (!out.ok) continue;
          answer = out.value;
        } catch {
          continue;
        }
        const dashes = lintAnswer(answer, null).filter((f) => DASH_RULES.has(f.rule)).length;
        const c = censusOf(answer, dashes, { held: p.template === null ? 'stored' : 'generated' });
        held.push(
          sourceRow('pages', c.slug, { slug: c.slug, title: answer.title, blocks: c.blocks, drawn: c.drawn, refused: c.refused.length, unresolved: c.unresolved.length, dashes: c.dashes }, null),
        );
      }
    } finally {
      reading = false;
    }
    return held;
  };
  return {
    says: 'Every page, with how many of its blocks draw and what is wrong on it.',
    whole: true,
    schema: SCHEMA,
    rows: (q) => answerRows(all(), SCHEMA, q),
  };
};
