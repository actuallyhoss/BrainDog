/**
 * The GitHub channel: an add-on installed from `git:owner/repo@ref:path`, pinned to the commit it was read at, and its
 * updates read from the same repository's tags (DESIGN.md 4.2, PHASES.md lane B).
 *
 * PINNED. A branch or a tag moves; a commit does not. So the ref an address names is turned into the commit it points at
 * before the file is read, and the address kept on the add-on (`pack.source_ref`) names that commit, never the ref.
 *
 * UPDATES FROM TAGS ON THAT REPOSITORY ONLY. A semver tag newer than the version held is read at the commit the tag points
 * at, and asked about like any update. Never quiet: nobody reviewed it. No tags, no updates.
 *
 * NOTHING HERE OPENS A SOCKET. Every read goes through the host's `readAddress` (https, no private or local host, a size
 * cap, a timeout, no credentials), the door a pasted address already goes through.
 */

import { fileChecksum, readCatalogueFile } from '@braindog/declare/catalogue';
import { laterVersion } from '@braindog/declare';

export type ReadAddress = (address: string) => Promise<{ ok: true; text: string; bytes: number } | { ok: false; fix: string }>;

/** One `git:` address, in parts. */
export type GitAddress = { owner: string; repo: string; ref: string; path: string };

const GIT = /^git:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_./-]+):([^\s?#]+)$/u;
const SHA = /^[0-9a-f]{40}$/u;

/** The GitHub API and raw file hosts. */
export const GITHUB_API = 'https://api.github.com';
export const GITHUB_RAW = 'https://raw.githubusercontent.com';

export function parseGit(address: string): GitAddress | null {
  const m = GIT.exec(address.trim());
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, ref: m[3]!, path: String(m[4]).replace(/^\/+/u, '') };
}

export const gitAddress = (a: GitAddress, ref: string = a.ref): string => `git:${a.owner}/${a.repo}@${ref}:${a.path}`;

export const rawAddress = (a: GitAddress, ref: string = a.ref): string => `${GITHUB_RAW}/${a.owner}/${a.repo}/${ref}/${a.path}`;

/** The repository as a person reads it, and the short commit. */
export const repoSaid = (a: GitAddress): string => `${a.owner}/${a.repo}`;
export const shortSha = (sha: string): string => sha.slice(0, 7);

const json = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** The commit a ref points at now (`commits/<ref>`), or the sentence saying why it could not be read. A full SHA is its own. */
export async function resolveRef(read: ReadAddress, a: GitAddress): Promise<{ ok: true; sha: string } | { ok: false; fix: string }> {
  if (SHA.test(a.ref)) return { ok: true, sha: a.ref };
  const got = await read(`${GITHUB_API}/repos/${a.owner}/${a.repo}/commits/${encodeURIComponent(a.ref)}`);
  if (!got.ok) return { ok: false, fix: `${a.ref} on ${repoSaid(a)} could not be turned into a commit: ${got.fix}` };
  const sha = (json(got.text) as { sha?: unknown } | null)?.sha;
  if (typeof sha !== 'string' || !SHA.test(sha)) return { ok: false, fix: `GitHub did not say which commit ${a.ref} on ${repoSaid(a)} is.` };
  return { ok: true, sha };
}

/** A git address read at the commit its ref points at: the text, and the address pinned to that commit. */
export type GitRead = { text: string; bytes: number; sha: string; pinned: string; at: GitAddress };

export async function readGit(read: ReadAddress, address: string): Promise<{ ok: true; value: GitRead } | { ok: false; fix: string }> {
  const a = parseGit(address);
  if (a === null) return { ok: false, fix: 'A git address reads git:owner/repo@ref:path, such as git:someone/kit@v1.0.0:kit.pack.json.' };
  const sha = await resolveRef(read, a);
  if (!sha.ok) return sha;
  const got = await read(rawAddress(a, sha.sha));
  if (!got.ok) return got;
  return { ok: true, value: { text: got.text, bytes: got.bytes, sha: sha.sha, pinned: gitAddress(a, sha.sha), at: a } };
}

/** A version from a tag: `v1.2.0` and `1.2.0` both read 1.2.0; anything else is not a release. */
export const tagVersion = (tag: string): string | null => {
  const m = /^v?(\d+\.\d+\.\d+)$/u.exec(tag.trim());
  return m ? m[1]! : null;
};

/** One newer version found on the repository an add-on came from. */
export type GitOffer = {
  id: string;
  title: string;
  from: string;
  to: string;
  tag: string;
  sha: string;
  /** The address at the tag, as an agent or a person would write it. */
  tagged: string;
  /** The address pinned to the tag's commit, kept on the add-on once it is in. */
  pinned: string;
  /** The file's checksum (`fileChecksum`), which the question shows and the yes is held to. */
  checksum: string;
  doc: Record<string, unknown>;
};

/** What reading one add-on's repository found: a newer version, nothing newer, or why it could not be read. */
export type GitLook = { id: string; offer: GitOffer | null; note: string | null };

/**
 * The newest semver tag above the version held, read at its commit and held to the add-on it updates: the same pack id,
 * the tag's version. One answer an add-on; a repository that cannot be read says why and offers nothing.
 */
export async function gitLook(read: ReadAddress, held: { id: string; version: string; source_ref: string }): Promise<GitLook> {
  const a = parseGit(held.source_ref);
  if (a === null) return { id: held.id, offer: null, note: null };
  const listed = await read(`${GITHUB_API}/repos/${a.owner}/${a.repo}/tags?per_page=100`);
  if (!listed.ok) return { id: held.id, offer: null, note: `The tags on ${repoSaid(a)} could not be read: ${listed.fix}` };
  const tags = json(listed.text);
  if (!Array.isArray(tags)) return { id: held.id, offer: null, note: `GitHub did not list the tags on ${repoSaid(a)}.` };
  let best: { tag: string; version: string; sha: string } | null = null;
  for (const t of tags as { name?: unknown; commit?: { sha?: unknown } }[]) {
    const name = typeof t?.name === 'string' ? t.name : '';
    const version = tagVersion(name);
    const sha = t?.commit?.sha;
    if (version === null || typeof sha !== 'string' || !SHA.test(sha)) continue;
    if (version === held.version || laterVersion(version, held.version) !== version) continue;
    if (best === null || laterVersion(version, best.version) === version) best = { tag: name, version, sha };
  }
  if (best === null) return { id: held.id, offer: null, note: null };
  const got = await read(rawAddress(a, best.sha));
  if (!got.ok) return { id: held.id, offer: null, note: `${repoSaid(a)} ${best.tag} could not be read: ${got.fix}` };
  const pinned = gitAddress(a, best.sha);
  const file = await readCatalogueFile(got.text, { kind: 'git', ref: pinned });
  if (!file.ok) return { id: held.id, offer: null, note: `${repoSaid(a)} ${best.tag} is not a plugin file that reads: ${'refusal' in file ? file.refusal.fix : 'it did not read'}` };
  if (file.value.kind !== 'pack') return { id: held.id, offer: null, note: `${repoSaid(a)} ${best.tag} is a use case, not the plugin ${held.id}.` };
  const f = file.value.file;
  if (f.pack.manifest.pack !== held.id)
    return { id: held.id, offer: null, note: `${repoSaid(a)} ${best.tag} holds ${f.pack.manifest.pack}, not ${held.id}, so it is not offered as its update.` };
  if (f.pack.manifest.version !== best.version)
    return { id: held.id, offer: null, note: `${repoSaid(a)} ${best.tag} holds version ${f.pack.manifest.version}, not ${best.version}, so it is not offered.` };
  return {
    id: held.id,
    offer: {
      id: held.id,
      title: f.title,
      from: held.version,
      to: best.version,
      tag: best.tag,
      sha: best.sha,
      tagged: gitAddress(a, best.tag),
      pinned,
      checksum: await fileChecksum(got.text),
      doc: f.doc as Record<string, unknown>,
    },
    note: null,
  };
}

/** The one warning a GitHub add-on carries wherever it is shown. */
export const GIT_UNREVIEWED = 'Not reviewed by BrainDog. Anyone can publish on GitHub. It can only do what is listed below.';
