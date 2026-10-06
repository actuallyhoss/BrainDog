/**
 * `undo` and `undoRun`, the server's Undo (DIRECTION §37): routed as ADMIN writes and handed to the record method of the
 * same name with the arguments as sent. The record has both now (`record/src/methods/undo.ts`), so the host calls them
 * as it calls every other method of its own table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const ask = async (handlers: ReturnType<typeof handlersFor>, name: string, body?: unknown) => {
  const request = body === undefined ? new Request(`https://x/api/${name}`) : new Request(`https://x/api/${name}`, { method: 'POST', body: JSON.stringify(body) });
  const res = await serveApi(request, handlers, owner);
  return { status: res.status, body: (await res.json()) as Answer };
};

test('UNDO AND UNDO A RUN ARE ADMIN WRITES, each with a plain sentence', () => {
  const rows = ROUTES.filter((r) => r.name === 'undo' || r.name === 'undoRun');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [
    ['undo', 'ADMIN', true],
    ['undoRun', 'ADMIN', true],
  ]);
  for (const r of rows) assert.doesNotMatch(r.what, /—|\bid\b|\brow\b/u, `${r.name}'s sentence`);
});

test('THEY REACH THE RECORD METHOD OF THEIR NAME, with the arguments as sent, and a GET is refused', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const heard: [string, unknown][] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      undo: async (args: unknown) => (heard.push(['undo', args]), ok({ put_back: 1 })),
      undoRun: async (args: unknown) => (heard.push(['undoRun', args]), ok({ put_back: 12, skipped: 2 })),
    }),
  );
  assert.equal((await ask(handlers, 'undo', { batch: 'b1', dry: true })).status, 200);
  assert.deepEqual((await ask(handlers, 'undoRun', { run: 'S4', hash: 'h' })).body, { ok: true, value: { put_back: 12, skipped: 2 } });
  assert.deepEqual(heard.map(([n, a]) => [n, { ...(a as object) }]), [
    ['undo', { batch: 'b1', dry: true }],
    ['undoRun', { run: 'S4', hash: 'h' }],
  ]);
  assert.equal((await ask(handlers, 'undo')).status, 405);
  sql.close();
});

test('THE RECORD ANSWERS THEM ITSELF NOW: asked for nothing, each says what it needs, and nothing is changed', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 6)) });
  const handlers = handlersFor(api);
  for (const [name, at] of [['undo', 'batch'], ['undoRun', 'run']] as const) {
    const out = await ask(handlers, name, { dry: true });
    assert.equal(out.body.refusal?.code, 'REQUIRED_MISSING', `${name} answered ${JSON.stringify(out.body)}`);
    assert.equal((out.body.refusal as { at?: string } | undefined)?.at, at);
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—|\brows?\b/u, `${name}'s sentence`);
  }
  sql.close();
});
