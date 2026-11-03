/**
 * An agent's ask to publish an add-on made here to the store (`act publishAddon`, filed as a `pack` question with
 * `{ publish, version, checksum }` by the record's `arrange.ts`), carried out on the owner's yes.
 *
 * THE FILE GOES BEFORE THE YES. Decide reads the add-on's file (`addon {file: true}`), holds it to the version the
 * question showed, and sends it to the store signed by the key this browser keeps (`submitToKennel`, the same path as the
 * Share tile's Submit). Only a file the store took is answered yes, so a refused send leaves the question open with the
 * store's own sentence, and the record holds the yes to the same version (`apply`).
 *
 * PLAIN NODE LOADS THIS FILE: its imports are relative or types.
 */

import { publishedSaid, submitToKennel, type Signer, type Submitted } from './publish.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** What reads the file: `client.call` of `@braindog/client`, or anything shaped like it. */
type Caller = { call: <T>(name: string, args: Record<string, unknown>) => Promise<{ ok: true; value: T } | { ok: false; refusal?: { fix?: string } }> };

/** A question's body that asks to publish an add-on: its id, title and the version it showed. `null` for any other body. */
export function publishAskOf(kind: string, body: unknown): { id: string; title: string; version: string } | null {
  if (kind !== 'pack' || body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.publish !== 'string' || typeof b.version !== 'string') return null;
  return { id: b.publish, title: typeof b.title === 'string' && b.title !== '' ? b.title : b.publish, version: b.version };
}

export const publishAskWords = {
  lead: (title: string, version: string): string => `Publishes ${title} ${version} to the BrainDog store`,
  goes: 'It goes as its setup, never your entries, signed by your key in this browser.',
  review: 'BrainDog reviews it before anybody else can install it.',
  moved: (title: string, version: string, now: string): string => `${title} is at ${now} here now, not the ${version} this asks about. Decline this, and ask again for ${now}.`,
  noFile: 'This BrainDog could not hand the file back, so nothing was sent.',
} as const;

/**
 * Send the file the question showed. `ok` with the sentence to say, or the reason nothing went, in the store's words.
 * `fetcher` and `signer` are the browser's (`kennelFetch`, `browserSigner`) unless a walk hands its own.
 */
export async function publishAsked(
  client: Caller,
  ask: { id: string; title: string; version: string },
  fetcher: Fetcher,
  signer?: Signer,
): Promise<{ ok: true; said: string; value: Submitted } | { ok: false; fix: string }> {
  const read = await client.call<{ file?: unknown }>('addon', { id: ask.id, file: true });
  const file = read.ok && read.value !== null && typeof read.value === 'object' ? read.value.file : undefined;
  if (file === undefined || file === null || typeof file !== 'object') return { ok: false, fix: publishAskWords.noFile };
  const version = (file as { version?: unknown }).version;
  if (version !== ask.version) return { ok: false, fix: publishAskWords.moved(ask.title, ask.version, String(version)) };
  const text = `${JSON.stringify(file, null, 2)}\n`;
  const sent = signer === undefined ? await submitToKennel(fetcher, text) : await submitToKennel(fetcher, text, signer);
  if (!sent.ok) return sent;
  return { ok: true, said: publishedSaid({ ...sent.value, title: ask.title }), value: sent.value };
}
