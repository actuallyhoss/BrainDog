/**
 * The declarations, the pages and the row names a live tab reads are
 * the record's, kept in `held.ts`, and no screen reads the sample's clock.
 *
 * WHAT WAS WRONG, MEASURED ON THE CODE BEFORE THIS CHANGE. A record whose projects are Harbour Lane and Tidewater was
 * asked `thing is Harbour Lane` and the sentence was refused, "thing is Harbour Lane: thing has no value Harbour Lane",
 * because `where.ts` looked the title up among the sample's four projects. The same chip went to the record as the
 * characters `Harbour Lane`, and `thing is Kiln` went as `01JLIVEHARBOURLANE0000000A`, the ULID of the record's row #1,
 * because Kiln is the sample's row #1: a filter naming a project this record has never held opened a real project's
 * rows. The new-row form offered the sample's projects as the rows a ref could point at. `learn` wrote into `data.ts`'s
 * table, so the only place a live declaration could be kept was the sample's module. The audit log named a record's
 * `page.money` with the sample's title. And thirteen shipped files read the seed's frozen clock, 3 September 2026 at
 * noon, as today.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* THE SAMPLE'S DECLARATIONS PUT WHERE A LIVE TAB KEEPS THE RECORD'S, which the fixture once did by itself. */
import './fixtures/fill.ts';
import * as api from './api.ts';
import { forget, readBoot, type Fetch } from './boot-live.ts';
import * as held from './held.ts';
import { learn, refMapOf, treeOf, type RecordRow } from './remote.ts';
import { compile } from './where.ts';

/* THE RECORD'S PROJECTS, and not one of them is a name the sample holds. */
const LIVE: RecordRow[] = [
  { id: '01JLIVEHARBOURLANE0000000A', seq: 1, fields: { name: 'Harbour Lane' }, version: 1, created_at: '2026-09-20T10:00:00Z' },
  { id: '01JLIVETIDEWATER00000000B', seq: 2, fields: { name: 'Tidewater' }, version: 1, created_at: '2026-09-20T10:00:00Z' },
];

test('the declarations `learn` keeps are the table every reader reads, and `held.ts` loads no sample', async () => {
  assert.equal(api.REGISTERS, held.REGISTERS, 'the mock and the live readers hold two tables, so a learnt list is on half the screens');
  const said = { name: 'Club books', one: 'club book', title: 'title', fields: [{ id: 'title', type: 'text' }] };
  await learn(async () => ({ ok: true, value: said }), 'club_books', new Map());
  assert.equal(held.REGISTERS.club_books?.name, 'Club books');
  const imports = readFileSync(new URL('./held.ts', import.meta.url), 'utf8').match(/^import .*$/gmu) ?? [];
  assert.deepEqual(imports.filter((line) => !line.startsWith('import type ')), [], 'held.ts imports something that is not a type');
});

test("a ref is named by the record's rows once a reader has walked them, and never by the sample's", () => {
  const refs = new Map([['things', refMapOf('things', LIVE)]]);
  assert.deepEqual(compile('services', 'thing is Harbour Lane').bad, [], "the record's own project was refused");
  assert.notDeepEqual(compile('services', 'thing is Kiln').bad, [], "the sample's project was accepted on a record that has none");
  const ask = (said: string) => treeOf('services', [{ field: 'thing', op: 'in', values: [said] }], '', refs);
  assert.deepEqual(ask('Harbour Lane'), { field: 'thing', is: '01JLIVEHARBOURLANE0000000A' });
  assert.deepEqual(ask('Kiln'), { field: 'thing', is: 'Kiln' }, "a sample title went over as the ULID of the record's row with the same number");
  assert.deepEqual(held.refOptions('things'), [
    { value: 1, label: 'Harbour Lane' },
    { value: 2, label: 'Tidewater' },
  ]);
  /* A ROW WITH NO NAME IS ITS KIND AND NUMBER, never the id an agent passes (`things#3`). */
  refMapOf('things', [...LIVE, { id: '01JLIVEUNNAMED0000000000C', seq: 3, fields: {}, version: 1, created_at: '2026-09-20T10:00:00Z' }]);
  assert.deepEqual(held.refOptions('things').at(-1), { value: 3, label: 'Project #3' });
  refMapOf('things', LIVE);
});

test("a page looked up by its slug is called what the record's `boot` calls it, not what the sample called it", async () => {
  assert.equal(held.PAGES.money?.title, 'Money', 'the sample no longer calls its money page Money, so this test proves nothing');
  forget();
  const body = { registers: [], now: '2026-09-25T12:00:00.000Z', pages: [{ slug: 'money', title: 'Cash and bills', nav: null, icon: null }] };
  const io = (async () => new Response(JSON.stringify({ ok: true, value: body }), { status: 200, headers: { 'content-type': 'application/json' } })) as Fetch;
  assert.equal((await readBoot('http://record.test/app', io)).from, 'live');
  forget();
  assert.equal(held.PAGES.money?.title, 'Cash and bills', "the audit log names this record's money page with the sample's title");
});

/* COMMENTS ARE LEFT OUT, so a paragraph saying where the sample used to be is not a read of it. */
const code = (path: string): string =>
  readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, '');

const SRC = fileURLToPath(new URL('../../', import.meta.url));
function shipped(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : shipped(path);
    return /\.(ts|svelte)$/u.test(name) && !/\.test\.ts$/u.test(name) ? [path] : [];
  });
}
/* EVERYTHING `shipped` WALKS SHIPS AND READS THE RECORD. The fixture module was the one exemption until it moved
   under `fixtures/`, which `shipped` does not walk; `api.ts` was the second until its readers left it. */
const imported = (source: string, name: string): boolean =>
  new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'[^']*/(api|data)\\.ts'`, 'u').test(source);

test("no shipped file reads the sample's clock, its declarations or its row names from the fixtures", () => {
  const offenders: string[] = [];
  for (const path of shipped(SRC)) {
    const at = relative(SRC, path).replaceAll('\\', '/');
    const source = code(path);
    for (const name of ['NOW', 'TODAY', 'REGISTERS', 'PAGES']) if (imported(source, name)) offenders.push(`${at} ${name}`);
  }
  for (const at of ['lib/record/where.ts', 'lib/record/remote.ts', 'lib/ui/RowForm.svelte'])
    if (imported(code(join(SRC, at)), 'ROWS')) offenders.push(`${at} ROWS`);
  assert.deepEqual(offenders, []);
});

test('a picker leaves out a row its own list calls finished, and keeps the one a form already points at', () => {
  const accounts = held.REGISTERS.accounts!;
  assert.equal(accounts.state, 'state');
  assert.ok(accounts.done?.includes('closed'), 'accounts has no finished state to leave out');
  const row = (seq: number, name: string, state?: string): RecordRow => ({ id: `01JLIVEACCOUNT00000000000${seq}`, seq, fields: { name, ...(state ? { state } : {}) }, version: 1, created_at: '2026-09-20T10:00:00Z' });
  refMapOf('accounts', [row(1, 'Card'), row(2, 'Old card', 'closed'), row(3, 'Savings', 'open')]);
  assert.deepEqual(held.refOptions('accounts').map((o) => o.label), ['Card', 'Savings']);
  assert.deepEqual(held.refOptions('accounts', 2).map((o) => o.label), ['Card', 'Old card', 'Savings']);
  /* THE NAME IS STILL KNOWN, so an entry on the closed account is drawn by its name. */
  assert.equal(held.TITLES.get('accounts')?.get(2), 'Old card');
  refMapOf('accounts', []);
});
