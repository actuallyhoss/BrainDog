/**
 * The rule sheet gate, driven against a stub page: what it reads, what it prints and when it is false.
 *
 *   node --test tools/gates/test/rule-sheet.test.mjs
 *
 * NO BROWSER AND NO RECORD. The gate's reading runs in the page (`readIn`), so the stub hands it a `document` that
 * answers `querySelectorAll` from a table of what each address draws at each width, and `sweep` is asked exactly as
 * the gate asks it. The lines it prints are compared word for word, because the line is what a person checks.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import ruleSheet, { addressOf, judge, needs, packPages, rulesOf, sweep, WIDTHS } from '../rule-sheet.mjs';

/** An element as `readIn` reads one: its text, its attributes and its inline style. */
const el = (text, attrs = {}, style = {}) => ({
  textContent: text,
  getAttribute: (n) => attrs[n] ?? null,
  style: { getPropertyValue: (p) => style[p] ?? '' },
});

/**
 * A stub of the gate's page: `drawn[width][path][selector]` is what that selector finds. `evaluate` runs the gate's
 * own in-page function against a `document` built from it, so `readIn` is what is tested and not a copy of it.
 */
function stub(drawn, opened = []) {
  return async (width) => {
    let here = null;
    return {
      goto: async (url) => {
        opened.push(`${width} ${url}`);
        const path = new URL(url).pathname.replace(/^\/app\/proof/u, '');
        here = drawn[width]?.[path] ?? null;
        if (here === null) throw new Error('it answered 404');
      },
      evaluate: async (fn, arg) => {
        if (/[[]$/u.test(arg.selector)) throw new Error('not a selector');
        globalThis.document = { querySelectorAll: (s) => here[s] ?? [] };
        globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
        try {
          return fn(arg);
        } finally {
          delete globalThis.document;
          delete globalThis.getComputedStyle;
        }
      },
    };
  };
}

const BASE = 'https://proof.example/app/proof';

const FENCE = '.block-degraded .degraded-fix';
const RULES = rulesOf({
  pages: { Layout: '/p/rule-sheet-layout' },
  rules: [
    { rule: 'stat of seven rows', page: 'Blocks', selector: FENCE, text: 'A stat takes six' },
    { rule: 'no side column', page: 'Layout', selector: '.area[data-area="rail"]', count: 0 },
    { rule: 'main is 12 wide', page: 'Layout', selector: '.area[data-area="main"]', style: '--area-span', is: '12' },
  ],
});

/* Both widths draw the same Blocks page; the Layout page draws one main column and no rail. */
const page = {
  '/p/blocks': { [FENCE]: [el('A ring takes five.'), el('  A stat takes six. The block is shown as you wrote it. ')] },
  '/p/rule-sheet-layout': { '.area[data-area="main"]': [el('Tasks', { 'data-area': 'main' }, { '--area-span': '12' })] },
};
const DRAWN = { 390: page, 1440: page };

test('a rule prints what it read and its truth at both widths, as the scope words it', async () => {
  const opened = [];
  const lines = (await sweep(RULES, BASE, stub(DRAWN, opened))).map((r) => r.line);
  assert.deepEqual(lines, [
    "Blocks: stat of seven rows reads 'A stat takes six. The block is shown as you wrote it.', true at 390, true at 1440",
    'Layout: no side column reads nothing, true at 390, true at 1440',
    'Layout: main is 12 wide reads --area-span 12, true at 390, true at 1440',
  ]);
  assert.deepEqual(WIDTHS, [390, 1440]);
  assert.equal(opened.length, 4, 'each page once a width, however many rules it holds');
});

test('A RULE THAT DOES NOT HOLD IS FALSE AND SAYS WHAT IT FOUND, at the width where it does not', async () => {
  const phone = { ...page, '/p/rule-sheet-layout': { ...page['/p/rule-sheet-layout'], '.area[data-area="rail"]': [el('Pinned')] } };
  const [, rail] = await sweep(RULES, BASE, stub({ 390: phone, 1440: page }));
  assert.equal(rail.ok, false);
  assert.equal(rail.line, 'Layout: no side column reads 1 found at 390; nothing at 1440, false at 390, true at 1440');
});

test('a page that does not open and a selector that does not parse are false, and say so', async () => {
  const rules = rulesOf([
    { rule: 'a heat', page: 'Counts', selector: '.heat', count: 1 },
    { rule: 'a broken selector', page: 'Blocks', selector: '.cell[', count: 1 },
  ]);
  const results = await sweep(rules, BASE, stub(DRAWN));
  assert.deepEqual(results.map((r) => r.ok), [false, false]);
  assert.match(results[0].line, /^Counts: a heat reads nothing, because \/p\/counts did not open \(it answered 404\), false at 390, false at 1440$/u);
  assert.match(results[1].line, /is not a selector/u);
});

test('a rule with a zone and a moment is read on a page of its own, opened in that zone at that moment', async () => {
  const asked = [];
  const base = stub(DRAWN);
  const open = async (width, when) => {
    asked.push(when === undefined ? `${width}` : `${width} ${when.zone} ${when.at}`);
    const page = await base(width);
    return { ...page, close: async () => asked.push(`${width} closed`) };
  };
  const rules = rulesOf({
    pages: { Layout: '/p/rule-sheet-layout' },
    rules: [
      { rule: 'main is 12 wide', page: 'Layout', selector: '.area[data-area="main"]', style: '--area-span', is: '12' },
      { rule: 'in Cairo', page: 'Layout', selector: '.area[data-area="main"]', count: 1, zone: 'Africa/Cairo', at: '2026-10-14T22:30:00Z' },
      { rule: 'in UTC', page: 'Layout', selector: '.area[data-area="main"]', count: 1, zone: 'UTC', at: '2026-10-14T22:30:00Z' },
    ],
  });
  const results = await sweep(rules, BASE, open);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true]);
  assert.deepEqual(asked, [
    '390', '390 Africa/Cairo 2026-10-14T22:30:00Z', '390 closed', '390 UTC 2026-10-14T22:30:00Z', '390 closed', '390 closed',
    '1440', '1440 Africa/Cairo 2026-10-14T22:30:00Z', '1440 closed', '1440 UTC 2026-10-14T22:30:00Z', '1440 closed', '1440 closed',
  ]);
});

test('a page that navigates away while it is read is not called a bad selector', async () => {
  const gone = async () => ({ goto: async () => {}, evaluate: async () => { throw new Error('Execution context was destroyed\nmore'); } });
  const [r] = await sweep(rulesOf([{ rule: 'a heat', page: 'Counts', selector: '.heat', count: 1 }]), BASE, gone);
  assert.equal(r.ok, false);
  assert.equal(r.line, 'Counts: a heat reads nothing, because the page could not be read (Execution context was destroyed), false at 390, false at 1440');
});

test('what is read, judged: text is words one match holds, a count is exact, an attribute is equal', () => {
  const seen = { count: 2, texts: ['Open 3', 'Late 2'], attr: 'DIALECT_ARITY', style: null };
  assert.deepEqual(judge({ text: 'late' }, seen), { ok: true, said: "'Late 2'" });
  assert.deepEqual(judge({ text: 'Done' }, seen), { ok: false, said: "'Open 3', not 'Done'" });
  assert.deepEqual(judge({ count: 3 }, seen), { ok: false, said: '2 found' });
  assert.deepEqual(judge({ attr: 'data-code', is: 'DIALECT_ARITY' }, seen), { ok: true, said: 'data-code="DIALECT_ARITY"' });
  assert.equal(judge({ count: 2, text: 'Open' }, seen).ok, true, 'each thing a line says must hold');
});

test('expect.json lines that say nothing are refused, and a page is found by its title or its path', () => {
  assert.throws(() => rulesOf({ rules: [] }), /holds no rules/u);
  assert.throws(() => rulesOf([{ rule: 'x', page: 'Values', selector: '.typed' }]), /says nothing to read/u);
  assert.throws(() => rulesOf([{ rule: 'x', page: 'Values', count: 1 }]), /has no selector/u);
  assert.throws(() => rulesOf([{ rule: 'x', page: 'Values', selector: '.cell', attr: 'data-intent' }]), /need `is`/u);
  assert.equal(addressOf({ page: 'Tab 5' }), '/p/tab-5');
  assert.equal(addressOf({ page: 'Values', path: 'p/rule-sheet' }), '/p/rule-sheet');
  assert.equal(addressOf({ page: 'Layout' }, { Layout: '/p/sheet-layout' }), '/p/sheet-layout');
});

test('A PAGE IS FOUND BY THE TITLE A PERSON READS, at the address its declaration claims; a page per row is not guessed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rule-sheet-pack-'));
  try {
    const declarations = [
      { page: 'rule-sheet-blocks', title: 'Blocks', blocks: [] },
      { page: 'rule-sheet-project', title: 'Rule sheet for {{name}}', for: { register: 'projects' }, blocks: [] },
    ];
    writeFileSync(join(dir, 'rule-sheet.pack.json'), JSON.stringify({ pack: 'rule-sheet', declarations }));
    const known = packPages(dir);
    assert.deepEqual(known, { 'rule-sheet-blocks': '/p/rule-sheet-blocks', Blocks: '/p/rule-sheet-blocks' });
    const [rule] = rulesOf([{ rule: 'stat of six', page: 'Blocks', selector: '.cell', count: 6 }], known);
    assert.equal(rule.path, '/p/rule-sheet-blocks');
    assert.deepEqual(packPages(join(dir, 'nowhere')), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no proof record it is a skip and never a pass, and with no expect.json it is red', async () => {
  const quiet = console.log;
  const loud = console.error;
  console.log = console.error = () => {};
  const root = mkdtempSync(join(tmpdir(), 'rule-sheet-'));
  try {
    assert.equal(await ruleSheet(root, {}), 3);
    assert.equal(await ruleSheet(root, { PROOF_RECORD: BASE }), 1);
  } finally {
    console.log = quiet;
    console.error = loud;
    rmSync(root, { recursive: true, force: true });
  }
});

test('the need is declared as a literal the runner reads off the text', () => {
  assert.deepEqual(needs, ['proof']);
  const text = readFileSync(join(import.meta.dirname, '..', 'rule-sheet.mjs'), 'utf8');
  assert.match(text, /^export const needs = \['proof'\];$/mu);
});
