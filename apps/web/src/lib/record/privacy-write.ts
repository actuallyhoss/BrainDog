/**
 * Keep a row to its maker, or share it with the record again: the one write behind the row menu's "Private to me".
 *
 * A POST TO `/api/makePrivate` WITH THE SESSION'S COOKIE, as `inbox-write.ts` sends one. The record refuses anybody but the
 * row's maker, so the menu showing the verb only to the maker (`Entry.mine`) is a courtesy and not the lock. The fetch is
 * handed in, so a test drives every branch without a socket.
 */

import { copy } from '../copy.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type Kept = { ok: true; private: boolean } | { ok: false; fix: string };

export async function keepPrivate(base: string, ref: string, on: boolean, io: Fetch = fetch): Promise<Kept> {
  let res: Response;
  try {
    res = await io(`${base}/api/makePrivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ ref, on }),
    });
  } catch {
    return { ok: false, fix: copy.rowPrivateNotDone };
  }
  const said: unknown = await res.json().catch(() => undefined);
  if (typeof said !== 'object' || said === null || !('ok' in said)) return { ok: false, fix: copy.rowPrivateNotDone };
  if ((said as { ok: unknown }).ok === true) return { ok: true, private: on };
  const fix = (said as { refusal?: { fix?: unknown } }).refusal?.fix;
  return { ok: false, fix: typeof fix === 'string' && fix !== '' ? fix : copy.rowPrivateNotDone };
}
