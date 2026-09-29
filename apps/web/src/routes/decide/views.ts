/**
 * THE TWO LISTS UNDER THE QUEUE: what was put off and when it comes back, and how the calls with a prediction went.
 *
 * NO NEW METHOD, BECAUSE THE RECORD ALREADY SAYS BOTH. `governance` hands every suggestion with its
 * `defer_until` and `defer_why` once it is asked for `status: 'all'`, and a deferred question is one still open whose
 * day has not come, which is exactly the one the default `open` read leaves out (`kernel/src/govern.ts`,
 * `listGovernance`). A prediction row carries `met`, `scored_at` and `score_at` as the scorer left them.
 *
 * PLAIN TYPESCRIPT WITH RELATIVE IMPORTS, so a test can load it in Node the way it loads `grouping.ts`, and the clock
 * is an argument rather than a read of `Date.now()`, so a test can say what day it is.
 */

import { day, relative } from 'braindog-render';
import { everyGovernance, governancePage, type Governor, type Read } from '../../lib/record/governance.ts';
import { moneyInText } from '../../lib/record/money.ts';
import { copy } from '../../lib/copy.ts';

type Row = Record<string, unknown>;

/** A question put off: what it asks, the day it comes back and the reason it was put off, when one was given. */
export type Later = { id: string; title: string; until: string; why: string };

/**
 * A call with a prediction. `went` is `met` or `missed` once the scorer has read it, `unread` when it looked and could
 * not tell, and `due` while its day has not come. `about` is the question it was a prediction for, when it names one.
 */
export type Call = { id: string; claim: string; went: 'met' | 'missed' | 'unread' | 'due'; at: string; about: string | null };

export type Views = { later: Later[]; calls: Call[] };

/** How many predictions Decide reads: the newest page is the calls somebody still remembers making. */
export const CALLS_READ = 50;

/* THE SCREEN'S OWN WORDS, beside the only code that says them, until the Decide area has a copy file of its own. */
export const WORDS = {
  later: 'Coming back to you',
  calls: 'How the calls went',
  ask: 'Ask yourself a question',
  back: (when: string) => `Comes back ${when}`,
  met: 'Came true',
  missed: 'Did not come true',
  unread: 'Could not be checked',
  due: (when: string) => `Checked ${when}`,
  checked: (when: string) => `checked ${when}`,
} as const;

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/* A SUGGESTION ID IS `SG<n>`, and a prediction written for a change with no declaration names the question itself. A
   declaration id names no question, so it is not a link. */
const QUESTION = /^(SG\d+|q\.[0-9A-Z]+)$/u;

/**
 * A DAY SAID THE WAY THE REST OF THE PRODUCT SAYS ONE: relative inside a week ("in 3 days", "today"), then the day and
 * month, then the year as well once it is another year. "on" leads a date so a sentence reads whole.
 */
export function dayWord(iso: string, now: number): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(d)) return '';
  const days = Math.abs(Date.parse(`${d}T12:00:00Z`) - now) / 86_400_000;
  if (days < 7) return relative(d, now);
  const said = day(d);
  const year = String(new Date(now).getUTCFullYear());
  return `on ${said.endsWith(` ${year}`) ? said.slice(0, -year.length - 1) : said}`;
}

/** The questions still open whose day has not come, the soonest first. */
export function laterOf(rows: readonly Row[], now: number): Later[] {
  const today = new Date(now).toISOString();
  return rows
    .filter((r) => r.status === 'open' && typeof r.defer_until === 'string' && r.defer_until > today)
    .map((r) => {
      const id = String(r.id);
      return { id, title: moneyInText(text(r.question).trim()) || id, until: text(r.defer_until), why: text(r.defer_why).trim() };
    })
    .sort((a, b) => a.until.localeCompare(b.until) || a.id.localeCompare(b.id));
}

/* THE SCORER WRITES `met` AS SQLITE KEEPS A BOOLEAN, a one or a zero, and a host that parses it hands back `true` or
   `false`; both are read. A row scored with neither is one the scorer could not read. */
function wentOf(r: Row): Call['went'] {
  if (r.met === 1 || r.met === true) return 'met';
  if (r.met === 0 || r.met === false) return 'missed';
  return typeof r.scored_at === 'string' && r.scored_at !== '' ? 'unread' : 'due';
}

/** The predictions, the ones already read first and newest first, then the ones still to come, soonest first. */
export function callsOf(rows: readonly Row[]): Call[] {
  const calls = rows.map((r): Call => {
    const went = wentOf(r);
    const about = text(r.for_decl);
    return {
      id: String(r.id),
      claim: moneyInText(text(r.claim).trim()),
      went,
      at: went === 'due' ? text(r.score_at) : text(r.scored_at),
      about: QUESTION.test(about) ? about : null,
    };
  });
  const done = calls.filter((c) => c.went !== 'due').sort((a, b) => b.at.localeCompare(a.at));
  const due = calls.filter((c) => c.went === 'due').sort((a, b) => a.at.localeCompare(b.at));
  return [...done, ...due].filter((c) => c.claim !== '');
}

/* THE HOST'S OWN SENTENCE when it refused, and the queue's word for a record that moved under the read otherwise. */
const fixOf = (out: unknown): string =>
  typeof out === 'object' && out !== null && 'refusal' in out && typeof (out as { refusal?: { fix?: unknown } }).refusal?.fix === 'string'
    ? String((out as { refusal: { fix: string } }).refusal.fix)
    : copy.changedSince;

/**
 * BOTH LISTS, READ TOGETHER. A refusal of either is the whole read's, because half of this is a screen saying nothing
 * waits when it only failed to look.
 */
export async function readViews(client: Pick<Governor, 'governance'>, now: number): Promise<Read<Views>> {
  const [asked, scored] = await Promise.all([
    everyGovernance(client, { register: 'suggestion', status: 'all' }),
    governancePage(client, { register: 'prediction' }, null, CALLS_READ),
  ]);
  if (!asked.ok) return { from: 'refused', fix: fixOf(asked) };
  if (!scored.ok) return { from: 'refused', fix: fixOf(scored.out) };
  return { from: 'live', value: { later: laterOf(asked.value, now), calls: callsOf(scored.rows) } };
}
