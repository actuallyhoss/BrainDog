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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';
import { PRIMITIVES_VERSION } from 'braindog-render';

import { automations, scripts } from './automations.ts';
import { behindLine } from './behind.ts';
import { serveBridge } from './bridge.ts';
import { exportFile, importFile } from './brainfile.ts';
import { HOOK_MS, heldHere, hookEnd, hookStart, parentOf, unreachable } from './hooks.ts';
import { hookBeat } from './beat.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
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
import { AGENTS, isAgent, positionOf, sessionHeaders, type ClientInfo } from './position.ts';
import { context } from './context.ts';
import { doctor } from './doctor.ts';
import { session } from './session.ts';
import { skills } from './skills.ts';
import { signedOutFix, signedOutSurface } from './signed-out.ts';
import { serveStdio } from './stdio.ts';
import { surfaceOver } from './surface.ts';
import { runner } from './runner.ts';
import { setup } from './setup.ts';
import { tools } from './tools.ts';
import { tokenCommand } from './token.ts';
import { update } from './update.ts';
import { verify } from './verify.ts';

/* Synchronous, so the line is out before `exit`: a write to a pipe on Windows is asynchronous, and
   `process.exit` does not wait for it. */
const say = (line: string) => writeFileSync(2, `${line}\n`);

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
 */
function hookScripts(): string {
  const checkout = fileURLToPath(new URL('../hooks/', import.meta.url));
  if (existsSync(join(checkout, 'braindog-hook.ps1'))) return checkout;
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'hooks');
  mkdirSync(dir, { recursive: true });
  const ps1 = [
    "param([string]$Which = 'start')",
    '$OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::OutputEncoding = $OutputEncoding',
    "$cli = Join-Path $PSScriptRoot '..\\braindog.mjs'",
    'try {',
    '  $raw = [Console]::In.ReadToEnd()',
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
  const sh = [
    '#!/bin/sh',
    'which="${1:-start}"',
    'dir=$(dirname "$0")',
    'if [ "$which" = beat ]; then',
    '  raw=$(cat)',
    `  id=$(printf '%s' "$raw" | grep -o '"session_id" *: *"[A-Za-z0-9._:-]*"' | head -n 1 | sed 's/.*"\\([^"]*\\)"$/\\1/; s/[^A-Za-z0-9_-]/_/g')`,
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

const usage = () =>
  [
    'braindog setup <host> [--dry-run | --yes]',
    "  Set this machine up from one record, in order: sign in unless it already is, add the two hooks to Claude Code's settings, register the braindog MCP server, write the tools the record applies everywhere, and sync its skills. One line per step, and it stops at the first that fails.",
    'braindog login <host> [--vault <project|*>]',
    '  Sign this machine in. It prints six digits to approve in the app, and keeps the token in the hosts file.',
    '  With --vault it asks for a grant that opens the keys of one project, or with * the keys of no project.',
    'braindog logout [<host>] [--host <host>]',
    "  Remove this machine's token, runner token and vault grants for one host from the hosts file. Nothing is sent, and the host is not told.",
    'braindog keys list [--project <name>] [--everywhere] [--json] [--host <host>]',
    '  The keys your record holds, one line each: what each opens, where it applies, whether it is sealed, and the day it expires. Never a value.',
    'braindog keys put <label> [--opens <what>] [--kind <kind>] [--vault <project>] [--host <host>]',
    '  Deposit the value on standard input as a key. The host seals it, and it is never an argument.',
    'braindog keys exec <label | credentials#n> [--as <ENV_NAME>] [--vault <project>] [--host <host>] -- <command> [args...]',
    '  Run the command with the key in one environment variable, named from the label unless --as names it. It is never printed.',
    'braindog run <label | credentials#n> [--as <ENV_NAME>] [--vault <project>] [--host <host>] -- <command> [args...]',
    '  The same as keys exec, under a shorter name.',
    'braindog keys headers <credentials#n | label> --as <Header> [--vault <project>] [--host <host>]',
    "  Print the key as one header, {\"<Header>\":\"<value>\"}, for a program that reads it, such as Claude Code's headersHelper. It refuses to print to a terminal.",
    'braindog skills sync [--host <host>] [--dry-run]',
    "  Write the record's skills where Claude Code reads them, keep a local edit and propose it, and register a skill kept by hand.",
    'braindog tools scan [--host <host>] [--dry-run]',
    '  Record the MCP servers in .mcp.json and ~/.claude.json. A key found there is deposited, and only its name is recorded.',
    'braindog tools write [--scope user|project] [--dry-run]',
    "  Show the Claude Code entries the record's tools become, and apply one scope only when it is named. No entry holds a key.",
    'braindog session show|next <text>|tried <text>|note <text>|end [--state idle|handoff|done] [--next <text>]',
    '  Address the run this folder is in: read where it stands, leave a next step, a thing tried or a note, or end it.',
    'braindog context [--host <host>]',
    '  Print the card again: this run and where it stands, the next step, what waits on a person, what was learned here, and what else there is to ask for.',
    'braindog page pull <slug> [--host <host>] [--out <file>]',
    "  Fetch a page's declaration and write it as <page>.dog: one page, one file, in the source view's dialect.",
    'braindog page push <file> [--host <host>]',
    '  Read a .dog file and set it as the page. An owner in the app only: a token is refused, this CLI included.',
    'braindog page check <file>',
    '  Validate a .dog file against the authoring grammar, locally. Nothing is sent.',
    'braindog usecase list [--host <host>]',
    '  Say the use cases on this BrainDog, the one speaking, and the ones on offer. A read.',
    'braindog usecase export [--out <file>] [--title <title>] [--version <x.y.z>] [--example <list>:<n>,<n>] [--host <host>]',
    "  Save this BrainDog's arrangement as a use-case file: its modules, lists, pages, voice and labels, and only the rows named.",
    'braindog usecase check <file>',
    '  Read a use-case file the way a record will, locally: its size, any credential, its shape and its block kinds. Nothing is sent.',
    'braindog usecase install <id|file|url> [--from <catalogue>] [--version <x.y.z>] [--host <host>]',
    '  Ask the owner to install a use case on offer, a shared one, or one from a catalogue held to its checksum: files a proposal and prints its link on Decide. Nothing is installed until they accept it.',
    'braindog usecase new <id> [--title <title>] [--author <name>] [--out <file>] [--yaml]',
    '  Write a starting use-case file, one list and a page over it, that already reads the way a record will read it.',
    'braindog usecase diff <earlier file> <later file>',
    '  Say what moved between two versions of a use case, and the least version bump that needs. Nothing is sent.',
    'braindog usecase publish <file> --to <folder> | --kennel [host] [--sign <key file>]',
    '  Add a version to a catalogue folder, or submit it to the Kennel: never one already there, never an earlier one, and a major when it takes something away.',
    'braindog usecase yank <id> <version> --reason <why> [--kennel host] [--sign <key file>]',
    '  Take a version back on the Kennel. It is never offered again, and a record holding it is told why.',
    'braindog usecase search [words] [--from <folder|address> | --kennel [host]]',
    '  List what a catalogue holds, the Kennel when no --from is named, with what each can reach and call out to. Nothing is sent to a record.',
    'braindog usecase preview <file> [--port <n>]',
    '  Start a scratch BrainDog on this machine with the file in its catalogue, to install and look at. Removed when it stops.',
    'braindog pack new <id> [--title <title>] [--author <name>] [--out <folder>] [--yaml]',
    '  Write a starting add-on folder: its .pack.json (or .pack.yaml), a first page over a first list with two example rows, its test and a README.',
    'braindog pack check <file|dir>',
    '  Read an add-on, JSON or YAML, warn on any key its manifest does not take, and install it in a scratch record here, saying every refusal a record would give. Nothing is sent.',
    'braindog pack test <dir>',
    '  Install the add-on in a scratch record, write the rows in its <id>.test.json and say each expectation as passed or failed. Nothing is sent.',
    'braindog pack preview <file|dir> [--port <n>]',
    '  Start a scratch BrainDog on this machine with the add-on in its catalogue, and print its page. Removed when it stops.',
    'braindog pack diff|search|install|yank <...>',
    '  The same as for a use case: diff <a> <b>, search [words] [--from <catalogue> | --kennel [host]], install <id|file> [--from <catalogue>], yank <id> <version> --reason <why>.',
    'braindog pack publish <file> --to <folder> | --kennel [host] [--sign <key file>]',
    '  Add an add-on version to a catalogue folder, or submit it to the Kennel and say whether it is listed or waits for review, signed with an author key or as the person signed in.',
    'braindog kennel review [show|list|refuse <kind> <id> <version>] [--reason <why>] [--kennel <host>] | trust <publisher>',
    "  The Kennel operator's review, with PROVISION_KEY set: what waits; show installs one in a scratch record and prints what it reaches and calls out to; list sends it with a preview of its pages; refuse says why; trust lists a publisher's files at once.",
    'braindog pack key <file> --author <name>',
    '  Make an author key in a file you choose, outside any repository. Keep it private: it signs what you publish.',
    'braindog pack key rotate <old key file> <new key file> --to <folder>',
    '  Name a new key as the successor of the old one in a catalogue, signed by the old key, so readers who trusted it trust the new one.',
    'braindog pack key revoke <key file> --to <folder> --reason <why> [--successor <key id>]',
    '  Mark a key as untrusted in a catalogue, signed by that key. Versions it signed are said as untrusted and not offered.',
    'braindog automations list|show <id> [--host <host>]',
    '  Say every automation you can read, what starts it and how its runs went; or one, with its last ten runs step by step.',
    'braindog automations run <id>|cancel <run> [--host <host>]',
    '  Start an automation now, or stop a run that has not finished. The record lets only a browser session do either, so a token is told so.',
    'braindog scripts resume <id> [--host <host>]',
    '  Start a script paused by three refused runs in a row again. A browser session only, as run and cancel are.',
    'braindog export [--kek <id> | --redact-grants] [--sections <data,origin,governance>] [-o <file.brainl>] [--key <pubkey|url>] [--host <host>]',
    '  Take the record as a .brainl file and check it here. A backup carries the sealed bytes and names the key they are wrapped by; with --redact-grants it is a copy to share, and cannot put the keys back.',
    'braindog export --shape [-o <file.shape.brainl>] [--host <host>]',
    "  Take a copy of the record's shape, with every word, number and date made up, to test on. The six digits are asked once, for a standing grant that takes shape copies and reads nothing else.",
    'braindog import <file.brainl> [--key <pubkey|url>] [--host <host>]',
    "  Check the file here, then put the record back from it, in place of everything it holds now. The record takes only its own copy.",
    '  Both ask the owner to approve the one operation in the app, with six digits, unless BRAINDOG_TOKEN is the self-host\'s server key.',
    'braindog import <adapter> <export.json> [--setup <setup.json>] [--map <map.json>] [--catalogue <folder|address>] [--host <host>] [--dry-run] [--strict] | --draft-setup | --since <day|last>',
    "  Move another tool's export into this BrainDog through its adapter: a pack id such as one in packs/, or the path of a module. Running it again updates what it added, and no key value is ever read.",
    'braindog import --map <map.json> <export.json> [--host <host>] [--dry-run] [--strict]',
    "  The same with no adapter: the map file says which list each part of the export goes to. --strict refuses the whole file when any part of it would not be read.",
    'braindog people harvest [--since <day>] [--whole-history] [--dry-run] [--host <host>]',
    "  Meet everybody with two or more commits in the repositories your projects list, by remote or folder, grouped by address, each with the project they worked in, at most 200 a run. Only commits since a repository joined its project count, and --whole-history counts every one. Repositories no project lists, bots, machines, coding agents and your own commits are left out, and nobody is met until People says which person is you. With --dry-run it prints who it would meet and sends nothing.",
    'braindog signs [--json] [--strict] [--host <host>]',
    "  Say your record's vital signs now: whether arrivals are filed, numbers arrive, questions pile up on one cause, how old the oldest open question is, and whether runs end as they should. One read: it opens no run. A red sign still exits 0; --strict exits 2 on any red, for scripts.",
    'braindog tidy [--json] [--host <host>]',
    "  Say what went stale on your record and the call that clears each: steps left earlier that nobody took, questions that waited, and what each finder found. One read: it opens no run, files nothing and answers nothing.",
    'braindog private-terms [--dry-run] [--host <host>]',
    "  Write your private list from your own record: your names, addresses and handles, the people you know by whole name, your machines and your accounts' digits and balances, into a file only you can read, which the public-clean check searches the repository for before a push. Lines you added stay, no term is ever printed, and the account the folder's repository is published under is left out. With --dry-run it counts and writes nothing.",
    'braindog understand --dry-run [--host <host>]',
    '  Say what your record would link and ask if it read what it already holds now: how many payments, runs and services of each kind, the first of those links, and its questions for Decide. It changes nothing.',
    'braindog feed propose <file> [--host <host>]',
    '  Ask on Decide for each live feed your setup file lists, built by the live feed add-on: where it calls and how often. Nothing is installed until you say yes there.',
    'braindog token create [--name <name>] [--scope <read|propose|write>] [--days <n>] [--inbox] [--host <host>]',
    "  Mint a token for an agent and print it once. It reads unless --scope names more, and with --inbox it may also read the money inbox.",
    "  The owner approves the one mint in the app, with six digits, unless BRAINDOG_TOKEN is the self-host's server key.",
    'braindog mcp [--agent claude|codex|cursor|other] [--host <host>] [--local]',
    "  Serve BrainDog to an agent over standard input and output, passing each message to the host's own server. The agent starts it. --local serves the tools this command holds, for seven nights after the bridge.",
    'braindog hook start|end|beat',
    '  What Claude Code runs when a session starts and ends, with its event on standard input. Once a day the start hook also says when this command is older than the host needs; it never updates by itself.',
    'braindog install [--apply] [--replace <replace.json>] [--config-dir <folder>] [--settings <file>] [--mcp-json <file>]',
    "  Show the two hooks it would add to Claude Code's settings (a profile folder, or one settings file such as a project's .claude/settings.local.json), and write them only with --apply. It also places BrainDog's Agent Skill in each profile's skills/braindog/. With --replace it also takes out the hooks, MCP servers and skills the replace file names as an old tool's, and says which, and from a .mcp.json only when it is named with --mcp-json and is outside any repository.",
    'braindog doctor [--replaced <replace.json>] [--under <folder>] [--config-dir <folder>] [--json]',
    "  Read this machine and list, by file and entry, what still names a tool BrainDog replaced, what holds something shaped like a key, and each profile missing BrainDog's server or a hook. It changes nothing and shows no value, and exits 1 when anything is listed.",
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
    'braindog init <slug> --owner <email>',
    'braindog serve [<record file>]',
    '  Create or serve a record on this machine, through the self-host.',
    'braindog update [--check]',
    '  Replace this command with the build that is out, held to its checksum, keeping the old one as braindog.mjs.prev, and place the Agent Skill and hooks again. --check only says whether it is behind.',
    'braindog --version',
    '  The build, the file format it writes, the kernel it expects, and the primitives it renders.',
    '',
    `The host comes from --host, then BRAINDOG_HOST, then the default in ${hostsPath(process.env)}.`,
    'The token comes from BRAINDOG_TOKEN, then the same file. It is never taken as an argument.',
    '--json answers with one JSON document on stdout and moves every other line to stderr. mcp, keys exec, keys headers, run, hook, setup, init and serve do not take it.',
  ].join('\n');

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
    to = target(values.host, process.env, hostsPath(process.env));
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

  /* SIGNED IN, THE SERVER IS THE HOST'S (`bridge.ts`, AGT-A03): each line goes to its `POST /mcp` with the same session
     headers, read per request, so a deploy reaches an open session. `--local` keeps the server this command composes
     for seven nights after the bridge ships, and then goes. A sign-in that ends mid-session is the bridge's to say. */
  if (values.local !== true) {
    await serveBridge({ input: process.stdin, output: process.stdout, say: (l) => process.stderr.write(`${l}\n`) }, to, async (client) =>
      sessionHeaders(await where, agent, heldHere(process.env, cwd, to.key, Date.now(), server), { env: process.env, client, parent: parentOf(process.env, to.key) }),
    );
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

/** `braindog login <host> [--vault <scope>]`: one host, and the exit code `login` decides. */
async function signIn(args: string[]): Promise<void> {
  /* `brain.dog` AND NOT `app.brain.dog`, because the example is the one address a person copies and only production's
     `PUBLIC_HOST` starts a device. This said `app.brain.dog` and that it "signs in on both sides" because the old name
     stays a Custom Domain of the same Worker; with production's vars a device start there answered 403 "This BrainDog
     signs devices in at https://brain.dog, so start there". Tokens minted
     on the old name keep working there, but a new login does not. `test/login.test.ts` reads the host from
     `apps/worker/wrangler.jsonc`, so a later move fails there rather than in somebody's terminal. */
  const wrong = 'braindog login takes one host, as in braindog login https://brain.dog/app/<slug>, and --vault <project>, and nothing else.';
  let parsed: { values: { vault?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { vault: { type: 'string' } } });
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
  const code = await login(host, { file: hostsPath(process.env), say: json ? json.say : say, signal: stopping.signal, vault: parsed.values.vault, answer: json?.answer });
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives: exiting straight after several requests aborted Node 24
     on Windows, and a success must exit 0. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/** `braindog keys list|put|exec|headers`, over the real terminal, and the exit code `keys` decides. */
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
    say: json ? json.say : say,
    /* `list` alone prints lines: kept for the one document under `--json`, and `keys`'s own stdout line otherwise. */
    out: json ? json.out : undefined,
    answer: json?.answer,
    spawn: spawnInherit,
    /* The run the session file names, sent only to the host that wrote it and only while it is the caller's, as `mcp` does. */
    headers: (host: string) => headersHere(cwd, host),
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
async function agentCommand(which: 'skills' | 'tools' | 'page' | 'usecase' | 'pack' | 'kennel' | 'import' | 'context' | 'session' | 'automations' | 'scripts' | 'verify' | 'people' | 'understand' | 'signs' | 'tidy' | 'feed' | 'private-terms', args: string[]): Promise<void> {
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
    which === 'feed' ? await (await import('./feed.ts')).feedCommand(args, io) : which === 'private-terms' ? await privateTermsCommand(args, io) : which === 'signs' ? await signsCommand(args, io) : which === 'tidy' ? await (await import('./tidy.ts')).tidyCommand(args, io) : which === 'people' ? await peopleCommand(args, io) : which === 'understand' ? await understandCommand(args, io) : which === 'context' ? await context(args, io) : which === 'session' ? await session(args, io) : which === 'import' ? await (await import('./import.ts')).importCommand(args, io) : which === 'skills' ? await skills(args, io) : which === 'tools' ? await tools(args, { ...io, cli }) : which === 'usecase' ? await (await import('./usecase.ts')).usecase(args, io) : which === 'pack' ? await (await import('./catalogue.ts')).pack(args, io) : which === 'kennel' ? await (await import('./kennel.ts')).kennel(args, io) : which === 'automations' ? await automations(args, io) : which === 'scripts' ? await scripts(args, io) : which === 'verify' ? await verify(args, io) : await pageCommand(args, io);
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
  const code = which === 'export' ? await exportFile(args, io) : which === 'token' ? await tokenCommand(args, io) : await importFile(args, io);
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog setup <host> [--dry-run]`, over the real terminal, and the exit code of the first step that failed.
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
  const stopping = new AbortController();
  process.on('SIGINT', () => stopping.abort());
  const code = await runner(args, {
    env: process.env,
    cwd: process.cwd(),
    home: homedir(),
    file: hostsPath(process.env),
    out: json ? json.out : (line: string) => writeFileSync(1, `${line}\n`),
    say: json ? json.say : say,
    answer: json?.answer,
    signal: stopping.signal,
  });
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

function selfhost(command: 'init' | 'serve', args: string[]): void {
  const entry = process.env.BRAINDOG_SELFHOST || fileURLToPath(new URL('../../selfhost/src/main.ts', import.meta.url));
  if (!existsSync(entry)) return stop(`braindog ${command} needs the self-host. Set BRAINDOG_SELFHOST to its entry file.`);
  const child = spawn(process.execPath, [entry, command, ...args], { stdio: 'inherit' });
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
async function hook(args: string[]): Promise<void> {
  const [which, ...more] = args;
  /* NINE SECONDS AT MOST, whatever the network does (AGT-B10): the hook ends at HOOK_MS counted from the process's own
     start (`performance.now()`), inside Claude Code's ten-second timeout. The start hook's own deadline starts later,
     so on a hung network this fires first and says the one line itself, unless a line was already written. */
  let said = false;
  setTimeout(() => {
    if (which === 'start' && !said) writeFileSync(1, `${unreachable(HOOK_MS)}\n`);
    process.exit(0);
  }, Math.max(0, HOOK_MS - performance.now())).unref();
  if ((which !== 'start' && which !== 'end' && which !== 'beat') || more.length > 0) {
    say('braindog hook takes start, end or beat, and nothing else. Claude Code runs it, with the event on standard input.');
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
     throws, waits at most two seconds and only on the first start of a day, and rides the same one write. */
  const behind = which === 'start' ? await behindLine({ env: process.env }) : null;
  const lapse = [which === 'start' ? lapseWarning(process.env, hostsPath(process.env)) : null, behind].filter((line): line is string => line !== null).join('\n') || null;
  const write = (text: string) => {
    said = true;
    writeFileSync(1, `${lapse === null ? '' : `${lapse}\n`}${text}\n`);
  };
  try {
    let stdin = '';
    try {
      if (!process.stdin.isTTY) stdin = readFileSync(0, 'utf8');
    } catch {
      /* No stdin at all is an empty event. */
    }
    const io = { env: process.env, stdin, cwd: process.cwd(), write };
    await (which === 'start' ? hookStart(io) : which === 'beat' ? hookBeat(io) : hookEnd(io));
  } catch {
    /* The error could quote anything, so the start hook says only that it failed. */
    if (which === 'start') write('BrainDog: the start hook failed, so this session works without shared context.');
  }
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

function install(args: string[]): void {
  let values: { apply?: boolean | undefined; replace?: string | undefined; 'config-dir'?: string[] | undefined; settings?: string[] | undefined; 'mcp-json'?: string[] | undefined };
  try {
    ({ values } = parseArgs({
      args,
      options: { apply: { type: 'boolean' }, replace: { type: 'string' }, 'config-dir': { type: 'string', multiple: true }, settings: { type: 'string', multiple: true }, 'mcp-json': { type: 'string', multiple: true } },
      strict: true,
    }));
  } catch {
    return stop('braindog install takes --apply, --replace <replace.json>, --config-dir <folder>, --settings <file> and --mcp-json <file>, and nothing else.');
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
  const options = { apply: values.apply === true, replace, scripts };
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
const JSON_COMMANDS = new Set(['--version', '-v', 'help', '--help', '-h', 'login', 'logout', 'skills', 'tools', 'page', 'usecase', 'pack', 'kennel', 'import', 'export', 'token', 'context', 'session', 'automations', 'scripts', 'install', 'verify', 'runner', 'people', 'understand', 'signs', 'tidy', 'private-terms', 'doctor']);

const [command, ...rest] = process.argv.slice(2);
/* ONE DECISION, TAKEN BEFORE DISPATCH (`48 §4.5`, `json.ts`): the flag is answered here and removed,
   so no command's own `parseArgs` has to know a global exists. */
const cut = takeJson(rest);
/* `keys put` AND `keys list` ARE THE TWO VERBS OF THEIR COMMAND THAT HAVE AN ANSWER: the first deposits a key and reports which
   credential row it became, and the second reads the keys the record holds, never a value. `keys exec` hands stdout to a child process and takes no envelope (§4.5),
   and `keys headers` prints the one header document a program reads there, so the flag is offered on
   the verb rather than on the command. */
/* `usecase preview`, AND `pack preview` BESIDE IT, IS A SEVENTH COMMAND WITH NOTHING TO PUT IN AN ENVELOPE, for the reason §4.5 gives
   about `init` and `serve`: it spawns the self-host with `stdio: 'inherit'`, so the child owns this
   process's stdout until Ctrl+C. Measured before this line existed, `usecase preview <file> --json`
   left `BrainDog self-host listening on http://localhost:5870` on stdout and then the document beneath
   it, and `JSON.parse` over that buffer throws. Left out of the flag, the verb's own strict
   `parseArgs` refuses `--json` in its own words, exactly as `keys exec` does. */
const noEnvelope = (command === 'usecase' || command === 'pack') && rest[0] === 'preview';
const takesJson = !noEnvelope && (JSON_COMMANDS.has(command ?? '') || (command === 'keys' && (rest[0] === 'put' || rest[0] === 'list')));
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
  /* `run` IS `keys exec` UNDER ITS SHORTER NAME (`48 §2`), not a second door: it opens a key into one
     environment variable. The one verb that prints a key is `keys headers`, to a program and never to a
     terminal, and it has no shorter name, so nobody reaches it by typing less. */
  else if (command === 'run') await keysCommand(['exec', ...rest]);
  else if (command === 'export') await brainfileCommand('export', args);
  else if (command === 'token') await brainfileCommand('token', args);
  /* AN ADAPTER IMPORT TAKES TWO WORDS OR AN OPTION OF ITS OWN, and any other `import` is a .brainl put back
     (`isAdapterImport`). Asked of the whole line rather than of a position, because both take `--host <h>` anywhere. */
  else if (command === 'import' && !(await import('./import.ts')).isAdapterImport(args)) await brainfileCommand('import', args);
  else if (command === 'skills' || command === 'tools' || command === 'page' || command === 'usecase' || command === 'pack' || command === 'kennel' || command === 'import' || command === 'context' || command === 'session' || command === 'automations' || command === 'scripts' || command === 'verify' || command === 'people' || command === 'understand' || command === 'signs' || command === 'tidy' || command === 'feed' || command === 'private-terms') await agentCommand(command, args);
  else if (command === 'hook') await hook(rest);
  else if (command === 'install') install(args);
  else if (command === 'doctor') doctorCommand(args);
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
  /* A plain word is echoed, to catch a typo. Anything else could be a token pasted in the wrong place. */
  else stop(`braindog has no ${/^[a-z][a-z-]{0,31}$/.test(command) ? `command called ${command}` : 'such command'}.\n\n${usage()}`);
} catch (e) {
  stop(e instanceof Error ? e.message : String(e));
}
