/**
 * WHO MAY ANSWER A QUESTION, AND THE SENTENCE FOR SOMEBODY WHO MAY NOT, said before they type.
 *
 * DRIVEN, ON 21 SEPTEMBER, on a real self-host with a colleague at `read` and one at `decide`, each
 * invited by email and accepted in their own browser: `/decide` came back at 279 words and 168
 * controls for both of them, 85 of them buttons, **none disabled**, and 17 of those buttons answer a
 * question. The colleague who may not answer pressed `Accept`, typed a reason into "Why, for whoever
 * reads this in six weeks", pressed `Record the decision`, and only then was answered, by the record:
 *
 *   "This needs decide, and you have read access. Ask an owner to raise your access."
 *
 * Two presses and a typed paragraph before the product said no, on the screen whose whole subject is
 * who is allowed to answer. That is the deepest dead end measured anywhere in the product.
 *
 * SO THE HINT IS THE RECORD'S OWN SENTENCE, MOVED EARLIER, and it is not a disabled control with no
 * explanation: `/settings/people` already draws this shape for its last-owner rule — the control is
 * off, and a standing paragraph beside it says why, rather than a refusal arriving after the press.
 * A reader meets the same words whichever way they find out, which is what makes moving them earlier
 * a repair and not a second copy.
 *
 * AND READING IS NOT WITHDRAWN. `read` is what the colleague was invited for, so the questions, the
 * costs, the proposed changes and the reason behind every decision already taken stay on the screen.
 * The last sentence says so, because a screen that goes quiet about what you can still do reads as a
 * door closing.
 *
 * IT IS A MODULE AND NOT A LINE IN THE ROUTE so that `node --test` can read it, and so that
 * `/decide/<id>`, which still walks a reader into the same dead end, can take the same two functions
 * rather than a fourth pattern.
 */

/** The five words `member.level` holds. A level this build does not know reaches nothing. */
const LADDER = ['read', 'append', 'write', 'decide', 'owner'];

/**
 * May this caller record a decision here?
 *
 * `LEVEL_REACH.decide` is the only level below owner that carries the `decide` need, and no token
 * reaches it at all (`packages/record/src/index.ts`), so a browser session at `decide` and an owner
 * are the whole of the answer. `owner` is read separately because `boot` sends both and a shell that
 * ever had one without the other must not cost an owner their own queue.
 */
export const mayAnswer = (level: string, owner: boolean): boolean => owner || level === 'decide';

/**
 * Why not, in the record's words, for the standing hint beside the controls that are off.
 *
 * The first two sentences are `allows`'s own `LEVEL_REQUIRED` string for this need, which is what a
 * press used to earn after the typing. The third is what stays.
 *
 * A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD (`lists`, from the shell's `me.lists`) HAS NO LEVEL
 * TO BE TOLD. The shell's `read` is a fallback for them, and measured through the real seed
 * this hint told a bookkeeper given `write` on one list
 * "you have read access", which is neither their level nor their situation. The record's own refusal
 * for them asks for "a record-wide token", which they were never offered and cannot ask for by that
 * name. So they are told who answers here, and that the questions they see are the ones about what
 * they hold. The lists are counted and not named: the ids are all this function is handed, and an id
 * is the word a colleague was measured being told instead of a name.
 */
export const whyNotAnswering = (level: string, lists: readonly string[] | null = null): string =>
  lists && lists.length > 0
    ? `Answering a question here belongs to somebody who holds all of this BrainDog, and you hold ${
        lists.length === 1 ? 'one list' : `${lists.length} lists`
      } on it. Ask an owner if you should be answering. Reading is not affected: the questions here are the ones about ${
        lists.length === 1 ? 'your list' : 'your lists'
      }, and each of them, with the reason behind every decision, stays open to you.`
    : `${
    LADDER.includes(level) ? `This needs decide, and you have ${level} access.` : 'This needs decide, and your access does not reach it.'
  } Ask an owner to raise your access. Reading is not affected: every question here, and the reason behind every decision, stays open to you.`;
