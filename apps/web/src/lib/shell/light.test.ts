/**
 * SIGN-IN AND SIGN-UP NEVER LOAD THE APP'S FRAME (first hour audit, E14).
 *
 * `/signin` and `/signup` waited for the whole shell, and sign-up for the whole starter catalogue, before a stranger saw
 * a field. What keeps them light is which file imports which, so this reads the files: the root layout imports neither
 * frame, the root load hands sign-in and sign-up the light one before it reads anything of a record, and neither screen's
 * first file imports the record's readers or the catalogue.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { light } from './light.ts';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The specifiers a file imports at its top, `import type` left out: what its chunk waits for. */
const imports = (src: string): string[] =>
  [...src.matchAll(/^\s*import\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?'([^']+)'/gmu)].map((m) => m[1] ?? '');

test('the light screens are sign-in, the Mac app\'s sign-in under it, and sign-up, and no other', () => {
  for (const inner of ['/signin', '/signin/desktop', '/signup']) assert.equal(light(inner), true, inner);
  for (const inner of ['/', '/start', '/invite', '/connect', '/signupx', '/signins', '/s/abc', '/signin/typo', '/signin/desktop/x', '/signup/x']) assert.equal(light(inner), false, inner);
});

test('the root layout imports neither frame, so a screen fetches only the one it draws', () => {
  const layout = imports(read('../../routes/+layout.svelte'));
  assert.ok(!layout.some((s) => /shell\/(?:App|Light)Frame\.svelte$/u.test(s)), layout.join(', '));
});

test('the root load hands the light screens their frame before it asks anything of a record', () => {
  const load = read('../../routes/+layout.ts');
  const first = /export async function load\([\s\S]*?\n\}/u.exec(load)?.[0] ?? '';
  assert.match(first, /if \(light\(here\(event\.url\.pathname\)\)\) return lightLoad\(/u);
  assert.ok(first.indexOf('lightLoad') < first.indexOf('AppFrame.svelte'), 'the app frame is asked for before the light check');
  const lightLoad = /async function lightLoad\([\s\S]*?\n\}/u.exec(load)?.[0] ?? '';
  assert.ok(lightLoad, 'no lightLoad in the root load');
  assert.doesNotMatch(lightLoad, /boot-live|readBoot|AppFrame/u, 'the light screens load the record readers or the app frame again');
});

test("neither screen's first file imports the record's readers, the client or the starter catalogue", () => {
  const heavy = /^(?:@braindog\/seed|@braindog\/client|@braindog\/kernel)|record\/boot-live\.ts$|\/signup\.ts$|start\/(?:propose|offer|question|building|preview)\.ts$/u;
  for (const page of ['../../routes/signin/+page.svelte', '../../routes/signin/desktop/+page.svelte', '../../routes/signup/+page.svelte']) {
    const found = imports(read(page)).filter((s) => heavy.test(s));
    assert.deepEqual(found, [], `${page} imports ${found.join(', ')}`);
  }
});

test('sign-up asks for the page and what it reads a sentence with only once its first step has painted', () => {
  const page = read('../../routes/signup/+page.svelte');
  assert.match(page, /requestAnimationFrame\(\(\) =>\s*setTimeout\(/u);
  assert.match(page, /import\('\.\/Signup\.svelte'\)/u);
  assert.doesNotMatch(page, /from '\.\/Signup\.svelte'/u);
});

test("the build's list of light pages is the same three screens, so their imports ride the light frame's preloads", () => {
  const config = read('../../../vite.config.ts');
  const source = /const LIGHT_PAGE = \/(.+)\/u;/u.exec(config)?.[1];
  assert.ok(source, 'no LIGHT_PAGE in vite.config.ts');
  const page = new RegExp(source, 'u');
  for (const at of ['signin', 'signin/desktop', 'signup']) assert.ok(page.test(`/x/src/routes/${at}/+page.svelte`), at);
  for (const at of ['start', 'invite', 'connect']) assert.ok(!page.test(`/x/src/routes/${at}/+page.svelte`), at);
});
