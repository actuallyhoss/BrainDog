/**
 * `deploy-parity` — THE ONE GATE THAT MEASURES THE LIVE HOST (52 §3, 51 §5.17, 33 §8).
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
 *   1. `/` — the prerendered shell. 51 §5.17 guarantees it is not in `run_worker_first`, so `ASSETS`
 *      serves the built bytes unchanged and a byte comparison is meaningful rather than a race.
 *   2. `/_app/version.json` — SvelteKit's build id, which changes on every build (50 §53).
 *   3. `/api/version` — whose `app` field is the `BRAINDOG_BUILD` tuple this run passed to the
 *      build (33 §407). The two hashes prove the ASSETS are current; this proves the WORKER is.
 *      They deploy as one version (51's `assets` carries `apps/web/build` into the Worker), so a
 *      disagreement between them is the deploy having half landed.
 *
 * `Cache-Control: no-cache` ON EVERY FETCH (52 §439). Without it the gate is a measurement of a
 * CDN edge rather than of the deploy, and the one time that matters is the one time it is wrong.
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const build = join(root, 'apps', 'web', 'build');

/** 52 §181: the live shell and the build id, compared as bytes rather than as text. */
const PATHS = ['/', '/_app/version.json'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** `/` on the host is `index.html` in the build; the other path is itself. */
const localOf = (path) => join(build, path === '/' ? 'index.html' : path.slice(1));

const host = process.env.DEPLOY_HOST;
const expected = process.env.BRAINDOG_BUILD;

let local;
try {
  local = new Map(PATHS.map((path) => [path, readFileSync(localOf(path))]));
} catch {
  local = null;
}

/* THE PREREQUISITES, NAMED IN THE SKIP so the sentence that arrives says what to do about it
   (52 §278, printed verbatim). `BRAINDOG_BUILD` is not in this condition: a deploy always sets it,
   and a run that has the host and the build without it should say so as a finding rather than
   disappear as a skip. */
if (!host || !local) {
  console.log(
    JSON.stringify({
      gate: 'deploy-parity',
      skip: 'needs DEPLOY_HOST and apps/web/build — run: pnpm --filter ./apps/web build',
    }),
  );
  process.exit(3);
}

const findings = [];

/** One fetch, uncached, with the budget's own ceiling rather than the runtime's default of none. */
const get = async (path) => {
  const at = `https://${host}${path}`;
  const out = await fetch(at, {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20_000),
    redirect: 'manual',
  });
  if (!out.ok) throw new Error(`${out.status} from ${at}`);
  return out;
};

for (const path of PATHS) {
  try {
    const out = await get(path);
    const live = sha256(Buffer.from(await out.arrayBuffer()));
    const built = sha256(local.get(path));
    if (live !== built) {
      findings.push(`live ${path} differs: host serves ${live.slice(0, 12)}, build is ${built.slice(0, 12)}`);
    }
  } catch (err) {
    findings.push(`live ${path} differs: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* AND THE WORKER'S OWN ANSWER. The two hashes above can both match while the code serving them is
   last week's, because assets and code are one version only if the version is the one deployed. */
try {
  const said = await (await get('/api/version')).json();
  const app = typeof said?.app === 'string' ? said.app : '';
  /* A REFUSAL IS NOT A FAILED DEPLOY, and printing it as one sends whoever is on call to the wrong
     place entirely. `/api/version` is a `READ+` route, so a host that wants a bearer answers here
     with a refusal and no build tuple at all. Read as an absent tuple, that is word for word what
     a deploy which never landed looks like, and it is the more alarming of the two readings. The
     gate cannot tell you the deploy is good in this case, and it must not imply the opposite. */
  const refused = typeof said?.refusal?.code === 'string' ? said.refusal.code : '';
  if (refused) findings.push(`live app tuple went unread: the host refused with ${refused}, so this check never got in. That is not evidence either way about the deploy`);
  else if (!expected) findings.push(`live app tuple is ${app || 'absent'}, and BRAINDOG_BUILD was not set to compare it against`);
  else if (app !== expected) findings.push(`live app tuple is ${app || 'absent'}, expected ${expected}`);
} catch (err) {
  findings.push(`live app tuple is unreadable: ${err instanceof Error ? err.message : String(err)}`);
}

for (const what of findings) console.log(`  ${what}`);
console.log(`  deploy-parity: ${host}, ${PATHS.length + 1} path(s), ${findings.length} finding(s)`);
if (findings.length > 0) process.exitCode = 1;
