#!/usr/bin/env node
/**
 * `braindog`, the command on an agent's machine.
 *
 * ONE COMMAND IS BUILT: `mcp`, the stdio server Claude Code launches (`loop/research-agent-path.md`
 * §1.1). The rest of the plan's §4.2 is named, so a person who types one learns it is coming rather
 * than that it does not exist.
 *
 * `init` AND `serve` BELONG TO THE SELF-HOST, which has no `bin` of its own and whose messages tell
 * people to run `braindog init` and `braindog serve`. This command claims the name and hands those two
 * to the self-host's entry in a child process (`docs/48-SPEC-CLI.md` §5.14). Apps never import each
 * other, so it is spawned, never imported.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { budgetOf, clientFor, hostsPath, target } from './http.ts';
import { AGENTS, isAgent, positionOf, sessionHeaders } from './position.ts';
import { serveStdio } from './stdio.ts';
import { surfaceOver } from './surface.ts';

/* Synchronous, so the line is out before `exit`: a write to a pipe on Windows is asynchronous, and
   `process.exit` does not wait for it. */
const say = (line: string) => writeFileSync(2, `${line}\n`);

const stop = (line: string): never => {
  say(line);
  return process.exit(1);
};

const LATER = ['hook', 'login', 'logout', 'session', 'key', 'run', 'skills', 'tools', 'context', 'install', '--version'];

const usage = () =>
  [
    'braindog mcp [--agent claude|codex|cursor|other] [--host <host>]',
    '  Serve BrainDog to an agent over standard input and output. The agent starts it.',
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
  const headers = async () => sessionHeaders(await where, agent);
  const surface = await surfaceOver((ctx) => clientFor(to, headers, ctx.signal));

  /* A closed stdout means nobody is left to read the answers. */
  process.stdout.on('error', () => process.exit(0));
  const ms = budgetOf(process.env);
  await serveStdio(surface, () => ({ signal: AbortSignal.timeout(ms) }), process.stdin, process.stdout);
  /* Every reply is flushed by now. Exiting rather than waiting for the event loop to empty, because an
     idle keep-alive socket to the host could hold it open. */
  process.exit(0);
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

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'mcp') await mcp(rest);
  else if (command === 'init' || command === 'serve') selfhost(command, rest);
  else if (command === 'help' || command === '--help' || command === '-h') process.stdout.write(`${usage()}\n`);
  else if (command !== undefined && LATER.includes(command)) stop(`braindog ${command} is not built yet.`);
  else if (command === undefined) stop(usage());
  /* A plain word is echoed, to catch a typo. Anything else could be a token pasted in the wrong place. */
  else stop(`braindog has no ${/^[a-z][a-z-]{0,31}$/.test(command) ? `command called ${command}` : 'such command'}.\n\n${usage()}`);
} catch (e) {
  stop(e instanceof Error ? e.message : String(e));
}
