/**
 * No first-run screen counts the build (use case 6, steps 2 to 4; USE-B07): no progress bar, no `.bar`, and no "N of M".
 * A part left off is not a step behind, and a bar that fills says the person has work left that they do not.
 *
 * Read off the source of every file under `routes/start` and `routes/signup`, and off the words those screens say,
 * called with counts; so a bar put back, or a count put back into a sentence, goes red here before any screen draws it.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { words as signupWords } from '../signup/words.ts';
import { words as buildWords } from './building.ts';
import { words as previewWords } from './preview.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOTS = [here, join(here, '../signup')];

/** Every screen and its words, never a test (a test names what it guards against). */
const files = ROOTS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.(svelte|ts)$/u.test(f) && !/\.test\.ts$/u.test(f))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') })),
);

/** A progress role, the element, or the bar's own class, in markup or in a style. */
const BAR: readonly RegExp[] = [/role\s*[=:]\s*["'{]?\s*["']progressbar["']/u, /role="progressbar"/u, /<progress[\s>]/u, /aria-valuenow/u, /class="(?:[^"]*\s)?bar(?:\s[^"]*)?"/u, /class:bar\b/u, /(?:^|[\s,}])\.bar(?![\w-])/mu];

/** A count of a total: "2 of 6", `${on} of ${all}`, `{on} of {all}`. */
const COUNT: readonly RegExp[] = [/\d+\s+of\s+\d+/u, /\$\{[^}]+\}\s+of\s+\$\{[^}]+\}/u, /\{[^{}]+\}\s+of\s+\{[^{}]+\}/u];

test('THE GUARDS CATCH WHAT THEY ARE FOR, so a clean pass means something', () => {
  for (const bad of ['<div role="progressbar">', '<progress value="2">', '<span class="bar"></span>', '<i class="fill bar wide">', '  .bar {', '.track, .bar span {'])
    assert.ok(BAR.some((r) => r.test(bad)), `not caught: ${bad}`);
  for (const fine of ['scrollbar-gutter: stable;', '<nav class="sidebar">', '.bar-code {', 'class="barrel"']) assert.ok(!BAR.some((r) => r.test(fine)), `caught wrongly: ${fine}`);
  for (const bad of ['2 of 6 parts', '`${on} of ${all}`', '{onCount} of {allParts.length}']) assert.ok(COUNT.some((r) => r.test(bad)), `not caught: ${bad}`);
  assert.ok(!COUNT.some((r) => r.test('One of your parts')), 'a sentence with "of" is not a count');
});

test('NO PROGRESS BAR ON /start OR /signup: no progressbar role, no <progress>, no .bar', () => {
  assert.ok(files.some((f) => f.name === '+page.svelte'), 'the pages were not found to read');
  for (const { name, text } of files)
    for (const r of BAR) assert.doesNotMatch(text, r, `${name} draws a progress bar (${r.source})`);
});

test('NO "N OF M" IN THE SOURCE OF EITHER PAGE', () => {
  for (const { name, text } of files)
    for (const r of COUNT) assert.doesNotMatch(text, r, `${name} counts the build (${r.source})`);
});

test('NO "N OF M" IN WHAT THE FIRST RUN SAYS, called with counts', () => {
  const said: string[] = [];
  const tries: unknown[][] = [[2, 6], [2, 6, null], [['People', 'Money'], null], [['People'], 'Money', ['Orders']], ['People', 6]];
  for (const set of [buildWords, signupWords, previewWords] as Record<string, unknown>[])
    for (const value of Object.values(set)) {
      if (typeof value === 'string') said.push(value);
      if (typeof value !== 'function') continue;
      for (const args of tries) {
        try {
          const out = (value as (...a: unknown[]) => unknown)(...args);
          if (typeof out === 'string') said.push(out);
        } catch {
          /* Words that take something else entirely: their source is read above. */
        }
      }
    }
  assert.ok(said.length > 20, 'the words were not found to read');
  for (const line of said) assert.doesNotMatch(line, /\b\d+\s+of\s+\d+\b/u, `a count of the build: ${line}`);
});
