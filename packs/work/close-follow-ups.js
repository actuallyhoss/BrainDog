export default async function run(ctx) {
  const parent = await ctx.record.get(ctx.input.id);
  if (!parent || parent.fields.state !== 'done') return;
  const steps = await ctx.record.list('tasks', { all: [{ field: 'parent', is: parent.id }, { field: 'state', in: ['open', 'doing', 'blocked'] }] });
  const line = 'Closed with ' + parent.fields.what + ' (tasks#' + parent.seq + ').';
  for (const step of steps) {
    const note = typeof step.fields.note === 'string' && step.fields.note.trim() !== '' ? step.fields.note + '\n\n' + line : line;
    ctx.update('tasks#' + step.seq, { state: 'done', note }, step.version);
  }
}