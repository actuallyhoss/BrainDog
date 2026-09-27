/**
 * Mutation runs over the guard lines: break each guard in a scratch copy of the tree and ask whether its tests notice.
 *
 *   node tools/mutate.mjs                     every row of `GUARDS`
 *   node tools/mutate.mjs --only limit-key    the rows named, by id, comma-separated
 *
 * A GUARD TEST THAT CANNOT FAIL IS THE CLASS THE AUDITS KEPT FINDING (`loop/finish/ops.md` SC34). A test written beside
 * a ceiling, a key or a compare-and-set can pass for a reason that has nothing to do with the guard: a fixture that
 * never reaches the boundary, an assertion on the wrong field, a stub that answers yes to everything. Reading the test
 * does not show that, and a green run cannot, because green is exactly what such a test prints. The only proof is to
 * take the guard away and watch the test go red. That is what each row here does, one at a time.
 *
 * IN A SCRATCH COPY, NEVER IN THE TREE. Several people and agents write in this repository at once, and a guard left
 * broken by a run that was killed halfway would be a security hole in somebody's working copy. So the tree is copied
 * into the system's temporary directory once, every mutant is written into the copy and restored there, and the copy
 * is removed at the end. Nothing this file does writes inside the repository.
 *
 * NO MARKER IS WRITTEN INTO ANYONE'S SOURCE. A row names its guard by the exact text of the line (`anchor`) and what the
 * line becomes with the guard gone (`mutant`). An anchor must occur exactly once in its file, and a row whose anchor is
 * absent or repeated is red, naming the row: a guard that was rewritten has to have its row rewritten with it, or the
 * run would go on reporting a guard it no longer tests.
 *
 * THE TESTS MUST BE GREEN BEFORE THE MUTANT. Each row's tests run first on the unbroken copy, and a row whose tests are
 * already red is reported as such rather than as a kill: a test that fails for another reason fails under the mutant
 * too, and that proves nothing about the guard.
 *
 * A ROW PER GUARD, ADDED BY WHOEVER ADDS THE GUARD. The rows below are the guards the tree holds as this file landed
 * (`loop/finish/ops.md` OPS-25). The Stripe signature comparison and the lapse cap are not built yet; each unit that
 * builds a guard of this kind adds its row here in the same change, with the test that is meant to catch its removal.
 *
 * `.github/workflows/mutate.yml` runs this weekly and on a pull request labelled `full-gates`. It exits 1 when a row
 * survives, is stale, or has red tests before its mutant, and 2 for a selection that names no row.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository this file sits in. */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * One test file's run, at most: a ceiling for a hang, not a budget. A mutant can turn a bounded loop into an unbounded
 * one, and a run that waited for it would be a job killed at its own ceiling with no row named.
 */
const PER_RUN_MS = 10 * 60_000;

/**
 * The guards, each with the line that holds it, what the line becomes without it, and the tests meant to notice.
 *
 * `tests` ARE PATHS FROM THE ROOT, each run with `node --test` from the folder of the workspace that holds it, which is
 * where its own `pnpm test` runs it. A mutant is the guard gone or moved by one, never a new behaviour: the question is
 * only whether the test sees the guard.
 */
const GUARDS = [
  /* THE SQL GUARD'S CEILINGS (`packages/ports/src/sql.ts`, `guard`), each moved one past the Durable Object's measured
     limit. `sql.test.ts` asks each at the ceiling and one past it, so a ceiling that drifts by one is the red it
     exists to give. */
  {
    id: 'sql-params',
    file: 'packages/ports/src/sql.ts',
    anchor: 'if (params.length > DO_LIMITS.variableNumber)',
    mutant: 'if (params.length > DO_LIMITS.variableNumber + 1)',
    tests: ['packages/ports/test/sql.test.ts'],
  },
  {
    id: 'sql-length',
    file: 'packages/ports/src/sql.ts',
    anchor: 'if (n > DO_LIMITS.sqlLength)',
    mutant: 'if (n > DO_LIMITS.sqlLength + 1)',
    tests: ['packages/ports/test/sql.test.ts'],
  },
  {
    id: 'sql-like',
    file: 'packages/ports/src/sql.ts',
    anchor: 'if (n > DO_LIMITS.likePatternLength)',
    mutant: 'if (n > DO_LIMITS.likePatternLength + 1)',
    tests: ['packages/ports/test/sql.test.ts'],
  },
  {
    id: 'sql-compound',
    file: 'packages/ports/src/sql.ts',
    anchor: 'if (terms > DO_LIMITS.compoundSelect)',
    mutant: 'if (terms > DO_LIMITS.compoundSelect + 1)',
    tests: ['packages/ports/test/sql.test.ts'],
  },
  /* `limitKey` KEYS A CALLER BY WHO THEY ARE, NEVER BY THE RECORD (`packages/host/src/limits.ts`). Keyed by the record,
     two tokens on one record share one budget, and an integration in a loop refuses the owner's own phone. */
  {
    id: 'limit-key',
    file: 'packages/host/src/limits.ts',
    anchor: 'return `${kind}:${id}`;',
    mutant: 'return `record:${door.record}`;',
    tests: ['packages/host/test/limits.test.ts'],
  },
  /* `crashed` ANSWERS A REFERENCE AND LOGS THE REASON (`packages/host/src/crash.ts`). The mutant is the defect it
     fixed: the thrown sentence, which can hold a row's value, handed back to whoever asked. */
  {
    id: 'crash-fix',
    file: 'packages/host/src/crash.ts',
    anchor:
      "fix: `${where} could not be answered, and the reason is in this host's log under ${ref}. Quote that to whoever runs it.`,",
    mutant: "fix: `${where} could not be answered: ${reasonOf(e)}. The reason is also in this host's log under ${ref}.`,",
    tests: ['packages/host/test/crash.test.ts'],
  },
  /* THE OPERATOR'S TOKEN CUT-OFF (`packages/kernel/src/token.ts`, `verifyToken`). Without the line, a bearer minted
     before the instant an incident began is admitted as though nothing had been pulled. */
  {
    id: 'token-cut-off',
    file: 'packages/kernel/src/token.ts',
    anchor: 'if (endedByCutOff(deps.validFrom, row.created_at)) return wrong;',
    mutant: 'if (false) return wrong;',
    tests: ['packages/kernel/src/api/ops-revoke.test.ts'],
  },
  /* THE RE-WRAP'S COMPARE-AND-SET (`packages/kernel/src/api/keys.ts`, `rewrapKeys`). A row is moved only while it
     still names the key it is moved from; without the compare, a second re-wrap reports keys moved that were not. */
  {
    id: 'rewrap-compare',
    file: 'packages/kernel/src/api/keys.ts',
    anchor: 'if (!under.includes(row.purpose)) continue;',
    mutant: '',
    tests: ['packages/kernel/src/api/keys.test.ts'],
  },
];

/** The rows this run is asked for: every row, or those `--only` names. */
function selected() {
  const at = process.argv.indexOf('--only');
  if (at === -1) return GUARDS;
  const names = (process.argv[at + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((name) => !GUARDS.some((row) => row.id === name));
  if (names.length === 0 || unknown.length > 0) {
    console.error(
      `  --only takes row ids, comma-separated, and ${unknown.length > 0 ? `no row is called ${unknown.join(', ')}` : 'none was given'}. ` +
        `The rows are: ${GUARDS.map((row) => row.id).join(', ')}.`,
    );
    process.exit(2);
  }
  return GUARDS.filter((row) => names.includes(row.id));
}

/**
 * The tree, copied into `to`, with every link that points inside the tree pointed inside the copy instead.
 *
 * `.git` IS LEFT BEHIND, because nothing a test runs reads it. `node_modules/.pnpm` at the root, the package store, is
 * linked rather than copied: it is most of the bytes, nothing in it is ever mutated, and a third-party module resolved
 * through the link is the same module either way.
 *
 * A LINK INTO THE TREE IS RE-POINTED, and that is what makes the copy a copy. A workspace package reaches another
 * through a link in its own `node_modules` (`@braindog/ports` inside `packages/host`), and on Windows pnpm writes those
 * links with absolute targets, so copied as they are they would lead back into the repository and a test would import
 * the guard unbroken. The target is resolved and mapped to the same place in the copy.
 *
 * A LINK TO A FILE IS COPIED AS THE FILE, because Windows creates a file link only with a privilege most accounts lack.
 * A link that leads nowhere is left out, as it resolves to nothing in the tree too.
 *
 * `links` COLLECTS EVERY DIRECTORY LINK MADE, so the clean-up removes each link before it removes the copy, and a
 * recursive removal is never asked to decide whether to follow one into the package store.
 */
function copyTree(from, to, links) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (source === join(ROOT, 'node_modules', '.pnpm')) {
      link(source, target, links);
      continue;
    }
    /* `lstat` RATHER THAN THE DIRECTORY ENTRY'S OWN TYPE, because whether a Windows junction is reported there as a
       link or as a folder is the platform's choice, and a junction walked as a folder would lead into the package store
       and round any cycle in it. */
    if (lstatSync(source).isSymbolicLink()) {
      let real;
      try {
        real = realpathSync(source);
      } catch {
        continue;
      }
      const inside = real === ROOT || real.startsWith(ROOT + sep);
      const mapped = inside ? join(scratchRoot, relative(ROOT, real)) : real;
      if (statSync(real).isDirectory()) link(mapped, target, links);
      else copyFileSync(real, target);
      continue;
    }
    if (entry.isDirectory()) copyTree(source, target, links);
    else if (entry.isFile()) copyFileSync(source, target);
  }
}

/** A directory link: a junction on Windows, which needs no privilege, and a symbolic link everywhere else. */
function link(target, at, links) {
  symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
  links.push(at);
}

/** Remove a link and never what it leads to: `unlink` for a symbolic link, `rmdir` for a Windows junction. */
function unlinkOnly(at) {
  try {
    unlinkSync(at);
  } catch {
    rmdirSync(at);
  }
}

/** The folder of the workspace that holds a file: the nearest folder above it with a `package.json`. */
function workspaceOf(file) {
  let dir = dirname(file);
  while (dir.startsWith(scratchRoot) && dir !== scratchRoot) {
    try {
      statSync(join(dir, 'package.json'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  return scratchRoot;
}

/**
 * One test file under the copy: `pass`, `fail` or `hang`, and what it printed last. `hang` is a run stopped at
 * `PER_RUN_MS` or ended by a signal: either way the test did not finish green.
 */
function runTest(test) {
  const file = join(scratchRoot, ...test.split('/'));
  const r = spawnSync(process.execPath, ['--test', file], {
    cwd: workspaceOf(file),
    encoding: 'utf8',
    timeout: PER_RUN_MS,
  });
  const said = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n');
  if (r.error?.code === 'ETIMEDOUT' || r.signal !== null) return { outcome: 'hang', said };
  return { outcome: r.status === 0 ? 'pass' : 'fail', said };
}

/** A row's tests together: green only when every file is. */
function runTests(tests) {
  for (const test of tests) {
    const one = runTest(test);
    if (one.outcome !== 'pass') return { ...one, test };
  }
  return { outcome: 'pass' };
}

/* THE COPY'S ROOT, set once before any row runs; `copyTree` and `workspaceOf` read it. */
let scratchRoot = '';

function main() {
  const rows = selected();
  const findings = [];
  let killed = 0;
  const links = [];
  scratchRoot = mkdtempSync(join(tmpdir(), 'braindog-mutate-'));
  const t0 = performance.now();
  try {
    copyTree(ROOT, scratchRoot, links);
    console.log(`  mutate: the tree copied to ${scratchRoot} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

    /* ONE BASELINE PER TEST FILE, since several rows share one. */
    const baseline = new Map();
    for (const row of rows) {
      const where = join(scratchRoot, ...row.file.split('/'));
      let original;
      try {
        original = readFileSync(where, 'utf8');
      } catch {
        findings.push(`${row.id}: ${row.file} is not in the tree, so the guard this row names has moved or gone. Rewrite the row.`);
        continue;
      }
      const times = original.split(row.anchor).length - 1;
      if (times !== 1) {
        findings.push(
          `${row.id}: the anchor is in ${row.file} ${times === 0 ? 'nowhere' : `${times} times`}, and a row names exactly one ` +
            'line. The guard was rewritten, so its row has to be rewritten with it.',
        );
        continue;
      }
      const before = row.tests.map((test) => {
        if (!baseline.has(test)) baseline.set(test, runTest(test));
        return { test, ...baseline.get(test) };
      });
      const red = before.find((b) => b.outcome !== 'pass');
      if (red) {
        findings.push(
          `${row.id}: ${red.test} is not green before the mutant (${red.outcome}), so a red run under it would prove nothing. ` +
            `What it said:\n${red.said.replace(/^/gm, '        ')}`,
        );
        continue;
      }
      writeFileSync(where, original.replace(row.anchor, () => row.mutant));
      try {
        const after = runTests(row.tests);
        if (after.outcome === 'pass') {
          findings.push(
            `${row.id}: SURVIVED. With the guard in ${row.file} broken, ${row.tests.join(' and ')} stayed green, so ` +
              'no test here would notice the guard going. Write the test that fails without it.',
          );
        } else {
          killed++;
          console.log(`  ${row.id}: killed by ${after.test}${after.outcome === 'hang' ? ', which did not finish' : ''}`);
        }
      } finally {
        writeFileSync(where, original);
      }
    }
  } finally {
    for (const at of links.reverse()) unlinkOnly(at);
    rmSync(scratchRoot, { recursive: true, force: true });
  }

  const took = ((performance.now() - t0) / 1000).toFixed(1);
  if (findings.length === 0) {
    console.log(`\n  mutate: ${killed} of ${rows.length} guards broken, and each one's tests went red, in ${took} s\n`);
    return;
  }
  for (const finding of findings) console.error(`    ${finding}`);
  console.error(`\n  mutate: ${findings.length} of ${rows.length} rows are not proven, in ${took} s\n`);
  process.exitCode = 1;
}

main();
