/**
 * "Agents may answer when you tell them" in Settings > Agents: whether an agent he tells, in the conversation, to answer
 * a question or make a change does it, sending his words with it (`packages/record/src/index.ts`, `wordOf`). PURE, so
 * `node --test` can import it; `OnWord.svelte` draws it.
 *
 * ON UNTIL HE TURNS IT OFF (the owner's decision of 27 October). The record keeps it as the owner's own
 * `agents.answer_on_word` (`setPref`, held to an owner in a browser), so no agent turns it back on for itself.
 */

/** The pref the switch keeps. */
export const ON_WORD_PREF = 'agents.answer_on_word' as const;

export const onWordWords = {
  title: 'Agents answer when you say so',
  /* THE SAME AS THE AGENT IS TOLD (`ON_WORD` in `packages/record/src/methods/agent-profile.ts`): on his word, changes
     and deletes go through; money and keys are asked. NOT "ALWAYS": with "Let agents do everything without asking" on
     (`bypass.ts`), money goes through too, and only what `NEVER_BYPASS` keeps still waits (`BYPASS_SAYS`). */
  on: 'When you tell an agent to, it goes ahead, deletes too, and says it was your word. You can undo it. Money and keys wait for you, unless agents may do everything without asking: then only keys, paying, and deleting or exporting all of BrainDog still wait.',
  off: 'Deletes, money and keys wait for you here, even when you told the agent.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Anything but `false` is on. */
export const onWordOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[ON_WORD_PREF] !== false;

/** The sentence under the switch. */
export const onWordSaid = (on: boolean): string => (on ? onWordWords.on : onWordWords.off);
