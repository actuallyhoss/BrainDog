/**
 * What a conversation keeps, and whose it is.
 *
 * AN ANSWER IS WRITTEN AS IT COMES, so a reader who reloaded or came back finds it, and an answer nobody is reading any
 * more still lands. A turn cut off partway says so instead of passing for a whole answer. And each door on a conversation
 * answers only the person who had it: a message naming someone else's thread lands in a new one of the sender's own.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANSWER_QUIET_MS } from '../src/chat.ts';
import { createSlash, type ChatEvent, type ChatTools, type Inference } from '../src/index.ts';
import { fakeRecord, fixedClock, MEMBER, NOW, OWNER, openSqlite } from './double.ts';

const tools: ChatTools = { list: [], call: async () => ({ text: '' }), apply: async () => ({ ok: true, value: { receipt: 'Done.' } }) };
const reply = (say: string): string => JSON.stringify({ calls: [], say });

const build = (inference: Inference) => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const slash = createSlash({ sql, clock, inference, record: fakeRecord() });
  const ask = async (message: string, thread?: string, ctx = OWNER) => {
    const events: ChatEvent[] = [];
    await slash.chat({ message, ...(thread === undefined ? {} : { thread }) }, ctx, tools, (e) => void events.push(e));
    const id = events.find((e): e is ChatEvent & { type: 'thread' } => e.type === 'thread')?.id ?? '';
    return { id, events };
  };
  const read = (id: string, ctx = OWNER) => {
    const out = slash.thread(id, ctx);
    assert.ok(out.ok, 'the conversation reads back');
    return out.value.turns;
  };
  const list = (ctx = OWNER) => {
    const out = slash.threads(ctx);
    assert.ok(out.ok);
    return out.value.threads;
  };
  return { sql, clock, slash, ask, read, list };
};

const answering = (say: string, during: () => void): Inference => ({
  complete: async () => {
    during();
    return { text: reply(say), usage: { in: 10, out: 10 } };
  },
});

test('an answer has its row while it is being written, and the row is the answer once it lands', async () => {
  let seen: ReturnType<ReturnType<typeof build>['read']> | null = null;
  let listed: ReturnType<ReturnType<typeof build>['list']> | null = null;
  const b: ReturnType<typeof build> = build(
    answering('It is all in the record.', () => {
      const id = b.list()[0]?.id ?? '';
      seen = b.read(id);
      listed = b.list();
    }),
  );
  const { id } = await b.ask('Where does it stand?');
  assert.deepEqual(
    seen!.map((t) => [t.role, t.text, t.answering]),
    [
      ['you', 'Where does it stand?', undefined],
      ['slash', '', true],
    ],
  );
  assert.equal(listed![0]?.answering, true);
  const whole = b.read(id);
  assert.equal(whole.length, 2, 'the answer takes the row it was given, not a second one');
  assert.equal(whole[1]?.text, 'It is all in the record.');
  assert.equal(whole[1]?.answering, undefined);
  assert.equal(b.list()[0]?.answering, undefined);
});

test('nobody reading the stream changes nothing: the answer still lands', async () => {
  const b = build(answering('Still here when you come back.', () => {}));
  const events: ChatEvent[] = [];
  await b.slash.chat({ message: 'Ask and leave' }, OWNER, tools, (e) => {
    events.push(e);
    if (e.type !== 'thread') throw new Error('the reader went away');
  });
  const id = (events[0] as { id: string }).id;
  assert.equal(b.read(id)[1]?.text, 'Still here when you come back.');
});

test('a row whose turn went quiet says it stopped, and keeps what it had', async () => {
  const b = build(answering('Never read.', () => {}));
  const { id } = await b.ask('First');
  b.sql.exec(`UPDATE slash_turn SET text = 'Half an', actions = '{"answering":true}' WHERE thread = ? AND role = 'slash'`, id);
  assert.equal(b.read(id)[1]?.answering, true);
  b.clock.advance(ANSWER_QUIET_MS + 1);
  const [, cut] = b.read(id);
  assert.equal(cut?.stopped, true);
  assert.equal(cut?.answering, undefined);
  assert.equal(cut?.text, 'Half an');
  assert.equal(b.list()[0]?.answering, undefined);
});

test('a model that failed is kept as failed, so a read-back does not pass it for an answer', async () => {
  const b = build({
    complete: async () => {
      throw new Error('the provider did not answer');
    },
  });
  const { id, events } = await b.ask('Anything');
  assert.ok(events.some((e) => e.type === 'error'));
  const [, turn] = b.read(id);
  assert.ok(typeof turn?.error === 'string' && turn.error !== '');
  assert.equal(turn?.answering, undefined);
});

test('a long conversation keeps its first turns and its title', async () => {
  const b = build(answering('Noted.', () => {}));
  const { id } = await b.ask('The very first question');
  for (let i = 0; i < 30; i++) await b.ask(`Follow up ${['a', 'b', 'c'][i % 3]}`, id);
  const turns = b.read(id);
  assert.equal(turns.length, 62);
  assert.equal(turns[0]?.text, 'The very first question');
  assert.equal(b.list()[0]?.title, 'The very first question');
});

test('rename shows in the list and leaves its place; no words hand it back; a deleted one is gone whole', async () => {
  const b = build(answering('Noted.', () => {}));
  const a = await b.ask('Older one');
  b.clock.advance(1000);
  const c = await b.ask('Newer one');
  assert.ok(b.slash.rename(a.id, '  Budget   talk ', OWNER).ok);
  assert.deepEqual(
    b.list().map((t) => t.title),
    ['Newer one', 'Budget talk'],
  );
  assert.ok(b.slash.rename(a.id, '', OWNER).ok);
  assert.equal(b.list()[1]?.title, 'Older one');
  assert.ok(b.slash.rename(c.id, 'Gone soon', OWNER).ok);
  assert.ok(b.slash.remove(c.id, OWNER).ok);
  assert.deepEqual(
    b.list().map((t) => t.id),
    [a.id],
  );
  assert.equal(b.slash.thread(c.id, OWNER).ok, false);
  for (const table of ['slash_turn WHERE thread', 'slash_thread_name WHERE id', 'slash_thread WHERE id']) assert.equal(b.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} = ?`, c.id)?.n, 0, table);
});

test('another person lists, reads, renames and deletes none of it, and a message naming it starts their own', async () => {
  const b = build(answering('Noted.', () => {}));
  const { id } = await b.ask('Private question');
  assert.deepEqual(b.list(MEMBER), []);
  assert.equal(b.slash.thread(id, MEMBER).ok, false);
  assert.equal(b.slash.rename(id, 'Mine now', MEMBER).ok, false);
  assert.equal(b.slash.remove(id, MEMBER).ok, false);
  assert.equal(b.list()[0]?.title, 'Private question');
  const theirs = await b.ask('Their question', id, MEMBER);
  assert.notEqual(theirs.id, id);
  assert.equal(b.read(id).length, 2, "nothing landed in the owner's conversation");
  assert.equal(b.read(theirs.id, MEMBER)[0]?.text, 'Their question');
});
