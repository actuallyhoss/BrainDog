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
 * A BUSY RANGE IS READ WHOLE. The record answers a page at a time, so a window that comes back full is cut in two by
 * day and each half asked again. A single day holding more lines than a page files the first page of it and says so.
 *
 * IT WRITES THE LINE'S TRIP AND NOTHING ELSE, and the automation watches only the trip's own list, so it does not
 * start itself again.
 */

const PAGE = 50;
const DAY_MS = 86_400_000;
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
const dayOf = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Lines on a day after `from` and on or before `to` that no trip holds yet. */
const unfiledIn = (ctx, from, to) =>
  ctx.record.list('transactions', {
    all: [{ field: 'on', gt: from }, { field: 'on', lte: to }, { field: 'trip', empty: true }, { field: 'state', not: 'void' }, { field: 'transfer', is: false }],
  });

async function allIn(ctx, from, to, spilled) {
  const rows = await unfiledIn(ctx, from, to);
  if (rows.length < PAGE) return rows;
  const low = dayNumber(from);
  const high = dayNumber(to);
  if (high - low <= 1) {
    spilled.push(to);
    return rows;
  }
  const mid = dayOf(Math.floor((low + high) / 2));
  return [...(await allIn(ctx, from, mid, spilled)), ...(await allIn(ctx, mid, to, spilled))];
}

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
  const spilled = [];
  const rows = await allIn(ctx, dayOf(dayNumber(from) - 1), to, spilled);
  for (const r of rows) ctx.update(`transactions#${r.seq}`, { trip: trip.id }, r.version);
  ctx.log(`Filed ${rows.length} lines into ${String(trip.fields.name)}.`);
  if (spilled.length > 0) ctx.log(`More than ${PAGE} unfiled lines fall on ${spilled.join(', ')}; the first ${PAGE} of each were filed. Save the trip again to file more.`);
}
