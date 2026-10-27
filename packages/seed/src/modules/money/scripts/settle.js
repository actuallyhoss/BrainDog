/**
 * What a payment does to the thing it pays (REC-B11 step 4), as the decision, the script a host runs round it, and the
 * declaration a pack document carries.
 *
 * PAID IS WHAT A PAYMENT DID, NOT A STATUS SOMEBODY REMEMBERED TO SET. Handed a Ledger entry and the bill, instalment
 * or repeating line it pays, `settle` answers with the changes that follow:
 *   - a bill is paid, with the day the money moved, or part paid; either way "Paid so far" holds the sum, and the
 *     payment keeps the link in "Settles", since one bill can take several payments;
 *   - an instalment is paid, with the day, and names the one payment in "Paid by";
 *   - a repeating line moves "Next" one cycle on and keeps the last day and the last amount.
 *
 * IT NEVER CHANGES AN AMOUNT. A payment more than 2% off what was expected is a question, "Rent was GBP 4,200 this
 * time, not GBP 4,000. Change the line?", and the answer is the change: each option carries its own patches at the
 * version the script read, so the gate refuses a pick whose line was edited since. Within 2% it is the same payment,
 * and what was expected stays as written. HANDED `quiet`, AS A RUN A PAYMENT'S ARRIVAL STARTED IS, A REPEATING LINE
 * ASKS NOTHING: the payment is not counted on it, and `left` is the one sentence that says so.
 *
 * "IT WENT THROUGH" IS `told`, WITH NO PAYMENT: a repeating line's "Next" moves one cycle on and nothing else changes.
 *
 * A PAYMENT TAKEN BACK UNPAYS. Handed a payment that is void or pending, `settle` marks nothing paid, and a bill that
 * payment names is counted again from its other payments: open, or part paid with what is left, and no day. A bill a
 * person marked paid by hand, which holds no "Paid so far", is left as it is. A payment deleted is `unsettle.js`'s.
 *
 * TWO CURRENCIES ARE NEVER ADDED OR COMPARED. A payment in another currency than the thing it pays changes nothing and
 * says so, as does money going the other way, and a thing already paid, cancelled or ended.
 *
 * THE DAY "NEXT" MOVES TO IS HANDED IN, as `next`, because it is the walk's own arithmetic (`cycleAfter` in the kernel's
 * forecast) and a sandbox runs this file's text alone: a second copy of the cycle tables here would be a second walk.
 * `cycleOn` below is that call for a caller outside the sandbox, and inside one the host's `ctx.cycle` is
 * (`script.settle_matched_line` in `../rules.ts`). A line handed no day is not moved.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `settle`, AND NOTHING BUT `settle` BY `run`: the two texts together are the script
 * (`SETTLE_SCRIPT.source`).
 */

import { cycleAfter } from '@braindog/kernel';

import { CASH_LEGS } from '../legs.ts';

export function settle(item, payment, opts) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, for the words of a question only: no figure is computed from
     this table, and a code it does not hold reads to two places, as most do. */
  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const words = (m) => {
    const places = PLACES[m.currency] ?? 2;
    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');
    const whole = digits.slice(0, digits.length - places).replace(/\B(?=(\d{3})+$)/g, ',');
    const rest = places === 0 ? '' : digits.slice(-places);
    return `${m.currency} ${m.amount < 0 ? '-' : ''}${whole}${/^0*$/.test(rest) ? '' : `.${rest}`}`;
  };
  const dayWords = (d) => {
    const m = typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);
  };
  /* MORE THAN 2% OFF, in whole minor units: no division, so no rounding decides whether a person is asked. */
  const off = (paid, expected) => Math.abs(paid - expected) * 100 > Math.abs(expected) * 2;

  const f = item.fields;
  const name = String(f.what ?? '').trim() || 'This';
  /* "IT WENT THROUGH", PRESSED ON A REPEATING LINE PAST ITS DAY (`recurring-went-through` in `../rules.ts`), with no
     payment: a person says the money moved, and nothing says how much or on what day. So "Next" moves one cycle on, by
     the same rule as a payment's (a day, later than the one the line names), and nothing else is written: "Last paid"
     and "Last amount" are what a payment showed, and none did. */
  if (opts && opts.told) {
    if (item.list !== 'recurring') return { nothing: `${name} is not a repeating line, so nothing moved.` };
    if (f.state !== 'live') return { nothing: `${name} is not live, so nothing moved.` };
    /* A LINE NO LONGER PAST ITS DAY WAS MOVED SINCE IT WAS ASKED ABOUT, by its payment or a person, and pressing the
       answer again would skip a cycle that has not come yet. `today` is the record's day, which the caller hands. */
    if (typeof opts.today === 'string' && typeof f.next_due === 'string' && f.next_due >= opts.today)
      return { nothing: `${name} is not past its day any more, so nothing moved.` };
    const next = opts.next;
    if (!(typeof next === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(next) && typeof f.next_due === 'string' && next > f.next_due))
      return { nothing: `${name} was handed no later day to move to, so its Next stayed where it was.` };
    return { writes: [{ id: item.spoken, version: item.version, fields: { next_due: next } }], said: `${name} went through for ${dayWords(f.next_due)}, and Next is ${dayWords(next)}.` };
  }
  const p = payment.fields;
  const due = moneyOf(f.amount);
  const paid = moneyOf(p.amount);
  const on = typeof p.on === 'string' ? p.on : '';
  if (!due || !paid || !on) return { nothing: `${name} or its payment has no amount or no day, so nothing was marked paid.` };
  if (due.currency !== paid.currency) return { nothing: `${name} is in ${due.currency} and the payment is in ${paid.currency}, so nothing was marked paid.` };
  const way = item.list === 'obligations' ? { owed_by_me: 'out', owed_to_me: 'in' }[f.direction] : f.direction;
  if (way && p.direction && way !== p.direction) return { nothing: `${name} is money ${way} and the payment is money ${p.direction}, so nothing was marked paid.` };

  /* A PAYMENT PAYS ONE THING. One that already names a bill in "Settles" is that bill's, and marking a second thing paid
     with it would count the same money twice and leave the first bill paid by nothing. */
  const taken = typeof p.settles === 'string' && p.settles !== '';
  if (taken && (item.list !== 'obligations' || p.settles !== item.id)) return { nothing: `The payment already settles something else, so ${name} was not marked paid.` };

  const change = (fields) => ({ id: item.spoken, version: item.version, fields });
  const ask = (question, options) => ({ ask: { cause: `money.settle.${item.spoken}`, question, about: name, options } });

  /* MONEY THAT HAS NOT MOVED PAYS NOTHING, AND MONEY TAKEN BACK UNPAYS. A payment that is pending or void marks nothing
     paid, whoever hands it. One that names a bill has that bill counted again from its other payments (`opts.before`),
     so a bill it had paid goes back to part paid with what is left, or to open with nothing in "Paid so far", and
     loses its day. COUNTED, NOT SUBTRACTED: the sum written is what the other payments come to, so a second run finds
     the bill as the first left it and writes nothing.

     A BILL A PERSON MARKED PAID IS LEFT ALONE. Every close this script makes writes "Paid so far" with it, so a paid
     bill with none was closed by hand, and no payment's status reopens it. */
  if (p.state !== 'cleared') {
    const why = p.state === 'void' ? 'was made void' : 'has not cleared';
    const unpaid = { nothing: `The payment for ${name} ${why}, so nothing was marked paid.` };
    if (item.list !== 'obligations' || p.settles !== item.id) return unpaid;
    if (f.state !== 'open' && f.state !== 'part' && f.state !== 'paid') return { nothing: `${name} is not open, so the payment changed nothing.` };
    const held = moneyOf(f.paid_so_far);
    const counted = held && held.currency === due.currency ? held.amount : null;
    if (f.state === 'paid' && counted === null) return { nothing: `${name} was marked paid by hand, so the payment that ${why} changed nothing.` };
    /* WITH NO COUNT HANDED there is nothing to write the bill back to: what it holds may or may not have this payment in it. */
    if (!opts || !Number.isSafeInteger(opts.before)) return unpaid;
    const left = opts.before;
    /* A SUM SOMEBODY TYPED IS LEFT ALONE. What this script wrote in "Paid so far" is what the cleared
       payments came to: the others alone, or the others and this one while it counted. A sum that is neither was typed
       by hand, and a payment that paid none of it takes none of it away: a bill marked half paid kept its half, and lost
       it the day a pending payment was logged against it. */
    if (counted !== null && counted !== left && counted !== left + paid.amount)
      return { nothing: `${name} has a Paid so far that somebody typed, so the payment that ${why} changed nothing.` };
    const sum = left === 0 ? null : { amount: left, currency: due.currency };
    /* PAYMENTS THAT STILL REACH THE AMOUNT keep the bill as it is: this branch never closes one, and reopens none. */
    const to = left === 0 ? 'open' : left < due.amount ? 'part' : f.state;
    const fields = {};
    if (to !== f.state) fields.state = to;
    if (f.state === 'paid' && to !== 'paid') fields.settled = null;
    if ((counted ?? 0) !== left) fields.paid_so_far = sum;
    if (Object.keys(fields).length === 0) return unpaid;
    if (left === 0) return { writes: [change(fields)], said: `${name} is open again, since its payment ${why}.` };
    if (left < due.amount) return { writes: [change(fields)], said: `${name} is part paid, ${words(sum)} of ${words(due)}, since one of its payments ${why}.` };
    return { writes: [change(fields)], said: `${name} still has ${words(sum)} paid, since one of its payments ${why}.` };
  }

  if (item.list === 'obligations') {
    if (f.state !== 'open' && f.state !== 'part') return { nothing: `${name} is not open, so the payment changed nothing.` };
    /* WHAT WAS PAID BEFORE THIS PAYMENT: the sum the caller counted from the payments that name the bill, and failing
       that the bill's own "Paid so far", when it is in the bill's currency. */
    const held = moneyOf(f.paid_so_far);
    const before = opts && Number.isSafeInteger(opts.before) ? opts.before : held && held.currency === due.currency ? held.amount : 0;
    const total = { amount: before + paid.amount, currency: due.currency };
    /* THE LINK STAYS ON THE PAYMENT, and is written only where it is not there yet. */
    const link = p.settles === item.id ? [] : [{ id: payment.spoken, version: payment.version, fields: { settles: item.id } }];
    const closed = [change({ state: 'paid', settled: on, paid_so_far: total }), ...link];
    /* RUN AGAIN FOR A PAYMENT ALREADY COUNTED, the bill holds this sum and the link: nothing is written a second time. */
    if (total.amount < due.amount && f.state === 'part' && link.length === 0 && held && held.currency === due.currency && held.amount === total.amount)
      return { nothing: `${name} already counts this payment, so nothing changed.` };
    if (total.amount < due.amount)
      return { writes: [change({ state: 'part', paid_so_far: total }), ...link], said: `${name} is part paid: ${words(total)} of ${words(due)}.` };
    if (off(total.amount, due.amount))
      /* SEVERAL PAYMENTS ARE NOT "THIS TIME": the sum is said as a sum once an earlier payment is in it. */
      return ask(before === 0 ? `${name} was ${words(total)} this time, not ${words(due)}. Mark it paid?` : `The payments for ${name} come to ${words(total)}, not ${words(due)}. Mark it paid?`, [
        { label: 'Mark it paid', because: `It is paid on ${dayWords(on)}, and keeps ${words(due)} as its amount.`, patches: closed },
        { label: 'Leave it open', because: 'Nothing changes, and it stays in what is still to pay.' },
      ]);
    return { writes: closed, said: `${name} is paid, on ${dayWords(on)}.` };
  }

  if (item.list === 'installments') {
    if (f.state !== 'open') return { nothing: `${name} is not open, so the payment changed nothing.` };
    const closed = [change({ state: 'paid', settled: on, paid_by: payment.id })];
    if (off(paid.amount, due.amount))
      return ask(`${name} was ${words(paid)} this time, not ${words(due)}. Mark it paid?`, [
        { label: 'Mark it paid', because: `It is paid on ${dayWords(on)}, and keeps ${words(due)} as its amount.`, patches: closed },
        { label: 'Leave it open', because: 'Nothing changes, and it stays in what is still to pay.' },
      ]);
    return { writes: closed, said: `${name} is paid, on ${dayWords(on)}.` };
  }

  if (item.list === 'recurring') {
    if (f.state !== 'live') return { nothing: `${name} is not live, so the payment changed nothing.` };
    /* THE SAME PAYMENT HANDED TWICE MOVES THE LINE ONCE: a payment on or before the last one counted is that one or an
       older one, and "Next" has already moved past it. */
    if (typeof f.last_paid === 'string' && on <= f.last_paid) return { nothing: `${name} already counts a payment on ${dayWords(f.last_paid)}, so nothing moved.` };
    /* A RUN NOBODY PRESSED ASKS NOTHING (`opts.quiet`, as a payment's arrival hands it): the payment is not counted on
       the line, whatever day it would move to, and the one sentence that says why is the caller's to keep on the payment. */
    if (off(paid.amount, due.amount) && opts && opts.quiet)
      return { left: `${words(paid)} is not the ${words(due)} ${name} repeats at, so this payment was not counted on it.` };
    const next = opts ? opts.next : undefined;
    /* A DAY, AND A LATER ONE THAN THE LINE NAMES, or no day at all (`null`, below). Anything else was worked out from a
       line that has moved since, and writing it would walk "Next" backwards. */
    const later = typeof next === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(next) && typeof f.next_due === 'string' && next > f.next_due;
    if (next === undefined || (next !== null && !later)) return { nothing: `${name} was handed no later day to move to, so its Next stayed where it was.` };
    const last = { last_paid: on, last_amount: paid };
    /* NO LATER DAY, past the line's end or on a cycle nobody can read: the payment is kept and "Next" stays. */
    const moved = later ? { next_due: next, ...last } : last;
    const said = moved.next_due ? `${name} is paid for ${dayWords(f.next_due)}, and Next is ${dayWords(next)}.` : `${name} is paid for ${dayWords(f.next_due)}, and has no later day.`;
    if (off(paid.amount, due.amount))
      return ask(`${name} was ${words(paid)} this time, not ${words(due)}. Change the line?`, [
        { label: 'Change the line', because: `Every payment ahead is counted at ${words(paid)}.`, patches: [change({ ...moved, amount: paid })] },
        { label: `Keep ${words(due)}`, because: `This payment was a one-off, and the ones ahead stay at ${words(due)}.`, patches: [change(moved)] },
      ]);
    return { writes: [change(moved)], said };
  }

  return { nothing: `${name} is in a list a payment does not settle, so nothing changed.` };
}

/**
 * The script: `input.payment` and `input.item` are the two things as a person names them ("transactions#12",
 * "recurring#7") or as a rule hands them, by id, since a rule's step can fill in an id and no handle; and `input.next`
 * the day a repeating line moves to. It reads both, asks `settle`, and either makes the
 * changes at the versions it read or ends its run with the one question.
 *
 * A BILL'S "PAID SO FAR" IS COUNTED, NOT ADDED TO. Every payment that names the bill in "Settles" is read and summed,
 * this one left out and then put in, so a run started twice for one payment, or for a payment a person linked by hand
 * before the rule fired, writes the same sum and never the sum plus one more. ONLY MONEY THAT HAS CLEARED IS COUNTED:
 * a pending or void entry that names the bill has paid nothing yet. That holds for the payment handed too: made void
 * after it counted, it starts this run again (the rule fires on the status), and the same count without it is what
 * the bill is written back to.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const named = async (said) => {
    if (typeof said !== 'string' || said === '') return null;
    if (/^[a-z_]+#\d+$/.test(said)) return said;
    if (!/^[0-9A-Za-z_-]+$/.test(said)) return null;
    const row = await ctx.record.get(said);
    return row && typeof row.register === 'string' && Number.isSafeInteger(row.seq) ? `${row.register}#${row.seq}` : null;
  };
  const [paymentAt, itemAt] = [await named(input.payment), await named(input.item)];
  if (!paymentAt || !itemAt || !paymentAt.startsWith('transactions#')) {
    ctx.log('The script was handed no payment or nothing for it to pay, so nothing was marked paid.');
    return null;
  }
  const [paymentRow, itemRow] = [await ctx.record.get(paymentAt), await ctx.record.get(itemAt)];
  /* A PAYMENT DELETED BEFORE THIS RUN READ IT marks nothing paid, and its bill is counted again by `script.unsettle`
     (`unsettle.js`), which its delete starts. */
  if (!paymentRow) {
    ctx.log('The payment was deleted, so nothing was marked paid.');
    return null;
  }
  if (!itemRow) {
    ctx.log('The thing this payment was to pay is no longer in the record, so nothing was marked paid.');
    return null;
  }
  const item = { list: itemAt.split('#')[0], id: itemRow.id, spoken: itemAt, version: itemRow.version, fields: itemRow.fields };
  const payment = { id: paymentRow.id, spoken: paymentAt, version: paymentRow.version, fields: paymentRow.fields };

  const opts = {};
  if ('next' in input) opts.next = input.next;
  if (item.list === 'obligations') {
    const currency = item.fields.amount && item.fields.amount.currency;
    const others = await ctx.record.list('transactions', { field: 'settles', is: item.id });
    opts.before = 0;
    for (const other of others) {
      const m = other.fields.amount;
      /* ONE CURRENCY ONLY: a payment in another is left out of the sum rather than added to it. */
      if (other.id === payment.id || other.fields.state !== 'cleared' || !m || m.currency !== currency || !Number.isSafeInteger(m.amount)) continue;
      opts.before += m.amount;
    }
  }

  const out = settle(item, payment, opts);
  if (out.nothing || out.left) {
    ctx.log(out.nothing || out.left);
    return null;
  }
  if (out.ask) return { ask: out.ask };
  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(out.said);
  return { settled: item.spoken };
}

/**
 * The day a repeating line's "Next" moves to once the cycle it names is paid, or `null` when it has none: the kernel's
 * `cycleAfter` on Cash ahead's own leg for Repeating (`CASH_LEGS`), so the day written is the day the forecast walks
 * next. FROM THE DAY THE LINE NAMES, NOT THE DAY THE MONEY MOVED: rent due on the 1st and paid on 29 September still
 * moves to 1 November. `rest` is the record's rest days (`restDaysOf`), and none moves nothing.
 */
export function cycleOn(fields, rest) {
  const leg = CASH_LEGS.find((l) => l.register === 'recurring');
  if (!leg || typeof fields.next_due !== 'string') return null;
  return cycleAfter(fields.next_due, { leg, fields, ...(rest ? { rest } : {}) });
}

/**
 * The script as Money's pack document writes it, as `LAST_DAY_SCRIPT` is: no egress, no keys, started by a rule and
 * never by the clock, reading and writing the three lists a payment settles and the Ledger, where a bill's link lives.
 */
export const SETTLE_SCRIPT = {
  script: 'settle',
  title: 'Mark what a payment paid',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['obligations', 'installments', 'recurring', 'transactions'],
  writes: ['obligations', 'installments', 'recurring', 'transactions'],
  source: `${settle.toString()}\nexport default ${run.toString()}`,
};
