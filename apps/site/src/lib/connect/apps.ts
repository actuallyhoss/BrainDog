/**
 * HOW EACH AGENT CONNECTS, as data: the connect box on the home page and on `/agents` draws these and types none of
 * its own (the prototype's `CONNECT`).
 *
 * Every way in is the one address, `MCP` in `links.ts`, with OAuth: the app opens BrainDog once to be approved, and no
 * key is pasted anywhere. Each line was checked against its maker's own docs on 17 October 2026:
 *   - Claude, in the app: support.claude.com, "Getting started with custom connectors": Customize, then Connectors,
 *     then Add custom connector, on every plan (Free holds one).
 *   - Claude, in a terminal: BrainDog's own `braindog setup` (docs/agents/connect, 29 October), which registers the
 *     server with Claude Code and adds the start hook that hands it the brief. The bare `claude mcp add` line is in the
 *     docs for a machine without the command line.
 *   - ChatGPT: help.openai.com's developer mode article, and the guides that follow it: developer mode is turned on in
 *     Settings, under Apps, and an app is made with the address. Not on the free plan.
 *   - Codex: the Codex docs on MCP: `[mcp_servers.<name>]` with `url` in `~/.codex/config.toml`, and
 *     `codex mcp login <name>` starts the OAuth sign-in. It does not start by itself.
 *   - Cursor: cursor.com/docs/context/mcp: `mcpServers` with `url`, in the project's `.cursor/mcp.json` or the one in
 *     the home folder.
 *   - VS Code: code.visualstudio.com, MCP servers: `code --add-mcp` takes the server's JSON with its name, and a remote
 *     server is `"type": "http"` with `url`. VS Code asks to trust a server added this way when it first starts it.
 *
 * A hint is one line. Words in backticks are code, drawn as code, so a command's own spelling stays as typed.
 */
import type { AppMark, MarkedAgent } from '@braindog/skin/agent-marks.ts';
import { listed } from '../agents.ts';
import { CLI_INSTALL, MCP } from '../links.ts';

/** The apps the site may name, each with its maker's mark. */
export type ConnectId = Extract<MarkedAgent, 'claude' | 'codex' | 'cursor'> | AppMark;

/** One way in: where it goes, what to paste or run, and the one line that says what happens next. */
export type Way = {
  /** What the code bar says the code is for, or the file it goes in. */
  where: string;
  /** True when `where` is a file, so it is drawn as code. */
  file?: boolean;
  code: string;
  hint: string;
};

export type ConnectApp = { id: ConnectId; name: string; ways: readonly [Way, ...Way[]] };

/** Every app the box knows; `CONNECT` is the ones the site names (`CODEX_LISTED` in `lib/agents.ts`). */
const EVERY_APP: readonly ConnectApp[] = [
  {
    id: 'claude',
    name: 'Claude',
    ways: [
      { where: 'In the app', code: MCP, hint: 'Customize, then Connectors, then add a custom connector with this address.' },
      /* THE COMMAND LINE'S SETUP (docs/agents/connect): it signs the machine in, adds the hooks that hand Claude Code
         your brief at the start of a session, and registers the MCP server, in one go. */
      {
        where: 'In a terminal',
        code: `${CLI_INSTALL}\nbraindog setup https://app.brain.dog/<your-record>`,
        hint: 'Approve the six digits it prints in BrainDog. Claude then starts every session with the briefing.',
      },
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    ways: [{ where: 'Connector address', code: MCP, hint: 'In Settings, under Apps, turn on developer mode and create an app with this address. Paid plans only.' }],
  },
  {
    id: 'codex',
    name: 'Codex',
    ways: [
      {
        where: '~/.codex/config.toml',
        file: true,
        code: `[mcp_servers.braindog]\nurl = "${MCP}"`,
        hint: 'Then run `codex mcp login braindog` once to approve it in BrainDog.',
      },
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    ways: [
      {
        where: '.cursor/mcp.json',
        file: true,
        code: `{\n  "mcpServers": {\n    "braindog": { "url": "${MCP}" }\n  }\n}`,
        hint: 'In your project, or in the .cursor folder in your home folder.',
      },
    ],
  },
  {
    id: 'vscode',
    name: 'VS Code',
    ways: [
      {
        where: 'Terminal',
        code: `code --add-mcp '{"name":"braindog","type":"http","url":"${MCP}"}'`,
        hint: 'Run it once, and VS Code asks you to trust it.',
      },
    ],
  },
];

export const CONNECT: readonly ConnectApp[] = EVERY_APP.filter((app) => listed(app.id));

/** The box's own words. */
export const CONNECT_WORDS = {
  tabs: 'Your agent',
  ways: 'Where it goes',
  copy: 'Copy',
  copied: 'Copied',
  /** What the button says when the browser refuses the clipboard and the code is selected for the reader to copy. */
  selected: 'Selected',
} as const;

/** How long "Copied" stays before the button says Copy again. */
export const COPIED_MS = 1600;

/** A hint in its parts: plain words, and the words in backticks as code. */
export const hintParts = (hint: string): { text: string; code: boolean }[] =>
  hint
    .split('`')
    .map((text, i) => ({ text, code: i % 2 === 1 }))
    .filter((p) => p.text !== '');

/** A hint as a person reads it, without its backticks. */
export const hintText = (hint: string): string => hint.replaceAll('`', '');
