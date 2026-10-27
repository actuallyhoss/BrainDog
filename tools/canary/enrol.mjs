/**
 * The canary's sitting: the one time a person makes the credentials the lane after a deploy signs in with
 * (`loop/scope/area-proof-a.md`, PRF-A09 job 1).
 *
 *   node tools/canary/enrol.mjs            on his Mac, by him, once: app.brain.dog, the record `ops`
 *   node tools/canary/enrol.mjs --dry      every step against a fresh local self-host, and what it would set
 *
 * RUN BY THE OWNER, NEVER BY AN AGENT. No agent mints anything: every credential here is made in the owner's sitting,
 * in a browser window the owner watches, and goes from this process straight into `gh` on its standard input. Nothing here prints one,
 * whole or in part, and nothing writes one to a file.
 *
 * WHAT HAPPENS, IN ORDER:
 *   1. Chromium opens with a virtual authenticator, as the passkey gate's does (`tools/gates/passkey.mjs`), so the
 *      passkey it makes can be read back and stored, which a real device's never can.
 *   2. He signs up for the free record `ops` on app.brain.dog in that window, with an address he reads, and pastes the
 *      one link the mail brings into the same tab (the authenticator belongs to that tab). The script waits until the
 *      host says he owns `ops`. Under `--dry` the self-host's server key stands in for the mail.
 *   3. Through Settings, Recovery, "Add a passkey", the app adds the canary's one passkey; the script reads it back
 *      with `WebAuthn.getCredentials` and keeps it as `CANARY_PASSKEY` (`packCredential` in `./lib.mjs`, the shape
 *      `tools/gates/signin-live.mjs` reads).
 *   4. The smoke's key: the record's own `createToken`, the method Settings' Agents screen calls, at `propose`, the
 *      scope the script smoke needs (`.github/workflows/deploy.yml`), for a year. The owner's screen mints only at
 *      `write`, so the narrower key is asked of the same method in the same signed-in tab rather than taken wider.
 *   5. `gh secret set CANARY_PASSKEY` and `gh secret set SMOKE_TOKEN` in the environment `production`, each value on
 *      standard input; `gh variable set SMOKE_SLUG`. Then the one line for `OPS_RECORD` in
 *      `apps/worker/wrangler.jsonc`, which is the record's id, read off the front of the key and never the key.
 *   6. Signed out through the product's own door, and the window closed.
 *
 * EXIT CODES: 0 set (or, under `--dry`, every step passed and what it would set was printed); 1 a step did not hold;
 * 3 `--dry` with no built app to serve.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { copy } from '../../apps/web/src/lib/copy.ts';

import { appSelfHost, LIVE_ORIGIN, packCredential, SELF_HOST_ONLY, SLUG } from './lib.mjs';

/** The canary's name, as the scope gives it. */
export const CANARY = 'ops';

/** The GitHub environment the lane and the deploy read the canary's secrets in. */
export const ENVIRONMENT = 'production';

/** The smoke's key: its label as Settings lists it, its scope, and how long it lives (the longest a token may). */
export const SMOKE_KEY = { label: 'Deploy smoke', scope: 'propose', days: 365 };

/** How long the sitting waits for the mailed link to be opened, and any one step after it. */
const WAIT_MS = 20 * 60_000;
const STEP_MS = 30_000;

/** `--dry`, `--slug <name>` and `--origin <https://host>`; anything else is a refusal, not a silence. */
export function parse(args) {
  const out = { dry: false, slug: CANARY, origin: LIVE_ORIGIN };
  for (let i = 0; i < args.length; i += 1) {
    const m = /^--(dry|slug|origin)(?:=(.*))?$/u.exec(args[i]);
    if (m === null) throw new Error(`The sitting takes --dry, --slug and --origin, and not ${args[i]}.`);
    if (m[1] === 'dry') out.dry = true;
    else out[m[1]] = m[2] ?? args[(i += 1)];
  }
  if (!SLUG.test(String(out.slug))) throw new Error(`${JSON.stringify(out.slug)} is not a record's name.`);
  out.origin = new URL(String(out.origin)).origin;
  if (!out.dry && !out.origin.startsWith('https://')) throw new Error(`${out.origin} is not https, and a passkey is made only for a secure name.`);
  return out;
}

/** The record's id, off the front of a key (`<record>.<secret>`), or a throw that quotes nothing of the key. */
export function recordIdOf(bearer) {
  const id = String(bearer ?? '').split('.')[0];
  if (!/^rec_[0-9A-Za-z]{10,40}$/u.test(id) || !String(bearer).startsWith(`${id}.`)) throw new Error('The key the record made is not shaped <record>.<secret>, so the record it opens cannot be named.');
  return id;
}

/** The one line for production's vars in `apps/worker/wrangler.jsonc`. */
export const opsLine = (id) => `"OPS_RECORD": "${id}"`;

/** What the sitting sets, in order. Each value is held here and handed to `gh`; `said` describes it without it. */
export function planOf({ passkey, bearer, slug, ends }) {
  return [
    { kind: 'secret', name: 'CANARY_PASSKEY', value: passkey, what: `the one passkey of ${slug}` },
    { kind: 'secret', name: 'SMOKE_TOKEN', value: bearer, what: `a key on ${slug} that can propose, until ${String(ends ?? '').slice(0, 10) || 'a year from now'}` },
    { kind: 'variable', name: 'SMOKE_SLUG', value: slug, what: 'the canary the lane asks' },
  ];
}

/** One step of the plan as a person reads it: a secret by what it is and its length, never its value. */
export const said = (step) =>
  step.kind === 'secret' ? `the secret ${step.name}, ${step.what} (${step.value.length} characters, not shown)` : `the variable ${step.name} = ${step.value}, ${step.what}`;

/**
 * `gh`, with a value on standard input and never in its arguments, where `ps` and a shell's history would see it.
 * `{ ok, why }`, `why` being the first line `gh` said on failure, which names the setting and not its value.
 */
export function gh(args, input) {
  const run = spawnSync('gh', args, { input: input ?? '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
  if (run.error) return { ok: false, why: 'gh could not be run. Install the GitHub CLI and sign in with gh auth login.' };
  return { ok: run.status === 0, why: (run.stderr ?? '').trim().split('\n')[0] ?? '' };
}

/** The plan handed to `gh` in `environment`. Answers the lines it said; throws on the first that did not hold. */
export function handOver(plan, { run = gh, environment = ENVIRONMENT } = {}) {
  const lines = [];
  for (const step of plan) {
    const out =
      step.kind === 'secret'
        ? run(['secret', 'set', step.name, '--env', environment], step.value)
        : run(['variable', 'set', step.name, '--env', environment, '--body', step.value]);
    if (!out.ok) throw new Error(`gh did not set ${step.name}: ${out.why || 'it said nothing'}. Nothing after it was set.`);
    lines.push(`set ${said(step)}`);
  }
  return lines;
}

/** The app's address for a screen of the canary: under its name live, at the root on a self-host's one record. */
const appAt = (origin, slug, path = '') => `${origin}/app/${slug ? `${slug}/` : ''}${path}`;

/** A virtual authenticator on `page`, unlocked, as the passkey gate makes one. `{ cdp, authenticatorId }`. */
export async function authenticatorOn(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

/**
 * STEP 2 LIVE: wait until the browser is signed in as the owner of `slug`, which is what the mailed link does once it
 * is opened in this window. `ask` is `GET /account/records` with the window's cookies; a test hands in a stub.
 */
export async function waitForOwner(ask, slug, { waitMs = WAIT_MS, everyMs = 2_000, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const until = now() + waitMs;
  while (now() < until) {
    const said = await ask().catch(() => null);
    const owned = Array.isArray(said?.value) ? said.value.find((r) => r?.slug === slug) : undefined;
    if (owned?.level === 'owner') return;
    if (owned !== undefined) throw new Error(`This window is signed in to ${slug}, and not as its owner, so the canary's credentials cannot be made here.`);
    await sleep(everyMs);
  }
  const minutes = Math.round(waitMs / 60_000);
  throw new Error(`Nobody signed in as the owner of ${slug} in ${minutes} minute${minutes === 1 ? '' : 's'}, so nothing was made. Run the sitting again.`);
}

/** STEP 2 UNDER `--dry`: in by the self-host's server key, the only door open on its first run. */
async function inByKey(page, origin, key) {
  await page.goto(`${origin}/app/signin`, { waitUntil: 'networkidle', timeout: STEP_MS });
  await page.locator('#in-key').fill(key);
  await page.locator('#in-key').press('Enter');
  await page.locator('.calm-who').first().waitFor({ timeout: STEP_MS });
}

/** STEP 3: the passkey, added through Settings, Recovery, and read back. The packed credential. */
async function addPasskey(page, { cdp, authenticatorId }, origin, slug) {
  await page.goto(appAt(origin, slug, 'settings/recovery'), { waitUntil: 'networkidle', timeout: STEP_MS });
  await page.getByRole('button', { name: copy.addPasskey, exact: true }).click({ timeout: STEP_MS });
  await page.getByText(copy.passkeyAdded, { exact: true }).first().waitFor({ timeout: STEP_MS });
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  if (credentials.length !== 1) throw new Error(`The browser holds ${credentials.length} passkeys after adding one, so which is the canary's is not known.`);
  return packCredential(credentials[0]);
}

/** STEP 4: the smoke's key, from the record's own `createToken` in the signed-in tab. `{ bearer, ends }`. */
async function makeKey(page, origin, slug) {
  const url = `${origin}${slug ? `/app/${slug}` : ''}/api/createToken`;
  const out = await page.evaluate(
    async ({ url, body }) => {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
      return { status: res.status, said: await res.json().catch(() => null) };
    },
    { url, body: SMOKE_KEY },
  );
  if (out.said?.ok !== true) throw new Error(`The record did not make the smoke's key: ${out.said?.refusal?.fix ?? `it answered ${out.status}`}`);
  return { bearer: out.said.value.bearer, ends: out.said.value.expires_at };
}

/** And the key opens the canary: `boot` with it alone, as the smoke asks. */
async function keyOpens(origin, slug, bearer, send = fetch) {
  const res = await send(`${origin}${slug ? `/app/${slug}` : ''}/api/boot`, { headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' }, redirect: 'error' }).catch(() => null);
  if (res?.status !== 200) throw new Error(`The smoke's key was made and ${slug ?? 'the record'} answered ${res?.status ?? 'nothing'} to it, so it would not open the canary.`);
}

/** The sitting, live or `--dry`. Answers the exit code; every line goes to `say`. */
export async function enrol({ dry, slug, origin }, { say = console.log, run = gh, root = join(import.meta.dirname, '..', '..') } = {}) {
  const build = join(root, 'apps', 'web', 'build');
  if (dry && !existsSync(join(build, 'app', 'index.html'))) {
    say(`  enrol --dry, ${SELF_HOST_ONLY}: there is no apps/web/build to serve, so nothing was driven. Run pnpm --filter @braindog/web build first.`);
    return 3;
  }
  const { chromium } = await import('@playwright/test');
  const host = dry ? await appSelfHost(build) : null;
  const at = dry ? host.origin : origin;
  const name = dry ? null : slug;
  let browser = null;
  try {
    browser = await chromium.launch({ headless: dry });
    const context = await browser.newContext();
    const page = await context.newPage();
    const authenticator = await authenticatorOn(context, page);
    if (dry) await inByKey(page, at, host.key);
    else {
      await page.goto(`${at}/app/signup`, { waitUntil: 'domcontentloaded', timeout: STEP_MS });
      say(`  In the window: sign up for a free record named ${slug} with an address you read, then paste the one link the mail brings into the same tab.`);
      await waitForOwner(async () => (await context.request.get(`${at}/account/records`, { headers: { accept: 'application/json' } })).json(), slug);
      say(`  signed in as the owner of ${slug}.`);
    }
    const passkey = await addPasskey(page, authenticator, at, name);
    say('  the passkey was added through Settings, Recovery, and read back.');
    const { bearer, ends } = await makeKey(page, at, name);
    await keyOpens(at, name, bearer);
    say(`  the smoke's key was made at ${SMOKE_KEY.scope} and opens ${dry ? 'the self-host' : slug}.`);
    const plan = planOf({ passkey, bearer, slug: dry ? host.slug : slug, ends });
    const line = opsLine(recordIdOf(bearer));
    await context.request.post(`${at}/auth/logout`, { headers: { origin: at }, data: {} }).catch(() => {});
    if (dry) {
      say(`  enrol --dry, ${SELF_HOST_ONLY}: every step held on ${at}. It would set, in the environment ${ENVIRONMENT}:`);
      for (const step of plan) say(`    ${said(step)}`);
      say(`  and print, for production's vars in apps/worker/wrangler.jsonc: ${line}`);
      return 0;
    }
    for (const l of handOver(plan, { run })) say(`  ${l}`);
    say(`  Put this line in production's vars in apps/worker/wrangler.jsonc, in place of the empty one: ${line}`);
    return 0;
  } finally {
    await browser?.close().catch(() => {});
    await host?.close();
  }
}

if (import.meta.main) {
  let asked;
  try {
    asked = parse(process.argv.slice(2));
  } catch (e) {
    console.error(`  enrol refused: ${e.message}`);
    process.exit(1);
  }
  enrol(asked).then(
    (code) => (process.exitCode = code),
    (e) => {
      /* The first line only: a browser error can quote the page, and the page held the key a moment before. */
      console.error(`  enrol stopped${asked.dry ? `, ${SELF_HOST_ONLY}` : ''}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
}
