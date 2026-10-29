import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitted, phoneWidgets, widgetsOf } from './board-widgets.ts';

test('the head is not a widget, a size the kind cannot take is the nearest it can, and the phone keeps its own order', () => {
  const w = widgetsOf([
    { kind: 'note', lead: true },
    { kind: 'capture', key: 'c' },
    { kind: 'cards', key: 'p', size: 'small' },
    { kind: 'stat', key: 's', size: 'wide' },
    { kind: 'spec', key: 'under' },
    { kind: 'todo', key: 't', size: 'tall' },
  ]);
  assert.deepEqual(w.map((x) => [x.key, x.size]), [['p', 'wide'], ['s', 'wide'], ['t', 'tall']]);
  const p = phoneWidgets(w, { order: ['t'], hidden: ['p'], sizes: { t: 'large' } });
  assert.deepEqual(p.map((x) => [x.key, x.size]), [['t', 'large'], ['s', 'wide']]);
});

test('a frame cuts its lines and its questions, and a block that fits is the block it was', () => {
  const rows = Array.from({ length: 9 }, (_, i) => i);
  assert.equal(fitted({ kind: 'todo', rows, entries: rows }, 'wide').rows?.length, 2);
  const q = { kind: 'queue', queue: rows };
  assert.equal(fitted(q, 'large').queue?.length, 2);
  const small = { kind: 'todo', rows: [1] };
  assert.equal(fitted(small, 'large'), small);
});

test('a Tall the phone names no size for takes its width: a table Large, a list Wide', () => {
  const w = widgetsOf([{ kind: 'table', key: 't', size: 'tall' }]);
  assert.deepEqual(phoneWidgets(w, null).map((x) => x.size), ['large']);
  const list = widgetsOf([{ kind: 'todo', key: 'l', size: 'tall' }]);
  assert.deepEqual(phoneWidgets(list, null).map((x) => x.size), ['wide']);
  assert.deepEqual(phoneWidgets(w, { sizes: { t: 'tall' } }).map((x) => x.size), ['tall']);
});
