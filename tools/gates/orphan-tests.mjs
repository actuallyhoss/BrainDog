/**
 * `orphan-tests`: every test file runs, and nothing skips its way to green.
 *
 *   node tools/gates/orphan-tests.mjs [root]
 *
 * *"Every harness is in CI or is deleted"*, and *"a missing build or seed is a skip that prints its
 * reason, never a pass"*. Neither had a check, so both drifted the way an unchecked rule drifts:
 * twelve files under `tools/gates/test` were reached by no script, because `tools` is no workspace and
 * the root test script names one docs file. The tests that hold the runner's own promises were among
 * them. And the site's tests that read a built site skipped on every push, in a leg that builds no
 * site, so thirty-seven skips rode a green leg and two tests the history called red could not be
 * shown green by anybody.
 *
 * A TEST FILE IS REACHED BY ONE OF THREE THINGS, and nothing else counts:
 *
 *   * a workspace's `test` script, its `node --test` globs read from where the script runs, and a
 *     bare `node --test` reaching every test file under its folder, which is what Node does with it;
 *   * a `node --test` line in a workflow under `.github/workflows`, read from the repository root;
 *   * a gate under `tools/gates` that spawns `--test` with a literal path.
 *
 * The root `package.json`'s own test script counts as a workspace's, read from the root. A comment
 * naming `node --test` is prose and reaches nothing, so a workflow's `#` lines are dropped and a gate
 * is read for the argument list it spawns rather than for the words.
 *
 * FOUR FINDINGS, EACH NAMING THE FILE:
 *
 *   * a test file nothing above reaches, wherever it is;
 *   * a test file in a workspace with no `test` script, which is the same file one step earlier;
 *   * a skip with no reason: `test.skip(`, `it.skip(`, `describe.skip(`, `t.skip()`, `skip: true`, or a
 *     `skip:` that is a bare condition such as `!hasSh`. Node prints `# SKIP` and nothing after it, and
 *     the reader of the run is left to guess why it did not run;
 *   * a test that skips for want of a build and is reached by no workflow step that follows that
 *     build in the same job. Its skip names its reason, and it is still a test that never runs.
 *
 * A SKIP BY PLATFORM IS COUNTED AND NOT A FINDING. `skip: process.platform !== 'win32'` says its own
 * reason in its condition, and the runner it skips on is a fact about the runner. The count is printed
 * with the files on every run, so the number is read rather than found.
 *
 * WHAT IS NOT WALKED: `node_modules`, every build output `lib.mjs` calls built, a dot folder,
 * `tools/gates/negative` (planted faults, this gate's own among them) and `loop` (the build's notes).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { posix, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const TEST = /\.test\.(?:ts|mjs|js)$/u;
const LEFT_OUT = new Set(['tools/gates/negative', 'loop']);
const slash = (p) => p.split(sep).join('/');

function* walk(root, at = root) {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, entry.name);
    if (entry.isDirectory()) {
      if (skipDir(entry.name) || LEFT_OUT.has(slash(relative(root, full)))) continue;
      yield* walk(root, full);
    } else if (entry.isFile() && TEST.test(entry.name)) yield slash(relative(root, full));
  }
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** A glob as `node --test` reads one: `*` inside a folder, `**` across folders, `{a,b}` either. */
function globRe(glob) {
  const esc = (s) => s.replace(/[.+^$()|[\]\\]/gu, '\\$&');
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{' && glob.indexOf('}', i) > i) {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map(esc).join('|')})`;
      i = end;
    } else re += esc(c);
  }
  return new RegExp(`^${re}$`, 'u');
}

/** Node flags that take the next word as their value, so that word is not a file. */
const VALUED = new Set([
  '--test-reporter', '--test-reporter-destination', '--test-name-pattern', '--test-skip-pattern',
  '--test-concurrency', '--test-shard', '--test-timeout', '--import', '--require', '-r', '--loader',
  '--experimental-loader', '--env-file', '--test-coverage-include', '--test-coverage-exclude',
]);

/**
 * The globs each `node --test` in a shell text hands over, one list per call. An empty list is a bare
 * `node --test`, which Node reads as every test file under the folder it runs in. A word holding a
 * shell variable is dropped, because what it expands to is not in the text.
 */
function testCalls(text) {
  const calls = [];
  for (const segment of text.split(/&&|\|\||[;\n|]/u)) {
    const words = [...segment.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/gu)].map((m) => m[1] ?? m[2] ?? m[3]);
    const node = words.findIndex((w) => w === 'node' || w.endsWith('/node'));
    if (node === -1 || !words.slice(node + 1).includes('--test')) continue;
    const globs = [];
    for (let i = node + 1; i < words.length; i++) {
      const w = words[i];
      if (VALUED.has(w)) i++;
      else if (!w.startsWith('-') && !w.includes('$')) globs.push(w.replace(/^\.\//u, ''));
    }
    calls.push(globs);
  }
  return calls;
}

/** The matchers one call reaches, its globs read from `base` (a folder relative to the root, '' for it). */
const reach = (base, globs) =>
  (globs.length ? globs : ['**/*']).map((g) => globRe(posix.normalize(base ? posix.join(base, g) : g)));

/** A package's test script, with any `run <name>` inside it followed to that script, once. */
function scriptText(scripts, name, seen = new Set()) {
  if (seen.has(name) || typeof scripts?.[name] !== 'string') return '';
  seen.add(name);
  const text = scripts[name];
  const nested = [...text.matchAll(/\b(?:pnpm|npm|yarn)\s+(?:run\s+)?([\w:.-]+)/gu)].map((m) => m[1]);
  return [text, ...nested.map((n) => scriptText(scripts, n, seen))].join('\n');
}

/** The workspace folders `pnpm-workspace.yaml` lists, each a folder with a `package.json`. */
function workspaces(root) {
  const file = join(root, 'pnpm-workspace.yaml');
  if (!existsSync(file)) return [];
  const dirs = [];
  let inside = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^packages:\s*$/u.test(line)) inside = true;
    else if (/^\S/u.test(line)) inside = false;
    const m = inside ? /^\s+-\s*['"]?([^'"#\s]+)/u.exec(line) : null;
    if (m === null) continue;
    const pattern = m[1].replace(/\/$/u, '');
    if (!pattern.endsWith('/*')) dirs.push(pattern);
    else {
      const parent = pattern.slice(0, -2);
      if (!existsSync(join(root, parent))) continue;
      for (const d of readdirSync(join(root, parent), { withFileTypes: true }))
        if (d.isDirectory()) dirs.push(`${parent}/${d.name}`);
    }
  }
  return dirs.filter((d) => existsSync(join(root, d, 'package.json'))).sort();
}

/** The folder a `--filter` names: a package's name, or `./` and a folder. `*` for `pnpm -r build`. */
function builtBy(line, dirByName) {
  const out = [];
  for (const m of line.matchAll(/--filter[= ]+(\S+)\s+(?:run\s+)?build\b/gu))
    out.push(m[1].startsWith('./') ? m[1].slice(2).replace(/\/$/u, '') : (dirByName.get(m[1]) ?? m[1]));
  if (/\bpnpm\s+(?:-r\s+|--recursive\s+)?(?:run\s+)?build\b/u.test(line)) out.push('*');
  return out;
}

/**
 * Every `node --test` in a workflow, and every workspace test script a step runs with `--filter`, with the
 * folders its job built in the steps before it. A job is a
 * key two spaces in under `jobs:`, and what it built resets at the next one, because a build in one job
 * is not on the runner of another.
 */
function workflowCalls(root, dirByName, scriptCalls) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => /\.ya?ml$/u.test(n)).sort()) {
    let jobs = false;
    let built = new Set();
    for (const raw of readFileSync(join(dir, name), 'utf8').replace(/\r\n/gu, '\n').split('\n')) {
      if (/^\s*#/u.test(raw)) continue;
      const line = raw.replace(/\s+#\s.*$/u, '');
      if (/^\S/u.test(line)) jobs = /^jobs:\s*$/u.test(line);
      if (jobs && /^ {2}[\w-]+:\s*$/u.test(line)) built = new Set();
      for (const d of builtBy(line, dirByName)) built.add(d);
      for (const globs of testCalls(line)) out.push({ base: '', globs, built: new Set(built) });
      /* A WORKSPACE'S OWN TEST SCRIPT RUN BY NAME, which is how a job runs a package's tests after building it. */
      for (const m of line.matchAll(/--filter[= ]+(\S+)\s+(?:run\s+)?test\b/gu)) {
        const base = m[1].startsWith('./') ? m[1].slice(2).replace(/\/$/u, '') : dirByName.get(m[1]);
        if (base !== undefined) for (const globs of scriptCalls(base)) out.push({ base, globs, built: new Set(built) });
      }
    }
  }
  return out;
}

/** The literal paths a gate under `tools/gates` hands a spawned `--test`, which is the only way a gate reaches one. */
function gateCalls(root) {
  const dir = join(root, 'tools', 'gates');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.mjs'))
    .flatMap((n) => [...readFileSync(join(dir, n), 'utf8').matchAll(/'--test',\s*((?:'[^']+'\s*,?\s*)+)/gu)])
    .map((m) => [...m[1].matchAll(/'([^']+)'/gu)].map((p) => p[1]).filter((p) => !p.startsWith('-')));
}

/** A comment is prose about a skip and never a skip, so both kinds are blanked with their lines kept. */
const uncommented = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//gu, (c) => c.replace(/[^\n]/gu, ' '))
    .replace(/(^|[^:\\'"`])\/\/.*$/gmu, '$1');

const PLATFORM = /process\.platform\s*[!=]==?\s*(['"`])[^'"`]*\1/gu;
const TYPE = /^(?:string|boolean|unknown|undefined|never)\b/u;

/**
 * The skips a test file writes. `bare` gives no reason; `platform` is a bare condition on
 * `process.platform`, which is its own reason; `reasoned` is any other skip, whose words are a string
 * in the line or a value computed elsewhere, such as a `when(reason)` helper's.
 */
function skipsOf(text) {
  const bare = [];
  let platform = 0;
  let reasoned = false;
  if (!text.includes('skip')) return { bare, platform, reasoned };
  uncommented(text)
    .split('\n')
    .forEach((line, i) => {
      /* THE CHEAP QUESTION FIRST: a generated fixture can hold one line of many thousand word characters,
         and `\b\w+` walked over it from every offset is what made this gate take twelve seconds. */
      if (!line.includes('skip')) return;
      const how = /\b(?:test|it|describe|suite)\.skip\s*\(/u.exec(line) ?? /\b\w+\.skip\(\s*\)/u.exec(line);
      if (how) bare.push({ line: i + 1, how: how[0] });
      if (/\b\w+\.skip\(\s*[^)\s]/u.test(line)) reasoned = true;
      for (const m of line.matchAll(/\bskip:\s*([^,}\n]+)/gu)) {
        const value = m[1].trim();
        if (/^[[{]/u.test(value) || TYPE.test(value)) continue;
        const rest = value.replace(PLATFORM, 'P');
        if (/['"`]/u.test(rest)) reasoned = true;
        /* ONLY PLATFORM TERMS, joined: `process.platform === 'win32' || !hasSh` is a bare condition riding
           beside a platform one, and counting it as a platform skip would hide the half that says nothing. */
        else if (rest !== value && /^[P\s()&|]*$/u.test(rest)) platform++;
        else if (value === 'true' || /^!|[=<>]|&&|\|\|/u.test(rest)) bare.push({ line: i + 1, how: `skip: ${value}` });
        else reasoned = true;
      }
    });
  return { bare, platform, reasoned };
}

/** A helper many test files import is read once. */
const helperText = new Map();

/** The folders a skipping test waits on a build of, read from it and from the local helpers it imports. */
function buildsWanted(root, file, text, dirByName) {
  const helpers = [...text.matchAll(/from\s+'(\.{1,2}\/[^']+)'/gu)]
    .map((m) => posix.join(posix.dirname(file), m[1]))
    .flatMap((p) => [p, p.replace(/\.js$/u, '.ts')])
    .filter((p) => !TEST.test(p) && existsSync(join(root, p)))
    .map((p) => helperText.get(p) ?? helperText.set(p, readFileSync(join(root, p), 'utf8')).get(p));
  const all = [text, ...helpers].join('\n');
  const wanted = new Set();
  for (const m of all.matchAll(/\b((?:apps|packages)\/[\w-]+)(?:\/build\b| is not built)/gu)) wanted.add(m[1]);
  for (const m of all.matchAll(/(@[\w-]+\/[\w-]+) build\b/gu)) if (dirByName.has(m[1])) wanted.add(dirByName.get(m[1]));
  /* THE SKIP CAN LIVE IN THE HELPER, as `apps/site/test/built.ts`'s `when` does for five files. */
  return wanted.size > 0 && skipsOf(all).reasoned ? [...wanted].sort() : [];
}

/**
 * THE CHECK IS A FUNCTION `run.mjs` CALLS, `52 §5.1` step 3, and nothing in this file happens on import.
 * The root is an argument, then `BRAINDOG_GATE_ROOT` (the handle `self-test` aims it at a planted tree
 * with), then the repository this file sits in. It returns 1 on a finding, 3 when it read no test file at
 * all, and falls off the end for a pass.
 */
export default function orphanTests(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const files = [...walk(root)].sort();
  /* A ROOT WITH NO TEST FILE IS A WRONG ROOT, and green over it would read as a tree where every test
     runs. */
  if (files.length === 0) {
    console.log(`  orphan-tests: no test file was read under ${root}, so nothing was checked.`);
    return 3;
  }

  const dirs = workspaces(root);
  const dirByName = new Map();
  for (const d of dirs) {
    const name = readJson(join(root, d, 'package.json'))?.name;
    if (typeof name === 'string') dirByName.set(name, d);
  }
  const ownerOf = (f) => dirs.filter((d) => f.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0] ?? null;

  const scriptCalls = (d) => testCalls(scriptText(readJson(join(root, d, 'package.json'))?.scripts, 'test'));
  const reachers = [];
  const noScript = new Set();
  for (const d of ['', ...dirs]) {
    const calls = scriptCalls(d);
    if (calls.length === 0 && d) noScript.add(d);
    for (const globs of calls) for (const re of reach(d, globs)) reachers.push({ re, built: null });
  }
  for (const { base, globs, built } of workflowCalls(root, dirByName, scriptCalls))
    for (const re of reach(base, globs)) reachers.push({ re, built });
  for (const globs of gateCalls(root)) for (const re of reach('', globs)) reachers.push({ re, built: null });

  const findings = [];
  const counts = { orphan: 0, bare: 0, build: 0 };
  const byPlatform = [];
  let platformSkips = 0;
  for (const f of files) {
    const ws = ownerOf(f);
    const by = reachers.filter((r) => r.re.test(f));
    if (by.length === 0) {
      counts.orphan++;
      const why =
        ws === null
          ? 'it is in no workspace, and no root script, workflow step or gate names it'
          : noScript.has(ws)
            ? `${ws} has test files and no test script`
            : `the test script of ${ws} does not reach it, and no workflow step or gate names it`;
      findings.push(`  ${f}  is run by nothing: ${why}.`);
    }
    const text = readFileSync(join(root, f), 'utf8');
    const skips = skipsOf(text);
    for (const { line, how } of skips.bare) {
      counts.bare++;
      findings.push(`  ${f}:${line}  skips with \`${how}\`, which gives no reason.`);
    }
    if (skips.platform > 0) {
      platformSkips += skips.platform;
      byPlatform.push(f);
    }
    /* A SKIP FOR WANT OF A BUILD runs only where a step before it made that build. A file nothing runs
       is already named above, so it is not named twice. */
    const wanted = buildsWanted(root, f, text, dirByName);
    const afterBuild = (r) => r.built !== null && wanted.every((w) => r.built.has('*') || r.built.has(w));
    if (wanted.length > 0 && by.length > 0 && !by.some(afterBuild)) {
      counts.build++;
      findings.push(`  ${f}  skips without a build of ${wanted.join(' and ')}, and no workflow step runs it after that build.`);
    }
  }

  if (findings.length) console.log(`\n${findings.join('\n')}\n`);
  if (platformSkips > 0)
    console.log(`  ${platformSkips} test(s) skip by platform, in ${byPlatform.length} file(s): ${byPlatform.join(', ')}`);
  console.log(
    `  orphan-tests: ${files.length} test file(s) in ${dirs.length} workspace(s); ${counts.orphan} run by nothing, ` +
      `${counts.bare} skip(s) with no reason, ${counts.build} wait on a build no step before them makes`,
  );
  if (findings.length) return 1;
}

/* AND STILL A SCRIPT, because `self-test` spawns it at a planted tree. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = orphanTests(process.argv[2]) ?? 0;
