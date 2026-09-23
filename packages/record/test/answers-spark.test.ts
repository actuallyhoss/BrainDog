/**
 * The host's switch for an automation's question to Spark, as the record takes it (`RecordDeps.answersSpark`,
 * `loop/research-infer-ask-next.md` Brief A item 5).
 *
 * THE RECORD PASSES THE SWITCH THROUGH AND DECIDES NOTHING ITSELF. Whether a host answers an `infer.ask` job is the host's
 * to say, because only the host knows whether it has a model and runs the pass that leases the job. A record opened
 * without the field is every host today, and it must still refuse the step at install with `NOT_IN_THIS_BUILD`; a
 * record whose host says yes installs it. Measured before the field existed: `createRecordApi({ ..., answersSpark: true })`
 * was refused like any other, since the flag stopped at this package's door.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] },
};

/** `flow-waits.test.ts`'s `RATE`: a row written, one question to Spark about it, and a note with the answer. */
const RATE = {
  id: 'rule.rate',
  kind: 'rule',
  body: {
    rule: 'rate',
    on: { written: { register: 'obligations', op: ['create'] } },
    once_per: ['entry'],
    steps: [
      { ask_spark: { question: 'What rate applies to {{what}}?', about: ['what', 'note'], as: 'rate', shape: 'number' } },
      { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
    ],
  },
};

type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

const installed = async (answersSpark?: boolean): Promise<Out> => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(answersSpark === undefined ? {} : { answersSpark }) });
  const out = (await api.kernel.install([OBLIGATIONS, RATE] as never)) as Out;
  sql.close();
  return out;
};

test('A HOST THAT SAYS IT ANSWERS SPARK INSTALLS A RULE THAT ASKS, through the record', async () => {
  const out = await installed(true);
  assert.equal(out.ok, true, out.refusal ? `${out.refusal.code} at ${out.refusal.at}: ${out.refusal.fix}` : '');
});

test('A HOST THAT SAYS NOTHING, OR SAYS NO, IS REFUSED NOT_IN_THIS_BUILD at the step', async () => {
  for (const said of [undefined, false]) {
    const out = await installed(said);
    assert.equal(out.ok, false, `answersSpark: ${String(said)} installed a rule nothing would answer`);
    assert.equal(out.refusal?.code, 'NOT_IN_THIS_BUILD');
    assert.equal(out.refusal?.at, 'steps[0].ask_spark');
  }
});
