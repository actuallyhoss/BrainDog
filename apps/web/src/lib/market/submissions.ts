/**
 * What you published, as the store tells you: each submission waiting for review, listed, declined with the operator's
 * reason, or taken back, and the version a fix goes out as.
 *
 * ASKED OF THE STORE, NOT READ FROM ITS INDEX. A waiting or declined submission is in no public file, so the store
 * answers `POST mine` to the person signed in here, to the key this browser signs with, or both, and tells nobody
 * else's. A key proves itself by signing the ask as it signs a yank (`MINE_ASKED` in the declare package).
 *
 * PLAIN NODE LOADS THIS FILE: its one value import is relative, and the signing key is handed in.
 */

import type { Signature } from '@braindog/declare/catalogue';

import { KENNEL_AT } from './counts.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Signs the ask for this publisher's own submissions, or `null` when this browser holds no key. */
export type MineSigner = () => Promise<Signature | null>;

export type State = 'waiting' | 'listed' | 'declined' | 'unpublished';

/** One submission as the store tells it. */
export type Submission = { id: string; title: string; version: string; state: State; reason: string | null; at: string };

export const stateWords = {
  heading: 'What you published',
  none: 'Nothing of yours is in the store.',
  waiting: 'Waiting for review',
  listed: 'In the store',
  declined: 'Declined',
  unpublished: 'Taken out of the store',
  version: (v: string): string => `Version ${v}`,
  why: (reason: string): string => `Reason given: ${reason}`,
  noReason: 'No reason was given.',
  fix: 'Fix it and send it again',
  update: 'Publish an update',
  unreached: 'BrainDog could not reach the store. Try again in a moment.',
  unread: 'The store answered in a way this version of BrainDog does not read.',
  /* THE FORM, WHEN IT IS FOR A FIX OR AN UPDATE. */
  sendingAs: (title: string, version: string): string => `Sending ${title} again as version ${version}`,
  changes: 'What changed',
  changesHint: 'A line or two, shown to anyone who installed it when they are offered the update.',
  startOver: 'Start a new plugin instead',
} as const;

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The store's answer read into rows this build knows; a row it does not understand is left out. */
export function submissionsOf(doc: unknown): Submission[] | null {
  if (!isMap(doc) || doc.ok !== true || !isMap(doc.value) || !Array.isArray(doc.value.rows)) return null;
  const out: Submission[] = [];
  for (const r of doc.value.rows) {
    if (!isMap(r) || r.kind !== 'pack' || typeof r.id !== 'string' || typeof r.version !== 'string') continue;
    if (r.state !== 'waiting' && r.state !== 'listed' && r.state !== 'declined' && r.state !== 'unpublished') continue;
    out.push({
      id: r.id,
      title: typeof r.title === 'string' && r.title !== '' ? r.title : r.id,
      version: r.version,
      state: r.state,
      reason: typeof r.reason === 'string' && r.reason.trim() !== '' ? r.reason.trim() : null,
      at: typeof r.at === 'string' ? r.at : '',
    });
  }
  return out;
}

/** Your submissions, or `null` when the store cannot be reached or answers nothing this build reads. */
export async function readSubmissions(fetcher: Fetcher, sign: MineSigner): Promise<Submission[] | null> {
  let signature: Signature | null = null;
  try {
    signature = await sign();
  } catch {
    signature = null;
  }
  try {
    const res = await fetcher(`${KENNEL_AT}mine`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(signature === null ? {} : { signature }),
    });
    return submissionsOf(await res.json());
  } catch {
    return null;
  }
}

/** The line a row says under its title: its state, and for a decline or a take-back the reason. */
export function stateLine(s: Pick<Submission, 'state' | 'reason'>): string {
  if (s.state === 'declined') return `${stateWords.declined}. ${s.reason === null ? stateWords.noReason : stateWords.why(s.reason)}`;
  if (s.state === 'unpublished') return s.reason === null ? stateWords.unpublished : `${stateWords.unpublished}. ${s.reason}`;
  return stateWords[s.state];
}

const partsOf = (v: string): [number, number, number] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/u.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const later = (a: [number, number, number], b: [number, number, number]): boolean => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0;

/**
 * The version a fix or an update goes out as: a patch after the newest version of this add-on in any state, so it is
 * later than what is listed (the store refuses a number not later) and never one already sent.
 */
export function versionAfter(rows: readonly Pick<Submission, 'id' | 'version'>[], id: string): string {
  let newest: [number, number, number] | null = null;
  for (const r of rows) {
    const p = r.id === id ? partsOf(r.version) : null;
    if (p !== null && (newest === null || later(p, newest))) newest = p;
  }
  return newest === null ? '1.0.0' : `${newest[0]}.${newest[1]}.${newest[2] + 1}`;
}
