/**
 * The drawn app says money the way the app does: `£1,312.40 is left`, never `GBP 1,312.40`.
 *
 * THE EXAMPLES ARE WRITTEN WITH CODES, as a record stores them, and the renderer's stat drawer already sets a symbol
 * in their place. A note, a progress row, the opening sentence and the line under a chart are printed as written, so
 * `page.ts` hands them to the renderer's `symbolText` first. This holds every one of them to having no code left.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from 'braindog-render';
import { inSymbols, leadOf, said } from '../src/lib/app/page.ts';
import { EXAMPLES } from '../src/lib/examples/index.ts';

const CODED = /\b[A-Z]{3} [−-]?\d/u;
const PAGES = EXAMPLES.flatMap((e) => e.pages.map((p) => ({ page: p, at: `${e.id}/${p.id}` })));

test('the Personal Home opens with its money said with a symbol', () => {
  const home = EXAMPLES.find((e) => e.id === 'personal')?.pages[0];
  assert.ok(home, 'the Personal example has no Home');
  assert.equal(leadOf(home.src), 'Rent goes out in 6 days, and £1,312.40 is left to spend until pay day.');
});

test('no opening sentence, note, progress row or reading line says a currency code', () => {
  const wrong: string[] = [];
  for (const { page, at } of PAGES) {
    if (CODED.test(leadOf(page.src))) wrong.push(`${at}: the opening sentence`);
    for (const [i, line] of Object.entries(page.reads ?? {})) if (CODED.test(said(line))) wrong.push(`${at}: reading ${i}`);
    for (const s of parse(page.src, { page: true })) {
      if (s.type !== 'block' || (s.kind !== 'note' && s.kind !== 'progress')) continue;
      for (const r of inSymbols(s).rows) for (const c of r.cells) if (CODED.test(c)) wrong.push(`${at}: ${s.kind} "${c}"`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('a progress row keeps its pence, so what is left is said exactly', () => {
  const [block] = parse('~~~progress budget | Budgets\nGroceries | GBP 245.10 | GBP 300.00 | this month\n~~~', { page: true });
  assert.ok(block?.type === 'block');
  assert.deepEqual(inSymbols(block).rows[0]?.cells, ['Groceries', '£245.10', '£300.00', 'this month']);
});

test('a range keeps its pence on the low and the high alike', () => {
  const [block] = parse('~~~progress range | Budget\nDesign | GBP 350.00 | GBP 300.00 | GBP 600.00\n~~~', { page: true });
  assert.ok(block?.type === 'block');
  assert.deepEqual(inSymbols(block).rows[0]?.cells, ['Design', '£350.00', '£300.00', '£600.00']);
});
