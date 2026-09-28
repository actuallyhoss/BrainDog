/**
 * What each holding cost: its quantity times what one unit cost, written into `cost` in the unit cost's currency.
 *
 * STARTED WITH A ROW'S ID when its quantity or unit cost changes, it costs that row. Started with no id, once a day,
 * it costs every holding whose `cost` is still empty, so rows written before the add-on was installed are costed too.
 * A row missing either number, or already holding the same cost, is left as it is.
 */
export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  const rows = id ? [await ctx.record.get(id)] : await ctx.record.list('holdings', { field: 'cost', empty: true });
  for (const row of rows) {
    if (!row) continue;
    const qty = row.fields.qty;
    const each = row.fields.unit_cost;
    if (typeof qty !== 'number' || !each || typeof each.amount !== 'number' || typeof each.currency !== 'string') continue;
    const cost = { amount: Math.round(qty * each.amount), currency: each.currency };
    const had = row.fields.cost;
    if (had && had.amount === cost.amount && had.currency === cost.currency) continue;
    ctx.update('holdings#' + row.seq, { cost }, row.version);
  }
}
