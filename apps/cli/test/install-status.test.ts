/**
 * AGT-B10 job 1, and AGT-C03's beat: the start and end entries say they are working, every BrainDog hook entry ends
 * inside ten seconds, the beat after each tool call says nothing, and an older entry of BrainDog's own is rewritten
 * where it stands rather than joined by a second.
 *
 * MEASURED BEFORE THIS EXISTED: the entry was a command and a timeout of twenty seconds for the start and fifteen for
 * the end, so a start with the network cut sat silent for as long as the attach took, and an install over an older
 * entry with another timeout added a second hook beside it, so every session ran the start hook twice.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HOOK_STATUS, HOOKS_HELD, hookCommand, installAt } from '../src/install.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-install-status-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const settingsIn = (body?: unknown): string => {
  const dir = join(scratch, `p${String(n++)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'settings.json');
  if (body !== undefined) writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return file;
};
const SCRIPTS = join(scratch, 'checkout', 'hooks');
const options = (apply: boolean) => ({ apply, scripts: SCRIPTS, platform: 'darwin', home: scratch });
const hook = (which: 'start' | 'end' | 'beat') => ({
  type: 'command',
  command: hookCommand(which, SCRIPTS, 'darwin'),
  timeout: 10,
  ...(which === 'beat' ? {} : { statusMessage: HOOK_STATUS }),
});

type Settings = { hooks: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]> };
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Settings;

test('a fresh install adds three hooks ending inside ten seconds, the start and end saying "Connecting to BrainDog..."', () => {
  const file = settingsIn({ model: 'opus' });
  const dry = installAt(file, options(false));
  for (const [event, which] of [['SessionStart', 'start'], ['SessionEnd', 'end'], ['PostToolUse', 'beat']] as const)
    assert.ok(dry.includes(`  + hooks.${event}: ${JSON.stringify({ hooks: [hook(which)] })}`), `${event}:\n${dry.join('\n')}`);
  assert.equal(HOOK_STATUS, 'Connecting to BrainDog...');
  assert.deepEqual(read(file), { model: 'opus' }, 'the dry run wrote');

  installAt(file, options(true));
  const now = read(file);
  assert.deepEqual(Object.keys(now.hooks), ['SessionStart', 'SessionEnd', 'PostToolUse']);
  for (const [event, groups] of Object.entries(now.hooks)) {
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.hooks[0]!.timeout, 10);
    /* The beat runs after every tool call, so a status line there would flash under the agent's own work. */
    assert.equal(groups[0]!.hooks[0]!.statusMessage, event === 'PostToolUse' ? undefined : 'Connecting to BrainDog...', event);
  }
  assert.equal(now.hooks.PostToolUse![0]!.hooks[0]!.command, `sh "${join(SCRIPTS, 'braindog-hook.sh')}" beat`);

  const again = installAt(file, options(true));
  assert.ok(again[0]!.startsWith(`${file} ${HOOKS_HELD}. Nothing to change.`), again.join('\n'));
});

test('an older BrainDog entry is rewritten where it stands, as one ~ line, with a copy of the file kept', () => {
  const other = { type: 'command', command: 'echo other' };
  const before = {
    hooks: {
      SessionStart: [{ matcher: 'startup', hooks: [other, { type: 'command', command: hookCommand('start', SCRIPTS, 'darwin'), timeout: 20 }] }],
      /* From before the checkout moved: the same script by name, somewhere else. */
      SessionEnd: [{ hooks: [{ type: 'command', command: 'sh "/Users/old/braindog/apps/cli/hooks/braindog-hook.sh" end', timeout: 15 }] }],
    },
  };
  const file = settingsIn(before);
  const dry = installAt(file, options(false));
  assert.deepEqual(
    dry.filter((l) => /^ {2}[~+] hooks\./u.test(l)),
    [
      `  ~ hooks.SessionStart: ${JSON.stringify(hook('start'))}`,
      `  ~ hooks.SessionEnd: ${JSON.stringify(hook('end'))}`,
      `  + hooks.PostToolUse: ${JSON.stringify({ hooks: [hook('beat')] })}`,
    ],
    dry.join('\n'),
  );

  installAt(file, options(true));
  assert.deepEqual(JSON.parse(readFileSync(`${file}.pre-braindog`, 'utf8')), before, 'no copy of the file as it was');
  const now = read(file);
  assert.deepEqual(now.hooks.SessionStart, [{ matcher: 'startup', hooks: [other, hook('start')] }], 'not in place, or another hook lost');
  assert.deepEqual(now.hooks.SessionEnd, [{ hooks: [hook('end')] }]);
  assert.ok(installAt(file, options(false))[0]!.includes(HOOKS_HELD));
});

test('a hook entry of somebody else that only mentions the word is not taken for BrainDog\'s', () => {
  const theirs = { type: 'command', command: 'sh my-hook.sh start', timeout: 30 };
  const file = settingsIn({ hooks: { SessionStart: [{ hooks: [theirs] }] } });
  installAt(file, options(true));
  assert.deepEqual(read(file).hooks.SessionStart, [{ hooks: [theirs] }, { hooks: [hook('start')] }]);
});

test('a beat entry from an earlier install that showed a status line is rewritten without it', () => {
  const file = settingsIn({ hooks: { PostToolUse: [{ hooks: [{ ...hook('beat'), statusMessage: HOOK_STATUS }] }] } });
  assert.ok(installAt(file, options(false)).includes(`  ~ hooks.PostToolUse: ${JSON.stringify(hook('beat'))}`));
  installAt(file, options(true));
  assert.deepEqual(read(file).hooks.PostToolUse, [{ hooks: [hook('beat')] }]);
});

test('on Windows the beat runs the PowerShell script with the word beat', () => {
  const command = hookCommand('beat', 'C:\\braindog\\apps\\cli\\hooks', 'win32');
  assert.match(command, /^powershell -NoProfile -ExecutionPolicy Bypass -File ".*braindog-hook\.ps1" beat$/u);
});
