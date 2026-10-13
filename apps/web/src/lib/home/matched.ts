/**
 * Matched for you on Home: who the record matched on its own, as lines a person can read (`Matched.svelte`).
 *
 * THROUGH THE RECORD'S OWN `matched` AND NOTHING ELSE. The record finds the matches that still stand, names who was
 * matched to whom and writes the one sentence of evidence; this file only turns each into what a screen draws: one
 * sentence in names, the evidence, when, and the batch its Undo takes.
 *
 * IT NEVER FAILS THE SCREEN. A record with no such call, a reader it refuses, a record that keeps nobody and a line
 * that dropped all answer nobody, and nobody draws nothing: Home stands as it did before.
 *
 * THE BATCH IS A HANDLE BESIDE THE WORDS, never in them. `undoOf` says what the record's undo would be sent for one
 * match. NOTHING PRESSES IT YET: the record's undo does not give two back from a match today (it leaves the matched
 * one as it is and the next meeting matches the pair again), so the tile lists and draws no Undo until it can.
 *
 * A ROUTE-ONLY MODULE, like `briefing.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';
import type { UndoScope } from '../record/undo-write.ts';

/** How many matches the tile lists when it is opened. The rest are counted in one line under them. */
export const MATCHED_SHOWN = 5;

/** How many names one sentence says before it counts the others. */
const NAMES_SAID = 3;

/** A week, which is what the line on the board says when every match it counts is inside one. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One match as it is drawn. `when` is the instant the record made it, or `null` where it sent none a clock can read;
 * `batch` is the handle the record's undo takes, `''` where it sent none, and is never drawn.
 */
export type MatchedRow = { key: string; line: string; evidence: string; when: string | null; batch: string };

const COUNTS = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'] as const;

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** "Ann", "Ann and Bo", "Ann, Bo and Cy", and past three, "Ann, Bo, Cy and 2 others". */
function listed(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length <= NAMES_SAID) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  const rest = names.length - NAMES_SAID;
  return `${names.slice(0, NAMES_SAID).join(', ')} and ${String(rest)} ${rest === 1 ? 'other' : 'others'}`;
}

/**
 * The one sentence: who was matched to whom.
 *
 * TWO WHO GO BY ONE NAME ARE SAID AS THAT. The rules match on the same name, so the commonest match of all is two
 * called the same thing, and "Ada Lovelace was matched to Ada Lovelace" says nothing.
 */
function lineOf(from: readonly string[], into: string): string {
  if (from.every((name) => same(name, into))) {
    const n = from.length + 1;
    return `${COUNTS[n - 2] ?? String(n)} called ${into} are now one.`;
  }
  return `${listed(from)} ${from.length === 1 ? 'was' : 'were'} matched to ${into}.`;
}

/**
 * The record's answer as the matches to draw, in its order: newest first.
 *
 * A MATCH WITH NOBODY TO NAME IS DROPPED, because who and into whom is all one is. A REFUSAL IS NOBODY, whichever it
 * is: a host built before the read answers `NOT_IN_THIS_BUILD` or `ROUTE_UNKNOWN`, and neither is anything a person
 * can act on. So is `null`, a record that keeps nobody.
 */
export function matchedRows(answer: unknown): MatchedRow[] {
  const a = answer as { ok?: unknown; value?: { matches?: unknown } | null } | null | undefined;
  const matches = a?.ok === true ? a.value?.matches : undefined;
  if (!Array.isArray(matches)) return [];
  const rows: MatchedRow[] = [];
  for (const match of matches as unknown[]) {
    if (typeof match !== 'object' || match === null) continue;
    const m = match as { from?: unknown; into?: { name?: unknown } | null; evidence?: unknown; at?: unknown; batch?: unknown };
    const into = typeof m.into?.name === 'string' ? m.into.name.trim() : '';
    const from = Array.isArray(m.from) ? m.from.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter((n) => n !== '') : [];
    if (into === '' || from.length === 0) continue;
    const batch = typeof m.batch === 'string' ? m.batch : '';
    rows.push({
      /* THE KEY IS THE BATCH AND THE PLACE, since one batch may hold two matches that ended at different people. */
      key: `${batch}:${String(rows.length)}`,
      line: lineOf(from, into),
      evidence: typeof m.evidence === 'string' ? m.evidence.trim() : '',
      when: typeof m.at === 'string' && Number.isFinite(Date.parse(m.at)) ? m.at : null,
      batch,
    });
  }
  return rows;
}

/** The newest five to list, and how many more there are, said as a count under them. */
export function matchedShown(rows: readonly MatchedRow[]): { shown: MatchedRow[]; more: number } {
  return { shown: rows.slice(0, MATCHED_SHOWN), more: Math.max(0, rows.length - MATCHED_SHOWN) };
}

/**
 * THE ONE LINE ON THE BOARD (DIRECTION §39): "One person matched for you", "3 people matched for you", and `null`
 * for none, which draws nothing.
 *
 * EACH MATCH IS ONE PERSON, however many were matched into them. "THIS WEEK" IS SAID ONLY WHEN IT IS TRUE OF ALL OF
 * THEM: the record answers every match that still stands, not a week of them, so the words are added when `now` is
 * handed in and every one counted was made inside the week before it.
 */
export function matchedLine(rows: readonly MatchedRow[], now?: number): string | null {
  if (rows.length === 0) return null;
  const said = rows.length === 1 ? 'One person matched for you' : `${String(rows.length)} people matched for you`;
  const week = now !== undefined && rows.every((r) => r.when !== null && now - Date.parse(r.when) <= WEEK_MS);
  return week ? `${said} this week` : said;
}

/**
 * What the record's undo is sent for one match: its batch, as `undoChange` in `record/undo-write.ts` takes one.
 * `null` for a match the record sent no batch for, which nothing can put back from here.
 */
export function undoOf(row: Pick<MatchedRow, 'batch'>): Extract<UndoScope, { batch: string }> | null {
  return row.batch === '' ? null : { batch: row.batch };
}

/** Who was matched on the record at `base`. Always an answer, and an empty one where there is nothing to draw. */
export async function readMatched(base: string, io?: Fetch): Promise<{ ok: true; value: MatchedRow[] }> {
  try {
    return { ok: true, value: matchedRows(await createClient({ base, ...(io ? { fetch: io } : {}) }).matched()) };
  } catch {
    return { ok: true, value: [] };
  }
}
