/**
 * The Inbox's three writes against the record: file an arrival as a row in a list, archive it, and put either back.
 *
 * PUT BACK GOES THROUGH `triage`, THE ONE DOOR AN AGENT FILES BY TOO, with `back: true` over the kernel's
 * `returnArrival`: there is no second verb for it, so what a person takes back here and what an
 * agent takes back are the same write.
 *
 * A ROUTE-ONLY MODULE, loaded by the one screen that writes it, like `inbox-live.ts`. ONLY A LIVE SCREEN CALLS THIS, and
 * since the sample left the app every Inbox is a live one: there is no drawn Inbox left to
 * answer a press with a sentence instead of a write.
 *
 * A POST TO `/api/<method>` WITH THE SESSION'S COOKIE, as `actions.ts` sends one, rather than through the client, whose
 * route table is not this screen's to change. The fetch is handed in, so a test drives every branch without a socket.
 *
 * THREE ANSWERS. `written` is the arrival's new state and, when it was filed, the row it became, spoken. `refused` is the
 * record's own sentence. `unreachable` is no answer, or an answer that is not the record's, said calmly.
 */

import { copy } from '../copy.ts';
import { wroteOutside } from '@braindog/client';
import { forget } from './boot-live.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * `written`'s `state` is where the arrival is now: filed, archived, or back among what waits. `version` is the filed
 * row's, present when the record sent it, so the same press can be put back at the version it made.
 */
export type Settled =
  | { from: 'written'; state: 'matched' | 'ignored' | 'untriaged' | 'review'; row: string | null; version?: number }
  | { from: 'refused'; fix: string }
  | { from: 'unreachable'; fix: string };

const unreachable = (): Settled => ({ from: 'unreachable', fix: copy.recordNotReached });

const STATES = ['matched', 'ignored', 'untriaged', 'review'] as const;

async function post(base: string, method: 'fileArrival' | 'archiveArrival' | 'triage' | 'fileAsSecond', body: Record<string, unknown>, io: Fetch): Promise<Settled> {
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
  /* A WRITE PAST THE CLIENT: the reads it kept go (`wroteOutside`). */
  wroteOutside();
  /* A 401 CARRIES NO BODY. The session ended, and the sentence says what to do about it. */
  if (res.status === 401) return { from: 'refused', fix: copy.signInAgain };
  const said: unknown = await res.json().catch(() => undefined);
  if (typeof said !== 'object' || said === null || !('ok' in said)) return unreachable();

  if ((said as { ok: unknown }).ok === true) {
    const value = (said as { value?: { state?: unknown; reason?: unknown; entry?: { register?: unknown; seq?: unknown; version?: unknown } | null } }).value;
    const entry = value?.entry;
    /* THE RAIL'S COUNT FOLLOWS the next time the layout reads, rather than holding the number from before. */
    forget();
    /* HELD AGAIN IS NOT FILED. `fileAsSecond` runs the pattern again with only its repeat check set aside, so another of
       its skips can still hold the message, and then nothing was filed: the record's reason is said, as a refusal is. */
    if (value?.state === 'skipped')
      return { from: 'refused', fix: typeof value.reason === 'string' && value.reason !== '' ? value.reason : 'It was held again, so nothing was filed.' };
    /* A PROPOSED ONE WAITS, as one in review does: `fileAsSecond` answers the kernel's own states, and a second one whose
       pattern only proposes is waiting on a person, not filed. */
    const state = value?.state === 'proposed' ? 'review' : (STATES.find((s) => s === value?.state) ?? 'matched');
    return {
      from: 'written',
      state,
      row: entry && typeof entry.register === 'string' && typeof entry.seq === 'number' ? `${entry.register}#${entry.seq}` : null,
      /* ONLY A FILING'S ROW IS PUT BACK AT A VERSION. The row a put back archived is the one it took away, not one to
         take back again. */
      ...(state === 'matched' && typeof entry?.version === 'number' ? { version: entry.version } : {}),
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

/**
 * File a message skipped as a repeat after all, as a second one beside the row it looked like: "It is a second
 * one". The record runs it again with its pattern's repeat check off for this one run, so the answer is where it went,
 * filed or waiting. The record refuses a message not skipped, or skipped by a rule rather than marked as a repeat.
 */
export const fileAsSecond = (base: string, id: string, io: Fetch = fetched): Promise<Settled> =>
  post(base, 'fileAsSecond', { id }, io);

/** Archive one arrival. Its bytes are kept. */
export const archiveArrival = (base: string, id: string, io: Fetch = fetched): Promise<Settled> =>
  post(base, 'archiveArrival', { id }, io);

/**
 * Put a filed or archived arrival back in the inbox. A filed one names its row's `version`, the one read, and the row is
 * archived with the note "Put back in the inbox."; a row edited since is the record's conflict, and nothing moves.
 */
export const putBack = (base: string, id: string, version: number | null, io: Fetch = fetched): Promise<Settled> =>
  post(base, 'triage', { arrival: id, back: true, ...(version === null ? {} : { version }) }, io);
