/**
 * The docs at `/docs`, held to the shape `src/lib/docs/pages.ts` reads them in and to the list an agent reads.
 *
 * THE FOLDER IS THE LIST (site.md C7): a page is a file under `src/docs/<NN-section>/<NN-slug>.md`, and
 * `lib/docs/index.ts` finds them with a Vite glob. So this walks the same folder and hands each file to
 * `docOf`, the function the site builds each page with, under the key the glob gives it. A file that breaks
 * the shape stops the build; this says which file, and why, without anybody having to build first.
 *
 * `/llms.txt` IS READ FROM `build/`, because it is a prerendered endpoint and the list it prints is what an
 * agent is handed. A missing build is a skip that says so, as it is in `content.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { bodyOf, docOf, type Doc } from '../src/lib/docs/pages.ts';
import { parse } from '../../../packages/render/src/parse.ts';

const ROOT = new URL('../src/docs/', import.meta.url);
const BUILD = new URL('../build/', import.meta.url);
const LLMS = new URL('llms.txt', BUILD);

/** Every `.md` under `src/docs/`, as the glob in `lib/docs/index.ts` keys it: `/src/docs/01-start/01-welcome.md`. */
const files: [string, string][] = existsSync(ROOT)
  ? readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
      .map((rel) => rel.replaceAll('\\', '/'))
      .filter((rel) => rel.endsWith('.md'))
      .sort()
      .map((rel): [string, string] => [`/src/docs/${rel}`, readFileSync(new URL(rel, ROOT), 'utf8')])
  : [];

const NO_BUILD = existsSync(LLMS)
  ? null
  : 'apps/site/build/llms.txt is missing. Run "pnpm --filter @braindog/site build" first: this check reads the list ' +
    'an agent is served, and a check with nothing to read is a pass that means nothing.';

/** `{ skip: reason }` or nothing, because `exactOptionalPropertyTypes` refuses `{ skip: undefined }`. */
const when = (reason: string | null): { skip: string } | Record<string, never> => (reason ? { skip: reason } : {});

/** Every file as a page, or the sentence `docOf` stops the build with. */
const read = (): { docs: Doc[]; broken: string[] } => {
  const docs: Doc[] = [];
  const broken: string[] = [];
  for (const [key, src] of files) {
    try {
      docs.push(docOf(key, src));
    } catch (error) {
      broken.push(error instanceof Error ? error.message : `${key}: ${String(error)}`);
    }
  }
  return { docs, broken };
};

test('the docs folder holds pages, and every one is in a section folder and opens with its title', () => {
  assert.ok(files.length > 0, 'src/docs/ holds no .md page, so /docs lists nothing and this file checks nothing');
  const { broken } = read();
  assert.deepEqual(broken, [], `${broken.length} docs file(s) would stop the build:\n  - ${broken.join('\n  - ')}`);
});

/**
 * A TITLE AND A SUMMARY ON EVERY PAGE. The summary is the first paragraph, and it is what the docs' search,
 * the section cards and `/llms.txt` say under the title, so a page that opens on a heading or a list is a
 * page listed with nothing beside it.
 */
test('every doc has a title and a summary', () => {
  const wrong = read()
    .docs.filter((d) => d.title.trim() === '' || d.summary.trim() === '')
    .map((d) => `${d.file}: ${d.title.trim() === '' ? 'no title' : 'no summary, so it opens on something other than a paragraph'}`);
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

/**
 * NO DEGRADED SEGMENT IN A DOC. A page teaching the dialect shows its fences working; a fence the renderer
 * refuses draws its own sentence saying what is wrong, which is a docs page teaching the wrong thing.
 */
test('every doc parses with no degraded segment', () => {
  const wrong: string[] = [];
  for (const d of read().docs) {
    for (const s of parse(bodyOf(d.src), { page: true })) {
      if (s.type === 'degraded') wrong.push(`${d.file}: ${s.code}, "${s.fix}" over ${s.raw.split('\n')[0] ?? ''}`);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} fence(s) in the docs degrade:\n  - ${wrong.join('\n  - ')}`);
});

test('no two docs share an address', () => {
  const paths = read().docs.map((d) => d.path);
  const twice = paths.filter((p, i) => paths.indexOf(p) !== i);
  assert.deepEqual(twice, [], `two files are drawn at one address: ${twice.join(', ')}`);
});

/**
 * `/llms.txt` NAMES EVERY DOC, by the raw `.md` address an agent follows, and the build holds both that
 * address and the page's own.
 */
test('/llms.txt names every doc, and the build serves each doc as a page and as text', when(NO_BUILD), () => {
  const llms = readFileSync(LLMS, 'utf8');
  const wrong: string[] = [];
  for (const d of read().docs) {
    if (!llms.includes(`(https://brain.dog${d.path}.md)`)) wrong.push(`llms.txt does not name ${d.path}.md`);
    const rel = d.path.slice(1);
    if (!existsSync(new URL(`${rel}.md`, BUILD))) wrong.push(`build/ holds no ${rel}.md`);
    if (![`${rel}.html`, `${rel}/index.html`].some((f) => existsSync(new URL(f, BUILD)))) wrong.push(`build/ holds no page for ${d.path}`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
});
