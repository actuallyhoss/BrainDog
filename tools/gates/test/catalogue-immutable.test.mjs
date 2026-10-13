/**
 * `catalogue-immutable`: a version the released build holds is the same version in this tree, to the byte.
 *
 *   node --test tools/gates/test/catalogue-immutable.test.mjs
 *
 * EACH CASE PLANTS A REPOSITORY WITH ONE COMMIT, the released catalogue, in the loop's scratch folder, then changes the
 * working tree and asks the gate with that commit as its base. The cases on the tracked file plant a second commit. Nothing here writes under this repository, and the
 * repository's own catalogue is only read.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { CATALOGUE, RELEASED, RELEASED_FILE, releasedCommit, verdict } from '../catalogue-immutable.mjs';

const gates = join(import.meta.dirname, '..');
const scratch = join(tmpdir(), 'braindog-loop', 'W066', 'catalogue-immutable-66');
const INDEX = `${CATALOGUE}/index.json`;

const version = (v, checksum, more = {}) => ({ version: v, checksum, bytes: 100, published_at: '2026-09-01T10:00:00.000Z', notes: 'First.', ...more });
const entry = (id, title, versions) => ({ kind: 'pack', id, title, latest: versions[0].version, versions });

/** The released catalogue: two add-ons, three versions, each with its file. */
const released = () => ({
  format: 1,
  name: 'Planted',
  entries: [entry('reading-list', 'Reading list', [version('1.1.0', 'b'.repeat(64)), version('1.0.0', 'a'.repeat(64))]), entry('hello', 'Hello', [version('2.0.0', 'c'.repeat(64))])],
});

const git = (at, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=Planted', '-c', 'user.email=planted@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: at, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

function put(at, rel, text) {
  mkdirSync(dirname(join(at, rel)), { recursive: true });
  writeFileSync(join(at, rel), text);
}

const putIndex = (at, index) => put(at, INDEX, `${JSON.stringify(index, null, 2)}\n`);
const fileOf = (id, v) => `${CATALOGUE}/packs/${id}/${v}.pack.json`;

/** A repository whose one commit is the released catalogue. Returns its folder and that commit. */
function plant(t) {
  mkdirSync(scratch, { recursive: true });
  const at = mkdtempSync(join(scratch, 'tree-'));
  t.after(() => rmSync(at, { recursive: true, force: true }));
  git(at, 'init', '-q');
  const index = released();
  putIndex(at, index);
  for (const e of index.entries) for (const v of e.versions) put(at, fileOf(e.id, v.version), `{"pack":"${e.id}","version":"${v.version}"}\n`);
  git(at, 'add', CATALOGUE);
  git(at, 'commit', '-q', '-m', 'The released catalogue.');
  return { at, base: git(at, 'rev-parse', 'HEAD') };
}

function run(at, base) {
  const env = { ...process.env, BRAINDOG_GATE_ROOT: at };
  if (base === undefined) delete env.BRAINDOG_CATALOGUE_BASE;
  else env.BRAINDOG_CATALOGUE_BASE = base;
  const r = spawnSync(process.execPath, [join(gates, 'catalogue-immutable.mjs')], { encoding: 'utf8', env });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** The lines that name a finding: two spaces, the file, two spaces. */
const named = (out) => out.split('\n').filter((l) => /^ {2}apps\/\S+ {2}/u.test(l));

test('an unchanged tree is green, and says how many released versions it held', (t) => {
  const { at, base } = plant(t);
  const r = run(at, base);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /\b3 released version\(s\) of 2 add-on\(s\).*0 finding\(s\)/u);
});

test('a new version beside the released ones, and a new add-on, are green', (t) => {
  const { at, base } = plant(t);
  const index = released();
  index.entries[0].versions.unshift(version('1.2.0', 'd'.repeat(64), { published_at: '2026-10-13T09:00:00.000Z' }));
  index.entries[0].latest = '1.2.0';
  index.entries[0].title = 'Reading';
  index.entries.push(entry('count-cash', 'Count cash', [version('1.0.0', 'e'.repeat(64))]));
  putIndex(at, index);
  put(at, fileOf('reading-list', '1.2.0'), '{"pack":"reading-list","version":"1.2.0"}\n');
  put(at, fileOf('count-cash', '1.0.0'), '{"pack":"count-cash","version":"1.0.0"}\n');
  const r = run(at, base);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /2 new version\(s\)/u);
});

test('one changed checksum in a released version is red, and names the add-on and the version', (t) => {
  const { at, base } = plant(t);
  const index = released();
  index.entries[0].versions[1].checksum = 'f'.repeat(64);
  putIndex(at, index);
  const r = run(at, base);
  assert.equal(r.status, 1, r.out);
  const lines = named(r.out);
  assert.equal(lines.length, 1, r.out);
  assert.match(lines[0], /^ {2}apps\/web\/static\/catalogue\/index\.json {2}Reading list \(reading-list\) 1\.0\.0 was changed in place: its checksum was aaaaaaaaaaaa and is ffffffffffff\./u);
  assert.match(r.out, /\b1 finding\(s\)/u);
  assert.match(r.out, /cut a new version beside it/iu);
});

test('a changed size or a changed publish date of a released version is red too', (t) => {
  const { at, base } = plant(t);
  const index = released();
  index.entries[1].versions[0].bytes = 101;
  index.entries[0].versions[0].published_at = '2026-10-13T09:00:00.000Z';
  putIndex(at, index);
  const r = run(at, base);
  assert.equal(r.status, 1, r.out);
  const lines = named(r.out);
  assert.equal(lines.length, 2, r.out);
  assert.ok(lines.some((l) => /Hello \(hello\) 2\.0\.0 was changed in place: its size was 100 bytes and is 101 bytes\./u.test(l)), r.out);
  assert.ok(lines.some((l) => /Reading list \(reading-list\) 1\.1\.0 was changed in place: its publish date was 2026-09-01T10:00:00\.000Z and is 2026-10-13T09:00:00\.000Z\./u.test(l)), r.out);
});

test('a removed version is red, and so is a removed add-on', (t) => {
  const { at, base } = plant(t);
  const index = released();
  index.entries[0].versions.pop();
  index.entries.pop();
  putIndex(at, index);
  const r = run(at, base);
  assert.equal(r.status, 1, r.out);
  const lines = named(r.out);
  assert.equal(lines.length, 2, r.out);
  assert.ok(lines.some((l) => /Reading list \(reading-list\) 1\.0\.0 was removed from the catalogue/u.test(l)), r.out);
  assert.ok(lines.some((l) => /Hello \(hello\) was removed from the catalogue, with its 1 released version\(s\): 2\.0\.0/u.test(l)), r.out);
});

test('one byte changed in a released version file is red with the index untouched, and a deleted file is red', (t) => {
  const { at, base } = plant(t);
  put(at, fileOf('reading-list', '1.0.0'), '{"pack":"reading-list","version":"1.0.0"} \n');
  rmSync(join(at, fileOf('hello', '2.0.0')));
  const r = run(at, base);
  assert.equal(r.status, 1, r.out);
  const lines = named(r.out);
  assert.equal(lines.length, 2, r.out);
  assert.ok(lines.some((l) => l.startsWith(`  ${fileOf('reading-list', '1.0.0')}  Reading list (reading-list) 1.0.0: this file was changed in place.`)), r.out);
  assert.ok(lines.some((l) => l.startsWith(`  ${fileOf('hello', '2.0.0')}  Hello (hello) 2.0.0: this file was removed.`)), r.out);
});

test('a change already committed after the base is still red: the base is the release, not the last commit', (t) => {
  const { at, base } = plant(t);
  const index = released();
  index.entries[1].versions[0].checksum = '9'.repeat(64);
  putIndex(at, index);
  git(at, 'add', INDEX);
  git(at, 'commit', '-q', '-m', 'Republished in place.');
  const r = run(at, base);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Hello \(hello\) 2\.0\.0 was changed in place: its checksum/u);
});

test('a base that cannot be read is red, never a pass', (t) => {
  const { at } = plant(t);
  const r = run(at, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /could not read the released catalogue/u);
  /* And with no base named, a planted repository does not hold this repository's released commit. */
  assert.equal(run(at).status, 1);
});

test('a working index that does not read is red', (t) => {
  const { at, base } = plant(t);
  put(at, INDEX, '{ "entries": [');
  const r = run(at, base);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /index\.json does not read/u);
});

test('a planted tree with no history is judged against its released.json', (t) => {
  mkdirSync(scratch, { recursive: true });
  const at = mkdtempSync(join(scratch, 'flat-'));
  t.after(() => rmSync(at, { recursive: true, force: true }));
  /* Its own empty repository above the tree, so the tree is not this checkout's top or any other's. */
  git(at, 'init', '-q');
  const tree = join(at, 'tree');
  put(tree, 'released.json', JSON.stringify(released()));
  putIndex(tree, released());
  assert.equal(run(tree).status, 0);
  const index = released();
  index.entries[1].versions[0].checksum = '0'.repeat(64);
  putIndex(tree, index);
  const r = run(tree);
  assert.equal(r.status, 1, r.out);
  assert.equal(named(r.out).length, 1, r.out);
  assert.match(r.out, /Hello \(hello\) 2\.0\.0 was changed in place/u);
});

test('the repository is green against the released commit', () => {
  const root = join(gates, '..', '..');
  /* The commit the gate itself reads, the tracked file's once a deploy has written one, so this holds on that day too. */
  const pin = releasedCommit(root);
  assert.equal(pin.error, undefined, pin.error);
  const r = run(root);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`against ${pin.commit}\\b.*0 finding\\(s\\)`, 'u'));
  assert.match(RELEASED, /^[0-9a-f]{8,40}$/u);
});

/** A planted repository with a second commit, a new version beside the released ones. Returns both commits. */
function plantTwo(t) {
  const { at, base: first } = plant(t);
  const index = released();
  index.entries[1].versions.unshift(version('2.1.0', 'd'.repeat(64)));
  index.entries[1].latest = '2.1.0';
  putIndex(at, index);
  put(at, fileOf('hello', '2.1.0'), '{"pack":"hello","version":"2.1.0"}\n');
  git(at, 'add', CATALOGUE);
  git(at, 'commit', '-q', '-m', 'A new version.');
  return { at, first, second: git(at, 'rev-parse', 'HEAD') };
}

const pinTo = (at, text) => put(at, RELEASED_FILE, text);

test('the released commit is read from the tracked file, and the line says so', (t) => {
  const { at, first, second } = plantTwo(t);
  /* No file, and a planted repository does not hold the constant's commit. */
  assert.deepEqual(releasedCommit(at), { commit: RELEASED, from: 'constant' });
  pinTo(at, `${JSON.stringify({ commit: first, deployed: '2026-10-13' })}\n`);
  assert.deepEqual(releasedCommit(at), { commit: first, from: RELEASED_FILE });
  const r = run(at);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(`against ${first} (from ${RELEASED_FILE})`), r.out);
  assert.match(r.out, /\b3 released version\(s\) of 2 add-on\(s\).*, 1 new version\(s\) beside them, 0 finding\(s\)/u);
  /* Moved forward to the second commit, its version is released too. */
  pinTo(at, JSON.stringify({ commit: second }));
  const later = run(at);
  assert.equal(later.status, 0, later.out);
  assert.match(later.out, /\b4 released version\(s\) of 2 add-on\(s\).*, 0 new version\(s\) beside them/u);
});

test('a file that cannot be trusted is red, never a quiet fall back to the constant', (t) => {
  const { at, first } = plantTwo(t);
  /* A commit that is real and on another line: the first commit's child, which HEAD does not hold. */
  const aside = git(at, 'commit-tree', `${first}^{tree}`, '-p', first, '-m', 'Another line.');
  const cases = [
    ['not JSON', '{ "commit": ', /does not read as/u],
    ['no commit in it', '{"deployed":"2026-10-13"}', /does not read as/u],
    ['a branch name', JSON.stringify({ commit: git(at, 'branch', '--show-current') }), /does not read as/u],
    ['an unknown commit', JSON.stringify({ commit: '0123456789abcdef0123456789abcdef01234567' }), /there is no such commit here/u],
    ['a commit on another line', JSON.stringify({ commit: aside }), /not in the history of this checkout/u],
  ];
  for (const [what, text, why] of cases) {
    pinTo(at, text);
    const r = run(at);
    assert.equal(r.status, 1, `${what}: ${r.out}`);
    assert.match(r.out, /could not read the released catalogue/u, what);
    assert.match(r.out, why, what);
    assert.ok(releasedCommit(at).error, what);
  }
});

test('a commit asked for wins over the file, even a file that does not read', (t) => {
  const { at, first, second } = plantTwo(t);
  pinTo(at, JSON.stringify({ commit: second }));
  const r = run(at, first);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(`against ${first},`), r.out);
  assert.ok(!r.out.includes('(from '), r.out);
  assert.match(r.out, /\b3 released version\(s\).*, 1 new version\(s\)/u);
  pinTo(at, 'not a file the gate can read');
  assert.equal(run(at, first).status, 0);
});

test('the verdict by itself: a second copy of a released version is red, and nothing new is', () => {
  const was = released();
  assert.deepEqual(verdict(was, released()).findings, []);
  const twice = released();
  twice.entries[1].versions.push(version('2.0.0', 'c'.repeat(64)));
  const { findings } = verdict(was, twice);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /Hello \(hello\) 2\.0\.0 is in the catalogue 2 times/u);
  const grown = released();
  grown.entries[1].versions.unshift(version('2.0.1', '1'.repeat(64)));
  assert.deepEqual(verdict(was, grown), { findings: [], released: 3, addons: 2, fresh: 1 });
  /* An add-on is itself by kind and id: the same id as another kind is another thing, and the released one is gone. */
  const other = released();
  other.entries[1].kind = 'usecase';
  assert.equal(verdict(was, other).findings.length, 1);
});

/*
 * RED BEFORE: gates.yml's parts and tag.yml's verify job checked out one commit and ran this gate, which cannot read the
 * released commit there and is red by design. Read as lines at the indents the files are written in, as the workflow
 * tests under apps/worker/scripts do: no YAML parser is a dependency of this repository.
 */
test('EVERY WORKFLOW JOB THAT RUNS THIS GATE CHECKS OUT THE WHOLE HISTORY', () => {
  const dir = new URL('../../../.github/workflows/', import.meta.url);
  const running = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yml'))) {
    const jobs = readFileSync(new URL(file, dir), 'utf8').split(/^(?= {2}[a-z][a-z0-9-]*:\s*$)/mu);
    for (const job of jobs) {
      /* A run of the gates that could hold this one: not the built selection, and not an `--only` list without it. */
      const runs = job.split('\n').filter((l) => !/^\s*#/u.test(l) && /pnpm gates|tools\/gates\/run\.mjs/u.test(l) && /\brun:/u.test(l));
      const holds = runs.some((l) => !/--built\b/u.test(l) && (!/--only\s/u.test(l) || /--only\s+\S*catalogue-immutable/u.test(l)) && !/--except\s+\S*catalogue-immutable/u.test(l));
      if (!holds) continue;
      const name = `${file} ${/^ {2}([a-z][a-z0-9-]*):/u.exec(job)?.[1] ?? '?'}`;
      running.push(name);
      assert.match(job, /uses: actions\/checkout@[^\n]+\n\s+with:\n\s+fetch-depth: 0\n/u, `${name} runs catalogue-immutable on a shallow checkout`);
    }
  }
  /* The three that run it today, so a pattern that stopped matching anything is red and not a quiet pass. */
  assert.deepEqual(running.sort(), ['ci.yml gates', 'gates.yml gates-shard', 'tag.yml verify']);
});
