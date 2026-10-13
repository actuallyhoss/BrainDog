/**
 * The knobs a group of walks share: one declaration drawn once per currency, moved by one set of controls.
 *
 * A WALK IN EACH CURRENCY IS STILL ONE QUESTION ABOUT THE MONEY, so "what if clients pay a month late" moves every
 * walk at once, from the controls under the last of them, rather than each walk repeating the same knobs. Spending
 * the record does not know is money, so it is held for each walk's currency on its own (`src/forecast.ts` `knobsIn`).
 *
 * IN MEMORY, NEVER IN THE ADDRESS, as a walk's own knobs are. A group is let go when its last walk is.
 */
import type { GroupKnobs } from '../src/forecast.ts';

/** What one walk of a group tells the controls: its movements worth leaving out. */
export type GroupMember = { heavy: { label: string; amount: string }[] };

export type Group = { knobs: GroupKnobs; members: Record<string, GroupMember> };

const groups = new Map<string, Group>();

/** The group a walk belongs to, made the first time a walk asks for it. */
export function groupNamed(id: string): Group {
  const held = groups.get(id);
  if (held) return held;
  const made: Group = $state({ knobs: { horizon: null, late: 0, spend: {}, leave: [] }, members: {} });
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
