/**
 * A `git:` address names one repository, and the file is read from that one.
 *
 * Measured before the fix: `git:someone/kit@<commit>:../../../other/evil/main/kit.pack.json` parsed, said `someone/kit` on
 * the install sheet, and read `https://raw.githubusercontent.com/other/evil/main/kit.pack.json`, a stranger's file on a
 * moving branch, with the commit pin kept on the add-on saying otherwise.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGit, rawAddress } from '../src/git-channel.ts';

const SHA = 'a'.repeat(40);

test('A STEP OUT OF THE REPOSITORY IS NOT AN ADDRESS, however it is spelled', () => {
  for (const path of ['../../../other/evil/main/kit.pack.json', '%2e%2e/%2E%2E/%2e./other/evil/main/kit.pack.json', 'a/../../../../other/x.json', './kit.pack.json', 'a\\..\\..\\kit.pack.json', 'a/.%2e/b.json'])
    assert.equal(parseGit(`git:someone/kit@${SHA}:${path}`), null, path);
  assert.equal(parseGit(`git:../kit@${SHA}:kit.pack.json`), null);
  assert.equal(parseGit(`git:someone/..@${SHA}:kit.pack.json`), null);
  assert.equal(parseGit('git:someone/kit@v1/../../x:kit.pack.json'), null);
});

test('WHAT PARSES READS FROM THE REPOSITORY IT NAMES', () => {
  for (const path of ['kit.pack.json', 'packs/kit/kit.pack.json', 'a..b/kit.pack.json', 'kit..pack.json', '/kit.pack.json']) {
    const at = parseGit(`git:someone/kit@${SHA}:${path}`);
    assert.ok(at, path);
    assert.ok(new URL(rawAddress(at, SHA)).pathname.startsWith(`/someone/kit/${SHA}/`), path);
  }
});
