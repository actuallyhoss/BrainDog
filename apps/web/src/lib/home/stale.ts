/**
 * What went stale, on Home: the record's own `stale` as lines a person can read (`Stale.svelte`).
 *
 * THROUGH THE RECORD'S OWN `stale` AND NOTHING ELSE. The record counts what went stale where the reader stands, a line
 * a kind, held to what that reader may read; this file only turns each into what a screen draws: its sentence, how
 * many, and the place it is cleared from.
 *
 * A PERSON IS GIVEN A PLACE, NEVER A CALL. Each line of the record's carries `clear`, the one call that clears it, said
 * for an agent ("handoff with drop ..."). None of it is kept here: steps nobody took are cleared where the agents'
 * work is read, a question that waited is answered in Decide, and a kind with no place of its own is words alone.
 *
 * IT NEVER FAILS THE SCREEN. A record with no such call, a reader it refuses, a record where nothing is stale and a
 * line that dropped all answer nothing, and nothing draws nothing: Home stands as it did before.
 *
 * AND TWO THINGS THE LESSONS SAY, under the record's own lines (AGT-C16, AGT-D15): a skill whose lessons its text does
 * not take in yet ("deploy has 2 lessons it does not take in yet", a link to the skill), and one lesson two projects
 * learned ("Kiln and Portage learned the same thing", with the one press that puts "Keep it once" to the person on
 * Decide). Each is its own read, `skillsBehind` and `learningsTwice`; a host that answers neither draws what it drew.
 *
 * NOTHING HERE ASKS BY ITSELF. The pair's line carries the press, and the question is filed only when it is pressed,
 * signed by whoever pressed it (`keepOnce`, the record's `promoteLearnings`).
 *
 * A ROUTE-ONLY MODULE, like `matched.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';
import { rowHref } from '../record/row-href.ts';

/** How many kinds the tile lists. What is in the rest is counted in one line under them. */
export const STALE_SHOWN = 6;

/**
 * One kind of stale thing as it is drawn. `key` is the record's word for the kind and is never drawn; `href` is where
 * a person clears it, or `null` for a kind with no place of its own.
 *
 * `keep` IS ON A LESSON TWO PROJECTS LEARNED and on nothing else: the press that puts the question on Decide, bound to
 * the record the line was read from. `pair` is which two lessons, by their handles, and is never drawn.
 */
export type StaleRow = {
  key: string;
  said: string;
  count: number;
  href: string | null;
  pair?: Pair;
  keep?: () => Promise<Kept>;
};

/** Two lessons learned in two projects, by their spoken handles, older first. */
export type Pair = { older: string; newer: string };

/** A call's answer as far as this file reads one. */
type Called = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };

/** The client's own `call`, handed in so this is driven without a record. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<Called>;

/** What the press answers: where the question waits on Decide, or plain words and whether the press goes. */
export type Kept = { ok: true; href: string } | { ok: false; said: string; gone: boolean };

/** Where each kind is cleared by a person: the page the agents pack declares, and Decide. */
const PLACE: Readonly<Record<string, string>> = { steps: '/p/agents', questions: '/decide' };

/**
 * The record's answer as the kinds to draw, in its order.
 *
 * A LINE THE SCREEN CANNOT SAY IS DROPPED: one with no sentence, no kind, or a count that is not a whole number above
 * none. A REFUSAL IS NOTHING, whichever it is: a host built before the read answers `NOT_IN_THIS_BUILD`, and that is
 * nothing a person can act on. A KIND IS SAID ONCE, as the record says it.
 */
export function staleRows(answer: unknown): StaleRow[] {
  const a = answer as { ok?: unknown; value?: { lines?: unknown } | null } | null | undefined;
  const lines = a?.ok === true ? a.value?.lines : undefined;
  if (!Array.isArray(lines)) return [];
  const rows: StaleRow[] = [];
  const seen = new Set<string>();
  for (const line of lines as unknown[]) {
    if (typeof line !== 'object' || line === null) continue;
    const l = line as { kind?: unknown; said?: unknown; count?: unknown };
    const kind = typeof l.kind === 'string' ? l.kind.trim() : '';
    const said = typeof l.said === 'string' ? l.said.trim() : '';
    const count = typeof l.count === 'number' && Number.isInteger(l.count) ? l.count : 0;
    if (kind === '' || said === '' || count <= 0 || seen.has(kind)) continue;
    seen.add(kind);
    rows.push({ key: kind, said, count, href: Object.hasOwn(PLACE, kind) ? PLACE[kind]! : null });
  }
  return rows;
}

/** The first six kinds to list, and how many things are in the kinds after them. */
export function staleShown(rows: readonly StaleRow[]): { shown: StaleRow[]; more: number } {
  return { shown: rows.slice(0, STALE_SHOWN), more: rows.slice(STALE_SHOWN).reduce((n, r) => n + r.count, 0) };
}

/**
 * THE ONE LINE ON THE BOARD: "4 things went stale", "1 thing went stale", and `null` for none, which
 * draws nothing. It counts the things and not the kinds, every kind and not only the six listed.
 */
export function staleLine(rows: readonly StaleRow[]): string | null {
  const n = rows.reduce((sum, r) => sum + r.count, 0);
  if (n <= 0) return null;
  return n === 1 ? '1 thing went stale' : `${String(n)} things went stale`;
}

/* ── what the lessons say ─────────────────────────────────────────────────── */

/** How many skills behind their lessons are asked for. Each is a line, and the tile lists six lines in all. */
const BEHIND_ASKED = 3;

/** A call's value, or `null` for a refusal, an unknown method, a host that threw and an answer that is not one. */
async function valueOf(call: Call, name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const out = await call(name, args);
    return out.ok ? (out.value ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * The two reads the lessons answer, asked once each and side by side: the skills behind them and the lessons two
 * projects learned. Each is `null` where the host does not answer it, and `null` draws nothing.
 */
export async function readLessons(call: Call): Promise<{ behind: unknown; twice: unknown }> {
  const [behind, twice] = await Promise.all([valueOf(call, 'skillsBehind', { limit: BEHIND_ASKED }), valueOf(call, 'learningsTwice', {})]);
  return { behind, twice };
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "deploy has 2 lessons it does not take in yet", and one is "a lesson". */
export const behindSaid = (name: string, n: number): string =>
  n === 1 ? `${name} has a lesson it does not take in yet` : `${name} has ${String(n)} lessons it does not take in yet`;

/** "Kiln and Portage learned the same thing". */
export const twiceSaid = (a: string, b: string): string => `${a} and ${b} learned the same thing`;

/**
 * The lines the lessons answer, after the record's own: a skill a line, then a pair a line.
 *
 * A SKILL IS SAID BY ITS NAME and opens its own page (`href`, the row link every screen uses); one with no name, no
 * handle or no lesson behind it is dropped. A PAIR IS SAID BY ITS TWO PROJECTS' NAMES, and one missing either name or
 * either handle is dropped. `call` binds the pair's press; without it the line is words alone. A handle is never drawn.
 * Each side of a pair is the record's `{ spoken, lesson, project }`, older first.
 */
export function lessonRows(
  lessons: { behind: unknown; twice: unknown },
  call?: Call,
  href: (spoken: string) => string | null = rowHref,
): StaleRow[] {
  const rows: StaleRow[] = [];
  const seen = new Set<string>();
  const skills = (lessons.behind as { skills?: unknown } | null)?.skills;
  for (const s of Array.isArray(skills) ? (skills as unknown[]) : []) {
    if (typeof s !== 'object' || s === null) continue;
    const one = s as { skill?: unknown; name?: unknown; behind?: unknown; count?: unknown };
    const handle = text(one.skill);
    const name = text(one.name);
    const n = typeof one.count === 'number' && Number.isInteger(one.count) ? one.count : Array.isArray(one.behind) ? one.behind.length : 0;
    const key = `behind:${handle}`;
    if (handle === '' || name === '' || n <= 0 || seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, said: behindSaid(name, n), count: n, href: href(handle) });
  }
  const pairs = (lessons.twice as { pairs?: unknown } | null)?.pairs;
  for (const p of Array.isArray(pairs) ? (pairs as unknown[]) : []) {
    if (typeof p !== 'object' || p === null) continue;
    const one = p as { older?: { spoken?: unknown; project?: unknown } | null; newer?: { spoken?: unknown; project?: unknown } | null };
    const pair = { older: text(one.older?.spoken), newer: text(one.newer?.spoken) };
    const [a, b] = [text(one.older?.project), text(one.newer?.project)];
    const key = `twice:${pair.older}:${pair.newer}`;
    if (pair.older === '' || pair.newer === '' || !a || !b || seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, said: twiceSaid(a, b), count: 1, href: null, pair, ...(call ? { keep: () => keepOnce(call) } : {}) });
  }
  return rows;
}

/** A host built before the call: it has nothing to keep once with, so the press goes rather than refusing each time. */
const ABSENT = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);

/**
 * Put "Keep it once" to the person on Decide through the record's `promoteLearnings`, and answer Decide.
 *
 * THE RECORD ASKS BY THE PAIR, NOT BY THIS PRESS: `promoteLearnings` takes nothing and files one question for each
 * lesson learned twice that was never asked, five waiting at most, so a press on one line also asks the others.
 * A PAIR ASKED BEFORE IS NEVER ASKED AGAIN: with one still waiting the press opens Decide, and with none filed and none
 * waiting it was answered already. THE WORDS ARE THIS FILE'S, never a refusal's `fix`, which may name a handle.
 */
export async function keepOnce(call: Call): Promise<Kept> {
  let out: Called;
  try {
    out = await call('promoteLearnings', {});
  } catch {
    return { ok: false, said: 'Could not reach your BrainDog. Try again.', gone: false };
  }
  if (!out.ok) {
    const code = out.refusal?.code ?? '';
    if (ABSENT.has(code)) return { ok: false, said: 'This BrainDog cannot keep these once yet.', gone: true };
    if (code === 'VALUE_MALFORMED') return { ok: false, said: 'These two lessons no longer say the same thing.', gone: true };
    if (code === 'NEEDS_BROWSER_SESSION') return { ok: false, said: 'Only a person signed in here can ask this.', gone: false };
    return { ok: false, said: 'Could not put this in Needs you. Try again.', gone: false };
  }
  const got = out.value as { asked?: unknown; open?: unknown } | null;
  const asked = Array.isArray(got?.asked) ? got.asked.length : 0;
  const open = typeof got?.open === 'number' ? got.open : 0;
  if (asked > 0 || open > 0) return { ok: true, href: '/decide' };
  return { ok: false, said: 'You answered this one already.', gone: true };
}

/**
 * What went stale on the record at `base`, and after it what the lessons say. Always an answer, and an empty one where
 * there is nothing to draw: each of the three reads that fails is nothing, and the others still draw.
 */
export async function readStale(base: string, io?: Fetch): Promise<{ ok: true; value: StaleRow[] }> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return { ok: true, value: await staleAll(() => client.stale(), (name, args) => client.call(name, args)) };
  } catch {
    return { ok: true, value: [] };
  }
}

/**
 * The record's own lines and then the lessons', the three reads asked side by side. `stale` and `call` are the
 * client's, handed in so a stand-in drives it. A read that fails is nothing and the others still draw.
 */
export async function staleAll(stale: () => Promise<unknown>, call: Call): Promise<StaleRow[]> {
  const [own, lessons] = await Promise.all([stale().then(staleRows, () => []), readLessons(call)]);
  return [...own, ...lessonRows(lessons, call)];
}
