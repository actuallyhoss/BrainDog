/**
 * Spark is called Slash now (`loop/DIRECTION.md` section 31), and this is the web app's half of the rename, measured.
 *
 * WHY A SCAN AND NOT A LIST OF FILES. The survey (`loop/research-slash-rename.md` section 1) counted 673 occurrences in 50
 * files of this app alone, in route folders, copy keys, palette ids, CSS classes, a localStorage key and the canvas's verb
 * list. A test that names the files it knows about passes the day somebody adds a fifty-first, so the last test here reads
 * every file under `src` and allows exactly the words that are not the product: `sparkline`, the chart, and `sparkle`, the
 * English word.
 *
 * AND THE `/` KEY IS NOT THE PRODUCT. Section 3 of the survey found the keymap already had a binding called
 * `palette-slash`, the key that opens the palette, which after the rename reads as "Slash's palette". It is
 * `palette-slash-key` now, so no identifier `slash` means anything but Slash.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS } from './palette/admit.ts';
import { BINDINGS } from './a11y/bindings.ts';
import { FLOW_VERBS } from './flow/flow.ts';

const SRC = fileURLToPath(new URL('../', import.meta.url));
/* THIS FILE NAMES THE OLD WORDS to say they are gone, so the scan skips it and nothing else. */
const SELF = relative(SRC, fileURLToPath(import.meta.url)).replaceAll('\\', '/');

test('the page lives at /slash, and there is no /spark folder left to serve an old bookmark', () => {
  assert.ok(existsSync(join(SRC, 'routes/slash/+page.svelte')), 'routes/slash/+page.svelte is missing');
  assert.ok(!existsSync(join(SRC, 'routes/spark')), 'routes/spark is still there');
});

test('the palette offers Slash by its name, at its address', () => {
  const row = COMMANDS.find((c) => c.id === 'c-slash');
  assert.ok(row, 'no c-slash row in the palette');
  assert.equal(row.href, '/slash');
  assert.equal(row.title, 'Slash');
  assert.ok(!COMMANDS.some((c) => c.id === 'c-spark'));
});

test('the canvas offers ask_slash, the step the kernel lints', () => {
  assert.ok((FLOW_VERBS as readonly string[]).includes('ask_slash'));
  assert.ok(!(FLOW_VERBS as readonly string[]).includes('ask_spark'));
});

test('the key that opens the palette is named for the key, not for the product', () => {
  const ids = BINDINGS.map((b) => b.id);
  assert.ok(ids.includes('palette-slash-key'), 'no palette-slash-key binding');
  assert.ok(!ids.includes('palette-slash'), 'palette-slash still names the key');
});

/* THE WORDS THAT STAY: the chart, the English word, and the history files in `loop/` that keep their names, which 36
   comments here cite as evidence (the survey's section 1). Renaming a citation would point it at a file that does not
   exist. */
const KEPT = /sparkline|sparkle|research-(?:worker-)?spark[a-z-]*\.md/giu;

test('nothing under src says spark, except the chart, the English word and the history it cites', () => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(SRC, path).replaceAll('\\', '/');
      if (/spark/iu.test(entry.name.replace(KEPT, ''))) found.push(`${rel} (its name)`);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (rel === SELF) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/spark/iu.test(line.replace(KEPT, ''))) found.push(`${rel}:${i + 1}`);
        });
    }
  };
  walk(SRC);
  assert.deepEqual(found, [], `${found.length} lines still say spark`);
});
