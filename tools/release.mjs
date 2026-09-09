/**
 * `pnpm release` on a developer's machine: assert, version, commit, tag, push.
 *
 *   node tools/release.mjs [--dry-run] app
 *   node tools/release.mjs [--dry-run] <package> <major|minor|patch|X.Y.Z>
 *
 * THE TAG IS THE WHOLE MECHANISM, so this script's one obligation is to produce a tag of exactly
 * the right shape and to refuse rather than produce a wrong one. Nothing here talks to GitHub, to
 * npm, or to a release page; it writes at most one line of one manifest, makes at most one commit,
 * makes one tag, and pushes. Everything downstream reacts to the tag.
 *
 * TWO GRAMMARS, BECAUSE 52 §5.6 SAYS THE APP HAS NO SEMVER.
 *
 *   v2026.09.09        the app: the browser client, the site, the hosts. `v<YYYY.MM.DD>`, and a
 *                      second cut on the same day is `v2026.09.09.2`. There is no `.1`.
 *   render-v0.1.0      `braindog-render` on npm: semver, because a dependent's build depends on it.
 *
 * The app's version is a date and a commit (`app <YYYY.MM.DD>+<sha7>`), derived at build time from
 * the tag and `HEAD`, so an app release WRITES NOTHING. There is no file to bump, and a script that
 * invented one would create the second version number 52 §5.6 exists to prevent. A package release
 * writes exactly one: the `version` of its own manifest.
 *
 * THE DATE IS UTC, and that is not a detail. `deploy.yml` step 4 takes the app tuple's date from
 * `date -u`. A tag cut from local time in the eleven hours this machine is ahead of UTC would carry
 * one date while the build carried another, and the two would disagree for a single day that nobody
 * would think to look at.
 *
 * EXIT CODES. `2` is misuse: arguments this script cannot read. `1` is a refusal: arguments it read
 * and a tree that says no. `0` is a release cut, or a dry run that would have cut one. There is no
 * `3` here: in this repository `3` is a skip, and a release has nothing to skip. It either happens
 * or it is refused with the fact that refused it.
 *
 * `--dry-run` PRINTS EVERY COMMAND AND WRITES NOTHING. Every check above runs for real, including
 * the two that reach the network, because a rehearsal that skips the checks rehearses nothing.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const refuse = (...lines) => {
  console.error('\n  ' + lines.join('\n  ') + '\n');
  process.exit(1);
};

const misuse = (...lines) => {
  console.error('\n  ' + lines.join('\n  ') + '\n');
  process.exit(2);
};

/** Read-only git. Every call that writes goes through `run` below, which `--dry-run` disarms. */
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.error) refuse(`git could not be run: ${r.error.message}`);
  return { code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const words = argv.filter((a) => a !== '--dry-run');
const unknownFlag = words.find((a) => a.startsWith('--'));
if (unknownFlag) misuse(`${unknownFlag} is not a flag this takes. The only flag is --dry-run.`);

/**
 * WHAT IS RELEASABLE IS DERIVED, NOT LISTED.
 *
 * A hard-coded `['render', 'cli']` is the same defect as a hard-coded gate list: it stops being true
 * the day somebody adds the third package, silently, and the way you find out is that `pnpm release`
 * says a name it should know is not a name. The rule this workspace already follows is the one used
 * instead: every package the workspace keeps to itself is `private: true` and scoped `@braindog/*`;
 * the packages that go on a registry are the unscoped `braindog-*` ones, and they are not private.
 * npm enforces the same rule from the other side, which is what makes it safe to lean on: `private`
 * is npm's own refusal to publish.
 *
 * So `apps/cli` becomes releasable on the day it exists with a manifest, and no line here changes.
 */
const releasable = () =>
  ['packages', 'apps'].flatMap((parent) =>
    readdirSync(join(root, parent), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, parent, d.name, 'package.json')))
      .map((d) => ({
        what: d.name,
        dir: `${parent}/${d.name}`,
        manifest: join(root, parent, d.name, 'package.json'),
        pkg: JSON.parse(readFileSync(join(root, parent, d.name, 'package.json'), 'utf8')),
      }))
      .filter((p) => !p.pkg.private),
  );

const [what, how, ...extra] = words;

if (!what) {
  const names = releasable().map((p) => p.what);
  misuse(
    'node tools/release.mjs [--dry-run] app',
    'node tools/release.mjs [--dry-run] <package> <major|minor|patch|X.Y.Z>',
    '',
    'app cuts v<YYYY.MM.DD> from today in UTC, and writes nothing: 52 §5.6, the app has no semver.',
    `a package cuts <package>-v<semver> and writes that version into its manifest.`,
    '',
    names.length === 0
      ? 'no package in this workspace is publishable today: every manifest is private.'
      : `publishable today: ${names.join(', ')}.`,
  );
}

if (extra.length > 0) misuse(`this takes at most two words, and got a third: ${extra[0]}.`);

const isApp = what === 'app';
const target = releasable().find((p) => p.what === what);

if (!isApp && !target) {
  /* A NAME THAT IS A DIRECTORY BUT NOT PUBLISHABLE GETS THE REASON, not the list. `pnpm release web`
     is a plausible thing to type, and "web is not one of: render" tells the person nothing about why
     the app they can see in `apps/` is not one of them. */
  const dir = ['packages', 'apps']
    .map((parent) => join(root, parent, String(what), 'package.json'))
    .find((m) => existsSync(m));
  if (dir) {
    const pkg = JSON.parse(readFileSync(dir, 'utf8'));
    refuse(
      `${pkg.name} is private, and a private package is one npm itself refuses to publish.`,
      'Releasable packages are the unscoped `braindog-*` ones. Everything else here is workspace-internal.',
      'If you meant the browser client, the site or a host, that line is `app`.',
    );
  }
  const names = releasable().map((p) => p.what);
  misuse(
    `${what} is not a release line in this tree.`,
    `The lines are: app${names.length ? ', ' + names.join(', ') : ''}.`,
  );
}

/* What origin already has. */

/**
 * ONE QUESTION TO THE REMOTE, ASKED BEFORE ANYTHING IS WRITTEN, and it answers three things: what
 * origin calls its default branch, where that branch is, and every tag origin already has.
 *
 * IT IS `ls-remote` AND NOT `fetch`, because `fetch` writes: it moves this clone's remote-tracking
 * refs as a side effect of a command whose purpose here is to ask a question, and a release script
 * that mutates the repository before its first check has passed is a release script you cannot dry
 * run. It is also not the remote-tracking refs themselves: `origin/master` is as old as the last
 * fetch, and "the tag does not exist" read from a stale ref is the answer that lets two machines cut
 * the same tag twice.
 *
 * A REMOTE THAT CANNOT BE REACHED IS A REFUSAL IN BOTH MODES. The last step of a real run is a push,
 * so an unreachable origin means the release cannot finish; finding that out here costs nothing, and
 * finding it out after the commit and the tag exist costs an unpick.
 */
const ls = git('ls-remote', '--symref', 'origin');
if (ls.code !== 0) {
  refuse(
    'origin could not be asked what it already has.',
    ...(ls.err || '(git said nothing)').split('\n').map((l) => '  ' + l.trim()),
    'A release ends in a push, so an origin that cannot be reached is a release that cannot be cut.',
  );
}

const remoteTags = new Set();
const remoteHeads = new Map();
let defaultBranch = '';
for (const line of ls.out.split('\n')) {
  const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/u.exec(line);
  if (symref) {
    defaultBranch = symref[1];
    continue;
  }
  const [sha, ref] = line.split('\t');
  if (!ref) continue;
  /* `^{}` is the peeled entry of an annotated tag, the commit behind the tag object. It names the
     same tag, so counting it as a second one would print a tag twice in a refusal. */
  if (ref.startsWith('refs/tags/')) remoteTags.add(ref.slice('refs/tags/'.length).replace(/\^\{\}$/u, ''));
  else if (ref.startsWith('refs/heads/')) remoteHeads.set(ref.slice('refs/heads/'.length), sha);
}
/* Every server in use answers `--symref`, but a mirror behind an old proxy may not, and a default
   branch guessed wrong would refuse every release on the branch it is supposed to release from. */
if (!defaultBranch) defaultBranch = 'master';

/* The tree says no. */

const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
if (branch === 'HEAD') {
  refuse(
    'HEAD is detached, so there is no branch this release could be said to come from.',
    `Check out ${defaultBranch} first.`,
  );
}
if (branch !== defaultBranch) {
  refuse(
    `this is branch ${branch}, and origin's default branch is ${defaultBranch}.`,
    'A release is cut from the branch that is deployed, or it is a release of something nobody runs.',
  );
}

/**
 * A RELEASE CUT FROM A DIRTY TREE IS A RELEASE NOBODY CAN REPRODUCE. The tag names a commit; the
 * thing built and shipped is the tree. Where those differ, the tag is a lie about the artefact, and
 * the difference is invisible afterwards because the uncommitted half was never anywhere.
 *
 * UNTRACKED FILES COUNT. They are not in the commit either, and the build reads the working tree:
 * a stray module under `apps/web/src` is compiled into the shell that is packed, and it is not in
 * the tag. `--porcelain` reports them as `??`, and they are named with everything else rather than
 * quietly allowed.
 */
const dirty = git('status', '--porcelain').out;
if (dirty) {
  refuse(
    'the tree is not clean, and a release cut from a dirty tree is a release nobody can reproduce.',
    ...dirty.split('\n').map((l) => '  ' + l.trim()),
    '',
    'Commit it, or stash it, then cut the release.',
  );
}

/**
 * AND THE COMMIT HAS TO BE ONE ORIGIN HAS. `git push origin <tag>` carries whatever objects the tag
 * needs, so tagging an unpushed commit succeeds and leaves a tag naming work that is on no branch:
 * the deploy that follows the branch never built it, and the next `git describe` walks into history
 * nobody reviewed. The other direction is the same accident from the other end, tagging a commit
 * that is behind what origin already serves.
 */
const head = git('rev-parse', 'HEAD').out;
const remoteHead = remoteHeads.get(defaultBranch);
if (!remoteHead) {
  refuse(`origin has no branch ${defaultBranch}, and that is where a release is cut from.`);
}
if (remoteHead !== head) {
  const known = git('cat-file', '-e', `${remoteHead}^{commit}`).code === 0;
  if (!known) {
    refuse(
      `origin/${defaultBranch} is at ${remoteHead.slice(0, 7)}, a commit this clone has never seen.`,
      'Fetch and fast-forward first. A tag cut here would name something other than what origin serves.',
    );
  }
  const ahead = Number(git('rev-list', '--count', `${remoteHead}..HEAD`).out);
  const behind = Number(git('rev-list', '--count', `HEAD..${remoteHead}`).out);
  refuse(
    ahead > 0 && behind > 0
      ? `this branch and origin/${defaultBranch} have diverged: ${ahead} here, ${behind} there.`
      : ahead > 0
        ? `${ahead} commit${ahead === 1 ? '' : 's'} here that origin/${defaultBranch} does not have.`
        : `origin/${defaultBranch} is ${behind} commit${behind === 1 ? '' : 's'} ahead of this branch.`,
    `HEAD is ${head.slice(0, 7)} and origin/${defaultBranch} is ${remoteHead.slice(0, 7)}.`,
    'Push or fast-forward first, so the tag names the commit everything else is looking at.',
  );
}

/* The version. */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/u;
/* The whole of the edit a package release makes to a manifest, as a source string because it is
   used twice: once to ask whether the manifest has exactly one of them, once to make the change. */
const VERSION_LINE = String.raw`^(\s*"version"\s*:\s*")([^"]*)(")`;
const localTags = new Set(git('tag', '--list').out.split('\n').map((s) => s.trim()).filter(Boolean));
const taken = (tag) => localTags.has(tag) || remoteTags.has(tag);

let tag;
let version;
let write = null;

if (isApp) {
  /* THE APP LINE TAKES NO VERSION, and being told one is worth refusing rather than ignoring: the
     person who typed it believes the app has a semver, and 52 §5.6 is the sentence that says it
     does not. Ignoring the argument would leave them believing it. */
  if (how) {
    refuse(
      `the app takes no version, and this was given ${how}.`,
      'The app has no semver (52 §5.6). Its version is a date and a commit, derived at build time.',
      `Today's line is v${utcToday()}.`,
    );
  }
  const today = utcToday();
  /* `.2`, `.3`, and never `.1`: the first cut of the day is bare. The loop asks both the local tags
     and origin's, so a second machine cutting the second release of the day gets `.2` and not a
     collision it discovers at push time. */
  tag = `v${today}`;
  for (let n = 2; taken(tag); n += 1) tag = `v${today}.${n}`;
  version = tag.slice(1);
} else {
  const current = target.pkg.version;
  if (!SEMVER.test(current)) {
    refuse(
      `${target.dir}/package.json says version ${current}, which is not X.Y.Z.`,
      'A bump is computed from the version that is there, so the version that is there has to be one.',
    );
  }
  /* AND THE MANIFEST HAS TO BE ONE THIS CAN REWRITE, asked here rather than at the write: a script
     that prints a plan and then discovers it cannot carry it out has told somebody a release is
     about to happen. `VERSION_LINE` is the whole edit, so whether it matches once is knowable now. */
  const hits = [...readFileSync(target.manifest, 'utf8').matchAll(new RegExp(VERSION_LINE, 'gmu'))];
  if (hits.length !== 1) {
    refuse(
      `${target.dir}/package.json has ${hits.length} "version" lines, and this rewrites exactly one.`,
      'Fix the manifest, or bump it by hand and tag it by hand.',
    );
  }
  version = nextVersion(current, how, target);
  tag = `${what}-v${version}`;
  write = { file: target.manifest, rel: `${target.dir}/package.json`, from: current, to: version };

  /**
   * THE FIVE PRECONDITIONS THE PUBLISH JOB CHECKS, CHECKED BEFORE THE TAG EXISTS.
   *
   * `tag.yml` refuses a publish whose package is private, exports TypeScript source, or has no
   * build script, and it is right to: those are all a package that resolves to nothing for everyone
   * who is not this workspace. But it refuses them after the tag has been pushed, which is the one
   * place the mistake is expensive: the tag is on origin, the release did not happen, and undoing it
   * is a force-delete of a public ref that other clones have already fetched.
   *
   * The same facts are readable here, in the tree the tag would name, before anything exists.
   */
  const exports = JSON.stringify(target.pkg.exports ?? {});
  if (exports.includes('.ts')) {
    refuse(
      `${target.pkg.name} exports TypeScript source, and a published package resolves to built ESM (31 §8).`,
      `${target.dir}/package.json: exports ${exports}`,
      'That resolves for this workspace, which strips types, and for nobody else.',
    );
  }
  if (!target.pkg.scripts?.build) {
    refuse(
      `${target.pkg.name} has no build script, and a publish must build what it ships.`,
      `${target.dir}/package.json has no scripts.build, so the publish job has nothing to run.`,
    );
  }
}

/**
 * AND THE TAG ITSELF IS NOT ALREADY THERE.
 *
 * For a package this is the ordinary way to be wrong: `pnpm release render 0.1.0` twice, or two
 * people cutting the same version from two machines. For the app it is unreachable, because the loop
 * above walks past every taken tag. It is checked for both anyway. That loop is two lines, and the
 * cost of the day somebody changes them is a tag pushed over a release that already happened.
 */
if (taken(tag)) {
  const where = [localTags.has(tag) && 'this clone', remoteTags.has(tag) && 'origin'].filter(Boolean);
  refuse(
    `${tag} already exists on ${where.join(' and ')}.`,
    isApp
      ? 'A tag is a decision made once, and this one has been made.'
      : `Pick the next version, or delete ${tag} if it was never pushed.`,
  );
}

/* The gates that run before a tag is cut. */

/**
 * 52 §2: a release "runs `graph` and `licence-closure`" before it writes the version. Both are about
 * the thing a tag makes durable rather than about this commit being green in general: `graph` is the
 * seventeen-row order and the relative import that climbs out of its own package, which pnpm
 * resolves happily inside a workspace and which breaks for the first consumer who installs the
 * tarball.
 *
 * IT IS `node tools/gates/run.mjs` AND NOT `pnpm gates`. The root script is exactly this line, and
 * `pnpm` on Windows is a `.cmd` shim that Node refuses to spawn without a shell (EINVAL, the fix for
 * CVE-2024-27980) which `run.mjs` already documents for the one gate it has to spawn that way. There
 * is no reason for this script to be the second place that knows about it.
 */
const GATES = ['graph', 'licence-closure'].filter((g) => existsSync(join(here, 'gates', `${g}.mjs`)));
const missing = ['graph', 'licence-closure'].filter((g) => !GATES.includes(g));

/* What it does. */

const quote = (a) => (/[\s"]/u.test(a) ? `"${a.replace(/"/gu, '\\"')}"` : a);

const run = (...args) => {
  console.log(`  $ ${args.map(quote).join(' ')}`);
  if (dryRun) return;
  const r = spawnSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit' });
  /* NOT `!== 0`, SPELLED OUT: in this repository exit 3 is a SKIP and not a pass, so a gate that
     could not run must stop a release rather than let one through on the strength of a prerequisite
     it never had. Everything else non-zero is the ordinary failure. */
  if (r.status === 3) {
    refuse(
      `${args.slice(0, 2).join(' ')} could not run, and a skip is not a pass.`,
      'Whatever it needs, it needs before a tag is cut from this tree.',
    );
  }
  if (r.status !== 0) refuse(`${args.map(quote).join(' ')} exited ${r.status}, so nothing was tagged.`);
};

console.log(`\n  ${tag}${isApp ? `   app ${version}+${head.slice(0, 7)}` : `   ${target.pkg.name} ${version}`}`);
console.log(`  from ${branch} at ${head.slice(0, 7)}, clean, level with origin.\n`);

for (const g of missing) {
  /* ATTRIBUTED, NEVER SILENT (33 §3). 52 §2 names two gates and this tree has one of them, so the
     release runs one gate fewer than the document says it does, and says which and why. */
  console.log(`  ${g}: 52 §2 names this gate and tools/gates/${g}.mjs does not exist. Write it, or amend 52 §2.`);
}
if (missing.length) console.log('');

for (const g of GATES) run('node', 'tools/gates/run.mjs', '--only', g);

if (write) {
  /**
   * ONE LINE OF ONE FILE, EDITED IN PLACE.
   *
   * `JSON.parse` then `JSON.stringify` would reflow the manifest: key order survives, but indent,
   * blank lines and the trailing newline do not, and `ci.yml` runs `git diff --exit-code` after a
   * build for exactly this class of accident. A release commit whose diff is the whole manifest is
   * a release commit nobody reads, and the one line that matters is the one line nobody sees.
   *
   * The replacement is asserted to have changed something, because a regex that quietly matched
   * nothing would commit an unchanged file under a message announcing a version bump, and the tag
   * would then disagree with the manifest at the exact point `tag.yml` checks that they agree.
   */
  const before = readFileSync(write.file, 'utf8');
  const after = before.replace(new RegExp(VERSION_LINE, 'mu'), `$1${write.to}$3`);
  if (after === before) refuse(`${write.rel} did not change, and a release commit of nothing is not a release.`);

  console.log(`  ~ ${write.rel}   version ${write.from} to ${write.to}`);
  if (!dryRun) writeFileSync(write.file, after);

  /* `git commit <path>` AND NOT `git commit -a`. `-a` sweeps every tracked modification, and the
     tree was clean one gate run ago rather than one instant ago: a gate that writes a log or a
     generated file would land in the release commit under a message that says it is a version bump.
     Naming the path commits that path and nothing else. */
  run('git', 'commit', write.rel, '-m', `release: ${target.pkg.name} ${version}`);
}

/* AN ANNOTATED TAG, because a lightweight one carries no message, no tagger and no date, and this
   tag is the only place the app's version tuple is written down before a build reconstructs it. */
run('git', 'tag', '-a', tag, '-m', isApp ? `app ${version}+${head.slice(0, 7)}` : `${target.pkg.name} ${version}`);

/**
 * `--atomic`, AND THE BRANCH GOES WITH THE TAG.
 *
 * 52 §2 says the release "pushes the tag", and for the app that is all there is: nothing was
 * committed, so origin already has the commit the tag names. A package release also made a commit,
 * and pushing only the tag would leave origin's default branch claiming the old version while the
 * registry holds the new one, and the next release refusing because this branch is a commit ahead.
 *
 * Atomic because the failure worth designing against is the half of it that lands: a tag that arrives
 * without its commit points origin at a version its branch has never heard of.
 */
if (write) run('git', 'push', '--atomic', 'origin', branch, tag);
else run('git', 'push', 'origin', tag);

console.log(
  dryRun
    ? `\n  --dry-run: nothing above was run, ${write ? `${write.rel} was not written, ` : ''}and ${tag} does not exist.\n`
    : `\n  ${tag} is on origin. The tag is the mechanism; nothing here waits for anything else.\n`,
);

/* The two small computations. */

/** `YYYY.MM.DD` in UTC, matching the date `deploy.yml` step 4 puts in the build tuple. */
function utcToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())}`;
}

/**
 * AN AMBIGUOUS BUMP IS REFUSED RATHER THAN GUESSED.
 *
 * `pnpm release render` with nothing after it is the shape of every accidental release: the person
 * meant one of three things and a default would pick one of them silently, on a line whose whole
 * point is that a dependent's build depends on which. 52 §2 spells the gesture `pnpm release render
 * 0.1.0`; `major`, `minor` and `patch` are accepted as well because a bump computed from the
 * manifest cannot be a typo of the version somebody meant to type.
 */
function nextVersion(current, how, target) {
  const [, major, minor, patch] = SEMVER.exec(current).map(Number);

  if (!how) {
    refuse(
      `${target.pkg.name} is at ${current}, and this was not told what the next version is.`,
      `  node tools/release.mjs ${target.what} patch     ${major}.${minor}.${patch + 1}`,
      `  node tools/release.mjs ${target.what} minor     ${major}.${minor + 1}.0`,
      `  node tools/release.mjs ${target.what} major     ${major + 1}.0.0`,
      `  node tools/release.mjs ${target.what} 1.2.3     that one`,
      '',
      'A guess here is a version a dependent resolves by accident, so there is no default.',
    );
  }

  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;

  /* The two near-misses get their own sentence, because both are things a person types on purpose
     and neither is wrong anywhere else. */
  if (/^v\d/u.test(how)) {
    refuse(`the v belongs to the tag and not to the version: write ${how.slice(1)}, and the tag becomes ${target.what}-${how}.`);
  }
  if (/^\d+\.\d+\.\d+[-+]/u.test(how)) {
    refuse(
      `${how} is a prerelease, and nothing in this repository publishes one.`,
      'A prerelease published without `npm publish --tag` becomes `latest`, which is the accident this refuses.',
    );
  }
  if (!SEMVER.test(how)) {
    refuse(`${how} is neither major, minor, patch, nor an X.Y.Z version.`);
  }

  /* A VERSION THAT DOES NOT GO FORWARD. npm refuses to republish a version it already has, and the
     tag guard catches a repeat of the last one, but neither catches 0.0.9 after 0.1.0: that one
     publishes, and it publishes as the version a caret range picks up last. */
  const [, m, n, p] = SEMVER.exec(how).map(Number);
  const forward = m > major || (m === major && (n > minor || (n === minor && p > patch)));
  if (!forward) {
    refuse(
      `${target.pkg.name} is at ${current}, and ${how} does not come after it.`,
      'A version line only goes forward. There is no way to unpublish the one that goes back.',
    );
  }
  return how;
}
