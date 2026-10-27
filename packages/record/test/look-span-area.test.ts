/**
 * His widths and columns through the record: a look by owner that says `span` and `area` is installed, read
 * back off the record whole, and laid over the page a read draws; the engine's look laid under it never takes them
 * away, and Slash's look never carries any.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { liveLook, lookBodyOf, undoLook, writeLook } from '../src/compose-look.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 24 * 60 * 60 * 1000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const PLANTS: Declaration = {
  id: 'register.plants',
  kind: 'register',
  body: { id: 'plants', name: 'Plants', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const POTS: Declaration = {
  id: 'register.pots',
  kind: 'register',
  body: { id: 'pots', name: 'Pots', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** A page with a rail: two lists in the main column, and a note in the rail. */
const SHED: Declaration = {
  id: 'page.shed',
  kind: 'page',
  body: {
    page: 'shed',
    title: 'Shed',
    layout: { rail: 4 },
    blocks: [
      { kind: 'table', key: 'plants', source: 'register.plants', heading: 'Plants', columns: [{ field: 'name' }] },
      { kind: 'table', key: 'pots', source: 'register.pots', heading: 'Pots', columns: [{ field: 'what' }] },
      { kind: 'note', key: 'tips', area: 'rail', body: 'Water on Sundays.' },
    ],
  } as never,
};

type Read = { blocks: { key?: string; span?: number; area?: string }[]; look?: { by?: string; span?: Record<string, number>; area?: Record<string, string> } };

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([PLANTS, POTS, SHED])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'shed', name: 'Shed', tz: 'UTC', locale: 'en', owner: { id: 'p_1', name: 'Robin' } }).ok);
  assert.ok(api.kernel.create('plants', { name: 'Fern' }, { actor: 'p_1' }).ok);
  assert.ok(api.kernel.create('pots', { what: 'Clay pot' }, { actor: 'p_1' }).ok);
  const read = async (): Promise<Read> => {
    const got = await api.page({ slug: 'shed' }, owner);
    assert.ok(got.ok, JSON.stringify(got));
    return got.value as unknown as Read;
  };
  return { api, sql, clock, read };
}

const at = (r: Read, key: string) => r.blocks.find((b) => b.key === key)!;

test('HIS LOOK WITH WIDTHS AND COLUMNS round-trips through the record, and the page draws with them', async () => {
  const { api, read } = await record();
  const put = await api.setDeclaration({ body: { look: 'shed', basis: 'arranged', by: 'owner', span: { plants: 6, pots: 4 }, area: { pots: 'rail' } } }, owner);
  assert.ok(put.ok, JSON.stringify(put));
  const live = liveLook(api.kernel, 'shed');
  assert.deepEqual(live?.body.span, { plants: 6, pots: 4 });
  assert.deepEqual(live?.body.area, { pots: 'rail' });
  const page = await read();
  assert.equal(at(page, 'plants').span, 6);
  assert.equal(at(page, 'pots').span, 4);
  assert.equal(at(page, 'pots').area, 'rail');
  assert.equal(at(page, 'tips').area, 'rail');
  /* THE ENGINE'S LOOK IS LAID UNDER HIS (`mergeLook`) and leaves his places whole. */
  assert.equal(page.look?.by, 'owner');
  assert.deepEqual(page.look?.span, { plants: 6, pots: 4 });
  assert.deepEqual(page.look?.area, { pots: 'rail' });
});

test('PUT BACK A DAY LATER brings back his earlier widths whole', async () => {
  const { api, sql, clock, read } = await record();
  assert.ok((await api.setDeclaration({ body: { look: 'shed', basis: 'a', by: 'owner', span: { plants: 8 } } }, owner)).ok);
  clock.advance(DAY);
  const live = liveLook(api.kernel, 'shed')!;
  assert.ok((await api.setDeclaration({ body: { look: 'shed', basis: 'b', by: 'owner', span: { plants: 3 }, area: { plants: 'rail' } }, version: live.version }, owner)).ok);
  assert.equal(at(await read(), 'plants').span, 3);
  const back = await undoLook(api.kernel, 'shed', 'Shed', 'p_1', sql);
  assert.ok(back.ok, JSON.stringify(back));
  assert.equal(back.value.restored, 'previous');
  assert.deepEqual(liveLook(api.kernel, 'shed')?.body.span, { plants: 8 });
  const page = await read();
  assert.equal(at(page, 'plants').span, 8);
  assert.equal(at(page, 'plants').area, undefined);
});

test("SLASH'S LOOK NEVER CARRIES A WIDTH OR A COLUMN, written or read", async () => {
  const { api, read } = await record();
  const wrote = await writeLook(api.kernel, 'shed', 'Shed', { look: 'shed', basis: 'n1', by: 'slash', order: ['pots', 'plants'], span: { plants: 6 }, area: { plants: 'rail' } });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const live = liveLook(api.kernel, 'shed');
  assert.equal(live?.body.by, 'slash');
  assert.equal(live?.body.span, undefined);
  assert.equal(live?.body.area, undefined);
  const page = await read();
  assert.equal(at(page, 'plants').span, undefined);
  assert.equal(at(page, 'plants').area, undefined);
  assert.equal(lookBodyOf({ look: 'shed', basis: 'x', by: 'rule', span: { plants: 6 } }, 'shed')?.span, undefined);
  assert.deepEqual(lookBodyOf({ look: 'shed', basis: 'x', by: 'owner', span: { pots: 4, plants: 5 } }, 'shed')?.span, { pots: 4 }, 'a width the board does not draw is passed over');
});
