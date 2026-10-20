/**
 * THE SHELF (DIRECTION §45): drawn components a person kept, each a name and a block's declaration as the page's own
 * source would hold it, placed onto any page from the add menu.
 *
 * A SHELF ITEM IS HOW A BLOCK IS BUILT AND NEVER DATA. It names a list and says how to draw it (kind, columns, filter,
 * order); the rows are read when it is placed, so it is always today's. The record refuses a rowed block (`authored`) in
 * `shelf.kept`. PURE: no runes, so `shelf.test.ts` holds it in Node.
 */

export type Declared = { kind: string; [key: string]: unknown };
export type Shelved = { id: string; name: string; block: Declared };

export const SHELF_MOST = 50;
export const SHELF_NAME_MOST = 60;

export const shelfWords = {
  title: 'Your shelf',
  save: 'Save to shelf',
  saved: (name: string) => `${name} is on your shelf.`,
  placed: (name: string) => `${name} added from your shelf.`,
  remove: 'Take off',
  removed: (name: string) => `${name} is off your shelf.`,
  gone: 'That list is not on this record any more, so this cannot be placed.',
  empty: 'Nothing is on your shelf yet. Make a component and keep it here.',
  full: `The shelf holds ${SHELF_MOST}. Take one off first.`,
  refused: 'The shelf could not be kept.',
};

/** What the record answered for `shelf.kept`, read tolerantly: anything that is not a well-formed item is left out. */
export function shelvedOf(v: unknown): Shelved[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((i) => {
    const it = i as { id?: unknown; name?: unknown; block?: unknown } | null;
    if (!it || typeof it.id !== 'string' || typeof it.name !== 'string') return [];
    const b = it.block as { kind?: unknown } | null;
    if (!b || typeof b !== 'object' || typeof b.kind !== 'string') return [];
    return [{ id: it.id, name: it.name, block: b as Declared }];
  });
}

/** The keys a kept block never carries: rows of its own, and the hints a column wears only on screen. */
const DROPPED = ['authored', 'entries', 'rows', 'matched', 'values'];

/** A block as the shelf keeps it: declared keys only, columns reduced to field, label and role. */
export function declaredOf(block: Declared): Declared {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(block)) if (!DROPPED.includes(k) && v !== undefined) out[k] = v;
  if (Array.isArray(out.columns))
    out.columns = (out.columns as { field: string; label?: unknown; as?: unknown }[]).map((c) => ({
      field: c.field,
      ...(typeof c.label === 'string' ? { label: c.label } : {}),
      ...(typeof c.as === 'string' ? { as: c.as } : {}),
    }));
  return { ...out, kind: block.kind };
}

/** A name a shelf takes: trimmed, one line, within the length. */
export const nameFit = (name: string): string => name.replace(/\s+/gu, ' ').trim().slice(0, SHELF_NAME_MOST);

/**
 * The shelf with one component on it, or `null` where it is full. A name already there is replaced, so keeping the same
 * component twice leaves one and the shelf is never a list of copies.
 */
export function shelve(list: readonly Shelved[], name: string, block: Declared, id: string): Shelved[] | null {
  const said = nameFit(name);
  if (said === '') return null;
  const item: Shelved = { id, name: said, block: declaredOf(block) };
  const at = list.findIndex((s) => s.name.toLowerCase() === said.toLowerCase());
  if (at >= 0) return list.map((s, i) => (i === at ? { ...item, id: s.id } : s));
  return list.length >= SHELF_MOST ? null : [...list, item];
}

export const unshelve = (list: readonly Shelved[], id: string): Shelved[] => list.filter((s) => s.id !== id);

/** The list a shelved block reads, or `null` for one that reads none. */
export const listOf = (block: Declared): string | null => (typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null);

/** A new id for a shelf item: the clock and a counter, so two kept in one tick differ. */
let counter = 0;
export const shelfId = (now: number): string => `s${now.toString(36)}${(counter++).toString(36)}`;
