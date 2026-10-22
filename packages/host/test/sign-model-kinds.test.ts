/**
 * `model-answers` over a ledger at store version 3: one row an ask and never a test, and a red reading that says which
 * kind of ask the model did not answer and since when.
 *
 * RED BEFORE THIS. A week of the Cloud's own ledger read "The model did not answer 87 of 190 asks this week" and said
 * nothing more: not that the misses were the half-hourly model test and the digest summaries, not that they had ended
 * on 20 October, and every attempt a route passed over was one more ask the model did not answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok } from '@braindog/ports';

import { readModelSign, type ModelSignKernel } from '../src/sign-model.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);
const HOUR = 3_600_000;

/** Slash's ledger as `packages/slash/src/call.ts` builds it at store version 3. */
const ledger = (): NodeSql => {
  const sql = openSqlite();
  sql.exec(`CREATE TABLE slash_call (
    id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
    status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
    purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person', route TEXT, candidate TEXT, raw TEXT)`);
  return sql;
};

let n = 0;
type Row = { hoursAgo: number; purpose: string; status?: 'ok' | 'error' | 'nothing'; code?: string | null; model?: string; candidate?: string | null; route?: string | null };
const put = (sql: NodeSql, r: Row): void =>
  sql.exec(
    "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, purpose, spends, route, candidate) VALUES (?, ?, 'pattern', 'a', ?, 0, 0, 0, 0, ?, ?, ?, 'background', ?, ?)",
    `c${++n}`,
    new Date(NOW - r.hoursAgo * HOUR).toISOString(),
    r.model ?? 'glm-5.3-flash',
    r.status ?? 'ok',
    r.code ?? null,
    r.purpose,
    r.route ?? null,
    r.candidate ?? null,
  );
const miss = (hoursAgo: number, purpose: string, more: Partial<Row> = {}): Row => ({ hoursAgo, purpose, status: 'error', code: 'UNREACHABLE', ...more });
const hit = (hoursAgo: number, purpose: string, more: Partial<Row> = {}): Row => ({ hoursAgo, purpose, ...more });

const kernel: ModelSignKernel = { signRead: () => ok({ sign: 'model-answers', day: '2026-10-21' }) };

test('A MODEL TEST IS NO ASK: half-hourly tests of a silent model leave the week as the record asked it', () => {
  const sql = ledger();
  for (const h of [100, 80, 60, 40, 20]) put(sql, hit(h, 'headline'));
  /* An outage's worth of the silent model's test, and the engine's probe pressed once. */
  for (let h = 90; h > 70; h -= 0.5) put(sql, miss(h, 'probe', { model: 'llama-3.2-1b' }));
  put(sql, miss(75, 'probe'));
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'green', r.said);
  assert.equal(r.said, 'The model answered all 5 asks this week.');
});

test('A SEARCH EMBEDDING IS NO ASK: embeddings answering all week leave a silent writing model red', () => {
  const sql = ledger();
  for (let h = 160; h > 0; h -= 2) put(sql, hit(h, 'embed', { model: 'bge-m3' }));
  for (const h of [60, 30, 4]) put(sql, miss(h, 'prose', { model: 'llama-3.2-1b' }));
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red', r.said);
  assert.match(r.said, /^The model did not answer 3 of 3 asks this week\./u);
});

test('AN ASK A SECOND MODEL ANSWERED IS ONE ASK, ANSWERED: the attempt the walk passed over is not a miss', () => {
  const sql = ledger();
  for (const h of [100, 80, 60, 40]) put(sql, hit(h, 'headline'));
  /* `digestProse` on the Cloud: the small model not reached, and the flash model after it answered. */
  put(sql, miss(10, 'prose', { model: 'llama-3.2-1b', candidate: 'small' }));
  put(sql, hit(10, 'prose', { candidate: 'flash' }));
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'green', r.said);
  assert.equal(r.said, 'The model answered all 5 asks this week.');
});

test('AN ASK NO CANDIDATE ANSWERED IS ONE MISS, NOT ONE A CANDIDATE', () => {
  const sql = ledger();
  for (const h of [100, 80, 60, 40, 30, 20, 15, 12, 11]) put(sql, hit(h, 'headline'));
  put(sql, miss(2, 'prose', { model: 'llama-3.2-1b', candidate: 'small' }));
  put(sql, miss(2, 'prose', { candidate: 'flash' }));
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red', 'the newest ask was not answered');
  assert.match(r.said, /^The model did not answer 1 of 10 asks this week\./u);
});

test('RED SAYS WHICH KIND AND SINCE WHEN: a kind still failing by the day it began, one that mended by its last miss', () => {
  const sql = ledger();
  /* The digest summaries answered once on the 15th and have missed since the 16th; the headlines missed three times on
     the 19th and the 20th, and answer again. */
  put(sql, hit(6 * 24, 'prose'));
  for (const h of [5 * 24, 4 * 24, 3 * 24, 2 * 24, 30, 6]) put(sql, miss(h, 'prose', { model: 'llama-3.2-1b' }));
  for (const h of [50, 40, 28]) put(sql, miss(h, 'headline'));
  for (const h of [100, 20, 3]) put(sql, hit(h, 'headline'));
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red', r.said);
  assert.equal(
    r.said,
    'The model did not answer 9 of 13 asks this week. Digest summaries have not been answered since 16 October. Page headlines missed 3 times, the last on 20 October, and answer again.',
  );
  assert.ok(r.said.length <= 280);
  assert.doesNotMatch(r.said, /prose|headline\b|UNREACHABLE|llama|—/u, 'a purpose, a code or a model id is not a sentence');
});

test('A KIND NEVER ANSWERED THIS WEEK IS SAID FROM ITS FIRST MISS IN THE WEEK, not as the day it began', () => {
  const sql = ledger();
  for (const h of [100, 60, 30, 10, 5]) put(sql, hit(h, 'headline'));
  for (const h of [6 * 24, 3 * 24, 1]) put(sql, miss(h, 'prose', { model: 'llama-3.2-1b' }));
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red', r.said);
  assert.equal(r.said, 'The model did not answer 3 of 8 asks this week. Digest summaries have not been answered this week, 3 asks from 15 October.');
});

test('A LEDGER BEFORE STORE VERSION 3 READS AS IT DID: every row an ask, and the count alone, since nothing says what it was for', () => {
  const sql = openSqlite();
  sql.exec(`CREATE TABLE slash_call (
    id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
    status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT)`);
  const at = (h: number, status: string, code: string | null) =>
    sql.exec(
      "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES (?, ?, 'read', 'a', 'glm-5.3-flash', 0, 0, 0, 0, ?, ?)",
      `o${++n}`,
      new Date(NOW - h * HOUR).toISOString(),
      status,
      code,
    );
  for (const h of [40, 30, 20]) at(h, 'ok', null);
  at(2, 'error', 'UNREACHABLE');
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The model did not answer 1 of 4 asks this week.');
});
