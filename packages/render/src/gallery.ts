/**
 * What a `gallery` decides, as functions both drawers call: which cell is a picture the host can serve, and what each
 * tile says.
 *
 * Kept out of the markup for the reason `path.ts` is: an answer here can be tested without a DOM, and two drawers that
 * each worked it out would be two answers.
 *
 * A ROW IS `caption | file`. The file cell is `file:<list>#<seq>/<field>`, the form a queue option names a file the
 * record holds in (`queue.ts`), or a file's name as words. Only the host knows where a file is served, so the first
 * form is turned into an address by `RenderOptions.file` and drawn only when that address is a path of the host's own
 * (`fileSrc`): a remote picture on a page tells another host who is reading and when (`06 §7`).
 *
 * THE HOST DECIDES WHICH FILES ARE PICTURES, because only it holds the file's type. A page's writer names a file by
 * reference when it is one of `PICTURE_MIMES`, and by its name otherwise, so a PDF in a gallery is a tile that says
 * which PDF it is rather than a broken picture.
 *
 * `card`'s `picture` role reads its cell the same way, so a card and a gallery tile draw one file one way.
 */

import { fileSrc, showsOf } from './queue.ts';
import type { RenderOptions } from './html.ts';

/** The file types a tile or a card draws as a picture. Anything else is drawn as its name. */
export const PICTURE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const;

/** Whether a file of this type is drawn as a picture. */
export const isPictureMime = (mime: string): boolean => (PICTURE_MIMES as readonly string[]).includes(mime.trim().toLowerCase());

/** The words the drawers write that no author did, here because this package cannot import the app's copy. */
export const GALLERY_NONE = 'Nothing to show.';

/** The row and field a `file:` cell names, or null for a cell that names none. */
export function fileRef(cell: string): { row: string; field: string } | null {
  const shows = showsOf(cell);
  return shows && 'file' in shows ? shows.file : null;
}

/**
 * Where a `file:` cell is drawn from, or null: the host's own answer, and only when it is a path of the host's.
 *
 * A cell that names a file the host cannot serve draws no picture and no reference either. `parts#2/photo` is how the
 * record finds a file, not words a reader says.
 */
export function pictureSrc(cell: string, file: RenderOptions['file']): string | null {
  const ref = fileRef(cell);
  return ref ? fileSrc(file?.(ref.row, ref.field)) : null;
}

/** One tile as it is drawn: a picture, or the file's name, and the caption under either. */
export type GalleryTile<R> = { row: R; src: string | null; name: string; caption: string };

/**
 * Every row as a tile, in the order the rows came, leaving out a row that has nothing at all to show.
 *
 * A `file:` cell is a picture or nothing, never its reference; any other cell is the file's name. A tile with neither a
 * picture, a name nor a caption would be an empty box on the page, so it is left out.
 */
export function galleryPlan<R extends { cells: readonly string[] }>(rows: readonly R[], file: RenderOptions['file']): GalleryTile<R>[] {
  return rows.flatMap((row) => {
    const cell = (row.cells[1] ?? '').trim();
    const referenced = fileRef(cell) !== null;
    const src = referenced ? pictureSrc(cell, file) : null;
    const name = referenced ? '' : cell;
    const caption = (row.cells[0] ?? '').trim();
    return src === null && name === '' && caption === '' ? [] : [{ row, src, name, caption }];
  });
}
