/**
 * The Mac app's release pieces that read no keychain and build nothing: which identity signs, what
 * `signing.env` says, the update feed, and the public key written into the config.
 *
 *   pnpm --filter @braindog/desktop test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { archiveOf, compareVersions, developerId, distMissing, entitlementsFor, envFile, feedOf, feedSignatures, liveRefusal, teamOf, uploadsOf, withVersion } from '../../../tools/desktop/release.mjs';
import { CONF, configPubkey, withPubkey } from '../../../tools/desktop/updater-key.mjs';

test('ONLY A DEVELOPER ID SIGNS FOR OTHER MACS: an Apple Development identity is not one', () => {
  assert.equal(developerId('  1) ABC "Apple Development: Created via API (V52SF93K2D)"\n     1 valid identities found'), null);
  assert.equal(
    developerId('  1) ABC "Apple Development: x"\n  2) DEF "Developer ID Application: Quartz Apps LLC (TEAM123)"'),
    'Developer ID Application: Quartz Apps LLC (TEAM123)',
  );
});

test('SIGNING.ENV IS READ FOR ITS VALUES, and its placeholders and comments are not', () => {
  const said = envFile('# a note\nAPPLE_ID="me@example.com"\nAPPLE_TEAM_ID="<TEAM_ID>"\nAPPLE_PASSWORD=abcd\n');
  assert.deepEqual(said, { APPLE_ID: 'me@example.com', APPLE_PASSWORD: 'abcd' });
});

test('THE FEED NAMES EACH CHIP IT WAS BUILT FOR, one archive and its signature', () => {
  const one = feedOf({ version: '0.1.0', notes: 'n', at: '2026-10-24T00:00:00Z', signature: 'sig', archive: 'BrainDog.app.tar.gz', universal: false, arch: 'arm64' });
  assert.deepEqual(Object.keys(one.platforms), ['darwin-aarch64']);
  assert.equal(one.platforms['darwin-aarch64'].url, 'https://brain.dog/desktop/BrainDog.app.tar.gz');
  const both = feedOf({ version: '0.1.0', notes: 'n', at: 'x', signature: 'sig', archive: 'a', universal: true, arch: 'arm64' });
  assert.deepEqual(Object.keys(both.platforms), ['darwin-aarch64', 'darwin-x86_64']);
});

test('THE CONFIG HOLDS A REAL PUBLIC KEY, and writing one changes that line alone', () => {
  assert.ok(configPubkey(), 'tauri.conf.json still holds the placeholder: run node tools/desktop/updater-key.mjs');
  const placeholder = '{ "plugins": { "updater": { "pubkey": "REPLACE_WITH_THE_KEY" } } }';
  assert.equal(configPubkey(placeholder), null);
  assert.equal(withPubkey(placeholder, 'QUJD'), '{ "plugins": { "updater": { "pubkey": "QUJD" } } }');
  assert.throws(() => withPubkey(placeholder, 'not base64!'));
  assert.equal(JSON.parse(readFileSync(CONF, 'utf8')).bundle.macOS.signingIdentity, null, 'no identity is written into the config; the release reads it from the keychain');
});

test('A VERSION IS NEWER ONLY BY ITS NUMBERS, so a release under the live number is refused', () => {
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.1', '0.1.0'), 1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
});

test('--version WRITES THE NUMBER IN BOTH FILES and nothing else', () => {
  const conf = '{\n  "productName": "BrainDog",\n  "version": "0.1.0",\n  "identifier": "dog.brain.desktop"\n}';
  const cargo = '[package]\nname = "braindog-desktop"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde_json = "1"\n';
  const out = withVersion(conf, cargo, '0.2.0');
  assert.equal(out.conf, conf.replace('0.1.0', '0.2.0'));
  assert.equal(out.cargo, cargo.replace('version = "0.1.0"', 'version = "0.2.0"'));
  assert.throws(() => withVersion(conf, cargo, 'two'));
});

test('THE ARCHIVE IS NAMED BY VERSION, and latest.json goes up last', () => {
  assert.equal(archiveOf('0.2.0'), 'BrainDog-0.2.0.app.tar.gz');
  const keys = uploadsOf('0.2.0').map((u) => u.key);
  assert.equal(keys.at(-1), 'latest.json');
  assert.ok(keys.includes('BrainDog.dmg') && keys.includes('BrainDog-0.2.0.app.tar.gz'));
});

test('A PROVISIONED BUILD SIGNS WITH THE ASSOCIATED DOMAINS AND THE TEAM\'S APPLICATION IDENTIFIER', () => {
  const base = readFileSync(new URL('../src-tauri/Entitlements.plist', import.meta.url), 'utf8');
  assert.match(base, /webcredentials:brain\.dog/);
  assert.match(base, /webcredentials:app\.brain\.dog/);
  const out = entitlementsFor(base, 'ABCDE12345');
  assert.match(out, /<string>ABCDE12345\.dog\.brain\.desktop<\/string>/);
  assert.match(out, /<\/dict>\n<\/plist>\n$/);
  assert.equal(teamOf('Developer ID Application: Quartz Apps LLC (ABCDE12345)'), 'ABCDE12345');
  assert.equal(teamOf(null), null);
  const conf = JSON.parse(readFileSync(CONF, 'utf8'));
  assert.equal(conf.bundle.macOS.entitlements, undefined, 'Associated Domains in the config would get an unprovisioned build killed at launch');
});

/* RD9: A PUBLISH THAT STOPPED AFTER ITS UPLOAD SAID "RUN --publish AGAIN", and the run again found its own version live
   and stopped, after building and notarising for twenty minutes. `--upload-only` builds nothing and may finish it. */
test('RD9: A BUILD MUST BE NEWER THAN WHAT IS LIVE; AN UPLOAD OF FILES ALREADY BUILT MAY BE THE SAME VERSION', () => {
  assert.equal(liveRefusal('0.2.0', null, false), null);
  assert.equal(liveRefusal('0.2.1', '0.2.0', false), null);
  assert.match(liveRefusal('0.2.0', '0.2.0', false) ?? '', /--upload-only/u);
  assert.match(liveRefusal('0.1.9', '0.2.0', false) ?? '', /not newer/u);
  assert.equal(liveRefusal('0.2.0', '0.2.0', true, true), null);
  assert.equal(liveRefusal('0.2.1', '0.2.0', true), null);
  assert.match(liveRefusal('0.1.9', '0.2.0', true) ?? '', /older/u);
});

test('RD9: --upload-only NAMES WHAT dist DOES NOT HOLD FOR THE VERSION, the feed included', () => {
  const all = ['BrainDog.dmg', archiveOf('0.2.0'), 'latest.json'];
  assert.deepEqual(distMissing(all, '0.2.0', '0.2.0'), []);
  assert.deepEqual(distMissing(['BrainDog.dmg', 'latest.json'], '0.2.0', '0.2.0'), [archiveOf('0.2.0')]);
  /* THE FILES ARE ALL THERE AND THE FEED IS FOR ANOTHER VERSION: one thing missing, said with both versions. */
  assert.deepEqual(distMissing(all, '0.1.9', '0.2.0'), ['latest.json for 0.2.0 (it is for 0.1.9)']);
  assert.deepEqual(distMissing([], null, '0.2.0').sort(), [archiveOf('0.2.0'), 'BrainDog.dmg', 'latest.json'].sort());
});

/* RE13: 0.2.0 LIVE, A PLAIN BUILD OF 0.2.0 REWROTE dist, and --upload-only put its other bytes under the live number. */
test('RE13: --upload-only SENDS THE LIVE VERSION AGAIN ONLY AS THE LIVE BUILD ITSELF', () => {
  assert.match(liveRefusal('0.2.0', '0.2.0', true, false) ?? '', /another build/u);
  assert.match(liveRefusal('0.2.0', '0.2.0', true) ?? '', /another build/u);
  const live = feedOf({ version: '0.2.0', notes: '', at: '', signature: 'sig-a', archive: archiveOf('0.2.0'), universal: true, arch: 'arm64' });
  const rebuilt = feedOf({ version: '0.2.0', notes: '', at: '', signature: 'sig-b', archive: archiveOf('0.2.0'), universal: true, arch: 'arm64' });
  assert.equal(feedSignatures(live), feedSignatures({ ...live, pub_date: 'later' }));
  assert.notEqual(feedSignatures(live), feedSignatures(rebuilt));
  assert.equal(feedSignatures(null), null);
  assert.equal(feedSignatures({ version: '0.2.0' }), null);
});
