/**
 * `layout-settle`: a screen that never says it is drawn is a finding, never a measurement of an empty document. The
 * wait itself is `lib.mjs`'s `readiness`, which every pass asks through `run.ready`; what lives here is the fault the
 * rule is proved on.
 */

/* THE MARK TAKEN OFF `#main` EVERY TIME THE SCREEN PUTS IT ON, from before the first script runs, so the wait sees a
   screen that never says it is drawn, and on the reload it is given as well. `data-screen` is `lib.mjs`'s `SCREEN`. */
export const takeMark = (context) =>
  context.addInitScript(() => {
    new MutationObserver(() => document.getElementById('main')?.removeAttribute('data-screen')).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-screen'],
    });
  });

