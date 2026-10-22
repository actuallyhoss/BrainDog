/**
 * `hygiene`: nothing local, private or generated is tracked, and `.gitignore` still keeps it out (WAY-B02).
 *
 *   node tools/gates/hygiene.mjs [root]
 *
 * THE RULE: a clean commit history that names neither the old system nor other projects (W.26), and working notes
 * and directions stay local and out of git. `.gitignore` says so, and a
 * pattern only stops `git add`: `git add -f`, or a line taken out of `.gitignore`, and the private notes are public.
 * This gate reads what is tracked, `git ls-files`, so a path that got in by any door is red.
 *
 * THE RULES, over every tracked path:
 *   - nothing under `loop/`, and no `.claude/` folder anywhere;
 *   - no `CLAUDE.md` or `CLAUDE.local.md` anywhere, and no `REPORT.md` or `BUILD.md` at the root;
 *   - no `*.local.json`, no `.env` or `.env.*`, no `.dev.vars`;
 *   - no basename starting `_` but `_headers`, which Cloudflare reads from each app's static folder;
 *   - no `*.brain`, `*.brainl` or `*.sqlite`, which are records;
 * and `.gitignore` still holds each line of `GUARDS`, MATCHED BY ITS TEXT AND NEVER BY ITS LINE NUMBER, so a comment
 * added above them moves nothing and a guard deleted is red.
 *
 * A planted tree is a folder with `files.txt` (one tracked path a line) and `gitignore.txt`, and no repository of its
 * own: a real `.gitignore` in a planted tree would be obeyed by git for this repository.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRepository } from './public-clean.mjs';

/** The exit of a gate that could not run, which is no pass. */
const COULD_NOT_RUN = 3;

/** The lines `.gitignore` must keep, each with what it keeps out. */
export const GUARDS = [
  ['*.brain', 'a record'],
  ['*.brainl', 'a record'],
  ['*.sqlite', 'a database'],
  ['_*', 'a working file'],
  ['/loop/', "the loop's notes, briefs and reports"],
  ['/REPORT.md', 'a report'],
  ['/BUILD.md', 'a build note'],
  ['/CLAUDE.md', "an agent's directions"],
  ['/.claude/', "an agent's settings and notes"],
  ['tools/gates/*.local.json', "a gate's private word lists"],
];

/** Each rule: a test over a tracked path, and what the path is. The first that holds is the finding. */
const RULES = [
  [(p) => p.startsWith('loop/'), "the loop's working notes, which stay on the machine that builds"],
  [(p) => /(?:^|\/)\.claude\//u.test(p), "an agent's settings or notes, which stay local"],
  [(p) => /(?:^|\/)CLAUDE(?:\.local)?\.md$/u.test(p), "an agent's directions, which stay local"],
  [(p) => p === 'REPORT.md' || p === 'BUILD.md', "a builder's report, which stays local"],
  [(p) => p.endsWith('.local.json'), 'a local file, which by its name is never shared'],
  [(p) => /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars)$/u.test(p), 'an environment file, where keys live'],
  [(p) => /(?:^|\/)_[^/]*$/u.test(p) && !p.endsWith('/_headers') && p !== '_headers', 'a working file, by its leading underscore'],
  [(p) => /\.(?:brain|brainl|sqlite)$/u.test(p), "a record or a database, which holds someone's life"],
];

/** The findings for `files` (tracked paths) and `ignore` (the text of `.gitignore`, or `null` when there is none). */
export function checkHygiene(files, ignore) {
  const out = [];
  for (const p of files) {
    const hit = RULES.find(([test]) => test(p));
    if (hit) out.push(`  ${p}  is tracked, and it is ${hit[1]}: \`git rm --cached ${p}\` and keep it local`);
  }
  if (ignore === null) out.push('  .gitignore  is missing, and it is what keeps the local files out');
  else {
    const lines = new Set(ignore.split('\n').map((l) => l.trim()));
    for (const [line, what] of GUARDS)
      if (!lines.has(line)) out.push(`  .gitignore  no longer holds the line ${line}, which keeps out ${what}: put it back`);
  }
  return out;
}

/** What is tracked and what `.gitignore` says: the repository's own, or a planted tree's two files. */
function readTree(ROOT) {
  const text = (f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : null);
  if (isRepository(ROOT)) {
    const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: Infinity });
    if (listed.status !== 0) return null;
    return { files: listed.stdout.split('\0').filter(Boolean), ignore: text('.gitignore'), where: 'git ls-files' };
  }
  const listed = text('files.txt');
  if (listed === null) return null;
  const files = listed.split('\n').map((l) => l.trim()).filter(Boolean);
  return { files, ignore: text('gitignore.txt'), where: 'files.txt' };
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function hygiene(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const tree = readTree(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (tree === null || tree.files.length === 0) {
    console.log(`  hygiene: no tracked path to read under ${ROOT} (no repository and no files.txt)`);
    return COULD_NOT_RUN;
  }
  const findings = checkHygiene(tree.files, tree.ignore);
  const where = `${tree.files.length} path(s) from ${tree.where}, ${GUARDS.length} guard line(s)`;
  if (findings.length === 0) {
    console.log(`  hygiene: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  hygiene: ${where}, ${findings.length} finding(s).\n` +
      '  Notes, directions, keys and records stay on the machine; the repository holds the product.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = hygiene(process.argv[2]) ?? 0;
