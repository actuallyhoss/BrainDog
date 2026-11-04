/**
 * Nothing a member kept private reaches the owner's agent, not even a name, a count or a sign that it exists (audit
 * 10k, AK1, AK4, AK5). Mia, a member, adds a person and keeps them to herself; the owner's key then lists what it is
 * offered, reads a figure over People and meets somebody at the address Mia's private person holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 31, 12);

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'org', type: 'ref', to: 'organisations' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
    /* A LIST WITH NO projects PART SAYS WHICH PARTS IT PLAYS: the defaults name a projects field it does not have. */
    meets: { name: 'name', email: 'email', org: 'org', keys: 'keys', handles: 'handles', met: 'met', merged_into: 'merged_into' },
  } as never,
};
const ORGS = {
  id: 'register.organisations',
  kind: 'register' as const,
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text', index: true },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};
/* ONE PAGE PER PERSON, whose title is the person's name. */
const PERSON_PAGE = {
  id: 'page.person',
  kind: 'page' as const,
  body: { page: 'person', title: '{{name}}', for: { register: 'people' }, requires: ['register.people'], blocks: [{ kind: 'note', body: 'About {{name}}' }] } as never,
};
const COUNT = {
  id: 'metric.people-count',
  kind: 'metric' as const,
  body: { metric: 'people-count', name: 'People', source: 'register.people', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'kiln', agent: 'claude', client_id: 'c-1' },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function studio() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, PEOPLE, PERSON_PAGE, COUNT]));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.create({ register: 'people', fields: { name: 'Ada Vine', email: 'ada@pellvine.example' } }, owner));
  value(api.kernel.invite('p_1', { person: 'p_mia', email: 'mia@the-studio.example', name: 'Mia Hart', level: 'write', why: 'test' } as never));
  const lund = value<{ id: string }>(api.kernel.write('people', null, { name: 'Doctor Lund', email: 'lund@clinic.example' }, { actor: 'p_mia' }));
  value(api.kernel.setPrivate('p_mia', lund.id, true));
  const clinic = value<{ id: string }>(api.kernel.write('organisations', null, { name: 'Halden Clinic', domain: 'clinic.example' }, { actor: 'p_mia' }));
  value(api.kernel.setPrivate('p_mia', clinic.id, true));
  return { api, sql };
}

test('THE OWNER’S AGENT IS OFFERED NO PAGE ABOUT A PERSON A MEMBER KEPT PRIVATE (AK1)', async () => {
  const { api } = await studio();
  const offered = value<{ pages: { slug: string; title: string }[] }>(await (api as unknown as { offered: (ctx: CallContext) => Promise<unknown> }).offered(agent));
  assert.deepEqual(
    offered.pages.map((p) => p.title).filter((t) => t.includes('Lund')),
    [],
  );
  assert.ok(offered.pages.some((p) => p.title === 'Ada Vine'));
});

test('A FIGURE OVER PEOPLE COUNTS ONLY THE PEOPLE THE READER IS SHOWN (AK4)', async () => {
  const { api } = await studio();
  const listed = value<{ matched: number }>(await api.list({ register: 'people' }, agent));
  const figure = value<{ value: number }>(await api.metric({ metric: 'people-count' }, agent));
  assert.equal(figure.value, listed.matched);
  assert.equal(figure.value, 1);
});

test('MEETING SOMEBODY AT AN ADDRESS ONLY A PRIVATE ROW HOLDS ANSWERS AS A NEW ADDRESS DOES (AK5)', async () => {
  const { api } = await studio();
  const fresh = value<{ created: boolean }>(await api.meet({ name: 'Priya Nair', email: 'priya@halden.example', where: 'session in kiln' } as never, agent));
  const hidden = value<{ created: boolean; row: { name: string } | null }>(await api.meet({ name: 'Doctor Lund', email: 'lund@clinic.example', where: 'session in kiln' } as never, agent));
  assert.equal(fresh.created, true);
  assert.equal(hidden.created, true);
  assert.equal(hidden.row?.name, 'Doctor Lund');
  /* AND A SECOND MEETING FINDS THE ONE IT ADDED, and adds nobody else. */
  const again = value<{ created: boolean }>(await api.meet({ name: 'Doctor Lund', email: 'lund@clinic.example', where: 'a call' } as never, agent));
  assert.equal(again.created, false);
  const listed = value<{ matched: number }>(await api.list({ register: 'people' }, agent));
  assert.equal(listed.matched, 3);
});

type Got = { fields: Record<string, unknown> };
const fieldsOf = async (api: Awaited<ReturnType<typeof studio>>['api'], id: string): Promise<Record<string, unknown>> => (value<Got | null>(await api.get({ spoken: id }, agent)) ?? assert.fail(`${id} is not there`)).fields;

test('THE ROW A MEETING ADDS CARRIES THE ADDRESS IT WAS MET BY, and a name alone never joins it to somebody else (RK3)', async () => {
  const { api } = await studio();
  /* THE OWNER'S OWN DOCTOR LUND, a vet with no address, is a different person. */
  const vet = value<{ id: string }>(await api.create({ register: 'people', fields: { name: 'Doctor Lund' } }, owner));
  const met = value<{ created: boolean; matched_by: string; row: { id: string } }>(
    await api.meet({ name: 'Doctor Lund', email: 'lund@clinic.example', where: 'session in kiln' } as never, agent),
  );
  assert.equal(met.created, true, 'a name alone is no match');
  assert.equal(met.matched_by, 'none');
  assert.notEqual(met.row.id, vet.id);
  assert.deepEqual((await fieldsOf(api, vet.id)).met, undefined, 'nothing was written onto the vet');
  /* WHAT IT WAS MET BY IS ON THE ROW, so a second meeting finds it by the address and not by the name. */
  assert.deepEqual((await fieldsOf(api, met.row.id)).keys, ['email:lund@clinic.example']);
  const again = value<{ created: boolean; matched_by: string; row: { id: string } }>(
    await api.meet({ name: 'Dr. Lund', email: 'lund@clinic.example', where: 'a call' } as never, agent),
  );
  assert.equal(again.created, false);
  assert.equal(again.matched_by, 'key');
  assert.equal(again.row.id, met.row.id);
});

test('AN ORGANISATION A MEMBER KEPT PRIVATE IS NOT THERE FOR THE OWNER\'S AGENT, nor pointed at from a person it sees (RK4)', async () => {
  const { api } = await studio();
  const fresh = value<{ created: boolean }>(await api.meet({ kind: 'organisation', name: 'Pellvine', domain: 'pellvine-free.example', where: 'session in kiln' } as never, agent));
  const hidden = value<{ created: boolean; row: { id: string; name: string } }>(
    await api.meet({ kind: 'organisation', name: 'Clinic', domain: 'clinic.example', where: 'session in kiln' } as never, agent),
  );
  assert.equal(fresh.created, true);
  assert.equal(hidden.created, true);
  assert.equal(hidden.row.name, 'Clinic');
  assert.equal((await fieldsOf(api, hidden.row.id)).domain, 'clinic.example', 'it reads as an organisation met at a domain nobody holds');
  /* A PERSON MET AT THE DOMAIN IS PUT WITH THE ORGANISATION THE AGENT SEES, never with the private one. */
  const lena = value<{ row: { id: string } }>(await api.meet({ name: 'Lena Berg', email: 'lena@clinic.example', where: 'session in kiln' } as never, agent));
  assert.equal((await fieldsOf(api, lena.row.id)).org, api.kernel.get(hidden.row.id)?.id);
});
