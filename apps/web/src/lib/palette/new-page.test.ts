/**
 * The palette's way in to a new page: the sentence, the row it draws, and what a press does.
 *
 * NOT THE MARKUP, as `palette.test.ts` says of itself. `paging` is the row as a pure function over the words in the
 * box, and `pressed` is the press with the page maker, the address bar and the toast handed in, so the three things
 * a press owes (the page asked for once, the page opened, one receipt with a way back) are read off what it called.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS, admits, commands } from './admit.ts';
import { FILL, describedHref, maker, pageHref, paging, pressed, rowTitle, whoOf, words, type Desk, type Made } from './new-page.ts';
import { pageWords } from '../record/page-new.ts';
import type { Fetch } from '../record/row-live.ts';

/* ── the sentence ─────────────────────────────────────────────────────────── */

test("'new page' and 'new page Wedding' each offer one row, and the second one names the page", () => {
  assert.deepEqual(paging('new page', 'owner'), { title: '', suggest: false });
  assert.deepEqual(paging('new page Wedding', 'owner'), { title: 'Wedding', suggest: false });
  assert.equal(rowTitle({ title: '', suggest: false }), 'New page');
  assert.equal(rowTitle({ title: 'Wedding', suggest: false }), 'New page: Wedding');
});

test('the name is kept as it was typed: its capitals, its spaces, and a colon of its own', () => {
  assert.equal(paging('New page: Wedding', 'owner')?.title, 'Wedding');
  assert.equal(paging('  NEW   PAGE :  Summer in Lisbon  ', 'owner')?.title, 'Summer in Lisbon');
  assert.equal(paging('new page: Wedding: day two', 'owner')?.title, 'Wedding: day two');
});

test('the row is found by its own words, and a freshly opened palette lists it', () => {
  for (const typed of ['', 'new', 'pag', 'new pa', 'New Page', 'new page:']) {
    assert.deepEqual(paging(typed, 'owner'), { title: '', suggest: false }, `"${typed}" does not find New page`);
  }
});

test('half a sentence names no page, and words that are not the row draw nothing', () => {
  /* `new pages` and `newpage Wedding` are not the sentence, so neither makes a page called "s" or "Wedding". */
  for (const typed of ['new pages', 'newpage Wedding', 'new paper', 'wedding', 'page new Wedding', '?']) {
    assert.equal(paging(typed, 'owner'), null, `"${typed}" drew the row`);
  }
  /* And a sentence with no name yet is the plain row, never a page with an empty name. */
  assert.equal(paging('new page:   ', 'owner')?.title, '');
});

test('somebody who does not own the record sees Suggest a page, by either sentence', () => {
  assert.deepEqual(paging('suggest a page Wedding', 'member'), { title: 'Wedding', suggest: true });
  assert.deepEqual(paging('new page Wedding', 'member'), { title: 'Wedding', suggest: true });
  assert.equal(rowTitle({ title: 'Wedding', suggest: true }), 'Suggest a page: Wedding');
  assert.equal(rowTitle({ title: '', suggest: true }), 'Suggest a page');
  for (const typed of ['', 'sugg', 'suggest a page', 'new page', 'page']) {
    assert.deepEqual(paging(typed, 'member'), { title: '', suggest: true }, `"${typed}" does not find Suggest a page`);
  }
  /* The owner's words alone do not find the member's row by half a word: the row says what it does. */
  assert.equal(paging('new', 'member'), null);
  assert.equal(paging('sugg', 'owner'), null);
});

test('nobody in the shell is offered neither row', () => {
  assert.equal(paging('new page Wedding', null), null);
  assert.equal(paging('', null), null);
});

test('who is asking is read off the shell: the owner makes, anybody else on a record suggests', () => {
  assert.equal(whoOf({ live: true, me: { owner: true } }), 'owner');
  assert.equal(whoOf({ live: true, me: { owner: false } }), 'member');
  assert.equal(whoOf({ live: false, me: { owner: true } }), null, 'with no record there is no page to make');
  assert.equal(whoOf({ live: true }), null, 'a refused boot names nobody');
});

test('what the plain row writes into the box is the sentence up to the name', () => {
  assert.equal(FILL, 'New page: ');
  assert.deepEqual(paging(FILL, 'owner'), { title: '', suggest: false });
  assert.deepEqual(paging(`${FILL}Wedding`, 'member'), { title: 'Wedding', suggest: true });
});

/* ── the declaration ──────────────────────────────────────────────────────── */

test('the row is declared once, admitted, and absent when the query is about something else', () => {
  const row = COMMANDS.find((c) => c.id === 'c-page');
  assert.ok(row, 'no row makes a page');
  assert.equal(row.title, words.declared);
  assert.equal(row.act, 'page');
  assert.equal(admits(row), null, `the new page row is refused: ${admits(row)}`);
  const idle = commands({ undoable: false, creation: null }).map((c) => c.id);
  const none = commands({ undoable: false, creation: null, page: null }).map((c) => c.id);
  const armed = commands({ undoable: false, creation: null, page: { title: 'Wedding', suggest: false } }).map((c) => c.id);
  assert.ok(!idle.includes('c-page') && !none.includes('c-page'), 'the row is offered with no page to make');
  assert.ok(armed.includes('c-page'));
  assert.deepEqual(armed.filter((id) => id !== 'c-page'), idle);
});

/* ── the press ────────────────────────────────────────────────────────────── */

type Said = { text: string; intent?: string | undefined; undo?: (() => void) | undefined };

/** A screen that writes down everything a press did to it, in order. */
function desk(make: Desk['make']): { desk: Desk; did: string[]; toasts: Said[] } {
  const did: string[] = [];
  const toasts: Said[] = [];
  return {
    did,
    toasts,
    desk: {
      make: (title) => (did.push(`make ${title}`), make(title)),
      go: (href) => void did.push(`go ${href}`),
      refresh: () => void did.push('refresh'),
      leave: (href) => void did.push(`leave ${href}`),
      toast: (text, opts = {}) => (did.push('toast'), void toasts.push({ text, intent: opts.intent, undo: opts.undo })),
      notReached: 'The record did not answer.',
    },
  };
}

const settled = () => new Promise((done) => setTimeout(done, 0));

test('A PRESS MAKES THE PAGE ONCE, OPENS IT, AND SHOWS ONE TOAST WITH UNDO', async () => {
  const made: Made = { ok: true, slug: 'wedding', as: 'made', said: 'Wedding is ready.', back: async () => ({ ok: true, said: 'Wedding was taken back out.' }) };
  const at = desk(async () => made);
  await pressed({ title: 'Wedding', suggest: false }, at.desk);
  /* The shell is read before the page opens, so the rail lists it when it is on screen. */
  /* AND IT OPENS ON "DESCRIBE IT": the address carries the mark the page's own menu reads. */
  assert.equal(describedHref('wedding'), '/p/wedding?describe=1');
  assert.deepEqual(at.did, ['make Wedding', 'refresh', `go ${describedHref('wedding')}`, 'toast']);
  assert.equal(at.toasts.length, 1);
  assert.equal(at.toasts[0]!.text, 'Wedding is ready.');
  assert.equal(typeof at.toasts[0]!.undo, 'function', 'the receipt offers no way back');

  /* UNDO takes the page away, leaves its address, reads the shell again and says so, once. */
  at.toasts[0]!.undo!();
  await settled();
  /* THE PLAIN ADDRESS, since the mark is gone from the address bar by then and `leave` compares where the reader is. */
  assert.equal(pageHref('wedding'), '/p/wedding');
  assert.deepEqual(at.did.slice(4), ['leave /p/wedding', 'refresh', 'toast']);
  assert.deepEqual(at.toasts[1], { text: 'Wedding was taken back out.', intent: undefined, undo: undefined });
});

test('an undo the record refuses says the record\'s sentence and leaves the reader on the page', async () => {
  const at = desk(async () => ({ ok: true, slug: 'wedding', as: 'made', said: 'Wedding is ready.', back: async () => ({ ok: false, fix: 'This needs owner access.' }) }));
  await pressed({ title: 'Wedding', suggest: false }, at.desk);
  at.toasts[0]!.undo!();
  await settled();
  assert.deepEqual(at.did.slice(4), ['toast']);
  assert.deepEqual(at.toasts[1], { text: 'This needs owner access.', intent: 'warn', undo: undefined });
});

test('a suggestion opens nothing and offers no undo: there is no page until Needs you accepts it', async () => {
  const at = desk(async () => ({ ok: true, slug: 'wedding', as: 'suggested', said: 'Wedding is waiting in Needs you.' }));
  await pressed({ title: 'Wedding', suggest: true }, at.desk);
  assert.deepEqual(at.did, ['make Wedding', 'refresh', 'toast']);
  assert.deepEqual(at.toasts, [{ text: 'Wedding is waiting in Needs you.', intent: 'good', undo: undefined }]);
});

test('a made page with no way back still opens on Describe it, with a receipt and no Undo', async () => {
  const at = desk(async () => ({ ok: true, slug: 'wedding-2', as: 'made', said: 'Wedding is ready.' }));
  await pressed({ title: 'Wedding', suggest: false }, at.desk);
  assert.deepEqual(at.did, ['make Wedding', 'refresh', 'go /p/wedding-2?describe=1', 'toast']);
  assert.deepEqual(at.toasts, [{ text: 'Wedding is ready.', intent: 'good', undo: undefined }]);
});

test('a refusal is one warning in the record\'s words, and a press that could not load says the calm sentence', async () => {
  const no = desk(async () => ({ ok: false, fix: 'Give the page a name first.' }));
  await pressed({ title: '', suggest: false }, no.desk);
  assert.deepEqual(no.did, ['make ', 'toast']);
  assert.deepEqual(no.toasts, [{ text: 'Give the page a name first.', intent: 'warn', undo: undefined }]);

  const down = desk(async () => {
    throw new Error('Failed to fetch dynamically imported module');
  });
  await pressed({ title: 'Wedding', suggest: false }, down.desk);
  assert.deepEqual(down.did, ['make Wedding', 'toast']);
  assert.deepEqual(down.toasts, [{ text: 'The record did not answer.', intent: 'warn', undo: undefined }]);
});

/* ── the real maker, as far as the wire ───────────────────────────────────── */

/** A record that says yes to everything and writes down which method was asked, with what. */
function wire(): { io: Fetch; asked: { method: string; args: Record<string, unknown> }[] } {
  const asked: { method: string; args: Record<string, unknown> }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.slice('/api/'.length);
    asked.push({ method, args: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    return new Response(JSON.stringify({ ok: true, value: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as Fetch;
  return { io, asked };
}

test('the owner\'s press is one setDeclaration beside the pages boot lists, and its undo retires that page', async () => {
  const { io, asked } = wire();
  const out = await maker('http://record.test', ['wedding'], true, io)('  Our   Wedding ');
  assert.ok(out.ok && out.as === 'made');
  assert.equal(out.slug, 'our-wedding');
  assert.equal(out.said, pageWords.made('Our Wedding'));
  /* THE SLUGS `boot` LEFT OUT ARE READ FIRST (`every` in `page-new.ts`), and the one write follows. */
  assert.deepEqual(asked.map((a) => a.method), ['pages', 'setDeclaration']);

  const second = await maker('http://record.test', ['wedding'], true, io)('Wedding');
  assert.equal(second.ok && second.slug, 'wedding-2', 'a second Wedding was written over the first');

  assert.ok(out.back);
  assert.deepEqual(await out.back(), { ok: true, said: pageWords.undone('Our Wedding') });
  assert.deepEqual(asked.at(-1), { method: 'retireDeclaration', args: { id: 'page.our-wedding' } });
});

test('anybody else\'s press is one question and never a write, with nothing to take back', async () => {
  const { io, asked } = wire();
  const out = await maker('http://record.test', [], false, io)('Wedding');
  assert.deepEqual(out, { ok: true, slug: 'wedding', as: 'suggested', said: pageWords.suggested('Wedding') });
  assert.deepEqual(asked.map((a) => a.method), ['pages', 'propose']);
});

test('a blank name is refused in a sentence before the record is asked', async () => {
  const { io, asked } = wire();
  assert.deepEqual(await maker('http://record.test', [], true, io)('   '), { ok: false, fix: pageWords.blank });
  assert.deepEqual(asked, []);
});

test("the row's two labels are the ones the page module and the rail say", () => {
  assert.equal(words.declared, pageWords.newPage);
  assert.equal(words.suggest, pageWords.suggestPage);
});
