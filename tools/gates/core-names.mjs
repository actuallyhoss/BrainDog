/**
 * `core-names`: the core's code spells no name an add-on or a use case declares.
 *
 *   node tools/gates/core-names.mjs [root]
 *
 * THE DIRECTION'S WORDS (D29.52): nothing in `packages/` or `apps/` names one person's bank, their Shortcut or the
 * tools of their own record. The unit is SHL-A01 in `loop/scope/area-shell-a.md`.
 *
 * IT READS THE NAMES, NOT A LIST OF WORDS. `shell-words` holds a list somebody wrote, and a list somebody wrote knows
 * the add-ons of the day it was written: it has `gold` and `mercury`, and nothing for the list an add-on declared last
 * week. This gate reads what the add-ons themselves declare, every `packs/<id>/<id>.pack.json` and every use case
 * file, and collects four kinds of name:
 *   - an add-on's id, and the ids of the add-ons it asks for;
 *   - a list's id, wherever a declaration names one under `register`;
 *   - a field's id, when it is longer than five letters and one add-on alone declares it;
 *   - a figure's id, under `metric`.
 * Then it reads the code the core ships, the same files `shell-words` reads, and a name is a finding where a string
 * spells it or where it follows `register.`.
 *
 * A STRING, AND NOT AN IDENTIFIER, because the names are ordinary words. A list is called `tasks` and a field `amount`,
 * and a kernel that has a variable called `tasks` has named nothing of anybody's: what makes a branch nobody else can
 * declare is `list === 'tasks'`, and that is a string. `register.tasks` is read outside strings too, because that is
 * how a list is addressed everywhere else.
 *
 * AND A STRING WITH NO SPACE IN IT. `'tasks'`, `'register.tasks'`, `'tasks:one'` and `'/tasks/'` are ids, and code
 * branches on an id. `'No tasks yet.'` is a sentence: it is copy, which `words` and `web-lists` read, and a branch is
 * never taken on a sentence. Measured on 13 October: with sentences read the tree held 5815 places, 2336 of them a
 * field id that is also an English word (`status` 482 times, `question` 392), and without them 3287.
 *
 * AT A PART BOUNDARY, AND WHOLE. A string is split into parts the way `shell-words` splits a token, and a name is a
 * hit where a run of neighbouring parts, joined, EQUALS it. `shell-words` asks only that a part start with the word,
 * which is right for `egypt` in `Egyptian` and wrong here: a list called `notes` is not named by `notebook`, and
 * `gold` is not named by `golden`. A name's own separators do not count, so `cash_counts` is spelled by `cashCounts`.
 *
 * FIELD IDS ARE THE FLOOD, and two rules hold it. Five letters or fewer is out (`name`, `state`, `total`), and so is an
 * id two or more add-ons declare (`amount`, `account`), because a word every add-on reaches for is the language's and
 * not one add-on's. THE UNIT NAMES THE SIGN THAT THE RULES HAVE FAILED, OVER 300 HITS, AND THE TREE IS PAST IT: both
 * rules are on, and field ids are still about a third of what the held list holds, `status` first. The unit gives no
 * third rule, so none is made up here; the count is said in the green line every run.
 *
 * A WORD THE KERNEL ITSELF DECLARES IS NOT A USE CASE'S NAME (`kernelWords`). An add-on calls a list `lines` and a
 * field `progress`, and the kernel has drawn a block of kind `lines` and one of kind `progress` since before either
 * add-on was written: `kind === 'progress'` in the renderer names the kernel's block and nobody's field. So the words
 * of the kernel's own grammar are read off the kernel, never listed here: every word in a list the grammar's files
 * declare under a name in capitals (`BLOCK_KINDS`, `FIELD_TYPES`, `REGISTER_KEYS`, `ANSWER_KEYS` and their kind), and
 * each kind a money value is answered as (`kind: 'parts'` in `fx.ts`). A string that spells one of those is not a
 * finding. WHAT FOLLOWS `register.` STILL IS, whatever the word: `register.lines` addresses a list, and no block kind
 * is addressed that way. The price is said plainly: an add-on or a list whose id is also a kernel word (`roadmap`,
 * `stripe`, `fx`) is seen only where it is addressed, since a bare `'roadmap'` cannot be told from the block kind.
 *
 * A CLASS NAME IS NOT A REFERENCE. In a `.svelte` file the style block and the fixed value of `class`, `id`, `for`,
 * `role` and the three `aria-` attributes that point at an id are the page's own markup: a tile with `class="work"`
 * branches on nothing, and `role="status"` is the browser's word. Any other attribute is still read: `data-list="tasks"`
 * and `href="/r/tasks"` are how a page would name a list. AN IMPORT IS STILL READ, because `from '../work/list.ts'` is
 * exactly how the core wires in one add-on by name.
 *
 * A DECLARATION IS NOT THE CORE (`declarationsOf`). Until SHL-A15 and SHL-A17 an add-on and a use case are TypeScript
 * in the seed, under `packages/`, and that text is the same thing a `packs/<id>/<id>.pack.json` is: the place a name
 * is made. `pack: 'money-core'` there, a list's own id and `to: 'accounts'` on its field name nothing of anybody
 * else's, so a file that says whose it is (`pack: '<id>'`, `usecase: '<id>'`) is not read for names, and neither is the
 * rest of its folder. ANOTHER ADD-ON'S LIST SPELLED THERE IS LEFT TOO, and that was weighed: on 13 October the seed's
 * 61 declaration files held 1,280 places, 1,076 of them their own names, and the other 204 were a link to a
 * neighbour's list (`to: 'things'`, `source: 'register.tasks'`, `requires:`, `modules:`), a label (`'Status'`) or
 * a longer word (`'due-items-30d'`). One add-on leaning on another is a thing a declaration says, under `requires`, and whether
 * it may is the declaration checker's to judge; what this unit guards is that the code that RUNS declarations knows
 * none of them, and no pack file under `packs/` was ever read for it either. A file beside the declarations that says
 * neither key, the installer or the table of names, is that code and is read like the kernel.
 *
 * THE HELD LIST IS A FILE, `core-names.held.json`, one entry a line: the path, the name, why, and the unit that takes
 * it out. It was generated once, from this gate's own reading on 13 October, and this gate cannot write it. An entry
 * whose path no longer spells its name is a finding, so the list only shrinks. That it never grows is the ledger's
 * rule: the list is exported as `HELD`, and `ledger.json` holds `core-names.HELD` at its newest line.
 *
 * AN ENTRY HOLDS A NAME IN A FILE, NOT A COUNT OF PLACES. A count was tried the same day and taken out: a third of
 * what is held is a field id that is also a word of the language, and a count would have gone red on every
 * `'status'` anybody wrote in a file that already had one. What a count would have caught, a second `'tasks'` in a
 * kernel file held for its first, is the unit's to end, by taking the entry out.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';
import { hashedIn, partsOf, uncomment } from './shell-words.mjs';

/** A field id this short is a common word, and is left out of the field pass. */
const SHORT = 5;

/** The exit of a gate that read nothing, as every gate in this directory writes it. */
const COULD_NOT_RUN = 3;

/** The four kinds, in the order one name is said by when two kinds hold it. */
const KINDS = ['add-on', 'list', 'figure', 'field'];

/** A name as it is matched: case-folded, its own separators gone. */
export const fold = (name) => partsOf(name).join('');

/** One name a declaration holds: what it is, and which add-on or use case said it. */
const say = (found, kind, name, by) => {
  if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name)) return;
  found.push({ kind, name, by });
};

/**
 * THE NAMES ONE JSON DOCUMENT DECLARES, a pack or a use case file. Read by key wherever the key stands, because a list
 * is named in a rule's `on`, a page's `for` and a field's link as much as in the declaration that makes it.
 */
export function namesOfDocument(doc, by, found = []) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'register' && typeof value === 'string') say(found, 'list', value, by);
      else if (key === 'metric' && typeof value === 'string') say(found, 'figure', value.split(':')[0], by);
      else if (key === 'fields' && Array.isArray(value) && typeof node.register === 'string')
        for (const f of value) if (f !== null && typeof f === 'object') say(found, 'field', f.id, by);
      else if (key === 'modules' && Array.isArray(value)) for (const m of value) say(found, 'add-on', m, by);
      walk(value);
    }
  };
  say(found, 'add-on', doc?.pack, by);
  say(found, 'add-on', doc?.usecase, by);
  for (const id of Object.keys(doc?.requires?.packs ?? {})) say(found, 'add-on', id, by);
  walk(doc);
  return found;
}

/**
 * THE NAMES ONE USE CASE DECLARES IN CODE, read off its text. Until SHL-A17 a use case is a TypeScript file in the
 * seed, an object literal with the same keys the file format has, so the keys are read where they are written:
 * `usecase:`, `pack:`, `modules: [...]`, `register:`, `metric:` and a field's `id:`. Comments are blanked first.
 * A file with no `usecase: '<id>'` of its own is a helper beside the use cases and declares nothing.
 */
export function namesOfSource(source, found = []) {
  const text = uncomment(source);
  const by = /\busecase:\s*'([a-z][a-z0-9-]*)'/.exec(text)?.[1];
  if (!by) return found;
  say(found, 'add-on', by, by);
  for (const m of text.matchAll(/\bpack:\s*'([^'\n]+)'/g)) say(found, 'add-on', m[1], by);
  for (const m of text.matchAll(/\bmodules:\s*\[([^\]]*)\]/g))
    for (const q of m[1].matchAll(/'([^'\n]+)'/g)) say(found, 'add-on', q[1], by);
  for (const m of text.matchAll(/\bregister:\s*'([^'\n]+)'/g)) say(found, 'list', m[1], by);
  for (const m of text.matchAll(/\bmetric:\s*'([^'\n]+)'/g)) say(found, 'figure', m[1].split(':')[0], by);
  for (const m of text.matchAll(/\bid:\s*'([^'\n]+)'/g)) say(found, 'field', m[1], by);
  return found;
}

/** Where a use case is written: the seed's TypeScript today, and `usecases/<id>/<id>.usecase.json` once SHL-A17 lands. */
const USE_CASE_SOURCE = 'packages/seed/src/usecases';
const USE_CASE_FILES = 'usecases';

const dirs = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !skipDir(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
};

/**
 * EVERY NAME THE ADD-ONS AND USE CASES UNDER ONE ROOT DECLARE, keyed by its folded form. A file that is there and
 * cannot be read is a throw, never a file with no names: a pack read as empty would pass every name it declares.
 */
export function collect(root) {
  const found = [];
  let files = 0;
  for (const id of dirs(join(root, 'packs'))) {
    const file = join(root, 'packs', id, `${id}.pack.json`);
    if (!existsSync(file)) continue;
    namesOfDocument(JSON.parse(readFileSync(file, 'utf8')), id, found);
    files++;
  }
  for (const id of dirs(join(root, USE_CASE_FILES))) {
    const file = join(root, USE_CASE_FILES, id, `${id}.usecase.json`);
    if (!existsSync(file)) continue;
    namesOfDocument(JSON.parse(readFileSync(file, 'utf8')), id, found);
    files++;
  }
  let sources = [];
  try {
    sources = readdirSync(join(root, USE_CASE_SOURCE)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
  } catch {
    /* A tree with no seed has its use cases as files, read above. */
  }
  for (const f of sources) {
    const before = found.length;
    namesOfSource(readFileSync(join(root, USE_CASE_SOURCE, f), 'utf8'), found);
    if (found.length > before) files++;
  }

  /* WHO DECLARES EACH FIELD, counted before anything is dropped, for the rule about a word every add-on reaches for. */
  const fieldBy = new Map();
  for (const f of found) if (f.kind === 'field') fieldBy.set(fold(f.name), (fieldBy.get(fold(f.name)) ?? new Set()).add(f.by));

  const names = new Map();
  for (const kind of KINDS)
    for (const f of found) {
      if (f.kind !== kind) continue;
      const key = fold(f.name);
      if (kind === 'field' && (f.name.length <= SHORT || fieldBy.get(key).size > 1)) continue;
      const held = names.get(key);
      if (!held) names.set(key, { name: f.name, kind, by: new Set([f.by]) });
      else if (held.kind === kind) held.by.add(f.by);
    }
  return { names, files };
}

/** Where the kernel writes its grammar: the lists a declaration is checked against, and the kinds a money value is answered as. */
const GRAMMAR = ['packages/kernel/src/declare.ts', 'packages/kernel/src/block-keys.ts', 'packages/kernel/src/coerce.ts'];
const VALUE_KINDS = ['packages/kernel/src/fx.ts'];

/**
 * THE WORDS THE KERNEL DECLARES FOR ITSELF, folded, read off its own source under one root. From a grammar file,
 * every one-word string in a list or a set a module-level constant in capitals is given (`const BLOCK_KINDS = [`,
 * `export const FIELD_TYPES = [`, `new Set([`), nested lists and spreads included, to the bracket that closes it. From
 * a value file, each `kind: '<word>'` a type or an answer says. A tree with no kernel declares none, so a planted tree
 * is read exactly as before.
 */
export function kernelWords(root) {
  const words = new Set();
  const textOf = (path) => (existsSync(join(root, path)) ? uncomment(readFileSync(join(root, path), 'utf8')) : '');
  for (const path of GRAMMAR) {
    const text = textOf(path);
    for (const m of text.matchAll(/^(?:export )?const [A-Z][A-Z0-9_]*\b[^=\n]*=\s*(?:new Set(?:<[^>\n]*>)?\(\s*)?\[/gm)) {
      let i = m.index + m[0].length;
      const from = i;
      for (let depth = 1; i < text.length && depth > 0; i++) depth += text[i] === '[' ? 1 : text[i] === ']' ? -1 : 0;
      for (const q of text.slice(from, i).matchAll(/'([A-Za-z][A-Za-z0-9_-]*)'/g)) words.add(fold(q[1]));
    }
  }
  for (const path of VALUE_KINDS) for (const q of textOf(path).matchAll(/\bkind: '([a-z][a-z0-9_-]*)'/g)) words.add(fold(q[1]));
  return words;
}

/** The files a core package ships, as `shell-words` reads them: `src` and what sits beside it, without tests. */
const READ = { packages: ['src', 'grammars', 'svelte'], apps: ['src', 'scripts'] };
const SOURCE = /\.(ts|mts|js|mjs|svelte)$/;
const TEST = /\.test\.(ts|mts|js|mjs)$/;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries.sort()) {
    if (skipDir(name) || name === 'test') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !TEST.test(name)) out.push(full);
  }
  return out;
}

/** The shipped source under one root, as paths from it, in a fixed order. */
export function sourcesOf(root) {
  const files = [];
  for (const workspace of Object.keys(READ))
    for (const member of dirs(join(root, workspace)).sort())
      for (const dir of READ[workspace]) walk(join(root, workspace, member, dir), files);
  return files.map((f) => relative(root, f).replace(/\\/g, '/'));
}

/** Where the seed writes an add-on or a use case in TypeScript, until each is a file under `packs/` or `usecases/`. */
const DECLARED_IN = ['packages/seed/src/modules', 'packages/seed/src/packs', USE_CASE_SOURCE];

/** What a declaration says of itself: whose it is, as a key with an id for its value. `pack: {` and `pack: string` are neither. */
const DECLARES = /\b(?:pack|usecase):\s*'[a-z][a-z0-9-]*'/;

/**
 * THE SHIPPED FILES THAT ARE AN ADD-ON'S OR A USE CASE'S OWN DECLARATION, out of `sources`. One thing directly under a
 * directory of `DECLARED_IN` is one add-on's writing, a file (`work.ts`, `founder.ts`) or a folder (`money/`, with its
 * lists, figures and pages), and it is a declaration when a file of it says whose it is, outside a comment. A folder
 * is taken whole, because the file that holds a figure's arithmetic says `pack:` nowhere and is the add-on's all the
 * same. A file that says neither (`install.ts`, `names.ts`, `first-party.ts`) is code that runs the declarations, and
 * is the core.
 */
export function declarationsOf(root, sources) {
  const units = new Map();
  for (const path of sources) {
    const dir = DECLARED_IN.find((d) => path.startsWith(`${d}/`));
    if (dir === undefined) continue;
    const unit = `${dir}/${path.slice(dir.length + 1).split('/')[0]}`;
    if (!units.has(unit)) units.set(unit, { files: [], declares: false });
    const u = units.get(unit);
    u.files.push(path);
    u.declares ||= DECLARES.test(uncomment(readFileSync(join(root, path), 'utf8')));
  }
  return new Set([...units.values()].filter((u) => u.declares).flatMap((u) => u.files));
}

/** A token is a run of the characters an identifier or a slug is written in, separators included. */
const TOKEN = /[A-Za-z0-9_$][A-Za-z0-9_$.-]*/g;

/**
 * The names one token spells: each one a run of its parts, joined, equals. THE LONGEST AT ONE PLACE, for the reason
 * `shell-words` gives: `money-core` is one add-on's id, and is not also a spelling of whatever is called `money`.
 * Parts are never empty, so a run grows at every step and is tried once at each length.
 */
export function namesIn(token, names) {
  const parts = partsOf(token);
  const found = [];
  for (let i = 0; i < parts.length; i++) {
    let run = '';
    let longest = null;
    for (let j = i; j < parts.length; j++) {
      run += parts[j];
      if (names.has(run)) longest = run;
    }
    if (longest !== null && !found.includes(longest)) found.push(longest);
  }
  return found;
}

/** What follows `register.` is a list's id as it is addressed, read anywhere in code. */
const ADDRESSED = /\bregister\.([A-Za-z][A-Za-z0-9_-]*)/g;

/** The same text with a stretch of it blanked, its length and its line breaks kept, so every place after it stands where it stood. */
const blank = (s) => s.replace(/[^\n]/g, ' ');

/** A `.svelte` file's style block, and the fixed value of an attribute that names a class or an id and never a list. */
const STYLE = /<style\b[^>]*>[\s\S]*?<\/style>/g;
const MARKUP_OWN = /\b(class|id|for|role|aria-labelledby|aria-describedby|aria-controls)=(["'])([^"'\n{}]*)\2/g;

/** One file's source with what is no reference blanked: in markup, the comments, the style block and the page's own class and id names. */
export function unnamed(source, markup = false) {
  if (!markup) return source;
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(STYLE, blank)
    .replace(MARKUP_OWN, (m, attr, q, value) => `${attr}=${q}${blank(value)}${q}`);
}

/**
 * Every place one file's text spells a name: the line, the name's folded form and the token that carried it. A
 * `.svelte` file's HTML comments are blanked first, as `shell-words` does and for its reason, and with them what
 * `unnamed` blanks. A string with a space in it is a sentence and is not read, for the header's reason;
 * `register.<id>` is read there all the same, and a name that follows `register.` inside a string that was read is
 * one place, not two. `own` is the kernel's own words (`kernelWords`): a string that spells one is not a place, and
 * one that follows `register.` still is.
 */
export function hitsIn(source, names, markup = false, own = new Set()) {
  const literals = [];
  const text = uncomment(unnamed(source, markup), literals);
  const places = new Map();
  const put = (at, key, token) => places.set(`${at} ${key}`, { at, key, token });
  const ids = literals.filter(([from, to]) => !/\s/.test(text.slice(from, to)));
  for (const [from, to] of ids)
    for (const m of text.slice(from, to).matchAll(TOKEN)) for (const key of namesIn(m[0], names)) if (!own.has(key)) put(from + m.index, key, m[0]);
  for (const m of text.matchAll(ADDRESSED)) {
    const key = fold(m[1]);
    const inString = ids.some(([from, to]) => m.index >= from && m.index < to);
    if (names.has(key) && (!inString || own.has(key))) put(m.index, key, m[0]);
  }
  const hits = [...places.values()].sort((a, b) => a.at - b.at);
  let line = 1;
  let seen = 0;
  for (const h of hits) {
    for (; seen < h.at; seen++) if (text[seen] === '\n') line++;
    h.line = line;
  }
  return hits;
}

/**
 * THE WHOLE READING OF ONE ROOT, with no held list in it: the names, how many files declared them, how many files were
 * read, and every hit. `test/core-names.test.mjs` and the gate both stand on this one function. `sources` is the core
 * alone: a declaration (`declarationsOf`) is counted beside it as `declarations` and no place in it is a hit.
 */
export function read(root) {
  const { names, files: declared } = collect(root);
  const shipped = sourcesOf(root);
  const declarations = declarationsOf(root, shipped);
  const sources = shipped.filter((path) => !declarations.has(path));
  const own = kernelWords(root);
  const hits = [];
  for (const path of sources) {
    const text = readFileSync(join(root, path), 'utf8');
    for (const h of hitsIn(text, names, path.endsWith('.svelte'), own)) hits.push({ path, line: h.line, key: h.key, token: h.token });
  }
  return { names, declared, sources, declarations, hits, own };
}

/** Where a root keeps its held list. A planted tree has its own or none, so the tree's own list never excuses it. */
const HELD_FILE = 'tools/gates/core-names.held.json';

/**
 * THE HELD LIST, READ LINE BY LINE. The file is one JSON document with one entry a line, and each entry's line is
 * parsed by itself, so a line that does not read says its own number. An entry holds four things, all of them: `path`,
 * `name`, `reason` and `unit`. Two entries for one path and name is a throw, because the ledger counts entries and
 * the second would be counted for nothing.
 */
export function heldIn(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  JSON.parse(text);
  const held = [];
  const seen = new Set();
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim().replace(/,$/, '');
    if (!line.startsWith('{ "path"')) return;
    let e;
    try {
      e = JSON.parse(line);
    } catch (cause) {
      throw new Error(`${file}:${i + 1} does not read as one entry: ${cause.message}`);
    }
    for (const k of ['path', 'name', 'reason', 'unit'])
      if (typeof e[k] !== 'string' || e[k].trim() === '') throw new Error(`${file}:${i + 1} holds no ${k}. An entry says its path, name, reason and unit.`);
    const key = `${e.path} ${fold(e.name)}`;
    if (seen.has(key)) throw new Error(`${file}:${i + 1} holds ${e.name} in ${e.path} a second time.`);
    seen.add(key);
    held.push(e);
  });
  return held;
}

/* THE HELD LIST, BY THE NAME THE LEDGER READS IT UNDER (PRF-B03 step 3): `ledger.json` holds `core-names.HELD` at its
   newest line, so the list only shrinks, and a fall is a line written there. */
export const HELD = heldIn(fileURLToPath(new URL('./core-names.held.json', import.meta.url)));

/** A token as a finding quotes it, unless it also carries a private word, which no log prints. */
const shown = (token) => (hashedIn(token).length > 0 ? 'a name that also holds a private word' : `\`${token}\``);

/** What a name is, said after it: `tasks, a list of roadmap and standup`. An add-on's id is its own, so it says no more. */
const whatIs = (n) => (n.kind === 'add-on' ? "an add-on's id" : `a ${n.kind} of ${declaredBy(n.by)}`);

/** Which add-ons or use cases declare a name, said shortly: two by id, then how many more. */
const declaredBy = (by) => {
  const [first, second, ...more] = [...by].sort();
  if (second === undefined) return first;
  return more.length === 0 ? `${first} and ${second}` : `${first}, ${second} and ${more.length} more`;
};

/**
 * WHAT ONE READING OWES, AGAINST A HELD LIST. Pure, so the test holds each rule without a tree. A place is a finding
 * unless its path and name are held, and a held entry is a finding when its path no longer spells its name.
 */
export function judge({ names, hits }, held) {
  const byPair = new Map();
  for (const h of hits) {
    const key = `${h.path} ${h.key}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(h);
  }
  const allowed = new Map(held.map((e) => [`${e.path} ${fold(e.name)}`, e]));
  const findings = [];
  const line = (h) => {
    const n = names.get(h.key);
    return `  ${h.path}:${h.line}  ${n.name}, ${whatIs(n)}, in ${shown(h.token)}`;
  };
  let heldHits = 0;
  for (const [key, list] of byPair) {
    if (allowed.has(key)) heldHits += list.length;
    else for (const h of list) findings.push(line(h));
  }
  for (const [key, e] of allowed)
    if (!byPair.has(key)) findings.push(`  ${e.path} is held for ${e.name} and does not spell it. Take the entry out, so the next one there is seen.`);
  return { findings, heldHits };
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned, and the root is an argument that defaults to
 * `BRAINDOG_GATE_ROOT` and then to the repository this file sits in, as every gate here does. It returns 1 or 3 and
 * falls off the end for a pass.
 */
export default function coreNames(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const reading = read(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED, and one with no names to look for has read nothing either. */
  if (reading.sources.length === 0) {
    console.log(`  core-names: no packages/*/{src,grammars,svelte} or apps/*/{src,scripts} under ${ROOT}, so no code was read`);
    return COULD_NOT_RUN;
  }
  if (reading.names.size === 0) {
    console.log(`  core-names: no packs/<id>/<id>.pack.json and no use case file under ${ROOT}, so there was no name to look for`);
    return COULD_NOT_RUN;
  }
  const held = heldIn(join(ROOT, HELD_FILE));
  const { findings, heldHits } = judge(reading, held);
  if (findings.length === 0) {
    console.log(
      `  core-names: 0 names of an add-on or a use case spelled in ${reading.sources.length} core files, outside the held list; ` +
        `${reading.names.size} names read from ${reading.declared} files; ${reading.declarations.size} files left as an add-on's or a use case's ` +
        `own declaration; ${heldHits} places held by ${held.length} entries`,
    );
    return;
  }
  for (const f of findings) console.error(f);
  console.error(`\n  core-names: ${findings.length} finding(s), over ${reading.sources.length} core files and ${reading.names.size} names.`);
  console.error(
    '  Each is a name an add-on or a use case declares, spelled in the core, or a held entry that no longer\n' +
      '  says what its file holds. The core runs whatever is declared and knows none of it by name: read the\n' +
      '  name off the declaration. The held list only shrinks, and this gate never writes it.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass
   returns nothing. */
if (import.meta.main) process.exitCode = coreNames(process.argv[2]) ?? 0;
