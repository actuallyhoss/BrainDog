/**
 * A currency a place in the sentence implies, and a currency said as a person says it (the UI pass of 20 October,
 * first F9).
 *
 * A CITY IN THE SENTENCE BEATS THE DEVICE'S TIME ZONE. "A small candle shop in Leeds" typed on a laptop that keeps
 * Cairo time was read as a shop keeping Egyptian pounds; the words say where the shop is, and the clock only says where
 * the laptop is. So a place named here, a city or a country, gives its currency, and only where nothing typed named one.
 *
 * NAMES, CAPITALISED, AS WORDS. A place matches only as its own capitalised word ("Leeds", "New York"), so "reading" is
 * never Reading. Names two countries share, or that are also a person's name or a common word ("Perth", "Georgia",
 * "Jordan", "Victoria", "Nice", "Bath"), are left out: a wrong guess here is said back as a fact.
 *
 * AND THE CURRENCY BY ITS NAME, "pounds", never its code: "Money, in GBP" is the schema talking.
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
  EGP: ['Egypt', 'Cairo', 'Alexandria', 'Giza'],
  AED: ['UAE', 'United Arab Emirates', 'Dubai', 'Abu Dhabi', 'Sharjah'],
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

/** How a person says a currency in a sentence: "pounds", "US dollars", "euros". */
const SAID: Readonly<Record<string, string>> = {
  GBP: 'pounds',
  USD: 'US dollars',
  EUR: 'euros',
  CAD: 'Canadian dollars',
  AUD: 'Australian dollars',
  NZD: 'New Zealand dollars',
  EGP: 'Egyptian pounds',
  AED: 'dirhams',
  SAR: 'riyals',
  INR: 'rupees',
  NGN: 'naira',
  KES: 'Kenyan shillings',
  ZAR: 'rand',
  JPY: 'yen',
  CHF: 'Swiss francs',
  SEK: 'Swedish kronor',
  DKK: 'Danish kroner',
  NOK: 'Norwegian kroner',
  SGD: 'Singapore dollars',
};

/** A currency by its name, for a sentence; a code this has no name for is said by the browser's name, else as itself. */
export function currencyWord(code: string): string {
  const c = code.trim().toUpperCase();
  const own = SAID[c];
  if (own !== undefined) return own;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(c);
    if (name && name !== c) return name;
  } catch {
    /* Not a code the browser knows: said as it is. */
  }
  return c;
}
