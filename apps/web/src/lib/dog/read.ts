/**
 * A PAGE'S SOURCE, READ FROM WHAT THE RECORD HOLDS.
 *
 * The source view used to print the page's live answer, which is the declaration with every block's reading spread
 * over it (`rows`, `matched`, `values` and the rest), cut down to the keys the first `.dog` dialect knew. What it showed
 * was therefore neither what the record stores nor something that could be applied back. This reads the stored
 * declaration itself, through `arrangement({ page })`, the read an agent makes before it proposes a change to a page, so
 * what `dogText` prints from it is the page as it is written, whole.
 *
 * A PAGE MADE FOR EACH ROW OF A LIST HAS NO DECLARATION OF ITS OWN. Its source is its template's, and `template` names
 * the template so the screen can say that editing it changes every page it makes. `storedOf` (`@braindog/dog`) reads
 * the answer, the one reader `braindog page pull` shares, so the screen and the file cannot disagree about which body
 * is the source.
 *
 * A REFUSAL IS THE RECORD'S SENTENCE, as every other read on a page is (`lib/record/page-live.ts`).
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { storedOf, type Stored } from '@braindog/dog';

/** Injectable so a test can answer without a socket, as every other reader under `lib/record/` is. */
export type Fetch = NonNullable<ClientOptions['fetch']>;

/** The one sentence this read says for itself: a read cannot conflict, and the client's third arm still has to be answered. */
export const readWords = {
  changed: 'The page changed while it was being read.',
} as const;

/**
 * The stored declaration behind the page at `slug`, the version it is at, and the template it was made from, if any.
 *
 * A REFUSAL CARRIES ITS CODE BESIDE THE SENTENCE, so the screen can tell a record it could not reach (`UNREACHABLE`,
 * drawn with Retry) from a page it may not read, without reading the sentence for it.
 */
export async function sourceOf(base: string, slug: string, io?: Fetch): Promise<Stored | { fix: string; code?: string }> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<unknown>('arrangement', { page: slug });
  if (!out.ok) return 'refusal' in out ? { fix: out.refusal.fix, code: out.refusal.code } : { fix: readWords.changed };
  return storedOf(out.value, slug);
}
