/**
 * The type scale, the spacing steps and the radii, as the declarations `skin/tokens.css` writes them, for a reader that
 * cannot import a stylesheet: the design book (`braindog-render`'s `designBook`) lists them for the app and for agents.
 *
 * ONE SCALE, TWO SPELLINGS, as `look-b.ts` is for the palette. `scale.test.ts` holds every line here to a line of the
 * sheet, so a step changed in `tokens.css` and not here fails, and the book never describes a scale that is not drawn.
 */
/*
 * 2026-10-20, ONE SCALE (UI pass, SPEC 1.4 to 1.6). The steps are `--fs-*`; the old `--t-*` names point at them, and are
 * listed here as the sheet writes them so the book still names a type step under the prefix it reads (`t-`) and says
 * which new step it is. The radii are the four and round; the old radius names alias to them and are not listed.
 */
export const SCALE_CSS = String.raw`:root {
  --t-xs: var(--fs-cap);
  --t-sm: var(--fs-meta);
  --t-base: var(--fs-body);
  --t-group: var(--fs-head);
  --t-figure: var(--fs-figure);
  --t-title: var(--fs-page);
  --t-lead: var(--fs-hero);
  --fs-cap: 12px;
  --fs-meta: 13px;
  --fs-ctl: 14px;
  --fs-body: 15px;
  --fs-head: 17px;
  --fs-figure: 22px;
  --fs-page: 28px;
  --fs-hero: 34px;
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;
  --sp-8: 64px;
  --sp-9: 96px;
  --r-xs: 4px;
  --r-ctl: 8px;
  --r-pop: 12px;
  --r-tile: 16px;
  --r-round: 999px;
}`;
