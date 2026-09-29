/**
 * The hand-run line `braindog install` prints for a profile left without BrainDog's server, run in the shell it is
 * printed for.
 *
 * MEASURED BEFORE THIS EXISTED. The line was `sh` on every platform, `CLAUDE_CONFIG_DIR='<dir>' claude
 * mcp add-json braindog '<json>' --scope user`, and the owner runs install on Windows. Windows PowerShell 5.1 read the
 * assignment as a command name and threw `CommandNotFoundException`, `cmd` said "not recognized", and the bare line
 * reached `claude` with the JSON's inner double quotes stripped, `{type:stdio,command:node,...}`, which does not
 * parse. Only Git Bash ran it.
 *
 * AND `--` IS A SECOND TRAP IN THE SAME SHELL. The form with no JSON, `claude mcp add ... -- node <main.ts> mcp
 * --agent claude`, needs the `--` so Claude Code does not read `--agent` as its own option: measured against Claude
 * Code 2.1.280 in a scratch profile, the line without it exits 1 with "error: unknown option '--agent'". And
 * PowerShell 5.1 drops a bare `--` before it reaches a `.ps1`, which is what `npm install -g` puts on the PATH as
 * `claude`: a stand-in `claude.ps1` was handed `... braindog node ...` with no `--`, and `'--'` quoted arrived whole.
 * So the stand-in here is a `.ps1`, the harsher of the two; `claude.exe` from the native installer took the quoted
 * form and wrote the entry, checked by hand once against the real CLI in a scratch `CLAUDE_CONFIG_DIR`.
 *
 * AND A LINE PRINTED FOR ONE SHELL MUST RUN NOTHING IN ANOTHER.
 * The PowerShell form was bare `;` statements, and Git Bash ran them one by one: the assignments failed and `claude mcp
 * add` ran in the shell's own profile. So the form is chosen by the shell where it can be told, and each is tested in
 * the shell it is not for as well as the one it is.
 *
 * NOTHING HERE RUNS THE REAL `claude`. A stand-in earlier on the PATH prints the `CLAUDE_CONFIG_DIR` it saw and each
 * argument it was given, and every folder is under a temporary one.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { byHand, shellOf } from '../src/install.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(APP, 'src', 'main.ts').replaceAll('\\', '/');
/* What `claude` must be handed, argument for argument, for the entry `install --replace` writes. */
const ARGS = ['mcp', 'add', '--scope', 'user', 'braindog', '--', 'node', MAIN, 'mcp', '--agent', 'claude'];

const scratch = mkdtempSync(join(tmpdir(), 'braindog-hand-line-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const home = join(scratch, 'home');
/* A space and an apostrophe, the two characters each shell's quoting has to survive. */
const named = join(home, ".claude-side job's");
const WAS = 'C:\\the\\shell\\own\\profile';

/*
 * THE STAND-IN FIRST ON THE PATH, under whatever name the PATH already has. Windows spells it `Path`, a spread
 * `process.env` keeps that spelling, and adding `PATH` beside it hands the child two, either of which may win.
 */
function withBin(bin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  env[key] = `${bin}${delimiter}${env[key] ?? ''}`;
  return env;
}

test('IN POWERSHELL A NAMED PROFILE IS NAMED THE WAY POWERSHELL SETS A VARIABLE, inside one script block, with no inline JSON and the apostrophe doubled', () => {
  const [line = ''] = byHand([named], home, 'PowerShell');
  assert.ok(line.startsWith('& { $was = $env:CLAUDE_CONFIG_DIR; $env:CLAUDE_CONFIG_DIR = '), line);
  assert.ok(line.includes(`'${named.replaceAll("'", "''")}'`), line);
  assert.ok(!line.includes("'{") && !line.includes('add-json'), line);
  assert.ok(line.endsWith('; $env:CLAUDE_CONFIG_DIR = $was }'), line);
});

test('ELSEWHERE THE LINE STAYS sh, with the apostrophe closed and reopened, and no inline JSON either', () => {
  const [line = ''] = byHand([named], home, 'sh');
  assert.ok(line.startsWith(`CLAUDE_CONFIG_DIR='${named.replaceAll("'", "'\\''")}' claude mcp add --scope user braindog -- node `), line);
  assert.ok(!line.includes("'{") && !line.includes('add-json'), line);
  assert.deepEqual(byHand([named, join(home, '.claude')], home, 'Git Bash'), byHand([named, join(home, '.claude')], home, 'sh'));
});

test('THE SHELL IS GIT BASH ON WIN32 WHERE MSYSTEM OR A bash SHELL SAYS SO, PowerShell otherwise, and sh off Windows', () => {
  assert.equal(shellOf({ MSYSTEM: 'MINGW64' }, 'win32'), 'Git Bash');
  assert.equal(shellOf({ SHELL: '/usr/bin/bash' }, 'win32'), 'Git Bash');
  assert.equal(shellOf({ PSModulePath: 'C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules' }, 'win32'), 'PowerShell');
  assert.equal(shellOf({}, 'win32'), 'PowerShell');
  assert.equal(shellOf({ MSYSTEM: 'MINGW64', _: 'C:/WINDOWS/System32/WindowsPowerShell/v1.0/powershell' }, 'win32'), 'PowerShell');
  assert.equal(shellOf({ MSYSTEM: 'MINGW64', _: 'C:/Program Files/nodejs/node' }, 'win32'), 'Git Bash');
  assert.equal(shellOf({ MSYSTEM: 'MINGW64' }, 'linux'), 'sh');
  assert.equal(shellOf({}, 'darwin'), 'sh');
});

/**
 * Runs `lines` in Windows PowerShell 5.1 with a `claude.ps1` stand-in first on the PATH, the shell's own
 * `CLAUDE_CONFIG_DIR` set to `was` beforehand (or removed when it is null), and returns what the stand-in saw and
 * what the shell held after.
 */
function inPowerShell(lines: string[], was: string | null) {
  const dir = mkdtempSync(join(scratch, 'ps-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'claude.ps1'), 'Write-Output "dir=$env:CLAUDE_CONFIG_DIR"\r\nforeach ($a in $args) { Write-Output "arg=$a" }\r\n');
  const before = was === null ? 'Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue' : `$env:CLAUDE_CONFIG_DIR = '${was}'`;
  const after = 'Write-Output ("after=" + $env:CLAUDE_CONFIG_DIR + "|set=" + (Test-Path Env:CLAUDE_CONFIG_DIR))';
  /*
   * A BOM AND UTF-8 OUT, so a character past ASCII reaches the parser as a pasted line does. Without the BOM 5.1
   * reads the file as the ANSI code page, and `’` arrived as three other characters that end no string.
   */
  const utf8 = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8';
  writeFileSync(join(dir, 'line.ps1'), `\uFEFF${[utf8, before, ...lines, after, ''].join('\r\n')}`);
  const env = withBin(join(dir, 'bin'));
  const ran = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'line.ps1')], { env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  const out = ran.stdout.split(/\r?\n/);
  return {
    dirs: out.filter((l) => l.startsWith('dir=')).map((l) => l.slice(4)),
    args: out.filter((l) => l.startsWith('arg=')).map((l) => l.slice(4)),
    after: out.find((l) => l.startsWith('after=')),
    stdout: ran.stdout,
  };
}

test('PASTED INTO POWERSHELL 5.1, THE NAMED LINE REACHES claude WITH THE PROFILE, EVERY ARGUMENT AND THE --, AND HANDS THE SHELL BACK ITS OWN', { skip: process.platform !== 'win32' }, () => {
  const lines = byHand([named], home, 'PowerShell');
  const ran = inPowerShell(lines, WAS);
  assert.deepEqual(ran.dirs, [named], ran.stdout);
  assert.deepEqual(ran.args, ARGS, ran.stdout);
  /*
   * RESTORED, NOT REMOVED. A shell may already hold `CLAUDE_CONFIG_DIR` (one measured sat in
   * `.ccenv\profiles\studio`), and a line that finished with `Remove-Item` left it unset, so every later `claude` in
   * that window ran in `~/.claude`. Where it was unset, it is left unset.
   */
  assert.equal(ran.after, `after=${WAS}|set=True`, ran.stdout);
  assert.equal(inPowerShell(lines, null).after, 'after=|set=False');
});

test('A CURLY APOSTROPHE IN THE PROFILE IS DOUBLED TOO, because PowerShell ends a single-quoted string on it', { skip: process.platform !== 'win32' }, () => {
  /*
   * PowerShell treats U+2018, U+2019, U+201A and U+201B as `'`. Doubling only the ASCII one, the line for a folder
   * named `prof’s` was a ParserError, "The string is missing the terminator", and nothing after it ran, the restore
   * included.
   */
  const curly = join(home, '.claude-prof\u2019s \u2018x\u2019');
  const ran = inPowerShell(byHand([curly], home, 'PowerShell'), WAS);
  assert.deepEqual(ran.dirs, [curly], ran.stdout);
  assert.deepEqual(ran.args, ARGS, ran.stdout);
  assert.equal(ran.after, `after=${WAS}|set=True`, ran.stdout);
});

test('THE DEFAULT PROFILE IS REACHED FROM A SHELL THAT SITS IN ANOTHER: CLAUDE_CONFIG_DIR is cleared for the one call and put back after', { skip: process.platform !== 'win32' }, () => {
  /*
   * The bare line went to whichever profile the shell was in, so `--config-dir ~/.claude` pasted into such a window
   * registered the server in the studio profile. Claude Code keeps the default profile's servers in `~/.claude.json`
   * only when the variable is unset, so unset is the one value that names it.
   */
  const lines = byHand([join(home, '.claude')], home, 'PowerShell');
  const ran = inPowerShell(lines, WAS);
  assert.deepEqual(ran.dirs, [''], ran.stdout);
  assert.deepEqual(ran.args, ARGS, ran.stdout);
  assert.equal(ran.after, `after=${WAS}|set=True`, ran.stdout);
});

/*
 * BASH ONLY WHERE IT REACHES THE STAND-IN, or the test below would pass without testing anything: a bash that cannot
 * run the stand-in at all never shows it running. This machine's PATH carries three `bash.exe`, Git's first, then
 * `System32` (the WSL launcher) and `WindowsApps`, so which one answers depends on the PATH, and the probe asks it.
 */
function bashReaching(bin: string): string | false {
  const probe = spawnSync('bash', ['-c', 'claude probe'], { env: withBin(bin), encoding: 'utf8', timeout: 30_000 });
  if (probe.error) return 'no bash on the PATH';
  return probe.stdout.includes('arg=probe') ? false : `the bash on the PATH does not reach a stand-in on it (${probe.stdout}${probe.stderr})`.trim();
}

test('THE POWERSHELL LINES PASTED INTO GIT BASH RUN NOTHING, so a line printed for the wrong shell fails closed', (t) => {
  /*
   * MEASURED BEFORE THIS TEST EXISTED: bash ran each `;` statement of the PowerShell
   * line, the two assignments failed with "=: command not found", and `claude mcp add` then ran in whatever profile
   * the shell was in, the client one for a line that named another and for the line that meant `~/.claude`.
   */
  const dir = mkdtempSync(join(scratch, 'bash-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'claude'), '#!/bin/sh\nprintf "dir=%s\\n" "${CLAUDE_CONFIG_DIR-}"\nfor a in "$@"; do printf "arg=%s\\n" "$a"; done\n', { mode: 0o755 });
  const skip = bashReaching(join(dir, 'bin'));
  if (skip) return t.skip(skip);
  for (const line of byHand([named, join(home, '.claude')], home, 'PowerShell')) {
    const ran = spawnSync('bash', ['-c', line], { env: { ...withBin(join(dir, 'bin')), CLAUDE_CONFIG_DIR: WAS }, encoding: 'utf8', timeout: 30_000 });
    assert.ok(!ran.stdout.includes('arg=mcp'), `the stand-in ran for ${line}\n${ran.stdout}\n${ran.stderr}`);
    assert.notEqual(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  }
});

test('AND THE sh LINES PASTED INTO POWERSHELL 5.1 RUN NOTHING, since the shell is told from the environment and can be told wrong', { skip: process.platform !== 'win32' }, () => {
  /*
   * The shell is read from the environment and can be read wrong, so a PowerShell handed the `sh` form must still run nothing. Each line is
   * its own script, because a `ParserError` in one file refuses the whole file and would hide what the other did.
   */
  const dir = mkdtempSync(join(scratch, 'ps-sh-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'claude.ps1'), 'Write-Output "dir=$env:CLAUDE_CONFIG_DIR"\r\nforeach ($a in $args) { Write-Output "arg=$a" }\r\n');
  byHand([named, join(home, '.claude')], home, 'Git Bash').forEach((line, i) => {
    const file = join(dir, `line-${i}.ps1`);
    writeFileSync(file, `﻿${line}\r\n`);
    const ran = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { env: withBin(join(dir, 'bin')), encoding: 'utf8', timeout: 60_000 });
    assert.ok(!ran.stdout.includes('arg=mcp'), `the stand-in ran for ${line}\n${ran.stdout}\n${ran.stderr}`);
    assert.ok(/not recognized|Missing closing|missing the terminator/.test(ran.stdout + ran.stderr), `${ran.stdout}\n${ran.stderr}`);
  });
});

/* Git Bash on Windows, sh anywhere else: skipped only where no `sh` answers at all. */
const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0;

test('PASTED INTO sh, BOTH LINES REACH claude WITH THE PROFILE THEY NAME AND EVERY ARGUMENT', { skip: !hasSh }, () => {
  const dir = mkdtempSync(join(scratch, 'sh-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'claude'), '#!/bin/sh\nprintf "dir=%s\\n" "${CLAUDE_CONFIG_DIR-}"\nfor a in "$@"; do printf "arg=%s\\n" "$a"; done\n', { mode: 0o755 });
  const lines = byHand([named, join(home, '.claude')], home, 'Git Bash');
  const script = [`CLAUDE_CONFIG_DIR='${WAS}'`, 'export CLAUDE_CONFIG_DIR', ...lines, 'printf "after=%s\\n" "$CLAUDE_CONFIG_DIR"', ''].join('\n');
  const ran = spawnSync('sh', ['-c', script], { env: withBin(join(dir, 'bin')), encoding: 'utf8', timeout: 30_000 });
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  const out = ran.stdout.split('\n');
  assert.deepEqual(out.filter((l) => l.startsWith('dir=')), [`dir=${named}`, 'dir='], ran.stdout);
  assert.deepEqual(out.filter((l) => l.startsWith('arg=')).map((l) => l.slice(4)), [...ARGS, ...ARGS], ran.stdout);
  assert.ok(out.includes(`after=${WAS}`), ran.stdout);
});
