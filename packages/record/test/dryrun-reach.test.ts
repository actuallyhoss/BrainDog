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

/* AUDIT THIRTY-EIGHT, FINDING 1: THE `when` LOOKS UP A TITLE TOO. A `ref` field's value in a sentence is the title of a row
   in the list the ref points at, and the kernel resolved it against that list whoever was asking. Measured before the
   fix, with a member who reads Money and is held to `append` on Clients, so she sees a Money row's `client` only as a
   row id and `get` of that id answers null: the dry run of `client is Acme Holdings` answered `matches 1 of 1`, and of
   `Bolt Ltd`, a client that exists and that no Money row names, `0 of 1`. `list` with the same sentence answered 0 rows
   for both, because it passes `reads` and the dry run did not. */
test('D1: THE DRY RUN OF A when OVER A REF ANSWERS THE SAME FOR EVERY TITLE IN A LIST ITS CALLER CANNOT READ', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const CLIENTS = { id: 'register.clients', kind: 'register', body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } };
  const BILLED = { id: 'register.billed', kind: 'register', body: { id: 'billed', name: 'Billed', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'client', type: 'ref', to: 'clients' }] } };
  assert.ok((await api.kernel.install([CLIENTS, BILLED] as never)).ok);
  const acme = api.kernel.create('clients', { name: 'Acme Holdings' }, { actor: 'p_owner' });
  assert.ok(acme.ok, JSON.stringify(acme));
  assert.ok(api.kernel.create('clients', { name: 'Bolt Ltd' }, { actor: 'p_owner' }).ok);
  assert.ok(api.kernel.create('billed', { what: 'Invoice 7', client: acme.value.id }, { actor: 'p_owner' }).ok);
  const reader: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { clients: 'append' } };
  assert.equal((await api.list({ register: 'clients' }, reader)).ok, false, 'the member reads Clients, so this is not the case');

  const said = async (ctx: CallContext, name: string): Promise<string> => {
    const out = (await api.dryRun({ rule: { rule: 'probe', register: 'billed', when: `client is ${name}`, then: [{ tag: 'x' }] } }, ctx)) as
      | { ok: true; value: { matches: number; rows: number } }
      | { ok: false; refusal: { code: string } };
    return out.ok ? `matches ${String(out.value.matches)} of ${String(out.value.rows)}` : out.refusal.code;
  };
  const hers = [await said(reader, 'Acme Holdings'), await said(reader, 'Bolt Ltd')];
  assert.equal(hers[0], hers[1], `the dry run told a Clients title that a Billed row names from one that no row names: ${JSON.stringify(hers)}`);
  /* And it answers what `list` answers her with the same sentence. */
  const listed = await api.list({ register: 'billed', where: 'client is Acme Holdings' } as never, reader);
  assert.ok(listed.ok, JSON.stringify(listed));
  assert.equal(hers[0], `matches ${String(listed.value.rows.length)} of 1`);

  /* The owner, who reads Clients, still gets the difference. */
  assert.deepEqual([await said(owner, 'Acme Holdings'), await said(owner, 'Bolt Ltd')], ['matches 1 of 1', 'matches 0 of 1']);
  sql.close();
});

/* AUDIT FORTY, FINDING 8: THE INSTALLED RULES THE CANDIDATE IS RANKED AGAINST LOOKED THE TITLE UP TOO. The candidate's
   `when` was narrowed to the asker and the installed rules kept the owner's context, and the sample says per row which
   rule takes it. Measured before the fix, with `rule.acme` (`client is Acme Holdings`, sets `note`) installed after
   the rows, so it had run on none of them: a member refused Clients read `takenBy: { acme: 1 }` and `billed#1` alone
   "acme sets note first", which is the Acme row among three, told apart by a title she may not read. */
test('DR3: THE RULES A DRY RUN RANKS AGAINST ARE ASKED WITH THE READS OF WHOEVER ASKS, so no row is told apart by a title she cannot read', async () => {
  const CLIENTS = { id: 'register.clients', kind: 'register', body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } };
  const BILLED = {
    id: 'register.billed',
    kind: 'register',
    body: { id: 'billed', name: 'Billed', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'client', type: 'ref', to: 'clients' }, { id: 'note', type: 'text' }] },
  };
  const reader: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { clients: 'append' } };
  const candidate = { rule: 'probe', register: 'billed', then: [{ set: { field: 'note', to: 'seen' } }] };
  type Ran = { ok: true; value: { matches: number; lost: number; takenBy: Record<string, number>; sample: { spoken: string; reason?: string }[] } };

  /* The same record twice, the installed rule naming a client a row has and one no row has. */
  const ranked = async (client: string, ctx: CallContext) => {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
    assert.ok((await api.kernel.install([CLIENTS, BILLED] as never)).ok);
    const acme = api.kernel.create('clients', { name: 'Acme Holdings' }, { actor: 'p_owner' });
    const other = api.kernel.create('clients', { name: 'Bolt Ltd' }, { actor: 'p_owner' });
    assert.ok(acme.ok && other.ok);
    assert.ok(api.kernel.create('clients', { name: 'Nobody Ltd' }, { actor: 'p_owner' }).ok);
    assert.ok(api.kernel.create('billed', { what: 'Invoice 7', client: acme.value.id }, { actor: 'p_owner' }).ok);
    assert.ok(api.kernel.create('billed', { what: 'Invoice 8', client: other.value.id }, { actor: 'p_owner' }).ok);
    assert.ok(api.kernel.create('billed', { what: 'Invoice 9', client: other.value.id }, { actor: 'p_owner' }).ok);
    const rule = { rule: 'acme', register: 'billed', when: `client is ${client}`, then: [{ set: { field: 'note', to: 'Acme' } }] };
    assert.ok((await api.kernel.install([{ id: 'rule.acme', kind: 'rule', body: rule }] as never)).ok);
    const out = (await api.dryRun({ rule: candidate }, ctx)) as Ran;
    assert.ok(out.ok, JSON.stringify(out));
    sql.close();
    return { matches: out.value.matches, lost: out.value.lost, takenBy: out.value.takenBy, sample: out.value.sample.map((s) => [s.spoken, s.reason ?? null]) };
  };

  /* The owner, who reads Clients, is told which row the installed rule takes. */
  assert.deepEqual((await ranked('Acme Holdings', owner)).takenBy, { acme: 1 });
  /* She is told the same whether the installed rule names the client of a row or a client no row has. */
  const named = await ranked('Acme Holdings', reader);
  const nobody = await ranked('Nobody Ltd', reader);
  assert.deepEqual(named, nobody, `a dry run told which row is Acme's: ${JSON.stringify(named)}`);
});
