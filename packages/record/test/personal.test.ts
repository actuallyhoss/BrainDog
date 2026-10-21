/**
 * Personal lists (`personal: true`, `42 §4.4`): the owner's alone.
 *
 * `owner_only` KEEPS A RECORD-WIDE "ADDS ONLY" OUT AND LETS A GRANT NAMING THE LIST IN. A personal list lets nothing in:
 * only the owner reads and writes it, in his own session or through his own key, and no grant, share, link, child key
 * or "See as" reaches it, even one that names it. The leak matrix holds every read path to such a list
 * (`leak-matrix.test.ts`, Setups); this file holds what is refused at the door: the install, an invitation, a share, a
 * link to a page and an example row going out in a file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as shareMethods } from '../src/methods/shares.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const OWNER = 'p_own';
const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true };
const key: CallContext = { principal: { kind: 'token', id: 't_own', scope: 'write', person: OWNER, level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.ok(!x.ok && x.refusal, `expected a refusal, and the call answered ${JSON.stringify(x.value)}`);
  return x.refusal!;
};

const list = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'tags', type: 'list', of: 'text' }], ...extra } as never,
});
const SETUPS = list('setups', 'Setups', { personal: true });
const NOTES = list('notes', 'Notes');
const table = (source: string) => ({ kind: 'table', source: `register.${source}`, columns: [{ field: 'what' }], empty: 'Nothing yet.' });

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-desk', name: 'The Desk', tz: 'UTC', locale: 'en', owner: { id: OWNER } }));
  value(await api.kernel.install([SETUPS, NOTES]));
  value(await api.create({ register: 'setups', fields: { what: 'Desk laptop' } }, owner));
  value(await api.create({ register: 'notes', fields: { what: 'A note' } }, owner));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_own', ?, 'h_own', 'write', 'Own key', ?)", OWNER, new Date(NOW).toISOString());
  /* BUILT AS A HOST BUILDS A MEMBER, from `kernel.access`, so a grant is the shape a sign-in carries. */
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels };
  };
  return { sql, api, clock, as };
}

test('`personal` IS `true` OR LEFT OUT, AND NEVER BESIDE `owner_only`', async () => {
  const { sql, api } = await record();
  const wrong = refusal(await api.kernel.install([list('ledger', 'Ledger', { personal: false })]));
  assert.equal(wrong.code, 'DECLARATION_INVALID');
  assert.equal(wrong.at, 'personal');
  assert.equal(refusal(await api.kernel.install([list('ledger', 'Ledger', { personal: true, owner_only: true })])).at, 'owner_only');
  assert.deepEqual(api.kernel.personalLists(), ['setups']);
  sql.close();
});

test('THE OWNER READS AND WRITES IT, in his session and through his own key, and an Admin or a grant naming it is refused', async () => {
  const { sql, api, as } = await record();
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'setups' }, owner)).rows.length, 1);
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'setups' }, key)).rows.length, 1);
  value(await api.create({ register: 'setups', fields: { what: 'Studio tower' } }, key));

  value(await api.invite({ person: 'p_adm', name: 'Ada', level: 'decide' }, owner));
  const admin = as('p_adm');
  for (const said of [refusal(await api.list({ register: 'setups' }, admin)), refusal(await api.create({ register: 'setups', fields: { what: 'Mine now' } }, admin))]) {
    assert.equal(said.code, 'FORBIDDEN');
    assert.ok(said.fix.startsWith('Setups is personal'), said.fix);
  }
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'notes' }, admin)).rows.length, 1, 'an Admin still reads every other list');

  /* NO INVITATION NAMES IT, AND A MEMBER ROW WRITTEN BY HAND OPENS NOTHING. */
  const invited = refusal(await api.invite({ person: 'p_bea', name: 'Bea', level: 'read', registers: { setups: 'write' } }, owner));
  assert.equal(invited.code, 'FORBIDDEN');
  assert.equal(invited.at, 'registers.setups');
  value(await api.invite({ person: 'p_bea', name: 'Bea', level: 'read' }, owner));
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_bea', 'setups', 'write')");
  assert.equal(refusal(await api.list({ register: 'setups' }, as('p_bea'))).code, 'FORBIDDEN');
  sql.close();
});

test('NO SHARE NAMES IT, AND A SHARE OF THE WHOLE RECORD DOES NOT REACH IT', async () => {
  const { sql, api } = await record();
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_gus', 'gus@example.test', 'Gus', NULL)");
  const share = (what: Record<string, unknown>) => api.share({ share: { effect: 'allow', who: { kind: 'person', id: 'p_gus' }, what, can: 'view' } } as never, owner);
  for (const [what, at] of [
    [{ list: 'setups', where: { field: 'what', present: true } }, 'what.list'],
    [{ lists: ['notes', 'setups'] }, 'what.lists.1'],
  ] as const) {
    const said = refusal(await share(what));
    assert.equal(said.code, 'FORBIDDEN', said.fix);
    assert.equal(said.at, at);
    assert.ok(said.fix.startsWith('Setups is personal'), said.fix);
  }
  value(await share({ record: true }));
  const held = api.kernel.access('p_gus')!;
  assert.ok(held.registers?.includes('notes') && !held.registers.includes('setups'), JSON.stringify(held.registers));
  const guest: CallContext = { principal: { kind: 'person', id: 'p_gus', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  refusal(await api.list({ register: 'setups' }, guest));
  sql.close();
});

test("A CHILD KEY AND A NARROWED KEY OF THE OWNER'S ARE HELD OFF IT, the narrowing naming it included", async () => {
  const { sql, api } = await record();
  const at = new Date(NOW).toISOString();
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_kid', ?, 'h_kid', 'write', 'Own key', ?)", OWNER, at);
  sql.exec("INSERT INTO token_lens (token_id, parent_id, narrow, made_by, made_at) VALUES ('t_kid', 't_own', NULL, ?, ?)", OWNER, at);
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_few', ?, 'h_few', 'read', 'Narrowed', ?)", OWNER, at);
  sql.exec("INSERT INTO token_lens (token_id, parent_id, narrow, made_by, made_at) VALUES ('t_few', NULL, ?, ?, ?)", JSON.stringify({ lists: ['notes', 'setups'] }), OWNER, at);
  const root = api.kernel.access(OWNER, 't_own')!;
  assert.equal(root.registers, null, 'his own key with nothing narrowing it holds every list');
  for (const id of ['t_kid', 't_few']) {
    const held = api.kernel.access(OWNER, id)!;
    assert.ok(held.registers !== null && !held.registers.includes('setups'), `${id}: ${JSON.stringify(held.registers)}`);
    const ctx: CallContext = { principal: { kind: 'token', id: 't_own', scope: 'write', person: OWNER, level: held.level }, registers: held.registers };
    refusal(await api.list({ register: 'setups' }, ctx));
  }
  /* A CHILD STILL READS EVERY OTHER LIST, and the narrowed key the other list it names. */
  assert.ok(api.kernel.access(OWNER, 't_kid')!.registers!.includes('notes'));
  assert.deepEqual(api.kernel.access(OWNER, 't_few')!.registers, ['notes']);
  sql.close();
});

test('NO LINK OPENS ON A PAGE THAT SHOWS IT, and a link opened before a page came to show it stops opening', async () => {
  const { sql, api, clock } = await record();
  const links = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  value(await api.setDeclaration({ body: { page: 'kit', title: 'Kit', requires: ['register.setups'], blocks: [table('setups')] } } as never, owner));
  const said = refusal(await links.openShare({ slug: 'kit' }, owner));
  assert.equal(said.code, 'FORBIDDEN');
  assert.equal(said.at, 'slug');

  value(await api.setDeclaration({ body: { page: 'board', title: 'Board', requires: ['register.notes'], blocks: [table('notes')] } } as never, owner));
  const { id } = value<{ id: string }>(await links.openShare({ slug: 'board' }, owner));
  const link: CallContext = { principal: { kind: 'share', id, slug: 'board' } } as CallContext;
  value(await api.sharedPage(undefined, link));
  value(await api.setDeclaration({ body: { page: 'board', title: 'Board', requires: ['register.notes', 'register.setups'], blocks: [table('notes'), table('setups')] } } as never, owner));
  assert.equal(refusal(await api.sharedPage(undefined, link)).code, 'PAGE_UNKNOWN');
  sql.close();
});

test('ITS ROWS NEVER GO OUT AS EXAMPLES, in an add-on or a use case, and the list itself still goes', async () => {
  const { sql, api } = await record();
  const rows = refusal(await api.exportPack({ declarations: ['register.setups'], rows: { setups: [1] } } as never, owner));
  assert.equal(rows.code, 'FORBIDDEN');
  assert.equal(rows.at, 'rows.setups');
  const bare = value<{ adds: string[]; text: string }>(await api.exportPack({ declarations: ['register.setups'] } as never, owner));
  assert.ok(bare.adds.includes('register.setups') && !bare.text.includes('Desk laptop'));

  /* A USE CASE THAT CARRIES A PERSONAL LIST OF ITS OWN. */
  const kits = useCasePack(
    (() => {
      const u = normaliseUseCase({
        usecase: 'kit',
        version: '1.0.0',
        title: 'Kit',
        summary: 'What is on each desk.',
        author: 'Someone',
        license: 'MIT',
        audience: 'individual',
        tone: 'plain',
        modules: [],
        voice: {},
        labels: {},
        pack: {
          pack: 'usecase-kit',
          requires: { format: 1, primitives: 1, packs: {} },
          declarations: [{ register: 'kits', name: 'Kits', title: 'what', personal: true, fields: [{ id: 'what', type: 'text', required: true }, { id: 'tags', type: 'list', of: 'text' }] }],
        },
      });
      assert.ok(u.ok, JSON.stringify(u));
      return u.value;
    })(),
  )!;
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: kits } as never, owner));
  value(await api.installPack({ doc: kits, planHash: planned.diff.planHash, approve: [] } as never, owner));
  value(await api.create({ register: 'kits', fields: { what: 'Spare charger' } }, owner));
  const out = refusal(await api.exportUseCase({ usecase: 'kit', examples: { kits: [1] } }, owner));
  assert.equal(out.code, 'FORBIDDEN', out.fix);
  assert.equal(out.at, 'examples.kits');
  sql.close();
});
