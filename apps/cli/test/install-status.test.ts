/**
 * and AGT-C03's beat: the start and end entries say they are working, every BrainDog hook entry ends
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

import { gitShell, HOOK_STATUS, HOOKS_HELD, hookCommand, installAt } from '../src/install.ts';

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
const hook = (which: 'start' | 'end' | 'beat' | 'prompt' | 'tool' | 'stop') => ({
  type: 'command',
  command: hookCommand(which, SCRIPTS, 'darwin'),
  timeout: which === 'start' || which === 'end' || which === 'beat' ? 10 : 5,
  ...(which === 'start' || which === 'end' ? { statusMessage: HOOK_STATUS } : {}),
});

/** The three that read the inbox file (inbox-file.ts), each its own event, added by every fresh install. */
const INBOX = [['UserPromptSubmit', 'prompt'], ['PreToolUse', 'tool'], ['Stop', 'stop']] as const;

type Settings = { hooks: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]> };
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Settings;

test('a fresh install adds six hooks ending inside ten seconds, the start and end saying "Connecting to BrainDog..."', () => {
  const file = settingsIn({ model: 'opus' });
  const dry = installAt(file, options(false));
  for (const [event, which] of [['SessionStart', 'start'], ['SessionEnd', 'end'], ['PostToolUse', 'beat'], ...INBOX] as const)
    assert.ok(dry.includes(`  + hooks.${event}: ${JSON.stringify({ hooks: [hook(which)] })}`), `${event}:\n${dry.join('\n')}`);
  assert.equal(HOOK_STATUS, 'Connecting to BrainDog...');
  assert.deepEqual(read(file), { model: 'opus' }, 'the dry run wrote');

  installAt(file, options(true));
  const now = read(file);
  assert.deepEqual(Object.keys(now.hooks), ['SessionStart', 'SessionEnd', 'PostToolUse', 'UserPromptSubmit', 'PreToolUse', 'Stop']);
  for (const [event, groups] of Object.entries(now.hooks)) {
    assert.equal(groups.length, 1);
    assert.ok(groups[0]!.hooks[0]!.timeout! as number <= 10, event);
    /* NO MATCHER: a PreToolUse group without one is every tool, which a stop has to reach. */
    assert.equal(groups[0]!.matcher, undefined, event);
    /* The beat and the inbox hooks run on every call and prompt, so a status line there would flash under the agent's own work. */
    assert.equal(groups[0]!.hooks[0]!.statusMessage, event === 'SessionStart' || event === 'SessionEnd' ? 'Connecting to BrainDog...' : undefined, event);
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
      ...INBOX.map(([event, which]) => `  + hooks.${event}: ${JSON.stringify({ hooks: [hook(which)] })}`),
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

test('on Windows without Git the beat runs the PowerShell script with the word beat', () => {
  const command = hookCommand('beat', 'C:\\braindog\\apps\\cli\\hooks', 'win32', null);
  assert.match(command, /^powershell -NoProfile -ExecutionPolicy Bypass -File ".*braindog-hook\.ps1" beat$/u);
});

test("on Windows with Git the beat runs Git's sh on the POSIX script, with forward slashes", () => {
  const command = hookCommand('beat', 'C:\\braindog\\apps\\cli\\hooks', 'win32', 'C:\\Program Files\\Git\\usr\\bin\\sh.exe');
  assert.equal(command, '"C:\\Program Files\\Git\\usr\\bin\\sh.exe" "C:/braindog/apps/cli/hooks/braindog-hook.sh" beat');
});

test("Git's sh is found from Claude Code's Git Bash path, else under Program Files", () => {
  const has = (want: string) => (p: string) => p === want;
  const sh = 'C:\\Git\\usr\\bin\\sh.exe';
  assert.equal(gitShell({ CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Git\\bin\\bash.exe' }, has(sh)), sh);
  const pf = 'C:\\Program Files\\Git\\usr\\bin\\sh.exe';
  assert.equal(gitShell({ ProgramFiles: 'C:\\Program Files' }, has(pf)), pf);
  assert.equal(gitShell({}, () => false), null);
});

test('the watcher that wakes an idle session is written only with --rewake, as an async Stop hook beside the stop hook', () => {
  const plain = settingsIn({});
  installAt(plain, options(true));
  assert.deepEqual(read(plain).hooks.Stop, [{ hooks: [hook('stop')] }], 'a plain install wrote the watcher');

  const file = settingsIn({});
  installAt(file, { ...options(true), rewake: true });
  const stop = read(file).hooks.Stop!;
  assert.deepEqual(stop[0], { hooks: [hook('stop')] });
  assert.deepEqual(stop[1], { hooks: [{ type: 'command', command: hookCommand('watch', SCRIPTS, 'darwin'), timeout: 610, asyncRewake: true }] });
  assert.ok(installAt(file, { ...options(false), rewake: true })[0]!.includes(HOOKS_HELD));
});
