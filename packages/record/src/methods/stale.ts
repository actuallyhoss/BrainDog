/**
 * Where things stand, and the one call that clears each: `stale` (READ+), AGT-C18 job c ("how good is braindog's mcp at
 * cleaning up stale stuff?", D40.10).
 *
 * WHAT WAS THERE BEFORE. The kernel counted what went stale (`kernel/src/tidy.ts`, a finder a kind) and nothing told
 * whoever was standing in the record. An agent starting work was handed the newest step and never told that three older
 * ones were still open under it, or that a question it asked a fortnight ago was still holding its next proposal back.
 *
 * A LINE A KIND, IN WORDS, WITH THE CALL. Each is `{ kind, said, count, clear }`: what it is, one sentence a person can
 * read, how many, and the one call that clears it, said as the call's name and what to hand it.
 *   - `steps`: steps left earlier that nobody took, in the place the caller stands (`openHandoffs`, marked `earlier`).
 *     Cleared by `handoff` with `drop`.
 *   - `questions`: for an agent, the questions its own key asked that have waited more than a week, which only it can
 *     take back (`withdraw`); for a person, the ones that have waited more than a fortnight, which are theirs to answer
 *     (`decide`).
 *   - a line a finder for the rest (`runs-empty`, `runs-stopped`, and whatever an add-on registers), told only to a
 *     caller who reads the whole record, because a finder counts with no caller to stand in.
 *
 * A RUN OR A QUESTION IS NAMED AS A PERSON SAYS IT (`S12`, `SG90`), beside its own words, because the call needs a
 * handle. No row id, no cause and no time as the record stores it leaves here: an age is said in days.
 *
 * IT READS AND WRITES NOTHING. No question is filed by asking: where a finder has one to put, the call it names is
 * `propose`, so the choice still goes to the person and nothing is asked by the record itself.
 */

import type { Result } from '@braindog/ports';
import { causeOfFinder, finders, openHandoffs, sessionDeclaration, tokenOfRun, whereFor } from '@braindog/kernel';
import type { Finder, HandoffPlace, Json, OpenHandoff } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { scrubbed } from '../scrub.ts';
import type { RecordDeps } from './index.ts';

/** One kind of stale thing as a person or an agent reads it. `clear` is the one call that clears it, in words. */
export type StaleLine = { kind: string; said: string; count: number; clear: string };

/** What `stale` answers: the lines, and their counts added up (the one number `context` carries). */
export type Stale = { lines: StaleLine[]; count: number };

const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

const DAY_MS = 86_400_000;
/** An agent's own question is worth taking back or leaving once it has waited this long. */
export const OWN_QUESTION_MS = 7 * DAY_MS;
/** A question is old for the person who answers it once it has waited this long, which is the tidy's own count. */
export const OLD_QUESTION_MS = 14 * DAY_MS;

/** The most runs read for their steps, and the most names one `clear` spells out. */
const READ_MOST = 100;
const NAMED_MOST = 8;

/** The finders whose things this read says itself, a caller at a time, and so never counts a second time. */
const SAID_HERE: ReadonlySet<string> = new Set(['steps-old', 'questions-old']);

/** "S4", "S4 and S9", "S4, S9 and S12". */
const listed = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;

/** How long ago, in whole days, as a person says it. */
const ago = (ms: number): string => {
  const days = Math.max(0, Math.floor(ms / DAY_MS));
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const waited = (ms: number): string => {
  const days = Math.max(1, Math.floor(ms / DAY_MS));
  return days === 1 ? '1 day' : `${days} days`;
};

/** The call for one name, or for each of several: `handoff with drop S4 and why` or `..., once for each of S4 and S9`. */
const each = (names: readonly string[], one: (name: string) => string, several: string): string => {
  if (names.length === 1) return one(names[0]!);
  const shown = names.slice(0, NAMED_MOST);
  const rest = names.length - shown.length;
  return `${several}, once for each of ${listed(shown)}${rest > 0 ? `, then ask again for the other ${rest}` : ''}`;
};

/**
 * The lines for one caller at one moment: what `stale` answers and what `context` counts. `list` is the tidy's finders.
 * Nothing is read from a list the caller may not read, and a finder is asked only for a caller who reads all of them.
 */
export function staleFor(deps: RecordDeps, ctx: CallContext, nowMs: number, list: readonly Finder[] = finders()): StaleLine[] {
  const { kernel, sql, readable, sightOf } = deps;
  const token = ctx.principal.kind === 'token' ? ctx.principal.id : null;
  const lines: StaleLine[] = [];

  /* THE STEPS LEFT EARLIER, in the place the caller stands: an agent's repository, or for a person every place a run
     waits. Each run is read under the caller's own grant, so a run they may not read leaves no step here. */
  const runsOpen = readable(ctx, SESSION) === null;
  if (runsOpen) {
    const got = kernel.list({ register: SESSION, where: { field: 'state', is: 'handoff' }, limit: READ_MOST }, whereFor(ctx.wheres, SESSION));
    const placed = (v: Json | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
    const here = token === null ? null : placed(ctx.session?.repo as Json | undefined);
    const runs = new Set<string>();
    const places = new Map<string, HandoffPlace>();
    for (const run of got.ok ? got.value.rows : []) {
      const place = { project: placed(run.fields.project), repo: placed(run.fields.repo) };
      if (here !== null && place.repo !== here) continue;
      runs.add(run.id);
      places.set(JSON.stringify([place.project, place.repo]), place);
    }
    const left = new Map<string, OpenHandoff>();
    for (const place of places.values()) for (const step of openHandoffs(sql, place, null, nowMs)) if (step.mark === 'earlier' && runs.has(step.id)) left.set(step.id, step);
    /* Oldest first: the one said out loud is the one that has waited longest. */
    const steps = [...left.values()].sort((a, b) => b.age_s - a.age_s || (a.spoken < b.spoken ? -1 : 1));
    const oldest = steps[0];
    if (oldest !== undefined) {
      const words = scrubbed(oldest.next);
      const when = ago(oldest.age_s * 1000);
      lines.push({
        kind: 'steps',
        said:
          steps.length === 1
            ? `1 step was left ${when} and nobody took it${words === null ? '.' : `: ${words}`}`
            : `${steps.length} steps were left earlier and nobody took them. The oldest was left ${when}${words === null ? '.' : `: ${words}`}`,
        count: steps.length,
        clear: each(steps.map((s) => s.spoken), (name) => `handoff with drop ${name} and why, a few words on why it is no longer true`, 'handoff with drop and why'),
      });
    }
  }

  /* THE QUESTIONS THAT WAITED, each held to what the caller is shown (`sightOf`) and called by the name they are handed.
     One put off to a day still ahead is not open, so it is not here (`openSuggestions`). */
  const open = kernel.openSuggestions();
  const shown = (open.ok ? open.value : []).flatMap((q) => {
    const id = String(q.id ?? '');
    const at = Date.parse(String(q.opened_at ?? ''));
    const name = id === '' ? null : sightOf(ctx, `suggestion:${id}`);
    if (name === null || !Number.isFinite(at)) return [];
    return [{ id, name: name.slice(name.indexOf(':') + 1), age: nowMs - at, by: String(q.opened_by ?? ''), cause: typeof q.cause === 'string' ? q.cause : '' }];
  });
  /* An agent is told of the ones its own key asked, since only it can take them back; a person of every one they see. */
  const old = shown
    .filter((q) => (token === null ? q.age > OLD_QUESTION_MS : q.age > OWN_QUESTION_MS && tokenOfRun(sql, q.by) === token))
    .sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1));
  const first = old[0];
  if (first !== undefined) {
    const line = sql.one<{ said: string | null }>(
      "SELECT coalesce(to_v, note) AS said FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL ORDER BY rowid LIMIT 1",
      `suggestion:${first.id}`,
    );
    const words = typeof line?.said === 'string' ? scrubbed(line.said) : null;
    const tail = words === null ? '.' : `: ${words}`;
    const names = old.map((q) => q.name);
    lines.push({
      kind: 'questions',
      said:
        token === null
          ? old.length === 1
            ? `1 question has waited ${waited(first.age)} for an answer${tail}`
            : `${old.length} questions have waited more than 14 days for an answer. The oldest has waited ${waited(first.age)}${tail}`
          : old.length === 1
            ? `1 question you asked has waited ${waited(first.age)}${tail}`
            : `${old.length} questions you asked have waited more than 7 days. The oldest has waited ${waited(first.age)}${tail}`,
      count: old.length,
      clear:
        token === null
          ? each(names, (name) => `decide with id ${name} and your answer`, 'decide with id and your answer')
          : each(names, (name) => `withdraw with id ${name}, if it no longer needs an answer`, 'withdraw with id, where it no longer needs an answer'),
    });
  }

  /* AND A LINE A FINDER FOR THE REST. A finder counts over the whole record with no caller to stand in, so its number is
     told only to a caller who reads every list whole; anybody else would be told how many there are of what they may
     not read. A finder that throws loses its own line and no other. */
  const whole = deps.readsEveryList !== undefined ? deps.readsEveryList(ctx) : ctx.registers === undefined || ctx.registers === '*';
  if (runsOpen && whole) {
    for (const finder of list) {
      if (SAID_HERE.has(finder.id)) continue;
      try {
        const found = finder.find(sql, nowMs);
        if (found.stale <= 0) continue;
        const asked = shown.find((q) => q.cause === causeOfFinder(finder.id));
        lines.push({
          kind: finder.id,
          said: `${finder.name ?? finder.id.replace(/-/gu, ' ')}: ${found.stale}`,
          count: found.stale,
          clear:
            asked !== undefined
              ? token === null
                ? `decide with id ${asked.name} and your answer`
                : `Nothing to call. The owner is already asked, as ${asked.name}.`
              : found.ask !== null
                ? `propose with the question: ${found.ask.question}`
                : 'Nothing to call. The hourly tidy looks at these again.',
        });
      } catch {
        /* Its line is missing from this answer, which is what the reader sees. */
      }
    }
  }
  return lines;
}

/** How many things are stale for one caller: the lines' counts added up, the one number `context` carries. */
export const staleCount = (lines: readonly StaleLine[]): number => lines.reduce((n, l) => n + l.count, 0);

export function methods(deps: RecordDeps) {
  const { scoped, clock } = deps;

  return {
    /**
     * `{}`: what is stale where the caller stands, as `{ lines, count }`, each line with the one call that clears it.
     * No line when nothing is. READ+, held to what the caller may read, and it changes nothing.
     */
    async stale(_args: unknown, ctx: CallContext): Promise<Result<Stale>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const lines = staleFor(deps, ctx, clock.now());
      return { ok: true, value: { lines, count: staleCount(lines) } };
    },
  };
}
