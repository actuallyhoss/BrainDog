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
  /* ONE SHORT LINE EACH (UI pass, 3 Nov): the on line listed nine kinds of change in one sentence, two lines on a desk and
     four on a phone. "Anything you can" says it; what still needs him is one press away. */
  on: 'They do anything you can, without asking. Each change names its agent and can be undone.',
  /* "PLUGINS" IS WHAT A PERSON READS (3 Nov), where the code still says add-on. */
  off: 'They ask before deletes, money, keys, plugins and settings.',
  more: 'What still needs you',
  /* `NEVER_BYPASS` IS THREE DOORS NOW (2 Nov), and the keychain's rule beside them. */
  still: "Three things stay only yours: giving this BrainDog to someone else, deleting the whole BrainDog (or erasing a person for good), and reading a key's value. An agent also never makes or changes an owner, and paying stays in Billing. Your colleagues' agents are never covered: they ask, and never do more than their person may.",
  /* THE SAME, AS A LIST (UI pass, 3 Nov): a paragraph of five things is read as a list, so it is drawn as one. */
  stillList: [
    'Giving this BrainDog to someone else',
    'Deleting the whole BrainDog, or erasing a person for good',
    "Reading a key's value",
    'Making or changing an owner',
    'Paying, which stays in Billing',
  ],
  colleagues: "Your colleagues' agents still ask, and never do more than their person may.",
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Only `on` is on. */
export const bypassOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[BYPASS_PREF] === 'on';

/** The sentence under the switch. */
export const bypassSaid = (on: boolean): string => (on ? bypassWords.on : bypassWords.off);
