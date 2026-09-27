/**
 * `gallery`: pictures and files, each with a caption, from a list or written out.
 *
 * OVER A LIST it names two columns, the caption and the file (`columns: [caption, photo]`), and the file is a `file`
 * field. It may instead write its rows out, each `{ cells: [caption, file:<list>#<seq>/<field>] }`, the file named by
 * the row and field that hold it, as a queue's option names one (`packages/render/src/queue.ts`).
 *
 * THE ANSWER CARRIES EACH FILE AS THE RECORD STORES IT, `{ sha256, mime, bytes, name }`, in `files`, aligned with the
 * rows it draws: the list's rows, or the rows written out. The host turns a hash into an address through
 * `RenderOptions.file` and draws an image type as the picture and anything else as its name, so no drawer reads a
 * list to find a picture and no address is written into a page. A file the record does not hold is `null`, drawn as
 * its caption alone.
 *
 * AT MOST `GALLERY_MOST`, written out or read: a gallery is a grid of pictures to look at, and past that it is a list
 * of files, which a `table` draws.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { Json } from '../coerce.ts';
import type { StoredFile } from '../pages.ts';
import type { KindModule } from './index.ts';
import { authoredCells, invalid, listedFault, readListed } from './listed.ts';
import type { Raw } from './words.ts';

/** The most pictures a gallery draws, and how many it draws when it says no `limit:`. */
export const GALLERY_MOST = 24;

/** A file named by the row and field that hold it, `file:parts#2/photo`: the queue option's spelling. */
const FILE_CELL = /^file:([a-z][a-z0-9_]*)#([1-9][0-9]*)\/([a-z][a-z0-9_]*)$/u;

/** A file cell read, or `null` for a cell that is not one. */
export function fileCell(cell: unknown): { register: string; seq: number; field: string } | null {
  const m = typeof cell === 'string' ? FILE_CELL.exec(cell.trim()) : null;
  return m ? { register: m[1]!, seq: Number(m[2]), field: m[3]! } : null;
}

/**
 * Every row a gallery's written-out files are held on, by the list it is a row of.
 *
 * FOR `registersOf`, which names the lists a page reads so a reader who may not open one is not handed what is in
 * it: a picture written out as `file:contracts#2/scan` reads a row of Contracts, which the block's `source` does not say.
 */
export function fileLists(block: Raw): string[] {
  const lists = new Set<string>();
  for (const cells of authoredCells(block) ?? []) {
    const named = fileCell(cells[1]);
    if (named) lists.add(named.register);
  }
  return [...lists];
}

/** A stored file value as the record holds it, and only its four parts, or `null` for anything else. */
function stored(v: Json | undefined): StoredFile | null {
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return null;
  const { sha256, mime, bytes, name } = v;
  return typeof sha256 === 'string' && typeof mime === 'string' && typeof bytes === 'number' && typeof name === 'string' ? { sha256, mime, bytes, name } : null;
}

export const gallery: KindModule = {
  keys: [],

  validate(block, ctx) {
    const limit = block.limit;
    if (limit !== undefined && !(typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 && limit <= GALLERY_MOST))
      return { code: 'OUT_OF_BOUNDS', fix: `limit: on a gallery is at most ${GALLERY_MOST} pictures, and ${JSON.stringify(limit)} is not. A table draws a longer list of files.`, at: 'limit' };
    const shape = listedFault(block, 'gallery', { fewest: 2, most: 2, said: 'two columns, the caption and the file, such as columns: [caption, photo]' }, ctx.stage);
    if (shape) return shape;
    const written = authoredCells(block) ?? [];
    if (written.length > GALLERY_MOST)
      return { code: 'OUT_OF_BOUNDS', fix: `A gallery draws at most ${GALLERY_MOST} pictures, and this one writes out ${written.length}.`, at: 'authored' };
    /* THE FILE IS CHECKED AND THE COUNT OF CELLS IS NOT, which a drawer degrades (`declare.ts`, `05 §2.1`). */
    for (const cells of written)
      if (!fileCell(cells[1]))
        return invalid('A picture written out is its caption and then the file, by the row and field that hold it, such as { cells: [Front, file:parts#2/photo] }.', 'authored');
    return null;
  },

  read(deps, block, base) {
    /* WRITTEN OUT, each file is read from the one row that holds it, at most `GALLERY_MOST` reads of one row each. A
       list the record does not declare, a field that is not a file and a row that is gone each answer `null`, and the
       caption is still drawn. */
    const written = authoredCells(block);
    if (!block.source) {
      if (written === null) return base;
      const files = written.slice(0, GALLERY_MOST).map((cells) => {
        const named = fileCell(cells[1]);
        const schema = named ? deps.schemaOf(named.register) : null;
        if (!named || !schema || !Object.hasOwn(schema.fields, named.field) || schema.fields[named.field]?.type !== 'file') return null;
        const got = deps.list({ register: named.register, where: { field: 'seq', is: named.seq }, limit: 1 });
        const row = got.ok ? got.value.rows[0] : undefined;
        return row && Object.hasOwn(row.fields, named.field) ? stored(row.fields[named.field]) : null;
      });
      return { ...base, files };
    }

    const limit = block.limit === undefined ? GALLERY_MOST : Math.max(0, Math.min(GALLERY_MOST, Math.floor(block.limit)));
    if (limit === 0) return { ...base, matched: 0 };
    const listed = readListed(deps, block, 'gallery', {
      rules: [null, { types: ['file'], said: 'the file, a file field' }],
      limit,
    });
    if ('refusals' in listed) return { ...base, refusals: [...base.refusals, ...listed.refusals] };
    const field = block.columns?.[1]?.field ?? '';
    return {
      ...base,
      rows: listed.rows,
      matched: listed.matched,
      files: listed.rows.map((r) => (Object.hasOwn(r.fields, field) ? stored(r.fields[field]) : null)),
    };
  },
};
