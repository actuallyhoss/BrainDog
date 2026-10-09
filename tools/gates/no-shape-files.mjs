/**
 * `no-shape-files`: no shape copy of a record is kept where it can be committed.
 *
 *   node tools/gates/no-shape-files.mjs [root]
 *
 * A SHAPE COPY IS A RECORD'S STRUCTURE WITH EVERY VALUE SCRAMBLED (PRF-A13, `packages/kernel/src/shape.ts`). It holds no
 * word of the record, and it still holds the record's shape: how many lists, how many things in each, how long each
 * name is, which ones repeat. That is his to share with an agent on his own machine, and never the repository's.
 * `.gitignore` keeps `*.brainl` out, and a copy renamed to anything else walks past it; this reads the file's own mark.
 *
 * THE MARK IS THE ONE THE IMPORT READS: `#shape: true` alone on one of the first four lines (`SHAPE_MARK`, `isShape`).
 * Only the head of each file is read, so a comment or a test that quotes the mark further down is not a copy.
 *
 * WHAT `git add` WOULD TAKE, NOT ONLY WHAT IS TRACKED. On a root that is a repository's own top the files are git's
 * tracked ones and the untracked ones it does not ignore, because a copy waiting beside the code is one `git add` from
 * being published; an ignored copy (`marrowgate.shape.brainl` where `export --shape` wrote it) is where it belongs. On
 * a planted tree, which is no repository, every file is walked. This gate's own planted tree is left out of the
 * repository's pass, because it is a copy made to be found.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The mark, as `packages/kernel/src/shape.ts` writes it. Kept here as text because a gate does not load the kernel. */
export const SHAPE_MARK = '#shape: true';
/** How much of a file is read: the mark is on line two, and four lines of any export fit in this. */
const HEAD = 4096;
/** This gate's own planted tree, which holds a copy on purpose. */
const PLANTED = 'tools/gates/negative/no-shape-files/';

/** Whether `root` is a repository's own top, which a planted tree inside this one is not. */
function isRepository(root) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  return top.status === 0 && realpathSync(top.stdout.trim()) === realpathSync(root);
}

/** Every file `git add` would take, repository-relative with `/`, or every file under a planted tree; `null` if git failed. */
export function filesOf(root) {
  if (isRepository(root)) {
    const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (listed.status !== 0) return null;
    return [...new Set(listed.stdout.split('\0').filter(Boolean))].filter((rel) => !rel.startsWith(PLANTED));
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

/** The line the mark is on (1 to 4), or `null`: the file's head, read as text, the way `isShape` reads lines. */
export function markLine(head) {
  if (head.subarray(0, Math.min(head.length, 8000)).includes(0)) return null;
  const lines = head.toString('utf8').replace(/^﻿/u, '').split(/\r?\n/u).slice(0, 4);
  const at = lines.findIndex((l) => l.trim() === SHAPE_MARK);
  return at === -1 ? null : at + 1;
}

/** The first `HEAD` bytes of a file, or `null` when it is gone from the working tree or is not a file. */
function headOf(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(HEAD);
    return buf.subarray(0, readSync(fd, buf, 0, HEAD, 0));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned. The root defaults to `BRAINDOG_GATE_ROOT`, which
 * is how `self-test` aims a gate at its planted tree. It returns 1 or 3 and falls off the end for a pass.
 */
export default function noShapeFiles(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const files = filesOf(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED, and a mistyped root reads nothing. Exit 3 is "could not run". */
  if (files === null || files.length === 0) {
    console.log(`  no-shape-files: no file to read under ${ROOT}${files === null ? ' (git ls-files failed)' : ''}`);
    return 3;
  }
  const findings = [];
  for (const rel of files) {
    const head = headOf(join(ROOT, rel));
    const line = head === null ? null : markLine(head);
    if (line !== null) findings.push(`  ${rel}:${line}  a shape copy of a record, where it can be committed (${SHAPE_MARK})`);
  }
  if (findings.length === 0) {
    console.log(`  no-shape-files: ${files.length} file(s), 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-shape-files: ${files.length} file(s), ${findings.length} finding(s), each a shape copy kept beside the code.\n` +
      '  A shape copy is a record\'s shape and stays on its owner\'s machine. Delete it, or keep it under a name ending\n' +
      '  .shape.brainl, which git ignores.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its planted tree. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = noShapeFiles(process.argv[2]) ?? 0;
