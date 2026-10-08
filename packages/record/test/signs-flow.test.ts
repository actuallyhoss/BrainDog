/**
 * The red signs in the briefing (SHL-D01 job 2): `context` carries each sign that is red now, by its name and its one
 * sentence, so a session starts knowing what is broken on the record.
 *
 * ONLY TO A CALLER WHO READS THE WHOLE RECORD, as `signs` answers only them (`methods/signs.ts`): a sign counts across
 * every list, so a key held to one list is briefed none, never refused the briefing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 24 * 60 * 60 * 1000;
const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const whole: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' }, session: { repo: 'kiln' } };
const oneList: CallContext = { principal: { kind: 'token', id: 'tok_2', scope: 'read', person: 'p_2', level: 'write' }, registers: ['tasks'], session: { repo: 'kiln' } };

/** A record whose oldest open question is twenty days old, so `oldest-question` reads red. */
async function record(age: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok(api.kernel.propose({ question: 'Fire the kiln on Friday?', body_kind: 'options', body: { ...OPTIONS, about: 'kiln' } } as never, 'slash').ok);
  sql.exec('UPDATE suggestion SET opened_at = ?', new Date(NOW - age * DAY).toISOString());
  return { sql, api };
}

const briefed = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext): Promise<Context> => {
  const r = await api.context({} as never, ctx);
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as Context;
};

test('A WHOLE-RECORD KEY IS BRIEFED THE RED SIGN BY NAME, with the sentence the signs say', async () => {
  const { sql, api } = await record(20);
  const red = api.kernel.signs();
  assert.ok(red.ok);
  const oldest = red.value.signs.find((s) => s.sign === 'oldest-question')!;
  assert.equal(oldest.state, 'red');

  const c = await briefed(api, whole);
  assert.ok(Array.isArray(c.signs));
  const said = c.signs.find((s) => s.name === oldest.name);
  assert.ok(said, `briefed ${JSON.stringify(c.signs)}`);
  assert.equal(said.said, 'The oldest open question is 20 days old.');
  /* Red only: every sign briefed is one the signs read red, and nothing green rides along. */
  const reds = new Set(red.value.signs.filter((s) => s.state === 'red').map((s) => s.name));
  for (const s of c.signs) assert.ok(reds.has(s.name), `${s.name} is not red`);
  for (const s of c.signs) assert.doesNotMatch(`${s.name} ${s.said}`, /—|\b[0-9A-HJKMNP-TV-Z]{26}\b/u);
  sql.close();
});

test('A KEY HELD TO ONE LIST IS BRIEFED NO SIGN, and still briefed', async () => {
  const { sql, api } = await record(20);
  const c = await briefed(api, oneList);
  assert.deepEqual(c.signs, []);
  /* `signs` itself refuses the same key, which is why the briefing says nothing of them. */
  const out = await api.signs({}, oneList);
  assert.equal(out.ok, false);
  sql.close();
});

test('A RECORD WITH NOTHING RED BRIEFS NO SIGN', async () => {
  const { sql, api } = await record(2);
  const c = await briefed(api, whole);
  assert.equal(c.signs.some((s) => s.said.startsWith('The oldest open question')), false);
  sql.close();
});

test('THE INBOX’S WORDS ARE BRIEFED ONLY TO WHO MAY READ THE INBOX, as `signs` tells each caller', async () => {
  const { sql, api } = await record(2);
  /* Two open questions in the same words share one cause, so `questions-by-cause` reads red and quotes them. */
  assert.ok(api.kernel.propose({ question: 'Fire the kiln on Friday?', body_kind: 'options', body: { ...OPTIONS, about: 'kiln-two' } } as never, 'slash').ok);
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
  const reached: CallContext = { ...whole, principal: { ...whole.principal, reach: ['inbox'] } as CallContext['principal'] };
  const quoted = (c: Context) => c.signs.find((s) => s.said.includes('Fire the kiln'));
  for (const who of [owner, reached]) assert.ok(quoted(await briefed(api, who)), 'an inbox reader reads the question');
  const quiet = await briefed(api, whole);
  assert.equal(quoted(quiet), undefined, JSON.stringify(quiet.signs));
  /* The briefing says what `signs` says to the same key, red sign by red sign. */
  const told = await api.signs({}, whole);
  assert.ok(told.ok);
  const reds = told.value.signs.filter((s) => s.state === 'red').map((s) => ({ name: s.name, said: s.said }));
  assert.ok(reds.length > 0);
  assert.deepEqual(quiet.signs, reds);
  sql.close();
});
