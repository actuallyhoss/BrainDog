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
 * A WIDGET'S OWN DOOR ON ITS HEAD'S ROW, which is no foot but says the same: Projects on Today says "All projects" at the
 * end of its head, over a count of them, and the frame still said "1 more", laid over the first card's avatar (slash lane,
 * 4 Nov). Where a widget has this door, the frame adds no count of its own. A door that says "N more" is recounted below.
 */
const HEAD_DOOR = '.p-more';
/** The "N more" link this file draws (`moreLinks`), whose words are never read back as the widget's own. */
const OWN_LINK = 'a[data-fit-more]';
/** What a foot says in its own words, less the link this file put in it. */
const saidBy = (el: HTMLElement): string => {
  const link = el.querySelector(OWN_LINK);
  const all = el.textContent ?? '';
  return link ? all.replace(link.textContent ?? '', '') : all;
};
/**
 * A CHART'S OWN PARTS ARE NOT ROWS: its bars, scale, ticks and legend are list items and its numbers a table, and read as
 * rows they were hidden one by one and counted, a weekly chart drawn as its title and "36 more" (the validator's recheck
 * of 30 October, N1). A chart is drawn whole and the frame clips it, as any picture is.
 */
const CHART = '.series, [role="img"], svg';
/**
 * CARDS STAND ON THE BOARD WITH NO TILE ROUND THEM (`BlockSlot`'s `.project-cards`), so a count under them has no padding
 * to sit in and no room the frame keeps: Projects on Maya's Today drew one card and said nothing of the other three at
 * 1512, and "2 more" clipped at the frame's edge at 1728 (live verify, 2 Nov). Their count goes on the head's row,
 * at its end (`Board.svelte`), and takes no room from the cards.
 */
const HEAD_COUNT = '.project-cards';

/**
 * FITS EVERY FRAME, AND HANDS BACK THE ARRIVALS STILL PLAYING (blink fix, 3 Nov). The owner saw Today blink: the fit measured a
 * frame with its own last answer still drawn in it (the "1 more" line in the flow, a grown height, a quiet foot's room), so
 * Your work this week measured short with the line, cut nothing and took the line away, measured long without it and put
 * it back, and each link it added or took away was a change the board's watch fitted again, about 120 times a second. Now
 * the measure is of the board with nothing this file wrote taking room (`data-fit-measure`, `Board.svelte`), so the same
 * board always fits the same way, and then only what changed is written. A frame still rising into place (a transform)
 * is measured again once it lands: the caller fits again when those animations finish.
 */
export function fitBoard(board: HTMLElement): Animation[] {
  const frames = [...board.querySelectorAll<HTMLElement>('[data-board-key]')].filter((f) => f.dataset.lifted === undefined);
  /* EACH FRAME'S ROWS AS LAID (T5): a laptop's frame at rest is as tall as what it draws, the rows it was laid across at
     most, and the packer may lay a frame across more rows than its size (`filled` in `pack.ts`). Read from its own
     grid-area, written before anything is measured.
     AND A DRAFT'S KEEP BAR, AS TALL AS IT IS DRAWN (leftovers 4): on a laptop at rest the frame is held to its rows, and
     the bar under the widget took its height out of them, so Spending's figures were cut under Keep. The frame is let
     taller by the bar (`Board.svelte`), whatever the bar wraps to at the frame's width.
     EVERY FRAME READ, THEN EVERY FRAME WRITTEN (speed5): read between writes, each frame's bar laid the board out again,
     once a widget, and on a cold phone this was the hottest function of the open. A span or a bar changes a frame's
     height and never a width, so no bar read here depends on what another frame is about to be told. */
  const laid = frames.map((frame) => {
    const css = getComputedStyle(frame);
    const span = (parseInt(css.gridRowEnd, 10) || 0) - (parseInt(css.gridRowStart, 10) || 0);
    const bar = frame.querySelector<HTMLElement>(':scope > [data-draft-mark]');
    return { span, said: bar === null ? '' : `${Math.ceil(bar.getBoundingClientRect().height)}px` };
  });
  frames.forEach((frame, i) => {
    const { span, said } = laid[i]!;
    if (span > 0 && frame.style.getPropertyValue('--span') !== String(span)) frame.style.setProperty('--span', String(span));
    if (frame.style.getPropertyValue('--bar') !== said) {
      if (said === '') frame.style.removeProperty('--bar');
      else frame.style.setProperty('--bar', said);
    }
  });
  /* MEASURED WHOLE, AND FROM NOTHING THIS FILE WROTE: every cut row drawn again, no "N more" of this file's in the flow,
     no grown height and no quiet foot's room, by one mark on the board the stylesheet reads, put on and taken off in this
     task so nothing is painted between. Nothing is taken off a row or a frame to measure it, so a fit that comes to the
     same answer writes nothing at all. */
  board.dataset.fitMeasure = '';
  const cut = new Set<HTMLElement>();
  const grows = new Map<HTMLElement, number>();
  const more = new Map<HTMLElement, string>();
  const before = new Map<HTMLElement, string>();
  const recounts: [HTMLElement, number][] = [];
  const moving: Animation[] = [];
  for (const frame of frames) {
    for (const a of frame.getAnimations()) if (a.playState !== 'finished') moving.push(a);
    /* AND A ROW STILL OPENING OR CLOSING IN IT (the record growing, `rowsMotion`): it is measured at its part height
       now, and fitted again where it lands. Only what ends: a live dot that never does would hold the fit back. */
    for (const a of frame.getAnimations({ subtree: true }))
      if ((a.effect as KeyframeEffect | null)?.target !== frame && a.playState !== 'finished' && /^(?:glide|room|leave)$/u.test(a.id)) moving.push(a);
    const box = frame.getBoundingClientRect();
    const frameCss = getComputedStyle(frame);
    const pad = parseFloat(frameCss.paddingBlockEnd) || 0;
    /* THE ROOM A FRAME HAS, NOT THE ROOM IT TAKES (blink fix, 3 Nov): at rest a frame is as tall as what it draws, up to its
       most, so its foot is where its own rows end. Read from there, Your work this week's last row stood 8px into the
       padding and was cut; with the count's line in the flow the frame reached its most and the same row fitted, so it
       was put back, and so on. The room is where the frame would stop, its top and its most, whatever it draws now. */
    const most = frameCss.maxBlockSize.endsWith('px') ? parseFloat(frameCss.maxBlockSize) : Number.NaN;
    const room = (Number.isFinite(most) ? Math.max(box.bottom, box.top + most) : box.bottom) - pad;
    /* THE OUTERMOST ROWS ONLY: a card's own list is the card's, and goes with it. */
    const rows = [...frame.querySelectorAll<HTMLElement>(ROWS)].filter((row) => {
      if (row.closest(FOOT)) return false;
      /* A ROW LETTING GO (`rowsMotion`) is already gone from the list, and takes no room the fit counts. */
      if (row.closest('[data-leaving]')) return false;
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
    const inHead = frame.querySelector(HEAD_COUNT) !== null;
    const ownDoor = [...frame.querySelectorAll<HTMLElement>(HEAD_DOOR)].some((door) => SAYS_MORE.test(saidBy(door)));
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
      const says = over === Infinity && !ownDoor && !kept.some((f) => SAYS_MORE.test(saidBy(f.el)));
      const cutAt = says && !inHead && past(limit) > 0 ? limit - MORE_PX : limit;
      return { says, cutAt, shown: rects.some((r) => r.height > 0 && r.bottom <= cutAt + 1) };
    };
    let kept = feet;
    let p = plan(kept);
    /* A QUIET FOOT GIVES WAY BEFORE THE LAST ROW DOES: where the rows, the count and the quiet lines cannot all fit, the
       quiet lines go and one row at least stays (a one-row Working now). */
    const quiet = feet.filter((f) => !SAYS_MORE.test(saidBy(f.el)));
    if (!p.shown && rects.some((r) => r.height > 0) && quiet.length > 0) {
      kept = feet.filter((f) => !quiet.includes(f));
      p = plan(kept);
      for (const f of quiet) cut.add(f.el);
    }
    const { says, cutAt } = p;
    /* ONE ROW AT LEAST, WHEN THERE ARE ROWS (live check of 30 October, 7): Arrivals drew its title, "3 more" and nothing,
       its first line taller than the room under the title. The first row stays and the frame clips what runs past it. */
    const first = rects.findIndex((r) => r.height > 0);
    const keepFirst = first >= 0 && !p.shown;
    /* A ROW'S NEIGHBOURS ON ITS LINE GO WITH IT (2 Nov, 1280): Projects' cards stand two to a line, and the first card was
       kept while the one beside it, as tall and on the same line, was cut, so half the line stood empty beside "3 more". */
    const line = keepFirst ? rects.map((r, i) => (r.height > 0 && Math.abs(r.top - rects[first]!.top) < 1 ? i : -1)).filter((i) => i >= 0) : [];
    /* AND THE FRAME LETS THAT LINE AND ITS FOOT IN, at rest (2 Nov, 1280): Arrivals at one row kept its first line, two
       lines tall at that width, and the frame cut "All activity" off at its foot; Projects' cards were cut square at their
       foot. The frame is let as tall as the kept line, its feet and the tile's own padding, and no taller; the rows under
       it still go. */
    if (keepFirst && board.dataset.cols !== '2' && !board.closest('[data-editing]')) {
      const block = frame.querySelector<HTMLElement>(':scope > .block') ?? frame;
      const b = block.getBoundingClientRect();
      const lineEnd = Math.max(...line.map((i) => rects[i]!.bottom));
      const natural = Math.max(...rects.filter((r) => r.height > 0).map((r) => r.bottom), ...kept.map((f) => f.bottom));
      const tail = Math.max(0, b.top + block.scrollHeight - natural);
      let end = lineEnd;
      if (kept.length > 0 && !inHead) {
        const top = kept[0]!.top;
        const above = rects.filter((r) => r.height > 0 && r.bottom <= top + 1).reduce((m, r) => Math.max(m, r.bottom), -Infinity);
        end += (Number.isFinite(above) ? Math.max(0, top - above) : 8) + (kept.at(-1)!.bottom - top);
      }
      const need = Math.ceil(end - box.top + tail);
      if (need > box.height + 1) grows.set(frame, need);
    }
    /* A FRAME OF NO ROWS (a figure's bars) HAS NOTHING TO CUT, so its overflow was clipped at the frame's foot, the last
       bar on the edge with no padding (Cash by book). It is let as tall as its content, padding included, as the first line is. */
    if (rows.length === 0 && !board.closest('[data-editing]') && frame.scrollHeight > Math.ceil(box.height) + 1) grows.set(frame, frame.scrollHeight);
    /* A FRAME THAT CUTS NO ROW BUT HAS ITS FOOT'S DOOR SLICED ("All numbers" at 1280) IS LET AS TALL AS ITS CONTENT, as a
       frame of no rows is: a line is never cut in half. */
    else if (!board.closest('[data-editing]') && frame.querySelector('a.kb-all') !== null && !rects.some((r, i) => !line.includes(i) && r.height > 0 && r.bottom > cutAt + 1) && frame.scrollHeight > Math.ceil(box.height) + 1) grows.set(frame, frame.scrollHeight);
    const cutOf = (i: number): boolean => !line.includes(i) && rects[i]!.height > 0 && rects[i]!.bottom > cutAt + 1;
    rows.forEach((row, i) => cutOf(i) && cut.add(row));
    /* A FOOT THAT COUNTS WHAT IT LEAVES OUT COUNTS WHAT THE FRAME CUT TOO (live check of 30 October, 5): Needs you held 4,
       drew two, had its second cut by the frame, and said "2 more" over one question where the phone said "3 more". */
    const counted = [...frame.querySelectorAll<HTMLElement>(FOOT)].find((f) => MORE_COUNT.test(ownText(f)));
    if (counted) recounts.push([counted, rows.filter((_, i) => cutOf(i)).length]);
    /* NEVER OVER THE ROW KEPT (Maya's Today, 1 Nov): a first row taller than the room is kept and clipped by the frame,
       and the frame's own count, laid at its foot, was then drawn on top of that row's words. Where the kept row reaches
       into the count's room, the frame says nothing more; the row's own clip says there is more. */
    const keptOver = !inHead && keepFirst && rects[first]!.bottom > Math.min(room, over) - MORE_PX;
    const left = says && !keptOver ? past(cutAt) - line.filter((i) => rects[i]!.bottom > cutAt + 1).length : 0;
    if (left > 0 && kept.length > 0 && !inHead) before.set(kept[0]!.el, `${left} more`);
    else if (left > 0) more.set(frame, `${left} more`);
  }
  delete board.dataset.fitMeasure;
  /* THEN WRITTEN, ONLY WHERE IT CHANGED: a mark put back that was already there is still a change to a watch, and every
     row and frame written again each fit was the blinking's fuel. */
  for (const frame of frames) {
    for (const el of frame.querySelectorAll<HTMLElement>('[data-cut]')) if (!cut.has(el)) delete el.dataset.cut;
    for (const el of frame.querySelectorAll<HTMLElement>('[data-more-before]')) if (!before.has(el)) delete el.dataset.moreBefore;
    const need = grows.get(frame);
    if (need === undefined) {
      if (frame.dataset.grown !== undefined) delete frame.dataset.grown;
      if (frame.style.getPropertyValue('--grown') !== '') frame.style.removeProperty('--grown');
    } else {
      if (frame.style.getPropertyValue('--grown') !== `${need}px`) frame.style.setProperty('--grown', `${need}px`);
      if (frame.dataset.grown === undefined) frame.dataset.grown = '';
    }
    const said = more.get(frame);
    if (said === undefined) {
      if (frame.dataset.more !== undefined) delete frame.dataset.more;
    } else if (frame.dataset.more !== said) frame.dataset.more = said;
  }
  for (const el of cut) if (el.dataset.cut === undefined) el.dataset.cut = '';
  for (const [foot, said] of before) if (foot.dataset.moreBefore !== said) foot.dataset.moreBefore = said;
  for (const [foot, n] of recounts) recount(foot, n);
  moreLinks(frames);
  closeUp(board, frames);
  return moving;
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
  const moves = new Map<HTMLElement, number>();
  const grows = new Map<HTMLElement, number>();
  let margin = '';
  if (resting && frames.length > 0) {
    const gap = parseFloat(getComputedStyle(board).rowGap) || 0;
    /* READ AS LAID, NOT AS DRAWN (blink fix, 3 Nov): a frame's offsets are the layout's own, which neither the move this
       made last time nor a widget's arrival (both transforms) shifts, so nothing is taken off to be read and a fit that
       lands where it stood writes nothing. */
    /* A FOOT'S GROWTH IS TAKEN OFF TO READ IT, and put on again below, so its own height is read and not the one drawn. */
    for (const f of frames) {
      if (f.style.minBlockSize === '') continue;
      f.style.minBlockSize = '';
      f.style.maxBlockSize = '';
      f.style.marginBlockEnd = '';
    }
    const laid = frames
      .map((f) => {
        const css = getComputedStyle(f);
        const from = parseInt(css.gridColumnStart, 10);
        const to = parseInt(css.gridColumnEnd, 10);
        return { f, row: parseInt(css.gridRowStart, 10) || 0, end: parseInt(css.gridRowEnd, 10) || 0, from, to, top: f.offsetTop, bottom: f.offsetTop + f.offsetHeight, height: f.offsetHeight };
      })
      .filter((l) => Number.isFinite(l.from) && Number.isFinite(l.to) && l.to > l.from && l.height > 0)
      .sort((a, b) => a.row - b.row || a.from - b.from);
    const floor = new Map<number, number>();
    let lowest = -Infinity;
    for (const l of laid) {
      let above = -Infinity;
      for (let c = l.from; c < l.to; c += 1) above = Math.max(above, floor.get(c) ?? -Infinity);
      const want = Number.isFinite(above) ? Math.min(l.top, above + gap) : l.top;
      const up = l.top - want >= 1 ? Math.round(l.top - want) : 0;
      const bottom = l.bottom - up;
      for (let c = l.from; c < l.to; c += 1) floor.set(c, bottom);
      lowest = Math.max(lowest, bottom);
      if (up > 0) moves.set(l.f, up);
    }
    /* THE FOOT OF A BAND (`data-foot`, `feet` in `pack.ts`) IS DRAWN DOWN TO THE LOWEST FOOT ON ITS LINE, so the shorter of
       two columns ends level with the taller and no hole stands above the wide tile that follows. Its height grows and a
       negative margin takes the growth back out of its row, so the grid keeps the rows it had; its content stays at its top. */
    for (const l of laid) {
      if (!l.f.hasAttribute('data-foot')) continue;
      let low = -Infinity;
      for (const g of laid) if (g.end === l.end && g.f.hasAttribute('data-foot')) low = Math.max(low, g.bottom - (moves.get(g.f) ?? 0));
      const drawn = l.bottom - (moves.get(l.f) ?? 0);
      if (low - drawn >= 1) grows.set(l.f, Math.round(low - drawn));
    }
    /* THE BOARD GIVES BACK WHAT ITS FOOT NO LONGER HOLDS, by its own laid height (a margin never moves it). */
    const slack = Math.round(board.offsetHeight - lowest);
    if (moves.size > 0 && slack > 0) margin = `${-slack}px`;
  }
  for (const f of frames) {
    const up = moves.get(f);
    const want = up === undefined ? '' : `0px ${-up}px`;
    if (f.style.translate !== want) f.style.translate = want;
    const grow = grows.get(f);
    const [h, tall, give] = grow === undefined ? ['', '', ''] : [`${f.offsetHeight + grow}px`, `${f.offsetHeight + grow}px`, `${-grow}px`];
    if (f.style.minBlockSize !== h) f.style.minBlockSize = h;
    if (f.style.maxBlockSize !== tall) f.style.maxBlockSize = tall;
    if (f.style.marginBlockEnd !== give) f.style.marginBlockEnd = give;
  }
  if (board.style.marginBlockEnd !== margin) board.style.marginBlockEnd = margin;
}

/** Where a widget's whole list is: its head's link to its source, or its own door ("All agents", "All numbers"). */
const DOOR = 'a.block-source[href], a.tile-link[href], a.kb-all[href]';

/**
 * THE "N MORE" A FRAME WRITES IS A LINK TO THE WHOLE LIST (work2 2 Nov, 7): "1 more" under Your work this week and "3 more"
 * on Projects were words drawn by the stylesheet, so the one line that said there was more led nowhere. Where the widget
 * names its list (its head's source link, or its own door), the count is drawn as a link there, in the same place and
 * the same size as the words it replaces (`Board.svelte`), so nothing moves; where it names none, the words stay.
 * Written only where something changed, so the board's watch of its own content does not fit it again for nothing.
 */
function moreLinks(frames: readonly HTMLElement[]): void {
  for (const frame of frames) {
    const door = frame.querySelector<HTMLAnchorElement>(DOOR)?.getAttribute('href') ?? null;
    /* AT THE FRAME'S FOOT, a child of the frame, where its words were. */
    const own = frame.querySelector<HTMLAnchorElement>(`:scope > ${OWN_LINK}`);
    const said = frame.dataset.more;
    if (said !== undefined && door !== null) {
      linkTo(frame, own, said, door, 'end');
      if (frame.dataset.moreLink === undefined) frame.dataset.moreLink = '';
    } else {
      own?.remove();
      if (frame.dataset.moreLink !== undefined) delete frame.dataset.moreLink;
    }
    /* AND OVER A QUIET FOOT, inside it, where its words were; never inside a foot that is a link itself. */
    for (const foot of frame.querySelectorAll<HTMLElement>('[data-more-before], [data-more-link]:not([data-board-key])')) {
      const inner = foot.querySelector<HTMLAnchorElement>(`:scope > ${OWN_LINK}`);
      const before = foot.dataset.moreBefore;
      if (before !== undefined && door !== null && foot.tagName !== 'A' && foot.querySelector('a:not([data-fit-more])') === null) {
        linkTo(foot, inner, before, door, 'start');
        if (foot.dataset.moreLink === undefined) foot.dataset.moreLink = '';
      } else {
        inner?.remove();
        if (foot.dataset.moreLink !== undefined) delete foot.dataset.moreLink;
      }
    }
  }
}

function linkTo(host: HTMLElement, link: HTMLAnchorElement | null, said: string, href: string, at: 'start' | 'end'): void {
  let a = link;
  if (a === null) {
    a = document.createElement('a');
    a.dataset.fitMore = '';
    a.className = 'fit-more';
    if (at === 'start') host.prepend(a);
    else host.append(a);
  }
  if (a.getAttribute('href') !== href) a.setAttribute('href', href);
  if (a.textContent !== said) a.textContent = said;
}

/** A foot's "N more" at its start, the number it says it leaves out. */
const MORE_COUNT = /^\s*\d[\d,]*\s+more\b/u;

/** The first of a foot's own words that holds a figure, which is where its "N more" is written. */
function countNode(foot: HTMLElement): Text | null {
  const walk = document.createTreeWalker(foot, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\d/u.test(n.nodeValue ?? '') && !n.parentElement?.closest(OWN_LINK)) return n as Text;
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
  if (foot.dataset.moreOwn !== own) foot.dataset.moreOwn = own;
  if (foot.dataset.moreWrote !== said) foot.dataset.moreWrote = said;
  if (node.data !== said) node.data = said;
}

/** The room the "N more" a widget with none of its own is given (`Board.svelte` draws it). */
const MORE_PX = 24;
