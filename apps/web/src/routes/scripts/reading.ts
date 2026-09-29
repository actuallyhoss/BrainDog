/**
 * What `/scripts` says about its scripts: the title row's sentence, each script's recent runs as a chart and the line
 * under it, and the outcome dot each run wears (SYSTEM §6, §7).
 *
 * EVERY FIGURE IS ONE THE RECORD SENT. The month's runs are each row's own `month` count, summed and never recounted
 * from history; a script's recent runs are the ones `readScripts` found in the history it walked, and the line under
 * them says "recent", because that is all they are.
 *
 * PURE, so `node --test` holds it without a component in sight.
 */

import type { Script } from '../../lib/record/scripts.ts';

/** A sentence in pieces: `needs` is a phrase in red. */
export type Said = { text: string; tone?: 'needs' | undefined }[];

const count = (n: number): string => n.toLocaleString('en-GB');

/**
 * "3 scripts, 41 runs this month; 1 is paused, and FX rate was refused on its last run."
 *
 * RED FOR WHAT HAS STOPPED OR IS STOPPING: a paused script runs no more until he resumes it, and a refused last run is
 * one refusal nearer to pausing. A paused script's own refusals are the pause, so they are not said twice.
 */
export function sentenceOf(rows: readonly Pick<Script, 'title' | 'status' | 'last' | 'month'>[]): Said | null {
  if (rows.length === 0) return null;
  const runs = rows.reduce((s, r) => s + r.month.runs, 0);
  const lead = `${rows.length === 1 ? '1 script' : `${count(rows.length)} scripts`}, ${runs === 0 ? 'no runs' : runs === 1 ? '1 run' : `${count(runs)} runs`} this month`;
  const paused = rows.filter((r) => r.status === 'paused').length;
  const refused = rows.filter((r) => r.status !== 'paused' && r.last?.outcome === 'refused');

  const out: Said = [{ text: lead }];
  const problems: Said = [];
  if (paused > 0) problems.push({ text: `${count(paused)} ${paused === 1 ? 'is' : 'are'} paused`, tone: 'needs' });
  if (refused.length === 1) problems.push({ text: `${refused[0]?.title ?? ''} was refused on its last run`, tone: 'needs' });
  else if (refused.length > 1) problems.push({ text: `${count(refused.length)} were refused on their last run`, tone: 'needs' });
  if (problems.length === 0) return [...out, { text: '.' }];
  const [first, second] = problems;
  if (first) out.push({ text: '; ' }, first);
  if (second) out.push({ text: ', and ' }, second);
  return [...out, { text: '.' }];
}

/** The sentence as plain words, for a test or a title. */
export const plain = (said: Said): string => said.map((p) => p.text).join('');

/** How a run's outcome is drawn: done in ink, refused or failed in red, held in amber, dropped quiet. */
export function toneOf(outcome: string): 'done' | 'bad' | 'warn' | 'quiet' {
  if (outcome === 'ok') return 'done';
  if (outcome === 'refused' || outcome === 'failed') return 'bad';
  if (outcome === 'held') return 'warn';
  return 'quiet';
}

/**
 * A script's recent runs as its chart shows them, one cell a run and the ones that went through filled, and the line
 * under it. `null` when the history held no run of it, and then there is no chart.
 */
export function recentOf(s: Pick<Script, 'recent'>): { total: number; ok: number; said: string } | null {
  const total = s.recent.length;
  if (total === 0) return null;
  const ok = s.recent.filter((r) => r.outcome === 'ok').length;
  const refused = s.recent.filter((r) => r.outcome === 'refused' || r.outcome === 'failed').length;
  const lead = total === 1 ? (ok === 1 ? 'Its one recent run went through' : 'Its one recent run did not go through') : ok === total ? `All ${total} recent runs went through` : `${ok} of the last ${total} runs went through`;
  const tail = total > 1 && refused > 0 && ok < total ? `; ${refused === 1 ? '1 was' : `${refused} were`} refused` : '';
  return { total, ok, said: `${lead}${tail}.` };
}

export const words = {
  recentSubject: 'Recent runs that went through',
  edit: 'Edit',
  editOne: (title: string) => `Edit ${title}`,
};
