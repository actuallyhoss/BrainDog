/**
 * Imported automations as filing rules, on Home: which automations are picked and which are not, the
 * rules written in one capture (eight to a capture past eight), the switch-offs, the one Undo, a refusal said with its
 * field named and everything put back, and nothing drawn at nought.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { acceptWith, captureRowOf, importedOf, loadImported, readImported, undoWith, WORDS, type Port } from './imported-rules.ts';

/** An invented Ledger: the record finds it by what it declares, never by its id. */
const LEDGER = 'money_moves';
const GROCERIES = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const OUTINGS = '01J9Z3K4M5N6P7Q8R9S0T1V2W4';
const CATS = [
  { id: GROCERIES, name: 'Groceries' },
  { id: OUTINGS, name: 'Outings' },
];

/** An automation with its body, as `automation(rule)` answers one. Invented names only. */
const auto = (rule: string, body: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  rule,
  name: `File ${rule}`,
  enabled: true,
  trigger: 'written',
  register: LEDGER,
  body: { rule, ...body },
  ...more,
});
const setCat = (to: string) => [{ set: { field: 'category', to } }];
const HOLDS = auto('green-grocer', { register: LEDGER, when: { field: 'what', contains: 'GREEN GROCER' }, then: setCat('Groceries') });
const STARTS = auto('tea-corner', {
  on: { written: { register: LEDGER } },
  when: 'what starts with "TEA CORNER"',
  then: [{ link: { field: 'category', to: { register: 'categories', by: 'name', value: 'Outings' } } }],
});
const SAID = auto('bakery', { register: LEDGER, when: 'what contains bakery', then: setCat(GROCERIES) });

test('PICKED: on, on a Ledger write, one test of the description, one set of the category', () => {
  const found = importedOf([HOLDS, STARTS, SAID], { categories: CATS, ledgers: [LEDGER], list: 'categories' });
  assert.deepEqual(
    found.rules.map((r) => [r.rule, r.match, r.match_by, r.category]),
    [
      ['green-grocer', 'GREEN GROCER', 'contains', GROCERIES],
      ['tea-corner', 'TEA CORNER', 'starts', OUTINGS],
      ['bakery', 'bakery', 'contains', GROCERIES],
    ],
  );
  for (const r of found.rules) {
    assert.equal(r.reads, 'description');
    assert.equal(r.direction, 'either');
    assert.equal(r.state, 'on');
  }
  /* THE FILING-RULES LIST'S OWN FIELD IDS, and a note naming the automation it was. */
  assert.deepEqual(captureRowOf(found.rules[0]!), {
    register: 'filing_rules',
    fields: { match: 'GREEN GROCER', match_by: 'contains', reads: 'description', direction: 'either', category: GROCERIES, state: 'on', note: 'Made from the automation File green-grocer.' },
  });
});

test('NOT PICKED: off, another list, another field, two tests, more than one thing done, steps, an unknown category, a template', () => {
  const not = [
    { ...HOLDS, enabled: false },
    auto('a', { register: 'tasks', when: { field: 'what', contains: 'X' }, then: setCat('Groceries') }),
    auto('b', { register: LEDGER, when: { field: 'counterparty_text', contains: 'X' }, then: setCat('Groceries') }),
    auto('c', { register: LEDGER, when: { all: [{ field: 'what', contains: 'X' }, { field: 'amount', gt: 5 }] }, then: setCat('Groceries') }),
    auto('d', { register: LEDGER, when: 'what contains X, amount more than 5', then: setCat('Groceries') }),
    auto('e', { register: LEDGER, when: { field: 'what', contains: 'X' }, then: [...setCat('Groceries'), { tag: 'food' }] }),
    auto('f', { register: LEDGER, when: { field: 'what', is: 'X' }, then: setCat('Groceries') }),
    auto('g', { on: { written: { register: LEDGER } }, steps: [{ set: { field: 'category', to: 'Groceries' } }], when: { field: 'what', contains: 'X' } }),
    auto('h', { register: LEDGER, when: { field: 'what', contains: 'X' }, then: setCat('Holidays') }),
    auto('i', { register: LEDGER, when: { field: 'what', contains: 'X' }, then: [{ link: { field: 'category', to: { register: 'categories', by: 'match', value: '{{what}}' } } }] }),
    auto('j', { on: { every: '1d' }, register: LEDGER, when: { field: 'what', contains: 'X' }, then: setCat('Groceries') }),
    auto('k', { register: LEDGER, when: { field: 'what', contains: 'X' }, then: setCat('') }),
  ];
  assert.deepEqual(importedOf(not, { categories: CATS, ledgers: [LEDGER], list: 'categories' }).rules, []);
  /* A SPOKEN ID IS KEPT AS IT IS, and the record resolves it. */
  const spoken = auto('s', { register: LEDGER, when: { field: 'what', starts: 'KIOSK' }, then: setCat('categories#4') });
  assert.equal(importedOf([spoken], { ledgers: [LEDGER], list: 'categories' }).rules[0]?.category, 'categories#4');
});

test('THE SAME TEXT TWICE: one rule and both switched off, or neither where two categories disagree', () => {
  const twin = auto('green-grocer-2', { register: LEDGER, when: 'what holds green  grocer', then: setCat('groceries') });
  const one = importedOf([HOLDS, twin], { categories: CATS, ledgers: [LEDGER], list: 'categories' });
  assert.equal(one.rules.length, 1);
  assert.deepEqual(one.rules[0]?.also, ['green-grocer-2']);
  const torn = auto('green-grocer-3', { register: LEDGER, when: { field: 'what', contains: 'Green Grocer' }, then: setCat('Outings') });
  assert.deepEqual(importedOf([HOLDS, torn, SAID], { categories: CATS, ledgers: [LEDGER], list: 'categories' }).rules.map((r) => r.rule), ['bakery']);
});

/** A record in memory: its automations, its categories, and every call the offer made. */
function fake(autos: ReturnType<typeof auto>[], refuse: { capture?: number; off?: string } = {}, rules: Record<string, unknown>[] = []) {
  const calls: string[] = [];
  const captured: unknown[][] = [];
  let n = 0;
  const port: Port = {
    automations: async () => ({ ok: true, value: autos.map(({ body: _body, ...row }) => row) }),
    automation: async (rule) => ({ ok: true, value: autos.find((a) => a.rule === rule) }),
    categories: async () => ({ ok: true, value: { rows: CATS.map((c) => ({ id: c.id, fields: { name: c.name } })), matched: 2, cursor: null } }),
    filingRules: async () => ({ ok: true, value: { rows: rules.map((fields, i) => ({ id: `R${i}`, fields })), matched: rules.length, cursor: null } }),
    capture: async (rows) => {
      n += 1;
      calls.push(`capture ${rows.length}`);
      if (refuse.capture === n) return { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'A filing rule needs a category.', at: 'rows[0].fields.category' } };
      captured.push(rows);
      return { ok: true, value: { batch: `B${n}`, made: rows.map((_, i) => ({ register: 'filing_rules', seq: i + 1, title: '' })) } };
    },
    schema: async (register) =>
      register === LEDGER
        ? { ok: true, value: { fields: [{ id: 'what', type: 'text' }, { id: 'filed_by', type: 'ref', to: 'filing_rules' }] } }
        : register === 'filing_rules'
          ? { ok: true, value: { fields: [{ id: 'match', label: 'Matches', type: 'text' }, { id: 'category', type: 'ref', to: 'categories' }] } }
          : { ok: true, value: { fields: [{ id: 'what', type: 'text' }] } },
    setAutomation: async (rule, enabled) => {
      calls.push(`${enabled ? 'on' : 'off'} ${rule}`);
      return !enabled && refuse.off === rule ? { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only you can switch an automation off.', at: 'enabled' } } : { ok: true, value: {} };
    },
    undo: async (batch) => {
      calls.push(`undo ${batch}`);
      return { ok: true };
    },
  };
  return { port, calls, captured };
}

test('THE PRESS: every rule in one capture, then each automation switched off, and one Undo puts both back', async () => {
  const { port, calls, captured } = fake([HOLDS, STARTS, SAID]);
  const found = await readImported(port);
  assert.equal(found?.rules.length, 3);
  const out = await acceptWith(port, found!);
  assert.ok(out.ok);
  assert.deepEqual(out.value, { made: 3, batches: ['B1'], off: ['green-grocer', 'tea-corner', 'bakery'] });
  assert.deepEqual(calls, ['capture 3', 'off green-grocer', 'off tea-corner', 'off bakery']);
  assert.equal(captured[0]?.length, 3);
  calls.length = 0;
  assert.deepEqual(await undoWith(port, out.value), { ok: true });
  assert.deepEqual(calls, ['on bakery', 'on tea-corner', 'on green-grocer', 'undo B1']);
});

test('PAST EIGHT, eight to a capture, and one Undo takes back every batch', async () => {
  const many = Array.from({ length: 11 }, (_, i) => auto(`shop-${i}`, { register: LEDGER, when: { field: 'what', contains: `SHOP ${i}` }, then: setCat('Groceries') }));
  const { port, calls } = fake(many);
  const out = await acceptWith(port, (await readImported(port))!);
  assert.ok(out.ok);
  assert.deepEqual(out.value.batches, ['B1', 'B2']);
  assert.deepEqual(calls.filter((c) => c.startsWith('capture')), ['capture 8', 'capture 3']);
  calls.length = 0;
  await undoWith(port, out.value);
  assert.deepEqual(calls.filter((c) => c.startsWith('undo')), ['undo B2', 'undo B1']);
});

test('A REFUSAL NAMES THE FIELD AND PUTS BACK WHAT WENT BEFORE IT', async () => {
  const many = Array.from({ length: 9 }, (_, i) => auto(`shop-${i}`, { register: LEDGER, when: { field: 'what', contains: `SHOP ${i}` }, then: setCat('Groceries') }));
  const capture = fake(many, { capture: 2 });
  const refused = await acceptWith(capture.port, (await readImported(capture.port))!);
  assert.deepEqual(refused, { ok: false, fix: 'A filing rule needs a category. (Category)' });
  assert.deepEqual(capture.calls, ['capture 8', 'capture 1', 'undo B1']);
  const off = fake([HOLDS, STARTS], { off: 'tea-corner' });
  const said = await acceptWith(off.port, (await readImported(off.port))!);
  assert.deepEqual(said, { ok: false, fix: 'Only you can switch an automation off. (On or off)' });
  assert.deepEqual(off.calls, ['capture 2', 'off green-grocer', 'off tea-corner', 'on green-grocer', 'undo B1']);
});

test('THE LEDGER BY WHAT IT DECLARES: an automation on a list with no link to the filing rules is never opened', async () => {
  const elsewhere = auto('plan-shop', { register: 'plans', when: { field: 'what', contains: 'SHOP' }, then: setCat('Groceries') }, { register: 'plans' });
  const { port } = fake([HOLDS, elsewhere]);
  const opened: string[] = [];
  const found = await readImported({ ...port, automation: (rule) => (opened.push(rule), port.automation(rule)) });
  assert.deepEqual(found?.rules.map((r) => r.rule), ['green-grocer']);
  assert.deepEqual(opened, ['green-grocer']);
  assert.equal(await readImported(fake([elsewhere]).port), null);
});

test('NOUGHT DRAWS NOTHING: none picked, a refused read, or a host that is not there', async () => {
  assert.equal(await readImported(fake([{ ...HOLDS, enabled: false }]).port), null);
  assert.equal(await readImported(fake([]).port), null);
  const refusing = { ...fake([HOLDS]).port, automations: async () => ({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }) };
  assert.equal(await readImported(refusing), null);
  assert.equal(await readImported({ ...refusing, automations: () => Promise.reject(new Error('offline')) }), null);
  assert.equal(await loadImported('http://record.test', async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await loadImported('http://record.test', async () => new Response('<html>', { status: 200 })), null);
});

test('NOT PICKED EITHER: an add-on\'s own, one for a project, two quoted texts, a category since deleted', () => {
  const not = [
    { ...HOLDS, pack: 'garden-pack' },
    { ...HOLDS, project: '01J9Z3K4M5N6P7Q8R9S0T1V2W9' },
    auto('p', { register: LEDGER, project: 'P1', when: { field: 'what', contains: 'X' }, then: setCat('Groceries') }),
    auto('q', { register: LEDGER, when: 'what contains "PIER" or "DOCK"', then: setCat('Groceries') }),
    auto('r', { register: LEDGER, when: { field: 'what', contains: 'X' }, then: setCat('01J9Z3K4M5N6P7Q8R9S0T1V2W8') }),
  ];
  assert.deepEqual(importedOf(not, { categories: CATS, ledgers: [LEDGER], whole: true, list: 'categories' }).rules, []);
  /* A QUOTE THAT HOLDS ITS OWN MARK IS ONE TEXT, as the record reads it. */
  const one = auto('t', { register: LEDGER, when: "what contains 'Joe's cafe'", then: setCat('Outings') });
  assert.equal(importedOf([one], { categories: CATS, ledgers: [LEDGER], list: 'categories' }).rules[0]?.match, "Joe's cafe");
});

test('A FILING RULE ALREADY THERE: never written twice, the automation only switched off, or left on where it disagrees', async () => {
  const same = { match: 'green grocer', match_by: 'starts', reads: 'description', state: 'on', category: GROCERIES };
  const { port, calls } = fake([HOLDS, STARTS], {}, [same]);
  const found = (await readImported(port))!;
  assert.deepEqual(found.rules.map((r) => [r.rule, r.there]), [['green-grocer', true], ['tea-corner', false]]);
  const out = await acceptWith(port, found);
  assert.ok(out.ok);
  assert.deepEqual(calls, ['capture 1', 'off green-grocer', 'off tea-corner']);
  assert.deepEqual(out.value, { made: 1, batches: ['B1'], off: ['green-grocer', 'tea-corner'] });
  const other = fake([HOLDS], {}, [{ ...same, category: OUTINGS }]);
  assert.equal(await readImported(other.port), null);
  /* ONE OFF, OR READING THE BANK'S TEXT, IS NOT IN THE WAY. */
  const aside = fake([HOLDS], {}, [{ ...same, state: 'off', category: OUTINGS }, { ...same, reads: 'payee', category: OUTINGS }]);
  assert.equal((await readImported(aside.port))?.rules[0]?.there, false);
  const unread = { ...fake([HOLDS]).port, filingRules: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } }) };
  assert.equal(await readImported(unread), null);
});

test('THE WORDS: the offer, the button, what it made, with no em dash', () => {
  assert.equal(WORDS.ask(3), 'Turn three imported automations into filing rules?');
  assert.equal(WORDS.ask(1), 'Turn one imported automation into a filing rule?');
  assert.equal(WORDS.ask(57), 'Turn 57 imported automations into filing rules?');
  assert.equal(WORDS.press(3), 'Turn all three into filing rules');
  assert.equal(WORDS.made(3, 4), 'Made three filing rules and switched off four automations.');
  for (const w of Object.values(WORDS)) assert.doesNotMatch(typeof w === 'string' ? w : w(2, 2), /—|\brow\b|entity/u);
});

test('THE TILE IS FLAT, DRAWS NOTHING AT NOUGHT, AND ITS WORDS ARE 15 OR MORE', () => {
  const part = readFileSync(new URL('./ImportedRules.svelte', import.meta.url), 'utf8');
  assert.match(part, /\{#if n > 0\}/u);
  const style = /<style>([\s\S]*)<\/style>/u.exec(part)![1]!;
  assert.match(style, /\.imported \{[^}]*border-radius: var\(--r-tile, 16px\);/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(style.replace(/@media \(forced-colors: active\)[\s\S]*$/u, ''), /\bborder:/u);
  for (const size of style.matchAll(/font-size: ([^;]+);/gu)) assert.match(size[1]!, /^var\(--fs-body(, 15px)?\)$/u);
  assert.doesNotMatch(part, /—/u);
});
