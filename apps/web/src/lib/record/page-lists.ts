/**
 * The lists a declared page's answer was read from, as the local copy names them (`lib/data/local.ts`): each block's
 * `register.<id>` source and an `inputs` block's list, `QUESTIONS` for a queue of them, and `PAGE_FIGURES` first, a name
 * no list can have, for the figures, feeds and walks no change line names.
 *
 * A PAGE IS KEPT `always`, so it is drawn only while it is asked again and these names only say when it goes sooner. A
 * page drawing the kernel's runs (`sessions.*`) names `session`, which the copy never keeps. PURE, so
 * `page-lists.test.ts` runs it.
 */

import { QUESTIONS } from '../data/local.ts';

/** What a page holds that is not rows of a list: figures, the log, walks. */
export const PAGE_FIGURES = ':page';

type BlockLike = { source?: unknown; kind?: unknown; register?: unknown };

export function pageLists(blocks: readonly unknown[]): string[] {
  const out = new Set<string>([PAGE_FIGURES]);
  for (const raw of blocks) {
    const b = (typeof raw === 'object' && raw !== null ? raw : {}) as BlockLike;
    const source = typeof b.source === 'string' ? b.source : '';
    if (source.startsWith('sessions.')) out.add('session');
    else if (source.startsWith('register.')) out.add(source.slice('register.'.length));
    else if (source.startsWith('governance.')) out.add(QUESTIONS);
    if (b.kind === 'inputs' && typeof b.register === 'string' && b.register !== '') out.add(b.register);
  }
  return [...out];
}
