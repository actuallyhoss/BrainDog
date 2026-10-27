/**
 * Claude Desktop and VS Code, as the clients table holds them: where each keeps servers, the reader, and the writer
 * Both keep one JSON object of servers, as Cursor does, so both are written as `cursor.ts`
 * writes: by position, every other byte as it was.
 *
 * CLAUDE DESKTOP, FROM ITS OWN DOCUMENT (modelcontextprotocol.io/docs/develop/connect-local-servers, read 2026-10-14):
 * the person's servers are the `mcpServers` object of `claude_desktop_config.json`, in
 * `~/Library/Application Support/Claude/` on macOS and `%APPDATA%\Claude\` on Windows. An entry is `command`, `args`
 * and an optional `env`, with no `type`. A REAL INSTALL on the Mac this was written on (read for its shape, never a
 * value) holds the app's own `preferences` beside it and no `mcpServers` until one is added. There is no file for a
 * repository. NOT SETTLED, SO NOT DONE: the document gives no path on Linux, so there Claude Desktop is not found; and
 * it adds a remote server in the app, not in this file, so a tool reached by a url is not written for it.
 *
 * VS CODE, FROM ITS OWN DOCUMENTS (code.visualstudio.com/docs/copilot/reference/mcp-configuration and
 * /docs/configure/profiles, read 2026-10-14): the person's servers are the top-level `servers` object of `mcp.json` in
 * the User folder (`$HOME/Library/Application Support/Code/User` on macOS, `$HOME/.config/Code/User` on Linux,
 * `%APPDATA%\Code\User` on Windows), and a workspace's of its `.vscode/mcp.json`. A stdio entry has a required `type`
 * "stdio", `command`, `args`, `env` and `envFile`; an http one `type` "http" or "sse", `url` and `headers`; `inputs` and
 * `${input:id}` hold what VS Code asks the person for. A REAL INSTALL here had `User/mcp.json` in tabs with `type` on
 * every entry, and the gallery's `gallery` and `version` beside one. NOT DONE: a profile other than the default one
 * (`User/profiles/<id>/mcp.json`) and VS Code Insiders (`Code - Insiders`) are not read or written. Whether VS Code
 * reads the file with comments allowed is not said; a file that is not plain JSON is said and left alone.
 *
 * WINDSURF IS NOT IN THE TABLE: its own document's address (docs.windsurf.com/windsurf/cascade/mcp) now opens Devin
 * Desktop's page, which names `~/.config/devin/mcp_config.json` and does not say it is Windsurf's, and Windsurf was
 * not installed here. The path only other people's guides give (`~/.codeium/windsurf/mcp_config.json`) is not used.
 *
 * BRAINDOG'S OWN ENTRY RUNS `mcp --agent other`: `--agent` takes only the names `position.ts` holds, and the session
 * tells the record which app it is by the client's own name at the handshake.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { unbom } from '../unbom.ts';
import { isObject } from '../skills.ts';
import { planLine, serverFor, writeWhole } from './codex.ts';
import { indentOf, objectAt, skipWs, withMember } from './cursor.ts';
import type { Applied, Client, Env, Plan, ServerSet, Want } from './index.ts';

/* ── where each app's folder is ───────────────────────────────────────── */

/**
 * The folder an app keeps its settings in on this platform, or null where its documents give none. `%APPDATA%` is
 * read only for the machine's own home; any other home (a test's, a home given to setup) is taken at its default.
 */
function appData(home: string, platform: string, env: Env): string | null {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support');
  if (platform === 'win32') return (home === homedir() && env.APPDATA) || join(home, 'AppData', 'Roaming');
  return null;
}

/** Claude Desktop's folder, or null on a platform its document gives no path for. */
export function claudeDesktopFolder(home: string, platform: string = process.platform, env: Env = process.env): string | null {
  const at = appData(home, platform, env);
  return at === null ? null : join(at, 'Claude');
}

/** VS Code's User folder. */
export function vscodeUserFolder(home: string, platform: string = process.platform, env: Env = process.env): string {
  return join(appData(home, platform, env) ?? join(home, '.config'), 'Code', 'User');
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/* ── one app that keeps its servers as one object of a JSON file ──────── */

type Place = { file: string; label: string };
type Entry = { entry: Record<string, unknown> | null; notes: string[]; why: string };

type JsonApp = {
  id: string;
  title: string;
  /** The top-level member the servers are under. */
  key: string;
  /** The folder whose presence says the app is on this machine, or null where it cannot be. */
  folder(home: string, env: Env): string | null;
  /** The person's file, or null on a platform the app's documents give none for. */
  user(home: string): Place | null;
  /** A repository's file, for an app that keeps one. */
  project?: (top: string) => Place;
  /** A rendered entry as the app holds it, or null with the line saying why it is not written. */
  entry(want: Want): Entry;
};

/** A file's text and its JSON: `text` null when there is no file; `json` null with the sentence when it cannot be read. */
function readJson(file: string, label: string): { text: string | null; json: Record<string, unknown> | null; fault: string | null } {
  if (!existsSync(file)) return { text: null, json: {}, fault: null };
  const text = unbom(readFileSync(file, 'utf8'));
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) return { text, json: parsed, fault: null };
  } catch {
    /* JSON.parse quotes the text around the fault, and the text holds keys. */
  }
  return { text, json: null, fault: `${label} is not valid JSON, so its servers were not read.` };
}

/** Each server of `key` in the `mcpServers` shape, its `type` filled in where it leaves it out (from its `url` or `command`). */
const serversIn = (json: Record<string, unknown> | null, key: string): unknown => {
  const held = json?.[key];
  if (!isObject(held)) return held;
  return Object.fromEntries(
    Object.entries(held).map(([name, s]) => [name, isObject(s) && s.type === undefined ? { type: typeof s.url === 'string' ? 'http' : 'stdio', ...s } : s]),
  );
};

function jsonClient(app: JsonApp): Client & { server: Record<string, unknown> } {
  /** Where `want` goes, or the one line saying why it goes nowhere. */
  const placeOf = (want: Want): Place | string => {
    if (want.scope === 'user') return app.user(want.home) ?? `Tool ${want.name} is not written for ${app.title}, whose servers file on this system its documents do not give.`;
    if (!app.project) return `Tool ${want.name} is a repository's, and ${app.title} keeps no servers for a repository, so it is not written there.`;
    if (want.top === null) return `Tool ${want.name} is a repository's, and this folder is in none, so it is not written for ${app.title}.`;
    return app.project(want.top);
  };

  /** What a write of `want` would leave the file holding, or the one line saying why it is not written. */
  const nextText = (want: Want, at: Place): { before: string | null; text: string; notes: string[] } | { line: string; notes: string[] } => {
    const { entry, notes, why } = app.entry(want);
    if (entry === null) return { line: why, notes };
    const read = readJson(at.file, at.label);
    if (read.json === null) return { line: read.fault ?? '', notes };
    if (read.text === null) return { before: null, text: `${JSON.stringify({ [app.key]: { [want.name]: entry } }, null, 2)}\n`, notes };
    const text = read.text;
    const root = objectAt(text, skipWs(text, 0));
    const unit = root.members[0] && text.slice(root.open, root.members[0].start).includes('\n') ? indentOf(text, root.members[0].start) || '  ' : '  ';
    const servers = root.members.findLast((m) => m.key === app.key);
    if (servers === undefined) return { before: text, text: withMember(text, root, app.key, { [want.name]: entry }, unit), notes };
    if (text[servers.valueStart] !== '{') return { line: `${app.title}'s ${app.key} is not an object, so tool ${want.name} is not written there.`, notes };
    const held = objectAt(text, servers.valueStart);
    if (held.members.some((m) => m.key === want.name) && !want.replace)
      return { line: `Tool ${want.name} is already in ${app.title}'s servers and is not BrainDog's, so it is left.`, notes };
    return { before: text, text: withMember(text, held, want.name, entry, unit), notes };
  };

  return {
    id: app.id,
    title: app.title,
    /** BrainDog's own server as setup writes it here. */
    server: serverFor('other'),

    found: (home, env) => {
      const folder = app.folder(home, env);
      return folder !== null && existsSync(folder);
    },

    /** The person's file, then the repository's when the app keeps one (later ones win). */
    servers(home, top): ServerSet[] {
      const sets: ServerSet[] = [];
      const user = app.user(home);
      if (user !== null) {
        const read = readJson(user.file, user.label);
        sets.push({ scope: 'global', source: user.label, writes: 'user', servers: serversIn(read.json, app.key), fault: read.fault });
      }
      if (top !== null && app.project) {
        const at = app.project(top);
        const read = readJson(at.file, at.label);
        sets.push({ scope: 'project', source: at.label, writes: 'project', servers: serversIn(read.json, app.key), fault: read.fault });
      }
      return sets;
    },

    plan(want): Plan {
      const at = placeOf(want);
      if (typeof at === 'string') return { want, file: null, lines: [at] };
      const next = nextText(want, at);
      return 'line' in next ? { want, file: null, lines: [...next.notes, next.line] } : { want, file: at.file, lines: [...next.notes, planLine(want, app.title)] };
    },

    /* Decided again from the file as it is now, so a file changed since the plan is never written from a stale reading. */
    async apply(plan, { copied }): Promise<Applied> {
      const at = placeOf(plan.want);
      if (plan.file === null || typeof at === 'string') return { lines: plan.lines.filter((l) => !/^[+~] /.test(l)), written: false, stop: false };
      const { name, scope, replace } = plan.want;
      const next = nextText(plan.want, at);
      if ('line' in next) return { lines: [...next.notes, next.line], written: false, stop: false };
      const done = writeWhole(at.file, next.before, next.text, copied, name, app.title);
      const said = next.before === next.text ? `Tool ${name} is already in ${app.title} at ${scope} scope.` : `Tool ${name} ${replace ? 'replaced' : 'added'} for ${app.title} at ${scope} scope.`;
      return { ...done, lines: [...next.notes, ...done.lines, ...(done.written ? [said] : [])] };
    },

    remove: (name, scope) => {
      const at = scope === 'project' && app.project ? app.project('.').label : app.user(homedir())?.label;
      return at === undefined ? `nothing, since ${app.title} keeps no servers file here` : `an edit of ${at}, taking out ${app.key}.${name}`;
    },
  };
}

/* ── Claude Desktop ───────────────────────────────────────────────────── */

const desktopLabel = (platform: string): string =>
  platform === 'win32' ? '%APPDATA%\\Claude\\claude_desktop_config.json' : '~/Library/Application Support/Claude/claude_desktop_config.json';

/** A rendered entry as Claude Desktop holds it: `command` and `args`, as its document's samples write them. */
function desktopEntry(want: Want): Entry {
  const e = want.entry;
  const notes: string[] = [];
  if (e.type === 'http' || e.type === 'sse' || typeof e.url === 'string')
    return { entry: null, notes, why: `Tool ${want.name} is not written for Claude Desktop, which adds a server reached by a url in the app, not in its file.` };
  if (Object.keys(e).some((k) => !['type', 'command', 'args'].includes(k))) notes.push(`Tool ${want.name}: settings other than its command and arguments are left out of its entry for Claude Desktop.`);
  if (typeof e.command !== 'string') return { entry: null, notes, why: `Tool ${want.name} is not written for Claude Desktop, which starts a server by a command.` };
  return { entry: { command: e.command, args: strings(e.args) }, notes, why: '' };
}

/** Claude Desktop as it is on `platform`: found by its folder, and never on a platform its document gives no path for. */
export function claudeDesktopFor(platform: string): Client & { server: Record<string, unknown> } {
  return jsonClient({
    id: 'claude-desktop',
    title: 'Claude Desktop',
    key: 'mcpServers',
    folder: (home, env) => claudeDesktopFolder(home, platform, env),
    user: (home) => {
      const folder = claudeDesktopFolder(home, platform);
      return folder === null ? null : { file: join(folder, 'claude_desktop_config.json'), label: desktopLabel(platform) };
    },
    entry: desktopEntry,
  });
}

/* ── VS Code ──────────────────────────────────────────────────────────── */

const vscodeLabel = (platform: string): string =>
  platform === 'win32' ? '%APPDATA%\\Code\\User\\mcp.json' : platform === 'darwin' ? '~/Library/Application Support/Code/User/mcp.json' : '~/.config/Code/User/mcp.json';

/** A rendered entry as VS Code holds it: `type` with `command` and `args`, or `type` and `url`. Anything else is said and left out. */
function vscodeEntry(want: Want): Entry {
  const e = want.entry;
  const notes: string[] = [];
  const http = e.type === 'http' || e.type === 'sse' || typeof e.url === 'string';
  const known = http ? ['type', 'url', 'headersHelper'] : ['type', 'command', 'args'];
  if (typeof e.headersHelper === 'string')
    notes.push(`Tool ${want.name}: its key header is left out for VS Code, which cannot run a command for a header. Name an input in its headers, as \${input:NAME}, to have VS Code ask for it.`);
  if (Object.keys(e).some((k) => !known.includes(k))) notes.push(`Tool ${want.name}: settings VS Code has no place for are left out of its entry there.`);
  const why = `Tool ${want.name} is not written for VS Code, which starts a server by a command or a url.`;
  if (http) return { entry: typeof e.url === 'string' ? { type: e.type === 'sse' ? 'sse' : 'http', url: e.url } : null, notes, why };
  return { entry: typeof e.command === 'string' ? { type: 'stdio', command: e.command, args: strings(e.args) } : null, notes, why };
}

/** VS Code as it is on `platform`: the default profile's `mcp.json`, and a workspace's `.vscode/mcp.json`. */
export function vscodeFor(platform: string): Client & { server: Record<string, unknown> } {
  return jsonClient({
    id: 'vscode',
    title: 'VS Code',
    key: 'servers',
    folder: (home, env) => vscodeUserFolder(home, platform, env),
    user: (home) => ({ file: join(vscodeUserFolder(home, platform), 'mcp.json'), label: vscodeLabel(platform) }),
    project: (top) => ({ file: join(top, '.vscode', 'mcp.json'), label: '.vscode/mcp.json' }),
    entry: vscodeEntry,
  });
}

/** The two as they are on this machine. */
export const claudeDesktop = claudeDesktopFor(process.platform);
export const vscode = vscodeFor(process.platform);
