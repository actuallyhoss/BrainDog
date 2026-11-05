/**
 * `catalogue-immutable`: a version the released build holds is never changed in place.
 *
 *   node tools/gates/catalogue-immutable.mjs [root] [base]
 *
 * `packs/README.md` SAYS "A published version never changes", AND NOTHING HELD IT. A record that installed 1.0.0 is held
 * to the checksum the index gave it, so a version republished under the same number is a different add-on to every
 * record that already has it. Old versions were edited in place once and nothing said whether that was allowed.
 *
 * WHAT RELEASED MEANS: in the catalogue at `RELEASED`, the commit the deployed build was made from. A version first
 * written after it is in no deploy yet and may still be reworked, which is how fixed-dates and worked-numbers 1.0.0
 * were republished in batch 64. `RELEASED` moves forward when a deploy does, never back, and
 * `BRAINDOG_CATALOGUE_BASE` (or the second argument) names another commit for one run, as a branch's merge base.
 *
 * WHERE THE COMMIT IS READ FROM, first found: the commit asked for; then `RELEASED_FILE`, a tracked file the deploy
 * writes with the commit it shipped; then the constant `RELEASED`. THE CONSTANT WAS MOVED BY HAND, which nothing did
 * after a deploy, so every version shipped since it stayed open to a change in place. THE FILE CAN ONLY HOLD MORE: it
 * is read only if its commit has `RELEASED` in its history and is in the history of this checkout, so a file that
 * names an older commit, or another line's, is red. A file that is there and does not read is red too, never a
 * quiet fall back to the constant. No file is the constant, which is the tree as it was before the deploy wrote one.
 *
 * TWO READS AGAINST THAT COMMIT, and the catalogue is only ever read:
 *   1. THE INDEX. `git show <base>:apps/web/static/catalogue/index.json` beside the working one. Every version there
 *      is still here, once, with the same checksum, size and publish date. A version or an add-on that went is red.
 *   2. THE FILES. `git diff <base>` under `packs/`: a version file changed or removed is red, with the index untouched
 *      too, so one byte of a published version fails. A file added is a new version and is not read.
 * A new version beside the old ones, a new add-on, and an add-on's title, summary or `latest` are all free to change.
 *
 * A PLANTED TREE HAS NO HISTORY, so a root that is not a repository's own top is judged against `released.json` at
 * its root, the released index as a file, the way `commits` reads `log.json`. Only the index is read there.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on. A base that
 * cannot be read, or one that holds no version, is red and not a skip: a gate that read nothing has not passed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRepository } from './public-clean.mjs';

/**
 * The commit the deployed build was made from, WHEN NO FILE SAYS A LATER ONE, and the floor under the file: a version
 * in its catalogue is released whatever the file says. ONLY EVER MOVED FORWARD.
 */
export const RELEASED = '7250a163';

/**
 * The tracked file the deploy writes: `{ "commit": "<the commit that was deployed>" }`. Anything else in it is the
 * deploy's own note and is not read.
 */
export const RELEASED_FILE = 'tools/gates/released-commit.json';

/** Where the catalogue lives, its index and its version files. */
export const CATALOGUE = 'apps/web/static/catalogue';
const INDEX = `${CATALOGUE}/index.json`;
const PACKS = `${CATALOGUE}/packs`;

/** What a released version is held to, each with the words a finding says it in. */
const HELD = [
  ['checksum', 'checksum', (v) => String(v).slice(0, 12)],
  ['bytes', 'size', (v) => `${v} bytes`],
  ['published_at', 'publish date', (v) => String(v)],
];

const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: Infinity });
  return r.status === 0 ? r.stdout : null;
};

/** An add-on is itself by its kind and its id. */
const keyOf = (e) => `${e.kind ?? 'pack'}/${e.id}`;
/** A name first, and the id only as a handle beside it. */
const nameOf = (e) => (e.title ? `${e.title} (${e.id})` : String(e.id));

/**
 * The findings for the released index `was` against the working index `now`, and what was counted: `released` versions
 * of `addons` add-ons held, and `fresh` versions that are in `now` alone.
 */
export function verdict(was, now) {
  const findings = [];
  const here = new Map((now.entries ?? []).map((e) => [keyOf(e), e]));
  let released = 0;
  let fresh = (now.entries ?? []).reduce((n, e) => n + (e.versions ?? []).length, 0);
  for (const e of was.entries ?? []) {
    const versions = e.versions ?? [];
    released += versions.length;
    const mine = here.get(keyOf(e));
    if (!mine) {
      findings.push(`  ${INDEX}  ${nameOf(e)} was removed from the catalogue, with its ${versions.length} released version(s): ${versions.map((v) => v.version).join(', ')}.`);
      continue;
    }
    for (const v of versions) {
      const found = (mine.versions ?? []).filter((x) => x.version === v.version);
      fresh -= found.length;
      if (found.length === 0) {
        findings.push(`  ${INDEX}  ${nameOf(e)} ${v.version} was removed from the catalogue. A record that installed it can no longer read it.`);
        continue;
      }
      if (found.length > 1) {
        findings.push(`  ${INDEX}  ${nameOf(e)} ${v.version} is in the catalogue ${found.length} times, and a released version is there once.`);
        continue;
      }
      const moved = HELD.filter(([field]) => found[0][field] !== v[field]).map(([field, word, say]) => `its ${word} was ${say(v[field])} and is ${say(found[0][field])}`);
      if (moved.length > 0) findings.push(`  ${INDEX}  ${nameOf(e)} ${v.version} was changed in place: ${moved.join(', ')}.`);
    }
  }
  return { findings, released, addons: (was.entries ?? []).length, fresh };
}

/** The version files changed or removed since `base`, as findings that name the add-on by the released index. */
function fileFindings(ROOT, base, was) {
  const out = git(ROOT, ['diff', '--no-renames', '--name-status', '-z', base, '--', PACKS]);
  if (out === null) return null;
  const titles = new Map((was.entries ?? []).map((e) => [e.id, e]));
  const f = out.split('\0').filter(Boolean);
  const findings = [];
  /* `-z` prints a status and then its path, each ended by a NUL, so the list is read a pair at a time. */
  while (f.length > 1) {
    const [status, rel] = [f.shift(), f.shift()];
    if (status === 'A') continue;
    const [, id, version] = /\/packs\/([^/]+)\/(\d+\.\d+\.\d+)\./u.exec(rel) ?? [null, rel.slice(PACKS.length + 1).split('/')[0], ''];
    const who = `${nameOf(titles.get(id) ?? { id })}${version ? ` ${version}` : ''}`;
    findings.push(`  ${rel}  ${who}: this file was ${status === 'D' ? 'removed' : 'changed in place'}. It is part of a released version.`);
  }
  return findings;
}

const parse = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && Array.isArray(v.entries) ? v : null;
  } catch {
    return null;
  }
};

const isCommit = (root, name) => git(root, ['rev-parse', '--verify', '-q', `${name}^{commit}`]) !== null;
const within = (root, older, newer) => git(root, ['merge-base', '--is-ancestor', older, newer]) !== null;
const shallowNote = (root) => (git(root, ['rev-parse', '--is-shallow-repository'])?.trim() === 'true' ? ' (this checkout is shallow: fetch the whole history, fetch-depth 0)' : '');

/**
 * The released commit of the repository at `root` and where it was read: `{ commit, from }` with `from` the file's
 * path or `'constant'`, or `{ error }` when the file is there and cannot be trusted. Exported so a test asks the gate
 * what it reads, and holds no second copy of the rule.
 */
export function releasedCommit(root) {
  const file = join(root, RELEASED_FILE);
  if (!existsSync(file)) return { commit: RELEASED, from: 'constant' };
  let commit = null;
  try {
    commit = JSON.parse(readFileSync(file, 'utf8'))?.commit;
  } catch {
    /* A file that does not parse is the same finding as one with no commit in it. */
  }
  if (typeof commit !== 'string' || !/^[0-9a-f]{8,40}$/u.test(commit)) {
    return { error: `${RELEASED_FILE} does not read as { "commit": "<8 to 40 hex digits>" }` };
  }
  if (!isCommit(root, commit)) return { error: `${RELEASED_FILE} names commit ${commit}, and there is no such commit here${shallowNote(root)}` };
  /* THE FLOOR. A planted repository does not hold this repository's history, so there the floor has nothing to say. */
  if (isCommit(root, RELEASED) && !within(root, RELEASED, commit)) {
    return { error: `${RELEASED_FILE} names commit ${commit}, which does not hold ${RELEASED} in its history. The released commit only moves forward` };
  }
  if (!within(root, commit, 'HEAD')) {
    return { error: `${RELEASED_FILE} names commit ${commit}, which is not in the history of this checkout, so it was never released from this line` };
  }
  return { commit, from: RELEASED_FILE };
}

/** The released index and where it was read from: the base commit in a repository, `released.json` in a planted tree. */
function readReleased(ROOT, asked) {
  if (!isRepository(ROOT)) {
    const file = join(ROOT, 'released.json');
    if (!existsSync(file)) return { where: 'released.json', error: `${ROOT} is not a repository's own top and holds no released.json` };
    const was = parse(readFileSync(file, 'utf8'));
    return was ? { where: 'released.json', was, base: null } : { where: 'released.json', error: 'released.json does not read as a catalogue index' };
  }
  let base = asked?.trim();
  /* The line a pass prints says who named the commit, when it was the file and not the constant. */
  let where = base;
  if (!base) {
    const pin = releasedCommit(ROOT);
    if (pin.error) return { where: RELEASED_FILE, error: pin.error };
    base = pin.commit;
    /* The commit as the file wrote it, whole: a number to cut it at would be a number written in a gate (`ledger`). */
    where = pin.from === 'constant' ? base : `${base} (from ${pin.from})`;
  }
  if (!isCommit(ROOT, base)) return { where, error: `there is no commit ${base} here${shallowNote(ROOT)}` };
  const text = git(ROOT, ['show', `${base}:${INDEX}`]);
  if (text === null) return { where, error: `commit ${base} holds no ${INDEX}` };
  const was = parse(text);
  return was ? { where, was, base } : { where, error: `${INDEX} at ${base} does not read as a catalogue index` };
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing here happens on
 * import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function catalogueImmutable(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
  asked = process.env.BRAINDOG_CATALOGUE_BASE,
) {
  const ROOT = resolve(root);
  const { where, was, base, error } = readReleased(ROOT, asked);
  if (error) {
    console.error(`  catalogue-immutable: could not read the released catalogue: ${error}. Nothing was checked.`);
    return 1;
  }
  let now = null;
  try {
    now = parse(readFileSync(join(ROOT, INDEX), 'utf8'));
  } catch {
    /* A missing index is the same finding as one that does not parse. */
  }
  if (now === null) {
    console.error(`  ${INDEX}  index.json does not read as a catalogue index, so no released version could be found in it.`);
    console.error('\n  catalogue-immutable: 1 finding(s).');
    return 1;
  }
  const { findings, released, addons, fresh } = verdict(was, now);
  /* A GATE THAT READ NOTHING HAS NOT PASSED: a released catalogue with no version in it is the wrong base. */
  if (released === 0) {
    console.error(`  catalogue-immutable: the catalogue at ${where} holds no version, so nothing was checked.`);
    return 1;
  }
  if (base !== null) {
    const files = fileFindings(ROOT, base, was);
    if (files === null) {
      console.error(`  catalogue-immutable: git diff ${base} failed under ${PACKS}, so no version file was checked.`);
      return 1;
    }
    findings.push(...files);
  }

  const read = `${released} released version(s) of ${addons} add-on(s) against ${where}, ${fresh} new version(s) beside them`;
  if (findings.length === 0) {
    console.log(`  catalogue-immutable: ${read}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  catalogue-immutable: ${read}, ${findings.length} finding(s).\n` +
      '  A published version never changes (packs/README.md): a record that installed it is held to its checksum.\n' +
      '  Put the released version back as it was, and cut a new version beside it.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = catalogueImmutable(process.argv[2], process.argv[3]) ?? 0;
