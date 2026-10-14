export default async function run(ctx) {
  const task = await ctx.record.get(ctx.input.id);
  if (!task || !task.fields.parent) return;
  const parent = await ctx.record.get(task.fields.parent);
  if (!parent) return;
  const patch = {};
  for (const field of ['thing', 'track', 'owner'])
    if (!task.fields[field] && parent.fields[field]) patch[field] = parent.fields[field];
  const name = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const by = ctx.input.made_by;
  const maker = by !== null && typeof by === 'object' ? name(by.agent) : '';
  if (!task.fields.agent && maker !== '' && maker !== 'other' && maker === name(parent.fields.agent)) patch.agent = parent.fields.agent;
  if (Object.keys(patch).length > 0) ctx.update('tasks#' + task.seq, patch, task.version);
}