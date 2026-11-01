/**
 * The name in the first run's one sentence, "Who are you?", read without a model; the rest of the sentence is read by `start/propose.ts`.
 *
 * DETERMINISTIC ON PURPOSE: the answer becomes the first People row, and a wrong guess about a name is
 * worse than no guess. So a name is only taken
 * where the sentence puts one unmistakably, and everything after it is kept verbatim as the bio.
 * The screen shows what was heard before anything is written, so a miss costs one edit.
 *
 * A plain `.ts` so `node --test` can hold it; the screen only calls it.
 */

export type Heard = { name: string | null; bio: string };

/** What `meet` is sent from onboarding. */
export type Introduction = { name: string; email?: string; where: 'onboarding' };

/* A capitalised word, any script: `Sami`, `Élodie`, `O'Neill`, `Jean-Luc`. */
const CAP = "\\p{Lu}[\\p{L}\\p{M}'’.-]*";
/* Any word, for the one place a lowercase name is taken: before a comma at the very start. */
const WORD = "\\p{L}[\\p{L}\\p{M}'’.-]*";

/* A word before another word of the name has no full stop in it, unless it is an initial: "S. Marchetti" is one name,
   and "I'm Tom. We run a shop" is Tom, not "Tom. We". */
const LEADING = "(?:\\p{Lu}\\.|\\p{Lu}[\\p{L}\\p{M}'’-]*)";
/* Up to three words, and never the pronoun `I` as the second or third: "I'm Sami I freelance". */
const NAME = `(?:${LEADING}\\s+(?!I\\b)){0,2}${CAP}`;

const GREETING = /^(?:hi|hello|hey)\b[\s,.!]*/iu;
/* Case spelled out rather than the `i` flag, which would let `\p{Lu}` match lowercase letters and
   read "I'm part of a team" as somebody called Part. */
const SAYS_NAME = new RegExp(`^(?:[Ii]['’]?m|[Ii] am|[Mm]y name is|[Tt]his is)\\s+(${NAME})(?=$|[\\s,.;:!])`, 'u');
/* A DASH PARTS A NAME FROM THE REST ONLY WITH A SPACE BEFORE IT ("Nour - designer"): inside a word it joins ("We're a
   two-person startup" named somebody "We're a two", 1 Nov). */
const BEFORE_COMMA = new RegExp(`^(${WORD}(?:\\s+${WORD}){0,2})(?:\\s*[,;:]|\\s+[–-])\\s*`, 'u');
const BEFORE_I = new RegExp(`^(${NAME})\\s+(?=I\\b)`, 'u');
const ALONE = new RegExp(`^(${NAME})[.!]?$`, 'u');

/* Words that open a sentence without being anybody's name. Checked on the first word only. */
/** The words a sentence opens with to greet, never a name: `tell/read.ts` leaves them out of its names too. */
export const GREETINGS = ['hi', 'hello', 'hey'] as const;
const NOT_A_NAME = new Set(['i', "i'm", 'im', 'we', "we're", 'were', "we've", "i've", "i'd", "they're", 'they', "it's", 'it', 'this', 'that', 'a', 'an', 'the', 'me', 'my', 'our', 'so', 'well', 'yes', 'yeah', 'no', 'ok', 'okay', 'sure', 'and', 'but', 'also', 'just', 'currently', 'basically', 'honestly', "don't", 'dont', 'do', 'never', 'not', 'without', 'zero', "doesn't", "haven't", "hasn't", "hadn't", ...GREETINGS]);

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const lead = (s: string): string => s.replace(/^[\s,.;:!–-]+/u, '');
const named = (name: string): boolean => !NOT_A_NAME.has((name.split(' ')[0] ?? '').toLowerCase().replace('’', "'"));

/** A stretch of the sentence as it was typed: where it starts, and where it ends (after its last character). */
export type Span = [number, number];

/** The sentence read: the name and the bio, with where each starts in the sentence made one line. */
function read(sentence: string): Heard & { nameAt: number; bioAt: number } {
  const said = oneLine(sentence);
  const body = said.replace(GREETING, '');
  const greeting = said.length - body.length;

  const m = SAYS_NAME.exec(body) ?? BEFORE_COMMA.exec(body) ?? BEFORE_I.exec(body) ?? ALONE.exec(body);
  /* A word may hold a dot for an initial, `S. Marchetti`, so the full stop ending the sentence is taken off. */
  const name = m?.[1]?.replace(/[.'’-]+$/u, '');
  if (m && name && named(name)) {
    const bio = lead(body.slice(m[0].length));
    return { name, bio, nameAt: greeting + m[0].indexOf(m[1] ?? ''), bioAt: said.length - bio.length };
  }
  return { name: null, bio: said, nameAt: -1, bioAt: 0 };
}

/** A name, if the sentence gives one, and the rest of it as a one-line bio. */
export function hear(sentence: string): Heard {
  const { name, bio } = read(sentence);
  return { name, bio };
}

/**
 * WHERE WHAT WAS HEARD SITS IN THE SENTENCE AS TYPED, so the screen can light the very words: the name, and any phrase
 * of the bio given where it sits in the bio (`at`, `length`), which is how `shape.ts` and the use cases say a phrase.
 *
 * THE BIO IS READ AS ONE LINE (`hear`), and a person may have typed two spaces or a line break, so every place is
 * counted back to the typed sentence a character at a time rather than added up.
 */
export function heardAt(sentence: string): { name: Span | null; bio: (at: number, length: number) => Span } {
  const r = read(sentence);
  /* EACH CHARACTER OF THE ONE LINE, BY WHERE IT WAS TYPED: a run of spaces is its first space, and the ends are trimmed. */
  const typed: number[] = [];
  let space = false;
  for (let i = 0; i < sentence.length; i += 1) {
    const blank = /\s/u.test(sentence.charAt(i));
    if (blank && (space || typed.length === 0)) continue;
    space = blank;
    typed.push(i);
  }
  const span = (at: number, length: number): Span => {
    const from = typed[at] ?? sentence.length;
    const last = typed[at + Math.max(length, 1) - 1];
    return [from, last === undefined ? sentence.length : length === 0 ? from : last + 1];
  };
  return {
    name: r.name === null ? null : span(r.nameAt, r.name.length),
    bio: (at, length) => span(r.bioAt + at, length),
  };
}

/** What a chip appends: its words after what is there, as a new clause. */
export function withChip(text: string, chip: string): string {
  const was = text.trimEnd();
  if (!was) return chip;
  return /[.!?,;:]$/.test(was) ? `${was} ${chip}` : `${was}, ${chip}`;
}

/**
 * THE NAME IN AN ADDRESS, for a person who typed none and skipped the question: `mariam.saleh+shop@example.com` is
 * Mariam Saleh. The part before `@` and any `+`, cut at dots, dashes and underscores, digits left out, each word with a
 * capital. `null` where nothing of a name is left (`1987@example.com`).
 */
export function nameFromAddress(email: string | null): string | null {
  const local = (email ?? '').trim().split('@')[0]?.split('+')[0] ?? '';
  const words = local
    .split(/[._-]+/u)
    .map((w) => w.replace(/\p{N}+/gu, ''))
    .filter((w) => /^\p{L}+$/u.test(w));
  return words.length === 0 ? null : words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * The `meet` call onboarding makes, or `null` when it makes none.
 *
 * FOR EVERY PERSON WHO SETS UP: the name they typed, else the one they answered when asked "What should I
 * call you?" (`answered`), else, where the caller says so (`address`), the name in their address, so People always
 * opens on them. NONE WHEN PEOPLE IS OFF OR ABSENT: the identity the person signed in with is kernel's, not the
 * pack's, and People is never turned back on behind somebody who turned it off. None, too, where no name is found at
 * all, since a People entry needs one.
 *
 * THE ADDRESS IS ASKED FOR, NOT ASSUMED, so a caller that has not yet offered the one question keeps meeting nobody
 * without a name until it does (`start/accept.ts`).
 */
export function introduce(
  heard: Heard,
  email: string | null,
  packs: readonly { id: string; disabled_at: string | null }[] | null,
  also: { answered?: string | null; address?: boolean } = {},
): Introduction | null {
  const name = heard.name ?? (also.answered?.trim() || null) ?? (also.address === true ? nameFromAddress(email) : null);
  if (!name) return null;
  const people = packs?.find((p) => p.id === PEOPLE);
  if (!people || people.disabled_at !== null) return null;
  return { name, ...(email ? { email } : {}), where: 'onboarding' };
}

/**
 * THE PEOPLE MODULE AND ITS LIST, BY THE ONE ID THEY SHARE. The first run asks whether it is on before it meets the
 * person, and writes the person into it by hand where `meet` refuses; both read the id from here.
 */
export const PEOPLE = 'people';

/**
 * The same person as a plain entry, with the bio in `note`, for a People list `meet` refuses to write.
 *
 * WITHOUT `met`: `met` is a list of where somebody was met, and `meet` is what writes that line.
 */
export function personRow(asked: Introduction, bio: string): Record<string, string> {
  return { name: asked.name, ...(asked.email ? { email: asked.email } : {}), ...(bio ? { note: bio } : {}) };
}

/**
 * THE SHORT PART OF THE SENTENCE THAT SAYS WHO THEY ARE, for their own card in People (audit 31 Oct m, AM16): under Sam
 * it quoted "I want my life admin under control: my bills, my budget, ..." whole, where Omar's said "a solo founder".
 * The first clause, when it says what they are or do ("a solo founder", "I run a small candle shop" as "Runs a small
 * candle shop"); nothing when it says what they want, or runs long. The whole sentence is still what the first run
 * reads; only the note is short.
 */
export function roleNote(bio: string): string {
  const first = (bio.split(/[.;:!?,]\s|[.;:!?,]$|\s[–-]\s|\s+(?:and|but|so|because)\s+/u)[0] ?? '').trim();
  if (first === '') return '';
  if (/^(?:i|we)\s+(?:want|need|would|['’]d|hope|wish|try|am trying|keep|have|just|really|also|like|love|plan)\b/iu.test(first)) return '';
  const am = /^(?:i['’]?m|i am)\s+(.+)$/iu.exec(first);
  const does = /^i\s+(\p{Ll}+)\b(.*)$/u.exec(first);
  let said = first;
  if (am) said = am[1]!;
  else if (does) {
    const verb = does[1]!;
    const third = /(?:s|sh|ch|x|z|o)$/u.test(verb) ? `${verb}es` : /[^aeiou]y$/u.test(verb) ? `${verb.slice(0, -1)}ies` : `${verb}s`;
    said = `${third.charAt(0).toUpperCase()}${third.slice(1)}${does[2]!}`;
  } else if (/^(?:i|we|my|our)\b/iu.test(first)) return '';
  return said.length > 60 || said.split(/\s+/u).length > 10 ? '' : said;
}
