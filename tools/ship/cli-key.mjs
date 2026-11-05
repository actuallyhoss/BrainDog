#!/usr/bin/env node
/**
 * Make the key the CLI's releases are signed with, on the Mac that releases. `apps/cli/src/release-key.ts` says why.
 *
 *   node tools/ship/cli-key.mjs            make the first key, keep it, pin it
 *   node tools/ship/cli-key.mjs --again    a further key beside the ones pinned: on a second Mac, or when this Mac's is lost
 *
 * IT MAKES AN ED25519 PAIR AND KEEPS THE PRIVATE HALF ONLY IN THIS MAC'S LOGIN KEYCHAIN, as the generic password item
 * `braindog-cli-release`. The value goes to `security -i` on a pipe, as a line of its own input, so it is on no argument and `ps` never
 * shows it; it is in no file and it is never printed. What `security` answers is not taken on trust: the item is read back and compared
 * before anything is pinned. IT NEVER REPLACES AN ITEM: `security` is not given `-U`, and one already here stops this first.
 *
 * Only then is the public half written where it is pinned: `apps/cli/src/release-key.ts`, `apps/site/static/cli/install.sh` and
 * `install.ps1`, and the list published in `apps/cli/README.md`. Commit them, and the next release signs. WHAT A LOST KEY COSTS,
 * and how a second Mac saves it, is in that README.
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
const README = `${ROOT}/apps/cli/README.md`;
const { RELEASE_KEYS, RELEASE_LABEL } = await import(pathToFileURL(TS).href);

const stop = (line) => {
  stderr.write(`${line}\n`);
  exit(1);
};

const again = argv.includes('--again');
if (argv.slice(2).some((a) => a !== '--again')) stop('cli-key.mjs takes --again, and nothing else.');
if (RELEASE_KEYS.length > 0 && !again) stop('A key is already pinned in apps/cli/src/release-key.ts, so nothing was made. A further key, on a second Mac or for a lost one: node tools/ship/cli-key.mjs --again');

/** The item's value as this Mac's keychain holds it, on a pipe, or `null`. */
const read = () => {
  const out = spawnSync('security', ['find-generic-password', '-s', RELEASE_LABEL, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 });
  return out.status === 0 ? out.stdout.trim() : null;
};

const asked = spawnSync('security', ['find-generic-password', '-s', RELEASE_LABEL], { stdio: 'ignore', timeout: 60_000 });
if (asked.error) stop('There is no macOS keychain here, and the key lives in one, so nothing was made.');
if (asked.status === 0) stop(`This Mac already holds ${RELEASE_LABEL}, and this never replaces one, so nothing was made or pinned. A further key is made on a second Mac.`);

const { privateKey } = generateKeyPairSync('ed25519');
const x = createPublicKey(privateKey).export({ format: 'jwk' }).x;
const value = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
/* WHAT `security -i` SAYS IS NEVER SHOWN, whatever it says: it was given the value. */
spawnSync('security', ['-i'], { input: `add-generic-password -a braindog -s ${RELEASE_LABEL} -l "BrainDog CLI release signing key" -w "${value}"\n`, stdio: ['pipe', 'ignore', 'ignore'], timeout: 60_000 });
if (read() !== value) stop(`The login keychain did not keep the key, so nothing was pinned and the key is gone. Unlock it and run this again. Nothing else changed.`);

const keys = [...RELEASE_KEYS, x];
const swap = (file, from, to) => {
  const was = readFileSync(file, 'utf8');
  const now = was.replace(from, to);
  if (now === was) throw new Error(`${file} has no pin to write.`);
  writeFileSync(file, now);
};
swap(TS, /^export const RELEASE_KEYS: readonly string\[\] = \[.*\];$/mu, `export const RELEASE_KEYS: readonly string[] = [${keys.map((k) => `'${k}'`).join(', ')}];`);
swap(SH, /^PIN='[^']*'$/mu, `PIN='${keys.join(' ')}'`);
swap(PS, /^ {2}\$pin = '[^']*'$/mu, `  $pin = '${keys.join(' ')}'`);
swap(README, /<!-- release-keys -->[\s\S]*?<!-- \/release-keys -->/u, () => `<!-- release-keys -->\n${keys.map((k) => `- \`${k}\``).join('\n')}\n<!-- /release-keys -->`);
stdout.write(
  [
    `The key is in this Mac's login keychain as ${RELEASE_LABEL}, and its public half is pinned:`,
    `  ${x}`,
    'Commit these, and the next release signs:',
    '  git add apps/cli/src/release-key.ts apps/cli/README.md apps/site/static/cli/install.sh apps/site/static/cli/install.ps1',
    '',
  ].join('\n'),
);
