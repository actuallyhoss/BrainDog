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
import * as bind from './bind-write.ts';
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

/**
 * THE KERNEL'S SENTENCE IS FOR AN AGENT, AND THE SHEET SAID IT TO A PERSON. Measured against this record before the
 * repair: the press answered `page.work.blocks[1] cannot be read: kiln: tasks has no field called kiln.`, a declaration
 * address, an array index and the list's id, in the sheet under a list the person knows as Tasks. The record is still
 * asked, because it is the only judge of what it can read; only the sentence it answers is put into the owner's words.
 */
test('A FILTER THE RECORD CANNOT READ IS REFUSED BY THE RECORD, and said without its ids', async () => {
  const k = await record();
  const { io, asked } = served(k);
  const sheet = await liveSheet(BASE, 'tasks', io);
  assert.equal(sheet.from, 'live');
  if (sheet.from !== 'live') return;
  const before = versionOf(k, 'work');

  const out = await bindTo(BASE, sheet.destinations[0]!, boundBlock('tasks', 'kiln', 'table', 'Tasks: matching kiln', sheet.declared), io);
  assert.equal(out.from, 'refused', JSON.stringify(out));
  const fix = out.from === 'refused' ? out.fix : '';
  assert.equal(fix, bind.words.unread, fix);
  assert.doesNotMatch(fix, /page\.\w|blocks\[|has no field called/, 'the kernel sentence reached the sheet as it was');
  assert.ok(asked.includes('setDeclaration'), 'the refusal was guessed here rather than asked of the record');
  assert.equal(versionOf(k, 'work'), before, 'a refused search text was written onto the page');
  assert.equal(blocksOf(k, 'work').length, 1);
});

/**
 * ANY OTHER SENTENCE CARRYING THE RECORD'S ADDRESSES IS TRANSLATED TOO, and a sentence already written for a person is
 * left as it is. The record answers these for blocks that were there before the press (a list that lost a field since),
 * and for a page's own `requires`, so "the list cannot read this filter" would name the wrong block: the page's title
 * does instead.
 */
test("A REFUSAL NAMING THE RECORD'S IDS IS SAID IN THE PAGE'S NAME, and a plain one passes through", async () => {
  const k = await record();
  const real = served(k).io;
  let answer: { code: string; fix: string } = { code: 'DECLARATION_INVALID', fix: 'page.work.blocks[0] cannot be read: state: tasks has no field called state.' };
  const io = (async (url: string | URL | Request, init?: RequestInit) =>
    String(url).endsWith('/api/setDeclaration') ? json(400, { ok: false, refusal: answer }) : real(url, init)) as Fetch;
  const sheet = await liveSheet(BASE, 'tasks', io);
  if (sheet.from !== 'live') return assert.fail(JSON.stringify(sheet));
  const work = sheet.destinations[0]!;
  const block = boundBlock('tasks', 'state is open', 'table', 'Open', sheet.declared);

  assert.deepEqual(await bindTo(BASE, work, block, io), { from: 'refused', fix: bind.words.notTaken('Work') }, 'another block');
  answer = { code: 'DECLARATION_INVALID', fix: 'page.work reads register.tasks, which it does not require.' };
  assert.deepEqual(await bindTo(BASE, work, block, io), { from: 'refused', fix: bind.words.notTaken('Work') }, 'an address');
  answer = { code: 'DECLARATION_INVALID', fix: 'A page holds at most forty blocks.' };
  assert.deepEqual(await bindTo(BASE, work, block, io), { from: 'refused', fix: 'A page holds at most forty blocks.' }, 'plain');
});

/**
 * A PAGE AT ITS BLOCK CEILING SAYS WHY, not only that it refused. The kernel answers a twenty-fifth block with
 * `page.long declares 25 blocks. The ceiling is 24: a page longer than that is a report.` (`declare.ts`, `BLOCK_CEILING`),
 * a sentence written for a person whose only id is the page's own address as its subject. `owned` saw `page.long` and
 * answered "Long did not take the block, so nothing on it changed", which is the one thing the person could not act on:
 * the reason, and the number that would have let her take a block off first, were thrown away.
 *
 * AGAINST THE REAL KERNEL, with a page installed at twenty-four blocks, so the sentence is the record's and not one
 * typed here to match the repair. If the ceiling moves, the press is written and the first assertion says so.
 */
test("A PAGE AT ITS CEILING KEEPS THE RECORD'S REASON, said by the page's name", async () => {
  const k = await record();
  const full = Array.from({ length: 24 }, (_, i) => ({ kind: 'table', heading: `Part ${i + 1}`, source: 'register.tasks', columns: [{ field: 'what' }] }));
  const put = await k.install([{ id: 'page.long', kind: 'page', body: { page: 'long', title: 'Long', requires: ['register.tasks'], blocks: full } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  const { io } = served(k);
  const sheet = await liveSheet(BASE, 'tasks', io);
  if (sheet.from !== 'live') return assert.fail(JSON.stringify(sheet));
  const long = sheet.destinations.find((d) => d.slug === 'long')!;
  assert.equal(long.drawn, 24);

  const out = await bindTo(BASE, long, boundBlock('tasks', 'state is open', 'table', 'Open', sheet.declared), io);
  assert.equal(out.from, 'refused', JSON.stringify(out));
  const fix = out.from === 'refused' ? out.fix : '';
  assert.equal(fix, 'Long declares 25 blocks. The ceiling is 24: a page longer than that is a report.', fix);
  assert.equal(blocksOf(k, 'long').length, 24);
});

/* ── a search is not a filter ── */

/**
 * THE REGISTER SCREEN HANDS THE SHEET ITS SEARCH TEXT WHEN THERE IS NO FILTER, as `predicate`, and says it as
 * `matching “<text>”`. The sheet then offered the press, and every press was refused (the test above). A search is
 * what somebody typed to look, and a page shows its blocks to everyone who opens it; a filter is a sentence about the
 * list, which is what a block's `where` holds. So the sheet says so before anything is pressed.
 *
 * THE TWO SPELLINGS ARE THE ROUTE'S, built here the way `r/[register]/+page.svelte` builds them, and the test after this
 * one reads the route to hold it to that.
 */
test('A SEARCH TEXT IS SAID BEFORE THE PRESS, and a filter and everything are not', () => {
  const says = (where: string, q: string): [string, string] => [where || q || copy.everything, where || (q ? `matching “${q}”` : copy.everything)];

  const search = bind.unkept?.(...says('', 'kiln'), 'Tasks');
  assert.equal(typeof search, 'string', 'a search text was offered as a block');
  assert.match(search ?? '', /search/i);
  assert.match(search ?? '', /filter/i, 'it says what can be kept instead');
  assert.match(search ?? '', /Tasks/, 'it names the list by the name a person gave it');
  assert.doesNotMatch(search ?? '', /kiln|register\.\w|page\.\w/, 'it quotes machinery or the typed text back');

  assert.equal(bind.unkept?.(...says('state is open', ''), 'Tasks'), null, 'a filter was refused');
  assert.equal(bind.unkept?.(...says('state is open', 'kiln'), 'Tasks'), null, 'a filter with a search typed beside it was refused');
  assert.equal(bind.unkept?.(...says('', ''), 'Tasks'), null, 'every row was refused');
});

test('THE ROUTE STILL SPELLS A SEARCH THE WAY THE SHEET READS IT', () => {
  const route = readFileSync(new URL('../../routes/r/[register]/+page.svelte', import.meta.url), 'utf8');
  /* IF THIS GOES RED THE ROUTE CHANGED HOW IT HANDS A SEARCH OVER, and `unkept` no longer recognises one: the sheet would
     offer the press again and the record's refusal, translated, would be all that is left. Change both together. */
  assert.match(route, /predicate=\{whereOf\(filters\) \|\| q \|\| copy\.everything\}/);
  assert.ok(route.includes('(q ? `matching “${q}”` : copy.everything)'), 'the route no longer says a search as matching “…”');
});

/* ── the press ── */

/**
 * A THROWN PRESS LEFT THE BUTTON DEAD UNTIL THE SHEET WAS REMOUNTED. `bind()` set `busy`, awaited a dynamic import and
 * `bindTo`, and cleared `busy` on the line after: a chunk that failed to load (the deploy after the tab opened replaces
 * every hashed file) threw past it, the button stayed disabled, and nothing was said. `bindTo` itself answers a network
 * failure rather than throwing (measured: a rejecting fetch answers `recordNotReached`), so the import is the live case.
 *
 * READ FROM THE SOURCE, as the sweep above is, because this app has no DOM to press a button in. The shape asked for is
 * the one that cannot leak: `busy` cleared in a `finally`, and a `catch` that puts a sentence in the sheet.
 */
test('A PRESS THAT THROWS CLEARS BUSY AND SAYS SO', () => {
  const svelte = readFileSync(new URL('../ui/BindBlock.svelte', import.meta.url), 'utf8');
  const start = svelte.indexOf('async function bind(');
  assert.ok(start > 0, 'no bind() in the sheet');
  const body = svelte.slice(start, svelte.indexOf('\n  }\n', start));
  assert.match(body, /finally\s*\{\s*busy = false;?\s*\}/, 'busy is not cleared in a finally');
  assert.match(body, /catch\s*\{[^}]*problem = [^}]*failed/, 'a thrown press is not said in the sheet');
  assert.equal(body.match(/busy = false/g)?.length, 1, 'busy is cleared somewhere a throw can skip');
  /* THE SENTENCE IS THE SHEET'S OWN, not this module's: the module is the dynamic import that failed, so a sentence
     kept in it is a sentence nobody can reach on the one press that needs it. */
  assert.match(svelte, /const failed =\s*'[^']+'/, 'the sheet has no sentence of its own for a press that threw');
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
