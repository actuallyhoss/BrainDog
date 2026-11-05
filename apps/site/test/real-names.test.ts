/**
 * NO NAME FROM THE OWNER'S RECORD REACHES THE SITE (launch call 5: the drawn product runs on an invented founder,
 * never his record). Not his projects, his people, his companies or his handle, in the sources the site's drawings
 * and words are made from, or in the readable text of the pages a stranger lands on.
 *
 * THE NAMES ARE NEVER SPELLED HERE, or anywhere git tracks (`tools/gates/public-clean.mjs`, `shell-words.mjs`). One
 * comes from `public-clean`'s `WORDS`, put together at run time; the rest are `{ hash, length }` in
 * `real-names.hashes.json`, salted the way `shell-words`' `hashOf` salts them. A hit says the file, the line and the
 * name's length, and never the name.
 *
 * WHOLE WORDS AND TWO-WORD PHRASES. Text is read lower case as words of letters and digits, a dotted word read both
 * whole and by its parts, and each word and each pair of neighbouring words is hashed. Plain words that are also
 * names of his (the ones a sentence about a brain, beans or a wallet would say) are not on the list. `WORDS`, which
 * are nobody's plain words, are caught inside a longer word too, as `public-clean` catches them.
 *
 * THE ONE ALLOWED SPELLING is the account the repository lives under, in a github.com address given as an href.
 *
 * (b) READS THE BUILD, so it is the integrator's after one site build (`built.ts`); a missing build is a skip that says so.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BUILD, missing, shown, when } from './built.ts';

const SITE = fileURLToPath(new URL('../', import.meta.url));
const gate = (name: string) => new URL(`../../../tools/gates/${name}`, import.meta.url).href;

const { WORDS, ALLOWED_SPELLING } = (await import(gate('public-clean.mjs'))) as {
  WORDS: readonly string[];
  ALLOWED_SPELLING: string;
};
const { hashOf } = (await import(gate('shell-words.mjs'))) as { hashOf: (word: string) => string };

type Entry = { hash: string; length: number };
const FILE: { hashes: Entry[] } = JSON.parse(readFileSync(new URL('./real-names.hashes.json', import.meta.url), 'utf8'));

/** Hash to length, for every name: the file's, and `WORDS` hashed here. */
const NAMES = new Map<string, number>([...FILE.hashes.map((e) => [e.hash, e.length] as const), ...WORDS.map((w) => [hashOf(w), w.length] as const)]);

/** A name found: where it is and how long it is. The name itself is never kept. */
type Hit = { file: string; line: number; length: number };

const WORD = /[a-z0-9]+(?:\.[a-z0-9]+)*/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* The account in a github.com address given as an href (`href="…"`, `href: '…'`), which is taken out before reading. */
const ALLOWED = new RegExp(`(href\\s*[:=]\\s*\\{?\\s*["'\`]https?://(?:www\\.)?github\\.com/)${escape(ALLOWED_SPELLING)}(?=[/"'\`])`, 'g');

/** Every name `text` holds, by line. `names` is the table to read against, which a planted fault can bring its own of. */
function hitsIn(text: string, file: string, names: ReadonlyMap<string, number> = NAMES, words: readonly string[] = WORDS): Hit[] {
  const plain = text.toLowerCase().replace(ALLOWED, '$1');
  const starts = [0];
  for (let i = plain.indexOf('\n'); i >= 0; i = plain.indexOf('\n', i + 1)) starts.push(i + 1);
  const lineOf = (at: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const found = (at: number, length: number) => {
    const line = lineOf(at);
    const key = `${line}:${length}`;
    if (!seen.has(key)) hits.push({ file, line, length });
    seen.add(key);
  };
  /* The parts in order, a dotted word's parts after it, so neighbouring parts make the phrases. */
  const parts: { text: string; at: number }[] = [];
  for (const m of plain.matchAll(WORD)) {
    const token = m[0];
    const at = m.index;
    if (names.has(hashOf(token))) found(at, token.length);
    const inside = words.find((w) => token.includes(w));
    if (inside !== undefined) found(at, inside.length);
    let offset = 0;
    for (const part of token.split('.')) {
      parts.push({ text: part, at: at + offset });
      offset += part.length + 1;
    }
  }
  for (let i = 0; i < parts.length; i++) {
    const one = parts[i];
    if (!one) continue;
    if (names.has(hashOf(one.text))) found(one.at, one.text.length);
    const two = parts[i + 1];
    if (two) {
      const phrase = `${one.text} ${two.text}`;
      if (names.has(hashOf(phrase))) found(one.at, phrase.length);
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.length - b.length);
}

/** How a hit is said: the file, the line, the length. */
const said = (h: Hit) => `${h.file}:${h.line} holds a name from the owner's record (${h.length} characters)`;

/** Every file under `dir`, or none when it does not exist yet. */
function filesUnder(dir: string, keep: (file: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile() && keep(f))
    .sort();
}

const SOURCES = [
  ...['demo', 'copy', 'home', 'desk', 'slash', 'connect'].flatMap((d) => filesUnder(join(SITE, 'src/lib', d))),
  ...filesUnder(join(SITE, 'src/routes'), (f) => f.endsWith('.svelte')),
];

/**
 * What a person reads off a served page: its text, and the words a page gives a reader without drawing them (a
 * title, an alt, an aria-label, a meta description). Scripts, styles and comments are not read, and an href is not
 * text, which is how the one allowed address passes. Line breaks are kept, so a hit names the page's own line.
 */
function readable(html: string): string {
  const said = (s: string) =>
    s
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" })[e] ?? ' ');
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return said(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blank)
      .replace(/<!--[\s\S]*?-->/g, blank)
      .replace(/<[^>]*>/g, (tag) => {
        const words = [...tag.matchAll(/\s(?:alt|title|aria-label|content|placeholder)\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((m) => m[2] ?? m[3] ?? '');
        return `${blank(tag)} ${words.join(' ')} `;
      }),
  );
}

test('the sources the site is drawn and worded from hold no name from the owner\'s record', () => {
  assert.ok(SOURCES.some((f) => f.endsWith(join('demo', 'maya.ts'))), 'the made-up record is not where the site reads it');
  const hits = SOURCES.flatMap((f) => hitsIn(readFileSync(f, 'utf8'), relative(SITE, f)));
  assert.deepEqual(hits.map(said), []);
});

const PAGES = shown(['index.html', 'slash.html', 'agents.html', 'pricing.html']);

test('the pages a stranger lands on read no name from the owner\'s record', when(missing(PAGES, 'this reads the pages as served')), () => {
  const hits = PAGES.flatMap((p) => hitsIn(readable(readFileSync(new URL(p, BUILD), 'utf8')), `build/${p}`));
  assert.deepEqual(hits.map(said), []);
});

test('a planted name fails with its file and line, and the name is never printed', () => {
  const name = WORDS[0] ?? '';
  const dir = mkdtempSync(join(tmpdir(), 'real-names-'));
  try {
    const file = join(dir, 'planted.ts');
    writeFileSync(file, `export const fine = 'Maya Okafor';\n// nothing here\nexport const planted = 'Ask ${name.toUpperCase()} today';\n`);
    const hits = hitsIn(readFileSync(file, 'utf8'), 'planted.ts');
    assert.deepEqual(hits, [{ file: 'planted.ts', line: 3, length: name.length }]);
    const message = hits.map(said).join('\n');
    assert.match(message, /^planted\.ts:3 /);
    assert.ok(!message.toLowerCase().includes(name), 'the message spells the name');
    assert.throws(() => assert.deepEqual(hits.map(said), []), (e: Error) => !e.message.toLowerCase().includes(name));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hashed phrase is caught across a line break and through markup, and its parts alone are not', () => {
  const names = new Map([[hashOf('dana reyes'), 10]]);
  assert.deepEqual(hitsIn('<p>Paid\nDana</p>\n<b>Reyes</b>', 'p.html', names, []), []);
  const page = readable('<p>Paid by Dana\n<b>Reyes</b> today</p>');
  assert.deepEqual(hitsIn(page, 'p.html', names, []), [{ file: 'p.html', line: 1, length: 10 }]);
  assert.deepEqual(hitsIn('Dana alone, and Reyes alone', 'p.ts', names, []), []);
});

test('the account is allowed in a github.com href and nowhere else', () => {
  const at = `https://github.com/${ALLOWED_SPELLING}/braindog`;
  assert.deepEqual(hitsIn(`{ href: '${at}' }\n<a href="${at}">The code</a>`, 'a.svelte'), []);
  assert.equal(hitsIn(`<p>${at}</p>`, 'a.svelte').length, 1);
  assert.equal(hitsIn(readable(`<a href="${at}">code</a>`), 'a.html').length, 0);
  assert.equal(hitsIn(readable(`<a href="/">${at}</a>`), 'a.html').length, 1);
});

test('every hashed name is a whole lower-case word or two, with its length kept', () => {
  assert.ok(FILE.hashes.length >= 20, 'the list of names is shorter than the record it guards');
  for (const e of FILE.hashes) {
    assert.match(e.hash, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(e.length) && e.length >= 4, `${e.hash.slice(0, 8)} has no usable length`);
  }
});
