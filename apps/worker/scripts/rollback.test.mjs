/**
 * When a red deploy is put back, and when it is held: `rollback.mjs`'s decision, offline.
 *
 *   node --test apps/worker/scripts/rollback.test.mjs
 *
 * THE HOLDS ARE THE POINT, AND EACH IS HELD HERE BY THE CHANGE THAT CAUSES IT. A kernel migration, a Durable Object
 * class migration and a `DIRECTORY_VERSION` move each make the version before unable to serve what the new one wrote,
 * so a rollback after one is an outage rather than a repair (ops.md §6.4). Everything else is put back: the app after a
 * red Parity, and the app and the site after a red Smoke.
 *
 * NOTHING HERE TOUCHES THE NETWORK OR GIT. `decide` is handed the diff `readDiff` would read, and `liveSha` a fake
 * `fetch`; the one `readDiff` case is the refusal that happens before `git` is called.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';
import { DIRECTORY, SLASH_STORE, WRANGLER, decide, directoryVersion, liveSha, migrationsBlock, readDiff, record, storeVersion, versionOf } from './rollback.mjs';

const APP_BEFORE = '6f1c2a90-3b4d-4e5f-8a7b-0c1d2e3f4a5b';
const SITE_BEFORE = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const state = (failedAt, over = {}) => ({ appPrevious: APP_BEFORE, sitePrevious: SITE_BEFORE, liveSha: '1a09462', headSha: '9f3e2d1c0b', failedAt, ...over });
const diff = (changed, over = {}) => ({ changed, wrangler: [null, null], directory: [null, null], ...over });

/* THE WORKER'S CONFIG AS IT STANDS, AND THE SAME FILE WITH ITS COMMENTED `v2` RUNG TAKEN OUT OF THE COMMENT. */
const wranglerNow = readFileSync(join(ROOT, WRANGLER), 'utf8');
const withSlashClass = wranglerNow.replace(
  '{ "tag": "v1", "new_sqlite_classes": ["Record$", "Directory$"] }',
  '{ "tag": "v1", "new_sqlite_classes": ["Record$", "Directory$"] },\n    { "tag": "v2", "new_sqlite_classes": ["Slash$"] }',
);

test('a red Smoke puts back the app and the site; a red Parity the app alone, because the site was never deployed', () => {
  const smoke = decide(state('smoke'), diff(['apps/web/src/routes/+page.svelte']));
  assert.equal(smoke.hold, null);
  assert.equal(smoke.app, APP_BEFORE);
  assert.equal(smoke.site, SITE_BEFORE);

  const parity = decide(state('parity'), diff(['apps/web/src/routes/+page.svelte']));
  assert.equal(parity.hold, null);
  assert.equal(parity.app, APP_BEFORE);
  assert.equal(parity.site, null);
  assert.match(parity.notes.join(' '), /before the site was deployed/);
});

test('a shipped kernel migration holds, and says which', () => {
  const verdict = decide(state('smoke'), diff(['packages/kernel/src/migrations/0017_automation_watch.ts', 'packages/kernel/src/migrate.ts']));
  assert.equal(verdict.app, null);
  assert.equal(verdict.site, null);
  assert.match(verdict.hold ?? '', /kernel migration shipped \(packages\/kernel\/src\/migrations\/0017_automation_watch\.ts\)/);
});

test('a Durable Object class migration holds, and a comment beside the block does not', () => {
  assert.notEqual(withSlashClass, wranglerNow, 'the v1 line this test edits is no longer in wrangler.jsonc');
  assert.notEqual(migrationsBlock(withSlashClass), migrationsBlock(wranglerNow));
  const held = decide(state('parity'), diff([WRANGLER], { wrangler: [wranglerNow, withSlashClass] }));
  assert.equal(held.app, null);
  assert.match(held.hold ?? '', /Durable Object migrations/);

  /* THE `v2` RUNG IN TODAY'S FILE IS A COMMENT, so a change to the words around it is no migration, and a var changed in
     the same file is a rollback like any other. */
  const reworded = wranglerNow.replace('"migrations": [', '"migrations": [\n    /* A note beside the rungs, which is not one. */');
  assert.notEqual(reworded, wranglerNow, 'the migrations key this test edits is no longer in wrangler.jsonc');
  assert.equal(migrationsBlock(reworded), migrationsBlock(wranglerNow));
  const rolled = decide(state('smoke'), diff([WRANGLER], { wrangler: [wranglerNow, reworded] }));
  assert.equal(rolled.hold, null);
  assert.equal(rolled.app, APP_BEFORE);

  /* AND A FILE THAT DOES NOT PARSE AT ONE SHA IS NOT READ AS UNCHANGED. */
  assert.match(decide(state('smoke'), diff([WRANGLER], { wrangler: [wranglerNow, '{ not json'] })).hold ?? '', /could not be read/);
});

test('a DIRECTORY_VERSION move holds, and an edit elsewhere in directory.ts does not', () => {
  const at = (n) => `export const OTHER = 1;\nexport const DIRECTORY_VERSION = ${n};\n`;
  assert.equal(directoryVersion(at(4)), 4);
  assert.equal(directoryVersion(readFileSync(join(ROOT, DIRECTORY), 'utf8')), 4, 'DIRECTORY_VERSION is read wrongly, or it moved (contracts §1.3 keeps it at 4)');

  const held = decide(state('smoke'), diff([DIRECTORY], { directory: [at(4), at(5)] }));
  assert.equal(held.app, null);
  assert.match(held.hold ?? '', /DIRECTORY_VERSION moved from 4 to 5/);

  const rolled = decide(state('smoke'), diff([DIRECTORY], { directory: [at(4), `${at(4)}export const MORE = 2;\n`] }));
  assert.equal(rolled.hold, null);
  assert.equal(rolled.app, APP_BEFORE);
});

test('a Slash STORE_VERSION move holds, and an edit elsewhere in call.ts does not', () => {
  const at = (n) => `export const OTHER = 1;\nexport const STORE_VERSION = ${n};\n`;
  assert.equal(storeVersion(at(3)), 3);
  assert.notEqual(storeVersion(readFileSync(join(ROOT, SLASH_STORE), 'utf8')), null, 'STORE_VERSION is no longer read from call.ts');

  const held = decide(state('smoke'), diff([SLASH_STORE], { slash: [at(2), at(3)] }));
  assert.equal(held.app, null);
  assert.match(held.hold ?? '', /STORE_VERSION moved from 2 to 3/);
  assert.match(decide(state('smoke'), diff([SLASH_STORE])).hold ?? '', /could not be read at both shas/);

  const rolled = decide(state('smoke'), diff([SLASH_STORE], { slash: [at(3), `${at(3)}export const MORE = 2;\n`] }));
  assert.equal(rolled.hold, null);
  assert.equal(rolled.app, APP_BEFORE);
});

test('unknown is a hold: no live sha, no diff, no version to put back', () => {
  assert.match(decide(state('smoke', { liveSha: '' }), diff([])).hold ?? '', /named no sha/);
  assert.match(decide(state('smoke', { headSha: undefined }), diff([])).hold ?? '', /no sha of its own/);
  assert.match(decide(state('smoke'), diff(null)).hold ?? '', /could not be read in this checkout/);
  assert.match(decide(state('smoke', { appPrevious: '' }), diff([])).hold ?? '', /app version live before this deploy was not recorded/);
  assert.match(decide(state('deploy'), diff([])).hold ?? '', /only a red Parity or Smoke/);

  /* A SITE VERSION NOBODY RECORDED puts the app back and leaves the site, and says so. */
  const half = decide(state('smoke', { sitePrevious: '' }), diff([]));
  assert.equal(half.app, APP_BEFORE);
  assert.equal(half.site, null);
  assert.match(half.notes.join(' '), /site stays as deployed/);
});

test('readDiff refuses anything that is not a sha before git sees it', () => {
  for (const [from, to] of [['--output=x', '1a09462'], ['1a09462', 'HEAD'], ['', '1a09462'], [null, '1a09462']]) assert.equal(readDiff(from, to).changed, null);
});

test('the live version is the one at 100 percent, and a split or unreadable status is unknown', () => {
  const status = (versions) => JSON.stringify({ id: 'd1', source: 'wrangler', strategy: 'percentage', versions }, null, 2);
  assert.equal(versionOf(status([{ version_id: APP_BEFORE, percentage: 100 }])), APP_BEFORE);
  /* WHATEVER PRINTS AROUND THE OBJECT is tolerated. */
  assert.equal(versionOf(`> wrangler deployments status\n${status([{ version_id: APP_BEFORE, percentage: 100 }])}\n`), APP_BEFORE);
  assert.equal(versionOf(status([{ version_id: APP_BEFORE, percentage: 50 }, { version_id: SITE_BEFORE, percentage: 50 }])), null);
  assert.equal(versionOf(''), null);
  assert.equal(versionOf(null), null);
  assert.equal(versionOf('✘ [ERROR] The Worker braindog-production has no deployments.'), null);
  /* A VALUE THAT COULD SET A SECOND VARIABLE IN $GITHUB_ENV is not a version. */
  assert.equal(versionOf(status([{ version_id: `${APP_BEFORE}\nLIVE_SHA=0000000`, percentage: 100 }])), null);
});

test('record keeps the two versions and the live sha, and an unreachable host is an empty sha', async () => {
  const served = (body, status = 200) => async () => ({ status, json: async () => body });
  const app = JSON.stringify({ versions: [{ version_id: APP_BEFORE, percentage: 100 }] });
  const site = JSON.stringify({ versions: [{ version_id: SITE_BEFORE, percentage: 100 }] });

  assert.deepEqual(await record({ appText: app, siteText: site, host: 'brain.dog', ask: served({ app: '2026.09.25+1a09462' }) }), {
    APP_PREVIOUS: APP_BEFORE,
    SITE_PREVIOUS: SITE_BEFORE,
    LIVE_SHA: '1a09462',
  });
  /* A BUILD DEPLOYED WITHOUT `--var` answers `null`, and that is no sha. */
  assert.equal(await liveSha('brain.dog', served({ app: null })), null);
  assert.equal(await liveSha('brain.dog', served({}, 404)), null);
  assert.equal(await liveSha('brain.dog', async () => { throw new Error('refused'); }), null);
  assert.equal(await liveSha('', served({ app: '2026.09.25+1a09462' })), null);
  assert.equal(await liveSha('brain.dog/evil path', served({ app: '2026.09.25+1a09462' })), null);
});
