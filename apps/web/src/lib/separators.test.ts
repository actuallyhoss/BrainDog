/**
 * A SEPARATOR KEEPS ITS SPACES (SF2).
 *
 * Svelte trims the spaces at the ends of a text node inside an element, so `<span class="sep"> · </span>` drew "a·b"
 * in an inline line (HubRows, the late cell of a list), and a bare `·` drew it everywhere. A separator is written
 * `<span class="sep">{' · '}</span>`, whose spaces are a string and are kept. This refuses the trimmed spellings,
 * `> · <` and `>·<`, in any component of the app.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../', import.meta.url));

const svelte = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? svelte(join(dir, e.name)) : e.name.endsWith('.svelte') ? [join(dir, e.name)] : [],
  );

const files = svelte(SRC);

test('no component writes a separator whose spaces Svelte trims', () => {
  assert.ok(files.length > 100, `the walk found ${files.length} components, so it is not reading the app`);
  const trimmed = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/gu, '');
    return [...text.matchAll(/> ?· ?</gu)].map((m) => `${relative(SRC, file).replaceAll('\\', '/')}:${text.slice(0, m.index).split('\n').length}`);
  });
  assert.deepEqual(trimmed, [], `write the separator as {' · '}: ${trimmed.join(', ')}`);
});

test('and the five that did now keep their spaces', () => {
  for (const file of [
    'routes/settings/[area]/areas/Pages.svelte',
    'routes/r/[register]/parts/ListTable.svelte',
    'routes/automations/HubRows.svelte',
    'routes/jobs/+page.svelte',
    'routes/vault/+page.svelte',
  ])
    assert.match(readFileSync(join(SRC, file), 'utf8'), /\{' · '\}<\/span>/u, file);
});
