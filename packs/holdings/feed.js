/**
 * Today's gold rate from the world price, once a day, when the owner turns it on. Off until then: a record that never
 * chooses a source fetches nothing and is written nothing.
 *
 * TWO SOURCES, BOTH FREE AND WITH NO KEY, chosen in the `gold_source` setting:
 * - `world_price`: what an ounce of gold is worth in nearly every currency, the Egyptian pound among them, from the
 *   free currency-api on Cloudflare Pages, with its copy on jsDelivr asked when Pages does not answer. Pages first,
 *   because jsDelivr's `latest` was measured a day behind it (28 Oct against 29 Oct, asked the same minute).
 *   One answer a day, already in the record's money, dated by the answer's own day. Nothing else needs to be on.
 * - `spot_in_dollars`: the spot price of an ounce from gold-api.com, in dollars, live to the minute, turned into the
 *   record's money by the newest rate in Money's exchange rates. With no rate between dollars and that money it writes
 *   nothing and says so, rather than guess one.
 *
 * NO EGYPTIAN SHOP PRICE IS READ, because no Egyptian gold site answers one without a key or without reading its web
 * pages, and a feed that reads a page breaks the day the page is redrawn. Shops in Egypt sell above the world price
 * turned into pounds, so `gold_premium` adds a share over it, in percent, which the owner can set to what his jeweller
 * charges. It is 0 until he does.
 *
 * WHAT IT WRITES. A gram of 24k is an ounce over 31.1034768 grams, plus the premium; each other karat is that times
 * its karat over 24, as `holdings_cost` already prices a karat with no rate of its own. One row a karat, dated the day
 * the price is of, `from` set to `feed`, for 24k and for each karat the record's gold or its gold rates are in, so a
 * karat nobody holds is not written every day. `holdings_cost` marks the newest a karat as in use, as it does for a
 * rate typed by hand, and works every gold holding out again.
 *
 * A RATE A PERSON TYPED IS NEVER WRITTEN OVER, OR OUTRUN ON ITS OWN DAY. A karat that holds a rate set by hand (`from`
 * empty or `hand`) dated the feed's day or later is left alone that day, so a price the owner typed this morning is the
 * one in use. A rate of the feed's own for that karat and day is updated in place when the price moved, and nothing is
 * written when it did not. The feed only ever writes rows it marks as its own.
 *
 * THE MONEY. `gold_currency` names it, three letters; left empty it is the money the newest gold rate is in, else the
 * money the gold was bought in. A record with none of these writes nothing and says what to set. An amount is kept in
 * the currency's own minor units, as every money field is (`EXPONENT` below is the record's own table).
 */

const OUNCE_GRAMS = 31.1034768;
const PURITY = { '24k': 24, '22k': 22, '21k': 21, '18k': 18 };
const SOURCES = ['world_price', 'spot_in_dollars'];

const WORLD = ['https://latest.currency-api.pages.dev/v1/currencies/xau.min.json', 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.min.json'];
const SPOT = 'https://api.gold-api.com/price/XAU';

/** The record's minor units a currency, `EXPONENT` in `packages/kernel/src/ingest.ts`; any other code is two. */
const EXPONENT = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

const CODE = /^[A-Z]{3}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const amount = (m) => m !== null && typeof m === 'object' && typeof m.amount === 'number' && typeof m.currency === 'string';
const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const codeOf = (v) => (typeof v === 'string' && CODE.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null);

/** The settings as the run reads them, each held to what it may be. */
export function settingsOf(config) {
  const source = SOURCES.includes(config?.gold_source) ? config.gold_source : 'off';
  const premium = Number(config?.gold_premium);
  return {
    source,
    currency: codeOf(config?.gold_currency),
    premium: Number.isFinite(premium) && premium > -50 && premium < 100 ? premium : 0,
  };
}

/** The money the rates are written in: the setting, else the newest gold rate's, else the money the gold was bought in. */
export function currencyOf(set, rates, gold) {
  if (set) return set;
  const dated = rates.filter((r) => amount(r.fields.per_gram)).sort((a, b) => String(b.fields.on ?? '').localeCompare(String(a.fields.on ?? '')) || b.seq - a.seq);
  if (dated.length > 0) return dated[0].fields.per_gram.currency;
  for (const h of gold) for (const f of ['unit_cost', 'cost', 'price']) if (amount(h.fields[f])) return h.fields[f].currency;
  return null;
}

/** The karats to write: 24k, and each one the record's gold or its gold rates are in. */
export function karatsOf(rates, gold) {
  const held = new Set(['24k']);
  for (const r of [...rates, ...gold]) if (typeof r.fields.karat === 'string' && PURITY[r.fields.karat] !== undefined) held.add(r.fields.karat);
  return Object.keys(PURITY).filter((k) => held.has(k));
}

/** A gram of each karat, in minor units, from an ounce of pure gold in `currency`. */
export function gramsOf(ounce, currency, premium, karats) {
  const scale = 10 ** (EXPONENT[currency] ?? 2);
  const pure = (ounce / OUNCE_GRAMS) * (1 + premium / 100);
  return karats.map((karat) => ({ karat, per_gram: { amount: Math.round(((pure * PURITY[karat]) / 24) * scale), currency } }));
}

/**
 * What one dollar is worth in `currency` by Money's exchange rates, the newest of either way round, or `null`. A row
 * says one `currency` is `rate` of `base`, so dollars quoted in it multiply and it quoted in dollars divides.
 */
export function dollarsIn(fx, currency) {
  let best = null;
  for (const r of fx) {
    const { currency: c, base, rate, as_of } = r.fields;
    if (!positive(rate)) continue;
    const per = c === 'USD' && base === currency ? rate : c === currency && base === 'USD' ? 1 / rate : null;
    if (per === null) continue;
    const day = typeof as_of === 'string' ? as_of : '';
    if (best === null || day > best.day) best = { day, per };
  }
  return best === null ? null : best.per;
}

/** The world price: an ounce in `currency` and the day it is of, or a sentence saying why there is none. */
async function world(ctx, currency) {
  let said = 'the world price did not answer';
  for (const url of WORLD) {
    let r;
    try {
      r = await ctx.fetch(url);
    } catch {
      continue;
    }
    if (!r.ok) {
      said = `the world price answered ${r.status}`;
      continue;
    }
    const body = await r.json();
    const ounce = body?.xau?.[currency.toLowerCase()];
    if (!positive(ounce)) return { why: `the world price has no figure in ${currency}` };
    return { ounce, day: typeof body.date === 'string' && DAY.test(body.date) ? body.date : null };
  }
  return { why: said };
}

/** The spot price in dollars, turned into `currency` by Money's own rate. */
async function spot(ctx, currency) {
  let per = 1;
  if (currency !== 'USD') {
    const fx = [
      ...(await ctx.record.list('fx', { all: [{ field: 'currency', is: 'USD' }, { field: 'base', is: currency }] })),
      ...(await ctx.record.list('fx', { all: [{ field: 'currency', is: currency }, { field: 'base', is: 'USD' }] })),
    ];
    per = dollarsIn(fx, currency);
    if (per === null) return { why: `Money has no exchange rate between dollars and ${currency} to turn the spot price into it. Turn on Keep rates current in Money, or choose the world price` };
  }
  const r = await ctx.fetch(SPOT);
  if (!r.ok) return { why: `the spot price answered ${r.status}` };
  const body = await r.json();
  if (!positive(body?.price) || body.currency !== 'USD') return { why: 'the spot price came back without a price in dollars' };
  const day = typeof body.updatedAt === 'string' && DAY.test(body.updatedAt.slice(0, 10)) ? body.updatedAt.slice(0, 10) : null;
  return { ounce: body.price * per, day };
}

/**
 * The writes for one day's prices against the rates already there: a karat with a hand rate on that day or later is
 * passed over, the feed's own rate that day is updated when it moved, and any other karat gets a new rate.
 */
export function plan(rows, prices, day, note) {
  const out = { write: [], update: [], kept: [] };
  for (const p of prices) {
    const mine = rows.filter((r) => r.fields.karat === p.karat);
    if (mine.some((r) => r.fields.from !== 'feed' && typeof r.fields.on === 'string' && r.fields.on >= day)) {
      out.kept.push(p.karat);
      continue;
    }
    const same = mine.find((r) => r.fields.from === 'feed' && r.fields.on === day);
    if (!same) {
      out.write.push({ karat: p.karat, per_gram: p.per_gram, on: day, from: 'feed', note });
      continue;
    }
    const was = same.fields.per_gram;
    if (amount(was) && was.amount === p.per_gram.amount && was.currency === p.per_gram.currency && same.fields.note === note) continue;
    out.update.push({ row: same, patch: { per_gram: p.per_gram, note } });
  }
  return out;
}

export default async function run(ctx) {
  const set = settingsOf(ctx.config);
  if (set.source === 'off') return;

  const rates = await ctx.record.list('gold_rates', { field: 'karat', present: true });
  const gold = await ctx.record.list('holdings', { field: 'kind', is: 'gold' });
  const currency = currencyOf(set.currency, rates, gold);
  if (currency === null) {
    ctx.log('The gold rate was not set: there is no gold or gold rate yet to say which money to set it in. Write the money in the Gold rate in setting, such as EGP.');
    return;
  }

  const got = set.source === 'world_price' ? await world(ctx, currency) : await spot(ctx, currency);
  if (!positive(got.ounce)) {
    ctx.log(`The gold rate was not set today: ${got.why}.`);
    return;
  }
  const today = ctx.today();
  const day = got.day !== null && got.day <= today ? got.day : today;
  const prices = gramsOf(got.ounce, currency, set.premium, karatsOf(rates, gold));
  const note = set.premium === 0 ? 'World price' : `World price, plus ${set.premium}%`;

  const since = await ctx.record.list('gold_rates', { field: 'on', gte: day });
  const out = plan(since, prices, day, note);
  for (const w of out.write) ctx.write('gold_rates', w);
  for (const u of out.update) ctx.update('gold_rates#' + u.row.seq, u.patch, u.row.version);
  if (out.kept.length > 0) ctx.log(`Left the ${out.kept.join(', ')} gold rate as it was typed by hand.`);
}
