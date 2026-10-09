/**
 * A row's own values inside its own page (PGS-B03): on a page about a row, one word is that row's field when its list
 * declares one, else a figure, and `<field>.count` counts a list field of the row. A long field stays unavailable.
 *
 * WHAT WAS MEASURED BEFORE IT: on the owner's record `{{blockers.count}}` printed as a hole on every project page,
 * because `blockers` is a field of the project and the path was read as a list called blockers. And `{{money:price}}`
 * read a figure called price, never the row's price, because only a bare `{{field}}` is filled from the row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'stage', type: 'text' },
      { id: 'price', type: 'money' },
      { id: 'blockers', type: 'list', of: 'text' },
      { id: 'notes', type: 'document' },
    ],
  },
};

/* A FIGURE THAT SHARES A FIELD'S NAME, which is the risk the change carries: on a project page the field wins. */
const PRICE: Declaration = {
  id: 'metric.price',
  kind: 'metric',
  body: { metric: 'price', name: 'Price', source: 'register.things', value: { count: 'name' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const BODY = 'Stage: {{stage}}. {{blockers.count}} in the way. Sells at {{money:price}}. {{notes}}';

const PROJECT_PAGE: Declaration = {
  id: 'page.project',
  kind: 'page',
  body: { page: 'project', title: '{{name}}', for: { register: 'things' }, requires: ['register.things'], blocks: [{ kind: 'note', body: BODY }] } as never,
};

const DESK: Declaration = {
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.things'], blocks: [{ kind: 'note', body: '{{money:price}} {{blockers.count}}' }] } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS, PRICE, PROJECT_PAGE, DESK]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('things', { name: 'Kiln', stage: 'Building', price: egp(135_000), blockers: ['Kiln permit', 'Clay supplier'], notes: 'A long paragraph.' }, OWNER).ok);
  assert.ok(k.create('things', { name: 'Portage' }, OWNER).ok);
  return { k, sql };
}

type Note = { body?: string; values?: Record<string, unknown>; unnamed?: string[] };
const noteOf = (k: Kernel, slug: string): Note => {
  const out = k.page(slug);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.blocks[0] as Note;
};

test('ON A PROJECT’S PAGE ITS OWN FIELDS ANSWER: the stage, how many blockers, and its price before a figure of that name', async () => {
  const { k, sql } = await record();
  const note = noteOf(k, 'kiln');
  assert.match(note.body ?? '', /^Stage: Building\./, 'the template fills a bare field as it always has');
  assert.deepEqual(note.values, { 'blockers.count': 2, price: egp(135_000) });
  assert.equal(note.unnamed, undefined, 'a field of the row was read as a word nobody knows');
  sql.close();
});

test('a project holding nothing in a field draws the dash, and no blockers is nought', async () => {
  const { k, sql } = await record();
  const note = noteOf(k, 'portage');
  assert.deepEqual(note.values, { 'blockers.count': 0 });
  assert.equal(note.unnamed, undefined, 'an empty field of the row was read as the author’s typo');
  sql.close();
});

test('a long field stays unavailable: named, never its contents', async () => {
  const { k, sql } = await record();
  const note = noteOf(k, 'kiln');
  assert.ok(!('notes' in (note.values ?? {})), 'a document was answered as a figure');
  assert.ok(!(note.unnamed ?? []).includes('notes'));
  sql.close();
});

test('on a page about no row the words read as they always have: a figure, and a list’s count', async () => {
  const { k, sql } = await record();
  const note = noteOf(k, 'desk');
  /* `price` is the figure (two projects), and `blockers` names no list, so its count is a word nobody knows. */
  assert.deepEqual(note.values, { price: 2 });
  assert.deepEqual(note.unnamed, ['blockers.count']);
  sql.close();
});

test('the page read names the zone its day is read in, so text drawn off the browser names the record’s day', async () => {
  const { k, sql } = await record();
  for (const slug of ['kiln', 'desk', 'no-such-page']) {
    const out = k.page(slug);
    if (out.ok) assert.equal(out.value.zone, 'UTC', slug);
  }
  sql.close();
});
