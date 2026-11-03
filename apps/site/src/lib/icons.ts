/**
 * The glyphs this site draws: BrainDog's one icon set, the app's, shape for shape.
 *
 * WRITTEN FROM THE APP AND NOT IMPORTED, because the site depends on `@braindog/skin` and not on the app, and a
 * marketing page that could not build without the app's source is a dependency the site refuses. So the first part of
 * `SET`, between the two marks, is written by `scripts/icons.mjs` from `apps/web/src/lib/ui/icons.ts`, under the names
 * its table gives, and `icons.test.ts` fails when the two come apart: a glyph renamed or redrawn in the app is a red
 * test here until the script is run. NEVER EDIT BETWEEN THE MARKS. The second part is the shapes of the same set that
 * the app does not draw, and those are by hand. All of them are the set's own: a 24 grid, strokes only, round caps and
 * joins, drawn by `Icon.svelte` at 1.5 (SPEC 4.7 S6, the app's stroke). Each value is the inner markup of the `<svg>`, so
 * a glyph here is the glyph a visitor meets again inside the product.
 *
 * EVERY NAME THE SITE ASKED FOR BEFORE STILL RESOLVES. The older names (`arrow`, `close`, `rows`, `back`, `board`,
 * `obligation`, `task`, `house`, `wallet`, `users`, `terminal`) are kept at the bottom as the set's shape for the same
 * idea, so an example page or a pack that names one keeps drawing. Three ideas have no shape in the set and keep the
 * Lucide drawing they had (`graduation-cap`, `rocket`, `layers`); its ISC notice is in `NOTICE` beside this file.
 */

const SET = {
  /* icons:app. Written by `scripts/icons.mjs` from the app's glyphs. Change the app, then run the script. */
  today: '<rect x="3.75" y="5.25" width="16.5" height="15" rx="3.5"/><path d="M3.75 10h16.5M8 3.25v3.5M16 3.25v3.5"/><path d="M10.75 13.75h2.5v2.5h-2.5zM11.5 15h1"/>',
  work: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5"/><path d="M8.25 12.25l2.5 2.5 5-5.5"/>',
  projects: '<rect x="3.75" y="3.75" width="9.5" height="7" rx="2"/><rect x="15.25" y="3.75" width="5" height="7" rx="2"/><rect x="3.75" y="12.75" width="5" height="7.5" rx="2"/><rect x="10.75" y="12.75" width="9.5" height="7.5" rx="2"/>',
  money: '<path d="M18.5 7.25V5.9a1.4 1.4 0 0 0-1.75-1.36L6 7.25"/><rect x="3.75" y="7.25" width="16.5" height="12.5" rx="3"/><path d="M20.25 11.5h-3.5a2 2 0 0 0 0 4h3.5"/>',
  activity: '<path d="M3 12.5h3.75l2.5-6 4.5 11 2.5-5h4.75"/>',
  decide: '<path d="M3.75 13.25 6.4 5.9a2 2 0 0 1 1.88-1.15h7.44a2 2 0 0 1 1.88 1.15l2.65 7.35"/><path d="M3.75 13.25v4.5a2.5 2.5 0 0 0 2.5 2.5h11.5a2.5 2.5 0 0 0 2.5-2.5v-4.5h-5l-1.5 2.5h-3.5l-1.5-2.5z"/>',
  settings: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  search: '<circle cx="10.75" cy="10.75" r="6.5"/><path d="M20 20l-4.6-4.6"/>',
  slash: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5"/><path d="M14.25 7.75l-4.5 8.5"/>',
  plus: '<path d="M12 5.25v13.5M5.25 12h13.5"/>',
  check: '<path d="M5 12.5l4.25 4.25L19 7"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  'arrow-right': '<path d="M4.75 12h14.5M13.5 6.25 19.25 12l-5.75 5.75"/>',
  'arrow-left': '<path d="M19.25 12H4.75M10.5 6.25 4.75 12l5.75 5.75"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
  'chevron-right': '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  'chevron-down': '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>',
  filter: '<path d="M3.75 5.25h16.5l-6.25 7.5v6.5l-4 1.5v-8z"/>',
  keyboard: '<rect x="2.75" y="6" width="18.5" height="12" rx="2.5"/><path d="M6.5 9.75h.01M10 9.75h.01M13.5 9.75h.01M17 9.75h.01M8 14h8"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.75 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.35 2.1-2.35 3.6"/><path d="M12 17h.01"/>',
  trash: '<path d="M4.75 6.75h14.5M9.75 6.75V4.75h4.5v2M6.75 6.75l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h5.9a1.5 1.5 0 0 0 1.5-1.4l.8-12.1"/>',
  download: '<path d="M12 4.25V15.5M7.5 11 12 15.5 16.5 11"/><path d="M4.75 14.75v2.5a3 3 0 0 0 3 3h8.5a3 3 0 0 0 3-3v-2.5"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 0 1-12.9 5.2M4.5 12a7.5 7.5 0 0 1 12.9-5.2"/><path d="M17.75 3.5v3.5h-3.5M6.25 20.5V17h3.5"/>',
  eye: '<path d="M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M7.25 5.5v13l11-6.5z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  agent: '<rect x="3.25" y="4.75" width="17.5" height="14.5" rx="3.5"/><path d="M7.5 10l2.75 2.25L7.5 14.5M12.75 14.5h3.75"/>',
  people: '<circle cx="9" cy="8.75" r="3.25"/><path d="M3.25 19.5a5.75 5.75 0 0 1 11.5 0"/><path d="M15.5 5.75a3.25 3.25 0 0 1 0 6"/><path d="M17.25 14.25a5.75 5.75 0 0 1 3.5 5.25"/>',
  calendar: '<rect x="3.75" y="5.25" width="16.5" height="15" rx="3.5"/><path d="M3.75 10h16.5M8 3.25v3.5M16 3.25v3.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.75v5"/><path d="M12 16.25h.01"/>',
  receipt: '<path d="M6 3.75h12v16.5l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v10.25h12V9"/><path d="M10 19.25v-5h4v5"/>',
  tag: '<path d="M3.75 12.5V5.25a1.5 1.5 0 0 1 1.5-1.5h7.25l8.25 8.25-8.75 8.75z"/><path d="M8 8h.01"/>',
  file: '<path d="M6.25 3.75h7.5l4.5 4.5v12H6.25z"/><path d="M13.75 3.75v4.5h4.5"/><path d="M9 13h6M9 16.5h4"/>',
  inbox: '<path d="M3.75 13.25 6.4 5.9a2 2 0 0 1 1.88-1.15h7.44a2 2 0 0 1 1.88 1.15l2.65 7.35"/><path d="M3.75 13.25v4.5a2.5 2.5 0 0 0 2.5 2.5h11.5a2.5 2.5 0 0 0 2.5-2.5v-4.5h-5l-1.5 2.5h-3.5l-1.5-2.5z"/>',
  zap: '<path d="M13 3.25 5.25 13.5H12l-1 7.25 7.75-10.25H12z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.9 9.9 4.3 4.3 0 0 0 7 18.5z"/>',
  plug: '<path d="M9 3.75v4M15 3.75v4"/><path d="M6.5 7.75h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.75v3.5"/>',
  key: '<circle cx="8" cy="15.5" r="4.25"/><path d="M11.1 12.6 19.5 4.25M16.25 7.5l2.5 2.5M14 9.75l1.75 1.75"/>',
  lock: '<rect x="4.75" y="10.25" width="14.5" height="10" rx="3"/><path d="M8 10.25V7.5a4 4 0 0 1 8 0v2.75"/>',
  shield: '<path d="M12 3.25 19.25 6v5.5c0 4.4-3 7.9-7.25 9.25C7.75 19.4 4.75 15.9 4.75 11.5V6z"/><path d="M9 12l2.25 2.25L15.25 10"/>',
  copy: '<rect x="8.75" y="8.75" width="11.5" height="11.5" rx="2.5"/><path d="M15.25 8.75v-2.5a2.5 2.5 0 0 0-2.5-2.5h-6.5a2.5 2.5 0 0 0-2.5 2.5v6.5a2.5 2.5 0 0 0 2.5 2.5h2.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.84"/><path d="M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.33-1.33"/>',
  box: '<path d="M12 3.25 20.25 7.5v9L12 20.75 3.75 16.5v-9z"/><path d="M3.75 7.5 12 11.75l8.25-4.25M12 11.75v9"/>',
  code: '<path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.5 5l-3 14"/>',
  bell: '<path d="M6.25 16.75V11a5.75 5.75 0 0 1 11.5 0v5.75l1.5 1.75H4.75z"/><path d="M10 20.5a2.1 2.1 0 0 0 4 0"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.75"/><path d="M4.5 5.25v3.5h3.5"/><path d="M12 8v4l2.75 1.75"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  /* icons:end */
  /* The icon set's shapes the app does not draw, kept by hand. One the app comes to draw moves up, into the script's table. */
  minus: '<path d="M5.25 12h13.5"/>',
  store: '<path d="M4 9.5 5.25 4.75h13.5L20 9.5"/><path d="M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0"/><path d="M5.25 12v8.25h13.5V12"/><path d="M10 20.25v-4.5h4v4.5"/>',
  undo: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
  upload: '<path d="M12 15.5V4.25M7.5 8.5 12 4l4.5 4.5"/><path d="M4.75 14.75v2.5a3 3 0 0 0 3 3h8.5a3 3 0 0 0 3-3v-2.5"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  person: '<circle cx="12" cy="8.25" r="3.75"/><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0"/>',
  hourglass: '<path d="M6.75 3.75h10.5M6.75 20.25h10.5"/><path d="M8 3.75v2.5a4 4 0 0 0 2 3.46L12 11l2-1.29a4 4 0 0 0 2-3.46v-2.5"/><path d="M8 20.25v-2.5a4 4 0 0 1 2-3.46L12 13l2 1.29a4 4 0 0 1 2 3.46v2.5"/>',
  flag: '<path d="M5.25 21V4.5"/><path d="M5.25 4.75h11.5l-2.5 4 2.5 4H5.25"/>',
  'trend-up': '<path d="M3.5 16.5l5.5-5.5 4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  'trend-down': '<path d="M3.5 7.5l5.5 5.5 4-4 7.5 7.5"/><path d="M15 16.5h5.5V11"/>',
  bars: '<path d="M4.5 20.25h15"/><rect x="5.75" y="11" width="3" height="6.75" rx="1"/><rect x="10.5" y="6.5" width="3" height="11.25" rx="1"/><rect x="15.25" y="13.5" width="3" height="4.25" rx="1"/>',
  pie: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.9A8.6 8.6 0 0 1 20.1 9H15z"/>',
  gauge: '<path d="M4.2 16.5a8.5 8.5 0 1 1 15.6 0"/><path d="M12 13.5l3.5-4"/><path d="M12 13.5h.01"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
  bank: '<path d="M3.75 9.25 12 4.25l8.25 5"/><path d="M5.5 9.5v7.5M9.75 9.5v7.5M14.25 9.5v7.5M18.5 9.5v7.5"/><path d="M3.75 19.75h16.5"/>',
  card: '<rect x="2.75" y="5.25" width="18.5" height="13.5" rx="3"/><path d="M2.75 9.75h18.5M6.75 15h3.5"/>',
  cash: '<rect x="2.75" y="6.25" width="18.5" height="11.5" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.25 12h.01M17.75 12h.01"/>',
  coins: '<circle cx="9" cy="9" r="5.25"/><path d="M14.4 9.9a5.25 5.25 0 1 1-4.5 4.5"/>',
  repeat: '<path d="M17.5 4.75 20 7.25l-2.5 2.5"/><path d="M4 11.25v-1a3 3 0 0 1 3-3h13"/><path d="M6.5 19.25 4 16.75l2.5-2.5"/><path d="M20 12.75v1a3 3 0 0 1-3 3H4"/>',
  game: '<rect x="2.75" y="7" width="18.5" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M15.5 11.5h.01M17.5 13.5h.01"/>',
  branch: '<circle cx="6.5" cy="5.75" r="2.25"/><circle cx="6.5" cy="18.25" r="2.25"/><circle cx="17.5" cy="10" r="2.25"/><path d="M6.5 8v8"/><path d="M15.25 10H11a4.5 4.5 0 0 0-4.5 4.5"/>',
  book: '<path d="M4 5.25a1.5 1.5 0 0 1 1.5-1.5H11a1 1 0 0 1 1 1v15.5a2 2 0 0 0-2-2H4z"/><path d="M20 5.25a1.5 1.5 0 0 0-1.5-1.5H13a1 1 0 0 0-1 1v15.5a2 2 0 0 1 2-2h6z"/>',
  message: '<path d="M4.25 6.75a3 3 0 0 1 3-3h9.5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H10l-4.25 3.5v-3.5h-.5a1 1 0 0 1-1-1z"/>',
  phone: '<rect x="6.25" y="2.75" width="11.5" height="18.5" rx="3"/><path d="M10.75 18h2.5"/>',
  server: '<ellipse cx="12" cy="6" rx="7.25" ry="2.75"/><path d="M4.75 6v12c0 1.5 3.25 2.75 7.25 2.75s7.25-1.25 7.25-2.75V6"/><path d="M4.75 12c0 1.5 3.25 2.75 7.25 2.75s7.25-1.25 7.25-2.75"/>',
  cpu: '<rect x="6.25" y="6.25" width="11.5" height="11.5" rx="2"/><path d="M9.5 3.5v2.75M14.5 3.5v2.75M9.5 17.75v2.75M14.5 17.75v2.75M3.5 9.5h2.75M3.5 14.5h2.75M17.75 9.5h2.75M17.75 14.5h2.75"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx=".75"/>',
} as const;

/* The menu button's three lines, as SITE-SHELLS.md draws the phone header's. */
const MENU = '<path d="M4 7h16M4 12h16M4 17h16"/>';

/* Lucide, lucide-static 1.47.0 via `packages/render/src/glyphs`, ISC; see `NOTICE`. Ideas the set has no shape for. */
const LUCIDE = {
  'graduation-cap':
    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  rocket:
    '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5ZM2 12l10 5 10-5M2 17l10 5 10-5"/>',
} as const;

export const GLYPHS = {
  ...SET,
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.46 5.46l1.06 1.06M17.48 17.48l1.06 1.06M5.46 18.54l1.06-1.06M17.48 6.52l1.06-1.06"/>',
  menu: MENU,
  ...LUCIDE,
  /* The names the site used before the set, each drawn as the set draws its idea. */
  arrow: SET['arrow-right'],
  back: SET['arrow-left'],
  close: SET.x,
  rows: MENU,
  board: SET.projects,
  obligation: SET.receipt,
  task: SET.work,
  house: SET.home,
  wallet: SET.money,
  users: SET.people,
  terminal: SET.agent,
} as const;

export type IconName = keyof typeof GLYPHS;

/** The glyphs drawn as dots, which the set strokes at 2.75 so a round cap reads as a dot. */
export const DOTTED: ReadonlySet<IconName> = new Set<IconName>(['more', 'grip']);

/**
 * Whether a string names a glyph here. An example's `glyph` is typed `string` because that is the
 * contract in `lib/examples/types.ts`, so the drawn app narrows through this rather than casting, and
 * a name with no glyph draws the entry with its words alone.
 */
export const isIconName = (name: string): name is IconName => Object.hasOwn(GLYPHS, name);
