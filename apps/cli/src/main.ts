#!/usr/bin/env node
/**
 * `braindog`, the command on an agent's machine.
 *
 * THE WHOLE AGENT PATH IS BUILT: `mcp`, the stdio server Claude Code launches, `hook` and `install`,
 * the session hooks, `login` and `logout`, the device grant and its other half, `keys` and `run`, the
 * key doors, `skills` and `tools`, the sync and the scan, and `session` and `context`, the handoff and
 * the card from a shell. There is no longer a list of commands that name themselves and do nothing:
 * a word this command does not know is a typo, and it says so.
 *
 * `setup` IS THE ONE LINE A NEW MACHINE NEEDS (`setup.ts`): it runs `login`, `install`, the MCP registration,
 * `tools write` and `skills sync` in order, each of them still a command of its own. `runner` runs the jobs the
 * record hands this machine, and lives in `runner.ts`.
 *
 * `init` AND `serve` BELONG TO THE SELF-HOST, which has no `bin` of its own and whose messages tell
 * people to run `braindog init` and `braindog serve`. This command claims the name and hands those two
 * to the self-host's entry in a child process (`docs/48-SPEC-CLI.md` §5.14). Apps never import each
 * other, so it is spawned, never imported.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { homedir, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';
import { PRIMITIVES_VERSION } from 'braindog-render';

import { forTerminal } from './clip.ts';
import { automations, scripts } from './automations.ts';
import { bypassCommand, systemOpen } from './bypass.ts';
import { behindLine, doctorLine, installedBuild } from './behind.ts';
import { serveBridge, SIGNAL_EXIT_MS } from './bridge.ts';
import { exportFile, importFile } from './brainfile.ts';
import { mark } from './hook-trace.ts';
import { HOOK_MS, heldHere, hookBudget, hookEnd, hookStart, hookWork, parentOf, unreachable } from './hooks.ts';
import { hookBeat } from './beat.ts';
import { codexSession, INBOX_ENTRY, notifyHook, runHook, watchHook } from './inbox-file.ts';
import { statusline, statusOut } from './statusline.ts';
import { readBeat, sendBeat } from './statusline-beat.ts';
import { STATUSLINE_FILE } from './statusline-place.ts';
import { agentOf, budgetOf, clientFor, hostsPath, runnerTarget, target, type Target } from './http.ts';
import { byHand, handRun, installProfiles, profilesOf, readReplace, replaceByHand, shellOf, type Replace } from './install.ts';
import { machine, takeJson, type Machine } from './json.ts';
import { keys, spawnInherit } from './keys.ts';
import { lapseWarning, login } from './login.ts';
import { logout } from './logout.ts';
import { openSessions, openSessionsLine } from './open-sessions.ts';
import { page as pageCommand } from './page.ts';
import { peopleCommand } from './people.ts';
import { privateTermsCommand } from './private-terms.ts';
import { understandCommand } from './understand.ts';
import { signsCommand } from './signs.ts';
import { AGENTS, cliBuild, hostSessionOf, isAgent, positionOf, sessionHeaders, type ClientInfo } from './position.ts';
import { watchInstalled } from './installed-build.ts';
import { context } from './context.ts';
import { doctor } from './doctor.ts';
import { envCommand } from './env.ts';
import { envApply } from './env-apply.ts';
import { session } from './session.ts';
import { skills } from './skills.ts';
import { SYNC_VERBS, syncCommand } from './sync.ts';
import { syncJoin, syncRetire } from './sync-join.ts';
import { syncPatches } from './sync-patches.ts';
import { syncDrill, syncPull } from './sync-pull.ts';
import { logLine, startPush, syncPush } from './sync-push.ts';
import { sealedSeen, type SyncIo } from './sync-record.ts';
import { afterHello, startFromServer } from './session-start.ts';
import { signedOutFix, signedOutSurface } from './signed-out.ts';
import { serveStdio } from './stdio.ts';
import { surfaceOver } from './surface.ts';
import { runner } from './runner.ts';
import { service } from './runner-service.ts';
import { agentTokenFromKey, setup } from './setup.ts';
import { tools } from './tools.ts';
import { tokenCommand } from './token.ts';
import { update } from './update.ts';
import { verify } from './verify.ts';

/* Synchronous, so the line is out before `exit`: a write to a pipe on Windows is asynchronous, and
   `process.exit` does not wait for it. */
const say = (line: string) => writeFileSync(2, `${forTerminal(line)}\n`);

/* NODE'S "SQLite is an experimental feature" IS NOT SAID TO A PERSON. `usecase`, `pack`, `kennel` and
   `import` load `node:sqlite` for a scratch record and printed two lines of it, with a process id, above their answer.
   Every other warning is still printed as Node prints it. Set here, before any command loads the module by import(). */
{
  const printed = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (w) => {
    if (w.name === 'ExperimentalWarning' && /SQLite/u.test(w.message)) return;
    for (const l of printed) l(w);
  });
}

/**
 * The session headers a command in this folder sends to a host: where it stands, and the run its session's file names
 * only while that run is the caller's (`heldHere`), read per request because the start hook may write the file after
 * the command began. The host session's id and `CLAUDECODE` come from this process's environment, and a subagent's
 * parent run from its window's file (`parentOf`).
 */
const headersHere = async (cwd: string, host: string): Promise<Record<string, string>> =>
  sessionHeaders(await positionOf(cwd), undefined, heldHere(process.env, cwd, host), { env: process.env, parent: parentOf(process.env, host) });

/**
 * The folder the two hook shims are in, which is what `install` and `setup` write into Claude Code's settings.
 *
 * IN A CHECKOUT IT IS `hooks/` BESIDE `src/`. THE PUBLISHED CLI IS ONE FILE, and `install.ps1` and `install.sh` put
 * nothing beside it, so `../hooks/` named a folder no machine had: `braindog setup` once wrote both hooks
 * into three profiles pointing at `~/.braindog/hooks/braindog-hook.ps1`, which did not exist, and every session would
 * have started without its context. So the bundle writes its own shims beside itself, each running this file.
 *
 * AND THE HOOKS' OWN ENTRY BESIDE THEM (`INBOX_ENTRY`): the inbox reader alone, which the bundle carries as
 * `__INBOX_HOOK__` (`scripts/bundle.mjs`), so the prompt, tool and stop hooks and Codex's turn end start Node on a few
 * kilobytes rather than the whole command. Every shim also keeps Node's compile cache, as the checkout's do.
 */
declare const __INBOX_HOOK__: string;
declare const __STATUSLINE_ENTRY__: string;

function hookScripts(): string {
  const checkout = fileURLToPath(new URL('../hooks/', import.meta.url));
  if (existsSync(join(checkout, 'braindog-hook.ps1'))) return checkout;
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'hooks');
  mkdirSync(dir, { recursive: true });
  const inbox = typeof __INBOX_HOOK__ === 'string' && __INBOX_HOOK__ !== '';
  if (inbox) writeFileSync(join(dir, INBOX_ENTRY), __INBOX_HOOK__);
  /* THE STATUS LINE'S OWN ENTRY, for the same reason (`statusline-entry.ts`). */
  if (typeof __STATUSLINE_ENTRY__ === 'string' && __STATUSLINE_ENTRY__ !== '') writeFileSync(join(dir, STATUSLINE_FILE), __STATUSLINE_ENTRY__);
  /* THE INBOX READER, or the whole command for a bundle built before it carried one. */
  const reader = inbox ? `"$dir/${INBOX_ENTRY}"` : '"$dir/../braindog.mjs" hook';
  const readerPs = inbox ? `(Join-Path $PSScriptRoot '${INBOX_ENTRY}')` : '$cli hook';
  const ps1 = [
    "param([string]$Which = 'start')",
    '$OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::OutputEncoding = $OutputEncoding',
    "$cli = Join-Path $PSScriptRoot '..\\braindog.mjs'",
    "$env:BRAINDOG_AGENT = 'claude'",
    "if (-not $env:NODE_COMPILE_CACHE) { $env:NODE_COMPILE_CACHE = Join-Path $env:USERPROFILE '.braindog\\cache\\node' }",
    'try {',
    '  $raw = [Console]::In.ReadToEnd()',
    "  if (@('prompt', 'tool', 'stop') -contains $Which) {",
    "    $m = [regex]::Match($raw, '\"session_id\"\\s*:\\s*\"([A-Za-z0-9._:-]+)\"')",
    '    if (-not $m.Success) { exit 0 }',
    "    $id = $m.Groups[1].Value -replace '[^A-Za-z0-9_-]', '_'",
    "    $base = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } elseif ($env:APPDATA) { $env:APPDATA } else { Join-Path $env:USERPROFILE '.config' }",
    '    $flags = Join-Path $base "braindog\\sessions\\$id.inbox.flags"',
    '    if (-not (Test-Path -LiteralPath $flags)) { exit 0 }',
    "    if ((([System.IO.File]::ReadAllText($flags)) -split '\\s+') -notcontains $Which) { exit 0 }",
    `    try { $raw | & node ${readerPs} $Which } catch { }`,
    '    exit 0',
    '  }',
    "  if ($Which -eq 'watch') {",
    `    $raw | & node ${readerPs} watch`,
    '    exit $LASTEXITCODE',
    '  }',
    "  if ($Which -eq 'beat') {",
    "    $id = '-'",
    "    $m = [regex]::Match($raw, '\"session_id\"\\s*:\\s*\"([A-Za-z0-9._:-]+)\"')",
    "    if ($m.Success) { $id = $m.Groups[1].Value -replace '[^A-Za-z0-9_-]', '_' }",
    "    $stamp = Join-Path (Join-Path $env:USERPROFILE '.braindog\\beats') $id",
    "    if ((Test-Path -LiteralPath $stamp) -and (Get-Item -LiteralPath $stamp).LastWriteTime -gt (Get-Date).AddMinutes(-5)) { exit 0 }",
    '    try { $raw | & node $cli hook beat | Out-Null } catch { }',
    '    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stamp) | Out-Null',
    "    [System.IO.File]::WriteAllText($stamp, (Get-Date).ToString('o'))",
    '    exit 0',
    '  }',
    '  $raw | & node $cli hook $Which',
    '} catch {',
    "  if ($Which -eq 'start') { 'BrainDog could not start; this session works without shared context.' }",
    '}',
    'exit 0',
  ];
  /* THE SAME STEPS AS THE CHECKOUT'S `hooks/braindog-hook.sh`, whose comments say why each is there. */
  const sh = [
    '#!/bin/sh',
    'which="${1:-start}"',
    'case "$0" in */*) dir=${0%/*} ;; *) dir=. ;; esac',
    'BRAINDOG_AGENT=claude',
    'export BRAINDOG_AGENT',
    'NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-$HOME/.braindog/cache/node}"',
    'export NODE_COMPILE_CACHE',
    'session_id() {',
    '  after=${raw#*\\"session_id\\"}',
    '  [ "$after" = "$raw" ] && return',
    '  gap=${after%%\\"*}',
    `  case "$gap" in *[!\\ :]* | '') return ;; esac`,
    '  rest=${after#*\\"}',
    '  id=${rest%%\\"*}',
    `  case "$id" in '' | *[!A-Za-z0-9._:-]*) id='' ;; *[.:]*) id=$(printf '%s' "$id" | tr '.:' '__') ;; esac`,
    '}',
    'case "$which" in',
    '  prompt | tool | stop)',
    '    raw=$(cat)',
    "    id=''",
    '    session_id',
    '    [ -n "$id" ] || exit 0',
    /* Where the CLI keeps sessions: XDG, else Windows' APPDATA (Git Bash runs this there), else ~/.config. */
    '    cfg="${XDG_CONFIG_HOME:-}"',
    '    [ -z "$cfg" ] && [ -n "${APPDATA:-}" ] && cfg=$(cygpath -u "$APPDATA" 2>/dev/null || printf %s "$APPDATA")',
    '    cfg="${cfg:-$HOME/.config}"',
    '    flags="$cfg/braindog/sessions/${id}.inbox.flags"',
    "    words=''",
    '    [ -f "$flags" ] && IFS= read -r words < "$flags"',
    '    case " $words " in *" $which "*) ;; *) exit 0 ;; esac',
    '    ready="$cfg/braindog/sessions/${id}.inbox.${which}.ready"',
    '    if [ -f "$ready" ] && [ -n "$(find "$ready" -mmin -2 2>/dev/null)" ]; then',
    '      case "$which:$raw" in',
    `        stop:*'"agent_id"'* | stop:*'"stop_hook_active":true'* | stop:*'"stop_hook_active": true'* | tool:*'"mcp_server"'*) ready='' ;;`,
    '      esac',
    '      if [ "$which" = tool ] && [ -n "$ready" ]; then',
    '        after=${raw#*\\"tool_name\\"}',
    '        rest=${after#*\\"}',
    '        tool=${rest%%\\"*}',
    `        [ "$after" = "$raw" ] && tool=''`,
    `        case "$tool" in mcp__braindog__* | mcp__plugin_*_braindog__* | ToolSearch) exit 0 ;; '') ready='' ;; esac`,
    '      fi',
    '      if [ -n "$ready" ]; then',
    '        cat "$ready"',
    '        if [ "$which" != tool ]; then',
    '          mv -f "$ready.state" "${ready%.inbox.*}.hooks.json" 2>/dev/null',
    '          mv -f "$ready.flags" "$flags" 2>/dev/null',
    '          rm -f "$ready"',
    '        fi',
    '        exit 0',
    '      fi',
    '    fi',
    `    printf '%s' "$raw" | node ${reader} "$which" 2>/dev/null`,
    '    exit 0',
    '    ;;',
    '  watch)',
    `    node ${reader} watch`,
    '    exit $?',
    '    ;;',
    'esac',
    'if [ "$which" = beat ]; then',
    '  raw=$(cat)',
    "  id=''",
    '  session_id',
    '  stamp="${HOME}/.braindog/beats/${id:--}"',
    `  [ -n "$(find "$stamp" -mmin -5 2>/dev/null)" ] && exit 0`,
    `  printf '%s' "$raw" | node "$dir/../braindog.mjs" hook beat >/dev/null 2>&1`,
    '  mkdir -p "${HOME}/.braindog/beats" 2>/dev/null && touch "$stamp" 2>/dev/null',
    '  exit 0',
    'fi',
    'if ! node "$dir/../braindog.mjs" hook "$which"; then',
    "  [ \"$which\" = start ] && printf 'BrainDog could not start; this session works without shared context.\\n'",
    'fi',
    'exit 0',
  ];
  writeFileSync(join(dir, 'braindog-hook.ps1'), ps1.join('\r\n') + '\r\n');
  writeFileSync(join(dir, 'braindog-hook.sh'), sh.join('\n') + '\n', { mode: 0o755 });
  return dir;
}

/**
 * The `--json` sinks for this run, or `null` in human mode. Set once by the dispatch at the bottom,
 * before any command is called, and read by everything that can end the process.
 *
 * ONE VARIABLE RATHER THAN AN ARGUMENT THREADED THROUGH EVERY WRAPPER, because `stop()` is the reason
 * it exists: a bad argument or an unknown host must still be one document on stdout, and `stop` is
 * called from six places that have no idea which command asked for it.
 */
let json: Machine | null = null;

const stop = (line: string): never => {
  (json ? json.say : say)(line);
  if (json) emit(json.envelope(1));
  return process.exit(1);
};

/**
 * THE APP HAS NO VERSION OF ITS OWN, and inventing one would create the second version number
 * `52 §5.6` exists to prevent. The build is a date and a commit, put here by `48 §3`'s bundler; run
 * from a checkout there is no bundle and no commit, and it says so. The other three numbers are the
 * ones a host and a file can disagree with this build about, which is the question a person asking
 * for a version has.
 */
declare const __BUILD__: string;
const build = (): string => (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev+0000000');
const version = (): string => `app ${build()} · format ${FORMAT_VERSION} · kernel ${KERNEL_MIGRATION} · primitives ${PRIMITIVES_VERSION}`;

/**
 * The one document `--json` prints, written synchronously for the same reason `say` is: a write to a
 * pipe on Windows is asynchronous and `process.exit` does not wait for it.
 */
const emit = (envelope: unknown): void => writeFileSync(1, `${JSON.stringify(envelope)}\n`);

/** What `--json` is, said the same at the foot of `--help` and of the whole usage. */
const JSON_LINE =
  '--json answers with one JSON document on stdout and moves every other line to stderr. mcp, keys exec, keys headers, keys helper, run, hook, setup, env apply, the sync verbs but inventory, starter preview, addon preview, addon dev, init and serve do not take it.';

const fullUsage = () =>
  [
    'braindog setup <host> [--dry-run | --yes] [--only <app>] [--profile <folder>] [--statusline]',
    "  Set this machine up from one BrainDog, in order: sign in unless it already is, add the hooks to Claude Code's settings, register the braindog MCP server, write the tools your BrainDog applies everywhere, sync its skills, and make one token for each agent it wired, each approved in the app. One line per step, and it stops at the first that fails.",
    'braindog login <host> [--keychain <project|*>]',
    '  Sign this machine in. It prints six digits to approve in the app, and keeps the token in the hosts file.',
    '  With --keychain it asks for keychain access that opens the keys of one project, or with * the keys of no project.',
    'braindog logout [<host>] [--host <host>]',
    "  Remove this machine's token, runner token and keychain access for one host from the hosts file. Nothing is sent, and the host is not told.",
    'braindog bypass on|off [--host <host>]',
    '  Open Settings > Agents at "Let your agents do everything without asking", for you to turn it on or off there. Only you, signed in to BrainDog, can change it, so an agent on this machine cannot turn it on for itself. Even on, keys, paying, your team, the owner and deleting or exporting all of BrainDog stay yours.',
    'braindog keys list [--project <name>] [--everywhere] [--json] [--host <host>]',
    '  The keys your BrainDog holds, one line each: what each opens, where it applies, whether it is sealed, and the day it expires. Never a value.',
    'braindog keys put <label> [--opens <what>] [--kind <kind>] [--everywhere] [--file] [--keychain <project>] [--host <host>]',
    '  Deposit a key. Pipe its value in on standard input, or run it at a terminal and paste or type the value when asked: nothing you type is shown. The host seals it, and it is never an argument. It is kept for this session\'s project; --everywhere keeps it for every project, which a script needs.',
    'braindog keys put --from <file or folder> [--project <name>] [--opens <what>] [--kind <kind>] [--dry-run] [--host <host>]',
    '  Seal every key in a file of NAME=value lines, or a folder of one key a file, asking you about each on the terminal first. Names are printed, never a value.',
    'braindog keys scan [<folder>] [--project <name>] [--deposit] [--ask] [--host <host>]',
    '  Name every key lying in a repository\'s files (.env, .secrets, .pem) and the file it lies in, and the command that seals them. It sends nothing unless --deposit.',
    'braindog keys exec <label | credentials#n> [--as <ENV_NAME>] [--keychain <project>] [--host <host>] -- <command> [args...]',
    '  Run the command with the key in one environment variable, named from the label unless --as names it. It is never printed.',
    'braindog run <label | credentials#n> [--as <ENV_NAME>] [--keychain <project>] [--host <host>] -- <command> [args...]',
    '  The same as keys exec, under a shorter name.',
    'braindog keys headers <credentials#n | label> --as <Header> [--keychain <project>] [--host <host>]',
    "  Print the key as one header, {\"<Header>\":\"<value>\"}, for a program that reads it, such as Claude Code's headersHelper. It refuses to print to a terminal.",
    'braindog keys helper <credentials#n | label> [--keychain <project>] [--host <host>]',
    "  Print the key alone, for Claude Code's apiKeyHelper in a profile that runs on an API key. It refuses to print to a terminal, as keys headers does.",
    'braindog skills sync [--host <host>] [--dry-run] [--yes]',
    "  Keep this machine's skills in step with a BrainDog you own: write its skills where Claude Code reads them, keep a local edit and propose it, and register a skill kept by hand. The first time, it says what it would copy each way and asks; the yes is kept, and from then on each session's start does the same. Nothing is copied before that yes.",
    'braindog skills off [--host <host>]',
    "  Take the yes back: no session copies this machine's skills or records its MCP servers for that BrainDog.",
    'braindog tools scan [--host <host>] [--dry-run]',
    '  Record the MCP servers in .mcp.json and ~/.claude.json. A key found there is deposited, and only its name is recorded.',
    'braindog tools write [--scope user|project] [--dry-run]',
    "  Show the Claude Code entries your BrainDog's tools become, and apply one scope only when it is named. No entry holds a key.",
    'braindog session show|next <text>|tried <text>|note <text>|end [--state idle|handoff|done] [--next <text>]',
    '  Address the run this folder is in: read where it stands, leave a next step, a thing tried or a note, or end it.',
    'braindog context [--host <host>]',
    '  Print the card again: this run and where it stands, the next step, what waits on a person, what was learned here, and what else there is to ask for.',
    'braindog page pull <slug> [--host <host>] [--out <file>]',
    "  Fetch a page's declaration and write it as <page>.dog: one page, one file, in the source view's dialect.",
    'braindog page push <file> [--wait [<time>]] [--host <host>]',
    "  Read a .dog file and ask for it to be set as the page: one question on Decide, whose number it prints, and nothing changes until it is accepted there. The same file pushed again is the same question. With --wait it holds until the question is answered, for 30 minutes or the time given (10m, at most 30m), and exits 0 when it is accepted, 1 when it is declined and 2 when it still waits.",
    'braindog page check <file>',
    '  Validate a .dog file against the authoring grammar, locally. Nothing is sent.',
    'braindog starter list [--host <host>]',
    '  Say the starters on this BrainDog, the one speaking, and the ones on offer. A read.',
    'braindog starter export [--out <file>] [--title <title>] [--version <x.y.z>] [--example <list>:<n>,<n>] [--host <host>]',
    "  Save this BrainDog's arrangement as a starter file: its plugins, lists, pages, voice and labels, and only the rows named.",
    'braindog starter check <file>',
    '  Read a starter file the way BrainDog will, locally: its size, any credential, its shape and its block kinds. Nothing is sent.',
    'braindog starter install <id|file|url> [--from <catalogue>] [--version <x.y.z>] [--host <host>]',
    '  Ask the owner to install a starter on offer, a shared one, or one from a catalogue held to its checksum: files a proposal and prints its link on Decide. Nothing is installed until they accept it.',
    'braindog starter new <id> [--title <title>] [--author <name>] [--out <file>] [--yaml]',
    '  Write a first starter file, one list and a page over it, that already reads the way BrainDog will read it.',
    'braindog starter diff <earlier file> <later file>',
    '  Say what moved between two versions of a starter, and the least version bump that needs. Nothing is sent.',
    'braindog starter publish <file> --to <folder> | --kennel [host] [--sign <key file>]',
    '  Add a version to a catalogue folder, or submit it to the Kennel: never one already there, never an earlier one, and a major when it takes something away.',
    'braindog starter yank <id> <version> --reason <why> [--kennel host] [--sign <key file>]',
    '  Take a version back on the Kennel. It is never offered again, and a BrainDog holding it is told why.',
    'braindog starter search [words] [--from <folder|address> | --kennel [host]]',
    '  List what a catalogue holds, the Kennel when no --from is named, with what each can reach and call out to. Nothing is sent to a BrainDog.',
    'braindog starter preview <file> [--port <n>]',
    '  Start a scratch BrainDog on this machine with the file in its catalogue, to install and look at. Removed when it stops.',
    'braindog addon new <id> [--title <title>] [--author <name>] [--out <folder>] [--yaml] [--from-page <file.dog>]',
    '  Write a starting plugin folder: its .pack.json (or .pack.yaml), a first page over a first list with two example rows, its test and a README.',
    'braindog addon check <file|dir>',
    '  Read a plugin, JSON or YAML, warn on any key its manifest does not take, and install it in a scratch BrainDog here, saying every refusal BrainDog would give. Nothing is sent.',
    'braindog addon test <dir>',
    '  Install the plugin in a scratch BrainDog, write the rows in its <id>.test.json and say each expectation as passed or failed. Nothing is sent.',
    'braindog addon preview <file|dir> [--port <n>]',
    '  Start a scratch BrainDog on this machine with the plugin in its catalogue, and print its page. Removed when it stops.',
    'braindog addon dev <dir> [--port <n>]',
    '  Start a scratch BrainDog with the plugin installed and watch its folder: each save of the file or a .js script is checked and installed again, with what changed or why it was refused. Removed when it stops.',
    'braindog addon diff|search|install|yank <...>',
    '  The same as for a starter: diff <a> <b>, search [words] [--from <catalogue> | --kennel [host]], install <id|file> [--from <catalogue>], yank <id> <version> --reason <why>.',
    'braindog addon install <file> --force | braindog addon uninstall <id> [--force]',
    '  --force on addon install or addon uninstall takes away a list that still holds items, keeping every one of them. It lifts that refusal only.',
    'braindog addon publish <file> --to <folder> | --kennel [host] [--sign <key file>]',
    '  Add a plugin version to a catalogue folder, or submit it to the Kennel and say whether it is listed or waits for review, signed with an author key or as the person signed in.',
    'braindog addon publish [<dir>] --github [--repo owner/name]',
    '  Push the folder to GitHub with your gh, tag v<version>, and print the git: line that installs it. A version already published is never moved.',
    'braindog kennel review [show|list|refuse <kind> <id> <version>] [--reason <why>] [--kennel <host>] | trust <publisher> [--probe]',
    "  The Kennel operator's review, with PROVISION_KEY set: what waits; show installs one in a scratch BrainDog and prints what it reaches and calls out to; list sends it with a preview of its pages; refuse says why; trust lists a publisher's files at once, and with --probe marks the nightly probe's key, the one publisher whose ids may begin probe-.",
    'braindog addon key <file> --author <name>',
    '  Make an author key in a file you choose, outside any repository. Keep it private: it signs what you publish.',
    'braindog addon key rotate <old key file> <new key file> --to <folder>',
    '  Name a new key as the successor of the old one in a catalogue, signed by the old key, so readers who trusted it trust the new one.',
    'braindog addon key revoke <key file> --to <folder> --reason <why> [--successor <key id>]',
    '  Mark a key as untrusted in a catalogue, signed by that key. Versions it signed are said as untrusted and not offered.',
    'braindog automations list [--all]|show <id> [--host <host>]',
    '  Say every automation you can read, what starts it and how its runs went; or one, with its last ten runs step by step.',
    'braindog automations run <id>|cancel <run> [--host <host>]',
    "  Start an automation now, or stop a run that has not finished. Only the owner may, so these work with a self-host's server key in BRAINDOG_TOKEN; a login or an agent's token is told to use the app.",
    'braindog actions run <name> [--host <host>]',
    '  Run a scheduled action now: its next turn moves to now. A paused or held action says why it will not run, and a second press inside a minute says how long to wait.',
    'braindog scripts list [--host <host>]',
    '  Say every script you can read: what starts it, whether it is paused, its last run and what it reads, writes and fetches.',
    'braindog scripts resume <id> [--host <host>]',
    "  Start a script paused by three refused runs in a row again. The owner's, as automations run is: a self-host's server key may, and a login or an agent's token is told to use the app.",
    'braindog export [--kek <id> | --redact-grants] [--sections <data,origin,governance>] [-o <file.brainl>] [--key <pubkey|url>] [--host <host>]',
    '  Take your BrainDog as a .brainl file and check it here. A backup carries the sealed bytes and names the key they are wrapped by; with --redact-grants it is a copy to share, and cannot put the keys back.',
    "  The owner approves the one export in the app, with six digits, unless BRAINDOG_TOKEN is the self-host's server key.",
    'braindog export --mirror <folder> [--host <host>]',
    '  Write all of your BrainDog into the folder as plain files a person can read and git can diff: one file for each thing a list holds. Only what changed is written, and it asks for no approval, so it can run every night.',
    'braindog export --shape [-o <file.shape.brainl>] [--host <host>]',
    "  Take a copy of your BrainDog's shape, with every word, number and date made up, to test on. The six digits are asked once, for a standing grant that takes shape copies and reads nothing else.",
    'braindog import <file.brainl> [--key <pubkey|url>] [--host <host>]',
    "  Check the file here, then put your BrainDog back from it, in place of everything it holds now. It takes only its own copy.",
    "  The owner approves the one import in the app, with six digits, unless BRAINDOG_TOKEN is the self-host's server key.",
    'braindog import <adapter> <export.json> [--setup <setup.json>] [--map <map.json>] [--catalogue <folder|address>] [--host <host>] [--dry-run] [--strict] [--yes] | --draft-setup | --since <day|last>',
    "  Move another tool's export into this BrainDog through its adapter: a pack id such as one in packs/, or the path of a module. Running it again updates what it added, and no key value is ever read.",
    'braindog import --map <map.json> <export.json> [--host <host>] [--dry-run] [--strict]',
    "  The same with no adapter: the map file says which list each part of the export goes to. --strict refuses the whole file when any part of it would not be read.",
    'braindog people harvest [--since <day>] [--whole-history] [--dry-run] [--host <host>]',
    "  Meet everybody with two or more commits in the repositories your projects list, by remote or folder, grouped by address, each with the project they worked in, at most 200 a run. Only commits since a repository joined its project count, and --whole-history counts every one. Repositories no project lists, bots, machines, coding agents and your own commits are left out, and nobody is met until People says which person is you. With --dry-run it prints who it would meet and sends nothing.",
    'braindog attach <file.html> [pictures...] --on <thing> [--title <title>] [--host <host>]',
    "  Put a page on a task, a project, a question or a decision, so it shows inside BrainDog where that thing shows. The pictures it names beside it go up with it. Attached again under the same title, it is the next version. It answers a receipt and the line that takes it back: braindog attach --undo <batch>.",
    'braindog today [add "<what it shows>" [--size small|wide|tall|large|full]] [--host <host>]',
    "  Say what Today opens on (what is late, due and waiting) and its widgets, or put one there made from your words: BrainDog's own rules first, the model only when they cannot. A sign-in that may not arrange Today puts it there as a draft for the owner to keep or throw away.",
    'braindog widget share <name> [--out <folder>] [--host <host>]',
    '  Make a plugin of one widget on Today: its file, a test and a README in a folder, with your own names turned into settings whoever installs it picks.',
    'braindog signs [--all] [--json] [--strict] [--host <host>]',
    "  Say your BrainDog's vital signs now: the ones that need a look, and a count of the rest (--all says each): whether arrivals are filed, numbers arrive, questions pile up on one cause, how old the oldest open question is, and whether runs end as they should. One read: it opens no run. A red sign still exits 0; --strict exits 2 on any red, for scripts.",
    'braindog tidy [--ask] [--json] [--host <host>]',
    "  Say what went stale on your BrainDog and the call that clears each, how many keys, tools and skills look like they belong to a project, and how many lessons two projects learned twice. Without --ask it only reads: it opens no run and files nothing. With --ask it puts each clean-up on Decide as one question for you to answer.",
    'braindog private-terms [--dry-run] [--host <host>]',
    "  Write your private list from your own BrainDog: your names, addresses and handles, the people you know by whole name, your machines and your accounts' digits and balances, into a file only you can read, which the public-clean check searches the repository for before a push. Lines you added stay, no term is ever printed, and the account the folder's repository is published under is left out. With --dry-run it counts and writes nothing.",
    'braindog understand [--dry-run] [--host <host>]',
    '  Say what your BrainDog would link and ask if it read what it already holds now: how many payments, runs and services of each kind, the first of those links, and its questions for Decide. It only reads, with or without --dry-run, and changes nothing.',
    'braindog feed propose <file> [--host <host>]',
    '  Ask on Decide for each live feed your setup file lists, built by the live feed plugin: where it calls and how often. Nothing is installed until you say yes there.',
    'braindog token create [--name <name>] [--scope <read|propose|write>] [--days <n>] [--inbox] [--host <host>]',
    "  Mint a token for an agent and print it once. It reads unless --scope names more, and with --inbox it may also read the money inbox.",
    "  The owner approves the one mint in the app, with six digits, unless BRAINDOG_TOKEN is the self-host's server key.",
    'braindog mcp [--agent claude|codex|cursor|other] [--host <host>] [--local]',
    "  Serve BrainDog to an agent over stdin and stdout, passing each message to the host's own server. The agent starts it. Under a self-host's server key in BRAINDOG_TOKEN the agent gets a token of its own, made from the key and kept, so it works as a run of its own and not as the owner. --local serves the tools this command holds instead of the host's server, for a host without one.",
    'braindog hook start|end|beat|prompt|tool|stop|watch|notify',
    '  What Claude Code runs when a session starts and ends, after each tool call, on each prompt, before each tool call and when a turn ends, with its event on standard input. Once a day the start hook also says when this command is older than the host needs; it never updates by itself. On a machine that has joined setup sync, end and the day\'s first start begin braindog sync push in the background and never wait for it. prompt adds what you told the run in BrainDog, tool denies every tool but BrainDog\'s while you have stopped or paused it, and stop holds a turn once while it owes you a reply; all three read only the file the MCP server keeps fresh. notify is what Codex runs when a turn ends: when the run has not taken something you told it, this machine shows one notice saying so.',
    'braindog statusline [--beat-only]',
    "  What Claude Code runs to draw its status line, with its status on standard input: one short line with the model, the folder's name, how much of the 5 hour and 7 day limits is used and when they reset. At most every five minutes it also sends those figures, by profile name and machine, to the Profiles plugin in the background; nothing waits on it, and nothing else leaves. --beat-only sends the same figures and prints nothing, for a status line of your own to pipe its status to.",
    'braindog install [--apply] [--replace <replace.json>] [--config-dir <folder>] [--settings <file>] [--mcp-json <file>] [--rewake]',
    "  Show the hooks it would add to Claude Code's settings (a profile folder, or one settings file such as a project's .claude/settings.local.json), and write them only with --apply. --rewake also adds the watcher that wakes an idle session when you tell it something, which is off unless typed. It also places BrainDog's Agent Skill in each profile's skills/braindog/. With --replace it also takes out the hooks, MCP servers and skills the replace file names as an old tool's, and says which, and from a .mcp.json only when it is named with --mcp-json and is outside any repository.",
    'braindog doctor [--replaced <replace.json>] [--under <folder>] [--config-dir <folder>] [--json]',
    "  Read this machine and list, by file and entry, what still names a tool BrainDog replaced, what holds something shaped like a key, and each profile missing BrainDog's server or a hook. It changes nothing and shows no value, and exits 1 when anything is listed.",
    'braindog env diff [--config-dir <folder>] [--host <host>] [--json]',
    "  Compare every Claude Code profile on this machine by name: its MCP servers, plugins, hook events and skills, with a short hash of each server's entry and of its CLAUDE.md, and your BrainDog's tools and skills when signed in. It changes nothing and shows no value, and exits 1 when anything differs.",
    'braindog env apply [--profile <name>] [--dry-run] [--yes-data] [--statusline] [--host <host>]',
    "  Do what setup does in every Claude Code profile on this machine, or the ones named: BrainDog's hooks and server, your BrainDog's tools and skills, and with the Profiles plugin what each profile is given and its rules in a marked block of its CLAUDE.md. Anything that runs a program is shown whole and asked y/N, then pinned; with no terminal, --yes-data writes the plain data alone.",
    'braindog env pins [--forget <name>] [--json]',
    '  List the programs approved on this machine, by name, profile, hash and day; --forget drops one, and it is asked about again the next time it is placed.',
    'braindog env check [--profile <name>] [--json]',
    "  Run claude mcp list in each profile and say each server as connected, needing a sign-in, or failed, by name only. claude is asked about once, as a program, and it changes nothing else.",
    'braindog sync inventory [--under <folder>] [--host <host>] [--json]',
    "  List what a setup sync would carry from this machine, by name and size: auto memory, the context folder, your programs, ccenv's shared files and the skills your BrainDog does not hold, and with --under each repository's ignored .env files and what it has not pushed or committed. Then what it would refuse and why, and on a machine that has joined, what your BrainDog keeps sealed already by machine. It opens no file it lists, nothing sealed, and changes nothing.",
    'braindog sync join [--name <machine>] [--new-key] [--host <host>]',
    "  Join setup sync, with the Setup sync plugin installed: name this machine and keep the sync key in its Keychain, Credential Manager or secret service. The first machine makes the key and asks twice for a new sync passphrase; every other machine asks for it once. The passphrase is typed at the terminal, never shown, kept or sent.",
    'braindog sync push [--dry-run] [--host <host>]',
    "  Seal what Carry lists from this machine under the sync key and keep it in your BrainDog as one bundle, sending only what changed. An agent app's own login and session transcripts are refused, whatever Carry says. A machine that has joined also pushes by itself in the background when a session ends, and once a day when one starts.",
    'braindog sync pull [--from <machine>] [--dry-run] [--yes-data] [--host <host>]',
    "  Place the newest bundle from another machine, or the one --from names, each file at this system's place for it, keeping a file it replaces aside first. Anything that runs a program is shown whole and asked y/N, then pinned; tool sign-ins move only from a retired machine, and someone else's are asked about by their name. With no terminal, --yes-data places the plain data alone.",
    'braindog sync patches [--from <machine>] [--dry-run] [--host <host>]',
    "  Put another machine's unpushed work back: each repository cloned from its remote where it is missing, its commits fetched from the bundle, then its staged and unstaged changes and new files. A repository with changes of its own, or on another commit, is left as it is and said.",
    'braindog sync drill [--from <machine>] [--host <host>]',
    '  Restore a bundle into a scratch folder, check every file against its hash, write the outcome to Drills, and delete the folder. Nothing is placed.',
    'braindog sync retire <machine> [--yes] [--host <host>]',
    "  Retire a machine for good: it sends and places nothing more, its sync key goes the next time it runs braindog, and the tool sign-ins it carried may then move to another. Retiring this machine removes its key now and asks before removing its tool sign-ins.",
    'braindog verify <file> [--key <pubkey|url>]',
    "  Check a .brainl file on this machine: its format, every table against its manifest, and its signature, against the key you name when you name one. Nothing is sent, but for fetching a key from an address.",
    'braindog runner enrol <host>',
    '  Sign this machine in as a runner: six digits to approve in the app, and the runner token kept in the hosts file.',
    'braindog runner repos add <name> <folder> | repos list',
    '  Name a folder on this machine that a job may run in, or list the names kept. The host only ever sends the name.',
    'braindog runner allow <kind>',
    '  Allow a job kind on this machine, as runner run asks the first time it sees one, for a runner with no terminal.',
    'braindog runner run [--once] [--host <host>]',
    "  Claim the jobs approved for this machine and run each in Claude Code with only its kind's tools, sending back what it does. With --once, one job.",
    'braindog runner service on [--host <host>] | off | status',
    '  Start this machine\'s runner at log-on and keep it up, with no terminal open, writing to runner.log in your .braindog folder; off stops it and takes it out.',
    'braindog init <slug> --owner <email> [--from <file.brainl>]',
    'braindog serve [<record file>]',
    '  Create or serve a BrainDog on this machine, through the self-host. With --from, the new BrainDog is the one in a file braindog export wrote; start it in an empty data folder.',
    'braindog update [--check]',
    '  Replace this command with the build that is out, held to its checksum, keeping the old one as braindog.mjs.prev, and place the Agent Skill and hooks again. --check only says whether it is behind.',
    'braindog --version',
    '  The build, the file format it writes, the kernel it expects, and the primitives it renders.',
    '',
    `The host comes from --host, then BRAINDOG_HOST, then the default in ${hostsPath(process.env)}.`,
    'The token comes from BRAINDOG_TOKEN, then the same file. It is never taken as an argument.',
    JSON_LINE,
  ].join('\n');

/**
 * One command's own lines of the usage: each `braindog <command> ...` line and the lines under it, or `[]` for a word the
 * usage does not name. `init` and `serve` share one description, so lines that follow each other are kept together.
 *
 * `<command> --help` ANSWERS THIS AND EXITS 0. It was refused by each command's own parser, exit 1, with a
 * sentence of what it takes ("braindog runner has no such command", "--help is not a record"), so the one place a person
 * looks for a command's help was a refusal.
 */
function helpOf(command: string): string[] {
  const blocks: string[][] = [];
  for (const line of fullUsage().split('\n')) {
    if (line.startsWith('braindog ')) {
      const last = blocks.at(-1);
      if (last !== undefined && last.every((l) => l.startsWith('braindog '))) last.push(line);
      else blocks.push([line]);
    } else if (line.startsWith('  ') && blocks.length > 0) blocks.at(-1)!.push(line);
  }
  const names = (l: string): boolean => l === `braindog ${command}` || l.startsWith(`braindog ${command} `);
  return blocks.filter((b) => b.some(names)).flat();
}

/**
 * `braindog --help`: every command once, grouped by what a person does, one short line each. The long text of a command
 * is `braindog <command> --help`, which prints that command's lines of `fullUsage`.
 */
const GROUPS: [string, [string, string][]][] = [
  ['Sign in', [
    ['setup <host>', 'Set this machine up from one BrainDog, in order'],
    ['login <host>', 'Sign this machine in; approve six digits in the app'],
    ['logout [<host>]', "Remove this machine's token for a host"],
  ]],
  ['Keys', [
    ['keys list', 'The keys your BrainDog holds, never a value'],
    ['keys put <label>', 'Deposit a key, piped in or typed at a hidden prompt'],
    ['keys scan [<folder>]', 'Name the keys lying in a repository'],
    ['keys exec <label> -- <cmd>', 'Run a command with one key in its environment'],
    ['run <label> -- <cmd>', 'The same as keys exec, under a shorter name'],
    ['keys headers|helper <label>', 'Print a key for a program that reads it'],
  ]],
  ['Agents and sessions', [
    ['mcp', 'Serve BrainDog to an agent over stdin and stdout'],
    ['install [--apply]', "Add the hooks to Claude Code's settings"],
    ['hook <event>', 'What Claude Code runs on session and tool events'],
    ['statusline', "Draw Claude Code's status line"],
    ['session <verb>', 'Read or change the run this folder is in'],
    ['context', 'Print the card: this run, the next step, what waits'],
    ['skills sync|off', "Keep this machine's skills in step, after one yes"],
    ['tools scan|write', 'Record MCP servers, or show the entries to write'],
    ['token create', 'Mint a token for an agent'],
    ['bypass on|off', 'Open the switch that lets agents act without asking'],
    ['runner <verb>', 'Run approved jobs on this machine'],
  ]],
  ['Records', [
    ['export / import / verify', 'Back up, restore or check a .brainl file'],
    ['page pull|push|check', 'Fetch, propose or validate a page as a .dog file'],
    ['attach <file.html> --on <thing>', 'Put a page on a task, project or decision'],
    ['starter <verb>', 'Export, check, install or publish a starter'],
    ['automations list|show', 'Say the automations and how their runs went'],
    ['actions run <name>', 'Run a scheduled action now'],
    ['scripts list', 'Say the scripts and how their runs went'],
    ['people harvest', 'Meet the people who committed to your projects'],
    ['signs', "Say your BrainDog's vital signs"],
    ['today [add "<what>"]', 'Say Today, or put a widget on it'],
    ['widget share <name>', 'Make a plugin of a widget on Today'],
    ['tidy', 'Say what went stale and the call that clears each'],
    ['understand', 'Say what your BrainDog would link'],
    ['private-terms', 'Write your private list from your own BrainDog'],
    ['feed propose <file>', 'Ask for each live feed a setup file lists'],
  ]],
  ['Plugins', [
    ['addon new|check|test|preview|dev', 'Write, check and try a plugin here (also: pack)'],
    ['addon install|uninstall <id>', 'Ask the owner to install a plugin, or remove one'],
    ['addon publish|yank|diff|search', 'Publish, take back, compare or find plugins'],
    ['addon key <verb>', 'Make, rotate or revoke an author key'],
    ['kennel review', "The Kennel operator's review"],
  ]],
  ['Sync', [
    ['sync inventory|join|push|pull', "Carry this machine's setup to another"],
    ['sync patches|drill|retire', 'Restore unpushed work, test a bundle, retire a machine'],
    ['env diff|apply|pins|check', 'Compare and set up every Claude Code profile'],
  ]],
  ['Other', [
    ['doctor', 'List what still names a replaced tool or holds a key'],
    ['init <slug> / serve', 'Create or serve a BrainDog on this machine'],
    ['update [--check]', 'Replace this command with the build that is out'],
    ['--version', 'The build and the formats it speaks'],
  ]],
];

const usage = (): string =>
  [
    "braindog <command> [options]   (braindog <command> --help for that command's lines)",
    ...GROUPS.flatMap(([title, rows]) => ['', `${title}:`, ...rows.map(([name, line]) => `  ${name.padEnd(34)}${line}`)]),
    '',
    `The host comes from --host, then BRAINDOG_HOST, then the default in ${hostsPath(process.env)}.`,
    'The token comes from BRAINDOG_TOKEN, then the same file. It is never taken as an argument.',
    JSON_LINE,
  ].join('\n');

/** Whether the words before any `--` ask for help: what follows `--` is a command `keys exec` and `run` hand on. */
const asksHelp = (args: readonly string[]): boolean => {
  const end = args.indexOf('--');
  return (end < 0 ? args : args.slice(0, end)).some((a) => a === '--help' || a === '-h');
};

async function mcp(args: string[]): Promise<void> {
  let values: { host?: string | undefined; agent?: string | undefined; local?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, options: { host: { type: 'string' }, agent: { type: 'string' }, local: { type: 'boolean' } }, strict: true }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token somebody passed by mistake. */
    return stop('braindog mcp takes --agent, --host and --local, and nothing else. A token is never an argument.');
  }
  const { agent } = values;
  if (agent !== undefined && !isAgent(agent)) return stop(`--agent is one of ${AGENTS.join(', ')}.`);

  /* Anything that logs with console.log would write into the protocol. */
  console.log = console.info = console.debug = console.error;

  let to: Target;
  try {
    /* AS THE AGENT IT WAS REGISTERED FOR, so the token setup made for that agent is the one sent when there is one. */
    to = target(values.host, process.env, hostsPath(process.env), Date.now(), agent ?? agentOf(process.env));
  } catch (e) {
    /*
     * NOT SIGNED IN IS A SERVER THAT REFUSES, NOT ONE THAT IS MISSING (`signed-out.ts`). Exiting here was `/mcp`'s
     * `braindog failed` and a model with no word to pass on. Any other reason
     * `target` gives is a setup mistake and still stops the server, below.
     */
    const fix = signedOutFix(values.host, process.env, hostsPath(process.env));
    if (fix === null) throw e;
    /* THE SAME ONE LINE ON STDERR AS BEFORE, for whoever reads the server's log. */
    say(e instanceof Error ? e.message : String(e));
    process.stdout.on('error', () => process.exit(0));
    await serveStdio(signedOutSurface(fix), () => ({ signal: AbortSignal.timeout(budgetOf(process.env)) }), process.stdin, process.stdout);
    /* EXIT 1 AT THE END OF INPUT, because the record was never reached, which is what `48 §4.4` spends 1 on, and which
       `stdio.test.ts` pins for both of these cases. Input ends when the client is done with the server, so the code
       reaches a person or a script that ran the command by hand and no session that is still asking. Left to end on
       its own, for the reason given at the end of this function. */
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 1_000).unref();
    return;
  }
  /* THE SELF-HOST'S SERVER KEY IN BRAINDOG_TOKEN IS THE OWNER, a person and never a run, so an agent sending it could not
     hand off, log to its run or read what it was told (D4). The agent sends a token of its own instead, made from the key
     as `token create` makes one, with no approval, and kept for the next start (`agentTokenFromKey`). A token there is
     refused the mint, and is sent as it always was; the refusal is kept for that key, so the next start does not ask. */
  const speaks = agent ?? agentOf(process.env);
  if (to.from === 'env' && speaks !== undefined) {
    const own = await agentTokenFromKey(to.key, speaks, hostsPath(process.env), { env: process.env, home: homedir(), signal: AbortSignal.timeout(5_000) }).catch(() => null);
    if (own !== null) to = { ...to, token: own, from: 'agent' };
  }
  /* Started now and awaited by the first request, so git runs while the client is still saying hello. */
  const where = positionOf(process.cwd());
  /* READ PER REQUEST, because Claude Code may start this server before the start hook has written the
     file, and a clear or a resume inside the window moves it to another session and run. The session's own file, or
     the run its window last started, which a clear moves on (`heldHere`); never another window's. This process's
     parent is the window that started it, and the session id in its environment is the one it had then. */
  const cwd = process.cwd();
  const server = { parent: process.ppid, since: Date.now() };
  /* WHAT THE CLIENT SAID IT IS IN ITS HELLO, sent with every request after it, so the record can say which app makes
     the run and which version of it, beside the `--agent` the server was registered with. */
  let hello: ClientInfo = {};
  const headers = async () =>
    sessionHeaders(await where, agent, heldHere(process.env, cwd, to.key, Date.now(), server), { env: process.env, client: hello, parent: parentOf(process.env, to.key) });

  /* A closed stdout means nobody is left to read the answers. */
  process.stdout.on('error', () => process.exit(0));

  /* SIGNED IN, THE SERVER IS THE HOST'S (`bridge.ts`): each line goes to its `POST /mcp` with the same session
     headers, read per request, so a deploy reaches an open session. `--local` keeps the server this command composes
     for a host with no server of its own, and the tests. A sign-in that ends mid-session is the bridge's to say. */
  if (values.local !== true) {
    const say = (l: string) => void process.stderr.write(`${l}\n`);
    let said: ClientInfo = {};
    const hints = async (client: ClientInfo) => {
      said = client;
      return sessionHeaders(await where, agent, heldHere(process.env, cwd, to.key, Date.now(), server), { env: process.env, client, parent: parentOf(process.env, to.key) });
    };
    /* THE START WORK, ONCE THE FIRST `initialize` IS ANSWERED (`session-start.ts`): for an app with no start hook, once a
       day for this machine, folder and app, in the background and inside the hook's budget, its lines on stderr. */
    /* A LINE THE START WORK HAS FOR THE AGENT (no yes to copy skills yet: `skills-consent.ts`) goes in the next tool
       answer once, ahead of the line about a newer build, which then waits for the answer after. */
    let told: string | null = null;
    const output = afterHello(process.stdout, () =>
      void startFromServer({ io: { env: process.env }, to, where, agent, headers: () => hints(said), ms: hookBudget(process.env), say, tell: (l) => void (told = l) }),
    );
    /* CODEX SAYS NO SESSION ID, so its session's inbox file goes by the Codex process that started this server, which
       also starts its turn-end program (`codexSession`, `notifyHook`). */
    const session = agent === 'codex' && hostSessionOf(process.env) === null ? codexSession(process.ppid) : undefined;
    /* AN UPDATE UNDER THIS SESSION IS SAID ONCE in its next tool answer (`installed-build.ts`); a checkout says nothing. */
    const newer = installedBuild() ? watchInstalled({ file: fileURLToPath(import.meta.url), mine: cliBuild() }) : undefined;
    const installed = () => {
      if (told === null) return newer?.() ?? null;
      const line = told;
      told = null;
      return line;
    };
    /* A STOP SIGNAL IS THE APP CLOSING THIS SERVER, AND THE RUN STILL ENDS. An app gives a server two seconds between
       closing its input and SIGTERM, and a closed window sends SIGHUP; the end waits up to `END_GRACE_MS` for the end
       hook and then asks the host, which did not fit, so a run that closed normally was killed before its end was sent
       and the sweep wrote it off as abandoned twelve hours later. The first signal ends the input instead, so the close
       runs as it would at the end of input, and the process leaves on its own or at the latest `SIGNAL_EXIT_MS` on. */
    let signalled = false;
    const closeOnSignal = () => {
      if (signalled) return;
      signalled = true;
      process.stdin.push(null);
      setTimeout(() => process.exit(0), SIGNAL_EXIT_MS).unref();
    };
    for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) process.on(signal, closeOnSignal);
    await serveBridge({ input: process.stdin, output, say, session, installed }, to, hints);
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1_000).unref();
    return;
  }
  const surface = await surfaceOver((ctx) => clientFor(to, headers, ctx.signal));
  const ms = budgetOf(process.env);
  /* `to.base` IS THE HOST'S ORIGIN, where it serves the app, so a filed `propose` carries its `decide` link there. */
  await serveStdio(surface, () => ({ signal: AbortSignal.timeout(ms) }), process.stdin, process.stdout, to.base, (said) => {
    hello = said;
  });
  /* Every reply is flushed by now. LEFT TO END ON ITS OWN, and ended after a second if an idle keep-alive
     socket to the host holds it open, for the reason `hook` gives: `process.exit` straight after the last
     reply aborted Node 24 on Windows with a libuv assertion when the client closed standard input. */
  process.exitCode = 0;
  setTimeout(() => process.exit(0), 1_000).unref();
}

/** `braindog login <host> [--keychain <scope>]`: one host, and the exit code `login` decides. */
async function signIn(args: string[]): Promise<void> {
  /* `app.brain.dog` AND NOT `brain.dog`, because the example is the one address a person copies and only production's
     `PUBLIC_HOST` starts a device. The shared name stays a legacy host of the same Worker; with production's vars a
     device start there answers 403 "This BrainDog signs devices in at https://app.brain.dog, so start there", which
     is why `hostKey` reads a `brain.dog` address as `app.brain.dog` before anything is asked. `test/login.test.ts` reads the host from
     `apps/worker/wrangler.jsonc`, so a later move fails there rather than in somebody's terminal. */
  const wrong = 'braindog login takes one host, as in braindog login https://app.brain.dog/<slug>, and --keychain <project>, and nothing else.';
  let parsed: { values: { vault?: string | undefined; keychain?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { vault: { type: 'string' }, keychain: { type: 'string' } } });
  } catch {
    return stop(wrong);
  }
  const [host, ...more] = parsed.positionals;
  if (host === undefined || more.length > 0 || host.startsWith('-')) return stop(wrong);
  const stopping = new AbortController();
  /* Ctrl+C ends the wait with one sentence rather than a stack. */
  process.on('SIGINT', () => stopping.abort());
  /* THE SIX DIGITS GO TO STDERR EITHER WAY (§5.2 step 3), which is what makes this command work under
     `--json` at all: the whole device flow is already on the sink the envelope does not use. */
  const code = await login(host, { file: hostsPath(process.env), say: json ? json.say : say, signal: stopping.signal, vault: parsed.values.keychain ?? parsed.values.vault, answer: json?.answer });
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives: exiting straight after several requests aborted Node 24
     on Windows, and a success must exit 0. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * One line from the terminal with echo off, for `keys put` at a terminal: the question on stderr, then raw mode, so
 * nothing typed or pasted is drawn, and the line ends at Enter. Backspace and Ctrl+U edit it, Ctrl+C or Ctrl+D on an
 * empty line stop with `null`, and any escape sequence (an arrow key, a bracketed paste's marks) is dropped. THE VALUE IS
 * NEVER WRITTEN ANYWHERE: not echoed, not logged, not in argv or shell history. `null` off a terminal.
 */
function readHidden(question: string): Promise<string | null> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') return Promise.resolve(null);
  return new Promise((done) => {
    writeFileSync(2, question);
    let typed = '';
    /* 0 outside an escape sequence, 1 just after ESC, 2 inside a CSI (`ESC [` ... a final letter or `~`). */
    let escape = 0;
    const raw = input.isRaw;
    const finish = (value: string | null) => {
      input.off('data', onData);
      input.setRawMode(raw);
      input.pause();
      writeFileSync(2, '\n');
      done(value);
    };
    const onData = (chunk: string | Buffer) => {
      for (const ch of typeof chunk === 'string' ? chunk : chunk.toString('utf8')) {
        if (escape === 1) {
          escape = ch === '[' || ch === 'O' ? 2 : 0;
          continue;
        }
        if (escape === 2) {
          if (/[A-Za-z~]/u.test(ch)) escape = 0;
          continue;
        }
        if (ch === '\r' || ch === '\n') return finish(typed);
        if (ch === '\u0003') return finish(null);
        if (ch === '\u0004') {
          if (typed === '') return finish(null);
          continue;
        }
        if (ch === '\u001b') escape = 1;
        else if (ch === '\u007f' || ch === '\b') typed = [...typed].slice(0, -1).join('');
        else if (ch === '\u0015') typed = '';
        else if (ch >= ' ') typed += ch;
      }
    };
    input.setRawMode(true);
    /* A character split across two reads is joined, not garbled. */
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

/** `braindog keys list|put|scan|exec|headers`, over the real terminal, and the exit code `keys` decides. */
async function keysCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const code = await keys(args, {
    file: hostsPath(process.env),
    env: process.env,
    stdin: () => {
      if (process.stdin.isTTY) return null;
      try {
        return readFileSync(0, 'utf8');
      } catch {
        /* No stdin at all is an empty one. */
        return '';
      }
    },
    /* `put` AT A TERMINAL ASKS, with echo off (`readHidden`); a pipe is read above as it always was. */
    ...(process.stdin.isTTY ? { secret: readHidden } : {}),
    say: json ? json.say : say,
    /* `list` alone prints lines: kept for the one document under `--json`, and `keys`'s own stdout line otherwise. */
    out: json ? json.out : undefined,
    answer: json?.answer,
    spawn: spawnInherit,
    /* The run the session file names, sent only to the host that wrote it and only while it is the caller's, as `mcp` does. */
    headers: (host: string) => headersHere(cwd, host),
    /* `put --from` ASKS ABOUT EACH KEY HERE, on stderr and the terminal's own input, and with no terminal it is not asked. */
    confirm: async (question: string) => {
      if (!process.stdin.isTTY) return null;
      const asking = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return /^y(?:es)?$/i.test((await asking.question(`${question} [y/N] `)).trim());
      } finally {
        asking.close();
      }
    },
    cwd,
  });
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog skills|tools|page|usecase|pack|kennel|import|context|session|automations|scripts|verify|people|understand|signs|tidy|feed|private-terms`, over the real terminal, and
 * the exit code the command decides.
 *
 * `--json` IS DECIDED HERE AND NOWHERE ELSE (`48 §4.5`, `json.ts`). The twelve commands below all take
 * the same `AgentIo`, so swapping where `out` goes is the whole of the flag: not one line in a command
 * body asks whether it was given.
 */
async function agentCommand(which: 'attach' | 'skills' | 'tools' | 'page' | 'usecase' | 'pack' | 'kennel' | 'import' | 'context' | 'session' | 'automations' | 'scripts' | 'verify' | 'people' | 'understand' | 'signs' | 'tidy' | 'feed' | 'private-terms' | 'actions' | 'today' | 'widget', args: string[]): Promise<void> {
  const cwd = process.cwd();
  const io = {
    env: process.env,
    cwd,
    home: homedir(),
    out: json ? json.out : (line: string) => writeFileSync(1, `${line}\n`),
    say: json ? json.say : say,
    answer: json?.answer,
    /* The run the session file names, sent only to the host that wrote it and only while it is the caller's, as `mcp` does. */
    headers: (host: string) => headersHere(cwd, host),
  };
  const cli = fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/');
  /* `import.ts`, `usecase.ts` AND `catalogue.ts` (`pack`, `kennel`) ARE LOADED HERE, NOT AT THE TOP OF THE
     FILE, for the same reason `verify.ts:218` gives: `catalogue.ts` reaches `scratch.ts`'s top-level
     `import { DatabaseSync } from 'node:sqlite'`, and a static import at the top of this file would load
     it, and Node's `ExperimentalWarning`, before every command this CLI runs, not only these four. */
  const code =
    which === 'attach' ? await (await import('./attach.ts')).attachCommand(args, io) : which === 'today' ? await (await import('./today.ts')).todayCommand(args, io) : which === 'widget' ? await (await import('./today.ts')).widgetCommand(args, io) : which === 'actions' ? await (await import('./actions-run.ts')).actionsCommand(args, io) : which === 'feed' ? await (await import('./feed.ts')).feedCommand(args, io) : which === 'private-terms' ? await privateTermsCommand(args, io) : which === 'signs' ? await signsCommand(args, io) : which === 'tidy' ? await (await import('./tidy.ts')).tidyCommand(args, io) : which === 'people' ? await peopleCommand(args, io) : which === 'understand' ? await understandCommand(args, io) : which === 'context' ? await context(args, io) : which === 'session' ? await session(args, io) : which === 'import' ? await (await import('./import.ts')).importCommand(args, io) : which === 'skills' ? await skills(args, io) : which === 'tools' ? await tools(args, { ...io, cli }) : which === 'usecase' ? await (await import('./usecase.ts')).usecase(args, io) : which === 'pack' ? await (await import('./catalogue.ts')).pack(args, io) : which === 'kennel' ? await (await import('./kennel.ts')).kennel(args, io) : which === 'automations' ? await automations(args, io) : which === 'scripts' ? await scripts(args, io) : which === 'verify' ? await verify(args, io) : await pageCommand(args, io);
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog export`, `braindog import <file.brainl>` and `braindog token create`, over the real terminal, and the exit code
 * the command decides.
 *
 * NOT ONE OF `agentCommand`'s, because these three may run a device flow in the middle: they need the hosts file, and
 * Ctrl+C, which the others never wait long enough to be given. The six digits go to stderr either way, as `login`'s do.
 */
async function brainfileCommand(which: 'export' | 'import' | 'token', args: string[]): Promise<void> {
  const stopping = new AbortController();
  process.on('SIGINT', () => stopping.abort());
  const io = {
    env: process.env,
    cwd: process.cwd(),
    file: hostsPath(process.env),
    out: json ? json.out : (line: string) => writeFileSync(1, `${line}\n`),
    say: json ? json.say : say,
    answer: json?.answer,
    signal: stopping.signal,
  };
  /* `--mirror` IS LOADED ONLY WHEN ASKED (`mirror-read.ts`): plain files of the whole record, read by the machine's own sign-in, with no approval. */
  const code = which === 'export' && args.some((a) => a === '--mirror' || a.startsWith('--mirror=')) ? await (await import('./mirror-read.ts')).exportMirror(args, io) : which === 'export' ? await exportFile(args, io) : which === 'token' ? await tokenCommand(args, io) : await importFile(args, io);
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog setup <host> [--dry-run | --yes] [--only <app>] [--profile <folder>]`, over the real terminal, and the exit code of the first step that failed.
 *
 * NOT ONE OF `agentCommand`'s, because its first step may run the device flow and wait for six digits, so it needs
 * the hosts file and Ctrl+C, as `login` does. NO `--json`: each step prints for the person at the terminal, and its
 * strict `parseArgs` refuses the flag in its own words. The two paths are found exactly as `tools` and `install` find
 * them, so what `setup` writes is what those commands would write, and a later run of either finds it in place.
 */
async function setupCommand(args: string[]): Promise<void> {
  const stopping = new AbortController();
  process.on('SIGINT', () => stopping.abort());
  const cwd = process.cwd();
  const code = await setup(args, {
    env: process.env,
    cwd,
    home: homedir(),
    out: (line: string) => writeFileSync(1, `${line}\n`),
    say,
    signal: stopping.signal,
    cli: fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/'),
    scripts: hookScripts(),
    /* The run the session file names, sent only to the host that wrote it and only while it is the caller's, as `mcp` does. */
    headers: (host: string) => headersHere(cwd, host),
  });
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog runner enrol|repos|allow|run`, over the real terminal, and the exit code `runner` decides (`runner.ts`).
 *
 * NOT ONE OF `agentCommand`'s, because `enrol` runs the device flow and `run` waits for jobs until Ctrl+C, so both need
 * the hosts file and the stop signal, as `login` does. `--json` IS TAKEN: every verb says its lines on stderr and keeps
 * stdout for its answer, so the envelope is the one document there once the verb returns.
 */
async function runnerCommand(args: string[]): Promise<void> {
  /* `service` NEVER REACHES `runner.ts`: it writes and loads this machine's unit (`runner-service.ts`), and the unit
     runs `runner run` with nothing in it but this Node, this file and the host it was named. It is taken before the
     stop signals are, so a `service on` is still ended by SIGTERM as any short command is. */
  if (args[0] === 'service') return runnerServiceCommand(args.slice(1));
  const stopping = new AbortController();
  process.on('SIGINT', () => stopping.abort());
  /* A SERVICE IS STOPPED WITH SIGTERM (`launchctl bootout`, `systemctl stop`), and a job running then is ended
     `interrupted` exactly as Ctrl+C ends it, rather than left claimed until its lease runs out. */
  process.on('SIGTERM', () => stopping.abort());
  /* `run --log <file>` IS WHAT THE WINDOWS TASK RUNS, because Task Scheduler hands a task no streams to send to a log:
     every line goes to the file instead, and nothing else changes. Taken here, so `runner.ts` never sees it. */
  const at = args[0] === 'run' ? args.indexOf('--log') : -1;
  const log = at > 0 ? args[at + 1] : undefined;
  if (at > 0 && !log) return stop('braindog runner run --log takes the file to write to.');
  const into = log ? (line: string) => appendFileSync(log, `${new Date().toISOString()} ${line}\n`) : null;
  const code = await runner(at > 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args, {
    env: process.env,
    cwd: process.cwd(),
    home: homedir(),
    file: hostsPath(process.env),
    out: into ?? (json ? json.out : (line: string) => writeFileSync(1, `${line}\n`)),
    say: into ?? (json ? json.say : say),
    answer: json?.answer,
    signal: stopping.signal,
  });
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog runner service on|off|status` (`runner-service.ts`): this Node, this file, the log in `~/.braindog`, and
 * whether `runner run` would start, read the way `runner run` reads it, so `on` never installs a runner that cannot run.
 */
async function runnerServiceCommand(args: string[]): Promise<void> {
  const home = homedir();
  const code = await service(args, {
    platform: process.platform,
    paths: { node: process.execPath, cli: fileURLToPath(import.meta.url), log: join(home, '.braindog', 'runner.log'), home, path: process.env.PATH, user: process.platform === 'win32' ? userInfo().username : undefined },
    say: json ? json.say : say,
    answer: json?.answer,
    /* READ WITHOUT `BRAINDOG_HOST`, because the unit does not carry this shell's environment: a host named only there
       would pass here and leave the service runner on another BrainDog, or on none. `--host` is what the unit keeps. */
    ready: (host) => {
      try {
        runnerTarget(host, { ...process.env, BRAINDOG_HOST: undefined }, hostsPath(process.env));
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'This machine is not enrolled as a runner.';
      }
    },
  });
  if (json) emit(json.envelope(code));
  process.exitCode = code;
}

function selfhost(command: 'init' | 'serve', args: string[]): void {
  const entry = process.env.BRAINDOG_SELFHOST || fileURLToPath(new URL('../../selfhost/src/main.ts', import.meta.url));
  if (!existsSync(entry)) return stop(`braindog ${command} needs the self-host. Set BRAINDOG_SELFHOST to its entry file.`);
  /* THE SELF-HOST IS BUILT ON node:sqlite, so Node's warning that it is experimental is not said on every start. */
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', entry, command, ...args], { stdio: 'inherit' });
  /* Ctrl+C reaches the child from the terminal itself, and a second SIGINT would cut short the close
     the self-host starts on the first. Only a SIGTERM aimed at this process needs passing on. */
  process.on('SIGINT', () => {});
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', (e) => stop(`The self-host did not start: ${e.message}`));
  child.on('exit', (code) => process.exit(code ?? 1));
}

/**
 * A hook exits 0 whatever happens, because a non-zero exit is how a hook stops a session. What the start
 * hook prints goes into the model's context, so it is written once and synchronously before the exit.
 */
async function statuslineCommand(args: string[]): Promise<void> {
  const stdin = ((): string => {
    try {
      return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
    } catch {
      return '';
    }
  })();
  /* `--beat` IS THE DETACHED CHILD (`statusline.ts`): it sends the one beat it is handed and prints nothing. */
  if (args[0] === '--beat') {
    const beat = readBeat(stdin);
    if (beat !== null) await sendBeat(beat, process.env);
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1_000).unref();
    return;
  }
  /* `--beat-only` sends the same beat and prints nothing, for a status line of his own that draws its own line. */
  process.stdout.write(statusOut(statusline({ env: process.env, stdin }), args));
  process.exitCode = 0;
}

async function hook(args: string[]): Promise<void> {
  const [which, ...more] = args;
  if (which === 'start') mark('loaded');
  /* THE HOOK SCRIPTS BESIDE THE COMMAND, WRITTEN AT A START TOO (door audit D36): the Claude Code plugin hands its prompt,
     tool, stop and beat hooks to them (`plugins/claude-code/hooks/run.sh`), and a machine that added the plugin and
     never ran setup had none, so only its start and end ever ran. Three small files, the build's own. */
  if (which === 'start' && more.length === 0) {
    try {
      hookScripts();
    } catch {
      /* A folder that cannot be written keeps the plugin's start and end, as before. */
    }
  }
  /*
   * THE PROMPT, TOOL AND STOP HOOKS (`inbox-file.ts`) READ ONE FILE AND SAY AT MOST ONE JSON LINE: no host, no git, no
   * budget to wait out, and nothing above it, because Claude Code reads that line as JSON. The watcher waits on the
   * same file and exits 2 with what he said, which is how an async hook wakes a session.
   */
  if ((which === 'prompt' || which === 'tool' || which === 'stop' || which === 'watch') && more.length === 0) {
    let stdin = '';
    try {
      if (!process.stdin.isTTY) stdin = readFileSync(0, 'utf8');
    } catch {
      /* No stdin at all is an event naming no session. */
    }
    process.exitCode = 0;
    if (which === 'watch') {
      const said = await watchHook(stdin, process.env).catch(() => null);
      if (said !== null) {
        writeFileSync(2, `${said}\n`);
        process.exitCode = 2;
      }
      return;
    }
    const said = runHook(which, stdin, process.env);
    if (said !== '') writeFileSync(1, `${said}\n`);
    return;
  }
  /* CODEX'S TURN END, its event as the last argument (`notifyHook`). Codex started this process, so its parent is the
     Codex process the bridge names the session's files by. Says nothing on any stream. */
  if (which === 'notify' && more.length <= 1) {
    process.exitCode = 0;
    notifyHook(more[0] ?? '', process.env, codexSession(process.ppid));
    return;
  }
  /* THE START WORK A START HOOK LEFT FOR AFTER ITS CARD (`hookWork`), in this detached process: no stdin, nothing said
     on any stream, and a budget of its own, so the hook's nine seconds below are not this one's. */
  if (which === 'later' && more.length === 1) {
    process.exitCode = 0;
    await hookWork(process.env, more[0]!).catch(() => undefined);
    setTimeout(() => process.exit(0), 1_000).unref();
    return;
  }
  /* NINE SECONDS AT MOST, whatever the network does: the hook ends at HOOK_MS counted from the process's own
     start (`performance.now()`), inside Claude Code's ten-second timeout. The start hook's own deadline starts later,
     so on a hung network this fires first and says the one line itself, or the card it holds, unless one was written. */
  let said = false;
  let held: string | null = null;
  const flush = (lapse: string | null) => {
    if (held === null) return;
    writeFileSync(1, `${lapse === null ? '' : `${lapse}\n`}${held}\n`);
    held = null;
  };
  setTimeout(() => {
    if (which === 'start' && !said) writeFileSync(1, `${unreachable(HOOK_MS)}\n`);
    flush(null);
    process.exit(0);
  }, Math.max(0, HOOK_MS - performance.now())).unref();
  if ((which !== 'start' && which !== 'end' && which !== 'beat') || more.length > 0) {
    say('braindog hook takes start, end, beat, prompt, tool, stop, watch or notify, and nothing else. Claude Code runs it with the event on standard input, and Codex runs notify with the event as its last argument.');
    return process.exit(0);
  }
  /*
   * THE LAPSE GOES ABOVE WHATEVER THE START HOOK SAYS, while there is still time to act on it. The login is a ninety-day
   * bearer that does not slide (`lapseWarning`), and past it the server has nothing to reach, so the first word anyone
   * had was this hook's line on the morning after. First, because the card's own first line says which run this is and
   * the lines after it follow in a fixed order; and it rides the one write `hookStart` makes, the failure line's
   * included, so a quiet resume that writes nothing says nothing of it either.
   */
  /* AND ONCE A DAY, WHEN THIS COMMAND IS OLDER THAN THE HOST NEEDS, a line saying so under it (`behind.ts`): it never
     throws, waits at most two seconds and only on the first start of a day, and rides the same one write. ASKED BESIDE
     THE ATTACH, not before it, so the day's first start waits for the slower of the two and not for both. */
  const behindAsked = which === 'start' ? behindLine({ env: process.env }) : Promise.resolve(null);
  /* AND ONCE A WEEK, A QUIET `braindog doctor` (`doctorLine`): one line beside it when the run lists anything. Only from
     an installed build, as `behindLine`: a checkout run by `node` is a developer's, and its tests never touch the home. */
  const doctored = which === 'start' && installedBuild() ? doctorLine(homedir()) : null;
  const write = (text: string) => {
    said = true;
    held = text;
  };
  try {
    let stdin = '';
    try {
      if (!process.stdin.isTTY) stdin = readFileSync(0, 'utf8');
    } catch {
      /* No stdin at all is an empty event. */
    }
    /* THE END HOOK OUTLIVES THE WINDOW. Closing a terminal sends SIGHUP to it as well, and it died having written `seen` and
       not sent `end`. It leaves by itself at `HOOK_MS`, set above, whatever happens. */
    if (which === 'end') for (const signal of ['SIGHUP', 'SIGTERM', 'SIGINT'] as const) process.on(signal, () => undefined);
    const io = { env: process.env, stdin, cwd: process.cwd(), write };
    await (which === 'start' ? hookStart(io) : which === 'beat' ? hookBeat(io) : hookEnd(io));
  } catch {
    /* The error could quote anything, so the start hook says only that it failed. */
    if (which === 'start') write('BrainDog: the start hook failed, so this session works without shared context.');
  }
  mark('returned');
  if (held !== null) {
    const behind = await behindAsked;
    mark('behind');
    flush([which === 'start' ? lapseWarning(process.env, hostsPath(process.env)) : null, behind, doctored].filter((line): line is string => line !== null).join('\n') || null);
  }
  /* SETUP SYNC'S PUSH, IN THE BACKGROUND, after the hook's own work and never waited for (`startPush`): when a session
     ends, and on the day's first start, on a machine that has joined. It reads one file and starts one process. */
  if (which === 'end' || which === 'start') startPush({ home: homedir(), env: process.env, cli: fileURLToPath(import.meta.url), when: which === 'end' ? 'end' : 'day' });
  if (which === 'start') mark('push');
  /* LEFT TO END ON ITS OWN, and ended after a second if an idle keep-alive socket to the host holds it
     open. `process.exit` straight after more than one request aborted Node 24 on Windows with a libuv
     assertion, a non-zero exit, which is the one thing a hook must never do. */
  process.exitCode = 0;
  setTimeout(() => process.exit(0), 1_000).unref();
}

/**
 * `braindog doctor`: what on this machine still names a replaced tool, holds something shaped like a key, or lacks
 * BrainDog's server or a hook. IT READS AND CHANGES NOTHING, and exits 1 when anything is listed, which is an answer and
 * no failure: under `--json` the document is the report either way.
 */
function doctorCommand(args: string[]): void {
  let result: ReturnType<typeof doctor>;
  try {
    result = doctor(args);
  } catch (e) {
    return stop(e instanceof Error ? e.message : String(e));
  }
  if (json) emit({ ok: true, value: result.report });
  else process.stdout.write(`${result.lines.join('\n')}\n`);
  process.exitCode = result.code;
}

/**
 * `braindog env diff|pins|check` and `braindog sync inventory`: how this machine's profiles differ, what is approved
 * on it, what each profile's servers say, and what a setup sync would carry from it. THEY READ, but for the pins file:
 * `env pins --forget` drops a pin, and `env check` keeps the one a yes gives. As `doctor`'s, the exit code is the
 * plan's and under `--json` the document is the plan either way.
 */
async function readsCommand(which: 'env' | 'sync', args: string[]): Promise<void> {
  let result: Awaited<ReturnType<typeof envCommand>> | Awaited<ReturnType<typeof syncCommand>>;
  try {
    result = which === 'env' ? await envCommand(args) : await syncCommand(args, { sealed: sealedSeen });
  } catch (e) {
    return stop(e instanceof Error ? e.message : String(e));
  }
  if (json) emit({ ok: true, value: result.report });
  else process.stdout.write(`${result.lines.join('\n')}\n`);
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives: the record may have been read. */
  process.exitCode = result.code;
  setTimeout(() => process.exit(result.code), 1_000).unref();
}

/**
 * `braindog env apply`, over the real terminal (`env-apply.ts`), and its exit code. NOT ONE OF `readsCommand`'s,
 * because it asks y/N at the terminal as it goes and prints each step as it happens, as `setup` does, and for the same
 * reason it takes no `--json`: its strict `parseArgs` refuses the flag in its own words. Ctrl+C at a question is a no.
 */
async function envApplyCommand(args: string[]): Promise<void> {
  const stopping = new AbortController();
  process.on('SIGINT', () => stopping.abort());
  const cwd = process.cwd();
  const code = await envApply(args, {
    env: process.env,
    cwd,
    home: homedir(),
    out: (line: string) => writeFileSync(1, `${line}\n`),
    say,
    signal: stopping.signal,
    cli: fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/'),
    scripts: hookScripts(),
    /* The record is read with no session headers (`env-apply.ts`), so this is never asked; `AgentIo` has it. */
    headers: async () => ({}),
  });
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog sync join|push|pull|patches|drill|retire`, over the real terminal (§5.20), and its exit code. Not one of
 * `readsCommand`'s, for `env apply`'s reasons: each prints for a person as it goes and may ask at the terminal, and
 * each refuses `--json` through its own strict `parseArgs`. `sync push --auto`, which a hook starts in the background
 * with nobody to read it, writes every line to `~/.braindog/sync.log` and asks nothing.
 */
async function syncActCommand(verb: string, args: string[]): Promise<void> {
  const stopping = new AbortController();
  process.on('SIGINT', () => stopping.abort());
  const home = homedir();
  const auto = verb === 'push' && args.includes('--auto');
  const toLog = (line: string) => logLine(home, line);
  const io: SyncIo = {
    env: process.env,
    home,
    cwd: process.cwd(),
    out: auto ? toLog : (line: string) => writeFileSync(1, `${line}\n`),
    say: auto ? toLog : say,
    signal: stopping.signal,
    ...(auto ? { terminal: false } : {}),
  };
  const verbs: Record<string, (args: string[], io: SyncIo) => Promise<number>> = { join: syncJoin, push: syncPush, pull: syncPull, patches: syncPatches, drill: syncDrill, retire: syncRetire };
  const run = verbs[verb];
  if (run === undefined) return stop(`braindog sync takes inventory, ${SYNC_VERBS.join(', ')}.`);
  const code = await run(args, io);
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

function install(args: string[]): void {
  let values: { apply?: boolean | undefined; replace?: string | undefined; 'config-dir'?: string[] | undefined; settings?: string[] | undefined; 'mcp-json'?: string[] | undefined; rewake?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        apply: { type: 'boolean' },
        replace: { type: 'string' },
        'config-dir': { type: 'string', multiple: true },
        settings: { type: 'string', multiple: true },
        'mcp-json': { type: 'string', multiple: true },
        rewake: { type: 'boolean' },
      },
      strict: true,
    }));
  } catch {
    return stop('braindog install takes --apply, --replace <replace.json>, --config-dir <folder>, --settings <file>, --mcp-json <file> and --rewake, and nothing else.');
  }
  const scripts = hookScripts();
  /* THE FILE IS READ BEFORE ANYTHING ELSE IS, so a replace file that does not read changes nothing anywhere. */
  let replace: Replace | undefined;
  if (values.replace !== undefined) {
    try {
      replace = readReplace(values.replace);
    } catch (e) {
      return stop(e instanceof Error ? e.message : String(e));
    }
  }
  /* THE WATCHER ONLY WHEN TYPED (`--rewake`): it is off by default until it is tried on a signed-in session. */
  const options = { apply: values.apply === true, replace, scripts, rewake: values.rewake === true };
  const dirs = values['config-dir'] ?? [];
  const files = values.settings ?? [];
  const mcpFiles = values['mcp-json'] ?? [];
  const lines: string[] = [];
  /* A NAMED FILE OR FOLDER IS THE WHOLE LIST: the user profile is changed only when nothing else is named. */
  /* ONE CHANGE ACROSS EVERY PROFILE AND FILE. Looping `installInto` per profile made each profile's two files
     all-or-nothing and nothing more, so a malformed third profile left the first two cut over. */
  const profiles = files.length > 0 && dirs.length === 0 ? [] : profilesOf(dirs, process.env);
  const run = installProfiles(profiles, files, options, mcpFiles);
  lines.push(...run.lines);
  /*
   * EVERY SESSION STILL OPEN ON A PROFILE THIS RUN CHANGES, NAMED BY ITS PROCESS ID. A cut-over's first step is to
   * close them all, and three were found open on the default profile and two on a named one with
   * nothing in the install's output to say so: its one sentence about open sessions was printed under `.claude.json`
   * alone and gave a reason that was not observed. A line, never a refusal (see `openSessionsLine`).
   */
  const open = profiles.flatMap((dir) => {
    const said = openSessionsLine(dir, openSessions(dir), options.replace?.name ?? null);
    return said === null ? [] : [said];
  });
  if (open.length > 0) lines.push('', ...open);
  /* Named, the .mcp.json is in the run above, and telling the person to do it by hand would be wrong. */
  if (options.replace && mcpFiles.length === 0) lines.push('', replaceByHand(options.replace));
  /*
   * ONE LINE PER PROFILE LEFT WITHOUT THE SERVER, each naming its profile. It was one line for the run, withheld when
   * any file gained the entry, and a second profile ended with no server and no line. A run that names only settings files has no profile to name, so
   * its line is for the profile the shell is in, as it always was.
   *
   * HEADED WITH THE SHELL IT IS FOR, because that is chosen from the environment and can be wrong (see `shellOf`).
   * Each form is refused whole by the other shells, and the heading is what tells him which window to paste it into.
   */
  const shell = shellOf();
  const hand = profiles.length === 0 ? [handRun(shell)] : byHand(run.unserved, undefined, shell);
  if (hand.length > 0) lines.push('', 'The MCP server is registered once per profile by Claude Code itself, and install does not run it.', `In ${shell}, run:`, ...hand);
  if (json) {
    for (const line of lines) json.out(line);
    emit(json.envelope(0));
    return;
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

/**
 * The commands `--json` is offered on: every one but the six §4.5 excludes, and one verb below that
 * behaves like them.
 *
 * THE SIX ARE EXCLUDED BECAUSE THEY HAVE NO ANSWER TO PUT IN AN ENVELOPE, not because the work was
 * skipped. `mcp` is a transport and its stdout is the JSON-RPC protocol; `keys exec` and `run` hand
 * stdout to a child process; `hook start` and `hook end` print a card to Claude Code, which reads
 * text; `init` and `serve` pass a spawned self-host's streams straight through. Each of the six is
 * left to refuse the flag in its own words, which is the answer a caller deserves rather than an
 * empty document.
 *
 * `setup` AND `keys headers` ARE LEFT OFF IT FOR THE SAME REASON: the second prints the one header document a
 * program reads from stdout, and the first prints for a person while its first step may wait for six digits
 * (`setupCommand`, `48 §5.15`, `§5.16`). Both refuse the flag through their own strict `parseArgs`.
 */
const JSON_COMMANDS = new Set(['--version', '-v', 'help', '--help', '-h', 'login', 'logout', 'attach', 'skills', 'tools', 'page', 'usecase', 'pack', 'kennel', 'import', 'export', 'token', 'context', 'session', 'automations', 'scripts', 'install', 'verify', 'runner', 'people', 'understand', 'signs', 'tidy', 'private-terms', 'doctor', 'env', 'sync', 'actions', 'today', 'widget']);

/* `pack` IS THE OLD NAME OF `addon`, AND `usecase` OF `starter`, kept working: each pair is the one handler, with the same
   subcommands. */
const [named, ...rest] = process.argv.slice(2);
const command = named === 'addon' ? 'pack' : named === 'starter' ? 'usecase' : named;
const helpName = (c: string): string => (c === 'pack' ? 'addon' : c === 'usecase' ? 'starter' : c);
/* ONE DECISION, TAKEN BEFORE DISPATCH (`48 §4.5`, `json.ts`): the flag is answered here and removed,
   so no command's own `parseArgs` has to know a global exists. */
const cut = takeJson(rest);
/* `keys put`, `keys list` AND `keys scan` ARE THE THREE VERBS OF THEIR COMMAND THAT HAVE AN ANSWER: the first deposits a key and reports which
   credential row it became (or, with --from, the names sealed), the second reads the keys the record holds, never a value, and the third names the keys lying in files. `keys exec` hands stdout to a child process and takes no envelope (§4.5),
   and `keys headers` prints the one header document a program reads there, so the flag is offered on
   the verb rather than on the command. */
/* `usecase preview`, AND `pack preview` BESIDE IT, IS A SEVENTH COMMAND WITH NOTHING TO PUT IN AN ENVELOPE, for the reason §4.5 gives
   about `init` and `serve`: it spawns the self-host with `stdio: 'inherit'`, so the child owns this
   process's stdout until Ctrl+C. Measured before this line existed, `usecase preview <file> --json`
   left `BrainDog self-host listening on http://localhost:5870` on stdout and then the document beneath
   it, and `JSON.parse` over that buffer throws. Left out of the flag, the verb's own strict
   `parseArgs` refuses `--json` in its own words, exactly as `keys exec` does. */
/* AND `env apply`, WHICH PRINTS FOR A PERSON AND ASKS AT THE TERMINAL AS `setup` DOES, so the flag reaches its own strict
   `parseArgs` and is refused there in its own words. The sync verbs but `inventory` are the same. */
const syncAct = command === 'sync' && SYNC_VERBS.includes(rest[0] ?? '');
const noEnvelope = ((command === 'usecase' || command === 'pack') && rest[0] === 'preview') || (command === 'pack' && rest[0] === 'dev') || (command === 'env' && rest[0] === 'apply') || syncAct;
const takesJson = !noEnvelope && (JSON_COMMANDS.has(command ?? '') || (command === 'keys' && (rest[0] === 'put' || rest[0] === 'list' || rest[0] === 'scan')));
const args = takesJson ? cut.rest : rest;
if (takesJson && cut.json) json = machine(say);
try {
  /* FIRST, `48 §5.1`: a version is answered by this build alone, so it needs no host, no token and no
     hosts file, and it answers even when all three are missing. */
  if (command === '--version' || command === '-v') {
    /* THE FOUR NUMBERS BY NAME, because the readable line joins them with a middle dot and a caller
       comparing one of them against its own would be splitting a sentence to get it back. */
    if (json) emit({ ok: true, value: { app: build(), format: FORMAT_VERSION, kernel: KERNEL_MIGRATION, primitives: PRIMITIVES_VERSION } });
    else process.stdout.write(`${version()}\n`);
  } else if (command !== undefined && command !== 'help' && asksHelp(rest) && helpOf(helpName(command)).length > 0) {
    const lines = helpOf(helpName(command));
    if (json) {
      for (const line of lines) json.out(line);
      emit(json.envelope(0));
    } else process.stdout.write(`${lines.join('\n')}\n`);
  } else if (command === 'mcp') await mcp(rest);
  else if (command === 'setup') await setupCommand(rest);
  else if (command === 'runner') await runnerCommand(args);
  else if (command === 'login') await signIn(args);
  /* LOCAL ONLY, AND IT OPENS NO SOCKET, so it needs none of the guards the others end with. */
  else if (command === 'logout') {
    const code = await logout(args, { file: hostsPath(process.env), env: process.env, say: json ? json.say : say, answer: json?.answer });
    if (json) emit(json.envelope(code));
    process.exitCode = code;
  } else if (command === 'keys') await keysCommand(args);
  /* IT OPENS THE APP AND SETS NOTHING (`bypass.ts` says why), so it reads no token and sends nothing. */
  else if (command === 'bypass') process.exitCode = bypassCommand(args, { env: process.env, out: (line) => process.stdout.write(`${line}\n`), err: say, open: process.stdout.isTTY ? systemOpen : undefined });
  /* `run` IS `keys exec` UNDER ITS SHORTER NAME (`48 §2`), not a second door: it opens a key into one
     environment variable. The two verbs that print a key are `keys headers` and `keys helper`, through one
     function, to a program and never to a terminal, and neither has a shorter name, so nobody reaches one by typing less. */
  else if (command === 'run') await keysCommand(['exec', ...rest]);
  else if (command === 'export') await brainfileCommand('export', args);
  else if (command === 'token') await brainfileCommand('token', args);
  /* AN ADAPTER IMPORT TAKES TWO WORDS OR AN OPTION OF ITS OWN, and any other `import` is a .brainl put back
     (`isAdapterImport`). Asked of the whole line rather than of a position, because both take `--host <h>` anywhere. */
  else if (command === 'import' && !(await import('./import.ts')).isAdapterImport(args)) await brainfileCommand('import', args);
  else if (command === 'attach' || command === 'skills' || command === 'tools' || command === 'page' || command === 'usecase' || command === 'pack' || command === 'kennel' || command === 'import' || command === 'context' || command === 'session' || command === 'automations' || command === 'scripts' || command === 'verify' || command === 'people' || command === 'understand' || command === 'signs' || command === 'tidy' || command === 'feed' || command === 'private-terms' || command === 'actions' || command === 'today' || command === 'widget') await agentCommand(command, args);
  else if (command === 'hook') await hook(rest);
  else if (command === 'statusline') await statuslineCommand(rest);
  else if (command === 'install') install(args);
  else if (command === 'doctor') doctorCommand(args);
  else if (command === 'env' && rest[0] === 'apply') await envApplyCommand(rest.slice(1));
  else if (syncAct) await syncActCommand(rest[0] ?? '', rest.slice(1));
  else if (command === 'env' || command === 'sync') await readsCommand(command, args);
  /* THE FILE IT REPLACES IS THIS ONE: in the bundle every module is the one file, and from a checkout `build()` says
     `dev+0000000` and `update` refuses before it touches anything. */
  else if (command === 'update') process.exitCode = await update(rest, { file: fileURLToPath(import.meta.url), build: build(), env: process.env, out: (line) => process.stdout.write(`${line}\n`), err: say });
  else if (command === 'init' || command === 'serve') selfhost(command, rest);
  else if (command === 'help' || command === '--help' || command === '-h') {
    /* `help` IS NOT ONE OF THE SIX §4.5 EXCLUDES, so it answers the flag rather than ignoring it.
       Measured before this branch existed, `braindog help --json` printed the usage to stdout unchanged
       and exited 0, which is the one outcome worse than refusing: a caller piping to a parser gets
       eighty lines of prose and no sign the flag was dropped. */
    if (json) {
      for (const line of usage().split('\n')) json.out(line);
      emit(json.envelope(0));
    } else process.stdout.write(`${usage()}\n`);
  } else if (command === undefined) stop(usage());
  /* A plain word is echoed, to catch a typo. Anything else could be a token pasted in the wrong place. ONE LINE AND THE
     WAY TO THE LIST, not the hundred lines of the usage under it, which pushed the typo off the top of the terminal. */
  else stop(`braindog has no ${/^[a-z][a-z-]{0,31}$/.test(command) ? `command called ${command}` : 'such command'}. braindog --help lists every command.`);
} catch (e) {
  stop(e instanceof Error ? e.message : String(e));
}
