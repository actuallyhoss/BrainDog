/**
 * `braindog env diff [--config-dir <folder>] [--host <host>] [--json]`: how the Claude Code profiles on this machine
 * differ from one another, by the names of their MCP servers, plugins, hook events and skills, with a short hash of
 * each server's entry and of each CLAUDE.md; and, when this machine is signed in, how each differs from the record's
 * tools and skills that apply everywhere.
 *
 * IT CHANGES NOTHING AND ONLY READS. One person runs several profiles on one machine (`~/.claude`, `~/.claude-<name>`
 * and ccenv's), and a server added to one or a plugin turned on in another was found by opening each file by hand. The
 * profiles are the ones `doctor` reads (`profilesIn`). The record is read as `keys list` reads it: each list a page at
 * a time, under the login and with no session headers, so it names no run and opens none. Not signed in, it says so
 * and compares the profiles alone.
 *
 * A PLAN AND A PRINTER, as `doctor` has. `planEnvDiff` reads each profile's files and is handed the home, the profiles
 * and the record's names, so a test plants a home and no real profile or record is read. `printEnvDiff` makes the lines.
 *
 * NAMES AND HASHES, NEVER A VALUE. A server's entry is hashed whole and never printed, so an address, a header or an
 * environment value in it cannot reach a line. A name is said only when no piece of it is shaped like a key
 * (`looksLikeToken`), and any other as a hidden name, numbered for the run.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Client, Page } from '@braindog/client';

import { oneLine } from './clip.ts';
import { ccenvHome, isFolder, profilesIn, shown } from './doctor.ts';
import type { CheckIo } from './env-check.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { looksLikeToken, serversFileOf } from './install.ts';
import { envPins } from './pins.ts';
import { isObject, sha256, Stopped, valueOf } from './skills.ts';
import { canonical } from './tools.ts';

type Env = Record<string, string | undefined>;

/** The four kinds of name a profile is compared by. */
export type Part = 'server' | 'plugin' | 'hook' | 'skill';
const PARTS: readonly Part[] = ['server', 'plugin', 'hook', 'skill'];

/**
 * One profile as read: what the lines call it, where it is, its names of each kind, a short hash of each server's
 * entry by the server's name, and of its CLAUDE.md (`null` when it has none). `unread` names a file that is there and
 * is not a JSON object: `servers` its `.claude.json`, `settings` its `settings.json`.
 */
export type EnvProfile = {
  name: string;
  dir: string;
  servers: Record<string, string>;
  plugins: string[];
  hooks: string[];
  skills: string[];
  claudeMd: string | null;
  unread: ('servers' | 'settings')[];
};

/** Names of one kind that one profile lacks, beside the other profiles or beside the record, or holds beyond it. */
export type Lack = { profile: string; part: Part; names: string[] };

/** A server whose entry is not the same in every profile that holds it, with each of those profiles' hash. */
export type Differs = { server: string; hashes: Record<string, string> };

/** Why the record was not read: no sign-in on this machine, no answer, or a refusal. */
export type Unread = 'signed-out' | 'unreachable' | 'refused';

/** The record's tools and skills that apply everywhere, by name, or why they were not read. */
export type RecordNames = { read: true; tools: string[]; skills: string[] } | { read: false; why: Unread };

/**
 * The plan. `missing` is what each profile lacks that another holds, `differs` each server held with another entry
 * elsewhere, `claudeMd` each profile's hash when they are not all one, and `record` what each profile lacks of the
 * record's names (`lacks`) and holds beyond them (`extra`), with how many of each the record holds.
 */
export type EnvReport = {
  profiles: EnvProfile[];
  missing: Lack[];
  differs: Differs[];
  claudeMd: Record<string, string | null> | null;
  record: { read: true; tools: number; skills: number; lacks: Lack[]; extra: Lack[] } | { read: false; why: Unread };
};

/** Everything the plan is handed: the home, the profiles `profilesIn` found, the record's names, and ccenv's folder. */
export type EnvSeen = { home: string; profiles: string[]; record: RecordNames; ccenv?: string };

/** A short hash: enough to tell two entries apart in a line, and too short to stand for what was hashed. */
export const shortHash = (text: string): string => sha256(text).slice(0, 8);

/** A JSON object read; `null` when there is no such file, and `undefined` when there is one that is not an object. */
function readJson(file: string): Record<string, unknown> | null | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const raw: unknown = JSON.parse(text);
    return isObject(raw) ? raw : undefined;
  } catch {
    /* JSON.parse's message quotes the text around the fault, and a servers file can hold a key there. */
    return undefined;
  }
}

/* A name a line may say: letters, digits, spaces and `@ . _ : + -`, starting with a letter or a digit. */
const SAYABLE = /^[\p{L}\p{N}][\p{L}\p{N} @._:+-]{0,127}$/u;

/**
 * Each name as the lines say it: itself, or `[hidden name <n>]` when a piece of it is shaped like a key or it holds a
 * character `SAYABLE` does not. One name is one hidden name throughout a plan, so it still compares across profiles.
 */
export function namer(): (name: string) => string {
  const hidden = new Map<string, string>();
  return (name) => {
    if (SAYABLE.test(name) && !name.split(/[^\p{L}\p{N}]+/u).some(looksLikeToken)) return name;
    let said = hidden.get(name);
    if (said === undefined) hidden.set(name, (said = `[hidden name ${String(hidden.size + 1)}]`));
    return said;
  };
}

/**
 * What each profile is called in the lines: `default` for `~/.claude`, the rest of `.claude-<name>`, a ccenv profile's
 * own name, or else where it is. Two profiles that would share a name are each called by where they are. `env apply`
 * and `env check` name them the same way, and `--profile` takes these names.
 */
export function labelsOf(dirs: string[], home: string, ccenv: string): string[] {
  const first = dirs.map((dir) => {
    const name = basename(dir);
    const parent = resolve(dirname(dir));
    if (parent === resolve(home) && name === '.claude') return 'default';
    if (parent === resolve(home) && name.startsWith('.claude-') && name !== '.claude-') return name.slice('.claude-'.length);
    if (parent === resolve(ccenv, 'profiles')) return name;
    return shown(dir, home);
  });
  return first.map((label, i) => (first.indexOf(label) === first.lastIndexOf(label) ? label : shown(dirs[i] ?? label, home)));
}

/** The names of one kind a profile holds. */
const held = (p: EnvProfile, part: Part): string[] => (part === 'server' ? Object.keys(p.servers) : part === 'plugin' ? p.plugins : part === 'hook' ? p.hooks : p.skills);

const sorted = (names: string[]): string[] => [...new Set(names)].sort();

/**
 * One profile, read: the servers from the file `install` registers them in (`serversFileOf`, the home's `.claude.json`
 * for the default profile), the plugins its settings turn on, each hook event with a hook, each skill folder, and
 * CLAUDE.md. Every name goes through `say`, and no value is kept but a server entry's hash.
 */
function profileOf(dir: string, name: string, home: string, say: (n: string) => string): EnvProfile {
  const config = readJson(serversFileOf(dir, home));
  const settings = readJson(join(dir, 'settings.json'));
  const unread: EnvProfile['unread'] = [];
  if (config === undefined) unread.push('servers');
  if (settings === undefined) unread.push('settings');
  const servers: Record<string, string> = {};
  const mcp = config?.mcpServers;
  if (isObject(mcp)) for (const [server, entry] of Object.entries(mcp)) servers[say(server)] = shortHash(canonical(entry));
  const on = settings?.enabledPlugins;
  const plugins = isObject(on) ? Object.entries(on).flatMap(([plugin, enabled]) => (enabled === true ? [say(plugin)] : [])) : [];
  const events = settings?.hooks;
  const hooks = isObject(events) ? Object.entries(events).flatMap(([event, list]) => (Array.isArray(list) && list.length > 0 ? [say(event)] : [])) : [];
  let skills: string[] = [];
  try {
    skills = readdirSync(join(dir, 'skills'))
      .filter((skill) => !skill.startsWith('.') && isFolder(join(dir, 'skills', skill)))
      .map(say);
  } catch {
    /* A profile with no skills folder holds no skill. */
  }
  let claudeMd: string | null = null;
  try {
    claudeMd = shortHash(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'));
  } catch {
    /* No CLAUDE.md, which is said as none. */
  }
  const byName = Object.fromEntries(Object.entries(servers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { name, dir: shown(dir, home), servers: byName, plugins: sorted(plugins), hooks: sorted(hooks), skills: sorted(skills), claudeMd, unread };
}

/**
 * THE PLAN: every profile read, then what each lacks beside every name the others hold, each server whose entry is not
 * one entry everywhere, CLAUDE.md when it is not one file everywhere, and when the record was read, what each profile
 * lacks of its tools and skills and holds beyond them. A record tool is an MCP server a profile lists by the same name.
 */
export function planEnvDiff(seen: EnvSeen): EnvReport {
  const say = namer();
  const labels = labelsOf(seen.profiles, seen.home, seen.ccenv ?? join(seen.home, '.ccenv'));
  const profiles = seen.profiles.map((dir, i) => profileOf(dir, labels[i] ?? dir, seen.home, say));
  const lacking = (p: EnvProfile, part: Part, want: string[]): string[] => {
    const has = new Set(held(p, part));
    return sorted(want.filter((n) => !has.has(n)));
  };
  const missing: Lack[] = [];
  for (const part of PARTS) {
    const every = profiles.flatMap((p) => held(p, part));
    for (const p of profiles) {
      const names = lacking(p, part, every);
      if (names.length > 0) missing.push({ profile: p.name, part, names });
    }
  }
  const differs: Differs[] = [];
  for (const server of sorted(profiles.flatMap((p) => Object.keys(p.servers)))) {
    const hashes: Record<string, string> = {};
    for (const p of profiles) {
      const hash = p.servers[server];
      if (hash !== undefined) hashes[p.name] = hash;
    }
    if (new Set(Object.values(hashes)).size > 1) differs.push({ server, hashes });
  }
  const claudeMd = new Set(profiles.map((p) => p.claudeMd)).size > 1 ? Object.fromEntries(profiles.map((p) => [p.name, p.claudeMd])) : null;
  const r = seen.record;
  if (!r.read) return { profiles, missing, differs, claudeMd, record: { read: false, why: r.why } };
  const tools = sorted(r.tools.map(say));
  const skills = sorted(r.skills.map(say));
  const lacks: Lack[] = [];
  const extra: Lack[] = [];
  for (const p of profiles)
    for (const [part, want] of [
      ['server', tools],
      ['skill', skills],
    ] as const) {
      const theirs = new Set(want);
      const short = lacking(p, part, want);
      const more = held(p, part).filter((n) => !theirs.has(n));
      if (short.length > 0) lacks.push({ profile: p.name, part, names: short });
      if (more.length > 0) extra.push({ profile: p.name, part, names: more });
    }
  return { profiles, missing, differs, claudeMd, record: { read: true, tools: tools.length, skills: skills.length, lacks, extra } };
}

/** Whether anything at all differs, which is what the exit code says. */
export const anyDiffers = (r: EnvReport): boolean =>
  r.missing.length > 0 || r.differs.length > 0 || r.claudeMd !== null || (r.record.read && (r.record.lacks.length > 0 || r.record.extra.length > 0));

const count = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

/** Names joined as a sentence says them: `a`, `a and b`, `a, b and c`. */
const and = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`);

const WORDS: Record<Part, [string, string]> = { server: ['server', 'servers'], plugin: ['plugin', 'plugins'], hook: ['hook event', 'hook events'], skill: ['skill', 'skills'] };
const kind = (part: Part, n: number): string => WORDS[part][n === 1 ? 0 : 1];

/** Lacks of one kind and the same names, said once with every profile that has them. */
function grouped(lacks: Lack[]): { profiles: string[]; part: Part; names: string[] }[] {
  const by = new Map<string, { profiles: string[]; part: Part; names: string[] }>();
  for (const l of lacks) {
    const key = `${l.part}\n${l.names.join('\n')}`;
    const had = by.get(key);
    if (had) had.profiles.push(l.profile);
    else by.set(key, { profiles: [l.profile], part: l.part, names: l.names });
  }
  return [...by.values()];
}

/** Each hash with the profiles that hold it, in the profiles' order: `1a2b3c4d in default; 5e6f7a8b in work and lab`. */
function byHash(hashes: Record<string, string | null>): string {
  const by = new Map<string, string[]>();
  for (const [profile, hash] of Object.entries(hashes)) by.set(hash ?? 'none', [...(by.get(hash ?? 'none') ?? []), profile]);
  return [...by].map(([hash, profiles]) => `${hash} in ${and(profiles)}`).join('; ');
}

const UNREAD: Record<Unread, string> = {
  'signed-out': "This machine is not signed in to BrainDog, so the record's tools and skills were not compared.",
  unreachable: "BrainDog did not answer, so the record's tools and skills were not compared.",
  refused: 'BrainDog would not list its tools and skills, so they were not compared.',
};

/**
 * The plan as lines: each profile with how many names of each kind it holds and its CLAUDE.md's hash, then what each
 * lacks beside the others, then what is not the same everywhere, then the record, then how many lines differ. Profiles
 * that lack the same names are one line. Every line is fixed words, names and hashes.
 */
export function printEnvDiff(report: EnvReport): string[] {
  const lines = [`braindog env diff read ${count(report.profiles.length, 'profile', 'profiles')}, and changed nothing.`];
  for (const p of report.profiles) {
    const unread = p.unread.map((u) => (u === 'servers' ? ' Its servers file could not be read.' : ' Its settings could not be read.')).join('');
    const counts = PARTS.map((part) => count(held(p, part).length, ...WORDS[part]));
    lines.push(`${oneLine(p.name)}, ${oneLine(p.dir)}: ${counts.join(', ')}, CLAUDE.md ${p.claudeMd ?? 'none'}.${unread}`);
  }
  let n = 0;
  const under = (heading: string, said: string[]) => {
    if (said.length === 0) return;
    n += said.length;
    lines.push(heading, ...said.map((line) => `  ${line}`));
  };
  const lack = (g: { profiles: string[] }) => `${and(g.profiles)} ${g.profiles.length === 1 ? 'lacks' : 'lack'}`;
  under(
    'Missing beside the other profiles:',
    grouped(report.missing).map((g) => `${lack(g)} the ${kind(g.part, g.names.length)} ${g.names.join(', ')}.`),
  );
  under('Not the same in every profile:', [...report.differs.map((d) => `server ${d.server}: ${byHash(d.hashes)}.`), ...(report.claudeMd === null ? [] : [`CLAUDE.md: ${byHash(report.claudeMd)}.`])]);
  const r = report.record;
  if (!r.read) lines.push(UNREAD[r.why]);
  else {
    const before = n;
    under(`Against the record's ${count(r.tools, 'tool', 'tools')} and ${count(r.skills, 'skill', 'skills')} that apply everywhere:`, [
      ...grouped(r.lacks).map((g) => `${lack(g)} the ${g.part === 'server' ? (g.names.length === 1 ? 'tool' : 'tools') : kind(g.part, g.names.length)} ${g.names.join(', ')}.`),
      ...grouped(r.extra).map((g) => `${and(g.profiles)} ${g.profiles.length === 1 ? 'holds' : 'hold'} ${g.names.length === 1 ? `a ${kind(g.part, 1)}` : kind(g.part, g.names.length)} the record does not: ${g.names.join(', ')}.`),
    ]);
    if (n === before && report.profiles.length > 0) lines.push(`Every profile holds the record's ${count(r.tools, 'tool', 'tools')} and ${count(r.skills, 'skill', 'skills')}, and nothing beyond them.`);
  }
  lines.push(n === 0 ? 'Nothing differs.' : n === 1 ? 'One difference, by name and hash only.' : `${String(n)} differences, by name and hash only.`);
  return lines;
}

/** How many rows one read of a list asks for, as `keys list` and `skills sync` ask. */
const PAGE = 50;
/** The most pages one list is read for, so a cursor that never ends cannot hold the command. */
const PAGES = 40;

/** What makes the client the record is read with: `clientFor`, or a test's own. */
export type MakeClient = (to: Target, headers: () => Promise<Record<string, string>>, signal: AbortSignal) => Pick<Client, 'list'>;

/** One row of a list as a whole read hands it: its id (what a ref to it holds), its spoken id, and its fields. */
export type ListRow = { id: string | null; spoken: string; fields: Record<string, unknown> };

/**
 * Every row of one of the record's lists that is not retired, read whole a page at a time as `skills sync` reads the
 * skills `context` cut short; `null` when the record refuses. Throws `Stopped` when it does not answer.
 */
export async function rowsOf(client: Pick<Client, 'list'>, register: string): Promise<ListRow[] | null> {
  const rows: ListRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES; page++) {
    const value: Page<unknown> | null = valueOf(await client.list({ register, limit: PAGE, ...(cursor === null ? {} : { cursor }) }));
    if (value === null) return null;
    for (const r of value.rows) {
      if (!isObject(r) || !isObject(r.fields) || r.state === 'retired') continue;
      rows.push({ id: typeof r.id === 'string' ? r.id : null, spoken: typeof r.seq === 'number' ? `${register}#${String(r.seq)}` : '', fields: r.fields });
    }
    cursor = typeof value.cursor === 'string' && value.cursor !== '' ? value.cursor : null;
    if (cursor === null) break;
  }
  return rows;
}

/**
 * The names in one of the record's lists that apply everywhere and are not retired, read whole (`rowsOf`); `null`
 * when the record refuses. A project's row is left out.
 */
async function everywhere(client: Pick<Client, 'list'>, register: string, takes: (fields: Record<string, unknown>) => boolean): Promise<string[] | null> {
  const rows = await rowsOf(client, register);
  if (rows === null) return null;
  const names = new Set<string>();
  for (const { fields } of rows) {
    const { name, project } = fields;
    if (typeof name === 'string' && (project === undefined || project === null || project === '') && takes(fields)) names.add(name);
  }
  return [...names].sort();
}

/**
 * The list that plays a role for the record's agents (`role: profiles` on its declaration, `AGENT_ROLES`), by its id
 * and the field its rows are named by, read off every list's declaration in one `schemas` read; `null` when no list
 * declares the role, and when the record will not say, which an older record without the read or the role is.
 * Throws `Stopped` when it does not answer.
 */
export async function listPlaying(client: Pick<Client, 'call'>, role: string): Promise<{ id: string; title: string } | null> {
  const value = valueOf(await client.call<{ lists?: unknown }>('schemas', { every: true }));
  const lists = isObject(value) && isObject(value.lists) ? value.lists : {};
  for (const [id, decl] of Object.entries(lists)) if (isObject(decl) && decl.role === role) return { id, title: typeof decl.title === 'string' && decl.title !== '' ? decl.title : 'name' };
  return null;
}

/**
 * The record's MCP tools and skills that apply everywhere, by name: what `tools write` and `skills sync` put in a
 * profile. Read under the login with no session headers, so it names no run and opens none, and only when this machine
 * holds a login. `tools: false` reads the skills alone.
 */
export async function recordNames(host: string | undefined, env: Env, o: { tools?: boolean; make?: MakeClient } = {}): Promise<RecordNames> {
  let to: Target;
  try {
    to = target(host, env, hostsPath(env));
  } catch {
    /* No host named anywhere, or a login that ran out: either way nothing is signed in here. */
    return { read: false, why: 'signed-out' };
  }
  if (to.token === undefined) return { read: false, why: 'signed-out' };
  const client = (o.make ?? clientFor)(to, async () => ({}), AbortSignal.timeout(budgetOf(env) * 3));
  try {
    /* A tool with no kind is an MCP server, as `tools write` reads one; a command goes to `commands/`, not `skills/`. */
    const tools = o.tools === false ? [] : await everywhere(client, 'tools', (f) => f.kind === undefined || f.kind === 'mcp');
    if (tools === null) return { read: false, why: 'refused' };
    const skills = await everywhere(client, 'skills', (f) => f.kind !== 'command');
    return skills === null ? { read: false, why: 'refused' } : { read: true, tools, skills };
  } catch (e) {
    if (e instanceof Stopped) return { read: false, why: 'unreachable' };
    throw e;
  }
}

/** What the verb reads beyond its arguments, each a test's to hand in: no real home, environment or record then. */
export type EnvIo = { home?: string; env?: Env; record?: (host: string | undefined) => Promise<RecordNames> };

/**
 * `braindog env diff`: its arguments read, the record asked and the plan made and printed. THROWS ONE SENTENCE for an
 * argument it does not take, before anything is read. `code` is 1 when anything differs, as `doctor`'s is when
 * anything is listed, so a script can tell without reading the lines.
 */
export async function envDiff(args: string[], io: EnvIo = {}): Promise<{ lines: string[]; report: EnvReport; json: boolean; code: 0 | 1 }> {
  let values: { 'config-dir'?: string[] | undefined; host?: string | undefined; json?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, options: { 'config-dir': { type: 'string', multiple: true }, host: { type: 'string' }, json: { type: 'boolean' } }, strict: true }));
  } catch {
    throw new Error('braindog env diff takes --config-dir <folder>, --host <host> and --json, and nothing else.');
  }
  const home = io.home ?? homedir();
  const env = io.env ?? process.env;
  const record = await (io.record ?? ((host: string | undefined) => recordNames(host, env)))(values.host);
  const report = planEnvDiff({ home, profiles: profilesIn(home, values['config-dir'] ?? [], env), record, ccenv: ccenvHome(home, env) });
  return { lines: printEnvDiff(report), report, json: values.json === true, code: anyDiffers(report) ? 1 : 0 };
}

/**
 * `braindog env diff|pins|check`, each a plan and its lines: `apply` asks at a terminal as it goes, so `main.ts`
 * dispatches it on its own (`env-apply.ts`).
 */
export async function envCommand(args: string[], io: EnvIo & { check?: CheckIo } = {}): Promise<{ lines: string[]; report: unknown; json: boolean; code: 0 | 1 }> {
  const [verb, ...rest] = args;
  if (verb === 'diff') return envDiff(rest, io);
  if (verb === 'pins') return envPins(rest, { home: io.home ?? homedir() });
  /* LOADED WHEN ASKED, because it reads this file's names and this file would otherwise read it. */
  if (verb === 'check') return (await import('./env-check.ts')).envCheck(rest, { home: io.home ?? homedir(), env: io.env ?? process.env, ...io.check });
  throw new Error('braindog env takes diff, apply, pins or check, as in braindog env diff.');
}
