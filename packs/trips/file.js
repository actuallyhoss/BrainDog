/**
 * Trips: the lines of the Ledger that fall inside a trip's dates, filed into the trip.
 *
 * STARTED BY THE PACK'S AUTOMATION WHEN A TRIP IS CREATED OR ITS FROM OR TO CHANGES, which hands it the trip's id.
 *
 * ONLY LINES NOBODY HAS FILED. A line already in a trip, this one or another, stays where it is, so a person's choice
 * is never written over and two trips that overlap do not fight: the first to be written keeps the days they share.
 * A line the Ledger counts as void is left out, and so is a move between a person's own accounts.
 *
 * A TRIP WITHOUT BOTH DATES FILES NOTHING. A line is filed by its day, and a trip with one end has no range.
 *
 * A BUSY RANGE IS READ WHOLE. The record answers a page of fifty at a time with no cursor, so the lines are asked for
 * by number, halves of the range cut again while they come back full; past sixty reads it files what it has and says so.
 *
 * IT WRITES THE LINE'S TRIP AND NOTHING ELSE, and the automation watches only the trip's own list, so it does not
 * start itself again.
 */

const DAY_MS = 86_400_000;
const dayOf = (day) => new Date(Date.parse(`${day}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);

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

/** Lines on a day after `from` and on or before `to` that no trip holds yet. */
const allIn = (ctx, from, to) =>
  every(ctx, 'transactions', { all: [{ field: 'on', gt: from }, { field: 'on', lte: to }, { field: 'trip', empty: true }, { field: 'state', not: 'void' }, { field: 'transfer', is: false }] });

export default async function run(ctx) {
  const trip = await ctx.record.get(String(ctx.input.id));
  if (trip === null) {
    ctx.log('The trip that started this run is gone, so nothing was filed.');
    return;
  }
  const from = typeof trip.fields.from === 'string' ? trip.fields.from.slice(0, 10) : '';
  const to = typeof trip.fields.to === 'string' ? trip.fields.to.slice(0, 10) : '';
  if (from === '' || to === '' || to < from) {
    ctx.log(`${String(trip.fields.name)} has no usable dates, so nothing was filed.`);
    return;
  }
  const rows = await allIn(ctx, dayOf(from), to);
  const short = rows.short === true;
  for (const r of rows) ctx.update(`transactions#${r.seq}`, { trip: trip.id }, r.version);
  ctx.log(`Filed ${rows.length} lines into ${String(trip.fields.name)}.`);
  if (short) ctx.log(`There are more unfiled lines in those dates than one run reads, so ${rows.length} were filed. Save the trip again to file more.`);
}
