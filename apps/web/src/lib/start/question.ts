/**
 * THE ONE QUESTION THE FIRST RUN ASKS, about what it could not guess from what was said (use case 6, step 3).
 *
 * ONE, NEVER TWO (his word of 9 October, over USE-B06's "up to two"): a first run that asks back becomes an interview.
 * So the rules pick the one that changes the most, in this order, and ask nothing when nothing is missing:
 *
 * 1. THE CURRENCY, where an amount was typed with none: an amount is not kept without one (`shape.ts`), and a currency
 *    is never guessed from a place. The choices are the ones the device and the words point at (`currencyChoices`).
 * 2. WHERE A SHOP'S ORDERS COME IN, where the build makes a list of orders: messages forwarded, a website or shop app,
 *    or in person. Each answer says what it means, so the person knows what they chose.
 * 3. WHAT TO CALL THEM, where no name was heard: the first entry in People is them (USE-B06).
 *
 * THE ANSWER IS A VALUE ON THE PROPOSAL (`answer`), never a write. Nothing is kept until the person keeps it all.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { currencyChoices, type CurrencyEnv } from '../../routes/start/building.ts';
import { firstRun } from '../first-run.ts';
import { closeOver } from '../shape.ts';
import { hear, PEOPLE } from '../who.ts';
import { knownCurrency } from './lists.ts';
import { placesOf, titleOf, YOU, type Answers, type ArrivesBy, type HeardLine, type Proposal } from './propose.ts';

/** One answer the person can tap: what it is called, and what choosing it means. */
export type Choice = { value: string; label: string; means: string | null };

export type Question = {
  /** Which answer it fills (`Answers`). */
  about: keyof Answers;
  question: string;
  /** The answers to tap. None for a name, which is typed. */
  choices: Choice[];
  /** The choice suggested, where a fact points at one (the currency the device keeps). */
  suggested: string | null;
  /** A word the person typed to search the currencies for, where it named several ("pounds"). */
  find: string | null;
  /** Said under the question, so the person knows nothing else will be asked. */
  only: string;
};

/** The words this screen says. */
export const words = {
  only: 'That is the only question. Everything else came from what you wrote.',
  arrivesQuestion: 'Where do your orders come in?',
  arrives: [
    { value: 'messages', label: 'Messages, like WhatsApp or Instagram', means: 'Forward one, and it becomes an order.' },
    { value: 'app', label: 'A website or shop app', means: 'Connect it, and orders arrive by themselves.' },
    { value: 'in-person', label: 'In person', means: 'Say them here, the way you would tell a friend.' },
  ] satisfies (Choice & { value: ArrivesBy })[],
  nameQuestion: 'What should I call you?',
};

/** The list a shop's orders are kept in, as the Shop use case declares it. */
const ORDERS = 'orders';

/**
 * The one question to ask, or `null` when nothing is missing or it was already asked. `said` is what was typed, for the
 * currency words in it; `env` is the browser's (`browserCurrencyEnv`), and without one the currency is searched for.
 */
export function oneQuestion(p: Proposal, said = '', env: CurrencyEnv | null = null): Question | null {
  if (p.answers !== undefined) return null;
  const ask = (about: keyof Answers, question: string, choices: Choice[], suggested: string | null = null, find: string | null = null): Question => ({
    about,
    question,
    choices,
    suggested,
    find,
    only: words.only,
  });
  if (p.currency === null && p.heard.some((h) => h.loose === true)) {
    const c = env === null ? null : currencyChoices(said, env);
    return ask('currency', firstRun.currencyQuestion, (c?.choices ?? []).map((x) => ({ value: x.code, label: x.name, means: x.why })), c?.suggested ?? null, c?.find ?? null);
  }
  if (p.places.some((x) => x.kind === 'list' && x.id === ORDERS)) return ask('arrivesBy', words.arrivesQuestion, words.arrives.map((x) => ({ ...x })));
  if (p.name === null) return ask('name', words.nameQuestion, []);
  return null;
}

/**
 * THE PROPOSAL WITH THE ANSWER ON IT, written nowhere. `null` is the question skipped: it is not asked again, and
 * nothing is filled. A name answered is the person, the first entry in People, and People comes with it; a currency is
 * the record's; where orders come in is kept for the build to keep as a preference. An answer that is not one of the
 * choices (a currency this browser does not know, an empty name) is the question skipped.
 *
 * ONLY THE QUESTION ASKED IS ANSWERED, and only once: an answer to another question, or a second answer, leaves the
 * proposal as it was, so two answers are never on it at once.
 */
export function answer(p: Proposal, about: keyof Answers, value: string | null, said = ''): Proposal {
  if (oneQuestion(p, said)?.about !== about) return p;
  const v = value?.trim() ?? '';
  if (about === 'arrivesBy') {
    const by = words.arrives.find((x) => x.value === v)?.value;
    return { ...p, answers: by === undefined ? {} : { arrivesBy: by } };
  }
  if (about === 'currency') {
    const code = v.toUpperCase();
    return knownCurrency(code) ? { ...p, currency: p.currency ?? code, answers: { currency: code } } : { ...p, answers: {} };
  }
  if (v === '' || v.length > 60) return { ...p, answers: {} };
  const you: HeardLine = { phrase: v, became: YOU, you: true };
  const out = { ...p, name: v, modules: closeOver([...p.modules, PEOPLE]), heard: [you, ...p.heard.filter((h) => h.you !== true)] };
  return { ...out, title: p.title ?? titleOf(hear(said).bio, v, p.rows), places: placesOf(out), answers: { name: v } };
}
