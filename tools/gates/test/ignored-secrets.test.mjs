/**
 * A file that holds values stays out of the repository, whatever `git add -A` was run over.
 *
 * `.gitignore` held `.env` and nothing else of the kind: a Worker's `.dev.vars`, a `.secrets` folder, the local notes
 * folder and a signing key were each one tired commit from a public history that keeps them for good, and `.notes` was
 * ignored only by the one machine's own exclude file. The paths below are never created: `git check-ignore` reads the
 * rules, and `--no-index` reads them even for a path that is tracked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const ignored = (path) => spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: ROOT }).status === 0;

const MUST_NOT_BE_COMMITTED = [
  '.notes/HANDOFF.md',
  '.secrets',
  '.secrets/anything.txt',
  'apps/worker/.secrets',
  '.dev.vars',
  '.dev.vars.production',
  'apps/worker/.dev.vars',
  'apps/worker/.dev.vars.alpha',
  '.env',
  '.env.production',
  'apps/selfhost/.env.local',
  'signing.pem',
  'apps/apple/AuthKey_ABCDEF.p8',
  'apps/apple/dist.p12',
  'tools/some.key',
  'release.keystore',
  'apps/apple/app.mobileprovision',
  'age-identity-production.txt',
  'kek-production.txt',
  'hosts.json',
  'CLAUDE.local.md',
  '.ship/run.log',
  'loop',
  'export.brainl',
  'export.brainl.age',
  'record.sqlite',
];

const MUST_STAY_TRACKED = ['selfhost.env.example', 'apps/desktop/src-tauri/signing.example.env', '.dev.vars.example', '.env.example', 'apps/worker/wrangler.jsonc'];

for (const path of MUST_NOT_BE_COMMITTED) test(`${path} cannot be added by accident`, () => assert.ok(ignored(path), `${path} is not ignored`));

for (const path of MUST_STAY_TRACKED) test(`${path} is not caught by the same rules`, () => assert.ok(!ignored(path), `${path} is ignored`));

test('nothing the repository tracks is one of these', () => {
  const listed = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\n').filter(Boolean);
  const held = listed.filter((path) => /(^|\/)(\.dev\.vars(\.(?!example$)[^/]+)?|\.secrets(\/.*)?|\.env(\.(?!example$)[^/]+)?|[^/]+\.(pem|p8|p12|pfx|keystore|jks|mobileprovision)|age-identity[^/]*|kek-[^/]*\.txt|hosts\.json)$/u.test(path));
  assert.deepEqual(held, []);
});
