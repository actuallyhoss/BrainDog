/**
 * `core-names`: the core's code spells no name an add-on or a use case declares.
 *
 *   node tools/gates/core-names.mjs [root]
 *
 * THE OWNER'S WORDS: "nothing in `packages/` or `apps/` names his bank, his Shortcut or Sam Brain" (D29.52), and the
 * unit is SHL-A01 in `loop/scope/area-shell-a.md`.
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

/**
 * Every place one file's text spells a name: the line, the name's folded form and the token that carried it. A
 * `.svelte` file's HTML comments are blanked first, as `shell-words` does and for its reason. A string with a space
 * in it is a sentence and is not read, for the header's reason; `register.<id>` is read there all the same, and a
 * name that follows `register.` inside a string that was read is one place, not two.
 */
export function hitsIn(source, names, markup = false) {
  const literals = [];
  const text = uncomment(markup ? source.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')) : source, literals);
  const places = new Map();
  const put = (at, key, token) => places.set(`${at} ${key}`, { at, key, token });
  const ids = literals.filter(([from, to]) => !/\s/.test(text.slice(from, to)));
  for (const [from, to] of ids)
    for (const m of text.slice(from, to).matchAll(TOKEN)) for (const key of namesIn(m[0], names)) put(from + m.index, key, m[0]);
  for (const m of text.matchAll(ADDRESSED)) {
    const key = fold(m[1]);
    const inString = ids.some(([from, to]) => m.index >= from && m.index < to);
    if (names.has(key) && !inString) put(m.index, key, m[0]);
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
 * read, and every hit. `test/core-names.test.mjs` and the gate both stand on this one function.
 */
export function read(root) {
  const { names, files: declared } = collect(root);
  const sources = sourcesOf(root);
  const hits = [];
  for (const path of sources) {
    const text = readFileSync(join(root, path), 'utf8');
    for (const h of hitsIn(text, names, path.endsWith('.svelte'))) hits.push({ path, line: h.line, key: h.key, token: h.token });
  }
  return { names, declared, sources, hits };
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
        `${reading.names.size} names read from ${reading.declared} files; ${heldHits} places held by ${held.length} entries`,
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
