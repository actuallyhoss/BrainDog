/**
 * Cursor, as the clients table holds it: where it keeps servers, the reader, and the writer (AGT-A07, AGT-D10, AGT-D11).
 *
 * WHERE AND WHAT, FROM CURSOR'S OWN DOCUMENTS (cursor.com/docs/context/mcp, read 2026-10-14): a person's servers are
 * the `mcpServers` object of `~/.cursor/mcp.json`, and a repository's of its `.cursor/mcp.json`. A stdio server has
 * `type` (`"stdio"`, which the documents call required and their own samples leave out), `command`, `args`, `env` and
 * `envFile`; a remote one has `url`, `headers` and an optional `auth`. `${env:NAME}` and `${workspaceFolder}` are
 * filled in by Cursor in a command, its arguments, env, url and headers.
 *
 * NOT CONFIRMED: Cursor was not installed on the machine this was written on, so no real install was read. Whether
 * Cursor takes `"type": "http"` on a remote server is not in its documents, so a remote one is written with `url`
 * alone. Whether it reads the file with comments allowed is not said either; a file that is not plain JSON is left
 * alone. The samples under `apps/cli/test/fixtures/clients/` are invented.
 *
 * THE SAME SHAPE AS CLAUDE CODE'S, SO THE READER HANDS THE OBJECT ON AS IT IS, with only `type` filled in where a
 * server leaves it out (from its `url` or `command`), so an entry BrainDog wrote reads back as the entry it rendered.
 *
 * EVERY OTHER BYTE STAYS: the writer finds the one server's value in the text by position and puts the new value there
 * (or a new member after the last one, in the file's own indent), and never prints the whole file again. The write is
 * Codex's `writeWhole`: one copy aside before the run's first change, `<file>.tmp` and a rename, read back and compared.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { unbom } from '../unbom.ts';
import { isObject } from '../skills.ts';
import { planLine, serverFor, writeWhole } from './codex.ts';
import type { Applied, Client, Env, Plan, ServerSet, Want } from './index.ts';

/* ── where a JSON value is in its text ────────────────────────────────── */

type Member = { key: string; start: number; valueStart: number; valueEnd: number };
export type Obj = { open: number; close: number; members: Member[] };

export const skipWs = (text: string, i: number): number => {
  while (i < text.length && ' \t\r\n'.includes(text[i]!)) i++;
  return i;
};

const skipString = (text: string, i: number): number => {
  i++;
  while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
  return i + 1;
};

/** The end of the value that starts at `i`, in text `JSON.parse` has already read. */
function skipValue(text: string, i: number): number {
  const c = text[i];
  if (c === '"') return skipString(text, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (;;) {
      const d = text[i];
      if (d === '"') {
        i = skipString(text, i);
        continue;
      }
      if (d === '{' || d === '[') depth++;
      else if ((d === '}' || d === ']') && --depth === 0) return i + 1;
      i++;
    }
  }
  while (i < text.length && !',]} \t\r\n'.includes(text[i]!)) i++;
  return i;
}

/** The object whose `{` is at `at`: where it closes, and where each member's key and value are. */
export function objectAt(text: string, at: number): Obj {
  const members: Member[] = [];
  let i = skipWs(text, at + 1);
  if (text[i] === '}') return { open: at, close: i, members };
  for (;;) {
    const start = i;
    const keyEnd = skipString(text, i);
    const key = JSON.parse(text.slice(i, keyEnd)) as string;
    i = skipWs(text, skipWs(text, keyEnd) + 1);
    const valueStart = i;
    i = skipValue(text, i);
    members.push({ key, start, valueStart, valueEnd: i });
    i = skipWs(text, i);
    if (text[i] !== ',') return { open: at, close: i, members };
    i = skipWs(text, i + 1);
  }
}

/** The spaces or tabs that start the line holding `pos`. */
export const indentOf = (text: string, pos: number): string => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', pos - 1) + 1))![0];

/** A value as the file would print it: the file's own indent unit, every line after the first under `indent`. */
const render = (value: unknown, indent: string, unit: string): string => JSON.stringify(value, null, unit).replaceAll('\n', `\n${indent}`);

/**
 * The text with member `key` of `obj` set to `value`, every other byte as it was: the old value replaced where it
 * stood, or a new member after the last one in the members' own indent (on the same line when the object is on one).
 * The last member of a key given twice is the one JSON reads, so it is the one replaced.
 */
export function withMember(text: string, obj: Obj, key: string, value: unknown, unit: string): string {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const had = obj.members.findLast((m) => m.key === key);
  if (had) return text.slice(0, had.valueStart) + render(value, indentOf(text, had.start), unit).replaceAll('\n', nl) + text.slice(had.valueEnd);
  const last = obj.members[obj.members.length - 1];
  const name = JSON.stringify(key);
  if (last === undefined) {
    const outer = indentOf(text, obj.open);
    const inner = outer + unit;
    const body = `{${nl}${inner}${name}: ${render(value, inner, unit).replaceAll('\n', nl)}${nl}${outer}}`;
    return text.slice(0, obj.open) + body + text.slice(obj.close + 1);
  }
  const first = obj.members[0]!;
  const oneLine = !text.slice(obj.open, first.start).includes('\n');
  const indent = indentOf(text, first.start);
  const member = oneLine ? `, ${name}: ${JSON.stringify(value)}` : `,${nl}${indent}${name}: ${render(value, indent, unit).replaceAll('\n', nl)}`;
  return text.slice(0, last.valueEnd) + member + text.slice(last.valueEnd);
}

/* ── Cursor ───────────────────────────────────────────────────────────── */

export const cursorHome = (home: string): string => join(home, '.cursor');

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

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

/** Each server with its `type` filled in where it leaves it out, as Cursor reads it. */
const serversIn = (json: Record<string, unknown> | null): unknown => {
  const held = json?.mcpServers;
  if (!isObject(held)) return held === undefined ? undefined : held;
  return Object.fromEntries(
    Object.entries(held).map(([name, s]) => [name, isObject(s) && s.type === undefined ? { type: typeof s.url === 'string' ? 'http' : 'stdio', ...s } : s]),
  );
};

const fileOf = (want: Want): string | null =>
  want.scope === 'user' ? join(cursorHome(want.home), 'mcp.json') : want.top === null ? null : join(want.top, '.cursor', 'mcp.json');

/** A rendered entry as Cursor holds it: `type`, `command` and `args`, or `url` alone. Anything else is said and left out. */
function cursorEntry(want: Want): { entry: Record<string, unknown> | null; notes: string[] } {
  const e = want.entry;
  const notes: string[] = [];
  const http = e.type === 'http' || typeof e.url === 'string';
  const known = http ? ['type', 'url', 'headersHelper'] : ['type', 'command', 'args'];
  if (typeof e.headersHelper === 'string')
    notes.push(`Tool ${want.name}: its key header is left out for Cursor, which cannot run a command for a header. Name a variable in its headers, as \${env:NAME}, to hand it one.`);
  if (Object.keys(e).some((k) => !known.includes(k))) notes.push(`Tool ${want.name}: settings Cursor has no place for are left out of its entry there.`);
  if (http) return { entry: typeof e.url === 'string' ? { url: e.url } : null, notes };
  return { entry: typeof e.command === 'string' ? { type: 'stdio', command: e.command, args: strings(e.args) } : null, notes };
}

/** What a write of `want` would leave the file holding, or the one line saying why it is not written. */
function nextText(want: Want, file: string): { before: string | null; text: string; notes: string[] } | { line: string; notes: string[] } {
  const { entry, notes } = cursorEntry(want);
  if (entry === null) return { line: `Tool ${want.name} is not written for Cursor, which starts a server by a command or a url.`, notes };
  const read = readJson(file, want.scope === 'user' ? '~/.cursor/mcp.json' : '.cursor/mcp.json');
  if (read.json === null) return { line: read.fault ?? '', notes };
  if (read.text === null) return { before: null, text: `${JSON.stringify({ mcpServers: { [want.name]: entry } }, null, 2)}\n`, notes };
  const text = read.text;
  const root = objectAt(text, skipWs(text, 0));
  const unit = root.members[0] && text.slice(root.open, root.members[0].start).includes('\n') ? indentOf(text, root.members[0].start) || '  ' : '  ';
  const servers = root.members.findLast((m) => m.key === 'mcpServers');
  if (servers === undefined) return { before: text, text: withMember(text, root, 'mcpServers', { [want.name]: entry }, unit), notes };
  if (text[servers.valueStart] !== '{') return { line: `Cursor's mcpServers is not an object, so tool ${want.name} is not written there.`, notes };
  const held = objectAt(text, servers.valueStart);
  if (held.members.some((m) => m.key === want.name) && !want.replace)
    return { line: `Tool ${want.name} is already in Cursor's servers and is not BrainDog's, so it is left.`, notes };
  return { before: text, text: withMember(text, held, want.name, entry, unit), notes };
}

export const cursor: Client & { server: Record<string, unknown> } = {
  id: 'cursor',
  title: 'Cursor',
  /** BrainDog's own server as setup writes it here. */
  server: serverFor('cursor'),

  found: (home: string, _env: Env) => existsSync(cursorHome(home)),

  /** The person's file, then the repository's (later ones win). */
  servers(home, top): ServerSet[] {
    const user = readJson(join(cursorHome(home), 'mcp.json'), '~/.cursor/mcp.json');
    const sets: ServerSet[] = [{ scope: 'global', source: '~/.cursor/mcp.json', writes: 'user', servers: serversIn(user.json), fault: user.fault }];
    if (top !== null) {
      const project = readJson(join(top, '.cursor', 'mcp.json'), '.cursor/mcp.json');
      sets.push({ scope: 'project', source: '.cursor/mcp.json', writes: 'project', servers: serversIn(project.json), fault: project.fault });
    }
    return sets;
  },

  plan(want): Plan {
    const file = fileOf(want);
    if (file === null) return { want, file, lines: [`Tool ${want.name} is a repository's, and this folder is in none, so it is not written for Cursor.`] };
    const next = nextText(want, file);
    return 'line' in next ? { want, file: null, lines: [...next.notes, next.line] } : { want, file, lines: [...next.notes, planLine(want, 'Cursor')] };
  },

  /* Decided again from the file as it is now, so a file changed since the plan is never written from a stale reading. */
  async apply(plan, { copied }): Promise<Applied> {
    if (plan.file === null) return { lines: plan.lines.filter((l) => !/^[+~] /.test(l)), written: false, stop: false };
    const { name, scope, replace } = plan.want;
    const next = nextText(plan.want, plan.file);
    if ('line' in next) return { lines: [...next.notes, next.line], written: false, stop: false };
    const done = writeWhole(plan.file, next.before, next.text, copied, name, 'Cursor');
    const said = next.before === next.text ? `Tool ${name} is already in Cursor at ${scope} scope.` : `Tool ${name} ${replace ? 'replaced' : 'added'} for Cursor at ${scope} scope.`;
    return { ...done, lines: [...next.notes, ...done.lines, ...(done.written ? [said] : [])] };
  },

  remove: (name, scope) => `an edit of ${scope === 'user' ? '~/.cursor/mcp.json' : '.cursor/mcp.json'}, taking out mcpServers.${name}`,
};
