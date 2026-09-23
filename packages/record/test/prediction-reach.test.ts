/**
 * A prediction is held to the list its figure counts as well as to the declaration it names
 * (`loop/research-batch-forty-audit.md` finding 2), and so is the question its miss files.
 *
 * WHAT WAS MEASURED. `holds` placed a prediction by `for_decl` alone: a list's declaration asked that list and anything
 * else asked whether the caller reads the whole record. The `measure`, whose `source` and `where` are what the baseline
 * counts, was never asked. A prediction over Money's rows for Omar, filed on a change to Inbox, reached the member
 * invited to Inbox alone with `where: payee is Omar` and `baseline: 2`; filed on a change to a rule, it reached a member
 * held to `append` on Money, whom `list money` refuses; and when it missed, the question "predicted >=5, observed 3"
 * reached her too, because the kernel files it as an `options` body that names no list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** A whole-record reader at `write`, held to `append` on Money, refused `list money`. */
const member: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { money: 'append' } };
/** Invited to Inbox alone. */
const inboxOnly: CallContext = { principal: { kind: 'person', id: 'p_i', level: null }, registers: ['inbox'], levels: { inbox: 'read' } };
/** Invited to Money and Inbox, and reads both. */
const both: CallContext = { principal: { kind: 'person', id: 'p_b', level: null }, registers: ['money', 'inbox'], levels: { money: 'read', inbox: 'read' } };

const reg = (id: string, name: string, fields: Record<string, unknown>[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
});
const MONEY = reg('money', 'Money', [{ id: 'amount', type: 'int' }, { id: 'payee', type: 'text' }]);
const INBOX = reg('inbox', 'Inbox', []);
const INBOX2 = reg('inbox', 'Inbox', [{ id: 'from', type: 'text' }]);
const SEEN = { id: 'rule.seen', kind: 'rule' as const, body: { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] } };

const OVER_MONEY = {
  claim: 'Omar is paid under 90000 at most once',
  measure: { source: 'register.money', where: { field: 'payee', is: 'Omar' }, value: { count: 'what' } },
  target: { gte: 5 },
  window: '30d',
  unit: 'count',
};
const OVER_INBOX = { ...OVER_MONEY, claim: 'The inbox fills', measure: { source: 'register.inbox', value: { count: 'what' } }, target: { gte: 9 } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, JSON.stringify(x));
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([MONEY, INBOX])).ok);
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000, payee: 'Omar' }, { actor: 'p_owner' }).ok);
  assert.ok(api.kernel.create('money', { what: 'Bonus: Omar', amount: 5000, payee: 'Omar' }, { actor: 'p_owner' }).ok);
  assert.ok(api.kernel.create('money', { what: 'Salary: Nadia', amount: 88000, payee: 'Nadia' }, { actor: 'p_owner' }).ok);
  assert.ok(api.kernel.create('inbox', { what: 'A letter' }, { actor: 'p_owner' }).ok);
  clock.advance(60_000);
  /* A change carrying a prediction, accepted by the owner, which is what writes a `prediction` row. */
  const predict = async (question: string, declaration_id: string, to: unknown, prediction: unknown) => {
    const asked = value<{ id: string }>(await api.propose({ question, body_kind: 'change', body: { declaration_id, to, prediction } } as never, owner));
    value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'Fine.' } }, owner));
    clock.advance(60_000);
  };
  const predictions = async (ctx: CallContext) => value<{ claim: string }[]>(await api.governance({ register: 'prediction' }, ctx)).map((p) => p.claim);
  return { sql, api, clock, predict, predictions };
}

test('P1: A PREDICTION OVER MONEY FILED ON A CHANGE TO INBOX IS NOT HANDED TO A MEMBER WHO READS INBOX ALONE', async () => {
  const { sql, predict, predictions } = await record();
  await predict('Give the inbox a sender?', 'register.inbox', INBOX2, OVER_MONEY);
  assert.deepEqual(await predictions(owner), [OVER_MONEY.claim], 'the precondition: a prediction was written');
  assert.deepEqual(await predictions(inboxOnly), [], 'a prediction counting Omar in Money reached a member invited to Inbox alone');
  /* AND IT IS STILL SOMEBODY'S: whoever reads both lists reads it. */
  assert.deepEqual(await predictions(both), [OVER_MONEY.claim]);
  sql.close();
});

test('P2: A PREDICTION OVER MONEY FILED ON A CHANGE TO A RULE IS NOT HANDED TO A MEMBER HELD TO append ON MONEY', async () => {
  const { sql, api, predict, predictions } = await record();
  assert.equal((await api.list({ register: 'money' }, member)).ok, false, 'the member reads Money, so this is not the case');
  await predict('Tag the inbox?', 'rule.seen', SEEN, OVER_MONEY);
  assert.deepEqual(await predictions(owner), [OVER_MONEY.claim]);
  assert.deepEqual(await predictions(member), [], 'a prediction counting Omar in Money reached a member refused list money');
  assert.deepEqual(await predictions(inboxOnly), []);
  sql.close();
});

/* A PREDICTION FILED ON A RULE IS PLACED AS THE RULE IS, and not on the whole record. Before the fix this went to
   whole-record readers only, so a member invited to Inbox, which is all the rule and the figure are about, never saw
   the grade of a change she was shown. */
test('A PREDICTION ABOUT A RULE ON INBOX, COUNTING INBOX, GOES TO WHOEVER READS INBOX', async () => {
  const { sql, predict, predictions } = await record();
  await predict('Tag the inbox?', 'rule.seen', SEEN, OVER_INBOX);
  assert.deepEqual(await predictions(owner), [OVER_INBOX.claim]);
  assert.deepEqual(await predictions(inboxOnly), [OVER_INBOX.claim]);
  assert.deepEqual(await predictions(member), [OVER_INBOX.claim]);
  sql.close();
});

test('E1: THE QUESTION A MISSED PREDICTION FILES GOES WHERE THE PREDICTION GOES', async () => {
  const { sql, api, clock, predict } = await record();
  await predict('Tag the inbox?', 'rule.seen', SEEN, OVER_MONEY);
  assert.ok(api.kernel.create('money', { what: 'Expenses: Omar', amount: 300, payee: 'Omar' }, { actor: 'p_owner' }).ok);
  clock.advance(31 * 86_400_000);
  await api.kernel.drain();
  const questions = async (ctx: CallContext) => value<{ question: string }[]>(await api.governance({ register: 'suggestion' }, ctx)).map((q) => q.question);
  const missed = (await questions(owner)).filter((q) => q.includes('observed 3'));
  assert.equal(missed.length, 1, 'the precondition: the miss filed its question');
  assert.deepEqual((await questions(member)).filter((q) => q.includes('observed 3')), [], 'the miss reached a member refused list money');
  assert.deepEqual((await questions(both)).filter((q) => q.includes('observed 3')), missed, 'somebody who reads the lists was not shown the miss');
  sql.close();
});
