/**
 * THE FIRST RUN ASKS BACK: at most two short questions, only where the answer changes what is built, and the
 * answer added to what was said as a sentence of its own, so the build is read again with it.
 *
 * THE RULES FIRST, IN CODE, in this order: no name heard, then "What should I call you?"; money kept with no currency,
 * then the currency ask the start pages already have (`currencyChoices`); nothing placed (no use case, no draft, no
 * part), then "What is it closest to?". Then the model's own question from the reading (`SetupReply.ask`), in its
 * words, to a total of two. A model's question about what a rule already asks takes that rule's place in the model's
 * words, never beside it; one about a name or a currency the person already gave is dropped.
 *
 * NEVER ASKED TWICE: a question answered or skipped (`asked`, by what it is about) is not asked again, whatever the next
 * reading says. A question is one line of 120 characters at most and a choice 24; a model's that does not fit is no
 * question, and a currency whose name is longer is shown by its code.
 *
 * TWO, AGAINST "ONE, NEVER TWO": `question.ts` and the sign-up page keep one question, as chosen on 9 October; USE-B06
 * says two. The cap is `most`, two by default as the unit says, so a page keeps one by passing 1.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; `Prompt.svelte` draws what it answers.
 */

import { USE_CASES } from '@braindog/seed/usecases';
import { currencyChoices, words as building, type CurrencyEnv } from '../../routes/start/building.ts';
import { firstRun } from '../first-run.ts';
import type { SetupReply } from './ask.ts';

/** The model's question back, as the reading door answers it (`SetupReply.ask`). */
export type ModelQuestion = NonNullable<SetupReply['ask']>;

/** What a question fills: the three the rules ask, sign-up's where orders come in, and what the model may ask about. */
export type About = 'name' | 'currency' | 'closest' | 'arrivesBy' | ModelQuestion['about'];

/** One answer to tap: the value it fills, and what it is called on screen. */
export type Tap = { value: string; label: string };

/** A question as it is said: what it fills, and its one line of 120 characters at most. */
export type AskLine = { about: About; question: string };

export type Ask = AskLine & {
  /** The answers to tap, 24 characters each at most. A question may be answered by typing too. */
  choices: Tap[];
  /** Whose question it is: the rules' or the model's (said nowhere; a page may weigh it). */
  by: 'rules' | 'model';
};

/** What the reading heard, as each start page holds it. */
export type Reading = {
  /** The person's name, heard or answered. */
  name: string | null;
  /** The record's currency, typed or answered. */
  currency: string | null;
  /** Whether the build keeps amounts (a part that keeps a currency is on). */
  money: boolean;
  /** The use case placed, or none. */
  usecase: string | null;
  /** Whether Slash drafted, or is drafting, a build of its own. */
  draft: boolean;
  /** How many parts are on by hand, where a page counts them; none placed is nothing to place. */
  parts?: number;
  /** The model's question or questions from the reading. */
  ask?: ModelQuestion | readonly ModelQuestion[] | null;
};

export type QuestionsWith = {
  /** The device's currencies (`browserCurrencyEnv`); without it the currency is asked with no taps, and typed. */
  env?: CurrencyEnv | null;
  /** How many at once: two by default. */
  most?: number;
  /** A page's own rule questions, asked after these three and before the model's (sign-up's where orders come in). */
  also?: readonly Ask[];
};

/** The words this part says. */
export const words = {
  /* The name question in the words of the one-question screen (`nameQuestion`, held equal by the test). */
  name: 'What should I call you?',
  one: building.oneQuestion,
  two: 'Two questions',
  cannotTell: building.cannotTell,
  cannotTellTwo: 'your words cannot tell me these',
  answer: 'Your answer',
  add: 'Add',
  skip: 'Skip',
};

export const QUESTION_MOST = 120;
export const CHOICE_MOST = 24;

const fits = (s: string, most: number): boolean => s !== '' && !/[\r\n]/u.test(s) && [...s].length <= most;

/** The model's question held to what the screen can say, or `null`. */
function heldModel(q: ModelQuestion): Ask | null {
  const question = q.question.trim();
  if (!fits(question, QUESTION_MOST)) return null;
  const choices: Tap[] = [];
  for (const c of q.choices) {
    const t = c.trim();
    if (fits(t, CHOICE_MOST) && !choices.some((x) => x.value === t)) choices.push({ value: t, label: t });
  }
  return { about: q.about, question, choices, by: 'model' };
}

/** The questions to ask now, the rules' first and then the model's, at most `most`, none already asked. */
export function questionsOf(reading: Reading, said: string, asked: Iterable<string> = [], opts: QuestionsWith = {}): Ask[] {
  const done = new Set(asked);
  const most = Math.max(0, opts.most ?? 2);
  const rules: Ask[] = [];
  if (reading.name === null || reading.name.trim() === '') rules.push({ about: 'name', question: words.name, choices: [], by: 'rules' });
  if (reading.money && reading.currency === null) {
    const c = opts.env ? currencyChoices(said, opts.env) : null;
    const choices = (c?.choices ?? []).map((x) => ({ value: x.code, label: fits(x.name, CHOICE_MOST) ? x.name : x.code }));
    rules.push({ about: 'currency', question: firstRun.currencyQuestion, choices, by: 'rules' });
  }
  if (reading.usecase === null && !reading.draft && (reading.parts ?? 0) === 0) {
    rules.push({ about: 'closest', question: building.closest, choices: USE_CASES.map((u) => ({ value: u.usecase, label: u.title })), by: 'rules' });
  }
  for (const a of opts.also ?? []) if (!rules.some((r) => r.about === a.about)) rules.push(a);
  const out = rules.filter((r) => !done.has(r.about));
  const model = reading.ask == null ? [] : Array.isArray(reading.ask) ? (reading.ask as readonly ModelQuestion[]) : [reading.ask as ModelQuestion];
  for (const m of model) {
    if (done.has(m.about)) continue;
    if (m.about === 'name' && reading.name !== null && reading.name.trim() !== '') continue;
    if (m.about === 'currency' && reading.currency !== null) continue;
    const q = heldModel(m);
    if (q === null) continue;
    const at = out.findIndex((r) => r.about === q.about);
    /* IN THE MODEL'S WORDS, IN THE RULE'S PLACE: a currency keeps the rule's taps, which are codes this device knows. A
       second model question about the same thing is the first one again, and the first is kept. */
    if (at >= 0 && out[at]!.by === 'rules') out[at] = { ...out[at]!, question: q.question, choices: q.about === 'currency' && out[at]!.choices.length > 0 ? out[at]!.choices : q.choices };
    else if (at < 0) out.push(q);
  }
  return out.slice(0, most);
}

/** Whether a code is a currency this runtime knows; without the list, any three capitals. */
function knownCode(code: string): boolean {
  const list = (Intl as { supportedValuesOf?: (key: 'currency') => string[] }).supportedValuesOf;
  return /^[A-Z]{3}$/u.test(code) && (typeof list !== 'function' || list('currency').includes(code));
}

/**
 * WHAT AN ANSWER LAYS ON THE READING, or `null` for nothing: a tap or a typed word that names a choice (by its value or
 * its label, any case) is that choice's value. A currency is a code or nothing, so "Euro" typed under the device's
 * Euro is EUR and "dollars" with no such tap lays nothing on (the sentence still goes, and the reading may hear it). A
 * use case is one of the taps or nothing. Any other answer is its own words.
 */
export function valueOf(question: Ask, answer: string): string | null {
  const a = plain(answer);
  if (a === '') return null;
  const low = a.toLocaleLowerCase();
  const c = question.choices.find((x) => x.value.toLocaleLowerCase() === low || x.label.toLocaleLowerCase() === low);
  if (question.about === 'currency') {
    const code = (c?.value ?? a).toUpperCase();
    return knownCode(code) ? code : null;
  }
  if (question.about === 'closest') return c?.value ?? null;
  return c?.value ?? a;
}

/** A question about what something is called here ("What are your students called here?"). */
const CALLED = /\bcalled\b/iu;

/** The words of an answer, on one line, with no full stop of its own. */
const plain = (s: string): string => s.replace(/\s+/gu, ' ').trim().replace(/[.!,;:]+$/u, '');

/**
 * THE ANSWER AS A SENTENCE OF ITS OWN, to add to what was said ("Call me Mara.", "They are called Pupils."). `answer`
 * is what was typed or the tap's label; nothing answered is an empty string, and nothing is added.
 */
export function answerAsSaid(question: AskLine, answer: string): string {
  const a = plain(answer);
  if (a === '') return '';
  switch (question.about) {
    case 'name':
      return `Call me ${a}.`;
    case 'currency':
      return `My money is in ${a}.`;
    case 'closest':
      return `It is closest to ${a}.`;
    case 'who_for':
      return `It is for ${a}.`;
    default:
      /* WHAT THEIR THINGS ARE CALLED, by the question's own word, and any other the question with its answer, so the
         next reading knows what the answer answers. */
      if (CALLED.test(question.question)) return `They are called ${a}.`;
      return `${plain(question.question)}${/[?]$/u.test(question.question.trim()) ? '' : '?'} ${a}.`;
  }
}
