/**
 * The Inbox's two writes against the record: file an arrival as a row in a list, and archive it.
 *
 * A ROUTE-ONLY MODULE, loaded by the one screen that writes it, like `inbox-live.ts`. ONLY A LIVE SCREEN CALLS THIS: the
 * sample says `notWritten` as it always did.
 *
 * A POST TO `/api/<method>` WITH THE SESSION'S COOKIE, as `actions.ts` sends one, rather than through the client, whose
 * route table is not this screen's to change. The fetch is handed in, so a test drives every branch without a socket.
 *
 * THREE ANSWERS. `written` is the arrival's new state and, when it was filed, the row it became, spoken. `refused` is the
 * record's own sentence. `unreachable` is no answer, or an answer that is not the record's, said calmly.
 */

import { copy } from '../copy.ts';
import { forget } from './boot-live.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type Settled =
  | { from: 'written'; state: 'matched' | 'ignored'; row: string | null }
  | { from: 'refused'; fix: string }
  | { from: 'unreachable'; fix: string };

const unreachable = (): Settled => ({ from: 'unreachable', fix: copy.recordNotReached });

async function post(base: string, method: 'fileArrival' | 'archiveArrival', body: Record<string, unknown>, io: Fetch): Promise<Settled> {
  let res: Response;
  try {
    res = await io(`${base}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body),
    });
  } catch {
    return unreachable();
  }
  /* A 401 CARRIES NO BODY. The session ended, and the sentence says what to do about it. */
  if (res.status === 401) return { from: 'refused', fix: copy.signInAgain };
  const said: unknown = await res.json().catch(() => undefined);
  if (typeof said !== 'object' || said === null || !('ok' in said)) return unreachable();

  if ((said as { ok: unknown }).ok === true) {
    const value = (said as { value?: { state?: unknown; entry?: { register?: unknown; seq?: unknown } | null } }).value;
    const entry = value?.entry;
    /* THE RAIL'S COUNT FOLLOWS the next time the layout reads, rather than holding the number from before. */
    forget();
    return {
      from: 'written',
      state: value?.state === 'ignored' ? 'ignored' : 'matched',
      row: entry && typeof entry.register === 'string' && typeof entry.seq === 'number' ? `${entry.register}#${entry.seq}` : null,
    };
  }
  const refusal = (said as { refusal?: { code?: unknown; fix?: unknown } }).refusal;
  if (refusal?.code === 'UNREACHABLE') return unreachable();
  return { from: 'refused', fix: typeof refusal?.fix === 'string' && refusal.fix !== '' ? refusal.fix : copy.recordNotReached };
}

const fetched: Fetch = (url, init) => fetch(url, init);

/** File one arrival as a row in `register`, titled by its subject. */
export const fileArrival = (base: string, id: string, register: string, io: Fetch = fetched): Promise<Settled> =>
  post(base, 'fileArrival', { id, register }, io);

/** Archive one arrival. Its bytes are kept. */
export const archiveArrival = (base: string, id: string, io: Fetch = fetched): Promise<Settled> =>
  post(base, 'archiveArrival', { id }, io);
