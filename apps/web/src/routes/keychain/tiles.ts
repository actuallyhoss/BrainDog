/**
 * What `/keychain` says in figures and sentences: the one line under the title, the "Opens by key" tile's
 * bars, figure and reading line, and each key's state as a word.
 *
 * COUNTS AND NAMES, NEVER A VALUE. Everything here is built from what `keysOf` already holds about a key: its name, what
 * it opens, whether a value is sealed, how often it was opened and when. Nothing a key unlocks can reach a bar, a note or
 * a sentence, because nothing here is handed one.
 *
 * NO NUMBER THIS SCREEN WAS NOT GIVEN. `opened` is a lifetime count, so no line says "this month"; and where the record
 * refused `listGrants` there is no count at all, so the tile is not drawn and the sentence says how many keys there are
 * and nothing about how often they were opened.
 *
 * PURE, SO `node --test` CAN IMPORT IT, as `said.ts` is.
 */

import { handleName, relativeWords, since, sinceWords } from 'braindog-render';

import { words as keychain, type KeyRow, type UsedByRun } from '../../lib/record/keychain.ts';
import { OLD_NAME } from '../r/[register]/[seq]/timeline.ts';

export const words = {
  /* The request tile at the top, while a machine waits for its six digits. */
  askingTitle: 'A machine is asking to open your keys',
  waiting: 'Waiting',
  deny: 'Deny',
  denied: (label: string) => `${label} will not open your keys.`,
  /* The figure tile. */
  opensTitle: 'Opens by key',
  opensMeta: 'Counts only, never a value',
  opensUnit: (n: number) => (n === 1 ? 'open' : 'opens'),
  never: 'never opened',
  /* A key's state, said as a word beside a dot. A saved value draws nothing: it is how a key should be. */
  sealedHere: 'Value saved',
  noValue: 'No value yet',
  keptElsewhere: 'Kept elsewhere',
  /* A key's count at the end of its row: how often, and who last, when a run did it. */
  lastBy: (who: string, when: string) => `last by ${who} ${when}`,
  retired: 'Out of service',
  elsewhere: 'No value yet',
  /* The toolbar's add, on a phone, where it is a circle with no words of its own. */
  addKey: 'Add a key',
  /* The one button on a key with no value, where a sealed key has Reveal. */
  sealValue: 'Add value',
  /* WHERE A KEY APPLIES WHEN IT IS NO PROJECT'S, in the row's meta line. */
  allProjects: 'All projects',
  oldNotes: 'From your old notes',
  /* Where a key came from, as its row says it, in the row's menu. */
  cameFrom: 'Came from',
  cameFromSaid: (where: string) => `Came from ${where}`,
  /* WHAT THE ADDRESS ASKED FOR (`?q=`), from a service's page, and the way back to every key. */
  searched: (q: string, n: number) => `${n === 1 ? '1 key' : `${n} keys`} for “${q}”.`,
  everyKey: 'Show every key',
  /* Over the keys, only when the read stopped before the record ran out of them. */
  moreKeys: (n: number) => `The first ${n === 1 ? 'key is' : `${n} keys are`} listed. There are more.`,
  /* THE BOX THAT FINDS A KEY AS IT IS TYPED, and how many keys each project's fold holds. */
  find: 'Find a key',
  keysIn: (n: number) => (n === 1 ? '1 key' : `${n} keys`),
  /* A KEY THE RECORD HOLDS TWICE, as Health counts them. */
  twice: 'Here twice',
  /* A WORD EVERY KEY WITHOUT A VALUE HERE SHARES, said once over the list and not under every row. */
  sharedSaid: (word: string) =>
    word === 'Kept elsewhere' ? 'Keys with no value here are kept elsewhere.' : word === 'Out of service' ? 'Keys with no value here are out of service.' : `${word}.`,
} as const;

/** How many bars the tile draws; the rest of the keys are the list under it. */
export const BARS = 6;

/** "1 key", "4 keys". */
const keysSaid = (n: number): string => (n === 1 ? '1 key' : `${n} keys`);

/** The title row's sentence and, when a machine is waiting, the phrase inside it that needs him. */
export type Sentence = { text: string; needs: string | undefined };

/**
 * THE LINE UNDER "Keychain": how many keys, how often they were opened, and a machine asking, which is the one red.
 *
 * `asking` is counted only for a reader who may see the machines: a reader refused them passes `seesMachines: false`
 * and the clause is not drawn, because a count they were refused is not theirs to read in a sentence either.
 */
export function sentenceOf(o: { keys: readonly KeyRow[]; listed: boolean; counts: boolean; asking: number; seesMachines: boolean; retired?: number }): Sentence | null {
  const parts: string[] = [];
  if (o.listed && o.keys.length > 0) {
    /* "6 keys. 2 have no value yet.": the keys with a value nowhere are the ones to see to, counted as Agents counts
       them (`keys-nowhere`), and "sealed" is not a word on screen. */
    const sealed = o.keys.filter((k) => k.sealed);
    const total = sealed.reduce((sum, k) => sum + k.opened, 0);
    parts.push(o.counts && sealed.length > 0 ? `${keysSaid(o.keys.length)}, ${total === 0 ? 'none opened yet' : keychain.opened(total)}.` : `${keysSaid(o.keys.length)}.`);
    const none = o.keys.filter(missing).length;
    if (none > 0) parts.push(`${none === 1 ? '1 has' : `${none} have`} no value yet.`);
    /* THE RETIRED ONES ARE COUNTED BESIDE THEM: Search's Keys counts every row, so "83 keys" here and "176" there
       read as two records. */
    const retired = o.retired ?? 0;
    if (retired > 0) parts.push(`${retired === 1 ? '1 more is' : `${retired} more are`} retired and not listed here.`);
  }
  let needs: string | undefined;
  if (o.seesMachines && o.asking > 0) {
    const them = parts.length > 0 ? 'them' : 'your keys';
    needs = o.asking === 1 ? `A machine is asking to open ${them}` : `${o.asking} machines are asking to open ${them}`;
    parts.push(`${needs}.`);
  }
  return parts.length === 0 ? null : { text: parts.join(' '), needs };
}

/** One bar: a key's name, how often it was opened, and when last. */
export type Bar = { label: string; value: number; tone?: 'ink' | undefined; note?: string | undefined };

/** The figure tile: the total, its bars and the one line that reads them. */
export type OpensTile = { total: number; bars: Bar[]; reading: string };

/** A name held to a bar label's room, with an ellipsis rather than a label running into its bar. */
export const clip = (label: string, most = 24): string => (label.length <= most ? label : `${label.slice(0, most - 1).trimEnd()}…`);

/**
 * "Opens by key": the sealed keys, most opened first, the first in ink and the rest grey, and a sentence saying who.
 *
 * ONLY SEALED KEYS ARE COUNTED. A key kept elsewhere or taken out of service has no count of its own on this record, and
 * drawing it as a zero-length bar would say "nobody opened it", which is this screen's guess and not the record's fact.
 * `null` when there is nothing to draw: no sealed key, or no count came back.
 */
export function opensOf(keys: readonly KeyRow[], lastBy: ReadonlyMap<string, UsedByRun>, counts: boolean, now: number = Date.now()): OpensTile | null {
  if (!counts) return null;
  const sealed = keys.filter((k) => k.sealed);
  if (sealed.length === 0) return null;
  const ranked = [...sealed].sort((a, b) => b.opened - a.opened || a.label.localeCompare(b.label));
  const bars = ranked.slice(0, BARS).map(
    (k, i): Bar => ({
      label: clip(k.label),
      value: k.opened,
      ...(i === 0 && k.opened > 0 ? { tone: 'ink' as const } : {}),
      note: k.lastOpened ? since(k.lastOpened, now) : k.opened === 0 ? words.never : undefined,
    }),
  );
  const total = sealed.reduce((sum, k) => sum + k.opened, 0);
  return { total, bars, reading: readingOf(ranked, lastBy, now) };
}

/**
 * THE ONE LINE UNDER THE BARS: the most opened key, who opened it last, and how many were never opened.
 * "Payments service was opened 12 times, last by claude 2d ago, and 2 keys have never been opened."
 */
export function readingOf(ranked: readonly KeyRow[], lastBy: ReadonlyMap<string, UsedByRun>, now: number = Date.now()): string {
  const top = ranked[0];
  if (!top) return '';
  if (top.opened === 0) return ranked.length === 1 ? `Nobody has opened ${top.label} yet.` : 'Nobody has opened any of these keys yet.';
  const who = lastBy.get(top.id);
  const last = who ? `, last by ${who.agent ?? who.run} ${since(who.at, now)}` : top.lastOpened ? `, last ${since(top.lastOpened, now)}` : '';
  const never = ranked.filter((k) => k.opened === 0).length;
  const tail = never === 0 ? '' : never === 1 ? ', and 1 key has never been opened' : `, and ${never} keys have never been opened`;
  return `${top.label} was ${keychain.opened(top.opened)}${last}${tail}.`;
}

/** A key with a value nowhere: none here, none taken out of service, and nowhere it says it is kept. */
export const missing = (k: KeyRow): boolean => !k.sealed && !k.grant && !k.kept;

/**
 * A key's state as a word, whether a value is sealed on this record behind it, and whether it needs one (`warn`, the
 * ring and the words). A saved value is drawn as nothing at all.
 */
export const stateOf = (k: KeyRow): { word: string; sealed: boolean; warn: boolean } =>
  k.sealed
    ? { word: words.sealedHere, sealed: true, warn: false }
    : k.grant
      ? { word: words.retired, sealed: false, warn: false }
      : k.kept
        ? { word: words.keptElsewhere, sealed: false, warn: false }
        : { word: words.noValue, sealed: false, warn: true };

/**
 * WHAT A SEALED KEY IS, UNOPENED: the hint the record stored when it sealed it ("a 40-character value"), or `null`.
 *
 * ONLY FOR A VALUE THAT IS THERE. A key with no value, or one taken out of service, has nothing to hint at, and a seal
 * older than the hint carries none: nothing is written here from the size alone, because the sentence is the record's.
 */
export const hintOf = (k: KeyRow): string | null => {
  const hint = k.sealed ? (k.hint?.trim() ?? '') : '';
  return hint === '' ? null : hint;
};

/**
 * THE ONE BUTTON AT THE END OF A KEY'S ROW: Reveal where a value is sealed behind a grant, "Add value" where the
 * row holds none, which opens the sheet Replace opens and seals onto that same row.
 *
 * `null` for a row that is sealed and names no grant to open: there is a value, and no door to it from here.
 */
export const rowAction = (k: KeyRow): { act: 'reveal' } | { act: 'seal'; word: string } | null =>
  k.sealed ? (k.grant ? { act: 'reveal' } : null) : { act: 'seal', word: words.sealValue };

/**
 * WHERE EACH KEY CAME FROM, by the key's row id, for the rows that say so. Read from the rows the index was built
 * from, so a key whose row says nothing has no line, and none is guessed from its name or what it opens.
 */
export function cameFromOf(rows: readonly { id: string; fields: Record<string, unknown> }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const where = typeof r.fields.origin === 'string' ? r.fields.origin.trim() : '';
    if (where !== '') out.set(r.id, where);
  }
  return out;
}

/** A key's row page, `credentials#3` to `/r/credentials/3`, or `null` for a row read without its number. */
export const rowPath = (k: KeyRow): string | null => {
  const m = k.spoken === null ? null : /^([a-z0-9_-]+)#([1-9][0-9]*)$/u.exec(k.spoken);
  return m ? `/r/${m[1]}/${m[2]}` : null;
};

/* ── grouped, and in words ────────────────────────────────────────────── */

/** One project's keys, and inside it one group a service: who they are with, or `null` for the keys that say no one. */
export type KeyGroup = { name: string; scope: KeyRow['scope']; services: { provider: string | null; keys: KeyRow[] }[] };

/**
 * THE KEYCHAIN BY PROJECT, THEN BY SERVICE (24 October): one flat list of 176 read as a dump. Each project's keys
 * under its name, the projects by name and the keys that apply everywhere last; inside each, a group a service by who
 * the key is with, by name, and the keys that name nobody after them. Each key keeps the order it came in.
 */
export function groupsOf(keys: readonly KeyRow[]): KeyGroup[] {
  const projects = new Map<string, KeyGroup>();
  for (const k of keys) {
    /* A PROJECT NAMED FOR THE PRODUCT THIS RECORD CAME FROM ("The Mara Brain") is said as what it is: from his old
       notes. Only the words; the project keeps its name. */
    const raw = k.scope?.name ?? k.project ?? words.allProjects;
    const name = OLD_NAME.test(raw) ? words.oldNotes : raw;
    const at = k.scope || k.project ? name : '';
    let g = projects.get(at);
    if (!g) projects.set(at, (g = { name, scope: k.scope ? { ...k.scope, name } : k.scope, services: [] }));
    const provider = k.provider ?? null;
    let s = g.services.find((x) => x.provider === provider);
    if (!s) g.services.push((s = { provider, keys: [] }));
    s.keys.push(k);
  }
  const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });
  for (const g of projects.values()) g.services.sort((a, b) => (a.provider === b.provider ? 0 : a.provider === null ? 1 : b.provider === null ? -1 : byName(a.provider, b.provider)));
  return [...projects.entries()].sort(([a], [b]) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : byName(a, b))).map(([, g]) => g);
}

/** The keys the address asked for (`?q=`): a name, what it opens or who it is with holding the words, any case. */
export function keysFor(keys: readonly KeyRow[], q: string | null): KeyRow[] {
  const t = (q ?? '').trim().toLowerCase();
  if (t === '') return [...keys];
  return keys.filter((k) => [k.label, k.opens, k.provider ?? ''].some((v) => v.toLowerCase().includes(t)));
}

const DAY = /\b(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?![\d-])/gu;
const HANDLE = /\b[a-z][a-z0-9_]*#[1-9]\d*\b/gu;

/**
 * WHAT A KEY OPENS, IN WORDS (24 October): the text is the record's, often an agent's, and it said "imported 2026-09-01"
 * and "the index row is credentials#26". A day is said as how long ago ("3 weeks ago"), and a key named by its handle is
 * said by its name; a handle this screen cannot name is left as it was written.
 */
export function opensInWords(text: string, keys: readonly KeyRow[], now: number = Date.now()): string {
  const named = new Map(keys.flatMap((k) => (k.spoken ? [[k.spoken, k.label] as const] : [])));
  return text
    .replace(DAY, (whole: string, day: string) => {
      if (!Number.isFinite(Date.parse(whole.length > 10 ? whole : day))) return whole;
      return whole.length > 10 ? sinceWords(whole, now) : relativeWords(day, now);
    })
    .replace(HANDLE, (whole) => named.get(whole) ?? whole);
}

/* ── found, folded and marked ───────────────────────────────────── */

/**
 * WHETHER THE PROJECTS OPEN UNFOLDED: while a search is typed, so what it found shows, and where there is only one
 * project, which has nothing to fold. Otherwise each project is its name and its count, and opens on a press.
 */
export const foldsOpen = (groups: readonly KeyGroup[], typed: string): boolean => typed.trim() !== '' || groups.length <= 1;

/** The ids of the keys the record holds twice, from the numbers its `heldTwice` answered for the Keys list. */
export function twinsOf(keys: readonly KeyRow[], seqs: readonly number[]): Set<string> {
  const held = new Set(seqs.map((n) => `credentials#${n}`));
  return new Set(keys.filter((k) => k.spoken !== null && held.has(k.spoken)).map((k) => k.id));
}

/**
 * THE WORD EVERY KEY WITHOUT A VALUE HERE SHARES, when two or more do and they all say the same calm thing: "Kept
 * elsewhere" under each of 176 rows said one fact 176 times. `null` where they differ, where one key alone says it, and
 * for "No value yet", which keeps its ring and its words on each row since each one is a thing to see to.
 */
export function sharedState(keys: readonly KeyRow[]): string | null {
  const states = keys.map(stateOf).filter((st) => !st.sealed);
  if (states.length < 2 || states.some((st) => st.warn)) return null;
  const word = states[0]!.word;
  return states.every((st) => st.word === word) ? word : null;
}

/* ── sorted, dated and used by ────────────────────────────────────────── */

/** The orders the Keys list is drawn in. The choice is the screen's, never the address's. */
export type SortBy = 'name' | 'opened-recently' | 'changed-recently' | 'most-opened';

export const SORTS: readonly { id: SortBy; name: string }[] = [
  { id: 'name', name: 'Name' },
  { id: 'opened-recently', name: 'Recently opened' },
  { id: 'changed-recently', name: 'Recently changed' },
  { id: 'most-opened', name: 'Most opened' },
];

const byName = (a: KeyRow, b: KeyRow): number => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
const stamp = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/** The keys in the order asked, a new array. A key with no date for the order sorts after those with one, by name. */
export function sortKeys(keys: readonly KeyRow[], by: SortBy): KeyRow[] {
  const out = [...keys];
  const newest = (date: (k: KeyRow) => number): KeyRow[] =>
    out.sort((a, b) => {
      const x = date(a);
      const y = date(b);
      return x === y ? byName(a, b) : y > x ? 1 : -1;
    });
  switch (by) {
    case 'opened-recently':
      return newest((k) => stamp(k.lastOpened));
    case 'changed-recently':
      return newest((k) => stamp(k.changed));
    case 'most-opened':
      return out.sort((a, b) => b.opened - a.opened || byName(a, b));
    default:
      return out.sort(byName);
  }
}

export const dated = {
  sortLabel: 'Sort keys',
  changed: (when: string) => `Changed ${when}`,
  expires: (when: string) => `Expires ${when}`,
  expired: (when: string) => `Expired ${when}`,
  usedBy: 'Used by',
  usedByNone: 'Nothing names this key yet.',
  usedByMany: (n: number) => `Used by ${n.toLocaleString('en')} things`,
  details: 'Details',
  locked: 'Locked',
  lockedWhy: 'The Keychain locked itself after a while with no one here. Confirm it is you to open your keys.',
  lockedByYou: 'You locked the Keychain. Confirm it is you to open your keys again.',
  unlock: 'Unlock',
  lockNow: 'Lock now',
  asOf: (day: string) => `as of ${day}`,
} as const;

/** "Changed 3 weeks ago", or `null` for a key whose grant dates nothing. */
export const changedSaid = (k: KeyRow, now: number = Date.now()): string | null => (k.changed ? dated.changed(sinceWords(k.changed, now)) : null);

/**
 * "Expires in 2 weeks" or "Expired 3 days ago", from the register's deadline, or `null` for a key with none. AND NONE FOR
 * A KEY WITH NO VALUE (AF14): "No value yet" beside "Expired 6 weeks ago" was a value that never was, gone stale.
 */
export function expiresSaid(k: KeyRow, now: number = Date.now()): string | null {
  if (!k.expires || !k.sealed) return null;
  const said = relativeWords(k.expires, now);
  return Date.parse(`${k.expires}T12:00:00Z`) < now - 43_200_000 ? dated.expired(said) : dated.expires(said);
}

/** What the screen has already read that can name a key: scheduled actions, tools and scripts. */
export type UseSources = {
  actions?: readonly { ingest: string; key: string | null }[];
  /** Tool rows as a list read gives them, with the list's id in `register` so the row's page can be linked. */
  tools?: readonly { id: string; seq?: number | null; register?: string; fields: Record<string, unknown> }[];
  scripts?: readonly { script: string; title: string; keys: readonly string[] }[];
  /** The record's answer to which tools need which key, by the key's spoken id: `keyUses`. */
  keyUses?: readonly { credential: string; tool: string; title: string }[];
};

export type Use = { kind: 'action' | 'tool' | 'script'; name: string; href: string | null };

/**
 * WHO NAMES THIS KEY, from reads that already exist: an action's `key` and a script's `keys` are the key's label; a
 * tool's `needs` names `credentials#n` or the label. Nothing is guessed from a likeness, and no value is read.
 */
/* A HANDLE IS SAID IN WORDS (AF14): "Used by fenwick, ledger-post" named a tool and an action by what they are filed as. */
const HANDLE_NAME = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/u;
const wordsOf = (name: string): string => (HANDLE_NAME.test(name.trim()) ? handleName(name.trim()) : name);

export function usesOf(k: KeyRow, from: UseSources): Use[] {
  const label = k.label.trim().toLowerCase();
  const names = (v: string): boolean => {
    const t = v.trim().toLowerCase();
    return t !== '' && (t === label || (k.spoken !== null && t === k.spoken.toLowerCase()));
  };
  const out: Use[] = [];
  for (const a of from.actions ?? []) if (a.key !== null && names(a.key)) out.push({ kind: 'action', name: wordsOf(a.ingest), href: null });
  for (const t of from.tools ?? []) {
    const needs = Array.isArray(t.fields.needs) ? t.fields.needs.filter((n): n is string => typeof n === 'string') : [];
    if (needs.some(names)) out.push({ kind: 'tool', name: wordsOf(String(t.fields.name ?? t.id)), href: typeof t.seq === 'number' && t.register ? `/r/${t.register}/${t.seq}` : null });
  }
  for (const u of from.keyUses ?? []) if (k.spoken !== null && u.credential.toLowerCase() === k.spoken.toLowerCase()) out.push({ kind: 'tool', name: wordsOf(u.title), href: null });
  for (const s of from.scripts ?? []) if (s.keys.some(names)) out.push({ kind: 'script', name: s.title || wordsOf(s.script), href: null });
  return out;
}
