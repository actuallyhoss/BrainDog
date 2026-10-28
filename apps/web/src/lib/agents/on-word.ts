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
  on: 'Each says it was your word, and you can undo it. Money and keys still wait for you.',
  off: 'Agents always ask you here.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Anything but `false` is on. */
export const onWordOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[ON_WORD_PREF] !== false;

/** The sentence under the switch. */
export const onWordSaid = (on: boolean): string => (on ? onWordWords.on : onWordWords.off);
