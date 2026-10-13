/**
 * ONE DECISION CARD, AS A PERSON READS IT (DIRECTION §37, "one decision card everywhere"): what `DecisionCard.svelte`
 * draws on Home, Money, Work, a project's page, the Agents page, Decide, its classic screen and Slash's palette, worked
 * out once from the record's `QueueQuestion` and nothing else.
 *
 * WHY FIRST. The question, then at once why it is asked, then who asked (the agent, the app it ran in and the run), then
 * what it moves: the money accepting writes and what changes from what to what, where the record says. The ways to
 * answer come last, the suggested one marked with the small dot (his pick) on every card. Where the choice is hard to
 * undo or money moves, the dot stays and only Enter is taken away (`press.ts` `acceptKey`): hiding the suggestion
 * there hid the agent's advice exactly where it matters most (audit 19 M10).
 *
 * NO ADDRESS AND NO ID IN THE WORDS. The question, its why, what accepting does, each answer and why it is offered,
 * what a change was and becomes, and why a question was put off were written by whoever asked, and an agent writes
 * `alex@acme.com`, `tasks#8` or a file path into them as readily as a name (audit 19 M11, audit 21 #4). Each is read
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
import { money, queueCost, since } from 'braindog-render';

import { moneyInText } from '../record/money.ts';
import type { ActorKind } from '../record/names.ts';
import { changesSomething, laterLine, proposer, queueMergeOf, queueWords, saidOf, waysOf, type FileAt, type Way } from '../page/queue-answer.ts';
import type { Merge } from '../../routes/decide/merge.ts';
import { copy } from '../copy.ts';
import { nameWords } from '../record/names.ts';
import { acceptKey, amountSaid, declineKey, labelOf, twoWords } from '../../routes/decide/press.ts';
import { words as decideWords } from '../../routes/decide/words.ts';
import { arrangedOf, isArranging } from '../../routes/decide/[id]/arranged.ts';
import { spoken } from './spoken.ts';

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
  chose: (option: string) => `chose ${option}`,
  /** Beside the line while the answer waits out its six seconds. */
  undo: 'Undo',
  /** What accepting writes, when money moves. */
  moves: (amount: string) => `Moves ${amount}`,
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
  /** Said to a screen reader before who asked, on the line over the question; the question's own page heads its side with it. */
  askedBy: 'Asked by',
  /** THE CARD'S SIDE, ON A WIDE TILE (DIRECTION §39): why it is asked and what it changes, each under a quiet heading. */
  why: 'Why it’s asked',
  changes: 'What it changes',
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
  /** What accepting the lead does, in one line, or empty; an arrangement's own summary on every card that is one. */
  does: string;
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
  /** The ways to answer, in the record's order; Accept names its amount and Reject says Decline. */
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
    const said = spoken(saidOf(v.trim()));
    if (said === '' || ULID.test(said) || /^[a-z][\w-]*#\d+$/u.test(said) || /[\\/]/u.test(said)) return null;
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
  const out: ShiftLine[] = [];
  const push = (label: unknown, before: unknown, after: unknown) => {
    const b = valueSaid(before, home);
    const a = valueSaid(after, home);
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
  return out.slice(0, 3);
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
  /* A RUN SIGNS AS ITS HANDLE (`S42`), which `actor` says as An agent: where the record names the app it ran in, that
     is the name, so the by-line reads "Claude Code · Tidy invoices" and not "An agent · Claude Code". */
  if (who.kind === 'agent' && who.name === nameWords.agent && app !== null) return { name: app, kind: 'agent', app: null, run: runName };
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
 * AN ARRANGEMENT IS SAID IN ITS OWN SUMMARY (REC-A07 step 3): what it sets up, then the keys, updates, feeds and rows it
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

/**
 * THE CARD, from one question.
 *
 * ACCEPT NAMES ITS AMOUNT AND REJECT SAYS DECLINE, on the record's own two answers (`press.ts` `labelOf`), so a button
 * says what it does. The suggestion is marked on every card; Enter gives an answer only where the choice can be undone
 * and no money moves (`acceptKey`).
 */
export function cardOf(q: QueueQuestion, ctx: CardContext): Card {
  const by = askerOf(q, ctx.me ?? null, ctx.names ?? new Map());
  const moves = movesOf(field(q, 'money'));
  const plain = waysOf(q, ctx.file);
  const keyed = { options: plain.map((w) => ({ key: w.key, recommended: w.recommended, hard: w.hard })) };
  const said = moves.length === 0 ? '' : ctx.home === undefined ? amountSaid(moves) : amountSaid(moves, ctx.home);
  /* THE AMOUNT IN THE RECORD'S OWN CURRENCY, which `labelOf` reads from the shell: here it is the host's, when handed. */
  const labelled = (w: Way): string =>
    w.key === 'accept' && said !== '' && twoWords(keyed) ? decideWords.acceptFor(said) : labelOf({ key: w.key, title: w.label }, keyed, moves);
  const ways = plain.map((w) => ({ ...w, label: labelled(w) }));
  const merge = queueMergeOf(q, plain.map((w) => w.key));
  const filed = typeof q.body_kind === 'string' ? q.body_kind : q.kind;
  const arranged = arrangementOf(q, filed, ctx.body);
  const does = arranged !== '' ? arranged : ctx.lead && typeof q.does === 'string' ? spoken(saidOf(q.does)) : '';
  const cost = typeof q.cost === 'string' ? q.cost : '';
  return {
    id: q.id,
    href: `/decide/${encodeURIComponent(q.id)}`,
    question: spoken(saidOf(q.question)),
    why: q.why ? spoken(saidOf(q.why)) : '',
    by,
    when: since(q.at, ctx.now),
    later: laterLine(q, ctx.now),
    does,
    joined: joinedOf(q, merge),
    cost,
    band: cost && cost !== 'call' ? queueCost(cost) : '',
    moves,
    money: said === '' ? '' : cardWords.moves(said),
    shifts: shiftsOf(q, ctx.home),
    lines: shiftLinesOf(q, ctx.home),
    ways,
    enter: acceptKey({ options: keyed.options, band: cost }, moves.length > 0),
    decline: declineKey(keyed),
    merge,
    seeWhole: changesSomething(q),
    filed,
    slash: bySlash(q, by.kind),
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
 * WHAT A BUTTON THAT ANSWERS SAYS, with the care a hard answer asks for in its own words (DIRECTION §39): "Decide, can’t
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
 * Decline always were. An answer that carries a line of what it does, or a fourth answer, keeps the form's list of
 * full-width choices, where that line is read; one press on a choice decides there too where there are no more than
 * three and none is hard to undo (`pressOf`). A merge is neither; it has its own card.
 *
 * `compact` IS A QUESTION SHOWN OUTSIDE DECIDE (Home, a declared page), which draws the question and its buttons only:
 * there a line of what each does is left to the question's own page, one press away, and only a fourth answer still
 * sends the reader there to choose.
 */
export function inlineOf(card: Pick<Card, 'ways' | 'decline' | 'merge'>, compact = false): boolean {
  if (card.merge !== null) return false;
  if (card.decline !== null) return true;
  if (card.ways.length < 2 || card.ways.length > INLINE_MOST) return false;
  return compact || card.ways.every((w) => w.because === '' && w.shows === null);
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
export const primaryOf = (card: Pick<Card, 'ways'>): string | null => (card.ways.find((w) => w.recommended) ?? card.ways[0])?.key ?? null;

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
