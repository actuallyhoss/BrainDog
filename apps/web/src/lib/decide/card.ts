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
 * NO ADDRESS AND NO ID IN THE WORDS. The question, its why and what accepting does were written by whoever asked, and
 * an agent writes `alex@acme.com`, `tasks#8` or a file path into them as readily as a name (audit 19 M11). Each is
 * read through `spoken` before it is drawn, and a signer that is an address is Someone.
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
import { changesSomething, laterLine, proposer, queueMergeOf, queueWords, saidOf, waysOf, type Way } from '../page/queue-answer.ts';
import type { Merge } from '../../routes/decide/merge.ts';
import { copy } from '../copy.ts';
import { nameWords } from '../record/names.ts';
import { acceptKey, amountSaid, declineKey, labelOf, twoWords } from '../../routes/decide/press.ts';
import { words as decideWords } from '../../routes/decide/words.ts';

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
} as const;

/** Who asked, as the by-line says it: the face and name, the app it ran in, the run, each only where it is a name. */
export type Asker = { name: string; kind: ActorKind; app: string | null; run: string | null };

/** One thing accepting changes, from what to what, in words. `what` is empty where the record names no field. */
export type Shift = { what: string; before: string; after: string };

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
  /** What accepting the lead does, in one line, or empty. */
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

/* ── words a person reads, with no address or id in them ───────────────────────────────────────────────────────── */

/* A MAIL ADDRESS, and one in brackets after the name it belongs to ("Alex <alex@acme.com>", "Jo (jo@x.io)"), which
   goes whole rather than reading "Jo (someone)". */
const MAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const BRACKETED = /\s*<[^<>\s]+@[^<>\s]+>|(?<=[\p{L}.])\s*\([^()\s]+@[^()\s]+\)/gu;
/* A WEB ADDRESS is said as the site it is on; one on a machine or a local network says nothing. */
const WEB = /\bhttps?:\/\/([^\s/?#]+)[^\s]*/giu;
const LOCAL = /\b[\w-]+\.(?:local|lan|internal|home)\b(?::\d+)?/giu;
const IP = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/gu;
/* A FILE PATH: from the root, the home folder or a drive, or three or more parts of a relative one. A date is no path. */
const ROOTED = /(?<=^|[\s("'\u201C\u2018])(?:(?:~|[A-Za-z]:)[\\/]|[\\/][^\s"'()\u201D\u2019\\/]+[\\/])[^\s"'()\u201D\u2019]*/gu;
const RELATIVE = /(?<=^|[\s("'\u201C\u2018])[\w.-]*[A-Za-z][\w.-]*(?:\/[\w.-]+){2,}/gu;
/* AN ID: a ULID, a row's handle (`tasks#8`), a commit's hash (two digits and a letter, so "defaced", "face2face" and
   "20261001" stay), a question's own (`SG14`), a person's (`p_…`) and a signer's (`agent:claude`, `rule:late`). */
const IDS = [
  /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu,
  /\b[a-z][a-z0-9_-]*#\d+\b/giu,
  /\b(?=(?:[0-9a-f]*\d){2})(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gu,
  /\bSG\d+\b/gu,
  /\bp_[A-Za-z0-9]+\b/gu,
  /\b(?:agent|runner|ingest|rule|token):[\w.-]+/gu,
];
/* WHERE SOMETHING WAS TAKEN OUT, held until the words around it are read: a character no sentence holds. */
const GONE = '\u0000';
/* A WORD LEFT POINTING AT NOTHING once what it named is out: "asked by agent:claude about it" is "asked about it", and
   "asked about in" at the end is "asked". A word before a gap that the sentence goes on from keeps its place. */
const LINK = '(?:in|on|at|about|for|to|of|from|with|by|see|as|via)';
const HUNG = new RegExp(`(?:\\s+|(?<=\\())${LINK}\\s*${GONE}(?=\\s*(?:[,.;:!?…)]|$|${GONE}|\\s${LINK}\\b|\\s(?:and|or|because|so|but)\\b))`, 'giu');
const DANGLING = new RegExp(`\\s+${LINK}(?=[.!?…:]?$)`, 'iu');

/** Where a path or an id stood, marked: the stop that ended the sentence stays when the path ate it. */
const gone = (m: string): string => GONE + (/[.,;:!?]$/u.exec(m)?.[0] ?? '');

/**
 * WORDS A PERSON READS, with every address and id taken out: a mail address is someone, a web address its site, and a
 * path, a machine's address, a handle or an id goes with the word it hung from. Slash's braces and money are already
 * words by the time this reads them (`saidOf`).
 */
export function spoken(text: string): string {
  let t = text
    .replaceAll(GONE, '')
    .replace(BRACKETED, '')
    .replace(MAIL, (_m, at: number) => (at === 0 ? 'Someone' : 'someone'))
    .replace(WEB, (m, host: string) => {
      const site = host.replace(/^www\./iu, '').replace(/:\d+$/u, '');
      const local = /\.(?:local|lan|internal|home)$/iu.test(site) || /^[\d.]+$/u.test(site) || site === 'localhost';
      return local ? gone(m) : site + gone(m).slice(GONE.length);
    })
    .replace(LOCAL, gone)
    .replace(IP, gone)
    .replace(ROOTED, gone)
    .replace(RELATIVE, (m) => (/^[\d/.-]+$/u.test(m) ? m : gone(m)));
  t = IDS.reduce((x, re) => x.replace(re, GONE), t);
  /* A BRACKET LEFT HOLDING NOTHING goes too, the commas between what went with it, so the word before it is read
     against what follows ("changed in (a.ts, b.ts)" is "changed", not "changed in (, )"). */
  for (let was = ''; was !== t; ) [was, t] = [t, t.replace(HUNG, GONE).replace(new RegExp(`\\(\\s*(?:${GONE}[\\s,;]*)*\\)`, 'gu'), GONE)];
  t = t
    .replaceAll(GONE, '')
    .replace(/[(\[]\s*[)\]]/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([,.;:!?…])/gu, '$1')
    .replace(/([,;:])(?=[,.;:!?])/gu, '')
    .trim();
  while (DANGLING.test(t)) t = t.replace(DANGLING, '');
  return t.replace(/^[,.;:·\s]+/u, '').trim();
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

/**
 * A value from before or after a change, in words: money in its currency, a list joined, an empty value said as nothing.
 * `null` for a value that is an id or a handle, which no card says, so the change it belongs to is left to its page.
 */
function valueSaid(v: unknown, home: string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return cardWords.nothing;
  const m = movedOf(v, true);
  if (m) return home === undefined ? moneyInText(money(m.amount, m.currency)) : moneyInText(money(m.amount, m.currency), home);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('en-GB') : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (ULID.test(s) || /^[a-z][\w-]*#\d+$/u.test(s) || /[\\/]/u.test(s)) return null;
    const said = saidOf(s);
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
  const out: Shift[] = [];
  const push = (what: unknown, before: unknown, after: unknown) => {
    const b = valueSaid(before, home);
    const a = valueSaid(after, home);
    if (a !== null && b !== null && a !== b) out.push({ what: fieldSaid(what), before: b, after: a });
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
 * THE CARD, from one question.
 *
 * ACCEPT NAMES ITS AMOUNT AND REJECT SAYS DECLINE, on the record's own two answers (`press.ts` `labelOf`), so a button
 * says what it does. The suggestion is marked on every card; Enter gives an answer only where the choice can be undone
 * and no money moves (`acceptKey`).
 */
export function cardOf(q: QueueQuestion, ctx: CardContext): Card {
  const by = askerOf(q, ctx.me ?? null, ctx.names ?? new Map());
  const moves = movesOf(field(q, 'money'));
  const plain = waysOf(q);
  const keyed = { options: plain.map((w) => ({ key: w.key, recommended: w.recommended })) };
  const said = moves.length === 0 ? '' : ctx.home === undefined ? amountSaid(moves) : amountSaid(moves, ctx.home);
  /* THE AMOUNT IN THE RECORD'S OWN CURRENCY, which `labelOf` reads from the shell: here it is the host's, when handed. */
  const labelled = (w: Way): string =>
    w.key === 'accept' && said !== '' && twoWords(keyed) ? decideWords.acceptFor(said) : labelOf({ key: w.key, title: w.label }, keyed, moves);
  const ways = plain.map((w) => ({ ...w, label: labelled(w) }));
  const merge = queueMergeOf(q, plain.map((w) => w.key));
  const does = ctx.lead && typeof q.does === 'string' ? spoken(saidOf(q.does)) : '';
  const filed = typeof q.body_kind === 'string' ? q.body_kind : q.kind;
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
 * THE LINE A CARD BECOMES ONCE IT IS ANSWERED. A proposal Slash drafted reads as its history does: "Slash suggested ·
 * Sam accepted", the reader by the name the record gives them. Every other question says what was chosen, by you, and
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
  options: readonly { key: string; title: string; body: string; recommended?: boolean | undefined }[];
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
    options: two ? [] : q.options.map((o) => ({ key: o.key, label: o.title, because: o.body, recommended: o.recommended === true })),
  };
}
