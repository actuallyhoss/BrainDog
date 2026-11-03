/**
 * WHETHER TWO ANSWERS SAY THE SAME THING, so a read that came back unchanged is not drawn again (ui-perfect, 3 Nov).
 *
 * EVERY POLL THAT HEARD THE RECORD MOVE ASKED THE SHELL'S READS AGAIN, and each answer was a new object even when it said
 * exactly what the last one said. Handed to state as it came, it re-ran every row drawn from it: the sidebar wrote each
 * row's text and `dir` again on every move of the record, and anything keyed on identity was drawn afresh. Keep the old
 * value when this says they are the same, and only a real change reaches the screen.
 *
 * Plain data only: objects, arrays, Maps, Sets, Dates and primitives, as the record's answers are. Functions and class
 * instances other than those compare by identity. `NaN` is the same as `NaN`.
 */
export function same(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  /* A cycle or a structure this deep is no answer from the record: say "changed" and let it be drawn. */
  if (depth > 24) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i], depth + 1)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !same(v, b.get(k), depth + 1)) return false;
    return true;
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.hasOwn(b, k)) return false;
    if (!same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth + 1)) return false;
  }
  return true;
}

/** The value to keep: the old one when the new one says the same, so state handed it does not move. */
export const settle = <T>(old: T, next: T): T => (same(old, next) ? old : next);
