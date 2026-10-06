/**
 * The people in the work as git shows them: who an author is by key, which authors are machines, the owner's own keys,
 * and `meet` as the record takes it. Used by the end hook (`harvest` in `hooks.ts`) for one session's commits, and by
 * `braindog people harvest` for the whole history of the repositories the record's projects list.
 *
 * AN AUTHOR IS THEIR KEYS, NEVER THEIR NAME. `email:` lower-cased, with dots and `+tags` folded for Gmail only, and
 * `github:` for GitHub's private address, as `loop/contract-17.md` writes them. Two identities sharing a key are one
 * author here; anything weaker (the same name, a login that looks like a local part) is the record's to judge, because
 * its strong rules and its questions keep the evidence and this command keeps nothing.
 *
 * NOBODY TO MEET: a bot, a CI or machine user, and the owner. The owner's keys are read once from the self row of the
 * list People keeps, with this machine's `git config user.email` beside them, so his own commits are never met however
 * many addresses he commits under.
 *
 * `meet` IS SENT IN THE CONTRACT'S SHAPE (`keys`, `kind`, `source`) and, when a record older than that refuses one of
 * those by name, once more in the shape it takes (`name`, `email`, `handle`, `where`), and in that shape for the rest of
 * the run.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import type { Client } from '@braindog/client';
import { refused, type Result } from '@braindog/ports';

import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { git, normaliseRemote, sessionHeaders, type Position } from './position.ts';
import { isObject, type AgentIo } from './skills.ts';

/* ── keys ──────────────────────────────────────────────────────────────── */

/** Mail domains anybody can sign up at, which say nothing about whom a person works for. */
export const PUBLIC_MAIL: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'yahoo.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'yandex.com',
  'mail.com',
]);

/* GitHub's private address names an account and reaches nobody, so it is the account's key. */
const GITHUB_PRIVATE = /^(?:[0-9]+\+)?([^@\s]+)@users\.noreply\.github\.com$/;

/** An address as a key, `email:ada@example.com`, or `github:ada` for GitHub's private one; `null` for no address. */
export function keyOfAddress(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1 || /\s/.test(email)) return null;
  const account = GITHUB_PRIVATE.exec(email)?.[1];
  if (account !== undefined) return `github:${account}`;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\+.*$/, '').replaceAll('.', '');
  return `email:${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}

/** Every key a value a row or a person holds could be: an address, a `kind:value` key, or a `provider:name` handle. */
export function keyOfAny(raw: string): string | null {
  const text = raw.trim();
  if (text.includes('@') && !text.startsWith('@')) {
    const colon = text.indexOf(':');
    /* `email:ada@example.com` is already a key; its address is folded as any other. */
    return keyOfAddress(colon > 0 && colon < text.indexOf('@') ? text.slice(colon + 1) : text);
  }
  const m = /^([a-z][a-z0-9.-]*):@?(\S+)$/i.exec(text);
  return m ? `${m[1]!.toLowerCase()}:${m[2]!.toLowerCase()}` : null;
}

/** Names a machine goes by when nobody set one, and the bots that sign commits. */
const MACHINE_NAMES = /^(?:ubuntu|root|runner|github-actions|dependabot|ec2-user|admin|administrator|jenkins)$/i;

/**
 * Whether an author is a machine and not a person: a `[bot]`, a no-reply sender, GitHub Actions or Dependabot, a CI
 * user named for what it does ("Jenkins Schema Sync", "Brightloom Repos") at an organisation's domain, a machine's
 * default user (`Ubuntu`, `root`, `runner`), or an address at a machine's own name rather than a domain.
 */
export function isMachine(name: string, address: string): boolean {
  const n = name.trim();
  const email = address.trim().toLowerCase();
  const local = email.split('@')[0] ?? '';
  const domain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : '';
  if (/\[bot\]$/i.test(n) || /\[bot\]$/.test(local) || /^no-?reply$/.test(local)) return true;
  if (/github-actions|dependabot/i.test(n) || /github-actions|dependabot/.test(local)) return true;
  if (MACHINE_NAMES.test(n) || MACHINE_NAMES.test(local)) return true;
  if (/(?:^|\s)(?:sync|repos)$/i.test(n) && domain !== '' && !PUBLIC_MAIL.has(domain)) return true;
  return domain !== '' && (!domain.includes('.') || /\.(?:local|localdomain|internal|lan)$/.test(domain));
}

/* ── authors ───────────────────────────────────────────────────────────── */

/** The `git log` format every reader here asks for: name, address, full commit, author date. */
export const LOG_FORMAT = '--format=%an%x1f%ae%x1f%H%x1f%aI';

/** One commit's author as `git log` gave it, with the key they are known by. */
export type Authored = { name: string; email: string; key: string; commit: string; at: string };

/**
 * The authors of a log in `LOG_FORMAT`, newest first, with the machines, the owner's keys and anybody with no address
 * left out. Each commit is one entry: grouping is the caller's.
 */
export function authoredIn(log: string, own: ReadonlySet<string>): Authored[] {
  const out: Authored[] = [];
  for (const line of log.split('\n')) {
    const [name = '', email = '', commit = '', at = ''] = line.split('\x1f').map((s) => s.trim());
    if (!commit) continue;
    const key = keyOfAddress(email);
    if (key === null || isMachine(name, email) || own.has(key)) continue;
    out.push({ name, email: email.toLowerCase(), key, commit, at });
  }
  return out;
}

/** An author as `meet` is told about them: the name, one address or handle, and every key. */
export type Meeting = { name?: string; email?: string; handle?: string; keys: string[]; kind?: 'person' | 'organisation'; source: string };

/** One author's first commit seen, as a meeting. A key that is a handle goes as the handle, an address as the email. */
export function meetingOf(a: Authored, repo: string): Meeting {
  const handle = a.key.startsWith('email:') ? undefined : a.key;
  return {
    ...(a.name ? { name: a.name } : {}),
    ...(handle === undefined ? { email: a.email } : { handle }),
    keys: [a.key],
    kind: 'person',
    source: `commit ${a.commit.slice(0, 7)} in ${repo}`,
  };
}

/* ── the owner ─────────────────────────────────────────────────────────── */

/** The list `meet` writes on a record whose People declares no other. */
export const PEOPLE_LIST = 'people';

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);

/** What one person row says identifies them: its address, its keys and its handles, each as a key. */
export function keysOfRow(fields: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const v of [...strings(fields.email), ...strings(fields.keys), ...strings(fields.handles)]) {
    const key = keyOfAny(v);
    if (key !== null) out.add(key);
  }
  return [...out];
}

/** The names one person row goes by: its name and its aliases, as two mentions compare them. */
export function namesOfRow(fields: Record<string, unknown>): string[] {
  return [...strings(fields.name), ...strings(fields.aliases)].map(sameName).filter((n) => n !== '');
}

/** A name as two mentions of one person share it: trimmed, spaces collapsed, lower case. */
export const sameName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The self rows of People: the owner's own, whichever list declares it, read once. */
export type Self = { id: string; seq: number | null; version: number; fields: Record<string, unknown> };

/**
 * The rows of People marked as the record's own person (`self`), or none when the list has no such field, the caller
 * cannot read it, or the host does not answer. Never a guess by name.
 */
export async function selfRows(list: Client['list']): Promise<Self[]> {
  try {
    const got = await list({ register: PEOPLE_LIST, where: { field: 'self', is: true }, limit: 5 });
    if (!got.ok) return [];
    return got.value.rows.filter(isObject).flatMap((r) =>
      typeof r.id === 'string' && isObject(r.fields) && r.fields.self === true
        ? [{ id: r.id, seq: typeof r.seq === 'number' ? r.seq : null, version: typeof r.version === 'number' ? r.version : 0, fields: r.fields }]
        : [],
    );
  } catch {
    return [];
  }
}

/**
 * Every key the owner commits under: the self row's, and the address git signs with in each repository named.
 * Read once per run, so a session's end costs one read for however many authors it met.
 */
export async function ownKeys(list: Client['list'] | null, dirs: readonly string[]): Promise<Set<string>> {
  const [rows, ...configured] = await Promise.all([list === null ? [] : selfRows(list), ...dirs.map((d) => git(d, 'config', 'user.email'))]);
  const out = new Set(rows.flatMap((r) => keysOfRow(r.fields)));
  for (const email of configured) {
    const key = email === null ? null : keyOfAddress(email);
    if (key !== null) out.add(key);
  }
  return out;
}

/* ── meet ──────────────────────────────────────────────────────────────── */

/** The call `meet` is, with whatever arguments the record takes. */
export type MeetCall = (args: Record<string, unknown>) => Promise<Result<unknown>>;

/* What a record older than the contract does not take, and refuses by name. */
const NEWER = new Set(['keys', 'kind', 'source', 'org', 'domain', 'role']);

/**
 * `meet` as the record takes it: in the contract's shape first, and when that is refused for an argument the record
 * does not know, once more as the four it has always taken, and that way from then on. A refusal of anything else is
 * the answer.
 *
 * NEVER AN ORGANISATION IN THE OLD SHAPE. The four say nothing of kind, so an organisation sent in them is met as a
 * person, and a record that refuses an organisation's `keys` because its list keeps none would get a person row named
 * for a company. Its refusal is the answer.
 */
export function meeter(call: MeetCall): (m: Meeting) => Promise<Result<unknown>> {
  let legacy = false;
  const old = (m: Meeting) => ({ ...(m.name ? { name: m.name } : {}), ...(m.email ? { email: m.email } : {}), ...(m.handle ? { handle: m.handle } : {}), where: m.source });
  return async (m) => {
    const person = m.kind !== 'organisation';
    if (legacy && person) return call(old(m));
    const out = await call({ ...old(m), keys: m.keys, ...(m.kind ? { kind: m.kind } : {}), source: m.source });
    if (person && refused(out) && out.refusal.code === 'FIELD_UNKNOWN' && typeof out.refusal.at === 'string' && NEWER.has(out.refusal.at)) {
      legacy = true;
      return call(old(m));
    }
    return out;
  };
}

/**
 * What a `meet` answered, read loosely: the row it names and the list it is in when the answer says, whether it made
 * one, and whether it only kept a mention.
 */
export type MetRow = { register: string | null; id: string | null; seq: number | null; created: boolean; mention: boolean };

/**
 * The row a meet landed on, whichever shape the record answers in: the contract's `row: { id, seq }`, or the older
 * `person: 'people#3'`. `null` when it names none.
 */
export function metOf(value: unknown): MetRow | null {
  if (!isObject(value)) return null;
  const created = value.created === true;
  const mention = value.mention === true;
  if (isObject(value.row) && (typeof value.row.id === 'string' || typeof value.row.seq === 'number'))
    return {
      register: typeof value.row.register === 'string' ? value.row.register : null,
      id: typeof value.row.id === 'string' ? value.row.id : null,
      seq: typeof value.row.seq === 'number' ? value.row.seq : null,
      created,
      mention,
    };
  if (isObject(value.person) && typeof value.person.id === 'string')
    return { register: null, id: value.person.id, seq: typeof value.person.seq === 'number' ? value.person.seq : null, created, mention };
  const said = typeof value.person === 'string' ? /(?:^([a-z][a-z0-9_-]*))?#([1-9][0-9]*)$/.exec(value.person) : null;
  if (said) return { register: said[1] ?? null, id: null, seq: Number(said[2]), created, mention };
  return mention ? { register: null, id: null, seq: null, created: false, mention } : null;
}

/* ── repositories ──────────────────────────────────────────────────────── */

/* Folders never searched for a repository: a dependency tree, the Mac's own, and anything hidden. */
const SKIP = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'vendor', 'dist', 'build']);

/** The most repositories one search names, so a session started in a home folder stays cheap. */
export const CHILD_REPOS_MOST = 64;

/**
 * The git repositories in a folder that is not one, up to two levels down, by their folder relative to it. A repository
 * is not searched inside: its submodules and nested checkouts are its own business.
 */
export function childRepos(top: string, depth = 2): string[] {
  const out: string[] = [];
  const walk = (dir: string, left: number) => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= CHILD_REPOS_MOST) return;
      if (name.startsWith('.') || SKIP.has(name)) continue;
      const path = join(dir, name);
      try {
        if (!statSync(path).isDirectory()) continue;
      } catch {
        continue;
      }
      if (existsSync(join(path, '.git'))) out.push(relative(top, path).split(sep).join('/'));
      else if (left > 1) walk(path, left - 1);
    }
  };
  walk(resolve(top), depth);
  return out;
}

/** Each child repository's HEAD, by its folder relative to `top`: what the start hook keeps and the end hook compares. */
export async function childHeads(top: string): Promise<Record<string, string>> {
  const repos = childRepos(top);
  const heads = await Promise.all(repos.map((rel) => git(join(top, rel), 'rev-parse', 'HEAD')));
  const out: Record<string, string> = {};
  repos.forEach((rel, i) => {
    const head = heads[i];
    if (head && /^[0-9a-f]{40,64}$/.test(head)) out[rel] = head;
  });
  return out;
}

/* ── braindog people harvest ───────────────────────────────────────────── */

const USAGE = 'braindog people harvest takes [--since <day>] [--dry-run] [--host <host>], as in braindog people harvest --since 2026-01-01 --dry-run.';

/** A project as this command reads it: its name, and the repositories and folders it lists. */
export type Project = { name: string; repos: string[]; folders: string[] };

/** A repository on this machine: where it is, its name, and its remote as `host/owner/name`. */
export type LocalRepo = { dir: string; name: string; remote: string | null };

/** A remote as `host/owner/name`, lower case, whether a project lists it as a URL, `git@host:a/b` or bare. */
export function remoteKey(said: string): string {
  let s = said.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(s);
  if (scheme) s = s.slice(scheme[0].length);
  s = s.replace(/^[^@/]*@/, '');
  let [host = '', ...rest] = s.split('/');
  const colon = host.indexOf(':');
  if (colon >= 0) {
    if (!scheme) rest = [host.slice(colon + 1), ...rest];
    host = host.slice(0, colon);
  }
  return [host, ...rest].filter((part) => part !== '').join('/').toLowerCase();
}

const lastName = (said: string): string =>
  (
    said
      .trim()
      .replace(/[\\/]+$/u, '')
      .replace(/\.git$/iu, '')
      .split(/[\\/:]+/u)
      .filter((p) => p !== '')
      .at(-1) ?? ''
  ).toLowerCase();

const pathKey = (p: string): string => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * Which project a local repository belongs to: its remote listed, then a folder it is in, then its name when exactly one
 * project lists a place of that name. `null` when none does, or two do at the same rung.
 */
export function projectOf(projects: readonly Project[], repo: LocalRepo): Project | null {
  const one = (hits: Project[]) => (hits.length === 1 ? hits[0]! : null);
  if (repo.remote !== null) {
    const hits = projects.filter((p) => p.repos.some((r) => remoteKey(r) === remoteKey(repo.remote!)));
    if (hits.length > 0) return one(hits);
  }
  const dir = pathKey(repo.dir);
  const under = projects.filter((p) => p.folders.some((f) => dir === pathKey(f) || dir.startsWith(`${pathKey(f)}/`)));
  if (under.length > 0) return one(under);
  const name = repo.name.toLowerCase();
  return one(projects.filter((p) => [...p.repos, ...p.folders].some((place) => lastName(place) === name)));
}

/** One author across every repository read: the names they signed with, their keys, and where and when. */
export type Cluster = {
  names: Map<string, number>;
  keys: Set<string>;
  emails: Set<string>;
  commits: number;
  /** The newest commit in each repository, by repository name, for the source line. */
  newest: Map<string, string>;
  /** Commits by project name, `''` for none. */
  projects: Map<string, number>;
  last: string;
};

/** The authors of several repositories grouped by key: two identities sharing an address or an account are one. */
export function clustersOf(read: readonly { repo: LocalRepo; project: Project | null; authored: Authored[] }[]): Cluster[] {
  const byKey = new Map<string, Cluster>();
  const all: Cluster[] = [];
  for (const { repo, project, authored } of read)
    for (const a of authored) {
      let c = byKey.get(a.key);
      if (c === undefined) {
        c = { names: new Map(), keys: new Set([a.key]), emails: new Set(), commits: 0, newest: new Map(), projects: new Map(), last: '' };
        byKey.set(a.key, c);
        all.push(c);
      }
      if (a.name) c.names.set(a.name, (c.names.get(a.name) ?? 0) + 1);
      if (a.key.startsWith('email:')) c.emails.add(a.email);
      c.commits++;
      if (!c.newest.has(repo.name)) c.newest.set(repo.name, a.commit);
      const p = project?.name ?? '';
      c.projects.set(p, (c.projects.get(p) ?? 0) + 1);
      if (a.at > c.last) c.last = a.at;
    }
  return all.sort((a, b) => b.commits - a.commits || nameOf(a).localeCompare(nameOf(b)));
}

/** The name a cluster is said by: the one it signed with most, the fuller of two as often, its first address when it signed with none. */
export const nameOf = (c: Cluster): string =>
  [...c.names.entries()].sort((a, b) => b[1] - a[1] || words(b[0]) - words(a[0]) || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0]?.[0] ??
  [...c.emails][0] ??
  [...c.keys][0] ??
  'someone';
const words = (name: string) => name.trim().split(/\s+/).length;

const plural = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`;
const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);

/** One cluster as the dry run says it, and the addresses under it. */
export function clusterLines(c: Cluster): string[] {
  const names = [...c.names.keys()].filter((n) => n !== nameOf(c));
  const where = [...c.projects.keys()].filter((p) => p !== '');
  const repos = [...c.newest.keys()];
  const head = `${nameOf(c)}${names.length > 0 ? ` (also ${and(names)})` : ''}: ${plural(c.commits, 'commit')} in ${and(repos)}${where.length > 0 ? `, ${and(where)}` : ''}`;
  const keys = [...c.keys].map((k) => (k.startsWith('email:') ? k.slice('email:'.length) : k.replace(/^github:/, 'GitHub ')));
  return [head, `  ${keys.join(', ')}`];
}

/** The project list: the one list declaring `scopes:`, its rows read to the end, or `null` when the record has none. */
async function readProjects(client: Client): Promise<Project[] | null> {
  const boot = await client.boot();
  if (!boot.ok) {
    if (refused(boot) && boot.refusal.code === 'UNREACHABLE') throw new Error('unreachable');
    return null;
  }
  const decls = await Promise.all(boot.value.registers.map((r) => client.schema(r.id)));
  const home = decls.map((d) => (d.ok && isObject(d.value) ? d.value : null)).find((d) => d !== null && isObject(d.scopes));
  if (!home || typeof home.id !== 'string' || !isObject(home.scopes)) return null;
  const { repos, folders } = home.scopes as { repos?: string; folders?: string };
  const title = typeof home.title === 'string' ? home.title : 'name';
  const out: Project[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const got: Result<{ rows: unknown[]; cursor: string | null }> = await client.list({ register: home.id, limit: 200, ...(cursor ? { cursor } : {}) });
    if (!got.ok) return null;
    for (const r of got.value.rows)
      if (isObject(r) && isObject(r.fields)) {
        const f = r.fields;
        out.push({ name: typeof f[title] === 'string' ? f[title] : 'a project', repos: repos ? strings(f[repos]) : [], folders: folders ? strings(f[folders]) : [] });
      }
    cursor = got.value.cursor;
    if (!cursor) break;
  }
  return out;
}

/** A repository on this machine by its folder, or `null` when the folder is not one. */
async function localRepo(dir: string): Promise<LocalRepo | null> {
  const top = await git(dir, 'rev-parse', '--show-toplevel');
  if (top === null) return null;
  const origin = await git(top, 'remote', 'get-url', 'origin');
  return { dir: resolve(top), name: basename(resolve(top)), remote: origin === null ? null : normaliseRemote(origin) };
}

/** The headers one project's run sends: a client id of its own, and the place of one of its repositories. */
function runHeaders(at: LocalRepo, host: string, client: string): Record<string, string> {
  const where: Position = { cwd: at.dir, repo: at.name, remote: at.remote, host, branch: null, head: null };
  return sessionHeaders(where, 'other', { client_id: client });
}

/** At most this many meets in flight at once, for one project's run. */
const MEETS_AT_ONCE = 4;

/**
 * `braindog people harvest [--since <day>] [--dry-run] [--host <host>]`: everybody who committed to the repositories the
 * record's projects list, found on this machine, and to the repositories in and under this folder, met with the project
 * each worked in. The exit code: 0 done, 1 refused or a local error, 3 unreachable.
 *
 * ONE RUN PER PROJECT, EACH OF ITS OWN. A meet links a person to the project of the run it is made in, so each project's
 * meets go as a run placed there by one of its repositories, and that run is ended `done` once its last meet answers.
 * Authors in a repository no project lists are met with no project. Nothing is sent with `--dry-run`, which prints the
 * people it would meet, grouped by key, with every address each signed with.
 */
export async function peopleCommand(args: string[], io: AgentIo): Promise<number> {
  let parsed: { values: { since?: string | undefined; 'dry-run'?: boolean | undefined; host?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { since: { type: 'string' }, 'dry-run': { type: 'boolean' }, host: { type: 'string' } } });
  } catch {
    io.say(USAGE);
    return 1;
  }
  const { since, host } = parsed.values;
  const dryRun = parsed.values['dry-run'] === true;
  if (parsed.positionals.length !== 1 || parsed.positionals[0] !== 'harvest' || (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since))) {
    io.say(USAGE);
    return 1;
  }

  let to: Target;
  try {
    to = target(host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const folder = await io.headers(to.key);
  const machine = folder['x-braindog-host'] ?? 'this-machine';
  const ms = budgetOf(io.env);
  const reader = clientFor(to, async () => ({ ...(folder['x-braindog-host'] === undefined ? {} : { 'x-braindog-host': machine }) }), AbortSignal.timeout(ms * 20));
  let projects: Project[];
  try {
    projects = (await readProjects(reader)) ?? [];
  } catch {
    io.say(`${to.key} did not answer.`);
    return 3;
  }

  /* THE REPOSITORIES: this folder's own, those under it, and each folder a project lists that is one on this machine. */
  const dirs = new Set<string>();
  const here = await localRepo(io.cwd);
  if (here !== null) dirs.add(here.dir);
  else for (const rel of childRepos(io.cwd)) dirs.add(resolve(io.cwd, rel));
  for (const p of projects) for (const f of p.folders) if (existsSync(join(f, '.git'))) dirs.add(resolve(f));
  const repos = (await Promise.all([...dirs].map(localRepo))).filter((r): r is LocalRepo => r !== null);
  const unique = [...new Map(repos.map((r) => [r.dir, r])).values()];
  if (unique.length === 0) {
    io.out('No repository was found here or in the folders your projects list, so nobody was met.');
    return 0;
  }

  const own = await ownKeys(reader.list, unique.map((r) => r.dir));
  const read = await Promise.all(
    unique.map(async (repo) => {
      const log = await git(repo.dir, 'log', LOG_FORMAT, ...(since === undefined ? [] : [`--since=${since}`]));
      return { repo, project: projectOf(projects, repo), authored: log === null ? [] : authoredIn(log, own) };
    }),
  );
  const clusters = clustersOf(read);
  if (clusters.length === 0) {
    io.out(`Nobody but you${since === undefined ? '' : ` since ${since}`} committed to ${plural(unique.length, 'repository', 'repositories')}, so nobody was met.`);
    return 0;
  }

  if (dryRun) {
    io.out(`${plural(clusters.length, 'person', 'people')} committed to ${plural(unique.length, 'repository', 'repositories')}${since === undefined ? '' : ` since ${since}`}. Nothing was sent:`);
    for (const c of clusters) for (const line of clusterLines(c)) io.out(line);
    return 0;
  }

  /* ONE RUN A PROJECT, and one for the repositories no project lists. */
  const groups = new Map<string, { repo: LocalRepo; repos: Set<string> }>();
  for (const { repo, project } of read) {
    const name = project?.name ?? '';
    const g = groups.get(name) ?? { repo, repos: new Set<string>() };
    g.repos.add(repo.name);
    groups.set(name, g);
  }
  const stamp = crypto.randomUUID();
  /** What each person's first meet answered, so somebody met in two projects is counted once. */
  const outcome = new Map<Cluster, 'new' | 'known' | 'noted'>();
  const refusedLines: string[] = [];
  let i = 0;
  for (const [project, g] of groups) {
    const id = `braindog-people-${stamp}-${String(i++)}`;
    const client = clientFor(to, async () => runHeaders(g.repo, machine, id), AbortSignal.timeout(ms * 20));
    const meet = meeter((a) => client.call('meet', a));
    let sent = 0;
    let stop: string | null = null;
    const queue = clusters.filter((c) => (c.projects.get(project) ?? 0) > 0);
    const worker = async () => {
      for (let c = queue.shift(); c !== undefined && stop === null; c = queue.shift()) {
        const repo = [...c.newest.keys()].find((r) => g.repos.has(r)) ?? [...c.newest.keys()][0]!;
        const keys = [...c.keys];
        const email = [...c.emails][0];
        const handle = keys.find((k) => !k.startsWith('email:'));
        const out = await meet({
          name: nameOf(c),
          ...(email === undefined ? { ...(handle === undefined ? {} : { handle }) } : { email }),
          keys,
          kind: 'person',
          source: `commit ${c.newest.get(repo)!.slice(0, 7)} in ${repo}`,
        });
        if (!out.ok) {
          if (refused(out) && out.refusal.code === 'UNREACHABLE') stop = `${to.key} stopped answering part way. Run it again: people already met are found and not added twice.`;
          else if (refused(out) && out.refusal.code !== 'VALUE_MALFORMED') stop = out.refusal.fix;
          continue;
        }
        sent++;
        const m = metOf(out.value);
        if (!outcome.has(c)) outcome.set(c, m?.mention ? 'noted' : m?.created ? 'new' : 'known');
      }
    };
    await Promise.all(Array.from({ length: MEETS_AT_ONCE }, worker));
    if (stop !== null) {
      refusedLines.push(stop);
      if (/stopped answering/.test(stop)) break;
    }
    if (sent > 0) {
      const ended = await client.handoff({ state: 'done', doing: project ? `People from the commits in ${project}` : 'People from the commits in repositories no project lists', note: `${plural(sent, 'person', 'people')} met.` });
      if (!ended.ok && refused(ended) && ended.refusal.code !== 'UNREACHABLE') refusedLines.push(`The run for ${project || 'repositories no project lists'} could not be ended: ${ended.refusal.fix}`);
    }
  }
  const count = (k: 'new' | 'known' | 'noted') => [...outcome.values()].filter((v) => v === k).length;
  const total = outcome.size;
  const parts = [count('new') > 0 ? `${String(count('new'))} new` : '', count('known') > 0 ? `${String(count('known'))} already known` : '', count('noted') > 0 ? `${String(count('noted'))} noted by name only` : ''].filter((x) => x !== '');
  io.out(`Met ${plural(total, 'person', 'people')} from ${plural(unique.length, 'repository', 'repositories')}${parts.length > 0 ? `: ${and(parts)}` : ''}. Your own commits and the machines' were left out.`);
  for (const line of [...new Set(refusedLines)]) io.say(line);
  return refusedLines.some((l) => /stopped answering/.test(l)) ? 3 : refusedLines.length > 0 ? 1 : 0;
}
