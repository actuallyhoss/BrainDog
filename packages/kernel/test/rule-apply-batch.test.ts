/**
 * One press is one Undo (SHL-D07 job 3, kernel half): `applyRule` takes a `batch` and writes every row under it, and its
 * answer, like the dry run's, says how many it filled and how many it left, and the two add up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type DryRun, type Entry, type Kernel, type RuleDecl } from '../src/index.ts';
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
    ],
  } as never,
};

const GROCER = { rule: 'grocer', register: 'ledger', when: 'payee is Spinneys', then: [{ set: { field: 'category', to: 'Groceries' } }] };


type Applied = { matched: number; applied: number; kept: number; remaining: number; filled: number; left: number };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** Ten rows the rule matches and three already categorised by hand, written before the rule, so it has seen none. */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([LEDGER])).ok);
  k.transaction(() => {
    for (let i = 0; i < 10; i++) k.create('ledger', { payee: 'Spinneys' }, { actor: 'p_1' });
    for (let i = 0; i < 3; i++) k.create('ledger', { payee: 'Spinneys', category: 'Treats' }, { actor: 'p_1' });
    k.create('ledger', { payee: 'Uber' }, { actor: 'p_1' });
  });
  assert.ok((await k.install([{ id: 'rule.grocer', kind: 'rule', body: GROCER as never }])).ok);
  return { k, sql };
}

const filledRows = (k: Kernel): number => {
  let n = 0;
  for (let seq = 1; seq <= 14; seq++) if ((k.get(`ledger#${seq}`) as Entry | null)?.fields.category === 'Groceries') n++;
  return n;
};

test('TEN ROWS FILLED BY ONE APPLY COME BACK IN ONE UNDO', async () => {
  const { k, sql } = await record();
  assert.equal(filledRows(k), 0, 'the rule ran over rows written before it');

  const batch = 'press-1';
  const done = value<Applied>(k.applyRule('grocer', { batch }));
  assert.equal(done.filled, 10);
  assert.equal(filledRows(k), 10);

  const plan = value<{ hash: string; steps: unknown[] }>(k.undoPlan({ batch }));
  assert.equal(plan.steps.length, 10, 'the press was not one batch');
  assert.ok(k.undoApply({ batch }, plan.hash, 'p_1').ok);
  assert.equal(filledRows(k), 0, 'one undo left rows the press filled');
  sql.close();
});

test('WITHOUT A BATCH EACH ROW IS ITS OWN, as an install has always written them', async () => {
  const { k, sql } = await record();
  value<Applied>(k.applyRule('grocer'));
  const batches = sql.all<{ batch: string }>("SELECT DISTINCT batch FROM event WHERE actor = 'rule:grocer'");
  assert.equal(batches.length, 10);
  sql.close();
});

test('FILLED AND LEFT ADD UP, in the dry run, the apply and the preview', async () => {
  const { k, sql } = await record();

  const dry = value<Applied>(k.applyRule('grocer', { dry: true, limit: 4 }));
  assert.equal(dry.filled, 4, 'the dry run promised rows past its page');
  assert.equal(dry.left, 9, 'three set by hand and six past the page');
  assert.equal(dry.filled + dry.left, dry.matched + dry.kept);
  assert.equal(filledRows(k), 0, 'a dry run wrote');

  const done = value<Applied>(k.applyRule('grocer', { limit: 4 }));
  assert.equal(done.filled, 4);
  assert.equal(done.filled + done.left, 13);

  const preview = value<DryRun>(k.dryRun(GROCER as RuleDecl));
  assert.equal(preview.matches, 13);
  assert.equal(preview.filled, 6, 'the preview counted rows already filled as rows it would fill');
  assert.equal(preview.left, 7);
  assert.equal(preview.filled + preview.left, preview.matches);
  sql.close();
});
