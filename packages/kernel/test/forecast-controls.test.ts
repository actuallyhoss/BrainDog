/**
 * What a step of the cash walk carries so the forecast's controls can act on it without a second query.
 *
 * THE CONTROLS ARE ARITHMETIC OVER THE STEPS THE HOST SENT (`packages/render/src/forecast.ts`), and before this a step
 * said only its day, its label and its converted amount. Two of the forecast's five controls cannot be done from that.
 * A rate drift needs to know which steps were converted and from what: measured at the render layer, a USD salary
 * walked into EGP beside EGP rent crossed zero on 2 January with a 10% yearly drift and with none, because nothing
 * could tell the salary from the rent. And counting a plan in or out needs to know which steps are one plan: an
 * instalment's label is `Proofing press, 3 of 8`, so a label is a different word for every part.
 *
 * BOTH ARE SET ONLY WHEN TRUE, so a walk in one currency with no group is the walk it was, key for key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel, type Leg } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day', index: true },
      { id: 'direction', type: 'enum', values: ['owed_to_me', 'owed_by_me'] },
    ],
  } as never,
};

const INSTALMENTS: Declaration = {
  id: 'register.installments',
  kind: 'register',
  body: {
    id: 'installments',
    name: 'Instalments',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'plan', type: 'text' },
      { id: 'parts', type: 'int' },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day', index: true },
    ],
  } as never,
};

const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const MONEY: Leg = { register: 'obligations', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'owed_to_me' } };
const PARTS: Leg = { register: 'installments', on: 'due', amount: 'amount', group: 'plan' };

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, INSTALMENTS, FX])).ok);
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  return k;
}

const made = (k: Kernel, register: string, fields: Record<string, unknown>) => assert.ok(k.create(register, fields, { actor: 'p_1' }).ok);

test('A STEP CONVERTED INTO THE HOME CURRENCY SAYS WHICH CURRENCY IT WAS WRITTEN IN, and one already at home says nothing', async () => {
  const k = await record();
  made(k, 'fx', { currency: 'USD', base: 'EGP', rate: 48.5, as_of: '2026-09-15' });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  made(k, 'obligations', { what: 'Salary', amount: { amount: 100_000, currency: 'USD' }, due: '2026-10-01', direction: 'owed_to_me' });
  made(k, 'obligations', { what: 'Rent', amount: { amount: 5_000_000, currency: 'EGP' }, due: '2026-10-02', direction: 'owed_by_me' });
  const out = k.runway(1_000_000, [MONEY], 60);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.currency, 'EGP');
  const by = Object.fromEntries(out.value.steps.map((s) => [s.label, s]));
  assert.equal(by.Salary?.delta, 4_850_000, 'USD 1,000.00 at 48.5 is EGP 48,500.00');
  assert.equal(by.Salary?.from, 'USD');
  assert.equal(by.Rent?.delta, -5_000_000);
  assert.equal('from' in by.Rent!, false, 'money already in the walk’s currency was never converted');
});

test('A WALK IN ONE CURRENCY WITH NO HOME CURRENCY IS THE WALK IT WAS: no step names a currency it came from', async () => {
  const k = await record();
  made(k, 'obligations', { what: 'Rent', amount: { amount: 5_000_000, currency: 'EGP' }, due: '2026-10-02', direction: 'owed_by_me' });
  const out = k.runway(1_000_000, [MONEY], 60);
  assert.ok(out.ok);
  assert.deepEqual(Object.keys(out.value.steps[0]!).sort(), ['balance', 'day', 'delta', 'label', 'source', 'spoken']);
});

test('THE PARTS OF ONE PLAN SAY WHICH PLAN THEY ARE, from the field the leg names, so the plan is counted or left out whole', async () => {
  const k = await record();
  for (const n of [1, 2, 3]) made(k, 'installments', { what: `Proofing press, ${n} of 3`, plan: 'Proofing press', parts: 3, amount: { amount: 187_500, currency: 'GBP' }, due: `2026-1${n - 1}-05` });
  /* A PLAN FIELD THAT IS EMPTY IS NO PLAN, rather than a plan called the empty word that every such row would share. */
  made(k, 'installments', { what: 'Loose part', amount: { amount: 10_000, currency: 'GBP' }, due: '2026-10-06' });
  const out = k.runway(0, [PARTS], 120);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(
    out.value.steps.map((s) => [s.label, s.of ?? null]),
    [
      ['Proofing press, 1 of 3', 'Proofing press'],
      ['Loose part', null],
      ['Proofing press, 2 of 3', 'Proofing press'],
      ['Proofing press, 3 of 3', 'Proofing press'],
    ],
  );
  /* A LEG THAT NAMES NO GROUP GROUPS NOTHING, and a group field holding a number is not a name. */
  const { group: _none, ...plain } = PARTS;
  const bare = k.runway(0, [plain], 120);
  assert.ok(bare.ok);
  assert.ok(bare.value.steps.every((s) => !('of' in s)));
  const counted = k.runway(0, [{ ...PARTS, group: 'parts' }], 120);
  assert.ok(counted.ok);
  assert.ok(counted.value.steps.every((s) => !('of' in s)));
});
