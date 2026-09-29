/**
 * `telemetry-allowlist`: one place writes an Analytics Engine point, and the point holds only `08 §5`'s columns.
 *
 *   node tools/gates/telemetry-allowlist.mjs [root]
 *
 * TELEMETRY IS THE ONE SINK THAT LEAVES THE RECORD AND IS KEPT FOR MONTHS. A log line is read and scrolls away; a point
 * in Analytics Engine is queried for three months by whoever can open the dashboard, and it sits outside every promise
 * the record makes about what it holds. `08 §5` says what a point may carry, a short list of columns, and says "never
 * written: field values, note text, register names a customer invented, credential labels, email subjects, amounts".
 * A rule like that is kept by review until the day one extra blob is added for a good reason, so this gate keeps it
 * instead (`52 §5.2`). Three checks:
 *
 * 1. `writeDataPoint(` occurs exactly once under `apps/`, which is `51 §5.18`'s one point per request from one place.
 *    A second call is a second shape nobody compared with the table, and none at all is telemetry that was removed
 *    rather than turned off (the binding being unbound is the off switch, `apps/worker/wrangler.jsonc`).
 * 2. The call hands over an object with `blobs` and `doubles` and nothing else, each an identifier declared with the
 *    file's own `Blobs` or `Doubles` tuple type, and every position of those two tuples is labelled with a word of a
 *    distinct column of `08 §5`'s table: `kind` for "event kind", `ms` for "duration ms". TypeScript then holds the
 *    call to the tuple and this holds the tuple to the table, so neither can drift without the other going red. The
 *    `indexes` key is not on the list because the table has no such column.
 * 3. No token of the call's argument, or of the initialiser of a tuple it hands over, matches `08 §5`'s never-written
 *    words: `fields`, `note`, `label`, `subject`, `amount`, `register`, `email`, `body`. It reads names, so it cannot
 *    see a value under an innocent one; check 2 is what bounds how many positions there are to hide one in.
 *
 * THE TABLE IS READ FROM THIS REPOSITORY'S `docs/08-METRICS-AND-ANALYTICS.md` EVEN WHEN THE ROOT IS ANOTHER TREE, as
 * `web-lists` reads its seed: the root is what is checked and the document is what it is checked against, and
 * `self-test` aims the gate at a seeded tree with no documents of its own. A table this cannot read is a finding and
 * never a skip, because a heading that moved would otherwise switch the column check off without a word.
 *
 * Tests, anything under `test/` and declaration files are not read: a dataset stub in a test, or the binding's type in
 * a `.d.ts`, declares the method, and declaring it is not writing a point. A line that is a comment is not read either, so a sentence may name the method.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/** The repository this file sits in, which holds the document the columns are read from. */
const HOME = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** Where `08 §5`'s table is, and the heading it sits under. */
const DOCUMENT = join(HOME, 'docs', '08-METRICS-AND-ANALYTICS.md');
const SECTION = /^## 5 · Telemetry/mu;

/** `08 §5`'s never-written list as tokens, `52 §5.2`'s third check. */
const NEVER = /fields|note|label|subject|amount|register|email|body/iu;

/** The sources read: code a Worker or an app could ship. */
const SOURCE = /\.(?:ts|mts|js|mjs|svelte)$/u;
const TEST = /\.test\.[cm]?[jt]s$/u;

/** The keys a point may carry, and the tuple type each must be declared with. */
const KEYS = new Map([
  ['blobs', 'Blobs'],
  ['doubles', 'Doubles'],
]);

/** Every source file under `dir`, its tests and built output left out. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!skipDir(name) && name !== 'test' && name !== 'tests') walk(path, out);
    } else if (SOURCE.test(name) && !TEST.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/**
 * The index just past the bracket that closes the one opened at `open`, skipping string literals, or -1.
 *
 * STRINGS ARE SKIPPED so a `)` inside `'...'` does not end the call. A template's `${...}` is read as text, which is
 * enough here: nothing a point is built from needs a bracket inside a template to be read correctly.
 */
function closeOf(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** `text` split at its commas that are not inside a bracket. */
function topLevel(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** The line number of an offset. */
const lineAt = (text, at) => text.slice(0, at).split('\n').length;

/** Whether the line holding an offset is a comment line. */
function inComment(text, at) {
  const start = text.lastIndexOf('\n', at) + 1;
  const head = text.slice(start, at).trimStart();
  return head.startsWith('*') || head.startsWith('//') || head.startsWith('/*');
}

/**
 * `08 §5`'s table as two lists of columns, each column the words of its cell before any `(` or `,`: "event kind
 * (`page.render`, ...)" is `event` and `kind`, "**record id, hashed with a rotating salt**" is `record` and `id`.
 * `null` when the section or its table is not there.
 */
function columns() {
  if (!existsSync(DOCUMENT)) return null;
  const text = readFileSync(DOCUMENT, 'utf8');
  const at = text.search(SECTION);
  if (at < 0) return null;
  const rows = [];
  let inTable = false;
  for (const line of text.slice(at).split('\n').slice(1)) {
    if (/^## /u.test(line)) break;
    if (!line.startsWith('|')) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    rows.push(line.split('|').slice(1, -1).map((cell) => cell.trim()));
  }
  if (rows.length < 3 || !/^blob$/iu.test(rows[0][0] ?? '') || !/^double$/iu.test(rows[0][1] ?? '')) return null;
  const words = (cell) =>
    cell
      .replace(/\*\*/gu, '')
      .split(/[(,]/u)[0]
      .toLowerCase()
      .split(/[^a-z]+/u)
      .filter((w) => w !== '');
  const body = rows.slice(2);
  const of = (i) => body.map((row) => row[i] ?? '').filter((cell) => cell !== '').map((cell) => ({ cell, words: words(cell) }));
  return { Blobs: of(0), Doubles: of(1) };
}

/**
 * The labels of a tuple type declared in `text` as `type <name> = [label: type, ...]`, or `null` when it is not
 * declared. An unlabelled position comes back as `''`, which matches no column.
 */
function tupleOf(text, name) {
  const m = new RegExp(`\\btype\\s+${name}\\s*=\\s*\\[`, 'u').exec(text);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const end = closeOf(text, open);
  if (end < 0) return null;
  return topLevel(text.slice(open + 1, end - 1)).map((position) => /^(\w+)\??\s*:/u.exec(position)?.[1] ?? '');
}

/** The initialiser of `const <id>: <type> = ...;` in `text`, or `null` when there is no such declaration. */
function initialiserOf(text, id, type) {
  const m = new RegExp(`\\b(?:const|let)\\s+${id}\\s*:\\s*${type}\\s*=`, 'u').exec(text);
  if (!m) return null;
  let at = m.index + m[0].length;
  while (/\s/u.test(text[at] ?? '')) at++;
  if (text[at] === '[' || text[at] === '{' || text[at] === '(') {
    const end = closeOf(text, at);
    return end < 0 ? null : text.slice(at, end);
  }
  const stop = text.slice(at).search(/[;\n]/u);
  return text.slice(at, stop < 0 ? undefined : at + stop);
}

export default function telemetryAllowlist(root = process.env.BRAINDOG_GATE_ROOT ?? process.cwd()) {
  const apps = join(root, 'apps');
  const files = walk(apps);
  if (files.length === 0) {
    console.error(`  telemetry-allowlist: no source was read under ${apps}, so nothing was checked.`);
    return 3;
  }

  const findings = [];
  const table = columns();
  if (table === null)
    findings.push(
      `${relative(HOME, DOCUMENT).split(sep).join('/')} has no "## 5 · Telemetry" table with Blob and Double columns ` +
        'to read, so no point can be checked against it.',
    );

  /* ── every call, with its file ── */
  const calls = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bwriteDataPoint\s*\(/gu)) {
      if (inComment(text, m.index)) continue;
      calls.push({ rel: relative(root, file).split(sep).join('/'), text, at: m.index, open: m.index + m[0].length - 1 });
    }
  }

  /* ── 1. exactly one ── */
  if (calls.length === 0)
    findings.push('apps/ holds no call to writeDataPoint(, and 51 §5.18 writes one point per request from one place.');
  if (calls.length > 1)
    for (const { rel, text, at } of calls)
      findings.push(
        `${rel}:${lineAt(text, at)} is one of ${calls.length} calls to writeDataPoint( under apps/, and 51 §5.18 ` +
          'writes one point per request from one place.',
      );

  for (const { rel, text, at, open } of calls) {
    const where = `${rel}:${lineAt(text, at)}`;
    const end = closeOf(text, open);
    const argument = end < 0 ? '' : text.slice(open + 1, end - 1).trim();
    const read = [argument];

    /* ── 2. `{ blobs, doubles }`, each one of the file's own tuples, each tuple one of the table's columns ── */
    if (!argument.startsWith('{') || !argument.endsWith('}')) {
      findings.push(`${where} hands writeDataPoint( something other than an object of blobs and doubles.`);
    } else {
      for (const entry of topLevel(argument.slice(1, -1))) {
        const [key, value = key] = entry.split(':').map((s) => s.trim());
        const type = KEYS.get(key);
        if (type === undefined) {
          findings.push(`${where} writes "${key}", and 08 §5's table has no such column; a point is blobs and doubles.`);
          continue;
        }
        const init = /^\w+$/u.test(value) ? initialiserOf(text, value, type) : null;
        if (init === null) {
          findings.push(`${where} writes ${key} that is not a const declared as the file's ${type} tuple.`);
          read.push(value);
          continue;
        }
        read.push(init);
        const labels = tupleOf(text, type);
        if (labels === null) {
          findings.push(`${where}'s file declares no ${type} tuple type for its ${key}.`);
          continue;
        }
        if (table === null) continue;
        const cols = table[type];
        const most = type === 'Blobs' ? 6 : 4;
        if (labels.length > Math.min(most, cols.length))
          findings.push(`${where}'s ${type} has ${labels.length} positions, and 08 §5's table has ${cols.length} ${key} columns.`);
        const used = new Set();
        for (const label of labels) {
          const col = cols.findIndex((c, i) => !used.has(i) && c.words.includes(label.toLowerCase()));
          if (col < 0) {
            findings.push(
              `${where}'s ${type} has a position ${label === '' ? 'with no label' : `"${label}"`}, which names no ` +
                `unused ${key} column of 08 §5's table (${cols.map((c) => c.cell).join('; ')}).`,
            );
            continue;
          }
          used.add(col);
        }
      }
    }

    /* ── 3. none of the never-written words ── */
    const carried = [...new Set(read.flatMap((t) => [...t.matchAll(/[A-Za-z_$][\w$]*/gu)].map((m) => m[0])))].filter((token) =>
      NEVER.test(token),
    );
    if (carried.length > 0)
      findings.push(
        `${where} writes a point that carries ${carried.join(', ')}, and 08 §5 never writes a field value, a note, a ` +
          'label, a subject, an amount, a register name, an email or a body.',
      );
  }

  if (findings.length === 0) {
    console.log(`  telemetry-allowlist: one writeDataPoint( under apps/, its blobs and doubles on 08 §5's list; ${files.length} file(s) read`);
    return;
  }
  for (const finding of findings) console.error(`    ${finding}`);
  console.error(
    `\n  telemetry-allowlist: ${findings.length} finding(s)\n` +
      '  A point is kept for three months outside the record. Write it from apps/worker/src/telemetry.ts alone, with\n' +
      "  its Blobs and Doubles labelled by 08 §5's columns, and add a column to that table before adding a position.\n",
  );
  return 1;
}

/* A SCRIPT AS WELL, because `self-test` spawns it at its seeded tree with `BRAINDOG_GATE_ROOT`. `?? 0` because a pass
   returns nothing. */
if (import.meta.main) process.exitCode = telemetryAllowlist(process.argv[2]) ?? 0;
