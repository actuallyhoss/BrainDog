/**
 * "Let agents do everything without asking" in Settings > Agents: whether the owner's agents act at his reach with no
 * question on Decide and no code to approve (`packages/record/src/index.ts`, `bypassOf`). PURE, so `node --test` can
 * import it; `Bypass.svelte` draws it.
 *
 * OFF UNTIL HE TURNS IT ON. The record keeps it as the owner's own `agents.bypass` (`setPref`, held to an owner signed in
 * to the app, with a recent sign-in to turn it on), so no agent, team member or share link turns it on.
 *
 * WHAT STILL NEEDS HIM IS SAID IN THE SAME WORDS AS `NEVER_BYPASS` IN THE RECORD: a key's value, making keys, deleting or
 * exporting all of BrainDog, changing the owner, and paying.
 */

/** The pref the switch keeps. */
export const BYPASS_PREF = 'agents.bypass' as const;

export const bypassWords = {
  title: 'Let agents do everything without asking',
  /* ONE LINE EACH (G15): it was two paragraphs under the switch. What the "on" line folded away (installs, automations,
     bank texts and imports) is the same lift; what still needs him waits behind "What still needs you". */
  on: 'Agents act without asking, money and outside reads too. Each change names its agent and can be undone.',
  off: 'Agents ask before deletes, money, keys, add-ons and settings, and after reading things from outside.',
  more: 'What still needs you',
  still: 'Still only you, here: seeing or adding a key, making new keys, deleting or exporting all of BrainDog, changing the owner, and paying.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Only `on` is on. */
export const bypassOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[BYPASS_PREF] === 'on';

/** The sentence under the switch. */
export const bypassSaid = (on: boolean): string => (on ? bypassWords.on : bypassWords.off);
