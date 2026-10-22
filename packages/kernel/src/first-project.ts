/**
 * The first project, formed from the first agent session (batch 106, "The first five minutes"). A record with no
 * project yet and an agent that arrives from a repository or folder no project holds: the record forms that project
 * as a draft the person keeps with one press, from only what the session itself said.
 *
 * Pure: what name, what fields. Whether to form one, and the write, are the kernel's (`index.ts`).
 *
 * AN AGENT WITH NO FOLDER NAMES IT BY WHAT THE PERSON IS WORKING ON. Claude.ai and ChatGPT send no repository, remote or
 * folder, so the `topic` their first `context` call says is the only name there is. It forms the first project the
 * same way, as a draft, and on a record that already has projects it only ever finds one by that name.
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

/**
 * The name a first project takes: the repository's, else the remote's, else the working folder's, else, for a session
 * that says nothing of where it is, its `topic`. `null` when none says anything usable.
 */
export function firstProjectName(hints: Pick<SessionHints, 'repo' | 'remote' | 'cwd' | 'topic'>): string | null {
  const candidates = [hints.repo ?? '', hints.remote ? remoteKey(hints.remote) : '', hints.cwd ?? ''];
  for (const c of candidates) {
    const piece = lastPiece(c);
    if (piece !== '' && !SCRATCH.test(piece) && !/^[A-Za-z]:?$/u.test(piece)) return cleanName(piece);
  }
  return noPlace(hints) ? topicName(hints.topic) : null;
}

/**
 * Whether a session says nothing of where it is: no repository, remote or folder. Claude.ai, ChatGPT and any remote MCP
 * client have none, so what they are working on is the one thing that can name their project.
 */
export function noPlace(hints: Pick<SessionHints, 'repo' | 'remote' | 'cwd'>): boolean {
  return (hints.repo ?? '').trim() === '' && (hints.remote ?? '').trim() === '' && (hints.cwd ?? '').trim() === '';
}

/** The longest topic that is still a name. A sentence is what somebody is doing, not what their project is called. */
export const TOPIC_MAX = 60;

/** Answers that name nothing, given when an agent is asked what the person is working on and nobody said. */
const VAGUE = /^(?:nothing|none|n\/?a|general|misc(?:ellaneous)?|stuff|things|chat(?:ting)?|help|test(?:ing)?|unknown|idk|anything|everything|work|project)$/iu;

/**
 * The name a topic makes: its spaces closed up, quotes and a closing stop taken off, and only its first letter raised,
 * so "kiln works" is "Kiln works" and "BrainDog" stays as written. `null` when it is empty, longer than `TOPIC_MAX`, or
 * one of the answers that name nothing.
 */
export function topicName(topic: string | undefined): string | null {
  const said = (topic ?? '').replace(/\s+/gu, ' ').trim().replace(/^["'`]+|["'`.!?]+$/gu, '').trim();
  if (said === '' || [...said].length > TOPIC_MAX || VAGUE.test(said)) return null;
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/**
 * The fields of the draft project. `has` is what the list declares, so a version of the list without a field simply
 * leaves it out. `about` is the session's `doing`, when the agent said one; lane is "building".
 */
export function firstProjectFields(
  hints: Pick<SessionHints, 'repo' | 'remote' | 'cwd' | 'doing' | 'topic'>,
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

/** Folders that are nobody's project even inside a repository: another session's worktree, a scratch copy, a temp folder. */
const NOBODYS = /(?:^|[\\/])(?:\.claude[\\/]worktrees|tmp|temp|scratch|var[\\/]folders|private[\\/]tmp)(?:[\\/]|$)|(?:^|[\\/])wt-[^\\/]*|-wt(?:[\\/]|$)/iu;

/** Home itself: `/Users/sam`, `/home/sam`, `C:\Users\sam`. A session opened there is in no project. */
const HOME = /^(?:\/(?:Users|home)\/[^\\/]+|[A-Za-z]:[\\/]Users[\\/][^\\/]+)[\\/]?$/u;

/** Whether a session's place can never become a project: home, /tmp, scratch, or a worktree of another session. */
export function nobodysPlace(hints: Pick<SessionHints, 'repo' | 'cwd'>): boolean {
  const cwd = (hints.cwd ?? '').trim();
  const repo = (hints.repo ?? '').trim();
  return HOME.test(cwd) || NOBODYS.test(cwd) || /^wt-/iu.test(repo) || /-wt$/iu.test(repo);
}

/**
 * Whether a later session from a place that no project holds should form a draft: the place can be a project at all,
 * and a session from the same repository was seen before (one-off folders never spawn projects). `earlier` is how many
 * sessions the record already holds from that same repository or remote.
 */
export function formsOnRepeat(hints: Pick<SessionHints, 'repo' | 'remote' | 'cwd'>, earlier: number): boolean {
  if (nobodysPlace(hints)) return false;
  if ((hints.repo ?? '').trim() === '' && (hints.remote ?? '').trim() === '') return false;
  return earlier >= 1;
}
