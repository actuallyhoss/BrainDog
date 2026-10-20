/**
 * The share API and See as (sharing plan slice 7): agents never share, an Admin never targets or sees as an owner, See as
 * answers what the person would be answered minus the rows they keep private, an onward share stays inside its parent,
 * and stopping a share stops every share made onward from it. Each change is an event in the §2.10 shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seeAs, sessionContext, type HeldAccess } from '../../host/src/auth.ts';
import { ROUTES as SHARING } from '../../host/src/routes/sharing.ts';
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
  reg('things', 'Things', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
  ], { scopes: { repos: 'repos' } }),
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things', scope: {} },
    { id: 'stage', type: 'enum', values: ['Doing', 'Review', 'Done'] },
  ]),
  reg('money', 'Money', 'payee', [
    { id: 'payee', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
  ]),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };
const admin: CallContext = { principal: { kind: 'person', id: 'p_adm', level: 'decide' }, credentialed: true, provedAt: NOW };

type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as R;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown, code: string, at?: string): void => {
  const x = r as R;
  assert.equal(x.ok, false, 'expected a refusal');
  assert.equal(x.refusal?.code, code, x.refusal?.fix);
  if (at !== undefined) assert.equal(x.refusal?.at, at);
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Call = (args: unknown, ctx: CallContext) => Promise<unknown>;
const call = (api: Api, name: string): Call => (api as unknown as Record<string, Call>)[name]!;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner));
  const mill = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Mill' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze test', thing: kiln.id, stage: 'Review' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Fire the kiln', thing: kiln.id, stage: 'Doing' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Oil the mill', thing: mill.id, stage: 'Review' } }, owner));
  value(await api.create({ register: 'money', fields: { payee: 'Clay Co', amount: { amount: 12_000, currency: 'GBP' } } }, owner));
  for (const [id, name] of [['p_adm', 'Ada'], ['p_pri', 'Priya'], ['p_lee', 'Lee'], ['p_sam', 'Sam'], ['p_own2', 'Otto']] as const)
    sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', id, `${name.toLowerCase()}@example.test`, name);
  value(await api.invite({ person: 'p_adm', name: 'Ada', level: 'decide' }, owner));
  value(await api.invite({ person: 'p_own2', name: 'Otto', level: 'owner' }, owner));
  value(await api.invite({ person: 'p_pri', name: 'Priya', level: 'write' }, owner));
  return { api, sql, clock, kiln: kiln.id, mill: mill.id };
}

/** The context a host builds for a person's own session, as `sessionContext` does from the record's answer. */
const own = (api: Api, person: string): CallContext => {
  const held = api.kernel.access(person) as HeldAccess | null;
  assert.ok(held, `${person} holds nothing`);
  return sessionContext({ person, email: `${person}@example.test`, record: 'rec', provedAt: NOW }, held) as CallContext;
};

const until = at(NOW + 30 * DAY);

test('a token is refused NEEDS_BROWSER_SESSION on every share route, whatever its scope', async () => {
  const { api } = await record();
  const token: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
  const args = { share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'view' }, id: 'sh_x', from: 'sh_x', who: 'p_lee', can: 'view' };
  assert.deepEqual(SHARING.map((r) => r.name).sort(), ['myShares', 'share', 'shareOnward', 'sharePreview', 'sharing', 'unshare']);
  for (const r of SHARING) refused(await call(api, r.name)(args, token), 'NEEDS_BROWSER_SESSION');
  /* AND A GRANTEE'S OWN AGENT, holding a share through its person. */
  value(await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'manage', when: { until } } }, owner));
  const lees: CallContext = { principal: { kind: 'token', id: 'tok_2', scope: 'write', person: 'p_lee', level: null } };
  for (const r of SHARING) refused(await call(api, r.name)(args, lees), 'NEEDS_BROWSER_SESSION');
});

test('an Admin shares, never with an owner, and the change is an access.grant event with the epoch moved', async () => {
  const { api, sql } = await record();
  for (const o of ['p_1', 'p_own2'])
    refused(await api.share({ share: { who: { kind: 'person', id: o }, what: { lists: ['tasks'] }, can: 'view', when: { until } } }, admin), 'FORBIDDEN', 'who');
  const epoch = api.kernel.accessEpoch();
  const got = value<{ id: string; version: number; sentence: string }>(
    await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'view', when: { until } } }, admin),
  );
  assert.match(got.id, /^sh_/);
  assert.equal(got.version, 1);
  assert.match(got.sentence, /^Lee can view tasks/);
  assert.ok(api.kernel.accessEpoch() > epoch);
  const ev = sql.one<{ kind: string; target_kind: string; field: string; from_v: string | null; to_v: string; actor: string }>(
    "SELECT kind, target_kind, field, from_v, to_v, actor FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1",
    `share:${got.id}`,
  )!;
  assert.deepEqual({ kind: ev.kind, target_kind: ev.target_kind, field: ev.field, from_v: ev.from_v, actor: ev.actor }, {
    kind: 'access.grant',
    target_kind: 'share',
    field: 'person:p_lee',
    from_v: null,
    actor: 'p_adm',
  });
  assert.deepEqual((JSON.parse(ev.to_v) as { what: unknown }).what, { lists: ['tasks'] });
  /* A CHANGE KEEPS THE ID, MOVES THE VERSION, AND ITS EVENT CARRIES THE SHARE AS IT WAS. */
  const changed = value<{ id: string; version: number }>(
    await api.share({ id: got.id, share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks', 'money'] }, can: 'view', when: { until } } }, admin),
  );
  assert.deepEqual(changed, { ...changed, id: got.id, version: 2 });
  const last = sql.one<{ from_v: string }>("SELECT from_v FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1", `share:${got.id}`)!;
  assert.deepEqual((JSON.parse(last.from_v) as { what: unknown }).what, { lists: ['tasks'] });
  assert.equal(api.kernel.access('p_lee')?.registers?.includes('money'), true);
  /* AND THE SHARING PAGE SAYS IT IN A SENTENCE. */
  const rows = value<{ id: string; sentence: string }[]>(await api.sharing(undefined, admin));
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.sentence, /Lee can view tasks and money/);
});

test('an Admin cannot see as an owner, nobody but an owner or an Admin sees as anyone', async () => {
  const { api } = await record();
  const access = (p: string) => api.kernel.access(p) as HeldAccess | null;
  const who = (person: string) => ({ person, email: `${person}@example.test`, record: 'rec', provedAt: NOW });
  for (const o of ['p_1', 'p_own2']) {
    const out = await seeAs(o, who('p_adm'), access('p_adm')!, access);
    assert.ok(out !== null && 'refusal' in out);
    assert.equal(out.refusal.code, 'FORBIDDEN');
  }
  const priya = await seeAs('p_adm', who('p_pri'), access('p_pri')!, access);
  assert.ok(priya !== null && 'refusal' in priya, 'a member at write sees as nobody');
  const stranger = await seeAs('p_nobody', who('p_1'), access('p_1')!, access);
  assert.ok(stranger !== null && 'refusal' in stranger);
  assert.equal(await seeAs(null, who('p_1'), access('p_1')!, access), null);
});

test('See as answers what the person is answered, minus the rows they keep private, and changes nothing', async () => {
  const { api } = await record();
  const mine = value<{ id: string; seq: number }>(await api.create({ register: 'tasks', fields: { what: 'My secret', stage: 'Doing' } }, own(api, 'p_pri')));
  value(await api.makePrivate({ ref: `tasks#${mine.seq}` }, own(api, 'p_pri')));
  value(await api.share({ share: { who: { kind: 'person', id: 'p_sam' }, what: { list: 'tasks', where: { field: 'stage', is: 'Review' } }, can: 'edit', when: { until } } }, owner));
  const access = (p: string) => api.kernel.access(p) as HeldAccess | null;
  for (const viewer of ['p_1', 'p_adm']) {
    const viewerWho = { person: viewer, email: `${viewer}@example.test`, record: 'rec', provedAt: NOW };
    for (const person of ['p_pri', 'p_sam']) {
      const as = await seeAs(person, viewerWho, access(viewer)!, access);
      assert.ok(as !== null && 'ctx' in as);
      const preview = as.ctx as CallContext;
      assert.equal(preview.preview, person);
      const ids = async (ctx: CallContext) => value<{ rows: { id: string }[] }>(await api.list({ register: 'tasks' }, ctx)).rows.map((r) => r.id).sort();
      const theirs = await ids(own(api, person));
      const seen = await ids(preview);
      assert.deepEqual(seen, theirs.filter((id) => id !== mine.id), `${viewer} as ${person}`);
      if (person === 'p_pri') assert.ok(theirs.includes(mine.id), 'Priya sees her own private row');
      const boot = (await api.boot(preview)) as R;
      assert.equal(boot.ok, true, 'boot answers as them');
      /* AND NOTHING SEEN AS THEM CHANGES ANYTHING, whatever the record method. */
      refused(await api.create({ register: 'tasks', fields: { what: 'Sneaky', stage: 'Review' } }, preview), 'FORBIDDEN', 'preview');
      refused(await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'view', when: { until } } }, preview), 'FORBIDDEN');
      refused(await api.sharing(undefined, preview), 'FORBIDDEN');
    }
  }
});

test('an onward share is a subset of the manager\'s, at most Edit, and stopping the parent stops it', async () => {
  const { api, sql, kiln } = await record();
  const parent = value<{ id: string }>(
    await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { list: 'tasks', where: { field: 'stage', is: 'Review' } }, can: 'manage', hide: { tasks: ['stage'] }, when: { until } } }, owner),
  );
  /* SAM IS ON THE RECORD BY A SHARE OF HIS OWN, on Money, which reaches no task. */
  value(await api.share({ share: { who: { kind: 'person', id: 'p_sam' }, what: { lists: ['money'] }, can: 'view', when: { until } } }, owner));
  const lee = own(api, 'p_lee');
  const mine = value<{ id: string; onward: boolean }[]>(await api.myShares(undefined, lee));
  assert.deepEqual(mine.map((s) => [s.id, s.onward]), [[parent.id, true]]);
  /* PAST THE PARENT IS REFUSED: another list, manage, and a person not on the record. */
  refused(await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'view', what: { lists: ['money'] } }, lee), 'OUT_OF_BOUNDS', 'what');
  refused(await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'manage' }, lee), 'OUT_OF_BOUNDS', 'can');
  refused(await api.shareOnward({ from: parent.id, who: 'p_1', can: 'view' }, lee), 'FORBIDDEN', 'who');
  refused(await api.shareOnward({ from: parent.id, who: 'p_stranger', can: 'view' }, lee), 'REF_UNKNOWN', 'who');
  /* INSIDE IT IS KEPT, its condition joined to the parent's, its hidden fields kept, its end no later. */
  const child = value<{ id: string }>(
    await api.shareOnward({ from: parent.id, who: 'p_pri', can: 'edit', what: { list: 'tasks', where: { field: 'thing', is: kiln } }, when: { until: at(NOW + 90 * DAY) } }, lee),
  );
  const kept = api.kernel.shareKept(child.id)!;
  assert.equal(kept.parent_id, parent.id);
  assert.equal(kept.when?.until, until);
  assert.deepEqual(kept.hide, { tasks: ['stage'] });
  const titles = async (ctx: CallContext) =>
    value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'tasks' }, ctx)).rows.map((r) => r.fields.what as string).sort();
  const leeSees = await titles(own(api, 'p_lee'));
  /* WHAT PRIYA HOLDS BY THE ONWARD SHARE ALONE is checked as a guest would hold it: Sam gets the same child shape. */
  const samChild = value<{ id: string }>(await api.shareOnward({ from: parent.id, who: 'p_sam', can: 'view', what: { list: 'tasks', where: { field: 'thing', is: kiln } } }, lee));
  assert.ok(samChild.id);
  const samSees = await titles(own(api, 'p_sam'));
  assert.deepEqual(samSees, ['Glaze test']);
  assert.ok(samSees.every((t) => leeSees.includes(t)), 'onward ⊆ manager');
  /* STOPPING THE PARENT STOPS EVERY SHARE MADE FROM IT, each with its own event, and the grantees see nothing more. */
  const ended = value<{ ended: string[] }>(await api.unshare({ id: parent.id }, owner)).ended;
  assert.deepEqual(new Set(ended), new Set([parent.id, child.id, samChild.id]));
  assert.deepEqual(api.kernel.access('p_sam')?.registers, ['money'], 'Sam keeps Money and no task');
  assert.equal(ended[0], parent.id);
  const revokes = sql.all<{ target: string }>("SELECT target FROM event WHERE kind = 'access.revoke' AND target_kind = 'share'").map((r) => r.target).sort();
  assert.deepEqual(revokes, [parent.id, child.id, samChild.id].map((id) => `share:${id}`).sort());
  refused(await api.unshare({ id: parent.id }, owner), 'REF_UNKNOWN');
});

test('a share that widens asks somebody with a passkey to confirm, and only them', async () => {
  const { api } = await record();
  const endless = { share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'view' } };
  refused(await api.share(endless, { ...owner, confirmable: true, provedAt: NOW - 60 * 60_000 }), 'NEEDS_BROWSER_SESSION', 'confirm');
  value(await api.share(endless, { ...owner, confirmable: true, provedAt: NOW - 60_000 }));
  value(await api.share({ share: { ...endless.share, who: { kind: 'person', id: 'p_sam' } } }, { ...owner, confirmable: false, provedAt: NOW - 60 * 60_000 }));
  value(await api.share({ share: { ...endless.share, who: { kind: 'person', id: 'p_pri' }, when: { until } } }, { ...owner, confirmable: true, provedAt: NOW - 60 * 60_000 }));
});

test('sharePreview says the sentence and the rows each list holds for it now, and keeps nothing', async () => {
  const { api, sql } = await record();
  const before = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM share')!.n;
  const got = value<{ sentence: string; lists: { list: string; rows: number }[] }>(
    await api.sharePreview({ share: { who: { kind: 'person', id: 'p_lee' }, what: { list: 'tasks', where: { field: 'stage', is: 'Review' } }, can: 'edit', when: { until } } }, owner),
  );
  assert.match(got.sentence, /^Lee can edit/);
  assert.deepEqual(got.lists.map((l) => [l.list, l.rows]), [['tasks', 2]]);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM share')!.n, before);
});

test('a list installed under a whole-record share is an access.grant per grantee', async () => {
  const { api, sql } = await record();
  value(await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { record: true }, can: 'view', when: { until } } }, owner));
  value(await api.share({ share: { who: { kind: 'person', id: 'p_sam' }, what: { lists: ['tasks'] }, can: 'view', when: { until } } }, owner));
  assert.ok((await api.kernel.install([reg('payroll', 'Payroll', 'who', [{ id: 'who', type: 'text', required: true }])])).ok);
  const ev = sql.all<{ field: string; note: string; actor: string }>("SELECT field, note, actor FROM event WHERE kind = 'access.grant' AND target_kind = 'share' AND note LIKE '%is new'");
  assert.deepEqual(ev.map((e) => ({ ...e })), [{ field: 'person:p_lee', note: 'Payroll is new', actor: 'system' }]);
});
