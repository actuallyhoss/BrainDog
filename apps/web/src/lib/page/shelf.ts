/**
 * THE SHELF: drawn components a person kept, each a name and a block's declaration as the page's own
 * source would hold it, placed onto any page from the add menu.
 *
 * SHELF V2 (widgets plan §3.1, §5.7): a kept widget also says the sizes it draws at, so the sheet's Made by you offers
 * it only where it fits; keeping it again under its name is a new version, with the last few earlier ones kept to put
 * back; and it remembers the page and block it was made on, the link back. The record checks all of it (`shelf.ts`).
 *
 * A SHELF ITEM IS HOW A BLOCK IS BUILT AND NEVER DATA. It names a list and says how to draw it (kind, columns, filter,
 * order); the rows are read when it is placed, so it is always today's. The record refuses a rowed block (`authored`) in
 * `shelf.kept`. PURE: no runes, so `shelf.test.ts` holds it in Node.
 */

import { drawnSizes, type WidgetSize } from 'braindog-render';

export type Declared = { kind: string; [key: string]: unknown };
export type ShelfVersion = { version: number; block: Declared; at?: string };
export type Shelved = {
  id: string;
  name: string;
  block: Declared;
  /** The board frames it draws at, for a kept widget. */
  sizes?: WidgetSize[];
  /** Its version, from 1, and the earlier ones kept, newest first. */
  version?: number;
  versions?: ShelfVersion[];
  /** The page and block it was made on: the link back. */
  from?: { page: string; key: string };
  /** The day it was last kept. */
  at?: string;
};

export const SHELF_MOST = 50;
export const SHELF_NAME_MOST = 60;
/** How many earlier versions of one item are kept (the record's `SHELF_VERSIONS_MOST`). */
export const SHELF_VERSIONS_MOST = 3;

export const shelfWords = {
  title: 'Your shelf',
  save: 'Save to shelf',
  saved: (name: string) => `${name} is on your shelf.`,
  placed: (name: string) => `${name} added from your shelf.`,
  remove: 'Take off',
  removed: (name: string) => `${name} is off your shelf.`,
  gone: 'That list is not here any more, so this cannot be placed.',
  empty: 'Nothing is on your shelf yet. Make a component and keep it here.',
  full: `The shelf holds ${SHELF_MOST}. Take one off first.`,
  refused: 'The shelf could not be kept.',
  made: 'Made by you',
  version: (n: number) => `Version ${n}`,
  putBack: (n: number) => `Put back version ${n}`,
  putBackDone: (name: string, n: number) => `${name} is back to version ${n}.`,
  madeOn: (page: string) => `Made on ${page}`,
};

/** What the record answered for `shelf.kept`, read tolerantly: anything that is not a well-formed item is left out. */
export function shelvedOf(v: unknown): Shelved[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((i) => {
    const it = i as { id?: unknown; name?: unknown; block?: unknown } | null;
    if (!it || typeof it.id !== 'string' || typeof it.name !== 'string') return [];
    const b = it.block as { kind?: unknown } | null;
    if (!b || typeof b !== 'object' || typeof b.kind !== 'string') return [];
    const more = i as { sizes?: unknown; version?: unknown; versions?: unknown; from?: unknown; at?: unknown };
    const sizes = drawnSizes(more.sizes);
    const from = more.from as { page?: unknown; key?: unknown } | null | undefined;
    const versions = Array.isArray(more.versions)
      ? more.versions.flatMap((v): ShelfVersion[] => {
          const o = v as { version?: unknown; block?: unknown; at?: unknown } | null;
          const ob = o?.block as { kind?: unknown } | null | undefined;
          return o && typeof o.version === 'number' && ob && typeof ob === 'object' && typeof ob.kind === 'string'
            ? [{ version: o.version, block: ob as Declared, ...(typeof o.at === 'string' ? { at: o.at } : {}) }]
            : [];
        })
      : [];
    return [
      {
        id: it.id,
        name: it.name,
        block: b as Declared,
        ...(sizes.length > 0 ? { sizes } : {}),
        ...(typeof more.version === 'number' ? { version: more.version } : {}),
        ...(versions.length > 0 ? { versions } : {}),
        ...(from && typeof from.page === 'string' && typeof from.key === 'string' ? { from: { page: from.page, key: from.key } } : {}),
        ...(typeof more.at === 'string' ? { at: more.at } : {}),
      },
    ];
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

/** What a kept widget carries besides its block: its sizes, where it was made, and the day. */
export type ShelveMore = { sizes?: readonly WidgetSize[]; from?: { page: string; key: string }; at?: string };

const sameBlock = (a: Declared, b: Declared): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The shelf with one component on it, or `null` where it is full. A name already there is replaced, so keeping the same
 * component twice leaves one and the shelf is never a list of copies. KEPT AGAIN WITH A NEW BLOCK IT IS A NEW VERSION:
 * the one it replaces joins its earlier versions, the last `SHELF_VERSIONS_MOST` of them kept.
 */
export function shelve(list: readonly Shelved[], name: string, block: Declared, id: string, more: ShelveMore = {}): Shelved[] | null {
  const said = nameFit(name);
  if (said === '') return null;
  const declared = declaredOf(block);
  const sizes = drawnSizes(more.sizes);
  const extra = {
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(more.from ? { from: more.from } : {}),
    ...(more.at ? { at: more.at } : {}),
  };
  const at = list.findIndex((s) => s.name.toLowerCase() === said.toLowerCase());
  if (at >= 0) {
    const was = list[at]!;
    if (sameBlock(was.block, declared)) return list.map((s, i) => (i === at ? { ...s, name: said, ...extra } : s));
    const version = (was.version ?? 1) + 1;
    const versions = [{ version: was.version ?? 1, block: was.block, ...(was.at ? { at: was.at } : {}) }, ...(was.versions ?? [])].slice(0, SHELF_VERSIONS_MOST);
    const from = was.from ? { from: was.from } : {};
    return list.map((s, i) => (i === at ? { id: s.id, name: said, block: declared, ...(was.sizes ? { sizes: was.sizes } : {}), ...from, ...extra, version, versions } : s));
  }
  return list.length >= SHELF_MOST ? null : [...list, { id, name: said, block: declared, ...extra, version: 1 }];
}

/**
 * The shelf with an earlier version of one item put back: that version's block becomes the item's, as a new version,
 * and the one it replaces joins the earlier ones, so putting back can itself be put back. `null` where there is no such
 * version.
 */
export function putBackVersion(list: readonly Shelved[], id: string, version: number, at?: string): Shelved[] | null {
  const item = list.find((s) => s.id === id);
  const old = item?.versions?.find((v) => v.version === version);
  if (!item || !old) return null;
  const now = Math.max(item.version ?? 1, ...(item.versions ?? []).map((v) => v.version)) + 1;
  const versions = [{ version: item.version ?? 1, block: item.block, ...(item.at ? { at: item.at } : {}) }, ...(item.versions ?? []).filter((v) => v.version !== version)].slice(0, SHELF_VERSIONS_MOST);
  return list.map((s) => (s.id === id ? { ...s, block: old.block, version: now, versions, ...(at ? { at } : {}) } : s));
}

/** The kept widgets the sheet offers under Made by you: those that claim a size, at the sizes they claim. */
export const madeByYou = (list: readonly Shelved[]): (Shelved & { sizes: WidgetSize[] })[] =>
  list.filter((s): s is Shelved & { sizes: WidgetSize[] } => (s.sizes?.length ?? 0) > 0);

export const unshelve = (list: readonly Shelved[], id: string): Shelved[] => list.filter((s) => s.id !== id);

/** The list a shelved block reads, or `null` for one that reads none. */
export const listOf = (block: Declared): string | null => (typeof block.source === 'string' && block.source.startsWith('register.') ? block.source.slice('register.'.length) : null);

/** A new id for a shelf item: the clock and a counter, so two kept in one tick differ. */
let counter = 0;
export const shelfId = (now: number): string => `s${now.toString(36)}${(counter++).toString(36)}`;
