/**
 * The holding pen on `boot`, and the preferences that steer it.
 *
 * WHAT IS HELD: a list with a row and no page reading it is offered one page, whole, which passes the lint accepting it
 * would meet, over every list the seed installs; its table never draws a secret; a dismissal is never answered again;
 * a reader held to some lists is offered nothing; `setPref` takes the five keys and refuses a wrong shape by key; and
 * `counts.arrived` is told to the owner and to nobody else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type Boot, type CallContext, type PenItem } from '../src/index.ts';
import { PEN_DISMISSED_MOST, PEN_MOST } from '../src/emergent.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['parts'] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const code = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string } };
  return x.ok ? 'ok' : (x.refusal?.code ?? '?');
};

const reg = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const PARTS = reg('parts', 'Parts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'combination', type: 'secret' },
  { id: 'notes', type: 'document' },
  { id: 'where_kept', type: 'text', label: 'Kept in' },
  { id: 'bought', type: 'day', index: true },
  { id: 'kinds', type: 'list', of: 'text' },
]);
const BINS = reg('bins', 'Bins', 'name', [{ id: 'name', type: 'text', required: true }]);
/* A LIST WITH NOTHING A TABLE MAY DRAW, which is offered no page rather than a table of its secret. */
const VAULTED = reg('vaulted', 'Vaulted', 'label', [
  { id: 'label', type: 'document' },
  { id: 'key', type: 'secret' },
]);
const PARTS_COUNT: Declaration = {
  id: 'metric.parts-count',
  kind: 'metric',
  body: { metric: 'parts-count', name: 'Parts held', source: 'register.parts', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d' },
} as never;

async function small() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([PARTS, BINS, VAULTED, PARTS_COUNT]));
  for (const [i, name] of ['Bolt', 'Nut', 'Washer', 'Hinge', 'Bracket', 'Spring', 'Pin'].entries())
    value(api.kernel.create('parts', { name, bought: `2026-09-0${i + 1}` }, { actor: 'p_1' }));
  value(api.kernel.create('bins', { name: 'Top shelf' }, { actor: 'p_1' }));
  value(api.kernel.create('vaulted', { label: 'The safe' }, { actor: 'p_1' }));
  return { api, sql };
}

const bootOf = async (api: Awaited<ReturnType<typeof small>>['api'], ctx: CallContext): Promise<Boot> => value<Boot>(await api.boot(ctx));
const asDecl = (item: PenItem): Declaration => ({ id: item.change.to.id, kind: 'page', body: item.change.to.body }) as never;

test('A LIST WITH ROWS AND NO PAGE IS OFFERED ONE WHOLE PAGE, its figure first, its table never drawing a secret', async () => {
  const { api, sql } = await small();
  const { pen } = await bootOf(api, owner);

  assert.deepEqual(
    pen.map((i) => i.id),
    ['page:parts', 'page:bins'],
    'the lists were not offered strongest first, or the list with nothing a table may draw was offered one',
  );
  const parts = pen[0]!;
  assert.equal(parts.kind, 'page');
  assert.equal(parts.register, 'parts');
  assert.equal(parts.title, 'Parts');
  assert.equal(parts.why, 'Parts has 7 entries and no page yet.');
  assert.equal(pen[1]!.why, 'Bins has 1 entry and no page yet.');
  assert.deepEqual(parts.change.to, {
    id: 'page.parts',
    kind: 'page',
    body: {
      page: 'parts',
      title: 'Parts',
      origin: 'derived',
      derived_from: 'register.parts',
      requires: ['register.parts'],
      nav: { section: 'Parts', order: 10 },
      blocks: [
        { kind: 'stat', cells: [{ metric: 'parts-count' }] },
        {
          kind: 'table',
          source: 'register.parts',
          columns: [
            { field: 'name', label: 'Name' },
            { field: 'where_kept', label: 'Kept in' },
            { field: 'bought', label: 'Bought' },
          ],
          order: [{ field: 'bought', dir: 'desc' }],
          limit: 50,
          empty: 'Nothing in Parts yet.',
        },
      ],
    },
  });
  /* A LIST WITH NO INDEXED DAY IS ORDERED NEWEST ROW FIRST. */
  assert.deepEqual((pen[1]!.change.to.body.blocks as unknown as { order?: unknown }[])[0]!.order, [{ field: 'seq', dir: 'desc' }]);
  for (const item of pen) assert.equal(api.kernel.lint([asDecl(item)]), null, `${item.id} would be refused on accepting`);

  /* ACCEPTED, IT IS A PAGE, and the pen stops offering it as a whole page because a page now reads the list. Parts
     still puts a day on every row in `bought`, indexed, and the derived page drew no calendar of them, so a block item
     is offered beside `page:bins`: a second, later suggestion over the same list is not the whole page's to refuse
     (`emergent-blocks.test.ts` holds that item's own shape). */
  value(await api.kernel.install([asDecl(parts)]));
  const after = (await bootOf(api, owner)).pen;
  assert.deepEqual(
    after.map((i) => i.id),
    ['page:bins', 'block:parts:calendar:parts'],
  );
  for (const item of after) assert.equal(api.kernel.lint([asDecl(item)]), null, `${item.id} would be refused on accepting`);
  sql.close();
});

test('A TAKEN SLUG IS <list>-rows, AND THE NAV OFFERED IS THE END OF THE SECTION, never a place in the middle of it', async () => {
  const { api, sql } = await small();
  value(
    await api.kernel.install([
      {
        id: 'page.parts',
        kind: 'page',
        body: { page: 'parts', title: 'Stores', nav: { section: 'Parts', order: 30 }, requires: ['register.bins'], blocks: [{ kind: 'table', source: 'register.bins', empty: 'No bins.' }] },
      } as never,
    ]),
  );
  const pen = (await bootOf(api, owner)).pen;
  assert.deepEqual(pen.map((i) => i.id), ['page:parts'], 'a list a page reads was offered a second page');
  assert.equal(pen[0]!.change.to.id, 'page.parts-rows');
  assert.equal(pen[0]!.change.to.body.page, 'parts-rows');
  assert.deepEqual(pen[0]!.change.to.body.nav, { section: 'Parts', order: 40 });
  assert.equal(api.kernel.lint([asDecl(pen[0]!)]), null);
  sql.close();
});

test('A DISMISSAL IS NEVER ANSWERED AGAIN, pen.suggest off offers nothing, and a reader held to some lists is offered nothing', async () => {
  const { api, sql } = await small();
  value(await api.setPref({ key: 'pen.dismissed', value: ['page:parts'] }, owner));
  assert.deepEqual((await bootOf(api, owner)).pen.map((i) => i.id), ['page:bins']);
  /* ASKED AGAIN, AS A SECOND DEVICE WOULD ASK, the record still says no: the dismissal is in the record. */
  assert.deepEqual((await bootOf(api, owner)).pen.map((i) => i.id), ['page:bins']);

  value(await api.setPref({ key: 'pen.suggest', value: false }, owner));
  assert.deepEqual((await bootOf(api, owner)).pen, []);
  value(await api.setPref({ key: 'pen.suggest', value: null }, owner));
  assert.equal((await bootOf(api, owner)).pen.length, 1, 'taking pen.suggest away did not turn the pen back on');

  assert.deepEqual((await bootOf(api, reader)).pen, [], 'a reader held to Parts was offered pages');
  sql.close();
});

test('SETPREF TAKES THE FIVE KEYS IN THEIR SHAPES, refuses a wrong one by key, and lets the oldest dismissal go first', async () => {
  const { api, sql } = await small();
  assert.equal(code(await api.setPref({ key: 'nav.shape', value: 'bar' }, owner)), 'ok');
  assert.equal(code(await api.setPref({ key: 'nav.shape', value: 'left' }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.shape', value: ['rail'] }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'pen.suggest', value: 'yes' }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'pen.dismissed', value: 'page:parts' }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'pen.dismissed', value: [''] }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.order', value: [true] }, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'pen.shown', value: true }, owner)), 'VALUE_MALFORMED');

  const many = Array.from({ length: PEN_DISMISSED_MOST + 20 }, (_, i) => `page:list${i}`);
  const kept = value<{ key: string; value: string[] }>(await api.setPref({ key: 'pen.dismissed', value: many }, owner));
  assert.equal(kept.value.length, PEN_DISMISSED_MOST);
  assert.equal(kept.value[0], 'page:list20', 'the oldest dismissals were not the ones let go');
  value(await api.setPref({ key: 'pen.suggest', value: false }, owner));

  const prefs = (await bootOf(api, owner)).me.prefs;
  assert.equal(prefs?.['nav.shape'], 'bar');
  assert.equal(prefs?.['pen.suggest'], false);
  assert.equal(prefs?.['pen.dismissed']?.length, PEN_DISMISSED_MOST);
  sql.close();
});

test('COUNTS.ARRIVED IS TOLD TO THE OWNER, and to anybody else it is null, which is not zero', async () => {
  const { api, sql } = await small();
  assert.equal((await bootOf(api, owner)).counts.arrived, 0);
  assert.equal((await bootOf(api, reader)).counts.arrived, null);
  sql.close();
});

test('OVER EVERY LIST THE SEED INSTALLS, each page offered passes the lint accepting it meets, and none draws a secret', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await installSeed(api.kernel));
  /* THE SEED'S OWN PAGES TAKEN OFF, so every list it fills is one no page reads. */
  value(api.kernel.retire(api.kernel.declarations().filter((d) => d.kind === 'page').map((d) => d.id)));

  const notDrawn = new Set(['secret', 'document', 'json', 'list']);
  const offered = [...api.kernel.registers()]
    .filter(([id, decl]) => api.kernel.count(id) > 0 && decl.fields.some((f) => f.retired !== true && !notDrawn.has(f.type)))
    .map(([id]) => id);
  assert.ok(offered.length > 0, 'the seed filled no list');

  const { pen } = await bootOf(api, owner);
  assert.equal(pen.length, Math.min(PEN_MOST, offered.length), 'a list the seed fills was not offered, or its page was refused by the lint');
  for (const item of pen) {
    assert.ok(offered.includes(item.register), `${item.register} was offered and holds nothing a page could draw`);
    assert.equal(api.kernel.lint([asDecl(item)]), null, `${item.id} would be refused on accepting`);
    const fields = new Map((api.kernel.register(item.register)?.fields ?? []).map((f) => [f.id, f.type as string]));
    for (const block of item.change.to.body.blocks as unknown as { columns?: { field: string }[] }[])
      for (const column of block.columns ?? []) assert.ok(!notDrawn.has(fields.get(column.field) ?? ''), `${item.id} draws ${column.field}`);
  }
  sql.close();
});
