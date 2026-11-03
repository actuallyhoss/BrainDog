/**
 * The glyph set, as data.
 *
 * IT IS A `.ts` AND NOT THE COMPONENT'S MODULE BLOCK, and the reason is testability: `PATHS` and
 * `IconName` are read by `record/api.ts` — a declaration names an icon the same way it names a
 * title — and an import chain that reaches a `.svelte` file cannot be loaded by `node --test`. So
 * every unit test of the record layer died on `ERR_UNKNOWN_FILE_EXTENSION` before running a line.
 * Path data is not a component concern anyway; `Icon.svelte` is the thing that draws it.
 *
 * THE SHAPES ARE THE DESIGN SYSTEM'S ICON SET, copied as its inner markup, exactly. A name here
 * that the icon set also draws takes its shape; a name it has no shape for is drawn
 * in the same hand (24 grid, 2px padding, round caps, rounded rects rx 2 to 4.5), so the set reads as
 * one family. `Icon.svelte` strokes them at 1.75 in `currentColor`; there is no `color` prop anywhere
 * near them, because that would be a colour-writing component and CI must reject it (22 §9).
 *
 * EACH ENTRY IS INNER SVG MARKUP, NOT ONE `d`, because a glyph is circles and rects as well as paths
 * (settings' three knobs, search's lens). The markup is never inserted as HTML: `shapesOf` reads it
 * into elements and attributes from a closed list, and `Icon` draws those. The renderer and a page's
 * glyph slot still ask for ONE `d` in a 24 box, and `pathOf` answers them by rewriting the shapes as
 * path commands, the way `braindog-render/glyphs` stores Lucide's.
 *
 * ONE ENTRY PER LINE, `name: '<markup>'`, and never a reference to another entry: `glyphs.test.ts`
 * in `braindog-render` reads the names off this file as text, and a name spelled any other way is one
 * it does not see. That is why `today` repeats `calendar`'s markup instead of pointing at it.
 *
 * A DECLARATION MAY NAME MORE THAN THESE. `braindog-render/glyphs` holds 251, Lucide's, and a page an
 * agent declares with `icon: rocket` draws one of them; see `IconName` at the foot of this file.
 */

/* `loadSet` is a dynamic import inside that package, and the type imports erase: `set.ts` is not in
   this module's static graph, which is what the `bundle` gate measures. */
import { CORE, loadSet, type CoreGlyph, type SetGlyph } from 'braindog-render/glyphs';
/* The names only, never a path: `isGlyph` answers from the same set the renderer reads `{{icon:<name>}}` against. */
import { GLYPH_NAMES, type AppGlyph } from 'braindog-render/glyphs/names';

export const PATHS = {
  /* The places, in the rail's order. `today` is `calendar` with today's day filled in: the sun it was read as
     the light theme's switch, which `sun` is. The day is a 2.5 square with a stroke through it, so it fills solid at
     1.5 and 1.75 without a `fill` the shapes list does not carry. `work` is a checked task. */
  today: '<rect x="3.75" y="5.25" width="16.5" height="15" rx="3.5"/><path d="M3.75 10h16.5M8 3.25v3.5M16 3.25v3.5"/><path d="M10.75 13.75h2.5v2.5h-2.5zM11.5 15h1"/>',
  work: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5"/><path d="M8.25 12.25l2.5 2.5 5-5.5"/>',
  projects: '<rect x="3.75" y="3.75" width="9.5" height="7" rx="2"/><rect x="15.25" y="3.75" width="5" height="7" rx="2"/><rect x="3.75" y="12.75" width="5" height="7.5" rx="2"/><rect x="10.75" y="12.75" width="9.5" height="7.5" rx="2"/>',
  money: '<path d="M18.5 7.25V5.9a1.4 1.4 0 0 0-1.75-1.36L6 7.25"/><rect x="3.75" y="7.25" width="16.5" height="12.5" rx="3"/><path d="M20.25 11.5h-3.5a2 2 0 0 0 0 4h3.5"/>',
  activity: '<path d="M3 12.5h3.75l2.5-6 4.5 11 2.5-5h4.75"/>',
  /* Needs you is the tray, as `inbox` draws it: the forking arrows it drew read as a letter at 16px (frame F15). */
  decide: '<path d="M3.75 13.25 6.4 5.9a2 2 0 0 1 1.88-1.15h7.44a2 2 0 0 1 1.88 1.15l2.65 7.35"/><path d="M3.75 13.25v4.5a2.5 2.5 0 0 0 2.5 2.5h11.5a2.5 2.5 0 0 0 2.5-2.5v-4.5h-5l-1.5 2.5h-3.5l-1.5-2.5z"/>',
  settings: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  search: '<circle cx="10.75" cy="10.75" r="6.5"/><path d="M20 20l-4.6-4.6"/>',
  /* Ask, the Slash field. `star` draws the same, because every caller that named `star` meant Slash, and
     the icon set allows no star in the product. */
  slash: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5"/><path d="M14.25 7.75l-4.5 8.5"/>',
  star: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5"/><path d="M14.25 7.75l-4.5 8.5"/>',
  inbox: '<path d="M3.75 13.25 6.4 5.9a2 2 0 0 1 1.88-1.15h7.44a2 2 0 0 1 1.88 1.15l2.65 7.35"/><path d="M3.75 13.25v4.5a2.5 2.5 0 0 0 2.5 2.5h11.5a2.5 2.5 0 0 0 2.5-2.5v-4.5h-5l-1.5 2.5h-3.5l-1.5-2.5z"/>',
  /* The Inbox page, mail that came in: an envelope, so the tray stays Needs you's alone. */
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  /* A house: a property, and the palette's way home. Today is `today`. */
  home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v10.25h12V9"/><path d="M10 19.25v-5h4v5"/>',

  /* Verbs and the controls that carry them. */
  plus: '<path d="M12 5.25v13.5M5.25 12h13.5"/>',
  check: '<path d="M5 12.5l4.25 4.25L19 7"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chevron: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  chevronDown: '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  arrow: '<path d="M4.75 12h14.5M13.5 6.25 19.25 12l-5.75 5.75"/>',
  back: '<path d="M19.25 12H4.75M10.5 6.25 4.75 12l5.75 5.75"/>',
  external: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
  arrowUp: '<path d="M12 19.25V4.75M6.25 10.5 12 4.75l5.75 5.75"/>',
  arrowDown: '<path d="M12 4.75v14.5M6.25 13.5 12 19.25l5.75-5.75"/>',
  more: '<path stroke-width="2.75" d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>',
  /* The six-dot grip every list in every product uses; borrowing the convention is the point. */
  drag: '<path stroke-width="2.75" d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  filter: '<path d="M3.75 5.25h16.5l-6.25 7.5v6.5l-4 1.5v-8z"/>',
  keyboard: '<rect x="2.75" y="6" width="18.5" height="12" rx="2.5"/><path d="M6.5 9.75h.01M10 9.75h.01M13.5 9.75h.01M17 9.75h.01M8 14h8"/>',
  trash: '<path d="M4.75 6.75h14.5M9.75 6.75V4.75h4.5v2M6.75 6.75l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h5.9a1.5 1.5 0 0 0 1.5-1.4l.8-12.1"/>',
  download: '<path d="M12 4.25V15.5M7.5 11 12 15.5 16.5 11"/><path d="M4.75 14.75v2.5a3 3 0 0 0 3 3h8.5a3 3 0 0 0 3-3v-2.5"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 0 1-12.9 5.2M4.5 12a7.5 7.5 0 0 1 12.9-5.2"/><path d="M17.75 3.5v3.5h-3.5M6.25 20.5V17h3.5"/>',
  eye: '<path d="M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M7.25 5.5v13l11-6.5z"/>',
  /* Drawn in the icon set's hand, which has no shape for these. */
  stop: '<rect x="6.25" y="6.25" width="11.5" height="11.5" rx="2.5"/>',
  copy: '<rect x="8.75" y="8.75" width="11.5" height="11.5" rx="2.5"/><path d="M15.25 8.75v-2.5a2.5 2.5 0 0 0-2.5-2.5h-6.5a2.5 2.5 0 0 0-2.5 2.5v6.5a2.5 2.5 0 0 0 2.5 2.5h2.5"/>',
  edit: '<path d="M4.75 19.25h3.5L18.5 9a2.47 2.47 0 0 0-3.5-3.5L4.75 15.75z"/><path d="M13.5 7l3.5 3.5"/>',
  archive: '<rect x="3.25" y="4.25" width="17.5" height="4.5" rx="2"/><path d="M5 8.75v8.5a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5v-8.5"/><path d="M10 12.75h4"/>',

  /* The theme. `sun` is the light theme's alone; Today is a calendar so the two are never confused. */
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.46 5.46l1.06 1.06M17.48 17.48l1.06 1.06M5.46 18.54l1.06-1.06M17.48 6.52l1.06-1.06"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  monitor: '<rect x="2.75" y="4.25" width="18.5" height="12.5" rx="2.5"/><path d="M8.5 20.25h7M12 16.75v3.5"/>',

  /* Intents and states. `alert` is late; `ban`, `info` and `ask` complete the toast's four, so colour
     never carries meaning on its own (13 §2.3). `ask` is a row asking something of the reader, not
     the Needs you screen's fork. */
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.75v5"/><path d="M12 16.25h.01"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.25"/><path d="M12 7.75h.01"/>',
  ask: '<circle cx="12" cy="12" r="8.5"/><path d="M9.75 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.35 2.1-2.35 3.6"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  /* The log: a clock turned back. Drawn in the icon set's hand, from `clock` and `refresh`. */
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.75"/><path d="M4.5 5.25v3.5h3.5"/><path d="M12 8v4l2.75 1.75"/>',
  /* A pulse, what the observe loop looks at: the icon set's `activity`, and deliberately not `alert`. */
  observe: '<path d="M3 12.5h3.75l2.5-6 4.5 11 2.5-5h4.75"/>',

  /* Things in the record. */
  calendar: '<rect x="3.75" y="5.25" width="16.5" height="15" rx="3.5"/><path d="M3.75 10h16.5M8 3.25v3.5M16 3.25v3.5"/>',
  task: '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5"/><path d="M8.25 12.25l2.5 2.5 5-5.5"/>',
  people: '<circle cx="9" cy="8.75" r="3.25"/><path d="M3.25 19.5a5.75 5.75 0 0 1 11.5 0"/><path d="M15.5 5.75a3.25 3.25 0 0 1 0 6"/><path d="M17.25 14.25a5.75 5.75 0 0 1 3.5 5.25"/>',
  obligation: '<path d="M6 3.75h12v16.5l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  /* A subscription someone pays for and is served by: the icon set's hosted service. */
  service: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.9 9.9 4.3 4.3 0 0 0 7 18.5z"/>',
  thing: '<path d="M12 3.25 20.25 7.5v9L12 20.75 3.75 16.5v-9z"/><path d="M3.75 7.5 12 11.75l8.25-4.25M12 11.75v9"/>',
  /* An add-on: the icon set draws it as a box. */
  packs: '<path d="M12 3.25 20.25 7.5v9L12 20.75 3.75 16.5v-9z"/><path d="M3.75 7.5 12 11.75l8.25-4.25M12 11.75v9"/>',
  doc: '<path d="M6.25 3.75h7.5l4.5 4.5v12H6.25z"/><path d="M13.75 3.75v4.5h4.5"/><path d="M9 13h6M9 16.5h4"/>',
  tag: '<path d="M3.75 12.5V5.25a1.5 1.5 0 0 1 1.5-1.5h7.25l8.25 8.25-8.75 8.75z"/><path d="M8 8h.01"/>',
  bell: '<path d="M6.25 16.75V11a5.75 5.75 0 0 1 11.5 0v5.75l1.5 1.75H4.75z"/><path d="M10 20.5a2.1 2.1 0 0 0 4 0"/>',
  /* An agent's session: the icon set's `agent`, a terminal with a prompt. */
  session: '<rect x="3.25" y="4.75" width="17.5" height="14.5" rx="3.5"/><path d="M7.5 10l2.75 2.25L7.5 14.5M12.75 14.5h3.75"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.84"/><path d="M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.33-1.33"/>',
  code: '<path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.5 5l-3 14"/>',
  /* The Keychain: the icon set's `shield`, security. */
  vault: '<path d="M12 3.25 19.25 6v5.5c0 4.4-3 7.9-7.25 9.25C7.75 19.4 4.75 15.9 4.75 11.5V6z"/><path d="M9 12l2.25 2.25L15.25 10"/>',
  lock: '<rect x="4.75" y="10.25" width="14.5" height="10" rx="3"/><path d="M8 10.25V7.5a4 4 0 0 1 8 0v2.75"/>',
  key: '<circle cx="8" cy="15.5" r="4.25"/><path d="M11.1 12.6 19.5 4.25M16.25 7.5l2.5 2.5M14 9.75l1.75 1.75"/>',
  /* Views of a list, drawn in the icon set's hand: columns, lines and tiles. */
  board: '<rect x="3.75" y="3.75" width="4.5" height="16.5" rx="2"/><rect x="9.75" y="3.75" width="4.5" height="10.5" rx="2"/><rect x="15.75" y="3.75" width="4.5" height="13" rx="2"/>',
  rows: '<path d="M4.75 6.5h14.5M4.75 12h14.5M4.75 17.5h14.5"/>',
  grid: '<rect x="3.75" y="3.75" width="7" height="7" rx="2"/><rect x="13.25" y="3.75" width="7" height="7" rx="2"/><rect x="3.75" y="13.25" width="7" height="7" rx="2"/><rect x="13.25" y="13.25" width="7" height="7" rx="2"/>',

  /* The agents pack's registers. A learning is a bulb, a thing found out (the icon set has none, so it is
     drawn in its hand); a skill is the icon set's `zap`, a thing done on cue; a tool is a plug, because it
     is connected rather than written; and `globe` is where a row applies when it applies everywhere. */
  learning: '<path d="M9.75 17.75h4.5M10.5 20.75h3"/><path d="M12 3.25a5.75 5.75 0 0 0-3.45 10.35c.6.45.95 1.15.95 1.9v.75h5v-.75c0-.75.35-1.45.95-1.9A5.75 5.75 0 0 0 12 3.25z"/>',
  skill: '<path d="M13 3.25 5.25 13.5H12l-1 7.25 7.75-10.25H12z"/>',
  plug: '<path d="M9 3.75v4M15 3.75v4"/><path d="M6.5 7.75h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.75v3.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z"/>',
} as const satisfies Record<AppGlyph, string>;

/**
 * SET NAMES THE APP DRAWS IN ITS OWN HAND, so they are on screen at first paint rather than once the set arrives.
 *
 * A name a screen of the app leads with, in a well, and that only the set held: Settings' Identity and People & sharing
 * drew empty wells until the set came, and a well inside a page's text is drawn once and never again. Drawn on
 * `people`'s head and shoulders, with the tick and the plus at its right. Quoted keys, after `PATHS`, so the renderer's
 * `glyphs.test.ts`, which reads the app's own names off `PATHS`, does not take them for shell glyphs that need the core.
 */
export const HAND = {
  'user-check': '<circle cx="9" cy="8.75" r="3.25"/><path d="M3.25 19.5a5.75 5.75 0 0 1 11.5 0"/><path d="M15.75 11.5l2 2 3.5-4"/>',
  'user-plus': '<circle cx="9" cy="8.75" r="3.25"/><path d="M3.25 19.5a5.75 5.75 0 0 1 11.5 0"/><path d="M18.5 8.5v6M15.5 11.5h6"/>',
  /* SETTINGS' HEALTH ROW: its well stayed empty at both widths. Lucide's own heart, its two strokes. */
  'heart-pulse': '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
} as const satisfies Partial<Record<SetGlyph, string>>;

/**
 * A name a declaration may give: the app's own, then `braindog-render/glyphs`' core, then the rest of
 * its set. Before this was widened a page declared with `icon: rocket` drew a document, because the
 * set shipped as data and nothing in the app could name it.
 *
 * `SetGlyph` IS A TYPE AND COSTS NOTHING AT RUN TIME. The paths it names are 188 strings that arrive
 * through `glyphSet()` below; only the names are carried up front, in `GLYPH_NAMES` (`braindog-render/glyphs/names`).
 */
export type IconName = keyof typeof PATHS | CoreGlyph | SetGlyph;

/**
 * Whether `name` is a glyph this build can draw, now or once the set arrives.
 *
 * ONE LIST, `GLYPH_NAMES`, answers this and the renderer's `{{icon:<name>}}` alike, so a name is nameable in
 * text exactly when an `icon:` key can draw it. It carries the names WITHOUT THEIR PATHS, so this answers
 * synchronously while a rail is built and the shell does not carry the set. A `Set`, NOT AN OBJECT: a declaration
 * is text a stranger wrote, and `constructor` in an `icon:` would otherwise be found on a prototype and handed to
 * the drawer as a name.
 */
export const isGlyph = (name: string): name is IconName => GLYPH_NAMES.has(name);

/** The set once it has arrived, so an `Icon` mounted afterwards draws at once rather than waiting. */
let arrived: Readonly<Record<string, string>> | undefined;
let arriving: Promise<Readonly<Record<string, string>>> | undefined;

/**
 * The rest of the set, fetched once for the whole app however many icons ask for it.
 *
 * ONE PROMISE, KEPT. A list page draws one `Icon` per row, and without the memo each of them would
 * start its own `import()`. The bundler dedupes the request, but every caller would still wait on a
 * fresh promise and paint a frame later than the one before.
 */
export const glyphSet = (): Promise<Readonly<Record<string, string>>> =>
  (arriving ??= loadSet().then((set) => (arrived = set)));

/** The set if it is already here, for a component to start from. */
export const glyphSetNow = (): Readonly<Record<string, string>> | undefined => arrived;

/* ── shapes ───────────────────────────────────────────────────────────────── */

/** The four elements a glyph is drawn with. Nothing else is read out of the markup. */
export type Shape =
  | { tag: 'path'; attrs: { d: string; 'stroke-width'?: string } }
  | { tag: 'circle'; attrs: { cx: string; cy: string; r: string } }
  | { tag: 'ellipse'; attrs: { cx: string; cy: string; rx: string; ry: string } }
  | { tag: 'rect'; attrs: { x: string; y: string; width: string; height: string; rx?: string } };

/** The attributes each element may carry: a closed list, so no markup string can hand `Icon` an `onload`. */
const ALLOWED: Record<Shape['tag'], readonly string[]> = {
  path: ['d', 'stroke-width'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx'],
};

const ELEMENT = /\s*<(path|circle|ellipse|rect)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/>/y;
const ATTR = /([a-z-]+)="([^"<>]*)"/g;

/**
 * A glyph's markup read into shapes, or a thrown error naming where it stops being one. STRICT ON
 * PURPOSE: a typo in `PATHS` should fail `icons-set.test.ts`, not draw half a glyph.
 */
export function parseShapes(markup: string): Shape[] {
  const out: Shape[] = [];
  ELEMENT.lastIndex = 0;
  while (ELEMENT.lastIndex < markup.length) {
    const at = ELEMENT.lastIndex;
    const m = ELEMENT.exec(markup);
    if (!m) {
      if (markup.slice(at).trim() === '') break;
      throw new Error(`not a glyph shape at ${at}: ${markup.slice(at, at + 24)}`);
    }
    const tag = m[1] as Shape['tag'];
    const attrs: Record<string, string> = {};
    for (const [, key, value] of m[2]!.matchAll(ATTR)) {
      if (!ALLOWED[tag].includes(key!)) throw new Error(`<${tag}> may not carry ${key}`);
      attrs[key!] = value!;
    }
    out.push({ tag, attrs } as Shape);
  }
  return out;
}

/** The markup the app draws `name` with, its shell glyphs first and then the set names it draws by hand. */
const handOf = (name: string): string | undefined =>
  Object.hasOwn(PATHS, name) ? PATHS[name as keyof typeof PATHS] : Object.hasOwn(HAND, name) ? HAND[name as keyof typeof HAND] : undefined;

/** The app's own glyphs, read once each, on first draw. */
const read = new Map<string, readonly Shape[]>();

/** A Lucide glyph from the core or the set, `undefined` until the set has arrived when only the set holds it. */
const lucide = (name: string, set: Readonly<Record<string, string>> | undefined): string | undefined =>
  Object.hasOwn(CORE, name)
    ? CORE[name as CoreGlyph]
    : set && Object.hasOwn(set, name)
      ? set[name]
      : undefined;

/**
 * The shapes for `name`, in the order the app has always drawn: its own map first, so `home`, `search`
 * and `inbox` keep the shape the rail draws, then the core, then the set if it has arrived. A Lucide
 * glyph is one path. Undefined means "not yet", and only ever for a name only the set holds: `isGlyph`
 * has refused everything else.
 */
export const shapesOf = (name: IconName, set: Readonly<Record<string, string>> | undefined): readonly Shape[] | undefined => {
  const own = handOf(name);
  if (own !== undefined) {
    let shapes = read.get(name);
    if (!shapes) read.set(name, (shapes = parseShapes(own)));
    return shapes;
  }
  const d = lucide(name, set);
  return d === undefined ? undefined : [{ tag: 'path', attrs: { d } }];
};

const num = (v: number): string => String(Math.round(v * 1000) / 1000);

/** One shape as path commands, opening with an absolute move so it can follow another. */
function commands(s: Shape): string {
  if (s.tag === 'path') return s.attrs.d.replace(/^\s*m/, 'M');
  if (s.tag === 'rect') {
    const [x, y, w, h] = [s.attrs.x, s.attrs.y, s.attrs.width, s.attrs.height].map(Number) as [number, number, number, number];
    const r = Math.min(Number(s.attrs.rx ?? 0), w / 2, h / 2);
    if (r === 0) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
    const arc = (dx: number, dy: number) => `a${num(r)} ${num(r)} 0 0 1 ${num(dx)} ${num(dy)}`;
    return (
      `M${num(x + r)} ${num(y)}h${num(w - 2 * r)}${arc(r, r)}v${num(h - 2 * r)}${arc(-r, r)}` +
      `h${num(2 * r - w)}${arc(-r, -r)}v${num(2 * r - h)}${arc(r, -r)}z`
    );
  }
  const cx = Number(s.attrs.cx);
  const cy = Number(s.attrs.cy);
  const [rx, ry] = s.tag === 'circle' ? [Number(s.attrs.r), Number(s.attrs.r)] : [Number(s.attrs.rx), Number(s.attrs.ry)];
  const half = (dx: number) => `a${num(rx)} ${num(ry)} 0 1 0 ${num(dx)} 0`;
  return `M${num(cx - rx)} ${num(cy)}${half(2 * rx)}${half(-2 * rx)}`;
}

/**
 * The glyph for `name` as ONE path `d` in the 24 box, for the renderer's glyph slots, which draw a single
 * `<path>`. Same order and same "undefined means not yet" as `shapesOf`. A dot's heavier stroke
 * (`more`, `drag`) does not survive into one `d`; the dots are still drawn, at the drawer's stroke.
 */
export const pathOf = (name: IconName, set: Readonly<Record<string, string>> | undefined): string | undefined =>
  handOf(name) !== undefined ? shapesOf(name, set)!.map(commands).join('') : lucide(name, set);
