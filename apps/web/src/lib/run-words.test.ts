/**
 * A RUN IS A RUN, EVERYWHERE A PERSON READS (job g): no screen and no word file calls an agent's run a
 * session. The record's list of runs is still `session` underneath, so its id, its icon and the paths built on it are
 * allowed; so are comments, which nobody reads on a screen. Signing in has sessions of its own, and Settings > Sessions
 * says them.
 *
 * WHAT IS READ: every `src/**\/*.svelte`, its markup's text, the attributes a person reads or hears, and the words in its
 * scripts and expressions; and every word file (`src/lib/**\/*words*.ts`, `*-said.ts`) and the app's copy
 * (`src/lib/copy/**`), where "Waiting for an agent's next session" was found. A string in code is copy when it holds a
 * space or starts with a capital: `'session'` is an id, `'Agent sessions'` is copy.
 *
 * HELD, AND TIGHTENING: a line the tree still breaks in a file this job does not own is named in `HELD` with the words
 * that replace it, so the check is green today and goes red the day a held line is fixed without its entry going too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dirname, '..');

/** A word that calls something a session. */
const SESSION = /\bsessions?\b/iu;

/** Files whose sessions are sign-in sessions, which is what they are. */
const SIGN_IN: readonly string[] = ['routes/settings/[area]/areas/Sessions.svelte', 'lib/copy/account.ts'];

/**
 * Lines the tree breaks today, each in a file another job owns, with the words that take its place (the report's
 * blocked lines). Keyed by file and the copy found, so a moved line still matches and a fixed one is noticed.
 */
const HELD: readonly { file: string; copy: string; becomes: string }[] = [];

/** Every file under a folder, its path relative to `src`. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(at);
    return [relative(SRC, at)];
  });
}

/**
 * The strings in a stretch of code, comments left out. A small lexer, enough for this app's own TypeScript: quotes,
 * template text (its `${}` read as code again), line and block comments, and a regular expression after an operator.
 */
export function codeStrings(code: string): string[] {
  const out: string[] = [];
  let i = 0;
  const lex = (closeAt: string | null): void => {
    let depth = 0;
    while (i < code.length) {
      const c = code[i]!;
      const next = code[i + 1];
      if (closeAt !== null && c === '}' && depth === 0) return void (i += 1);
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      if (c === '/' && next === '/') i = code.indexOf('\n', i) === -1 ? code.length : code.indexOf('\n', i);
      else if (c === '/' && next === '*') i = code.indexOf('*/', i + 2) === -1 ? code.length : code.indexOf('*/', i + 2) + 2;
      else if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]\s*$|^\s*$|\breturn\s*$/u.test(code.slice(Math.max(0, i - 12), i))) {
        let inClass = false;
        for (i += 1; i < code.length && code[i] !== '\n'; i += 1) {
          if (code[i] === '\\') i += 1;
          else if (code[i] === '[') inClass = true;
          else if (code[i] === ']') inClass = false;
          else if (code[i] === '/' && !inClass) break;
        }
        i += 1;
      } else if (c === "'" || c === '"') {
        let s = '';
        for (i += 1; i < code.length && code[i] !== c && code[i] !== '\n'; i += 1) s += code[i] === '\\' ? code[++i] : code[i];
        out.push(s);
        i += 1;
      } else if (c === '`') {
        let s = '';
        for (i += 1; i < code.length && code[i] !== '`'; i += 1) {
          if (code[i] === '\\') s += code[++i];
          else if (code[i] === '$' && code[i + 1] === '{') {
            out.push(s);
            s = '';
            i += 2;
            lex('}');
            i -= 1;
          } else s += code[i];
        }
        out.push(s);
        i += 1;
      } else i += 1;
    }
  };
  lex(null);
  return out;
}

/** Whether a string from code is words a person reads: it holds a space, or it starts with a capital. */
const isCopy = (s: string): boolean => /\p{L}\s+\p{L}|^\s*\p{Lu}/u.test(s);

/** Where a person reads or hears an attribute's value. */
const SEEN_ATTRS = /\b(?:title|aria-label|aria-description|placeholder|alt|label|heading|empty)\s*=\s*"([^"{]*)"/gu;

/** What a person reads in a Svelte file: markup text, the attributes they see, and the copy in its code. */
export function svelteCopy(source: string): string[] {
  const noComments = source.replace(/<!--[\s\S]*?-->/gu, ' ');
  const scripts = [...noComments.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!);
  const markup = noComments.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gu, ' ');
  const found: string[] = [];
  for (const code of scripts) found.push(...codeStrings(code).filter(isCopy));
  /* THE EXPRESSIONS IN MARKUP, read as code; what is left between the tags is text. */
  let text = '';
  let at = 0;
  while (at < markup.length) {
    if (markup[at] === '{') {
      let depth = 1;
      let end = at + 1;
      for (; end < markup.length && depth > 0; end += 1) depth += markup[end] === '{' ? 1 : markup[end] === '}' ? -1 : 0;
      found.push(...codeStrings(markup.slice(at + 1, end - 1)).filter(isCopy));
      text += ' ';
      at = end;
    } else text += markup[at++];
  }
  for (const m of text.matchAll(SEEN_ATTRS)) found.push(m[1]!);
  found.push(...text.replace(/<[^>]*>/gu, '\n').split('\n').map((t) => t.trim()).filter((t) => t !== ''));
  return found;
}

/** Each place in the app that calls a run a session: the file and the copy that says it. */
function sessionWords(): { file: string; copy: string }[] {
  const files = walk(SRC).filter((f) => !f.includes('.test.'));
  const svelte = files.filter((f) => f.endsWith('.svelte') && !SIGN_IN.includes(f));
  const words = files.filter((f) => f.startsWith('lib/') && f.endsWith('.ts') && !SIGN_IN.includes(f) && (/(?:words[^/]*|-said)\.ts$/u.test(f) || f.startsWith('lib/copy/')));
  return [
    ...svelte.flatMap((file) => svelteCopy(readFileSync(join(SRC, file), 'utf8')).map((copy) => ({ file, copy }))),
    ...words.flatMap((file) => codeStrings(readFileSync(join(SRC, file), 'utf8')).filter(isCopy).map((copy) => ({ file, copy }))),
  ].filter((f) => SESSION.test(f.copy));
}

test('no screen and no word file calls a run a session', () => {
  const held = (f: { file: string; copy: string }) => HELD.some((h) => h.file === f.file && f.copy.includes(h.copy));
  const found = sessionWords().filter((f) => !held(f));
  assert.deepEqual(found, [], `Say "run" where these say session:\n${found.map((f) => `${f.file}: ${f.copy}`).join('\n')}`);
});

test('a held line is still in the tree, so a fixed one leaves the allowance too', () => {
  const found = sessionWords();
  for (const h of HELD) assert.ok(found.some((f) => f.file === h.file && f.copy.includes(h.copy)), `${h.file} no longer says "${h.copy}": take it out of HELD`);
});
