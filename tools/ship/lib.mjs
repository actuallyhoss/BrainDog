/**
 * What `ci.mjs` and `deploy.mjs` share: a reader for the workflow files, the few GitHub expressions they use, and a
 * runner for one step's shell on this machine.
 *
 * THE WORKFLOWS ARE READ AS LINES AT THE INDENTS THEY ARE WRITTEN IN, as `apps/worker/scripts/ci-workflow.test.mjs`
 * reads them: no YAML parser is a dependency of this workspace. A job sits at two spaces under `jobs:`, its keys at
 * four, its steps at six (`- `), a step's keys at eight and their children (an `env:` map, a `run: |` block) at ten.
 * A shape this reader does not know is an error naming the file and line, never a step quietly left out.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Everything the two commands write: logs, scratch, the pass marker. Ignored by git (`/.ship/` in `.gitignore`). */
export const SHIP = join(ROOT, '.ship');
export const MARKER = join(SHIP, 'pass.json');

const unquote = (value) => {
  const v = value.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1).replace(/''/g, "'");
  return v;
};
const indentOf = (line) => line.length - line.trimStart().length;
const isComment = (line) => /^\s*#/.test(line);

/** A block of `KEY: value` lines at `indent`, as an object. */
function readMap(lines, at, indent, where) {
  const map = {};
  let i = at;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || isComment(line)) continue;
    if (indentOf(line) < indent) break;
    const m = new RegExp(`^ {${indent}}([\\w-]+):\\s*(.*)$`).exec(line);
    if (!m) throw new Error(`${where}:${i + 1}: a map entry this reader cannot read: ${line.trim()}`);
    if (m[2].trim() === '|') {
      const [text, next] = readBlock(lines, i + 1, indent + 2);
      map[m[1]] = text;
      i = next - 1;
      continue;
    }
    map[m[1]] = unquote(m[2]);
  }
  return [map, i];
}

/** A `|` block scalar whose lines sit at `indent` or deeper, as text with that indent removed. */
function readBlock(lines, at, indent) {
  const body = [];
  let i = at;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (indentOf(line) < indent) break;
    body.push(line.slice(indent));
  }
  while (body.length > 0 && body.at(-1) === '') body.pop();
  return [body.join('\n'), i];
}

/** One step, from its `- ` line. */
function readStep(lines, at, where) {
  const step = { line: at + 1, env: {}, with: {} };
  const first = lines[at].replace(/^ {6}- /, '        ');
  const work = [first, ...lines.slice(at + 1)];
  let i = 0;
  while (i < work.length) {
    const line = work[i];
    if (i > 0 && (line.trim() === '' || isComment(line))) {
      i++;
      continue;
    }
    if (i > 0 && indentOf(line) < 8) break;
    const m = /^ {8}([\w-]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${where}:${at + i + 1}: a step key this reader cannot read: ${line.trim()}`);
    const [, key, rest] = m;
    if (key === 'env' || key === 'with') {
      if (rest.trim() !== '') throw new Error(`${where}:${at + i + 1}: ${key} written inline`);
      const [map, next] = readMap(work, i + 1, 10, where);
      step[key] = map;
      i = next;
      continue;
    }
    if (rest.trim() === '|' || rest.trim() === '>-') {
      const [text, next] = readBlock(work, i + 1, 10);
      step[key] = rest.trim() === '>-' ? text.split('\n').join(' ') : text;
      i = next;
      continue;
    }
    step[key] = unquote(rest);
    i++;
  }
  step.continueOnError = step['continue-on-error'] === 'true';
  return [step, at + i];
}

/** The matrix rows of a job, from `include:` lists at ten and twelve spaces. */
function readMatrix(lines) {
  const rows = [];
  for (const line of lines) {
    if (isComment(line)) continue;
    let m = /^ {10}- ([\w-]+):\s*(.*)$/.exec(line);
    if (m) {
      rows.push({ [m[1]]: unquote(m[2]) });
      continue;
    }
    m = /^ {12}([\w-]+):\s*(.*)$/.exec(line);
    if (m && rows.length > 0) rows.at(-1)[m[1]] = unquote(m[2]);
  }
  return rows;
}

/**
 * A workflow file as `{ path, on, jobs }`. `on` is the trigger names; each job is `{ name, if, uses, timeout, matrix,
 * steps }`, where a step is `{ name, id, if, uses, run, env, with, continueOnError, line }`.
 */
export function readWorkflow(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const onAt = lines.indexOf('on:');
  const on = [];
  for (const line of lines.slice(onAt + 1)) {
    if (/^\S/.test(line)) break;
    const m = /^ {2}([\w-]+):/.exec(line);
    if (m) on.push(m[1]);
  }
  const jobsAt = lines.indexOf('jobs:');
  if (jobsAt === -1) throw new Error(`${rel} has no jobs: block`);
  const jobs = new Map();
  let i = jobsAt + 1;
  while (i < lines.length) {
    const m = /^ {2}([\w-]+):\s*$/.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const name = m[1];
    let end = i + 1;
    while (end < lines.length && !/^ {2}[\w-]+:\s*$/.test(lines[end]) && !/^\S/.test(lines[end])) end++;
    const body = lines.slice(i + 1, end);
    const job = { name, if: null, uses: null, timeout: null, matrix: readMatrix(body), steps: [] };
    for (let j = 0; j < body.length; j++) {
      const line = body[j];
      if (isComment(line)) continue;
      const k = /^ {4}([\w-]+):\s*(.*)$/.exec(line);
      if (!k) continue;
      if (k[1] === 'if') job.if = k[2].trim() === '>-' ? readBlock(body, j + 1, 6)[0].split('\n').join(' ') : unquote(k[2]);
      if (k[1] === 'uses') job.uses = unquote(k[2]);
      if (k[1] === 'timeout-minutes') job.timeout = Number(k[2]);
      if (k[1] === 'steps') {
        let s = j + 1;
        while (s < body.length) {
          if (/^ {6}- /.test(body[s])) {
            const [step, next] = readStep(body, s, `${rel} (job ${name})`);
            step.line += i + 1;
            job.steps.push(step);
            s = next;
          } else if (body[s].trim() === '' || isComment(body[s])) s++;
          else break;
        }
      }
    }
    jobs.set(name, job);
    i = end;
  }
  return { path: rel, on, jobs };
}

/** The `run:` lines of the composite setup action, which every job starts with. */
export function setupRuns() {
  const text = readFileSync(join(ROOT, '.github/actions/setup/action.yml'), 'utf8');
  return [...text.matchAll(/^\s+- run: (.+)$/gm)].map((m) => m[1].trim());
}

/* ── EXPRESSIONS ────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A GitHub expression (`${{ ... }}` or an `if:`) evaluated against `lookup(path)`, which answers a dotted name such as
 * `vars.DEPLOY_HOST` or `steps.parity.outcome`, or throws for a name it does not know. The grammar is what the
 * workflows here use: quoted strings, dotted names, `== != && || !`, brackets, and the status functions. A value never
 * reaches the code as text: each is handed in as a JSON literal.
 */
export function evaluate(expr, lookup, status = { failed: false }) {
  const tokens = [];
  const re = /\s*(?:('(?:[^']|'')*')|(==|!=|&&|\|\||!|\(|\))|(always|failure|success|cancelled)\(\)|([A-Za-z_][\w-]*(?:\.[\w*-]+)*)|(\d+))/y;
  let at = 0;
  const src = expr.trim();
  while (at < src.length) {
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m || m.index !== at) throw new Error(`an expression this runner cannot read: ${expr}`);
    at = re.lastIndex;
    if (m[1] !== undefined) tokens.push(JSON.stringify(m[1].slice(1, -1).replace(/''/g, "'")));
    else if (m[2] !== undefined) tokens.push(m[2] === '==' ? '===' : m[2] === '!=' ? '!==' : m[2]);
    else if (m[3] !== undefined)
      tokens.push(String(m[3] === 'always' ? true : m[3] === 'failure' ? status.failed : m[3] === 'success' ? !status.failed : false));
    else if (m[4] !== undefined) {
      if (m[4] === 'true' || m[4] === 'false') tokens.push(m[4]);
      else tokens.push(JSON.stringify(lookup(m[4])));
    } else tokens.push(m[5]);
  }
  return Function(`"use strict"; return (${tokens.join(' ')});`)();
}

/** Whether a step's `if:` lets it run. No status function means `success() && (...)`, as GitHub reads it. */
export function shouldRun(cond, lookup, status) {
  if (!cond) return !status.failed;
  const body = cond.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const withStatus = /\b(always|failure|success|cancelled)\(\)/.test(body) ? body : `success() && (${body})`;
  return Boolean(evaluate(withStatus, lookup, status));
}

/** Every `${{ ... }}` in a string replaced by its value. */
export function expand(text, lookup, status) {
  return String(text).replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, inner) => {
    const v = evaluate(inner, lookup, status);
    return v === undefined || v === null || v === false ? '' : String(v);
  });
}

/* ── RUNNING ────────────────────────────────────────────────────────────────────────────────────────────────────── */

export const git = (...args) => {
  const r = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');

export const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

export const short = (text, n = 90) => {
  const one = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).join(' ; ');
  return one.length > n ? `${one.slice(0, n - 1)}...` : one;
};

/**
 * A step's environment: this process's less the names in `drop`, then `extra` (which may set a dropped name again,
 * as a step's own `env:` does), with node 24 first on PATH and `CI` set as a runner sets it.
 */
export function baseEnv(extra = {}, drop = []) {
  const env = { ...process.env };
  for (const name of drop) delete env[name];
  Object.assign(env, { CI: 'true' }, extra);
  env.PATH = `${dirname(process.execPath)}:${env.PATH ?? ''}`;
  return env;
}

/**
 * One step's shell, run as a runner runs a `shell: bash` step (`bash --noprofile --norc -eo pipefail <file>`), in its
 * own process group so a ceiling can stop all of it. Output goes to `log`, and to this terminal when `echo` is set,
 * with every value in `hide` replaced line by line before either sees it.
 */
/* Steps may run side by side, so each has its own script file and `runShell.current` stops all that are running. */
let stepNo = 0;
const live = new Set();
export function runShell(script, { env, log, echo = false, quiet = null, timeoutMs = 45 * 60_000, hide = [], tmp, nice = false }) {
  mkdirSync(tmp, { recursive: true });
  mkdirSync(dirname(log), { recursive: true });
  const file = join(tmp, `step-${process.pid}-${Date.now()}-${++stepNo}.sh`);
  writeFileSync(file, `${script}\n`);
  const out = createWriteStream(log, { flags: 'a' });
  const secrets = hide.filter((s) => typeof s === 'string' && s.length >= 6);
  const scrub = (line) => secrets.reduce((acc, s) => acc.split(s).join('***'), line);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const shell = ['--noprofile', '--norc', '-eo', 'pipefail', file];
    /* `nice` lowers the whole group's priority, so a step that is timed keeps the cores when the rest compete for them. */
    const child = spawn(nice ? 'nice' : 'bash', nice ? ['-n', '10', 'bash', ...shell] : shell, { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, timeoutMs);
    const pipe = (stream) => {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        rest += chunk;
        const lines = rest.split('\n');
        rest = lines.pop();
        for (const l of lines) {
          const clean = `${scrub(l)}\n`;
          out.write(clean);
          if (echo && !(quiet && quiet.test(l))) process.stdout.write(`    ${clean}`);
        }
      });
      stream.on('end', () => {
        if (rest) {
          const clean = `${scrub(rest)}\n`;
          out.write(clean);
          if (echo) process.stdout.write(`    ${clean}`);
        }
      });
    };
    pipe(child.stdout);
    pipe(child.stderr);
    const stop = () => {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    };
    live.add(stop);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      live.delete(stop);
      if (timedOut) out.write(`\nstopped at its ceiling of ${Math.round(timeoutMs / 60_000)} minutes\n`);
      out.end(() => resolve({ status: timedOut ? 124 : (code ?? (signal ? 128 : 1)), ms: Date.now() - t0, timedOut }));
    });
  });
}
Object.defineProperty(runShell, 'current', { get: () => (live.size > 0 ? () => live.forEach((stop) => stop()) : null) });
