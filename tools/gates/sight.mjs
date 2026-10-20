/**
 * Every read the record makes of the kernel's rows sits behind a sight check (sharing plan §2.5 item 7).
 *
 *   node tools/gates/sight.mjs
 *
 * IT FINDS EVERY `kernel.(list|get|inScope|backlinks|history|searchMatched|metric|block|eventsBefore)(` in
 * `packages/record/src`, and asks of the function it sits in whether that function also calls `kernel.scope`, `sight.`
 * or `rowAdmitted`. A call site that does is gated. One that does not is owner-only when the same function asks one of
 * the owner's gates (`admin`, `vault`, `team`, `ownerOnly`), allowed when `ALLOWED` below names it with a reason
 * (system, outbound and owner-only paths), and open otherwise.
 *
 * THE FUNCTION IS THE NEAREST NAMED ONE. An arrow handed to `map` is not a function anybody reads as one, so a call
 * inside it belongs to the method it was written in; `createRecordApi` itself is a function too, and a call written
 * straight in its body is judged by that body alone, never by every method inside it.
 *
 * REPORT MODE UNTIL SLICE 3 (`ENFORCING` below): it prints every call site with its verdict and passes, so the open
 * ones are a list to work from rather than a red build. Slice 3 closes G2 to G6, completes `ALLOWED`, and turns it on.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/** Whether an open call site fails the gate. Off in Slice 2, on from Slice 3. */
export const ENFORCING = false;

/** What `run.mjs` reads as a gate that could not run, never as a pass. */
const COULD_NOT_RUN = 3;

/** The kernel reads of rows that must sit behind a sight check. */
export const READS = ['list', 'get', 'inScope', 'backlinks', 'history', 'searchMatched', 'metric', 'block', 'eventsBefore'];

/** What a function calls to be gated: the scope a reader hands the kernel, the sight module, or the per-row check. */
const GATED = /\bkernel\.scope\(|\bsight\.\w+\(|\browAdmitted\(/u;

/** What a function calls to be the owner's alone, so no grantee reaches the read at all. */
const OWNER_ONLY = /\b(?:admin|vault|team|ownerOnly)\(\s*ctx\b/u;

/**
 * The call sites read for the system or for a read that leaves the record, each with its reason, by file and function.
 * Slice 3 completes this list; an entry here is a claim a reviewer reads.
 */
const ALLOWED = [
  { file: 'packages/record/src/index.ts', fn: 'versionFor', why: 'The top of the log, to see whether a cached answer is still the top; every line it keeps goes through lineOf.' },
  { file: 'packages/record/src/index.ts', fn: 'walk', why: 'The log walk every reader shares; each line it keeps goes through lineOf, which admits it for the caller.' },
];

const READ_CALL = new RegExp(`^(?:${READS.join('|')})$`, 'u');

/** Every TypeScript file under a directory. */
function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (name.endsWith('.ts')) yield full;
  }
}

/** The name a function is known by: its own, the variable or property it is assigned to, or `null` for an anonymous one. */
function nameOf(node) {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node)) && node.name) return node.name.getText();
  const parent = node.parent;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.name) return parent.name.getText();
  return null;
}

const isFunction = (node) =>
  ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** The nearest named function a node sits in, or `null` at module level. */
function home(node) {
  for (let at = node.parent; at; at = at.parent) if (isFunction(at) && nameOf(at) !== null) return at;
  return null;
}

/**
 * A function's own text, with the bodies of the named functions inside it left out, so a factory is judged by its own
 * statements and never by every method it holds.
 */
function ownText(fn, source) {
  const text = fn.getText(source);
  const start = fn.getStart(source);
  const cuts = [];
  const visit = (node) => {
    if (node !== fn && isFunction(node) && nameOf(node) !== null) {
      cuts.push([node.getStart(source) - start, node.getEnd() - start]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  let out = '';
  let from = 0;
  for (const [a, b] of cuts.sort((x, y) => x[0] - y[0])) {
    if (a < from) continue;
    out += text.slice(from, a);
    from = b;
  }
  return out + text.slice(from);
}

/** Every call site, with the function it sits in and its verdict. */
export function sites(root) {
  const dir = join(root, 'packages', 'record', 'src');
  const out = [];
  for (const file of sources(dir)) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8');
    if (!/kernel\./u.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const own = new Map();
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && READ_CALL.test(node.expression.name.text)) {
        const object = node.expression.expression;
        const onKernel = (ts.isIdentifier(object) && object.text === 'kernel') || (ts.isPropertyAccessExpression(object) && object.name.text === 'kernel');
        if (onKernel) {
          const fn = home(node);
          const name = fn ? nameOf(fn) : '(module)';
          if (fn && !own.has(fn)) own.set(fn, ownText(fn, source));
          const body = fn ? own.get(fn) : text;
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          const allowed = ALLOWED.find((a) => a.file === rel && a.fn === name);
          const verdict = GATED.test(body) ? 'gated' : OWNER_ONLY.test(body) ? 'owner-only' : allowed ? 'allowed' : 'open';
          out.push({ file: rel, line, fn: name, call: `kernel.${node.expression.name.text}`, verdict, ...(allowed ? { why: allowed.why } : {}) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3), and nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, then to the repository this file sits in. It returns 3 over a root
 * with nothing to read, 1 only when enforcing and a site is open, and a pass falls off the end.
 */
export default function sight(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  /* A GATE THAT READ NOTHING HAS NOT PASSED: a root with no record package is a skip, exit 3, naming the root. */
  if (!existsSync(join(ROOT, 'packages', 'record', 'src'))) {
    console.log(`  sight: no packages/record/src under ${ROOT}, so nothing was checked`);
    return COULD_NOT_RUN;
  }
  const found = sites(ROOT);
  if (found.length === 0) {
    console.log(`  sight: no kernel read of rows under packages/record/src in ${ROOT}, so nothing was checked`);
    return COULD_NOT_RUN;
  }
  /* THE COLUMNS ARE AS WIDE AS THEIR WIDEST CELL, so the report reads down. */
  const widest = (cell) => Math.max(...found.map((s) => cell(s).length));
  const at = (s) => `${s.file}:${s.line}`;
  const [w1, w2, w3] = [widest(at), widest((s) => s.verdict), widest((s) => s.call)];
  for (const s of found) console.log(`  ${at(s).padEnd(w1)}  ${s.verdict.padEnd(w2)}  ${s.call.padEnd(w3)}  in ${s.fn}${s.why ? `  (${s.why})` : ''}`);
  const by = (v) => found.filter((s) => s.verdict === v).length;
  const open = by('open');
  console.log(
    `  sight: ${found.length} kernel read(s) of rows: ${by('gated')} gated, ${by('owner-only')} owner-only, ${by('allowed')} allowed, ${open} open` +
      (ENFORCING ? '' : ' (report mode until Slice 3: open sites are listed, not failed)'),
  );
  if (ENFORCING && open > 0) return 1;
}

/* AND IT IS STILL A SCRIPT, as every called gate is. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = sight(process.argv[2]) ?? 0;
