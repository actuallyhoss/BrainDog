/**
 * One step of an automation tried alone: the try stops after the step asked for, the earlier steps' answers
 * that were given are used rather than taken again, and each step hands back what it kept under its `as:` (`out`), cut
 * at 4 KB and with a secret withheld. A call still answers `would`, and nothing outlives the rehearsal.
 *
 * THROUGH THE KERNEL'S OWN `tryAutomation`, with the options riding on the body (`withTry`) until that method takes
 * them as an argument of its own, so this is the real runner on a fresh record and not a second one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { WITHHELD } from '../src/figure.ts';
import { OUT_BYTES, withTry, type TryOptions } from '../src/flow-try.ts';
import { openRecord, type Declaration, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 26, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'memo', type: 'text' },
      { id: 'pin', type: 'secret' },
    ],
  } as never,
};

/** A call only a rule runs, sending the bill's `what`. */
const HOOK: Declaration = {
  id: 'ingest.rate_hook',
  kind: 'ingest',
  body: { ingest: 'rate_hook', channel: 'call', url: 'https://hooks.example.test/rate', trigger: 'rule', grant: 'hook key', sends: ['bills.what'] } as never,
};

/** Five steps: a variable, a call, a write from its answer, a variable from its answer, and a notice. */
const FIVE = {
  rule: 'five',
  on: { written: { register: 'bills', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { set_var: { name: 'w', to: 'bill {{trigger.row.what}}' } },
    { call: { ingest: 'rate_hook', as: 'a' } },
    { set: { field: 'memo', to: 'rate {{vars.a.rate}}' } },
    { set_var: { name: 'm', to: 'noted {{vars.a.rate}}' } },
    { notify: { say: 'Done {{vars.w}}' } },
  ],
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-mill', name: 'The Mill', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'wren@example.test', name: 'Wren' } }).ok);
  value(k.bindGrant({ label: 'hook key', opens: 'hooks.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1') as Result<GrantRow>);
  value(await k.install([BILLS, HOOK]));
  return { k, sql };
}

const count = (sql: NodeSql, query: string): number => sql.one<{ n: number }>(query)?.n ?? 0;
const nothingKept = (sql: NodeSql) => {
  assert.equal(count(sql, "SELECT count(*) AS n FROM entry WHERE register = 'bills'"), 0, 'the sample row was kept');
  assert.equal(count(sql, 'SELECT count(*) AS n FROM automation_run'), 0, 'the tried run was kept');
  assert.equal(count(sql, "SELECT count(*) AS n FROM outbox WHERE kind = 'pull.fetch'"), 0, 'the call was queued for real');
  assert.equal(count(sql, "SELECT count(*) AS n FROM outbox WHERE kind LIKE 'notify.%'"), 0, 'the notice was queued for real');
};

const tryOne = (k: Kernel, body: object, row: Record<string, unknown>, o: TryOptions) => value(k.tryAutomation(withTry(body as never, o), { row }, 'p_1'));

test('UPTO STOPS: the step asked for is taken and every step after it is not reached, with the step named', async () => {
  const { k, sql } = await record();
  const tried = tryOne(k, FIVE, { what: 'Gold' }, { upTo: 'steps[0]' });
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.state]),
    [
      ['steps[0]', 'done'],
      ['steps[1]', 'skipped'],
      ['steps[2]', 'skipped'],
      ['steps[3]', 'skipped'],
      ['steps[4]', 'skipped'],
    ],
  );
  assert.equal(tried.steps[0]!.out, 'bill Gold');
  assert.match(tried.steps[1]!.say, /stopped after steps\[0\], the step being tested/);
  nothingKept(sql);
  sql.close();
});

test('GIVEN IS REUSED: the call before the step is not taken again, and the step reads its answer by path', async () => {
  const { k, sql } = await record();
  const tried = tryOne(k, FIVE, { what: 'Gold' }, { upTo: 'steps[3]', given: { a: { rate: 48.5 } } });
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.state]),
    [
      ['steps[0]', 'done'],
      ['steps[1]', 'done'],
      ['steps[2]', 'done'],
      ['steps[3]', 'done'],
      ['steps[4]', 'skipped'],
    ],
  );
  assert.deepEqual([tried.steps[1]!.as, tried.steps[1]!.out], ['a', { rate: 48.5 }]);
  assert.match(tried.steps[1]!.say, /earlier test was used/);
  assert.equal(tried.steps[3]!.out, 'noted 48.5');
  nothingKept(sql);
  sql.close();
});

test('A CALL ANSWERS WOULD, says what it would send, and nothing is queued', async () => {
  const { k, sql } = await record();
  const tried = tryOne(k, FIVE, { what: 'Gold' }, { upTo: 'steps[1]' });
  const call = tried.steps[1]!;
  assert.equal(call.state, 'would');
  assert.deepEqual(call.sends, { what: 'Gold' });
  assert.equal(call.out, undefined, 'a call that was not sent kept an answer');
  assert.match(call.say, /Nothing was sent/);
  nothingKept(sql);
  sql.close();
});

test('OUT IS CUT AT 4 KB, and the sentence says where', async () => {
  const { k, sql } = await record();
  const long = { rule: 'long', on: { manual: true }, steps: [{ set_var: { name: 'x', to: 'é'.repeat(3000) } }] };
  const tried = value(k.tryAutomation(withTry(long as never, { upTo: 'steps[0]' }), {}, 'p_1'));
  const out = tried.steps[0]!.out;
  assert.equal(typeof out, 'string');
  assert.ok(new TextEncoder().encode(out as string).length <= OUT_BYTES, 'the out passed 4 KB');
  assert.match(tried.steps[0]!.say, /cut at 4096/);
  assert.equal(tried.steps[0]!.cut, true);
  sql.close();
});

test('A SECRET IS WITHHELD: a variable set from a secret field, and an earlier answer holding what that field holds', async () => {
  const { k, sql } = await record();
  const body = {
    rule: 'sealed',
    on: { written: { register: 'bills', op: ['create'] } },
    once_per: ['entry'],
    steps: [
      { call: { ingest: 'rate_hook', as: 'a' } },
      { set_var: { name: 'p', to: '{{trigger.row.pin}}' } },
      { set_var: { name: 'e', to: 'echo {{vars.a.echo}}' } },
    ],
  };
  /* THE SECRET IS PUT IN BY SQL, where the keychain would have put it, since no write path takes one from a person. */
  const made = value(k.create('bills', { what: 'Gold' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter22') WHERE id = ?", made.id);
  const o = { upTo: 'steps[2]', given: { a: { echo: 'hunter22', rate: 2 } } };
  const tried = value(k.tryAutomation(withTry(body as never, o), { row: made.id }, 'p_1'));
  assert.deepEqual(tried.steps[0]!.out, { echo: WITHHELD, rate: 2 });
  assert.equal(tried.steps[1]!.state, 'done', tried.steps[1]!.say);
  assert.equal(tried.steps[1]!.out, WITHHELD);
  /* A GIVEN ANSWER WRITTEN INTO TEXT is the secret again, in the step's answer as in its out. */
  assert.equal(tried.steps[2]!.state, 'done', tried.steps[2]!.say);
  assert.deepEqual([tried.steps[2]!.out, tried.steps[2]!.answer], [WITHHELD, WITHHELD]);
  assert.ok(!JSON.stringify(tried).includes('hunter22'), 'the secret is in the try');
  assert.equal(count(sql, 'SELECT count(*) AS n FROM automation_run'), 0, 'the tried run was kept');
  sql.close();
});

test('A WITHHELD MARK GIVEN BACK IS NOT AN ANSWER: the step is taken for real, and a path not in the draft is refused', async () => {
  const { k, sql } = await record();
  const tried = tryOne(k, FIVE, { what: 'Gold' }, { upTo: 'steps[2]', given: { a: WITHHELD } });
  assert.equal(tried.steps[1]!.state, 'would');
  assert.equal(tried.steps[2]!.state, 'skipped');
  /* A MARK INSIDE AN ANSWER IS AS LITTLE AN ANSWER as the mark alone. */
  const nested = tryOne(k, FIVE, { what: 'Gold' }, { upTo: 'steps[2]', given: { a: { rate: 2, pin: WITHHELD } } });
  assert.equal(nested.steps[1]!.state, 'would');
  const wrong = k.tryAutomation(withTry(FIVE as never, { upTo: 'steps[9]' }), { row: { what: 'Gold' } }, 'p_1');
  assert.ok(!wrong.ok);
  nothingKept(sql);
  sql.close();
});

test('THE OLD CALL IS UNCHANGED: no options is a whole try, which stops at the call', async () => {
  const { k, sql } = await record();
  const tried = value(k.tryAutomation(FIVE as never, { row: { what: 'Gold' } }, 'p_1'));
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.verb, s.state]),
    [
      ['steps[0]', 'set_var', 'done'],
      ['steps[1]', 'call', 'would'],
      ['steps[2]', 'set', 'skipped'],
      ['steps[3]', 'set_var', 'skipped'],
      ['steps[4]', 'notify', 'skipped'],
    ],
  );
  assert.equal(tried.steps[0]!.answer, 'bill Gold');
  assert.match(tried.steps[2]!.say, /the try stops where a live run waits \(steps\[1\]\)/);
  nothingKept(sql);
  sql.close();
});

test('A STEP INSIDE A BRANCH IS TRIED ALONE: the branch is taken to it, and the step after it in the branch is not', async () => {
  const { k, sql } = await record();
  const body = {
    rule: 'branch',
    on: { written: { register: 'bills', op: ['create'] } },
    once_per: ['entry'],
    steps: [{ if: 'what is Gold', then: [{ set_var: { name: 'g', to: 'gold' } }, { set_var: { name: 'h', to: 'more' } }] }, { notify: { say: 'Done' } }],
  };
  const tried = tryOne(k, body, { what: 'Gold' }, { upTo: 'steps[0].then[0]' });
  assert.deepEqual(
    tried.steps.map((s) => [s.path, s.state]),
    [
      ['steps[0]', 'done'],
      ['steps[0].then[0]', 'done'],
      ['steps[0].then[1]', 'skipped'],
      ['steps[1]', 'skipped'],
    ],
  );
  assert.equal(tried.steps[1]!.out, 'gold');
  nothingKept(sql);
  sql.close();
});
