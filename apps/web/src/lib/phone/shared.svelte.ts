/**
 * The photos a share brought, held where the palette can draw them and the add can send them (`share.ts`).
 *
 * ONE SHARE AT A TIME. A new share replaces the last; adding something with the photo, or taking it off, lets it go
 * and deletes the phone's copy.
 */

import { BASE } from '$lib/at.ts';
import { REGISTERS } from '$lib/record/held.ts';
import { isFile } from '$lib/record/field-draft.ts';
import { dropShared, sendPhoto, sharedPhotos, type Photo, type Sent } from './share.ts';

export const shared = $state({ photos: [] as Photo[], urls: [] as string[] });

/** Take the photos the share left (`photos` of them), and draw them. */
export async function takeShared(count: number): Promise<void> {
  letGo(false);
  const photos = await sharedPhotos(`${location.origin}${BASE}/`, count);
  shared.photos = photos;
  shared.urls = photos.map((p) => URL.createObjectURL(p.blob));
}

/** Let the share go: off the screen, and, unless `keep`, out of the phone's cache. */
export function letGo(drop = true): void {
  for (const u of shared.urls) URL.revokeObjectURL(u);
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
