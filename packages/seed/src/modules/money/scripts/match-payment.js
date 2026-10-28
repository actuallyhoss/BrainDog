/**
 * A payment that names nothing finds what it pays, as the decision, the script a host runs round it,
 * and the declaration a pack document carries. `settle.js` is what the link then does; this file only finds the link.
 *
 * WHAT IT LOOKS FOR. Handed a cleared Ledger entry that settles nothing and that no instalment names, and the open
 * bills, instalments and repeating lines, `matchPayment` keeps the ones going the same way, in the same currency, to
 * the same payee, with a day within ten days of the day the money moved. EXACTLY ONE, FOR THE SAME MONEY, IS THE LINK.
 * More than one, or one whose amount is more than 2% off, is a question with those things as its answers.
 *
 * IT NEVER CHANGES AN AMOUNT, and marks nothing paid. The link is the only thing written: "Settles" on the payment for
 * a bill, since one bill can take several payments, and "Paid by" on an instalment, which names its one payment. A
 * repeating line holds no link, so nothing is written for it and the link is what the run answers with. Marking the
 * thing paid, and the question about an amount that changed, are `settle`'s.
 *
 * TWO CURRENCIES ARE NEVER COMPARED: a thing in another currency than the payment is not a candidate at all.
 *
 * A PART-PAID BILL IS MATCHED ON WHAT IS LEFT OF IT, the amount less "Paid so far" when both are in one currency.
 *
 * THE PAYEE'S KEY IS HANDED IN, as `fold`, because folding a bank's spelling of a payee is the kernel's own
 * (`bankKey`: the processor's prefix, the place and the reference numbers cut) and a sandbox runs this file's text
 * alone: a second copy of those tables here would be a second idea of who a payee is. `payeeKey` below is that call
 * for a caller outside the sandbox, and a host that hands a script `ctx.fold` hands the same one. HANDED NONE, A NAME
 * IS COMPARED BY ITS LETTERS AND DIGITS ALONE, so `NORTHGATE ESTATES` is `Northgate Estates` and nothing wider: the
 * plain fold can miss a match and cannot make one the kernel's would not.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `matchPayment`, AND NOTHING BUT `matchPayment` BY `run`: the two texts together
 * are the script (`MATCH_PAYMENT_SCRIPT.source`).
 */

import { bankKey } from '@braindog/kernel';

export function matchPayment(payment, items, opts) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* THE CURRENCIES WHOSE MINOR UNIT IS NOT A HUNDREDTH, for the words of a question only, as in `settle.js`. */
  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };
  const NONE = 'None of these';
  /* HOW FAR APART THE TWO DAYS MAY BE, and how many things one question offers: the nearest, never a page of them. */
  const DAYS = 10;
  const MOST = 6;
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const words = (m) => {
    const places = PLACES[m.currency] ?? 2;
    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');
    const whole = digits.slice(0, digits.length - places).replace(/\B(?=(\d{3})+$)/g, ',');
    const rest = places === 0 ? '' : digits.slice(-places);
    return `${m.currency} ${m.amount < 0 ? '-' : ''}${whole}${/^0*$/.test(rest) ? '' : `.${rest}`}`;
  };
  const dayOf = (d) => (typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null);
  const dayWords = (d) => {
    const m = dayOf(d);
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d);
  };
  /* WHOLE DAYS BETWEEN TWO DAYS, counted on the calendar and never on a clock, so no zone moves the tenth day. */
  const apart = (a, b) => {
    const [x, y] = [dayOf(a), dayOf(b)];
    if (!x || !y) return null;
    return Math.abs(Date.UTC(Number(x[1]), Number(x[2]) - 1, Number(x[3])) - Date.UTC(Number(y[1]), Number(y[2]) - 1, Number(y[3]))) / 86_400_000;
  };
  /* MORE THAN 2% OFF, in whole minor units: no division, so no rounding decides whether a person is asked. */
  const off = (paid, expected) => Math.abs(paid - expected) * 100 > Math.abs(expected) * 2;
  const plain = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || null;
  const fold = opts && typeof opts.fold === 'function' ? opts.fold : plain;
  const keysOf = (texts) => {
    const keys = [];
    for (const text of texts) {
      const key = typeof text === 'string' && text.trim() !== '' ? fold(text) : null;
      if (typeof key === 'string' && key !== '' && !keys.includes(key)) keys.push(key);
    }
    return keys;
  };

  const p = payment.fields;
  const paid = moneyOf(p.amount);
  const on = typeof p.on === 'string' && dayOf(p.on) ? p.on : '';
  if (!paid || !on) return { nothing: 'The payment has no amount or no day, so nothing was looked for.' };
  if (p.state !== 'cleared') return { nothing: 'The payment has not cleared, so nothing was looked for.' };
  if (typeof p.settles === 'string' && p.settles !== '') return { nothing: 'The payment already settles a bill, so nothing else was looked for.' };
  if (items.some((i) => i.list === 'installments' && i.fields.paid_by === payment.id)) return { nothing: 'An instalment already names this payment, so nothing else was looked for.' };
  /* WHO IT WAS PAID TO OR FROM: the name a person gave, the bank's words, and the description, each folded. */
  const mine = keysOf([p.payee, p.counterparty_text, p.what]);
  if (mine.length === 0) return { nothing: 'The payment names nobody, so nothing was looked for.' };
  const who = [p.payee, p.counterparty_text, p.what].find((t) => typeof t === 'string' && t.trim() !== '').trim();
  /* MONEY IN CAME FROM SOMEBODY, and is never said as paid to them. */
  const whom = `${p.direction === 'in' ? 'from' : 'to'} ${who}`;

  const found = [];
  for (const item of items) {
    const f = item.fields;
    const bill = item.list === 'obligations';
    const line = item.list === 'recurring';
    if (!bill && !line && item.list !== 'installments') continue;
    if (bill ? f.state !== 'open' && f.state !== 'part' : f.state !== (line ? 'live' : 'open')) continue;
    const way = bill ? { owed_by_me: 'out', owed_to_me: 'in' }[f.direction] : f.direction;
    if (!way || way !== p.direction) continue;
    const due = moneyOf(f.amount);
    if (!due || due.currency !== paid.currency) continue;
    const day = line ? f.next_due : f.due;
    const gap = apart(on, day);
    if (gap === null || gap > DAYS) continue;
    /* A LINE THAT ALREADY COUNTS A PAYMENT ON OR AFTER THIS DAY has been paid by it or by a later one (`settle`). */
    if (line && typeof f.last_paid === 'string' && on <= f.last_paid) continue;
    if (!keysOf(bill || line ? [f.what] : [f.what, f.plan]).some((k) => mine.includes(k))) continue;
    const held = bill ? moneyOf(f.paid_so_far) : null;
    const left = held && held.currency === due.currency && held.amount > 0 && held.amount < due.amount ? due.amount - held.amount : due.amount;
    const name = String(f.what ?? '').trim() || 'This';
    const kind = bill ? (way === 'in' ? 'an invoice of' : 'a bill of') : 'an instalment of';
    const some = left === due.amount ? '' : ` with ${words({ amount: left, currency: due.currency })} left,`;
    const label = line ? `${name}, repeating at ${words(due)}, next ${dayWords(day)}` : `${name}, ${kind} ${words(due)}${some} due ${dayWords(day)}`;
    /* THE LINK, AND NOTHING ELSE: where it lives on the payment or on the instalment, at the version read. */
    const writes = bill
      ? [{ id: payment.spoken, version: payment.version, fields: { settles: item.id } }]
      : line
        ? []
        : [{ id: item.spoken, version: item.version, fields: { paid_by: payment.id } }];
    const expected = { amount: left, currency: due.currency };
    found.push({ item, name, day, gap, label, writes, agrees: !off(paid.amount, left), expected });
  }
  /* A BILL AND A REPEATING LINE UNDER ONE NAME ARE THE SAME MONEY TWICE (B6 of 24 October): the bill takes the payment,
     and the bill being paid asks to move the line on (`move-line.js`), so the line is no second answer here. */
  const billKeys = found.filter((c) => c.item.list === 'obligations').flatMap((c) => keysOf([c.item.fields.what]));
  for (let i = found.length - 1; i >= 0; i--) if (found[i].item.list === 'recurring' && keysOf([found[i].item.fields.what]).some((k) => billKeys.includes(k))) found.splice(i, 1);
  if (found.length === 0) return { nothing: `Nothing open ${whom} falls within ten days of ${dayWords(on)}, so the ${words(paid)} was left as it is.` };

  /* THE SAME MONEY FIRST, THEN THE NEAREST DAY, and a label said twice is numbered so each answer is its own. */
  found.sort((a, b) => Number(b.agrees) - Number(a.agrees) || a.gap - b.gap);
  const offered = found.slice(0, MOST);
  const seen = {};
  for (const c of offered) {
    seen[c.label] = (seen[c.label] ?? 0) + 1;
    if (seen[c.label] > 1) c.label = `${c.label} (${seen[c.label]})`;
  }
  const linkOf = (c) => ({ link: { list: c.item.list, item: c.item.spoken, id: c.item.id }, writes: c.writes, said: `This payment is for ${c.name}, due ${dayWords(c.day)}.` });

  /* AN ANSWER PICKED IS THE LINK, by its words or its handle; "None of these" and words nobody offered link nothing. */
  if (opts && typeof opts.answer === 'string') {
    const picked = offered.find((c) => c.label === opts.answer || c.item.spoken.replace('#', '-') === opts.answer);
    return picked ? linkOf(picked) : { nothing: `The payment ${whom} was left as it is, linked to nothing.` };
  }
  if (found.length === 1 && found[0].agrees) return linkOf(found[0]);

  const question = p.direction === 'in' ? `Which of these was the ${words(paid)} from ${who} on ${dayWords(on)} for?` : `Which of these did the ${words(paid)} to ${who} on ${dayWords(on)} pay?`;
  const options = offered.map((c) => ({
    id: c.item.spoken.replace('#', '-'),
    label: c.label,
    because: c.agrees ? 'The amount agrees, and its amount stays as written.' : `It expects ${words(c.expected)} and this was ${words(paid)}. Its amount stays as written.`,
    ...(c.writes.length > 0 ? { patches: c.writes } : {}),
  }));
  options.push({ id: 'none', label: NONE, because: 'Nothing is linked, and the payment stays as it is.' });
  return { ask: { cause: `money.match.${payment.spoken}`, question, about: who, options } };
}

/**
 * The script: `input.payment` is the Ledger entry as a person names it ("transactions#12") or as a rule hands it, by
 * id or as its list and number, and `input.answer` the words of an answer picked. It reads the payment and what is
 * open the same way, asks `matchPayment`, and either writes the link at the versions it read or ends its run with the
 * one question. What it answers with, `{ matched, item, list }`, is the thing found, for the step that marks it paid.
 *
 * NARROW READS, since a script's list is one page of fifty with no cursor: only what is open, goes the payment's way
 * and has its day within the decision's ten days of the payment's. Without the days a plan with sixty parts still to pay
 * fills the page with next year's and hides the one this payment paid. A page that still comes back full is said. The
 * payee is the decision's to judge.
 *
 * `input.asks: 'linked'` HOLDS BACK A QUESTION ONE OF WHOSE ANSWERS LINKS NOTHING, a repeating line among several
 * things that fit. Handed nothing, every question is asked, as the decision gives it.
 *
 * THE FOLD IS THE HOST'S WHEN IT HANDS ONE (`ctx.fold`, a text to its payee key), asked once for each name before the
 * decision runs, since a host's step may answer later and the decision waits for nothing.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const named = async (said) => {
    if (typeof said !== 'string' || said === '') return null;
    if (/^transactions#\d+$/.test(said)) return said;
    if (!/^[0-9A-Za-z_-]+$/.test(said)) return null;
    const row = await ctx.record.get(said);
    return row && row.register === 'transactions' && Number.isSafeInteger(row.seq) ? `transactions#${row.seq}` : null;
  };
  const at = (await named(input.payment)) ?? (input.register === 'transactions' && Number.isSafeInteger(input.seq) ? `transactions#${input.seq}` : null);
  if (!at) {
    ctx.log('The script was handed no payment, so nothing was looked for.');
    return null;
  }
  const paymentRow = await ctx.record.get(at);
  if (!paymentRow) {
    ctx.log('The payment is no longer in the record, so nothing was looked for.');
    return null;
  }
  const payment = { list: 'transactions', id: paymentRow.id, spoken: at, version: paymentRow.version, fields: paymentRow.fields };
  const way = payment.fields.direction;
  if (way !== 'in' && way !== 'out') {
    ctx.log('The payment does not say which way the money went, so nothing was looked for.');
    return null;
  }

  /* THE DECISION'S TEN DAYS AND THE RECORD'S PAGE, said again here because `run` reads nothing of `matchPayment`'s. */
  const DAYS = 10;
  const PAGE = 50;
  const at0 = typeof payment.fields.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payment.fields.on) ? Date.parse(`${payment.fields.on}T00:00:00Z`) : NaN;
  const dayFrom = (n) => new Date(at0 + n * 86_400_000).toISOString().slice(0, 10);
  const shaped = (list) => (r) => ({ list, id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
  let full = false;
  const open = async (list, state, direction, day) => {
    const rows = await ctx.record.list(list, { all: [state, { field: 'direction', is: direction }, { field: day, between: [dayFrom(-DAYS), dayFrom(DAYS)] }] });
    if (rows.length >= PAGE) full = true;
    return rows.map(shaped(list));
  };
  /* A PAYMENT WITH NO DAY READS NOTHING: the decision says why, and there is no window to ask the lists for. */
  const items = Number.isNaN(at0)
    ? []
    : [
        ...(await open('obligations', { field: 'state', in: ['open', 'part'] }, way === 'out' ? 'owed_by_me' : 'owed_to_me', 'due')),
        ...(await open('installments', { field: 'state', is: 'open' }, way, 'due')),
        ...(await open('recurring', { field: 'state', is: 'live' }, way, 'next_due')),
      ];
  if (full) ctx.log('Fifty or more things are open within ten days of this payment, so it may have been compared with only some of them.');
  /* AN INSTALMENT THAT ALREADY NAMES THIS PAYMENT is paid, so it is not among the open ones: it is asked for by name. A
     host that refuses the question leaves the check to the link itself, which a paid instalment no longer takes. */
  try {
    items.push(...(await ctx.record.list('installments', { field: 'paid_by', is: payment.id })).map(shaped('installments')));
  } catch {
    /* nothing to add */
  }

  const opts = {};
  if (typeof input.answer === 'string') opts.answer = input.answer;
  if (typeof ctx.fold === 'function') {
    const keys = new Map();
    const texts = [payment.fields.payee, payment.fields.counterparty_text, payment.fields.what, ...items.flatMap((i) => [i.fields.what, i.fields.plan])];
    /* A HOST THAT REFUSES A FOLD (it answers only so many a run) leaves the whole compare plain, as a host that hands
       none does: keys for some names and not for others would be two ideas of a payee in one decision. It is said. */
    try {
      for (const text of texts) if (typeof text === 'string' && !keys.has(text)) keys.set(text, await ctx.fold(text));
      opts.fold = (text) => keys.get(text) ?? null;
    } catch {
      ctx.log('The names were compared by their letters and digits for this payment, since the fuller compare could not be finished.');
    }
  }

  const out = matchPayment(payment, items, opts);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  /* NO QUESTION WITH AN ANSWER THAT DOES NOTHING, WHERE THE CALLER SAYS SO (`input.asks: 'linked'`, as Money's rule
     does). An answer that names a repeating line carries no link, and nothing runs on an answer picked yet, so picking
     it would change nothing. The payment is left as it is and the run says why. */
  if (out.ask && input.asks === 'linked' && out.ask.options.some((o) => o.id !== 'none' && !(Array.isArray(o.patches) && o.patches.length > 0))) {
    ctx.log('More than one thing fits this payment and one of them is a repeating line, which an answer cannot link yet, so nothing was asked.');
    return null;
  }
  if (out.ask) return { ask: out.ask };
  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(out.said);
  return { matched: out.link.item, item: out.link.id, list: out.link.list };
}

/**
 * A payee's key as the record folds a bank text (`bankKey` in the kernel), for a caller outside the sandbox to hand
 * `matchPayment` as `fold`: `GEIDEA*CHILLOUT 0423 CAIRO EG` and `Chill Out` are one payee.
 */
export function payeeKey(text) {
  return bankKey(text);
}

/**
 * The script as Money's pack document writes it, as `SETTLE_SCRIPT` is: no egress, no keys, started by a rule and never
 * by the clock. It reads the Ledger and the three lists a payment can pay, and writes only where a link lives: the
 * Ledger ("Settles") and Instalments ("Paid by").
 */
export const MATCH_PAYMENT_SCRIPT = {
  script: 'match_payment',
  title: 'Find what a payment paid',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['obligations', 'installments', 'recurring', 'transactions'],
  writes: ['installments', 'transactions'],
  source: `${matchPayment.toString()}\nexport default ${run.toString()}`,
};
