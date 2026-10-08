/**
 * `pages` says the hue a page's row wears, exactly as `boot` does.
 *
 * TWO READS OF ONE LIST DISAGREED. `boot` sends each page with the row it grew out of and, where that row's list names an
 * accent (`identity.accent`), the whole degree the row holds, so a project's entry in the rail wears its mark. The
 * separate `pages` read sent the row and left the hue behind, so a screen that listed pages from it (Settings > Pages)
 * drew the same project with no colour. The rule is one rule now, and these tests hold the two reads to each other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const template = (list: string, section: string) =>
  decl('page', list, { page: list, title: '{{name}}', for: { register: list }, nav: { section, order: 10 }, requires: [`register.${list}`], blocks: [{ kind: 'note', body: 'About {{name}}' }] });

const DECLS = [
  /* A LIST THAT NAMES AN ACCENT, and one that names none. */
  decl('register', 'projects', {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    identity: { accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'hue', type: 'int', min: 0, max: 359 },
    ],
  }),
  decl('register', 'clients', { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('register', 'notes', { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] }),
  template('projects', 'Projects'),
  template('clients', 'Clients'),
  decl('page', 'desk', { page: 'desk', title: 'Desk', nav: { section: 'Work', order: 1 }, requires: ['register.notes'], blocks: [{ kind: 'table', source: 'register.notes' }] }),
];

type About = { register: string; seq: number | null; updated_at?: string; hue?: number | null } | null;
type Page = { slug: string; title: string; about?: About };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.create({ register: 'projects', fields: { name: 'Kiln', hue: 210 } }, owner));
  value(await api.create({ register: 'projects', fields: { name: 'Portage', hue: null } }, owner));
  value(await api.create({ register: 'clients', fields: { name: 'Marrow & Co' } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'Ring the printer' } }, owner));
  return { sql, api };
}

const byTitle = (pages: Page[]): Record<string, About | undefined> => Object.fromEntries(pages.map((p) => [p.title, p.about]));

test('pages SAYS THE HUE A PAGE\'S ROW WEARS: a degree where the row holds one, null where it holds none, and no key where its list names no accent', async () => {
  const { sql, api } = await record();
  const pages = byTitle(value<Page[]>(await api.pages(owner)));
  assert.deepEqual(pages.Kiln, { register: 'projects', seq: 1, hue: 210 });
  assert.deepEqual(pages.Portage, { register: 'projects', seq: 2, hue: null });
  assert.deepEqual(pages['Marrow & Co'], { register: 'clients', seq: 1 }, 'a list with no accent has no colour to wear, so the key is left off');
  assert.equal(pages.Desk, null);
  sql.close();
});

test('AND IT IS THE HUE boot SENDS, page for page', async () => {
  const { sql, api } = await record();
  const listed = byTitle(value<Page[]>(await api.pages(owner)));
  const booted = byTitle(value<{ pages: Page[] }>(await api.boot(owner)).pages);
  for (const title of ['Kiln', 'Portage', 'Marrow & Co']) {
    const a = listed[title];
    const b = booted[title];
    assert.ok(a && b, title);
    assert.equal(Object.hasOwn(a, 'hue'), Object.hasOwn(b, 'hue'), title);
    assert.equal(a.hue, b.hue, title);
    assert.deepEqual([a.register, a.seq], [b.register, b.seq], title);
  }
  sql.close();
});

test('AND A MEMBER WHO CANNOT READ PROJECTS IS SENT NO PAGE ABOUT ONE, so no hue of a row she could not see', async () => {
  const { sql, api } = await record();
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  assert.deepEqual(
    value<Page[]>(await api.pages(wren)).map((p) => [p.slug, p.about]),
    [['desk', null]],
  );
  sql.close();
});
