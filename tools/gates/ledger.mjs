/**
 * `ledger`: a budget never rises and a held list only shrinks (PRF-B03, `loop/scope/area-proof-b.md` 2.4).
 *
 *   node tools/gates/ledger.mjs [root]
 *
 * THE ENTRY SCRIPT'S NUMBER WAS RAISED TWELVE TIMES WITH A SENTENCE EACH, AND NOTHING CHECKED THE SENTENCE. The gate
 * failed above a second number in `budgets.json`, and every re-record added a paragraph to one comment string. The rules
 * are that gate budgets are not raised (HD.549) and gates are not changed to make them pass (HD.550). `ledger.json` now holds
 * every number a gate is held to, with a dated line for each change, and this gate reads it:
 *
 *   - BUDGETS. Every number in `budgets.json` equals the newest line of its entry (a budget, or a debt that names the
 *     key). A `ceiling` line higher than the one before, or a `floor` line lower, is red unless `by` quotes the owner:
 *     a passage in double quotes that stands word for word in the owner's untracked notes (`loop/DIRECTION.md`).
 *   - DEBTS. A debt's newest line higher than the one before is red. A debt owed against a budget prints the budget,
 *     what is owed, and the newest reason.
 *   - HELD LISTS. Each is `<gate>.<EXPORT>`, read off the gate's own module. Larger than its newest line is red; smaller
 *     is red too, until a line records the fall. A line higher than the one before is red unless `by` quotes the owner,
 *     as a ceiling's is: on 16 October what three gates found was held rather than renamed ("Hold them, deploy
 *     tonight"), and a held list had no way to take that word. A gate that does not
 *     export the list yet is counted as a debt and said, never red.
 *   - NUMBERS IN A GATE FILE. A number above 1 written in `tools/gates/*.mjs` or a gate's parts one level down, and not read from `budgets.json`, is a
 *     finding. Today's are debts, one per file, written up front: more than the newest line is red, fewer is said.
 *   - DEVIATIONS. Each is named, with what it is, why, and the unit that ends it.
 *
 * THE RISE RULES READ ONLY LINES DATED ON OR AFTER `opened`, the day the ledger began. The lines before it are the
 * history the comment string held, and they rose; that is why the ledger exists, not a finding today. So that a new line
 * cannot be dated into that history, the day is held in this file too, and every entry older than it has a line on it.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const GATES = join('tools', 'gates');
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
/* THE DAY THE LEDGER BEGAN, held here and not only in `ledger.json`, because moving it later would turn every rise
   before the new day into history. */
const OPENED = '2026-10-09';
/** The names a gate exports a held list under (PRF-B03 step 3). A gate that exports one owes it a line. */
const HELD_NAMES = ['HELD', 'EXEMPT', 'ALLOWED', 'SKIPPED', 'UNCOVERED'];

/**
 * Numbers above 1 written in a source, read off the syntax tree so a string, a comment or a regular expression is never
 * counted. An index (`m[2]`) is not a number a gate is held to, and neither is 0 or 1.
 */
export function literalsIn(source) {
  const file = ts.createSourceFile('gate.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let count = 0;
  const visit = (node) => {
    if (ts.isNumericLiteral(node) && Number(node.text) > 1) {
      const p = node.parent;
      if (!(ts.isElementAccessExpression(p) && p.argumentExpression === node)) count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

/** The held lists a gate's source exports, by name, read off the text so nothing is imported to find them. */
export function heldExportsIn(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s+(?:const|let|var|function\*?|class)\s+([A-Z]+)\b/gu)) names.add(m[1]);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/gu))
    for (const part of m[1].split(',')) names.add(part.trim().split(/\s+as\s+/u).at(-1));
  return HELD_NAMES.filter((n) => names.has(n));
}

/** How many a held export holds: a number is itself, a list or a map its size, an object its keys. */
export function sizeOf(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return undefined;
}

/** Every number in `budgets.json` by its whole path. A list of widths is a setting, not a number one line can hold. */
export function numbersOf(budgets, prefix = '') {
  return Object.entries(budgets).flatMap(([k, v]) => {
    if (k.startsWith('//')) return [];
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') return [[path, v]];
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? numbersOf(v, path) : [];
  });
}

/**
 * The gate files a literal is counted in: `tools/gates/*.mjs` and one level down, `tools/gates/<part>/*.mjs`, where a
 * gate split by rule keeps its parts (`layout/`, PRF-B04 job 8). Not the planted trees and not the tests, which hold no
 * `.mjs` at that depth or are named here.
 */
const NOT_GATES = new Set(['negative', 'test', 'node_modules']);
export function gateFiles(root) {
  const dir = join(root, GATES);
  if (!existsSync(dir)) return [];
  const mjs = (d) => readdirSync(d).filter((f) => f.endsWith('.mjs')).sort();
  const parts = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NOT_GATES.has(e.name))
    .map((e) => e.name)
    .sort();
  return [...mjs(dir).map((f) => `tools/gates/${f}`), ...parts.flatMap((part) => mjs(join(dir, part)).map((f) => `tools/gates/${part}/${f}`))];
}

/**
 * What each held list holds, off the gate's own module under the root. No module, or no such export, is "not exported
 * yet". A module that throws on import is said, because a list nobody can read is a list nobody holds.
 */
export async function heldSizes(root, names) {
  const sizes = new Map();
  for (const name of names) {
    const dot = name.lastIndexOf('.');
    const file = join(root, GATES, `${name.slice(0, dot)}.mjs`);
    const exported = name.slice(dot + 1);
    if (dot < 1 || !existsSync(file)) {
      sizes.set(name, { missing: true });
      continue;
    }
    try {
      const mod = await import(pathToFileURL(file).href);
      if (!(exported in mod)) sizes.set(name, { missing: true });
      else sizes.set(name, { size: sizeOf(mod[exported]) });
    } catch (e) {
      sizes.set(name, { error: String(e?.message ?? e).split('\n')[0] });
    }
  }
  return sizes;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const filled = (s) => typeof s === 'string' && s.trim() !== '';
/** The number a line holds: `at` for a budget or a debt, `count` for a held list. */
const valueOf = (line) => line.at ?? line.count;

/**
 * The passages `by` quotes, in straight or curly double quotes, of four words or more. TWO WORDS FOUND ANYWHERE IN THE
 * OWNER'S NOTES, "the gate", let any ceiling rise and stayed green (gates-ledger-43 checker, P5): a quote is a whole sentence.
 */
const FOUR_WORDS = /\S+\s+\S+\s+\S+\s+\S/u;
const quotesOf = (by) => [...String(by ?? '').matchAll(/["“]([^"”]+)["”]/gu)].map((m) => m[1].trim()).filter((q) => FOUR_WORDS.test(q));
/** Whether `by` quotes the owner: a passage that stands word for word in the owner's notes. */
export const quotesOwner = (by, direction) => quotesOf(by).some((q) => direction.includes(q));

/** A line's shape, said in one sentence each. Lines are dated, in date order, each with its number and its reason. */
function shapeOf(name, entry, opened) {
  const lines = entry?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return [`  ${name} has no lines. Every entry starts with its first line.`];
  const said = [];
  lines.forEach((line, i) => {
    if (!Number.isFinite(valueOf(line))) said.push(`  ${name}: line ${i + 1} holds no number (\`at\`, or \`count\` for a held list).`);
    if (!DATE.test(line.on ?? '')) said.push(`  ${name}: line ${i + 1} has no \`on\` date written YYYY-MM-DD.`);
    if (!filled(line.why)) said.push(`  ${name}: line ${i + 1} gives no \`why\`. A number moves with its reason on the line.`);
    if (i > 0 && DATE.test(line.on ?? '') && line.on < lines[i - 1].on) said.push(`  ${name}: line ${i + 1} is dated before the line above it.`);
  });
  /* AN ENTRY OLDER THAN THE LEDGER HAS A LINE ON THE DAY IT BEGAN, restating its number. Lines stay in date order, so a
     new line cannot be dated into the history to slip past the rise rules; it would sit above that line. */
  if (lines.some((l) => l.on < opened) && !lines.some((l) => l.on === opened))
    said.push(`  ${name} has lines from before ${opened} and none on ${opened}, the day the ledger began. Write that day's line.`);
  return said;
}

/** The pairs of lines, from `opened` on, where the number went the way `worse` says it may not. */
const moves = (entry, opened, worse) =>
  entry.lines.flatMap((line, i) => (i > 0 && line.on >= opened && worse(valueOf(line), valueOf(entry.lines[i - 1])) ? [[entry.lines[i - 1], line]] : []));

const UP = (now, before) => now > before;
const DOWN = (now, before) => now < before;
const KINDS = { ceiling: UP, floor: DOWN, setting: null };

/**
 * THE FIVE RULES, over what was read. Pure, so `test/ledger.test.mjs` holds each one without a tree: `measured.held` maps
 * a held list to `{ size }`, `{ missing }` or `{ error }`, `measured.literals` maps a gate file to its numbers above 1,
 * and `measured.exported` lists the held lists the gates export, as `<gate>.<EXPORT>`.
 */
export function judge(book, budgets, measured, direction = '') {
  const findings = [];
  const said = [];
  let owing = 0;
  const parts = ['budgets', 'debts', 'held', 'deviations'];
  if (!DATE.test(book?.opened ?? '')) findings.push('  ledger.json has no `opened` date, the day the rise rules start reading.');
  for (const part of parts) if (!isObject(book?.[part])) findings.push(`  ledger.json has no \`${part}\`.`);
  if (findings.length > 0) return { findings, said, owing };
  const { opened } = book;
  if (opened !== OPENED) findings.push(`  ledger.json opens on ${opened}, and the ledger began on ${OPENED}. The day it began does not move.`);

  for (const part of ['budgets', 'debts', 'held']) for (const [name, entry] of Object.entries(book[part])) findings.push(...shapeOf(name, entry, opened));
  if (findings.length > 0) return { findings, said, owing };

  /* BUDGETS: every number in budgets.json is the newest line of its entry, and a ceiling does not rise unasked. */
  const numbers = new Map(numbersOf(budgets));
  const mirrors = new Map(Object.entries(book.debts).filter(([, d]) => filled(d.key)).map(([name, d]) => [d.key, name]));
  for (const [path, value] of numbers) {
    const entry = book.budgets[path] ?? book.debts[mirrors.get(path)];
    if (!entry) findings.push(`  ${path} is ${value} in budgets.json and has no line in ledger.json. Write its first line, with why and by.`);
    else if (valueOf(entry.lines.at(-1)) !== value) {
      const last = entry.lines.at(-1);
      findings.push(`  ${path} is ${value} in budgets.json, and its newest line says ${valueOf(last)} (${last.on}). The two say one number.`);
    }
  }
  for (const [name, entry] of Object.entries(book.budgets)) {
    if (!numbers.has(name)) findings.push(`  ${name} has lines in ledger.json and no number in budgets.json.`);
    if (!(entry.kind in KINDS)) findings.push(`  ${name}: kind is ${entry.kind}, and a budget is a ceiling, a floor or a setting.`);
    else if (KINDS[entry.kind])
      for (const [before, line] of moves(entry, opened, KINDS[entry.kind]))
        if (!quotesOwner(line.by, direction))
          findings.push(
            `  ${name}: the ${entry.kind} moved from ${valueOf(before)} to ${valueOf(line)} on ${line.on}, and \`by\` quotes no words of the owner's. Gate budgets are not raised (HD.549).`,
          );
  }

  /* DEBTS: the newest line never higher than the one before. A debt counts a budgets.json key or a gate file's numbers. */
  const counted = new Set();
  for (const [name, debt] of Object.entries(book.debts)) {
    const last = debt.lines.at(-1);
    if (!filled(debt.owes)) findings.push(`  ${name}: a debt says which area owes it, in \`owes\`.`);
    if (filled(debt.key) === filled(debt.file)) findings.push(`  ${name}: a debt names one budgets.json \`key\` or one gate \`file\`, not ${filled(debt.key) ? 'both' : 'neither'}.`);
    for (const [before, line] of moves(debt, opened, UP))
      findings.push(`  ${name}: the debt rose from ${valueOf(before)} to ${valueOf(line)} on ${line.on}. A debt only falls; gate budgets are not raised (HD.549).`);
    if (filled(debt.file)) {
      counted.add(debt.file);
      const count = measured.literals.get(debt.file);
      if (count === undefined) findings.push(`  ${name} counts the numbers in ${debt.file}, and there is no such gate file.`);
      else if (count > valueOf(last))
        findings.push(`  ${debt.file} writes ${count} numbers above 1, and its debt allows ${valueOf(last)}. Read the new one from budgets.json.`);
      else if (count < valueOf(last)) said.push(`  ledger: ${debt.file} writes ${count} numbers above 1 and owes ${valueOf(last)}. Lower its line to ${count}.`);
    }
    const budget = book.budgets[name];
    if (budget) {
      const ceiling = valueOf(budget.lines.at(-1));
      /* The reason for the number as it stands: the line that set it, not a later line that only restates it. */
      const set = debt.lines.findLast((l, i) => i === 0 || valueOf(debt.lines[i - 1]) !== valueOf(l));
      said.push(`  ledger: ${name}: a budget of ${ceiling}, ${valueOf(last) - ceiling} owed by ${debt.owes}. Newest reason, ${set.on}: ${set.why}`);
    }
    owing++;
  }
  for (const [file, count] of measured.literals)
    if (count > 0 && !counted.has(file))
      findings.push(`  ${file} writes ${count} number(s) above 1 and the ledger holds no debt for it. Read each one from budgets.json.`);

  /* HELD LISTS: read off the gate, never larger than the newest line, and a fall is written down. A gate that exports
     one the ledger has no line for is red, so taking a list's line out does not take the list off the ledger. */
  for (const name of measured.exported ?? [])
    if (!Object.hasOwn(book.held, name)) findings.push(`  ${name} is exported by its gate and has no line in ledger.json. Write its first line.`);
  for (const [name, entry] of Object.entries(book.held)) {
    const n = valueOf(entry.lines.at(-1));
    for (const [before, line] of moves(entry, opened, UP))
      if (!quotesOwner(line.by, direction))
        findings.push(`  ${name}: its line rose from ${valueOf(before)} to ${valueOf(line)} on ${line.on}, and \`by\` quotes no words of the owner's. A held list only shrinks.`);
    const read = measured.held.get(name) ?? { missing: true };
    if (read.missing) {
      said.push(`  ledger: ${name}: not exported yet, held at ${n} by its newest line`);
      owing++;
    } else if (read.error) findings.push(`  ${name} could not be read: ${read.error}`);
    else if (read.size === undefined) findings.push(`  ${name} is exported and is not a list or a count.`);
    else if (read.size > n) findings.push(`  ${name} holds ${read.size}, and its newest line says ${n}. A held list only shrinks.`);
    else if (read.size < n) findings.push(`  ${name} holds ${read.size}, and its newest line says ${n}. Write a line that records the fall.`);
  }

  /* DEVIATIONS: each one named, with what it is, why, and the unit that ends it. */
  for (const [group, list] of Object.entries(book.deviations)) {
    if (!Array.isArray(list)) {
      findings.push(`  deviations.${group} is not a list.`);
      continue;
    }
    const seen = new Set();
    for (const d of list) {
      const missing = ['id', 'what', 'why', 'until'].filter((k) => !filled(d?.[k]));
      if (missing.length > 0) findings.push(`  deviations.${group}: ${d?.id ?? 'a line'} gives no ${missing.join(', ')}.`);
      if (seen.has(d?.id)) findings.push(`  deviations.${group}: ${d.id} is written twice.`);
      seen.add(d?.id);
    }
  }
  return { findings, said, owing };
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default async function ledger(root = process.env.BRAINDOG_GATE_ROOT ?? REPO) {
  const ROOT = resolve(root);
  const json = (rel) => {
    try {
      return JSON.parse(readFileSync(join(ROOT, GATES, rel), 'utf8'));
    } catch (e) {
      return new Error(`tools/gates/${rel} could not be read: ${String(e?.message ?? e).split('\n')[0]}`);
    }
  };
  const book = json('ledger.json');
  const budgets = json('budgets.json');
  const broken = [book, budgets].filter((v) => v instanceof Error);
  if (broken.length > 0) {
    for (const e of broken) console.error(`  ${e.message}`);
    console.error(`\n  ledger: ${broken.length} finding(s). Every number a gate is held to has a line there.`);
    return 1;
  }
  const literals = new Map(gateFiles(ROOT).map((f) => [f, literalsIn(readFileSync(join(ROOT, f), 'utf8'))]));
  const held = await heldSizes(ROOT, isObject(book.held) ? Object.keys(book.held) : []);
  const exported = gateFiles(ROOT).flatMap((f) =>
    heldExportsIn(readFileSync(join(ROOT, f), 'utf8')).map((n) => `${f.slice('tools/gates/'.length, -'.mjs'.length)}.${n}`),
  );
  const words = join(ROOT, 'loop', 'DIRECTION.md');
  const direction = existsSync(words) ? readFileSync(words, 'utf8') : '';
  const { findings, said, owing } = judge(book, budgets, { held, literals, exported }, direction);

  const tally =
    `${Object.keys(book.budgets ?? {}).length} budget(s), ${owing} debt(s), ${Object.keys(book.held ?? {}).length} held list(s), ` +
    `${Object.values(book.deviations ?? {}).flat().length} deviation(s)`;
  if (findings.length === 0) {
    for (const line of said) console.log(line);
    console.log(`  ledger: ${tally}, 0 finding(s)`);
    return;
  }
  for (const f of [...new Set(findings)]) console.error(f);
  console.error(
    `\n  ledger: ${tally}, ${findings.length} finding(s).\n` +
      '  A budget never rises and a held list only shrinks: gate budgets are not raised (HD.549),\n' +
      '  and gates are not changed to make them pass (HD.550).',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = (await ledger(process.argv[2])) ?? 0;
