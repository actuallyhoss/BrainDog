/**
 * Every sentence this product types is a sentence somebody reads.
 *
 *   node tools/gates/dead-copy.mjs
 *
 * `50 §3`: "`copy.ts` is load-bearing twice: it is the only place a sentence is typed, so the
 * no-over-explaining rule (23 §7) is reviewable in one file." That is true only while the file's
 * contents and the product's contents are the same thing. Measured on the day this gate was
 * written: 212 keys, **26 of them referenced by no other file**. That is twelve per cent of
 * everything this product has to say, written, reviewed, shipped to the browser and rendered
 * nowhere.
 *
 * IT IS A PARTICULAR KIND OF ROT AND IT LOOKS LIKE THE OPPOSITE. A dead string does not read as an
 * absence; it reads as a feature. Five definitions of the load-bearing nouns sat in `first-run.ts`
 * under a comment stating the policy in the completed past tense while the words they define reached
 * a screen undefined on every route. Somebody reviewing that file would have concluded the rule was
 * kept. The same shape, again: something complete-looking that reports success and does nothing.
 *
 * THE ALLOW-LIST IS THE POINT, NOT AN EXEMPTION. A gate that could only be green by fixing
 * twenty-six things at once is a gate that never lands. Every dead key is named here with what it is
 * waiting for, so the debt is a list somebody can read and shorten rather than a silence. Two
 * categories, and they are different facts:
 *
 *   - CORRECT: the string is dead because the surface is correctly absent. `askBrainDog` is the
 *     one. `23 §3.1` says a capability with no model behind it is "not there, not greyed out", so
 *     the control must not render and its sentence must still exist for the day it can.
 *   - UNBUILT: the surface the string belongs to has not been written. Each names it.
 *
 * ADDING A KEY TO THIS LIST IS A DECISION, and the diff shows it. Adding a dead key without one is
 * what this gate exists to stop.
 *
 * IT READS TWO MODULES NOW, AND THE SECOND ONE IS THE EXAMPLE THREE PARAGRAPHS UP. `first-run.ts`
 * was split out of `copy.ts` for the bundle's sake: over a kilobyte of prose read by two surfaces,
 * landing in the entry chunk every screen waits for. The split also put its keys outside this gate,
 * because the gate read one path, and a sixth dead sentence was sitting in it when that was
 * noticed. `seeTheListWhy` was replaced by `rowIsThere`, the comment ten lines below it says so,
 * and the key stayed: named by nothing in the repository, shipped to the browser, rendered nowhere.
 *
 * SO THE LIST OF MODULES IS THE THING TO EXTEND, not the one constant. Each entry names the object
 * it exports, because that is how a use of its keys is written, and the allow-list is qualified the
 * same way so two modules cannot excuse each other's sentences by accident.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { skipDir } from './lib.mjs';

/**
 * Every module that holds this product's sentences, and the object each one exports.
 *
 * `required` IS THE DIFFERENCE BETWEEN THE RULE AND THE TREES THAT TEST IT. A repository with no
 * `copy.ts` is a repository this gate cannot say anything about, and it exits 3 rather than
 * reporting a green nothing. `first-run.ts` is a split of that file rather than a second policy, so
 * its absence is printed and the run goes on: the negative fixtures under `negative/` are two-file
 * trees that have never had one, and a gate that could only run against the whole app is a gate
 * whose own test cannot exist.
 */
const MODULES = [
  { object: 'copy', file: 'copy.ts', required: true },
  { object: 'firstRun', file: 'first-run.ts', required: false },
];

/**
 * Keys that are deliberately not rendered, and why.
 *
 * The `why` is not decoration: it is the difference between a debt and a mistake, and the only
 * thing that lets the next reader tell them apart without re-deriving the whole surface.
 */
const ALLOWED = new Map([
  /* EIGHT LEFT THIS LIST ON 21 SEPTEMBER AND NOT ONE OF THEM GOT A SURFACE. A pass read every excuse
     against the code and found these eight wrong: the sentence was superseded or typed twice, so the
     key was deleted from `copy.ts` and the excuse went with it. An excuse that outlives its reason is
     the same defect as a sentence with no renderer, one direction along, and eighteen is how a list
     of ten becomes a list of forty. `restored`, `marked`, `noFilters`, `displayOptions`, `example`,
     `saved`, `reloaded` and `appearance` were the eight. */
  ['copy.askBrainDog', 'CORRECT. 23 §3.1: with no model the assistant is absent, not disabled. The sentence waits.'],
  /* `markAllRead` LEFT THIS LIST WHEN IT GOT A SURFACE, and the gate is what noticed: an excuse that
     outlives its reason is the same defect as a sentence with no renderer, one direction along.
     `marked` is the per-item form and stays. The browser's mark is one instant, not a flag a row.
     `copy.rankedBy` left it the same way, and its excuse had been wrong twice over: it read "19 §6's
     For You ordering", and what `19 §8` risk 6 asks for is the queue ranked by cost of being wrong,
     which `/decide` now says over the list it ranks. */
  /* `saveAsView` LEFT THIS LIST IN W59-3, and its excuse was half wrong for as long as it stood. It read "a saved
     view is seeded, never created from the grid", while `⌥V` on the grid had been creating one through `saveView()`
     all along. What was missing was the button, and the gate failed on this key alone when the line was taken out
     before the button existed. */
  ['copy.includesExample', 'UNBUILT. 19 §6 mechanism 2: the example row, marked and deletable in one click.'],
  /* `stale` LEFT THIS LIST IN W56, when the register list began re-asking on the record's version and got a mark to
     wear when more than one page of the old answer is in hand. The three below stayed, each for its own reason now,
     because the poll that landed with it draws the hairline and the hairline is `aria-hidden` with no words in it. */
  ['copy.offline', 'CORRECT. "New records only." promises a write that can still be made offline, and nothing in the web app queues one. It waits for a sentence that says what a failed poll means.'],
  ['copy.live', 'UNBUILT:the socket\'s word. The poll draws its state as the hairline, which says it without words.'],
  ['copy.polling', 'UNBUILT:the socket\'s fallback. With the poll as the only transport, `polling` is never set (`+layout.svelte`, the hairline\'s comment).'],
  /* `stopped` WAS FILED HERE AS THE OFFLINE SURFACE'S, AND `copy.ts` SAYS IT IS NOT. It is the toast `23 §7`'s
     Escape shows when an answer is cancelled, so it waits on the assistant, which is absent with no model for the
     reason `askBrainDog` above is. */
  ['copy.stopped', 'CORRECT. 23 §7: the assistant\'s cancel toast. With no model the assistant is absent (23 §3.1), so the word waits with it.'],
  ['copy.screenshotOn', 'UNBUILT:19 §6\'s screenshot mode.'],
  ['copy.screenshotOff', 'UNBUILT:same.'],
]);

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import.
 *
 * `BRAINDOG_GATE_ROOT` IS STILL READ, because that is the handle `self-test` aims this gate with,
 * and it is the default rather than the answer now: `run.mjs` passes the repository root it derived
 * from its own location, since an imported gate shares the runner's working directory and `cwd` is
 * wherever the operator was standing.
 *
 * `at` IS RESOLVED HERE AND `MODULES` STAYS ABOVE, because the list of modules is a policy and the
 * path to each one is a fact about the tree being walked.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass`
 * grep rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function deadCopy(root = process.env.BRAINDOG_GATE_ROOT ?? process.cwd()) {
  const SRC = join(root, 'apps', 'web', 'src');
  const modules = MODULES.map((m) => ({ ...m, at: join(SRC, 'lib', m.file) }));

  const files = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      /* THE SAME DIRECTORIES EVERY OTHER GREP GATE SKIPS, and this was the only one that skipped
         none. Nothing under `src/` is skipped today, so this changes no number. It is here because
         the incident `lib.mjs` records is a scratch directory somebody left behind, and a scratch
         file naming a `copy.*` key would have kept that key alive from a file nobody ships. */
      if (skipDir(e.name)) continue;
      const at = join(dir, e.name);
      if (e.isDirectory()) await walk(at);
      /* A TEST IS NOT A RENDERER. `deployment.test.ts` names twelve `copy.*` keys to assert the Cloud
         half exists at all, and every one of them then counted as rendered. So a screen could lose
         its only call site and this gate would say nothing, propped up by the file asserting the
         sentence is there. The gate's whole subject is a string that is reviewable and unrendered. */
      else if (/\.test\.ts$/.test(e.name)) continue;
      else if (/\.(ts|svelte)$/.test(e.name)) files.push(at);
    }
  }
  await walk(SRC);

  /**
   * A COMMENT IS NOT A CALL SITE.
   *
   * This greps raw file text, so a key named in prose counted as rendered. This repository's
   * comments name keys constantly. Three do it today: `pref.ts` explains why `copy.markAllRead` left
   * the allow-list, `data.ts` discusses `copy.lastDecided`, `schema.ts` `copy.levelMeans`. All three
   * are alive for other reasons, so the gate is not wrong about them; it is one deletion away from
   * being propped up by its own commentary, which is the shape `refusals` and `secret-grep` were
   * caught in.
   *
   * `flags.mjs` already had this exact function and the same paragraph. It is copied rather than
   * shared because the two gates want different things blanked: `flags` also blanks import
   * specifiers, and `copy` is never an import specifier.
   */
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const readable = (text) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/<!--[\s\S]*?-->/g, blank)
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

  const sources = new Map();
  for (const f of files) sources.set(f, readable(await readFile(f, 'utf8')));

  const defined = modules.filter((m) => sources.has(m.at));
  for (const m of modules) {
    if (sources.has(m.at)) continue;
    /* PRINTED RATHER THAN SILENT, both ways. A module this gate cannot find is a set of sentences it
       is not checking, and the whole subject here is something complete-looking that reports success
       and does nothing. */
    if (m.required) {
      console.log(`  dead-copy: no apps/web/src/lib/${m.file} to read`);
      return 3;
    }
    console.log(`  dead-copy: no apps/web/src/lib/${m.file}, so its sentences are not read`);
  }

  /**
   * A MODULE NOTHING IMPORTS IS NOT A RENDERER.
   *
   * This treated all 81 non-copy files as renderers, and four of them are reachable from no route.
   * One of them, `EnvBadge.svelte`, was the only consumer of `copy.alpha`. So the word that tells
   * the alpha deployment apart from the real record was reported as rendered by a component that had
   * never been mounted, for as long as both existed. That is this gate's own subject: a sentence
   * written, reviewed, shipped and read by nobody, hidden one level up from the string.
   *
   * REACHABILITY FROM `src/routes`, because that is what SvelteKit renders. A file is a renderer if a
   * route imports it, or if something a route imports imports it. Measured on the tree the day this
   * landed: 4 orphans out of 81 files, 1 of which named a key, and 0 false positives.
   */
  const routes = files.filter((f) => f.includes(`${sep}routes${sep}`));
  const reachable = new Set(routes);
  for (const queue = [...routes]; queue.length > 0; ) {
    const at = queue.pop();
    /* THE SPECIFIER AS WRITTEN, then resolved two ways: `$lib/x.ts` is the app's own alias for
       `src/lib/x.ts`, and a relative one is relative to the importer. Anything else is a package, and
       a package does not hold this app's copy. A DYNAMIC `import('…')` IS AN IMPORT TOO: a write module
       a screen loads on the first press is rendered as surely as one it loads up front. */
    for (const m of (sources.get(at) ?? '').matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"\n]+)['"]/gu)) {
      const spec = m[1];
      const to = spec.startsWith('$lib/')
        ? join(SRC, 'lib', spec.slice(5))
        : spec.startsWith('.')
          ? resolve(dirname(at), spec)
          : null;
      if (to === null || reachable.has(to) || !sources.has(to)) continue;
      reachable.add(to);
      queue.push(to);
    }
  }

  /**
   * TOP-LEVEL KEYS ONLY: two spaces of indent. A nested key is reached through its parent, and
   * `copy.defines.list` is a use of `defines`; the unit test in `define.test.ts` is what checks that
   * every member of a nested table is named.
   *
   * A QUOTED KEY AND A `_`-PREFIXED ONE ARE SENTENCES TOO. The pattern read one character class and
   * nothing else, so `'not-found': …` (the plainest way to write a key that is not an identifier)
   * was not a key this gate had ever heard of. There is no such key in `copy.ts` today and the
   * widened pattern finds the same 399, which is the point: it costs nothing now, and it is not
   * sitting there waiting to be wrong on the day somebody writes one.
   */
  /**
   * AND ONLY INSIDE THE OBJECT THE ENTRY NAMES, which is what the paragraph above always said and
   * the scan did not do: it read every two-space key in the whole FILE.
   *
   * `first-run.ts` grew a function whose parameters are an object type written over four lines, and
   * `press:`, `own:`, `held:` and `fallback:` are two-space keys by that pattern, so the gate
   * reported four sentences this product types and nobody reads. They are not sentences, they are
   * parameters, and no wording of an allow-list entry would have been true about them.
   *
   * The object's own text is from `export const <name>` to the first `};` at the start of a line,
   * which is how every module here is written and is checked rather than assumed: a module whose
   * object cannot be found that way is a finding of its own rather than a silent zero.
   */
  const bodies = new Map();
  const unreadable = [];
  for (const m of defined) {
    const source = sources.get(m.at) ?? '';
    const opened = source.search(new RegExp(String.raw`^export const ${m.object}\b`, 'mu'));
    if (opened < 0) {
      unreadable.push(m);
      continue;
    }
    const rest = source.slice(opened);
    /* BOTH SPELLINGS OF THE END, because `copy.ts` closes with `} as const;` and the first
       version of this looked only for `};`, found neither, and read each file to its last line: a
       function's parameters four hundred lines below the object were counted as sentences. */
    const closed = rest.search(/^\}(?: as const)?;$/mu);
    bodies.set(m.at, closed < 0 ? rest : rest.slice(0, closed));
  }

  const entries = [];
  for (const m of defined)
    for (const k of (bodies.get(m.at) ?? '').matchAll(/^ {2}(?:['"]([^'"]+)['"]|([A-Za-z_$]\w*))\s*:/gmu))
      entries.push({ ...m, key: k[1] ?? k[2], name: `${m.object}.${k[1] ?? k[2]}` });

  /* THE NAME AS A USE OF IT IS WRITTEN, which is what the allow-list and both reports are keyed on.
     This held a bare key while there was one module to hold, and a bare key across two is a name
     that means either file: an excuse written for one module's `example` would have covered the
     other module's dead `example` without anybody deciding it should. */
  const names = entries.map((e) => e.name);

  const dead = [];
  for (const { object, key, at, name } of entries) {
    const used = new RegExp(String.raw`\b${object}\.${key}\b|\b${object}\[['"]${key}['"]\]`);
    let found = false;
    for (const [f, s] of sources) {
      /* ITS OWN FILE IS NOT A RENDERER, AND ONLY ITS OWN. The other module is an ordinary file a
         route reaches, so a key of this one named there is a use like any other. */
      if (f === at || !reachable.has(f)) continue;
      if (used.test(s)) {
        found = true;
        break;
      }
    }
    if (!found) dead.push(name);
  }

  const unexpected = dead.filter((k) => !ALLOWED.has(k));
  /* SCOPED TO KEYS THAT ARE STILL IN THE FILE. An excuse for a key `copy.ts` no longer has is stale
     too, but it is a different fact and not a failure. Reporting it unscoped would make the gate's
     own negative fixture, whose `copy.ts` has none of these, red for twenty-six reasons that are not
     the seeded one. */
  const revived = [...ALLOWED.keys()].filter((k) => names.includes(k) && !dead.includes(k));
  const gone = [...ALLOWED.keys()].filter((k) => !names.includes(k));

  /* BOTH SIDES OF THE WALK, PRINTED. A number a gate does not print is a number nobody checks, and
     the first version of this line counted `copy.ts` on one side and not the other, so a two-file
     fixture reported "3 of 2". If the two ever read the same the reachability walk has
     stopped narrowing anything, which is either good news or a resolver quietly matching nothing, and
     from outside those look identical. */
  const defs = new Set(defined.map((m) => m.at));
  const renderers = [...reachable].filter((f) => !defs.has(f)).length;
  console.log(
    `  dead-copy: ${names.length} sentences, ${dead.length} unrendered (${ALLOWED.size} known), over ${renderers} of ${files.length - defs.size} files a route reaches`,
  );

  /* A MODULE WHOSE OBJECT COULD NOT BE FOUND IS A FINDING AND NOT A ZERO, and this gate proved its
     own point while it was being written: a stray byte in the pattern made both modules unreadable,
     every body came out empty, and the line it printed was `0 sentences, 0 unrendered`, which reads
     exactly like a clean run. That is the shape this gate exists to catch, one level up. */
  if (unreadable.length) {
    console.error('\n  a copy module this gate could not read:');
    for (const m of unreadable)
      console.error(`      ${m.file}: no \`export const ${m.object}\` in it, so none of its sentences were checked`);
  }

  if (unexpected.length) {
    console.error('\n  a sentence this product types and nobody reads:');
    for (const k of unexpected)
      console.error(`      ${k}: render it, delete it, or name it in tools/gates/dead-copy.mjs with what it waits for`);
  }

  /* AND A KEY THAT CAME BACK TO LIFE LEAVES THE LIST. Otherwise the list grows monotonically and
     stops being a description of the debt, which is the same failure as the strings themselves. */
  if (revived.length) {
    console.error('\n  a known-dead sentence is now rendered, and its excuse is stale:');
    for (const k of revived) console.error(`      ${k}: remove it from ALLOWED in ${relative(root, import.meta.filename)}`);
  }

  /* Not a failure: the key is gone, so the debt is paid. Printed so the list shortens rather than
     accumulating excuses for sentences that no longer exist. */
  if (gone.length && names.length > ALLOWED.size)
    console.log(`      (${gone.length} allow-listed key(s) no longer defined: ${gone.join(', ')})`);

  if (unexpected.length || revived.length) return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at two seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = (await deadCopy()) ?? 0;
