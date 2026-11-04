/**
 * How the app draws what a record answers: a cell, a column, a row's tone and name, a filter as a sentence, a cash walk,
 * a feed and who did what, with no reading of its own.
 *
 * IT WAS ALSO THE SAMPLE, AND THAT HALF IS GONE. This file answered `boot`, `list`, `entry`, `search`, `page`, `values`,
 * `job` and `metric` out of `data.ts`, as "a synchronous mock" that one day would be swapped for the real client, and
 * re-exported twenty-five of the sample's tables beside them. The client arrived and every live screen reads the record
 * through it, but the helpers those screens draw with lived in the same module as the mock, so the mock shipped with
 * them and six screens still called it: the Add a block previews, `/s/<token>`, `/jobs/<id>`, the aim on `/decide`, the
 * pen in Settings and the shell's own type. The readers are in
 * `fixtures/readers.ts` now, which only a test may import, and `no-sample-render-helpers.test.ts` holds both halves of that.
 *
 * AND NOTHING HERE READS THE SAMPLE NOW. Until the sample left the app `ROWS` was the fallback of `display`, `identityOf` and
 * `spokenRow` when a caller handed no `names`, and all of `currencyFor`, `homeCurrency` and `hueOf`, and the
 * sample's `PACKS` named an add-on in `setupSaid` and `packDiff`. The rows, the row names and the declarations are
 * `held.ts`'s, which only the record fills in a shipped tab, and a module's name is `modules.ts`'s.
 */

import { addDays, agentDoing, dateSaid, day as fmtDay, diffRows, handleName, money, relative, shortDay, since, integer, MISSING, TIMELINE_BETWEEN, timelineTitle } from 'braindog-render';
import type { Column, TableRow } from 'braindog-render/svelte';
import { asPartOf, namesSaid, ruleAsked, ruleDone, ruleFolded, useCaseName } from '@braindog/seed/usecases/names';
/* THE LISTS A MODULE BRINGS, BY NAME AND WITHOUT ITS DOCUMENT (`@braindog/seed/packs/lists`): this file is on the first open. */
import { listsOfModule } from '@braindog/seed/packs/lists';
import type { Bars, MeasureSeries, Part, QueueQuestion, Rate } from '@braindog/kernel';
import { PEOPLE, QUIET_MS } from '@braindog/kernel/constants';
import { recordToday } from './zone.ts';
import type { BlockResult as Answer } from '@braindog/kernel';

import { amountOf, currencyOf } from './money.ts';
import { isGlyph, type IconName } from '../ui/icons.ts';
import type { RunPresence } from '../ui/presence-words.ts';
import { copy } from '../copy.ts';
/* No cycle: `voice.ts` reads the copy and two word lists, never this file. */
import { singularOf } from '../voice.ts';
import { PAGES, REGISTERS, ROWS, TITLES } from './held.ts';
/* Type only, and there is no cycle: `remote.ts` reads the declaration and the sample, never this file. */
import type { Names } from './remote.ts';
import { compile, declaredValue } from './where.ts';
import type { MetricDecl } from './metrics.ts';
import type { Entry, Fields, Filter, FieldDecl, PageBlock, RegisterDecl } from './schema.ts';
import { listLine } from './tags.ts';
import { hostsSaid, needsSaid, originSaid } from './tool-facts.ts';
import { shownName } from '../shell/side.ts';
import { largestPart, partsOf, splitAtOf, splitSaid } from './split.ts';
/* No cycle: `names.ts` reads `held.ts` and the copy, never this file. */
import { actor, AGENT_NAMES, handlesSaid, handleWords, nameWords, rowNameSaid, runByIn, type RunBy } from './names.ts';
import type { Byline } from './byline.ts';

/* THE DECLARATIONS EVERY HELPER BELOW READS, which are `held.ts`'s and not a copy: a list the record taught this tab is
   the list a cell here is drawn from. */
export { REGISTERS };

/**
 * The currency the rows of one money field are in, or `null` when they are not all one.
 *
 * THIS REPLACED A CONSTANT, and the constant was the bug. `CURRENCY = 'GBP'` was pinned to every
 * money value on every screen, so a euro invoice would have rendered as sterling — the right digits
 * under the wrong code, on the one kind of figure somebody acts on. A currency is a property of a
 * VALUE; this function exists only for the places that need one when there is no value yet, like an
 * empty field on a form, and it answers from the rows rather than from a preference.
 */
export function currencyFor(register: string, field: string): string | null {
  const seen = new Set<string>();
  for (const row of ROWS[register] ?? []) {
    const c = currencyOf(row.fields[field]);
    if (c) seen.add(c);
    if (seen.size > 1) return null;
  }
  return [...seen][0] ?? null;
}

/**
 * The record's home currency, which a screen writes with its symbol alone: the one its `boot` said, else the one its
 * money is all in, or `null` where nobody has chosen one and the money is in several.
 *
 * IT WAS A COUNT OF THE ROWS, AND A COUNT IS A GUESS. This answered the currency most of `ROWS` was in, and `ROWS` is
 * `held.ts`'s, which nothing fills in a shipped tab, so on a live record it could only answer null: a figure in the
 * record's own currency kept its code after it ("£33,850.00 GBP"), and an empty money box fell through to sterling.
 * The record knows the answer, the `home_currency` a person chose, and says it in `boot` (`Boot.record.currency`).
 * `layoutOf` (`boot-live.ts`) keeps it here as it builds the shell, so this is the booted shell's currency and never a
 * second reading of anything. Where nobody chose, it is the one currency the record's money is in (`homeOf`), which
 * `readBoot` asked the record for before the shell was built.
 */
let home: string | null = null;
export const homeCurrency = (): string | null => home;

const CODE = /^[A-Z]{3}$/u;

/**
 * The record's home currency from what it said and what it holds: the one its `boot` named, else the one its settings
 * hold, else the one currency its money is in when every amount it holds is in that one.
 *
 * A RECORD NOBODY SET A CURRENCY ON WAS DRAWN IN CODES, "£39.00 GBP", on a record whose every amount is sterling.
 * Nobody chose, but nothing is left to choose between: one currency is the record's own by the only reading there is.
 * TWO ARE NEVER GUESSED BETWEEN, so a record holding sterling and dollars with none chosen keeps the code on both, and
 * a setting is read as the kernel reads it (`homeFrom`), trimmed and in capitals.
 */
export function homeOf(said: unknown, setting: unknown = null, held: Iterable<string> = []): string | null {
  if (typeof said === 'string' && CODE.test(said)) return said;
  const set = typeof setting === 'string' ? setting.trim().toUpperCase() : '';
  if (CODE.test(set)) return set;
  const codes = new Set([...held].filter((c) => CODE.test(c)));
  return codes.size === 1 ? [...codes][0]! : null;
}

/**
 * Keep the currency a record's `boot` said, or what `homeOf` reads from its settings and money where it said none, and
 * answer it, so the shell's `index.currency` and `homeCurrency()` are one value. A shell over a refusal says none, so a
 * record opened after another is never drawn in the first one's money; and what is not a three-letter code is no
 * currency at all, rather than a code printed beside every figure.
 */
export const learnHome = (currency: string | null, setting: unknown = null, held: Iterable<string> = []): string | null =>
  (home = homeOf(currency, setting, held));

/**
 * Every currency the record's money is in, as its `boot` said them (`money`, else the implied `held`), kept by
 * `layoutOf` beside the home currency so a preset that quotes them (`presetOf`'s rates feed) names them all, sorted.
 */
let moneyHeld: string[] = [];
export const moneyCurrencies = (): string[] => moneyHeld;
export const learnMoney = (codes: Iterable<string>): string[] =>
  (moneyHeld = [...new Set([...codes].filter((c) => CODE.test(c)))].sort());

/* ── values ──────────────────────────────────────────────────────────────── */

/** WHAT A REGISTER SAYS A FIELD IS. Exported because the live path has to ask the same question
   the sample path asks, and answering it twice is how the two came to disagree. */
export const decl = (register: string, field: string): FieldDecl | undefined =>
  REGISTERS[register]?.fields.find((f) => f.id === field);

/**
 * A COLUMN'S HEADING: the label its block gives it, or over a list's title field the word for one of its rows, as the list
 * is labelled, so a team whose tasks are Tickets reads Ticket over them. Any other column is headed by its field's name
 * (`fieldWords`).
 *
 * A LABEL THAT IS ONLY THE FIELD'S ID IS NO LABEL. The evaluator hands a column declared without `label:` back labelled
 * with its field id, and this returned it as given, so Today headed a repeating line's day "next_due" (verify5, 7).
 */
export const columnHeading = (register: string, c: { field: string; label?: string | undefined }): string => {
  if (typeof c.label === 'string' && c.label !== c.field) return c.label;
  const list = REGISTERS[register];
  const one = list && list.title === c.field ? list.one : undefined;
  if (typeof one === 'string' && one) return one.charAt(0).toUpperCase() + one.slice(1);
  return fieldWords(register, c.field);
};

/**
 * WHAT A FIELD IS CALLED ON A SCREEN, read from the list it belongs to: its declared label, else its id in words
 * ("Next due"), never the id itself. Every place that heads or names a column by its field asks this one.
 */
export const fieldWords = (register: string, field: string): string => {
  const list = REGISTERS[register];
  /* AND A FIELD THE LIST DECLARES IS SAID BY ITS LABEL, never its id: a bill's card headed its figure "amount". */
  const f = list?.fields.find((d) => d.id === field);
  if (f) return labelOf(f);
  /* AND NEVER THE ID ITSELF (polish-f L4): an add-on's list switched to its Table look, or read before its declaration
     arrived, headed its columns "tax_part" and "line.amount". A path through a link is said by the field it ends on, in
     the list the link points at; anything else is the id said as words, as a label is when a pack gives none. */
  const dot = field.indexOf('.');
  if (dot > 0) {
    const via = list?.fields.find((d) => d.id === field.slice(0, dot));
    const to = via?.to === undefined ? undefined : REGISTERS[via.to];
    const end = field.slice(dot + 1);
    const there = to?.fields.find((d) => d.id === end);
    return there ? labelOf(there) : idWords(end.slice(end.lastIndexOf('.') + 1));
  }
  return idWords(field);
};

/** A field id said as words when nothing labels it: `tax_part` is "Tax part", `paid-on` is "Paid on". */
const idWords = (id: string): string => {
  const said = id.replace(/[_-]+/gu, ' ').trim();
  return said === '' ? id : said.charAt(0).toUpperCase() + said.slice(1);
};

/** A label is the field id with `_` as a space, until a pack needs a different word (50 §10). */
export const labelOf = (f: FieldDecl): string =>
  f.label ?? f.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Is what this field renders a string SOMEBODY TYPED, or a string the app built?
 *
 * The distinction is bidirectional text, and it is not cosmetic. Unicode resolves the direction of
 * neutral characters — spaces, punctuation, brackets, the `—` in an invoice title — from the
 * paragraph around them. So an Arabic party name sitting in an English paragraph puts its full stop
 * on the wrong end of the sentence, and an English title in an Arabic UI does the same in reverse.
 * The text is not merely aligned oddly; it is in the wrong ORDER, and the reader has no way to know
 * that the app did it rather than whoever typed it.
 *
 * `dir="auto"` hands the browser the one rule it needs: take the direction from the first strong
 * character in the string. "Invoice 2026-041" starts with a Latin I and reads left-to-right;
 * "فاتورة 2026" starts with an Arabic letter and reads right-to-left; both then place their own
 * neutrals correctly, in the same grid, with no locale setting and no guess by us.
 *
 * It is TRUE for `text` and `document`, obviously, and also for `ref` — a reference renders as the
 * TITLE of the row it points at, which is prose. It is false for everything else on purpose: money,
 * dates, integers and durations are strings this file assembled from a number, and their direction
 * is the app's rather than the reader's. An unknown field is treated as prose, because the failure
 * of guessing wrong that way is a correctly-ordered string, and the other way it is a broken one.
 */
export const isProse = (register: string, field: string): boolean => {
  const t = decl(register, field)?.type;
  return t === undefined || t === 'text' || t === 'document' || t === 'ref';
};

/** `dir` for a prose element, and nothing at all otherwise — Svelte drops an undefined attribute. */
export const dirOf = (register: string, field: string): 'auto' | undefined =>
  isProse(register, field) ? 'auto' : undefined;

/**
 * The fields a PERSON sees, which is not the same list as the fields a register declares.
 *
 * Two kinds come out. A `secret` is never rendered anywhere, which was already true. And the two
 * fields named by `identity` are the row's MARK and its frozen accent hue: machinery that exists so
 * a thing can be recognised at a glance, chosen once at create and never hand-picked (13 §2.1b).
 *
 * They were being listed like any other field, so creating a project asked for "Mark" and "Hue" in
 * two text boxes, and the row page printed them as values. `labelOf` is what made it look
 * deliberate rather than broken: it capitalises a field id into a plausible English word, so an
 * internal column arrives wearing a label and nothing about the screen says it should not be there.
 *
 * The identity is drawn, not typed. There is nothing to ask and nothing to read.
 */
export function readableFields(register: string): FieldDecl[] {
  const reg = REGISTERS[register];
  if (!reg) return [];
  const internal = new Set([reg.identity?.mark, reg.identity?.accent].filter(Boolean));
  return reg.fields.filter((f) => f.type !== 'secret' && !internal.has(f.id));
}

/**
 * Formatting is decided for the reader, not at the call site. A `ref` reads as the title of the row
 * it points at, because a person says "Halden", not "people#1".
 */
/**
 * A ROW NOBODY NAMED, SAID AS ITS KIND AND NUMBER: `Course #1`, never `courses#1`. A ref to a row with
 * no title, or to a row the record did not name, drew the stored spoken id in a table cell, which is
 * the string a person never says. `label` is the field's own label, for a list this build does not
 * declare.
 */
export function unnamed(register: string, seq: number | string, label?: string): string {
  const said = REGISTERS[register]?.one ?? label;
  /* A NUMBER IS A ROW SOMEBODY CAN OPEN, AND ANYTHING ELSE IS AN ID, WHICH IS NEVER SAID. A ref is
     stored as its target row's ULID, so a ref this screen could not walk to reached here as one, and the founder's
     Today drew "Book #01M3VMPSHV07AM4S51WDTFM5XG" for each part of the cash by book. It is the kind alone, named as a
     row nobody named. A list this build does not declare is said by its id made singular, `courses` as a course. */
  if (!/^[1-9]\d*$/u.test(String(seq))) {
    const one = (said ?? singularOf(register.replace(/_/g, ' '))).trim();
    /* AND A KIND NOBODY SAID, a figure's part whose list this build does not know, is Unnamed and nothing after it. */
    if (one === '') return 'Unnamed';
    return `Unnamed ${/^[A-Z][a-z]/u.test(one) ? one.charAt(0).toLowerCase() + one.slice(1) : one}`;
  }
  const kind = said ?? register.replace(/_/g, ' ');
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} #${seq}`;
}

/** A spoken id as a person writes it and a tool call passes it: `things#1`. */
const SPOKEN_ID = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/** A row's id as the record mints it (`packages/kernel/src/ids.ts`): twenty-six letters of Crockford's alphabet. */
export const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/**
 * WHAT A SPOKEN ID HELD AS TEXT READS AS, AND WHERE IT OPENS. A run holds its project as `things#1` and
 * a tool call reads `tracks#1`; both drew the id. The name comes from `names` when the screen is
 * drawing a record, and from the names this tab has learnt otherwise, and a row with no name reads as `unnamed`.
 */
export function spokenRow(value: unknown, names?: Names): { label: string; href: string } | null {
  const m = typeof value === 'string' ? SPOKEN_ID.exec(value) : null;
  if (!m) return null;
  const [, register, seq] = m as unknown as [string, string, string];
  const titleField = REGISTERS[register]?.title;
  /* THE SCREEN'S NAMES FIRST, then what this tab has learnt: a row's own walk names only the lists it points at. */
  const said = names?.get(value as string) ?? (titleField ? TITLES.get(register)?.get(Number(seq)) : undefined);
  const label = typeof said === 'string' && said.trim() !== '' ? said : unnamed(register, seq);
  return { label, href: `/r/${register}/${seq}` };
}

/** Money when the walk knows its currency, and the bare integer when there is nothing to say. */
const moneyOr = (minor: number, currency: string | null): string => (currency === null ? integer(minor) : money(minor, currency));

/**
 * A VALUE NO FIELD DECLARES, said by its shape, because `String(v)` is not a way of saying anything.
 *
 * It was `String(value)`, which wrote a signed amount as `[object Object]` and a due day as `2026-07-01` wherever a
 * list nobody declares (what falls due, across every list) reached a cell. Money carries its own currency and a bare
 * day is a day, so both are said as they would be under a declaration; any other object has no words, and is
 * nothing rather than its type's name.
 */
function undeclared(value: unknown): string | null {
  const c = currencyOf(value);
  const a = c === null ? null : amountOf(value);
  if (c !== null && a !== null) return money(a, c);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) return dateSaid(value);
  /* AN ID IS NOT WORDS: a ULID in a field no declaration types is a ref this build cannot name, and is not drawn. */
  if (typeof value === 'string' && ROW_ID.test(value)) return null;
  if (typeof value === 'object') return null;
  /* A CHOICE THE RECORD KEEPS AS A CODE, said as words where no declaration names it (audit of 30 October, 7): the bell
     read "health set to at_risk" before the projects list was learnt. */
  if (typeof value === 'string' && /^[a-z]+(?:_[a-z]+)+$/u.test(value)) return value.replace(/_/gu, ' ');
  return String(value);
}

/**
 * A VALUE OF A COLUMN NO LIST DECLARES, said by the type the block answered for it (`BlockResult.types`).
 *
 * A computed source names no list, so `decl` finds nothing and every value went through `undeclared`: his project page's
 * "Tools and servers" printed `2026-10-06T19:07:01.610Z` under Last used and `S731` under Last used by. An instant is a
 * time in words, as a declared one is; a run is the words the page read for it ("Claude Code, 6 Oct", `runWords`), and
 * a run the page could not read is an agent, never its handle.
 */
function answered(type: string, value: unknown, now: number, names?: Names): string | null {
  if (type === 'instant' && typeof value === 'string') return since(value, now);
  if (type === 'day' && typeof value === 'string') return dateSaid(value, now);
  if (type === 'int' && typeof value === 'number') return integer(value);
  if (type === 'run' && typeof value === 'string') return names?.get(value) || actor(value).name;
  return undeclared(value);
}

/**
 * A run as a person reads it: the app it ran in, else its agent's name, and the day it started. "Claude Code, 6 Oct".
 * `null` for a row that holds neither, which the caller says as an agent.
 */
export function runWords(fields: Readonly<Record<string, unknown>>): string | null {
  const who = runWho(fields);
  if (who === null) return null;
  const started = typeof fields.started === 'string' ? fields.started.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/u.test(started) ? `${who}, ${shortDay(started)}` : who;
}

/** Who a run is, as a person reads it: the app it ran in ("Claude Code"), else its agent's name, else `null`. */
export function runWho(fields: Readonly<Record<string, unknown>>): string | null {
  const raw = typeof fields.client === 'string' && fields.client.trim() !== '' && !/[/\\:@]/u.test(fields.client) ? fields.client.trim() : null;
  /* AN APP'S OWN SLUG IS SAID AS ITS NAME: MCP's `clientInfo` names Claude Code
     `claude-code`, and a run's page said "claude-code, in braindog on master". */
  /* AND A CLIENT THAT IS AN AGENT THE PRODUCT KNOWS IS ITS OWN SPELLING: "chatgpt" is ChatGPT, never "chatgpt". */
  if (raw !== null && Object.hasOwn(AGENT_NAMES, raw.toLowerCase())) return AGENT_NAMES[raw.toLowerCase()]!;
  const app = raw !== null && /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/u.test(raw) ? raw.split(/[-_]/u).map((w) => (w === 'cli' ? 'CLI' : `${w[0]!.toUpperCase()}${w.slice(1)}`)).join(' ') : raw;
  const agent = typeof fields.agent === 'string' && fields.agent !== '' && fields.agent !== 'other' ? actor(fields.agent).name : null;
  return app ?? agent;
}

/** How long after one instant another came, said short: "5 min", "2h", "3 days". */
export function gapSaid(from: string, to: string): string | null {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return null;
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

/**
 * WHAT A RUN LEFT AND WHAT BECAME OF IT, off its own row: the next step it left, when, and whether another run
 * took it, a person or an agent dropped it, or nobody took it in thirty days. `open` is a step still waiting, which a
 * person may close. `taker` is the words for the run that took it (`runWho`), when the page could read that run.
 * `null` for a run that left no step.
 */
export type StepLeft = { next: string; left: string | null; fate: string | null; open: boolean };

export function stepLeft(fields: Readonly<Record<string, unknown>>, state: unknown, now: number = Date.now(), taker: string | null = null): StepLeft | null {
  const next = typeof fields.next === 'string' ? fields.next.trim() : '';
  if (next === '') return null;
  const at = typeof fields.next_at === 'string' ? fields.next_at : null;
  const closed = typeof fields.closed_at === 'string' ? fields.closed_at : null;
  const left = at === null ? null : stepWords.left(since(at, now));
  const later = at !== null && closed !== null ? gapSaid(at, closed) : null;
  switch (fields.closed_as) {
    case 'taken':
      return { next, left, fate: stepWords.taken(taker ?? stepWords.anotherRun, later), open: false };
    case 'dropped':
      return { next, left, fate: stepWords.dropped(later), open: false };
    case 'expired':
      return { next, left, fate: stepWords.expired, open: false };
    default:
      /* A STEP ON A RUN NOT IN THE HANDOFF STATE was written before steps closed, or by a run still at work: it is said,
         and nothing is claimed about what became of it. */
      return state === 'handoff' ? { next, left, fate: stepWords.waiting, open: true } : { next, left, fate: null, open: false };
  }
}

/** The words of a step a run left. */
export const stepWords = {
  left: (ago: string) => `Left this next step ${ago}`,
  taken: (who: string, later: string | null) => (later === null ? `Taken by ${who}` : `Taken by ${who}, ${later} later`),
  anotherRun: 'another run',
  dropped: (later: string | null) => (later === null ? 'Closed without being taken' : `Closed without being taken, ${later} later`),
  expired: 'Nobody took it in thirty days, so it closed',
  waiting: 'Nobody has taken it yet',
} as const;

/** What a `duration`'s declared unit is worth in the seconds the record stores. */
const SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };

/** Each duration unit in words, one and many. */
const UNIT_WORDS: Record<string, readonly [string, string]> = {
  s: ['second', 'seconds'],
  m: ['minute', 'minutes'],
  h: ['hour', 'hours'],
  d: ['day', 'days'],
  w: ['week', 'weeks'],
};

/**
 * A field's unit after its figure. A PERCENTAGE AND A DEGREE SIT ON THE FIGURE, "60%" and "21°", as every share and every
 * temperature on the screen is written; another unit keeps its space, "3 h".
 */
const unitAfter = (unit: string | null | undefined): string => (unit ? `${unit === '%' || unit === '°' ? '' : ' '}${unit}` : '');

/**
 * `now` IS THE RECORD'S INSTANT, and it defaults to this browser's. A screen reading a real record passes
 * the one `boot` answered with, so an `instant` is banded against the day the record thinks it is. The default was
 * the seed's frozen 3 September 2026, so a live screen that passed nothing banded a record's instants against the
 * sample's day; the sample's readers in `fixtures/readers.ts` pass the sample's clock themselves.
 */
/** The fields that hold a payee's name, a Ledger line's description or the words a rule matches, which a bank sends in
    capitals. Said as words on screen only: the stored text is untouched (B4, the Ledger's own table). */
const BANK_WORDS: ReadonlySet<string> = new Set(['transactions.payee', 'transactions.what', 'filing_rules.match']);

/** A currency code as a person says it, plural, standing alone: `US dollars` for USD, `Euros` for EUR; `null` for a code nobody names. */
function currencyWords(code: string): string | null {
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'name' }).formatToParts(2).find((p) => p.type === 'currency');
    const said = part?.value.trim() ?? '';
    return said === '' || said.toUpperCase() === code ? null : said.charAt(0).toUpperCase() + said.slice(1);
  } catch {
    return null;
  }
}

export function display(
  register: string,
  field: string,
  value: unknown,
  now: number = Date.now(),
  names?: Names,
  typed?: string,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  /* A TOOL'S MACHINES AND KEYS BY THEIR NAMES, and how a key reaches it in words: its page read "kiln-mbp" and
     "header:Authorization=credentials#1" (`tool-facts.ts`). Where a tool or a key came from names its machine too. */
  if (register === 'tools' && Array.isArray(value)) {
    if (field === 'needs') return needsSaid(value, names);
    if (field === 'hosts') return hostsSaid(value);
  }
  if ((register === 'tools' || register === 'credentials') && field === 'origin' && typeof value === 'string') return originSaid(value);
  /* A LIST READS AS ITS ELEMENTS, and never with the tags the record keeps for itself (`tags.ts`). A LIST OF LINKS reads
     as the names of the rows it points at, as one link does, never as their numbers: a person's "Met in" read "3, 5". */
  if (Array.isArray(value)) {
    const f = decl(register, field);
    return listLine(f?.type === 'list' && f.of === 'ref' ? value.map((v) => refName(f, register, v, names)) : value);
  }
  /* AN AGENT BY ITS NAME: the field holds what the agent signs with, `claude`, and a card read "claude" beside "Changed by
     Claude". An agent the product knows is said in its own spelling (`AGENT_NAMES`): Work's With an agent read "Chatgpt"
     (work2 2 Nov, 2). Any other lower-case word is said with its capital, on any list; anything else is left as typed. */
  if (field === 'agent' && typeof value === 'string' && /^[a-z][a-z0-9-]*$/u.test(value))
    return Object.hasOwn(AGENT_NAMES, value) ? AGENT_NAMES[value]! : value.charAt(0).toUpperCase() + value.slice(1);
  /* WHO WAS PAID, AND THE WORDS A FILING RULE MATCHES, IN A BANK'S CAPITALS ARE SAID AS WORDS, as the Ledger says the same
     line (`timelineTitle`, audit 2 B4): Payees' "Usual category" read FENWICK CLOUD under a bar saying Fenwick Cloud, and
     Filing rules titled each card in capitals. "As the bank wrote it" stays as the bank wrote it. */
  if (typeof value === 'string' && BANK_WORDS.has(`${register}.${field}`)) return timelineTitle(value) || value;
  /* A TOOL OR A SKILL IS ITS NAME, not the handle it is filed under: Tools read "nordhaven-dns" (`rowNameSaid`). */
  if (typeof value === 'string' && field === REGISTERS[register]?.title) {
    const named = rowNameSaid(register, value);
    if (named !== value) return named;
  }
  /* A UNIT THAT IS A CURRENCY IS SAID IN WORDS (work2 2 Nov, 4): a key number's page read "Unit USD" over a figure
     already in dollars; it reads "US dollars". A unit that is not a currency code is left as it was typed. */
  if (field === 'unit' && typeof value === 'string' && /^[A-Za-z]{3}$/u.test(value.trim())) {
    const named = currencyWords(value.trim().toUpperCase());
    if (named !== null) return named;
  }
  /* AND THE SKILL A LEARNING BEARS ON IS SAID BY ITS NAME: How the brain changed read "Bears on: axis-qa". */
  if (register === 'learnings' && field === 'topic' && typeof value === 'string' && value.trim() !== '') return handleName(value);
  const f = decl(register, field);
  if (!f) return typed === undefined ? undeclared(value) : answered(typed, value, now, names);
  switch (f.type) {
    case 'money': {
      /* THE VALUE CARRIES ITS OWN CURRENCY. A money field that came back as a bare number is a row
         written before the field was money, or a caller that dropped half the value — either way the
         honest answer is the digits with no code rather than the digits under a guessed one. */
      const c = currencyOf(value);
      const a = amountOf(value);
      if (a === null) return null;
      return c === null ? integer(a) : money(a, c);
    }
    case 'day':
      return dateSaid(String(value), now);
    case 'instant':
      /**
       * `since`, NOT A DAY WITH THE TIME CUT OFF.
       *
       * This was `relative(String(value).slice(0, 10), NOW)` — the truncation every caller in the
       * app had learned to write, because `relative()` takes a day and hands back its argument when
       * given anything else. So the miss was hidden and the time went with it: `session.last_seen`
       * and `updates.at` are instants, and a run seen two hours ago and one seen eleven hours
       * ago both read *today*. One formatter, on the one function every cell goes through.
       */
      return since(String(value), now);
    case 'int':
      /* A WHOLE NUMBER DECLARED TO SIT BETWEEN 1000 AND 9999 IS A YEAR, NOT A COUNT: "2026", never "2,026". */
      if (typeof f.min === 'number' && typeof f.max === 'number' && f.min >= 1000 && f.max <= 9999) return String(Math.trunc(Number(value)));
      /* AND ITS UNIT, AS A DECIMAL'S: Weather's chance of rain is "70%", not "70" under a heading that said the percent. */
      return `${integer(Number(value))}${unitAfter(f.unit)}`;
    case 'duration': {
      /* SECONDS IN, THE DECLARED UNIT OUT. The record holds one unit and the field says how to say
         it, which is the only arrangement in which two durations can be added: `0.2` on its own is
         a number of something, and adding it to `3` needs both to have meant the same thing. */
      const seconds = Number(value);
      if (!Number.isFinite(seconds)) return String(value);
      const unit = f.unit ?? 's';
      const per = SECONDS[unit] ?? 1;
      /* IN WORDS, "3 days" and not "3 d" (pages polish, 2 Nov): a unit's letter is how it is stored, not how anybody
         says it. One is "1 day"; any other figure, a part of one included, takes the plural. A unit this map does not
         know keeps its own spelling. */
      /* AND LESS THAN ONE OF ITS UNIT IN THE NEXT ONE DOWN: "0.2 days" is "4.8 hours", as a person says it. */
      const order = ['w', 'd', 'h', 'm', 's'];
      const down = seconds > 0 && seconds < per && UNIT_WORDS[unit] ? order.slice(order.indexOf(unit) + 1).find((u) => seconds >= SECONDS[u]!) : undefined;
      const shown = down ?? unit;
      const n = seconds / (SECONDS[shown] ?? per);
      const words = UNIT_WORDS[shown];
      const said = words ? (n === 1 ? words[0] : words[1]) : unit;
      return `${n.toLocaleString('en-GB', { maximumFractionDigits: down ? 1 : 3 })} ${said}`;
    }
    case 'decimal': {
      /* ROUNDED, because these get summed. `0.2 + 3 + 0.2` is 3.4000000000000004 in binary
         floating point, and a bar chart totalling three tasks' effort printed exactly that. Money
         never has this problem — it is an integer in minor units — but a decimal is a decimal, so
         the display has to be the thing that decides how many places a person sees.

         Three places is the ceiling and trailing zeros are dropped, so `3.4` stays `3.4` and does
         not become `3.400`. `toLocaleString` also groups the thousands, which a raw template did
         not: `1200 d` was a number nobody reads as one thousand two hundred. */
      const n = Number(value);
      const shown = Number.isFinite(n) ? n.toLocaleString('en-GB', { maximumFractionDigits: 3 }) : String(value);
      return `${shown}${unitAfter(f.unit)}`;
    }
    case 'bool':
      return value ? 'yes' : 'no';
    case 'enum':
      /* THE DECLARED LABEL, where the value has one: `owed_to_me` reads Money in. A value with none reads as words, with
         the short names people write in capitals kept so: a key's `api_token` reads API token, never Api token. A list
         that holds keys cannot declare labels named like a secret (a pack is a file people share), so this is its way. */
      return f.labels?.[String(value)] ?? enumWords(String(value));
    case 'ref': {
      /**
       * A LIVE ROW IS NEVER NAMED FROM THE SAMPLE.
       *
       * `names` holds the record's own title for every row a ref on this screen points at, gathered
       * by the same walk that turned the stored ULID into this number. Where it is given it is the
       * ONLY source: a number the record did not name draws as `<list>#<number>`, which is a row
       * somebody can open, rather than as whatever the built-in sample happens to call that number.
       */
      return refName(f, register, value, names);
    }
    case 'secret':
      return '••••••••';
    default:
      /* A RUN'S PROJECT IS HELD AS A SPOKEN ID, and reads as the project's name. */
      if (register === 'session' && field === 'project') return spokenRow(value, names)?.label ?? String(value);
      /* A PROJECT TYPED AS A SLUG IS NAMED AS THE SIDEBAR NAMES IT (Q31 of 29 October): "mara-site" in the list,
         "Mara site" in the rail. Only the title of a list whose rows carry a mark, so a project or an organisation. */
      if (REGISTERS[register]?.identity && REGISTERS[register]?.title === field) return shownName(String(value));
      return String(value);
  }
}

/** The name of the row one link of `f` points at, by the record's names where a screen has them. */
function refName(f: FieldDecl, register: string, value: unknown, names?: Names): string {
  if (names) {
    /* AND WHAT THIS TAB HAS LEARNT SINCE THE SCREEN READ ITS NAMES: a client made from a person a moment ago. */
    const known = names.get(`${f.to}#${value}`) ?? (f.to ? TITLES.get(f.to)?.get(Number(value)) || undefined : undefined);
    return known ? (f.to && REGISTERS[f.to]?.identity ? shownName(known) : known) : unnamed(f.to ?? register, String(value), f.label);
  }
  /* AND WITHOUT `names`, THE NAMES THIS TAB HAS LEARNT (`held.ts` `TITLES`). This read the sample's rows, so a
     caller that handed none drew the sample's name for whatever number the record's ref held. */
  const said = f.to ? TITLES.get(f.to)?.get(Number(value)) : undefined;
  return said === undefined || said === '' ? unnamed(f.to ?? register, String(value), f.label) : f.to && REGISTERS[f.to]?.identity ? shownName(said) : said;
}

/**
 * The identity of the row a `ref` points at, when its register declares one.
 *
 * One mark and one accent per thing, and colour means WHICH PROJECT, everywhere. The hue is frozen
 * at create and never hand-picked; it reaches the DOM as `oklch(L C h)` with the theme's two mark
 * constants, and it may colour a mark, a chip, an avatar, a calendar dot or a chart series — and
 * NEVER text, an intent, a surface, or any border that carries meaning (13 §2.1b).
 *
 * It is never the only signal either: the name always sits beside it. Past four marks the name is
 * what carries identity anyway, which is why there is no fifth colour to find.
 */
export type Identity = { mark: string; hue: number; name: string; retired: boolean };

/** One row's identity, from its own fields, when its register declares one. The sample's rows and a record's are read alike. */
export function identityOfRow(register: string, fields: Readonly<Record<string, unknown>>): Identity | null {
  const target = REGISTERS[register];
  if (!target?.identity) return null;
  const lane = target.state ? String(fields[target.state] ?? '') : '';
  return {
    mark: String(fields[target.identity.mark] ?? '●'),
    hue: Number(fields[target.identity.accent] ?? 0),
    name: String(fields[target.title] ?? ''),
    // A retired row is achromatic. It still has a mark; it no longer has a claim on a hue.
    retired: lane === 'retired' || lane === 'parked',
  };
}

/**
 * `names` IS WHAT SAYS THE ROW CAME FROM A RECORD, as it is for `display`. Given, it is the only source: a ref the
 * record did not name has no mark, rather than the mark and name the built-in sample gives that number.
 */
export function identityOf(register: string, field: string, value: unknown, names?: Names): Identity | null {
  const f = decl(register, field);
  if (!f || f.type !== 'ref' || !f.to) return null;
  if (!REGISTERS[f.to]?.identity) return null;
  if (names) return names.marks?.get(`${f.to}#${value}`) ?? null;
  const row = (ROWS[f.to] ?? []).find((e) => e.seq === Number(value));
  return row ? identityOfRow(f.to, row.fields) : null;
}

/**
 * THE THING A ROW BELONGS TO, WITHOUT BEING TOLD WHICH FIELD HOLDS IT.
 *
 * `identityOf` answers about a NAMED field, which is what a cell needs: the caller is drawing the
 * `thing` column and wants the mark for the value in it. A row's leading glyph has no field to
 * name. It wants the answer to a different question, "what is this row about", and until now
 * nothing could ask it.
 *
 * The comment two hundred lines above this one says the rule out loud: *"One mark and one accent
 * per thing, and colour means WHICH PROJECT, everywhere."* Everywhere was four places, none of
 * them a row. Four of the seven registers the seed ships declare `thing -> things`, and `things` is
 * the one register with an `identity:`, so those four lists can say which project a row belongs to
 * in one glyph and had been saying it in a text column or not at all.
 *
 * FIRST MATCH IN DECLARED ORDER, and that is the register's choice rather than this function's.
 * A register lists its fields in the order it wants them read, so the first `ref` that reaches a
 * register with an identity is the one it considers the row's subject. `obligations` declares
 * `party -> people` before `thing -> things` and `people` has no identity, so the walk passes over
 * it and lands on the project, which is the right answer for the wrong-looking reason: it is right
 * because `people` declares no mark, not because this function prefers projects.
 *
 * NULL IS THE COMMON ANSWER AND IS NOT A FAILURE. `things` itself has no ref at all, `people` has
 * none, and a pack may ship a register that belongs to nothing. A row with no thing behind it gets
 * no glyph, which is the honest drawing of "this row is not about a project".
 */
export function identityFor(register: string, fields: Readonly<Record<string, unknown>>, names?: Names): Identity | null {
  for (const f of REGISTERS[register]?.fields ?? []) {
    if (f.type !== 'ref' || !f.to) continue;
    const found = identityOf(register, f.id, fields[f.id], names);
    if (found) return found;
  }
  return null;
}

/* ── columns ─────────────────────────────────────────────────────────────
   The default projection: seq, the title field, the `mobile:` fields, state, then indexed fields,
   capped at TEN. At 1440px the return sweep is ~1392px, and beyond ten columns of legible width the
   eye loses the row — which in a money ledger means reading a figure off the wrong line (13 §4.2). */

const WIDTH: Record<string, string> = {
  // The number's width plus the cell's padding: `#99`. The project's mark used to lead this cell and
  // sized it at 11ch; it moved in front of the title, so a list with longer ids widens the column
  // from the rows in hand with `seqWidth`.
  seq: '8ch',
  money: '15ch',
  day: '15ch',
  /* A FOSSIL SIZED FOR A STRING IT NO LONGER PRINTS. `20ch` fits `2026-09-03T11:57:00.000Z`, which
     is what an `instant` cell rendered before `display()` learned to band one; the longest thing it
     can say now is `55 min ago`. Ten characters of empty column, right-aligned, on every register
     that has one. */
  instant: '12ch',
  int: '10ch',
  decimal: '10ch',
  duration: '10ch',
  enum: '13ch',
  bool: '6ch',
  text: 'minmax(14ch, 1fr)',
  document: 'minmax(14ch, 1fr)',
  ref: 'minmax(11ch, 16ch)',
  secret: '14ch',
};

/** Quantities, dates and counts end. Text and refs start. */
const END = new Set(['money', 'day', 'instant', 'int', 'decimal', 'duration']);

/**
 * WHICH COLUMNS A LIST OPENS WITH, and it used to be every indexed field.
 *
 * A FRICTION PASS COUNTED THE COST. `/r/obligations` drew nine columns over thirty-nine rows: 180
 * numbers, 88 controls and 597 words on a screen whose question is "what do I owe and what am I
 * owed". Every one of those columns is a defensible column, and the eight of them together are the
 * reason the screen reads as a database rather than as an answer. It is seventh of the ten things
 * the pass found costing a person the most, and the only one on that list that is a decision about
 * DEFAULTS rather than a thing to build.
 *
 * `index: true` MEANS FAST TO FILTER, NOT WORTH READING. That is the mistake this made: it is a
 * storage decision, taken by whoever wrote the declaration for reasons about SQL, and it was being
 * read as an editorial one. `services` indexes its provider, its type, its renewal, its cycle and
 * its state, because a page filters on all five, and none of that is an argument for five columns.
 *
 * WHAT A REGISTER ALREADY SAYS IT IS ABOUT. `mobile` is the three fields the declaration nominates
 * for a card where there is room for three, which is exactly the editorial judgement wanted here;
 * `title` is what the row IS; `state` is the one field a reader scans a list to compare; and a
 * `deadline` field is the one the tone of the whole row is computed from, so leaving it off would
 * draw a red row with nothing on it explaining why. Obligations opens at five columns instead of
 * nine and answers the same question.
 *
 * NOTHING IS LOST AND THE WAY BACK ALREADY EXISTED. The display sheet on every list offers every
 * readable field and remembers what a reader turns on, per register, in `pref.columns`. This
 * changes which side of that switch a column starts on, and the switch has been there since the
 * screen was written.
 */
/** The `#` column's width for the rows in hand: the digits of the highest id, the `#` and the cell's padding, never under 8ch. */
export function seqWidth(entries: readonly { seq: number }[]): string {
  let top = 0;
  for (const e of entries) if (e.seq > top) top = e.seq;
  return `${Math.max(8, String(top).length + 6)}ch`;
}

/**
 * THE ROW'S NUMBER, AS A COLUMN SOMEBODY ASKS FOR AND NO LIST DRAWS BY DEFAULT. Every list opened on a
 * "#" column, so every line began with an identifier a person had not asked about and the title they came for sat
 * second. The number still belongs to the row, and Display offers it under the name a person uses for it.
 */
export const numberColumn = (): Column => ({ field: 'seq', label: nameWords.number, width: WIDTH.seq!, align: 'end', truncate: 'middle' });

/**
 * HOW MANY FIELDS A LIST OPENS ON AT MOST. It was ten columns with the number counted among them; the number left the
 * default and the fields kept their nine, so no list grew a column when it went.
 */
const FIELD_COLUMNS = 9;

/**
 * THE COLUMNS A LIST DECLARES ITS TABLE OPENS ON (`table:`, `42 §4.4`), in its order, or none where it declares none.
 *
 * WHAT THE LIST SAYS WINS OVER WHAT THIS WORKS OUT. The Ledger's title is its description, which an import fills with
 * the category's name, so the worked-out columns read the category twice and never said who the money went to. A
 * column over a field this reader is not shown, or the list no longer holds, is left out, and so is an `or` over one.
 * The first text column leads, taking the share of the row the title takes where the columns are worked out.
 */
export function tableOf(r: RegisterDecl): (Column & { or?: string | readonly string[] })[] {
  if (!Array.isArray(r.table)) return [];
  const live = (id: unknown) => (typeof id === 'string' ? r.fields.find((f) => f.id === id && f.retired !== true) : undefined);
  const cols: (Column & { or?: string | readonly string[] })[] = [];
  let led = false;
  for (const said of r.table) {
    const column = typeof said === 'string' ? { field: said } : said;
    const f = live(column?.field);
    if (!f || cols.length >= FIELD_COLUMNS || cols.some((c) => c.field === f.id)) continue;
    const ors = (Array.isArray(column.or) ? column.or : column.or === undefined ? [] : [column.or]).flatMap((o: string) => {
      const x = live(o);
      return x && x.id !== f.id ? [x.id] : [];
    });
    const lead = !led && (f.type === 'text' || f.id === r.title);
    if (lead) led = true;
    /* THE FIRST LINK KEEPS A NAME LIKE "Studio current account" WHOLE (leftovers8): at 1280 the Ledger cut it at a link's
       16ch. A table is as wide as its columns' widest (`.table` is `max-content` in `blocks.css`), so what the first link
       gains the lead gives: 18ch for it and 22ch, not 24ch, for the lead's floor, and the row is as wide as it was, so
       Amount stays inside the tile. A later link keeps its 16ch. */
    const linked = f.type === 'ref' && !cols.some((c) => r.fields.find((x) => x.id === c.field)?.type === 'ref') ? 'minmax(11ch, 18ch)' : null;
    cols.push({
      field: f.id,
      label: typeof column.label === 'string' && column.label.trim() !== '' ? column.label : labelOf(f),
      /* A DAY THAT OPENS THE ROW STARTS AT THE ROW'S EDGE, as the words do, and is as wide as "30 Aug 2025": ended in its
         15ch it hung in a gutter of its own. */
      width: lead ? 'minmax(22ch, 3fr)' : cols.length === 0 && f.type === 'day' ? '12ch' : (linked ?? WIDTH[f.type] ?? WIDTH.text!),
      align: END.has(f.type) && !(cols.length === 0 && f.type === 'day') ? 'end' : 'start',
      truncate: f.type === 'money' ? 'never' : 'end',
      ...(ors.length === 0 ? {} : { or: ors.length === 1 ? ors[0]! : ors }),
    });
  }
  return shrunkFirst(cols, r);
}

/** How wide the lead is let grow before a column that gives way first loses any room: "Grangemoor Events, Stand Deposit". */
const LEAD_ROOM = '28ch';
/** The least a column that gives way first keeps: a word and its cut. */
const GIVES_FLOOR = '8ch';

/**
 * A DECLARED TABLE GIVES UP ROOM IN AN ORDER (widgets-empty, 2 Nov): a link after the first (the Ledger's Category) and
 * a text column after the lead are cut first, then the lead, so at 1280 the Ledger keeps Payee and Account whole and
 * Category is the one that is cut. A table is as wide as its columns (`.table` is `max-content`), so no column shrank
 * and a row too wide scrolled. Such a column now `gives` (`render/src/table.ts` `tracksOf`): it takes what the row
 * leaves it once every other column has its most and the lead its `LEAD_ROOM`, at most its own most (16ch for a link)
 * and at least 8ch. Two that give way share what is left.
 */
function shrunkFirst<C extends Column>(cols: C[], r: RegisterDecl): C[] {
  const type = (c: Column) => r.fields.find((f) => f.id === c.field)?.type;
  const firstLink = cols.findIndex((c) => type(c) === 'ref');
  const lead = cols.findIndex((c) => c.width.startsWith('minmax(22ch'));
  if (lead < 0) return cols;
  const most = (c: Column): string => /(\d+(?:\.\d+)?ch)\s*\)$/u.exec(c.width)?.[1] ?? '16ch';
  const gives = (c: Column, n: number): boolean => n !== lead && ((type(c) === 'ref' && n !== firstLink) || (type(c) === 'text' && n > lead));
  if (!cols.some(gives)) return cols;
  return cols.map((c, n) => (n === lead ? { ...c, room: LEAD_ROOM } : gives(c, n) ? { ...c, gives: { least: GIVES_FLOOR, most: most(c) } } : c));
}

/**
 * The columns a list opens on, and with `number` set, the row's number after them, which is how Display offers it.
 */
export function columnsFor(register: string, declared?: RegisterDecl, number = false): Column[] {
  /* THE BUILT-IN DECLARATION FIRST, then the one the record sent: a list a pack brought, or one somebody made, is not in
     `REGISTERS`, and without its own declaration here it drew rows with no cells in them. */
  const r = REGISTERS[register] ?? declared;
  if (!r) return [];
  const table = tableOf(r);
  if (table.length > 0) return number ? [...table, numberColumn()] : table;
  const wanted = new Set<string>([r.title, ...r.mobile, ...(r.state ? [r.state] : [])]);
  for (const f of r.fields) if (f.deadline) wanted.add(f.id);
  /**
   * AND A FIELD THAT MAKES A COLUMN BESIDE IT READABLE, which is the case the first cut of this
   * dropped and the declaration had already written down.
   *
   * `services` puts `cost` on its card and its `cycle` is what makes the number mean anything:
   * the seed says so where the field is declared, in as many words, *"a column of amounts on
   * unstated periods cannot be read: `GBP 340.00` beside `GBP 5.00` is not a comparison until one
   * says yearly and the other monthly"*. Narrowing the default set to the fields a card nominates
   * took the period off and left the amounts, which is the exact thing that comment predicts.
   *
   * `qualifies:` IS THE DECLARATION SAYING SO, rather than this function knowing that a register
   * called services has a field called cycle. A field that makes another one readable is a fact
   * about the pair, and the pair travels together or neither is worth drawing. It costs one key on
   * one field and it is the register's to set, which is where every other decision about what a
   * list shows already lives.
   */
  for (const f of r.fields) if (f.qualifies !== undefined && wanted.has(f.qualifies)) wanted.add(f.id);
  /**
   * AND THE THING THE ROW BELONGS TO, AS A COLUMN OF ITS OWN. It was a shape in front of every title, a
   * diamond, a triangle or a dot, which said "some project" to nobody who had not learnt the shapes. Its column says
   * the project's name beside a small dot of its colour, where it can be read, sorted and hidden like any other. The
   * field is the one `identityFor` walks to: the first link to a list that declares an identity.
   */
  const subject = r.fields.find((f) => f.type === 'ref' && f.to !== undefined && REGISTERS[f.to]?.identity !== undefined);
  if (subject) wanted.add(subject.id);

  const cols: Column[] = [];
  for (const f of r.fields) {
    if (!wanted.has(f.id) || cols.length >= FIELD_COLUMNS) continue;
    cols.push({
      field: f.id,
      label: labelOf(f),
      // THE TITLE COLUMN IS NOT JUST ANOTHER TEXT COLUMN. Sharing the free space equally between
      // every flexible column let a fixed 13ch enum sit at its full width beside a title being
      // truncated mid-word — and the title is the only cell in the row a person actually reads to
      // find what they came for. It takes the lion's share of whatever is left over.
      width: f.id === r.title ? 'minmax(24ch, 3fr)' : (WIDTH[f.type] ?? WIDTH.text!),
      align: END.has(f.type) ? 'end' : 'start',
      // A figure never truncates: a truncated figure is not shortened, it is wrong.
      truncate: f.type === 'money' ? 'never' : 'end',
    });
  }
  /* THE NUMBER GOES LAST, where the list screen and a saved view already move it: a list keeps what you look up at the
     end of the row and what you read at its start. */
  if (number) cols.push(numberColumn());
  return cols;
}

/** A row's tone comes from the data, never from a call site: overdue is `bad`, due soon is `warn`. */
/**
 * What a row's state and its deadline say about it: `good`, `bad`, or nothing.
 *
 * EXPORTED BECAUSE THE CARD NEEDS IT TOO. The grid has drawn this as a bar down the leading edge
 * since it was written, and below 640px the grid does not exist — so on a phone an overdue invoice
 * and a paid one were the same card, on the surface where somebody is most likely to be looking for
 * exactly that difference.
 */
export function toneOf(register: string, e: Entry, now: number = Date.now()): TableRow['tone'] {
  const r = REGISTERS[register];
  if (!r) return undefined;
  const state = r.state ? String(e.fields[r.state] ?? '') : '';
  /* A DONE STATE IS GOOD NEWS ONLY WHERE A ROW HAD TO GET THERE. Every done row was `good`, so a ledger, whose
     ordinary row is `cleared`, drew a green dot on every line and the dot said nothing. A list whose state field
     declares a done state as its `default` writes its rows already done: done there means recorded, not finished, and
     it carries no tone. Read from the declaration, never from the list's name. */
  if (r.done?.includes(state)) {
    const born = r.fields.find((f) => f.id === r.state)?.default;
    return typeof born === 'string' && r.done.includes(born) ? undefined : 'good';
  }
  /* DECLARED, not guessed. This was "the first indexed `day` field", which for `tracks` is `opened`
     — always in the past — so every open track came out `bad`. */
  const dated = r.fields.find((f) => f.type === 'day' && f.deadline);
  if (!dated) return undefined;
  const value = e.fields[dated.id];
  if (typeof value !== 'string') return undefined;
  const days = (Date.parse(`${value}T12:00:00Z`) - now) / 86_400_000;
  if (days < 0) return 'bad';
  if (days < 14) return 'warn';
  return undefined;
}

/** A cell typed as a run, as a link to the run's page: the words `display` said, never the handle. */
const runLink = (said: string | null, value: unknown): string | null => {
  const seq = typeof value === 'string' ? /^S([1-9][0-9]*)$/u.exec(value)?.[1] : undefined;
  return said === null || seq === undefined || /[[\]]/u.test(said) ? said : `[${said}](/r/session/${seq})`;
};

/** The fields a column reads in turn where its own holds nothing: none, one, or a list's `table:` several. */
export const orsOf = (c: { or?: string | readonly string[] | undefined }): readonly string[] => (c.or === undefined ? [] : typeof c.or === 'string' ? [c.or] : c.or);

/**
 * `types` IS WHAT THE BLOCK ANSWERED for columns no list declares (a computed source's, `BlockResult.types`), which
 * `display` falls back to. A column typed as a run links to the run.
 *
 * A COLUMN'S `or` IS THE FIELD READ WHEN ITS OWN HOLDS NOTHING, and it is read as itself: its own type, its own casing.
 * A ledger's "paid to" was an empty cell on every line a bank named nobody on, beside a description that said what it was.
 */
export function toRows(
  register: string,
  entries: Entry[],
  columns: readonly (Column & { or?: string | readonly string[] | undefined })[],
  now: number = Date.now(),
  names?: Names,
  types?: Readonly<Record<string, string>>,
): TableRow[] {
  /* AN ENUM IN SENTENCE CASE, as the register's own grid draws it. The list says "Owed by me" through
     a first-letter rule on its own markup; a page block or a backlink table drawing the same row said
     "owed by me", so one row read two ways a click apart. */
  const read = columns.flatMap((c) => [c.field, ...orsOf(c)]);
  const enums = new Set(read.filter((field) => decl(register, field)?.type === 'enum'));
  const cased = (field: string, text: string | null): string | null => (enums.has(field) && text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
  /* A LINE SPLIT INTO PARTS IS STILL ONE ROW, and a column its parts are cut by says so in place of the line's own value:
     "Split · 3 categories", its mark the largest part's (`split.ts`). */
  const split = splitAtOf(REGISTERS[register]);
  return entries.map((e) => {
    const parted = (field: string) => (split ? partsOf(e.fields, split, field) : []);
    const cell = (field: string): string | null => {
      const typed = types?.[field];
      const said = cased(field, display(register, field, e.fields[field], now, names, typed));
      return typed === 'run' && !decl(register, field) ? runLink(said, e.fields[field]) : said;
    };
    return {
      key: `${register}#${e.seq}`,
      href: `/r/${register}/${e.seq}`,
      tone: toneOf(register, e, now),
      cells: columns.map((c) => {
        if (c.field === 'seq') return `#${e.seq}`;
        /* A CHIP COLUMN IS THE ROW'S CATEGORY MARK in words, its icon and colour, read from the row the link points at. */
        if (c.as === 'chip') {
          const to = decl(register, c.field)?.to;
          const parts = parted(c.field);
          const at = parts.length > 0 ? largestPart(parts)?.by : e.fields[c.field];
          /* A MOVE BETWEEN YOUR OWN ACCOUNTS IS NEVER "NOT FILED" (audit of 31 October, 25): it has no category because it
             is no spending, as `UNFILED` leaves it out of the lines to file, so it wears the move's own mark. */
          if ((at === undefined || at === null || at === '') && e.fields.transfer === true) return TIMELINE_BETWEEN;
          /* A LINE NOTHING HAS FILED YET WEARS A QUESTION MARK. */
          if (at === undefined || at === null || at === '') return '?';
          return to !== undefined ? (names?.chips?.get(`${to}#${at}`) ?? null) : null;
        }
        const parts = decl(register, c.field)?.type === 'ref' ? parted(c.field) : [];
        if (parts.length > 0) return splitSaid(parts);
        /* A CARD'S DEADLINE PAST ITS DAY SAYS HOW LATE, as the list does: "38 days late · 27 Jul", never a red dot alone. */
        const v = e.fields[c.field];
        if (c.as === 'when' && decl(register, c.field)?.deadline && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v) && toneOf(register, e, now) === 'bad') {
          /* FROM THE RECORD'S DAY (AH22), as the list counts late. */
          const days = Math.round((Date.parse(`${recordToday(now)}T00:00:00Z`) - Date.parse(`${v}T00:00:00Z`)) / 86_400_000);
          if (days > 0) return `${days === 1 ? '1 day' : `${days} days`} late · ${cell(c.field) ?? v}`;
        }
        /* A LIST'S `table:` MAY NAME SEVERAL IN TURN: the first that says something is drawn. */
        let said = cell(c.field);
        for (const or of orsOf(c)) if (said === null) said = cell(or);
        return said;
      }),
    };
  });
}

/**
 * What the capture line can answer on the reader's behalf, from the filter they are looking at.
 *
 * ASKING AGAIN FOR WHAT IS ALREADY ON SCREEN is asking a person to repeat themselves to a machine
 * that heard them. Looking at `?f=state:is:open` means the answer to "what state" is in the address,
 * and a one-line add that then demanded it would be a modal with fewer fields.
 *
 * IT IS DELIBERATELY NARROW, and each exclusion is a way of writing a wrong value in silence:
 *
 *   `is` AND NOTHING ELSE. `in` and `before` name a SET. Picking a member of a set for somebody is
 *   guessing at the one moment they have not said which, and the guess would be stored as if they
 *   had.
 *
 *   THE TITLE IS NEVER INHERITED, because the title is what the reader is typing.
 *
 *   ENUM AND TEXT ONLY. The URL carries the READABLE form of a value and the record stores the
 *   declared one: `direction is owed to me` on screen is `owed_to_me` underneath, which is exactly
 *   what `declaredValue` exists to reconcile. It reconciles the two spellings of a DECLARED value
 *   and passes anything else through unchanged, so a money, a day or a reference would arrive here
 *   as the reader's prose and be written as the field's value. A `day` is worse than merely wrong:
 *   `due is today` is a moving value frozen at the instant somebody typed a row.
 *
 *   AN ENUM VALUE THE FIELD DOES NOT DECLARE IS DROPPED. `declaredValue` returns its input when
 *   nothing matches, which is right for a filter (the answer is no rows) and wrong for a write (the
 *   answer would be a row nobody can read).
 */
export function inheritedFrom(register: string, filters: readonly Filter[]): Fields {
  const decl = REGISTERS[register];
  if (!decl) return {};
  const out: Fields = {};
  for (const f of filters) {
    if (f.op !== 'is' || f.values.length !== 1) continue;
    const field = decl.fields.find((x) => x.id === f.field);
    if (!field || field.id === decl.title) continue;
    if (field.type !== 'enum' && field.type !== 'text') continue;
    /* AND AN ENUM'S LABEL IS ITS VALUE, as the record's parse reads it. `declaredValue` used to match the value's
       own words and not the register's label for it, so `state is Later` came back as `Later`, which tasks do not
       declare, and was dropped here while the kernel filled the same line as `backlog`. `capture-block.test.ts`
       found it on its first run: one `where:`, a task kept for later on a record and an ordinary one on the demo.
       THE REPAIR WAS A SECOND MATCHER, HERE, and it folded case where the kernel's `resolve` also collapses every run
       of spaces and underscores, so `state is to_check` filled `review` on a record and nothing on the demo.
       `declaredValue` reads labels with the kernel's own fold now, and this reads `declaredValue`, so there is one
       matcher. `labels-parity.test.ts` holds it against the kernel. */
    const said = declaredValue(register, f.field, f.values[0]!);
    if (field.type === 'enum' && !field.values?.includes(said)) continue;
    out[f.field] = said;
  }
  return out;
}

/**
 * The required fields that line cannot answer, so it can say so rather than writing a short row.
 *
 * A CAPTURE LINE THAT SILENTLY DROPPED A REQUIRED FIELD would be the shape this repository keeps
 * finding: a control that reports success and leaves the record in a state the declaration refuses.
 */
export function unansweredBy(register: string, held: Fields): { id: string; label: string }[] {
  const decl = REGISTERS[register];
  if (!decl) return [];
  return decl.fields
    .filter((f) => f.required && f.id !== decl.title && !(f.id in held))
    .map((f) => ({ id: f.id, label: labelOf(f) }));
}

/* ── filters and order ────────────────────────────────────────────────────── */

/* `Filter` LIVES IN `schema.ts` NOW, and is re-exported here so every existing caller is unchanged.
   It is a SHAPE rather than a reader, so it sits beside the declarations it filters. */
export type { Filter };

/**
 * The `f=` chips of an address, as the filters every reader of this app takes.
 *
 * IT WAS FOUR LINES INSIDE THE REGISTER ROUTE and a copy of those four lines in five tests
 * (`api.test.ts` twice, `metrics.test.ts`, `pages.test.ts`, `where.test.ts`), which is the shape
 * that lets a parser be wrong in the route and right in every test of it. The route imports this
 * now, so what a test drives is what the page reads.
 *
 * THE CHIP IS THREE PIECES AT THE FIRST TWO COLONS, AND THE REST OF THE STRING IS THE VALUE. It
 * used to be `raw.split(':')` taking the third piece, and a list element is not a word:
 * `people.handles` holds `git:jokonkwo` and `tools.needs` holds
 * `header:Authorization=credentials#1`, so every value of two of the mirror's eleven list fields
 * carries a colon. `handles:has:git:jokonkwo` parsed as the value `git`, which nobody holds, and the
 * grid came back empty — the one answer indistinguishable from a filter that worked. `registerHref`
 * does encode the value, and `URLSearchParams` hands the colon straight back, so the encoding never
 * reached the split.
 *
 * A COMMA STILL SEPARATES VALUES and that is not the same hole. `compile` splits the `where`
 * sentence on the comma too and says so in place, so a value carrying one cannot be written in
 * either language: a known limitation rather than a silent one, and `list-chips.test.ts` drives the
 * refusal both engines answer with.
 */
export const chipsOf = (params: URLSearchParams): Filter[] =>
  params.getAll('f').map((raw) => {
    const at = raw.indexOf(':');
    if (at === -1) return { field: raw, op: 'is', values: [''] };
    const then = raw.indexOf(':', at + 1);
    /* `payee:empty` AND `payee:set`, THE TWO-PIECE SPELLING A PAGE'S LINK WROTE (Payees' "Name them", Budgets' "File
       them"), read as the `is empty` and `is set` the three-piece chip says, since the word is the value and never an
       operator: it drew "payee is: is what?" where it meant the lines that name nobody (audit 31 Oct A36). */
    if (then === -1 && /^(empty|set)$/u.test(raw.slice(at + 1))) return { field: raw.slice(0, at), op: 'is', values: [raw.slice(at + 1)] };
    return {
      field: raw.slice(0, at),
      op: then === -1 ? raw.slice(at + 1) : raw.slice(at + 1, then),
      values: (then === -1 ? '' : raw.slice(then + 1)).split(','),
    };
  });

/**
 * The address word that joins the chips with "or", read one way wherever an address is read.
 *
 * ANY OTHER SPELLING IS THE PLAIN "and" EVERY ADDRESS WRITTEN BEFORE IT MEANT, so `join=all`, a
 * typo, or no word at all open the list they always opened rather than a refusal on a link that
 * worked yesterday. `whereOf` below and `treeOf` in `remote.ts` take what this answers.
 */
export const joinOf = (params: URLSearchParams): Join => (params.get('join') === 'any' ? 'any' : undefined);
/** What `joinOf` reads: "or", or nothing, which is the plain "and". */
export type Join = 'any' | undefined;

/**
 * The address word that narrows a list of people to the ones who may be held twice: `twice=1`.
 *
 * THE FIGURE SAID HOW MANY AND ITS LINK OPENED EVERYONE, sorted by name, to be looked through by eye. The record names
 * them (`heldTwice`), so the address carries this one word and the list asks who they are. It is a word of its own and
 * not an `f=` chip because it names no field: who is held twice is the record's answer, not a value a person holds.
 *
 * ANY OTHER SPELLING IS NO WORD AT ALL, as `joinOf` reads its own, so an address written before this opens what it
 * always opened.
 */
export const TWICE = 'twice';
export const twiceOf = (params: URLSearchParams): boolean => params.get(TWICE) === '1';

/**
 * Whether the word narrows THIS list: only the one that keeps the people a record meets, said by the role it declares
 * (`meets:`) and never by a name written here. On any other list, and on one whose declaration has not arrived, the
 * word is ignored.
 *
 * AND THE LIST THE RECORD READ BY NAME BEFORE THE ROLE, as the kernel still reads it while no list declares one
 * (`LEGACY` and `roleOf` in `packages/kernel/src/roles.ts`; `PEOPLE` is that name, the kernel's own). On a record whose
 * add-on is older than the key the figure counted, its note linked here, and the list opened everyone: the record
 * answered who they are and this never asked. One declaration cannot say whether ANOTHER list has taken the role since,
 * and it need not: the record answers nobody for a list that is not where it keeps people (`heldTwice`), so the worst
 * this can do is say nobody is held twice, never show everyone as if they were.
 *
 * AND ANY LIST THAT SAYS WHAT MAKES TWO OF ITS ROWS THE SAME (`same:`), skills, tools, keys or learnings, whose rows the
 * record names in the same answer. Its words are its own (`twice-fold.ts` beside the list route), never these people's.
 */
export const heldTwiceOn = (params: URLSearchParams, decl: RegisterDecl | undefined): boolean =>
  twiceOf(params) && decl !== undefined && ((decl as { meets?: unknown }).meets !== undefined || decl.id === PEOPLE || decl.same != null);

/**
 * The numbers the record answered, as a filter the list is asked with. It rides beside the chips and is never one: no
 * address spells it and the bar draws none for it. `whereFor` and `treeOf` in `remote.ts` read it as a tree over the
 * number every entry carries, since a sentence has no word for a set of numbers this long.
 */
const NUMBER = 'seq';
export const rowsFilter = (seqs: readonly number[]): Filter => ({ field: NUMBER, op: 'in', values: seqs.map(String) });
export const isRows = (f: Filter): boolean => f.field === NUMBER && f.op === 'in';

/** What the list says while the word is on: what is shown, the way back to everyone, and that nobody is held twice. */
export const twiceWords = {
  showing: 'Showing the people who may be listed twice',
  clear: 'Show everyone',
  none: 'Nobody is listed twice.',
  /** Why nothing is saved while the word narrows the list: a view has no place for it. It names `clear`. */
  unsaved: 'A view cannot keep the people who may be listed twice. Choose Show everyone first.',
} as const;

/**
 * The URL's filter chips, as a `where` sentence.
 *
 * There were two filter languages in this product and they disagreed. `where.ts` resolves dates,
 * checks enum values and matches on what the screen shows; `applyFilters` did four raw string
 * comparisons, so `due before today` asked whether `'2026-10-01' < 'today'` — true for every row,
 * because `'2'` sorts before `'t'` — and `due before +30d` was false for every row for the same
 * reason in the other direction.
 *
 * The consequence was three money tiles linking to a list that contradicted them: Overdue said two
 * rows and opened eighteen; "Due in 30 days" and "Renews in 30 days" both opened nothing at all.
 * A figure you cannot click through to is a figure you cannot check.
 *
 * A chip is a control and a sentence is a declaration, so both spellings stay — but there is one
 * evaluator underneath, and it is the one with the tests.
 *
 * `join` IS THE ADDRESS WORD `join=any`, AND UNDER IT THE CHIPS ARE JOINED WITH `, or`. One word is
 * the whole of it because both engines refuse a sentence mixing `,` and `, or`,
 * so a set of chips is all "and" or all "or". `applyFilters` and `list` below pass it on the
 * sample, and on a record the register list sends this very sentence (`whereFor` in `remote.ts`),
 * which the record parses; `treeOf` reads the same word into an `any` group only when the search box
 * holds words. `remote-compare.test.ts` holds the two to
 * the same rows. The address is read by `joinOf` above, the register route reads it into the question
 * it asks, and `registerHref` mints it for a tile or a block whose filter says "or".
 */
export const whereOf = (filters: Filter[], join?: 'any'): string =>
  filters
    .map((f) => {
      /**
       * THE SIX COMPARE WORDS, SPELLED IN THE CHIP BY THE OPERATOR `compile` GIVES THEM, as `not-on`
       * is. They fell to the last line here, so `amount:gte:GBP 2400` came back as
       * `amount is GBP 2400`, which drew none of the 25 obligations `amount at least GBP 2400`
       * admits, and `what:contains:rent` as `what is rent`, which drew none of three.
       *
       * `between` TAKES ITS TWO ENDS AS TWO VALUES, which is what the chip's comma already means, and
       * one value writes `between 10` for the compiler to refuse by name rather than a range with no
       * top. A range of days never arrives here: `compile` makes it `gte` and `lte`, two chips.
       */
      if (f.op === 'gt' || f.op === 'gte' || f.op === 'lt' || f.op === 'lte') {
        const word = { gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most' }[f.op];
        return `${f.field} ${word} ${f.values[0] ?? ''}`;
      }
      if (f.op === 'between') return `${f.field} between ${f.values.join(' and ')}`;
      if (f.op === 'contains') return `${f.field} contains ${f.values[0] ?? ''}`;
      if (f.op === 'in') return `${f.field} is ${f.values.join(' or ')}`;
      /* `not-in`, so a URL can say everything the SENTENCE can. Without it a declared metric whose
         predicate negates, `state is not cancelled`, had no link that opened its own rows, and the
         alternative was writing out the enum's complement, which breaks the moment a pack adds a
         value to it. */
      if (f.op === 'not-in') return `${f.field} is not ${f.values.join(' or ')}`;
      if (f.op === 'before' || f.op === 'after') return `${f.field} ${f.op} ${f.values[0] ?? ''}`;
      /**
       * `not-on`, THE NEGATION OF A DATE CLAUSE, WHICH CAME BACK AS ITS OWN COMPLEMENT.
       *
       * `registerHref` minted `f=due:not on:today` for `due is not today`, the compiled operator
       * written into the chip verbatim, and the chip fell past every arm here to `<field> is <value>`
       * and came back `due is today`. Measured on the shipped mirror: the sentence admits all 40
       * obligations and the chip drew 0 of them, because nothing there is due today. A filter that
       * quietly inverts is the one failure that module exists to prevent.
       *
       * THE CHIP SPELLS IT WITH A HYPHEN for the reason `not-in` does: a raw space in a URL is not a
       * chip anybody reads back, and `pages.test.ts` asserts no declared block's link carries one.
       *
       * `on` NEEDS NO ARM AND DELIBERATELY HAS NONE, because `<field> is <a day>` on a dated field IS
       * the `on` clause: `due:on:today` falls to the last line as `due is today` and compiles to the
       * clause it was minted from, which is the fold the record's own `ORDERED` table makes when it
       * reads the word. A second arm would be one more spelling of one clause to keep in step.
       */
      if (f.op === 'not-on') return `${f.field} is not ${f.values[0] ?? ''}`;
      /**
       * `has` AND `lacks`, THE TWO OPERATORS ONLY A LIST TAKES, and until they were written here
       * nothing outside `where.ts` could spell either one.
       *
       * They fell to the line below and came back as `repos is portage`, which both engines now
       * refuse: *"repos is a list, which cannot be asked \"is\""*. So the one shape a list filter
       * could arrive in, a chip, from a link, from a metric or a saved view, was the one shape that
       * could not be read, and `registerHref` answered the whole register for any predicate carrying
       * a list clause because of it. It mints the narrow address now, and this line is the reader
       * that made that possible.
       *
       * ONE VALUE, WHICH IS THE GRAMMAR'S RULE AND NOT A NARROWING CHOSEN HERE. `where.ts` types the
       * clause `values: [string]` because the operator looks for a single element inside a list, and
       * `tags has urgent or soon` would otherwise look for a tag literally called `urgent or soon`.
       * Joining the rest on ` or ` would have written a sentence the compiler refuses by name, so
       * the first value is the value.
       */
      if (f.op === 'has' || f.op === 'lacks') return `${f.field} ${f.op} ${f.values[0] ?? ''}`;
      return `${f.field} is ${f.values[0] ?? ''}`;
    })
    .join(join === 'any' ? ', or ' : ', ');

/** `names` is a live record's, as `display` takes it: a ref column on a record sorts by the record's names. */
export function sortRows(register: string, entries: Entry[], field: string, dir: 'asc' | 'desc', names?: Names): Entry[] {
  const sign = dir === 'asc' ? 1 : -1;
  /* TWO ROWS WITH ONE VALUE GO NEWEST FIRST, in either direction, because that is the record's own tie-break: its sorted
     list orders by the field and then `id DESC`, and an id is minted in the order rows are made, as a number is. Oldest
     first here put two tasks due on one day in one order on the sample and the other on a real record. */
  const tie = (a: Entry, b: Entry): number => b.seq - a.seq;
  return [...entries].sort((a, b) => compareRows(register, a, b, field, sign, names) || tie(a, b));
}

/**
 * TEXT IN THE RECORD'S ORDER, which is one rule in both engines: without regard to case (ASCII letters folded, as SQLite's
 * `NOCASE` folds them), then by the stored text to break a tie. `localeCompare` here and byte order in the kernel put a
 * mixed-case column in two orders, and a page that is whole is sorted here while a longer one is sorted there.
 */
const foldCase = (s: string): string => s.replace(/[A-Z]/gu, (c) => c.toLowerCase());
const textOrder = (x: string, y: string): number => {
  const fx = foldCase(x);
  const fy = foldCase(y);
  if (fx !== fy) return fx < fy ? -1 : 1;
  return x === y ? 0 : x < y ? -1 : 1;
};

function compareRows(register: string, a: Entry, b: Entry, field: string, sign: number, names?: Names): number {
  if (field === 'seq') return (a.seq - b.seq) * sign;
  const x = a.fields[field];
  const y = b.fields[field];
  if (x === y) return 0;
  if (x === null || x === undefined) return 1;
  if (y === null || y === undefined) return -1;

  /**
   * A REF SORTS BY THE NAME ON SCREEN, not by the row number behind it.
   *
   * A `ref` is stored as a seq — a number — so it missed the string branch below and fell into
   * `amountOf`, which coerces any scalar, and the column was ordered by the hidden id while the
   * cell rendered the title of the row it points at. `/r/obligations?sort=party:asc` gave Halden
   * ×9, Ravensworth ×8, J. Okonkwo ×4, Pell & Vine ×5 — the `people` register's own seq order, in
   * no visible order at all, under a `columnheader` announcing `aria-sort="ascending"`.
   *
   * The Project column has the same shape and was saved by luck: Kiln, Marlow & Co, Portage and
   * Tallow happen to be alphabetical in seq order, so renaming one project would have silently
   * stopped that column sorting too.
   *
   * `display()` IS WHAT THE CELL SHOWS, so it is what the sort has to read. Same locale collation
   * as any other text, for the same reason.
   *
   * NO CLOCK IS PASSED, because a ref reads as a name and a name is the same at any hour. This passed the sample's
   * frozen `NOW`, which was the only reason the sort of a live list imported the sample's clock at all.
   */
  const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
  /* AND A LIST OF LINKS BY THE NAMES IT SHOWS, for the same reason: its cell is the names, never the numbers. */
  if (decl?.type === 'ref' || (decl?.type === 'list' && decl.of === 'ref')) {
    const sx = display(register, field, x, undefined, names) ?? '';
    const sy = display(register, field, y, undefined, names) ?? '';
    return textOrder(sx, sy) * sign;
  }

  /**
   * AN ENUM SORTS BY ITS POSITION IN `values`, as the record's `list` does, and it sorted by the label where it had one
   * and the stored word where it did not. `tasks.priority` read High, Low, Normal, Urgent ascending, and the sample's
   * tasks by state put Later (`backlog`) after Dropped. Declared order is the owner's call, taken as the default and
   * reversible here and in the kernel's `list`. A word outside `values` goes after every declared one, and an empty value has gone last above.
   */
  const declared = decl?.type === 'enum' ? decl.values : undefined;
  if (declared?.length) {
    const at = (v: unknown): number => {
      const i = declared.indexOf(String(v));
      return i < 0 ? declared.length : i;
    };
    return (at(x) - at(y)) * sign;
  }

  /* TEXT SORTS WITHOUT CASE, everything else compares. `<` on strings alone put every capital above every lowercase,
     "Zebra" before "apple". It is the record's rule (`textOrder`), not the reader's collation, so the two engines agree.
     Numbers and ISO days are left alone: money is an integer and must compare by magnitude, and `2026-07-27` is
     chronological already precisely because it is written to sort as text, and folds to itself. */
  if (typeof x === 'string' && typeof y === 'string') return textOrder(x, y) * sign;
  /* MONEY IS AN OBJECT, and `{} < {}` is false both ways round — so a column of money sorted into
     whatever order the rows arrived in, which looks exactly like a sort that worked. Within one
     currency it compares by magnitude; across two it groups by code first, because there is no
     order between them and pretending otherwise is the same lie as adding them. */
  const mx = amountOf(x);
  const my = amountOf(y);
  if (mx !== null && my !== null) {
    const cx = currencyOf(x) ?? '';
    const cy = currencyOf(y) ?? '';
    if (cx !== cy) return (cx < cy ? -1 : 1) * sign;
    return (mx - my) * sign;
  }
  return (x < y ? -1 : 1) * sign;
}

/* ── tracks ──────────────────────────────────────────────────────────────── */

export type Health = 'on_track' | 'at_risk' | 'off_track';
export type UpdateState = 'current' | 'missing' | 'not_expected';

export type TrackHealth = {
  /** The newest update's health, or null when there has never been one. Never a stored field. */
  health: Health | null;
  /** When that update was written. */
  asOf: string | null;
  state: UpdateState;
  by: string | null;
};

/** How long an open track may go unspoken about before the absence is worth showing. */
const UPDATE_WINDOW_DAYS = 14;

/**
 * A track's current health, DERIVED from its newest update and never read from the track.
 *
 * A mutable health column tells you a track was healthy; it cannot tell you whether that was
 * verified on Friday or has said the same thing since March. Storing it beside an append-only log
 * of changes to it is two systems that can disagree, so there is one system: the newest row wins
 * and there is nowhere else to look (20 §9).
 *
 * `not_expected` IS A SEPARATE VALUE FROM `missing`, and it is the part every implementation of
 * this omits. A track that is holding, done or dropped is not silent — nobody is expected to say
 * anything about it. Without the distinction, every finished and parked track piles into the
 * missing bucket, the bucket becomes noise, and the nudge built on it is dead inside a month.
 */
/**
 * The same derivation over rows a caller hands in, against a clock it names.
 *
 * IT IS SPLIT OUT SO A LIVE THREAD CAN BE DERIVED THE SAME WAY. `/t/<track>` read the sample's rows
 * whatever record was open, and the fix is for it to hand its own rows to the derivation rather than
 * for a second copy of the rule to exist beside this one. The `not_expected` distinction and the
 * newest-wins ordering are the two things every implementation of this drops, so there is one
 * implementation, and `trackHealth` in `fixtures/readers.ts` is a reading of it against the sample.
 */
export function healthOf(track: Entry | undefined, updates: readonly Entry[], seq: number, now: number): TrackHealth {
  const state = String(track?.fields.state ?? '');
  const expected = state === 'open';

  const newest = updates
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(a.fields.at).localeCompare(String(b.fields.at)))
    .at(-1);

  if (!newest) {
    return { health: null, asOf: null, by: null, state: expected ? 'missing' : 'not_expected' };
  }

  const asOf = String(newest.fields.at);
  const age = (now - Date.parse(asOf)) / 86_400_000;
  return {
    health: newest.fields.health as Health,
    asOf,
    by: String(newest.fields.by ?? ''),
    state: !expected ? 'not_expected' : age > UPDATE_WINDOW_DAYS ? 'missing' : 'current',
  };
}

/** The intent a health carries. `null` is not an alarm — nobody having spoken is not bad news. */
export const healthTone = (h: Health | null): 'good' | 'warn' | 'bad' | undefined =>
  h === 'on_track' ? 'good' : h === 'at_risk' ? 'warn' : h === 'off_track' ? 'bad' : undefined;

/**
 * What a reader sees where a health goes, including when there isn't one.
 *
 * BY THE LABELS THE `updates` DECLARATION'S HEALTH FIELD CARRIES, when the caller hands it. The thread's header read
 * only the table below, so a record labelling `updates.health.on_track` as Fine read Fine on every update's chip and
 * On track in the header above them. The table stays as the words for a health the record does not label, and for a
 * caller with no declaration to hand.
 */
export function healthLabel(t: TrackHealth, updates?: RegisterDecl): string {
  if (t.state === 'not_expected') return 'No update expected';
  if (!t.health) return 'Update missing';
  const words = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' } as const;
  const said = updates?.fields.find((f) => f.id === 'health')?.labels?.[t.health] ?? words[t.health];
  return t.state === 'missing' ? `${said}, and stale` : said;
}

/** Every update on a track, newest first, out of the rows a caller hands in. */
export const updatesIn = (updates: readonly Entry[], seq: number): Entry[] =>
  updates
    .filter((u) => Number(u.fields.track) === seq)
    .sort((a, b) => String(b.fields.at).localeCompare(String(a.fields.at)));

/**
 * The agent runs placed in one project, most recently seen first.
 *
 * BY PROJECT, BECAUSE A RUN HAS NO THREAD. The kernel's `session` register holds a run's `project` as
 * the project's spoken id, `things#1`, and nothing narrower.
 */
export const runsIn = (runs: readonly Entry[], project: string): Entry[] =>
  runs
    .filter((x) => x.fields.project === project)
    .sort((a, b) => String(b.fields.last_seen).localeCompare(String(a.fields.last_seen)));

/** A run's spoken id, `S1`, which is the name the kernel signs its writes with. */
export const runName = (run: Entry): string => `${REGISTERS.session?.seq_prefix ?? 'S'}${run.seq}`;

/**
 * Whether a run is working now: active, and heard from within the kernel's 15 minutes (`QUIET_MS`, its `WORKING_MS`), past
 * which it has gone quiet. Worked out on read, as the kernel does, because a run that crashed never says so. A run never
 * heard from is not working.
 */
export const workingAt = (run: Entry, now: number): boolean =>
  run.fields.state === 'active' && now - Date.parse(String(run.fields.last_seen)) < QUIET_MS;

/* ── what points AT this row ──────────────────────────────────────────────
   A `ref` declares `to:` and nothing declares the other direction, so the record could say "this
   invoice is for Halden" and a person's page could not say "these four invoices are Halden's" —
   which is the half somebody opens a person for. There is nothing to add to the data model: the
   inverse of every `ref` is already stated, once, on the field that declares it. */

export type Backlink = {
  register: string;
  /** The register's own name, and the field's label — "Obligations · Party", not "obligations". */
  name: string;
  label: string;
  /** The field of theirs that points here, by its id. */
  field?: string;
  icon: IconName;
  total: number;
  /** The first few, ready to draw. The rest are behind `href`. */
  rows: TableRow[];
  columns: Column[];
  href: string;
  /** The same rows as the record stores them, for a drawing that needs a day or an amount and not its words. */
  raw?: readonly Readonly<Record<string, unknown>>[];
};

/* ── metrics ─────────────────────────────────────────────────────────────
   A metric with no target is decoration, and a metric with no comparison window cannot be acted on.
   Each one below carries both, and the mixed-currency case is refused at install, not at render. */

export type Metric = {
  id: string;
  label: string;
  /** How the figure moved, one value a day, oldest first; `null` is a day nothing was recorded. */
  trend?: (number | null)[] | undefined;
  /** The block asked for its line and the record has kept fewer than three nights of it: the line says when it starts. */
  waits?: true | undefined;
  /**
   * Set when `trend` is the walk AHEAD from today rather than the days behind (`cells[].ahead`): the day it starts on,
   * the walk's currency, and the lowest it reaches and the first day it does, in minor units.
   */
  ahead?: { from: string; currency: string; low: { day: string; value: number } } | undefined;
  value: string;
  note: string;
  /** The way the money in the figure goes, drawn as its sign in front: `+` coming in, `−` going out (AM1). */
  sign?: 'in' | 'out' | undefined;
  tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
  /** Where the figure came from, so pressing it opens the rows behind it. */
  href?: string | undefined;
  /** The entries the figure was added up from, by handle, where the record says. */
  backs?: string[] | undefined;
  /**
   * A figure that adds up a field no row in its list has filled in: its zero is no answer, and a page being read does not
   * draw it (`lib/page/home.ts` `unsaid`).
   */
  unsaid?: boolean | undefined;
  /**
   * A figure over a list that holds no row in its scope (`held: 0`): "zero held is not news at all", as the record says
   * it, so a page being read does not draw it, and a row of nothing else holds nothing (`lib/page/home.ts`).
   */
  nothingHeld?: boolean | undefined;
  /**
   * A figure that added up no row at all (`rows: 0`): its nought or its count of none is what any figure says over
   * nothing. A widget on Today whose every figure is one says its own `empty:` line in its frame instead (`widget-empty.ts`).
   */
  readNone?: boolean | undefined;
  /** Money that added up no row and came to nought, which a page being read leaves off (`drawn.ts` `noughtOverNone`). */
  noughtOverNone?: boolean | undefined;
};

/* ── the third state of a figure ──────────────────────────────────────────
   There are three engines that turn one reading of one declaration into one tile: `figureTile` in
   `fixtures/readers.ts` for the sample, `news-live.ts` for Home, `page-live.ts` for a declared page.
   The rule below is theirs, and it lives here because this file is the one all three already import,
   so reading it costs no new edge and creates no cycle.

   IT BELONGS IN `metrics.ts`, which is where every other question asked ABOUT a declaration lives:
   `hrefFor`, `offTarget`, `targetSaid` and `withParam` all take a `MetricDecl` and answer something
   about it, and all three engines already import from there. It is here because that file belonged to
   another agent on the run that moved it, and this is the nearest home reachable from all three.
   `50 §1` is this tree's standing bill for the same rule written twice, so it is worth saying plainly
   that `page-live.ts` still holds a copy of `overUnsaidField` and `reducedFields`: the parity test in
   `news-live.test.ts` drives one reading through all three and is what will fail the day they
   differ. */

/** The four aggregations that reduce a FIELD to one number. A count reads rows and is not one of them. */
const REDUCING = ['sum', 'avg', 'min', 'max'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The fields a figure adds up, averages or takes a bound of, both halves of a pair included. */
function reducedFields(value: MetricDecl['value']): string[] {
  const halves: unknown[] = 'diff' in value ? [value.diff.of, value.diff.per] : 'ratio' in value ? [value.ratio.of, value.ratio.per] : [value];
  return halves.flatMap((half) => {
    const said = isObject(half) ? half : {};
    return REDUCING.flatMap((word) => {
      const operand = said[word];
      if (typeof operand === 'string') return [operand];
      /* A ROW-LEVEL PRODUCT reduces over the field it multiplies, which is the first half of `product`. */
      const product = isObject(operand) && Array.isArray(operand.product) ? operand.product[0] : null;
      return typeof product === 'string' ? [product] : [];
    });
  });
}

/**
 * WHETHER A FIGURE'S OWN PREDICATE REQUIRES THE FIELD IT REDUCES OVER TO BE FILLED IN.
 *
 * THIS IS THE LINE BETWEEN THE TWO ZEROES, and it is narrow on purpose. `out-30d` sums `amount` where
 * the obligation is open and due inside a month: nothing matched over forty obligations is GBP 0.00
 * owed, which is the answer that figure exists to give, and it keeps its verdict and its door.
 * `projects-earning` sums `revenue` where `revenue is set`: nothing matched means no row carries the
 * number being added up, so its zero is the absence of an answer rather than one.
 *
 * `compile` IS ASKED RATHER THAN THE SENTENCE BEING READ A SECOND TIME. The grammar spells this clause
 * three ways, `is set`, `is present` and `is not empty`, all of which compile to one `present` clause,
 * and a second reader of the sentence would be a fourth place to get it wrong. A register this build
 * has no declaration for compiles to no clauses, so the tile answers as it did before rather than
 * guessing.
 *
 * AT ANY CLOCK, because only the clauses' shape is read here and a date resolves the same `present` clause on any day.
 * It compiled at the sample's `NOW`, which Home and a declared page imported through this function on a live record.
 */
function overUnsaidField(decl: MetricDecl): boolean {
  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null) return false;
  const reduced = reducedFields(decl.value);
  if (reduced.length === 0) return false;
  return compile(register, decl.where).clauses.some((c) => c.op === 'present' && reduced.includes(c.field));
}

/**
 * WHAT A REDUCING FIGURE SAYS WHEN THE FIELD IT ADDS UP IS ONE NOBODY HAS FILLED IN.
 *
 * It is the tile's half of the sentence the bar beside it already draws, *"No project in play says
 * what it earns. Put a year on one and it draws here."* That bar can name the field because a
 * declaration wrote its `empty:` for one block; this line is said under any figure, so it names what
 * happened rather than what to type.
 *
 * IT LIVES IN `copy.ts` WITH THE REST OF THE PRODUCT'S SENTENCES, which is where it went the moment
 * one pass owned both files. `page-live.ts` reads the same key through `liveWords.unsaid`, and the
 * parity test holds the two to each other.
 */
export const NO_ROW_SAID = copy.nothingMatched;

/**
 * THE STATE BETWEEN AN EMPTY LIST AND AN ANSWER: THE LIST HOLDS ROWS, AND NOT ONE OF THEM HAS SAID.
 *
 * The kernel's zero rule is written for a COUNT, and its own words are that zero matched over rows
 * that exist is good news (`packages/kernel/src/metrics.ts`). A REDUCING figure turns that sentence
 * over. A sum of no values is zero and the kernel means it to be, so `GBP 0.00` is the same number
 * whether a portfolio earned nothing or nobody has written down what it earns, and `target: { gte: 0 }`
 * on a money sum is met by every value such a sum can take, which is the decoration a target is
 * refused at install for being. So `met: true` carried no measurement and the tile drew a tick anyway.
 *
 * MEASURED AT HIS SIZE, on a record built to it: 27 projects, 14 in play, a
 * monthly figure held for three of them and `revenue` unset on every row, because the importer files a
 * monthly figure as a reading and has no year to write. After `a89bc072` put `revenue is set` on the
 * Earning figures the reading is `rows: 0, held: 27`. Driven through the three engines before this
 * function existed, over exactly that reading: Home and the sample both answered `tone: "good"` with
 * `href: /r/things?f=lane:in:building,earning&f=revenue:is:set` and the target line "never below
 * zero", while the declared page answered no tone, no door and the sentence. One figure, three
 * screens, two answers.
 *
 * AN EMPTY LIST IS ASKED FIRST AND WINS, because a list nobody has written to has no field to have
 * filled in: that zero is `held`, it has its own sentence on each surface, and asking this second
 * would have replaced it. `held` is absent on a reading a caller built by hand, and the fallback to
 * `rows` there is the old ambiguous zero, which withholds the verdict rather than inventing one.
 */
export function unsaidFigure(decl: MetricDecl | undefined, r: { rows: number; held?: number; unsaid?: unknown }): boolean {
  if ((r.held ?? r.rows) === 0) return false;
  /* THE RECORD'S OWN WORD FIRST, as `page-live.ts` reads it, so the answer does not hang on a schema this tab has yet. */
  if (r.rows === 0 && r.unsaid === true) return true;
  if (decl === undefined) return false;
  return r.rows === 0 && overUnsaidField(decl);
}

/* ── the rail ────────────────────────────────────────────────────────────── */

export type NavEntry = {
  id: string;
  title: string;
  href: string;
  section: string;
  order: number;
  /** Where its section sits on the rail, as the page declares it (`nav.place`), lowest first; most pages say nothing. */
  place?: number | undefined;
  /** The lists a place's page reads, sent only for a page with a place (`nav.place`). */
  lists?: string[] | undefined;
  icon: IconName;
  /** The frozen hue of the row this page is about, when it is about one. */
  hue?: number | undefined;
  /** A page made from a template, one per row (a project's own page): the flat nav leaves it to its list's page. */
  row?: true | undefined;
  /** The list that row is in, on a page one row made: Search says a book named as a project "Quartz (book)". */
  register?: string | undefined;
};

/**
 * A declared icon name, resolved against the set that actually shipped.
 *
 * A declaration is DATA — it arrives with a pack, and a pack is a thing a stranger wrote. The name
 * it asks for may be one this build has never heard of, and the answer to that is the fallback
 * glyph for the kind of row, never an empty box and never a thrown error: a rail is not allowed to
 * fail to render because someone spelled `obligations` where the set says `obligation`.
 *
 * "THE SET" IS ALL 251, not the 63 the app drew for itself. This once checked `PATHS` alone,
 * so `icon: rocket`, a name `braindog-render/glyphs` ships, drew a document. The answer is
 * still synchronous: `isGlyph` knows every name up front and only the paths arrive late.
 */
export const iconFor = (declared: string | undefined, fallback: IconName): IconName =>
  declared && isGlyph(declared) ? declared : fallback;

/** The frozen hue of a declared identity, or undefined when the page is not about a row. */
export const hueOf = (id: { register: string; seq: number } | undefined): number | undefined => {
  if (!id) return undefined;
  const target = REGISTERS[id.register];
  const accent = target?.identity?.accent;
  if (!accent) return undefined;
  const row = (ROWS[id.register] ?? []).find((e) => e.seq === id.seq);
  const hue = row ? Number(row.fields[accent]) : NaN;
  return Number.isFinite(hue) ? hue : undefined;
};

export type BlockResult = PageBlock & {
  /** A `bar` or `split` over a grouped figure: the whole, and each part by its key, largest first. */
  parts?: Parts;
  /** A `bar` or `split` over rows: the record's home currency and dated rates, which it sends beside the rows. */
  fx?: { home: string | null; rates: readonly Rate[] } | undefined;
  rows: TableRow[];
  columns: Column[];
  /** The rows this block DRAWS: the matched set cut to `limit:`, aligned one-to-one with `rows`. */
  entries: Entry[];
  /**
   * The rows the predicate ADMITTED, uncut.
   *
   * `bar`, `chips` and `gauge` do arithmetic, and arithmetic over the first page of a register is a
   * wrong number rather than a short list: the cut is about how much a reader can take in, and a
   * total is one line however many rows went into it. Every kind that projects a row each reads
   * `entries`; every kind that reduces reads this.
   */
  matched: Entry[];
  /** What the `where:` could not understand, in words. Empty when it understood all of it. */
  refusals: string[];
  /**
   * HOW MANY OF THE ANSWER THIS BLOCK IS SHOWING, against `total`.
   *
   * It is not `entries.length` and it is not `rows.length`, and the surface that said "Showing 0 of
   * 58" over thirteen visible rows had used both. A `forecast.runway` block has no `entries` — a
   * step of a cash walk is not a register row — and its `rows` carry a fourteenth that is not a
   * step: the opening balance, which is a header wearing a row's clothes.
   *
   * So the count is stated by whoever builds the block, in the unit the block's own total is in.
   */
  shown: number;
  total: number;
  drawn: boolean;
  /** Machine-readable, and every block that renders a query result carries one: staleness is a
      TIMESTAMP, not a vibe (19 §6). */
  stale_at: string;
  register?: string | undefined;
  /**
   * On `sessions.live`, whether each run in `entries` has gone quiet: open, and not heard from within the kernel's
   * `QUIET_MS` (`isQuiet`). A card grid draws such a run dimmed.
   */
  quiet?: boolean[] | undefined;
  /** On `sessions.live`, aligned with `entries`: the one word each run reads as (the kernel's `presenceOf`). */
  presence?: RunPresence[] | undefined;
  metrics?: Metric[] | undefined;
  /** On a block that inherits: how many of `entries`, at the end, apply everywhere rather than to the project. */
  inherited?: number;
  /**
   * A `queue` block's questions, as the record answered them: what is waiting, who opened it, why,
   * and the ways to answer it. `total` is how many are open, which is how the block knows what it
   * left out.
   */
  queue?: QueueQuestion[];
  /**
   * A `capture` block's: what a row added through it is filled with, by field, in the stored form. The kernel's `fills`,
   * which this engine answers from `inheritedFrom`, the register grid's own add.
   */
  fills?: Record<string, string>;
  /** A `feed` block's rows before they are words, newest first, a burst being one row. */
  feed?: FeedRow[];
  /** On a feed with `since: seen`: the reader's read mark, or `null` when they have none yet. */
  seen?: string | null;
  /** A `diff` block's versions of its field, newest first. */
  history?: { at: string; by: string; text: string }[];
  /** A `forecast.runway` block's walk, which a `bridge` draws from rather than from the table. */
  walk?: Walk;
  /** A walk over several currencies that could not be converted: one walk a currency, and why it is not one. */
  walks?: Walk[] | undefined;
  walkNote?: string | null;
  /** One walk of a walk drawn once per currency: the group its knobs are shared in, and its key there. */
  walkGroup?: { id: string; key: string } | undefined;
  /** A `series` block's buckets and each line's value in them, as the record's `barsOf` lines them up. */
  bars?: Bars;
  /** A `stat` or `lines` over readings: one series a measure, as the record's `measureSeries` works them out. */
  measures?: MeasureSeries[];
  /**
   * A `lines` block over readings: each measure with one reading in the period, which draws no line, as that reading,
   * newest first. The record answers it as `latest` beside `measures`, which then holds only the measures with a line
   * to draw; it is kept under its own name here because `latest` on a block already says when a decision was made.
   */
  readOnce?: MeasureLatest[];
  /** A forecast's `recorded:` series over the ninety days before today, oldest first. */
  past?: readonly { at: string; value: number }[];
  /** A forecast's `late:` figure, read: how many days late money has come in on average, or `null` when nothing was paid. */
  lateness?: number | null;
  /** That figure's name as the record declares it, which the late knob is called by. */
  late_name?: string;
  /**
   * A forecast's `sell:` figure as the record read it, in minor units of the walk's currency: what the sell control may
   * count as sold. It arrives from the kernel untouched (`blockOf` carries every key it does not name), and
   * `forecastRows` in `blocks.ts` writes one `sell` row each.
   */
  sells?: readonly { label: string; value: number }[];
  /** A `bar` over a list of links: the money each linked row holds, by the row's id, which the bar adds up per row. */
  linked?: Readonly<Record<string, unknown>>;
  /**
   * A `progress` budget: what its `spent:` figure read, each part by the raw value of the word it groups by. With
   * `toward`, a goal's `toward:` figure, each part keyed by the number of the row it was logged against.
   */
  spentBy?: { metric: string; unit: string | null; groups: { key: string; value: number | null }[]; toward?: boolean };
  /** On a live record: the record's own title for each row a ref on this block points at, so a group is never named from the sample. */
  names?: Names;
  /**
   * A `cards` block with `group:`, or a `table` whose rows carry their group: the name each row is grouped under,
   * aligned with `rows`, `null` for one in none. Absent, a card's names are read from `names`.
   */
  groups?: readonly (string | null)[];
  /**
   * Aligned with `rows`, where the record said who changed some row last: that row's byline (`byline.ts`), who changed
   * it, for whom, whether the reader has seen it, and the batch its Undo puts back. `null` for a row a person changed.
   */
  bylines?: readonly (Byline | null)[];
  /**
   * THE RECORD'S OWN ANSWER, KEPT WHOLE, on a block whose kind is registered (`lib/page/kinds/index.ts`). Such a kind is
   * drawn from this and from nothing above it: `page-live.ts` translates no key of it into this type, so a new kind
   * costs no line in this file or in the reader. Absent on every kind `blocks.ts` draws itself.
   */
  answer?: Answer | undefined;
};

/** The kernel's `FeedRow` (`packages/kernel/src/pages.ts`), which this engine must agree with. */
export type FeedRow = {
  by: 'agent' | 'rule' | 'you';
  who: string | null;
  count: number;
  kind: string | null;
  target: string | null;
  note: string | null;
  at: string;
  /** What the target is called, where the record could say: a row's title. */
  thing?: string | null;
  /** On a `setup` row, how many example rows the record set itself up with. */
  rows?: number;
  /** The rows a rule's run folded into this one line, one name a row, newest first (the kernel's `feedRows`). */
  things?: string[];
  /**
   * On a row a run signed, who that run is (the kernel's `run_by`), or `null` for a run the record does not hold. Absent
   * from a row no run signed and from a record on an older build, and such a run is An agent as before.
   */
  run_by?: RunBy | null;
  /** On a feed that says `group: day`: the day the line was written, in the record's own time zone. */
  day?: string;
  /** On a feed that says `fold: run`: how many more lines the run that signed this one wrote, which this line stands for. */
  run_more?: number;
};

/** One step of a cash walk, as this build's walk and the record's both send it. */
export type WalkStep = { day: string; label: string; delta: number; balance: number; source: string; href?: string; spoken?: string; kind?: 'everyday' };

/** A cash walk, with only the keys the table reads. The record's `crossed` arrives as a copy of a step, not the step. */
export type Walk = {
  from: number;
  currency: string | null;
  steps: readonly WalkStep[];
  crossed: WalkStep | null;
  /** On a walk drawn once per currency: the opening figure remembered in this walk's currency, oldest first. */
  past?: readonly { at: string; value: number }[] | undefined;
  /** How many days the chart opens on, `last` resolved to the walk's last dated movement. */
  horizon?: number | undefined;
  /** How many days the record walked, when that is further than `horizon`, so the length control can offer more. */
  reach?: number | undefined;
  /** On a walk drawn once per currency: what this walk may count as sold, in its own currency. */
  sells?: readonly { label: string; value: number }[] | undefined;
  /** What the everyday leg measured, once per currency (the kernel's `Runway.everyday`): `why` set when it moved nothing. */
  everyday?: readonly { currency: string | null; months: readonly string[]; spent: number; planned: number; monthly: number; why?: string }[];
};

/** Where a step's row opens: this build's `href`, or the record's `register#seq` as that row's address. */
function stepHref(s: WalkStep): string | undefined {
  if (s.href) return s.href;
  const m = /^([a-z_][a-z0-9_]*)#(\d+)$/u.exec(s.spoken ?? '');
  return m ? `/r/${m[1]}/${m[2]}` : undefined;
}

/**
 * A cash walk as a table: the columns, the opening row, a row a step, and how many of the steps it shows.
 *
 * ONE SHAPE FOR BOTH WALKS, the sample's and the one a record answers on a page, so the two draw the
 * same table. `today` is the day the opening balance is liquid on, and `refused` draws no row at all.
 */
export function walkTable(
  walk: Walk,
  limit: number | undefined,
  today: string,
  refused: boolean,
): Pick<BlockResult, 'columns' | 'rows' | 'shown' | 'total'> {
  /* FIXED TRACKS, NOT `auto`. Each row is its own grid over one declared track list, so an `auto`
     track sized itself to each row's own date: the What column started at a different x on every
     row whose date was a digit longer. Wide enough for "14 Sep 2026" with the tone's gutter, and
     for "−£19,100.00". */
  const columns = [
    { field: 'day', label: 'When', width: '17ch', align: 'start' as const, truncate: 'end' as const },
    { field: 'what', label: 'What', width: 'minmax(16ch,1fr)', align: 'start' as const, truncate: 'end' as const },
    { field: 'delta', label: 'In and out', width: '15ch', align: 'end' as const, truncate: 'never' as const },
    { field: 'balance', label: 'Balance', width: '15ch', align: 'end' as const, truncate: 'never' as const },
  ];
  const steps = walk.steps.slice(0, limit ?? 12);
  /* THE CROSSING BY WHAT IT IS, because a record's `crossed` came over the wire as its own object. */
  const c = walk.crossed;
  const crossed = c
    ? walk.steps.findIndex((s) => s === c || (s.day === c.day && s.balance === c.balance && s.delta === c.delta && s.source === c.source && s.label === c.label))
    : -1;
  return {
    columns,
    shown: steps.length,
    rows: [
      /* THE OPENING IS A ROW, because every balance under it is that number plus a movement. It was
         nowhere on the screen: the first row read "In and out −9,190.00 · Balance −4,190.00", which
         only adds up if you already know the walk started at 5,000 — and the red "RUNWAY 0 days"
         headline above it is derived from the same invisible figure. A forecast whose arithmetic
         cannot be checked from the screen is a number somebody has to trust. */
      /* AND NO OPENING ROW UNDER A REFUSAL OF ANY KIND, for the reason the mixed-currency case
         already had: a block that refuses draws nothing, and half a table under a sentence saying
         the walk could not be made is the half somebody reads. */
      ...(refused
        ? []
        : [
            {
              key: 'opening',
              cells: [fmtDay(today), 'What is liquid today', '', moneyOr(walk.from, walk.currency)],
              href: undefined,
              tone: undefined,
            },
          ]),
      ...steps.map((s, i) => ({
      /* The key is the movement, not the index: two charges on one day from one service are
         different rows, and a keyed list that reuses an index re-renders the wrong one. */
      key: `${s.day}-${s.source}-${stepHref(s)}-${i}`,
      cells: [fmtDay(s.day), s.label, moneyOr(s.delta, walk.currency), moneyOr(s.balance, walk.currency)],
      href: stepHref(s),
      /* THE CROSSING IS ONE ROW. Painting every row after it the same colour buries the fact the
         walk exists to produce: the day you go under. Everything after it is still under, which is
         `warn` — a state, not an event. */
      tone: i === crossed ? ('bad' as const) : s.balance < 0 ? ('warn' as const) : undefined,
      })),
    ],
    total: walk.steps.length,
  };
}

/**
 * A measure with one reading in its period, said once rather than drawn as a line of one point: the kernel's
 * `MeasureLatest` (`packages/kernel/src/measures.ts`), which its index does not export, as the page reader narrows it.
 * `value` is in major units of `unit`, as a series holds it, and `day` is the record's local day it was read on.
 */
export type MeasureLatest = { measure: string; of?: string; group?: string; value: number; unit: string; at: string; day: string };

/**
 * A grouped figure's whole and its parts, as a `bar` or a `split` draws them. A part's `label` is its name where its key
 * is not one a person reads (a ref's ULID), as the record or the page reader named it.
 */
export type Parts = {
  metric: string;
  value: number | null;
  groups: { key: string; label?: string; value: number | null; parts?: Part[] }[];
  more: number;
  /** The currency the parts are in, which is the home one once converted; absent when the figure says its format's. */
  unit?: string | null;
};

/**
 * An agent as a person reads its name: `agent:claude` is Claude, and a run (`S42`) is the app it ran in where the record
 * says who the run is (`run_by`: "Claude Code") and An agent where it does not, as `names.ts`'s `actor` says them.
 */
const agentNamed = (who: string, run_by: RunBy | null = null): string => (who === 'you' ? who : actor(who, null, new Map(), runByIn(run_by)).name);

/**
 * A ROW'S NOTE WITH ITS HANDLES IN WORDS (`handlesSaid`): an instruction a run took reads "took Write the notes" beside
 * the run's name, as the verbs of `agentDoing` read, where it read "Taken by S42.".
 */
function agentNote(r: FeedRow): string | null {
  if (r.note === null) return null;
  const note = handlesSaid(r.note, r.who, runByIn(r.run_by ?? null));
  const thing = r.thing ?? r.target;
  return note === handleWords.tookThis && thing ? `took ${thing}` : note;
}

/**
 * An `agents` block's rows as the renderer reads them: `who | count | what | when`. The agent is named as a person reads
 * it, and what it did is the event's note, or the verb and the row it was done to (`agentDoing`).
 */
export function agentsTable(feed: readonly FeedRow[], now: number): Pick<BlockResult, 'rows' | 'shown'> {
  const rows: TableRow[] = feed.map((r, i) => ({
    key: `${r.at}-${i}`,
    cells: [r.who === null ? '' : agentNamed(r.who, r.run_by ?? null), String(r.count), r.kind === 'setup' ? setupSaid(r.target, r.rows ?? 0) : agentDoing(r.kind, r.thing ?? r.target, agentNote(r)), whenOf(r.at, now)],
    href: undefined,
    tone: undefined,
  }));
  return { rows, shown: feed.length };
}

/**
 * WHO DID IT, AS A PERSON READS IT. A live record signs a person's write with their id, and a feed drew
 * `p_01M2PAZ28BN3FTKQB266DVT4HX` beside every line: the reader is You, and anybody else is somebody on the record.
 */
export const feedWho = (who: string, me: string | null, names: ReadonlyMap<string, string> = new Map(), run_by: RunBy | null = null): string => {
  const said = whoDid(who, me, names, runByIn(run_by));
  return said.you && me === null ? actorOf(who) : said.name;
};

/**
 * WHO DID IT, BY NAME WHERE THE RECORD HAS ONE. A row's page printed `p_01M2PAZ…` under Added and down its History, and
 * the id ran over "just now" beside it. The words are `names.ts`'s `actor`, the one rule for saying an actor: the
 * reader is You, a person the record names is that name, any other person is Someone on this record, and Slash, BrainDog,
 * an agent and an automation are each said by name. `person` is whether the subject is somebody at all, which the
 * screens that word "Added by" and filter by person need apart from the name.
 */
export function whoDid(who: string, me: string | null, names: ReadonlyMap<string, string> = new Map(), run_by: RunBy | null = null): { name: string; you: boolean; person: boolean } {
  const said = actor(who, me, names, run_by);
  const you = said.kind === 'you';
  return { name: said.name, you, person: you || said.kind === 'person' };
}

/**
 * WHAT IT WAS DONE TO, when that is not a row: a feed drew "installed pack:usecase-team" and "suggested suggestion:SG1".
 */
export function feedThing(target: string | null): string | null {
  if (target === null) return null;
  const usecase = /^pack:usecase-([a-z][a-z0-9-]*)$/u.exec(target)?.[1];
  if (usecase) return copy.feedUseCase(useCaseName(usecase));
  const pack = /^pack:(.+)$/u.exec(target)?.[1];
  if (pack) return copy.feedPack(pack);
  /* A QUESTION THE RECORD DID NOT NAME, from a host older than the one that says what it asks (`thing`), is a question
     and never its number: "suggested SG10" handed the reader an id. */
  if (/^(?:suggestion:SG|decision:D)\d+$/u.test(target)) return FEED_QUESTION;
  return target;
}

/** What a feed line calls a question the record sent without its words. */
const FEED_QUESTION = 'a question';

/** The verbs that write a row, after which a worded rule's line is the row and what was done to it. */
const ROW_WRITES: ReadonlySet<string> = new Set(['edit', 'state', 'link', 'tag']);

/**
 * WHAT A FEED LINE SAYS WAS DONE, in the person's words, and whether it is a sentence of its own: the event's own note,
 * a record setting itself up, a worded rule's write as the row and what was done to it, and otherwise the verb and the
 * thing.
 *
 * A RULE THE PRODUCT WORDS (`ruleDone`) IS SAID AS ITS ROW: eight lines of "Categorise what cleared changed TALLYARD"
 * read as `Tallyard categorised`, and a run of them over several rows as one line, `Categorised 6 payments: Tallyard,
 * Northern Rail and 4 more` (`ruleFolded`). A question a rule asked is what it asked, `Asked whether Ledger Post went
 * through` (`ruleAsked`), and a note it wrote is its own words.
 *
 * `whole` IS A LINE THAT NEEDS NOBODY IN FRONT OF IT. Each of those lines was drawn after the rule's name, so the feed
 * read "Catch a repeat that did not happen suggested Ledger Post…": a rule's line that says what happened in a sentence
 * of its own is sent with no `who`, and the group it sits in already says a rule did it.
 */
function feedLine(r: FeedRow): { what: string; whole: boolean; counted?: true } {
  if (r.kind === 'setup') return { what: setupSaid(r.target, r.rows ?? 0), whole: false };
  const thing = r.thing ?? feedThing(r.target);
  const rule = r.by === 'rule' && r.who !== null ? r.who : null;
  const noted = r.note !== null && r.note.trim() !== '';
  /* A QUESTION NOBODY ASKED BY HAND IS WHAT IT ASKS, from a rule, the record or an agent alike. "BrainDog suggested The
     backup on 3 Sep did not run" sat under You with a capital mid-sentence; it reads `Asked: the backup on 3 Sep did not
     run`. An agent keeps its name in front, since its group is every agent's. */
  if (r.kind === 'suggest' && r.thing && r.by !== 'you') {
    if (rule !== null) return { what: ruleAsked(rule, r.thing), whole: true };
    return { what: `asked: ${asPartOf(r.thing)}`, whole: false };
  }
  if (rule === null) return { what: agentDoing(r.kind, thing, r.note), whole: false };
  if (noted) return { what: agentDoing(r.kind, thing, r.note), whole: true };
  const folded = r.things && r.things.length > 1 ? r.things : null;
  if (folded) {
    const said = r.kind !== null && ROW_WRITES.has(r.kind) ? ruleFolded(rule, folded) : null;
    /* EITHER WAY THE LINE NAMES OR COUNTS EVERY ROW, so no number is drawn in front of it as well. */
    return said === null ? { what: agentDoing(r.kind, namesSaid(folded), null), whole: false, counted: true } : { what: said, whole: true, counted: true };
  }
  const done = ruleDone(rule);
  if (done !== null && thing !== null && r.kind !== null && ROW_WRITES.has(r.kind)) return { what: `${thing} ${done}`, whole: true };
  return { what: agentDoing(r.kind, thing, r.note), whole: false };
}

/**
 * A RECORD SETTING ITSELF UP IS ONE LINE (`kernel/src/feed.ts`), on Home and on a feed block alike: the use case it
 * installed, or the add-on, and how many example rows it added, rather than a line a row.
 */
export function setupSaid(target: string | null, rows: number): string {
  if (rows === 0) return copy.setUpLinked;
  const id = (target ?? '').replace(/^pack:/u, '');
  const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(id)?.[1];
  if (usecase) return copy.setUpWith(useCaseName(usecase), rows);
  const names = (listsOfModule(id) ?? []).map((r) => REGISTERS[r]?.name ?? r);
  return names.length > 0 ? copy.setUpWith(names.join(', '), rows) : copy.setUpRows(rows);
}

/** When a feed row happened, in words: a day against today, and an instant as how long ago. */
const whenOf = (at: string, now: number): string => (/^\d{4}-\d{2}-\d{2}$/u.test(at) ? relative(at, now) : since(at, now));

/** The first cell of the row that heads a day's lines, which the renderer draws as a heading (`render/src/feed.ts`). */
const FEED_DAY = 'day';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * THE READER'S OWN DAY AT `now`, as `relative()` counts it: in the zone named, else the browser's own, else UTC where
 * there is no window (a test, a worker). A zone nobody knows is UTC, because a formatter never stops a page.
 */
function todayIn(now: number, zone?: string): string {
  const parts = (timeZone: string | undefined) => new Intl.DateTimeFormat('en-u-nu-latn-ca-gregory', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  let found: Intl.DateTimeFormatPart[];
  try {
    found = parts(zone ?? ('window' in globalThis ? undefined : 'UTC'));
  } catch {
    found = parts('UTC');
  }
  const part = (type: Intl.DateTimeFormatPartTypes): string => found.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * A DAY AS THE HEAD OF ITS LINES: Today, Yesterday, then the weekday and the day of the month (`Mon 12 Oct`), with the
 * year only when it is another year (`Wed 31 Dec 2025`). The date is `shortDay`'s and `day`'s, so a day is spelled
 * here as it is everywhere else. A day past the reader's today (the record keeps another zone) is its date, never a guess.
 */
export function feedDay(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const t = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(t)) return day;
  return `${WEEKDAYS[new Date(t).getUTCDay()]} ${day.slice(0, 4) === today.slice(0, 4) ? shortDay(day) : fmtDay(day)}`;
}

/** What a run's newest line says of the lines folded under it. */
const feedMore = (n: number): string => `and ${integer(n)} more`;

/**
 * WHAT A BURST'S LINE SAYS OF THE LINES ALIKE UNDER IT, after its words: "and 7 more like this". It was a bare number in
 * a column of its own before the face, "8", which on a project's What changed read as a stray digit beside a line that
 * said one thing (`-more/row-braindog-390-light.png`).
 */
const feedAlike = (n: number): string => `and ${integer(n)} more like this`;

/** The note an undo writes on what it puts back (`PUT_BACK` in `kernel/src/undo.ts`), which is a key the kernel reads. */
const UNDO_NOTE = 'Put back by an undo.';

/**
 * A NOTE SAID AFTER WHO WROTE IT, as part of one sentence: "Claude Code added the visual…", where it read "Claude Code
 * Added the visual…", and an undo as what was done, "You undid a change to Kiln", where it read "You Put back by an
 * undo.". Only a first word that is a verb in the past is lowered, so a note that opens on a name keeps it.
 */
export function noteAfterWho(note: string, thing: string | null): string {
  if (note.trim() === UNDO_NOTE) return thing ? `undid a change to ${thing}` : 'undid a change';
  return note.replace(/^(\p{Lu}\p{Ll}+ed|Put|Paid|Sent|Made|Set|Kept|Left|Got|Took|Ran|Found|Wrote|Read|Built|Held|Brought|Bought|Sold|Told)\b/u, (w) => w.toLowerCase());
}

/** Where the run that signed a line opens, or nothing where the record named no run a person could open. */
function runHref(r: FeedRow): string | undefined {
  const run = r.run_by?.run ?? r.who ?? '';
  return /^S[1-9][0-9]*$/u.test(run) ? `/r/session/${run.slice(1)}` : undefined;
}

/**
 * A feed's rows as the renderer reads them, `by | who | count | what | when`, with the `seen` row.
 *
 * ONE SHAPE FOR THE SAMPLE'S FEED AND A RECORD'S. On a feed that marks what is new, the `seen` row sits
 * below the rows newer than the reader's read mark, which the renderer draws as new, and says when that
 * was. A reader with no mark yet gets it at the end with no time, which is the renderer's "not looked yet".
 *
 * A FEED THAT SAYS ITS DAYS (`group: day`, so each row carries `day`) gets one more kind of row, `day | words`, before
 * each day's first line. "Today" is the reader's, counted from `now` in their own zone. The `seen` row stays under the
 * last new line, so where the first line already read opens a day it sits above that day's heading.
 *
 * A RUN FOLDED TO ITS NEWEST LINE (`fold: run`, `run_more`) ends with one more cell, the words for the rest, which open
 * the run. THE LINK IS IN THE CELL, because a feed's rows reach the renderer as the dialect's text (`blocks.ts`) and a
 * row's `href` does not travel with them; the row carries it too, for a reader of the rows themselves. A row with
 * neither key is the five cells it always was.
 */
export function feedTable(
  feed: readonly FeedRow[],
  marks: boolean,
  seen: string | null,
  now: number,
  me: string | null = null,
  names: ReadonlyMap<string, string> = new Map(),
  zone?: string,
): Pick<BlockResult, 'rows' | 'shown'> {
  const at = !marks || seen === null ? -1 : feed.findIndex((r) => r.at <= seen);
  const mark = (): TableRow => ({ key: 'seen', cells: ['seen', seen === null ? '' : whenOf(seen, now)], href: undefined, tone: undefined });
  const today = feed.some((r) => r.day !== undefined) ? todayIn(now, zone) : '';
  const rows: TableRow[] = [];
  let day: string | undefined;
  feed.forEach((r, i) => {
    if (marks && i === at) rows.push(mark());
    if (r.day !== undefined && r.day !== day) {
      day = r.day;
      rows.push({ key: `day-${r.day}-${i}`, cells: [FEED_DAY, feedDay(r.day, today)], href: undefined, tone: undefined });
    }
    const line = feedLine(r);
    const more = r.run_more !== undefined && r.run_more > 0 ? r.run_more : 0;
    const run = more > 0 ? runHref(r) : undefined;
    /* A BURST SAYS ITS LINES ALIKE IN WORDS AFTER IT (`feedAlike`), where a run's fold does not already say what it folds. */
    const alike = !line.counted && more === 0 && r.count > 1 ? r.count - 1 : 0;
    const who = r.who === null || line.whole ? '' : feedWho(r.who, me, names, r.run_by ?? null);
    const what = who !== '' && r.note !== null && r.note.trim() !== '' && line.what === r.note ? noteAfterWho(r.note, r.thing ?? null) : line.what;
    rows.push({
      key: `${r.at}-${i}`,
      /* NO NUMBER IN FRONT OF A LINE: a burst says its alike lines after it (`feedAlike`), and a line that says its own
         number, "Categorised 6 payments", says it once (`feedBurst`). */
      cells: [r.by, who, line.counted || alike > 0 ? '1' : String(r.count), what, whenOf(r.at, now), ...(more > 0 ? [run ? `[${feedMore(more)}](${run})` : feedMore(more)] : alike > 0 ? [feedAlike(alike)] : [])],
      href: run,
      tone: undefined,
    });
  });
  if (marks && at === -1) rows.push(mark());
  return { rows, shown: feed.length };
}

/**
 * A diff block's lines: the newest version against the one before it, as the renderer reads them. One
 * version has nothing to compare with and draws no line. `total` is every version the row has held.
 */
export function historyTable(history: readonly { text: string }[], total: number): Pick<BlockResult, 'rows' | 'shown' | 'total'> {
  /* A TEXT WITH ONE VERSION IS DRAWN WHOLE, as what that version put in (pages pass, 2 Nov): a skill's page said "One
     version so far." and never showed the skill, so the one place to read it was its row's raw field. Two or more are
     the newest against the one before, as ever. */
  const [newest, before] = history;
  return {
    rows:
      newest === undefined
        ? []
        : diffRows(before?.text ?? '', newest.text).map((line, i) => ({ key: String(i), cells: [line], href: undefined, tone: undefined })),
    shown: history.length,
    total,
  };
}

/**
 * THE MOST ROWS ANY SURFACE PUTS IN A DOCUMENT, and the number `13 §4.3` gives.
 *
 * It lived as a `const DOM_CAP = 2000` inside the register route, so it was the register's rule
 * rather than the product's — and every other list in the build rendered every row it held. A saved
 * view is the register's list with a different filter and had no cap at all; `/audit` grows with
 * WRITES rather than rows, so on a busy record it is the longest list in the product; `/inbox` is
 * where one bad ingest rule puts thousands of arrivals, and it is the screen you need at exactly
 * that moment.
 *
 * `22 §4` measures the cost: ~27 µs a row on a desktop and ~167 µs at 4× throttle, at nine nodes a
 * row — so five thousand rows is *"~833 ms of build on a mid-tier phone no matter what CSS you
 * write"*. The way past it is a filter or an export, never a virtualised scroll.
 */
export const DOM_CAP = 2_000;

/**
 * `33 §2`'s CEILING, and the page a grid asks for.
 *
 * The contract's `limit` defaults to 25 and caps at 200; this function's default is **the whole
 * answer**, because every caller but the grid wants a count, a metric or a forecast and paging one
 * of those would be a cap nobody asked for. An earlier comment here said "25 by default", which its
 * own docstring thirty lines down contradicted.
 */
export const PAGE = 200;

/**
 * WHO DID IT, IN WORDS. `rule.renewal` and `rule.reply` are declaration ids, and every surface that
 * answers "who changed my record" answers a question nobody asks in dotted notation.
 *
 * IT LIVED IN `/audit` AND HOME DREW THE RAW ID. Two of the six actors in "Since you were away" were
 * `rule.reply` and `rule.renewal`, while the audit log one route over rendered the same two as
 * "reply rule" and "renewal rule" — the same fact, on the same record, spelled two ways, and the
 * screen a person lands on had the machine's spelling. A function two surfaces need is not a detail
 * of one of them.
 */
/**
 * THE COLUMN THAT SAYS WHO CHANGED A ROW LAST, AND WHEN. It is not a field: a register that declares a field
 * called `changed` keeps its own, and every other reads the row's history.
 */
export const CHANGED = 'changed';

/** What is wrong with a column's `sign:`, as the record checks it: an enum on the register, and one of its values. */
export function signFaults(register: string, columns: PageBlock['columns']): string[] {
  return (columns ?? []).flatMap((c) => {
    if (c.sign === undefined) return [];
    const field = decl(register, c.sign?.field ?? '');
    return field?.type === 'enum' && typeof c.sign?.minus === 'string' && (field.values ?? []).includes(c.sign.minus)
      ? []
      : [`columns: sign: names an enum field on ${register} and the value that makes the amount go out, such as { field: direction, minus: owed_by_me }`];
  });
}

/** Only these three sign a run (`session.agent`, `30 §3`): a person or a rule has no run to be at. */
const LIVE_AGENTS = new Set(['claude', 'codex', 'cursor']);

/** The newest ledger event about one exact row, or `null` when nothing has touched it. */
function lastTouchIn(audit: readonly { by: string; at: string; target?: string | undefined }[], register: string, seq: number): { by: string; at: string } | null {
  const target = `${register}#${seq}`;
  const said = audit.filter((a) => a.target === target).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return said ? { by: said.by, at: said.at } : null;
}

/**
 * `working: true`'s question, asked with the ledger and the runs handed to it rather than read from
 * the module's own — which is what makes it a function a test can put a made-up row and a made-up
 * run through, the way `workingNow` below puts the record's real ones.
 *
 * NOT WHO CHANGED THE ROW LAST, WHETHER THAT ACTOR IS STILL AT IT: only an agent has a run to be at,
 * so a row last touched by `you` or a rule answers `false` before the runs are even read. Then two
 * clocks, not one — the touch itself has to sit inside the kernel's 15 minutes before a run goes quiet
 * (`QUIET_MS`), because an agent that is still running does not mean it is still on the row it wrote
 * three hours ago, and the run that agent is named on has to be heard from inside that same window
 * (`workingAt`) — the same fact `sessions.live` shows for a run, asked here of a row instead.
 *
 * THE KERNEL ANSWERS THE SAME QUESTION in `pages.ts` `workingOf`, off the row's history rather than
 * off a sample ledger, and `engines.test.ts` holds the two to the same answer.
 */
export function workingNowAt(
  register: string,
  seq: number,
  now: number,
  audit: readonly { by: string; at: string; target?: string | undefined }[],
  runs: readonly Entry[],
): boolean {
  const touch = lastTouchIn(audit, register, seq);
  if (!touch || !LIVE_AGENTS.has(touch.by)) return false;
  if (now - Date.parse(touch.at) >= QUIET_MS) return false;
  return runs.some((run) => run.fields.agent === touch.by && workingAt(run, now));
}

/** `You, 3 Sep` or `Reply, 9 Sep`: who changed a row last, and the day. */
export const changedText = (by: string, at: string): string => {
  const who = actorOf(by);
  return `${who.charAt(0).toUpperCase()}${who.slice(1)}, ${shortDay(at.slice(0, 10))}`;
};

/**
 * A column's `sign:` and a `changed` column, filled in over the cells `toRows` drew.
 *
 * THE SIGN IS A WORD ON THE FIGURE, never a colour: money going out reads `−GBP 1,350.00` and money coming in
 * `+GBP 4,800.00`, in the same neutral ink.
 */
export function markColumns(
  register: string,
  columns: readonly { field: string; sign?: { field: string; minus: string } }[] | undefined,
  entries: readonly Entry[],
  rows: TableRow[],
  changed: (e: Entry, n: number) => { by: string; at: string } | null,
): void {
  (columns ?? []).forEach((c, i) => {
    rows.forEach((row, n) => {
      const e = entries[n];
      if (!e) return;
      if (c.field === CHANGED && decl(register, CHANGED) === undefined) {
        const who = changed(e, n);
        row.cells[i] = who ? changedText(who.by, who.at) : null;
        return;
      }
      const cell = row.cells[i];
      if (!c.sign || typeof cell !== 'string' || cell === '' || cell === MISSING) return;
      const out = e.fields[c.sign.field] === c.sign.minus;
      const bare = cell.replace(/^[−+-]/u, '');
      const negative = cell.startsWith('−') || cell.startsWith('-');
      row.cells[i] = `${out !== negative ? '−' : '+'}${bare}`;
    });
  });
}

/**
 * An actor in words, for a caller holding no names and no reader: `names.ts`'s `actor`, by name.
 *
 * `you` STAYS `you`, because it is the token the sample signs the reader's own writes with, and Home's feed and a
 * track's thread still test `who === 'you'` to draw the reader's face in ink. Every other actor is its name, and a
 * person's id is Someone on this record here as it is in `whoDid`, so reaching for this one can no longer put an id on
 * a screen.
 */
export const actorOf = (by: string): string => (by === 'you' ? by : actor(by).name);

export type SearchHit = {
  title: string;
  detail: string;
  href: string;
  kind: string;
  /** The glyph its own register or question type declares, so the palette need not guess. */
  icon: IconName;
  spoken?: string;
  /** The searchable field that answered, when the title did not — `find.ts`'s `why`. */
  why?: string;
  /** Found by meaning and by no word typed. Counted, never printed beside the row. */
  meaning?: true;
  /** What tells two rows of one name apart: the row's day and its amount, when the record said them. */
  on?: string;
  amount?: { amount: number; currency: string };
};

/**
 * Everything in the record that answers what was typed — by the declaration, not by the title.
 *
 * THIS HEADING SAID "whose title contains" for a version and a half after it stopped being true. The
 * correction went in forty-eight lines below, inside the loop, which is the append-a-correction shape
 * this codebase keeps finding: a reader who stops at the summary has read the old behaviour.
 *
 * THE CUT IS TAKEN ACROSS THE SOURCES, NOT INSIDE THE FIRST ONE. This returned from inside the
 * register loop the moment it hit the cap, and the palette asks for eight — so `obligations`, first
 * in declaration order, took the whole budget every time. Measured: `re` returned 8 hits, all
 * Obligations, out of 21 across People, Sessions, Tracks, Updates, Tasks and Decide; `a` returned 8
 * of 82. Typing `re` could not reach a task, and nothing on screen said the list was partial.
 *
 * So every source is collected, then ROUND-ROBINED: one hit from each in turn until the cap. A
 * register with three hundred matching rows now costs the others one slot each rather than all of
 * them, which is the only behaviour that makes a palette over eight registers usable.
 */
/**
 * What a search found, and how much of it you are being shown.
 *
 * IT USED TO RETURN AN ARRAY AND NOTHING ELSE, so every caller knew what it had and none of them
 * could know what it was missing. The palette asked for eight, printed eight, and said nothing —
 * on the surface `19 §4` makes the primary way to reach a row. Worse than a flat cap of eight: the
 * round-robin below hands one hit per source per round, so across nine sources a budget of eight is
 * frequently ONE ROW PER LIST, and the comment beside it says the rotation was added precisely
 * because *"nothing on screen said the list was partial"*. The distribution was fixed and the
 * silence was not.
 *
 * `total` COSTS ONE COUNTER inside loops that already run. `groups` is the same hits kept in their
 * lists rather than interleaved, which is what a results PAGE wants and a ranked palette does not.
 */
export type SearchResult = {
  /** The round-robined hits, at most `limit`. */
  hits: SearchHit[];
  /** How many rows matched across every list — what the caller is not showing. */
  total: number;
  /** Every list that matched, with its own count and the address that holds the rest. */
  groups: { kind: string; total: number; hits: SearchHit[]; href: string | null }[];
};

/** The short names a value spells in lower case and people write in capitals. */
const CAPITALS = new Set(['api', 'ssh', 'mcp', 'cli', 'url', 'dns', 'sms', 'vat', 'pdf', 'csv', 'gpu', 'cpu']);

/** An enum value with no declared label, as words: `api_token` reads API token, `recovery_codes` Recovery codes. */
export function enumWords(value: string): string {
  const words = value.split('_').filter((w) => w !== '').map((w) => (CAPITALS.has(w.toLowerCase()) ? w.toUpperCase() : w));
  const said = words.join(' ');
  return said === '' ? value : said.charAt(0).toUpperCase() + said.slice(1);
}
