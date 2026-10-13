/**
 * A field written once (SHL-A09): `once: [field ids]` on a list in an add-on.
 *
 * NO KEY NAMED A FIELD WRITTEN ONCE. An add-on's update patches what it declared, and a figure a person corrected on a
 * row the add-on first filled had nothing to say "leave this where it is". The list says it now, beside its fields:
 * `once: [opened, reference]`. This door reads the key and holds it to the list's own fields, so a file naming a field
 * the list does not have is refused where it is read, by the field's name; the update path that honours it is the
 * kernel's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise } from '../src/index.ts';

const docWith = (once: unknown): Record<string, unknown> => ({
  pack: 'sample-visits',
  version: '1.0.0',
  summary: 'A made-up visits add-on for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    {
      register: 'visits',
      name: 'Visits',
      one: 'visit',
      title: 'what',
      fields: [
        { id: 'what', type: 'text' },
        { id: 'opened', type: 'day' },
        { id: 'reference', type: 'text' },
      ],
      ...(once === undefined ? {} : { once }),
    },
  ],
});

type Out = { ok: boolean; value?: { declarations: { id: string; body: Record<string, unknown> }[] }; refusal?: { code: string; fix: string; at?: string } };
const read = async (once: unknown): Promise<Out> => (await normalise(docWith(once), { kind: 'local' })) as unknown as Out;

test('ONCE IS READ ON A LIST, and kept on its declaration in the order the file says it', async () => {
  const pack = await read(['opened', 'reference']);
  assert.ok(pack.ok, JSON.stringify(pack.refusal));
  assert.deepEqual(pack.value!.declarations.find((d) => d.id === 'register.visits')!.body.once, ['opened', 'reference']);
});

test('A LIST THAT SAYS NO ONCE reads as it always did, with no key on it', async () => {
  const pack = await read(undefined);
  assert.ok(pack.ok, JSON.stringify(pack.refusal));
  assert.equal(Object.hasOwn(pack.value!.declarations[0]!.body, 'once'), false);
});

test('A FIELD THE LIST DOES NOT HAVE IS REFUSED BY NAME, with the fields it does have', async () => {
  const pack = await read(['opened', 'closed']);
  assert.equal(pack.ok, false);
  assert.equal(pack.refusal!.code, 'FIELD_UNKNOWN');
  assert.equal(pack.refusal!.at, 'register.visits.once');
  assert.match(pack.refusal!.fix, /Visits has no field called closed/);
});

test('ONCE IS A LIST OF FIELD IDS, each said one time', async () => {
  for (const wrong of ['opened', { opened: true }, [1], [], ['opened', 'opened']]) {
    const pack = await read(wrong);
    assert.equal(pack.ok, false, JSON.stringify(wrong));
    assert.equal(pack.refusal!.code, 'PACK_MALFORMED', JSON.stringify(wrong));
    assert.equal(pack.refusal!.at, 'register.visits.once');
  }
});

test('ONLY A LIST HAS IT: a page that says once is refused', async () => {
  const doc = docWith(undefined);
  (doc.declarations as unknown[]).push({ page: 'visits-board', title: 'Visits', once: ['what'], blocks: [] });
  const pack = (await normalise(doc, { kind: 'local' })) as unknown as Out;
  assert.equal(pack.ok, false);
  assert.equal(pack.refusal!.at, 'page.visits-board.once');
});
