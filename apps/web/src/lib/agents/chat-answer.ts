/**
 * "Answer from inside chat apps" in Settings > Agents: whether a press on the decision card inside Claude or ChatGPT
 * answers the question there (`packages/record/src/methods/chat-answer.ts`). PURE, so `node --test` can import it;
 * `ChatAnswer.svelte` draws it.
 *
 * OFF UNTIL HE TURNS IT ON. The record keeps it as the owner's own `agents.answer_in_chat` (`setPref`, held to an owner in
 * a browser), so no agent turns it on for itself. Off, the card's buttons open BrainDog, as they always did.
 */

/** The pref the switch keeps. */
export const CHAT_ANSWER_PREF = 'agents.answer_in_chat' as const;

export const chatAnswerWords = {
  tile: 'Chat apps',
  title: 'Answer from inside chat apps',
  on: 'A question shown in Claude or ChatGPT is answered when you press an option on its card. The chat cannot press for you, and each answer says where it was given.',
  off: 'The card in Claude or ChatGPT shows each option and what it changes. Its buttons open BrainDog, where you answer.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Anything but `true` is off. */
export const chatAnswerOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[CHAT_ANSWER_PREF] === true;

/** The sentence under the switch. */
export const chatAnswerSaid = (on: boolean): string => (on ? chatAnswerWords.on : chatAnswerWords.off);
