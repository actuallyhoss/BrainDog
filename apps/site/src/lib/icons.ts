/**
 * The glyphs this site draws, copied from the record app's set at `apps/web/src/lib/ui/icons.ts`.
 *
 * COPIED AND NOT IMPORTED, because the site depends on `@braindog/skin` and not on the app, and a
 * marketing page that could not build without the app's source is the dependency the screenshots'
 * README paragraph already refuses. Same 24-box, same stroke, same path data, so a glyph here is
 * the glyph a visitor meets again inside the product.
 *
 * FOUR, BECAUSE THE SITE ASKS FOR FOUR. Twenty-seven were carried over and twenty-three of them
 * were never drawn: most belonged to the bento tiles the home page rebuild deleted. Every call
 * site passes a string literal, so the reachable set is countable, and `IconName` is keyed off
 * this object: adding a glyph here is how you make one askable, and nothing else is needed. Copy
 * the next one back from the app's file rather than drawing a new one, so the two stay the same
 * shape.
 */

export const PATHS = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 5 5L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  rows: 'M4 6h16M4 12h16M4 18h16',
} as const;

export type IconName = keyof typeof PATHS;

/**
 * The three hues a mark may take, each a TEXT role so it reads against the surface it sits on in
 * both schemes. `--brand` is not one of them: it paints the logo and nothing else. `--danger` is
 * not one either, because on a page with nothing wrong on it a red mark would say something was.
 *
 * THREE BECAUSE `app.css` PAINTS THREE. `accent` was a fourth here with a rule to match, and no
 * call site ever asked for either; both went together so the type and the stylesheet keep saying
 * the same thing. Adding a hue means adding it in both places on the same day.
 */
export type Hue = 'info' | 'earn' | 'warn';
