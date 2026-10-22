/**
 * Who is here, by name (`loop/contract-17.md`): `context` answers the people linked to the project with
 * their role, the organisation they are with and the last day anybody was in touch, the ones in touch latest first, and
 * the project's organisations, so the briefing card can say "Teodor Vance (Lanternfish, client)" rather than a count.
 *
 * Held to the caller: an organisation is named only to somebody who reads the organisations.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
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
      { id: 'kind', type: 'enum', values: ['company', 'client', 'vendor', 'merchant', 'bank', 'other'] },
      { id: 'domain', type: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', index: true },
      { id: 'role', type: 'enum', values: ['client', 'contractor', 'collaborator', 'other'] },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'in_touch', type: 'day' },
      { id: 'org', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** An agent's run in the lanternfish repository, held to `registers` when given. */
const agent = (registers?: readonly string[]): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'lanternfish', agent: 'claude', client_id: 'c-1' },
  ...(registers === undefined ? {} : { registers }),
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([THINGS, ORGS, PEOPLE]));
  const lanternfish = value<Entry>(await api.create({ register: 'things', fields: { name: 'Lanternfish', repos: ['lanternfish'] } }, owner));
  const elsewhere = value<Entry>(await api.create({ register: 'things', fields: { name: 'Tide', repos: ['tide'] } }, owner));
  const org = async (name: string, kind: string, projects: string[] = []) =>
    value<Entry>(await api.create({ register: 'organisations', fields: { name, kind, ...(projects.length ? { projects } : {}) } }, owner));
  const company = await org('Lanternfish', 'client', [lanternfish.id]);
  const pellucid = await org('Pellucid Ltd', 'company');
  const old = await org('Pellucid', 'company');
  /* A ROW FOLDED INTO ANOTHER IS NAMED AS THE ONE IT WAS FOLDED INTO. */
  /* FOLDED AS EVERY MERGE IS, BY A DECISION (`mergeShaped`): a plain update may not name `merged_into`. */
  {
    const asked = value<{ id: string }>(await api.propose({ question: 'Are these the same?', body_kind: 'rowset', body: { register: 'organisations', rows: [{ at: `organisations#${old.seq}`, version: old.version, patch: { merged_into: pellucid.id } }] } }, owner));
    value(await api.decide({ id: asked.id, decide: { option: 'merge', reason: 'the same' } }, owner));
  }
  const person = async (fields: Record<string, unknown>) => value<Entry>(await api.create({ register: 'people', fields: { projects: [lanternfish.id], ...fields } }, owner));
  await person({ name: 'Ines Duarte', role: 'contractor', org: pellucid.id, in_touch: '2026-09-20' });
  await person({ name: 'Teodor Vance', role: 'client', org: company.id, in_touch: '2026-10-05' });
  await person({ name: 'Joaquin Herrera', role: 'contractor', org: old.id });
  await person({ name: 'Priya Raman', org: pellucid.id, in_touch: '2026-10-01' });
  await person({ name: 'Wren', projects: [elsewhere.id], in_touch: '2026-10-06' });
  return { api, sql };
}

test('THE PEOPLE HERE ARE NAMED WITH THEIR ROLE, THEIR ORGANISATION AND THE DAY LAST IN TOUCH, the latest first', async () => {
  const { api, sql } = await record();
  const here = value<Context>(await api.context(undefined, agent()));
  assert.equal(here.project?.name, 'Lanternfish');
  assert.deepEqual(
    here.people.map((p) => [p.name, p.role, p.org, p.in_touch]),
    [
      ['Teodor Vance', 'client', 'Lanternfish', '2026-10-05'],
      ['Priya Raman', null, 'Pellucid Ltd', '2026-10-01'],
      ['Ines Duarte', 'contractor', 'Pellucid Ltd', '2026-09-20'],
      ['Joaquin Herrera', 'contractor', 'Pellucid Ltd', null],
    ],
  );
  assert.ok(here.people.every((p) => p.scope === 'project' && /^people#\d+$/u.test(p.spoken)));
  sql.close();
});

test("THE PROJECT'S ORGANISATIONS: its own first, then the ones its people are with, most people first, each once", async () => {
  const { api, sql } = await record();
  const here = value<Context>(await api.context(undefined, agent()));
  assert.deepEqual(
    here.organisations.map((o) => [o.name, o.kind, o.linked]),
    [
      ['Lanternfish', 'client', true],
      ['Pellucid Ltd', 'company', false],
    ],
  );
  /* AN ORGANISATION IS NOT A PERSON HERE, though its list links it to the project the same way. */
  assert.ok(!here.people.some((p) => p.name === 'Lanternfish'));
  assert.ok(!here.registers.some((r) => r.id === 'organisations'));
  sql.close();
});

test('A CALLER WHO DOES NOT READ THE ORGANISATIONS IS TOLD NO ORGANISATION, by name or by handle', async () => {
  const { api, sql } = await record();
  const here = value<Context>(await api.context(undefined, agent(['things', 'people', 'session'])));
  assert.equal(here.people.length, 4);
  assert.ok(here.people.every((p) => p.org === null));
  assert.deepEqual(here.organisations, []);
  assert.doesNotMatch(JSON.stringify(here), /organisations#|Pellucid/u);
  sql.close();
});

test('NOWHERE IN PARTICULAR, NOBODY IS HERE', async () => {
  const { api, sql } = await record();
  const ctx: CallContext = { ...agent(), session: { host: 'dev-pc', repo: 'nowhere', agent: 'claude', client_id: 'c-2' } };
  const here = value<Context>(await api.context(undefined, ctx));
  assert.deepEqual([here.project, here.people, here.organisations], [null, [], []]);
  sql.close();
});
