#!/usr/bin/env node
/**
 * The Mac app's updater key: makes the pair once, keeps the private half and its password in this Mac's
 * keychain, and writes the public half into `apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
 *
 *   node tools/desktop/updater-key.mjs            make it, unless the keychain and the config already hold one
 *   node tools/desktop/updater-key.mjs --check    say whether both halves are in place, and change nothing
 *
 * NOTHING SECRET IS PRINTED, WRITTEN TO THE TREE OR PASSED ON A COMMAND LINE. The pair is made into a folder only this
 * user can read, the private key and a random password go to the keychain through `security -i` on standard input,
 * and the files are overwritten and removed before the script says anything. `tools/desktop/release.mjs` reads both
 * back into the build's environment (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), so a build
 * signs `latest.json`'s update.
 *
 * A NEW PAIR IS NEVER MADE OVER AN OLD ONE: an app already installed trusts the public key it shipped with, so a second
 * key would leave every copy out there unable to update. `--force` is for a key that was lost, and it says so.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CONF = join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json');
/** The Tauri command line, pinned: the npm build carries the signer, so no Rust is needed to make a key. */
export const TAURI_CLI = '@tauri-apps/cli@2.12.1';
/** The keychain items, by service name, under one account. */
export const KEYCHAIN = { account: 'braindog', key: 'braindog-desktop-updater-key', password: 'braindog-desktop-updater-password' };
/** What the config holds until a key is made. */
export const PLACEHOLDER = /^REPLACE_WITH_/u;

/** Whether the keychain holds an item under this service, without reading its secret. */
export const inKeychain = (service) => spawnSync('security', ['find-generic-password', '-a', KEYCHAIN.account, '-s', service], { stdio: 'ignore' }).status === 0;

/** The secret under a service, for a build's environment only. `null` when the keychain holds none. */
export function fromKeychain(service) {
  const r = spawnSync('security', ['find-generic-password', '-a', KEYCHAIN.account, '-s', service, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.replace(/\n$/u, '') : null;
}

/** The public key the config holds, or `null` while it is the placeholder. */
export function configPubkey(conf = readFileSync(CONF, 'utf8')) {
  const key = JSON.parse(conf)?.plugins?.updater?.pubkey;
  return typeof key === 'string' && key !== '' && !PLACEHOLDER.test(key) ? key : null;
}

/** The config with `pubkey` set, every other byte as it was. */
export function withPubkey(conf, pubkey) {
  if (!/^[A-Za-z0-9+/=]+$/u.test(pubkey)) throw new Error('the public key is not base64');
  const out = conf.replace(/("pubkey"\s*:\s*)"[^"]*"/u, `$1"${pubkey}"`);
  if (out === conf && configPubkey(conf) !== pubkey) throw new Error('tauri.conf.json has no plugins.updater.pubkey to fill');
  return out;
}

/** Overwrites a file with zeros before it is removed, so the key is not left on the disk in the clear. */
function shred(file) {
  try {
    const size = statSync(file).size;
    const fd = openSync(file, 'r+');
    writeSync(fd, Buffer.alloc(size));
    closeSync(fd);
  } catch {
    /* gone already */
  }
  rmSync(file, { force: true });
}

function make() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-updater-'));
  chmodSync(dir, 0o700);
  const file = join(dir, 'braindog.key');
  const password = randomBytes(24).toString('base64url');
  try {
    /* `--ci` asks nothing; the password goes on the command line of a short-lived local process only, never printed. */
    const made = spawnSync('npx', ['--yes', TAURI_CLI, 'signer', 'generate', '--ci', '-w', file, '-p', password], { stdio: 'ignore' });
    if (made.status !== 0) throw new Error(`the Tauri signer did not make a key (exit ${made.status})`);
    const key = readFileSync(file, 'utf8').trim();
    const pub = readFileSync(`${file}.pub`, 'utf8').trim();
    if (!/^[A-Za-z0-9+/=]+$/u.test(key) || !/^[A-Za-z0-9+/=]+$/u.test(pub)) throw new Error('the signer wrote a key this script cannot read');
    /* INTO THE KEYCHAIN ON STANDARD INPUT, so neither secret is an argument another process could list. `-U` replaces. */
    const lines = [
      `add-generic-password -U -a ${KEYCHAIN.account} -s ${KEYCHAIN.key} -l "BrainDog Mac app updater key" -w ${key}`,
      `add-generic-password -U -a ${KEYCHAIN.account} -s ${KEYCHAIN.password} -l "BrainDog Mac app updater key password" -w ${password}`,
    ].join('\n');
    const kept = spawnSync('security', ['-i'], { input: `${lines}\n`, stdio: ['pipe', 'ignore', 'ignore'] });
    if (kept.status !== 0 || !inKeychain(KEYCHAIN.key) || !inKeychain(KEYCHAIN.password)) throw new Error('the keychain did not take the key');
    writeFileSync(CONF, withPubkey(readFileSync(CONF, 'utf8'), pub));
  } finally {
    shred(file);
    shred(`${file}.pub`);
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const held = inKeychain(KEYCHAIN.key) && inKeychain(KEYCHAIN.password);
  const pub = configPubkey();
  if (args.includes('--check')) {
    console.log(`  updater key: private half ${held ? 'in the keychain' : 'missing'}, public half ${pub ? 'in tauri.conf.json' : 'still the placeholder'}`);
    process.exitCode = held && pub ? 0 : 1;
    return;
  }
  if (held && pub && !args.includes('--force')) {
    console.log('  updater key: already made (keychain and tauri.conf.json). Nothing changed.');
    return;
  }
  if ((held || pub) && !args.includes('--force')) {
    console.log(`  updater key: half of it is here (${held ? 'the keychain' : 'tauri.conf.json'}) and half is not. A new pair would strand installed apps; run with --force only if the old key is lost.`);
    process.exitCode = 1;
    return;
  }
  make();
  console.log('  updater key: made. The private half and its password are in the keychain; the public half is in tauri.conf.json.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
