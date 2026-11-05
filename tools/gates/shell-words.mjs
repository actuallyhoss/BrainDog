/**
 * `shell-words`: the core packages' code names no use case.
 *
 *   node tools/gates/shell-words.mjs [root]
 *   node tools/gates/shell-words.mjs --hash <word> [--whole]
 *
 * THE CORE IS A SHELL, AND IT STAYS ONE ONLY WHILE IT KNOWS NOTHING ABOUT WHAT RUNS IN IT. A pack
 * says what a record is for; the kernel, the record, the host and the rest run whatever a pack
 * declares. The day `packages/kernel` holds `if (list === 'gold')` or `'bank-hsbc-eg'`, one use case
 * has a branch nobody else can declare, and removing it is a migration rather than an uninstall.
 * The twelve core packages were measured on 22 September with comments stripped, and held no such
 * word in code, which is exactly the state that decays unwatched: every earlier hit had been a
 * comment, and nothing said so the day a real one landed.
 *
 * WORDS, NOT SUBSTRINGS. The first version of the word list was a case-folded substring test, and
 * over `apps/web/src` it went red on `loadingOlder` five times, because `ngOlder` folds to a string
 * that contains `gold`. No core package has such an identifier
 * yet, so the substring gate would have read green here until the first `pendingOlder` in the kernel
 * failed it on nothing. So every identifier and literal is split into parts at a case change, `_`,
 * `-`, `.` and `$`, the parts are case-folded, and a word is a hit when one part, or a run of
 * neighbouring parts joined, STARTS WITH it.
 *
 * STARTS WITH, AND NOT EQUALS, AND JOINED, AND NOT ONE PART AT A TIME. Measured over
 * `apps/web/src`: a part that had to equal the word found 10 of the 17 real hits, dropping both
 * `Egyptian` lines because `egyptian` is not `egypt`. A part at a time would miss `instaPay`, whose
 * word is two parts. Starting a match only at a part boundary is what keeps `loadingOlder` out: its
 * parts are `loading` and `older`, and neither run begins `gold`. The negative directory holds one
 * file for each of those three shapes and one holding `loadingOlder`, so the rule is proved in both
 * directions every time `self-test` runs it. Run over those four files on 23 September, a
 * substring match named all four, `loadingOlder` among them, and a part that had to equal the word
 * named only the `hsbc-eg` one.
 *
 * COMMENTS ARE NOT CODE, and they are found by a lexer rather than blanked by a pattern. A comment
 * that says why the kernel refuses a `gold` list is the kernel explaining itself, and a gate that
 * went red on it would be measuring the wrong thing. The first probe used
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
 * `salaries` IS NOT A HIT. `salary` is the word, and `salari...` does not start with it. The stem
 * `salar` was an option; the tree has no `salaries` in scope today, so it is not added on
 * speculation.
 *
 * A PRIVATE LIST BESIDE THE PUBLIC ONE. Some words are worth keeping out of the core and not worth
 * publishing: the names of one owner's own products, hosts and people. They live in
 * `private-words.local.json` beside this file, which git ignores, and a machine that has it guards
 * them exactly as it guards `WORDS`. A machine without it reads the tracked list alone, and every
 * seeded count in `self-test` is made of tracked words, so the file changes no count there.
 *
 * AND A LOCAL LIST OF THEIR HASHES, NEVER TRACKED. A salted hash still confirms a guess, so a public
 * repository holding one would say which names were on it. `~/.braindog/private-words.hashes.json` holds a
 * hash and a length for each, and the gate hashes every window of that length that starts at a part
 * boundary. A machine without the file bans only the words this gate holds itself. A hit prints the
 * file and the line and never the word or the token; the private file, where a machine has it, is
 * still how its owner sees which word it was. `node tools/gates/shell-words.mjs --hash <word>` adds one.
 *
 * AND THE HASHES ARE READ IN TESTS TOO, where the tracked words are not. A test may say `payroll`,
 * because a test of the core has to hand a record a use case; it has no reason to name a client.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/**
 * THE PUBLIC WORDS OF ONE COUNTRY THAT THE KERNEL HOLDS TODAY: five card processors and four places.
 * `packages/kernel/src/identity-keys.ts` strips them off a payee so two spellings of one shop are one payee, which is
 * one country's banking written into the part every record runs. They are public names, so they are listed and
 * printed like any tracked word; the owner's own names are the hashes below and are never printed.
 *
 * EACH IS HELD WHERE IT STANDS TODAY, in `HELD` under `OUT`, until SHL-A07 takes the words out of the kernel and an
 * add-on declares them. Measured on 13 October, the day they were added: 22 places in 6 files, 9 of them in
 * `identity-keys.ts`, and none anywhere else in the code this gate reads.
 */
export const PUBLIC_WORDS = ['geidea', 'paymob', 'fawry', 'kashier', 'paytabs', 'cairo', 'giza', 'maadi', 'zamalek'];

/**
 * The names of use cases, banks, products and people this tree has had to keep out of the core.
 * Each is the start of a part, case-folded: see the header for why a match must begin at a part
 * boundary and why it may run on past one.
 */
export const WORDS = [
  'gold', 'hsbc', 'instapay', 'egypt', 'salary', 'payroll', 'mercury', 'registrar', 'egp', 'quartz', 'payday',
  'goldapi',
  ...PUBLIC_WORDS,
];

/**
 * THE PRIVATE WORDS, READ WHEN THE FILE IS THERE. `private-words.local.json` is a JSON array; each
 * entry is a word, or `{ "word": "...", "whole": true }` for one that must end where a part ends.
 * `BRAINDOG_PRIVATE_WORDS` names another file, which is how a test aims the gate at a list of its own.
 *
 * A FILE THAT IS THERE AND CANNOT BE READ IS A THROW, never an empty list: a broken private list read
 * as none would pass every word it was written to catch.
 */
const PRIVATE = process.env.BRAINDOG_PRIVATE_WORDS ?? fileURLToPath(new URL('./private-words.local.json', import.meta.url));

function privateWords(file) {
  if (!existsSync(file)) return [];
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${file} must hold a JSON array of words.`);
  return list.map((e) => {
    const entry = typeof e === 'string' ? { word: e, whole: false } : { word: e?.word, whole: e?.whole === true };
    if (typeof entry.word !== 'string' || !/^[a-z0-9]+$/.test(entry.word))
      throw new Error(`${file}: ${JSON.stringify(e)} is not a lower-case word.`);
    return entry;
  });
}

const PRIVATE_WORDS = privateWords(PRIVATE);

/**
 * THE WORDS THAT MUST END WHERE A PART ENDS, because what starts with them is ordinary English.
 *
 * NONE OF THE TRACKED WORDS IS ONE, AND A PRIVATE WORD MAY BE. The first such word was measured
 * before it was made one: matched the way every other word is, its one hit over the scope this gate
 * reads was `'bakery'`, a signal the guide reads to know a person runs a shop
 * (`packages/seed/src/usecases/guide-kinds.ts`). That is the `loadingOlder` mistake again, a word
 * found inside a longer one it has nothing to do with. Whole, a word is still a hit where a part, or
 * a run of parts joined, equals it, and not in the longer English words that start with it.
 */
const WHOLE = new Set(PRIVATE_WORDS.filter((e) => e.whole).map((e) => e.word));

/** Every word this run reads: the tracked list and whatever the private file adds. */
const ALL = [...new Set([...WORDS, ...PRIVATE_WORDS.map((e) => e.word)])];

/**
 * THE HASHED WORDS, read from `private-words.hashes.json` in `~/.braindog`, or from the file
 * `BRAINDOG_PRIVATE_HASHES` names, which is how a test or a planted tree aims the gate at hashes of its own.
 *
 * NO FILE IS NO HASHES. The list is the owner's and is never tracked: a salted hash stops nobody who
 * already guesses a word, so publishing one confirms the guess.
 *
 * SALTED WITH THE GATE'S NAME, so a table of plain sha256 digests of common words does not read the
 * file at a glance.
 */
const HASHES = process.env.BRAINDOG_PRIVATE_HASHES ?? join(homedir(), '.braindog', 'private-words.hashes.json');

export const hashOf = (word) => createHash('sha256').update(`braindog shell-words ${word}`).digest('hex');

function privateHashes(file) {
  if (!existsSync(file)) return [];
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(doc?.hashes)) throw new Error(`${file} must hold { "hashes": [...] }.`);
  return doc.hashes.map((e) => {
    if (typeof e?.hash !== 'string' || !/^[0-9a-f]{64}$/.test(e.hash) || !Number.isInteger(e.length) || !(e.length > 1))
      throw new Error(`${file}: ${JSON.stringify(e)} is not a hash and a length.`);
    return { hash: e.hash, length: e.length, whole: e.whole === true };
  });
}

/**
 * THE HASHES, KEYED, AND WHICH OF THEM THIS MACHINE CAN NAME. A hash whose word is in the private file
 * is matched by name in the core already, so the core's pass leaves it to that; the pass over tests,
 * which reads no names, still reads it, and says the word, because a machine holding the file is its owner's.
 */
const HASHED = new Map(privateHashes(HASHES).map((e) => [e.hash, e]));
const KNOWN = new Map(PRIVATE_WORDS.map((e) => [hashOf(e.word), e.word]));

/**
 * Every package and every app is in scope by default, so a new core package is watched the day it exists.
 *
 * `packs` IS THE THIRD WORKSPACE ROOT AND IS LEFT OUT ON PURPOSE, the one text gate that does not read
 * it (testing found all four text gates reading only these two). These words are the use cases the
 * core must not name, and a pack is exactly where a use case goes: a gold rate or a bank's pattern
 * lives in a record or a shared pack, never in `packages/`. It is `packages/seed`'s exemption below,
 * for the directory that took over its job.
 * Measured on 24 September with `hitsIn` over `packs/`: read as this gate reads, 2 files and 0 hits,
 * so adding it would have cost nothing today; and `packs/mercury/mercury.pack.json` names `mercury`
 * 11 times, so the first script that pack grows would have gone red for naming itself.
 * `tools/gates/test/packs-read.test.mjs` holds the decision: `'mercury'` in a pack is green, the same
 * line in a core package is red.
 */
const WORKSPACES = ['packages', 'apps'];

/**
 * THE DIRECTORIES OF EACH MEMBER THAT ARE READ, per workspace. `src` everywhere, and beside it the
 * other directories each workspace ships code from: a package's `grammars`, which the MCP server serves
 * to every agent, and its `svelte`, the renderer's components every page draws with; and an app's
 * `scripts`, which its operator runs. See `SOURCE` below for what each held when it was not read.
 */
const READ = { packages: ['src', 'grammars', 'svelte'], apps: ['src', 'scripts'] };

/**
 * WHAT IS OUT, AND WHY. Every entry is a path under the root, a directory or a file, and every
 * entry has to go on earning its place: an entry whose path is present and exempts no hit is itself
 * a finding, because an exemption that exempts nothing is a hole waiting for the next word. That is
 * why `apps/cli/src/install.ts` is not here: measured on 23 September it holds no word in code, so
 * exempting it would only have hidden the first one.
 *
 * `words`, WHERE AN ENTRY HAS IT, NARROWS THE ENTRY TO THOSE WORDS, each with its own reason.
 * `apps/cli/src/main.ts` is the whole command line, and exempting the file for one help line would
 * have exempted every other word written there too.
 *
 * AND AN ENTRY WHOSE REASON IS THE WORDS IT HOLDS HAS TO NAME THEM. The first version narrowed only
 * `main.ts`, and three other entries each exempted all ten words while their reasons covered one or
 * three. Measured on a seeded root, and again on 23 September over the `apps` half of
 * `negative/shell-words`: `'bank-hsbc-eg'` in `apps/site/src`, `'acme-payroll'` in
 * `apps/cli/src/import.ts` and three more read green, the gate saying `12 in the 6 exempted paths`
 * and exit 0. Narrowed, it names all five.
 * An exempted word that exempts no hit is a finding for the same reason an idle entry is: it is the
 * hole the next leak of that word walks through.
 *
 * NO ENTRY STAYS OUT WHOLE. `packages/seed` was exempted whole while it held the use-case packs, a
 * bank's wordings and a person's holdings among them, and a pack is where a use case is allowed to be
 * named. Those are under `packs/` now, which this gate leaves out by `WORKSPACES`, and what stays in
 * `packages/seed` is the generic modules, the guide and the sample, which is core and is read as core.
 * `apps/web` was exempted whole while it waited for a gate of its own. Measured on 25 September with
 * the full list, the two held 5 and 2 hits, against 82 and 11 on 23 September with ten words; a sixth
 * in the seed was `bakery`, which `WHOLE` explains. Each became an entry naming its file and its
 * words: an exemption the size of a tree is how a leak the size of the kernel's in either would have
 * read green.
 *
 * AND FIVE OF THE SEVEN WERE REWORDED THE SAME DAY, so their entries went. Three were the Kiln
 * sample's `registrar` in the seed, and the web's two were `EGP` among the common currencies and the
 * web copy of the sample's own figure. Measured when those words went and the entries had not: the
 * gate named every one of their files as exempted and idle and exited 1.
 *
 * AND THE SIXTH WENT WITH estate 1.3.0. Estate's Services line said a row held `a renewal date, a
 * registrar and a cost`, and it was kept out while it could not change: `holds` on `register.services`
 * is part of what `packages/seed/test/pack-versions.test.ts` fingerprints, and estate 1.2.0 had been on
 * `origin/master` since `8b8915e4`, so a reword under 1.2.0 would have left a record holding the old
 * words while the pack said it declared the new ones. It says `who it is with` at 1.3.0, and its entry
 * went in the same change, because an entry left idle is a finding. What is left is the guide's
 * `payday`, which is a word a stranger types, and the public site's copy.
 *
 * `*.test.ts` and any `test` directory are out by rule rather than by entry, because a test asserts
 * on what a record was handed: `packages/record/test/ask-person-reach.test.ts` arrives
 * `'Payroll: Omar 91000'` to prove the owner keeps her own question, and it cannot say so in any
 * other words.
 *
 * The hit counts are 25 September's, from this gate's own reading.
 */
const EXEMPT = {
  /* A WORD A STRANGER TYPES, read to tell which kind of record they want, and not a use case the core
     runs: the guide hears `payday` and offers Personal. */
  'packages/seed/src/usecases/personal.ts': {
    why: 'the guide signals for Personal, and its own pay-day parser matches what a person typed (2 hits).',
    words: {
      payday: 'a word a person says about their own money, in the list the guide matches what they type against.',
      salary: '`PAY_WORDS` at line 610 matches a sentence like "my salary" as pay, for `payDayRow`: a phrase read out of the record\'s own words, never a branch on which use case is installed.',
    },
  },
  'packages/seed/src/usecases/index.ts': {
    why: 're-exports Personal\'s own row builder by its own name, the way a use case\'s own builders sit beside it (2 hits).',
    words: { payday: '`export { payDayRow, type PayDay } from \'./personal.ts\';`, requested for `propose.ts`: a name carried through, not a branch taken on it.' },
  },
  'apps/web/src/lib/start/propose.ts': {
    why: 'the one call site named for `personal.ts`\'s own row builder (2 hits).',
    words: {
      payday: 'the import and the one call of `payDayRow`, only reached inside `u?.usecase === \'personal\'`: Personal\'s pack, not this shell, decided pay day is a row, and this file only carries its name to the one place `personal.ts` cannot seed it from.',
    },
  },
  'apps/site': {
    why: 'the public site is prose about the product, not code that runs a record (9 hits).',
    words: {
      egypt: 'the changelog entry at `routes/changelog/entries.ts:569` says `Egyptian pounds` about a currency fix that shipped.',
      quartz: '`legalName` in `lib/site/seo.ts` and the docs\' line "BrainDog is made by Quartz Apps LLC": the company that makes BrainDog, as the mail footer names it.',
    },
  },
  'packages/seed/src/changelog.ts': {
    why: 'a module\'s own changelog, read on its detail page: prose about what shipped, not a branch on a use case (4 hits).',
    words: {
      registrar: 'people 2.0.0\'s and estate 1.3.0\'s notes name the role value People stopped offering, the same way the site\'s changelog names history.',
      gold: 'money-core\'s note says net worth is kept "in dollars and grams of gold too": what shipped, said to the person reading it.',
    },
  },
};

/* THE EXEMPT PATHS, BY THE NAME THE LEDGER READS THEM UNDER: `ledger.json` holds `shell-words.EXEMPT`
   at its newest line, so this list only shrinks, and a fall is a line written there. */
export { EXEMPT };

/**
 * WHAT IS HELD UNTIL A UNIT TAKES IT OUT, AND WHICH UNIT. `EXEMPT` is what may stay: prose, a sender's name, a word a
 * stranger types. `HELD` is what may not, and stands only because the unit that moves it has not run: the nine
 * `PUBLIC_WORDS`, in the six files that spell one in code today, and since 30 October six files round 1030 wrote,
 * held at his word to deploy. Every entry names its words, as an `EXEMPT` entry does, and `until` names the unit that
 * ends it.
 *
 * ONE ENTRY SITS UNDER AN `EXEMPT` PATH, the site's changelog under `apps/site`, and a file is read against every
 * entry that covers it. The word could not go into `apps/site`'s own words: an entry's word that exempts nothing is a
 * finding, and `negative/shell-words` plants a site with no such word in it, so its ten findings became eleven.
 *
 * A LIST OF ITS OWN, AND NOT FIVE MORE PATHS IN `EXEMPT`, because the ledger holds `shell-words.EXEMPT` at 6 and a held
 * list only shrinks: widening the gate by nine words found 22 places in six files the old list never named, and writing them into
 * `EXEMPT` would have been a rise with no word of the owner's behind it. `ledger.json` holds `shell-words.HELD` from its
 * first line, so this list only shrinks too. Five of its six entries go with SHL-A07.
 *
 * The hit counts are 13 October's, from this gate's own reading.
 */
export const HELD = {
  'packages/kernel/src/identity-keys.ts': {
    why: 'the kernel strips one country\'s card processors and places off a payee, so two spellings of one shop are one payee (9 hits).',
    until: 'SHL-A07',
    words: {
      geidea: '`PROCESSORS` at line 186, the prefixes a card terminal writes before the shop\'s name.',
      paymob: '`PROCESSORS` at line 186.',
      fawry: '`PROCESSORS` at line 186.',
      kashier: '`PROCESSORS` at line 186.',
      paytabs: '`PROCESSORS` at line 186.',
      cairo: 'the places at line 247, which a bank text writes after the merchant.',
      giza: 'the places at line 247.',
      maadi: 'the places at line 247.',
      zamalek: 'the places at line 247.',
    },
  },
  'packages/kernel/src/backfill.ts': {
    why: 'the backfill tells a merchant\'s line by the same processors, in two patterns (8 hits).',
    until: 'SHL-A07',
    words: {
      paymob: '`MERCHANT_SHAPE` at line 303 and `PROCESSOR_PREFIX` at line 309.',
      fawry: '`MERCHANT_SHAPE` and `PROCESSOR_PREFIX`.',
      kashier: '`MERCHANT_SHAPE` and `PROCESSOR_PREFIX`.',
      paytabs: '`MERCHANT_SHAPE` and `PROCESSOR_PREFIX`.',
    },
  },
  'packages/kernel/src/declare.ts': {
    why: 'two refusals give an example in one country\'s words (2 hits).',
    until: 'SHL-A07',
    words: {
      cairo: 'the refusal at line 3033 gives `Africa/Cairo` as its example of a time zone.',
      fawry: 'the refusal at line 3256 gives `["FAWRY*"]` as its example of a prefix to strip.',
    },
  },
  'packages/kernel/src/provision.ts': {
    why: 'the refusal of a zone that is no place gives an example (1 hit).',
    until: 'SHL-A07',
    words: { cairo: 'the sentence at line 261 gives `Africa/Cairo` as its example of a place\'s time zone.' },
  },
  'apps/site/src/routes/changelog/entries.ts': {
    why: 'a changelog entry about a fix that shipped names one city beside London (1 hit).',
    until: 'SHL-A20',
    words: { cairo: 'the entry at line 593 says an amount reads one way in Cairo and another in London. It is prose and may well stay; SHL-A20, where the line is held by itself, says whether it is reworded or moves to `EXEMPT`.' },
  },
  'packages/record/src/grammar.ts': {
    why: 'the grammar an agent reads gives an example of a zone (1 hit).',
    until: 'SHL-A07',
    words: { cairo: 'the `tz` line at 379 gives `Africa/Cairo` as its example, the same one the kernel\'s refusal gives.' },
  },
  /* HELD ON 30 OCTOBER, at his word to deploy ("yes yes yes go go go"): what round 1030's code spelled of one use case.
     The same day SHL-A22 moved the widget templates into each pack's `widgets` and SHL-A23 put money-core's gold,
     Mercury, Stripe and pay words behind declarations, which took four of the six out; these two stay, each saying why. */
  'packages/render/src/widgets.ts': {
    why: 'the widget catalogue says an example rate in the record\'s own currency, from a table of thirty (1 hit).',
    until: 'SHL-A22',
    words: {
      egp: 'one row of `SAMPLE_DOLLARS`, the example rate a record in that currency is shown. Every currency is a row, and taking the one out would change what an EGP record sees; it goes when the table moves to EXEMPT or into the rates the record keeps.',
    },
  },
  'packages/seed/src/modules/money/lists/snapshots.ts': {
    why: 'the nightly snapshot keeps net worth in grams of gold (2 hits).',
    until: 'SHL-A23',
    words: { gold: 'the `worth_gold` field. The kernel reads it off what Holdings\' gold rates declare (`restates`) since 30 October and names no gold; the field itself moves to Holdings only with a major money-core step and a move of the nights already kept, which waits on his word.' },
  },
};

/** Every path that is out, for either reason. One path is in one list or the other, never both: the throw holds it. */
const OUT = { ...EXEMPT, ...HELD };
for (const p of Object.keys(HELD)) if (Object.hasOwn(EXEMPT, p)) throw new Error(`shell-words: ${p} is in EXEMPT and in HELD. A path is out for one reason.`);

/**
 * THE FILES A CORE PACKAGE SHIPS: its `src`, without tests.
 * `.svelte` is read too, with its HTML comments blanked first, because a component's markup is code
 * a stranger's record runs.
 *
 * AND `src` IS NOT ALL A PACKAGE SHIPS. Measured on 23 September: `packages/render/svelte` holds the
 * renderer's 32 components (0 hits), and `packages/mcp/grammars/script.ts`, which
 * `packages/mcp/src/index.ts` imports and serves as `braindog:grammar/script`, holds 9, all `gold`,
 * in its `script.gold-rate` example. Neither directory was read here.
 *
 * `grammars` AND `scripts` ARE READ SINCE 25 SEPTEMBER, after that example was rewritten as a rate
 * fetch against `api.example.com`: read then, the four `apps/*\/scripts` directories and
 * `packages/mcp/grammars` held 0 hits between them, so the scope widened on a clean tree and the
 * first example that names a use case there is the first red. `packages/render/svelte` is read since 9
 * October, when its 39 components held 0 hits as they had on 23 September, and
 * `negative/shell-words-svelte` plants the first one.
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

/**
 * THE TESTS OF A MEMBER, for the hashes only: every test file anywhere in it and every file under a
 * `test` directory, its fixtures among them. The whole member is walked, because a test sits beside
 * its code in `src` as often as it sits in `test/`.
 */
function walkTests(dir, out, inTest = false) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkTests(full, out, inTest || name === 'test');
    else if (SOURCE.test(name) && (inTest || TEST.test(name))) out.push(full);
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
 *
 * `literals`, WHEN A CALLER HANDS A LIST, IS FILLED WITH WHERE EACH STRING'S TEXT IS: `[from, to]` for the inside of
 * every quoted string and every run of a template between its interpolations. `core-names` reads names only where
 * they are spelled as a string, and this lexer is the one place that already knows a quote inside a regular
 * expression from the start of a string.
 */
export function uncomment(source, literals = null) {
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
    const from = i;
    while (i < n) {
      const c = source[i];
      if (c === '\\') i += 2;
      else if (c === '`') {
        literals?.push([from, i]);
        i++;
        last = 'literal';
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        literals?.push([from, i]);
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
      const from = i;
      while (i < n && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
      literals?.push([from, Math.min(i, n)]);
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
 * THE LONGEST WORD AT ONE PLACE, AND NOT EVERY WORD THAT FITS THERE. `gold` is a prefix of `goldapi`,
 * so with the list matched in full `api.goldapi.io` was two hits, and every seeded count in `self-test` would have been a count of words
 * rather than of places a word was written. Measured on 25 September with this rule taken out: the
 * seeded tree in `negative/shell-words` read 13 findings for its 10 places. A shorter word is dropped
 * only when a longer one starts at the same part; `goldHsbc` still names both, because they start at
 * different parts.
 */
export const wordsWith = ({ words, whole }) => (token) => {
  const parts = partsOf(token);
  const found = new Set();
  for (let i = 0; i < parts.length; i++) {
    const run = parts.slice(i).join('');
    const here = words.filter((word) => (whole.has(word) ? endsAt(parts, i, word) : run.startsWith(word)));
    for (const word of here) if (!here.some((other) => other !== word && other.startsWith(word))) found.add(word);
  }
  return [...found];
};

/**
 * `wordsIn` OVER THIS RUN'S LIST, the tracked words and the private ones. `wordsWith` is the same
 * reading over a list a test hands it, so a test can prove the `WHOLE` rule without naming a private word.
 */
export const wordsIn = wordsWith({ words: ALL, whole: WHOLE });

/**
 * THE HASHED WORDS ONE TOKEN HOLDS, as the hashes themselves: `wordsWith`'s reading with a digest where
 * the word was. Each window starts at a part boundary and is as long as a hashed word, read on over
 * later parts the way `run.startsWith(word)` is; a `whole` entry's window must also end where a part
 * ends. A window inside a part is never hashed, so `loadingOlder` stays out here for the reason it does above.
 *
 * ONE READING PER TOKEN TEXT, KEPT FOR THE RUN. A file says `const`, `value` and `ok` hundreds of times, so each
 * distinct token is hashed once in a run, however often it is written.
 */
export const hashedWith = (hashed) => {
  const lengths = [...new Set([...hashed.values()].map((e) => e.length))];
  const seen = new Map();
  return (token) => {
    if (lengths.length === 0) return [];
    let found = seen.get(token);
    if (found) return found;
    const parts = partsOf(token);
    const hits = new Set();
    for (let i = 0; i < parts.length; i++) {
      for (const length of lengths) {
        let run = '';
        let j = i;
        while (j < parts.length && run.length < length) run += parts[j++];
        if (run.length < length) continue;
        const e = hashed.get(hashOf(run.slice(0, length)));
        if (e && e.length === length && (!e.whole || run.length === length)) hits.add(e.hash);
      }
    }
    found = [...hits];
    seen.set(token, found);
    return found;
  };
};

/** `hashedWith` over this run's hashes. */
export const hashedIn = hashedWith(HASHED);

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
export function hitsIn(source, markup = false, read = wordsIn) {
  const text = uncomment(markup ? source.replace(/<!--[\s\S]*?-->/g, blank) : source);
  const hits = [];
  let line = 1;
  let seen = 0;
  for (const m of text.matchAll(TOKEN)) {
    for (; seen < m.index; seen++) if (text[seen] === '\n') line++;
    for (const word of read(m[0])) hits.push({ line, word, token: m[0] });
  }
  return hits;
}

/**
 * HOW A HASHED HIT IS PRINTED: the file, the line and the word's length, never the word or the token
 * that carried it, because CI's log is public. A machine whose private file names the word says it.
 */
const privateLine = (rel, line, hash) =>
  `  ${rel}:${line}  ${KNOWN.has(hash) ? `${KNOWN.get(hash)}, a private word` : `a private word of ${HASHED.get(hash).length} letters`}`;

/**
 * A TOKEN A USE-CASE FINDING QUOTES, unless it also carries a private word this machine cannot name. Measured on 9
 * October with `zephyrinePayroll` planted and `zephyrine` hashed: the hashed line hid the word and the `payroll`
 * line beside it printed the whole token, so the log said the word anyway.
 */
const shown = (token) => (hashedIn(token).some((h) => !KNOWN.has(h)) ? 'a name that also holds a private word' : token);

/** Every entry that covers one file: its own, and one for a directory above it. */
const outsOf = (rel) => Object.keys(OUT).filter((p) => rel === p || rel.startsWith(p + '/'));

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
  const tests = [];
  for (const workspace of WORKSPACES) {
    let members;
    try {
      members = readdirSync(join(ROOT, workspace), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const m of members) {
      if (!m.isDirectory() || skipDir(m.name)) continue;
      for (const dir of READ[workspace]) walk(join(ROOT, workspace, m.name, dir), files);
      walkTests(join(ROOT, workspace, m.name), tests);
    }
  }

  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is this directory's word for "could not run". */
  if (files.length === 0) {
    console.log(`  shell-words: no packages/*/{src,grammars,svelte} or apps/*/{src,scripts} under ${ROOT}, so no code was read`);
    return 3;
  }

  const findings = [];
  const exempted = new Map(Object.keys(OUT).map((p) => [p, 0]));
  /* One count per word an entry names, keyed `path word`, so a word that exempts nothing is seen. */
  const byWord = new Map(
    Object.entries(OUT).flatMap(([p, e]) => Object.keys(e.words ?? {}).map((w) => [`${p} ${w}`, 0])),
  );
  /* A HASHED WORD IS NEVER EXEMPTED: no reason in `OUT` is a reason to name a client. */
  let hidden = 0;
  let read = 0;
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    const markup = file.endsWith('.svelte');
    for (const h of hitsIn(text, markup, hashedIn)) if (!KNOWN.has(h.word)) findings.push(privateLine(rel, h.line, h.word)), hidden++;
    const hits = hitsIn(text, markup);
    const outs = outsOf(rel);
    if (outs.every((p) => OUT[p].words)) read++;
    for (const h of hits) {
      /* THE ENTRY THAT NAMES THIS WORD, among those that cover the file, so each hit is counted to the reason given for it. */
      const out = outs.find((p) => (OUT[p].words ? Object.hasOwn(OUT[p].words, h.word) : ALL.includes(h.word)));
      if (out !== undefined) {
        exempted.set(out, exempted.get(out) + 1);
        if (OUT[out].words) byWord.set(`${out} ${h.word}`, byWord.get(`${out} ${h.word}`) + 1);
      } else findings.push(`  ${rel}:${h.line}  ${h.word}, in ${shown(h.token)}`);
    }
  }

  /* THE SECOND PASS, OVER TESTS, FOR THE HASHES ALONE. Read the way code is, comments blanked, so a
     test's line numbers are the file's and a finding here is a name a test hands a record. */
  for (const file of tests) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    for (const h of hitsIn(readFileSync(file, 'utf8'), file.endsWith('.svelte'), hashedIn)) findings.push(privateLine(rel, h.line, h.word)), hidden++;
  }

  /* AN EXEMPTION THAT EXEMPTS NOTHING IS A FINDING, for the reason `OUT` gives. Only for a path that
     is there: a tree without `apps/site` has nothing to say about it. */
  const idle = [...exempted].filter(([p, n]) => n === 0 && existsSync(join(ROOT, p)));
  for (const [p] of idle)
    findings.push(`  ${p} is exempted and holds no use-case word in code. Take it out of OUT, so the next word there is seen.`);

  /* AND A WORD THAT EXEMPTS NOTHING IS ONE TOO, once its path is not already idle, because then the
     line above has said it. Measured on a root holding only a file exempted for
     `gold` and `registrar`, with `gold` in it and no `registrar`: with this block cut out the gate said `2 in
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
      `  shell-words: 0 use-case words in code over ${read} core files; ${held} in the ${Object.keys(OUT).length} exempted paths; ` +
        `0 of ${HASHED.size} private words in those files or ${tests.length} test files`,
    );
    return;
  }
  for (const f of findings) console.error(f);
  /* TWO SENTENCES, ONE PER KIND, so a red made only of hashed words does not call itself a use case. */
  const plain = findings.length - hidden;
  console.error(`\n  shell-words: ${findings.length} finding(s).`);
  if (plain > 0)
    console.error(
      `  ${plain === findings.length ? 'Each is' : `${plain} ${plain === 1 ? 'is' : 'are'}`} a use case named in the core's code. The core runs whatever a\n` +
        '  pack declares and knows none of it by name: move the word into the pack that owns it, and let the\n' +
        '  core read it off the declaration.',
    );
  if (hidden > 0)
    console.error(
      `  ${hidden === findings.length ? 'Each is' : `${hidden} ${hidden === 1 ? 'is' : 'are'}`} a private word named in the core or its tests, found by its hash and\n` +
        "  never printed: the owner's own names stay out of shared code, and a test says what it needs with an\n" +
        '  invented one.',
    );
  return 1;
}

/**
 * `--hash <word>` ADDS ONE WORD TO THE TRACKED HASHES, and `--whole` beside it makes the word one that
 * must end where a part ends, for `WHOLE`'s reason. It prints the length and never the word, so the
 * line can be pasted anywhere. A word already there is said and left; a word that is not a lower-case
 * run of letters and digits is refused, because no part the gate reads could ever hash to it.
 */
export function addHash(word, whole = false, file = HASHES) {
  const w = String(word ?? '').toLowerCase();
  if (!/^[a-z0-9]{2,}$/.test(w)) {
    console.error('  shell-words --hash: give one word of letters and digits, two or more of them.');
    return 1;
  }
  const doc = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { hashes: [] };
  const hash = hashOf(w);
  if (doc.hashes.some((e) => e.hash === hash)) {
    console.log(`  shell-words --hash: that word of ${w.length} letters is already banned, ${doc.hashes.length} in all`);
    return;
  }
  doc.hashes.push({ hash, length: w.length, ...(whole ? { whole: true } : {}) });
  doc.hashes.sort((x, y) => x.hash.localeCompare(y.hash));
  writeFileSync(file, `${JSON.stringify(doc, null, '  ')}\n`);
  console.log(`  shell-words --hash: a word of ${w.length} letters added, ${doc.hashes.length} in all. Commit the file.`);
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture and the header
   documents the command line. `?? 0` because a pass returns nothing. */
if (import.meta.main) {
  const [, , ...args] = process.argv;
  process.exitCode =
    (args[0] === '--hash' ? addHash(args.find((a, i) => i > 0 && a !== '--whole'), args.includes('--whole')) : shellWords(args[0])) ?? 0;
}
