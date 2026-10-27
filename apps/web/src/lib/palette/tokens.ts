/**
 * What a plain line in the palette says besides its words: a day, a project, a priority, who holds it and an amount,
 * each read by the field types of the list the line goes into, and each drawn as a chip under the field.
 *
 * TODAY'S LIGHT SYNTAX, NOT A SECOND ONE. "call the bank tomorrow #kiln !urgent" is read by `captureOf` in
 * `work/capture.ts`, the reader Today's line and a page's capture (`page/capture.ts` `readLine`) already use, so a line
 * typed here and a line typed on Home become the same row. `readLine` itself is not imported: it lives beside
 * `capturedFields`, and `rows-write.ts` is loaded on the press, not with the palette (`create.ts`). This runs its steps.
 *
 * WHAT `captureOf` DOES NOT READ IS READ HERE, the same way: `@name` names a person by the start of their name where the
 * list holds a person's link and no agent, and an amount is read only with its currency said (`EGP 450`, `450 EGP`,
 * `£12.50`), since a bare number has no currency and money is never written in a guessed one.
 *
 * EACH CHIP KNOWS WHERE IT WAS TYPED (`from`, `to`), so the text is the line with those words taken out, and a chip given
 * back (`untoken`, Backspace on the field) is its own words again. `keep` names the words given back, which are then
 * left as words however the line goes on.
 *
 * PURE: the declaration, the clock and the names are handed in, so `tokens.test.ts` drives every rule.
 */

import { exponentOf } from 'braindog-render';
import { TITLES } from '../record/held.ts';
import type { Fields, MoneyValue, RegisterDecl } from '../record/schema.ts';
import { captureOf, contextOf, dayOf, daySaid, isQuestion, projectNamed, shapeOf } from '../page/page-writes.ts';

/* THE QUESTION TEST TODAY'S ASK BAR RUNS, handed on so the palette reaches Today's line through this one file. */
export { isQuestion };

/** One thing read off the line: the field it fills, what the chip says, the stored value, and where it was typed. */
export type Chip = {
  kind: 'day' | 'project' | 'priority' | 'agent' | 'person' | 'amount';
  field: string;
  /** What the chip says: the words for a day ("tomorrow"), a project's or a person's name, an amount with its currency. */
  label: string;
  /** The same as a sentence the toast can say: "due Thu 15 Oct". */
  said: string;
  value: Fields[string];
  /** Where in the line it was typed, and the words it was typed as. */
  from: number;
  to: number;
  words: string;
};

export type Tokens = { text: string; chips: Chip[] };

/** The list a line goes into, the time it is read at, and where the names a `#` or an `@` reaches are looked up. */
export type Target = {
  decl: RegisterDecl;
  now: number;
  /** The rows of a list by name, by number. The ones this tab has learnt (`TITLES`) unless handed in. */
  names?: (register: string) => ReadonlyMap<number, string> | undefined;
};

type Tok = { word: string; from: number; to: number };

const toksOf = (line: string): Tok[] => [...line.matchAll(/\S+/gu)].map((m) => ({ word: m[0], from: m.index, to: m.index + m[0].length }));

const namedIn = (names: ReadonlyMap<number, string> | undefined): { seq: number; name: string }[] =>
  [...(names ?? new Map<number, string>())].filter(([, name]) => name !== '').map(([seq, name]) => ({ seq, name }));

/** The words a day may be led by, which go with the day and are not said on its chip. */
const LEADS = new Set(['by', 'due', 'on']);

/* ── amounts ─────────────────────────────────────────────────────────── */

/** The two signs that name one currency. `$` names several, so it is not read. */
const SIGNS: Readonly<Record<string, string>> = { '£': 'GBP', '€': 'EUR' };
const NUMBER = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/u;
const CODE = /^[A-Z]{3}$/u;

/**
 * The places a currency counts in, or `null` for a code nobody issues. The places are the renderer's table
 * (`exponentOf`, 02 §3 rule 1), never CLDR's, so `IQD 1.5` here is what a money cell draws.
 */
function placesOf(code: string): number | null {
  try {
    const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : null;
    if (known && !known.includes(code)) return null;
    return exponentOf(code);
  } catch {
    return null;
  }
}

/** `450`, `1,500` or `12.50` in a currency, as integer minor units, or `null` past the currency's places. */
function moneyOf(digits: string, currency: string): MoneyValue | null {
  const n = NUMBER.exec(digits);
  const places = placesOf(currency);
  if (!n || places === null) return null;
  const [, whole = '', part = ''] = n;
  if (part.length > places) return null;
  const amount = Number(whole.replace(/,/gu, '') + part.padEnd(places, '0'));
  return Number.isSafeInteger(amount) ? { amount, currency } : null;
}

/** An amount as a chip says it: the code and the amount in the currency's own places. */
const moneySaid = (m: MoneyValue): string => {
  const places = placesOf(m.currency) ?? 2;
  return `${m.currency} ${(m.amount / 10 ** places).toLocaleString('en', { minimumFractionDigits: places, maximumFractionDigits: places })}`;
};

/** The first amount among `toks`, said with its currency: the toks it took (one or two) and the value. */
function amountIn(toks: readonly Tok[]): { at: number; n: number; value: MoneyValue } | null {
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i]!.word.replace(/[.,;]$/u, '');
    const next = toks[i + 1]?.word.replace(/[.,;]$/u, '');
    const sign = SIGNS[w.charAt(0)];
    const one =
      (sign ? moneyOf(w.slice(1), sign) : null) ??
      (CODE.test(w.slice(0, 3)) && w.length > 3 ? moneyOf(w.slice(3), w.slice(0, 3)) : null) ??
      (CODE.test(w.slice(-3)) && w.length > 3 ? moneyOf(w.slice(0, -3), w.slice(-3)) : null);
    if (one) return { at: i, n: 1, value: one };
    if (next === undefined) continue;
    const two = CODE.test(w) ? moneyOf(next, w) : CODE.test(next) ? moneyOf(w, next) : null;
    if (two) return { at: i, n: 2, value: two };
  }
  return null;
}

/* ── the line ────────────────────────────────────────────────────────── */

/**
 * A line, read against the list it goes into: its words with what was read taken out, and a chip for each thing read.
 *
 * A LIST WITH NONE OF THE FIELDS READS THE LINE AS ITS WORDS, and a line that would be left with no words is not read at
 * all, as on Today: "tomorrow" alone is a row called tomorrow.
 */
export function tokensOf(line: string, target: Target, keep: readonly string[] = []): Tokens {
  const names = target.names ?? ((register: string) => TITLES.get(register));
  const shape = shapeOf(target.decl);
  const today = dayOf(target.now);
  const projects = shape.project ? namedIn(names(shape.project.to)) : [];
  const ctx = contextOf(shape, today, projects);
  const c = captureOf(line, ctx);
  const toks = toksOf(line);
  const chips: Chip[] = [];

  /* WHAT `captureOf` TOOK OUT, found by walking the line beside the words it kept, which are the line's own in order. */
  const kept = c.text === '' ? [] : c.text.split(' ');
  const out: Tok[] = [];
  const rest: Tok[] = [];
  let j = 0;
  for (const t of toks) {
    if (j < kept.length && t.word === kept[j]) {
      rest.push(t);
      j += 1;
    } else out.push(t);
  }
  const day: Tok[] = [];
  for (const t of out) {
    const lead = t.word.charAt(0);
    if (lead === '#' && c.project !== null && !chips.some((x) => x.kind === 'project') && shape.project) {
      const name = projects.find((p) => p.seq === c.project)?.name ?? t.word.slice(1);
      chips.push({ kind: 'project', field: shape.project.field, label: name, said: name, value: c.project, from: t.from, to: t.to, words: t.word });
    } else if (lead === '!' && c.priority !== null && !chips.some((x) => x.kind === 'priority') && shape.priority) {
      const word = shape.priority.said[c.priority] ?? c.priority;
      chips.push({ kind: 'priority', field: shape.priority.field, label: word, said: word.toLowerCase(), value: c.priority, from: t.from, to: t.to, words: t.word });
    } else if (lead === '@' && c.agent !== null && !chips.some((x) => x.kind === 'agent') && shape.agent) {
      const name = c.agent.charAt(0).toUpperCase() + c.agent.slice(1);
      chips.push({ kind: 'agent', field: shape.agent, label: name, said: name, value: c.agent, from: t.from, to: t.to, words: t.word });
    } else day.push(t);
  }
  if (day.length > 0 && c.due !== null && shape.due) {
    const first = day[0]!;
    const last = day[day.length - 1]!;
    const words = line.slice(first.from, last.to);
    const label = (LEADS.has(first.word.toLowerCase()) && day.length > 1 ? day.slice(1) : day).map((t) => t.word.replace(/[.,;]$/u, '')).join(' ');
    chips.push({ kind: 'day', field: shape.due, label, said: `due ${daySaid(c.due)}`, value: c.due, from: first.from, to: last.to, words });
  }

  /* @NAME FOR A PERSON, where the list holds a person's link and no agent took the word. */
  if (shape.owner && !chips.some((x) => x.kind === 'agent')) {
    const people = namedIn(names(shape.owner.to));
    const at = rest.findIndex((t) => /^@[\p{L}][\p{L}\p{N}_-]*$/u.test(t.word) && projectNamed(t.word.slice(1), people) !== null);
    if (at >= 0 && rest.length > 1) {
      const t = rest[at]!;
      const seq = projectNamed(t.word.slice(1), people)!;
      const name = people.find((p) => p.seq === seq)?.name ?? t.word.slice(1);
      chips.push({ kind: 'person', field: shape.owner.field, label: name, said: name, value: seq, from: t.from, to: t.to, words: t.word });
      rest.splice(at, 1);
    }
  }

  /* AN AMOUNT, where the list holds money: its first money field, the one a list adds first. */
  const money = target.decl.fields.find((f) => f.type === 'money');
  if (money) {
    const found = amountIn(rest);
    if (found && rest.length > found.n) {
      const taken = rest.splice(found.at, found.n);
      const first = taken[0]!;
      const last = taken[taken.length - 1]!;
      const label = moneySaid(found.value);
      chips.push({ kind: 'amount', field: money.id, label, said: label, value: found.value, from: first.from, to: last.to, words: line.slice(first.from, last.to) });
    }
  }

  /* THE WORDS GIVEN BACK STAY WORDS: their chip is dropped and what it took is text again. */
  const given = new Set(keep.map((k) => k.trim().toLowerCase()));
  const read = chips.filter((x) => !given.has(x.words.toLowerCase())).sort((a, b) => a.from - b.from);
  const text = toks
    .filter((t) => !read.some((x) => t.from >= x.from && t.to <= x.to))
    .map((t) => t.word)
    .join(' ');
  return text === '' ? { text: line.trim(), chips: [] } : { text, chips: read };
}

/** A chip given back as words: the line with the chip's own words at its end, which is where a day is read from. */
export function untoken(line: string, chip: Pick<Chip, 'words'>): string {
  const before = line.trimEnd();
  return before === '' ? chip.words : `${before} ${chip.words}`;
}

/** The fields the chips fill, by field: the last chip for a field wins, as the last word typed does. */
export function chipFields(chips: readonly Pick<Chip, 'field' | 'value'>[]): Fields {
  const out: Fields = {};
  for (const c of chips) out[c.field] = c.value;
  return out;
}
