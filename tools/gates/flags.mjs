/**
 * A flag mechanism with no removal story is permanent branching with extra steps.
 *
 *   node tools/gates/flags.mjs
 *
 * `dead-copy` exists because "a sentence this product types and nobody reads" is rot that looks like
 * a feature. A flag is the same rot one level up, and worse in two ways: a dead string is inert and
 * a dead branch is a fork in every reader's head, and `dead-copy` CANNOT SEE IT. Its own header
 * names the hole - it greps source, so `copy.restored` inside an `{#if}` that is statically false
 * "counts as rendered". Eight Cloud sentences shipped that way. Every flag is that `{#if}` by
 * construction, so every flag reopens the hole unless something else is watching.
 *
 * THE SIX QUESTIONS, and each names the failure it prevents:
 *
 *   1. Is every declared flag read?           A flag nobody reads is a branch nobody takes.
 *   2. Is every read flag declared?           A flag with no expiry, no owner and no removal issue.
 *   3. Is any flag past its `until`?          The only way branching becomes permanent is by nobody
 *                                             being told the day it should have gone.
 *   4. Is any flag's window over the budget?  Caught the day it is added rather than ninety later.
 *   5. Is any flag read too many times?       A flag read in nine places is nine branches to delete,
 *                                             and the ninth is the one that gets left behind.
 *   6. Does each flag reach the artefact?     `prefs`'s argument, applied to a branch: "a preference
 *                                             that changes nothing is a control that lies."
 *
 * QUESTION 6 IS WHY THERE IS A SECOND BUILD. `apps/web/package.json` already builds three extra
 * records because "a screen that branches on a fact about the record has a half no gate can reach";
 * `BRAINDOG_FLAGS=invert` is one more build, not two to the power of the number of flags, and it is
 * the half of every flag the shipped artefact does not contain. Without it the browser gates measure
 * one side of every branch and report green about the other.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { budget, skipDir } from './lib.mjs';

const F = budget('flags');

const ROOT = process.env.BRAINDOG_GATE_ROOT ?? process.cwd();
const SRC = join(ROOT, 'apps', 'web', 'src');
const DECL = join(SRC, 'lib', 'flags.ts');
const PREF = join(SRC, 'lib', 'pref.ts');
const SHIPPED = join(ROOT, 'apps', 'web', 'build');
const INVERTED = join(ROOT, 'apps', 'web', 'build-flags');

const findings = [];
const say = (line) => findings.push(line);

/* -- reading the declarations ---------------------------------------------- */

/**
 * A quoted string, a boolean or `null`, from the right-hand side of one line.
 *
 * ONE FIELD PER LINE, AND THE GATE SAYS SO WHEN IT IS NOT. Every gate in this directory reads
 * TypeScript as text - `closed-lists` walks SQL out of a migration, `event-kinds` walks an array out
 * of `events.ts`, `dead-copy` takes `copy.ts`'s keys off a two-space indent - because a parser would
 * be a second thing that can be wrong. The cost is that the format has to be one this can be trusted
 * on, and a declaration this gate cannot read is a declaration nothing checks, which is worse than a
 * red line. So it is red instead.
 */
function literal(raw) {
  const t = raw.trim().replace(/,$/, '').trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  const quoted = /^(['"`])([\s\S]*)\1$/.exec(t);
  return quoted ? quoted[2] : undefined;
}

/** Every flag in `FLAGS`, by name, with the fields this gate asserts on. */
function declarations(source) {
  const out = new Map();
  const opened = source.indexOf('export const FLAGS = {');
  if (opened < 0) return out;
  const body = source.slice(opened);

  /* TOP-LEVEL KEYS ONLY - two spaces of indent, opening a block. `copy.ts`'s convention and
     `dead-copy`'s parse, because two files with the same shape should be read the same way. */
  const blocks = body.matchAll(/^ {2}([A-Za-z]\w*): \{\n([\s\S]*?)^ {2}\},$/gm);
  for (const [, name, inner] of blocks) {
    const fields = {};
    for (const [, key, value] of inner.matchAll(/^ {4}([A-Za-z]\w*): (.*)$/gm)) fields[key] = literal(value);
    out.set(name, fields);
  }
  return out;
}

/* LINE ENDINGS NORMALISED ON THE WAY IN. `.gitattributes` sets `eol=lf`, so this is belt and
   braces rather than a fix - but the block parse below anchors on `$`, and under CRLF every one of
   those anchors silently matches nothing. A parse that returns an empty list is a gate that goes
   green having read no declarations at all, which is the one failure mode this directory exists to
   stop. */
const CRLF = /\r\n/g;
const source = await readFile(DECL, 'utf8')
  .then((t) => t.replace(CRLF, '\n'))
  .catch(() => null);
if (source === null) {
  console.log('  flags: no apps/web/src/lib/flags.ts to read');
  process.exit(3);
}
const FLAGS = declarations(source);

/* -- reading the uses ------------------------------------------------------ */

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipDir(entry.name)) continue;
    const at = join(dir, entry.name);
    if (entry.isDirectory()) await walk(at, out);
    /* A TEST IS NOT A CONSUMER, and `dead-copy` paid to learn it: twelve `copy.*` keys named only by
       `deployment.test.ts` counted as rendered, "so a screen could lose its only call site and this
       gate would say nothing, propped up by the file asserting the sentence is there." A flag whose
       only reader is `flags.test.ts` is a flag with no branch behind it at all. */
    else if (/\.test\.ts$/.test(entry.name)) continue;
    else if (/\.(ts|svelte)$/.test(entry.name)) out.push(at);
  }
  return out;
}

/**
 * What counts as reading a flag, and the two things that look like it and are not.
 *
 * A MODULE SPECIFIER IS NOT A CALL SITE, and the first run of this gate proved it: `import { flags }
 * from '$lib/flags.ts'` reported a flag called `ts`, read at every consumer and declared nowhere.
 * `flags.ts` is the shape of a flag read and the shape of a file name, and the file name is on every
 * line that uses the real thing.
 *
 * A COMMENT IS NOT A CALL SITE EITHER, which is `colour-grep`'s rule for the same reason: this file
 * is full of prose about `flags.recordAccent`, and so is `flags.ts`. Comments are blanked rather
 * than removed, so a line number still points at the line it came from.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const readable = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)))
    .replace(/\bfrom\s*(['"])[^'"\n]*\1/g, blank)
    .replace(/\bimport\s*(['"])[^'"\n]*\1/g, blank);

const uses = new Map();
for (const file of await walk(SRC)) {
  if (file === DECL) continue;
  const text = readable((await readFile(file, 'utf8')).replace(CRLF, '\n'));
  const where = relative(ROOT, file).replace(/\\/g, '/');
  for (const m of text.matchAll(/\bflags\.([A-Za-z]\w*)\b/g)) {
    const at = text.slice(0, m.index).split('\n').length;
    if (!uses.has(m[1])) uses.set(m[1], []);
    uses.get(m[1]).push(`${where}:${at}`);
  }
}

/* -- 1 and 2: the list and the code say the same thing ---------------------- */

for (const [name] of FLAGS)
  if (!uses.has(name))
    say(
      `      flags.${name} is declared and read nowhere - a branch nobody takes.\n` +
        `        Delete it and the code it was guarding, or point it at the branch it is for.`,
    );

for (const [name, at] of uses)
  if (!FLAGS.has(name))
    say(
      `      flags.${name} is read at ${at[0]} and declared nowhere - it has no owner, no expiry and no removal issue.\n` +
        `        Add it to FLAGS in apps/web/src/lib/flags.ts, with the day it stops being allowed to exist.`,
    );

/* -- 3, 4, 5: the discipline ----------------------------------------------- */

/* TODAY, IN ONE PLACE. A gate that read the clock twice could straddle midnight and report a flag
   as both live and expired in one run - which is a red line nobody can reproduce. */
const today = new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

for (const [name, f] of FLAGS) {
  if (typeof f.until !== 'string' || typeof f.since !== 'string' || typeof f.issue !== 'string') {
    say(
      `      flags.${name} is missing a field this gate reads, or one of them is not on a line of its own.\n` +
        `        Every flag needs why, owner, since, until, issue, ship and proof, one per line.`,
    );
    continue;
  }
  if (f.issue.trim() === '')
    say(
      `      flags.${name} has no issue, so nothing anywhere records why it is still here.\n` +
        `        Name the row or the ticket that removes it.`,
    );
  if (f.until < today)
    say(
      `      flags.${name} expired on ${f.until}, ${days(f.until, today)} day(s) ago. Owner ${f.owner}, tracked at ${f.issue}.\n` +
        `        Take the decision, delete the flag and delete the branch that lost.`,
    );
  else if (days(f.since, f.until) > F.maxDays)
    say(
      `      flags.${name} asks for ${days(f.since, f.until)} days and the budget is ${F.maxDays}.\n` +
        `        A longer window is a decision, and it belongs in tools/gates/budgets.json where somebody reviews it.`,
    );

  const at = uses.get(name) ?? [];
  if (at.length > F.maxCallSites)
    say(
      `      flags.${name} is read at ${at.length} call sites and the budget is ${F.maxCallSites}: ${at.join(', ')}.\n` +
        `        Every call site is a branch somebody has to delete, and the last one is the one that gets left behind.`,
    );
}

/* -- 6: the two artefacts -------------------------------------------------- */

/**
 * A flag whose two builds are the same build is a branch that does nothing.
 *
 * WHAT IT PROVES AND WHAT IT DOES NOT. Each flag's `proof` is a literal only the ON side renders, so
 * finding it in exactly one of the two artefacts proves THAT flag reaches the document. It does not
 * prove the branch is correct, and no gate can - `prefs` says the same about itself: "not 'is it the
 * right difference' - a gate cannot judge that - but 'is there one at all', which is the question
 * that was never asked."
 *
 * A `null` proof is an excuse and it is printed rather than swallowed, for `dead-copy`'s reason: the
 * allow-list is the point, not the exemption, and a debt somebody can read is a debt somebody can
 * shorten.
 */
const comparable = Boolean((await stat(SHIPPED).catch(() => null)) && (await stat(INVERTED).catch(() => null)));
if (comparable) {
  const bytesOf = async (dir) => {
    let all = '';
    for (const file of await walk2(dir)) all += await readFile(file, 'utf8').catch(() => '');
    return all;
  };
  const shipped = await bytesOf(SHIPPED);
  const inverted = await bytesOf(INVERTED);
  const excused = [];
  for (const [name, f] of FLAGS) {
    if (typeof f.proof !== 'string') {
      excused.push(`${name} (${f.proof === null ? 'no string the ON side renders' : 'unreadable proof'})`);
      continue;
    }
    const inShipped = shipped.includes(f.proof);
    const inInverted = inverted.includes(f.proof);
    if (inShipped === inInverted)
      say(
        `      flags.${name} reads the same in both builds - its proof ${JSON.stringify(f.proof)} is ` +
          `${inShipped ? 'in both artefacts' : 'in neither'}.\n` +
          '        Either the branch changes nothing, or the proof names a string it does not render.',
      );
  }
  if (excused.length) console.log(`      (${excused.length} flag(s) with no artefact proof: ${excused.join(', ')})`);
}

/* -- 7: a flag is not a preference ----------------------------------------- */

const prefSrc = await readFile(PREF, 'utf8').catch(() => '');
const prefKeys = new Set([...prefSrc.matchAll(/^ {2}([A-Za-z]\w*)\??:/gm)].map((m) => m[1]));
for (const [name] of FLAGS)
  if (prefKeys.has(name))
    say(
      `      flags.${name} is also a Pref field, so it is both a build constant and a per-device setting.\n` +
        '        A setting a person can find and change is a preference; make it one, or rename the flag.',
    );

/* -- the report ------------------------------------------------------------ */

/** The same walk, for a built directory, where `skipDir` would otherwise refuse to enter it. */
async function walk2(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) await walk2(at, out);
    else if (/\.(html|js|css|json)$/.test(entry.name)) out.push(at);
  }
  return out;
}

console.log(
  `  flags: ${FLAGS.size} declared, ${uses.size} read, ${findings.length} finding(s)` +
    (comparable ? '' : ' - no build/ and build-flags/ to compare, so question 6 was not asked'),
);

if (findings.length) {
  console.error('\n  a flag is a decision that has not been taken, and these are overdue:');
  for (const line of findings) console.error(line);
  process.exitCode = 1;
}

/**
 * AND A SKIP IS NOT A PASS. `bundle`, `layout` and `a11y` exit 3 with no build for this reason, and
 * `run.mjs` makes a skip red under CI - because CI builds first, so a skip there means the two
 * artefacts were never written and the one question no other check can answer was never asked.
 *
 * Only when there is nothing else to say: a finding found by reading source is a real answer, and
 * reporting it as a skip would lose it.
 */
/**
 * A SKIP IS ONLY HONEST WHEN THERE WAS SOMETHING TO SKIP.
 *
 * Question 6 compares `build/` against `build-flags/` to prove each flag's OTHER half still
 * compiles. That is the half no test exercises, because a statically-false branch is exactly what
 * `dead-copy` counts as rendered. With flags declared, not asking that is a real gap and exit 3 is
 * right: `run.mjs` makes a skip red under CI, so it arrives as a sentence rather than as silence.
 *
 * With NO flags declared there is no other half. Requiring a second full build to prove nothing
 * about an empty list is the shape this repository keeps deleting: a check that reports something
 * while measuring nothing. An empty list is the state this file should usually be in, so the common
 * case must not be permanently amber. An amber that is always there is read as the background.
 */
if (!comparable && findings.length === 0 && FLAGS.size > 0) process.exit(3);
