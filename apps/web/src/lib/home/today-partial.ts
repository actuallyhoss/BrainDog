/**
 * TODAY'S CARDS AS THEY ARRIVE (finish 3 Nov). The owner: "loading on the cards themselves, so whatever cards are available
 * loads first". Today's cards all came from one `today` read, so nothing drew until the slowest card was drawn. The
 * record now hands each card on as it draws it (`TodayLine`, `today-read.ts` `todayInLines`), and this turns what has
 * arrived into a page the board draws at once: each card that is in, drawn as it will be, and every card still being
 * drawn a stand-in that keeps its cell and draws its kept skeleton there (`pending`, `PageBody.svelte`). The whole
 * answer then takes over, as it always did.
 *
 * Each block that arrives is made a live block as the whole answer's are (`liveOf`: its lists learnt, its refs walked,
 * its tile's code fetched), once, and the page is made again only for the newest part: lines that land while one is
 * being made are taken together.
 */

import { createClient } from '@braindog/client';

import type { LiveBlock } from '$lib/record/page-live.ts';
import type { TodayPartial } from './today-read.ts';

/** The skeleton a card stands as while it is drawn: its kept kind, lines and height (`today-shape.ts`). */
export type Pending = { kind: string; rows: number; h: number; cols: number } | true;

/** What a card still being drawn is handed to the board: its key, its declared kind and size, and `pending`. */
export function pendingBlock(key: string, declared: Record<string, unknown> | undefined, pending: Pending): LiveBlock {
  const d = declared ?? {};
  return {
    key,
    kind: typeof d.kind === 'string' ? d.kind : 'note',
    ...(typeof d.size === 'string' ? { size: d.size } : {}),
    ...(typeof d.heading === 'string' ? { heading: d.heading } : {}),
    ...(typeof d.icon === 'string' ? { icon: d.icon } : {}),
    ...(d.draft !== undefined ? { draft: d.draft } : {}),
    ...(d.until !== undefined ? { until: d.until } : {}),
    rows: [],
    columns: [],
    metrics: [],
    entries: [],
    cells: [],
    queue: [],
    feed: [],
    kpis: [],
    readings: [],
    matched: 0,
    refusals: [],
    drawn: true,
    pending,
  } as unknown as LiveBlock;
}

/** Whether a block on the board is a card still being drawn. */
export const isPending = (b: unknown): boolean => b !== null && typeof b === 'object' && (b as { pending?: unknown }).pending !== undefined;

type Kit = {
  liveOf: typeof import('$lib/record/page-drawn.ts').liveOf;
  tilesLanded: typeof import('./tile-code.ts').tilesLanded;
  /** Words kept in an older form, said as they are now (`kept-words.ts`), for a kept Today. */
  words?: ((blocks: unknown[]) => unknown[]) | undefined;
};

/**
 * A reader of a stream's parts that hands `to` the page each time more of it has arrived. `make` lays the blocks out
 * as the answer's own are (the declared page around them); `declaredOf` names what each block is declared as, for the
 * stand-ins; `pendingOf` the skeleton each stand-in draws. `stop()` ends it, once the whole answer is in.
 */
export function partsReader(
  base: string,
  kit: Kit,
  declaredOf: (part: TodayPartial) => readonly Record<string, unknown>[],
  pendingOf: (key: string) => Pending,
  make: (blocks: LiveBlock[], now: number, part: TodayPartial) => unknown,
  to: (page: unknown) => void,
): { onPart: (part: TodayPartial) => void; stop: () => void } {
  const client = createClient({ base });
  const live = new Map<number, LiveBlock>();
  let next: TodayPartial | null = null;
  let busy = false;
  let stopped = false;
  const run = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      while (next !== null && !stopped) {
        const part: TodayPartial = next;
        next = null;
        const fresh = part.blocks.flatMap((b, i) => (b !== undefined && b !== null && !live.has(i) ? [[i, b] as const] : []));
        if (fresh.length > 0) {
          const raw = fresh.map(([, b]) => b);
          const said = kit.words ? kit.words(raw) : raw;
          const [made] = await Promise.all([kit.liveOf(client, [said as never], Date.now(), new Map(), { base }), kit.tilesLanded(said)]);
          fresh.forEach(([i], n) => {
            const b = made[0]?.[n];
            if (b) live.set(i, b);
          });
        }
        if (stopped) return;
        const declared = declaredOf(part);
        const blocks = Array.from({ length: part.of }, (_, i) => live.get(i) ?? pendingBlock(part.keys[i] ?? `p${i + 1}`, declared[i], pendingOf(part.keys[i] ?? '')));
        const page = make(blocks, Date.now(), part);
        if (page !== null && page !== undefined && !stopped) to(page);
      }
    } catch {
      /* A part that cannot be made waits for the whole answer, which draws as it always did. */
    } finally {
      busy = false;
    }
  };
  return {
    onPart: (part) => {
      if (stopped) return;
      next = part;
      void run();
    },
    stop: () => {
      stopped = true;
    },
  };
}
