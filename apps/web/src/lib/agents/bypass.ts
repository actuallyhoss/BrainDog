/**
 * "Let agents do everything without asking" in Settings > Agents: whether the owner's agents act at his reach with no
 * question on Decide and no code to approve (`packages/record/src/index.ts`, `bypassOf`). PURE, so `node --test` can
 * import it; `Bypass.svelte` draws it.
 *
 * OFF UNTIL HE TURNS IT ON. The record keeps it as the owner's own `agents.bypass` (`setPref`, held to an owner signed in
 * to the app, with a recent sign-in to turn it on), so no agent, team member or share link turns it on.
 *
 * WHAT STILL NEEDS HIM IS SAID IN THE SAME WORDS AS `NEVER_BYPASS` IN THE RECORD (the owner's word of 2 Nov, "fully
 * inclusive"): giving the ownership away, deleting the whole BrainDog, and a key's value, which no agent ever reads.
 * Erasing a person for good stays his too, beside deleting, since no Undo puts either back. Paying is billing's.
 */

/** The pref the switch keeps. */
export const BYPASS_PREF = 'agents.bypass' as const;

export const bypassWords = {
  /* "YOUR" (collab pass, 2 Nov): the switch covers the owner's own agents and never a colleague's (`bypassOf`). */
  title: 'Let your agents do everything without asking',
  /* ONE LINE EACH (G15): it was two paragraphs under the switch. What still needs him waits behind "What still needs you".
     FULLY INCLUSIVE (2 Nov): team, sharing, keys made, settings, exports and imports all go through now. */
  on: 'Your agents do anything you can do here, without asking: money, settings, add-ons, your team, sharing, making keys, imports and exports. Each change names its agent and can be undone.',
  off: 'Agents ask before deletes, money, keys, add-ons and settings, and after reading things from outside.',
  more: 'What still needs you',
  /* `NEVER_BYPASS` IS THREE DOORS NOW (2 Nov), and the keychain's rule beside them. */
  still: "Three things stay only yours: giving this BrainDog to someone else, deleting the whole BrainDog (or erasing a person for good), and reading a key's value. An agent also never makes or changes an owner, and paying stays in Billing. Your colleagues' agents are never covered: they ask, and never do more than their person may.",
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Only `on` is on. */
export const bypassOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[BYPASS_PREF] === 'on';

/** The sentence under the switch. */
export const bypassSaid = (on: boolean): string => (on ? bypassWords.on : bypassWords.off);
