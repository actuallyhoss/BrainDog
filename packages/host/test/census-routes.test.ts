/**
 * `pagesCensus` and `checkPaths` (REC-A12 job 4): routed as READ+ reads that write nothing, beside `pages`,
 * handed to the record methods of the same names, and answered `NOT_IN_THIS_BUILD` by a record built before it had
 * them, never a 500.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): the route table's READ+ rows grow by exactly
 * these two and nothing that writes grows at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

const NAMES = ['pagesCensus', 'checkPaths'];

const call = async (handlers: ReturnType<typeof handlersFor>, name: string, init?: RequestInit) => {
  const res = await serveApi(new Request(`https://x/api/${name}`, init), handlers, agent);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 9, 12)) });
  return { sql, api };
};

test('BOTH ARE READ+ READS, routed once, right after pages, each with a plain sentence', () => {
  const at = (name: string) => ROUTES.findIndex((r) => r.name === name);
  for (const name of NAMES) {
    const rows = ROUTES.filter((r) => r.name === name);
    assert.deepEqual(rows.map((r) => [r.name, r.group, r.writes]), [[name, 'READ+', false]]);
    assert.match(rows[0]!.what, /changes nothing/u);
    assert.doesNotMatch(rows[0]!.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\{\{/u, 'the sentence names things as a person does');
  }
  assert.deepEqual([at('pagesCensus'), at('checkPaths')], [at('pages') + 1, at('pages') + 2]);
  assert.deepEqual(ROUTES[at('pagesCensus')]!.takes, {});
  assert.deepEqual(ROUTES[at('checkPaths')]!.takes, { document: 'text', register: 'text' });
});

test('THE ROUTES COUNT BY GROUP: two more READ+ and nothing that writes', () => {
  const by = (rows: readonly { group: string }[]) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => !NAMES.includes(r.name)));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 2);
  for (const group of ['DATA', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A TOKEN REACHES EACH RECORD METHOD OF ITS NAME, a census by GET and a document by POST', async () => {
  const { sql, api } = await fresh();
  const heard: [string, unknown][] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api) as typeof api, {
      pagesCensus: async (args: unknown) => (heard.push(['pagesCensus', { ...(args as object) }]), ok({ pages: [] })),
      checkPaths: async (args: unknown) => (heard.push(['checkPaths', { ...(args as object) }]), ok({ paths: [] })),
    }) as never,
  );
  const census = await call(handlers, 'pagesCensus');
  assert.deepEqual([census.status, census.body], [200, { ok: true, value: { pages: [] } }]);
  const body = JSON.stringify({ document: 'See {{kiln.budget}}.' });
  const checked = await call(handlers, 'checkPaths', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  assert.deepEqual([checked.status, checked.body], [200, { ok: true, value: { paths: [] } }]);
  assert.deepEqual(heard, [
    ['pagesCensus', {}],
    ['checkPaths', { document: 'See {{kiln.budget}}.' }],
  ]);
  sql.close();
});

test('A DOCUMENT THAT IS NOT TEXT is refused at the edge, before the record', async () => {
  const { sql, api } = await fresh();
  let reached = false;
  const handlers = handlersFor(Object.assign(Object.create(api) as typeof api, { checkPaths: async () => ((reached = true), ok({ paths: [] })) }) as never);
  const out = await call(handlers, 'checkPaths', { method: 'POST', body: JSON.stringify({ document: { a: 1 } }), headers: { 'content-type': 'application/json' } });
  assert.equal(out.body.ok, false);
  assert.equal(reached, false);
  sql.close();
});

test('A RECORD WITHOUT THEM ANSWERS 501 WITH A SENTENCE, never a 500', async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { pagesCensus: undefined, checkPaths: undefined });
  for (const name of NAMES) {
    const out = await call(handlersFor(older as never), name);
    assert.equal(out.status, 501);
    assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  }
  sql.close();
});
