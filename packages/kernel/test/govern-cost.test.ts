/**
 * `listGovernance` says what an open question costs to get wrong, on the row itself (weigh-honest-60#5).
 *
 * THE BROWSER WEIGHED A RAW ROW BY ITS BODY ALONE. It cannot see which fields a list's history withholds, so a patch of
 * a hidden field read as `rows` in the queue while the card and the counts, which ask the record, said hard to undo.
 * The record says the band here, by the rule the queue's own card reads it by, and the browser only repeats it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { costOf, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);

type Row = Record<string, unknown>;

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'pin', type: 'secret' },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; bill: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BILLS])).ok);
  const bill = value<{ id: string }>(k.create('bills', { what: 'Rent', note: 'due monthly', amount: { amount: 120000, currency: 'GBP' } }, { actor: 'p_1' })).id;
  return { k, sql, bill };
}

const rowset = (question: string, rows: Row[]) => ({ question, body_kind: 'rowset' as const, body: { register: 'bills', rows } });

const options = {
  question: 'Which name should the list take?',
  body_kind: 'options' as const,
  body: {
    options: [
      { id: 'accept', label: 'Take it', because: 'it is what we call it' },
      { id: 'no', label: 'Leave it', because: 'nobody asked' },
    ],
  },
};

/** The open questions as `listGovernance` answers them, by id. */
const open = (k: Kernel): Map<string, Row> => new Map(value<Row[]>(k.governance('suggestion')).map((r) => [String(r.id), r]));

test('A PATCH OF A WITHHELD FIELD COMES BACK HARD TO UNDO, which its body alone cannot say', async () => {
  const { k, sql, bill } = await record();
  const hidden = value<{ id: string }>(k.propose(rowset('Set the pin?', [{ at: bill, version: 1, patch: { pin: '4471' } }]), 'p_1')).id;

  const row = open(k).get(hidden);
  assert.ok(row, 'the question is not in the queue');
  /* THE BODY ALONE READS AS A ROW CHANGE, which is the band the browser gave it before the record said otherwise. */
  assert.equal(costOf('rowset', row.body), 'rows');
  assert.equal(row.cost, 'undo');
  sql.close();
});

test('A QUESTION THAT CHANGES MONEY ON A ROW COMES BACK HARD TO UNDO, set or cleared, and one that adds a bill does not', async () => {
  const { k, sql, bill } = await record();
  const filed = value<{ id: string }>(k.propose(rowset('File the gas bill?', [{ what: 'Gas', amount: { amount: 4200, currency: 'GBP' } }]), 'p_1')).id;
  const set = value<{ id: string }>(k.propose(rowset('Raise the rent?', [{ at: bill, version: 1, patch: { amount: { amount: 130000, currency: 'GBP' } } }]), 'p_1')).id;
  const cleared = value<{ id: string }>(k.propose(rowset('Clear the amount?', [{ at: bill, version: 1, patch: { amount: null } }]), 'p_1')).id;

  const rows = open(k);
  /* A NEW BILL RECORDS ITS AMOUNT AND MOVES NONE (20 Oct), and is deleted like any new row. */
  assert.equal(rows.get(filed)?.cost, 'rows');
  assert.equal(rows.get(set)?.cost, 'undo');
  assert.equal(rows.get(cleared)?.cost, 'undo');
  sql.close();
});

test('A WORDING CHANGE AND A PLAIN CHOICE COME BACK WITH THE BAND weigh.ts GIVES', async () => {
  const { k, sql, bill } = await record();
  const worded = value<{ id: string }>(k.propose(rowset('Reword the note?', [{ at: bill, version: 1, patch: { note: 'due on the first' } }]), 'p_1')).id;
  const chosen = value<{ id: string }>(k.propose(options, 'p_1')).id;

  const rows = open(k);
  assert.equal(rows.get(worded)?.cost, costOf('rowset', rows.get(worded)?.body));
  assert.equal(rows.get(worded)?.cost, 'rows');
  assert.equal(rows.get(chosen)?.cost, 'call');
  sql.close();
});

test('A DECISION AND A PREDICTION CARRY NO COST, since nothing is left to weigh', async () => {
  const { k, sql } = await record();
  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'Should Bills be called Bills due?',
        body_kind: 'change' as const,
        body: {
          declaration_id: 'register.bills',
          from: { name: 'Bills' },
          to: { ...BILLS, body: { ...(BILLS.body as object), name: 'Bills due' } },
          prediction: {
            claim: 'no bill is called Rent',
            measure: { source: 'register.bills', where: { field: 'what', is: 'Rent' }, value: { count: 'id' } },
            target: { lte: 0 },
            window: '30d',
            unit: 'count',
          },
        },
      },
      'p_1',
    ),
  ).id;
  /* OPEN, IT IS WEIGHED like any other question: a change that replaces what is there is the shape, since Put back
     restores the declaration it replaced (batch 62). */
  const asked = open(k).get(made);
  assert.equal(asked?.cost, costOf('change', asked?.body));
  assert.equal(asked?.cost, 'shape');
  value(k.decide(made, { decide: { option: 'accept', reason: 'it is what we call it' } }, 'p_2'));

  const decisions = value<Row[]>(k.governance('decision'));
  const predictions = value<Row[]>(k.governance('prediction'));
  assert.ok(decisions.length > 0 && predictions.length > 0, 'accepting the change wrote no decision or no prediction');
  for (const r of [...decisions, ...predictions]) assert.equal('cost' in r, false, JSON.stringify(Object.keys(r)));
  sql.close();
});
