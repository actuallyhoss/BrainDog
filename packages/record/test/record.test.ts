/**
 * Who may ask what.
 *
 * The check is here and not in the router, because a check in the router is a check the CLI can be
 * pointed around and the self-host has no router at all. Every test below is about a caller getting
 * LESS than they asked for, which is the only direction that matters: a permission system that is
 * too generous fails silently, and the failure is somebody reading a record they were removed from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { allows, createRecordApi, reaches, type CallContext, type Level, type Scope } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const out = await api.kernel.install([OBLIGATIONS, NOTES]);
  assert.ok(out.ok);
  return { api, sql };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const person = (level: Level): CallContext => ({ principal: { kind: 'person', id: 'p_2', level } });
const token = (scope: Scope, level: Level = 'owner'): CallContext => ({
  principal: { kind: 'token', id: 't_1', scope, person: 'p_1', level },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; allowed?: readonly string[] } };
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal;
};

/* ── the two ladders ─────────────────────────────────────────────────────── */

test('THE EFFECTIVE PERMISSION IS THE INTERSECTION, never the maximum', () => {
  // A token says what its holder may do with their access, never what access they have. Getting
  // this backwards is how a colleague who was removed keeps writing through a token issued a year
  // ago — the exact failure a capability system is supposed to prevent.
  assert.equal(allows(token('write', 'owner'), 'write'), null);
  assert.equal(allows(token('write', 'read'), 'write')?.code, 'LEVEL_REQUIRED');
  assert.equal(allows(token('read', 'owner'), 'write')?.code, 'SCOPE_INSUFFICIENT');
  assert.equal(allows(token('read', 'owner'), 'read'), null);
});

test('a person’s ladder is five rungs and a token’s is three, and no token reaches the top two', () => {
  // ADR-060: there is no `admin` scope. A decision needs a person, and so does anything owner-level —
  // and the refusal says exactly that, rather than "your scope is too small", which would send an
  // agent looking for a bigger token that does not exist.
  for (const level of ['read', 'append', 'write', 'decide', 'owner'] as const)
    for (const need of ['decide', 'owner'] as const) {
      const r = allows(token('write', level), need);
      assert.equal(r?.code, 'PERSON_REQUIRED', `${level} / ${need}`);
      assert.match(r?.fix ?? '', /a person has to do it/);
    }
  assert.equal(allows(person('owner'), 'owner'), null);
  assert.equal(allows(person('decide'), 'owner')?.code, 'LEVEL_REQUIRED');
  assert.equal(allows(person('decide'), 'decide'), null);
});

test('the ladder is ordered, so a rung includes every rung under it', () => {
  assert.equal(allows(person('owner'), 'read'), null);
  assert.equal(allows(person('write'), 'append'), null);
  assert.equal(allows(person('append'), 'read'), null);
  assert.equal(allows(person('read'), 'append')?.code, 'LEVEL_REQUIRED');
});

test('a refusal says what you have and what it needs, and lists what you may do', () => {
  const r = allows(token('read', 'owner'), 'write');
  assert.match(r?.fix ?? '', /needs write/);
  assert.match(r?.fix ?? '', /read token/);
  assert.deepEqual(r?.allowed, ['read']);
});

test('a ceiling is a list of registers, and no ceiling is `*`', () => {
  assert.equal(reaches({ ...owner, registers: '*' }, 'anything'), null);
  assert.equal(reaches({ ...owner, registers: ['obligations'] }, 'obligations'), null);
  assert.equal(reaches({ ...owner, registers: ['obligations'] }, 'notes')?.code, 'FORBIDDEN');
});

/* ── through the surface ─────────────────────────────────────────────────── */

test('a read token reads and does not write', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));

  const reader = token('read');
  assert.ok(value<{ rows: unknown[] }>(await api.list({ register: 'obligations' }, reader)).rows.length === 1);
  assert.equal(refusal(await api.create({ register: 'obligations', fields: { what: 'x' } }, reader)).code, 'SCOPE_INSUFFICIENT');
  assert.equal(refusal(await api.update({ register: 'obligations', seq: 1, patch: { what: 'x' } }, reader)).code, 'SCOPE_INSUFFICIENT');
  sql.close();
});

test('APPEND ADDS AND DOES NOT EDIT, because a wrong new row is visible and a wrong edit is not', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));

  const appender = person('append');
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, appender));
  assert.equal(refusal(await api.update({ register: 'obligations', seq: 1, patch: { what: 'x' } }, appender)).code, 'LEVEL_REQUIRED');
  assert.equal(api.kernel.count('obligations'), 2);
  sql.close();
});

test('a ceiling holds through every method that names a register', async () => {
  const { api, sql } = await record();
  const scoped: CallContext = { ...owner, registers: ['obligations'] };
  value(await api.list({ register: 'obligations' }, scoped));
  for (const call of [
    api.list({ register: 'notes' }, scoped),
    api.get({ register: 'notes', seq: 1 }, scoped),
    api.schema({ register: 'notes' }, scoped),
    api.create({ register: 'notes', fields: { body: 'x' } }, scoped),
    api.update({ register: 'notes', seq: 1, patch: { body: 'x' } }, scoped),
    api.history({ register: 'notes', seq: 1 }, scoped),
  ])
    assert.equal(refusal(await call).code, 'FORBIDDEN');
  sql.close();
});

test('and boot shows only the registers the caller may touch, because a list of names is information', async () => {
  const { api, sql } = await record();
  const all = value<{ registers: { id: string }[] }>(await api.boot(owner));
  assert.deepEqual(all.registers.map((r) => r.id).sort(), ['notes', 'obligations']);

  const scoped = value<{ registers: { id: string }[] }>(await api.boot({ ...owner, registers: ['obligations'] }));
  assert.deepEqual(scoped.registers.map((r) => r.id), ['obligations']);
  sql.close();
});

/* ── who the record says did it ──────────────────────────────────────────── */

test('A TOKEN WRITES AS THE PERSON WHO HOLDS IT, never as itself', async () => {
  // The history has to answer "who did this", and "t_1" is not a who. The token is how, and the
  // person is who — a record whose history names credentials cannot be read by a person.
  const { api, sql } = await record();
  const row = value<{ id: string }>(
    await api.create({ register: 'obligations', fields: { what: 'a' } }, token('write')),
  );
  const events = value<{ actor: string }[]>(await api.history({ register: 'obligations', seq: 1 }, owner));
  assert.equal(events[0]?.actor, 'p_1');
  assert.ok(row.id);
  sql.close();
});

/* ── nothing throws across this boundary ─────────────────────────────────── */

test('a refusal from the kernel comes back as a value, with its sentence intact', async () => {
  const { api, sql } = await record();
  const missing = refusal(await api.create({ register: 'obligations', fields: { amount: { amount: 1, currency: 'GBP' } } }, owner));
  assert.equal(missing.code, 'REQUIRED_MISSING');

  const gone = refusal(await api.schema({ register: 'atlantis' }, owner));
  assert.equal(gone.code, 'REGISTER_UNKNOWN');
  assert.ok(gone.allowed?.includes('obligations'));

  const badFilter = refusal(await api.list({ register: 'obligations', where: { field: 'nope', is: 1 } }, owner));
  assert.equal(badFilter.code, 'FIELD_UNKNOWN');
  sql.close();
});

test('the record’s version moves with a write and not with a read', async () => {
  const { api, sql } = await record();
  const before = value<number>(await api.version(owner));
  value(await api.list({ register: 'obligations' }, owner));
  assert.equal(value<number>(await api.version(owner)), before);
  value(await api.create({ register: 'obligations', fields: { what: 'a' } }, owner));
  assert.ok(value<number>(await api.version(owner)) > before);
  sql.close();
});

/* ── the decision gate ───────────────────────────────────── */

const PROPOSAL = {
  question: 'File the two invoices that arrived overnight?',
  body_kind: 'rowset' as const,
  body: { register: 'obligations', rows: [{ what: 'Invoice 41', state: 'open' }] },
};

test('AN AGENT MAY ASK AND MAY NOT ANSWER, and that is not a scope anybody can be issued', async () => {
  /* ADR-060: no token reaches `decide`. An agent that can propose and not write is an agent whose
     mistakes are a queue rather than a diff — and one that could answer its own question would be
     an agent with a rubber stamp. */
  const { api, sql } = await record();

  const made = await api.propose(PROPOSAL, token('propose'));
  assert.ok(made.ok, 'propose is the rung the token ladder has for exactly this');

  const id = (made as { value: { id: string } }).value.id;
  for (const scope of ['read', 'propose', 'write'] as const) {
    const tried = await api.decide({ id, decide: { option: 'accept', reason: 'go on' } }, token(scope));
    assert.equal(tried.ok, false, `a ${scope} token decided`);
    /* AND THE REFUSAL NAMES A PERSON, not a bigger token. `SCOPE_INSUFFICIENT` would send whoever
       read it looking for a scope that does not exist. */
    assert.equal((tried as { refusal: { code: string } }).refusal.code, 'PERSON_REQUIRED');
  }
  assert.equal(api.kernel.count('obligations'), 0);

  // A person at `decide` answers it, and the rows land.
  const done = await api.decide({ id, decide: { option: 'accept', reason: 'both are ours' } }, person('decide'));
  assert.ok(done.ok, done.ok ? '' : (done as { refusal: { fix: string } }).refusal.fix);
  assert.equal(api.kernel.count('obligations'), 1);
  sql.close();
});

test('and a read token can see the queue, because a proposal nobody can see was never made', async () => {
  const { api, sql } = await record();
  await api.propose(PROPOSAL, owner);

  const open = await api.governance({}, token('read'));
  assert.ok(open.ok);
  assert.equal((open as { value: unknown[] }).value.length, 1);

  // And a person at `read` too — the gate is about answering, not about looking.
  assert.ok((await api.governance({ register: 'decision' }, person('read'))).ok);
  sql.close();
});
