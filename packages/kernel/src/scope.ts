/**
 * Where a row applies, and how a run learns which project it is in.
 *
 * TWO SCOPES AND NO THIRD. A row is global, or it belongs to one row of the register that declares `scopes:`, which is
 * the record's list of projects. A project lists its repositories and folders, and a run started in one of them is in
 * that project; a run started anywhere else is global. `resolveProject` only reads: the ladder writes its answer onto
 * the run.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';

/** `scopes:` on a register: which of its fields list a project's repositories, and its folders. */
export type ScopesDecl = { repos?: string; folders?: string };

/** `scope:` on a field. Left out, `widen` is `any`, `same` is `both`, and there are no `links`. */
export type ScopeDecl = { widen?: 'any' | 'person'; same?: 'both' | 'nearer'; links?: true };

/** Where a run says it is: the same three hints the ladder opens a run with. */
export type Whereabouts = { remote?: string | undefined; repo?: string | undefined; cwd?: string | undefined };

export type Resolved = {
  /** The project, or `null` for global. `how` is the rung that placed the run there. */
  project: { id: string; spoken: string; how: 'remote' | 'folder' | 'repo' } | null;
  /** Two or more projects that matched at the same strength, by spoken id, which leaves the run global. */
  ambiguous: string[];
};

type Candidate = { id: string; spoken: string; repos: string[]; folders: string[] };

const GLOBAL: Resolved = { project: null, ambiguous: [] };

/**
 * Which project a run in this place belongs to.
 *
 *   1. The one active register declaring `scopes:` holds the projects. None, and every run is global.
 *   2. A remote equal to a `repos` entry wins.
 *   3. Then a `folders` entry the working folder is in, and the longest such folder.
 *   4. Then a `repos` entry with no slash equal to the repository's folder name.
 *   5. Two projects matching at the same rung, or with folders of the same length, leave the run
 *      global and are named in `ambiguous`, because picking one would file work under a guess.
 *
 * THE PROJECTS ARE READ WHOLE AND MATCHED HERE. A record holds tens of them, and no index answers
 * "is this folder under one of the paths in a list inside a row".
 */
export function resolveProject(
  sql: Sql,
  registers: ReadonlyMap<string, { id: string; seq_prefix?: string; scopes?: ScopesDecl }>,
  where: Whereabouts,
): Resolved {
  const holders = [...registers.values()].filter((r) => r.scopes !== undefined);
  const home = holders.length === 1 ? holders[0] : undefined;
  if (!home?.scopes) return GLOBAL;
  const { repos, folders } = home.scopes;

  const texts = (fields: Record<string, Json>, key: string | undefined): string[] => {
    const held = key === undefined ? undefined : fields[key];
    return Array.isArray(held) ? held.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  };
  const said = home.seq_prefix && home.seq_prefix !== '#' ? home.seq_prefix : `${home.id}#`;
  const projects: Candidate[] = sql
    .all<{ id: string; seq: number; fields: string }>(
      'SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL ORDER BY seq',
      home.id,
    )
    .map((row) => {
      const fields = JSON.parse(row.fields) as Record<string, Json>;
      return { id: row.id, spoken: `${said}${row.seq}`, repos: texts(fields, repos), folders: texts(fields, folders) };
    });
  return matchProject(projects, where);
}

function matchProject(projects: readonly Candidate[], where: Whereabouts): Resolved {
  const settle = (hits: readonly Candidate[], how: 'remote' | 'folder' | 'repo'): Resolved => {
    const [one] = hits;
    return hits.length === 1 && one
      ? { project: { id: one.id, spoken: one.spoken, how }, ambiguous: [] }
      : { project: null, ambiguous: hits.map((h) => h.spoken) };
  };

  const remote = where.remote?.trim() ? remoteKey(where.remote) : '';
  if (remote) {
    const hits = projects.filter((p) => p.repos.some((r) => remoteKey(r) === remote));
    if (hits.length) return settle(hits, 'remote');
  }

  const cwd = where.cwd?.trim() ? pathKey(where.cwd) : '';
  if (cwd) {
    let best = -1;
    let hits: Candidate[] = [];
    for (const p of projects) {
      const longest = Math.max(-1, ...p.folders.map(pathKey).filter((f) => under(cwd, f)).map((f) => f.length));
      if (longest > best) [best, hits] = [longest, [p]];
      else if (longest === best && longest >= 0) hits.push(p);
    }
    if (hits.length) return settle(hits, 'folder');
  }

  /* CASE IS IGNORED, as it is for a drive-letter folder: the name is a folder's name, and Windows
     hands back whatever case the folder was created with. */
  const repo = where.repo?.trim().toLowerCase() ?? '';
  if (repo) {
    const hits = projects.filter((p) => p.repos.some((r) => !r.includes('/') && r.trim().toLowerCase() === repo));
    if (hits.length) return settle(hits, 'repo');
  }

  return GLOBAL;
}

/**
 * A remote as `host/owner/name`: no scheme, no `user@`, no trailing `.git`, and the host lower-cased.
 *
 * `git@github.com:acme/braindog` names its path after the colon. Behind a scheme the colon is a port instead, and a
 * port says nothing about which repository it is.
 */
function remoteKey(said: string): string {
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
  return [host.toLowerCase(), ...rest].filter((part) => part !== '').join('/');
}

/** A folder with forward slashes, a lower-case drive letter and no trailing slash. */
function pathKey(said: string): string {
  return said
    .trim()
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, drive: string) => `${drive.toLowerCase()}:`)
    .replace(/\/+$/, '');
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
