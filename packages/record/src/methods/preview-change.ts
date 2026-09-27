/**
 * The record's method for trying a whole change before anybody accepts it (`loop/finish/contracts.md` §2.4, pages C2).
 * What it does is `../preview-change.ts`; this file is the door, and its first statement is the guard.
 *
 * HANDED `index.ts`'s WAY OF HOLDING A PAGE AS WELL AS `RecordDeps`, which is why `index.ts` spreads this file itself
 * rather than through `methods/index.ts`, as it spreads `jobs.ts`. `RecordDeps` carries the guards every method needs;
 * a preview also needs the functions `page` and `previewPage` hold a block with (`Holding`), and a copy of those
 * here would be a second rule for who sees what, which is the drift they were written as one function to end.
 *
 * READ+, AND ROUTED AS A POST THOUGH IT KEEPS NOTHING, as `previewPage` is (`packages/host/src/routes/preview-change.ts`):
 * a change is no query string, and inside the rehearsal it writes, every write rolled back before it answers.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { previewer, type ChangePreviewed, type Holding } from '../preview-change.ts';
import type { RecordDeps } from './index.ts';

export function methods(deps: RecordDeps, held: Holding) {
  const { kernel, scoped, readable } = deps;
  const preview = previewer({ kernel, readable, held });

  return {
    /**
     * A change drawn as it would stand: every page it makes, over sample rows if it brings any, beside the page as it
     * is now when the change replaces one. Nothing is kept, observed or sent (`../preview-change.ts` says how).
     *
     * `previewPage` DRAWS ONE PAGE AGAINST THE RECORD AS IT IS, so a change that brings the lists its pages read could
     * not be drawn before it was accepted, and a page per row was drawn with its placeholders. This installs the whole
     * change in a rehearsal, fills a page per row over the row asked for, or the first its `where` admits, and answers
     * each page held to the caller as `page` holds it.
     */
    async previewChange(args: { to?: unknown; rows?: unknown; about?: unknown } | undefined, ctx: CallContext): Promise<Result<ChangePreviewed>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      return preview(args, ctx);
    },
  };
}
