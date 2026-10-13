/**
 * The knobs a group of walks share: one declaration drawn once per currency, moved by one set of controls.
 *
 * A WALK IN EACH CURRENCY IS STILL ONE QUESTION ABOUT THE MONEY, so "what if clients pay a month late" moves every
 * walk at once, from the controls under the last of them, rather than each walk repeating the same knobs. Spending
 * the record does not know is money, so it is held for each walk's currency on its own (`src/forecast.ts` `knobsIn`).
 *
 * IN MEMORY, NEVER IN THE ADDRESS, as a walk's own knobs are. A group is let go when its last walk is.
 */
import { currencyName, forecastSold, knobsIn, type ForecastModel, type GroupKnobs, type Knobs } from '../src/forecast.ts';

/**
 * What one walk of a group tells the controls: its movements worth leaving out, the pairs its converted steps came
 * through, and the names of what it may count as sold, which are figures in its own money and no other walk's.
 */
export type GroupMember = { heavy: { label: string; amount: string }[]; pairs: string[]; sells: string[] };

/**
 * THE SELL DAY IS HELD FOR EACH WALK ON ITS OWN (`sold`, by the walk's key), as spending is: a holding is worth a figure
 * in one currency, so it is counted as sold in the walk of that currency and moves no other.
 */
export type Group = { knobs: GroupKnobs; members: Record<string, GroupMember>; sold: Record<string, string> };

/** One sell control: the walk it moves and what that walk may sell, each name once. */
export type SellRow = { key: string; names: string[] };

type Told = readonly (readonly [string, Pick<GroupMember, 'pairs' | 'sells'>])[];

/** Every pair any walk of the group was converted through, each once: one drift slider moves it in every walk. */
export const pairsAcross = (members: Told): string[] => [...new Set(members.flatMap(([, m]) => m.pairs))].sort();

/**
 * What the group may sell, a control for each walk that holds something. JOINED BY NAME AND CURRENCY: one name in two
 * walks is two holdings in two currencies, so it stays two controls and neither moves the other's walk.
 */
export const sellRows = (members: Told): SellRow[] =>
  members.flatMap(([key, m]) => (m.sells.length ? [{ key, names: [...new Set(m.sells)] }] : []));

/** A sell control's name. Where more than one walk sells, each says its money: `Gold (Egyptian pound) sold on`. */
export const soldName = (row: SellRow, several: boolean): string =>
  forecastSold(several ? [`${row.names.join(', ')} (${/^[A-Z]{3}$/u.test(row.key) ? currencyName(row.key) : row.key})`] : row.names);

/** One walk's knobs, read from what its group holds: the shared ones, and the sell day of its own key only. */
export const walkKnobs = (model: ForecastModel, group: Pick<Group, 'knobs' | 'sold'>, key: string): Knobs => ({
  ...knobsIn(model, group.knobs, key),
  sell: group.sold[key] ?? null,
});

const groups = new Map<string, Group>();

/** The group a walk belongs to, made the first time a walk asks for it. */
export function groupNamed(id: string): Group {
  const held = groups.get(id);
  if (held) return held;
  const made: Group = $state({ knobs: { horizon: null, late: 0, spend: {}, leave: [] }, members: {}, sold: {} });
  groups.set(id, made);
  return made;
}

/** A walk leaving its group; the group goes with its last walk. */
export function leaveGroup(id: string, key: string): void {
  const held = groups.get(id);
  if (!held) return;
  delete held.members[key];
  if (Object.keys(held.members).length === 0) groups.delete(id);
}
