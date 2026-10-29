/**
 * The kernel's copy of what each kind draws at each widget size (`src/kinds/sizes.ts`) is the renderer's
 * (`braindog-render` `KIND_SIZES`), and a board's keys are checked at install (`src/board.ts`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KIND_SIZES as RENDER, WIDGET_SIZES as RENDER_SIZES } from '../../render/src/kinds.ts';
import { boardFault, widgetFault } from '../src/board.ts';
import { KIND_SIZES, WIDGET_SIZES, sizeRead } from '../src/kinds/sizes.ts';

test('the kernel and the renderer say the same sizes for every kind', () => {
  assert.deepEqual([...WIDGET_SIZES], [...RENDER_SIZES]);
  assert.deepEqual(JSON.parse(JSON.stringify(KIND_SIZES)), JSON.parse(JSON.stringify(RENDER)));
});

test('a list widget reads what its size shows and one more; a queue and cards are read whole', () => {
  assert.equal(sizeRead('todo', 'small'), 2);
  assert.equal(sizeRead('table', 'tall'), 5);
  assert.equal(sizeRead('queue', 'large'), null);
  assert.equal(sizeRead('cards', 'full'), null);
  assert.equal(sizeRead('todo', 'huge'), null);
});

test('a size is refused off a board, and a size the kind cannot take names the ones it can', () => {
  assert.match(widgetFault('page.x', 'blocks[0]', { kind: 'stat', size: 'wide' }, false)?.fix ?? '', /board: true/);
  assert.match(widgetFault('page.x', 'blocks[0]', { kind: 'cards', size: 'small' }, true)?.fix ?? '', /Wide, tall, large, full it can be/);
  assert.equal(widgetFault('page.x', 'blocks[0]', { kind: 'stat', size: 'small' }, true), null);
});

test('a board names every widget by key, holds sixteen at most, and its phone names only its widgets', () => {
  const w = (key: string) => ({ kind: 'stat', key, size: 'small' });
  assert.equal(boardFault('page.home', { board: true, blocks: [{ kind: 'note', lead: true, body: 'Hi' }, w('a')] }), null);
  assert.match(boardFault('page.home', { board: true, blocks: [{ kind: 'stat' }] })?.fix ?? '', /key:/);
  assert.match(boardFault('page.home', { board: true, blocks: Array.from({ length: 17 }, (_, i) => w(`w${i}`)) })?.fix ?? '', /at most 16/);
  assert.match(boardFault('page.home', { board: true, blocks: [w('a')], phone: { order: ['b'] } })?.fix ?? '', /names b/);
  assert.equal(boardFault('page.home', { board: true, blocks: [w('a')], phone: { order: ['a'], hidden: [], sizes: { a: 'wide' } } }), null);
  assert.match(boardFault('page.home', { blocks: [w('a')], phone: {} })?.fix ?? '', /board: true/);
});
