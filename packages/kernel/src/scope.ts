/**
 * Where a row applies, and how a run learns which project it is in.
 *
 * TWO SCOPES AND NO THIRD. A row is global, or it belongs to one row of the register that declares `scopes:`, which is
 * the record's list of projects. A project lists its repositories and folders, and a run started in one of them is in
 * that project; a run started anywhere else is global, and so is one whose place only shares a name with a project's,
 * until the person says. `resolveProject` only reads: the ladder writes its answer onto the run, once.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';
import { SESSION } from './session.ts';

/** `scopes:` on a register: which of its fields list a project's repositories, and its folders. */
export type ScopesDecl = { repos?: string; folders?: string };

/** `scope:` on a field. Left out, `widen` is `any`, `same` is `both`, and there are no `links`. */
export type ScopeDecl = { widen?: 'any' | 'person'; same?: 'both' | 'nearer'; links?: true };

/** Where a run says it is: the same three hints the ladder opens a run with. */
export type Whereabouts = { remote?: string | undefined; repo?: string | undefined; cwd?: string | undefined };

export type Resolved = {
  /** The project, or `null` for global. `how` is the rung that placed the run there. */
  project: { id: string; spoken: string; how: 'remote' | 'folder' | 'repo' } | null;
  /**
   * Projects the place matched without settling on one, by spoken id, which leaves the run global: two or more at the
   * same strength, a choice for the person; or the ONE project only a last name ties the place to, a question for the
   * person ("Is this BrainDog?"). Neither is filed on a guess.
   */
  ambiguous: string[];
};

/**
 * A project as `matchProject` reads it: its id, its spoken id, the repositories and folders it lists, and its name when
 * the list names a title field, which a run's own folder may be called (`folderNamed`).
 */
export type Candidate = { id: string; spoken: string; repos: readonly string[]; folders: readonly string[]; name?: string };

const GLOBAL: Resolved = { project: null, ambiguous: [] };

type Holders = ReadonlyMap<string, { id: string; seq_prefix?: string; scopes?: ScopesDecl; title?: string }>;

/**
 * The record's projects, from the one active register declaring `scopes:`, read whole; `null` when none declares it.
 *
 * THE PROJECTS ARE READ WHOLE AND MATCHED IN CODE. A record holds tens of them, and no index answers "is this folder
 * under one of the paths in a list inside a row".
 */
function projectsOf(sql: Sql, registers: Holders): Candidate[] | null {
  const holders = [...registers.values()].filter((r) => r.scopes !== undefined);
  const home = holders.length === 1 ? holders[0] : undefined;
  if (!home?.scopes) return null;
  const { repos, folders } = home.scopes;

  const texts = (fields: Record<string, Json>, key: string | undefined): string[] => {
    const held = key === undefined ? undefined : fields[key];
    return Array.isArray(held) ? held.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  };
  const said = home.seq_prefix && home.seq_prefix !== '#' ? home.seq_prefix : `${home.id}#`;
  return sql
    .all<{ id: string; seq: number; fields: string }>(
      'SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL ORDER BY seq',
      home.id,
    )
    .map((row) => {
      const fields = JSON.parse(row.fields) as Record<string, Json>;
      const name = home.title === undefined ? undefined : fields[home.title];
      return candidateOf(row.id, `${said}${row.seq}`, texts(fields, repos), texts(fields, folders), typeof name === 'string' ? name : undefined);
    });
}

/**
 * Whether a place a project lists is a folder on a machine, though it may be listed among its repositories: from the
 * root, from a drive, or from home (`/Users/sam/Code/kiln`, `C:\Repos\kiln`, `~/kiln`).
 */
export const isFolderPlace = (said: string): boolean => /^(?:\/|~\/|[A-Za-z]:[\\/])/u.test(said.trim());

/**
 * A project as `matchProject` reads it, from what it lists. A FOLDER LISTED AMONG THE REPOSITORIES IS A FOLDER, as the
 * owner's BrainDog lists `/Users/…/braindog` in its repositories: read as a repository it matched no remote and no name,
 * so not one run in that checkout was ever placed, and the command line already read it as a folder (`apps/cli`).
 */
export function candidateOf(id: string, spoken: string, repos: readonly string[], folders: readonly string[], name?: string): Candidate {
  return { id, spoken, repos: repos.filter((r) => !isFolderPlace(r)), folders: [...folders, ...repos.filter(isFolderPlace)], ...(name === undefined ? {} : { name }) };
}

/** A name with case and punctuation folded away: `Brain-Dog`, `braindog` and `BrainDog` are one. */
export const folded = (said: string): string => said.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * What a project's name folds to as a folder may be called: the name, and the name with a domain ending left off, as a
 * service is matched to a project (`backfill.ts`, 3): `Oxbow.gg` is the `oxbow` folder as much as `oxbowgg`.
 */
export function namedAs(name: string): string[] {
  const whole = folded(name);
  const base = /^(.+)\.[a-z]{2,}$/iu.exec(name.trim())?.[1];
  const bare = base === undefined ? '' : folded(base);
  return [...new Set([whole, bare].filter((n) => n !== ''))];
}

/**
 * The one project a run's own folder is called: its name (`namedAs`), or a bare repository it lists, case and
 * punctuation folded. Only for a run that says no remote and no repository of another spelling, which is where
 * `sam/lantern` and somebody else's `lantern` would part; `null` when none or two match. The nightly walk places a
 * finished run by this (`exactFolder`), and the ladder a working one, so a run at work in `~/Code/oxbow` is Oxbow.gg's
 * while it works and not only once it has stopped.
 */
export function folderNamed(projects: readonly Candidate[], where: Whereabouts): Candidate | null {
  if (where.remote?.trim() || !where.cwd?.trim()) return null;
  const last = folded(lastSpelled(where.cwd));
  if (last === '' || (where.repo?.trim() && folded(where.repo) !== last)) return null;
  const hits = projects.filter(
    (p) => (p.name !== undefined && namedAs(p.name).includes(last)) || p.repos.some((r) => bare(r) && folded(r.trim().replace(/\.git$/iu, '')) === last),
  );
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * Which project a run in this place belongs to.
 *
 *   1. The one active register declaring `scopes:` holds the projects. None, and every run is global.
 *   2. A remote equal to a `repos` entry, as `host/owner/name`, wins.
 *   3. Then a `folders` entry the working folder is in, and the longest such folder; one listed from home (`~/…`) is
 *      read under the home the working folder is in.
 *   4. Then a repository name equal to a bare name a project lists among its repositories (`portage`).
 *   4b. Then, with no remote and no other repository name, the run's own folder called what one project is called, or
 *      a bare repository it lists (`folderNamed`), unless a name up its path points at another project.
 *   5. Two projects matching at the same rung, or with folders of the same length, leave the run
 *      global and are named in `ambiguous`, because picking one would file work under a guess.
 *   6. And a match by last name alone (`matchProject`) is never settled: the project or projects it
 *      finds are named in `ambiguous`, for the person to say.
 */
export function resolveProject(sql: Sql, registers: Holders, where: Whereabouts): Resolved {
  const projects = projectsOf(sql, registers);
  return projects ? matchProject(projects, where) : GLOBAL;
}

/**
 * Which of `projects` a run in this place is in: by its remote, then the folder it works in, then a bare repository
 * name the project lists; and failing those, the projects its last names point at, for the person to choose from.
 *
 * A REMOTE IS COMPARED WHOLE, `host/owner/name`, because every run records its remote and a remote is the same on
 * every machine. `github.com/someone/app` is a fork or another company's `app`, and never `github.com/me/app`'s
 * project, so a run that says its remote is never matched to another remote by the name at its end.
 *
 * A LAST NAME IS ONLY EVER A QUESTION. A project that lists its folder as Windows wrote it, `C:\Repos\braindog`, is
 * matched by nothing a Mac sends, and its last name, `braindog`, is the Mac's checkout's too. But so is every `web`,
 * `api` and `app`: a name found up the working path settled 'one hit' silently and filed a run's work in a project it
 * was never in. So the repository's own name, as its remote or its folder says it, and then each folder up the working
 * path, nearest first, are compared with the last name of every folder a project lists, and of every remote too when the
 * run said none of its own; the first that finds any comes back in `ambiguous` and is never settled, one project or
 * several. Case is ignored, as
 * a folder's is on Windows and a remote's is on every host that serves one, and the drive is never a name.
 */
export function matchProject(projects: readonly Candidate[], where: Whereabouts): Resolved {
  const settle = (hits: readonly Candidate[], how: 'remote' | 'folder' | 'repo'): Resolved => {
    const [one] = hits;
    return hits.length === 1 && one
      ? { project: { id: one.id, spoken: one.spoken, how }, ambiguous: [] }
      : { project: null, ambiguous: hits.map((h) => h.spoken) };
  };

  const remote = where.remote?.trim() ? remoteKey(where.remote) : '';
  if (remote) {
    const hits = projects.filter((p) => p.repos.some((r) => !bare(r) && remoteKey(r) === remote));
    if (hits.length) return settle(hits, 'remote');
  }

  const cwd = where.cwd?.trim() ? pathKey(where.cwd) : '';
  if (cwd) {
    let best = -1;
    let hits: Candidate[] = [];
    /* A FOLDER LISTED FROM HOME, `~/Code/copperleaf`, IS UNDER THE RUN'S OWN HOME, which its working folder says
       (`homeIn`): read as written it was under nothing, so two projects listing theirs so placed no run by folder. */
    const home = homeIn(cwd);
    const placeOf = (f: string): string => (home !== null && /^~(?:\/|$)/u.test(f) ? `${home}${f.slice(1)}` : f);
    for (const p of projects) {
      const longest = Math.max(-1, ...p.folders.map((f) => pathKey(placeOf(pathKey(f)))).filter((f) => under(cwd, f)).map((f) => f.length));
      if (longest > best) [best, hits] = [longest, [p]];
      else if (longest === best && longest >= 0) hits.push(p);
    }
    if (hits.length) return settle(hits, 'folder');
  }

  /* A BARE NAME A PROJECT LISTS AS ITS REPOSITORY is the person saying every checkout of that name is the project's,
     as Portage's `portage` does, so it settles as a remote would. */
  const names = new Set([remote ? lastName(remote) : '', where.repo?.trim().toLowerCase() ?? ''].filter((n) => n !== ''));
  const claimed = projects.filter((p) => p.repos.some((r) => bare(r) && names.has(lastName(r))));
  if (claimed.length) return settle(claimed, 'repo');

  /* A RUN'S OWN FOLDER CALLED WHAT ONE PROJECT IS CALLED, as the nightly walk already places a finished run.
     The walk leaves a working run to this ladder, and the ladder had no such rung, so a run at work in such a folder was
     on no project for as long as it worked (24 Oct, H26: two of three runs at work named none). */
  const own = folderNamed(projects, where);

  /* THE REPOSITORY'S OWN NAME FIRST, THEN THE NEAREST FOLDER UP THE PATH, and the first that points anywhere is the
     question: a checkout's own name says more than the `Developer` or the home folder it sits in, and reading every
     folder up the path at once turned "Is this BrainDog?" into "Which one?" for a run under a folder some other project
     also lists. */
  const up = cwd.split('/').filter((part) => part !== '' && !/^[a-z]:$/u.test(part)).reverse();
  let guess: Candidate[] = [];
  for (const name of [...names, ...up.map((part) => part.toLowerCase())]) {
    guess = projects.filter((p) => [...p.folders, ...p.repos.filter((r) => bare(r) || !remote)].some((place) => lastName(place) === name));
    if (guess.length) break;
  }
  /* AND IT SETTLES ONLY WHERE NO GUESS POINTS ELSEWHERE, as the walk asks it. */
  if (own !== null && guess.every((p) => p.id === own.id)) return settle([own], 'folder');
  return guess.length ? { project: null, ambiguous: guess.map((p) => p.spoken) } : GLOBAL;
}

/**
 * The project a run is in after a call with these hints: none while it already has one, because a run is placed once
 * and never moved from one project to another; and while it has none, the project a hint of where it is settles on, or
 * none. `resolve` is `resolveProject` over the record.
 *
 * ONCE, AND THE FIRST TIME A HINT RESOLVES. A run opened by a hook that could not read git is unplaced, and its next
 * call from the checkout places it. A run re-attached from another folder used to be moved to that folder's project,
 * or made global from a scratch folder, so one session's work was split between projects by where it last stood.
 */
export function placeOnce(has: string | null, where: Whereabouts, resolve: (where: Whereabouts) => Resolved): Resolved['project'] {
  if (has !== null && has !== '') return null;
  if (!where.remote?.trim() && !where.repo?.trim() && !where.cwd?.trim()) return null;
  return resolve(where).project;
}

/** A repository the record does not know, seen in enough runs that it is worth asking whether it is a project. */
export type ProjectSuggestion = {
  /** What one suggestion is kept by, so it is asked once: the remote as `host/owner/name`, or the bare name. */
  key: string;
  /** The name to start the project with: the repository's, as its remote or its runs spell it. */
  name: string;
  /** The remote as the newest run that said one wrote it, or `null` when no run said one. */
  remote: string | null;
  /** The checkout's folder as the newest run with a folder worked in it, cut to the repository's own folder. */
  folder: string | null;
  /** How many runs were seen there. */
  runs: number;
};

/** A run as `suggestProjects` reads it: where it said it was, whether it was placed, and when it opened. */
export type SeenRun = Whereabouts & { project?: string | null | undefined; at: string };

/** How many runs in one unknown repository make it worth asking about: three sessions is a habit, one is a visit. */
export const SUGGEST_AFTER = 3;

/**
 * Folders any machine has that are never a project ("Start a project for Temp?"): a temporary or scratch
 * folder, the home, desktop, downloads and documents folders, the folder code sits in, and a worktree an agent opened.
 */
const GENERIC = new Set([
  'temp', 'tmp', 'desktop', 'downloads', 'documents', 'developer', 'dev', 'code', 'repos', 'src', 'home', 'scratch', 'scratchpad', 'worktree', 'worktrees',
  /* A FOLDER INSIDE A CHECKOUT is never a project (3 Nov: "A run worked in parts. Is that Otters.gg?" and "2 runs worked in
     bot. Is that Crumb.gg?" came from runs that cd'd into a code folder). */
  'parts', 'part', 'lib', 'libs', 'bin', 'bot', 'bots', 'app', 'apps', 'packages', 'package', 'pkg', 'packs', 'components', 'routes', 'pages',
  'scripts', 'script', 'test', 'tests', '__tests__', 'spec', 'build', 'dist', 'out', 'web', 'api', 'server', 'client', 'utils', 'util', 'tools',
  'docs', 'doc', 'assets', 'static', 'public', 'config', 'internal', 'core', 'shared', 'common', 'modules', 'node_modules', 'vendor', 'loop', 'plans',
]);

/** Whether a place's name, or the folder its run worked in, is one no person means as a project (`GENERIC`). */
export function genericPlace(name: string, cwd?: string): boolean {
  const said = name.trim().toLowerCase();
  if (GENERIC.has(said) || /^(?:agent-[0-9a-f]{8,}|worktree-.+)$/u.test(said) || /^te?mp(?:[-_.]\w*|\d*)$/u.test(said)) return true;
  if (cwd === undefined) return false;
  const path = cwd.replace(/\\/gu, '/').toLowerCase();
  return /\/(?:\.claude\/worktrees|\.worktrees|worktrees|[\w.-]*-wt)\//u.test(path) || /^\/(?:private\/)?(?:tmp|var\/folders)\//u.test(path);
}

/** The words a branch is commonly started with, before a `/`, `-` or `_`: `feature/login`, `fix-rates`, `claude/x`. */
const BRANCH_LEAD = /^(?:feature|feat|fix|bugfix|hotfix|chore|release|wip|refactor|test|tests|docs|spike|exp|experiment|claude|codex|copilot|cursor|dependabot|renovate)[-/_]/iu;

/**
 * Whether a name is a branch's, never a project's: one any run said it worked on (`branches`, the runs' `branch`
 * facts), a name holding a `/` as a branch does, or one started the way a branch is (`feature-`, `fix/`, `claude/`).
 *
 * "Add 2 names to Projects? Rates and glaze-fix, named in a run" offered a branch as a project. A project is what a person
 * names, so a name only a branch or a worktree has is never offered as one.
 */
export function branchName(name: string, branches: ReadonlySet<string> = new Set()): boolean {
  const said = name.trim();
  if (said === '') return false;
  if (branches.has(said.toLowerCase())) return true;
  if (/[\\/]/u.test(said)) return true;
  return BRANCH_LEAD.test(said) || genericPlace(said);
}

/**
 * Whether a name read from what an agent wrote is a word of code rather than a project's name: a branch's
 * (`branchName`), or one written the way an identifier is, in lower case joined by `-`, `_` or `.` (`glaze-fix`,
 * `kiln_rates`). A project named in prose is said as a person says it ("Kiln", "Lantern.io", "Oxbow app").
 */
export function codeName(name: string, branches: ReadonlySet<string> = new Set()): boolean {
  const said = name.trim();
  return branchName(said, branches) || /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/u.test(said);
}

/** On how many days runs worked there: a project is a habit across days, and three runs in one afternoon a visit. */
export const SUGGEST_DAYS = 2;

/**
 * The repositories the record has seen runs in and knows no project for, as "Start a project?" suggestions, one for
 * each, with its remote and folder filled in. The caller asks once per `key`, and never again once the person says no.
 *
 * A REPOSITORY IS ITS REMOTE, and a run that names only its repository's folder name is counted with the one remote of
 * that name when there is exactly one. A run with only a folder names no repository and is never counted, nor is a
 * repository any project matches, even only by name: that one is asked about as the project it may be. A folder no
 * person means as a project (`genericPlace`: Temp, Downloads, a worktree) is never suggested, and a repository is asked
 * about only once runs worked in it on two days (`SUGGEST_DAYS`).
 */
export function suggestProjects(runs: readonly SeenRun[], projects: readonly Candidate[], least = SUGGEST_AFTER): ProjectSuggestion[] {
  const loose = runs.filter((r) => (r.project ?? '') === '' && (r.remote?.trim() || r.repo?.trim()));
  const byRemote = new Map<string, SeenRun[]>();
  const byName = new Map<string, SeenRun[]>();
  for (const run of loose) {
    const into = run.remote?.trim() ? byRemote : byName;
    const key = run.remote?.trim() ? remoteKey(run.remote) : lastName(run.repo ?? '');
    if (key !== '') into.set(key, [...(into.get(key) ?? []), run]);
  }
  for (const [name, named] of byName) {
    const same = [...byRemote.keys()].filter((key) => lastName(key) === name);
    if (same.length !== 1 || !same[0]) continue;
    byRemote.set(same[0], [...(byRemote.get(same[0]) ?? []), ...named]);
    byName.delete(name);
  }

  const out: ProjectSuggestion[] = [];
  for (const [key, seen] of [...byRemote, ...byName]) {
    if (seen.length < least) continue;
    if (new Set(seen.map((r) => r.at.slice(0, 10))).size < SUGGEST_DAYS) continue;
    const newest = [...seen].sort((a, b) => b.at.localeCompare(a.at));
    const remote = newest.find((r) => r.remote?.trim())?.remote?.trim() ?? null;
    const placed = matchProject(projects, { remote: remote ?? undefined, repo: newest.find((r) => r.repo?.trim())?.repo });
    if (placed.project || placed.ambiguous.length) continue;
    const spelled = remote ? lastSpelled(remote) : (newest.find((r) => r.repo?.trim())?.repo?.trim() ?? key);
    const at = newest.find((r) => r.cwd?.trim());
    if (genericPlace(spelled, at?.cwd?.trim() || undefined) || branchName(spelled)) continue;
    out.push({ key, name: spelled, remote, folder: at?.cwd ? checkout(at.cwd, at.repo?.trim() || spelled) : null, runs: seen.length });
  }
  return out.sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
}

/** `suggestProjects` over the record's runs that no project holds, and its projects; none where nothing declares projects. */
export function projectSuggestions(sql: Sql, registers: Holders, least = SUGGEST_AFTER): ProjectSuggestion[] {
  const projects = projectsOf(sql, registers);
  if (!projects) return [];
  const runs = sql
    .all<{ remote: string | null; repo: string | null; cwd: string | null; at: string }>(
      `SELECT json_extract(fields, '$.remote') AS remote, json_extract(fields, '$.repo') AS repo, json_extract(fields, '$.cwd') AS cwd,
        created_at AS at FROM entry
       WHERE register = ? AND deleted_at IS NULL AND coalesce(json_extract(fields, '$.project'), '') = ''
         AND (json_extract(fields, '$.remote') IS NOT NULL OR json_extract(fields, '$.repo') IS NOT NULL)
       ORDER BY created_at, seq`,
      SESSION,
    )
    .map((r) => ({ remote: r.remote ?? undefined, repo: r.repo ?? undefined, cwd: r.cwd ?? undefined, at: r.at }));
  return suggestProjects(runs, projects, least);
}

/**
 * The last name of a remote as it was written, with no `.git`: `Lanternfish_PREPROD`, where `lastName` gives
 * `lanternfish_preprod`.
 */
function lastSpelled(said: string): string {
  const parts = said.trim().replace(/[\\/]+$/u, '').replace(/\.git$/iu, '').split(/[\\/:]+/u).filter((part) => part !== '');
  return parts.at(-1) ?? '';
}

/** The folder of the checkout a run worked in: its working folder cut after the last part named as the repository. */
function checkout(cwd: string, repo: string): string {
  const said = cwd.trim().replace(/[\\/]+$/u, '');
  const parts = said.split(/([\\/])/u);
  const name = repo.toLowerCase();
  for (let i = parts.length - 1; i >= 0; i -= 2) if (parts[i]?.toLowerCase() === name) return parts.slice(0, i + 1).join('');
  return said;
}

/** Whether a place a project lists is a bare repository name, with no host, owner or folder: `portage`. */
function bare(place: string): boolean {
  const name = place.trim().replace(/\.git$/iu, '');
  return name !== '' && !/[\\/:]/u.test(name);
}

/**
 * The last name in a place, lower case: a remote's repository with no `.git`, a folder's own name, as either OS writes
 * it, or a bare name as it is. Empty for a place with no name in it.
 */
function lastName(said: string): string {
  return lastSpelled(said).toLowerCase();
}

/**
 * A remote as `host/owner/name`, lower case: no scheme, no `user@`, no trailing `.git`.
 *
 * `git@github.com:acme/braindog` names its path after the colon. Behind a scheme the colon is a port instead, and a
 * port says nothing about which repository it is. CASE IS IGNORED THROUGHOUT, because GitHub, GitLab and Bitbucket
 * all answer `Acme/BrainDog` and `acme/braindog` with the same repository.
 *
 * Exported as the one way a remote is keyed, which the record's identity keys (`remote:`) use too.
 */
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

/** A folder with forward slashes, a lower-case drive letter and no trailing slash. */
function pathKey(said: string): string {
  return said
    .trim()
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, drive: string) => `${drive.toLowerCase()}:`)
    .replace(/\/+$/, '');
}

/** The home folder a working folder is in, as macOS, Linux and Windows place one, or `null` for one in none. */
function homeIn(cwd: string): string | null {
  return /^(?:\/Users\/[^/]+|\/home\/[^/]+|\/root|[a-z]:\/Users\/[^/]+)(?=\/|$)/iu.exec(cwd)?.[0] ?? null;
}

/** Whether `cwd` is `folder` or inside it. Case is ignored on a drive-letter path, as Windows ignores it. */
function under(cwd: string, folder: string): boolean {
  const drive = /^[a-z]:/;
  const [a, b] = drive.test(cwd) && drive.test(folder) ? [cwd.toLowerCase(), folder.toLowerCase()] : [cwd, folder];
  return a === b || a.startsWith(`${b}/`);
}

/** The field of a register that says where its rows apply. `declare` lets a register have one. */
export function scopeFieldOf<F extends { id: string; scope?: ScopeDecl; retired?: boolean }>(fields: readonly F[]): F | undefined {
  return fields.find((f) => f.scope !== undefined && !f.retired);
}

/**
 * Why a token may not make this change to where a row applies, or `null` when it may.
 *
 *   `links: true`      a list of projects gains one and never loses one.
 *   `widen: 'person'`  a create starts in its run's project and an edit starts where the row is. From
 *                      there a token may narrow a global row to a project, and may not move a row out
 *                      of its project, to global or to another project. That move is the owner's.
 *
 * `was` and `is` are row ids, or lists of them for `links`; absent is global. `home` is the run's
 * project. `name` turns a row id into the spoken id a person reads.
 */
export function scopeFault(
  field: { id: string; scope?: ScopeDecl },
  was: Json | undefined,
  is: Json | undefined,
  creating: boolean,
  home: string | null,
  name: (id: string) => string,
): string | null {
  if (field.scope?.links === true) {
    const kept = Array.isArray(is) ? is : [];
    const dropped = (Array.isArray(was) ? was : []).filter((id) => !kept.includes(id));
    return dropped.length === 0
      ? null
      : `An agent may add a project to ${field.id} and never remove one, and this removes ${dropped.map((id) => name(String(id))).join(', ')}. Propose it, and the owner decides.`;
  }
  if (field.scope?.widen !== 'person') return null;
  const from = creating ? home : typeof was === 'string' ? was : null;
  const to = typeof is === 'string' ? is : null;
  if (from === null || from === to) return null;
  if (creating)
    return `This run is in ${name(from)}, so what it adds applies there. Leave ${field.id} out, or propose the other scope.`;
  return `This row applies in ${name(from)}, and an agent may narrow where a row applies but never widen it. Propose the move, and the owner makes it.`;
}
