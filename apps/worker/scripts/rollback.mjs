/**
 * `rollback`: what was live before a deploy, and after a red Parity or Smoke, whether putting it back is safe.
 *
 *   node apps/worker/scripts/rollback.mjs record <app-status.json> <site-status.json>
 *   node apps/worker/scripts/rollback.mjs decide
 *
 * TWO HALVES, BECAUSE THE QUESTION IS ASKED BEFORE THE DEPLOY AND ANSWERED AFTER IT. `record` runs before `wrangler
 * deploy` and writes what it learns into `$GITHUB_ENV`: the app's live version id, the site's live version id (each read
 * from `wrangler deployments status --json`, saved to a file by the step), and the sha the live Worker was built from
 * (the tail of `/.well-known/braindog-build`). Nothing after the deploy can learn them, because by then the live
 * version is the new one. `decide` runs only after a red Parity or Smoke, reads those beside the sha this job
 * deployed, and says in `$GITHUB_OUTPUT` which versions to put back; the workflow's next steps call `wrangler rollback`
 * with them. The decision is here, where a test can hold it, and the command is in the workflow, where the token is.
 *
 * A ROLLBACK IS NOT ALWAYS SAFE, AND THE CASES WHERE IT IS NOT ARE WHY THIS FILE EXISTS.
 * A kernel migration runs the first time a record opens on the new build, and the build before it refuses a record that is
 * newer than it knows, so rolling the Worker back after one shuts every record that opened in between. A Durable
 * Object class migration in `wrangler.jsonc` changes what classes exist, and an older version does not carry the new
 * one. A `DIRECTORY_VERSION` change is refused by an older Worker outright (`packages/record/src/directory.ts`), and
 * the Directory is one object for every record, so that rollback signs nobody in. In each case this holds, says why,
 * and the fix goes forward on a new branch.
 *
 * UNKNOWN IS A HOLD, NEVER A GUESS. A live build that answered no sha, a sha this clone does not hold, a version id
 * `wrangler` did not print: each means the diff that decides safety cannot be read, and a rollback over an unread
 * diff is the one case this file exists to prevent.
 *
 * THE JOB STAYS RED EITHER WAY. Both answers are a successful decision, so this exits 0; the step that failed has
 * already made the run red, and a rollback that succeeded is still a deploy that did not work.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

import { ROOT, readBuild, stripJsonc } from './provision-check.mjs';

/** The folder whose files are kernel migrations; anything changed under it is a migration shipped. */
export const MIGRATIONS_DIR = 'packages/kernel/src/migrations/';

/** The Worker's config, whose `migrations` block is the Durable Object class history. */
export const WRANGLER = 'apps/worker/wrangler.jsonc';

/** The Directory, whose `DIRECTORY_VERSION` an older Worker refuses to read past. */
export const DIRECTORY = 'packages/record/src/directory.ts';

/** How long `record` waits for the live build id before calling it unknown. */
const ASK_MS = 20_000;

/** The most `git` may print for one question here; a diff's file list and two files are far below it. */
const GIT_BYTES = 32 * 1024 * 1024;

/**
 * A Worker version id as `wrangler` prints it, and a git sha as the build tuple carries it.
 *
 * CHECKED BEFORE EITHER IS WRITTEN OR PASSED ON. A value that went into `$GITHUB_ENV` with a newline in it would set a
 * second variable, and one handed to `git` starting with `-` would be read as an option.
 */
const VERSION_ID = /^[0-9a-f][0-9a-f-]{7,63}$/i;
const SHA = /^[0-9a-f]{7,40}$/i;
const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

const known = (value, pattern) => (typeof value === 'string' && pattern.test(value) ? value : null);

/**
 * The version serving all traffic, out of what `wrangler deployments status --json` printed, or `null`.
 *
 * THE JSON IS A DEPLOYMENT: `{ id, versions: [{ version_id, percentage }], ... }`, which is what wrangler 4.129's
 * handler prints for `--json` (read in its bundle, not run). ONLY A VERSION AT 100 PERCENT COUNTS, because `wrangler
 * rollback` puts back one version, and a split deployment (a gradual rollout by hand) has no one version that was
 * "what was live". ANYTHING ELSE AROUND THE JSON IS TOLERATED, and when the object does not parse, a single
 * `version_id` in the text is taken and two are not: the shape of the output is a fact about another program, and a
 * reader that only works on the exact bytes of today would turn the next wrangler into a hold on every red deploy.
 */
export function versionOf(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let deployment = null;
  if (start !== -1 && end > start) {
    try {
      deployment = JSON.parse(text.slice(start, end + 1));
    } catch {
      deployment = null;
    }
  }
  if (deployment && Array.isArray(deployment.versions)) {
    const whole = deployment.versions.filter((v) => Number(v?.percentage) === 100).map((v) => known(v?.version_id, VERSION_ID));
    return whole.length === 1 ? whole[0] : null;
  }
  const ids = [...new Set([...text.matchAll(/"version_id"\s*:\s*"([^"\n]+)"/g)].map((m) => m[1]))];
  return ids.length === 1 ? known(ids[0], VERSION_ID) : null;
}

/**
 * The Durable Object migrations a `wrangler.jsonc` declares, as one comparable string, or `null` when it does not parse.
 *
 * READ AS JSONC, NOT AS TEXT, so the commented-out `v2` rung sitting in the file today is not a migration and a reworded
 * comment beside the block is not a change. The top level and every environment are read, because an environment may
 * carry its own list and wrangler deploys that one.
 */
export function migrationsBlock(text) {
  if (typeof text !== 'string') return null;
  let config;
  try {
    config = JSON.parse(stripJsonc(text));
  } catch {
    return null;
  }
  const envs = Object.entries(config?.env ?? {}).map(([name, block]) => [name, block?.migrations ?? null]);
  return JSON.stringify({ top: config?.migrations ?? null, env: Object.fromEntries(envs.sort(([a], [b]) => a.localeCompare(b))) });
}

/** `DIRECTORY_VERSION` as `directory.ts` exports it, or `null` when the file does not say. */
export function directoryVersion(text) {
  if (typeof text !== 'string') return null;
  const found = /export\s+const\s+DIRECTORY_VERSION\s*=\s*(\d+)/.exec(text);
  return found ? Number(found[1]) : null;
}

/**
 * What changed between the live build and this one, read from this clone, or `changed: null` when it cannot be.
 *
 * `changed` is `git diff --name-only`; `wrangler` and `directory` are each file's text at the two shas, `null` where the
 * file is absent at one. The checkout has to hold both commits, which is why `deploy.yml` checks out with the whole
 * history. A sha that is not a sha is refused before `git` sees it.
 */
export function readDiff(from, to, repo = ROOT) {
  const none = { changed: null, wrangler: [null, null], directory: [null, null] };
  if (!known(from, SHA) || !known(to, SHA)) return none;
  const say = (args) => {
    try {
      return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_BYTES });
    } catch {
      return null;
    }
  };
  const names = say(['diff', '--name-only', from, to, '--']);
  if (names === null) return none;
  const at = (sha, path) => say(['show', `${sha}:${path}`]);
  return {
    changed: names.split('\n').map((line) => line.trim()).filter((line) => line.length > 0),
    wrangler: [at(from, WRANGLER), at(to, WRANGLER)],
    directory: [at(from, DIRECTORY), at(to, DIRECTORY)],
  };
}

/**
 * The decision: which versions to put back, or why none is.
 *
 * `state` is `{ appPrevious, sitePrevious, liveSha, headSha, failedAt }`, with `failedAt` either `'parity'` or
 * `'smoke'`; `diff` is `readDiff`'s answer. The answer is `{ hold, app, site, notes }`: `hold` is the sentence saying
 * why nothing is rolled back, or `null`; `app` and `site` are the version ids to put back, or `null`; `notes` are the
 * sentences a person reads beside it.
 *
 * THE SITE ONLY AFTER A RED SMOKE. Parity runs before the site is deployed, so after a red Parity the site that is live
 * is still the one from before, and rolling it back would put back something older than what was already there.
 */
export function decide(state, diff) {
  const held = (why) => ({ hold: why, app: null, site: null, notes: [] });
  const { appPrevious, sitePrevious, liveSha, headSha, failedAt } = state ?? {};
  if (failedAt !== 'parity' && failedAt !== 'smoke')
    return held(`the step that went red is "${failedAt ?? 'unnamed'}", and only a red Parity or Smoke is one this knows how to undo`);
  if (!known(liveSha, SHA))
    return held('the build live before this deploy named no sha (its /.well-known/braindog-build had none, or it could not be reached), so what shipped since cannot be read');
  if (!known(headSha, SHA)) return held('this deploy named no sha of its own, so what shipped cannot be read');
  const changed = diff?.changed;
  if (!Array.isArray(changed))
    return held(`git diff ${liveSha} ${headSha} could not be read in this checkout, so whether a migration shipped is unknown`);

  const kernel = changed.filter((path) => path.startsWith(MIGRATIONS_DIR));
  if (kernel.length > 0)
    return held(`a kernel migration shipped (${kernel.join(', ')}): every record that opened on this build has run it, and the build before refuses a record newer than it knows`);
  if (changed.includes(WRANGLER)) {
    const [before, after] = (diff.wrangler ?? [null, null]).map(migrationsBlock);
    if (before === null || after === null) return held(`${WRANGLER} changed and could not be read at both shas, so whether its Durable Object migrations changed is unknown`);
    if (before !== after) return held(`the Durable Object migrations in ${WRANGLER} changed: the version before does not carry the classes this one declared`);
  }
  if (changed.includes(DIRECTORY)) {
    const [before, after] = (diff.directory ?? [null, null]).map(directoryVersion);
    if (before === null || after === null) return held(`${DIRECTORY} changed and its DIRECTORY_VERSION could not be read at both shas`);
    if (before !== after) return held(`DIRECTORY_VERSION moved from ${before} to ${after}: an older Worker refuses the newer Directory, and the Directory serves every record, so a rollback would sign nobody in`);
  }

  const app = known(appPrevious, VERSION_ID);
  if (!app) return held('the app version live before this deploy was not recorded, so there is nothing to put back');
  const notes = [];
  let site = null;
  if (failedAt === 'smoke') {
    site = known(sitePrevious, VERSION_ID);
    if (!site) notes.push('the site version live before this deploy was not recorded, so the site stays as deployed');
  } else {
    notes.push('Parity went red before the site was deployed, so the site live now is still the one from before');
  }
  return { hold: null, app, site, notes };
}

/**
 * The sha of the build a host serves now, from `/.well-known/braindog-build`, or `null`.
 *
 * `ask` IS `fetch` UNLESS A TEST HANDS IT SOMETHING ELSE. Every failure to learn it (no host, a refused connection, a
 * build deployed without `--var`) is `null`, which `decide` turns into a hold.
 */
export async function liveSha(host, ask = fetch) {
  if (!known(host, HOST)) return null;
  try {
    const answer = await ask(`https://${host}/.well-known/braindog-build`, {
      headers: { 'cache-control': 'no-cache' },
      redirect: 'manual',
      signal: AbortSignal.timeout(ASK_MS),
    });
    if (answer.status !== 200) return null;
    const body = await answer.json();
    return known(readBuild(body?.app).sha, SHA);
  } catch {
    return null;
  }
}

/** The facts `record` keeps, from the two status files' text and the live host. Empty where unknown. */
export async function record({ appText, siteText, host, ask = fetch }) {
  return {
    APP_PREVIOUS: versionOf(appText) ?? '',
    SITE_PREVIOUS: versionOf(siteText) ?? '',
    LIVE_SHA: (await liveSha(host, ask)) ?? '',
  };
}

const readOr = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** `KEY=value` lines onto a file GitHub reads between steps, when the job is on GitHub at all. */
const keep = (file, pairs) => {
  if (!file) return;
  appendFileSync(file, Object.entries(pairs).map(([key, value]) => `${key}=${value}\n`).join(''));
};

async function main(args) {
  const [mode, appFile, siteFile] = args;
  if (mode === 'record') {
    const facts = await record({ appText: appFile ? readOr(appFile) : null, siteText: siteFile ? readOr(siteFile) : null, host: process.env.DEPLOY_HOST });
    console.log('');
    console.log('  rollback: what is live before this deploy');
    console.log(`  app version   ${facts.APP_PREVIOUS || 'unknown'}`);
    console.log(`  site version  ${facts.SITE_PREVIOUS || 'unknown'}`);
    console.log(`  live sha      ${facts.LIVE_SHA || 'unknown'}`);
    if (!facts.APP_PREVIOUS || !facts.LIVE_SHA) console.log('  a red Parity or Smoke after this deploy will hold rather than roll back, because what it would roll back to is unknown');
    keep(process.env.GITHUB_ENV, facts);
    return 0;
  }
  if (mode === 'decide') {
    const state = {
      appPrevious: process.env.APP_PREVIOUS,
      sitePrevious: process.env.SITE_PREVIOUS,
      liveSha: process.env.LIVE_SHA,
      headSha: process.env.HEAD_SHA,
      failedAt: process.env.FAILED_AT,
    };
    const verdict = decide(state, readDiff(state.liveSha, state.headSha));
    console.log('');
    console.log(`  rollback: ${state.failedAt ?? 'a step'} went red, ${state.liveSha || 'an unknown sha'} was live, ${state.headSha || 'an unknown sha'} was deployed`);
    if (verdict.hold) {
      console.log(`  HOLD  nothing is rolled back: ${verdict.hold}.`);
      console.log('  The bad version stays live. The fix goes forward on a new branch; DEPLOYMENT.md "Rolling back" says what to check first.');
    } else {
      console.log(`  ROLL  the app goes back to ${verdict.app}${verdict.site ? `, and the site to ${verdict.site}` : ''}`);
    }
    for (const note of verdict.notes) console.log(`        ${note}`);
    keep(process.env.GITHUB_OUTPUT, { app: verdict.app ?? '', site: verdict.site ?? '' });
    return 0;
  }
  console.error('  rollback takes record <app-status.json> <site-status.json>, or decide');
  return 2;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
