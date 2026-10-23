/**
 * `layout-overflow` (and `layout-site`, the same rule on the marketing site): nothing may stick out sideways. What
 * counts as an overflow is argued at the top of `../layout.mjs`.
 *
 * `OVERFLOW` RUNS IN THE PAGE, so it closes over nothing in this file: `page.evaluate` sends its text. `measure.mjs`
 * calls it beside the target rule, so every pass that measures a page runs the identical check.
 */

/**
 * WHAT ONE PAGE IS MEASURED FOR, hoisted so the variant pass runs the identical check.
 *
 * It was an inline arrow inside the width loop, which is fine while there is one loop. A second
 * pass over a second record with a COPY of this would be two rules wearing one name, the exact
 * shape this repo keeps finding. It is named once and passed to both.
 */
export const OVERFLOW = ([w, slack, docked = false]) => {
  const hits = [];
  /* WITH A PANEL DOCKED, THE WORK ENDS WHERE THE PANEL STARTS, and that is the edge nothing in it may pass: the
     panel has a column of its own from 1,280 up, so a heading reaching under it has made `#main` scroll sideways
     beside it, which is the same bug as the document doing it with the panel shut. The panel's own contents are
     not the work's and are not read. */
  const dock = docked ? document.querySelector('dialog.dock[open]:not(:modal)') : null;
  const edge = dock ? dock.getBoundingClientRect().left : w;
  /* AND ONLY BESIDE IT: the top bar runs the window's width over the panel (frame B), so what ends above the panel's
     top has nothing under it and is not the work's to keep in its column. */
  const top = dock ? dock.getBoundingClientRect().top : -Infinity;
  const work = document.getElementById('main');
  if (dock && work && work.scrollWidth > work.clientWidth + slack) {
    hits.push(`the work scrolls sideways beside the panel (${work.scrollWidth}px in ${work.clientWidth}px)`);
  }
  if (document.documentElement.scrollWidth > w + slack) {
    hits.push(`the DOCUMENT scrolls sideways (${document.documentElement.scrollWidth}px)`);
  }
  /* A table wider than the page is the design. A heading wider than the page is a bug. The
     difference is whether anything above it scrolls or clips. */
  /* THE WALK STOPS AT THE SURFACE, and that is the whole rule. It went all the way to `body`,
     and the shell's own `.body` panel is `overflow-y: auto`, which computes `overflow-x` to
     `auto` as well, so EVERY element inside `#main` had a scrolling ancestor and every one of
     them was excused. The gate could only ever see the nav and the tab bar; a 2000px heading in
     the middle of a page was contained by the thing that makes the page scroll at all.

     It went green on its own seeded violation the day a second surface got a scroll container,
     which is the self-test doing exactly what it is for. */
  /* THE THREE ROOTS THE SELECTOR BELOW WALKS FROM, and a `nav` INSIDE `#main` is not one of them.
     Stopping at every `nav` excused nothing and accused plenty: the settings tab strip is a
     `<nav>` with `overflow-x: auto`, doing exactly what a horizontal scroller does, and reading
     it as a surface root meant its own scrolling never counted: twenty-four findings about a
     control working as designed. A surface is where the measurement starts, not any element that
     happens to share its tag. */
  const surface = (el) =>
    el.id === 'main' || el.classList.contains('tab-slot') || (el.tagName === 'NAV' && !el.closest('#main'));
  const contained = (el) => {
    for (let a = el.parentElement; a && a !== document.body && !surface(a); a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('#main *, nav *, .tab-slot *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= edge + 1 || r.bottom <= top + 1) continue;
    if (getComputedStyle(el).position === 'fixed' || contained(el) || dock?.contains(el)) continue;
    hits.push(
      `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} reaches ${Math.round(r.right)}px` +
        (dock ? `, under the panel from ${Math.round(edge)}px` : ''),
    );
  }
  return [...new Set(hits)].slice(0, 4);
};

/* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. With `BRAINDOG_GATE_SEED=layout-overflow` a 2000px heading is put into `#main`
   (the exact bug this gate is named after) and the run must go red. It is here rather than in a fixture tree because
   the thing under test is a real browser over a real build, and there is no smaller way to hold that. One function
   for every pass that seeds, so the heading the docked pass is proved on is the one the sweep is. */
export const seedHeading = (page) =>
  page.evaluate(() => {
    const h = document.createElement('h2');
    h.textContent = 'seeded';
    h.style.cssText = 'width:2000px;white-space:nowrap';
    document.getElementById('main')?.prepend(h);
  });
