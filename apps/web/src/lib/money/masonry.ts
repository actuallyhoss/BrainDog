/**
 * MONEY'S BOARD PACKS ITS TILES BY THEIR OWN HEIGHTS: two tiles side by side were stretched to the taller one, so a Due
 * soon of two lines stood as tall as a month of spending with a hole under its lines. Now each tile is as tall as what it
 * holds, and the next tile in the column starts under it, a board of cards as a finance app lays one out.
 *
 * HOW: the page's grid gets rows a few pixels high and no gap between them, and each tile spans as many as its own height
 * and the gap under it take (`--money-rows`), measured as it changes. The grid's own placement does the rest: a tile goes
 * in the first place along the rows where its columns are free, so a short tile's neighbour column fills under it and a
 * tile the whole row wide waits for both. NOTHING MOVES IN THE DOCUMENT: the order a screen reader and the keyboard walk
 * is the page's order, and the look only changes where tiles are drawn.
 *
 * ONE COLUMN (a phone, a narrow window) needs none of it, and a page being arranged keeps the plain grid.
 */

/* ONE PIXEL A ROW (spacing pass, 3 Nov): at four, each tile's span rounded its height up to the next four, so the gap
   under a tile came out anywhere from 16 to 19.9px and no two gaps on the board matched. At one it is the tile gap. */
const ROW = 1;
/**
 * NEIGHBOURS THAT ALMOST LINE UP DO LINE UP (empty states 2, polish): with one account and one bill, Accounts stood 8px
 * taller than Due soon beside it, from the account's 36px well against the bill's 28px day, which reads as a slip and
 * not as a board of cards. Tiles that start on one row and end within this much of each other end level, the shorter
 * one as tall as the taller. Further apart, each keeps its own height, as above.
 */
const LEVEL = 16;

/** The rows a tile spans for its height and the gap under it. PURE, for its test. */
export const rowsFor = (height: number, gap: number, row = ROW): number => Math.max(1, Math.ceil((height + gap) / row));

/**
 * The tiles that start on one row, side by side, and end within `LEVEL` of each other: each such set, read from where
 * the grid drew them. A tile alone on its row, or one far taller than its neighbour, is in none.
 */
function rowsOf(tiles: readonly HTMLElement[], heights: ReadonlyMap<HTMLElement, number>): HTMLElement[][] {
  const by = new Map<number, HTMLElement[]>();
  for (const t of tiles) {
    const top = Math.round(t.getBoundingClientRect().top);
    by.set(top, [...(by.get(top) ?? []), t]);
  }
  return [...by.values()].filter((row) => {
    if (row.length < 2) return false;
    const hs = row.map((t) => heights.get(t)!);
    return Math.max(...hs) - Math.min(...hs) <= LEVEL;
  });
}

/** An attachment for Money's page host: packs `.page`'s tiles while it has more than one column. */
export function masonry(host: HTMLElement): () => void {
  let page: HTMLElement | null = null;
  /* A TILE THAT GREW IS PACKED BEFORE IT IS PAINTED, in the observer's own turn: a frame later, as a read's answer filled
     a tile, every tile under it stood over its neighbour for a frame. Packing changes where a tile stands, not its size. */
  const sized = new ResizeObserver(() => lay());
  /* AND SO IS A TILE THAT CAME: a newly watched box answers once after the frame's layout and before its paint, so Money
     opening was never seen unpacked, 700px taller for a frame with two tiles on the wrong side. */
  let due = false;
  const before = new ResizeObserver(() => {
    before.unobserve(host);
    due = false;
    lay();
  });
  const watched = new Set<Element>();

  const tiles = (p: HTMLElement): HTMLElement[] => [...p.children].filter((c): c is HTMLElement => c instanceof HTMLElement);

  function lay(): void {
    const p = host.querySelector<HTMLElement>(':scope .page');
    if (p !== page) {
      page?.removeAttribute('data-packed');
      page = p;
    }
    if (!p) return;
    const cs = getComputedStyle(p);
    const columns = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    const arranging = p.getAttribute('role') === 'list';
    if (columns < 2 || arranging) {
      if (p.hasAttribute('data-packed')) {
        p.removeAttribute('data-packed');
        for (const t of tiles(p)) {
          t.style.removeProperty('--money-rows');
          t.style.removeProperty('min-block-size');
        }
      }
      return;
    }
    /* THE PLACE BACK TO WHICH BACK BROUGHT HIM IS KEPT, read before anything here changes: while the rows are being measured
       the page is one row a tile for a moment, too short to stand scrolled, and the browser put him at the top for a frame. */
    const pane = p.closest('main');
    const place = pane?.scrollTop ?? 0;
    const gap = parseFloat(p.style.getPropertyValue('--money-gap')) || parseFloat(cs.rowGap) || 16;
    if (!p.hasAttribute('data-packed')) {
      p.style.setProperty('--money-gap', `${gap}px`);
      p.setAttribute('data-packed', '');
    }
    const all = tiles(p);
    /* EACH TILE'S OWN HEIGHT, measured with no levelling on it (put back below in the same task, so nothing is painted
       between and the size the observer last saw is the size it sees again). */
    for (const t of all) t.style.removeProperty('min-block-size');
    const heights = new Map<HTMLElement, number>();
    for (const t of all) {
      if (!watched.has(t)) {
        watched.add(t);
        sized.observe(t);
      }
      const h = t.getBoundingClientRect().height;
      heights.set(t, h);
      /* A tile that draws nothing takes one row of a pixel and no gap. */
      const rows = h === 0 ? 1 : rowsFor(h, gap);
      const was = t.style.getPropertyValue('--money-rows');
      if (was !== String(rows)) t.style.setProperty('--money-rows', String(rows));
    }
    for (const row of rowsOf(all.filter((t) => (heights.get(t) ?? 0) > 0), heights)) {
      const most = Math.max(...row.map((t) => heights.get(t)!));
      for (const t of row) {
        t.style.setProperty('--money-rows', String(rowsFor(most, gap)));
        if (heights.get(t)! < most) t.style.setProperty('min-block-size', `${most}px`);
      }
    }
    if (pane && pane.scrollTop !== place) pane.scrollTop = place;
  }

  function schedule(): void {
    if (due) return;
    due = true;
    before.observe(host);
  }

  /* TILES COME AND GO as a page reads (a `when:` met, a fold opened), so the page's children are watched too. */
  const changed = new MutationObserver(() => schedule());
  changed.observe(host, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  schedule();

  return () => {
    before.disconnect();
    sized.disconnect();
    changed.disconnect();
    window.removeEventListener('resize', schedule);
    if (page) {
      page.removeAttribute('data-packed');
      page.style.removeProperty('--money-gap');
      for (const t of tiles(page)) {
        t.style.removeProperty('--money-rows');
        t.style.removeProperty('min-block-size');
      }
    }
  };
}
