/**
 * What a question offers, what pressing one of its options records, and what taking it back gives
 * you.
 *
 * IT IS HERE BECAUSE THE PRESS MOVED. Until this file existed, the options on `/decide` were one
 * `<span class="q-options">` printing three titles joined with a middle dot, INSIDE the card's own
 * link. Three things that read as three choices and behaved as one, because clicking any of them
 * landed on `/decide/<id>` with nothing selected. Answering meant a second screen and a paragraph of
 * prose before the button would turn on, one of the ten things that cost a person the most.
 *
 * The card now presses. Which means three facts stopped being decoration and started being logic:
 * WHICH options a question offers, WHAT one press records, and WHAT the inverse restores. All three
 * are arithmetic over a `Question`, none of them needs a browser, and every one of them is a place
 * where a wrong answer would be silent: an option pressed on a stale card writing the wrong key, an
 * undo that leaves a neighbour's answer behind. So they are functions with a test file rather than
 * expressions inside a `{#each}`.
 *
 * NOTHING HERE WRITES. An `Answer` is the shape a press takes before `decide-write.ts` sends it to the
 * record. It was also the sample's receipt: `wouldRecord` said what the record "would" have gained,
 * toasted on a Decide drawn from the sample, and went when the sample did.
 */

import type { Question } from './schema.ts';

/**
 * One option, as a card offers it.
 *
 * `recommended` IS A REQUIRED BOOLEAN HERE and optional on the seed. `exactOptionalPropertyTypes`
 * makes `recommended?: boolean` and `recommended: boolean | undefined` different types, and every
 * caller of this wants the question answered rather than the property tested.
 *
 * `n` is the option's place in the list, 1-based, which is the number `/decide/<id>` binds to the
 * number keys. It travels with the option so the two screens cannot disagree about which option is
 * the second one.
 */
export type Offered = {
  key: string;
  title: string;
  body: string;
  n: number;
  recommended: boolean;
};

/**
 * What one press records.
 *
 * `title` IS RESOLVED AT THE PRESS and kept, rather than looked up again when the answer is drawn.
 * The card says "Answered: Per product" from this field, and a receipt that re-reads the question to
 * find out what it is about is a receipt that changes its story if the question does.
 *
 * `reason` is empty until somebody writes one, and an answer with an empty reason is a complete
 * answer. That is the design decision this whole change turns on and `/decide/+page.svelte` argues
 * it where a reader will meet it.
 */
export type Answer = {
  /** The question's id, which is also this answer's key in the map. */
  question: string;
  option: string;
  title: string;
  reason: string;
  at: string;
  by: string;
};

/**
 * Twenty-five characters, which is the floor `/decide/<id>` has always used to decide whether a
 * reason is a sentence or a keystroke. It is not a gate on either screen: it is what turns the note
 * under the field from "there is no reason" into "there is one, and it will not survive six weeks".
 */
export const REASON_FLOOR = 25;

export type ReasonState = 'missing' | 'thin' | 'written';

export function reasonState(reason: string): ReasonState {
  const said = reason.trim();
  if (said === '') return 'missing';
  return said.length < REASON_FLOOR ? 'thin' : 'written';
}

/**
 * The options a question OFFERS, which is not always the options it lists.
 *
 * A DECIDED QUESTION OFFERS NOTHING. Its row is immutable and its options are history, so the card
 * for one prints them and presses nothing. `/decide` only lists open questions today, so this guard
 * buys nothing on the screen as it stands; it is here because the alternative is that the day the
 * decided ledger grows a card, the buttons come with it and the first press writes over a settled
 * row.
 */
export function optionsOf(q: Question | undefined): Offered[] {
  if (!q || q.decided) return [];
  return q.options.map((o, i) => ({
    key: o.key,
    title: o.title,
    body: o.body,
    n: i + 1,
    recommended: o.recommended === true,
  }));
}

/**
 * The answer a press would record, or nothing.
 *
 * NOTHING, RATHER THAN A GUESS, when the key is not one this question offers. The caller is a
 * button drawn from `optionsOf` and so the miss should be impossible; the case it actually catches
 * is a key that arrived from somewhere else: a stale render, a keyboard shortcut, a URL. The
 * alternative to returning null there is an `Answer` naming an option that does not exist, which no
 * screen would show as wrong.
 */
export function answerFor(q: Question | undefined, key: string, at: string, by = 'you'): Answer | null {
  const offered = optionsOf(q).find((o) => o.key === key);
  if (!q || !offered) return null;
  return { question: q.id, option: offered.key, title: offered.title, reason: '', at, by };
}

/* ── the map of answers, and its inverse ──────────────────────────────────── */

/**
 * A NEW MAP EVERY TIME, never a mutation of the one passed in.
 *
 * Svelte 5's `$state` proxies objects and arrays and NOT `Map`, so a screen holding one re-assigns
 * it to re-render, and `receipts = new Map(receipts).set(…)` is the same shape on the register grid.
 * A helper that mutated in place would work in a test and draw nothing in a browser.
 */
export function record(answers: ReadonlyMap<string, Answer>, a: Answer): Map<string, Answer> {
  return new Map(answers).set(a.question, a);
}

/**
 * Take one answer back.
 *
 * THIS IS THE UNDO, AND IT IS THE WHOLE ARGUMENT FOR THE PRESS BEING ONE PRESS.
 * There are no confirmation dialogs in this product, because a dialog asks its question before
 * anything has happened, when the reader knows the least they ever will, and the answer is always
 * yes. Of eighty-five human writes over thirteen days in the record this product is modelled on,
 * thirteen reversed the write immediately before them and twelve of those landed inside five
 * seconds, because the row vanished and the only way to check you had hit the right one was to do
 * the opposite and look.
 *
 * So the answer is cheap to make and free to take back, and the card it was made on does not move.
 * Everything else in the map is untouched: undoing SG31 has nothing to say about SG29.
 */
export function withdraw(answers: ReadonlyMap<string, Answer>, question: string): Map<string, Answer> {
  const next = new Map(answers);
  next.delete(question);
  return next;
}

/**
 * Write the reason onto an answer that already exists, and do nothing at all when it does not.
 *
 * UNTRIMMED, DELIBERATELY. This is bound to a field somebody is typing in, and a helper that trimmed
 * on the way in would eat the space between two words the moment it was pressed. `reasonState` trims
 * when it reads.
 */
export function setReason(
  answers: ReadonlyMap<string, Answer>,
  question: string,
  reason: string,
): Map<string, Answer> {
  const held = answers.get(question);
  if (!held) return new Map(answers);
  return new Map(answers).set(question, { ...held, reason });
}
