/**
 * Done on a page with a rail: `saveArrangement`, with each block written in the area it was moved to.
 *
 * WHY THIS FILE EXISTS AND WHY IT SHOULD NOT. `saveArrangement` (`record/page-write.ts`) reads the body, checks it is
 * the page that was drawn, lays the blocks out with `arrangedBody` and sets it whole. `arrangedBody` writes each
 * block's order and span and nothing else, so a block moved to the rail went back to the record in the main column,
 * and the page re-read after Done put it back where it was. The one-line fix belongs in `arrangedBody` (a `Placed`
 * carrying `area`), and that file was not this brief's to edit. So this is `saveArrangement` step for step with
 * `withAreas` between the layout and the write. When `arrangedBody` carries `area`, this file goes and `PageView`
 * calls `saveArrangement` for every page.
 *
 * ONLY A PAGE WITH A LAYOUT COMES HERE. A page with none is written by `saveArrangement` itself, so its Done is the
 * write it has always been.
 */

import { copy } from '../copy.ts';
import { arrangedBody, setBody, type Added, type Arranged, type Placed } from '../record/page-write.ts';
import { pagesReader, type Fetch } from '../record/pages-live.ts';
import type { Slot } from '../record/arrange.ts';
import { withAreas } from './layout.ts';

export async function saveLaidOut(
  base: string,
  slug: string,
  drawn: number,
  placed: readonly (Placed & Pick<Slot, 'area'>)[],
  added: readonly Added[],
  io?: Fetch,
  seen?: number | null,
): Promise<Arranged> {
  const read = await pagesReader(base, io).readOne(slug);
  if (read.from === 'absent') return { from: 'refused', fix: copy.recordNotReached };
  if (read.from === 'refused') return read;
  if (read.from === 'expanded') return { from: 'refused', fix: copy.arrangeTemplate };
  if (read.page.body.blocks.length !== drawn) return { from: 'refused', fix: copy.arrangeMoved };
  if (typeof seen === 'number' && read.page.version !== null && read.page.version !== seen) return { from: 'refused', fix: copy.arrangeMoved };
  const body = arrangedBody(read.page.body, placed, added);
  if (!body) return { from: 'refused', fix: copy.arrangeMoved };
  const out = await setBody(base, withAreas(body, placed), io, read.page.version);
  return out.from === 'written' ? { from: 'written', before: read.page.body, version: out.version } : out;
}
