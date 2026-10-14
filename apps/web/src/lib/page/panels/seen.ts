/**
 * Where the record met one thing: the places the `about` read answers for the row a page is about, as lines a person
 * reads under the page's "Where it was seen" (ENG-B03, over ENG-B02 job 5's read).
 *
 * ASKED BY THE ROW, NEVER BY ITS NAME. `{ row: { register, seq } }` is the one thing the page is drawn for, so no name
 * two things share can put another's places here. An answer that is candidates and no one thing draws nothing: this
 * panel never picks.
 *
 * THE RECORD'S OWN WORDS. Each place is said as the record says it, "Notes: Spoke to Sara at Northbank about the
 * renewal", after the day it was seen, "3 Oct", with its year when that is not this year. The read already passes no
 * id and no address; a place that still holds one is left out rather than printed.
 *
 * WHAT WAITS ON HIM IS A PLACE TOO. The read answers an open question that names the thing as "Waiting on you: Renew
 * Copperleaf's domain for another year?", and it is drawn as it came, after its day, among the other places.
 *
 * ONE SENTENCE AT NOUGHT, NOTHING ON A REFUSAL. One thing seen nowhere says "Nothing on the record mentions Copperleaf
 * yet." under the heading, so the tile never stands over an empty body. A reader the read refuses, an answer that is
 * candidates, and a host with no `about` all answer `null`, and `null` draws nothing.
 *
 * PURE, AND NODE LOADS IT: no import at all, so the panel's chunk carries it and the entry chunk never does.
 */

/** How the web asks the record a method by its name: `client.call(name, args)`. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** One place the thing was seen: the day as the record wrote it (`2026-10-03`), and the place in its words. */
export type SeenPlace = { day: string; where: string };

/** What the panel draws from: the thing's name and its other names, the first places, and how many more there are. */
export type Seen = { name: string; also: string[]; places: SeenPlace[]; more: number };

/**
 * What a reader is shown: one line a place, the other names in one sentence, the count of the rest, and the one
 * sentence said when the thing was seen nowhere.
 */
export type SeenLines = { lines: string[]; also: string | null; more: string | null; none: string | null };

/** How many places are drawn before "and N more". */
export const SEEN_SHOWN = 8;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* A row's id as the record mints one, and an address of any kind: neither is a place a person reads. */
const ROW_ID = /(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/i;
const ADDRESS = /[a-z][a-z0-9+.-]*:\/\/|\b[\w.+-]+@[\w-]+\.[\w.]+/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})/u;

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/gu, ' ').trim() : '');

/* NO EM DASH in a line a person reads: the record's "Notes — Kickoff" is said "Notes, Kickoff". */
const plain = (s: string): string => s.replace(/\s*—\s*/gu, ', ');

/** The answer `about` gave, as what the panel draws, or `null` for anything that is not one thing seen somewhere. */
export function seenOf(answer: unknown): Seen | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const is = (a.value as { is?: unknown }).is as { name?: unknown; also?: unknown; seen?: unknown } | null | undefined;
  if (typeof is !== 'object' || is === null) return null;
  const name = text(is.name);
  const also = Array.isArray(is.also) ? [...new Set(is.also.map(text))].filter((n) => n !== '' && n !== name) : [];
  const all: SeenPlace[] = [];
  for (const s of Array.isArray(is.seen) ? (is.seen as { at?: unknown; where?: unknown }[]) : []) {
    const day = DAY.exec(text(s?.at))?.[0];
    const where = plain(text(s?.where));
    if (!day || where === '' || ROW_ID.test(where) || ADDRESS.test(where)) continue;
    all.push({ day, where });
  }
  /* ONE THING SEEN NOWHERE is still that thing: the panel says so in one sentence (`seenLines`). */
  if (all.length === 0) return name === '' ? null : { name, also, places: [], more: 0 };
  /* NEWEST FIRST, whatever order they came in. */
  all.sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0));
  return { name, also, places: all.slice(0, SEEN_SHOWN), more: Math.max(0, all.length - SEEN_SHOWN) };
}

/** Ask the record's `about` for one row. `null` on a refusal, a method the host does not know, or a call that threw. */
export async function readSeen(call: Call, row: { register: string; seq: number }): Promise<Seen | null> {
  try {
    return seenOf(await call('about', { row: { register: row.register, seq: row.seq } }));
  } catch {
    return null;
  }
}

/** `2026-10-03` as a reader says it: "3 Oct" this year, "3 Oct 2025" in another. */
export function seenDay(day: string, now: number): string {
  const d = DAY.exec(day);
  if (!d) return '';
  const words = `${Number(d[3])} ${SHORT[Number(d[2]) - 1] ?? ''}`.trim();
  return Number(d[1]) === new Date(now).getUTCFullYear() ? words : `${words} ${d[1]}`;
}

/** "Sara I." alone, "Sara I. and S. Idris", "A, B and C". */
const joined = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The lines the panel draws: "3 Oct · Notes: Spoke to Sara at Northbank", "Also known as Sara I.", "and 4 more". */
export function seenLines(found: Seen | null, now: number): SeenLines {
  if (!found) return { lines: [], also: null, more: null, none: null };
  if (found.places.length === 0) return { lines: [], also: null, more: null, none: found.name === '' ? null : `Nothing on the record mentions ${found.name} yet.` };
  const lines = found.places.slice(0, SEEN_SHOWN).map((p) => `${seenDay(p.day, now)} · ${p.where}`);
  const rest = found.more + Math.max(0, found.places.length - SEEN_SHOWN);
  const names = joined(found.also);
  return {
    lines,
    also: names === '' ? null : `Also known as ${names}${names.endsWith('.') ? '' : '.'}`,
    more: rest > 0 ? `and ${rest.toLocaleString('en-GB')} more` : null,
    none: null,
  };
}
