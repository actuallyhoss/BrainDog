/**
 * `public-clean`: the repository carries no private name or figure, and the files a stranger reads about the licence say
 * what they must.
 *
 *   node tools/gates/public-clean.mjs [root]
 *
 * FOUR PARTS, over every file git tracks (or, on a planted tree with no repository of its own, every file under it):
 *   (a) none of the private words, read case-blind, where the one allowed spelling is the account name the
 *       repository lives under (`ALLOWED_SPELLING`);
 *   (b) `LICENSE` and `apps/cli/LICENSE` are Apache-2.0 and name Quartz Apps LLC, `packages/render/LICENSE` is MIT and
 *       names it, `LICENSING.md` credits Lucide, and the root holds no `NOTICE` and no `CHANGELOG.md`;
 *   (c) `README.md` has a Licence section naming both licences, no price, and no image but the banner and the screenshot;
 *   (d) when `~/.braindog/private-terms.txt` exists, each of its lines is searched for too, and a hit prints the file and
 *       the line and never the term. CI has no such file and runs (a) to (c).
 *
 * THE WORDS ARE NOT WRITTEN HERE. The scope's test of done is a plain `git grep -i` over the tree printing nothing, and
 * a gate that spelled the words out would be one of its hits for good. They are put together at run time, and the
 * committed negative seeds a part (b) fault; `test/public-clean.test.mjs` plants the words in a temporary tree.
 *
 * TODAY'S HITS ARE ALLOWED, AND THE LIST ONLY SHRINKS. On 9 October a hundred tracked files named one of the words,
 * nearly all of them tests written from the owner's own rows. Fixing them is a sweep in small domains, later, so
 * `ALLOWED` holds each file with the number of its lines that name one. A file not on it, or a file with more such lines
 * than its number, is a finding; a file with fewer is green and printed as one that can come off or come down.
 * `test/public-clean.test.mjs` holds the list's size to a ceiling, so growing it is two edits nobody makes by accident.
 *
 * THE BANNER IS AN IMAGE, AND IT IS ALLOWED BY NAME. (c) refuses every image in the README, because a badge is an image
 * and a rule about badges alone is a rule about one spelling of a URL. The README opens with the product's banner in a
 * light and a dark file, so those two paths are `BANNER`, and any other image is a finding. The one picture of the
 * product under it, again light and dark, is `SCREENSHOT`, taken on the seed and never on anyone's record.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The one word, lower case, put together here so no file in the repository spells it. Every other private name is on the
 * owner's machine (`privateTermsFile`), because a list of them in a public repository would publish the list.
 */
export const WORDS = ['ho' + 'ss'];
/** The one spelling that holds the first word and is public: the account the repository lives under. */
export const ALLOWED_SPELLING = 'actually' + WORDS[0];

/** The README's banner, the one image it may carry: the light file and the dark one. */
export const BANNER = ['.github/media/banner-light.svg', '.github/media/banner-dark.svg'];
/** The README's one picture of the product, on the seed: the light file and the dark one. */
export const SCREENSHOT = ['.github/media/screenshot-light.png', '.github/media/screenshot-dark.png'];

/** Where the private list lives on the owner's machine; `BRAINDOG_PRIVATE_TERMS` points a test at its own. */
export const privateTermsFile = () => process.env.BRAINDOG_PRIVATE_TERMS ?? join(homedir(), '.braindog', 'private-terms.txt');

/** Whether `root` is a repository's own top, which a planted tree inside this one is not. */
export function isRepository(root) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  return top.status === 0 && realpathSync(top.stdout.trim()) === realpathSync(root);
}

/**
 * Every file the gate reads, repository-relative with `/`. `git ls-files` when the root is a repository's own top, so
 * what is read is what would be published; a walk otherwise, which is a planted tree inside this one.
 */
export function filesOf(root) {
  if (isRepository(root)) {
    const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (listed.status !== 0) return null;
    return listed.stdout.split('\0').filter(Boolean);
  }
  const out = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`);
      else out.push(`${rel}${name}`);
    }
  };
  walk(root, '');
  return out.sort();
}

/** A file's text, or `null` when it is gone from the working tree or is binary (a NUL in its first 8000 bytes, as git). */
export function textOf(root, rel) {
  let bytes;
  try {
    bytes = readFileSync(join(root, rel));
  } catch {
    return null;
  }
  if (bytes.subarray(0, 8000).includes(0)) return null;
  return bytes.toString('utf8');
}

/** (a) Each line naming one of the words, as `{ line, word }`, read case-blind with the allowed spelling taken out. */
export function privateWords(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const plain = lines[i].toLowerCase().replaceAll(ALLOWED_SPELLING, '');
    const word = WORDS.find((w) => plain.includes(w));
    if (word !== undefined) out.push({ line: i + 1, word });
  }
  return out;
}

/**
 * (b) The licence files, as findings `{ file, why }`. `read(rel)` is the file's text, or `null` when the tree does not
 * carry it. Each rule closes one requirement of the launch scope, named beside it.
 */
export function licenceFindings(files, read) {
  const out = [];
  const must = (file, why, ...needles) => {
    const text = files.includes(file) ? read(file) : null;
    if (text === null) return out.push({ file, why: `is missing, and ${why}` });
    for (const [needle, said] of needles) if (!needle.test(text)) out.push({ file, why: `does not ${said}, and ${why}` });
  };
  const apache = [/Apache License/u, 'say Apache License'];
  const two = [/Version 2\.0/u, 'say Version 2.0'];
  const quartz = [/Quartz Apps LLC/u, 'name Quartz Apps LLC'];
  must('LICENSE', 'the repository is open source under Apache-2.0', apache, two, quartz);
  must('apps/cli/LICENSE', 'the command ships under Apache-2.0', apache, two, quartz);
  must('packages/render/LICENSE', 'packages/render is MIT', [/MIT License/u, 'say MIT License'], quartz);
  must('LICENSING.md', 'the glyphs are Lucide\'s and say so', [/Lucide/u, 'credit Lucide']);
  /* AT THE ROOT ONLY. Two third-party notices sit deeper in (the glyphs' and the site's) and are right where they are. */
  for (const file of files.filter((f) => /^NOTICE(?:\.\w+)?$/iu.test(f)))
    out.push({ file, why: 'is a NOTICE at the root, and the repository carries none' });
  for (const file of files.filter((f) => /^CHANGELOG(?:\.\w+)?$/iu.test(f)))
    out.push({ file, why: 'is a changelog at the root, and the changelog is the site\'s' });
  return out;
}

/** A price as a README would print one: a currency sign or code beside a number, or a rate per month, year or seat. */
const PRICE = /[$€£¥]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|EGP)\b|\b(?:USD|EUR|GBP|EGP)\s?\d|\bper (?:month|year|seat|user)\b|\/(?:mo|month|yr|year)\b/iu;

/** (c) The README, as findings `{ line, why }`. */
export function readmeFindings(text) {
  const out = [];
  const lines = text.split('\n');
  const heading = lines.findIndex((l) => /^#{1,6}\s+Licen[cs]e\b/iu.test(l));
  if (heading === -1) out.push({ line: 1, why: 'has no Licence section, and the README names its licences' });
  else {
    const level = /^#+/u.exec(lines[heading])[0].length;
    const after = lines.slice(heading + 1);
    const end = after.findIndex((l) => /^#+\s/u.test(l) && /^#+/u.exec(l)[0].length <= level);
    const body = (end === -1 ? after : after.slice(0, end)).join('\n');
    if (!/Apache/u.test(body)) out.push({ line: heading + 1, why: 'has a Licence section that does not name Apache-2.0' });
    if (!/\bMIT\b/u.test(body)) out.push({ line: heading + 1, why: 'has a Licence section that does not name MIT' });
  }
  const IMAGES = [/!\[[^\]]*\]\(\s*<?([^)\s>]+)/gu, /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/giu, /<source\b[^>]*\bsrcset\s*=\s*["']([^"'\s]+)/giu];
  lines.forEach((l, i) => {
    if (PRICE.test(l)) out.push({ line: i + 1, why: 'prints a price, and the README carries none' });
    for (const p of IMAGES)
      for (const m of l.matchAll(p))
        if (![...BANNER, ...SCREENSHOT].includes(m[1].replace(/^\.\//u, '')))
          out.push({ line: i + 1, why: `shows an image that is not the banner (${m[1]}), and the README carries no badge` });
  });
  return out;
}

/** (d) The private list's terms, one a line, with blank lines and `#` lines left out; `null` when there is no list. */
export function privateTerms(file = privateTermsFile()) {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l, i) => ({ term: l.trim().toLowerCase(), at: i + 1 }))
    .filter(({ term }) => term !== '' && !term.startsWith('#'));
}

/**
 * Each line of `text` holding a private term, as `{ line, at }`, `at` being the term's line in the list and never the
 * term. A term is matched whole, not inside a longer run of letters or digits, so a card tail is not found inside a hash.
 */
export function termHits(text, terms) {
  const tests = terms.map(({ term, at }) => ({
    at,
    re: new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'),
  }));
  const out = [];
  text.split('\n').forEach((l, i) => {
    for (const { at, re } of tests) if (re.test(l)) out.push({ line: i + 1, at });
  });
  return out;
}

/**
 * TODAY'S HITS OF (a), EACH FILE WITH THE NUMBER OF ITS LINES THAT NAME ONE OF THE WORDS. See the header: a file off
 * this list or over its number is a finding, and a file under it may come down. Nothing is added here; lines came off
 * until it was empty. Empty, it still holds: a file that names a word is a finding.
 */
export const ALLOWED = {};

/**
 * (d)'S FROZEN FILES, EACH WITH ITS LINES THAT HOLD A TERM FROM THE PRIVATE LIST, one entry a line. Empty since 5 November,
 * when the private details in published add-on versions were written out and their checksums set again before the repository
 * went public. A file that holds a term is a finding.
 */
export const FROZEN = {};

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function publicClean(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
  allowance,
  frozen,
) {
  const ROOT = resolve(root);
  const files = filesOf(ROOT);
  /* THE ALLOWANCE IS THIS REPOSITORY'S, so a planted tree is read with none: its paths are not these. */
  const allowed = allowance ?? (isRepository(ROOT) ? ALLOWED : {});
  const held = frozen ?? (isRepository(ROOT) ? FROZEN : {});
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (files === null || files.length === 0) {
    console.log(`  public-clean: no file to read under ${ROOT}${files === null ? ' (git ls-files failed)' : ''}`);
    return 3;
  }
  const cache = new Map();
  const read = (rel) => (cache.has(rel) ? cache.get(rel) : cache.set(rel, textOf(ROOT, rel)).get(rel));
  const findings = [];
  const shrink = [];

  /* (a), with the allowance. A file's own path counts as one of its lines, line 0. */
  let allowedLines = 0;
  for (const rel of files) {
    const text = read(rel);
    const hits = text === null ? [] : privateWords(text);
    const named = privateWords(rel)[0];
    if (named !== undefined) hits.unshift({ line: 0, word: named.word });
    /* OWN KEYS ONLY: a file at the root named `constructor` would otherwise read a function off the prototype as its
       number, and a comparison with a function is false both ways. */
    const may = Object.hasOwn(allowed, rel) ? allowed[rel] : 0;
    if (hits.length > may)
      for (const h of hits) findings.push(`  ${rel}:${h.line}  names "${h.word}", a private word`);
    else {
      allowedLines += hits.length;
      if (hits.length < may) shrink.push(`  ${rel}: allowed ${may}, now ${hits.length}`);
    }
  }
  for (const rel of Object.keys(allowed)) if (!files.includes(rel)) shrink.push(`  ${rel}: allowed ${allowed[rel]}, now gone`);

  /* (b) and (c). */
  for (const { file, why } of licenceFindings(files, read)) findings.push(`  ${file}  ${why}`);
  const readme = files.includes('README.md') ? read('README.md') : null;
  if (readme === null) findings.push('  README.md  is missing, and the README names the licences');
  else for (const { line, why } of readmeFindings(readme)) findings.push(`  README.md:${line}  ${why}`);

  /* (d), only where the owner's list is. The term is never printed: the output of a gate is a log somebody else reads.
     So a path is not read for one, as (a) reads it: a finding names its file, and that file's name would be the term. */
  const terms = privateTerms();
  if (terms !== null)
    for (const rel of files) {
      const text = read(rel);
      const hits = text === null ? [] : termHits(text, terms);
      const may = Object.hasOwn(held, rel) ? held[rel].length : 0;
      if (hits.length > may) for (const { line, at } of hits) findings.push(`  ${rel}:${line}  holds a term from the private list (its line ${at})`);
      else if (hits.length < may) shrink.push(`  ${rel}: frozen with ${may}, now ${hits.length}`);
    }
  const privately = terms === null ? 'no private list here, so (a) to (c)' : `(a) to (d), ${terms.length} private term(s)`;
  const still = Object.keys(allowed).length;
  const where = `${files.length} file(s), ${privately}; ${still} file(s) still allowed, ${allowedLines} line(s)`;

  if (shrink.length > 0) {
    console.log('  public-clean: these files hold less than they are allowed now. Lower or remove their entries in ALLOWED or FROZEN:');
    for (const s of shrink) console.log(s);
  }
  if (findings.length === 0) {
    console.log(`  public-clean: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  public-clean: ${where}, ${findings.length} finding(s).\n` +
      '  A private word or term goes for an invented one from `fixtures/names.ts`; a licence file says what it must;\n' +
      '  the README keeps its Licence section and carries no price and no image but the banner and the screenshot.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = publicClean(process.argv[2]) ?? 0;
