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

/** The card's words (`GoogleConnect.svelte`), each said once. */
export const googleWords = {
  title: 'Google',
  connectTitle: 'Connect Google',
  connected: 'Connected',
  stopped: 'Stopped',
  yourAccount: 'Your Google account',
  lastSync: (ago: string): string => `Last sync ${ago}`,
  firstSync: 'First sync within a few minutes',
  syncNow: 'Sync now',
  syncing: 'Syncing now. New mail, events and contacts arrive within a minute.',
  disconnect: 'Disconnect',
  disconnectAsk: 'Disconnect Google? BrainDog stops reading it and Google forgets the access. What already came in stays.',
  disconnected: 'Google is disconnected. What came in stays.',
  keep: 'Keep it',
  again: 'Connect Google again',
  connect: 'Connect Google',
  failed: 'That did not go through. Try again.',
  needsGmail: 'Mail waits for the Gmail plugin.',
  needsCalendar: 'Events wait for the Calendar plugin.',
  get: 'Get it',
  lead: 'Read only, every 15 minutes, with nothing to paste. Nothing is ever sent, changed or deleted in Google.',
  leadSettings:
    'One Google account, read only, every 15 minutes. A contact is only added when you write to each other, meet, or they are already in BrainDog. Nothing is ever sent, changed or deleted in Google.',
  bringsLabel: 'What comes in',
  notSetUp: 'Connect Google is not set up on this BrainDog yet.',
  ownerOnly: 'The owner of this BrainDog can connect it.',
  scriptAsk: 'Still running the old Apps Script?',
  scriptStop: 'It is not needed now. Run stop in its project at script.google.com, or delete the project.',
} as const;

/**
 * WHAT A SYNC BROUGHT, AS FIGURES: "60 mails, 25 events, 3 people matched, 2 added" read as counts with their words, so
 * the card draws numbers and not a sentence. A count with a verb and no noun ("2 added") takes the noun of the count
 * before it ("People added"). `null` when any part does not read as a count, and the card says the sentence.
 */
export function figuresOf(said: string): { n: string; label: string }[] | null {
  const parts = said
    .replace(/\.$/u, '')
    .split(/, | and /u)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const out: { n: string; label: string }[] = [];
  let noun = '';
  for (const p of parts) {
    const m = /^(\d[\d,]*) ([a-z][a-z ]*)$/iu.exec(p);
    if (!m) return null;
    let words = m[2]!;
    if (/^(?:added|matched|not added)$/iu.test(words) && noun !== '') words = `${noun} ${words}`;
    else noun = words.split(' ')[0]!;
    out.push({ n: m[1]!, label: words.charAt(0).toUpperCase() + words.slice(1) });
  }
  return out.length > 0 ? out : null;
}

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
