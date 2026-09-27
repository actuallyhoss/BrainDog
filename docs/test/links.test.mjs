/**
 * Every link between the documents lands on a document, and none still points at the Spark spec.
 *
 *   node --test "docs/test/links.test.mjs"
 *
 * The root `pnpm test` runs it after every package's tests, which is the step `tag.yml` takes; `ci.yml`
 * runs it as its own step in the `apps` leg of `test`, since `docs/` is not a workspace package and
 * no `pnpm -r` filter reaches it.
 *
 * THE SPEC FOR THE ASSISTANT MOVED FROM `46-SPEC-SPARK.md` TO `46-SPEC-SLASH.md` ON 25 SEPTEMBER
 * (DIRECTION 31), and it was the most linked-to file in this folder: 32 links in 14 documents at
 * `5c332af4`, counted by `loop/research-slash-rename.md` §1. A `git mv` moves the file and none of
 * the 32, and nothing in this repository read a Markdown link for whether it lands: the gates read
 * tables out of `30-BLUEPRINT.md`, `31-STACK.md` and `34-GRAMMARS.md`, never a link. So a rename
 * that missed one link would have shipped a document pointing at nothing, and nobody would have
 * been told until a reader clicked it.
 *
 * SO IT CHECKS EVERY RELATIVE `.md` LINK AND NOT ONLY THE 32. Measured before the rename, across the
 * 72 tracked Markdown files outside `loop/` and the gates' negative fixtures, exactly one relative
 * link did not resolve on disk: `.github/PULL_REQUEST_TEMPLATE.md` to `../blob/master/SECURITY.md`,
 * which is a GitHub web path and correct there. That file is outside what this reads, so the check
 * starts clean and any link it names is new.
 *
 * `loop/` IS LEFT OUT ON PURPOSE. Its history files record what was true on their day, and 36 of
 * their links name the old spec; the survey accepted that they dangle, because rewriting a report
 * to match a later tree is how a report stops being evidence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Tracked Markdown this owns: the documents, and the three at the root that link into them. */
const FILES = execFileSync('git', ['ls-files', 'docs/*.md', 'README.md', 'BUILD.md', 'SECURITY.md'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  /* A FILE REMOVED OR RENAMED ON DISK WITHOUT GIT IS STILL IN THE INDEX UNDER ITS OLD NAME until the
     caller stages the change, and this tree carries such deletions between a lane's work and the
     commit. Reading only what is on disk keeps a half-staged tree readable. */
  .filter((file) => existsSync(join(ROOT, file)));

/** `[text](target.md)` or `[text](target.md#anchor)`, relative, with no scheme. */
const LINK = /\]\(([^)\s#]+\.md)(?:#[^)\s]*)?\)/g;

test('every relative Markdown link in the documents lands on a file', () => {
  assert.ok(FILES.length > 50, `only ${FILES.length} Markdown files were found; the list is not the documents`);
  const dead = [];
  for (const file of FILES) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const m of text.matchAll(LINK)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      if (!existsSync(join(ROOT, dirname(file), target))) dead.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(dead, [], `links that land on nothing:\n  ${dead.join('\n  ')}`);
});

test('the assistant spec is 46-SPEC-SLASH.md, and something links to it', () => {
  assert.ok(existsSync(join(ROOT, 'docs', '46-SPEC-SLASH.md')), 'docs/46-SPEC-SLASH.md does not exist');
  assert.ok(!existsSync(join(ROOT, 'docs', '46-SPEC-SPARK.md')), 'docs/46-SPEC-SPARK.md is still on disk');
  const linking = FILES.filter((file) => readFileSync(join(ROOT, file), 'utf8').includes('46-SPEC-SLASH.md'));
  assert.ok(linking.length >= 14, `${linking.length} documents link the spec; 14 did before the move`);
});

test('no document outside loop history still names 46-SPEC-SPARK', () => {
  const named = FILES.filter((file) => readFileSync(join(ROOT, file), 'utf8').includes('46-SPEC-SPARK'));
  assert.deepEqual(named, [], `still naming the old spec: ${named.join(', ')}`);
});
