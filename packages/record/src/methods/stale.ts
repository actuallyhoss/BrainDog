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
 *   - a line for each list whose things fade (one with a `confirmed_on` day, as `context` finds it and never by the
 *     list's name): the ones still held true that nobody has confirmed in sixty days. Cleared by `update` with today
 *     as the day, for each that still holds.
 *   - a line for the skills that are behind what was learned since (`skillBearings`, which the nightly draft reads
 *     too): each with the proposal that writes its next version, so a skill changes with no model in the room.
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
import { skillBearings } from '../slash.ts';
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

/** The day field a list fades by, which is how `context` finds one too (`FADES` in `index.ts`), whatever it is called. */
const FADES = 'confirmed_on';
/** A thing on a fading list is worth confirming again once nobody has for this many days. */
export const UNCONFIRMED_DAYS = 60;
/** The most handles the call for a fading list or for the skills spells out. The rest are counted. */
export const STALE_NAMED_MOST = 20;
/** The longest the first words of a thing are said at. */
const WORDS_MOST = 90;

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

/** The first words of a longer text, cut at a word and never in one. */
const firstWords = (text: string): string => {
  if (text.length <= WORDS_MOST) return text;
  const cut = text.slice(0, WORDS_MOST);
  const space = cut.lastIndexOf(' ');
  return `${(space > WORDS_MOST / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/u, '')}...`;
};

/** What a list calls one of its things and several, in the words its own declaration gives: "learning", "learnings". */
const wordsOf = (decl: { name: string }): { one: string | null; many: string } => {
  const one = (decl as { one?: unknown }).one;
  return { one: typeof one === 'string' && one.trim() !== '' ? one.trim() : null, many: decl.name.toLowerCase() };
};

/**
 * The call for one name, or for each of several: `handoff with drop S4 and why` or `..., once for each of S4 and S9`.
 * `most` is how many are spelled out, and `total` how many there are when more were found than were read.
 */
const each = (names: readonly string[], one: (name: string) => string, several: string, most = NAMED_MOST, total = names.length): string => {
  if (names.length === 1 && total === 1) return one(names[0]!);
  const shown = names.slice(0, most);
  const rest = Math.max(total, names.length) - shown.length;
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

  /* WHAT FADES AND NOBODY HAS CONFIRMED. A list fades when it has the `confirmed_on` day, whatever the list is called,
     and a thing on it is stale when it is still held true (in no finished state) and was neither confirmed nor made in
     the last sixty days. Read under the caller's own grant, the one that has waited longest said out loud. */
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const cutMs = nowMs - UNCONFIRMED_DAYS * DAY_MS;
  const cutDay = new Date(cutMs).toISOString().slice(0, 10);
  for (const [id, decl] of kernel.registers()) {
    if (!decl.fields.some((f) => f.id === FADES && f.type === 'day' && !f.retired) || readable(ctx, id) !== null) continue;
    const held: Json[] = decl.state !== undefined && decl.done !== undefined && decl.done.length > 0 ? [{ field: decl.state, not_in: [...decl.done] }] : [];
    const unconfirmed: Json = {
      any: [{ field: FADES, before: cutDay }, { all: [{ field: FADES, empty: true }, { field: 'created_at', before: new Date(cutMs).toISOString() }] }],
    };
    const got = kernel.list(
      { register: id, where: { all: [...held, unconfirmed] } as never, order: [{ field: 'created_at', dir: 'asc' }], limit: READ_MOST },
      whereFor(ctx.wheres, id),
    );
    if (!got.ok || got.value.rows.length === 0) continue;
    const aged = got.value.rows
      .map((row) => {
        const on = row.fields[FADES];
        const since = typeof on === 'string' && on !== '' ? Date.parse(today) - Date.parse(on) : nowMs - Date.parse(row.created_at);
        return { row, age: Number.isFinite(since) ? since : UNCONFIRMED_DAYS * DAY_MS, name: kernel.nameOf(row.id) };
      })
      .sort((a, b) => b.age - a.age || (a.row.seq ?? 0) - (b.row.seq ?? 0));
    const total = Math.max(got.value.matched, aged.length);
    const longest = aged[0]!;
    const title = longest.row.fields[decl.title];
    const said = typeof title === 'string' ? scrubbed(title) : null;
    const tail = said === null ? '.' : `: ${firstWords(said)}`;
    const { one, many } = wordsOf(decl);
    lines.push({
      kind: id,
      said:
        total === 1
          ? `1 ${one ?? `of the ${many}`} has not been confirmed in ${waited(longest.age)}, ${longest.name}${tail}`
          : `${total} ${many} have not been confirmed in ${UNCONFIRMED_DAYS} days. The oldest is ${longest.name}, not confirmed in ${waited(longest.age)}${tail}`,
      count: total,
      clear: each(aged.map((a) => a.name), (name) => `update ${name} with ${FADES} ${today}`, `update with ${FADES} ${today}`, STALE_NAMED_MOST, total),
    });
  }

  /* THE SKILLS BEHIND WHAT WAS LEARNED, read only through `skillBearings`, which is what the nightly draft reads: a
     skill with lessons that bear on it and that its own list of them does not carry. That read stands in no caller, so
     it is told only to one who reads both lists whole. The call is a proposal, since a skill's text and version change
     by the owner's press alone, and it names the skill and each lesson as a person says them. */
  /* EVERY SKILL BEHIND IS COUNTED, AND THE FIRST FEW ARE NAMED, so the number is the true one and the sentence stays one. */
  const everyBehind = skillBearings(sql, kernel, Number.POSITIVE_INFINITY);
  const behind = everyBehind.slice(0, NAMED_MOST);
  const unnamed = everyBehind.length - behind.length;
  const skillsIn = behind[0] === undefined ? null : (kernel.get(behind[0].at)?.register ?? null);
  const lessonsIn = behind[0]?.learnings[0] === undefined ? null : (kernel.get(behind[0].learnings[0].id)?.register ?? null);
  const readsWhole = (list: string): boolean => readable(ctx, list) === null && whereFor(ctx.wheres, list) === undefined;
  const skillsAre = skillsIn === null ? undefined : kernel.register(skillsIn);
  const lessonsAre = lessonsIn === null ? undefined : kernel.register(lessonsIn);
  if (skillsIn !== null && lessonsIn !== null && skillsAre && lessonsAre && readsWhole(skillsIn) && readsWhole(lessonsIn)) {
    const skill = wordsOf(skillsAre);
    const lesson = wordsOf(lessonsAre);
    const lessons = (n: number): string => `${n} ${n === 1 ? (lesson.one ?? lesson.many) : lesson.many}`;
    const called = (name: string): string => scrubbed(name) ?? name;
    let left = STALE_NAMED_MOST;
    const calls = behind.map((b) => {
      const names = b.learnings.slice(0, left).map((l) => l.spoken);
      left -= names.length;
      const rest = b.learnings.length - names.length;
      const more = rest === 0 ? '' : names.length === 0 ? `${rest} more` : ` and ${rest} more`;
      const kept = b.carried.length === 0 ? '' : `, after the ${b.carried.length} it holds`;
      return `${kernel.nameOf(b.at)} with body, rev ${b.rev + 1} and because [${names.join(', ')}${more}]${kept}`;
    });
    lines.push({
      kind: skillsIn,
      said:
        everyBehind.length === 1
          ? `The ${skill.one ?? skill.many} ${called(behind[0]!.name)} is behind ${lessons(behind[0]!.learnings.length)}`
          : `${everyBehind.length} ${skill.many} are behind what was learned: ${listed([...behind.map((b) => `${called(b.name)} by ${lessons(b.learnings.length)}`), ...(unnamed > 0 ? [`${unnamed} more`] : [])])}`,
      count: everyBehind.length,
      clear:
        everyBehind.length === 1
          ? `propose a rowset on ${calls[0]!}`
          : `propose a rowset on each: ${calls.join('; ')}${unnamed > 0 ? `; then ask again for the other ${unnamed}` : ''}`,
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
