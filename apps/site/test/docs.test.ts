/**
 * The docs at `/docs`, held to the shape `src/lib/docs/pages.ts` reads them in and to the list an agent reads.
 *
 * THE FOLDER IS THE LIST: a page is a file under `src/docs/<NN-section>/<NN-slug>.md`, and
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

import { bodyOf, docOf, launched, type Doc } from '../src/lib/docs/pages.ts';
import { LAUNCH } from '../src/lib/launch.ts';
import { CODEX_LISTED } from '../src/lib/agents.ts';
import { parse } from '../../../packages/render/src/parse.ts';
import { BUILD, missing, when } from './built.ts';

const ROOT = new URL('../src/docs/', import.meta.url);
const LLMS = new URL('llms.txt', BUILD);

/** Every `.md` under `src/docs/`, as the glob in `lib/docs/index.ts` keys it: `/src/docs/01-start/01-welcome.md`. */
const files: [string, string][] = existsSync(ROOT)
  ? readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
      .map((rel) => rel.replaceAll('\\', '/'))
      .filter((rel) => rel.endsWith('.md'))
      .sort()
      .map((rel): [string, string] => [`/src/docs/${rel}`, readFileSync(new URL(rel, ROOT), 'utf8')])
  : [];

const NO_BUILD = missing(['llms.txt'], 'this check reads the list an agent is served');

/** Every file as a page, or the sentence `docOf` stops the build with. */
const read = (): { docs: Doc[]; broken: string[] } => {
  const docs: Doc[] = [];
  const broken: string[] = [];
  for (const [key, src] of files) {
    try {
      docs.push(docOf(key, src, { ...LAUNCH, codex: CODEX_LISTED }));
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

/**
 * THE DOCS IN LOOK B (LAUNCH 103 job 7), read off the source because no browser runs here: the index
 * opens on `PageHead` with the search in its slot, a page reads on one sheet of paper with its nav and contents flat
 * on the board, and nothing in the docs still draws the old tiles, wells, glass or palette.
 */
const SRC = new URL('../src/', import.meta.url);
const source = (rel: string): string => readFileSync(new URL(rel, SRC), 'utf8');
const DRAWN = [
  'routes/docs/+page.svelte',
  'routes/docs/[section]/[slug]/+page.svelte',
  'lib/docs/Body.svelte',
  'lib/docs/Nav.svelte',
  'lib/docs/Search.svelte',
  'lib/docs/CopyText.svelte',
];

test('the docs index opens on the page head with the search in it', () => {
  const index = source('routes/docs/+page.svelte');
  const head = index.slice(index.indexOf('<PageHead'), index.indexOf('</PageHead>'));
  assert.ok(head.length > 0, 'routes/docs/+page.svelte draws no PageHead');
  assert.match(head, /<Search\b[^>]*\bnight\b/, 'the search is not in the head, drawn for the night ground');
  assert.match(head, /href="\/llms\.txt"/, 'the link for agents left the head');
});

test('the docs draw no tile, well, glass or old palette, and their buttons are quiet and small', () => {
  const old = /class="[^"]*\b(tile|tiles|well|band|glass|btn-sm|btn-primary)\b|var\(--(bg|s1|dim|line|e1|r-lg|on-ink|hover-wash)\)/;
  const wrong = DRAWN.filter((rel) => old.test(source(rel))).map((rel) => `${rel}: ${source(rel).match(old)?.[0]}`);
  assert.deepEqual(wrong, [], wrong.join('\n'));
  const page = source('routes/docs/[section]/[slug]/+page.svelte');
  for (const btn of page.match(/class="btn[^"]*"/g) ?? []) assert.equal(btn, 'class="btn quiet sm"');
  assert.match(source('lib/docs/CopyText.svelte'), /class="btn quiet sm"/);
});

test('a doc page puts its title on a night strip and its text on paper at 68ch', () => {
  const page = source('routes/docs/[section]/[slug]/+page.svelte');
  assert.match(page, /<header class="night strip">[\s\S]*<h1 class="doc-title"/, 'the title is not on the night strip');
  assert.match(page, /\.board \{[^}]*background: var\(--board\)/, 'the nav and contents are not on the board');
  const body = source('lib/docs/Body.svelte');
  assert.match(body, /\.doc-body \{[^}]*background: var\(--paper\)/, 'the page is not on paper');
  assert.match(body, /max-inline-size: 68ch/, 'the reading measure is not 68ch');
});

/**
 * A PART HELD UNTIL LAUNCH (`launched`): kept without its markers when its flag is on, gone when it is off, and a marker
 * naming no flag or left open stops the build. The plugin's line names the repository, so it waits on `LAUNCH.repo`.
 */
test('a launch part shows only when its flag is on', () => {
  const src = '# T\n\nBefore.\n\n<!-- launch: repo -->\n## Plugin\n\nAdd it.\n<!-- /launch -->\n\nAfter.\n';
  assert.equal(launched('k', src, { repo: true }), '# T\n\nBefore.\n\n## Plugin\n\nAdd it.\n\nAfter.\n');
  assert.equal(launched('k', src, { repo: false }), '# T\n\nBefore.\n\nAfter.\n');
  assert.throws(() => launched('k', src, { cli: true }), /not a launch flag/);
  const either = 'A.\n\n<!-- launch: codex -->\nWith Codex.\n<!-- /launch -->\n<!-- launch: !codex -->\nWithout it.\n<!-- /launch -->\n\nB.\n';
  assert.equal(launched('k', either, { codex: true }), 'A.\n\nWith Codex.\n\nB.\n');
  assert.equal(launched('k', either, { codex: false }), 'A.\n\nWithout it.\n\nB.\n');
  assert.throws(() => launched('k', '<!-- launch: repo -->\nx\n', { repo: true }), /open/);
  assert.throws(() => launched('k', 'x\n<!-- /launch -->\n', { repo: true }), /never opened/);
});

test('no docs page names the repository or the plugin while LAUNCH.repo is off', { skip: LAUNCH.repo }, () => {
  const { docs } = read();
  for (const d of docs) assert.doesNotMatch(d.src, /actuallyhoss\/BrainDog|\/plugin (?:marketplace|install)/u, `${d.file} names the private repository`);
});

test('no docs page names Codex while CODEX_LISTED is off', { skip: CODEX_LISTED }, () => {
  const { docs } = read();
  for (const d of docs) assert.doesNotMatch(d.src, /codex/iu, `${d.file} names Codex`);
});

/** "EDIT ON GITHUB" ONLY ONCE THE REPOSITORY IS PUBLIC: until then the address answers 404 to everyone but the owner. */
test('the edit link on a doc page waits on LAUNCH.repo', () => {
  const page = source('routes/docs/[section]/[slug]/+page.svelte');
  assert.match(page, /LAUNCH\.repo \? SOURCE : null/);
  assert.match(page, /\{#if edit\}<a [^>]*href=\{edit\}/);
});
