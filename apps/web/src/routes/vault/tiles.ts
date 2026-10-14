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

import { since } from 'braindog-render';

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
  /* A key's state, said as a word beside a dot. */
  sealedHere: 'Sealed',
  /* A key's count at the end of its row: how often, and who last, when a run did it. */
  lastBy: (who: string, when: string) => `last by ${who} ${when}`,
  retired: 'Out of service',
  elsewhere: 'Not sealed here',
  /* The toolbar's add, on a phone, where it is a circle with no words of its own. */
  addKey: 'Add a key',
  /* The one button on a key with no value, where a sealed key has Reveal. */
  sealValue: 'Seal a value',
  /* Where a key came from, as its row says it, in the row's menu. */
  cameFrom: 'Came from',
  cameFromSaid: (where: string) => `Came from ${where}`,
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
    const sealed = o.keys.filter((k) => k.sealed);
    const head = sealed.length === o.keys.length ? `${keysSaid(o.keys.length)} sealed` : `${keysSaid(o.keys.length)}, ${sealed.length} sealed here`;
    const total = sealed.reduce((sum, k) => sum + k.opened, 0);
    parts.push(o.counts && sealed.length > 0 ? `${head}, ${total === 0 ? 'none opened yet' : vault.opened(total)}.` : `${head}.`);
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

/** A key's state as a word, and whether a value is sealed on this record behind it. */
export const stateOf = (k: KeyRow): { word: string; sealed: boolean } =>
  k.sealed ? { word: words.sealedHere, sealed: true } : { word: k.grant ? words.retired : words.elsewhere, sealed: false };

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
 * THE ONE BUTTON AT THE END OF A KEY'S ROW: Reveal where a value is sealed behind a grant, "Seal a value" where the
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
