/**
 * Codex's turn end (`notifyHook` in `inbox-file.ts`): what the person at the machine is told when a Codex turn ends and
 * the run has not taken something he told it, read from the inbox file the bridge keeps for the Codex process.
 *
 * WHAT IS HELD: only the end of a turn is read, and of its event only the type, never the turn's words; a run that has
 * taken what he said, a stop, a stale file and no file are told nothing; each instruction is said once; the file is
 * named by the Codex process; and the hooks' own entry is the bundle's when it is there.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { codexSession, INBOX_ENTRY, inboxEntryIn, inboxPath, notifyHook, readState, statePath, toldOf, writeInbox, type Inbox } from '../src/inbox-file.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-codex-notify-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const envFor = () => ({ XDG_CONFIG_HOME: join(scratch, `config${String(n++)}`) });
const NOW = Date.parse('2026-10-22T09:00:00Z');
const SESSION = codexSession(4242);

const told = (id: string, kind = 'tell', taken = false) =>
  toldOf({ id, kind, said: `Rename the ${id} button`, at: '2026-10-22T08:59:00Z', to: 'run', line: `Mara said in BrainDog (${id}): "Rename the ${id} button". Take it with instructions take ${id}.`, taken })!;

const inbox = (more: Partial<Inbox> = {}): Inbox => ({
  v: 1,
  host: 'https://brain.dog/acme',
  run: 'S912',
  stamp: 'v3',
  at: new Date(NOW - 5_000).toISOString(),
  pending: [told('IN4')],
  stop: null,
  stop_line: null,
  hooks: true,
  reported: [],
  ...more,
});

/** A turn's end as Codex sends it, its own words included, which are never read. */
const turn = JSON.stringify({ type: 'agent-turn-complete', 'thread-id': 'th_1', 'turn-id': 't_1', cwd: '/w', 'input-messages': ['secret words'], 'last-assistant-message': 'Done.' });

/** The notices shown, kept rather than shown. */
const shown = () => {
  const said: string[] = [];
  return { said, show: (title: string, body: string) => void said.push(`${title}: ${body}`) };
};

test('A TURN THAT ENDS WITHOUT TAKING WHAT HE SAID IS SAID ONCE, in his words, and the next turn says nothing', () => {
  const env = envFor();
  writeInbox(inboxPath(env, SESSION), inbox());
  const s = shown();
  const body = notifyHook(turn, env, SESSION, NOW, s.show);
  assert.equal(body, 'Codex ended its turn without taking IN4: "Rename the IN4 button". Send it any message and it reads it first.');
  assert.deepEqual(s.said, [`BrainDog: ${body}`]);
  assert.ok(!s.said.join('').includes('secret words'), 'the turn’s words are never read');
  assert.deepEqual(readState(statePath(env, SESSION)).noticed, ['IN4']);
  assert.equal(notifyHook(turn, env, SESSION, NOW, s.show), null);
  assert.equal(s.said.length, 1);
});

test('NOTHING IS SAID for a run that took it, a stop, a stale or missing file, or an event that is not a turn’s end', () => {
  const env = envFor();
  const s = shown();
  assert.equal(notifyHook(turn, env, SESSION, NOW, s.show), null, 'no file');
  writeInbox(inboxPath(env, SESSION), inbox({ pending: [told('IN4', 'tell', true)] }));
  assert.equal(notifyHook(turn, env, SESSION, NOW, s.show), null, 'taken');
  writeInbox(inboxPath(env, SESSION), inbox({ pending: [told('IN5', 'stop')], stop: { kind: 'stop', id: 'IN5', said: 'wait' } }));
  assert.equal(notifyHook(turn, env, SESSION, NOW, s.show), null, 'a stop');
  writeInbox(inboxPath(env, SESSION), inbox({ at: new Date(NOW - 10 * 60_000).toISOString() }));
  assert.equal(notifyHook(turn, env, SESSION, NOW, s.show), null, 'stale');
  writeInbox(inboxPath(env, SESSION), inbox());
  assert.equal(notifyHook(JSON.stringify({ type: 'approval-requested' }), env, SESSION, NOW, s.show), null, 'another event');
  assert.equal(notifyHook('not json', env, SESSION, NOW, s.show), null);
  assert.deepEqual(s.said, []);
});

test('SEVERAL AT ONCE ARE ONE NOTICE, naming the first and counting the rest', () => {
  const env = envFor();
  writeInbox(inboxPath(env, SESSION), inbox({ pending: [told('IN4'), told('IN6', 'redirect')] }));
  const s = shown();
  assert.match(notifyHook(turn, env, SESSION, NOW, s.show) ?? '', /without taking IN4: .* And 1 more\.$/u);
  assert.deepEqual(readState(statePath(env, SESSION)).noticed, ['IN4', 'IN6']);
});

test('A CODEX SESSION IS NAMED BY ITS PROCESS, and the hooks’ entry is the bundle’s own when it is there', () => {
  assert.equal(codexSession(4242), 'codex-4242');
  const scripts = join(scratch, `scripts${String(n++)}`);
  mkdirSync(scripts, { recursive: true });
  assert.equal(inboxEntryIn(scripts), resolve(scripts, '..', 'src', 'inbox-file.ts'), 'a checkout runs its source');
  writeFileSync(join(scripts, INBOX_ENTRY), '');
  assert.equal(inboxEntryIn(scripts), join(scripts, INBOX_ENTRY));
});
