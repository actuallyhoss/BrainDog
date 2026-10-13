/**
 * The briefing's cards (ENG-B12): what Today opens on, a few lines that say what matters and each open the thing they
 * are about.
 *
 * Pure: nothing here reads a table or asks a model. A caller gathers the facts (what is late, what is asked, what a
 * run left, what is due, what went wrong, what changed), `briefCandidates` ranks them and cuts them to what one ask
 * holds, and a model picks, orders and writes one line a card. Its answer is kept card by card (`briefOf`) only where
 * the card names a fact it was handed and types no number: a figure is a `{{hole}}` filled here from the fact's own
 * figures, so a line can never say an amount the record does not hold. With no model, or none of its cards kept, the
 * rules say the top few in their own sentences (`rulesBrief`), which is the briefing a record with no model reads.
 */

import { HEADLINE_MOST, SYSTEM_WORDS, hashOf, holesOf, numbersIn } from './headlines.ts';

/** What a fact is: late, a question (said `asked`), a run that left a next step, due within seven days, an exception, or changed since the reader looked. */
export const BRIEF_KINDS = ['late', 'asked', 'exception', 'step', 'due', 'changed'] as const;
export type BriefKind = (typeof BRIEF_KINDS)[number];

/**
 * How pressing each kind is, on the board's own scale (the kernel's `RANK` in `compose.ts`: late 4, needs 3, changed
 * 2), said here so this file imports no package's index; `briefing.test.ts` holds the two to one answer. Kinds of one
 * rank fall in `BRIEF_KINDS`' order.
 */
export const BRIEF_RANK: Readonly<Record<BriefKind, number>> = { late: 4, asked: 3, exception: 3, step: 2, due: 2, changed: 2 };

/** At most this many facts go into the one ask. */
export const BRIEF_FACTS_MOST = 30;

/** At most this many cards make a briefing. */
export const BRIEF_CARDS_MOST = 7;

/** How many cards the rules say when no model does. */
export const BRIEF_RULES_MOST = 5;

/** A card's line is a headline's length: what fits on a phone. */
export const BRIEF_LINE_MOST = HEADLINE_MOST;

/**
 * One thing worth saying. `h` is the handle the model names it by, never shown. `title` is the person's own name for
 * it. `figures` are the values a line may say, each as a person reads it, by the name a hole asks for it: `count` (how
 * many questions one cause raised), `days`, `amount`, `when` (words such as "tomorrow" or "on Friday") and `next` (the
 * step a run left) are the ones the rules' sentences read. `row` is what the card opens, a handle and never shown.
 * `cause` is what raised a question, so the questions of one cause are one card. `rank` is how pressing it is
 * (`BRIEF_RANK` for its kind, unless the gatherer knows better).
 */
export type BriefFact = {
  h: string;
  kind: BriefKind;
  title: string;
  figures: Record<string, string>;
  row: string;
  cause: string | null;
  rank: number;
};

/** One card of a briefing: the fact it is about, its line as it is read, the row it opens, and who wrote the line. */
export type BriefCard = { h: string; line: string; row: string; cause: string | null; by: 'slash' | 'rule' };

/** A briefing as the read answers it: its cards, when it was written, and the hash of the facts it was written from. */
export type Brief = { cards: BriefCard[]; at: string; basis: string };

/** What the model answers: the cards it picked, in its order, each one line with holes. */
export type BriefAnswer = { cards: { h: string; line: string }[] };

const kindAt = (kind: BriefKind): number => BRIEF_KINDS.indexOf(kind);

/** How many questions a fact stands for: its own `count` once gathered, else one. */
const countOf = (f: BriefFact): number => {
  const n = Number(f.figures.count);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/**
 * The facts one ask is handed: the questions of one cause made one fact with their count, the most pressing first
 * (rank, then kind, then title, then handle, so the order never depends on how they were gathered), `BRIEF_FACTS_MOST`
 * at most. Gathering what was already gathered changes nothing.
 */
export function briefCandidates(facts: readonly BriefFact[]): BriefFact[] {
  const sorted = [...facts].sort(
    (a, b) => b.rank - a.rank || kindAt(a.kind) - kindAt(b.kind) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0),
  );
  const out: BriefFact[] = [];
  const asked = new Map<string, number>();
  for (const f of sorted) {
    if (f.kind !== 'asked' || f.cause === null) {
      out.push(f);
      continue;
    }
    /* THE FIRST QUESTION OF A CAUSE IS THE MOST PRESSING ONE, so it is the card: its handle, its title, its row. */
    const at = asked.get(f.cause);
    if (at === undefined) {
      asked.set(f.cause, out.length);
      out.push({ ...f, figures: { ...f.figures, count: String(countOf(f)) } });
    } else {
      const first = out[at]!;
      out[at] = { ...first, figures: { ...first.figures, count: String(countOf(first) + countOf(f)) } };
    }
  }
  return out.slice(0, BRIEF_FACTS_MOST);
}

/** The hash of what a briefing was written from. It moves when a fact's name, figures, row or cause does, and not with the order they were gathered in. */
export function briefBasis(facts: readonly BriefFact[]): string {
  const said = briefCandidates(facts).map((f) => [f.kind, f.title, Object.keys(f.figures).sort().map((k) => [k, f.figures[k]]), f.row, f.cause]);
  return hashOf(JSON.stringify(said));
}

/** A figure a sentence may say, or `undefined` when the fact holds none by that name. */
const figureOf = (f: BriefFact, name: string): string | undefined => {
  const v = f.figures[name]?.trim();
  return v === undefined || v === '' ? undefined : v;
};

const HOLE = /\{\{\s*([^{}\s]+)\s*\}\}/gu;

/** A card's line as it is read: each hole filled from the fact's own figures. */
const filled = (line: string, fact: BriefFact): string => line.replace(HOLE, (_, name: string) => figureOf(fact, name) ?? '').trim();

/** Why one card of an answer is not kept, in a sentence for the log, or `null`. */
function cardFault(card: unknown, byHandle: ReadonlyMap<string, BriefFact>): string | null {
  if (card === null || typeof card !== 'object' || Array.isArray(card)) return 'A card of the briefing was not a card.';
  const { h, line: raw } = card as { h?: unknown; line?: unknown };
  const fact = typeof h === 'string' ? byHandle.get(h) : undefined;
  if (fact === undefined) return 'A card of the briefing named something the model was not handed.';
  if (typeof raw !== 'string' || raw.trim() === '') return `The model wrote no line for ${fact.title}.`;
  const line = raw.trim();
  const missing = holesOf(line).find((name) => figureOf(fact, name) === undefined);
  if (missing !== undefined) return `The line for ${fact.title} asked for a figure, ${missing}, that it does not hold.`;
  /* WHAT THE MODEL TYPED is the line with its holes taken out: the holes are filled here, from the record. */
  const typed = line.replace(HOLE, ' ');
  if (/[\n\r{}[\]*`<>]/u.test(typed) || !/\p{L}/u.test(typed)) return `The line for ${fact.title} was not one plain sentence.`;
  /* A NAME OF THEIR OWN MAY HOLD A DIGIT OR A SYSTEM WORD, "Q3 return" or "Fix the rows", and saying it is naming
     their thing: what is checked is the line with the name it was handed taken out. */
  const own = fact.title.trim() === '' ? typed : typed.split(fact.title).join(' ');
  /* A NUMBER IS A HOLE OR IT IS A FAULT, in digits or in words, as a headline's is (`headlineFault`): a number the fact
     does hold can still sit in a wrong sentence, "two days late" beside two questions, so the record writes every one. */
  if (/\d/u.test(own) || numbersIn(own).length > 0) return `The line for ${fact.title} typed a number rather than leaving a hole for it.`;
  if (SYSTEM_WORDS.test(own)) return `The line for ${fact.title} used the system's words rather than the person's.`;
  if (filled(line, fact).length > BRIEF_LINE_MOST) return `The line for ${fact.title} was longer than ${BRIEF_LINE_MOST} characters.`;
  return null;
}

/** The cards of an answer, or `null` for an answer that holds none. */
const cardsOf = (answer: unknown): unknown[] | null => {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return null;
  const { cards } = answer as { cards?: unknown };
  return Array.isArray(cards) ? cards : null;
};

const byHandleOf = (handed: readonly BriefFact[]): Map<string, BriefFact> => new Map(handed.map((f) => [f.h, f]));

/**
 * Why a model's briefing is not what was asked for, in a sentence for the log, or `null` when all of it stands: every
 * card names a fact it was handed and no fact twice, no number is typed (in digits or in words), there are `BRIEF_CARDS_MOST` cards at most, each line is one plain sentence of `BRIEF_LINE_MOST` characters at
 * most once its holes are filled, and none uses the system's words.
 */
export function briefFault(answer: unknown, handed: readonly BriefFact[]): string | null {
  const cards = cardsOf(answer);
  if (cards === null || cards.length === 0) return 'The model wrote no briefing.';
  if (cards.length > BRIEF_CARDS_MOST) return `The briefing had more than ${BRIEF_CARDS_MOST} cards.`;
  const byHandle = byHandleOf(handed);
  const seen = new Set<string>();
  for (const card of cards) {
    const fault = cardFault(card, byHandle);
    if (fault !== null) return fault;
    const { h } = card as { h: string };
    if (seen.has(h)) return `The briefing said ${byHandle.get(h)!.title} twice.`;
    seen.add(h);
  }
  return null;
}

/**
 * The cards of a model's answer that pass, in its order, with their holes filled: a card at fault is left out and the
 * rest stand, a fact said twice is kept once, and nothing past `BRIEF_CARDS_MOST` is kept. Empty when none passes.
 */
export function briefOf(answer: unknown, handed: readonly BriefFact[]): BriefCard[] {
  const byHandle = byHandleOf(handed);
  const out: BriefCard[] = [];
  for (const card of cardsOf(answer) ?? []) {
    if (out.length === BRIEF_CARDS_MOST) break;
    if (cardFault(card, byHandle) !== null) continue;
    const { h, line } = card as { h: string; line: string };
    if (out.some((c) => c.h === h)) continue;
    const fact = byHandle.get(h)!;
    out.push({ h, line: filled(line, fact), row: fact.row, cause: fact.cause, by: 'slash' });
  }
  return out;
}

/** How a sentence that closes on a quoted name ends: a question's own mark closes it, and anything else takes a full stop. */
const ends = (name: string): string => (/[?!]$/u.test(name) ? '' : '.');

const daysOf = (n: string): string => `${n} ${n === '1' ? 'day' : 'days'}`;

/**
 * The sentences the rules can say of one fact, the fullest first and the plainest last, each a function of the name
 * so a long name can be cut to fit and the sentence never is.
 */
function sentencesOf(f: BriefFact): ((name: string) => string)[] {
  const amount = figureOf(f, 'amount');
  const days = figureOf(f, 'days');
  const when = figureOf(f, 'when');
  const next = figureOf(f, 'next')?.replace(/[.!?]+$/u, '');
  const named = (name: string): string => (amount === undefined ? name : `${name} (${amount})`);
  switch (f.kind) {
    case 'late':
      return [...(days === undefined ? [] : [(n: string) => `${named(n)} is ${daysOf(days)} late.`]), (n) => `${named(n)} is late.`, (n) => `${n} is late.`];
    case 'asked':
      return countOf(f) > 1
        ? [(n) => `${countOf(f)} questions wait on you, starting with "${n}"${ends(n)}`]
        : [(n) => `A question waits on you: "${n}"${ends(n)}`];
    case 'exception':
      return [(n) => `${n} needs a look.`];
    case 'step':
      return [...(next === undefined ? [] : [(n: string) => `${n} left a next step: ${next}.`]), (n) => `${n} left a next step for you.`];
    case 'due':
      return [
        ...(when === undefined ? [] : [(n: string) => `${named(n)} is due ${when}.`]),
        ...(days === undefined ? [] : [(n: string) => `${named(n)} is due in ${daysOf(days)}.`]),
        (n) => `${n} is due within a week.`,
      ];
    case 'changed':
      return [(n) => `${n} changed since you last looked.`];
  }
}

/** The rules' own sentence for one fact: the fullest that fits a line, or the plainest with the name cut to fit. */
function ruleLine(f: BriefFact): string {
  /* A NAME IS SAID AS ONE RUN OF WORDS: a break in it would break the line, and a question keeps its mark. */
  const name = f.title.replace(/\s+/gu, ' ').trim().replace(f.kind === 'asked' ? /\.+$/u : /[.!]+$/u, '');
  const forms = sentencesOf(f);
  const whole = forms.map((say) => say(name)).find((s) => s.length <= BRIEF_LINE_MOST);
  if (whole !== undefined) return whole;
  const plain = forms[forms.length - 1]!;
  const room = Math.max(1, BRIEF_LINE_MOST - plain('').length - 1);
  /* Cut by character, never through the middle of one. */
  let cut = '';
  for (const ch of name) {
    if (cut.length + ch.length > room) break;
    cut += ch;
  }
  return plain(`${cut.trimEnd()}…`);
}

/**
 * The briefing with no model: the `BRIEF_RULES_MOST` most pressing facts, each in the rules' own sentence and opening
 * its row. This is what a record with no model reads, and what stands when none of a model's cards is kept.
 */
export function rulesBrief(facts: readonly BriefFact[]): BriefCard[] {
  return briefCandidates(facts)
    .slice(0, BRIEF_RULES_MOST)
    .map((f) => ({ h: f.h, line: ruleLine(f), row: f.row, cause: f.cause, by: 'rule' as const }));
}

/**
 * The whole briefing from what was gathered and what a model answered (`null` when none was asked): the model's cards
 * where at least one passes, else the rules', written `at` an instant and kept with the basis it was written from.
 */
export function briefFrom(answer: unknown, facts: readonly BriefFact[], at: string): Brief {
  const handed = briefCandidates(facts);
  const said = answer === null || answer === undefined ? [] : briefOf(answer, handed);
  return { cards: said.length > 0 ? said : rulesBrief(handed), at, basis: briefBasis(handed) };
}
