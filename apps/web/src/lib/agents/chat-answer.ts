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
  title: 'Answer inside Claude and ChatGPT',
  on: "Pressing an option on the card answers it there. The chat can't press it for you.",
  off: 'Pressing an option on the card opens BrainDog, and you answer there.',
} as const;

/** Whether the switch is on, from the person's prefs as `boot` answered them. Anything but `true` is off. */
export const chatAnswerOn = (prefs: Record<string, unknown> | undefined | null): boolean => prefs?.[CHAT_ANSWER_PREF] === true;

/** The sentence under the switch. */
export const chatAnswerSaid = (on: boolean): string => (on ? chatAnswerWords.on : chatAnswerWords.off);
