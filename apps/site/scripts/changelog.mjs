/**
 * The changelog, held against the repository it claims to describe.
 *
 *   node apps/site/scripts/changelog.mjs
 *   node apps/site/scripts/changelog.mjs --rev=<commit>          # hold it against an older log
 *   node apps/site/scripts/changelog.mjs --entries=<path>       # hold an older entry list instead
 *
 * THE TWO FLAGS ARE MEANT TO BE USED TOGETHER, and asking whether the page was true on some past
 * day is the whole reason they exist. Today's entries against an old log reports every commit the
 * old log does not have yet, which is arithmetic rather than a finding. The pairing that matters is
 * the one `changelog.test.mjs` holds: the entries as they stood at `8fd25709~1` against the log at
 * that same commit name 2026-09-16, 09-15, 09-14 and 09-11 with their commit counts, which is the
 * failure this page shipped.
 *
 * THIS PAGE HAS ALREADY FAILED ONCE IN THE ONLY WAY IT CAN. `+page.svelte` records it: brain.dog
 * said *nothing has shipped yet* for six days after the record app began deploying from this
 * repository on every push. Nothing noticed, because the only thing that could notice was a person
 * opening the page, and the person who would have noticed was the person writing the commits.
 *
 * A HAND-WRITTEN CHANGELOG IS A CACHE WITH NO INVALIDATION. That is the whole defect, and it is not
 * solved by writing the missing days: it is solved by giving the repository a way to contradict the
 * page. Run this and the page is a claim about `git log` that either holds or does not.
 *
 * ── WHAT IT DOES NOT DO, AND WHY ─────────────────────────────────────────────────────────────
 *
 * IT DOES NOT GENERATE THE PAGE. That was the first design and it was wrong. Generating entries
 * means either printing commit subjects, which gives a reader 1,285 rows of this repository talking
 * to itself, or asking a model to summarise them, which puts sentences on the site nobody wrote and
 * nobody checked. Both fail the rule the page is written under: the title is the entry, the body is
 * the evidence, and a body states what was measured. A person writes those. What a person cannot do
 * reliably is remember to, so the remembering is what got automated.
 *
 * So the entries stay hand-written in `../src/routes/changelog/entries.ts`, and every one of them
 * names the commits it is drawn from. That one field is what makes the rest checkable arithmetic
 * rather than a promise in a comment.
 *
 * ── THE SEVEN CHECKS ─────────────────────────────────────────────────────────────────────────
 *
 *   1. ANCHORED       every entry names at least one commit
 *   2. RESOLVES       every hash it names is exactly one commit in the log
 *   3. DATED BY GIT   the entry's date is the author date of its FIRST commit, not a typed string
 *   4. UNIQUE ANCHOR  no two entries are anchored to the same commit
 *   5. ORDERED        newest first, which is also what stops a day drawing its heading twice
 *   6. COVERED        every day the repository committed on has at least one entry
 *   7. WRITTEN RIGHT  at most three sentences a body, none over 25 words, and no URL
 *
 * CHECK 6 IS THE ONE THAT WOULD HAVE CAUGHT THE FAILURE, and it is why `--rev` exists: point this
 * at the commit before the six missing days were written and it names all six. A check that has
 * never been shown to fire is a check nobody has tested (`tools/gates/guards.mjs` is this
 * repository's argument for that), and the way to fire this one is to ask it about a day the page
 * was actually wrong.
 *
 * WHY THE FRESHNESS CHECK IS CHECK 6 AND NOT AN EIGHTH ONE. A grace period ("the newest entry is no
 * more than N days behind the newest commit") looked like the obvious check and is strictly weaker:
 * it passes a page that wrote up today and skipped last Tuesday, which is the shape of a changelog
 * kept by whoever felt like it. Per-day coverage subsumes it, because today is a day like any
 * other, and it needs no number argued for.
 *
 * ── EXIT CODES ───────────────────────────────────────────────────────────────────────────────
 *
 *   0  nothing to report
 *   1  findings, printed one per line with the entry they belong to
 *   3  cannot run: no history to read, no git log at the revision, or the entries would not load
 *
 * 3 rather than 0 for "cannot run", which is the rule the gates under `tools/gates/` follow: a
 * check with nothing to read has to be louder than a pass and not quieter, or it becomes the same
 * silence it exists to break.
 *
 * ── A SHALLOW CLONE, WHICH IS THE ONE STATE THIS CANNOT READ ──────────────────────────────────
 *
 * MEASURED, IN A REAL `git clone --depth 1` OF THIS REPOSITORY WITH THIS FILE AND `entries.ts`
 * COPIED IN: 183 findings and exit 1, one line per hash, every one of them saying `is not a commit in
 * this log`, and not one of them true. `git log` succeeds in a shallow clone and answers with the
 * single commit it was given, so nothing throws and the whole entry list reads as invented.
 * `actions/checkout@v4` clones at depth 1 unless a workflow says otherwise, and not one of the eight
 * checkouts in the five workflows under `.github/workflows` sets `fetch-depth`, so that reading is
 * what CI gets on every push.
 *
 * SO IT DEEPENS THE CLONE RATHER THAN DECLINING TO RUN, and the reason is `tools/gates/run.mjs` and
 * not taste. That runner reads exit 3 as a skip, and then: `if (disallowed.length &&
 * process.env.CI) failed.push(...disallowed)`. A skip is RED under CI unless the job waives the gate
 * by name in `--allow-skip`. Every CI checkout here is shallow, so a checker that answered a shallow
 * clone with exit 3 would be red on every push, which is where the 183 findings already left it, or
 * waived by name for ever, which is a gate CI never runs. Refusing to run is a diagnosis, and the
 * gate was refused registration over the disease. Deepening is the third answer: fetch the history,
 * then answer the question that was asked.
 *
 * THE FETCH IS THE ONE `fetch-depth: 0` WOULD HAVE MADE AT CHECKOUT, moved into the check that needs
 * it and away from five workflow files that would each have to remember. In a full clone it costs one
 * `git rev-parse` and fetches nothing, which is every developer run and every CI job the day a
 * workflow does set `fetch-depth: 0`. What is left on 3 is a shallow clone with nothing to deepen
 * from, a tarball or a copied tree, and that is not the CI path.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const REV = arg('rev', 'HEAD');
const ENTRIES_AT = resolve(arg('entries', join(ROOT, 'apps', 'site', 'src', 'routes', 'changelog', 'entries.ts')));

/**
 * The log, as {hash, date, subject}, newest first.
 *
 * `%H` AND NOT `%h`, because `core.abbrev` is a setting and an entry's hash is written by hand at
 * whatever length the person had in front of them. Full hashes here plus prefix matching below
 * means a seven-character hash and a forty-character one are both read, and an ambiguous prefix is
 * a finding rather than a coin toss.
 *
 * THE DATE IS THE AUTHOR DATE, and this page has already been bitten by the alternative. Its own
 * comment cited `git rev-list --count --since=2026-09-17 HEAD` for the figure 585. Run at the
 * commit where that comment was written, 164ad664, the command answers 419; the number of commits
 * AUTHORED after 2026-09-16 there is 586, one more than the comment claims because the comment does
 * not count the commit carrying it. So the figure was right and the command recorded beside it was
 * not, because `--since` compares absolute instants while `%ad --date=short` renders the day in the
 * commit's own zone, and this history spans both sides of a midnight. An author date rendered
 * `--date=short` is the day the commit says it is, which is the day a person writing an entry up
 * would call it.
 */
const read = () => {
  const out = execFileSync('git', ['log', '--format=%H|%ad|%s', '--date=short', REV], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const first = line.indexOf('|');
      const second = line.indexOf('|', first + 1);
      return { hash: line.slice(0, first), date: line.slice(first + 1, second), subject: line.slice(second + 1) };
    });
};

/**
 * Whether the history this is about to read is the history the page describes, DEEPENING the clone
 * when it is not. `{ok: true, deepened}`, or `{ok: false, why}` for the caller to print and exit 3.
 *
 * IT TAKES THE GIT RUNNER AS AN ARGUMENT for the reason `check` takes the log as one: the six states
 * worth asserting are a full clone, a shallow clone that deepens, a fetch that fails, a fetch that
 * claims success and changes nothing, a git that will not answer, and an answer this cannot read, and
 * reaching four of those for real costs a clone and a network. `changelog.test.mjs` drives all six off
 * a fake that records every argv, which is how three of the cases assert what was NOT run.
 *
 * THE QUESTION IS GIT'S OWN rather than a test for `.git/shallow`, which is where git happens to keep
 * the answer today and not a thing this file is entitled to know.
 *
 * AND ONLY A PLAIN `true` IS A SHALLOW CLONE. Measured: `git fetch --unshallow` in a complete clone
 * of this repository exits 128 with `fatal: --unshallow on a complete repository does not make
 * sense`. So deepening on any other answer, including one from a git too old to recognise the flag,
 * would turn a tree this could have read into a failed fetch and then a skip, which is the opposite
 * of the trade this function exists to make.
 *
 * THE SECOND ASK IS THE LOAD-BEARING ONE, AND IT CATCHES A REAL CASE RATHER THAN A HYPOTHETICAL. It
 * is the argument `run.mjs` makes about a gate reporting on itself, one level down: the fetch's exit
 * code is the fetch's own account of whether the history arrived, and what this needs to know is
 * whether the history is HERE. Measured in a depth-1 clone of this repository with its remote removed,
 * on git 2.52.0: `git fetch --unshallow --quiet` exits 0, prints nothing, and leaves the clone
 * shallow. Trusting that exit code would have put every entry back into those 183 findings, this time
 * behind a fetch that said it worked.
 */
export const fullHistory = (git) => {
  /* ONE LINE, BECAUSE THE CALLER PRINTS THIS ONE MID-SENTENCE. A real failing fetch threw five lines
     (`Command failed:` and two `fatal:`s with blank lines between), which put the `at <root>` that
     closes the caller's sentence on the far side of a blank line under two fatals, where it read as a
     second failure rather than as the end of the first. Every word git said is kept. */
  const because = (error) => String(error.message).replace(/\s+/gu, ' ').trim();

  const ask = () => {
    try {
      return { answer: git(['rev-parse', '--is-shallow-repository']) };
    } catch (error) {
      return { why: `cannot ask git whether this is a shallow clone: ${because(error)}` };
    }
  };

  const first = ask();
  if (first.why !== undefined) return { ok: false, why: first.why };
  if (first.answer === 'false') return { ok: true, deepened: false };
  if (first.answer !== 'true')
    return {
      ok: false,
      why:
        `git rev-parse --is-shallow-repository answered ${JSON.stringify(first.answer)}, which is neither ` +
        'of the two answers this knows how to act on',
    };

  try {
    git(['fetch', '--unshallow', '--quiet']);
  } catch (error) {
    return { ok: false, why: `this is a shallow clone and the history could not be fetched: ${because(error)}` };
  }

  const second = ask();
  if (second.why !== undefined) return { ok: false, why: second.why };
  if (second.answer !== 'false')
    return { ok: false, why: 'the fetch reported success and this is still a shallow clone' };
  return { ok: true, deepened: true };
};

/** Sentences, on the only boundary prose in English actually gives: a stop, then a space. */
const sentences = (body) =>
  body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const words = (sentence) => sentence.split(/\s+/).filter(Boolean);

/**
 * The whole check, as a function of two lists and nothing else.
 *
 * IT TAKES THE LOG RATHER THAN READING IT so the test beside this file can hand it a nine-commit
 * history and assert each finding fires. A checker whose logic only runs against 1,285 real commits
 * is a checker whose own failure modes are untested, which is the defect it was written to catch,
 * one level out.
 */
export const check = (entries, commits) => {
  const found = [];
  const say = (where, message) => found.push(`${where}: ${message}`);

  if (entries.length === 0) return ['the entry list is empty, so this page claims nothing shipped ever'];
  if (commits.length === 0) return ['the log is empty, so there is nothing to hold the page against'];

  const anchors = new Map();

  for (const entry of entries) {
    const where = `${entry.date} ${entry.title.slice(0, 56)}`;

    /* 1. ANCHORED. An entry with no commit is a sentence with no evidence under it, and it is the
       shape every invented entry takes: nothing to check it against. */
    if (!Array.isArray(entry.commits) || entry.commits.length === 0) {
      say(where, 'names no commit, so nothing in the repository says this shipped');
      continue;
    }

    /* 2. RESOLVES. */
    const resolved = entry.commits.map((given) => {
      const key = String(given).toLowerCase();
      const hits = commits.filter((c) => c.hash.startsWith(key));
      if (hits.length === 0) say(where, `names ${given}, which is not a commit in this log`);
      else if (hits.length > 1) say(where, `names ${given}, which is ${hits.length} commits, so it is short by ${hits.length} of being an answer`);
      return hits.length === 1 ? hits[0] : null;
    });

    const anchor = resolved[0];
    if (!anchor) continue;

    /* 3. DATED BY GIT. The first commit owns the date. The rest may be any day, which is how a
       thing that took two days to ship keeps the one date a reader would give it. */
    if (anchor.date !== entry.date) {
      say(where, `is dated ${entry.date} and its first commit ${anchor.hash.slice(0, 8)} is dated ${anchor.date}`);
    }

    /* 4. UNIQUE ANCHOR. */
    const already = anchors.get(anchor.hash);
    if (already) say(where, `is anchored to ${anchor.hash.slice(0, 8)}, which already anchors "${already}"`);
    else anchors.set(anchor.hash, entry.title);

    /* 7. WRITTEN RIGHT. The rules `+page.svelte` states, which until now nothing enforced. */
    const parts = sentences(entry.body);
    if (parts.length > 3) say(where, `has ${parts.length} sentences in its body, and the rule is three`);
    for (const part of parts) {
      const count = words(part).length;
      if (count > 25) say(where, `has a ${count} word sentence: "${part.slice(0, 48)}..."`);
    }
    if (/https?:\/\//.test(entry.body) || /https?:\/\//.test(entry.title)) {
      say(where, 'carries a URL, and this repository tags without publishing releases to link to');
    }
    if (!['shipped', 'changed', 'fixed'].includes(entry.kind)) {
      say(where, `has kind "${entry.kind}", which is not one of shipped, changed or fixed`);
    }
  }

  /**
   * 5. ORDERED. The page groups CONSECUTIVE entries that share a date and deliberately does not
   * sort, because the order inside a day is editorial. That only reads as a log if the dates
   * descend.
   *
   * IT IS ONE COMPARISON AND IT WAS TWO. The second asked whether a day had come back after
   * ending, because a day appearing twice draws its heading twice and reads as two days. The test
   * beside this file could not make that branch fire, and the reason is arithmetic: a list can only
   * revisit a day by stepping UP to it, so the descending check has already reported every
   * reopening before the second one is consulted. A branch no input reaches is not caution, it is a
   * line claiming a check that does not exist.
   */
  let previous = null;
  for (const entry of entries) {
    if (previous && entry.date > previous) {
      say(`${entry.date} ${entry.title.slice(0, 56)}`, `comes after ${previous}, so the page is not newest first`);
    }
    previous = entry.date;
  }

  /* 6. COVERED. The check that would have caught the six days, and the reason this file exists. A
     day the repository committed on and the page says nothing about is either a day of work nobody
     wrote up or a day of work nobody should have to read about, and the second one is a decision
     somebody has to make out loud rather than by forgetting. */
  const oldest = entries.reduce((a, e) => (e.date < a ? e.date : a), entries[0].date);
  const days = new Set(entries.map((e) => e.date));
  const missing = [...new Set(commits.map((c) => c.date))].filter((d) => d >= oldest && !days.has(d)).sort().reverse();
  for (const day of missing) {
    const n = commits.filter((c) => c.date === day).length;
    found.push(`${day}: ${n} commit${n === 1 ? '' : 's'} and no entry, so the changelog is behind the repository`);
  }

  return found;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  /* STDERR CAPTURED RATHER THAN INHERITED, WHICH IS `execFileSync`'S DEFAULT: measured against a
     shallow clone whose remote URL does not exist, git's two fatals were printed once by git and then
     again inside the reason below, so a reader of the real failure got the same four lines twice and
     had to work out that it was one failure and not two. */
  const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  /* ASKED BEFORE THE LOG IS READ, because a shallow clone ANSWERS the log rather than refusing it,
     so every finding that would follow is a claim about a commit the clone was never given. */
  const history = fullHistory(git);
  if (!history.ok) {
    console.error(
      `  changelog: cannot run at ${ROOT}.\n` +
        `  ${history.why}\n` +
        '  The log it can read is not the history this page describes, so every entry it names would be\n' +
        '  reported as invented. Check out with `fetch-depth: 0`, or give it a remote to deepen from.',
    );
    process.exit(3);
  }
  /* AND IT SAYS SO WHEN IT FETCHED, because a check that reaches the network is not allowed to do it
     quietly: the line below counts the commits it ended up with, and this is the one that explains
     where they came from. */
  if (history.deepened) console.log('  changelog: the clone was shallow, so the history was fetched before reading it.');

  let commits;
  try {
    commits = read();
  } catch (error) {
    console.error(`  cannot read git log at ${REV} from ${ROOT}: ${error.message}`);
    process.exit(3);
  }

  let entries;
  try {
    ({ ENTRIES: entries } = await import(pathToFileURL(ENTRIES_AT).href));
  } catch (error) {
    console.error(`  cannot load the entries from ${ENTRIES_AT}: ${error.message}`);
    process.exit(3);
  }
  if (!Array.isArray(entries)) {
    console.error(`  ${ENTRIES_AT} exports no ENTRIES array`);
    process.exit(3);
  }

  const findings = check(entries, commits);
  const days = new Set(commits.map((c) => c.date)).size;
  console.log(
    `  changelog: ${entries.length} entries over ${new Set(entries.map((e) => e.date)).size} days, ` +
      `against ${commits.length} commits over ${days} days at ${REV}`,
  );
  for (const finding of findings) console.log(`  ${finding}`);
  if (findings.length > 0) {
    console.log(`\n  ${findings.length} finding${findings.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  console.log('  nothing to report.');
}
