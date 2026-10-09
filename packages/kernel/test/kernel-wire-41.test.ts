/**
 * Batch 41's kernel wiring, through `openRecord` as a host reaches it: a handoff closes by the hourly sweep and is taken
 * once through the api (AGT-C05), a ledger amount sent with no code takes its account's and keeps it (REC-B04), a money
 * reading reaches a `stat` with its amount (REC-C03), and the record's copies answer as three facts (LCH-C03).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXPIRED_NOTE, openRecord, type Declaration, type MeasureSeries, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const DAY = 86_400_000;
const OWNER: WriteContext = { actor: 'p_1' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const as = (client_id: string, more: SessionHints = {}): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', repo: 'braindog', ...more },
});
const ok = (r: { ok: boolean }): void => assert.ok(r.ok, JSON.stringify(r));
const codeOf = (r: unknown): string | undefined => (r as { refusal?: { code?: string } }).refusal?.code;
const fixOf = (r: unknown): string | undefined => (r as { refusal?: { fix?: string } }).refusal?.fix;
const lastLine = (sql: NodeSql, id: string): { note: string | null; actor: string } => ({
  ...sql.one<{ note: string | null; actor: string }>("SELECT note, actor FROM event WHERE target = ? AND kind = 'state' ORDER BY ts DESC, id DESC LIMIT 1", `entry:${id}`)!,
});

async function agents() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  ok(await k.install([TASKS]));
  /** A session that works here, leaves `next` and closes, so its run waits as a handoff. */
  const leave = (client: string, next: string) => {
    ok(k.create('tasks', { what: `Work of ${client}` }, as(client)));
    const run = k.findRun({ client_id: client }, 't_1')!;
    const spoken = `S${String(run.seq)}`;
    ok(k.update('session', spoken, { next }, as(client)));
    ok(k.endRun(as(client), {}));
    return { id: run.id, spoken };
  };
  return { sql, clock, k, leave };
}

test('A STEP NOBODY TOOK IN THIRTY DAYS closes through the hourly sweep, its words kept', async () => {
  const { sql, clock, k, leave } = await agents();
  const s1 = leave('claude', 'Run the gates');
  assert.equal(k.get(s1.spoken)?.state, 'handoff');
  const open = k.openHandoffs({ repo: 'braindog' }, null);
  ok(open);
  assert.deepEqual(open.ok && open.value.handoffs.map((h) => [h.spoken, h.mark]), [[s1.spoken, 'next']]);
  /* The page layer reads the same steps, so Agents' `handoffs.open` block draws it. */
  const steps = (): unknown[] => (k.block({ kind: 'list', source: 'handoffs.open' } as never) as { rows: { fields: Record<string, unknown> }[] }).rows.map((r) => [r.fields.run, r.fields.next]);
  assert.deepEqual(steps(), [[s1.spoken, 'Run the gates']]);

  clock.advance(29 * DAY);
  k.purge();
  assert.equal(k.get(s1.spoken)?.state, 'handoff', 'twenty-nine days is still open');

  clock.advance(DAY + 60_000);
  k.purge();
  const run = k.get(s1.spoken)!;
  assert.equal(run.state, 'done');
  assert.equal(run.fields.closed_as, 'expired');
  assert.equal(run.fields.next, 'Run the gates', 'the step stays on the row');
  assert.deepEqual(lastLine(sql, s1.id), { note: EXPIRED_NOTE, actor: 'system' });
  const after = k.openHandoffs({ repo: 'braindog' }, null);
  assert.deepEqual(after.ok && after.value.handoffs, []);
  assert.deepEqual(steps(), [], 'and Agents shows no step older than thirty days');
  sql.close();
});

test('TAKE TWICE GIVES ONE TAKER, and a refused take leaves no run behind', async () => {
  const { sql, k, leave } = await agents();
  const s1 = leave('claude', 'Ship the briefing');

  const first = k.takeHandoff(as('codex', { agent: 'codex' }), s1.spoken);
  ok(first);
  assert.deepEqual(first.ok && first.value, { left: s1.spoken, next: 'Ship the briefing', agent: 'claude' });
  const taker = k.findRun({ client_id: 'codex' }, 't_1')!;
  const takerSaid = `S${String(taker.seq)}`;
  assert.equal(k.get(s1.spoken)?.fields.taken_by, takerSaid);
  assert.equal(k.get(takerSaid)?.fields.took, s1.spoken);

  const second = k.takeHandoff(as('cursor', { agent: 'cursor' }), s1.spoken);
  assert.equal(codeOf(second), 'TRANSITION_ILLEGAL');
  assert.equal(fixOf(second), `${takerSaid} already took this just now.`);
  assert.equal(k.get(s1.spoken)?.fields.taken_by, takerSaid, 'the second take changed nothing');
  assert.equal(k.findRun({ client_id: 'cursor' }, 't_1'), null, 'the run opened to sign a refused take is undone');

  /* A person is never a run, so a person takes nothing; a person drops a step with a reason, signed as themselves. */
  const s2 = leave('gemini', 'Wire the old export');
  assert.equal(codeOf(k.takeHandoff(OWNER, s2.spoken)), 'FORBIDDEN');
  assert.equal(codeOf(k.dropHandoff(OWNER, s2.spoken, '  ')), 'REQUIRED_MISSING');
  ok(k.dropHandoff(OWNER, s2.spoken, 'The old export is gone.'));
  assert.equal(k.get(s2.spoken)?.fields.closed_as, 'dropped');
  assert.deepEqual(lastLine(sql, s2.id), { note: 'The old export is gone.', actor: 'p_1' });
  sql.close();
});

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }] },
};
const LEDGER: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'account', type: 'ref', to: 'accounts' },
      { id: 'amount', type: 'money', currency_from: 'account.balance', currency_fixed: true },
    ],
  } as never,
};

test('A LEDGER ROW WITH NO CURRENCY TAKES ITS ACCOUNT’S, and keeps it', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  ok(await k.install([ACCOUNTS, LEDGER]));
  const bank = k.create('accounts', { name: 'Cairo bank', balance: { amount: 0, currency: 'EGP' } }, OWNER);
  ok(bank);
  const id = bank.ok ? bank.value.id : '';

  const row = k.create('transactions', { what: 'Rent', account: id, amount: { amount: 97999 } }, OWNER);
  ok(row);
  assert.deepEqual(row.ok && row.value.fields.amount, { amount: 97999, currency: 'EGP' });
  const ref = row.ok ? row.value.id : '';
  /* The number is corrected, the code stays: a later bare amount takes the account's again, another code is refused. */
  const fixed = k.update('transactions', ref, { amount: { amount: 98000 } }, OWNER);
  assert.deepEqual(fixed.ok && fixed.value.fields.amount, { amount: 98000, currency: 'EGP' });
  const moved = k.update('transactions', ref, { amount: { amount: 98000, currency: 'USD' } }, OWNER);
  assert.equal(codeOf(moved), 'CURRENCY_FIXED');
  /* A dollar row on the pound account keeps its dollars when only its number is corrected. */
  const dollars = k.create('transactions', { what: 'Hosting', account: id, amount: { amount: 2000, currency: 'USD' } }, OWNER);
  ok(dollars);
  const corrected = k.update('transactions', dollars.ok ? dollars.value.id : '', { amount: { amount: 2100 } }, OWNER);
  assert.deepEqual(corrected.ok && corrected.value.fields.amount, { amount: 2100, currency: 'USD' });
  /* With no account named there is nothing to give, and the bare amount is refused rather than guessed. */
  assert.equal(fixOf(k.create('transactions', { what: 'Cash', amount: { amount: 500 } }, OWNER)), 'This amount has no currency, and its account has none to give.');
  sql.close();
});

const NUMBERS: Declaration = {
  id: 'register.numbers',
  kind: 'register',
  body: {
    id: 'numbers',
    name: 'Numbers',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal' },
      { id: 'unit', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'at', type: 'instant' },
    ],
  },
};

test('A MONEY READING ARRIVES WITH ITS AMOUNT, so USD 48.15 is never drawn as 4815', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  ok(await k.install([NUMBERS]));
  ok(k.create('numbers', { name: 'Monthly revenue', amount: { amount: 4815, currency: 'USD' }, at: new Date(NOW - 3_600_000).toISOString() }, OWNER));
  const columns = [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }, { field: 'amount' }];
  const tiles = k.block({ kind: 'stat', source: 'register.numbers', columns, back: 7 } as never) as { measures?: MeasureSeries[]; refusals: unknown[] };
  assert.deepEqual(tiles.refusals, []);
  assert.deepEqual(
    tiles.measures?.map((m) => [m.name, m.unit, m.latest?.value]),
    [['Monthly revenue', 'USD', 48.15]],
  );
  sql.close();
});

test('THE RECORD’S COPIES ANSWER THROUGH THE API: none yet, then the night kept, then an export', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.deepEqual(k.copyFacts(), { last_copy_at: null, last_copy_bytes: null, last_export_at: null });

  k.copyKept('snap_1', 2_100_000);
  clock.advance(60_000);
  k.copyFailed('the bucket refused the write');
  const facts = k.copyFacts();
  assert.equal(facts.last_copy_at, new Date(NOW).toISOString(), 'a failed night is never a copy');
  assert.equal(facts.last_copy_bytes, 2_100_000);
  assert.equal(facts.last_export_at, null);
  const failed = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'export' ORDER BY ts DESC, id DESC LIMIT 1");
  assert.equal(failed?.note, 'failed: the bucket refused the write');
  sql.close();
});
