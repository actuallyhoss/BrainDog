/**
 * `braindog serve` in a child process, kept until it has said what a test is waiting for, and then stopped.
 *
 * `serve` RUNS UNTIL IT IS STOPPED, and its boot lines come after `start()` has opened the record and listened. Idle
 * that is about half a second from spawn. Under `pnpm -r --workspace-concurrency=3 run test` it was measured past five
 * seconds, so a `spawnSync` with a fixed five second timeout killed the process before the line and the test asserted
 * on a stderr holding nothing but Node's own warnings. This waits for the thing the test needs instead, and the
 * deadline is only a ceiling for a process that never says it, where the assertions then fail with what it did say.
 *
 * Not a test file: the package runs `test/*.test.ts`, so this loads only through the tests that import it.
 */

import { spawn } from 'node:child_process';
import { get as getHttp } from 'node:http';
import { get as getHttps } from 'node:https';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/** The ceiling on one boot or one refusal: far past the slowest measured, so only a process that never gets there reaches it. */
export const SERVE_DEADLINE_MS = 30_000;

/** How often the readiness check is asked again while the process is still booting. */
const LOOK_EVERY_MS = 100;

/** The ceiling on one probe of the running host, so a hung socket is a "not yet" and not a hung test. */
const PROBE_MS = 2_000;

export type Served = { stdout: string; stderr: string; status: number | null };

/**
 * Runs `serve` with this environment until `ready` says yes about what it has written to stderr so far, the process
 * exits by itself, or `SERVE_DEADLINE_MS` passes; then stops it and answers everything it wrote. `status` is the exit
 * code when it exited by itself and `null` when it was stopped, which is what `spawnSync` answered for a timeout.
 */
export async function serveUntil(env: Record<string, string | undefined>, ready: (stderr: string) => boolean | Promise<boolean>): Promise<Served> {
  const child = spawn(process.execPath, [MAIN, 'serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => void (stdout += chunk));
  child.stderr.on('data', (chunk: string) => void (stderr += chunk));
  let exited = false;
  child.once('exit', () => void (exited = true));
  const closed = new Promise<number | null>((resolve) => child.once('close', (code: number | null) => resolve(code)));
  const deadline = Date.now() + SERVE_DEADLINE_MS;
  try {
    while (!exited && Date.now() < deadline && !(await ready(stderr))) await new Promise((r) => setTimeout(r, LOOK_EVERY_MS));
  } finally {
    if (!exited) child.kill();
  }
  const status = await closed;
  return { stdout, stderr, status };
}

/**
 * Whether anything answers at this loopback URL; any status at all is a yes.
 *
 * AN ANSWER AFTER A BOOT LINE MEANS THE BOOT GOT PAST IT. Everything `serve` does between the line about the ways in and
 * the name it records runs without yielding, and a throw there ends the process before the event loop takes another
 * request. So a request answered once the line is out proves the lines under it were said and the process lived
 * through them. The certificate is not checked: this asks whether the host is up, not whether a browser trusts it.
 */
export function answers(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const answered = (res: { resume: () => void }): void => {
      res.resume();
      resolve(true);
    };
    const req = url.startsWith('https:') ? getHttps(url, { rejectUnauthorized: false, timeout: PROBE_MS }, answered) : getHttp(url, { timeout: PROBE_MS }, answered);
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}
