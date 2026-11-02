/**
 * An add-on's pages as a record holding it would draw them: the `.preview.json` the Kennel keeps beside a version's file
 * (`Preview`), read and turned into what `PageView` draws.
 *
 * ONLY A TRUSTED PARTY MAKES ONE (the integrator's `from-packs` run, the operator's review), and the Kennel answers it
 * only for a version whose index entry says `preview: true`, so nothing here asks for a picture nobody vouched for.
 *
 * CONVERTED WITH THE PAGE'S OWN `blockOf` (`lib/record/page-live.ts`), the function every live page goes through, and
 * drawn by `PageView` with `mode: 'preview'`, which hands no block a write. One renderer draws a page and its preview, so
 * a preview cannot draw a block the installed page would draw differently.
 */

import type { EntryKind, PageAnswer, Preview } from '@braindog/declare/catalogue';

import { REGISTERS } from '../record/held.ts';
import { blockOf, type Opened } from '../record/page-live.ts';
import { declOf } from '../record/remote.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { KENNEL_AT } from './counts.ts';
import { words } from './words.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Where a version's preview sits in the Kennel: `previewFile` in `@braindog/declare/catalogue`, the same path. */
export const previewAt = (kind: EntryKind, id: string, version: string): string =>
  `${KENNEL_AT}${kind === 'pack' ? 'packs' : 'usecases'}/${encodeURIComponent(id)}/${encodeURIComponent(version)}.preview.json`;

export type PreviewRead = { state: 'none' } | { state: 'ready'; preview: Preview } | { state: 'refused'; fix: string };

/**
 * A version's preview, read and checked for its shape. `none` when the Kennel has none for it (a 404, or no Kennel at
 * all), which the caller draws as names; `refused` when one is there and does not read.
 */
export async function readVersionPreview(fetcher: Fetcher, kind: EntryKind, id: string, version: string): Promise<PreviewRead> {
  let doc: unknown;
  try {
    const res = await fetcher(previewAt(kind, id, version), { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return { state: 'none' };
    doc = await res.json();
  } catch {
    return { state: 'none' };
  }
  const { readPreview } = await import('@braindog/declare/catalogue');
  const read = readPreview(doc);
  return read.ok ? { state: 'ready', preview: read.value } : { state: 'refused', fix: 'refusal' in read ? read.refusal.fix : words.previewRefused };
}

/**
 * A BLOCK OF FIGURES THE RECORD LEFT UNDRAWN FOR HAVING NOTHING TO COUNT IS DRAWN WITH ITS FIGURES IN A PREVIEW. A live
 * page leaves such a block out (`drawn: false`, `why: 'empty'`), but a preview draws every block to show the page's
 * shape, and this one drew "Nothing matched." under "Where the goals stand" in a page that says it is an example. Its
 * readings came with it, so its tiles are drawn as read, each figure at nought, and never a sentence about a search.
 */
function shown<T extends { drawn?: unknown; why?: unknown; readings?: unknown }>(b: T): T {
  if (b.drawn !== false || b.why !== 'empty' || !Array.isArray(b.readings) || b.readings.length === 0) return b;
  const { drawn: _drawn, why: _why, ...rest } = b;
  return rest as T;
}

/**
 * One page of a preview as `PageView` draws it: the page's own title, and each block through `blockOf`.
 *
 * THE ADD-ON'S OWN LISTS ARE LENT FOR THE DRAWING (`lists`, its file's list declarations) and taken back after it
 * `blockOf` labels a list's cells from what this tab knows of it, and a list the record
 * does not hold yet drew "This part of the page cannot be drawn from the record yet" on every part of the preview. One
 * the record already holds is never replaced, and none is left behind for the rest of the tab to offer.
 */
export function openedOf(answer: PageAnswer, now: number, lists: readonly Record<string, unknown>[] = []): Opened {
  const lent: string[] = [];
  for (const d of lists) {
    const id = typeof d.register === 'string' ? d.register : null;
    if (id === null || REGISTERS[id] !== undefined || !Array.isArray(d.fields)) continue;
    REGISTERS[id] = declOf({ ...(d as unknown as RegisterDecl), id });
    lent.push(id);
  }
  try {
    const blocks = (answer.blocks as unknown as Parameters<typeof blockOf>[0][]).map((b) => blockOf(shown(b), new Map(), now));
    return { from: 'live', now, page: { page: { page: answer.page, title: answer.title }, blocks } };
  } finally {
    for (const id of lent) delete REGISTERS[id];
  }
}
