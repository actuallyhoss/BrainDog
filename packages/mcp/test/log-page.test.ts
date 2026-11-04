/**
 * `log` with a page: a visual hung on the thing `spoken` names, `note` as its title, answered with a receipt whose batch
 * `undo` takes back. Folded into `log`, since a visual changes no value and the list has no tokens for a tool of its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type VisualStore } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 23, 9);
const me = {
  principal: { kind: 'token', id: 't_page', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 't_page', cwd: '/Users/studio/Code/kiln', host: 'Studio.local', agent: 'claude' },
} as CallContext;

let n = 0;

test('A PAGE ON log HANGS ON THE TASK, ITS RECEIPT NAMES IT, AND undo TAKES IT BACK', async () => {
  const pages = new Map<string, Uint8Array>();
  const store: VisualStore = { putPage: async (h, b) => void pages.set(h, b), getPage: async (h) => pages.get(h) ?? null, file: async () => null };
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW), visuals: store });
  await installSeed(api.kernel);
  const call = async (name: string, args: Record<string, unknown>) => {
    const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api, me)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const r = reply.result as { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
    return { error: r.isError === true, text: r.content.map((c) => c.text).join('\n'), value: r.structuredContent };
  };
  const made = await call('create', { register: 'tasks', fields: { what: 'Draw the payroll calendar' } });
  assert.ok(!made.error, made.text);

  const drawn = await call('log', { spoken: 'Draw the payroll calendar', note: 'Payroll calendar', page: '<h1>Payroll</h1><svg viewBox="0 0 10 10"></svg>' });
  assert.ok(!drawn.error, drawn.text);
  /* AN AGENT'S PAGE IS A DRAFT WHETHER IT SAYS SO OR NOT (owner's call, 24 Oct): a person keeps it or throws it away. */
  assert.match(drawn.text, /^Version 1 of "Payroll calendar" waits on "Draw the payroll calendar" in Tasks as a draft/u);
  const batch = /call act with call "undoOwn" and args \{"batch": "([^"]+)"\}/u.exec(drawn.text)?.[1];
  assert.ok(batch, drawn.text);
  assert.equal(pages.size, 1);

  const refused = await call('log', { spoken: 'Draw the payroll calendar', note: 'Off the page', page: '<img src="https://x.test/a.png">' });
  assert.ok(refused.error);
  assert.match(refused.text, /This page cannot be kept because its src names/u);

  const back = await call('undo', { batch });
  assert.ok(!back.error, back.text);
  const left = await api.visuals({ on: 'Draw the payroll calendar' }, me);
  assert.ok(left.ok);
  assert.deepEqual(left.value.visuals, []);

  /* draft: true HANDS IT IN AS A DRAFT, which waits for the person to keep or throw away. */
  const drafted = await call('log', { spoken: 'Draw the payroll calendar', note: 'Payroll calendar', page: '<h1>Payroll, again</h1>', draft: true });
  assert.ok(!drafted.error, drafted.text);
  assert.match(drafted.text, /^Version 1 of "Payroll calendar" waits on .* as a draft/u);
  const waits = await api.visuals({ on: 'Draw the payroll calendar' }, me);
  assert.ok(waits.ok);
  assert.deepEqual(waits.value.visuals.map((v) => [v.kept, v.draft?.version]), [[false, 1]]);
  assert.ok((await call('log', { spoken: 'Draw the payroll calendar', note: 'x', page: '<h1>x</h1>', draft: 'yes' })).error);
});
