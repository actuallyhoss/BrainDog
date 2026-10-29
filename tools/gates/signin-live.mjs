/**
 * Sign-in on production, with the canary's own passkey, the way a person signs in.
 *
 *   CANARY_PASSKEY=<credential> DEPLOY_HOST=app.brain.dog SMOKE_SLUG=ops [CANARY_SESSION=<file>] node tools/gates/signin-live.mjs
 *   node tools/gates/signin-live.mjs                      (no credential: self-host only)
 *
 * WHY THIS EXISTS. The `passkey` gate proves the ceremony on a record it made a minute ago on localhost. After a deploy
 * nothing signed in anywhere: a Worker that answered every smoke question and refused every passkey on `brain.dog`
 * (an RP ID moved by the one-domain move, a challenge store that lost its binding, a cookie scoped to the old name)
 * was green. This opens the live sign-in, signs in to the canary with the passkey its owner made in that sitting,
 * waits for Today to settle, and signs out. Any of the four not true is red, and the lane after a deploy reads a red
 * here as it reads a red smoke: it starts the rollback that exists (`.github/workflows/after-deploy.yml`).
 *
 * THE CREDENTIAL IS THE BROWSER'S OWN, STORED. `tools/canary/enrol.mjs` adds the canary's passkey through the app's
 * own Settings in Chromium's virtual authenticator and reads it back with `WebAuthn.getCredentials`, as `passkey.mjs`
 * does; that answer is the secret `CANARY_PASSKEY`. Here it goes back into a fresh virtual authenticator with
 * `WebAuthn.addCredential`, so the ceremony is the browser's WebAuthn stack against the host's challenge, origin and
 * RP ID, and nothing this repository wrote stands in for either side. It is never printed, whole or in part.
 *
 * THE SIGN COUNT IS THE CLOCK'S, BECAUSE THE SECRET CANNOT REMEMBER. The verifier refuses a count that is not above
 * the last one it saw (`packages/record/src/webauthn.ts`, `count`), and a stored credential starts every run at the
 * count it was saved with, so the second run after the sitting would be refused as a cloned key. Seconds since 1970
 * rise between any two runs, fit the four bytes the count has until 2106, and are above any count a fresh passkey
 * reaches by hand.
 *
 * NO CREDENTIAL, SELF-HOST ONLY, AND IT SAYS SO. Until the owner's sitting
 * there is no canary, and this runs the same four steps against a fresh self-host in the job: in by the server key,
 * a passkey added on the device and read back, then a second browser with that credential alone. Its last line
 * starts `signin-live: self-host only`, which the lane reads as "not proven on brain.dog", never as green there.
 * ONCE `SMOKE_SLUG` IS SET, A MISSING CREDENTIAL IS RED: the canary exists, so the self-host would be a quiet skip.
 *
 * WITH `CANARY_SESSION` NAMING A FILE, a green live run signs in once more and leaves that session there for the look.
 *
 * EXIT CODES: nothing (a pass), 1 for a finding, 3 for no build to drive in self-host mode, which `run.mjs` counts
 * as a skip.
 */

import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { copy } from '../../apps/web/src/lib/copy.ts';

import { APP_BASE, appShell } from './lib.mjs';
import { forward, forwards, serverKeyFor, startRecord } from './record.mjs';

/* `web-build` FOR THE SELF-HOST HALF, which is every run until the sitting and every run of the `ci` build job. The
   live half needs no build, and runs from the lane directly rather than through the runner. */
export const needs = ['web-build'];

/** How long any one step may take before it is a finding, in milliseconds. */
const STEP_MS = 30_000;

/** The marker Today carries once its first read has completed (`apps/web/src/routes/+layout.svelte`). */
const SCREEN = 'main#main[data-screen]';

/** The fields `WebAuthn.addCredential` needs, every one a string but the two flags and the count. */
const FIELDS = ['credentialId', 'privateKey', 'rpId'];

/**
 * The stored credential, from the secret's text: the object `WebAuthn.getCredentials` returned for one credential,
 * that answer whole (`{ credentials: [one] }`), or either as base64. `{ ok, value }` or `{ ok: false, why }`, and the
 * `why` never quotes the text.
 */
export function readCredential(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: false, why: 'CANARY_PASSKEY is empty' };
  let parsed = null;
  for (const attempt of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try {
      parsed = JSON.parse(attempt);
      break;
    } catch {
      parsed = null;
    }
  }
  if (parsed === null || typeof parsed !== 'object') return { ok: false, why: 'CANARY_PASSKEY is not a credential the browser gave back (neither JSON nor base64 JSON)' };
  const list = Array.isArray(parsed.credentials) ? parsed.credentials : [parsed];
  if (list.length !== 1) return { ok: false, why: `CANARY_PASSKEY holds ${list.length} credentials, and the canary has one passkey` };
  const one = list[0];
  const missing = FIELDS.filter((field) => typeof one?.[field] !== 'string' || one[field] === '');
  if (missing.length > 0) return { ok: false, why: `CANARY_PASSKEY has no ${missing.join(', ')}, so it cannot be put back in an authenticator` };
  if (one.isResidentCredential !== true) return { ok: false, why: 'CANARY_PASSKEY is not a discoverable passkey, and the sign-in names no account before it asks' };
  return {
    ok: true,
    value: { credentialId: one.credentialId, isResidentCredential: true, rpId: one.rpId, privateKey: one.privateKey, userHandle: one.userHandle ?? '', signCount: 0 },
  };
}

/** The sign count this run asserts with: whole seconds since 1970, which rise between runs. */
export const liveCount = (now = Date.now()) => Math.floor(now / 1000);

/**
 * A fresh virtual authenticator holding `credential` at `liveCount(now)`, and its id. `cdp` is the page's DevTools
 * session; a test hands a stub that records what it was sent.
 */
export async function loadCredential(cdp, credential, now = Date.now()) {
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { ...credential, signCount: liveCount(now) } });
  return authenticatorId;
}

/**
 * THE FOUR STEPS, ON A PAGE WHOSE AUTHENTICATOR ALREADY HOLDS THE CREDENTIAL. `origin` is `https://app.brain.dog` or the
 * self-host's; `slug` is the canary's record, or `null` where the host answers `/` with the one record there is.
 * Returns the findings, in the order they happened; none is a pass. Every wait carries `STEP_MS`, so it cannot hang.
 *
 * IT ASKS THE PAGE FOR LITTLE: `goto`, `url`, `locator(...).first()` and `getByRole('button', ...)`, which is what
 * lets `test/signin-live.test.mjs` drive it with a stub page and no browser.
 */
export async function signInLive(page, { origin, slug = null }) {
  const findings = [];
  const button = (name) => page.getByRole('button', { name, exact: true });
  const signin = `${origin}${APP_BASE}/signin`;
  try {
    /* ONE · THE LIVE SIGN-IN OFFERS A PASSKEY. The canary holds one, so a door without the button is a door that has
       stopped reading what the record holds. */
    await page.goto(signin, { waitUntil: 'networkidle', timeout: STEP_MS });
    if ((await button(copy.withPasskey).count()) === 0) {
      findings.push(`the sign-in at ${signin} does not offer ${copy.withPasskey}, so the canary's passkey has no door.`);
      return findings;
    }

    /* TWO · IN WITH THE PASSKEY ALONE, and somebody is signed in. */
    await button(copy.withPasskey).click();
    const who = page.locator('.calm-who').first();
    await who.waitFor({ timeout: STEP_MS });
    if (((await who.textContent()) ?? '').trim() === '') findings.push('the passkey was accepted and the sign-in names nobody.');

    /* THREE · TODAY SETTLES. A full load, as the sign-in's own Open button makes one, and the record's first read
       completed: `ready` or `empty`. `refused` is the record saying no to the person who just signed in. */
    const today = `${origin}${APP_BASE}/${slug ? `${slug}/` : ''}`;
    await page.goto(today, { waitUntil: 'networkidle', timeout: STEP_MS });
    const screen = page.locator(SCREEN).first();
    await screen.waitFor({ timeout: STEP_MS });
    const settled = await screen.getAttribute('data-screen');
    if (settled !== 'ready' && settled !== 'empty') findings.push(`Today at ${today} settled as ${settled ?? 'nothing'}, not ready or empty, for the person who just signed in.`);
    const at = new URL(page.url()).pathname;
    if (slug && !at.startsWith(`${APP_BASE}/${slug}`)) findings.push(`Today opened at ${at}, not on the canary ${slug}.`);

    /* FOUR · OUT THROUGH THE PRODUCT'S OWN DOOR, and the door offers a way back in. */
    await page.goto(signin, { waitUntil: 'networkidle', timeout: STEP_MS });
    await button(copy.signOut).click();
    await button(copy.withPasskey).waitFor({ timeout: STEP_MS });
    if ((await page.locator('.calm-who').first().count()) > 0) findings.push('Sign out was pressed and the sign-in still names somebody.');
  } catch (e) {
    findings.push(`the sign-in stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
  return findings;
}

/**
 * AND THE SESSION THE LOOK SIGNS IN WITH (`tools/canary/lib.mjs`, `CANARY_SESSION`). The four steps end signed out,
 * and a signed-out session opens nothing, so after a green run on the canary this signs in once more with the same
 * authenticator, whose own count has risen past the last, and keeps that browser state in `file`, readable by this
 * user alone. Nothing of it is printed. `null` when kept, else the finding; the lane reads a missing session in the
 * look as red, so a sign-in that cannot be kept is said here, where it happened.
 */
export async function keepSession(page, context, { origin, file, write }) {
  const button = page.getByRole('button', { name: copy.withPasskey, exact: true });
  try {
    await page.goto(`${origin}${APP_BASE}/signin`, { waitUntil: 'networkidle', timeout: STEP_MS });
    await button.click();
    await page.locator('.calm-who').first().waitFor({ timeout: STEP_MS });
    await write(file, JSON.stringify(await context.storageState()), { mode: 0o600 });
    return null;
  } catch (e) {
    return `the second sign-in, kept for the look, did not hold: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

/**
 * A FRESH SELF-HOST'S REQUESTS: the built app, and the record behind it with no bearer on the wire, as `passkey.mjs`
 * serves one (its header says why). The server and the record are opened and given back by the gate itself, inside
 * its one `try` and its one `finally`, so a throw anywhere between them hands both back (`handles.test.mjs`).
 */
const serveBuild = (build, recordOf) => async (req, res) => {
  const record = recordOf();
  const url = new URL(req.url ?? '/', 'http://x');
  if (forwards(url.pathname)) return record === null ? res.writeHead(503).end() : forward(req, res, record.base, { bearer: false });
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return res.writeHead(400).end();
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(build, candidate);
    if (!(await stat(file).catch(() => null))?.isFile()) continue;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    return createReadStream(file).pipe(res);
  }
  if (!Object.hasOwn(TYPES, extname(rel))) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(appShell(build)).pipe(res);
  }
  res.writeHead(404).end();
};

/**
 * THE SITTING, IN MINIATURE, ON THE SELF-HOST: in by the server key, a passkey added on the device and read back the
 * way `enrol.mjs` reads the canary's, then out. The credential it answers is what the four steps load.
 */
async function enrolSelfHost(browser, origin, key) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await page.goto(`${origin}${APP_BASE}/signin`, { waitUntil: 'networkidle', timeout: STEP_MS });
    await page.locator('#in-key').fill(key);
    await page.locator('#in-key').press('Enter');
    await page.locator('.calm-who').first().waitFor({ timeout: STEP_MS });
    await page.getByRole('button', { name: copy.addPasskeyHere, exact: true }).click();
    await page.getByText(copy.passkeyAdded, { exact: true }).waitFor({ timeout: STEP_MS });
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    await page.getByRole('button', { name: copy.signOut, exact: true }).click();
    await page.locator('#in-key').waitFor({ state: 'attached', timeout: STEP_MS });
    return readCredential(JSON.stringify({ credentials }));
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * THE GATE, AS THE RUNNER CALLS IT AND AS THE LANE RUNS IT. `env` is the process's unless a test hands another.
 * Every handle it opens is given back in the one `finally`, for the reason `passkey.mjs` gives at length.
 */
export default async function signinLive(root = join(import.meta.dirname, '..', '..'), env = process.env) {
  const stored = String(env.CANARY_PASSKEY ?? '').trim();
  const slug = String(env.SMOKE_SLUG ?? '').trim();
  const host = String(env.SIGNIN_HOST ?? env.DEPLOY_HOST ?? '').trim();
  if (stored === '' && slug !== '') {
    console.error(`  signin-live: SMOKE_SLUG names the canary ${slug} and CANARY_PASSKEY is not set, so the canary exists and nobody signed in to it. Set the secret from the sitting again; a self-host run here would be a skip that reads as a pass.`);
    return 1;
  }
  const live = stored !== '';
  if (live && !/^[a-z0-9.-]+$/i.test(host)) {
    console.error('  signin-live: CANARY_PASSKEY is set and DEPLOY_HOST does not name a host, so there is no live sign-in to open.');
    return 1;
  }
  const build = join(root, 'apps', 'web', 'build');
  if (!live && !(await stat(build).catch(() => null))?.isDirectory()) {
    console.log('  signin-live: self-host only, and no apps/web/build to serve it, so nothing was driven. Run `pnpm --filter @braindog/web build` first.');
    return 3;
  }

  const { chromium } = await import('@playwright/test');
  let browser = null;
  let server = null;
  let record = null;
  const findings = [];
  let where = '';
  try {
    browser = await chromium.launch();
    let credential;
    let origin;
    if (live) {
      credential = readCredential(stored);
      origin = `https://${host}`;
      where = host;
    } else {
      server = createServer(serveBuild(build, () => record));
      await new Promise((r) => server.listen(0, r));
      origin = `http://localhost:${server.address().port}`;
      record = await startRecord(0, { origin });
      const key = serverKeyFor(record.base);
      where = `a fresh self-host at ${origin}`;
      if (key === undefined) throw new Error('the self-host kept no server key, so there is no first door to come through');
      credential = await enrolSelfHost(browser, origin, key);
    }
    if (!credential.ok) {
      findings.push(credential.why);
    } else {
      const context = await browser.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await loadCredential(cdp, credential.value);
      findings.push(...(await signInLive(page, { origin, slug: live ? slug || null : null })));
      const session = String(env.CANARY_SESSION ?? '').trim();
      if (live && session !== '' && findings.length === 0) {
        const kept = await keepSession(page, context, { origin, file: session, write: writeFile });
        if (kept !== null) findings.push(kept);
      }
      await context.close().catch(() => {});
    }
  } catch (e) {
    findings.push(`the run stopped before the sign-in: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  } finally {
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }

  const said = live ? `signin-live: on ${where}` : `signin-live: self-host only, on ${where}; brain.dog is not proven until the canary's sitting`;
  if (findings.length > 0) {
    console.error(`\n  ${said}, the sign-in did not hold:`);
    for (const f of findings) console.error(`      ${f}`);
    return 1;
  }
  console.log(`${said}: the passkey was offered, signed in${live && slug ? ` to ${slug}` : ''}, Today settled, and Sign out let go.`);
}

/* AND A SCRIPT, as the lane runs it. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await signinLive()) ?? 0;
