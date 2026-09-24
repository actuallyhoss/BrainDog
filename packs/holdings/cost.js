export default async function run(ctx) {
  const row = await ctx.record.get(ctx.input.id);
  if (!row) return;
  const qty = row.fields.qty;
  const each = row.fields.unit_cost;
  if (typeof qty !== 'number' || !each || typeof each.amount !== 'number' || typeof each.currency !== 'string') return;
  const cost = { amount: Math.round(qty * each.amount), currency: each.currency };
  const had = row.fields.cost;
  if (had && had.amount === cost.amount && had.currency === cost.currency) return;
  ctx.update('holdings#' + row.seq, { cost }, row.version);
}
