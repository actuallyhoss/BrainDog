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
 * NO BUILD, NO RUN: it reports that it looked at nothing and exits 3, which `run.mjs` counts as a skip
 * and not as a pass, so `pnpm gates` stays useful on a fresh checkout without the ceremony going green
 * on a run that never opened a browser.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { copy } from '../../apps/web/src/lib/copy.ts';

import { forward, forwards, serverKeyFor, startRecord } from './record.mjs';

/* THE PREREQUISITE, AND THIS IS ONE OF THE TWO GATES THAT PROVED IT HAD TO LEAVE THIS FILE. This
   gate exited 0 with no build for the whole of its first life: the ceremony reported green having
   never opened a browser, because the runner could read nothing but the exit code. `52 §5.1` step
   2 moves the question to `run.mjs`, which reads this line before it spawns anything, so there is
   no exit code in that path for this file to get wrong. The `stat(ROOT)` below stays for a person
   running the file by hand.

   AND IT IS READ OFF THE MODULE RATHER THAN OUT OF THIS TEXT (`52 §5.1` step 3). `run.mjs` imports
   this file and reads `mod.needs` before it calls the gate, so the declaration it acts on is the
   value the gate holds. Nothing here happens on that import: everything below is inside the
   function. */
export const needs = ['web-build'];

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

/**
 * THE WHOLE CEREMONY, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * WHY THIS ONE IS WORTH CALLING RATHER THAN SPAWNING, although it stands up a record, a server and a
 * browser: the prerequisite. This gate and `queue` are the two that exited 0 with no build, and the
 * whole of step 2 was written about them. Called, the `needs` the runner acts on is this module's own
 * value, read before a line of the gate has run, so the two accounts of what it cannot run without
 * cannot drift apart.
 *
 * IT OWNS A PORT, A RECORD AND A BROWSER, AND A CALLED GATE HAS TO GIVE THEM BACK. A spawned gate got
 * that for nothing, because the process ending closed everything it held; in this process a socket
 * left listening or a browser left running is a runner that never exits. Every path out of here goes
 * through ONE `finally`, and it is the only place any of them is closed: the door check below used to
 * close two of them itself before returning, which was right while the `finally` covered the ceremony
 * alone and is a double close now that it covers everything.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function passkey(root = join(import.meta.dirname, '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');

  /* EXIT 3 IS A SKIP, NOT A PASS. This exited 0 with no build, and 0 is what `run.mjs` counts as a
     gate that passed: a fresh checkout reported the passkey ceremony green having never opened a
     browser. A skip is the one thing the runner can be red about under CI, where the build always
     happened, so a skip there says the build did not and the ceremony went untested. */
  if (!(await stat(ROOT).catch(() => null))?.isDirectory()) {
    console.log('  passkey: no apps/web/build to drive, so nothing was driven. Run `pnpm --filter @braindog/web build` first.');
    return 3;
  }

  /** Every way this run fell short, said in the order it happened. */
  const findings = [];

  /* THE GATE'S OWN PORT FIRST, because the record is told the origin the browser will report, and that
     origin is this server's. */
  let record = null;
  /**
   * AND FROM HERE EVERY HANDLE IS GIVEN BACK EVEN WHEN THE SETUP THROWS, which is the half the
   * `try`/`finally` below the ceremony never covered.
   *
   * That block was real and is kept: a throw inside the five steps becomes a finding rather than a
   * crash. What it did not cover was everything BETWEEN the server and the first step, and that is
   * where the throws a run actually meets live: `startRecord` throws by contract when the seed is
   * refused (`record.mjs`), `chromium.launch()` throws where no browser is installed, and
   * `WebAuthn.addVirtualAuthenticator` throws on a Chrome without the domain. Each of those left this
   * gate's server listening and, for the later ones, the record answering too. Measured on 21 September
   * on `keys.mjs`, which had the same gap wider: a throw with the three handles open left its port
   * answering **HTTP 200**, a rebind came back **EADDRINUSE**, and the machine went from 18 browser
   * processes to 21. This gate takes an EPHEMERAL port, so what it leaked was never a collision, which
   * is exactly why it went unnoticed: it leaked a Chromium and a record per failed run instead.
   *
   * THE FOUR `let`s ARE FOR THE FINALLY, which has to hand back whatever exists at the moment of the
   * throw. `const` inside the block is out of scope there, and a hand-back that cannot see a
   * half-built browser is the defect this is repairing.
   */
  let server = null;
  let browser = null;
  let cdp = null;
  let authenticatorId = null;
  try {
    server = createServer(async (req, res) => {
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
      /* ONE LINE, AND IT USED TO BE TWO. The sentence opened with a bare newline inside the template and
         carried its own indentation on the next line, which is a string whose shape depends on the
         indentation of the code around it. Moving this gate into a function moved the text with it. */
      console.error(`\n  passkey: ${ORIGIN}/auth/methods did not offer the self-host's key, so there is no door to drive: ${JSON.stringify(door)}`);
      /* THE TWO CLOSES THAT STOOD HERE ARE GONE, and their absence is the repair rather than an omission:
         the `finally` below closes the record and the server on this path as well, and closing them twice
         would take `record.close()` through `sql.close()` on a database already closed, which throws
         `ERR_INVALID_STATE` out of `net`'s close callback where no `await` can catch it. Driven on
         21 September: a second `close()` on a gate's record kills the process. */
      return 1;
    }

    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });

    /**
     * A platform authenticator that is already unlocked. `automaticPresenceSimulation` is the user touching
     * it and `isUserVerified` is the fingerprint, because the thing being measured is the protocol, not
     * whether a headless run can produce a thumb.
     */
    ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    }));

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
      /* A THROW IN THE FIVE STEPS IS A FINDING AND NOT A CRASH, which is what this block was always for.
         It kept a `finally` of its own until 21 September; the hand-back moved OUT to the one that covers
         the setup as well, because a `finally` that starts after `chromium.launch()` cannot give back a
         browser the launch line itself left running. */
      findings.push(`the ceremony stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }

    if (findings.length === 0) {
      console.log(`passkey: the five steps of the ceremony held at ${ORIGIN} (offered only when one exists, in by key, added, out, back in by passkey).`);
    } else {
      console.error('\n  the passkey ceremony, driven in a real browser:');
      for (const f of findings) console.error(`      ${f}`);
      return 1;
    }
  } finally {
    /**
     * THE VIRTUAL AUTHENTICATOR, THE BROWSER, THE PORT AND THE RECORD, in that order, and one failure
     * may not cost the rest.
     *
     * Each is guarded on its own and each swallows its own failure, because an unguarded
     * `await browser.close()` on a browser that had already crashed rejects out of the `finally` and
     * leaves the port and the record exactly as leaked as before: the same defect one layer in. `cdp`
     * and `authenticatorId` are checked rather than assumed, since the run that threw in `launch()` has
     * neither.
     */
    if (cdp !== null && authenticatorId !== null)
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED` and the
   header documents `node tools/gates/passkey.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await passkey()) ?? 0;
