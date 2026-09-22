/**
 * A dry run answers only about lists its caller reads (`loop/research-batch-thirty-six-audit.md` finding 6).
 *
 * `dryRun` guarded the list a rule is about and nothing else, and the kernel's walk looks up every `link` target in
 * whatever list the step names (`rules.ts` `describe`). Measured before the fix, with a member at `write` held to
 * `append` on Money, who is refused `list money`: a rule on Projects linking into Money answered "link payee" for
 * `what is "Salary: Omar"` and "link payee: nothing bears that name" for "Salary: Nadia". That is an exact-match oracle
 * on which named rows exist in a list she may not read, and `propose` now puts the same dry run on an agent's answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** A member at write, held to append on Money: she may file a line there and may not read one. */
const member: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { money: 'append' } };

const PROJECTS = { id: 'register.projects', kind: 'register', body: { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'payee', type: 'text' }] } };
const MONEY = { id: 'register.money', kind: 'register', body: { id: 'money', name: 'Money', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'int' }] } };

type Answer = { ok: true; value: { sample?: { would: string[] }[]; steps: string[] } } | { ok: false; refusal: { code: string; fix: string; at?: string } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const installed = await api.kernel.install([PROJECTS, MONEY] as never);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(api.kernel.create('projects', { name: 'Kiln', payee: 'Salary: Omar' }, { actor: 'p_owner' }).ok);
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
  return { sql, api };
}

const linking = (value: string) => ({ rule: 'probe', register: 'projects', then: [{ link: { field: 'payee', to: { register: 'money', by: 'what', value } } }] });

/** What a person reads off the answer: the sample's lines, or the refusal's code and sentence. */
const read = (a: Answer): string => (a.ok ? JSON.stringify(a.value.sample?.map((s) => s.would)) : `${a.refusal.code}: ${a.refusal.fix}`);

test('D1: A MEMBER WHO CANNOT READ MONEY IS TOLD THE SAME THING WHETHER A NAMED ROW IS THERE OR NOT', async () => {
  const { sql, api } = await record();
  assert.equal((await api.list({ register: 'money' }, member)).ok, false, 'the member reads Money, so this is not the case');

  const there = (await api.dryRun({ rule: linking('Salary: Omar') }, member)) as Answer;
  const absent = (await api.dryRun({ rule: linking('Salary: Nadia') }, member)) as Answer;
  assert.equal(read(there), read(absent));
  assert.equal(there.ok, false, 'a dry run that reaches a list its caller cannot read is refused before the kernel is asked');

  /* The owner, who reads Money, still gets the walk and the difference it shows. */
  const hers = (await api.dryRun({ rule: linking('Salary: Omar') }, owner)) as Answer;
  const none = (await api.dryRun({ rule: linking('Salary: Nadia') }, owner)) as Answer;
  assert.deepEqual([read(hers), read(none)], ['[["link payee"]]', '[["link payee: nothing bears that name"]]']);
  sql.close();
});

test('THE SAME REACH IS REFUSED WHEREVER THE STEP SITS: inside a branch, as a create, and on a run', async () => {
  const { sql, api } = await record();
  const branch = { rule: 'probe', register: 'projects', then: [{ if: 'name is set', then: [{ link: { field: 'payee', to: { register: 'money', by: 'what', value: 'x' } } }] }] };
  const creates = { rule: 'probe', register: 'projects', once_per: ['entry'], then: [{ create: { register: 'money', bound: 1, fields: { what: 'x' } } }] };
  const run = { rule: 'probe', on: { written: { register: 'projects', op: ['create'] } }, steps: [{ wait: '1h' }, { link: { field: 'payee', to: { register: 'money', by: 'what', value: 'x' } } }] };
  /* A STEP THAT CARRIES `if` AND `link` TOGETHER. The kernel's `describe` has no `if` case and reads the `link` on it,
     and the guard skipped any step with an `if` once it had walked its branches, so this was answered "link payee" for
     a name that was in Money and "nothing bears that name" for one that was not. Measured by the checker. */
  const both = { rule: 'probe', register: 'projects', then: [{ if: 'name is set', link: { field: 'payee', to: { register: 'money', by: 'what', value: 'Salary: Omar' } } }] };
  for (const [name, rule] of Object.entries({ branch, creates, run, both })) {
    const out = (await api.dryRun({ rule }, member)) as Answer;
    assert.equal(out.ok, false, `${name} was answered`);
    if (!out.ok) assert.equal(out.refusal.code, 'LEVEL_REQUIRED', name);
  }
  /* A rule that stays on Projects is answered for her as before. */
  const own = (await api.dryRun({ rule: { rule: 'probe', register: 'projects', then: [{ tag: 'seen' }] } }, member)) as Answer;
  assert.equal(own.ok, true, read(own));
  sql.close();
});
