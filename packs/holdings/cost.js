/**
 * What each holding cost, what it is worth now and what it has gained, worked out from its buys, its own price and,
 * for gold, the gold rate a person or a feed says.
 *
 * WHAT IT COST. A holding with buys counts their grams or shares into `qty` and what they cost, fees in, into `cost`,
 * and `unit_cost` is that cost spread over the count. Each buy's own `paid` is its count times its price, plus its fees.
 * A holding with no buys is costed as before, its count times what one cost, so a holding written before buys existed
 * keeps every number it had. Buys in two currencies are never added: the holding keeps its own count and cost.
 *
 * WHAT IT IS WORTH, in this order: the holding's own price ("Worth each now"), when somebody gave one; for gold, the
 * newest gold rate for its karat, or else the newest rate of any karat turned to this one by their purities (the 24k
 * rate times the karat over 24, a 21k rate times 18 over 21 for 18k gold), so gold is valued from the first rate anybody
 * sets, feed or no feed; and else what it cost. `valued_by` says which of the three it was, so a page can say a value
 * is only what was paid. GOLD WITH A COUNT AND A RATE IS VALUED EVEN WITH NO COST: a bracelet nobody knows the price of
 * is still worth its grams, it only has no gain.
 *
 * A HOLDING WITH NO BUYS AND NO PRICE EACH keeps the cost somebody wrote on it, and is costed by that.
 *
 * WHAT IT GAINED is its worth less its cost, and the gain over the cost as a percent, said only when something other
 * than the cost priced it and both are in one currency. A holding that stands at what it cost has no gain, not a gain
 * of nought.
 *
 * THE GOLD RATE. One row a karat is current: the newest by its day, and by when it was written on a tie. A rate written
 * with no day is dated today. A new rate marks itself current, the one before it not, and every gold holding is worked
 * out again against it.
 *
 * STARTED BY A RULE with the row that moved: a holding is worked out; a buy is priced and its holding worked out (a buy
 * deleted, or moved to another holding, works out every holding, since which holding it left is not said); a gold rate is marked and
 * every gold holding worked out. STARTED BY THE CLOCK once a day, with no row, it marks the rates and works out every
 * holding nothing has worked out yet, which is how a record that held holdings before this version gains its gains with
 * nobody writing a row again, then the gold holdings and the first page of the rest. The unvalued and the gold are read past
 * the first fifty, by number; only that last page is one page of fifty.
 *
 * A PRICE WRITTEN WITH NO DAY IS STAMPED WITH TODAY in `priced_on`, and a price said again is dated again when the rule
 * says the price moved and the day did not (`changed`, the fields the write moved, comma separated). A day somebody
 * wrote is never written over, and a price taken away takes its day with it. Nothing is written to a row that already
 * says what this would write.
 */

/** A karat's share of pure gold. */
const PURITY = { '24k': 24, '22k': 22, '21k': 21, '18k': 18 };

const amount = (m) => m !== null && typeof m === 'object' && typeof m.amount === 'number' && typeof m.currency === 'string';
const same = (a, b) => (amount(a) && amount(b) ? a.amount === b.amount && a.currency === b.currency : !amount(a) && !amount(b));
const number = (n) => typeof n === 'number' && Number.isFinite(n);
/** Counts are kept to six places, so a sum of grams reads 46.5 and not 46.50000000000001. */
const tidy = (n) => Math.round(n * 1e6) / 1e6;

/** What one buy paid: its count times its price, plus its fees in the same currency. `null` when it cannot be said. */
function paidOf(buy) {
  const { qty, price, fees } = buy.fields;
  if (!number(qty) || !amount(price)) return null;
  if (amount(fees) && fees.currency !== price.currency) return null;
  return { amount: Math.round(qty * price.amount) + (amount(fees) ? fees.amount : 0), currency: price.currency };
}

/** The current rate a karat: the newest row by its day, then by when it was written. */
function currentOf(rates) {
  const best = {};
  for (const r of rates) {
    const k = r.fields.karat;
    if (typeof k !== 'string' || !amount(r.fields.per_gram)) continue;
    const day = typeof r.fields.on === 'string' ? r.fields.on : '';
    const was = best[k];
    if (!was || day > was.day || (day === was.day && r.seq > was.seq)) best[k] = { day, seq: r.seq, id: r.id, per_gram: r.fields.per_gram };
  }
  return best;
}

/** What a gram of this karat is worth by the rates, or `null`. Not rounded, so the holding's worth is rounded once. */
function rateFor(current, karat) {
  if (typeof karat !== 'string' || PURITY[karat] === undefined) return null;
  if (current[karat]) return current[karat].per_gram;
  /* THE 24K RATE FIRST, then the newest of any other karat, each turned to this karat by their purities. */
  const others = Object.entries(current).filter(([k]) => PURITY[k] !== undefined);
  const pure = current['24k'];
  const from = pure ? ['24k', pure] : others.sort(([, a], [, b]) => (b.day > a.day ? 1 : b.day < a.day ? -1 : b.seq - a.seq))[0];
  if (!from) return null;
  const [k, rate] = from;
  return { amount: (rate.per_gram.amount * PURITY[karat]) / PURITY[k], currency: rate.per_gram.currency };
}

/** Dates a rate nobody dated, and marks the newest a karat current and the rest not. */
function markRates(ctx, rates, today) {
  const undated = (r) => amount(r.fields.per_gram) && !(typeof r.fields.on === 'string' && r.fields.on !== '');
  const current = currentOf(rates.map((r) => (undated(r) ? { ...r, fields: { ...r.fields, on: today } } : r)));
  const ids = new Set(Object.values(current).map((c) => c.id));
  for (const r of rates) {
    const next = undated(r) ? { on: today } : {};
    const now = ids.has(r.id);
    if ((r.fields.live === true) !== now) next.live = now;
    if (Object.keys(next).length > 0) ctx.update('gold_rates#' + r.seq, next, r.version);
  }
  return current;
}

/** Works out one holding against its buys and the rates, and writes what moved. */
async function work(ctx, row, current, today, repriced) {
  if (!row) return;
  const f = row.fields;
  const buys = await every(ctx, 'holding_buys', { field: 'item', is: row.id });
  const next = {};

  let qty = f.qty;
  let cost = null;
  const paid = buys.map(paidOf);
  const currencies = new Set(paid.filter(Boolean).map((p) => p.currency));
  if (buys.length > 0 && paid.every(Boolean) && currencies.size === 1) {
    qty = tidy(buys.reduce((s, b) => s + b.fields.qty, 0));
    const [currency] = currencies;
    cost = { amount: paid.reduce((s, p) => s + p.amount, 0), currency };
    if (f.qty !== qty) next.qty = qty;
    const each = qty > 0 ? { amount: Math.round(cost.amount / qty), currency } : null;
    if (each && !same(f.unit_cost, each)) next.unit_cost = each;
    const first = buys.map((b) => b.fields.bought_on).filter((d) => typeof d === 'string').sort()[0];
    if (first && f.acquired_on !== first) next.acquired_on = first;
  } else if (number(qty) && amount(f.unit_cost)) {
    cost = { amount: Math.round(qty * f.unit_cost.amount), currency: f.unit_cost.currency };
  } else if (amount(f.cost)) {
    /* A COST WRITTEN ON THE HOLDING ITSELF, with no buys and nothing paid each: the gold bar bought for £3,100 and valued
       by the gold rate. Its gain is its worth less that, so Worth now less Paid in is Gain on the page. */
    cost = f.cost;
  }
  const gram = f.kind === 'gold' ? rateFor(current, f.karat) : null;
  if (!number(qty) || (cost === null && !amount(f.price) && !gram)) {
    if (Object.keys(next).length > 0) ctx.update('holdings#' + row.seq, next, row.version);
    return;
  }

  let value = cost;
  let by = 'cost';
  if (amount(f.price)) {
    value = { amount: Math.round(qty * f.price.amount), currency: f.price.currency };
    by = 'price';
  } else if (gram) {
    value = { amount: Math.round(qty * gram.amount), currency: gram.currency };
    by = 'gold_rate';
  }
  const gained = cost !== null && by !== 'cost' && value.currency === cost.currency;
  const gain = gained ? { amount: value.amount - cost.amount, currency: cost.currency } : null;
  const pct = gained && cost.amount > 0 ? Math.round(((value.amount - cost.amount) / cost.amount) * 1000) / 10 : null;

  if (cost !== null && !same(f.cost, cost)) next.cost = cost;
  if (!same(f.value, value)) next.value = value;
  if (f.valued_by !== by) next.valued_by = by;
  if (!same(f.gain, gain)) next.gain = gain;
  if ((number(f.gain_pct) ? f.gain_pct : null) !== pct) next.gain_pct = pct;
  if (amount(f.price) && (!f.priced_on || repriced) && f.priced_on !== today) next.priced_on = today;
  if (!amount(f.price) && f.priced_on) next.priced_on = null;
  if (Object.keys(next).length > 0) ctx.update('holdings#' + row.seq, next, row.version);
}

/**
 * Every row of a list that `where` lets through. A script's list is one page of fifty, in the list's own order and with
 * no cursor, so the rows are asked for by number instead: the top number is found by asking above the highest seen,
 * then (0, top] is cut in halves until each half comes back short. At most 60 reads; `short` says some were left.
 */
async function every(ctx, register, where) {
  const PAGE = 50;
  const READS = 60;
  let reads = 0;
  const ask = (above, upto) => {
    reads += 1;
    const parts = [...(where ? [where] : []), ...(above > 0 ? [{ field: 'seq', gt: above }] : []), ...(upto === null ? [] : [{ field: 'seq', lte: upto }])];
    return parts.length === 0 ? ctx.record.list(register) : ctx.record.list(register, parts.length === 1 ? parts[0] : { all: parts });
  };
  const first = await ask(0, null);
  if (first.length < PAGE) return first;
  const seen = new Map(first.map((r) => [r.id, r]));
  let top = Math.max(...first.map((r) => r.seq));
  for (;;) {
    if (reads >= READS) break;
    const above = await ask(top, null);
    for (const r of above) seen.set(r.id, r);
    if (above.length < PAGE) break;
    top = Math.max(...above.map((r) => r.seq));
  }
  const spans = [[0, top]];
  let short = false;
  while (spans.length > 0) {
    if (reads >= READS) {
      short = true;
      break;
    }
    const [a, b] = spans.pop();
    const page = await ask(a, b);
    for (const r of page) seen.set(r.id, r);
    if (page.length >= PAGE && b - a > 1) {
      const mid = Math.floor((a + b) / 2);
      spans.push([a, mid], [mid, b]);
    }
  }
  const rows = [...seen.values()];
  rows.short = short;
  return rows;
}

export default async function run(ctx) {
  const input = ctx.input !== null && typeof ctx.input === 'object' ? ctx.input : {};
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);
  const moved = typeof input.changed === 'string' ? input.changed.split(',') : [];
  const repriced = moved.includes('price') && !moved.includes('priced_on');
  const rates = await every(ctx, 'gold_rates');
  const id = typeof input.id === 'string' ? input.id : null;

  if (id !== null && input.register === 'holding_buys') {
    const buy = await ctx.record.get(id);
    const current = currentOf(rates);
    const paid = buy === null ? null : paidOf(buy);
    if (buy !== null && paid !== null && !same(buy.fields.paid, paid)) ctx.update('holding_buys#' + buy.seq, { paid }, buy.version);
    /* GONE, OR MOVED FROM ONE HOLDING TO ANOTHER: which holding it left is not said, so every holding is worked out. */
    if (buy === null || (input.op === 'update' && moved.includes('item'))) {
      for (const row of await every(ctx, 'holdings')) await work(ctx, row, current, today, false);
      return;
    }
    const holding = typeof buy.fields.item === 'string' ? await ctx.record.get(buy.fields.item) : null;
    await work(ctx, holding, current, today, false);
    return;
  }
  if (id !== null && input.register === 'gold_rates') {
    const current = markRates(ctx, rates, today);
    for (const row of await every(ctx, 'holdings', { field: 'kind', is: 'gold' })) await work(ctx, row, current, today, false);
    return;
  }
  if (id !== null) {
    await work(ctx, await ctx.record.get(id), currentOf(rates), today, repriced);
    return;
  }
  /* THE CLOCK: the rates, every holding nothing has worked out yet, the gold, and the first page of the rest, which
     catches a holding whose buy a rule could not start a run for on a busy day. */
  const current = markRates(ctx, rates, today);
  const done = new Set();
  const lists = [{ field: 'valued_by', empty: true }, { field: 'kind', is: 'gold' }, null];
  const rows = [];
  for (const where of lists) rows.push(...(await (where === null ? ctx.record.list('holdings') : every(ctx, 'holdings', where))));
  for (const row of rows) {
    if (done.has(row.id)) continue;
    done.add(row.id);
    await work(ctx, row, current, today, false);
  }
}
