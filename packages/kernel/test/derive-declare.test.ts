/**
 * A field worked out from other fields, as a declaration: what installs, what reads exactly,
 * and each way to be wrong refused at install in one sentence naming the fields. Over an invented list of things made.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration, type Entry } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const STORED = [
  { id: 'name', type: 'text', required: true },
  { id: 'making', type: 'decimal' },
  { id: 'packing', type: 'decimal' },
  { id: 'sending', type: 'decimal' },
  { id: 'margin', type: 'decimal' },
  { id: 'grade', type: 'int' },
];

const things = (fields: readonly unknown[], extra: Record<string, unknown> = {}): Declaration =>
  ({ id: 'register.things', kind: 'register', body: { id: 'things', name: 'Things made', title: 'name', fields: [...STORED, ...fields], ...extra } }) as never;

const COST = { id: 'cost', type: 'decimal', derive: { sum: ['making', 'packing', 'sending'] } };

const refused = (fields: readonly unknown[], extra?: Record<string, unknown>) => validateDeclaration(things(fields, extra));

test('cost = sum [making, packing, sending] installs and reads 7.504 exactly', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([things([COST])]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const out = k.create('things', { name: 'Kettle', making: 4.004, packing: 1.5, sending: 2, margin: 2.5 } as never, { actor: 'p_1' }) as { ok: boolean; value: Entry };
  assert.ok(out.ok);
  assert.equal(k.get(out.value.id)?.fields.cost, 7.504);
});

test('least = product [cost, margin] reads through cost, itself worked out: 7.504 times 2.5 reads 18.76', async () => {
  /* A CHAIN IS WORKED OUT IN ORDER (`derive-rows.ts` `inOrder`): cost from the row's parts first, then least from cost. */
  const LEAST = { id: 'least', type: 'decimal', derive: { product: ['cost', 'margin'] } };
  assert.equal(refused([COST, LEAST]), null);
  assert.equal(refused([LEAST, COST]), null, 'the order the fields are declared in is not the order they are read in');
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([things([LEAST, COST])]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const out = k.create('things', { name: 'Kettle', making: 4.004, packing: 1.5, sending: 2, margin: 2.5 } as never, { actor: 'p_1' }) as { ok: boolean; value: Entry };
  assert.ok(out.ok);
  const row = k.get(out.value.id)!;
  assert.equal(row.fields.cost, 7.504);
  assert.equal(row.fields.least, 18.76);
  const listed = k.list({ register: 'things' });
  assert.ok(listed.ok);
  assert.equal(listed.value.rows[0]?.fields.least, 18.76);
});

test('a ring of fields worked out from each other is refused, naming both ends', () => {
  const r = refused([
    { id: 'cost', type: 'decimal', derive: { sum: ['making', 'least'] } },
    { id: 'least', type: 'decimal', derive: { product: ['cost', 'margin'] } },
  ]);
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.equal(r?.fix, 'cost reads least, which reads cost back, so neither can be worked out.');
});

test('an operand that is no field of the list, or the field itself, is refused naming both', () => {
  assert.equal(refused([{ id: 'cost', type: 'decimal', derive: { sum: ['making', 'gluing'] } }])?.fix, 'cost reads gluing, and this list has no field called gluing.');
  assert.equal(refused([{ id: 'cost', type: 'decimal', derive: { sum: ['making', 'cost'] } }])?.fix, 'cost is worked out from itself; name the other fields it reads.');
});

test('a reckoning over a field that is not a number is refused, naming the field', () => {
  const r = refused([{ id: 'cost', type: 'decimal', derive: { sum: ['making', 'name'] } }]);
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.match(r!.fix, /^cost is a decimal, and a sum that is a decimal reads whole numbers and decimals\.$/u);
});

test('a band into an enum has one edge fewer than its values, and an else', () => {
  const band = (steps: unknown[], extra: Record<string, unknown> = {}) => ({
    id: 'size',
    type: 'enum',
    values: ['small', 'middling', 'large'],
    derive: { band: { of: 'grade', steps, ...extra } },
  });
  assert.equal(refused([band([{ upto: 3, is: 'small' }, { upto: 7, is: 'middling' }], { else: 'large' })]), null);
  const short = refused([band([{ upto: 3, is: 'small' }], { else: 'large' })]);
  assert.equal(short?.code, 'DECLARATION_INVALID');
  assert.equal(short?.fix, 'size sorts into its 3 values, so its band has 2 edges, one fewer than its values, and an else for the last; it has 1 edge.');
  assert.match(refused([band([{ upto: 3, is: 'small' }, { upto: 7, is: 'middling' }])])!.fix, /it has 2 edges and no else\.$/u);
  const twice = refused([band([{ upto: 3, is: 'small' }, { upto: 7, is: 'small' }], { else: 'large' })]);
  assert.equal(twice?.fix, "size's band never gives middling; give each of its values once, the last as its else.");
});

test('a key that asks for the value or stores it is refused beside derive', () => {
  for (const key of ['required', 'unique', 'index', 'default']) {
    const r = refused([{ ...COST, [key]: key === 'default' ? 1 : true }]);
    assert.equal(r?.code, 'DECLARATION_INVALID', key);
    assert.equal(r?.at, `cost.${key}`);
  }
});

test('once and same naming a derived field are refused at install in one sentence', () => {
  const once = refused([COST], { once: ['cost'] });
  assert.equal(once?.code, 'DECLARATION_INVALID');
  assert.equal(once?.fix, 'things\'s once names cost, which BrainDog works out itself, so no plugin writes it. Take it out of once.');
  const folded = { id: 'key', type: 'text', derive: { normalise: { of: 'name', how: 'lower' } } };
  const same = refused([folded], { same: { fields: ['key'], fold: 'text' } });
  assert.equal(same?.code, 'DECLARATION_INVALID');
  assert.equal(same?.fix, 'things\'s same names key, which is worked out at read and never stored, so two rows cannot be compared by it.');
});

test('a figure reading a derived field is refused at install in one sentence', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([things([COST])])).ok);
  const figure = (value: unknown) =>
    ({ id: 'metric.spent', kind: 'metric', body: { metric: 'spent', name: 'Spent', source: 'register.things', value, format: 'int', target: { gte: 0 }, window: '30d' } }) as never;
  const out = (await k.install([figure({ sum: 'cost' })])) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(out.refusal?.fix, 'metric.spent reads cost, which is worked out at read and never stored, so a figure cannot add it up; read the fields cost is made from.');
  assert.ok((await k.install([figure({ sum: 'making' })])).ok, 'a figure over a stored field still installs');
});
