#!/usr/bin/env node
/**
 * BrainDog.dmg: builds the old Tauri shell, signs and notarises it when this Mac holds a Developer ID.
 *
 * IT PUBLISHES NOTHING. BrainDog for Mac is the native app in `apps/apple`, updated by Sparkle; this shell is kept for
 * Windows and Linux. A dmg sent up from here would land on the addresses the site names for the Mac app, so `--publish`,
 * `--stage` and `--upload-only` stop before anything happens (`NOT_PUBLISHED`), and `upload` stops again on its own.
 * What follows describes how a publish worked, for the day this shell has a Windows or Linux release of its own.
 *
 *   node tools/desktop/release.mjs                    build for this Mac's chip
 *   node tools/desktop/release.mjs --universal        Apple silicon and Intel in one app (needs both Rust targets)
 *   node tools/desktop/release.mjs --publish          and, once it is notarised, upload it and open /download
 *   node tools/desktop/release.mjs --upload-only      upload what apps/desktop/dist holds, building nothing: how a
 *                                                     --publish that stopped after its build is finished
 *   node tools/desktop/release.mjs --version 0.2.0    set the app's version first (tauri.conf.json and Cargo.toml)
 *   node tools/desktop/release.mjs --dry-run          say what it would do, and build nothing
 *
 * TWO KINDS OF BUILD, AND IT SAYS WHICH IT MADE. With a "Developer ID Application" identity in the keychain
 * (`security find-identity -p codesigning`, the owner's Apple sitting) and notarisation's account in the
 * environment or in `apps/desktop/src-tauri/signing.env` (kept out of git, `signing.example.env` lists the names), the
 * app is signed, notarised and stapled, and `spctl` must accept it before anything is published. With none, it builds
 * an UNSIGNED dmg: it runs on the Mac that built it, macOS refuses it anywhere else, and it is never published.
 *
 * PASSKEYS IN THE APP need its Associated Domains (`apps/desktop/src-tauri/Entitlements.plist`), which macOS honours
 * only with a provisioning profile that grants them. With the Developer ID profile at
 * `apps/desktop/src-tauri/BrainDog.provisionprofile` (out of git) or `BRAINDOG_PROVISION_PROFILE`, the build embeds it
 * and signs with the entitlements and the team's application identifier; without it the app is built without them,
 * since a build that claims them unprovisioned is killed at launch.
 *
 * THE UPDATE IS ALWAYS SIGNED, by the updater key in the keychain (`tools/desktop/updater-key.mjs`): the build
 * reads it into its own environment and `latest.json` carries the signature the app checks against its public key.
 *
 * WHERE IT IS PUBLISHED. The site deploys from git and the dmg is not in git, so a file laid in the site's folder never
 * reached brain.dog. The files go to the R2 bucket `braindog-desktop` instead, served at `download.brain.dog` (the
 * bucket's custom domain), and `apps/site/static/_redirects` sends `brain.dog/desktop/*` there, so the addresses the app
 * and the site already name (`latest.json`, `BrainDog.dmg`) never change. The update archive is named by version, so a
 * cached older archive is never read against a newer signature. `latest.json` goes last, so the feed never names an
 * archive that is not there yet. Only once the dmg answers from its public address is `DESKTOP_NOTARIZED` set
 * (`apps/site/src/lib/desktop.ts`), which takes `/download` out of the site's held list (`launch.ts`); commit that
 * with a changelog entry, and the next site deploy opens the page.
 *
 * A VERSION ALREADY LIVE IS REFUSED: the app offers only a newer version than its own, so a second release under the
 * same number would reach nobody. `--version` raises it in both files.
 *
 * EXCEPT TO FINISH ONE (`--upload-only`, RD9). A publish whose check after the upload failed (the dmg not answering yet
 * while `latest.json` already did) said "run --publish again", and the run again read that `latest.json`, found its own
 * version live and stopped, after twenty minutes of building and notarising. `--upload-only` builds nothing: it sends
 * the files `apps/desktop/dist` holds for this version, once Gatekeeper accepts the dmg there as notarised, and the
 * version may be the one already live.
 *
 * WHAT `--publish` NEEDS: Cloudflare credentials that may write the bucket, `CLOUDFLARE_API_TOKEN` (Workers R2 Storage:
 * Edit) and `CLOUDFLARE_ACCOUNT_ID` in the environment or in `signing.env`, or `wrangler login` on this Mac. This
 * script never deploys the site and never prints a secret.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CONF, KEYCHAIN, ROOT, TAURI_CLI, configPubkey, fromKeychain } from './updater-key.mjs';

const TAURI_DIR = join(ROOT, 'apps/desktop/src-tauri');
const CARGO_TOML = join(TAURI_DIR, 'Cargo.toml');
const ENTITLEMENTS = join(TAURI_DIR, 'Entitlements.plist');
const PROFILE = process.env.BRAINDOG_PROVISION_PROFILE || join(TAURI_DIR, 'BrainDog.provisionprofile');
const DIST = join(ROOT, 'apps/desktop/dist');
const MARK = join(ROOT, 'apps/site/src/lib/desktop.ts');
const SIGNING_ENV = join(TAURI_DIR, 'signing.env');
/** The addresses the app and the site name: the feed (`plugins.updater.endpoints`), the download and the archives. */
export const PUBLIC = 'https://brain.dog/desktop';
/** The bucket the files live in, and the public name it answers at (`brain.dog/desktop/*` redirects there). */
export const BUCKET = 'braindog-desktop';
export const BUCKET_PUBLIC = 'https://download.brain.dog';
/** THIS SHELL'S BUNDLE IDENTIFIER, which the team's application identifier is made from. `dog.brain.desktop` is the native Mac app's. */
export const BUNDLE_ID = 'dog.brain.shell';
/** WHY NOTHING GOES UP. */
export const NOT_PUBLISHED =
  'This shell is not published: BrainDog for Mac is the native app in apps/apple, and a dmg from here would land on its addresses. Nothing was built or uploaded.';
const CARGO = join(process.env.HOME ?? '', '.cargo/bin');
/**
 * WHERE CARGO BUILDS, OUTSIDE THE TREE: a release build is 1.6 GB of objects, and the gates that read every file of the
 * tree (`nul-bytes` among them) walked it for their whole ceiling. `CARGO_TARGET_DIR` set by the caller wins.
 */
export const TARGET = process.env.CARGO_TARGET_DIR || join(process.env.HOME ?? '', 'Library/Caches/braindog/desktop-target');

const argv = process.argv.slice(2);
const args = new Set(argv);
const DRY = args.has('--dry-run');
const UNIVERSAL = args.has('--universal');
/* `--stage` WAS THE OLD NAME, when the files were laid in the site's folder; it means the same now. */
const UPLOAD_ONLY = args.has('--upload-only');
const PUBLISH = args.has('--publish') || args.has('--stage') || UPLOAD_ONLY;
const asked = argv.indexOf('--version') >= 0 ? (argv[argv.indexOf('--version') + 1] ?? '') : null;
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

/** The team inside a Developer ID identity's name, "(ABCDE12345)" at its end, or `null`. */
export const teamOf = (identity) => /\(([A-Z0-9]{10})\)$/u.exec(identity ?? '')?.[1] ?? null;

/** The names `signing.env` sets, read as `KEY="value"` lines; comments and blanks ignored, nothing printed. */
export function envFile(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/u.exec(line);
    if (m && !line.trim().startsWith('#') && !/^<.*>$/u.test(m[2])) out[m[1]] = m[2];
  }
  return out;
}

/** The archive's name for a version: one name per release, so a cache never pairs an old archive with a new signature. */
export const archiveOf = (version) => `BrainDog-${version}.app.tar.gz`;

/** The update feed the app reads: this version, the archive's address and its signature, for each chip it was built for. */
export function feedOf({ version, notes, at, signature, archive, universal, arch }) {
  const url = `${PUBLIC}/${archive}`;
  const chips = universal ? ['darwin-aarch64', 'darwin-x86_64'] : [arch === 'x64' ? 'darwin-x86_64' : 'darwin-aarch64'];
  return { version, notes, pub_date: at, platforms: Object.fromEntries(chips.map((c) => [c, { signature, url }])) };
}

/** -1, 0 or 1 as version `a` is older, the same or newer than `b` (`major.minor.patch`; anything after is ignored). */
export function compareVersions(a, b) {
  const parts = (v) => String(v).split(/[-+]/u)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

/** The two files with the app's version written in, `version` in each, and nothing else changed. */
export function withVersion(conf, cargo, version) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error(`${version} is not a version like 0.2.0`);
  return {
    conf: conf.replace(/("version":\s*")[^"]+(")/u, `$1${version}$2`),
    cargo: cargo.replace(/(\[package\][^[]*?\nversion\s*=\s*")[^"]+(")/u, `$1${version}$2`),
  };
}

/** The entitlements a provisioned build signs with: the committed ones, and the team's application identifier. */
export function entitlementsFor(base, team) {
  const keys =
    `\t<key>com.apple.application-identifier</key>\n\t<string>${team}.${BUNDLE_ID}</string>\n` +
    `\t<key>com.apple.developer.team-identifier</key>\n\t<string>${team}</string>\n`;
  return base.replace(/<\/dict>\s*<\/plist>\s*$/u, `${keys}</dict>\n</plist>\n`);
}

/** What goes up, in order: the files the feed and the page name first, `latest.json` last. */
export function uploadsOf(version) {
  return [
    { from: archiveOf(version), key: archiveOf(version), type: 'application/gzip', cache: 'public, max-age=31536000, immutable' },
    { from: 'BrainDog.dmg', key: `BrainDog-${version}.dmg`, type: 'application/x-apple-diskimage', cache: 'public, max-age=31536000, immutable' },
    { from: 'BrainDog.dmg', key: 'BrainDog.dmg', type: 'application/x-apple-diskimage', cache: 'public, max-age=300' },
    { from: 'latest.json', key: 'latest.json', type: 'application/json', cache: 'no-cache' },
  ];
}

/**
 * What a live version says about this run, or `null` to go on. A build must be newer than what is live; files already
 * built (`--upload-only`) may be the same version, since that is a publish that stopped part way being finished, but
 * only when they are the live build's own bytes (`sameAsLive`: the feed in `dist` signs the same update as the live
 * one). A plain build of the live version since rewrote `dist`, and sending that replaced the live dmg, archive and
 * feed with other bytes under the same number, which installed copies never update to.
 */
export function liveRefusal(version, live, uploadOnly, sameAsLive = false) {
  if (live === null) return null;
  const order = compareVersions(version, live);
  if (order > 0) return null;
  if (uploadOnly && order === 0)
    return sameAsLive
      ? null
      : `${version} is live, and apps/desktop/dist holds another build of it: sending it would put other bytes under the live number. For a new release, run --publish with --version and a higher number.`;
  if (uploadOnly) return `${version} is older than ${live}, which is live: there is nothing of it to finish.`;
  return order === 0
    ? `${version} is already live. To finish a publish of it that stopped part way, run with --upload-only, which builds nothing. For a new release, run again with --version and a higher number.`
    : `${version} is not newer than ${live}, which is live: run again with --version and a higher number.`;
}

/** The files `--upload-only` needs in `dist` for a version and does not find there, by name; `[]` when it holds them all. */
export function distMissing(names, feedVersion, version) {
  const wanted = [...new Set(uploadsOf(version).map((u) => u.from))];
  const gone = wanted.filter((name) => !names.includes(name));
  if (!gone.includes('latest.json') && feedVersion !== version) gone.push(`latest.json for ${version} (it is for ${feedVersion ?? 'no version'})`);
  return gone;
}

/** The first file in a folder ending so, or `null`. */
const found = (dir, end) => (existsSync(dir) ? (readdirSync(dir).find((f) => f.endsWith(end)) ?? null) : null);

/** The version the live feed offers, `null` when there is none yet (or it cannot be read, which is said). */
async function liveFeed() {
  try {
    const res = await fetch(`${BUCKET_PUBLIC}/latest.json`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const feed = await res.json();
    return String(feed?.version ?? '') ? feed : null;
  } catch (e) {
    say(`the live feed could not be read (${e instanceof Error ? e.message : e}); going on as if none is live.`);
    return null;
  }
}

async function liveVersion() {
  const feed = await liveFeed();
  return feed === null ? null : String(feed.version);
}

/** The update signatures a feed names, one a chip, sorted and joined: two feeds sign the same update when these match. */
export function feedSignatures(feed) {
  const platforms = feed && typeof feed === 'object' && feed.platforms && typeof feed.platforms === 'object' ? Object.values(feed.platforms) : [];
  const signs = platforms.map((p) => (p && typeof p.signature === 'string' ? p.signature.trim() : '')).filter((x) => x !== '');
  return signs.length === 0 ? null : [...new Set(signs)].sort().join('\n');
}

/** Whether Gatekeeper's verdict accepts a notarised Developer ID. */
const notarised = (checked) => checked.status === 0 && /accepted/u.test(`${checked.stdout ?? ''}${checked.stderr ?? ''}`) && /Notarized Developer ID/u.test(`${checked.stdout ?? ''}${checked.stderr ?? ''}`);

/**
 * Whether the dmg in `dist` ships a notarised app: the dmg itself accepted, or, as `--publish` judges it, the app inside
 * it. `--publish` checks the app and goes on when the dmg cannot be stapled, so a dmg that does not read as notarised on
 * its own is the very case `--upload-only` finishes, and it refused every one.
 */
function dmgShipsNotarised(dmg) {
  if (notarised(spawnSync('spctl', ['-a', '-t', 'open', '--context', 'context:primary-signature', '-vv', dmg], { encoding: 'utf8' }))) return true;
  const mount = mkdtempSync(join(tmpdir(), 'braindog-dmg-'));
  if (spawnSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg], { stdio: 'ignore' }).status !== 0) return false;
  try {
    const app = found(mount, '.app');
    return app !== null && notarised(spawnSync('spctl', ['-a', '-vv', join(mount, app)], { encoding: 'utf8' }));
  } finally {
    spawnSync('hdiutil', ['detach', mount, '-quiet'], { stdio: 'ignore' });
  }
}

/** Whether an address answers 200 to a HEAD. */
async function answers(url) {
  try {
    return (await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(15_000) })).ok;
  } catch {
    return false;
  }
}

async function main() {
  /* BEFORE ANYTHING, even a dry run or a version written into the config. */
  if (PUBLISH) stop(NOT_PUBLISHED);
  if (asked !== null) {
    const next = withVersion(readFileSync(CONF, 'utf8'), readFileSync(CARGO_TOML, 'utf8'), asked);
    if (!DRY) {
      writeFileSync(CONF, next.conf);
      writeFileSync(CARGO_TOML, next.cargo);
    }
    say(`${DRY ? 'would set' : 'set'} the app's version to ${asked} in tauri.conf.json and Cargo.toml`);
  }
  const conf = JSON.parse(readFileSync(CONF, 'utf8'));
  const version = asked !== null && DRY ? asked : conf.version;
  if (UPLOAD_ONLY) return uploadOnly(version);
  if (!configPubkey()) stop('the updater key is not made yet: run node tools/desktop/updater-key.mjs first.');
  const key = fromKeychain(KEYCHAIN.key);
  const keyPassword = fromKeychain(KEYCHAIN.password);
  if (key === null || keyPassword === null) stop('the updater key is not in this keychain: run node tools/desktop/updater-key.mjs on the Mac that made it.');
  if (!existsSync(join(CARGO, 'cargo')) && spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status !== 0)
    stop('Rust is not installed: see apps/desktop/README.md, Build.');

  /* BEFORE THE BUILD, so twenty minutes are not spent on a release nobody would be offered. */
  const refused = liveRefusal(version, await liveVersion(), false);
  if (refused !== null) {
    if (PUBLISH) stop(refused);
    say(`note: ${refused}`);
  }

  const identity = developerId(spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).stdout ?? '');
  const notary = settings();
  const notarises = identity !== null && Boolean(notary.APPLE_ID && notary.APPLE_PASSWORD && notary.APPLE_TEAM_ID);
  const team = notary.APPLE_TEAM_ID || teamOf(identity);
  const provisioned = identity !== null && team !== null && existsSync(PROFILE);
  say(`BrainDog ${version} for ${UNIVERSAL ? 'Apple silicon and Intel' : `this Mac (${process.arch})`}`);
  say(identity === null ? 'no Developer ID in the keychain: building an UNSIGNED dmg, which runs only on this Mac' : `signing as ${identity}`);
  if (identity !== null) say(notarises ? 'notarising with the account in the environment' : 'no notarisation account (APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID): signed, NOT notarised');
  if (identity !== null)
    say(provisioned ? 'embedding the provisioning profile: passkeys work in the app' : 'no provisioning profile (BrainDog.provisionprofile): built without Associated Domains, so passkeys are refused in the app');

  /* THE PROVISIONED BUILD'S EXTRA CONFIG, merged by the CLI over tauri.conf.json, with its entitlements in a temporary
     folder: the team's identifier is written there and never into the tree. */
  const extra = [];
  if (provisioned && !DRY) {
    const dir = mkdtempSync(join(tmpdir(), 'braindog-entitlements-'));
    const plist = join(dir, 'Entitlements.plist');
    writeFileSync(plist, entitlementsFor(readFileSync(ENTITLEMENTS, 'utf8'), team));
    extra.push('--config', JSON.stringify({ bundle: { macOS: { entitlements: plist, files: { 'embedded.provisionprofile': PROFILE } } } }));
  }
  const build = ['--yes', TAURI_CLI, 'build', '--bundles', 'app,dmg', ...(UNIVERSAL ? ['--target', 'universal-apple-darwin'] : []), ...extra];
  if (DRY) {
    say(`would run: npx ${build.slice(1).join(' ')}${provisioned ? ' --config <entitlements and profile>' : ''}`);
    if (PUBLISH) say(`would upload ${uploadsOf(version).map((u) => u.key).join(', ')} to the bucket ${BUCKET}, then open /download`);
    return;
  }

  const env = {
    ...process.env,
    PATH: `${CARGO}:${process.env.PATH ?? ''}`,
    CARGO_TARGET_DIR: TARGET,
    /* NO FINDER WINDOW DRESSING: Tauri's dmg script lays out the window through AppleScript, which a shell without
       Finder's automation permission fails at; `CI` makes it skip that step and build the same dmg, plainly laid out. */
    CI: 'true',
    TAURI_SIGNING_PRIVATE_KEY: key,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: keyPassword,
    ...(identity !== null ? { APPLE_SIGNING_IDENTITY: identity } : {}),
    ...(notarises ? { APPLE_ID: notary.APPLE_ID, APPLE_PASSWORD: notary.APPLE_PASSWORD, APPLE_TEAM_ID: notary.APPLE_TEAM_ID } : {}),
  };
  const built = spawnSync('npx', build, { cwd: TAURI_DIR, env, stdio: 'inherit' });
  if (built.status !== 0) stop(`the build failed (exit ${built.status}).`);

  const bundle = join(TARGET, ...(UNIVERSAL ? ['universal-apple-darwin'] : []), 'release/bundle');
  const dmg = found(join(bundle, 'dmg'), '.dmg');
  const archive = found(join(bundle, 'macos'), '.app.tar.gz');
  const app = found(join(bundle, 'macos'), '.app');
  if (!dmg || !archive || !app) stop(`the build left no dmg, app or update archive under ${bundle}.`);
  const signature = readFileSync(join(bundle, 'macos', `${archive}.sig`), 'utf8').trim();

  mkdirSync(DIST, { recursive: true });
  copyFileSync(join(bundle, 'dmg', dmg), join(DIST, 'BrainDog.dmg'));
  copyFileSync(join(bundle, 'macos', archive), join(DIST, archiveOf(version)));
  const feed = feedOf({ version, notes: `BrainDog ${version}`, at: new Date().toISOString(), signature, archive: archiveOf(version), universal: UNIVERSAL, arch: process.arch });
  writeFileSync(join(DIST, 'latest.json'), `${JSON.stringify(feed, null, 2)}\n`);
  say(`built apps/desktop/dist/BrainDog.dmg, ${archiveOf(version)} and latest.json (the update signed by the updater key)`);

  /* NOTARISED IS WHAT GATEKEEPER SAYS, NOT WHAT THIS SCRIPT HOPED: the app must be accepted as a notarised Developer ID. */
  const checked = spawnSync('spctl', ['-a', '-vv', join(bundle, 'macos', app)], { encoding: 'utf8' });
  const verdict = `${checked.stdout ?? ''}${checked.stderr ?? ''}`;
  const accepted = checked.status === 0 && /accepted/u.test(verdict) && /Notarized Developer ID/u.test(verdict);
  if (!accepted) {
    say(identity === null ? 'UNSIGNED: Gatekeeper refuses it on any other Mac. Not published; /download stays held.' : 'NOT NOTARISED: Gatekeeper did not accept it. Not published; /download stays held.');
    if (PUBLISH) process.exitCode = 1;
    return;
  }
  if (spawnSync('xcrun', ['stapler', 'staple', join(DIST, 'BrainDog.dmg')], { stdio: 'ignore' }).status !== 0) say('the dmg could not be stapled; the app inside it is.');
  say('accepted: notarised Developer ID');
  if (!PUBLISH) return;

  await upload(version, notary);
}

/** What `signing.env` sets, under what the environment sets. */
const settings = () => ({ ...(existsSync(SIGNING_ENV) ? envFile(readFileSync(SIGNING_ENV, 'utf8')) : {}), ...process.env });

/**
 * `--upload-only`: the files `dist` holds for this version go up as `--publish` sends them, and nothing is built. The
 * app in the dmg there must be one Gatekeeper accepts as notarised, since `dist` is written before that check is made,
 * and a version already live goes up again only as its own bytes (`liveRefusal`).
 */
async function uploadOnly(version) {
  if (asked !== null) stop('--upload-only sends files already built, so it takes no --version.');
  let distFeed = null;
  try {
    distFeed = JSON.parse(readFileSync(join(DIST, 'latest.json'), 'utf8'));
  } catch {
    distFeed = null;
  }
  const feedVersion = String(distFeed?.version ?? '') || null;
  const live = await liveFeed();
  const ours = feedSignatures(distFeed);
  const refused = liveRefusal(version, live === null ? null : String(live.version), true, ours !== null && ours === feedSignatures(live));
  if (refused !== null) stop(refused);
  const missing = distMissing(existsSync(DIST) ? readdirSync(DIST) : [], feedVersion, version);
  if (missing.length > 0) stop(`apps/desktop/dist does not hold ${version}'s files (${missing.join(', ')}): run --publish to build them.`);
  if (!dmgShipsNotarised(join(DIST, 'BrainDog.dmg')))
    stop('the dmg in apps/desktop/dist, and the app inside it, are not ones Gatekeeper accepts as notarised: run --publish to build and notarise it. /download stays held.');
  say(`BrainDog ${version}: sending the files apps/desktop/dist holds, building nothing`);
  if (DRY) {
    say(`would upload ${uploadsOf(version).map((u) => u.key).join(', ')} to the bucket ${BUCKET}, then open /download`);
    return;
  }
  await upload(version, settings());
}

/** UP TO THE BUCKET, with wrangler from the repository, the Cloudflare account from the environment or signing.env. */
async function upload(version, notary) {
  stop(NOT_PUBLISHED);
  const cloud = {
    ...process.env,
    ...(notary.CLOUDFLARE_API_TOKEN ? { CLOUDFLARE_API_TOKEN: notary.CLOUDFLARE_API_TOKEN } : {}),
    ...(notary.CLOUDFLARE_ACCOUNT_ID ? { CLOUDFLARE_ACCOUNT_ID: notary.CLOUDFLARE_ACCOUNT_ID } : {}),
  };
  for (const u of uploadsOf(version)) {
    const put = spawnSync(
      'pnpm',
      ['--filter', './apps/site', 'exec', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/${u.key}`, '--file', join(DIST, u.from), '--content-type', u.type, '--cache-control', u.cache, '--remote'],
      { cwd: ROOT, env: cloud, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (put.status !== 0) stop(`${u.key} did not upload (exit ${put.status}). Nothing is opened; once the bucket can be written, run with --upload-only, which builds nothing.`);
    say(`uploaded ${u.key}`);
  }

  /* OPEN /download ONLY WHEN THE FILES REALLY ANSWER from the address the redirect sends a visitor to. */
  const there = (await answers(`${BUCKET_PUBLIC}/BrainDog.dmg`)) && (await answers(`${BUCKET_PUBLIC}/${archiveOf(version)}`)) && (await liveVersion()) === version;
  if (!there) stop(`the files are uploaded but ${BUCKET_PUBLIC} does not answer them yet: check the bucket's custom domain, then run with --upload-only, which builds nothing. /download stays held.`);
  writeFileSync(MARK, readFileSync(MARK, 'utf8').replace(/DESKTOP_NOTARIZED: boolean = false/u, 'DESKTOP_NOTARIZED: boolean = true'));
  say(`published to ${BUCKET_PUBLIC} (brain.dog/desktop/ redirects there) and marked notarised in apps/site/src/lib/desktop.ts.`);
  say('commit desktop.ts with a changelog entry saying the Mac app can be downloaded; the next site deploy opens /download.');
}

if (process.argv[1]?.endsWith('release.mjs')) await main();
