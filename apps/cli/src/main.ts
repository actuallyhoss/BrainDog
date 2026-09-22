#!/usr/bin/env node
/**
 * `braindog`, the command on an agent's machine.
 *
 * THE WHOLE OF `loop/research-agent-path.md` §4.2 IS BUILT: `mcp`, the stdio server Claude Code
 * launches (§1.1), `hook` and `install`, the session hooks of its §4, `login` and `logout`, the device
 * grant of its step 12 and its other half, `keys` and `run`, the key doors of its step 18, `skills`
 * and `tools`, the sync and scan of its step 19, and `session` and `context`, the handoff and the
 * briefing from a shell. There is no longer a list of commands that name themselves and do nothing:
 * a word this command does not know is a typo, and it says so.
 *
 * `init` AND `serve` BELONG TO THE SELF-HOST, which has no `bin` of its own and whose messages tell
 * people to run `braindog init` and `braindog serve`. This command claims the name and hands those two
 * to the self-host's entry in a child process (`docs/48-SPEC-CLI.md` §5.14). Apps never import each
 * other, so it is spawned, never imported.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';
import { PRIMITIVES_VERSION } from 'braindog-render';

import { hookEnd, hookStart, readSession, sessionPath } from './hooks.ts';
import { budgetOf, clientFor, hostsPath, target } from './http.ts';
import { importCommand } from './import.ts';
import { REPLACE_BY_HAND, installEvery, profilesOf } from './install.ts';
import { machine, takeJson, type Machine } from './json.ts';
import { keys, spawnInherit } from './keys.ts';
import { login } from './login.ts';
import { logout } from './logout.ts';
import { page as pageCommand } from './page.ts';
import { AGENTS, isAgent, positionOf, sessionHeaders } from './position.ts';
import { context } from './context.ts';
import { session } from './session.ts';
import { skills } from './skills.ts';
import { serveStdio } from './stdio.ts';
import { surfaceOver } from './surface.ts';
import { pack } from './catalogue.ts';
import { tools } from './tools.ts';
import { usecase } from './usecase.ts';

/* Synchronous, so the line is out before `exit`: a write to a pipe on Windows is asynchronous, and
   `process.exit` does not wait for it. */
const say = (line: string) => writeFileSync(2, `${line}\n`);

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
    'braindog login <host> [--vault <project|*>]',
    '  Sign this machine in. It prints six digits to approve in the app, and keeps the token in the hosts file.',
    '  With --vault it asks for a grant that opens the keys of one project, or with * the keys of no project.',
    'braindog logout [<host>] [--host <host>]',
    "  Remove this machine's token, runner token and vault grants for one host from the hosts file. Nothing is sent, and the host is not told.",
    'braindog keys put <label> [--opens <what>] [--kind <kind>] [--vault <project>] [--host <host>]',
    '  Deposit the value on standard input as a key. The host seals it, and it is never an argument.',
    'braindog keys exec <label | credentials#n> [--as <ENV_NAME>] [--vault <project>] [--host <host>] -- <command> [args...]',
    '  Run the command with the key in one environment variable, named from the label unless --as names it. It is never printed.',
    'braindog run <label | credentials#n> [--as <ENV_NAME>] [--vault <project>] [--host <host>] -- <command> [args...]',
    '  The same as keys exec, under a shorter name.',
    'braindog skills sync [--host <host>] [--dry-run]',
    "  Write the record's skills where Claude Code reads them, keep a local edit and propose it, and register a skill kept by hand.",
    'braindog tools scan [--host <host>] [--dry-run]',
    '  Record the MCP servers in .mcp.json and ~/.claude.json. A key found there is deposited, and only its name is recorded.',
    'braindog tools write [--scope user|project] [--dry-run]',
    "  Show the Claude Code entries the record's tools become, and apply one scope only when it is named. No entry holds a key.",
    'braindog session show|next <text>|tried <text>|note <text>|end [--state idle|handoff|done] [--next <text>]',
    '  Address the run this folder is in: read where it stands, leave a next step, a thing tried or a note, or end it.',
    'braindog context [--host <host>]',
    '  Print the briefing again: this run and where it stands, the last handoff, who else is live, what waits on the owner, and what applies here.',
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
    'braindog usecase new <id> [--title <title>] [--author <name>] [--out <file>]',
    '  Write a starting use-case file, one list and a page over it, that already reads the way a record will read it.',
    'braindog usecase diff <earlier file> <later file>',
    '  Say what moved between two versions of a use case, and the least version bump that needs. Nothing is sent.',
    'braindog usecase publish <file> --to <folder> [--sign <key file>]',
    '  Add a version to a catalogue folder: never one already there, never an earlier one, and a major when it takes something away.',
    'braindog usecase search [words] --from <folder|address>',
    '  List what a catalogue holds, with what each can reach and call out to. Nothing is sent to a record.',
    'braindog usecase preview <file> [--port <n>]',
    '  Start a scratch BrainDog on this machine with the file in its catalogue, to install and look at. Removed when it stops.',
    'braindog pack new|check|diff|search|install <...>',
    '  The same for an add-on (a .pack.json file): new <id>, check <file>, diff <a> <b>, search [words] --from <catalogue>, install <id> --from <catalogue>.',
    'braindog pack publish <file> --to <folder> [--sign <key file>]',
    '  Add an add-on version to a catalogue folder, by the same rules, signed with an author key when one is named.',
    'braindog pack key <file> --author <name>',
    '  Make an author key in a file you choose, outside any repository. Keep it private: it signs what you publish.',
    'braindog pack key rotate <old key file> <new key file> --to <folder>',
    '  Name a new key as the successor of the old one in a catalogue, signed by the old key, so readers who trusted it trust the new one.',
    'braindog pack key revoke <key file> --to <folder> --reason <why> [--successor <key id>]',
    '  Mark a key as untrusted in a catalogue, signed by that key. Versions it signed are said as untrusted and not offered.',
    'braindog import legacy <export.json> [--setup <setup.json>] [--host <host>] [--dry-run] | --draft-setup',
    '  Move a the old tool export into this BrainDog. Running it again updates what it added, and no key value is ever read.',
    'braindog mcp [--agent claude|codex|cursor|other] [--host <host>]',
    '  Serve BrainDog to an agent over standard input and output. The agent starts it.',
    'braindog hook start|end',
    '  What Claude Code runs when a session starts and ends, with its event on standard input.',
    'braindog install [--apply] [--replace] [--config-dir <folder>] [--settings <file>]',
    "  Show the two hooks it would add to Claude Code's settings (a profile folder, or one settings file such as a project's .claude/settings.local.json), and write them only with --apply. With --replace it also takes out the old tool's hooks and MCP servers, and says which.",
    'braindog init <slug> --owner <email>',
    'braindog serve [<record file>]',
    '  Create or serve a record on this machine, through the self-host.',
    'braindog --version',
    '  The build, the file format it writes, the kernel it expects, and the primitives it renders.',
    '',
    `The host comes from --host, then BRAINDOG_HOST, then the default in ${hostsPath(process.env)}.`,
    'The token comes from BRAINDOG_TOKEN, then the same file. It is never taken as an argument.',
    '--json answers with one JSON document on stdout and moves every other line to stderr. mcp, keys exec, run, hook, init and serve do not take it.',
  ].join('\n');

async function mcp(args: string[]): Promise<void> {
  let values: { host?: string | undefined; agent?: string | undefined };
  try {
    ({ values } = parseArgs({ args, options: { host: { type: 'string' }, agent: { type: 'string' } }, strict: true }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token somebody passed by mistake. */
    return stop('braindog mcp takes --agent and --host, and nothing else. A token is never an argument.');
  }
  const { agent } = values;
  if (agent !== undefined && !isAgent(agent)) return stop(`--agent is one of ${AGENTS.join(', ')}.`);

  /* Anything that logs with console.log would write into the protocol. */
  console.log = console.info = console.debug = console.error;

  const to = target(values.host, process.env, hostsPath(process.env));
  /* Started now and awaited by the first request, so git runs while the client is still saying hello. */
  const where = positionOf(process.cwd());
  /* READ PER REQUEST, because Claude Code may start this server before the start hook has written the
     file, and a compaction or a clear can name a different run. A file for another host names a run
     there, so it is not sent here. */
  const file = sessionPath(process.env, process.cwd());
  const headers = async () => {
    const held = readSession(file);
    return sessionHeaders(await where, agent, held?.host === to.key ? held : undefined);
  };
  const surface = await surfaceOver((ctx) => clientFor(to, headers, ctx.signal));

  /* A closed stdout means nobody is left to read the answers. */
  process.stdout.on('error', () => process.exit(0));
  const ms = budgetOf(process.env);
  await serveStdio(surface, () => ({ signal: AbortSignal.timeout(ms) }), process.stdin, process.stdout);
  /* Every reply is flushed by now. LEFT TO END ON ITS OWN, and ended after a second if an idle keep-alive
     socket to the host holds it open, for the reason `hook` gives: `process.exit` straight after the last
     reply aborted Node 24 on Windows with a libuv assertion when the client closed standard input. */
  process.exitCode = 0;
  setTimeout(() => process.exit(0), 1_000).unref();
}

/** `braindog login <host> [--vault <scope>]`: one host, and the exit code `login` decides. */
async function signIn(args: string[]): Promise<void> {
  const wrong = 'braindog login takes one host, as in braindog login https://app.brain.dog/<slug>, and --vault <project>, and nothing else.';
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

/** `braindog keys put|exec`, over the real terminal, and the exit code `keys` decides. */
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
    answer: json?.answer,
    spawn: spawnInherit,
    /* The run the session file names, sent only to the host that wrote it, as `mcp` does. */
    headers: async (host) => {
      const held = readSession(sessionPath(process.env, cwd));
      return sessionHeaders(await positionOf(cwd), undefined, held?.host === host ? held : undefined);
    },
  });
  if (json) emit(json.envelope(code));
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/**
 * `braindog skills|tools|page|usecase|import|context|session`, over the real terminal, and the exit
 * code the command decides.
 *
 * `--json` IS DECIDED HERE AND NOWHERE ELSE (`48 §4.5`, `json.ts`). The eight commands below all take
 * the same `AgentIo`, so swapping where `out` goes is the whole of the flag: not one line in a command
 * body asks whether it was given.
 */
async function agentCommand(which: 'skills' | 'tools' | 'page' | 'usecase' | 'pack' | 'import' | 'context' | 'session', args: string[]): Promise<void> {
  const cwd = process.cwd();
  const io = {
    env: process.env,
    cwd,
    home: homedir(),
    out: json ? json.out : (line: string) => writeFileSync(1, `${line}\n`),
    say: json ? json.say : say,
    answer: json?.answer,
    /* The run the session file names, sent only to the host that wrote it, as `mcp` does. */
    headers: async (host: string) => {
      const held = readSession(sessionPath(process.env, cwd));
      return sessionHeaders(await positionOf(cwd), undefined, held?.host === host ? held : undefined);
    },
  };
  const cli = fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/');
  const code =
    which === 'context' ? await context(args, io) : which === 'session' ? await session(args, io) : which === 'import' ? await importCommand(args, io) : which === 'skills' ? await skills(args, io) : which === 'tools' ? await tools(args, { ...io, cli }) : which === 'usecase' ? await usecase(args, io) : which === 'pack' ? await pack(args, io) : await pageCommand(args, io);
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
  const write = (text: string) => writeFileSync(1, `${text}\n`);
  if ((which !== 'start' && which !== 'end') || more.length > 0) {
    say('braindog hook takes start or end, and nothing else. Claude Code runs it, with the event on standard input.');
    return process.exit(0);
  }
  try {
    let stdin = '';
    try {
      if (!process.stdin.isTTY) stdin = readFileSync(0, 'utf8');
    } catch {
      /* No stdin at all is an empty event. */
    }
    const io = { env: process.env, stdin, cwd: process.cwd(), write };
    await (which === 'start' ? hookStart(io) : hookEnd(io));
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

function install(args: string[]): void {
  let values: { apply?: boolean | undefined; replace?: boolean | undefined; 'config-dir'?: string[] | undefined; settings?: string[] | undefined };
  try {
    ({ values } = parseArgs({
      args,
      options: { apply: { type: 'boolean' }, replace: { type: 'boolean' }, 'config-dir': { type: 'string', multiple: true }, settings: { type: 'string', multiple: true } },
      strict: true,
    }));
  } catch {
    return stop('braindog install takes --apply, --replace, --config-dir <folder> and --settings <file>, and nothing else.');
  }
  const scripts = fileURLToPath(new URL('../hooks/', import.meta.url));
  const options = { apply: values.apply === true, replace: values.replace === true, scripts };
  const dirs = values['config-dir'] ?? [];
  const files = values.settings ?? [];
  const lines: string[] = [];
  /* A NAMED FILE OR FOLDER IS THE WHOLE LIST: the user profile is changed only when nothing else is named. */
  /* ONE CHANGE ACROSS EVERY PROFILE AND FILE. Looping `installInto` per profile made each profile's two files
     all-or-nothing and nothing more, so a malformed third profile left the first two cut over (audit twenty-four,
     finding 1). */
  lines.push(...installEvery(files.length > 0 && dirs.length === 0 ? [] : profilesOf(dirs, process.env), files, options));
  if (options.replace) lines.push('', REPLACE_BY_HAND);
  const cli = fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/');
  lines.push(
    '',
    'The MCP server is registered once per profile by Claude Code itself, and install does not run it:',
    `claude mcp add-json braindog '${JSON.stringify({ type: 'stdio', command: 'node', args: [cli, 'mcp', '--agent', 'claude'] })}' --scope user`,
  );
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
 * stdout to a child process; `hook start` and `hook end` print a briefing to Claude Code, which reads
 * text; `init` and `serve` pass a spawned self-host's streams straight through. Each of the six is
 * left to refuse the flag in its own words, which is the answer a caller deserves rather than an
 * empty document.
 */
const JSON_COMMANDS = new Set(['--version', '-v', 'help', '--help', '-h', 'login', 'logout', 'skills', 'tools', 'page', 'usecase', 'pack', 'import', 'context', 'session', 'install']);

const [command, ...rest] = process.argv.slice(2);
/* ONE DECISION, TAKEN BEFORE DISPATCH (`48 §4.5`, `json.ts`): the flag is answered here and removed,
   so no command's own `parseArgs` has to know a global exists. */
const cut = takeJson(rest);
/* `keys put` IS THE ONE VERB OF ITS COMMAND THAT HAS AN ANSWER: it deposits a key and reports which
   credential row it became. `keys exec` hands stdout to a child process and takes no envelope (§4.5),
   so the flag is offered on the verb rather than on the command. */
/* `usecase preview` IS A SEVENTH COMMAND WITH NOTHING TO PUT IN AN ENVELOPE, for the reason §4.5 gives
   about `init` and `serve`: it spawns the self-host with `stdio: 'inherit'`, so the child owns this
   process's stdout until Ctrl+C. Measured before this line existed, `usecase preview <file> --json`
   left `BrainDog self-host listening on http://localhost:5870` on stdout and then the document beneath
   it, and `JSON.parse` over that buffer throws. Left out of the flag, the verb's own strict
   `parseArgs` refuses `--json` in its own words, exactly as `keys exec` does. */
const noEnvelope = command === 'usecase' && rest[0] === 'preview';
const takesJson = !noEnvelope && (JSON_COMMANDS.has(command ?? '') || (command === 'keys' && rest[0] === 'put'));
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
  else if (command === 'login') await signIn(args);
  /* LOCAL ONLY, AND IT OPENS NO SOCKET, so it needs none of the guards the others end with. */
  else if (command === 'logout') {
    const code = await logout(args, { file: hostsPath(process.env), env: process.env, say: json ? json.say : say, answer: json?.answer });
    if (json) emit(json.envelope(code));
    process.exitCode = code;
  } else if (command === 'keys') await keysCommand(args);
  /* `run` IS `keys exec` UNDER ITS SHORTER NAME (`48 §2`), not a second door: one command opens a key
     into one environment variable, and adding a way to print one would undo the reason it exists. */
  else if (command === 'run') await keysCommand(['exec', ...rest]);
  else if (command === 'skills' || command === 'tools' || command === 'page' || command === 'usecase' || command === 'pack' || command === 'import' || command === 'context' || command === 'session') await agentCommand(command, args);
  else if (command === 'hook') await hook(rest);
  else if (command === 'install') install(args);
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
