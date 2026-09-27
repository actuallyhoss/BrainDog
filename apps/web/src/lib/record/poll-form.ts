/**
 * What the poll form on an organisation's page files: one address, how often, the key if the address needs one, and
 * which number in its answer is which measure (`lib/page/panels/PollForm.svelte`).
 *
 * THE FORM FILES A PROPOSAL AND INSTALLS NOTHING. A poll calls out on a clock, so the pack it makes goes in front of
 * the owner on Decide, where the host and the interval are printed and approved once (`founder-poll.ts`). The record
 * checks the declaration again when the proposal is filed; this file only catches what a person would want told
 * before pressing the button, in the same words.
 */

import { pollPack, type PolledMeasure } from '@braindog/seed/usecases/founder-poll';

import { copy } from '../copy.ts';

/** How often, as the form offers it. The record's floor is fifteen minutes. */
export const POLL_EVERY = ['15m', '1h', '6h', '1d'] as const;
export type PollEvery = (typeof POLL_EVERY)[number];

/** One row of the form: where the number is, what it is called, and its unit. */
export type PollRow = { path: string; name: string; unit: string };

export type PollDraft = { url: string; every: PollEvery; grant: string; rows: PollRow[] };

/** The most measures one poll fills, the record's `POLL_MAPS_MOST`. */
export const POLL_ROWS_MOST = 20;

const PATH = /^(?:[A-Za-z0-9_-]+|\[-?\d*\])(?:\.[A-Za-z0-9_-]+|\[-?\d*\])*$/u;

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The pack's id, from the organisation and the host: `poll-northwind-stats-northwind-example`, kept short. */
export function pollIdOf(title: string, url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  return (slug(`${title} ${host}`).slice(0, 40).replace(/-+$/g, '') || 'numbers');
}

/** What is wrong with the draft, by the field it is about, or `null` when it can be filed. */
export function pollFault(d: PollDraft): { at: 'url' | 'rows' | 'grant'; fix: string } | null {
  let url: URL | null = null;
  try {
    url = new URL(d.url.trim());
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:') return { at: 'url', fix: copy.pollFaultUrl };
  if (d.grant.trim().length > 40) return { at: 'grant', fix: copy.pollFaultKey };
  const rows = d.rows.filter((r) => r.path.trim() !== '' || r.name.trim() !== '');
  if (rows.length === 0) return { at: 'rows', fix: copy.pollFaultNone };
  if (rows.length > POLL_ROWS_MOST) return { at: 'rows', fix: copy.pollFaultMost(POLL_ROWS_MOST) };
  const bad = rows.find((r) => !PATH.test(r.path.trim()) || r.name.trim() === '');
  if (bad)
    return bad.name.trim() === ''
      ? { at: 'rows', fix: copy.pollFaultName(bad.path.trim()) }
      : { at: 'rows', fix: copy.pollFaultPath(bad.path.trim()) };
  return null;
}

/** The proposal the form files for an organisation: a pack installing one poll of the address. */
export function pollProposal(d: PollDraft, org: { title: string; seq: number }) {
  const measures: PolledMeasure[] = d.rows
    .filter((r) => r.path.trim() !== '' && r.name.trim() !== '')
    .map((r) => ({ name: r.name.trim(), path: r.path.trim(), ...(r.unit.trim() === '' ? {} : { unit: r.unit.trim() }) }));
  const url = d.url.trim();
  const grant = d.grant.trim();
  const doc = pollPack({
    id: pollIdOf(org.title, url),
    url,
    every: d.every,
    ...(grant === '' ? {} : { grant }),
    organisation: `organisations#${org.seq}`,
    measures,
  });
  return {
    question: copy.pollQuestion(new URL(url).host, copy.pollEveryLabels[d.every] ?? d.every, org.title, measures.map((m) => m.name).join(', ')),
    body_kind: 'pack' as const,
    body: { install: String(doc.pack), doc },
  };
}
