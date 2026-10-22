/**
 * `@braindog/kernel/constants` stays light, and says what the root says.
 *
 * THE APP'S FIRST OPEN IMPORTS IT INSTEAD OF THE KERNEL, so it is only worth anything while it reaches nothing heavy. Read
 * off the source: the file itself, and every file it imports, may import other files only as types, so one value import
 * added to any of them (a helper out of `pages.ts`, say) is red here rather than a few hundred kilobytes on a phone.
 *
 * AND EVERY NAME IT EXPORTS IS THE SAME VALUE THE ROOT EXPORTS, because `pages.ts`, `weigh.ts` and `people.ts` export
 * them again from here, and a second definition anywhere would let the two disagree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as constants from '../src/constants.ts';
import * as kernel from '../src/index.ts';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** The relative files a source imports or exports from as values, comments taken out. */
function valueImports(file: string): string[] {
  const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
  const out: string[] = [];
  for (const m of source.matchAll(/^\s*(?:import|export)\s+([\s\S]*?)\s+from\s+'([^']+)'/gmu)) {
    const [, what = '', from = ''] = m;
    if (/^type\s/u.test(what)) continue;
    const names = /^\{([\s\S]*)\}$/u.exec(what.trim())?.[1]?.split(',').map((n) => n.trim()).filter(Boolean);
    if (names && names.every((n) => n.startsWith('type '))) continue;
    out.push(from);
  }
  return out;
}

test('the constants import nothing but light files, and those import nothing but types', () => {
  const direct = valueImports(join(SRC, 'constants.ts'));
  assert.ok(direct.length > 0, 'constants.ts re-exports the light files it names');
  for (const from of direct) {
    assert.match(from, /^\.\/[a-z-]+\.ts$/u, `constants.ts imports ${from}, and it imports only files beside it`);
    const file = join(dirname(join(SRC, 'constants.ts')), from);
    assert.deepEqual(valueImports(file), [], `${from} imports values, so the constants reach whatever it imports`);
  }
});

test('every constant is the value the root exports under the same name', () => {
  /* `SUMS` ALONE IS NOT THE ROOT'S: `pages.ts` reads it and the root never exported it, so it is not a name to add. */
  const rootless = Object.keys(constants).filter((name) => !Object.hasOwn(kernel, name));
  assert.deepEqual(rootless, ['SUMS']);
  for (const [name, value] of Object.entries(constants))
    if (Object.hasOwn(kernel, name)) assert.equal((kernel as Record<string, unknown>)[name], value, `${name} is a second value, not the root's`);
});

test('the subpath is the package export the app reads', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { exports: Record<string, string> };
  assert.equal(pkg.exports['./constants'], './src/constants.ts');
});
