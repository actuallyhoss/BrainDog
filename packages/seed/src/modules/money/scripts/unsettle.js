/**
 * What deleting a payment does to the bill it paid (REC-B11 job 6, "Paid means paid"), as the decision, the script a
 * host runs round it, the declaration a pack document carries, and the rule that starts it.
 *
 * A PAYMENT DELETED UNPAYS, as one made void does (`settle` in `settle.js`). Handed the bill a deleted Ledger entry
 * named in "Settles", `unsettle` counts the bill again from the payments that still name it: open with nothing in
 * "Paid so far", or part paid with what is left, and no day. Before this, a payment made void reopened its bill and a
 * payment deleted left it paid by nothing.
 *
 * COUNTED, NOT SUBTRACTED, as `settle` counts: the sum written is what the other cleared payments come to, so a second
 * run finds the bill as the first left it and writes nothing.
 *
 * LEFT ALONE: a bill a person marked paid by hand (paid, with no "Paid so far", since every close `settle` makes writes
 * one), a "Paid so far" somebody typed (one that is neither the other payments nor the other payments and this one), a
 * bill that is not open, part paid or paid, and a bill already deleted, about which nothing is said.
 *
 * ONLY THE BILL THE DELETED PAYMENT NAMED, AND ONLY BECAUSE IT WAS DELETED: the script ends with a sentence and no
 * write when the payment it is handed is still in the record.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `unsettle`, AND NOTHING BUT `unsettle` BY `run`: the two texts together are the
 * script (`UNSETTLE_SCRIPT.source`), since a sandbox runs a script's text alone.
 */

/**
 * The bill (`item`, as `settle` takes it), what its other cleared payments come to (`before`, in minor units of the
 * bill's currency), and what the deleted payment had counted for (`gone`: its amount when it had cleared in the bill's
 * currency, 0 when it had not, `undefined` when nobody can say). Answers `settle`'s shapes: the changes and the one
 * sentence, or why nothing changed.
 */
export function unsettle(item, before, gone) {
  const PLACES = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };
  const moneyOf = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' ? v : null);
  const words = (m) => {
    const places = PLACES[m.currency] ?? 2;
    const digits = String(Math.abs(m.amount)).padStart(places + 1, '0');
    const whole = digits.slice(0, digits.length - places).replace(/\B(?=(\d{3})+$)/g, ',');
    const rest = places === 0 ? '' : digits.slice(-places);
    return `${m.currency} ${m.amount < 0 ? '-' : ''}${whole}${/^0*$/.test(rest) ? '' : `.${rest}`}`;
  };

  const f = item.fields;
  const name = String(f.what ?? '').trim() || 'This';
  const due = moneyOf(f.amount);
  if (item.list !== 'obligations') return { nothing: `${name} is not a bill, so the deleted payment changed nothing.` };
  if (!due) return { nothing: `${name} has no amount, so the deleted payment changed nothing.` };
  if (f.state !== 'open' && f.state !== 'part' && f.state !== 'paid') return { nothing: `${name} is not open, so the deleted payment changed nothing.` };
  if (!Number.isSafeInteger(before) || before < 0) return { nothing: `${name} could not be counted again, so the deleted payment changed nothing.` };
  const held = moneyOf(f.paid_so_far);
  const counted = held && held.currency === due.currency ? held.amount : null;
  if (f.state === 'paid' && counted === null) return { nothing: `${name} was marked paid by hand, so the deleted payment changed nothing.` };
  /* A SUM SOMEBODY TYPED IS LEFT ALONE, as `settle` leaves it (audit 62, claim 1), when what the payment counted for is
     known. Not known, the count is written, since the sum the script wrote is the only one it can tell from a typed one. */
  if (Number.isSafeInteger(gone) && counted !== null && counted !== before && counted !== before + gone)
    return { nothing: `${name} has a Paid so far that somebody typed, so the deleted payment changed nothing.` };

  const sum = before === 0 ? null : { amount: before, currency: due.currency };
  /* PAYMENTS THAT STILL REACH THE AMOUNT keep the bill as it is: this never closes a bill, and reopens none they pay. */
  const to = before === 0 ? 'open' : before < due.amount ? 'part' : f.state;
  const fields = {};
  if (to !== f.state) fields.state = to;
  if (f.state === 'paid' && to !== 'paid') fields.settled = null;
  if ((counted ?? 0) !== before) fields.paid_so_far = sum;
  if (Object.keys(fields).length === 0) return { nothing: `${name} did not count the deleted payment, so nothing changed.` };
  const writes = [{ id: item.spoken, version: item.version, fields }];
  if (before === 0) return { writes, said: `${name} is open again, since its payment was deleted.` };
  if (before < due.amount) return { writes, said: `${name} is part paid, ${words(sum)} of ${words(due)}, since one of its payments was deleted.` };
  return { writes, said: `${name} still has ${words(sum)} paid, since one of its payments was deleted.` };
}

/**
 * The script: `input.item` is the bill the deleted payment named, by its id as a rule hands it or by its handle
 * ("obligations#4"); `input.id` (or `input.payment`) is the deleted payment, which a rule's run hands on its own;
 * `input.amount` and `input.state` are what the payment held when it was deleted, as the rule fills them, the amount
 * as its JSON text. It reads the bill and every payment still naming it, asks `unsettle`, and writes the bill at the
 * version it read.
 *
 * ONLY CLEARED MONEY IN THE BILL'S CURRENCY IS COUNTED, and never the deleted payment, as `settle`'s run counts.
 */
export default async function run(ctx) {
  const input = ctx.input && typeof ctx.input === 'object' ? ctx.input : {};
  const said = typeof input.item === 'string' ? input.item : '';
  /* A PAYMENT THAT NAMED NOTHING has nothing to count again, and says nothing. */
  if (!/^[a-z_]+#\d+$/.test(said) && !/^[0-9A-Za-z_-]+$/.test(said)) return null;
  const payment = typeof input.id === 'string' && input.id !== '' ? input.id : typeof input.payment === 'string' ? input.payment : '';
  if (payment === '') {
    ctx.log('The script was handed no deleted payment, so nothing was counted again.');
    return null;
  }
  if (await ctx.record.get(payment)) {
    ctx.log('The payment is still in the record, so nothing was counted again.');
    return null;
  }
  const row = await ctx.record.get(said);
  /* A BILL ALREADY DELETED has nothing to read open again, and says nothing. */
  if (!row || typeof row.register !== 'string' || !Number.isSafeInteger(row.seq)) return null;
  const item = { list: row.register, id: row.id, spoken: `${row.register}#${row.seq}`, version: row.version, fields: row.fields };

  const currency = item.fields.amount && item.fields.amount.currency;
  let before = 0;
  if (item.list === 'obligations') {
    const others = await ctx.record.list('transactions', { field: 'settles', is: item.id });
    for (const other of others) {
      const m = other.fields.amount;
      /* ONE CURRENCY ONLY: a payment in another is left out of the sum rather than added to it. */
      if (other.id === payment || other.fields.state !== 'cleared' || !m || m.currency !== currency || !Number.isSafeInteger(m.amount)) continue;
      before += m.amount;
    }
  }
  /* WHAT THE DELETED PAYMENT COUNTED FOR: nothing when it had not cleared or was in another currency, its amount when
     it had cleared, and unknown when the rule filled neither. */
  let gone;
  if (typeof input.state === 'string' && /^[a-z_]+$/.test(input.state) && input.state !== 'cleared') gone = 0;
  else if (input.state === 'cleared' && typeof input.amount === 'string') {
    try {
      const m = JSON.parse(input.amount);
      if (m && typeof m === 'object' && Number.isSafeInteger(m.amount) && typeof m.currency === 'string') gone = m.currency === currency ? m.amount : 0;
    } catch {
      /* An amount nobody can read leaves what it counted for unknown. */
    }
  }

  const out = unsettle(item, before, gone);
  if (out.nothing) {
    ctx.log(out.nothing);
    return null;
  }
  for (const w of out.writes) ctx.update(w.id, w.fields, w.version);
  ctx.log(out.said);
  return { unsettled: item.spoken };
}

/**
 * The script as Money's pack document writes it, as `SETTLE_SCRIPT` is: no egress, no keys, started by a rule and
 * never by the clock, reading Bills and the Ledger, where a bill's link lives, and writing Bills alone.
 */
export const UNSETTLE_SCRIPT = {
  script: 'unsettle',
  title: 'Open a bill again when its payment is deleted',
  pack: 'money-core',
  runs: { rule: true },
  egress: [],
  keys: [],
  reads: ['obligations', 'transactions'],
  writes: ['obligations'],
  source: `${unsettle.toString()}\nexport default ${run.toString()}`,
};

/**
 * A LEDGER ENTRY DELETED WITH A BILL IN "Settles" starts `script.unsettle`, handed the bill by its id (the row as it
 * was deleted is what a delete's run reads), and what the entry held: its amount and its status, so a "Paid so far"
 * somebody typed is told from the one the script wrote. The run hands the deleted entry's own id as `id`.
 *
 * `payment-settles` starts on a create or an update and never on a delete, so this is the one rule a deleted payment
 * starts. No `once_per`: a second run counts the same payments and writes nothing.
 */
export const UNSETTLE_RULE = {
  rule: 'payment-unsettles',
  name: 'Open a bill again when its payment is deleted',
  pack: 'money-core',
  on: { written: { register: 'transactions', op: ['delete'] } },
  when: 'settles is set',
  steps: [{ script: { id: 'unsettle', as: 'unsettling', input: { item: '{{trigger.row.settles}}', amount: '{{trigger.row.amount}}', state: '{{trigger.row.state}}' } } }],
};
