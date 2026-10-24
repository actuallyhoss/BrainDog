/**
 * What the rail is drawn from on `boot` (`packages/record/src/index.ts`): each list's own glyph (`registers[].icon`) and
 * each page's frozen hue (`pages[].about.hue`), the whole degree its row holds in the field its list names as
 * `identity.accent`. So the shell draws the marks the record declares, and never guesses one from an id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    icon: 'thing',
    identity: { mark: 'mark', accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'mark', type: 'text' },
      { id: 'hue', type: 'int' },
    ],
  } as never,
};
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const PROJECT = {
  id: 'page.project',
  kind: 'page' as const,
  body: {
    page: 'project',
    title: '{{name}}',
    for: { register: 'things' },
    nav: { section: 'Projects', order: 10 },
    requires: ['register.things'],
    blocks: [{ kind: 'note', body: 'One project.' }],
  } as never,
};
const NOTE = {
  id: 'page.note',
  kind: 'page' as const,
  body: { page: 'note', title: '{{what}}', for: { register: 'notes' }, requires: ['register.notes'], blocks: [{ kind: 'note', body: 'One note.' }] } as never,
};
const NOTEBOOK = {
  id: 'page.notebook',
  kind: 'page' as const,
  body: { page: 'notebook', title: 'Notebook', requires: ['register.notes'], blocks: [{ kind: 'table', source: 'register.notes' }] } as never,
};

async function booted(): Promise<{ boot: Boot; listed: Boot['pages']; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([THINGS, NOTES, PROJECT, NOTE, NOTEBOOK]));
  for (const fields of [{ name: 'Kiln', mark: 'k', hue: 212 }, { name: 'Marlow', mark: 'm', hue: null }, { name: 'Odd', hue: 400 }])
    value(await api.create({ register: 'things', fields }, owner));
  value(await api.create({ register: 'notes', fields: { what: 'Ring the printer' } }, owner));
  return { boot: value<Boot>(await api.boot(owner)), listed: value<Boot['pages']>(await api.pages(owner)), close: () => sql.close() };
}

test("EACH LIST CARRIES THE GLYPH ITS DECLARATION NAMES, and null where it names none", async () => {
  const { boot, close } = await booted();
  const icons = Object.fromEntries(boot.registers.filter((r) => r.id === 'things' || r.id === 'notes').map((r) => [r.id, r.icon]));
  assert.deepEqual(icons, { things: 'thing', notes: null });
  close();
});

test("EACH PAGE OF A ROW CARRIES THE ROW'S FROZEN HUE: a whole degree on the wheel, else null, and a page somebody wrote is about nothing", async () => {
  const { boot, listed, close } = await booted();
  const hues = Object.fromEntries(boot.pages.filter((p) => p.about?.register === 'things').map((p) => [p.title, p.about!.hue]));
  assert.deepEqual(hues, { Kiln: 212, Marlow: null, Odd: null }, 'Marlow holds no hue, and 400 is not a colour on the wheel');
  assert.equal(boot.pages.find((p) => p.slug === 'notebook')?.about, null);
  /* A LIST THAT NAMES NO ACCENT HAS NO COLOUR TO SEND, so its pages carry no `hue` key at all. A note's page has no
     place in the rail, so `boot` opens it by the row (`pagesByRow`) and `pages` lists it. */
  assert.ok(boot.pagesByRow?.includes('notes'), JSON.stringify(boot.pagesByRow));
  const note = listed.find((p) => p.about?.register === 'notes')?.about;
  assert.ok(note && !('hue' in note), 'the note page is about its row and says nothing of a hue');
  close();
});
