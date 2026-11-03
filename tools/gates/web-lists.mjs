/**
 * `web-lists`: the web names no first-party list or pack, and guesses no currency.
 *
 *   node tools/gates/web-lists.mjs [root]
 *
 * THE WEB DRAWS WHAT THE RECORD DECLARES, AND A LIST ID WRITTEN INTO IT IS THE WEB KNOWING A PACK. Home asked Money's
 * three figures of every record that held `obligations`, a new block bound itself to `obligations` when the page said
 * nothing, and the reporting panel looked for a list called `datapoints`. Each of those
 * is a screen that works on the one record it was written against and answers wrongly on every other: a student's, a
 * team's, a record set up from a stranger's pack. The rule that ends the class is that a shipped file under
 * `apps/web/src` does not write a first-party list id or pack id as a string, and this is what holds it.
 *
 * WHAT COUNTS AS NAMING ONE. A string literal, or the text of a template literal, that is the id itself
 * (`'obligations'`, `'money-core'`), the id as a declaration names it (`'register.obligations'`), or a link into the
 * list (`'/r/obligations'`, `` `/r/tasks/${seq}` ``). An identifier is not a literal, so `REGISTERS.tracks` is not
 * read; nor is a comment, which may say which list a rule is about; nor is a `class="..."` attribute in markup, where
 * `updates` and `skills` are the names of a style and nothing the record holds.
 *
 * THE IDS ARE THE REPOSITORY'S OWN, READ FROM THE SEED, and not a list written here. The lists are every list the
 * first-party modules declare (`REGISTERS`), the Agents pack's (`AGENTS_REGISTERS`) and each first-party use case's
 * (`listsOf`); the packs are `FIRST_PARTY`, the Agents pack, each use case's own pack, and every pack under `packs/`.
 * A list the seed gains is watched the day it is declared. They are read from the repository this file sits in even
 * when the root is another tree, because the root is what is checked and the seed is what it is checked against:
 * `self-test` aims the gate at a seeded tree that holds no seed of its own.
 *
 * AND A CURRENCY NOBODY CHOSE. `currencyFor(...) ?? 'GBP'` wrote every amount typed into a new row as sterling on a
 * record in any other currency. A currency is one somebody chose: typed, held on the
 * row, declared on the field, or the record's home currency, never a code the web falls back to. So a currency code
 * after `??` or `||` is a finding, and a code is one `Intl` knows as a currency, so `|| 'UTC'` is not one. The two
 * tables that map what a person types to a code (`lib/record/currencies.ts`, `lib/shape.ts`) are where a code is
 * data, and are not read for this rule.
 *
 * `HELD` IS THE ONE ALLOWLIST, and every entry in it is a file that still names an id today, with the ids and why.
 * Some are debt a later change pays (the first run's module map, the hand-built Work screen); some are a word the web
 * uses for something else that happens to be spelled like a list (a block kind called `steps`, a settings area
 * called `people`). An entry that holds an id its file no longer names is itself a finding, so the list only
 * shrinks: take the line out in the change that takes the last literal out.
 *
 * Tests, `test-*` helpers, anything under `test/` and the `fixtures/` directories are not shipped, and are not read.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { skipDir } from './lib.mjs';
import { fold, kernelWords } from './core-names.mjs';

/** The repository this file sits in, where the seed is read from whatever the root is. */
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** The app whose shipped files are read, and the kinds of file it ships. */
const APP = join('apps', 'web', 'src');
const SOURCE = /\.(ts|js|mjs|svelte)$/u;
/** A test or a test's helper, which `apps/web`'s bare `node --test` runs and the product never loads. */
const TEST = /\.test\.(ts|js|mjs)$|^test-/u;

/** The two tables where a currency code is data. */
const CURRENCY_TABLES = new Set(['apps/web/src/lib/record/currencies.ts', 'apps/web/src/lib/shape.ts']);

/**
 * THE FILES THAT STILL NAME AN ID, each with the ids it names and why. Paths are from the root; ids are sorted.
 *
 * AN ENTRY IS NOT A PERMISSION FOR THE FILE, only for the ids it lists: a new id written in a held file is a finding
 * like anywhere else.
 */
export const HELD = {
  /* The first run hears packs by the catalogue's signals; what is left is the rows a sentence fills, which
     are Projects', People's and Money's, and the Projects every other list points at. */
  'apps/web/src/lib/shape.ts': {
    ids: ['money-core', 'obligations', 'people', 'portfolio', 'things', 'work'],
    why: "the first rows a sentence fills (a project, a person, an invoice), the Projects module every other list leans on, and `work` and `people` among the English words the language guess counts.",
  },
  'apps/web/src/lib/who.ts': {
    ids: ['hello', 'people'],
    why: "onboarding's introduction asks whether the People pack is on before it meets the person, and `hello` is a greeting that opens a sentence without being a name.",
  },

  /* A list the web reads by its id, where the record could say which list plays the part. */
  'apps/web/src/lib/palette/Palette.svelte': {
    ids: ['people'],
    why: '`@` narrows the palette to People by the list id.',
  },
  'apps/web/src/lib/record/reporting.ts': {
    ids: ['datapoints'],
    why: '`READINGS`, the list a report key writes into, which the reporting panel and the number presets of a new action ask for by name.',
  },
  'apps/web/src/lib/page/panels/Reporting.svelte': {
    ids: ['organisations', 'things'],
    why: "the reporting panel binds a project's key through its organisation and draws the poll form on an organisation.",
  },
  'apps/web/src/routes/plugins/share/+page.svelte': {
    ids: ['skills'],
    why: "sharing a pack offers the Agents pack's skills.",
  },
  'apps/web/src/routes/keychain/+page.svelte': {
    ids: ['credentials', 'things'],
    why: "the Keychain lists the Agents pack's credentials and the projects each is for.",
  },
  'apps/web/src/lib/record/keychain.ts': {
    ids: ['credentials'],
    why: "`KEYS_REGISTER`, the Agents pack's credentials list, which the Keys index and a new action's key picker read by its id.",
  },
  'apps/web/src/routes/r/[register]/[seq]/+page.svelte': {
    ids: ['credentials', 'tools'],
    why: "a key's or a tool's row lists the runs that used it, and knows it is one by the Agents pack's list ids.",
  },
  'apps/web/src/lib/record/today-live.ts': {
    ids: ['accounts', 'books', 'obligations', 'things'],
    why: "Today reads Money's accounts, books and bills, and the projects its tasks are filed under, by their list ids, because `boot` names no list by the part it plays.",
  },

  /* The hand-built Work screen, which a declared page replaces. */
  'apps/web/src/lib/work/list.ts': {
    ids: ['tasks'],
    why: "`TASKS`, the one list the hand-built Work screen, Today's tasks and the shell's Work row read by its id.",
  },

  /* NOT A LIST AT ALL: a word the web uses for something else, spelled like one. */
  'apps/web/src/lib/copy/decide.ts': {
    ids: ['choices', 'things', 'updates'],
    why: 'the plural words of three counted sentences, "Drawn from 3 things that came in", "adds 2 choices" and an arrangement\'s "2 updates", which are English and not the lists.',
  },
  /* AN ARRANGEMENT'S PARTS (arranged-needs, batch 40): what the owner is asked to pick is the `choices` part, drawn under
     "Your choices", and never Ask Slash's list. */
  'apps/web/src/routes/decide/[id]/arranged.ts': {
    ids: ['choices'],
    why: "the `choices` part of an arrangement, the questions it asks the owner to pick an answer to, which is not the list.",
  },
  'apps/web/src/routes/decide/[id]/Arranged.svelte': {
    ids: ['choices'],
    why: "the `choices` part of an arrangement, drawn and folded by that name, which is not the list.",
  },
  'apps/web/src/lib/flow/flow.ts': {
    ids: ['choices'],
    why: "an automation's `steps:` key and an Ask Slash step's `choices:`, which are not the guide's lists.",
  },
  'apps/web/src/lib/home/today-tiles.ts': {
    ids: ['people'],
    why: 'the `people` icon on the line that says access changed.',
  },
  'apps/web/src/lib/ui/RowCards.svelte': {
    ids: ['people'],
    why: 'the `people` glyph a list declares, which is how a list of people is known without its id.',
  },
  'apps/web/src/lib/ui/RowMenu.svelte': {
    ids: ['people'],
    why: 'the `people` icon on Hand to.',
  },
  'apps/web/src/lib/nav.ts': {
    ids: ['people', 'services', 'work'],
    why: "the section names the nav orders a day by, the Work row's key and glyph, and the `work` word of the Work screen's address `/?work`; the five places the bars draw are read off the rail's order.",
  },
  'apps/web/src/lib/nav/rail.ts': {
    ids: ['orders', 'people', 'work'],
    why: "the section names the rail orders its places by (a shop's Orders after Decide, uc6-places-47), and the Work row's key, as `lib/nav.ts` names them.",
  },
  'apps/web/src/routes/+page.svelte': {
    ids: ['work'],
    why: 'the `work` word in the query that opens the Work screen at `/?work`.',
  },
  'apps/web/src/lib/work/page.ts': {
    ids: ['work'],
    why: "the declared Work page's slug, `page.work`, which `/?work` draws.",
  },
  'apps/web/src/routes/audit/+page.svelte': {
    ids: ['people'],
    why: 'the `people` icon on a line that gives or takes access.',
  },
  'apps/web/src/routes/settings/[area]/+page.svelte': {
    ids: ['people'],
    why: 'settings areas called `people` and `agents`, and the `people` icon.',
  },
  'apps/web/src/routes/settings/levels.ts': {
    ids: ['people'],
    why: 'the settings areas called `people` and `agents` that only an owner is shown.',
  },

  /* HELD ON 16 OCTOBER. What this gate, core-names and colour-grep found that day was held rather than renamed
     ("Hold them, deploy tonight"). Each says what its id is, so the change that renames it knows. */
  'apps/web/src/lib/home/imported-rules.ts': {
    ids: ['filing_rules'],
    why: "Money's filing rules, which Home's offer to make imported automations filing rules writes into by the list's id. The categories a rule files under are read off the rule's own link since 30 October (SHL-A24).",
  },
  'apps/web/src/lib/signup.ts': {
    ids: ['things'],
    why: "`things`, what a question back from the reading door may be about (`SetupAbout` in `@braindog/slash`), which is not the list.",
  },
};

/**
 * The first-party lists and packs, from the repository's seed and `packs/`.
 *
 * IMPORTED AND NOT READ AS TEXT, because a list is a key of an object in a module and a pattern over the source would be
 * a second reading of the seed that drifts from the first. `record.mjs` imports the seed the same way.
 */
export async function firstParty(repo = REPO) {
  const load = (...parts) => import(pathToFileURL(join(repo, ...parts)).href);
  const seed = await load('packages', 'seed', 'src', 'index.ts');
  const cases = await load('packages', 'seed', 'src', 'usecases', 'index.ts');
  const { packIdOf } = await load('packages', 'declare', 'src', 'usecase.ts');

  const lists = new Set([
    ...Object.keys(seed.REGISTERS),
    ...Object.keys(seed.AGENTS_REGISTERS),
    ...cases.USE_CASES.flatMap((u) => cases.listsOf(u).map((l) => l.id)),
  ]);
  const packs = new Set([...seed.FIRST_PARTY, seed.AGENTS_PACK.manifest.id, ...cases.USE_CASES.map((u) => packIdOf(u.usecase))]);
  let dirs = [];
  try {
    dirs = readdirSync(join(repo, 'packs'), { withFileTypes: true });
  } catch {
    dirs = [];
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const file = join(repo, 'packs', d.name, `${d.name}.pack.json`);
    if (!existsSync(file)) continue;
    const id = JSON.parse(readFileSync(file, 'utf8')).pack;
    if (typeof id === 'string') packs.add(id);
  }
  return { lists, packs };
}

/** Every shipped source file under `dir`: no test, no test helper, no `test/` and no `fixtures/` directory. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name) || name === 'fixtures' || name === 'test') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !TEST.test(name)) out.push(full);
  }
  return out;
}

/**
 * THE KEYWORDS AFTER WHICH A SLASH OPENS A REGULAR EXPRESSION rather than dividing, as `shell-words.mjs` reads them. A
 * regular expression read as a division has its body read as code, and a quote inside it opens a string that is not
 * there.
 */
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * One file's string literals and template texts, each with where it opens, and the source with its comments blanked.
 *
 * A LEXER AND NOT A PATTERN, for the reason `shell-words.mjs` gives for its own: a pattern cannot tell a `//` inside a
 * string from a comment, or a quote inside a regular expression from the start of a string. This is that lexer's walk,
 * keeping the literals it steps over. A template's text is its fixed parts joined with `${}` where each hole was, so
 * `` `/r/tasks/${seq}` `` reads `/r/tasks/${}`; a literal inside a hole is read as a literal of its own.
 *
 * A QUOTE ENDS AT THE END OF ITS LINE, because a string cannot run on past one, and in markup an apostrophe in a
 * sentence ("you're") is not a string at all: stopping there keeps one such word from swallowing the lines after it.
 */
export function literalsIn(source) {
  const out = source.split('');
  const found = [];
  const n = source.length;
  /* One brace depth per open `${`, so a `}` closes the hole it belongs to; and the templates those holes are in. */
  const braces = [];
  const templates = [];
  let i = 0;
  let last = '';

  const blankRange = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };

  /* `i` is just past a backtick or the `}` closing a hole, inside the innermost open template. */
  const readTemplate = () => {
    const t = templates[templates.length - 1];
    while (i < n) {
      const c = source[i];
      if (c === '\\') {
        t.text += source.slice(i, i + 2);
        i += 2;
      } else if (c === '`') {
        i++;
        templates.pop();
        found.push(t);
        last = 'literal';
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        i += 2;
        t.text += '${}';
        braces.push(0);
        last = '{';
        return;
      } else {
        t.text += c;
        i++;
      }
    }
    templates.pop();
  };

  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    if (c === '/' && d === '/') {
      const end = source.indexOf('\n', i);
      const to = end === -1 ? n : end;
      blankRange(i, to);
      i = to;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = source.indexOf('*/', i + 2);
      const to = end === -1 ? n : end + 2;
      blankRange(i, to);
      i = to;
      continue;
    }
    if (c === "'" || c === '"') {
      const at = i;
      let text = '';
      i++;
      while (i < n && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\') {
          text += source.slice(i, i + 2);
          i += 2;
        } else text += source[i++];
      }
      if (source[i] === c) found.push({ text, at });
      i++;
      last = 'literal';
      continue;
    }
    if (c === '`') {
      templates.push({ text: '', at: i });
      i++;
      readTemplate();
      continue;
    }
    if (c === '{' && braces.length > 0) {
      braces[braces.length - 1]++;
      last = c;
      i++;
      continue;
    }
    if (c === '}' && braces.length > 0) {
      if (braces[braces.length - 1] === 0) {
        braces.pop();
        i++;
        if (templates.length > 0) readTemplate();
        continue;
      }
      braces[braces.length - 1]--;
      last = c;
      i++;
      continue;
    }
    if (c === '/') {
      const regex = last === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/u.test(last) || BEFORE_REGEX.has(last);
      if (regex) {
        i++;
        let inClass = false;
        while (i < n && source[i] !== '\n') {
          const r = source[i];
          if (r === '\\') i += 2;
          else if (r === '[') (inClass = true), i++;
          else if (r === ']') (inClass = false), i++;
          else if (r === '/' && !inClass) {
            i++;
            break;
          } else i++;
        }
        last = 'literal';
        continue;
      }
      last = c;
      i++;
      continue;
    }
    if (/[A-Za-z0-9_$]/u.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/u.test(source[i])) i++;
      last = source.slice(start, i);
      continue;
    }
    if (!/\s/u.test(c)) last = c;
    i++;
  }
  return { code: out.join(''), literals: found };
}

/** A link into a list, and a list as a declaration names it. */
const LINK = /^\/r\/([^/?#]+)(?:[/?#]|$)/u;
const DECLARED = /^register\.(.+)$/u;

/**
 * The first-party id a literal names, or `null`.
 *
 * A BARE WORD THE KERNEL DECLARES FOR ITSELF IS ITS OWN, as `core-names` reads it (`kernelWords`): the day an add-on
 * was called `calendar`, every `kind: 'calendar'` and calendar glyph in the web read as that add-on, 34 places. A link
 * into the list or `register.` in front of it still names the list, whatever the word.
 */
export function namedIn(text, ids, own = new Set()) {
  if (ids.has(text)) return own.has(fold(text)) ? null : text;
  const m = LINK.exec(text) ?? DECLARED.exec(text);
  return m && ids.has(m[1]) ? m[1] : null;
}

/** A currency code written as the last resort of `??` or `||`. */
const FALLBACK = /(?:\?\?|\|\|)\s*(['"`])([A-Z]{3})\1/gu;

/** The line a character offset is on, from the offsets each line starts at. */
function lineOf(starts, at) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** How far back from a quote in markup `class=` is looked for: the word, the sign and any spaces around it. */
const CLASS_REACH = 24;

/** Blanked rather than removed, so a finding's line is the line it names. */
const blank = (m) => m.replace(/[^\n]/gu, ' ');

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */
export default async function webLists(
  root = process.env.BRAINDOG_GATE_ROOT ?? REPO,
) {
  const ROOT = resolve(root);
  const files = walk(join(ROOT, APP));

  /* A GATE THAT READ NOTHING HAS NOT PASSED, and a mistyped root reads nothing. Exit 3 is "could not run". */
  if (files.length === 0) {
    console.log(`  web-lists: no source under ${join(ROOT, APP)}, so nothing shipped was read`);
    return 3;
  }

  /* AND A GATE THAT KNOWS NO ID HAS CHECKED NOTHING, whether the seed would not load or named nothing. */
  let ids;
  try {
    ids = await firstParty();
  } catch (cause) {
    console.log(`  web-lists: the seed could not be loaded, so no first-party id was known: ${cause?.message ?? cause}`);
    return 3;
  }
  if (ids.lists.size === 0 || ids.packs.size === 0) {
    console.log('  web-lists: the seed named no list or no pack, so nothing was checked');
    return 3;
  }
  const every = new Set([...ids.lists, ...ids.packs]);
  const own = kernelWords(ROOT);
  const currencies = new Set(Intl.supportedValuesOf('currency'));

  const findings = [];
  /* How many times each held id was met in its file, keyed `path id`, so an entry that holds nothing is seen. */
  const held = new Map(Object.entries(HELD).flatMap(([p, e]) => e.ids.map((id) => [`${p} ${id}`, 0])));
  let kept = 0;

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const markup = file.endsWith('.svelte');
    const raw = readFileSync(file, 'utf8');
    const source = markup ? raw.replace(/<!--[\s\S]*?-->/gu, blank) : raw;
    const { code, literals } = literalsIn(source);
    const starts = [0];
    for (let k = 0; k < source.length; k++) if (source[k] === '\n') starts.push(k + 1);

    for (const { text, at } of literals) {
      const id = namedIn(text, every, own);
      if (id === null) continue;
      /* A STYLE'S NAME IS NOT A LIST'S. `class="updates"` in markup is a class, and nothing the record holds. */
      if (markup && /\bclass\s*=\s*$/u.test(source.slice(Math.max(0, at - CLASS_REACH), at))) continue;
      const key = `${rel} ${id}`;
      if (held.has(key)) {
        held.set(key, held.get(key) + 1);
        kept++;
        continue;
      }
      const what = ids.lists.has(id) ? 'list' : 'pack';
      findings.push(`  ${rel}:${lineOf(starts, at)}  names the first-party ${what} ${id} in a string (${JSON.stringify(text)}); read it off the record`);
    }

    if (!CURRENCY_TABLES.has(rel))
      for (const m of code.matchAll(FALLBACK))
        if (currencies.has(m[2]))
          findings.push(`  ${rel}:${lineOf(starts, m.index)}  falls back to ${m[2]}, a currency nobody chose; use the field's, the row's or the record's`);
  }

  /* AN ENTRY THAT HOLDS NOTHING IS A FINDING, for the reason `HELD` gives. Only for a file that is there: a tree without
     it has nothing to say about it, which is how `self-test`'s seeded tree reads none of these. */
  for (const [key, n] of held) {
    const [p, id] = key.split(' ');
    if (n === 0 && existsSync(join(ROOT, p)))
      findings.push(`  ${p} is held for ${id} in HELD and names no ${id} in a string. Take ${id} out of its entry, so the next one there is seen.`);
  }

  if (findings.length === 0) {
    console.log(`  web-lists: ${files.length} shipped file(s), 0 finding(s); ${kept} held in the ${Object.keys(HELD).length} files HELD names`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  web-lists: ${files.length} shipped file(s), ${findings.length} finding(s), each the web naming a first-party list\n` +
      '  or pack, or choosing a currency for somebody. The web draws what the record declares: read the list off the\n' +
      "  page or the record's answer, and the currency off the field, the row or the record.",
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture and the header documents the
   command line. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await webLists(process.argv[2])) ?? 0;
