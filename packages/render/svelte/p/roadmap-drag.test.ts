/**
 * A roadmap's bars dragged with a pointer: the drawer's half, which is where the pointer is and what it means.
 *
 * THE ARITHMETIC CAME BEFORE THE GESTURE. `dragPatch` in `src/roadmap.ts` turns a drop into the two fields a
 * task keeps, and at HEAD nothing called it but its own test: `git grep -l dragPatch -- apps packages/render/svelte`
 * found nothing, and this drawer's header said the drag was still to come. So a roadmap drew every bar and none of
 * them moved.
 *
 * WHAT IS PROVED HERE, AND WHAT IS NOT. A server render has no pointer, so the markup is proved two ways: with no
 * callback it is the chart it was, which is what keeps `roadmap-parity.test.ts` meaning something, and with one every
 * bar and every date is a grip. The pointer's arithmetic is proved as functions, and the one property that matters
 * most is proved over every shape: the bar drawn under the pointer is the bar the record will draw after the write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block, type Row } from '../../src/parse.ts';
import { DAY_SECONDS, dragPatch, roadmapPlan, roadmapRow, type DragMode } from '../../src/roadmap.ts';
import { addDays } from '../../src/forecast.ts';

/* The hook `roadmap-parity.test.ts` registers, so the drawer is the file the app ships, compiled for the server. */
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('.svelte')) return next(url, context);
    const filename = fileURLToPath(url);
    const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
    return { format: 'module', source: js.code, shortCircuit: true };
  },
});

type Props = { block: Block; opts: { now: number }; onreschedule?: (row: Row, drop: unknown) => void };
const Roadmap = async (): Promise<Component<Props>> =>
  ((await import(new URL('./Roadmap.svelte', import.meta.url).href)) as { default: Component<Props> }).default;

/** The pointer's half, loaded per test so a missing module fails each test on its own line rather than the file. */
const drag = async () => import('./roadmap-drag.ts');

const NOW = Date.UTC(2026, 8, 22, 12);
const FENCE = '```roadmap | Autumn\nBuild the kiln page | 2026-09-10 | 10\nRegate window | 2026-10-05 | 3 | warn\nLaunch | 2026-09-30\n```';
const block = (): Block => parse(FENCE)[0] as Block;

test('with no callback the chart is the picture it was: no grip, no cursor, nothing a pointer can take', async () => {
  const html = render(await Roadmap(), { props: { block: block(), opts: { now: NOW } } }).body;
  assert.match(html, /class="roadmap-bar"/u);
  assert.doesNotMatch(html, /data-grip|cursor=|touch-action/u);
});

test('with a callback every window and every date is a grip, and a date is taken whole because it has no edges', async () => {
  const html = render(await Roadmap(), { props: { block: block(), opts: { now: NOW }, onreschedule: () => {} } }).body;
  const bars = html.match(/<rect[^>]*class="roadmap-bar"[^>]*>/gu) ?? [];
  assert.equal(bars.length, 2);
  for (const bar of bars) {
    assert.match(bar, /data-grip=""/u);
    assert.match(bar, /cursor="grab"/u);
    /* A PHONE SCROLLS UP AND DOWN THROUGH A ROADMAP and drags across it, so only the horizontal is taken. */
    assert.match(bar, /touch-action: ?pan-y/u);
  }
  /* A stem is a hairline, which no finger lands on, so it is taken by a wider stroke nobody sees, over the same line. */
  const grips = html.match(/<path[^>]*class="roadmap-grip"[^>]*>/gu) ?? [];
  assert.equal(grips.length, 1);
  assert.match(grips[0]!, /stroke="transparent"/u);
});

test('the edge a pointer lands on picks the mode, and a bar too narrow for three parts is mostly its middle', async () => {
  const { dragModeAt, DRAG_EDGE } = await drag();
  assert.equal(dragModeAt(0, 200), 'start');
  assert.equal(dragModeAt(DRAG_EDGE, 200), 'start');
  assert.equal(dragModeAt(100, 200), 'move');
  assert.equal(dragModeAt(200 - DRAG_EDGE, 200), 'end');
  assert.equal(dragModeAt(200, 200), 'end');
  /* TWELVE PIXELS WIDE, A DAY ON A WIDE SPAN: with eight-pixel edges the two would overlap and the bar could not be
     moved at all. A quarter each leaves the middle half to move it by. */
  assert.equal(dragModeAt(6, 12), 'move');
  assert.equal(dragModeAt(2, 12), 'start');
  assert.equal(dragModeAt(11, 12), 'end');
});

test('the pointer moves in whole days of the span, rounded, and a box with no width moves nothing', async () => {
  const { dragDays } = await drag();
  const plan = { from: '2026-09-01', to: '2026-11-01' }; // 61 days across the box
  assert.equal(dragDays(0, 610, plan), 0);
  assert.equal(dragDays(10, 610, plan), 1);
  assert.equal(dragDays(4, 610, plan), 0);
  assert.equal(dragDays(-26, 610, plan), -3);
  assert.equal(dragDays(610, 610, plan), 61);
  assert.equal(dragDays(50, 0, plan), 0);
  assert.equal(dragDays(Number.NaN, 610, plan), 0);
  /* NEGATIVE ZERO IS NOT A SHIFT. `Math.round(-0.2)` is `-0`, which a strict equality with 0 lets through here but a
     `Object.is` in a caller would not. */
  assert.ok(Object.is(dragDays(-2, 610, plan), 0));
});

test('the drop hands the host the gesture with `dragPatch` bound to it, so the only arithmetic from drop to fields is that one', async () => {
  const { dropOf } = await drag();
  const drop = dropOf('end', 2);
  assert.equal(drop.mode, 'end');
  assert.equal(drop.days, 2);
  const row = { by: '2026-09-10', effort: 1.5 * DAY_SECONDS };
  assert.deepEqual(drop.patch(row), dragPatch(row, 'end', 2));
  assert.equal(dropOf('start', 1).patch({ by: '2026-09-10' }), null, 'a date has no edge to pull');
});

test('WHAT IS DRAWN UNDER THE POINTER IS WHAT THE RECORD DRAWS AFTER THE WRITE, for every mode, effort and shift', async () => {
  /* Not the arithmetic restated. The bar under the pointer is `dragWindow` over the bar as drawn; the bar after the
     write is `dragPatch` over the stored fields, read back through `roadmapRow` as the drawer reads the record. If the
     two ever differ, a bar would jump when the pointer lets go. */
  const { dragWindow } = await drag();
  const efforts = [0.2, 0.5, 1, 1.5, 2, 3, 10];
  const modes: DragMode[] = ['move', 'start', 'end'];
  let checked = 0;
  for (const days of efforts)
    for (const mode of modes)
      for (let shift = -14; shift <= 14; shift++) {
        const stored = { by: '2026-09-15', effort: Math.round(days * DAY_SECONDS) };
        const before = roadmapRow('t', stored.by, String(days));
        const patch = dragPatch(stored, mode, shift);
        const next = { ...stored, ...(patch ?? {}) };
        const after = roadmapRow('t', next.by, String(next.effort / DAY_SECONDS));
        assert.deepEqual(dragWindow(before, mode, shift), { start: after.start, end: after.end }, `${days} d ${mode} ${shift}`);
        checked++;
      }
  assert.equal(checked, efforts.length * modes.length * 29);
});

test('a date moves whole, and its stem is drawn at the middle of the day it will be written on', async () => {
  const { dragDrawn, dragWindow } = await drag();
  const plan = roadmapPlan([roadmapRow('Launch', '2026-09-30', '')], '2026-09-22');
  const stem = plan.stems[0]!;
  assert.deepEqual(dragWindow({ start: '', end: stem.day }, 'move', -3), { start: '', end: addDays(stem.day, -3) });
  /* Thirty days in September: the 27th's middle is 26.5 days in, 883.33 of the thousand. */
  assert.deepEqual(dragDrawn({ start: '', end: stem.day }, 'move', -3, plan), { x: '883.33', width: '0' });
});

test('a bar under the pointer is drawn where the plan would put that window, in the same units', async () => {
  const { dragDrawn } = await drag();
  const rows = [roadmapRow('Build', '2026-09-10', '10'), roadmapRow('Regate', '2026-10-05', '3')];
  const plan = roadmapPlan(rows, '2026-09-22');
  const bar = plan.bars.find((b) => b.title === 'Build')!;
  /* Not moved, it is exactly the bar the plan drew. */
  assert.deepEqual(dragDrawn(bar, 'move', 0, plan), { x: bar.x, width: bar.width });
  /* Moved a week, the same width, a week along: seven of the sixty-one days in September and October. */
  const moved = dragDrawn(bar, 'move', 7, plan);
  assert.equal(moved.width, bar.width);
  assert.equal(moved.x, String(Math.round((7 / 61) * 1000 * 100) / 100));
  /* The start pulled past the end stops at one day, as `dragPatch` stops it. */
  assert.equal(dragDrawn(bar, 'start', 40, plan).width, String(Math.round((1 / 61) * 1000 * 100) / 100));
});
