/**
 * "Keep BrainDog's command line, hooks and skill up to date by itself" in Settings > Agents: whether the command on his
 * computers puts in a newer build when a session starts, rather than telling him to run braindog update
 * (`apps/cli/src/upkeep.ts`). PURE, so `node --test` can import it; `SelfUpdate.svelte` draws it.
 *
 * OFF UNTIL HE TURNS IT ON. The record keeps it as the owner's own `agents.self_update` (`setPref`, held to an owner in a
 * browser), so no agent turns it on for itself, and the context tells the command behind his key (`build.self_update`).
 * Only a newer build signed by BrainDog goes in, never an older one, and a start never waits on it for more than a few
 * seconds.
 */

/** The pref the switch keeps. */
export const SELF_UPDATE_PREF = 'agents.self_update' as const;

export const selfUpdateWords = {
  /* ITS OWN TILE: it is about BrainDog on his computers, not about what agents answer. */
  tile: 'Updates',
  title: "Keep BrainDog's command line, hooks and skill up to date by itself",
  on: 'A session that starts puts in any newer build signed by BrainDog, and says so in one line.',
  off: 'A session that starts says when a newer build is out, and you run braindog update.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Only `true` is on. */
export const selfUpdateOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[SELF_UPDATE_PREF] === true;

/** The sentence under the switch. */
export const selfUpdateSaid = (on: boolean): string => (on ? selfUpdateWords.on : selfUpdateWords.off);
