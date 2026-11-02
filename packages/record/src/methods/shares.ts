/**
 * The record's links to one page: `openShare`, `closeShare` and `shares` for the owner, and `sharedPage` for whoever
 * holds a link.
 *
 * NO TABLE AND NO KEY. A link is two events of kinds the ledger already has: `share.open` when the owner opens it and
 * `share.close` when it is closed, each on `target: 'share:<id>'` with the page's slug in `field`, and `share.open`
 * holding the instant it stops opening in `to_v`. They hold a slug and two instants and no person's words, so erasure
 * has nothing to take from them. The token is the host's (`packages/host/src/share.ts`), signed under a key the record
 * never holds, and nothing in this file sees one.
 *
 * A LINK OPENS THE PAGE AS ITS OWNER COULD READ IT NOW, AND ONLY WHILE THEY STILL CAN. Every read asks again whether the
 * link was closed, whether it has run out, whether the person who opened it is still an owner of this record and not
 * suspended, and whether the page is still here. Each of those is the one refusal `SHUT`, which each host answers as
 * one 404 with no body, so a stranger holding a link learns that it does not open and nothing else.
 *
 * AND ONE LEVEL DEEP, WHICH IS A LIST OF WHAT IS KEPT AND NOT A LIST OF WHAT IS TAKEN. The page's answer is built for
 * the owner and carries row ids, the lists and fields each block reads, addresses of other pages and whatever a block
 * kind added last month. A list of keys to take off leaks the first key nobody thought of, so `shownBlock` builds each
 * block from nothing: how it is drawn (`LOOKS`), what the record computed that names no row (`FIGURES`), and each row's
 * own values of the fields the block draws, by field type (`SHOWN_TYPES`). WHICH BLOCKS ARE SENT IS A LIST OF WHAT IS
 * KEPT TOO (`SHARE_KINDS`, `shareDraws`): a kind or a source nobody put on it is not sent at all, so a source added to
 * the kernel next month reaches no link until somebody decides it may. A block that writes, links, or reads across the
 * record is never sent: its heading alone would say "Nothing is waiting on you" about a record where things are.
 *
 * AND IT TELLS THE TRUTH. Every cell carries its type and its value, money whole as minor units and its own
 * currency; every column and figure carries the label the owner reads; a `{{path}}` in the owner's words is filled here
 * in the record's language, and one with nothing to fill prints nothing; and the answer says the record's language and
 * zone, so a stranger's device does not decide how a number or a day reads.
 *
 * MONEY ONLY WHEN THE SHARER SAID SO (audit f, AF18). A link opened from now on carries `money` on its `share.open`, and
 * it is false unless `openShare` was told `money: true`: every amount, every money figure and every list that is money
 * is then kept off the link (`moneyFree`). A link opened before carries nothing about money and shows what it showed.
 *
 * ONLY WHERE THE HOST SAYS IT CAN. `shareable` asks the host (`shares` in the record's dependencies), and a host that
 * never said is a host that cannot, so links ship switched off until somebody switches them on.
 */

import { NOBODY, fill, instant, isMoneyFormat, maskMoneyText, isMoneyUnit, sourceReadsWhole, ulids, type BlockResult, type Entry, type FieldType, type Json, type PageResult, type RegisterDecl } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { TYPED, dateSaid, formatTyped, kindSpec, splitRow, writeAmount, type TypedForm } from 'braindog-render';
import { ok } from '@braindog/ports';

import { labelsOf } from '@braindog/declare';
import { speakingNow } from '../arrange.ts';
import { agentLists } from '../agent-lists.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** A noun's many: an s, except "person(s)", which is people and never "persons" (AN16). */
const manyOf = (word: string): string => (word === 'person' ? 'people' : word === 'Person' ? 'People' : `${word}s`);

/** How long a link opens for when the owner does not say, and the longest they may say, in days. */
export const SHARE_DAYS = 30;
export const SHARE_DAYS_MOST = 90;

/** The most links `shares` answers, newest first. It walks only the `share:` targets, through the ledger's index. */
export const SHARES_LISTED_MOST = 500;

/** The longest share id a caller's `closeShare` is looked up by. The record mints ULIDs, which are shorter. */
const SHARE_ID_MOST = 64;

const DAY_MS = 86_400_000;

/**
 * The one answer to a link that does not open, whatever the reason: closed, run out, an opener who is no longer an
 * owner, a page that is gone, a link naming a page it was not opened for, or a caller that is not a link at all.
 *
 * ONE SENTENCE FOR ALL OF THEM, because the hosts answer it as a bare 404, and a signed-in person asking `/api/sharedPage`
 * without a link is told no more than a stranger with a dead one.
 */
const SHUT: Refusal = { code: 'PAGE_UNKNOWN', fix: 'This link does not open a page. Ask whoever sent it for a new one.', at: 'share' };

/** What `openShare` answers, before the host signs `token` and `url` into it (`ShareOpened` in `@braindog/host`). */
export type ShareOpened = { id: string; slug: string; expires_at: string };

/** One link as `shares` lists it: never its token, which only the host could make and nobody keeps. */
/** `money`: whether the link shows amounts, as it was made (`openShare`), so the owner's list can say so beside it. */
export type ShareRow = { id: string; slug: string; title: string; opened_at: string; expires_at: string; closed_at: string | null; money: boolean };

/** Whether a link's kept choice (`from_v` of its `share.open`) shows money; a link older than the choice shows none. */
const moneyOn = (bound: string | null): boolean => {
  try {
    return bound !== null && (JSON.parse(bound) as { money?: unknown }).money === true;
  } catch {
    return false;
  }
};

/** What `sharedPage` answers: the page one link opens, as `shownPage` builds it. */
export type SharedPage = {
  title: string;
  read_at: string | null;
  /** The page's two columns, when it has them: the rail's width in twelfths, and whether it stays in view. */
  layout: { rail?: number; sticky?: boolean } | null;
  /** When the link stops opening, so the reader can say so. */
  expires_at: string;
  /** The record's language (a BCP 47 tag) and its zone (an IANA name), which a number, an amount and a day are read in. */
  language: string;
  zone: string;
  /**
   * The record's home currency, or `null` for a record with none: an amount in it is written by its sign alone ("£4,050"),
   * as every screen of the app writes it, and any other keeps its code. Two currencies are still never one sum.
   */
  home: string | null;
  /** One calm line when no block of the page can be shown through a link, and `null` while one can. */
  empty: string | null;
  blocks: Record<string, unknown>[];
  /**
   * WHAT A PAGE OF ONE PROJECT SAYS ABOUT IT (collab pass 2, 2 Nov), or absent for any other page: the owner's page is
   * drawn from `project` blocks the app works out across the record, which no link may carry, so a link to Harbour
   * rebrand drew one "At a glance" tile. This is the part of that a stranger may read, worked out here as nobody.
   */
  project?: SharedProject;
};

/** One piece of work on a shared project: its words, its state in the list's own word, and its deadline day if it has one. */
export type SharedTask = { title: string; state: string; done: boolean; due: string | null; on: string | null };

/**
 * A project as a link shows it. Names only: no id, no person, no address, no amount on a link that keeps money off.
 *   - `lane` its status word, `about` its one line, `next` its next step (its own, else its first open piece of work);
 *   - `work` each list of work that points at it (a team's Tickets), its open rows first, and what was finished lately;
 *   - `notes` its note as written, links into the record said as their words;
 *   - `happened` what moved on it lately, said without who.
 */
export type SharedProject = {
  name: string;
  lane: string | null;
  about: string | null;
  next: string | null;
  work: { list: string; one: string; many: string; open: SharedTask[]; more: number; done: SharedTask[] }[];
  notes: string | null;
  happened: { at: string; said: string }[];
  /**
   * ITS MONEY, ON A LINK THAT CARRIES MONEY AND NEVER ON ONE THAT DOES NOT (leftovers 4, 2 Nov): the three figures the
   * owner's Money tile reads (`project-owed`, `project-in-month`, `project-out-month`), read as nobody, each said as
   * every screen says an amount, and only those above nought. Absent on a link without money; empty, nothing to say.
   */
  money?: { key: 'owed' | 'in' | 'out'; label: string; said: string }[];
};

/**
 * One cell of a shared row: the field's type and its value, as the owner's own table reads it. Money is
 * `{ amount, currency }` in minor units, never added to another; a choice carries the word the owner reads for it; a
 * list says the type of what it holds.
 */
export type SharedCell = { type: FieldType; of?: FieldType; value: Json; label?: string; unit?: string };

/** The host's answer to whether it can make a read-only link, and why not (`sharesOf` at the Worker's door). */
/** Whether a link can be made, the host's sentence when not, and, asked of a page, whether its link would show nothing. */
export type SharesAnswer = { can: boolean; why?: string; empty?: true; page?: SharedPage };

/** What `shareable` says on a host that never answered, or said no without a sentence. */
export const SHARES_OFF = 'Read-only links are switched off on this BrainDog.';

/** What `shareable` says to an owner who is not signed in, as `openShare` refuses her. */
const SHARES_SIGNED_IN = 'A link can be read from anywhere, so opening one needs the owner signed in. Open this from the app.';

/** The one line a shared page says when none of its blocks can be shown. */
export const NOTHING_SHOWN = 'This page has nothing a link can show.';

/** How a block is drawn: the owner's words on the page and where they sit. None names a list, a field, a row or a page. */
const LOOKS = ['kind', 'heading', 'span', 'area', 'tone', 'lead', 'range', 'tiles', 'who', 'box', 'fold', 'icon', 'empty', 'body'] as const;

/**
 * What the record computed that names no row: counts, figures, buckets and the flags aligned with the rows a block drew.
 * `readings`, `walk` and `walks` are not here because each carries something that does (a figure's refusal, a step's
 * list and row), and each is rebuilt below with that taken off.
 */
const FIGURES = [
  'matched', 'fx', 'walkFx', 'bars', 'measures', 'past', 'lateness', 'late_name', 'sells', 'rings', 'nexts', 'trends', 'done_now',
  'next', 'open', 'short_now', 'inherited', 'scopes', 'scope_marks', 'window',
] as const;

/**
 * THE KINDS A LINK MAY DRAW: AN ALLOW-LIST, NOT A LIST OF WHAT IS HELD BACK (security review of 30 Oct, SEC2). Every
 * kind the kernel admits that draws what the page itself reads. Not here, so never sent, not even their heading:
 * `capture`, `inputs` and `form` write; a `link` block is links; `feed`, `queue` and `agents` read the whole record's
 * log and questions and name rows of every list; a `diff` names who changed a row and when; a `project` block is the
 * project's own shape, which the app reads beside the page from across the record. A kind added later is not sent until
 * it is put here, which `shares-allow.test.ts` asks of every kind the kernel knows.
 */
export const SHARE_KINDS: ReadonlySet<string> = new Set([
  'note', 'quote', 'stat', 'bar', 'gauge', 'chips', 'spec', 'params', 'todo', 'steps', 'timeline', 'board', 'code', 'tree',
  'comparison', 'table', 'cards', 'section', 'sparkline', 'split', 'bridge', 'series', 'forecast', 'lines', 'progress',
  'roadmap', 'ring', 'heat', 'kpis', 'calendar', 'gallery', 'embed', 'lanes', 'drawn',
]);

/** Whether a link may draw a kind: one of `SHARE_KINDS`, or a kind a pack declares (`block.x`), which draws only on display primitives. */
export const shareKind = (kind: string): boolean => SHARE_KINDS.has(kind) || /^block\.[a-z][a-z0-9_-]{0,31}$/u.test(kind);

/**
 * THE COMPUTED SOURCES A LINK MAY DRAW, BY NAME, beside a list's rows (`register.x`) and a figure (`metric.x`). Each reads
 * named lists the page already shows and names no row of any other: a cash walk over the legs its block names, and the
 * figures pinned to Home. Every other source the kernel registers (`SOURCE_MODULES`) is held back, whether it reads the
 * whole record (`activity`, `governance.*`, `usage.*`, `exceptions`, `kpis`, `scripts`) or rows of lists the page never
 * shows (`handoffs.open` sent agents' next steps, `deadlines` every list's rows and states): the old list of what was
 * held back had drifted from the record's own and let all of those through.
 */
export const SHARE_SOURCES: ReadonlySet<string> = new Set(['forecast.runway', 'figures.home']);

/**
 * Whether a link may draw a block with this `source`: none, a list's rows, a figure, or one of `SHARE_SOURCES`, AND NEVER
 * ONE THAT READS ACROSS THE WHOLE RECORD, by the kernel's one list of them (`sourceReadsWhole`), the list the record holds back
 * from a member by. So a source marked `whole` is off every link even if somebody puts its name on `SHARE_SOURCES`.
 */
export const shareDraws = (source: unknown): boolean =>
  source === undefined ||
  source === null ||
  source === '' ||
  (typeof source === 'string' && !sourceReadsWhole(source) && (/^(?:register|metric)\.[a-z]/u.test(source) || SHARE_SOURCES.has(source)));

/**
 * The lists that, named among what a block reads, keep it off a link: the whole record (`*`, as the kernel names a block
 * over a source that reads across it) and the agents' runs (`session`), whose rows carry what an agent is doing next.
 */
const NEVER_READ: ReadonlySet<string> = new Set(['*', 'session']);

/**
 * The field types whose values a shared row keeps. Absent are `ref` (another row's id), `file` (a stored file the
 * stranger cannot fetch), `document` (a second level of its own), `json`, `secret`, and `url`, which `valueShown` keeps
 * only when it leaves this BrainDog.
 */
const SHOWN_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'text', 'int', 'duration', 'decimal', 'money', 'quantity', 'day', 'instant', 'bool', 'enum', 'email',
]);

const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** A plain value: a string, a number, a boolean or null. Anything with keys is a level this page does not go down. */
const isScalar = (x: unknown): x is string | number | boolean | null => x === null || ['string', 'number', 'boolean'].includes(typeof x);

/** A ULID, the shape of every id the record mints: a row's, a link's, an event's. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/**
 * An address into this BrainDog, a path or a fragment, which is a link to another page or row, or an id the record
 * minted, which names one. Neither is ever shown.
 */
const inside = (x: unknown): boolean => typeof x === 'string' && (/^\s*[/#]/u.test(x) || ULID.test(x.trim()));

/** `{{bad:`, with the space the renderer allows (`{{ bad : late }}`). */
const BAD_OPEN = /\{\{\s*bad\s*:\s*/uy;

/**
 * THE OWNER'S WORDS WITH EACH `{{bad:…}}` SAID AS ITS WORDS, without its colour (audit 31 Oct n, AN3): Money's
 * "Bills {{bad:late}}: … to pay" read "Bills : £10,540 to pay" on a link, since the form was asked for as a path, found
 * nothing, and printed nothing, and the line lost the one word it leads with. What the form holds is the owner's words
 * and any `{{…}}` inside, which are filled after as every other one is. It closes as the renderer's `pairs` closes it:
 * counting the `{{` inside, and an odd run of `}` giving its first one away. One never closed is left as written.
 */
export const badSaid = (text: string): string => {
  if (!/\{\{\s*bad\s*:/u.test(text)) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    BAD_OPEN.lastIndex = i;
    const open = BAD_OPEN.exec(text);
    if (open === null) {
      out += text[i];
      i += 1;
      continue;
    }
    const from = i + open[0].length;
    let depth = 1;
    let at = from;
    let close = -1;
    while (at < text.length && close < 0) {
      if (text.startsWith('{{', at)) {
        depth += 1;
        at += 2;
      } else if (text[at] === '}') {
        let end = at;
        while (text[end] === '}') end += 1;
        const first = at + ((end - at) % 2);
        const closes = (end - first) / 2;
        if (closes >= depth) close = first + 2 * (depth - 1);
        else depth -= closes;
        at = end;
      } else at += 1;
    }
    if (close < 0) return out + text.slice(i);
    out += badSaid(text.slice(from, close)).trimEnd();
    i = close + 2;
  }
  return out;
};

/**
 * The owner's words with every link into this BrainDog left as its words: `[the handbook](/p/handbook)` is shown as
 * `the handbook`. A link that leaves is kept, because it opens nothing of the record's.
 *
 * A LINK THAT IS ITS OWN SENTENCE AT THE END OF A LINE IS A THING TO DO, AND GOES WHOLE (polish-l, PL1): Heads up's
 * "Oldest balance from 1 Sep. [Update](/r/balances?new=1)" read "Oldest balance from 1 Sep. Update" on a link, a word
 * that asks to be pressed with nothing behind it. A link inside a sentence ("kept in the [Keychain](/keychain).") names
 * something, and keeps its words, and so does one a colon leads up to ("Keys are here: [Keychain](/keychain)"), which is
 * the thing named (review i, RI3).
 */
/* A CLAUSE OF AN OPENING LINE THAT SPEAKS TO THE OWNER (finish 31 Oct): People's "{{questions-open-in:people}}
   question(s) for you", Work's "{{tasks-waiting}} waiting on you" and "None of your tasks is late" are his words, the
   questions only he can answer and the work that waits on him. A link leaves the clause out, as `leadShown` leaves one
   at nought, and the line goes on from the next clause. */
const OWNER_CLAUSE = '(?:\\{\\{questions-open-in:[^{}]+\\}\\}|\\d+) question(?:\\(s\\)|s)? for you|(?:\\{\\{[^{}]+\\}\\}|\\d+) waiting on you|None of your tasks is late';
const OWNER_FIRST = new RegExp(`(^|[.!?…][ \\t]+)(?:${OWNER_CLAUSE})(?:,[ \\t]*(?:and[ \\t]+)?|(?=[.!?…]|$))`, 'gmu');
const OWNER_AFTER = new RegExp(`,[ \\t]*(?:and[ \\t]+)?(?:${OWNER_CLAUSE})(?=[,.!?…]|$)`, 'gmu');
const ownerLeftOut = (text: string): string => {
  let out = text;
  for (let was = ''; was !== out; ) {
    was = out;
    out = out.replace(OWNER_FIRST, '$1').replace(OWNER_AFTER, '');
  }
  return out;
};

export const wordsShown = (text: string): string =>
  ownerLeftOut(badSaid(text))
    /* A SENTENCE THAT ASKS HIM TO ADD SOMETHING IS HIS, NEVER THE LINK'S (audit 31 Oct o, AO9): Money's "[Add an
       account](/r/accounts?new=1) to see what you have." was the first line a stranger read. It goes whole, as a link
       that is its own sentence does below. */
    .replace(/(?:^|(?<=[.!?…])[ \t]+)[^.!?…\n[]*\[[^\]]*\]\(\s*\/[^)]*[?&]new=1\b[^)]*\)[^.!?…\n]*[.!?…]?/gmu, '')
    /* AND "BESIDES YOU" IS SAID TO THE OWNER: People's "1 person besides you" is "1 person" on a link. */
    .replace(/ besides you\b/gu, '')
    /* AND SO ARE A CIRCLE'S PAYOUTS, his: "comes back to you" and "your payout has come" are "comes back" and "the payout". */
    .replace(/ comes back to you\b/gu, ' comes back')
    .replace(/\byour payout\b/gu, 'the payout')
    .replace(/([.!?…])[ \t]+\[[^\]]*\]\(\s*[/#][^)]*\)[.!]?[ \t]*$/gmu, '$1')
    .replace(/\[([^\]]*)\]\(\s*[/#][^)]*\)/gu, '$1');

/** A figure's cell's `sign`, the way its money goes, as the page declared it (`cells[].sign`). */
const signOf = (r: unknown): 'in' | 'out' | undefined => {
  const sign = isRecord(r) ? r.sign : undefined;
  return sign === 'in' || sign === 'out' ? sign : undefined;
};

/** An address that leaves this BrainDog: the only kind of `url` value a shared row keeps. */
const outward = (x: unknown): boolean => typeof x === 'string' && /^(?:https:\/\/|mailto:)/iu.test(x.trim());

/** Money rebuilt from nothing: a whole number of minor units and its own three-letter currency, and no other key. */
const moneyShown = (x: unknown): { amount: number; currency: string } | undefined =>
  isRecord(x) && Number.isSafeInteger(x.amount) && typeof x.currency === 'string' && /^[A-Z]{3}$/u.test(x.currency)
    ? { amount: x.amount as number, currency: x.currency }
    : undefined;

/** A quantity rebuilt from nothing: its number and its unit. */
const quantityShown = (x: unknown): { value: number; unit: string } | undefined =>
  isRecord(x) && typeof x.value === 'number' && Number.isFinite(x.value) && typeof x.unit === 'string' && !inside(x.unit)
    ? { value: x.value, unit: x.unit }
    : undefined;

/** One value of a type a link shows, or `undefined`. Money and a quantity are the two kept whole, each rebuilt. */
const oneShown = (type: FieldType, value: unknown): Json | undefined => {
  if (!SHOWN_TYPES.has(type)) return undefined;
  if (type === 'money') return moneyShown(value);
  if (type === 'quantity') return quantityShown(value);
  return isScalar(value) && !inside(value) ? value : undefined;
};

/** One field's value as a shared row shows it, or `undefined` for a value it does not. */
const valueShown = (field: RegisterDecl['fields'][number], value: Json | undefined): Json | undefined => {
  if (value === undefined) return undefined;
  if (field.type === 'url') return outward(value) ? value : undefined;
  if (field.type === 'list') {
    const of = field.of;
    if (of === undefined || !SHOWN_TYPES.has(of) || !Array.isArray(value)) return undefined;
    return value.map((v) => oneShown(of, v)).filter((v) => v !== undefined);
  }
  return oneShown(field.type, value);
};

/**
 * A NAME THAT IS AN ADDRESS OR A NUMBER (RM2): a person met by mail before anybody knew their name is titled by their
 * address, and one met by phone by their number. Said on a link, that hands their address to whoever holds it, so the
 * cell is left out, as it was before a link said a linked row's name at all.
 */
export const addressOnly = (title: string): boolean =>
  /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/u.test(title) ||
  (/^\s*\+?[\d\s().-]+\s*$/u.test(title) && (title.match(/\d/gu)?.length ?? 0) >= 7 && !/^\s*\d{4}-\d{2}-\d{2}\s*$/u.test(title));

/** A plain value, or a list of them: what the older reader of `fields` draws, which never held an amount. */
const plain = (v: Json): boolean => isScalar(v) || (Array.isArray(v) && v.every(isScalar));

/**
 * One row as a shared page shows it: each cell of the fields the block draws with its type (`cells`), and its state. No
 * id, no list, no number, no version and no instants, so nothing on it names the row or leads to it.
 *
 * `fields` IS THE SAME ROW AS PLAIN VALUES, for the reader that predates `cells` (`share-write.ts`), so money is in
 * `cells` alone: that reader drew an amount blank, and would draw an object as its braces.
 */
const rowShown = (row: Entry, drawn: readonly string[], lists: ReadonlyMap<string, RegisterDecl>, refSaid?: (id: string) => string | undefined) => {
  const decl = lists.get(row.register);
  const fields: Record<string, Json> = {};
  const cells: Record<string, SharedCell> = {};
  for (const id of drawn) {
    const field = decl?.fields.find((f) => f.id === id);
    if (field === undefined || !Object.hasOwn(row.fields, id)) continue;
    /* A LINK TO ANOTHER ROW IS SAID BY THAT ROW'S NAME, as the owner's page says it ("Toward: Run 100 km", a ticket's
       Owner, an order's Who), and never by its id. `refSaid` answers only a row a link may name (`sharedPage`), so a
       column the owner reads as a name was a hole on the link: Logged lately had no Toward, a sprint plan no Ticket. */
    if (field.type === 'ref') {
      const value = row.fields[id];
      const title = typeof value === 'string' && refSaid !== undefined ? refSaid(value) : undefined;
      if (title !== undefined && title !== '' && !inside(title) && !addressOnly(title)) {
        fields[id] = title;
        cells[id] = { type: 'text', value: title };
      }
      continue;
    }
    const shown = valueShown(field, row.fields[id]);
    if (shown === undefined) continue;
    if (plain(shown)) fields[id] = shown;
    const word = field.type === 'enum' && typeof shown === 'string' ? field.labels?.[shown] : undefined;
    /* AND THE UNIT A NUMBER IS SAID IN: a duration is held in seconds and said in its field's unit, a share is "60%". */
    const declared = (field as { unit?: unknown }).unit;
    const unit = typeof declared === 'string' && declared !== '' ? declared : undefined;
    cells[id] = {
      type: field.type,
      ...(field.type === 'list' && field.of !== undefined ? { of: field.of } : {}),
      value: shown,
      ...(word === undefined ? {} : { label: word }),
      ...(unit === undefined || !['duration', 'decimal', 'int'].includes(field.type) ? {} : { unit }),
    };
  }
  return { fields, cells, state: row.state };
};

/** A field or figure id said as words, for one the owner gave no label: `due_on` is "Due on", as the app says it. */
const idSaid = (id: string): string => {
  const spaced = id.replace(/[_-]+/gu, ' ').trim();
  return spaced === '' ? '' : spaced[0]!.toUpperCase() + spaced.slice(1);
};

/** The keys of a figure's reading that name no row: its number, its counts, its verdict and how its money was read. */
const READING_KEPT = ['value', 'unit', 'rows', 'held', 'delta', 'met', 'unsaid', 'atLeast', 'fx', 'targetIn', 'as_of', 'current', 'more', 'halves', 'trend', 'beyond'] as const;

/** Each amount of a figure in parts, rebuilt as money is. */
const partsShown = (x: unknown) => (Array.isArray(x) ? x.map(moneyShown).filter((m) => m !== undefined) : undefined);

/**
 * A figure's reading built from nothing. Left off: `backs`, the handles of the rows a sum added (`invoices#2`), and
 * `crossed`, the id of the row a running total reached its line at, which each name a row and its list; `refusals` and
 * `why`, which can name a list or a field. A part keyed by a row's id (a grouping by a `ref`) is keyed by its words.
 */
const readingShown = (reading: unknown): Record<string, unknown> | null => {
  if (!isRecord(reading)) return null;
  const kept: Record<string, unknown> = {};
  for (const key of READING_KEPT) if (reading[key] !== undefined) kept[key] = reading[key];
  const parts = partsShown(reading.parts);
  if (parts !== undefined) kept.parts = parts;
  const noRate = partsShown(reading.noRate);
  if (noRate !== undefined) kept.noRate = noRate;
  if (Array.isArray(reading.groups))
    kept.groups = reading.groups.filter(isRecord).map((g) => {
      const label = typeof g.label === 'string' && !inside(g.label) ? g.label : undefined;
      const key = typeof g.key === 'string' && !inside(g.key) ? g.key : (label ?? '');
      const gParts = partsShown(g.parts);
      return { key, ...(label === undefined ? {} : { label }), value: g.value, rows: g.rows, state: g.state, ...(gParts === undefined ? {} : { parts: gParts }) };
    });
  kept.refusals = [];
  return kept;
};

/** A tag the runtime's `Intl` takes, or `en` for one it does not, so a record's odd tag never throws on a read. */
const languageOf = (tag: unknown): string => {
  try {
    return typeof tag === 'string' && tag !== '' ? (Intl.getCanonicalLocales(tag)[0] ?? 'en') : 'en';
  } catch {
    return 'en';
  }
};

/**
 * One `{{path}}` value as the owner's words print it in the record's language, or `undefined` for one they do not:
 * an amount with its currency, a figure in several currencies as each amount in turn and never their sum, a number,
 * and words. An address or an id is no value here.
 */
const saidIn = (language: string, home: string | null, now: number) => {
  /* AN AMOUNT IS WRITTEN ONE WAY, as every screen writes it (`braindog-render`'s `writeAmount`), against the record's
     home currency; the language no longer changes how money reads. IN A SENTENCE, NOUGHT PENCE GO (AJ2): Money's line
     read "£1,240.00 to pay on the card" where the app reads "£1,240". */
  const amount = (m: { amount: number; currency: string }): string =>
    writeAmount({ minor: m.amount, currency: m.currency }, home, 'read')?.text ?? `${m.currency} ${m.amount}`;
  return (v: Json | undefined): string | undefined => {
    /* A DAY IS SAID AS THE APP SAYS ONE (AJ2): "as of 1 Sep", where a link read "as of 2026-09-01". */
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v)) return dateSaid(v, now);
    if (typeof v === 'string') return inside(v) ? undefined : wordsShown(v);
    if (typeof v === 'number') return Number.isFinite(v) ? new Intl.NumberFormat(language).format(v) : undefined;
    const one = moneyShown(v);
    if (one !== undefined) return amount(one);
    if (Array.isArray(v) && v.length > 0) {
      const each = v.map(moneyShown);
      return each.every((m) => m !== undefined) ? each.map((m) => amount(m!)).join(', ') : undefined;
    }
    return undefined;
  };
};

/** Where something that names a row, or a hole nothing fills, stood in a note: a character no sentence holds. */
const GONE = '\u0000';

/**
 * How one `{{…}}` is said on a shared page, or `undefined` for one that names nothing a link may show.
 *
 * A TYPED FORM WITH ITS VALUE WRITTEN IN (`{{money:1840000 GBP}}`, `{{date:2026-09-20}}`, `{{ago:2026-08-14}}`) IS SAID
 * AS THE APP SAYS IT, through the renderer's own `formatTyped`, at the moment and in the zone the record read the page,
 * and an amount through the one writer against the home currency. The page used to look each up as a path, find
 * nothing, and print nothing: "licensed direct. in the last twelve months", "not deferrable past .". `{{ref:…}}` names
 * a row and is never said; `{{icon:…}}` is a glyph a link does not draw.
 */
const tokenSaid = (values: Record<string, Json>, said: (v: Json | undefined) => string | undefined, typed: (form: TypedForm, arg: string) => string | undefined) =>
  (key: string): string | undefined => {
    if (Object.hasOwn(values, key)) return said(values[key]);
    const colon = key.indexOf(':');
    if (colon > 0) {
      const form = key.slice(0, colon).trim();
      const arg = key.slice(colon + 1).trim();
      if (form === 'icon') return '';
      if ((TYPED as readonly string[]).includes(form)) {
        if (form === 'ref') return undefined;
        /* A PATH, as the renderer tells one: a literal starts with a digit or a minus, a path with a letter. */
        if (/^[A-Za-z]/u.test(arg)) return said(Object.hasOwn(values, arg) ? values[arg] : undefined);
        return typed(form as TypedForm, arg);
      }
    }
    return undefined;
  };

/** A typed form's literal in words, at `now` in `zone`, an amount against `home`. `undefined` for one that does not parse. */
const typedIn = (now: number, zone: string, home: string | null, asDay = false) => (form: TypedForm, arg: string): string | undefined => {
  if (asDay && (form === 'date' || form === 'day' || form === 'until' || form === 'ago')) return /^\d{4}-\d{2}-\d{2}$/u.test(arg) ? dateSaid(arg, now) : undefined;
  if (form === 'money') {
    const m = /^(-?\d+)\s+([A-Z]{3})$/u.exec(arg);
    return m ? (writeAmount({ minor: BigInt(m[1]!), currency: m[2]! }, home, 'read')?.text ?? undefined) : undefined;
  }
  try {
    return formatTyped(form, arg, now, zone) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * The owner's words with every `{{…}}` filled, and one the record holds nothing for printing `gone`: nothing at all in a
 * heading, and the mark a note's sentences are judged by (`noteShown`). ONLY THE SPACE AROUND AN EMPTIED PATH CLOSES UP:
 * the rest of her words keep their spacing, which in a note's body is a nested list's indent and a line's break.
 */
const filledIn = (text: string, fill: (key: string) => string | undefined, gone = ''): string => {
  if (!text.includes('{{')) return text;
  const out = text.replace(/([ \t]*)\{\{\s*([^}]*?)\s*\}\}([ \t]*)/gu, (_whole, before: string, key: string, after: string) => {
    const v = fill(key);
    if (v !== undefined && v !== '') return `${before}${v}${after}`;
    if (v === undefined && gone !== '') return `${before}${gone}${after}`;
    return before !== '' && after !== '' ? before : `${before}${after}`;
  });
  return text.trim() === text ? out.trim() : out;
};

/**
 * A SPOKEN ID IN THE OWNER'S PROSE: a question's (`SG31`), a decision's (`D41`), a run's (`S42`), an instruction's
 * (`IN3`), a row's handle (`tasks#3`) or a minted id. Each names something a link does not open. A bare `S` or `D` and
 * one digit is left alone, since "S3" and "D3" are more often words than ids.
 */
const SPOKEN_ID = /(?<![\w#/.@-])(?:SG\d+|IN\d+|D\d{2,}|S\d{2,}|[a-z][a-z0-9_]*#\d+|[0-9A-HJKMNP-TV-Z]{26})(?![\w-]|\.\w)/gu;

/** A paragraph with every sentence that held something gone left out: the rest of what she wrote, read as she wrote it. */
const sentencesKept = (text: string): string =>
  text
    .split(/(?<=[.!?…])\s+(?=\S)/u)
    .filter((sentence) => !sentence.includes(GONE))
    .join(' ')
    .trim();

/** Every `{{…}}` key in a piece of text, as `filledIn` reads them. */
const keysIn = (text: string): string[] => [...text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/gu)].map((m) => m[1]!);

/** A cell put back as `splitRow` reads it, with its own pipes and backslashes escaped. */
const cellWritten = (cell: string): string => cell.replace(/[\\|]/gu, (c) => `\\${c}`);

/** A table's rule line under its head (`|---|:--:|`), which holds no value. */
const RULE = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/u;

/**
 * A NOTE'S TABLE WITH ITS AMOUNTS KEPT OFF (PH3), before anything is filled: each table's rows, a fence's or lines led by
 * `|`, as `money` says which `{{…}}` is an amount the link keeps off.
 *
 * A CELL THAT HELD AN AMOUNT IS EMPTIED WHOLE, since its other words say the amount ("{{money:4100 GBP}} a month" left
 * "Object storage | a month"). AND A COLUMN WHOSE EVERY VALUE IS AN AMOUNT GOES, its head and rule with it, where a
 * table's columns are named by a head: lines led by `|`, and a fence whose first row is its head (`comparison`,
 * `cards`). A fence whose cells mean their place (`spec` is name, value, note) keeps the place empty, since the next cell
 * would move into it. Every row stays.
 */
const moneyCellsOut = (lines: readonly string[], money: (key: string) => boolean): string[] => {
  const out = [...lines];
  const amountIn = (cell: string): boolean => keysIn(cell).some(money);
  /* ONE TABLE: the indices of its rows, whether its first row is a head, and whether a whole column may go. */
  const table = (at: readonly number[], headed: boolean, ruled: boolean, piped: boolean, drops: boolean) => {
    const rows = at.map((i) => {
      const line = out[i]!;
      const lead = /^\s*/u.exec(line)![0];
      let cells = splitRow(line.trim());
      if (piped) cells = cells.slice(line.trim().startsWith('|') ? 1 : 0, line.trim().endsWith('|') && !line.trim().endsWith('\\|') ? -1 : undefined);
      return { i, lead, cells };
    });
    const body = rows.filter((_, n) => !(headed && n === 0) && !(ruled && n === 1));
    if (!body.some((r) => r.cells.some(amountIn))) return;
    const width = Math.max(...rows.map((r) => r.cells.length));
    const gone = new Set<number>();
    if (drops)
      for (let c = 0; c < width; c++) {
        const said = body.map((r) => r.cells[c] ?? '').filter((cell) => cell !== '');
        if (said.length > 0 && said.every(amountIn)) gone.add(c);
      }
    for (const [n, r] of rows.entries()) {
      const isBody = !(headed && n === 0) && !(ruled && n === 1);
      if (!(isBody && r.cells.some(amountIn)) && !r.cells.some((_, c) => gone.has(c))) continue;
      const cells = r.cells.flatMap((cell, c) => (gone.has(c) ? [] : [isBody && amountIn(cell) ? '' : cell]));
      const written = cells.map(cellWritten).join(' | ');
      out[r.i] = piped ? `${r.lead}| ${written} |` : `${r.lead}${written}`;
    }
  };
  let i = 0;
  while (i < out.length) {
    const t = out[i]!.trim();
    const fence = /^(?:`{3,}|~{3,})\s*([A-Za-z]+(?:\.[A-Za-z0-9_-]+)?)?/u.exec(t);
    if (fence !== null) {
      const spec = fence[1] === undefined ? undefined : kindSpec(fence[1]);
      const at: number[] = [];
      let j = i + 1;
      for (; j < out.length && !/^(?:```|~~~)/u.test(out[j]!.trim()); j++) if (out[j]!.includes('|') && out[j]!.trim() !== '') at.push(j);
      /* A KIND THIS RECORD'S RENDERER DOES NOT NAME (a pack's) is read as rows that mean their place; a fence with no
         kind, or one of words or code, has no cells. */
      const rows = spec === undefined ? fence[1] !== undefined : spec.prose !== true && spec.verbatim !== true;
      if (rows && at.length > 0) table(at, spec?.header === true, false, false, spec?.header === true);
      i = j + 1;
      continue;
    }
    if (t.startsWith('|')) {
      const at: number[] = [];
      let j = i;
      for (; j < out.length && out[j]!.trim().startsWith('|'); j++) at.push(j);
      const ruled = at.length > 1 && RULE.test(out[at[1]!]!.trim());
      table(at, ruled, ruled, true, true);
      i = j;
      continue;
    }
    i++;
  }
  return out;
};

/** The verbs a sentence makes agree with its figure, each as its one form and its many (`VERB` in the app's `metrics.ts`). */
const VERB: Readonly<Record<string, readonly [string, string]>> = { is: ['is', 'are'], are: ['is', 'are'], was: ['was', 'were'], were: ['was', 'were'], has: ['has', 'have'], have: ['has', 'have'] };

/**
 * THE PLURALS OF A TEMPLATE SETTLED BY ITS FIGURES, every `{{path}}` kept for the filling after (`pluralsIn` in the app's
 * `metrics.ts`, rule for rule): `{{n}} order(s)` is "order" for one and "orders" for more, a verb after it agrees, and a
 * verb after a figure's names agrees with how many it named. Any `(s)` left is a plural.
 */
export const pluralsSettled = (template: string, said: (path: string) => string | undefined): string =>
  template
    .replace(
      /(\{\{\s*([a-z][a-z0-9_-]*\.names)\s*\}\})(\s+)(?:([A-Za-z]+)\(s\)|(are|is|were|was|have|has)\b)/gu,
      (_, hole: string, path: string, gap: string, verb: string | undefined, be: string | undefined) => {
        const single = !/ and /u.test(said(path) ?? '');
        if (verb !== undefined) return `${hole}${gap}${verb}${single ? 's' : ''}`;
        const forms = VERB[be!]!;
        return `${hole}${gap}${single ? forms[0] : forms[1]}`;
      },
    )
    .replace(
      /(\{\{\s*([a-z][a-z0-9_-]*(?:[.#][a-z0-9_-]+)*(?::[^{}\s]+)?)\s*\}\}|(?<![\d.,])\b\d[\d,]*(?:\.\d+)?)((?:\s+[A-Za-z]+)*?)\s+([A-Za-z]+)\(s\)(?:(\s+)(are|is|were|was|have|has)\b)?/gu,
      (_, figure: string, path: string | undefined, between: string, word: string, gap: string | undefined, verb: string | undefined) => {
        const single = (path === undefined ? figure : (said(path) ?? '')).trim() === '1';
        const forms = verb !== undefined && Object.hasOwn(VERB, verb) ? VERB[verb] : undefined;
        return `${figure}${between} ${single ? word : manyOf(word)}${forms ? `${gap ?? ' '}${single ? forms[0] : forms[1]}` : ''}`;
      },
    )
    .replace(/([A-Za-z]+)\(s\)/gu, (_, word: string) => manyOf(word));

/** A sentence that already ends as one: a stop, a question, an ellipsis or a colon, even inside a closing quote (`stopped`). */
const STOPPED = /[.!?…:]["”’)\]]*$/u;

/** A figure said as nothing: nought, in any currency, as a count, a share or an amount ("0", "EGP 0", "£0", "0%"). */
const NOUGHT_SAID = /^[-\u2212+]?(?:[A-Z]{3}\s?|\p{Sc})?[-\u2212]?0+(?:[.,]0+)?\s?%?$/u;

/**
 * Whether one clause of an opening line stands (`leadSentence` in the app's `metrics.ts`): it holds no figure, or every
 * figure in it is said and one of them is more than nought, and nothing it says names a row by its id.
 */
const clauseStands = (clause: string, fill: (key: string) => string | undefined): boolean => {
  const holes = keysIn(clause).filter((k) => !/^(?:bad|icon):/u.test(k));
  if (holes.length === 0) return true;
  const figures = holes.map(fill);
  if (figures.some((f) => f === undefined || f.trim() === '' || new RegExp(SPOKEN_ID.source, 'u').test(f))) return false;
  return figures.some((f) => !NOUGHT_SAID.test(f!.trim()));
};

/**
 * A NOTE'S OPENING LINE AS THE APP SAYS IT (`leadOf`): sentence by sentence, each clause that does not stand left out on
 * its own (a clause that opens on "with" leans on the one before it), its plurals settled, a line left opening on "and"
 * starting at its next word, and each sentence ending on a stop. A sentence with no figure leans on the one before it.
 * The first letter is a capital, since a line whose first clause went starts mid-sentence.
 */
export const leadShown = (template: string, fill: (key: string) => string | undefined): string => {
  const out: string[] = [];
  let before = true;
  /* A SENTENCE THAT SAYS AN ID IS LEFT OUT WHOLE, as `noteShown` leaves it (RM6): "Ship D41 before Friday." names a
     decision a link does not open, and cannot be said without it. */
  const spoken = (text: string): boolean => new RegExp(SPOKEN_ID.source, 'u').test(text);
  for (const sentence of template.split(/(?<=[.!?])\s+(?=\S)/u)) {
    if (keysIn(sentence).length === 0) {
      if (before && sentence.trim() !== '' && !spoken(sentence)) out.push(sentence.trim());
      continue;
    }
    let lean = true;
    const kept = sentence.split(/,\s+/u).filter((clause) => (lean = clauseStands(clause, fill) && (lean || !/^with\b/iu.test(clause))));
    const said = filledIn(pluralsSettled(kept.join(', '), fill), fill)
      .replace(/^and\s+/u, '')
      .replace(/\s{2,}/gu, ' ')
      .trim();
    const stands = said !== '' && !spoken(said);
    before = stands;
    if (stands) out.push(STOPPED.test(said) ? said : `${said}.`);
  }
  /* AND IT ENDS AS A SENTENCE DOES, whatever it held (`stopped` in the app): a project's line is its own words, filled. */
  const line = out.join(' ').trim();
  const stopped = line === '' || STOPPED.test(line) ? line : `${line}.`;
  return stopped.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
};

/**
 * WHAT A NOTE SAYS THAT A LINK NEVER READS, or `null` for a block it keeps off whole. A block whose lists include one no
 * link reads (`NEVER_READ`) is held back, but a note is its sentences: Team's line "4 open tickets, 1 blocked, 2
 * suggestions from agents" counted the agents' questions, which read the whole record, and a link lost the whole line
 * for one clause. So a note's holes are asked one at a time, and the ones that read such a list are said as nothing,
 * which takes their clause or sentence with them, while the rest of the note stays only if nothing else of it reads one.
 */
const heldHoles = (b: BlockResult, showing: Showing): ReadonlySet<string> | null => {
  const never = (x: unknown): boolean => showing.reads(x as BlockResult).some((list) => NEVER_READ.has(list));
  if (!never(b)) return new Set();
  const body = (b as { body?: unknown }).body;
  if (b.kind !== 'note' || typeof body !== 'string' || (b.source !== undefined && b.source !== null && b.source !== '')) return null;
  const keys = [...new Set(keysIn(body))];
  const held = new Set(keys.filter((k) => never({ kind: 'note', body: `{{${k}}}`, rows: [], refusals: [] })));
  if (held.size === 0) return null;
  const rest = keys.filter((k) => !held.has(k)).map((k) => `{{${k}}}`).join(' ');
  return never({ ...b, body: rest }) ? null : held;
};

/**
 * A note's body as a link shows it.
 *
 * THE NOTE IS DRAWN BY THE APP'S OWN RENDERER on the shared page, fences and all, so its words are sent as she wrote
 * them, and only what a link may not show is changed. A SENTENCE THAT NAMED A ROW, A QUESTION OR A DECISION, OR HELD A
 * HOLE NOTHING FILLS, IS LEFT OUT WHOLE: "Open as SG31 and it blocks two quotes." cannot be said without its id, and
 * "Tracked as ." is not a sentence. In a fence's row the cell is emptied, since its row is the fence's shape; a heading
 * loses the word alone. Lines with nothing gone keep their own breaks.
 */
const noteShown = (
  body: string,
  fill: (key: string) => string | undefined,
  cellFill: (key: string) => string | undefined,
  money?: (key: string) => boolean,
): string => {
  /* A FENCE'S ROW SAYS A DAY AS A DAY ("14 Aug"), since its first cell is a column of them (a timeline's), and prose says
     it as a sentence does ("3 weeks ago"). So each line is filled by what it is. */
  const said = wordsShown(body).split('\n');
  const lines = money === undefined ? said : moneyCellsOut(said, money);
  let inFence = false;
  const filled = lines.map((line) => {
    const t = line.trim();
    if (/^(?:```|~~~)/u.test(t)) {
      inFence = !inFence;
      return filledIn(line, cellFill, GONE);
    }
    const row = line.includes('|') && (inFence || t.startsWith('|'));
    return filledIn(line, row ? cellFill : fill, GONE);
  });
  const text = filled.join('\n').replace(SPOKEN_ID, GONE);
  if (!text.includes(GONE)) return text;
  const out: string[] = [];
  let para: string[] = [];
  let fenced = false;
  const flush = () => {
    if (para.length === 0) return;
    if (para.some((line) => line.includes(GONE))) {
      const kept = sentencesKept(para.map((line) => line.trim()).join(' '));
      if (kept !== '') out.push(kept);
    } else out.push(...para);
    para = [];
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/^(?:```|~~~)/u.test(t)) {
      flush();
      fenced = !fenced;
      out.push(line.replaceAll(GONE, ''));
    } else if (t === '') {
      flush();
      out.push(line);
    } else if (line.includes('|') && (fenced || t.startsWith('|'))) {
      flush();
      out.push(line.replaceAll(GONE, ''));
    } else if (/^#{1,6}\s/u.test(t)) {
      flush();
      out.push(line.replaceAll(GONE, '').replace(/[ \t]{2,}/gu, ' ').trimEnd());
    } else {
      const item = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/u.exec(line);
      if (item === null) {
        para.push(line);
        continue;
      }
      flush();
      if (!item[2]!.includes(GONE)) out.push(line);
      else {
        const kept = sentencesKept(item[2]!);
        if (kept !== '') out.push(`${item[1]}${kept}`);
      }
    }
  }
  flush();
  return out.join('\n').replaceAll(GONE, '').replace(/\n{3,}/gu, '\n\n').trim();
};

/** What one block is shown with: the lists' declarations, a figure's name, and how a value is said in the record's language. */
type Showing = {
  lists: ReadonlyMap<string, RegisterDecl>;
  figure: (metric: string) => string | undefined;
  said: (v: Json | undefined) => string | undefined;
  typed: (form: TypedForm, arg: string) => string | undefined;
  /** And a typed form in a fence's row, where a day is said as a day. */
  cell: (form: TypedForm, arg: string) => string | undefined;
  /** The lists a block reads, as the kernel names them (`blockRegisters`), `*` for the whole record. */
  reads: (b: BlockResult) => readonly string[];
  /** Whether the link shows money: false keeps every amount, money figure and money list off it (`moneyFree`). */
  money: boolean;
  /** Whether a figure, by its id and any parameter after its first colon, is money (`figureIsMoney`). */
  moneyFigure: (metric: string) => boolean;
  /** The name of a row another row links to, or `undefined` for one a link may not name (`sharedPage`'s `refSaid`). */
  refSaid?: (id: string) => string | undefined;
};

/**
 * THE LISTS AS THE OWNER READS THEM, relabelled by the speaking use case's words as the app relabels them (`relabel` in
 * the app's `voice.ts`): a list's name and the word for one of its rows, a field's label, and an enum's values. A list
 * no label names is the same object.
 */
export const voiced = (lists: ReadonlyMap<string, RegisterDecl>, labels: Readonly<Record<string, string>>): ReadonlyMap<string, RegisterDecl> => {
  const keys = Object.keys(labels);
  if (keys.length === 0) return lists;
  const out = new Map<string, RegisterDecl>();
  for (const [id, decl] of lists) {
    if (labels[id] === undefined && !keys.some((k) => k.startsWith(`${id}.`) || k.startsWith(`${id}:`))) {
      out.set(id, decl);
      continue;
    }
    const fields = decl.fields.map((f) => {
      const own = labels[`${id}.${f.id}`];
      const at = `${id}.${f.id}.`;
      const values = keys.filter((k) => k.startsWith(at));
      if (own === undefined && values.length === 0) return f;
      return {
        ...f,
        ...(own === undefined ? {} : { label: own }),
        ...(values.length === 0 ? {} : { labels: { ...f.labels, ...Object.fromEntries(values.map((k) => [k.slice(at.length), labels[k]!])) } }),
      };
    });
    const one = labels[`${id}:one`];
    out.set(id, { ...decl, ...(labels[id] === undefined ? {} : { name: labels[id] }), ...(one === undefined ? {} : { one }), fields } as RegisterDecl);
  }
  return out;
};

/**
 * A LIST THAT IS MONEY: one whose rows each must hold an amount (a required money field), which is what the list is for
 * (the ledger, bills, accounts, what recurs). A list that merely may hold one (a person's rate, a project's revenue) is
 * not, and keeps its rows with the amount taken off.
 */
const moneyList = (decl: RegisterDecl | undefined): boolean => decl !== undefined && decl.fields.some((f) => f.type === 'money' && f.required === true && f.retired !== true);

/** Whether a unit is a currency's code, which a reading, a measure or a chart in money is said in. */
const currencyUnit = (unit: unknown): boolean => typeof unit === 'string' && (/^[A-Z]{3}$/u.test(unit) || isMoneyUnit(unit));

/**
 * Whether anything in a value is an amount, at any depth: money as minor units and a currency, or numbers said in a
 * currency's unit (RF1). A chart by month (`bars`), a measure and a reading each hold their money as bare numbers with
 * the code beside them in `unit`, and went out whole when only the first shape was asked about.
 */
const holdsMoney = (x: unknown, depth = 0): boolean => {
  if (depth > 6 || x === null || typeof x !== 'object') return false;
  if (moneyShown(x) !== undefined) return true;
  if (!Array.isArray(x) && currencyUnit((x as { unit?: unknown }).unit)) return true;
  return (Array.isArray(x) ? x : Object.values(x)).some((v) => holdsMoney(v, depth + 1));
};

/** A figure read in a currency, or one whose parts are amounts. */
const moneyReading = (reading: unknown): boolean =>
  isRecord(reading) && (currencyUnit(reading.unit) || holdsMoney(reading.parts) || holdsMoney(reading.groups) || holdsMoney(reading.noRate));

/** Every word a figure's `value:` names, at any depth: the fields it adds up and the figures it adds. */
const wordsOf = (x: unknown, depth = 0): string[] =>
  depth > 6 ? [] : typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap((v) => wordsOf(v, depth + 1)) : isRecord(x) ? Object.values(x).flatMap((v) => wordsOf(v, depth + 1)) : [];

/**
 * WHETHER A FIGURE IS MONEY, which a link with money off keeps off whatever unit it is read in (RF5). The tick says
 * "Amounts, bills and money figures", and a money figure is: one written as money (`format: money`), one over the cash
 * walk ahead (how many days the money lasts, the day it runs out, the bill it runs out on), one over a list that is money
 * (`moneyList`: how many bills are late), one that adds up an amount of a list it reads (`sum: amount`), and one that adds
 * figures one of which is money (`sum_of`). How many tasks are open, or the hours worked, is not.
 *
 * BY ITS ID: a figure's parameter, after its first colon, is cut off, as everywhere a figure is named.
 */
const figureIsMoney = (kernel: RecordDeps['kernel'], lists: ReadonlyMap<string, RegisterDecl>): ((metric: string) => boolean) => {
  const known = new Map<string, boolean>();
  const money = (said: string, depth: number): boolean => {
    const at = said.indexOf(':');
    const id = (at < 0 ? said : said.slice(0, at)).trim();
    const held = known.get(id);
    if (held !== undefined) return held;
    /* A FIGURE THAT ADDS ITSELF is asked once: the answer while it is being asked is no. */
    known.set(id, false);
    const decl = id === '' ? null : kernel.metricDecl(id);
    let is = false;
    if (decl) {
      const read = kernel.figureLists(decl);
      const named = new Set(wordsOf(decl.value));
      const value: unknown = decl.value;
      const added = isRecord(value) && Array.isArray(value.sum_of) ? (value.sum_of as unknown[]).map((p) => (isRecord(p) ? p.metric : undefined)) : [];
      is =
        isMoneyFormat(decl.format) ||
        decl.source === 'forecast.runway' ||
        read.some((l) => moneyList(lists.get(l)) || lists.get(l)?.fields.some((f) => f.type === 'money' && named.has(f.id)) === true) ||
        (depth < 4 && added.some((p) => typeof p === 'string' && money(p, depth + 1)));
    }
    known.set(id, is);
    return is;
  };
  return (metric) => money(metric, 0);
};

/**
 * Whether one `{{…}}` reads a money figure on a link that keeps money off (RF5): a path, or a typed form naming one,
 * any word of which is a money figure (`{{runway-days}}`, `{{runway-days.on}}`, `{{money.owed}}`), or whose first word
 * is a list that is money (`{{bills.late}}`). What it holds is said as nothing, whatever it is: a number of days, a day,
 * a bill's name.
 */
const moneyPath = (showing: Showing) => (key: string): boolean => {
  const colon = key.indexOf(':');
  const form = colon > 0 ? key.slice(0, colon).trim() : '';
  const path = (TYPED as readonly string[]).includes(form) ? key.slice(colon + 1).trim() : key.trim();
  if (!/^[A-Za-z]/u.test(path)) return false;
  const at = path.indexOf(':');
  const words = (at < 0 ? path : path.slice(0, at)).split('.');
  return words.some((w) => w !== '' && showing.moneyFigure(w)) || moneyList(showing.lists.get(words[0]!));
};

/**
 * A block with money kept off it, or `null` for a block that is money through and through: a cash walk, a block whose
 * rows are a list that is money (`moneyList`), the runway, or a bar of a money figure's parts. Otherwise a column of an
 * amount goes (and its cells with it, since a row keeps only what its columns draw), a money figure goes (`figureIsMoney`),
 * a measure in a currency goes, a chart in money goes, a computed key that holds an amount goes, and with any of them
 * the block's own target. Each is checked by its unit as well as its shape, since a chart and a measure hold money
 * as bare numbers with the code beside them (RF1).
 */
const moneyFree = (b: BlockResult, showing: Showing): BlockResult | null => {
  if (b.walk !== undefined || b.walks !== undefined || b.source === 'forecast.runway') return null;
  /* A BAR OR A SPLIT OF A MONEY FIGURE'S PARTS is that figure and nothing else. */
  if (typeof b.source === 'string' && b.source.startsWith('metric.') && showing.moneyFigure(b.source.slice('metric.'.length))) return null;
  /* NOR A BUDGET, a money figure's parts set against amounts (`spent:`): with both gone a link listed the categories'
     names alone under "This month's budgets" (AL6). */
  const spent = (b as { spent?: unknown }).spent;
  if (b.kind === 'progress' && typeof spent === 'string' && showing.moneyFigure(spent)) return null;
  /* NOR A GOAL SET AGAINST A MONEY FIGURE (`toward:`, what was put by toward each saving): its targets go with the
     money, and what is left is names over nothing. */
  const toward = (b as { toward?: unknown }).toward;
  if (b.kind === 'progress' && typeof toward === 'string' && showing.moneyFigure(toward)) return null;
  const list = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : (b.register ?? b.rows[0]?.register);
  /* THE LISTS ITS ROWS COME FROM, not every list its figures count: "Open 7" over the work stays beside "Still to come
     in", which goes as a figure in a currency. */
  const lists = [...(list === undefined ? [] : [list]), ...b.rows.map((r) => r.register)];
  if (lists.some((l) => moneyList(showing.lists.get(l)))) return null;
  const typeOf = (field: string): FieldType | undefined => (list === undefined ? undefined : showing.lists.get(list)?.fields.find((f) => f.id === field)?.type);
  const block = b as unknown as Record<string, unknown>;
  const kept: Record<string, unknown> = { ...block };
  /* WHETHER ANYTHING WENT FOR BEING MONEY, which says the block's own `target:` is a sum of money too (RF1): a gauge or a
     progress block over an amount carried its target as a bare number. */
  let held = false;
  const figured = (id: unknown): boolean => typeof id === 'string' && showing.moneyFigure(id);
  /* A COLUMN OF AN AMOUNT, and a card's trend over a money figure, whose numbers by week went out as `trends`. */
  const unitOf = (field: string): unknown => (list === undefined ? undefined : (showing.lists.get(list)?.fields.find((f) => f.id === field) as { unit?: unknown } | undefined)?.unit);
  const moneyColumn = (c: NonNullable<BlockResult['columns']>[number]): boolean =>
    c.sign !== undefined || typeOf(c.field) === 'money' || currencyUnit(unitOf(c.field)) || figured(c.metric);
  if (b.columns !== undefined) {
    kept.columns = b.columns.filter((c) => !moneyColumn(c));
    if (b.columns.some((c) => c.metric !== undefined && figured(c.metric))) {
      delete kept.trends;
      held = true;
    }
    held ||= (kept.columns as unknown[]).length < b.columns.length;
  }
  if (b.readings !== undefined) {
    kept.readings = b.readings.filter((r) => !moneyReading(r.reading) && !figured(r.metric));
    held ||= (kept.readings as unknown[]).length < b.readings.length;
  }
  /* A MEASURE IN A CURRENCY, one of a project's readings: what it reported it earned, by day. AND EVERY MEASURE OF A
     BLOCK WHOSE VALUE IS AN AMOUNT: a stat over a list with a day and a money field reads each row as a reading (its
     second column is the value, as `measures.ts` reads them), and its numbers went out as minor units with no unit. */
  const valued = typeOf(b.columns?.[1]?.field ?? '') === 'money';
  for (const key of ['measures', 'latest'] as const) {
    const each = block[key];
    if (!Array.isArray(each)) continue;
    kept[key] = valued ? [] : each.filter((m) => !(isRecord(m) && currencyUnit(m.unit)));
    held ||= (kept[key] as unknown[]).length < each.length;
  }
  /* A CHART BY MONTH IN MONEY, by its unit or by the figures its lines are. */
  const lines = Array.isArray(block.series) ? (block.series as unknown[]) : [];
  if (block.bars !== undefined && (holdsMoney(block.bars) || lines.some((l) => isRecord(l) && (figured(l.metric) || figured(l.then))))) {
    delete kept.bars;
    held = true;
  }
  /* A PROGRESS BLOCK SET AGAINST A MONEY FIGURE is money whatever its rows are. */
  if (figured(block.spent) || figured(block.toward)) held = true;
  for (const key of FIGURES)
    if (holdsMoney(kept[key])) {
      delete kept[key];
      held = true;
    }
  /* A WALK'S OWN FIGURES, which only a cash walk answers and every one of which is about money: what it held the
     ninety days before, what may be sold, how late money comes in, and that figure's name. */
  for (const key of ['past', 'sells', 'lateness', 'late_name'] as const) delete kept[key];
  if (held) delete kept.target;
  /* AND HOW ITS MONEY WAS CONVERTED, which is about amounts and nothing else. */
  delete kept.fx;
  delete kept.walkFx;
  return kept as unknown as BlockResult;
};

/** The field types a number is held in, which a row's currency code beside it makes an amount. */
const NUMBERS: ReadonlySet<string> = new Set(['int', 'number', 'decimal']);

/** Whether a cell's value is a currency's code, written as one: three capitals a currency has. */
const codeCell = (c: SharedCell): boolean => (c.type === 'text' || c.type === 'enum') && typeof c.value === 'string' && /^[A-Z]{3}$/u.test(c.value) && isMoneyUnit(c.value);

/**
 * A ROW WITH MONEY KEPT OFF IT WHERE A NUMBER IS SAID IN A CURRENCY BESIDE IT (RF1): a project's reading written as
 * `value 54321.97, unit GBP` is an amount though neither field is money, as the record reads it into a measure in pounds.
 * Its numbers go, and the code with them, which says nothing without them. A row with no currency code keeps every cell.
 */
const unitless = (row: ReturnType<typeof rowShown>): ReturnType<typeof rowShown> => {
  const cells = Object.entries(row.cells);
  if (!cells.some(([, c]) => codeCell(c))) return row;
  const gone = new Set(cells.filter(([, c]) => codeCell(c) || NUMBERS.has(c.type)).map(([id]) => id));
  return {
    ...row,
    fields: Object.fromEntries(Object.entries(row.fields).filter(([id]) => !gone.has(id))),
    cells: Object.fromEntries(cells.filter(([id]) => !gone.has(id))),
  };
};

/** The formats a figure is declared in that a link says (`format:` on a figure): a day, a count of days, a share, a number, money. */
const FIGURE_FORMATS = /^(?:int|decimal|pct|days|day|money(?:\.[A-Z]{3})?)$/u;

/**
 * A column as a shared block keeps it: the field it draws, the label the owner reads, its role and its money sign, and the
 * second field it reads where its own holds nothing (`or`, the Ledger's name: who was paid, else the bank's line).
 */
type ColumnShown = { field: string; or?: string; label: string; as?: string; sign?: { field: string; minus: string }; deadline?: true; ref?: true };

/** A walk's step without the list and the row it came from (`source`, `spoken`). */
const stepShown = (step: unknown) => {
  if (!isRecord(step)) return null;
  const { day, label, delta, balance, from, of } = step;
  return { day, label, delta, balance, ...(from === undefined ? {} : { from }), ...(of === undefined ? {} : { of }) };
};

/** A cash walk with every step's list and row taken off, and its refusals too, since a refusal names a list. */
const walkShown = (walk: unknown) => {
  if (!isRecord(walk)) return null;
  const steps = Array.isArray(walk.steps) ? walk.steps.map(stepShown).filter((s) => s !== null) : [];
  const kept: Record<string, unknown> = { steps, crossed: walk.crossed === null ? null : stepShown(walk.crossed), refusals: [] };
  for (const key of ['from', 'currency', 'mixed', 'converted', 'missing', 'days', 'horizon', 'past', 'sells'] as const)
    if (walk[key] !== undefined) kept[key] = walk[key];
  return kept;
};

/** The keys of `LOOKS` that hold the owner's words, which a `{{path}}` is filled in. */
const WORDS = ['heading', 'lead', 'empty', 'body'] as const;

/** A card's columns that only say how the card is drawn, never words a link shows. */
const DRAWING_ROLES: ReadonlySet<string> = new Set(['mark', 'hue', 'picture']);

/** What a card's figure column computed, one per row, by the column's role: a `trend` its `trends`, a `when` its `whens`. */
const FIGURE_COLUMN_OUT: Readonly<Record<string, string>> = { trend: 'trends', when: 'whens' };

/**
 * A block without the figure columns that read a list a link never reads (`NEVER_READ`), and without what each computed
 * (SC1). Projects' cards say "Worked on" through `project-worked`, which reads the agents' runs and every list that hands
 * work out, so it names the whole record (`*`), and the whole cards block was kept off every link: a shared Projects
 * page said "This page has nothing a link can show". The column goes and the cards stay, drawn from the projects' own
 * rows; whatever else the block reads is still asked of `NEVER_READ` after.
 *
 * A LINE THAT LEADS WITH THE PROJECT'S KEY NUMBER (`kpi: headline`) IS READ FROM ITS OWN FIGURE ON A LINK (SL2). The key
 * numbers come from the `kpis` source, which reads across the whole record (any list a key number counts, money among
 * them), so `sharedPage` reads the page with them off (`keyNumbers: false`), as a member who does not read the whole
 * record is drawn: each card's line is then the column's own figure filled from the card's row (tasks of that project
 * done by week), and the column is asked of `NEVER_READ` by the lists that figure reads, like any other. The money rules
 * still hold after this (`moneyFree` drops a trend over a money figure).
 */
const neverReadCut = (given: BlockResult, showing: Showing): BlockResult => {
  /* A BLOCK THAT MARKS WHICH OF ITS ROWS HAS AN AGENT AT WORK NOW (`working: true`) READS THE AGENTS' RUNS FOR THAT DOT
     ALONE, and a link never reads them: Team's In flight, its tickets as cards, went whole. The dot goes and the cards
     stay, drawn from the tickets' own rows; whatever else the block reads is still asked after. */
  const b: BlockResult =
    (given as { working?: unknown }).working === true
      ? (({ working: _working, working_now: _now, ...rest }) => rest as unknown as BlockResult)(given as unknown as Record<string, unknown>)
      : given;
  if (!Array.isArray(b.columns) || !b.columns.some((c) => typeof c.metric === 'string')) return b;
  const cut = new Set<string>();
  const columns = b.columns.filter((c) => {
    if (typeof c.metric !== 'string') return true;
    const reads = showing.reads({ kind: b.kind, columns: [c], rows: [], refusals: [] } as unknown as BlockResult);
    if (!reads.some((list) => NEVER_READ.has(list))) return true;
    if (typeof c.as === 'string' && FIGURE_COLUMN_OUT[c.as] !== undefined) cut.add(FIGURE_COLUMN_OUT[c.as]!);
    return false;
  });
  if (columns.length === b.columns.length) return b;
  const kept = { ...b, columns } as unknown as Record<string, unknown>;
  for (const key of cut) delete kept[key];
  return kept as unknown as BlockResult;
};

/**
 * One block as a shared page shows it, built from nothing (this file's header says why), or `null` for a block the link
 * hides, which is not sent at all: a kind that writes, links or reads across the record, and a block the record could
 * not draw for the owner, whose sentence could name a list.
 *
 * THE FIELDS A ROW KEEPS ARE THE ONES THE BLOCK'S COLUMNS DRAW, and the list's title field for a block that names no
 * columns, which is what a card or a list without columns draws. A `sign` names a second field a money column reads.
 * Every column says the label the owner reads over it: hers, else the field's, else the field's id as words.
 */
const shownBlock = (given: BlockResult, showing: Showing): Record<string, unknown> | null => {
  const { lists, figure, said, typed, cell } = showing;
  if (typeof given.kind !== 'string' || !shareKind(given.kind) || !shareDraws(given.source)) return null;
  const whole = neverReadCut(given, showing);
  const held = heldHoles(whole, showing);
  if (held === null) return null;
  if (whole.refusals.length > 0) return null;
  /* WHAT THE OWNER'S PAGE DOES NOT DRAW IS NOT ON THE LINK (AH7, `markDrawn`): a note whose `when` failed said "No project
     yet" over a page with one. */
  if ((whole as { drawn?: unknown }).drawn === false) return null;
  const b = showing.money ? whole : moneyFree(whole, showing);
  if (b === null) return null;
  const block = b as unknown as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const key of LOOKS) if (block[key] !== undefined) kept[key] = block[key];
  const written: Record<string, Json> = isRecord(block.values) ? (block.values as Record<string, Json>) : {};
  /* A MONEY FIGURE'S `{{path}}` IS FILLED WITH NOTHING on a link that keeps money off (RF5), so the sentence that said
     how many days the money lasts goes whole, as the one that said an amount does. */
  const inMoney = showing.money ? undefined : moneyPath(showing);
  const values = inMoney === undefined ? written : Object.fromEntries(Object.entries(written).filter(([key]) => !inMoney(key)));
  const fill = tokenSaid(values, said, typed);
  const amount = inMoney === undefined ? undefined : (key: string): boolean => amountKey(written)(key) || inMoney(key);
  /* A FIGURE A LINK NEVER READS (`heldHoles`) IS SAID AS NOTHING, so its clause or its sentence goes as an amount's does. */
  const bodyFill = held.size === 0 ? fill : (key: string): string | undefined => (held.has(key) ? undefined : fill(key));
  const cellFill = tokenSaid(values, said, cell);
  const bodyCell = held.size === 0 ? cellFill : (key: string): string | undefined => (held.has(key) ? undefined : cellFill(key));
  /* A NOTE'S PROSE SETTLES ITS PLURALS AS THE APP'S DOES (`pluralsIn`), and ITS OPENING LINE IS SAID BY THE APP'S RULES
     (`leadOf`): a clause whose figure is nought or not shown goes on its own, and the line ends as a sentence does. A link
     read "3 goal(s) and 2 habit(s) on the go" with no stop, said "0 ticket(s) with an agent" where the app says nothing,
     and lost Goals' whole line on a link with money off for the one clause that was an amount. */
  const prose = b.kind === 'note' && block.document !== true;
  for (const key of WORDS) {
    const text = kept[key];
    if (typeof text !== 'string') continue;
    if (key !== 'body') kept[key] = filledIn(wordsShown(text), fill);
    else if (prose && kept.lead === true && !/[`#|]/u.test(text)) kept[key] = leadShown(wordsShown(text), bodyFill);
    else kept[key] = noteShown(prose ? pluralsSettled(text, bodyFill) : text, bodyFill, bodyCell, amount);
  }
  if (kept.body === '') delete kept.body;
  /* A NOTE WHOSE EVERY WORD WAS HIS (AO9), Money's "Add an account to see what you have.", is no block on a link. */
  if (prose && kept.body === undefined && kept.heading === undefined && typeof block.body === 'string' && block.body.trim() !== '' && block.readings === undefined) return null;

  /* `figures`, WHAT EACH FIGURE THE BLOCK NAMES IS AS DECLARED (`pages.ts` `figuresOf`), IS NEVER SENT: its `where` and
     `source` name lists and fields, and its `target` is a number in the figure's own money. A shared block says each
     figure's name on its reading, below, and nothing else of its declaration. */
  for (const key of FIGURES) if (block[key] !== undefined) kept[key] = block[key];
  /* A ROW'S PROJECT AND A CARD'S NEXT STEP ARE TITLES OF ROWS OF OTHER LISTS, sent only where a column draws them (SEC2).
     `scopes` is computed for a block that inherits by its project as well as for one that draws it, and fell back to a
     raw row id where the title could not be read, so an id is blanked as every other address into the record is. */
  const roles = new Set((b.columns ?? []).map((c) => c.as));
  for (const [key, role] of [['scopes', 'scope'], ['scope_marks', 'scope'], ['nexts', 'next']] as const) {
    if (kept[key] === undefined) continue;
    if (!roles.has(role)) delete kept[key];
    else if (Array.isArray(kept[key]))
      kept[key] = (kept[key] as unknown[]).map((v) => {
        if (typeof v !== 'string') return v;
        const said = v.split(', ').filter((part) => !inside(part)).join(', ');
        return said === '' ? null : said;
      });
  }
  if (typeof block.target === 'number') kept.target = block.target;

  const list = typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : (b.register ?? b.rows[0]?.register);
  const declared = list === undefined ? undefined : lists.get(list);
  /* A COLUMN THAT DRAWS A FIGURE AND NO FIELD (a card's `{ metric, as: trend }`) SAYS NOTHING ON A ROW a link sends, and
     naming it by its field threw on the field it does not have, so a page whose cards drew a trend could not be shared. */
  /* NOR A CARD'S MARK, HUE OR PICTURE (SC1): each is how the owner's card is drawn, an icon's name, a colour's degrees, a
     stored file, and a link draws a card's row as words, where Projects said "tag" and "265" beside every name. */
  const columns = (b.columns ?? []).filter((c) => typeof c.field === 'string' && c.field !== '' && !(typeof c.as === 'string' && DRAWING_ROLES.has(c.as))).map((c) => {
    /* A LABEL THE PACK LEFT EMPTY ON PURPOSE (`label: ''`, Projects' Health on a card) IS SENT EMPTY (SB4): the app draws
       that fact with no name over it, and a link said the field's own label, "Health", beside every project. */
    const blank = typeof c.label === 'string' && c.label.trim() === '';
    const owned = typeof c.label === 'string' && c.label.trim() !== '' ? c.label : undefined;
    /* OVER A LIST'S TITLE, WITH NO LABEL OF HER OWN, THE WORD FOR ONE OF ITS ROWS (`columnHeading` in the app's `api.ts`):
       a team's tasks are headed Ticket, where a link said the field's own label, "Description". */
    const one = (declared as { one?: unknown } | undefined)?.one;
    const titled = declared?.title === c.field && typeof one === 'string' && one !== '' ? one.charAt(0).toUpperCase() + one.slice(1) : undefined;
    const field = declared?.fields.find((f) => f.id === c.field);
    const shown: ColumnShown = { field: c.field, label: blank ? '' : (owned ?? titled ?? field?.label ?? idSaid(c.field)) };
    /* AND WHETHER IT IS THE LIST'S DEADLINE, which the app says as "Due in 3 days" while it is close (`soonSaid`). */
    if (field?.type === 'day' && field.deadline === true) shown.deadline = true;
    /* AND WHETHER IT NAMES ANOTHER ROW, which may be empty on a row that is whole: an order nobody is named on. */
    if (field?.type === 'ref') shown.ref = true;
    /* AND THE FIELD IT READS WHERE ITS OWN HOLDS NOTHING (AL1): the Ledger's name is who was paid, else the line's own
       words (`or: 'what'`), and a link sent the payee alone, so every line no payee was read for said a day and an
       amount with nobody between them. The second field is drawn in the same cell the app draws it in, so it shows
       nothing the owner's page does not. */
    if (typeof c.or === 'string' && c.or !== '' && c.or !== c.field) shown.or = c.or;
    if (c.as !== undefined) shown.as = c.as;
    if (c.sign !== undefined) shown.sign = { field: c.sign.field, minus: c.sign.minus };
    return shown;
  });
  if (columns.length > 0) kept.columns = columns;
  /* A CARD'S TREND IS NAMED AS ITS FIGURE IS (SL2): the column's own label, else the figure's name, as every reading on
     a link is named. The column itself names no field, so it is not one of `columns`; the name is all a reader needs to
     draw the line `trends` holds. */
  const trendColumn = Array.isArray(kept.trends) ? (b.columns ?? []).find((c) => c.as === 'trend' && typeof c.metric === 'string') : undefined;
  if (trendColumn !== undefined) {
    const id = trendColumn.metric!.split(':')[0]!;
    const owned = typeof trendColumn.label === 'string' && trendColumn.label.trim() !== '' ? trendColumn.label : undefined;
    kept.trend_label = owned ?? figure(id) ?? idSaid(id);
  }
  const drawn = (register: string): string[] =>
    columns.length > 0 ? columns.flatMap((c) => [c.field, ...(c.or === undefined ? [] : [c.or]), ...(c.sign === undefined ? [] : [c.sign.field])]) : [lists.get(register)?.title ?? ''];
  /* A BOARD'S LANES IN THE ORDER ITS LIST DECLARES THEM (`boardOrder` in the app's `blocks.ts`): To do, Doing, Marked,
     where a link drew them in the order the rows came, Marked before Doing. Only where nothing else rides aligned with
     the rows, so no flag lands on another row. */
  const laneField = b.kind === 'board' ? b.columns?.[0]?.field : undefined;
  const lanes = laneField === undefined ? undefined : declared?.fields.find((f) => f.id === laneField)?.values;
  const aligned = ['rings', 'nexts', 'trends', 'done_now', 'scopes', 'scope_marks', 'whens', 'working_now', 'quiet', 'bylines', 'changes'].some((k) => Array.isArray(block[k]));
  const rank = (row: Entry): number => {
    const at = lanes === undefined ? -1 : lanes.indexOf(String(row.fields[laneField ?? ''] ?? ''));
    return at < 0 ? (lanes?.length ?? 0) : at;
  };
  const inOrder = lanes !== undefined && !aligned ? [...b.rows].sort((x, y) => rank(x) - rank(y)) : b.rows;
  kept.rows = inOrder.map((row) => {
    const shown = rowShown(row, drawn(row.register), lists, showing.refSaid);
    return showing.money ? shown : unitless(shown);
  });
  /* WHAT EACH BUDGET HAS SPENT, ONE A ROW (AL6), as the app sets each category's limit against the part of the figure
     keyed by that category (`progressRows` in the app's `blocks.ts`): the parts are keyed by the category's id, which a
     link never sends, so the record matches them here and sends the amounts alone, aligned with the rows. A link drew the
     figure's total as a bare "0" over a table of limits that read as spending. Only on a link that keeps money, the one
     place a budget is sent at all. */
  const spentBy = (block as { spent?: unknown }).spent;
  const labelField = b.columns?.[0]?.field;
  const parts = b.readings?.[0]?.reading?.groups;
  const partOf = (row: Entry): number => {
    const part = parts?.find((g) => g.key === row.id || g.key === String(row.fields[labelField ?? ''] ?? ''));
    return typeof part?.value === 'number' && Number.isFinite(part.value) ? part.value : 0;
  };
  if (showing.money && b.kind === 'progress' && typeof spentBy === 'string' && typeof labelField === 'string' && Array.isArray(parts)) kept.spent_rows = b.rows.map(partOf);
  /* AND WHAT WAS LOGGED TOWARD EACH GOAL, ONE A ROW (`toward:`), as the app sets each goal's aim against the part of the
     figure keyed by that goal: a link drew the figure's whole, "Logged, by goal 34.5", over a table of aims, so a
     habit's week read as the sum of every run logged. `toward` says the rows are goals and not budgets. A goal set
     against money is on a link with money only (`moneyFree`). */
  const towardBy = (block as { toward?: unknown }).toward;
  if (b.kind === 'progress' && spentBy === undefined && typeof towardBy === 'string' && typeof labelField === 'string' && Array.isArray(parts)) {
    kept.spent_rows = b.rows.map(partOf);
    kept.toward = true;
  }
  /* THE STATES ITS LISTS COUNT AS FINISHED (SB2), each list's own declared `done:`, so a shared `todo` ticks the rows the
     owner's ticks and not the ones a word guessed at. The list's declaration, never a row: the same words for every row. */
  if (b.rows.length > 0) {
    const finished = new Set<string>();
    for (const register of new Set([...(list === undefined ? [] : [list]), ...b.rows.map((r) => r.register)])) for (const d of lists.get(register)?.done ?? []) finished.add(d);
    kept.done = [...finished];
  }

  /* EVERY FIGURE SAYS ITS NAME: the cell's label, else the figure's own, so a stranger never reads a metric's id. */
  if (b.readings !== undefined)
    kept.readings = b.readings.map((r) => ({
      metric: r.metric,
      label: r.label ?? figure(r.metric) ?? idSaid(r.metric),
      /* AND HOW IT IS WRITTEN (SB1): a day the money runs out is held as days since 1970, and said "20,756" without it. */
      ...(typeof r.format === 'string' && FIGURE_FORMATS.test(r.format) ? { format: r.format } : {}),
      /* AND THE WAY ITS MONEY GOES (AO9), as the owner's tile signs it: "+£11,490" to come in, "−£43,047" going out. */
      ...(signOf(r) === undefined ? {} : { sign: signOf(r) }),
      reading: readingShown(r.reading),
      ...(r.trend === undefined ? {} : { trend: r.trend }),
      ...(r.target === undefined ? {} : { target: r.target }),
    }));
  if (b.walk !== undefined) kept.walk = walkShown(b.walk);
  if (b.walks !== undefined) kept.walks = b.walks.map(walkShown);

  /* WHAT A BLOCK WRITES OUT ITSELF, cell by cell, keeps its plain values, with an address into this BrainDog blanked and
     its words filled. `values` itself is not sent: every `{{path}}` it fills is filled here. */
  const authored = block.authored;
  if (Array.isArray(authored))
    kept.authored = authored.map((row) => ({
      cells:
        isRecord(row) && Array.isArray(row.cells)
          ? row.cells.map((c) =>
              !isScalar(c) || inside(c) ? '' : typeof c === 'string' ? (amount !== undefined && keysIn(c).some(amount) ? '' : filledIn(wordsShown(c), fill)) : c,
            )
          : [],
    }));

  kept.refusals = [];
  return kept;
};

/** Whether a value is an amount, or a list of nothing but amounts: what `moneyKept` says as nothing. */
const amountValue = (v: unknown): boolean => moneyShown(v) !== undefined || (Array.isArray(v) && v.length > 0 && v.every((m) => moneyShown(m) !== undefined));

/**
 * Whether one `{{…}}` is an amount a link that keeps money off says as nothing: a path to one, `{{money:…}}` written in or
 * naming a path, or another typed form naming a path to one. The same keys `moneyKept` and `typedKept` empty.
 */
const amountKey = (values: Record<string, Json>) => (key: string): boolean => {
  if (Object.hasOwn(values, key)) return amountValue(values[key]);
  const colon = key.indexOf(':');
  if (colon <= 0) return false;
  const form = key.slice(0, colon).trim();
  const arg = key.slice(colon + 1).trim();
  if (form === 'money') return true;
  return (TYPED as readonly string[]).includes(form) && /^[A-Za-z]/u.test(arg) && Object.hasOwn(values, arg) && amountValue(values[arg]);
};

/**
 * HOW A VALUE IS SAID ON A LINK THAT KEEPS MONEY OFF: an amount is said as nothing at all, which a note reads as a hole
 * (`GONE`), so the sentence that held "£18,400" is left out whole and a heading loses the word alone.
 */
const moneyKept = (money: boolean, said: Showing['said']): Showing['said'] =>
  money ? said : (v) => (amountValue(v) ? undefined : said(v));
const typedKept = (money: boolean, typed: Showing['typed']): Showing['typed'] => (money ? typed : (form, arg) => (form === 'money' ? undefined : typed(form, arg)));

/** Where a page is read: the record's language and zone, and the figures' names, which `shownPage` is handed. */
type ReadIn = {
  language: unknown;
  zone: unknown;
  home: string | null;
  now: number;
  figure: Showing['figure'];
  reads: Showing['reads'];
  money: boolean;
  moneyFigure: Showing['moneyFigure'];
  refSaid?: Showing['refSaid'];
};

/**
 * The page as a link shows it: its title, when it was read, its layout, when the link closes, the language and zone it
 * is read in, and each block a link may show. A page left with none says `NOTHING_SHOWN`, once, and draws no block.
 */
const shownPage = (page: PageResult, expires_at: string, lists: ReadonlyMap<string, RegisterDecl>, where: ReadIn): SharedPage => {
  const layout = isRecord(page.layout) ? page.layout : null;
  const language = languageOf(where.language);
  const zone = typeof where.zone === 'string' && where.zone !== '' ? where.zone : typeof page.zone === 'string' && page.zone !== '' ? page.zone : 'UTC';
  const showing: Showing = {
    lists,
    figure: where.figure,
    reads: where.reads,
    money: where.money,
    moneyFigure: where.moneyFigure,
    ...(where.refSaid === undefined ? {} : { refSaid: where.refSaid }),
    said: moneyKept(where.money, saidIn(language, where.home, where.now)),
    typed: typedKept(where.money, typedIn(where.now, zone, where.home)),
    cell: typedKept(where.money, typedIn(where.now, zone, where.home, true)),
  };
  /* WORDS HE TYPED KEEP NO AMOUNT ON A LINK WITHOUT MONEY (security pass, 2 Nov): a note's body, its lead line (a
     project's next step) and every other string a block carries go through `maskMoneyText`, as the project's own
     words already do (`projectOf`). Only `{{money:…}}` and money figures were held before, so "They pay £9,999.99 on
     launch" in a project's note reached a link that keeps money off whole. */
  const masked = (v: unknown): unknown =>
    typeof v === 'string' ? maskMoneyText(v) : Array.isArray(v) ? v.map(masked) : isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, masked(x)])) : v;
  const shownBlocks = page.blocks.map((b) => shownBlock(b, showing)).filter((b) => b !== null);
  const blocks = where.money ? shownBlocks : (shownBlocks.map(masked) as typeof shownBlocks);
  return {
    title: where.money || typeof page.title !== 'string' ? page.title : maskMoneyText(page.title),
    read_at: typeof page.read_at === 'string' ? page.read_at : null,
    layout:
      layout === null
        ? null
        : {
            ...(typeof layout.rail === 'number' ? { rail: layout.rail } : {}),
            ...(typeof layout.sticky === 'boolean' ? { sticky: layout.sticky } : {}),
          },
    expires_at,
    language,
    zone,
    home: where.home,
    empty: blocks.length === 0 ? NOTHING_SHOWN : null,
    blocks,
  };
};

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, admin, no, tail, clock } = deps;
  const mint = ulids(() => clock.now());

  /**
   * Whether this host can make a read-only link now, asked of the host on every call because its switch can change.
   * ABSENT IS NO, and so is an answer that throws or is not one: a link the host cannot sign is a button that fails.
   */
  const host = deps.shares;
  const hostSays = (): SharesAnswer => {
    let said: unknown;
    try {
      said = host?.();
    } catch {
      said = undefined;
    }
    if (isRecord(said) && said.can === true) return { can: true };
    const why = isRecord(said) && typeof said.why === 'string' && said.why.trim() !== '' ? said.why.trim() : SHARES_OFF;
    return { can: false, why };
  };

  /** The `share.open` of one link, or `undefined` for an id this record never opened. */
  const openedOf = (id: string) =>
    sql.one<{ actor: string; slug: string | null; opened_at: string; expires_at: string | null; bound: string | null }>(
      "SELECT actor, field AS slug, ts AS opened_at, to_v AS expires_at, from_v AS bound FROM event WHERE target = ? AND kind = 'share.open' LIMIT 1",
      `share:${id}`,
    );

  /**
   * How many times a page's declaration has been taken out: its newest retired version, or 0. A page taken out and a
   * page of the same name written later share an id and not this number, so a link made before it opens neither.
   */
  const cutOf = (page: string): number =>
    sql.one<{ v: number | null }>("SELECT max(version) AS v FROM declaration WHERE id = ? AND kind = 'page' AND retired = 1", `page.${page}`)?.v ?? 0;

  /**
   * What a link was made for (SEC3): the page's declaration, and for a page of a row, the row's list and number. The
   * slug alone was what a link followed, and a slug is a row's title: rename Acme to Zed and Beta to Acme, and a link
   * made for Acme's page served Beta's. Written on the link's `share.open` as JSON, in `from_v`, which no line of the
   * history prints for a link (its `note` is printed, so it stays empty).
   */
  /* A ROW WITH NO NUMBER (a list of `series: true`, whose rows carry no `seq`) IS BOUND BY ITS ID (RD11). Such a page
     could not be shared at all once links were bound, "There is no such page to share". */
  type Bound = { page: string; cut: number; register?: string; seq?: number; row?: string };
  const boundFor = (slug: string): Bound | null => {
    const here = kernel.pages().find((p) => p.slug === slug);
    if (here === undefined) return null;
    if (here.template === null || here.about === null) return { page: slug, cut: cutOf(slug) };
    if (typeof here.about.seq === 'number') return { page: here.template, cut: cutOf(here.template), register: here.about.register, seq: here.about.seq };
    if (typeof here.row === 'string') return { page: here.template, cut: cutOf(here.template), register: here.about.register, row: here.row };
    return null;
  };
  const boundOf = (said: string | null): Bound | null => {
    if (said === null) return null;
    try {
      const b = JSON.parse(said) as Partial<Bound>;
      if (typeof b.page !== 'string' || typeof b.cut !== 'number') return null;
      if (b.register === undefined) return { page: b.page, cut: b.cut };
      if (typeof b.register !== 'string') return null;
      if (typeof b.seq === 'number') return { page: b.page, cut: b.cut, register: b.register, seq: b.seq };
      return typeof b.row === 'string' ? { page: b.page, cut: b.cut, register: b.register, row: b.row } : null;
    } catch {
      return null;
    }
  };

  /**
   * WHETHER A LINK SHOWS MONEY: only one opened since links said so carries `money`, and only `false` keeps it off. A link
   * opened before (no `money`, or nothing bound at all) shows what it always showed, so nobody's sent link changes.
   */
  const moneyOf = (said: string | null): boolean => {
    if (said === null) return true;
    try {
      const b = JSON.parse(said) as { money?: unknown };
      return b.money !== false;
    } catch {
      return true;
    }
  };

  /**
   * The slug a link's page has now, or `null` when what it was made for is gone or has become something else.
   *
   * A PAGE OF A ROW IS FOUND BY ITS ROW, so a renamed row's link follows the row to its new address and never stays on
   * the old one when another row takes it. A page somebody wrote is found by its address, and must still be a page
   * somebody wrote and never taken out since. A link opened before links were bound carries nothing to find it by, and
   * is read by its slug as it always was; every such link closes within `SHARE_DAYS_MOST` of being opened.
   */
  const whereNow = (opened: { slug: string | null; bound: string | null }): string | null => {
    if (opened.slug === null) return null;
    if (opened.bound === null) return opened.slug;
    const bound = boundOf(opened.bound);
    if (bound === null || cutOf(bound.page) !== bound.cut) return null;
    const pages = kernel.pages();
    const here =
      bound.register === undefined
        ? pages.find((p) => p.slug === opened.slug && p.template === null)
        : pages.find(
            (p) =>
              p.template === bound.page &&
              p.about !== null &&
              p.about.register === bound.register &&
              (bound.row === undefined ? p.about.seq === bound.seq : p.row === bound.row),
          );
    return here?.slug ?? null;
  };

  /**
   * THE WORDS THE SPEAKING USE CASE GIVES THE LISTS (`labelsOf`), as the app reads them from `boot`'s voice: a team's
   * Tickets and To do. A link read the lists' own words ("Description", "Open") under the same headings.
   */
  const voiceLabels = (): Record<string, string> => {
    const pack = speakingNow(kernel);
    if (pack === null) return {};
    const read = kernel.packConfig(pack);
    if (!read.ok) return {};
    const config: Record<string, { label?: unknown }> = {};
    for (const [setting, decl] of Object.entries(read.value.config)) config[setting] = { label: (decl as { label?: unknown }).label };
    return labelsOf({ ...read.value.values }, config);
  };

  /** When a link was closed, or `null` while it is open. `share.close` is for good, so the first one is the one. */
  const closedAt = (id: string): string | null =>
    sql.one<{ ts: string }>("SELECT ts FROM event WHERE target = ? AND kind = 'share.close' ORDER BY ts LIMIT 1", `share:${id}`)?.ts ?? null;

  /**
   * Whether a page draws from a personal list (`personal: true`, `42 §4.4`), or is a page of one of its rows. A link is
   * read by whoever holds it, and such a list is the owner's alone, so no link opens on it.
   */
  const personalPage = (slug: string): boolean => {
    const personal = kernel.personalLists();
    if (personal.length === 0) return false;
    const page = kernel.pages().find((p) => p.slug === slug);
    return page !== undefined && (page.registers.some((r) => personal.includes(r)) || (page.about !== null && personal.includes(page.about.register)));
  };

  /**
   * Whether this person is an owner of the whole record now, and not suspended: the one person a link reads the page as.
   * The query `kernel/src/index.ts` asks for the owners it writes to, held to one person.
   */
  const ownsNow = (person: string): boolean =>
    sql.one(
      "SELECT 1 AS x FROM member m JOIN person p ON p.id = m.person_id WHERE m.person_id = ? AND m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL LIMIT 1",
      person,
    ) !== undefined;

  /** How many open pieces of work a shared project lists, and how many finished, before "and 3 more". */
  const OPEN_SHOWN = 12;
  const DONE_SHOWN = 5;
  const HAPPENED_SHOWN = 6;
  const NOTES_MOST = 2_000;

  /**
   * A PAGE OF ONE PROJECT, AS A LINK MAY SAY IT (collab pass 2, 2 Nov), or `undefined` for any other page.
   *
   * READ AS NOBODY, as the link's blocks are: a row kept private is not here, a personal list and the agents' runs are
   * never read, a money list never (its rows are amounts), and on a link that keeps money off every amount written in a
   * title or a note is taken out (`maskMoneyText`). The work is every list that declares when its rows are finished and
   * points at the project's list (a team's Tickets point at Projects), so a use case's own work list is found without a
   * name in the code. Nobody is named: not who did a thing, not who a thing is for.
   */
  const projectOf = (slug: string, money: boolean, lists: ReadonlyMap<string, RegisterDecl>, home: string | null): SharedProject | undefined => {
    const here = kernel.pages().find((p) => p.slug === slug);
    if (here === undefined || here.about === null || typeof here.row !== 'string') return undefined;
    const register = here.about.register;
    const decl = lists.get(register);
    const row = kernel.get(here.row);
    if (decl === undefined || row === null || row.deleted_at !== null) return undefined;
    const personal = new Set(kernel.personalLists());
    const hidden = (id: string): boolean => sql.one('SELECT 1 AS x FROM entry_private WHERE entry_id = ? LIMIT 1', id) !== undefined;
    if (personal.has(register) || NEVER_READ.has(register) || hidden(row.id) || decl.owner_only === true || (!money && moneyList(decl))) return undefined;
    const masked = (t: string): string => (money ? t : maskMoneyText(t));
    const words = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? masked(wordsShown(v.trim())).replace(SPOKEN_ID, '').trim() || null : null);
    const enumWord = (list: RegisterDecl, field: string | undefined, v: unknown): string => {
      if (typeof v !== 'string' || v === '') return '';
      const f = field === undefined ? undefined : list.fields.find((x) => x.id === field);
      const said = f?.labels?.[v];
      return typeof said === 'string' && said !== '' ? said : idSaid(v);
    };
    const laneField = decl.state ?? decl.fields.find((f) => f.id === 'lane' && f.type === 'enum')?.id;
    const titleOfRow = (list: RegisterDecl, r: Entry): string | null => words(r.fields[list.title]);

    /* THE WORK: lists that say when a row is finished, and point at this one. */
    const work: SharedProject['work'] = [];
    const moved: { at: string; said: string }[] = [];
    let firstOpen: string | null = null;
    /* NEVER THE AGENTS' LISTS OR AN OWNER'S OWN (security pass, 2 Nov): Keys, Learnings, Skills and Tools say when a row
       is finished and point at a project, so a link to Kiln listed "Stripe live secret for Kiln" under Keys, and a
       lesson's words under Learnings, to anybody holding it. */
    const agents = new Set(Object.values(agentLists(lists)));
    for (const list of lists.values()) {
      if (list.id === register || personal.has(list.id) || NEVER_READ.has(list.id) || agents.has(list.id) || list.owner_only === true || moneyList(list) || (list.done ?? []).length === 0) continue;
      const links = list.fields.filter((f) => f.type === 'ref' && f.to === register && f.retired !== true).map((f) => f.id);
      if (links.length === 0) continue;
      const got = kernel.list({ register: list.id, where: links.length === 1 ? { field: links[0]!, is: row.id } : { any: links.map((f) => ({ field: f, is: row.id })) }, limit: 200 });
      if (!got.ok) continue;
      const due = list.fields.find((f) => f.type === 'day' && f.deadline === true)?.id;
      const finishedOn = list.fields.find((f) => f.type === 'day' && /done|finished|closed/u.test(f.id))?.id;
      const finished = new Set(list.done ?? []);
      const state = list.state;
      const rows = got.value.rows.filter((r) => r.deleted_at === null && !hidden(r.id));
      const shownTask = (r: Entry): SharedTask | null => {
        const title = titleOfRow(list, r);
        if (title === null) return null;
        const v = state === undefined ? undefined : r.fields[state];
        const day = (k: string | undefined): string | null => (k !== undefined && typeof r.fields[k] === 'string' ? String(r.fields[k]) : null);
        return { title, state: enumWord(list, state, v), done: typeof v === 'string' && finished.has(v), due: day(due), on: day(finishedOn) ?? (typeof v === 'string' && finished.has(v) ? r.updated_at.slice(0, 10) : null) };
      };
      const all = rows.map(shownTask).filter((t): t is SharedTask => t !== null);
      /* OPEN FIRST, THE ONES WITH A DAY BY THEIR DAY; FINISHED, NEWEST FIRST AND NOT DROPPED ONES TWICE. */
      const open = all.filter((t) => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
      const done = all.filter((t) => t.done).sort((a, b) => (b.on ?? '').localeCompare(a.on ?? ''));
      if (open.length === 0 && done.length === 0) continue;
      firstOpen ??= open[0]?.title ?? null;
      const one = typeof (list as { one?: unknown }).one === 'string' ? String((list as { one?: unknown }).one) : 'task';
      work.push({ list: list.name, one, many: manyOf(one), open: open.slice(0, OPEN_SHOWN), more: Math.max(0, open.length - OPEN_SHOWN), done: done.slice(0, DONE_SHOWN) });

      /* WHAT MOVED: a row added, and a row whose state changed, newest first, in words and with nobody named. */
      const titles = new Map<string, string | null>(rows.map((r) => [`entry:${r.id}`, titleOfRow(list, r)]));
      if (titles.size > 0) {
        const marks = [...titles.keys()].map(() => '?').join(', ');
        const lines = sql.all<{ ts: string; kind: string; target: string; field: string | null; to_v: string | null }>(
          `SELECT ts, kind, target, field, to_v FROM event WHERE target IN (${marks}) AND (kind = 'create' OR kind = 'state' OR (kind = 'edit' AND field = ?)) ORDER BY rowid DESC LIMIT 40`,
          ...titles.keys(),
          state ?? '',
        );
        for (const l of lines) {
          const t = titles.get(l.target);
          if (!t) continue;
          if (l.kind === 'create') {
            moved.push({ at: l.ts, said: `Added ${t}` });
            continue;
          }
          let to: unknown = l.to_v;
          try {
            to = l.to_v === null ? null : JSON.parse(l.to_v);
          } catch {
            /* a word as written */
          }
          if (typeof to !== 'string' || to === '') continue;
          const raw = (list.fields.find((f) => f.id === state)?.values ?? []).find((v) => v === to || enumWord(list, state, v) === to) ?? to;
          moved.push({ at: l.ts, said: finished.has(raw) ? `Finished ${t}` : `${t} moved to ${enumWord(list, state, raw)}` });
        }
      }
    }

    /* AND ITS OWN NOTE, AS WRITTEN, links into the record said as their words. */
    const noteField = decl.fields.find((f) => f.type === 'document' && f.retired !== true)?.id;
    const note = noteField === undefined ? null : words(row.fields[noteField]);
    const about = decl.fields.find((f) => f.id === 'about' && f.type === 'text') ? words(row.fields.about) : null;
    const next = words(row.fields.next) ?? firstOpen;
    moved.sort((a, b) => b.at.localeCompare(a.at));
    /* ITS MONEY, only where the link carries money: the figures the owner's Money tile reads, filled with the project's
       name as that page fills them, read as nobody (a private row adds nothing), each currency said whole. */
    const named = typeof row.fields[decl.title] === 'string' ? String(row.fields[decl.title]).trim() : '';
    const moneyParts: NonNullable<SharedProject['money']> = [];
    if (money && named !== '')
      for (const [key, metric, label] of [['owed', 'project-owed', 'Still to come in'], ['in', 'project-in-month', 'In this month'], ['out', 'project-out-month', 'Out this month']] as const) {
        const d = kernel.metricDecl(metric);
        if (!d) continue;
        const read = kernel.metric(fill(d, null, named) as typeof d, { viewer: NOBODY });
        if (!read.ok || typeof read.value.value !== 'number' || typeof read.value.unit !== 'string' || !(read.value.value > 0)) continue;
        const said = writeAmount({ minor: read.value.value, currency: read.value.unit }, home, 'read')?.text;
        if (said) moneyParts.push({ key, label, said });
      }
    return {
      ...(money ? { money: moneyParts } : {}),
      name: titleOfRow(decl, row) ?? here.title,
      lane: laneField === undefined ? null : enumWord(decl, laneField, row.fields[laneField]) || null,
      about,
      next,
      work,
      notes: note === null ? null : note.length > NOTES_MOST ? `${note.slice(0, NOTES_MOST).replace(/\s+\S*$/u, '')}…` : note,
      happened: moved.slice(0, HAPPENED_SHOWN),
    };
  };

  /**
   * THE PAGE AS A LINK WOULD SHOW IT, or `null` for a page the kernel would not draw: read as nobody, with no key number
   * leading a card, in the words the owner reads, and money on or off as the link says. `sharedPage` answers it to a
   * link, and `shareable` asks it before a link is made, so the sheet can say a page shows nothing (AM21).
   */
  const linkPage = (slug: string, money: boolean, expires_at: string): SharedPage | null => {
    /* A LINK IS NOBODY, so a row its maker kept private is not on the shared page. */
    /* AND WITH NO KEY NUMBER LEADING A CARD (SL2): those read across the record, so each card's line is its own figure. */
    const out = kernel.page(slug, undefined, { viewer: NOBODY, keyNumbers: false });
    if (!out.ok) return null;
    const identity = kernel.identity();
    const figure = (metric: string): string | undefined => kernel.metricDecl(metric)?.name || undefined;
    /* THE HOME CURRENCY AS THE APP READS IT (`homeOf`): the one the record chose, else the one its money is all in. Two
       held and none chosen is no home, and every amount keeps its code. */
    const held = kernel.homeCurrency() === null ? kernel.moneyCurrencies(() => true, 2, NOBODY) : [];
    const home = kernel.homeCurrency() ?? (held.length === 1 ? held[0]! : null);
    const reads = (b: BlockResult): readonly string[] => kernel.blockRegisters(b as unknown as Parameters<typeof kernel.blockRegisters>[0]);
    /* THE LISTS IN THE WORDS THE OWNER READS THEM IN (`voiced`): a team's tasks are Tickets, a ticket To do. */
    const lists = voiced(kernel.registers(), voiceLabels());
    const moneyFigure = figureIsMoney(kernel, lists);
    /* A ROW ANOTHER ROW LINKS TO IS NAMED ONLY WHERE THE LINK MAY NAME IT: a row that is there, kept private by nobody,
       on a list that is neither personal nor one no link reads, and on a link with money off, not a row of a list that
       is money. Its name and nothing else: never its id, its list or its address. */
    const personal = new Set(kernel.personalLists());
    const refSaid = (id: string): string | undefined => {
      if (!ULID.test(id)) return undefined;
      const row = kernel.get(id);
      if (row === null || row.deleted_at !== null || personal.has(row.register) || NEVER_READ.has(row.register)) return undefined;
      if (!money && moneyList(lists.get(row.register))) return undefined;
      if (sql.one('SELECT 1 AS x FROM entry_private WHERE entry_id = ? LIMIT 1', row.id) !== undefined) return undefined;
      return kernel.titleOfRow(row.id) ?? undefined;
    };
    const shown = shownPage(out.value, expires_at, lists, { language: identity?.locale, zone: identity?.tz, home, now: clock.now(), figure, reads, money, moneyFigure, refSaid });
    const found = projectOf(slug, money, lists, home);
    /* ITS NOTE ONCE: where the page's own blocks already draw it, the project does not draw it again. */
    const project = found !== undefined && found.notes !== null && shown.blocks.some((b) => b.kind === 'note' && typeof b.body === 'string' && b.body.trim() !== '') ? { ...found, notes: null } : found;
    /* A PROJECT WITH SOMETHING TO SAY IS NOT AN EMPTY PAGE, whatever its blocks drew. */
    return project === undefined ? shown : { ...shown, project, empty: null };
  };

  return {
    /**
     * Whether a read-only link can be made here, and why not, so the Share sheet draws the press only when it would
     * work. ADMIN, A READ: the owner in a browser asks; a token or a member is refused as every ADMIN method refuses them.
     * An owner who is not signed in is told she must be, as `openShare` would tell her.
     *
     * ASKED WITH A PAGE (`slug`, and `money` as the link would carry it), IT ALSO SAYS WHETHER A LINK WOULD SHOW ANYTHING
     * (`empty: true` when it would show nothing, AM21): Share on an empty Money made a 30-day link that read "This page
     * has nothing a link can show", and the sheet never said so first. Nothing is written, as nothing is for a link.
     */
    async shareable(args: { slug?: unknown; money?: unknown } | undefined, ctx: CallContext): Promise<Result<SharesAnswer>> {
      const stop = admin(ctx, 'ask whether a link can be made');
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person' || ctx.credentialed === false) return ok({ can: false, why: SHARES_SIGNED_IN });
      const can = hostSays();
      const slug = isRecord(args) ? args.slug : undefined;
      if (!can.can || typeof slug !== 'string' || slug === '' || kernel.refused() || !kernel.pages().some((p) => p.slug === slug) || personalPage(slug)) return ok(can);
      /* ASKED AS A READ, its words come in the address, so the tick arrives as "true" (AN14): read as no, the sheet judged
         every page with money off, and an empty Money with money ticked was never said to be empty. */
      const money = isRecord(args) && (args.money === true || args.money === 'true');
      const shown = linkPage(slug, money, instant(clock.now() + SHARE_DAYS * DAY_MS));
      /* AND THE PAGE A LINK WOULD OPEN, so the sheet judges it as the link's page draws it (AN14): the reader leaves out a
         block with nothing a stranger can read (a heading over no rows, the owner's own "empty" line), and an empty Money
         kept blocks here and drew none there, so the sheet never warned. The owner reads all of it already. */
      if (shown === null) return ok(can);
      return ok(shown.blocks.length === 0 && shown.project === undefined ? { ...can, empty: true } : { ...can, page: shown });
    },

    /**
     * Open a link to one page for `days`, 1 to 90 and 30 unless said. ADMIN.
     *
     * A PERSON, SIGNED IN, AND NOT A SELF-HOST'S OPEN MODE. A link is read from anywhere for up to ninety days, which is
     * the argument `createToken` makes about a bearer (`CallContext.credentialed`): something that outlives the
     * machine's boundary needs a credential to mint. And the link reads the page as the person who opened it, so it is
     * opened by a person, whose id is the event's actor.
     *
     * THE HOST SIGNS THE LINK after this answers (`withShareLinks`, and `linkOpened` at the Worker's door), and a host
     * with no key refuses before this is asked, so no `share.open` is written for a link nobody could be handed.
     */
    async openShare(args: { slug?: unknown; days?: unknown; money?: unknown } | undefined, ctx: CallContext): Promise<Result<ShareOpened>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person' || ctx.credentialed === false)
        return no('NEEDS_BROWSER_SESSION', SHARES_SIGNED_IN, { at: 'principal' });
      /* AND ONLY WHERE THE HOST SAYS IT CAN, in the host's own sentence, so no `share.open` is written for a link it
         would not sign. */
      const can = hostSays();
      if (!can.can) return no('NOT_IN_THIS_BUILD', can.why ?? SHARES_OFF, { at: 'host' });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const said: Record<string, unknown> = isRecord(args) ? args : {};
      const slug = said.slug;
      if (typeof slug !== 'string' || slug === '') return no('REQUIRED_MISSING', 'A link opens one page, so say which page.', { at: 'slug' });
      const days = said.days === undefined ? SHARE_DAYS : said.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > SHARE_DAYS_MOST)
        return no('OUT_OF_BOUNDS', `A link opens for a whole number of days from 1 to ${SHARE_DAYS_MOST}, and ${SHARE_DAYS} unless you say.`, { at: 'days' });
      /* MONEY IS OFF UNLESS SAID (AF18): the sharer ticks "Include money", and an agent says `money: true`. */
      const money = said.money === undefined ? false : said.money;
      if (typeof money !== 'boolean') return no('VALUE_MALFORMED', 'Say money as true to show amounts on the link, or false to keep them off.', { at: 'money' });
      if (!kernel.pages().some((p) => p.slug === slug)) return no('PAGE_UNKNOWN', 'There is no such page to share.', { at: 'slug' });
      if (personalPage(slug)) return no('FORBIDDEN', 'This page shows a personal list, which only the owner reads, so no link can open it.', { at: 'slug' });
      const bound = boundFor(slug);
      if (bound === null) return no('PAGE_UNKNOWN', 'There is no such page to share.', { at: 'slug' });
      const now = clock.now();
      const id = mint();
      const expires_at = instant(now + days * DAY_MS);
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, from_v) VALUES (?, ?, ?, 'share.open', ?, 'share', ?, ?, ?)",
        mint(),
        instant(now),
        ctx.principal.id,
        `share:${id}`,
        slug,
        expires_at,
        /* WHAT IT WAS MADE FOR, AND WHETHER IT SHOWS MONEY, in one: `boundOf` reads the first and leaves `money` alone. */
        JSON.stringify({ ...bound, money }),
      );
      return tail(ok({ id, slug, expires_at }));
    },

    /**
     * Close one link for good. ADMIN. Closing a closed link answers when it was closed and writes nothing, so a second
     * press is not a second event. Sharing the page again opens a new link with a new id.
     */
    async closeShare(args: { id?: unknown } | undefined, ctx: CallContext): Promise<Result<{ id: string; closed_at: string }>> {
      const stop = admin(ctx);
      if (stop) return { ok: false, refusal: stop };
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const id = isRecord(args) ? args.id : undefined;
      if (typeof id !== 'string' || id === '') return no('REQUIRED_MISSING', 'A link is closed by its id, as shares lists it.', { at: 'id' });
      const link = id.length > SHARE_ID_MOST ? undefined : openedOf(id);
      if (link === undefined) return no('REF_UNKNOWN', 'No link with that id was opened here. shares lists every one.', { at: 'id' });
      const was = closedAt(id);
      if (was !== null) return ok({ id, closed_at: was });
      const closed_at = instant(clock.now());
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, field) VALUES (?, ?, ?, 'share.close', ?, 'share', ?)",
        mint(),
        closed_at,
        ctx.principal.id,
        `share:${id}`,
        link.slug,
      );
      return tail(ok({ id, closed_at }));
    },

    /**
     * Every link this record opened, newest first, open and closed, and never a token. ADMIN.
     *
     * `title` IS THE PAGE'S TITLE NOW, and empty for a page that is no longer here, because the events hold the slug and
     * no words. Read through the ledger's `(target, ts)` index over the `share:` targets alone (`share;` is the first
     * text after them), so the walk is the links and never the whole ledger.
     */
    async shares(_args: unknown, ctx: CallContext): Promise<Result<ShareRow[]>> {
      const stop = admin(ctx, 'list the links to your pages');
      if (stop) return { ok: false, refusal: stop };
      const titles = new Map(kernel.pages().map((p) => [p.slug, p.title]));
      const rows = sql.all<{ target: string; slug: string | null; opened_at: string; expires_at: string | null; closed_at: string | null; bound: string | null }>(
        `SELECT o.target AS target, o.field AS slug, o.ts AS opened_at, o.to_v AS expires_at, o.from_v AS bound,
                (SELECT MIN(c.ts) FROM event c WHERE c.target = o.target AND c.kind = 'share.close') AS closed_at
           FROM event o
          WHERE o.target >= ? AND o.target < ? AND o.kind = 'share.open'
          ORDER BY o.ts DESC, o.id DESC
          LIMIT ?`,
        /* THE BOUNDS ARE BOUND, never written in: ';' (the next character after ':') inside the text reads as a second statement to the self-host's guard. */
        'share:',
        'share;',
        SHARES_LISTED_MOST,
      );
      return ok(
        rows.map((r) => ({
          id: r.target.slice('share:'.length),
          slug: r.slug ?? '',
          /* THE TITLE OF WHAT THE LINK OPENS NOW, found as the link finds it (`whereNow`), so a slug another row has
             taken since is not shown under this link's name. Empty when it opens nothing. */
          title: titles.get(whereNow(r) ?? '') ?? '',
          opened_at: r.opened_at,
          expires_at: r.expires_at ?? r.opened_at,
          closed_at: r.closed_at,
          money: moneyOn(r.bound),
        })),
      );
    },

    /**
     * The page one link opens, one level deep. READ+, and the share principal only.
     *
     * THE GUARD ASKS THE LADDER OF EVERYBODY BUT A LINK, and refuses them anyway. `allows` refuses a share principal
     * every rung, so every other method refuses it; this is the one method it opens, and nobody else opens it. Every way
     * a link does not open is `SHUT`.
     *
     * NOTHING IS WRITTEN, NOT EVEN `page`'s `page.render` LINE. That line counts the owner's opens of a page, and a link
     * posted somewhere public would count a stranger's reads as hers. So this asks the kernel for the page itself; the
     * owner reads every list, so `page`'s `heldBlock` would hold nothing back from her, and `shownBlock` then keeps what a
     * link may show.
     */
    async sharedPage(_args: unknown, ctx: CallContext): Promise<Result<SharedPage>> {
      const stop = ctx.principal.kind === 'share' ? null : (scoped(ctx, 'read') ?? SHUT);
      if (stop) return { ok: false, refusal: stop };
      const link = ctx.principal;
      if (link.kind !== 'share' || kernel.refused()) return { ok: false, refusal: SHUT };
      const opened = link.id.length > SHARE_ID_MOST ? undefined : openedOf(link.id);
      if (opened === undefined || opened.slug !== link.slug || opened.expires_at === null) return { ok: false, refusal: SHUT };
      const ends = Date.parse(opened.expires_at);
      if (!Number.isFinite(ends) || clock.now() >= ends) return { ok: false, refusal: SHUT };
      if (closedAt(link.id) !== null || !ownsNow(opened.actor)) return { ok: false, refusal: SHUT };
      /* THE PAGE THE LINK WAS MADE FOR, found by its declaration and row and not by the slug (SEC3). */
      const slug = whereNow(opened);
      if (slug === null || !kernel.pages().some((p) => p.slug === slug)) return { ok: false, refusal: SHUT };
      /* AND A PAGE THAT CAME TO SHOW A PERSONAL LIST AFTER ITS LINK WAS OPENED NO LONGER OPENS. */
      if (personalPage(slug)) return { ok: false, refusal: SHUT };
      const shown = linkPage(slug, moneyOf(opened.bound), opened.expires_at);
      return shown === null ? { ok: false, refusal: SHUT } : ok(shown);
    },
  };
}
