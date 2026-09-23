/**
 * The hand-run line `braindog install` prints for a profile left without BrainDog's server, run in the shell it is
 * printed for: finding 1 of `loop/research-batch-forty-four-audit.md`.
 *
 * MEASURED BEFORE THIS EXISTED, at e4326ea6. The line was `sh` on every platform, `CLAUDE_CONFIG_DIR='<dir>' claude
 * mcp add-json braindog '<json>' --scope user`, and Sam runs install on Windows. Windows PowerShell 5.1 read the
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

import { byHand } from '../src/install.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = join(APP, 'src', 'main.ts').replaceAll('\\', '/');
/* What `claude` must be handed, argument for argument, for the entry `install --replace` writes. */
const ARGS = ['mcp', 'add', '--scope', 'user', 'braindog', '--', 'node', MAIN, 'mcp', '--agent', 'claude'];

const scratch = mkdtempSync(join(tmpdir(), 'braindog-hand-line-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const home = join(scratch, 'home');
/* A space and an apostrophe, the two characters each shell's quoting has to survive. */
const named = join(home, ".claude-en core's");
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

test('ON WIN32 A NAMED PROFILE IS NAMED THE WAY POWERSHELL SETS A VARIABLE, with no inline JSON and the apostrophe doubled', () => {
  const [line = ''] = byHand([named], home, 'win32');
  assert.ok(line.startsWith('$braindogWas = $env:CLAUDE_CONFIG_DIR; $env:CLAUDE_CONFIG_DIR = '), line);
  assert.ok(line.includes(`'${named.replaceAll("'", "''")}'`), line);
  assert.ok(!line.includes("'{") && !line.includes('add-json'), line);
  assert.ok(line.endsWith('; $env:CLAUDE_CONFIG_DIR = $braindogWas'), line);
});

test('ELSEWHERE THE LINE STAYS sh, with the apostrophe closed and reopened, and no inline JSON either', () => {
  const [line = ''] = byHand([named], home, 'linux');
  assert.ok(line.startsWith(`CLAUDE_CONFIG_DIR='${named.replaceAll("'", "'\\''")}' claude mcp add --scope user braindog -- node `), line);
  assert.ok(!line.includes("'{") && !line.includes('add-json'), line);
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
  const lines = byHand([named], home, 'win32');
  const ran = inPowerShell(lines, WAS);
  assert.deepEqual(ran.dirs, [named], ran.stdout);
  assert.deepEqual(ran.args, ARGS, ran.stdout);
  /*
   * RESTORED, NOT REMOVED. His shell already holds `CLAUDE_CONFIG_DIR` (the audit's session sat in
   * `.ccenv\profiles\quartz`), and a line that finished with `Remove-Item` left it unset, so every later `claude` in
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
  const ran = inPowerShell(byHand([curly], home, 'win32'), WAS);
  assert.deepEqual(ran.dirs, [curly], ran.stdout);
  assert.deepEqual(ran.args, ARGS, ran.stdout);
  assert.equal(ran.after, `after=${WAS}|set=True`, ran.stdout);
});

test('THE DEFAULT PROFILE IS REACHED FROM A SHELL THAT SITS IN ANOTHER: CLAUDE_CONFIG_DIR is cleared for the one call and put back after', { skip: process.platform !== 'win32' }, () => {
  /*
   * The bare line went to whichever profile the shell was in, so `--config-dir ~/.claude` pasted into his window
   * registered the server in the quartz profile. Claude Code keeps the default profile's servers in `~/.claude.json`
   * only when the variable is unset, so unset is the one value that names it.
   */
  const lines = byHand([join(home, '.claude')], home, 'win32');
  const ran = inPowerShell(lines, WAS);
  assert.deepEqual(ran.dirs, [''], ran.stdout);
  assert.deepEqual(ran.args, ARGS, ran.stdout);
  assert.equal(ran.after, `after=${WAS}|set=True`, ran.stdout);
});

/* Git Bash on Windows, sh anywhere else: skipped only where no `sh` answers at all. */
const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0;

test('PASTED INTO sh, BOTH LINES REACH claude WITH THE PROFILE THEY NAME AND EVERY ARGUMENT', { skip: !hasSh }, () => {
  const dir = mkdtempSync(join(scratch, 'sh-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'claude'), '#!/bin/sh\nprintf "dir=%s\\n" "${CLAUDE_CONFIG_DIR-}"\nfor a in "$@"; do printf "arg=%s\\n" "$a"; done\n', { mode: 0o755 });
  const lines = byHand([named, join(home, '.claude')], home, 'linux');
  const script = [`CLAUDE_CONFIG_DIR='${WAS}'`, 'export CLAUDE_CONFIG_DIR', ...lines, 'printf "after=%s\\n" "$CLAUDE_CONFIG_DIR"', ''].join('\n');
  const ran = spawnSync('sh', ['-c', script], { env: withBin(join(dir, 'bin')), encoding: 'utf8', timeout: 30_000 });
  assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
  const out = ran.stdout.split('\n');
  assert.deepEqual(out.filter((l) => l.startsWith('dir=')), [`dir=${named}`, 'dir='], ran.stdout);
  assert.deepEqual(out.filter((l) => l.startsWith('arg=')).map((l) => l.slice(4)), [...ARGS, ...ARGS], ran.stdout);
  assert.ok(out.includes(`after=${WAS}`), ran.stdout);
});
