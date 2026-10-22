/**
 * The people in the work as git shows them: who an author is by key, which authors are machines, the owner's own keys,
 * and `meet` as the record takes it. Used by the end hook (`harvest` in `hooks.ts`) for one session's commits, and by
 * `braindog people harvest` for the repositories the record's projects list, from when each joined its project.
 *
 * AN AUTHOR IS THEIR KEYS, NEVER THEIR NAME, and a key is the kernel's (`keyOf` in `identity-keys.ts`), not a copy: a
 * key this command made one way and the record another was refused as malformed and the author silently skipped. Two
 * identities sharing a key are one author here; anything weaker (the same name, a login that looks like a local part)
 * is the record's to judge, because its strong rules and its questions keep the evidence and this command keeps nothing.
 *
 * ONLY THE REPOSITORIES A PROJECT LISTS, by its remote or by its very folder. A clone of somebody else's work, or a
 * folder that merely sits beside a project's, is not the person's work, and meeting everybody in an open-source
 * history filled People with strangers. An identity is met once it has made two commits, and one run meets at most
 * `MEETS_PER_RUN`, the busiest first.
 *
 * NOBODY TO MEET: a bot, a CI or machine user, a coding agent, and the owner. The owner is read from the self row of
 * whichever list declares `meets:`, by the part it names `self`: every key on that row and every name and alias it goes
 * by, with this machine's `git config user.email` beside them, so his own commits are never met however many addresses
 * he commits under. WHEN THAT ROW CANNOT BE READ, NOBODY IS MET, and the command says so.
 *
 * `meet` IS SENT IN THE CONTRACT'S SHAPE (`keys`, `kind`, `source`) and, when a record older than that refuses one of
 * those by name, once more in the shape it takes (`name`, `email`, `handle`, `where`), and in that shape for the rest of
 * the run.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import type { Client } from '@braindog/client';
import { githubOfAddress, isMachineIdentity, keyFrom, keyOf, keysOf, remoteKey } from '@braindog/kernel';
import { refused, type Result } from '@braindog/ports';

import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { git, normaliseRemote, sessionHeaders, type Position } from './position.ts';
import { isObject, type AgentIo } from './skills.ts';

/* ── machines ──────────────────────────────────────────────────────────── */

/**
 * Whether an author is a machine and not a person, as the kernel says it (`isMachineIdentity` in `identity-keys.ts`):
 * a bot, a no-reply sender, a CI user, a team's job at an organisation's domain, a machine's default user, or an address
 * at a machine's own name. One reading for the record and this command, so a commit the hook leaves out is one the
 * record would too.
 */
export const isMachine = (name: string, address: string): boolean => isMachineIdentity({ name, email: address }) || isAgent(name, address);

/*
 * A CODING AGENT IS A MACHINE TOO, here even on a kernel that does not know it yet: an agent that commits under its own
 * name (`Claude`, `Cursor Agent`, `Copilot`, `Ada (aider)`) or its maker's address (`noreply@anthropic.com`,
 * `cursoragent@cursor.com`) is nobody in the work. `Devin` and `Jules` are people's names as well, so those two count
 * only at an agent's address; anybody else at an agent maker's domain is a person who works there.
 */
const AGENT_NAME =
  /^(?:claude(?: code| agent| (?:opus|sonnet|haiku)\b.*)?|(?:openai )?codex(?: cli)?|cursor(?: ?agent)?|(?:github )?copilot(?: swe agent)?|devin ai|gemini(?: cli| code assist)?|aider|google jules)$|\(aider\)$/i;
const AGENT_LOCAL = /^(?:no-?reply|claude(?:-code)?|codex|cursor-?agent|cursor|copilot(?:-swe-agent)?|devin(?:-ai(?:-integration)?)?|gemini(?:-code-assist)?|aider|jules|agent)$/;
const AGENT_HOST = /(?:^|\.)(?:anthropic\.com|claude\.ai|openai\.com|chatgpt\.com|cursor\.com|cursor\.sh|anysphere\.co|cognition\.ai|cognition-labs\.com|devin\.ai|aider\.chat)$/;
const AGENT_LOGIN = /^(?:claude|codex|cursor|cursoragent|copilot|copilot-swe-agent|devin-ai-integration|gemini-code-assist|google-labs-jules|chatgpt-codex-connector)(?:\[bot\])?$/;

/** Whether an author is a coding agent, by the name it signs with or the address it commits from. */
export function isAgent(name: string, address: string): boolean {
  if (AGENT_NAME.test(name.trim().replace(/\s+/g, ' '))) return true;
  const at = address.trim().toLowerCase().lastIndexOf('@');
  if (at <= 0) return false;
  const local = address.trim().toLowerCase().slice(0, at).replace(/\+.*$/, '');
  const host = address.trim().toLowerCase().slice(at + 1);
  const login = githubOfAddress(address.trim().toLowerCase());
  if (login !== null) return AGENT_LOGIN.test(login);
  return AGENT_HOST.test(host) && AGENT_LOCAL.test(local);
}

/* ── authors ───────────────────────────────────────────────────────────── */

/** The `git log` format every reader here asks for: name, address, full commit, author date. */
export const LOG_FORMAT = '--format=%an%x1f%ae%x1f%H%x1f%aI';

/** One commit's author as `git log` gave it, with the key they are known by. */
export type Authored = { name: string; email: string; key: string; commit: string; at: string };

/**
 * The authors of a log in `LOG_FORMAT`, newest first, with the machines, the owner by any key or name of his, and
 * anybody with no address left out. Each commit is one entry: grouping is the caller's.
 */
export function authoredIn(log: string, own: Owner): Authored[] {
  const out: Authored[] = [];
  for (const line of log.split('\n')) {
    const [name = '', email = '', commit = '', at = ''] = line.split('\x1f').map((s) => s.trim());
    if (!commit) continue;
    const key = keyOf('email', email);
    if (key === null || isMachine(name, email) || isOwner(own, key, name)) continue;
    out.push({ name, email: email.toLowerCase(), key, commit, at });
  }
  return out;
}

/** The fewest commits an identity has made before it is met: one commit is a drive-by, two is somebody in the work. */
export const MIN_COMMITS = 2;

/**
 * Each author's commits in a repository since `since`, by key, each commit by its full hash, for `MIN_COMMITS` when only
 * a few commits are read. Into `into` when it is given, so several checkouts of one repository count a commit once.
 *
 * ONLY SINCE THE REPOSITORY JOINED ITS PROJECT (`joinedIn`). A listed fork or a vendored upstream holds years of other
 * people's history, and one `git pull` would otherwise make every upstream contributor somebody in the work.
 */
export async function commitsBy(dir: string, since: string, into = new Map<string, Set<string>>()): Promise<Map<string, Set<string>>> {
  const log = await git(dir, 'log', '--format=%ae%x1f%H', `--since=${since}`, 'HEAD');
  for (const line of (log ?? '').split('\n')) {
    const [email = '', commit = ''] = line.split('\x1f').map((x) => x.trim());
    const key = keyOf('email', email);
    if (key === null || !commit) continue;
    const seen = into.get(key) ?? new Set<string>();
    seen.add(commit);
    into.set(key, seen);
  }
  return into;
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

/* ── the record: its projects and the owner ────────────────────────────── */

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);

/** What one person row says identifies them: its address, its keys and its handles, each as the kernel keys it. */
export function keysOfRow(fields: Record<string, unknown>): string[] {
  const out = new Set(keysOf({ emails: strings(fields.email), keys: strings(fields.keys), handles: strings(fields.handles) }));
  /* A bare address kept among the keys is still that address's key. */
  for (const v of [...strings(fields.keys), ...strings(fields.handles)]) {
    const key = keyFrom(v) === null ? keyOf('email', v) : null;
    if (key !== null) out.add(key);
  }
  return [...out];
}

/** A name as two mentions of one person share it: trimmed, spaces collapsed, lower case. */
export const sameName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The owner as a harvest leaves him out: every key he is known by, and every name and alias he goes by. */
export type Owner = { keys: ReadonlySet<string>; names: ReadonlySet<string> };

/** Nobody: an owner known by no key and no name, before this machine's own address is added. */
export const NOBODY: Owner = { keys: new Set(), names: new Set() };

/** Whether one commit's author is the owner, by any key of his or by his name or one of his aliases. */
export const isOwner = (own: Owner, key: string, name: string): boolean => own.keys.has(key) || (name.trim() !== '' && own.names.has(sameName(name)));

/**
 * A project as this command reads it: its name, and the repositories and folders it lists. `row` is where its history
 * is read, for when a repository joined it (`joinedAt`): its list, its number, and the two fields the list keeps them in.
 */
export type Project = { name: string; repos: string[]; folders: string[]; row?: { register: string; seq: number; repos?: string; folders?: string } };

/**
 * What a harvest reads of the record: its projects, and the owner as the list declaring `meets:` keeps him. `self` is
 * `null` when his own row could not be read, and then nobody is met (`readSelf`).
 */
export type Layout = { projects: Project[]; self: Owner | null; why?: Unknown };

/** The reads a harvest makes. */
export type Reader = Pick<Client, 'boot' | 'schema' | 'list' | 'history'>;

/** What a harvest says when the owner's own row could not be read, and so meets nobody. */
export const noSelf = (dry: boolean, why: Unknown = 'unread'): string =>
  why === 'older'
    ? `Your record's People is older than this command and cannot mark which person is you, so ${dry ? 'a run would meet nobody' : 'nobody was met'}: it could not tell your own commits from somebody else's. It will once your record is updated.`
    : `${why === 'unread' ? 'BrainDog could not read which person in People is you' : 'People does not say which person is you yet'}, so ${dry ? 'a run would meet nobody' : 'nobody was met'}: it could not tell your own commits from somebody else's. Run it again once People marks you.`;

/**
 * Why the owner is not known: People's list is from before it could mark him (`older`), no list or row marks him
 * (`unmarked`), or his row could not be read (`unread`).
 */
export type Unknown = 'older' | 'unmarked' | 'unread';

/**
 * The projects and the owner, from the lists that declare them: `scopes:` for the projects, `meets:` for the people,
 * whose `self` part names the field marking the owner's own row. No projects, and no owner, when the record declares
 * neither or the caller cannot read it, never a guess by a list's name. Throws `unreachable` when the host does not
 * answer at all.
 */
export async function readLayout(reader: Reader): Promise<Layout> {
  const boot = await reader.boot();
  if (!boot.ok) {
    if (refused(boot) && boot.refusal.code === 'UNREACHABLE') throw new Error('unreachable');
    return { projects: [], self: null, why: 'unread' };
  }
  const decls = (await Promise.all(boot.value.registers.map((r) => reader.schema(r.id)))).flatMap((d) => (d.ok && isObject(d.value) && typeof d.value.id === 'string' ? [d.value] : []));
  const [projects, self] = await Promise.all([readProjects(reader, decls), readSelf(reader, decls)]);
  return typeof self === 'string' ? { projects, self: null, why: self } : { projects, self };
}

/** The project list: the one list declaring `scopes:`, its rows read to the end. */
async function readProjects(reader: Reader, decls: readonly Record<string, unknown>[]): Promise<Project[]> {
  const home = decls.find((d) => isObject(d.scopes));
  if (!home || !isObject(home.scopes)) return [];
  const { repos, folders } = home.scopes as { repos?: string; folders?: string };
  const title = typeof home.title === 'string' ? home.title : 'name';
  const out: Project[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const got: Result<{ rows: unknown[]; cursor: string | null }> = await reader.list({ register: String(home.id), limit: 200, ...(cursor ? { cursor } : {}) });
    if (!got.ok) return out;
    for (const r of got.value.rows)
      if (isObject(r) && isObject(r.fields)) {
        const f = r.fields;
        /* A FOLDER KEPT AMONG THE REPOSITORIES is still a folder, as `/Users/ada/Developer/glaze` or `C:/Repos/glaze`. */
        const said = repos ? strings(f[repos]) : [];
        out.push({
          name: typeof f[title] === 'string' ? f[title] : 'a project',
          repos: said.filter((r) => !isFolder(r)),
          folders: [...(folders ? strings(f[folders]) : []), ...said.filter(isFolder)].map(real),
          ...(typeof r.seq === 'number' ? { row: { register: String(home.id), seq: r.seq, ...(repos ? { repos } : {}), ...(folders ? { folders } : {}) } } : {}),
        });
      }
    cursor = got.value.cursor;
    if (!cursor) break;
  }
  return out;
}

/* A path on a machine rather than a remote or a name: from the root, from a drive, or from home. */
const isFolder = (said: string): boolean => /^(?:\/|~\/|[A-Za-z]:[\\/])/.test(said.trim());

/* A folder as git names it, through any link on the way, so `/tmp/x` and `/private/tmp/x` are one; as said when it is not here. */
function real(folder: string): string {
  if (folder.startsWith('~/')) folder = join(homedir(), folder.slice(2));
  try {
    return realpathSync(folder);
  } catch {
    return folder;
  }
}

/**
 * The owner as the list declaring `meets:` keeps him: the rows its `self` part marks, each with every key on it (its
 * address, its keys, its handles) and every name it goes by (its name and its aliases), as that list's parts name them.
 *
 * WHY HE IS NOT KNOWN WHEN HE CANNOT BE READ, AND THEN NOBODY IS MET: `older` for a list declaring `meets:` with no
 * `self` part, a People from before it could mark him, which no mark of his can mend until the record is updated;
 * `unmarked` for no list declaring `meets:` or no row marked his; `unread` for a read refused or thrown. Only this machine's git address would be left to know him by, so every other address and name he
 * has committed under would be met as a stranger and folded into People.
 */
async function readSelf(reader: Reader, decls: readonly Record<string, unknown>[]): Promise<Owner | Unknown> {
  const home = decls.find((d) => isObject(d.meets) && typeof d.meets.self === 'string');
  if (!home || !isObject(home.meets)) return decls.some((d) => isObject(d.meets)) ? 'older' : 'unmarked';
  const parts = home.meets as Record<string, unknown>;
  const part = (p: string, fields: Record<string, unknown>): unknown => (typeof parts[p] === 'string' ? fields[parts[p]] : undefined);
  const self = String(parts.self);
  try {
    const got = await reader.list({ register: String(home.id), where: { field: self, is: true }, limit: 5 });
    if (!got.ok) return 'unread';
    const keys = new Set<string>();
    const names = new Set<string>();
    let rows = 0;
    for (const r of got.value.rows)
      if (isObject(r) && isObject(r.fields) && r.fields[self] === true) {
        rows++;
        for (const k of keysOfRow({ email: part('email', r.fields), keys: part('keys', r.fields), handles: part('handles', r.fields) })) keys.add(k);
        for (const n of [...strings(part('name', r.fields)), ...strings(part('aliases', r.fields))].map(sameName)) if (n !== '') names.add(n);
      }
    return rows === 0 ? 'unmarked' : { keys, names };
  } catch {
    return 'unread';
  }
}

/**
 * When a repository joined the project that lists it, from that project row's history: the time of the write after
 * which its repositories or folders last came to name it, as `listedBy` reads them, and by its bare name too
 * (`namedBy`) when `byName` says that is how the project lists it today. `null` when the history does not show it
 * naming the repository, and then nothing in the repository counts.
 */
export function joinedIn(events: readonly unknown[], project: Project, repo: LocalRepo, byName = false): string | null {
  const parts = project.row;
  if (parts === undefined) return null;
  let repos: unknown = undefined;
  let folders: unknown = undefined;
  let joined: string | null = null;
  for (const e of events) {
    if (!isObject(e) || typeof e.ts !== 'string') continue;
    if (e.field === null && isObject(e.to)) {
      repos = parts.repos === undefined ? undefined : e.to[parts.repos];
      folders = parts.folders === undefined ? undefined : e.to[parts.folders];
    } else if (typeof e.field === 'string' && e.field === parts.repos) repos = e.to;
    else if (typeof e.field === 'string' && e.field === parts.folders) folders = e.to;
    else continue;
    const said = strings(repos);
    const then: Project = { name: project.name, repos: said.filter((r) => !isFolder(r)), folders: [...strings(folders), ...said.filter(isFolder)].map(real) };
    const names = (listedBy([then], repo) ?? (byName ? namedBy([then], repo) : null)) !== null;
    if (!names) joined = null;
    else joined ??= e.ts;
  }
  return joined;
}

/** When a repository joined the project that lists it (`joinedIn`), read from the record; `null` when it cannot be read. */
export async function joinedAt(reader: Pick<Client, 'history'>, project: Project, repo: LocalRepo, byName = false): Promise<string | null> {
  if (project.row === undefined) return null;
  try {
    const got = await reader.history(project.row.register, project.row.seq);
    const at = got.ok && Array.isArray(got.value) ? Date.parse(joinedIn(got.value, project, repo, byName) ?? '') : NaN;
    /* A TIME GIT CAN READ, and never one ahead of now, which git reads as no limit at all past 2099. */
    return Number.isFinite(at) && at <= Date.now() ? new Date(at).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * The owner for this run: his own row's keys and names, with the address and the name git signs with in each repository
 * named. Read once per run, so a session's end costs one read for however many authors it met.
 */
export async function ownerOf(self: Owner, dirs: readonly string[]): Promise<Owner> {
  const configured = await Promise.all(dirs.map(async (d) => [await git(d, 'config', 'user.email'), await git(d, 'config', 'user.name')] as const));
  const keys = new Set(self.keys);
  const names = new Set(self.names);
  for (const [email, name] of configured) {
    const key = email === null ? null : keyOf('email', email);
    if (key !== null) keys.add(key);
    if (name !== null && name.trim() !== '') names.add(sameName(name));
  }
  return { keys, names };
}

/**
 * The owner with every address he signed a commit with under a name of his, from logs in `LOG_FORMAT`, so the commits
 * he made from an old address under another name ("Teodor Vance" at the address he signs "Teo" with) are his too.
 */
export function ownerIn(own: Owner, logs: readonly (string | null)[]): Owner {
  const keys = new Set(own.keys);
  for (const log of logs)
    for (const line of (log ?? '').split('\n')) {
      const [name = '', email = ''] = line.split('\x1f').map((x) => x.trim());
      const key = keyOf('email', email);
      if (key !== null && name !== '' && own.names.has(sameName(name)) && !isMachine(name, email)) keys.add(key);
    }
  return { keys, names: own.names };
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

/** A repository on this machine: where it is, its name, and its remote as `host/owner/name`. */
export type LocalRepo = { dir: string; name: string; remote: string | null };

/** A repository on this machine by its folder, or `null` when the folder is not one. */
export async function localRepo(dir: string): Promise<LocalRepo | null> {
  const top = await git(dir, 'rev-parse', '--show-toplevel');
  if (top === null) return null;
  const origin = await git(top, 'remote', 'get-url', 'origin');
  return { dir: resolve(top), name: basename(resolve(top)), remote: origin === null ? null : normaliseRemote(origin) };
}

const pathKey = (p: string): string => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * The project that lists a local repository: by its remote, as the kernel keys a remote, or by its very folder. `null`
 * when none does, and then nobody in it is met.
 *
 * NEVER BY NAME, AND NEVER BY A FOLDER IT SITS UNDER. A project listing `inkwell` says nothing about a clone of
 * somebody else's `inkwell`, and a project's folder holding a checkout of an open-source library does not make the
 * library's authors the person's colleagues. A remote two projects list goes with the first.
 */
export function listedBy(projects: readonly Project[], repo: LocalRepo): Project | null {
  if (repo.remote !== null) {
    const at = remoteKey(repo.remote);
    const hit = projects.find((p) => p.repos.some((r) => remoteKey(r) === at));
    if (hit) return hit;
  }
  const dir = pathKey(repo.dir);
  return projects.find((p) => p.folders.some((f) => pathKey(f) === dir)) ?? null;
}

/* A repository name as two spellings of it share it: lower case, no dashes, dots or underscores. */
const bare = (name: string): string => name.toLowerCase().replace(/[-_. ]/g, '');

/**
 * The project that lists a local repository by its bare name (`lanternfish`, `oxbow-drafts`), as an older record keeps it:
 * the name of its remote, of its folder, or of its folder with the one above (`oxbow/bot` as `oxbow-bot`). `null` when
 * none does.
 *
 * ONLY A CANDIDATE. A name says nothing about whose clone this is, so the harvest reads it only when the owner has
 * committed to it himself (`ownCommits`): his own commits are what make a repository his work and not a stranger's.
 */
export function namedBy(projects: readonly Project[], repo: LocalRepo): Project | null {
  const parts = repo.dir.replace(/\\/g, '/').split('/').filter((p) => p !== '');
  const folder = parts.at(-1) ?? '';
  const spelled = new Set([bare(folder), bare(`${parts.at(-2) ?? ''}${folder}`), ...(repo.remote === null ? [] : [bare(repo.remote.split('/').at(-1) ?? '')])].filter((n) => n !== ''));
  return projects.find((p) => p.repos.some((r) => !/[/:]/.test(r.trim()) && spelled.has(bare(r)))) ?? null;
}

/** How many commits of a log in `LOG_FORMAT` are the owner's, by any key or name of his. */
export function ownCommits(log: string, own: Owner): number {
  let n = 0;
  for (const line of log.split('\n')) {
    const [name = '', email = '', commit = ''] = line.split('\x1f').map((x) => x.trim());
    const key = keyOf('email', email);
    if (commit && key !== null && isOwner(own, key, name)) n++;
  }
  return n;
}

/* ── braindog people harvest ───────────────────────────────────────────── */

const USAGE = 'braindog people harvest takes [--since <day>] [--whole-history] [--dry-run] [--host <host>], as in braindog people harvest --dry-run.';

/** The most people one run meets, the busiest first, so a long history cannot fill People in one go. */
export const MEETS_PER_RUN = 200;

/** One author across every repository read: the names they signed with, their keys, and where and when. */
export type Cluster = {
  names: Map<string, number>;
  keys: Set<string>;
  emails: Set<string>;
  commits: number;
  /** The newest commit in each repository, by repository name, for the source line. */
  newest: Map<string, string>;
  /** Commits by project name. */
  projects: Map<string, number>;
  /** Each name and address it signed with, as `name <address>`, with its commits: what the key folded into one. */
  identities: Map<string, number>;
  last: string;
};

/** The authors of several repositories grouped by key: two identities sharing an address or an account are one. Each commit counts once. */
export function clustersOf(read: readonly { repo: LocalRepo; project: Project | null; authored: Authored[] }[]): Cluster[] {
  const byKey = new Map<string, Cluster>();
  const all: Cluster[] = [];
  /* ONE COMMIT IS COUNTED ONCE, however many checkouts or worktrees of one repository hold it; a repository two
     projects list still links its people to both. */
  const seen = new Set<string>();
  const seenIn = new Set<string>();
  for (const { repo, project, authored } of read)
    for (const a of authored) {
      const p = project?.name ?? '';
      if (seenIn.has(`${p}\x1f${a.commit}`)) continue;
      seenIn.add(`${p}\x1f${a.commit}`);
      const again = seen.has(a.commit);
      seen.add(a.commit);
      let c = byKey.get(a.key);
      if (c === undefined) {
        c = { names: new Map(), keys: new Set([a.key]), emails: new Set(), commits: 0, newest: new Map(), projects: new Map(), identities: new Map(), last: '' };
        byKey.set(a.key, c);
        all.push(c);
      }
      if (!c.newest.has(repo.name)) c.newest.set(repo.name, a.commit);
      c.projects.set(p, (c.projects.get(p) ?? 0) + 1);
      if (again) continue;
      if (a.name) c.names.set(a.name, (c.names.get(a.name) ?? 0) + 1);
      if (a.key.startsWith('email:')) c.emails.add(a.email);
      const said = `${a.name || a.email} <${a.email}>`;
      c.identities.set(said, (c.identities.get(said) ?? 0) + 1);
      c.commits++;
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

/** The most people a dry run names under one project, the busiest; the rest are counted. */
export const DRY_RUN_SHOWN = 10;

/** A day as a person reads it: `1 March 2026`. */
export const dayOf = (at: string): string => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * What a dry run says, project by project: each person who would be met there with their commits to it, the busiest
 * `DRY_RUN_SHOWN` first and the rest counted, and under each, when the key folded several names or addresses into one
 * person, which. A person in two projects is in both, each with that project's commits. `since` is the day each
 * project's commits are counted from, when they are not counted over the whole history.
 */
export function dryRunLines(met: readonly Cluster[], projects: readonly string[], since: ReadonlyMap<string, string> = new Map()): string[] {
  const out: string[] = [];
  for (const project of projects) {
    const here = met.filter((c) => (c.projects.get(project) ?? 0) > 0).sort((a, b) => (b.projects.get(project) ?? 0) - (a.projects.get(project) ?? 0) || nameOf(a).localeCompare(nameOf(b)));
    if (here.length === 0) continue;
    const from = since.get(project);
    out.push('', `${project}: ${plural(here.length, 'person', 'people')}${from === undefined ? '' : ` since ${dayOf(from)}`}`);
    for (const c of here.slice(0, DRY_RUN_SHOWN)) {
      out.push(`  ${nameOf(c)}, ${plural(c.projects.get(project) ?? 0, 'commit')}`);
      if (c.identities.size > 1) out.push(`    signed as ${and([...c.identities.keys()])}`);
    }
    if (here.length > DRY_RUN_SHOWN) out.push(`  and ${String(here.length - DRY_RUN_SHOWN)} more with fewer commits`);
    /* THE SAME NAME AT TWO ADDRESSES IS NOT FOLDED HERE: a name is weak evidence, and the record judges it with the rest. */
    const counted = new Map<string, number>();
    for (const c of here) counted.set(sameName(nameOf(c)), (counted.get(sameName(nameOf(c))) ?? 0) + 1);
    const twice = [...new Set(here.slice(0, DRY_RUN_SHOWN).map(nameOf).filter((n) => (counted.get(sameName(n)) ?? 0) > 1))];
    if (twice.length > 0) out.push(`  ${and(twice)} ${twice.length === 1 ? 'appears' : 'appear'} more than once at different addresses, so the record decides whether each is one person.`);
  }
  return out;
}

/**
 * Who of the clusters is met in one run, and what was left out and why: the identities with fewer than `MIN_COMMITS`,
 * and those past `MEETS_PER_RUN`, the quietest first.
 */
export function chooseMet(clusters: readonly Cluster[]): { met: Cluster[]; few: number; over: number } {
  const enough = clusters.filter((c) => c.commits >= MIN_COMMITS);
  return { met: enough.slice(0, MEETS_PER_RUN), few: clusters.length - enough.length, over: Math.max(0, enough.length - MEETS_PER_RUN) };
}

/* The first three repositories' names, so a folder holding dozens is one short line and not a wall of names. */
const firstNames = (repos: readonly LocalRepo[]): string => and(repos.slice(0, 3).map((r) => r.name));

/** What a run left out, one sentence a reason, for the dry run and the real one alike. */
function leftOut(few: number, over: number, unlisted: readonly LocalRepo[], strangers: readonly LocalRepo[] = [], unjoined: readonly { repo: LocalRepo; project: Project }[] = []): string[] {
  const one = unjoined[0];
  return [
    few > 0 ? `Not met: ${plural(few, 'person', 'people')} with fewer than ${String(MIN_COMMITS)} commits.` : '',
    over > 0 ? `Not met: ${String(over)} more, past the ${String(MEETS_PER_RUN)} a run meets.` : '',
    unlisted.length === 0 ? '' : unlisted.length <= 3 ? `Not read: ${and(unlisted.map((r) => r.name))}, which no project lists.` : `Not read: ${String(unlisted.length)} repositories no project lists, such as ${firstNames(unlisted)}.`,
    strangers.length === 0 ? '' : strangers.length <= 3 ? `Not read: ${and(strangers.map((r) => r.name))}, which a project names but you never committed to.` : `Not read: ${String(strangers.length)} repositories a project names but you never committed to, such as ${firstNames(strangers)}.`,
    one === undefined
      ? ''
      : unjoined.length === 1
        ? `Not read: ${one.repo.name}, because ${one.project.name} does not show when it was added. Add --whole-history to read all of it.`
        : unjoined.length <= 3
          ? `Not read: ${and(unjoined.map((u) => u.repo.name))}, because their projects do not show when each was added. Add --whole-history to read all of them.`
          : `Not read: ${String(unjoined.length)} repositories whose projects do not show when each was added, such as ${firstNames(unjoined.map((u) => u.repo))}. Add --whole-history to read all of them.`,
  ].filter((l) => l !== '');
}

/** The headers one project's run sends: a client id of its own, and the place of one of its repositories. */
function runHeaders(at: LocalRepo, host: string, client: string): Record<string, string> {
  const where: Position = { cwd: at.dir, repo: at.name, remote: at.remote, host, branch: null, head: null };
  return sessionHeaders(where, 'other', { client_id: client });
}

/** At most this many meets in flight at once, for one project's run. */
const MEETS_AT_ONCE = 4;

/** The later of a repository's joining and `--since`, as git reads either. */
const later = (joined: string, since: string | undefined): string => (since !== undefined && Date.parse(since) > Date.parse(joined) ? since : joined);

/**
 * `braindog people harvest [--since <day>] [--whole-history] [--dry-run] [--host <host>]`: everybody who committed at
 * least twice to the repositories the record's projects list, found in and under this folder and in each folder a
 * project lists, met with the project each worked in, at most `MEETS_PER_RUN` of them. The exit code: 0 done, 1 refused
 * or a local error, 3 unreachable.
 *
 * ONLY THE COMMITS SINCE A REPOSITORY JOINED ITS PROJECT, as the end hook counts them (`joinedAt`): a listed fork or a
 * vendored upstream holds years of other people's history, and one run over all of it would meet every upstream
 * contributor. A repository whose project's history does not show when it was added is not read, and says so.
 * `--whole-history` reads every commit, as this command did before.
 *
 * ONE RUN PER PROJECT, EACH OF ITS OWN. A meet links a person to the project of the run it is made in, so each project's
 * meets go as a run placed there by one of its repositories, and that run is ended `done` once its last meet answers.
 * A repository no project lists is not read, and says so. Nothing is sent with `--dry-run`, which prints, project by
 * project, who it would meet and their commits there, which names and addresses each one folds together, and what it
 * would leave out.
 */
export async function peopleCommand(args: string[], io: AgentIo): Promise<number> {
  let parsed: { values: { since?: string | undefined; 'whole-history'?: boolean | undefined; 'dry-run'?: boolean | undefined; host?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { since: { type: 'string' }, 'whole-history': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, host: { type: 'string' } } });
  } catch {
    io.say(USAGE);
    return 1;
  }
  const { since, host } = parsed.values;
  const dryRun = parsed.values['dry-run'] === true;
  const whole = parsed.values['whole-history'] === true;
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
  let layout: Layout;
  try {
    layout = await readLayout(reader);
  } catch {
    io.say(`${to.key} did not answer.`);
    return 3;
  }
  /* FAIL CLOSED ON THE OWNER: a run that cannot tell his commits from a stranger's meets nobody, the dry run included. */
  if (layout.self === null) {
    if (dryRun) io.out(noSelf(true, layout.why));
    else io.say(noSelf(false, layout.why));
    return dryRun ? 0 : 1;
  }
  const self = layout.self;

  /* THE REPOSITORIES: this folder's own, those under it, and each folder a project lists that is one on this machine,
     then only those a project lists. */
  const dirs = new Set<string>();
  const here = await localRepo(io.cwd);
  if (here !== null) dirs.add(here.dir);
  else for (const rel of childRepos(io.cwd)) dirs.add(resolve(io.cwd, rel));
  for (const p of layout.projects) for (const f of p.folders) if (existsSync(join(f, '.git'))) dirs.add(resolve(f));
  const repos = (await Promise.all([...dirs].map(localRepo))).filter((r): r is LocalRepo => r !== null);
  const unique = [...new Map(repos.map((r) => [r.dir, r])).values()];
  if (unique.length === 0) {
    io.out('No repository was found here or in the folders your projects list, so nobody was met.');
    return 0;
  }

  /* LISTED BY REMOTE OR FOLDER, or named by a bare name and then read only if the owner committed to it himself. */
  const candidates = unique.flatMap((repo) => {
    const listed = listedBy(layout.projects, repo);
    const named = listed === null ? namedBy(layout.projects, repo) : null;
    const project = listed ?? named;
    return project === null ? [] : [{ repo, project, byName: named !== null }];
  });
  /* FROM WHEN EACH JOINED ITS PROJECT, by the project's own history, or `--since` when that is later; `null` when the
     history does not show it, and then it is not read. Over everything, or from `--since`, with --whole-history. */
  const joined = await Promise.all(candidates.map((c) => (whole ? null : joinedAt(reader, c.project, c.repo, c.byName))));
  const unjoined = (i: number): boolean => !whole && joined[i] === null;
  const windows = candidates.map((_, i) => {
    const at = joined[i];
    return whole || at === null || at === undefined ? since : later(at, since);
  });
  const logs = await Promise.all(candidates.map((c, i) => (unjoined(i) ? null : git(c.repo.dir, 'log', LOG_FORMAT, ...(windows[i] === undefined ? [] : [`--since=${windows[i]}`])))));
  const own = ownerIn(await ownerOf(self, candidates.map((l) => l.repo.dir)), logs);
  /* His commits over the whole history, so a window he did not commit in does not disown a repository of his. */
  const mine = await Promise.all(
    candidates.map(async (c, i) => {
      if (!c.byName) return true;
      const log = windows[i] === undefined && !unjoined(i) ? logs[i] : await git(c.repo.dir, 'log', LOG_FORMAT);
      return log !== null && log !== undefined && ownCommits(log, own) > 0;
    }),
  );
  const read = candidates.flatMap((c, i) => {
    const log = logs[i] ?? null;
    return mine[i] && !unjoined(i) ? [{ repo: c.repo, project: c.project, authored: log === null ? [] : authoredIn(log, own), since: windows[i] }] : [];
  });
  const listed = read.map(({ repo, project }) => ({ repo, project }));
  const strangers = candidates.filter((_, i) => !mine[i]).map((c) => c.repo);
  const late = candidates.filter((_, i) => mine[i] && unjoined(i)).map(({ repo, project }) => ({ repo, project }));
  const unlisted = unique.filter((r) => !listed.some((l) => l.repo === r) && !strangers.includes(r) && !late.some((l) => l.repo === r));
  if (listed.length === 0 && late.length > 0) {
    io.out('No repository here could be counted from when it joined its project, so nobody was met.');
    for (const line of leftOut(0, 0, unlisted, strangers, late)) io.out(line);
    return 0;
  }
  if (listed.length === 0) {
    const all = [...unlisted, ...strangers];
    const which = all.length <= 3 ? firstNames(all) : `any of the ${String(all.length)} repositories here, such as ${firstNames(all)}`;
    io.out(`No project lists ${which}, so nobody was met. Add a repository's remote to its project to meet the people who commit to it.`);
    return 0;
  }

  const clusters = clustersOf(read);
  const { met, few, over } = chooseMet(clusters);
  const notes = leftOut(few, over, unlisted, strangers, late);
  const from = plural(listed.length, 'repository', 'repositories');
  const window = whole ? (since === undefined ? '' : ` since ${since}`) : since === undefined ? ' since each joined its project' : ` since ${since}, or since each joined its project when that is later`;
  if (clusters.length === 0) {
    io.out(`Nobody but you committed to ${from}${window}, so nobody was met.`);
    for (const line of notes) io.out(line);
    return 0;
  }
  if (met.length === 0) {
    io.out(`Nobody made ${String(MIN_COMMITS)} or more commits to ${from}${window}, so nobody was met.`);
    for (const line of notes) io.out(line);
    return 0;
  }

  if (dryRun) {
    const names = [...new Set(listed.map((l) => l.project.name))].sort((a, b) => a.localeCompare(b));
    /* Each project from the earliest day any of its repositories is counted from. */
    const counted = new Map<string, string>();
    if (!whole)
      for (const r of read) {
        const was = counted.get(r.project.name);
        if (r.since !== undefined && (was === undefined || Date.parse(r.since) < Date.parse(was))) counted.set(r.project.name, r.since);
      }
    io.out(`${plural(met.length, 'person', 'people')} would be met from ${from}${window}. Nothing was sent.`);
    for (const line of dryRunLines(met, names, counted)) io.out(line);
    if (notes.length > 0) io.out('');
    for (const line of notes) io.out(line);
    return 0;
  }

  /* ONE RUN A PROJECT. */
  const groups = new Map<string, { repo: LocalRepo; repos: Set<string> }>();
  for (const { repo, project } of listed) {
    const g = groups.get(project.name) ?? { repo, repos: new Set<string>() };
    g.repos.add(repo.name);
    groups.set(project.name, g);
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
    const queue = met.filter((c) => (c.projects.get(project) ?? 0) > 0);
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
      const ended = await client.handoff({ state: 'done', doing: `People from the commits in ${project}`, note: `${plural(sent, 'person', 'people')} met.` });
      if (!ended.ok && refused(ended) && ended.refusal.code !== 'UNREACHABLE') refusedLines.push(`The run for ${project} could not be ended: ${ended.refusal.fix}`);
    }
  }
  const count = (k: 'new' | 'known' | 'noted') => [...outcome.values()].filter((v) => v === k).length;
  const total = outcome.size;
  const parts = [count('new') > 0 ? `${String(count('new'))} new` : '', count('known') > 0 ? `${String(count('known'))} already known` : '', count('noted') > 0 ? `${String(count('noted'))} noted by name only` : ''].filter((x) => x !== '');
  io.out(`Met ${plural(total, 'person', 'people')} from ${from}${window}${parts.length > 0 ? `: ${and(parts)}` : ''}. Your own commits and the machines' were left out.`);
  for (const line of notes) io.out(line);
  for (const line of [...new Set(refusedLines)]) io.say(line);
  return refusedLines.some((l) => /stopped answering/.test(l)) ? 3 : refusedLines.length > 0 ? 1 : 0;
}
