/**
 * Money is drawn one way: a job's cost, the Tell screen's amounts and a file read in at the first run spell an
 * amount exactly as `Money` does, which is `drawn` over the stored form, against the record's home currency.
 *
 * THE REFERENCE IS `Money`'S OWN PATH, not the helper the three call, so a screen that took a second road to the
 * writer would still have to arrive at the same string. The scan holds the three files to it: no currency formatted
 * by `Intl` into a figure, and no currency sign typed in front of one. A sign asked of the runtime only to READ one a
 * person typed (`formatToParts(...).find(... 'currency')`) writes nothing and is allowed.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { AMOUNT_SPACE, money } from 'braindog-render';
import { firstPartyDocument } from '@braindog/seed/packs';

import { costWords } from '../../routes/jobs/[id]/cost.ts';
import { tellRead, type TellList } from '../tell/read.ts';
import { drawn } from './money.ts';
import type { FieldDecl } from './schema.ts';

/** An amount as `Money` draws it: the parts of `drawn` over `money()`, joined by the writer's own space (the component sets the code in a span of its own, the same gap apart). */
function asMoney(minor: number, currency: string, home: string | null): string {
  const parts = drawn(money(minor, currency), home);
  assert.ok(parts, `${currency} ${minor} is money`);
  return `${parts.lead}${parts.whole}${parts.fraction}${parts.iso ? `${AMOUNT_SPACE}${parts.iso}` : ''}`;
}

/** The same amount in a sentence: the parts of `drawn` over `money()`, where a whole amount leaves off its `.00` (2263d2ff8). The cents stay when they are not nought. */
function asSaid(minor: number, currency: string, home: string | null): string {
  const parts = drawn(money(minor, currency), home);
  assert.ok(parts, `${currency} ${minor} is money`);
  return `${parts.lead}${parts.whole}${/^\.0+$/u.test(parts.fraction) ? '' : parts.fraction}${parts.iso ? `${AMOUNT_SPACE}${parts.iso}` : ''}`;
}

const HOMES = ['USD', 'EGP', 'JPY', null] as const;

test("a job's smallest coin reads as Money reads one minor unit, in dollars, pounds and yen, at home and away", () => {
  for (const currency of ['USD', 'EGP', 'JPY'])
    for (const home of HOMES) assert.equal(costWords(1, currency, home), `under ${asMoney(1, currency, home)}`, `${currency} on ${home}`);
  /* The two that read plainest: a dollar on a dollar record, a yen coin with no fraction. */
  assert.equal(costWords(1, 'USD', 'USD'), 'under $0.01');
  assert.equal(costWords(1, 'JPY', 'JPY'), 'under ¥1');
  assert.equal(costWords(1, 'usd', 'USD'), 'under $0.01');
  assert.equal(costWords(2, 'USD', 'USD'), null);
});

type Declared = { register?: string; name: string; title: string; fields: FieldDecl[]; one?: string; state?: string };
function seeded(pack: string, id: string): TellList {
  const d = ((firstPartyDocument(pack as never)?.declarations ?? []) as Declared[]).find((x) => x.register === id);
  assert.ok(d, `${pack} declares ${id}`);
  return { id, name: d.name, title: d.title, fields: d.fields, pack, ...(d.one ? { one: d.one } : {}), ...(d.state ? { state: d.state } : {}) };
}

const LISTS = [seeded('people', 'people'), seeded('money-core', 'transactions'), seeded('money-core', 'obligations')];
const ORDERS: TellList = {
  id: 'orders',
  name: 'Orders',
  one: 'order',
  title: 'what',
  state: 'state',
  fields: [
    { id: 'who', type: 'ref', to: 'people' },
    { id: 'what', type: 'text', required: true },
    { id: 'how_many', label: 'How many', type: 'int' },
    { id: 'total', label: 'Total', type: 'money' },
    { id: 'paid', type: 'money' },
    { id: 'state', type: 'enum', values: ['new', 'ready', 'sent', 'paid'], default: 'new', required: true },
  ],
};
const TODAY = '2026-10-07';

test("the Tell screen's payment reads as Money reads it, in dollars, pounds and yen, at home and away", () => {
  const cases = [
    ['USD 1,200.50', 120050, 'USD'],
    ['EGP 1,086,213.00', 108621300, 'EGP'],
    ['JPY 1,200', 1200, 'JPY'],
  ] as const;
  for (const [typed, minor, currency] of cases)
    for (const home of HOMES) {
      const opts = { lists: LISTS, today: TODAY, currency: home, home, accounts: [{ seq: 1, name: 'Card wallet' }] };
      const row = tellRead(`Omar paid me ${typed} by card`, opts).rows.find((r) => r.register === 'transactions');
      assert.deepEqual(row?.fields.amount, { amount: minor, currency }, `${typed} on ${home}`);
      assert.equal(row?.said, `${asSaid(minor, currency, home)} from Omar, by card`, `${typed} on ${home}`);
    }
});

test("the Tell screen's order total reads as Money reads it", () => {
  for (const [currency, home] of [['EGP', 'EGP'], ['USD', 'USD'], ['USD', 'EGP'], ['JPY', null]] as const) {
    const opts = { lists: [...LISTS, ORDERS], today: TODAY, currency, home };
    const order = tellRead('Salma wants 6 amber jars, 1,350 not paid yet', opts).rows.find((r) => r.register === 'orders');
    const minor = currency === 'JPY' ? 1350 : 135000;
    assert.deepEqual(order?.fields.total, { amount: minor, currency }, `${currency} on ${home}`);
    assert.ok(order?.detail.endsWith(`, ${asSaid(minor, currency, home)} not paid yet`), `${order?.detail}`);
  }
});

const FILES = ['../../routes/jobs/[id]/cost.ts', '../tell/read.ts', '../start/export.ts'];
const source = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8');
/* Comments say what was wrong ("it read `$0.01`"), so the scan reads code alone. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

test('none of the three formats a currency of its own: no Intl currency figure, no sign typed before a figure', () => {
  for (const file of FILES) {
    const text = code(source(file));
    /* Every currency format, and what follows it up to the end of the statement. */
    for (const m of text.matchAll(/new Intl\.NumberFormat\([^;]*?style:\s*'currency'[^;]*/gu))
      assert.match(m[0], /\.formatToParts\(1\)\s*\.find\(\(p\) => p\.type === 'currency'\)\?\.value/u, `${file}: an Intl currency figure`);
    assert.doesNotMatch(text, /toLocaleString\([^)]*currency/u, `${file}: toLocaleString writes a currency`);
    /* A sign written in front of a figure or of an interpolated one: `$${n}`, `£${n}`, `€0.01`, `E£ 12`. */
    assert.doesNotMatch(text, /(?:\$\$\{|[£€¥₹]\s?(?:\$\{|\d)|E£\s?\d)/u, `${file}: a sign typed before a figure`);
    /* The stored form put on a screen as it is: `money(` read by nothing. */
    for (const m of text.matchAll(/(?<![\w.])money\(/gu)) {
      const around = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
      assert.match(around, /symbolText\($/u, `${file}: money() drawn as stored`);
    }
  }
});

test('the scan would catch the formats it is there for', () => {
  const planted = [
    "new Intl.NumberFormat('en', { style: 'currency', currency: c }).format(n);",
    'const s = `£${n}`;',
    'const s = `$${n}`;',
    "const s = 'under €0.01';",
    'const s = `${money(n, c)} in`;',
  ];
  const caught = (text: string): boolean => {
    const formatted = [...text.matchAll(/new Intl\.NumberFormat\([^;]*?style:\s*'currency'[^;]*/gu)].some(
      (m) => !/\.formatToParts\(1\)\s*\.find\(\(p\) => p\.type === 'currency'\)\?\.value/u.test(m[0]),
    );
    const signed = /(?:\$\$\{|[£€¥₹]\s?(?:\$\{|\d)|E£\s?\d)/u.test(text);
    const stored = [...text.matchAll(/(?<![\w.])money\(/gu)].some((m) => !/symbolText\($/u.test(text.slice(Math.max(0, (m.index ?? 0) - 40), m.index)));
    return formatted || signed || stored;
  };
  for (const p of planted) assert.ok(caught(p), p);
  for (const file of FILES) assert.equal(caught(code(source(file))), false, file);
});
