/**
 * `braindog hook tool`, Claude Code's PreToolUse (agents and MCP plan §2.4, §10.6 and 8; W2-D): while he has stopped or
 * paused the run, every tool but BrainDog's own is denied with his line as the reason, a subagent's calls too; a
 * redirect is one denial carrying the new instruction, to the lead only; and every way the file can be missing, old or
 * wrong lets the call go on, because a broken bridge must never lock a session. The record still refuses a stopped
 * run's writes whatever this hook does.
 *
 * THE OUTPUT IS THE SHAPE CLAUDE CODE 2.1.304'S OWN SCHEMA TAKES for PreToolUse: `hookSpecificOutput` with
 * `hookEventName: "PreToolUse"`, `permissionDecision: "deny"` and `permissionDecisionReason`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { flagsPath, inboxPath, NO_STATE, ONLY_BRAINDOG, readState, runHook, stillAllowed, statePath, toolFor, toldOf, writeInbox, type HookEvent, type Inbox } from '../src/inbox-file.ts';
import { readFileSync } from 'node:fs';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-hook-tool-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const envFor = () => ({ XDG_CONFIG_HOME: join(scratch, `config${String(n++)}`) });

const STOP_LINE = 'Mara stopped this run in BrainDog (IN7): "Wait for me". Reply with instructions, then end.';
const fresh = (more: Partial<Inbox> = {}): Inbox => ({
  v: 1,
  host: 'https://brain.dog/acme',
  run: 'S883',
  stamp: 'v41',
  at: new Date().toISOString(),
  pending: [],
  stop: { kind: 'stop', id: 'IN7', said: 'Wait for me' },
  stop_line: STOP_LINE,
  hooks: true,
  reported: [],
  ...more,
});
const call = (tool: string, more: Partial<HookEvent> = {}): HookEvent => ({ session: 's1', tool, server: undefined, agent: null, continued: false, ...more });
const event = (tool: string, more: Record<string, unknown> = {}) => JSON.stringify({ session_id: 's1', cwd: '/w', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: {}, tool_use_id: 'toolu_1', ...more });

type Deny = { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } };

test('A STOP DENIES EVERY TOOL BUT BRAINDOG\'S, with his line and what still works', () => {
  for (const tool of ['Bash', 'Edit', 'Write', 'Agent', 'mcp__figma__use_figma', 'mcp__braindog_fake__x', 'WebFetch']) {
    const out = toolFor(fresh(), NO_STATE, call(tool));
    assert.ok(out !== null, `${tool} ran while stopped`);
    assert.equal(out.reason, `${STOP_LINE} ${ONLY_BRAINDOG}`);
  }
  for (const tool of ['mcp__braindog__instructions', 'mcp__braindog__handoff', 'mcp__plugin_braindog_braindog__log', 'ToolSearch']) assert.equal(toolFor(fresh(), NO_STATE, call(tool)), null, tool);
  assert.ok(stillAllowed('mcp__x__y', 'braindog'), 'the event naming the server');
  assert.ok(!stillAllowed('mcp__x__y', 'figma'));
});

test('A PAUSE DENIES THE SAME, and its line says to wait; a subagent is held by both', () => {
  const paused = fresh({ stop: { kind: 'pause', id: 'IN8', said: 'Hold on' }, stop_line: null, pending: [toldOf({ id: 'IN8', kind: 'pause', said: 'Hold on', line: 'Mara paused this run in BrainDog (IN8): "Hold on". Wait; reply with instructions if you must.' })!] });
  const out = toolFor(paused, NO_STATE, call('Bash'))!;
  assert.match(out.reason, /^Mara paused this run in BrainDog \(IN8\)/u, 'the record\'s own line, from the instruction');
  assert.ok(toolFor(fresh(), NO_STATE, call('Bash', { agent: 'agent-1' })) !== null, 'a helper kept working through a stop');
  /* WITH NO LINE AT ALL, ONE IS MADE FROM THE STOP. */
  assert.match(toolFor(fresh({ stop_line: null }), NO_STATE, call('Bash'))!.reason, /^He stopped this run in BrainDog \(IN7\): "Wait for me"\./u);
});

test('A REDIRECT IS ONE DENIAL WITH THE NEW INSTRUCTION, to the lead only, and never again', () => {
  const line = 'Mara said in BrainDog (IN9): "Do the docs first". Reply with instructions reply IN9 when it is done.';
  const redirected = fresh({ stop: null, stop_line: null, pending: [toldOf({ id: 'IN9', kind: 'redirect', said: 'Do the docs first', line })!] });
  assert.equal(toolFor(redirected, NO_STATE, call('Bash', { agent: 'agent-1' })), null, 'a helper was told what to do instead');
  const first = toolFor(redirected, NO_STATE, call('Bash'))!;
  assert.ok(first.reason.startsWith(line));
  assert.deepEqual([first.state.redirected, first.state.shown.IN9], [['IN9'], 'tool']);
  assert.equal(toolFor(redirected, first.state, call('Bash')), null, 'denied twice');
});

test('NOTHING HELD, THE SWITCH OFF, OR NO STOP: the call goes on', () => {
  assert.equal(toolFor(fresh({ stop: null, stop_line: null }), NO_STATE, call('Bash')), null);
  assert.equal(toolFor(fresh({ hooks: false }), NO_STATE, call('Bash')), null, 'his settings switch the stop off in hooks');
});

test('RUN WHOLE: the JSON Claude Code reads, and the call goes on for no file, a broken one, an old one, or no session', () => {
  const env = envFor();
  assert.equal(runHook('tool', event('Bash'), env), '', 'no file');
  writeInbox(inboxPath(env, 's1'), fresh());
  const said = JSON.parse(runHook('tool', event('Bash'), env)) as Deny;
  assert.deepEqual(said, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${STOP_LINE} ${ONLY_BRAINDOG}` } });
  assert.equal(runHook('tool', event('mcp__braindog__instructions'), env), '');
  assert.equal(runHook('tool', '{"tool_name":"Bash"}', env), '', 'no session');
  assert.equal(runHook('tool', 'not json', env), '');
  /* TWO MINUTES AND A SECOND OLD: the bridge is gone, so the call goes on, and the flags say so for the next one. */
  writeInbox(inboxPath(env, 's1'), fresh({ at: new Date(Date.now() - 121_000).toISOString() }));
  writeFileSync(flagsPath(env, 's1'), 'tool\n');
  assert.equal(runHook('tool', event('Bash'), env), '');
  assert.equal(readFileSync(flagsPath(env, 's1'), 'utf8').trim(), '');
  writeFileSync(inboxPath(env, 's1'), '{"v":1,');
  assert.equal(runHook('tool', event('Bash'), env), '');
  assert.deepEqual(readState(statePath(env, 's1')), NO_STATE);
});

test('THE 50 MS BUDGET: one decision, files read and written, well inside it', () => {
  const env = envFor();
  writeInbox(inboxPath(env, 's1'), fresh());
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const began = performance.now();
    runHook('tool', event('Bash'), env);
    times.push(performance.now() - began);
  }
  const sorted = times.sort((a, b) => a - b);
  process.stdout.write(`# hook tool in process: median ${sorted[10]!.toFixed(2)} ms, slowest ${sorted.at(-1)!.toFixed(2)} ms\n`);
  assert.ok(sorted[10]! < 50);
});
