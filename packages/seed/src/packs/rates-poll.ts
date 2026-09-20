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
 *
 * PROPOSED AND NEVER ARMED, WHICH WAS WEIGHED RATHER THAN ASSUMED. A record that holds two currencies cannot add them
 * up until a rate exists, and the only writer of `fx` is this pack, so the argument for arming it on the day a home
 * currency is declared is a real one: every mixed figure answers MIXED_CURRENCY until somebody approves something.
 * It was refused. Arming this installs a schedule row (`packages/kernel/src/index.ts`, `arm('poll', ...)`) that calls
 * a third party every day from the owner's record, chosen by us, before he has read the host or the interval, and a
 * poll is the one kind of declaration that keeps calling after everybody has forgotten it is there. What was wrong was
 * never that approval is required; it was that nobody filed the proposal, so the approval never came up. The
 * proposal a record would file for itself is built from the currencies it already holds, and it is one line on
 * Decide (`apps/web/src/lib/record/rates-form.ts`, `ratesProposalFor`). Approval stays a tap, and the first outbound
 * call still waits for it. NOTHING CALLS `ratesProposalFor` YET, measured by grepping the tree for it: until the
 * money settings load or `boot-live.ts` does, the owner still has to open the form and press File, so the
 * MIXED_CURRENCY headline this was written for is still there.
 *
 * AND THE SPEC IS CHECKED HERE, BECAUSE THE PLAN THE OWNER READS CANNOT SHOW HIM THIS. The approval line is
 * `CALLS OUT open.er-api.example · every 1d · grant "none"` and it says nothing about the map. Three specs were
 * measured against a real record: the base quoted against itself installed and wrote `USD, USD, 1` into `fx` daily,
 * which `packages/kernel/src/fx.ts` throws away as not a rate; the same currency twice wrote two identical rows a day;
 * an empty list built a pack summarised "for what one USD is worth in ." that `install` refused only after the owner
 * had approved it. A builder is the last place that can tell him before he presses the button, so it throws rather
 * than returning a document, which is what a caller with a bad spec has to see (`packages/seed/test/rates.test.ts`).
 */

/** The most currencies one poll fills, the record's `POLL_MAPS_MOST` (`packages/kernel/src/declare.ts`). A
    twenty-first map is refused by `install`, which is after the owner has already approved the call out. */
export const RATES_CURRENCIES_MOST = 20;

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

const CODE = /^[A-Z]{3}$/u;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The currencies this poll can actually fill, in the order they were asked for.
 *
 * A REPEAT AND THE BASE ARE DROPPED, AND A CODE THAT IS NOT A CODE IS REFUSED, which is not the same judgement twice.
 * Asking twice for the Egyptian pound, or asking what one dollar is worth in dollars, is a question the answer already
 * holds: nothing is lost by taking the first and ignoring the rest, and `fx` would have dropped the self-quoted row
 * anyway. `NOPE` is a question nobody can answer, and quietly leaving it out would give the owner a poll that fetches
 * every day and never mentions the currency he asked about.
 */
function quoted(base: string, rates: readonly { currency: string; path: string }[]): { currency: string; path: string }[] {
  const seen = new Map<string, string>();
  for (const r of rates) {
    const currency = r.currency.trim().toUpperCase();
    if (!CODE.test(currency)) throw new Error(`${r.currency} is not a currency code, and a rates poll fills one row a currency.`);
    if (currency === base || seen.has(currency)) continue;
    seen.set(currency, r.path.trim());
  }
  if (seen.size === 0) throw new Error(`A rates poll needs at least one currency other than ${base}, or it calls out every day and writes nothing.`);
  if (seen.size > RATES_CURRENCIES_MOST) throw new Error(`One poll fills ${RATES_CURRENCIES_MOST} currencies at most, and this one names ${seen.size}.`);
  return [...seen].map(([currency, path]) => ({ currency, path }));
}

/** The pack document for one rates address: one poll, a map a currency, each writing a row of `fx`. */
export function ratesPollPack(spec: RatesSpec): Record<string, unknown> {
  const base = spec.base.trim().toUpperCase();
  if (!CODE.test(base)) throw new Error(`${spec.base} is not a currency code, and a rates address quotes against one.`);
  const host = hostOf(spec.url);
  const rates = quoted(base, spec.rates);
  return {
    pack: `rates-${spec.id}`,
    version: '1.0.0',
    summary: `Polls ${host} every ${spec.every} for what one ${base} is worth in ${rates.map((r) => r.currency).join(', ')}.`,
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        ingest: `rates_${spec.id.replace(/[^a-z0-9]+/gu, '_')}`.slice(0, 32).replace(/_+$/u, ''),
        channel: 'poll',
        url: spec.url,
        every: spec.every,
        map: rates.map((r) => ({
          currency: { value: base },
          base: { value: r.currency },
          rate: { path: r.path, type: 'decimal' },
          as_of: { arrived: true },
          source: { value: host },
        })),
        writes: { register: 'fx' },
      },
    ],
  };
}
