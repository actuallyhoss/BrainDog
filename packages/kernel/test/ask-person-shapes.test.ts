/**
 * A question an automation puts to a person, asking for a choice, an amount, a number, a text or a date (SHL-D06).
 *
 * THE RUNNER IS DRIVEN STRAIGHT, over a fresh record's tables, with its own `ask` beside it. The kernel's own `ask`
 * files every question as a choice of options, and the gate refuses one with fewer than two, so a shaped question
 * reaches the queue only once `index.ts` files it with its shape; until then this is where the shape is held. What is
 * read here is the runner's half: what the question was filed with, what an answer of each shape is kept as, and that
 * an answer of the wrong shape is refused to the person while the run keeps waiting.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok, type Result } from '@braindog/ports';

import { advance, answerStep, openRun, type AskAbout, type AskAnswer, type FlowDeps } from '../src/flow.ts';
import { openRecord, type Entry } from '../src/index.ts';
import type { FlowDecl, Step } from '../src/rules.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

type Filed = { question: string; options: readonly string[]; about: AskAbout };

/** A deposit row on an invented list, in the currency its own field says. */
const ROW: Entry = {
  id: 'row_1', register: 'lettings', seq: 4, state: null, version: 1, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null,
  fields: { what: 'Flat at Orrin Lane', tenant: 'Wren Halloway', currency: 'EGP', note: '' },
};

async function runner(steps: Step[]): Promise<{ sql: NodeSql; deps: FlowDeps; filed: Filed[]; run: string }> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const filed: Filed[] = [];
  let n = 0;
  const body = { rule: 'deposit', on: { manual: true }, steps } as unknown as FlowDecl;
  const deps: FlowDeps = {
    sql,
    mint: () => `m${String(++n).padStart(4, '0')}`,
    nowMs: NOW,
    rules: () => {
      throw new Error('no step here goes through the rule pass');
    },
    entry: (id) => (id === ROW.id ? ROW : null),
    schemaOf: () => null,
    note: () => {},
    projectOf: () => null,
    tz: 'UTC',
    ask: (question, options, _actor, about): Result<{ id: string }> => {
      filed.push({ question, options, about });
      return ok({ id: `s${filed.length}` });
    },
    withdraw: () => {},
    answersSlash: false,
    trial: body,
  };
  const run = openRun(deps, { id: 'deposit', version: 1, body }, { kind: 'written', entry: ROW.id, register: 'lettings' }, { actor: 'p_1' });
  advance(deps, run);
  return { sql, deps, filed, run };
}

const runOf = (sql: NodeSql, id: string) => sql.one<{ state: string; step: number; vars: string; say: string | null }>('SELECT state, step, vars, say FROM automation_run WHERE id = ?', id)!;
const varsOf = (sql: NodeSql, id: string): Record<string, unknown> => JSON.parse(runOf(sql, id).vars) as Record<string, unknown>;

/** Answer the one waiting question, and take the steps after it when it was taken. */
function answer(r: Awaited<ReturnType<typeof runner>>, said: AskAnswer): Result<null> {
  const got = answerStep(r.deps, { run: r.run, step: 0, by: `s${r.filed.length}`, answer: said });
  if (got.ok && runOf(r.sql, r.run).state === 'pending') advance(r.deps, r.run);
  return got;
}

const AMOUNT: Step[] = [
  { ask_person: { question: 'How much was the deposit for {{trigger.row.what}}?', shape: 'amount', currency: '{{trigger.row.currency}}', as: 'deposit' } },
  { set_var: { name: 'said', to: 'Deposit {{money:vars.deposit}}, {{vars.deposit.amount}} in minor units' } },
];

test('AN AMOUNT IS FILED WITH ITS SHAPE AND THE ROW\'S CURRENCY, and kept in minor units with its code', async () => {
  const r = await runner(AMOUNT);
  assert.equal(runOf(r.sql, r.run).state, 'waiting', runOf(r.sql, r.run).say ?? '');
  assert.equal(r.filed.length, 1);
  assert.equal(r.filed[0]!.question, 'How much was the deposit for Flat at Orrin Lane?');
  assert.deepEqual(r.filed[0]!.options, [], 'an amount offers no options to pick');
  assert.deepEqual({ shape: r.filed[0]!.about.shape, currency: r.filed[0]!.about.currency }, { shape: 'amount', currency: 'EGP' });

  assert.ok(answer(r, '1,200.50').ok);
  const vars = varsOf(r.sql, r.run);
  assert.deepEqual(vars.deposit, { amount: 120050, currency: 'EGP' });
  assert.equal(vars.said, 'Deposit EGP 1,200.50, 120050 in minor units');
  assert.equal(runOf(r.sql, r.run).state, 'done');
  assert.equal(Object.keys(vars).some((k) => k.startsWith('-asked')), false, 'what the question was asked in outlived its answer');
  r.sql.close();
});

test('AN AMOUNT OF THE WRONG SHAPE IS REFUSED TO THE PERSON, and the run keeps waiting for a right one', async () => {
  const r = await runner(AMOUNT);
  for (const [said, words] of [
    ['about twelve', /not an amount/],
    ['1,200 dollars', /not an amount/],
    ['12.505', /2 decimal places/],
    ['USD 12.50', /in EGP/],
    ['-5', /under nought/],
    [{ amount: 12.5 }, /smallest unit/],
    [{ amount: 1250, currency: 'GBP' }, /in GBP/],
  ] as [AskAnswer, RegExp][]) {
    const got = answer(r, said);
    assert.equal(got.ok, false, `${JSON.stringify(said)} was taken`);
    if (!got.ok && 'refusal' in got) {
      assert.equal(got.refusal.code, 'VALUE_MALFORMED');
      assert.equal(got.refusal.at, 'answer');
      assert.match(got.refusal.fix, words);
    }
    assert.equal(runOf(r.sql, r.run).state, 'waiting', `${JSON.stringify(said)} moved the run`);
  }
  assert.ok(answer(r, { amount: 125000 }).ok, 'minor units a screen read already');
  assert.deepEqual(varsOf(r.sql, r.run).deposit, { amount: 125000, currency: 'EGP' });
  r.sql.close();
});

test('AN AMOUNT WITH NO CURRENCY ON THE STEP TAKES THE CODE THE ANSWER SAYS, in its own decimals', async () => {
  const r = await runner([{ ask_person: { question: 'How much?', shape: 'amount', as: 'paid' } }]);
  assert.equal(r.filed[0]!.about.currency, undefined);
  const bare = answer(r, '1250');
  assert.equal(bare.ok, false, 'an amount with no currency anywhere was kept');
  assert.ok(answer(r, 'jpy 1,250').ok);
  assert.deepEqual(varsOf(r.sql, r.run).paid, { amount: 1250, currency: 'JPY' });
  r.sql.close();
});

test('A CURRENCY THE ROW DOES NOT HOLD STOPS THE RUN BEFORE ANYTHING IS ASKED', async () => {
  const r = await runner([{ ask_person: { question: 'How much?', shape: 'amount', currency: '{{trigger.row.note}}', as: 'paid' } }]);
  assert.equal(r.filed.length, 0);
  assert.equal(runOf(r.sql, r.run).state, 'failed');
  assert.match(runOf(r.sql, r.run).say ?? '', /reads no currency's code/);
  r.sql.close();
});

test('A NUMBER, A DATE AND A TEXT ARE EACH HELD TO THEIR SHAPE', async () => {
  const cases: [Step, AskAnswer[], AskAnswer, unknown][] = [
    [{ ask_person: { question: 'How many keys?', shape: 'number', as: 'keys' } }, ['three', '1,2', ''], '1,250.5', 1250.5],
    [{ ask_person: { question: 'Moving in on?', shape: 'date', as: 'on' } }, ['2026-02-30', '15/10/2026', 'soon'], '2026-11-01', '2026-11-01'],
    [{ ask_person: { question: 'Anything to add?', shape: 'text', as: 'said' } }, ['   ', 'x'.repeat(501), 7], '  Keys with the porter  ', 'Keys with the porter'],
  ];
  for (const [step, wrong, right, kept] of cases) {
    const r = await runner([step]);
    const as = (Object.values(step)[0] as { as: string; shape: string }).as;
    assert.equal(r.filed[0]!.about.shape, (Object.values(step)[0] as { shape: string }).shape, 'the filed question lost its shape');
    for (const said of wrong) {
      const got = answer(r, said);
      assert.equal(got.ok, false, `${JSON.stringify(said)} was taken as ${as}`);
      assert.equal(runOf(r.sql, r.run).state, 'waiting');
    }
    assert.ok(answer(r, right).ok);
    assert.deepEqual(varsOf(r.sql, r.run)[as], kept);
    r.sql.close();
  }
});

test('A CHOICE STILL NEEDS TWO ANSWERS, is filed as one, and takes only one of them', async () => {
  const one = await runner([{ ask_person: { question: 'Pay it?', options: ['yes'], as: 'pay' } }]);
  assert.equal(one.filed.length, 0);
  assert.match(runOf(one.sql, one.run).say ?? '', /at least two/);
  one.sql.close();
  const odd = await runner([{ ask_person: { question: 'Pay it?', shape: 'sometimes' as never, options: ['yes', 'no'], as: 'pay' } }]);
  assert.equal(odd.filed.length, 0);
  assert.match(runOf(odd.sql, odd.run).say ?? '', /a choice, an amount, a number, a text or a date/);
  odd.sql.close();

  const r = await runner([{ ask_person: { question: 'Pay it?', options: ['yes', 'no'], as: 'pay' } }]);
  assert.deepEqual(r.filed[0]!.options, ['yes', 'no']);
  assert.equal(r.filed[0]!.about.shape, 'choice');
  assert.equal(answer(r, 'maybe').ok, false);
  assert.equal(runOf(r.sql, r.run).state, 'waiting');
  assert.ok(answer(r, 'no').ok);
  assert.equal(varsOf(r.sql, r.run).pay, 'no');
  r.sql.close();
});

test('AN OPTION TYPED WITH A SPACE AFTER IT IS STILL TAKEN, as a pick always was', async () => {
  const r = await runner([{ ask_person: { question: 'Pay it?', options: ['yes ', 'no'], as: 'pay' } }]);
  assert.ok(answer(r, 'yes ').ok);
  assert.equal(varsOf(r.sql, r.run).pay, 'yes');
  r.sql.close();
});
