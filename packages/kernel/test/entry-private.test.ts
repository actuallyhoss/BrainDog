/**
 * A row its maker kept private is left out of every read made for another viewer, and only its maker can say so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NOBODY, openRecord, type Declaration, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);

const notes: Declaration = {
  id: 'register.jotter',
  kind: 'register',
  body: { id: 'jotter', name: 'Jotter', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function jotter() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([notes])).ok);
  const mine = k.create('jotter', { what: 'Ada hidden' }, { actor: 'p_ada' });
  const shared = k.create('jotter', { what: 'Ada open' }, { actor: 'p_ada' });
  assert.ok(mine.ok && shared.ok);
  return { k, mine: (mine as { value: { id: string } }).value.id, shared: (shared as { value: { id: string } }).value.id };
}

const person = (id: string) => ({ principal: { kind: 'person', id } });

test('A PRIVATE ROW READS AS ABSENT TO A COLLEAGUE AND PRESENT TO ITS MAKER, THROUGH THE ONE SCOPE', async () => {
  const { k, mine } = await jotter();
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  const seenBy = (ctx: { principal: { kind: string; id: string } }) => {
    const out = k.list({ register: 'jotter' }, k.scope(ctx, 'jotter'));
    assert.ok(out.ok);
    return (out as { value: { rows: { fields: { what: string } }[] } }).value.rows.map((r) => r.fields.what).sort();
  };
  assert.deepEqual(seenBy(person('p_bo')), ['Ada open']);
  assert.deepEqual(seenBy(person('p_ada')), ['Ada hidden', 'Ada open']);
  assert.deepEqual(seenBy({ principal: { kind: 'system', id: 'rules' } }), ['Ada hidden', 'Ada open']);
  assert.equal(k.count('jotter', k.scope(person('p_bo'), 'jotter')), 1);
  assert.equal(k.scope(person('p_ada'), 'jotter'), undefined);
  assert.equal(k.hiddenFrom(mine, 'p_bo'), true);
  assert.equal(k.hiddenFrom(mine, 'p_ada'), false);
});

test('A READ THAT LEAVES THE RECORD, AND A SHARE LINK, SEE NO PRIVATE ROW AT ALL', async () => {
  const { k, mine } = await jotter();
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  assert.equal(k.count('jotter', k.scope({ principal: { kind: 'person', id: 'p_ada' }, outbound: true }, 'jotter')), 1);
  assert.equal(k.count('jotter', k.scope({ principal: { kind: 'share', id: 'sh_1' } }, 'jotter')), 1);
});

test('SEARCH AND ITS COUNT LEAVE OUT A ROW KEPT PRIVATE', async () => {
  const { k, mine } = await jotter();
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  const bo = k.searchMatched('Ada', { viewer: 'p_bo' });
  assert.equal(bo.hits.length, 1);
  assert.equal(bo.matched.jotter, 1);
  assert.equal(k.searchMatched('Ada', { viewer: 'p_ada' }).hits.length, 2);
});

test('A FIGURE OVER A LIST DOES NOT COUNT A ROW KEPT PRIVATE FROM THE VIEWER', async () => {
  const { k, mine } = await jotter();
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  const how = { metric: 'jots', name: 'Jots', source: 'register.jotter', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as unknown as MetricDecl;
  const seen = (viewer?: string) => {
    const out = k.metric(how, viewer === undefined ? {} : { viewer });
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.value;
  };
  assert.equal(seen(), 2);
  assert.equal(seen('p_ada'), 2);
  assert.equal(seen('p_bo'), 1);
  assert.equal(seen(NOBODY), 1);
});

test('A LIST NOBODY KEPT A ROW PRIVATE IN IS READ WHOLE, SO THE FAST PATHS STAND', async () => {
  const { k } = await jotter();
  assert.equal(k.scope(person('p_bo'), 'jotter'), undefined);
});

test('ONLY THE MAKER MAY KEEP A ROW PRIVATE OR SHARE IT AGAIN', async () => {
  const { k, mine } = await jotter();
  assert.equal(k.setPrivate('p_bo', mine, true).ok, false);
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  assert.equal(k.setPrivate('p_bo', mine, false).ok, false);
  assert.ok(k.setPrivate('p_ada', mine, false).ok);
  assert.equal(k.hiddenFrom(mine, 'p_bo'), false);
});

test('THE ACTIVITY FIGURE AND THE MONEY CURRENCIES LEAVE OUT A ROW KEPT PRIVATE FROM ANOTHER VIEWER', async () => {
  const { k, mine } = await jotter();
  assert.ok(k.setPrivate('p_ada', mine, true).ok);
  const how = { metric: 'moves', name: 'Moves', activity: 'kind', window: '7d' } as unknown as MetricDecl;
  const total = (viewer?: string) => {
    const out = k.metric(how, viewer === undefined ? {} : { viewer });
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.value;
  };
  assert.ok(Number(total('p_bo')) < Number(total('p_ada')));
  assert.equal(total('p_ada'), total());
  assert.deepEqual(k.moneyCurrencies(() => true, 2, 'p_bo'), []);
});
