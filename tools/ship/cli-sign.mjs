#!/usr/bin/env node
/**
 * Sign the CLI at release: `apps/cli/dist/braindog.mjs.sig`, beside the bundle `bundle.mjs` just built (`deploy.yml`, "Build the
 * CLI for the site"). What it signs and why is `apps/cli/src/release-key.ts`.
 *
 *   node tools/ship/cli-sign.mjs            sign, or stop and say exactly what to run
 *   node tools/ship/cli-sign.mjs --check    whether the pin is there; opens no key (a dry run of the deploy)
 *
 * THE KEY NEVER LEAVES THE RECORD'S KEYCHAIN EXCEPT INTO THIS ONE PROCESS: `braindog keys exec` opens it by its label, counted as
 * a `grant.read`, and hands it to the second half of this file in one variable of its environment. Nothing here prints it,
 * writes it or passes it on an argument, and it is checked against the pin before the signature is kept, so a key that is not
 * the pinned one stops here and not on every machine that would refuse the build.
 *
 * NO KEY, NO PUBLISH. A build that cannot be signed stops the deploy before anything is uploaded. On a GitHub runner there
 * is no `braindog` and no keychain access, so `deploy.yml`'s job stops here too: a release is made from a machine the owner holds
 * (`tools/ship/deploy.mjs`).
 */

import { spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv, env, execPath, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* THE TREE IT WORKS ON, which a test points at a copy. */
const ROOT = env.BRAINDOG_SIGN_ROOT ?? fileURLToPath(new URL('../../', import.meta.url));
const { RELEASE_KEYS, RELEASE_LABEL, releaseMessage, signedBy } = await import(pathToFileURL(`${ROOT}/apps/cli/src/release-key.ts`).href);
const OUT = `${ROOT}/apps/cli/dist/braindog.mjs`;
const VARIABLE = 'BRAINDOG_CLI_SIGNING_KEY';
const MAKE = 'node tools/ship/cli-key.mjs';

const stop = (lines) => {
  stderr.write(`${lines.join('\n')}\n`);
  exit(1);
};

const facts = () => {
  if (!existsSync(OUT) || !existsSync(`${OUT}.build`)) stop(['There is no built CLI at apps/cli/dist to sign. Run pnpm --filter braindog-cli build first.']);
  return { sha: createHash('sha256').update(readFileSync(OUT)).digest('hex'), build: readFileSync(`${OUT}.build`, 'utf8').trim() };
};

const notPinned = [
  'The CLI cannot be signed, because no signing key has been made, so nothing was published.',
  'Make it once, on your own machine, and commit what it writes:',
  `  ${MAKE}`,
];

if (argv.includes('--from-env')) {
  /* THE SECOND HALF, under `braindog keys exec`. */
  const held = env[VARIABLE];
  if (!held) stop([`${VARIABLE} is not set, so there is nothing to sign with. This half runs only under braindog keys exec.`]);
  const { sha, build } = facts();
  let signature;
  try {
    const key = createPrivateKey({ key: Buffer.from(held, 'base64'), format: 'der', type: 'pkcs8' });
    signature = sign(null, releaseMessage(sha, build), key).toString('base64url');
  } catch {
    stop([`The key under ${RELEASE_LABEL} is not an Ed25519 private key, so nothing was signed. Replace it with ${MAKE}.`]);
  }
  if (!signedBy(RELEASE_KEYS, sha, build, signature))
    stop([`The key under ${RELEASE_LABEL} is not the one pinned in apps/cli/src/release-key.ts, so nothing was signed: every pinned command would refuse this build.`]);
  writeFileSync(`${OUT}.sig`, `${signature}\n`);
  stdout.write(`Signed ${build}.\n`);
  exit(0);
}

if (RELEASE_KEYS.length === 0) stop(notPinned);
if (argv.includes('--check')) {
  stdout.write(`The CLI is pinned to ${RELEASE_KEYS.length} key${RELEASE_KEYS.length === 1 ? '' : 's'}; a real deploy opens ${RELEASE_LABEL} here.\n`);
  exit(0);
}
facts();
const opened = spawnSync('braindog', ['keys', 'exec', RELEASE_LABEL, '--as', VARIABLE, '--keychain', '*', '--', execPath, fileURLToPath(import.meta.url), '--from-env'], {
  cwd: ROOT,
  encoding: 'utf8',
  env,
  timeout: 150_000,
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (opened.status === 0 && existsSync(`${OUT}.sig`)) {
  stdout.write(opened.stdout);
  exit(0);
}
const said = `${opened.stdout ?? ''}\n${opened.stderr ?? ''}`.split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(-3);
stop([
  `The CLI could not be signed with ${RELEASE_LABEL} from the Keychain, so nothing was published.`,
  opened.error ? 'There is no braindog command on this PATH. A release is made from a machine that has one.' : '',
  ...said.map((l) => `  braindog said: ${l}`),
  'If you have not signed in for keys on this machine, or that access ran out (seven days):',
  `  braindog login <your BrainDog's address> --keychain '*'`,
  'If the key was never made here, or it is gone:',
  `  ${MAKE} --again`,
].filter((l) => l !== ''));
