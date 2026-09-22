/**
 * The glyphs this site draws, copied from the two sets the product draws with.
 *
 * COPIED AND NOT IMPORTED, because the site depends on `@braindog/skin` and not on the app, and a
 * marketing page that could not build without the app's source is the dependency the screenshots'
 * README paragraph already refuses. Same 24-box, same stroke, same path data, so a glyph here is
 * the glyph a visitor meets again inside the product.
 *
 * TWO SOURCES, KEPT APART BY NAME. The first block is the app's shell set,
 * `apps/web/src/lib/ui/icons.ts`, under the app's own names: it is what the record's rail draws
 * beside every page and list, and band 0001's miniature rail draws the same rows, so it takes the
 * same glyph under the same key (`rail.ts` says which, and `arrange.test.ts` checks every path
 * byte for byte against the app's file). The second block is Lucide, under Lucide's names, taken
 * from `packages/render/src/glyphs` where the renderer keeps it: one glyph per use case, the one
 * the case's tab and page title carry, named by `copy.ts` in Lucide's spelling. Lucide's ISC
 * notice is in `NOTICE` beside this file and travels with the data.
 *
 * ONLY WHAT THE SITE ASKS FOR. Twenty-seven were carried over once and twenty-three of them were
 * never drawn, so the rule since is that a glyph is here because a call site, `rail.ts` or a case
 * in `copy.ts` names it, and `IconName` is keyed off this object: adding a glyph here is how you
 * make one askable, and nothing else is needed. Copy the next one from its source rather than
 * drawing a new one, so the two stay the same shape.
 */

export const PATHS = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 5 5L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  rows: 'M4 6h16M4 12h16M4 18h16',

  /* The app's rail glyphs, for the rows `rail.ts` names. */
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
  decide: 'M12 21v-8m0 0L6 7V3m6 10 6-6V3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L12.5 17',
  money: 'M3 6h18v12H3zM6.5 9.5v.01M17.5 14.5v.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  board: 'M4 4h4.5v16H4zM9.75 4h4.5v10h-4.5zM15.5 4H20v13h-4.5z',
  obligation: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9.5 8h5M9.5 12h5',
  thing: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM12 12l9-4.5M12 12v9M12 12 3 7.5',
  people: 'M9.5 11.5a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5zM2.5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6M16 4.6a3.6 3.6 0 0 1 0 6.9m1.4 3.3c2.4.6 4.1 2.4 4.1 5.7',
  task: 'M4.5 5h15v14h-15zM8.5 12l2.5 2.5 4.5-4.5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4',
  tag: 'M3 11V4h7l11 11-7 7zM7.2 7.2h.01',
  session: 'M3 5h18v13H3zM7.5 9.5l2.5 2.5-2.5 2.5M12.5 14.5h4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  star: 'm12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z',
  observe: 'M3 15h3.2l2.3-7.5L11.8 19l2.4-6.4 1.4 2.4H21',

  /* Lucide, lucide-static 1.47.0 via `packages/render/src/glyphs`, ISC; see `NOTICE`. One per use
     case in `copy.ts`: Personal, Student, Solo founder, Team and New project, in that order. */
  house: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'graduation-cap': 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
  rocket: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05',
} as const;

export type IconName = keyof typeof PATHS;

/**
 * Whether a string from `copy.ts` names a glyph here. `Case.glyph` is typed `string` because that
 * is the contract with the copy deck, so the component narrows through this rather than casting,
 * and `arrange.test.ts` is what makes sure the narrowing never has to say no.
 */
export const isIconName = (name: string): name is IconName => Object.hasOwn(PATHS, name);

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
