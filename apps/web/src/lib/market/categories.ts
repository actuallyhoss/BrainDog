/**
 * Browse's category chips (`loop/finish/platform.md` §4.0 C): each category any listing is in, with how many are in it.
 *
 * A CATEGORY IS NEVER CHOSEN BY AN AUTHOR. The Kennel's are worked out from the file by `categoriesOf`, and a bundled
 * listing's are said in `listing.ts`, so a chip counts what a thing does and not what its author hoped it would be found as.
 * A chip with nothing under it is not drawn, because a filter that empties the grid tells a person nothing.
 */

import type { Category } from '@braindog/declare/catalogue';

import type { Listing } from './listing.ts';
import { LEADING } from './listing.ts';
import { words } from './words.ts';

/** Every category in the order its chip is drawn: the two that lead browse, then the rest as the catalogue lists them. */
export const CATEGORY_ORDER: readonly Category[] = [...LEADING, 'modules', 'templates', 'connectors', 'doors', 'automations', 'blocks', 'themes'];

/** What a person reads for a category. */
export const categoryName = (c: Category): string => words.categories[c];

export type Chip = { category: Category; name: string; count: number };

/** The chips for these listings: every category at least one is in, with its count, in `CATEGORY_ORDER`. */
export function chipsOf(listings: readonly Listing[]): Chip[] {
  const counts = new Map<Category, number>();
  for (const l of listings) for (const c of new Set(l.categories)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return CATEGORY_ORDER.flatMap((category) => {
    const count = counts.get(category) ?? 0;
    return count === 0 ? [] : [{ category, name: categoryName(category), count }];
  });
}

/** The listings in one category, or every one when none is picked. */
export const inCategory = (listings: readonly Listing[], category: Category | null): Listing[] => (category === null ? [...listings] : listings.filter((l) => l.categories.includes(category)));
