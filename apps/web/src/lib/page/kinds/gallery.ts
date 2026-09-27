/**
 * A `gallery` block, written from the record's answer: `caption | file` a row, drawn by `braindog-render` as a tile a
 * row (`packages/render/src/gallery.ts`).
 *
 * OVER A LIST, `columns: [{ field: <caption> }, { field: <file field> }]`. A file field holds `{ sha256, mime, bytes,
 * name }`; ONLY THIS SIDE KNOWS THE FILE'S TYPE, so a picture (`isPictureMime`) is written by reference,
 * `file:<list>#<seq>/<field>`, which the page's `RenderOptions.file` turns into the address the record serves it at,
 * and any other file is written as its name. A tile with no caption is captioned by the file's name, because the
 * picture has no words of its own and the caption is its name to a screen reader.
 *
 * A REFERENCE IS WRITTEN ONLY IN A SHAPE THE RENDERER READS AS ONE (`showsOf`): a row or a field whose id it would not
 * read is written as the file's name, never as a reference printed on the tile.
 *
 * AUTHORED ROWS KEEP THE SAME RULE. The record answers each written-out file in `files`, aligned with the rows
 * (`packages/kernel/src/kinds/gallery.ts`), so a picture keeps the reference its author typed, any other file is
 * written as its name, and one the record does not hold is its caption alone. Written as typed, a PDF named by
 * reference would reach the renderer as a picture it cannot draw. A record that sent no `files`, or files that do not
 * line up with the rows, has its rows written as they were typed.
 */

import { isPictureMime, showsOf } from 'braindog-render';

import { display } from '../../record/api.ts';
import type { KindDrawer } from './index.ts';
import { authoredOf, entriesOf, escapeCell, fenced, fieldsOf, listOf } from './dialect.ts';

/** A file field's value, narrowed to what a tile reads, or null for a value that is no file. */
function fileOf(v: unknown): { mime: string; name: string } | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const { mime, name } = v as { mime?: unknown; name?: unknown };
  return typeof mime === 'string' && typeof name === 'string' ? { mime, name } : null;
}

export const gallery: KindDrawer = {
  draw(result, opts) {
    const authored = authoredOf(result);
    const files = Array.isArray(result.files) && result.files.length === authored.length ? result.files : null;
    if (authored.length)
      return fenced(
        'gallery',
        authored.map((r, i) => {
          const [said = '', cell = ''] = r.cells;
          if (!files) return [said, cell].map(escapeCell).join(' | ');
          const file = fileOf(files[i]);
          const shown = file === null ? '' : isPictureMime(file.mime) ? cell : file.name;
          return [said || (file?.name ?? ''), shown].map(escapeCell).join(' | ');
        }),
        opts,
      );
    const register = listOf(result);
    const [caption = '', field = ''] = fieldsOf(result);
    if (!register || !caption || !field) return fenced('gallery', [], opts);
    const rows = entriesOf(result).map((e) => {
      const file = fileOf(e.fields[field]);
      const ref = file && e.seq !== null && isPictureMime(file.mime) ? `file:${register}#${e.seq}/${field}` : '';
      const shows = ref ? showsOf(ref) : null;
      const cell = shows && 'file' in shows ? ref : (file?.name ?? '');
      const words = display(register, caption, e.fields[caption], opts.now) || (file?.name ?? '');
      return [words, cell].map(escapeCell).join(' | ');
    });
    return fenced('gallery', rows, opts);
  },
};
