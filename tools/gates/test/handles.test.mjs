/**
 * NO GATE LEAVES A RECORD, A PORT OR A BROWSER BEHIND IT, ASKED OF EVERY GATE AT ONCE.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHY THIS FILE EXISTS, AND IT IS THE SECOND TIME THE TREE HAS PAID FOR THE SAME GREP. Six gates in
 * this directory open three long-lived handles: the seeded record (`startRecord`), an HTTP server on
 * a fixed port out of `budgets.json` (`createServer`), and a Chromium (`chromium.launch`). `run.mjs`
 * CALLS those gates in-process, so a handle a gate does not give back is not swept up by the process
 * ending: the port stays bound and the next gate wanting it gets `EADDRINUSE`, and a browser left
 * running keeps the runner from ever reaching the end of its event loop. On 21 September `3e9d5ea0`
 * repaired five of them, `layout`, `keys`, `prefs`, `passkey` and `queue`, each of which closed all
 * three on the straight-line path with no `try` above the closes. The sixth, `a11y.mjs`, had the
 * identical defect and was in nobody's list, because the list of five came out of a grep.
 *
 * SO THE QUESTION HERE IS NOT "IS `a11y` REPAIRED" BUT "HOW WOULD ANYBODY KNOW THERE IS NOT A
 * SEVENTH". A grep is a question somebody has to remember to ask, and this repository has now been
 * wrong twice about its answer. A test is the same question asked by the machine on every run, over
 * a gate list it derives rather than one anybody types, so a gate written tomorrow that opens one of
 * these three handles arrives here red on its first run and not after the port it holds has cost
 * somebody an afternoon. Measured before `a11y.mjs` was repaired, by putting that file back and
 * running the sweep, it failed naming exactly six things and no other gate: its three closes, at
 * lines 624, 625 and 626, and all three of its opens, at lines 316, 318 and 353. Three opens and not
 * two, because with no `finally` anywhere in the file there is no guard for any of them to sit in.
 *
 * THIS READS SOURCE AND RUNS NOTHING, which is the only reason the question is cheap enough to ask of
 * all 27 gates. Actually driving them would mean five builds, six Chromiums and about twenty minutes,
 * and the six ports they want are the ports a real run is using. A `finally` is a fact about the
 * shape of the code, and the shape is readable from the text.
 *
 * THE THREE VARIABLE NAMES ARE A CONVENTION AND THIS ENFORCES IT. The close is looked for as
 * `record.close(`, `server.close(` and `browser?.close(`, so a gate that called its browser `chrome`
 * would be reported as a gate that never closes it. That is the intended answer rather than a hole:
 * tracking an arbitrary alias back to its `chromium.launch()` is a type checker, and the six gates
 * that exist all spell the three names the same way already.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const here = join(import.meta.dirname, '..');

/**
 * WHICH FILES IN THIS DIRECTORY ARE GATES, derived exactly as `run.mjs` derives it: a file another
 * file here imports is a library, and the two runners are the two runners.
 *
 * IT IS RE-DERIVED RATHER THAN IMPORTED, and that is not a copy anybody has to maintain twice. The
 * list lives in `run.mjs` as top-level code that RUNS a gate sweep on import, so a test that imported
 * it to read the list would run the whole suite to ask a question about source text. The rule itself
 * is three lines and is the thing worth agreeing on; if `run.mjs` ever changes what counts as a gate,
 * the `>= 6` floor below is what goes red rather than this quietly sweeping nothing.
 *
 * `record.mjs` EARNS ITS EXEMPTION BY BEING A LIBRARY AND NOT BY BEING NAMED. It is the file that
 * defines `startRecord`, and its own command-line block starts a record and deliberately leaves it
 * running for `vite dev` to proxy to, which is the one correct unreleased handle in the directory.
 * Every gate imports it, so the derivation excludes it without a special case.
 */
function gatesIn(dir) {
  const files = readdirSync(dir).filter((name) => name.endsWith('.mjs'));
  const imported = new Set(
    files.flatMap((name) => [...readFileSync(join(dir, name), 'utf8').matchAll(/from '\.\/([\w.-]+\.mjs)'/gu)].map((m) => m[1])),
  );
  const RUNNERS = new Set(['run.mjs', 'self-test.mjs']);
  return files.filter((name) => !RUNNERS.has(name) && !imported.has(name));
}

/**
 * The same source with every comment, string and regular expression replaced by spaces of its own
 * length, so an index into the answer is an index into the file.
 *
 * WHY ANYTHING IS BLANKED AT ALL: THIS IS THE MISTAKE THE GREP MADE. A grep over raw text matches
 * `chromium.launch()` inside the paragraph of a header that explains why the gate launches one, and
 * it matches `finally` inside a comment that says a `finally` is missing. Every gate in here carries
 * more prose than code. What follows counts braces, and a brace inside a regular expression is not a
 * brace: `keys.mjs` reads its registry with `/\{\s*id:\s*'([^']+)',.../g`, which holds one `{`, one
 * `}` and six apostrophes, none of which are code. Blanking first is what makes brace counting mean
 * anything, and the balance case below is the proof that it does.
 *
 * A REGULAR EXPRESSION IS TOLD FROM A DIVISION BY WHAT STANDS BEFORE IT, which is the standard
 * heuristic and is exact over this corpus: every `/` in these 27 files opens a literal, and each one
 * follows an operator, an opening bracket or a keyword.
 */
export function blank(source) {
  const out = [...source];
  /** The last few characters as the reader sees them, hidden regions included as the spaces they became. */
  let window = '';
  const emit = (text) => {
    window = (window + text).slice(-16);
  };
  const hide = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
    emit(' '.repeat(Math.max(0, to - from)));
  };
  /* What may stand immediately before a `/` that opens a regular expression. */
  const OPENS_A_REGEX = /(?:[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|case|typeof|instanceof|in|of|new|delete|void|throw|await|yield))$/u;

  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      hide(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      hide(i, stop);
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      emit(c);
      hide(i + 1, Math.min(j, source.length));
      emit(c);
      i = Math.min(j + 1, source.length);
    } else if (c === '/' && OPENS_A_REGEX.test(window.replace(/\s+$/u, ''))) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length) {
        const ch = source[j];
        if (ch === '\\') j += 2;
        else if (ch === '[') (inClass = true), j++;
        else if (ch === ']') (inClass = false), j++;
        else if (ch === '/' && !inClass) break;
        else if (ch === '\n') break;
        else j++;
      }
      emit('/');
      hide(i + 1, Math.min(j, source.length));
      emit('/');
      i = Math.min(j + 1, source.length);
    } else {
      emit(c);
      i++;
    }
  }
  return out.join('');
}

/** From a `{` to the `}` that closes it, over blanked code. `-1` when the file is unbalanced. */
function forward(code, at) {
  let depth = 0;
  for (let i = at; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** The mirror: from a closing bracket back to its opener. */
function backward(code, at, open, close) {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    if (code[i] === close) depth++;
    else if (code[i] === open && --depth === 0) return i;
  }
  return -1;
}

/**
 * Every `finally` in the file, with the `try` it belongs to: `{ guard: [from, to], body: [from, to] }`.
 *
 * IT WALKS BACK PAST A `catch` RATHER THAN ASSUMING `try`/`finally` ARE ADJACENT. None of the six
 * gates writes a `catch` between the two today, and a gate that grew one must not silently stop being
 * checked, which is what a simpler reader would do here: it would find no `try`, report no guarded
 * region, and then report the gate's perfectly good closes as unguarded, or worse, be relaxed into
 * skipping the file.
 */
function guards(code) {
  const out = [];
  for (const m of code.matchAll(/\bfinally\s*\{/gu)) {
    const brace = code.indexOf('{', m.index);
    const end = forward(code, brace);
    if (end === -1) continue;
    const guard = tryBefore(code, m.index);
    if (guard !== null) out.push({ guard, body: [brace, end] });
  }
  return out;
}

/** The `try` block a `finally` at `at` belongs to, stepping back over any `catch (e) { }` between them. */
function tryBefore(code, at) {
  let i = at - 1;
  for (;;) {
    while (i >= 0 && /\s/u.test(code[i])) i--;
    if (code[i] !== '}') return null;
    const open = backward(code, i, '{', '}');
    if (open === -1) return null;
    let j = open - 1;
    while (j >= 0 && /\s/u.test(code[j])) j--;
    if (code.slice(Math.max(0, j - 2), j + 1) === 'try') return [open, i];
    if (code[j] !== ')') return null;
    const paren = backward(code, j, '(', ')');
    if (paren === -1) return null;
    let k = paren - 1;
    while (k >= 0 && /\s/u.test(code[k])) k--;
    if (code.slice(Math.max(0, k - 4), k + 1) !== 'catch') return null;
    i = k - 5;
  }
}

/**
 * The three handles, each as the call that takes it and the call that gives it back.
 *
 * WHY THESE THREE AND NOT EVERY `close()` IN THE DIRECTORY. A Playwright context or page belongs to
 * the browser and dies with it, and a leaked one costs a run nothing an operator can see. These three
 * outlive the gate that opened them: the record holds a SQLite database and an ephemeral port, the
 * server holds the fixed port the NEXT gate in the run has to bind, and the browser is a child
 * process that keeps the runner alive.
 */
const HANDLES = [
  { what: 'the seeded record', open: /\bstartRecord\s*\(/gu, close: /\brecord\s*\??\.\s*close\s*\(/gu },
  { what: 'the HTTP server on its own port', open: /\bcreateServer\s*\(/gu, close: /\bserver\s*\??\.\s*close\s*\(/gu },
  { what: 'the browser', open: /\bchromium\s*\.\s*launch\s*\(/gu, close: /\bbrowser\s*\??\.\s*close\s*\(/gu },
];

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/**
 * What a gate's source fails to give back, as a list of sentences. Empty is the pass.
 *
 * TWO QUESTIONS, AND THE SECOND ONE IS THE REASON THE FIRST IS NOT ENOUGH.
 *
 *   1. Every close sits inside a `finally`. A close on the straight-line path is skipped by every
 *      throw above it, which is the whole of the defect `3e9d5ea0` repaired and the whole of what was
 *      left in `a11y.mjs`.
 *   2. Every open is covered by that `finally`. A close guarded by a `try` the open stands outside of
 *      guards nothing, and the shape would read as repaired.
 *
 * AN OPEN IS ALLOWED TO STAND JUST ABOVE THE `try`, AND THE RECORD HAS TO. `startRecord()` is awaited
 * before the `try` in all five repaired gates on purpose: a record that failed to start is not a
 * record to hand back, and putting the call inside would mean a `finally` closing a binding that is
 * still `undefined`. What must be true is that nothing between the open and the `try` can throw, so
 * the run-up is allowed to hold declarations and nothing else. `let server = null` and
 * `let browser = null` are exactly what stands there, and they are there because the `finally` has to
 * see those two half-built.
 */
export function unreleased(source) {
  const code = blank(source);
  const found = [];
  const held = guards(code);

  for (const handle of HANDLES) {
    const opens = [...code.matchAll(handle.open)].map((m) => m.index);
    if (opens.length === 0) continue;
    const closes = [...code.matchAll(handle.close)].map((m) => m.index);

    if (closes.length === 0) {
      found.push(`${handle.what} is opened at line ${lineOf(source, opens[0])} and closed nowhere`);
      continue;
    }

    const inside = ([from, to], at) => at > from && at < to;
    for (const at of closes)
      if (!held.some((h) => inside(h.body, at)))
        found.push(
          `${handle.what} is closed at line ${lineOf(source, at)} on the straight-line path, so anything above it that throws skips the close`,
        );

    const covering = held.filter((h) => closes.some((at) => inside(h.body, at)));
    for (const at of opens)
      if (!covering.some((h) => inside(h.guard, at) || onlyDeclarationsBetween(code, at, h.guard[0])))
        found.push(
          `${handle.what} is opened at line ${lineOf(source, at)} outside the try whose finally closes it, so a throw there hands nothing back`,
        );
  }
  return found;
}

/**
 * Whether everything between the statement that opens a handle and the `try` below it is declarations.
 *
 * The run-up is read from the `;` that ends the opening statement to the `{` of the try block, minus
 * the word `try` itself. Anything that is not a `let` or `const` initialised to a literal can throw,
 * and a throw there is a handle nobody hands back.
 */
function onlyDeclarationsBetween(code, open, tryBrace) {
  const semicolon = code.indexOf(';', open);
  if (semicolon === -1 || semicolon > tryBrace) return false;
  const between = code.slice(semicolon + 1, tryBrace).replace(/\btry\b\s*$/u, '');
  return /^(?:\s|(?:let|const)\s+\w+(?:\s*=\s*(?:null|undefined|true|false|\d+))?\s*;)*$/u.test(between);
}

/* ───────────────────────────── the cases ───────────────────────────── */

/**
 * THE READER IS PROVED BEFORE IT IS BELIEVED, and this is the case that does it.
 *
 * Counting braces over 27 files of heavy prose is only meaningful if the blanking is right, and the
 * cheapest way to be wrong is silently: an unbalanced file yields no `finally` regions at all, which
 * would make every gate in the sweep below pass for the wrong reason. A file whose braces balance
 * after blanking is a file the reader parsed.
 *
 * AND THE CASE IS NOT VACUOUS, WHICH WAS MEASURED RATHER THAN ASSUMED. Run over the same 27 files
 * with the regex branch of `blank` taken out and comments and strings still blanked, twelve of them
 * stop balancing: `css-rules.mjs` and `dead-copy.mjs` dip to -1, and `closed-lists.mjs`,
 * `event-kinds.mjs`, `stack.mjs`, `flags.mjs`, `router-groups.mjs`, `secret-grep.mjs`,
 * `colour-grep.mjs`, `guards.mjs`, `refusal-fixtures.mjs` and `self-test.mjs` end between 1 and 4
 * braces deep. So the regex branch is doing work on this corpus and this case is what says so.
 *
 * `keys.mjs` IS THE OTHER HALF OF THE SAME POINT AND IT IS NOT A BALANCE FAILURE. Its registry regex
 * at line 140 reads `/\{\s*id:\s*'([^']+)',...[^}]*?bare:/`, whose one `{` and one `}` cancel, so the
 * count survives it; the six apostrophes in it are what a reader with no regex branch would take for
 * string quotes, and that is the case below.
 */
test('blanking leaves every gate file balanced, regexes and apostrophes and all', () => {
  const unbalanced = [];
  for (const name of gatesIn(here)) {
    const code = blank(readFileSync(join(here, name), 'utf8'));
    let depth = 0;
    let floor = 0;
    for (const ch of code) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      floor = Math.min(floor, depth);
    }
    if (depth !== 0 || floor < 0) unbalanced.push(`${name} (ends at ${depth}, dips to ${floor})`);
  }
  assert.deepEqual(unbalanced, [], `the reader did not parse: ${unbalanced.join(', ')}`);
});

test('a brace and an apostrophe inside a regular expression are not read as code', () => {
  const source = String.raw`const rows = [...source.matchAll(/\{\s*id:\s*'([^']+)',[^}]*?bare/g)];`;
  const code = blank(source);
  assert.equal(code.includes('{'), false, 'a brace inside a regex survived the blanking');
  assert.equal(code.includes('}'), false, 'a brace inside a regex survived the blanking');
  /* LENGTH IS THE WHOLE CONTRACT, not a count anybody should have to check by hand: every index into
     the answer has to be the same index into the file, or the line numbers in the findings are wrong. */
  assert.equal(code.length, source.length);
});

/**
 * THE SWEEP. Every gate in the directory, not a list of the ones anybody remembered.
 *
 * The floor matters as much as the equality: a derivation that came back empty, or a blanking that
 * stopped matching `chromium.launch(`, would satisfy an empty `deepEqual` and assert nothing at all.
 * Six is what the directory holds today, and it is the number the header is about.
 */
test('every gate that opens a record, a port or a browser gives it back however it leaves', () => {
  const leaks = [];
  let drivers = 0;
  for (const name of gatesIn(here)) {
    const source = readFileSync(join(here, name), 'utf8');
    const code = blank(source);
    if (!HANDLES.some((h) => new RegExp(h.open.source, 'u').test(code))) continue;
    drivers++;
    for (const complaint of unreleased(source)) leaks.push(`${name}: ${complaint}`);
  }
  assert.ok(drivers >= 6, `only ${drivers} gate(s) were found to open one of the three handles, and six do`);
  assert.deepEqual(leaks, [], `\n      ${leaks.join('\n      ')}\n`);
});

/* THE NEGATIVES, because a checker that has never said no is a checker nobody has tested. Each one is
   a fixture rather than a real gate, for the same reason `a11y-coverage` drives `stray` directly:
   seeding the defect back into a gate would mean editing the thing under test. */
test('closes on the straight-line path are a finding and not a quiet pass', () => {
  const straight = [
    'const record = await startRecord();',
    'const server = createServer(() => {});',
    'const browser = await chromium.launch();',
    'await work();',
    'await browser.close();',
    'server.close();',
    'await record.close();',
  ].join('\n');
  const said = unreleased(straight).join(' | ');
  assert.match(said, /the seeded record is closed at line 7 on the straight-line path/u);
  assert.match(said, /the HTTP server on its own port is closed at line 6 on the straight-line path/u);
  assert.match(said, /the browser is closed at line 5 on the straight-line path/u);
});

test('the repaired shape passes, record above the try and the other two inside it', () => {
  const repaired = [
    'const record = await startRecord();',
    'let server = null;',
    'let browser = null;',
    'try {',
    '  server = createServer(() => {});',
    '  browser = await chromium.launch();',
    '  await work();',
    '} finally {',
    '  await browser?.close().catch(() => {});',
    '  if (server !== null) await new Promise((r) => server.close(() => r()));',
    '  await record.close().catch(() => {});',
    '}',
  ].join('\n');
  assert.deepEqual(unreleased(repaired), []);
});

test('a finally the open stands outside of guards nothing, and is said so', () => {
  const late = [
    'const record = await startRecord();',
    'let browser = await chromium.launch();',
    'await somethingThatCanThrow();',
    'try {',
    '  await work();',
    '} finally {',
    '  await browser?.close().catch(() => {});',
    '  await record.close().catch(() => {});',
    '}',
  ].join('\n');
  assert.match(
    unreleased(late).join(' | '),
    /the browser is opened at line 2 outside the try whose finally closes it/u,
    'an open separated from its try by a call that can throw was accepted',
  );
});

test('a catch between the try and the finally does not hide the guard', () => {
  const caught = [
    'const record = await startRecord();',
    'try {',
    '  await work();',
    '} catch (error) {',
    '  console.error(error);',
    '} finally {',
    '  await record.close().catch(() => {});',
    '}',
  ].join('\n');
  assert.deepEqual(unreleased(caught), []);
});

test('a handle opened and never closed is named', () => {
  assert.match(
    unreleased('const browser = await chromium.launch();\nawait work();').join(' | '),
    /the browser is opened at line 1 and closed nowhere/u,
  );
});
