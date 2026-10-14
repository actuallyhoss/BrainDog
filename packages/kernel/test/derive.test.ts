/**
 * A row-level derived field, worked out at read and never stored: the seven shapes, and every way a declaration of
 * one is refused, each by name. Pure, so no record is opened: `derived` reads a row's fields and `deriveFault` reads a
 * list's fields, and neither touches SQL.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DERIVE_REFUSES, DERIVE_SHAPES, deriveFault, derived, type DeriveField } from '../src/derive.ts';

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const eur = (amount: number) => ({ amount, currency: 'EUR' });

/** An order line, invented: a price, a quantity, a discount, a weight, a code and a link to an account. */
const FIELDS: DeriveField[] = [
  { id: 'price', type: 'money', currency_fixed: true },
  { id: 'tax', type: 'money', currency_from: 'account.balance' },
  { id: 'loose', type: 'money' },
  { id: 'quantity', type: 'int' },
  { id: 'spare', type: 'int' },
  { id: 'rate', type: 'decimal' },
  { id: 'weight', type: 'quantity' },
  { id: 'gross', type: 'quantity' },
  { id: 'code', type: 'text' },
  { id: 'note', type: 'document' },
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'accounts_all', type: 'list', of: 'ref', to: 'accounts' },
  { id: 'gone', type: 'int', retired: true },
  { id: 'worked', type: 'int', derive: { sum: ['quantity', 'spare'] } },
];
const ACCOUNTS: DeriveField[] = [
  { id: 'name', type: 'text' },
  { id: 'balance', type: 'money' },
  { id: 'label', type: 'text', derive: { normalise: { of: 'name', how: 'lower' } } },
];

const f = (id: string, type: string, derive: unknown, more: Record<string, unknown> = {}): DeriveField => ({ id, type, derive, ...more });
const fix = (field: DeriveField, theirs?: DeriveField[]) => deriveFault(field, FIELDS, theirs);

test('the seven shapes, in the order the grammar names them', () => {
  assert.deepEqual([...DERIVE_SHAPES], ['sum', 'diff', 'product', 'ratio', 'band', 'via', 'normalise']);
});

test('a well-formed field of each shape passes', () => {
  const good = [
    f('total', 'money', { sum: ['price', 'tax'] }),
    f('left', 'int', { diff: ['quantity', 'spare'] }),
    f('line', 'money', { product: ['price', 'quantity'] }),
    f('share', 'decimal', { ratio: ['quantity', 'spare'] }),
    f('size', 'enum', { band: { of: 'price', steps: [{ upto: 1000, is: 'small' }], else: 'large' } }, { values: ['small', 'large'] }),
    f('who', 'text', { via: { ref: 'account', field: 'name' } }),
    f('key', 'text', { normalise: { of: 'code', how: 'digits' } }),
    f('heavy', 'quantity', { sum: ['weight', 'gross'] }),
  ];
  for (const g of good) assert.equal(fix(g, ACCOUNTS), null, g.id);
  assert.equal(deriveFault({ id: 'plain', type: 'int' }, FIELDS), null, 'a field without derive is not this rule');
});

test('an unknown shape, and a derive that names two', () => {
  const r = fix(f('total', 'int', { add: ['quantity', 'spare'] }));
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.equal(r?.at, 'total.derive');
  assert.match(r!.fix, /^total is worked out by add, which is not a shape/);
  assert.match(fix(f('total', 'int', { sum: ['quantity', 'spare'], diff: ['quantity', 'spare'] }))!.fix, /exactly one of sum, diff/);
  assert.match(fix(f('total', 'int', 'sum'))!.fix, /exactly one of/);
});

test('index, unique, required, required_when, default and immutable beside derive are each refused by name', () => {
  const extra: Record<string, unknown> = { index: true, unique: true, required: true, required_when: { field: 'code', is: 'x' }, default: 0, immutable: true };
  for (const key of DERIVE_REFUSES) {
    const r = fix(f('total', 'int', { sum: ['quantity', 'spare'] }, { [key]: extra[key] }));
    assert.equal(r?.at, `total.${key}`, key);
    assert.match(r!.fix, new RegExp(`drop ${key}\\.$`), key);
    assert.match(r!.fix, /^total /, key);
  }
  assert.equal(fix(f('total', 'int', { sum: ['quantity', 'spare'] }, { index: false })), null, 'index: false asks nothing');
});

test('a source that does not exist, is retired, is derived, or is the field itself', () => {
  assert.match(fix(f('total', 'int', { sum: ['quantity', 'ghost'] }))!.fix, /total reads ghost, and this list has no field called ghost\./);
  assert.match(fix(f('total', 'int', { sum: ['quantity', 'gone'] }))!.fix, /no field called gone/);
  assert.match(fix(f('total', 'int', { sum: ['quantity', 'worked'] }))!.fix, /total reads worked, which is itself worked out/);
  assert.match(fix(f('total', 'int', { sum: ['quantity', 'total'] }))!.fix, /worked out from itself/);
  assert.match(fix(f('size', 'text', { band: { of: 'worked', steps: [{ upto: 1, is: 'a' }] } }))!.fix, /itself worked out/);
});

test('the shape body: arity, band steps, via and normalise', () => {
  assert.match(fix(f('total', 'int', { sum: ['quantity'] }))!.fix, /two or more/);
  assert.match(fix(f('left', 'int', { diff: ['quantity', 'spare', 'spare'] }))!.fix, /reads two of its other fields/);
  assert.match(fix(f('size', 'text', { band: { of: 'price', steps: [] } }))!.fix, /sorts one number into bands/);
  assert.match(fix(f('size', 'text', { band: { of: 'price', steps: [{ upto: 5, is: 'a' }, { upto: 5, is: 'b' }] } }))!.fix, /smallest upto to the largest/);
  const enumBand = f('size', 'enum', { band: { of: 'price', steps: [{ upto: 5, is: 'small' }], else: 'huge' } }, { values: ['small'] });
  assert.match(fix(enumBand)!.fix, /size is an enum without the value huge/);
  assert.match(fix(f('who', 'text', { via: { ref: 'account' } }))!.fix, /through a link of this list/);
  assert.match(fix(f('key', 'text', { normalise: { of: 'code', how: 'upper' } }))!.fix, /lower, trim or digits/);
});

test('a shape the field type cannot hold', () => {
  const cases: [DeriveField, RegExp][] = [
    [f('total', 'money', { sum: ['price', 'quantity'] }), /total is a money, and a sum of money adds money to money/],
    [f('total', 'int', { sum: ['quantity', 'rate'] }), /total is an int, and a sum that is an int reads int fields only/],
    [f('total', 'text', { sum: ['quantity', 'spare'] }), /a sum is money, a quantity or a number/],
    [f('line', 'money', { product: ['price', 'tax'] }), /one money field times one number/],
    [f('line', 'int', { product: ['quantity', 'rate'] }), /two whole numbers/],
    [f('share', 'int', { ratio: ['quantity', 'spare'] }), /share is an int, and a ratio is a decimal/],
    [f('share', 'decimal', { ratio: ['price', 'quantity'] }), /two numbers, or two money fields/],
    [f('size', 'int', { band: { of: 'price', steps: [{ upto: 1, is: 'a' }] } }), /an enum or a text/],
    [f('size', 'text', { band: { of: 'code', steps: [{ upto: 1, is: 'a' }] } }), /a band sorts a number, and code is not one/],
    [f('key', 'int', { normalise: { of: 'code', how: 'trim' } }), /normalise gives text/],
    [f('key', 'text', { normalise: { of: 'note', how: 'trim' } }), /note is not text/],
  ];
  for (const [field, want] of cases) assert.match(fix(field)!.fix, want, field.id);
});

test('via takes the far field\'s type, and never reads through a list of links', () => {
  assert.match(fix(f('who', 'text', { via: { ref: 'accounts_all', field: 'name' } }))!.fix, /accounts_all, which is a list of links, and via reads through one link/);
  assert.match(fix(f('who', 'text', { via: { ref: 'code', field: 'name' } }))!.fix, /code, which is a text, and via reads through a link/);
  assert.match(fix(f('who', 'int', { via: { ref: 'account', field: 'name' } }), ACCOUNTS)!.fix, /name of accounts is a text, so give who the type text/);
  assert.match(fix(f('who', 'text', { via: { ref: 'account', field: 'nickname' } }), ACCOUNTS)!.fix, /accounts has no such field/);
  assert.match(fix(f('who', 'text', { via: { ref: 'account', field: 'label' } }), ACCOUNTS)!.fix, /label of accounts, which is itself worked out/);
  assert.equal(fix(f('who', 'int', { via: { ref: 'account', field: 'name' } })), null, 'the far list unknown here is checked where it is read');
});

test('sum or diff over money whose currency is not fixed to one', () => {
  const r = fix(f('total', 'money', { sum: ['price', 'loose'] }));
  assert.match(r!.fix, /^total adds money from loose, whose currency is not fixed, so give loose currency_fixed or currency_from\.$/);
  assert.match(fix(f('left', 'money', { diff: ['loose', 'price'] }))!.fix, /from loose/);
  assert.equal(fix(f('line', 'money', { product: ['loose', 'quantity'] })), null, 'a product holds one money, so one currency');
});

test('every fix is one sentence, naming the field, with no em dash', () => {
  const r = fix(f('total', 'money', { sum: ['price', 'loose'] }))!;
  assert.equal(r.fix.split(/\.\s/u).length, 1);
  assert.ok(!r.fix.includes('—'));
});

/* ── the value ── */

test('sum: money keeps its currency and minor units, numbers add, quantities share a unit', () => {
  assert.deepEqual(derived({ price: gbp(400), tax: gbp(80) }, f('t', 'money', { sum: ['price', 'tax'] })), gbp(480));
  assert.equal(derived({ quantity: 3, spare: 4 }, f('t', 'int', { sum: ['quantity', 'spare'] })), 7);
  assert.equal(derived({ a: 0.1, b: 0.2 }, f('t', 'decimal', { sum: ['a', 'b'] })), 0.3);
  assert.deepEqual(derived({ w: { value: 2, unit: 'kg' }, g: { value: 1.5, unit: 'kg' } }, f('t', 'quantity', { sum: ['w', 'g'] })), { value: 3.5, unit: 'kg' });
  assert.equal(derived({ w: { value: 2, unit: 'kg' }, g: { value: 1, unit: 'lb' } }, f('t', 'quantity', { sum: ['w', 'g'] })), null);
});

test('money in two currencies is never added: null', () => {
  assert.equal(derived({ price: gbp(400), tax: eur(80) }, f('t', 'money', { sum: ['price', 'tax'] })), null);
  assert.equal(derived({ price: gbp(400), tax: eur(80) }, f('t', 'money', { diff: ['price', 'tax'] })), null);
});

test('a missing source gives null, never zero', () => {
  assert.equal(derived({ price: gbp(400) }, f('t', 'money', { sum: ['price', 'tax'] })), null);
  assert.equal(derived({ quantity: 3, spare: null }, f('t', 'int', { sum: ['quantity', 'spare'] })), null);
  assert.equal(derived({ code: '' }, f('k', 'text', { normalise: { of: 'code', how: 'trim' } })), null);
  assert.equal(derived({}, f('s', 'text', { band: { of: 'price', steps: [{ upto: 1, is: 'a' }], else: 'b' } })), null);
});

test('diff takes the second from the first', () => {
  assert.deepEqual(derived({ price: gbp(400), tax: gbp(950) }, f('t', 'money', { diff: ['price', 'tax'] })), gbp(-550));
  assert.equal(derived({ quantity: 3, spare: 4 }, f('t', 'int', { diff: ['quantity', 'spare'] })), -1);
});

test('product: 4.00 times 3 is 12.00, either way round, and a fraction of a penny rounds', () => {
  const line = f('line', 'money', { product: ['price', 'quantity'] });
  assert.deepEqual(derived({ price: gbp(400), quantity: 3 }, line), gbp(1200));
  assert.deepEqual(derived({ quantity: 3, price: gbp(400) }, f('line', 'money', { product: ['quantity', 'price'] })), gbp(1200));
  assert.deepEqual(derived({ price: gbp(333), rate: 0.5 }, f('half', 'money', { product: ['price', 'rate'] })), gbp(167));
  assert.deepEqual(derived({ price: gbp(-333), rate: 0.5 }, f('half', 'money', { product: ['price', 'rate'] })), gbp(-167));
  assert.deepEqual(derived({ price: gbp(25), rate: 0.58 }, f('part', 'money', { product: ['price', 'rate'] })), gbp(15), 'a float just under a half is still a half');
  assert.deepEqual(derived({ price: gbp(-45), rate: 0.7 }, f('part', 'money', { product: ['price', 'rate'] })), gbp(-32));
  assert.deepEqual(derived({ price: gbp(250), w: { value: 2, unit: 'kg' } }, f('line', 'money', { product: ['price', 'w'] })), gbp(500));
  assert.equal(derived({ quantity: 3, spare: 4 }, f('p', 'int', { product: ['quantity', 'spare'] })), 12);
  assert.equal(derived({ price: gbp(Number.MAX_SAFE_INTEGER), quantity: 3 }, line), null, 'past 2^53 - 1 is no longer money');
});

test('ratio: a decimal, by zero null, money over money only in one currency', () => {
  const share = f('share', 'decimal', { ratio: ['quantity', 'spare'] });
  assert.equal(derived({ quantity: 3, spare: 4 }, share), 0.75);
  assert.equal(derived({ quantity: 3, spare: 0 }, share), null);
  assert.equal(derived({ price: gbp(100), tax: gbp(400) }, f('r', 'decimal', { ratio: ['price', 'tax'] })), 0.25);
  assert.equal(derived({ price: gbp(100), tax: eur(400) }, f('r', 'decimal', { ratio: ['price', 'tax'] })), null);
  assert.equal(derived({ price: gbp(100), tax: gbp(0) }, f('r', 'decimal', { ratio: ['price', 'tax'] })), null);
});

test('band walks steps by upto, inclusive, then else, then null', () => {
  const size = f('size', 'text', { band: { of: 'n', steps: [{ upto: 10, is: 'small' }, { upto: 100, is: 'middling' }], else: 'large' } });
  assert.equal(derived({ n: 10 }, size), 'small');
  assert.equal(derived({ n: 11 }, size), 'middling');
  assert.equal(derived({ n: 101 }, size), 'large');
  const open = f('size', 'text', { band: { of: 'n', steps: [{ upto: 10, is: 'small' }] } });
  assert.equal(derived({ n: 50 }, open), null);
  assert.equal(derived({ price: gbp(999) }, f('size', 'text', { band: { of: 'price', steps: [{ upto: 1000, is: 'under ten' }] } })), 'under ten', 'money by minor units');
});

test('via reads the far value the resolver gave, and null for a link it did not', () => {
  const who = f('who', 'text', { via: { ref: 'account', field: 'name' } });
  const seen = new Map([['A1', 'Juniper Lane']]);
  assert.equal(derived({ account: 'A1' }, who, seen), 'Juniper Lane');
  assert.equal(derived({ account: 'A2' }, who, seen), null);
  assert.equal(derived({ account: 'A1' }, who), null, 'no resolver, no value');
  assert.equal(derived({}, who, seen), null);
});

test('normalise: lower, trim and digits', () => {
  assert.equal(derived({ c: 'Hello World' }, f('k', 'text', { normalise: { of: 'c', how: 'lower' } })), 'hello world');
  assert.equal(derived({ c: '  ab c  ' }, f('k', 'text', { normalise: { of: 'c', how: 'trim' } })), 'ab c');
  assert.equal(derived({ c: '+44 (0) 20-7946' }, f('k', 'text', { normalise: { of: 'c', how: 'digits' } })), '440207946');
  assert.equal(derived({ c: 'none' }, f('k', 'text', { normalise: { of: 'c', how: 'digits' } })), null);
});

test('a field whose derive is not a shape derives null rather than throwing', () => {
  assert.equal(derived({ quantity: 3 }, f('t', 'int', { add: ['quantity'] })), null);
});
