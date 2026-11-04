/**
 * `braindog tools scan` and `braindog tools write`: the MCP servers this machine runs, recorded as rows of `tools`,
 * and the record's tools written back as entries that hold no key.
 *
 * EVERY APP GOES THROUGH THE CLIENTS TABLE (`clients/index.ts`). Which files an app keeps its servers in, how they are
 * read and how an entry is written into them is that app's module (`clients/claude.ts` for Claude Code); this file
 * decides what is recorded, proposed and written, and knows no app's files of its own.
 *
 * SCAN ONLY READS CONFIGS. Every client in the table is read, and none is written by a scan.
 *
 * A KEY FOUND IN A CONFIG GOES TO THE KEYCHAIN OR NOWHERE (question 4). A key-named or key-shaped env or header value is
 * deposited through `braindog keys put`, the one door, and the row keeps `NAME=credentials#N`. Any other entry keeps
 * its NAME only. With no keychain access, `keys put` deposits with the login as a new key in this run's project; when
 * neither is kept, or the door refuses, the row keeps the name and the value is dropped.
 * No sentence here quotes a value, and no value is written to a row, a lock file, or a proposal.
 *
 * A ROW THAT DIFFERS IS NOT OVERWRITTEN. The change is proposed as a rowset update, once per shape of the config.
 *
 * A TOOL IS WHAT IT RUNS. A server found under a name the record does not hold is the row of its scope that
 * starts the same way, when there is one: that row is stamped as seen and nothing is added. A row is asked about only
 * when how it starts would change, as "Change how <name> starts?".
 *
 * THE RECORD DOES THAT MATCHING WHEN IT CAN. A scan sends everything it found in one `toolsSeen` call,
 * 50 a call, matched there against every row rather than the ones one context shows, and says one line an answer. A
 * record or a command line without `toolsSeen` is scanned as below, unchanged.
 *
 * WRITE IS A DRY RUN UNTIL A SCOPE IS NAMED (question 5). `--scope user` applies the global tools into the client's
 * place for the person, and `--scope project` this repository's, only when typed by hand. An entry already there is
 * replaced only when it is still what BrainDog last wrote, by `~/.braindog/tools-lock.json`, or still the entry the
 * scan read.
 *
 * NOTHING DEAD OR FOREIGN IS WRITTEN. A tool whose program is neither on this machine's path nor a
 * file here, or which starts from another system's path (a drive letter off Windows, another system's home folder),
 * is left out with one line naming it, so a new machine is never handed what only ran on another one.
 *
 * WHAT CLAUDE CODE IS CONNECTED TO BEYOND ITS FILES IS AN INTEGRATION. When the scan is handed
 * `connected` (`braindog tools scan` hands it `claude mcp list`, by `clients/connected.ts`), each entry whose name or
 * address no config file read here holds (a connector added in the claude.ai app, a server a plugin registered) goes
 * the same way a server does, as `kind: 'integration'`: its address when one was printed, no transport, no command, and
 * no key read or written. The start hook hands none, since the list connects to every server and takes ten seconds.
 * Nothing is taken from the names of tools.
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { Brief, Client, Context } from '@braindog/client';

import { hostsPath, readHosts, type Target } from './http.ts';
import { CLIENTS, clientOf, DEFAULT_CLIENT, foreignPath, onPath, runClaude, type ClaudeRunner, type Env as ClientEnv } from './clients/index.ts';
import { serversFileOf } from './install.ts';
import { connectedOf, runClaudeList, type ConnectedList, type ListRunner } from './clients/connected.ts';
import { HEADER_NAME, keys } from './keys.ts';
import { decideLink } from './links.ts';
import { pinOf, pinsFile, readPins } from './pins.ts';
import { asking, causeOf, connect, fixOf, isObject, joinedSaid, QUESTION, readLock, samePath, sha256, spokenOf, Stopped, thisMachine, valueOf, writeLock, type AgentIo } from './skills.ts';

type Env = Record<string, string | undefined>;

/* ── what looks like a key ─────────────────────────────────────────────── */

/**
 * The issuers' own prefixes, as the kernel refuses them in a row (`packages/kernel/src/coerce.ts`). Kept here too,
 * because this command decides from them whether to deposit, and it depends on no package that could lend them.
 */
const KEY_SHAPES: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bgh[opsur]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{20,}/,
  /\bsk-[A-Za-z0-9]{32,}/,
  /\bnpm_[A-Za-z0-9]{36}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
  /[?&](?:api[_-]?key|access[_-]?token|token|key|secret)=[^&\s]{8,}/i,
];

/** A run of thirty-two or more that mixes lower case, capitals and digits and changes between them often. */
function randomRun(run: string): boolean {
  if (!/[a-z]/.test(run) || !/[A-Z]/.test(run) || !/[0-9]/.test(run)) return false;
  const kind = (c: string) => (c >= 'a' && c <= 'z' ? 0 : c >= 'A' && c <= 'Z' ? 1 : c >= '0' && c <= '9' ? 2 : 3);
  let turns = 0;
  for (let i = 1; i < run.length; i++) if (kind(run[i]!) !== kind(run[i - 1]!)) turns++;
  return turns >= 0.4 * (run.length - 1);
}

/**
 * A run that starts at a root and goes down three folders or more is where a program lives, so each of its pieces is asked
 * alone (`holdsTokenShape` in `install.ts` reads a path the same way). Asked whole, a slash and a hyphen each count as a
 * change of kind, so `/Users/ann/Dev/wt/fin-1104/apps/cli/src/main` read as a key and a tool started from there was not
 * recorded. A key between two slashes is still a run of its own, and a key that is not a path is asked as it always was.
 */
const FOLDERS_DOWN = /^\/(?:[^/]+\/){3,}[^/]*$/;

const randomInRun = (run: string): boolean => (FOLDERS_DOWN.test(run) ? run.split('/').some((piece) => piece.length >= 32 && randomRun(piece)) : randomRun(run));

export const looksLikeKey = (text: string): boolean =>
  KEY_SHAPES.some((shape) => shape.test(text)) || [...text.matchAll(/[A-Za-z0-9+/=_-]{32,}/g)].some(([run]) => randomInRun(run));

/**
 * Whether a text holds a key by an issuer's own shape alone, never by a random-looking run: for a whole file of work,
 * where a lockfile's hashes and a test's fixtures are random-looking and hold no key (`sync-patches.ts`).
 */
export const issuerShaped = (text: string): boolean => KEY_SHAPES.some((shape) => shape.test(text));

/** A name the plan's §5.5 treats as a key's whatever its value looks like. */
const KEY_NAMED = /(?:KEY|TOKEN|SECRET|PASSWORD|PAT)$/i;
const AUTH_HEADER = /^(?:proxy-)?authorization$/i;
/** An env or header name this command records. Anything else is skipped, and never echoed. */
const ENTRY_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
/** A tool's name as the register holds it. */
const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/* ── the configs ───────────────────────────────────────────────────────── */

type Entry = { name: string; header: boolean; secret: boolean; given: string | null };

/**
 * One server as a config describes it, or one integration as its client lists it, which has no transport, no command
 * and no entries. `given` is held only until the server is recorded.
 */
type Found = {
  kind: 'mcp' | 'integration';
  name: string;
  scope: 'project' | 'global';
  source: string;
  transport: 'stdio' | 'http' | null;
  command: string | null;
  args: string[];
  endpoint: string | null;
  entries: Entry[];
};

const needName = (e: { name: string; header: boolean }) => (e.header ? `header:${e.name}` : e.name);

/** The servers of one `mcpServers` object, and a sentence for each one that could not be recorded. */
function serversOf(servers: unknown, scope: Found['scope'], source: string, lines: string[]): Found[] {
  if (!isObject(servers)) return [];
  const out: Found[] = [];
  for (const [name, config] of Object.entries(servers)) {
    if (!TOOL_NAME.test(name) || !isObject(config)) continue;
    const type = config.type ?? (typeof config.url === 'string' ? 'http' : 'stdio');
    const transport = type === 'stdio' ? 'stdio' : type === 'http' || type === 'sse' ? 'http' : null;
    if (transport === null) {
      lines.push(`Tool ${name} in ${source} is not a stdio or http server, so it was not recorded.`);
      continue;
    }
    const command = transport === 'stdio' && typeof config.command === 'string' ? config.command : null;
    const args = transport === 'stdio' && Array.isArray(config.args) ? config.args.filter((a): a is string => typeof a === 'string') : [];
    const endpoint = transport === 'http' && typeof config.url === 'string' ? config.url : null;
    if ((transport === 'stdio' && !command) || (transport === 'http' && !endpoint)) continue;
    if ([command ?? '', endpoint ?? '', ...args].some(looksLikeKey)) {
      lines.push(`Tool ${name} in ${source} carries what looks like a key in its command, arguments or address, so it was not recorded. Move the key into its env and scan again.`);
      continue;
    }
    const pairs = transport === 'stdio' ? config.env : config.headers;
    const entries: Entry[] = [];
    for (const [key, given] of Object.entries(isObject(pairs) ? pairs : {})) {
      if (!ENTRY_NAME.test(key)) continue;
      const header = transport === 'http';
      const text = typeof given === 'string' && given !== '' && !given.includes('${') ? given : null;
      const secret = text !== null && (KEY_NAMED.test(key) || (header && AUTH_HEADER.test(key)) || looksLikeKey(text));
      entries.push({ name: key, header, secret, given: secret ? text : null });
    }
    out.push({ kind: 'mcp', name, scope, source, transport, command, args, endpoint, entries });
  }
  return out;
}


/* ── the deposit ───────────────────────────────────────────────────────── */

/** Deposit one value and answer the credential it became, or the sentence that says why not. */
export type Depositor = (ask: { label: string; opens: string }, given: string) => Promise<{ credential: string } | { refused: string }>;

/**
 * A depositor over `braindog keys put`, the one door a key goes in by. The value is handed to it as its standard
 * input and to nothing else; its one line of output never quotes a value.
 *
 * NO GRANT IS NEEDED TO PUT A KEY AWAY. `keys put` uses the keychain access kept for the host
 * when there is one, and otherwise the login this scan already reads the record with, which the door takes to add a
 * NEW key in this run's project. A key whose label is already there is refused with the rotation sentence, which names
 * keychain access, and is then counted with the keys kept by name only.
 */
export function depositor(o: { file: string; env: Env; host: string; headers: Record<string, string>; signal?: AbortSignal }): Depositor {
  return async (ask, given) => {
    const said: string[] = [];
    const code = await keys(['put', ask.label, '--opens', ask.opens, '--kind', 'api_token', '--host', o.host], {
      file: o.file,
      env: o.env,
      stdin: () => given,
      say: (line) => void said.push(line),
      headers: async () => o.headers,
      spawn: async () => 1,
      ...(o.signal ? { signal: o.signal } : {}),
    });
    const kept = /^(?:deposited|rotated) (credentials#[1-9][0-9]*) on /.exec(said[0] ?? '');
    return code === 0 && kept?.[1] ? { credential: kept[1] } : { refused: said[0] ?? 'The key was not deposited.' };
  };
}

/* ── the lock ──────────────────────────────────────────────────────────── */

/**
 * `written`: the SHA-256 of each entry BrainDog applied. `asked`: the config shape each proposal was made for.
 * `same`: the row a tool found under another name was matched to, by how it starts. `missed`: the rows such a tool was
 * looked for among and not found, so they are read again only once one of them has changed. `said`: the hash of the
 * last line said of a tool the record answered for (`toolsSeen`), so a question waiting or a tool skipped is said once.
 */
type ToolsLock = { written: Record<string, string>; asked: Record<string, string>; same: Record<string, string>; missed: Record<string, string>; said: Record<string, string> };

function toolsLock(file: string): ToolsLock | null {
  const held = readLock(file);
  if (held === null) return null;
  const strings = (x: unknown) => Object.fromEntries(Object.entries(isObject(x) ? x : {}).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return { written: strings(held.written), asked: strings(held.asked), same: strings(held.same), missed: strings(held.missed), said: strings(held.said) };
}

/** JSON with its keys in order, so the same entry always hashes the same. */
export const canonical = (x: unknown): string =>
  Array.isArray(x)
    ? `[${x.map(canonical).join(',')}]`
    : isObject(x)
      ? `{${Object.keys(x)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
          .join(',')}}`
      : JSON.stringify(x ?? null);

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/* ── how a tool starts ─────────────────────────────────────────────────── */

/** What a row or a config says of how a tool starts. */
type Start = { transport: unknown; command: string | null; args: string[]; endpoint: string | null };

const startOf = (x: Record<string, unknown>): Start => ({
  transport: x.transport,
  command: typeof x.command === 'string' ? x.command : null,
  args: strings(x.args),
  endpoint: typeof x.endpoint === 'string' ? x.endpoint : null,
});

/** An address as it is compared: the host in lower case and no slash at the end, so one address written two ways is one. */
function addressOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * A TOOL IS WHAT IT RUNS, NOT WHAT IT IS CALLED. Two starts with one key are one tool: the same command and
 * arguments, or the same address. His record held four tools twice, as `x` and `x-mcp`, because the match was by name.
 */
const startKey = (s: Start): string => canonical([s.transport, s.command, s.args, s.endpoint === null ? null : addressOf(s.endpoint)]);

/** How a tool starts, as a person would type it, with the home folder written `~`. */
const startWords = (s: Start, home: string): string => {
  const words = s.endpoint ?? [s.command ?? '', ...s.args].join(' ').trim();
  return (home === '' ? words : words.replaceAll(home, '~')).slice(0, 280);
};

const DAY_MS = 86_400_000;

/* ── what the record is told ───────────────────────────────────────────── */

/** The most tools one `toolsSeen` call carries. */
const SEEN_PER_CALL = 50;

/** The refusals of a record, or of a command line, that has no `toolsSeen`: the scan then goes on as it did before. */
const NO_SEEN = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);

/** A found tool as `toolsSeen` takes it: how it starts and the names of the keys it needs, never a value. */
function seenOf(f: Found): Record<string, unknown> {
  return {
    name: f.name,
    kind: f.kind,
    scope: f.scope,
    ...(f.transport === null ? {} : { transport: f.transport }),
    ...(f.command === null ? {} : { command: f.command, args: f.args }),
    ...(f.endpoint === null ? {} : { endpoint: f.endpoint }),
    needs: f.entries.map(needName),
    source: f.source,
  };
}

/** Whether any text of a found tool, as it would be sent, looks like a key. A server holding one is never sent. */
const keyedSeen = (f: Found): boolean => [f.name, f.source, f.command ?? '', f.endpoint ?? '', ...f.args, ...f.entries.map(needName)].some(looksLikeKey);

/**
 * Every row of the tools list in every state, a hundred a read, for a dry run to match against what one context cuts;
 * `null` when the record does not answer, and the dry run then says what it did before.
 */
async function wholeList(client: Client): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const out = await client.list({ register: 'tools', limit: 100, ...(cursor === null ? {} : { cursor }) });
    const value = valueOf(out) as { rows?: unknown; cursor?: unknown } | null;
    if (value === null || !Array.isArray(value.rows)) return null;
    for (const r of value.rows) if (isObject(r) && isObject(r.fields)) rows.push(r.fields);
    cursor = typeof value.cursor === 'string' ? value.cursor : null;
    if (cursor === null) return rows;
  }
  return rows;
}

/** The record's reason a tool was skipped, as a line can carry it: its own words, or a fixed sentence. */
function whyOf(why: unknown): string {
  if (typeof why !== 'string' || why.trim() === '' || looksLikeKey(why)) return 'BrainDog did not say why.';
  const said = why.trim().slice(0, 280);
  return /[.?!]$/.test(said) ? said : `${said}.`;
}

/* ── scan ──────────────────────────────────────────────────────────────── */

export type ToolScan = {
  client: Client;
  context: Context;
  top: string | null;
  cwd: string;
  home: string;
  dryRun: boolean;
  /** `null` when keys may not be deposited from here at all. */
  deposit: Depositor | null;
  machine?: string;
  now?: () => number;
  /**
   * The host keys are deposited to and the hosts file its grants are kept in. When given, the sentence about keys
   * kept by name for want of keychain access is said once for that host, and again only once a grant has been kept.
   */
  once?: { host: string; hosts: string } | undefined;
  /** What the client says it is connected to beyond its files, read after them. None asked when not given. */
  connected?: (() => Promise<ConnectedList>) | undefined;
  /**
   * The host the record is reached at, whose key names it (`target`), so a question the scan files or finds waiting is
   * printed with the link that opens it on Decide. Without it the line says the question is on Decide.
   */
  to?: Pick<Target, 'key'> | undefined;
};

/**
 * A line about a question with the link that opens it on Decide after it, as an add-on install prints (`untilAccepted`),
 * or the line as it is when there is no host to link to, the host names no record, or the answer named no question.
 * A QUESTION IS NAMED BY ITS ID OR HANDLE, never in words, so anything with a space in it is not one to link to.
 */
function linked(line: string, to: Pick<Target, 'key'> | undefined, id: unknown): string {
  if (to === undefined || typeof id !== 'string' || !/^\S+$/u.test(id)) return line;
  const link = decideLink(to, id);
  return link === null ? line : `${line} ${link}`;
}

/** Where an integration was found, as its row's origin and its lines name it. */
const CONNECTED_SOURCE = "Claude Code's connections";

/** How a found tool is named in a line: a server with the file it came from, an integration by its name. */
const toolSaid = (f: Found): string => (f.kind === 'integration' ? `Integration ${f.name}` : `Tool ${f.name} in ${f.source}`);

/**
 * The integrations among what the client listed: each entry whose name (as a person reads it or as printed) and whose
 * address no server read from a file holds. An address that looks like it holds a key is left out, and said.
 */
function integrationsOf(list: ConnectedList, found: Map<string, Found>, lines: string[]): Found[] {
  const names = new Set([...found.values()].map((f) => f.name.toLowerCase()));
  const addresses = new Set([...found.values()].flatMap((f) => (f.endpoint === null ? [] : [addressOf(f.endpoint)])));
  const out: Found[] = [];
  for (const c of list.entries) {
    if (names.has(c.name.toLowerCase()) || names.has(c.listed.toLowerCase())) continue;
    if (c.address !== null && addresses.has(addressOf(c.address))) continue;
    const keyed = c.address !== null && looksLikeKey(c.address);
    if (keyed) lines.push(`Integration ${c.name} has an address that looks like it holds a key, so it is kept without its address.`);
    names.add(c.name.toLowerCase());
    out.push({ kind: 'integration', name: c.name, scope: 'global', source: CONNECTED_SOURCE, transport: null, command: null, args: [], endpoint: keyed ? null : c.address, entries: [] });
  }
  return out;
}

/** Whether the hosts file keeps an unexpired keychain access for this host. */
function grantHeld(hosts: string, host: string, now: number): boolean {
  try {
    const grants: unknown = readHosts(hosts).hosts[host]?.vault;
    return Object.values(isObject(grants) ? grants : {}).some((g) => isObject(g) && typeof g.value === 'string' && g.value !== '' && typeof g.expires === 'string' && Date.parse(g.expires) > now);
  } catch {
    return false;
  }
}

/**
 * Whether to say that keys were kept by name for want of keychain access, now.
 *
 * ONCE PER HOST, because the start hook runs the scan at every session and the sentence would otherwise be in every
 * briefing. It is remembered in `~/.braindog/tools-said.json`, keyed by host and holding only when it was said, until
 * the hosts file keeps an unexpired keychain access for that host; then it is forgotten, so a grant that lapses later is
 * said again. A state file that cannot be read or written costs only the quiet.
 */
function noGrantOnce(home: string, once: { host: string; hosts: string }, now: number, noGrant: boolean): boolean {
  const file = join(home, '.braindog', 'tools-said.json');
  try {
    const said = readLock(file) ?? {};
    const had = Object.hasOwn(said, once.host);
    if (grantHeld(once.hosts, once.host, now)) {
      if (had) {
        delete said[once.host];
        writeLock(file, said);
      }
      return noGrant;
    }
    if (!noGrant || had) return false;
    said[once.host] = { no_grant_said: new Date(now).toISOString() };
    writeLock(file, said);
    return true;
  } catch {
    return noGrant;
  }
}

/**
 * Scan once, and the lines that say what was recorded, proposed or skipped. Nothing at all when the record has no
 * tools register, and then no config is read.
 */
export async function scanTools(s: ToolScan): Promise<string[]> {
  const reg = s.context.registers.find((r) => r.id === 'tools');
  if (!reg) return [];
  const lines: string[] = [];
  const lockFile = join(s.home, '.braindog', 'tools-lock.json');
  const lock = toolsLock(lockFile);
  if (lock === null) return [`${lockFile} is not valid JSON, so tools were not scanned. Delete it and scan again.`];
  /* ONE NAME FOR THIS MACHINE ON EVERY PATH, the one people read ("MacBook Pro"), never its network name: the old path
     wrote "Someones-MacBook-Pro.local" beside the record's "MacBook Pro", so one Mac read as two on a tool's row. */
  const machine = s.machine ?? (await (await import('./hooks.ts')).deviceName(process.env, s.once?.host ?? null));
  const now = (s.now ?? Date.now)();

  /* Found in precedence order, so a later one of the same scope and name replaces an earlier one. */
  const found = new Map<string, Found>();
  const keep = (list: Found[]) => list.forEach((f) => found.set(`${f.scope}|${f.name}`, f));
  for (const app of CLIENTS)
    for (const set of app.servers(s.home, s.top, s.cwd)) {
      if (set.fault !== null) lines.push(set.fault);
      else keep(serversOf(set.servers, set.scope, set.source, lines));
    }
  /* After every file, so an entry a file holds is that file's server and never an integration besides. */
  if (s.connected !== undefined) {
    const list = await s.connected();
    lines.push(...list.lines);
    keep(integrationsOf(list, found, lines));
  }

  const project = s.context.project;
  const listed = [...reg.rows, ...reg.inherited];
  const place = samePath(s.top ?? s.cwd);
  let named = 0;
  const blocked = new Set<string>();

  /** The needs for a server: a credential the row already names is kept, a key is deposited when it may be, and the rest are names. */
  const needsFor = async (f: Found, prior: string[], allow: boolean) => {
    const byName = new Map(prior.map((n) => [n.split('=')[0] ?? n, n]));
    const needs: string[] = [];
    let deposited = 0;
    let would = 0;
    for (const e of f.entries) {
      const label = needName(e);
      const held = byName.get(label);
      if (held?.includes('=credentials#')) {
        needs.push(held);
        continue;
      }
      if (e.secret && e.given !== null && allow && s.deposit !== null) {
        if (s.dryRun) would++;
        else {
          const kept = await s.deposit(
            { label: `${f.name} ${e.name}`.slice(0, 120), opens: `The ${e.header ? `${e.name} header` : e.name} the ${f.name} MCP server reads`.slice(0, 280) },
            e.given,
          );
          if ('credential' in kept) {
            needs.push(`${label}=${kept.credential}`);
            deposited++;
            continue;
          }
          blocked.add(kept.refused);
          named++;
        }
      }
      needs.push(label);
    }
    return { needs, deposited, would };
  };

  /** A listed row read whole, once a scan, and again after this scan has written to it. */
  type Held = { seq: number; fields: Record<string, unknown>; version: number };
  const read = new Map<string, Held | null>();
  const whole = async (r: Brief): Promise<Held | null> => {
    const had = read.get(r.spoken);
    if (had !== undefined) return had;
    const seq = Number(r.spoken.slice(r.spoken.indexOf('#') + 1));
    const got = valueOf(await s.client.get('tools', seq));
    const held = isObject(got) && isObject(got.fields) && typeof got.version === 'number' ? { seq, fields: got.fields, version: got.version } : null;
    read.set(r.spoken, held);
    return held;
  };

  /**
   * The row of this scope that starts as a found tool does, when none has its name. The row found is kept in the lock,
   * so the next scan reads that one row; a search that found none is kept too, by the rows it read and their versions,
   * and is not made again until one of them changes. Without that, a tool that waits on a question would have every
   * row read at every session's start.
   */
  const startsAs = async (f: Found, key: string, start: string): Promise<Brief | undefined> => {
    const among = listed.filter((r) => r.scope === f.scope);
    const looked = sha256(canonical([start, among.map((r) => [r.spoken, r.version])]));
    if (lock.missed[key] === looked) return undefined;
    const last = among.find((r) => r.spoken === lock.same[key]);
    for (const r of last === undefined ? among : [last, ...among.filter((x) => x !== last)]) {
      const held = await whole(r);
      if (held === null || startKey(startOf(held.fields)) !== start) continue;
      lock.same[key] = r.spoken;
      delete lock.missed[key];
      return r;
    }
    delete lock.same[key];
    lock.missed[key] = looked;
    return undefined;
  };

  const keysSaid = (n: { deposited: number; would: number }) =>
    n.deposited > 0 ? `, with ${String(n.deposited)} key${n.deposited === 1 ? '' : 's'} deposited` : n.would > 0 ? `, and ${String(n.would)} key${n.would === 1 ? '' : 's'} would be deposited` : '';

  /**
   * A key of a tool the record answered for, deposited into the row it names when that row names no key for it yet,
   * and the words saying so. Only where the key belongs, as below: a global tool from a run in a project has none.
   */
  const depositInto = async (f: Found, spoken: string): Promise<{ said: string; fault: string | null }> => {
    const allow = f.scope === 'project' ? project !== null : project === null;
    const seq = Number(/^tools#([1-9][0-9]*)$/.exec(spoken)?.[1] ?? Number.NaN);
    if (!allow || s.deposit === null || !Number.isInteger(seq) || !f.entries.some((e) => e.secret && e.given !== null)) return { said: '', fault: null };
    const got = valueOf(await s.client.get('tools', seq));
    if (!isObject(got) || !isObject(got.fields) || typeof got.version !== 'number') return { said: '', fault: null };
    const prior = strings(got.fields.needs);
    const n = await needsFor(f, prior, allow);
    if (n.deposited === 0) return { said: '', fault: null };
    const label = (need: string) => need.split('=')[0] ?? need;
    const here = new Set(n.needs.map(label));
    const out = await s.client.update({ register: 'tools', seq, patch: { needs: [...n.needs, ...prior.filter((p) => !here.has(label(p)))] }, version: got.version });
    return valueOf(out) === null ? { said: '', fault: `${f.name} could not name its deposited keys in your BrainDog: ${fixOf(out)}` } : { said: keysSaid(n), fault: null };
  };

  /**
   * THE RECORD MATCHES WHAT THIS MACHINE HOLDS. Every tool found is sent in `toolsSeen`, 50 a call, and
   * each answer is one line. The record matches a tool to its row by what it runs, among all of its rows and not the
   * ones one context shows, so a new server is always recorded, nothing past that cut is lost, and a second machine's
   * path is not a change to ask about. `false` when the record, or this command line, has no `toolsSeen`: the scan
   * below then goes on exactly as before.
   *
   * ONLY NAMES AND HOW A TOOL STARTS ARE SENT, its keys by name. A tool any part of which looks like a key is not sent.
   * A key is deposited after the answer, into the row the answer names. The lock keeps only what was said, so a
   * question waiting or a tool skipped is said once, and said again when the answer changes.
   */
  const viaSeen = async (): Promise<boolean> => {
    const said: string[] = [];
    const once = (key: string, line: string) => {
      const hash = sha256(line);
      if (lock.said[key] !== hash) said.push(line);
      lock.said[key] = hash;
    };
    const sending: { f: Found; key: string }[] = [];
    for (const f of found.values()) {
      if (f.scope === 'project' && project === null) continue;
      if (f.scope === 'global' && project !== null && listed.some((r) => r.scope === 'project' && r.name === f.name)) continue;
      if (keyedSeen(f)) {
        said.push(`${toolSaid(f)} carries what looks like a key, so it was not recorded.`);
        continue;
      }
      sending.push({ f, key: `${f.scope}|${f.scope === 'project' ? place : ''}|${f.name}` });
    }
    const projectServers = [...found.values()].filter((f) => f.scope === 'project').length;
    if (project === null && projectServers > 0)
      said.unshift(`This folder is in no project in your BrainDog, so the ${String(projectServers)} server${projectServers === 1 ? '' : 's'} of its project config ${projectServers === 1 ? 'was' : 'were'} not recorded.`);
    if (sending.length === 0) {
      lines.push(...said);
      return true;
    }
    const device = machine;
    let handled = false;
    try {
      for (let at = 0; at < sending.length; at += SEEN_PER_CALL) {
        const batch = sending.slice(at, at + SEEN_PER_CALL);
        const out = await s.client.call<{ tools: unknown }>('toolsSeen', { machine: device, found: batch.map((b) => seenOf(b.f)) });
        if (!out.ok && 'refusal' in out && NO_SEEN.has(out.refusal.code) && !handled) return false;
        handled = true;
        const value = valueOf(out);
        const answers = isObject(value) && Array.isArray(value.tools) ? value.tools.filter(isObject) : null;
        if (answers === null) {
          said.push(`The rest of the tools were not recorded: ${fixOf(out)}`);
          break;
        }
        for (const [i, { f, key }] of batch.entries()) {
          const a = answers.length === batch.length && answers[i]?.name === f.name ? answers[i] : answers.find((x) => x.name === f.name);
          if (a === undefined) continue;
          const row = typeof a.row === 'string' ? a.row : null;
          if (a.did === 'added' || a.did === 'seen' || a.did === 'seen-here') {
            delete lock.said[key];
            const kept = row === null ? { said: '', fault: null } : await depositInto(f, row);
            if (a.did === 'added') said.push(`${f.name} was recorded ${f.scope === 'project' && project !== null ? `in ${project.name}` : 'for use everywhere'}${kept.said}.`);
            else if (kept.said !== '') said.push(`${f.name} is recorded${kept.said}.`);
            if (kept.fault !== null) said.push(kept.fault);
          } else if (a.did === 'asked')
            once(
              key,
              linked(row !== null ? `${f.name} runs something else now; the question is on Decide.` : `${f.name} applies everywhere, so recording it was asked on Decide.`, s.to, a.question),
            );
          else if (a.did === 'waiting') once(key, linked(`${f.name} waits on a question already on Decide.`, s.to, a.question));
          else if (a.did === 'skipped') once(key, `${f.name} was not recorded: ${whyOf(a.why)}`);
        }
      }
    } catch (e) {
      handled = true;
      if (!(e instanceof Stopped)) throw e;
      said.push('BrainDog stopped answering part way, so the rest of the tools wait for the next scan.');
    } finally {
      if (handled) {
        /* The values go out of reach here, whatever happened above. */
        for (const f of found.values()) for (const e of f.entries) e.given = null;
        writeLock(lockFile, lock);
      }
    }
    lines.push(...said);
    return true;
  };

  const everywhere: { f: Found; key: string; shape: string; row: Record<string, unknown> }[] = [];
  /* A DRY RUN OVER A LIST LONGER THAN ONE CONTEXT READS THE WHOLE LIST, every state, so it names only what the record
     does not hold. It said "not recorded, because your BrainDog lists more tools than one context shows" of every server
     on his Mac, nineteen lines a scan, after a real scan had matched them all. */
  const every = s.dryRun && reg.truncated ? await wholeList(s.client) : null;
  const held = (f: Found): boolean =>
    every !== null &&
    every.some(
      (r) =>
        (typeof r.name === 'string' && r.name.trim().toLowerCase() === f.name.trim().toLowerCase()) ||
        ((f.command !== null || f.endpoint !== null) && startKey(startOf(r)) === startKey(f)),
    );
  /* A dry run sends nothing, so it says what it would do from the context, as before. */
  if (s.dryRun || !(await viaSeen())) try {
    const projectServers = [...found.values()].filter((f) => f.scope === 'project');
    if (project === null && projectServers.length > 0)
      lines.push(`This folder is in no project in your BrainDog, so the ${String(projectServers.length)} server${projectServers.length === 1 ? '' : 's'} of its project config ${projectServers.length === 1 ? 'was' : 'were'} not recorded.`);

    for (const f of found.values()) {
      if (f.scope === 'project' && project === null) continue;
      /* A key belongs where its tool applies, and the door deposits into this run's project. */
      const allow = f.scope === 'project' ? project !== null : project === null;
      const key = `${f.scope}|${f.scope === 'project' ? place : ''}|${f.name}`;
      const names = f.entries.map(needName).sort();
      const shape = sha256(canonical([f.transport, f.command, f.args, f.endpoint, names]));
      if (f.scope === 'global' && project !== null && listed.some((r) => r.scope === 'project' && r.name === f.name)) continue;
      const start = startKey(f);
      /* By name first, then by how it starts. A tool already asked about is not looked for again: its answer is a
         row of its own name. */
      const waits = f.scope === 'global' && project !== null && !reg.truncated && lock.asked[key] === shape;
      const row = listed.find((r) => r.scope === f.scope && r.name === f.name) ?? (waits || (f.kind === 'integration' && f.endpoint === null) ? undefined : await startsAs(f, key, start));

      if (row === undefined) {
        if (every !== null) {
          if (!held(f)) lines.push(`${toolSaid(f)} would be recorded.`);
          continue;
        }
        if (reg.truncated) {
          lines.push(`${toolSaid(f)} was not recorded, because your BrainDog lists more tools than one context shows.`);
          continue;
        }
        if (f.scope === 'global' && project !== null) {
          /* A run in a project cannot create a row that applies everywhere, so it asks, with names only, and all of
             them in one question once the loop is done: a first run on a machine with seven servers asked seven. */
          if (lock.asked[key] === shape) continue;
          const { needs } = await needsFor(f, [], false);
          everywhere.push({ f, key, shape, row: fieldsOf(f, needs, machine, now) });
          continue;
        }
        const n = await needsFor(f, [], allow);
        if (s.dryRun) {
          lines.push(`${toolSaid(f)} would be recorded${keysSaid(n)}.`);
          continue;
        }
        const out = await s.client.create({ register: 'tools', fields: fieldsOf(f, n.needs, machine, now) });
        const spoken = spokenOf(valueOf(out));
        lines.push(spoken === null ? `${toolSaid(f)} was not recorded: ${fixOf(out)}` : `${toolSaid(f)} was recorded${keysSaid(n)}.`);
        continue;
      }

      const got = await whole(row);
      if (got === null) continue;
      const { seq, fields } = got;
      const prior = strings(fields.needs);
      const was = startOf(fields);

      /* THE SAME START IS THE SAME TOOL, AND NOTHING IS ASKED: the change would leave the row as it is. A name it needs
         here that the row lacks is added, and nothing the row names is taken away, since another machine may need it.
         AN INTEGRATION IS THE SAME while its address is, or when none was printed this time. */
      const same = f.kind === 'integration' ? f.endpoint === null || (was.endpoint !== null && addressOf(was.endpoint) === addressOf(f.endpoint)) : startKey(was) === start;
      if (same) {
        const patch: Record<string, unknown> = {};
        const hosts = strings(fields.hosts);
        if (!hosts.includes(machine)) patch.hosts = [...hosts, machine];
        const seen = typeof fields.seen === 'string' ? Date.parse(fields.seen) : Number.NaN;
        if (!(now - seen < DAY_MS)) patch.seen = new Date(now).toISOString();
        const n = await needsFor(f, prior, allow);
        const label = (need: string) => need.split('=')[0] ?? need;
        const had = new Set(prior.map(label));
        const here = new Set(n.needs.map(label));
        if (n.deposited > 0 || n.needs.some((need) => !had.has(label(need)))) patch.needs = [...n.needs, ...prior.filter((p) => !here.has(label(p)))];
        if (n.would > 0) lines.push(`Tool ${f.name} is recorded${keysSaid(n)}.`);
        if (s.dryRun || Object.keys(patch).length === 0) continue;
        read.delete(row.spoken);
        const out = await s.client.update({ register: 'tools', seq, patch, version: got.version });
        if (n.deposited > 0) lines.push(valueOf(out) === null ? `Tool ${f.name} could not name its deposited keys in your BrainDog: ${fixOf(out)}` : `Tool ${f.name} is recorded${keysSaid(n)}.`);
        continue;
      }

      if (lock.asked[key] === shape) continue;
      const n = await needsFor(f, prior, allow);
      if (s.dryRun) {
        lines.push(`${toolSaid(f)} differs from the one in your BrainDog, which would be left as it is and the change proposed${keysSaid(n)}.`);
        continue;
      }
      const patch = f.kind === 'integration' ? { endpoint: f.endpoint } : { transport: f.transport, command: f.command, args: f.args, endpoint: f.endpoint, needs: n.needs };
      /* THE OWNER'S QUESTION IN WORDS, 80 CHARACTERS AT MOST. It read "Change tools#8 to how fly-copperleaf is set up
         in ~/.claude.json on Maras-MacBook-Pro.local?", then "Update the fly-copperleaf tool to match this Mac?", which
         still named a machine and not what would change. The id, the path and the network name are the details, beside
         how it starts in the record (`was`) and how it starts here (`now`).
         ASKED ONCE FOR EVERY MACHINE: the cause is the row and the start asked for, so a second machine with
         the same config joins the question already open. */
      const question = f.kind === 'integration' ? asking('Change the address of ', f.name, '?') : asking('Change how ', f.name, ' starts?');
      const out = await s.client.call<{ id: string; joined?: true; said?: string }>('propose', {
        question,
        body_kind: 'rowset',
        body: {
          register: 'tools',
          rows: [{ at: row.spoken, version: got.version, patch }],
          details: { source: f.source, machine, row: row.spoken, was: startWords(was, s.home), now: startWords(f, s.home) },
        },
        ...causeOf(`${row.spoken}#${sha256(start).slice(0, 24)}`),
      });
      const made = valueOf(out);
      if (made === null || typeof made.id !== 'string') {
        lines.push(`${toolSaid(f)} differs from the one in your BrainDog, and the change was not proposed: ${fixOf(out)}`);
        continue;
      }
      lock.asked[key] = shape;
      const joined = joinedSaid(made);
      lines.push(
        linked(
          joined === null
            ? `${toolSaid(f)} differs from the one in your BrainDog, so that was left as it is${keysSaid(n)}, and the change was asked on Decide: ${question}`
            : `${toolSaid(f)} differs from the one in your BrainDog, so that was left as it is${keysSaid(n)}, and the change is asked on Decide already. ${joined}`,
          s.to,
          made.id,
        ),
      );
    }
    if (everywhere.length > 0) lines.push(await askEverywhere(s.client, everywhere, lock, machine, s.dryRun, s.to));
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
    lines.push('BrainDog stopped answering part way, so the rest of the tools wait for the next scan.');
  } finally {
    /* The values go out of reach here, whatever happened above. */
    for (const f of found.values()) for (const e of f.entries) e.given = null;
    if (!s.dryRun) writeLock(lockFile, lock);
  }

  const noGrant = [...blocked].some((b) => /keychain access/i.test(b));
  const sayIt = s.once === undefined || s.dryRun ? noGrant : noGrantOnce(s.home, s.once, now, noGrant);
  if (noGrant && sayIt)
    lines.push(`${String(named)} key${named === 1 ? ' was' : 's were'} recorded by name only, because this machine holds no keychain access it could deposit with, and the values were not kept. Run braindog login <host> --keychain <project>, then scan again.`);
  for (const b of blocked) if (!/keychain access/i.test(b)) lines.push(b);
  return lines;
}

/**
 * A row's fields for a server: how it starts, the keys it needs by name, and where it was seen. An integration's are
 * its name, its address when one was printed, and where it was seen: it has no transport, no command and no keys.
 */
function fieldsOf(f: Found, needs: string[], machine: string, now: number): Record<string, unknown> {
  if (f.kind === 'integration')
    return {
      name: f.name,
      kind: 'integration',
      ...(f.endpoint === null ? {} : { endpoint: f.endpoint }),
      hosts: [machine],
      seen: new Date(now).toISOString(),
      origin: `${f.source} on ${machine}`.slice(0, 280),
    };
  return {
    name: f.name,
    kind: 'mcp',
    transport: f.transport,
    ...(f.transport === 'stdio' ? { command: f.command, args: f.args } : { endpoint: f.endpoint }),
    needs,
    hosts: [machine],
    seen: new Date(now).toISOString(),
    origin: `${f.source} on ${machine}`.slice(0, 280),
  };
}

/**
 * The one question for every server that applies everywhere and was found from a run in a project, and the line saying
 * what became of it. One server keeps its own sentence; several are one rowset, accepted whole or row by row on Decide.
 */
async function askEverywhere(
  client: Client,
  asks: { f: Found; key: string; shape: string; row: Record<string, unknown> }[],
  lock: ToolsLock,
  machine: string,
  dryRun: boolean,
  to?: Pick<Target, 'key'>,
): Promise<string> {
  const [first] = asks;
  const one = asks.length === 1 && first !== undefined ? first.f : null;
  const sources = [...new Set(asks.map((a) => a.f.source))].join(' and ');
  const names = asks.map((a) => a.f.name).join(', ');
  if (dryRun)
    return one
      ? `${toolSaid(one)} would be proposed as a tool everywhere, with its keys by name only.`
      : `${String(asks.length)} tools in ${sources} (${names}) would be proposed together as tools everywhere, with their keys by name only.`;
  /* IN WORDS, 80 CHARACTERS AT MOST, with where they were found kept in the details. Decide offers the rows one by one,
     so the question no longer says it can. */
  const question = one ? asking('Add the ', one.name, ` tool from ${thisMachine()}, for use everywhere?`) : severalAsked(asks.map((a) => a.f.name));
  const out = await client.call<{ id: string }>('propose', {
    question,
    body_kind: 'rowset',
    body: { register: 'tools', rows: asks.map((a) => a.row), details: { source: sources, machine } },
  });
  const made = valueOf(out);
  if (made === null || typeof made.id !== 'string')
    return one ? `${toolSaid(one)} was not proposed: ${fixOf(out)}` : `${String(asks.length)} tools in ${sources} were not proposed: ${fixOf(out)}`;
  for (const a of asks) lock.asked[a.key] = a.shape;
  return linked(
    one
      ? `${toolSaid(one)} applies everywhere and this run is in a project, so its keys were not deposited and recording it was asked on Decide: ${question}`
      : `${String(asks.length)} tools in ${sources} apply everywhere and this run is in a project, so their keys were not deposited and recording them was asked on Decide in one question: ${question}`,
    to,
    made.id,
  );
}

/**
 * The one question for several tools, inside 80 characters: as many names as fit, then how many more.
 * "Add 3 tools from this Mac, for use everywhere: fenwick, lantern and quill?"
 */
function severalAsked(names: string[]): string {
  const lead = `Add ${String(names.length)} tools from ${thisMachine()}, for use everywhere`;
  for (let shown = names.length; shown >= 1; shown--) {
    const rest = names.length - shown;
    const said = rest === 0 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}` : `${names.slice(0, shown).join(', ')} and ${String(rest)} more`;
    if (`${lead}: ${said}?`.length <= QUESTION) return `${lead}: ${said}?`;
  }
  return `${lead}?`;
}

/* ── write ─────────────────────────────────────────────────────────────── */

/* Claude Code's runner lives with its client; `setup.ts` and the tests take it from here, as before. */
export { runClaude, type ClaudeRunner };

const VARIABLE = /^[A-Z_][A-Z0-9_]*$/;

/** A key's spoken id as a `needs` entry names it, checked before it is written into a command a shell reads. */
const CREDENTIAL = /^credentials#[1-9][0-9]{0,8}$/;

/**
 * This command's path as a `headersHelper` can name it inside double quotes: printable ASCII that no shell reads as
 * more than itself there. A path holding anything else leaves the header out rather than a command that runs
 * something else.
 */
const HELPER_PATH = /^[A-Za-z0-9 _.:/()-]+$/;

/**
 * A tool row's Claude Code entry, and a sentence for each need it cannot carry.
 *
 * A stdio tool's keys are handed to it by `braindog keys exec`, one wrapper per key, so the entry names the key and
 * never holds it. An HTTP tool's header key is handed over by `braindog keys headers`, which the entry names as its
 * `headersHelper`: Claude Code runs that command when it connects and reads the header from its standard output,
 * so the entry holds the command and never the key. An entry has one helper, so a second
 * header key is left out and said, as is an env or header value BrainDog does not keep.
 */
export function renderEntry(name: string, fields: Record<string, unknown>, cli: string): { entry: Record<string, unknown> | null; notes: string[] } {
  const notes: string[] = [];
  const needs = strings(fields.needs);
  if (fields.transport === 'http') {
    if (typeof fields.endpoint !== 'string') return { entry: null, notes };
    let helper: string | null = null;
    for (const need of needs.filter((n) => n.startsWith('header:'))) {
      const [header = '', credential] = need.slice(7).split('=');
      if (credential === undefined) notes.push(`Tool ${name} needs its ${header} header, whose value BrainDog does not keep, so set it in the entry yourself.`);
      else if (helper !== null) notes.push(`Tool ${name}: its ${header} header is left out, because an entry has one headersHelper and it already hands over another header.`);
      else if (!HEADER_NAME.test(header) || !CREDENTIAL.test(credential) || !HELPER_PATH.test(cli))
        notes.push(`Tool ${name}: its ${header} header is left out, because the command that would hand it its key cannot be written safely here.`);
      else helper = `node "${cli}" keys headers ${credential} --as ${header}`;
    }
    return { entry: { type: 'http', url: fields.endpoint, ...(helper === null ? {} : { headersHelper: helper }) }, notes };
  }
  if (typeof fields.command !== 'string') return { entry: null, notes };
  let argv = [fields.command, ...strings(fields.args)];
  for (const need of [...needs].reverse()) {
    if (need.startsWith('header:')) continue;
    const [variable = '', credential] = need.split('=');
    if (credential === undefined) {
      notes.push(`Tool ${name} needs ${variable}, whose value BrainDog does not keep, so set it in the entry yourself.`);
      continue;
    }
    if (!VARIABLE.test(variable)) {
      notes.push(`Tool ${name}: ${credential} cannot be handed over as a variable of that name, so it is left out.`);
      continue;
    }
    argv = ['node', cli, 'keys', 'exec', credential, '--as', variable, '--', ...argv];
  }
  return { entry: { type: 'stdio', command: argv[0], args: argv.slice(1) }, notes };
}

export type ToolWrite = {
  client: Client;
  context: Context;
  top: string | null;
  cwd: string;
  home: string;
  /** The scope to apply, or `null` for a dry run of both. */
  scope: 'user' | 'project' | null;
  dryRun: boolean;
  /** The path of `main.ts`, which each wrapper runs. */
  cli: string;
  /** How the app's own program is run, for the app this writes into. */
  claude: ClaudeRunner;
  /** The app whose entries are written, by its id in the clients table; Claude Code's when none is named. */
  app?: string | undefined;
  /** The environment whose path a tool's program is looked for on: this process's when none is given. */
  env?: ClientEnv | undefined;
  /** The system the entries are for: this one when none is given. */
  platform?: string | undefined;
  /** The files already copied aside this run by the caller (setup), so a file it made or copied is not copied again. */
  copied?: Set<string> | undefined;
  /**
   * The Claude Code profile folder the person's entries go into (`env apply`), the default one's when none is named.
   * The caller's `claude` runs with that profile's `CLAUDE_CONFIG_DIR`.
   */
  profile?: string | undefined;
  /**
   * Asked of each entry about to be written, and of each a dry run shows: `ok` false leaves it out, and `line`, when
   * there is one, is said under it either way. With none, an entry that runs a program goes in only when pinned here.
   */
  approve?: ((name: string, entry: Record<string, unknown>) => Promise<{ ok: boolean; line: string | null }>) | undefined;
};

/**
 * Why a tool cannot run on this machine, as the line that leaves it out, or `null` when it can. An HTTP tool has no
 * program here. The program's own name is said, never its path.
 */
function deadOrForeign(name: string, fields: Record<string, unknown>, env: ClientEnv, platform: string, cwd: string): string | null {
  if (fields.transport === 'http' || typeof fields.command !== 'string') return null;
  const paths = [fields.command, ...strings(fields.args)];
  const foreign = paths.map((p) => foreignPath(p, platform)).find((f) => f !== null);
  if (foreign === 'windows') return `Tool ${name} was not written, because it starts from a Windows path and this machine is not Windows.`;
  if (foreign === 'home') return `Tool ${name} was not written, because it starts from a home folder of another computer.`;
  if (onPath(fields.command, env, platform, cwd)) return null;
  const program = fields.command.split(/[\\/]/).at(-1) ?? fields.command;
  return `Tool ${name} was not written, because its program ${program} is neither on this machine's path nor a file here.`;
}

/** Whether an entry runs a program on this machine: a stdio command, or an HTTP server's headers helper. */
const runsProgram = (entry: Record<string, unknown>): boolean => entry.type === 'stdio' || typeof entry.command === 'string' || typeof entry.headersHelper === 'string';

/**
 * WHAT IS ASKED WHEN THE CALLER ASKS NOTHING: an entry that runs a program goes in only when this machine pinned it.
 * The record says what every machine runs, and anyone who can add a tool row can say it, so only the person at a
 * machine says what runs on it; `env apply` is where they are asked.
 */
export const pinnedOnly =
  (home: string) =>
  async (name: string, entry: Record<string, unknown>): Promise<{ ok: boolean; line: string | null }> => {
    if (!runsProgram(entry) || readPins(pinsFile(home))?.[pinOf('tool', name, entry)] !== undefined) return { ok: true, line: null };
    return { ok: false, line: `Tool ${name} was not written, because it runs a program not approved on this machine. braindog env apply shows it and asks.` };
  };

/** Render every tool, apply the ones in the named scope, and the lines that say what changed or would. */
export async function writeTools(s: ToolWrite): Promise<string[]> {
  const approve = s.approve ?? pinnedOnly(s.home);
  const reg = s.context.registers.find((r) => r.id === 'tools');
  if (!reg) return [];
  const lines: string[] = [];
  const lockFile = join(s.home, '.braindog', 'tools-lock.json');
  const lock = toolsLock(lockFile);
  if (lock === null) return [`${lockFile} is not valid JSON, so no tool was written. Delete it and run tools write again.`];
  const app = clientOf(s.app ?? DEFAULT_CLIENT);
  if (app === undefined) return [`BrainDog does not know the app ${s.app ?? ''}, so no tool was written.`];
  /* The places a write goes, read once: the person's, then the repository's, each said when it cannot be read. */
  const read = app.servers(s.home, s.top, s.cwd, s.profile);
  const places = { user: read.find((r) => r.writes === 'user'), project: s.top === null ? undefined : read.find((r) => r.writes === 'project') };
  for (const place of [places.user, places.project]) if (place?.fault) lines.push(place.fault);
  const env = s.env ?? process.env;
  const platform = s.platform ?? process.platform;
  const copied = s.copied ?? new Set<string>();
  /* ANOTHER CLAUDE CODE PROFILE'S ENTRIES HAVE LOCK KEYS OF THEIR OWN, so what was written in one is never read as
     what was written in another; the default profile's keep the keys they always had. */
  const other = s.profile !== undefined && serversFileOf(s.profile, s.home) !== join(s.home, '.claude.json');
  const own = app.id !== 'claude' ? `${app.id}|` : other ? `claude@${samePath(s.profile ?? '')}|` : '';
  let applied = false;

  try {
    for (const row of [...reg.rows, ...reg.inherited] as Brief[]) {
      if (row.kind !== undefined && row.kind !== 'mcp') continue;
      const scope = row.scope === 'global' ? 'user' : 'project';
      /* A named scope is the only one looked at, so applying one never shows the other's entries as pending. */
      if ((scope === 'project' && s.top === null) || (s.scope !== null && s.scope !== scope)) continue;
      const name = typeof row.name === 'string' ? row.name : '';
      if (!TOOL_NAME.test(name)) continue;
      const got = valueOf(await s.client.get('tools', Number(row.spoken.slice(row.spoken.indexOf('#') + 1))));
      if (!isObject(got) || !isObject(got.fields)) continue;
      const { entry, notes } = renderEntry(name, got.fields, s.cli);
      if (entry === null) continue;
      const servers = places[scope]?.servers;
      const existing = isObject(servers) ? servers[name] : undefined;
      /* THE LOCK KEY NAMES THE APP, other than Claude Code's, whose keys stay as they were, so two apps never share one;
         and another Claude Code profile than the default, by its folder (`own` above). */
      const key = `${own}${scope === 'project' ? 'project' : 'global'}|${scope === 'project' ? samePath(s.top ?? s.cwd) : ''}|${name}`;
      const apply = !s.dryRun && s.scope === scope;

      let action: 'add' | 'replace' | 'kept' | 'same';
      if (existing === undefined) action = 'add';
      else if (canonical(existing) === canonical(entry)) action = 'same';
      else {
        const wrote = lock.written[key];
        const scanned =
          isObject(existing) &&
          (got.fields.transport === 'http'
            ? existing.url === got.fields.endpoint
            : existing.command === got.fields.command && canonical(strings(existing.args)) === canonical(strings(got.fields.args)));
        action = wrote === sha256(canonical(existing)) || (wrote === undefined && scanned) ? 'replace' : 'kept';
      }

      if (action === 'same') {
        if (apply && lock.written[key] === undefined) lock.written[key] = sha256(canonical(entry));
        continue;
      }
      if (action === 'kept') {
        lines.push(`Tool ${name} at ${scope} scope was changed by hand since BrainDog wrote it, so it is left. Remove it with ${app.remove(name, scope)} to take your BrainDog's.`);
        continue;
      }
      const at = scope === 'project' && s.top !== null ? s.top : s.cwd;
      const cannot = deadOrForeign(name, got.fields, env, platform, at);
      if (cannot !== null) {
        lines.push(cannot);
        continue;
      }
      lines.push(...notes);
      const plan = app.plan({ name, scope, entry, replace: action === 'replace', home: s.home, top: s.top, cwd: s.cwd, profile: s.profile });
      if (!apply) {
        /* AN ENTRY THE CALLER REFUSES IS NOT SHOWN, only why, since it may be refused for what it holds. */
        const said = await approve(name, entry);
        if (said.ok) lines.push(...plan.lines);
        if (said.line !== null) lines.push(said.line);
        continue;
      }
      /* ASKED BEFORE IT IS WRITTEN: an entry that runs a program is approved on this machine first (`env apply` asks,
         every other caller takes only what is pinned), and one left out says why. */
      {
        const ok = await approve(name, entry);
        if (ok.line !== null) lines.push(ok.line);
        if (!ok.ok) continue;
      }
      const done = await app.apply(plan, { run: s.claude, copied });
      lines.push(...done.lines);
      if (done.stop) break;
      if (!done.written) continue;
      /* WHAT THE APP NOW HOLDS IS HASHED, not the rendered entry: Codex and Cursor take an HTTP tool by its url alone, so
         the rendered entry's hash would make the next run call it changed by hand. */
      const back = app.servers(s.home, s.top, s.cwd, s.profile).find((r) => r.writes === scope)?.servers;
      lock.written[key] = sha256(canonical(isObject(back) && back[name] !== undefined ? back[name] : entry));
      applied = true;
    }
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
    lines.push('BrainDog stopped answering part way, so the rest of the tools were not written.');
  } finally {
    if (!s.dryRun && s.scope !== null) writeLock(lockFile, lock);
  }
  if (!applied && (s.dryRun || s.scope === null) && lines.some((l) => /^[+~] /.test(l)))
    lines.push('Nothing was changed. Run braindog tools write --scope user for the global tools, or --scope project for this repository.');
  return lines;
}

/* ── the command ───────────────────────────────────────────────────────── */

const USAGE_SCAN = 'braindog tools scan takes --host and --dry-run, and nothing else.';
const USAGE_WRITE = 'braindog tools write takes --scope user or --scope project, --host and --dry-run, and nothing else.';

/** `braindog tools scan|write`, and the exit code. */
export async function tools(args: string[], io: AgentIo & { cli: string; claude?: ClaudeRunner; list?: ListRunner }): Promise<number> {
  const [verb, ...rest] = args;
  if (verb !== 'scan' && verb !== 'write') {
    io.say('braindog tools takes scan or write.');
    return 1;
  }
  let values: { host?: string | undefined; scope?: string | undefined; 'dry-run'?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: rest,
      strict: true,
      options: { host: { type: 'string' }, 'dry-run': { type: 'boolean' }, scope: { type: 'string' } },
    }));
  } catch {
    io.say(verb === 'scan' ? USAGE_SCAN : USAGE_WRITE);
    return 1;
  }
  const scope = values.scope;
  if (verb === 'scan' && scope !== undefined) {
    io.say(USAGE_SCAN);
    return 1;
  }
  if (scope !== undefined && scope !== 'user' && scope !== 'project') {
    io.say(USAGE_WRITE);
    return 1;
  }
  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  if (!at.context.registers.some((r) => r.id === 'tools')) {
    io.out('This BrainDog has no Tools list, so there is nothing to do.');
    return 0;
  }
  const dryRun = values['dry-run'] === true;
  const base = { client: at.client, context: at.context, top: at.top, cwd: io.cwd, home: io.home, dryRun };
  const lines =
    verb === 'scan'
      ? await scanTools({
          ...base,
          deposit: depositor({ file: hostsPath(io.env), env: io.env, host: at.to.key, headers: await io.headers(at.to.key) }),
          /* By hand, so the ten seconds the list takes are waited for. */
          connected: () => connectedOf(io.list ?? runClaudeList, io.cwd),
          to: at.to,
        })
      : await writeTools({ ...base, scope: scope ?? null, cli: io.cli, claude: io.claude ?? runClaude, env: io.env });
  for (const line of lines) io.out(line);
  if (lines.length === 0) io.out(verb === 'scan' ? 'Every server found is recorded as it is.' : 'Every tool is written as your BrainDog has it.');
  if (dryRun) io.out('That was a dry run, so nothing was deposited, written, sent or proposed.');
  return 0;
}
