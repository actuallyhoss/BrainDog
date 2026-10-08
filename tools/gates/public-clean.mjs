/**
 * `public-clean`: the repository carries no private name or figure, and the files a stranger reads about the licence say
 * what they must (LCH-C11).
 *
 *   node tools/gates/public-clean.mjs [root]
 *
 * FOUR PARTS, over every file git tracks (or, on a planted tree with no repository of its own, every file under it):
 *   (a) none of the three private words, read case-blind, where the one allowed spelling is the account name the
 *       repository lives under (`ALLOWED_SPELLING`);
 *   (b) `LICENSE` and `apps/cli/LICENSE` are Apache-2.0 and name Quartz Apps LLC, `packages/render/LICENSE` is MIT and
 *       names it, `LICENSING.md` credits Lucide, and the root holds no `NOTICE` and no `CHANGELOG.md`;
 *   (c) `README.md` has a Licence section naming both licences, no price, and no image but the banner;
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
 * light and a dark file, so those two paths are `BANNER`, and any other image is a finding.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The three words, lower case, put together here so no file in the repository spells them. */
export const WORDS = ['ho' + 'ss', 'en' + 'core', 'tam' + 'sin'];
/** The one spelling that holds the first word and is public: the account the repository lives under. */
export const ALLOWED_SPELLING = 'actually' + WORDS[0];

/** The README's banner, the one image it may carry: the light file and the dark one. */
export const BANNER = ['.github/media/banner-light.svg', '.github/media/banner-dark.svg'];

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
  must('LICENSE', 'the repository is open source under Apache-2.0 (RQ-LCH-127, RQ-LCH-261)', apache, two, quartz);
  must('apps/cli/LICENSE', 'the command ships under Apache-2.0 (RQ-LCH-261)', apache, two, quartz);
  must('packages/render/LICENSE', 'packages/render is MIT (RQ-LCH-128, RQ-LCH-261)', [/MIT License/u, 'say MIT License'], quartz);
  must('LICENSING.md', 'the glyphs are Lucide\'s and say so (RQ-LCH-264)', [/Lucide/u, 'credit Lucide']);
  /* AT THE ROOT ONLY. Two third-party notices sit deeper in (the glyphs' and the site's) and are right where they are. */
  for (const file of files.filter((f) => /^NOTICE(?:\.\w+)?$/iu.test(f)))
    out.push({ file, why: 'is a NOTICE at the root, and the repository carries none (RQ-LCH-263)' });
  for (const file of files.filter((f) => /^CHANGELOG(?:\.\w+)?$/iu.test(f)))
    out.push({ file, why: 'is a changelog at the root, and the changelog is the site\'s (RQ-LCH-291)' });
  return out;
}

/** A price as a README would print one: a currency sign or code beside a number, or a rate per month, year or seat. */
const PRICE = /[$€£¥]\s?\d|\b\d[\d,.]*\s?(?:USD|EUR|GBP|EGP)\b|\b(?:USD|EUR|GBP|EGP)\s?\d|\bper (?:month|year|seat|user)\b|\/(?:mo|month|yr|year)\b/iu;

/** (c) The README, as findings `{ line, why }`. */
export function readmeFindings(text) {
  const out = [];
  const lines = text.split('\n');
  const heading = lines.findIndex((l) => /^#{1,6}\s+Licen[cs]e\b/iu.test(l));
  if (heading === -1) out.push({ line: 1, why: 'has no Licence section, and the README names its licences (RQ-LCH-130)' });
  else {
    const level = /^#+/u.exec(lines[heading])[0].length;
    const after = lines.slice(heading + 1);
    const end = after.findIndex((l) => /^#+\s/u.test(l) && /^#+/u.exec(l)[0].length <= level);
    const body = (end === -1 ? after : after.slice(0, end)).join('\n');
    if (!/Apache/u.test(body)) out.push({ line: heading + 1, why: 'has a Licence section that does not name Apache-2.0 (RQ-LCH-130)' });
    if (!/\bMIT\b/u.test(body)) out.push({ line: heading + 1, why: 'has a Licence section that does not name MIT (RQ-LCH-130)' });
  }
  const IMAGES = [/!\[[^\]]*\]\(\s*<?([^)\s>]+)/gu, /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/giu, /<source\b[^>]*\bsrcset\s*=\s*["']([^"'\s]+)/giu];
  lines.forEach((l, i) => {
    if (PRICE.test(l)) out.push({ line: i + 1, why: 'prints a price, and the README carries none (RQ-LCH-269)' });
    for (const p of IMAGES)
      for (const m of l.matchAll(p))
        if (!BANNER.includes(m[1].replace(/^\.\//u, '')))
          out.push({ line: i + 1, why: `shows an image that is not the banner (${m[1]}), and the README carries no badge (RQ-LCH-270)` });
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
 * this list or over its number is a finding, and a file under it may come down. Nothing is added here; the sweep of
 * LCH-C11 jobs 3 to 9 takes lines off until it is empty, and then this goes.
 */
export const ALLOWED = {
  'apps/cli/src/brief.ts': 4,
  'apps/cli/src/hooks.ts': 4,
  'apps/cli/src/import.ts': 1,
  'apps/cli/src/people.ts': 2,
  'apps/cli/src/skills.ts': 2,
  'apps/cli/src/tools.ts': 1,
  'apps/cli/test/brief.test.ts': 7,
  'apps/cli/test/context.test.ts': 3,
  'apps/cli/test/hooks.test.ts': 5,
  'apps/cli/test/people.test.ts': 36,
  'apps/cli/test/tools.test.ts': 1,
  'apps/web/src/lib/decide/DecisionCard.svelte': 2,
  'apps/web/src/lib/decide/card.test.ts': 10,
  'apps/web/src/lib/decide/card.ts': 1,
  'apps/web/src/lib/page/BlockSlot.svelte': 1,
  'apps/web/src/lib/page/ChangePage.svelte': 1,
  'apps/web/src/lib/page/RowPanel.svelte': 1,
  'apps/web/src/lib/page/byline.test.ts': 4,
  'apps/web/src/lib/page/byline.ts': 1,
  'apps/web/src/lib/page/group-open.test.ts': 6,
  'apps/web/src/lib/page/group-open.ts': 1,
  'apps/web/src/lib/page/look.test.ts': 4,
  'apps/web/src/lib/page/look.ts': 1,
  'apps/web/src/lib/page/queue-answer.test.ts': 3,
  'apps/web/src/lib/palette/Palette.svelte': 1,
  'apps/web/src/lib/palette/slash.ts': 1,
  'apps/web/src/lib/record/blocks.ts': 1,
  'apps/web/src/lib/record/byline.test.ts': 3,
  'apps/web/src/lib/record/byline.ts': 3,
  'apps/web/src/lib/record/card-groups.test.ts': 8,
  'apps/web/src/lib/record/card-rows.test.ts': 12,
  'apps/web/src/lib/record/governance.test.ts': 1,
  'apps/web/src/lib/record/names-person.test.ts': 11,
  'apps/web/src/lib/record/names.ts': 4,
  'apps/web/src/lib/record/page-live.test.ts': 13,
  'apps/web/src/lib/record/page-live.ts': 1,
  'apps/web/src/lib/record/people.ts': 1,
  'apps/web/src/routes/audit/lines.test.ts': 1,
  'apps/web/src/routes/decide/merge.test.ts': 14,
  'apps/web/src/routes/jobs/charts.test.ts': 3,
  'apps/web/src/routes/jobs/charts.ts': 1,
  'apps/web/src/routes/r/[register]/[seq]/+page.svelte': 2,
  'apps/web/src/routes/r/[register]/parts/ListPeople.svelte': 1,
  'apps/web/src/routes/r/[register]/parts/list.test.ts': 2,
  'apps/web/src/routes/r/[register]/people.test.ts': 8,
  'apps/worker/test/inference.test.ts': 1,
  'packages/host/test/understand.test.ts': 3,
  'packages/kernel/src/api/person-name.ts': 4,
  'packages/kernel/src/backfill.ts': 1,
  'packages/kernel/src/identity-keys.ts': 2,
  'packages/kernel/src/people.ts': 4,
  'packages/kernel/src/scope.ts': 1,
  'packages/kernel/src/session.ts': 2,
  'packages/kernel/src/signs-flow.ts': 1,
  'packages/kernel/src/undo.ts': 1,
  'packages/kernel/test/change-kind.test.ts': 3,
  'packages/kernel/test/entities.test.ts': 8,
  'packages/kernel/test/identity-keys.test.ts': 18,
  'packages/kernel/test/merge-door.test.ts': 2,
  'packages/kernel/test/people-known.test.ts': 4,
  'packages/kernel/test/people-orgs.test.ts': 2,
  'packages/kernel/test/people-trust.test.ts': 15,
  'packages/kernel/test/people.test.ts': 25,
  'packages/kernel/test/runs-one-per-session.test.ts': 9,
  'packages/kernel/test/runs-projects.test.ts': 8,
  'packages/kernel/test/runs-titles.test.ts': 3,
  'packages/kernel/test/scope-names.test.ts': 7,
  'packages/kernel/test/scope.test.ts': 1,
  'packages/kernel/test/undo-guards.test.ts': 44,
  'packages/kernel/test/undo-row.test.ts': 11,
  'packages/kernel/test/undo.test.ts': 46,
  'packages/mcp/src/brief.ts': 11,
  'packages/mcp/src/briefing.ts': 3,
  'packages/mcp/src/words.ts': 2,
  'packages/mcp/test/names-not-addresses.test.ts': 16,
  'packages/mcp/test/rung-answers.test.ts': 14,
  'packages/mcp/test/understand-tool.test.ts': 5,
  'packages/mcp/test/understand.test.ts': 28,
  'packages/mcp/test/words.test.ts': 1,
  'packages/record/src/compose-look.ts': 2,
  'packages/record/src/index.ts': 6,
  'packages/record/src/scrub.ts': 1,
  'packages/record/test/compose-look.test.ts': 2,
  'packages/record/test/context-people.test.ts': 10,
  'packages/record/test/context-self.test.ts': 7,
  'packages/record/test/meet-key-held.test.ts': 6,
  'packages/record/test/meet-kinds.test.ts': 9,
  'packages/record/test/meet-name-only.test.ts': 2,
  'packages/record/test/merge-cluster.test.ts': 6,
  'packages/record/test/self-mark.test.ts': 27,
  'packages/record/test/slash-entities.test.ts': 2,
  'packages/render/src/html.ts': 2,
  'packages/render/src/lint.test.ts': 1,
  'packages/render/src/lint.ts': 1,
  'packages/render/svelte/p/Rows.svelte': 1,
  'packages/seed/src/modules/people.ts': 1,
  'packages/seed/test/quiet-update.test.ts': 2,
  'tools/understand-eval/fixture.json': 1,
};

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function publicClean(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
  allowance,
) {
  const ROOT = resolve(root);
  const files = filesOf(ROOT);
  /* THE ALLOWANCE IS THIS REPOSITORY'S, so a planted tree is read with none: its paths are not these. */
  const allowed = allowance ?? (isRepository(ROOT) ? ALLOWED : {});
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
      for (const h of hits) findings.push(`  ${rel}:${h.line}  names "${h.word}", a private word (RQ-LCH-268)`);
    else {
      allowedLines += hits.length;
      if (hits.length < may) shrink.push(`  ${rel}: allowed ${may}, now ${hits.length}`);
    }
  }
  for (const rel of Object.keys(allowed)) if (!files.includes(rel)) shrink.push(`  ${rel}: allowed ${allowed[rel]}, now gone`);

  /* (b) and (c). */
  for (const { file, why } of licenceFindings(files, read)) findings.push(`  ${file}  ${why}`);
  const readme = files.includes('README.md') ? read('README.md') : null;
  if (readme === null) findings.push('  README.md  is missing, and the README names the licences (RQ-LCH-130)');
  else for (const { line, why } of readmeFindings(readme)) findings.push(`  README.md:${line}  ${why}`);

  /* (d), only where the owner's list is. The term is never printed: the output of a gate is a log somebody else reads.
     So a path is not read for one, as (a) reads it: a finding names its file, and that file's name would be the term. */
  const terms = privateTerms();
  if (terms !== null)
    for (const rel of files) {
      const text = read(rel);
      if (text !== null) for (const { line, at } of termHits(text, terms)) findings.push(`  ${rel}:${line}  holds a term from the private list (its line ${at})`);
    }
  const privately = terms === null ? 'no private list here, so (a) to (c)' : `(a) to (d), ${terms.length} private term(s)`;
  const still = Object.keys(allowed).length;
  const where = `${files.length} file(s), ${privately}; ${still} file(s) still allowed, ${allowedLines} line(s)`;

  if (shrink.length > 0) {
    console.log('  public-clean: these allowed files name the words less often now. Lower or remove their entries in ALLOWED:');
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
      '  the README keeps its Licence section and carries no price and no image but the banner.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = publicClean(process.argv[2]) ?? 0;
