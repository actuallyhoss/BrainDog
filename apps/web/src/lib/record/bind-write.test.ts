/**
 * `Put this on a page` on a live record: the block the sheet describes, written onto a page the record holds, and taken
 * off again by the toast's Put back (loop/research-m4-wave-two.md brief 1).
 *
 * WHAT WAS THERE BEFORE. `BindBlock.svelte` offered the fixture's pages (`pages()` over the built-in sample) and called
 * `onbind`, and both callers answered with a warning toast saying nothing was written. On a live record that sheet named
 * the fictional studio's pages as destinations and put nothing anywhere.
 *
 * AGAINST A REAL KERNEL over `node:sqlite`, as `field-write.test.ts` installs its fields. Only the HTTP envelope is
 * written here, because `@braindog/record` is not a dependency of this app: `page` carries `declared_version` the way the
 * record adds it (`pageDeclaredAt`), and `setDeclaration` is the kernel's `install` against that version, which is what
 * the record's handler does once `normalise` has read the body.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import { copy } from '../copy.ts';
import { bindTo, boundBlock, liveSheet, words } from './bind-write.ts';
import { pageReader } from './page-live.ts';
import { setBody } from './page-write.ts';
import type { Fetch } from './pages-live.ts';

const BASE = 'http://record.test';
const CLOCK = Date.UTC(2026, 8, 24, 9);

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

/**
 * A record with a Tasks list of three rows, a Work page over it holding one block, and a Money page that does not
 * require it. Money is there so that "every page" and "the pages that require Tasks" are different answers.
 */
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
        /* THE SECRET IS DECLARED SECOND, straight after the title, so a kind that took the fields in order without leaving
           it out would take it. Declared last it sat past the three columns a table takes, and the secret check below
           passed with the secret filter deleted. */
        fields: [
          { id: 'what', type: 'text' },
          { id: 'secret_note', type: 'secret' },
          { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
          { id: 'by', type: 'day' },
        ],
      },
    } as never,
    { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'who', fields: [{ id: 'who', type: 'text' }] } } as never,
    {
      id: 'page.work',
      kind: 'page',
      body: {
        page: 'work',
        title: 'Work',
        requires: ['register.tasks'],
        blocks: [{ kind: 'table', heading: 'Done', source: 'register.tasks', where: 'state is done', columns: [{ field: 'what' }] }],
      },
    } as never,
    {
      id: 'page.money',
      kind: 'page',
      body: { page: 'money', title: 'Money', requires: ['register.bills'], blocks: [{ kind: 'table', source: 'register.bills', columns: [{ field: 'who' }] }] },
    } as never,
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  for (const [what, state] of [['Glaze the jugs', 'open'], ['Fire the kiln', 'open'], ['Order clay', 'done']] as const)
    assert.ok(k.create('tasks', { what, state }, { actor: 'p_1' }).ok);
  return k;
}

/** The version the record holds a page at, as `pageDeclaredAt` reads it. */
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
    if (method === 'list') return json(200, k.list({ register: String(args.register), limit: Number(args.limit ?? 50) } as never));
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

const blocksOf = (k: Kernel, slug: string) => {
  const out = k.page(slug);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.blocks;
};

/* ── the brief's red ── */

test('A BOUND BLOCK LANDS ON A PAGE THAT REQUIRES ITS LIST, the page draws its rows, and Put back takes it off', async () => {
  const k = await record();
  const { io } = served(k);

  const sheet = await liveSheet(BASE, 'tasks', io);
  assert.equal(sheet.from, 'live', JSON.stringify(sheet));
  if (sheet.from !== 'live') return;
  /* THE RECORD'S PAGES, AND ONLY THE ONES THAT READ TASKS. The sample would have offered the studio's. */
  assert.deepEqual(sheet.destinations.map((d) => d.slug), ['work']);
  assert.equal(sheet.name, 'Tasks');
  const work = sheet.destinations[0]!;
  assert.equal(work.drawn, 1);

  const block = boundBlock('tasks', 'state is open', 'table', 'Open', sheet.declared);
  const out = await bindTo(BASE, work, block, io);
  assert.equal(out.from, 'written', JSON.stringify(out));
  if (out.from !== 'written') return;

  const after = blocksOf(k, 'work');
  assert.equal(after.length, 2);
  const added = after[1]!;
  assert.equal(added.heading, 'Open');
  assert.equal(added.where, 'state is open');
  assert.deepEqual(added.rows.map((r) => r.fields.what).sort(), ['Fire the kiln', 'Glaze the jugs']);
  assert.deepEqual(added.refusals ?? [], [], 'the record drew the block with a refusal on it');

  /* AND THE APP DRAWS IT WITH CELLS IN IT. The kernel answers rows for a block with no columns, and the app then draws
     each row as nothing, so the rows reaching the kernel's answer is not the rows reaching the screen. */
  const drawn = await pageReader(BASE, io, () => CLOCK).read('work');
  assert.equal(drawn.from, 'live', JSON.stringify(drawn));
  if (drawn.from !== 'live') return;
  const table = drawn.page.blocks[1]!;
  assert.deepEqual(table.rows.map((r) => r.cells[0]).sort(), ['Fire the kiln', 'Glaze the jugs']);

  /* THE BLOCK THAT WAS THERE IS DECLARED AS IT WAS. `arrangedBody` writes every place's span, and a page whose blocks
     declared none would have had one frozen onto each of them by a gesture that only meant to add. */
  const stored = JSON.parse(k.declarations().find((d) => d.id === 'page.work')!.body) as { blocks: unknown[] };
  assert.deepEqual(stored.blocks[0], { kind: 'table', heading: 'Done', source: 'register.tasks', where: 'state is done', columns: [{ field: 'what' }] });

  /* PUT BACK is the toast's: the body the save read, at the version the save made. */
  const back = await setBody(BASE, out.before, io, out.version);
  assert.equal(back.from, 'written', JSON.stringify(back));
  assert.equal(blocksOf(k, 'work').length, 1);
});

test('A SOURCE SWEEP: the live branch of the sheet reads no fixture pages and no fixture lists', () => {
  const svelte = readFileSync(new URL('../ui/BindBlock.svelte', import.meta.url), 'utf8');
  /* THE SAMPLE'S READS LIVE IN ONE FUNCTION, called only when `boot` answered the sample, and nothing outside it may
     name either fixture. Found by name rather than by a parser: the file is small and the function is one block. With
     no such function the whole file is outside it. An import line is not a read, so it is left out of what is swept. */
  const open = svelte.indexOf('function sampleSide(');
  const close = open < 0 ? -1 : svelte.indexOf('\n  }\n', open);
  const outside = (open < 0 ? svelte : svelte.slice(0, open) + svelte.slice(close))
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('import '))
    .join('\n');
  assert.doesNotMatch(outside, /\bREGISTERS\b/, 'a fixture list is read outside the sample side');
  assert.doesNotMatch(outside, /\bpages\(\)/, 'the fixture pages are read outside the sample side');
  assert.match(svelte, /readBoot\(apiBase\(\)\)/, 'the sheet does not ask the record which side it is on');
});

/* ── what is and is not written ── */

test('EVERYTHING WRITES NO FILTER, because every row is what leaving the key off already says', () => {
  const block = boundBlock('tasks', copy.everything, 'table', 'Tasks');
  assert.equal('where' in block, false);
  assert.equal(block.source, 'register.tasks');
});

test('A SEARCH TEXT THE PAGE CHECK REFUSES COMES BACK AS A SENTENCE, and the page is not written', async () => {
  const k = await record();
  const { io, asked } = served(k);
  const sheet = await liveSheet(BASE, 'tasks', io);
  assert.equal(sheet.from, 'live');
  if (sheet.from !== 'live') return;
  const before = versionOf(k, 'work');

  const out = await bindTo(BASE, sheet.destinations[0]!, boundBlock('tasks', 'kiln', 'table', 'Tasks: matching kiln', sheet.declared), io);
  assert.equal(out.from, 'refused', JSON.stringify(out));
  assert.match(out.from === 'refused' ? out.fix : '', /cannot be read/, 'refused, but not by the page check reading the filter');
  assert.ok(asked.includes('setDeclaration'), 'the refusal was guessed here rather than asked of the record');
  assert.equal(versionOf(k, 'work'), before, 'a refused search text was written onto the page');
  assert.equal(blocksOf(k, 'work').length, 1);
});

test('A PAGE THAT CHANGED SINCE THE SHEET READ IT IS REFUSED, never written over', async () => {
  const k = await record();
  const { io } = served(k);
  const sheet = await liveSheet(BASE, 'tasks', io);
  if (sheet.from !== 'live') return assert.fail(JSON.stringify(sheet));
  const work = sheet.destinations[0]!;

  /* SOMEBODY ELSE ADDS A BLOCK between the sheet opening and the press. */
  const moved = await bindTo(BASE, work, boundBlock('tasks', copy.everything, 'table', 'Tasks', sheet.declared), io);
  assert.equal(moved.from, 'written');
  const out = await bindTo(BASE, work, boundBlock('tasks', 'state is open', 'table', 'Open', sheet.declared), io);
  assert.deepEqual(out, { from: 'refused', fix: words.moved });
  assert.equal(blocksOf(k, 'work').length, 2);
});

test('EVERY KIND THE LIVE SHEET OFFERS DRAWS ITS ROWS WITH CELLS, and a secret is never a column', async () => {
  const { LIVE_KINDS } = await import('./bind-write.ts');
  for (const kind of LIVE_KINDS) {
    const k = await record();
    const { io } = served(k);
    const sheet = await liveSheet(BASE, 'tasks', io);
    if (sheet.from !== 'live') return assert.fail(JSON.stringify(sheet));
    const block = boundBlock('tasks', copy.everything, kind, 'Tasks', sheet.declared);
    assert.ok(!(block.columns as { field: string }[]).some((c) => c.field === 'secret_note'), `${kind} put a secret on a page`);
    const out = await bindTo(BASE, sheet.destinations[0]!, block, io);
    assert.equal(out.from, 'written', `${kind}: ${JSON.stringify(out)}`);
    const drawn = await pageReader(BASE, io, () => CLOCK).read('work');
    if (drawn.from !== 'live') return assert.fail(JSON.stringify(drawn));
    const rows = drawn.page.blocks[1]!.rows;
    assert.equal(rows.length, 3, kind);
    assert.ok(rows.every((r) => r.cells.length > 0 && r.cells[0] !== ''), `${kind} drew rows with nothing in them`);
  }
});
