/**
 * Subscriptions: keep the price a subscription had before, and the day it went up.
 *
 * STARTED WHEN A REPEATING LINE IS WRITTEN AND ITS AMOUNT, OR WHETHER IT IS A SUBSCRIPTION, CHANGES, and handed the
 * line's id. A line that is not a subscription is left alone.
 *
 * HOW IT KNOWS THE OLD PRICE. A line holds one amount, so the script keeps the last amount it saw in "Price seen". The
 * first time it sees a line it only notes the amount. When the amount then differs from what it saw, in the same
 * currency, it writes the old one into "Price before", and when the new one is higher it writes today into "Went up
 * on", which the Subscriptions page reads for the last ninety days. A price that went down keeps its old price and
 * clears "Went up on".
 *
 * IT WRITES ONLY ITS OWN THREE FIELDS, and the automation does not watch them, so it never starts itself again.
 */

const money = (m) => m && typeof m === 'object' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string';

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (!id) return;
  const line = await ctx.record.get(String(id));
  if (!line || line.register !== 'recurring') return;
  const f = line.fields;
  if (f.subscription !== true || !money(f.amount)) return;
  const seen = f.price_seen;
  const name = String(f.what || 'The subscription');
  if (!money(seen) || seen.currency !== f.amount.currency) {
    ctx.update('recurring#' + line.seq, { price_seen: f.amount }, line.version);
    return;
  }
  if (seen.amount === f.amount.amount) return;
  const up = f.amount.amount > seen.amount;
  ctx.update('recurring#' + line.seq, { price_seen: f.amount, price_was: seen, price_up_on: up ? ctx.today() : null }, line.version);
  ctx.log(name + (up ? ' went up' : ' went down') + ', and its old price is kept.');
}
