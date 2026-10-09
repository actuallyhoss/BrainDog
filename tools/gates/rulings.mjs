/**
 * The rulings page and its tests, held together (SHL-A02).
 *
 * `docs/04-PACKS.md` §9 writes each settled question once, with the test that holds it. A ruling written and never
 * built is the risk this gate exists for, and its sign is a ruling whose test is a placeholder or is missing, so:
 *
 *   1. the page has a Rulings section with at least one ruling;
 *   2. every ruling names a test file in backticks, the file exists, and it holds a test whose name says "ruling <n>";
 *   3. a ruling whose test is marked `todo` says "waits on" on the page, and one that says "waits on" has a `todo` test,
 *      so the page cannot call built what the tests know is not;
 *   4. every test in a rulings file (`packages/<p>/test/rulings.test.ts`, `apps/<a>/test/rulings.test.ts`, and any
 *      file the page names) names a ruling on the page, so no test holds a ruling nobody wrote down.
 *
 * Text only: nothing is run. Whether the tests pass is each package's own `node --test`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGE = 'docs/04-PACKS.md';
export const HEADING = '## 9 · Rulings';

/** The rulings of the page's Rulings section, in order: number, the test files it names, and whether it waits. */
export function rulingsOf(page) {
  const at = page.indexOf(`\n${HEADING}\n`);
  if (at < 0) return null;
  const rest = page.slice(at + HEADING.length + 2);
  const end = rest.search(/^## /mu);
  const out = [];
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split('\n')) {
    const m = /^\| (\d{3}) \|/u.exec(line);
    if (!m) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const held = cells[cells.length - 1] ?? '';
    const files = [...held.matchAll(/`([^`]+\.test\.(?:ts|mjs))`/gu)].map((f) => f[1]);
    out.push({ id: m[1], files, waits: /\bwaits on\b/u.test(held) });
  }
  return out;
}

/** Every `test('…', …)` in a file's text: its name and whether its options say `todo`. */
export function testsIn(text) {
  const out = [];
  const re = /\btest\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(\{[^{}]*\})?/gu;
  for (const m of text.matchAll(re)) out.push({ name: m[2].replace(/\\(.)/gu, '$1'), todo: /\btodo\s*:/u.test(m[3] ?? '') });
  return out;
}

/** The ruling a test's name holds, or `null`. */
export const rulingOf = (name) => /\bruling (\d{3})\b/u.exec(name)?.[1] ?? null;

/** The rulings files the tree holds by name, relative to the root. */
export function rulingsFiles(root) {
  const out = [];
  for (const top of ['packages', 'apps']) {
    if (!existsSync(join(root, top))) continue;
    for (const e of readdirSync(join(root, top), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const file = `${top}/${e.name}/test/rulings.test.ts`;
      if (existsSync(join(root, file))) out.push(file);
    }
  }
  return out;
}

/** Every finding, as a sentence that names the ruling or the file and what to do. */
export function judge(root) {
  const findings = [];
  if (!existsSync(join(root, PAGE))) return [`  ${PAGE} is missing, so no ruling is written anywhere.`];
  const rulings = rulingsOf(readFileSync(join(root, PAGE), 'utf8'));
  if (rulings === null) return [`  ${PAGE} has no "${HEADING}" section. Write each settled question there once, with the test that holds it.`];
  if (rulings.length === 0) return [`  ${PAGE} §9 holds no ruling. Each is a line starting "| <number> |".`];

  const known = new Set();
  const read = new Map();
  const testsOf = (file) => {
    if (!read.has(file)) read.set(file, existsSync(join(root, file)) ? testsIn(readFileSync(join(root, file), 'utf8')) : null);
    return read.get(file);
  };
  for (const r of rulings) {
    if (known.has(r.id)) findings.push(`  ruling ${r.id} is written twice on the page. A ruling is written once.`);
    known.add(r.id);
    if (r.files.length === 0) {
      findings.push(`  ruling ${r.id} names no test. Its last column names the test file, in backticks.`);
      continue;
    }
    const held = [];
    for (const file of r.files) {
      const tests = testsOf(file);
      if (tests === null) findings.push(`  ruling ${r.id} is held by ${file}, which does not exist.`);
      else held.push(...tests.filter((t) => rulingOf(t.name) === r.id));
    }
    if (held.length === 0 && r.files.every((f) => testsOf(f) !== null))
      findings.push(`  ruling ${r.id}: ${r.files.join(', ')} holds no test named "ruling ${r.id}". Write the test, or the ruling is only words.`);
    const todo = held.some((t) => t.todo);
    if (todo && !r.waits) findings.push(`  ruling ${r.id} has a test marked todo, and the page does not say what it waits on.`);
    if (!todo && r.waits && held.length > 0) findings.push(`  ruling ${r.id} says it waits, and every test of it runs. Take "waits on" off the page.`);
  }

  for (const file of new Set([...rulingsFiles(root), ...rulings.flatMap((r) => r.files)])) {
    for (const t of testsOf(file) ?? []) {
      const id = rulingOf(t.name);
      if (id === null) findings.push(`  ${file}: "${t.name}" names no ruling. A test in a rulings file starts "ruling <number>:".`);
      else if (!known.has(id)) findings.push(`  ${file}: "${t.name}" holds ruling ${id}, which the page does not write.`);
    }
  }
  return findings;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned. The root defaults to `BRAINDOG_GATE_ROOT`, which
 * is how a test aims the gate at a seeded tree.
 */
export default function rulings(root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')) {
  const ROOT = resolve(root);
  const findings = judge(ROOT);
  const count = existsSync(join(ROOT, PAGE)) ? (rulingsOf(readFileSync(join(ROOT, PAGE), 'utf8')) ?? []).length : 0;
  if (findings.length === 0) {
    console.log(`  rulings: ${count} ruling(s), each held by a test, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(`\n  rulings: ${count} ruling(s), ${findings.length} finding(s). The page and its tests are kept together (${PAGE} §9).`);
  return 1;
}

if (import.meta.main) process.exitCode = rulings(process.argv[2]) ?? 0;
