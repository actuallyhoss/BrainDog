/**
 * What each holding cost and what it is worth: its quantity times what one unit cost, written into `cost`, and its
 * quantity times what one is worth now, written into `value`. A holding nobody has priced is worth what it cost.
 *
 * STARTED WITH A ROW'S ID when its quantity, unit cost or price changes, it works that row out. Started with no id,
 * once a day, it works out every holding whose `value` is still empty, so rows written before the add-on was installed,
 * and rows an earlier version costed and never valued, are done too. A row missing its quantity or its unit cost, or
 * already holding the same two amounts, is left as it is. Each amount is in the currency of the number it came from.
 */
export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  const rows = id ? [await ctx.record.get(id)] : await ctx.record.list('holdings', { field: 'value', empty: true });
  const amount = (m) => m && typeof m.amount === 'number' && typeof m.currency === 'string';
  const same = (a, b) => amount(a) && a.amount === b.amount && a.currency === b.currency;
  for (const row of rows) {
    if (!row) continue;
    const qty = row.fields.qty;
    const each = row.fields.unit_cost;
    const now = row.fields.price;
    if (typeof qty !== 'number' || !amount(each)) continue;
    const cost = { amount: Math.round(qty * each.amount), currency: each.currency };
    const value = amount(now) ? { amount: Math.round(qty * now.amount), currency: now.currency } : cost;
    const next = {};
    if (!same(row.fields.cost, cost)) next.cost = cost;
    if (!same(row.fields.value, value)) next.value = value;
    if (!('cost' in next) && !('value' in next)) continue;
    ctx.update('holdings#' + row.seq, next, row.version);
  }
}
