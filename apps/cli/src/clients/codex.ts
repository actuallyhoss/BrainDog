/**
 * Codex, as the clients table holds it: where it keeps servers, the reader, and the writer (AGT-A07, AGT-D10, AGT-D11).
 *
 * WHERE AND WHAT, FROM CODEX'S OWN DOCUMENTS (developers.openai.com/codex/mcp, read 2026-10-14): a person's servers are
 * `[mcp_servers.<name>]` tables in `~/.codex/config.toml`, and a trusted repository's in its `.codex/config.toml`. A
 * stdio server has `command`, `args`, `env` (a table or a `[mcp_servers.<name>.env]` subtable), `env_vars` and `cwd`;
 * an HTTP server has `url`, `bearer_token_env_var`, `http_headers` and `env_http_headers`; either may hold `enabled`,
 * `enabled_tools`, `disabled_tools`, `startup_timeout_sec` and `tool_timeout_sec`.
 *
 * NOT CONFIRMED: Codex was not installed on the machine this was written on, so no real install was read. `CODEX_HOME`
 * moving the folder is from Codex's source, not that page, and `codex mcp remove` from its command's help. Whether
 * Codex reads a repository's file before the folder is trusted is the page's word only. The samples under
 * `apps/cli/test/fixtures/clients/` are invented.
 *
 * READ AS CLAUDE CODE'S ARE: each table is handed to the table's caller in the `mcpServers` shape `tools.ts` reads, so
 * `env_vars`, `env_http_headers` and `bearer_token_env_var` become entries named by their variable (`${NAME}`), which
 * are never taken for a key. Every other setting is passed through, so a table changed by hand never reads as the one
 * BrainDog wrote.
 *
 * THE FILE IS TOML, AND NOTHING BUT THE SERVER TABLES IS REWRITTEN: the small reader below walks the whole text (so a
 * multi-line string is never mistaken for a table), keeps where every table and key starts and ends, and the writer
 * replaces only the lines of the one server it is given. Every other byte stays as it was, comments too. No
 * dependency is added for it. The write is the whole file or nothing: a copy aside by install's `keepCopy` before the
 * run's first change, the new text to `<file>.tmp`, a rename, and the file read back and compared.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { BRAINDOG_SERVER, keepCopy } from '../install.ts';
import { isObject } from '../skills.ts';
import type { Applied, Client, Env, Plan, ServerSet, Want } from './index.ts';

/* ── shared by the clients that BrainDog writes itself ────────────────── */

/** BrainDog's own server for a client: install's entry with that client's name after `--agent`. No env, no token. */
export const serverFor = (agent: string): Record<string, unknown> => ({ type: 'stdio', command: BRAINDOG_SERVER.command, args: [BRAINDOG_SERVER.args[0], 'mcp', '--agent', agent] });

/** A plan's line, in Claude Code's words with the app named, so `tools.ts` still finds a pending change by its `+` or `~`. */
export const planLine = (want: Want, title: string): string =>
  `${want.replace ? '~' : '+'} ${want.name} for ${title} at ${want.scope} scope${want.replace ? ', replacing the entry there' : ''}: ${JSON.stringify(want.entry)}`;

/**
 * Writes the whole file or nothing. The file must still hold `before` (a file changed since it was read is left), the
 * run's first change keeps a copy by install's `keepCopy` (`<file>.pre-braindog` the first time ever, then `.bak`, never
 * over an earlier one), the text goes to `<file>.tmp` with the file's own mode and is renamed into place, and the file
 * is read back: when it does not hold what was written, the text it had is put back and the line says so.
 */
export function writeWhole(file: string, before: string | null, text: string, copied: Set<string>, name: string, title: string): Applied {
  const now = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (now !== before) return { lines: [`Tool ${name} was not written, because ${title}'s file changed while it was being read. Run it again.`], written: false, stop: false };
  if (now === text) return { lines: [], written: true, stop: false };
  const lines: string[] = [];
  if (before !== null && !copied.has(file)) {
    try {
      const kept = keepCopy(file);
      if (kept !== null) lines.push(`The file as it was is kept beside it as ${basename(kept)}.`);
      copied.add(file);
    } catch {
      return { lines: [`Tool ${name} was not written, because a copy of the file it goes into could not be kept first.`], written: false, stop: false };
    }
  }
  const tmp = `${file}.tmp`;
  const mode = before !== null ? statSync(file).mode & 0o777 : 0o600;
  try {
    if (before === null) mkdirSync(dirname(file), { recursive: true });
    if (existsSync(tmp)) unlinkSync(tmp);
    writeFileSync(tmp, text, { mode });
    renameSync(tmp, file);
  } catch {
    if (existsSync(tmp)) unlinkSync(tmp);
    return { lines: [...lines, `Tool ${name} was not written, because ${title}'s file could not be written.`], written: false, stop: false };
  }
  if (readFileSync(file, 'utf8') === text) return { lines, written: true, stop: false };
  if (before === null) unlinkSync(file);
  else {
    writeFileSync(tmp, before, { mode });
    renameSync(tmp, file);
  }
  return { lines: [...lines, `Tool ${name} was not written, because ${title}'s file did not read back as written, so it was put back as it was.`], written: false, stop: false };
}

/* ── a small TOML reader ──────────────────────────────────────────────── */

/** A `[table]` or `[[table]]` header: its key path, where its header line starts, and where its last key line ends. */
export type TomlTable = { path: string[]; start: number; end: number; array: boolean };
/** A `key = value` line, with its whole path (the table's and its own), where its line starts and ends. */
export type TomlKey = { path: string[]; value: unknown; start: number; end: number };
export type Toml = { tables: TomlTable[]; keys: TomlKey[]; data: Record<string, unknown> };

const BARE = /[A-Za-z0-9_-]+/y;
const ATOM = /[0-9A-Za-z_+.:-]+(?: [0-9]{2}:[0-9A-Za-z_+.:-]*)?/y;
const ESCAPES: Record<string, string> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', e: '\x1b', '"': '"', '\\': '\\' };

/** The object at `path` inside `root`, made where missing; the last element of an array of tables. */
function tableAt(root: Record<string, unknown>, path: string[], fail: (what: string) => never): Record<string, unknown> {
  let at = root;
  for (const part of path) {
    const next = at[part] ?? (at[part] = {});
    const inner = Array.isArray(next) ? next[next.length - 1] : next;
    if (!isObject(inner)) fail(`${part} is a value and a table at once`);
    at = inner;
  }
  return at;
}

function setPath(root: Record<string, unknown>, path: string[], value: unknown, fail: (what: string) => never): void {
  const at = tableAt(root, path.slice(0, -1), fail);
  const last = path[path.length - 1]!;
  if (last in at) fail(`${last} is given twice`);
  at[last] = value;
}

/**
 * Reads the whole text as TOML 1.0 does, and throws a sentence naming the line where it cannot. Dates, times, `inf`
 * and `nan` are kept as their text: nothing here needs them as more.
 */
export function parseToml(text: string): Toml {
  let i = 0;
  const tables: TomlTable[] = [];
  const keys: TomlKey[] = [];
  const data: Record<string, unknown> = {};
  const fail = (what: string): never => {
    throw new Error(`line ${String(text.slice(0, i).split('\n').length)}: ${what}`);
  };
  const ws = () => {
    while (text[i] === ' ' || text[i] === '\t') i++;
  };
  const comment = () => {
    if (text[i] === '#') while (i < text.length && text[i] !== '\n') i++;
  };
  const blank = () => {
    for (;;) {
      ws();
      comment();
      if (text[i] === '\r' || text[i] === '\n') i++;
      else return;
    }
  };
  const eol = () => {
    ws();
    comment();
    if (text[i] === '\r') i++;
    if (i < text.length && text[i++] !== '\n') fail('something follows a value on its line');
  };
  const basic = (multi: boolean): string => {
    let out = '';
    for (;;) {
      if (i >= text.length) fail('a string is not closed');
      if (multi ? text.startsWith('"""', i) : text[i] === '"') {
        /* Up to two more quotes before a multi-line string's three closing ones are part of its text. */
        let q = 1;
        while (multi && text[i + q] === '"') q++;
        out += '"'.repeat(multi ? Math.min(q - 3, 2) : 0);
        i += multi ? Math.min(q, 5) : 1;
        return out;
      }
      const c = text[i]!;
      if (!multi && c === '\n') fail('a string runs past its line');
      if (c !== '\\') {
        out += c;
        i++;
        continue;
      }
      const e = text[i + 1] ?? '';
      if (multi && /^[ \t]*\r?\n/.test(text.slice(i + 1, i + 200))) {
        i++;
        while (/[ \t\r\n]/.test(text[i] ?? '')) i++;
        continue;
      }
      if (e in ESCAPES) {
        out += ESCAPES[e];
        i += 2;
        continue;
      }
      const n = e === 'u' ? 4 : e === 'U' ? 8 : 0;
      const hex = text.slice(i + 2, i + 2 + n);
      if (n === 0 || !/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== n) fail('a string holds an escape TOML does not know');
      out += String.fromCodePoint(parseInt(hex, 16));
      i += 2 + n;
    }
  };
  const literal = (multi: boolean): string => {
    const close = multi ? "'''" : "'";
    const end = text.indexOf(close, i);
    if (end < 0 || (!multi && text.slice(i, end).includes('\n'))) fail('a string is not closed');
    let q = close.length;
    while (multi && text[end + q] === "'" && q < 5) q++;
    const out = text.slice(i, end + q - close.length);
    i = end + q;
    return out;
  };
  const keyPart = (): string => {
    if (text[i] === '"' || text[i] === "'") return text[i++] === '"' ? basic(false) : literal(false);
    BARE.lastIndex = i;
    const bare = BARE.exec(text);
    if (bare === null) return fail('a key is missing');
    i = BARE.lastIndex;
    return bare[0];
  };
  const keyPath = (): string[] => {
    const path = [keyPart()];
    for (;;) {
      ws();
      if (text[i] !== '.') return path;
      i++;
      ws();
      path.push(keyPart());
    }
  };
  const value = (): unknown => {
    if (text.startsWith('"""', i) || text.startsWith("'''", i)) {
      const quote = text[i];
      i += 3;
      /* A newline straight after the opening quotes is not part of the text. */
      if (text.startsWith('\r\n', i)) i += 2;
      else if (text[i] === '\n') i++;
      return quote === '"' ? basic(true) : literal(true);
    }
    if (text[i] === '"' || text[i] === "'") return text[i++] === '"' ? basic(false) : literal(false);
    if (text[i] === '[') {
      i++;
      const out: unknown[] = [];
      for (;;) {
        blank();
        if (text[i] === ']') return i++, out;
        out.push(value());
        blank();
        if (text[i] === ',') i++;
        else if (text[i] !== ']') fail('an array is not closed');
      }
    }
    if (text[i] === '{') {
      i++;
      const out: Record<string, unknown> = {};
      for (;;) {
        blank();
        if (text[i] === '}') return i++, out;
        const path = keyPath();
        ws();
        if (text[i++] !== '=') fail('a key has no =');
        ws();
        setPath(out, path, value(), fail);
        blank();
        if (text[i] === ',') i++;
        else if (text[i] !== '}') fail('an inline table is not closed');
      }
    }
    ATOM.lastIndex = i;
    const atom = ATOM.exec(text);
    if (atom === null) return fail('a value is missing');
    i = ATOM.lastIndex;
    const raw = atom[0];
    if (raw === 'true' || raw === 'false') return raw === 'true';
    const n = /^[+-]?(?:0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|[0-9_]+(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?)$/.test(raw) ? Number(raw.replaceAll('_', '')) : NaN;
    return Number.isFinite(n) ? n : raw;
  };

  for (;;) {
    blank();
    if (i >= text.length) break;
    const start = text.lastIndexOf('\n', i - 1) + 1;
    if (text[i] === '[') {
      const array = text[i + 1] === '[';
      i += array ? 2 : 1;
      ws();
      const path = keyPath();
      ws();
      if (!text.startsWith(array ? ']]' : ']', i)) fail('a table name is not closed');
      i += array ? 2 : 1;
      eol();
      tables.push({ path, start, end: i, array });
      if (array) {
        const parent = tableAt(data, path.slice(0, -1), fail);
        const last = path[path.length - 1]!;
        const list = parent[last] ?? (parent[last] = []);
        if (!Array.isArray(list)) fail(`${last} is a table and a list of tables at once`);
        (list as unknown[]).push({});
      } else tableAt(data, path, fail);
      continue;
    }
    const path = keyPath();
    ws();
    if (text[i++] !== '=') fail('a key has no =');
    ws();
    const held = value();
    eol();
    const table = tables[tables.length - 1];
    setPath(tableAt(data, table?.path ?? [], fail), path, held, fail);
    keys.push({ path: [...(table?.path ?? []), ...path], value: held, start, end: i });
    if (table) table.end = i;
  }
  return { tables, keys, data };
}

/* ── writing a server table back ──────────────────────────────────────── */

const tomlString = (s: string): string =>
  `"${s.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => (c === '\\' ? '\\\\' : c === '"' ? '\\"' : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`))}"`;
const tomlKey = (k: string): string => (/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k));

/** A server as Codex holds it: `command` and `args`, or `url`. */
type CodexEntry = { command: string; args: string[] } | { url: string };

/** One server's table, ending in the file's own line ending. */
export function tomlBlock(name: string, entry: CodexEntry, nl = '\n'): string {
  const lines = [`[mcp_servers.${tomlKey(name)}]`];
  if ('command' in entry) lines.push(`command = ${tomlString(entry.command)}`, `args = [${entry.args.map(tomlString).join(', ')}]`);
  else lines.push(`url = ${tomlString(entry.url)}`);
  return lines.map((l) => l + nl).join('');
}

/**
 * The text with server `name` written as `entry`, every other byte as it was: its tables (the server's own and its
 * `.env` or other subtables) are taken out and the new table stands where the first was, or is added at the end.
 * `null` when the server is also written some other way (an inline table under `[mcp_servers]`, or dotted keys),
 * which this writer leaves to the person.
 */
export function withServer(text: string, toml: Toml, name: string, entry: CodexEntry): string | null {
  const own = (path: string[]) => path[0] === 'mcp_servers' && path[1] === name;
  const spans = toml.tables.filter((t) => !t.array && t.path.length >= 2 && own(t.path)).sort((a, b) => a.start - b.start);
  const inside = (at: number) => spans.some((s) => at >= s.start && at < s.end);
  if (toml.keys.some((k) => own(k.path) && !inside(k.start))) return null;
  if (toml.tables.some((t) => t.array && own(t.path))) return null;
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const block = tomlBlock(name, entry, nl);
  if (spans.length === 0) {
    const ended = text === '' || text.endsWith('\n') ? text : text + nl;
    return ended + (ended === '' || ended.endsWith(nl + nl) ? '' : nl) + block;
  }
  let out = '';
  let at = 0;
  spans.forEach((span, n) => {
    /* The blank lines between the server's own tables go with the tables after the first. */
    const gap = text.slice(at, span.start);
    out += (n > 0 && gap.trim() === '' ? '' : gap) + (n === 0 ? block : '');
    at = span.end;
  });
  return out + text.slice(at);
}

/* ── Codex ────────────────────────────────────────────────────────────── */

/** Codex's folder: `CODEX_HOME` when it is set, else `~/.codex`. */
export const codexHome = (home: string, env: Env = process.env): string => env.CODEX_HOME || join(home, '.codex');

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
const pairs = (x: unknown): [string, unknown][] => Object.entries(isObject(x) ? x : {});
/* A variable Codex hands over by name, written as Claude Code writes one it fills in: never a value, never a key. */
const byName = (variable: string): string => `\${${variable}}`;

/** One Codex table in the `mcpServers` shape `tools.ts` reads, every setting it does not map passed through. */
export function asServer(table: unknown): unknown {
  if (!isObject(table)) return table;
  const { command, args, url, env, env_vars, http_headers, env_http_headers, bearer_token_env_var, ...rest } = table;
  if (typeof url === 'string') {
    const headers = {
      ...Object.fromEntries(pairs(http_headers)),
      ...Object.fromEntries(pairs(env_http_headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, byName(v)]] : []))),
      ...(typeof bearer_token_env_var === 'string' ? { Authorization: `Bearer ${byName(bearer_token_env_var)}` } : {}),
    };
    return { type: 'http', url, ...(Object.keys(headers).length > 0 ? { headers } : {}), ...rest };
  }
  const vars = { ...Object.fromEntries(pairs(env)), ...Object.fromEntries(strings(env_vars).map((v) => [v, byName(v)])) };
  return { type: 'stdio', ...(command !== undefined ? { command } : {}), ...(args !== undefined ? { args } : {}), ...(Object.keys(vars).length > 0 ? { env: vars } : {}), ...rest };
}

/** A file's text and its TOML: `text` null when there is no file; `toml` null with the sentence when it cannot be read. */
function readToml(file: string, label: string): { text: string | null; toml: Toml | null; fault: string | null } {
  if (!existsSync(file)) return { text: null, toml: parseToml(''), fault: null };
  const text = readFileSync(file, 'utf8');
  try {
    return { text, toml: parseToml(text), fault: null };
  } catch (e) {
    /* The parser's sentence names a line and never quotes the text, which can hold keys. */
    return { text, toml: null, fault: `${label} could not be read as TOML (${e instanceof Error ? e.message : 'unreadable'}), so its servers were not read.` };
  }
}

const serversIn = (toml: Toml | null): unknown => {
  const held = toml?.data.mcp_servers;
  return isObject(held) ? Object.fromEntries(Object.entries(held).map(([name, table]) => [name, asServer(table)])) : undefined;
};

/** The file a write goes to, or `null` for a repository's tool in a folder that is in none. */
const fileOf = (want: Want): string | null =>
  want.scope === 'user' ? join(codexHome(want.home), 'config.toml') : want.top === null ? null : join(want.top, '.codex', 'config.toml');

/** A rendered entry as Codex starts a server: a command and its arguments, or a url. Anything else is said and left out. */
function codexEntry(want: Want): { entry: CodexEntry | null; notes: string[] } {
  const e = want.entry;
  const notes: string[] = [];
  const known = e.type === 'http' || typeof e.url === 'string' ? ['type', 'url', 'headersHelper'] : ['type', 'command', 'args'];
  if (typeof e.headersHelper === 'string')
    notes.push(`Tool ${want.name}: its key header is left out for Codex, which cannot run a command for a header. Name a variable in its bearer_token_env_var to hand it one.`);
  if (Object.keys(e).some((k) => !known.includes(k))) notes.push(`Tool ${want.name}: settings Codex has no place for are left out of its entry there.`);
  if (known.includes('url')) return { entry: typeof e.url === 'string' ? { url: e.url } : null, notes };
  return { entry: typeof e.command === 'string' ? { command: e.command, args: strings(e.args) } : null, notes };
}

/** What a write of `want` would leave the file holding, or the one line saying why it is not written. */
function nextText(want: Want, file: string): { before: string | null; text: string; notes: string[] } | { line: string; notes: string[] } {
  const { entry, notes } = codexEntry(want);
  if (entry === null) return { line: `Tool ${want.name} is not written for Codex, which starts a server by a command or a url.`, notes };
  const read = readToml(file, want.scope === 'user' ? '~/.codex/config.toml' : '.codex/config.toml');
  if (read.toml === null) return { line: read.fault ?? '', notes };
  const servers = read.toml.data.mcp_servers;
  if (isObject(servers) && want.name in servers && !want.replace)
    return { line: `Tool ${want.name} is already in Codex's servers and is not BrainDog's, so it is left.`, notes };
  const text = withServer(read.text ?? '', read.toml, want.name, entry);
  if (text === null) return { line: `Tool ${want.name} is written in Codex's file in a form BrainDog does not change, so it is left.`, notes };
  return { before: read.text, text, notes };
}

export const codex: Client & { server: Record<string, unknown> } = {
  id: 'codex',
  title: 'Codex',
  /** BrainDog's own server as setup writes it here. */
  server: serverFor('codex'),

  found: (home, env) => existsSync(codexHome(home, env)),

  /** The person's file, then the repository's, which Codex reads after it (later ones win). */
  servers(home, top): ServerSet[] {
    const user = readToml(join(codexHome(home), 'config.toml'), '~/.codex/config.toml');
    const sets: ServerSet[] = [{ scope: 'global', source: '~/.codex/config.toml', writes: 'user', servers: serversIn(user.toml), fault: user.fault }];
    if (top !== null) {
      const project = readToml(join(top, '.codex', 'config.toml'), '.codex/config.toml');
      sets.push({ scope: 'project', source: '.codex/config.toml', writes: 'project', servers: serversIn(project.toml), fault: project.fault });
    }
    return sets;
  },

  plan(want): Plan {
    const file = fileOf(want);
    if (file === null) return { want, file, lines: [`Tool ${want.name} is a repository's, and this folder is in none, so it is not written for Codex.`] };
    const next = nextText(want, file);
    return 'line' in next ? { want, file: null, lines: [...next.notes, next.line] } : { want, file, lines: [...next.notes, planLine(want, 'Codex')] };
  },

  /* Decided again from the file as it is now, so a file changed since the plan is never written from a stale reading. */
  async apply(plan, { copied }): Promise<Applied> {
    if (plan.file === null) return { lines: plan.lines.filter((l) => !/^[+~] /.test(l)), written: false, stop: false };
    const { name, scope, replace } = plan.want;
    const next = nextText(plan.want, plan.file);
    if ('line' in next) return { lines: [...next.notes, next.line], written: false, stop: false };
    const done = writeWhole(plan.file, next.before, next.text, copied, name, 'Codex');
    const said = next.before === next.text ? `Tool ${name} is already in Codex at ${scope} scope.` : `Tool ${name} ${replace ? 'replaced' : 'added'} for Codex at ${scope} scope.`;
    return { ...done, lines: [...next.notes, ...done.lines, ...(done.written ? [said] : [])] };
  },

  remove: (name, scope) => (scope === 'user' ? `codex mcp remove ${name}` : `an edit of .codex/config.toml, taking out [mcp_servers.${name}]`),
};
