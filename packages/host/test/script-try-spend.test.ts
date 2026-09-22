/**
 * What trials started together spend against the plan (`src/script-try.ts`, audit thirty-seven finding 2).
 *
 * A TRIAL ASKED THE ALLOWANCE WITH NO COUNT OF THE TRIALS ALREADY RUNNING. `scriptTrial` asked `mayRun(record, script)`
 * with no `pending` and metered after the sandbox answered, so every trial still in its sandbox was invisible to the
 * next one's question. Measured by the audit over a real `createDirectory`, a hosted record with one run left: five
 * trials at once all ran and the month closed at 15,004 runs of 15,000; the same five one after another ran one and
 * held four. A scheduled pass never had this hole, because `pass()` carries what it has let through.
 *
 * THE LEDGER IS THE REAL DIRECTORY, over `node:sqlite`, and only the sandbox is a double: it takes 30 ms and makes ten
 * requests, so every trial asks before the first one is metered, which is the interleaving a Durable Object awaiting
 * the Directory over RPC gives. EACH TRIAL IS BUILT WITH ITS OWN `scriptTrial(...)`, as both hosts build one per
 * request (`apps/selfhost/src/server.ts`'s `tryScript` and the Worker's `Record$`), so a count held inside one
 * `scriptTrial` closure would start at zero for each of the five and leave the first case as red as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ScriptAnswer } from '@braindog/kernel';
import { ALLOWANCE, createDirectory, type Named } from '@braindog/record/directory';

import { scriptTrial, type ScriptDraft, type TrialSandbox } from '../src/script-try.ts';
import { holding, inFlight, pass, type Execute, type Ledger } from '../src/actions.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const SEPT = Date.UTC(2026, 8, 22, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A hosted record in a real Directory with exactly one run of the month left. */
function oneRunLeft() {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(SEPT));
  value(d.person$('ada@example.com', 'Ada'));
  const { record } = value<Named>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));
  const runs = (ALLOWANCE.hosted?.runs ?? 0) - 1;
  value(d.meter(record, { event: 'ev_month', at: new Date(SEPT - 3_600_000).toISOString(), ingest: 'ping', scope: 'global', usage: { runs, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 } }));
  /* ASYNC, AS THE WORKER'S RPC TO THE DIRECTORY IS, so a trial awaiting its answer lets the next one in. */
  const ledger: Pick<Ledger, 'mayRun' | 'meter'> = { mayRun: async (r, a, p) => d.mayRun(r, a, p), meter: async (r, run) => d.meter(r, run) };
  const month = () => value<{ records: { month: { used: { runs: number; requests: number } } }[] }>(d.usage(value<{ id: string }>(d.person$('ada@example.com', 'Ada')).id, { from: '2026-09-01', to: '2026-09-30' })).records[0]!.month.used;
  return { record, ledger, month, close: () => sql.close() };
}

/** A sandbox that takes 30 ms and makes ten requests, and counts how often it was started. */
function slowSandbox(): { sandbox: TrialSandbox; started: () => number } {
  let started = 0;
  return {
    started: () => started,
    sandbox: async (): Promise<ScriptAnswer> => {
      started++;
      await new Promise((r) => setTimeout(r, 30));
      return { writes: [], log: '', usage: { fetches: 10, bytes: 100, wall_ms: 30, cpu_ms: 1 } };
    },
  };
}

const draft = (record: string): ScriptDraft => ({
  record: { id: record, tz: 'UTC' },
  body: { script: 'fx-rate', egress: ['https://rates.test'], keys: [], reads: [], writes: [], source: 'export default async function run() {}' },
  grantOf: null,
});

const outcome = (a: ScriptAnswer): string => ('held' in a ? 'held' : 'refused' in a ? 'refused' : 'ran');

test('FIVE TRIALS STARTED TOGETHER WITH ONE RUN LEFT: one runs, four are held, and the month closes at the plan', async () => {
  const { record, ledger, month, close } = oneRunLeft();
  const box = slowSandbox();
  const answers = await Promise.all(Array.from({ length: 5 }, () => scriptTrial({ sandbox: box.sandbox, ledger, now: () => SEPT })(draft(record))));
  const used = month();
  close();
  assert.deepEqual(answers.map(outcome).sort(), ['held', 'held', 'held', 'held', 'ran'], `the answers were ${JSON.stringify(answers.map(outcome))}`);
  assert.equal(box.started(), 1, 'a held trial started the sandbox');
  assert.equal(used.runs, ALLOWANCE.hosted?.runs, `the month closed at ${used.runs} runs`);
  assert.equal(used.requests, 10);
});

test('A TRIAL GIVES ITS PLACE BACK once it is metered or held, so the next trial is not held by one that has finished', async () => {
  /* WITHOUT THE RELEASE a reservation would outlive its trial, and a record that had tried five drafts at once would
     be held for the rest of the process's life with room left. One run left here: a trial the sandbox held, one whose
     loader threw, and then one that must still find the room neither of them used. */
  const { record, ledger, close } = oneRunLeft();
  const box = slowSandbox();
  const flight = inFlight();
  const held = await scriptTrial({ sandbox: async () => ({ held: { until: 0, say: 'held by the sandbox' } }), ledger, inFlight: flight })(draft(record));
  assert.equal(outcome(held), 'held');
  await assert.rejects(scriptTrial({ sandbox: async () => Promise.reject(new Error('the loader did not start')), ledger, inFlight: flight })(draft(record)));
  const after = await scriptTrial({ sandbox: box.sandbox, ledger, inFlight: flight })(draft(record));
  close();
  assert.equal(outcome(after), 'ran', 'a trial held or thrown kept its place, and the one after it was held with a run left');
  assert.equal(flight.count(record), 0, 'a finished trial is still counted as in flight');
});

test('A TRIAL AND A PASS ON ONE COUNT CANNOT EACH SPEND THE LAST RUN, and the pass gives its runs back once it settles', async () => {
  const { record, ledger, close } = oneRunLeft();
  const flight = inFlight();
  const admissions = pass(flight);
  let sent = 0;
  const execute: Execute = holding(async () => (sent++, { status: 200, body: 'ok', bytes: 2, ms: 1, requests: 1 }), record, ledger.mayRun, admissions);
  const box = slowSandbox();

  await execute({ ingest: 'ping' } as Parameters<Execute>[0]);
  assert.equal(sent, 1, 'the pass did not spend the last run');
  /* THE PASS HAS NOT BEEN METERED YET, which is the window: the Directory still says one run left. */
  const tried = await scriptTrial({ sandbox: box.sandbox, ledger, inFlight: flight })(draft(record));
  assert.equal(outcome(tried), 'held', 'a trial spent the run a pass had already let through');

  admissions.settle();
  assert.equal(flight.count(record), 0, 'a settled pass still counts its runs as in flight');
  close();
});

test('A PASS ASKED WHILE A TRIAL IS STILL IN ITS SANDBOX IS HELD, the other way round from the case above', async () => {
  /* THE CASE ABOVE ONLY PROVES THE TRIAL SEES THE PASS. A pass that asked with its own count and ignored the shared one
     passed it, and let a run through here with the trial's run not yet metered. */
  const { record, ledger, close } = oneRunLeft();
  const flight = inFlight();
  const box = slowSandbox();
  const trial = scriptTrial({ sandbox: box.sandbox, ledger, inFlight: flight })(draft(record));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(box.started(), 1, 'the trial was not in its sandbox yet');

  const admissions = pass(flight);
  let sent = 0;
  const execute: Execute = holding(async () => (sent++, { status: 200, body: 'ok', bytes: 2, ms: 1, requests: 1 }), record, ledger.mayRun, admissions);
  await execute({ ingest: 'ping' } as Parameters<Execute>[0]);
  admissions.settle();
  assert.equal(outcome(await trial), 'ran');
  close();
  assert.equal(sent, 0, 'a pass spent the run a trial still in its sandbox had been let through on');
});

test('A PASS WHOSE LEDGER THROWS GIVES ITS PLACE BACK, or the record is short a run for the life of the runtime', async () => {
  /* THE DIRECTORY IS AN RPC AWAY ON THE WORKER, and an RPC can fail. A place taken before the question and neither
     released nor handed to `settle` when the question threw stayed in the shared count after the pass had gone. */
  const flight = inFlight();
  const admissions = pass(flight);
  const failing: Ledger['mayRun'] = async () => Promise.reject(new Error('the Directory did not answer'));
  const execute: Execute = holding(async () => ({ status: 200, body: 'ok', bytes: 2, ms: 1, requests: 1 }), 'rec_1', failing, admissions);
  await assert.rejects(execute({ ingest: 'ping' } as Parameters<Execute>[0]));
  admissions.settle();
  assert.equal(flight.count('rec_1'), 0, 'a question that threw left its place in the count');
});
