/**
 * Alike questions drawn as one (`alike.ts`): a family folds into the place of its first member, a lone question and an
 * arrangement stay as they are, and the answer offered is what every member offers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueueQuestion } from '@braindog/kernel';

import { alikeOf, sharedOptions } from './alike.ts';

const opt = (key: string) => ({ key, label: key, because: '', recommended: false });
const q = (id: string, cause: string | undefined, alike: number, keys = ['accept', 'dismiss']): QueueQuestion =>
  ({ id, kind: 'rule', question: id, options: keys.map(opt), ...(cause ? { cause, alike } : {}) }) as unknown as QueueQuestion;

test('questions of one cause fold into the first one\'s place', () => {
  const out = alikeOf([q('a', 'c1', 3), q('b', undefined, 1), q('c', 'c1', 3), q('d', 'c1', 3)]);
  assert.deepEqual(out.map((e) => e.kind), ['many', 'one']);
  const many = out[0]!;
  assert.ok(many.kind === 'many' && many.lead.id === 'a' && many.rest.map((r) => r.id).join() === 'c,d');
});

test('a cause with one member drawn stays a plain question', () => {
  assert.deepEqual(alikeOf([q('a', 'c1', 3), q('b', 'c2', 2)]).map((e) => e.kind), ['one', 'one']);
});

test('an arrangement is never folded', () => {
  const pack = { ...q('p', 'c1', 2), body_kind: 'pack' } as QueueQuestion;
  assert.deepEqual(alikeOf([pack, { ...pack, id: 'p2' } as QueueQuestion]).map((e) => e.kind), ['one', 'one']);
});

test('only the options every member offers are shared', () => {
  assert.deepEqual(sharedOptions(q('a', 'c', 2), [q('b', 'c', 2, ['accept'])]).map((o) => o.key), ['accept']);
});
