/**
 * Taking an add-on you published back out of the store, from `/packs/share`.
 *
 * A YANK, NEVER A DELETE. The Kennel keeps every version's file and marks it taken back with the reason, so a record
 * that already installed it keeps working and updates from nothing; what changes is that Browse no longer offers it
 * (`offeredVersion`). The publisher is the key this browser signed with or the person signed in here, and the Kennel
 * holds the yank to whichever published the version.
 *
 * PLAIN NODE LOADS THIS FILE: its values import nothing but the address, and the signing key is handed in.
 */

import type { Signature } from '@braindog/declare/catalogue';

import { KENNEL_AT } from './counts.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Signs the yank of one version, or `null` when this browser holds no key to. */
export type YankSigner = (kind: 'pack', id: string, version: string, reason: string) => Promise<Signature | null>;

export const unpublishWords = {
  heading: 'What you published',
  none: 'Nothing of yours is in the store.',
  version: (v: string): string => `Version ${v}`,
  unpublish: 'Take it out of the store',
  working: 'Taking it out',
  reason: 'Taken back by the person who published it.',
  done: (title: string): string => `${title} is out of the store. Copies already installed keep working.`,
  unreached: 'BrainDog could not reach the store. Try again in a moment.',
  unread: 'The store answered in a way this version of BrainDog does not read.',
} as const;

/** One of your listings: the add-on and the versions the store still offers. */
export type Mine = { id: string; title: string; summary: string; versions: string[]; by: 'key' | 'person' };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The add-ons in the store's index that this browser's key or this person published, with the versions not yet taken
 * back. A listing with every version taken back is not mine to take back again, and is left out.
 */
export function minesOf(doc: unknown, who: { keyId: string | null; personId: string | null }): Mine[] {
  const entries = isMap(doc) && Array.isArray(doc.entries) ? doc.entries : [];
  const out: Mine[] = [];
  for (const e of entries) {
    if (!isMap(e) || e.kind !== 'pack' || typeof e.id !== 'string' || !isMap(e.publisher)) continue;
    const p = e.publisher;
    const yours = (p.kind === 'key' && who.keyId !== null && p.id === who.keyId) || (p.kind === 'person' && who.personId !== null && p.id === who.personId);
    if (!yours) continue;
    const versions = (Array.isArray(e.versions) ? e.versions : []).flatMap((v) => (isMap(v) && typeof v.version === 'string' && v.yanked === undefined ? [v.version] : []));
    if (versions.length === 0) continue;
    out.push({ id: e.id, title: typeof e.title === 'string' && e.title !== '' ? e.title : e.id, summary: typeof e.summary === 'string' ? e.summary : '', versions, by: p.kind === 'key' ? 'key' : 'person' });
  }
  return out;
}

/** The store's index, or `null` when it cannot be read. */
export async function readIndex(fetcher: Fetcher): Promise<unknown> {
  try {
    const res = await fetcher(`${KENNEL_AT}index.json`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The person id out of a `whoami` answer, whichever of the usual names carries it, or `null`. */
export function personOf(value: unknown): string | null {
  if (!isMap(value)) return null;
  for (const k of ['person', 'id']) if (typeof value[k] === 'string' && value[k] !== '') return value[k];
  return isMap(value.principal) && typeof value.principal.id === 'string' ? value.principal.id : null;
}

/** One yank of one version: signed by the key when it has one, as the signed-in person otherwise. */
async function yankOne(fetcher: Fetcher, id: string, version: string, sign: YankSigner): Promise<{ ok: true } | { ok: false; fix: string }> {
  const reason = unpublishWords.reason;
  const signature = await sign('pack', id, version, reason);
  let res: Response;
  try {
    res = await fetcher(`${KENNEL_AT}yank`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ kind: 'pack', id, version, reason, ...(signature === null ? {} : { signature }) }),
    });
  } catch {
    return { ok: false, fix: unpublishWords.unreached };
  }
  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    return { ok: false, fix: res.ok ? unpublishWords.unread : unpublishWords.unreached };
  }
  if (isMap(doc) && doc.ok === true) return { ok: true };
  const fix = isMap(doc) && isMap(doc.refusal) && typeof doc.refusal.fix === 'string' && doc.refusal.fix !== '' ? doc.refusal.fix : unpublishWords.unread;
  return { ok: false, fix };
}

/** Every version the store still offers, taken back one at a time; the first refusal stops it and is said as it was written. */
export async function unpublish(fetcher: Fetcher, mine: Mine, sign: YankSigner): Promise<{ ok: true } | { ok: false; fix: string }> {
  /* ONLY A KEY'S OWN LISTING IS YANKED WITH THE KEY: a person's is held to the person, and a signature by another key is refused. */
  const signer: YankSigner = mine.by === 'key' ? sign : async () => null;
  for (const version of mine.versions) {
    const out = await yankOne(fetcher, mine.id, version, signer);
    if (!out.ok) return out;
  }
  return { ok: true };
}
