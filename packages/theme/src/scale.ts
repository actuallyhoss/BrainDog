/**
 * The type scale, the spacing steps and the radii, as the declarations `skin/tokens.css` writes them, for a reader that
 * cannot import a stylesheet: the design book (`braindog-render`'s `designBook`) lists them for the app and for agents.
 *
 * ONE SCALE, TWO SPELLINGS, as `look-b.ts` is for the palette. `scale.test.ts` holds every line here to a line of the
 * sheet, so a step changed in `tokens.css` and not here fails, and the book never describes a scale that is not drawn.
 */
export const SCALE_CSS = String.raw`:root {
  --t-xs: 12px;
  --t-sm: 13px;
  --t-base: 15px;
  --t-md: 16px;
  --t-lg: 20px;
  --t-xl: 24px;
  --t-2xl: 32px;
  --t-3xl: 40px;
  --t-row: 15px;
  --t-group: 17px;
  --t-title: 28px;
  --t-figure: 22px;
  --t-lead: 34px;
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;
  --sp-8: 64px;
  --sp-9: 96px;
  --r-sm: 6px;
  --r-well: 9px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-ctl: 8px;
  --r-tile: 16px;
}`;
