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
 * THE BATCH IS A HANDLE BESIDE THE WORDS, never in them. `undoOf` says what the record's undo is sent for one match.
 *
 * UNDO IS THE RECORD'S OWN, READ BEFORE IT IS PRESSED. `undoMatch` asks the plan dry and says it in names ("Puts back
 * Teodor Vance and T. Vance as two people."); `putBack` sends that plan back by its hash. A RECORD THAT CANNOT GIVE TWO
 * BACK FROM A MATCH DRAWS NO UNDO: its plan names nobody coming back (it leaves the matched one as it is, and the next
 * meeting would match the pair again), so `undoMatch` answers `null` for it and the tile only lists.
 *
 * A ROUTE-ONLY MODULE, like `briefing.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import type { Fetch } from '../record/boot-live.ts';
import { undoApply, undoPlan, type UndoPlan, type UndoScope } from '../record/undo-write.ts';

/** How many matches the tile lists when it is opened. The rest are counted in one line under them. */
export const MATCHED_SHOWN = 5;

/** How many names one sentence says before it counts the others. */
const NAMES_SAID = 3;

/** A week, which is what the line on the board says when every match it counts is inside one. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One match as it is drawn. `when` is the instant the record made it, or `null` where it sent none a clock can read;
 * `batch` is the handle the record's undo takes, `''` where it sent none, and is never drawn. `into` is the name of the
 * one the others were matched to, which Undo says first among who comes back.
 */
export type MatchedRow = { key: string; line: string; evidence: string; when: string | null; batch: string; into: string; attach: boolean };

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
    const m = match as { kind?: unknown; from?: unknown; into?: { name?: unknown } | null; evidence?: unknown; sentence?: unknown; at?: unknown; batch?: unknown };
    /* A NAME SLASH PUT ON A ROW (`attach`) HAS NOBODY FOLDED INTO IT, so it is drawn by the sentence it was read from. */
    const attach = m.kind === 'attach';
    const into = typeof m.into?.name === 'string' ? m.into.name.trim() : '';
    const from = Array.isArray(m.from) ? m.from.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter((n) => n !== '') : [];
    if (into === '' || (!attach && from.length === 0)) continue;
    const batch = typeof m.batch === 'string' ? m.batch : '';
    rows.push({
      /* THE KEY IS THE BATCH AND THE PLACE, since one batch may hold two matches that ended at different people. */
      key: `${batch}:${String(rows.length)}`,
      line: attach ? `Slash put a name on ${into}.` : lineOf(from, into),
      evidence: attach && typeof m.sentence === 'string' ? m.sentence.trim() : typeof m.evidence === 'string' ? m.evidence.trim() : '',
      when: typeof m.at === 'string' && Number.isFinite(Date.parse(m.at)) ? m.at : null,
      batch,
      into,
      attach,
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

/* ── Undo: the plan, then Put back ───────────────────────────────────────── */

/** The word the record's plan puts on a step that brings back somebody a match had put away ("Bring T. Vance back"). */
const GIVEN_BACK = 'restore';

/** The head of its one sentence for a match put back ("Puts back 2 people"), and how many it says come apart. */
const SAYS_BACK = /^Puts back (\d+) people\b/u;

/** What Undo needs of a match: its batch, and the name of the one the others were matched to where it is known. */
export type MatchHandle = { batch: string; into?: string; attach?: boolean };

/**
 * Who a plan gives back, by name and once each, and how many the record says come apart; `null` for a plan that gives
 * nobody back.
 *
 * ONE PERSON IS ONE HANDLE, never one name: two called the same are two. THE ONE WHO WAS KEPT COMES BACK TOO, as
 * themselves alone: the plan names them by a step that takes off what the match added, or only counts them, and
 * `into` is who that is. Any other step is something that pointed at one of them going home (a task, a note), and is
 * never named as a person.
 */
function givenBack(plan: UndoPlan, into = ''): { names: string[]; said: number | null } | null {
  const marked = plan.steps.filter((s) => s.do === GIVEN_BACK);
  const says = SAYS_BACK.exec(plan.say);
  if (marked.length === 0 && says === null) return null;
  const said = says === null ? null : Number(says[1]);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const [i, step] of (marked.length > 0 ? marked : plan.steps).entries()) {
    const handle = step.row ?? `at:${String(i)}`;
    if (step.title === '' || seen.has(handle)) continue;
    seen.add(handle);
    names.push(step.title);
  }
  /* THE KEPT ONE IS ON THE LIST THE OTHERS COME BACK TO, so something else that happens to share the name is not them. */
  const lists = new Set(marked.map((m) => m.list ?? m.at?.register ?? null));
  const step = plan.steps.some((s) => s.do !== GIVEN_BACK && same(s.title, into) && lists.has(s.list ?? s.at?.register ?? null));
  const kept = marked.length > 0 && into !== '' && (step || (said !== null && said > names.length));
  if (kept) names.unshift(into);
  return { names, said };
}

/** "Ada Lovelace as two people", "Ann, Bo and Cy as three people", "T. Vance as a person of their own". */
function asPeople(names: readonly string[]): string {
  const n = names.length;
  if (n === 1) return `${names[0]!} as a person of their own`;
  const count = (COUNTS[n - 2] ?? String(n)).toLowerCase();
  return `${names.every((name) => same(name, names[0]!)) ? names[0]! : listed(names)} as ${count} people`;
}

/** Who comes back, when every one the record counts can be named; `null` where its own sentence is the true one. */
function named(plan: UndoPlan, into?: string): string | null {
  const back = givenBack(plan, into);
  if (back === null || back.names.length === 0) return null;
  return back.said !== null && back.said !== back.names.length ? null : asPeople(back.names);
}

/**
 * The plan in one sentence a person can agree to: who comes back, and as how many. `null` for a plan that gives nobody
 * back, which is a record that cannot split a match and so draws no Undo.
 *
 * THE RECORD'S OWN SENTENCE WHERE THE NAMES ARE NOT ALL OF IT: a change that held more than this one match is said by
 * its count. WHAT THE PLAN LEAVES IS SAID AFTER, one by the record's reason and more by their number.
 */
export function planSaid(plan: UndoPlan, into?: string): string | null {
  if (givenBack(plan, into) === null) return null;
  const who = named(plan, into);
  const head = who === null ? `${plan.say.replace(/\.$/u, '')}.` : `Puts back ${who}.`;
  if (who === null || plan.skipped.length === 0) return head;
  const one = plan.skipped.length === 1 ? plan.skipped[0]!.line : '';
  return `${head} ${one !== '' ? `${one.replace(/\.$/u, '')}.` : `Leaves ${String(plan.skipped.length)} as they are.`}`;
}

/** The same once it is done, for the toast: "Put back Teodor Vance and T. Vance as two people." `null` where it names nobody. */
export function backSaid(plan: UndoPlan, into?: string): string | null {
  const who = named(plan, into);
  return who === null ? null : `Put back ${who}.`;
}

/** What Undo on one match would do, read and not done: the plan, and `say`, its one sentence in names. */
export type MatchPlan = { from: 'plan'; say: string; plan: UndoPlan };

/**
 * What Put back answered. `undone` carries the sentence the toast says. `again` is a plan that moved between the read
 * and the press: nothing was put back, and the tile reads the plan again. `refused` is the record's own sentence.
 */
export type MatchBack = { from: 'undone'; said: string } | { from: 'again' } | { from: 'refused'; fix: string };

/**
 * Ask the record what Undo on this match would put back, changing nothing.
 *
 * `null` IS NO BUTTON, whichever it is: a match with no batch, a record with no undo, a reader it refuses (only the
 * owner puts a change back), a dead line, and a record whose plan gives nobody back. A person is never shown an Undo
 * that would not give them two people.
 */
export async function undoMatch(base: string, row: MatchHandle, io?: Fetch): Promise<MatchPlan | null> {
  const scope = undoOf(row);
  if (scope === null) return null;
  try {
    const out = await undoPlan(base, scope, io);
    if (out.from !== 'plan') return null;
    /* AN ATTACH BRINGS NOBODY BACK AS A PERSON, so its Undo says the record's own plan. */
    const say = row.attach === true ? out.plan.say : planSaid(out.plan, row.into);
    return say === null ? null : { from: 'plan', say, plan: out.plan };
  } catch {
    return null;
  }
}

/**
 * Put back the plan that was read, by its hash.
 *
 * WHO CAME BACK IS SAID IN NAMES WHEN ALL OF IT WENT BACK. Where the record left something, or had nothing left to put
 * back, the sentence is the record's count and its own reason, never a claim that two people are back.
 */
export async function putBack(base: string, row: MatchHandle, plan: UndoPlan, io?: Fetch): Promise<MatchBack> {
  const scope = undoOf(row);
  if (scope === null) return { from: 'refused', fix: copy.recordNotReached };
  try {
    const out = await undoApply(base, scope, plan, io);
    if (out.from === 'conflict') return { from: 'again' };
    if (out.from !== 'undone') return { from: 'refused', fix: out.fix };
    const whole = out.put > 0 && out.skipped.length === 0 ? backSaid(plan, row.into) : null;
    return { from: 'undone', said: whole ?? out.said };
  } catch {
    return { from: 'refused', fix: copy.recordNotReached };
  }
}
