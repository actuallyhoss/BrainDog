/**
 * `watch`: ask brain.dog from outside Cloudflare, once an hour, whether it is up and as it should be (LCH-C01).
 *
 *   node tools/watch/launch.mjs                      production, from apps/worker/wrangler.jsonc
 *   node tools/watch/launch.mjs --host bad.example   the same questions of another name (a forced miss)
 *
 * THE ONLY WATCHDOG BEFORE THIS RAN INSIDE CLOUDFLARE (`apps/site/src/worker.ts`), so a day with the app down at
 * Cloudflare's edge, or a night with no copy, reached him by chance. This runs on GitHub's clock (`watch.yml`), and a red
 * scheduled run is a mail from GitHub. Seven questions, one line each, and every miss printed, never the first only:
 *
 *   1. `http://<host>/` is a 301 or 308 to https on the same name.
 *   2. `/healthz` is 200 with `ok: true`.
 *   3. `/.well-known/braindog-build` names the commit of the last green `deploy` run on master. For the first hour after
 *      a deploy the commit before it passes too, and so does a deploy still running, whose Worker is live before its
 *      run is green.
 *   4. `/.well-known/security.txt` is 200 and its `Expires` is more than 30 days away. Red until LCH-C12, correctly.
 *   5. Each name of `LEGACY_HOSTS` answers at all: any status under 500.
 *   6. `/healthz`'s `night` ran: its `at` under 26 hours old and `backups_failed` 0 (`apps/worker/src/health.ts`).
 *   7. `/healthz`'s `launch.signup` is what `SIGNUP` switches it to. The Worker says `closed` with a `why` for each thing
 *      that stops a stranger signing up (`apps/worker/src/launch.ts`), so `open` in the config and `closed` here is a
 *      sign-up that is switched on and does not work, and every `why` is printed under the miss.
 *
 * THE NAMES COME FROM `apps/worker/wrangler.jsonc`, AS `smoke.mjs` READS THEM: `PUBLIC_HOST`, `LEGACY_HOSTS` and
 * `SIGNUP` are what the Worker was deployed with, so the watch asks the names the deploy claimed.
 *
 * EVERY QUESTION IS `redirect: 'manual'` AND 10 SECONDS, so a redirect is an answer to judge and a hung name is a miss
 * rather than a job that runs to GitHub's six hours. It writes nothing and sends no cookie.
 *
 * QUESTION 3 READS GITHUB WITH THE WORKFLOW'S OWN TOKEN (`GITHUB_TOKEN`, `actions: read`). Without one it cannot be
 * asked, which is a miss and says so: a watch that shrugs at a question it could not ask looks like one that found
 * nothing. The same token reads when the watch last ran, printed so a schedule GitHub skipped shows as a gap and not as
 * the product down.
 *
 * EXIT CODES: 0 when all seven answer as they should, 1 when any does not.
 */

import { readBuild, wranglerConfig } from '../../apps/worker/scripts/provision-check.mjs';

/** How long one question waits. */
export const ASK_MS = 10_000;

/** How long after a green deploy the commit before it still passes question 3. */
export const GRACE_MS = 60 * 60 * 1000;

/** How old the night may be: the cron's day and two hours, `NIGHT_FRESH_MS` in `apps/worker/src/health.ts`. */
export const NIGHT_MS = 26 * 60 * 60 * 1000;

/** How far away `security.txt`'s `Expires` must be. */
export const EXPIRES_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * What every `why` that stops a stranger signing up ends on (`stops` in `apps/worker/src/launch.ts`): a refusal for
 * everybody, or a letter that never comes. No other `why` says either; `launch.test.mjs` holds the two files together.
 */
export const STOPPING = /every sign-up is refused|finishes a sign-up/;

/** `SIGNUP` as the Worker reads it (`signupMode` in `apps/worker/src/launch.ts`): open, invite, or closed. */
const modeOf = (said) => {
  const s = String(said ?? '').trim();
  return s === 'open' || s === 'invite' ? s : 'closed';
};

/**
 * The names one environment of `apps/worker/wrangler.jsonc` is deployed with: its host, its old names and the sign-up
 * its switch sets. `host` replaces `PUBLIC_HOST` when given, for a forced miss through `workflow_dispatch`.
 */
export function namesOf(config, name = 'production', host = '') {
  const vars = config.env?.[name]?.vars ?? {};
  const own = String(host || vars.PUBLIC_HOST || '').trim().toLowerCase();
  if (!own) throw new Error(`env.${name} has no PUBLIC_HOST in apps/worker/wrangler.jsonc`);
  const legacy = String(vars.LEGACY_HOSTS ?? '').split(/[\s,]+/).map((h) => h.toLowerCase()).filter((h) => h.length > 0);
  return { host: own, legacy, signup: modeOf(vars.SIGNUP) };
}

const parse = (text) => {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return null;
  }
};

/** One question asked: `{ status, headers, text }`, or `{ error }` when nothing answered within `ms`. */
async function asked(ask, url, init = {}, ms = ASK_MS) {
  try {
    const got = await ask(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(ms), headers: { 'cache-control': 'no-cache', ...(init.headers ?? {}) } });
    return { status: got.status, headers: got.headers, text: await got.text() };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { error: timedOut ? `no answer in ${ms / 1000} seconds` : err instanceof Error ? (err.cause?.message ?? err.message) : String(err) };
  }
}

/** A run list from GitHub's API for one workflow file, with the workflow's own token, or the sentence why there is none. */
async function runsOf(ask, github, file, query, ms) {
  if (!github.token || !github.repo) return { error: 'there is no GITHUB_TOKEN and GITHUB_REPOSITORY here, so GitHub cannot be read' };
  const url = `${github.api}/repos/${github.repo}/actions/workflows/${file}/runs?${query}`;
  const a = await asked(ask, url, { headers: { authorization: `Bearer ${github.token}`, accept: 'application/vnd.github+json' } }, ms);
  if (a.error) return { error: `GitHub did not answer: ${a.error}` };
  if (a.status !== 200) return { error: `GitHub answered ${a.status} for the ${file} runs` };
  const runs = parse(a.text)?.workflow_runs;
  return { runs: Array.isArray(runs) ? runs : [] };
}

/**
 * The commits the live build may be, from `deploy`'s runs on master: the last green one; for an hour after it, the green
 * one before; and any deploy still running, whose Worker goes live before its smoke and rollback steps finish.
 */
export function allowedCommits(runs, now) {
  const at = (r) => Date.parse(r.updated_at ?? r.created_at ?? '') || 0;
  const green = runs.filter((r) => r.status === 'completed' && r.conclusion === 'success').sort((a, b) => at(b) - at(a));
  const out = [];
  if (green[0]) out.push({ sha: String(green[0].head_sha), as: 'the last green deploy' });
  if (green[0] && green[1] && now - at(green[0]) < GRACE_MS) out.push({ sha: String(green[1].head_sha), as: 'the deploy before it, in its first hour' });
  for (const r of runs) if (r.status !== 'completed') out.push({ sha: String(r.head_sha), as: 'a deploy still running' });
  return out;
}

/** When the watch ran before this run, so a schedule GitHub skipped reads as a gap and not as the product down. Never a miss. */
async function lastWatchLine(ask, github, ms, now) {
  const got = await runsOf(ask, github, 'watch.yml', 'per_page=5', ms);
  if (got.error) return `the last watch is not known: ${got.error}`;
  const before = got.runs.find((r) => String(r.id) !== String(github.runId ?? ''));
  if (!before) return 'this is the first watch';
  const minutes = Math.round((now - Date.parse(before.run_started_at ?? before.created_at ?? '')) / 60_000);
  if (!Number.isFinite(minutes)) return 'the last watch is not known: GitHub gave it no start time';
  return minutes > 120 ? `the watch before this one started ${minutes} minutes ago, a gap GitHub's schedule left, not the product` : `the watch before this one started ${minutes} minutes ago`;
}

const ageWords = (ms) => (ms < 2 * 60 * 60 * 1000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 3_600_000)} hours`);

/** Whether a `Location` is https on the same name. */
const toHttps = (location, host) => {
  try {
    const url = new URL(location, `http://${host}/`);
    return url.protocol === 'https:' && url.host === host;
  } catch {
    return false;
  }
};

/**
 * The seven questions, asked in order, each one `{ n, asks, miss, note, more }`: `miss` is `null` on the right answer
 * and otherwise the sentence saying what came back; `note` is what a right answer said; `more` is lines printed under a
 * miss. `ask` is `fetch` unless a test hands it the stub; nothing is printed here.
 */
export async function questions({ names, github = {}, ask = fetch, now = Date.now(), ms = ASK_MS }) {
  const { host, legacy, signup } = names;
  const out = [];
  const say = (n, asks, miss, note = '', more = []) => out.push({ n, asks, miss, note, more });
  const failed = (a) => (a.error ? `did not answer: ${a.error}` : null);

  const plain = await asked(ask, `http://${host}/`, {}, ms);
  const to = plain.headers?.get('location') ?? '';
  say(1, `http://${host}/ is a 301 or 308 to https`, failed(plain) ?? ((plain.status === 301 || plain.status === 308) && toHttps(to, host) ? null : `answered ${plain.status}${to ? ` to ${to}` : ''}`));

  const health = await asked(ask, `https://${host}/healthz`, {}, ms);
  const said = health.error || health.status !== 200 ? null : parse(health.text);
  say(2, `https://${host}/healthz is 200 with ok`, failed(health) ?? (said?.ok === true ? null : `answered ${health.status}${said ? ' without ok' : ''}`));

  const build = await asked(ask, `https://${host}/.well-known/braindog-build`, {}, ms);
  const live = build.error || build.status !== 200 ? null : readBuild(parse(build.text)?.app).sha?.toLowerCase();
  const deploys = await runsOf(ask, github, 'deploy.yml', 'branch=master&per_page=30', ms);
  const allowed = deploys.error ? [] : allowedCommits(deploys.runs, now);
  const hit = live ? allowed.find((c) => c.sha.toLowerCase().startsWith(live)) : undefined;
  say(
    3,
    `https://${host}/.well-known/braindog-build is the last green deploy on master`,
    failed(build) ??
      (build.status !== 200 ? `answered ${build.status}`
      : !live ? 'names no commit, so this deploy was not told which build it is'
      : deploys.error ? `the live build is ${live}, and ${deploys.error}`
      : hit ? null
      : allowed.length === 0 ? `the live build is ${live}, and deploy has no green run on master`
      : `the live build is ${live}, where the last green deploy is ${allowed[0].sha.slice(0, 7)}`),
    hit ? `${live}, ${hit.as}` : '',
  );

  const sec = await asked(ask, `https://${host}/.well-known/security.txt`, {}, ms);
  const expires = sec.status === 200 ? (/^expires:[ \t]*(.+?)\s*$/im.exec(sec.text ?? '')?.[1] ?? null) : null;
  const left = expires === null ? NaN : Date.parse(expires) - now;
  say(
    4,
    `https://${host}/.well-known/security.txt expires more than 30 days away`,
    failed(sec) ??
      (sec.status !== 200 ? `answered ${sec.status}`
      : expires === null ? 'has no Expires line'
      : !Number.isFinite(left) ? `its Expires, ${expires}, is not a date`
      : left <= EXPIRES_MS ? `it expires in ${Math.floor(left / 86_400_000)} days`
      : null),
    Number.isFinite(left) ? `${Math.floor(left / 86_400_000)} days left` : '',
  );

  if (legacy.length === 0) say(5, 'the old names answer', null, 'there are none in LEGACY_HOSTS');
  for (const name of legacy) {
    const old = await asked(ask, `https://${name}/`, {}, ms);
    say(5, `https://${name}/ answers`, failed(old) ?? (old.status < 500 ? null : `answered ${old.status}`), String(old.status ?? ''));
  }

  const night = said?.night;
  const age = night ? now - Date.parse(night.at ?? '') : NaN;
  say(
    6,
    "last night's copies were all taken, under 26 hours ago",
    !said ? '/healthz gave nothing to read'
    : night === undefined ? '/healthz carries no night, so this build is older than the watch'
    : night === null ? 'no night has been told yet, or the Directory did not answer'
    : !Number.isFinite(age) ? `the night's time, ${night.at}, is not a date`
    : age >= NIGHT_MS ? `the last night closed ${ageWords(age)} ago`
    : night.backups_failed !== 0 ? `${night.backups_failed} of last night's copies failed`
    : night.ran !== true ? `the night did not run whole, and the Directory's own copy ${night.directory === 'ok' ? 'was taken' : 'failed'}`
    : null,
    night && Number.isFinite(age) ? `${ageWords(age)} ago, ${night.records} records, ${night.backups} copies` : '',
  );

  /* NOT OPEN WHILE A WHY SAYS IT CANNOT WORK: a build from before `stops` said `open` beside "every sign-up is refused". */
  const launch = said?.launch;
  const why = Array.isArray(launch?.why) ? launch.why.map(String) : [];
  say(
    7,
    `sign-up is ${signup}, as apps/worker/wrangler.jsonc switches it`,
    !said ? '/healthz gave nothing to read'
    : !launch ? '/healthz carries no launch'
    : launch.signup !== signup ? `/healthz says sign-up is ${launch.signup}`
    : launch.signup !== 'closed' && why.some((w) => STOPPING.test(w)) ? `/healthz says sign-up is ${launch.signup}, and a reason below says nobody can finish it`
    : null,
    launch?.signup ?? '',
    why,
  );
  return out;
}

/**
 * The whole watch: the seven questions printed one line each, every miss with what came back under it, then when the
 * watch last ran. Answers the exit code, 1 on any miss.
 */
export default async function watch({ names, github = {}, ask = fetch, now = Date.now(), ms = ASK_MS, log = console.log }) {
  log('');
  log(`  watch: ${names.host}, from outside, read-only`);
  const list = await questions({ names, github, ask, now, ms });
  let missed = 0;
  for (const q of list) {
    if (q.miss) missed += 1;
    log(`  ${q.miss ? 'MISS' : 'ok  '}  ${q.n}  ${q.asks}${q.miss ? '' : q.note ? `: ${q.note}` : ''}`);
    if (q.miss) {
      log(`           ${q.miss}`);
      for (const line of q.more) log(`           why: ${line}`);
    }
  }
  log(`  ${await lastWatchLine(ask, github, ms, now)}`);
  log(`  watch: ${names.host}, ${missed} missed`);
  return missed === 0 ? 0 : 1;
}

/** A name a person typed into `workflow_dispatch`, held to a hostname so it cannot be anything else in a URL. */
export function hostInput(said) {
  const host = String(said ?? '').trim().toLowerCase();
  if (host === '') return '';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/.test(host)) throw new Error(`${JSON.stringify(said)} is not a host name`);
  return host;
}

if (import.meta.main) {
  const at = process.argv.indexOf('--host');
  try {
    const host = hostInput(at === -1 ? process.env.WATCH_HOST : process.argv[at + 1]);
    const github = {
      api: process.env.GITHUB_API_URL || 'https://api.github.com',
      repo: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      runId: process.env.GITHUB_RUN_ID,
    };
    process.exitCode = await watch({ names: namesOf(wranglerConfig(), 'production', host), github });
  } catch (err) {
    console.error(`  watch: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
