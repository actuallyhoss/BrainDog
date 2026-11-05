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
  /* THE EXAMPLE NAMES WHAT THIS BRAINDOG KEEPS (first hour audit, AH25): a student was told "like an order". */
  /* A BLANK BRAINDOG IS OFFERED A TO-DO (`blankOf`): it keeps People and Work's tasks, and "like somebody you met" sent
     its first line to People when the one place made for a day's things is Work. */
  sub: (lists: readonly string[] = []) =>
    blankOf(lists)
      ? `On Today, type something you need to do, like “${TO_DO_SAID}”. BrainDog puts it where it belongs, and one Undo takes it back.`
      : `On Today, type something that happened, like ${exampleOf(lists)}. BrainDog puts it where it belongs, and one Undo takes it back.`,
  /* WHAT WAS JUST MADE, first, by its places: the screen opened on a terminal command and never said. */
  /* THE PLACES THE RAIL SHOWS, AND MORE AS THEY FILL (AM10): Projects and Work come with their first entry. */
  made: (places: readonly string[]) => (places.length === 0 ? 'Your BrainDog is made.' : `Your BrainDog is made, with ${firstRun.and(places)}, and more as you fill them.`),
  agentTitle: 'Connect an AI app',
  agentOptional: 'Optional. You can also do this later in Settings.',
  agentSub: 'Claude, ChatGPT and coding apps can read and update your BrainDog once connected. You can also do this later in Settings, under Agents.',
  waiting: 'Waiting for your agent…',
  connected: (who: string) => `Connected: ${who}`,
  go: 'Go to Today',
} as const;

/**
 * The five apps, in the order a person is likeliest to have them. VS Code takes its own command for an HTTP server;
 * the others take what `connectLines` already hands the connect sheet.
 *
 * CLAUDE FIRST AT EVERY WIDTH, then ChatGPT (first hour audit, AH25, his call): the apps with no terminal lead, since
 * the person who just made a BrainDog for a candle shop opened on Claude Code's `curl` on a laptop. The coding apps
 * follow. Settings > Agents keeps its own order (`CONNECT_TILES`).
 */
export function appLines(lines: ConnectLines, install: string = lines.install): AppLine[] {
  const all = everyApp(lines, install);
  const pasted = ['claude', 'chatgpt'];
  return [...pasted.flatMap((id) => all.filter((a) => a.id === id)), ...all.filter((a) => !pasted.includes(a.id))];
}

/**
 * The few things this BrainDog keeps, said as "an order, a bill or somebody you met", by the lists it has (or the
 * places just made, by name): at most
 * three, in the order a person is likeliest to say them. A list it does not know says nothing, and a BrainDog with none
 * of these is given the three that read for anybody.
 */
const EXAMPLES: readonly (readonly [readonly string[], string])[] = [
  [['orders'], 'an order'],
  [['assignments'], 'an essay that is due'],
  [['cycle_plan', 'tickets'], 'a bug to fix'],
  [['milestones', 'steps', 'guide'], 'the next step'],
  [['goals', 'savings_goals'], 'a goal'],
  [['obligations', 'money', 'bills_and_invoices'], 'a bill'],
  [['people'], 'somebody you met'],
  [['tasks', 'work'], 'something to do'],
  [['things', 'projects'], 'a project'],
];

/** The to-do a blank BrainDog is offered: a day in it, so Work keeps it as a task due that day. */
export const TO_DO_SAID = 'Call the plumber tomorrow';

/** The examples these lists name, all of them, in `EXAMPLES`' order. */
const examplesIn = (lists: readonly string[]): string[] => {
  const kept = new Set(lists);
  return EXAMPLES.filter(([ids]) => ids.some((id) => kept.has(id))).map(([, words]) => words);
};

/**
 * WHETHER THIS IS A BRAINDOG NO STARTER SPEAKS FOR: the lists it keeps name nothing but People and Work's tasks (Work
 * is no place on the rail until its first task, so the places just made may say People alone). One that keeps nothing
 * known is not blank: nothing is known of it, and it is given the three that read for anybody.
 */
export function blankOf(lists: readonly string[]): boolean {
  const said = examplesIn(lists);
  return said.length > 0 && said.every((w) => w === 'somebody you met' || w === 'something to do');
}

export function exampleOf(lists: readonly string[]): string {
  const said = examplesIn(lists).slice(0, 3);
  const out = said.length > 0 ? said : ['something to do', 'a bill', 'somebody you met'];
  return out.length === 1 ? out[0]! : `${out.slice(0, -1).join(', ')} or ${out.at(-1)}`;
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
