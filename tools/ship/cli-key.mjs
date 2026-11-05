#!/usr/bin/env node
/**
 * Make the key the CLI's releases are signed with, once, on the owner's own machine. `apps/cli/src/release-key.ts` says why.
 *
 *   node tools/ship/cli-key.mjs            make it, keep it, pin it
 *   node tools/ship/cli-key.mjs --again    a new key beside the old pin, when the old one was lost or is being retired
 *
 * IT MAKES AN ED25519 PAIR, PIPES THE PRIVATE HALF INTO `braindog keys put` AND FORGETS IT. It is on no argument and in no file,
 * and it is never printed. Only once the Keychain has taken it is the public half written, into the three places it is pinned:
 * `apps/cli/src/release-key.ts`, `apps/site/static/cli/install.sh` and `install.ps1`. Commit them; a build signs from then on.
 *
 * A LOST KEY COSTS A REINSTALL AND NOTHING ELSE: `--again` pins a new one beside it, and a machine still on the old pin takes the
 * new build by running the install line once.
 */

import { spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = env.BRAINDOG_SIGN_ROOT ?? fileURLToPath(new URL('../../', import.meta.url));
const TS = `${ROOT}/apps/cli/src/release-key.ts`;
const SH = `${ROOT}/apps/site/static/cli/install.sh`;
const PS = `${ROOT}/apps/site/static/cli/install.ps1`;
const { RELEASE_KEYS, RELEASE_LABEL } = await import(pathToFileURL(TS).href);

const again = argv.includes('--again');
if (argv.slice(2).some((a) => a !== '--again')) {
  stderr.write('cli-key.mjs takes --again, and nothing else.\n');
  exit(1);
}
if (RELEASE_KEYS.length > 0 && !again) {
  stderr.write(`A signing key is already pinned in apps/cli/src/release-key.ts, so nothing was made. To pin a new one beside it: node tools/ship/cli-key.mjs --again\n`);
  exit(1);
}

const { privateKey } = generateKeyPairSync('ed25519');
const x = createPublicKey(privateKey).export({ format: 'jwk' }).x;
const held = spawnSync('braindog', ['keys', 'put', RELEASE_LABEL, '--opens', 'CLI releases at brain.dog/cli', '--keychain', '*'], {
  input: `${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}\n`,
  encoding: 'utf8',
  env,
  timeout: 150_000,
  stdio: ['pipe', 'pipe', 'pipe'],
});
if (held.status !== 0) {
  const said = `${held.stdout ?? ''}\n${held.stderr ?? ''}`.split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(-3);
  stderr.write(
    [
      'The Keychain did not take the key, so nothing was pinned and the key is gone.',
      held.error ? '  There is no braindog command on this PATH.' : '',
      ...said.map((l) => `  braindog said: ${l}`),
      `Sign in for keys, approve it in BrainDog, and run this again:`,
      `  braindog login <your BrainDog's address> --keychain '*'`,
      `  node tools/ship/cli-key.mjs${again ? ' --again' : ''}`,
      again ? `If the Keychain already holds ${RELEASE_LABEL}, delete it on the Keys screen first: an agent's access never replaces a key by its label from here.` : '',
    ]
      .filter((l) => l !== '')
      .join('\n') + '\n',
  );
  exit(1);
}

const keys = [...RELEASE_KEYS, x].slice(-2);
const swap = (file, from, to) => {
  const was = readFileSync(file, 'utf8');
  const now = was.replace(from, to);
  if (now === was) throw new Error(`${file} has no pin line to write.`);
  writeFileSync(file, now);
};
swap(TS, /^export const RELEASE_KEYS: readonly string\[\] = \[.*\];$/mu, `export const RELEASE_KEYS: readonly string[] = [${keys.map((k) => `'${k}'`).join(', ')}];`);
swap(SH, /^PIN='[^']*'$/mu, `PIN='${keys.join(' ')}'`);
swap(PS, /^ {2}\$pin = '[^']*'$/mu, `  $pin = '${keys.join(' ')}'`);
stdout.write(
  [
    `The key is in your Keychain as ${RELEASE_LABEL}, and its public half is pinned:`,
    `  ${x}`,
    'Commit these three, and publish the line above in the README, so somebody can check a script against it from somewhere that is not the site:',
    '  apps/cli/src/release-key.ts apps/site/static/cli/install.sh apps/site/static/cli/install.ps1',
    'Every deploy from then on signs the CLI, and asks for keychain access when it has run out.',
    '',
  ].join('\n'),
);
