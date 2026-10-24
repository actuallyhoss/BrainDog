/**
 * `braindog hook prompt` (UserPromptSubmit) and `braindog hook stop` (Stop), and the watcher (agents and MCP plan
 * §2.3 C; W2-D): what he told the run reaches it on the next prompt, once each, the stop or pause first; a turn may not
 * end once per instruction while the run owes him a reply, never when a Stop hook already continued the turn and never
 * while he has stopped or paused it; and the watcher answers what a prompt would, for an idle session.
 *
 * THE OUTPUT IS THE SHAPE CLAUDE CODE 2.1.304'S OWN SCHEMA TAKES: `hookSpecificOutput.additionalContext` for
 * UserPromptSubmit, and `decision: "block"` with `reason` for Stop, whose input says `stop_hook_active`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inboxPath, NO_STATE, PROMPT_MOST, promptFor, readState, runHook, statePath, stopFor, toldOf, watchHook, writeInbox, type HookEvent, type Inbox, type Told } from '../src/inbox-file.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-hook-prompt-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const envFor = () => ({ XDG_CONFIG_HOME: join(scratch, `config${String(n++)}`) });

const tell = (id: string, more: Record<string, unknown> = {}): Told =>
  toldOf({ id, kind: 'tell', said: `Merge wave ${id}`, at: '2026-10-21T11:59:00Z', to: 'run', line: `Mara said in BrainDog (${id}): "Merge wave ${id}". Take it with instructions take ${id}.`, ...more })!;
const fresh = (more: Partial<Inbox> = {}): Inbox => ({
  v: 1,
  host: 'https://brain.dog/acme',
  run: 'S883',
  stamp: 'v41',
  at: new Date().toISOString(),
  pending: [],
  stop: null,
  stop_line: null,
  hooks: true,
  reported: [],
  ...more,
});
const turn = (more: Partial<HookEvent> = {}): HookEvent => ({ session: 's1', tool: '', server: undefined, agent: null, continued: false, ...more });

test('A PROMPT IS TOLD EACH NEW INSTRUCTION ONCE, in his voice, and the next prompt is told nothing again', () => {
  const inbox = fresh({ pending: [tell('IN4'), tell('IN5')] });
  const first = promptFor(inbox, NO_STATE)!;
  assert.equal(first.context, [tell('IN4').line, tell('IN5').line].join('\n'));
  assert.deepEqual(first.state.shown, { IN4: 'prompt', IN5: 'prompt' });
  assert.equal(promptFor(inbox, first.state), null);
  const later = promptFor(fresh({ pending: [tell('IN4'), tell('IN5'), tell('IN6')] }), first.state)!;
  assert.equal(later.context, tell('IN6').line);
});

test('A STOP IS SAID FIRST AND ONCE, and the stop instruction itself is not said twice', () => {
  const line = 'Mara stopped this run in BrainDog (IN7): "Wait". Reply with instructions, then end.';
  const inbox = fresh({ stop: { kind: 'stop', id: 'IN7', said: 'Wait' }, stop_line: line, pending: [toldOf({ id: 'IN7', kind: 'stop', said: 'Wait', line })!, tell('IN4')] });
  const first = promptFor(inbox, NO_STATE)!;
  assert.equal(first.context, `${line}\n${tell('IN4').line}`);
  assert.equal(first.state.said_stop, 'IN7');
  assert.equal(first.state.shown.IN7, 'prompt', 'the stop was not reported as seen');
  assert.equal(promptFor(inbox, first.state), null);
});

test('A LONG LIST IS CUT, and says how many more and where they are', () => {
  const many = Array.from({ length: 40 }, (_, i) => tell(`IN${String(100 + i)}`, { line: `Mara said in BrainDog (IN${String(100 + i)}): "${'x'.repeat(200)}". Take it.` }));
  const out = promptFor(fresh({ pending: many }), NO_STATE)!;
  assert.ok(out.context.length <= PROMPT_MOST + 80, String(out.context.length));
  assert.match(out.context, /\nAnd \d+ more from him: call instructions to read them\.$/u);
  const left = Number(/And (\d+) more/u.exec(out.context)![1]);
  assert.equal(Object.keys(out.state.shown).length, 40 - left, 'an instruction cut off was marked shown');
});

test('RUN WHOLE: the JSON for UserPromptSubmit, written once, the state kept between prompts', () => {
  const env = envFor();
  const stdin = JSON.stringify({ session_id: 's1', cwd: '/w', hook_event_name: 'UserPromptSubmit', prompt: 'carry on' });
  writeInbox(inboxPath(env, 's1'), fresh({ pending: [tell('IN4')] }));
  assert.deepEqual(JSON.parse(runHook('prompt', stdin, env)), { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: tell('IN4').line } });
  assert.equal(runHook('prompt', stdin, env), '');
  assert.deepEqual(readState(statePath(env, 's1')).shown, { IN4: 'prompt' });
});

test('A TURN THAT OWES A REPLY IS HELD ONCE, per instruction, and let go when a Stop hook already continued it', () => {
  /* AS THE PULSE ANSWERS IT, with no `taken`: the line asking for the reply is what says it was taken. */
  const { taken: _no, ...raw } = tell('IN4');
  const taken = toldOf({ ...raw, said: 'Merge', line: 'Mara said in BrainDog (IN4): "Merge". Reply with instructions reply IN4 when it is done.' })!;
  assert.equal(taken.taken, true);
  const inbox = fresh({ pending: [taken] });
  const held = stopFor(inbox, NO_STATE, turn())!;
  assert.match(held.reason, /^Reply to IN4 with instructions before you stop: say what you did, or that it needs him\. He said: "Merge"\.$/u);
  assert.equal(stopFor(inbox, held.state, turn()), null, 'held twice for one instruction');
  assert.equal(stopFor(inbox, NO_STATE, turn({ continued: true })), null, 'stop_hook_active was not respected');
  assert.equal(stopFor(inbox, NO_STATE, turn({ agent: 'a1' })), null);
  /* NOT TAKEN AND NOT SHOWN: nothing is owed yet. Shown to this run on a prompt: it is. */
  assert.equal(stopFor(fresh({ pending: [tell('IN5')] }), NO_STATE, turn()), null);
  assert.ok(stopFor(fresh({ pending: [tell('IN5')] }), { ...NO_STATE, shown: { IN5: 'prompt' } }, turn()) !== null);
  /* TO AN AGENT KIND, shown but not taken by this run: another run may have it. */
  assert.equal(stopFor(fresh({ pending: [tell('IN6', { to: 'agent' })] }), { ...NO_STATE, shown: { IN6: 'prompt' } }, turn()), null);
  /* STOPPED OR PAUSED, the run is to wait or end, so the turn is never held. */
  assert.equal(stopFor(fresh({ pending: [taken], stop: { kind: 'pause', id: 'IN8', said: '' } }), NO_STATE, turn()), null);
});

test('A RUN THAT COMMITTED IS ASKED FOR ITS LEARNINGS ONCE BEFORE IT ENDS, and never loops (scope B31)', () => {
  assert.equal(stopFor(fresh(), NO_STATE, turn()), null, 'no commit, nothing asked');
  const committed = fresh({ committed: true });
  const asked = stopFor(committed, NO_STATE, turn())!;
  assert.match(asked.reason, /^You committed in this run\. .*create learnings with topic set to the skill it bears on/u);
  assert.equal(stopFor(committed, asked.state, turn()), null, 'asked twice in one run');
  assert.equal(stopFor(committed, NO_STATE, turn({ continued: true })), null, 'stop_hook_active was not respected');
  assert.equal(stopFor(committed, NO_STATE, turn({ agent: 'a1' })), null, 'a subagent is not asked');
  assert.equal(stopFor(fresh({ committed: true, stop: { kind: 'stop', id: 'IN9', said: '' } }), NO_STATE, turn()), null, 'never while he holds the run');
  /* AN INSTRUCTION OWED IS ANSWERED FIRST, and the learning is asked at the next end. */
  const taken = toldOf({ ...tell('IN4'), taken_by: 'S883' })!;
  const first = stopFor(fresh({ committed: true, pending: [taken] }), NO_STATE, turn())!;
  assert.match(first.reason, /^Reply to IN4/u);
  assert.match(stopFor(fresh({ committed: true, pending: [taken] }), first.state, turn())!.reason, /^You committed in this run/u);

  /* WHOLE: the Stop JSON once, then nothing, and the state keeps that it asked. */
  const env = envFor();
  writeInbox(inboxPath(env, 's2'), committed);
  const end = JSON.stringify({ session_id: 's2', cwd: '/w', hook_event_name: 'Stop', stop_hook_active: false });
  const said = JSON.parse(runHook('stop', end, env)) as { decision: string; reason: string };
  assert.equal(said.decision, 'block');
  assert.equal(runHook('stop', end, env), '', 'asked twice');
  assert.equal(readState(statePath(env, 's2')).learned, true);
});

test('RUN WHOLE: the JSON for Stop, and stop_hook_active read from the event', () => {
  const env = envFor();
  writeInbox(inboxPath(env, 's1'), fresh({ pending: [toldOf({ ...tell('IN4'), taken_by: 'S883' })!] }));
  const active = JSON.stringify({ session_id: 's1', cwd: '/w', hook_event_name: 'Stop', stop_hook_active: true });
  assert.equal(runHook('stop', active, env), '');
  const said = JSON.parse(runHook('stop', active.replace('true', 'false'), env)) as { decision: string; reason: string };
  assert.equal(said.decision, 'block');
  assert.match(said.reason, /^Reply to IN4 with instructions before you stop/u);
  assert.equal(runHook('stop', active.replace('true', 'false'), env), '', 'held twice');
});

test('THE WATCHER ANSWERS WHAT A PROMPT WOULD as soon as it comes, and nothing when nothing comes by its deadline', async () => {
  const env = envFor();
  const stdin = JSON.stringify({ session_id: 's1', cwd: '/w', hook_event_name: 'Stop', stop_hook_active: false });
  writeInbox(inboxPath(env, 's1'), fresh());
  assert.equal(await watchHook(stdin, env, Date.now() + 120, 30), null);
  setTimeout(() => writeInbox(inboxPath(env, 's1'), fresh({ pending: [tell('IN4')] })), 60).unref();
  assert.equal(await watchHook(stdin, env, Date.now() + 2_000, 20), tell('IN4').line);
  assert.equal(readState(statePath(env, 's1')).shown.IN4, 'prompt');
  assert.equal(await watchHook(stdin, env, Date.now() + 80, 20), null, 'the same instruction woke the session twice');
});

test('THE 50 MS BUDGET for a prompt with one instruction, in process', () => {
  const env = envFor();
  const stdin = JSON.stringify({ session_id: 's1', cwd: '/w', hook_event_name: 'UserPromptSubmit', prompt: 'x' });
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    writeInbox(inboxPath(env, 's1'), fresh({ pending: [tell(`IN${String(i + 10)}`)] }));
    const began = performance.now();
    assert.notEqual(runHook('prompt', stdin, env), '');
    times.push(performance.now() - began);
  }
  const sorted = times.sort((a, b) => a - b);
  process.stdout.write(`# hook prompt in process: median ${sorted[10]!.toFixed(2)} ms, slowest ${sorted.at(-1)!.toFixed(2)} ms\n`);
  assert.ok(sorted[10]! < 50);
});
