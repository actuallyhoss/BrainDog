/**
 * `deploy-parity`: THE ONE GATE THAT MEASURES THE LIVE HOST (52 §3, 51 §5.17, 33 §8).
 *
 * Every other gate in this directory reads the repository. This one reads what the internet is
 * actually serving, and it exists because of a specific failure that a green pipeline cannot see:
 * `wrangler deploy` exits 0 and the host goes on serving the previous version's assets. 51 §5.17
 * records that this has happened three times. A deploy that reports success while serving stale
 * bytes is worse than a failed one, because nothing asks again.
 *
 * SO THE QUESTION IS NOT "did the command succeed" BUT "is the thing I built the thing being
 * served", and it is asked of two files and one route:
 *
 *   1. `/app/`: the app's shell. A request with no session is answered with the shell as `ASSETS`
 *      holds it, and this comparison is what holds the Worker to that.
 *   2. `/app/_app/version.json`: SvelteKit's build id, which changes on every build (50 §53).
 *   3. `/.well-known/braindog-build`, whose `app` field is the `BRAINDOG_BUILD` tuple this run
 *      passed to the deploy (33 §4). The two hashes prove the ASSETS are current; this proves the
 *      WORKER is. They deploy as one version (51's `assets` carries `apps/web/build` into the
 *      Worker), so a disagreement between them is the deploy having half landed.
 *
 *      IT WAS `/api/version`, AND THAT ROUTE COULD NOT ANSWER IT. `/api/version` is `READ+`: it is
 *      one record's own version cursor, and this gate holds no bearer, so the first production
 *      deploy that ran end to end went red here with a 401, at the step whose job is to prove the
 *      deploy landed. Neither obvious repair was honest. Making a record route public widens a
 *      boundary to answer a question that is not about records, and letting this check pass or skip
 *      on a refusal makes a check that cannot see look exactly like one that found nothing. The
 *      build id belongs to the Worker version rather than to any record, so it is now served where
 *      reading it opens nothing, and the gate reads it there.
 *
 * `Cache-Control: no-cache` ON EVERY FETCH (52 §439). Without it the gate is a measurement of a
 * CDN edge rather than of the deploy, and the one time that matters is the one time it is wrong.
 *
 * AND THAT HEADER DOES LESS THAN THE LINE ABOVE CLAIMS, which is worth knowing before trusting it.
 * `Cache-Control` sent by a client is a request directive; Cloudflare does not honour it as a purge
 * and answered `CF-Cache-Status: HIT` on both compared paths while this was being investigated. The
 * header is kept because it is correct to send and costs nothing, not because it guarantees the
 * origin. What actually defends this gate against measuring a stale edge is the settle window
 * below: an edge that is behind catches up, and one that is wrong stays wrong.
 *
 * WHAT IT DOES NOT DO: read a secret, or reach an authenticated route. 52 §650 makes that a rule
 * for the whole directory, and this is the only gate with the opportunity to break it. All three
 * paths are public.
 *
 * SKIPS RATHER THAN PASSES WITHOUT ITS PREREQUISITES, which is exit 3 and is red under CI unless
 * the job names it in `--allow-skip` (`gates.yml` does, because it never deploys; `deploy.yml` does
 * not, because there it is the point). A gate that quietly passes when it cannot run is the defect
 * `self-test` exists to catch, one level up.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE TWO PREREQUISITES, FOR THE RUNNER TO CHECK RATHER THAN THIS FILE (`52 §5.1` step 2). This is
 * the only gate that declares two, and `host` is the only prerequisite in the table that is not a
 * file on disk: nothing on a developer's machine can answer whether the internet is serving this
 * tree, which is why this gate is named in `--allow-skip` everywhere but `deploy.yml`.
 *
 * THE SKIP LINE BELOW STAYS, AND IT SAYS MORE THAN THE RUNNER'S. It names only the prerequisite
 * actually absent, because on a developer's machine the build is usually there and the variable
 * never is, and a constant sentence sent people off to rebuild what they had already built. The
 * runner's refusal names the unmet ones one line each, which is the same distinction made from the
 * other side; this file's version is what answers `node tools/gates/deploy-parity.mjs` run by hand.
 */
export const needs = ['web-build', 'host'];

/**
 * 52 §181: the live shell and the build id, compared as bytes rather than as text.
 *
 * UNDER `/app` SINCE THE APP MOVED THERE. On `brain.dog` the root is the marketing
 * site and `/_app/version.json` is the site's build id, so comparing those would measure the other Worker and pass or
 * fail for a reason that is not this deploy; on `app.brain.dog` the root becomes a 308, which `redirect: 'manual'`
 * reports as a finding. The app's own shell is `/app/` and its build id is under the same base.
 */
const PATHS = ['/app/', '/app/_app/version.json'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * THE WHOLE GATE, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * `needs` IS READ OFF THE MODULE NOW, WHICH MATTERS MORE HERE THAN ANYWHERE ELSE IN THE DIRECTORY.
 * This is the only gate that declares two prerequisites and the only one whose prerequisite is not a
 * file, and the runner reads both off this module before it calls anything: the value the gate holds
 * rather than a line read out of its text.
 *
 * THE ROOT IS AN ARGUMENT, and it defaults to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`, so the default is the
 * same answer the gate gave when it was a script.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function deployParity(root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  const build = join(root, 'apps', 'web', 'build');

  /** `/app/` on the host is `app/index.html` in the build; the other path is itself. */
  const localOf = (path) => join(build, path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1));

  const host = process.env.DEPLOY_HOST;
  const expected = process.env.BRAINDOG_BUILD;

  let local;
  try {
    local = new Map(PATHS.map((path) => [path, readFileSync(localOf(path))]));
  } catch {
    local = null;
  }

  /* THE PREREQUISITES, NAMED IN THE SKIP so the sentence that arrives says what to do about it
     (52 §4). `BRAINDOG_BUILD` is not in this condition: a deploy always sets it, and a run that has
     the host and the build without it should say so as a finding rather than disappear as a skip.

     ONLY THE ONES ACTUALLY ABSENT ARE NAMED. The line was a constant reading 'needs DEPLOY_HOST and
     apps/web/build', and on a developer's machine the build is usually there and the variable never
     is: the sentence sent a person off to rebuild what they had already built, to fix something else.
     A skip is worth printing only if the next thing the reader does is the thing that removes it. */
  const want = [];
  if (!host) want.push('DEPLOY_HOST to name the host to compare against');
  if (!local) want.push('a local build, from `pnpm --filter @braindog/web build`');
  if (want.length > 0) {
    console.log(`  deploy-parity: nothing was compared, because this needs ${want.join(' and ')}.`);
    return 3;
  }

  /**
   * A HOST ON THIS MACHINE MAY BE NAMED WITH ITS SCHEME, which is how `self-test` plants one (PRF-B02 job 6):
   * `negative/deploy-parity/` is served on a loopback port that names another build, and this gate must go red on it.
   * A bare name is `https://` as it always was. Plain `http://` is taken only for loopback, because a deploy compared
   * over plain http is a comparison anybody on the path could answer.
   */
  const named = URL.parse(/^https?:\/\//u.test(host) ? host : `https://${host}`);
  if (named === null) {
    console.log(`  deploy-parity: DEPLOY_HOST is ${JSON.stringify(host)}, which is not a host name.`);
    return 1;
  }
  const onThisMachine = ['localhost', '127.0.0.1', '[::1]'].includes(named.hostname);
  if (named.protocol === 'http:' && !onThisMachine) {
    console.log(`  deploy-parity: DEPLOY_HOST names ${named.origin}, plain http to a host that is not this machine. Name it without the scheme.`);
    return 1;
  }
  const origin = named.origin;

  /** One fetch, uncached, with the budget's own ceiling rather than the runtime's default of none. */
  const fetchOnce = (path) =>
    fetch(`${origin}${path}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'manual',
    });

  /** The two byte comparisons want the body or nothing, so anything but a 2xx is the finding itself. */
  const get = async (path) => {
    const out = await fetchOnce(path);
    if (!out.ok) throw new Error(`${out.status} from ${origin}${path}`);
    return out;
  };

  const BUILD = '/.well-known/braindog-build';

  /** Everything this gate asks the host, once. Returns the findings of that single look. */
  const look = async () => {
    const seen = [];

    for (const path of PATHS) {
      try {
        const out = await get(path);
        const live = sha256(Buffer.from(await out.arrayBuffer()));
        const built = sha256(local.get(path));
        if (live !== built) {
          seen.push(`live ${path} differs: host serves ${live.slice(0, 12)}, build is ${built.slice(0, 12)}`);
        }
      } catch (err) {
        seen.push(`live ${path} differs: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    /* AND THE WORKER'S OWN ANSWER. The two hashes above can both match while the code serving them is
       last week's, because assets and code are one version only if the version is the one deployed. */
    try {
      /* WHATEVER COMES BACK IS READ, INCLUDING A REFUSAL, which is why this one does not go through
         `get`. A host still serving the version before this route existed answers the router's 404
         here, and the code in that body is a far more useful sentence than the status alone. */
      const out = await fetchOnce(BUILD);
      const said = await out.json();
      const app = typeof said?.app === 'string' ? said.app : '';
      /* A REFUSAL IS NOT A FAILED DEPLOY, and printing it as one sends whoever is on call to the wrong
         place entirely. Read as an absent tuple, a refusal is word for word what a deploy which never
         landed looks like, and it is the more alarming of the two readings. The gate cannot tell you
         the deploy is good in this case, and it must not imply the opposite. This path takes no
         credential, so the refusal to expect here is a host whose version predates the route rather
         than one asking for a bearer, and the two are told apart by the code the host itself names. */
      const refused = typeof said?.refusal?.code === 'string' ? said.refusal.code : '';
      if (refused) seen.push(`live app tuple went unread: the host refused ${BUILD} with ${refused}, so this check never got in. That is not evidence either way about the deploy`);
      else if (!out.ok) seen.push(`live app tuple is unreadable: ${out.status} from ${origin}${BUILD}`);
      else if (!expected) seen.push(`live app tuple is ${app || 'absent'}, and BRAINDOG_BUILD was not set to compare it against`);
      else if (app !== expected) seen.push(`live app tuple is ${app || 'absent'}, expected ${expected}`);
    } catch (err) {
      seen.push(`live app tuple is unreadable: ${err instanceof Error ? err.message : String(err)}`);
    }

    return seen;
  };

  /* THE SETTLE WINDOW, AND WHY ASKING ONCE WAS WRONG.
     `wrangler deploy` returning is not the host being consistent. The deploy of `c96a962` uploaded
     correctly and this gate, asking one second later, was handed the previous version's bytes and
     called a good deploy broken. Both paths matched the build exactly when asked again a few minutes
     afterwards, so the first failure this gate ever reported against production was its own timing.

     A HOST THAT HAS NOT PROPAGATED YET AND A HOST SERVING STALE BYTES FOREVER ARE THE SAME PICTURE AT
     ONE SECOND. Only the second is the failure this gate was written to catch, and the only thing that
     tells them apart is elapsed time. So the gate asks until the answer settles or the window closes.
     It still goes red if the host never catches up, which is the entire point of it, and a deploy that
     needed the wait says so in its output rather than passing silently, because a host that takes a
     minute to serve what it was given is worth knowing about even when it gets there.

     A HOST ON THIS MACHINE HAS NO EDGE TO CATCH UP, so it is asked once: what it serves first is all it will serve,
     and two minutes of asking would only make the planted host in `self-test` slow. */
  const WINDOW_MS = onThisMachine ? 0 : 120_000;
  const GAP_MS = 10_000;

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  const startedAt = Date.now();
  let findings = await look();
  let settled = 0;

  while (findings.length > 0 && Date.now() - startedAt + GAP_MS < WINDOW_MS) {
    await sleep(GAP_MS);
    findings = await look();
    settled = Math.round((Date.now() - startedAt) / 1000);
  }

  for (const what of findings) console.log(`  ${what}`);

  if (findings.length > 0) {
    if (WINDOW_MS > 0) console.log(`  none of this settled in the ${Math.round(WINDOW_MS / 1000)}s allowed, so it is the deploy rather than propagation`);
  } else if (settled > 0) {
    console.log(`  the host needed ${settled}s to serve what it was given, which is slow but correct`);
  }

  console.log(`  deploy-parity: ${host}, ${PATHS.length + 1} path(s), ${findings.length} finding(s)`);
  if (findings.length > 0) return 1;
}

/* AND IT IS STILL A SCRIPT, because the header documents `node tools/gates/deploy-parity.mjs` and
   `deploy.yml` is entitled to run the file directly. `?? 0` because a pass returns nothing. `BRAINDOG_GATE_ROOT` is
   the root `self-test` points it at, the planted tree's own build, and unset it is this file's two directories up. */
if (import.meta.main) process.exitCode = (await deployParity(process.env.BRAINDOG_GATE_ROOT || undefined)) ?? 0;
