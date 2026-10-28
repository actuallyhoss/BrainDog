/**
 * `words`: the house words, held by a check.
 *
 *   node tools/gates/words.mjs [root]
 *
 * THE WORDS A PERSON MUST NEVER READ ARE A LIST, AND THE LIST IS `words.json` BESIDE THIS FILE. Each entry is a word or
 * a shape (row, credential, register as a noun, an id in a sentence, the long dash), what to say in its place and why.
 * The page lint (`packages/render/src/lint.ts`, `plain-words` and `system-word`) carries the entries whose `page` names
 * one of its rules, and its `one-word-button` the approved `buttons`, held equal to them below, so the page a person
 * reads and the source the app ships are judged by one list.
 *
 * WHAT IS READ IS WHAT A SCREEN PRINTS: the string values of every copy object the app ships. That is
 * `apps/web/src/lib/copy/*.ts`, `apps/web/src/lib/first-run.ts` and each `apps/web/src/routes/<screen>/words.ts`.
 * Comments are not read, and neither are the parts of a source that are code rather than copy: an object's quoted key,
 * a module's address, a value compared with `===` or matched by `case`, a type's union of literals, an index, and the
 * argument of a method call (`.join(', ')`, `.toLocaleString('en-GB')`). A template is read with each `${…}` as `{}`.
 *
 * AND THE WORDS A SVELTE FILE KEEPS INLINE: a `.svelte` under `apps/web/src` that holds its copy in its own script,
 * as `const words = { … }` or `const <name>Words = { … }`, is read there, that object and nothing else of the file, by the
 * same lexer, so copy kept in a component rather than in `lib/copy` is still judged. And the `label` of each key the
 * keyboard sheet lists (`lib/a11y/bindings.ts`), whose other values are ids.
 *
 * AND WHAT A DECLARED PAGE PRINTS: the `title`, `heading`, `label`, `body` and `empty` of every page the
 * seed declares (`packages/seed/src`) and every add-on in `packs/` (its `*.pack.json`), read by the same lexer. Only
 * those five keys are read there, since a declaration's other strings are its ids and sources; and inside them a
 * figure's `{{path}}` and a link's address are code.
 *
 * THE WRITING GUIDE IS THIS LIST, printed: `docs/54-WRITING.md` is made from `words.json` by `words-guide.mjs`, and the
 * gate's test fails the day the page and the list disagree.
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
  list.words.filter((w) => w.page).map((w) => ({ name: w.name, shape: w.shape, ...(w.case ? { case: true } : {}), rule: w.page }));

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

/** Files whose `label` values a screen prints beside their code: the keyboard sheet's list of keys. */
const LABEL_FILES = ['apps/web/src/lib/a11y/bindings.ts'];

/** Where a `const words = {` or `const <name>Words = {` opens, in a Svelte source's scripts. */
const WORDS_OBJECT = /\bconst\s+(?:words|[A-Za-z_$][\w$]*Words)\s*(?::[^=]+)?=\s*\{/g;

/**
 * The text of the object whose `{` is at `start`, to its matching `}`: strings, templates and their `${…}`, and both
 * comment forms are stepped over, so a brace inside a string never ends it. `null` when it never closes.
 */
function objectAt(source, start) {
  const n = source.length;
  const stack = [];
  let i = start;
  while (i < n) {
    const c = source[i];
    if (stack.at(-1) === '`') {
      if (c === '\\') i += PAIR;
      else if (c === '`') stack.pop(), i++;
      else if (c === '$' && source[i + 1] === '{') stack.push('${'), (i += PAIR);
      else i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      const e = source.indexOf('\n', i);
      i = e === -1 ? n : e;
    } else if (c === '/' && source[i + 1] === '*') {
      const e = source.indexOf('*/', i + PAIR);
      i = e === -1 ? n : e + PAIR;
    } else if (c === "'" || c === '"') {
      i++;
      while (i < n && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? PAIR : 1;
      i++;
    } else if (c === '`') stack.push('`'), i++;
    else if (c === '{') stack.push('{'), i++;
    else if (c === '}') {
      stack.pop();
      i++;
      if (stack.length === 0) return source.slice(start, i);
    } else i++;
  }
  return null;
}

/**
 * The strings of every inline words object in a Svelte source, each with its line in the whole file. Only the scripts
 * are read, and in them only those objects: the markup and the rest of the script are code, or draw from them.
 */
export function svelteStrings(source) {
  const out = [];
  for (const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = m[1];
    const bodyAt = m.index + m[0].indexOf('>') + 1;
    for (const w of body.matchAll(WORDS_OBJECT)) {
      const open = w.index + w[0].length - 1;
      const obj = objectAt(body, open);
      if (obj === null) continue;
      const before = source.slice(0, bodyAt + open).split('\n').length - 1;
      for (const lit of literalsOf(`const words = ${obj};`)) out.push({ ...lit, line: lit.line + before });
    }
  }
  return out;
}

/** The Svelte files under `root` that keep words inline, repository-relative. */
export function svelteFiles(root) {
  const files = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries)
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else if (/\.svelte$/.test(e.name) && svelteStrings(readFileSync(join(root, rel, e.name), 'utf8')).length) files.push(`${rel}/${e.name}`);
  };
  walk('apps/web/src');
  return files.sort();
}

/** The keys whose values a declared page prints: a page's or a block's title, heading, label, body and empty text. */
const PAGE_KEYS = new Set(['title', 'heading', 'label', 'body', 'empty']);

/**
 * The files that declare pages under `root`, repository-relative: every source of the seed (`packages/seed/src`, its
 * tests aside) and each add-on's `packs/<name>/<name>.pack.json`. A pack file is JSON, which the lexer reads as it reads
 * an object in a source: a quoted key and its value.
 */
export function pageFiles(root) {
  const files = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries)
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else if (/\.ts$/.test(e.name) && !/\.(?:test|d)\.ts$/.test(e.name)) files.push(`${rel}/${e.name}`);
  };
  walk('packages/seed/src');
  let packs = [];
  try {
    packs = readdirSync(join(root, 'packs'), { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {}
  for (const d of packs)
    for (const f of readdirSync(join(root, 'packs', d.name))) if (/\.pack\.json$/.test(f)) files.push(`packs/${d.name}/${f}`);
  return files.sort();
}

/* A span in backticks and a type's angle brackets, its name before them and nested (`Record<string, Row>`): code, which
   the page draws as code and the page lint never reads (`notCode` in lint.ts). */
const CODE_SPAN = /`[^`\n]+`/g;
const TYPE_ARGS = /(?<![\w$])[A-Za-z_$][\w$.]*<[^<>\n]*>/g;
const notCode = (s) => {
  let t = s.replace(CODE_SPAN, ' ');
  for (let was = ''; was !== t; ) (was = t), (t = t.replace(TYPE_ARGS, ' '));
  return t;
};

/**
 * What a declared page prints from one file: the value of each page key, wherever it sits. A figure's `{{path}}` is read
 * as `{}`, and a link's address, a span in backticks and a type's angle brackets are dropped, since each is code inside
 * the copy (`{{bills.rows}}`, `[Bills](/r/bills)`, `` `rows` ``, `Promise<Row>`).
 */
export const pageStrings = (source) => {
  /* A list's `title` names the field its things are titled by (`"title": "host"`): a field's id, code, not words. */
  const ids = new Set([...source.matchAll(/["']?\bid["']?\s*:\s*["']([a-z][a-z0-9_]*)["']/g)].map((m) => m[1]));
  return literalsOf(source)
    .filter((l) => PAGE_KEYS.has(l.key) && !(l.key === 'title' && ids.has(l.text)))
    .map((l) => ({ ...l, text: notCode(l.text.replace(/\{\{[^{}]*\}\}/g, '{}').replace(/\]\([^)\s]*\)/g, ']')) }));
};

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
  const pages = pageFiles(ROOT);
  const svelte = svelteFiles(ROOT);
  const labels = LABEL_FILES.filter((rel) => existsSync(join(ROOT, rel)));
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is this directory's word for "could not run". */
  if (files.length + pages.length + svelte.length + labels.length === 0) {
    console.log(`  words: no copy file (apps/web/src/lib/copy, lib/first-run.ts, routes/*/words.ts) and no declared page (packages/seed/src, packs/*/*.pack.json) under ${ROOT}, so nothing was read`);
    return 3;
  }
  const held = ROOT === REPO ? (list.held ?? {}) : {};
  const findings = [];
  const counts = new Map();
  let strings = 0;
  const read = (rel, found) => {
    strings += found.length;
    for (const lit of found)
      for (const b of breaks(list, lit)) {
        findings.push({ rel, line: lit.line, ...b, text: lit.text });
        counts.set(rel, (counts.get(rel) ?? 0) + 1);
      }
  };
  for (const rel of files) read(rel, literalsOf(readFileSync(join(ROOT, rel), 'utf8')));
  for (const rel of pages) read(rel, pageStrings(readFileSync(join(ROOT, rel), 'utf8')));
  for (const rel of svelte) read(rel, svelteStrings(readFileSync(join(ROOT, rel), 'utf8')));
  for (const rel of labels) read(rel, literalsOf(readFileSync(join(ROOT, rel), 'utf8')).filter((l) => l.key === 'label'));

  /* THE PAGE LINT SAYS THE SAME: its plain-words and system-word lists are this list's page entries, and its one-word
     buttons this list's buttons, word for word. */
  const lint = await import(pathToFileURL(join(REPO, 'packages/render/src/lint.ts')).href);
  const drift =
    JSON.stringify(lint.PAGE_WORDS) !== JSON.stringify(pageWords(list)) || JSON.stringify(lint.BUTTON_WORDS) !== JSON.stringify(list.buttons);

  const { over, down } = judge(counts, held);
  const red = findings.filter((f) => over.includes(f.rel));
  const heldNow = Object.keys(held).reduce((s, rel) => s + Math.min(counts.get(rel) ?? 0, held[rel].count), 0);

  for (const f of red) console.error(`  ${f.rel}:${f.line}\n      ${f.rule}: "${f.text}". Say ${f.say}.`);
  if (drift) console.error('  packages/render/src/lint.ts\n      PAGE_WORDS or BUTTON_WORDS is not the page entries or the buttons of tools/gates/words.json. Copy them across, word for word.');
  if (down.length) {
    console.log('  words: these held files have fewer findings now. Lower or remove their entries in words.json held:');
    for (const d of down) console.log(`  ${d.rel}: held ${d.held}, now ${d.now}`);
  }
  const many = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const said = `${many(files.length + svelte.length + labels.length, 'copy file')} and ${many(pages.length, 'file')} of declared pages, ${many(strings, 'string')}, ${heldNow} held in ${many(Object.keys(held).length, 'file')}`;
  if (red.length === 0 && !drift) {
    console.log(`  words: 0 words a person must never read, over ${said}`);
  } else {
    console.error(`\n  words: ${red.length + (drift ? 1 : 0)} finding(s) over ${said}. Each says the word to use instead, from tools/gates/words.json.`);
    return 1;
  }
}

/* AND IT IS STILL A SCRIPT, for `self-test`, which spawns each gate against a planted tree. */
if (import.meta.main) process.exitCode = (await wordsGate(process.argv[2])) ?? 0;
