export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  const rows = id ? [await ctx.record.get(id)] : await ctx.record.list('checks', {});
  for (const row of rows) {
    if (!row) continue;
    const parts = [row.fields.making, row.fields.packing, row.fields.sending].filter((n) => typeof n === 'number');
    const cost = parts.length === 0 ? null : Math.round(parts.reduce((sum, n) => sum + n, 0) * 100) / 100;
    if ((row.fields.cost ?? null) === cost) continue;
    ctx.update('checks#' + row.seq, { cost }, row.version);
  }
}
