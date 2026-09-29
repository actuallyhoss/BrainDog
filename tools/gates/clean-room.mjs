/**
 * `clean-room`: a tripwire, not a proof.
 *
 * Nothing in BrainDog is ported from its predecessor, an earlier private tool. Nobody building it
 * reads that code; the design documents are the only source, and every part is designed on its own merits.
 * Its BEHAVIOURS were traced into `docs/32-PARITY.md`; its CODE stays where it is.
 *
 * This looks for the predecessor's distinctive identifiers. It cannot prove a clean room. The proof
 * is the rule, and the rule is kept by people. What it CAN do is fail loudly the day somebody pastes.
 *
 * Usage:  node tools/gates/clean-room.mjs [root]
 */

import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'shots', 'docs', 'loop']);

/**
 * THE PREDECESSOR'S OWN NAMES ARE NOT PUBLISHED, and a machine that knows them still guards them.
 * `private-tripwires.local.json` beside this file, which git ignores, is a JSON array of more
 * tripwires, read when it is there. A file that is there and is not an array of strings is a throw,
 * never an empty list, because a broken list read as none would pass every name it was written for.
 */
function privateTripwires() {
  const file = fileURLToPath(new URL('./private-tripwires.local.json', import.meta.url));
  if (!existsSync(file)) return [];
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list) || list.some((t) => typeof t !== 'string' || t === ''))
    throw new Error(`${file} must hold a JSON array of tripwire strings.`);
  return list;
}

/**
 * Identifiers distinctive to the predecessor. Deliberately narrow: a tripwire that fires on
 * ordinary English is a tripwire somebody disables.
 */
const TRIPWIRES = ['brain.ps1', 'BRAIN_TOKEN', 'brain_api', 'brain-worker', ...privateTripwires()];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|js|mjs|svelte|css|json|md|yml|yaml)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * THE CHECK IS A FUNCTION, and `run.mjs` imports it rather than spawning this file: `52 §5.1` step 3,
 * argued in the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import, and
 * everything above this line is a declaration.
 *
 * A ROOT ON THE COMMAND LINE IS STILL OBEYED RATHER THAN IGNORED. An ignored argument is worse than a
 * refused one, because the count this prints still reads as an answer about the directory you named,
 * so a clean result gets taken for proof about a tree it never once looked at. That is how a sibling
 * gate was misread the day this was written. So `argv[2]` is handed in at the foot of this file, and
 * the default is `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded fixture, and
 * then the working directory. It reads `argv` there and not here because in the runner's process
 * `argv[2]` is the runner's first flag: `--only clean-room` would have made this scan a directory
 * called `--only`. `run.mjs` passes the root it derived from its own location.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests
 * on: a pass is the end of the function and never a statement inside it.
 */
export default async function cleanRoom(root = process.env.BRAINDOG_GATE_ROOT ?? process.cwd()) {
  const ROOT = resolve(root);

  /* AN EMPTY LIST IS RED. A tripwire list that somebody empties to make the gate quiet is a gate that
     reports "no predecessor identifiers" over a repository nobody checked. That is the same shape as
     every other gate in this directory that passed by examining nothing. The tree is still read, so
     one run names this and every finding beside it. */
  const empty = TRIPWIRES.length === 0;
  if (empty) console.error('  clean-room: the tripwire list is empty, so this gate is checking nothing.');

  const findings = [];
  const files = await walk(ROOT);

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (rel.startsWith('tools/gates/')) continue;
    const text = await readFile(file, 'utf8');
    /* CASE-INSENSITIVE. `includes` is case-SENSITIVE, so `BRAIN_TOKEN` was caught and `Brain_Token`
       was not. A paste is exactly where a case changes: an identifier renamed on the way in is
       the ordinary shape of a port, not an exotic one. 52 §5.2 says whole-word and case-insensitive;
       this was neither. Whole-word is not applied because several tripwires contain a `.` or a `-`,
       which `\b` treats as a boundary. They are already distinctive enough to be narrow. */
    for (const needle of TRIPWIRES)
      if (text.toLowerCase().includes(needle.toLowerCase())) findings.push({ rel, needle });
  }

  if (findings.length === 0) {
    console.log(`  clean-room: ${files.length} files, no predecessor identifiers`);
  } else {
    for (const f of findings) console.error(`  ${f.rel}  contains "${f.needle}"`);
    console.error('\n  clean-room: the design documents are the only source. Nothing is ported.');
  }
  if (empty || findings.length > 0) return 1;
}

/* AND IT IS STILL A SCRIPT. `self-test` spawns each gate against a seeded tree, and the header above
   documents `node tools/gates/clean-room.mjs [root]`, so the command line stays exactly where it was.
   `?? 0` because a pass returns nothing: see the function's own last paragraph. */
if (import.meta.main) process.exitCode = (await cleanRoom(process.argv[2])) ?? 0;
