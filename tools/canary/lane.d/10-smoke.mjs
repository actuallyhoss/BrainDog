/**
 * The lane's first step: the smoke's signed-in half, on the canary.
 *
 * ONCE THE CANARY IS NAMED (`SMOKE_SLUG`), `apps/worker/scripts/smoke.mjs production` with the canary's key: `boot`,
 * the two refusals and every first-draw read. Its exit code is this step's, and a line saying the signed-in half was
 * skipped is red here as well, because the canary exists and a skip would read as the pass it is not.
 *
 * UNTIL HIS SITTING, SELF-HOST ONLY: the same first-draw reads, built and judged by the smoke's own functions
 * (`canary`, `argsFor`, `readCheck`), asked of a fresh self-host with its server key in place of the canary's. What
 * that proves is the build's half of the question: the reads the app's first screens make all answer 200 on this
 * commit. Whether production answers them waits for the canary.
 *
 * A RED HERE STARTS THE ROLLBACK THAT EXISTS (`.github/workflows/after-deploy.yml`).
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { FIRST_DRAW } from '../../../apps/web/src/lib/record/first-draw.ts';
import { argsFor, canary, readCheck } from '../../../apps/worker/scripts/smoke.mjs';
import { SELF_HOST_ONLY, selfHost, where } from '../lib.mjs';

export const onRed = 'rollback';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/** The name the smoke's checks are built on, rewritten to the self-host before anything is asked. */
const STAND_IN = 'canary.invalid';

/** The self-host half: every first-draw read on a fresh self-host, judged as the smoke judges it. Answers wrong lines. */
export async function selfHostSmoke(host, { send = fetch, say = console.log } = {}) {
  const config = { env: { canary: { vars: { PUBLIC_HOST: STAND_IN } } } };
  const to = (url) => url.replace(`https://${STAND_IN}/${host.slug}`, host.base);
  const wrong = [];
  const said = {};
  async function ask(check) {
    const got = await send(to(check.url), {
      method: check.method,
      headers: { ...(check.headers ?? {}), authorization: `Bearer ${host.key}` },
      ...(check.body === undefined ? {} : { body: check.body }),
    });
    const answer = { status: got.status, headers: got.headers, text: await got.text() };
    const verdict = check.judge(answer);
    say(`  ${verdict ? 'WRONG' : 'ok   '}  ${check.method} ${new URL(check.url).pathname.replace(`/${host.slug}`, '')}${verdict ? `: ${verdict}` : ''}`);
    if (verdict) wrong.push(verdict);
    try {
      const body = JSON.parse(answer.text);
      return body?.ok === true ? body.value : null;
    } catch {
      return null;
    }
  }
  said.boot = await ask(canary(config, 'canary', host.slug));
  for (const read of FIRST_DRAW.filter((r) => r.method !== 'boot')) {
    const named = argsFor(read, said);
    if (named.skip) {
      say(`  skip   ${read.method}: ${named.skip}`);
      continue;
    }
    said[read.method] = await ask(readCheck(config, 'canary', host.slug, read, named.args));
  }
  return wrong;
}

/** The live half: the smoke itself, with the canary's key. `{ code, said }`. */
export function liveSmoke(env = process.env, run = spawnSync) {
  const out = run(process.execPath, [join(ROOT, 'apps', 'worker', 'scripts', 'smoke.mjs'), 'production'], { encoding: 'utf8', env, cwd: ROOT, timeout: 10 * 60_000 });
  return { code: out.status ?? 1, said: `${out.stdout ?? ''}${out.stderr ?? ''}` };
}

async function main(env = process.env) {
  if (where(env).live) {
    const { code, said } = liveSmoke(env);
    process.stdout.write(said);
    if (/signed-in half is skipped/u.test(said)) {
      console.error(`  smoke: the canary ${env.SMOKE_SLUG} is named and the signed-in half was skipped, which is red, not a pass.`);
      return 1;
    }
    return code;
  }
  const host = await selfHost();
  try {
    const wrong = await selfHostSmoke(host);
    console.log(`  smoke, ${SELF_HOST_ONLY}: ${FIRST_DRAW.length} first-draw reads asked of a fresh self-host, ${wrong.length} wrong. brain.dog is not proven until the canary's sitting.`);
    return wrong.length === 0 ? 0 : 1;
  } finally {
    await host.close();
  }
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`  smoke stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
