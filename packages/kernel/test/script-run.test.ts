/**
 * A script's run, applied: the record's half of `loop/research-shell-scripts.md` Brief 3.
 *
 * THE HOST RUNS THE SOURCE AND THE RECORD DECIDES WHAT IT WROTE. Everything a sandbox hands back is a request, checked
 * here against the declaration's own `writes:` and applied through the ordinary write path in one savepoint, so a run
 * that asked for one register too many writes nothing at all. The sandbox in this file is a stand-in function, which is
 * the point: nothing below depends on what ran the script, only on what came back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { ack, enqueue, lease, type AckDeps } from '../src/outbox.ts';
import { runActions, type RunnerSteps } from '../src/actions.ts';
import { finishScript, prepareScript, type ScriptAnswer, type ScriptRunDeps, type Scripted } from '../src/script-run.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOUR = 3_600_000;

const GOLD_EGP: Declaration = {
  id: 'register.gold_egp',
  kind: 'register',
  body: {
    id: 'gold_egp',
    name: 'Gold, EGP',
    title: 'at',
    fields: [
      { id: 'at', type: 'text', required: true },
      { id: 'value', type: 'int' },
    ],
  } as never,
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const GOLD: Declaration = {
  id: 'script.gold-rate',
  kind: 'script',
  body: {
    script: 'gold-rate',
    runs: { every: '1h' },
    egress: ['https://api.goldapi.io'],
    keys: [],
    reads: [],
    writes: ['gold_egp'],
    source: 'export default async function run(ctx) {}',
  } as never,
};

const USAGE = { fetches: 1, bytes: 120, wall_ms: 40, cpu_ms: 3 };

type Told = { actor: string; say: string; because?: string };

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: ScriptRunDeps; told: Told[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([GOLD_EGP, NOTES, GOLD]);
  assert.ok(out.ok, fixOf(out));
  let n = 0;
  const mint = () => `01KSCR1PTRUN00000000000${(++n).toString(36).toUpperCase().padStart(3, '0')}`;
  const told: Told[] = [];
  const ackDeps: AckDeps = { mint, allocate: () => 1, nowMs: NOW, recordId: ID };
  const deps: ScriptRunDeps = {
    sql,
    recordId: ID,
    nowMs: NOW,
    mint,
    tz: 'UTC',
    ack: (a) => ack(sql, ackDeps, a),
    notify: (said) => void told.push(said),
    transaction: k.transaction,
    write: (register, ref, patch, w) => k.write(register, ref, patch as never, w),
    registerOf: (spoken) => k.get(spoken)?.register ?? null,
  };
  return { k, sql, deps, told };
}

/** Queue one run the way `fireScript` does, and lease it the way the pass does. */
function leased(r: { sql: NodeSql; deps: ScriptRunDeps }, input: unknown = null) {
  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'gold-rate', version: 1, input });
  const [job] = lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], 1);
  assert.ok(job, 'a queued run is leased');
  return job;
}

function prepared(r: { sql: NodeSql; deps: ScriptRunDeps }, input: unknown = null): Scripted {
  const got = prepareScript(r.deps, leased(r, input));
  assert.ok('scripted' in got, `the run was prepared, not ${JSON.stringify(got)}`);
  return got;
}

const golds = (sql: NodeSql) => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'gold_egp'")?.n ?? 0;
const runs = (sql: NodeSql) =>
  sql
    .all<{ actor: string; to_v: string }>(
      "SELECT actor, to_v FROM event WHERE kind = 'pull' AND target = 'declaration:script.gold-rate' AND to_v IS NOT NULL ORDER BY rowid",
    )
    .map((e) => ({ actor: e.actor, ...(JSON.parse(e.to_v) as { channel: string; outcome: string; usage: { runs: number; requests: number; held: number } }) }));
const row = (sql: NodeSql) => sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'script' AND key = 'gold-rate'");
const job = (sql: NodeSql) => sql.one<{ state: string }>("SELECT state FROM outbox WHERE kind = 'script.run' ORDER BY created DESC, id DESC LIMIT 1");

test('A RUN IS PREPARED WITH THE VERSION IT FIRED UNDER, its declaration and its input, and names its actor', async () => {
  const r = await record();
  const s = prepared(r, { amount: 7 });
  assert.equal(s.scripted.script, 'gold-rate');
  assert.equal(s.scripted.version, 1);
  assert.equal(s.scripted.actor, 'script:gold-rate@v1');
  assert.deepEqual(s.scripted.input, { amount: 7 });
  assert.deepEqual(s.scripted.decl.writes, ['gold_egp']);
  assert.equal(s.scripted.decl.source, 'export default async function run(ctx) {}');
  assert.deepEqual(s.scripted.record, { id: ID, tz: 'UTC' });
});

test('A WRITE TO A REGISTER OUTSIDE `writes` WRITES NOTHING, not even the permitted ones beside it, and is metered refused', async () => {
  const r = await record();
  const answer: ScriptAnswer = {
    writes: [
      { op: 'create', register: 'gold_egp', fields: { at: '2026-09-22T12:00', value: 410000 } },
      { op: 'create', register: 'notes', fields: { what: 'the rate went up' } },
    ],
    log: '',
    usage: USAGE,
  };
  const metered = finishScript(r.deps, prepared(r), answer);
  assert.equal(metered.outcome, 'refused');
  assert.equal(metered.channel, 'script');
  assert.equal(golds(r.sql), 0, 'the permitted write beside it did not land either');
  assert.equal(r.sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'notes'")?.n, 0);
  const [run] = runs(r.sql);
  assert.equal(run?.outcome, 'refused');
  assert.equal(run?.usage.runs, 1, 'a refused run spent the sandbox and is counted');
  assert.equal(job(r.sql)?.state, 'done', 'and is never retried by the ladder');
});

test('THREE WRITES LAND THREE ROWS, each by script:gold-rate@v1 and all in one event batch, through the pass', async () => {
  const r = await record();
  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'gold-rate', version: 1, input: null });
  const asked: Scripted[] = [];
  const steps: RunnerSteps = {
    drain: () => ({ claimed: 0, done: 0, failed: 0, dead: 0 }),
    lease: (n) => lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], n),
    prepare: (j) => prepareScript(r.deps, j),
    finish: () => assert.fail('a script run is not an action request'),
    release: () => assert.fail('nothing pages here'),
    dropPaged: () => assert.fail('nothing pages here'),
    meterPaged: () => assert.fail('nothing pages here'),
    releaseJob: () => assert.fail('the budget is not in play'),
    finishScript: (s, a) => r.deps.transaction(() => finishScript(r.deps, s, a)),
  };
  const out = await runActions(
    steps,
    async () => assert.fail('a script run sends no action request'),
    5,
    undefined,
    undefined,
    async (s) => {
      asked.push(s);
      return {
        writes: [1, 2, 3].map((i) => ({ op: 'create' as const, register: 'gold_egp', fields: { at: `2026-09-22T1${i}:00`, value: 400000 + i } })),
        log: 'three prices',
        usage: USAGE,
      };
    },
  );

  assert.equal(asked.length, 1, 'the host runner was handed the run once');
  assert.deepEqual({ ran: out.ran, ok: out.ok, refused: out.refused }, { ran: 1, ok: 1, refused: 0 });
  assert.equal(golds(r.sql), 3);
  const creates = r.sql.all<{ actor: string; batch: string | null }>(
    "SELECT actor, batch FROM event WHERE kind = 'create' AND target IN (SELECT 'entry:' || id FROM entry WHERE register = 'gold_egp')",
  );
  assert.equal(creates.length, 3);
  assert.deepEqual([...new Set(creates.map((c) => c.actor))], ['script:gold-rate@v1']);
  const batches = new Set(creates.map((c) => c.batch));
  assert.equal(batches.size, 1, 'one batch');
  assert.notEqual([...batches][0], null);
  assert.equal(out.usage[0]?.outcome, 'ok');
  assert.equal(out.usage[0]?.usage.requests, 1, "the sandbox's fetches are the run's requests");
  assert.equal(job(r.sql)?.state, 'done');
});

test('A WRITE THE REGISTER ITSELF REFUSES ROLLS BACK THE ONES BEFORE IT, so a half-run never leaves half a ledger', async () => {
  const r = await record();
  const metered = finishScript(r.deps, prepared(r), {
    writes: [
      { op: 'create', register: 'gold_egp', fields: { at: '2026-09-22T12:00', value: 1 } },
      { op: 'create', register: 'gold_egp', fields: { value: 2 } },
    ],
    log: '',
    usage: USAGE,
  });
  assert.equal(metered.outcome, 'refused');
  assert.equal(golds(r.sql), 0);
});

test('A THROW IS REFUSED AND COUNTED AS ONE RUN, and the third in a row pauses the schedule and tells the owner once', async () => {
  const r = await record();
  const threw: ScriptAnswer = { refused: { code: null, why: 'TypeError: price_gram_24k is undefined' }, log: '', usage: USAGE };

  for (let i = 1; i <= 2; i++) {
    const m = finishScript(r.deps, prepared(r), threw);
    assert.equal(m.outcome, 'refused');
    assert.equal(m.usage.runs, 1);
    assert.equal(row(r.sql)?.state, 'pending', `after ${i} refused run(s) the script still runs`);
  }
  assert.equal(r.told.length, 0);

  finishScript(r.deps, prepared(r), threw);
  assert.equal(row(r.sql)?.state, 'paused', 'the third refused run in a row pauses it');
  assert.equal(r.told.length, 1);
  assert.match(r.told[0]!.say, /gold-rate is paused/);
  assert.equal(r.told[0]!.actor, 'script:gold-rate');

  /* A FOURTH, from a door or a rule that does not read the schedule row, does not tell the owner a second time. */
  finishScript(r.deps, prepared(r), threw);
  assert.equal(r.told.length, 1, 'told once');
  assert.equal(golds(r.sql), 0);
  assert.deepEqual(runs(r.sql).map((x) => x.usage.runs), [1, 1, 1, 1]);
});

test('A RUN THAT WORKS BETWEEN TWO REFUSALS BREAKS THE STREAK, so three refusals over a week of good runs pause nothing', async () => {
  const r = await record();
  const threw: ScriptAnswer = { refused: { code: null, why: 'boom' }, log: '', usage: USAGE };
  finishScript(r.deps, prepared(r), threw);
  finishScript(r.deps, prepared(r), threw);
  finishScript(r.deps, prepared(r), { writes: [], log: '', usage: USAGE });
  finishScript(r.deps, prepared(r), threw);
  assert.equal(row(r.sql)?.state, 'pending');
  assert.equal(r.told.length, 0);
});

test('A HELD RUN STARTS NOTHING and moves due_at as a held call does, counting no run', async () => {
  const r = await record();
  const before = row(r.sql)!;
  const until = NOW + 9 * 24 * HOUR;
  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'gold-rate', version: 1, input: null });
  const out = await runActions(
    {
      drain: () => ({ claimed: 0, done: 0, failed: 0, dead: 0 }),
      lease: (n) => lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], n),
      prepare: (j) => prepareScript(r.deps, j),
      finish: () => assert.fail('not an action request'),
      release: () => assert.fail('nothing pages here'),
      dropPaged: () => assert.fail('nothing pages here'),
      meterPaged: () => assert.fail('nothing pages here'),
      releaseJob: () => assert.fail('the budget is not in play'),
      finishScript: (s, a) => finishScript(r.deps, s, a),
    },
    async () => assert.fail('not an action request'),
    5,
    undefined,
    undefined,
    /* THE HOST'S ADMISSION, AS `holdingScript` WILL ANSWER IT: asked first, and the sandbox never started. */
    async () => ({ held: { until, say: 'gold-rate waits for next month: this record has used its runs for September.' } }),
  );
  assert.deepEqual({ ran: out.ran, held: out.held }, { ran: 0, held: 1 });
  const after = row(r.sql)!;
  assert.equal(after.state, 'pending', 'held is not paused, so nobody has to resume it');
  assert.equal(Date.parse(after.due_at), until);
  assert.ok(Date.parse(before.due_at) < until);
  const [run] = runs(r.sql);
  assert.deepEqual({ outcome: run?.outcome, runs: run?.usage.runs, held: run?.usage.held }, { outcome: 'held', runs: 0, held: 1 });
  assert.equal(golds(r.sql), 0);
  assert.equal(job(r.sql)?.state, 'done');
});

test('A RUN WHOSE SCRIPT WAS RETIRED BEFORE IT WAS LEASED IS DROPPED, and nothing is handed to a host', async () => {
  const r = await record();
  const j = leased(r);
  r.sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'script.gold-rate'");
  const got = prepareScript(r.deps, j);
  assert.ok(!('scripted' in got));
  assert.equal(got.outcome, 'dropped');
  assert.equal(got.usage.runs, 0);
  assert.equal(job(r.sql)?.state, 'done');
});

test('AN UPDATE IS CHECKED BY THE REGISTER OF THE ROW IT NAMES, so a spoken id cannot smuggle a write past `writes`', async () => {
  const r = await record();
  const note = r.k.create('notes', { what: 'keep' }, { actor: 'p_1' });
  assert.ok(note.ok, fixOf(note));
  const spoken = r.k.nameOf(note.value.id);
  assert.ok(spoken);
  const metered = finishScript(r.deps, prepared(r), { writes: [{ op: 'update', spoken, patch: { what: 'changed' }, version: 1 }], log: '', usage: USAGE });
  assert.equal(metered.outcome, 'refused');
  assert.equal(r.k.get(note.value.id)?.fields.what, 'keep');
});

test('A RUN WHOSE LEASE LAPSED WHILE THE SANDBOX RAN WRITES NOTHING, because the host that reclaimed the job will land it', async () => {
  const r = await record();
  const s = prepared(r);
  /* ANOTHER HOST TAKES THE JOB after the five-minute lease runs out. Without the fenced ack inside the savepoint, this
     answer landed its row and the reclaiming host's run would land a second copy of the same point. */
  const [again] = lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW + 6 * 60_000 }, ['script.run'], 1);
  assert.ok(again, 'the lapsed lease was reclaimed');
  const metered = finishScript(r.deps, s, { writes: [{ op: 'create', register: 'gold_egp', fields: { at: '2026-09-22T12:00' } }], log: '', usage: USAGE });
  assert.equal(golds(r.sql), 0);
  assert.equal(metered.outcome, 'dropped');
  assert.equal(job(r.sql)?.state, 'leased', 'the job still belongs to the host that reclaimed it');
});

test('A HOST WITH NO SANDBOX DROPS THE RUN, AND ONE WHOSE ADAPTER THROWS HANDS IT TO THE LADDER, and neither counts toward a pause', async () => {
  const r = await record();
  const steps = (): RunnerSteps => ({
    drain: () => ({ claimed: 0, done: 0, failed: 0, dead: 0 }),
    lease: (n) => lease(r.sql, { mint: r.deps.mint, allocate: () => 1, nowMs: NOW }, ['script.run'], n),
    prepare: (j) => prepareScript(r.deps, j),
    finish: () => assert.fail('not an action request'),
    release: () => assert.fail('nothing pages here'),
    dropPaged: () => assert.fail('nothing pages here'),
    meterPaged: () => assert.fail('nothing pages here'),
    releaseJob: () => assert.fail('the budget is not in play'),
    finishScript: (s, a) => finishScript(r.deps, s, a),
  });
  const fail = async () => assert.fail('not an action request');

  enqueue(r.sql, r.deps.mint, NOW, 'script.run', { script: 'gold-rate', version: 1, input: null });
  const none = await runActions(steps(), fail, 5);
  assert.deepEqual({ ran: none.ran, dropped: none.dropped }, { ran: 0, dropped: 1 });
  assert.equal(job(r.sql)?.state, 'done');

  for (let i = 0; i < 3; i++) {
    enqueue(r.sql, r.deps.mint, NOW + i + 1, 'script.run', { script: 'gold-rate', version: 1, input: null });
    const broke = await runActions(steps(), fail, 5, undefined, undefined, async () => {
      throw new Error('the isolate would not start');
    });
    assert.deepEqual({ failed: broke.failed, refused: broke.refused, runs: broke.usage[0]?.usage.runs }, { failed: 1, refused: 0, runs: 0 });
    assert.equal(job(r.sql)?.state, 'failed', 'the ladder retries it');
  }
  assert.equal(row(r.sql)?.state, 'pending', 'three broken hosts are not three refused runs');
  assert.equal(r.told.length, 0);
});

test('A RESUMED SCRIPT RUNS AGAIN, and the refusals before the resume do not pause it on the next one', async () => {
  const { resumeScript } = await import('../src/script-run.ts');
  const r = await record();
  const threw: ScriptAnswer = { refused: { code: null, why: 'boom' }, log: '', usage: USAGE };
  for (let i = 0; i < 3; i++) finishScript(r.deps, prepared(r), threw);
  assert.equal(row(r.sql)?.state, 'paused');

  const back = resumeScript(r.deps, 'gold-rate', 'p_1');
  assert.ok(back.ok, fixOf(back));
  assert.equal(row(r.sql)?.state, 'pending');
  assert.equal(Date.parse(row(r.sql)!.due_at), NOW);

  finishScript(r.deps, prepared(r), threw);
  assert.equal(row(r.sql)?.state, 'pending', 'one refusal after a resume is one, not four');
  assert.equal(r.told.length, 1);
  assert.equal(resumeScript(r.deps, 'gold-rate', 'p_1').ok, false, 'a running script has nothing to resume');
});

/* ── the run's log ──────────────────────────────────────────────────────────── */

/** The newest run event on the script, as `recentHistory` hands it to the owner: `eventsBefore`, whose `to` is `to_v`. */
const lastRun = (k: Kernel) => k.eventsBefore(null, 50).find((e) => e.kind === 'pull' && e.target === 'declaration:script.gold-rate' && e.to !== null);

test('A REFUSED RUN KEEPS ITS LOG ON ITS EVENT, where the owner reads why, and the ledger row the Directory counts carries none', async () => {
  const r = await record();
  const log = 'fetched 1 quote\nprice_gram_24k missing from {"error":"rate limited"}\n';
  const m = finishScript(r.deps, prepared(r), { refused: { code: null, why: 'TypeError: price_gram_24k is undefined' }, log, usage: USAGE });

  assert.equal(m.outcome, 'refused');
  /* THE WHY GOES FIRST IN IT, and not on the note: a thrown message is the script's own text, and the note is on a line
     every whole-record reader sees (`packages/record/test/script-refusal-note.test.ts`). */
  assert.equal((lastRun(r.k)?.to as { log?: unknown } | null)?.log, `TypeError: price_gram_24k is undefined\n${log}`);
  assert.equal(lastRun(r.k)?.note, 'gold-rate did not finish, so it wrote nothing; its log says why.');
  assert.equal(lastRun(r.k)?.id, m.event, 'the log is on the run event itself, not on one beside it');
  /* THE LEDGER'S SHAPE IS `Metered`, handed to the Directory by `meterPass`, and a log in it would be customer text in a
     table that holds counts. */
  assert.ok(!('log' in m), `the metered run carries ${JSON.stringify(m)}`);
});

test('A RUN THAT WROTE KEEPS ITS LOG TOO, and one that logged nothing adds no empty field', async () => {
  const r = await record();
  finishScript(r.deps, prepared(r), { writes: [{ op: 'create', register: 'gold_egp', fields: { at: 'noon', value: 1 } }], log: 'one point\n', usage: USAGE });
  assert.equal((lastRun(r.k)?.to as { log?: unknown }).log, 'one point\n');

  finishScript(r.deps, prepared(r), { writes: [], log: '', usage: USAGE });
  assert.ok(!('log' in (lastRun(r.k)?.to as object)), 'an empty log was kept as a field');
});

test('A LOG OVER 8 KB IS CUT AT 8 KB ON THE RECORD SIDE, whatever the host sent, and never through a character', async () => {
  const r = await record();
  /* THE SANDBOX CUTS AT 8 KB ALREADY, and this is the host that did not: 8,191 bytes of ASCII, the refusal's why first
     among them, then a three-byte character that straddles the line, then more. */
  const why = 'boom\n';
  const log = `${'a'.repeat(8191 - why.length)}€${'b'.repeat(20_000)}`;
  finishScript(r.deps, prepared(r), { refused: { code: null, why: 'boom' }, log, usage: USAGE });
  const kept = (lastRun(r.k)?.to as { log: string }).log;
  assert.equal(kept, `${why}${'a'.repeat(8191 - why.length)}`);
  assert.ok(new TextEncoder().encode(kept).length <= 8 * 1024);
});
