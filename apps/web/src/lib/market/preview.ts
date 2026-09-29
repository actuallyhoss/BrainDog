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

import { blockOf, type Opened } from '../record/page-live.ts';
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

/** One page of a preview as `PageView` draws it: the page's own title, and each block through `blockOf`. */
export function openedOf(answer: PageAnswer, now: number): Opened {
  const blocks = (answer.blocks as unknown as Parameters<typeof blockOf>[0][]).map((b) => blockOf(b, new Map(), now));
  return { from: 'live', now, page: { page: { page: answer.page, title: answer.title }, blocks } };
}
