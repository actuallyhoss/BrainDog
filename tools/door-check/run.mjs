#!/usr/bin/env node
/**
 * THE DOOR CHECK: a real agent app, started the way a stranger starts it, against a real record.
 *
 * WHY IT EXISTS. Ten thousand tests drove the agent door with a hand-written client, and a tool list Claude Code
 * refused passed every one of them for a week (`packages/mcp/src/rpc.ts:64-70`). A check that agrees with whoever
 * wrote it cannot see that. Each `*.check.mjs` beside this file runs one real app and says what it saw.
 *
 *   node tools/door-check/run.mjs --host https://app.brain.dog --record <slug> [--only claude-code] [--report <file>]
 *
 * THE CONTRACT A CHECK KEEPS, so a later unit adds a file and never edits this one:
 *
 *   export default async ({ host, record, home, signal }) => ({ ok, saw, app, version })
 *
 * `home` is a fresh folder made for that check alone and removed after it, so nothing on the machine running it is
 * read or touched. A check may answer an array of rows. A row with `warn: true` prints and is kept, and its failure
 * does not fail the night (an unpinned newest release). A row with `ok: null` was not run, and says why in `saw`: it
 * prints as a warning and exits 0, so a missing key reads "not run" and never green. `first`, when a row has it, is
 * the raw first event the app printed, kept in the report for a person to read once.
 *
 * ONE LINE A ROW, and `report.json` with `check`, `app`, `version`, `ok`, `saw` and `ms` a row. Exit 1 when any row
 * that is not a warning failed, or when no check was found. Plain Node and no dependency, as `tools/gates` is.
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUFFIX = '.check.mjs';
/** The longest one check may take before it is stopped and read as a failure: an install, a sign-in and a session. */
const CHECK_MS = 20 * 60_000;
/** The most of a failure's sentence a line carries. */
const SAW_MOST = 300;

const { values: args } = parseArgs({
  options: {
    host: { type: 'string', default: process.env.DOOR_HOST || 'https://app.brain.dog' },
    record: { type: 'string', default: process.env.DOOR_RECORD || '' },
    only: { type: 'string' },
    /* WHERE THE CHECKS ARE: this folder, unless a test plants its own. */
    dir: { type: 'string', default: HERE },
    /* THE REPORT LANDS OUTSIDE THE REPOSITORY unless asked, so a run on a desk leaves no file in the tree. */
    report: { type: 'string', default: join(tmpdir(), 'braindog-door-check', 'report.json') },
    keep: { type: 'boolean', default: false },
  },
});

const actions = process.env.GITHUB_ACTIONS === 'true';
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, SAW_MOST);

/**
 * NO KEY REACHES A LINE OR THE REPORT. Every value of this process's environment whose name says key, token, secret or
 * password is cut out of what is printed and written, whatever a check or an app it ran echoed back. Short values are
 * left, so a `1` or a `true` is not hunted through the report.
 */
const SECRETS = Object.entries(process.env)
  .filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(name) && typeof value === 'string' && value.length >= 8)
  .map(([, value]) => value)
  .sort((a, b) => b.length - a.length);
const withheld = (s) => SECRETS.reduce((text, secret) => text.split(secret).join('[withheld]'), String(s));

/**
 * THE KEYS GO TO PRODUCTION AND NOWHERE ELSE. A check hands the record's key to the host's `/mcp` and runs the host's
 * install script with the model's key beside it, so a run pointed at another host, or at a record by an address on
 * another host, is run with none of them: its rows read "not run", or fail where they need no key. Taken out of this
 * process's environment after `SECRETS` read them, so a value echoed back is still withheld.
 */
const PRODUCTION = 'https://app.brain.dog';
/** The old name still answers the same Worker's doors, so a key never goes there either. */
const PRODUCTION_ORIGINS = new Set([PRODUCTION, 'https://brain.dog']);
const KEYS = ['DOOR_TOKEN', 'DOOR_TOKEN_2', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'CURSOR_API_KEY'];
const originOf = (s) => {
  try {
    return new URL(s).origin;
  } catch {
    return '';
  }
};
const elsewhere = [args.host, /^https?:\/\//.test(args.record) ? args.record : PRODUCTION].map(originOf).find((o) => !PRODUCTION_ORIGINS.has(o));
if (elsewhere !== undefined) {
  for (const name of KEYS) delete process.env[name];
  console.error(`No key is handed to ${elsewhere || args.host}: only ${PRODUCTION} gets them, so this run has none.`);
}

/** Every `*.check.mjs` in the folder, by name, narrowed to `--only`. */
const dir = resolve(args.dir);
const found = readdirSync(dir)
  .filter((f) => f.endsWith(SUFFIX))
  .map((f) => ({ check: f.slice(0, -SUFFIX.length), file: join(dir, f) }))
  .sort((a, b) => a.check.localeCompare(b.check));
const checks = args.only ? found.filter((c) => c.check === args.only) : found;

if (checks.length === 0) {
  const named = found.map((c) => c.check).join(', ') || 'none';
  console.error(args.only ? `No check is called ${args.only}. The checks here are: ${named}.` : `No *${SUFFIX} file in ${dir}, so nothing was checked.`);
  process.exit(1);
}

/** A row as the report keeps it, whatever shape the check answered in. */
function rowOf(check, raw, ms) {
  const ok = raw && (raw.ok === true || raw.ok === false) ? raw.ok : raw && raw.ok === null ? null : false;
  const row = {
    check,
    app: raw && raw.app ? String(raw.app) : check,
    version: raw && raw.version ? String(raw.version) : '',
    ok,
    saw: oneLine(raw && raw.saw ? raw.saw : ok === false ? 'the check answered nothing' : ''),
    ms,
  };
  if (raw && raw.warn === true) row.warn = true;
  if (raw && raw.first !== undefined) row.first = raw.first;
  return row;
}

/** One check in a home of its own, stopped at `CHECK_MS`. A throw is a failed row carrying its sentence. */
async function runOne({ check, file }) {
  const home = mkdtempSync(join(tmpdir(), `door-${check}-`));
  const stop = new AbortController();
  const started = Date.now();
  let timer;
  try {
    const mod = await import(pathToFileURL(file).href);
    if (typeof mod.default !== 'function') throw new Error(`${check}${SUFFIX} exports no default function, so it is not a check.`);
    const late = new Promise((_, fail) => {
      timer = setTimeout(() => {
        stop.abort();
        fail(new Error(`stopped after ${CHECK_MS / 60_000} minutes`));
      }, CHECK_MS);
    });
    const answer = await Promise.race([mod.default({ host: args.host.replace(/\/+$/, ''), record: args.record, home, signal: stop.signal }), late]);
    const ms = Date.now() - started;
    /* AN EMPTY ANSWER IS A FAILURE, never a night with nothing to say and exit 0. */
    const raws = Array.isArray(answer) ? (answer.length > 0 ? answer : [undefined]) : [answer];
    return raws.map((raw) => rowOf(check, raw, ms));
  } catch (error) {
    return [rowOf(check, { ok: false, saw: error instanceof Error ? error.message : String(error) }, Date.now() - started)];
  } finally {
    clearTimeout(timer);
    if (args.keep) console.error(`${check}: its home is kept at ${home}`);
    else rmSync(home, { recursive: true, force: true });
  }
}

/** The line a person reads: a word for the outcome, never colour alone, then the app, its version and what it saw. */
function lineOf(row) {
  const who = row.version ? `${row.app} ${row.version}` : row.app;
  const mark = row.ok === null || (row.ok === false && row.warn) ? 'warn' : row.ok ? 'ok' : 'FAIL';
  const words = row.ok === null ? `${who}: not run: ${row.saw.replace(/^not run:\s*/, '')}` : `${who}: ${row.saw}`;
  if (actions && (row.ok === null || (row.ok === false && row.warn))) return `::warning title=door-check::${words}`;
  if (actions && row.ok === false) return `::error title=door-check::${words}`;
  return `${mark.padEnd(8)}${words}`;
}

const rows = [];
for (const c of checks) {
  for (const row of await runOne(c)) {
    rows.push(row);
    console.log(withheld(lineOf(row)));
  }
}

const report = resolve(args.report);
mkdirSync(dirname(report), { recursive: true });
/* Cut from the JSON as written. A key holding a quote or a backslash would be escaped there and slip by; none does. */
writeFileSync(report, `${withheld(JSON.stringify({ host: args.host, record: args.record, at: new Date().toISOString(), rows }, null, 2))}\n`);
console.error(`report: ${report}`);

process.exit(rows.some((r) => r.ok === false && !r.warn) ? 1 : 0);
