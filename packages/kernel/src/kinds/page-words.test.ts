/**
 * The page words the kernel learned for the app to draw: the `calendar`, `link`, `gallery` and `embed` kinds, a state's
 * count in a `{{path}}`, a column's label read as a heading is, and a roadmap over a list that names no columns.
 *
 * THE FOUR KINDS ARE REGISTERED HERE BEFORE THE KERNEL LOADS, where the registry does not hold them already, because
 * `declare.ts` and `block-keys.ts` build their lists from the registry when they load (`kinds/index.ts`). So only the
 * kind modules are imported before that line, and the kernel after it, as `test/kinds-registry.test.ts` does.
 *
 * EACH TEST DRIVES A REAL RECORD over `node:sqlite`, so the install check, the key closure and the read are the
 * kernel's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '../index.ts';
import type { PageBlock } from '../pages.ts';
import { fixedClock, openSqlite } from '../../test/sqlite.ts';
import { calendar } from './calendar.ts';
import { EMBED_PROVIDERS, embed } from './embed.ts';
import { gallery } from './gallery.ts';
import { BLOCK_KIND_MODULES } from './index.ts';
import { LINK_SAID, link } from './link.ts';

for (const [kind, module] of Object.entries({ calendar, link, gallery, embed })) BLOCK_KIND_MODULES[kind] ??= module;

const { openRecord } = await import('../index.ts');

/* TODAY IS 25 SEPTEMBER 2026 in UTC, so a calendar that says nothing shows July, August and September. */
const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = { actor: 'p_1' };

const list = (id: string, title: string, fields: unknown[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title, fields, ...more } as never,
});

const EVENTS = list('events', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'on', type: 'day' },
]);
const TASKS = list(
  'tasks',
  'what',
  [
    { id: 'what', type: 'text', required: true },
    { id: 'by', type: 'day' },
    { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
  ],
  { state: 'state', done: ['done'] },
);
const PARTS = list('parts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'photo', type: 'file' },
]);

const PHOTO = { sha256: 'a'.repeat(64), mime: 'image/png', bytes: 1024, name: 'front.png' };

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.events', 'register.tasks', 'register.parts'], blocks } as never,
});

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([EVENTS, TASKS, PARTS])).ok);
  for (const [what, on] of [
    ['Summer party', '2026-08-31'],
    ['Rent', '2026-09-03'],
    ['Review', '2026-10-15'],
    ['Stocktake', '2026-11-30'],
    ['Holiday', '2026-12-01'],
  ] as const)
    assert.ok(k.create('events', { what, on }, OWNER).ok);
  for (const [what, state] of [
    ['Glaze', 'open'],
    ['Fire', 'open'],
    ['Pack', 'done'],
  ] as const)
    assert.ok(k.create('tasks', { what, state }, OWNER).ok);
  assert.ok(k.create('parts', { name: 'Front', photo: PHOTO }, OWNER).ok);
  return { k, sql };
}

/** The refusal an install answered, or `null` when it installed. */
const refusalOf = (out: { ok: boolean }) => (!out.ok && 'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } }).refusal : null);

const block = (b: Record<string, unknown>): PageBlock => b as unknown as PageBlock;

const CALENDAR = { kind: 'calendar', heading: 'Coming up', source: 'register.events', columns: [{ field: 'what' }, { field: 'on' }] };

test('a calendar installs, and reads this month and the two before it, in day order, with the window it read', async () => {
  const { k, sql } = await record();
  assert.equal(refusalOf(await k.install([pageOf(CALENDAR)])), null, 'a calendar over a list was refused at install');
  const read = k.block(block(CALENDAR));
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(read.window, { from: '2026-07-01', to: '2026-09-30', today: '2026-09-25' });
  assert.deepEqual(
    read.rows.map((r) => r.fields.what),
    ['Summer party', 'Rent'],
  );
  assert.equal(read.matched, 2);

  /* `back: 0` STARTS ON THE FIRST OF THIS MONTH, and `ahead: 2` reaches the last day of November, not the first of December. */
  const later = k.block(block({ ...CALENDAR, back: 0, ahead: 2 }));
  assert.deepEqual(later.window, { from: '2026-09-01', to: '2026-11-30', today: '2026-09-25' });
  assert.deepEqual(
    later.rows.map((r) => r.fields.what),
    ['Rent', 'Review', 'Stocktake'],
  );
  sql.close();
});

test('a calendar takes whole months up to a year, no limit, and a day it can place its rows on', async () => {
  const { k, sql } = await record();
  const far = refusalOf(await k.install([pageOf({ ...CALENDAR, ahead: 13 })]));
  assert.equal(far?.code, 'OUT_OF_BOUNDS');
  assert.match(far?.at ?? '', /blocks\[0\]\.ahead$/u);

  const cut = refusalOf(await k.install([pageOf({ ...CALENDAR, limit: 5 })]));
  assert.equal(cut?.code, 'DECLARATION_INVALID');
  assert.match(cut?.at ?? '', /blocks\[0\]\.limit$/u);

  const one = refusalOf(await k.install([pageOf({ ...CALENDAR, columns: [{ field: 'what' }] })]));
  assert.equal(one?.code, 'DECLARATION_INVALID');
  assert.match(one?.fix ?? '', /names 1\.$/u);

  /* A TEXT FIELD AS THE DAY IS REFUSED AT READ, where the list is in hand, naming the fields that are days. */
  const words = k.block(block({ ...CALENDAR, columns: [{ field: 'on' }, { field: 'what' }] }));
  assert.equal(words.rows.length, 0);
  assert.equal(words.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.deepEqual(words.refusals[0]?.allowed, ['on']);
  sql.close();
});

test('an embed plays only the named players, and says which they are', async () => {
  const { k, sql } = await record();
  const played = pageOf({ kind: 'embed', heading: 'Walkthrough', authored: [{ cells: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Walkthrough', '16:9'] }] });
  assert.equal(refusalOf(await k.install([played])), null, 'a youtube address was refused');

  const elsewhere = refusalOf(await k.install([pageOf({ kind: 'embed', heading: 'Clip', authored: [{ cells: ['https://example.com/clip'] }] })]));
  assert.equal(elsewhere?.code, 'DECLARATION_INVALID');
  assert.match(elsewhere?.fix ?? '', /YouTube, Vimeo, Loom, Figma or Google Maps/u);
  assert.deepEqual(elsewhere?.allowed, EMBED_PROVIDERS.map((p) => p.name));
  assert.doesNotMatch(elsewhere?.fix ?? '', /example\.com/u, 'the address was repeated in the refusal');

  const read = refusalOf(await k.install([pageOf({ kind: 'embed', heading: 'Map', source: 'register.events' })]));
  assert.match(read?.at ?? '', /blocks\[0\]\.source$/u);
  sql.close();
});

test('each of the four installs bare, and its read says what it needs', async () => {
  /* THE INSTALL DECIDES NO KEY IS REQUIRED (`declare.ts`, and `declare.test.ts` installs every kind bare), so a block
     that names neither a list nor rows is told so when it is read. */
  const { k, sql } = await record();
  for (const kind of ['calendar', 'link', 'gallery', 'embed']) {
    /* A PAGE OF ITS OWN FOR EACH, so no install here is an edit of the one before it. */
    const bare: Declaration = { id: `page.bare-${kind}`, kind: 'page', body: { page: `bare-${kind}`, title: 'Bare', blocks: [{ kind, heading: 'Bare' }] } as never };
    assert.equal(refusalOf(await k.install([bare])), null, `a bare ${kind} was refused at install`);
    const read = k.block(block({ kind, heading: 'Bare' }));
    assert.equal(read.rows.length, 0);
    assert.equal(read.refusals[0]?.code, 'DECLARATION_INVALID', `a bare ${kind} read clean`);
  }
  sql.close();
});

test('a link written out is an address the renderer draws as one', async () => {
  const { k, sql } = await record();
  const inside = pageOf({ kind: 'link', heading: 'Handbook', authored: [{ cells: ['Handbook', '/p/handbook', 'How we work'] }] });
  assert.equal(refusalOf(await k.install([inside])), null, 'a path of this record was refused as a link');
  for (const address of ['//elsewhere.example/p', 'http://open.example', 'ftp://files.example']) {
    const said = refusalOf(await k.install([pageOf({ kind: 'link', heading: 'Out', authored: [{ cells: ['Out', address] }] })]));
    assert.equal(said?.fix, `page.desk.blocks[0]: ${LINK_SAID}`, `${address} was admitted as a link`);
  }
  sql.close();
});

test('a gallery answers each file as the record stores it, from a list or written out, and names the list it reads', async () => {
  const { k, sql } = await record();
  const over = k.block(block({ kind: 'gallery', source: 'register.parts', columns: [{ field: 'name' }, { field: 'photo' }] }));
  assert.deepEqual(over.refusals, []);
  assert.deepEqual(over.files, [PHOTO]);

  const written = block({ kind: 'gallery', authored: [{ cells: ['Front', 'file:parts#1/photo'] }, { cells: ['Gone', 'file:parts#9/photo'] }] });
  assert.deepEqual(k.block(written).files, [PHOTO, null]);
  assert.deepEqual(k.blockRegisters(written), ['parts'], 'a picture written out read a list its block did not name');

  const long = refusalOf(await k.install([pageOf({ kind: 'gallery', source: 'register.parts', columns: [{ field: 'name' }, { field: 'photo' }], limit: 25 })]));
  assert.equal(long?.code, 'OUT_OF_BOUNDS');
  sql.close();
});

test('a state of a list counts its rows, and a column label is filled as a heading is', async () => {
  const { k, sql } = await record();
  const said = k.block(block({ kind: 'note', body: '{{tasks.open}} open and {{tasks.done}} done, {{tasks.lost}} lost.' }));
  assert.deepEqual(said.values, { 'tasks.open': 2, 'tasks.done': 1 });
  assert.deepEqual(k.blockRegisters(block({ kind: 'note', body: '{{tasks.open}}' })), ['tasks']);

  const labelled = k.block(block({ kind: 'table', source: 'register.tasks', columns: [{ field: 'what', label: 'Open ({{tasks.open}})' }] }));
  assert.deepEqual(labelled.values, { 'tasks.open': 2 });
  sql.close();
});

test('a roadmap over a list that names no columns is refused, naming the three it needs', async () => {
  const { k, sql } = await record();
  const read = k.block(block({ kind: 'roadmap', heading: 'Plan', source: 'register.tasks' }));
  assert.equal(read.rows.length, 0);
  assert.equal(read.refusals[0]?.at, 'columns');
  assert.match(read.refusals[0]?.fix ?? '', /the title, the day each row is due by and its effort/u);

  const drawn = k.block(block({ kind: 'roadmap', heading: 'Plan', source: 'register.tasks', columns: [{ field: 'what' }, { field: 'by' }] }));
  assert.deepEqual(drawn.refusals, []);
  sql.close();
});
