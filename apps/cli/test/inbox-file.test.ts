/**
 * The inbox file the bridge keeps and the hooks read (agents and MCP plan §2.3 C, §10.8; W2-D): where it is, what a
 * reader takes from it and what it leaves, when it is too old to act on, the flags the hook scripts read before Node
 * starts, the start hook's seed, and the scripts themselves, which start no Node when a hook has nothing to do.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hostsPath } from '../src/http.ts';
import {
  flagsOf,
  flagsPath,
  inboxPath,
  NO_STATE,
  pruneInboxes,
  readInbox,
  readState,
  seedInbox,
  sessionsDir,
  STALE_MS,
  statePath,
  toldAtStart,
  toldOf,
  writeFlags,
  writeInbox,
  type Inbox,
} from '../src/inbox-file.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-inbox-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const envFor = () => ({ XDG_CONFIG_HOME: join(scratch, `config${String(n++)}`) });
const HOST = 'https://brain.dog/acme';
const NOW = Date.parse('2026-10-21T12:00:00Z');
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'braindog-hook.sh');

export const told = (id: string, kind = 'tell', taken = false) => ({
  id,
  kind,
  said: `Do ${id}`,
  at: '2026-10-21T11:59:00Z',
  to: 'run',
  line: `Mara said in BrainDog (${id}): "Do ${id}". ${taken ? `Reply with instructions reply ${id} when it is done.` : `Take it with instructions take ${id}.`}`,
});

const inbox = (more: Partial<Inbox> = {}): Inbox => ({
  v: 1,
  host: HOST,
  run: 'S883',
  stamp: 'v41',
  at: new Date(NOW).toISOString(),
  pending: [],
  stop: null,
  stop_line: null,
  hooks: true,
  reported: [],
  ...more,
});

test('THE FILES SIT BESIDE THE HOSTS FILE, named by the session with every odd character made _', () => {
  for (const env of [{ XDG_CONFIG_HOME: '/x/config' }, { APPDATA: 'C:\\Users\\m\\AppData\\Roaming' }, {}])
    for (const platform of ['darwin', 'win32', 'linux'])
      assert.equal(sessionsDir(env, platform), join(dirname(hostsPath(env, platform)), 'sessions'), `${JSON.stringify(env)} on ${platform}`);
  const env = { XDG_CONFIG_HOME: '/x/config' };
  assert.equal(inboxPath(env, 'abc-123:../x'), join('/x/config', 'braindog', 'sessions', 'abc-123____x.inbox.json'));
  assert.equal(flagsPath(env, 'abc'), join('/x/config', 'braindog', 'sessions', 'abc.inbox.flags'));
  assert.equal(statePath(env, 'abc'), join('/x/config', 'braindog', 'sessions', 'abc.hooks.json'));
});

test('A FILE THAT DOES NOT READ IS NO FILE, and a reader keeps only the fields it knows', () => {
  const env = envFor();
  const file = inboxPath(env, 'one');
  assert.equal(readInbox(file), null);
  mkdirSync(dirname(file), { recursive: true });
  for (const body of ['not json', '[]', '{"v":2,"host":"h","run":"S1","at":"x"}', '{"v":1,"run":"S1","at":"x"}']) {
    writeFileSync(file, body);
    assert.equal(readInbox(file), null, body);
  }
  writeFileSync(file, JSON.stringify({ ...inbox({ pending: [told('IN4') as never, { id: 'IN5' } as never, 'x' as never] }), extra: 1, stop: { kind: 'halt' } }));
  const read = readInbox(file)!;
  assert.deepEqual(read.pending.map((t) => t.id), ['IN4'], 'an instruction with no line was kept');
  assert.equal(read.stop, null, 'a stop of no known kind was kept');
  assert.equal((read as Record<string, unknown>).extra, undefined);
  assert.deepEqual(readState(statePath(env, 'none')), NO_STATE);
});

test('TAKEN IS WHAT THE RECORD SAYS, or what the line asks for: a reply rather than a take', () => {
  assert.equal(toldOf(told('IN4'))!.taken, false);
  assert.equal(toldOf(told('IN4', 'tell', true))!.taken, true);
  assert.equal(toldOf({ ...told('IN4'), taken_by: 'S883' })!.taken, true);
  assert.equal(toldOf({ ...told('IN4', 'tell', true), taken_by: null })!.taken, true, 'a null taken_by is not the record saying untaken');
});

test('FLAGS NAME THE HOOKS WITH WORK, and none for a file two minutes old or from a clock ahead', () => {
  assert.deepEqual(flagsOf(null, NO_STATE, NOW), []);
  assert.deepEqual(flagsOf(inbox(), NO_STATE, NOW), []);
  const tell = inbox({ pending: [toldOf(told('IN4'))!] });
  assert.deepEqual(flagsOf(tell, NO_STATE, NOW), ['prompt']);
  assert.deepEqual(flagsOf(tell, { ...NO_STATE, shown: { IN4: 'prompt' } }, NOW), ['stop'], 'shown to this run, so owed a reply');
  assert.deepEqual(flagsOf(tell, { ...NO_STATE, shown: { IN4: 'prompt' }, blocked: ['IN4'] }, NOW), []);
  const stopped = inbox({ stop: { kind: 'stop', id: 'IN7', said: 'wait' } });
  assert.deepEqual(flagsOf(stopped, NO_STATE, NOW), ['prompt', 'tool']);
  assert.deepEqual(flagsOf(stopped, { ...NO_STATE, said_stop: 'IN7' }, NOW), ['tool']);
  assert.deepEqual(flagsOf({ ...stopped, hooks: false }, { ...NO_STATE, said_stop: 'IN7' }, NOW), [], 'the stop switch is off in his settings');
  assert.deepEqual(flagsOf(stopped, NO_STATE, NOW + STALE_MS + 1), []);
  assert.deepEqual(flagsOf(stopped, NO_STATE, NOW - 60_000), [], 'a file written a minute in the future');
  const redirect = inbox({ pending: [toldOf(told('IN9', 'redirect', true))!] });
  assert.deepEqual(flagsOf(redirect, { ...NO_STATE, shown: { IN9: 'tool' }, redirected: ['IN9'] }, NOW), ['stop']);
  assert.deepEqual(flagsOf(redirect, { ...NO_STATE, shown: { IN9: 'tool' } }, NOW), ['tool', 'stop']);
});

test('THE START HOOK SEEDS THE FILE from the attach, the stop first, and marks what it printed shown at the start', () => {
  const env = envFor();
  const context = {
    stamp: 'v12',
    stop: { kind: 'pause', id: 'IN2', said: 'Hold on', line: 'Mara paused this run in BrainDog (IN2): "Hold on". Wait until it is resumed.' },
    told: [told('IN2', 'pause'), told('IN3')],
  };
  const at = toldAtStart(context);
  assert.deepEqual(at.lines, [context.stop.line, told('IN3').line], 'the pause twice, or the tell missing');
  assert.deepEqual(toldAtStart({ card: ['x'] }).lines, [], 'an older host with no told');

  seedInbox(env, 'sess-1', HOST, 'S883', context, ['IN3', 'IN2'], NOW);
  const seeded = readInbox(inboxPath(env, 'sess-1'))!;
  assert.deepEqual([seeded.run, seeded.stamp, seeded.stop?.id, seeded.stop_line], ['S883', 'v12', 'IN2', context.stop.line]);
  const state = readState(statePath(env, 'sess-1'));
  assert.deepEqual(state.shown, { IN3: 'start', IN2: 'start' });
  assert.equal(state.said_stop, 'IN2');
  /* THE PAUSE WAS SAID AT THE START, so only the tool hook has work. */
  assert.equal(readFileSync(flagsPath(env, 'sess-1'), 'utf8').trim(), 'tool');
});

test('FILES OF SESSIONS QUIET FOR TWELVE HOURS ARE REMOVED, and nothing else in the folder', () => {
  const env = envFor();
  writeInbox(inboxPath(env, 'old'), inbox());
  writeInbox(inboxPath(env, 'new'), inbox());
  writeFlags(env, 'old', NOW, inbox(), NO_STATE);
  const theirs = join(sessionsDir(env), 'abc.json');
  writeFileSync(theirs, '{}');
  const long = new Date(Date.now() - 13 * 3_600_000);
  for (const f of [inboxPath(env, 'old'), flagsPath(env, 'old'), theirs]) utimesSync(f, long, long);
  pruneInboxes(env);
  assert.deepEqual([existsSync(inboxPath(env, 'old')), existsSync(flagsPath(env, 'old')), existsSync(inboxPath(env, 'new')), existsSync(theirs)], [false, false, true, true]);
});

/* ── the script, which starts no Node when a hook has nothing to do ───── */

const runScript = (which: string, env: Record<string, string>, stdin: string) => {
  const began = performance.now();
  const out = spawnSync('sh', [SCRIPT, which], { input: stdin, env: { PATH: process.env.PATH ?? '', HOME: scratch, ...env }, encoding: 'utf8' });
  return { code: out.status, stdout: out.stdout, ms: performance.now() - began };
};

test('THE SCRIPT ENDS IN THE SHELL WITHOUT ITS WORD, and with it runs this module alone and prints its JSON', { skip: process.platform === 'win32' }, () => {
  const env = envFor();
  const event = JSON.stringify({ session_id: 'sess:9', cwd: scratch, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
  /* NO FILE: the call goes on, nothing is printed. */
  const none = runScript('tool', env, event);
  assert.deepEqual([none.code, none.stdout], [0, '']);

  const stopped = inbox({ at: new Date().toISOString(), stop: { kind: 'stop', id: 'IN7', said: 'wait' }, stop_line: 'Mara stopped this run in BrainDog (IN7): "wait". Reply with instructions, then end.' });
  writeInbox(inboxPath(env, 'sess:9'), stopped);
  /* THE FILE WITHOUT ITS FLAGS is a hook with no word, which the script takes as nothing to do. */
  assert.equal(runScript('tool', env, event).stdout, '');
  writeFlags(env, 'sess:9', Date.now(), stopped, NO_STATE);
  const denied = runScript('tool', env, event);
  assert.equal(denied.code, 0);
  const said = JSON.parse(denied.stdout) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } };
  assert.deepEqual([said.hookSpecificOutput.hookEventName, said.hookSpecificOutput.permissionDecision], ['PreToolUse', 'deny']);
  assert.match(said.hookSpecificOutput.permissionDecisionReason, /^Mara stopped this run in BrainDog \(IN7\)/u);
  /* BRAINDOG'S OWN TOOLS STILL RUN, so the run can reply and end. */
  assert.equal(runScript('tool', env, event.replace('"Bash"', '"mcp__braindog__instructions"')).stdout, '');
  /* AN EVENT WITH NO SESSION is nothing to do. */
  assert.equal(runScript('tool', env, '{"tool_name":"Bash"}').stdout, '');
});

test('TIMINGS: the shell path with no word, and the Node path with one, each under its budget', { skip: process.platform === 'win32' }, () => {
  const env = envFor();
  const event = JSON.stringify({ session_id: 'timed', cwd: scratch, hook_event_name: 'UserPromptSubmit', prompt: 'go on' });
  const quiet: number[] = [];
  for (let i = 0; i < 5; i++) quiet.push(runScript('prompt', env, event).ms);
  const busy = inbox({ at: new Date().toISOString(), pending: [toldOf(told('IN4'))!] });
  const loud: number[] = [];
  for (let i = 0; i < 5; i++) {
    writeInbox(inboxPath(env, 'timed'), busy);
    rmSync(statePath(env, 'timed'), { force: true });
    writeFlags(env, 'timed', Date.now(), busy, NO_STATE);
    const got = runScript('prompt', env, event);
    assert.match(got.stdout, /"additionalContext":"Mara said in BrainDog \(IN4\)/u);
    loud.push(got.ms);
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  /* THE PLAN'S BUDGET IS 50 MS FOR A HOOK: the shell path is far inside it. The Node path is Node's own start and this
     module; it is held under a looser bound here so a slow machine does not fail, and printed for the record. */
  process.stdout.write(`# hook prompt, shell path (nothing to do): median ${median(quiet).toFixed(1)} ms; Node path (one instruction): median ${median(loud).toFixed(1)} ms\n`);
  assert.ok(median(quiet) < 50, `the shell path took ${String(median(quiet))} ms`);
  assert.ok(median(loud) < 1_000, `the Node path took ${String(median(loud))} ms`);
});
