/**
 * `public-repo`: what a stranger with a fork can reach on this repository, and what an install runs, read from the files.
 *
 *   node tools/gates/public-repo.mjs [root]
 *
 * THE WORKFLOWS, because the repository is meant to be public and a fork's pull request is then code nobody here wrote,
 * running on a runner this repository set up. Each rule closes one way that code reaches something:
 *
 *   trigger     no `pull_request_target`, `workflow_run` or `issue_comment`: each runs with this repository's token and
 *               secrets on behalf of somebody who is not in it.
 *   permissions every workflow states them, none is `write-all`, and a workflow a fork can start writes nothing but
 *               code-scanning results.
 *   secrets     a workflow a fork can start names no secret and no environment.
 *   runner      `self-hosted` is named nowhere, and a workflow a fork can start reads no variable to choose its runner:
 *               a machine that keeps state between jobs is a takeover from any fork.
 *   pin         every action from outside this repository is pinned to a whole commit sha, since a tag can be moved.
 *   run         a `run` or `script` takes no `${{ }}` but `matrix` and `strategy`, which are written in the file. Anything
 *               else (a branch name, an input, a step's output) is spliced into the shell before it parses, so it goes
 *               through `env:` instead.
 *   checkout    `persist-credentials: false`, so the token is not left in `.git/config` for the next step's code.
 *
 * THE INSTALL, because a dependency's build script runs with the developer's permissions:
 *
 *   manifest    every dependency of every workspace is an exact version or `workspace:`. A range is a version nobody chose.
 *   lockfile    every package has a sha512 and comes from the registry: no tarball, no git, no other host.
 *   builds      `allowBuilds` is the three named in `pnpm-workspace.yaml`, and `minimumReleaseAge` is at least a day.
 *   runtime     a dependency that ships is on `RUNTIME`. A fifth name is a decision, not a line in a manifest (ADR-046).
 *   pnpm        `packageManager` carries its own hash.
 *   publish     a published package names this repository exactly as GitHub spells it, or provenance fails on the first publish.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filesOf, textOf } from './public-clean.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const YAML = createRequire(join(here, '..', '..', 'packages', 'declare', 'package.json'))('yaml');

const COULD_NOT_RUN = 3;
const REPOSITORY = 'https://github.com/actuallyhoss/BrainDog';

/** The triggers that run with this repository's token and secrets for somebody outside it. */
export const PRIVILEGED = ['pull_request_target', 'workflow_run', 'issue_comment', 'discussion_comment'];
/** The third-party packages that ship in something a person runs. */
export const RUNTIME = ['svelte', 'yaml', '@jitl/quickjs-ng-wasmfile-release-sync', 'quickjs-emscripten-core'];
/** The packages whose install script may run, as `pnpm-workspace.yaml` argues for each. */
export const BUILDS = ['esbuild', 'sharp', 'workerd'];
const ONE_DAY_MINUTES = 1440;

const triggersOf = (doc) => {
  const on = doc?.on;
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on;
  return on && typeof on === 'object' ? Object.keys(on) : [];
};
const jobsOf = (doc) => (doc?.jobs && typeof doc.jobs === 'object' ? doc.jobs : doc?.runs?.steps ? { composite: { steps: doc.runs.steps } } : {});
const stepsOf = (job) => (Array.isArray(job?.steps) ? job.steps : []);

/** The workflow files a fork's pull request can start: those that say `pull_request`, and any they call. */
export function forkReachable(docs) {
  const reach = new Set(Object.keys(docs).filter((rel) => triggersOf(docs[rel]).includes('pull_request')));
  for (let moved = true; moved; ) {
    moved = false;
    for (const rel of [...reach]) {
      for (const job of Object.values(jobsOf(docs[rel]))) {
        const called = typeof job?.uses === 'string' && job.uses.startsWith('./') ? job.uses.slice(2).split('@')[0] : null;
        if (called && docs[called] && !reach.has(called)) {
          reach.add(called);
          moved = true;
        }
      }
    }
  }
  return reach;
}

const writes = (permissions) => (permissions && typeof permissions === 'object' ? Object.entries(permissions).filter(([, v]) => v === 'write').map(([k]) => k) : []);
const SPLICED_OK = /^\s*(?:matrix|strategy)\.[\w.-]+\s*$/u;

/** One workflow or composite action's findings, as sentences. `fork` says whether a fork's pull request can start it. */
export function workflowFindings(rel, doc, fork) {
  const out = [];
  const say = (s) => out.push(`${rel}: ${s}`);
  const isAction = rel.includes('/actions/');

  for (const t of triggersOf(doc)) if (PRIVILEGED.includes(t)) say(`trigger ${t} runs with this repository's token and secrets for somebody outside it`);

  if (!isAction) {
    if (doc?.permissions === undefined) say('states no top-level permissions, so it gets the repository default');
    if (doc?.permissions === 'write-all') say('permissions are write-all');
  }
  for (const [name, job] of Object.entries(jobsOf(doc))) {
    if (job?.permissions === 'write-all') say(`job ${name}: permissions are write-all`);
    if (fork) {
      for (const scope of [...writes(doc?.permissions), ...writes(job?.permissions)]) {
        if (scope !== 'security-events') say(`job ${name}: a fork can start this, and it asks to write ${scope}`);
      }
      if (job?.environment !== undefined) say(`job ${name}: a fork can start this, and it names an environment`);
    }
    const runsOn = job?.['runs-on'];
    const runners = Array.isArray(runsOn) ? runsOn : runsOn === undefined ? [] : [runsOn];
    if (runners.some((r) => /self-hosted/iu.test(String(r)))) say(`job ${name}: runs on a self-hosted runner`);
    if (fork && runners.some((r) => String(r).includes('${{'))) say(`job ${name}: a fork can start this, and its runner is chosen by an expression`);

    for (const step of stepsOf(job)) {
      const uses = typeof step?.uses === 'string' ? step.uses : null;
      if (uses && !uses.startsWith('./')) {
        if (uses.startsWith('docker://') ? !/@sha256:[0-9a-f]{64}$/u.test(uses) : !/@[0-9a-f]{40}$/u.test(uses)) say(`${uses} is not pinned to a whole commit`);
      }
      if (uses && /^actions\/checkout@/u.test(uses) && step?.with?.['persist-credentials'] !== false) say(`job ${name}: checkout leaves the token in .git/config; set persist-credentials: false`);
      for (const code of [step?.run, step?.with?.script]) {
        if (typeof code !== 'string') continue;
        for (const m of code.matchAll(/\$\{\{(.*?)\}\}/gu)) if (!SPLICED_OK.test(m[1])) say(`job ${name}: \`${m[0]}\` is spliced into a script; pass it through env`);
      }
    }
  }
  if (fork && /\bsecrets\.(?!GITHUB_TOKEN\b)/u.test(JSON.stringify(doc ?? {}))) say('a fork can start this, and it names a secret');
  return out;
}

/** The findings of one `package.json`. */
export function manifestFindings(rel, manifest) {
  const out = [];
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest?.[section] ?? {})) {
      const v = String(version);
      if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(v) && !v.startsWith('workspace:')) out.push(`${rel}: ${name} is "${v}", which is a range, not a version`);
      if (section === 'dependencies' && !v.startsWith('workspace:') && !RUNTIME.includes(name)) out.push(`${rel}: ${name} would ship, and it is not on RUNTIME`);
    }
  }
  if (manifest?.private !== true && typeof manifest?.name === 'string') {
    const url = manifest?.repository?.url ?? '';
    if (url !== `git+${REPOSITORY}.git`) out.push(`${rel}: ${manifest.name} is published, and its repository is "${url}" rather than git+${REPOSITORY}.git`);
  }
  return out;
}

/** The findings of `pnpm-lock.yaml`, read as text: a lockfile is too large to be worth a second parse of its own. */
export function lockFindings(text) {
  const out = [];
  const start = text.indexOf('\npackages:\n');
  const end = text.indexOf('\nsnapshots:\n');
  if (start < 0 || end < 0) return ['pnpm-lock.yaml: no packages section to read'];
  const entries = text.slice(start, end).split(/\n(?=  \S)/u).slice(1);
  if (entries.length === 0) return ['pnpm-lock.yaml: no package in it'];
  for (const entry of entries) {
    const name = entry.trim().split('\n')[0]?.replace(/:$/u, '') ?? '?';
    if (!/integrity: sha512-/u.test(entry)) out.push(`pnpm-lock.yaml: ${name} has no sha512`);
    if (/tarball:|repo:|type: git/u.test(entry)) out.push(`pnpm-lock.yaml: ${name} does not come from the registry`);
  }
  return out;
}

/** The findings of `pnpm-workspace.yaml`. */
export function workspaceFindings(doc) {
  const out = [];
  const age = Number(doc?.minimumReleaseAge);
  if (!(age >= ONE_DAY_MINUTES)) out.push(`pnpm-workspace.yaml: minimumReleaseAge is ${String(doc?.minimumReleaseAge)}, under a day`);
  const allowed = Object.entries(doc?.allowBuilds ?? {}).filter(([, v]) => v === true).map(([k]) => k);
  for (const name of allowed) if (!BUILDS.includes(name)) out.push(`pnpm-workspace.yaml: ${name} may run a build script, and it is not one of the three this gate names`);
  return out;
}

export default function publicRepo(root = process.env.BRAINDOG_GATE_ROOT ?? join(here, '..', '..')) {
  const ROOT = resolve(root);
  const all = existsSync(ROOT) ? filesOf(ROOT) : null;
  if (all === null || all.length === 0) {
    console.log(`  public-repo: no file to read under ${ROOT}`);
    return COULD_NOT_RUN;
  }
  const flows = all.filter((rel) => /^\.github\/(?:workflows\/[^/]+|actions\/[^/]+\/action)\.ya?ml$/u.test(rel));
  const manifests = all.filter((rel) => /^(?:package\.json|(?:apps|packages|packs)\/[^/]+\/package\.json|tools\/client-checks\/package\.json)$/u.test(rel));
  if (flows.length === 0 && manifests.length === 0) {
    console.log(`  public-repo: no workflow and no manifest under ${ROOT}`);
    return COULD_NOT_RUN;
  }

  const findings = [];
  const docs = {};
  for (const rel of flows) {
    try {
      docs[rel] = YAML.parse(textOf(ROOT, rel) ?? '');
    } catch (e) {
      findings.push(`${rel}: does not parse: ${String(e?.message).split('\n')[0]}`);
    }
  }
  const fork = forkReachable(docs);
  for (const rel of Object.keys(docs)) findings.push(...workflowFindings(rel, docs[rel], fork.has(rel)));
  for (const rel of manifests) findings.push(...manifestFindings(rel, JSON.parse(textOf(ROOT, rel) ?? '{}')));

  if (all.includes('package.json') && !/\+sha512\./u.test(String(JSON.parse(textOf(ROOT, 'package.json') ?? '{}').packageManager))) findings.push('package.json: packageManager carries no sha512');
  if (all.includes('pnpm-lock.yaml')) findings.push(...lockFindings(textOf(ROOT, 'pnpm-lock.yaml') ?? ''));
  if (all.includes('pnpm-workspace.yaml')) findings.push(...workspaceFindings(YAML.parse(textOf(ROOT, 'pnpm-workspace.yaml') ?? '')));

  const where = `${String(flows.length)} workflow file(s), ${String(manifests.length)} manifest(s)`;
  if (findings.length === 0) {
    console.log(`  public-repo: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(`  ${f}`);
  console.error(`\n  public-repo: ${where}, ${String(findings.length)} finding(s).`);
  return 1;
}

if (import.meta.main) process.exitCode = publicRepo(process.argv[2]) ?? 0;
