/**
 * ONE DECISION CARD, AS A PERSON READS IT ("one decision card everywhere"): what `DecisionCard.svelte`
 * draws on Home, Money, Work, a project's page, the Agents page, Decide, its classic screen and Slash's palette, worked
 * out once from the record's `QueueQuestion` and nothing else.
 *
 * WHY FIRST. The question, then at once why it is asked, then who asked (the agent, the app it ran in and the run), then
 * what it moves: the money accepting writes and what changes from what to what, where the record says. The ways to
 * answer come last, the suggested one marked with the small dot on every card. Where the choice is hard to
 * undo or money moves, the dot stays and only Enter is taken away (`press.ts` `acceptKey`): hiding the suggestion
 * there hid the agent's advice exactly where it matters most.
 *
 * NO ADDRESS AND NO ID IN THE WORDS. The question, its why, what accepting does, each answer and why it is offered,
 * what a change was and becomes, and why a question was put off were written by whoever asked, and an agent writes
 * `alex@acme.com`, `tasks#8` or a file path into them as readily as a name. Each is read
 * through `spoken` (`spoken.ts`) before it is drawn, and a signer that is an address is Someone.
 *
 * PURE, AND NODE LOADS IT (relative `.ts` imports, no runes), so `card.test.ts` reads every rule here without a DOM.
 *
 * WHAT THE RECORD MAY NOT SEND YET IS READ, NOT TRUSTED. `run`, `app`, `drafted_by`, `money` and what changes (`before`
 * and `after`, or `changes`) arrive on a queue question from a record that answers them (`pages.ts` `QueueQuestion`); a
 * record on an older build sends none and the card draws without them. A value that is an id, a handle or a path is
 * never drawn as a name.
 */

import type { QueueQuestion } from '@braindog/kernel';
import { money, queueCost, shortDay, since } from 'braindog-render';

import { moneyInText } from '../record/money.ts';
import type { ActorKind } from '../record/names.ts';
import { changesSomething, laterLine, proposer, queueMergeOf, queueWords, saidOf, waysOf, type FileAt, type Way } from '../page/queue-answer.ts';
import type { Merge } from '../../routes/decide/merge.ts';
import { copy } from '../copy.ts';
import { nameWords } from '../record/names.ts';
import { acceptKey, amountSaid, declineKey, labelOf, twoWords } from '../../routes/decide/press.ts';
import { arrangedOf, isArranging } from '../../routes/decide/[id]/arranged.ts';
import { spoken } from './spoken.ts';
import { askOf } from './ask.ts';
import { recordToday } from '../record/zone.ts';

/* SAID FROM HERE TOO, where every screen that draws a card already reads its words. */
export { spoken };

/** THE CARD'S OWN WORDS, beside the only code that says them. No em dash, no word of the system's. */
export const cardWords = {
  /** The line a card becomes once it is answered, by the reader. */
  answered: (option: string, when: string) => queueWords.answered(option, when),
  /** The same line for a proposal Slash drafted: who suggested it and who settled it, as the history reads it. */
  slash: (person: string, verb: string) => `Slash suggested · ${person} ${verb}`,
  accepted: 'accepted',
  declined: 'declined',
  /** Whoever took an accepted suggestion back, as the history says it. */
  undid: 'undid',
  chose: (option: string) => `chose ${option}`,
  /** Beside the line while the answer waits out its six seconds. */
  undo: 'Undo',
  /** What accepting writes, when money moves. */
  moves: (amount: string) => `Moves ${amount}`,
  /** What accepting writes, when every amount is on an entry it adds: recorded, and no money moves (`records`). */
  records: (amount: string) => `Records ${amount}`,
  /** Between what a change was and what it becomes, said where the eye reads an arrow. */
  to: 'to',
  /** A value that was empty before, or is emptied. */
  nothing: 'nothing',
  /** A field that held nothing and now holds something: said in words, never as a struck "nothing" and an arrow. */
  setTo: (value: string) => `Set to ${value}`,
  /** The same where the record names no field: the value is what is added. */
  adds: (value: string) => `Adds ${value}`,
  /** A value taken away, leaving nothing in its place. */
  removes: (value: string) => `Removes ${value}`,
  /** Under the three changes a card draws, where the question makes more: how many wait on the question's own page. */
  more: (n: number) => `and ${n} more, on its page`,
  /** Said to a screen reader before who asked, on the line over the question; the question's own page heads its side with it. */
  askedBy: 'Asked by',
  /** The foot of a money row (today F4): who asked, never leading it. */
  by: (name: string) => `Asked by ${name}`,
  /* "BY CHASE LATE PAYMENTS", NOT "ASKED BY YOUR RULE CHASE LATE PAYMENTS" (T14): the rule's name says what asked. */
  byRule: (name: string) => `By ${name}`,
  byYou: 'Asked by you',
  /** THE CARD'S SIDE, ON A WIDE TILE: why it is asked and what it changes, each under a quiet heading. */
  why: 'Why it’s asked',
  changes: 'What it changes',
  /** The same heading where the changes are drawn as lines and the record's sentence, which named the list, is not. */
  changesIn: (list: string) => `What it changes in ${list}`,
  /**
   * HOW LONG AN OFFER WAITS ("every proposal states a deadline"): the last day it waits, as the Slash page says
   * it. It promises no taking back, because nothing takes an offer back by itself yet. `day` is already a day in words.
   */
  lapses: (day: string) => `Offered until ${day}`,
  /** The same once that day has come. */
  lapsesToday: 'Offered until tonight',
  /** Past the two answers a row shows: the rest, on the question's own page. */
  otherAnswers: (n: number) => (n === 1 ? '1 more answer' : `${n.toLocaleString('en-GB')} more answers`),
  /** The info mark that opens the ladder's rule, and its name for a screen reader. */
  whyAsks: 'Why it asks you',
  /** Under a question cut at two lines. */
  readAll: 'Read all',
} as const;

/** Who asked, as the by-line says it: the face and name, the app it ran in, the run, each only where it is a name. */
export type Asker = { name: string; kind: ActorKind; app: string | null; run: string | null };

/** One thing accepting changes, from what to what, in words. `what` is empty where the record names no field. */
export type Shift = { what: string; before: string; after: string };

/**
 * THE SAME CHANGE AS THE CARD DRAWS IT. Only a value that replaces another is drawn struck with an arrow (`said` is
 * `null`, and `before` and `after` are read); a value where there was none, or one taken away, is one plain phrase
 * ("Set to Friday", "Adds Weekly", "Removes Friday"), because "nothing" struck through with an arrow says nothing.
 */
export type ShiftLine = { what: string; before: string; after: string; said: string | null };

/** A money value as the record keeps one: an integer of minor units and its currency. */
export type Moved = { amount: number; currency: string };

/** Everything one card draws, in the order it is read. */
export type Card = {
  id: string;
  /** The question's own page, unprefixed (a caller wraps it in `at`). */
  href: string;
  question: string;
  /** Why it is asked, said first, right under the question. Empty when whoever asked wrote none. */
  why: string;
  by: Asker;
  /** How long ago it was asked, in words. */
  when: string;
  /** When a question put off comes back, and why, or `null`. */
  later: string | null;
  /**
   * What accepting does, in one line, or empty: on the lead, on every card that changes what a list holds, and where a
   * change was left out of `lines`; an arrangement's own summary on every card that is one. Empty on a change to what a
   * list holds whose every change is one of `lines`, which already say it.
   */
  does: string;
  /**
   * The name of the list the change is in ("Projects"), only where `does` is left out because the lines say it: the
   * lines name fields, and the sentence was the one place the card said which list they are of. Empty everywhere else.
   */
  list: string;
  /** How many things a joined question changes, or 0. */
  joined: number;
  /** The record's band for it (`call`, `undo`, ...). */
  cost: string;
  /** The band in words, only for one that warns; empty for `call`. */
  band: string;
  /** The money accepting writes, each currency on its own, never added across two. */
  moves: Moved[];
  /** The same in words ("Moves £12.98"), or empty. */
  money: string;
  /** What changes, from what to what, where the record says. */
  shifts: Shift[];
  /** The same changes as the card draws them: a value where there was none is a phrase, never a struck "nothing". */
  lines: ShiftLine[];
  /** How many more changes could be drawn and were not, past the three a card draws: said under them, or 0. */
  more: number;
  /** The ways to answer, in the record's order; Accept says Accept, with the money over it, and Reject says Decline. */
  ways: Way[];
  /** The answer Enter gives, or `null` where a key must not answer (hard to undo, or money moves). */
  enter: string | null;
  /** The answer Backspace gives, or `null` on a question of options. */
  decline: string | null;
  /** The merge it asks, drawn as `MergeCard`, or `null`. */
  merge: Merge | null;
  /** Whether the whole change is worth a look before answering, one link away. */
  seeWhole: boolean;
  /** What was proposed, the body's kind. */
  filed: string;
  /** Whether Slash drafted it, which the answered line says. */
  slash: boolean;
  /**
   * The one quiet line of how long an arrangement waits, or `null`: set only where its body holds a real day
   * (`lapses`), so a question with none draws what it always drew.
   */
  lapses: string | null;
};

/** What the card is told by its host: who is reading, the names the shell holds, the clock and the record's currency. */
export type CardContext = {
  me?: string | null;
  names?: ReadonlyMap<string, string>;
  now: number;
  /** The queue's lead question, drawn whole with what accepting does. */
  lead?: boolean;
  /** The record's own currency, said by its symbol; read from the shell when not handed. */
  home?: string | null;
  /** The body of a `pack`, `settings` or `arrange` proposal, where the host holds it; the question's `arranged` otherwise. */
  body?: Record<string, unknown> | null;
  /** The page's way to a file it holds, so an option that is a picture carries its address (`waysOf`); none without it. */
  file?: FileAt | undefined;
};

const ULID = /[0-9A-HJKMNP-TV-Z]{26}/u;

/**
 * A NAME OR NOTHING: words a person reads, never an id, a handle (`tasks#8`), a path or an address. A string that is
 * any of those is left out rather than drawn as if somebody had named it.
 */
export function nameOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '' || s.length > 80) return null;
  /* A ULID, A HANDLE, A PATH, A QUESTION'S OR DECISION'S OWN ID, a signer's (`agent:…`, `runner:…`) or a snake id. */
  if (ULID.test(s) || /#\d/u.test(s) || /[\\/]/u.test(s) || /^(SG|D)\d+$/u.test(s) || /^q\.[0-9A-Z]+$/u.test(s)) return null;
  if (/^[a-z][a-z0-9-]*:\S/u.test(s) || (!/\s/u.test(s) && s.includes('_'))) return null;
  /* AND A MACHINE'S ADDRESS ON A LOCAL NETWORK, which names nothing a person calls it, or anybody's mail address. */
  if (/^[\w-]+\.(local|lan|internal|home)$/iu.test(s) || s.includes('@')) return null;
  return s;
}

/** A field read off the question as the record may send it, untyped until it is checked. */
const field = (q: QueueQuestion, key: string): unknown => (q as unknown as Record<string, unknown>)[key];

/**
 * One money value, an integer of minor units and a three-letter currency, as a number or as digits. Zero moves nothing,
 * so it is no movement; as a value a field held or will hold (`zero`), it is said as the amount it is.
 */
function movedOf(v: unknown, zero = false): Moved | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const raw = v as { amount?: unknown; currency?: unknown };
  const amount = typeof raw.amount === 'string' && /^-?\d+$/u.test(raw.amount.trim()) ? Number(raw.amount.trim()) : raw.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || (amount === 0 && !zero)) return null;
  if (typeof raw.currency !== 'string' || !/^[A-Za-z]{3}$/u.test(raw.currency)) return null;
  return { amount, currency: raw.currency.toUpperCase() };
}

/**
 * THE MONEY ACCEPTING WRITES, one line a currency. The record may send one value or several; two in one currency are
 * one line (their movements, never netted to less than moves), and two currencies are never added (`money.ts`).
 */
export function movesOf(v: unknown): Moved[] {
  const all = (Array.isArray(v) ? v : [v]).map((x) => movedOf(x)).filter((m): m is Moved => m !== null);
  const by = new Map<string, { net: number; moved: number }>();
  for (const m of all) {
    const was = by.get(m.currency) ?? { net: 0, moved: 0 };
    by.set(m.currency, { net: was.net + m.amount, moved: was.moved + Math.abs(m.amount) });
  }
  return [...by].map(([currency, { net, moved }]) => ({ amount: Math.abs(net) === moved ? net : moved, currency }));
}

/** A value that holds nothing: none sent, an empty word, or a list of none. */
const emptyValue = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.every(emptyValue));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A DAY AS THE RECORD HOLDS ONE, SAID AS A DAY (no raw timestamp): `2026-10-20` is "20 October 2026",
 * the kernel's own wording in the sentence over these lines (`does.ts` `shortSaid`), year kept. With a time and no
 * zone it is that day on the wall. With a zone it is an instant, whose day is whichever one the reader's clock puts it
 * in: the kernel knows no zone and leaves such a value unsaid, and the card is drawn where the reader is. `null` for
 * a text that is no day.
 */
function daySaid(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/u.exec(text);
  if (!m) return null;
  let [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] !== undefined) {
    const at = new Date(text.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/u, '$1:$2'));
    if (Number.isNaN(at.getTime())) return null;
    [year, month, day] = [at.getFullYear(), at.getMonth() + 1, at.getDate()];
  }
  const name = MONTHS[month - 1];
  return name === undefined || day < 1 || day > 31 ? null : `${day} ${name} ${year}`;
}

/**
 * A value from before or after a change, in words: money in its currency, a list joined, an empty value said as nothing.
 * `null` for a value that is an id or a handle, which no card says, so the change it belongs to is left to its page.
 *
 * SCRUBBED FIRST, THEN TESTED. The kernel sends a field's raw value, so an email edit's before and after are two
 * addresses, and "see tasks#8" is no whole handle: the words are read through `spoken` before anything is asked of
 * them, and a value that was nothing but an id or a path, which `spoken` empties, is left to its page too.
 */
function valueSaid(v: unknown, home: string | null | undefined): string | null {
  if (emptyValue(v)) return cardWords.nothing;
  const m = movedOf(v, true);
  if (m) return home === undefined ? moneyInText(money(m.amount, m.currency)) : moneyInText(money(m.amount, m.currency), home);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-GB') : null;
  if (typeof v === 'string') {
    const day = daySaid(v.trim());
    if (day !== null) return day;
    /* A TEXT A PATH WAS TAKEN OUT OF IS NOT THE VALUE: `spoken` cuts "docs/review.md" from a note and leaves the rest
       reading whole, and a line drawn from that says the field holds what it does not. It is left to its page. A
       STROKE ALONE IS NO PATH: "Q3/Q4", "N/A" and "Paid 50/50" come through `spoken` as they went
       in and are said, as the record's own sentence says them; only a text `spoken` changed is held back. */
    const words = saidOf(v.trim());
    const said = spoken(words);
    if (/[\\/]/u.test(v) && said !== words) return null;
    if (said === '' || ULID.test(said) || /^[a-z][\w-]*#\d+$/u.test(said)) return null;
    return said.length > 60 ? `${said.slice(0, 59).trimEnd()}…` : said;
  }
  if (Array.isArray(v)) {
    const each = v.map((x) => valueSaid(x, home));
    return each.includes(null) ? null : each.join(', ');
  }
  return null;
}

/** The record's words for a field, from its id: `due_on` is "due on". */
const fieldSaid = (v: unknown): string => (typeof v === 'string' && /^[a-z][a-z0-9_]*$/u.test(v) ? v.replace(/_/gu, ' ') : (nameOrNull(v) ?? ''));

/**
 * WHAT CHANGES, FROM WHAT TO WHAT. The record sends it as `changes` (one entry a field: `field` or `label`, `before`,
 * `after`), or as one `before` and `after` for the whole question, each a value or an object of fields. At most three
 * are drawn: a card says what moves, and the question's own page says all of it.
 */
export function shiftsOf(q: QueueQuestion, home?: string | null): Shift[] {
  return shiftLinesOf(q, home).map(({ what, before, after }) => ({ what, before, after }));
}

/**
 * THE SAME CHANGES AS LINES A CARD DRAWS (`ShiftLine`). A side that held nothing is known here, from the value itself
 * and not from its word, so a field whose text is the word "nothing" is still a value. Nothing to nothing is no change
 * and no line.
 */
export function shiftLinesOf(q: QueueQuestion, home?: string | null): ShiftLine[] {
  return shiftsRead(q, home).lines;
}

/** Whether two values a change carries are the same value, whatever their words. */
const sameValue = (a: unknown, b: unknown): boolean => (emptyValue(a) && emptyValue(b)) || JSON.stringify(a) === JSON.stringify(b);

/**
 * THE LINES, AND WHETHER ONE WAS LEFT OUT. A change whose value is an id, a handle or a path is no line (`valueSaid`),
 * and a long text nearly always holds a path, so the card would say nothing of the one thing it changes. `left` says
 * so, and the card says the record's own line of the change in its place (`cardOf`). So is a change whose two values
 * read alike in words and are not alike: two long texts that part after the cut, two times on one day.
 *
 * AT MOST THREE ARE DRAWN, AND `more` COUNTS THE REST that could have been, so the card says how many wait on the
 * question's own page instead of saying nothing of them.
 */
function shiftsRead(q: QueueQuestion, home?: string | null): { lines: ShiftLine[]; left: boolean; more: number } {
  const out: ShiftLine[] = [];
  let left = false;
  const push = (label: unknown, before: unknown, after: unknown) => {
    const b = valueSaid(before, home);
    const a = valueSaid(after, home);
    if (a === null || b === null || (a === b && !sameValue(before, after))) left = true;
    if (a === null || b === null || a === b) return;
    const what = fieldSaid(label);
    const said = emptyValue(before) ? (what ? cardWords.setTo(a) : cardWords.adds(a)) : emptyValue(after) ? cardWords.removes(b) : null;
    out.push({ what, before: b, after: a, said });
  };
  const changes = field(q, 'changes');
  if (Array.isArray(changes)) {
    for (const c of changes) {
      if (typeof c !== 'object' || c === null) continue;
      const r = c as Record<string, unknown>;
      push(r.label ?? r.field, r.before ?? r.from, r.after ?? r.to);
    }
  } else {
    const before = field(q, 'before');
    const after = field(q, 'after');
    const plain = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v) && !('amount' in v);
    if (plain(before) || plain(after)) {
      const b = (plain(before) ? before : {}) as Record<string, unknown>;
      const a = (plain(after) ? after : {}) as Record<string, unknown>;
      for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) push(k, b[k], a[k]);
    } else if (before !== undefined || after !== undefined) push('', before, after);
  }
  return { lines: out.slice(0, 3), left, more: Math.max(0, out.length - 3) };
}

/**
 * THE LIST A CHANGE IS IN, BY ITS NAME, read off the end of the record's sentence of it ("... in Projects."), which is
 * the one thing a question carries that names its list in words (`list` is its id, and no card says an id). The last
 * " in " is taken, since a value may hold the word ("Live in Leeds in Places."). Empty where the sentence ends any
 * other way: a change that also adds or deletes ("... in Projects and adds 2."), one with no list ("your things"), a
 * name that is no name (`nameOrNull`).
 */
function listSaid(sentence: string): string {
  const m = /^.+ in (.+)\.$/u.exec(sentence.trim());
  const name = m ? nameOrNull(spoken(m[1]!)) : null;
  if (name === null || name === 'your things' || name.length > 40) return '';
  return /(?:,| and) (?:adds|deletes|brings|changes|sets|clears) /u.test(name) ? '' : name;
}

/**
 * WHO ASKED: the signer as every screen says one (`proposer`), the app it ran in and the run it asked from, each only
 * where the record gave it a name. A run that is an object names itself (`name` or `title`) and may carry its app.
 */
export function askerOf(q: QueueQuestion, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): Asker {
  const said = proposer(q.who, me, names);
  /* A SIGNER THAT IS AN ADDRESS IS SOMEONE, whatever shape `actor` read it as: nobody's mail address is drawn as a name. */
  const who = said.name.includes('@') ? { name: copy.feedSomeone, kind: 'person' as const } : said;
  const run = field(q, 'run');
  const r = typeof run === 'object' && run !== null ? (run as Record<string, unknown>) : null;
  /* WHAT THE RUN WAS DOING, as the agent said it, with any path or id it wrote taken out rather than the whole line. */
  const named = (v: unknown): string | null => nameOrNull(typeof v === 'string' ? spoken(v) : v);
  const runName = r ? (named(r.name) ?? named(r.title)) : named(run);
  const app = nameOrNull(field(q, 'app')) ?? (r ? (nameOrNull(r.app) ?? nameOrNull(r.client)) : null);
  /* A SIGNER THE READER HOLDS NO NAME FOR IS NAMED BY THE RUN THAT FILED IT where there is one, an agent or script by its
     title, and not "Someone on this record" over a question a named run asked. */
  /* A RUN'S OWN LABEL ("Kpi backfill script", "Bank from out sms") IS THE SCRIPT'S, NOT A NAME: with no app to name, it is
     said as an agent, and the run is read on the question's own page. */
  if (who.name === copy.feedSomeone && runName !== null) return { name: app ?? nameWords.agent, kind: 'agent', app: null, run: app === null ? null : runName };
  /* A RUN SIGNS AS ITS HANDLE (`S42`), which `actor` says as An agent: where the record names the app it ran in, that
     is the name, so the by-line reads "Claude Code · Tidy invoices" and not "An agent · Claude Code". */
  if (who.kind === 'agent' && who.name === nameWords.agent && app !== null) return { name: app, kind: 'agent', app: null, run: runName };
  /* A SCRIPT'S OWN LABEL ("Kpi backfill script", "Bank from out sms") IS THE BUILDER'S WORD: it is said as what it is. */
  if (who.kind === 'automation') return { name: nameWords.automation, kind: who.kind, app: null, run: null };
  return { name: who.name, kind: who.kind, app: app === who.name ? null : app, run: runName };
}

/** The by-line's words after the face: the name, the app and the run, each once. */
export const byWords = (a: Asker): string[] => [a.name, a.app, a.run].filter((s): s is string => s !== null && s !== '');

/** Whether Slash asked it or drafted it for whoever filed it. */
function bySlash(q: QueueQuestion, kind: ActorKind): boolean {
  if (kind === 'slash') return true;
  const drafted = field(q, 'drafted_by');
  return typeof drafted === 'string' && /^slash\b/u.test(drafted.trim());
}

/** A joined question's count of what it changes, where the record counts more than one. */
function joinedOf(q: QueueQuestion, merge: Merge | null): number {
  const n = field(q, 'held');
  return merge === null && typeof n === 'number' && Number.isInteger(n) && n > 1 ? n : 0;
}

/**
 * AN ARRANGEMENT IS SAID IN ITS OWN SUMMARY: what it sets up, then the keys, updates, feeds and rows it
 * holds, counted, as its own question page heads its story (`arranged.ts` `arrangedOf`, "Sets this BrainDog up for
 * Money: 2 keys, 3 updates, 2 feeds."). It takes the place of the general line of what accepting does, and is said on
 * every card, the lead's or not, since it is what the card is. Read from the body the record filed, which a host hands
 * as `body` and the queue as the question's `arranged`; empty without one, and the card says what it always said.
 */
function arrangementOf(q: QueueQuestion, kind: string, body: unknown): string {
  if (!isArranging(kind)) return '';
  const filed = body ?? field(q, 'arranged');
  if (filed === null || typeof filed !== 'object' || Array.isArray(filed)) return '';
  const story = arrangedOf(kind, filed as Record<string, unknown>);
  if (story === null || story.lead === '') return '';
  const line = story.summary ? copy.arrangeLeadSummary(story.lead, story.summary) : story.lead;
  /* A LINE WITH NOTHING TO TAKE OUT IS SAID WHOLE: `spoken` reads a last "on" as a word left hanging, and "Turns Money
     back on" read "Turns Money back". Behind a closing mark it strips itself, that word is kept, so a line it leaves
     alike had no address or id in it. */
  return `${spoken(`${line} ·`) === line ? line : spoken(line)}.`;
}

/** The suggested option first, the rest in the record's order. Stable, so the keys follow what is drawn. */
export function leadFirst<T extends { recommended: boolean }>(ways: readonly T[]): T[] {
  return [...ways.filter((w) => w.recommended), ...ways.filter((w) => !w.recommended)];
}

/** `YYYY-MM-DD` where it is a day on the calendar, or `null`: `2026-02-30` and `2026-13-01` are no day. */
export function realDay(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) return null;
  const at = Date.parse(`${v}T12:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === v ? v : null;
}

/** The record's own day, as `YYYY-MM-DD` (`zone.ts`): the day a card is read on is the one on the record's wall. */
export function todayOf(now: number): string {
  return recordToday(now);
}

/**
 * HOW LONG AN ARRANGEMENT WAITS, from the `lapses` its body holds: the last day it waits, in words, the same
 * line the Slash page draws ("Offered until 27 Oct"). A day already come is said as today, never as a day past. It names
 * nobody and promises no taking back: nothing takes an offer back by itself yet. `null` for anything that is not an
 * arrangement or whose body holds no real day.
 */
function lapseLine(q: QueueQuestion, kind: string, body: unknown, now: number): string | null {
  if (!isArranging(kind)) return null;
  const filed = body ?? field(q, 'arranged');
  if (filed === null || typeof filed !== 'object' || Array.isArray(filed)) return null;
  const last = realDay((filed as Record<string, unknown>).lapses);
  if (last === null) return null;
  const today = todayOf(now);
  return last <= today ? cardWords.lapsesToday : cardWords.lapses(shortDay(last, today));
}

/**
 * THE CARD, from one question.
 *
 * ACCEPT SAYS ACCEPT, WITH THE MONEY IT MOVES THE LINE OVER IT, AND REJECT SAYS DECLINE, on the record's own two
 * answers (`press.ts` `labelOf`), so a button says what it does. The suggestion is marked on every card; Enter gives an answer only where the choice can be undone
 * and no money moves (`acceptKey`).
 */
export function cardOf(q: QueueQuestion, ctx: CardContext): Card {
  const by = askerOf(q, ctx.me ?? null, ctx.names ?? new Map());
  const moves = movesOf(field(q, 'money'));
  const plain = waysOf(q, ctx.file);
  const keyed = { options: plain.map((w) => ({ key: w.key, recommended: w.recommended, hard: w.hard })) };
  const said = moves.length === 0 ? '' : ctx.home === undefined ? amountSaid(moves) : amountSaid(moves, ctx.home);
  /* ACCEPT SAYS ACCEPT, AND THE AMOUNT IS THE LINE OVER IT (`money`, the scope of 24 October): a button naming two
     currencies and the care it asks for wrapped to five lines at 390. */
  const labelled = (w: Way): string => labelOf({ key: w.key, title: w.label }, keyed, []);
  /* THE SUGGESTED OPTION LEADS (§45); every key and number follows `ways`, so they follow what is drawn. */
  const ways = leadFirst(plain.map((w) => ({ ...w, label: labelled(w) })));
  const merge = queueMergeOf(q, plain.map((w) => w.key));
  const filed = typeof q.body_kind === 'string' ? q.body_kind : q.kind;
  const arranged = arrangementOf(q, filed, ctx.body);
  const read = shiftsRead(q, ctx.home);
  /* THE RECORD'S LINE OF WHAT ACCEPTING CHANGES, ON EVERY CARD THAT CHANGES WHAT A LIST HOLDS, the lead's or not: it
     says which fields move and by how much, and a card further down the queue said nothing under "What it changes".
     Any other kind keeps it for the lead, unless a change was left out of the lines above, where it is all there is.

     NOT SAID TWICE (integrate 79, his to rule; this takes back change-line-card-79's choice to say it on every such
     card). The record's line of one entry's change is its fields from what to what, and so are the lines under it: where
     every change is one of those lines, none left out and none past the third, the sentence says nothing more and is
     not drawn, on the lead as below it. It stays wherever a change could not be drawn or was cut, since there it is
     the only place that change is named. Another kind's line may say what the lines do not, and is left as it was. */
  const drawn = filed === 'rowset' && read.lines.length > 0 && !read.left && read.more === 0;
  const says = !drawn && (ctx.lead === true || filed === 'rowset' || read.left);
  /* SAID WHOLE WHERE THERE IS NOTHING TO TAKE OUT, as an arrangement's summary is (`arrangementOf`): a line that ends on
     a field's own name ("Changes Due on.") lost its last word to `spoken`, which reads it as a word left hanging. */
  const line = says && typeof q.does === 'string' ? saidOf(q.does) : '';
  const does = arranged !== '' ? arranged : spoken(`${line} ·`) === line ? line : spoken(line);
  /* THE LIST'S NAME STAYS ON THE CARD: the sentence left out above was the one place that
     said "in Projects", and the lines under the heading say only fields. The heading says it in the sentence's place. */
  const list = drawn && arranged === '' && typeof q.does === 'string' ? listSaid(saidOf(q.does)) : '';
  const cost = typeof q.cost === 'string' ? q.cost : '';
  const asked = askOf(spoken(saidOf(q.question)));
  return {
    id: q.id,
    href: `/decide/${encodeURIComponent(q.id)}`,
    /* THE QUESTION ALONE, as its page titles it, and what was written after it leads the why (`ask.ts`). */
    question: asked.ask,
    why: [asked.detail, q.why ? spoken(saidOf(q.why)) : ''].filter((s) => s !== '').join(' '),
    by,
    when: since(q.at, ctx.now),
    later: laterLine(q, ctx.now),
    does,
    list,
    joined: joinedOf(q, merge),
    cost,
    band: cost && cost !== 'call' ? queueCost(cost) : '',
    moves,
    money: said === '' ? '' : field(q, 'records') === true ? cardWords.records(said) : cardWords.moves(said),
    shifts: read.lines.map(({ what, before, after }) => ({ what, before, after })),
    lines: read.lines,
    more: read.more,
    ways,
    enter: acceptKey({ options: keyed.options, band: cost }, moves.length > 0),
    decline: declineKey(keyed),
    merge,
    seeWhole: changesSomething(q),
    filed,
    slash: bySlash(q, by.kind),
    lapses: lapseLine(q, filed, ctx.body, ctx.now),
  };
}

/**
 * WHETHER AN ANSWER IS HARD TO TAKE BACK: the record's band is `undo` and nothing else. The band is the record's to
 * give (the kernel's `weigh`), and a change the record keeps a prior version of comes as `shape`, so the care is said
 * on the few cards that need it and keeps its weight. No kind, no word of the question and no missing band reads as hard.
 *
 * OR THE ANSWER ITSELF IS ONE THE RECORD MARKED HARD (`way.hard`, the kernel's `optionCost`). Since batch 64 one hard
 * option beside a safe one leaves the question's band alone ("Keep my page" beside "Take the update's page"), so the
 * care is asked of the answer being given: handed a way, this reads it too.
 */
export const hardOf = (card: Pick<Card, 'cost'>, way?: Pick<Way, 'hard'> | null): boolean => card.cost === 'undo' || way?.hard === true;

/**
 * WHAT A BUTTON THAT ANSWERS SAYS, with the care a hard answer asks for in its own words: "Answer, can’t
 * be undone easily", "Accept £12.98, can’t be undone easily". Every other band leaves the words as they are; the band
 * still ranks the card and still takes Enter away (`acceptKey`), it is only not drawn as a chip.
 */
export const pressSaid = (card: Pick<Card, 'cost'>, label: string, way?: Pick<Way, 'hard'> | null): string => (hardOf(card, way) ? queueWords.hard(label) : label);

/** The words a hard answer's button adds after its name (", can’t be undone easily"), or nothing, so the name stays its own. */
export const pressTail = (card: Pick<Card, 'cost'>): string => (hardOf(card) ? queueWords.hardTail : '');

/**
 * THE SAME TAIL FOR ONE BUTTON OF A ROW OF ANSWERS: on the filled one where the whole question is hard to undo, as it
 * always was, and on any answer that is itself the hard one, wherever it stands in the row.
 */
export const wayTail = (card: Pick<Card, 'cost'>, way: Pick<Way, 'key' | 'hard'>, primary: string | null): string =>
  way.hard || (way.key === primary && hardOf(card)) ? queueWords.hardTail : '';

/**
 * THE CARE A ROW OF ANSWERS ASKS FOR, AS A LINE UNDER IT: "Accept, can’t be undone easily" on the red
 * button wrapped to two lines at 390, so the button says its name and the line under the row says the care. Said of
 * the answers `wayTail` marks: bare where the filled one is the only hard one, else naming them. `''` for none.
 */
export function hardSaid(card: Pick<Card, 'cost' | 'ways'>, primary: string | null, lead: string | null = primary): string {
  const hard = card.ways.filter((w) => wayTail(card, w, lead) !== '');
  if (hard.length === 0) return '';
  /* BARE ONLY UNDER THE FILLED ONE; a hard answer left unfilled (`primaryOf`) is named, so it says so of itself. */
  if (hard.length === 1 && hard[0]!.key === primary) return queueWords.hardLine;
  const said = hard.map((w) => queueWords.doing(w.label)).map((d, i) => (i === 0 ? d : d.charAt(0).toLowerCase() + d.slice(1)));
  return queueWords.hardOf(said.join(' or '));
}

/**
 * WHETHER "WHAT IT CHANGES" HAS A LINE UNDER IT: what accepting does, the money it writes, or a change from what to
 * what. The link to the whole change is no line, so a card with the link alone draws the link and no heading over it.
 */
export const saysChanges = (card: Pick<Card, 'does' | 'money' | 'lines'>): boolean => card.does !== '' || card.money !== '' || card.lines.length > 0;

/**
 * HOW ONE FIELD OF A WHOLE CHANGE IS SAID (the question's own page, `Arranged.svelte`), from its two values in words
 * and the page's word for an empty one: `set` where there was nothing before ("Set to Friday", never "Now empty, will
 * be Friday"), `change` where one value replaces another or is taken away, and `none` where both sides hold nothing,
 * which is no change and draws no line.
 */
export const fieldChange = (before: string | null, after: string, empty: string): 'none' | 'set' | 'change' =>
  before === null || before === empty ? (after === empty ? 'none' : 'set') : 'change';

/** THE MOST ANSWERS A ROW OF BUTTONS HOLDS: past three, a row is a list read sideways, and the form's choices read it. */
export const INLINE_MOST = 3;

/**
 * WHETHER THE ANSWERS ARE A ROW OF BUTTONS, each one press that decides, rather than the form's list of choices and
 * Decide. "Chase it" and "Not yet", "It went through" and "It stopped": two or three answers that say what they are in
 * their own name, with no line of what each does and nothing to show, are buttons, as the record's own Accept and
 * Decline always were, and so are two or three where one is suggested (`suggestsOf`). An answer that carries a line of
 * what it does with none suggested, or a fourth answer, keeps the form's list of full-width choices, where that line is
 * read; one press on a choice decides there too where there are no more than
 * three and none is hard to undo (`pressOf`). A merge is neither; it has its own card.
 *
 * `compact` IS A QUESTION SHOWN OUTSIDE DECIDE (Home, a declared page), which draws the question and its buttons only:
 * there a line of what each does is left to the question's own page, one press away, and only a fourth answer still
 * sends the reader there to choose.
 */
export function inlineOf(card: Pick<Card, 'ways' | 'decline' | 'merge' | 'cost'>, compact = false): boolean {
  if (card.merge !== null) return false;
  if (card.decline !== null) return true;
  if (card.ways.length < 2 || card.ways.length > INLINE_MOST) return false;
  if (compact || suggestsOf(card) || card.ways.every((w) => w.because === '' && w.shows === null)) return true;
  /* ONE ANSWER GRAMMAR: two or three answers that each say what they do, none hard to
     undo and none a picture, are a row of buttons too, the first filled, with what it does said under the row. They
     were two bordered boxes that pressed like text and moved 200 entries on one press. */
  return pressOf(card) && card.ways.every((w) => w.shows === null);
}

/**
 * WHETHER THE SUGGESTED ANSWER IS THE BUTTON (plan of 20 October, Needs you 1): a question of two or three answers where
 * an agent suggested one, none of which shows a colour, a figure or a picture. In Needs you its answers are then a row
 * of buttons, the suggested one the red primary in its own words ("Keep the subdomain") and the rest quiet beside it,
 * and the full choices, each with its line of what it does and its drawing, are on the question's own page. An answer
 * that shows something keeps the form, where it is drawn.
 */
export function suggestsOf(card: Pick<Card, 'ways' | 'decline' | 'merge'>): boolean {
  if (card.merge !== null || card.decline !== null) return false;
  if (card.ways.length < 2 || card.ways.length > INLINE_MOST) return false;
  return card.ways.some((w) => w.recommended) && card.ways.every((w) => w.shows === null);
}

/**
 * WHETHER ONE PRESS ON A CHOICE DECIDES, in the form's list: two or three answers, none of them hard to undo (the
 * question's band, or any one answer's own mark), whether or
 * not each carries a line of what it does. The line is read on the choice itself, and the answer is held six seconds
 * for its Undo like every other, so choosing first and pressing Decide after was a second press that guarded nothing.
 * The ring and Decide stay where a press should be two: an answer that is hard to undo, and a fourth answer, which is a
 * list to weigh. The record's own two and a merge have their own buttons.
 */
export function pressOf(card: Pick<Card, 'ways' | 'decline' | 'merge' | 'cost'>): boolean {
  if (card.merge !== null || card.decline !== null || card.cost === 'undo') return false;
  /* NOR WHERE ONE OF THE ANSWERS IS ITSELF HARD TO UNDO: the question's band no longer rises for it, and a press on it
     must still be two, so the whole list keeps its ring and Decide, which says the care when that answer is chosen. */
  if (card.ways.some((w) => w.hard)) return false;
  return card.ways.length >= 2 && card.ways.length <= INLINE_MOST;
}

/**
 * THE ANSWER A ROW OF BUTTONS FILLS WITH THE ACCENT: the suggested one, or else the first, which is Accept on the
 * record's own two. The rest are the quiet fill. Filled is where the eye goes first, not a press made for anybody: Enter
 * still gives only what `enter` allows.
 */
export const primaryOf = (card: Pick<Card, 'ways'> & Partial<Pick<Card, 'cost'>>): string | null => {
  /* AN ANSWER THAT CAN'T BE UNDONE IS NEVER THE FILLED ONE (audit 6g, AG11): "Retire it" stood in the accent over "Park
     it another year" with nothing suggested, the one press a person would take back if they could. The filled one is
     the suggestion when it is not hard; where any answer is hard and none safe is suggested, none is filled, and the
     line under the row names the hard one. With nothing hard, the suggestion or else the first, as before. */
  const lead = leadOf(card);
  const hard = (w: Pick<Way, 'key' | 'hard'>): boolean => w.hard === true || (w.key === lead && card.cost === 'undo');
  const suggested = card.ways.find((w) => w.recommended);
  if (suggested && !hard(suggested)) return suggested.key;
  if (suggested || card.ways.some(hard)) return null;
  return lead;
};

/** The answer a card leads with before any care is weighed: the suggested one, or else the first. */
export const leadOf = (card: Pick<Card, 'ways'>): string | null => (card.ways.find((w) => w.recommended) ?? card.ways[0])?.key ?? null;

/**
 * THE ANSWER A PRESS KEPT FOR THE RECORD ASKED FOR (fluid F5), if the card still offers it saying the same words. The press
 * was made on the saved copy, and the record may have taken the answer away or changed what its button says (a money row
 * names its amount): another answer is never given in its place, so the reader is told and looks.
 */
export function keptWay<W extends { key: string }>(ways: readonly W[], asked: { key: string; said: string }, said: (way: W) => string): W | null {
  return ways.find((w) => w.key === asked.key && said(w) === asked.said) ?? null;
}

/**
 * THE ANSWER A FORM STARTS ON: the one Enter would give (`enter`), so the suggestion is already chosen where a key may
 * give it, and nothing is chosen where the answer is hard to undo or money moves. A question the record answers with
 * its own two (Accept, Decline) or a merge has no choice to start on: its buttons are the answers.
 */
export const startsOn = (card: Pick<Card, 'enter' | 'decline' | 'merge'>): string | null =>
  card.merge === null && card.decline === null ? card.enter : null;

/**
 * THE LINE A CARD BECOMES ONCE IT IS ANSWERED. A proposal Slash drafted reads as its history does: "Slash suggested ·
 * Mara accepted", the reader by the name the record gives them. Every other question says what was chosen, by you, and
 * when.
 */
export function answeredLine(card: Pick<Card, 'slash'>, way: Pick<Way, 'key' | 'label' | 'recommended'>, person: string, when: string): string {
  if (!card.slash) return cardWords.answered(way.label, when);
  const verb = way.key === 'reject' ? cardWords.declined : way.key === 'accept' || way.recommended ? cardWords.accepted : cardWords.chose(way.label);
  return cardWords.slash(person, verb);
}

/** A question as Decide's classic screen reads it (`governance.ts` `questionOf`). */
type Classic = {
  id: string;
  title: string;
  band?: string | undefined;
  opened: string;
  context?: string | undefined;
  options: readonly { key: string; title: string; body: string; recommended?: boolean | undefined; hard?: boolean | undefined }[];
};

/**
 * DECIDE'S CLASSIC QUESTION AS A QUEUE QUESTION, so its screen draws the one card too. `about` is what the record says
 * it was filed as and who filed it. The record's own two answers go as none, so the card says them in its own words
 * (Accept, with its amount, and Decline), as it does on every other screen.
 */
export function queueOf(q: Classic, about?: { kind?: string | undefined; by?: string | undefined }): QueueQuestion {
  const two = twoWords({ options: q.options });
  return {
    id: q.id,
    who: about?.by ?? '',
    at: q.opened,
    kind: about?.kind ?? (two ? 'rowset' : 'options'),
    question: q.title,
    why: q.context ?? '',
    cost: (q.band ?? 'call') as QueueQuestion['cost'],
    options: two ? [] : q.options.map((o) => ({ key: o.key, label: o.title, because: o.body, recommended: o.recommended === true, ...(o.hard === true ? { hard: true as const } : {}) })),
  };
}

/* ── a card's answers, at most two and one quiet Later ───────────────────── */

/** THE MOST ANSWERS A CARD'S ROW SHOWS AS BUTTONS: the suggested one and one other. The rest are on the question's page. */
export const ANSWERS_MOST = 2;

/** An answer that only puts the question off ("Later", "Not now", "Ask me later"), which the card draws as its quiet Later. */
const LATER_SAID = /^(?:later|not now|ask me later|ask later|remind me later|maybe later)\.?$/iu;

/**
 * WHETHER AN ANSWER OF THE ASKER'S OWN ONLY PUTS THE QUESTION OFF, so it is the one Later and no second is drawn beside
 * it. One rule for the card and the question's own page: the page also counted "Not yet", which on a chase is an answer
 * (do not chase it yet), so the opened question dropped the Later its card has (audit of 31 October, A24).
 */
export const putsOff = (label: string): boolean => LATER_SAID.test(label.trim());

/** THE DAY A QUESTION WAS ASKED, as a card's foot says it: "3 Sep", three letters for the month as every date reads. */
export function askedDay(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? `${at.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getMonth()]}` : '';
}

/**
 * THE ROW OF ANSWERS A CARD DRAWS: at most two answers, the one the row fills first, and one quiet Later. An answer of
 * the asker's own that only puts the question off is that Later, so a card never shows "Later" and "Ask me later"
 * together. `more` is how many answers are left to the question's own page.
 */
export function answerRowOf<W extends { key: string; label: string }>(ways: readonly W[], primary: string | null): { shown: W[]; later: W | null; more: number } {
  const later = ways.length > 2 ? (ways.find((w) => putsOff(w.label) && w.key !== primary) ?? null) : null;
  const rest = ways.filter((w) => w !== later);
  const first = rest.find((w) => w.key === primary);
  const ordered = first ? [first, ...rest.filter((w) => w !== first)] : rest;
  return { shown: ordered.slice(0, ANSWERS_MOST), later, more: Math.max(0, ordered.length - ANSWERS_MOST) };
}

/**
 * WHY AN ANSWER CAN'T BE UNDONE EASILY, in a few words beside the warning: money on entries already here, something
 * turned off, entries removed. Read off what the card holds, never a guess; an answer its asker marked hard says nothing more.
 */
export function hardWhy(card: Pick<Card, 'moves' | 'filed' | 'ways'>, kinds: readonly string[] = []): string {
  if (card.moves.length > 0 || kinds.some((k) => /(?:^|:)money(?::|$)/u.test(k))) return 'It changes amounts already here.';
  if (card.filed === 'pack' || card.filed === 'settings') return 'It turns something off.';
  if (kinds.some((k) => k.endsWith(':delete'))) return 'It removes entries.';
  /* THE ASKER MARKED IT HARD AND SAID NO MORE, so the warning stands alone rather than repeating itself. */
  if (card.ways.some((w) => w.hard)) return '';
  return 'Each change goes back by hand.';
}

/** THE LADDER'S LINE ("… ask until 10 of them have been kept as they were"), drawn behind an info mark and not as why. */
export const ladderLine = (why: string): boolean => /\bask until \d+ of them have been kept\b/u.test(why);
