/**
 * May be one, on Home: the record's `namedTwice` as the last tile of the board (`NamedTwice.svelte`). ENG-B04 on the
 * screen: two of his things that may be one, by name, with the record's own reason under them, and one press that puts
 * the pair to him on Decide as one question (D38.56). Its yes folds the pair with one Undo; nothing here folds.
 *
 * THROUGH THE RECORD'S OWN `namedTwice` AND `heldTwice` AND NOTHING ELSE. (`heldTwice` over the people list says how many
 * people the kernel holds twice, the pairs a merge question waits on among them, as one line under the pairs.) The record says each pair (`{ pair, kind, how, a, b,
 * evidence, score, can }`); this file only keeps what a person can read. `kind`, `how` and `score` are the record's and
 * are never drawn, and a pair with no handle, or a side with no name or a name that is a raw id (a ULID), is dropped.
 *
 * AN OFFER AND NEVER A FOLD: `askSame` files one question only when he presses, and the question decides nothing.
 *
 * IT NEVER FAILS THE SCREEN. A host built before the read answers `ROUTE_UNKNOWN` or `NOT_IN_THIS_BUILD`, a reader it
 * refuses answers a refusal, and an answer of another shape is none: each is `null`, and `null` draws nothing.
 *
 * A ROUTE-ONLY MODULE, like `learned.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import type { Fetch } from '../record/boot-live.ts';
import { PEOPLE } from '../who.ts';

/** How many pairs the tile lists. The rest are counted in one line under them. */
export const NAMED_SHOWN = 3;

/** How many pairs the tile asks the record for: three to list, and enough past them to count. */
export const NAMED_ASKED = 10;

/** One side of a pair, as the record says it: its name, the register it is held in, and its place there. */
export type NamedSide = { name: string; register: string; seq: number | null };

/** One pair that may be one thing: its handle, the record's words for it (never drawn), both sides and the reason. */
export type NamedPair = {
  pair: string;
  kind: string;
  how: string;
  a: NamedSide;
  b: NamedSide;
  evidence: string;
  score: number | null;
  can: boolean;
  /** What Slash read of the pair when it judged them ("Slash reads these as one."), or empty when nothing judged it. */
  reading: string;
};

/** One line of the tile: the pair's handle, the two names, the reason under them, and whether he can be asked. */
export type NamedLine = { pair: string; text: string; why: string; can: boolean };

/**
 * What the tile draws: its heading, at most three lines, the count of the rest ("and 2 more", or empty), and the people
 * the record holds twice (`people`: how many entries of its people list are one of a pair, 0 for none).
 */
export type NamedTile = { heading: string; lines: NamedLine[]; more: string; people: number };

/** The people line: how many are held twice, said as the People list says it. Empty at nought. */
export const peopleTwiceSaid = (n: number): string => (n <= 0 ? '' : `${n === 1 ? 'One person' : `${String(n)} people`} may be on this record twice`);

/** Where those people are, narrowed to them: the People list with `twice=1`. */
export const PEOPLE_TWICE_HREF = `/r/${PEOPLE}?twice=1`;

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** What a press answers: the question it filed on Decide, or the record's own sentence for why it did not. */
export type Asked = { ok: true; question: string } | { ok: false; fix: string };

/** The tile's heading, the same on every record. */
export const NAMED_HEADING = 'May be one';

/** A raw id as the record mints one. Never a name a person reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads: the record's own words, said plainly. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*—\s*/gu, ', ').trim() : '');

/** One side the screen can name, or `null`: one with no name, or a name that is an id. */
function sideOf(v: unknown): NamedSide | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as { name?: unknown; register?: unknown; seq?: unknown };
  const name = plain(s.name);
  if (name === '' || ULID.test(name)) return null;
  const seq = typeof s.seq === 'number' && Number.isInteger(s.seq) && s.seq > 0 ? s.seq : null;
  return { name, register: plain(s.register), seq };
}

/** One pair the screen can say, or `null`: one with no handle, or a side it cannot name, is dropped. */
function pairOf(v: unknown): NamedPair | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as { pair?: unknown; kind?: unknown; how?: unknown; a?: unknown; b?: unknown; evidence?: unknown; score?: unknown; can?: unknown; reading?: unknown };
  const pair = typeof p.pair === 'string' ? p.pair.trim() : '';
  const a = sideOf(p.a);
  const b = sideOf(p.b);
  if (pair === '' || !a || !b) return null;
  const score = typeof p.score === 'number' && Number.isFinite(p.score) ? p.score : null;
  return { pair, kind: plain(p.kind), how: plain(p.how), a, b, evidence: plain(p.evidence), reading: plain(p.reading), score, can: p.can === true };
}

/** The record's answer as the pairs the screen holds, or `null`. A REFUSAL IS NOTHING, and so is no list of pairs. */
export function namedOf(answer: unknown): NamedPair[] | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { pairs?: unknown };
  if (!Array.isArray(v.pairs)) return null;
  return v.pairs.map(pairOf).filter((p): p is NamedPair => p !== null);
}

/**
 * The tile: the heading, the first three pairs as "<a> and <b>" with the record's reason, and "and N more" for the
 * rest. `null` at nought, which draws nothing.
 */
export function namedTile(pairs: readonly NamedPair[] | null, people = 0): NamedTile | null {
  if (!pairs || pairs.length === 0) return people > 0 ? { heading: NAMED_HEADING, lines: [], more: '', people } : null;
  const lines = pairs.slice(0, NAMED_SHOWN).map((p) => ({ pair: p.pair, text: `${p.a.name} and ${p.b.name}`, why: p.reading === '' ? p.evidence : `${p.reading} ${p.evidence}`, can: p.can }));
  const rest = pairs.length - lines.length;
  return { heading: NAMED_HEADING, lines, more: rest > 0 ? `and ${String(rest)} more` : '', people };
}

/**
 * HOW MANY OF THE PEOPLE THE RECORD HOLDS TWICE, by the record's own `heldTwice` over its people list: the kernel's
 * count of pairs, which includes the pairs a merge question is waiting on (`peopleTwice`), as the row numbers of the
 * entries that are one of a pair. Nought for a refusal, a host without the read, a record that keeps no people, and an
 * answer of another shape.
 */
export function peopleOf(answer: unknown): number {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return 0;
  const seqs = (a.value as { seqs?: unknown }).seqs;
  return Array.isArray(seqs) ? new Set(seqs.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0)).size : 0;
}

/** Ask the record's `namedTwice`. `null` on a refusal, a method the host does not know, nought, or a call that threw. */
export async function readNamedTwice(call: Call): Promise<NamedTile | null> {
  /* THE TWO READS ARE ASKED TOGETHER AND EACH ANSWERS FOR ITSELF: people held twice are shown though organisations and
     projects are not (or the host has no such read), and the other way about. */
  const ask = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    try {
      return await call(name, args);
    } catch {
      return null;
    }
  };
  const [named, held] = await Promise.all([ask('namedTwice', { limit: NAMED_ASKED }), ask('heldTwice', { register: PEOPLE })]);
  try {
    return namedTile(namedOf(named), peopleOf(held));
  } catch {
    return null;
  }
}

/** The pairs the record at `base` may hold twice, as the tile. `null` for none, which draws nothing. */
export async function loadNamedTwice(base: string, io?: Fetch): Promise<NamedTile | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await readNamedTwice((name, args) => client.call(name, args));
  } catch {
    return null;
  }
}

/**
 * HIS PRESS, AND ONLY HIS: put one pair to him on Decide as one question. The question's handle on success; on a
 * refusal the record's own sentence; on anything else the plain one that nothing was saved.
 */
export async function askSame(call: Call, pair: string): Promise<Asked> {
  try {
    const out = (await call('askNamedSame', { pair })) as { ok?: unknown; value?: unknown; refusal?: unknown } | null | undefined;
    if (out?.ok === true) {
      const q = (out.value as { question?: unknown } | null | undefined)?.question;
      if (typeof q === 'string' && q.trim() !== '') return { ok: true, question: q.trim() };
      return { ok: false, fix: copy.recordNotReached };
    }
    const fix = plain((out?.refusal as { fix?: unknown } | null | undefined)?.fix);
    return { ok: false, fix: fix === '' ? copy.recordNotReached : fix };
  } catch {
    return { ok: false, fix: copy.recordNotReached };
  }
}

/** The same press through the record at `base`, for the tile. */
export async function askSameAt(base: string, pair: string, io?: Fetch): Promise<Asked> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await askSame((name, args) => client.call(name, args), pair);
  } catch {
    return { ok: false, fix: copy.recordNotReached };
  }
}
