/**
 * `ring`: what the plan decides, what `toHTML` draws from it, and the Svelte drawer held to the same tree.
 *
 * The parity half is here rather than in `parity.test.ts`'s `SHAPES`, as `roadmap-parity.test.ts` is, so the kind
 * carries its own proof that the app and the mirror draw one ring: a drawer that is missing on either side fails
 * the shapes below rather than drawing the proportional primitive's generic bars.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { RING_MOST, ringPlan } from './ring.ts';
import { KINDS } from './kinds.ts';
import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';

/* ── the plan ─────────────────────────────────────────────────────────────── */

test('one row is progress: the arc is the share of the target, the share is the centre, and reached is good', () => {
  const half = ringPlan([{ label: 'Holiday', value: '£1,200.00', third: '£3,000.00' }]);
  assert.equal(half.form, 'progress');
  assert.equal(half.ring, true);
  assert.deepEqual(half.arcs, [{ row: 0, dash: '40 100', offset: '0', step: 0 }]);
  assert.equal(half.centre, '40%');
  assert.equal(half.left, '£1,800.00 to go');
  assert.equal(half.intent, undefined, 'a goal on its way is not coloured');
  assert.equal(half.name, 'Holiday: £1,200.00 of £3,000.00, 40%');

  const done = ringPlan([{ label: 'Bike', value: '7', third: '7' }]);
  assert.deepEqual([done.arcs[0]?.dash, done.centre, done.intent, done.left], ['100 100', '100%', 'good', 'Reached']);
  assert.equal(ringPlan([{ label: 'Bike', value: '7', third: '7', tone: 'info' }]).intent, 'info', 'a tone the author wrote wins');

  /* A proportion needs no target: `3/5` and `60%` say their own share, as a card's ring reads them. */
  const said = ringPlan([{ label: 'Steps', value: '3/5', third: '' }]);
  assert.deepEqual([said.ring, said.arcs[0]?.dash, said.centre, said.name], [true, '60 100', '60%', 'Steps: 3/5, 60%']);
});

test('NO VALUE IS WORDS ONLY, never an empty ring that claims the value is nothing', () => {
  for (const value of ['', 'soon', '—']) {
    const p = ringPlan([{ label: 'Holiday', value, third: '£3,000.00' }]);
    assert.equal(p.ring, false, `"${value}" drew a ring`);
    assert.deepEqual(p.arcs, []);
    assert.equal(p.centre, '');
  }
  /* A value of nothing so far IS a value, and draws the track with no arc on it. */
  const zero = ringPlan([{ label: 'Holiday', value: '0', third: '3000' }]);
  assert.deepEqual([zero.ring, zero.arcs[0]?.dash, zero.centre], [true, '0 100', '0%']);
  /* And a target that is not a number, with a value that is not a proportion, has nothing to measure. */
  assert.equal(ringPlan([{ label: 'Holiday', value: '1200', third: 'lots' }]).ring, false);
});

test('two to five rows are parts: arcs laid end to end in the neutral steps, the whole in the centre', () => {
  const p = ringPlan([
    { label: 'Rent', value: 'EGP 6,000.00', third: '' },
    { label: 'Food', value: 'EGP 3,000.00', third: 'this month' },
    { label: 'Other', value: 'EGP 1,000.00', third: '', tone: 'warn' },
  ]);
  assert.equal(p.form, 'parts');
  assert.deepEqual(
    p.arcs.map((a) => [a.row, a.dash, a.offset, a.step, a.tone]),
    [
      [0, '60 100', '0', 0, undefined],
      [1, '30 100', '-60', 1, undefined],
      [2, '10 100', '-90', 2, 'warn'],
    ],
  );
  assert.deepEqual(p.shares, ['60%', '30%', '10%']);
  assert.equal(p.centre, 'EGP 10,000.00');
  assert.equal(p.name, 'Rent 60%, Food 30%, Other 10%');
});

test('A WHOLE IS NEVER TWO CURRENCIES ADDED: parts in different units draw their arcs and leave the centre empty', () => {
  const p = ringPlan([
    { label: 'Cairo', value: 'EGP 6,000.00', third: '' },
    { label: 'London', value: '£300.00', third: '' },
  ]);
  assert.equal(p.ring, true, 'the shares are still each part of what was written');
  assert.equal(p.centre, '');
});

test('a part with no number keeps its words and draws no arc, and all of them without one draw no ring', () => {
  const p = ringPlan([
    { label: 'A', value: '2', third: '' },
    { label: 'B', value: 'unknown', third: '' },
    { label: 'C', value: '2', third: '' },
  ]);
  assert.deepEqual(p.shares, ['50%', null, '50%']);
  assert.deepEqual(p.arcs.map((a) => a.row), [0, 2]);
  const none = ringPlan([
    { label: 'A', value: '', third: '' },
    { label: 'B', value: '0', third: '' },
  ]);
  assert.deepEqual([none.ring, none.centre], [false, '']);
  assert.equal(ringPlan([]).empty, true);
});

/* ── the fence ────────────────────────────────────────────────────────────── */

test('the fence takes one to five rows, and a sixth degrades as an arity rather than drawing a sixth part', () => {
  assert.equal(RING_MOST, 5);
  assert.equal(KINDS.ring.rows, RING_MOST);
  const five = parse('```ring | Time\nA | 1\nB | 2\nC | 3\nD | 4\nE | 5\n```');
  assert.equal(five[0]?.type, 'block');
  const six = parse('```ring | Time\nA | 1\nB | 2\nC | 3\nD | 4\nE | 5\nF | 6\n```');
  assert.equal(six[0]?.type === 'degraded' && six[0].code, 'DIALECT_ARITY');
});

test('toHTML draws a named dial with the figure in its centre, and the rows as words beside it', () => {
  const html = toHTML(parse('```ring | Saved\nHoliday | £1,200.00 | £3,000.00\n```'));
  assert.match(html, /<figure class="block block-proportional" data-kind="ring"/u);
  assert.match(html, /<div class="prop ring" data-form="progress">/u);
  assert.match(html, /<svg class="ring-mark" viewBox="0 0 36 36" role="img" aria-label="Holiday: £1,200\.00 of £3,000\.00, 40%">/u);
  assert.match(html, /<circle class="ring-arc" data-step="0"[^>]* stroke-dasharray="40 100" stroke-dashoffset="0"/u);
  assert.match(html, /<span class="ring-figure num" aria-hidden="true">40%<\/span>/u);
  assert.match(html, /<span class="ring-left num">£1,800\.00 to go<\/span>/u);
  /* Painted by presentation attributes, so a host with no `ring-` rule draws an outline and not a black disc. */
  assert.match(html, /<circle class="ring-track"[^>]* fill="none"/u);

  const words = toHTML(parse('```ring | Saved\nHoliday |  | £3,000.00\n```'));
  assert.doesNotMatch(words, /<svg/u, 'no value drew a ring');
  assert.match(words, /<span class="ring-label">Holiday<\/span>/u);

  const parts = toHTML(parse('```ring | Week\nDeep work | 12 | mornings\nMeetings | 6\nAdmin | 2 | | warn\n```'));
  assert.match(parts, /data-form="parts"/u);
  assert.match(parts, /aria-label="Deep work 60%, Meetings 30%, Admin 10%"/u);
  assert.match(parts, /<li class="ring-item" data-intent="warn"><span class="ring-dot" data-step="2" aria-hidden="true"><\/span>/u);
  assert.match(parts, /<span class="ring-note">mornings<\/span>/u);
  assert.match(parts, /<span class="ring-figure num" aria-hidden="true">20<\/span>/u);
});

/* ── the Svelte drawer, compared as a tree ────────────────────────────────── */

/* The same hooks `parity.test.ts` registers: each test file is its own process under `node --test`. */
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

const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts: Record<string, unknown> }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** `parity.test.ts`'s `tree`: no comments, no whitespace between tags, attributes in one order, entities read. */
function tree(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)]
        .map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!))
        .sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

const SHAPES: Record<string, string> = {
  'progress toward a target, with a link in the label': '```ring | Saved\n[Holiday](/r/goals/1) | £1,200.00 | £3,000.00\n```',
  'progress reached, and a tone the author wrote': '```ring\nBike | 7 | 7 | info\n```',
  'a proportion with no target': '```ring\nSteps | 3/5\n```',
  'no value, so words only': '```ring | Saved\nHoliday |  | £3,000.00\n```',
  'parts, one with a note, one with a tone, one with no number':
    '```ring | Week\nDeep work | 12 | mornings\nMeetings | 6\nAdmin | 2 | | warn\nTravel | soon\n```',
  'parts in two currencies': '```ring\nCairo | EGP 6,000.00\nLondon | £300.00\n```',
};

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one ring: ${name}`, () => {
    const [seg] = parse(src);
    assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
    const block = seg as BlockSegment;
    const svelte = tree(render(Block, { props: { block, opts: {} } }).body);
    const html = tree(toHTML([block]));
    assert.equal(svelte, html);
  });
}

test('and the comparison is not vacuous: the dial is on the Svelte side too', () => {
  const [seg] = parse(SHAPES['parts, one with a note, one with a tone, one with no number']!);
  const svelte = tree(render(Block, { props: { block: seg as BlockSegment, opts: {} } }).body);
  assert.match(svelte, /<svg [^>]*class="ring-mark"/u);
  assert.match(svelte, /class="ring-legend"/u);
});
