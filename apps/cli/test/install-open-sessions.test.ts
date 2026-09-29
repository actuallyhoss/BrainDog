/**
 * The cut-over names each Claude Code session still open on a profile it changes.
 *
 * MEASURED, with Claude Code 2.1.280 and stand-ins for Tallybook's server and hooks at the paths install
 * matches: a session held open across `install --replace --apply` on its own profile called the old server
 * after the install, had no `mcp__braindog__*` tool ("No such tool"), and still listed Tallybook's skill,
 * 15 seconds on. Only its hooks moved over: Claude Code reloads `settings.json` within seconds, and Tallybook's
 * end hook ran at close only when the session exited half a second after the install, not after 3 s or more. Each
 * running session keeps
 * `<profile>\sessions\<pid>.json`; on the day this was measured one default profile held three live ones and
 * the studio profile two, and the only sentence install prints about them is a generic one, under `.claude.json` alone.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPLACE_FILE } from './replace.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

const scratch = mkdtempSync(join(tmpdir(), 'braindog-open-sessions-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/* A process id nothing holds, found by asking, so the test does not depend on what else is running. */
function deadPid(): number {
  for (let pid = 4_194_000; pid < 4_194_400; pid += 4) {
    try {
      process.kill(pid, 0);
    } catch {
      return pid;
    }
  }
  throw new Error('no free process id found');
}

test('a live session file is named with its profile, and a dead one is not', () => {
  const dir = join(scratch, 'studio');
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  writeFileSync(join(dir, 'settings.json'), '{}');
  /* This test's own process stands in for an open Claude Code session: it is alive for as long as the run. */
  writeFileSync(join(dir, 'sessions', `${String(process.pid)}.json`), '{}');
  const dead = deadPid();
  writeFileSync(join(dir, 'sessions', `${String(dead)}.json`), '{}');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  delete env.CLAUDE_CONFIG_DIR;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', MAIN, 'install', '--replace', REPLACE_FILE, '--config-dir', dir], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n').find((l) => l.includes(String(process.pid)));
  assert.ok(line !== undefined && line.includes(dir), run.stdout);
  assert.ok(!run.stdout.includes(String(dead)), run.stdout);
});
