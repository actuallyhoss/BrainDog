/**
 * The `drawn` kind: a small component written as code on the page, which the record never runs and a host draws in a
 * sandboxed frame. The record holds its code to the rules at install and hands it only the fields its columns name.
 *
 * THE KIND IS REGISTERED BEFORE THE KERNEL LOADS, where the registry does not hold it already, for the reason
 * `kind-lanes.test.ts` gives. EACH TEST DRIVES A REAL RECORD over `node:sqlite`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '../src/index.ts';
import type { BlockResult, PageBlock } from '../src/pages.ts';
import { BLOCK_KIND_MODULES } from '../src/kinds/index.ts';
import { DRAWN_CODE_MOST, DRAWN_ROWS_MOST, drawn, drawnCodeFault } from '../src/kinds/drawn.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

BLOCK_KIND_MODULES.drawn ??= drawn;

const { openRecord } = await import('../src/index.ts');

const NOW = Date.UTC(2026, 9, 22, 12);
const OWNER = { actor: 'p_1' };

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.bills'], blocks } as never,
});

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BILLS])).ok);
  for (const [what, due, note] of [
    ['Rent', '2026-10-25', 'kept from the component'],
    ['Power', '2026-10-28', 'kept too'],
  ] as const)
    assert.ok(k.create('bills', { what, due, note }, OWNER).ok, `${what} was not written`);
  return { k, sql };
}

const refusalOf = (out: { ok: boolean }) => (!out.ok && 'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string } }).refusal : null);
const block = (b: Record<string, unknown>): PageBlock => b as unknown as PageBlock;

const CODE = '<div id="strip"></div><script>braindog.on(function (d) { document.getElementById("strip").textContent = d.rows.length; });</script>';
const DRAWN = { kind: 'drawn', heading: 'Bills as a strip', source: 'register.bills', columns: [{ field: 'what' }, { field: 'due' }], code: CODE };

test('a drawn block installs, and is handed only the fields its columns name', async () => {
  const { k, sql } = await record();
  assert.equal(refusalOf(await k.install([pageOf(DRAWN)])), null, 'a drawn block over a list was refused at install');
  const read: BlockResult = k.block(block(DRAWN));
  assert.deepEqual(read.refusals, []);
  assert.equal(read.code, CODE, 'the code did not ride on the answer to the host');
  assert.equal(read.rows.length, 2);
  for (const row of read.rows) assert.deepEqual(Object.keys(row.fields).sort(), ['due', 'what'], 'a field the columns do not name was handed in');
  sql.close();
});

test('a drawn block with no list is a picture of its own, and a bare one installs and is refused when read', async () => {
  const { k, sql } = await record();
  assert.equal(refusalOf(await k.install([pageOf({ kind: 'drawn', code: '<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>' })])), null);
  assert.equal(refusalOf(await k.install([pageOf({ kind: 'drawn' })])), null, 'a bare drawn block was refused at install');
  const bare = k.block(block({ kind: 'drawn' }));
  assert.equal(bare.refusals[0]?.at, 'code');
  sql.close();
});

test('code that reaches off the page is refused at install, in words that never repeat it', async () => {
  const { k, sql } = await record();
  for (const code of ['<img src="https://example.com/x.png">', '<script>fetch("/api/boot")</script>', '<script>localStorage.x = 1</script>', '<link rel="stylesheet" href="x.css">']) {
    const refused = refusalOf(await k.install([pageOf({ ...DRAWN, code })]));
    assert.equal(refused?.code, 'DECLARATION_INVALID', code);
    assert.match(refused?.at ?? '', /code$/u);
    assert.ok(!refused?.fix.includes(code), 'the refusal repeated the code');
  }
  sql.close();
});

test('code past the cap, a height out of range and too many fields are each refused', async () => {
  const { k, sql } = await record();
  assert.match(refusalOf(await k.install([pageOf({ ...DRAWN, code: 'a'.repeat(DRAWN_CODE_MOST + 1) })]))?.fix ?? '', /64 KB/u);
  assert.equal(refusalOf(await k.install([pageOf({ ...DRAWN, height: 4000 })]))?.code, 'OUT_OF_BOUNDS');
  assert.equal(refusalOf(await k.install([pageOf({ ...DRAWN, limit: DRAWN_ROWS_MOST + 1 })]))?.code, 'OUT_OF_BOUNDS');
  const thirteen = Array.from({ length: 13 }, () => ({ field: 'what' }));
  assert.equal(refusalOf(await k.install([pageOf({ ...DRAWN, columns: thirteen })]))?.at?.endsWith('columns'), true);
  assert.equal(refusalOf(await k.install([pageOf({ ...DRAWN, authored: [{ cells: ['a'] }] })]))?.at?.endsWith('authored'), true);
  sql.close();
});

test('code and height are refused on any other kind', async () => {
  const { k, sql } = await record();
  assert.equal(refusalOf(await k.install([pageOf({ kind: 'table', source: 'register.bills', columns: [{ field: 'what' }], code: CODE })]))?.code, 'DECLARATION_INVALID');
  sql.close();
});

test('the rules are the renderer\'s: an SVG namespace and inline pictures pass, a protocol-relative address does not', () => {
  assert.equal(drawnCodeFault('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AA"/></svg>'), null);
  assert.ok(drawnCodeFault('<img src="//example.com/x.png">'));
  assert.ok(drawnCodeFault('<!doctype html><p>x</p>'));
});

test('A SHADOW ROOT WRITTEN IN A COMPONENT IS REFUSED AT INSTALL, where the frame watch cannot see into it', () => {
  assert.match(drawnCodeFault('<div><template shadowrootmode="closed"><script>void 0</script></template></div>') ?? '', /shadow root/u);
  assert.equal(drawnCodeFault('<div class="shadow">root</div>'), null);
});
