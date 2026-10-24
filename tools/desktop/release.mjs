#!/usr/bin/env node
/**
 * BrainDog.dmg (E51): builds the Mac app, signs and notarises it when this Mac holds a Developer ID, and lays the
 * download and the update feed where the site's next deploy publishes them (`brain.dog/desktop/`).
 *
 *   node tools/desktop/release.mjs                 build for this Mac's chip
 *   node tools/desktop/release.mjs --universal     Apple silicon and Intel in one app (needs both Rust targets)
 *   node tools/desktop/release.mjs --stage         and, once it is notarised, lay it in the site for the next deploy
 *   node tools/desktop/release.mjs --dry-run       say what it would do, and build nothing
 *
 * TWO KINDS OF BUILD, AND IT SAYS WHICH IT MADE. With a "Developer ID Application" identity in the keychain
 * (`security find-identity -p codesigning`, the owner's Apple sitting, E49) and notarisation's account in the
 * environment or in `apps/desktop/src-tauri/signing.env` (kept out of git, `signing.example.env` lists the names), the
 * app is signed, notarised and stapled, and `spctl` must accept it before anything is staged. With none, it builds an
 * UNSIGNED dmg: it runs on the Mac that built it, macOS refuses it anywhere else, and it is never staged.
 *
 * THE UPDATE IS ALWAYS SIGNED, by the updater key in the keychain (`tools/desktop/updater-key.mjs`, E50): the build
 * reads it into its own environment and `latest.json` carries the signature the app checks against its public key.
 *
 * STAGED, NOT DEPLOYED. `--stage` copies `BrainDog.dmg`, the update archive and `latest.json` into
 * `apps/site/static/desktop/` (out of git, as the CLI's copies are) and marks `apps/site/src/lib/desktop.ts`
 * notarised, which is what lets `/download` out of the site's held list (`launch.ts`). The site deploy publishes them;
 * this script never deploys and never prints a secret.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONF, KEYCHAIN, ROOT, TAURI_CLI, configPubkey, fromKeychain } from './updater-key.mjs';

const TAURI_DIR = join(ROOT, 'apps/desktop/src-tauri');
const DIST = join(ROOT, 'apps/desktop/dist');
const STAGE = join(ROOT, 'apps/site/static/desktop');
const MARK = join(ROOT, 'apps/site/src/lib/desktop.ts');
const SIGNING_ENV = join(TAURI_DIR, 'signing.env');
/** Where the update archive is fetched from, the same folder `latest.json` is read from (`plugins.updater.endpoints`). */
const PUBLIC = 'https://brain.dog/desktop';
const CARGO = join(process.env.HOME ?? '', '.cargo/bin');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const UNIVERSAL = args.has('--universal');
const say = (line) => console.log(`  ${line}`);
const stop = (line) => {
  say(line);
  process.exit(1);
};

/** The "Developer ID Application: ..." identity this Mac can sign with, or `null`. An Apple Development one is not it. */
export function developerId(listing) {
  const m = /"(Developer ID Application: [^"]+)"/u.exec(listing);
  return m ? m[1] : null;
}

/** The names `signing.env` sets, read as `KEY="value"` lines; comments and blanks ignored, nothing printed. */
export function envFile(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/u.exec(line);
    if (m && !line.trim().startsWith('#') && !/^<.*>$/u.test(m[2])) out[m[1]] = m[2];
  }
  return out;
}

/** The update feed the app reads: this version, the archive's address and its signature, for each chip it was built for. */
export function feedOf({ version, notes, at, signature, archive, universal, arch }) {
  const url = `${PUBLIC}/${archive}`;
  const chips = universal ? ['darwin-aarch64', 'darwin-x86_64'] : [arch === 'x64' ? 'darwin-x86_64' : 'darwin-aarch64'];
  return { version, notes, pub_date: at, platforms: Object.fromEntries(chips.map((c) => [c, { signature, url }])) };
}

/** The first file in a folder ending so, or `null`. */
const found = (dir, end) => (existsSync(dir) ? (readdirSync(dir).find((f) => f.endsWith(end)) ?? null) : null);

function main() {
  const conf = JSON.parse(readFileSync(CONF, 'utf8'));
  const version = conf.version;
  if (!configPubkey()) stop('the updater key is not made yet: run node tools/desktop/updater-key.mjs first.');
  const key = fromKeychain(KEYCHAIN.key);
  const keyPassword = fromKeychain(KEYCHAIN.password);
  if (key === null || keyPassword === null) stop('the updater key is not in this keychain: run node tools/desktop/updater-key.mjs on the Mac that made it.');
  if (!existsSync(join(CARGO, 'cargo')) && spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status !== 0)
    stop('Rust is not installed: see apps/desktop/README.md, Build.');

  const identity = developerId(spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).stdout ?? '');
  const notary = { ...(existsSync(SIGNING_ENV) ? envFile(readFileSync(SIGNING_ENV, 'utf8')) : {}), ...process.env };
  const notarises = identity !== null && Boolean(notary.APPLE_ID && notary.APPLE_PASSWORD && notary.APPLE_TEAM_ID);
  say(`BrainDog ${version} for ${UNIVERSAL ? 'Apple silicon and Intel' : `this Mac (${process.arch})`}`);
  say(identity === null ? 'no Developer ID in the keychain: building an UNSIGNED dmg, which runs only on this Mac' : `signing as ${identity}`);
  if (identity !== null) say(notarises ? 'notarising with the account in the environment' : 'no notarisation account (APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID): signed, NOT notarised');
  if (DRY) {
    say(`would run: npx ${TAURI_CLI} build --bundles app,dmg${UNIVERSAL ? ' --target universal-apple-darwin' : ''}`);
    return;
  }

  const env = {
    ...process.env,
    PATH: `${CARGO}:${process.env.PATH ?? ''}`,
    TAURI_SIGNING_PRIVATE_KEY: key,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: keyPassword,
    ...(identity !== null ? { APPLE_SIGNING_IDENTITY: identity } : {}),
    ...(notarises ? { APPLE_ID: notary.APPLE_ID, APPLE_PASSWORD: notary.APPLE_PASSWORD, APPLE_TEAM_ID: notary.APPLE_TEAM_ID } : {}),
  };
  const built = spawnSync('npx', ['--yes', TAURI_CLI, 'build', '--bundles', 'app,dmg', ...(UNIVERSAL ? ['--target', 'universal-apple-darwin'] : [])], {
    cwd: TAURI_DIR,
    env,
    stdio: 'inherit',
  });
  if (built.status !== 0) stop(`the build failed (exit ${built.status}).`);

  const bundle = join(TAURI_DIR, 'target', ...(UNIVERSAL ? ['universal-apple-darwin'] : []), 'release/bundle');
  const dmg = found(join(bundle, 'dmg'), '.dmg');
  const archive = found(join(bundle, 'macos'), '.app.tar.gz');
  const app = found(join(bundle, 'macos'), '.app');
  if (!dmg || !archive || !app) stop(`the build left no dmg, app or update archive under ${bundle}.`);
  const signature = readFileSync(join(bundle, 'macos', `${archive}.sig`), 'utf8').trim();

  mkdirSync(DIST, { recursive: true });
  copyFileSync(join(bundle, 'dmg', dmg), join(DIST, 'BrainDog.dmg'));
  copyFileSync(join(bundle, 'macos', archive), join(DIST, 'BrainDog.app.tar.gz'));
  const feed = feedOf({ version, notes: `BrainDog ${version}`, at: new Date().toISOString(), signature, archive: 'BrainDog.app.tar.gz', universal: UNIVERSAL, arch: process.arch });
  writeFileSync(join(DIST, 'latest.json'), `${JSON.stringify(feed, null, 2)}\n`);
  say(`built apps/desktop/dist/BrainDog.dmg, BrainDog.app.tar.gz and latest.json (the update signed by the updater key)`);

  /* NOTARISED IS WHAT GATEKEEPER SAYS, NOT WHAT THIS SCRIPT HOPED: the app must be accepted as a notarised Developer ID. */
  const checked = spawnSync('spctl', ['-a', '-vv', join(bundle, 'macos', app)], { encoding: 'utf8' });
  const verdict = `${checked.stdout ?? ''}${checked.stderr ?? ''}`;
  const accepted = checked.status === 0 && /accepted/u.test(verdict) && /Notarized Developer ID/u.test(verdict);
  if (!accepted) {
    say(identity === null ? 'UNSIGNED: Gatekeeper refuses it on any other Mac. Not staged for brain.dog; /download stays held.' : 'NOT NOTARISED: Gatekeeper did not accept it. Not staged for brain.dog; /download stays held.');
    if (args.has('--stage')) process.exitCode = 1;
    return;
  }
  if (spawnSync('xcrun', ['stapler', 'staple', join(DIST, 'BrainDog.dmg')], { stdio: 'ignore' }).status !== 0) say('the dmg could not be stapled; the app inside it is.');
  say('accepted: notarised Developer ID');
  if (!args.has('--stage')) return;
  mkdirSync(STAGE, { recursive: true });
  for (const f of ['BrainDog.dmg', 'BrainDog.app.tar.gz', 'latest.json']) copyFileSync(join(DIST, f), join(STAGE, f));
  writeFileSync(MARK, readFileSync(MARK, 'utf8').replace(/DESKTOP_NOTARIZED: boolean = false/u, 'DESKTOP_NOTARIZED: boolean = true'));
  say('staged in apps/site/static/desktop/ and marked notarised in apps/site/src/lib/desktop.ts: /download opens with the next site deploy.');
  say('commit desktop.ts with a changelog entry saying the Mac app can be downloaded, then deploy.');
}

if (process.argv[1]?.endsWith('release.mjs')) main();
