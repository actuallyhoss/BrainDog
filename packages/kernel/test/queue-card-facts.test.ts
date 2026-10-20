/**
 * What a queue's question carries for the decision card (DIRECTION §37): the run that asked, by what it was doing and
 * the app it ran in; who drafted it; the money accepting writes; what changes on the one row it updates; and the kinds of
 * change it is. Each is left off where the record cannot say it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keysOfStamp, openRecord, type Declaration, type PageBlock, type QueueQuestion, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true, label: 'What' },
      { id: 'cost', type: 'money' },
      { id: 'pin', type: 'secret' },
      { id: 'after', type: 'ref', to: 'tasks', label: 'After' },
      { id: 'stage', type: 'enum', values: ['to_do', 'in_kiln'], labels: { in_kiln: 'In the kiln' } },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  value(k.create('tasks', { what: 'Glaze test', cost: { amount: 500, currency: 'GBP' } }, OWNER));
  return { k, sql };
}

const queued = (k: Awaited<ReturnType<typeof record>>['k']): QueueQuestion[] =>
  (k.block({ kind: 'queue', source: 'governance.open' } as PageBlock) as unknown as { queue?: QueueQuestion[] }).queue ?? [];

test('A QUESTION A RUN ASKED NAMES THE RUN AND ITS APP, the money it writes and what changes from what to what', async () => {
  const { k, sql } = await record();
  const run: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client: 'claude-code' } };
  value(
    k.propose(
      {
        question: 'Raise the glaze test?',
        title: 'Pricing the kiln work',
        body_kind: 'rowset',
        body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { what: 'Glaze test two', cost: { amount: 1298, currency: 'GBP' }, pin: '1234' } }] },
      } as never,
      run,
    ),
  );
  const [q] = queued(k);
  assert.ok(q);
  assert.equal(q.run?.id, 'S1');
  assert.equal(q.run?.app, 'Claude Code');
  assert.equal(q.run?.name, 'Pricing the kiln work');
  assert.deepEqual(q.money, [{ amount: 1298, currency: 'GBP' }]);
  assert.deepEqual(q.changes, [
    { field: 'what', label: 'What', before: 'Glaze test', after: 'Glaze test two' },
    { field: 'cost', before: { amount: 500, currency: 'GBP' }, after: { amount: 1298, currency: 'GBP' } },
  ]);
  assert.ok(!JSON.stringify(q.changes).includes('1234'), 'a secret is never said');
  /* THE KINDS ARE THE ONES STAMPED ON THE QUESTION WHEN IT WAS FILED (`suggestion.kind`), as the ladder counts them. */
  const stamp = sql.one<{ kind: string | null }>('SELECT kind FROM suggestion WHERE id = ?', q.id)?.kind ?? null;
  assert.ok(stamp !== null);
  assert.deepEqual(q.kinds, keysOfStamp(stamp));
  assert.equal(q.kind, 'rowset', 'the body’s kind stays what a queue’s where: reads');
  assert.equal(q.drafted_by, undefined);
  sql.close();
});

test('A QUESTION SLASH DRAFTED SAYS SO, and a person’s own question names no run', async () => {
  const { k, sql } = await record();
  value(k.propose({ question: 'Which one first?', body_kind: 'options', body: { options: [{ id: 'a', label: 'Glaze', because: 'It is due first.' }, { id: 'b', label: 'Fire', because: 'The kiln is free.' }] } }, OWNER, 'slash:rules'));
  const [q] = queued(k);
  assert.ok(q);
  assert.equal(q.drafted_by, 'slash:rules');
  assert.equal(q.run, undefined);
  assert.equal(q.money, undefined);
  assert.equal(q.changes, undefined);
  sql.close();
});

test('MONEY IN TWO CURRENCIES IS TWO VALUES, never added, and changes are said only for a question about one row', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { what: 'Fire' }, OWNER));
  value(
    k.propose(
      {
        question: 'Cost both?',
        body_kind: 'rowset',
        body: {
          register: 'tasks',
          rows: [
            { at: 'tasks#1', version: 1, patch: { cost: { amount: 1000, currency: 'GBP' } } },
            { at: 'tasks#2', version: 1, patch: { cost: { amount: 2500, currency: 'EGP' } } },
          ],
        },
      },
      OWNER,
    ),
  );
  const [q] = queued(k);
  assert.deepEqual(q?.money, [
    { amount: 1000, currency: 'GBP' },
    { amount: 2500, currency: 'EGP' },
  ]);
  assert.equal(q?.changes, undefined);
  sql.close();
});

test('A LINK THAT CHANGES IS SAID BY THE ROW IT POINTS AT, and an enum by its label, never by an id', async () => {
  const { k, sql } = await record();
  const fire = value<{ id: string }>(k.create('tasks', { what: 'Fire', stage: 'to_do' }, OWNER));
  value(
    k.propose(
      { question: 'Glaze after firing?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { after: fire.id, stage: 'in_kiln' } }] } },
      OWNER,
    ),
  );
  const [q] = queued(k);
  assert.deepEqual(q?.changes, [
    { field: 'after', label: 'After', before: null, after: 'Fire' },
    { field: 'stage', before: null, after: 'In the kiln' },
  ]);
  assert.ok(!JSON.stringify(q?.changes).includes(fire.id), 'a row id is never said');
  sql.close();
});

test('A QUESTION THAT CHANGES MONEY ON A ROW IS HARD TO UNDO, ranked and counted so, and one that adds an amount keeps its band', async () => {
  const { k, sql } = await record();
  /* A change of a task's cost, and two new rows, which are the cheap `rows` band: one records an amount, the other none.
     MEASURED ON THE LIVE RECORD, 20 Oct: a bank text added to the Ledger read "Accept EGP 34,620, can't be undone
     easily" and "Moves EGP 34,620", for a row that moves nothing and is deleted like any other. */
  value(k.propose({ question: 'Cost the kiln?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { cost: { amount: 1000, currency: 'GBP' } } }] } } as never, OWNER));
  value(k.propose({ question: 'Add the kiln bill?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Kiln bill', cost: { amount: 4200, currency: 'GBP' } }] } } as never, OWNER));
  value(k.propose({ question: 'Add the glaze run?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Glaze run' }] } } as never, OWNER));
  const block = k.block({ kind: 'queue', source: 'governance.open' } as PageBlock) as unknown as { queue?: QueueQuestion[]; waiting?: { hardToUndo: number } };
  const queue = block.queue ?? [];
  assert.deepEqual(queue[0] && [queue[0].question, queue[0].cost], ['Cost the kiln?', 'undo'], 'the money changed moves first, as hard to undo');
  const by = new Map(queue.map((q) => [q.question, q]));
  assert.equal(by.get('Add the kiln bill?')?.cost, 'rows');
  assert.deepEqual(by.get('Add the kiln bill?')?.money, [{ amount: 4200, currency: 'GBP' }]);
  assert.equal(by.get('Add the kiln bill?')?.records, true, 'an added amount is said as moved');
  assert.equal(by.get('Cost the kiln?')?.records, undefined);
  assert.equal(by.get('Add the glaze run?')?.cost, 'rows');
  assert.equal(block.waiting?.hardToUndo, 1);
  /* A queue with a where: reads the same band. */
  const hard = k.block({ kind: 'queue', source: 'governance.open', where: 'cost is undo' } as PageBlock) as unknown as { queue?: QueueQuestion[] };
  assert.deepEqual((hard.queue ?? []).map((q) => q.question), ['Cost the kiln?']);
  sql.close();
});

test('ONE QUESTION READ ON ITS OWN SAYS WHAT THE QUEUE SAYS, and the run and the changes only to a reader of every list', async () => {
  const { k } = await record();
  const run: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client: 'claude-code' } };
  const { id } = value<{ id: string }>(
    k.propose(
      {
        question: 'Raise the glaze test?',
        title: 'Pricing the kiln work',
        body_kind: 'rowset',
        body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { cost: { amount: 1298, currency: 'GBP' } } }] },
      } as never,
      run,
      'slash',
    ),
  );
  const [q] = queued(k);
  assert.ok(q);
  const whole = k.queueQuestion(id);
  assert.ok(whole);
  assert.deepEqual(whole, { run: q.run, drafted_by: q.drafted_by, money: q.money, changes: q.changes, kinds: q.kinds });
  assert.equal(whole.drafted_by, 'slash');
  assert.deepEqual(k.queueQuestion(id, { everyList: true }), whole);

  /* A READER HELD FROM A LIST is told the money, who drafted it and its kinds, and never the run or a row's value now. */
  const held = k.queueQuestion(id, { everyList: false });
  assert.ok(held);
  assert.equal(held.run, undefined);
  assert.equal(held.changes, undefined);
  assert.deepEqual(held.money, [{ amount: 1298, currency: 'GBP' }]);
  assert.equal(held.drafted_by, 'slash');
  assert.deepEqual(held.kinds, whole.kinds);

  assert.equal(k.queueQuestion('nothing-here'), null);
});
