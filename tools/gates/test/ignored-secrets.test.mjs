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
import { readFileSync } from 'node:fs';
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

/*
 * THE SCAN'S IGNORE LIST ONLY EXCUSES WHAT A READER CAN CHECK. Its lines named commits a rewrite had replaced, so they
 * matched nothing and the scan's findings were either all noise or, with the list believed, unread. Each line now names
 * one commit and one test file, and nothing but the public half of a push key is excused outside a test.
 */
test('every line of .gitleaksignore is one commit and a test file, or the public key in the Worker config', () => {
  const lines = readFileSync(`${ROOT}/.gitleaksignore`, 'utf8').split('\n').filter((line) => line !== '' && !line.startsWith('#'));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    const read = /^([0-9a-f]{40}):(.+):([a-z-]+):(\d+)$/u.exec(line);
    assert.ok(read !== null, `${line} is not commit:file:rule:line`);
    const [, , file, rule] = read;
    const testPath = /(^|\/)test\/|\.test\.[a-z]+$/u.test(file);
    assert.ok(testPath || (file === 'apps/worker/wrangler.jsonc' && rule === 'generic-api-key'), `${file} is not a test`);
  }
  assert.equal(new Set(lines).size, lines.length);
});

test('the public push keys in the Worker config are public keys: 65 bytes starting 04, a point on a curve', () => {
  const config = readFileSync(`${ROOT}/apps/worker/wrangler.jsonc`, 'utf8');
  const keys = [...config.matchAll(/"VAPID_PUBLIC":\s*"([^"]+)"/gu)].map((m) => m[1]);
  assert.ok(keys.length >= 2);
  for (const key of keys) {
    const bytes = Buffer.from(key, 'base64url');
    assert.equal(bytes.length, 65);
    assert.equal(bytes[0], 4);
  }
});
