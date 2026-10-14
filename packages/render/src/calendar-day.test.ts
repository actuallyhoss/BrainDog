/**
 * A day a link opened the calendar on: `?day=` read only as a real day, the one cell it names marked, and the Svelte
 * drawer saying it with `aria-current` whether the day comes in the options or from the host's context.
 *
 * The drawer is compiled under Node's module hooks, as `parity.test.ts` does, and rendered on the server.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { CALENDAR_DAY, calendarPlan, dayParam } from './calendar.ts';
import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: Calendar } = (await import(new URL('../svelte/Calendar.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts?: Record<string, unknown> }>;
};

const ROWS = [
  { cells: ['Kiln firing', '2026-11-03'] },
  { cells: ['Glaze order', '2026-11-03'] },
  { cells: ['Studio rent', '2026-12-01'] },
];

const block = (): BlockSegment => {
  const [seg] = parse('```calendar\nKiln firing | 2026-11-03\nStudio rent | 2026-12-01\n```', { page: true });
  assert.equal(seg?.type, 'block');
  return seg as BlockSegment;
};

const marked = (rows = ROWS, mark?: string | null) =>
  calendarPlan(rows, '2026-10-14', mark).months.flatMap((m) => m.weeks.flat()).filter((c) => c.marked);

test('a mark inside the months drawn marks its one cell, and only inside its month', () => {
  const cells = marked(ROWS, '2026-11-03');
  assert.deepEqual(
    cells.map((c) => [c.day, c.inside, c.count]),
    [['2026-11-03', true, 2]],
  );
  /* A day of no row is marked as well: the reader came to the day, not to a row on it. */
  assert.deepEqual(marked(ROWS, '2026-11-20').map((c) => c.day), ['2026-11-20']);
  /* 1 December is drawn twice, in November's last week and December's first; only December's is it. */
  assert.deepEqual(marked(ROWS, '2026-12-01').map((c) => [c.day, c.inside]), [['2026-12-01', true]]);
});

test('a mark outside the months drawn, or no day at all, marks none and draws the same months', () => {
  assert.deepEqual(marked(ROWS, '2030-12-24'), []);
  assert.deepEqual(marked(ROWS, '2026-13-01'), []);
  assert.deepEqual(marked(ROWS, null), []);
  assert.deepEqual(marked(ROWS), []);
  assert.deepEqual(
    calendarPlan(ROWS, '2026-10-14', '2030-12-24').months.map((m) => m.month),
    calendarPlan(ROWS, '2026-10-14').months.map((m) => m.month),
  );
});

test('dayParam reads a real day only', () => {
  const at = (q: string) => dayParam(new URL(`https://example.test/p/calendar${q}`));
  assert.equal(at('?day=2026-11-03'), '2026-11-03');
  assert.equal(at('?day=%202026-11-03%20'), '2026-11-03');
  assert.equal(at('?day=2030-13-01'), null);
  assert.equal(at('?day=2026-02-30'), null);
  assert.equal(at('?day=x'), null);
  assert.equal(at('?day='), null);
  assert.equal(at(''), null);
});

test('the drawer says the marked day with aria-current, from the options or from the host context', () => {
  const cur = (html: string) => [...html.matchAll(/<td [^>]*aria-current="date"[^>]*>/gu)].length;
  assert.equal(cur(render(Calendar, { props: { block: block(), opts: { day: '2026-11-03' } } }).body), 1);
  const context = new Map<unknown, unknown>([[CALENDAR_DAY, () => '2026-12-01']]);
  assert.equal(cur(render(Calendar, { props: { block: block() }, context }).body), 1);
  assert.equal(cur(render(Calendar, { props: { block: block(), opts: { day: '2030-12-24' } } }).body), 0);
  /* WITH NO DAY, the tree is the twin's, which marks nothing. */
  assert.equal(cur(render(Calendar, { props: { block: block() } }).body), 0);
  assert.doesNotMatch(toHTML([block()]), /aria-current/u);
});

test('the declared page hands the day down under the key the drawer reads', () => {
  const route = readFileSync(new URL('../../../apps/web/src/routes/p/[slug]/+page.svelte', import.meta.url), 'utf8');
  assert.ok(route.includes(`setContext('${CALENDAR_DAY}'`), 'the page spells the key again, and it is not this one');
});
