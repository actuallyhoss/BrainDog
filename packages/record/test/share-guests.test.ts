/**
 * People not on the record yet, and groups (sharing plan slice 8), at the record: a share to an address waits, an
 * invitation carrying no level is good while one does, accepting binds each share to the person with an event, the
 * guest holds a lens with no member row, the last share ending leaves them with nothing, a group's member taken out
 * loses the group's shares one event at a time, and the host's Plus gate holds a share to an outsider.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const UNTIL = new Date(Date.UTC(2026, 11, 1, 12)).toISOString();

const reg = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...more } as never,
});

const DECLS = [
  reg('things', 'Things', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }], { scopes: { repos: 'repos' } }),
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things', scope: {} },
  ]),
  reg('money', 'Money', 'payee', [
    { id: 'payee', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
  ]),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as R;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function record(plus?: (ctx: CallContext, who: { kind: string; id: string }) => Promise<R['refusal'] | null>) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), invitations: () => null, ...(plus ? { plus: plus as never } : {}) });
  assert.ok((await api.kernel.install(DECLS)).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner));
  const mill = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Mill' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze test', thing: kiln.id } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Oil the mill', thing: mill.id } }, owner));
  value(await api.create({ register: 'money', fields: { payee: 'Clay Co', amount: { amount: 12_000, currency: 'GBP' } } }, owner));
  return { api, sql, kiln: kiln.id };
}

const events = (sql: ReturnType<typeof openSqlite>, kind: string, field: string) =>
  sql.all<{ target: string; note: string | null }>('SELECT target, note FROM event WHERE kind = ? AND field = ? ORDER BY rowid', kind, field);

test('A SHARE TO AN ADDRESS WAITS, its invitation is good while it does, and accepting binds it with an event', async () => {
  const { api, sql, kiln } = await record();
  /* NOTHING SHARED, NO LEVEL: still no invitation. */
  assert.equal(((await api.invite({ email: 'priya@studio.co' }, owner)) as R).refusal?.code, 'REQUIRED_MISSING');

  const s = value<{ id: string }>(await api.share({ share: { who: { kind: 'email', id: 'priya@studio.co' }, what: { project: kiln, lists: ['tasks'] }, can: 'edit', when: { until: UNTIL } } }, owner));
  const { token } = value<{ token: string }>(await api.invite({ email: 'priya@studio.co' }, owner));
  const look = value<{ shared: string | null; level: null }>(await api.acceptInvite({ token }));
  assert.equal(look.shared, 'Ada shared Kiln with you. You can edit tasks in Kiln until 1 Dec.');

  /* THE SHARE STOPPED BEFORE ANYBODY ACCEPTED: the link is as dead as a withdrawn one. */
  value(await api.unshare({ id: s.id }, owner));
  assert.equal(((await api.acceptInvite({ token })) as R).refusal?.code, 'UNAUTHORIZED');

  /* SHARED AGAIN, a new link, and accepted. */
  const again = value<{ id: string }>(await api.share({ share: { who: { kind: 'email', id: 'priya@studio.co' }, what: { project: kiln, lists: ['tasks'] }, can: 'edit', when: { until: UNTIL } } }, owner));
  const second = value<{ token: string }>(await api.invite({ email: 'priya@studio.co' }, owner));
  const joined = value<{ person_id: string; level: null; shares: string[] }>(await api.acceptInvite({ token: second.token, person: { id: 'p_pri', email: 'priya@studio.co', name: 'Priya' } }));
  assert.deepEqual({ level: joined.level, shares: joined.shares }, { level: null, shares: [again.id] });
  assert.equal(sql.one('SELECT 1 AS y FROM member WHERE person_id = ?', 'p_pri'), undefined, 'a guest got a member row');
  assert.equal(api.kernel.shareKept(again.id)?.who.id, 'p_pri');
  const bound = events(sql, 'access.grant', 'person:p_pri');
  assert.deepEqual(bound.map((e) => e.target), [`share:${again.id}`]);
  assert.match(bound[0]!.note ?? '', /^Accepted invitation i_/);

  /* THE GUEST'S LENS: the Kiln tasks and the project row, never money. */
  const held = api.kernel.access('p_pri');
  assert.ok(held);
  assert.deepEqual([...(held.registers ?? [])].sort(), ['tasks', 'things']);

  /* THE LAST SHARE ENDS: they hold nothing, and the answer says so for the host's Directory. */
  const stopped = value<{ ended: string[]; left: string[] }>(await api.unshare({ id: again.id }, owner));
  assert.deepEqual(stopped.left, ['p_pri']);
  assert.equal(api.kernel.access('p_pri'), null);
});

test('GROUPS: made through the API, joining and leaving said once per share, and leaving ends the shares for them', async () => {
  const { api, sql } = await record();
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', 'p_gus', 'gus@example.test', 'Gus');
  value(await api.invite({ person: 'p_lee', email: 'lee@example.test', name: 'Lee', level: 'read' }, owner));

  const g = value<{ id: string; name: string }>(await api.groupPut({ name: '  Accountants ' }, owner));
  assert.equal(g.name, 'Accountants');
  assert.equal(((await api.groupMember({ group: g.id, person: 'p_1', in: true }, owner)) as R).refusal?.code, 'FORBIDDEN', 'an owner went in a group');

  const s1 = value<{ id: string }>(await api.share({ share: { who: { kind: 'group', id: g.id }, what: { lists: ['money'] }, can: 'view', when: { until: UNTIL } } }, owner));
  const s2 = value<{ id: string }>(await api.share({ share: { who: { kind: 'group', id: g.id }, what: { lists: ['tasks'] }, can: 'comment', when: { until: UNTIL } } }, owner));
  const epoch = api.kernel.accessEpoch();
  const inGus = value<{ people: { id: string; name: string | null }[]; said: string[] }>(await api.groupMember({ group: g.id, person: 'p_gus', in: true }, owner));
  assert.deepEqual(inGus.people, [{ id: 'p_gus', name: 'Gus' }]);
  assert.deepEqual([...inGus.said].sort(), [s1.id, s2.id].sort());
  assert.ok(api.kernel.accessEpoch() > epoch);
  value(await api.groupMember({ group: g.id, person: 'p_lee', in: true }, owner));
  assert.deepEqual(events(sql, 'access.grant', 'person:p_gus').map((e) => e.note), ['joined Accountants', 'joined Accountants']);
  assert.deepEqual([...(api.kernel.access('p_gus')?.registers ?? [])].sort(), ['money', 'tasks']);

  /* TAKEN OUT: one access.revoke per share for them, and a guest who held only these holds nothing now. */
  const outGus = value<{ said: string[]; left: string[] }>(await api.groupMember({ group: g.id, person: 'p_gus', in: false }, owner));
  const revoked = events(sql, 'access.revoke', 'person:p_gus');
  assert.deepEqual(revoked.map((e) => e.target).sort(), [`share:${s1.id}`, `share:${s2.id}`].sort());
  assert.ok(revoked.every((e) => e.note === 'left Accountants'));
  assert.deepEqual(outGus.left, ['p_gus']);
  assert.equal(api.kernel.access('p_gus'), null);
  /* LEE KEEPS HIS OWN ROLE, and still has the group's. */
  assert.ok(api.kernel.access('p_lee'));

  /* RETIRED: every share it held ends with its event, and a member who holds a role is not left with nothing. */
  const retired = value<{ ended: string[]; left: string[] }>(await api.groupPut({ id: g.id, retire: true }, owner));
  assert.deepEqual([...retired.ended].sort(), [s1.id, s2.id].sort());
  assert.deepEqual(retired.left, []);
  assert.equal(((await api.groupMember({ group: g.id, person: 'p_gus', in: true }, owner)) as R).refusal?.code, 'REF_UNKNOWN');
});

test('THE PLUS GATE holds a share to somebody not on the record yet, and only that', async () => {
  const asked: string[] = [];
  const plus = async (_ctx: CallContext, who: { kind: string; id: string }) => {
    asked.push(`${who.kind}:${who.id}`);
    return { code: 'FORBIDDEN', fix: 'Teams are part of Cloud Plus.', at: 'plan' };
  };
  const { api, kiln } = await record(plus);
  value(await api.invite({ person: 'p_lee', email: 'lee@example.test', name: 'Lee', level: 'read' }, owner));
  const out = (await api.share({ share: { who: { kind: 'email', id: 'priya@studio.co' }, what: { project: kiln, lists: ['tasks'] }, can: 'view', when: { until: UNTIL } } }, owner)) as R;
  assert.deepEqual(out.refusal, { code: 'FORBIDDEN', fix: 'Teams are part of Cloud Plus.', at: 'plan' });
  value(await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['tasks'] }, can: 'view', when: { until: UNTIL } } }, owner));
  assert.deepEqual(asked, ['email:priya@studio.co']);
  assert.equal(api.kernel.sharesWaiting('priya@studio.co').length, 0);
});
