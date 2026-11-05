/**
 * The holes a walk of every route found, each held shut here: a read dressed as a write, or a team door past what its
 * caller could give. Every test below failed before its fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as shareMethods } from '../src/methods/shares.ts';
import { OWNER } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 10, 5, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'it was answered');
  return x.refusal!;
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'team', type: 'text' },
      { id: 'notes', type: 'text' },
      { id: 'cost', type: 'text' },
    ],
  },
} as never;
const HOME = {
  id: 'page.home',
  kind: 'page',
  body: { page: 'home', title: 'Today', requires: ['register.tasks'], blocks: [{ key: 'w-1', kind: 'table', source: 'register.tasks', columns: [{ field: 'name' }] }] },
} as never;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
  value(await api.kernel.install([TASKS, HOME]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  value(api.kernel.create('tasks', { name: 'Open job', team: 'Ops', notes: 'open words' }, { actor: 'p_owner' }));
  value(api.kernel.create('tasks', { name: 'Severance for Sam', team: 'HR', notes: 'held words', cost: 'secret-cost' }, { actor: 'p_owner' }));
  return { sql, api };
}

test('A CHANGE PREVIEW NEVER FILLS A PAGE FROM A ROW PAST THE CALLER\'S RULE', async () => {
  const { api } = await record();
  const contractor: CallContext = { principal: { kind: 'person', id: 'p_c', level: 'read' }, wheres: { tasks: { field: 'team', is: 'Ops' } } };
  const perRow = {
    id: 'page.task',
    kind: 'page',
    body: { page: 'task', title: 'A task', for: { register: 'tasks' }, requires: ['register.tasks'], blocks: [{ kind: 'note', body: '{{name}} {{notes}}' }] },
  };
  /* THE OWNER'S OWN PREVIEW SHOWS THE ROW, so what is asserted below is a rule held and not a page that drew nothing. */
  assert.ok(JSON.stringify(await api.previewChange({ to: { declarations: [perRow] }, about: 'tasks#2' }, owner)).includes('held words'));
  const out = (await api.previewChange({ to: { declarations: [perRow] }, about: 'tasks#2' }, contractor)) as unknown;
  assert.ok(!JSON.stringify(out).includes('held words'), 'the row past her rule came back in the preview');
  assert.ok(!JSON.stringify(out).includes('Severance'), 'the title of the row past her rule came back in the preview');
});

test('AN ID SOMEBODY ELSE RETRIED WITH ANSWERS NOTHING OF THEIRS: a replay is the same person\'s', async () => {
  const { api } = await record();
  const first = value<{ id: string }>(await api.create({ register: 'tasks', fields: { name: 'Pay Sam', cost: 'secret-cost' }, op_id: 'op-1' }, owner));
  const adder: CallContext = { principal: { kind: 'person', id: 'p_add', level: 'append' } };
  const other = await api.create({ register: 'tasks', fields: { name: 'Mine' }, op_id: 'op-1' }, adder);
  assert.ok(!JSON.stringify(other).includes('secret-cost'), "the owner's row came back to somebody who can only add");
  const again = value<{ id: string; replayed?: boolean }>(await api.create({ register: 'tasks', fields: { name: 'Pay Sam', cost: 'secret-cost' }, op_id: 'op-1' }, owner));
  assert.equal(again.id, first.id, 'a true retry still answers the first write');
  assert.equal(again.replayed, true);
});

test('A CAPTURE RETRY IS THE SAME PERSON\'S TOO', async () => {
  const { api } = await record();
  const rows = [{ register: 'tasks', fields: { name: 'Told once' } }];
  value(await api.capture({ rows, op_id: 'cap-1' }, owner));
  const adder: CallContext = { principal: { kind: 'person', id: 'p_add', level: 'append' } };
  const mine = value<{ made: { seq: number }[] }>(await api.capture({ rows, op_id: 'cap-1' }, adder));
  assert.equal(mine.made[0]?.seq, 4, "somebody else's id was answered with the owner's row");
});

test('RETYPING A FIELD IS ASKED ONLY BY SOMEBODY SHOWN ALL OF THE LIST: the count of what does not convert was an oracle', async () => {
  const { api } = await record();
  const ask = { register: 'tasks', field: 'cost', as: { type: 'enum', values: ['secret-cost'] } };
  const adder: CallContext = { principal: { kind: 'person', id: 'p_add', level: 'append' } };
  assert.equal(refused(await api.retypeField(ask, adder)).code, 'FORBIDDEN');
  const limited: CallContext = { principal: { kind: 'person', id: 'p_c', level: 'comment' }, wheres: { tasks: { field: 'team', is: 'Ops' } } };
  assert.equal(refused(await api.retypeField(ask, limited)).code, 'FORBIDDEN');
  const hidden: CallContext = { principal: { kind: 'person', id: 'p_h', level: 'write' }, hides: { tasks: ['cost'] } };
  assert.equal(refused(await api.retypeField(ask, hidden)).code, 'FORBIDDEN');
});

test("A DRAFT WIDGET WRITES AS NOBODY: its acts are dropped, and a draft's frame cannot act in the owner's browser", async () => {
  const { sql, api } = await record();
  const member: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' } };
  const drawn = { kind: 'drawn', heading: 'Nice chart', code: '<p>hello</p>', acts: ['create:register.tasks'] };
  value(await api.widgetDraft({ question: 'It would help.', body: { block: drawn, size: 'small' } }, member));
  const kept = JSON.parse(sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'page.home' AND superseded_at IS NULL")!.body) as { blocks: Record<string, unknown>[] };
  const index = kept.blocks.findIndex((b) => b.draft !== undefined);
  assert.notEqual(index, -1);
  assert.equal(kept.blocks[index]!.acts, undefined, 'the draft kept its acts');

  /* AND ONE KEPT BEFORE THAT, with its acts still on it, is refused when the owner's browser opens it. */
  kept.blocks[index]!.acts = ['create:register.tasks'];
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'page.home' AND superseded_at IS NULL", JSON.stringify(kept));
  const out = await api.drawnAct({ page: 'home', block: index, create: { list: 'tasks', fields: { name: 'Written as the owner' } } }, owner);
  assert.equal(refused(out).code, 'FORBIDDEN');
});

const PAYROLL = { id: 'register.payroll', kind: 'register', body: { id: 'payroll', name: 'Payroll', title: 'what', owner_only: true, fields: [{ id: 'what', type: 'text', required: true }] } } as never;

async function team() {
  const { sql, api } = await record();
  value(await api.kernel.install([PAYROLL]));
  value(api.kernel.create('payroll', { what: 'Sam leaves in June' }, { actor: 'p_owner' }));
  for (const id of ['p_admin', 'p_mem']) {
    sql.exec('INSERT INTO person (id, email, name) VALUES (?, ?, ?)', id, `${id}@example.test`, id);
    sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, 'tasks', 'read')", id);
  }
  sql.exec("UPDATE member SET register = '*', level = 'decide' WHERE person_id = 'p_admin'");
  const admin: CallContext = { principal: { kind: 'person', id: 'p_admin', level: 'decide' } };
  return { sql, api, admin };
}

test("AN ADMIN'S PREVIEW OF A SHARE COUNTS NOTHING THEY ARE KEPT FROM: guessing a word in an owner's list is refused", async () => {
  const { api, admin } = await team();
  const share = { who: { kind: 'person', id: 'p_mem' }, what: { lists: ['payroll'] }, can: 'view' };
  value(await api.sharePreview({ share }, owner));
  assert.equal(refused(await api.sharePreview({ share }, admin)).code, 'FORBIDDEN');
});

test("AN ADMIN CANNOT PUT SOMEBODY IN A GROUP THAT HOLDS WHAT THE ADMIN IS KEPT FROM", async () => {
  const { api, admin } = await team();
  const group = value<{ id: string }>(await api.groupPut({ name: 'Finance' }, owner));
  value(await api.share({ share: { who: { kind: 'group', id: group.id }, what: { lists: ['payroll'] }, can: 'view' } }, owner));
  assert.equal(refused(await api.groupMember({ group: group.id, person: 'p_mem', in: true }, admin)).code, 'FORBIDDEN');
  value(await api.groupMember({ group: group.id, person: 'p_mem', in: true }, owner));
});

test("A PLUGIN'S TOOL OPENS ITS KEYS ONLY FOR THE OWNER AND HIS OWN KEY: a member's agent runs it as a trial is run", async () => {
  const sql = openSqlite();
  const asked: unknown[] = [];
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    tryScript: async (d: { owner?: boolean }) => {
      asked.push(d.owner);
      return { answer: 'done', log: [] };
    },
  } as never);
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mem', 'mem@example.test', 'Mem')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_mem', '*', 'append')");
  sql.exec(
    "INSERT INTO pack (id, version, source, manifest, installed_at, checksum) VALUES ('stripe-ish', '1.0.0', 'kennel', ?, '2026-10-01T00:00:00.000Z', 'x')",
    JSON.stringify({ title: 'Stripe', tools: [{ name: 'balance', script: 'balance' }] }),
  );
  sql.exec(
    "INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, created_at) VALUES ('script.balance', 1, 'script', 'stripe-ish', ?, 'x', 0, '2026-10-01T00:00:00.000Z')",
    JSON.stringify({ id: 'balance', runs: { tool: true }, code: 'export default () => 1', reads: [] }),
  );
  const call = (ctx: CallContext) => api.addonTool({ addon: 'stripe-ish', tool: 'balance' }, ctx);
  value(await call(owner));
  value(await call({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'write' } }));
  value(await call({ principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_mem', level: 'append' } }));
  value(await call({ principal: { kind: 'person', id: 'p_mem', level: 'append' } }));
  assert.deepEqual(asked, [true, true, false, false]);
});

const CLIENTS = { id: 'register.clients', kind: 'register', body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } } as never;
const DEALS = { id: 'register.deals', kind: 'register', body: { id: 'deals', name: 'Deals', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'client', type: 'ref', to: 'clients' }] } } as never;
const BY_CLIENT = { id: 'metric.by-client', kind: 'metric', body: { window: '7d', compare: 'none', metric: 'by-client', name: 'By client', source: 'register.deals', value: { count: 'id' }, format: 'int', target: { gte: 0 }, group_by: 'client' } } as never;

test('A ROW KEPT PRIVATE NAMES NOTHING IN A FIGURE GROUPED BY A LINK TO IT', async () => {
  const { api } = await record();
  value(await api.kernel.install([CLIENTS, DEALS, BY_CLIENT]));
  const open = value<{ id: string }>(api.kernel.create('clients', { name: 'Open client' }, { actor: 'p_owner' }));
  const held = value<{ id: string }>(api.kernel.create('clients', { name: 'Secret buyer' }, { actor: 'p_mem' }));
  value(api.kernel.create('deals', { what: 'One', client: open.id }, { actor: 'p_owner' }));
  value(api.kernel.create('deals', { what: 'Two', client: held.id }, { actor: 'p_owner' }));
  value(api.kernel.setPrivate('p_mem', held.id, true));

  const decl = api.kernel.metricDecl('by-client')!;
  const read = (viewer?: string) => JSON.stringify(api.kernel.metric(decl, viewer === undefined ? {} : { viewer }));
  assert.match(read('p_other'), /Open client/u);
  assert.doesNotMatch(read('p_other'), /Secret buyer/u, 'somebody else read a private row by its title');
  assert.doesNotMatch(read(), /Secret buyer/u, 'a read for nobody named it');
});

test("A LINK NAMES NOTHING OF A LIST THE OWNER KEEPS TO HIMSELF: not a cell that points at it, and not a table of it", async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
  const PAY = { id: 'register.pay', kind: 'register', body: { id: 'pay', name: 'Pay', title: 'what', owner_only: true, fields: [{ id: 'what', type: 'text', required: true }] } } as never;
  const JOBS = { id: 'register.jobs', kind: 'register', body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'pay', type: 'ref', to: 'pay' }] } } as never;
  const PAGE = {
    id: 'page.jobs',
    kind: 'page',
    body: {
      page: 'jobs',
      title: 'Jobs',
      requires: ['register.jobs', 'register.pay'],
      blocks: [
        { kind: 'table', source: 'register.jobs', columns: [{ field: 'what' }, { field: 'pay' }] },
        { kind: 'table', source: 'register.pay', heading: 'Pay', columns: [{ field: 'what' }] },
      ],
    },
  } as never;
  value(await api.kernel.install([PAY, JOBS, PAGE]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const pay = value<{ id: string }>(api.kernel.create('pay', { what: 'Sam leaves in June' }, { actor: 'p_owner' }));
  value(api.kernel.create('jobs', { what: 'Fit the kitchen', pay: pay.id }, { actor: 'p_owner' }));
  const direct = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, sight: { admits: () => true }, shares: () => ({ can: true }) } as never) as never as { openShare: (a: unknown, c: CallContext) => Promise<unknown> };
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'jobs' }, owner));
  const shown = JSON.stringify(value(await api.sharedPage(undefined, { principal: { kind: 'share', id, slug: 'jobs' } })));
  assert.match(shown, /Fit the kitchen/u);
  assert.doesNotMatch(shown, /Sam leaves/u);
});

test('A HASH IS NOT THE WAY TO A FILE: neither attaching it nor naming it on a row of your own hands over what you are kept from', async () => {
  const bytes = new TextEncoder().encode('Sam leaves in June');
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), visuals: { getFile: async (s: string) => (s === sha ? bytes : null) } } as never);
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
  const list = (id: string) => ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'doc', type: 'file' }] } }) as never;
  value(await api.kernel.install([list('tasks'), list('pay')]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const doc = { sha256: sha, mime: 'text/plain', bytes: bytes.byteLength, name: 'pay.txt' };
  value(api.kernel.create('pay', { what: 'June', doc }, { actor: 'p_owner' }));
  const task = value<{ id: string; seq: number }>(api.kernel.create('tasks', { what: 'A task' }, { actor: 'p_owner' }));

  const narrowed: CallContext = { principal: { kind: 'person', id: 'p_m', level: null }, registers: ['tasks'], levels: { tasks: 'write' } };
  assert.equal(api.fileHeld(sha, narrowed), true, 'she is kept from the file to begin with');

  assert.equal(refused(await api.create({ register: 'tasks', fields: { what: 'Mine', doc } }, narrowed)).code, 'REF_UNKNOWN');
  assert.equal(refused(await api.update({ register: 'tasks', seq: task.seq, patch: { doc } }, narrowed)).code, 'REF_UNKNOWN');
  assert.equal(refused(await api.attachFile({ on: `tasks#${task.seq}`, name: 'pay.txt', sha256: sha }, narrowed)).code, 'REF_UNKNOWN');
  assert.equal(api.fileHeld(sha, narrowed), true, 'she is still kept from it');

  /* AN OWNER, WHO READS THE ROW THAT NAMES IT, STILL DOES. */
  value(await api.update({ register: 'tasks', seq: task.seq, patch: { doc } }, owner));
});

test('A STALE WRITE ANSWERS THE ROW AS SHE MAY SEE IT, from the method and not only through the door', async () => {
  const { api } = await record();
  const hidden: CallContext = { principal: { kind: 'person', id: 'p_h', level: 'write' }, hides: { tasks: ['cost'] } };
  const out = (await api.update({ register: 'tasks', seq: 2, patch: { notes: 'mine' }, version: 99 }, hidden)) as { ok: boolean; conflict?: { current?: unknown } };
  assert.equal(out.ok, false);
  assert.ok(out.conflict?.current, 'a stale write still says what the row is now');
  assert.doesNotMatch(JSON.stringify(out), /secret-cost/u);
});
