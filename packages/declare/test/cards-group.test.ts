/**
 * A cards block's `group: <ref field>` and `fold: <n>`: the grouping is a ref on the list the block reads, and the fold
 * is a small whole number, 3 when it is left out (`src/cards.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARDS_FOLD, cardsFault, normalise } from '../src/index.ts';

const DOC = (block: Record<string, unknown>) => ({
  pack: 'studio-work',
  version: '1.0.0',
  summary: 'The work a studio does, by client.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
    {
      register: 'projects',
      name: 'Projects',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'client', type: 'ref', to: 'clients' },
        { id: 'helpers', type: 'list', of: 'ref' },
        { id: 'stage', type: 'enum', values: ['open', 'done'] },
      ],
    },
    { page: 'work', title: 'Work', requires: ['register.projects', 'register.clients'], blocks: [{ kind: 'cards', heading: 'By client', source: 'register.projects', ...block }] },
  ],
});

const refusal = async (block: Record<string, unknown>) => {
  const r = await normalise(DOC(block));
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as { refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } }).refusal;
};

test('a cards block groups by a ref on its list, and folds at a small whole number', async () => {
  const r = await normalise(DOC({ group: 'client', fold: 5 }));
  assert.ok(r.ok, r.ok || !('refusal' in r) ? '' : r.refusal.fix);
  assert.ok((await normalise(DOC({ group: 'client' }))).ok);
  assert.equal(CARDS_FOLD, 3);
});

test('a group that is not a field of the list is refused, naming the ones it could be', async () => {
  const no = await refusal({ group: 'owner' });
  assert.equal(no.code, 'FIELD_UNKNOWN');
  assert.equal(no.at, 'page.work.blocks[0].group');
  assert.deepEqual(no.allowed, ['client']);
  assert.match(no.fix, /projects has no field called owner/);
});

test('a group that is not a single ref is refused: text, an enum and a list of refs alike', async () => {
  for (const field of ['what', 'stage', 'helpers']) {
    const no = await refusal({ group: field });
    assert.equal(no.code, 'DECLARATION_INVALID', field);
    assert.deepEqual(no.allowed, ['client']);
    assert.match(no.fix, /not a link to one thing/);
    assert.doesNotMatch(no.fix, /—/);
  }
});

test('a group on a block that reads no list is refused', async () => {
  const no = await refusal({ group: 'client', source: undefined });
  assert.equal(no.code, 'DECLARATION_INVALID');
  assert.match(no.fix, /reads no list/);
});

test('a fold that is not a whole number from 1 to 50 is refused', async () => {
  for (const fold of [0, -1, 2.5, '3', true, 51]) {
    const no = await refusal({ group: 'client', fold });
    assert.equal(no.code, 'OUT_OF_BOUNDS', String(fold));
    assert.equal(no.at, 'page.work.blocks[0].fold');
  }
});

test('a fold with no group is refused, as the kernel refuses it at install', async () => {
  const no = await refusal({ fold: 2 });
  assert.equal(no.code, 'DECLARATION_INVALID');
  assert.equal(no.at, 'page.work.blocks[0].fold');
  assert.match(no.fix, /take fold off/);
});

test('a group that is not a field id is refused before any list is asked', async () => {
  for (const group of ['', 'Client', 'client name', 7]) {
    const no = await refusal({ group });
    assert.equal(no.code, 'DECLARATION_INVALID', String(group));
    assert.equal(no.at, 'page.work.blocks[0].group');
  }
});

test('a list another pack declares is left to the record, which knows it', () => {
  const page = { blocks: [{ kind: 'cards', source: 'register.elsewhere', group: 'anything' }] };
  assert.equal(cardsFault('page.x', page, new Map()), null);
});

test('only cards blocks are read', () => {
  const page = { blocks: [{ kind: 'section', fold: true }, { kind: 'table', source: 'register.projects' }] };
  assert.equal(cardsFault('page.x', page, new Map()), null);
});
