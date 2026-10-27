/**
 * Every write ends with a receipt, and `undo` takes back only the caller's own writes.
 *
 * THE RECEIPT NAMES WHAT CHANGED AND THE BATCH THAT TAKES IT BACK. `undo` is scoped to the caller's own run: another
 * agent's run is refused FORBIDDEN, so an agent cannot undo what it did not do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TOOLS } from '../src/index.ts';
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
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  await installSeed(api.kernel);
  const call = async (name: string, args: Record<string, unknown>, ctx: CallContext) => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api, ctx)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const r = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
    return { error: r.isError === true, text: r.content.map((c) => c.text).join('\n'), value: r.structuredContent };
  };
  return { api, call };
}

const batchOf = (text: string): string => /call undo with batch "([^"]+)"/u.exec(text)?.[1] ?? '';

test('A CREATE ENDS WITH A RECEIPT IN NAMES AND THE BATCH, and undo by the same run puts it back', async () => {
  const { call } = await open();
  const me = as('t_one');
  const made = await call('create', { register: 'tasks', fields: { what: 'Receipt a write' } }, me);
  assert.ok(!made.error, made.text);
  const last = made.text.split('\n').at(-1) ?? '';
  /* THE TEXT NAMES IT ONCE, in the line above the receipt, and the receipt beside the answer names it whole. */
  assert.match(made.text.split('\n')[0] ?? '', /Receipt a write/u, made.text);
  assert.match(last, /^Receipt: To undo, call undo with batch /u, last);
  assert.ok(batchOf(last) !== '', last);
  assert.doesNotMatch(last, /key|secret|password/iu);
  assert.match(String(made.value.receipt), /^Receipt: .*Receipt a write.*call undo with batch /u);
  const back = await call('undo', { batch: batchOf(last) }, me);
  assert.ok(!back.error, back.text);
  assert.equal(back.value.undone, true);
  const again = await call('undo', { batch: batchOf(last) }, me);
  assert.ok(!again.error, again.text);
  assert.equal(again.value.put, 0, 'a second undo of the same batch puts nothing back');
});

test('ANOTHER RUN CANNOT UNDO IT: FORBIDDEN, and the row stays', async () => {
  const { call } = await open();
  const made = await call('create', { register: 'tasks', fields: { what: 'Mine alone' } }, as('t_one'));
  const refused = await call('undo', { batch: batchOf(made.text) }, as('t_two'));
  assert.equal(refused.error, true);
  assert.equal(refused.value.code, 'FORBIDDEN');
});

test('A BATCH THAT WAS NEVER WRITTEN IS ROW_UNKNOWN, and undo is no destructive tool', async () => {
  const { call } = await open();
  const r = await call('undo', { batch: 'nothing-wrote-this' }, as('t_one'));
  assert.equal(r.value.code, 'ROW_UNKNOWN');
  assert.equal(TOOLS.find((t) => t.name === 'undo')?.destructive, undefined);
});
