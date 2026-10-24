/**
 * What `/vault` says in figures and sentences: the one line under the title, the "Opens by key" tile's
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

import { relativeWords, since, sinceWords } from 'braindog-render';

import { words as vault, type KeyRow, type UsedByRun } from '../../lib/record/vault.ts';

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
  /* Where a key came from, as its row says it, in the row's menu. */
  cameFrom: 'Came from',
  cameFromSaid: (where: string) => `Came from ${where}`,
  /* WHAT THE ADDRESS ASKED FOR (`?q=`), from a service's page, and the way back to every key. */
  searched: (q: string, n: number) => `${n === 1 ? '1 key' : `${n} keys`} for “${q}”.`,
  everyKey: 'Show every key',
  /* Over the keys, only when the read stopped before the record ran out of them. */
  moreKeys: (n: number) => `The first ${n === 1 ? 'key is' : `${n} keys are`} listed. This record holds more.`,
} as const;

/** How many bars the tile draws; the rest of the keys are the list under it. */
export const BARS = 6;

/** "1 key", "4 keys". */
const keysSaid = (n: number): string => (n === 1 ? '1 key' : `${n} keys`);

/** The title row's sentence and, when a machine is waiting, the phrase inside it that needs him. */
export type Sentence = { text: string; needs: string | undefined };

/**
 * THE LINE UNDER "Vault": how many keys, how often they were opened, and a machine asking, which is the one red.
 *
 * `asking` is counted only for a reader who may see the machines: a reader refused them passes `seesMachines: false`
 * and the clause is not drawn, because a count they were refused is not theirs to read in a sentence either.
 */
export function sentenceOf(o: { keys: readonly KeyRow[]; listed: boolean; counts: boolean; asking: number; seesMachines: boolean }): Sentence | null {
  const parts: string[] = [];
  if (o.listed && o.keys.length > 0) {
    /* "6 keys. 2 have no value yet.": the keys with a value nowhere are the ones to see to, counted as Agents counts
       them (`keys-nowhere`), and "sealed" is not a word on screen. */
    const sealed = o.keys.filter((k) => k.sealed);
    const total = sealed.reduce((sum, k) => sum + k.opened, 0);
    parts.push(o.counts && sealed.length > 0 ? `${keysSaid(o.keys.length)}, ${total === 0 ? 'none opened yet' : vault.opened(total)}.` : `${keysSaid(o.keys.length)}.`);
    const none = o.keys.filter(missing).length;
    if (none > 0) parts.push(`${none === 1 ? '1 has' : `${none} have`} no value yet.`);
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
  return `${top.label} was ${vault.opened(top.opened)}${last}${tail}.`;
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
 * THE VAULT BY PROJECT, THEN BY SERVICE (24 October, U-B23): one flat list of 176 read as a dump. Each project's keys
 * under its name, the projects by name and the keys that apply everywhere last; inside each, a group a service by who
 * the key is with, by name, and the keys that name nobody after them. Each key keeps the order it came in.
 */
export function groupsOf(keys: readonly KeyRow[]): KeyGroup[] {
  const projects = new Map<string, KeyGroup>();
  for (const k of keys) {
    const name = k.scope?.name ?? k.project ?? words.allProjects;
    const at = k.scope || k.project ? name : '';
    let g = projects.get(at);
    if (!g) projects.set(at, (g = { name, scope: k.scope, services: [] }));
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
