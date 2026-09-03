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
 * Usage:  node tools/gates/clean-room.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
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

const findings = [];
const files = await walk(ROOT);

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('tools/gates/')) continue;
  const text = await readFile(file, 'utf8');
  for (const needle of TRIPWIRES)
    if (text.includes(needle)) findings.push({ rel, needle });
}

if (findings.length === 0) {
  console.log(`  clean-room: ${files.length} files, no predecessor identifiers`);
} else {
  for (const f of findings) console.error(`  ${f.rel}  contains "${f.needle}"`);
  console.error('\n  clean-room: the design documents are the only source. Nothing is ported.');
  process.exitCode = 1;
}
