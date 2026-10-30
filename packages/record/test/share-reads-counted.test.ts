/**
 * The audit (sharing plan slice 12, §2.10): a read by somebody who is not an owner is counted on today's `access_seen`
 * row with the shares that allowed it, their write keeps one `access_via` line naming the shares whose write predicate
 * admitted the row, `shareActivity` says it back in plain words and names, the owner's reads count nothing, and the
 * night says each share that ran out once in the ledger.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seeAs, sessionContext, type HeldAccess } from '../../host/src/auth.ts';
import { serveMcp } from '../../mcp/src/http.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();

const reg = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...more } as never,
});

const DECLS = [
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'stage', type: 'enum', values: ['Doing', 'Review', 'Done'] },
  ]),
  reg('money', 'Money', 'payee', [
    { id: 'payee', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
  ], { seq_prefix: 'M' }),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as R;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  for (const payee of ['Clay Co', 'Kiln Parts', 'Glaze Ltd'])
    value(await api.create({ register: 'money', fields: { payee, amount: { amount: 12_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze test', stage: 'Review' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Fire the kiln', stage: 'Doing' } }, owner));
  for (const [id, name] of [['p_pri', 'Priya'], ['p_lee', 'Lee']] as const)
    sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', id, `${name.toLowerCase()}@example.test`, name);
  /* PRIYA HOLDS TWO SHARES: the Accountant's view of Money, and edit on the tasks still in Review. */
  const accountant = value<{ id: string }>(
    await api.share({ share: { who: { kind: 'person', id: 'p_pri' }, what: { lists: { has: 'money' } }, can: 'view', when: { until: at(NOW + 90 * DAY) } }, template: 'accountant' }, owner),
  ).id;
  const review = value<{ id: string }>(
    await api.share({ share: { who: { kind: 'person', id: 'p_pri' }, what: { list: 'tasks', where: { field: 'stage', is: 'Review' } }, can: 'edit', when: { until: at(NOW + 30 * DAY) } } }, owner),
  ).id;
  return { api, sql, clock, accountant, review };
}

/** The context a host builds for a person's own session (`sessionContext`). */
const own = (api: Api, person: string): CallContext => {
  const held = api.kernel.access(person) as HeldAccess | null;
  assert.ok(held, `${person} holds nothing`);
  return sessionContext({ person, email: `${person}@example.test`, record: 'rec', provedAt: NOW }, held) as CallContext;
};

const counted = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ who: string; via: string; what: string; n: number }>('SELECT who, via, what, n FROM access_seen ORDER BY who, what').map((r) => ({ ...r }));

test('Priya lists Money twice and opens M2: shareActivity says so, with the Accountant share as via, in names and never ids', async () => {
  const { api, sql, accountant } = await record();
  const priya = own(api, 'p_pri');
  value(await api.list({ register: 'money' }, priya));
  value(await api.list({ register: 'money' }, priya));
  const m2 = value<{ id: string }>(await api.get({ spoken: 'M2' }, priya));

  assert.deepEqual(counted(sql), [
    { who: 'p_pri', via: JSON.stringify([accountant]), what: 'list:money', n: 2 },
    { who: 'p_pri', via: JSON.stringify([accountant]), what: `row:${m2.id}`, n: 1 },
  ]);
  const lines = value<{ lines: { who: string; via: string; said: string }[] }>(await api.shareActivity({ person: 'p_pri' }, owner)).lines;
  assert.deepEqual(lines, [{ who: 'Priya', via: 'Accountant', said: 'Money, 2 times. Opened M2.' }]);
  /* NAMES, NEVER IDS. */
  assert.ok(!/\bp_|\bsh_|[0-9A-HJKMNP-TV-Z]{26}/u.test(JSON.stringify(lines)), JSON.stringify(lines));

  /* A ROW SHE IS NOT SHOWN, AND A LIST SHE CANNOT READ, COUNT NOTHING. */
  value(await api.get({ register: 'tasks', seq: 2 }, priya));
  await api.list({ register: 'nosuch' }, priya);
  assert.equal(counted(sql).length, 2);
  /* AND AN AGENT NEVER READS IT: a token is refused, as every share route refuses one. */
  const token: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
  assert.equal(((await api.shareActivity({}, token)) as R).refusal?.code, 'NEEDS_BROWSER_SESSION');
});

test('her write keeps one access_via line naming the share whose write predicate admitted the row, in the write itself', async () => {
  const { api, sql, review } = await record();
  const priya = own(api, 'p_pri');
  const out = value<{ id: string; batch: string }>(await api.update({ register: 'tasks', seq: 1, patch: { what: 'Glaze test, again' } }, priya));
  const via = sql.all<{ batch: string; who: string; via: string }>('SELECT batch, who, via FROM access_via').map((r) => ({ ...r }));
  assert.deepEqual(via, [{ batch: out.batch, who: 'p_pri', via: JSON.stringify([review]) }]);
  /* A WRITE REFUSED KEEPS NO LINE: the row outside her share is answered as one that is not there. */
  assert.equal(((await api.update({ register: 'tasks', seq: 2, patch: { what: 'x' } }, priya)) as R).ok, false);
  assert.equal(sql.all('SELECT batch FROM access_via').length, 1);
  /* AND THE SHARING PAGE SAYS IT BY THE SHARE'S SENTENCE, the row by its name. */
  const lines = value<{ lines: { who: string; via: string; said: string }[] }>(await api.shareActivity({}, owner)).lines;
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.who, 'Priya');
  assert.match(lines[0]!.via, /^Priya can edit/);
  assert.equal(lines[0]!.said, 'Changed tasks#1.');
});

test("the owner's reads and writes count nothing", async () => {
  const { api, sql } = await record();
  value(await api.list({ register: 'money' }, owner));
  value(await api.get({ spoken: 'M1' }, owner));
  value(await api.history({ register: 'money', seq: 1 }, owner));
  value(await api.search({ q: 'Clay' }, owner));
  value(await api.update({ register: 'tasks', seq: 1, patch: { stage: 'Done' } }, owner));
  assert.deepEqual(counted(sql), []);
  assert.deepEqual(sql.all('SELECT batch FROM access_via'), []);
  /* NOR AN OWNER'S AGENT. */
  const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
  value(await api.list({ register: 'money' }, agent));
  assert.deepEqual(counted(sql), []);
});

test("See as counts against whoever was seeing, as preview:<person>, and never as the person's own read; MCP counts the tool", async () => {
  const { api, sql, accountant } = await record();
  const held = api.kernel.access('p_1') as HeldAccess;
  const as = await seeAs('p_pri', { person: 'p_1', email: 'ada@example.test', record: 'rec', provedAt: NOW }, held, (p) => api.kernel.access(p) as HeldAccess | null);
  assert.ok(as !== null && 'ctx' in as);
  value(await api.list({ register: 'money' }, as.ctx as CallContext));
  assert.deepEqual(counted(sql), [{ who: 'p_1', via: '[]', what: 'preview:p_pri', n: 1 }]);

  const priya = own(api, 'p_pri');
  const request = new Request('https://brain.dog/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list', arguments: { register: 'money' } } }),
  });
  assert.equal((await serveMcp(request, api as never, priya)).status, 200);
  const mine = counted(sql).filter((r) => r.who === 'p_pri');
  assert.ok(mine.some((r) => r.what === 'mcp:list'), JSON.stringify(mine));
  assert.ok(mine.some((r) => r.what === 'list:money' && r.via === JSON.stringify([accountant])), JSON.stringify(mine));
  const lines = value<{ lines: { who: string; via: string; said: string }[] }>(await api.shareActivity({}, owner)).lines;
  assert.ok(lines.some((l) => l.via === 'See as' && l.said === 'Saw this BrainDog as Priya, once.'), JSON.stringify(lines));
});

test('the night writes one "Ended on its date" per share that ran out, once, and prunes counters past 400 days', async () => {
  const { api, sql, clock, accountant, review } = await record();
  const lee = value<{ id: string }>(
    await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'view', when: { until: at(NOW + 2 * DAY) } } }, owner),
  ).id;
  sql.exec("INSERT INTO access_seen (day, who, via, what, n, last_at) VALUES ('2025-01-01', 'p_pri', '[]', 'search', 3, '2025-01-01T09:00:00.000Z')");
  sql.exec("INSERT INTO access_seen (day, who, via, what, n, last_at) VALUES ('2026-10-01', 'p_pri', '[]', 'search', 1, '2026-10-01T09:00:00.000Z')");
  const ended = () =>
    sql.all<{ target: string; field: string; actor: string }>("SELECT target, field, actor FROM event WHERE kind = 'access.revoke' AND note = 'Ended on its date' ORDER BY target").map((r) => ({ ...r }));

  /* NOTHING HAS RUN OUT YET; THE OLD COUNTER GOES. */
  assert.deepEqual(api.kernel.accessNight(), { pruned: 1, ended: [] });
  assert.deepEqual(ended(), []);

  /* THREE DAYS ON, LEE'S HAS RUN OUT: ONE EVENT, AND A SECOND NIGHT SAYS NOTHING MORE. */
  clock.set(NOW + 3 * DAY);
  assert.deepEqual(api.kernel.accessNight(), { pruned: 0, ended: [lee] });
  assert.deepEqual(ended(), [{ target: `share:${lee}`, field: 'person:p_lee', actor: 'system' }]);
  assert.deepEqual(api.kernel.accessNight().ended, []);

  /* A MONTH ON, PRIYA'S REVIEW SHARE HAS RUN OUT AS WELL, AND THE ACCOUNTANT'S HAS NOT. */
  clock.set(NOW + 31 * DAY);
  assert.deepEqual(api.kernel.accessNight().ended, [review]);
  assert.equal(ended().length, 2);
  assert.ok(!ended().some((e) => e.target === `share:${accountant}`));
  /* AND A SHARE STOPPED BY HAND IS NOT SAID AGAIN WHEN ITS DATE PASSES: its own revoke already says when it stopped. */
  value(await api.unshare({ id: accountant }, owner));
  clock.set(NOW + 91 * DAY);
  assert.deepEqual(api.kernel.accessNight().ended, []);
  assert.equal(ended().length, 2);
});
