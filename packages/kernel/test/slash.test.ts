/**
 * What a model may write into the log.
 *
 * `30 §3` STATES IT AS A QUERY: `event WHERE actor = 'slash' AND kind NOT IN
 * ('suggest','propose','predict')` is empty. `52 §5.2` makes that a gate over the `corpus` record,
 * and the corpus lives in `@braindog/fixtures`, which is one of the four packages this build does
 * not have. So the gate is blocked and the INVARIANT is not: it is the one sentence this product
 * makes about what a model can do to a record — it proposes, and a person decides — and until now
 * it was true by convention and by nothing else.
 *
 * THE TEST IS OVER THE REAL WRITE PATHS, not over the guard. Asserting that `slashMayWrite` throws
 * would assert that an `if` is an `if`. What is worth knowing is that every route by which a
 * model's answer reaches the log goes through it, and that the three kinds it is allowed still
 * work — because a guard that refuses everything would also pass a test that only tries the
 * refusals.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, SLASH, SLASH_KINDS, slashMayWrite, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 7, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql };
}

test('A MODEL CANNOT WRITE A ROW, however it arrives at the write path', async () => {
  const { k, sql } = await record();

  /* THE ORDINARY WRITE PATH. `create` takes its actor from the `CallContext`, and nothing between
     the caller and the log looked at it — so a deliverer that filed a model's answer as a write
     rather than as a proposal produced a row in the register with `slash` against it, and the log
     said a model had changed the business. */
  assert.throws(
    () => k.create('obligations', { what: 'Invoice 99', state: 'open' }, { actor: SLASH }),
    /slash wrote create/,
  );

  const made = k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' });
  assert.ok(made.ok, 'a person cannot write either, which is not the rule');

  assert.throws(() => k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: SLASH }), /slash wrote/);

  /* AND NOTHING GOT IN. The check is before the insert, so a refused write leaves no half-event. */
  assert.equal(sql.all("SELECT 1 FROM event WHERE actor = 'slash'").length, 0);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, 1);
  sql.close();
});

test('AND `30 §3`’s QUERY IS EMPTY over a record that has been used', async () => {
  /* The gate `52 §5.2` asks for, run over what this build can make instead of over the corpus it
     cannot. It is the assertion that matters, and the day `@braindog/fixtures` exists it becomes a
     gate over a bigger record rather than a different check. */
  const { k, sql } = await record();

  k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' });
  k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: 'p_1' });
  k.log('obligations', 1, { actor: 'p_1' }, 'Chased twice.');

  const wrong = sql.all<{ kind: string }>(
    `SELECT kind FROM event WHERE actor = 'slash' AND kind NOT IN ('suggest','propose','predict')`,
  );
  assert.deepEqual(wrong, [], `slash wrote ${wrong.map((r) => r.kind).join(', ')}`);
  sql.close();
});

test('THE THREE IT MAY WRITE ARE STILL WRITABLE, which a guard that refused everything would also pass', () => {
  for (const kind of SLASH_KINDS) slashMayWrite(SLASH, kind);
  assert.deepEqual([...SLASH_KINDS].sort(), ['predict', 'propose', 'suggest'], '30 §3: three kinds');

  /* AND THE GUARD IS ABOUT THE ACTOR AND NOT ABOUT THE KIND. Everybody else writes everything. */
  for (const kind of ['create', 'edit', 'note', 'decide', 'export']) slashMayWrite('p_1', kind);
});

test('A DIGEST’S NOTE CANNOT BE SIGNED BY THE MODEL THAT WROTE ITS PROSE', () => {
  /* `prose: slash` is the one declaration that puts a model's sentences into a digest, and the
     digest's delivery writes a `note` event. If the actor of that note were ever the model rather
     than the record, the log would say a model had written a note on its own account. */
  assert.throws(() => slashMayWrite(SLASH, 'note'), /slash wrote note/);
});
