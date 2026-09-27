/**
 * The glyph set, as data.
 *
 * IT IS A `.ts` AND NOT THE COMPONENT'S MODULE BLOCK, and the reason is testability: `PATHS` and
 * `IconName` are read by `record/api.ts` — a declaration names an icon the same way it names a
 * title — and an import chain that reaches a `.svelte` file cannot be loaded by `node --test`. So
 * every unit test of the record layer died on `ERR_UNKNOWN_FILE_EXTENSION` before running a line.
 * Path data is not a component concern anyway; `Icon.svelte` is the thing that draws it.
 *
 * About forty glyphs, one 24-box, one 1.6 stroke, `currentColor` only. There is no `color` prop
 * anywhere near them, because that would be a colour-writing component and CI must reject it
 * (22 §9). Deliberately quiet: the identity here is carried by the type, the one red and the id
 * chips, and an icon set that also wants attention is one accessory too many.
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
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
  decide: 'M12 21v-8m0 0L6 7V3m6 10 6-6V3',
  inbox: 'M5 4h14l2 8v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7zM3 12h5l1.5 2.5h5L16 12h5',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2 5 5',
  packs: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  vault: 'M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6zM12 13v3',
  settings: 'M4 7h9m4 0h3M4 12h11m4 0h2M4 17h5m4 0h8',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 5 7 7-7 7',
  chevronDown: 'm5 9 7 7 7-7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5L19 6',
  filter: 'M3 5h18l-7 8.2V20l-4-2.2v-4.6z',
  copy: 'M9 9h10v10H9zM15 9V5H5v10h4',
  /** A chain, for a URL. `copy` is two sheets of paper and is the id — the two are different verbs. */
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L12.5 17',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-14v5l3 2',
  alert: 'M12 4 2.5 20h19zM12 10v4',
  sun: 'M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM9 20h6M12 16v4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5l11 7-11 7z',

  /* Nav glyphs. A DECLARATION NAMES ONE OF THESE — a register and a page carry an icon the same
     way they carry a title, because a rail where half the rows have a glyph and half do not reads
     as a rendering bug rather than as a hierarchy (19 §3). Same 24-box, same 1.6 stroke, same
     deliberate quietness: these have to sit under the type, not compete with it. */
  money: 'M3 6h18v12H3zM6.5 9.5v.01M17.5 14.5v.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  board: 'M4 4h4.5v16H4zM9.75 4h4.5v10h-4.5zM15.5 4H20v13h-4.5z',
  rows: 'M4 6h16M4 12h16M4 18h16',
  obligation: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9.5 8h5M9.5 12h5',
  service: 'M6 3v6m12-6v6M4 9h16v3a8 8 0 0 1-8 8 8 8 0 0 1-8-8z',
  thing: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM12 12l9-4.5M12 12v9M12 12 3 7.5',
  people: 'M9.5 11.5a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5zM2.5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6M16 4.6a3.6 3.6 0 0 1 0 6.9m1.4 3.3c2.4.6 4.1 2.4 4.1 5.7',
  task: 'M4.5 5h15v14h-15zM8.5 12l2.5 2.5 4.5-4.5',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4',
  tag: 'M3 11V4h7l11 11-7 7zM7.2 7.2h.01',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0',
  session: 'M3 5h18v13H3zM7.5 9.5l2.5 2.5-2.5 2.5M12.5 14.5h4',
  /* Arranging. `drag` is the six-dot grip every list in every product uses; borrowing the
     convention is the point — a novel handle is a handle nobody grabs. */
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  arrowUp: 'M12 19V5m-6 6 6-6 6 6',
  arrowDown: 'M12 5v14m6-6-6 6-6-6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',

  /* Verbs. Every one of these was being drawn by a glyph that already meant something else, by a
     literal character typed into the markup, or by nothing at all. A set where `close` has to mean
     both "dismiss this" and "remove this block" is a set that has run out. */
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM15 6l3 3',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M10 11v5M14 11v5',
  archive: 'M3 6h18v4H3zM5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9M10 14h4',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
  download: 'M12 4v11m-4-4 4 4 4-4M4 19h16',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  star: 'm12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z',

  /* The other two intents. `good` had `check` and `warn` had `alert`; `bad` and `info` had nothing,
     which is why the toast stack fell back to a bare coloured dot and broke the rule that colour
     never carries meaning on its own (13 §2.3). */
  ban: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM5.6 5.6l12.8 12.8',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 11v5M12 7.5v.01',
  /* A question waiting for an answer, which is not the Decide screen's fork: that is a place, this is
     a row asking something of the reader. */
  ask: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8M12 17v.01',

  /* Nouns that were being said with a borrowed word. `settings` was carrying Settings, More and
     Keymap at once; `clock` was carrying both "a time" and "the log"; `copy` was carrying both "to
     the clipboard" and "show me the source". */
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  keyboard: 'M2 6h20v12H2zM6 9.5v.01M9.5 9.5v.01M13 9.5v.01M16.5 9.5v.01M7 14h10',
  code: 'm9 8-5 4 5 4M15 8l5 4-5 4',
  /* A pulse: the shape of something that keeps happening. It is what the observe loop looks at, and
     it is deliberately not `alert` — a pattern the record noticed is a note, not a fault. */
  observe: 'M3 15h3.2l2.3-7.5L11.8 19l2.4-6.4 1.4 2.4H21',
  history: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5M12 8v4l3 2',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  key: 'M14.5 9.5a4 4 0 1 1-1.6 3.2L7 19H4v-3l6.3-6.3a4 4 0 0 1 4.2-.2zM16.5 7.5v.01',

  /* The agents pack's registers. A learning is a bulb, a thing found out; a skill is a bolt, a thing
     done on cue; a tool is a plug, because it is connected rather than written; and `globe` is where
     a row applies when it applies to every project. */
  learning: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.3v.4h5v-.4c0-.9.4-1.7 1.1-2.3A6 6 0 0 0 12 3z',
  skill: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  plug: 'M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0zM12 16v5',
  globe: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9',
} as const satisfies Record<AppGlyph, string>;

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

/**
 * The path for `name`, in the order the app has always drawn: its own map first, so `home`, `search`
 * and `inbox` keep the shape the rail has had, then the core, then the set if it has arrived.
 * Undefined means "not yet", and only ever for a name only the set holds: `isGlyph` has refused everything else.
 */
export const pathOf = (name: IconName, set: Readonly<Record<string, string>> | undefined): string | undefined =>
  Object.hasOwn(PATHS, name)
    ? PATHS[name as keyof typeof PATHS]
    : Object.hasOwn(CORE, name)
      ? CORE[name as CoreGlyph]
      : set && Object.hasOwn(set, name)
        ? set[name]
        : undefined;
