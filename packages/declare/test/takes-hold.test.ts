/**
 * When a changed setting takes hold (SHL-A09 job 5): at once for what reads it when read, and at the next install or
 * update for what is filled into a declaration. Worked out from the add-on's own file, through the plan's own reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack, type PackDeclaration } from '../src/index.ts';
import { takesHold, takesHoldAll } from '../src/takes-hold.ts';

const decl = (kind: PackDeclaration['kind'], id: string, body: Record<string, unknown>): PackDeclaration =>
  ({ kind, id, body, canonical: '' }) as PackDeclaration;

/** A made-up kiln add-on: a figure whose target reads `most_open` when it is read, and a page whose heading is filled. */
const KILN: Pick<Pack, 'declarations'> & { manifest: { config: Record<string, unknown> } } = {
  manifest: {
    config: {
      most_open: { type: 'number', default: 12 },
      heading: { type: 'text', default: 'Firings' },
      shade: { type: 'text', default: 'Glaze' },
      unused: { type: 'bool', default: false },
    },
  },
  declarations: [
    decl('register', 'register.firings', { register: 'firings', name: 'Firings', title: 'what', fields: [{ id: 'what', type: 'text' }] }),
    decl('metric', 'metric.firings-open', { metric: 'firings-open', source: 'register.firings', target: { lte: 12, setting: 'most_open' } }),
    decl('page', 'page.firings', { page: 'firings', title: '{{config:heading}}', blocks: [{ kind: 'note', text: 'Every {{config:shade}} batch' }] }),
    decl('metric', 'metric.firings-shade', { metric: 'firings-shade', source: 'register.firings', target: { lte: 3, setting: 'shade' } }),
  ],
};

test('a setting only a read-time figure reads takes hold now (ruling 442)', () => {
  assert.equal(takesHold(KILN, 'most_open'), 'now');
});

test('a setting filled into a page body takes hold at the next update (ruling 442)', () => {
  assert.equal(takesHold(KILN, 'heading'), 'next-update');
});

test('a setting used both ways waits for the update, since the filled part is what is stored (ruling 442)', () => {
  assert.equal(takesHold(KILN, 'shade'), 'next-update');
});

test('an unknown key, and a declared one nothing fills, take hold now (ruling 442)', () => {
  assert.equal(takesHold(KILN, 'nobody_declares_this'), 'now');
  assert.equal(takesHold(KILN, 'unused'), 'now');
});

test('every declared setting is answered, in the order the add-on declares them (ruling 442)', () => {
  assert.deepEqual(takesHoldAll(KILN), { most_open: 'now', heading: 'next-update', shade: 'next-update', unused: 'now' });
  assert.deepEqual(takesHoldAll(KILN, ['heading']), { heading: 'next-update' });
});

test('a pack read through the door is answered the same way: the list name it fills waits for the update (ruling 442)', async () => {
  const read = await normalise(
    {
      pack: 'sample-kiln',
      version: '1.0.0',
      summary: 'A made-up kiln add-on for tests.',
      author: 'Test Author',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      config: { heading: { type: 'text', default: 'Firings' }, strict: { type: 'bool', default: false } },
      declarations: [{ register: 'firings', name: '{{config:heading}}', title: 'what', fields: [{ id: 'what', type: 'text' }] }],
    },
    { kind: 'local' },
  );
  assert.ok(read.ok, read.ok ? '' : JSON.stringify(read));
  assert.deepEqual(takesHoldAll(read.value), { heading: 'next-update', strict: 'now' });
});
