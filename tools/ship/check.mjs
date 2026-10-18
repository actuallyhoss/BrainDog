#!/usr/bin/env node
/**
 * The fast check while building: `ci.mjs --quick` (typechecks, the touched workspaces' tests, the unbuilt gates), and
 * when the site changed, its build and the tests that read it. Minutes, not the full run's forty; it writes no marker.
 *
 *   node tools/ship/check.mjs
 */
import { spawnSync } from 'node:child_process';
import { git, ROOT } from './lib.mjs';

const run = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

const changed = [...new Set([...git('diff', '--name-only', 'origin/master').out.split('\n'), ...git('ls-files', '--others', '--exclude-standard').out.split('\n')])].filter(Boolean);
let red = run(process.execPath, ['tools/ship/ci.mjs', '--quick', '--allow', 'clean-room']);
if (changed.some((f) => f.startsWith('apps/site/') || f.startsWith('packages/skin/') || f.startsWith('packages/theme/'))) {
  red ||= run('pnpm', ['--filter', '@braindog/site', 'build']);
  red ||= run('pnpm', ['--filter', '@braindog/site', 'test'], { SITE_BUILT: '1' });
}
console.log(red ? '\n  check: RED' : '\n  check: green');
process.exitCode = red ? 1 : 0;
