/**
 * Fix and install: a theme refused at install, handed to the look editor.
 *
 * THE ADD-ON SCREEN HAS THE DOCUMENT AND THE EDITOR HAS THE TOOLS. A pack whose theme the install refused
 * (`CONTRAST_FLOOR`, `INTENT_INSEPARABLE`, `THEME_LADDER_ORDER`) offers "Fix and install": it calls `stageFix` with the
 * pack's document and goes to Settings > Appearance, and the editor opens on that theme with the failing colours
 * selected and a one-axis fix staged for each (`look.ts`'s `stageFixes`).
 *
 * HELD IN THIS TAB'S SESSION STORAGE, NOT IN THE ADDRESS. A pack document is kilobytes and may carry what its author did
 * not mean to put in a link; the tab that pressed the button is the tab that opens the editor. Every touch of storage
 * is guarded, because a private window may refuse it, and then the editor opens as it always does.
 *
 * PLAIN NODE LOADS THIS FILE: no runes, no `$lib`.
 */

const KEY = 'bd_look_fix';

/** The refusal codes a look can be fixed out of, by moving lightness. The others are not a colour's to fix. */
export const FIXABLE: ReadonlySet<string> = new Set(['CONTRAST_FLOOR', 'INTENT_INSEPARABLE', 'THEME_LADDER_ORDER']);

/** Whether a pack document carries a `theme` declaration at all, so a screen offers Fix and install only for one that does. */
export function hasTheme(doc: unknown): boolean {
  const decls = doc !== null && typeof doc === 'object' ? (doc as { declarations?: unknown }).declarations : undefined;
  return Array.isArray(decls) && decls.some((d) => d !== null && typeof d === 'object' && typeof (d as { theme?: unknown }).theme === 'string');
}

/** Hand a refused pack's document to the editor. `false` when this browser keeps nothing, and the screen then says nothing new. */
export function stageFix(doc: unknown): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

/** The staged document, once: reading it clears it, so a reload of Appearance opens the editor as usual. */
export function takeFix(): unknown {
  try {
    const held = sessionStorage.getItem(KEY);
    if (held === null) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(held) as unknown;
  } catch {
    return null;
  }
}
