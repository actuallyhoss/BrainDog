/**
 * `no-fixtures`: nothing the app ships imports the sample.
 *
 *   node tools/gates/no-fixtures.mjs [root]
 *
 * DIRECTION 26: "get rid of that whole sample record stuff". The app shows a real record or says why it cannot, and the
 * sample's rows, questions, add-ons and readers stay only as test data (`loop/research-no-sample.md`, wave C1). They
 * live in `apps/web/src/lib/record/fixtures/`, and this is what keeps them there: any file under `apps/web/src` that is
 * not a test and not in a `fixtures/` directory, and imports a module through a `fixtures/` path, is a finding.
 *
 * WHY A GATE AND NOT A TEST BESIDE THE OTHERS. `no-sample-b2.test.ts` already walks the app for one directory, and it
 * ran green while eleven shipped files imported `data.ts`, the fixture before it moved, because the rule it held was
 * about a directory the fixture was not yet in. Measured on 25 September before the move: `api.ts`, `blocks.ts`,
 * `boot-live.ts`, `forecast.ts`, `metrics.ts`, `pages.ts`, `seed.ts`, the two `/packs` screens, `packs/sharing.ts` and
 * `/start` read the sample's rows or its add-ons on a live record, and `governance.ts` named a type from it. A rule
 * about what a shipped file may import is a rule about the whole tree, and that is a gate's question.
 *
 * AND THE SEED'S ROOT, FOR THE SAME REASON. `@braindog/seed` is the sample: its root export is `REGISTERS`, `ROWS`,
 * `NOW` and `installSeed`, 27 KB brotli, and a route that imports it for one table carries all of it. Its subpaths
 * (`@braindog/seed/usecases/*`) are product, the use cases a person installs, and are free to import.
 *
 * THREE FILES STILL NEED THE ROOT, AND THEY ARE NAMED RATHER THAN EXEMPTED BY A PATTERN. Each reads a first-party
 * declaration that is product, not sample: the modules' figures, the documents Install sends, and the Agents pack. They
 * need a subpath of `@braindog/seed` that exports those without the rest, which is `packages/seed/package.json`'s to
 * add. Each is printed on every run, and an entry whose file no longer imports the root is a finding, so the list can
 * only shrink.
 *
 * COMMENTS ARE NOT IMPORTS. A comment saying where the sample went is not a read of it, so `//`, `/* *\/` and, in a
 * `.svelte` file, `<!-- -->` are blanked before anything is matched; strings are left, because a specifier is one.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/** The app whose shipped files are read, and the kinds of file it ships. */
const APP = join('apps', 'web', 'src');
const SOURCE = /\.(ts|js|mjs|svelte)$/u;
/** A test, which may import any fixture it likes. */
const TEST = /\.test\.(ts|js|mjs)$/u;

/**
 * The files that may still import `@braindog/seed` itself, each with what it reads there, until the seed exports it
 * from a subpath. Paths are from the root, with forward slashes.
 */
export const WAITING = {
  'apps/web/src/lib/record/declared.ts': "the first-party modules' figures (`METRICS`), which live pages and Home read",
  'apps/web/src/lib/record/packs.ts': 'the first-party and Agents documents Install sends (`firstPartyDocument`, `agentsPackDocument`)',
  'apps/web/src/routes/settings/[area]/+page.svelte': 'the Agents pack Settings offers to install (`AGENTS_PACK`, `agentsPackDocument`)',
};

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

/** Every module specifier a file names: `import ... from`, a bare `import`, `export ... from` and `import()`. */
export function specifiers(code) {
  const found = [];
  const PATTERNS = [
    /\bimport\s+(?:type\s+)?[\w$*{}\s,]*?\bfrom\s*(['"])([^'"]+)\1/gu,
    /\bimport\s*(['"])([^'"]+)\1/gu,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+[\w$]+\s*)?from\s*(['"])([^'"]+)\1/gu,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/gu,
  ];
  for (const p of PATTERNS)
    for (const m of code.matchAll(p)) found.push({ spec: m[2], line: code.slice(0, m.index).split('\n').length });
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
  const waited = new Map(Object.keys(WAITING).map((p) => [p, 0]));
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    for (const { spec, line } of specifiers(uncommented(readFileSync(file, 'utf8'), file.endsWith('.svelte')))) {
      const why = refused(spec);
      if (why === null) continue;
      if (spec === '@braindog/seed' && waited.has(rel)) waited.set(rel, waited.get(rel) + 1);
      else findings.push(`  ${rel}:${line}  ${why} (${spec})`);
    }
  }

  /* A NAMED FILE THAT NO LONGER NEEDS THE ROOT IS A FINDING, so the next import of it there is seen. Only for a file
     that is there: a seeded tree without it has nothing to say about it. */
  for (const [p, n] of waited)
    if (n === 0 && existsSync(join(ROOT, p))) findings.push(`  ${p} is listed as waiting on a seed subpath and imports no seed root. Take it out of WAITING.`);

  if (findings.length === 0) {
    const still = [...waited].filter(([, n]) => n > 0);
    console.log(`  no-fixtures: ${files.length} shipped file(s), 0 finding(s); ${still.length} still read the seed's root, waiting on a subpath:`);
    for (const [p] of still) console.log(`      ${p}: ${WAITING[p]}`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-fixtures: ${files.length} shipped file(s), ${findings.length} finding(s), each a shipped file reading the sample.\n` +
      '  The app draws the record it is given or says why it cannot (DIRECTION 26). Read the record, or move the file\n' +
      '  beside the tests that need it.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture and the header documents the
   command line. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = noFixtures(process.argv[2]) ?? 0;
