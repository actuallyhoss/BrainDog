/**
 * A pack turned off ends its automations' unfinished runs, in the transaction that turns it off
 * (`loop/research-batch-thirty-five-audit.md` §3).
 *
 * WHAT WAS MEASURED BEFORE THE FIX. `disablePack` retires a pack's declarations through `declare.ts`'s own
 * `retireDeclarations`, which is not the kernel's `retire`, so nothing cancelled the run: it stayed `waiting` under a
 * rule that was off, and `enablePack` before the wake put the rule back live, so the wake found nothing stopped and took
 * every step. The audit's `packoff.mts` read "after enablePack waiting -> after the wake done; row note "chased";
 * notified ["Chased Rent"]", and the second test below failed on that line first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  pack: 'chaser',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const CHASED: Declaration = {
  id: 'rule.chased',
  kind: 'rule',
  pack: 'chaser',
  body: {
    rule: 'chased',
    on: { written: { register: 'obligations', op: ['create'] } },
    once_per: ['entry'],
    steps: [{ wait: '1h' }, { set: { field: 'note', to: 'chased' } }, { notify: { say: 'Chased {{what}}' } }],
  } as never,
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([OBLIGATIONS, CHASED]));
  k.rememberPack({
    id: 'chaser',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: JSON.stringify({ pack: 'chaser', version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }),
    checksum: 'sum-chaser',
  });
  return { k, sql, clock };
}

const run = (sql: NodeSql) => sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'chased'");
const notes = (sql: NodeSql) =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'rule:chased' ORDER BY rowid").map((r) => r.note);

test('TURNING A PACK OFF CANCELS ITS WAITING RUN AT ONCE, with a sentence that names the pack', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  assert.equal(run(sql)?.state, 'waiting');

  value(k.disablePack('chaser', { actor: 'p_1' }));
  assert.equal(run(sql)?.state, 'cancelled', 'the pack went off and its run was still shown waiting under it');
  assert.match(run(sql)?.say ?? '', /chaser was turned off/);
  assert.equal(
    sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'rule' AND key LIKE 'flow.run:%' AND state = 'pending'"),
    undefined,
    'the cancelled run kept its wake row',
  );
  sql.close();
});

test('A PACK TURNED OFF AND ON AGAIN BEFORE THE WAKE DOES NOT ACT: the run stays cancelled, no note, no notify', async () => {
  const { k, sql, clock } = await record();
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  value(k.disablePack('chaser', { actor: 'p_1' }));
  value(await k.enablePack('chaser', { actor: 'p_1' }));

  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(run(sql)?.state, 'cancelled', 'the run waiting when the pack went off woke under the pack turned back on');
  assert.equal(k.get(made.id)?.fields.note, undefined, 'the run wrote to the row');
  assert.deepEqual(notes(sql), [], 'the run notified');

  /* AND THE PACK IS REALLY ON AGAIN: a new row starts a new run, which the cancellation above did not poison. */
  value(k.create('obligations', { what: 'Water' }, { actor: 'p_1' }));
  await k.drain();
  clock.advance(2 * HOUR);
  await k.drain();
  assert.deepEqual(notes(sql), ['Chased Water']);
  sql.close();
});

test('A PACK TURN-OFF THAT IS REFUSED CANCELS NOTHING', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  assert.equal(k.disablePack('chaser', { alsoDisable: ['nothing-installed'] }).ok, false);
  assert.equal(run(sql)?.state, 'waiting');
  sql.close();
});

test('AND ONE REFUSED AFTER SOME RETIRES TAKES THEM BACK: the rule stays on, and its run wakes and acts', async () => {
  /* THE REFUSAL ABOVE COMES BEFORE ANY WRITE. This one comes from inside the loop, after `chaser` is retired: a second
     pack in the same call that owns the kernel's session register, which no install can make and is written into the
     table here, is refused whole by `retireDeclarations`. `disablePack` runs inside `attempt` for this case: the
     kernel's transaction is re-entrant, so the one in `declare.ts` is a no-op inside it, and under a plain
     `transaction` `chaser`'s retires committed with the refusal, and the run woke under a rule that was gone. */
  const { k, sql, clock } = await record();
  const made = value<Entry>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  await k.drain();
  sql.exec("UPDATE declaration SET pack_id = 'ledger' WHERE id = 'register.session' AND superseded_at IS NULL AND retired = 0");

  const refused = k.disablePack('chaser', { alsoDisable: ['ledger'], actor: 'p_1' });
  assert.equal(refused.ok ? null : 'refusal' in refused ? refused.refusal.code : 'conflict', 'PROVIDES_CONFLICT');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'rule.chased' AND retired = 0 AND superseded_at IS NULL")?.n, 1, 'the refused turn-off kept its retire of the rule');
  assert.equal(sql.one<{ disabled_at: string | null }>("SELECT disabled_at FROM pack WHERE id = 'chaser'")?.disabled_at, null);
  assert.equal(run(sql)?.state, 'waiting');

  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(run(sql)?.state, 'done', run(sql)?.say ?? '');
  assert.equal(k.get(made.id)?.fields.note, 'chased');
  assert.deepEqual(notes(sql), ['Chased Rent']);
  sql.close();
});
