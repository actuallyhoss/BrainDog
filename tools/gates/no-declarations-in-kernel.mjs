/**
 * The kernel ships no declarations. `02 §1`, `52 §5.2`.
 *
 *   node tools/gates/no-declarations-in-kernel.mjs
 *
 * THIS IS THE RULE THE WHOLE ADDITIVE STORY RESTS ON. A register, a page, a rule, a metric is a
 * DECLARATION (a row in one table, owned by a pack or by the person who wrote it), and the kernel's
 * job is to run whatever is declared, not to know what any of it means. The moment the kernel ships
 * an `obligations` register of its own, three things follow that nobody chose: a pack cannot own that
 * name, uninstalling it is a special case, and the record has a schema somebody has to migrate
 * rather than a schema somebody declares.
 *
 * IT IS THE KIND OF RULE THAT IS TRUE ON DAY ONE AND FALSE ON DAY NINETY, because breaking it is
 * always the shortest path: a seed row for a test, a "default" page, a register the first-run screen
 * needs. Each is one line and each is permanent. `02 §1` allows exactly one exception:
 * `register.session`, with `pack_id = 'kernel'`. That exception exists so that the rule can be
 * absolute everywhere else.
 *
 * WHAT IT CHECKS:
 *
 *   1. No `.yaml` or `.yml` under `packages/kernel/`. A declaration is a document, and a document in
 *      the kernel is a declaration in the kernel whatever else it is called.
 *   2. `INSERT INTO declaration` appears exactly once across the migrations, and it is
 *      `register.session` with `pack_id = 'kernel'`, as `52 §5.2` says. Migration 0002 writes it, so
 *      zero now means the register every agent write resolves to has been lost, which is a mistake
 *      and not a thing nobody has written yet.
 *   3. No object literal under `src/**` with a `kind:` of one of the eight pack kinds beside an
 *      `id:`. That is a declaration written in TypeScript, and the way this rule actually gets
 *      broken. Nobody adds a YAML file to the kernel; somebody adds a `const DEFAULT_PAGE = { id:
 *      'page.home', kind: 'page', … }` and it looks like configuration.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** `04 §1`'s eight. A ninth is a migration, which is what `closed-lists` is for. */
const KINDS = ['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Comments blanked rather than removed, so a line number means the line it names. */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const decomment = (text) => text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])(\/\/.*)$/gm, (_, a, c) => a + blank(c));
const lineOf = (text, at) => text.slice(0, at).split('\n').length;

const findings = [];
const kernel = join(root, 'packages', 'kernel');
const files = walk(kernel);

if (files.length === 0) findings.push('there is no packages/kernel to check');

/* 1 · A declaration is a document, and a document here is a declaration here. */
for (const file of files)
  if (/\.ya?ml$/i.test(file)) findings.push(`${relative(root, file)} is a document in the kernel, and a document is a declaration`);

/* 2 · The one row 02 §1 allows, and no other. */
let inserts = 0;
for (const file of files.filter((f) => /migrations[\\/].*\.ts$/.test(f))) {
  const text = decomment(readFileSync(file, 'utf8'));
  for (const m of text.matchAll(/INSERT INTO declaration/g)) {
    inserts++;
    const rest = text.slice(m.index, m.index + 600);
    if (!rest.includes("'register.session'"))
      findings.push(`${relative(root, file)}:${lineOf(text, m.index)} writes a declaration that is not register.session`);
    else if (!rest.includes("'kernel'"))
      findings.push(`${relative(root, file)}:${lineOf(text, m.index)} writes register.session without pack_id = 'kernel'`);
  }
}
if (inserts !== 1) findings.push(`the migrations write ${inserts} declarations, and 02 §1 and 52 §5.2 require exactly one`);

/* 3 · And the way it actually gets broken: a declaration written in TypeScript. */
for (const file of files.filter((f) => /[\\/]src[\\/].*\.ts$/.test(f) && !f.endsWith('.test.ts'))) {
  const text = decomment(readFileSync(file, 'utf8'));
  for (const m of text.matchAll(/\bkind:\s*'([a-z]+)'/g)) {
    if (!KINDS.includes(m[1])) continue;
    /* AN `id:` BESIDE IT IS WHAT MAKES IT A DECLARATION rather than a discriminated union arm. The
       kernel matches on `decl.kind` in a dozen places and every one of those is reading a
       declaration somebody else wrote; only a literal that also names an id is writing one. */
    const near = text.slice(Math.max(0, m.index - 200), m.index + 200);
    if (/\bid:\s*'[a-z]+\.[a-z0-9_-]+'/.test(near))
      findings.push(`${relative(root, file)}:${lineOf(text, m.index)} is a ${m[1]} declaration written in the kernel`);
  }
}

if (findings.length === 0) {
  console.log(`  no-declarations-in-kernel: ${files.length} files, ${inserts} declaration row(s), 0 written in code`);
} else {
  console.error(`\n  no-declarations-in-kernel: ${findings.length} finding(s) (02 §1)\n`);
  for (const f of [...new Set(findings)]) console.error(`    ${f}`);
  console.error(
    '\n  The kernel runs whatever is declared and knows what none of it means. A register the\n' +
      '  kernel ships is a name no pack can own and a schema somebody has to migrate.\n',
  );
  process.exitCode = 1;
}
