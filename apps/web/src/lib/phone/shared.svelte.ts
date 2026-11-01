/**
 * The photos a share brought, held where the palette can draw them and the add can send them (`share.ts`).
 *
 * ONE SHARE AT A TIME. A new share replaces the last; adding something with the photo, or taking it off, lets it go
 * and deletes the phone's copy.
 */

import { BASE } from '$lib/at.ts';
import { REGISTERS } from '$lib/record/held.ts';
import { isFile } from '$lib/record/field-draft.ts';
import { dropShared, photoAt, sendPhoto, sharedPhotos, type Photo, type Sent } from './share.ts';

export const shared = $state({ photos: [] as Photo[], urls: [] as string[] });

/** Take the photos the share left (`photos` of them), and draw them. */
export async function takeShared(count: number): Promise<void> {
  letGo(false);
  const scope = `${location.origin}${BASE}/`;
  const photos = await sharedPhotos(scope, count);
  shared.photos = photos;
  /* DRAWN FROM THE WORKER'S OWN ADDRESS FOR IT (`sharedPhoto`), since the page's policy draws no `blob:` image; the mark
     makes a second share's photo a new address, never the first one's kept by the browser. */
  const mark = Date.now().toString(36);
  shared.urls = photos.map((_, i) => `${photoAt(scope, i)}?v=${mark}`);
}

/** Let the share go: off the screen, and, unless `keep`, out of the phone's cache. */
export function letGo(drop = true): void {
  shared.photos = [];
  shared.urls = [];
  if (drop) void dropShared();
}

/** The list's first file field, where a shared photo goes; `null` when the list keeps no file. */
export const photoField = (register: string): string | null => REGISTERS[register]?.fields.find((f) => isFile(f))?.id ?? null;

/**
 * The photo sent and set as the list's file field, as fields to add to the row: `{}` when nothing was shared, and
 * `null` when the list keeps no file or the photo could not be sent, which the add says.
 */
export async function photoFields(register: string, base: string): Promise<Record<string, Sent> | null | 'none'> {
  const first = shared.photos[0];
  if (!first) return 'none';
  const field = photoField(register);
  if (field === null) return null;
  const sent = await sendPhoto(base, first);
  return sent === null ? null : { [field]: sent };
}
