/**
 * An answer as the local copy can keep it, and back again.
 *
 * THE COPY KEEPS PLAIN JSON ONLY (`scrubbed` in `local.ts`), and a drawn page carries a `Map` here and there: the names
 * a block's references are said by. Kept as it is, the whole answer was refused, so Today had no copy to open on. Each
 * `Map` is written as its entries under one key no answer uses, and read back into a `Map`.
 *
 * PURE, AND NODE LOADS IT.
 */

/** The key a `Map` is written under. */
const MAP = '__map';

/** `value` with every `Map` in it written as its entries. */
export function plainOf(value: unknown): unknown {
  if (value instanceof Map) return { [MAP]: [...value].map(([k, v]) => [plainOf(k), plainOf(v)]) };
  if (Array.isArray(value)) return value.map(plainOf);
  /* ONLY A PLAIN OBJECT IS WALKED: anything else (a Date, a Set) is left as it is, and the copy still refuses it. */
  if (typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plainOf(v);
    return out;
  }
  return value;
}

/** `plainOf` undone: every written `Map` read back into one. */
export function revivedOf<T>(value: unknown): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object' && v !== null) {
      const entries = (v as Record<string, unknown>)[MAP];
      if (Array.isArray(entries) && Object.keys(v).length === 1) return new Map(entries.map((e) => [walk((e as unknown[])[0]), walk((e as unknown[])[1])]));
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
