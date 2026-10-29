/**
 * THE SHELF AS THE RECORD KEEPS IT (`shelf.kept`, a person's preference): components a person kept, each a name and a
 * block's declaration, never data. Shelf v2 (widgets plan §3.1, §5.7) adds what a kept widget needs to go on any board:
 *
 * - `sizes`: the frames it draws at, the board's five words, so the sheet offers it only where it fits;
 * - `version` and `versions`: keeping it again under the same name is a new version, and the last few earlier ones are
 *   kept so one can be put back;
 * - `from`: the page and block it was made on, the link back, so the sheet can say where it came from and open it there;
 * - `at`: the day it was last kept.
 *
 * A v1 item (an id, a name and a block) is still a whole item. A drawn block's `code` is weighed apart from the rest of
 * its declaration, since a drawn widget is mostly code, and the whole shelf has a ceiling so a preference stays small.
 */

import { BLOCK_INSTALLS } from '@braindog/kernel';
import { WIDGET_SIZES } from 'braindog-render';

/** The most components on one shelf, the longest name, and the most a kept declaration may weigh written out. */
export const SHELF_MOST = 50;
export const SHELF_NAME_MOST = 60;
export const SHELF_BLOCK_MOST = 4000;
/** The most a kept drawn component's code may weigh, apart from the rest of its block. */
export const SHELF_CODE_MOST = 24 * 1024;
/** How many earlier versions of one item are kept. */
export const SHELF_VERSIONS_MOST = 3;
/** The most the whole shelf may weigh written out. */
export const SHELF_TOTAL_MOST = 400 * 1024;

/** One item as the record keeps it. */
export type ShelfItem = {
  id: string;
  name: string;
  block: Record<string, unknown>;
  sizes?: string[];
  version?: number;
  versions?: { version: number; block: Record<string, unknown>; at?: string }[];
  from?: { page: string; key: string };
  at?: string;
};

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => v !== null && typeof v === 'object' && !Array.isArray(v);
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const isVersion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9999;

/** What is wrong with one kept block, or `null`. */
function blockFault(block: unknown, say: string): string | null {
  if (!isBag(block) || typeof block.kind !== 'string') return say;
  const stray = Object.keys(block).find((k) => !BLOCK_INSTALLS.has(k) || k === 'authored');
  if (stray !== undefined) return `A shelf keeps how a block is built, not data: ${stray} is not kept.`;
  const { code, ...rest } = block;
  if (code !== undefined && (typeof code !== 'string' || code.length > SHELF_CODE_MOST))
    return `A kept drawn component's code is at most ${SHELF_CODE_MOST / 1024} KB.`;
  if (JSON.stringify(rest).length > SHELF_BLOCK_MOST) return `A shelf item is at most ${SHELF_BLOCK_MOST} characters written out.`;
  return null;
}

/**
 * WHAT A SHELF MAY HOLD: a name and a block's declaration, never data. Only keys a block may declare are kept, and
 * `authored` (rows written into the block) is refused, so a shelf item draws whatever its list holds today and carries
 * no rows of its own. Returns the sentence that refuses it, or `null`.
 */
export function shelfFault(value: unknown): string | null {
  const say = `shelf.kept is a list of at most ${SHELF_MOST} components, each an id, a name of 1 to ${SHELF_NAME_MOST} characters and a block declaration, or null to take it away.`;
  if (!Array.isArray(value) || value.length > SHELF_MOST) return say;
  if (JSON.stringify(value).length > SHELF_TOTAL_MOST) return `The shelf is at most ${SHELF_TOTAL_MOST / 1024} KB written out. Take one off first.`;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isBag(item)) return say;
    const { id, name, block, sizes, version, versions, from, at, ...rest } = item;
    if (Object.keys(rest).length > 0) return say;
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,40}$/iu.test(id) || seen.has(id)) return say;
    seen.add(id);
    if (typeof name !== 'string' || name.trim() === '' || name.length > SHELF_NAME_MOST) return say;
    const bad = blockFault(block, say);
    if (bad) return bad;
    if (
      sizes !== undefined &&
      !(Array.isArray(sizes) && sizes.length >= 1 && sizes.length <= WIDGET_SIZES.length && new Set(sizes).size === sizes.length && sizes.every((s) => (WIDGET_SIZES as readonly unknown[]).includes(s)))
    )
      return `A kept widget's sizes are some of ${WIDGET_SIZES.join(', ')}, each once.`;
    if (version !== undefined && !isVersion(version)) return 'A kept widget\'s version is a whole number from 1.';
    if (at !== undefined && !(typeof at === 'string' && DAY.test(at))) return 'A kept widget\'s at is the day it was kept, such as 2026-10-29.';
    if (from !== undefined) {
      if (!isBag(from) || Object.keys(from).some((k) => k !== 'page' && k !== 'key')) return 'A kept widget\'s from is the page and the block it was made on: { page, key }.';
      if (typeof from.page !== 'string' || from.page === '' || from.page.length > 120 || typeof from.key !== 'string' || from.key === '' || from.key.length > 60)
        return 'A kept widget\'s from is the page and the block it was made on: { page, key }.';
    }
    if (versions !== undefined) {
      if (!Array.isArray(versions) || versions.length > SHELF_VERSIONS_MOST) return `A kept widget keeps at most ${SHELF_VERSIONS_MOST} earlier versions.`;
      for (const v of versions) {
        if (!isBag(v) || Object.keys(v).some((k) => k !== 'version' && k !== 'block' && k !== 'at') || !isVersion(v.version)) return 'An earlier version is its number, its block and the day it was kept.';
        if (v.at !== undefined && !(typeof v.at === 'string' && DAY.test(v.at))) return 'An earlier version\'s at is the day it was kept.';
        const old = blockFault(v.block, say);
        if (old) return old;
      }
    }
  }
  return null;
}

/** The shelf as it is kept, once `shelfFault` passed it: names trimmed, and only the parts an item has. */
export function shelfKept(value: readonly Bag[]): ShelfItem[] {
  return value.map((i) => ({
    id: i.id as string,
    name: (i.name as string).trim(),
    block: i.block as Bag,
    ...(i.sizes !== undefined ? { sizes: i.sizes as string[] } : {}),
    ...(i.version !== undefined ? { version: i.version as number } : {}),
    ...(i.versions !== undefined ? { versions: i.versions as ShelfItem['versions'] & object } : {}),
    ...(i.from !== undefined ? { from: i.from as { page: string; key: string } } : {}),
    ...(i.at !== undefined ? { at: i.at as string } : {}),
  }));
}
