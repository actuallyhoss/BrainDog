/**
 * A page's look on screen: the order the engine drew it in, the next action under its headline, a pin, and the Undo on
 * what Slash arranged.
 *
 * WHAT WOULD BE SILENTLY WRONG: an order that moves blocks the look never named, an order unlike the kernel's (every
 * poll would shuffle a page the record already arranged), a lead put above the page's sentence (the head would ride
 * over a figure), a look written under the wrong id, with its kind not first or with a key the record refuses, Undo
 * offered on the arrangement a page opened on, and an arrangement kept while its Undo is still on screen or kept after
 * it was undone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../record/fixtures/fill.ts';
import type { LiveLook } from '../record/page-live.ts';
import { lookOf } from '../record/page-live.ts';
import {
  arrivedNow,
  bodyOf,
  historyOf,
  isPinned,
  keepLook,
  lookOrder,
  lookPage,
  nextOf,
  offerKey,
  offerUndo,
  pinBody,
  repeatsFirst,
  retireLook,
  slashOpen,
  undoLook,
  writeLook,
} from './look.ts';

const BASE = 'http://record.test';

const look = (over: Partial<LiveLook> = {}): LiveLook => ({
  page: 'money',
  basis: 'b1',
  lead: null,
  order: [],
  hide: [],
  headline: null,
  next: null,
  pinned: [],
  by: 'rule',
  kept: null,
  ...over,
});

const page = [{ key: 'line', head: true }, { key: 'late' }, { key: 'cash' }, { key: 'feed' }, { key: 'notes' }];
const named = (order: number[]) => order.map((i) => page[i]!.key);

test('the look reorders only the blocks it names, in the places they held, and moves nothing else', () => {
  assert.deepEqual(named(lookOrder(page, look({ order: ['notes', 'late'] }))), ['line', 'notes', 'cash', 'feed', 'late']);
  assert.deepEqual(named(lookOrder(page, null)), ['line', 'late', 'cash', 'feed', 'notes'], 'no look is the page as declared');
  assert.deepEqual(named(lookOrder(page, look({ order: ['nowhere', 'cash'] }))), named([0, 1, 2, 3, 4]), 'a key the page lacks moves nothing');
});

test("the look's lead goes straight under the page's sentence, never above it", () => {
  assert.deepEqual(named(lookOrder(page, look({ lead: 'feed' }))), ['line', 'feed', 'late', 'cash', 'notes']);
  const plain = page.slice(1);
  assert.deepEqual(
    lookOrder(plain, look({ lead: 'notes' })).map((i) => plain[i]!.key),
    ['notes', 'late', 'cash', 'feed'],
    'with no sentence the lead is first',
  );
  assert.deepEqual(named(lookOrder(page, look({ lead: 'line' }))), named([0, 1, 2, 3, 4]), 'the sentence leading is the page as it is');
});

test("the lead goes after the page's opening, where the kernel puts it, so a page the record arranged is not moved again", () => {
  /* THE OPENING IS THE SENTENCE, THE NOTES AND THE LINE A ROW IS TYPED INTO: the kernel's `topOf`. Put straight under
     the sentence instead, the lead the record answered under the capture line jumped above it on every read. */
  const opening = [
    { key: 'line', kind: 'note', head: true },
    { key: 'aside', kind: 'note' },
    { key: 'add', kind: 'capture' },
    { key: 'late', kind: 'todo' },
    { key: 'cash', kind: 'stat' },
  ];
  const keysOf = (blocks: typeof opening, order: number[]) => order.map((i) => blocks[i]!.key);
  assert.deepEqual(keysOf(opening, lookOrder(opening, look({ lead: 'cash' }))), ['line', 'aside', 'add', 'cash', 'late']);
  const answered = [opening[0]!, opening[1]!, opening[2]!, opening[4]!, opening[3]!];
  assert.deepEqual(lookOrder(answered, look({ lead: 'cash' })), [0, 1, 2, 3, 4], 'the record already put it there');
  const headed = [opening[0]!, { key: 'h', kind: 'section' }, opening[3]!, opening[4]!];
  assert.deepEqual(keysOf(headed, lookOrder(headed, look({ lead: 'cash' }))), ['line', 'cash', 'h', 'late'], 'a heading ends the opening');
});

test('the order is kept a column at a time, and a block the person pinned moves only under their own look', () => {
  const columns = [{ key: 'a' }, { key: 'b' }, { key: 'r', area: 'rail' }];
  assert.deepEqual(
    lookOrder(columns, look({ order: ['r', 'b', 'a'] })).map((i) => columns[i]!.key),
    ['b', 'a', 'r'],
    'the rail block never takes a place in the main column',
  );
  assert.deepEqual(named(lookOrder(page, look({ by: 'slash', order: ['cash', 'late'], pinned: ['late'] }))), named([0, 1, 2, 3, 4]));
  assert.deepEqual(named(lookOrder(page, look({ by: 'owner', order: ['cash', 'late'], pinned: ['late'] }))), ['line', 'cash', 'late', 'feed', 'notes']);
  assert.deepEqual(named(lookOrder(page.map((b) => (b.key === 'feed' ? { ...b, drawn: false } : b)), look({ lead: 'feed' }))), named([0, 1, 2, 3, 4]), 'a block not drawn does not lead');
});

test('applied to blocks already in its order, the look changes nothing, so the page is the same whichever side applied it', () => {
  const l = look({ lead: 'cash', order: ['feed', 'late'] });
  const once = lookOrder(page, l).map((i) => page[i]!);
  const twice = lookOrder(once, l).map((i) => once[i]!);
  assert.deepEqual(twice, once);
});

test('a pin is the person’s own look with blocks pinned, and only an arrangement of Slash nobody kept is offered Undo', () => {
  assert.equal(isPinned(look({ by: 'owner', pinned: ['late'] })), true);
  assert.equal(isPinned(look({ by: 'owner' })), false, 'the person’s look with nothing pinned pins nothing');
  assert.equal(isPinned(look({ by: 'slash', pinned: ['late'] })), false);
  assert.equal(slashOpen(look({ by: 'slash' })), true);
  assert.equal(slashOpen(look({ by: 'slash', kept: 'Sam' })), false);
  assert.equal(slashOpen(look({ by: 'rule' })), false);
  assert.equal(slashOpen(null), false);
  assert.notEqual(offerKey('money', look({ by: 'slash', order: ['a', 'b'] })), offerKey('money', look({ by: 'slash', order: ['b', 'a'] })));
});

test('Undo is offered on an arrangement of Slash that lands while the person looks, never on the one the page opened on', () => {
  const slash = look({ by: 'slash', order: ['cash'] });
  assert.equal(arrivedNow('money', undefined, slash), false, 'the page opened on it');
  assert.equal(arrivedNow('money', look(), slash), true, 'the rules gave way to Slash under the reader');
  assert.equal(arrivedNow('money', null, slash), true);
  assert.equal(arrivedNow('money', slash, look({ by: 'slash', order: ['cash'] })), false, 'the same arrangement read again');
  assert.equal(arrivedNow('money', slash, look({ by: 'slash', order: ['late'] })), true);
  assert.equal(arrivedNow('money', look(), look({ by: 'owner', pinned: ['cash'] })), false, "the person's own is not Slash's");
});

test('a look is written under the page declaration it is laid over, which a template’s pages share', () => {
  assert.equal(lookPage('kiln', look({ page: 'project' })), 'project');
  assert.equal(lookPage('money', null), 'money');
});

test('the history says who arranged the page and who kept it, in names', () => {
  assert.equal(historyOf(look({ by: 'slash', kept: 'Sam' })), 'Slash arranged · Sam kept');
  assert.equal(historyOf(look({ by: 'slash' })), 'Slash arranged');
  assert.equal(historyOf(look({ by: 'slash' }), 'Sam'), 'Slash arranged · Sam kept', 'kept in this tab, before the record says so');
  assert.equal(historyOf(look({ by: 'owner', pinned: ['late'] })), 'Pinned as it is');
  assert.equal(historyOf(look({ by: 'rule' })), null, 'the rules arranging a page is nothing to say');
});

test('the next action opens the row it names, and a row it cannot name is the line alone', () => {
  assert.deepEqual(nextOf(look({ next: { row: 'tasks#12', text: 'Send the Kiln invoice' } })), {
    text: 'Send the Kiln invoice',
    row: { register: 'tasks', seq: 12 },
    href: '/r/tasks/12',
  });
  assert.deepEqual(nextOf(look({ next: { row: '01JABCDEF', text: 'Reply to Ada' } })), { text: 'Reply to Ada', row: null, href: null });
  assert.deepEqual(nextOf(look({ next: { row: 'q_7', text: 'Answer the rent question' } }), new Set(['q_7'])), {
    text: 'Answer the rent question',
    row: null,
    href: '/decide/q_7',
  });
  assert.equal(nextOf(look()), null);
});

/** The keys a look may carry, as the kernel's `LOOK_KEYS` holds them: a key past these is refused at install. */
const LOOK_KEYS = new Set(['look', 'basis', 'lead', 'order', 'hide', 'headline', 'next', 'pinned', 'by']);

test("a look is written with its kind first, so it is declared as the page's look, and only with keys a look has", () => {
  const body = bodyOf('money', look({ by: 'slash', lead: 'cash', order: ['cash', 'late'], next: { row: 'tasks#1', text: 'Pay rent' }, kept: 'Sam' }));
  assert.equal(Object.keys(body)[0], 'look');
  assert.deepEqual(body, { look: 'money', basis: 'b1', by: 'slash', lead: 'cash', order: ['cash', 'late'], next: { row: 'tasks#1', text: 'Pay rent' } });
  for (const key of Object.keys(body)) assert.ok(LOOK_KEYS.has(key), `${key} is not a key a look has`);
});

test('Pin this keeps the page as it is drawn, every block pinned in its place, as the person’s own', () => {
  const body = pinBody('money', look({ by: 'slash', lead: 'cash', hide: ['old', 'late'], headline: 'Cash is fine', next: { row: 'tasks#1', text: 'Pay' } }), ['line', 'cash', 'late']);
  assert.deepEqual(body, { look: 'money', basis: 'b1', by: 'owner', lead: 'cash', order: ['line', 'cash', 'late'], hide: ['old'], pinned: ['line', 'cash', 'late'] });
  assert.deepEqual(
    pinBody('home', null, ['a', 'note|lead||', 'a', 'b-2']),
    { look: 'home', basis: 'pinned', by: 'owner', order: ['a', 'b-2'], pinned: ['a', 'b-2'] },
    'a key the page made up, or one twice, is not pinned, and a pin says what it was composed from',
  );
});

/** A record that answers every call, and remembers what it was sent. */
function record(refuse = false) {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    sent.push({ method, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    const answer = refuse ? { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner arranges a page.' } } : { ok: true, value: [] };
    return new Response(JSON.stringify(answer), { status: refuse ? 403 : 200, headers: { 'content-type': 'application/json' } });
  }) as never;
  return { io, sent };
}

test('a pin is set as a declaration, Unpin retires the page’s look, and a refusal is said in the record’s words', async () => {
  const r = record();
  assert.deepEqual(await writeLook(BASE, { look: 'money', by: 'owner' }, r.io), { ok: true });
  assert.deepEqual(await retireLook(BASE, 'money', r.io), { ok: true });
  assert.deepEqual(r.sent, [
    { method: 'setDeclaration', body: { body: { look: 'money', by: 'owner' } } },
    { method: 'retireDeclaration', body: { id: 'look.money' } },
  ]);
  assert.deepEqual(await retireLook(BASE, 'money', record(true).io), { ok: false, fix: 'Only the owner arranges a page.', code: 'FORBIDDEN' });
});

test("Undo asks the record to put back the look Slash's replaced, and keeping asks it to say who kept it", async () => {
  const r = record();
  assert.deepEqual(await undoLook(BASE, 'money', r.io), { ok: true });
  assert.deepEqual(await keepLook(BASE, 'money', r.io), { ok: true });
  assert.deepEqual(r.sent, [
    { method: 'undoLook', body: { page: 'money' } },
    { method: 'keepLook', body: { page: 'money' } },
  ]);
});

test('a record that routes neither yet: Undo retires Slash\'s look, and keeping does nothing more', async () => {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    sent.push(method);
    const known = method === 'retireDeclaration';
    const answer = known ? { ok: true, value: [] } : { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such method.' } };
    return new Response(JSON.stringify(answer), { status: known ? 200 : 404, headers: { 'content-type': 'application/json' } });
  }) as never;
  assert.deepEqual(await undoLook(BASE, 'money', io), { ok: true });
  assert.deepEqual(await keepLook(BASE, 'money', io), { ok: true });
  assert.deepEqual(sent, ['undoLook', 'retireDeclaration', 'keepLook']);
});

/** A clock that runs only when told, and a toast stack of one line. */
function stack() {
  const queue: { run: () => void; at: number }[] = [];
  let now = 0;
  const lines = new Map<number, () => void>();
  let next = 1;
  return {
    later: (run: () => void, ms: number) => void queue.push({ run, at: now + ms }),
    push: (undo: () => void, life: number) => {
      assert.equal(life, 6_000, 'six seconds, as every Undo');
      lines.set(next, undo);
      return next++;
    },
    alive: (id: number) => lines.has(id),
    gone: (id: number) => lines.delete(id),
    press: (id: number) => {
      lines.get(id)?.();
      lines.delete(id);
    },
    pass(ms: number) {
      now += ms;
      for (let due = queue.findIndex((q) => q.at <= now); due >= 0; due = queue.findIndex((q) => q.at <= now)) queue.splice(due, 1)[0]!.run();
    },
  };
}

test('what Slash arranged is kept once its line has gone unanswered, and never while it is still on screen', () => {
  const s = stack();
  let kept = 0;
  let undone = 0;
  offerUndo({ push: s.push, alive: s.alive, later: s.later, undo: () => undone++, keep: () => kept++ });
  s.pass(5_000);
  assert.equal(kept, 0, 'the line is still up, held under a pointer or not');
  s.gone(1);
  s.pass(1_000);
  assert.equal(kept, 1);
  assert.equal(undone, 0);
  s.pass(10_000);
  assert.equal(kept, 1, 'kept once');
});

test('an arrangement undone is never kept', () => {
  const s = stack();
  let kept = 0;
  let undone = 0;
  offerUndo({ push: s.push, alive: s.alive, later: s.later, undo: () => undone++, keep: () => kept++ });
  s.pass(2_000);
  s.press(1);
  s.pass(10_000);
  assert.equal(undone, 1);
  assert.equal(kept, 0);
});

test("a look is read from the record's answer, and one with no author is no look", () => {
  assert.deepEqual(
    lookOf({ by: 'slash', basis: 'x', lead: 'cash', order: ['cash', 3, 'cash', 'late'], next: { row: 'tasks#2', text: ' Pay rent ' }, pinned: 'all' }),
    look({ page: null, by: 'slash', basis: 'x', lead: 'cash', order: ['cash', 'late'], next: { row: 'tasks#2', text: 'Pay rent' } }),
  );
  assert.equal(lookOf({ look: 'project', by: 'rule' })?.page, 'project', 'the page it is laid over, as the record named it');
  assert.equal(lookOf({ lead: 'cash' }), null);
  assert.equal(lookOf({ by: 'someone' }), null);
  assert.equal(lookOf('slash'), null);
  assert.equal(lookOf({ by: 'rule', next: { row: 'tasks#2' } })?.next, null, 'a next action with no words is none');
});

test('THE NEXT STEP IS NOT SAID OVER THE FIRST TILE WHEN THAT TILE OPENS ON IT, a question or a row', () => {
  const asking = look({ next: { row: 'q_7', text: 'Chase it?' } });
  assert.equal(repeatsFirst(asking, { queue: [{ id: 'q_7' }, { id: 'q_8' }] }), true);
  assert.equal(repeatsFirst(asking, { queue: [{ id: 'q_8' }, { id: 'q_7' }] }), false, 'second on the tile is not the first thing seen');
  const doing = look({ next: { row: 'tasks#12', text: 'Send the Kiln invoice' } });
  assert.equal(repeatsFirst(doing, { register: 'tasks', entries: [{ seq: 12 }, { seq: 3 }] }), true);
  assert.equal(repeatsFirst(doing, { register: 'tasks', entries: [{ seq: 3 }, { seq: 12 }] }), false);
  assert.equal(repeatsFirst(doing, { register: 'invoices', entries: [{ seq: 12 }] }), false, 'the same number in another list is another row');
  assert.equal(repeatsFirst(doing, null), false);
  assert.equal(repeatsFirst(look({}), { queue: [{ id: 'q_7' }] }), false, 'no next step repeats nothing');
});
