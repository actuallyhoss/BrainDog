/**
 * `shell-words`: the core packages' code names no use case.
 *
 *   node tools/gates/shell-words.mjs [root]
 *
 * THE CORE IS A SHELL, AND IT STAYS ONE ONLY WHILE IT KNOWS NOTHING ABOUT WHAT RUNS IN IT. A pack
 * says what a record is for; the kernel, the record, the host and the rest run whatever a pack
 * declares. The day `packages/kernel` holds `if (list === 'gold')` or `'bank-hsbc-eg'`, one use case
 * has a branch nobody else can declare, and removing it is a migration rather than an uninstall.
 * `loop/research-shell-leftovers.md` measured the twelve core packages on 22 September with comments
 * stripped and found no such word in code, which is exactly the state that decays unwatched: every
 * earlier hit had been a comment, and nothing said so the day a real one landed.
 *
 * WORDS, NOT SUBSTRINGS. The first version of the word list was a case-folded substring test, and
 * over `apps/web/src` it went red on `loadingOlder` five times, because `ngOlder` folds to a string
 * that contains `gold` (`loop/research-shell-next.md` M3). No core package has such an identifier
 * yet, so the substring gate would have read green here until the first `pendingOlder` in the kernel
 * failed it on nothing. So every identifier and literal is split into parts at a case change, `_`,
 * `-`, `.` and `$`, the parts are case-folded, and a word is a hit when one part, or a run of
 * neighbouring parts joined, STARTS WITH it.
 *
 * STARTS WITH, AND NOT EQUALS, AND JOINED, AND NOT ONE PART AT A TIME. Measured by the checker over
 * `apps/web/src`: a part that had to equal the word found 10 of the 17 real hits, dropping both
 * `Egyptian` lines because `egyptian` is not `egypt`. A part at a time would miss `legacyTool`, whose
 * word is two parts. Starting a match only at a part boundary is what keeps `loadingOlder` out: its
 * parts are `loading` and `older`, and neither run begins `gold`. The negative directory holds one
 * file for each of those three shapes and one holding `loadingOlder`, so the rule is proved in both
 * directions every time `self-test` runs it. Run over those four files on 23 September, a
 * substring match named all four, `loadingOlder` among them, and a part that had to equal the word
 * named only the `hsbc-eg` one.
 *
 * COMMENTS ARE NOT CODE, and they are found by a lexer rather than blanked by a pattern. A comment
 * that says why the kernel refuses a `gold` list is the kernel explaining itself, and a gate that
 * went red on it would be measuring the wrong thing. The survey's probe used
 * `no-declarations-in-kernel`'s `decomment`, which is two regular expressions, and a regular
 * expression cannot tell a `//` inside a string or a regex literal from the start of a comment.
 * Measured on 23 September over the core this gate reads: it blanked 268 runs of real code in 31
 * files, among them the rest of `decoded.startsWith('//') || slippery(decoded))` in
 * `packages/host/src/auth.ts:288` and of `.split(/[/?#]/)[0]` after an `https?:\/\/` in
 * `packages/declare/src/index.ts:2070`. None of those runs held a word today, so both readings gave
 * 0; the difference is that a word written there tomorrow would be invisible to one of them. The
 * lexer below knows strings, templates, regular expression literals and both comment forms, and
 * over the same files it blanked nothing that `decomment` kept. The negative directory holds that
 * case too: `seeded-slashes.ts` names `'mercury'` after a `'//'` on one line, and `decomment` reads
 * it as green. And it holds the lexer's own first mistake, `seeded-template.ts`, which `uncomment`
 * explains where it happened.
 *
 * `salaries` IS NOT A HIT. `salary` is the word, and `salari...` does not start with it. The brief
 * offered the stem `salar` as an option; the tree has no `salaries` in scope today, so it is not
 * added on speculation.
 *
 * HIS OWN NAMES CAME SECOND, and the gate passed his host until they did. `loop/research-legacy-parity.md`
 * brief B10 measured it on 25 September: ten words and not one of them `sam`, so a kernel file holding
 * `const HOST = 'brain.example.com'` read green, and so did `EGP`, `acme.example` and the rest of what his
 * record is about. `tools/gates/test/shell-words.test.mjs` holds each of those as a case that failed
 * against the gate before the words went in, and `negative/shell-words` seeds one per new place.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/**
 * The names of use cases, banks, products and people this tree has had to keep out of the core.
 * Each is the start of a part, case-folded: see the header for why a match must begin at a part
 * boundary and why it may run on past one.
 */
export const WORDS = [
  'gold', 'hsbc', 'instapay', 'egypt', 'salary', 'payroll', 'mercury', 'registrar', 'acme', 'legacy',
  'sam', 'egp', 'bake', 'quartz', 'acme', 'acme', 'trunk', 'Delta', 'nile', 'payday', 'goldapi',
];

/**
 * THE WORDS THAT MUST END WHERE A PART ENDS, because what starts with them is ordinary English.
 *
 * `bake` IS THE ONE, AND IT WAS MEASURED BEFORE IT WAS MADE ONE. On 25 September, with `bake` matched
 * the way every other word is, its one hit over the scope this gate reads was `'bakery'`, a signal the
 * guide reads to know a person runs a shop (`packages/seed/src/usecases/guide-kinds.ts:268`). That is
 * the `loadingOlder` mistake again, a word found inside a longer one it has nothing to do with. Whole,
 * `acme.example`, `acme-web`, `acmeweb` and `ACME_WEB` are still hits, and `bakery`, `baker` and `baked` are not.
 * The other new words were read the same way and have no such neighbour in the tree.
 */
const WHOLE = new Set(['bake']);

/**
 * Every package and every app is in scope by default, so a new core package is watched the day it exists.
 *
 * `packs` IS THE THIRD WORKSPACE ROOT AND IS LEFT OUT ON PURPOSE, the one text gate that does not read
 * it (audit sixty-one, finding 9, which found all four reading only these two). These words are the
 * use cases the core must not name, and a pack is exactly where a use case goes: `loop/DIRECTION.md`
 * section 22 says a gold rate or a bank's pattern lives in a record or a shared pack, never in
 * `packages/`. It is `packages/seed`'s exemption below, for the directory that took over its job.
 * Measured on 24 September with `hitsIn` over `packs/`: read as this gate reads, 2 files and 0 hits,
 * so adding it would have cost nothing today; and `packs/mercury/mercury.pack.json` names `mercury`
 * 11 times, so the first script that pack grows would have gone red for naming itself.
 * `tools/gates/test/packs-read.test.mjs` holds the decision: `'mercury'` in a pack is green, the same
 * line in a core package is red.
 */
const WORKSPACES = ['packages', 'apps'];

/**
 * THE DIRECTORIES OF EACH MEMBER THAT ARE READ, per workspace. `src` everywhere, and beside it the one
 * other directory each workspace ships code from: a package's `grammars`, which the MCP server serves
 * to every agent, and an app's `scripts`, which its operator runs. See `SOURCE` below for what the
 * first two held when they were not read.
 */
const READ = { packages: ['src', 'grammars'], apps: ['src', 'scripts'] };

/**
 * WHAT IS OUT, AND WHY. Every entry is a path under the root, a directory or a file, and every
 * entry has to go on earning its place: an entry whose path is present and exempts no hit is itself
 * a finding, because an exemption that exempts nothing is a hole waiting for the next word. That is
 * why `apps/cli/src/install.ts`, which the brief named, is not here: measured on 23 September it
 * holds no word in code, so exempting it would only have hidden the first one.
 *
 * `words`, WHERE AN ENTRY HAS IT, NARROWS THE ENTRY TO THOSE WORDS, each with its own reason.
 * `apps/cli/src/main.ts` is the whole command line, and exempting the file for one help line would
 * have exempted every other word written there too.
 *
 * AND AN ENTRY WHOSE REASON IS THE WORDS IT HOLDS HAS TO NAME THEM. The first version narrowed only
 * `main.ts`, and `apps/site`, `legacy.ts` and `import.ts` each exempted all ten words while their
 * reasons covered one or three. Measured by audit forty-four (finding 5) on a seeded root, and again
 * on 23 September over the `apps` half of `negative/shell-words`: `'bank-hsbc-eg'` in
 * `apps/site/src`, `'acme-payroll'` in `apps/cli/src/import.ts` and three more read green, the
 * gate saying `12 in the 6 exempted paths` and exit 0. Narrowed, it names all five.
 * An exempted word that exempts no hit is a finding for the same reason an idle entry is: it is the
 * hole the next leak of that word walks through.
 *
 * NO ENTRY STAYS OUT WHOLE SINCE BRIEF B10 STEP 2. `packages/seed` was exempted whole while it held
 * the use-case packs, a bank's wordings and a person's holdings among them, and a pack is where a use
 * case is allowed to be named. Those are under `packs/` now (briefs B1 and B2), which this gate leaves
 * out by `WORKSPACES`, and what stays in `packages/seed` is the generic modules, the guide and the
 * sample, which is core and is read as core. `apps/web` was exempted whole while it waited for a gate
 * of its own. Measured on 25 September with the twenty-one words, the two held 5 and 2 hits, against
 * 82 and 11 on 23 September with ten; a sixth in the seed was `bakery`, which `WHOLE` explains. Each
 * is an entry below naming its file and its words: an exemption the size of a tree is how a leak the
 * size of the kernel's in either would have read green.
 *
 * `*.test.ts` and any `test` directory are out by rule rather than by entry, because a test asserts
 * on what a record was handed: `packages/record/test/ask-person-reach.test.ts` arrives
 * `'Payroll: Omar 91000'` to prove the owner keeps her own question, and it cannot say so in any
 * other words.
 *
 * The hit counts are 25 September's, from this gate's own reading.
 */
const OUT = {
  /* THE SAMPLE RECORD, a studio called Kiln whose domains are renewed through a registrar. It is sample
     content rather than a branch the core takes, and `loop/research-legacy-parity.md` has it leave
     with section 26's sample removal, when these two entries and the web's `fixtures/sample.ts` go idle and the
     gate says so. */
  'packages/seed/src/index.ts': {
    why: 'the sample record (1 hit).',
    words: { registrar: 'the sample decision `D41` asks which registrar holds the Kiln names.' },
  },
  'packages/seed/src/modules/portfolio.ts': {
    why: 'the sample record (2 hits).',
    words: { registrar: 'the Kiln sample write-up names its domains, their registrar email, and the decision `D41`.' },
  },
  'packages/seed/src/modules/estate.ts': {
    why: 'Estate, a first-party module still in the core (1 hit).',
    words: { registrar: 'the Services list says what a row holds, a renewal date, a registrar and a cost, which is what a domain is.' },
  },
  /* A WORD A STRANGER TYPES, read to tell which kind of record they want, and not a use case the core
     runs: the guide hears `payday` and offers Personal. */
  'packages/seed/src/usecases/personal.ts': {
    why: 'the guide signals for Personal (1 hit).',
    words: { payday: 'a word a person says about their own money, in the list the guide matches what they type against.' },
  },
  /* TO BE CLEARED. `apps/web` is being rewritten by another brief, and these are its two hits on
     25 September; they are named here so the gate is green meanwhile and so neither file exempts any
     other word. Each goes idle when its file is reworded, and the gate then asks for the entry out.
     `currencies.ts` lists `EGP` among twelve common currencies, which the parity survey judged
     legitimate and which is also the one Middle Eastern bias in the list; `fixtures/sample.ts` is the
     web's copy of the sample's `D41`. It was `record/data.ts` when this entry was written, and the
     move to `fixtures/` the same morning turned the gate red on that one line: an entry names a file,
     so a file that moves takes its exemption with it only if the entry moves too. */
  'apps/web/src/lib/record/currencies.ts': {
    why: 'the currency picker, to be cleared (1 hit).',
    words: { egp: 'one of the twelve codes offered before the rest.' },
  },
  'apps/web/src/lib/record/fixtures/sample.ts': {
    why: 'the sample engine, to be cleared (1 hit).',
    words: { registrar: 'the web copy of the sample decision `D41`.' },
  },
  'apps/site': {
    why: 'the public site is prose about the product, not code that runs a record (3 hits).',
    words: {
      egypt: 'the changelog entry at `routes/changelog/entries.ts:317` says `Egyptian pounds` about a currency fix that shipped.',
      sam: 'two changelog titles, at `routes/changelog/entries.ts:200` and `:354`, name the the old tool import as history.',
    },
  },
};

/**
 * THE FILES A CORE PACKAGE SHIPS: its `src`, without tests, which is the scope Brief G names.
 * `.svelte` is read too, with its HTML comments blanked first, because a component's markup is code
 * a stranger's record runs.
 *
 * AND `src` IS NOT ALL A PACKAGE SHIPS. Measured on 23 September: `packages/render/svelte` holds the
 * renderer's 32 components (0 hits), and `packages/mcp/grammars/script.ts`, which
 * `packages/mcp/src/index.ts` imports and serves as `braindog:grammar/script`, holds 9, all `gold`,
 * in its `script.gold-rate` example. Neither directory was read here.
 *
 * `grammars` AND `scripts` ARE READ SINCE BRIEF B10 STEP 2, on 25 September, after step 1 had rewritten
 * that example as a rate fetch against `api.example.com`: read then, the four `apps/*\/scripts`
 * directories and `packages/mcp/grammars` held 0 hits between them, so the scope widened on a clean
 * tree and the first example that names a use case there is the first red. `packages/render/svelte`
 * is still not read; the brief did not name it, and it held 0 hits on 23 September.
 */
const SOURCE = /\.(ts|mts|js|mjs|svelte)$/;
const TEST = /\.test\.(ts|mts|js|mjs)$/;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name) || name === 'test') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !TEST.test(name)) out.push(full);
  }
  return out;
}

/** Blanked rather than removed, so a finding's line number is the line it names. */
const blank = (m) => m.replace(/[^\n]/g, ' ');

/**
 * THE KEYWORDS AFTER WHICH A SLASH OPENS A REGULAR EXPRESSION rather than dividing, beside the
 * punctuation `uncomment` checks for. A regex read as a division has its body read as code, and a
 * quote, a backtick or a brace inside it can leave the lexer in a literal that runs on over the
 * comments after it, which then read as code. The comment above `readTemplate` is the one time that
 * was measured, and it went red on three comments rather than green on anything.
 */
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * The source with its comments blanked and everything else untouched: code, strings, templates and
 * regular expression literals all stay, because a literal is exactly where `'bank-hsbc-eg'` lives.
 */
export function uncomment(source) {
  const out = source.split('');
  const n = source.length;
  /* A STACK OF BRACE DEPTHS, one per open `${`, so a `}` closes the interpolation it belongs to and
     a template inside an interpolation inside a template reads correctly. */
  const braces = [];
  let i = 0;
  /* What the last significant thing in code was, which is the whole of the regex-or-division call. */
  let last = '';

  const blankRange = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };

  /* `i` is just past a backtick or the `}` that closes an interpolation. This leaves `i` past the
     closing backtick, or just inside the next `${` with its depth pushed, and says which by setting
     `last`, because a slash straight after `${` opens a regular expression and one after a closing
     backtick divides. Measured: with `last` set to the literal in both cases,
     `${/^[A-Z]+/.exec(said)}` at `packages/record/src/index.ts:3095` read as a division, the lexer
     lost its place at the next unmatched brace, and three comments at `:3301` to `:3316` came out as
     code saying `payroll`. `negative/shell-words/.../seeded-template.ts` is that shape, as a decoy. */
  const readTemplate = () => {
    while (i < n) {
      const c = source[i];
      if (c === '\\') i += 2;
      else if (c === '`') {
        i++;
        last = 'literal';
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        i += 2;
        braces.push(0);
        last = '{';
        return;
      } else i++;
    }
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
      i++;
      while (i < n && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
      i++;
      last = 'literal';
      continue;
    }
    if (c === '`') {
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
        readTemplate();
        continue;
      }
      braces[braces.length - 1]--;
      last = c;
      i++;
      continue;
    }
    if (c === '/') {
      const regex = last === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(last) || BEFORE_REGEX.has(last);
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
    if (/[A-Za-z0-9_$]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(source[i])) i++;
      last = source.slice(start, i);
      continue;
    }
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out.join('');
}

/**
 * THE PARTS OF ONE TOKEN, case-folded. `_`, `-`, `.` and `$` separate; so does a change of case,
 * both `goldRate` (lower to upper) and `HSBCBank` (the last capital of a run starts the next part).
 */
export const partsOf = (token) =>
  token
    .split(/[_.$-]+/)
    .flatMap((piece) => piece.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
    .filter(Boolean)
    .map((p) => p.toLowerCase());

/**
 * Whether the parts from `i` on, joined, equal `word` at some part boundary: how a `WHOLE` word matches.
 *
 * IT JOINS PARTS ONLY UNTIL THE WORD'S LENGTH IS REACHED. The first version built every run of parts
 * from every part, which is n cubed in the parts of one token: a 2000-part token, the shape of an SVG
 * path in a string, took 31851 ms on 25 September. Parts are never empty, so the joined length grows
 * at every step and there is one place it can equal the word.
 */
const endsAt = (parts, i, word) => {
  let run = '';
  for (let j = i; j < parts.length && run.length < word.length; j++) run += parts[j];
  return run === word;
};

/**
 * The words one token holds: each one that a part, or a run of parts joined from there, starts with,
 * and for a word in `WHOLE`, each one that such a run equals.
 *
 * THE LONGEST WORD AT ONE PLACE, AND NOT EVERY WORD THAT FITS THERE. `sam` is a prefix of `legacy`
 * and `gold` of `goldapi`, so with both lists matched in full `legacyTool` was two hits and
 * `api.goldapi.io` two more, and every seeded count in `self-test` would have been a count of words
 * rather than of places a word was written. Measured on 25 September with this rule taken out: the
 * seeded tree in `negative/shell-words` read 13 findings for its 10 places. A shorter word is dropped
 * only when a longer one starts at the same part; `goldHsbc` still names both, because they start at
 * different parts.
 */
export function wordsIn(token) {
  const parts = partsOf(token);
  const found = new Set();
  for (let i = 0; i < parts.length; i++) {
    const run = parts.slice(i).join('');
    const here = WORDS.filter((word) => (WHOLE.has(word) ? endsAt(parts, i, word) : run.startsWith(word)));
    for (const word of here) if (!here.some((other) => other !== word && other.startsWith(word))) found.add(word);
  }
  return [...found];
}

/** A token is a run of the characters an identifier or a slug is written in, separators included. */
const TOKEN = /[A-Za-z0-9_$][A-Za-z0-9_$.-]*/g;

/**
 * Every hit in one file's text, with the line it is on and the token that carried it.
 *
 * HTML COMMENTS ARE BLANKED IN MARKUP ONLY. The first version blanked them in every file, and in a
 * `.ts` file `<!--` and `-->` are only ever string contents: `packages/extract/src/formats.ts:245`
 * has `'<!--'` on one line and `'-->'` on the next, and the pattern blanked the code between them.
 * Measured on 23 September with a `goldRate` written on the line between two such strings in a
 * `.ts` file under `packages/kernel/src`: the gate read green.
 */
export function hitsIn(source, markup = false) {
  const text = uncomment(markup ? source.replace(/<!--[\s\S]*?-->/g, blank) : source);
  const hits = [];
  let line = 1;
  let seen = 0;
  for (const m of text.matchAll(TOKEN)) {
    for (; seen < m.index; seen++) if (text[seen] === '\n') line++;
    for (const word of wordsIn(m[0])) hits.push({ line, word, token: m[0] });
  }
  return hits;
}

const outOf = (rel) => Object.keys(OUT).find((p) => rel === p || rel.startsWith(p + '/')) ?? null;

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate
 * at its seeded tree, and then to the repository this file sits in.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass`
 * grep rests on.
 */
export default function shellWords(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const files = [];
  for (const workspace of WORKSPACES) {
    let members;
    try {
      members = readdirSync(join(ROOT, workspace), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const m of members)
      if (m.isDirectory() && !skipDir(m.name)) for (const dir of READ[workspace]) walk(join(ROOT, workspace, m.name, dir), files);
  }

  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is this directory's word for "could not run". */
  if (files.length === 0) {
    console.log(`  shell-words: no packages/*/{src,grammars} or apps/*/{src,scripts} under ${ROOT}, so no code was read`);
    return 3;
  }

  const findings = [];
  const exempted = new Map(Object.keys(OUT).map((p) => [p, 0]));
  /* One count per word an entry names, keyed `path word`, so a word that exempts nothing is seen. */
  const byWord = new Map(
    Object.entries(OUT).flatMap(([p, e]) => Object.keys(e.words ?? {}).map((w) => [`${p} ${w}`, 0])),
  );
  let read = 0;
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const hits = hitsIn(readFileSync(file, 'utf8'), file.endsWith('.svelte'));
    const out = outOf(rel);
    const allowed = out === null ? null : OUT[out].words ? Object.keys(OUT[out].words) : WORDS;
    if (out === null || OUT[out].words) read++;
    for (const h of hits) {
      if (allowed !== null && allowed.includes(h.word)) {
        exempted.set(out, exempted.get(out) + 1);
        if (OUT[out].words) byWord.set(`${out} ${h.word}`, byWord.get(`${out} ${h.word}`) + 1);
      } else findings.push(`  ${rel}:${h.line}  ${h.word}, in ${h.token}`);
    }
  }

  /* AN EXEMPTION THAT EXEMPTS NOTHING IS A FINDING, for the reason `OUT` gives. Only for a path that
     is there: a tree without `apps/site` has nothing to say about it. */
  const idle = [...exempted].filter(([p, n]) => n === 0 && existsSync(join(ROOT, p)));
  for (const [p] of idle)
    findings.push(`  ${p} is exempted and holds no use-case word in code. Take it out of OUT, so the next word there is seen.`);

  /* AND A WORD THAT EXEMPTS NOTHING IS ONE TOO, once its path is not already idle, because then the
     line above has said it. Measured on a root holding only an `apps/cli/src/legacy.ts` with
     `legacy` and `gold` in it and no `registrar`: with this block cut out the gate said `2 in
     the 6 exempted paths` and exit 0, and the next `registrar` written there would have been
     exempted on a reason nothing in the file still had. */
  const idlePaths = new Set(idle.map(([p]) => p));
  for (const [key, n] of byWord) {
    const [p, w] = key.split(' ');
    if (n === 0 && !idlePaths.has(p) && existsSync(join(ROOT, p)))
      findings.push(`  ${p} is exempted for ${w} and holds no ${w} in code. Take ${w} out of its words, so the next one there is seen.`);
  }

  if (findings.length === 0) {
    const held = [...exempted].reduce((sum, [, n]) => sum + n, 0);
    console.log(
      `  shell-words: 0 use-case words in code over ${read} core files; ${held} in the ${Object.keys(OUT).length} exempted paths`,
    );
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  shell-words: ${findings.length} finding(s), each a use case named in the core's code.\n` +
      '  The core runs whatever a pack declares and knows none of it by name: move the word into the\n' +
      '  pack that owns it, and let the core read it off the declaration.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture and the header
   documents the command line. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = shellWords(process.argv[2]) ?? 0;
