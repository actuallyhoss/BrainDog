/**
 * The first screen after sign-up, "Connect your agent": one line per app, and the sign that turns when the record hears
 * its first agent. PURE, so `node --test` can import it; `routes/start/Made.svelte` draws it.
 *
 * NO LINE CARRIES A KEY. An MCP app signs in by OAuth and `braindog setup` signs in itself (`connectLines`), so a
 * command or an address is all this page ever shows.
 */
import type { AppMark, MarkedAgent } from '@braindog/skin/agent-marks.ts';

import type { ConnectLines } from '../record/device.ts';
import { connectWords, type Heard } from './connect.ts';

/** One app and the line that connects it for this record. `mark` is the key of its maker's logo. */
export type AppLine = { id: string; name: string; mark: MarkedAgent | AppMark; what: string; line: string; button: string };

export const firstWords = {
  title: 'Connect your agent',
  sub: 'Pick the app you use and paste its line. Your agent then reads this BrainDog and writes back to it.',
  waiting: 'Waiting for your agent…',
  connected: (who: string) => `Connected: ${who}`,
  skip: 'Skip for now',
  go: 'Go to Today',
} as const;

/**
 * The five apps, in the order a person is likeliest to have them. VS Code takes its own command for an HTTP server;
 * the others take what `connectLines` already hands the connect sheet.
 */
export function appLines(lines: ConnectLines): AppLine[] {
  const vscode = JSON.stringify({ name: 'braindog', type: 'http', url: lines.mcp });
  return [
    { id: 'claude-code', name: 'Claude Code', mark: 'claude', what: 'Run in a terminal', line: lines.setup, button: connectWords.copyCommand },
    { id: 'claude', name: 'Claude', mark: 'claude', what: 'Settings, Connectors, add a custom connector', line: lines.web, button: connectWords.copyAddress },
    { id: 'chatgpt', name: 'ChatGPT', mark: 'chatgpt', what: 'Settings, Connectors, add a connector', line: lines.mcp, button: connectWords.copyAddress },
    { id: 'vscode', name: 'VS Code', mark: 'vscode', what: 'Run in a terminal', line: `code --add-mcp '${vscode}'`, button: connectWords.copyCommand },
    { id: 'cursor', name: 'Cursor', mark: 'cursor', what: 'Add to mcp.json', line: lines.cursor, button: connectWords.copyEntry },
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
