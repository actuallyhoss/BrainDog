/**
 * The lane's second step: a person's sign-in on production, with the canary's own passkey (PRF-A09).
 *
 * `tools/gates/signin-live.mjs`, as the runner calls it, with one thing added: where the session it keeps for the look
 * goes. A green live run signs in once more and leaves that browser state at `sessionPath` (`../lib.mjs`), in the
 * runner's temporary folder and never under `LANE_OUT`, which is hung on the run. The look (`30-look.mjs`) reads it
 * and ends it. Until the owner's sitting there is no canary, the gate signs in on a fresh self-host, keeps nothing, and its
 * line says "self-host only".
 *
 * A RED HERE STARTS THE ROLLBACK THAT EXISTS (`.github/workflows/after-deploy.yml`).
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import signinLive from '../../gates/signin-live.mjs';
import { sessionPath, where } from '../lib.mjs';

export const onRed = 'rollback';

/** The gate's environment for this run: the process's, and the session's file once the canary is named. */
export async function envFor(env = process.env) {
  if (!where(env).live) return env;
  const file = sessionPath(env);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  return { ...env, CANARY_SESSION: file };
}

if (import.meta.main)
  envFor().then(
    async (env) => (process.exitCode = (await signinLive(undefined, env)) ?? 0),
    (e) => {
      console.error(`  signin-live stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
