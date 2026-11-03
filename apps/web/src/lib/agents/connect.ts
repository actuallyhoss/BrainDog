/**
 * The connect sheet, what it decides with no runes: the ways in, the lines each one hands over, and the
 * live row under the open one that turns from "Waiting for its first call" to "Connected" when the app makes its call.
 *
 * PURE, SO `node --test` CAN IMPORT IT. The sheet (`ConnectSheet.svelte`) draws these and asks the record; the clock,
 * the rows and the timers are handed in.
 *
 * NO LINE CARRIES A KEY. Every app but a script signs in through the browser, so the lines are commands and the address
 * (`connectLines` in `record/device.ts`); a script's key is made in its own tile and shown once, as it always was.
 */

import { since } from 'braindog-render';

import { copy } from '../copy.ts';
import { INSTALL_LINES, type Os } from '../device.ts';
import type { ConnectLines } from '../record/device.ts';
import { nameWords, runByName } from '../record/names.ts';

/** The ways in, by the app each is for. */
export type TileId = 'claude-code' | 'claude-web' | 'chatgpt' | 'vscode' | 'cursor' | 'codex' | 'other' | 'script';

/** A line a tile hands over: the installer, the setup command, or one app's own line for doing it by hand. */
export type LineId = 'install' | 'setup' | 'claude' | 'codex' | 'cursor' | 'web' | 'chatgpt' | 'vscode' | 'other';

export type ConnectTile = {
  id: TileId;
  title: string;
  /** One sentence on what to do, said before the lines. */
  hint: string;
  /** The lines it shows, in order, each with its own Copy. */
  lines: readonly LineId[];
  /** Whether it holds the key form, which only a script's tile does. */
  key: boolean;
};

/**
 * THE WORDS THE SHEET SAYS: the three boxes' own where they still fit (the copy aggregate), and the sheet's new ones here,
 * so the sheet's chunk carries them and the entry does not.
 */
export const connectWords = {
  open: 'Connect an agent',
  sheetTitle: 'Connect an agent',
  sheetSub: 'Choose the app. Its first call shows here.',
  setupHint: copy.doorSetupHint,
  /* AS THE SITE SAYS IT (`apps/site/src/lib/connect/apps.ts`, checked against each maker's help on 17 October). */
  webHint: 'In Claude, open Customize, then Connectors, add a custom connector, and paste this address. Claude then sends you here to allow it.',
  chatgptHint: 'In ChatGPT, open Settings, then Apps, turn on developer mode, and create an app with this address. ChatGPT then sends you here to allow it.',
  vscodeHint: 'Run this in a terminal. VS Code then sends you here to allow it.',
  otherHint: copy.doorAnyHint,
  scriptHint: 'An app signs in. A key is for a script.',
  step: {
    install: copy.doorInstall,
    setup: copy.doorSetupRun,
    claude: 'Or add it to Claude Code by hand',
    codex: 'Or add it to Codex by hand',
    cursor: "Or add this to Cursor's MCP settings by hand",
    web: 'The address to paste',
    chatgpt: 'The address to paste',
    vscode: 'The command',
    other: 'The address',
  } satisfies Record<LineId, string>,
  copyCommand: copy.copyCommand,
  copyAddress: copy.copyAddress,
  copyEntry: 'Copy the entry',
  waiting: 'Waiting for its first call',
  connected: (who: string, ago: string) => `Connected: ${who}, called ${ago}`,
  earlier: (who: string, ago: string) => `Waiting for a new call. ${who} last called ${ago}.`,
  on: (app: string, machine: string) => `${app} on ${machine}`,
  justNow: 'just now',
  seconds: (n: number) => (n === 1 ? '1 second ago' : `${String(n)} seconds ago`),
  aScript: 'Your script',
  /* UNDER "MAY READ THE INBOX" in the script's key form: what it reads, and that it only reads. */
  inboxLine: 'Unfiled arrivals, like bank texts. Read only.',
} as const;

/**
 * THE APPS CONNECT YOUR AGENT OFFERS, IN ITS ORDER (`first-connect.ts`), so the first screen
 * and this sheet never offer different ones; then Codex, which setup also finds, the address alone, and the key.
 */
export const CONNECT_TILES: readonly ConnectTile[] = [
  { id: 'claude-code', title: 'Claude Code', hint: connectWords.setupHint, lines: ['install', 'setup', 'claude'], key: false },
  { id: 'claude-web', title: 'Claude', hint: connectWords.webHint, lines: ['web'], key: false },
  { id: 'chatgpt', title: 'ChatGPT', hint: connectWords.chatgptHint, lines: ['chatgpt'], key: false },
  { id: 'vscode', title: 'VS Code', hint: connectWords.vscodeHint, lines: ['vscode'], key: false },
  { id: 'cursor', title: 'Cursor', hint: connectWords.setupHint, lines: ['install', 'setup', 'cursor'], key: false },
  { id: 'codex', title: 'Codex', hint: connectWords.setupHint, lines: ['install', 'setup', 'codex'], key: false },
  { id: 'other', title: 'Any other app', hint: connectWords.otherHint, lines: ['other'], key: false },
  { id: 'script', title: 'A script', hint: connectWords.scriptHint, lines: [], key: true },
];

/** VS Code's own command for an HTTP server, the line Connect your agent gives it. */
const vscodeLine = (mcp: string): string => `code --add-mcp '${JSON.stringify({ name: 'braindog', type: 'http', url: mcp })}'`;

/** A line's text: the installer for the computer chosen, else the record's own line for it. */
export const lineOf = (id: LineId, lines: ConnectLines, os: Os): string =>
  id === 'install' ? INSTALL_LINES[os] : id === 'chatgpt' ? lines.mcp : id === 'vscode' ? vscodeLine(lines.mcp) : lines[id];

/** What a line's Copy says: an address, Cursor's entry, or a command. */
export const copyOf = (id: LineId): string =>
  id === 'web' || id === 'chatgpt' || id === 'other' ? connectWords.copyAddress : id === 'cursor' ? connectWords.copyEntry : connectWords.copyCommand;

/** A call the record heard: the way in it came through, the app by name, the kind of machine, and when. */
export type Heard = { tile: TileId; app: string; machine: string | null; at: string };

/** A key as `listTokens` answers it, in the keys read here. */
export type KeyHeard = { id: string; label: string | null; last_used_at: string | null };

const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/**
 * The kind of machine a run is on, from the name it gives itself, or `null`.
 *
 * NEVER THE HOST NAME. `Maras-MacBook-Pro.local` carries a person's name; the kind is what a person says, and is all
 * that is read out of it (the same reading as the agent door's own, `deviceOf` in `packages/mcp/src/words.ts`).
 */
export function machineOf(host: unknown): string | null {
  const h = text(host)?.toLowerCase();
  if (!h) return null;
  if (h.includes('macbook')) return 'MacBook';
  if (h.includes('imac')) return 'iMac';
  if (/mac-?mini/u.test(h)) return 'Mac mini';
  if (/mac-?studio/u.test(h)) return 'Mac Studio';
  if (/mac-?pro/u.test(h)) return 'Mac Pro';
  if (/^laptop-/u.test(h)) return 'Windows laptop';
  if (/^(desktop|win)-/u.test(h)) return 'Windows PC';
  if (h.includes('raspberry')) return 'Raspberry Pi';
  return null;
}

/**
 * Which way in a run came through, from the app it said it is and the kind of agent.
 *
 * THE APP'S OWN NAME FIRST, because `claude` is two apps: Claude Code names itself `claude-code`, the web `claude-ai`.
 * A Claude run with no app named is Claude Code where it says a machine and the web where it does not.
 */
function tileOfRun(f: Record<string, unknown>): TileId {
  const client = text(f.client)?.toLowerCase() ?? '';
  const agent = text(f.agent)?.toLowerCase() ?? '';
  if (/^claude[\s._-]*code/u.test(client)) return 'claude-code';
  if (/^(?:claude|anthropic)/u.test(client)) return 'claude-web';
  if (/codex/u.test(client) || (client === '' && agent === 'codex')) return 'codex';
  if (/^cursor/u.test(client) || (client === '' && agent === 'cursor')) return 'cursor';
  if (/^(?:openai|chatgpt)/u.test(client)) return 'chatgpt';
  if (/^(?:visual[\s-]*studio[\s-]*code|vscode)/u.test(client)) return 'vscode';
  if (client === '' && agent === 'claude') return text(f.host) ? 'claude-code' : 'claude-web';
  return 'other';
}

/**
 * The calls the record heard, newest first: the runs `list` answered for the `session` list, and the key a person just
 * made in the script tile (`made`), from when `listTokens` says it was last used.
 *
 * A RUN THE MADE KEY OPENED IS THE SCRIPT'S, whichever app it says it is: the key is what the person just handed over.
 */
export function heardOf(rows: readonly unknown[], keys: readonly KeyHeard[] = [], made: string | null = null): Heard[] {
  const out: Heard[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const f = (row as { fields?: unknown }).fields;
    if (typeof f !== 'object' || f === null) continue;
    const fields = f as Record<string, unknown>;
    const seen = text(fields.last_seen);
    if (seen === null || !Number.isFinite(Date.parse(seen))) continue;
    const scripted = made !== null && text(fields.token_id) === made;
    const tile = scripted ? 'script' : tileOfRun(fields);
    /* THE APP BY THE NAME IT GAVE, else the way in's own title, and never an id: `runByName` reads only a name. */
    const said = runByName({ agent: '', client: text(fields.client), parent: null });
    const own = CONNECT_TILES.find((t) => t.id === tile);
    const app = said !== nameWords.agent ? said : tile === 'other' || tile === 'script' || !own ? nameWords.agent : own.title;
    out.push({ tile, app, machine: machineOf(fields.host), at: seen });
  }
  const key = made === null ? undefined : keys.find((k) => k.id === made);
  if (key?.last_used_at && Number.isFinite(Date.parse(key.last_used_at))) {
    out.push({ tile: 'script', app: text(key.label) ?? connectWords.aScript, machine: null, at: key.last_used_at });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** How long ago, to the second under a minute, because the row is watched while it turns. */
export function agoOf(at: string, now: number): string {
  const n = Math.round((now - Date.parse(at)) / 1000);
  if (n < 1) return connectWords.justNow;
  return n < 60 ? connectWords.seconds(n) : since(at, now);
}

/** The live row under the open tile: what it says, and which of three it is, which the sheet marks beside the words. */
export type LiveRow = { state: 'waiting' | 'connected' | 'earlier'; said: string };

/** A call heard this long before the sheet opened still counts as the one it is waiting for: the two clocks differ. */
const SLACK_MS = 10_000;

/**
 * The sentence under the open tile, from the calls heard (`heardOf`), at `now`, for a sheet opened at `opened`.
 *
 * WAITING until the app makes a call; CONNECTED once one is heard since the sheet opened, "Connected: Claude Code on
 * MacBook, called 3 seconds ago"; and where this app was heard only before, it is waiting still, saying when it last
 * called, so a second computer being set up is not taken as done by the first one's old call.
 *
 * NO TOOL IS NAMED. The scope's row says "called context"; no read the record answers names a run's last tool (a
 * `session` row keeps `last_seen`, and `doorHealth` keeps `last_tool_at` with no name), so the row says the app, the
 * machine and when.
 */
export function liveRow(heard: readonly Heard[], tile: TileId, now: number, opened: number = now): LiveRow {
  const newest = heard.filter((h) => h.tile === tile).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (!newest) return { state: 'waiting', said: connectWords.waiting };
  const who = newest.machine ? connectWords.on(newest.app, newest.machine) : newest.app;
  const ago = agoOf(newest.at, now);
  if (Date.parse(newest.at) >= opened - SLACK_MS) return { state: 'connected', said: connectWords.connected(who, ago) };
  return { state: 'earlier', said: connectWords.earlier(who, ago) };
}

/** How often the open sheet asks the record again. */
export const POLL_MS = 2_000;

/** The timers and the page the poll needs, handed in so a test drives them. */
export type PollHost = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  document?: { visibilityState: string; addEventListener: (k: 'visibilitychange', fn: () => void) => void; removeEventListener: (k: 'visibilitychange', fn: () => void) => void } | undefined;
};

/**
 * Ask every two seconds while the tab is shown: once at once, then on the interval; stopped while the tab is hidden and
 * started again, with an ask at once, when it is shown. The answer stops it for good, which the sheet calls on close.
 */
export function poll(tick: () => void, host: PollHost = globalThis as unknown as PollHost): () => void {
  const doc = host.document;
  let timer: unknown = null;
  const halt = (): void => {
    if (timer !== null) host.clearInterval(timer);
    timer = null;
  };
  const start = (): void => {
    if (timer !== null || doc?.visibilityState === 'hidden') return;
    tick();
    timer = host.setInterval(tick, POLL_MS);
  };
  const seen = (): void => (doc?.visibilityState === 'hidden' ? halt() : start());
  doc?.addEventListener('visibilitychange', seen);
  start();
  return () => {
    halt();
    doc?.removeEventListener('visibilitychange', seen);
  };
}
