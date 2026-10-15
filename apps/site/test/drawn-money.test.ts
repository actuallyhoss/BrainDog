/**
 * The drawn app says money the way the app does: `$1,312.40 is left`, never `USD 1,312.40`, and never `US$1,312.40`.
 *
 * THE EXAMPLES ARE WRITTEN WITH CODES, as a record stores them, and the renderer's stat drawer already sets a symbol
 * in their place. A note, a progress row, the opening sentence and the line under a chart are printed as written, so
 * `page.ts` hands them to the renderer's `symbolText` first. This holds every one of them to having no code left.
 *
 * ONE SPELLING OF THE DOLLAR (STATUS, batch 98: "the site's home writes "US$" in its drawn app and "$" in its copy").
 * Not told a home currency, the renderer spelled a dollar `US$`, and the copy beside it says `$`. The drawn app is told
 * the plans' currency now (`HOME` in `page.ts`, `optsFor` in `Page.svelte`), and the last test draws every example page
 * as the window does and fails on `US$` anywhere in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AMOUNT_SPACE, parse, toHTML } from 'braindog-render';
import { HOME, inSymbols, leadOf, said } from '../src/lib/app/page.ts';
import { EXAMPLES } from '../src/lib/examples/index.ts';

const CODED = /\b[A-Z]{3} [−-]?\d/u;
const PAGES = EXAMPLES.flatMap((e) => e.pages.map((p) => ({ page: p, at: `${e.id}/${p.id}` })));

test('the Personal Home opens with its money said with a symbol', () => {
  const home = EXAMPLES.find((e) => e.id === 'personal')?.pages[0];
  assert.ok(home, 'the Personal example has no Home');
  assert.equal(leadOf(home.src), 'Rent goes out in 6 days, and $1,312.40 is left to spend until pay day.');
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
  const [block] = parse('~~~progress budget | Budgets\nGroceries | USD 245.10 | USD 300.00 | this month\n~~~', { page: true });
  assert.ok(block?.type === 'block');
  assert.deepEqual(inSymbols(block).rows[0]?.cells, ['Groceries', '$245.10', '$300.00', 'this month']);
});

test('a range keeps its pence on the low and the high alike', () => {
  const [block] = parse('~~~progress range | Budget\nDesign | USD 350.00 | USD 300.00 | USD 600.00\n~~~', { page: true });
  assert.ok(block?.type === 'block');
  assert.deepEqual(inSymbols(block).rows[0]?.cells, ['Design', '$350.00', '$300.00', '$600.00']);
});

test('the home page and /slash draw their demo money with a symbol and the pence, never a code', async () => {
  const { home } = await import('../src/lib/copy/home.ts');
  const { pricing } = await import('../src/lib/copy/pricing.ts');
  const h = home.home;
  assert.equal(pricing.slash.demo, h.slash.demo, '/slash draws a palette of its own, not the home page’s');
  const said = [
    ...h.slash.demo.modes.flatMap((m) => [m.lead, ...m.rows.flat()]),
    ...h.inbox.arrivals.map((a) => a.text),
    ...h.inbox.rows.flat(),
  ];
  assert.deepEqual(said.filter((s) => CODED.test(s)), []);
  assert.ok(said.includes('$910.99, across four bills.') && said.includes('You paid $32.00 to PUREGYM on 3 Oct.'));
});

test('a part of a gigabyte is said in megabytes', async () => {
  const { pricing } = await import('../src/lib/copy/pricing.ts');
  const gb = pricing.pricing.usage.find((u) => u.key === 'gb');
  assert.equal(gb?.amount(0.1), '100 MB a month');
  assert.equal(gb?.amount(5), '5 GB a month');
});

test('the drawn app spells a dollar as its copy does, $ and never US$, and another currency keeps its own mark', () => {
  assert.equal(HOME, 'USD', 'the drawn app is told a home that is not the plans\' currency');
  const wrong: string[] = [];
  for (const { page, at } of PAGES) {
    const segments = parse(page.src, { page: true });
    /* AS THE WINDOW DRAWS IT: each block through `inSymbols`, with the options `optsFor` gives, and the words around it. */
    const drawn = [
      toHTML(segments.map((s) => (s.type === 'block' ? inSymbols(s) : s)), { home: HOME }),
      leadOf(page.src),
      ...Object.values(page.reads ?? {}).map(said),
    ].join('\n');
    for (const m of drawn.matchAll(/.{0,24}US\$.{0,12}/gu)) wrong.push(`${at}: "${m[0]}"`);
  }
  assert.deepEqual(wrong, []);
  /* THE PLANTED FAULT: the same page drawn with no home told is the old spelling, so the check above can fail. */
  const home = EXAMPLES.find((e) => e.id === 'personal')?.pages[0];
  assert.ok(home);
  assert.match(toHTML(parse(home.src, { page: true })), /US\$/u, 'with no home told the renderer no longer writes US$, so this test proves nothing');
  /* A pound in an example stays a pound, with its code after, as on a record whose home is dollars. */
  assert.equal(said('Rent of GBP 1,200.00 is due.'), `Rent of £1,200${AMOUNT_SPACE}GBP is due.`);
});
