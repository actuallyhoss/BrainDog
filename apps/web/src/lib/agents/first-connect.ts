/**
 * The first screen after sign-up: what to do first on Today, then "Connect an AI app" for whoever uses one, with one
 * line per app and the sign that turns when the record hears its first agent. PURE, so `node --test` can import it; `routes/start/Made.svelte` draws it.
 *
 * NO LINE CARRIES A KEY. An MCP app signs in by OAuth and `braindog setup` signs in itself (`connectLines`), so a
 * command or an address is all this page ever shows.
 */
import type { AppMark, MarkedAgent } from '@braindog/skin/agent-marks.ts';

import type { ConnectLines } from '../record/device.ts';
import { firstRun } from '../first-run.ts';
import { connectWords, type Heard } from './connect.ts';

/** One app and the line that connects it for this record. `mark` is the key of its maker's logo. */
export type AppLine = { id: string; name: string; mark: MarkedAgent | AppMark; what: string; line: string; button: string; /** A line to run first, shown above `line` and copied with it, or `null`. */ before: string | null };

export const firstWords = {
  /* WHAT A PERSON DOES NEXT IN THE APP LEADS (first hour audit, E3): the screen opened on a terminal command, for a
     bakery, while the site says nobody needs to be technical. Today's card is the first act; an agent is the second. */
  title: 'Start with one real thing',
  sub: 'On Today, type something that happened, like an order, a bill or somebody you met. BrainDog puts it where it belongs, and one Undo takes it back.',
  /* WHAT WAS JUST MADE, first, by its places: the screen opened on a terminal command and never said. */
  made: (places: readonly string[]) => (places.length === 0 ? 'Your BrainDog is made.' : `Your BrainDog is made, with ${firstRun.and(places)}.`),
  agentTitle: 'Connect an AI app, if you use one',
  agentSub: 'Claude, ChatGPT and coding apps can read and update your BrainDog once connected. You can also do this later in Settings, under Agents.',
  waiting: 'Waiting for your agent…',
  connected: (who: string) => `Connected: ${who}`,
  go: 'Go to Today',
} as const;

/**
 * The five apps, in the order a person is likeliest to have them. VS Code takes its own command for an HTTP server;
 * the others take what `connectLines` already hands the connect sheet.
 *
 * ON A PHONE (`phone`) THE APPS WITH NO TERMINAL COME FIRST, Claude then ChatGPT: the phone's first screen
 * after sign-up was a `curl` command, which nobody runs on a phone.
 */
export function appLines(lines: ConnectLines, install: string = lines.install, phone = false): AppLine[] {
  const all = everyApp(lines, install);
  if (!phone) return all;
  const pasted = ['claude', 'chatgpt'];
  return [...pasted.flatMap((id) => all.filter((a) => a.id === id)), ...all.filter((a) => !pasted.includes(a.id))];
}

function everyApp(lines: ConnectLines, install: string): AppLine[] {
  const vscode = JSON.stringify({ name: 'braindog', type: 'http', url: lines.mcp });
  return [
    { id: 'claude-code', name: 'Claude Code', mark: 'claude', what: 'Run in a terminal', line: lines.setup, button: connectWords.copyCommand, before: install },
    { id: 'claude', name: 'Claude', mark: 'claude', what: 'Customize, then Connectors, add a custom connector', line: lines.web, button: connectWords.copyAddress, before: null },
    { id: 'chatgpt', name: 'ChatGPT', mark: 'chatgpt', what: 'Settings, then Apps, turn on developer mode, create an app', line: lines.mcp, button: connectWords.copyAddress, before: null },
    { id: 'vscode', name: 'VS Code', mark: 'vscode', what: 'Run in a terminal', line: `code --add-mcp '${vscode}'`, button: connectWords.copyCommand, before: null },
    { id: 'cursor', name: 'Cursor', mark: 'cursor', what: 'Add to mcp.json', line: lines.cursor, button: connectWords.copyEntry, before: null },
  ];
}

/** The newest call the record has heard, or null while none. A new record has had no earlier agent to mistake it for. */
export const firstHeard = (heard: readonly Heard[]): Heard | null =>
  [...heard].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;

/** What the sign says: waiting, or "Connected: Claude Code on MacBook". */
export const signOf = (heard: readonly Heard[]): { connected: boolean; said: string } => {
  const h = firstHeard(heard);
  if (h === null) return { connected: false, said: firstWords.waiting };
  return { connected: true, said: firstWords.connected(h.machine ? connectWords.on(h.app, h.machine) : h.app) };
};
