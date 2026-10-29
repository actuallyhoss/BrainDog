/**
 * A host that stops answering `ctx.fold` part way leaves the payment compared plainly, and the run does not fail.
 *
 * A host answers only so many folds a run and refuses the rest as a rejected promise. The script is run here as
 * `money-match-payment.test.ts` runs it, its declared `source` imported as a module and handed a `ctx`, with a fold
 * that rejects from a call the test picks.
 *
 * RED FIRST: without the catch round the fold loop, the first test's run rejects with the host's own sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gbp } from '../src/index.ts';
import { MATCH_PAYMENT_SCRIPT, payeeKey } from '../src/modules/money/scripts/match-payment.js';

type Fields = Record<string, unknown>;
type Fold = (text: string) => Promise<string | null>;
const row = (list: string, seq: number, fields: Fields) => ({ list, id: `e_${list}_${seq}`, spoken: `${list}#${seq}`, version: 3, fields });
type Row = ReturnType<typeof row>;

const payment = (more: Fields = {}) =>
  row('transactions', 12, { what: 'NORTHGATE ESTATES', direction: 'out', amount: gbp(400_000), on: '2026-10-01', state: 'cleared', ...more });
const bill = (more: Fields = {}) => row('obligations', 4, { what: 'Northgate Estates', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open', ...more });

const PLAIN = 'The names were compared by their letters and digits for this payment, since the fuller compare could not be finished.';

/** A fold that answers as the kernel does until call `from`, and rejects from there on, as a host past its count. */
const stopsAt = (from: number) => {
  const calls: string[] = [];
  const fold: Fold = async (text) => {
    calls.push(text);
    if (calls.length >= from) throw new Error('match_payment asked for more than 1000 payee keys in one run, so no more were answered.');
    return payeeKey(text);
  };
  return { fold, calls };
};

/** The script's own text, run as a sandbox runs it: nothing but `ctx`. */
async function ran(rows: Row[], fold?: Fold) {
  type Test = { field: string; is?: unknown; in?: unknown[]; between?: [string, string] };
  const writes: { spoken: string; patch: unknown; version: number }[] = [];
  const log: string[] = [];
  const shaped = (r: Row) => ({ id: r.id, register: r.list, seq: Number(r.spoken.split('#')[1]), version: r.version, fields: r.fields });
  const passes = (r: Row, t: Test) => {
    const v = r.fields[t.field];
    if (t.between) return typeof v === 'string' && v >= t.between[0] && v <= t.between[1];
    return t.in ? t.in.includes(v) : v === t.is;
  };
  const ctx = {
    input: { payment: 'transactions#12' },
    record: {
      get: async (said: string) => {
        const found = rows.find((r) => r.spoken === said || r.id === said);
        return found ? shaped(found) : null;
      },
      list: async (list: string, where: Test | { all: Test[] }) => {
        const tests = 'all' in where ? where.all : [where];
        return rows.filter((r) => r.list === list && tests.every((t) => passes(r, t))).slice(0, 50).map(shaped);
      },
    },
    update: (spoken: string, patch: unknown, version: number) => void writes.push({ spoken, patch, version }),
    log: (...words: string[]) => void log.push(words.join(' ')),
    ...(fold ? { fold } : {}),
  };
  const mod = (await import(`data:text/javascript,${encodeURIComponent(MATCH_PAYMENT_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
  return { out: await mod.default(ctx), writes, log };
}

test('a fold the host refuses on its second call leaves the payment matched by the plain compare, and no error escapes', async () => {
  const host = stopsAt(2);
  const got = await ran([bill(), payment()], host.fold);
  assert.equal(host.calls.length, 2, 'the fold was asked until it refused, and not again');
  assert.deepEqual(got.out, { matched: 'obligations#4', item: 'e_obligations_4', list: 'obligations' });
  assert.deepEqual(got.writes, [{ spoken: 'transactions#12', patch: { settles: 'e_obligations_4' }, version: 3 }]);
  assert.deepEqual(got.log, [PLAIN, 'This payment is for Northgate Estates, due 1 October.']);
});

test('a fold refused on its very first call is the same plain compare', async () => {
  const got = await ran([bill(), payment()], stopsAt(1).fold);
  assert.deepEqual(got.out, { matched: 'obligations#4', item: 'e_obligations_4', list: 'obligations' });
  assert.equal(got.log[0], PLAIN);
});

test('the keys folded before the refusal are not used: the compare is plain for every name, as on a host with no fold', async () => {
  const bank = payment({ what: 'Card payment', counterparty_text: 'GEIDEA*CHILLOUT 0423 CAIRO EG' });
  const tab = bill({ what: 'Chill Out' });
  const none = await ran([tab, bank]);
  const cut = await ran([tab, bank], stopsAt(3).fold);
  /* NOT LINKED: the plain compare finds no name, so the same money alone is asked about (Q1 of 29 October), as it is
     on a host with no fold, and nothing is written. */
  assert.deepEqual(cut.out, none.out);
  assert.equal((cut.out as { ask: { question: string } }).ask.question, 'Is the GBP 4,000 that left on 1 October the Chill Out payment?');
  assert.deepEqual(cut.writes, []);
  assert.deepEqual(cut.log, [PLAIN, ...none.log]);
});

test('a host whose fold keeps answering still folds, and says nothing of a plain compare', async () => {
  const bank = payment({ what: 'Card payment', counterparty_text: 'GEIDEA*CHILLOUT 0423 CAIRO EG' });
  const host = stopsAt(Infinity);
  const got = await ran([bill({ what: 'Chill Out' }), bank], host.fold);
  assert.deepEqual(got.out, { matched: 'obligations#4', item: 'e_obligations_4', list: 'obligations' });
  assert.ok(host.calls.includes('GEIDEA*CHILLOUT 0423 CAIRO EG'));
  assert.ok(!got.log.includes(PLAIN));
});
