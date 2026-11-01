/**
 * A currency a place in the sentence implies, and a currency said as a person says it.
 *
 * A CITY IN THE SENTENCE BEATS THE DEVICE'S TIME ZONE. "A small candle shop in Leeds" typed on a laptop that keeps
 * another country's time was read as a shop keeping that country's money; the words say where the shop is, and the
 * clock only says where the laptop is. So a place named here, a city or a country, gives its currency, and only where
 * nothing typed named one.
 *
 * NAMES, CAPITALISED, AS WORDS. A place matches only as its own capitalised word ("Leeds", "New York"), so "reading" is
 * never Reading. Names two countries share, or that are also a person's name or a common word ("Perth", "Georgia",
 * "Jordan", "Victoria", "Nice", "Bath"), are left out: a wrong guess here is said back as a fact. The one country the
 * core never names (`tools/gates/shell-words.mjs`) is left out too; its people's devices keep its time, which already
 * gives its money.
 *
 * AND THE CURRENCY BY ITS NAME, "pounds", never its code: "Money, in GBP" is the schema talking. The name is the
 * browser's own plural ("US dollars", "euros"), and the pound sterling is "pounds", as a person in Leeds says it.
 *
 * PURE, so `node --test` can import it.
 */

const PLACES: Readonly<Record<string, readonly string[]>> = {
  GBP: [
    'UK', 'United Kingdom', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland',
    'London', 'Leeds', 'Manchester', 'Birmingham', 'Glasgow', 'Edinburgh', 'Bristol', 'Liverpool', 'Sheffield',
    'Cardiff', 'Belfast', 'Newcastle', 'Nottingham', 'Leicester', 'Brighton', 'Oxford', 'Cambridge', 'York',
    'Southampton', 'Aberdeen', 'Coventry', 'Norwich', 'Exeter',
  ],
  USD: [
    'USA', 'United States', 'America', 'New York', 'Brooklyn', 'Los Angeles', 'Chicago', 'San Francisco', 'Boston',
    'Seattle', 'Austin', 'Texas', 'California', 'Miami', 'Atlanta', 'Denver', 'Portland', 'Philadelphia', 'Nashville',
  ],
  CAD: ['Canada', 'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
  AUD: ['Australia', 'Sydney', 'Melbourne', 'Brisbane', 'Adelaide'],
  NZD: ['New Zealand', 'Auckland', 'Wellington'],
  EUR: [
    'Ireland', 'Dublin', 'Cork', 'France', 'Paris', 'Lyon', 'Germany', 'Berlin', 'Munich', 'Hamburg', 'Spain', 'Madrid',
    'Barcelona', 'Italy', 'Rome', 'Milan', 'Netherlands', 'Amsterdam', 'Rotterdam', 'Portugal', 'Lisbon', 'Porto',
    'Austria', 'Vienna', 'Belgium', 'Brussels', 'Finland', 'Helsinki', 'Greece', 'Athens',
  ],
  AED: ['United Arab Emirates', 'Dubai', 'Abu Dhabi', 'Sharjah'],
  SAR: ['Saudi Arabia', 'Riyadh', 'Jeddah'],
  INR: ['India', 'Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune'],
  NGN: ['Nigeria', 'Lagos', 'Abuja'],
  KES: ['Kenya', 'Nairobi'],
  ZAR: ['South Africa', 'Cape Town', 'Johannesburg', 'Durban'],
  JPY: ['Japan', 'Tokyo', 'Osaka', 'Kyoto'],
  CHF: ['Switzerland', 'Zurich', 'Geneva', 'Basel'],
  SEK: ['Sweden', 'Stockholm', 'Gothenburg'],
  DKK: ['Denmark', 'Copenhagen'],
  NOK: ['Norway', 'Oslo'],
  SGD: ['Singapore'],
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/* LONGEST NAME FIRST, so "New York" is read before "York" and "Northern Ireland" before "Ireland". */
const NAMED = Object.entries(PLACES)
  .flatMap(([code, names]) => names.map((name) => ({ code, name })))
  .sort((a, b) => b.name.length - a.name.length);
const ANY = new RegExp(`(?<![\\p{L}\\p{N}])(${NAMED.map((n) => escape(n.name)).join('|')})(?![\\p{L}\\p{N}])`, 'u');

/** The currency of the first place the sentence names, or `null` when it names none this knows. */
export function placeCurrency(said: string): string | null {
  const m = ANY.exec(said);
  if (!m) return null;
  return NAMED.find((n) => n.name === m[1])?.code ?? null;
}

/** Where the browser's plural would say a country first and a person would not. */
const SAID: Readonly<Record<string, string>> = { GBP: 'pounds' };

/**
 * A currency by its name, for a sentence: the browser's plural, as it would say "2 US dollars", or the code itself
 * where the browser has no name for it.
 */
export function currencyWord(code: string): string {
  const c = code.trim().toUpperCase();
  const own = SAID[c];
  if (own !== undefined) return own;
  try {
    const name = new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'name' })
      .formatToParts(2)
      .find((p) => p.type === 'currency')?.value;
    if (name && name.toUpperCase() !== c) return name;
  } catch {
    /* Not a code the browser knows: said as it is. */
  }
  return c;
}

/* ── the currency guessed at sign-up, kept for the BrainDog it was guessed for (audit AP9) ── */

/**
 * WHERE THE GUESS IS KEPT ON THIS DEVICE. A starter without Money has nowhere in the record to keep a currency (only the
 * add-on that keeps money declares `home_currency`), so the one sign-up said ("money in Egyptian pounds") was dropped,
 * and the first amount told stopped to ask again. It waits here, by the BrainDog's own address, until Money is turned
 * on and keeps it there.
 */
const GUESS_KEY = 'braindog.currency.guess';

/** The currency sign-up said for the BrainDog at `base`, kept on this device. */
export function keepCurrencyGuess(base: string, code: string | null): void {
  const c = code?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{3}$/u.test(c)) return;
  try {
    const held = JSON.parse(globalThis.localStorage?.getItem(GUESS_KEY) ?? '{}') as Record<string, string>;
    globalThis.localStorage?.setItem(GUESS_KEY, JSON.stringify({ ...(typeof held === 'object' && held !== null ? held : {}), [base]: c }));
  } catch {
    /* Storage off: the first amount asks, as before. */
  }
}

/** The currency sign-up said for the BrainDog at `base`, or `null`. */
export function currencyGuessed(base: string): string | null {
  try {
    const held = JSON.parse(globalThis.localStorage?.getItem(GUESS_KEY) ?? '{}') as Record<string, unknown>;
    const c = typeof held?.[base] === 'string' ? (held[base] as string) : '';
    return /^[A-Z]{3}$/u.test(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * A currency's name as a person says it, the kind of money in lower case: "Egyptian Pound" is "Egyptian pound", "US
 * Dollar" is "US dollar" (audit AP19; Tell already says it so).
 */
export const spokenName = (name: string): string => name.replace(/\s(\p{Lu})(\p{Ll}+)$/u, (_, a: string, b: string) => ` ${a.toLowerCase()}${b}`);
