/**
 * `skillsBehind`, which skills have lessons their text does not take in yet: one READ+ row that writes nothing, taking
 * a whole number, in one plain sentence.
 *
 * THE ROW IS TESTED BY ITSELF FIRST, so the file is green before `routes/index.ts` spreads it. Once it does, the table
 * serves that row once, the READ+ rows grow by exactly one and nothing that writes grows; and a GET reaches the record
 * method of the same name with the limit as it was sent, or `NOT_IN_THIS_BUILD` from a record built before it had one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { ROUTES as OWN } from '../src/routes/skills-behind.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const SAID = { skills: [{ skill: 'skills#3', name: 'deploy', project: 'Copperleaf', behind: [{ learning: 'LN12', lesson: 'Run the migrations before the deploy.' }], count: 1 }], total: 1 };

const wired = () => EXTRA_ROUTES.some((r) => r.name === 'skillsBehind');

test('SKILLS BEHIND IS ONE READ+ READ, written once in its file, taking a whole number, in a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['skillsBehind', 'READ+', false]]);
  assert.deepEqual(OWN[0]!.takes, { limit: 'integer' });
  assert.equal(OWN[0]!.postRead, undefined, 'a limit fits an address');
  const what = OWN[0]!.what;
  assert.match(what, /changes nothing/u);
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{/u, 'the sentence names things as a person does');
});

test('THE ROUTE COUNTS BY GROUP once routes/index.ts spreads it: one more READ+ route and nothing that writes', (t) => {
  if (!wired()) return t.skip('skillsBehind is not spread in routes/index.ts yet (blocked to the integrator)');
  assert.deepEqual(ROUTES.filter((r) => r.name === 'skillsBehind'), [OWN[0]], 'the table serves the row its file wrote');
  assert.equal(EXTRA_ROUTES.filter((r) => r.name === 'skillsBehind').length, 1, 'served from routes/, not written twice');
  const by = (rows: readonly { group: string }[]) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => r.name !== 'skillsBehind'));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  for (const group of ['DATA', 'KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A GET REACHES THE RECORD METHOD OF ITS NAME with the limit as sent, and a record without it is NOT_IN_THIS_BUILD', async (t) => {
  if (!wired()) return t.skip('skillsBehind is not spread in routes/index.ts yet (blocked to the integrator)');
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 9, 14, 12)) });
  const heard: unknown[] = [];
  const handlers = handlersFor(
    Object.assign(Object.create(api), { skillsBehind: async (args: unknown) => (heard.push({ ...(args as object) }), ok(SAID)) }) as never,
  );
  const res = await serveApi(new Request('https://x/api/skillsBehind?limit=5'), handlers, owner);
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as Answer).value, SAID);
  assert.deepEqual(heard, [{ limit: 5 }]);

  const bad = await serveApi(new Request('https://x/api/skillsBehind?limit=many'), handlers, owner);
  assert.equal(((await bad.json()) as Answer).refusal?.at, 'limit', 'a limit that is no number is refused at limit');

  const bare = handlersFor(Object.assign(Object.create(api), { skillsBehind: undefined }) as never);
  const old = await serveApi(new Request('https://x/api/skillsBehind'), bare, owner);
  assert.equal(((await old.json()) as Answer).refusal?.code, 'NOT_IN_THIS_BUILD');
});
