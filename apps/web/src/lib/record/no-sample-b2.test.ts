/**
 * `api.ts` is the render helpers live screens draw with, and the
 * sample's readers are a test fixture no shipped file can reach.
 *
 * WHAT WAS WRONG, MEASURED ON THE CODE BEFORE THIS CHANGE. `api.ts` was two modules in one file: the helpers every live
 * screen draws a cell, a column or a name with, and the eight readers that answered the app's calls out of the sample
 * (`boot`, `list`, `entry`, `search`, `page`, `values`, `job`, `metric`), plus a line re-exporting twenty-five of the
 * sample's tables. Six shipped files still called a reader or read a table through it. The Add a block sheet previewed
 * every kind from the sample's page of the same slug, on any record. `/s/<token>` drew the sample's Money page for one
 * token written into the route. `/jobs/<id>` drew the sample's run transcript under the record's chrome. `/decide`
 * worded its aim from the sample's queue. Settings listed the sample's unplaced pages as this record's pen. And the
 * shell's type was spelled as `ReturnType<typeof boot>`, the sample's answer, so the sample could not leave without the
 * shell losing its shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as api from './api.ts';
import * as held from './held.ts';

/* THE EIGHT READERS ABOVE, and two under other names: `pages` resolved the sample's declarations against the
   sample's rows, and `heldBy` counted the sample's rows. Settings read the first as a record's pen. */
const READERS = ['boot', 'list', 'entry', 'search', 'page', 'values', 'job', 'metric', 'pages', 'heldBy'] as const;

/* THE TABLES THE OLD LAST LINES RE-EXPORTED, every one of them the sample's. `REGISTERS` is left out on purpose: it is
   now `held.ts`'s table of what the record declared, and the first test holds it to that. */
const TABLES = [
  'AUDIT', 'AUTH_METHODS', 'DEPLOYMENT', 'DEVICES', 'INBOX', 'JOB', 'JOBS', 'NOW', 'PACKS', 'PAGES', 'PASSKEYS', 'QUESTIONS',
  'DECIDED', 'ROWS', 'NEWS', 'SNAPSHOTS', 'SNAPSHOTS_KEPT', 'SIGNING_KEY', 'SOURCES', 'TODAY', 'TOKENS', 'VAULT', 'VIEWS',
  'PEOPLE_ACCESS',
];

test('api.ts exports no reader of the sample and none of its tables', () => {
  const exported = new Set(Object.keys(api));
  assert.deepEqual(READERS.filter((name) => exported.has(name)), [], 'a mock reader is still exported where live screens import from');
  assert.deepEqual(TABLES.filter((name) => exported.has(name)), [], "a sample's table is still re-exported from the helpers");
  assert.equal(api.REGISTERS, held.REGISTERS, 'the declarations the helpers read are not the ones the record taught this tab');
});

test('the readers answer from the test-only fixture module, as they did from api.ts', async () => {
  const fixture = (await import('./fixtures/readers.ts')) as Record<string, unknown>;
  for (const name of READERS) assert.equal(typeof fixture[name], 'function', `fixtures/readers.ts has no ${name}`);
  const read = fixture as unknown as { boot: () => { index: { slug: string } }; entry: (r: string, s: number) => unknown };
  assert.equal(read.boot().index.slug, 'the-studio');
  assert.notEqual(read.entry('obligations', 1), undefined);
});

/* COMMENTS ARE LEFT OUT, so a paragraph saying where a reader used to be is not a read of it. */
const code = (path: string): string =>
  readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, '');

const SRC = fileURLToPath(new URL('../../', import.meta.url));
function shipped(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : shipped(path);
    return /\.(ts|svelte)$/u.test(name) && !/\.test\.ts$/u.test(name) ? [path] : [];
  });
}

/** Every name one `import { ... } from '...api.ts'` brings in, `type` or not, by the name it has in `api.ts`. */
const fromApi = (source: string): string[] =>
  [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'[^']*\/api\.ts'/gu)].flatMap((m) =>
    m[1]!.split(',').map((part) => part.trim().replace(/^type\s+/u, '').split(/\s+as\s+/u)[0]!).filter(Boolean),
  );

test('no shipped file imports a reader of the sample, a table of it, or the fixture module', () => {
  const offenders: string[] = [];
  for (const path of shipped(SRC)) {
    const at = relative(SRC, path).replaceAll('\\', '/');
    const source = code(path);
    for (const name of fromApi(source)) if ((READERS as readonly string[]).includes(name) || TABLES.includes(name)) offenders.push(`${at} ${name}`);
    if (/from\s*'[^']*\/fixtures\//u.test(source) || /import\(\s*'[^']*\/fixtures\//u.test(source)) offenders.push(`${at} fixtures/`);
  }
  assert.deepEqual(offenders, []);
});
