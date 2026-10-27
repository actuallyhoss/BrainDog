/**
 * `slashDraft`: what the owner described, drafted by Slash's model, every draft tried with `previewChange` and mended at
 * most twice, and nothing filed.
 *
 * IT IS `slashPropose({ asked })` WITHOUT THE LAST STEP. A page that asks Slash for a desk, and the first run, show the
 * drafts drawn before anything is written, and the owner keeps one or asks again; `slashPropose` files what this would
 * answer. So the whole path is one function in `index.ts` (`slashDrafted`), handed here as `slashDescribed`, because a
 * method file is handed the record's guards and not its model, its reading of use or Slash's ledger.
 *
 * WHAT IT WRITES IS THE ASK LEDGER'S ROW, one for each ask: the first and at most `SLASH_REPAIRS_MOST` repairs after it,
 * each held against `ask_cap` before the model is called. Every draft is drawn inside a rehearsal that keeps
 * nothing, and the sample rows the model proposes are drawn in it and returned, never filed.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { askedFault, declinedFault, pageFault, previewerOf, type SlashDeclined, type SlashDrafted, type SlashPreviewer } from '../slash.ts';
import type { RecordDeps } from './index.ts';

/** The keys `slashDraft` takes, named in the sentence that refuses any other. */
const TAKES = ['asked', 'page', 'body', 'not'] as const;

/** The described path as `index.ts` hands it over (`RecordDeps.slashDescribed`), absent on a record built without it. */
type SlashDescribe = (args: { asked: string; page?: string; body?: Record<string, unknown>; not?: SlashDeclined[] }, ctx: CallContext, preview: SlashPreviewer | null) => Promise<Result<SlashDrafted>>;

/**
 * THE BODY A PAGE IS DRAWN FROM WHILE THE RECORD HOLDS NONE: Today and Decide are built in the browser until a
 * first change keeps them, so the sheet hands the body it drew and the draft changes that. A page with blocks, or nothing.
 */
const builtFault = (body: unknown): string | null =>
  typeof body === 'object' && body !== null && !Array.isArray(body) && Array.isArray((body as { blocks?: unknown }).blocks)
    ? null
    : 'body is the page as it is drawn now, with its blocks, for a page the record does not hold yet.';

export function methods(deps: RecordDeps) {
  const { admin, no } = deps;
  /* READ AS A FIELD THAT MAY BE MISSING, so a record whose `RecordDeps` does not carry the described path answers
     `NOT_IN_THIS_BUILD` in a sentence rather than failing to build. */
  const described = (deps as RecordDeps & { slashDescribed?: SlashDescribe }).slashDescribed;

  return {
    /**
     * Drafts from a description, each with the rows it is drawn over and what it drew, and why each other one was dropped.
     *
     * AN OWNER'S, IN A BROWSER, as `slashPropose` is: it spends the month's asks, and the reading it hands the model
     * covers every list the owner reads. `this` IS THE RECORD, whose `previewChange` is another file's method under
     * `methods/` (`previewerOf`), and the host calls every row's method on the record.
     */
    async slashDraft(args: { asked?: unknown; page?: unknown; body?: unknown; not?: unknown } | undefined, ctx: CallContext): Promise<Result<SlashDrafted>> {
      const stop = admin(ctx, 'ask Slash to draft from what you described');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const stray = Object.keys(said).find((k) => !(TAKES as readonly string[]).includes(k));
      if (stray !== undefined) return no('FIELD_UNKNOWN', `${stray} is not something this call takes. It takes ${TAKES.join(', ')}.`, { at: stray, allowed: [...TAKES] });
      if (said.asked === undefined) return no('REQUIRED_MISSING', 'asked is what you want Slash to build, in a sentence or a few.', { at: 'asked' });
      const unasked = askedFault(said.asked);
      if (unasked) return { ok: false, refusal: unasked };
      const unpaged = said.page === undefined ? null : pageFault(said.page);
      if (unpaged) return { ok: false, refusal: unpaged };
      if (said.body !== undefined) {
        if (said.page === undefined) return no('REQUIRED_MISSING', 'page is the slug of the page body is drawn as.', { at: 'page' });
        const unbuilt = builtFault(said.body);
        if (unbuilt) return no('VALUE_MALFORMED', unbuilt, { at: 'body' });
      }
      /* TRY AGAIN (§45): the same words, with the drafts he turned down handed back so the model drafts another way. */
      if (said.not !== undefined) {
        const unsaid = declinedFault(said.not);
        if (unsaid) return no('VALUE_MALFORMED', unsaid, { at: 'not' });
      }
      if (described === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot draft from a description yet, so the model was not asked.');
      const asked = String(said.asked).trim();
      const page = typeof said.page === 'string' ? said.page.trim() : undefined;
      const body = said.body === undefined ? {} : { body: said.body as Record<string, unknown> };
      const not = said.not === undefined || (said.not as unknown[]).length === 0 ? {} : { not: said.not as SlashDeclined[] };
      return described({ asked, ...(page === undefined ? {} : { page }), ...body, ...not }, ctx, previewerOf(this, ctx));
    },
  };
}
