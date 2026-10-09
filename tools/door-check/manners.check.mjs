/**
 * MANNERS, ASKED OF A REAL MODEL (AGT-C01 job e, `loop/scope/area-agents-c.md`).
 *
 * Ten fresh Claude Code sessions, signed in to the record the way a stranger signs in, are each given one small task in
 * a scratch repository of their own. The prompt names the task and nothing else: what the session knows about its run,
 * it knows from the card the start hook hands it and the instructions `context` gives it. Counted, from what each
 * session did:
 *
 *   early  it said what it is doing (`handoff` with `doing`, answered without an error) before it changed a file, or,
 *          when it changed none, within its first three calls;
 *   next   it left a next step (`handoff` with `next`) after its last change to a file, before it stopped.
 *
 * A session counts when it did both. The bar is eight of ten. The row carries the number every night, passing or not,
 * and fails below the bar. It is the one check here whose answer is a model's habit and not a rule, so a night under the
 * bar is read as the words `context` gives an agent, never as a flaky test to run again.
 *
 * WHAT IT NEEDS, as the door check: `ANTHROPIC_API_KEY`, else "not run: no key for the model"; `DOOR_TOKEN` or six
 * digits a person approves, and in CI without one, "not run". No key is minted here or written down.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP,
  PIN,
  PREFIX,
  addressOf,
  cutter,
  freshWord,
  installClaude,
  installCli,
  notRun,
  readStream,
  run,
  scratchRepo,
  signIn,
} from './runs-claude-code.check.mjs';

const SESSIONS = 10;
const BAR = 8;
/** Sessions at once: ten one after another would outlast the twenty minutes `run.mjs` gives a check. */
const AT_ONCE = 5;
const SESSION_MS = 5 * 60_000;
const HANDOFF = `${PREFIX}handoff`;
/** The calls that change a file, counted when they went through. A session here is allowed no shell. */
const CHANGES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** The ten tasks, each small enough to finish in a few turns, each in the same seeded repository. */
export const TASKS = [
  'Add a function add(a, b) to math.js that returns their sum.',
  'Fix the misspelt word in README.md.',
  'Add a .gitignore that ignores node_modules.',
  'Write a function isEven(n) in a new file even.js.',
  'Rename the variable x to count in counter.js.',
  'Add a Usage section to README.md with one line in it.',
  'Create todo.md listing three small chores this repository could use.',
  'Make greet.js print "Hello, world" instead of "Hi".',
  'Add a comment at the top of math.js saying what the file holds.',
  'Make counter.js count to five instead of three.',
];

/** The files every scratch repository starts with, beside the README `scratchRepo` writes. */
const SEED = {
  'README.md': '# Scratch\n\nA folder the door check made. Recieve a task and do it.\n',
  'math.js': 'export const one = 1;\n',
  'counter.js': 'let x = 0;\nwhile (x < 3) x += 1;\nconsole.log(x);\n',
  'greet.js': 'console.log("Hi");\n',
};

/**
 * One session's manners, read off its stream (`readStream`): whether it said what it is doing early, whether it left a
 * next step before it stopped, and how many calls it made.
 */
export function mannersOf(s) {
  const calls = s?.calls ?? [];
  const told = (c, key) => c.name === HANDOFF && c.ok !== false && typeof c.input?.[key] === 'string' && c.input[key].trim() !== '';
  const changed = (c) => CHANGES.has(c.name) && c.ok !== false;
  const firstChange = calls.findIndex(changed);
  const lastChange = calls.findLastIndex(changed);
  const by = firstChange === -1 ? Math.min(3, calls.length) : firstChange;
  const early = calls.slice(0, by).some((c) => told(c, 'doing'));
  const next = calls.slice(lastChange + 1).some((c) => told(c, 'next'));
  return { early, next, calls: calls.length };
}

/** The night's row from each session's manners, `null` for a session that never started. */
export function tally(results, version = '') {
  const started = results.filter(Boolean);
  const both = started.filter((m) => m.early && m.next).length;
  const early = started.filter((m) => m.early).length;
  const next = started.filter((m) => m.next).length;
  const lost = results.length - started.length;
  const saw = [`manners: ${both} of ${results.length} said what they were doing early and left a next step, and the bar is ${BAR}`];
  saw.push(`${early} said it early, ${next} left a next step`);
  if (lost > 0) saw.push(`${lost} never started, counted as missing both`);
  return { app: APP, version, ok: both >= BAR, saw: saw.join('; ') };
}

/** Each task in turn, `AT_ONCE` at a time, answering in the tasks' order. */
async function inTurn(items, each) {
  const out = new Array(items.length);
  let at = 0;
  const lane = async () => {
    while (at < items.length) {
      const i = at++;
      out[i] = await each(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, lane));
  return out;
}

export default async function manners(ctx) {
  const cut = cutter([ctx.home]);
  try {
    return JSON.parse(cut(JSON.stringify(await night(ctx))));
  } catch (error) {
    throw new Error(cut(error instanceof Error ? error.message : error));
  }
}

async function night({ host, record, home, signal }) {
  const why = notRun({ record });
  if (why) return { app: APP, version: PIN.pinned, ok: null, saw: `${why}, for the manners count` };
  const address = addressOf(host, record);
  await installCli(host, home, signal);
  const bin = await installClaude(PIN.pinned, home, home, signal);
  const { env } = await signIn(home, address, [join(home, '.braindog', 'bin'), bin], process.env.DOOR_TOKEN, signal);
  const version = (await run(join(bin, 'claude'), ['--version'], { env, signal, ms: 30_000 })).out.trim().split(/\s+/)[0] || PIN.pinned;

  const results = await inTurn(TASKS.slice(0, SESSIONS), async (task) => {
    const folder = await seeded(join(home, 'work', freshWord()), env, signal);
    const args = ['-p', `In this repository: ${task}`, '--output-format', 'stream-json', '--verbose', '--max-turns', '15'];
    args.push('--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'mcp__braindog');
    const got = await run(join(bin, 'claude'), args, { env, cwd: folder, signal, ms: SESSION_MS });
    const s = readStream(got.out);
    return s.id ? mannersOf(s) : null;
  });
  return tally(results, version);
}

/** A scratch repository with the seed's files in its first commit. */
async function seeded(dir, env, signal) {
  const folder = await scratchRepo(dir, env, signal);
  for (const [name, text] of Object.entries(SEED)) writeFileSync(join(folder, name), text);
  const git = (...a) => run('git', a, { env: { ...env, GIT_AUTHOR_NAME: 'Door Check', GIT_AUTHOR_EMAIL: 'door@example.test', GIT_COMMITTER_NAME: 'Door Check', GIT_COMMITTER_EMAIL: 'door@example.test' }, cwd: folder, signal, ms: 30_000 });
  await git('add', '.');
  await git('commit', '-q', '-m', 'Seed');
  return folder;
}
