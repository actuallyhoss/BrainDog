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
import { PEN_DISMISSED_MOST, PEN_SHOWN, PEN_USE_DAYS, PEN_YOUNG_DAYS, penRanked, usedOf, youngOf } from '../src/emergent.ts';
import { COMPANIES, PROJECTS } from '../../../fixtures/names.ts';
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
const KEYCHAINED = reg('keychained', 'Keychained', 'label', [
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
  value(await api.kernel.install([PARTS, BINS, KEYCHAINED, PARTS_COUNT]));
  for (const [i, name] of ['Bolt', 'Nut', 'Washer', 'Hinge', 'Bracket', 'Spring', 'Pin'].entries())
    value(api.kernel.create('parts', { name, bought: `2026-09-0${i + 1}` }, { actor: 'p_1' }));
  value(api.kernel.create('bins', { name: 'Top shelf' }, { actor: 'p_1' }));
  value(api.kernel.create('keychained', { label: 'The safe' }, { actor: 'p_1' }));
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
  assert.equal(parts.why, 'Parts has 7 in it, shown one under another. A page of its own would lay them out.');
  assert.equal(pen[1]!.why, 'Bins has 1 in it so far. A page of its own would lay it out.');
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
    /* AND NOT A LIST ITS AUTOMATIONS KEEP (`kept_by`), the night's snapshots among them: nobody files there, so nobody is offered a page of it. */
    .filter(([id, decl]) => api.kernel.count(id) > 0 && (decl as { kept_by?: unknown }).kept_by === undefined && decl.fields.some((f) => f.retired !== true && !notDrawn.has(f.type)))
    .map(([id]) => id);
  assert.ok(offered.length > 0, 'the seed filled no list');

  /* BOOT SHOWS THE QUEUE'S THREE AT MOST, AND THE RANKED PEN BEHIND IT HOLDS EVERY LIST, with no second cap, so the lint
     is asked of each. */
  assert.equal((await bootOf(api, owner)).pen.length, Math.min(PEN_SHOWN, offered.length), 'boot showed more than the pen shows at once');
  assert.equal(PEN_SHOWN, 3, 'the pen shows more than three at once');
  const pen = penRanked({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(), use: { sql, nowMs: NOW } });
  assert.equal(pen.length, offered.length, 'a list the seed fills was not offered, or its page was refused by the lint');
  for (const item of pen) {
    assert.ok(offered.includes(item.register), `${item.register} was offered and holds nothing a page could draw`);
    assert.equal(api.kernel.lint([asDecl(item)]), null, `${item.id} would be refused on accepting`);
    const fields = new Map((api.kernel.register(item.register)?.fields ?? []).map((f) => [f.id, f.type as string]));
    for (const block of item.change.to.body.blocks as unknown as { columns?: { field: string }[] }[])
      for (const column of block.columns ?? []) assert.ok(!notDrawn.has(fields.get(column.field) ?? ''), `${item.id} draws ${column.field}`);
  }
  sql.close();
});

const DAY = 86_400_000;
const named = (id: string, name: string): Declaration => reg(id, name, 'name', [{ id: 'name', type: 'text', required: true }]);

test('THE PEN SHOWS ITS BEST PEN_SHOWN: a list opened in the last seven days first, then the newest entry, the rest waiting', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const lists = [named('anvils', 'Anvils'), named('barrels', 'Barrels'), named('crates', 'Crates'), named('drums', 'Drums'), named('easels', 'Easels')];
  value(await api.kernel.install(lists));
  /* ANVILS HOLDS THE MOST AND IS THE OLDEST, Easels the fewest and the newest, so strength alone would say the opposite. */
  for (const [at, [list, many]] of ([['anvils', 6], ['barrels', 5], ['crates', 1], ['drums', 1], ['easels', 1]] as const).entries()) {
    clock.set(NOW - (5 - at) * DAY);
    for (let i = 0; i < many; i++) value(api.kernel.create(list, { name: `${list} ${i + 1}` }, { actor: 'p_1' }));
  }
  /* BARRELS WAS OPENED TEN DAYS AGO, which is not lately. */
  clock.set(NOW - 10 * DAY);
  value(api.kernel.observe([{ kind: 'register.read', subject: 'barrels' }]));
  clock.set(NOW);
  const deps = () => ({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set<string>(), use: { sql, nowMs: NOW } });

  assert.deepEqual((await bootOf(api, owner)).pen.map((i) => i.id), ['page:easels', 'page:drums', 'page:crates'], 'the newest entries were not shown first');
  assert.equal((await bootOf(api, owner)).pen.length, PEN_SHOWN);
  assert.deepEqual(penRanked(deps()).map((i) => i.id), ['page:easels', 'page:drums', 'page:crates', 'page:barrels', 'page:anvils'], 'the offers past the shown ones were dropped, not kept waiting');

  /* OPENED TODAY, Anvils goes first, though it is the oldest. */
  value(api.kernel.observe([{ kind: 'register.read', subject: 'anvils' }]));
  assert.deepEqual((await bootOf(api, owner)).pen.map((i) => i.id), ['page:anvils', 'page:easels', 'page:drums']);

  /* KEPT OR DISMISSED, THE NEXT TAKES ITS TURN. */
  value(await api.setPref({ key: 'pen.dismissed', value: ['page:anvils'] }, owner));
  assert.deepEqual((await bootOf(api, owner)).pen.map((i) => i.id), ['page:easels', 'page:drums', 'page:crates']);
  sql.close();
});

test('ONE OFFER A LIST: a list two pages draw without a calendar is offered one calendar, never one on each page', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const table = { kind: 'table', source: 'register.parts', columns: [{ field: 'name', label: 'Name' }], empty: 'No parts yet.' };
  const pageOf = (slug: string, title: string): Declaration => ({ id: `page.${slug}`, kind: 'page', body: { page: slug, title, blocks: [table] } }) as never;
  value(await api.kernel.install([PARTS, pageOf('stores', 'Stores'), pageOf('workshop', 'Workshop')]));
  for (const [i, name] of ['Bolt', 'Nut', 'Washer'].entries()) value(api.kernel.create('parts', { name, bought: `2026-09-0${i + 1}` }, { actor: 'p_1' }));

  const pen = penRanked({ kernel: api.kernel, reads: () => true, pages: api.kernel.pages(), dismissed: new Set(), use: { sql, nowMs: NOW } });
  const forParts = pen.filter((i) => i.register === 'parts');
  assert.equal(forParts.length, 1, `Parts was offered twice: ${JSON.stringify(pen.map((i) => i.id))}`);
  assert.equal(forParts[0]!.id, 'block:stores:calendar:parts', 'the first page in the record was not the one offered the calendar');
  assert.equal(forParts[0]!.why, 'Parts puts a day on its entries in Bought, and Stores has no calendar of them.');
  sql.close();
});

test("A RECORD IS AS OLD AS ITS PEOPLE'S OWN USE: an import, an agent and the system never make it older (HD.410)", async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.parse('2026-09-01T09:00:00Z'));
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PARTS]));
  const DAY = 86_400_000;
  const start = clock.now();

  /* A YEAR OF ROWS WRITTEN BY AN IMPORT AND AN AGENT IS NOBODY'S USE: the week offer's clock has not started. */
  for (let i = 0; i < 200; i++)
    value(api.kernel.create('parts', { name: `${PROJECTS[i % PROJECTS.length]} part ${i + 1}` }, { actor: i % 2 === 0 ? 'ingest:parts-file' : 'agent:claude' }));
  value(api.kernel.create('parts', { name: 'Written by the night' }, { actor: 'system' }));
  assert.deepEqual(usedOf(sql), { first: null, days: 0 });
  assert.equal(youngOf(usedOf(sql), start + 400 * DAY), 'none');

  /* A PERSON WRITING IS USE, counted once a day, and young until two weeks and five days of it. */
  for (const d of [0, 0, 3, 9]) {
    clock.set(start + d * DAY);
    value(api.kernel.create('parts', { name: `${COMPANIES[d % COMPANIES.length]} order on day ${d}` }, { actor: owner.principal.id }));
  }
  const used = usedOf(sql);
  assert.equal(used.days, 3);
  assert.equal(Date.parse(used.first!), start);
  assert.equal(youngOf(used, start + 10 * DAY), 'weeks');
  assert.equal(youngOf(used, start + PEN_YOUNG_DAYS * DAY), 'days', 'three days of use was called a habit');
  clock.set(start + 12 * DAY);
  value(api.kernel.create('parts', { name: 'Kept on day twelve' }, { actor: 'p_2' }));
  clock.set(start + 13 * DAY);
  value(api.kernel.create('parts', { name: 'Kept on day thirteen' }, { actor: owner.principal.id }));
  assert.equal(usedOf(sql).days, PEN_USE_DAYS);
  assert.equal(youngOf(usedOf(sql), start + 13 * DAY), 'weeks');
  assert.equal(youngOf(usedOf(sql), start + PEN_YOUNG_DAYS * DAY), null);
  sql.close();
});

test('A LIST ONLY THE AUTOMATIONS KEEP IS OFFERED NO PAGE, as the nightly Snapshots are (kept_by: automations)', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const NIGHTS = { ...BINS, id: 'register.nights', body: { id: 'nights', name: 'Nights', title: 'name', kept_by: 'automations', fields: [{ id: 'name', type: 'text', required: true }] } } as never;
  value(await api.kernel.install([BINS, NIGHTS]));
  value(api.kernel.create('bins', { name: 'Top shelf' }, { actor: 'p_1' }));
  value(api.kernel.create('nights', { name: '29 Oct' }, { actor: 'p_1' }));
  const { pen } = await bootOf(api, owner);
  assert.deepEqual(pen.map((i) => i.id), ['page:bins']);
  assert.equal(code(await api.kernel.install([{ ...BINS, body: { ...BINS.body as object, kept_by: 'people' } } as never])), 'DECLARATION_INVALID');
});
