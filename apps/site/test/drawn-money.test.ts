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

import { parse, toHTML } from 'braindog-render';
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

/* THE DEMO RECORD (batch 103). The desk, the cards and Slash draw every figure from `src/lib/demo/maya.ts`, which keeps
   money as integer cents and says it through `usd()`. So the helper is held to the prototype's three spellings, every
   figure it holds to one shape, and every string in the file to a `$` and never a code. */
const DOLLARS = /^-?\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/;
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

test('the demo record says its money with a $ and the pence where it has them, never a code', async () => {
  const maya = await import('../src/lib/demo/maya.ts');
  assert.equal(maya.usd(842_000), '$8,420');
  assert.equal(maya.usd(6_420), '$64.20');
  assert.equal(maya.usd(320_000, { pence: true }), '$3,200.00');
  assert.throws(() => maya.usd(64.2), /whole cents/, 'usd() takes a fraction of a cent, so a figure could be typed in dollars');

  for (const [name, cents] of Object.entries(maya.CENTS)) {
    assert.ok(Number.isInteger(cents), `CENTS.${name} is ${cents}, not whole cents`);
    assert.match(maya.usd(cents), DOLLARS, `CENTS.${name} is said as ${maya.usd(cents)}`);
    assert.match(maya.usd(cents, { pence: true }), DOLLARS);
  }

  const said = strings(Object.values(maya));
  assert.ok(said.length > 20, `src/lib/demo/maya.ts holds only ${said.length} strings, so this would read almost nothing`);
  const coded = said.filter((s) => CODED.test(s) || /\d\s?(?:USD|EUR|GBP)\b|US\$/u.test(s));
  assert.deepEqual(coded, [], 'the demo record says money with a currency code');
  /* A figure with pence is money here, and money is said with its mark in front. */
  const bare = said.filter((s) => /(?<![$\d,.])\d{1,3}(?:,\d{3})*\.\d{2}\b(?!\s?%)/u.test(s));
  assert.deepEqual(bare, [], 'the demo record says an amount with no $ in front of it');
  assert.ok(said.some((s) => s.includes(maya.usd(maya.CENTS.northboundInvoice))), 'no string of the demo record says its first figure, so this read the wrong file');
});

test('a part of a gigabyte is said in megabytes', async () => {
  /* The pricing table's cell for data fetched (batch 103 moved it from `usage` to `holds.rows`). */
  const { pricing } = await import('../src/lib/copy/pricing.ts');
  const bytes = pricing.pricing.holds.rows.find((r) => r.key === 'bytes');
  assert.ok(bytes, 'the pricing table has no row for data fetched');
  const of = (n: number) => ({ agents: 1, credits: 1, people: 1, teams: false, allowance: { runs: 0, requests: 0, bytes: n, ms: 0 } });
  assert.equal(bytes.cell(of(100_000_000)), '100 MB');
  assert.equal(bytes.cell(of(5_000_000_000)), '5 GB');
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
  /* THE PLANTED FAULT: no path writes `US$` since AM15 (audit 31 Oct m), told the home or not, so the matcher above is
     held to find one where it is written, and the page drawn with no home told says the dollar by its own sign too. */
  assert.equal([...'Paid US$40 on the 3rd'.matchAll(/.{0,24}US\$.{0,12}/gu)].length, 1, 'the matcher finds the old spelling');
  const home = EXAMPLES.find((e) => e.id === 'personal')?.pages[0];
  assert.ok(home);
  assert.doesNotMatch(toHTML(parse(home.src, { page: true })), /US\$/u, 'with no home told the renderer still says the dollar by its own sign');
  /* A pound in an example stays a pound, by its own sign, as on a record whose home is dollars. */
  assert.equal(said('Rent of GBP 1,200.00 is due.'), 'Rent of £1,200 is due.');
});
