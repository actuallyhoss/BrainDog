/**
 * `inboxPatterns` and `fileAsSecond` (REC-A03 steps 3 and 5): the report routed as a READ+ read that writes nothing and
 * takes its window as a whole number, the press as an ADMIN write a token never reaches, each handed to the record
 * method of the same name, and each answered `NOT_IN_THIS_BUILD` by a record built before it had one, never a 500.
 *
 * THE GROUPS ARE WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): READ+ grows by the report and ADMIN by the
 * press, and nothing else moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner', reach: ['inbox'] } };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const REPORT = { days: 14, since: '2026-09-24T12:00:00.000Z', doors: [{ door: 'bank-sms', said: 'Card texts', unread: 0, patterns: [] }] };

const call = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, path: string, init?: RequestInit) => {
  const res = await serveApi(new Request(`https://x/api/${path}`, init), handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 8, 12)) });
  return { sql, api };
};

test('THE REPORT IS ONE READ+ READ AND THE PRESS ONE ADMIN WRITE, each routed once from routes/, in plain words', () => {
  const rows = ROUTES.filter((r) => r.name === 'inboxPatterns' || r.name === 'fileAsSecond');
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [['inboxPatterns', 'READ+', false], ['fileAsSecond', 'ADMIN', true]]);
  for (const r of rows) assert.equal(EXTRA_ROUTES.filter((e) => e.name === r.name).length, 1, `${r.name} is served from routes/, not written twice`);
  assert.deepEqual(rows[0]!.takes, { days: 'integer' });
  assert.match(rows[0]!.what, /changes nothing/u);
  for (const r of rows) assert.doesNotMatch(r.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b/u, `${r.name} names things as a person does`);
});

test('THE ROUTE COUNTS BY GROUP: one READ+ read and one ADMIN write, and nothing else grows', () => {
  const by = (names: readonly { group: string }[]) => names.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'inboxPatterns' && r.name !== 'fileAsSecond'));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  assert.equal(all.ADMIN, (without.ADMIN ?? 0) + 1);
  for (const group of ['DATA', 'KEYCHAIN', 'JOBS']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A TOKEN’S GET REACHES THE REPORT WITH ITS WINDOW AS A NUMBER, and answers what the record said', async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      inboxPatterns: async (args: unknown) => (heard.push({ ...(args as object) }), ok(REPORT)),
    }),
  );
  const out = await call(handlers, agent, 'inboxPatterns?days=30');
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, value: REPORT });
  assert.deepEqual(heard, [{ days: 30 }]);
  sql.close();
});

test('THE REAL RECORD ANSWERS A TOKEN WITH THE INBOX REACH, and refuses one held to part of the record', async () => {
  const { sql, api } = await fresh();
  const out = await call(handlersFor(api), agent, 'inboxPatterns');
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal((out.body.value as { days: number }).days, 14);
  const narrow = await call(handlersFor(api), { ...agent, registers: ['tasks'] }, 'inboxPatterns');
  assert.equal(narrow.body.refusal?.code, 'FORBIDDEN');
  assert.doesNotMatch(narrow.body.refusal?.fix ?? '', /—/u);
  sql.close();
});

test('THE PRESS IS A BROWSER’S: a token is refused 403, and an owner’s POST reaches the record with the message', async () => {
  const { sql, api } = await fresh();
  const refused = await call(handlersFor(api), agent, 'fileAsSecond', post({ id: 'raw_1' }));
  assert.equal(refused.status, 403);
  assert.equal(refused.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      fileAsSecond: async (args: unknown) => (heard.push({ ...(args as object) }), ok({ raw: 'raw_1', ingest: 'bank-sms', state: 'matched', wrote: ['tx_1'] })),
    }),
  );
  const out = await call(handlers, owner, 'fileAsSecond', post({ id: 'raw_1' }));
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(heard, [{ id: 'raw_1' }]);
  sql.close();
});

test('A RECORD WITHOUT EITHER ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { inboxPatterns: undefined, fileAsSecond: undefined });
  for (const [path, init] of [['inboxPatterns', undefined], ['fileAsSecond', post({ id: 'raw_1' })]] as const) {
    const out = await call(handlersFor(older as never), owner, path, init);
    assert.equal(out.status, 501, path);
    assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  }
  sql.close();
});
