#!/usr/bin/env node
/**
 * Sign the CLI at release: `apps/cli/dist/braindog.mjs.sig`, beside the bundle `bundle.mjs` just built (`deploy.yml`, "Build the
 * CLI for the site"). What it signs and why is `apps/cli/src/release-key.ts`.
 *
 *   node tools/ship/cli-sign.mjs            sign, or stop and say the one command to run
 *   node tools/ship/cli-sign.mjs --check    whether a key is pinned and this Mac holds the item; opens no key (`deploy.mjs` before its first step)
 *
 * THE KEY IS IN THIS MAC'S LOGIN KEYCHAIN AND NOWHERE ELSE, the generic password item `braindog-cli-release`, which `cli-key.mjs` made.
 * It comes to this process on a pipe from `security`, and is never printed, written or passed on an argument. It is checked against the
 * pin before the signature is kept, so a key that is not a pinned one stops here and not on every machine that would refuse the build.
 *
 * NO KEY, NO PUBLISH, AND NO HALF A DEPLOY. `deploy.mjs` asks `--check` among its refusals, so with no key it stops before its first
 * step and says this file's one command. This step itself comes before anything is written anywhere (a test holds the order), so a key
 * that cannot be opened stops the deploy there too. The deploy never goes on without the CLI, because the site would then be published
 * with no `/cli/` files, and every install would fail. On a GitHub runner there is no keychain, so `deploy.yml`'s job stops here: a
 * release is made from the Mac that holds the key.
 */

import { spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* THE TREE IT WORKS ON, which a test points at a copy. */
const ROOT = env.BRAINDOG_SIGN_ROOT ?? fileURLToPath(new URL('../../', import.meta.url));
const { RELEASE_KEYS, RELEASE_LABEL, readSignature, releaseMessage, signedBy } = await import(pathToFileURL(`${ROOT}/apps/cli/src/release-key.ts`).href);
const OUT = `${ROOT}/apps/cli/dist/braindog.mjs`;
const MAKE = 'node tools/ship/cli-key.mjs';
const PINNED = 'git add apps/cli/src/release-key.ts apps/cli/README.md apps/site/static/cli/install.sh apps/site/static/cli/install.ps1';
/** `security`'s own answer for an item that is not there. */
const NOT_FOUND = 44;

const stop = (lines) => {
  stderr.write(`${lines.join('\n')}\n`);
  exit(1);
};

/** Whether the item is here, asked without its value: `security` prints the value only with `-w`. */
function held() {
  const asked = spawnSync('security', ['find-generic-password', '-s', RELEASE_LABEL], { stdio: 'ignore', timeout: 60_000 });
  if (asked.error) stop([`There is no macOS keychain here, so the CLI cannot be signed and nothing was published. A release is made from the Mac that holds ${RELEASE_LABEL}.`]);
  return asked.status !== NOT_FOUND;
}

/* THE ONE COMMAND, for each way there is no key to sign with. */
const here = held();
if (RELEASE_KEYS.length === 0) {
  if (here)
    stop([
      `This Mac holds ${RELEASE_LABEL}, and this tree pins no key, so the CLI cannot be signed and nothing was published. Commit what cli-key.mjs wrote:`,
      `  ${PINNED}`,
    ]);
  stop(['No key has been made for the CLI, so it cannot be signed and nothing was published. Run this on the Mac that releases, and commit what it writes:', `  ${MAKE}`]);
}
if (!here)
  stop([
    `This Mac does not hold ${RELEASE_LABEL}, so the CLI cannot be signed and nothing was published. Release from the Mac that holds it. If it is lost, apps/cli/README.md says what that costs, and this makes a new one:`,
    `  ${MAKE} --again`,
  ]);
if (argv.includes('--check')) {
  stdout.write(`The CLI is pinned to ${RELEASE_KEYS.length} key${RELEASE_KEYS.length === 1 ? '' : 's'}, and this Mac holds ${RELEASE_LABEL}.\n`);
  exit(0);
}

if (!existsSync(OUT) || !existsSync(`${OUT}.build`) || !existsSync(`${OUT}.released`)) stop(['There is no built CLI at apps/cli/dist to sign. Run pnpm --filter braindog-cli build first.']);
const sha = createHash('sha256').update(readFileSync(OUT)).digest('hex');
const build = readFileSync(`${OUT}.build`, 'utf8').trim();
const released = Number(readFileSync(`${OUT}.released`, 'utf8').trim());

const opened = spawnSync('security', ['find-generic-password', '-s', RELEASE_LABEL, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 });
if (opened.status !== 0 || !opened.stdout.trim())
  stop([`The login keychain did not open ${RELEASE_LABEL}, so nothing was signed or published. Unlock it, and allow security to read the item if macOS asks, then deploy again.`]);
let signature;
try {
  const key = createPrivateKey({ key: Buffer.from(opened.stdout.trim(), 'base64'), format: 'der', type: 'pkcs8' });
  signature = sign(null, releaseMessage(sha, build, released), key).toString('base64url');
} catch {
  stop([`${RELEASE_LABEL} is not an Ed25519 private key, so nothing was signed or published.`]);
}
const line = `${released}\n${signature}\n`;
if (!signedBy(RELEASE_KEYS, sha, build, released, readSignature(line).signature))
  stop([`${RELEASE_LABEL} is not a key pinned in apps/cli/src/release-key.ts, so nothing was signed or published: every pinned command would refuse this build.`]);
writeFileSync(`${OUT}.sig`, line);
stdout.write(`Signed ${build}.\n`);
