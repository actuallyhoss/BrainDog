/**
 * A `form` block drawn from the record's answer: the segment `Form.svelte` draws, with the form on it, through the path
 * every page takes (`page-live.ts` `blockOf` keeps the answer, `blocks.ts` `draw` asks this table first).
 *
 * THE ANSWER HERE IS THE KERNEL'S SHAPE, written out (`packages/kernel/src/kinds/form.ts` reads it, and its own test
 * holds that half). The list and its fields are invented: a list of sketches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal } from '../../record/blocks.ts';
import { draw } from '../../record/blocks.ts';
import { blockOf } from '../../record/page-live.ts';
import { drawerOf, type DrawOptions } from './index.ts';
import { form } from './form.ts';

const NOW = Date.UTC(2026, 8, 9, 12);
const NOTHING: Refusal = { kind: 'no-results', title: 'Nothing matched.' };
const OPTS: DrawOptions = { home: 'GBP', now: NOW, nothing: () => NOTHING };

const FORM = {
  verb: 'row.create',
  register: 'sketches',
  fields: [
    { id: 'title', label: 'Title', type: 'text', required: true },
    { id: 'sold', label: 'Sold', type: 'bool', required: false },
    { id: 'price', label: 'Price', type: 'money', required: false, show_when: { field: 'sold', is: true } },
    { id: 'drawn_on', label: 'Drawn on', type: 'date', required: false, extra: 'not drawn' },
  ],
  submit: 'Add the sketch',
  after: 'stay',
};

type Spec = { register: string; submit: string; after: string; fields: Record<string, unknown>[] };
/** The form a drawn segment carries for `Form.svelte`. */
const specOf = (segment: unknown): Spec | null => ((segment as { form_spec?: Spec } | undefined)?.form_spec ?? null);

/** A form block as the record's `page` answers one: the declaration, with what the kernel read on it. */
const answered = (more: Record<string, unknown> = {}) => ({ kind: 'form', key: 'add-sketch', heading: 'New sketch', rows: [], matched: 0, refusals: [], form: FORM, ...more });

test('the form kind is registered', () => {
  assert.equal(drawerOf('form'), form);
});

test("the kind draws the kernel's answer into one segment that carries the form", () => {
  const drawn = form.draw(answered() as never, OPTS);
  assert.equal(drawn.refusal, null);
  assert.equal(drawn.segments.length, 1);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block');
  assert.equal(segment?.type === 'block' ? segment.kind : null, 'form');
  assert.deepEqual(segment?.type === 'block' ? segment.rows : null, []);
  /* WHAT THE DRAWER READS FROM IT (`braindog-render` `formOf`): every field the record typed, in order, and a key it sent
     beside them left behind. */
  const spec = specOf(segment);
  assert.ok(spec, 'the kind put no form on the segment');
  assert.equal(spec.register, 'sketches');
  assert.equal(spec.submit, 'Add the sketch');
  assert.equal(spec.after, 'stay');
  assert.deepEqual(spec.fields.map((f) => f.id), ['title', 'sold', 'price', 'drawn_on']);
  assert.deepEqual(spec.fields[2], { id: 'price', label: 'Price', type: 'money', required: false, show_when: { field: 'sold', is: true } });
  assert.equal(Object.hasOwn(spec.fields[3]!, 'extra'), false);
});

test('the page read keeps the answer on a form block, and draw hands it to the kind', () => {
  const live = blockOf(answered() as never, new Map(), NOW);
  assert.ok(live.answer, 'the reader did not keep the answer on a form block');
  assert.equal(live.cannot, undefined);
  const drawn = draw(live);
  assert.equal(drawn.refusal, null);
  assert.equal(specOf(drawn.segments[0])?.fields.length, 4);
});

test('a form with no fields is refused the way every kind says it has nothing to draw', () => {
  assert.deepEqual(form.draw(answered({ form: { ...FORM, fields: [] } }) as never, OPTS), { segments: [], refusal: NOTHING });
  assert.deepEqual(form.draw(answered({ form: { ...FORM, fields: [{ id: 'title', label: '' }] } }) as never, OPTS), { segments: [], refusal: NOTHING });
  /* A READER WHO MAY NOT WRITE IS SENT NO FORM AT ALL, and is drawn nothing to fill in. */
  assert.deepEqual(form.draw(answered({ form: undefined }) as never, OPTS), { segments: [], refusal: NOTHING });
  assert.deepEqual(form.draw(answered({ form: { ...FORM, register: '' } }) as never, OPTS), { segments: [], refusal: NOTHING });
});
