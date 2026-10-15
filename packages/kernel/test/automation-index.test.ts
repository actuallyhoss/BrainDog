/**
 * The index a finished script's chain is found by: `automation_step_answer`, which migration 17 made.
 *
 * `chainOfJob` (`flow.ts`) finds the runs whose `script` step queued a job by the job's id, which the step keeps as its
 * answer. Without the index that read walked every script step the record keeps, once per finished script run, and
 * nothing would say so: the answer is the same either way, only slower, and slower on the records with the most runs.
 * So the guard is on the plan and not the answer. The query asked of SQLite is the one `chainOfJob` sends, caught on
 * its way through the port, so a change to that text is read here rather than a copy of it going stale.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param } from '@braindog/ports';

import { chainOfJob } from '../src/flow.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

test('AFTER MIGRATE THE automation_step_answer INDEX EXISTS, over the answer a step keeps', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const index = sql.one<{ tbl_name: string; sql: string }>("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name = 'automation_step_answer'");
  assert.ok(index, 'a migrated record has no automation_step_answer index');
  assert.equal(index.tbl_name, 'automation_step');
  assert.match(index.sql, /\(\s*answer\s*\)/u);
  sql.close();
});

test('THE QUERY chainOfJob RUNS IS PLANNED THROUGH automation_step_answer, and not a scan of every step', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));

  /* WHAT chainOfJob ASKS, CAUGHT AT THE PORT. Every read it makes is kept with its parameters. */
  const asked: { text: string; params: readonly Param[] }[] = [];
  const watched: NodeSql = {
    ...sql,
    all: (text, ...params) => {
      asked.push({ text, params });
      return sql.all(text, ...params);
    },
    one: (text, ...params) => {
      asked.push({ text, params });
      return sql.one(text, ...params);
    },
  };
  assert.equal(chainOfJob(watched, 'job_nobody_queued'), null, 'a job no step queued has a chain');
  const steps = asked.filter((q) => /\bautomation_step\b/u.test(q.text));
  assert.equal(steps.length, 1, `chainOfJob read automation_step ${steps.length} times`);

  const plan = sql
    .all<{ detail: string }>(`EXPLAIN QUERY PLAN ${steps[0]!.text}`, ...steps[0]!.params)
    .map((r) => r.detail);
  assert.ok(
    plan.some((d) => /automation_step_answer/u.test(d)),
    `the plan does not name automation_step_answer:\n${plan.join('\n')}`,
  );
  assert.ok(!plan.some((d) => /^SCAN s\b/u.test(d)), `the plan scans automation_step:\n${plan.join('\n')}`);
  sql.close();
});
