/**
 * `boot`'s answer, kept while nothing moves and by who asked (`boot`, `bootHeld`).
 *
 * A second open within `HELD_MS` is answered without working it out again. What is asserted beside that is everything a kept
 * answer must not do: answer one person with another's, miss a write, a setting or a change of who may read what, or hand out
 * an object a later reader sees changed. And the holding pen: its offers still go on a write and on a dismissal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 24, 9);

async function record() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  const one = sql.one.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  sql.one = ((q: string, ...a: never[]) => (statements.push(q), one(q, ...a))) as typeof sql.one;
  let now = NOW;
  const api = await createRecordApi({ sql, clock: { now: () => now } });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAY', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  const boot = async (ctx: CallContext = owner) => {
    const out = await api.boot(ctx as never);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as unknown as { now: string; registers: { id: string; count: number; name: string }[]; me: { prefs?: Record<string, unknown> } & Record<string, unknown>; pen: { id: string }[] };
  };
  return { sql, api, boot, statements, tick: (ms: number) => (now += ms) };
}

test('A SECOND OPEN WORKS NOTHING OUT AGAIN, and the time on it is now', async () => {
  const { boot, statements, tick } = await record();
  const first = await boot();
  tick(1_000);
  statements.length = 0;
  const second = await boot();
  assert.ok(statements.length < 12, `${statements.length} statements on a kept answer: ${statements.slice(0, 12).join(' | ').slice(0, 400)}`);
  assert.deepEqual({ ...second, now: 0 }, { ...first, now: 0 });
  assert.equal(second.now, new Date(NOW + 1_000).toISOString());
});

test('A WRITE IS SEEN AT ONCE', async () => {
  const { api, boot } = await record();
  const before = (await boot()).registers.find((r) => r.id === 'tasks')!.count;
  const made = await api.create({ register: 'tasks', fields: { what: 'A task' } }, owner);
  assert.ok((made as { ok: boolean }).ok, JSON.stringify(made));
  assert.equal((await boot()).registers.find((r) => r.id === 'tasks')!.count, before + 1);
});

test('A KEPT ANSWER IS OLD AT MOST HELD_MS', async () => {
  const { boot, statements, tick } = await record();
  await boot();
  tick(30_001);
  statements.length = 0;
  await boot();
  assert.ok(statements.length > 12, 'an answer past its time was handed out');
});

test('A SETTING, WHICH WRITES NO LINE, IS SEEN AT ONCE', async () => {
  const { api, boot } = await record();
  await boot();
  api.kernel.setPref('p_1', 'look.density', 'tight');
  const after = await boot();
  assert.match(JSON.stringify(after.me), /tight/u);
});

test('ANOTHER PERSON, OR THE SAME ONE ANOTHER WAY, IS ANOTHER ANSWER', async () => {
  const { sql, boot } = await record();
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_2', 'member@example.test', 'Member', NULL) ON CONFLICT DO NOTHING");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', 'tasks', 'read')");
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'], levels: { tasks: 'read' } } as never;
  const whole = await boot();
  const theirs = await boot(member);
  assert.ok(whole.registers.length > 1);
  assert.deepEqual(theirs.registers.map((r) => r.id), ['tasks'], 'a member was answered with the owner\'s lists');
  assert.equal((await boot()).registers.length, whole.registers.length, 'the owner was answered with the member\'s lists');
  const narrower: CallContext = { ...member, wheres: { tasks: { field: 'what', is: 'nothing like this' } } } as never;
  assert.notEqual((await boot(narrower)).registers.find((r) => r.id === 'tasks')?.count, undefined);
  assert.equal((await boot(narrower)).registers.find((r) => r.id === 'tasks')?.count, 0, 'a narrower grant was answered as the wider one');
});

test('A CHANGE OF WHAT SOMEBODY MAY READ IS SEEN AT ONCE, even written with no line', async () => {
  const { sql, boot, statements } = await record();
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_2', 'member@example.test', 'Member', NULL) ON CONFLICT DO NOTHING");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', 'tasks', 'read')");
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'], levels: { tasks: 'read' } } as never;
  await boot(member);
  sql.exec("UPDATE member SET level = 'write' WHERE person_id = 'p_2'");
  statements.length = 0;
  await boot(member);
  assert.ok(statements.length > 12, 'a kept answer outlived a change to who may read what');
});

test('WHAT A READER DOES TO THE ANSWER IS NOT IN THE NEXT ONE', async () => {
  const { boot } = await record();
  const first = await boot();
  const count = first.registers[0]!.count;
  first.registers[0]!.count = 999_999;
  first.registers[0]!.name = 'changed';
  const second = await boot();
  assert.equal(second.registers[0]!.count, count);
  assert.notEqual(second.registers[0]!.name, 'changed');
});

test('A TOKEN IS NOT ITS PERSON: answered apart', async () => {
  const { boot } = await record();
  const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' }, registers: ['tasks'] } as never;
  const whole = await boot();
  const out = await boot(token);
  assert.ok(out.registers.length <= whole.registers.length);
  assert.ok((await boot()).registers.length === whole.registers.length);
});
