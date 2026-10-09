/**
 * `audit-append-only`: nothing rewrites the audit log but the statements on one list, each with its reason (REC-A17).
 *
 *   node tools/gates/audit-append-only.mjs [root]
 *
 * HIS WORDS ARE "append-only audit" (W.525), AND THE LOG IS A TABLE ANYBODY CAN `UPDATE`. On 9 October six statements
 * under `packages/*\/src` rewrote or reordered a line of `event`, and nothing failed on a seventh. The brief counted
 * four, the planner five: a count written down by hand is out of date by the next batch, which is why this list is a
 * list and its size is read off it, never written.
 *
 * WHAT A REWRITE IS: a string in the source (a quoted string or a template, read off the syntax tree, so a comment that
 * names one is not one) holding `UPDATE event`, `DELETE FROM event` or `REPLACE INTO event`, with `OR IGNORE` and the
 * like, quoted table names and any case. `event_kind` and `events` are other tables. A `.sql` file is read whole.
 * A table named at run time is not read: the import's replace (`DELETE FROM ${t.name}` in the kernel's `index.ts` and
 * `brainl.ts`) clears `event` among every table a file carries, and this gate cannot see that it does.
 *
 * WHAT IS READ: every file under `packages/<package>/src/`, tests too, and none under a `migrations/` folder: a
 * migration reshapes the log once, behind its own gate (`migration-lock`) and a rehearsal's receipt.
 *
 * THE LIST ONLY SHRINKS. A statement on it is matched by its file and the words it starts with, never a line number,
 * which moves with every edit above it. A statement found and not on the list is red; a statement on the list and no
 * longer found is red too, until it comes off, and `ledger.json` holds the list's size so it never grows unasked.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on. A tree with
 * no source to read is red, not a skip: there is nothing to build first, so reading nothing means the tree is wrong.
 */

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { filesOf, isRepository, textOf } from './public-clean.mjs';

/** This file, which names the list. */
const SELF = 'tools/gates/audit-append-only.mjs';

/** Where the product's statements live: a package's own source, outside its migrations. */
export const inScope = (rel) => /^packages\/[^/]+\/src\//u.test(rel) && !/(?:^|\/)migrations\//u.test(rel);

/** What is parsed for strings, and what is read whole. */
const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SQL = /\.sql$/u;

/** A statement that rewrites a line of the log. */
export const REWRITE = /\b(?:UPDATE(?:\s+OR\s+[A-Z]+)?|DELETE\s+FROM|REPLACE\s+INTO)\s+["'`[]?event["'`\]]?(?![\w$])/iu;

/**
 * THE STATEMENTS ALLOWED TO REWRITE THE LOG, 9 October 2026. ONLY EVER SHORTENED. `statement` is how the string
 * starts, spaces folded; `why` is the reason it may.
 */
export const ALLOWED = [
  {
    file: 'packages/kernel/src/erase.ts',
    statement: 'UPDATE event SET from_v = CASE WHEN from_v IS NULL',
    why: 'Erasing a person: every line that names them, or is about a row that was erased, keeps its place in the log and loses its words.',
  },
  {
    file: 'packages/kernel/src/flow.ts',
    statement: 'UPDATE event SET actor = ?, target = ? WHERE id = ?',
    why: "A rule's run line is metered as a call and then signed by the rule, inside the same write, before anything can read it.",
  },
  {
    file: 'packages/kernel/src/index.ts',
    statement: 'UPDATE event SET rowid = (SELECT MAX(rowid) + 1 FROM event), to_v = ? WHERE id = ?',
    why: "The grace fold: an edit of a row its maker made minutes ago, with no one else's line since, is folded into that row's `create` line, which moves to the end of the log.",
  },
  {
    file: 'packages/kernel/src/ingest.ts',
    statement: 'UPDATE event SET batch = ? WHERE rowid > ?',
    why: "An answer's writes, minted inside this transaction, are put in the decision's batch so one Undo takes back all of it. Nothing else holds those batches yet.",
  },
  {
    file: 'packages/kernel/src/script-run.ts',
    statement: "UPDATE event SET to_v = json_set(to_v, '$.log'",
    why: "A script's log and the lists it read are put on its own run line, written in the same transaction, so a reader refused those lists is handed the log redacted.",
  },
  {
    file: 'packages/kernel/src/script-run.ts',
    statement: "UPDATE event SET to_v = json_set(to_v, '$.stopped'",
    why: 'How many chains a script stopped, put on its own run line in the same transaction, so the stopped-chains sign reads a number and not the words.',
  },
];

/** The strings a source holds, each with the line it starts on. A template's `${…}` reads as `?`. */
export function stringsIn(source, rel = 'source.ts') {
  const kind = /\.[cm]?js$|\.jsx$/u.test(rel) ? ts.ScriptKind.JS : rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const at = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push({ line: at(node), text: node.text });
    else if (ts.isTemplateExpression(node)) out.push({ line: at(node), text: [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('?') });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** Folded spaces, so a statement on the list matches however its string is broken over lines. */
const fold = (text) => text.replace(/\s+/gu, ' ').trim();

/** Each statement in a file that rewrites the log, as `{ line, text }`, the text folded from where the statement starts. */
export function rewritesIn(source, rel) {
  if (SQL.test(rel))
    return source.split('\n').flatMap((l, i) => (REWRITE.test(l) ? [{ line: i + 1, text: fold(l.slice(l.search(REWRITE))) }] : []));
  return stringsIn(source, rel)
    .filter((s) => REWRITE.test(s.text))
    .map((s) => ({ line: s.line, text: fold(s.text.slice(s.text.search(REWRITE))) }));
}

/**
 * The findings for `hits` (each `{ file, line, text }`) against `allowed`: every statement no entry accounts for, and
 * every entry no statement is left for. An entry accounts for one statement, so a second copy of one is a seventh.
 */
export function verdict(hits, allowed) {
  const used = new Set();
  const findings = [];
  for (const h of hits) {
    const i = allowed.findIndex((a, n) => !used.has(n) && a.file === h.file && h.text.startsWith(fold(a.statement)));
    if (i === -1)
      findings.push(
        `  ${h.file}:${h.line}  rewrites the audit log ("${REWRITE.exec(h.text)[0]}"), ` +
          'and no reason on the list allows it. The log only grows: write a new line instead.',
      );
    else used.add(i);
  }
  allowed.forEach((a, n) => {
    if (!used.has(n)) findings.push(`  ${SELF}  allows "${a.statement}" in ${a.file}, and it is gone. Take it off the list, and write the fall in ledger.json.`);
  });
  return findings;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function auditAppendOnly(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const files = (filesOf(ROOT) ?? []).filter((rel) => inScope(rel) && (SCRIPT.test(rel) || SQL.test(rel)));
  /* A GATE THAT READ NOTHING HAS NOT PASSED, and with nothing to build first it is red. */
  if (files.length === 0) {
    console.error(`  audit-append-only: no source under packages/*/src to read in ${ROOT}, so nothing was checked.`);
    return 1;
  }
  const hits = [];
  for (const rel of files) {
    const text = textOf(ROOT, rel);
    if (text === null || !/event/iu.test(text)) continue;
    for (const { line, text: statement } of rewritesIn(text, rel)) hits.push({ file: rel, line, text: statement });
  }
  /* THE LIST IS THIS REPOSITORY'S, so a planted tree is judged with none: its paths are not these. */
  const findings = verdict(hits, isRepository(ROOT) ? ALLOWED : []);

  const where = `${files.length} source file(s), ${hits.length} statement(s) that rewrite the log`;
  if (findings.length === 0) {
    console.log(`  audit-append-only: ${where}, each on the list with its reason, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  audit-append-only: ${where}, ${findings.length} finding(s).\n` +
      '  The log is append-only (W.525). A statement that rewrites a line of it goes on the list in this file with\n' +
      '  its reason, and the list only shrinks: ledger.json holds its size.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = auditAppendOnly(process.argv[2]) ?? 0;
