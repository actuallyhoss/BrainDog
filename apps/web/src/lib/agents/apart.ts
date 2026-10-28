/**
 * "Agents' suggestions wait apart" in Settings > Agents: whether an agent's build or housekeeping suggestion ("Add this
 * to Tasks?", "A run worked in kiln. Is that Kiln?") waits on Decide's quieter shelf, Suggested by agents, rather than
 * in Needs you and its count (the kernel's `apartOf`). PURE, so `node --test` can import it; `Apart.svelte` draws it.
 *
 * ON UNTIL HE TURNS IT OFF. The record keeps it as the owner's own `decide.agents_apart` (`setPref`, held to an owner in
 * a browser), so no agent moves its own suggestions into Needs you or out of it.
 */

/** The pref the switch keeps. */
export const APART_PREF = 'decide.agents_apart' as const;

export const apartWords = {
  tile: 'Suggestions',
  title: "Agents' suggestions wait apart",
  on: 'What an agent suggests that you can put back, such as a task or a name to add, waits under Suggested by agents on Needs you, one press each, and is not counted as needing you. Money, keys, sharing, deletes and add-ons still wait in Needs you.',
  off: 'Every suggestion waits in Needs you and is counted there.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Anything but `false` is on. */
export const apartOnIn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[APART_PREF] !== false;

/** The sentence under the switch. */
export const apartSaid = (on: boolean): string => (on ? apartWords.on : apartWords.off);
