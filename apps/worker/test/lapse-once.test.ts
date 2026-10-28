/**
 * A lapse is said once ("Read-only until billing resumes.", HD.435): a lapsed record that skips a
 * hundred queued jobs is left with its one line, and with nothing filed on Decide, nothing queued and no fault.
 *
 * OVER THE REAL KERNEL, with the jobs written straight into its outbox, and the Worker's two lapsed paths run as
 * `index.ts` runs them: the queue's pump with `lapseDrops` in front of the delivery (a dropped job is acked done and
 * unsent), and the alarm's acks of the calls, polls and model jobs (`#unsent`: done, a call or an ask answered with
 * `LAPSED_FIX`). A delivery that is reached is a failure here, because nothing in this test may be sent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type OutboxKind } from '@braindog/kernel';

import { LAPSED_FIX, lapseDrops } from '../src/lapse.ts';
import { pump } from '../src/pump.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const iso = (ms: number): string => new Date(ms).toISOString();

/** The alarm's lapsed kinds, as `UNSENT_KINDS` in `index.ts` names them. */
const UNSENT: readonly OutboxKind[] = ['pull.fetch', 'infer.embed', 'infer.prose', 'infer.draft', 'infer.ask'];
const NOTIFY: readonly OutboxKind[] = ['notify.email', 'notify.push', 'notify.webhook'];

/** A hundred queued jobs a lapsed record skips: digests on each channel, calls, polls and model jobs. */
function queue(sql: NodeSql): number {
  const jobs: [OutboxKind, unknown][] = [];
  for (let i = 0; i < 20; i++) {
    jobs.push(['notify.email', { to: 'owner@example.test', because: `digest.d_${String(i)}`, subject: 'Your week' }]);
    jobs.push(['notify.push', { url: `/digest/d_${String(i)}`, title: 'Your week' }]);
    jobs.push(['notify.webhook', { url: 'https://hooks.example.test/in', body: JSON.stringify({ digest: `d_${String(i)}` }) }]);
    jobs.push(['pull.fetch', { source: 'feed', run: `r_${String(i)}` }]);
    jobs.push([(['infer.embed', 'infer.draft', 'infer.ask'] as const)[i % 3]!, { run: `r_${String(i)}` }]);
  }
  jobs.forEach(([kind, payload], i) =>
    sql.exec(
      "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES (?, ?, ?, ?, 'pending', 0)",
      `o_${String(i).padStart(3, '0')}`,
      iso(NOW - 60_000),
      kind,
      JSON.stringify(payload),
    ),
  );
  return jobs.length;
}

/** How many rows each of the record's tables holds, so a row filed anywhere is seen. */
function counts(sql: NodeSql): Record<string, number> {
  const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return Object.fromEntries(tables.map((t) => [t.name, sql.one<{ n: number }>(`SELECT count(*) AS n FROM "${t.name}"`)?.n ?? 0]));
}

test('A HUNDRED SKIPPED JOBS LEAVE ONE LINE, AND NOTHING FILED ON DECIDE', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const queued = queue(sql);
  assert.equal(queued, 100);
  const before = counts(sql);
  const openBefore = sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")?.n ?? 0;

  /* THE QUEUE'S PUMP ON A LAPSED RECORD: every digest is dropped by `lapseDrops`, so no delivery is reached. */
  const sent: string[] = [];
  const pass = await pump(
    { lease: async () => k.leaseOutbox(NOTIFY, 100), ack: async (a) => void k.ackOutbox(a) },
    async (job) => (lapseDrops(job) ? undefined : sent.push(job.id)),
  );
  assert.deepEqual(sent, [], 'a lapsed record sent a digest');
  assert.deepEqual(pass, { sent: 60, failed: 0, unacked: 0 });

  /* THE ALARM'S ACKS, as `#unsent` makes them, in passes of fifty. */
  for (;;) {
    const jobs = k.leaseOutbox(UNSENT, 50);
    for (const job of jobs) {
      assert.ok(lapseDrops(job), `${job.kind} is a job a lapse drops`);
      const answered = job.kind === 'infer.ask' || job.kind === 'pull.fetch' ? { result: { failed: LAPSED_FIX } } : {};
      k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, ...answered });
    }
    if (jobs.length < 50) break;
  }

  const states = sql.all<{ state: string; n: number }>('SELECT state, count(*) AS n FROM outbox GROUP BY state');
  assert.deepEqual(states.map((s) => [s.state, s.n]), [['done', 100]], 'every skipped job is done and unsent');
  const openAfter = sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")?.n ?? 0;
  assert.equal(openAfter, openBefore, 'a skipped job filed a question on Decide');
  const { faults } = (k.faults() as { ok: true; value: { faults: unknown[] } }).value;
  assert.deepEqual(faults, [], 'a skipped job raised a fault');
  /* NOTHING FILED ANYWHERE: no table gained a row, the outbox included, so no notice was queued for a skip. */
  assert.deepEqual(counts(sql), before);
  /* AND THE ONE LINE THE PERSON READS IS THE LAPSE'S OWN, one line with no count of what was skipped. */
  assert.ok(!LAPSED_FIX.includes('\n'), 'the lapse says more than one line');
  assert.ok(!/\d/.test(LAPSED_FIX), 'the lapse counts what it skipped');
  sql.close();
});
