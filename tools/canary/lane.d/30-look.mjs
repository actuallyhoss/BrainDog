/**
 * The lane's third step: the look at the canary, every screen at 390 and 1512, light and dark.
 *
 * `tools/look/run.mjs --source canary --set all`, drawn through the session `20-signin-live.mjs` kept, into
 * `LANE_OUT/look`, which the workflow hangs on the run as the canary's sheet. The canary's data is invented, so the
 * sheet is never counted as seen; it is how an agent sees the screens after each deploy.
 *
 * RED ON THREE THINGS, read off the look's own `said.json`: a screen that refused or never settled, an error the product
 * said in the console (the look's own refusals are not the product's), or a lint finding (the look's `lint`, and an id or a raw value where a person reads a name, its `raw`). A
 * red here opens a finding and marks the deploy "not proven"; it does not roll back, because a screen that draws
 * wrong is not a door that is shut.
 *
 * THE SESSION ENDS HERE, whatever the look said: signed out through `POST /auth/logout` and its file removed, so a
 * session made for one look does not outlive it. With the canary named and no session kept, this is red in one
 * sentence (the look source's own) and nothing is drawn.
 *
 * UNTIL HIS SITTING, `--source canary:self-host`: a fresh self-host signed in by its own key, the same screens drawn the
 * same way, and the line says "self-host only".
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cookieFor, endSession, SELF_HOST_ONLY, sessionPath, where } from '../lib.mjs';

export const onRed = 'finding';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/** A failed request's record path, `/app/<slug>` taken off as the look's server takes it, and its status. */
const failed = (line) => {
  const m = /^[A-Z]+ (\S+): (\d{3})$/u.exec(String(line));
  return m === null ? null : { path: m[1].replace(/^\/app\/[a-z][a-z0-9-]*[a-z0-9](?=\/api(?:\/|$))/u, ''), status: Number(m[2]) };
};

/**
 * The console errors the product made on one screen. THE LOOK'S OWN REFUSALS ARE NOT THE PRODUCT'S: the source answers
 * 403 to every write and every path it does not hand on, and the browser says "Failed to load resource" for each. That
 * line is left out only when every 403 the screen met was one the source counted as its own (`refused.blocked`, by
 * method name or by path), so a 403 the canary itself gave is still red.
 */
export function productErrors(shot, { selfHost = false } = {}) {
  const blocked = shot?.refused?.blocked ?? {};
  const own = (f) => Object.hasOwn(blocked, f.path) || Object.hasOwn(blocked, /^\/api\/([A-Za-z][A-Za-z0-9]*)$/u.exec(f.path)?.[1] ?? '');
  const failures = (shot?.failedRequests ?? []).map(failed);
  const forbidden = failures.filter((f) => f?.status === 403);
  const allOwn = forbidden.length > 0 && forbidden.every(own);
  /* A SELF-HOST WITH NO COPIES ANSWERS `/api/snapshots` 501, and Backups already says so on screen, so on the self-host
     that 501 is the host's word and not the product's error; anywhere else, or on any other path, a 501 is still red. */
  const unbuilt = failures.filter((f) => f?.status === 501);
  const allNotHere = selfHost && unbuilt.length > 0 && unbuilt.every((f) => f.path.replace(/\?.*$/u, '') === '/api/snapshots');
  return (shot?.consoleErrors ?? []).filter(
    (e) =>
      !(allOwn && /^Failed to load resource: .*status of 403\b/u.test(String(e))) &&
      !(allNotHere && /^Failed to load resource: .*status of 501\b/u.test(String(e))),
  );
}

/** What in one look is red: a sentence for each kind, with the screens it was seen on. Empty is green. */
export function judge(said, { selfHost = false } = {}) {
  const shots = Array.isArray(said?.shots) ? said.shots : [];
  if (shots.length === 0) return ['the look drew no screen at all.'];
  const on = (pick) => [...new Set(shots.filter(pick).map((s) => `${s.name ?? s.screen} at ${s.width}`))];
  const lintOf = (s) => (s.lint !== null && s.lint !== undefined && (Array.isArray(s.lint) ? s.lint.length > 0 : Object.keys(s.lint).length > 0)) || Object.keys(s.raw ?? {}).length > 0;
  const red = [];
  const refused = on((s) => s.settled === 'refused' || s.settled === null || s.settled === undefined);
  if (refused.length > 0) red.push(`a screen refused or never settled: ${refused.slice(0, 6).join(', ')}${refused.length > 6 ? ` and ${refused.length - 6} more` : ''}.`);
  const errors = on((s) => productErrors(s, { selfHost }).length > 0);
  if (errors.length > 0) red.push(`the console said an error on ${errors.slice(0, 6).join(', ')}${errors.length > 6 ? ` and ${errors.length - 6} more` : ''}.`);
  const lint = on(lintOf);
  if (lint.length > 0) red.push(`a lint finding on ${lint.slice(0, 6).join(', ')}${lint.length > 6 ? ` and ${lint.length - 6} more` : ''}.`);
  return red;
}

/** The look's command line for where the canary is. */
export const argsFor = (live, out) => [join(ROOT, 'tools', 'look', 'run.mjs'), '--source', live ? 'canary' : 'canary:self-host', '--set', 'all', '--out', out];

async function main(env = process.env) {
  const place = where({ ...env, CANARY_ORIGIN: env.CANARY_ORIGIN || (env.DEPLOY_HOST ? `https://${env.DEPLOY_HOST}` : '') });
  const out = join(String(env.LANE_OUT ?? '').trim() || join(tmpdir(), 'braindog-canary'), 'look');
  const file = place.live ? sessionPath(env) : null;
  const cookie = file ? cookieFor(JSON.parse(await readFile(file, 'utf8').catch(() => '{}')), place.origin) : null;
  /* A said.json left by an earlier look in the same folder would be judged as this one's. */
  rmSync(join(out, 'said.json'), { force: true });
  try {
    const run = spawnSync(process.execPath, argsFor(place.live, out), {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...env, ...(place.live ? { CANARY_SESSION: file, CANARY_ORIGIN: place.origin } : {}) },
      timeout: 12 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    let said = null;
    try {
      said = JSON.parse(readFileSync(join(out, 'said.json'), 'utf8'));
    } catch {
      console.error(`  look: it left no said.json in ${out}, so nothing it drew can be judged.`);
      return 1;
    }
    const red = judge(said, { selfHost: !place.live });
    const named = place.live ? `the canary ${place.slug}` : `a fresh self-host, ${SELF_HOST_ONLY}`;
    if (red.length > 0 || run.status !== 0) {
      console.error(`  look, on ${named}: red.`);
      for (const r of red) console.error(`      ${r}`);
      if (run.status !== 0 && red.length === 0) console.error(`      the look itself ended with ${run.status ?? 'a timeout'}.`);
      return 1;
    }
    console.log(`  look, on ${named}: ${said.shots.length} pictures, no refused screen, no console error, no lint finding. The sheet is in ${out}.`);
    return 0;
  } finally {
    if (file) await endSession(place.origin, cookie, file);
  }
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`  look stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
