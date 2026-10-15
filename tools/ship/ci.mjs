#!/usr/bin/env node
/**
 * CI on this machine: what `ci.yml` (test, gates, build), `gates.yml` and `selfhost.yml` run on a runner, run here.
 *
 *   node tools/ship/ci.mjs                       everything, then a pass marker for HEAD when all of it is green
 *   node tools/ship/ci.mjs --quick               typechecks, the touched workspaces' tests, the gates that need no build
 *   node tools/ship/ci.mjs --allow clean-room    a red gate named here is reported as excused, not hidden
 *
 * THE COMMANDS ARE READ OUT OF THE WORKFLOW FILES, NOT COPIED HERE. Each `run:` of those jobs is run as written, in the
 * order the file writes it, with `$FILTERS` and the matrix filled in for each leg of `test`. What a runner does that
 * this machine cannot (Windows, the outbound block, artifact and cache plumbing) is printed as not run, with why.
 *
 * THE GATES RUN ONE AT A TIME BY NAME, from the runner's own list (`run.mjs --list`), so each has its own line, its own
 * log and its own verdict, and `--allow` can name one. Together they are `gates.yml`'s full run, which is every gate
 * `ci.yml` splits between `--unbuilt` and `--built`, with the `--allow-skip` that run carries.
 *
 * NOTHING STOPS THE RUN. Every step runs, then the summary names every red. Exit 1 on any red that `--allow` did not
 * name. A full run with nothing red, on a clean tree whose HEAD did not move, writes `.ship/pass.json` naming that HEAD,
 * which `deploy.mjs` asks for. `--quick` never writes one.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { MARKER, ROOT, SHIP, baseEnv, evaluate, git, readWorkflow, runShell, secs, setupRuns, short, stamp } from './lib.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('node tools/ship/ci.mjs [--quick] [--list] [--allow <gate>[,<gate>]]...');
  process.exit(0);
}
const QUICK = argv.includes('--quick');
/* `--list` prints the plan and runs nothing. */
const LIST = argv.includes('--list');
const allowed = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--allow') {
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) {
      console.error('--allow takes a gate name, or several joined by commas.');
      process.exit(2);
    }
    allowed.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
    i++;
  } else if (argv[i] !== '--quick' && argv[i] !== '--list') {
    console.error(`ci.mjs takes --quick and --allow <gate>, and not ${argv[i]}.`);
    process.exit(2);
  }
}

const RUN_ID = `ci-${QUICK ? 'quick-' : ''}${stamp()}`;
const LOGS = join(SHIP, 'logs', RUN_ID);
const TMP = join(SHIP, 'tmp', RUN_ID);

const HEAD = git('rev-parse', 'HEAD').out;
const dirtyAtStart = git('status', '--porcelain').out;
const diffAtStart = git('diff').out;

/* ── THE PLAN ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/** `{ title, script, env, timeoutMin, gate? , fail? }` in run order, and what is not run with why. */
const plan = [];
const notRun = [];
const seen = new Set();
const add = (entry) => {
  const key = `${entry.script}\n${JSON.stringify(entry.env ?? {})}`;
  if (entry.script && seen.has(key)) return;
  if (entry.script) seen.add(key);
  plan.push(entry);
};
const literalEnv = (step, where) => {
  for (const [k, v] of Object.entries(step.env)) if (v.includes('${{')) throw new Error(`${where}: ${k} is an expression this runner does not fill: ${v}`);
  return step.env;
};
const isGateRun = (run) => /tools\/gates\/run\.mjs|^pnpm gates\b/m.test(run ?? '');

const ci = readWorkflow('.github/workflows/ci.yml');
const gatesWf = readWorkflow('.github/workflows/gates.yml');
const selfhost = readWorkflow('.github/workflows/selfhost.yml');

/* The setup action's install, once, as every job starts with it. Not in `--quick`, which runs on the tree as it is. */
if (!QUICK) for (const run of setupRuns()) add({ title: `setup: ${run}`, script: run, timeoutMin: 15 });

/* What `--quick` counts as touched: every file that differs from origin/master, committed or not, and every new file. */
const touched = QUICK
  ? [...new Set([...git('diff', '--name-only', 'origin/master').out.split('\n'), ...git('ls-files', '--others', '--exclude-standard').out.split('\n')])].filter(Boolean)
  : [];
const touches = (dir) => touched.some((f) => f === dir || f.startsWith(`${dir}/`));

/* ci.yml `test`: one leg at a time, each over its folders, a folder glob in a leg expanded as the runner's shell expands it. */
const testJob = ci.jobs.get('test');
for (const leg of testJob.matrix) {
  const dirs = leg.dirs.split(/\s+/).flatMap((d) => {
    if (!d.includes('*')) return [d.replace(/\/$/, '')];
    const parent = d.slice(0, d.indexOf('*')).replace(/\/$/, '');
    return readdirSync(join(ROOT, parent), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${parent}/${e.name}`);
  });
  const missing = dirs.filter((d) => !existsSync(join(ROOT, d, 'package.json')));
  const lookup = (path) => {
    if (path.startsWith('matrix.')) return leg[path.slice(7)] ?? '';
    throw new Error(`ci.yml test: ${path} is a name this runner does not fill`);
  };
  for (const step of testJob.steps) {
    if (step.uses) continue;
    /* "Choose this leg's workspaces" writes `$FILTERS` for the steps below; the filters are made above instead. */
    if (/FILTERS=/.test(step.run)) {
      if (missing.length > 0) add({ title: `test ${leg.leg}: choose the workspaces`, fail: `${missing.join(', ')} holds no package.json, so the ${leg.leg} leg would test nothing there` });
      continue;
    }
    if (step.if && !evaluate(step.if, lookup)) continue;
    const isTest = /run test\b/.test(step.run);
    const isDocs = /docs\/test/.test(step.run);
    let use = dirs;
    if (QUICK && isTest) use = dirs.filter(touches);
    if (QUICK && isTest && use.length === 0) continue;
    if (QUICK && isDocs && !touches('docs')) continue;
    if (QUICK && /playwright install/.test(step.run) && !dirs.some(touches)) continue;
    const filters = use.map((d) => ` --filter ./${d}`).join('');
    const script = step.run.replaceAll('$FILTERS', filters.trim());
    const title = /playwright install/.test(script) ? `setup: ${script}` : `test ${leg.leg}: ${isTest ? `tests${QUICK ? ` (${use.join(' ')})` : ''}` : /typecheck/.test(script) ? 'typecheck' : short(script)}`;
    add({ title, script, env: literalEnv(step, 'ci.yml test'), timeoutMin: testJob.timeout });
  }
}

/* ci.yml `build`, and `gates` for its one gate line. Gate lines are gathered, and run by name further down. */
const gateLines = [];
for (const name of ['gates', 'build']) {
  const job = ci.jobs.get(name);
  for (const step of job.steps) {
    if (step.uses || !step.run) continue;
    if (isGateRun(step.run)) {
      gateLines.push(`ci.yml ${name}: ${step.run}`);
      continue;
    }
    if (QUICK) {
      /* Only the build job's own test suites for a touched tool folder, and only those that read no build. */
      const tool = /^node --test (tools\/[\w-]+)\//.exec(step.run);
      if (!tool || Object.keys(step.env).length > 0 || !touches(tool[1])) continue;
    }
    const isDiff = step.run.trim() === 'git diff --exit-code';
    add({
      title: `build: ${step.name ?? short(step.run)}`,
      script: step.run,
      env: literalEnv(step, `ci.yml ${name}`),
      timeoutMin: job.timeout,
      diff: isDiff && dirtyAtStart !== '',
    });
  }
}
if (ci.jobs.get('windows')?.uses) notRun.push(['ci.yml windows', `${ci.jobs.get('windows').uses}: Windows only, and this is a Mac`]);

/* gates.yml: its build (the same two builds and diff check, so nothing new), then its full run's flags. */
let allowSkip = [];
if (!QUICK) {
  const build = gatesWf.jobs.get('gates-build');
  for (const step of build.steps) {
    if (step.uses || !step.run) continue;
    add({ title: `gates build: ${short(step.run)}`, script: step.run, env: literalEnv(step, 'gates.yml gates-build'), timeoutMin: build.timeout, diff: step.run.trim() === 'git diff --exit-code' && dirtyAtStart !== '' });
  }
  const shard = gatesWf.jobs.get('gates-shard');
  for (const step of shard.steps) {
    if (!isGateRun(step.run)) continue;
    gateLines.push(`gates.yml gates-shard (${step.if}): ${step.run}`);
    if (step.if === "github.event_name != 'push'") allowSkip = /--allow-skip (\S+)/.exec(step.run)?.[1].split(',') ?? [];
  }
  notRun.push(['gates.yml gates-shard', 'the browser cache, the artifact download and the `touch` after it: the build here is this run\'s own, so there is nothing to carry']);
  notRun.push(['gates.yml gates-shard', '--shard N/3: the parts exist to fit hosted ceilings; here every gate runs in one pass']);
}

/* The gates, one by name. Full: every gate the runner lists, as gates.yml's full run. Quick: `--unbuilt`, as ci.yml's gates job. */
const listArgs = QUICK ? ['--unbuilt', '--list'] : ['--list'];
const listed = spawnSync(process.execPath, [join(ROOT, 'tools/gates/run.mjs'), ...listArgs], { cwd: ROOT, encoding: 'utf8' });
if (listed.status !== 0) {
  console.error(`run.mjs ${listArgs.join(' ')} failed:\n${listed.stderr}`);
  process.exit(2);
}
const allGates = spawnSync(process.execPath, [join(ROOT, 'tools/gates/run.mjs'), '--list'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').map((s) => s.trim()).filter(Boolean);
const unknown = allowed.filter((g) => !allGates.includes(g));
if (unknown.length > 0) {
  console.error(`--allow names no gate: ${unknown.join(', ')}. The gates are: ${allGates.join(', ')}.`);
  process.exit(2);
}
const legTypechecks = plan.some((p) => /: typecheck$/.test(p.title));
for (const gate of listed.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
  /* In --quick the four leg typechecks above are the same command as the `typecheck` gate (`pnpm -r run typecheck`). */
  if (QUICK && gate === 'typecheck' && legTypechecks) continue;
  const skip = allowSkip.length > 0 ? ` --allow-skip ${allowSkip.join(',')}` : '';
  add({ title: `gate ${gate}`, gate, script: `node tools/gates/run.mjs --only ${gate}${skip}`, timeoutMin: gatesWf.jobs.get('gates-shard').timeout });
}

/* selfhost.yml: both jobs, with the outbound block left out, since it is iptables and `sg`, which macOS does not have. */
if (!QUICK) {
  for (const name of ['plain', 'container']) {
    const job = selfhost.jobs.get(name);
    for (const step of job.steps) {
      if (step.uses || !step.run) continue;
      if (/groupadd/.test(step.run)) {
        notRun.push([`selfhost.yml ${name}: ${step.name}`, 'iptables, groupadd and sg are Linux; the run below goes with outbound calls open']);
        continue;
      }
      let script = step.run;
      const wrapped = /^sg braindog-offline -c '([\s\S]*)'$/.exec(script.trim());
      if (wrapped) script = wrapped[1];
      script = script.replace(/ --after-install "\$RUNNER_TEMP\/offline\.sh"/g, '');
      if (script.includes('offline.sh') || script.includes('braindog-offline') && !/docker does not answer/.test(script)) throw new Error(`selfhost.yml ${name}: a step still needs the outbound block: ${step.run}`);
      add({ title: `selfhost ${name}: ${step.name ?? short(script)}${wrapped ? ' (outbound open)' : ''}`, script, env: literalEnv(step, `selfhost.yml ${name}`), timeoutMin: job.timeout });
    }
  }
}

/* ── THE RUN ────────────────────────────────────────────────────────────────────────────────────────────────────── */

if (LIST) {
  for (const [n, p] of plan.entries()) console.log(`  [${n + 1}] ${p.title}${p.script ? `\n        ${short(p.script, 140)}` : ''}`);
  for (const [what, why] of notRun) console.log(`  not run here: ${what}: ${why}`);
  process.exit(0);
}
mkdirSync(LOGS, { recursive: true });
mkdirSync(TMP, { recursive: true });
if (!QUICK) rmSync(MARKER, { force: true });
let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
  runShell.current?.();
});

const width = String(plan.length).length;
console.log(`\n  ci ${QUICK ? '--quick ' : ''}at ${HEAD.slice(0, 12)}${dirtyAtStart ? ' (the tree has changes)' : ''}: ${plan.length} steps, logs in ${relative(ROOT, LOGS)}/`);
if (QUICK) console.log(`  touched since origin/master: ${touched.length} file(s)`);
for (const line of gateLines) console.log(`  the gates, as the workflows ask them: ${line}`);
console.log(`  run here by name: ${QUICK ? 'run.mjs --unbuilt' : 'every gate run.mjs lists'}${allowSkip.length > 0 ? `, --allow-skip ${allowSkip.join(',')} as gates.yml's full run` : ''}, CI=true so any other skip is red`);
for (const [what, why] of notRun) console.log(`  ----  not run here: ${what}: ${why}`);
console.log('');

const results = [];
const t0 = Date.now();
for (const [n, entry] of plan.entries()) {
  if (interrupted) break;
  const num = String(n + 1).padStart(width, '0');
  const log = join(LOGS, `${num}-${entry.title.replace(/[^\w.-]+/g, '-').slice(0, 60)}.log`);
  let status;
  let ms = 0;
  if (entry.fail) {
    writeFileSync(log, `${entry.fail}\n`);
    status = 1;
  } else if (entry.diff) {
    /* THE TREE HAD CHANGES BEFORE THE RUN, so `git diff --exit-code` would be red on them and say nothing about the
       build. The question is the same: did the build change a tracked file? So the diff is compared with the one taken
       at the start. On a clean tree this branch is never taken, and the line runs as written. */
    const now = git('diff').out;
    writeFileSync(log, now === diffAtStart ? 'the tracked diff is the one the run started with\n' : `the build changed tracked files:\n${git('diff', '--stat').out}\n`);
    status = now === diffAtStart ? 0 : 1;
  } else {
    const r = await runShell(entry.script, { env: baseEnv({ RUNNER_TEMP: TMP, ...entry.env }), log, timeoutMs: (entry.timeoutMin ?? 45) * 60_000, tmp: TMP });
    status = r.status;
    ms = r.ms;
  }
  const red = status !== 0;
  const excused = red && entry.gate && allowed.includes(entry.gate);
  /* A gate the runner could not run and the workflow's `--allow-skip` accepts is green there too, and said as a skip. */
  const skipped = !red && entry.gate && /\b1 could not run\b/.test(readFileSync(log, 'utf8'));
  const mark = !red ? (skipped ? 'skip ok' : 'pass') : excused ? 'EXCUSED' : 'FAIL';
  results.push({ ...entry, status, ms, log, red, excused, skipped });
  console.log(`  ${mark.padEnd(7)} ${secs(ms).padStart(8)}  [${num}] ${entry.title}${entry.diff ? ' (against the diff at the start)' : ''}`);
}

/* ── THE SUMMARY ────────────────────────────────────────────────────────────────────────────────────────────────── */

const reds = results.filter((r) => r.red && !r.excused);
const excused = results.filter((r) => r.excused);
const passed = results.filter((r) => !r.red);
const skips = results.filter((r) => r.skipped);
const out = [];
out.push('');
out.push(`  ci ${QUICK ? '--quick ' : ''}at ${HEAD.slice(0, 12)}, ${secs(Date.now() - t0)}: ${results.length} of ${plan.length} steps ran, ${passed.length} passed${skips.length > 0 ? ` (${skips.length} of them a skip the workflow allows: ${skips.map((r) => r.gate).join(', ')})` : ''}, ${reds.length} failed, ${excused.length} excused.`);
if (interrupted) out.push(`  STOPPED by a hand after ${results.length} steps; the rest did not run.`);
for (const r of reds) out.push(`  FAIL     ${r.title}\n           log: ${relative(ROOT, r.log)}`);
for (const r of excused) out.push(`  EXCUSED  ${r.title} (--allow ${r.gate})\n           log: ${relative(ROOT, r.log)}`);
if (allowed.length > 0) out.push(`  --allow named: ${allowed.join(', ')}${allowed.some((g) => !excused.some((r) => r.gate === g)) ? ` (green anyway: ${allowed.filter((g) => !excused.some((r) => r.gate === g)).join(', ')})` : ''}`);
for (const [what, why] of notRun) out.push(`  not run: ${what}: ${why}`);

const cleanAtEnd = git('status', '--porcelain').out === '';
const headAtEnd = git('rev-parse', 'HEAD').out;
let marker;
if (QUICK) marker = 'not written: --quick is not the full run';
else if (interrupted) marker = 'not written: the run was stopped';
else if (reds.length > 0) marker = 'not written: there are reds';
else if (dirtyAtStart !== '') marker = 'not written: the tree had uncommitted changes when the run began';
else if (!cleanAtEnd) marker = 'not written: the tree has changes now that it did not have at the start';
else if (headAtEnd !== HEAD) marker = `not written: HEAD moved from ${HEAD.slice(0, 12)} to ${headAtEnd.slice(0, 12)} during the run`;
else {
  writeFileSync(
    MARKER,
    `${JSON.stringify({ sha: HEAD, clean: true, finished: new Date().toISOString(), steps: results.length, passed: passed.length, excused: excused.map((r) => r.gate), logs: relative(ROOT, LOGS) }, null, 2)}\n`,
  );
  marker = `written: ${relative(ROOT, MARKER)} names ${HEAD}${excused.length > 0 ? `, with ${excused.map((r) => r.gate).join(', ')} excused` : ''}`;
}
out.push(`  pass marker ${marker}`);
out.push(`  logs: ${relative(ROOT, LOGS)}/`);
out.push('');
console.log(out.join('\n'));
writeFileSync(join(LOGS, 'summary.txt'), `${results.map((r) => `${r.red ? (r.excused ? 'EXCUSED' : 'FAIL') : r.skipped ? 'skip ok' : 'pass'}\t${secs(r.ms)}\t${r.title}`).join('\n')}\n${out.join('\n')}\n`);
rmSync(TMP, { recursive: true, force: true });
process.exitCode = interrupted ? 130 : reds.length > 0 ? 1 : 0;
