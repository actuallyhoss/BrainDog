/**
 * The five things a person supplies, put into `rates-poll.pack.json`. The document is the file; this is only the fill.
 *
 * WHAT MONEY IN MORE THAN ONE CURRENCY NEEDS TO BE ADDED UP (`08 §2.5`). A rates address answers the worth of one
 * currency in many others, `{"base_code":"USD","rates":{"EGP":48.52,"GBP":0.74}}`, and each number the owner names
 * becomes a row of Money's `fx` list, dated the day the answer arrived. It is an ordinary poll, planned and approved
 * once by the owner, whose plan names the host and how often; nothing here calls anything.
 *
 * PROPOSED AND NEVER ARMED, WHICH WAS WEIGHED RATHER THAN ASSUMED. The only writer of `fx` is this pack, so arming it
 * the day a home currency is declared has a real argument: every mixed figure answers MIXED_CURRENCY until somebody
 * approves something. It was refused, because a poll is the one declaration that keeps calling a third party after
 * everybody has forgotten it is there, and it would be calling one we chose before the owner had read the host.
 * Arming it installs a schedule row (`packages/kernel/src/index.ts`, `arm(body.channel as 'call' | 'poll', ...)`)
 * that calls out daily from the owner's record. What was wrong was never that approval is required; it was that
 * nobody filed the proposal, so the approval never came up. The proposal a record would file for itself is `ratesProposalFor` in
 * `apps/web/src/lib/record/rates-form.ts`, built from the currencies it already holds, and approving it stays a tap.
 *
 * THE FILL CHECKS THE SPEC BECAUSE THE PLAN CANNOT SHOW IT. The approval line is `CALLS OUT open.er-api.com · every
 * 1d · grant "none"` and says nothing about the map. Measured against a real record while this was still a builder in
 * `packages/seed`: the base quoted against itself wrote `USD, USD, 1` into `fx` daily, which `packages/kernel/src/fx.ts`
 * throws away as not a rate; the same currency twice wrote two identical rows a day; and an empty list planned the
 * ordinary line and was refused by `install` only after the owner had approved it. This is the last place that can
 * tell him before he presses the button, so it throws rather than answering a document.
 *
 * THE OUTPUT WAS THE OLD BUILDER'S, BYTE FOR BYTE, for as long as the builder was in the tree to compare against: the
 * file's key order is the document's, the `fill` marks come off, and the map is the file's first entry repeated once a
 * currency. The builder went on September 24th, and `rates-poll.test.ts` holds what it answered that day as values.
 *
 * `apps/web` READS THIS FILE AND THE PACK FILE, AND NOTHING ELSE HERE, which is why nothing here may reach for Node:
 * the rates form runs in the browser and imports `fillRates` beside `rates-poll.pack.json` as JSON.
 */

/**
 * The most currencies one poll fills, the record's `POLL_MAPS_MOST` (`packages/kernel/src/declare.ts`). A
 * twenty-first map is refused by `install`, after the owner has already approved the call out.
 *
 * A HAND COPY, BECAUSE THE NUMBER IS NOT ON THE KERNEL'S SURFACE: its one entry point does not re-export it. What
 * holds the copy is the record's own `validateDeclaration`, asked in `rates-poll.test.ts` at twenty and twenty-one.
 */
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

type Entry = Record<string, unknown> & { rate: Record<string, unknown> };
type Poll = Record<string, unknown> & { map: Entry[] };

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
 * Asking twice for one currency, or what a dollar is worth in dollars, is a question the answer already holds. `NOPE`
 * is a question nobody can answer, and leaving it out quietly would give the owner a poll that fetches every day and
 * never mentions the currency he asked about.
 */
function quoted(base: string, rates: RatesSpec['rates']): { currency: string; path: string }[] {
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

/** The pack file filled for one rates address: `template` is `rates-poll.pack.json` as read, and is not changed. */
export function fillRates(template: Record<string, unknown>, spec: RatesSpec): Record<string, unknown> {
  const base = spec.base.trim().toUpperCase();
  if (!CODE.test(base)) throw new Error(`${spec.base} is not a currency code, and a rates address quotes against one.`);
  const host = hostOf(spec.url);
  const rates = quoted(base, spec.rates);
  const { fill: _marks, ...doc } = structuredClone(template);
  const poll = (doc.declarations as Poll[])[0]!;
  const shape = poll.map[0]!;
  doc.pack = `rates-${spec.id}`;
  doc.summary = `Polls ${host} every ${spec.every} for what one ${base} is worth in ${rates.map((r) => r.currency).join(', ')}.`;
  poll.ingest = `rates_${spec.id.replace(/[^a-z0-9]+/gu, '_')}`.slice(0, 32).replace(/_+$/u, '');
  poll.url = spec.url;
  poll.every = spec.every;
  poll.map = rates.map((r) => ({
    ...shape,
    currency: { value: base },
    base: { value: r.currency },
    rate: { ...shape.rate, path: r.path },
    source: { value: host },
  }));
  return doc;
}
