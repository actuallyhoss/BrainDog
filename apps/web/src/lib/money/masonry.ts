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

const ROW = 4;

/** The rows a tile spans for its height and the gap under it. PURE, for its test. */
export const rowsFor = (height: number, gap: number, row = ROW): number => Math.max(1, Math.ceil((height + gap) / row));

/** An attachment for Money's page host: packs `.page`'s tiles while it has more than one column. */
export function masonry(host: HTMLElement): () => void {
  let page: HTMLElement | null = null;
  let frame = 0;
  const sized = new ResizeObserver(() => schedule());
  const watched = new Set<Element>();

  const tiles = (p: HTMLElement): HTMLElement[] => [...p.children].filter((c): c is HTMLElement => c instanceof HTMLElement);

  function lay(): void {
    frame = 0;
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
        for (const t of tiles(p)) t.style.removeProperty('--money-rows');
      }
      return;
    }
    const gap = parseFloat(p.style.getPropertyValue('--money-gap')) || parseFloat(cs.rowGap) || 16;
    if (!p.hasAttribute('data-packed')) {
      p.style.setProperty('--money-gap', `${gap}px`);
      p.setAttribute('data-packed', '');
    }
    for (const t of tiles(p)) {
      if (!watched.has(t)) {
        watched.add(t);
        sized.observe(t);
      }
      const h = t.getBoundingClientRect().height;
      /* A tile that draws nothing takes one row of four pixels and no gap. */
      const rows = h === 0 ? 1 : rowsFor(h, gap);
      const was = t.style.getPropertyValue('--money-rows');
      if (was !== String(rows)) t.style.setProperty('--money-rows', String(rows));
    }
  }

  function schedule(): void {
    if (frame === 0) frame = requestAnimationFrame(lay);
  }

  /* TILES COME AND GO as a page reads (a `when:` met, a fold opened), so the page's children are watched too. */
  const changed = new MutationObserver(() => schedule());
  changed.observe(host, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  schedule();

  return () => {
    cancelAnimationFrame(frame);
    sized.disconnect();
    changed.disconnect();
    window.removeEventListener('resize', schedule);
    if (page) {
      page.removeAttribute('data-packed');
      page.style.removeProperty('--money-gap');
      for (const t of tiles(page)) t.style.removeProperty('--money-rows');
    }
  };
}
