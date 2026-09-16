/**
 * `clean-room` — a tripwire, not a proof.
 *
 * Nothing in BrainDog is ported from the predecessor at `C:\Tools\legacy`. Nobody building it reads
 * that code; the design documents are the only source, and every part is designed on its own merits.
 * Its BEHAVIOURS were traced into `docs/32-PARITY.md`; its CODE stays where it is.
 *
 * This looks for the predecessor's distinctive identifiers. It cannot prove a clean room — the proof
 * is the rule, and the rule is kept by people. What it CAN do is fail loudly the day somebody pastes.
 *
 * Usage:  node tools/gates/clean-room.mjs [root]
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/* A ROOT ON THE COMMAND LINE IS OBEYED RATHER THAN IGNORED. An ignored argument is worse than a
   refused one, because the count this prints still reads as an answer about the directory you
   named, so a clean result gets taken for proof about a tree it never once looked at. That is not
   hypothetical: it is how a sibling gate was misread the day this was written. `process.cwd()`
   stays the default, since that is how `run.mjs` and `self-test.mjs` both aim this, spawning it
   with the root as the child's working directory and no argument. */
const ROOT = resolve(process.argv[2] ?? process.cwd());
const SKIP = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'shots', 'docs', 'loop']);

/**
 * Identifiers distinctive to the predecessor. Deliberately narrow: a tripwire that fires on
 * ordinary English is a tripwire somebody disables.
 */
const TRIPWIRES = [
  'brain.ps1',
  'BRAIN_TOKEN',
  'relay',
  'legacy-tool',
  'brain_api',
  'brain-worker',
  'entities.bake',
];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|js|mjs|svelte|css|json|md|yml|yaml)$/.test(e.name)) out.push(p);
  }
  return out;
}

/* AN EMPTY LIST IS RED. A tripwire list that somebody empties to make the gate quiet is a gate that
   reports "no predecessor identifiers" over a repository nobody checked — the same shape as every
   other gate in this directory that passed by examining nothing. */
if (TRIPWIRES.length === 0) {
  console.error('  clean-room: the tripwire list is empty, so this gate is checking nothing.');
  process.exitCode = 1;
}

const findings = [];
const files = await walk(ROOT);

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('tools/gates/')) continue;
  const text = await readFile(file, 'utf8');
  /* CASE-INSENSITIVE. `includes` is case-SENSITIVE, so `BRAIN_TOKEN` was caught and `Brain_Token`
     was not — and a paste is exactly where a case changes: an identifier renamed on the way in is
     the ordinary shape of a port, not an exotic one. 52 §5.2 says whole-word and case-insensitive;
     this was neither. Whole-word is not applied because several tripwires contain a `.` or a `-`,
     which `` treats as a boundary — they are already distinctive enough to be narrow. */
  for (const needle of TRIPWIRES)
    if (text.toLowerCase().includes(needle.toLowerCase())) findings.push({ rel, needle });
}

if (findings.length === 0) {
  console.log(`  clean-room: ${files.length} files, no predecessor identifiers`);
} else {
  for (const f of findings) console.error(`  ${f.rel}  contains "${f.needle}"`);
  console.error('\n  clean-room: the design documents are the only source. Nothing is ported.');
  process.exitCode = 1;
}
