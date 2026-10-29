/**
 * The script that moves a repeating line on when it is paid, by a payment or by "It went through", out of `rules.ts`
 * so that file stays under its size. `rules.ts` hands it on as it did.
 */

import { CASH_LEGS } from './legs.ts';
import matchRun, { matchPayment } from './scripts/match-payment.js';
import { settle } from './scripts/settle.js';
import { BILL_KINDS, categoriesFor, fileUnder } from './scripts/file-paid.js';

/** WHAT THE WALK READS OF A REPEATING LINE TO STEP IT, Cash ahead's own leg (`CASH_LEGS`), written into the script as
 * data since a sandbox imports nothing: the day `ctx.cycle` answers is the day the forecast walks. */
const LINE_LEG = (({ on, every, ends, days, weekend }) => ({ on, every, ends, days, weekend }))(CASH_LEGS.find((l) => l.register === 'recurring')!);

/**
 * A REPEATING LINE MARKED PAID BY ITS PAYMENT (repeating-settle-79-80), HELD SINCE repeat-next-80b-82 AND BACK SINCE
 * money-next-moves-100: `payment-matches` starts it second, and "It went through" starts it on the line.
 *
 * IT WRITES ALL THREE OR NOTHING, by the host's `ctx.cycle(day, line)`: "Next" one cycle on, "Last paid" and "Last
 * amount", in one write through `settle`; no `ctx.cycle` or no later day writes nothing (twin bills: `move-line.js`).
 *
 * IT FINDS THE LINE AGAIN, since a step is handed the id of the job before it and never its answer: `match_payment`'s
 * own search, its writes and words held back, then `settle` for that one repeating line. A bill or an instalment is
 * marked by its link, and several things that fit are left, so this ends without a word for them.
 *
 * NOTHING ASKS BY ITSELF. A payment more than 2% off the line's amount is not counted on it (`quiet`), and one sentence
 * says so in the payment's note, where it has none, and in the run. Payments already in the record are not matched:
 * REC-B11 step 7 is not built. "IT WENT THROUGH" IS `settle` TOLD (`told`), a person's answer: "Next" moves one cycle
 * on, and not at all on a line no longer past its day, which its payment moved since it was asked. AND THE ONE OPEN BILL
 * FOR THE SAME MONEY IS MARKED PAID ON THE DAY OF THE ANSWER (`paidBill`): he said the money went, and a bill left open
 * for it read late on Today the morning after.
 * `settle` IS BOUND BY NAME: the Worker's bundle renamed it (`settle3`), and the body below, text, called `settle`.
 *
 * A LINE PAID IS SPENDING, SINCE money-core 3.32.2 (file-paid): the payment it counted, filed under a category whose money
 * stays yours or under none, is filed under the line's own category in the same write (`scripts/file-paid.js`).
 */
export const SETTLE_LINE_SCRIPT = {
  script: 'settle_matched_line',
  title: 'Mark a repeating line paid by its payment',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['categories', 'obligations', 'installments', 'recurring', 'transactions'],
  writes: ['obligations', 'recurring', 'transactions'],
  source: `${matchPayment.toString()}
const settle = ${settle.toString()};
const fileUnder = ${fileUnder.toString()};
const categoriesFor = ${categoriesFor.toString()};
const KINDS = ${JSON.stringify(BILL_KINDS)};
const find = ${matchRun.toString()};
const LEG = ${JSON.stringify(LINE_LEG)};
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const over = (more) => Object.create(ctx, Object.fromEntries(Object.entries(more).map(([name, value]) => [name, { value }])));
  const shaped = (at, row) => ({ list: at.split('#')[0], id: row.id, spoken: at, version: row.version, fields: row.fields });
  const say = (words) => (ctx.log(words), null);
  const unmoved = 'This repeating line was handed no day to move to, so nothing on it changed.';
  /* THE WALK'S DAY, OR NONE: a line it cannot step, or a step that failed. */
  const dayAfter = (fields) => Promise.resolve().then(() => ctx.cycle(fields.next_due, { leg: LEG, fields })).then((d) => (typeof d === 'string' ? d : undefined), () => undefined);
  const write = (out, at) => {
    if (!out.writes) return say(out.nothing || out.left || 'Nothing was asked, and nothing on the line changed.');
    for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
    ctx.log(out.said);
    return { settled: at };
  };
  /* THE ONE OPEN BILL FOR A LINE'S MONEY, marked paid on the day it was answered: the same way, the same currency, the
     same name (letters and digits, as \`move_line\` compares them) and a due day within ten days of the line's Next.
     None, or more than one, and no bill is touched. */
  const paidBill = async (line, today) => {
    const way = { out: 'owed_by_me', in: 'owed_to_me' }[line.direction];
    const money = line.amount && typeof line.amount === 'object' ? line.amount : null;
    const day = typeof line.next_due === 'string' ? Date.parse(line.next_due + 'T00:00:00Z') : NaN;
    const plain = (t) => (typeof t === 'string' ? t.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '') : '');
    if (!way || !money || Number.isNaN(day) || !plain(line.what) || typeof today !== 'string') return null;
    const from = (n) => new Date(day + n * 86400000).toISOString().slice(0, 10);
    const rows = await ctx.record.list('obligations', { all: [{ field: 'state', in: ['open', 'part'] }, { field: 'direction', is: way }, { field: 'due', between: [from(-10), from(10)] }] });
    const found = rows.filter((r) => r.fields.amount && r.fields.amount.currency === money.currency && plain(r.fields.what) === plain(line.what) && String(r.fields.due) <= today);
    if (found.length !== 1) return null;
    const bill = found[0];
    ctx.update('obligations#' + bill.seq, { state: 'paid', settled: today }, bill.version);
    ctx.log((String(bill.fields.what).trim() || 'The bill') + ' is marked paid, since you said it went through.');
    return { settled: 'obligations#' + bill.seq };
  };

  if (input.answer === 'It went through') {
    const at = input.register === 'recurring' && Number.isSafeInteger(input.seq) ? 'recurring#' + input.seq : null;
    const row = at ? await ctx.record.get(at) : null;
    if (!row) return say('The answer named no repeating line, so nothing moved.');
    const today = typeof ctx.today === 'function' ? await ctx.today() : undefined;
    /* THE BILL FOR THE SAME MONEY IS PAID TOO: "it went through" is said of the money, and a bill left open for it read
       late on Today the day after he said so. Marked whether or not the line can be moved on. */
    const bill = await paidBill(row.fields, today);
    if (typeof ctx.cycle !== 'function') return (say(unmoved), bill);
    const moved = write(settle(shaped(at, row), null, { told: true, next: await dayAfter(row.fields), today }), at);
    return moved ?? bill;
  }

  const found = await find(over({ input: { payment: input.payment }, update: () => {}, log: () => {} }));
  if (!found) return null;
  /* ONE LINE, FOUND BY ITSELF OR OFFERED ALONE: an offer of one line is a line whose amount is off. */
  const offered = found.ask ? found.ask.options.filter((o) => o.id !== 'none') : [];
  const at = found.ask ? (offered.length === 1 && /^recurring-\\d+$/.test(offered[0].id) ? offered[0].id.replace('-', '#') : null) : found.list === 'recurring' ? found.matched : null;
  if (!at) return null;
  if (typeof ctx.cycle !== 'function') return say(unmoved);
  const [paymentRow, lineRow] = [await ctx.record.get(input.payment), await ctx.record.get(at)];
  if (!paymentRow || !lineRow || !Number.isSafeInteger(paymentRow.seq)) return null;
  const payment = shaped('transactions#' + paymentRow.seq, paymentRow);
  const out = settle(shaped(at, lineRow), payment, { next: await dayAfter(lineRow.fields), quiet: true });
  /* COUNTED ON THE LINE, THE PAYMENT IS WHAT THE LINE IS FOR: filed under its category where it was money that stays yours. */
  if (out.writes) {
    const categories = await categoriesFor(ctx, payment.fields);
    const filed = categories ? fileUnder(payment, shaped(at, lineRow), categories, KINDS) : null;
    if (filed && filed.writes) out.writes.push(...filed.writes), (out.said += ' ' + filed.said);
  }
  /* SAID ON THE PAYMENT, WHERE IT HOLDS NO NOTE OF ITS OWN: a person's words are never written over. */
  if (out.left && !(typeof payment.fields.note === 'string' && payment.fields.note.trim() !== '')) ctx.update(payment.spoken, { note: out.left }, payment.version);
  return write(out, at);
}`,
};
