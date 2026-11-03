/**
 * `braindog-render/glyphs/names`: every glyph name a document may use, WITHOUT ONE PATH.
 *
 * A NAME HAS TO BE ANSWERED BEFORE ITS DRAWING ARRIVES. The app decides whether an `icon:` names a
 * glyph while it builds the rail, and the renderer decides whether `{{icon:rocket}}` is a glyph or
 * the author's text while it reads a sentence; neither can wait on the chunk `loadSet` fetches. So
 * the names travel on their own, here, and the paths stay behind the dynamic import in `index.ts`.
 * Importing `set.ts` for its keys would carry its paths into every chunk that asks a name, which is the
 * `bundle` gate's red, and `core.ts` would carry the core's paths to every host that only reads names:
 * this file imports their TYPES only, and a type import erases. `aliases.ts` is the one value it imports,
 * and it carries names and no paths, so `isMark` can answer an alias without the drawings.
 *
 * ONE LIST FOR BOTH SIDES. `apps/web/src/lib/ui/icons.ts` answers `isGlyph` from this set and the
 * renderer answers an inline icon from it, so a name is nameable in text exactly when an `icon:` key
 * can draw it. Before this file the app kept the set's names in a list of its own (`LATER`) and the
 * renderer had none, which is two copies of one closed list and nothing to hold them together.
 *
 * A `Set`, never an object: a document is text a stranger wrote, and `constructor` looked up on an
 * object literal answers from its prototype.
 */

import { canonical } from './aliases.ts';
import type { CoreGlyph } from './core.ts';
import type { SetGlyph } from './set.ts';

/**
 * The app's own drawings, `PATHS` in `apps/web/src/lib/ui/icons.ts`, by the names the shell gave them
 * before the set existed (`home`, `decide`, `chevronDown`). A package cannot import an app, so the
 * check runs the other way: that file declares `PATHS` to satisfy `Record<AppGlyph, string>`, and a
 * drawing added there without its name here, or a name here with no drawing there, is a type error.
 */
const APP = [
  'home', 'decide', 'inbox', 'search', 'packs', 'vault', 'settings', 'plus', 'chevron', 'chevronDown', 'close',
  'check', 'filter', 'copy', 'link', 'clock', 'alert', 'sun', 'moon', 'monitor', 'arrow', 'back', 'external',
  'stop', 'play', 'money', 'calendar', 'board', 'rows', 'obligation', 'service', 'thing', 'people', 'task', 'doc',
  'tag', 'bell', 'session', 'drag', 'arrowUp', 'arrowDown', 'grid', 'edit', 'trash', 'archive', 'eye', 'download',
  'refresh', 'star', 'ban', 'info', 'ask', 'more', 'keyboard', 'code', 'observe', 'history', 'lock', 'key',
  'learning', 'skill', 'plug', 'globe', 'mail', 'pin',
  /* The rail's places by their own names, as the design system's glyph list gives them. */
  'today', 'work', 'projects', 'activity', 'slash',
] as const;

/** A name the app draws with a path of its own. */
export type AppGlyph = (typeof APP)[number];

/* THE `satisfies` IS WHAT KEEPS THESE TWO HONEST, in both directions: a glyph added to `core.ts` or
   `set.ts` and missing here is a type error, and so is a name here that the file does not hold,
   because an object literal may not carry a key its declared type has no room for. */
const CORE_NAMES = {
  house: 1, split: 1, inbox: 1, search: 1, blocks: 1, shield: 1, 'sliders-horizontal': 1, plus: 1,
  'chevron-right': 1, 'chevron-down': 1, x: 1, check: 1, funnel: 1, copy: 1, link: 1, clock: 1,
  'triangle-alert': 1, sun: 1, moon: 1, monitor: 1, 'arrow-right': 1, 'arrow-left': 1, 'external-link': 1,
  square: 1, play: 1, banknote: 1, calendar: 1, kanban: 1, 'rows-3': 1, receipt: 1, 'concierge-bell': 1, box: 1,
  users: 1, 'square-check': 1, 'file-text': 1, tag: 1, bell: 1, bot: 1, 'grip-vertical': 1, 'arrow-up': 1,
  'arrow-down': 1, 'layout-grid': 1, pencil: 1, 'trash-2': 1, archive: 1, eye: 1, download: 1, 'rotate-cw': 1,
  star: 1, ban: 1, info: 1, 'circle-question-mark': 1, ellipsis: 1, keyboard: 1, code: 1, activity: 1,
  history: 1, lock: 1, key: 1, lightbulb: 1, zap: 1, plug: 1, globe: 1, mail: 1,
} as const satisfies Record<CoreGlyph, 1>;

const SET_NAMES = {
  'list-todo': 1, flag: 1, milestone: 1, target: 1, 'calendar-days': 1, 'calendar-check': 1, hourglass: 1,
  timer: 1, repeat: 1, 'circle-check': 1, 'circle-dot': 1, pause: 1, rocket: 1, wrench: 1, package: 1, truck: 1,
  'list-checks': 1, 'list-ordered': 1, list: 1, 'square-kanban': 1, 'flag-triangle-right': 1, goal: 1,
  'clipboard-list': 1, 'clipboard-check': 1, 'receipt-text': 1, wallet: 1, landmark: 1, 'credit-card': 1,
  coins: 1, 'piggy-bank': 1, percent: 1, calculator: 1, scale: 1, 'trending-up': 1, 'trending-down': 1,
  'arrow-down-left': 1, 'arrow-up-right': 1, 'hand-coins': 1, 'badge-pound-sterling': 1, 'badge-dollar-sign': 1,
  'badge-euro': 1, 'pound-sterling': 1, 'dollar-sign': 1, euro: 1, 'chart-no-axes-column': 1,
  'calendar-clock': 1, 'calendar-plus': 1, 'calendar-x': 1, 'calendar-range': 1, 'alarm-clock': 1,
  'clock-alert': 1, 'clock-arrow-up': 1, user: 1, 'user-plus': 1, 'user-check': 1, 'user-x': 1, contact: 1,
  handshake: 1, briefcase: 1, building: 1, 'building-2': 1, store: 1, factory: 1, 'loader-circle': 1,
  'lock-open': 1, 'shield-check': 1, 'shield-alert': 1, 'octagon-alert': 1, 'circle-x': 1, 'circle-alert': 1,
  'circle-pause': 1, 'circle-play': 1, 'circle-stop': 1, 'circle-slash': 1, 'circle-dashed': 1,
  'circle-plus': 1, 'circle-minus': 1, circle: 1, file: 1, 'file-spreadsheet': 1, 'file-image': 1,
  'file-plus': 1, 'file-check': 1, 'file-x': 1, paperclip: 1, folder: 1, 'folder-open': 1, image: 1, files: 1,
  'mail-open': 1, 'message-square': 1, 'message-circle': 1, 'messages-square': 1, phone: 1, send: 1,
  'at-sign': 1, 'bell-off': 1, reply: 1, forward: 1, megaphone: 1, server: 1, database: 1, cloud: 1, cpu: 1,
  terminal: 1, 'git-branch': 1, 'git-pull-request': 1, 'git-merge': 1, 'git-commit-horizontal': 1,
  'hard-drive': 1, 'chart-line': 1, 'chart-column': 1, 'chart-pie': 1, gauge: 1, 'chart-area': 1,
  'chart-bar': 1, 'chart-no-axes-combined': 1, minus: 1, 'chevron-left': 1, 'chevron-up': 1,
  'chevrons-up-down': 1, 'arrow-up-down': 1, move: 1, laptop: 1, smartphone: 1, tags: 1, 'layout-list': 1,
  'eye-off': 1, upload: 1, 'rotate-ccw': 1, 'refresh-cw': 1, 'ellipsis-vertical': 1, 'map-pin': 1, map: 1,
  compass: 1, navigation: 1, bookmark: 1, heart: 1, 'thumbs-up': 1, 'thumbs-down': 1, pin: 1, 'link-2': 1,
  hash: 1, 'list-filter': 1, 'arrow-up-narrow-wide': 1, 'arrow-down-wide-narrow': 1, cog: 1, 'settings-2': 1,
  'log-in': 1, 'log-out': 1, menu: 1, 'panel-left': 1, share: 1, 'share-2': 1, printer: 1, save: 1, 'undo-2': 1,
  'redo-2': 1, 'maximize-2': 1, 'minimize-2': 1, expand: 1, shrink: 1, music: 1, video: 1, camera: 1, mic: 1,
  headphones: 1, book: 1, 'book-open': 1, 'notebook-pen': 1, 'graduation-cap': 1, 'heart-pulse': 1,
  stethoscope: 1, car: 1, plane: 1, 'train-front': 1, bike: 1, 'shopping-cart': 1, 'shopping-bag': 1, gift: 1,
  ticket: 1, utensils: 1, coffee: 1, dumbbell: 1, leaf: 1, sprout: 1, 'tree-pine': 1,
} as const satisfies Record<SetGlyph, 1>;

/**
 * Every name a glyph can be drawn by: the app's own, the core's and the rest of the set's.
 *
 * AN ALIAS IS NOT A MEMBER. `invoice` is the set's `receipt-text` spelled the plan's way, and
 * `canonical` in `aliases.ts` turns one into the other. A name a document wrote is asked through
 * `glyphName` in `../inline.ts`, which tries the name as written and then `canonical(name)`.
 */
export const GLYPH_NAMES: ReadonlySet<string> = new Set<string>([
  ...APP,
  ...Object.keys(CORE_NAMES),
  ...Object.keys(SET_NAMES),
]);

/**
 * THE NAMES THE FRAME USES AS CONTROLS, which a row may never wear as its mark: a project drawn as a
 * close cross or a pencil reads as a button nobody can press. Each control is listed by every name it
 * answers to, the shell's (`close`) beside Lucide's (`x`), so a reader that holds no alias table, the
 * kernel's copy in `packages/kernel/src/marks.ts`, refuses the same words this file does.
 *
 * TWO COPIES OF ONE CLOSED LIST, held equal word for word and in order by `tools/gates/closed-lists.mjs`.
 * A name added here is added there in the same commit.
 */
export const CONTROLS = [
  'close', 'x', 'circle-x', 'plus', 'circle-plus', 'minus', 'circle-minus', 'check',
  'chevron', 'chevron-right', 'chevronDown', 'chevron-down', 'chevron-left', 'chevron-up', 'chevrons-up-down',
  'arrow', 'arrow-right', 'back', 'arrow-left', 'arrowUp', 'arrow-up', 'arrowDown', 'arrow-down', 'arrow-up-down',
  'external', 'external-link', 'filter', 'funnel', 'list-filter', 'search', 'settings', 'sliders-horizontal',
  'settings-2', 'copy', 'edit', 'pencil', 'trash', 'trash-2', 'refresh', 'rotate-cw', 'rotate-ccw', 'refresh-cw',
  'more', 'ellipsis', 'ellipsis-vertical', 'drag', 'grip-vertical', 'move', 'menu', 'panel-left', 'eye', 'eye-off',
  'download', 'upload', 'maximize-2', 'minimize-2', 'expand', 'shrink', 'undo-2', 'redo-2', 'log-in', 'log-out',
  'stop', 'square', 'slash', 'play', 'pause', 'save', 'share', 'share-2', 'arrow-up-narrow-wide', 'arrow-down-wide-narrow',
] as const satisfies readonly (AppGlyph | CoreGlyph | SetGlyph)[];

/** The same list as a `Set`, for the reason `GLYPH_NAMES` is one. */
export const CONTROL_GLYPHS: ReadonlySet<string> = new Set<string>(CONTROLS);

/**
 * Whether `name` may be a row's mark: it names a glyph, as written or through an alias, and that glyph
 * is no control under any of its names. `cake` is a mark (an alias of `gift`); `close`, `x` and `pencil`
 * are not, and neither is a word the set does not draw.
 */
export function isMark(name: string): boolean {
  const n = name.trim();
  const known = GLYPH_NAMES.has(n) ? n : GLYPH_NAMES.has(canonical(n)) ? canonical(n) : null;
  return known !== null && !CONTROL_GLYPHS.has(known) && !CONTROL_GLYPHS.has(canonical(known));
}
