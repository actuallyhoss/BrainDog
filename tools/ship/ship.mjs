#!/usr/bin/env node
/**
 * Ship in one go: the full CI, then push, the deploy (its own dry run, parity and smoke included) and a look at the
 * live pages. Stops at the first red and prints only what matters, so one run needs one read.
 *
 *   node tools/ship/ship.mjs            run it all (deploy only on the owner's word: `loop/tools/state.mjs hear "deploy"`)
 *   node tools/ship/ship.mjs --no-deploy    CI and push only
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SHIP, stamp } from './lib.mjs';

const NO_DEPLOY = process.argv.includes('--no-deploy');
const LOG = join(SHIP, `ship-${stamp()}.log`);
const step = (title, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  writeFileSync(LOG, `\n== ${title}\n${out}`, { flag: 'a' });
  return { ok: r.status === 0, out };
};
const tail = (out, re, n = 12) => out.split('\n').filter((l) => re.test(l)).slice(-n).join('\n');
const done = (ok, msg) => {
  console.log(`${ok ? 'ship: green' : 'ship: RED'}, ${msg}\n  full log: ${LOG}`);
  process.exit(ok ? 0 : 1);
};

const ci = step('ci', process.execPath, ['tools/ship/ci.mjs', '--allow', 'clean-room']);
console.log(tail(ci.out, /^\s+(FAIL|EXCUSED)\b|pass marker|^\s+log:/));
if (!ci.ok) done(false, 'CI is red (logs above)');

const push = step('push', 'git', ['push', '-q', 'origin', 'master']);
if (!push.ok) done(false, `push failed:\n${push.out.trim()}`);
if (NO_DEPLOY) done(true, 'CI green and pushed; not deployed (--no-deploy)');

const deploy = step('deploy', process.execPath, ['tools/ship/deploy.mjs']);
console.log(tail(deploy.out, /FAIL|WRONG|rollback:|rolled back/i, 8));
if (!deploy.ok) done(false, 'the deploy went red and rolled back (lines above)');

const health = step('live', 'curl', ['-s', 'https://brain.dog/healthz']);
const app = /"app":"([^"]+)"/.exec(health.out)?.[1] ?? 'unknown';
const head = readFileSync(join(ROOT, '.ship', 'pass.json'), 'utf8').match(/"sha": "(\w{7})/)?.[1] ?? '';
done(app.endsWith(head), `live app ${app}${app.endsWith(head) ? '' : `, but HEAD is ${head}`}`);
