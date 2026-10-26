/**
 * The store as the person reads it: starters first, then the example setups, then every add-on on the shelf of what it
 * is for (money, projects and work, agents, notes and reading, looks, banks and regions).
 *
 * WHAT IS NEVER ON IT. BrainDog's own parts (`CORE`: Projects, People, Work and Agents) are part of BrainDog and never an
 * add-on to choose. A base add-on a starter turns on (Money, Services) is offered only on a record that has it turned
 * off, as the way back on. Anything private or unlisted is in no listing at all (`listingsOf`).
 *
 * A SHELF IS THE CATALOGUE'S WHERE IT SAYS ONE (`packs/listed.json`, the owner's), and otherwise worked out from what
 * the add-on needs, so an add-on from outside stands somewhere sensible: one that needs Money is on the money shelf.
 *
 * PURE, so `node --test` reads it.
 */

import { CORE, MODULE_SHELVES, MODULES } from '@braindog/declare';
import type { Shelf } from '@braindog/declare/catalogue';

import type { PackState } from '../record/packs.ts';
import type { Slot } from '../ui/face.ts';
import { actionOf, latestOf, type Listing } from './listing.ts';

/** The shelves in the order the store draws them. */
export const SHELF_ORDER: readonly Shelf[] = ['money', 'planning', 'helpers', 'reading', 'looks', 'regions'];

/** What a person reads for each shelf. */
export const SHELF_NAMES: Readonly<Record<Shelf, string>> = {
  money: 'Money',
  planning: 'Projects and work',
  helpers: 'Agents',
  reading: 'Notes and reading',
  looks: 'Looks',
  regions: 'Banks and regions',
};

/** The colour each shelf's cards wear their icon in, from the category slots every card and well share. */
export const SHELF_SLOTS: Readonly<Record<Shelf | 'starters', Slot>> = {
  starters: 'blue',
  money: 'teal',
  planning: 'sky',
  helpers: 'violet',
  reading: 'yellow',
  looks: 'pink',
  regions: 'slate',
};

/** The base add-ons, the modules a starter turns on that are not the core: offered only while turned off here. */
const isCoreId = (id: string): boolean => (CORE as readonly string[]).includes(id);

/** The shelf a listing stands on: its catalogue's, else a look's, else by the first module it needs, else notes and reading. */
export function shelfOf(l: Listing): Shelf {
  if (l.shelf !== undefined) return l.shelf;
  if (l.categories.includes('themes')) return 'looks';
  const needs = l.kind === 'module' ? [l.id] : (latestOf(l)?.reach.modules ?? []);
  const module = needs.find((m): m is (typeof MODULES)[number] => (MODULES as readonly string[]).includes(m));
  return module === undefined ? 'reading' : MODULE_SHELVES[module];
}

/** The store, laid out: the starters, the example setups, and each shelf with what is on it, in order. */
export type Store = { starters: Listing[]; examples: Listing[]; shelves: { shelf: Shelf; items: Listing[] }[] };

/**
 * The listings as the store draws them. `states` are the record's packs, `null` until it answers: until then no base
 * add-on is offered, since whether it is off is not known.
 */
export function storeOf(listings: readonly Listing[], states: readonly PackState[] | null): Store {
  const starters = listings.filter((l) => l.kind === 'usecase' && l.example !== true);
  const examples = listings.filter((l) => l.kind === 'usecase' && l.example === true);
  const offOnHere = (l: Listing): boolean => states !== null && actionOf(l, states).kind === 'turn-on';
  const addons = listings.filter((l) => l.kind === 'pack' || (l.kind === 'module' && !isCoreId(l.id) && offOnHere(l)));
  const shelves = SHELF_ORDER.flatMap((shelf) => {
    const items = addons.filter((l) => shelfOf(l) === shelf);
    return items.length === 0 ? [] : [{ shelf, items }];
  });
  return { starters, examples, shelves };
}

/** One chip of the store: everything, the starters, or one shelf, with how many it holds. */
export type StoreChip = { id: 'starters' | Shelf; name: string; count: number };

/** The chips for a laid-out store: the starters (examples counted with them), then every shelf that holds anything. */
export function storeChips(store: Store, startersName: string): StoreChip[] {
  const starters = store.starters.length + store.examples.length;
  return [
    ...(starters > 0 ? [{ id: 'starters' as const, name: startersName, count: starters }] : []),
    ...store.shelves.map((s) => ({ id: s.shelf, name: SHELF_NAMES[s.shelf], count: s.items.length })),
  ];
}

/** The base modules a starter turns on, by the names a person knows: "Money, Services", for its card. */
export const baseTurnedOn = (l: Pick<Listing, 'versions' | 'latest'>, nameOf: (id: string) => string): string[] =>
  (latestOf(l)?.reach.modules ?? []).filter((m) => !isCoreId(m)).map(nameOf);
