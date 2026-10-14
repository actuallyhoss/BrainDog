/**
 * The palette's one row that makes something: `Add to <list>: <text>`, read out of the query and written as the row the
 * list's own capture line would write.
 *
 * WHAT IT ANSWERS. Every row in the palette went somewhere or undid something, so the one surface reachable from every
 * screen could not take down the thing a person had just thought of: adding a task meant leaving the screen they were
 * on for `/r/tasks`, finding the line, and coming back. The row is admitted by `admits()` like every other
 * (`palette.test.ts` holds that half); this file holds the sentence it reads and the write it makes.
 *
 * THE WRITE AGAINST A REAL KERNEL over `node:sqlite`, as `field-write.test.ts` drives its fields: only the HTTP envelope
 * is written here, because `@braindog/record` is not a dependency of this app. The row that lands is read back off the
 * kernel, not off the answer the writer handed the palette, since the answer is the thing under test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

/* A NAMESPACE, so a missing export fails one test and not the file. */
import '../record/fixtures/fill.ts';
import * as create from './create.ts';
import { REGISTERS } from '../record/api.ts';
import { layoutOf } from '../record/boot-live.ts';
import type { List } from '../record/palette.ts';
import { capturedFields } from '../record/rows-write.ts';
import type { Fetch } from '../record/row-live.ts';

const BASE = 'http://record.test';
const NOW = Date.parse('2026-09-24T10:00:00Z');
const OWNER = { actor: 'p_1' };

/** Every list this build declares, as `boot` would hand them to the palette. */
const registers: List[] = Object.values(REGISTERS).map((r) => ({ id: r.id, name: r.name, count: 0, icon: 'rows' }));

/* ── the sentence ─────────────────────────────────────────────────────────── */

test('a query of the form "add to <list>: <text>" names a list and a title', () => {
  assert.equal(typeof create.creation, 'function', 'create.ts exports no creation, so the palette reads no row out of a query');
  assert.deepEqual(create.creation('add to tasks: buy milk', registers), { register: 'tasks', title: 'buy milk' });
  /* BY THE NAME A PERSON READS AS WELL AS BY THE ID. `things` is drawn everywhere as Projects, and nobody types the
     id of a list they have only ever seen called something else. Case and spacing are the reader's own. */
  assert.deepEqual(create.creation('Add to Projects: Kiln', registers), { register: 'things', title: 'Kiln' });
  assert.deepEqual(create.creation('  ADD  TO  tasks :  buy milk  ', registers), { register: 'tasks', title: 'buy milk' });
  assert.deepEqual(create.creation('add to exchange rates: EUR', registers), { register: 'fx', title: 'EUR' });
  /* THE FIRST COLON ENDS THE LIST, so a title can carry one of its own. */
  assert.deepEqual(create.creation('add to tasks: call: the kiln people', registers), { register: 'tasks', title: 'call: the kiln people' });
});

test('anything short of the whole sentence is not a row to add, so the palette draws no half-made one', () => {
  for (const q of ['', 'add', 'add to', 'add to tasks', 'add to tasks:', 'add to tasks:   ', 'add to : buy milk', 'tasks: buy milk', 'add milk to tasks'])
    assert.equal(create.creation(q, registers), null, `"${q}" was read as a row to add`);
  /* A LIST THIS RECORD DOES NOT HOLD IS NOT GUESSED AT. The nearest name is the kind of help that files the rent under
     the wrong list with nobody told. */
  assert.equal(create.creation('add to groceries: milk', registers), null);
  assert.equal(create.creation('add to task: milk', registers), null);
});

test('only a list this build can title a row in is offered, the same rule a page capture keeps', () => {
  assert.equal(typeof create.addable, 'function');
  /* `capture.ts` answers null for a list with no declaration here, because the declaration is what names the title
     field, and a row with the words in no field is not the row somebody typed. A live record can hold such a list, and
     its name must not turn the sentence into a row that is then refused or written empty. */
  const held = [...registers, { id: 'kiln_firings', name: 'Firings', count: 3, icon: 'rows' as const }];
  const offered = create.addable(held).map((l) => l.id);
  assert.ok(!offered.includes('kiln_firings'), 'a list with no declaration in this build was offered');
  assert.ok(offered.includes('tasks'));
  assert.equal(create.creation('add to firings: bisque', create.addable(held)), null);
  /* AND NOTHING THE BUILD CAN WRITE WAS LOST ON THE WAY. */
  for (const l of registers) if (REGISTERS[l.id]?.title) assert.ok(offered.includes(l.id), `${l.id} can be written and was not offered`);
});

test('the row says the list by its name and the words as they were typed', () => {
  assert.equal(create.words.row('Tasks', 'buy milk'), 'Add to Tasks: buy milk');
});

/* ── the write, against a real kernel ─────────────────────────────────────── */

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

/** A record holding the build's own Tasks, word for word, less the links to lists this bare record does not hold. */
async function tasks(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(REGISTERS.tasks)) as Record<string, unknown>;
  const fields = (body.fields as { id: string; type: string }[]).filter((f) => f.type !== 'ref');
  const kept = new Set(fields.map((f) => f.id));
  /* `hand.person` NAMES `owner`, A LINK FIELD, which the line above strips along with every other ref this bare record
     does not hold, so the same hand-off would point at a field that is no longer there. `hand.taken` names a value of
     `state`, never a field, so it is never in question. */
  const wholeHand = body.hand as Record<string, string> | undefined;
  const hand =
    wholeHand === undefined
      ? undefined
      : Object.fromEntries(Object.entries(wholeHand).filter(([k2, v]) => k2 === 'taken' || kept.has(v)));
  const put = await k.install([{ id: 'register.tasks', kind: 'register', body: { ...body, fields, ...(hand && Object.keys(hand).length > 0 ? { hand } : { hand: undefined }) } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  return k;
}

/** The kernel behind `/api/<method>`, for the four methods a create and its Put back reach. */
function served(k: Kernel): Fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    const register = String(args.register ?? '');
    const answer = (out: { ok: boolean }) => json(out.ok ? 200 : 'conflict' in out ? 409 : 400, out);
    if (method === 'list') return answer(k.list({ register, limit: Number(args.limit ?? 50) } as never) as { ok: boolean });
    if (method === 'get') return json(200, { ok: true, value: k.get({ register, seq: Number(args.seq) }) });
    if (method === 'create') return answer(k.create(register, args.fields as never, OWNER) as { ok: boolean });
    if (method === 'update') {
      const version = typeof args.version === 'number' ? { version: args.version } : {};
      return answer(k.update(register, `${register}#${Number(args.seq)}`, args.patch as never, { ...OWNER, ...version }) as { ok: boolean });
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
}

test('THE ROW IT WRITES IS THE ROW THE CAPTURE LINE WOULD WRITE, and Put back takes it off the list', async () => {
  assert.equal(typeof create.addRow, 'function', 'create.ts exports no addRow, so the palette row writes nothing');
  const k = await tasks();
  const out = await create.addRow({ register: 'tasks', title: 'buy milk' }, NOW, BASE, served(k));
  assert.ok(out.ok, JSON.stringify(out));

  /* READ OFF THE KERNEL. `capturedFields` with no filter is the list's own line typed with nothing narrowed, so the
     palette's row and the list's row are one row: the title, and the state the declaration requires at its emptiest. */
  const row = k.get('tasks#1');
  assert.ok(row, 'no row reached the record');
  const expected = capturedFields('tasks', 'buy milk', [], NOW);
  for (const [key, value] of Object.entries(expected.fields)) assert.deepEqual(row.fields[key], value, `${key} is not what the capture line writes`);
  /* AND WHAT WAS FILLED ON THE READER'S BEHALF IS SAID, as the list says it. */
  assert.deepEqual(out.filled, expected.filled);
  assert.ok(out.filled.length > 0, 'tasks require a state, so the fill has something to say');

  /* PUT BACK IS AN ARCHIVE, the way back the list's own add offers: the record has no delete, so the row is left out of
     every list and `restore` can bring it back. */
  const back = await out.back();
  assert.ok(back.ok, JSON.stringify(back));
  const listed = k.list({ register: 'tasks', limit: 50 } as never) as { ok: boolean; value: { rows: unknown[] } };
  assert.ok(listed.ok);
  assert.equal(listed.value.rows.length, 0, 'the put back row is still on the list');
});

test('a refusal comes back in the record\'s own words and writes nothing', async () => {
  const k = await tasks();
  /* `obligations` is not on this record, so the record refuses it, and the sentence is the one the palette says. */
  const out = await create.addRow({ register: 'obligations', title: 'Rent' }, NOW, BASE, served(k));
  assert.equal(out.ok, false);
  assert.ok(!out.ok && out.fix.trim().length > 0, 'the refusal says nothing');
});

/* ── the sample's currency ────────────────────────────────────────────────── */

/** A record holding the build's own Money owed, less its links, with one row the owner wrote in dollars. */
async function owedInDollars(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(REGISTERS.obligations)) as Record<string, unknown>;
  const fields = (body.fields as { id: string; type: string }[]).filter((f) => f.type !== 'ref');
  const put = await k.install([{ id: 'register.obligations', kind: 'register', body: { ...body, fields } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  const rent = k.create('obligations', { what: 'Studio rent', direction: 'owed_by_me', amount: { amount: 4500, currency: 'USD' }, due: '2026-10-01', state: 'open' } as never, OWNER);
  assert.ok(rent.ok, JSON.stringify(rent));
  return k;
}

const currencies = (k: Kernel): string[] => {
  const listed = k.list({ register: 'obligations', limit: 50 } as never) as { ok: boolean; value: { rows: { fields: Record<string, unknown> }[] } };
  assert.ok(listed.ok);
  return listed.value.rows.map((r) => String((r.fields.amount as { currency?: string } | undefined)?.currency ?? 'none'));
};

test('ON A RECORD HELD IN DOLLARS THE ADD WRITES NO AMOUNT, and never the sample\'s pounds', async () => {
  /* MEASURED: one press of "Add to Money owed: rent" on a record imported in USD wrote
     `owed_by_me`, GBP 0.00, due today, and "Owed by you, 30 days" went from USD 45.00 to no value at all, two parts in
     two currencies, until somebody found the row. The palette handed `capturedFields` no rows, so the money field took
     `currencyFor` over the FIXTURE, whose rows are sterling. Nobody on this record typed a currency or an amount. */
  const k = await owedInDollars();
  assert.deepEqual(currencies(k), ['USD']);
  const out = await create.addRow({ register: 'obligations', title: 'rent' }, NOW, BASE, served(k));
  /* NO ROW IN A CURRENCY THE RECORD NEVER USED, whether the record takes the row or refuses it. */
  assert.deepEqual(currencies(k), ['USD'], 'the palette wrote an amount nobody typed onto a dollar record');
  /* THE LIST REQUIRES AN AMOUNT AND THE SENTENCE NAMED NONE, so the record refuses the row in its own words and says
     which field is missing, which is the honest end of it. */
  assert.equal(out.ok, false, 'a row was written with no amount typed');
  assert.match(!out.ok ? out.fix : '', /amount/iu, 'the refusal does not say what is missing');
});

test('no list\'s add writes a money field, since the sentence has nowhere to type one', async () => {
  /* EVERY REQUIRED MONEY FIELD IN THE BUILD, not only `obligations`: `transactions` and
     `recurring` were found writing the same GBP 0.00. Read off the fields the press sends, through a writer that keeps them. */
  const sent: Record<string, unknown>[] = [];
  const spy = (async (url: string | URL | Request, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body ?? '{}')) as { fields?: Record<string, unknown> };
    if (new URL(String(url)).pathname === '/api/create') sent.push(args.fields ?? {});
    return json(400, { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Say an amount.' } });
  }) as Fetch;
  const withMoney = Object.values(REGISTERS).filter((r) => r.title && r.fields.some((f) => f.type === 'money' && f.required));
  assert.ok(withMoney.length >= 3, 'the build requires money on fewer lists than were measured');
  for (const r of withMoney) {
    sent.length = 0;
    await create.addRow({ register: r.id, title: 'a line' }, NOW, BASE, spy);
    assert.equal(sent.length, 1, `${r.id}: the press sent no create`);
    for (const f of r.fields.filter((x) => x.type === 'money'))
      assert.ok(!Object.hasOwn(sent[0]!, f.id), `${r.id}.${f.id} was written as ${JSON.stringify(sent[0]![f.id])}, and nobody typed it`);
  }
});

test('what the receipt says was filled in is what was written, and no amount', async () => {
  assert.equal(typeof create.addedFields, 'function', 'create.ts exports no addedFields, so the write cannot be read without a press');
  const { fields, filled } = await create.addedFields('obligations', 'rent', NOW);
  assert.ok(!Object.hasOwn(fields, 'amount'));
  assert.ok(!filled.some((f) => /^amount\b/u.test(f)), `the receipt says an amount: ${filled.join(', ')}`);
  /* AND EVERYTHING ELSE THE LIST'S OWN LINE FILLS IS STILL FILLED AND SAID: the direction, the day, the state. */
  const line = capturedFields('obligations', 'rent', [], NOW);
  assert.equal(filled.length, line.filled.length - 1);
  for (const said of filled) assert.ok(line.filled.includes(said), `${said} is not what the list's line says`);
});

/* ── who the row is offered to ────────────────────────────────────────────── */

const BOOTED = {
  registers: [
    { id: 'tasks', name: 'Tasks', count: 0 },
    { id: 'obligations', name: 'Money owed', count: 3 },
  ],
  now: '2026-09-24T12:00:00Z',
  record: { slug: 's', name: 'S', locale: 'en' },
};
const shellAt = (me: Record<string, unknown>) => layoutOf({ ...BOOTED, me: { kind: 'person', person: 'p_2', name: null, ...me } } as never);

test('THE ADD ROW IS OFFERED TO A CALLER WHO MAY ADD, and to nobody else', () => {
  assert.equal(typeof create.offered, 'function', 'create.ts exports no offered, so the palette cannot ask who may add');
  /* MEASURED: a `read` member typed "Add to Money owed: rent", the row was drawn, and the
     press was refused by `create`'s own `guard(ctx, 'append', ...)`. A row that cannot run is absent, not drawn to fail. */
  const reader = shellAt({ level: 'read' });
  assert.deepEqual(create.offered(reader), [], 'a read-level caller was offered the add row');
  assert.equal(create.creation('Add to Money owed: rent', create.offered(reader)), null);
  /* `append` IS THE RUNG THAT ADDS AND DOES NOT READ, and every rung above it adds too (`LEVEL_REACH`). */
  for (const level of ['append', 'write', 'decide', 'owner'])
    assert.deepEqual(create.creation('Add to Money owed: rent', create.offered(shellAt({ level }))), { register: 'obligations', title: 'rent' }, `${level} may add and was not offered`);
  /* A LEVEL THIS BUILD DOES NOT KNOW REACHES NOTHING, as `answering.ts` reads the same ladder. */
  assert.deepEqual(create.offered(shellAt({ level: 'admin' })), []);
});

test('AN EMPTY LIST IS OFFERED, which is the one moment the row helps most', () => {
  /* THE PALETTE READ THE RAIL'S LISTS, and the rail drops a list with no rows (`boot-live.ts`), so "Add to Tasks: buy
     milk" on an empty Tasks drew nothing. `shell.lists` holds every list, empty or not. */
  const owner = shellAt({ level: 'owner' });
  assert.ok(!owner.index.registers.some((r) => r.id === 'tasks'), 'the fixture no longer has an empty list off the rail');
  assert.deepEqual(create.creation('Add to Tasks: buy milk', create.offered(owner)), { register: 'tasks', title: 'buy milk' });
  /* EVERY LIST THIS BUILD DECLARES HAS A TITLE, so dropping `addable` from `offered` passed every test above. A list the
     record holds and this build does not declare is where it bites: nothing here can say which field its title is. */
  assert.deepEqual(create.offered({ lists: [{ id: 'kilns', name: 'Kilns' }], me: { level: 'owner', lists: null } }), []);
});

test('a colleague held to named lists is offered those, and the sample offers every list it can title', () => {
  /* HELD TO LISTS, `level` IS `null` and the shell's `read` is a fallback (`boot-live.ts`), so reading the level alone
     would take the row from a bookkeeper given `write` on the one list they were invited to fill. */
  const held = layoutOf({ ...BOOTED, registers: [{ id: 'tasks', name: 'Tasks', count: 0 }], me: { kind: 'person', person: 'p_3', name: null, level: null } } as never);
  assert.deepEqual(held.me.lists, ['tasks']);
  assert.deepEqual(create.creation('Add to Tasks: file receipts', create.offered(held)), { register: 'tasks', title: 'file receipts' });
  /* A SHELL WITH NOBODY IN IT OFFERS NOTHING: a refused `boot` is a screen that could not be drawn, not an owner. */
  assert.deepEqual(create.offered({ lists: [{ id: 'tasks', name: 'Tasks' }] }), []);
  /* THE SAMPLE IS AN OWNER'S RECORD, and its press says nothing was saved, as every write there does. */
  const sample = { lists: registers.map((l) => ({ id: l.id, name: l.name })), me: { level: 'owner', lists: null } };
  assert.deepEqual(create.offered(sample).map((l) => l.id), create.addable(registers).map((l) => l.id));
});

/* ── the plain line (EXP-D13) ─────────────────────────────────────────────── */

const INTO = { register: 'tasks' };

test('A PLAIN LINE OFFERS ONE ROW, into the list the record\'s capture writes to, titled with the line', () => {
  assert.equal(typeof create.plainAdd, 'function', 'create.ts exports no plainAdd, so a plain line offers nothing to add');
  assert.deepEqual(create.plainAdd('call the bank tomorrow', INTO), { register: 'tasks', title: 'call the bank tomorrow', plain: true, chips: [] });
  assert.deepEqual(create.plainAdd('  water the ferns  ', { register: 'chores' })?.register, 'chores', 'the list is the one handed in');
  /* A LINE THAT STARTS WITH "ADD" IS STILL A THING TO DO, as long as it is not the sentence row's own words. */
  assert.ok(create.plainAdd('add tomatoes to the order', INTO));
  assert.equal(create.words.plain('task'), 'Add as a task');
  assert.equal(create.words.plain('Order'), 'Add as an order');
});

test('a question offers no row, since it is Slash\'s; nor does one word, nor another row\'s sentence', () => {
  for (const q of ['what is due this week', 'what is due this week?', 'have I paid the rent', 'who is on call'])
    assert.equal(create.plainAdd(q, INTO), null, `"${q}" was offered as a row to add`);
  for (const q of ['', 'bank', '   ferns  '])
    assert.equal(create.plainAdd(q, INTO), null, `"${q}" is one word and was offered as a row to add`);
  for (const q of ['add to', 'add to tas', 'add to tasks: buy milk', 'new page', 'new page: Wedding', 'new pa'])
    assert.equal(create.plainAdd(q, INTO), null, `"${q}" is another row's sentence and was offered as a plain row`);
});

test('NO CAPTURE LIST OFFERS NONE: the list comes from the Home page, never from a name in code', async () => {
  assert.equal(create.plainAdd('call the bank tomorrow', null), null);
  assert.equal(create.homeCapture([{ kind: 'note', body: 'Hello' }, { kind: 'todo', register: 'tasks' }]), null);
  assert.equal(create.homeCapture([{ kind: 'note' }, { kind: 'capture', register: 'chores' }, { kind: 'capture', register: 'tasks' }]), 'chores', 'the first capture wins');
  /* TODAY'S BODY, which Home draws for a record with no Home page of its own, captures where the record keeps tasks a
     reader may add to, and nowhere otherwise. */
  const { todayHome } = await import('../home/default-home.ts');
  assert.equal(create.homeCapture(todayHome({ tasks: true, adds: true, money: true }).blocks), 'tasks');
  assert.equal(create.homeCapture(todayHome({ tasks: true, adds: false, money: true }).blocks), null);
  assert.equal(create.homeCapture(todayHome({ tasks: false, adds: false, money: true }).blocks), null);
});

test('THE PLAIN ROW RANKS AFTER EVERY MATCH, so Enter runs a match before it adds', () => {
  const code = readFileSync(new URL('./Palette.svelte', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  const cut = code.indexOf('const kept = out.slice(0, CAP);');
  const pushed = code.indexOf("id: 'c-add-plain'");
  assert.ok(cut > 0 && pushed > cut, 'the plain row is pushed before the matches are cut, so it is not last');
  assert.match(code, /items\.every\(\(r\) => r\.plain === true\) \? Number\.MAX_SAFE_INTEGER/u, 'the plain row\'s heading is not sorted after every other heading');
  assert.match(code, /r\.plain !== true\)\.length/u, 'the plain row counts as a place, so it hides Slash\'s row');
});

test('A PLAIN LINE ADDS WITH WHAT IT SAID: the day it named is written, and not said to have been filled', async () => {
  const k = await tasks();
  const chips = [{ kind: 'day' as const, field: 'by', label: 'tomorrow', said: 'due Fri 25 Sep', value: '2026-09-25', from: 14, to: 22, words: 'tomorrow' }];
  const out = await create.addRow({ register: 'tasks', title: 'call the bank', plain: true, chips }, NOW, BASE, served(k));
  assert.ok(out.ok, JSON.stringify(out));
  const row = k.get('tasks#1');
  assert.equal(row?.fields.what, 'call the bank');
  assert.equal(row?.fields.by, '2026-09-25', 'the day the line named was not written');
  assert.ok(!out.filled.some((f) => f.startsWith('by ') || f.startsWith('due ')), `the day was said to be filled: ${out.filled.join(', ')}`);
  const back = await out.back();
  assert.ok(back.ok, 'Put back did not take the row off the list');
});
