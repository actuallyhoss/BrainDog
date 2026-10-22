/**
 * `no-fixtures`: nothing BrainDog ships imports the sample or installs it.
 *
 *   node tools/gates/no-fixtures.mjs [root]
 *
 * The sample record is gone from the product. The app shows a real record or says why it cannot, and the
 * sample's rows, questions, add-ons and readers stay only as test data. They
 * live in `apps/web/src/lib/record/fixtures/`, and this is what keeps them there: any file in one of `PLACES` that is
 * not a test and not in a `fixtures/` directory, and imports a module through a `fixtures/` path, is a finding.
 *
 * A LIST AND NOT ONE FOLDER (PRF-A07: the invented record is for the gates and for nothing else).
 * This read `apps/web/src` alone, so the command's scratch record imported its three product parts from the seed's
 * root and no gate said so (`apps/cli/src/scratch.ts`, until 9 October). Everything that runs a record for somebody
 * is on the list: the web app, the worker, the self-host, the command, and the host, record and agent-door packages.
 *
 * WHY A GATE AND NOT A TEST BESIDE THE OTHERS. `no-sample-render-helpers.test.ts` already walks the app for one directory, and it
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
 * BY ANY PATH, AND ITS INSTALLER BY ANY NAME. A package beside the seed can reach its root as `../../seed/src/index.ts`
 * or as the package folder `../../seed` and never write `@braindog/seed`, so either path is the root too. And
 * `installSeed(` is a finding wherever it is called, because a record a person uses that was filled by it holds
 * invented rows, however the function got there.
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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/**
 * The places whose shipped files are read, each with the name a finding gives it.
 *
 * EVERY ONE MUST BE THERE IN THE WORKSPACE. A folder renamed or moved leaves its entry reading nothing, and a list
 * that quietly reads less is the one-folder gate again. So on a root that is the workspace (it holds
 * `pnpm-workspace.yaml`) a place with no source is "could not run"; a seeded tree holds only the places it seeds.
 */
export const PLACES = [
  { dir: 'apps/web/src', name: 'the web app' },
  { dir: 'apps/worker/src', name: 'the worker' },
  { dir: 'apps/selfhost/src', name: 'the self-host' },
  { dir: 'apps/cli/src', name: 'the command' },
  { dir: 'packages/host/src', name: 'the host' },
  { dir: 'packages/record/src', name: 'the record' },
  { dir: 'packages/mcp/src', name: 'the agent door' },
];
/** The kinds of file they ship. */
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

/** The seed's root file named by a path, `../../seed/src/index.ts` or the folder that resolves to it. */
const SEED_ROOT_FILE = /(?:^|\/)seed\/src(?:\/index(?:\.[cm]?[jt]s)?)?\/?$/u;
/**
 * The seed's package folder, which a bundler opens at its `exports["."]`, the root. Only a relative path resolved from
 * the file that wrote it can say it is this folder: `../../seed` from the host is, and `./seed` beside a page is not.
 */
const SEED_PACKAGE = 'packages/seed';

/** Why a specifier is not a shipped file's to import, or `null`. */
export function refused(spec) {
  if (/(?:^|\/)fixtures\//u.test(spec)) return 'imports the test fixtures, which only a test may';
  if (spec === '@braindog/seed' || SEED_ROOT_FILE.test(spec))
    return "imports the seed's root, which is the sample: import a subpath of it, or read the record";
  return null;
}

/** Each call of the seed's installer, which writes the sample into the record it is handed: as a name or a method. */
export function installs(code) {
  const lineOf = (at) => code.slice(0, at).split('\n').length;
  return [...code.matchAll(/(?<![\w$])installSeed\s*\(/gu)].map((m) => lineOf(m.index));
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
  const read = PLACES.map((p) => ({ ...p, files: walk(join(ROOT, p.dir)) }));
  const files = read.flatMap((p) => p.files);

  /* A GATE THAT READ NOTHING HAS NOT PASSED, and a mistyped root reads nothing. Exit 3 is "could not run". */
  if (files.length === 0) {
    console.log(`  no-fixtures: no source in any of its ${PLACES.length} places under ${ROOT}, so nothing shipped was read`);
    return 3;
  }
  /* NOR HAS ONE THAT READ PART OF THE WORKSPACE. See `PLACES`. */
  const gone = existsSync(join(ROOT, 'pnpm-workspace.yaml')) ? read.filter((p) => p.files.length === 0) : [];
  if (gone.length > 0) {
    for (const p of gone) console.log(`  no-fixtures: ${p.name} has no source at ${p.dir}, so it was not read`);
    console.log('  no-fixtures: a place on the list is missing. Point its entry in `PLACES` at where it lives now.');
    return 3;
  }

  const findings = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const code = uncommented(readFileSync(file, 'utf8'), file.endsWith('.svelte'));
    for (const { spec, line } of specifiers(code)) {
      const folder = spec.startsWith('.') && relative(ROOT, resolve(dirname(file), spec)).replace(/\\/g, '/') === SEED_PACKAGE;
      const why = refused(folder ? '@braindog/seed' : spec);
      if (why !== null) findings.push(`  ${rel}:${line}  ${why} (${spec})`);
    }
    for (const line of installs(code))
      findings.push(`  ${rel}:${line}  calls the seed's installer, which writes the sample into a record (installSeed)`);
  }

  const where = `${files.length} shipped file(s) in ${read.filter((p) => p.files.length > 0).length} place(s)`;
  if (findings.length === 0) {
    console.log(`  no-fixtures: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-fixtures: ${where}, ${findings.length} finding(s), each a shipped file reading the sample.\n` +
      '  What ships draws the record it is given or says why it cannot. Read the record, import the product\n' +
      '  through `@braindog/seed/packs`, or move the file beside the tests that need it.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture and the header documents the
   command line. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = noFixtures(process.argv[2]) ?? 0;
