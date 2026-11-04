/**
 * Every read the record makes of the kernel's rows sits behind a sight check.
 *
 *   node tools/gates/sight.mjs
 *
 * IT FINDS EVERY `kernel.(list|get|inScope|backlinks|history|searchMatched|metric|block|eventsBefore)(` in
 * `packages/record/src`, and asks of the function it sits in whether that function also calls `kernel.scope`, `sight.`
 * or a helper that asks sight itself (`GATED`). A call site that does is gated. One that does not is owner-only when the same function asks one of
 * the owner's gates (`admin`, `keychain`, `team`, `ownerOnly`), allowed when `ALLOWED` below names it with a reason
 * (system, outbound and owner-only paths), and open otherwise.
 *
 * THE FUNCTION IS THE NEAREST NAMED ONE. An arrow handed to `map` is not a function anybody reads as one, so a call
 * inside it belongs to the method it was written in; `createRecordApi` itself is a function too, and a call written
 * straight in its body is judged by that body alone, never by every method inside it.
 *
 * ENFORCING FROM SLICE 3 (`ENFORCING` below): an open call site, or an `ALLOWED` entry that no longer excuses one, turns
 * it red. It prints the open sites and the stale entries, and every site with its verdict under `--all`. Slice 2 ran it
 * in report mode; Slice 3 closed G2 to G6, completed `ALLOWED` and turned it on.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/** Whether an open call site fails the gate. Off in Slice 2, on from Slice 3. */
export const ENFORCING = true;

/** What `run.mjs` reads as a gate that could not run, never as a pass. */
const COULD_NOT_RUN = 3;

/** The kernel reads of rows that must sit behind a sight check. */
export const READS = ['list', 'get', 'inScope', 'backlinks', 'history', 'searchMatched', 'metric', 'block', 'eventsBefore'];

/**
 * What a function calls to be gated: the scope a reader hands the kernel, the sight module (`sight.ts`, read and write
 * halves alike: a write path that asks `sight.mayWrite` of the row it read is held to it), or one of the three record helpers that ask the sight module themselves for what they hand on: `sightOf` (a comment's target),
 * `lineOf` (a log line) and `heldBlock` (a drawn block). `rowAdmitted` was the per-row check Slice 3 replaced.
 */
const GATED = /\bkernel\.scope\(|\bsight\.\w+\(|\b(?:sightOf|lineOf|heldBlock)\(/u;

/** What a function calls to be the owner's alone, so no grantee reaches the read at all. */
const OWNER_ONLY = /\b(?:admin|keychain|team|ownerOnly)\(\s*ctx\b/u;

/**
 * The call sites read for the system, for a read that leaves the record, for the owner or the decider alone, for a
 * write (Slice 4's), or that answer no row to anybody, each with its reason, by file and function (`fn: '*'` is every
 * function of the file). An entry here is a claim a reviewer reads: when the code under it changes so that the reason
 * stops being true, the entry goes and the site is gated. An entry that no longer names an ungated site is stale, and
 * the gate says so, so the list never outlives what it excuses.
 */
const R = 'packages/record/src';
const SYSTEM = 'The record itself, with no caller: ';
const OWNER = 'The owner alone: ';
const NONE = 'Answers no row: ';
const WRITE = "A write path Slice 4 did not hold to the row (`sight.writable`, `sight.mayWrite`): ";
export const ALLOWED = [
  /* THE SIGHT MODULE ITSELF. */
  { file: `${R}/sight.ts`, fn: '*', why: "The sight module: each read here is handed the caller's `wheres` and viewer, or reads the rows it then admits in one batch." },

  /* SYSTEM: the nightly ticks, Slash's own looks (read as NOBODY), installs and bookkeeping. */
  { file: `${R}/index.ts`, fn: 'markOwnRow', why: `${SYSTEM}the nightly step that marks the owner's own row in People, for a host holding the kernel.` },
  { file: `${R}/index.ts`, fn: 'vouchedHolder', why: `${SYSTEM}whether the one person holding the owner's address was met in his own work, for markOwnRow.` },
  { file: `${R}/index.ts`, fn: 'reseed', why: `${SYSTEM}an add-on update writing again a row its install planted (installs are ADMIN).` },
  { file: `${R}/index.ts`, fn: 'slashFile', why: `${SYSTEM}Slash's look reads a figure as NOBODY (\`viewer: NOBODY\`), so no private row is in it.` },
  { file: `${R}/index.ts`, fn: 'lookRehearsed', why: `${SYSTEM}a look is rehearsed over the page read as NOBODY before it is written.` },
  { file: `${R}/index.ts`, fn: 'dueOf', why: `${SYSTEM}what a page's headline is worked out from, its page and how far its figures moved, both read as NOBODY (\`viewer: NOBODY\`).` },
  { file: `${R}/index.ts`, fn: 'rowWords', why: `${SYSTEM}the night's page lint reads the words of the row a page is made for, to leave them out of what it flags; nothing read is answered.` },
  { file: `${R}/index.ts`, fn: 'drawn', why: `${SYSTEM}what is pressing, drawn as NOBODY for the record's own digest and pushes.` },
  { file: `${R}/index.ts`, fn: 'understoodLines', why: `${SYSTEM}the nightly understand walk saying what it wrote, for the owner's Decide card.` },
  { file: `${R}/index.ts`, fn: 'heldDraft', why: `${SYSTEM}the understand walk's draft question about an organisation, accepted by the owner.` },
  { file: `${R}/index.ts`, fn: 'understoodDraft', why: `${SYSTEM}the understand walk's draft question about a project, accepted by the owner.` },
  { file: `${R}/index.ts`, fn: 'understoodAnswer', why: `${SYSTEM}the answer to the understand walk's own question, applied as \`rule:backfill\`.` },
  { file: `${R}/index.ts`, fn: 'questionsOpen', why: `${SYSTEM}the page lint's count of open questions, a number for the lint round and never a row.` },
  { file: `${R}/index.ts`, fn: 'deviceStart', why: `${SYSTEM}a device with no credential yet; the project a device grant names is resolved to its id and answered to nobody.` },
  { file: `${R}/arrange.ts`, fn: '*', why: `${OWNER}arranging by proposal, worked out when a pack, settings or arrange question is filed and applied on the owner's accept (ADMIN).` },
  { file: `${R}/emergent.ts`, fn: '*', why: "The holding pen, offered only to a caller who reads every list (`readsEveryList` in `boot`): whether a list's fields are filled, to propose a page." },
  { file: `${R}/emergent-grows.ts`, fn: '*', why: "The holding pen's grouping offer, to a caller who reads every list (`readsEveryList`): how filled a field is, to propose a grouping." },
  { file: `${R}/ladder.ts`, fn: '*', why: `${NONE}the trust ladder compares the row ids a write and a run name, and answers a rung.` },
  { file: `${R}/methods/instructions.ts`, fn: 'tellDone', why: `${SYSTEM}the run that answered an instruction, read for its kind, key and machine to pick his settings row for the push; nothing read is answered.` },
  { file: `${R}/methods/tools-seen.ts`, fn: '*', why: `${SYSTEM}the tools a run reported using, matched against the tools list as bookkeeping; nothing read is answered.` },
  { file: `${R}/methods/capture.ts`, fn: 'replayed', why: 'A capture replayed: the rows this same op wrote before, found by its op id, answered to the caller who wrote them.' },

  /* THE OWNER'S AND THE DECIDER'S: the keychain, and questions drawn for whoever `holds` lets answer them. */
  { file: `${R}/index.ts`, fn: 'keyFor', why: `${OWNER}the keychain's door, a key reached by a grant's project scope, asked only behind \`keychain\` (depositGrant, the opener).` },
  { file: `${R}/index.ts`, fn: 'selfMarkedAgain', why: `${OWNER}"Mark X as you?" accepted again after an Undo, on the owner's Decide press.` },
  { file: `${R}/index.ts`, fn: 'candidate', why: "A merge question's people, drawn for whoever `holds` lets see the question (the decide path)." },
  { file: `${R}/index.ts`, fn: 'mergeAnswer', why: 'A merge question answered by whoever may decide it: the rows its own body names (the decide path).' },
  { file: `${R}/index.ts`, fn: 'foldPicked', why: "A merge answered with a pick, in the decider's press: the rows its body names (the decide path)." },

  /* READS THAT ANSWER NO ROW, OR ONLY ONE THE CALLER WAS ALREADY SHOWN. */
  { file: `${R}/index.ts`, fn: 'hueOf', why: `${NONE}the accent hue (a number) of the row a page the caller opens is about.` },
  { file: `${R}/index.ts`, fn: 'placeOf', why: `${NONE}the project a question's run or rows are placed in, as a handle, to sort the questions \`holds\` shows her.` },
  { file: `${R}/methods/count-by.ts`, fn: 'walk', why: "Handed the caller's `kernel.scope` by `countBy`, which asks it, and reads every page under it." },
  { file: `${R}/index.ts`, fn: 'listOf', why: `${NONE}the list a spoken id names, for the MCP door's firewall to strip the fields hidden there off a row it already answered, and for a plugin's move (\`installPack\`, ADMIN) to refuse a write outside the lists it names.` },
  { file: `${R}/index.ts`, fn: 'whereHeld', why: `${NONE}a block's \`where\` resolved with \`reads\` to decide whether it is refused; the block is drawn by \`heldBlock\`.` },
  { file: `${R}/methods/exceptions.ts`, fn: 'rowOf', why: 'Names a row only on an exception over a list the caller reads whole (`whole`: no `kernel.scope` rule and no private row).' },
  { file: `${R}/methods/held-twice.ts`, fn: 'askFoldTwice', why: 'Folds only when every row is one the caller sees (`unseen`, asked under `kernel.scope` in `seenBy`); otherwise FORBIDDEN.' },
  { file: `${R}/methods/named-twice.ts`, fn: 'askNamedSame', why: 'Reads again, at its version, a row of a pair `seenBy` offered this caller under her grant.' },
  { file: `${R}/methods/pages-census.ts`, fn: 'checkPaths', why: `${NONE}which \`{{path}}\`s a block leaves unnamed, as path names.` },
  { file: `${R}/methods/stale.ts`, fn: 'runOf', why: `${NONE}the id of the project a run names, to place a stale line the caller is already shown.` },
  { file: `${R}/methods/stale.ts`, fn: 'declinedIn', why: `${NONE}the rows a declined question named, by id, to leave them out of what is stale.` },
  { file: `${R}/methods/undo.ts`, fn: '*', why: "Undo of a batch: the rows its own lines wrote, held to the lists the caller reads (`reads`); putting them back is Slice 4's `undoOwn` check." },
  { file: `${R}/preview-change.ts`, fn: 'drawn', why: "The row a template page is previewed for, picked from the caller's own `list` read above (`mine`)." },
  { file: `${R}/preview-change.ts`, fn: 'walkCost', why: `${NONE}how many rows and currencies a walk would read, to refuse one too costly to preview.` },
  { file: `${R}/row-values.ts`, fn: 'docValues', why: 'Fills the `{{path}}`s of a document on a row `get` already admitted, each block held by `hold` (`heldBlock`).' },


  /* WRITE PATHS NOT YET HELD TO THE ROW. `update`, `log`, `handoff`, `makePrivate` and `meet` ask `sight.mayWrite` and are gated. */
  { file: `${R}/index.ts`, fn: 'mentioned', why: `${WRITE}the caller's own run and its project, to keep a mention where the agent was.` },
  { file: `${R}/methods/same-one.ts`, fn: 'sameOne', why: 'The people a "same person?" question names, each asked of `admitted` (its own `kernel.scope` read) before it is filed.' },
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
          const allowed = ALLOWED.find((a) => a.file === rel && (a.fn === name || a.fn === '*'));
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
  /* EVERY SITE WITH `--all` (or `SIGHT_ALL=1`); otherwise only the open ones, each a finding. */
  const all = process.argv.includes('--all') || process.env.SIGHT_ALL === '1';
  for (const s of found)
    if (all || s.verdict === 'open')
      console.log(`  ${at(s).padEnd(w1)}  ${s.verdict.padEnd(w2)}  ${s.call.padEnd(w3)}  in ${s.fn}${s.verdict === 'open' ? ': a read of rows with no sight check and no reason in ALLOWED' : s.why ? `  (${s.why})` : ''}`);
  /* AN ENTRY THAT EXCUSES NOTHING IS STALE: its function is gated now, or gone. Asked only of files this root holds, so a
     planted tree is judged by what it plants. */
  const stale = ALLOWED.filter(
    (a) => existsSync(join(ROOT, a.file)) && !found.some((s) => s.file === a.file && (a.fn === '*' || s.fn === a.fn) && s.verdict === 'allowed'),
  );
  for (const a of stale) console.log(`  ${a.file}  stale  in ${a.fn}: ALLOWED excuses a function with no ungated read of rows left, so the entry goes`);
  const by = (v) => found.filter((s) => s.verdict === v).length;
  const open = by('open');
  console.log(
    `  sight: ${found.length} kernel read(s) of rows: ${by('gated')} gated, ${by('owner-only')} owner-only, ${by('allowed')} allowed, ${open} open` +
      (stale.length > 0 ? `, ${stale.length} stale ALLOWED entr${stale.length === 1 ? 'y' : 'ies'}` : '') +
      (ENFORCING ? '' : ' (report mode: open sites are listed, not failed)'),
  );
  if (ENFORCING && (open > 0 || stale.length > 0)) return 1;
}

/* AND IT IS STILL A SCRIPT, as every called gate is. `?? 0` because a pass returns nothing. */
if (import.meta.main) {
  const [, , ...args] = process.argv;
  process.exitCode = sight(args.find((a) => !a.startsWith('--'))) ?? 0;
}
