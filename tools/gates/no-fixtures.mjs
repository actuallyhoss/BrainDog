/**
 * `no-fixtures`: nothing the app ships imports the sample.
 *
 *   node tools/gates/no-fixtures.mjs [root]
 *
 * The sample record is gone from the product. The app shows a real record or says why it cannot, and the
 * sample's rows, questions, add-ons and readers stay only as test data. They
 * live in `apps/web/src/lib/record/fixtures/`, and this is what keeps them there: any file under `apps/web/src` that is
 * not a test and not in a `fixtures/` directory, and imports a module through a `fixtures/` path, is a finding.
 *
 * WHY A GATE AND NOT A TEST BESIDE THE OTHERS. `no-sample-b2.test.ts` already walks the app for one directory, and it
 * ran green while shipped files imported `data.ts`, the fixture before it moved, because the rule it held was about a
 * directory the fixture was not yet in. Measured on 25 September before the move: `api.ts`, `blocks.ts`,
 * `boot-live.ts`, `metrics.ts`, `seed.ts`, the two `/packs` screens, `packs/sharing.ts` and `/start` (and two files
 * since deleted) read the sample's rows or its add-ons on a live record, and `governance.ts` named a type from it. A rule
 * about what a shipped file may import is a rule about the whole tree, and that is a gate's question.
 *
 * AND THE SEED'S ROOT, FOR THE SAME REASON. `@braindog/seed` is the sample: its root export is `REGISTERS`, `ROWS`,
 * `NOW` and `installSeed`, 27 KB brotli, and a route that imports it for one table carries all of it. Its subpaths
 * (`@braindog/seed/usecases/*`, and `@braindog/seed/packs` for the first-party declarations) are product, and are free
 * to import.
 *
 * WITH NO FILE EXCUSED. Three shipped files read the root for product until 25 September (the modules' figures in
 * `declared.ts`, the documents Install sends in `packs.ts`, the Agents pack in Settings) and sat on a named waiting
 * list here. `@braindog/seed/packs` is their door now, so the list is gone rather than empty: an empty list is a place
 * the next exemption goes without anybody deciding it.
 *
 * NOT A WORD THAT ENDS IN `import`. `\bimport` matched inside `csv-import`, where `\b` sits after the hyphen, so
 * prose in a component's markup read as a bare import of the next string; `loader.import(...)` read as a dynamic one.
 * Each keyword is held to the start of a token, not after a word character, `$`, `.` or `-`.
 *
 * AND A GLOB IS AN IMPORT. `import.meta.glob('./fixtures/*.ts', { eager: true })` bundles every file it matches, and
 * none of the four spellings read it. Its patterns are read, one string or a list, and a negated one (`!`) is left out,
 * because it takes files away.
 *
 * COMMENTS ARE NOT IMPORTS. A comment saying where the sample went is not a read of it, so `//`, `/* *\/` and, in a
 * `.svelte` file, `<!-- -->` are blanked before anything is matched; strings are left, because a specifier is one.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/** The app whose shipped files are read, and the kinds of file it ships. */
const APP = join('apps', 'web', 'src');
const SOURCE = /\.(ts|js|mjs|svelte)$/u;
/** A test, which may import any fixture it likes. */
const TEST = /\.test\.(ts|js|mjs)$/u;

/** Every source file under `dir`, with the `fixtures/` directories left out: they are the fixtures. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name) || name === 'fixtures') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !TEST.test(name)) out.push(full);
  }
  return out;
}

/**
 * The source with its comments turned into spaces, lines kept, so a match's line is the file's line.
 *
 * A SMALL LEXER AND NOT THREE PATTERNS, because a pattern for `//` also eats `'https://'` and a pattern for `/*` eats a
 * glob in a string. Strings are stepped over whole, so a comment marker inside one is text.
 */
export function uncommented(source, svelte = false) {
  const out = [...source];
  const hide = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (svelte && source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      const stop = end === -1 ? source.length : end + 3;
      hide(i, stop);
      i = stop;
    } else if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      hide(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      hide(i, stop);
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else i++;
  }
  return out.join('');
}

/**
 * Every module specifier a file names: `import ... from`, a bare `import`, `export ... from`, `import()`, and each
 * pattern of an `import.meta.glob`.
 */
export function specifiers(code) {
  const found = [];
  const lineOf = (at) => code.slice(0, at).split('\n').length;
  const PATTERNS = [
    /(?<![\w$.-])import\s+(?:type\s+)?[\w$*{}\s,]*?\bfrom\s*(['"])([^'"]+)\1/gu,
    /(?<![\w$.-])import\s*(['"])([^'"]+)\1/gu,
    /(?<![\w$.-])export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+[\w$]+\s*)?from\s*(['"])([^'"]+)\1/gu,
    /(?<![\w$.-])import\s*\(\s*(['"])([^'"]+)\1\s*\)/gu,
  ];
  for (const p of PATTERNS) for (const m of code.matchAll(p)) found.push({ spec: m[2], line: lineOf(m.index) });
  /* THE GLOB'S FIRST ARGUMENT, a string or a list of them, with a type argument allowed before it. Each pattern keeps
     its own line, so a list over several lines names the line the fixture's pattern is on. The list is stepped string by
     string, because a pattern can hold a `]` (`./routes/[area]/*.ts`) and a list read to its first `]` lost the rest. */
  for (const m of code.matchAll(/(?<![\w$.-])import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*(\[(?:[^\]'"`]|'[^']*'|"[^"]*"|`[^`]*`)*\]|(['"`])[^'"`]*\2)/gu)) {
    const from = m.index + m[0].length - m[1].length;
    for (const s of m[1].matchAll(/(['"`])([^'"`]+)\1/gu))
      if (!s[2].startsWith('!')) found.push({ spec: s[2], line: lineOf(from + s.index) });
  }
  return found;
}

/** Why a specifier is not a shipped file's to import, or `null`. */
export function refused(spec) {
  if (/(?:^|\/)fixtures\//u.test(spec)) return 'imports the test fixtures, which only a test may';
  if (spec === '@braindog/seed') return "imports the seed's root, which is the sample: import a subpath of it, or read the record";
  return null;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */
export default function noFixtures(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const files = walk(join(ROOT, APP));

  /* A GATE THAT READ NOTHING HAS NOT PASSED, and a mistyped root reads nothing. Exit 3 is "could not run". */
  if (files.length === 0) {
    console.log(`  no-fixtures: no source under ${join(ROOT, APP)}, so nothing shipped was read`);
    return 3;
  }

  const findings = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    for (const { spec, line } of specifiers(uncommented(readFileSync(file, 'utf8'), file.endsWith('.svelte')))) {
      const why = refused(spec);
      if (why !== null) findings.push(`  ${rel}:${line}  ${why} (${spec})`);
    }
  }

  if (findings.length === 0) {
    console.log(`  no-fixtures: ${files.length} shipped file(s), 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-fixtures: ${files.length} shipped file(s), ${findings.length} finding(s), each a shipped file reading the sample.\n` +
      '  The app draws the record it is given or says why it cannot. Read the record, or move the file\n' +
      '  beside the tests that need it.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture and the header documents the
   command line. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = noFixtures(process.argv[2]) ?? 0;
