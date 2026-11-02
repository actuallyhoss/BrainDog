/**
 * A row's history on `/r/<register>/<seq>`, read from the record, and what History leads with: who signed what is new
 * since the reader last looked.
 *
 * A ROUTE-ONLY MODULE, like `search-live.ts`: the client carries the route table as a value.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` at an address with no slug used to
 * read the sample's ledger instead, which put another business's history beside whatever row the address named; there
 * is no sample now, so a host that did not answer says so and a 401 says to sign in.
 *
 * EVERY SENTENCE THE RECORD STORED LEAVES HERE THROUGH `moneyInText`, as the feed and the log leave `news-live.ts`. A
 * rule's note holds an amount the way a program reads it, "GBP 2,400.00", and a row's history printed it so; the screen
 * says it the way a person does, "£2,400.00" in the home currency and "$4,800.00 USD" in any other.
 */

import { createClient, type ClientOptions, type Cursor } from '@braindog/client';
import { datesIn } from 'braindog-render';

import { display, labelOf } from './api.ts';
import { REGISTERS, TITLES } from './held.ts';
import type { Names } from './remote.ts';
import type { FieldDecl } from './schema.ts';
import { readBoot } from './boot-live.ts';
import { moneyInText } from './money.ts';
import { actor as actorSaid, listName } from './names.ts';
import type { cardWords } from '../decide/card.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * One line of a row's history: who, what, and when, newest first. `settled` is who suggested the change and who settled
 * it ("Slash suggested · Mara accepted"), on a line an answered suggestion of Slash's made, where `linesOf` was handed
 * the names to say it with, and "Slash did this without asking" on one Slash's rung let land (`slashDidSaid`).
 */
/**
 * `field` and `to` say which field a line changed and what to, where it changed one: "parked since" is read off them.
 * `from` is what it held before, on a line the record left no note on, so the page can word it again once the row's
 * read has named its links (`namedLines`).
 */
export type Line = { by: string; note: string; at: string; settled?: string; field?: string; to?: unknown; from?: unknown };

/** `now` is the clock `since` reads against: the reader's, since every line is the record's. */
export type Told = { from: 'live'; lines: Line[]; now: number } | { from: 'refused'; fix: string };

/** An event as the record's `history` sends it, and only the keys read here. */
export type Event = {
  ts: string;
  actor: string;
  kind: string;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  note?: string | null;
};

/**
 * An event in words, when it carries no note of its own.
 *
 * THE SAMPLE'S SHAPE, "state from open to done", because the page draws both and one register on
 * one screen reads better than two. A value is drawn the way the row's own fields draw it.
 *
 * `names` ARE THE NAMES THE ROW'S READ HANDED THE PAGE, with the walk's ids (`remote.ts`), so a list of links says the
 * rows it gained and lost: "added this to Tidewell". Without them it says how many, never the ids it holds.
 */
export function noteOf(register: string, e: Event, names?: Names): string {
  const own = ownNote(e.note);
  if (own) return own;
  if (e.kind === 'create') return 'created';
  /* AN EDIT THAT NAMES NO FIELD: a person's Activity read "An agent edit". */
  if (!e.field) return e.kind === 'edit' ? 'changed this' : e.kind.replace(/[._]/g, ' ');
  const f = REGISTERS[register]?.fields.find((x) => x.id === e.field);
  const name = f ? labelOf(f).toLowerCase() : e.field.replace(/_/g, ' ');
  /* A VALUE THE HISTORY WITHHOLDS (every money amount and key, `--redacted--`) or lost (`--erased--`) is not a value:
     "paid so far cleared" was said of a change whose new amount was only withheld. It is said without its value. */
  const kept = (v: unknown): boolean => typeof v === 'string' && /^--(?:redacted|erased)--$/u.test(v);
  if (kept(e.to) || kept(e.from)) return e.to === null || e.to === undefined || e.to === '' ? `${name} cleared` : e.from === null || e.from === undefined || e.from === '' ? `${name} set` : `${name} changed`;
  /* A LIST IS SAID BY WHAT IT GAINED AND LOST, and never as the whole list twice: a person's history read "projects
     from 01M3MV… to 01M3MV…, 01M4TW…" and "met set to 2026-10-24 · commit 891072f in larkspur". */
  const was = listOf(e.from);
  const now = listOf(e.to);
  if ((was !== null || now !== null) && (f === undefined || f.type === 'list')) {
    const listed = listChange(f, name, was ?? [], now ?? [], names);
    if (listed !== null) return listed;
  }
  /* A LINK IS HELD AS THE ROW'S ID, which names nothing to a reader: Home read "cycle set to cycles#01M2PAZ…" once a use
     case's examples were linked. The event does not carry the row's title, so a link is said without its value. */
  /* AND BY ITS NAME WHERE THE ROW'S READ HANDED IT ONE: a book a rule filed the row in is "book set to Household". */
  const linked = f?.type === 'ref' && (e.from === null || e.from === undefined || e.from === '') ? linkName(f.to, e.to, names) : null;
  if (linked !== null) return `${name} set to ${linked}`;
  if (f?.type === 'ref' || isId(e.to) || isId(e.from)) return e.to === null || e.to === undefined || e.to === '' ? `${name} cleared` : e.from === null || e.from === undefined || e.from === '' ? `${name} set` : `${name} changed`;
  const before = display(register, e.field, e.from);
  const after = display(register, e.field, e.to);
  if (after === null) return `${name} cleared`;
  return before === null ? `${name} set to ${lineSaid(after)}` : `${name} from ${lineSaid(before)} to ${lineSaid(after)}`;
}

/**
 * WHAT A WRITER NOTED, WITHOUT A SCRIPT'S SIGNATURE (settings3, 2 Nov): a rule's script signs every write
 * "Written by script:book_from_account@v1.", and a line's Activity printed it after the script's own name. The line
 * already names the script, so the signature is no note, and the change is said as any unnoted change is.
 */
const SIGNED = /^\s*Written by script:[a-z][a-z0-9_-]*@v\d+\.?\s*(?:·\s*)?/u;
const ownNote = (note: string | null | undefined): string => (note ?? '').replace(SIGNED, '').trim();

/** A row's id, bare or as `<list>#<id>`. */
const ROW_ID = /^(?:[a-z][a-z0-9_]*#)?[0-9A-HJKMNP-TV-Z]{26}$/u;
const isId = (v: unknown): boolean => typeof v === 'string' && ROW_ID.test(v);

/** A list value as the record sent it, an array or the JSON text of one, or `null` for anything else. */
function listOf(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v.startsWith('[')) return null;
  try {
    const held: unknown = JSON.parse(v);
    return Array.isArray(held) ? held : null;
  } catch {
    return null;
  }
}

/**
 * A LINE OF A LIST, OR A VALUE, AS A PERSON SAYS IT: a day the record keeps ("2026-10-24") as the day, a commit as a
 * commit and not its hash, and the record's " · " as a comma. "24 Oct, a commit in larkspur".
 */
function lineSaid(text: string): string {
  return datesIn(text)
    .replace(/\bcommits? ([0-9a-f]{7,40})\b/giu, 'a commit')
    .replace(/ · /gu, ', ');
}

/**
 * The name of a row a list of links holds, from the names the row's read handed the page, or `null` while nobody has
 * named it. The record holds a link as the row's id, the walk's `ids` turn it into its number, and the number names it.
 */
function linkName(to: string | undefined, v: unknown, names: Names | undefined): string | null {
  const said = (list: string, n: number): string | null => (names ? names.get(`${list}#${n}`) : TITLES.get(list)?.get(n))?.trim() || null;
  if (typeof v === 'number' || (typeof v === 'string' && /^[1-9]\d*$/u.test(v))) return to ? said(to, Number(v)) : null;
  if (typeof v !== 'string' || !ROW_ID.test(v)) return null;
  const hashed = /^([a-z][a-z0-9_]*)#(.+)$/u.exec(v);
  const list = hashed?.[1] ?? to;
  const id = hashed?.[2] ?? v;
  const ids = names?.ids;
  if (!ids) return null;
  if (list) {
    const n = ids.get(`${list} ${id}`);
    return n === undefined ? null : said(list, n);
  }
  for (const [key, n] of ids) if (key.endsWith(` ${id}`)) return said(key.slice(0, -id.length - 1), n);
  return null;
}

/** "a", "a and b", "a, b and c". */
const listed = (words: readonly string[]): string =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * WHAT A LIST GAINED AND LOST, in words, or `null` where it holds neither links nor lines (a list of numbers, say), which
 * keeps the words it had. A list of links: "added this to Tidewell", "took this off Larkspur", or "added this to 2 more"
 * while the rows are unnamed. A list of lines: "added to met: 24 Oct, a commit in larkspur".
 */
function listChange(f: FieldDecl | undefined, name: string, was: readonly unknown[], now: readonly unknown[], names: Names | undefined): string | null {
  const key = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
  const had = new Set(was.map(key));
  const has = new Set(now.map(key));
  const added = now.filter((v) => !had.has(key(v)));
  const gone = was.filter((v) => !has.has(key(v)));
  if (added.length === 0 && gone.length === 0) return `${name} changed`;
  const links = f ? f.of === 'ref' : [...added, ...gone].some(isId);
  if (links) {
    const said = (vs: readonly unknown[]): string => {
      const named = vs.map((v) => linkName(f?.to, v, names)).filter((n): n is string => n !== null);
      const rest = vs.length - named.length;
      if (rest === 0) return listed(named);
      /* "another project" where the list it points at says what one of its rows is, else "one more". */
      const one = f?.to ? REGISTERS[f.to]?.one?.trim().toLowerCase() : undefined;
      const more = rest > 1 ? `${rest} more` : named.length === 0 && one ? `another ${one}` : 'one more';
      return named.length === 0 ? more : listed([...named, more]);
    };
    if (gone.length === 0) return `added this to ${said(added)}`;
    if (added.length === 0) return `took this off ${said(gone)}`;
    return `added this to ${said(added)} and took it off ${said(gone)}`;
  }
  if (![...added, ...gone].every((v) => typeof v === 'string' || typeof v === 'number')) return null;
  const said = (vs: readonly unknown[]): string => listed(vs.map((v) => lineSaid(String(v))));
  if (gone.length === 0) return `added to ${name}: ${said(added)}`;
  if (added.length === 0) return `took off ${name}: ${said(gone)}`;
  return `added to ${name}: ${said(added)}, and took off ${said(gone)}`;
}

/**
 * THE FIELDS A `declare` LINE SAYS IT ADDED OR TOOK OFF, as the kernel writes them: "Added domain." and "Took off note.",
 * each a sentence of field ids joined by ", " and " and " (`declared` in `packages/kernel/src/index.ts`). A note cut at
 * its 280 characters loses its full stop and matches neither, which leaves the line in the words it had before.
 */
const IDS = '([a-z][a-z0-9_-]*(?:(?:, | and )[a-z][a-z0-9_-]*)*)';
const ADDED = new RegExp(`(?:^|\\. )Added ${IDS}\\.(?= |$)`, 'u');
const TOOK_OFF = new RegExp(`(?:^|\\. )Took off ${IDS}\\.(?= |$)`, 'u');

/** A list's field by its label, lower case as `noteOf` says one, or its id in words when the list does not declare it here. */
function fieldWords(register: string, id: string): string {
  const f = REGISTERS[register]?.fields.find((x) => x.id === id);
  return f ? labelOf(f).toLowerCase() : id.replace(/[_-]/gu, ' ');
}

/**
 * A list's fields added or taken off, in words, from a `declare` line's target and note: "Added domain to Projects",
 * "Took off note from Tasks", or both in one sentence. `null` for any other `declare` line, which keeps its own words.
 *
 * HISTORY AND HOME BOTH SAID "Changed the page" OR THE BARE NOTE, "Added domain.", for a field put on a list: the verb
 * named the wrong thing and the note did not say which list. The target names the list (`declaration:register.<id>`) and
 * the note names the fields, so the line is made of the two. What else the note says ("Proposed by p_… in SG5.") is ids,
 * which nobody reads, so it is left out rather than printed beside the sentence.
 */
export function declaredOf(target: string | null | undefined, note: string | null | undefined): string | null {
  const register = /^declaration:register\.([a-z][a-z0-9_-]*)$/u.exec(target ?? '')?.[1];
  if (register === undefined || !note) return null;
  const words = (ids: string | undefined): string | null =>
    ids === undefined ? null : listed(ids.split(/, | and /u).map((id) => fieldWords(register, id)));
  const added = words(ADDED.exec(note)?.[1]);
  const off = words(TOOK_OFF.exec(note)?.[1]);
  const list = listName(register);
  if (added !== null && off !== null) return `Added ${added} to ${list} and took off ${off}`;
  if (added !== null) return `Added ${added} to ${list}`;
  if (off !== null) return `Took off ${off} from ${list}`;
  return null;
}

/* ── who suggested and who settled ─────────────────────────────────────── */

/**
 * WHAT A LINE MAY CARRY OF THE SUGGESTION BEHIND IT, beside its own keys. The record's history read and its log send
 * none of these yet, so each is read where it is sent and nothing is claimed where it is not.
 *
 * `suggested_by` is who filed the suggestion and `drafted_by` who drafted it, Slash's rules (`rules`) or the model the
 * record names, as the record keeps both on the suggestion. `answer_label` is the chosen option in its own words.
 * On a change to somebody's things that an accepted suggestion made, `settled_by` is who pressed (the line is signed by
 * the rule that let it land) and `undone` marks the change that took it back.
 */
export type Suggested = {
  suggested_by?: string | null;
  drafted_by?: string | null;
  answer_label?: string | null;
  settled_by?: string | null;
  undone?: boolean | null;
  /**
   * On a line that took a question back, who had answered it: the ladder (`rule:ladder`) where Slash's rung let it land
   * with nobody asked. On a change Slash's rung let land, `kept_by` is who kept it once its Undo passed. The record sends
   * neither yet (`packages/record/src/settling.ts`), so an undo of such a change reads as any undo of Slash's.
   */
  answered_by?: string | null;
  kept_by?: string | null;
};

/** How a suggestion was settled, read off one line: what was done, by whom, and whose suggestion it was. */
export type Settling = {
  how: 'accepted' | 'declined' | 'chose' | 'undid';
  /** The option chosen, in words, when `how` is `chose`. */
  option?: string;
  by: string;
  suggested_by: string | null;
  drafted_by: string | null;
  /** Who had answered the question an undo took back, and who kept a change that landed alone, where the line says. */
  answered_by?: string;
  kept_by?: string;
};

/**
 * THE CARD'S WORDS, handed in by whoever draws the line and never copied here: this file is read by screens that draw
 * no card, so it imports the card's type and none of its code. `drafted` says who drafted it, where the caller has words
 * for that.
 */
export type SettledWords = Pick<typeof cardWords, 'slash' | 'accepted' | 'declined' | 'chose' | 'undid'> & {
  drafted?: (by: string) => string | null;
};

/** Who reads the line and the names the record gave its people, with the card's words to say it in. */
export type Say = { me: string | null; names: ReadonlyMap<string, string>; words: SettledWords };

/** A string the record sent, trimmed, or `null` for anything else and for an empty one. */
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** The option a `decide` line names: its `to` is `{ question, answer }`, as the record wrote it or already read. */
function answerOf(to: unknown): string | null {
  let held = to;
  if (typeof held === 'string') {
    try {
      held = JSON.parse(held);
    } catch {
      return null;
    }
  }
  return typeof held === 'object' && held !== null ? text((held as { answer?: unknown }).answer) : null;
}

/**
 * How one line settled a suggestion, or `null` for a line that settled none.
 *
 * READ OFF THE LINES THE RECORD WRITES FOR EACH PRESS. A yes is a `decide` line naming the option; a no is a `resolve`
 * line closed as `wont-fix` or `incorrect`; an undo is a `resolve` closed as `undone`, or a `suggest` that reopened the
 * question, signed by whoever undid it. The `resolve` written beside a yes (`addressed`) is the same press as its
 * `decide` line and is left to it, and nobody settled a question its asker took back or BrainDog reopened.
 *
 * A CHANGE TO SOMEBODY'S THINGS IS ONE ONLY WHERE THE RECORD SAYS A SUGGESTION MADE IT (`suggested_by`): it landed, so
 * it was accepted, unless the line is the one that took it back.
 */
export function settlingOf(e: Pick<Event, 'actor' | 'kind' | 'to'> & Suggested): Settling | null {
  const answered = text(e.answered_by);
  const kept = text(e.kept_by);
  const whose = {
    suggested_by: text(e.suggested_by),
    drafted_by: text(e.drafted_by),
    ...(answered === null ? {} : { answered_by: answered }),
    ...(kept === null ? {} : { kept_by: kept }),
  };
  const by = text(e.settled_by) ?? e.actor;
  const label = text(e.answer_label);
  if (e.kind === 'decide') {
    const answer = answerOf(e.to);
    if (answer === null) return null;
    if (answer === 'reject') return { how: 'declined', by, ...whose };
    if (answer === 'accept') return { how: 'accepted', by, ...whose };
    return { how: 'chose', option: label ?? answer.replace(/[_-]+/gu, ' '), by, ...whose };
  }
  if (e.kind === 'resolve') {
    if (e.to === 'wont-fix' || e.to === 'incorrect') return { how: 'declined', by, ...whose };
    return e.to === 'undone' ? { how: 'undid', by, ...whose } : null;
  }
  if (e.kind === 'suggest') return e.to === 'reopened' && e.actor !== 'system' ? { how: 'undid', by, ...whose } : null;
  if (whose.suggested_by === null) return null;
  if (e.undone === true) return { how: 'undid', by, ...whose };
  return label === null ? { how: 'accepted', by, ...whose } : { how: 'chose', option: label, by, ...whose };
}

/** Whether Slash filed it or drafted it for whoever did, as the card reads it (`bySlash` in `lib/decide/card.ts`). */
const SLASHS = /^slash\b/u;

/**
 * THE ONE SENTENCE, for Activity and for a row's history: "Slash suggested · Mara accepted", in the card's own words,
 * with who drafted it after where the caller can say that. `null` for anybody else's suggestion, a person's own or an
 * agent's, and for one the record names no suggester for, which all read as they did.
 */
export function settledSaid(s: Settling, person: string, words: SettledWords): string | null {
  const drafter = s.drafted_by !== null && SLASHS.test(s.drafted_by);
  if (s.suggested_by !== 'slash' && !drafter) return null;
  const verb = s.how === 'accepted' ? words.accepted : s.how === 'declined' ? words.declined : s.how === 'undid' ? words.undid : words.chose(s.option ?? '');
  const drafted = s.drafted_by === null || drafter ? null : (words.drafted?.(s.drafted_by) ?? null);
  return drafted === null ? words.slash(person, verb) : `${words.slash(person, verb)} · ${drafted}`;
}

/** The same for a line as the record sent it: whoever settled it by the name the screen says them, the reader as You. */
export function settledBy(e: Pick<Event, 'actor' | 'kind' | 'to'> & Suggested, say: Say): string | null {
  const s = settlingOf(e);
  return s === null ? null : settledSaid(s, actorSaid(s.by, say.me, say.names).name, say.words);
}

/* ── what Slash did without asking ─────────────────────────────────────── */

/**
 * WHO ANSWERS A QUESTION SLASH'S RUNG LETS LAND, as the kernel signs it (`LADDER_RULE` in `packages/kernel/src/govern.ts`):
 * the decision and the rows it wrote are the ladder's, and Slash stays on the question as its filer. Spelled here and
 * not imported, as `page-versions.ts` spells it, so this route-only module pulls nothing of the kernel.
 */
const LADDER = 'rule:ladder';

/** The words a change Slash made alone is said in. The verb for an undo is the card's own (`undid`). */
export const slashDidWords = {
  alone: 'Slash did this without asking',
  did: (person: string, verb: string) => `Slash did · ${person} ${verb}`,
  kept: 'kept',
};

/**
 * THE ONE SENTENCE FOR A CHANGE SLASH MADE ALONE, for Activity and for a row's history: "Slash did this without asking",
 * then "Slash did · Mara kept" or "Slash did · Mara undid" once somebody acted on it. ENG-B15: what landed alone reads as
 * Slash's, with who kept or undid it.
 *
 * READ FROM WHAT THE LINE CARRIES. A question Slash filed (`suggested_by: slash`) that the ladder accepted is a change
 * nobody was asked about: its `decide` line and every row it wrote say `by` the ladder. An undo is one only where the line
 * says the ladder had answered what it took back (`answered_by`); without that it is any undo of Slash's, which
 * `settledSaid` says. `null` for every other line, a person's own change and a suggestion somebody pressed among them.
 * `name` says a person as the screen says them.
 */
export function slashDidSaid(s: Settling, name: (id: string) => string, words: Pick<SettledWords, 'undid'>): string | null {
  if (s.suggested_by !== 'slash') return null;
  if (s.how === 'accepted' && s.by === LADDER) return s.kept_by === undefined ? slashDidWords.alone : slashDidWords.did(name(s.kept_by), slashDidWords.kept);
  if (s.how === 'undid' && s.answered_by === LADDER && s.by !== LADDER) return slashDidWords.did(name(s.by), words.undid);
  return null;
}

/** The same for a line as the record sent it, and the sentence it says first: who settled it otherwise (`settledBy`). */
export function slashDidBy(e: Pick<Event, 'actor' | 'kind' | 'to'> & Suggested, say: Say): string | null {
  const s = settlingOf(e);
  return s === null ? null : slashDidSaid(s, (id) => actorSaid(id, say.me, say.names).name, say.words);
}

/* A RULE IS `rule:<id>` ON THE RECORD AND `rule.<id>` IN THE SAMPLE, and `actorOf` words the second. */
const actor = (a: string): string => a.replace(/^rule:/u, 'rule.');

/**
 * The record's events, oldest first, as the page's lines, newest first.
 *
 * `moneyInText` HERE AND NOT IN `noteOf`, because `news-live.ts` words its lines with `noteOf` and hands the whole
 * sentence through `moneyInText` itself; one pass over one sentence, wherever it is made.
 */
export const linesOf = (register: string, events: readonly (Event & Suggested)[], say?: Say): Line[] =>
  events
    .map((e) => {
      /* WHAT SLASH DID ALONE FIRST, so a change the ladder let land is never "Slash suggested · Ladder accepted". */
      const settled = say === undefined ? null : (slashDidBy(e, say) ?? settledBy(e, say));
      return {
        by: actor(e.actor),
        note: moneyInText(noteOf(register, e)),
        at: e.ts,
        ...(settled === null ? {} : { settled }),
        ...(e.field ? { field: e.field, to: e.to } : {}),
        ...(e.field && !ownNote(e.note) ? { from: e.from ?? null } : {}),
      };
    })
    .reverse();

/**
 * THE LINES WORDED AGAIN WITH THE NAMES THE ROW'S READ HANDED THE PAGE, which arrive beside the history and not before
 * it: a list of links then says the rows it gained, "added this to Tidewell", where it could only count them. A line
 * with a note of its own keeps it, and without names the lines are the lines.
 */
export function namedLines(register: string, lines: readonly Line[], names: Names | undefined): Line[] {
  if (names === undefined) return [...lines];
  return lines.map((l) =>
    l.field === undefined || !('from' in l) ? l : { ...l, note: moneyInText(noteOf(register, { ts: l.at, actor: l.by, kind: 'edit', field: l.field, from: l.from, to: l.to }, names)) },
  );
}

/**
 * The names of the people on this record, by id, for saying who did what. `boot` sends them to the owner and to a member
 * who may read People, and the shell keeps that answer, so this costs no call. A host older than `names` is asked
 * `members`, which is the owner's. Anybody else and a refusal get an empty map, and each person is said as
 * You or Someone on this record.
 */
export async function readNames(base: string, io?: Fetch): Promise<ReadonlyMap<string, string>> {
  const booted = await readBoot(base, io).catch(() => null);
  if (booted?.from === 'live' && booted.boot.names !== undefined) return new Map(Object.entries(booted.boot.names));
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.members().catch(() => null);
  if (!out?.ok || !Array.isArray(out.value)) return new Map();
  return new Map(
    (out.value as { person_id?: unknown; name?: unknown }[]).flatMap((m) =>
      typeof m.person_id === 'string' && typeof m.name === 'string' && m.name.trim() !== '' ? [[m.person_id, m.name.trim()] as const] : [],
    ),
  );
}

/**
 * One row's history.
 *
 * A ROW WITH NO NUMBER THE RECORD COULD HOLD (a pending one) ASKS NOTHING, and its answer is the true one: the record
 * holds no events for it. It was `sample` with no lines, a word that now names nothing.
 *
 * `say` IS THE READER, THE NAMES AND THE CARD'S WORDS, and with it a line an answered suggestion of Slash's made carries
 * who suggested and who settled (`settled`). Without it every line is the line it was.
 */
export async function readHistory(base: string, register: string, seq: number, io?: Fetch, say?: Say): Promise<Told> {
  if (!Number.isInteger(seq) || seq < 1) return { from: 'live', lines: [], now: Date.now() };
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.history(register, seq);
  if (out.ok) return { from: 'live', lines: linesOf(register, out.value as (Event & Suggested)[], say), now: Date.now() };
  return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'The row changed while it was being read.' };
}

/**
 * What is new since the reader last looked, as who signed each line, and whether the record holds more than it sent.
 *
 * `whatsNew` IS THE RECORD'S OWN ANSWER to "since you last looked": the lines after the reader's read mark, which Home
 * stamps on leaving, newest first and at most one page of them (`sinceCapped` says there are more). Reading it moves
 * nothing; only `markRead` does, so History asking does not take Home's news away.
 *
 * AND `upTo`, THE RECORD'S OWN CURSOR FOR THESE LINES, as fresh as this read, which Activity stamps with on leaving: the
 * shell's is as old as the tab, and it is the only one a member held to named lists may send back.
 *
 * ONLY THE SIGNATURES, because the lead line counts who and says nothing of what: the lines themselves are the log
 * below it, which `readLog` reads.
 */
export type Unseen = { from: 'live'; actors: string[]; capped: boolean; upTo: Cursor | null; byWho?: unknown } | { from: 'refused'; fix: string };

export async function readUnseen(base: string, io?: Fetch): Promise<Unseen> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.whatsNew();
  if (out.ok) return { from: 'live', actors: out.value.events.map((e) => e.actor), capped: out.value.sinceCapped, upTo: out.value.upTo, ...(out.value.byWho === undefined ? {} : { byWho: out.value.byWho }) };
  return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'Something changed while it was being read.' };
}
