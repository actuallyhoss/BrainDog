/**
 * Access that is true for every level (`20 §1`).
 *
 * A COLLEAGUE WHO ADDS ACROSS THE WHOLE RECORD ADDED TO KEYS AND PEOPLE TOO. `append` held on the record reached every
 * list, the owner's two included, so a contractor asked to file expenses could file a key and a person. Keys, People and
 * any list declaring `owner_only: true` are the owner's now: a record-wide `append` is refused them in one sentence that
 * names the list, and a grant naming the list still reaches it. `read`, `write` and `decide` are unchanged.
 *
 * AND THE SAME COLLEAGUE GIVEN READS ON ONE LIST COULD NOT OPEN THE APP. `scoped` handed anybody with a record-wide level
 * to `guard`, which asked that level alone, so `boot` answered "This needs read, and you have append access" to the one
 * remedy `20 §1` prescribes. Now any one grant that reaches the read admits it, and every answer holds only what may be
 * read. `boot` says the level held on each list (`me.levels`), and a token an owner gave the `inbox` reach is told how
 * much waits there, as `inbox` itself tells it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const list = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }], ...extra } as never,
});

/* KEYS AND PEOPLE BY THE IDS THEIR ROLES ARE FOUND BY: the vault's `credentials`, and `people`, which plays `meets` on a
   record where no list declares it (`packages/kernel/src/roles.ts`). */
const KEYS = list('credentials', 'Keys');
const PEOPLE = list('people', 'People');
const PAYROLL = list('payroll', 'Payroll', { owner_only: true });
const OBLIGATIONS = list('obligations', 'Obligations');
const DIARY = list('diary', 'Diary');

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.ok(!x.ok && x.refusal, `expected a refusal, and the call answered ${JSON.stringify(x.value)}`);
  return x.refusal!;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 25, 12)) });
  assert.ok((await api.kernel.install([KEYS, PEOPLE, PAYROLL, OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`, so the grant shape is the one a real sign-in carries. */
  const as = (person: string): CallContext => {
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  };
  return { sql, api, as };
}

const add = (register: string, what: string) => ({ register, fields: { what } });

test('A RECORD-WIDE "ADDS ONLY" IS REFUSED KEYS, PEOPLE AND AN OWNER-ONLY LIST, by name, and adds everywhere else', async () => {
  const { sql, api, as } = await record();
  value(await api.invite({ person: 'p_2', name: 'Cas', level: 'append' }, owner));
  const cas = as('p_2');
  assert.equal(cas.principal.kind === 'person' && cas.principal.level, 'append', 'the colleague this is about adds across the record');

  value(await api.create(add('obligations', 'Invoice 41'), cas));
  value(await api.create(add('diary', 'Dinner'), cas));
  for (const [id, name] of [['credentials', 'Keys'], ['people', 'People'], ['payroll', 'Payroll']] as const) {
    const said = refusal(await api.create(add(id, 'Something'), cas));
    assert.equal(said.code, 'FORBIDDEN', `${name}: ${said.code} ${said.fix}`);
    assert.ok(said.fix.includes(name), `the refusal for ${name} does not name it: ${said.fix}`);
  }
  assert.ok(!refusal(await api.create(add('credentials', 'Something'), cas)).fix.includes('credentials'), 'the refusal named Keys by its id');
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'credentials' }, owner)).rows.length, 0, 'a refused add still wrote a key');
  sql.close();
});

test('A GRANT NAMING THE LIST STILL REACHES IT, and the other levels are unchanged', async () => {
  const { sql, api, as } = await record();
  value(await api.invite({ person: 'p_3', name: 'Dee', level: 'append', registers: { credentials: 'append', payroll: 'append' } }, owner));
  value(await api.invite({ person: 'p_4', name: 'Eli', level: 'write' }, owner));
  const dee = as('p_3');
  const eli = as('p_4');

  value(await api.create(add('credentials', 'Bank login'), dee));
  value(await api.create(add('payroll', 'March'), dee));
  refusal(await api.create(add('people', 'Omar'), dee));

  for (const id of ['credentials', 'people', 'payroll']) value(await api.create(add(id, 'By a writer'), eli));
  assert.ok(value<{ rows: unknown[] }>(await api.list({ register: 'credentials' }, eli)).rows.length >= 2, 'a writer no longer reads Keys');
  sql.close();
});

test('`owner_only` IS `true` OR LEFT OUT, and any other value is refused at install', async () => {
  const { sql, api } = await record();
  const said = refusal(await api.kernel.install([list('ledger', 'Ledger', { owner_only: false })]));
  assert.equal(said.code, 'DECLARATION_INVALID', `${said.code}: ${said.fix}`);
  assert.ok(said.fix.includes('owner_only'), said.fix);
  sql.close();
});

test('A RECORD-WIDE APPENDER GIVEN READS ON ONE LIST OPENS THE APP, sees that list alone, and is told each level', async () => {
  const { sql, api, as } = await record();
  value(await api.create(add('obligations', 'Invoice 41'), owner));
  value(await api.create(add('diary', 'Dinner'), owner));
  /* A QUESTION ABOUT NO LIST IS ABOUT THE WHOLE RECORD, and goes only to somebody who reads the whole of it. `append`
     never does, whatever its ceiling, and `wholeRecord` called her whole because her ceiling was every list. */
  const options = [{ id: 'yes', label: 'Yes', because: 'It is.' }, { id: 'no', label: 'No', because: 'It is not.' }];
  value(await api.propose({ question: 'Close early on Friday?', body_kind: 'options', body: { options } } as never, owner));

  value(await api.invite({ person: 'p_5', name: 'Fay', level: 'append', registers: { obligations: 'read' } }, owner));
  const fay = as('p_5');
  const boot = value<Boot>(await api.boot(fay));
  assert.deepEqual(boot.registers.map((r) => r.id), ['obligations'], 'boot named a list she cannot read');
  assert.equal(boot.counts.decide, 0, 'a question about the whole record was counted for somebody who reads one list');
  assert.equal(boot.waiting.length, 0);
  assert.equal(boot.counts.inbox, null);

  const levels = (boot.me as unknown as { levels?: Record<string, string> }).levels;
  assert.ok(levels, 'boot answered no me.levels');
  assert.equal(levels.obligations, 'read');
  assert.equal(levels.diary, 'append');
  for (const id of ['credentials', 'people', 'payroll']) assert.ok(!Object.hasOwn(levels, id), `me.levels gave a record-wide appender ${id}`);

  /* AND SHE IS STILL AN APPENDER EVERYWHERE ELSE: no read of a list she was not given, and no add to an owner's. */
  refusal(await api.list({ register: 'diary' }, fay));
  refusal(await api.create(add('credentials', 'Something'), fay));

  /* WITHOUT A GRANT THAT READS, THE APP STAYS CLOSED to her, with the sentence the Home screen prints. */
  value(await api.invite({ person: 'p_6', name: 'Gil', level: 'append' }, owner));
  assert.equal(refusal(await api.boot(as('p_6'))).code, 'LEVEL_REQUIRED');
  sql.close();
});

test('THE OWNER IS TOLD EVERY LEVEL, and a scoped colleague only the lists they hold', async () => {
  const { sql, api, as } = await record();
  const mine = (value<Boot>(await api.boot(owner)).me as unknown as { levels?: Record<string, string> }).levels ?? {};
  for (const id of ['credentials', 'people', 'payroll', 'obligations', 'diary']) assert.equal(mine[id], 'owner', `the owner holds ${id} as ${mine[id]}`);

  value(await api.invite({ person: 'p_7', name: 'Hal', registers: { obligations: 'write' } }, owner));
  const hal = (value<Boot>(await api.boot(as('p_7'))).me as unknown as { levels?: Record<string, string> }).levels ?? {};
  assert.deepEqual(hal, { obligations: 'write' });
  sql.close();
});

test('THE INBOX COUNT GOES TO A TOKEN AN OWNER GAVE THE INBOX REACH, as `inbox` itself does, and to no other token', async () => {
  const { sql, api } = await record();
  const reached: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner', reach: ['inbox'] } };
  const plain: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'read', person: 'p_1', level: 'owner' } };
  assert.equal(value<Boot>(await api.boot(owner)).counts.inbox, 0);
  assert.equal(value<Boot>(await api.boot(reached)).counts.inbox, 0, 'an inbox-reach token was told nothing waits, as null');
  assert.ok(value(await api.inbox(undefined, reached)), 'the inbox itself refused the token this test is about');
  assert.equal(value<Boot>(await api.boot(plain)).counts.inbox, null, 'a token without the reach was told how much waits');
  sql.close();
});
