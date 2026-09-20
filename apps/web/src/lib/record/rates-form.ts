/**
 * What the exchange rates form on Money's settings files: one public rates address, the currency it quotes against,
 * and where each currency's number is in its answer (`routes/packs/[id]/RatesForm.svelte`).
 *
 * THE FORM FILES A PROPOSAL AND INSTALLS NOTHING, like the poll form on an organisation's page (`poll-form.ts`). The
 * pack is `ratesPollPack`'s, an ordinary `poll`, so it goes in front of the owner on Decide with the host and how often
 * printed, and is fetched only once approved. The browser never calls the address.
 *
 * THE ADDRESSES OFFERED ARE PUBLIC AND NEED NO KEY, and each is written down here with the shape of its answer, so the
 * path of a currency's number is known rather than guessed (`docs/08` §2.5, "Rates by poll"):
 *
 * - **open.er-api.com** (ExchangeRate-API's open access): `https://open.er-api.com/v6/latest/USD` answers
 *   `{"result":"success","base_code":"USD","time_last_update_utc":"...","rates":{"EGP":48.5,"GBP":0.74,...}}`, updated
 *   once a day, about 160 currencies including EGP. The number for EGP is at `rates.EGP`.
 * - **Frankfurter** (the European Central Bank's reference rates): `https://api.frankfurter.app/latest?from=USD` answers
 *   `{"amount":1.0,"base":"USD","date":"2026-09-16","rates":{"EUR":0.92,"GBP":0.78,...}}`, working days only, about 30
 *   currencies and NOT the Egyptian pound. The number for GBP is at `rates.GBP`.
 *
 * Any other address is entered by hand: the whole https address, the currency it quotes against, and each path.
 *
 * AND THE PROPOSAL A RECORD WOULD FILE WITHOUT BEING ASKED TO IS `ratesProposalFor`, WHICH NOTHING CALLS YET. The
 * only writer of `fx` is a pack somebody has to come to this form and fill in, so an owner holding three currencies
 * reads MIXED_CURRENCY on every headline until he finds a form he had no reason to look for
 * (`packages/kernel/src/fx.ts`). Two seams close that, and neither is written: `RatesForm.svelte` seeding its base
 * and rows from `ratesDraftFor(home, held)` rather than from `'USD'` and the first row of the table, and the money
 * settings load or `boot-live.ts` calling `propose` with `ratesProposalFor(home, held)` when no rates pack is
 * installed and no such proposal is open. Filing is not fetching: the proposal sits on Decide with the host and the
 * interval printed, and the address is called only once he approves it, which is argued in full in
 * `packages/seed/src/packs/rates-poll.ts`.
 *
 * THE BASE IS THE HOME CURRENCY, because that is the one currency every figure is converted into, and a rate quoted
 * straight into it is not read through a third. `rateFor` will go through a currency both are quoted against, and a
 * pair found that way is only as recent as its older half. Measured on 2026-09-20, open.er-api answers
 * `https://open.er-api.com/v6/latest/EGP` with `result: success` and 166 rates, so a home currency outside the
 * dollar and the euro is an ordinary base to it.
 */

import { RATES_CURRENCIES_MOST, ratesPollPack } from '@braindog/seed/packs/rates-poll';

import { copy } from '../copy.ts';

/** A documented address: how its URL is built from the base, and where a currency's number is. */
export type RatesSource = {
  id: string;
  name: string;
  /** What it covers, in a sentence a person reads before choosing it. */
  covers: string;
  url: (base: string) => string;
  path: (currency: string) => string;
  /** The currencies it quotes, when it is a short list; absent is nearly all of them. */
  only?: readonly string[];
};

/** Where the list below came from, and the one address that can settle an argument about it. */
export const ECB_QUOTES_URL = 'https://api.frankfurter.app/currencies';

/** The day `ECB_QUOTES_URL` was last asked. `rates-form.test.ts` asks it again on request and compares. */
export const ECB_QUOTES_ASKED = '2026-09-20';

/**
 * What Frankfurter published when it was last asked, which is the only thing that decides whether it can price a
 * currency. It had rotted by one code before this line was written: the list held BGN, and the source's own
 * `/currencies` no longer does, which is what a euro accession does to a national currency. The cost of that one
 * code is the whole reason the check exists. An owner holding Bulgarian lev would have been offered Frankfurter, the
 * form would have accepted it, the poll would have installed, and the answer would simply have had no `rates.BGN` in
 * it: no rate, no refusal, and a headline that says MIXED_CURRENCY for a reason nothing on the screen explains.
 *
 * `Intl` CANNOT ANSWER THIS AND CANNOT EVEN CATCH IT GOING WRONG, which was the assumption worth measuring.
 * `Intl.supportedValuesOf('currency')` still holds BGN today, because CLDR keeps a code long after the money stops,
 * so "every code here is tender" is green on a list that is already wrong. What the offline check in the test can
 * hold is the cheaper half: real codes, no repeats, in order, and the count the copy beside the picker claims. What
 * only the source can hold is membership, so the test that asks it is one command and no key
 * (`RATES_LIVE=1 node --test ...`), and this is the day it last passed.
 */
export const ECB_QUOTES = ['AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR'] as const;

export const RATES_SOURCES: readonly RatesSource[] = [
  {
    id: 'open-er-api',
    name: 'open.er-api.com',
    covers: copy.ratesCoversOpenEr,
    url: (base) => `https://open.er-api.com/v6/latest/${base}`,
    path: (c) => `rates.${c}`,
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter',
    covers: copy.ratesCoversFrankfurter,
    url: (base) => `https://api.frankfurter.app/latest?from=${base}`,
    path: (c) => `rates.${c}`,
    only: ECB_QUOTES,
  },
];

/** `custom` is an address typed in. */
export type RatesDraft = {
  source: string;
  base: string;
  /** Only read for `custom`. */
  url: string;
  rows: { currency: string; path: string }[];
};

const CODE = /^[A-Z]{3}$/u;
const PATH = /^(?:[A-Za-z0-9_-]+|\[-?\d*\])(?:\.[A-Za-z0-9_-]+|\[-?\d*\])*$/u;

/** The currencies a record holds money in, from its rows' money values, in code order. */
export function currenciesIn(rows: readonly { fields: Record<string, unknown> }[]): string[] {
  const seen = new Set<string>();
  for (const r of rows)
    for (const v of Object.values(r.fields)) {
      const c = v !== null && typeof v === 'object' ? (v as { currency?: unknown }).currency : undefined;
      if (typeof c === 'string' && CODE.test(c)) seen.add(c);
    }
  return [...seen].sort();
}

/** The rows a draft starts with: every currency held and the home one, less the base, each at the source's path. */
export function rowsFor(source: string, base: string, currencies: readonly string[]): RatesDraft['rows'] {
  const s = RATES_SOURCES.find((x) => x.id === source);
  return [...new Set(currencies)]
    .filter((c) => c !== base)
    .sort()
    .map((currency) => ({ currency, path: s ? s.path(currency) : `rates.${currency}` }));
}

/** The whole address the draft polls. */
export function addressOf(d: RatesDraft): string {
  const s = RATES_SOURCES.find((x) => x.id === d.source);
  return s ? s.url(d.base) : d.url.trim();
}

/**
 * The rows the poll would actually fill, which is the one notion of the row set this file has.
 *
 * IT IS `ratesPollPack`'s `quoted` JUDGEMENT, MADE ON THE FORM'S SIDE, because two of them disagreeing is what a
 * caller reads. The pack drops the base and drops a repeat; the form did neither, so a draft naming EGP twice was
 * measured to file a pack of one map under a Decide line reading "worth in EGP, EGP", and twenty-one rows naming
 * twenty currencies were refused for being twenty-one when the pack would have built twenty. The repeat is matched
 * by code, ignoring case and spaces, exactly as `quoted` matches it; the code itself is handed on as it was typed,
 * so `ratesFault` can still say that `egp` is not a currency code rather than quietly correcting it.
 */
export function ratesRows(d: RatesDraft): { currency: string; path: string }[] {
  const base = d.base.trim().toUpperCase();
  const seen = new Map<string, { currency: string; path: string }>();
  for (const r of d.rows) {
    const key = r.currency.trim().toUpperCase();
    if (key === base || seen.has(key)) continue;
    seen.set(key, { currency: r.currency.trim(), path: r.path.trim() });
  }
  return [...seen.values()];
}

/** What is wrong with the draft, by the part it is about, or `null` when it can be filed. */
export function ratesFault(d: RatesDraft): { at: 'url' | 'base' | 'rows'; fix: string } | null {
  if (!CODE.test(d.base)) return { at: 'base', fix: copy.ratesFaultBase };
  let url: URL | null = null;
  try {
    url = new URL(addressOf(d));
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:') return { at: 'url', fix: copy.pollFaultUrl };
  const rows = ratesRows(d);
  if (rows.length === 0) return { at: 'rows', fix: copy.ratesFaultNone };
  /* THE RECORD TAKES TWENTY MAPS AND REFUSES THE TWENTY-FIRST (`POLL_MAPS_MOST`), and it refuses at install, which
     is after the owner has read the plan and approved the call out. Measured: twenty-one currencies planned as the
     ordinary one-line CALLS OUT and then died on `map is one map, or a list of 1 to 20 maps`. The same sentence the
     poll form uses, because a currency IS one of the numbers an address fills. */
  if (rows.length > RATES_CURRENCIES_MOST) return { at: 'rows', fix: copy.pollFaultMost(RATES_CURRENCIES_MOST) };
  const s = RATES_SOURCES.find((x) => x.id === d.source);
  const unquoted = s?.only ? [d.base, ...rows.map((r) => r.currency)].filter((c) => !s.only!.includes(c)) : [];
  if (unquoted.length) return { at: 'rows', fix: copy.ratesFaultUnquoted(s!.name, unquoted.join(', ')) };
  const bad = rows.find((r) => !CODE.test(r.currency) || !PATH.test(r.path.trim()));
  if (bad) return { at: 'rows', fix: CODE.test(bad.currency) ? copy.pollFaultPath(bad.path.trim()) : copy.ratesFaultCode(bad.currency) };
  return null;
}

/**
 * The first documented address that quotes every one of these currencies, or `null` when none does.
 *
 * THE ORDER OF `RATES_SOURCES` IS NOT ALLOWED TO BE THE REASON A RECORD WORKS. open.er-api happens to be first and
 * happens to cover the Egyptian pound, so the form's default happens to be right for this owner today; reorder the
 * table, or add a source above it, and a record whose money is in a currency the ECB never published would default
 * to an address that cannot price it. Coverage is asked rather than assumed, and the base is asked about too,
 * because an address that does not publish a currency cannot quote against it either.
 *
 * AND THE TABLE IS AN ARGUMENT SO THAT THE SENTENCE ABOVE CAN BE MEASURED. With only the module's own table to ask,
 * the `every` below was dead code: open.er-api is the first row and names no `only`, so `find` settles on it for
 * every possible input and the second row is never read. Changing `every` to `some` was measured to leave all eight
 * tests in `rates-form.test.ts` green, which means the test covering provider choice could not tell a choice from a
 * constant. The test now hands the table in reversed, and `some` goes red on the Egyptian pound.
 */
export function sourceFor(currencies: readonly string[], sources: readonly RatesSource[] = RATES_SOURCES): RatesSource | null {
  return sources.find((s) => s.only === undefined || currencies.every((c) => s.only!.includes(c))) ?? null;
}

/**
 * The draft a record would file for itself: the home currency as the base, every other currency it holds, and an
 * address that quotes all of them. `null` when there is nothing to poll for.
 *
 * TWO OF THE THREE `null`s ARE THE POINT. A record with no home currency has no currency to convert into, and a
 * record whose money is all in one currency has nothing to convert: in both, every figure is already a figure, and
 * a daily call to a third party would buy exactly nothing. The third is a record holding a currency no documented
 * address quotes, which is a thing to say out loud on the form rather than to guess at here.
 */
export function ratesDraftFor(home: string, held: readonly string[]): RatesDraft | null {
  const base = home.trim().toUpperCase();
  if (!CODE.test(base)) return null;
  const others = [...new Set(held.map((c) => c.trim().toUpperCase()))].filter((c) => CODE.test(c) && c !== base).sort();
  if (others.length === 0) return null;
  const s = sourceFor([base, ...others]);
  return s === null ? null : { source: s.id, base, url: '', rows: rowsFor(s.id, base, others) };
}

/**
 * The proposal a record files for itself, or `null` when it has nothing to ask.
 *
 * WHAT IT WILL NOT DO IS FILE SOMETHING THE RECORD WOULD THEN REFUSE. `ratesFault` is asked first, with the same
 * sentences the form shows, so a record holding more than twenty currencies files nothing and the owner fills the
 * form by hand rather than approving a call out that dies at install.
 */
export function ratesProposalFor(home: string, held: readonly string[]): ReturnType<typeof ratesProposal> | null {
  const draft = ratesDraftFor(home, held);
  return draft === null || ratesFault(draft) !== null ? null : ratesProposal(draft);
}

/** The pack's id from the address's host: `open-er-api-com`, kept short. */
export function ratesIdOf(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  return (
    host
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/g, '') || 'rates'
  );
}

/** The proposal the form files: a pack polling the address once a day into Money's exchange rates. */
export function ratesProposal(d: RatesDraft) {
  const url = addressOf(d);
  const rows = ratesRows(d);
  const doc = ratesPollPack({ id: ratesIdOf(url), url, every: '1d', base: d.base, rates: rows });
  return {
    question: copy.ratesQuestion(new URL(url).host, d.base, rows.map((r) => r.currency).join(', ')),
    body_kind: 'pack' as const,
    body: { install: String(doc.pack), doc },
  };
}
