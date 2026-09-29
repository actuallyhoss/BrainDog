/**
 * What a run now does: a `call` step waits and hands its answer back into the run, a question may be put to one member
 * and is held to them, a hole nothing fills is refused at install, a `create` fills a money field, and a body is tried
 * over a sample by the real runner with nothing kept.
 *
 * WRITTEN BEFORE ANYTHING RAN. Each test names the contract line it holds, so a red here is the contract and the code
 * disagreeing, and the sentence says which.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, validateDeclaration, type Declaration, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 26, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const INVOICES: Declaration = {
  id: 'register.invoices',
  kind: 'register',
  body: {
    id: 'invoices',
    name: 'Invoices',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text' },
      { id: 'memo', type: 'text' },
    ],
  } as never,
};

/** A call only a rule runs, sending the row's `what`. */
const HOOK: Declaration = {
  id: 'ingest.rate_hook',
  kind: 'ingest',
  body: { ingest: 'rate_hook', channel: 'call', url: 'https://hooks.example.test/rate', trigger: 'rule', grant: 'hook key', sends: ['invoices.what'] } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

/** A rule that calls out on a new invoice and writes the rate the call answered into the row. */
const RATED = {
  rule: 'rated',
  on: { written: { register: 'invoices', op: ['create'] } },
  once_per: ['entry'],
  steps: [{ call: { ingest: 'rate_hook', as: 'a' } }, { set: { field: 'memo', to: 'rate {{vars.a.rate}}' } }],
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  value(k.bindGrant({ label: 'hook key', opens: 'hooks.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1') as Result<GrantRow>);
  value(await k.install([INVOICES, HOOK, ...decls]));
  return { k, sql };
}

type Run = { id: string; state: string; vars: string; say: string | null };
const runOf = (sql: NodeSql, of: string): Run | undefined =>
  sql.one<Run>('SELECT id, state, vars, say FROM automation_run WHERE rule = ? ORDER BY started_at DESC, rowid DESC', of);
const count = (sql: NodeSql, query: string): number => sql.one<{ n: number }>(query)?.n ?? 0;

/* ── a call waits, and its answer comes back ──────────────────────────── */

test('A CALL STEP WAITS ON ITS CALL, AND THE ANSWER IS READ BY PATH: {{vars.a.rate}} is 48.5 from {"rate":48.5}', async () => {
  const { k, sql } = await record(rule(RATED));
  const made = value(k.create('invoices', { what: 'Gold', party: 'Acme' }, { actor: 'p_1' }));
  await k.drain();

  const waiting = runOf(sql, 'rated')!;
  assert.equal(waiting.state, 'waiting', `the run did not park on its call: ${waiting.say ?? ''}`);
  const [job] = k.leaseOutbox(['pull.fetch'], 10);
  assert.ok(job, 'no call was queued');
  const payload = JSON.parse(job.payload) as { ingest: string; run: string; step: number };
  assert.deepEqual([payload.ingest, payload.run, payload.step], ['rate_hook', waiting.id, 0], 'the job does not name the run and the step waiting on it');

  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { answer: '{"rate":48.5}' } }));
  assert.equal(runOf(sql, 'rated')?.state, 'pending', 'the answer did not hand the run back to the drain');
  await k.drain();

  const done = runOf(sql, 'rated')!;
  assert.equal(done.state, 'done', done.say ?? '');
  assert.deepEqual(JSON.parse(done.vars), { a: { rate: 48.5 } });
  assert.equal(k.get(made.id)?.fields.memo, 'rate 48.5');
  sql.close();
});

test('A CALL THE HOST STOPPED ENDS THE RUN WITH THE HOST\'S SENTENCE, not with "no answer"', async () => {
  const { k, sql } = await record(rule(RATED));
  value(k.create('invoices', { what: 'Gold' }, { actor: 'p_1' }));
  await k.drain();
  const [job] = k.leaseOutbox(['pull.fetch'], 10);
  assert.ok(job, 'no call was queued');

  const said = 'rate_hook stopped: hooks.example.test answered 401 to the key "hook key". It will not retry until somebody resumes it.';
  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: said } }));
  const over = runOf(sql, 'rated')!;
  assert.equal(over.state, 'failed');
  assert.equal(over.say, said);
  sql.close();
});

/* ── a question put to one member ─────────────────────────────────────── */

test('A QUESTION PUT TO ONE MEMBER IS THEIRS AND AN OWNER\'S TO ANSWER, and anybody else is refused', async () => {
  const asks = rule({
    rule: 'asks',
    on: { manual: true },
    steps: [{ ask_person: { question: 'Pay it?', options: ['pay', 'hold'], as: 'answer', to: 'p_2' } }, { notify: { say: 'Answered {{vars.answer}}' } }],
  });
  const { k, sql } = await record(asks);
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_2', 'bea@example.test', 'Bea'), ('p_3', 'cy@example.test', 'Cy')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', '*', 'decide'), ('p_3', '*', 'decide')");

  value(k.automationRun('asks', 'p_1'));
  await k.drain();
  assert.equal(runOf(sql, 'asks')?.state, 'waiting', runOf(sql, 'asks')?.say ?? '');
  const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' AND opened_by = 'rule:asks'");
  assert.ok(asked, 'no question was opened');
  const body = JSON.parse(asked.body) as { to?: string; options: { id: string; label: string }[] };
  assert.equal(body.to, 'p_2', 'the question does not say who it was put to');
  const pay = body.options.find((o) => o.label === 'pay')!.id;

  const other = k.decide(asked.id, { decide: { option: pay, reason: 'Looks right.' } }, 'p_3');
  assert.equal(other.ok, false, 'a member the question was not put to answered it');
  assert.match(fixOf(other), /put to Bea, so only they or an owner answer it/u);

  value(k.decide(asked.id, { decide: { option: pay, reason: 'Paid on the first.' } }, 'p_2'));
  await k.drain();
  const done = runOf(sql, 'asks')!;
  assert.equal(done.state, 'done', done.say ?? '');
  assert.deepEqual(JSON.parse(done.vars), { answer: 'pay' });
  sql.close();
});

/* ── what is refused at install, and what now installs ───────────────── */

test('A HOLE NOTHING FILLS IS REFUSED AT INSTALL: one brace, a run\'s path inside the write, and a path with an empty part', () => {
  const known = new Map([INVOICES, HOOK].map((d) => [d.id, d.body as Record<string, never>]));
  const lone = validateDeclaration(rule({ rule: 'lone', on: { manual: true }, steps: [{ notify: { say: 'Paid {what}' } }] }), known);
  assert.equal(lone?.code, 'DECLARATION_INVALID', 'a say: holding {what} installed, and would reach the outbox as typed');
  assert.equal(lone?.at, 'steps[0].notify.say');
  assert.match(lone?.fix ?? '', /\{what\}.*one brace/u);

  const inline = validateDeclaration(rule({ rule: 'inline', register: 'invoices', then: [{ note: 'asked {{vars.q}}' }] }), known);
  assert.equal(inline?.code, 'DECLARATION_INVALID', 'an inline {{vars.q}} installed, and would write its braces into the note');
  assert.match(inline?.fix ?? '', /\{\{vars\.q\}\}/u);

  const dots = validateDeclaration(rule({ rule: 'dots', on: { manual: true }, steps: [{ notify: { say: 'x {{vars..x}}' } }] }), known);
  assert.equal(dots?.code, 'DECLARATION_INVALID');
  assert.match(dots?.fix ?? '', /names no answer/u);
});

test('A CREATE FILLS A MONEY FIELD FROM A MONEY VALUE, and a bare number there is still refused', () => {
  const BILLS: Declaration = {
    id: 'register.bills',
    kind: 'register',
    body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
  };
  const known = new Map([BILLS].map((d) => [d.id, d.body as Record<string, never>]));
  const bill = (amount: unknown) =>
    validateDeclaration(rule({ rule: 'bill', on: { manual: true }, steps: [{ create: { register: 'bills', bound: 1, fields: { what: 'Rent', amount } } }] }), known);
  assert.equal(bill({ amount: 4800, currency: 'GBP' }), null, 'a create could not fill a money field, and failed every run');
  assert.equal(bill(4800)?.code, 'DECLARATION_INVALID');
});

/* ── a try, with nothing kept ──────────────────────────────────────────── */

test('A TRY TAKES THE STEPS OVER A SAMPLE ROW: the call is said as would, the step after it is not reached, and nothing is kept', async () => {
  const { k, sql } = await record();
  const tried = value(k.tryAutomation(RATED as never, { row: { what: 'Gold', party: 'Acme' } }, 'p_1'));
  assert.equal(tried.trigger.kind, 'written');
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.verb, s.state]),
    [
      ['steps[0]', 'call', 'would'],
      ['steps[1]', 'set', 'skipped'],
    ],
  );
  /* EVERYTHING THE TRY WROTE WENT WITH THE REHEARSAL: the sample row, the run, its steps and the call it queued. */
  assert.equal(count(sql, "SELECT count(*) AS n FROM entry WHERE register = 'invoices'"), 0, 'the sample row was kept');
  assert.equal(count(sql, 'SELECT count(*) AS n FROM automation_run'), 0, 'the tried run was kept');
  assert.equal(count(sql, "SELECT count(*) AS n FROM outbox WHERE kind = 'pull.fetch'"), 0, 'the call was queued for real');
  sql.close();
});

test('A TRY OVER A ROW THE when: DOES NOT HOLD FOR STARTS NO RUN, and every step says the live rule would pass it over', async () => {
  const { k, sql } = await record();
  const tried = value(k.tryAutomation({ ...RATED, when: 'party is Acme' } as never, { row: { what: 'Gold', party: 'Other' } }, 'p_1'));
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.state]),
    [
      ['steps[0]', 'skipped'],
      ['steps[1]', 'skipped'],
    ],
  );
  assert.match(tried.steps[0]!.say, /when: does not hold/);
  assert.equal(count(sql, "SELECT count(*) AS n FROM outbox WHERE kind = 'pull.fetch'"), 0, 'the call was queued for real');
  sql.close();
});

test('A TRY OF A BUTTON SAYS WHAT A set_var KEPT AND THAT A NOTICE WOULD GO, and sends nothing', async () => {
  const { k, sql } = await record();
  const hello = { rule: 'hello', on: { manual: true }, steps: [{ set_var: { name: 'k', to: 'kind {{trigger.kind}}' } }, { notify: { say: 'Hello {{vars.k}}' } }] };
  const tried = value(k.tryAutomation(hello as never, {}, 'p_1'));
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.verb, s.state]),
    [
      ['steps[0]', 'set_var', 'done'],
      ['steps[1]', 'notify', 'would'],
    ],
  );
  assert.equal(tried.steps[0]!.answer, 'kind manual');
  assert.equal(count(sql, "SELECT count(*) AS n FROM outbox WHERE kind LIKE 'notify.%'"), 0, 'the notice was queued for real');
  assert.equal(count(sql, 'SELECT count(*) AS n FROM automation_run'), 0, 'the tried run was kept');
  sql.close();
});
