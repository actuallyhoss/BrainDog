/**
 * THE WORDS AND SIGNS A TYPED LINE SAYS MONEY WITH, and the figure beside them read as minor units: one copy, read by
 * Tell (`tell/read.ts`) and the add line (`line-figures.ts`), so the two never disagree on what "$40" or "12,50 €" is
 * (review 31 Oct g, RG7 and RG8).
 *
 * A BARE "$" IS A DOLLAR, and which one is the record's (ruling 438): on a record kept in a currency whose narrow sign
 * is "$" it is that one, and anywhere else it is unsure and asked, never written as US dollars. A bare "¥" is the
 * record's when that is the yen or the yuan, and unsure otherwise.
 *
 * THE FIGURE IS READ BY `@braindog/extract`'s money reader (`readAmount`), never by a second parser here: lakh grouping
 * in the currencies that print it ("INR 1,25,000.00"), a decimal comma ("12,50 €"), Arabic digits ("١٬٢٥٠"), and a
 * figure no convention reads ("1,2,3") is no figure, never a guess.
 */

import { readAmount } from '@braindog/extract/money';
import { exponentOf } from 'braindog-render';

export const CODES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/** A currency's sign as the runtime writes it in English, `symbol` (`CA$`) or `narrowSymbol` (`$`). */
const signOf = (code: string, display: 'symbol' | 'narrowSymbol'): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: display }).formatToParts(1).find((p) => p.type === 'currency')?.value ?? code;

/* Every currency whose narrow sign is "$", read off the runtime, so no list of them is typed here. */
const DOLLAR_HOMES = new Set([...CODES].filter((c) => signOf(c, 'narrowSymbol') === '$'));
/** The dollar a bare "$" is on a record kept in `record`, or `null` when that is no dollar and the sign is a question. */
export const bareDollar = (record: string | null): string | null => (record !== null && DOLLAR_HOMES.has(record) ? record : null);
/** The currency a bare "¥" is: the record's when that is the yen or the yuan, else a question. */
const bareYen = (record: string | null): string | null => (record === 'JPY' || record === 'CNY' ? record : null);

/* EVERY OTHER SIGN THAT IS ONE CURRENCY'S ALONE, off the runtime too: `£` is sterling's own sign, `E£` the Egyptian
   pound's narrow one. A sign two currencies share is no currency, and the spellings people type that the runtime does not
   write (`US$`, `C$`) are said here. "$" and "¥" are the record's to say (`bareDollar`, `bareYen`). */
export const SYMBOLS: Record<string, string> = (() => {
  const by = new Map<string, Set<string>>();
  for (const display of ['symbol', 'narrowSymbol'] as const)
    for (const c of CODES) {
      const sign = signOf(c, display);
      if (sign === c || /^[A-Za-z]+$/u.test(sign) || sign === '$' || sign === '¥') continue;
      if (display === 'narrowSymbol' && by.has(sign) && !by.get(sign)!.has(c)) continue;
      by.set(sign, new Set([...(by.get(sign) ?? []), c]));
    }
  const one = Object.fromEntries([...by].flatMap(([sign, codes]) => (codes.size === 1 ? [[sign, [...codes][0]!]] : [])));
  return { ...one, US$: 'USD', C$: 'CAD', A$: 'AUD', NZ$: 'NZD' };
})();

/* L.E., the pound written on a shop's sign there, is the currency whose narrow sign is E£. */
const LIVRE = [...CODES].find((c) => signOf(c, 'narrowSymbol') === 'E£') ?? null;
/* A word that is one currency wherever it is said. */
const WORD_CODES: Record<string, string> = {
  euro: 'EUR',
  euros: 'EUR',
  sterling: 'GBP',
  quid: 'GBP',
  ...(LIVRE === null ? {} : { le: LIVRE, 'l.e.': LIVRE, 'l.e': LIVRE }),
};
/* EACH FAMILY IS READ OFF THE RUNTIME'S OWN NAMES (`Intl.DisplayNames`), every tender code whose English name ends in
   the word: the runtime says what currencies there are (02 §3 rule 1), so no list of codes is typed here. */
const CURRENCY_NAMES = new Intl.DisplayNames('en', { type: 'currency' });
const endingIn = (word: string): string[] => [...CODES].filter((c) => new RegExp(`\\b${word}$`, 'iu').test(CURRENCY_NAMES.of(c) ?? ''));
const FAMILIES: Record<string, readonly string[]> = {
  pound: endingIn('pound'),
  dollar: endingIn('dollar'),
  dirham: endingIn('dirham'),
  riyal: endingIn('ri(?:y)?al'),
  dinar: endingIn('dinar'),
  rupee: endingIn('rupee'),
};
const FAMILY_WORD = /^(pound|dollar|buck|dirham|riyal|rial|dinar|rupee)s?$/i;
const FAMILY_OF: Record<string, string> = { buck: 'dollar', rial: 'riyal' };
/* Lower-case codes read only where they are plainly money; `try`, `top`, `all` and `cup` are currencies and words. */
const SAFE_LOWER = new Set(['usd', 'eur', 'gbp', 'aed', 'sar', 'qar', 'kwd', 'jod', 'cad', 'aud', 'chf', 'inr']);

/**
 * The code a word or sign beside a figure names on a record kept in `record`: the code, `null` for a currency word that
 * is unsure there ("$" on a pound record, "pounds" on a dollar one), or `undefined` for a word that is no currency.
 */
export function codeOf(word: string, record: string | null): string | null | undefined {
  if (word === '$') return bareDollar(record);
  if (word === '¥') return bareYen(record);
  const w = word.toLowerCase();
  if (SYMBOLS[word]) return SYMBOLS[word]!;
  if (WORD_CODES[w]) return WORD_CODES[w]!;
  if (/^[A-Z]{3}$/.test(word) && CODES.has(word)) return word;
  if (SAFE_LOWER.has(w) || (record && w === record.toLowerCase())) return w.toUpperCase();
  const family = FAMILY_WORD.exec(w)?.[1];
  if (family) {
    const named = FAMILIES[FAMILY_OF[family] ?? family] ?? [];
    return record && named.includes(record) ? record : null;
  }
  return undefined;
}

/* A DIGIT IN ANY OF THE THREE SYSTEMS THE READER KNOWS, and the separators it reads between runs of them. */
const DIGIT = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]';
/**
 * A figure as typed, for a pattern: runs of digits joined by one separator each ("1,25,000.00", "12,50", "١٬٢٥٠٫٠٠").
 * Which convention it is in is `minorOf`'s to say, by the currency.
 */
export const FIGURE = `${DIGIT}+(?:[,.\\u066B\\u066C]${DIGIT}+)*`;

/**
 * A typed figure as minor units of `currency`, times a thousand for "k", or `null` when it is no amount there: more
 * places than the currency has, a grouping it does not print, or nothing above zero.
 */
export function minorOf(figure: string, currency: string, thousand = false): number | null {
  const e = exponentOf(currency);
  /* "1.5k" is the figure at three more places: 1.5 thousand is 1500, read without a float. */
  const out = readAmount(figure, thousand ? e + 3 : e, currency);
  return out !== null && Number.isSafeInteger(out) && out > 0 ? out : null;
}

/** A typed figure as a plain number, for a count or a measure with no currency, or `null` when it reads as none. */
export function numberOf(figure: string, thousand = false): number | null {
  const out = readAmount(figure, thousand ? 7 : 4);
  return out === null ? null : out / 10 ** 4;
}
