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
