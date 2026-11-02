/**
 * EACH WIDGET'S CONTENT FITS ITS FRAME (the widgets plan of 29 October, §3.3, Call 3): a frame is fixed, and a line that
 * would be cut by its foot is not drawn at all, rather than drawn in half. The frame's own "N more", wherever it is, stays.
 *
 * Measured, not guessed: after the board lays out, each widget's rows are checked against the bottom of its frame less
 * its foot, and a row that runs past it is marked `data-cut` (not drawn, so the foot under it rises into view). Run on a frame,
 * never inside a layout pass of its own: one read of every rect, then one write of every mark.
 */

/** What is a row of a widget: a late line, a question, a run, a list's line, a card, a feed's line. */
const ROWS = '.ln, .qa, .run, li, tr, .cards-item, .feed-row, [data-row]';
/** What is a widget's foot, which always shows. */
/* AND A TILE'S OWN DOOR AT ITS FOOT (`.l-foot`, `.tile-link`): Arrivals' "Activity" was no foot, so its "3 more" was drawn
   on top of it (live check of 30 October, 7). */
const FOOT = '.late-more, .block-more, .block-slice, .queue-more, .p-more, [data-needs-foot], .signs-line, .t-more, .more, .r-more, [data-draft-mark], .l-foot, .tile-link';
/** A foot that is the widget's own "N more" or "All …" link, which already says there is more. */
const SAYS_MORE = /\b(?:more|all)\b/iu;
/**
 * A CHART'S OWN PARTS ARE NOT ROWS: its bars, scale, ticks and legend are list items and its numbers a table, and read as
 * rows they were hidden one by one and counted, a weekly chart drawn as its title and "36 more" (the validator's recheck
 * of 30 October, N1). A chart is drawn whole and the frame clips it, as any picture is.
 */
const CHART = '.series, [role="img"], svg';

export function fitBoard(board: HTMLElement): void {
  const frames = [...board.querySelectorAll<HTMLElement>('[data-board-key]')].filter((f) => f.dataset.lifted === undefined);
  /* EACH FRAME'S ROWS AS LAID (T5): a laptop's frame at rest is as tall as what it draws, the rows it was laid across at
     most, and the packer may lay a frame across more rows than its size (`filled` in `pack.ts`). Read from its own
     grid-area, written before anything is measured. */
  for (const frame of frames) {
    const css = getComputedStyle(frame);
    const span = (parseInt(css.gridRowEnd, 10) || 0) - (parseInt(css.gridRowStart, 10) || 0);
    if (span > 0 && frame.style.getPropertyValue('--span') !== String(span)) frame.style.setProperty('--span', String(span));
    /* AND A DRAFT'S KEEP BAR, AS TALL AS IT IS DRAWN (leftovers 4): on a laptop at rest the frame is held to its rows, and
       the bar under the widget took its height out of them, so Spending's figures were cut under Keep. The frame is let
       taller by the bar (`Board.svelte`), whatever the bar wraps to at the frame's width. */
    const bar = frame.querySelector<HTMLElement>(':scope > [data-draft-mark]');
    const said = bar === null ? '' : `${Math.ceil(bar.getBoundingClientRect().height)}px`;
    if (frame.style.getPropertyValue('--bar') !== said) {
      if (said === '') frame.style.removeProperty('--bar');
      else frame.style.setProperty('--bar', said);
    }
  }
  /* MEASURED WHOLE: every row put back first, in the same task, so nothing is painted between and the measure is of the
     widget as it would draw with room. */
  for (const frame of frames) {
    for (const row of frame.querySelectorAll<HTMLElement>('[data-cut]')) delete row.dataset.cut;
    for (const foot of frame.querySelectorAll<HTMLElement>('[data-more-before]')) delete foot.dataset.moreBefore;
  }
  const marks: [HTMLElement, number][] = [];
  const before: [HTMLElement, string][] = [];
  const recounts: [HTMLElement, number][] = [];
  for (const frame of frames) {
    const box = frame.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(frame).paddingBlockEnd) || 0;
    const room = box.bottom - pad;
    /* THE OUTERMOST ROWS ONLY: a card's own list is the card's, and goes with it. */
    const rows = [...frame.querySelectorAll<HTMLElement>(ROWS)].filter((row) => {
      if (row.closest(FOOT)) return false;
      const chart = row.closest<HTMLElement>(CHART);
      if (chart && frame.contains(chart)) return false;
      const outer = row.parentElement?.closest<HTMLElement>(ROWS);
      return !outer || !frame.contains(outer);
    });
    const rects = rows.map((row) => row.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom, height: r.height }));
    /* EACH FOOT AS IT IS DRAWN: its hit area reaches past it (a negative margin, `Board.svelte`). One laid over the
       frame (the draft's answers) caps the rows wherever it is; the rest follow the rows in the flow. */
    let over = Infinity;
    const feet: { top: number; bottom: number; el: HTMLElement }[] = [];
    for (const foot of frame.querySelectorAll<HTMLElement>(FOOT)) {
      const r = foot.getBoundingClientRect();
      if (r.height === 0) continue;
      /* A FOOT INSIDE A FOOT IS THAT FOOT'S. */
      if (foot.parentElement?.closest(FOOT) && frame.contains(foot.parentElement.closest(FOOT))) continue;
      const css = getComputedStyle(foot);
      const top = r.top + Math.max(0, -(parseFloat(css.marginBlockStart) || 0));
      const bottom = r.bottom - Math.max(0, -(parseFloat(css.marginBlockEnd) || 0));
      if (css.position === 'absolute') over = Math.min(over, top);
      else if (r.top > box.top + box.height / 3) feet.push({ top, bottom, el: foot });
    }
    feet.sort((a, b) => a.top - b.top);
    const past = (at: number) => rects.filter((r) => r.height > 0 && r.bottom > at + 1).length;
    /* WHERE THE ROWS STOP, given the feet that stay. */
    const plan = (kept: typeof feet) => {
      const end = Math.max(kept.at(-1)?.bottom ?? -Infinity, ...rects.filter((r) => r.height > 0).map((r) => r.bottom));
      /* WHAT FITS IS LEFT WHOLE. Past the frame, the rows give way to the feet: the room is the frame's, less the feet as
         they stack under the rows (their own gaps kept). */
      let limit = Math.min(room, over);
      if (end > room + 1 && kept.length > 0) {
        const first = kept[0]!;
        const above = rects.filter((r) => r.height > 0 && r.bottom <= first.top + 1).reduce((m, r) => Math.max(m, r.bottom), -Infinity);
        const gap = Number.isFinite(above) ? Math.max(0, first.top - above) : 8;
        limit = Math.min(limit, room - (kept.at(-1)!.bottom - first.top) - gap);
      }
      /* A WIDGET THAT HAS NO "N MORE" OF ITS OWN SAYS HOW MANY IT LEFT OUT, under what it shows: at the frame's foot where
         nothing else is there, and just above its first foot where one is (a quiet line such as "Windows PC: 1 Claude
         session, quiet"), so the two never sit on each other (recheck N3). A foot that says more already says it. */
      const says = over === Infinity && !kept.some((f) => SAYS_MORE.test(f.el.textContent ?? ''));
      const cutAt = says && past(limit) > 0 ? limit - MORE_PX : limit;
      return { says, cutAt, shown: rects.some((r) => r.height > 0 && r.bottom <= cutAt + 1) };
    };
    let kept = feet;
    let p = plan(kept);
    /* A QUIET FOOT GIVES WAY BEFORE THE LAST ROW DOES: where the rows, the count and the quiet lines cannot all fit, the
       quiet lines go and one row at least stays (a one-row Working now). */
    const quiet = feet.filter((f) => !SAYS_MORE.test(f.el.textContent ?? ''));
    if (!p.shown && rects.some((r) => r.height > 0) && quiet.length > 0) {
      kept = feet.filter((f) => !quiet.includes(f));
      p = plan(kept);
      for (const f of quiet) marks.push([f.el, 1]);
    }
    const { says, cutAt } = p;
    /* ONE ROW AT LEAST, WHEN THERE ARE ROWS (live check of 30 October, 7): Arrivals drew its title, "3 more" and nothing,
       its first line taller than the room under the title. The first row stays and the frame clips what runs past it. */
    const first = rects.findIndex((r) => r.height > 0);
    const keepFirst = first >= 0 && !p.shown;
    const cutOf = (i: number): boolean => !(keepFirst && i === first) && rects[i]!.height > 0 && rects[i]!.bottom > cutAt + 1;
    rows.forEach((row, i) => marks.push([row, cutOf(i) ? 1 : 0]));
    /* A FOOT THAT COUNTS WHAT IT LEAVES OUT COUNTS WHAT THE FRAME CUT TOO (live check of 30 October, 5): Needs you held 4,
       drew two, had its second cut by the frame, and said "2 more" over one question where the phone said "3 more". */
    const counted = [...frame.querySelectorAll<HTMLElement>(FOOT)].find((f) => MORE_COUNT.test(ownText(f)));
    if (counted) recounts.push([counted, rows.filter((_, i) => cutOf(i)).length]);
    /* NEVER OVER THE ROW KEPT (Maya's Today, 1 Nov): a first row taller than the room is kept and clipped by the frame,
       and the frame's own count, laid at its foot, was then drawn on top of that row's words. Where the kept row reaches
       into the count's room, the frame says nothing more; the row's own clip says there is more. */
    const keptOver = keepFirst && rects[first]!.bottom > Math.min(room, over) - MORE_PX;
    const left = says && !keptOver ? past(cutAt) - (keepFirst ? 1 : 0) : 0;
    if (left > 0 && kept.length > 0) {
      delete frame.dataset.more;
      before.push([kept[0]!.el, `${left} more`]);
    } else if (left > 0) frame.dataset.more = `${left} more`;
    else delete frame.dataset.more;
  }
  for (const [row, cut] of marks) if (cut) row.dataset.cut = '';
  for (const [foot, said] of before) foot.dataset.moreBefore = said;
  for (const [foot, cut] of recounts) recount(foot, cut);
  closeUp(board, frames);
}

/**
 * NO AIR UNDER A TILE BUT THE BOARD'S GAP (leftovers 2 Nov, 8). On a laptop at rest each row is as tall as the tallest
 * thing that starts in it, and a tile laid across two rows hands its height to both, so the tile under a short one stood
 * 75px down (Working now beside Coming up), where every other pair of tiles stands one gap apart. Each tile is moved up
 * to one gap under whatever stands above it in its own columns, read in the order the packer laid them, and never down;
 * the board gives back what its foot no longer holds. A move, not a new layout: the grid, the order the screen is read
 * in and the cells a drag measures stay as they were, and editing draws every frame where its cells are.
 */
function closeUp(board: HTMLElement, frames: readonly HTMLElement[]): void {
  const resting = board.dataset.cols !== '2' && !board.closest('[data-editing]');
  for (const f of frames) f.style.translate = '';
  board.style.marginBlockEnd = '';
  if (!resting || frames.length === 0) return;
  const gap = parseFloat(getComputedStyle(board).rowGap) || 0;
  const laid = frames
    .map((f) => {
      const css = getComputedStyle(f);
      const r = f.getBoundingClientRect();
      const from = parseInt(css.gridColumnStart, 10);
      const to = parseInt(css.gridColumnEnd, 10);
      return { f, row: parseInt(css.gridRowStart, 10) || 0, from, to, top: r.top, bottom: r.bottom, height: r.height };
    })
    .filter((l) => Number.isFinite(l.from) && Number.isFinite(l.to) && l.to > l.from && l.height > 0)
    .sort((a, b) => a.row - b.row || a.from - b.from);
  const floor = new Map<number, number>();
  const moves: [HTMLElement, number][] = [];
  let lowest = -Infinity;
  for (const l of laid) {
    let above = -Infinity;
    for (let c = l.from; c < l.to; c += 1) above = Math.max(above, floor.get(c) ?? -Infinity);
    const want = Number.isFinite(above) ? Math.min(l.top, above + gap) : l.top;
    const up = l.top - want >= 1 ? Math.round(l.top - want) : 0;
    const bottom = l.bottom - up;
    for (let c = l.from; c < l.to; c += 1) floor.set(c, bottom);
    lowest = Math.max(lowest, bottom);
    if (up > 0) moves.push([l.f, up]);
  }
  for (const [f, up] of moves) f.style.translate = `0 ${-up}px`;
  const slack = Math.round(board.getBoundingClientRect().bottom - lowest);
  if (moves.length > 0 && slack > 0) board.style.marginBlockEnd = `${-slack}px`;
}

/** A foot's "N more" at its start, the number it says it leaves out. */
const MORE_COUNT = /^\s*\d[\d,]*\s+more\b/u;

/** The first of a foot's own words that holds a figure, which is where its "N more" is written. */
function countNode(foot: HTMLElement): Text | null {
  const walk = document.createTreeWalker(foot, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\d/u.test(n.nodeValue ?? '')) return n as Text;
  return null;
}
const ownText = (foot: HTMLElement): string => countNode(foot)?.data ?? '';

/**
 * THE FOOT'S "N MORE" PLUS WHAT THE FRAME CUT. What it said itself is kept on it (`data-more-own`), and what it was made
 * to say (`data-more-wrote`), so a later fit counts from its own number, and words the page wrote again are read fresh.
 * Written only where it changes, so the board's own watch of its words does not fit it again for nothing.
 */
function recount(foot: HTMLElement, cut: number): void {
  const node = countNode(foot);
  if (!node) return;
  const mine = foot.dataset.moreWrote !== undefined && node.data === foot.dataset.moreWrote && foot.dataset.moreOwn !== undefined;
  const own = mine ? foot.dataset.moreOwn! : node.data;
  const n = Number(/\d[\d,]*/u.exec(own)?.[0]?.replace(/,/gu, '') ?? Number.NaN);
  if (!Number.isFinite(n)) return;
  const said = own.replace(/\d[\d,]*/u, (n + cut).toLocaleString('en-GB'));
  foot.dataset.moreOwn = own;
  foot.dataset.moreWrote = said;
  if (node.data !== said) node.data = said;
}

/** The room the "N more" a widget with none of its own is given (`Board.svelte` draws it). */
const MORE_PX = 24;
