/**
 * `commits`: a commit is one short sentence by its one author, and the history is never restarted (WAY-B02).
 *
 *   node --test tools/gates/test/commits.test.mjs
 *
 * Each rule is asked once red and once green beside it, the planted trees under `negative/commits-*` are each red on
 * their one commit, a scratch repository proves the gate reads git the way CI hands it a push, and the two hooks in
 * `loop/kit/hooks/` refuse the five commits the scope's "done when" tries. The hooks live in `loop/`, which is never
 * tracked, so their tests are skipped where the loop is not.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { budget } from '../lib.mjs';
import { EXAMPLE, EXEMPT, checkCommits, checkMessage, commitsIn, parseMessage, rangeArgs, rootAuthor } from '../commits.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const negatives = join(gates, 'negative');
const ADA = { author: 'Ada Lane', email: 'ada@example.com' };
const one = (over = {}) => ({ sha: 'aaa', ...ADA, subject: 'The rail is one flat column', body: '', parents: 1, ...over });
const rules = (c, opts = { root: ADA }) => checkCommits([one(c)], opts).map((f) => f.rule);

test('a good commit is green, and the example every refusal quotes is one', () => {
  assert.deepEqual(checkCommits([one()], { root: ADA }), []);
  assert.deepEqual(checkCommits([one({ subject: EXAMPLE })], { root: ADA }), []);
});

test('the subject: 1 to the budget, and one sentence', () => {
  const max = budget('commits').subjectMax;
  assert.equal(max, 72);
  assert.deepEqual(rules({ subject: 'x'.repeat(max) }), []);
  assert.deepEqual(rules({ subject: 'x'.repeat(max + 1) }), ['subject']);
  assert.deepEqual(rules({ subject: '' }), ['subject']);
  assert.deepEqual(rules({ subject: 'The rail is flat. The board is red.' }), ['sentence']);
  assert.deepEqual(rules({ subject: 'Payments read v2.3 of the bank file' }), []);
});

test('no body, no trailer, no link, no em dash', () => {
  assert.deepEqual(rules({ body: 'One more line.' }), ['body']);
  assert.deepEqual(rules({ body: 'Signed-off-by: Ada Lane <ada@example.com>' }), ['body', 'trailer']);
  assert.deepEqual(rules({ subject: 'Refs-Issue: the payments page' }), ['trailer']);
  assert.deepEqual(rules({ subject: 'Docs point at https://example.com/help' }), ['url']);
  assert.deepEqual(rules({ subject: 'Docs point at claude.ai/code/session' }), ['url']);
  assert.deepEqual(rules({ subject: 'The rail is flat \u2014 one column' }), ['em-dash']);
  assert.deepEqual(rules({ subject: 'The rail is flat [skip ci]' }), ['skip-ci']);
  assert.deepEqual(rules({ subject: 'The rail is flat [CI SKIP]' }), ['skip-ci']);
  assert.deepEqual(rules({ subject: 'Times read as 10:30, and a colon is fine' }), []);
});

test('a line naming a tool or a model as an author is refused, and the product naming one is not', () => {
  for (const subject of ['Payday rows fixed, co-authored by claude', 'Generated with Claude Code', 'Settings written with ChatGPT', 'Made using an AI'])
    assert.deepEqual(rules({ subject }), ['tool-author'], subject);
  assert.deepEqual(rules({ body: 'Co-Authored-By: Claude <noreply@anthropic.com>' }), ['body', 'trailer', 'tool-author']);
  for (const subject of ['The agents page reads which model a run used', 'Built with care: the money page', 'The AI tab says what it read'])
    assert.deepEqual(rules({ subject }), [], subject);
});

test('one author, the root commit\'s, and never a tool; no merge', () => {
  assert.deepEqual(rules({ author: 'Sam Ortiz', email: 'sam@example.com' }), ['author']);
  assert.deepEqual(rules({ email: 'ada@elsewhere.example' }), ['author']);
  assert.deepEqual(rules({ author: 'Claude', email: 'noreply@anthropic.com' }), ['tool-author']);
  assert.deepEqual(rules({ author: 'dependabot[bot]', email: 'support@github.com' }), ['tool-author']);
  assert.deepEqual(rules({ parents: 2 }), ['merge']);
  /* WITHOUT A ROOT, THE FIRST COMMIT OF THE LIST IS THE AUTHOR, which is what `push.mjs` hands it with the list alone. */
  assert.deepEqual(checkCommits([one(), one({ sha: 'bbb', author: 'Sam Ortiz' })]).map((f) => f.sha), ['bbb']);
});

test('the floor: a history under it is red, and a shallow checkout says so', () => {
  const floor = budget('history').floor;
  assert.equal(floor, 1849);
  assert.deepEqual(checkCommits([], { count: floor }), []);
  const [f] = checkCommits([], { count: floor - 1, shallow: true });
  assert.equal(f.rule, 'floor');
  assert.match(f.says, /never restarted/u);
  assert.match(f.says, /fetch-depth 0/u);
});

test('an exempt sha is not read, and the list holds the commits before the first guarded push', () => {
  assert.deepEqual(checkCommits([one({ sha: EXEMPT[0], subject: 'x'.repeat(200), body: 'long' })], { root: ADA }), []);
  assert.ok(EXEMPT.length > 0 && EXEMPT.every((s) => /^[0-9a-f]{40}$/u.test(s)));
  assert.equal(new Set(EXEMPT).size, EXEMPT.length);
});

test('a message as git hands it: comments and the scissors dropped', () => {
  const text = '\nThe rail is flat\n\n# Please enter the commit message\n# ------------------------ >8 ------------------------\ndiff --git a b\n';
  assert.deepEqual(parseMessage(text), { subject: 'The rail is flat', body: '' });
  assert.deepEqual(parseMessage('One\r\n\r\nTwo\r\n'), { subject: 'One', body: 'Two' });
  assert.deepEqual(checkMessage('The rail is flat\n', { ...ADA, root: ADA }), []);
  assert.deepEqual(checkMessage('The rail is flat\n\nCo-authored by claude\n', ADA).map((f) => f.rule), ['body', 'tool-author']);
});

test('every planted tree is red on its one commit, by the count its case says', () => {
  const trees = readdirSync(negatives).filter((t) => t.startsWith('commits-'));
  assert.ok(trees.length >= 11, trees.join(', '));
  for (const tree of trees) {
    const at = join(negatives, tree);
    const c = JSON.parse(readFileSync(join(at, 'case.json'), 'utf8'));
    const seed = readFileSync(join(at, 'expect.txt'), 'utf8').trim();
    const r = spawnSync(process.execPath, [join(gates, 'commits.mjs')], { cwd: at, encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
    const said = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, c.skip ? 3 : 1, `${tree}: ${said}`);
    assert.match(said, new RegExp(c.expect, 'iu'), tree);
    assert.equal(said.split('\n').filter((l) => l.includes(seed)).length, c.findings, `${tree}: ${said}`);
  }
});

/**
 * A scratch repository made with git's plumbing, so no hook of anyone's runs while it is built. `commit` makes one
 * commit on `master` by `who` and returns its sha.
 */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'commits-gate-'));
  const env = (who = ADA) => ({
    ...process.env,
    GIT_AUTHOR_NAME: who.author,
    GIT_AUTHOR_EMAIL: who.email,
    GIT_COMMITTER_NAME: who.author,
    GIT_COMMITTER_EMAIL: who.email,
    GIT_CONFIG_NOSYSTEM: '1',
  });
  const git = (args, { who, input = '' } = {}) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: env(who), input });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git(['init', '-q', '-b', 'master']);
  const tree = git(['mktree']);
  let head = null;
  const commit = (message, { who, parents = head ? [head] : [] } = {}) => {
    head = git(['commit-tree', '--no-gpg-sign', tree, ...parents.flatMap((p) => ['-p', p]), '-m', message], { who });
    git(['update-ref', 'refs/heads/master', head]);
    return head;
  };
  return { dir, git, commit, env, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const gate = (dir, range) => {
  const r = spawnSync(process.execPath, [join(gates, 'commits.mjs'), dir], {
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_ROOT: dir, ...(range ? { BRAINDOG_COMMITS_RANGE: range } : {}) },
  });
  return { status: r.status, said: `${r.stdout}${r.stderr}` };
};

test('over git: the push range is read, its root author held, and a short history is red by its count', () => {
  const s = scratch();
  try {
    const first = s.commit('The first commit');
    const good = s.commit('The rail is one flat column');
    const bad = s.commit('A body under it\n\nOne more line.');
    const other = s.commit('A second person', { who: { author: 'Sam Ortiz', email: 'sam@example.com' } });
    assert.deepEqual(rootAuthor(s.dir), ADA);
    const list = commitsIn(s.dir, [`${first}..HEAD`]);
    assert.deepEqual(list.map((c) => c.sha), [other, bad, good]);
    assert.deepEqual(checkCommits(list, { root: ADA }).map((f) => [f.sha, f.rule]), [[other, 'author'], [bad, 'body']]);

    const r = gate(s.dir, `${good}..${other}`);
    assert.equal(r.status, 1, r.said);
    assert.match(r.said, new RegExp(`${bad}  has a body`, 'u'));
    assert.match(r.said, new RegExp(`${other}  is authored by Sam Ortiz`, 'u'));
    assert.match(r.said, /HEAD {2}reaches 4 commit\(s\)/u);
    assert.equal(r.said.split('\n').filter((l) => l.startsWith(`  ${good}`)).length, 0, 'the commit before the range is not read');
  } finally {
    s.done();
  }
});

test('a before of zeros, or one a rewrite took away, reads the pushed commit alone and says so', () => {
  const s = scratch();
  try {
    s.commit('The first commit');
    const last = s.commit('The rail is one flat column');
    assert.deepEqual(rangeArgs(s.dir, `${'0'.repeat(40)}..${last}`).args, ['-n', '1', last]);
    const gone = rangeArgs(s.dir, `${'1'.repeat(40)}..${last}`);
    assert.deepEqual(gone.args, ['-n', '1', last]);
    assert.match(gone.note, /not in this history/u);
    const r = gate(s.dir, `${'0'.repeat(40)}..${last}`);
    assert.match(r.said, /read alone/u);
    assert.match(r.said, /1 commit\(s\) in/u);
  } finally {
    s.done();
  }
});

test('a message cannot widen the exempt list, hide under a scissors line, or turn CI off', () => {
  const s = scratch();
  try {
    const first = s.commit('The first commit');
    /* A RECORD SEPARATOR, AN EXEMPT SHA AND A TRAILER: the message tries to end its own record and start one git never made. */
    const forged = s.commit(`The rail is flat\x1e${EXEMPT[0]}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`);
    /* A SCISSORS LINE KEPT BY --cleanup=verbatim, which a hook's reading of a message would stop at. */
    const scissors = s.commit('The rail is flat\n# ------------------------ >8 ------------------------\nhttps://example.com/session');
    const skip = s.commit('The rail is flat [skip ci]');
    const list = commitsIn(s.dir, [`${first}..HEAD`]);
    assert.deepEqual(list.map((c) => c.sha), [skip, scissors, forged], 'one commit a record, and no sha but git\'s');
    const found = checkCommits(list, { root: ADA }).map((f) => [f.sha, f.rule]);
    assert.ok(!found.some(([sha]) => EXEMPT.includes(sha)));
    assert.deepEqual(found, [
      [skip, 'skip-ci'],
      [scissors, 'body'],
      [scissors, 'url'],
      [forged, 'body'],
      [forged, 'trailer'],
      [forged, 'tool-author'],
    ]);
    const r = gate(s.dir, `${first}..HEAD`);
    assert.equal(r.status, 1, r.said);
    assert.match(r.said, /3 commit\(s\) in .*, 0 exempt/u);
  } finally {
    s.done();
  }
});

test('this repository: every exempt sha is a commit it holds, where the whole history is here', () => {
  const shallow = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: repo, encoding: 'utf8' });
  if (shallow.status !== 0 || shallow.stdout.trim() === 'true') return;
  for (const sha of EXEMPT) {
    const r = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo });
    assert.equal(r.status, 0, `${sha} is exempt and is not in this history: take it off EXEMPT`);
  }
});

const hooks = join(repo, 'loop', 'kit', 'hooks');
const noLoop = !existsSync(join(hooks, 'pre-commit')) && 'the hooks live in loop/, which is local and never tracked';

/** A hook's `main` with the process's git identity and private list aimed at the scratch run, and its output kept. */
async function withHook(name, who, fn) {
  const keep = { ...process.env };
  const said = [];
  const error = console.error;
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: who.author,
    GIT_AUTHOR_EMAIL: who.email,
    GIT_COMMITTER_NAME: who.author,
    GIT_COMMITTER_EMAIL: who.email,
    BRAINDOG_PRIVATE_TERMS: join(tmpdir(), 'commits-gate-no-private-terms.txt'),
  });
  delete process.env.BRAINDOG_WAVE;
  console.error = (...a) => said.push(a.join(' '));
  try {
    const { main } = await import(pathToFileURL(join(hooks, name)).href);
    return { code: await fn(main), said: said.join('\n') };
  } finally {
    console.error = error;
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
}

test('commit-msg refuses the three messages the scope tries, and lets a sentence through', { skip: noLoop }, async () => {
  const s = scratch();
  try {
    s.commit('The first commit');
    const file = join(s.dir, 'MSG');
    const ask = async (message, who = ADA) => {
      writeFileSync(file, message);
      return withHook('commit-msg', who, (main) => main(file, s.dir));
    };
    const long = await ask(`${'The money page reads ages and currencies, and the door says how it was asked'.padEnd(96, ' again')}\n`);
    assert.equal(long.code, 1);
    assert.match(long.said, /subject of 96 characters, and a subject is at most 72/u);
    const body = await ask('The rail is flat\n\nOne line.\nAnd another.\n');
    assert.equal(body.code, 1);
    assert.match(body.said, /has a body of 2 line\(s\)/u);
    const trailer = await ask('The rail is flat\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n');
    assert.equal(trailer.code, 1);
    assert.match(trailer.said, /Word-Word: value/u);
    assert.match(trailer.said, /names a tool or a model as an author/u);
    assert.match(trailer.said, new RegExp(EXAMPLE, 'u'));
    const stranger = await ask('The rail is flat\n', { author: 'Sam Ortiz', email: 'sam@example.com' });
    assert.match(stranger.said, /is authored by Sam Ortiz/u);
    const { WORDS } = await import('../public-clean.mjs');
    const word = await ask(`The page for ${WORDS[0]} is gone\n`);
    assert.match(word.said, /a private word/u);
    assert.equal((await ask('The rail is one flat column\n# a comment git adds\n')).code, 0);
  } finally {
    s.done();
  }
});

test('pre-commit refuses a held tree, a path by force under loop/, a path outside the manifest and a stranger', { skip: noLoop }, async () => {
  const s = scratch();
  try {
    s.commit('The first commit');
    const { GUARDS } = await import('../hygiene.mjs');
    writeFileSync(join(s.dir, '.gitignore'), `${GUARDS.map(([l]) => l).join('\n')}\n`);
    mkdirSync(join(s.dir, 'loop', 'run', 'w1'), { recursive: true });
    writeFileSync(join(s.dir, 'page.ts'), 'export const page = 1;\n');
    writeFileSync(join(s.dir, 'other.ts'), 'export const other = 1;\n');
    s.git(['add', '.gitignore', 'page.ts']);
    const ask = (who = ADA) => withHook('pre-commit', who, (main) => main(s.dir));

    const none = await ask();
    assert.equal(none.code, 1);
    assert.match(none.said, /no manifest names what may be staged/u);

    writeFileSync(join(s.dir, 'loop', 'run', 'w1', 'stage.json'), JSON.stringify(['.gitignore', '*.ts']));
    assert.equal((await ask()).code, 0, 'the manifest names both');

    writeFileSync(join(s.dir, 'loop', 'run', 'w1', 'stage.json'), JSON.stringify({ paths: ['.gitignore', 'page.ts'] }));
    s.git(['add', 'other.ts']);
    const outside = await ask();
    assert.equal(outside.code, 1);
    assert.match(outside.said, /other\.ts is staged, and loop\/run\/w1\/stage\.json does not name it/u);
    s.git(['rm', '-q', '--cached', 'other.ts']);

    writeFileSync(join(s.dir, 'loop', 'notes.md'), 'a note\n');
    s.git(['add', '-f', 'loop/notes.md']);
    const forced = await ask();
    assert.equal(forced.code, 1);
    assert.match(forced.said, /loop\/notes\.md {2}is tracked, and it is the loop's working notes/u);
    s.git(['rm', '-q', '--cached', 'loop/notes.md']);

    writeFileSync(join(s.dir, 'loop', 'HOLD-COMMITS'), 'local changes (2026-10-09)\n');
    const held = await ask();
    assert.equal(held.code, 1);
    assert.match(held.said, /loop\/HOLD-COMMITS is set: "local changes" \(2026-10-09\)/u);
    rmSync(join(s.dir, 'loop', 'HOLD-COMMITS'));

    const stranger = await ask({ author: 'Sam Ortiz', email: 'sam@example.com' });
    assert.match(stranger.said, /the author is Sam Ortiz <sam@example\.com>/u);
    assert.equal((await ask()).code, 0, 'and green again once each is undone');
  } finally {
    s.done();
  }
});

test('a manifest path: * within a folder, ** across, a trailing slash the folder', { skip: noLoop }, async () => {
  const { patternOf, outsideManifest, addedLines } = await import(pathToFileURL(join(hooks, 'pre-commit')).href);
  assert.ok(patternOf('tools/gates/negative/commits-*/**').test('tools/gates/negative/commits-url/log.json'));
  assert.ok(!patternOf('tools/gates/*.mjs').test('tools/gates/test/x.mjs'));
  assert.ok(patternOf('packages/**/x.ts').test('packages/x.ts'));
  assert.ok(patternOf('apps/web/').test('apps/web/src/a.ts'));
  assert.ok(!patternOf('a.b').test('axb'));
  assert.deepEqual(outsideManifest(['a.ts', 'b/c.ts'], ['b/*']), ['a.ts']);
  const diff = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,0 +3,2 @@\n+one\n+two\n';
  assert.deepEqual(addedLines(diff), [{ file: 'x', line: 3, text: 'one' }, { file: 'x', line: 4, text: 'two' }]);
  /* AN ADDED LINE THAT READS `++ x` IS NO HEADER: the lines after it are still read. */
  const plus = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,0 +1,2 @@\n+++ x\n+two\n';
  assert.deepEqual(addedLines(plus), [{ file: 'x', line: 1, text: '++ x' }, { file: 'x', line: 2, text: 'two' }]);
});
