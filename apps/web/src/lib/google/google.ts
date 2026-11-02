/**
 * Connect Google, as the app reads and changes it: `/api/google*` on the Worker (`apps/worker/src/google-connect.ts`).
 *
 * WHAT COMES BACK IS NEVER THE TOKEN. The status says whether a Google account is connected, its address, when it last
 * synced and what it brought, and whether this person may change it. Connecting is a page load to Google and back, so
 * `connectUrl` is an address to go to, not a call.
 */

import { apiBase, here } from '$lib/at.ts';

export type GoogleStatus = {
  on: boolean;
  connected: boolean;
  email?: string;
  since?: string;
  last?: { at: string; said: string; ok: boolean };
  broken?: string;
  mail: boolean;
  events: boolean;
  owner: boolean;
};

async function ask(path: string, method: 'GET' | 'POST'): Promise<GoogleStatus | null> {
  try {
    const answer = await fetch(`${apiBase()}/api/google${path}`, {
      method,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    if (!answer.ok) return null;
    const body = (await answer.json()) as { ok?: boolean; value?: GoogleStatus };
    return body.ok === true && body.value ? body.value : null;
  } catch {
    return null;
  }
}

export const googleStatus = (): Promise<GoogleStatus | null> => ask('', 'GET');
export const googleDisconnect = (): Promise<GoogleStatus | null> => ask('/disconnect', 'POST');
export const googleSyncNow = (): Promise<GoogleStatus | null> => ask('/sync', 'POST');

/** Where Connect Google goes: Google's page, and back to the page it was pressed on. */
export const connectUrl = (): string => `${apiBase()}/api/google/connect?next=${encodeURIComponent(here())}`;

/** What `?google=` on the way back says, in his words. */
export function backLine(said: string | null): { line: string; bad: boolean } | null {
  switch (said) {
    case 'connected':
      return { line: 'Google is connected. Mail, events and contacts arrive within a few minutes.', bad: false };
    case 'cancelled':
      return { line: 'You stopped at Google, so nothing changed.', bad: false };
    case 'scopes':
      return { line: 'Google needs every box ticked to connect: mail, calendar and contacts. Try again and leave them ticked.', bad: true };
    case 'off':
      return { line: 'Connect Google is not set up on this BrainDog yet.', bad: true };
    case 'failed':
      return { line: 'Google did not connect. Try again in a minute.', bad: true };
    default:
      return null;
  }
}
