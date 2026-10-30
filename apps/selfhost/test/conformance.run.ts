/**
 * The conformance suite on the self-host: every case of `packages/host/test/conformance/cases.ts`, each on a fresh
 * record file opened by this app's own `openSqlite` and alarmed by its own `nodeScheduler`, as `start` opens them.
 *
 * NOT A `*.test.ts`, so `pnpm test` and CI's required set do not run it. Run it with
 * `pnpm --filter @braindog/selfhost conformance`, or the whole suite with `pnpm conformance` at the root. It writes
 * `packages/host/test/conformance/_results/node-sqlite.json` for `compare.run.ts`.
 *
 * A FILE ON DISK AND NOT `:memory:`, because the self-host runs every record in WAL mode on a file, and an in-memory
 * database answers `journal_mode = WAL` with `memory`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CASES, runCase, todoOn, type Host, type Outcome } from '../../../packages/host/test/conformance/cases.ts';
import { writeResults } from '../../../packages/host/test/conformance/results.ts';
import { nodeScheduler, openSqlite } from '../src/server.ts';

const dir = mkdtempSync(join(tmpdir(), 'braindog-conformance-'));
const outcomes: Outcome[] = [];
let sqlite = '';

after(() => {
  const file = writeResults({ host: 'node:sqlite', sqlite, runtime: `node ${process.version}`, at: new Date().toISOString(), outcomes });
  console.log(`conformance: ${outcomes.filter((o) => o.status === 'pass').length} of ${outcomes.length} passed on node:sqlite; results in ${file}`);
  rmSync(dir, { recursive: true, force: true });
});

for (const [i, c] of CASES.entries()) {
  const todo = todoOn(c, 'node:sqlite');
  test(`${c.id}: ${c.says}`, todo === undefined ? {} : { todo }, async () => {
    const sql = openSqlite(join(dir, `${String(i).padStart(3, '0')}-${c.id}.brain`));
    let wakes = 0;
    const scheduler = nodeScheduler(
      async () => {},
      async () => void wakes++,
    );
    const host: Host = { name: 'node:sqlite', sql, scheduler, wakes: () => wakes };
    try {
      if (!sqlite) sqlite = String(sql.one<{ v: string }>('SELECT sqlite_version() AS v')?.v);
      const out = await runCase(c, host);
      outcomes.push(out);
      if (out.status === 'fail') assert.fail(out.message ?? 'failed');
    } finally {
      scheduler.stop();
      sql.close();
    }
  });
}
