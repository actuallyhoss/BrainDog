/**
 * A tile rises into place the first time it scrolls into view, and only once the script has run.
 *
 * VISIBLE UNLESS THIS RUNS. A `.reveal` tile is drawn at full strength by the stylesheet. Only when this marks the
 * page `js` does a tile that has not been seen (`:not(.seen)`) start hidden, and the observer gives it `.seen` as it
 * scrolls in. So a page read without scripting or printed shows every tile, and a tile already on
 * screen when the page opens is marked seen before the page is marked, so it never blinks out and back.
 */
/* NOT `in`, WHICH IS THE SITE'S COLUMN (`app.css`): a tile given it took the column's auto margins and shrank in its cell. */
const SEEN = 'seen';

/** Mark every `.reveal` under `root` seen when it scrolls in, and the page as one the script runs on. Returns the undo. */
export function reveal(root: Document = document): () => void {
  const html = root.documentElement;
  const tiles = [...root.querySelectorAll<HTMLElement>('.reveal:not(.seen)')];
  if (typeof IntersectionObserver !== 'function') {
    for (const el of tiles) el.classList.add(SEEN);
    return () => {};
  }
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add(SEEN);
        seen.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -4% 0px' },
  );
  const fold = root.defaultView?.innerHeight ?? 0;
  for (const el of tiles) {
    if (el.getBoundingClientRect().top < fold) el.classList.add(SEEN);
    else seen.observe(el);
  }
  html.classList.add('js');
  return () => seen.disconnect();
}
