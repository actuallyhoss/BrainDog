/**
 * `commits`: every commit a push carries is one short sentence by its one author, and the history is never restarted
 * (WAY-B02, `loop/scope/area-ways-b.md`).
 *
 *   node tools/gates/commits.mjs [root]
 *
 * THE RULES OF THE HISTORY: no co-author trailer naming a tool in any commit message (W.23), no overly detailed
 * commits (W.25), and no fresh start (HD.24). Before this gate nothing read a commit: since 2 October the median
 * subject was 96 characters and 29 of 110 commits carried a body, and the harness asked every session for a session
 * link that only a local instruction file kept out.
 *
 * THE RULES, each printed with a fixed example when it is broken:
 *   - a subject of 1 to `commits.subjectMax` characters, and one sentence;
 *   - no body at all;
 *   - no line of the form `Word-Word: value` anywhere (`Co-Authored-By:`, `Signed-off-by:`, a session link's label);
 *   - no URL, and no em dash;
 *   - no `[skip ci]` or its kin, which would stop GitHub running this gate on the very push that carries it;
 *   - no line that names a tool or a model as an author, in any words;
 *   - one author, equal to the root commit's, and never a tool's or a bot's;
 *   - no merge commit, because master is linear;
 *   - at least `history.floor` commits reachable from HEAD, which is how "no fresh start" fails by itself.
 *
 * WHICH COMMITS. `BRAINDOG_COMMITS_RANGE` (`before..after`, which `ci.yml` sets from the push) when it is given, and
 * `origin/master..HEAD` when it is not, so a local run reads what the next push would carry. A planted tree is a
 * folder with a `log.json` (`{ count, root: { author, email }, commits: [...] }`) and no repository of its own.
 *
 * `checkCommits(list)` IS THE RULE AND THIS FILE'S DEFAULT IS ONLY HOW IT READS GIT. `loop/kit/push.mjs` (WAY-B05)
 * and `loop/kit/hooks/commit-msg` import it, so a push, a commit and CI are refused by the same sentences.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { budget } from './lib.mjs';
import { isRepository } from './public-clean.mjs';

const { subjectMax } = budget('commits');
const { floor } = budget('history');

/** The exit of a gate that could not run, which is no pass. */
const COULD_NOT_RUN = 3;

/**
 * The commits made before the first push this gate guarded, exempt by sha. ONLY EVER SHRINKS, and `ledger.json` holds
 * its count: these seven were on the Mac and not on GitHub on 9 October 2026, every subject past 72 characters, and
 * rewording them is a separate decision. Once they are pushed no range reaches them again and the list can go.
 */
export const EXEMPT = [
  '49a1942bde406a2cfe9684c64c4da6a4ecf02c6f',
  'fc14e4308c77fe5e0f8171e7f259749d5be3cd99',
  '3f0012789f5d122196d12cc8f69e588f9e0940ee',
  '9befcd64d7c06a7fc28e67d683e15c3dc12bf8e3',
  '654ff53e1e54bd59214009ccc55719fb213d9914',
  '983426b03211e6df4e52a1a2600a81a9d9194d1a',
  '433a4400c10f24dd5b4e7e8211a62f469b07fb05',
];

/** A subject that is fine, quoted under every refusal so the fix is in front of the person who has to make it. */
export const EXAMPLE = 'Money reads ages and currencies on the payments page';

const TRAILER = /^\s*[A-Za-z]+(?:-[A-Za-z]+)+:\s*\S/u;
const URL_RE = /\bhttps?:\/\/|\bwww\.\S|\b[\w-]+\.(?:com|ai|io|dev|link|org|net|app|co)\/\S/iu;
const EM_DASH = /\u2014/u;
/** GitHub's words for "run no workflow on this push": the one way a message could turn this gate off. */
const SKIP_CI = /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/iu;
/** Two sentences: a stop, a space and a capital letter starting a word. */
const SENTENCES = /[.!?]\s+\p{Lu}\p{Ll}/u;
const TOOLS = String.raw`claude|anthropic|chatgpt|gpt|openai|copilot|gemini|cursor|codex|devin|aider|windsurf|an?\s+(?:ai|llm)|ai|llm`;
/** A line saying a tool or a model wrote, made or helped with the commit, in any of the usual words. */
const TOOL_AUTHOR = new RegExp(
  String.raw`\b(?:co[-\s]?authored|authored|generated|written|created|made|produced|assisted|built|drafted|signed[-\s]off)` +
    String.raw`[-\s]+(?:by|with|using|via)\b[:\s]*[[(]?(?:the\s+)?(?:${TOOLS})\b`,
  'iu',
);
/** An author line that is a tool's or a bot's. */
const TOOL_IDENT = /\b(?:claude|anthropic|chatgpt|openai|copilot|gemini|cursor|codex|devin|aider|windsurf)\b|\[bot\]|\bbot@/iu;

/**
 * A message as git hands it to a hook: `#` lines and everything under the scissors line dropped, trailing blank lines
 * taken off. The subject is the first line; the body is everything after it that is not blank.
 *
 * `verbatim` IS A COMMIT ALREADY MADE, read back by `git log`. Its `#` lines and its scissors are words it carries
 * (`--cleanup=verbatim` keeps them), so nothing is dropped: otherwise a `# --- >8 ---` line would hide a trailer and a
 * link from CI.
 */
export function parseMessage(text, { verbatim = false } = {}) {
  const lines = [];
  for (const line of String(text).replace(/\r\n?/gu, '\n').split('\n')) {
    if (!verbatim && /^# -+ >8 -+$/u.test(line)) break;
    if (verbatim || !line.startsWith('#')) lines.push(line.trimEnd());
  }
  while (lines.length > 0 && lines[0] === '') lines.shift();
  const [subject = '', ...rest] = lines;
  return { subject, body: rest.join('\n').trim() };
}

/** One refusal: the commit and the rule in plain words. `EXAMPLE` is printed once under all of them. */
const finding = (sha, rule, says) => ({ sha, rule, says: `${sha}  ${says}` });

/**
 * The refusals for `list`, each `{ sha, rule, says }`. A commit is `{ sha, author, email, subject, body, parents? }`.
 *
 *   - `root`: `{ author, email }` of the root commit. Without it, every commit's author must equal the first's.
 *   - `count`: the commits reachable from HEAD, held to `history.floor` when given.
 *   - `exempt`: shas never read, `EXEMPT` by default.
 *
 * Nothing is read from disk or git here, so a hook, a push and a test all hand it what they have.
 */
export function checkCommits(list, { root, count, exempt = EXEMPT, shallow = false } = {}) {
  const out = [];
  const skip = new Set(exempt);
  const owner = root ?? list[0];
  for (const c of list) {
    if (skip.has(c.sha)) continue;
    const sha = c.sha;
    const subject = String(c.subject ?? '');
    const body = String(c.body ?? '').trim();
    const text = body ? `${subject}\n${body}` : subject;
    if (subject.trim() === '') out.push(finding(sha, 'subject', 'has no subject, and a commit says what it did in one sentence'));
    else if ([...subject].length > subjectMax)
      out.push(finding(sha, 'subject', `has a subject of ${[...subject].length} characters, and a subject is at most ${subjectMax}`));
    if (SENTENCES.test(subject)) out.push(finding(sha, 'sentence', 'has a subject of more than one sentence, and a subject is one'));
    if (body) out.push(finding(sha, 'body', `has a body of ${body.split('\n').length} line(s), and a commit is its subject alone`));
    if (text.split('\n').some((l) => TRAILER.test(l)))
      out.push(finding(sha, 'trailer', 'carries a "Word-Word: value" line, and a commit carries no trailer of any kind'));
    if (URL_RE.test(text)) out.push(finding(sha, 'url', 'holds a URL, and a commit links nothing'));
    if (EM_DASH.test(text)) out.push(finding(sha, 'em-dash', 'holds an em dash, and a commit uses a comma or a colon'));
    if (SKIP_CI.test(text)) out.push(finding(sha, 'skip-ci', 'asks CI to skip it, and every push is checked'));
    if (text.split('\n').some((l) => TOOL_AUTHOR.test(l)))
      out.push(finding(sha, 'tool-author', 'names a tool or a model as an author, and every commit is his alone'));
    if (TOOL_IDENT.test(`${c.author} <${c.email}>`))
      out.push(finding(sha, 'tool-author', `is authored by ${c.author} <${c.email}>, a tool, and every commit is his alone`));
    else if (owner && c.author !== undefined && (c.author !== owner.author || c.email !== owner.email))
      out.push(finding(sha, 'author', `is authored by ${c.author} <${c.email}>, and every commit is ${owner.author} <${owner.email}>'s`));
    if ((c.parents ?? 0) > 1) out.push(finding(sha, 'merge', 'is a merge commit, and master is linear: rebase it'));
  }
  if (count !== undefined && count < floor)
    out.push({
      sha: 'HEAD',
      rule: 'floor',
      says:
        `HEAD  reaches ${count} commit(s), and the history holds at least ${floor}: it is rewritten clean, never restarted` +
        (shallow ? ' (this checkout is shallow: fetch the whole history, fetch-depth 0)' : ''),
    });
  return out;
}

/** One message, as the commit-msg hook has it: the commit is not made yet, so it has no sha. */
export function checkMessage(text, { author, email, root } = {}) {
  const { subject, body } = parseMessage(text);
  return checkCommits([{ sha: 'this commit', author, email, subject, body }], { root, exempt: [] });
}

/** `git` in `root`, its output, or `null` when it failed. */
const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: Infinity });
  return r.status === 0 ? r.stdout : null;
};

/** The root commit's author: the oldest commit with no parent. */
export function rootAuthor(root) {
  const lines = (git(root, ['log', '--max-parents=0', '--format=%an%x00%ae', 'HEAD']) ?? '').split('\n').filter(Boolean);
  const last = lines.at(-1);
  if (!last) return undefined;
  const [author, email] = last.split('\0');
  return { author, email };
}

/**
 * The `git log` arguments for `range`, and a note when it had to be narrowed. A push that opens the branch has a
 * `before` of zeros, and a rewritten history has a `before` the repository no longer holds: either way the pushed
 * commit is read alone, and the note says so.
 */
export function rangeArgs(root, range) {
  const [before, after = 'HEAD'] = String(range).split('..');
  if (/^0+$/u.test(before)) return { args: ['-n', '1', after], note: `the push opened the branch, so ${after} is read alone` };
  if (git(root, ['cat-file', '-e', `${before}^{commit}`]) === null)
    return { args: ['-n', '1', after], note: `${before} is not in this history (rewritten?), so ${after} is read alone` };
  return { args: [`${before}..${after}`], note: null };
}

/**
 * The commits in `range`, newest first, in the shape `checkCommits` reads. `null` when git failed or the output does
 * not frame.
 *
 * FRAMED BY NUL ALONE, five fields a commit, because NUL is the one byte git keeps out of a message and an ident. Any
 * other separator can be typed into a message, and a message that could end its own record could hand the gate a
 * second one under an exempt sha.
 */
export function commitsIn(root, args) {
  const out = git(root, ['log', '-z', '--format=%H%x00%P%x00%an%x00%ae%x00%B', ...args]);
  if (out === null) return null;
  if (out === '') return [];
  const f = out.replace(/\0$/u, '').split('\0');
  if (f.length % 5 !== 0) return null;
  const list = [];
  for (let i = 0; i < f.length; i += 5) {
    const [sha, parents, author, email, message] = f.slice(i, i + 5);
    if (!/^[0-9a-f]{40,64}$/u.test(sha)) return null;
    const { subject, body } = parseMessage(message, { verbatim: true });
    list.push({ sha, parents: parents.split(' ').filter(Boolean).length, author, email, subject, body });
  }
  return list;
}

/** What the gate reads: a planted `log.json`, or the repository's own history. `null` when there is neither. */
function readHistory(ROOT) {
  if (isRepository(ROOT)) {
    const asked = process.env.BRAINDOG_COMMITS_RANGE?.trim();
    const range = asked || 'origin/master..HEAD';
    const head = asked ? range.split('..')[1] || 'HEAD' : 'HEAD';
    let { args, note } = rangeArgs(ROOT, range);
    if (!asked && git(ROOT, ['rev-parse', '--verify', '-q', 'origin/master']) === null) {
      args = ['-n', '0'];
      note = 'there is no origin/master here, so no commit is read and only the floor is held';
    }
    const commits = commitsIn(ROOT, args);
    if (commits === null) return { error: `git log ${args.join(' ')} failed, or its output did not frame` };
    const count = Number(git(ROOT, ['rev-list', '--count', head]) ?? 0);
    const shallow = git(ROOT, ['rev-parse', '--is-shallow-repository'])?.trim() === 'true';
    return { where: range, note, commits, count, shallow, root: rootAuthor(ROOT), exempt: EXEMPT };
  }
  const file = join(ROOT, 'log.json');
  if (!existsSync(file)) return null;
  const log = JSON.parse(readFileSync(file, 'utf8'));
  return { where: 'log.json', note: null, commits: log.commits ?? [], count: log.count, shallow: false, root: log.root, exempt: [] };
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function commits(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const h = readHistory(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (h === null) {
    console.log(`  commits: no history to read under ${ROOT} (no repository and no log.json)`);
    return COULD_NOT_RUN;
  }
  if (h.error) {
    console.log(`  commits: ${h.error} under ${ROOT}`);
    return COULD_NOT_RUN;
  }
  if (h.note) console.log(`  commits: ${h.note}`);
  const findings = checkCommits(h.commits, { root: h.root, count: h.count, exempt: h.exempt, shallow: h.shallow });
  const read = h.commits.filter((c) => !h.exempt.includes(c.sha)).length;
  const where = `${read} commit(s) in ${h.where}, ${h.commits.length - read} exempt, ${h.count} reachable`;
  if (findings.length === 0) {
    console.log(`  commits: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(`  ${f.says}`);
  console.error(
    `\n  commits: ${where}, ${findings.length} finding(s).\n` +
      `  A commit is one sentence of at most ${subjectMax} characters, with no body, no trailer, no link, by its one author,\n` +
      `  for example "${EXAMPLE}".\n` +
      '  Reword one with `git commit --amend` (the last) or `git rebase -i` before it is pushed.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = commits(process.argv[2]) ?? 0;
