/**
 * An automation's question is held to the readers of the list its run is about, and it is answered only by somebody who
 * could have made the change the run makes on the answer.
 *
 * WHAT WAS MEASURED. `ask_person` fills its question from the run's row and files it as an `options` suggestion whose
 * body names the run and the step and no list. `holds` sends a question that names no list to whoever reads the whole
 * record, and a member at `decide` with Money held to `append` is such a reader: refused `list money`, she read
 * "Pay Salary: Omar, 91000" in `governance` and in `whatsNew`, answered it, and the run then set a field on the Money
 * row, which `append` does not allow her to do by hand.
 *
 * SO THE RECORD FINDS THE RUN'S LIST FROM THE RUN. The run row the kernel wrote keeps what started it, and a written
 * trigger names its list. A question held back from her is one she may not answer, and she is told what a missing id
 * is told; a question she may read is still one she may not answer when the rule writes where her level does not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const MONEY = {
  id: 'register.money',
  kind: 'register' as const,
  body: {
    id: 'money',
    name: 'Money',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'int' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

/* The rule: ask on every new Money row, and set its note when the answer is `pay`. */
const PAYIT = {
  id: 'rule.payit',
  kind: 'rule' as const,
  body: {
    rule: 'payit',
    on: { written: { register: 'money', op: ['create'] } },
    once_per: ['entry'],
    steps: [
      { ask_person: { question: 'Pay {{what}}, {{trigger.row.amount}}?', options: ['pay', 'hold'], as: 'answer', wait: '1d' } },
      { if: 'answer is pay', then: [{ set: { field: 'note', to: 'approved by the member' } }], else: [] },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** The member: may decide on the record, held to `append` on Money. */
const appender: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'decide' }, levels: { money: 'append' } };
/** Reads Money and may not change a row of it. */
const reader: CallContext = { principal: { kind: 'person', id: 'p_r', level: 'decide' }, levels: { money: 'read' } };
/** May change a row of Money, which is what the run does on `pay`. */
const writer: CallContext = { principal: { kind: 'person', id: 'p_w', level: 'decide' }, levels: { money: 'write' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

async function asked() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install([MONEY, PAYIT]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
  await api.kernel.drain();
  const run = () => sql.one<{ state: string }>("SELECT state FROM automation_run WHERE rule = 'payit'")?.state;
  const note = () => sql.one<{ note: string | null }>("SELECT json_extract(fields, '$.note') AS note FROM entry WHERE register = 'money'")?.note ?? null;
  assert.equal(run(), 'waiting');
  const sg = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE opened_by = 'rule:payit' AND status = 'open'")!;
  const pay = (JSON.parse(sg.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'pay')!.id;
  const shown = async (ctx: CallContext) => {
    const g = (await api.governance({ status: 'open' }, ctx)) as Out;
    assert.ok(g.ok, JSON.stringify(g));
    return (g.value as { opened_by?: string }[]).some((s) => s.opened_by === 'rule:payit');
  };
  return { sql, api, run, note, id: sg.id, pay, shown };
}

test("A RUN'S QUESTION IS HELD BACK FROM A MEMBER WHO MAY NOT READ ITS LIST, and her answer is the answer a missing id gets", async () => {
  const { sql, api, run, note, id, pay, shown } = await asked();

  assert.equal(await shown(appender), false, 'the question reached governance for a member refused list money');
  const news = await api.whatsNew({}, appender);
  assert.equal(JSON.stringify(news).includes('Omar'), false, 'whatsNew named the Money row to a member refused list money');

  const missing = (await api.decide({ id: 'SG999', decide: { option: pay, reason: 'Go.' } }, appender)) as Out;
  const d = (await api.decide({ id, decide: { option: pay, reason: 'Go.' } }, appender)) as Out;
  assert.equal(d.ok, false, `her answer was taken: ${JSON.stringify(d)}`);
  assert.equal(d.refusal?.code, missing.refusal?.code);
  assert.equal(d.refusal?.fix, `There is no suggestion called ${id}.`);

  /* CLOSING IT UNANSWERED FAILED THE RUN THE SAME WAY, so the same refusal holds for it. */
  const closed = (await api.decide({ id, resolved_as: 'wont-fix', reason: 'No.' }, appender)) as Out;
  assert.equal(closed.refusal?.code, missing.refusal?.code);

  await api.kernel.drain();
  assert.equal(run(), 'waiting');
  assert.equal(note(), null);
  sql.close();
});

test('A MEMBER WHO READS THE LIST SEES THE QUESTION, and may not answer it while the run writes where she may not', async () => {
  const { sql, api, run, note, id, pay, shown } = await asked();

  assert.equal(await shown(reader), true);
  const d = (await api.decide({ id, decide: { option: pay, reason: 'Go.' } }, reader)) as Out;
  assert.equal(d.ok, false, `a member at read on Money chose the branch that edits a Money row: ${JSON.stringify(d)}`);
  assert.equal(d.refusal?.code, 'LEVEL_REQUIRED');
  assert.match(d.refusal?.fix ?? '', /Money/u);

  await api.kernel.drain();
  assert.equal(run(), 'waiting');
  assert.equal(note(), null);
  sql.close();
});

test('SOMEBODY WHO COULD HAVE MADE THE CHANGE ANSWERS IT, and the run takes its steps', async () => {
  for (const ctx of [writer, owner]) {
    const { sql, api, run, note, id, pay, shown } = await asked();
    assert.equal(await shown(ctx), true);
    const d = (await api.decide({ id, decide: { option: pay, reason: 'Go.' } }, ctx)) as Out;
    assert.ok(d.ok, JSON.stringify(d));
    await api.kernel.drain();
    assert.equal(run(), 'done');
    assert.equal(note(), 'approved by the member');
    sql.close();
  }
});

test("A RULE'S INLINE suggest IS FILLED FROM ITS ROW THE SAME WAY, and is held to that row's list too", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const CHASE = {
    id: 'rule.chase',
    kind: 'rule' as const,
    body: { rule: 'chase', register: 'money', once_per: ['entry'], then: [{ suggest: { question: 'Chase {{what}}?', options: ['yes', 'no'] } }] } as never,
  };
  assert.ok((await api.kernel.install([MONEY, CHASE])).ok);
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
  await api.kernel.drain();
  const opened = sql.one<{ opened_by: string }>("SELECT opened_by FROM suggestion WHERE status = 'open'");
  assert.equal(opened?.opened_by, 'rule:chase');
  const g = (await api.governance({ status: 'open' }, appender)) as Out;
  assert.equal(JSON.stringify(g).includes('Omar'), false, 'a rule suggest named the Money row to a member refused list money');
  const o = (await api.governance({ status: 'open' }, owner)) as Out;
  assert.equal(JSON.stringify(o).includes('Omar'), true);
  sql.close();
});

/* TWO MORE CASES. Taking the `note` line and the `create` line out of `answersNot` left every test above green, so
   neither rung was held by anything: a member at `read` on Money answered a run whose only later step is a note, and a
   member at `write` on Money answered a run that adds a row to a list she only reads. */
test('A NOTE ON THE ROW NEEDS APPEND ON ITS LIST, AND A NEW ROW NEEDS APPEND WHERE IT LANDS, before the answer is taken', async () => {
  const LEDGER = {
    id: 'register.ledger',
    kind: 'register' as const,
    body: { id: 'ledger', name: 'Ledger', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
  };
  const rule = (name: string, after: Record<string, unknown>) => ({
    id: `rule.${name}`,
    kind: 'rule' as const,
    body: {
      rule: name,
      on: { written: { register: 'money', op: ['create'] } },
      once_per: ['entry'],
      steps: [{ ask_person: { question: 'Log {{what}}?', options: ['yes', 'no'], as: 'answer', wait: '1d' } }, { if: 'answer is yes', then: [after], else: [] }],
    } as never,
  });
  for (const [name, after, who, list] of [
    ['noteit', { note: 'logged by the member' }, reader, /Money/u],
    ['bookit', { create: { register: 'ledger', bound: 1, fields: { what: 'booked' } } }, { ...writer, levels: { money: 'write', ledger: 'read' } }, /Ledger/u],
  ] as const) {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
    const put = await api.kernel.install([MONEY, LEDGER, rule(name, after)]);
    assert.ok(put.ok, JSON.stringify(put));
    assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
    await api.kernel.drain();
    const sg = sql.one<{ id: string; body: string }>(`SELECT id, body FROM suggestion WHERE opened_by = 'rule:${name}' AND status = 'open'`)!;
    const yes = (JSON.parse(sg.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
    const d = (await api.decide({ id: sg.id, decide: { option: yes, reason: 'Go.' } }, who as CallContext)) as Out;
    assert.equal(d.ok, false, `${name}: the answer was taken from somebody who could not make the rule's change: ${JSON.stringify(d)}`);
    assert.equal(d.refusal?.code, 'LEVEL_REQUIRED');
    assert.match(d.refusal?.fix ?? '', list);
    const took = (await api.decide({ id: sg.id, decide: { option: yes, reason: 'Go.' } }, owner)) as Out;
    assert.ok(took.ok, `${name}: ${JSON.stringify(took)}`);
    sql.close();
  }
});

test('A PROPOSER WHO PUTS A RUN ON HER OWN QUESTION DOES NOT FILE IT UNDER THAT RUN, nor answer the run by it', async () => {
  const { sql, api, run } = await asked();
  const theRun = sql.one<{ id: string }>("SELECT id FROM automation_run WHERE rule = 'payit'")!.id;
  const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };
  const forged = (await api.propose(
    { question: 'Whole-record question', body_kind: 'options', body: { options: [{ id: 'o1', label: 'pay', because: 'x' }, { id: 'o2', label: 'hold', because: 'y' }], run: theRun, step: 0 } } as never,
    agent,
  )) as Out;
  assert.ok(forged.ok, JSON.stringify(forged));
  /* Invited to Money alone, at write: not a whole-record reader, so a question about no list is not hers. */
  const moneyOnly: CallContext = { principal: { kind: 'person', id: 'p_x', level: null }, registers: ['money'], levels: { money: 'write' } };
  const g = (await api.governance({ status: 'open' }, moneyOnly)) as Out;
  assert.equal(JSON.stringify(g).includes('Whole-record question'), false);
  assert.equal(run(), 'waiting');
  sql.close();
});

/* MEASURED ON f7c88f98. `answersNot` walked every step of the rule, so a step the run took before it asked held the
   answer too: `[set note, ask_person, if yes then notify]` refused a member at `read` on Money whose answer leads only
   to a notify, because of the `set` the run had already made. Only the steps a run can still reach from the one it
   waits on are what the answer lets it do. */
const rule = (name: string, steps: unknown[]) => ({
  id: `rule.${name}`,
  kind: 'rule' as const,
  body: { rule: name, on: { written: { register: 'money', op: ['create'] } }, once_per: ['entry'], steps } as never,
});
const ASK = { ask_person: { question: 'Go on with {{what}}?', options: ['yes', 'no'], as: 'answer', wait: '1d' } };

async function waiting(name: string, steps: unknown[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install([MONEY, rule(name, steps)]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
  await api.kernel.drain();
  const state = () => sql.one<{ state: string }>(`SELECT state FROM automation_run WHERE rule = '${name}'`)?.state;
  assert.equal(state(), 'waiting');
  const sg = sql.one<{ id: string; body: string }>(`SELECT id, body FROM suggestion WHERE opened_by = 'rule:${name}' AND status = 'open'`)!;
  const yes = (JSON.parse(sg.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
  const answer = async (ctx: CallContext) => (await api.decide({ id: sg.id, decide: { option: yes, reason: 'Go.' } }, ctx)) as Out;
  return { sql, api, state, answer };
}

test('A STEP THE RUN TOOK BEFORE IT ASKED DOES NOT HOLD THE ANSWER: only the steps after the wait count', async () => {
  const { sql, api, state, answer } = await waiting('before', [
    { set: { field: 'note', to: 'pending' } },
    ASK,
    { if: 'answer is yes', then: [{ notify: { say: 'Go on with {{trigger.row.what}}.' } }], else: [] },
  ]);
  const d = await answer(reader);
  assert.ok(d.ok, `a member at read was refused for a set the run made before it asked: ${JSON.stringify(d)}`);
  await api.kernel.drain();
  assert.equal(state(), 'done');
  sql.close();
});

test('A STEP ON AN ARM THE RUN HAS LEFT DOES NOT HOLD IT EITHER, and one it can still reach does', async () => {
  /* The ask sits in the `then` arm, so the `else` arm's `set` is behind it for good; the `note` after the branch is not. */
  const branch = (after: unknown[]) => [
    { if: 'what is set', then: [ASK], else: [{ set: { field: 'note', to: 'small' } }] },
    ...after,
  ];
  {
    const { sql, answer } = await waiting('armleft', branch([]));
    const d = await answer(reader);
    assert.ok(d.ok, `refused for a set on the arm the run did not take: ${JSON.stringify(d)}`);
    sql.close();
  }
  {
    const { sql, answer } = await waiting('armafter', branch([{ note: 'asked' }]));
    const d = await answer(reader);
    assert.equal(d.ok, false, `a note after the branch was let through: ${JSON.stringify(d)}`);
    assert.equal(d.refusal?.code, 'LEVEL_REQUIRED');
    sql.close();
  }
});

/* THE ARM HER ANSWER DOES NOT CHOOSE IS STILL AHEAD OF THE RUN. The plan walk follows an `if` both ways, and dropping
   the `else` target (`todo.push(i + 1)` alone) kept every other case in this file green, because each write they hold
   sits in a `then`. The `if` is evaluated when the run wakes, against the row as it is then, so a write on either arm
   is one her answer may lead to. */
test('A WRITE ON THE else ARM AFTER THE ASK HOLDS THE ANSWER as one on the then arm does', async () => {
  const { sql, answer } = await waiting('otherarm', [
    ASK,
    { if: 'answer is yes', then: [{ notify: { say: 'Go on.' } }], else: [{ set: { field: 'note', to: 'refused' } }] },
  ]);
  const d = await answer(reader);
  assert.equal(d.ok, false, `a set on the else arm was left out of what the answer lets the run do: ${JSON.stringify(d)}`);
  assert.equal(d.refusal?.code, 'LEVEL_REQUIRED');
  const took = await answer(writer);
  assert.ok(took.ok, JSON.stringify(took));
  sql.close();
});

/* `schedule` WAS HELD TO NOTHING. It arms the rule's own reminder, and when that is due the kernel writes a `note` event
   on the row signed by the rule (`index.ts`, the `rule` schedule kind): a note on the row, later. A member at `read` on
   Money may not add one by hand, and before this answered a run whose only later step is a `schedule`. */
test('A schedule AFTER THE ASK NEEDS WHAT A NOTE NEEDS: append on the row\'s list', async () => {
  const { sql, api, state, answer } = await waiting('later', [ASK, { if: 'answer is yes', then: [{ schedule: { in: '14d', note: 'Check {{what}} again.' } }], else: [] }]);
  const d = await answer(reader);
  assert.equal(d.ok, false, `a member at read set off a reminder on a Money row: ${JSON.stringify(d)}`);
  assert.equal(d.refusal?.code, 'LEVEL_REQUIRED');
  assert.match(d.refusal?.fix ?? '', /Money/u);
  const took = await answer(writer);
  assert.ok(took.ok, JSON.stringify(took));
  await api.kernel.drain();
  assert.equal(state(), 'done');
  sql.close();
});

/* A QUESTION FROM AN ARRIVAL. An arrival's run names a list only when the arrival wrote a row, and a question that
   names no list went to every whole-record reader. The run's scope carries the arrival's own words as `trigger.body`,
   so "Arrived: {{trigger.body}}" put the inbox in front of a member at `decide` whom `inbox` itself refuses: measured,
   the arrival wrote `[]`, her `inbox` was `FORBIDDEN`, and her `governance` named Omar. The body is the owner's alone,
   so the question is too, and it is held as `inbox` holds it. */
test('A QUESTION ABOUT AN ARRIVAL THAT WROTE NO ROW IS HELD TO THE OWNER, as the inbox it was filled from is', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const ARRIVED = {
    id: 'rule.arrived',
    kind: 'rule' as const,
    body: {
      rule: 'arrived',
      on: { arrival: { channel: 'webhook' } },
      steps: [{ ask_person: { question: 'Arrived: {{trigger.body}}', options: ['pay', 'hold'], as: 'answer', wait: '1d' } }],
    } as never,
  };
  assert.ok((await api.kernel.install([MONEY, ARRIVED])).ok);
  const got = api.kernel.arrive({ channel: 'webhook', body: 'Payroll: Omar 91000', sha256: 'x1', verified: true } as never);
  assert.ok(got.ok, JSON.stringify(got));
  assert.deepEqual((got as { value: { wrote: unknown[] } }).value.wrote, [], 'the arrival wrote a row, so this is not the case');
  await api.kernel.drain();
  const sg = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE opened_by = 'rule:arrived' AND status = 'open'");
  assert.ok(sg, 'the rule asked nothing');

  /* THE WITNESS: the inbox the question was filled from is refused her. */
  const inbox = (await api.inbox({}, appender)) as Out;
  assert.equal(inbox.refusal?.code, 'FORBIDDEN');
  const g = (await api.governance({ status: 'open' }, appender)) as Out;
  assert.equal(JSON.stringify(g).includes('Omar'), false, "the arrival's words reached governance for a member the inbox refuses");
  const news = await api.whatsNew({}, appender);
  assert.equal(JSON.stringify(news).includes('Omar'), false, "the arrival's words reached whatsNew for a member the inbox refuses");
  const d = (await api.decide({ id: sg.id, resolved_as: 'wont-fix', reason: 'No.' }, appender)) as Out;
  assert.equal(d.refusal?.fix, `There is no suggestion called ${sg.id}.`);

  const o = (await api.governance({ status: 'open' }, owner)) as Out;
  assert.equal(JSON.stringify(o).includes('Payroll: Omar 91000'), true, 'the owner lost her own question');
  sql.close();
});

/* AND A STEP `suggest` ON THE SAME ARRIVAL, which carries no run, so its rule is all there is to place it by. The rule
   names no door whose row it could be about, so it is held as the run's own question is. */
test('A STEP suggest FILLED FROM AN ARRIVAL THAT WROTE NO ROW IS HELD TO THE OWNER TOO', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const ARRIVED = {
    id: 'rule.arrived',
    kind: 'rule' as const,
    body: { rule: 'arrived', on: { arrival: { channel: 'webhook' } }, steps: [{ suggest: { question: 'Arrived: {{trigger.body}}', options: ['yes', 'no'] } }] } as never,
  };
  assert.ok((await api.kernel.install([MONEY, ARRIVED])).ok);
  assert.ok(api.kernel.arrive({ channel: 'webhook', body: 'Payroll: Omar 91000', sha256: 'x1', verified: true } as never).ok);
  await api.kernel.drain();
  assert.ok(sql.one("SELECT id FROM suggestion WHERE opened_by = 'rule:arrived' AND status = 'open'"), 'the rule asked nothing');
  const g = (await api.governance({ status: 'open' }, appender)) as Out;
  assert.equal(JSON.stringify(g).includes('Omar'), false, "the arrival's words reached governance for a member the inbox refuses");
  const o = (await api.governance({ status: 'open' }, owner)) as Out;
  assert.equal(JSON.stringify(o).includes('Payroll: Omar 91000'), true, 'the owner lost her own question');
  sql.close();
});

/* A QUESTION WITH NO RUN. A question with no run is placed by its rule's body, and that was read
   `ORDER BY version DESC`, today's body and not the one that asked. Measured: `rule.chase` on Money suggested "Chase
   Salary: Omar?", held back from a member at `append` on Money, and the moment the owner re-declared the rule on Inbox
   the same question, still about the Money row, reached her `governance` and `whatsNew`. */
test('AN INLINE suggest STAYS WITH THE LIST ITS RULE WAS ON WHEN IT ASKED, after the rule moves to another list', async () => {
  const INBOX = {
    id: 'register.inbox',
    kind: 'register' as const,
    body: { id: 'inbox', name: 'Inbox', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
  };
  const chase = (register: string) => ({
    id: 'rule.chase',
    kind: 'rule' as const,
    body: { rule: 'chase', register, once_per: ['entry'], then: [{ suggest: { question: 'Chase {{what}}?', options: ['yes', 'no'] } }] } as never,
  });
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([MONEY, INBOX, chase('money')])).ok);
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
  await api.kernel.drain();
  const seen = async () => JSON.stringify(await api.governance({ status: 'open' }, appender)).includes('Omar');
  assert.equal(await seen(), false);

  clock.advance(60 * 60 * 1000);
  const moved = await api.kernel.install([chase('inbox')]);
  assert.ok(moved.ok, JSON.stringify(moved));
  assert.equal(await seen(), false, 'the Money question reached a member refused list money once its rule moved to Inbox');
  const news = await api.whatsNew({}, appender);
  assert.equal(JSON.stringify(news).includes('Omar'), false, 'whatsNew named the Money row after the rule moved');
  sql.close();
});

/* THE `run` HALF: DECIDED, AND HELD TO NO LEVEL. The walk counts every verb that changes the record, and `run` changes
   nothing in it: it queues one call carrying the fields its `sends:` names, to the host and with the key the owner
   approved when the call was installed. Measured here, a member at `read` on Money answers, the call is queued, and the
   row is as it was. What she is shown is already held: the lint keeps a call's `sends:` on its rule's list and `holds`
   asks her to read that list first, so she has read every field the call sends. If this goes red because a level was
   added, that is a change of the decision, and the comment on `answersNot` changes too. */
test('A run AFTER THE ASK IS ANSWERED BY A MEMBER WHO READS THE LIST: the call is queued and nothing on the row changes', async () => {
  const POST = {
    id: 'ingest.post_money',
    kind: 'ingest' as const,
    body: { ingest: 'post_money', channel: 'call', url: 'https://hooks.example.test/money', trigger: 'rule', grant: 'hook key', sends: ['money.what'] } as never,
  };
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install([MONEY, POST, rule('postit', [ASK, { if: 'answer is yes', then: [{ run: 'post_money' }], else: [] }])]);
  assert.ok(put.ok, JSON.stringify(put));
  /* A call whose key is missing pauses instead of queueing, so the key is in the keychain. */
  const key = { label: 'hook key', opens: 'hooks.example.test', kind: 'api_token' as const, ciphertext: new Uint8Array([1]), nonce: new Uint8Array([9]), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' };
  assert.ok(api.kernel.bindGrant(key, 'p_owner').ok);
  assert.ok(api.kernel.create('money', { what: 'Salary: Omar', amount: 91000 }, { actor: 'p_owner' }).ok);
  await api.kernel.drain();
  const calls = () => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE json_extract(payload, '$.ingest') = 'post_money'").length;
  const before = calls();
  const sg = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE opened_by = 'rule:postit' AND status = 'open'")!;
  const yes = (JSON.parse(sg.body) as { options: { id: string; label: string }[] }).options.find((o) => o.label === 'yes')!.id;
  const row = () => sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'money'")!.fields;
  const was = row();

  const d = (await api.decide({ id: sg.id, decide: { option: yes, reason: 'Go.' } }, reader)) as Out;
  assert.ok(d.ok, `a member at read was refused a question whose only later step is a call: ${JSON.stringify(d)}`);
  await api.kernel.drain();
  assert.equal(sql.one<{ state: string }>("SELECT state FROM automation_run WHERE rule = 'postit'")?.state, 'done');
  assert.equal(calls(), before + 1, 'the answer did not queue the call');
  assert.equal(row(), was, 'the call changed the row');
  sql.close();
});
