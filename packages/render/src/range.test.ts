/**
 * The figures a `progress range` draws that it computed itself: the total line, and the one scale every row sits on
 * (`loop/research-audit-2026-09-25-layouts.md` findings 4 and 10).
 *
 * WHAT WAS MEASURED BEFORE ANY OF THIS WAS WRITTEN. The total took the first cell of each column as its template and
 * rounded the sum to that cell's decimals, so rows of 100, 0.4 and 0.4 drew a total of 101, and the launch desk's
 * Numbers page drew `Total 181 spent 251 to 421` where its lines add to 181.499, 250.989 and 421.499. And a range
 * whose spend was money and whose low and high were plain numbers (pence written as ints) was drawn on one scale:
 * `£120.50` read as 120.5 against a high of 30,000, so every spent mark sat at `0.00` and the drawing said nothing had
 * been spent, with no word anywhere that the columns were not one unit.
 *
 * The Svelte drawer is compiled and rendered on the server as `dynamic-forms.test.ts` does, because a refusal the
 * mirror says and the app draws past is not a refusal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block } from './parse.ts';
import { toHTML } from './html.ts';
import { MISSING } from './format.ts';
import * as progress from './progress.ts';

/* A NAMESPACE AND NOT NAMED IMPORTS, so a tree without the refusal fails test by test rather than failing to load. */
const { rangePlan } = progress;
const RANGE_MIXED: string = (progress as { RANGE_MIXED?: string }).RANGE_MIXED ?? 'a refusal this build does not have';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { default: BlockView } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as { default: Component<{ block: Block }> };

const drawn = (src: string): Block => {
  const segs = parse(src, { page: true });
  assert.equal(segs.length, 1);
  assert.equal(segs[0]!.type, 'block', JSON.stringify(segs[0]));
  return segs[0] as Block;
};
const words = (html: string): string => html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const row = (spent: string, low: string, high: string) => ({ spent, low, high });

/* ── the total ────────────────────────────────────────────────────────────── */

test('THE TOTAL IS DRAWN TO THE PLACE OF ITS FINEST FIGURE, not rounded to whichever row came first', () => {
  /* The audit's case C: a whole first row and two lines of 0.4. It drew 101, 101 and 201. */
  assert.deepEqual(rangePlan([row('100', '100', '200'), row('0.4', '0.4', '0.4'), row('0.4', '0.4', '0.4')]).total, { spent: '100.8', low: '100.8', high: '200.8' });

  /* THE LAUNCH DESK'S OWN LINES, as its Numbers page wrote them. It drew `181 spent 251 to 421`. */
  const desk = rangePlan([row('180', '150', '300'), row('0.5', '99.99', '120.5'), row('0.333', '0.333', '0.333'), row('0.333', '0.333', '0.333'), row('0.333', '0.333', '0.333')]);
  assert.deepEqual(desk.total, { spent: '181.499', low: '250.989', high: '421.499' });
});

test('THE TOTAL KEEPS ITS SIGN, ITS GROUPING AND ITS EMPTY ROWS under the new arithmetic', () => {
  /* THESE PASSED BEFORE THE REPAIR, and are kept because the repair rewrote the sum under them: it now adds whole units
     of the finest place rather than floats. A thousand lines of 0.001 added as floats is 1.0000000000000007, which the
     old rounding hid; as thousandths it is one exactly. */
  const tiny = rangePlan(Array.from({ length: 1000 }, () => row('0.001', '0.001', '0.001'))).total;
  assert.deepEqual(tiny, { spent: '1.000', low: '1.000', high: '1.000' });
  assert.deepEqual(rangePlan([row('£1,000,000.10', '£0.10', '£0.20'), row('£0.20', '£0.20', '£0.10')]).total, { spent: '£1,000,000.30', low: '£0.30', high: '£0.30' });
  /* A REFUND IS A NEGATIVE SPEND and takes its sign into the sum, in money's own place for the minus. */
  assert.deepEqual(rangePlan([row('−£20.00', '£10.00', '£30.00'), row('£5.50', '£10.00', '£30.00')]).total, { spent: '−£14.50', low: '£20.00', high: '£60.00' });
  /* Nothing spent adds nothing, as before. */
  assert.equal(rangePlan([row('', '1', '2'), row('0.25', '1', '2')]).total.spent, '0.25');
});

/* ── one scale, one unit ──────────────────────────────────────────────────── */

test('MONEY BESIDE PLAIN NUMBERS IS REFUSED WITH A SENTENCE, never drawn on one scale', () => {
  /* The audit's case A: money spent, and the low and the high written as pence in int fields. */
  const mixed = rangePlan([row('£120.50 GBP', '10,000', '30,000'), row('£50.00 GBP', '4,000', '8,000')]);
  assert.equal((mixed as { refused?: string | null }).refused, RANGE_MIXED);
  assert.deepEqual(
    mixed.bars.map((b) => [b.drawable, b.at]),
    [
      [false, null],
      [false, null],
    ],
    'no row is drawn on a scale that mixes two units',
  );
  /* Each figure is still said as the record wrote it: a cell is right on its own, only the arithmetic across is not. */
  assert.deepEqual(mixed.bars.map((b) => [b.spent, b.range]), [
    ['£120.50 GBP spent', '10,000 to 30,000'],
    ['£50.00 GBP spent', '4,000 to 8,000'],
  ]);
  assert.deepEqual(mixed.total, { spent: MISSING, low: MISSING, high: MISSING });
  /* NOR IS A ROW CALLED OVER BY COMPARING THE TWO UNITS. Checked by the checker after the repair: `£120.50` beside a high
     of 100 still came back `bad`, 120.5 read against 100 plain, while 10,000 pence would have been under. A tone the host
     wrote still wins. */
  const across = rangePlan([row('£120.50', '50', '100'), { ...row('£1.00', '50', '100'), tone: 'warn' }]);
  assert.deepEqual(across.bars.map((b) => b.intent), [undefined, 'warn']);
});

test('TWO CURRENCIES ARE REFUSED THE SAME WAY, and a cell that is not a figure is not a third unit', () => {
  const two = rangePlan([row('£1.00', '£1.00', '£2.00'), row('USD 1.00', 'USD 1.00', 'USD 2.00')]);
  assert.equal((two as { refused?: string | null }).refused, RANGE_MIXED);
  assert.equal(two.bars.some((b) => b.drawable), false);
  /* A HIGH NOBODY WROTE, drawn as the dash, is a row that cannot be drawn, not a unit of its own that refuses the block. */
  const gap = rangePlan([row('£1.00', '£1.00', '£2.00'), row('', '£1.00', MISSING)]);
  assert.equal((gap as { refused?: string | null }).refused, null);
  assert.deepEqual(gap.bars.map((b) => b.drawable), [true, false]);
  assert.equal((rangePlan([row('£1.00', '£1.00', '£2.00')]) as { refused?: string | null }).refused, null);
});

test('BOTH DRAWERS SAY THE SENTENCE IN PLACE OF THE TOTAL, draw no track, and draw one tree', () => {
  const block = drawn('```progress range | Budget\nWax | £120.50 | 10,000 | 30,000\nBox | £50.00 | 4,000 | 8,000\n```');
  const mirror = toHTML([block]);
  const app = render(BlockView, { props: { block } }).body;
  for (const [name, html] of [['html.ts', mirror], ['Progress.svelte', app]] as const) {
    assert.doesNotMatch(html, /progress-track/u, `${name} drew a track on a scale of two units`);
    assert.doesNotMatch(html, /data-total/u, `${name} drew a total of two units`);
    assert.match(words(html), new RegExp(RANGE_MIXED.replace(/[.,]/gu, '.'), 'u'), `${name} did not say why`);
    assert.match(words(html), /Wax £120\.50 spent 10,000 to 30,000/u, `${name} dropped the row's own words`);
  }
  const bare = (html: string): string => html.replace(/<!--[\s\S]*?-->/gu, '').replace(/\s+/gu, ' ').replace(/> </gu, '><').trim();
  assert.equal(bare(app), bare(mirror));
});
