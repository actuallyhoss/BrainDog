/**
 * A line of a row's history: what a field was and what it is now.
 *
 * A LINE SAID THE NEW VALUE AND NOT THE OLD, and neither when a link changed: "changed Holder", which tells an agent
 * that something moved and not what. The log has carried the old value all along (`from` beside `to`). A changed link
 * names both rows, and a long text says how long it was and is, since neither text fits a line.
 *
 * THE LOG HOLDS A LINK AS A ROW ID. The answer names those rows before it is said (`look.title` by row id answers the
 * row's words with its handle), and a row it could not name is left off the line, never said as its id.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventLine, eventSaid, type Decl, type Look } from '../src/brief.ts';
import { ULID } from '../src/words.ts';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const SAM = '01J8ZQ4M7N2P5R8T0V3X6Y9A1B';
const ADA = '01J8ZQ4M7N2P5R8T0V3X6Y9A2C';
const GONE = '01J8ZQ4M7N2P5R8T0V3X6Y9A3D';

const decl = {
  id: 'tasks',
  name: 'Tasks',
  title: 'title',
  state: 'status',
  fields: [
    { id: 'title', type: 'text' },
    { id: 'status', type: 'enum', values: ['open', 'done'], labels: { open: 'Open', done: 'Done' } },
    { id: 'holder', type: 'ref', to: 'people', label: 'Holder' },
    { id: 'note', type: 'text', label: 'Note' },
    { id: 'due', type: 'day', label: 'Due' },
    { id: 'cost', type: 'money', label: 'Cost' },
    { id: 'size', type: 'enum', values: ['s', 'm'], labels: { s: 'Small', m: 'Medium' }, label: 'Size' },
  ],
} as Decl;

const named: Record<string, string> = { [SAM]: 'Sam (people#1)', [ADA]: 'Ada (people#2)', 'people#1': 'Sam', 'people#2': 'Ada' };
const look: Look = { now: Date.UTC(2026, 9, 13, 12), decl: () => decl, title: (spoken) => named[spoken], actor: (by) => (by === 'p_1' ? 'Noor' : by), decider: 'Noor' };

const edit = (field: string, from: unknown, to: unknown) => ({ ts: '2026-10-13T11:00:00.000Z', actor: 'p_1', kind: 'edit', field, from, to });

test('A CHANGED LINK NAMES BOTH ROWS: "changed Holder from Sam to Ada"', () => {
  const line = eventSaid(edit('holder', SAM, ADA), decl, look);
  assert.equal(line, 'changed Holder from Sam (people#1) to Ada (people#2)');
  assert.match(line, /^changed Holder from Sam .* to Ada /u);
  assert.ok(!ULID.test(line), 'a history line said a row id');
  /* A HANDLE ON THE LOG IS NAMED AS A REF IS ANYWHERE, its words beside it. */
  assert.equal(eventSaid(edit('holder', 'people#1', 'people#2'), decl, look), 'changed Holder from Sam (people#1) to Ada (people#2)');
});

test('A LINK SET, CLEARED, OR TO A ROW NOBODY HERE MAY NAME says what it can and never an id', () => {
  assert.equal(eventSaid(edit('holder', null, ADA), decl, look), 'changed Holder to Ada (people#2)');
  assert.equal(eventSaid(edit('holder', SAM, null), decl, look), 'cleared Holder, which was Sam (people#1)');
  assert.equal(eventSaid(edit('holder', GONE, ADA), decl, look), 'changed Holder to Ada (people#2)');
  assert.equal(eventSaid(edit('holder', SAM, GONE), decl, look), 'changed Holder from Sam (people#1)');
  assert.equal(eventSaid(edit('holder', GONE, GONE), decl, look), 'changed Holder');
  for (const [from, to] of [[GONE, ADA], [SAM, GONE], [GONE, GONE]]) assert.ok(!ULID.test(eventSaid(edit('holder', from, to), decl, look)));
});

test('A LONG TEXT SAYS HOW LONG IT WAS AND IS: "changed Note (1,200 characters before, 1,450 now)"', () => {
  const before = 'word '.repeat(240);
  const now = 'word '.repeat(290);
  assert.equal(before.length, 1200);
  assert.equal(now.length, 1450);
  assert.equal(eventSaid(edit('note', before, now), decl, look), 'changed Note (1,200 characters before, 1,450 now)');
  /* ONE SIDE LONG IS ENOUGH: a short text beside a count would read as the whole change. */
  assert.equal(eventSaid(edit('note', 'Call the baker', now), decl, look), 'changed Note (14 characters before, 1,450 now)');
  assert.equal(eventSaid(edit('note', before, 'Done'), decl, look), 'changed Note (1,200 characters before, 4 now)');
  assert.equal(eventSaid(edit('note', null, now), decl, look), 'changed Note (1,450 characters now)');
  assert.equal(eventSaid(edit('note', before, null), decl, look), 'cleared Note, which was 1,200 characters');
});

test('A SHORT VALUE SAYS BOTH, each as its field says it', () => {
  assert.equal(eventSaid(edit('note', 'Call the baker', 'Call the miller'), decl, look), 'changed Note from Call the baker to Call the miller');
  assert.equal(eventSaid(edit('size', 's', 'm'), decl, look), 'changed Size from Small to Medium');
  assert.equal(eventSaid(edit('cost', { amount: 120_000, currency: 'GBP' }, { amount: 145_000, currency: 'GBP' }), decl, look), 'changed Cost from £1,200 to £1,450');
  /* WHAT A LINE SAID BEFORE IT KNEW THE OLD VALUE, kept where the log has none. */
  assert.equal(eventSaid(edit('note', null, 'Call the miller'), decl, look), 'changed Note to Call the miller');
  assert.equal(eventSaid({ kind: 'edit', field: 'note', to: 'Call the miller' }, decl, look), 'changed Note to Call the miller');
  assert.equal(eventSaid(edit('note', 'Call the baker', ''), decl, look), 'cleared Note, which was Call the baker');
  assert.equal(eventSaid(edit('note', 'Same', 'Same'), decl, look), 'changed Note to Same');
});

test('THE WHOLE LINE: when, who, and the change', () => {
  assert.equal(eventLine(edit('holder', SAM, ADA), decl, look, false).split(' · ').slice(1).join(' · '), 'Noor · changed Holder from Sam (people#1) to Ada (people#2)');
});

/* ── over a real record ────────────────────────────────────────────────── */

const HANDS = { id: 'register.hands', kind: 'register' as const, body: { id: 'hands', name: 'Hands', one: 'hand', title: 'who', fields: [{ id: 'who', type: 'text', required: true }] } as never };
const JOBS = {
  id: 'register.jobs',
  kind: 'register' as const,
  body: { id: 'jobs', name: 'Jobs', one: 'job', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'holder', type: 'ref', to: 'hands', label: 'Holder' }] } as never,
};

test('ON A REAL RECORD a link changed twice reads by both names in a history and in the log, and never by a row id', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 9, 13, 12));
  const api = await createRecordApi({ sql, clock });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  assert.ok((await api.kernel.install([HANDS, JOBS])).ok);
  const by = { actor: 'p_1' };
  for (const who of ['Sam', 'Ada', 'Bo']) assert.ok(api.kernel.create('hands', { who }, by).ok);
  assert.ok(api.kernel.create('jobs', { what: 'Glaze the bowls', holder: 'hands#1' }, by).ok);
  for (const holder of ['hands#2', 'hands#3']) {
    /* An hour on, so each change is a line of its own and not part of the write before it. */
    clock.advance(3_600_000);
    const out = api.kernel.update('jobs', 'jobs#1', { holder }, by);
    assert.ok(out.ok, JSON.stringify(out));
  }
  let id = 0;
  const said = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, api, owner)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    return (reply.result as { content: { text: string }[] }).content.map((c) => c.text).join('\n');
  };
  for (const text of [await said('history', { spoken: 'jobs#1' }), await said('activity', {})]) {
    assert.match(text, /changed Holder from Sam \(hands#1\) to Ada \(hands#2\)/u, text);
    assert.match(text, /changed Holder from Ada \(hands#2\) to Bo \(hands#3\)/u, text);
    assert.doesNotMatch(text, ULID, text);
  }
  sql.close();
});
