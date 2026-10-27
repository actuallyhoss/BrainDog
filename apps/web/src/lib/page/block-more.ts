/**
 * THE NEXT ROWS OF ONE BLOCK, read as the reader reaches the end of what is drawn.
 *
 * A page's list block opens on its first rows and a cursor; `RowsWindow` draws the ones on screen and its sentinel calls
 * `onmore` near the end, and the page hands that to `moreRows` here, which asks the record for the block's next
 * `MORE_PAGE` rows past the cursor. So a list of 2,527 entries opens at once and reads the rest as it is reached.
 *
 * LOADED BY `import()` ONLY. Nothing a screen loads at first imports this file: a page reaches it the first time a
 * sentinel asks, so the entry script pays nothing for it. It imports nothing of its own for the same reason.
 *
 * Nothing here reaches the record by itself: the page hands `io.read`, which is the record's page read asked for one
 * block past a cursor. A record that does not read `cursor` answers the first rows again with no cursor, which
 * `withMore` drops as rows already held and `moreRows` takes as the last page, so an older record stops after one ask.
 */

/** How many rows one ask reads: a few screens of a phone's list, small enough to arrive at once. */
export const MORE_PAGE = 50;

/** What a page says when the next rows could not be read. The rows already drawn stay as they were. */
export const MORE_FAILED = 'The rest of this list could not be read just now. Scroll down again to try once more.';

/** One block of one page, and the cursor its last answer handed back: `null` is the last page, and nothing is asked. */
export type MoreAsk = { slug: string; block: string; cursor: string | null };

/** The next rows and the cursor past them; `refused` holds what to say when the read failed, and `rows` is then empty. */
export type MoreAnswer<R> = { rows: R[]; cursor: string | null; refused?: string };

/** The record's answer, in the shape `client.call` answers in. */
export type MoreResult = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } | undefined };

export type MoreIo = { read: (q: { slug: string; block: string; cursor: string; limit: number }) => Promise<MoreResult> };

type Paged = { rows: unknown[]; cursor: string | null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/* A CURSOR IS A WORD THAT IS NOT EMPTY. Absent, `null` or anything else is the last page: an answer that names no next
   page has none, and asking again with a value we cannot read would read the same rows forever. */
const cursorOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * The block's rows and cursor out of an answer, which is either the block alone (`{ rows, cursor }`) or the page with
 * every block it read (`{ blocks: [{ key, rows, cursor }] }`), the block found by its key. `null` when neither holds it.
 */
function pagedOf(value: unknown, block: string): Paged | null {
  if (!isObject(value)) return null;
  const one = Array.isArray(value.blocks) ? value.blocks.find((b) => isObject(b) && b.key === block) : value;
  if (!isObject(one) || !Array.isArray(one.rows)) return null;
  return { rows: one.rows, cursor: cursorOf(one.cursor) };
}

/**
 * The next rows past `cursor`, and the cursor past them. At a `null` cursor nothing is asked. A refusal, a read that
 * threw or an answer that does not hold the block keeps the cursor it was asked with, so the next ask tries the same
 * rows again, and says why in `refused`. An answer whose cursor is the one asked with is the last: a record that
 * ignored the cursor would otherwise be asked for the same rows at every scroll.
 */
export async function moreRows<R = unknown>(ask: MoreAsk, io: MoreIo): Promise<MoreAnswer<R>> {
  if (ask.cursor === null || ask.cursor === '') return { rows: [], cursor: null };
  let out: MoreResult;
  try {
    out = await io.read({ slug: ask.slug, block: ask.block, cursor: ask.cursor, limit: MORE_PAGE });
  } catch {
    return { rows: [], cursor: ask.cursor, refused: MORE_FAILED };
  }
  if (!out.ok) return { rows: [], cursor: ask.cursor, refused: out.refusal?.fix || MORE_FAILED };
  const paged = pagedOf(out.value, ask.block);
  if (!paged) return { rows: [], cursor: ask.cursor, refused: MORE_FAILED };
  return { rows: paged.rows as R[], cursor: paged.cursor === ask.cursor ? null : paged.cursor };
}

/**
 * The rows held with the next ones after them, any already held left out (by `keyOf`), so a row read twice across a
 * change is drawn once. NOTHING NEW IS THE SAME ARRAY, a refusal included, so a page that compares what it holds sees
 * no change and draws nothing again.
 */
export function withMore<R>(held: readonly R[], got: MoreAnswer<R>, keyOf: (row: R) => string): readonly R[] {
  if (got.refused !== undefined || got.rows.length === 0) return held;
  const seen = new Set(held.map(keyOf));
  const fresh = got.rows.filter((r) => {
    const k = keyOf(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return fresh.length === 0 ? held : [...held, ...fresh];
}

/**
 * One block's reads in order: `more()` asks past the cursor the last answer gave, and a second call while one is on its
 * way is handed the same answer rather than asking twice, since a sentinel can fire again before the rows have landed.
 */
export function pagerOf<R = unknown>(start: MoreAsk, io: MoreIo) {
  let cursor = start.cursor === '' ? null : start.cursor;
  let asking: Promise<MoreAnswer<R>> | null = null;
  return {
    get cursor(): string | null {
      return cursor;
    },
    get done(): boolean {
      return cursor === null;
    },
    more(): Promise<MoreAnswer<R>> {
      if (asking) return asking;
      if (cursor === null) return Promise.resolve({ rows: [], cursor: null });
      asking = moreRows<R>({ slug: start.slug, block: start.block, cursor }, io)
        .then((got) => ((cursor = got.cursor), got))
        .finally(() => (asking = null));
      return asking;
    },
  };
}
