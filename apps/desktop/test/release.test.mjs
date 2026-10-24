/**
 * The Mac app's release pieces that read no keychain and build nothing (E50, E51): which identity signs, what
 * `signing.env` says, the update feed, and the public key written into the config.
 *
 *   pnpm --filter @braindog/desktop test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { developerId, envFile, feedOf } from '../../../tools/desktop/release.mjs';
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
