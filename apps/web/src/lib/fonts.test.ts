/**
 * The fonts' addresses carry their hash, and the shell preloads the same addresses the stylesheet asks for.
 *
 * `static/_headers` keeps `/fonts/*` for a year, which is only safe while a new file is a new address: each
 * `url()` in `packages/skin/tokens.css` ends `?v=` and the first four hex of the file's SHA-256, checked here against
 * both apps' copies, because the site draws from the same sheet. And a preload is used only by a request for the same
 * address, so `src/app.html` preloads exactly the stylesheet's address for each face it names, with `crossorigin`.
 * And the two fallbacks the stacks name second are declared there, Arial sized to each face.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');
const hash = (path: string) => createHash('sha256').update(readFileSync(new URL(path, ROOT))).digest('hex').slice(0, 4);

const tokens = read('packages/skin/tokens.css');
const asked = [...tokens.matchAll(/url\('\/fonts\/([a-z0-9-]+\.woff2)(?:\?v=([0-9a-f]*))?'\)/g)].map((m) => ({ file: m[1] ?? '', v: m[2] }));

test('every font the sheet asks for carries the hash of the file both apps serve', () => {
  assert.ok(asked.length >= 4, `tokens.css names ${asked.length} font file(s)`);
  for (const { file, v } of asked) {
    assert.ok(v !== undefined, `${file} has no ?v=, so a year's cache would keep an old file`);
    for (const app of ['apps/web', 'apps/site']) {
      const at = `${app}/static/fonts/${file}`;
      if (app === 'apps/site' && !existsSync(new URL(at, ROOT))) continue;
      assert.equal(v, hash(at), `${at} hashes to ${hash(at)} and tokens.css asks for ?v=${v}`);
    }
  }
});

test('the shell preloads the one face at the address the style layer asks for, and nothing else', () => {
  const shell = read('apps/web/src/app.html').replace(/<!--[\s\S]*?-->/g, '');
  const style = read('apps/web/src/lib/ui/style.css');
  const face = /url\('\/fonts\/(jakarta\.woff2\?v=([0-9a-f]+))'\)/.exec(style);
  assert.ok(face, 'style.css does not name jakarta.woff2 with a ?v=');
  for (const app of ['apps/web', 'apps/site']) assert.equal(face[2], hash(`${app}/static/fonts/jakarta.woff2`), `${app}'s jakarta.woff2 is not ?v=${face[2]}`);
  const preloads = [...shell.matchAll(/<link rel="preload" href="%sveltekit\.assets%\/fonts\/([^"]+)" as="font" type="font\/woff2" crossorigin \/>/g)].map((m) => m[1]);
  assert.deepEqual(preloads, [face[1]]);
  assert.equal([...shell.matchAll(/rel="preload"/g)].length, preloads.length, 'the one preload is the face');
});

test('the shell declares the two sized fallbacks the stacks name, each on Arial', () => {
  const shell = read('apps/web/src/app.html').replace(/<!--[\s\S]*?-->/g, '');
  for (const [family, local] of [['Geist Fallback', 'Arial'], ['Lexend Fallback', 'Arial Bold']]) {
    const face = new RegExp(`@font-face \\{\\s*font-family: '${family}';\\s*src: local\\('${local}'\\)[^}]*size-adjust: [\\d.]+%;\\s*ascent-override: [\\d.]+%;\\s*descent-override: [\\d.]+%;`).exec(shell);
    assert.ok(face, `no sized ${family} face in the shell`);
    assert.match(tokens, new RegExp(`'${family}'`), `tokens.css does not name ${family} in a stack`);
  }
});
