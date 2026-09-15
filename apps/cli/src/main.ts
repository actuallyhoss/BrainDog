#!/usr/bin/env node
/**
 * `braindog`, the command on an agent's machine.
 *
 * FIVE COMMANDS ARE BUILT: `mcp`, the stdio server Claude Code launches (`loop/research-agent-path.md`
 * §1.1), `hook` and `install`, the session hooks of its §4, `login`, the device grant of its step 12, and `keys`, the
 * key doors of its step 18, and `skills` and `tools`, the sync and scan of its step 19. The rest of the plan's §4.2 is named, so
 * a person who types one learns it is coming rather than that it does not exist.
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

import { hookEnd, hookStart, readSession, sessionPath } from './hooks.ts';
import { budgetOf, clientFor, hostsPath, target } from './http.ts';
import { installInto, profilesOf } from './install.ts';
import { keys, spawnInherit } from './keys.ts';
import { login } from './login.ts';
import { AGENTS, isAgent, positionOf, sessionHeaders } from './position.ts';
import { skills } from './skills.ts';
import { serveStdio } from './stdio.ts';
import { surfaceOver } from './surface.ts';
import { tools } from './tools.ts';

/* Synchronous, so the line is out before `exit`: a write to a pipe on Windows is asynchronous, and
   `process.exit` does not wait for it. */
const say = (line: string) => writeFileSync(2, `${line}\n`);

const stop = (line: string): never => {
  say(line);
  return process.exit(1);
};

const LATER = ['logout', 'session', 'run', 'context', '--version'];

const usage = () =>
  [
    'braindog login <host> [--vault <project|*>]',
    '  Sign this machine in. It prints six digits to approve in the app, and keeps the token in the hosts file.',
    '  With --vault it asks for a grant that opens the keys of one project, or with * the keys of no project.',
    'braindog keys put <label> [--opens <what>] [--kind <kind>] [--vault <project>] [--host <host>]',
    '  Deposit the value on standard input as a key. The host seals it, and it is never an argument.',
    'braindog keys exec <label | credentials#n> [--as <ENV_NAME>] [--vault <project>] [--host <host>] -- <command> [args...]',
    '  Run the command with the key in one environment variable, named from the label unless --as names it. It is never printed.',
    'braindog skills sync [--host <host>] [--dry-run]',
    "  Write the record's skills where Claude Code reads them, keep a local edit and propose it, and register a skill kept by hand.",
    'braindog tools scan [--host <host>] [--dry-run]',
    '  Record the MCP servers in .mcp.json and ~/.claude.json. A key found there is deposited, and only its name is recorded.',
    'braindog tools write [--scope user|project] [--dry-run]',
    "  Show the Claude Code entries the record's tools become, and apply one scope only when it is named. No entry holds a key.",
    'braindog mcp [--agent claude|codex|cursor|other] [--host <host>]',
    '  Serve BrainDog to an agent over standard input and output. The agent starts it.',
    'braindog hook start|end',
    '  What Claude Code runs when a session starts and ends, with its event on standard input.',
    'braindog install [--apply] [--config-dir <folder>]',
    "  Show the two hooks it would add to Claude Code's settings, and write them only with --apply.",
    'braindog init <slug> --owner <email>',
    'braindog serve [<record file>]',
    '  Create or serve a record on this machine, through the self-host.',
    '',
    `The host comes from --host, then BRAINDOG_HOST, then the default in ${hostsPath(process.env)}.`,
    'The token comes from BRAINDOG_TOKEN, then the same file. It is never taken as an argument.',
    `Not built yet: ${LATER.join(', ')}.`,
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
  /* Every reply is flushed by now. Exiting rather than waiting for the event loop to empty, because an
     idle keep-alive socket to the host could hold it open. */
  process.exit(0);
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
  const code = await login(host, { file: hostsPath(process.env), say, signal: stopping.signal, vault: parsed.values.vault });
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
    say,
    spawn: spawnInherit,
    /* The run the session file names, sent only to the host that wrote it, as `mcp` does. */
    headers: async (host) => {
      const held = readSession(sessionPath(process.env, cwd));
      return sessionHeaders(await positionOf(cwd), undefined, held?.host === host ? held : undefined);
    },
  });
  /* LEFT TO END ON ITS OWN, for the reason `hook` gives. */
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1_000).unref();
}

/** `braindog skills|tools`, over the real terminal, and the exit code the command decides. */
async function agentCommand(which: 'skills' | 'tools', args: string[]): Promise<void> {
  const cwd = process.cwd();
  const io = {
    env: process.env,
    cwd,
    home: homedir(),
    out: (line: string) => writeFileSync(1, `${line}\n`),
    say,
    /* The run the session file names, sent only to the host that wrote it, as `mcp` does. */
    headers: async (host: string) => {
      const held = readSession(sessionPath(process.env, cwd));
      return sessionHeaders(await positionOf(cwd), undefined, held?.host === host ? held : undefined);
    },
  };
  const cli = fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/');
  const code = which === 'skills' ? await skills(args, io) : await tools(args, { ...io, cli });
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
  let values: { apply?: boolean | undefined; 'config-dir'?: string[] | undefined };
  try {
    ({ values } = parseArgs({ args, options: { apply: { type: 'boolean' }, 'config-dir': { type: 'string', multiple: true } }, strict: true }));
  } catch {
    return stop('braindog install takes --apply and --config-dir <folder>, and nothing else.');
  }
  const scripts = fileURLToPath(new URL('../hooks/', import.meta.url));
  const lines: string[] = [];
  for (const dir of profilesOf(values['config-dir'] ?? [], process.env)) lines.push(...installInto(dir, { apply: values.apply === true, scripts }));
  const cli = fileURLToPath(new URL('./main.ts', import.meta.url)).replaceAll('\\', '/');
  lines.push(
    '',
    'The MCP server is registered once per profile by Claude Code itself, and install does not run it:',
    `claude mcp add-json braindog '${JSON.stringify({ type: 'stdio', command: 'node', args: [cli, 'mcp', '--agent', 'claude'] })}' --scope user`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'mcp') await mcp(rest);
  else if (command === 'login') await signIn(rest);
  else if (command === 'keys') await keysCommand(rest);
  else if (command === 'skills' || command === 'tools') await agentCommand(command, rest);
  else if (command === 'hook') await hook(rest);
  else if (command === 'install') install(rest);
  else if (command === 'init' || command === 'serve') selfhost(command, rest);
  else if (command === 'help' || command === '--help' || command === '-h') process.stdout.write(`${usage()}\n`);
  else if (command !== undefined && LATER.includes(command)) stop(`braindog ${command} is not built yet.`);
  else if (command === undefined) stop(usage());
  /* A plain word is echoed, to catch a typo. Anything else could be a token pasted in the wrong place. */
  else stop(`braindog has no ${/^[a-z][a-z-]{0,31}$/.test(command) ? `command called ${command}` : 'such command'}.\n\n${usage()}`);
} catch (e) {
  stop(e instanceof Error ? e.message : String(e));
}
