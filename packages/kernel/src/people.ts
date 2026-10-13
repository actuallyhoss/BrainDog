/**
 * Automatic people and organisations: someone met in the work, resolved to who the record already knows, or added.
 *
 * RESOLVE, THEN MEET (DIRECTION §38). Everything that comes in is read for who it is about, and the record answers in
 * one identity per person:
 *
 *   1. A KEY MATCH. Every identifier said is a key (`identity-keys.ts`), and `entity_key` holds which row answers to
 *      it. A match gains a dated line saying where they were met and with what source, the run's project, and
 *      whichever identifiers it was missing. Nothing it already holds is overwritten, because what an agent saw in a
 *      commit is weaker than what a person typed. The last day in touch moves forward, never back.
 *   2. A NAME ALONE NEVER MAKES A ROW. Two people share a name often enough that joining on it would fold strangers
 *      together, and making a row for every bare name made the owner's record five "Fofo"s and two of himself. It is
 *      kept as a mention (`entity_mention`), and the caller is told to give an address or a handle.
 *   3. THE STRONG RULES, written by the record as one undoable batch: the same name of two or more words (a name or an
 *      alias), plus the same personal handle: an email local part or a login of five or more characters, read without
 *      its dots, dashes, underscores and the number on its end (`rohan.meduri`, `rohanmeduri` and `rohanmeduri24` are
 *      one handle). The same organisation or domain alone is never enough: two colleagues share both (M4). The older
 *      row is kept, the record's own person always, and the newer folded into it, carrying every field the kept row
 *      lacks (H2).
 *   4. ONE QUESTION PER CLUSTER for the doubtful rest, worded in names and the evidence for each (M4), never in ids.
 *      Asked once: a pair the owner said no to, or a merge he undid, is never asked about again. A later meeting of
 *      somebody the question names keeps it current (`reask`), and one who may be the same person joins it rather than
 *      opening another, so a question is never left stale by the work it is about.
 *
 * TEXT ANYBODY COULD HAVE WRITTEN IS NOT EVIDENCE (H1). A mail, a bank text, an import or any other arrival (`untrusted`,
 * or a source that says so) never strong-merges, never carries a key onto somebody already known, and never folds an
 * address into a real person: an exact key match gains its dated line and nothing else, a sender like nobody known is a
 * person of their own, and one who looks like somebody known is kept as a mention with one question for the owner. A row
 * every meeting of which was such text is never folded on the strong rules either, whichever order the two arrived in.
 *
 * AND THAT IS EVERY SOURCE BUT A NAMED FEW (research-audit-19 M1). The owner typing, a note, and an agent session's own
 * run are believed; anything else, however a caller words it, is text anybody could have written. A COMMIT sits between
 * (audit 19 H1): anyone who can push may sign one with any name and address, so a commit by a key somebody already holds
 * is that person's, and one by a key nobody holds is a person of their own. A commit folds somebody met in commits alone
 * only into somebody else met in commits alone; one who looks like a person typed, noted or mailed is asked about.
 *
 * A KEY IS NEVER BELIEVED OUTRIGHT (research-audit-21 H2): what an agent's key or a script says is held to a commit's
 * word, whatever its source says. AND AN ORGANISATION IS HELD TO THE SAME RULES (H1): a mail, a bank text or a commit
 * naming one already held writes its line, and a domain or key it would add is one question. Nothing makes an
 * organisation the record was not told of by a key: two people it vouches for at a domain nobody holds are one question
 * ("Add Acme?"), and two organisations whose names fold to the same words are one question per pair.
 *
 * `only: 'known'` IS A RULE'S WAY OF SAYING "NOBODY NEW FROM THIS": it writes only on a key somebody holds, an address at
 * an organisation the record keeps, or one the record's own person has written to, and is a mention otherwise.
 *
 * NEVER: a person merged with an organisation (they live in two lists, and a key belongs to one row of one list); a row
 * another member made merged by anybody but its maker's say; a merge made without asking while money rows point at
 * both. A shared inbox or a machine sender (`info@`, `noreply@`) is an organisation speaking and never makes a person.
 * A full address is never a name, a met line or a word handed to a model (M1, M2).
 *
 * THE LISTS ARE WHICHEVER DECLARE `meets:` AND `org:`, and each field is the one its part names (`roles.ts`). A record
 * older than the keys is met into `people` and `organisations` under the parts' own names. A list may leave out
 * `handles` and `projects`: then a handle is refused, and nobody is linked to a project.
 *
 * EVERY FIELD'S PATH IS A BOUND PARAMETER, `json_extract(fields, ?)`, since the field ids come from a declaration.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './coerce.ts';
import { FOLD_HOPS, holderOf, holders, nameKey, noteMention, sourceKeys } from './entities.ts';
import type { Proposal } from './govern.ts';
import { UNVERIFIED } from './ingest.ts';
import { githubOfAddress, isOrganisationAddress, isPublicMail, keyFrom, keyOf, keysOf, kindOfKey, parseFrom, registrable, valueOfKey } from './identity-keys.ts';
import { LEGACY, PARTS, plays, type MeetsFields, type OrgFields, type Role } from './roles.ts';

/**
 * The list `meet` wrote by name before any list declared `meets:`, and still does while none does. The record's `meet`
 * guard reads `kernel.meetsList()` and not this name; only its members' names gate, `namesFor`
 * (`packages/record/src/index.ts`), still names `people`, by list and by module.
 */
export const PEOPLE = LEGACY.meets;

/** The provenance lines a person keeps, newest last. */
export const MET_CAP = 20;

/** The most doubtful pairs one night's `infer.resolve` job asks a model about. */
export const RESOLVE_PAIRS_NIGHT = 20;

/** How many pairs of one name the nightly pass asks about with no model (`askPlainPairs`). */
export const PLAIN_PAIRS_NIGHT = 5;

/** The longest a source may be in a met line, a mention or a question: a phrase, never a mail's subject line in full. */
export const SOURCE_MOST = 80;

/** The most people one question asks about. Past it a cluster is not one person's spellings, and nobody can read it. */
const CLUSTER_MOST = 12;

/** The most other names a person keeps, so a name read from every commit does not grow a list nobody reads. */
const ALIASES_MOST = 8;

/** How many strong folds one meeting may chain, each the record's own rule: a fold can make the kept row like another. */
const STRONG_HOPS = 3;

/**
 * What `meet` is told: at least one of a name, an email, a handle, keys or a domain, and always the source (or where,
 * which says the same: `commit 4464966 in braindog`, `mail from brightwell.example`, `bank text`). The source wins when both
 * are said, since `where` is often a mail's subject.
 *
 * `email` MAY BE A RAW `From` HEADER, `"Ada" <ada@x.com>`, and is read into its name and address.
 */
export type MeetArgs = {
  name?: string;
  email?: string;
  handle?: string;
  keys?: readonly string[];
  kind?: 'person' | 'organisation';
  /** The organisation they are with, by its name or its domain. */
  org?: string;
  domain?: string;
  /** For an organisation, what kind it is (`vendor`, `merchant`); for a person, kept for the record's own guard. */
  role?: string;
  where?: string;
  source?: string;
  /**
   * Read from text anybody could have written: a mail, a bank text, an import, any arrival. Every source is read so
   * unless it is one `TRUSTED` names or the owner typed it (`PeopleDeps.typed`), and `false` never lifts that.
   */
  untrusted?: boolean;
  /**
   * `known`: meet only somebody the record has reason to know. A key somebody holds, an address at a domain a kept
   * organisation holds, or one the record's own person has written to is met as ever; anybody else is a mention, with
   * no row, no fold and no key carried.
   */
  only?: 'known';
};

/** The row met, as a person reads it: its list, its id, its number and its name. */
export type MetRow = { register: string; id: string; seq: number | null; name: string };

/**
 * Who they turned out to be.
 *
 * `row` IS `null` FOR A MENTION, a name with nothing that identifies it, and `mention` is then `true`. `matched_by` is
 * `key` for a key match, `strong` when the strong rules folded the new row into one already known, and `none` for a row
 * just added. `question` is the Decide question this call opened about a doubtful cluster, `undo` the batch that undoes
 * a strong merge it made.
 *
 * `person`, `linked` AND `merge` ARE KEPT FOR CALLERS OLDER THAN THE CONTRACT: the row's spoken id, whether it was linked
 * to the caller's project, and the question's id again.
 */
export type Met = {
  row: MetRow | null;
  created: boolean;
  matched_by: 'key' | 'strong' | 'none';
  confidence?: number;
  question?: string;
  mention?: boolean;
  undo?: string;
  person: string | null;
  linked: boolean;
  merge: string | null;
};

type Row = { id: string; seq: number | null; version: number; fields: Record<string, unknown> };
type FieldShape = { id: string; type: string; of?: string; to?: string; values?: readonly string[]; retired?: boolean; derived?: unknown; unique?: boolean };
type DeclaredList<F> = Role<F> & { declaredFields: readonly FieldShape[] };

export type PeopleDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  /** The list playing `meets:` with its declared fields, or `undefined` when there is none. */
  list: DeclaredList<MeetsFields> | undefined;
  /** The list playing `org:`, or `undefined`. */
  orgs?: DeclaredList<OrgFields> | undefined;
  /** The row id of the project the caller's run is in, or `null`. */
  project: () => string | null;
  /** A row as the record addresses it, `people#3`. Never shown to a person: question bodies only. */
  nameOf: (id: string) => string;
  /** A row's own name, `Ada Lovelace`, or `null`. What every sentence says. */
  titleOf: (id: string) => string | null;
  /** The write path, as the caller. With `version`, compare-and-set on that row; with `batch` and `note`, as a group. */
  write: (register: string, ref: string | null, patch: Record<string, unknown>, opts?: { version?: number; batch?: string; note?: string }) => Result<Row>;
  /** Open a suggestion, signed as the caller. */
  propose: (p: Proposal) => Result<{ id: string }>;
  /** Whether a member other than the owner made this row, so nobody merges it but by asking them. */
  othersRow?: (id: string) => boolean;
  /** Whether a live row holding money points at this one. */
  moneyAt?: (id: string) => boolean;
  /** Run writes so a refusal takes back every one of them (`tx.ts`'s `attempt`). */
  attempt?: <T>(fn: () => Result<T>) => Result<T>;
  /**
   * Whether a member is meeting somebody at their own keyboard, signed in as themselves and not through a token. What
   * they type is believed whatever its source says, unless it says it arrived (`mail from …`). Left out, only the
   * sources `TRUSTED` names are.
   */
  typed?: boolean;
  /**
   * Whether the caller is a key: an agent's run or a script, never a person at their keyboard (research-audit-21 H2).
   * Nothing a key says is believed outright, whatever its source says: `session in braindog` from a key is held to a
   * commit's word, folding only into somebody met in commits alone and carrying nothing onto anybody known.
   */
  token?: boolean;
  /**
   * The remote of the repository the caller's run is in (`github.com/Brightloom-Infotech/Fanline`), or `null`. What
   * names an organisation asked about from its people's addresses when the remote's owner and the domain agree.
   */
  remote?: () => string | null;
  /**
   * The address the record's own person signs in with, or `null`. When more than one row is marked as him, the one
   * holding it is the one kept. Left out or `null`, the addresses the record mirrors for its owners are read instead.
   */
  ownAddress?: () => string | null;
};

/** Where a part lives in a row's JSON, for a bound `json_extract` path. */
const path = (field: string): string => `$.${field}`;

const HANDLE = /^([a-z][a-z0-9.-]*):@?([^\s:@][^\s]*)$/;

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The later of a day and what a row holds, `undefined` for neither; a value that is not a day counts as none. */
const later = (a: unknown, b: unknown): string | undefined => {
  const days = [a, b].filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return days.at(-1);
};

/** The `met` lines of two lists as one, oldest first, and no more than the cap. Lines start with their day, so they sort. */
/* Ordered by the date alone, and stably, so two meetings on one day keep the order they happened in
   and the cap drops the oldest, never the newest. */
const metLines = (...lists: string[][]): string[] =>
  [...new Set(lists.flat())].sort((a, b) => (a.slice(0, 10) < b.slice(0, 10) ? -1 : a.slice(0, 10) > b.slice(0, 10) ? 1 : 0)).slice(-MET_CAP);

/**
 * An organisation's name as a key: its words with a web ending and the legal endings one source writes and another does
 * not taken off (`orgWords`), in their own order. `Quartz Apps LLC`, `Quartz Apps, Inc.` and `quartz apps` are one
 * name, as are `Sowbell LLC` and `SOWBELL.COM`, and `Tarnvale Oy` and `TARNVALE`: the ending says how one source writes
 * the company, not which company. Words run together or in another order are not the same name, only a question
 * (`sameWords`). Not `spa` or `lp`, which end ordinary names (`Day Spa`, `Vinyl LP`) as often as a company's.
 */
const orgNameKey = (name: string): string => orgWords(name, NAME_ENDINGS).join(' ');

/** A name with its spaces and punctuation gone, as a login or a local part spells the same person: `teodorvance`. */
const compact = (name: string): string => nameKey(name).replace(/[^\p{L}\p{N}]/gu, '');

/**
 * A handle as one person spells it everywhere: lower case, no `+tag`, no dots, dashes or underscores, and no number on
 * the end, which is what a taken handle grows. `Rohan.Meduri`, `rohanmeduri` and `rohanmeduri24` are one.
 */
const stem = (handle: string): string => handle.toLowerCase().replace(/\+.*$/, '').replace(/[._-]/g, '').replace(/\d+$/, '');

/** The shortest stem that says who somebody is; a shorter one (`kas`, `sam`, `owen`) is shared by too many people. */
const STEM_LEAST = 5;

/**
 * The short forms a person's handle takes from a name of two or more words: the first name and the last's initial
 * (`farahq`, `mohank`), and the first's initial and the last name (`tlindqvist`). None shorter than a stem.
 */
function shortForms(name: string): string[] {
  const words = nameKey(name).split(' ').map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w !== '');
  if (words.length < 2) return [];
  const [first, last] = [words[0]!, words.at(-1)!];
  if (first.length < 2 || last.length < 2) return [];
  return [`${first}${last[0]}`, `${first[0]}${last}`].filter((f) => f.length >= STEM_LEAST);
}

/**
 * A source that is text anybody could have written: a mail as it arrived, a bank text, an import, a message. What the
 * owner wrote himself (`mail to …`, a note, a commit in his own repository) is not.
 */
const ARRIVED = /^\s*(?:(?:e-?)?mail\s*(?::|from\b)|bank\b|import(?:ed)?\b|sms\b|(?:text\s+)?message\s+from\b|text\s+from\b|whatsapp\b|arrival\b|arrived\s+in\b|inbox\b|forwarded\b)/iu;

/**
 * THE SOURCES THAT ARE BELIEVED, and the only ones (audit 19 M1): a note the owner wrote, and an agent session's own run
 * (`session in braindog`, `run handoff on Fanline`). Everything else is text anybody could have written, so a caller
 * relaying a Slack message, a calendar invite or a pasted transcript is held to the arrival rules however it words it.
 */
const TRUSTED = /^\s*(?:(?:a|an|the|this|that|my|his|her|their|our)\s+)?(?:notes?|sessions?|runs?|handoffs?)\b/iu;

/**
 * Words anywhere in a source that say a believed one is relaying somebody else's text: `a run reading the inbox`, and a
 * run reading a commit's author or a git log, which anybody who can push wrote (research-audit-21 H2).
 */
const RELAYED =
  /\b(?:e-?mails?|mail|inbox|forwarded|bank|imports?|imported|sms|texts?|messages?|whatsapp|slack|dms?|discord|telegram|calendar|invites?|issues?|pull\s+requests?|prs?|tickets?|transcripts?|pasted|paste|arrival|arrived|webhook|tweets?|linkedin|commits?|git|authors?|co-authored|logs?)\b/iu;

/** A commit, whose author anybody who can push may write as anyone (audit 19 H1). */
const COMMIT = /^\s*commits?\b/iu;

/**
 * How a met line says a key's word, held to a commit's (research-audit-21 H2): `an agent said: session in braindog`.
 * Read back as a commit's line, so a person a key made is folded later only as somebody met in commits alone.
 */
const AGENT_SAID = 'an agent said:';

/** A met line's source that was a commit's word, or a key's held to one. */
const COMMIT_WORD = /^\s*(?:commits?\b|an agent said:)/iu;

/**
 * What a meeting's source may prove. `trusted` folds and carries, `untrusted` does neither, and `commit` is believed
 * on a key somebody holds and is otherwise a person of their own, folded only into somebody met in commits alone.
 */
export type Trust = 'trusted' | 'commit' | 'untrusted';

/**
 * A KEY IS NEVER `trusted` (research-audit-21 H2): it names its own source, so a suggest-only token that read a forged
 * commit and says `session in braindog` would otherwise fold and carry keys onto a real person. What a key would have
 * been believed on is held to a commit's word instead.
 */
export function trustOf(source: string | undefined, where: string | undefined, flagged: boolean, typed: boolean, token = false): Trust {
  if (flagged) return 'untrusted';
  const given = source ?? where ?? '';
  const said = [source, where].filter((t): t is string => t !== undefined);
  if (said.some((t) => ARRIVED.test(t))) return 'untrusted';
  if (COMMIT.test(given)) return 'commit';
  const believed = (typed && !token) || (TRUSTED.test(given) && !said.some((t) => RELAYED.test(t)));
  if (!believed) return 'untrusted';
  return token ? 'commit' : 'trusted';
}

/** An address anywhere in a text, with its domain as the first group. */
const ADDRESS = /[^\s<>()[\]"',;:]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/giu;

/** A text with every address said as its domain: `mail from ada@x.com` is `mail from x.com`. */
const unaddressed = (text: string): string => text.replace(ADDRESS, (_all, domain: string) => domain.toLowerCase()).replace(/\s+/g, ' ').trim();

/** A text cut to `most` characters at a word, with an ellipsis when it was cut. */
function clip(text: string, most = SOURCE_MOST): string {
  if (text.length <= most) return text;
  const cut = text.slice(0, most - 1);
  const word = cut.lastIndexOf(' ');
  return `${(word > most / 2 ? cut.slice(0, word) : cut).trimEnd()}…`;
}

/** A name with any address in it taken out (`Ada <ada@x.com>` is `Ada`), or `undefined` when nothing else was said. */
function nameOnly(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const bare = raw.replace(ADDRESS, ' ');
  const said = bare === raw ? raw : bare.replace(/<\s*>|\(\s*\)|\[\s*\]/g, ' ');
  const name = said.replace(/\s+/g, ' ').trim();
  return name === '' ? undefined : name;
}

/** The source a met line holds: what follows its day. A line with no day is all source (L3). */
const sourceOfLine = (line: string): string => (line.includes(' · ') ? line.slice(line.indexOf(' · ') + 3) : line);

/** What `meet` was told, read and checked. */
type Said = {
  name?: string;
  email?: string;
  handle?: string;
  keys: string[];
  kind: 'person' | 'organisation';
  org?: string;
  domain?: string;
  role?: string;
  source: string;
  /** Text anybody could have written: no strong merge, no key carried onto anybody, no address folded into anybody. */
  untrusted: boolean;
  /** A commit: believed on a key somebody holds, and otherwise folded only into somebody met in commits alone. */
  commit: boolean;
  /** Meet only somebody the record has reason to know (`MeetArgs.only`). */
  only?: 'known';
};

function normalise(args: MeetArgs, typed = false, token = false): Result<Said> {
  const text = (v: unknown, at: string): Result<string | undefined> =>
    v === undefined || v === null ? ok(undefined) : typeof v === 'string' ? ok(v.trim() || undefined) : no('VALUE_MALFORMED', `${at} takes a string.`, { at });

  const read: Record<string, string | undefined> = {};
  for (const at of ['where', 'source', 'name', 'email', 'handle', 'org', 'domain', 'role'] as const) {
    const got = text((args as Record<string, unknown> | undefined)?.[at], at);
    if (!got.ok) return got as Result<never>;
    read[at] = got.value;
  }
  /* THE SOURCE WINS OVER WHERE (M2): a mail rule says `where: 'mail: <subject>'` beside `source: 'mail from <domain>'`,
     and a subject in every met line put the mail's words, and its addresses, in the record and in front of a model.
     Either is clipped to a phrase and says an address only as its domain. */
  const given = read.source ?? read.where;
  if (given === undefined) return no('REQUIRED_MISSING', 'Say where they were met, as commit 4464966 in braindog.', { at: 'where' });
  const source = clip(unaddressed(given));
  if (args.untrusted !== undefined && typeof args.untrusted !== 'boolean')
    return no('VALUE_MALFORMED', 'untrusted is true or false.', { at: 'untrusted' });
  const trust = trustOf(read.source, read.where, args.untrusted === true, typed, token);
  const only = (args as { only?: unknown }).only;
  if (only !== undefined && only !== null && only !== 'known')
    return no('VALUE_MALFORMED', "only takes known, to meet nobody the record has no reason to know.", { at: 'only', allowed: ['known'] });

  const kind = args.kind ?? 'person';
  if (kind !== 'person' && kind !== 'organisation')
    return no('VALUE_MALFORMED', 'kind is person or organisation.', { at: 'kind', allowed: ['person', 'organisation'] });

  const keys: string[] = [];
  if (args.keys !== undefined) {
    if (!Array.isArray(args.keys)) return no('VALUE_MALFORMED', 'keys takes a list of kind:value, as github:ada.', { at: 'keys' });
    for (const [i, raw] of (args.keys as unknown[]).entries()) {
      const key = typeof raw === 'string' ? keyFrom(raw) : null;
      if (key === null) return no('VALUE_MALFORMED', 'A key is kind:value, as email:ada@example.com, github:ada or bank:chillout.', { at: `keys[${i}]` });
      if (!keys.includes(key)) keys.push(key);
    }
  }

  /* A RAW `From` HEADER IS READ INTO ITS TWO HALVES, so a mail rule passing the header whole meets the sender and not a
     refusal. A name in the header is the sender's only when nobody said one. */
  /* A NAME IS NEVER AN ADDRESS (M1): one written into the name (`ada@x.com <ada@x.com>`, `Ada (ada@x.com)`) is taken out,
     and a name that was only an address is no name. */
  let name = nameOnly(read.name);
  let email: string | undefined;
  if (read.email !== undefined) {
    const from = parseFrom(read.email);
    if (from === null) return no('VALUE_MALFORMED', 'email takes one address, as name@example.com.', { at: 'email' });
    email = from.address;
    name ??= nameOnly(from.name ?? undefined);
  }

  let handle: string | undefined;
  if (read.handle !== undefined) {
    const m = HANDLE.exec(read.handle.toLowerCase());
    if (!m) return no('VALUE_MALFORMED', 'A handle is provider:name, as github:ada.', { at: 'handle' });
    handle = `${m[1]}:${m[2]}`;
  }
  let domain: string | undefined;
  if (read.domain !== undefined) {
    domain = registrable(read.domain) ?? undefined;
    if (domain === undefined && !isPublicMail(read.domain.toLowerCase()))
      return no('VALUE_MALFORMED', 'domain takes a domain an organisation registered, as brightwell.example.', { at: 'domain' });
  }

  if (name === undefined && email === undefined && handle === undefined && keys.length === 0 && domain === undefined)
    return no('REQUIRED_MISSING', 'Say who they are: a name, an email or a handle.', { at: 'name' });

  return ok({
    source,
    untrusted: trust === 'untrusted',
    commit: trust === 'commit',
    ...(only === 'known' ? { only } : {}),
    kind,
    keys,
    ...(name === undefined ? {} : { name }),
    ...(email === undefined ? {} : { email }),
    ...(handle === undefined ? {} : { handle }),
    ...(read.org === undefined ? {} : { org: read.org }),
    ...(domain === undefined ? {} : { domain }),
    ...(read.role === undefined ? {} : { role: read.role }),
  });
}

/** Whether a declared list has every part it must, with a field that plays it. A refusal names the first that is not. */
function partsFault<F extends object>(list: DeclaredList<F>, role: 'meets' | 'org'): Result<never> | null {
  const at = list.fields as Partial<Record<string, string>>;
  const own = list.register;
  for (const part of PARTS[role]) {
    const field = at[part.part];
    if (field === undefined && part.optional === true && (list.declared || part.later === true)) continue;
    if (field === undefined || !plays(part, list.declaredFields.find((f) => f.id === field)))
      return no(
        'FIELD_UNKNOWN',
        list.declared
          ? `${own} has no ${field ?? part.part} field that is ${part.says}, which its ${role}: names for ${part.part}. Nothing was written.`
          : `${own} has no ${part.part} field that is ${part.says}, which meet writes, and it declares no ${role}: naming another. Nothing was written.`,
        { at: part.part },
      );
  }
  return null;
}

/** A row of the list that is neither deleted nor folded into another. Two parameters, bound by `live`. */
const LIVE = 'register = ? AND deleted_at IS NULL AND (? IS NULL OR json_extract(fields, ?) IS NULL)';
const live = (register: string, mergedInto: string | undefined): [string, string | null, string] => [
  register,
  mergedInto === undefined ? null : path(mergedInto),
  path(mergedInto ?? '_none'),
];

const hydrate = (r: { id: string; seq: number | null; version: number; fields: string }): Row => ({
  id: r.id,
  seq: r.seq,
  version: Number(r.version),
  fields: JSON.parse(r.fields) as Record<string, unknown>,
});

const rowById = (sql: Sql, id: string): Row | null => {
  const r = sql.one<{ id: string; seq: number | null; version: number; fields: string }>('SELECT id, seq, version, fields FROM entry WHERE id = ? AND deleted_at IS NULL', id);
  return r ? hydrate(r) : null;
};

/** The answer for a name met with nothing that identifies it. */
const mention = (): Met => ({ row: null, created: false, matched_by: 'none', mention: true, person: null, linked: false, merge: null });

export function meet(deps: PeopleDeps, args: MeetArgs): Result<Met> {
  const list = deps.list;
  const said = normalise(args, deps.typed === true, deps.token === true);
  /* WHICH LIST, FIRST: a person's, unless they said organisation or the address is a shared inbox or a machine. */
  const toOrg = said.ok && (said.value.kind === 'organisation' || (said.value.email !== undefined && isOrganisationAddress(said.value.email)));
  if (!toOrg) {
    if (!list) return no<Met>('REGISTER_UNKNOWN', 'No list declares meets:, so nobody can be met. Nothing was written.', { at: 'register' });
    const fault = partsFault(list, 'meets');
    if (fault) return fault;
  }
  if (!said.ok) return said as Result<Met>;
  const s = said.value;
  if (s.handle !== undefined && !toOrg && list!.fields.handles === undefined && list!.fields.keys === undefined)
    return no<Met>('FIELD_UNKNOWN', `${list!.register}'s meets: names no handles, so there is nowhere to keep a handle. Nothing was written.`, { at: 'handle' });
  return toOrg ? meetOrg(deps, s, s.kind === 'person') : meetPerson(deps, list!, s);
}

/**
 * The dated line a meeting leaves, and the day it is. A meeting said to be untrusted whose source does not say so is
 * kept as `arrived in …`, and a key's word held to a commit's as `an agent said: …`, so the line still tells `vouched`
 * and `commitsOnly` what it was when the caller is long gone.
 */
const lineOf = (deps: PeopleDeps, s: Said): { day: string; line: string } => {
  const day = instant(deps.nowMs).slice(0, 10);
  const said =
    s.untrusted && !ARRIVED.test(s.source) ? clip(`arrived in ${s.source}`) : s.commit && !COMMIT.test(s.source) ? clip(`${AGENT_SAID} ${s.source}`) : s.source;
  return { day, line: `${day} · ${said}` };
};

function meetPerson(deps: PeopleDeps, list: DeclaredList<MeetsFields>, s: Said): Result<Met> {
  const at = list.fields;
  const { day, line } = lineOf(deps, s);
  /* NO projects PART, NO PROJECT. The run may well be in one; the list has nowhere to say so. */
  const project = at.projects === undefined ? null : deps.project();
  /* A DOMAIN IS AN ORGANISATION'S KEY, NEVER A PERSON'S: a person holding one would keep it from the organisation. */
  const keys = keysOf({ email: s.email, handle: s.handle, keys: s.keys }).filter((k) => kindOfKey(k) !== 'domain');
  /* A NAME ALONE IS A MENTION, kept with where it was seen, and no row. */
  if (keys.length === 0) {
    noteMention(deps.sql, { name: s.name ?? '', kind: 'person', project, source: s.source, at: instant(deps.nowMs) });
    return ok(mention());
  }

  const found = holders(deps.sql, list.register, keys);
  const hit = found[0] ? rowById(deps.sql, found[0].id) : null;
  /* NOBODY NEW FROM A RULE THAT SAID `only: 'known'`: a sender the record has no reason to know is a sighting, not a
     person, and nothing about them is written onto anybody. */
  if (!hit && s.only === 'known' && !knownAddress(deps, list, keys)) {
    noteMention(deps.sql, { name: s.name ?? nameFromKeys(keys), kind: 'person', project, source: s.source, at: instant(deps.nowMs) });
    return ok(mention());
  }
  /* AN ARRIVAL NOBODY ANSWERS TO THAT LOOKS LIKE SOMEBODY KNOWN (H1): `From: "Teodor Vance" <teodorvance@evil.test>`
     made a row the strong rules folded into the real Teodor, and his keys then answered for whoever sent it. */
  if (!hit && s.untrusted) {
    const offered = offerArrival(deps, list, s, keys, project);
    if (offered !== null) return offered;
  }
  const org = orgFor(deps, s, keys);
  let written: Result<Row>;
  let linked = false;
  if (hit) {
    const f = hit.fields;
    const patch: Record<string, unknown> = { [at.met]: metLines(listOf(f[at.met]), [line]) };
    /* AN EXACT KEY MATCH FROM TEXT ANYBODY COULD HAVE WRITTEN ADDS ITS LINE AND NOTHING ELSE (research-audit-21 M10): no
       project, no day in touch, no key, no name, no organisation, since a spoofed From must not move the real person. */
    if (!s.untrusted) {
      if (at.projects !== undefined) {
        const projects = listOf(f[at.projects]);
        if (project !== null && !projects.includes(project)) {
          patch[at.projects] = [...projects, project];
          linked = true;
        }
      }
      if (at.in_touch !== undefined && later(day, f[at.in_touch]) === day) patch[at.in_touch] = day;
      /* AND ONE BY A COMMIT ADDS ITS LINE, ITS PROJECT AND ITS DAY (M9): anybody who can push may sign with this key and
         any other, so the keys, the name and the other names it says are not carried onto the person who holds it. The
         organisation their own address is at still is, which the address already says (`orgFor`). */
      if (org !== null && at.org !== undefined && textOf(f[at.org]) === undefined) patch[at.org] = org;
    }
    if (!s.untrusted && !s.commit) {
      Object.assign(patch, carryKeys(deps, list, hit, s, keys));
      if (s.name !== undefined && typeof f[at.name] !== 'string') patch[at.name] = s.name;
      const alias = aliasOf(list, hit, s.name, keys);
      if (alias !== null) patch[at.aliases!] = [...listOf(f[at.aliases!]), alias];
    }
    written = deps.write(list.register, hit.id, patch, { version: hit.version });
  } else {
    linked = project !== null;
    const placed = placeKeys(list, keys, s);
    written = deps.write(list.register, null, {
      [at.name]: s.name ?? nameFromKeys(keys),
      ...placed,
      ...(project === null || at.projects === undefined ? {} : { [at.projects]: [project] }),
      ...(at.in_touch === undefined ? {} : { [at.in_touch]: day }),
      ...(at.org === undefined || org === null ? {} : { [at.org]: org }),
      [at.met]: [line],
    });
  }
  if (!written.ok) return written as Result<Met>;
  const person = written.value;
  sourceKeys(deps.sql, person.id, keys, s.source);

  /* THE MEETING BRIDGED TWO PEOPLE THE RECORD HELD APART: one key was one row's and another key another's. Never
     joined on its own, since one wrong key would fold two people; asked. */
  const bridged = found.slice(1).map((h) => rowById(deps.sql, h.id)).filter((r): r is Row => r !== null);
  /* A COMMIT FOLDS ONLY SOMEBODY MET IN COMMITS ALONE INTO SOMEBODY MET IN COMMITS ALONE (audit 19 H1): two commits as
     `Teodor Vance` are one author's spellings, but one forged as him beside the Teodor the owner typed is asked about.
     A key the other row already holds would have been a key match, never a fold. */
  const folds: Folds = s.untrusted ? 'none' : s.commit ? 'commits' : 'any';
  const settled = settle(deps, list, person, bridged, folds);
  if (!settled.ok) return settled as Result<Met>;
  const { kept, undo, question, touched } = settled.value;
  /* EVERY QUESTION NAMING SOMEBODY THIS MEETING MOVED IS BROUGHT UP TO THEM, so a later commit of the same person never
     leaves the owner a question he cannot accept. */
  const fresh = reask(deps, list, [person.id, ...touched]);
  if (!fresh.ok) return fresh as Result<Met>;
  const final = kept ?? rowById(deps.sql, person.id) ?? person;
  /* AND THE OWNER HELD TWICE IS ASKED ABOUT, whoever this meeting was. */
  const me = askSelf(deps, list);
  if (!me.ok) return me as Result<Met>;
  /* SOMEBODY THE RECORD VOUCHES FOR AT A DOMAIN NOBODY HOLDS may make it a company worth asking about. Mail never does. */
  if (!s.untrusted) {
    const company = askDomainOrgs(deps, list, final);
    if (!company.ok) return company as Result<Met>;
  }
  return ok({
    row: metRow(deps, list.register, final),
    created: !hit && kept === null,
    matched_by: hit ? 'key' : kept !== null ? 'strong' : 'none',
    ...(hit ? { confidence: 1 } : kept !== null ? { confidence: 0.95 } : {}),
    ...(question === null ? {} : { question }),
    ...(undo === null ? {} : { undo }),
    person: deps.nameOf(final.id),
    linked,
    merge: question,
  });
}

/**
 * The name a person met with no name is added under: their login, or their address's local part, never the whole
 * address (M1). A key that is neither is said by its kind and its last characters, and still names nobody else.
 */
function nameFromKeys(keys: readonly string[]): string {
  const login = keys.find((k) => kindOfKey(k) === 'github');
  if (login !== undefined) return valueOfKey(login);
  const mail = keys.find((k) => kindOfKey(k) === 'email');
  if (mail !== undefined) return valueOfKey(mail).split('@')[0]!;
  const first = keys[0]!;
  const value = valueOfKey(first);
  return kindOfKey(first) === 'phone' ? `a phone number ending ${value.slice(-4)}` : value;
}

/**
 * The other name a person was just met under, worth keeping as an alias, or `null`: one the row does not already go by,
 * and not merely the handle it was met with (`rohanmeduri` beside `rohanmeduri@…` says nothing new).
 */
function aliasOf(list: DeclaredList<MeetsFields>, row: Row, name: string | undefined, keys: readonly string[]): string | null {
  const at = list.fields;
  if (at.aliases === undefined || name === undefined) return null;
  const said = nameKey(name);
  if (said === '' || namesOf(list, row).includes(said)) return null;
  if (listOf(row.fields[at.aliases]).length >= ALIASES_MOST) return null;
  const handles = new Set([...stemsOf(list, row), ...keys.map((k) => stem(valueOfKey(k).split('@')[0]!))]);
  return said.includes(' ') || !handles.has(stem(compact(said))) ? name : null;
}

const metRow = (deps: PeopleDeps, register: string, row: Row): MetRow => ({
  register,
  id: row.id,
  seq: row.seq,
  name: deps.titleOf(row.id) ?? String(row.fields[deps.list?.fields.name ?? 'name'] ?? ''),
});

/**
 * Where a new person's keys go: the email field takes a real mailbox, `handles` takes logins, and `keys` the rest. A
 * key the list has nowhere for is not written, and the person simply does not answer to it.
 */
function placeKeys(list: DeclaredList<MeetsFields>, keys: readonly string[], s: { email?: string }): Record<string, unknown> {
  const at = list.fields;
  const out: Record<string, unknown> = {};
  const emailKey = keys.find((k) => kindOfKey(k) === 'email');
  /* THE ADDRESS AS SAID, since the key folds Gmail's dots and a person reads their own spelling. */
  if (emailKey !== undefined && s.email !== undefined && keyOf('email', s.email) === emailKey) out[at.email] = s.email;
  const rest = keys.filter((k) => !(k === emailKey && out[at.email] !== undefined));
  const handles = rest.filter((k) => kindOfKey(k) !== 'email' && kindOfKey(k) !== 'bank' && kindOfKey(k) !== 'domain');
  const others = rest.filter((k) => !handles.includes(k));
  if (at.handles !== undefined && handles.length > 0) out[at.handles] = handles;
  const kept = at.handles === undefined ? rest : others;
  if (at.keys !== undefined && kept.length > 0) out[at.keys] = kept;
  return out;
}

/** What a matched person gains of the keys this meeting carried, in the fields it already has. Nothing is replaced. */
const carryKeys = (deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, row: Row, s: { email?: string }, keys: readonly string[]): Record<string, unknown> =>
  keysPatch(deps, list, row, keys, s);

/**
 * The patch that gives a person the keys they lack, each in the field it belongs in, the address as it was said when
 * there is one (`s.email`). Only a key nobody else answers to, so it is also what an offer of a new address writes.
 */
function keysPatch(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, row: Row, keys: readonly string[], s: { email?: string }): Record<string, unknown> {
  const at = list.fields;
  const f = row.fields;
  const has = new Set(keysOf({ email: textOf(f[at.email]), handles: at.handles === undefined ? [] : listOf(f[at.handles]), keys: at.keys === undefined ? [] : listOf(f[at.keys]) }));
  /* ONLY A KEY NOBODY ELSE ANSWERS TO: one held by another live row stays theirs, and the bridge is asked about. */
  const fresh = keys.filter((k) => !has.has(k) && (holderOf(deps.sql, k)?.id ?? row.id) === row.id);
  const placed = placeKeys(list, fresh, s);
  const patch: Record<string, unknown> = {};
  if (placed[at.email] !== undefined && textOf(f[at.email]) === undefined) patch[at.email] = placed[at.email];
  else if (placed[at.email] !== undefined) {
    const into = at.keys ?? at.handles;
    if (into !== undefined) placed[into] = [...listOf(placed[into]), keyOf('email', String(placed[at.email]))!];
  }
  for (const part of [at.handles, at.keys]) {
    if (part === undefined || placed[part] === undefined) continue;
    const now = listOf(f[part]);
    const union = [...new Set([...now, ...listOf(placed[part])])];
    if (union.length > now.length) patch[part] = union;
  }
  return patch;
}

/**
 * The organisation a person is with, as a row id, or `null`: the one named, or the one whose domain their address is
 * at. Only one the record already holds, unless they named a domain, which is a key and may add one.
 *
 * UNDER THE MEETING'S OWN TRUST (research-audit-21 H1): a mail or a commit naming an organisation meets it as `meetOrg`
 * meets any such text, a line on one already held and nothing carried onto it, and puts nobody in it: `pat@evil.test`
 * saying she is with Stripe is one of Stripe's lines, never one of its people. The domain her own address is at says.
 */
function orgFor(deps: PeopleDeps, s: Said, keys: readonly string[]): string | null {
  const orgs = deps.orgs;
  if (!orgs || deps.list?.fields.org === undefined) return null;
  if (s.domain !== undefined || s.org !== undefined) {
    const met = meetOrg(deps, { kind: 'organisation', keys: [], source: s.source, untrusted: s.untrusted, commit: s.commit, ...(s.only === undefined ? {} : { only: s.only }), ...(s.org === undefined ? {} : { name: s.org }), ...(s.domain === undefined ? {} : { domain: s.domain }) }, false);
    if (met.ok && met.value.row && !s.untrusted && !s.commit) return met.value.row.id;
  }
  const mail = keys.find((k) => kindOfKey(k) === 'email');
  const domain = mail === undefined ? null : registrable(valueOfKey(mail));
  if (domain === null) return null;
  const held = holderOf(deps.sql, `domain:${domain}`);
  return held !== null && held.register === orgs.register ? held.id : null;
}

/**
 * An organisation: matched by a key (its domain, a payee as a bank writes it, a shared inbox) or by its name with the
 * legal ending folded, which for an organisation is a key too; added only when it carries a key the list can keep.
 *
 * `rerouted` IS A PERSON'S MEETING THAT TURNED OUT TO BE A SHARED INBOX, and with no list of organisations it is only a
 * mention: it never falls back to making a person.
 */
function meetOrg(deps: PeopleDeps, s: Said, rerouted: boolean): Result<Met> {
  const orgs = deps.orgs;
  if (!orgs) {
    if (rerouted) {
      noteMention(deps.sql, { name: s.name ?? s.email ?? '', kind: 'organisation', project: deps.project(), source: s.source, at: instant(deps.nowMs) });
      return ok(mention());
    }
    return no<Met>('REGISTER_UNKNOWN', 'No list declares org:, so no organisation can be met. Nothing was written.', { at: 'kind' });
  }
  const fault = partsFault(orgs, 'org');
  if (fault) return fault;
  const at = orgs.fields;
  const { line } = lineOf(deps, s);
  const project = at.projects === undefined ? null : deps.project();

  const fromMail = s.email === undefined ? undefined : (registrable(s.email.split('@')[1] ?? '') ?? undefined);
  const domain = s.domain ?? fromMail;
  /* A SHARED INBOX IS THE ORGANISATION'S KEY; GITHUB'S PRIVATE ADDRESS NEVER REACHES HERE, being a person's. */
  const keys = keysOf({ keys: s.keys, domain, email: s.email !== undefined && githubOfAddress(s.email) === null ? s.email : undefined, handle: s.handle });
  const said = rerouted ? senderName(s.name, domain) : s.name;
  const name = said ?? domain ?? (keys[0] === undefined ? undefined : valueOfKey(keys[0]));

  let hit = holders(deps.sql, orgs.register, keys)[0];
  if (!hit && name !== undefined) {
    const named = byOrgName(deps.sql, orgs, name);
    if (named) hit = { id: named.id, keys: [] };
  }
  const row = hit ? rowById(deps.sql, hit.id) : null;
  const kind = kindValue(orgs, s.role);
  let written: Result<Row>;
  if (row) {
    const f = row.fields;
    const patch: Record<string, unknown> = {};
    if (at.met !== undefined) patch[at.met] = metLines(listOf(f[at.met]), [line]);
    /* WHAT A MEETING WOULD GIVE THE ORGANISATION: a domain where it has none, and keys nobody holds. */
    const newDomain = at.domain !== undefined && domain !== undefined && textOf(f[at.domain]) === undefined && holderOf(deps.sql, `domain:${domain}`) === null;
    const now = at.keys === undefined ? [] : listOf(f[at.keys]);
    const fresh = at.keys === undefined ? [] : keys.filter((k) => !k.startsWith('domain:') && !now.includes(k) && holderOf(deps.sql, k) === null);
    if (!s.untrusted && !s.commit) {
      if (at.projects !== undefined && project !== null && !listOf(f[at.projects]).includes(project)) patch[at.projects] = [...listOf(f[at.projects]), project];
      if (newDomain) patch[at.domain!] = domain;
      if (at.kind !== undefined && kind !== undefined && textOf(f[at.kind]) === undefined) patch[at.kind] = kind;
      if (fresh.length > 0) patch[at.keys!] = [...now, ...fresh];
    }
    if (Object.keys(patch).length === 0) return ok(orgMet(deps, orgs.register, row, false));
    written = deps.write(orgs.register, row.id, patch, { version: row.version });
    if (!written.ok) return written as Result<Met>;
    const fresher = reaskOrgs(deps, orgs, [row.id]);
    if (!fresher.ok) return fresher as Result<Met>;
    /* A MAIL, A BANK TEXT OR A COMMIT MEETING AN ORGANISATION ALREADY HELD WRITES ITS LINE AND NOTHING ELSE (research-
       audit-21 H1): `org: "Stripe"` with `domain: evil.test` must not file evil.test's mail under the real Stripe. What
       it would have added is asked once instead. */
    if (s.untrusted || s.commit) {
      const offered = offerOrg(deps, orgs, written.value, s, name, [...(newDomain ? [`domain:${domain}`] : []), ...fresh]);
      if (!offered.ok) return offered as Result<Met>;
      return ok({ ...orgMet(deps, orgs.register, written.value, false), ...(offered.value === null ? {} : { question: offered.value, merge: offered.value }) });
    }
  } else {
    const stored = keys.filter((k) => !(k === `domain:${domain}` && at.domain !== undefined));
    const keepable = (at.domain !== undefined && domain !== undefined) || (at.keys !== undefined && stored.length > 0);
    /* `only: 'known'` ADDS NO ORGANISATION EITHER: one the record keeps is met above, by a key or its name. NOR DOES A
       MACHINE THAT SIGNED A COMMIT (`jenkins@client.example`): anybody may sign as one, and the domain it would claim is
       asked about from the people there instead (`askDomainOrgs`), under a name and not a hostname. */
    if (!keepable || name === undefined || s.only === 'known' || (rerouted && s.commit)) {
      noteMention(deps.sql, { name: name ?? '', kind: 'organisation', project, source: s.source, at: instant(deps.nowMs) });
      return ok(mention());
    }
    written = deps.write(orgs.register, null, {
      [at.name]: name,
      ...(at.domain === undefined || domain === undefined ? {} : { [at.domain]: domain }),
      ...(at.keys === undefined || stored.length === 0 ? {} : { [at.keys]: stored }),
      ...(at.kind === undefined || kind === undefined ? {} : { [at.kind]: kind }),
      ...(at.met === undefined ? {} : { [at.met]: [line] }),
      ...(at.projects === undefined || project === null ? {} : { [at.projects]: [project] }),
    });
  }
  if (!written.ok) return written as Result<Met>;
  sourceKeys(deps.sql, written.value.id, keys, s.source);
  /* A NEW ORGANISATION WHOSE NAME FOLDS TO THE WORDS OF ONE ALREADY HELD is asked about, one question per pair. */
  if (!row) {
    const paired = askOrgPairs(deps, orgs, written.value);
    if (!paired.ok) return paired as Result<Met>;
    if (paired.value !== null) return ok({ ...orgMet(deps, orgs.register, written.value, true), question: paired.value, merge: paired.value });
  }
  return ok(orgMet(deps, orgs.register, written.value, !row));
}

const orgMet = (deps: PeopleDeps, register: string, row: Row, created: boolean): Met => ({
  row: { register, id: row.id, seq: row.seq, name: deps.titleOf(row.id) ?? String(row.fields[deps.orgs?.fields.name ?? 'name'] ?? '') },
  created,
  matched_by: created ? 'none' : 'key',
  ...(created ? {} : { confidence: 1 }),
  person: deps.nameOf(row.id),
  linked: false,
  merge: null,
});

/**
 * The organisation's name in a machine's `From`, or `undefined` when the name there is not the organisation's.
 *
 * A NOTIFICATION IS SIGNED BY WHOEVER ACTED, NOT BY THE SENDER: GitHub writes `"Ada Lovelace" <notifications@github.com>`
 * and Slack `"Teodor (via Slack)"`. So the name is the organisation's only when one of its words is in the domain
 * (`Stripe` at stripe.com, `HSBC UK` at hsbc.co.uk), and the part after "via" is read first.
 */
function senderName(name: string | undefined, domain: string | undefined): string | undefined {
  if (name === undefined || domain === undefined) return name;
  const via = /\(?\bvia\s+([^()]+?)\)?\s*$/i.exec(name)?.[1]?.trim();
  const said = via || name;
  const label = domain.split('.')[0]!.replace(/[^a-z0-9]/g, '');
  const words = nameKey(said).split(' ').map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 3);
  return words.some((w) => label.includes(w) || (label.length >= 3 && w.includes(label))) ? said : undefined;
}

/** The kind an organisation is said to be, when the list's field takes it. */
function kindValue(orgs: DeclaredList<OrgFields>, role: string | undefined): string | undefined {
  if (role === undefined || orgs.fields.kind === undefined) return undefined;
  const field = orgs.declaredFields.find((f) => f.id === orgs.fields.kind);
  const said = role.toLowerCase();
  return field?.type === 'enum' ? (field.values?.includes(said) ? said : undefined) : said;
}

function byOrgName(sql: Sql, orgs: DeclaredList<OrgFields>, name: string): Row | null {
  const want = orgNameKey(name);
  if (want === '') return null;
  const first = want.split(' ')[0]!;
  /* THE NAME AS ITS KEY READS IT, punctuation gone, so `Forgehub, Inc.` is found by `forgehub` and `O'Reilly` by `oreilly`. */
  const bare = "replace(replace(replace(replace(replace(lower(json_extract(fields, ?)), '.', ''), ',', ''), '''', ''), '-', ''), '&', '')";
  return (
    sql
      .all<{ id: string; seq: number | null; version: number; fields: string }>(
        `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND instr(${bare}, ?) > 0 ORDER BY seq`,
        ...live(orgs.register, orgs.fields.merged_into),
        path(orgs.fields.name),
        first,
      )
      .map(hydrate)
      .find((r) => typeof r.fields[orgs.fields.name] === 'string' && orgNameKey(String(r.fields[orgs.fields.name])) === want) ?? null
  );
}

/* ── what is asked about organisations ───────────────────────────────── */

/** A list as a question about it names its rows: by its register, and the field a fold points at the row kept. */
type Keyed = { register: string; fields: { merged_into?: string | undefined } };

/** An organisation's own name, as a sentence says it. */
const orgNameOf = (deps: Pick<PeopleDeps, 'titleOf'>, orgs: DeclaredList<OrgFields>, row: Row): string =>
  deps.titleOf(row.id) ?? textOf(row.fields[orgs.fields.name]) ?? 'an organisation';

/** Every key an organisation's row answers to: its domain and its keys. */
const keysOfOrg = (orgs: DeclaredList<OrgFields>, row: Row): string[] => {
  const at = orgs.fields;
  return keysOf({ domain: at.domain === undefined ? undefined : textOf(row.fields[at.domain]), keys: at.keys === undefined ? [] : listOf(row.fields[at.keys]) });
};

/**
 * What a meeting the record does not believe would have given an organisation it already holds (`fresh`), asked once
 * (research-audit-21 H1, M12): "Is mail from evil.test the Stripe you already know?", the domain said plainly so he sees
 * what a yes files (research-audit-23 M5). Nothing is written until the owner says yes, and an address or a key offered
 * before is never offered again.
 *
 * WHAT THE ORGANISATION ALREADY ANSWERS TO IS NOT ASKED ABOUT: a shared inbox at a domain it holds, and the payee key a
 * bank text spells with the very name it was matched by, which the name files there anyway.
 */
function offerOrg(deps: PeopleDeps, orgs: DeclaredList<OrgFields>, row: Row, s: Said, name: string | undefined, fresh: readonly string[]): Result<string | null> {
  const at = orgs.fields;
  const held = new Set(keysOfOrg(orgs, row).filter((k) => kindOfKey(k) === 'domain').map(valueOfKey));
  const byName = name !== undefined && orgNameKey(name) === orgNameKey(textOf(row.fields[at.name]) ?? '');
  const offered = fresh.filter((k) => {
    if (kindOfKey(k) === 'email') return !held.has(registrable(valueOfKey(k).split('@')[1] ?? '') ?? '');
    if (kindOfKey(k) === 'bank' && byName && keyOf('bank', name!) === k) return false;
    return true;
  });
  if (offered.length === 0) return ok(null);
  const spoken = deps.nameOf(row.id);
  for (const { body, status } of deps.sql.all<{ body: string; status: string }>(
    "SELECT body, status FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = ? AND json_type(body, '$.offer') = 'object'",
    orgs.register,
  )) {
    try {
      const b = JSON.parse(body) as { rows?: { at?: unknown }[]; offer?: { keys?: unknown } };
      if (status === 'open' && b.rows?.[0]?.at === spoken) return ok(null);
      if (listOf(b.offer?.keys).some((k) => offered.includes(k))) return ok(null);
    } catch {
      /* a body nobody can read offered nothing */
    }
  }
  const patch = orgOfferPatch(orgs, row, offered);
  if (Object.keys(patch).length === 0) return ok(null);
  const known = orgNameOf(deps, orgs, row);
  const said = name === undefined || orgNameKey(name) === orgNameKey(known) ? known : name;
  /* THE DOMAIN IS THE QUESTION (research-audit-23 M5): the name and the source are whatever the sender wrote, so the
     sentence leads with the domain a yes files, and what it called itself comes after, never in its place. */
  /* AN ADDRESS IS NOT ITS DOMAIN: a yes on billing@gmail.com files that one address, never all of gmail.com's mail. */
  const hostOf = (k: string): string => {
    const host = valueOfKey(k).split('@')[1] ?? '';
    return registrable(host) ?? host;
  };
  const whole = [...new Set(offered.filter((k) => kindOfKey(k) === 'domain').map(valueOfKey))];
  const loose = offered.filter((k) => kindOfKey(k) === 'email' && hostOf(k) !== '' && !whole.includes(hostOf(k)));
  const hosts = [...new Set(loose.map(hostOf))];
  let question: string;
  if (whole.length + hosts.length > 0) {
    const from = listed([...whole, ...hosts.map((h) => `an address at ${h}`)]);
    const files = listed([...(whole.length > 0 ? [`mail from ${listed(whole)}`] : []), ...(loose.length === 0 ? [] : [loose.length === 1 ? 'that address' : 'those addresses'])]);
    question = `Is mail from ${from} the ${known} you already know? Yes files ${files} under ${known}.${said === known ? '' : ` It was met as ${said}.`}`;
  } else {
    const what = offered.every((k) => kindOfKey(k) === 'bank') ? 'payments written that way' : 'what it was met by';
    question = `Is the ${said} met in ${s.source} the ${known} you already know? Yes files ${what} under ${known}.`;
  }
  const opened = deps.propose({ question, body_kind: 'rowset', body: { register: orgs.register, rows: [{ at: spoken, version: row.version, patch }], offer: { keys: offered } } });
  return opened.ok ? ok(opened.value.id) : (opened as Result<never>);
}

/** The patch that gives an organisation keys it lacks: a domain where it has none, the rest in its keys. */
function orgOfferPatch(orgs: DeclaredList<OrgFields>, row: Row, offered: readonly string[]): Record<string, unknown> {
  const at = orgs.fields;
  const patch: Record<string, unknown> = {};
  const rest: string[] = [];
  for (const k of offered) {
    if (kindOfKey(k) === 'domain' && at.domain !== undefined && textOf(row.fields[at.domain]) === undefined && patch[at.domain] === undefined) patch[at.domain] = valueOfKey(k);
    else if (kindOfKey(k) !== 'domain') rest.push(k);
  }
  if (at.keys !== undefined && rest.length > 0) {
    const now = listOf(row.fields[at.keys]);
    const union = [...new Set([...now, ...rest])];
    if (union.length > now.length) patch[at.keys] = union;
  }
  return patch;
}

/** Legal and web endings a name of an organisation is said with in one place and not another, for `orgWords`. */
const ENDINGS = new Set(['llc', 'ltd', 'limited', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'gmbh', 'ag', 'sa', 'sae', 'plc', 'bv', 'pty', 'pvt', 'fze', 'fzco', 'oy', 'oyj', 'ab', 'aps', 'srl', 'sarl', 'spa', 'nv', 'kk', 'pbc', 'lp', 'llp']);

/** The endings an organisation's name is matched without (`orgNameKey`): every legal one but the two that end ordinary names. */
const NAME_ENDINGS = new Set([...[...ENDINGS].filter((e) => e !== 'spa' && e !== 'lp'), 'private', 'fzllc']);

/**
 * The words an organisation's name folds to, for asking whether two are one: lower case, a web address said as its
 * name (`SOWBELL.COM` is `sowbell`), punctuation gone, and the legal endings off its end. `Lantern AI, PBC` is `lantern
 * ai`, `Tarnvale Oy` is `tarnvale`. A dot after a single letter is an initial, not a web ending: `J.Crew` stays whole.
 * Only a country's two letters or a common web ending is one: `Dr.Oetker` and `Next.Money` keep their second word, so
 * neither is taken for `DR` or `NEXT`.
 */
function orgWords(name: string, endings: ReadonlySet<string> = ENDINGS): string[] {
  const bare = name.replace(/(?<=[\p{L}\p{N}]{2})\.(?:[a-z]{2}|com|net|org|info|biz|edu|gov|app|dev|xyz|tech|shop|store|online|site|cloud)(?:\.[a-z]{2})?(?=$|[\s/])/giu, ' ');
  const words = nameKey(bare)
    .split(' ')
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w !== '');
  while (words.length > 1 && endings.has(words.at(-1)!)) words.pop();
  return words;
}

/** Whether two names of organisations fold to the same words, in any order or run together (`Chill Out`, `Chillout`). */
function sameWords(a: string, b: string): boolean {
  const [x, y] = [orgWords(a), orgWords(b)];
  if (x.length === 0 || y.length === 0) return false;
  if (x.join('') === y.join('') && x.join('').length >= 4) return true;
  return x.length === y.length && [...x].sort().join(' ') === [...y].sort().join(' ');
}

/** The most other organisations one new one is asked about at once. */
const ORG_PAIRS_MOST = 3;

/**
 * A new organisation whose name folds to the words of one already held, by a key the other does not answer to: one
 * question per pair, as people are asked, and never a merge made on its own (research-understanding-judge change 3).
 */
function askOrgPairs(deps: PeopleDeps, orgs: DeclaredList<OrgFields>, row: Row): Result<string | null> {
  const merged = orgs.fields.merged_into;
  const name = textOf(row.fields[orgs.fields.name]);
  if (merged === undefined || name === undefined) return ok(null);
  const words = orgWords(name);
  if (words.length === 0) return ok(null);
  const probe = (words[0]!.length >= 4 ? words[0]! : words.join('')).slice(0, 6);
  const others = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND id <> ? AND instr(replace(lower(json_extract(fields, ?)), ' ', ''), ?) > 0 ORDER BY seq`,
      ...live(orgs.register, merged),
      row.id,
      path(orgs.fields.name),
      probe,
    )
    .map(hydrate)
    .filter((o) => typeof o.fields[orgs.fields.name] === 'string' && sameWords(name, String(o.fields[orgs.fields.name])))
    .filter((o) => deps.othersRow?.(o.id) !== true && !refused(deps, orgs as Keyed, row, o))
    .slice(0, ORG_PAIRS_MOST);
  let first: string | null = null;
  for (const other of others) {
    const drawn = orgPairBody(deps, orgs, other, row);
    if (drawn === null) continue;
    const opened = deps.propose({ question: drawn.question, body_kind: 'rowset', body: drawn.body });
    if (!opened.ok) return opened as Result<never>;
    first ??= opened.value.id;
  }
  return ok(first);
}

/**
 * What a question about two organisations that may be one writes when accepted, and what it says: the newer folded into
 * the older, which gains every key, domain, line and project the newer held.
 */
function orgPairBody(deps: PeopleDeps, orgs: DeclaredList<OrgFields>, a: Row, b: Row): { question: string; body: Record<string, unknown> } | null {
  const at = orgs.fields;
  const merged = at.merged_into;
  if (merged === undefined || a.id === b.id) return null;
  const [keep, fold] = (b.seq ?? 0) < (a.seq ?? 0) ? [b, a] : [a, b];
  const patch: Record<string, unknown> = {};
  const theirs = keysOfOrg(orgs, fold);
  const domain = at.domain === undefined ? undefined : textOf(fold.fields[at.domain]);
  if (at.domain !== undefined && domain !== undefined && textOf(keep.fields[at.domain]) === undefined) patch[at.domain] = domain;
  if (at.keys !== undefined) {
    const now = listOf(keep.fields[at.keys]);
    const moved = theirs.filter((k) => !(kindOfKey(k) === 'domain' && valueOfKey(k) === patch[at.domain ?? '']));
    const union = [...new Set([...now, ...moved])];
    if (union.length > now.length) patch[at.keys] = union;
  }
  if (at.met !== undefined) {
    const lines = metLines(listOf(keep.fields[at.met]), listOf(fold.fields[at.met]));
    if (!same(lines, keep.fields[at.met] ?? [])) patch[at.met] = lines;
  }
  if (at.projects !== undefined) {
    const union = [...new Set([...listOf(keep.fields[at.projects]), ...listOf(fold.fields[at.projects])])];
    if (union.length > listOf(keep.fields[at.projects]).length) patch[at.projects] = union;
  }
  if (at.kind !== undefined && textOf(keep.fields[at.kind]) === undefined && textOf(fold.fields[at.kind]) !== undefined) patch[at.kind] = fold.fields[at.kind];
  const [keepName, foldName] = [orgNameOf(deps, orgs, keep), orgNameOf(deps, orgs, fold)];
  const seen = (r: Row): string[] => (at.met === undefined ? [] : [...new Set(listOf(r.fields[at.met]).map((l) => clip(unaddressed(sourceOfLine(l)))).reverse())].slice(0, 3));
  const body = {
    register: orgs.register,
    rows: [
      { at: deps.nameOf(fold.id), version: fold.version, patch: { [merged]: deps.nameOf(keep.id), deleted_at: instant(deps.nowMs) } },
      ...(Object.keys(patch).length === 0 ? [] : [{ at: deps.nameOf(keep.id), version: keep.version, patch }]),
    ],
    pair: [deps.nameOf(keep.id), deps.nameOf(fold.id)],
    candidates: [keep, fold].map((r) => ({ at: deps.nameOf(r.id), name: orgNameOf(deps, orgs, r), seen: seen(r), ...(r.id === keep.id ? { kept: true } : {}) })),
  };
  const question = `Are ${keepName} and ${foldName} one organisation? Yes keeps ${keepName} and files everything ${foldName} was met by under it.`;
  return { question, body };
}

/**
 * Bring every open question about these organisations up to them, as `reask` does for people: an offer at the version
 * its organisation is now, or taken off the list once what it offered is held; a pair drawn again, or taken off once
 * the two are one or one is gone. A later bank text of the same payee must not leave him a question he cannot accept.
 */
function reaskOrgs(deps: PeopleDeps, orgs: DeclaredList<OrgFields>, ids: readonly string[]): Result<null> {
  const moved = new Set(ids);
  const keyed = orgs as Keyed;
  for (const { id, body: raw } of deps.sql.all<{ id: string; body: string }>(
    "SELECT id, body FROM suggestion WHERE status = 'open' AND body_kind = 'rowset' AND json_extract(body, '$.register') = ? ORDER BY rowid",
    orgs.register,
  )) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const offer = body.offer !== null && typeof body.offer === 'object' ? listOf((body.offer as { keys?: unknown }).keys) : null;
    const pair = Array.isArray(body.pair) ? listOf(body.pair) : null;
    if (offer === null && pair === null) continue;
    const named = (offer !== null ? [String((body.rows as { at?: unknown }[] | undefined)?.[0]?.at ?? '')] : pair!).map((at) => rowAt(deps, keyed, at));
    if (!named.some((r) => r !== null && moved.has(r.id))) continue;
    const ends = named.map((r) => (r === null ? null : liveEnd(deps, keyed, r)));
    if (offer !== null) {
      const row = ends[0] ?? null;
      const patch = row === null ? {} : orgOfferPatch(orgs, row, offer.filter((k) => holderOf(deps.sql, k) === null));
      if (row === null || Object.keys(patch).length === 0) close(deps, id, 'What it offered is settled.');
      else rewrite(deps, id, { ...body, rows: [{ at: deps.nameOf(row.id), version: row.version, patch }] });
      continue;
    }
    const [a, b] = ends;
    const drawn = a == null || b == null ? null : orgPairBody(deps, orgs, a, b);
    if (drawn === null) close(deps, id, 'They were found to be one organisation.');
    else if (JSON.stringify(drawn.body) !== JSON.stringify(body)) rewrite(deps, id, drawn.body);
  }
  return ok(null);
}

/**
 * The people at a domain: every live, unfolded person holding an address there or at a part of it.
 */
function peopleAt(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, domain: string): Row[] {
  const safe = domain.replace(/[\\%_]/g, (c) => `\\${c}`);
  return deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT DISTINCT e.id, e.seq, e.version, e.fields FROM entity_key k JOIN entry e ON e.id = k.row_id
        WHERE k.register = ? AND e.deleted_at IS NULL AND (k.key LIKE ? ESCAPE '\\' OR k.key LIKE ? ESCAPE '\\') ORDER BY e.seq`,
      list.register,
      `email:%@${safe}`,
      `email:%.${safe}`,
    )
    .map(hydrate)
    .filter((r) => textOf(r.fields[list.fields.merged_into]) === undefined);
}

/** Whether a person holds an address at this very domain, not at a part of it (`ops@mail.acme.example` is not). */
const holdsAt = (list: DeclaredList<MeetsFields>, row: Row, domain: string): boolean =>
  keysOfRow(list, row).some((k) => kindOfKey(k) === 'email' && valueOfKey(k).split('@')[1] === domain);

/** The fewest people vouched for at one domain that make it worth asking whether it is an organisation. */
const DOMAIN_PEOPLE_LEAST = 2;

/**
 * The name an organisation asked about from a domain goes by: the owner of the repository the run is in, when its name
 * and the domain's agree and it says more (`Brightloom-Infotech` beside brightloomit.example is Brightloom Infotech),
 * else the domain's own label (`kestrel-uni.example` is Kestrel Uni).
 */
export function domainOrgName(domain: string, remote: string | null): string {
  const label = domain.split('.')[0]!;
  const cap = (w: string): string => (w === '' ? w : `${w[0]!.toUpperCase()}${w.slice(1)}`);
  const owner = remote === null ? undefined : /github\.com[/:]([^/\s]+)\//iu.exec(remote)?.[1];
  if (owner !== undefined) {
    const words = owner.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_\s.]+/).filter((w) => w !== '');
    const first = words[0]?.toLowerCase() ?? '';
    const run = words.join('').toLowerCase();
    const bare = label.replace(/-/g, '');
    /* ONLY WHEN THE OWNER SAYS MORE THAN THE DOMAIN DOES: `lumacraft-ai` beside lumacraft.example is still Lumacraft. */
    if (words.length > 0 && bare !== first && ((first.length >= 4 && bare.startsWith(first)) || (bare.length >= 4 && run.startsWith(bare)))) return words.map(cap).join(' ');
  }
  return label.split('-').filter((w) => w !== '').map(cap).join(' ');
}

/**
 * ORGANISATIONS FROM MAIL DOMAINS (research-understanding-judge change 3). Two or more people the record vouches for at
 * one domain nobody holds is a company it does not keep yet: one question, "Add Brightloom Infotech?", whose yes makes it
 * and links them (`joinOrganisation`). One already kept under that name is offered the domain instead. Never made on its
 * own, never from people only mail vouches for, never for a public mailbox, and asked once per domain.
 */
function askDomainOrgs(deps: PeopleDeps, list: DeclaredList<MeetsFields>, row: Row): Result<string | null> {
  const orgs = deps.orgs;
  if (!orgs || orgs.fields.domain === undefined) return ok(null);
  const domains = [
    ...new Set(
      keysOfRow(list, row)
        .filter((k) => kindOfKey(k) === 'email')
        .map(valueOfKey)
        .filter((a) => githubOfAddress(a) === null && !isOrganisationAddress(a))
        .map((a) => registrable(a.split('@')[1] ?? ''))
        .filter((d): d is string => d !== null),
    ),
  ];
  let first: string | null = null;
  for (const domain of domains) {
    if (holderOf(deps.sql, `domain:${domain}`) !== null) continue;
    const asked = deps.sql.one<{ n: number }>(
      "SELECT 1 AS n FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = ? AND json_extract(body, '$.join.domain') = ? LIMIT 1",
      orgs.register,
      domain,
    );
    if (asked !== undefined) continue;
    /* ONLY WHO THE QUESTION CAN NAME: vouched for, with an address at the domain itself. A subdomain's address is said
       by its own host, and a yes links exactly these (`joinOrganisation`), never one the sentence left out. */
    const people = peopleAt(deps, list, domain).filter((r) => vouched(deps, list, r) && holdsAt(list, r, domain));
    /* ONE PERSON HELD TWICE IS ONE: two rows of one name, or two an open question asks about as one person, count once,
       so the owner and his own other name are never "two people" at his own domain. */
    const together = openAsked(deps, list)
      .filter((q) => q.offer === null)
      .map((q) => new Set(q.members.map((m) => m.id)));
    const groups: Row[][] = [];
    for (const r of people) {
      const name = nameKey(nameOfRow(list, r));
      const group = groups.find((g) => g.some((o) => (name !== '' && nameKey(nameOfRow(list, o)) === name) || together.some((t) => t.has(o.id) && t.has(r.id))));
      if (group) group.push(r);
      else groups.push([r]);
    }
    if (groups.length < DOMAIN_PEOPLE_LEAST) continue;
    const name = domainOrgName(domain, deps.remote?.() ?? null);
    const names = groups.map((g) => nameOfRow(list, g[0]!) || 'someone unnamed');
    const who = names.length <= 3 ? listed(names) : `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
    const kept = byOrgName(deps.sql, orgs, name);
    const join = { domain, people: people.map((r) => deps.nameOf(r.id)) };
    const opened =
      kept === null
        ? deps.propose({
            question: `Add ${name}? ${who} have an address at ${domain}. Yes adds ${name} and puts them in it.`,
            body_kind: 'rowset',
            body: { register: orgs.register, rows: [{ [orgs.fields.name]: name, [orgs.fields.domain]: domain }], join },
          })
        : textOf(kept.fields[orgs.fields.domain]) !== undefined
          ? null
          : deps.propose({
              question: `Is mail from ${domain} from ${orgNameOf(deps, orgs, kept)}? ${who} have an address there. Yes files it under ${orgNameOf(deps, orgs, kept)} and puts them in it.`,
              body_kind: 'rowset',
              body: { register: orgs.register, rows: [{ at: deps.nameOf(kept.id), version: kept.version, patch: { [orgs.fields.domain]: domain } }], join },
            });
    if (opened === null) continue;
    if (!opened.ok) return opened as Result<never>;
    first ??= opened.value.id;
  }
  return ok(first);
}

/**
 * After the owner accepts a question that asked about an organisation from its people's domain: the people it named
 * (`join.people`, kept when it was filed) are put in the organisation that now holds the domain, each only while they
 * are with nobody yet, still vouched for, and still hold an address at the domain itself (research-audit-23 M4). Nobody
 * who arrived after it was asked, nobody only mail vouches for, and no subdomain's address. For the kernel to run after
 * every decision, in its transaction; a question not accepted, not one of these, or one whose domain nobody holds,
 * links nobody.
 *
 * AND AN ACCEPTED "Mark Kas as you?" ASKS ABOUT HIS OTHER ROWS AT ONCE (`askOwnRows`), the record's own step that marks
 * his row (`markOwnRow`) and the tick's "Which of these is you?" included: the second Kas he typed is asked about the
 * moment the first is his, not whenever somebody is next met.
 */
export function joinOrganisation(deps: PeopleDeps, suggestion: string): Result<string[]> {
  const list = deps.list;
  const orgs = deps.orgs;
  if (list && marksSelf(deps, list, suggestion)) {
    const asked = askOwnRows(deps);
    if (!asked.ok) return asked as Result<never>;
  }
  if (!list || !orgs || list.fields.org === undefined) return ok([]);
  /* ONLY ONE HE ACCEPTED: a no leaves its people where they are, whoever holds the domain since. */
  const q = deps.sql.one<{ body: string }>("SELECT body FROM suggestion WHERE id = ? AND body_kind = 'rowset' AND status = 'resolved' AND resolved_as = 'addressed'", suggestion);
  if (!q) return ok([]);
  let domain: unknown;
  let named: string[];
  try {
    const body = JSON.parse(q.body) as { register?: unknown; join?: { domain?: unknown; people?: unknown } };
    if (body.register !== orgs.register) return ok([]);
    domain = body.join?.domain;
    named = listOf(body.join?.people);
  } catch {
    return ok([]);
  }
  if (typeof domain !== 'string') return ok([]);
  const held = holderOf(deps.sql, `domain:${domain}`);
  if (held === null || held.register !== orgs.register) return ok([]);
  const linked: string[] = [];
  for (const at of named) {
    /* THE PERSON AS THEY ARE NOW: one folded since is the row they were folded into, which is them. */
    const raw = rowAt(deps, list, at);
    const person = raw === null ? null : liveEnd(deps, list, raw);
    if (person === null || linked.includes(person.id)) continue;
    if (textOf(person.fields[list.fields.org]) !== undefined || !vouched(deps, list, person) || !holdsAt(list, person, domain)) continue;
    const wrote = deps.write(list.register, person.id, { [list.fields.org]: held.id }, { version: person.version });
    if (!wrote.ok) return wrote as Result<never>;
    linked.push(person.id);
  }
  return ok(linked);
}

/* ── who else they might be ──────────────────────────────────────────── */

/** Every key a person's row answers to: its address, its handles and its keys. */
const keysOfRow = (list: DeclaredList<MeetsFields>, row: Row): string[] => {
  const at = list.fields;
  return keysOf({ email: textOf(row.fields[at.email]), handles: at.handles === undefined ? [] : listOf(row.fields[at.handles]), keys: at.keys === undefined ? [] : listOf(row.fields[at.keys]) });
};

/** A person's identifiers, read off the row: emails as `{local, domain}`, logins, and the org they are with. */
function identity(list: DeclaredList<MeetsFields>, row: Row): { emails: { local: string; domain: string }[]; logins: string[]; org: string | null } {
  const at = list.fields;
  const keys = keysOfRow(list, row);
  const emails = keys
    .filter((k) => kindOfKey(k) === 'email')
    .map((k) => {
      const [local = '', domain = ''] = valueOfKey(k).split('@');
      return { local: local.replace(/\+.*$/, ''), domain };
    });
  return {
    emails,
    logins: keys.filter((k) => kindOfKey(k) === 'github').map(valueOfKey),
    org: at.org === undefined ? null : (textOf(row.fields[at.org]) ?? null),
  };
}

/** A person's name as a sentence says it: an address an older record kept in it is left out (M1). */
const nameOfRow = (list: DeclaredList<MeetsFields>, row: Row): string => nameOnly(textOf(row.fields[list.fields.name])) ?? '';

/** Every name a person goes by, as two names compare: theirs, then each alias. */
function namesOf(list: DeclaredList<MeetsFields>, row: Row): string[] {
  const at = list.fields;
  const said = [textOf(row.fields[at.name]), ...(at.aliases === undefined ? [] : listOf(row.fields[at.aliases]))];
  return [...new Set(said.map(nameOnly).filter((n): n is string => n !== undefined).map(nameKey).filter((n) => n !== ''))];
}

/** A person's handles as stems, those long enough to say who they are: each address's local part, and each login. */
function stemsOf(list: DeclaredList<MeetsFields>, row: Row): Set<string> {
  const i = identity(list, row);
  return new Set([...i.emails.map((e) => e.local), ...i.logins].map(stem).filter((s) => s.length >= STEM_LEAST));
}

/**
 * Whether somebody was ever met other than in text anybody could have written: one met at least once in a commit, a
 * call or a note, or a row an arrival did not make (one a person typed keeps its word after their mail is read). A row
 * an arrival made and only arrivals met since is never folded on the strong rules, so a forged sender who came first
 * cannot take in the real person who comes after (H1).
 */
function vouched(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, row: Row): boolean {
  const lines = listOf(row.fields[list.fields.met]);
  if (lines.some((l) => !ARRIVED.test(sourceOfLine(l)))) return true;
  /* ONE WHOSE CREATE LINE CANNOT BE READ vouches only for a row nobody met. */
  const made = madeLines(deps, list, row);
  return made === null ? lines.length === 0 : !made.some((l) => ARRIVED.test(sourceOfLine(l)));
}

/** The met lines a row was made with, from its create line in the log (the fields whole), or `null` when it cannot be read. */
function madeLines(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, row: Row): string[] | null {
  const made = deps.sql.one<{ to_v: string | null }>("SELECT to_v FROM event WHERE target = ? AND kind = 'create' ORDER BY rowid LIMIT 1", `entry:${row.id}`)?.to_v;
  try {
    return listOf((JSON.parse(made ?? '') as Record<string, unknown>)[list.fields.met]);
  } catch {
    return null;
  }
}

/**
 * Whether somebody was only ever met in commits: made by a meeting, met in one commit at least, and every line that
 * vouches for them, then and since, a commit's. A commit by a key nobody held folds only into such a person, never into
 * one the owner typed or noted (audit 19 H1).
 *
 * A LINE ANYBODY COULD HAVE WRITTEN SAYS NOTHING EITHER WAY: a forged author who then mails in from the address he
 * signed with is still only a commit author, and never becomes somebody the next commit may fold into the real person.
 */
function commitsOnly(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, row: Row): boolean {
  const believed = (ls: string[]) => ls.map(sourceOfLine).filter((l) => !ARRIVED.test(l));
  const lines = believed(listOf(row.fields[list.fields.met]));
  if (lines.length === 0 || !lines.every((l) => COMMIT_WORD.test(l))) return false;
  const made = madeLines(deps, list, row);
  return made !== null && made.length > 0 && believed(made).every((l) => COMMIT_WORD.test(l));
}

/**
 * Whether the record has reason to know somebody by an address nobody holds yet (`only: 'known'`): it is at a domain an
 * organisation the record keeps holds, or the record's own person has written to it. A handle or a bank key says neither.
 */
function knownAddress(deps: PeopleDeps, list: DeclaredList<MeetsFields>, keys: readonly string[]): boolean {
  const mails = keys.filter((k) => kindOfKey(k) === 'email').map(valueOfKey);
  if (mails.length === 0) return false;
  const orgs = deps.orgs?.register;
  for (const mail of mails) {
    const domain = orgs === undefined ? null : registrable(mail);
    const held = domain === null ? null : holderOf(deps.sql, `domain:${domain}`);
    if (held !== null && held.register === orgs) return true;
  }
  return wroteTo(deps, list, mails);
}

/** The most mails naming one address that `wroteTo` reads, newest first. */
const WROTE_READ = 50;

/**
 * Whether the record's own person has written to one of these addresses: a mail that reached the record, that something
 * verified (`UNVERIFIED`), from an address his own row holds, with the address among its recipients. A forged `From`
 * is what the verification is for, so an unverified mail says nothing.
 */
function wroteTo(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, mails: readonly string[]): boolean {
  const mine = new Set(selfRows(deps, list).flatMap((r) => keysOfRow(list, r)).filter((k) => kindOfKey(k) === 'email'));
  if (mine.size === 0) return false;
  const wanted = new Set(mails.map((m) => keyOf('email', m)).filter((k): k is string => k !== null));
  for (const mail of mails) {
    const sent = deps.sql.all<{ headers: string | null }>(
      "SELECT headers FROM inbox_raw WHERE channel = 'email' AND state <> 'erased' AND (reason IS NULL OR reason <> ?) AND instr(lower(headers), ?) > 0 ORDER BY ts DESC LIMIT ?",
      UNVERIFIED,
      mail.toLowerCase(),
      WROTE_READ,
    );
    for (const { headers } of sent) {
      let head: Record<string, unknown>;
      try {
        head = JSON.parse(headers ?? '{}') as Record<string, unknown>;
      } catch {
        continue;
      }
      const from = typeof head.from === 'string' ? parseFrom(head.from) : null;
      if (from === null || !mine.has(keyOf('email', from.address) ?? '')) continue;
      const to = ['to', 'cc', 'bcc'].map((h) => (typeof head[h] === 'string' ? (head[h] as string) : '')).join(', ');
      if ([...to.matchAll(ADDRESS)].some((m) => wanted.has(keyOf('email', m[0]) ?? ''))) return true;
    }
  }
  return false;
}

/**
 * Whether the strong rules say two people are one: a name of two or more words they both go by, and a handle of five
 * or more characters they both hold (`stem`). A login equal to the other's local part is such a handle.
 *
 * THE SAME ORGANISATION IS NOT EVIDENCE OF THE SAME PERSON (M4). Two colleagues called Ahmed Hassan share a domain and a
 * linked company and nothing else; that is a question, and `similar` asks it.
 */
function strong(list: DeclaredList<MeetsFields>, a: Row, b: Row): boolean {
  const theirs = new Set(namesOf(list, b).filter((n) => n.includes(' ')));
  if (!namesOf(list, a).some((n) => n.includes(' ') && theirs.has(n))) return false;
  const held = stemsOf(list, b);
  return [...stemsOf(list, a)].some((s) => held.has(s));
}

/**
 * Whether two names may be one person's: the same, the same run together, one the other's handle form (`farahq` and
 * Farah Qureshi), or the same first and last word with an initial or a middle name between ("Mara L." and "Mara
 * Lindqvist", "Samuel J Achterberg" and "Samuel Achterberg").
 */
function alike(x: string, y: string): boolean {
  if (x === y) return true;
  const [cx, cy] = [compact(x), compact(y)];
  if (cx.length >= STEM_LEAST && cx === cy) return true;
  const [tx, ty] = [x.split(' '), y.split(' ')];
  if (tx.length === 1 && shortForms(y).includes(cx)) return true;
  if (ty.length === 1 && shortForms(x).includes(cy)) return true;
  if (tx.length < 2 || ty.length < 2 || tx[0] !== ty[0] || tx[0]!.length < 2) return false;
  const [lx, ly] = [tx.at(-1)!.replace(/\.$/, ''), ty.at(-1)!.replace(/\.$/, '')];
  return lx === ly || (lx.length === 1 && ly.startsWith(lx)) || (ly.length === 1 && lx.startsWith(ly));
}

/** Whether one of these handles spells a name, whole or in its short form: `karimassaf91` spells Karim Assaf. */
const spelled = (handles: ReadonlySet<string>, name: string): boolean => {
  const run = stem(compact(name));
  return (run.length >= STEM_LEAST && handles.has(run)) || shortForms(name).some((f) => handles.has(f));
};

/**
 * Whether two people may be one, worth a question: names that are `alike`, by name or alias; one handle held by both
 * under two names; or one's handle spelling the other's name, whole or in its short form ("teodorvance" and Teodor
 * Vance, "karimassaf91" and Karim Assaf).
 */
function similar(list: DeclaredList<MeetsFields>, a: Row, b: Row): boolean {
  const [xs, ys] = [namesOf(list, a), namesOf(list, b)];
  const [sa, sb] = [stemsOf(list, a), stemsOf(list, b)];
  if ([...sa].some((s) => sb.has(s))) return true;
  if (xs.some((x) => ys.some((y) => alike(x, y)))) return true;
  return ys.some((n) => spelled(sa, n)) || xs.some((n) => spelled(sb, n));
}

/** A text as `candidates` searches a row's fields for it: lower case, with no spaces, dots, dashes or underscores. */
const folded = (text: string): string => text.toLowerCase().replace(/[\s._-]/g, '');

/**
 * The live people who may be this one, oldest first: a narrow read in SQL for the words, run-together names and handles
 * that `similar` could match on, then `similar` itself.
 */
function candidates(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, person: Row): Row[] {
  const probes = new Set<string>();
  for (const name of namesOf(list, person)) {
    const words = name.split(' ').map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 3);
    for (const w of words) probes.add(folded(w));
    const run = compact(name);
    /* A ONE-WORD NAME MAY BE A SHORT FORM: `farahq` is found by `farah`, and `tlindqvist` by `lindqvist`. */
    if (words.length === 1 && run.length >= STEM_LEAST) {
      probes.add(run.slice(0, -1));
      probes.add(run.slice(1));
    }
    for (const f of shortForms(name)) probes.add(f);
  }
  for (const s of stemsOf(list, person)) probes.add(s);
  const like = [...probes].filter((p) => p.length >= 3);
  if (like.length === 0) return [];
  const searched = "replace(replace(replace(replace(lower(fields), ' ', ''), '.', ''), '-', ''), '_', '')";
  return deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND id <> ? AND (${like.map(() => `instr(${searched}, ?) > 0`).join(' OR ')}) ORDER BY seq`,
      ...live(list.register, list.fields.merged_into),
      person.id,
      ...like,
    )
    .map(hydrate)
    .filter((r) => similar(list, person, r));
}

/**
 * Which strong folds a meeting may make: `any` for a believed source, `commits` for a commit, which never folds somebody
 * met in commits alone with somebody met otherwise (`kindsMeet`), and `none` for text anybody could have written.
 */
type Folds = 'any' | 'commits' | 'none';

/** What `settle` did: the row a strong rule folded this meeting into, the batch that undoes it, the question, the rows moved. */
type Settled = { kept: Row | null; undo: string | null; question: string | null; touched: string[] };

/**
 * After a person is met: fold them into the one the strong rules say they are, or ask once about the doubtful rest.
 *
 * `bridged` ARE ROWS THIS MEETING'S OWN KEYS FOUND BESIDE THE ONE IT MATCHED, always asked, never folded. `folds` is
 * `none` for text anybody could have written, which folds nothing (H1), and `commits` for a commit by a key nobody held,
 * which folds only into somebody met in commits alone (audit 19 H1); the rest is asked.
 *
 * A FOLD MAY MAKE THE KEPT ROW ONE ANOTHER ROW'S STRONG MATCH (it now holds the fold's handle), so the rules run again on
 * it, a few times at most, all in one batch, so one Undo takes back everything this meeting folded.
 */
function settle(deps: PeopleDeps, list: DeclaredList<MeetsFields>, person: Row, bridged: Row[], folds: Folds): Result<Settled> {
  const mine = (r: Row) => deps.othersRow?.(r.id) === true;
  const apart = new Set(bridged.map((b) => b.id));
  const touched: string[] = [];
  let fresh = rowById(deps.sql, person.id) ?? person;
  let batch: string | null = null;
  for (let hop = 0; folds !== 'none' && !mine(fresh) && hop < STRONG_HOPS; hop++) {
    const now = fresh;
    const other = candidates(deps, list, now).find(
      (o) =>
        !apart.has(o.id) &&
        !mine(o) &&
        strong(list, now, o) &&
        vouched(deps, list, now) &&
        vouched(deps, list, o) &&
        kindsMeet(deps, list, now, o, folds, person.id) &&
        !(deps.moneyAt?.(now.id) && deps.moneyAt?.(o.id)) &&
        !refused(deps, list, now, o, false),
    );
    if (other === undefined) break;
    const [keep, fold] = order(list, now, other);
    const note = `Merged ${deps.titleOf(fold.id) ?? 'a duplicate'} into ${deps.titleOf(keep.id) ?? 'the person already known'}: the same name and the same handle.`;
    const into: string = batch ?? deps.mint();
    /* A MERGE THE RECORD REFUSES IS ASKED INSTEAD, and its writes taken back: a link that cannot move (a desk only one
       person may hold) must not stop the meeting itself, on this call and every one after it. */
    const merged = deps.attempt ? deps.attempt(() => fold_(deps, list, keep, [fold], note, into)) : fold_(deps, list, keep, [fold], note, into);
    if (!merged.ok) {
      if (!deps.attempt) return merged as Result<never>;
      break;
    }
    batch = into;
    touched.push(keep.id, fold.id);
    fresh = rowById(deps.sql, keep.id) ?? keep;
  }

  const kept = fresh.id === person.id ? null : fresh;
  const seen = new Set([fresh.id]);
  const doubtful: Row[] = [];
  for (const other of [...bridged, ...candidates(deps, list, fresh)]) {
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    if (mine(other) || mine(fresh)) continue;
    /* ASKED ALREADY, OR SAID NO TO: a question waiting on both is the question, and is kept current, not opened again. */
    if (refused(deps, list, fresh, other)) continue;
    /* NOT BESIDE ONE HE SAID IS SOMEBODY ELSE: a question about three, two of whom he kept apart, would fold them. */
    if (doubtful.some((d) => refused(deps, list, d, other, false))) continue;
    doubtful.push(other);
  }
  if (doubtful.length === 0) return ok({ kept, undo: batch, question: null, touched });
  const asked = askOrExtend(deps, list, [fresh, ...doubtful]);
  return asked.ok ? ok({ kept, undo: batch, question: asked.value, touched }) : (asked as Result<never>);
}

/**
 * Whether the strong rules may fold these two as far as where each was met goes (audit 19 H1). Two people met in commits
 * alone may be one author's spellings, and so may two met anywhere else. Somebody met in commits alone beside somebody
 * met otherwise is a commit author anybody could have signed as: a commit never folds the two, by a key nobody held or
 * by one its own author's row already held (two commits as `Teodor Vance <teodorvance@evil.test>` are the same forger
 * twice). A believed source folds them only when the commit-made row is the one this very meeting found by its key,
 * never a step later down the chain, where a forged author would be folded in on the real person's next meeting.
 *
 * A KEY THE OTHER ROW ALREADY HOLDS IS NOT A FOLD AT ALL: the meeting is that person's, by the key, before any rule runs.
 */
function kindsMeet(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, a: Row, b: Row, folds: Folds, met: string): boolean {
  const [ca, cb] = [commitsOnly(deps, list, a), commitsOnly(deps, list, b)];
  if (ca === cb) return true;
  return folds === 'any' && (ca ? a : b).id === met;
}

/** Which of two is kept: the record's own person always, then the older. */
function order(list: DeclaredList<MeetsFields>, a: Row, b: Row): [Row, Row] {
  const self = list.fields.self;
  if (self !== undefined && a.fields[self] === true && b.fields[self] !== true) return [a, b];
  if (self !== undefined && b.fields[self] === true && a.fields[self] !== true) return [b, a];
  return (b.seq ?? 0) < (a.seq ?? 0) ? [b, a] : [a, b];
}

/**
 * What the kept row gains from the folded ones (H2): every field it leaves empty, filled from the first fold that has
 * it; every list joined; the later day in touch; and each fold's address, kept as a key when the kept row has its own.
 * A fold's other name joins `aliases`, once, and never the kept row's own name again.
 */
function carried(list: DeclaredList<MeetsFields>, keep: Row, folds: readonly Row[]): Record<string, unknown> {
  const at = list.fields;
  const patch: Record<string, unknown> = {};
  const now = (field: string): unknown => (field in patch ? patch[field] : keep.fields[field]);
  const skip = new Set([at.merged_into, at.self].filter((f): f is string => f !== undefined));
  for (const fold of folds) {
    for (const f of list.declaredFields) {
      if (f.retired === true || f.derived !== undefined || skip.has(f.id) || f.id.startsWith('_')) continue;
      const theirs = fold.fields[f.id];
      if (theirs === undefined || theirs === null) continue;
      const ours = now(f.id);
      if (f.type === 'list') {
        const union = f.id === at.met ? metLines(listOf(ours), listOf(theirs)) : [...new Set([...listOf(ours), ...listOf(theirs)])];
        if (!same(union, ours ?? [])) patch[f.id] = union;
      } else if (ours === undefined || ours === null || ours === '') patch[f.id] = theirs;
    }
    if (at.in_touch !== undefined) {
      const touched = later(now(at.in_touch), fold.fields[at.in_touch]);
      if (touched !== undefined && touched !== now(at.in_touch)) patch[at.in_touch] = touched;
    }
    /* THE FOLD'S ADDRESS IS NEVER LOST: the kept row holds its own, so the other one goes in as a key. */
    const theirs = textOf(fold.fields[at.email]);
    const into = at.keys ?? at.handles;
    if (theirs !== undefined && textOf(now(at.email)) !== theirs && into !== undefined) {
      const key = keyOf('email', theirs);
      if (key !== null && !listOf(now(into)).includes(key)) patch[into] = [...listOf(now(into)), key];
    }
    const named = textOf(fold.fields[at.name]);
    if (at.aliases !== undefined && named !== undefined) patch[at.aliases] = [...listOf(now(at.aliases)), named];
  }
  /* ONE OF EACH NAME, NOT THE KEPT ROW'S OWN: three folds called Karim Assaf are one alias, and "kas" beside Kas none. */
  if (at.aliases !== undefined && at.aliases in patch) {
    const had = new Set([nameKey(textOf(now(at.name)) ?? '')]);
    const aliases = listOf(patch[at.aliases]).filter((n) => {
      const key = nameKey(n);
      if (key === '' || had.has(key)) return false;
      had.add(key);
      return true;
    });
    if (same(aliases, keep.fields[at.aliases] ?? [])) delete patch[at.aliases];
    else patch[at.aliases] = aliases;
  }
  return patch;
}

/**
 * Fold rows into one, now, as one batch the record can undo (`undoMerge` in `index.ts`). Each fold is pointed at the
 * kept row first, which moves every row that pointed at it there too (the write path's merge step), then taken out;
 * the kept row gains what they carried last, once the address it may take is free. Answers the batch.
 */
function fold_(deps: PeopleDeps, list: DeclaredList<MeetsFields>, keep: Row, folds: readonly Row[], note: string, batch = deps.mint()): Result<string> {
  const register = list.register;
  for (const fold of folds) {
    const pointed = deps.write(register, fold.id, { [list.fields.merged_into]: keep.id }, { version: fold.version, batch, note });
    if (!pointed.ok) return pointed as Result<never>;
    const gone = deps.write(register, fold.id, { deleted_at: instant(deps.nowMs) }, { version: pointed.value.version, batch, note });
    if (!gone.ok) return gone as Result<never>;
  }
  const kept = rowById(deps.sql, keep.id) ?? keep;
  const patch = carried(list, kept, folds);
  if (Object.keys(patch).length > 0) {
    const wrote = deps.write(register, kept.id, patch, { version: kept.version, batch, note });
    if (!wrote.ok) return wrote as Result<never>;
  }
  return ok(batch);
}

/** What a person is known by, for a question: where they were met, how often, what they answer to. Never an id. */
function evidence(deps: Pick<PeopleDeps, 'titleOf'>, list: DeclaredList<MeetsFields>, row: Row): string {
  const at = list.fields;
  const said: string[] = [];
  const org = at.org === undefined ? undefined : textOf(row.fields[at.org]);
  const orgName = org === undefined ? null : deps.titleOf(org);
  if (orgName) said.push(orgName);
  if (at.projects !== undefined)
    for (const p of listOf(row.fields[at.projects]).slice(0, 2)) {
      const named = deps.titleOf(p);
      if (named && named !== orgName) said.push(named);
    }
  const met = listOf(row.fields[at.met]).length;
  if (met > 0) said.push(met === 1 ? 'met once' : `met ${met} times`);
  const i = identity(list, row);
  const work = [...new Set(i.emails.map((e) => e.domain).filter((d) => !isPublicMail(d)))];
  if (work.length > 0) said.push(`an address at ${work.slice(0, 2).join(' and ')}`);
  else if (i.emails.length > 0) said.push('a personal address');
  if (i.logins.length > 0) said.push('GitHub');
  return said.length === 0 ? '' : ` (${said.join(', ')})`;
}

/** Names as a sentence lists them: `A`, `A and B`, `A, B and C`. */
const listed = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * The addresses the record's own people sign in with, as keys: the one the caller hands (`ownAddress`), else every
 * owner's as the record itself mirrors it (`person` and `member`, written when the record is made and whenever an
 * owner joins). Empty only on a record that holds no owner's address at all.
 *
 * READ FROM THE RECORD, so the rule holds for a caller that hands nothing: the nightly pass and a write that marks a row
 * have no session to take an address from.
 */
function signIns(deps: Pick<PeopleDeps, 'sql' | 'ownAddress'>): string[] {
  const handed = keyOf('email', deps.ownAddress?.() ?? '');
  if (handed !== null) return [handed];
  const owners = deps.sql.all<{ email: string | null }>("SELECT p.email FROM person p JOIN member m ON m.person_id = p.id WHERE m.level = 'owner' AND p.email IS NOT NULL");
  return [...new Set(owners.map((o) => keyOf('email', o.email ?? '')).filter((k): k is string => k !== null && kindOfKey(k) === 'email'))];
}

/** A person's addresses, as keys. */
const mailsOf = (list: DeclaredList<MeetsFields>, row: Row): string[] => keysOfRow(list, row).filter((k) => kindOfKey(k) === 'email');

/**
 * Which of a cluster is kept, oldest first as given: the record's own person always, then the older (`order`).
 *
 * MORE THAN ONE MARKED AS HIM: the one holding an address an owner signs in with (`signIns`), since that is the row the
 * record marked for a reason and the one every later sign-in lands on; else the oldest that holds any address; else the
 * oldest. A row holding a sign-in address is never one of the folded while another marked row holds none.
 */
function keptOf(deps: Pick<PeopleDeps, 'sql' | 'ownAddress'>, list: DeclaredList<MeetsFields>, sorted: readonly Row[]): Row {
  const self = list.fields.self;
  const own = self === undefined ? [] : sorted.filter((r) => r.fields[self] === true);
  if (own.length < 2) return sorted.reduce((k, r) => order(list, k, r)[0], sorted[0]!);
  const signs = signIns(deps);
  return own.find((r) => mailsOf(list, r).some((m) => signs.includes(m))) ?? own.find((r) => mailsOf(list, r).length > 0) ?? own[0]!;
}

/**
 * Whether nobody can say which of his marked rows is the one he signs in with, so asking would offer to keep a guess.
 *
 * TWO CASES, and in both the question waits. The record knows no owner's address and more than one marked row holds
 * one: either may be the row he signs in with, and the oldest is only a guess. Or two marked rows hold two different
 * sign-in addresses: a record with two owners has two people marked, and they are not one.
 */
function unsureWhichSignsIn(deps: Pick<PeopleDeps, 'sql' | 'ownAddress'>, list: DeclaredList<MeetsFields>, own: readonly Row[]): boolean {
  const signs = signIns(deps);
  if (signs.length === 0) return own.filter((r) => mailsOf(list, r).length > 0).length > 1;
  return new Set(own.flatMap((r) => mailsOf(list, r).filter((m) => signs.includes(m)))).size > 1;
}

/**
 * What a question about a cluster writes when accepted, and what its card reads: every other folded into the one kept
 * (the record's own person, else the oldest), carrying what they hold, and each of them by name and where seen.
 *
 * THE FOLDS COME FIRST IN THE BODY, the kept row last, so an address moving to the kept row is free by the time it
 * arrives (the email field is unique among live rows).
 */
function clusterBody(deps: Pick<PeopleDeps, 'sql' | 'nameOf' | 'titleOf' | 'nowMs' | 'ownAddress'>, list: DeclaredList<MeetsFields>, rows: readonly Row[]): { body: Record<string, unknown>; sorted: Row[]; keep: Row; folds: Row[] } | null {
  const sorted = [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const keep = keptOf(deps, list, sorted);
  const folds = sorted.filter((r) => r.id !== keep.id);
  if (folds.length === 0) return null;
  const keepName = deps.nameOf(keep.id);
  const patch = carried(list, keep, folds);
  const body = {
    register: list.register,
    rows: [
      ...folds.map((f) => ({ at: deps.nameOf(f.id), version: f.version, patch: { [list.fields.merged_into]: keepName, deleted_at: instant(deps.nowMs) } })),
      ...(Object.keys(patch).length === 0 ? [] : [{ at: keepName, version: keep.version, patch }]),
    ],
    /* THE NAMES IT IS ABOUT, for the merge card Decide draws: each by its handle, with where they were seen and which one
       Yes keeps. The rows above are what accepting writes; this is only what the card reads. */
    candidates: sorted.map((r) => ({ at: deps.nameOf(r.id), name: nameOfRow(list, r) || 'someone unnamed', seen: seenOf(deps, list, r), ...(r.id === keep.id ? { kept: true } : {}) })),
  };
  return { body, sorted, keep, folds };
}

/**
 * One question for a cluster of people who may be one, in names and evidence: "Are Teodor Vance (Brightwell, met 6 times)
 * and teodorvance (GitHub) one person?" Accepting it folds every other into the one kept, carrying what they hold.
 */
function askCluster(deps: PeopleDeps, list: DeclaredList<MeetsFields>, rows: readonly Row[], confidence?: number): Result<string | null> {
  const drawn = clusterBody(deps, list, rows);
  if (drawn === null) return ok(null);
  const { body, sorted, keep, folds } = drawn;
  const named = (r: Row) => `${nameOfRow(list, r) || 'someone unnamed'}${evidence(deps, list, r)}`;
  const one = nameOfRow(list, keep) || 'the first';
  const likely = confidence === undefined ? '' : ' They look likely to be.';
  /* THE OWNER IS ASKED ABOUT HIMSELF AS HIMSELF: kept is always his own row, so the question says "you". */
  const mine = list.fields.self !== undefined && keep.fields[list.fields.self] === true;
  const who = mine ? (sorted.length === 2 ? 'both you' : 'all you') : 'one person';
  const question = `Are ${listed(sorted.map(named))} ${who}?${likely} Yes keeps ${one} and carries over the other${folds.length === 1 ? "'s" : "s'"} addresses, handles and where they were met.`;
  const opened = deps.propose({ question, body_kind: 'rowset', body });
  return opened.ok ? ok(opened.value.id) : (opened as Result<never>);
}

/** The live rows marked as the record's own person, oldest first. */
function selfRows(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>): Row[] {
  const self = list.fields.self;
  if (self === undefined) return [];
  return deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND json_extract(fields, ?) = 1 ORDER BY seq`,
      ...live(list.register, list.fields.merged_into),
      path(self),
    )
    .map(hydrate);
}

/**
 * THE OWNER HELD TWICE: once one row is marked as his own, every other person who goes by his name or one of his other
 * names, whose name one of his handles spells, or who holds one of his handles, is one question, "Are Kas and Karim Assaf both you?", never a fold made on its
 * own. Only somebody the record vouches for (a mailed name is nobody's evidence), never a row another member made, and
 * asked once: a pair he answered or undid is not asked again, and one already waiting is joined, not asked twice.
 * Accepting carries their addresses and handles onto his row, so what he is met by after lands there by key.
 *
 * A ROW NO MEETING EVER TOUCHES IS FOUND HERE: the second "Kas" he typed is never met by any key, so a question that
 * waited for a meeting of it would never come.
 *
 * MORE THAN ONE ROW MARKED AS HIM is the same question about those rows, "Are Kas and Kas both you?", keeping the one
 * that holds the address he signs in with (`keptOf`). The mark is the record's or his own, so no name is compared and
 * nothing else is searched until they are one. Asked only while that row can be told (`unsureWhichSignsIn`).
 */
function askSelf(deps: PeopleDeps, list: DeclaredList<MeetsFields>): Result<string | null> {
  const self = list.fields.self;
  if (self === undefined) return ok(null);
  const marked = selfRows(deps, list);
  const own = marked.filter((r) => deps.othersRow?.(r.id) !== true);
  if (own.length > 1) {
    /* NEVER A GUESS AT WHICH ROW HE SIGNS IN WITH: a yes would fold that row into another (`unsureWhichSignsIn`). */
    if (unsureWhichSignsIn(deps, list, own)) return ok(null);
    const kept = keptOf(deps, list, own);
    return askAsOne(deps, list, kept, own.filter((r) => r.id !== kept.id && !refused(deps, list, kept, r)).slice(0, CLUSTER_MOST - 1));
  }
  /* A ROW ANOTHER MEMBER MARKED IS NOT HIS TO FOLD, and with it there, which is him is theirs and his to say first. */
  if (marked.length !== 1 || own.length !== 1) return ok(null);
  const me = own[0]!;
  const names = new Set(namesOf(list, me));
  const handles = stemsOf(list, me);
  const near = candidates(deps, list, me)
    .filter(
      (r) =>
        r.fields[self] !== true &&
        deps.othersRow?.(r.id) !== true &&
        (namesOf(list, r).some((n) => names.has(n) || spelled(handles, n)) || [...stemsOf(list, r)].some((h) => handles.has(h))) &&
        vouched(deps, list, r) &&
        !refused(deps, list, me, r),
    )
    .slice(0, CLUSTER_MOST - 1);
  return askAsOne(deps, list, me, near);
}

/** Ask whether these are all the record's own person, once: a question waiting on all of them is the answer. */
function askAsOne(deps: PeopleDeps, list: DeclaredList<MeetsFields>, me: Row, near: readonly Row[]): Result<string | null> {
  if (near.length === 0) return ok(null);
  const ids = [me.id, ...near.map((r) => r.id)];
  const waiting = openAsked(deps, list).filter((q) => q.offer === null && q.members.some((m) => ids.includes(m.id)));
  if (waiting.length === 0) return askCluster(deps, list, [me, ...near]);
  /* ONE QUESTION ALREADY WAITING ON ALL OF THEM is the answer, without searching the cluster again at every meeting. */
  if (waiting.some((q) => ids.every((id) => q.members.some((m) => m.id === id)))) return ok(null);
  return askOrExtend(deps, list, [me, ...near]);
}

/**
 * THE SWEEP FOR THE OWNER HELD TWICE, for a caller that has just marked his row and met nobody (DIRECTION §38): the
 * question every meeting asks (`askSelf`), "Are Kas and Karim Assaf both you?", asked now. The record calls it right
 * after a row is marked by a write of its own; a mark accepted on Decide runs it already (`joinOrganisation`). Asks
 * nothing while no row is marked, never twice, and never about a pair he answered. Answers the question
 * it opened or joined, or `null`.
 */
export function askOwnRows(deps: PeopleDeps): Result<string | null> {
  const list = deps.list;
  if (!list || list.fields.self === undefined) return ok(null);
  return askSelf(deps, list);
}

/** Whether a question he accepted marked a person of this list as the record's own: "Mark Kas as you?". */
function marksSelf(deps: Pick<PeopleDeps, 'sql'>, list: DeclaredList<MeetsFields>, suggestion: string): boolean {
  const self = list.fields.self;
  if (self === undefined) return false;
  const q = deps.sql.one<{ body: string }>("SELECT body FROM suggestion WHERE id = ? AND body_kind = 'rowset' AND status = 'resolved' AND resolved_as = 'addressed'", suggestion);
  if (!q) return false;
  try {
    const body = JSON.parse(q.body) as { register?: unknown; rows?: { patch?: Record<string, unknown> }[] };
    return body.register === list.register && Array.isArray(body.rows) && body.rows.some((r) => r?.patch?.[self] === true);
  } catch {
    return false;
  }
}

/* ── the questions waiting on the owner ──────────────────────────────── */

type Hydrated = Row & { deleted: boolean };
type RawRow = { id: string; seq: number | null; version: number; fields: string; deleted_at: string | null };
const withDeleted = (r: RawRow): Hydrated => ({ ...hydrate(r), deleted: r.deleted_at !== null });

/** A row of the list by the handle a question names it by (`people#3`), or by its id; deleted ones too. */
function rowAt(deps: Pick<PeopleDeps, 'sql' | 'nameOf'>, list: Keyed, at: string): Hydrated | null {
  const seq = /(\d+)$/.exec(at)?.[1];
  const bySeq = seq === undefined ? undefined : deps.sql.one<RawRow>('SELECT id, seq, version, fields, deleted_at FROM entry WHERE register = ? AND seq = ?', list.register, Number(seq));
  const r = bySeq !== undefined && deps.nameOf(bySeq.id) === at ? bySeq : deps.sql.one<RawRow>('SELECT id, seq, version, fields, deleted_at FROM entry WHERE register = ? AND id = ?', list.register, at);
  return r ? withDeleted(r) : null;
}

/** The live row a row ended in: itself, or the one it was folded into, followed to the end. `null` for one deleted outright. */
function liveEnd(deps: Pick<PeopleDeps, 'sql' | 'nameOf'>, list: Keyed, start: Hydrated): Row | null {
  let row = start;
  for (let hops = 0; hops < FOLD_HOPS; hops++) {
    const into = list.fields.merged_into === undefined ? undefined : textOf(row.fields[list.fields.merged_into]);
    const next = into === undefined ? null : rowAt(deps, list, into);
    if (next === null || next.id === row.id) return row.deleted ? null : row;
    row = next;
  }
  return null;
}

/**
 * An open question `meet` asked: who it names, as the rows they are now (a folded one by the row it was folded into),
 * and whether it offers an address to one person (`offer`) or asks about a cluster.
 */
type Asked = { id: string; body: Record<string, unknown>; named: string[]; members: Row[]; offer: readonly string[] | null };

function openAsked(deps: Pick<PeopleDeps, 'sql' | 'nameOf'>, list: DeclaredList<MeetsFields>): Asked[] {
  const open = deps.sql.all<{ id: string; body: string }>(
    "SELECT id, body FROM suggestion WHERE status = 'open' AND body_kind = 'rowset' AND json_extract(body, '$.register') = ? ORDER BY rowid",
    list.register,
  );
  const out: Asked[] = [];
  for (const q of open) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(q.body) as Record<string, unknown>;
    } catch {
      continue;
    }
    const offer = body.offer !== null && typeof body.offer === 'object' ? listOf((body.offer as { keys?: unknown }).keys) : null;
    const said =
      offer !== null
        ? [String((body.rows as { at?: unknown }[] | undefined)?.[0]?.at ?? '')]
        : Array.isArray(body.candidates)
          ? (body.candidates as { at?: unknown }[]).map((c) => String(c?.at ?? ''))
          : null;
    /* A ROWSET ANOTHER PART OF THE RECORD FILED ABOUT THIS LIST is not one of these, and is left as it is. */
    if (said === null) continue;
    const raws = said.map((at) => rowAt(deps, list, at)).filter((r): r is Hydrated => r !== null);
    const members: Row[] = [];
    for (const r of raws) {
      const end = liveEnd(deps, list, r);
      if (end !== null && !members.some((m) => m.id === end.id)) members.push(end);
    }
    out.push({ id: q.id, body, named: raws.map((r) => r.id), members, offer });
  }
  return out;
}

/** Take a question off the owner's list because the record answered it: they became one, or it joined another. */
function close(deps: Pick<PeopleDeps, 'sql' | 'nowMs' | 'mint'>, id: string, why: string): void {
  deps.sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'addressed' WHERE id = ? AND status = 'open'", id);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, 'system', 'resolve', ?, 'suggestion', 'addressed', ?)",
    deps.mint(),
    instant(deps.nowMs),
    `suggestion:${id}`,
    why.slice(0, 280),
  );
}

/** Write a question's body again, as `ingest.ts` does when one more joins an open question. */
const rewrite = (deps: Pick<PeopleDeps, 'sql'>, id: string, body: Record<string, unknown>): void =>
  void deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(body), id);

/**
 * Ask about a cluster once: when a question already waits on any of them, the others join it, and nobody he said is
 * somebody else; otherwise a new one. Answers the question's id, or `null` when nobody new joined one already open.
 * `may` says who else may be taken in beside the ones asked about: everybody like them, unless the caller is stricter.
 */
function askOrExtend(deps: PeopleDeps, list: DeclaredList<MeetsFields>, asked: readonly Row[], confidence?: number, may: (r: Row) => boolean = () => true): Result<string | null> {
  /* THE CLUSTER, NOT THE PAIR: whoever is like one of them is asked about in the same question. The owner typed in twice
     ("Kas", and his own row "Kas") is never met again by any key, so asked only about the newcomer, his second row would
     stay apart for good, and two questions about one person go stale on each other's answer. */
  const rows = [...asked];
  for (const r of asked)
    for (const near of candidates(deps, list, r)) {
      if (rows.length >= CLUSTER_MOST) break;
      if (rows.some((x) => x.id === near.id) || deps.othersRow?.(near.id) === true || !may(near)) continue;
      if (rows.some((x) => refused(deps, list, x, near, false))) continue;
      rows.push(near);
    }
  const ids = new Set(rows.map((r) => r.id));
  const touching = openAsked(deps, list).filter((q) => q.offer === null && q.members.some((m) => ids.has(m.id)));
  if (touching.length === 0) return askCluster(deps, list, rows, confidence);
  const [target, ...rest] = touching as [Asked, ...Asked[]];
  const members = [...target.members];
  const joined: Row[] = [];
  for (const r of [...rows, ...rest.flatMap((q) => q.members)]) {
    if (members.length >= CLUSTER_MOST) break;
    if (members.some((m) => m.id === r.id) || deps.othersRow?.(r.id) === true) continue;
    if (members.some((m) => refused(deps, list, m, r, false))) continue;
    members.push(r);
    joined.push(r);
  }
  /* ANOTHER QUESTION WHOSE PEOPLE ALL JOINED THIS ONE is answered by it, and is taken off his list. */
  for (const q of rest) if (q.members.every((m) => members.some((x) => x.id === m.id))) close(deps, q.id, `Asked together with the others who may be the same person, in ${target.id}.`);
  if (joined.length === 0) return ok(null);
  const drawn = clusterBody(deps, list, members);
  if (drawn === null) return ok(null);
  rewrite(deps, target.id, drawn.body);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, 'system', 'suggest', ?, 'suggestion', 'rows', ?, ?, ?)",
    deps.mint(),
    instant(deps.nowMs),
    `suggestion:${target.id}`,
    String(target.members.length),
    String(members.length),
    `${listed(joined.map((r) => nameOfRow(list, r) || 'someone unnamed'))} may be the same person too, and joined this question.`.slice(0, 280),
  );
  return ok(target.id);
}

/**
 * Bring every open question naming one of these rows up to them: each person as the row they are now, at the version
 * it is now, with what accepting would carry worked out again. A question whose people became one is taken off the
 * list; an offer of an address the person now holds, or another took, likewise.
 *
 * A QUESTION IS ABOUT WHO SOMEBODY IS, NOT ABOUT THE LINE A COMMIT ADDED. Left at the version it was drawn at, every
 * later meeting of the same person made it one the owner could not accept, and the person stayed two.
 */
function reask(deps: PeopleDeps, list: DeclaredList<MeetsFields>, ids: readonly string[]): Result<null> {
  const moved = new Set(ids);
  for (const q of openAsked(deps, list)) {
    if (!q.named.some((id) => moved.has(id)) && !q.members.some((m) => moved.has(m.id))) continue;
    if (q.offer !== null) {
      const row = q.members[0];
      /* THE ADDRESS AS AN ADDRESS, so a person with none still takes it in the email field, as the offer first said. */
      const mail = q.offer.find((k) => kindOfKey(k) === 'email');
      const patch = row === undefined ? {} : keysPatch(deps, list, row, q.offer, mail === undefined ? {} : { email: valueOfKey(mail) });
      if (row === undefined || Object.keys(patch).length === 0) close(deps, q.id, 'The address it offered is settled.');
      else rewrite(deps, q.id, { ...q.body, rows: [{ at: deps.nameOf(row.id), version: row.version, patch }] });
      continue;
    }
    const drawn = q.members.length < 2 ? null : clusterBody(deps, list, q.members);
    if (drawn === null) close(deps, q.id, 'They were found to be one person.');
    else if (JSON.stringify(drawn.body) !== JSON.stringify(q.body)) rewrite(deps, q.id, drawn.body);
  }
  return ok(null);
}

/**
 * Somebody met in text anybody could have written, by a key nobody holds, who looks like somebody known (H1). No row is
 * made and nothing is folded: the sighting is kept as a mention, and when exactly one person is like them, the owner is
 * asked once whether the new address is theirs. `null` when nobody known is like them, and they are a person of their
 * own, touching nobody.
 */
function offerArrival(deps: PeopleDeps, list: DeclaredList<MeetsFields>, s: Said, keys: readonly string[], project: string | null): Result<Met> | null {
  const at = list.fields;
  const name = s.name ?? nameFromKeys(keys);
  const phantom: Row = { id: '', seq: null, version: 0, fields: { [at.name]: name, ...placeKeys(list, keys, s) } };
  const near = candidates(deps, list, phantom).filter((r) => deps.othersRow?.(r.id) !== true);
  if (near.length === 0) return null;
  noteMention(deps.sql, { name, kind: 'person', project, source: s.source, at: instant(deps.nowMs) });
  const other = near.length === 1 ? near[0]! : null;
  const patch = other === null ? {} : keysPatch(deps, list, other, keys, s);
  if (other === null || Object.keys(patch).length === 0) return ok(mention());
  /* ONCE: not while another such question waits on this person, and never again for an address offered before. */
  const spoken = deps.nameOf(other.id);
  const before = deps.sql.all<{ body: string; status: string }>(
    "SELECT body, status FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = ? AND json_type(body, '$.offer') = 'object'",
    list.register,
  );
  for (const { body, status } of before) {
    try {
      const b = JSON.parse(body) as { rows?: { at?: unknown }[]; offer?: { keys?: unknown } };
      if (status === 'open' && b.rows?.[0]?.at === spoken) return ok(mention());
      if (listOf(b.offer?.keys).some((k) => keys.includes(k))) return ok(mention());
    } catch {
      /* a body nobody can read offered nothing */
    }
  }
  const known = nameOfRow(list, other) || 'someone unnamed';
  const what = keys.some((k) => kindOfKey(k) === 'email') ? 'address' : 'handle';
  const question = `Is the ${name} met in ${s.source} the ${known} you already know${evidence(deps, list, other)}? Yes adds the new ${what} to ${known}. Nobody new is added either way.`;
  const offered = keys.filter((k) => holderOf(deps.sql, k) === null);
  const opened = deps.propose({
    question,
    body_kind: 'rowset',
    body: { register: list.register, rows: [{ at: spoken, version: other.version, patch }], offer: { keys: offered } },
  });
  if (!opened.ok) return opened as Result<never>;
  return ok({ ...mention(), question: opened.value.id, merge: opened.value.id });
}

/**
 * Whether a pair is settled against merging: a question that named both, answered or not, or a merge of the two that
 * was undone. Asking again on every commit would make the question noise, and an undo is a no.
 *
 * `open` false counts only what he answered: a question still waiting is the one a newcomer may join, and a strong rule
 * may still settle it.
 */
function refused(deps: Pick<PeopleDeps, 'sql' | 'nameOf'>, list: Keyed, a: Row, b: Row, open = true): boolean {
  const merged = list.fields.merged_into;
  if (merged === undefined) return false;
  const [x, y] = [deps.nameOf(a.id), deps.nameOf(b.id)];
  const bodies = deps.sql.all<{ body: string }>(
    "SELECT body FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = ? AND (? = 1 OR status <> 'open')",
    list.register,
    open ? 1 : 0,
  );
  const asked = bodies.some(({ body }) => {
    try {
      const rows = (JSON.parse(body) as { rows?: { at?: unknown; patch?: Record<string, unknown> }[] }).rows ?? [];
      const named = new Set(rows.flatMap((r) => [r?.at, r?.patch?.[merged]]));
      return named.has(x) && named.has(y);
    } catch {
      return false;
    }
  });
  if (asked) return true;
  /* AN UNDONE MERGE IS A `merged_into` THAT WENT FROM ONE OF THE PAIR BACK TO NOTHING. */
  return deps.sql.one<{ n: number }>(
    `SELECT 1 AS n FROM event WHERE kind = 'edit' AND field = ? AND to_v IS NULL
       AND ((target = ? AND instr(from_v, ?) > 0) OR (target = ? AND instr(from_v, ?) > 0)) LIMIT 1`,
    merged,
    `entry:${a.id}`,
    b.id,
    `entry:${b.id}`,
    a.id,
  ) !== undefined;
}

/* ── held twice, asked with no model ─────────────────────────────────── */

/**
 * The plain pairs: two live people whose names are equal once folded ("Mariam" and "mariam", "Salma Aziz" and
 * "salma-aziz"), where at most one of them holds any address, handle or key. Oldest first.
 *
 * NEVER a row another member made, never one only an arrival vouches for (a forged sender is nobody's evidence, H1),
 * never two rows both marked as the record's own person (`askSelf` asks that), and never a pair he answered or undid.
 * `open` true leaves out a pair a question already waits on as well.
 */
function plainPairs(deps: Pick<PeopleDeps, 'sql' | 'nameOf' | 'othersRow'>, list: DeclaredList<MeetsFields>, open: boolean): [Row, Row][] {
  const self = list.fields.self;
  const people = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} ORDER BY seq DESC LIMIT 2000`,
      ...live(list.register, list.fields.merged_into),
    )
    .map(hydrate)
    .reverse();
  const byName = new Map<string, Row[]>();
  for (const row of people) {
    const name = folded(nameOfRow(list, row));
    if (name !== '') byName.set(name, [...(byName.get(name) ?? []), row]);
  }
  const pairs: [Row, Row][] = [];
  for (const held of byName.values()) {
    if (held.length < 2) continue;
    /* ONLY SOMEBODY WHO MAY BE ASKED ABOUT, read once a row: what vouches for one is a read of the log. */
    const rows = held.filter((r) => deps.othersRow?.(r.id) !== true && vouched(deps, list, r)).slice(0, CLUSTER_MOST);
    const keyed = new Set(rows.filter((r) => keysOfRow(list, r).length > 0).map((r) => r.id));
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const [a, b] = [rows[i]!, rows[j]!];
        if (keyed.has(a.id) && keyed.has(b.id)) continue;
        if (self !== undefined && a.fields[self] === true && b.fields[self] === true) continue;
        if (!refused(deps, list, a, b, open)) pairs.push([a, b]);
      }
  }
  return pairs;
}

/**
 * THE PLAINEST CASE NEEDS NO MODEL: two people of one name, one of them holding nothing, are asked about as one
 * question a pair, `max` pairs a night ("likely duplicates are offered as a merge"). Nothing is folded: his answer on
 * Decide does that, and Undo takes it back. A pair is asked once, and one a question already names is not asked again.
 * Answers the questions it opened or added somebody to.
 *
 * THE RISK IS TWO REAL PEOPLE WHO SHARE A NAME, and it is his no that says so: only when one row holds no key at all,
 * a few a night, and never again once he has answered.
 */
export function askPlainPairs(deps: PeopleDeps, list: DeclaredList<MeetsFields>, max = PLAIN_PAIRS_NIGHT): Result<string[]> {
  const ids: string[] = [];
  let asked = 0;
  for (const [a, b] of plainPairs(deps, list, true)) {
    if (asked >= max) break;
    /* A QUESTION OPENED A MOMENT AGO took in whoever else goes by the name, so three rows of one name are one question. */
    if (asked > 0 && refused(deps, list, a, b)) continue;
    /* WHOEVER ELSE IS TAKEN IN IS VOUCHED FOR TOO: no model and no meeting stands behind this question, only the name. */
    const q = askOrExtend(deps, list, [a, b], undefined, (r) => vouched(deps, list, r));
    if (!q.ok) return q as Result<never>;
    if (q.value === null) continue;
    asked++;
    if (!ids.includes(q.value)) ids.push(q.value);
  }
  return ok(ids);
}

/**
 * THE NIGHTLY PASS FOR SOMEBODY HELD TWICE, before any model is asked: the record's own person first (`askSelf`), then
 * the plain pairs. Run before `resolveJob`, whatever it asks about is a pair that job leaves alone, so the plain cases
 * never wait on a model that may not answer. Answers the questions opened or added to tonight.
 */
export function askTwice(deps: PeopleDeps, max = PLAIN_PAIRS_NIGHT): Result<string[]> {
  const list = deps.list;
  if (!list) return ok([]);
  const own = askSelf(deps, list);
  if (!own.ok) return own as Result<never>;
  const pairs = askPlainPairs(deps, list, max);
  if (!pairs.ok) return pairs;
  return ok([...new Set([...(own.value === null ? [] : [own.value]), ...pairs.value])]);
}

/**
 * SOMEBODY LOOKING AT THE SAME PERSON TWICE SAYS SO (`sameOne` in the record): the question the nightly pass and a
 * model's answer file, for exactly the people picked and nobody like them, since a pick is a person's own word about
 * who. Nothing is folded: the answer on Decide does that, and Undo takes it back. Picked again while it waits, the
 * question already open is the answer, and when one waits on some of them the others join it.
 *
 * Answers the question and whether this call opened it or added somebody to it; `null` when there is no people list,
 * fewer than two of them, or a question waits on some and the others were said to be somebody else. Somebody gone or
 * folded already is `ROW_UNKNOWN`, and a row another member made is theirs to merge, as everywhere here.
 */
export function askSame(deps: PeopleDeps, ids: readonly string[]): Result<{ id: string; asked: boolean } | null> {
  const list = deps.list;
  if (!list) return ok(null);
  const rows: Row[] = [];
  for (const id of new Set(ids)) {
    const r = deps.sql.one<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE id = ? AND ${LIVE}`,
      id,
      ...live(list.register, list.fields.merged_into),
    );
    if (!r) return no('ROW_UNKNOWN', 'One of the people picked is no longer there. Pick again from the list as it is now.', { at: 'rows' });
    const row = hydrate(r);
    if (deps.othersRow?.(row.id) === true)
      return no('FORBIDDEN', `${nameOfRow(list, row) || 'One of them'} was added by somebody else here, so whether they are the same person is theirs to say. Ask them.`, { at: 'rows' });
    rows.push(row);
  }
  if (rows.length < 2) return ok(null);
  const q = askOrExtend(deps, list, rows.slice(0, CLUSTER_MOST), undefined, () => false);
  if (!q.ok) return q as Result<never>;
  if (q.value !== null) return ok({ id: q.value, asked: true });
  const waiting = openAsked(deps, list).find((w) => w.offer === null && rows.every((r) => w.members.some((m) => m.id === r.id)));
  return ok(waiting === undefined ? null : { id: waiting.id, asked: false });
}

/**
 * How many people the record holds more than once, as far as the plain rules can tell: the rows that would go if every
 * plain pair he has not answered were one person (three rows of one name are two), and each row marked as the record's
 * own person beyond the first. A row is counted once: his two rows and a third of his name are two, not three. What the
 * `people-twice` figure counts; nought on a record with no people list.
 */
export function peopleTwice(deps: Pick<PeopleDeps, 'sql' | 'list' | 'nameOf' | 'othersRow'>): number {
  const list = deps.list;
  if (!list) return 0;
  /* EACH ROW POINTS AT THE OLDEST IT IS PAIRED WITH, so a group of pairs counts one fewer than its rows. */
  const head = new Map<string, string>();
  const find = (id: string): string => {
    let at = id;
    while (head.get(at) !== undefined && head.get(at) !== at) at = head.get(at)!;
    return at;
  };
  let surplus = 0;
  const join = (a: string, b: string): void => {
    const [x, y] = [find(a), find(b)];
    if (x === y) return;
    head.set(y, x);
    surplus++;
  };
  const own = selfRows(deps, list).filter((r) => deps.othersRow?.(r.id) !== true);
  for (const r of own.slice(1)) join(own[0]!.id, r.id);
  for (const [a, b] of plainPairs(deps, list, false)) join(a.id, b.id);
  return surplus;
}

/* ── the nightly question to a model ─────────────────────────────────── */

/** One side of a pair as a model sees it: a name, where they were seen, and no address. */
export type ResolveSide = { name: string; kind: 'person' | 'organisation'; domain?: string; masked?: string; seen: string[] };

/**
 * An `infer.resolve` job: the pairs, and which two rows each hash is about. `rows` is the record's, read back by the
 * ack; a host builds the model's prompt from `pairs` alone.
 */
export type ResolveJob = { pairs: { hash: string; a: ResolveSide; b: ResolveSide }[]; rows: Record<string, [string, string]> };

/** A stable name for a pair, the same whichever way round: FNV-1a over the two ids, sorted. */
export function pairHash(a: string, b: string): string {
  const text = [a, b].sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** A local part as a model may see it: its first and last letter and how long it is, `s*********a`. */
const masked = (local: string): string => (local.length <= 2 ? '*'.repeat(local.length) : `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}`);

/**
 * Tonight's doubtful pairs, at most `RESOLVE_PAIRS_NIGHT`, or `null` when there are none or a job is already out, or
 * one went out in the last twenty hours. A pair already asked, refused, undone, or handed to a model before is not
 * handed again.
 */
export function resolveJob(deps: Pick<PeopleDeps, 'sql' | 'nowMs' | 'list' | 'nameOf' | 'titleOf'>, max = RESOLVE_PAIRS_NIGHT): ResolveJob | null {
  const list = deps.list;
  if (!list) return null;
  const since = instant(deps.nowMs - 20 * 3_600_000);
  if (deps.sql.one("SELECT 1 AS n FROM outbox WHERE kind = 'infer.resolve' AND (state IN ('pending', 'leased', 'failed') OR created > ?) LIMIT 1", since)) return null;
  const sent = new Set<string>();
  /* ONLY A JOB THAT WAS ANSWERED COUNTS, and only for the pairs its answer spoke about (`answeredOnly` rewrites a done
     job's payload to those). A job that died, or a pair the host could not show a model, is handed again another night. */
  for (const { payload } of deps.sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.resolve' AND state = 'done'")) {
    try {
      for (const hash of Object.keys((JSON.parse(payload) as ResolveJob).rows ?? {})) sent.add(hash);
    } catch {
      /* a payload nobody can read names no pair */
    }
  }
  const people = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} ORDER BY seq DESC LIMIT 2000`,
      ...live(list.register, list.fields.merged_into),
    )
    .map(hydrate);
  /* BUCKETED, NOT EVERY PAIR: two thousand people are two million pairs, and `similar` only ever says yes to two that
     share a first or a last word, a name run together, a handle, or a handle's short form of a name. So each person is
     filed under those, by every name they go by, and only people sharing a bucket are compared. */
  const buckets = new Map<string, Row[]>();
  const file = (word: string, row: Row): void => {
    if (word.endsWith(':')) return;
    const held = buckets.get(word) ?? [];
    if (!held.includes(row)) buckets.set(word, [...held, row]);
  };
  for (const row of people) {
    for (const name of namesOf(list, row)) {
      const words = name.split(' ');
      file(`first:${words[0] ?? ''}`, row);
      if (words.length > 1) file(`last:${words.at(-1)!.replace(/\.$/, '')}`, row);
      const run = compact(name);
      if (run.length >= STEM_LEAST) file(`run:${stem(run)}`, row);
      /* A ONE-WORD NAME MAY BE A SHORT FORM, filed where the long one is: `farahq` with Farah, `tlindqvist` with Lindqvist. */
      if (words.length === 1 && run.length >= STEM_LEAST) {
        file(`first:${run.slice(0, -1)}`, row);
        file(`last:${run.slice(1)}`, row);
      }
      for (const f of shortForms(name)) file(`run:${f}`, row);
    }
    for (const s of stemsOf(list, row)) file(`run:${s}`, row);
  }
  const job: ResolveJob = { pairs: [], rows: {} };
  const seen = new Set<string>();
  for (const held of buckets.values())
    for (let i = 0; i < held.length && job.pairs.length < max; i++)
      for (let j = i + 1; j < held.length && job.pairs.length < max; j++) {
        const [a, b] = [held[i]!, held[j]!];
        const hash = pairHash(a.id, b.id);
        if (seen.has(hash)) continue;
        seen.add(hash);
        if (sent.has(hash) || !similar(list, a, b) || strong(list, a, b) || refused(deps, list, a, b)) continue;
        job.pairs.push({ hash, a: sideOf(deps, list, a), b: sideOf(deps, list, b) });
        job.rows[hash] = [a.id, b.id];
      }
  return job.pairs.length === 0 ? null : job;
}

function sideOf(deps: Pick<PeopleDeps, 'titleOf'>, list: DeclaredList<MeetsFields>, row: Row): ResolveSide {
  const i = identity(list, row);
  const work = i.emails.find((e) => !isPublicMail(e.domain));
  const local = i.emails[0]?.local ?? i.logins[0];
  return {
    /* THE NAME WITHOUT ANY ADDRESS AN OLDER RECORD KEPT IN IT (`nameOfRow`), and the places as their domains (M1). */
    name: nameOfRow(list, row),
    kind: 'person',
    ...(work === undefined ? {} : { domain: work.domain }),
    ...(local === undefined ? {} : { masked: masked(local) }),
    seen: seenOf(deps, list, row),
  };
}

/**
 * Where somebody was seen, in at most three plain phrases: their projects by name, then where they were met, newest
 * first. A line kept before sources were cleaned may hold an address, and it is said as its domain (M1).
 */
function seenOf(deps: Pick<PeopleDeps, 'titleOf'>, list: DeclaredList<MeetsFields>, row: Row): string[] {
  const at = list.fields;
  const seen = [
    ...(at.projects === undefined ? [] : listOf(row.fields[at.projects]).map((p) => deps.titleOf(p)).filter((t): t is string => t !== null)),
    ...listOf(row.fields[at.met]).map((l) => clip(unaddressed(sourceOfLine(l)))).reverse(),
  ];
  return [...new Set(seen.filter((t) => t !== ''))].slice(0, 3);
}

/**
 * A done job's payload cut to the pairs its answer spoke about, so `resolveJob` hands the rest again on a later night. A
 * host answers at most forty pairs and says nothing about one it could not show, and silence is not a verdict.
 */
export function answeredOnly(payload: string, result: unknown): string {
  let job: Partial<ResolveJob>;
  try {
    job = JSON.parse(payload) as Partial<ResolveJob>;
  } catch {
    return payload;
  }
  const said = (result as { verdicts?: unknown } | null | undefined)?.verdicts;
  const answered = new Set(
    (Array.isArray(said) ? (said as { hash?: unknown }[]) : []).map((v) => v?.hash).filter((h): h is string => typeof h === 'string'),
  );
  return JSON.stringify({
    pairs: (job.pairs ?? []).filter((p) => answered.has(p.hash)),
    rows: Object.fromEntries(Object.entries(job.rows ?? {}).filter(([hash]) => answered.has(hash))),
  });
}

/**
 * A model's answer to an `infer.resolve` job, filed: a pair it is at least 0.6 sure of becomes the cluster question,
 * worded as any other and saying it looks likely; under that is left alone, and the pair is never handed again. The
 * answer may speak only about the pairs it was handed: a hash the job did not carry is passed by.
 *
 * NOTHING IS MERGED ON A MODEL'S WORD. A model only proposes (`slash.ts`); a merge made without asking is the strong
 * rules', which are the record's own.
 */
export function fileVerdicts(deps: PeopleDeps, payload: string, result: unknown): Result<string[]> {
  const list = deps.list;
  if (!list) return ok([]);
  let job: Partial<ResolveJob>;
  try {
    job = JSON.parse(payload) as Partial<ResolveJob>;
  } catch {
    return ok([]);
  }
  const said = (result as { verdicts?: unknown } | null | undefined)?.verdicts;
  if (!Array.isArray(said)) return no('VALUE_MALFORMED', 'An answer about pairs carries verdicts: [{ hash, same, confidence }].', { at: 'result.verdicts' });
  const opened: string[] = [];
  for (const v of said as { hash?: unknown; same?: unknown; confidence?: unknown }[]) {
    const pair = typeof v?.hash === 'string' ? job.rows?.[v.hash] : undefined;
    const confidence = typeof v?.confidence === 'number' ? v.confidence : 0;
    if (!pair || v.same !== true || confidence < 0.6) continue;
    const [a, b] = [rowById(deps.sql, pair[0]), rowById(deps.sql, pair[1])];
    if (!a || !b || deps.othersRow?.(a.id) === true || deps.othersRow?.(b.id) === true || refused(deps, list, a, b)) continue;
    const asked = askOrExtend(deps, list, [a, b], confidence);
    if (!asked.ok) return asked as Result<never>;
    if (asked.value !== null) opened.push(asked.value);
  }
  return ok(opened);
}
