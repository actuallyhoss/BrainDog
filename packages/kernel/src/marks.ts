/**
 * The names the frame uses as controls, which a row may never wear as its mark.
 *
 * THE KERNEL'S COPY of `CONTROLS` in `packages/render/src/glyphs/names.ts`, because the kernel imports no renderer.
 * `tools/gates/closed-lists.mjs` holds the two equal word for word and in order, so a control added to one and not the
 * other is a red gate rather than a mark the app refuses to draw and the record lets through.
 *
 * Each control is listed by every name it answers to (`close` and `x`), so this side needs no alias table: a write
 * that names a control by any of its names is refused here, by `MARK_IS_CONTROL` on a field a list's
 * `identity.mark` names.
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
] as const;

/** The refusal's code and its sentence, for the write path that checks a list's `identity.mark` field. */
export const MARK_IS_CONTROL = 'MARK_IS_CONTROL';
export const MARK_IS_CONTROL_SAYS = 'Pick a picture that is not a button.';

/* LOWER-CASED ONCE, so `Close` and `X` are refused as `close` and `x` are; `chevronDown` is read as `chevrondown`. */
const CONTROL_SET: ReadonlySet<string> = new Set(CONTROLS.map((n) => n.toLowerCase()));

/** Whether a mark names one of the frame's controls, by any of its names, in any case, around any spaces. */
export function isControlMark(name: unknown): boolean {
  return typeof name === 'string' && CONTROL_SET.has(name.trim().toLowerCase());
}

/* ── the names a mark can be drawn by ──────────────────────── */

/**
 * Every name the set draws, and every word that stands for one: THE KERNEL'S COPY of `GLYPH_NAMES` in
 * `packages/render/src/glyphs/names.ts` with the keys of `ALIASES` in `glyphs/aliases.ts` beside them, held for the
 * reason `CONTROLS` is. `test/marks-unknown.test.ts` reads the renderer's two files and holds this list to them name for
 * name, so a glyph drawn there and missing here is a red test rather than a project counted as wearing no picture.
 *
 * AN ALIAS IS A MEMBER HERE, unlike there: this side holds no alias table, and `cake` is a picture a row may wear
 * because the drawer turns it into `gift`. Which glyph a word becomes is the drawer's business; that it becomes one is
 * all the record asks.
 */
export const MARK_GLYPHS = [
  'home', 'decide', 'inbox', 'search', 'packs', 'vault', 'settings', 'plus', 'chevron', 'chevronDown', 'close',
  'check', 'filter', 'copy', 'link', 'clock', 'alert', 'sun', 'moon', 'monitor', 'arrow', 'back', 'external', 'stop',
  'play', 'money', 'calendar', 'board', 'rows', 'obligation', 'service', 'thing', 'people', 'task', 'doc', 'tag',
  'bell', 'session', 'drag', 'arrowUp', 'arrowDown', 'grid', 'edit', 'trash', 'archive', 'eye', 'download', 'refresh',
  'star', 'ban', 'info', 'ask', 'more', 'keyboard', 'code', 'observe', 'history', 'lock', 'key', 'learning', 'skill',
  'plug', 'globe', 'mail', 'pin', 'today', 'work', 'projects', 'activity', 'slash', 'house', 'split', 'blocks', 'shield',
  'sliders-horizontal', 'chevron-right', 'chevron-down', 'x', 'funnel', 'triangle-alert', 'arrow-right', 'arrow-left',
  'external-link', 'square', 'banknote', 'kanban', 'rows-3', 'receipt', 'concierge-bell', 'box', 'users',
  'square-check', 'file-text', 'bot', 'grip-vertical', 'arrow-up', 'arrow-down', 'layout-grid', 'pencil', 'trash-2',
  'rotate-cw', 'circle-question-mark', 'ellipsis', 'lightbulb', 'zap', 'list-todo', 'flag', 'milestone', 'target',
  'calendar-days', 'calendar-check', 'hourglass', 'timer', 'repeat', 'circle-check', 'circle-dot', 'pause', 'rocket',
  'wrench', 'package', 'truck', 'list-checks', 'list-ordered', 'list', 'square-kanban', 'flag-triangle-right', 'goal',
  'clipboard-list', 'clipboard-check', 'receipt-text', 'wallet', 'landmark', 'credit-card', 'coins', 'piggy-bank',
  'percent', 'calculator', 'scale', 'trending-up', 'trending-down', 'arrow-down-left', 'arrow-up-right', 'hand-coins',
  'badge-pound-sterling', 'badge-dollar-sign', 'badge-euro', 'pound-sterling', 'dollar-sign', 'euro',
  'chart-no-axes-column', 'calendar-clock', 'calendar-plus', 'calendar-x', 'calendar-range', 'alarm-clock',
  'clock-alert', 'clock-arrow-up', 'user', 'user-plus', 'user-check', 'user-x', 'contact', 'handshake', 'briefcase',
  'building', 'building-2', 'store', 'factory', 'loader-circle', 'lock-open', 'shield-check', 'shield-alert',
  'octagon-alert', 'circle-x', 'circle-alert', 'circle-pause', 'circle-play', 'circle-stop', 'circle-slash',
  'circle-dashed', 'circle-plus', 'circle-minus', 'circle', 'file', 'file-spreadsheet', 'file-image', 'file-plus',
  'file-check', 'file-x', 'paperclip', 'folder', 'folder-open', 'image', 'files', 'mail-open',
  'message-square', 'message-circle', 'messages-square', 'phone', 'send', 'at-sign', 'bell-off', 'reply', 'forward',
  'megaphone', 'server', 'database', 'cloud', 'cpu', 'terminal', 'git-branch', 'git-pull-request', 'git-merge',
  'git-commit-horizontal', 'hard-drive', 'chart-line', 'chart-column', 'chart-pie', 'gauge', 'chart-area',
  'chart-bar', 'chart-no-axes-combined', 'minus', 'chevron-left', 'chevron-up', 'chevrons-up-down', 'arrow-up-down',
  'move', 'laptop', 'smartphone', 'tags', 'layout-list', 'eye-off', 'upload', 'rotate-ccw', 'refresh-cw',
  'ellipsis-vertical', 'map-pin', 'map', 'compass', 'navigation', 'bookmark', 'heart', 'thumbs-up', 'thumbs-down',
  'link-2', 'hash', 'list-filter', 'arrow-up-narrow-wide', 'arrow-down-wide-narrow', 'cog', 'settings-2',
  'log-in', 'log-out', 'menu', 'panel-left', 'share', 'share-2', 'printer', 'save', 'undo-2', 'redo-2', 'maximize-2',
  'minimize-2', 'expand', 'shrink', 'music', 'video', 'camera', 'mic', 'headphones', 'book', 'book-open',
  'notebook-pen', 'graduation-cap', 'heart-pulse', 'stethoscope', 'car', 'plane', 'train-front', 'bike',
  'shopping-cart', 'shopping-bag', 'gift', 'ticket', 'utensils', 'coffee', 'dumbbell', 'leaf', 'sprout', 'tree-pine',
  'invoice', 'card', 'message', 'help', 'alarm', 'loader', 'unlock', 'keychain', 'cake', 'shop', 'cube', 'site', 'website', 'web',
  'chart', 'graph', 'cart', 'bag', 'food', 'idea', 'robot', 'photo', 'film', 'app', 'computer', 'chat', 'email',
  'bank', 'school', 'health', 'plant', 'tree', 'train', 'office',
] as const;

/* AS WRITTEN, NOT LOWER-CASED: the drawer looks a name up as it is spelled, so `Rocket` draws nothing and is said so. */
const GLYPH_SET: ReadonlySet<string> = new Set<string>(MARK_GLYPHS);

/**
 * Whether a mark names a picture a row may wear: the set draws it, by its own name or a word that stands for one, and it
 * is no control. The same answer as `isMark` in the renderer's `glyphs/names.ts`, around any spaces.
 */
export function isMarkGlyph(name: unknown): boolean {
  return typeof name === 'string' && GLYPH_SET.has(name.trim()) && !isControlMark(name);
}

/**
 * Whether a mark is a word that draws nothing, so the row shows a letter in its place. AN EMPTY MARK IS NOT ONE: nothing
 * was chosen, and the row takes a mark the way a new one does. A control an older record still holds is one, since no
 * drawer draws it as a mark.
 */
export function isUnknownMark(name: unknown): boolean {
  return typeof name === 'string' && name.trim() !== '' && !isMarkGlyph(name);
}

/** The refusal's code and its sentence, for a write that changes a mark already naming a picture. */
export const MARK_IS_FROZEN = 'MARK_IS_FROZEN';
export const MARK_IS_FROZEN_SAYS = 'This already has its picture, and a picture stays once it is chosen.';

/**
 * A MARK IS CHOSEN ONCE (13 §2.1b), AND A WORD THAT DRAWS NOTHING WAS NEVER A CHOICE. So a mark that names a picture
 * refuses every write that would change or clear it, and one that is empty or names no glyph takes the write. That is
 * the one more write an imported `koala` gets: once it names a picture it is held like any other. Sending back what is
 * already there is no change. `null` when the write may go through, the refusal when it may not.
 *
 * WHAT THE NEW VALUE IS, this does not judge: a control is `MARK_IS_CONTROL`'s to refuse, and a second word that draws
 * nothing leaves the mark as repairable as it was, and still counted by `marks-unknown`.
 */
export function markFrozen(held: unknown, next: unknown): { code: string; fix: string } | null {
  if (!isMarkGlyph(held)) return null;
  if (typeof next === 'string' && next.trim() === (held as string).trim()) return null;
  return { code: MARK_IS_FROZEN, fix: MARK_IS_FROZEN_SAYS };
}
