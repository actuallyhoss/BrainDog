/**
 * What Claude Code says it is connected to (AGT-D10 job 6): every server and connector `claude mcp list` prints, as a
 * name and the address it printed, so the scan can record as integrations the ones no config file holds (a connector
 * added in the claude.ai app, a server a plugin registered).
 *
 * THE FORMAT IS CLAUDE CODE'S OWN, read from its documents (code.claude.com/docs/en/mcp, "claude mcp list shows a
 * health status next to each server it lists") and from a real run of 2.1.299, kept in `test/connected.test.ts` as
 * its sample, with the names and addresses made up. One line a server:
 *
 *   claude.ai Linear: https://mcp.linear.app/mcp - ✔ Connected
 *   plugin:slack:slack: https://mcp.slack.com/mcp (HTTP) - ! Needs authentication
 *   kiln: npx -y kiln-mcp - ✘ Failed to connect: HTTP 401
 *
 * The name runs to the first `: `, since a plugin's own name holds colons; the status starts at the first ` - ` that a
 * status mark follows. A target that is an address is the address, with the `(HTTP)` or `(SSE)` after it dropped; a
 * command is not an address, so it is `null`. A heading, a blank line and the "No MCP servers configured" line are not
 * entries; any other line it cannot read (a warning, a status it does not know) is skipped and counted.
 *
 * NAMES AS A PERSON READS THEM. Claude Code names a claude.ai connector `claude.ai <name>` and a plugin's server
 * `plugin:<plugin>:<server>`, both documented; the name kept is the connector's own, and the plugin's server's (with the
 * plugin's before it when the two differ). The name as printed is kept beside it, for matching a config's.
 *
 * NOTHING PRINTED IS RELAYED. Its output is read here and parsed; a line it says is only about what was not read.
 */

import { spawn } from 'node:child_process';

/** One entry: the name as a person reads it, the name as printed, and the address when one was printed. */
export type Connected = { name: string; listed: string; address: string | null };

/** What the list said: its entries, and the lines that say what could not be read and why. */
export type ConnectedList = { entries: Connected[]; lines: string[] };

/**
 * Run `claude` with these arguments in this folder within `ms`: its exit code and what it printed, `absent` when it
 * did not start, `late` when it ran past the limit and was stopped. `env`, when given, is its whole environment, so
 * `CLAUDE_CONFIG_DIR` picks the profile (`env check`), and `program` the file found for `claude`.
 */
export type ListRunner = (
  args: string[],
  cwd: string,
  ms: number,
  env?: Record<string, string | undefined>,
  program?: string,
) => Promise<{ code: number | 'absent' | 'late'; out: string }>;

/** The most of the output read, far beyond any list a person keeps. */
const MOST_OUT = 512 * 1024;

/** How long the list may take: it connects to every server to check it, ten seconds on a Mac with fifteen. */
export const LIST_MS = 30_000;

/**
 * The real one. NO SHELL, as `runClaude` runs it (`claude.ts`), with standard output read and standard error not:
 * `runClaude` hands back only an exit code, so this one is its own.
 */
export const runClaudeList: ListRunner = (args, cwd, ms, env, program = 'claude') =>
  new Promise((done) => {
    let out = '';
    let late = false;
    const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true, env: { ...(env ?? process.env), NO_COLOR: '1' } });
    const timer = setTimeout(() => {
      late = true;
      child.kill();
    }, ms);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (out.length < MOST_OUT) out += chunk;
    });
    child.on('error', () => {
      clearTimeout(timer);
      done({ code: 'absent', out: '' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: late ? 'late' : (code ?? 1), out });
    });
  });

/** The status marks Claude Code prints, ASCII and not. */
const LINE = /^(.+?): (.*?) - ([✔✓✘✗×!⏸⊘]) \S/u;

/**
 * How a server stood when the list checked it, by its mark alone, never by the words after it, which may quote an
 * error: connected, waiting on a sign-in, failed, waiting on an approval in a session, or turned off.
 */
export type Health = 'connected' | 'needs sign-in' | 'failed' | 'waiting' | 'off';
const HEALTH: Readonly<Record<string, Health>> = { '✔': 'connected', '✓': 'connected', '!': 'needs sign-in', '✘': 'failed', '✗': 'failed', '×': 'failed', '⏸': 'waiting', '⊘': 'off' };
const ADDRESS = /^(https?:\/\/\S+)(?: \((?:HTTP|SSE)\))?$/i;
const NOT_ENTRIES = [/^Checking MCP server health/i, /^No MCP servers configured/i];
/* The colours a terminal is sent, when NO_COLOR is not honoured. */
const COLOUR = /\u001b\[[0-9;]*m/g;

/** The connector's or the plugin server's own name, or the name as printed. */
function nameOf(listed: string): string {
  if (listed.startsWith('claude.ai ')) return listed.slice('claude.ai '.length).trim();
  const plugin = /^plugin:([^:]+):(.+)$/.exec(listed);
  if (plugin) return plugin[1] === plugin[2] ? plugin[2]! : `${plugin[1]!} ${plugin[2]!}`;
  return listed;
}

/** The entries of one printed list, each with how it stood, and how many lines that are not entries could not be read. */
export function healthOf(text: string): { entries: (Connected & { health: Health })[]; skipped: number } {
  const entries: (Connected & { health: Health })[] = [];
  let skipped = 0;
  for (const raw of text.replace(COLOUR, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || NOT_ENTRIES.some((x) => x.test(line))) continue;
    const at = LINE.exec(line);
    const listed = at?.[1]?.trim() ?? '';
    const name = nameOf(listed);
    if (at === null || name === '' || name.length > 64) {
      skipped++;
      continue;
    }
    const address = ADDRESS.exec(at[2]!.trim())?.[1] ?? null;
    if (!entries.some((e) => e.listed === listed)) entries.push({ name, listed, address, health: HEALTH[at[3]!] ?? 'failed' });
  }
  return { entries, skipped };
}

/** The entries of one printed list, and how many lines that are not entries could not be read. */
export function parseList(text: string): { entries: Connected[]; skipped: number } {
  const { entries, skipped } = healthOf(text);
  return { entries: entries.map(({ name, listed, address }) => ({ name, listed, address })), skipped };
}

/**
 * What Claude Code here says it is connected to. Claude Code absent, the list failing or running past its limit
 * answers no entries and the one line saying why; lines it could not read are counted in one more.
 */
export async function connectedOf(run: ListRunner, cwd: string, ms: number = LIST_MS): Promise<ConnectedList> {
  const got = await run(['mcp', 'list'], cwd, ms);
  if (got.code === 'absent') return { entries: [], lines: ['Claude Code was not found, so what it is connected to was not read.'] };
  if (got.code === 'late') return { entries: [], lines: [`claude mcp list took longer than ${String(Math.round(ms / 1000))} seconds, so what Claude Code is connected to was not read.`] };
  if (got.code !== 0) return { entries: [], lines: [`claude mcp list ended with exit ${String(got.code)}, so what Claude Code is connected to was not read.`] };
  const { entries, skipped } = parseList(got.out);
  const lines = skipped === 0 ? [] : [`${String(skipped)} line${skipped === 1 ? '' : 's'} of claude mcp list could not be read, so ${skipped === 1 ? 'it was' : 'they were'} skipped.`];
  return { entries, lines };
}
