/**
 * The names the frame uses as controls, which a row may never wear as its mark (PGS-A06).
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
