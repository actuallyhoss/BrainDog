/**
 * A rule's standing count (`rule_stat`, SHL-D07 job 1): "how many rows a rule has filed, and never for one that has not".
 *
 * Raised where an inline rule's patch lands and where `startRun` opens a run. A tried run goes through `openRun` alone and
 * counts nothing, and a rule that has matched nothing has no line, which the page reads as "never".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { openRun } from '../src/flow.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'payee',
    fields: [
      { id: 'payee', type: 'text', required: true },
      { id: 'category', type: 'text' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });


async function record(...rules: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([LEDGER, ...rules])).ok);
  return { k, sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const stat = (sql: NodeSql, name: string) =>
  sql.one<{ fired: number; last_at: string; last_row: string | null }>('SELECT fired, last_at, last_row FROM rule_stat WHERE rule = ?', name);

test('A RULE THAT FIRES TWICE COUNTS TWO, with the row it filed last', async () => {
  const { k, sql, clock } = await record(
    rule({ rule: 'grocer', register: 'ledger', when: 'payee is Spinneys', then: [{ set: { field: 'category', to: 'Groceries' } }] }),
  );
  value<Entry>(k.create('ledger', { payee: 'Spinneys' }, { actor: 'p_1' }));
  clock.advance(60_000);
  const second = value<Entry>(k.create('ledger', { payee: 'Spinneys' }, { actor: 'p_1' }));
  /* A row it does not match is not a firing. */
  value<Entry>(k.create('ledger', { payee: 'Uber' }, { actor: 'p_1' }));

  const got = stat(sql, 'grocer');
  assert.equal(got?.fired, 2);
  assert.equal(got?.last_row, second.id, 'the count named an earlier row as its last');
  assert.equal(got?.last_at, new Date(NOW + 60_000).toISOString(), 'the count kept the first firing as its last');
  sql.close();
});

test('AN IDLE RULE READS NOTHING, which the page reads as zero and the word "never"', async () => {
  const { k, sql } = await record(
    rule({ rule: 'idle', register: 'ledger', when: 'payee is Nobody', then: [{ set: { field: 'category', to: 'None' } }] }),
  );
  value<Entry>(k.create('ledger', { payee: 'Spinneys' }, { actor: 'p_1' }));
  assert.equal(stat(sql, 'idle')?.fired ?? 0, 0, 'a rule that matched nothing was counted');
  sql.close();
});

test('A RULE THAT DID NOTHING HAS NOT FIRED: a set an earlier rule took is not counted', async () => {
  const { k, sql } = await record(
    rule({ rule: 'first', register: 'ledger', priority: 1, when: 'payee is Spinneys', then: [{ set: { field: 'category', to: 'Groceries' } }] }),
    rule({ rule: 'second', register: 'ledger', priority: 2, when: 'payee is Spinneys', then: [{ set: { field: 'category', to: 'Food' } }] }),
  );
  value<Entry>(k.create('ledger', { payee: 'Spinneys' }, { actor: 'p_1' }));
  assert.equal(stat(sql, 'first')?.fired, 1);
  assert.equal(stat(sql, 'second')?.fired ?? 0, 0, 'a rule whose field was taken was counted as filing the row');
  sql.close();
});

test('A RUN IS COUNTED ONCE WHEN IT STARTS, not again for each step it takes', async () => {
  const { k, sql } = await record(rule({ rule: 'hello', on: { manual: true }, steps: [{ notify: { say: 'hi' } }, { notify: { say: 'again' } }] }));
  value(k.automationRun('hello', 'p_1'));
  await k.drain();
  assert.equal(stat(sql, 'hello')?.fired, 1);
  sql.close();
});

test('A TRIED RUN COUNTS NOTHING, since a try is not a firing', async () => {
  const body = { rule: 'tried', register: 'ledger', on: { manual: true }, steps: [{ notify: { say: 'hi' } }] };
  const { k, sql } = await record();
  const tried = value<{ steps: { state: string }[] }>(k.tryAutomation(body as never, {}, 'p_1'));
  assert.ok(tried.steps.length > 0, 'the try took no step, so it proved nothing');
  assert.equal(stat(sql, 'tried')?.fired ?? 0, 0, 'a try was counted as a firing');
  sql.close();
});

/* THE TRY ABOVE ROLLS BACK WHOLE, so it would pass with the count in `openRun` too. This one opens a run the way a try
   does, outside any rehearsal, and fails by itself the day the count moves into `openRun`. */
test('OPENING A RUN IS NOT A FIRING: only `startRun` counts', async () => {
  const { sql } = await record();
  const id = openRun({ sql, mint: () => 'run-1', nowMs: NOW } as never, { id: 'tried', version: 0, body: { rule: 'tried', steps: [] } as never }, { kind: 'manual' }, { actor: 'p_1' });
  assert.ok(sql.one('SELECT 1 AS x FROM automation_run WHERE id = ?', id), 'no run was opened');
  assert.equal(stat(sql, 'tried')?.fired ?? 0, 0, 'opening a run was counted as a firing');
  sql.close();
});
