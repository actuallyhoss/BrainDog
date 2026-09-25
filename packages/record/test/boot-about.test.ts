/**
 * `boot` says which row a page grew out of (M4 wave two brief 5, its rider).
 *
 * THE RAIL'S CAP READ A KEY NOBODY SENT. `apps/web/src/lib/record/boot-live.ts` caps a list's pages per heading with
 * `railRoom`, the kernel's own rule, and the cap is keyed on `about`: the list a template expanded over. The kernel's
 * page list carries it and `@braindog/client` types it on the answer, but `boot` copied each page key by key into its
 * shell and left `about` behind, so on a live record the cap was never asked. Measured on his own record at 27
 * projects, 23 services and 22 skills: 72 of 72 rail pages arrived with no `about`, and the rail drew 72 entries
 * where the sample, which has the key, draws 15.
 *
 * `about` SAYS NOTHING THE PAGE DID NOT. `boot` lists a page made for a row only to somebody who reads that row's list
 * (`seesPage`), and its title is that row's title already. The last test holds that line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields } as never,
});
const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;

const DECLS = [
  reg('projects', 'Projects', 'name', [{ id: 'name', type: 'text', required: true }]),
  reg('notes', 'Notes', 'body', [{ id: 'body', type: 'text', required: true }]),
  /* ONE PAGE PER PROJECT, IN THE RAIL, which is the shape of the shipped seed's project pages. */
  decl('page', 'project', {
    page: 'project',
    title: '{{name}}',
    for: { register: 'projects' },
    nav: { section: 'Projects', order: 10 },
    requires: ['register.projects'],
    blocks: [{ kind: 'note', body: 'About {{name}}' }],
  }),
  /* AND A PAGE SOMEBODY WROTE, which is about no row. */
  decl('page', 'desk', { page: 'desk', title: 'Desk', nav: { section: 'Work', order: 1 }, requires: ['register.notes'], blocks: [{ kind: 'table', source: 'register.notes' }] }),
];

type Page = { slug: string; title: string; about?: { register: string; seq: number | null; updated_at?: string } | null };

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
  value(await api.create({ register: 'projects', fields: { name: 'Kiln' } }, owner));
  value(await api.create({ register: 'projects', fields: { name: 'Portage' } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'Ring the printer' } }, owner));
  return { sql, api };
}

test('A PAGE EXPANDED ACROSS TWO PROJECTS IS TWO PAGES IN boot, EACH SAYING WHICH PROJECT IT IS ABOUT', async () => {
  const { sql, api } = await record();
  const pages = value<{ pages: Page[] }>(await api.boot(owner)).pages;
  /* MATCHED BY TITLE RATHER THAN BY POSITION, and each carries when its row last changed, which picks the rail's five. */
  const projects = pages.filter((p) => p.slug !== 'desk').sort((a, b) => a.title.localeCompare(b.title));
  assert.deepEqual(
    projects.map((p) => [p.title, p.about]),
    [
      ['Kiln', { register: 'projects', seq: 1, updated_at: new Date(NOW).toISOString() }],
      ['Portage', { register: 'projects', seq: 2, updated_at: new Date(NOW).toISOString() }],
    ],
  );
  /* A PAGE SOMEBODY WROTE IS ABOUT NO ROW, and says so with `null` rather than leaving the key off, so the shell can tell
     a host that sends the field from one older than it. */
  assert.equal(pages.find((p) => p.slug === 'desk')?.about, null);
  sql.close();
});

test('AND A MEMBER WHO CANNOT READ PROJECTS IS SENT NO PAGE ABOUT ONE, so the key names no row she could not see', async () => {
  const { sql, api } = await record();
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const pages = value<{ pages: Page[] }>(await api.boot(wren)).pages;
  assert.deepEqual(
    pages.map((p) => [p.slug, p.about]),
    [['desk', null]],
  );
  sql.close();
});
