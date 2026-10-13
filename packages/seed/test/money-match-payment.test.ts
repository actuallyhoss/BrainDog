/**
 * A payment that names nothing finds what it pays (REC-B11 step 3), one test an effect.
 *
 * `matchPayment` IS THE DECISION AND `run` IS THE SCRIPT ROUND IT, and both are measured: the decision on plain fields,
 * and the script as a host's sandbox runs it, its declared `source` imported as a module and handed a `ctx`, the way
 * `money-settle.test.ts` runs the script that marks the thing paid.
 *
 * RED FIRST: with no `scripts/match-payment.js` the file does not load.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gbp } from '../src/index.ts';
import { MATCH_PAYMENT_SCRIPT, matchPayment, payeeKey, type Matched } from '../src/modules/money/scripts/match-payment.js';

type Fields = Record<string, unknown>;
const row = (list: string, seq: number, fields: Fields) => ({ list, id: `e_${list}_${seq}`, spoken: `${list}#${seq}`, version: 3, fields });
const usd = (amount: number) => ({ amount, currency: 'USD' });

const payment = (amount: number, on = '2026-10-01', more: Fields = {}) =>
  row('transactions', 12, { what: 'NORTHGATE ESTATES', direction: 'out', amount: gbp(amount), on, state: 'cleared', ...more });
const bill = (more: Fields = {}) => row('obligations', 4, { what: 'Northgate Estates', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open', ...more });
const part = (more: Fields = {}) =>
  row('installments', 2, { what: 'Desk, part 2', plan: 'Northgate Estates', direction: 'out', amount: gbp(400_000), due: '2026-10-03', state: 'open', ...more });
const rent = (more: Fields = {}) =>
  row('recurring', 7, { what: 'Northgate Estates', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live', ...more });

const linked = (out: Matched) => {
  assert.ok('link' in out, `nothing was linked: ${JSON.stringify(out)}`);
  return out;
};
const asked = (out: Matched) => {
  assert.ok('ask' in out, `nothing was asked: ${JSON.stringify(out)}`);
  return out.ask;
};
const nothing = (out: Matched) => assert.ok('nothing' in out, `something came back: ${JSON.stringify(out)}`);
/** Every field any change in a result would write, the changes an answer carries among them. */
const written = (out: Matched): string[] => {
  const patches = 'link' in out ? out.writes : 'ask' in out ? out.ask.options.flatMap((o) => o.patches ?? []) : [];
  return patches.flatMap((p) => Object.keys(p.fields));
};

test('one open bill to the same payee, for the same money, within ten days, is linked on the payment', () => {
  const out = linked(matchPayment(payment(400_000, '2026-10-06'), [bill()]));
  assert.deepEqual(out.link, { list: 'obligations', item: 'obligations#4', id: 'e_obligations_4' });
  assert.deepEqual(out.writes, [{ id: 'transactions#12', version: 3, fields: { settles: 'e_obligations_4' } }]);
  assert.equal(out.said, 'This payment is for Northgate Estates, due 1 October.');
});

test('an instalment is linked by the payment it names, and a repeating line by nothing written', () => {
  const one = linked(matchPayment(payment(400_000), [part()]));
  assert.deepEqual(one.writes, [{ id: 'installments#2', version: 3, fields: { paid_by: 'e_transactions_12' } }]);
  const line = linked(matchPayment(payment(400_000), [rent()]));
  assert.deepEqual(line.link, { list: 'recurring', item: 'recurring#7', id: 'e_recurring_7' });
  assert.deepEqual(line.writes, []);
});

test('an amount within 2% is the same payment, and one further off is a question', () => {
  linked(matchPayment(payment(408_000), [bill()]));
  const ask = asked(matchPayment(payment(420_000), [bill()]));
  assert.equal(ask.cause, 'money.match.transactions#12');
  assert.equal(ask.question, 'Which of these did the GBP 4,200 to NORTHGATE ESTATES on 1 October pay?');
  assert.deepEqual(ask.options.map((o) => o.label), ['Northgate Estates, a bill of GBP 4,000 due 1 October', 'None of these']);
});

test('two candidates are a question with both as answers, and neither is linked', () => {
  const ask = asked(matchPayment(payment(400_000), [bill(), rent()]));
  assert.deepEqual(ask.options.map((o) => o.label), [
    'Northgate Estates, a bill of GBP 4,000 due 1 October',
    'Northgate Estates, repeating at GBP 4,000, next 1 October',
    'None of these',
  ]);
  assert.deepEqual(ask.options[0]!.patches, [{ id: 'transactions#12', version: 3, fields: { settles: 'e_obligations_4' } }]);
  assert.equal(ask.options[1]!.patches, undefined);
  assert.equal(ask.options[2]!.patches, undefined);
});

test('the answer picked is the link, and "None of these" links nothing', () => {
  const picked = linked(matchPayment(payment(400_000), [bill(), rent()], { answer: 'Northgate Estates, repeating at GBP 4,000, next 1 October' }));
  assert.equal(picked.link.item, 'recurring#7');
  nothing(matchPayment(payment(400_000), [bill(), rent()], { answer: 'None of these' }));
});

test('another currency, another payee, the other way, a day too far or a thing already paid is no match', () => {
  nothing(matchPayment(payment(400_000), [bill({ amount: usd(400_000) })]));
  nothing(matchPayment(payment(400_000), [bill({ what: 'Harbour Dental' })]));
  nothing(matchPayment(payment(400_000), [bill({ direction: 'owed_to_me' })]));
  nothing(matchPayment(payment(400_000, '2026-10-12'), [bill()]));
  linked(matchPayment(payment(400_000, '2026-10-11'), [bill()]));
  linked(matchPayment(payment(400_000, '2026-09-21'), [bill()]));
  nothing(matchPayment(payment(400_000), [bill({ state: 'paid' }), part({ state: 'cancelled' }), rent({ state: 'paused' })]));
  nothing(matchPayment(payment(400_000), [rent({ last_paid: '2026-10-01' })]));
  nothing(matchPayment(payment(400_000), []));
});

test('a payment that is pending, already settles a bill, or is named by an instalment looks for nothing', () => {
  nothing(matchPayment(payment(400_000, '2026-10-01', { state: 'pending' }), [bill()]));
  nothing(matchPayment(payment(400_000, '2026-10-01', { settles: 'e_obligations_9' }), [bill()]));
  nothing(matchPayment(payment(400_000), [bill(), part({ state: 'paid', paid_by: 'e_transactions_12' })]));
});

test('a part-paid bill is matched on what is left of it', () => {
  linked(matchPayment(payment(250_000), [bill({ state: 'part', paid_so_far: gbp(150_000) })]));
});

test('it never changes an amount, linking or asking', () => {
  for (const out of [matchPayment(payment(400_000), [bill()]), matchPayment(payment(900_000), [bill(), part(), rent()]), matchPayment(payment(400_000), [part()])])
    for (const field of written(out)) assert.ok(field === 'settles' || field === 'paid_by', `${field} would be written`);
});

test('the payee is compared by the key the record folds a bank text to, when a caller hands the fold', () => {
  const bank = payment(400_000, '2026-10-01', { what: 'Card payment', counterparty_text: 'GEIDEA*CHILLOUT 0423 CAIRO EG' });
  const tab = bill({ what: 'Chill Out' });
  nothing(matchPayment(bank, [tab]));
  assert.equal(linked(matchPayment(bank, [tab], { fold: payeeKey })).link.item, 'obligations#4');
});

/** The script's own text, run as a sandbox runs it: nothing but `ctx`. `fold` is the step a host may hand. */
async function ran(rows: ReturnType<typeof row>[], input: Fields, fold?: (text: string) => Promise<string | null>) {
  type Test = { field: string; is?: unknown; in?: unknown[]; between?: [string, string] };
  const writes: { spoken: string; patch: unknown; version: number }[] = [];
  const log: string[] = [];
  const asked: { list: string; where: unknown }[] = [];
  const shaped = (r: ReturnType<typeof row>) => ({ id: r.id, register: r.list, seq: Number(r.spoken.split('#')[1]), version: r.version, fields: r.fields });
  const passes = (r: ReturnType<typeof row>, t: Test) => {
    const v = r.fields[t.field];
    if (t.between) return typeof v === 'string' && v >= t.between[0] && v <= t.between[1];
    return t.in ? t.in.includes(v) : v === t.is;
  };
  const ctx = {
    input,
    record: {
      get: async (said: string) => {
        const found = rows.find((r) => r.spoken === said || r.id === said);
        return found ? shaped(found) : null;
      },
      list: async (list: string, where: Test | { all: Test[] }) => {
        asked.push({ list, where });
        const tests = 'all' in where ? where.all : [where];
        /* ONE PAGE, AS THE RECORD ANSWERS A SCRIPT: the first fifty, and no cursor to ask for more. */
        return rows.filter((r) => r.list === list && tests.every((t) => passes(r, t))).slice(0, 50).map(shaped);
      },
    },
    update: (spoken: string, patch: unknown, version: number) => void writes.push({ spoken, patch, version }),
    log: (...words: string[]) => void log.push(words.join(' ')),
    ...(fold ? { fold } : {}),
  };
  const mod = (await import(`data:text/javascript,${encodeURIComponent(MATCH_PAYMENT_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
  return { out: await mod.default(ctx), writes, log, asked };
}

test('the script is Money\'s own, fetches nothing, and writes only where a link lives', () => {
  assert.equal(MATCH_PAYMENT_SCRIPT.script, 'match_payment');
  assert.equal(MATCH_PAYMENT_SCRIPT.pack, 'money-core');
  assert.deepEqual(MATCH_PAYMENT_SCRIPT.egress, []);
  assert.deepEqual(MATCH_PAYMENT_SCRIPT.keys, []);
  assert.deepEqual(MATCH_PAYMENT_SCRIPT.runs, { rule: true });
  assert.deepEqual(MATCH_PAYMENT_SCRIPT.reads, ['obligations', 'installments', 'recurring', 'transactions']);
  assert.deepEqual(MATCH_PAYMENT_SCRIPT.writes, ['installments', 'transactions']);
});

test('run as a sandbox runs it, the script links the one bill at the version it read and says so by name', async () => {
  const { out, writes, log, asked } = await ran([bill(), payment(400_000), rent({ what: 'Gym' })], { payment: 'transactions#12' });
  assert.deepEqual(writes, [{ spoken: 'transactions#12', patch: { settles: 'e_obligations_4' }, version: 3 }]);
  assert.deepEqual(out, { matched: 'obligations#4', item: 'e_obligations_4', list: 'obligations' });
  assert.deepEqual(log, ['This payment is for Northgate Estates, due 1 October.']);
  /* ONLY WHAT IS OPEN AND GOES THE SAME WAY IS READ, since a script's list is one page. */
  assert.deepEqual(asked[0], {
    list: 'obligations',
    where: { all: [{ field: 'state', in: ['open', 'part'] }, { field: 'direction', is: 'owed_by_me' }, { field: 'due', between: ['2026-09-21', '2026-10-11'] }] },
  });
  assert.deepEqual((asked[2]!.where as { all: unknown[] }).all[2], { field: 'next_due', between: ['2026-09-21', '2026-10-11'] });
});

test('a long plan with sixty parts still to pay does not hide the part this payment paid', async () => {
  const later = Array.from({ length: 60 }, (_, i) => part({ what: `Car, part ${i + 3}`, plan: 'Car', due: `2027-${String((i % 12) + 1).padStart(2, '0')}-03` })).map((r, i) => ({
    ...r,
    id: `e_installments_${100 + i}`,
    spoken: `installments#${100 + i}`,
  }));
  const { out, writes } = await ran([...later, part(), payment(400_000)], { payment: 'transactions#12' });
  assert.deepEqual(out, { matched: 'installments#2', item: 'e_installments_2', list: 'installments' });
  assert.deepEqual(writes, [{ spoken: 'installments#2', patch: { paid_by: 'e_transactions_12' }, version: 3 }]);
});

test('money in is said as money from somebody, never to them', () => {
  const inward = payment(400_000, '2026-10-01', { direction: 'in' });
  const none = matchPayment(inward, [bill()]);
  assert.ok('nothing' in none && / from NORTHGATE ESTATES /.test(none.nothing) && !/ to NORTHGATE/.test(none.nothing), JSON.stringify(none));
  const two = [bill({ direction: 'owed_to_me' }), rent({ direction: 'in' })];
  const left = matchPayment(inward, two, { answer: 'None of these' });
  assert.ok('nothing' in left && /from NORTHGATE ESTATES/.test(left.nothing), JSON.stringify(left));
});

test('handed the payment by its id, or as its list and number, the script finds the same thing', async () => {
  for (const input of [{ payment: 'e_transactions_12' }, { register: 'transactions', seq: 12 }]) {
    const { out } = await ran([rent(), payment(400_000)], input);
    assert.deepEqual(out, { matched: 'recurring#7', item: 'e_recurring_7', list: 'recurring' });
  }
});

test('two things it could pay end the run with the question, and nothing is written', async () => {
  const { out, writes } = await ran([bill(), rent(), payment(400_000)], { payment: 'transactions#12' });
  assert.deepEqual(writes, []);
  assert.equal((out as { ask: { options: unknown[] } }).ask.options.length, 3);
});

test('handed the answer, the script makes that link; handed an instalment that names the payment, none', async () => {
  const picked = await ran([bill(), part(), payment(400_000)], { payment: 'transactions#12', answer: 'Desk, part 2, an instalment of GBP 4,000 due 3 October' });
  assert.deepEqual(picked.writes, [{ spoken: 'installments#2', patch: { paid_by: 'e_transactions_12' }, version: 3 }]);
  const taken = await ran([bill(), part({ state: 'paid', paid_by: 'e_transactions_12' }), payment(400_000)], { payment: 'transactions#12' });
  assert.deepEqual(taken.writes, []);
  assert.equal(taken.out, null);
  assert.deepEqual(taken.log, ['An instalment already names this payment, so nothing else was looked for.']);
});

test('a host that hands a fold has the bank\'s spelling matched, and no payment or no match writes nothing', async () => {
  const bank = payment(400_000, '2026-10-01', { what: 'Card payment', counterparty_text: 'GEIDEA*CHILLOUT 0423 CAIRO EG' });
  const tab = bill({ what: 'Chill Out' });
  assert.equal((await ran([tab, bank], { payment: 'transactions#12' })).out, null);
  const folded = await ran([tab, bank], { payment: 'transactions#12' }, async (text) => payeeKey(text));
  assert.deepEqual(folded.out, { matched: 'obligations#4', item: 'e_obligations_4', list: 'obligations' });
  const none = await ran([tab], { payment: 'transactions#99' });
  assert.deepEqual([none.out, none.writes, none.log], [null, [], ['The payment is no longer in the record, so nothing was looked for.']]);
});
