/**
 * Receipts: a receipt sent in on its own finds its Ledger line, and a line in a category that keeps receipts says it
 * wants one.
 *
 * A RECEIPT FINDS ITS LINE BY AMOUNT AND DAY. Money out that has not been made void, in the same currency and for the
 * same amount to the smallest unit, three days either side of the receipt's day, and with no receipt yet. EXACTLY ONE
 * IS THE LINE: the picture is put on it and the receipt is marked On its line. SEVERAL ARE ONE QUESTION, with each line
 * as an answer and "None of these". None leaves it waiting, and each night the waiting ones look again, so a card
 * payment that lands two days later still finds its receipt.
 *
 * A RECEIPT YOU POINT AT A LINE yourself ("Ledger line") is put on that line at once.
 *
 * A LINE WRITTEN, money out and cleared, looks the other way: a waiting receipt with its amount and a day near its own
 * is put on it when there is exactly one. And when its category keeps receipts and it has none, it is marked "Wants a
 * receipt", which the Receipts page counts for this month and last.
 *
 * IT WRITES THE LINE'S RECEIPT AND ITS MARK, AND THE RECEIPT'S STATE AND LINE. The automations watch neither the mark nor
 * the state, so the only write that starts it again is a receipt put on a line, which then finds nothing left to do.
 */

const DAY_MS = 86_400_000;
const NEAR = 3;
const money = (m) => m && typeof m === 'object' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string';
const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
const shift = (day, n) => new Date(Date.parse(day.slice(0, 10) + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const sameMoney = (a, b) => money(a) && money(b) && a.amount === b.amount && a.currency === b.currency;
const hasFile = (v) => v && typeof v === 'object' && typeof v.sha256 === 'string';

async function linesNear(ctx, receipt) {
  const f = receipt.fields;
  const rows = await ctx.record.list('transactions', {
    all: [
      { field: 'direction', is: 'out' },
      { field: 'on', gte: shift(f.on, -NEAR) },
      { field: 'on', lte: shift(f.on, NEAR) },
      { field: 'state', not: 'void' },
    ],
  });
  return rows.filter((r) => sameMoney(r.fields.amount, f.amount) && !hasFile(r.fields.receipt));
}

function put(ctx, receipt, line) {
  ctx.update('transactions#' + line.seq, { receipt: receipt.fields.picture }, line.version);
  ctx.update('receipts#' + receipt.seq, { state: 'matched', line: line.id }, receipt.version);
}

const named = (line) => String(line.fields.what || 'A line') + ' on ' + String(line.fields.on).slice(0, 10);

async function fromReceipt(ctx, receipt) {
  const f = receipt.fields;
  if (f.state !== 'waiting' || !hasFile(f.picture)) return null;
  if (typeof f.line === 'string' && f.line !== '') {
    const line = await ctx.record.get(f.line);
    if (line && line.register === 'transactions') put(ctx, receipt, line);
    return null;
  }
  if (!money(f.amount) || !isDay(f.on)) return null;
  const found = await linesNear(ctx, receipt);
  if (found.length === 0) {
    ctx.log('No line yet for the receipt from ' + String(f.shop || 'a shop') + '; it waits and looks again tonight.');
    return null;
  }
  if (found.length === 1) {
    put(ctx, receipt, found[0]);
    return null;
  }
  const spoken = 'receipts#' + receipt.seq;
  return {
    ask: {
      cause: 'receipts.match.' + spoken,
      question: 'Which line is the receipt from ' + String(f.shop || 'this shop') + ' for?',
      about: spoken,
      options: found
        .slice(0, 6)
        .map((line) => ({
          label: named(line),
          because: 'The picture goes on this line, and the receipt is marked On its line.',
          patches: [
            { id: 'transactions#' + line.seq, version: line.version, fields: { receipt: f.picture } },
            { id: spoken, version: receipt.version, fields: { state: 'matched', line: line.id } },
          ],
        }))
        .concat([{ id: 'none', label: 'None of these', because: 'The receipt stays waiting for its line.' }]),
    },
  };
}

async function fromLine(ctx, line) {
  const f = line.fields;
  if (f.direction !== 'out' || f.state !== 'cleared' || !money(f.amount) || !isDay(f.on)) return;
  if (hasFile(f.receipt)) return;
  const waiting = await ctx.record.list('receipts', {
    all: [
      { field: 'state', is: 'waiting' },
      { field: 'on', gte: shift(f.on, -NEAR) },
      { field: 'on', lte: shift(f.on, NEAR) },
    ],
  });
  const found = waiting.filter((r) => sameMoney(r.fields.amount, f.amount) && hasFile(r.fields.picture) && !(typeof r.fields.line === 'string' && r.fields.line !== ''));
  if (found.length === 1) {
    put(ctx, found[0], line);
    return;
  }
  if (f.receipt_wanted !== true && typeof f.category === 'string' && f.category !== '') {
    const cat = await ctx.record.get(f.category);
    if (cat && cat.register === 'categories' && cat.fields.wants_receipt === true) ctx.update('transactions#' + line.seq, { receipt_wanted: true }, line.version);
  }
}

export default async function run(ctx) {
  const id = ctx.input && ctx.input.id;
  if (id) {
    const row = await ctx.record.get(String(id));
    if (!row) return null;
    if (row.register === 'receipts') return fromReceipt(ctx, row);
    if (row.register === 'transactions') await fromLine(ctx, row);
    return null;
  }
  /* EACH NIGHT: every receipt still waiting looks for its line once more, and asks nothing. */
  const waiting = await ctx.record.list('receipts', { all: [{ field: 'state', is: 'waiting' }] });
  let done = 0;
  for (const r of waiting) {
    if (!money(r.fields.amount) || !isDay(r.fields.on) || !hasFile(r.fields.picture)) continue;
    const found = await linesNear(ctx, r);
    if (found.length === 1) {
      put(ctx, r, found[0]);
      done += 1;
    }
  }
  if (done > 0) ctx.log('Put ' + done + ' waiting receipts on their lines.');
  return null;
}
