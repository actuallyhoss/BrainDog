/**
 * The passkey ceremony, in a real browser, against a real record.
 *
 *   node tools/gates/passkey.mjs
 *
 * WHY THIS EXISTS. Sign-in is the one path where everything that can be tested cheaply already was,
 * and the thing itself still had never run. `packages/record/test/webauthn.test.ts` drives a software
 * authenticator against the verifier, and `apps/web/src/lib/auth.test.ts` drives the client with
 * `navigator.credentials` replaced by a fake. Both are green, and between them sits the part nobody
 * had exercised: a browser's own `navigator.credentials`, the challenge the host actually issued, the
 * origin and the RP ID the record actually computed, and the session cookie the answer actually set.
 * Every one of those is a place where the two halves can disagree while both test suites pass.
 *
 * SO THE GATE DOES WHAT A PERSON DOES, IN ORDER: arrives signed out, is not offered a passkey because
 * none exists, comes in through the self-host's server key, adds a passkey on the device, signs out,
 * and comes back in with the passkey alone. A run where any of those five is not true is red.
 *
 * THE AUTHENTICATOR IS CHROME'S OWN VIRTUAL ONE (`WebAuthn.addVirtualAuthenticator` over the DevTools
 * protocol), so the credential is made and asserted by the browser's WebAuthn stack rather than by
 * anything this repository wrote. That is the whole point: the code under test is the seam, and a
 * stand-in on either side of it would close the seam instead of measuring it.
 *
 * `localhost` AND NOT `127.0.0.1`, which is not a detail. An RP ID must be a registrable domain, and
 * an IP address is not one, so a ceremony driven at `http://127.0.0.1:<port>` fails in Chrome for a
 * reason that has nothing to do with this product. The self-host's default origin is already
 * `http://localhost:<port>`, and the record is told this gate's own port so the origin it checks and
 * the origin the page reports are the same string.
 *
 * ITS OWN EPHEMERAL PORT, so it never joins the queue for 5189 that the other browser gates share and
 * can be run by hand while a full `pnpm gates` is going.
 *
 * NO BEARER ON THE WIRE. `record.mjs` hands its server key to every `/api/*` request so a gate that
 * measures a screen reads the record as its owner. Here that would answer the question before it is
 * asked, so this gate forwards with `bearer: false` and the only way in is the one on screen.
 *
 * NO BUILD, NO RUN: it reports that it looked at nothing and exits 0, like the other browser gates, so
 * `pnpm gates` stays useful on a fresh checkout. A skip is printed, never passed off as a pass.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { copy } from '../../apps/web/src/lib/copy.ts';

import { forward, forwards, serverKeyFor, startRecord } from './record.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const ROOT = join(REPO, 'apps', 'web', 'build');

/** The one person `startRecord` puts in the Directory, and so the email the door must come back with. */
const OWNER = 'owner@the-studio.example';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

if (!(await stat(ROOT).catch(() => null))?.isDirectory()) {
  console.log('passkey: apps/web/build is not there, so nothing was driven. Build it with pnpm --filter @braindog/web build.');
  process.exit(0);
}

/** Every way this run fell short, said in the order it happened. */
const findings = [];

/* THE GATE'S OWN PORT FIRST, because the record is told the origin the browser will report, and that
   origin is this server's. */
let record = null;
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (forwards(url.pathname)) {
    if (record === null) return res.writeHead(503).end();
    return forward(req, res, record.base, { bearer: false });
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return res.writeHead(400).end();
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(ROOT, candidate);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) continue;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    return createReadStream(file).pipe(res);
  }
  /* The SPA fallback the deployed host serves, for the same reason `a11y` serves it. */
  if (!Object.hasOwn(TYPES, extname(rel)) && (await stat(join(ROOT, 'index.html')).catch(() => null))?.isFile()) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const ORIGIN = `http://localhost:${PORT}`;

record = await startRecord(0, { origin: ORIGIN });

/* THE RECORD IS THERE, ASKED THE WAY THIS GATE ASKS EVERYTHING ELSE. `record.mjs`'s own `answers` reads
   `/api/boot`, which a caller carrying nothing is rightly refused here, so a signed-out gate has to prove
   reachability at the door instead: the method list is what the screen itself reads first, and a run where
   the self-host's key is not offered would be measuring a page with no way in rather than a broken one. */
const door = await fetch(`${ORIGIN}/auth/methods`)
  .then((r) => r.json())
  .catch(() => null);
if (door?.ok !== true || door.value?.key !== true) {
  console.error(`
  passkey: ${ORIGIN}/auth/methods did not offer the self-host's key, so there is no door to drive: ${JSON.stringify(door)}`);
  await record.close();
  await new Promise((r) => server.close(r));
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable', { enableUI: false });

/**
 * A platform authenticator that is already unlocked. `automaticPresenceSimulation` is the user touching
 * it and `isUserVerified` is the fingerprint, because the thing being measured is the protocol, not
 * whether a headless run can produce a thumb.
 */
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const signedInAs = async () => (await page.locator('.calm-who').first().textContent().catch(() => null))?.trim() ?? null;
const button = (name) => page.getByRole('button', { name, exact: true });

try {
  /* ONE · ARRIVES SIGNED OUT, AND IS NOT OFFERED WHAT DOES NOT EXIST. A door that offers a passkey on a
     record that holds none sends the first person to a sheet that can only fail. */
  await page.goto(`${ORIGIN}/signin`, { waitUntil: 'networkidle' });
  await page.locator('#in-key').waitFor({ state: 'attached' });
  if ((await button(copy.withPasskey).count()) > 0) findings.push(`${copy.withPasskey} is offered on a record that holds no passkey, so the first person meets a sheet that can only fail.`);

  /* TWO · IN THROUGH THE SERVER KEY, which is the only door open on a self-host's first run. */
  const key = serverKeyFor(record.base);
  if (key === undefined) throw new Error('the gate’s record kept no server key, so there is no first door to come through');
  await page.locator('#in-key').fill(key);
  await page.locator('#in-key').press('Enter');
  await page.locator('.calm-who').first().waitFor();
  if ((await signedInAs()) !== OWNER) findings.push(`the server key let somebody in as ${await signedInAs()}, not ${OWNER}.`);

  /* THREE · ADDS A PASSKEY ON THIS DEVICE. The credential is made by Chrome, kept by the record. */
  await button(copy.addPasskeyHere).click();
  await page.getByText(copy.passkeyAdded, { exact: true }).waitFor();
  const made = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  if (made.credentials.length !== 1) findings.push(`the browser holds ${made.credentials.length} credential(s) after adding one, so the ceremony did not complete on the device.`);

  /* FOUR · SIGNS OUT, through the product's own door rather than by clearing a cookie, because the
     sentence being proved is that a person can leave and come back. */
  await button(copy.signOut).click();
  await page.locator('#in-key').waitFor({ state: 'attached' });

  /* FIVE · AND COMES BACK WITH THE PASSKEY ALONE. The reload is what re-asks `/auth/methods`: the door
     is drawn from what the record now holds, and a record that holds a passkey must offer it. */
  await page.reload({ waitUntil: 'networkidle' });
  if ((await button(copy.withPasskey).count()) === 0) {
    findings.push(`a record that holds a passkey does not offer ${copy.withPasskey}, so the passkey that was just added is unreachable.`);
  } else {
    await button(copy.withPasskey).click();
    await page.locator('.calm-who').first().waitFor();
    const back = await signedInAs();
    if (back !== OWNER) findings.push(`the passkey signed somebody in as ${back}, not ${OWNER}.`);

    /* AND THE RECORD SAYS IT WAS USED. A ceremony that verifies and leaves `lastUsed` empty is the half
       of the write path the screen would never show, and Settings lists exactly this. */
    const kept = await page.evaluate(() => fetch('/auth/passkeys').then((r) => r.json()));
    const list = kept?.ok === true ? kept.value : null;
    if (!Array.isArray(list) || list.length !== 1) findings.push(`the record lists ${Array.isArray(list) ? list.length : 'no'} passkey(s) for the person who just signed in with one.`);
    else if (list[0].lastUsed === null || list[0].lastUsed === undefined) findings.push('the passkey that just signed somebody in is still recorded as never used.');
  }
} catch (e) {
  findings.push(`the ceremony stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
} finally {
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
  await browser.close();
  await new Promise((r) => server.close(r));
  await record.close();
}

if (findings.length === 0) {
  console.log(`passkey: the five steps of the ceremony held at ${ORIGIN} (offered only when one exists, in by key, added, out, back in by passkey).`);
} else {
  console.error('\n  the passkey ceremony, driven in a real browser:');
  for (const f of findings) console.error(`      ${f}`);
  process.exitCode = 1;
}
