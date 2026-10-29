/**
 * The connect sheet's decisions: six ways in, in order, the lines each hands over, the live row's three
 * states, the poll, and names, never ids, in anything the sheet says.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { copy } from '../copy.ts';
import { INSTALL_LINES } from '../device.ts';
import { connectLines } from '../record/device.ts';
import { appLines } from './first-connect.ts';
import { CONNECT_TILES, POLL_MS, connectWords, copyOf, heardOf, lineOf, liveRow, machineOf, poll, type PollHost } from './connect.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const run = (fields: Record<string, unknown>) => ({ seq: 47, fields });

test('the apps the first screen offers, in its order, then Codex, any other app and a script', () => {
  assert.deepEqual(
    CONNECT_TILES.map((t) => t.title),
    ['Claude Code', 'Claude', 'ChatGPT', 'VS Code', 'Cursor', 'Codex', 'Any other app', 'A script'],
  );
  /* THE SAME APPS AS CONNECT YOUR AGENT (`first-connect.ts`), so the two screens never offer different ones. */
  const first = appLines(connectLines('https://brain.dog', 'acme')).map((a) => a.name);
  assert.deepEqual(CONNECT_TILES.slice(0, first.length).map((t) => t.title), first);
  assert.equal(new Set(CONNECT_TILES.map((t) => t.id)).size, CONNECT_TILES.length);
});

test('each tile hands over its own lines, and only the script holds the key form', () => {
  const lines = Object.fromEntries(CONNECT_TILES.map((t) => [t.id, t.lines]));
  assert.deepEqual(lines['claude-code'], ['install', 'setup', 'claude']);
  /* SETUP FINDS CODEX AND CURSOR, so they take Claude Code's two lines, and the address for doing it by hand. */
  assert.deepEqual(lines.codex, ['install', 'setup', 'codex']);
  assert.deepEqual(lines.cursor, ['install', 'setup', 'cursor']);
  assert.deepEqual(lines['claude-web'], ['web']);
  assert.deepEqual(lines.chatgpt, ['chatgpt']);
  assert.deepEqual(lines.vscode, ['vscode']);
  assert.deepEqual(lines.other, ['other']);
  assert.deepEqual(lines.script, []);
  assert.deepEqual(CONNECT_TILES.filter((t) => t.key).map((t) => t.id), ['script']);
  assert.equal(CONNECT_TILES.find((t) => t.id === 'script')?.hint, 'An app signs in. A key is for a script.');
  assert.match(CONNECT_TILES.find((t) => t.id === 'claude-web')?.hint ?? '', /Settings, Connectors, add a custom connector/u);
  assert.match(CONNECT_TILES.find((t) => t.id === 'chatgpt')?.hint ?? '', /^In ChatGPT, open Settings, Connectors/u);
});

test('ChatGPT pastes the address and VS Code runs the line the first screen gives it', () => {
  const lines = connectLines('https://brain.dog', 'acme');
  const first = new Map(appLines(lines).map((a) => [a.id, a.line]));
  assert.equal(lineOf('chatgpt', lines, 'unix'), first.get('chatgpt'));
  assert.equal(lineOf('vscode', lines, 'unix'), first.get('vscode'));
  assert.equal(copyOf('chatgpt'), connectWords.copyAddress);
  assert.equal(copyOf('vscode'), connectWords.copyCommand);
});

test('a line is the installer for the computer chosen, or the record\'s own line, and never a key', () => {
  const lines = connectLines('https://brain.dog', 'acme');
  assert.equal(lineOf('install', lines, 'windows'), INSTALL_LINES.windows);
  assert.equal(lineOf('install', lines, 'unix'), INSTALL_LINES.unix);
  assert.equal(lineOf('setup', lines, 'unix'), 'braindog setup https://brain.dog/acme');
  assert.equal(lineOf('web', lines, 'unix'), 'https://brain.dog/mcp');
  assert.equal(copyOf('web'), connectWords.copyAddress);
  assert.equal(copyOf('cursor'), connectWords.copyEntry);
  assert.equal(copyOf('setup'), connectWords.copyCommand);
  for (const tile of CONNECT_TILES) {
    for (const id of tile.lines) assert.doesNotMatch(lineOf(id, lines, 'unix'), /token|bearer|bd_/iu, `${tile.id} ${id}`);
  }
});

test('the live row waits, then says Connected with the app and the kind of machine', () => {
  const opened = NOW - 60_000;
  assert.deepEqual(liveRow([], 'claude-code', NOW, opened), { state: 'waiting', said: 'Waiting for its first call' });
  const heard = heardOf([run({ client: 'claude-code 2.1.4', agent: 'claude', host: 'Maras-MacBook-Pro.local', last_seen: ago(3_000) })]);
  assert.deepEqual(liveRow(heard, 'claude-code', NOW, opened), {
    state: 'connected',
    said: 'Connected: Claude Code on MacBook, called 3 seconds ago',
  });
  /* ANOTHER APP'S CALL IS NOT THIS TILE'S. */
  assert.equal(liveRow(heard, 'codex', NOW, opened).state, 'waiting');
});

test('an app heard only before the sheet opened is still waiting, and says when it last called', () => {
  const heard = heardOf([run({ client: 'codex-mcp-client', agent: 'codex', host: 'DESKTOP-4J2K', last_seen: ago(2 * 86_400_000) })]);
  const row = liveRow(heard, 'codex', NOW, NOW - 30_000);
  assert.equal(row.state, 'earlier');
  assert.match(row.said, /^Waiting for a new call\. Codex on Windows PC last called /u);
});

test('each run is told to its way in, by the app it named or the kind of agent', () => {
  const rows = [
    run({ client: 'claude-ai', agent: 'claude', last_seen: ago(5_000) }),
    run({ agent: 'claude', host: 'studio-imac.local', last_seen: ago(6_000) }),
    run({ client: 'cursor-vscode', agent: 'cursor', last_seen: ago(7_000) }),
    run({ client: 'zed', agent: 'other', last_seen: ago(8_000) }),
  ];
  const heard = heardOf(rows);
  assert.deepEqual(heard.map((h) => h.tile), ['claude-web', 'claude-code', 'cursor', 'other']);
  assert.deepEqual(heard.map((h) => h.app), ['Claude', 'Claude Code', 'Cursor', 'Zed']);
  assert.equal(heard[1]?.machine, 'iMac');
});

test('ChatGPT and VS Code are told to their own tiles, and Codex and Cursor stay theirs', () => {
  const heard = heardOf([
    run({ client: 'openai-mcp', last_seen: ago(5_000) }),
    run({ client: 'Visual Studio Code', last_seen: ago(6_000) }),
    run({ client: 'codex-mcp-client', agent: 'codex', last_seen: ago(7_000) }),
    run({ client: 'cursor-vscode', agent: 'cursor', last_seen: ago(8_000) }),
  ]);
  assert.deepEqual(heard.map((h) => h.tile), ['chatgpt', 'vscode', 'codex', 'cursor']);
  assert.equal(liveRow(heard, 'chatgpt', NOW, NOW - 60_000).state, 'connected');
});

test('the key just made is the script tile\'s, from its own last use or a run it opened', () => {
  const keys = [{ id: 'tok_01J9ZX3KQ4N8V6W2Y5T7R3M1PB', label: 'Nightly import', last_used_at: ago(4_000) }];
  assert.equal(liveRow(heardOf([], keys, null), 'script', NOW, NOW - 10_000).state, 'waiting');
  const said = liveRow(heardOf([], keys, keys[0]!.id), 'script', NOW, NOW - 10_000);
  assert.deepEqual(said, { state: 'connected', said: 'Connected: Nightly import, called 4 seconds ago' });
  const opened = heardOf([run({ token_id: keys[0]!.id, client: 'claude-code', last_seen: ago(2_000) })], [], keys[0]!.id);
  assert.equal(opened[0]?.tile, 'script');
});

test('names, never ids: no host name, handle, key id or path reaches a sentence', () => {
  const rows = [
    run({ client: '01J9ZX3KQ4N8V6W2Y5T7R3M1PB', agent: 'other', host: 'build-box.lan', token_id: 't_1', last_seen: ago(2_000) }),
    run({ client: 'S42', host: 'Maras-MacBook-Pro.local', last_seen: ago(3_000) }),
    run({ client: '/usr/local/bin/agent', last_seen: ago(4_000) }),
  ];
  const keys = [{ id: 'tok_01J9ZX3KQ4N8V6W2Y5T7R3M1PB', label: null, last_used_at: ago(1_000) }];
  const heard = heardOf(rows, keys, keys[0]!.id);
  for (const tile of CONNECT_TILES) {
    const { said } = liveRow(heard, tile.id, NOW, NOW - 60_000);
    assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}|tok_|t_1|S42|build-box|Maras|\.local|\/usr/u, `${tile.id}: ${said}`);
    assert.doesNotMatch(said, /—/u);
  }
  assert.equal(machineOf('build-box.lan'), null);
  assert.equal(heard.find((h) => h.tile === 'script')?.app, 'Your script');
});

test('the poll asks at once and every two seconds, and stops when the tab is hidden or the sheet closes', () => {
  assert.equal(POLL_MS, 2_000);
  let ticks = 0;
  const timers = new Map<number, () => void>();
  let next = 0;
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_k: 'visibilitychange', fn: () => void) => void listeners.add(fn),
    removeEventListener: (_k: 'visibilitychange', fn: () => void) => void listeners.delete(fn),
  };
  const host: PollHost = {
    setInterval: (fn, ms) => {
      assert.equal(ms, POLL_MS);
      timers.set(++next, fn);
      return next;
    },
    clearInterval: (id) => void timers.delete(id as number),
    document: doc,
  };
  const fire = (): void => [...timers.values()].forEach((fn) => fn());
  const stop = poll(() => ticks++, host);
  assert.equal(ticks, 1);
  fire();
  assert.equal(ticks, 2);
  doc.visibilityState = 'hidden';
  listeners.forEach((fn) => fn());
  assert.equal(timers.size, 0);
  doc.visibilityState = 'visible';
  listeners.forEach((fn) => fn());
  assert.equal(ticks, 3);
  assert.equal(timers.size, 1);
  stop();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
});

test('no sentence the sheet says carries an em dash', () => {
  const words = [
    ...CONNECT_TILES.flatMap((t) => [t.title, t.hint]),
    ...Object.values(connectWords.step),
    connectWords.waiting,
    connectWords.connected('Codex', 'just now'),
    connectWords.earlier('Codex', '2d ago'),
  ];
  for (const w of words) assert.doesNotMatch(w, /—/u, w);
});

test('the page an app sends you to says agent, as the button on it and the sheet do', () => {
  assert.equal(copy.consentTitle, connectWords.open);
});
