/**
 * THE RULE, HELD AGAINST EVERY MODULE THIS WORKER ORIGINATES AN ANSWER FROM, WHICH IS THREE OF THEM.
 *
 * `33 §4` asks for `no-store` on all of `/api/*`. `serveApi` sets it on everything it answers, and
 * every answer this Worker builds ITSELF has to as well. Two did not: the Durable Object's 503 and
 * its 401 were built by hand with a content-type and nothing else, and `route()` hands back what the
 * object returns unchanged. Neither status is heuristically cacheable, so nothing was observed to go
 * wrong; what was wrong is that a rule was stated, a helper was provided for it, and there were two
 * places the sentence did not reach.
 *
 * IT READ `src/index.ts` AND NOTHING ELSE, WHICH WAS ONE FILE OUT OF THREE. Counted on 2026-09-21:
 * `apps/worker/src` constructs a Response in five places in five modules. `index.ts` (`json`),
 * `inbound.ts` (`reply`) and `keychain.ts` (`answerOpen`) each build an answer of their own, and each is
 * a single construction site serving a whole surface, which is what lets one rule cover every answer
 * the module gives. `session.ts` (`withCookie`) and `http.ts` (`withinCap`) re-wrap a Response they
 * were handed, so the headers they answer with are the headers they were given, and `http.ts`'s is a
 * connector's reply arriving rather than an answer going out. `inbound.ts` was written on 2026-09-21
 * and was held to `no-store` only from inside `route.test.ts`, which is one test remembering a rule
 * rather than the rule being enforced.
 *
 * SO IT READS THE DIRECTORY AND NEVER A LIST OF NAMES. The next module that answers is held to this
 * on the day it lands, with nobody editing this file, which is the only version of this test that is
 * still true a week after it was written. `keychain.ts` is the one the widening found, and it was found
 * rather than added.
 *
 * IT READS THE SOURCE AS TEXT, which is the shape several gates in this repository already use and is
 * the only one available here: `src/index.ts` imports `cloudflare:workers` and cannot be loaded by
 * `node --test` at all, which is the same reason `tsconfig.test.json` leaves that one module out of
 * its program. Reading rather than importing is also what makes a new answering module cost no
 * config change to cover.
 *
 * AND `no-store` IS FOLLOWED BY NAME, because only one of the three says it in the call. `json`
 * writes the header list inline, `reply` names `HEADERS` two declarations above itself, and
 * `answerOpen` names `KEYCHAIN_HEADERS`, which belongs to `packages/host` and is reached through a
 * re-export. A check that accepted only the inline spelling would have demanded that all three be
 * rewritten to look like the one that already passed, which is a test dictating a style rather than
 * checking a rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const PACKAGES = join(here, '..', '..', '..', 'packages');

/** A file that is not there is a name that leads nowhere, and nowhere carries `no-store`. */
const read = (file: string): string => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/**
 * THE CODE WITH THE PROSE TAKEN OUT, BECAUSE A COMMENT SAYING `no-store` IS NOT A HEADER SETTING IT.
 * Every answer below is asked whether it says `no-store`, and the window that question is asked over
 * runs from the declaration down to the call, comments in the body included. In a tree whose modules
 * explain `no-store` in prose as a matter of course (`src/session.ts` does it two lines above its own
 * `new Response`), that is the false pass this check most easily gives: a module answering with
 * `content-type` alone and one line of `// serveApi already puts no-store on everything` was watched
 * PASSING in a scratch copy of `src/` before this function existed, and failing after it.
 *
 * IT TAKES BLOCK COMMENTS ANYWHERE AND LINE COMMENTS ONLY WHERE ONE STARTS A LINE, which is how they
 * are written here. Cutting from every `//` would cut from the `//` in a URL as well and take the
 * rest of that line with it, and a header list is one plausible thing to find later on such a line.
 *
 * AND IT BLANKS RATHER THAN DELETES, so every offset and every line number is the one the file has.
 * That is what lets the scan itself run over the prose-free text, which it must: the modules in this
 * tree quote the code they discuss, and a comment reading ``a `new Response(JSON.stringify(payload),
 * { status })` written here by hand would miss `no-store` `` was watched turning this test RED
 * against a module that constructs nothing at all. A rule that a comment can break is a rule that
 * gets reworded instead of obeyed.
 */
const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/.*$/gm, blank);

/** Where a name is declared, and where a name is passed along. Both are asked of one module's text. */
const declaredAs = (name: string): RegExp => new RegExp(`(?:const|let|var)\\s+${name}\\b[^=]*=`);
const passedOn = (name: string): RegExp =>
  new RegExp(`(?:import|export)\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'([^']+)'`);

/**
 * THE FILE A SPECIFIER NAMES, WRITTEN OUT RATHER THAN RESOLVED. Every workspace package in this
 * repository publishes `./src/<name>.ts` and nothing else, so the mapping is two lines, and asking
 * Node to resolve the specifier instead would mean loading modules for a test whose whole method is
 * to read text. `null` for a third-party specifier: a header list this Worker's answer is built from
 * is this repository's, and if it ever is not, the answer is bare until somebody says otherwise.
 */
function moduleFor(spec: string, from: string): string | null {
  if (spec.startsWith('.')) return join(dirname(from), spec);
  if (!spec.startsWith('@braindog/')) return null;
  const parts = spec.slice('@braindog/'.length).split('/');
  return join(PACKAGES, parts[0] ?? '', 'src', `${parts.length > 1 ? parts.slice(1).join('/') : 'index'}.ts`);
}

/**
 * A WHOLE DECLARATION, TO THE `;` THAT ENDS IT AND NOT THE FIRST ONE INSIDE IT.
 * `const HEADERS: readonly Header[] = [['content-type', ...], ['cache-control', 'no-store'], ...];`
 * is a declaration with brackets of its own, and `const json = ... => new Response(...);` is one with
 * a whole function body in it. Both hold the header this test is looking for past the first `]`.
 */
function whole(src: string, from: number): string {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ';' && depth <= 0) return src.slice(from, i);
  }
  return src.slice(from);
}

/**
 * THREE FILES, WHICH IS WHAT THE LONGEST ONE ACTUALLY TAKES TODAY. `answerOpen` in `src/keychain.ts`
 * names `KEYCHAIN_HEADERS`, `packages/host/src/index.ts` re-exports it, and
 * `packages/host/src/keychain.ts` declares it with `no-store` in it. A header list a fourth file away
 * would be a header list nobody reading the answer could find either.
 */
const THROUGH = 3;

/**
 * Does this text say `no-store`, or name something that does?
 *
 * IT FOLLOWS EVERY NAME IN THE TEXT AND NOT ONLY THE ONE PASSED AS `headers`, because the two
 * helpers that use a list build a `Headers` in one statement and fill it in the next, and the only
 * way to tell that the loop in between reached a list carrying `no-store` is to read the statements
 * around it rather than the call's arguments. The cost of the looser question is that a module naming
 * a header list it does not use would be accepted. The module this check exists to catch is one that
 * names no header list anywhere, and one was watched failing in a scratch copy before this was kept.
 */
function reaches(text: string, file: string, hops: number, needle = 'no-store'): boolean {
  if (text.includes(needle)) return true;
  if (hops <= 0) return false;
  const src = code(read(file));
  for (const name of new Set(text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [])) {
    const decl = declaredAs(name).exec(src);
    if (decl !== null && whole(src, decl.index).includes(needle)) return true;
    const along = passedOn(name).exec(src);
    const next = along === null ? null : moduleFor(along[1] ?? '', file);
    if (next !== null && reaches(name, next, hops - 1, needle)) return true;
  }
  return false;
}

/**
 * THE DECLARATION A CALL SITS IN, FOUND BY WALKING BACK TO THE LAST LINE THAT STARTS IN COLUMN ONE.
 * All three helpers that build an answer are at module scope, so the nearest line above the call
 * beginning at column one is the `const` or `function` that owns it, and the names in it are the
 * names the answer was built from. A call inside a class body would widen this to the whole class,
 * which makes the window larger and never smaller.
 */
function declarationAt(src: string, at: number): string {
  let start = 0;
  for (let i = 1; i < at; i += 1) {
    const c = src[i] ?? '\n';
    if (src[i - 1] === '\n' && c.trim() !== '') start = i;
  }
  return src.slice(start, at);
}

type Site = { module: string; line: number; call: string; scope: string };

/** Every `new Response(` in one module, each with the whole of its call and the declaration around it. */
function sitesIn(module: string, src: string): Site[] {
  const out: Site[] = [];
  for (const m of src.matchAll(/new Response\(/g)) {
    const at = m.index ?? 0;
    /* TO THE MATCHING CLOSE PAREN, and not to the first one. A `new Response(JSON.stringify({...}))`
       carries parens of its own, and stopping at the first would cut the call in half and read the
       headers of the next one. */
    let depth = 1;
    let i = at + m[0].length;
    for (; i < src.length && depth > 0; i += 1) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
    }
    out.push({
      module,
      line: src.slice(0, at).split('\n').length,
      call: src.slice(at, i),
      scope: declarationAt(src, at),
    });
  }
  return out;
}

/**
 * A RE-WRAP, WHOSE HEADERS ARE WHATEVER IT WAS HANDED.
 *
 * `new Response(response.body, response)` in `session.ts` and
 * `new Response(whole, { status: res.status, headers: res.headers })` in `http.ts` are the two in
 * this Worker, and neither has headers of its own to set: an init that IS a Response, or that takes
 * that Response's `headers`, answers with exactly what came in. Holding either to `no-store` would
 * mean asking it to overwrite the record's own headers, which is the opposite of what `withCookie`
 * exists to do. Both spellings are listed because the platform offers both.
 *
 * WHAT IT CANNOT TELL, SAID PLAINLY: the first spelling asks only that the last argument be a NAME,
 * and a name can hold a plain object as easily as a Response. `const init = { status: 200, headers:
 * { 'content-type': 'application/json' } }; return new Response(body, init);` is an answer of this
 * Worker's own with no `no-store` on it, and it was watched PASSING in a scratch copy of `src/`.
 * Reading the name's type is type analysis and this test reads text, and the tighter rules tried
 * instead each rejected a re-wrap that is legitimate: requiring `: Response` in the declaration
 * rejects a response that arrived from `await fetch(...)` unannotated, and requiring the body
 * argument to name the same value rejects `new Response(rewritten, upstream)`, which keeps the
 * upstream headers on purpose. The gap is named here rather than closed badly: an answer built from
 * an init held in a variable is the one shape this scan does not see, and there is none today.
 */
const reWrap = (call: string): boolean => /,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)$/.test(call) || /\.headers\b/.test(call);

test('EVERY MODULE THE WORKER ORIGINATES AN ANSWER FROM CARRIES no-store', () => {
  /* AND IT WALKS INTO FOLDERS, because `src/` being flat today is a fact about today. A flat listing
     skips a subdirectory in silence, which is the one way this scan can report a clean pass over a
     module it never opened: a bare answer dropped at `src/doors/extra.ts` was watched PASSING in a
     scratch copy of `src/` with a flat listing, and failing with `recursive`. `readdirSync` then
     returns `doors/extra.ts`, which `join` opens and the report names, so nothing else here changes. */
  const modules = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .sort();
  const bare: string[] = [];
  const answering = new Set<string>();
  let built = 0;
  let byName = 0;

  for (const module of modules) {
    const file = join(SRC, module);
    for (const site of sitesIn(module, code(read(file)))) {
      built += 1;
      if (reWrap(site.call)) continue;
      answering.add(module);
      if (site.call.includes('no-store')) continue;
      if (reaches(`${site.scope}${site.call}`, file, THROUGH)) {
        byName += 1;
        continue;
      }
      /* A DECLARED, ALTERNATE `cache-control` IS THE SAME DECISION MADE THE OTHER WAY. `no-store` and a
         positive `max-age` cannot both be true of one answer, so a call whose own headers already name
         `cache-control` said what to do with a cache on purpose, as `GET /api/files/<sha256>` does (ops
         §4.0 D): a record's own file, held long because its name is the hash it was stored under. */
      if (reaches(`${site.scope}${site.call}`, file, THROUGH, 'cache-control')) continue;
      bare.push(`${module} line ${site.line}: ${site.call.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
  }

  /* AND THE DIRECTORY WAS ACTUALLY READ. A regex that matches nothing passes every assertion under
     it, which is the shape this repository's own self-test exists to break. Five constructions in
     five modules, three of them answers, two of them re-wraps: those are the numbers on 2026-09-21,
     and the assertions below are the floors rather than the counts, because a module that starts
     answering must join this set without being welcomed.

     TWO IS THE FLOOR AND ONE WAS THE BUG. This test enforced the rule against `index.ts` alone while
     `inbound.ts` answered beside it, so the failure worth catching forever is this scan collapsing
     back to a single module.

     AND ONE ANSWER MUST REACH `no-store` THROUGH A NAME, which two of the three do. If that ever
     falls to zero, the arm of this check that reads past the call site has stopped being exercised,
     and an arm nothing exercises is an arm nobody knows is broken. */
  assert.ok(built > 0, 'no Response is constructed anywhere in src/, so this test read the wrong directory');
  assert.ok(answering.size >= 2, 'only one module was seen to build an answer, which is the state this test was widened out of');
  assert.deepEqual(bare, [], 'this Worker sets `no-store` on every answer it builds, and these were built without it');
  assert.ok(byName > 0, 'no answer reached `no-store` through a name, so only the spelling that was always covered is being checked');
});
