/**
 * The glyphs this site draws, copied from the record app's set at `apps/web/src/lib/ui/icons.ts`.
 *
 * COPIED AND NOT IMPORTED, because the site depends on `@braindog/skin` and not on the app, and a
 * marketing page that could not build without the app's source is the dependency the screenshots'
 * README paragraph already refuses. Same 24-box, same stroke, same path data, so a glyph here is
 * the glyph a visitor meets again inside the product. Only the ones the site uses are here.
 */

export const PATHS = {
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
  decide: 'M12 21v-8m0 0L6 7V3m6 10 6-6V3',
  inbox: 'M5 4h14l2 8v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7zM3 12h5l1.5 2.5h5L16 12h5',
  check: 'm5 12 5 5L19 6',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-14v5l3 2',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17v.01',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  money: 'M3 6h18v12H3zM6.5 9.5v.01M17.5 14.5v.01M12 14.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  rows: 'M4 6h16M4 12h16M4 18h16',
  thing: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM12 12l9-4.5M12 12v9M12 12 3 7.5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L12.5 17',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  download: 'M12 4v11m-4-4 4 4 4-4M4 19h16',
  ban: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM5.6 5.6l12.8 12.8',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v5M12 7.5v.01',
  code: 'm9 8-5 4 5 4M15 8l5 4-5 4',
  observe: 'M3 15h3.2l2.3-7.5L11.8 19l2.4-6.4 1.4 2.4H21',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  key: 'M14.5 9.5a4 4 0 1 1-1.6 3.2L7 19H4v-3l6.3-6.3a4 4 0 0 1 4.2-.2zM16.5 7.5v.01',
} as const;

export type IconName = keyof typeof PATHS;

/**
 * The four hues a glyph chip may take, each a TEXT role so it reads against the surface it sits on
 * in both schemes. `--brand` is not one of them: it paints the logo and nothing else. `--danger` is
 * not one either, because on a page with nothing wrong on it a red mark would say something was.
 */
export type Hue = 'accent' | 'info' | 'earn' | 'warn';
