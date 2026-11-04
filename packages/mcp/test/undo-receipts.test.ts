/**
 * Every write ends with a receipt, and `act undoOwn` takes back only the caller's own writes.
 *
 * THE RECEIPT NAMES WHAT CHANGED AND THE CALL THAT TAKES IT BACK. `undoOwn` is scoped to the caller's own run: another
 * agent's run is refused FORBIDDEN, so an agent cannot undo what it did not do. `act` took `undo`'s place on the list, and
 * `undo` still answers by its old name until `FOLDED_UNTIL`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { FOLDED, TOOLS, withCalls } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 9);

const as = (id: string): CallContext =>
  ({
    principal: { kind: 'token', id, scope: 'write', person: 'p_seed', level: 'owner' },
    session: { client_id: id, cwd: '/Users/studio/Code/kiln', host: 'Studio.local', agent: 'claude' },
  }) as CallContext;

let n = 0;

async function open() {
  const record = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  await installSeed(record.kernel);
  /* AS A HOST HANDS THE RECORD TO THE DOOR: `act` needs the table it is held to, and `undoOwn` is the row a receipt names. */
  const api = withCalls(record, async () => ({ ok: true, value: [] }) as never, () => [{ name: 'undoOwn', group: 'DATA', writes: true, what: 'Take back one of your own writes.' }]);
  const call = async (name: string, args: Record<string, unknown>, ctx: CallContext) => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api, ctx)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const r = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
    return { error: r.isError === true, text: r.content.map((c) => c.text).join('\n'), value: r.structuredContent };
  };
  return { api, call };
}

const batchOf = (text: string): string => /call act with call "undoOwn" and args \{"batch": "([^"]+)"\}/u.exec(text)?.[1] ?? '';
const undo = (batch: string) => ({ call: 'undoOwn', args: { batch } });

test('A CREATE ENDS WITH A RECEIPT IN NAMES AND THE BATCH, and undo by the same run puts it back', async () => {
  const { call } = await open();
  const me = as('t_one');
  const made = await call('create', { register: 'tasks', fields: { what: 'Receipt a write' } }, me);
  assert.ok(!made.error, made.text);
  const last = made.text.split('\n').at(-1) ?? '';
  /* THE TEXT NAMES IT ONCE, in the line above the receipt, and the receipt beside the answer names it whole. */
  assert.match(made.text.split('\n')[0] ?? '', /Receipt a write/u, made.text);
  assert.match(last, /^Receipt: To undo, call act with call "undoOwn" and args \{"batch": /u, last);
  assert.ok(batchOf(last) !== '', last);
  assert.doesNotMatch(last, /key|secret|password/iu);
  assert.match(String(made.value.receipt), /^Receipt: .*Receipt a write.*call act with call "undoOwn"/u);
  const back = await call('act', undo(batchOf(last)), me);
  assert.ok(!back.error, back.text);
  assert.equal(back.value.undone, true);
  /* AND AN UNDO IS THE WAY BACK, SO IT HAS NO RECEIPT OF ITS OWN, least of all one sending the agent to the owner. */
  assert.doesNotMatch(back.text, /Receipt:/u, back.text);
  const again = await call('act', undo(batchOf(last)), me);
  assert.ok(!again.error, again.text);
  assert.equal(again.value.put, 0, 'a second undo of the same batch puts nothing back');
  /* THE OLD NAME STILL ANSWERS, for a session that cached the older list. */
  const old = await call('undo', { batch: batchOf(last) }, me);
  assert.ok(!old.error, old.text);
  assert.equal(old.value.put, 0);
});

test('ANOTHER RUN CANNOT UNDO IT: FORBIDDEN, and the row stays', async () => {
  const { call } = await open();
  const made = await call('create', { register: 'tasks', fields: { what: 'Mine alone' } }, as('t_one'));
  assert.notEqual(batchOf(made.text), '', made.text);
  for (const [name, args] of [['act', undo(batchOf(made.text))], ['undo', { batch: batchOf(made.text) }]] as const) {
    const refused = await call(name, args, as('t_two'));
    assert.equal(refused.error, true, name);
    assert.equal(refused.value.code, 'FORBIDDEN', name);
  }
  /* AND THE ROW STAYED, which the name of this test says and nothing here read. */
  assert.equal((await call('get', { spoken: String(made.value.spoken) }, as('t_one'))).error, false);
});

test('A BATCH THAT WAS NEVER WRITTEN IS ROW_UNKNOWN, and undo says it takes things away', async () => {
  const { call } = await open();
  const r = await call('act', undo('nothing-wrote-this'), as('t_one'));
  assert.equal(r.value.code, 'ROW_UNKNOWN');
  /* WHAT UNDOES A WRITE IS MARKED AS TAKING THINGS AWAY, listed and folded alike. */
  assert.equal(TOOLS.find((t) => t.name === 'act')?.destructive, true);
  assert.equal(FOLDED.find((t) => t.name === 'undo')?.destructive, true);
});
