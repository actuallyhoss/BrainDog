/**
 * `braindog tools scan` and `braindog tools write`: the MCP servers this machine runs, recorded as rows of `tools`,
 * and the record's tools written back as Claude Code entries that hold no key (`loop/research-agent-path.md` §5.5).
 *
 * SCAN ONLY READS CONFIGS. `<top-level>/.mcp.json` is the project's, and `~/.claude.json` is read and never written:
 * its `mcpServers` are global and its `projects[<path>].mcpServers` are this project's.
 *
 * A KEY FOUND IN A CONFIG GOES TO THE VAULT OR NOWHERE (question 4). A key-named or key-shaped env or header value is
 * deposited through `braindog keys put`, the one door, and the row keeps `NAME=credentials#N`. Any other entry keeps
 * its NAME only. When there is no vault grant to deposit with, the row keeps the name and the value is dropped.
 * No sentence here quotes a value, and no value is written to a row, a lock file, or a proposal.
 *
 * A ROW THAT DIFFERS IS NOT OVERWRITTEN. The change is proposed as a rowset update, once per shape of the config.
 *
 * WRITE IS A DRY RUN UNTIL A SCOPE IS NAMED (question 5). `--scope user` applies the global tools through
 * `claude mcp add-json`, and `--scope project` this repository's, into its `.mcp.json`, only when typed by hand. An
 * entry already there is replaced only when it is still what BrainDog last wrote, by `~/.braindog/tools-lock.json`,
 * or still the entry the scan read.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { Brief, Client, Context } from '@braindog/client';

import { hostsPath, readHosts } from './http.ts';
import { keys } from './keys.ts';
import { connect, fixOf, isObject, readLock, samePath, sha256, spokenOf, Stopped, valueOf, writeLock, type AgentIo } from './skills.ts';

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

export const looksLikeKey = (text: string): boolean =>
  KEY_SHAPES.some((shape) => shape.test(text)) || [...text.matchAll(/[A-Za-z0-9+/=_-]{32,}/g)].some(([run]) => randomRun(run));

/** A name the plan's §5.5 treats as a key's whatever its value looks like. */
const KEY_NAMED = /(?:KEY|TOKEN|SECRET|PASSWORD|PAT)$/i;
const AUTH_HEADER = /^(?:proxy-)?authorization$/i;
/** An env or header name this command records. Anything else is skipped, and never echoed. */
const ENTRY_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
/** A tool's name as the register holds it. */
const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/* ── the configs ───────────────────────────────────────────────────────── */

type Entry = { name: string; header: boolean; secret: boolean; given: string | null };

/** One server as a config describes it. `given` is held only until the server is recorded. */
type Found = {
  name: string;
  scope: 'project' | 'global';
  source: string;
  transport: 'stdio' | 'http';
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
    out.push({ name, scope, source, transport, command, args, endpoint, entries });
  }
  return out;
}

/** A config file's JSON, `undefined` when there is none, and a sentence when it cannot be read. */
function readConfig(file: string, label: string, lines: string[]): Record<string, unknown> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (isObject(parsed)) return parsed;
  } catch {
    /* JSON.parse quotes the text around the fault, and the text holds keys. */
  }
  lines.push(`${label} is not valid JSON, so its servers were not read.`);
  return undefined;
}

/* ── the deposit ───────────────────────────────────────────────────────── */

/** Deposit one value and answer the credential it became, or the sentence that says why not. */
export type Depositor = (ask: { label: string; opens: string }, given: string) => Promise<{ credential: string } | { refused: string }>;

/**
 * A depositor over `braindog keys put`, the one door a key goes in by. The value is handed to it as its standard
 * input and to nothing else; its one line of output never quotes a value.
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

/** `written`: the SHA-256 of each entry BrainDog applied. `asked`: the config shape each proposal was made for. */
type ToolsLock = { written: Record<string, string>; asked: Record<string, string> };

function toolsLock(file: string): ToolsLock | null {
  const held = readLock(file);
  if (held === null) return null;
  const strings = (x: unknown) => Object.fromEntries(Object.entries(isObject(x) ? x : {}).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return { written: strings(held.written), asked: strings(held.asked) };
}

/** JSON with its keys in order, so the same entry always hashes the same. */
const canonical = (x: unknown): string =>
  Array.isArray(x)
    ? `[${x.map(canonical).join(',')}]`
    : isObject(x)
      ? `{${Object.keys(x)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
          .join(',')}}`
      : JSON.stringify(x ?? null);

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

const DAY_MS = 86_400_000;

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
   * kept by name for want of a vault grant is said once for that host, and again only once a grant has been kept.
   */
  once?: { host: string; hosts: string } | undefined;
};

/** Whether the hosts file keeps an unexpired vault grant for this host. */
function grantHeld(hosts: string, host: string, now: number): boolean {
  try {
    const grants: unknown = readHosts(hosts).hosts[host]?.vault;
    return Object.values(isObject(grants) ? grants : {}).some((g) => isObject(g) && typeof g.value === 'string' && g.value !== '' && typeof g.expires === 'string' && Date.parse(g.expires) > now);
  } catch {
    return false;
  }
}

/**
 * Whether to say that keys were kept by name for want of a vault grant, now.
 *
 * ONCE PER HOST, because the start hook runs the scan at every session and the sentence would otherwise be in every
 * briefing. It is remembered in `~/.braindog/tools-said.json`, keyed by host and holding only when it was said, until
 * the hosts file keeps an unexpired vault grant for that host; then it is forgotten, so a grant that lapses later is
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
  const machine = s.machine ?? hostname();
  const now = (s.now ?? Date.now)();

  /* Found in precedence order, so a later one of the same scope and name replaces an earlier one. */
  const found = new Map<string, Found>();
  const keep = (list: Found[]) => list.forEach((f) => found.set(`${f.scope}|${f.name}`, f));
  if (s.top !== null) keep(serversOf(readConfig(join(s.top, '.mcp.json'), join(s.top, '.mcp.json'), lines)?.mcpServers, 'project', '.mcp.json', lines));
  const claude = readConfig(join(s.home, '.claude.json'), '~/.claude.json', lines);
  if (claude !== undefined) {
    keep(serversOf(claude.mcpServers, 'global', '~/.claude.json', lines));
    const here = [s.top, s.cwd].filter((p): p is string => p !== null).map(samePath);
    const mine = Object.entries(isObject(claude.projects) ? claude.projects : {}).find(([path]) => here.includes(samePath(path)))?.[1];
    if (isObject(mine)) keep(serversOf(mine.mcpServers, 'project', '~/.claude.json', lines));
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

  const keysSaid = (n: { deposited: number; would: number }) =>
    n.deposited > 0 ? `, with ${String(n.deposited)} key${n.deposited === 1 ? '' : 's'} deposited` : n.would > 0 ? `, and ${String(n.would)} key${n.would === 1 ? '' : 's'} would be deposited` : '';

  try {
    const projectServers = [...found.values()].filter((f) => f.scope === 'project');
    if (project === null && projectServers.length > 0)
      lines.push(`This folder is in no project in the record, so the ${String(projectServers.length)} server${projectServers.length === 1 ? '' : 's'} of its project config ${projectServers.length === 1 ? 'was' : 'were'} not recorded.`);

    for (const f of found.values()) {
      if (f.scope === 'project' && project === null) continue;
      /* A key belongs where its tool applies, and the door deposits into this run's project. */
      const allow = f.scope === 'project' ? project !== null : project === null;
      const key = `${f.scope}|${f.scope === 'project' ? place : ''}|${f.name}`;
      const names = f.entries.map(needName).sort();
      const shape = sha256(canonical([f.transport, f.command, f.args, f.endpoint, names]));
      if (f.scope === 'global' && project !== null && listed.some((r) => r.scope === 'project' && r.name === f.name)) continue;
      const row = listed.find((r) => r.scope === f.scope && r.name === f.name);

      if (row === undefined) {
        if (reg.truncated) {
          lines.push(`Tool ${f.name} in ${f.source} was not recorded, because the record lists more tools than one context shows.`);
          continue;
        }
        if (f.scope === 'global' && project !== null) {
          /* A run in a project cannot create a row that applies everywhere, so it asks, with names only. */
          if (lock.asked[key] === shape) continue;
          const { needs } = await needsFor(f, [], false);
          if (s.dryRun) {
            lines.push(`Tool ${f.name} in ${f.source} would be proposed as a tool everywhere, with its keys by name only.`);
            continue;
          }
          const out = await s.client.call<{ id: string }>('propose', {
            question: `Record the ${f.name} MCP server from ${f.source} on ${machine} as a tool everywhere?`,
            body_kind: 'rowset',
            body: { register: 'tools', rows: [fieldsOf(f, needs, machine, now)] },
          });
          const made = valueOf(out);
          if (made === null || typeof made.id !== 'string') {
            lines.push(`Tool ${f.name} in ${f.source} was not proposed: ${fixOf(out)}`);
            continue;
          }
          lock.asked[key] = shape;
          lines.push(`Tool ${f.name} in ${f.source} applies everywhere and this run is in a project, so recording it was proposed as ${made.id}, and its keys were not deposited.`);
          continue;
        }
        const n = await needsFor(f, [], allow);
        if (s.dryRun) {
          lines.push(`Tool ${f.name} in ${f.source} would be recorded${keysSaid(n)}.`);
          continue;
        }
        const out = await s.client.create({ register: 'tools', fields: fieldsOf(f, n.needs, machine, now) });
        const spoken = spokenOf(valueOf(out));
        lines.push(spoken === null ? `Tool ${f.name} in ${f.source} was not recorded: ${fixOf(out)}` : `Tool ${f.name} in ${f.source} was recorded as ${spoken}${keysSaid(n)}.`);
        continue;
      }

      const seq = Number(row.spoken.slice(row.spoken.indexOf('#') + 1));
      const got = valueOf(await s.client.get('tools', seq));
      if (!isObject(got) || !isObject(got.fields) || typeof got.version !== 'number') continue;
      const fields = got.fields;
      const prior = strings(fields.needs);
      const same =
        fields.transport === f.transport &&
        (typeof fields.command === 'string' ? fields.command : null) === f.command &&
        canonical(strings(fields.args)) === canonical(f.args) &&
        (typeof fields.endpoint === 'string' ? fields.endpoint : null) === f.endpoint &&
        canonical(prior.map((p) => p.split('=')[0] ?? p).sort()) === canonical(names);

      if (same) {
        const patch: Record<string, unknown> = {};
        const hosts = strings(fields.hosts);
        if (!hosts.includes(machine)) patch.hosts = [...hosts, machine];
        const seen = typeof fields.seen === 'string' ? Date.parse(fields.seen) : Number.NaN;
        if (!(now - seen < DAY_MS)) patch.seen = new Date(now).toISOString();
        const n = await needsFor(f, prior, allow);
        if (n.deposited > 0) patch.needs = n.needs;
        if (n.would > 0) lines.push(`Tool ${f.name} is recorded as ${row.spoken}${keysSaid(n)}.`);
        if (s.dryRun || Object.keys(patch).length === 0) continue;
        const out = await s.client.update({ register: 'tools', seq, patch, version: got.version });
        if (n.deposited > 0) lines.push(valueOf(out) === null ? `Tool ${f.name} could not name its deposited keys on ${row.spoken}: ${fixOf(out)}` : `Tool ${f.name} is recorded as ${row.spoken}${keysSaid(n)}.`);
        continue;
      }

      if (lock.asked[key] === shape) continue;
      const n = await needsFor(f, prior, allow);
      if (s.dryRun) {
        lines.push(`Tool ${f.name} in ${f.source} differs from ${row.spoken}; the row would be left and the change proposed${keysSaid(n)}.`);
        continue;
      }
      const patch = { transport: f.transport, command: f.command, args: f.args, endpoint: f.endpoint, needs: n.needs };
      const out = await s.client.call<{ id: string }>('propose', {
        question: `Change ${row.spoken} to how ${f.name} is set up in ${f.source} on ${machine}?`,
        body_kind: 'rowset',
        body: { register: 'tools', rows: [{ at: row.spoken, version: got.version, patch }] },
      });
      const made = valueOf(out);
      if (made === null || typeof made.id !== 'string') {
        lines.push(`Tool ${f.name} in ${f.source} differs from ${row.spoken}, and the change was not proposed: ${fixOf(out)}`);
        continue;
      }
      lock.asked[key] = shape;
      lines.push(`Tool ${f.name} in ${f.source} differs from ${row.spoken}, so the row was left and the change was proposed as ${made.id}${keysSaid(n)}.`);
    }
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
    lines.push('BrainDog stopped answering part way, so the rest of the tools wait for the next scan.');
  } finally {
    /* The values go out of reach here, whatever happened above. */
    for (const f of found.values()) for (const e of f.entries) e.given = null;
    if (!s.dryRun) writeLock(lockFile, lock);
  }

  const noGrant = [...blocked].some((b) => /vault grant/i.test(b));
  const sayIt = s.once === undefined || s.dryRun ? noGrant : noGrantOnce(s.home, s.once, now, noGrant);
  if (noGrant && sayIt)
    lines.push(`${String(named)} key${named === 1 ? ' was' : 's were'} recorded by name only, because this machine holds no vault grant it could deposit with, and the values were not kept. Run braindog login <host> --vault <project>, then scan again.`);
  for (const b of blocked) if (!/vault grant/i.test(b)) lines.push(b);
  return lines;
}

/** A row's fields for a server: how it starts, the keys it needs by name, and where it was seen. */
function fieldsOf(f: Found, needs: string[], machine: string, now: number): Record<string, unknown> {
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

/* ── write ─────────────────────────────────────────────────────────────── */

/** Run `claude` with these arguments in this folder, and settle with its exit code, or -1 when it did not start. */
export type ClaudeRunner = (args: string[], cwd: string) => Promise<number>;

/**
 * The real one. NO SHELL, so the JSON argument is passed as it is, and its output is not relayed, because
 * `claude mcp remove` may describe the entry it removed, and an entry the scan read can hold a key.
 */
export const runClaude: ClaudeRunner = (args, cwd) =>
  new Promise((done) => {
    const child = spawn('claude', args, { cwd, stdio: 'ignore', shell: false, windowsHide: true });
    child.on('error', () => done(-1));
    child.on('exit', (code) => done(code ?? 1));
  });

const VARIABLE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * A tool row's Claude Code entry, and a sentence for each need it cannot carry.
 *
 * A stdio tool's keys are handed to it by `braindog keys exec`, one wrapper per key, so the entry names the key and
 * never holds it. An env value BrainDog does not keep, and a header that needs a key, are left out and said.
 */
export function renderEntry(name: string, fields: Record<string, unknown>, cli: string): { entry: Record<string, unknown> | null; notes: string[] } {
  const notes: string[] = [];
  const needs = strings(fields.needs);
  if (fields.transport === 'http') {
    if (typeof fields.endpoint !== 'string') return { entry: null, notes };
    for (const need of needs.filter((n) => n.startsWith('header:')))
      notes.push(`Tool ${name}: its ${need.slice(7).split('=')[0] ?? ''} header is left out, because no command here hands a header its key yet.`);
    return { entry: { type: 'http', url: fields.endpoint }, notes };
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
  claude: ClaudeRunner;
};

/** Render every tool, apply the ones in the named scope, and the lines that say what changed or would. */
export async function writeTools(s: ToolWrite): Promise<string[]> {
  const reg = s.context.registers.find((r) => r.id === 'tools');
  if (!reg) return [];
  const lines: string[] = [];
  const lockFile = join(s.home, '.braindog', 'tools-lock.json');
  const lock = toolsLock(lockFile);
  if (lock === null) return [`${lockFile} is not valid JSON, so no tool was written. Delete it and run tools write again.`];
  const configs: Record<'user' | 'project', Record<string, unknown> | undefined> = {
    user: readConfig(join(s.home, '.claude.json'), '~/.claude.json', lines),
    project: s.top === null ? undefined : readConfig(join(s.top, '.mcp.json'), join(s.top, '.mcp.json'), lines),
  };
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
      const json = JSON.stringify(entry);
      const servers = configs[scope]?.mcpServers;
      const existing = isObject(servers) ? servers[name] : undefined;
      const key = `${scope === 'project' ? 'project' : 'global'}|${scope === 'project' ? samePath(s.top ?? s.cwd) : ''}|${name}`;
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
        lines.push(`Tool ${name} at ${scope} scope was changed by hand since BrainDog wrote it, so it is left. Remove it with claude mcp remove ${name} --scope ${scope} to take the record's.`);
        continue;
      }
      lines.push(...notes);
      if (!apply) {
        lines.push(`${action === 'add' ? '+' : '~'} ${name} at ${scope} scope${action === 'replace' ? ', replacing the entry there' : ''}: ${json}`);
        continue;
      }
      const cwd = scope === 'project' && s.top !== null ? s.top : s.cwd;
      if (action === 'replace') {
        const removed = await s.claude(['mcp', 'remove', name, '--scope', scope], cwd);
        if (removed !== 0) {
          lines.push(removed === -1 ? 'claude was not found, so nothing was applied.' : `claude mcp remove did not remove ${name} (exit ${String(removed)}), so it is left.`);
          if (removed === -1) break;
          continue;
        }
      }
      const added = await s.claude(['mcp', 'add-json', name, json, '--scope', scope], cwd);
      if (added === -1) {
        lines.push('claude was not found, so nothing was applied.');
        break;
      }
      if (added !== 0) {
        lines.push(`claude mcp add-json did not add ${name} (exit ${String(added)}), so it is left.`);
        continue;
      }
      lock.written[key] = sha256(canonical(entry));
      applied = true;
      lines.push(`Tool ${name} ${action === 'add' ? 'added' : 'replaced'} at ${scope} scope.`);
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
export async function tools(args: string[], io: AgentIo & { cli: string; claude?: ClaudeRunner }): Promise<number> {
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
    io.out('This record has no tools register, so there is nothing to do.');
    return 0;
  }
  const dryRun = values['dry-run'] === true;
  const base = { client: at.client, context: at.context, top: at.top, cwd: io.cwd, home: io.home, dryRun };
  const lines =
    verb === 'scan'
      ? await scanTools({ ...base, deposit: depositor({ file: hostsPath(io.env), env: io.env, host: at.to.key, headers: await io.headers(at.to.key) }) })
      : await writeTools({ ...base, scope: scope ?? null, cli: io.cli, claude: io.claude ?? runClaude });
  for (const line of lines) io.out(line);
  if (lines.length === 0) io.out(verb === 'scan' ? 'Every server found is recorded as it is.' : 'Every tool is written as the record has it.');
  if (dryRun) io.out('That was a dry run, so nothing was deposited, written, sent or proposed.');
  return 0;
}
