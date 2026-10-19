/**
 * The first project, formed from the first agent session (batch 106, "The first five minutes"). A record with no
 * project yet and an agent that arrives from a repository or folder no project holds: the record forms that project
 * as a draft the person keeps with one press (DIRECTION d2), from only what the session itself said.
 *
 * Pure: what name, what fields. Whether to form one, and the write, are the kernel's (`index.ts`).
 */

import type { Json } from './coerce.ts';
import type { SessionHints } from './session.ts';
import { remoteKey } from './scope.ts';

/** The field a projects list declares to mark a row the record formed and the person has not yet kept. */
export const DRAFT_FIELD = 'draft';

/** The last piece of a path or remote, without a trailing slash or `.git`; empty when there is none. */
function lastPiece(said: string): string {
  const parts = said.trim().replace(/[\\/]+$/u, '').replace(/\.git$/iu, '').split(/[\\/:]/u).filter((p) => p !== '');
  return parts[parts.length - 1] ?? '';
}

/** A folder that is nobody's project: home, the root, a scratch folder. A name made from it would be a guess. */
const SCRATCH = /^(?:users|home|tmp|temp|var|private|desktop|documents|downloads|developer|code|repos|src|projects)$/iu;

/**
 * "my-app" -> "My app", "brain_dog" -> "Brain dog": separators become spaces and only the first letter is raised, so a
 * name already written with its own capitals ("BrainDog") is left as it was.
 */
export function cleanName(raw: string): string {
  const words = raw.replace(/[-_.]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The name a first project takes: the repository's, else the remote's, else the working folder's. `null` when none says anything usable. */
export function firstProjectName(hints: Pick<SessionHints, 'repo' | 'remote' | 'cwd'>): string | null {
  const candidates = [hints.repo ?? '', hints.remote ? remoteKey(hints.remote) : '', hints.cwd ?? ''];
  for (const c of candidates) {
    const piece = lastPiece(c);
    if (piece !== '' && !SCRATCH.test(piece) && !/^[A-Za-z]:?$/u.test(piece)) return cleanName(piece);
  }
  return null;
}

/**
 * The fields of the draft project. `has` is what the list declares, so a version of the list without a field simply
 * leaves it out. `about` is the session's `doing`, when the agent said one; lane is "building".
 */
export function firstProjectFields(
  hints: Pick<SessionHints, 'repo' | 'remote' | 'cwd' | 'doing'>,
  name: string,
  has: (field: string) => boolean,
): Record<string, Json> {
  const out: Record<string, Json> = { name, lane: 'building' };
  const put = (field: string, value: Json) => {
    if (has(field)) out[field] = value;
  };
  const doing = hints.doing?.trim();
  if (doing) put('about', doing);
  if (hints.remote?.trim()) put('repos', [hints.remote.trim()]);
  else if (hints.repo?.trim()) put('repos', [hints.repo.trim()]);
  if (hints.cwd?.trim()) put('folders', [hints.cwd.trim()]);
  put(DRAFT_FIELD, true);
  return out;
}
