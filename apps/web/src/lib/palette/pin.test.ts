/**
 * Pin an answer: what Slash answered in the palette, as the block a page keeps, and the one write that puts it there.
 *
 * AGAINST A REAL KERNEL over `node:sqlite`, with the HTTP envelope written here as `bind-write.test.ts` writes it. The
 * record has a Tasks list, a Work page that reads it, and a Today page (`home`) that does not: Today is where a person
 * pins first, and it is the page "Put this on a page" never offered, because it does not require the list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import type { Reading } from '@braindog/client';

import { words as bindWords } from '../record/bind-write.ts';
import { listName } from '../record/names.ts';
import { setBody } from '../record/page-write.ts';
import type { Fetch } from '../record/pages-live.ts';
import { pinBlock, pinSheet, pinTo, pinnable, words } from './pin.ts';

const BASE = 'http://record.test';
const CLOCK = Date.UTC(2026, 9, 14, 9);

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => CLOCK });
  const put = await k.install([
    {
      id: 'register.tasks',
      kind: 'register',
      body: {
        id: 'tasks',
        name: 'Tasks',
        one: 'task',
        title: 'what',
        state: 'state',
        done: ['done'],
        fields: [
          { id: 'what', type: 'text' },
          { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
        ],
      },
    } as never,
    { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'who', fields: [{ id: 'who', type: 'text' }] } } as never,
    {
      id: 'page.work',
      kind: 'page',
      body: { page: 'work', title: 'Work', requires: ['register.tasks'], blocks: [{ kind: 'table', source: 'register.tasks', columns: [{ field: 'what' }] }] },
    } as never,
    {
      id: 'page.home',
      kind: 'page',
      body: { page: 'home', title: 'Today', requires: ['register.bills'], blocks: [{ kind: 'table', heading: 'Bills', source: 'register.bills', columns: [{ field: 'who' }] }] },
    } as never,
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  for (const [what, state] of [['Sand the shelf', 'open'], ['Oil the hinge', 'open'], ['Buy screws', 'done']] as const)
    assert.ok(k.create('tasks', { what, state }, { actor: 'p_1' }).ok);
  return k;
}

const versionOf = (k: Kernel, slug: string): number | undefined => k.declarations().find((d) => d.id === `page.${slug}`)?.version;

/** The record's routes this file needs, over the real kernel, and every method asked in order. */
function served(k: Kernel): { io: Fetch; asked: string[] } {
  const asked: string[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    asked.push(method);
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    if (method === 'pages') return json(200, { ok: true, value: k.pages().map((p) => ({ slug: p.slug, title: p.title })) });
    if (method === 'page') {
      const slug = String(args.slug);
      const out = k.page(slug);
      if (!out.ok) return json(404, out);
      const version = versionOf(k, slug);
      return json(200, { ok: true, value: { ...out.value, ...(version === undefined ? {} : { declared_version: version }) } });
    }
    if (method === 'schema') {
      const decl = k.register(String(args.register));
      return decl ? json(200, { ok: true, value: decl }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No such list.' } });
    }
    if (method === 'setDeclaration') {
      const body = args.body as { page: string };
      const id = `page.${body.page}`;
      const expect = typeof args.version === 'number' ? { id, version: args.version } : undefined;
      const out = await k.install([{ id, kind: 'page', body } as never], expect, { actor: 'p_1' });
      return json(out.ok ? 200 : 'conflict' in out ? 409 : 400, out);
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return { io, asked };
}

const stored = (k: Kernel, slug: string) => JSON.parse(k.declarations().find((d) => d.id === `page.${slug}`)!.body) as { requires: string[]; blocks: Record<string, unknown>[] };

/** A reading as the engine answers one, over invented rows. */
const reading = (over: Partial<Reading> = {}): Reading => ({
  ask_id: 'ask_1',
  predicate: { field: 'state', is: 'open' },
  q: null,
  read: [{ register: 'tasks', rows: 2, predicate: '{"field":"state","is":"open"}' }],
  rows: [
    { id: 'r1', register: 'tasks', seq: 1, spoken: 'tasks#1', summary: 'tasks#1 | Sand the shelf | open', fields: {} },
    { id: 'r2', register: 'tasks', seq: 2, spoken: 'tasks#2', summary: 'tasks#2 | Oil the hinge | open', fields: {} },
  ],
  ...over,
});

/* ── what an answer pins as ── */

test('AN ANSWER OVER ONE LIST PINS AS A TABLE OF THAT LIST AND FILTER, headed by what was asked', () => {
  const p = pinnable(reading(), 'what is open');
  assert.deepEqual(p, { kind: 'rows', register: 'tasks', predicate: 'state is open', heading: 'What is open' });
  if (p?.kind !== 'rows') return;
  const block = pinBlock(p, CLOCK);
  assert.equal(block.kind, 'table');
  assert.equal(block.source, 'register.tasks');
  assert.equal(block.where, 'state is open');
  assert.equal(block.heading, 'What is open');
});

test('ROWS OF TWO LISTS ARE NOT PINNABLE AS ROWS: nothing to pin, or the prose as a note', () => {
  const two = reading({ rows: [...reading().rows, { id: 'r9', register: 'bills', seq: 1, spoken: 'bills#1', summary: 'bills#1 | Plumber', fields: {} }] });
  assert.equal(pinnable(two, 'what is open'), null);
  assert.deepEqual(pinnable(two, 'what is open', 'Two jobs and a bill wait.'), { kind: 'note', text: 'Two jobs and a bill wait.' });
});

test('A SEARCH THAT IS NOT A FILTER IS REFUSED in the sentence "Put this on a page" gives', () => {
  const fix = bindWords.searchNotKept(listName('tasks'));
  assert.deepEqual(pinnable(reading({ predicate: null, q: 'shelf' }), 'shelf'), { kind: 'refused', fix });
  assert.deepEqual(pinnable(reading({ predicate: { all: [{ field: 'state', is: 'open' }, { matches: 'shelf' }] } }), 'open shelf'), { kind: 'refused', fix });
});

test('PROSE PINS AS A NOTE HOLDING THE TEXT, THE DAY AND {inferred}', () => {
  const p = pinnable(null, 'why is it slow', 'Most of the week went on one job.');
  assert.deepEqual(p, { kind: 'note', text: 'Most of the week went on one job.' });
  if (p?.kind !== 'note') return;
  assert.deepEqual(pinBlock(p, CLOCK), { kind: 'note', span: 12, heading: 'Pinned 14 Oct 2026', body: 'Most of the week went on one job. {inferred}' });
  assert.equal(pinnable(null, 'why', '   '), null);
});

/* ── the write ── */

test('PINNED TO TODAY: one page write, the list added to what Today requires, the rows read live, and Undo puts it back', async () => {
  const k = await record();
  const { io, asked } = served(k);
  const sheet = await pinSheet(BASE, 'tasks', null, io);
  assert.equal(sheet.from, 'live', JSON.stringify(sheet));
  if (sheet.from !== 'live') return;
  /* TODAY FIRST, and every page, including the one that does not read Tasks yet. */
  assert.deepEqual(sheet.pages.map((p) => p.title), ['Today', 'Work']);
  assert.equal(sheet.name, 'Tasks');

  const p = pinnable(reading(), 'what is open');
  assert.ok(p && p.kind === 'rows');
  asked.length = 0;
  const out = await pinTo(BASE, sheet.pages[0]!, p, CLOCK, io, sheet.declared);
  assert.equal(out.from, 'written', JSON.stringify(out));
  assert.equal(asked.filter((m) => m === 'setDeclaration').length, 1);

  const body = stored(k, 'home');
  assert.deepEqual(body.requires, ['register.bills', 'register.tasks']);
  assert.deepEqual(body.blocks[0], { kind: 'table', heading: 'Bills', source: 'register.bills', columns: [{ field: 'who' }] });
  const page = k.page('home');
  assert.ok(page.ok, JSON.stringify(page));
  if (!page.ok) return;
  const pinned = page.value.blocks[1]!;
  assert.equal(pinned.heading, 'What is open');
  assert.deepEqual(pinned.rows.map((r) => r.fields.what).sort(), ['Oil the hinge', 'Sand the shelf']);
  assert.deepEqual(pinned.refusals ?? [], []);

  /* LIVE: a task opened after the pin is on Today the next time it is read. */
  assert.ok(k.create('tasks', { what: 'Paint the door', state: 'open' }, { actor: 'p_1' }).ok);
  const again = k.page('home');
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.equal(again.value.blocks[1]!.rows.length, 3);

  if (out.from !== 'written') return;
  const back = await setBody(BASE, out.before, io, out.version);
  assert.equal(back.from, 'written', JSON.stringify(back));
  assert.deepEqual(stored(k, 'home').requires, ['register.bills']);
  assert.equal(stored(k, 'home').blocks.length, 1);
});

test('A PAGE THAT READS THE LIST ALREADY keeps its requires as they were, and a note goes on any page and requires nothing', async () => {
  const k = await record();
  const { io, asked } = served(k);
  const sheet = await pinSheet(BASE, 'tasks', null, io);
  assert.ok(sheet.from === 'live');
  const work = sheet.pages.find((p) => p.slug === 'work')!;
  asked.length = 0;
  const out = await pinTo(BASE, work, { kind: 'rows', register: 'tasks', predicate: 'state is open', heading: 'Open' }, CLOCK, io, sheet.declared);
  assert.equal(out.from, 'written', JSON.stringify(out));
  assert.equal(asked.filter((m) => m === 'setDeclaration').length, 1);
  assert.deepEqual(stored(k, 'work').requires, ['register.tasks']);

  const notes = await pinSheet(BASE, null, null, io);
  assert.ok(notes.from === 'live');
  const noted = await pinTo(BASE, notes.pages[0]!, { kind: 'note', text: 'One job is slow.' }, CLOCK, io);
  assert.equal(noted.from, 'written', JSON.stringify(noted));
  const body = stored(k, 'home');
  assert.deepEqual(body.requires, ['register.bills']);
  assert.deepEqual(body.blocks[1], { kind: 'note', span: 12, heading: 'Pinned 14 Oct 2026', body: 'One job is slow. {inferred}' });
});

test('A PAGE THAT CHANGED UNDER THE SHEET IS REFUSED in the sheet\'s words, and nothing is written', async () => {
  const k = await record();
  const { io, asked } = served(k);
  const sheet = await pinSheet(BASE, 'tasks', null, io);
  assert.ok(sheet.from === 'live');
  const today = { ...sheet.pages[0]!, drawn: 0, spans: [] };
  asked.length = 0;
  const out = await pinTo(BASE, today, { kind: 'rows', register: 'tasks', predicate: 'state is open', heading: 'Open' }, CLOCK, io);
  assert.deepEqual(out, { from: 'refused', fix: bindWords.moved });
  assert.equal(asked.includes('setDeclaration'), false);
  assert.equal(words.pinned('Today'), 'Pinned to Today.');
});
