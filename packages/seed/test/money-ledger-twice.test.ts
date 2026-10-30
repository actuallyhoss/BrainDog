/**
 * Lines the Ledger holds twice (`scripts/ledger-twice.js`): which pairs are one payment written by two roads, which
 * line of each is kept, and the one question that archives the copies.
 *
 * THE LIVE CHECK OF 30 OCTOBER, 11: four HSBC payments on 17 and 19 October were held twice, the second copy of each
 * written by the alert door beside a line that held no reference. The rows here are shaped like those, with invented
 * references.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankless, LEDGER_TWICE_SCRIPT, twiceAsk, twiceOf } from '../src/modules/money/scripts/ledger-twice.js';

type Fields = Record<string, unknown>;
let seq = 0;
const row = (fields: Fields, n = ++seq) => ({ id: `id${n}`, spoken: `transactions#${n}`, seq: n, version: 1, fields: { account: 'hsbc', direction: 'out', state: 'cleared', ...fields } });
const egp = (amount: number) => ({ amount, currency: 'EGP' });

test('bankless reads past what a bank wraps a payee in', () => {
  assert.equal(bankless('IPN outward transfer to AHMED EMAD SAIED ABDELAZIZ'), 'ahmed emad saied abdelaziz');
  assert.equal(bankless('05OCT26 PAYMOB*UNITRADE Purchase'), 'unitrade');
});

test('the four doubled lines of 17 and 19 October are four pairs, and the line with the reference is kept', () => {
  const rows = [
    row({ what: 'WOPLEK OFFICE FURNITURE', amount: egp(3_462_000), on: '2026-10-17' }, 288),
    row({ what: 'AHMED EMAD SAIED ABDELAZIZ', amount: egp(150_150), on: '2026-10-19' }, 289),
    row({ what: 'SALAH ASSEM THABET', amount: egp(3_050), on: '2026-10-19' }, 290),
    row({ what: '8307', amount: egp(235_235), on: '2026-10-19' }, 291),
    row({ what: 'WOPLEK OFFICE FURNITURE', amount: egp(3_462_000), on: '2026-10-17', hsbc_reference: '40175f9b' }, 341),
    row({ what: 'AHMED EMAD SAIED ABDELAZIZ', amount: egp(150_150), on: '2026-10-19', hsbc_reference: 'a72eba6b' }, 342),
    row({ what: 'SALAH ASSEM THABET', amount: egp(3_050), on: '2026-10-19', hsbc_reference: 'c0ffee01' }, 343),
    row({ what: '8307', amount: egp(235_235), on: '2026-10-19', hsbc_reference: 'c0ffee02' }, 344),
  ];
  const pairs = twiceOf(rows);
  assert.deepEqual(
    pairs.map((p) => [p.keep.seq, p.other.seq]),
    [
      [341, 288],
      [342, 289],
      [343, 290],
      [344, 291],
    ],
  );
  const ask = twiceAsk(pairs, '2026-10-30T09:00:00.000Z')!;
  assert.equal(ask.question, 'These 4 lines look imported twice. Keep one of each?');
  assert.equal(ask.cause, 'money.ledger-twice:341.288_342.289_343.290_344.291');
  const [yes, no] = ask.options as { label: string; patches?: { id: string; version: number; fields: Fields }[] }[];
  assert.equal(yes!.label, 'Keep one of each');
  assert.deepEqual(
    yes!.patches!.map((p) => [p.id, Object.keys(p.fields)]),
    [
      ['transactions#288', ['deleted_at']],
      ['transactions#289', ['deleted_at']],
      ['transactions#290', ['deleted_at']],
      ['transactions#291', ['deleted_at']],
    ],
    'archived, never deleted, and nothing to move',
  );
  assert.equal(no!.patches, undefined, 'no writes nothing');
});

test('a statement line and the alert for one transfer are a pair, days apart and worded differently', () => {
  const line = row({ what: 'IPN outward transfer to AHMED EMAD SAIED ABDELAZIZ', amount: egp(150_150), on: '2026-10-21', balance_after: egp(7_409_216) });
  const alert = row({ what: 'AHMED EMAD SAIED ABDELAZIZ', amount: egp(150_150), on: '2026-10-19', hsbc_reference: 'a72eba6b' });
  assert.equal(twiceOf([line, alert]).length, 1);
  assert.equal(twiceOf([line, { ...alert, fields: { ...alert.fields, on: '2026-10-15' } }]).length, 0, 'six days apart');
  assert.equal(twiceOf([line, { ...alert, fields: { ...alert.fields, direction: 'in' } }]).length, 0, 'the other way');
  assert.equal(twiceOf([line, { ...alert, fields: { ...alert.fields, account: 'card' } }]).length, 0, 'another account');
});

test('two charges the bank tells apart are two, and two lines alike in every word are two coffees', () => {
  /* ALMOKHTBR, EGP 1,750 twice on 21 October: what was left fell by the charge each time. */
  const one = row({ what: 'ALMOKHTBR', amount: egp(175_000), on: '2026-10-21', account: 'card', available: egp(3_070_281) });
  const two = row({ what: 'ALMOKHTBR', amount: egp(175_000), on: '2026-10-21', account: 'card', available: egp(2_895_281) });
  assert.equal(twiceOf([one, two]).length, 0);
  const coffee = row({ what: 'Coffee', amount: egp(8_500), on: '2026-10-21' });
  assert.equal(twiceOf([coffee, row({ what: 'Coffee', amount: egp(8_500), on: '2026-10-21' })]).length, 0);
});

test('each line is paired once, so three lines of one payment are one pair and a third left alone', () => {
  const rows = [
    row({ what: 'TALABAT', amount: egp(86_278), on: '2026-10-30', account: 'card', available: egp(7_925_321) }),
    row({ what: '30OCT26 TALABAT Purchase', amount: egp(86_278), on: '2026-10-31', account: 'card' }),
    row({ what: 'TALABAT', amount: egp(86_278), on: '2026-10-30', account: 'card', available: egp(7_838_043) }),
  ];
  assert.equal(twiceOf(rows).length, 1);
});

test('the line kept is the one a bill leans on, and what a person set on the copy moves to it', () => {
  const settled = row({ what: 'Rent October', amount: egp(2_000_000), on: '2026-10-01', settles: 'bill1' });
  const alert = row({ what: 'IPN outward transfer to Rent October', amount: egp(2_000_000), on: '2026-10-02', hsbc_reference: 'r1', category: 'home', filed_by: 'rule3', note: 'October rent' });
  const [pair] = twiceOf([alert, settled]);
  assert.equal(pair!.keep.id, settled.id);
  const ask = twiceAsk([pair!], '2026-10-30T09:00:00.000Z')!;
  assert.equal(ask.question, 'Rent October on 1 Oct looks imported twice. Keep one?');
  const patches = (ask.options as { patches?: { id: string; fields: Fields }[] }[])[0]!.patches!;
  assert.deepEqual(patches[0], { id: settled.spoken, version: 1, fields: { category: 'home', note: 'October rent', hsbc_reference: 'r1', filed_by: 'rule3' } });
  assert.deepEqual(patches[1], { id: alert.spoken, version: 1, fields: { deleted_at: '2026-10-30T09:00:00.000Z' } });
});

test('two lines that are both leaned on are not asked about, and a void line is never one of a pair', () => {
  const a = row({ what: 'Rent', amount: egp(100), on: '2026-10-01', settles: 'b1' });
  const b = row({ what: 'IPN outward transfer to Rent', amount: egp(100), on: '2026-10-01', settles: 'b2' });
  assert.equal(twiceOf([a, b]).length, 0);
  const v = row({ what: 'IPN outward transfer to Rent', amount: egp(100), on: '2026-10-01', state: 'void' });
  assert.equal(twiceOf([{ ...a, fields: { ...a.fields, settles: undefined } }, v]).length, 0);
  assert.equal(twiceAsk([], 'x'), null);
});

test('the script reads and writes the Ledger alone, once a day, and its source holds every function it calls', () => {
  assert.deepEqual(LEDGER_TWICE_SCRIPT.reads, ['transactions']);
  assert.deepEqual(LEDGER_TWICE_SCRIPT.writes, ['transactions']);
  const source = String(LEDGER_TWICE_SCRIPT.source);
  for (const f of ['function bankless', 'function twiceOf', 'function twiceAsk', 'export default async function run']) assert.ok(source.includes(f), f);
});
