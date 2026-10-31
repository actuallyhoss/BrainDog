/**
 * The code of the tiles Today's answer shows, asked the moment that answer is in hand (speed-d SD1, 30 Oct).
 *
 * EACH TILE'S CODE WAS ASKED WHERE IT IS DRAWN, under the page reader's own code: Today's answer was in the tab, then the
 * reader's code landed, then its slot drew, then the slot asked for Late and handed back, Working now and the decision
 * card, and then Working now asked for its own reader and read. On a cold phone over Slow 4G each of those steps is a
 * round trip of half a second or more, so the tiles drew about two seconds after the answer that fills them.
 *
 * SO THE ANSWER SAYS WHICH TILES HAVE SOMETHING TO SHOW, and their code is asked at once, beside the page reader's: what
 * is late, who is working (and the reader its live line asks through), and the decision card where Needs you holds a
 * question. Nothing waits on these asks; the slot that draws a tile takes the same module when it gets there. A tile
 * with nothing to show asks nothing, as it draws nothing.
 *
 * PURE ENOUGH FOR NODE: no rune, no `$lib`.
 */

import { askWorking } from './working-early.ts';

/** A drawn block as this reads one: its key and whatever it lists. */
type Answered = { key?: unknown; rows?: unknown; queue?: unknown; feed?: unknown; entries?: unknown };

/** Whether a drawn block lists anything. */
const lists = (b: Answered): boolean => ['rows', 'queue', 'feed', 'entries'].some((k) => Array.isArray(b[k as keyof Answered]) && (b[k as keyof Answered] as unknown[]).length > 0);

/** The tiles' modules each answer asks for, by what it shows: for a test, and for `askTiles`. */
export function tilesOf(blocks: unknown): Array<'late' | 'working' | 'card'> {
  const drawn = (Array.isArray(blocks) ? blocks : []).filter((b): b is Answered => b !== null && typeof b === 'object');
  const out: Array<'late' | 'working' | 'card'> = [];
  if (drawn.some((b) => b.key === 'late' && lists(b))) out.push('late');
  if (drawn.some((b) => b.key === 'working' && lists(b))) out.push('working');
  if (drawn.some((b) => Array.isArray(b.queue) && b.queue.length > 0)) out.push('card');
  return out;
}

/** Ask for the code of each tile `blocks` (Today's answer, as the record drew it) has something to show in. */
export function askTiles(blocks: unknown): void {
  for (const tile of tilesOf(blocks)) {
    if (tile === 'late') void import('./LateNow.svelte').catch(() => null);
    else if (tile === 'working') void Promise.all([import('./WorkingNow.svelte'), import('./desk-live.ts')]).catch(() => null);
    else void import('../decide/card-load.ts').then((m) => m.loadCard()).catch(() => null);
  }
}

/** The record Today is on and whether its reader is the owner, for the reads a tile is asked ahead (`working-early.ts`). */
export type TileAt = { base: string; owner: boolean };

/**
 * THE TILES' OWN FIRST READS, asked once Today's page has been read and before it draws (speed-e SE3): Working now read
 * who is working only after the first screen had drawn, a round trip after it. NOT WITH THE ANSWER, beside the page's
 * own reads of its lists: asked there it took a share of the connection those reads were waiting on, and Today drew
 * later for it.
 */
export function askReads(blocks: unknown, at: TileAt): void {
  if (tilesOf(blocks).includes('working')) askWorking(at.base, at.owner);
}

/**
 * THE TILES TODAY AS THE PAGE ASKED IT BESIDE `boot` (`app.html`) SHOWS, asked from that answer, which is in the tab
 * seconds before the reader that takes it (`earlyToday` in `today-read.ts`) has loaded. A look only: the answer stays
 * for that reader to take and check, and a guess that turns out wrong costs a few kilobytes of code and nothing else.
 */
export function askEarlyTiles(url: string): void {
  const early = (globalThis as { __bdToday?: { url?: unknown; at?: unknown } | undefined }).__bdToday;
  if (early === undefined || early.url !== url || !(early.at instanceof Promise)) return;
  void (early.at as Promise<{ ok?: unknown; body?: unknown } | null>)
    .then((res) => {
      if (res?.ok !== true || typeof res.body !== 'string') return;
      const said = JSON.parse(res.body) as { ok?: unknown; value?: { page?: { blocks?: unknown } } } | null;
      if (said?.ok === true) askTiles(said.value?.page?.blocks);
    })
    .catch(() => undefined);
}
