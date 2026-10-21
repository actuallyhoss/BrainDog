/**
 * The bench itself: its arithmetic, the targets file, the seed run, and that it never fails.
 *
 *   node --test tools/agent-bench/test/*.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { misses, percentile, profile, READS, sample, table } from '../run.mjs';

const dir = fileURLToPath(new URL('..', import.meta.url));
const targets = JSON.parse(readFileSync(`${dir}targets.json`, 'utf8')).targets;

test('percentile picks the nearest rank', () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(s, 50), 5);
  assert.equal(percentile(s, 95), 10);
  assert.equal(percentile([], 50), null);
});

test('targets.json has p50 and p95 for every call the bench times', () => {
  for (const r of READS) assert.ok(targets[r.label]?.p50 > 0 && targets[r.label].p95 >= targets[r.label].p50, r.label);
  assert.equal(targets.context.p50, 450);
  assert.equal(targets['resources/list'].bytes, 15000);
});

test('a miss is named, and a pass is not', () => {
  const rows = [{ label: 'context', p50: 500, p95: 700, bytes: 1, refused: 0 }, { label: 'get', p50: 10, p95: 20, bytes: 1, refused: 0 }];
  assert.deepEqual(misses(rows, targets), ['context: p50 500 over 450']);
  assert.match(table(rows, targets), /context .*MISS/);
});

test('sample counts n timings after a warm-up', async () => {
  let calls = 0;
  const r = await sample(async () => ({ ms: ++calls, bytes: 7, refused: false }), 'x', {}, 4);
  assert.equal(calls, 5);
  assert.equal(r.n, 4);
  assert.equal(r.bytes, 7);
});

test('--profile refuses without approval and touches nothing', async () => {
  const r = await profile('/nonexistent/copy.db', { runs: 1, approved: false });
  assert.match(r.refused, /approval/);
});

test('the seed run prints a table and exits 0', () => {
  const r = spawnSync(process.execPath, [`${dir}run.mjs`, '--runs', '2'], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /agent-bench on the seed, in process/);
  for (const label of ['context', 'record_index', 'governance', 'tools/list', 'resources/list']) assert.ok(r.stdout.includes(label), label);
});

test('a bad option or a dead host never fails the run', () => {
  const r = spawnSync(process.execPath, [`${dir}run.mjs`, '--nope'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});
