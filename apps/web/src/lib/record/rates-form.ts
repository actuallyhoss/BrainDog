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
 */

import { ratesPollPack } from '@braindog/seed/packs/rates-poll';

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

const ECB = ['AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR'] as const;

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
    only: ECB,
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
  const rows = d.rows.filter((r) => r.currency !== d.base);
  if (rows.length === 0) return { at: 'rows', fix: copy.ratesFaultNone };
  const s = RATES_SOURCES.find((x) => x.id === d.source);
  const unquoted = s?.only ? [d.base, ...rows.map((r) => r.currency)].filter((c) => !s.only!.includes(c)) : [];
  if (unquoted.length) return { at: 'rows', fix: copy.ratesFaultUnquoted(s!.name, unquoted.join(', ')) };
  const bad = rows.find((r) => !CODE.test(r.currency) || !PATH.test(r.path.trim()));
  if (bad) return { at: 'rows', fix: CODE.test(bad.currency) ? copy.pollFaultPath(bad.path.trim()) : copy.ratesFaultCode(bad.currency) };
  return null;
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
  const rows = d.rows.filter((r) => r.currency !== d.base).map((r) => ({ currency: r.currency, path: r.path.trim() }));
  const doc = ratesPollPack({ id: ratesIdOf(url), url, every: '1d', base: d.base, rates: rows });
  return {
    question: copy.ratesQuestion(new URL(url).host, d.base, rows.map((r) => r.currency).join(', ')),
    body_kind: 'pack' as const,
    body: { install: String(doc.pack), doc },
  };
}
