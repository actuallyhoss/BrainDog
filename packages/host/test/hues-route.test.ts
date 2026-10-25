/**
 * `huesWanted` and `giveHues` over the wire (PGS-A06 step 5): a READ+ read that counts the things with no colour of their
 * own, and a DATA write the person presses, each handed to the record method of the same name.
 *
 * THE GROUPS ARE WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): one READ+ row and one DATA row that writes.
 *
 * THE WIRE TESTS WAIT FOR THE WIRING. `routes/index.ts` spreads these rows (`...HUES`) as a line its integrator writes;
 * until then the host does not serve them, so the tests that call through `serveApi` say they are skipped, and the shape
 * tests run regardless.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';
import { ROUTES as OWN } from '../src/routes/hues.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const wired = EXTRA_ROUTES.some((r) => r.name === 'huesWanted') && EXTRA_ROUTES.some((r) => r.name === 'giveHues');
const untilWired = wired ? {} : { skip: 'routes/index.ts does not spread HUES yet' };

const WANTED = { lists: [{ list: 'projects', name: 'Projects', count: 2, names: ['Larkspur', 'Tidewell'], said: '2 in Projects have no colour of their own.' }], total: 2 };
const GIVEN = { list: 'projects', gave: 2, names: ['Larkspur', 'Tidewell'], batch: 'b_1' };

const call = async (handlers: ReturnType<typeof handlersFor>, ctx: CallContext, name: string, init?: { body: unknown } | string) => {
  const req =
    typeof init === 'object'
      ? new Request(`https://x/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) })
      : new Request(`https://x/api/${name}${init ?? ''}`);
  const res = await serveApi(req, handlers, ctx);
  return { status: res.status, body: (await res.json()) as Answer };
};

const fresh = async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 15, 9)) });
  return { sql, api };
};

/** The record with both methods answering what they were given, keeping what each was called with. */
const withHues = (api: object, heard: unknown[] = []) =>
  handlersFor(
    Object.assign(Object.create(api), {
      huesWanted: async (args: unknown, ctx: CallContext) => (heard.push(['huesWanted', { ...(args as object) }, ctx.principal.id]), ok(WANTED)),
      giveHues: async (args: unknown, ctx: CallContext) => (heard.push(['giveHues', { ...(args as object) }, ctx.principal.id]), ok(GIVEN)),
    }) as never,
  );

test('TWO ROWS IN ONE FILE: a READ+ read taking the list as text, and a DATA write, each in a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['huesWanted', 'READ+', false], ['giveHues', 'DATA', true]]);
  assert.deepEqual(OWN[0]!.takes, { list: 'text' });
  assert.equal(OWN[1]!.takes, undefined, 'a write is a POST, and its body carries its own shapes');
  assert.match(OWN[0]!.what, /changes nothing/u);
  assert.match(OWN[1]!.what, /Undo/u);
  for (const r of OWN) assert.doesNotMatch(r.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{|#/u, `${r.name} names things as a person does`);
});

test('ONCE WIRED THE TABLE SERVES THESE ROWS, each once, adding one READ+ and one DATA and nothing in any other group', untilWired, () => {
  for (const row of OWN) {
    assert.deepEqual(ROUTES.filter((r) => r.name === row.name), [row]);
    assert.equal(EXTRA_ROUTES.filter((r) => r.name === row.name).length, 1);
  }
  const by = (rows: readonly { group: string }[]) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.group]: (n[r.group] ?? 0) + 1 }), {});
  const all = by(ROUTES);
  const without = by(ROUTES.filter((r) => !OWN.some((o) => o.name === r.name)));
  assert.equal(all['READ+'], (without['READ+'] ?? 0) + 1);
  assert.equal(all.DATA, (without.DATA ?? 0) + 1);
  for (const group of ['KEYCHAIN', 'JOBS', 'ADMIN']) assert.equal(all[group], without[group], `${group} grew`);
});

test('A GET REACHES huesWanted with the list as sent, and giveHues takes a POST only', untilWired, async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withHues(api, heard);
  const read = await call(handlers, owner, 'huesWanted', '?list=projects');
  assert.deepEqual([read.status, read.body], [200, { ok: true, value: WANTED }]);
  const asGet = await call(handlers, owner, 'giveHues', '?list=projects');
  assert.equal(asGet.status, 405);
  const press = await call(handlers, owner, 'giveHues', { body: { list: 'projects' } });
  assert.deepEqual([press.status, press.body], [200, { ok: true, value: GIVEN }]);
  assert.deepEqual(heard, [['huesWanted', { list: 'projects' }, 'p_1'], ['giveHues', { list: 'projects' }, 'p_1']], 'a GET that writes never reaches the record');
  sql.close();
});

test('A LIST NAMED BY SOMETHING THAT IS NOT TEXT IS REFUSED AT list, before the record hears it', untilWired, async () => {
  const { sql, api } = await fresh();
  const heard: unknown[] = [];
  const handlers = withHues(api, heard);
  for (const list of [7, ['projects'], { length: 1 }]) {
    const out = await call(handlers, owner, 'huesWanted', { body: { list } });
    assert.equal(out.body.ok, false);
    assert.equal(out.body.refusal?.at, 'list');
    assert.notEqual(out.status, 500);
  }
  assert.deepEqual(heard, []);
  sql.close();
});

test('A RECORD WITHOUT THEM ANSWERS 501 WITH A SENTENCE, never a 500', untilWired, async () => {
  const { sql, api } = await fresh();
  const older = Object.assign(Object.create(api) as typeof api, { huesWanted: undefined, giveHues: undefined });
  const handlers = handlersFor(older as never);
  for (const out of [await call(handlers, owner, 'huesWanted', ''), await call(handlers, owner, 'giveHues', { body: { list: 'projects' } })]) {
    assert.equal(out.status, 501);
    assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(out.body.refusal?.fix ?? '', /—/u);
  }
  sql.close();
});

test('THROUGH THE REAL RECORD: a key pressing giveHues is refused, the person\'s press colours each once, and the read says so', untilWired, async (t) => {
  const { sql, api } = await fresh();
  if (typeof (api as unknown as { giveHues?: unknown }).giveHues !== 'function') {
    t.skip('methods/index.ts does not spread huesMethods yet');
    sql.close();
    return;
  }
  const put = await api.kernel.install([
    { id: 'register.projects', kind: 'register', body: { id: 'projects', name: 'Projects', title: 'name', identity: { accent: 'hue' },
      fields: [{ id: 'name', type: 'text', required: true }, { id: 'hue', type: 'int', min: 0, max: 359 }] } },
  ] as never);
  assert.ok(put.ok, JSON.stringify(put));
  for (const name of ['Larkspur', 'Tidewell']) assert.ok(api.kernel.create('projects', { name }, { actor: 'p_1' }).ok, name);
  const handlers = handlersFor(api);
  const events = () => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n;
  const before = events();
  const refused = await call(handlers, agent, 'giveHues', { body: { list: 'projects' } });
  assert.equal(refused.body.ok, false);
  assert.notEqual(refused.status, 500);
  assert.equal(refused.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(events(), before, 'a refused press writes nothing');
  const wanted = await call(handlers, owner, 'huesWanted', '?list=projects');
  assert.deepEqual((wanted.body.value as { total: number }).total, 2, JSON.stringify(wanted.body));
  const press = await call(handlers, owner, 'giveHues', { body: { list: 'projects' } });
  assert.deepEqual((press.body.value as { gave: number; names: string[] }).names, ['Larkspur', 'Tidewell'], JSON.stringify(press.body));
  const again = await call(handlers, owner, 'giveHues', { body: { list: 'projects' } });
  assert.deepEqual(again.body.value, { list: 'projects', gave: 0, names: [], batch: null });
  sql.close();
});
