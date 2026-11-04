/**
 * The gate of `33 §3`: both hosts ran the same cases, and every case saw the same thing on both.
 *
 * READS WHAT THE TWO RUNNERS WROTE (`_results/`), so it runs after them: `pnpm conformance` at the root runs the
 * self-host, then the Worker, then this. A case one host failed is reported by that host's runner; here it is compared
 * only where both passed, because a failed case has no trace. A trace that differs on a case that declares `drift` is a
 * `todo`, and on any other case it fails: the difference is one nobody asserted, and it is the drift this suite exists to
 * find.
 *
 * Run: `pnpm --filter @braindog/host conformance:compare`, after both halves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CASES, HOSTS, plainJson, sameTrace, todoOn } from './cases.ts';
import { readResults, resultsFile } from './results.ts';

const runs = HOSTS.map((host) => ({ host, results: readResults(host) }));

test('every host wrote its results', () => {
  for (const { host, results } of runs) assert.ok(results, `${resultsFile(host)} is missing: run that host's half first`);
});

test('every host ran every case, and the same number of them', () => {
  const wanted = CASES.map((c) => c.id).sort();
  for (const { host, results } of runs) {
    if (!results) continue;
    assert.deepEqual(results.outcomes.map((o) => o.id).sort(), wanted, `${host} ran a different list of cases`);
  }
});

const [a, b] = runs;
for (const c of CASES) {
  const left = a?.results?.outcomes.find((o) => o.id === c.id);
  const right = b?.results?.outcomes.find((o) => o.id === c.id);
  const todo = c.drift ? todoOn(c, c.drift.host) : undefined;
  test(`${c.id}: the same on ${a?.host} and ${b?.host}`, todo === undefined ? {} : { todo }, (t) => {
    if (!left || !right) return t.skip('a host did not run it');
    if (left.status !== 'pass' || right.status !== 'pass') {
      const failed = [left, right].map((o, i) => (o.status === 'pass' ? null : `${runs[i]!.host}: ${o.message ?? 'failed'}`)).filter(Boolean);
      assert.fail(`not compared, because it failed on a host:\n${failed.join('\n')}`);
    }
    assert.ok(sameTrace(left.trace, right.trace), `the hosts saw different things:\n${a?.host}: ${JSON.stringify(plainJson(left.trace))}\n${b?.host}: ${JSON.stringify(plainJson(right.trace))}`);
  });
}
