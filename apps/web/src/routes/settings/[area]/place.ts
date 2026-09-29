/**
 * Settings as a place: the groups its index draws, and the areas a phone is not offered.
 *
 * BELOW 900PX `/settings` IS AN INDEX AND EACH AREA A PAGE OF ITS OWN. The areas sat in one sideways
 * strip that a phone cut at its edge, with nothing there to say more followed. An
 * index of grouped rows shows every area at once, and an area opened from it has a back link to it.
 * From 900px up the same index stands beside the area, as the rail stands beside a page.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE. The rows themselves stay in `+page.svelte`'s
 * `AREAS`, which is the registry a unit adding an area writes its row into;
 * this file only says how the index groups what that list holds.
 */

import type { IconName } from '../../../lib/ui/icons.ts';

/** The groups of the settings index. */
export type AreaGroup = 'you' | 'signin' | 'sharing' | 'record';

/** One row of `AREAS`, as the index reads it. */
export type AreaRow = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  /**
   * The group the index draws the row in. A row written without one is drawn in the last group
   * (`LAST`), so an area added in the registry's older shape (`{ id, label, icon }`) is still listed.
   */
  readonly group?: AreaGroup;
  /** One line under the name, saying what the area holds. A row without one draws its name alone. */
  readonly line?: string;
};

/**
 * THE GROUPS IN THE ORDER THE INDEX DRAWS THEM, and their headings.
 *
 * WHAT A PERSON CHANGES FOR THEMSELVES COMES FIRST, and what changes the record for everybody comes
 * last, so the one irreversible act (deleting the record) is the last row of the last group rather
 * than a neighbour of the colour scheme.
 */
export const GROUPS: readonly { readonly id: AreaGroup; readonly title: string }[] = [
  { id: 'you', title: 'You' },
  { id: 'signin', title: 'Signing in' },
  { id: 'sharing', title: 'Sharing and access' },
  { id: 'record', title: 'This record' },
];

/**
 * THE AREAS A PHONE'S INDEX LEAVES OUT.
 *
 * Keyboard is a table of keys, and a phone has none to press: offering it there is a visible key
 * hint on a screen with no keyboard. Its address still opens, so a link somebody shares still lands.
 */
export const ONLY_WIDE: ReadonlySet<string> = new Set(['keyboard']);

/** Where a row that names no group is drawn: the record's own group, last in the index. */
export const LAST: AreaGroup = 'record';

/**
 * The index's groups, each with its areas in the order `AREAS` lists them.
 *
 * A GROUP WITH NO AREA IS NOT DRAWN, so a heading never stands over nothing. EVERY ROW IS DRAWN ONCE:
 * a row's group can only be one of `GROUPS` (the type refuses any other), and a row with none is
 * drawn under `LAST`, so no area the registry holds is ever missing from its index.
 */
export function grouped<R extends AreaRow>(areas: readonly R[]): { id: AreaGroup; title: string; areas: R[] }[] {
  return GROUPS.map((g) => ({ id: g.id, title: g.title, areas: areas.filter((a) => (a.group ?? LAST) === g.id) })).filter(
    (g) => g.areas.length > 0,
  );
}
