/**
 * DECIDE, DECLARED, AND THE TWO LISTS UNDER THE QUEUE THAT ARE NOT YET A SOURCE.
 *
 * THE PAGE IS A BODY LIKE ANY OTHER ("every page is declared"). `/decide` was a screen of its own, and
 * since 24 October it is this page alone (the old one's keys moved onto it); `decideHome` is the body
 * the page draws through `PageView`, as Today's is (`lib/home/default-home.ts`): the line the head says, the first
 * question drawn whole, the rest to be chosen and answered at once, what was put off and what was decided folded shut
 * under them. The record draws it with `previewPage` and nothing is installed, so nothing here is anybody's record by
 * name (§27), and `decideDrawn` is the one place the page is shaped before it is drawn.
 *
 * THE CALLS ARE STILL READ HERE. A prediction is no list and no computed source, so how the calls went is the host's to
 * draw under the page, from `callsOf`, until the record answers it as a block.
 *
 * NO NEW METHOD FOR THE OLD LISTS, BECAUSE THE RECORD ALREADY SAYS BOTH. `governance` hands every suggestion with its
 * `defer_until` and `defer_why` once it is asked for `status: 'all'`, and a deferred question is one still open whose
 * day has not come, which is exactly the one the default `open` read leaves out (`kernel/src/govern.ts`,
 * `listGovernance`). A prediction row carries `met`, `scored_at` and `score_at` as the scorer left them.
 *
 * PLAIN TYPESCRIPT WITH RELATIVE IMPORTS, so a test can load it in Node the way it loads `grouping.ts`, and the clock
 * is an argument rather than a read of `Date.now()`, so a test can say what day it is.
 */

import { day, relative, since, spoken } from 'braindog-render';
import type { QueueQuestion } from '@braindog/kernel';
import { createClient } from '@braindog/client';
import { everyGovernance, governancePage, type Governor, type Read } from '../../lib/record/governance.ts';
import { moneyInText, namesAmount } from '../../lib/record/money.ts';
import { blockOf, type Fetch, type LiveBlock, type Opened } from '../../lib/record/page-live.ts';
import type { PageBlock } from '../../lib/record/schema.ts';
import { emptyHidden, says } from '../../lib/page/home.ts';
import { alikeOf } from '../../lib/page/alike.ts';
import { copy } from '../../lib/copy.ts';
import { askOf } from '../../lib/decide/ask.ts';
import { ageDays, WORDS as LEAD } from './lead.ts';
import { words } from './words.ts';
import { othersLine, WORDS as DECIDER_WORDS, type Decided } from './[id]/decider.ts';

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
  later: 'Later',
  /** The shelf of agents' suggestions beside Needs you: one press takes each, and none is counted as needing you. */
  apart: 'Suggested by agents',
  /** Its fold, with how many: "Suggested by agents · 9". */
  apartSaid: (n: number) => `Suggested by agents · ${n.toLocaleString('en-GB')}`,
  /** The fold of what was put off, with how many and the soonest back (today F12): "Later · 22 · next back 1 Dec". */
  laterSaid: (n: number, back: string | null) => `Later · ${n.toLocaleString('en-GB')}${back ? ` · next back ${back}` : ''}`,
  calls: 'How the calls went',
  /** Noting a choice to make yourself, in the head's "⋯" (`AskSheet`). */
  ask: 'Note a choice to make',
  /** The head's "⋯", named for a screen reader. */
  more: 'More on Needs you',
  /** The "⋯"'s way to the boxes for answering several at once. */
  select: 'Select',
  /** The phone's switch between Money, Quick and Handled, named for a screen reader. */
  columns: 'Show',
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

/** Just the calls, for the declared page, which reads what was put off through its own body. */
export async function readCalls(client: Pick<Governor, 'governance'>): Promise<Read<Call[]>> {
  const scored = await governancePage(client, { register: 'prediction' }, null, CALLS_READ);
  if (!scored.ok) return { from: 'refused', fix: fixOf(scored.out) };
  return { from: 'live', value: callsOf(scored.rows) };
}

/** How the calls went, in one line and one picture: of those already checked, how many came true and how many did not. */
export function callsRead(calls: readonly Call[]): { met: number; missed: number; unread: number; said: string } {
  const met = calls.filter((c) => c.went === 'met').length;
  const missed = calls.filter((c) => c.went === 'missed').length;
  const unread = calls.filter((c) => c.went === 'unread').length;
  return { met, missed, unread, said: words.callsRead(met, met + missed + unread) };
}

/* ── the declared page ─────────────────────────────────────────────────── */

/** A page body as `previewPage` takes it. */
export type DecideBody = { page: string; title: string; blocks: PageBlock[] };

/**
 * HOW MANY QUESTIONS EACH LIST UNDER THE FIRST ONE DRAWS: the record's ceiling for a queue, so the page holds every
 * question a person would scroll to, and the queue says how many more past it.
 */
export const QUEUE_MOST = 20;

/** How many decisions the folded list draws, the latest first. */
export const DECIDED_MOST = 10;

/* ── the groups: Money, Quick and Handled (plan of 20 October, Needs you 2 and 3) ── */

/**
 * HOW MANY EACH GROUP SHOWS before "N more" opens the rest in place. Questions of one family are one (`alike.ts`), so
 * five is five cards, never five of twelve alike.
 */
export const NEEDS_SHOWN = 5;

/** The two groups of questions. Handled is the third column, and is what BrainDog did itself (`lib/home/handled.ts`). */
export type Group = 'money' | 'quick';
export type Column = Group | 'handled';

/** Each group's block, by the key the page keys its tile by (`PageBody`'s `data-key`), so the board places it. */
export const GROUP_KEY: Readonly<Record<Group, string>> = { money: 'decide-money', quick: 'decide-quick' };

/** The groups' names, as the tiles and the phone's switch say them. */
export const GROUP_WORDS: Readonly<Record<Column, string>> = { money: 'Money', quick: 'Quick', handled: 'Handled' };

/**
 * A QUESTION ABOUT MONEY: accepting it writes an amount (`money`, the record's own), or the record's sentence of it names
 * one (`namesAmount`), as a late invoice to chase or a payment that did not go through does though answering writes none.
 * Read off the question and never off which list it is on: the web knows no list by its name.
 */
export const aboutMoney = (q: QueueQuestion): boolean => (Array.isArray(q.money) && q.money.length > 0) || namesAmount(q.question);

/**
 * WHERE EACH COLUMN SITS ON THE TWELVE-COLUMN BOARD, as a `grid-column`, or `null` for one with nothing in it: Money and
 * Quick a half each, or one the whole row, and Handled the whole row under them. What was put off and decided follows.
 */
export function boardOf(has: Readonly<Record<Column, boolean>>, first: Group = 'money'): Record<Column, string | null> {
  /* QUICK FIRST when the kept page puts that queue ahead (`decideDrawn`'s `first`), as said: "show quick questions first". */
  const order: Column[] = first === 'quick' ? ['quick', 'money'] : ['money', 'quick'];
  const shown = order.filter((c) => has[c]);
  const span = shown.length === 0 ? 12 : 12 / shown.length;
  /* HANDLED IS A STRIP UNDER THE QUESTIONS, ACROSS THE ROW (next steps 1 Nov, T16): as a third column it took a third of
     the page for one line, and Money's cards wrapped their titles beside it. Money and Quick share the row half each. */
  const out: Record<Column, string | null> = { money: null, quick: null, handled: has.handled ? '1 / -1' : null };
  shown.forEach((c, n) => (out[c] = `${String(n * span + 1)} / span ${String(span)}`));
  return out;
}

/* THE DECIDED LIST'S COLUMNS, as the record names a decision's fields (`kernel/src/pages.ts` `DECIDED`). */
const DECIDED_COLUMNS = [
  { field: 'question', label: words.question },
  { field: 'answer_label', label: words.chosen },
  { field: 'reason', label: words.why },
  { field: 'at', label: words.when },
] as const;

/**
 * DECIDE'S BODY, in reading order: the page's line, the questions that move money and the quick ones beside them, as
 * cards a person may choose several of and answer from one bar, and then, folded shut, what was put off and comes
 * back, and what was decided lately. What BrainDog handled itself is the third column, drawn by the page. Every block is over the record's own questions
 * (`governance.*`), so the body is the same for every record and what each one shows is what it holds.
 */
export function decideHome(): DecideBody {
  return {
    page: 'decide',
    title: 'Needs you',
    blocks: [
      /* THE PAGE'S LINE. Its words are the calm one; the head says the line worked out from the queue (`decideDrawn`). */
      { kind: 'note', lead: true, body: words.nothingWaiting },
      /* MONEY, THEN QUICK, SIDE BY SIDE (plan of 20 October): the same ranked queue read twice, and `decideDrawn` gives
         the first the questions that move money and the second the rest, each question once, five showing in each. */
      { kind: 'queue', key: GROUP_KEY.money, heading: GROUP_WORDS.money, icon: 'money', source: 'governance.open', limit: QUEUE_MOST },
      { kind: 'queue', key: GROUP_KEY.quick, heading: GROUP_WORDS.quick, icon: 'decide', source: 'governance.open', limit: QUEUE_MOST },
      /* AGENTS' SUGGESTIONS, OLDEST FIRST, on their own quieter shelf: an "Add this to Tasks?" one press takes and one Put
         back undoes, never counted as needing you (`govern.ts` `apartOf`; a Settings switch puts them back). */
      { kind: 'section', heading: WORDS.apart, icon: 'session', fold: true },
      { kind: 'queue', source: 'governance.apart', limit: QUEUE_MOST },
      /* WHAT WAS PUT OFF, SOONEST BACK FIRST, folded: it is not waiting yet, and is one press away. */
      { kind: 'section', heading: WORDS.later, icon: 'clock', fold: true },
      { kind: 'queue', source: 'governance.later', limit: QUEUE_MOST },
      /* WHAT WAS DECIDED, LATEST FIRST, folded: what each got and why, each a door to its decision. */
      { kind: 'section', heading: LEAD.decided, icon: 'check', fold: true },
      { kind: 'table', source: 'governance.decided', columns: [...DECIDED_COLUMNS], limit: DECIDED_MOST },
    ],
  };
}

/** Decide's body as every record draws it. */
export const DECIDE_HOME = decideHome();

const isOpen = (b: LiveBlock): boolean => b.kind === 'queue' && b.source === 'governance.open';
const isLead = (b: LiveBlock): boolean => isOpen(b) && (b as { lead?: unknown }).lead === true;

/** How many questions a queue holds: every one open, though it draws a few. */
const asked = (b: LiveBlock): number => Math.max(b.total, b.queue?.length ?? 0);

/**
 * THE RECORD'S OWN COUNTS OF WHAT WAITS, when the queue answered them (`waiting` on a `governance.open` queue): how many
 * are hard to undo and how many have waited past two weeks, over every open question and not over the few drawn.
 * `null` from a record older than the key, or a count that is not a whole number.
 */
export function waitingOf(b: LiveBlock): { hardToUndo: number; stale: number } | null {
  const w = (b as { waiting?: unknown }).waiting;
  if (typeof w !== 'object' || w === null) return null;
  const { hardToUndo, stale } = w as { hardToUndo?: unknown; stale?: unknown };
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  return whole(hardToUndo) && whole(stale) ? { hardToUndo, stale } : null;
}

/** Decide's page as drawn, and the line its head says. */
export type DecideDrawn = {
  blocks: LiveBlock[];
  /** The head's line: how many wait and what the first suggests, or the calm line when nothing does. */
  sentence: { text: string; needs: string };
  /** How many questions are open, the record's own count. */
  open: number;
  /** Whether the page draws anything at all under its head. */
  drawsAny: boolean;
  /** How many questions wait in each group, as the head's sentence counts them: what the phone's switch and each column's head say. */
  groups: Record<Group, number>;
  /** Which group the kept page draws first: money's unless it puts the quick queue ahead. */
  first: Group;
};

/**
 * THE BLOCKS AS DECIDE DRAWS THEM, at the same indexes, since every write and id on the page is keyed by a block's place.
 *
 * THE LINE GOES TO THE HEAD. A `note lead` in plain words is the head's calm line rather than a tile, and while a
 * question waits the head says `countSentence` instead, from the record's count and the first question's suggestion.
 *
 * A QUESTION IS DRAWN ONCE, IN ITS GROUP: the first open queue holds the questions that move money and the second the
 * rest (Quick), each showing five before "N more" opens the rest in place (`most`, `NEEDS_SHOWN`).
 *
 * AND WHAT HOLDS NOTHING IS NOT DRAWN, the record's rule (`drawn: false` with `why`, the kernel's `drawn.ts`), which
 * `emptyHidden` reads and judges again only where the record drew a block, so a section over nothing goes too.
 * `who` names whoever asked the first question, or `''` for the reader or nobody, as the classic screen said it.
 */
/**
 * WHAT WAITS, AS `boot` SAYS IT (`waits`, the record's `waiting()`), and when a question is late (`lateDays`). With it the
 * sentence's counts are the record's, the number the rail's badge and Today's header say; without it (an older host)
 * they are the queue's own, as before. Late is never counted here by a number of days of this file's.
 */
export type DecideWaits = { questions: number; late: number; hard: number; inbox: number | null };

/** A day as a fold says it: "1 Dec". */
function shortDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}` : '';
}

/**
 * NEEDS YOU'S LINE (today F12): how many need you, then how many are about money and how many are quick, in digits,
 * one short line: "4 need you · 3 money · 1 quick". What the money comes to is on each card, in its own currencies, so
 * the line does not add it up again.
 */
export function groupSentence(money: readonly QueueQuestion[], quick: readonly QueueQuestion[], quickCount = quick.length, cards?: number): { text: string; needs: string } {
  const total = money.length + Math.max(0, quickCount);
  if (total === 0) return { text: '', needs: '' };
  /* AND HOW MANY CARDS, WHEN ALIKE ONES FOLD: "22 need you" over six cards read as a count that disagreed. */
  const folded = cards !== undefined && cards > 0 && cards < total ? ` · ${cards.toLocaleString('en-GB')} ${cards === 1 ? 'card' : 'cards'}` : '';
  const needs = `${total.toLocaleString('en-GB')} ${total === 1 ? 'needs' : 'need'} you`;
  const parts = [
    ...(money.length > 0 ? [`${money.length.toLocaleString('en-GB')} money`] : []),
    ...(quickCount > 0 ? [`${quickCount.toLocaleString('en-GB')} quick`] : []),
  ];
  return { text: [needs + folded, ...parts].join(' · '), needs };
}

export function decideDrawn(
  blocks: readonly LiveBlock[],
  now: number,
  who: (q: QueueQuestion) => string = () => '',
  waits: DecideWaits | null = null,
  lateDays: number | null = null,
): DecideDrawn {
  let calm: string | null = null;
  /* EVERY OPEN QUESTION ONCE, in the record's ranked order, whichever open queue it came in. */
  const pool: QueueQuestion[] = [];
  const seen = new Set<string>();
  const openAt: number[] = [];
  let open = 0;
  /* THE RECORD'S COUNTS OF HOW MANY ARE HARD TO UNDO AND HOW MANY HAVE WAITED PAST TWO WEEKS, the most any open queue
     answered, since each counts every open question. Only where no queue answered them are they counted here, each
     question once by id, over the questions drawn. */
  let counted: { hardToUndo: number; stale: number } | null = null;
  const hard = new Set<string>();
  const late = new Set<string>();
  let decided: string | null = null;
  let shapedLater: { at: number; heading: string } | null = null;
  blocks.forEach((b, n) => {
    if (says(b) || !b.drawn) return;
    if (b.source === 'governance.decided' && decided === null) {
      const at = (b as { latest?: unknown }).latest;
      if (typeof at === 'string' && at !== '') decided = at;
    }
    if (!isOpen(b) || !b.queue) return;
    openAt.push(n);
    open = Math.max(open, asked(b));
    const said = waitingOf(b);
    if (said) counted = { hardToUndo: Math.max(counted?.hardToUndo ?? 0, said.hardToUndo), stale: Math.max(counted?.stale ?? 0, said.stale) };
    for (const q of b.queue) {
      if (q.cost === 'undo') hard.add(q.id);
      if (lateDays !== null && ageDays(q.at, now) > lateDays) late.add(q.id);
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      pool.push(q);
    }
  });
  /* THE FIRST TWO OPEN QUEUES ARE MONEY AND QUICK, whatever a kept page called them, and any after them draw nothing: a
     question is drawn once. A page with one open queue draws every question in it, as it always did. */
  const money = pool.filter(aboutMoney);
  const quick = pool.filter((q) => !aboutMoney(q));
  /* ONE COUNT OF WHAT WAITS: "35 need you: 2 about money and 33 quick ones" sat over "Quick 18" on the laptop
     (the questions drawn) and "Quick 5" on the phone (the cards). Each group is counted in questions, the record's
     count where it says more than the queue held, as the sentence, the badge and Today count them. */
  if (waits) open = waits.questions;
  const quickCount = Math.max(quick.length, open - money.length);
  const groups = { money: money.length, quick: quickCount };
  /* A KEPT PAGE THAT PUTS THE QUICK QUEUE AHEAD OF MONEY'S (by the keys the page names them) DRAWS THEM IN THAT ORDER;
     with any other keys the first open queue is money's, as before. */
  const keyAt = (n: number | undefined): unknown => {
    const b = n === undefined ? undefined : (blocks[n] as { key?: unknown; heading?: unknown });
    /* THE READ MAY NOT HAND THE KEY BACK, so the heading the body gave each queue names it too. */
    return b?.key ?? (b?.heading === GROUP_WORDS.quick ? GROUP_KEY.quick : b?.heading === GROUP_WORDS.money ? GROUP_KEY.money : undefined);
  };
  const first: Group = openAt.length >= 2 && keyAt(openAt[0]) === GROUP_KEY.quick && keyAt(openAt[1]) === GROUP_KEY.money ? 'quick' : 'money';
  const second: Group = first === 'money' ? 'quick' : 'money';
  const groupOf = (n: number): Group | 'all' | null => {
    if (openAt.length < 2) return n === openAt[0] ? 'all' : null;
    return n === openAt[0] ? first : n === openAt[1] ? second : null;
  };
  const shaped = blocks.map((b, n): LiveBlock => {
    if (says(b) || !b.drawn) return b;
    if (n === 0 && b.kind === 'note' && b.lead === true) {
      const said = typeof b.body === 'string' ? b.body.trim() : '';
      if (said !== '' && !said.includes('{{')) {
        calm = said;
        return { ...b, drawn: false };
      }
      return b;
    }
    if (!isOpen(b) || !b.queue) return b;
    const group = groupOf(n);
    if (group === null) return { ...b, queue: [], shown: 0, total: 0, drawn: false };
    if (group === 'all') return { ...b, queue: pool, shown: pool.length, total: Math.max(pool.length, b.total), lead: false, most: NEEDS_SHOWN } as LiveBlock;
    const qs = group === 'money' ? money : quick;
    return {
      ...b,
      key: GROUP_KEY[group],
      heading: GROUP_WORDS[group],
      icon: group === 'money' ? 'money' : 'decide',
      lead: false,
      queue: qs,
      shown: qs.length,
      total: qs.length,
      counted: groups[group],
      most: NEEDS_SHOWN,
      ...(qs.length === 0 ? { drawn: false } : {}),
    } as LiveBlock;
  });
  /* THE LINE SAYS HOW MANY, THEN THE TWO GROUPS (today F12): "8 need you: 3 about money, £7,239 in all, and 5
     quick ones." The red is on how many. */
  /* THE QUICK ONES ARE EVERY OPEN QUESTION THAT IS NOT ABOUT MONEY, by the record's count where it says more than the
     queue held (`quickCount`). */
  /* THE CARDS ARE COUNTED ONLY WHEN EVERY QUESTION WAITING WAS DRAWN, so a fold of some is never said of all. */
  const cards = pool.length >= open ? alikeOf(money).length + alikeOf(quick).length : undefined;
  const waiting = pool.length > 0 ? groupSentence(money, quick, quickCount, cards) : null;
  /* WHAT WAS PUT OFF, BY HOW MANY AND THE SOONEST BACK, said on its fold's own line. */
  const laterAt = blocks.findIndex((b) => b.kind === 'queue' && b.source === 'governance.later');
  if (laterAt > 0 && blocks[laterAt - 1]?.kind === 'section') {
    const held = blocks[laterAt]!;
    const n = Math.max(held.total, held.queue?.length ?? 0);
    const days = (held.queue ?? []).map((q) => q.until).filter((d): d is string => typeof d === 'string' && d !== '').sort();
    shapedLater = { at: laterAt - 1, heading: n > 0 ? WORDS.laterSaid(n, days[0] ? shortDay(days[0]) : null) : WORDS.later };
  }
  /* "NOTHING WAITS ON YOU" ONLY WHEN NOTHING DOES: an arrival in the inbox is something, so the line says no question does. */
  const arrived = (waits?.inbox ?? 0) > 0;
  const quiet = decided
    ? (arrived ? words.noQuestionDecided : words.lastDecided)(since(decided, now))
    : arrived
      ? words.noQuestion
      : (calm ?? words.nothingWaiting);
  /* AND THE SHELF OF AGENTS' SUGGESTIONS, BY HOW MANY, on its fold's own line. */
  const apartAt = blocks.findIndex((b) => b.kind === 'queue' && b.source === 'governance.apart');
  const apartHead =
    apartAt > 0 && blocks[apartAt - 1]?.kind === 'section'
      ? ((held) => ({ at: apartAt - 1, heading: ((n) => (n > 0 ? WORDS.apartSaid(n) : WORDS.apart))(Math.max(held.total, held.queue?.length ?? 0)) }))(blocks[apartAt]!)
      : null;
  const later = shapedLater as { at: number; heading: string } | null;
  const heads = [later, apartHead].filter((h): h is { at: number; heading: string } => h !== null);
  const named = heads.length > 0 ? shaped.map((b, n) => ((h) => (h ? { ...b, heading: h.heading } : b))(heads.find((h) => h.at === n))) : shaped;
  const out = emptyHidden(named);
  return { blocks: out, sentence: waiting ?? { text: quiet, needs: '' }, open, drawsAny: out.some((b) => b.drawn), groups, first };
}

/* ── the record's answer, read as the page draws it ───────────────────── */

type Answered = Parameters<typeof blockOf>[0];
type Entryish = { id?: unknown; fields?: Record<string, unknown> };

/**
 * WHAT WAS DECIDED, AS A TABLE DRAWS IT: one line a decision, its cells the declared columns in the words a person
 * reads, and each a door to the decision on `/decide/<id>`. The day is said as an age ("2 days ago"), and the option by
 * its own label where the question offered options, else the record's own word for accepting or declining.
 */
export function decidedOf(b: Answered, now: number): LiveBlock {
  /* THE FRAME EVERY BLOCK HAS (heading, columns, count), drawn as a block with no source, which is never a `cannot`. */
  const { source: _source, ...plain } = b;
  const shell = blockOf({ ...plain, rows: [] }, new Map(), now);
  const { cannot: _cannot, ...rest } = shell;
  const columns = shell.columns;
  const got = (Array.isArray(b.rows) ? b.rows : []) as Entryish[];
  const cell = (f: Record<string, unknown>, field: string): string => {
    const v = f[field];
    if (field === 'at') return typeof v === 'string' ? since(v, now) : '';
    if (field === 'answer_label') return typeof v === 'string' && v !== '' ? moneyInText(v) : answerWord(f.answer);
    if (field === 'answer') return answerWord(v);
    /* THE QUESTION ALONE, as its page and its card title it (`ask.ts`). */
    if (field === 'question') return typeof v === 'string' ? askOf(spoken(moneyInText(v))).ask : '';
    return typeof v === 'string' ? moneyInText(v) : v === null || v === undefined ? '' : String(v);
  };
  const rows = got.flatMap((r) => {
    const id = typeof r.id === 'string' ? r.id : '';
    const f = r.fields ?? {};
    return id === '' ? [] : [{ key: `decided:${id}`, cells: columns.map((c) => cell(f, c.field)), href: `/decide/${encodeURIComponent(id)}` }];
  });
  const matched = typeof b.matched === 'number' ? b.matched : rows.length;
  /* `latest` IS WHEN THE NEWEST WAS DECIDED, which the calm line says once nothing waits. */
  const latest = typeof got[0]?.fields?.at === 'string' ? got[0].fields.at : null;
  return { ...rest, source: 'governance.decided', rows, shown: rows.length, total: Math.max(rows.length, matched), latest } as LiveBlock;
}

/* `accept` and `reject` are what a question with no options of its own was answered with. */
/* SAID AS THE QUESTION'S OWN PAGE SAYS IT ("You accepted this", "You declined this"), and never the record's Reject. */
const answerWord = (v: unknown): string => (v === 'accept' ? words.accepted : v === 'reject' ? words.declined : typeof v === 'string' ? v : '');

/**
 * ONE ANSWERED BLOCK AS THE PAGE DRAWS IT. What was put off is a queue like the open one, and is read as one; what was
 * decided is rows the record's lists do not hold, and is drawn here (`decidedOf`). A block the record refused, or held
 * back, keeps what it said.
 */
export function decideBlockOf(b: Answered, now: number): LiveBlock {
  const refused = (Array.isArray(b.refusals) && b.refusals.length > 0) || b.drawn === false;
  if (!refused && (b.source === 'governance.later' || b.source === 'governance.apart')) return { ...blockOf({ ...b, source: 'governance.open' }, new Map(), now), source: b.source };
  if (!refused && b.source === 'governance.decided') return decidedOf(b, now);
  return blockOf(b, new Map(), now);
}

/**
 * DECIDE'S PAGE, DRAWN BY THE RECORD and never installed: `previewPage` answers the body as `page` answers an installed
 * one, each block held to the reader, and writes nothing. `null` from a host older than the method, or none reached,
 * which the screen says as a refusal.
 */
export async function readDecide(base: string, body: DecideBody = DECIDE_HOME, io?: Fetch): Promise<Opened | null> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ read_at?: unknown; blocks?: unknown }>('previewPage', { body });
  if (!out.ok) {
    if (!('refusal' in out)) return { from: 'refused', fix: copy.changedSince };
    return UNSERVED.has(out.refusal.code) ? null : { from: 'refused', fix: out.refusal.fix };
  }
  const said = typeof out.value.read_at === 'string' ? Date.parse(out.value.read_at) : Number.NaN;
  const now = Number.isFinite(said) ? said : Date.now();
  const blocks = (Array.isArray(out.value.blocks) ? out.value.blocks : []) as Answered[];
  return { from: 'live', now, page: { page: { page: body.page, title: body.title }, blocks: inKeptOrder(blocks.map((b) => decideBlockOf(b, now)), body) } };
}

/**
 * THE TWO GROUPS IN THE ORDER THE KEPT BODY PUTS THEM. The record reads a body it is previewing under its rules' look,
 * which leads with what is late and so draws Money first whatever the body says, and a person who said "quick first"
 * would see no change. Money's and Quick's blocks swap places to match the body; nothing else moves.
 */
function inKeptOrder(blocks: LiveBlock[], body: DecideBody): LiveBlock[] {
  const keyOf = (b: unknown): unknown => (b as { key?: unknown }).key;
  const asked = body.blocks.map(keyOf);
  const wantQuickFirst = asked.indexOf(GROUP_KEY.quick) !== -1 && asked.indexOf(GROUP_KEY.quick) < asked.indexOf(GROUP_KEY.money);
  const m = blocks.findIndex((b) => keyOf(b) === GROUP_KEY.money);
  const q = blocks.findIndex((b) => keyOf(b) === GROUP_KEY.quick);
  if (m === -1 || q === -1 || asked.indexOf(GROUP_KEY.money) === -1 || wantQuickFirst === q < m) return blocks;
  const out = [...blocks];
  [out[m], out[q]] = [out[q]!, out[m]!];
  return out;
}

/** A refusal that says the host has no such method, rather than anything about this page. */
const UNSERVED = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD', 'UNREACHABLE', 'UNAUTHORIZED']);

/* ── who decides: the reader's own questions first ────────────────────── */

/**
 * THE QUESTIONS NAMED FOR THE READER COME FIRST, under `heading`, and the rest keep the record's order after
 * them. `yours` is how many at the front are the reader's; `heading` is `null` when none is, so a record where nobody
 * names a decider draws Decide exactly as before. A question from a record older than the column names nobody.
 */
export function mineFirst<T extends Decided>(rows: readonly T[], me: string | null): { rows: T[]; yours: number; heading: string | null } {
  if (me === null) return { rows: [...rows], yours: 0, heading: null };
  const yours = rows.filter((r) => r.decider === me);
  const rest = rows.filter((r) => r.decider !== me);
  return { rows: [...yours, ...rest], yours: yours.length, heading: yours.length > 0 ? DECIDER_WORDS.yours : null };
}

/* THE LINE ON SOMEBODY ELSE'S CARD lives with the rest of who decides, so a card can say it without this file. */
export { othersLine };

/**
 * EVERY OPEN QUEUE ON DECIDE'S PAGE WITH THE READER'S QUESTIONS FIRST, at the same indexes, before `decideDrawn` shapes
 * it. A queue that names no decider for the reader comes back as it was, the same object.
 */
export function blocksMineFirst(blocks: readonly LiveBlock[], me: string | null): LiveBlock[] {
  return blocks.map((b) => {
    if (!isOpen(b) || !b.queue) return b;
    const ordered = mineFirst(b.queue as readonly (QueueQuestion & Decided)[], me);
    return ordered.yours === 0 ? b : { ...b, queue: ordered.rows };
  });
}
