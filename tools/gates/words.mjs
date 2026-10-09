/**
 * `words`: the house words, held by a check (EXP-B07).
 *
 *   node tools/gates/words.mjs [root]
 *
 * THE WORDS A PERSON MUST NEVER READ ARE A LIST, AND THE LIST IS `words.json` BESIDE THIS FILE. Each entry is a word or
 * a shape (row, credential, register as a noun, an id in a sentence, the long dash), what to say in its place and why.
 * The page lint (`packages/render/src/lint.ts`, `plain-words`) carries the entries marked `page` and is held equal to
 * them below, so the page a person reads and the source the app ships are judged by one list.
 *
 * WHAT IS READ IS WHAT A SCREEN PRINTS: the string values of every copy object the app ships. That is
 * `apps/web/src/lib/copy/*.ts`, `apps/web/src/lib/first-run.ts` and each `apps/web/src/routes/<screen>/words.ts`.
 * Comments are not read, and neither are the parts of a source that are code rather than copy: an object's quoted key,
 * a module's address, a value compared with `===` or matched by `case`, a type's union of literals, an index, and the
 * argument of a method call (`.join(', ')`, `.toLocaleString('en-GB')`). A template is read with each `${…}` as `{}`.
 *
 * TWO RULES ARE SHAPES OF A SENTENCE, NOT WORDS. A title, a heading, a label or a button (a key ending in one of those
 * words) that ends in a full stop; and a value that is the long dash and something else, since a dash alone is the
 * drawn mark for "no value" and not a word.
 *
 * TODAY'S DEBTS ARE HELD, BY FILE AND COUNT, in `words.json`'s `held`, and only on the repository itself (a planted tree
 * is judged whole). A held file at its count is green and printed as held; above it, or a file not held at all, is red;
 * below it is green and printed as one whose count can come down. So the list only shrinks, and EXP-B08 empties it.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
/** The repository this file lives in, whose own copy the held list is about. */
const REPO = resolve(here, '..', '..');

/** A string's escapes as the characters they stand for: `\u2014` is read as the dash a screen prints. */
const unescape = (s) =>
  s.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(.))/gsu, (_m, braced, four, two, e) => {
    const hex = braced ?? four ?? two;
    if (hex !== undefined) return String.fromCodePoint(Number(`0x${hex}`));
    return { n: '\n', t: '\t', r: '', '0': '' }[e] ?? e;
  });

/* Every token the lexer steps over whole is two characters: `//`, `/*`, `*\/`, `${` and an escape. */
const PAIR = '${'.length;

/** The keywords after which a slash opens a regular expression rather than dividing (`shell-words`' list). */
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const OPERATOR = /[=!<>&|?+*%^~-]/;
const WORD = /[A-Za-z0-9_$]/;
/** A comparison or a type's angle brackets (`Record<'row', string>`): a value beside one is matched or typed, never shown. */
const COMPARES = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=']);

/**
 * Every string a copy file holds as a value, with its line and the key it is the value of (or `null`).
 *
 * A LEXER AND NOT A PATTERN, for `shell-words`' reason: a pattern cannot tell a quote inside a comment, a template or a
 * regular expression from the start of a string. It knows strings, templates and their `${…}`, regular expressions and
 * both comment forms, and what came just before and just after each string, which is how code is told from copy.
 */
export function literalsOf(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  /* The last two significant tokens, and the brace depth with the key open at each depth. */
  let last = '';
  let before = '';
  let depth = 0;
  /* How many `(` and `[` are open: a comma inside a call or an array does not end the key's value. */
  let nest = 0;
  const keys = new Map();
  const keyAt = () => keys.get(depth)?.word ?? null;
  const endKey = () => keys.get(depth)?.nest === nest && keys.delete(depth);
  /* One entry per open `(`: whether it is a method's call (`.join(`), whose arguments are code. */
  const parens = [];
  /* One entry per open template: its text so far, its line, and the brace depth inside its open `${`. */
  const templates = [];
  const push = (tok) => ((before = last), (last = tok));
  const skipSpace = (at) => {
    for (;;) {
      while (at < n && /\s/.test(source[at])) at++;
      if (source.startsWith('//', at)) at = source.indexOf('\n', at) === -1 ? n : source.indexOf('\n', at);
      else if (source.startsWith('/*', at)) at = source.indexOf('*/', at) === -1 ? n : source.indexOf('*/', at) + PAIR;
      else return at;
    }
  };
  const nextToken = (at) => {
    const j = skipSpace(at);
    if (!OPERATOR.test(source[j] ?? '')) return source[j] ?? '';
    let k = j;
    while (k < n && OPERATOR.test(source[k])) k++;
    return source.slice(j, k);
  };
  /* What stood before a string as it opened: a template's closing backtick comes after its own `${…}` tokens. */
  const context = () => ({ last, before, key: keyAt(), method: parens.at(-1) === true, line });
  /* Whether a string whose context is `at` and which ends at `end` is copy; when it is, it is kept. */
  const take = (text, at, end) => {
    const next = nextToken(end);
    const { last: l, before: b } = at;
    const code =
      (next === ':' && (l === '{' || l === ',')) ||
      l === 'from' || l === 'import' || (l === '(' && b === 'import') ||
      l === 'case' || COMPARES.has(l) || COMPARES.has(next) || l === '|' || next === '|' ||
      (l === '[' && (WORD.test(b.at(-1) ?? '') || b === ')' || b === ']') && !BEFORE_REGEX.has(b)) ||
      ((l === '(' || l === ',') && at.method);
    if (next === ':' && (l === '{' || l === ',')) keys.set(depth, { word: text, nest });
    else if (!code) out.push({ text, line: at.line, key: at.key });
  };
  /* `i` is just past a backtick or the `}` closing a `${`: read on to the closing backtick or the next `${`. */
  const readTemplate = (t) => {
    while (i < n) {
      const c = source[i];
      if (c === '\\') (t.text += source.slice(i, i + PAIR)), (i += PAIR);
      else if (c === '`') {
        i++;
        templates.pop();
        take(unescape(t.text), t.at, i);
        push('literal');
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        i += PAIR;
        t.text += '{}';
        t.depth = 0;
        push('{');
        return;
      } else {
        if (c === '\n') line++;
        t.text += c;
        i++;
      }
    }
  };

  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (c === '\n') {
      line++;
      i++;
    } else if (c === '/' && d === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? n : end;
    } else if (c === '/' && d === '*') {
      const end = source.indexOf('*/', i + PAIR);
      const to = end === -1 ? n : end + PAIR;
      for (let k = i; k < to; k++) if (source[k] === '\n') line++;
      i = to;
    } else if (c === "'" || c === '"') {
      const at = context();
      const start = ++i;
      while (i < n && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? PAIR : 1;
      const text = unescape(source.slice(start, i));
      i++;
      take(text, at, i);
      push('literal');
    } else if (c === '`') {
      i++;
      const t = { text: '', at: context(), depth: 0 };
      templates.push(t);
      readTemplate(t);
    } else if (c === '{') {
      if (templates.length) templates.at(-1).depth++;
      depth++;
      push('{');
      i++;
    } else if (c === '}') {
      if (templates.length && templates.at(-1).depth === 0) {
        i++;
        readTemplate(templates.at(-1));
        continue;
      }
      if (templates.length) templates.at(-1).depth--;
      keys.delete(depth);
      depth--;
      endKey();
      push('}');
      i++;
    } else if (c === '(' || c === '[') {
      if (c === '(') parens.push(before === '.' && WORD.test(last.at(-1) ?? ''));
      nest++;
      push(c);
      i++;
    } else if (c === ')' || c === ']') {
      if (c === ')') parens.pop();
      nest--;
      push(c);
      i++;
    } else if (c === ',') {
      endKey();
      push(',');
      i++;
    } else if (c === '/' && (last === '' || /^[(,=:[!&|?{};+\-*%<>~^]+$/.test(last) || BEFORE_REGEX.has(last))) {
      /* A regular expression: its body is code, and a quote inside it opens nothing. */
      i++;
      let inClass = false;
      while (i < n && source[i] !== '\n') {
        const r = source[i];
        if (r === '\\') i += PAIR;
        else if (r === '[') (inClass = true), i++;
        else if (r === ']') (inClass = false), i++;
        else if (r === '/' && !inClass) {
          i++;
          break;
        } else i++;
      }
      push('literal');
    } else if (WORD.test(c)) {
      const start = i;
      while (i < n && WORD.test(source[i])) i++;
      const word = source.slice(start, i);
      /* `key:` opens the value of `key` at this depth, unless it is a ternary's or a type's colon. */
      if (nextToken(i) === ':' && (last === '{' || last === ',')) keys.set(depth, { word, nest });
      push(word);
    } else if (OPERATOR.test(c)) {
      const start = i;
      while (i < n && OPERATOR.test(source[i])) i++;
      push(source.slice(start, i));
    } else {
      if (!/\s/.test(c)) push(c);
      i++;
    }
  }
  return out;
}

/** The list, read and compiled. A list that does not read is a throw, never an empty list that passes everything. */
export function readList(at = join(here, 'words.json')) {
  const list = JSON.parse(readFileSync(at, 'utf8'));
  const words = list.words.map((w) => ({
    ...w,
    re: new RegExp(w.shape, w.case ? 'u' : 'iu'),
    forgive: w.unless ? new RegExp(w.unless, 'u') : null,
  }));
  return { ...list, words, titleKey: new RegExp(list.titles.keys, 'i') };
}

/** The entries the page lint reads, in the shape `lint.ts` holds them. */
export const pageWords = (list) =>
  list.words.filter((w) => w.page).map((w) => ({ name: w.name, shape: w.shape, ...(w.case ? { case: true } : {}) }));

/** What one string breaks: one finding a rule, each `{ rule, say }`. */
export function breaks(list, { text, key }) {
  const out = [];
  for (const w of list.words) if (w.re.test(text) && !(w.forgive && w.forgive.test(text))) out.push({ rule: w.name, say: w.say });
  const end = text.trimEnd();
  if (key && list.titleKey.test(key) && end.endsWith('.') && !end.endsWith('..')) out.push({ rule: 'a title that ends in a full stop', say: list.titles.say });
  return out;
}

/** The copy files under `root`, repository-relative: `lib/copy/*.ts`, `lib/first-run.ts`, `routes/<screen>/words.ts`. */
export function copyFiles(root) {
  const web = 'apps/web/src';
  const files = [];
  const dir = (rel) => {
    try {
      return readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return [];
    }
  };
  for (const e of dir(`${web}/lib/copy`)) if (e.isFile() && /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) files.push(`${web}/lib/copy/${e.name}`);
  if (existsSync(join(root, web, 'lib/first-run.ts'))) files.push(`${web}/lib/first-run.ts`);
  for (const e of dir(`${web}/routes`)) if (e.isDirectory() && existsSync(join(root, web, 'routes', e.name, 'words.ts'))) files.push(`${web}/routes/${e.name}/words.ts`);
  return files.sort();
}

/**
 * Which files are red and which held counts can come down, from each file's count of findings. A file above its held
 * count is red whole, every finding in it printed, since which of them is the new one is not knowable from a count.
 */
export function judge(counts, held) {
  const over = [...counts].filter(([rel, n]) => n > (held[rel]?.count ?? 0)).map(([rel]) => rel);
  const down = Object.entries(held)
    .filter(([rel, h]) => (counts.get(rel) ?? 0) < h.count)
    .map(([rel, h]) => ({ rel, held: h.count, now: counts.get(rel) ?? 0 }));
  return { over, down };
}

/**
 * THE CHECK IS A FUNCTION, and `run.mjs` imports it rather than spawning this file (`em-dash`'s header holds why).
 * The root is an argument, `BRAINDOG_GATE_ROOT` in a planted run, and `held` is read only when the root is this
 * repository: a planted tree is judged whole.
 */
export default async function wordsGate(root = process.env.BRAINDOG_GATE_ROOT ?? process.cwd(), listAt) {
  const ROOT = resolve(root);
  const list = readList(listAt);
  const files = copyFiles(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is this directory's word for "could not run". */
  if (files.length === 0) {
    console.log(`  words: no copy file (apps/web/src/lib/copy, lib/first-run.ts, routes/*/words.ts) under ${ROOT}, so nothing was read`);
    return 3;
  }
  const held = ROOT === REPO ? (list.held ?? {}) : {};
  const findings = [];
  const counts = new Map();
  let strings = 0;
  for (const rel of files) {
    const found = literalsOf(readFileSync(join(ROOT, rel), 'utf8'));
    strings += found.length;
    for (const lit of found)
      for (const b of breaks(list, lit)) {
        findings.push({ rel, line: lit.line, ...b, text: lit.text });
        counts.set(rel, (counts.get(rel) ?? 0) + 1);
      }
  }

  /* THE PAGE LINT SAYS THE SAME: its plain-words list is this list's page entries, word for word. */
  const lint = await import(pathToFileURL(join(REPO, 'packages/render/src/lint.ts')).href);
  const drift = JSON.stringify(lint.PAGE_WORDS) !== JSON.stringify(pageWords(list));

  const { over, down } = judge(counts, held);
  const red = findings.filter((f) => over.includes(f.rel));
  const heldNow = Object.keys(held).reduce((s, rel) => s + Math.min(counts.get(rel) ?? 0, held[rel].count), 0);

  for (const f of red) console.error(`  ${f.rel}:${f.line}\n      ${f.rule}: "${f.text}". Say ${f.say}.`);
  if (drift) console.error('  packages/render/src/lint.ts\n      PAGE_WORDS is not the page entries of tools/gates/words.json. Copy them across, word for word.');
  if (down.length) {
    console.log('  words: these held files have fewer findings now. Lower or remove their entries in words.json held:');
    for (const d of down) console.log(`  ${d.rel}: held ${d.held}, now ${d.now}`);
  }
  const many = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const said = `${many(files.length, 'copy file')}, ${many(strings, 'string')}, ${heldNow} held in ${many(Object.keys(held).length, 'file')}`;
  if (red.length === 0 && !drift) {
    console.log(`  words: 0 words a person must never read, over ${said}`);
  } else {
    console.error(`\n  words: ${red.length + (drift ? 1 : 0)} finding(s) over ${said}. Each says the word to use instead, from tools/gates/words.json.`);
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, for `self-test`, which spawns each gate against a planted tree. */
if (import.meta.main) process.exitCode = (await wordsGate(process.argv[2])) ?? 0;
