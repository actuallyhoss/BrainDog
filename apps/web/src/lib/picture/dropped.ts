/**
 * The picture a drop or a paste holds, on its own: the mark's hover takes a dropped picture with no crop or canvas code
 * under it, which stays in `crop.ts`, loaded with the changer (`PictureSheet.svelte`).
 */

/** The first picture a paste or a drop holds, or `null`. */
export function pictureIn(data: DataTransfer | null | undefined): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files ?? [])) if (file.type.startsWith('image/')) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}
