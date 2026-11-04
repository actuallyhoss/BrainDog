/**
 * `braindog --version`, through a real child process, because what a terminal shows is the whole of
 * what this command is.
 *
 * THE CLAIM UNDER TEST IS THAT IT NEEDS NOTHING. No host, no token, no hosts file, no network: a
 * person asking which build they are running is usually asking because something else did not work,
 * and a version that first wants a login answers a different question from the one they asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';
import { PRIMITIVES_VERSION } from 'braindog-render';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/** Run from a checkout there is no bundle and no commit, so `48 §5.1`'s unbundled build is the one here. */
const EXPECTED = `app dev+0000000 · format ${FORMAT_VERSION} · kernel ${KERNEL_MIGRATION} · primitives ${PRIMITIVES_VERSION}`;

const ran = (args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

/** An empty config folder, and nothing in the environment that names a host or carries a token. */
const nowhere = (t: { after: (f: () => void) => void }): NodeJS.ProcessEnv => {
  const config = mkdtempSync(join(tmpdir(), 'braindog-version-'));
  t.after(() => rmSync(config, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  return env;
};

test('--version PRINTS THE FOUR NUMBERS ON STDOUT AND EXITS 0, with no host, no token and no hosts file', async (t) => {
  const out = await ran(['--version'], nowhere(t));
  assert.equal(out.stderr, '', out.stderr);
  assert.equal(out.stdout, `${EXPECTED}\n`);
  assert.equal(out.code, 0);
});

test('-v IS THE SAME COMMAND, because 48 §5.1 names both spellings', async (t) => {
  const out = await ran(['-v'], nowhere(t));
  assert.equal(out.stdout, `${EXPECTED}\n`, out.stderr);
  assert.equal(out.code, 0);
});

test('THE FOUR NUMBERS ARE READ FROM THE PACKAGES THAT OWN THEM, never written down here twice', async (t) => {
  /* `52 §5.6`: the app has no version of its own, and a second copy of one of these numbers is the
     thing that goes stale. The format, the kernel migration and the primitives each have exactly one
     home, and this command imports all three. */
  const out = await ran(['--version'], nowhere(t));
  const [app, format, kernel, primitives] = out.stdout.trim().split(' · ');
  assert.equal(app, 'app dev+0000000');
  assert.equal(format, `format ${FORMAT_VERSION}`);
  assert.equal(kernel, `kernel ${KERNEL_MIGRATION}`);
  assert.equal(primitives, `primitives ${PRIMITIVES_VERSION}`);
});

test('IT IS NO LONGER LISTED AS UNBUILT, and neither is run', async (t) => {
  const out = await ran(['--help'], nowhere(t));
  assert.equal(out.code, 0, out.stderr);
  const unbuilt = out.stdout.split('\n').find((l) => l.startsWith('Not built yet:')) ?? '';
  assert.equal(unbuilt.includes('--version'), false, unbuilt);
  assert.equal(unbuilt.includes('run'), false, unbuilt);
  /* THE HELP IS GROUPED, one short line a command; the long line is the command's own --help. */
  assert.match(out.stdout, /^  --version +\S/m, 'the usage does not name it');
  assert.match(out.stdout, /^  keys exec <label> -- <cmd> +\S/m, 'the usage does not name keys exec');
  assert.match(out.stdout, /^  run <label> -- <cmd> +\S/m, 'the usage does not name run');
  const run = await ran(['run', '--help'], nowhere(t));
  assert.equal(run.code, 0, run.stderr);
  assert.ok(run.stdout.includes('braindog run <label'), "run's own help does not name it");
});
