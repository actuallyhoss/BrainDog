/**
 * Exchange rates, polled: one public address, and which number in its answer is which currency.
 *
 * WHAT MONEY IN MORE THAN ONE CURRENCY NEEDS TO BE ADDED UP (`08 §2.5`). A rates address answers the worth of one
 * currency in many others, `{"base_code":"USD","rates":{"EGP":48.52,"GBP":0.74}}`, and each number the owner names
 * becomes a row of Money's `fx` list, dated the day the answer arrived. The figures then convert at the rate as of each
 * amount's day, and say so.
 *
 * AN ORDINARY PACK, INSTALLED THE WAY EVERY POLL IS: planned, and approved once by the owner, whose plan names the host
 * and how often (`loop/DIRECTION.md` §0b). Nothing here calls anything; the runner does, from the declaration, and a
 * public address is polled with no key.
 */

export type RatesSpec = {
  /** Names the pack, `rates-<id>`, and its poll. Lower case, digits and hyphens. */
  id: string;
  /** The whole `https://` address. A literal host, never computed. */
  url: string;
  /** `1d` is plenty: a rate is read as of a day. */
  every: string;
  /** The currency the answer quotes the others against: one of `base` is worth each number below. */
  base: string;
  /** Each currency the record holds money in, and where its number is in the answer: `rates.EGP`. */
  rates: readonly { currency: string; path: string }[];
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** The pack document for one rates address: one poll, a map a currency, each writing a row of `fx`. */
export function ratesPollPack(spec: RatesSpec): Record<string, unknown> {
  const base = spec.base.trim().toUpperCase();
  const host = hostOf(spec.url);
  return {
    pack: `rates-${spec.id}`,
    version: '1.0.0',
    summary: `Polls ${host} every ${spec.every} for what one ${base} is worth in ${spec.rates.map((r) => r.currency.toUpperCase()).join(', ')}.`,
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        ingest: `rates_${spec.id.replace(/[^a-z0-9]+/gu, '_')}`.slice(0, 32).replace(/_+$/u, ''),
        channel: 'poll',
        url: spec.url,
        every: spec.every,
        map: spec.rates.map((r) => ({
          currency: { value: base },
          base: { value: r.currency.trim().toUpperCase() },
          rate: { path: r.path, type: 'decimal' },
          as_of: { arrived: true },
          source: { value: host },
        })),
        writes: { register: 'fx' },
      },
    ],
  };
}
