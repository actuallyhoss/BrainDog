/**
 * Which of an add-on's settings are drawn and which fold under "More limits".
 *
 * THE MONEY ADD-ON DREW FOURTEEN EMPTY LIMIT BOXES, each with its currency in front so it read as a value, 4,000 px on
 * a phone. A limit nobody set and with no default of its own is folded; one that holds something stays. Fewer than
 * three blank ones are drawn as they are, since a fold that hides two saves nothing.
 *
 * Out of the component so `node --test` can run it, since a Svelte page does not mount there.
 */

/** The kinds of setting a limit is typed in. */
const LIMITS = new Set(['money', 'number']);

/** Fewer blank limits than this are drawn and not folded. */
export const FOLD_LEAST = 3;

const blank = (v: unknown): boolean => v === null || v === undefined || v === '';

/**
 * THE NOTES SEVERAL SETTINGS SHARE, said once at the foot rather than under each: every Money limit carried "Held to this
 * as soon as it is saved." A note three or more settings carry word for word is one of these.
 */
export function sharedNotes(entries: readonly (readonly [string, { note?: string }])[]): string[] {
  const seen = new Map<string, number>();
  for (const [, decl] of entries) if (decl.note) seen.set(decl.note, (seen.get(decl.note) ?? 0) + 1);
  return [...seen].filter(([, n]) => n >= FOLD_LEAST).map(([note]) => note);
}

/**
 * WORDS STILL AT WHAT THE ADD-ON SHIPS (L45, 1 Nov): a starter drew thirteen "Name of the … list" boxes, thirteen "What
 * one is called" and fifteen lines of its voice, every one holding its own default, 4,672px at 1512. A word setting that
 * still holds its shipped words folds with the blank limits; one somebody changed stays in view.
 */
const atShipped = (decl: { type: string; default?: unknown }, v: unknown): boolean =>
  decl.type === 'text' && typeof decl.default === 'string' && decl.default.trim() !== '' && (blank(v) || v === decl.default);

/** The settings drawn, the ones folded, both in the add-on's own order, and what the fold is called. */
export function foldOf(
  entries: readonly (readonly [string, { type: string; default?: unknown }])[],
  values: Readonly<Record<string, unknown>>,
): { shown: string[]; folded: string[]; label: string } {
  const limits = entries.filter(([key, decl]) => LIMITS.has(decl.type) && blank(values[key]) && blank(decl.default)).map(([key]) => key);
  const worded = entries.filter(([key, decl]) => atShipped(decl, values[key])).map(([key]) => key);
  const folded = [...(limits.length >= FOLD_LEAST ? limits : []), ...(worded.length >= FOLD_LEAST ? worded : [])];
  const label = worded.length >= FOLD_LEAST ? 'More settings' : 'More limits';
  return { shown: entries.map(([key]) => key).filter((k) => !folded.includes(k)), folded, label };
}
