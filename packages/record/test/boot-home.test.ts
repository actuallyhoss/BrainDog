/**
 * Which page Home draws, said once by the record on `boot` (`home`): the Home page of the use case the record speaks in
 * (`home-<use case>`, the voice rule's speaker), else the page called `home`, else none and Home draws the house figures.
 * Only a page the caller may open: a member who may not open the use case's Home is sent to `home`, never a slug she
 * would be refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const PEOPLE = {
  pack: 'people',
  version: '1.0.0',
  summary: 'People.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
};

const STUDY = useCasePack(
  (() => {
    const u = normaliseUseCase({
      usecase: 'study',
      version: '1.0.0',
      title: 'Study',
      summary: 'Courses.',
      author: 'BrainDog',
      license: 'MIT',
      audience: 'individual',
      tone: 'plain',
      modules: ['people'],
      pack: {
        pack: 'usecase-study',
        requires: { format: 1, primitives: 1, packs: {} },
        declarations: [
          { register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
          {
            page: 'home-study',
            title: 'Home',
            requires: ['register.courses'],
            blocks: [{ kind: 'table', source: 'register.courses', span: 12, empty: 'No courses yet.' }],
          },
        ],
      },
    });
    assert.ok(u.ok);
    return u.value;
  })(),
)!;

/** The record's own Home, written by hand: prose, so anybody who reads may open it. */
const HOME = { id: 'page.home', kind: 'page' as const, body: { page: 'home', title: 'Home', blocks: [{ kind: 'note', body: 'Welcome back.' }] } as never };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const install = async (doc: unknown) => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: planned.diff.planHash, approve: [] }, owner));
  };
  await install(PEOPLE);
  return { api, sql, install };
}

const homeOf = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext) => value<Boot>(await api.boot(ctx)).home;

test('NO USE CASE AND NO HOME PAGE: Home is the house figures', async () => {
  const { api, sql } = await record();
  assert.equal(await homeOf(api, owner), null);
  sql.close();
});

test("THE RECORD'S OWN home PAGE, while no use case speaks", async () => {
  const { api, sql } = await record();
  value(await api.kernel.install([HOME]));
  assert.equal(await homeOf(api, owner), 'home');
  sql.close();
});

test("THE USE CASE IT SPEAKS IN LEADS, and a member who may not open its Home is sent to the record's own", async () => {
  const { api, sql, install } = await record();
  value(await api.kernel.install([HOME]));
  await install(STUDY);
  assert.equal(await homeOf(api, owner), 'home-study');

  value(await api.invite({ person: 'p_2', name: 'Cas', registers: { people: 'read' } }, owner));
  const held = api.kernel.access('p_2')!;
  const cas: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  assert.equal(await homeOf(api, cas), 'home');
  sql.close();
});
