/**
 * Where things stand, and the one call that clears each: `stale` (READ+), AGT-C18 job c ("how good is braindog's mcp at
 * cleaning up stale stuff?").
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
 *     as the day, for each that still holds, and by the list's own finished state and what it needs (`closeSaid`) for
 *     one that does not.
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
 *
 * BESIDE IT, THE TIDY OF WHERE THINGS APPLY: `scopeProposals` reads, and `proposeScopes` is the one write in
 * this file, a person's press that files questions and moves nothing. Both are further down.
 */

import type { Result } from '@braindog/ports';
import { BODY_KINDS, causeOfFinder, dayIn, finders, openHandoffs, sessionDeclaration, tokenOfRun } from '@braindog/kernel';
import type { BodyKind, Entry, Finder, HandoffPlace, Json, OpenHandoff } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { skillBearings } from '../slash.ts';
import { scrubbed } from '../scrub.ts';
import {
  proposalLine,
  proposalsFor,
  strandedAnswers,
  strandedFor,
  strandedLine,
  USED_WITHIN_DAYS,
  type ScopeEvidence,
  type ScopeListName,
  type ScopeMade,
  type ScopeNamer,
  type ScopeProject,
  type ScopeProposal,
  type ScopeRow,
  type ScopeUse,
} from '../scope-propose.ts';
import type { RecordDeps } from './index.ts';
import { fadeOf } from '../agent-lists.ts';
import { hiddenOf } from '../sight.ts';

/** One kind of stale thing as a person or an agent reads it. `clear` is the one call that clears it, in words. */
export type StaleLine = { kind: string; said: string; count: number; clear: string };

/** What `stale` answers: the lines, and their counts added up (the one number `context` carries). */
export type Stale = { lines: StaleLine[]; count: number };

const SESSION = (sessionDeclaration().body as unknown as { id: string }).id;

const DAY_MS = 86_400_000;
/** An agent's own question is worth taking back or leaving once it has waited this long. */
export const OWN_QUESTION_MS = 7 * DAY_MS;
/** A step nobody took in a week, in seconds as `age_s` counts. */
const STEP_STALE_S = (7 * DAY_MS) / 1000;
/** A question is old for the person who answers it once it has waited this long, which is the tidy's own count. */
export const OLD_QUESTION_MS = 14 * DAY_MS;

/** The most runs read for their steps, and the most names one `clear` spells out. */
const READ_MOST = 100;
const NAMED_MOST = 8;

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

  /* A STEP IS STALE ONCE A WEEK OLD, or once a later run here passed it by. The card stops handing a step over after a
     day (`EARLIER_MS`), but a step left yesterday is still one somebody may take, so it is not yet one to clear. */
  const leftWaiting = (step: OpenHandoff): boolean => step.mark === 'earlier' && (step.passed === true || step.age_s >= STEP_STALE_S);
  /* THE STEPS LEFT EARLIER, in the place the caller stands: an agent's repository, or for a person every place a run
     waits. Each run is read under the caller's own grant, so a run they may not read leaves no step here. */
  const runsOpen = readable(ctx, SESSION) === null;
  if (runsOpen) {
    const got = kernel.list({ register: SESSION, where: { field: 'state', is: 'handoff' }, limit: READ_MOST }, kernel.scope(ctx, SESSION));
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
    for (const place of places.values()) for (const step of openHandoffs(sql, place, null, nowMs)) if (leftWaiting(step) && runs.has(step.id)) left.set(step.id, step);
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
     One put off to a day still ahead is not open, so it is not here (`openSuggestions`). One on agents' shelf is still
     open, and still the agent's to take back, so it is. */
  const open = deps.everyOpen?.() ?? kernel.openSuggestions({ apart: 'with' });
  const shown = (open.ok ? open.value : []).flatMap((q) => {
    const id = String(q.id ?? '');
    const at = Date.parse(String(q.opened_at ?? ''));
    const name = id === '' ? null : deps.questionSeen ? deps.questionSeen(ctx, q) : sightOf(ctx, `suggestion:${id}`);
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
      "SELECT coalesce(to_v, note) AS said FROM event WHERE kind = 'suggest' AND target = ? AND field IS NULL AND coalesce(to_v, '') <> 'reopened' ORDER BY rowid DESC LIMIT 1",
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
  /* THE RECORD'S DAY, IN ITS OWN ZONE (AH22). */
  const today = dayIn(nowMs, kernel.identity()?.tz);
  const cutMs = nowMs - UNCONFIRMED_DAYS * DAY_MS;
  const cutDay = new Date(cutMs).toISOString().slice(0, 10);
  for (const [id, decl] of kernel.registers()) {
    /* THE DAY FIELD A LIST FADES BY, as `context` finds it too (`agent-lists.ts` `fadeOf`), whatever it is called. */
    const FADES = fadeOf(decl)?.field;
    if (FADES === undefined || readable(ctx, id) !== null) continue;
    /* A LIST WHOSE FADE DAY, OR STATE, A SHARE HIDES FROM THE READER IS LEFT OUT: how long since a thing was confirmed
       is that day, said in other words. */
    const hidden = hiddenOf(ctx, id);
    if (hidden.has(FADES) || (decl.state !== undefined && hidden.has(decl.state))) continue;
    const held: Json[] = decl.state !== undefined && decl.done !== undefined && decl.done.length > 0 ? [{ field: decl.state, not_in: [...decl.done] }] : [];
    const unconfirmed: Json = {
      any: [{ field: FADES, before: cutDay }, { all: [{ field: FADES, empty: true }, { field: 'created_at', before: new Date(cutMs).toISOString() }] }],
    };
    const got = kernel.list(
      { register: id, where: { all: [...held, unconfirmed] } as never, order: [{ field: 'created_at', dir: 'asc' }], limit: READ_MOST },
      kernel.scope(ctx, id),
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
    const { one, many } = wordsOf(decl);
    /* AND THE WAY ONE THAT NO LONGER HOLDS IS CLOSED, in the list's own states (SG290 asked for "retired", a state
       learnings do not have, and the yes could never land). */
    const closes = closeSaid(decl);
    lines.push({
      kind: id,
      said:
        /* SAID BY ITS TITLE AND NEVER BY ITS HANDLE: "LN1" is the record's word, and the title is what a person knows. */
        total === 1
          ? said === null
            ? `1 ${one ?? `of the ${many}`} has not been confirmed in ${waited(longest.age)}.`
            : `1 ${one ?? `of the ${many}`} has not been confirmed in ${waited(longest.age)}: ${firstWords(said)}`
          : said === null
            ? `${total} ${many} have not been confirmed in ${UNCONFIRMED_DAYS} days. The oldest has waited ${waited(longest.age)}.`
            : `${total} ${many} have not been confirmed in ${UNCONFIRMED_DAYS} days. The oldest has waited ${waited(longest.age)}: ${firstWords(said)}`,
      count: total,
      clear: `${each(aged.map((a) => a.name), (name) => `update ${name} with ${FADES} ${today}`, `update with ${FADES} ${today}`, STALE_NAMED_MOST, total)}${closes === null ? '' : `; for one that no longer holds, update it with ${closes}`}`,
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
  const readsWhole = (list: string): boolean => readable(ctx, list) === null && kernel.scope(ctx, list) === undefined;
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
          ? `The ${called(behind[0]!.name)} ${skill.one ?? skill.many} does not take in ${lessons(behind[0]!.learnings.length)} yet`
          : `${everyBehind.length} ${skill.many} do not take in what was learned yet: ${listed([...behind.map((b) => `${called(b.name)}, ${lessons(b.learnings.length)}`), ...(unnamed > 0 ? [`${unnamed} more`] : [])])}`,
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
        /* A FINDER THAT SAYS WHERE ITS THINGS ARE (`at`, AGT-C18's rows-same) is a line a place, each with its own address. */
        if (asked === undefined && found.at !== undefined && found.at.length > 0) {
          for (const place of found.at) lines.push({ kind: finder.id, said: place.said, count: place.count, clear: `See them, and the one press that folds them, at ${place.href}` });
          continue;
        }
        lines.push({
          kind: finder.id,
          said: finder.counted?.(found.stale) ?? `${finder.name ?? finder.id.replace(/-/gu, ' ')}: ${found.stale}`,
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

/* ---------------------------------------------------------------------------------------------------------------------
 * WHERE WHAT HAS NO SCOPE BELONGS: `scopeProposals` (READ+) says it a list, and `proposeScopes`
 * (DATA) puts it on Decide as one question a list, so a person answers once and not once a row. The votes are
 * `scope-propose.ts`'s, pure; what is here gathers what they read, with reads the record already makes, under the
 * caller's own grant, and files what they answer.
 *
 * NOTHING ASKS BY ITSELF. No clock and no night calls `proposeScopes`: a person presses for it (the Keychain's note, or
 * `braindog tidy --ask`), and the question is signed by her. A token is refused, since an agent proposes one move with
 * `propose` and never the whole record's.
 *
 * EVERY LIST WITH A SCOPE FIELD, BY WHAT IT DECLARES. Keys, tools and skills are not named here: a list is in when one of
 * its fields says where its rows apply (`scope:`), and the projects are the one list that declares `scopes:`.
 * ------------------------------------------------------------------------------------------------------------------- */

/** One row of a list's proposal as it is read: the row by its handle and name, the project by name, and why. */
export type ScopeAskRow = { at: string; title: string; project: string; reasons: string[] };

/** One list's proposal: the list by its handle and name, how many rows, the question it is asked in, and the rows. */
export type ScopeAsk = {
  list: string;
  name: string;
  count: number;
  line: string;
  rows: ScopeAskRow[];
  truncated: boolean;
  /** How many of its rows are placed in a finished project, and the sentence that says so ('' at nought). */
  stranded: number;
  strandedLine: string;
};

/** What `scopeProposals` answers. */
export type ScopeAsks = { lists: ScopeAsk[] };

/** One question `proposeScopes` filed or found waiting: its handle, its words, how many rows, and whether it is new. */
export type ScopeAsked = { list: string; name: string; question: string; said: string; rows: number; opened: boolean };

/** What `proposeScopes` answers. */
export type ScopesAsked = { asked: ScopeAsked[] };

/** The most rows one question holds, which is the most a rowset carries (`MAX_ROWS` in govern). */
export const SCOPE_ASK_MOST = 200;
/** The most rows one list is read for, a page of the kernel's at a time. */
const SCOPE_READ_MOST = 5_000;
const SCOPE_PAGE = 500;
/** The most uses of one row walked for its runs, as `usedBy` walks them. */
const SCOPE_USES_WALK = 5_000;

/** The causes the two questions are filed under, a list each, so the same ask is asked once. */
export const scopeCause = (list: string): string => `scope-move:${list}`;
export const strandedCause = (list: string): string => `scope-stranded:${list}`;

/** A run's name as `usedBy` reads one: the prefix and then digits, with anything a `GLOB` reads as a pattern in brackets. */
const RUN = sessionDeclaration().body as unknown as { id: string; seq_prefix: string };
const RUN_GLOB = `${RUN.seq_prefix.replace(/[*?[\]]/g, (c) => `[${c}]`)}[1-9]*`;
const RUN_NAME = new RegExp(`^${RUN.seq_prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[1-9][0-9]*$`, 'u');

type Decl = NonNullable<ReturnType<RecordDeps['kernel']['register']>>;
type Field = Decl['fields'][number];

/** The field of a list that says where its rows apply, as the kernel's `scopeFieldOf` finds it. */
const scopeFieldIn = (decl: Decl): Field | undefined => decl.fields.find((f) => f.scope !== undefined && f.retired !== true);

/** Whether a row is in one of its list's finished states. */
const finishedIn = (decl: Decl, row: Entry): boolean =>
  decl.state !== undefined && (decl.done ?? []).length > 0 && (decl.done ?? []).includes(String(row.fields[decl.state] ?? row.state ?? ''));

/**
 * The patch that closes one row as its list declares it, or `null` when its list has no way to a finished state from
 * where the row is: the first of the list's finished states its state field lets the row move to, and each field that
 * move needs filled and the row lacks, filled with `because`.
 */
const closeOf = (decl: Decl, row: Entry, because: string): Record<string, Json> | null => {
  if (decl.state === undefined || (decl.done ?? []).length === 0) return null;
  const from = String(row.fields[decl.state] ?? row.state ?? '');
  const move = decl.fields.find((f) => f.id === decl.state)?.transitions?.[from];
  const to = (decl.done ?? []).find((d) => d !== from && (move === undefined || move.to.includes(d)));
  if (to === undefined) return null;
  const needs = (move?.requires ?? []).filter((f) => row.fields[f] === undefined || row.fields[f] === null);
  return { [decl.state]: to, ...Object.fromEntries(needs.map((f) => [f, because])) };
};

/** A state as its list says it: the label its state field gives the value, or the value in plain lower case. */
const stateWord = (decl: Decl, value: string): string => {
  const field = decl.fields.find((f) => f.id === decl.state) as { labels?: Readonly<Record<string, string>> } | undefined;
  const label = field?.labels?.[value];
  return (typeof label === 'string' && label.trim() !== '' ? label.trim() : value.replace(/[_-]+/gu, ' ')).toLowerCase();
};

/**
 * How one of a list's things that no longer holds is closed, in the list's own words, as a call: its first finished
 * state its state field lets a live thing move to, and what that move needs filled. `null` for a list with no way to
 * close one. Learnings say "state superseded and why", never a state they do not have.
 */
const closeSaid = (decl: Decl): string | null => {
  if (decl.state === undefined || (decl.done ?? []).length === 0) return null;
  const field = decl.fields.find((f) => f.id === decl.state);
  const from = typeof (field as { default?: unknown } | undefined)?.default === 'string' ? String((field as { default?: unknown }).default) : null;
  const move = from === null ? undefined : field?.transitions?.[from];
  const to = (decl.done ?? []).find((d) => d !== from && (move === undefined || move.to.includes(d)));
  if (to === undefined) return null;
  const needs = move?.requires ?? [];
  return `${decl.state} ${to}${needs.length === 0 ? '' : ` and ${needs.join(' and ')}`}`;
};

/** A list as a sentence names its rows, from its own declaration: "Keys", and "key" (its `one`, or its name less an s). */
const namesOf = (decl: Decl): ScopeListName => {
  const { one, many } = wordsOf(decl);
  return { name: decl.name, one: one ?? (many.endsWith('s') ? many.slice(0, -1) : many) };
};

/** A row's title as a person reads it, or the list's word for one when it has none. */
const titleOf = (decl: Decl, row: Entry): string => {
  const t = row.fields[decl.title];
  return typeof t === 'string' && t.trim() !== '' ? (scrubbed(t.trim()) ?? namesOf(decl).one) : namesOf(decl).one;
};

/** One list as the two methods work on it: its declaration and scope field, its rows by id, and what the votes said. */
type Gathered = {
  list: string;
  decl: Decl;
  field: Field;
  rows: Map<string, Entry>;
  proposals: ScopeProposal[];
  stranded: ScopeRow[];
};

/** Text made comparable, as `scope-propose.ts` compares it: lower case, one space. */
const plainText = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Every list with a scope field the caller reads, with what the votes propose for it, or `null` when the record keeps
 * no projects she may read. `only` holds it to one list. `declinedOf` is each list's `'row:project'` pairs he said no to.
 *
 * READ UNDER HER OWN GRANT, every list: a list closed to her is not read and not named, and a narrowed grant reads only
 * the rows it admits. The runs are evidence only for a caller who may read them, since a vote counts them.
 */
function scopeGather(deps: RecordDeps, ctx: CallContext, nowMs: number, only: string | null, declinedOf: (list: string, field: Field) => Set<string>): { lists: Gathered[]; projects: Map<string, ScopeProject> } | null {
  const { kernel, sql, readable } = deps;
  const homes = [...kernel.registers()].filter(([, d]) => d.scopes !== undefined);
  if (homes.length !== 1) return null;
  const [home, homeDecl] = homes[0]!;
  if (readable(ctx, home) !== null) return null;

  /** Every live row of one list she may read, a page at a time. */
  const rowsOf = (list: string): Entry[] => {
    const out: Entry[] = [];
    let cursor: string | null = null;
    do {
      const got = kernel.list({ register: list, limit: SCOPE_PAGE, ...(cursor === null ? {} : { cursor }) }, kernel.scope(ctx, list));
      if (!got.ok) break;
      out.push(...got.value.rows);
      cursor = got.value.cursor;
    } while (cursor !== null && out.length < SCOPE_READ_MOST);
    return out;
  };

  const texts = (fields: Record<string, Json>, key: string | undefined): string[] => {
    const held = key === undefined ? undefined : fields[key];
    return Array.isArray(held) ? held.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  };
  const projects = new Map<string, ScopeProject>();
  for (const p of rowsOf(home))
    projects.set(p.id, {
      id: p.id,
      name: titleOf(homeDecl, p),
      repos: texts(p.fields, homeDecl.scopes?.repos),
      folders: texts(p.fields, homeDecl.scopes?.folders),
      finished: finishedIn(homeDecl, p),
    });

  /* THE LISTS, each with its rows read once: the namers are read across all of them. */
  const scoped: { list: string; decl: Decl; field: Field; rows: Entry[] }[] = [];
  for (const [list, decl] of kernel.registers()) {
    const field = scopeFieldIn(decl);
    if (field === undefined || field.type !== 'ref' || field.to !== home || readable(ctx, list) !== null) continue;
    scoped.push({ list, decl, field, rows: rowsOf(list) });
  }

  /* A RUN AND WHERE IT WAS, read once a run: its project by id, and the app it ran in. */
  const runsRead = readable(ctx, SESSION) === null;
  const runs = new Map<string, { project: string | null; by: string | null }>();
  const runOf = (name: string): { project: string | null; by: string | null } => {
    const held = runs.get(name);
    if (held) return held;
    const seq = Number(name.slice(RUN.seq_prefix.length));
    const row = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND seq = ? AND deleted_at IS NULL', SESSION, seq);
    const f = row ? (JSON.parse(row.fields) as Record<string, Json>) : {};
    const spoken = typeof f.project === 'string' && f.project !== '' ? f.project : null;
    const at = spoken === null ? null : (kernel.get(spoken)?.id ?? null);
    const app = typeof f.client === 'string' && f.client.trim() !== '' ? f.client.trim() : null;
    const out = { project: at, by: app };
    runs.set(name, out);
    return out;
  };
  const since = new Date(nowMs - USED_WITHIN_DAYS * DAY_MS).toISOString();
  /** The runs that used one row since the window opened: a write to it, or an open of a value it seals. */
  const usesOf = (row: Entry, decl: Decl): ScopeUse[] => {
    const targets = [`entry:${row.id}`];
    for (const f of decl.fields) if (f.type === 'secret' && typeof row.fields[f.id] === 'string' && row.fields[f.id] !== '') targets.push(`grant:${String(row.fields[f.id])}`);
    const out: ScopeUse[] = [];
    for (const target of targets)
      for (const u of sql.all<{ actor: string; at: string }>(
        `SELECT actor, MAX(ts) AS at FROM (SELECT actor, ts FROM event WHERE target = ? AND kind IN ('edit', 'grant.read') AND ts >= ? ORDER BY ts DESC LIMIT ?)
          WHERE actor GLOB ? AND substr(actor, ?) NOT GLOB '*[^0-9]*' GROUP BY actor`,
        target, since, SCOPE_USES_WALK, RUN_GLOB, RUN.seq_prefix.length + 1,
      ))
        out.push({ row: row.id, run: u.actor, project: runOf(u.actor).project, at: u.at });
    return out;
  };
  /** The run that added one row, when a run did. */
  const madeOf = (row: Entry): ScopeMade | null => {
    const by = sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND kind = 'create' ORDER BY rowid LIMIT 1", `entry:${row.id}`)?.actor;
    if (by === undefined || !RUN_NAME.test(by)) return null;
    const run = runOf(by);
    return { row: row.id, project: run.project, ...(run.by === null ? {} : { by: run.by }) };
  };

  /* WHO NAMES WHOM: a row of a scoped list that holds another's id in a link, or its title in a list of words (a tool's
     "Keys it needs" holding a key's name). A name two rows share names neither, since it cannot say which. */
  const byTitle = new Map<string, string[]>();
  for (const s of scoped)
    for (const row of s.rows) {
      const key = plainText(titleOf(s.decl, row));
      byTitle.set(key, [...(byTitle.get(key) ?? []), row.id]);
    }
  const known = new Set(scoped.flatMap((s) => s.rows.map((r) => r.id)));
  const namers: ScopeNamer[] = [];
  for (const s of scoped)
    for (const row of s.rows) {
      if (finishedIn(s.decl, row)) continue;
      const placed = row.fields[s.field.id];
      const project = typeof placed === 'string' && placed !== '' ? placed : null;
      const named = new Set<string>();
      for (const f of s.decl.fields) {
        if (f.id === s.field.id || f.retired === true) continue;
        const held = row.fields[f.id];
        const items = Array.isArray(held) ? held : [held];
        if (f.type === 'ref' || (f.type === 'list' && f.of === 'ref'))
          for (const v of items) if (typeof v === 'string' && known.has(v)) named.add(v);
        if (f.type === 'list' && f.of === 'text')
          for (const v of items) {
            const ids = typeof v === 'string' ? byTitle.get(plainText(v)) : undefined;
            if (ids?.length === 1) named.add(ids[0]!);
          }
      }
      named.delete(row.id);
      for (const target of named) namers.push({ row: target, by: titleOf(s.decl, row), project });
    }

  const lists: Gathered[] = [];
  for (const s of scoped) {
    if (only !== null && s.list !== only) continue;
    const rows: ScopeRow[] = s.rows.map((row) => {
      const placed = row.fields[s.field.id];
      const words = s.decl.fields
        .filter((f) => f.type === 'text' && f.id !== s.decl.title && f.retired !== true && typeof row.fields[f.id] === 'string')
        .map((f) => ({ label: f.label ?? f.id, text: String(row.fields[f.id]) }));
      return { id: row.id, list: s.list, name: titleOf(s.decl, row), project: typeof placed === 'string' && placed !== '' ? placed : null, texts: words, retired: finishedIn(s.decl, row) };
    });
    const open = rows.filter((r) => r.project === null && r.retired !== true);
    const evidence: ScopeEvidence = {
      since,
      uses: runsRead ? open.flatMap((r) => usesOf(s.rows.find((x) => x.id === r.id)!, s.decl)) : [],
      namers: namers.filter((n) => open.some((r) => r.id === n.row)),
      made: runsRead ? open.flatMap((r) => madeOf(s.rows.find((x) => x.id === r.id)!) ?? []) : [],
    };
    lists.push({
      list: s.list,
      decl: s.decl,
      field: s.field,
      rows: new Map(s.rows.map((r) => [r.id, r])),
      proposals: proposalsFor(rows, evidence, [...projects.values()], declinedOf(s.list, s.field)),
      stranded: strandedFor(rows, [...projects.values()]),
    });
  }
  return { lists, projects };
}

/**
 * The `'row:project'` pairs he said no to on a question of this list's cause: every row of one he declined, and the rows
 * he left out when he took some of one. A row his yes moved and an Undo put back is not among them: he said yes.
 */
function declinedIn(deps: RecordDeps, list: string, field: Field): Set<string> {
  const { sql, kernel } = deps;
  const out = new Set<string>();
  const closed = sql.all<{ id: string; body: string; resolved_as: string | null }>(
    "SELECT id, body, resolved_as FROM suggestion WHERE cause = ? AND status <> 'open' ORDER BY opened_at, rowid",
    scopeCause(list),
  );
  for (const q of closed) {
    let body: { rows?: unknown } | null = null;
    try {
      body = JSON.parse(q.body) as { rows?: unknown };
    } catch {
      continue;
    }
    const asked = (Array.isArray(body?.rows) ? body.rows : []).flatMap((r) => {
      const at = (r as { at?: unknown }).at;
      const to = (r as { patch?: Record<string, unknown> }).patch?.[field.id];
      const row = typeof at === 'string' ? kernel.get(at) : null;
      return row && typeof to === 'string' ? [{ row: row.id, to }] : [];
    });
    const resolved = sql.one<{ batch: string | null }>("SELECT batch FROM event WHERE kind = 'resolve' AND target = ? ORDER BY rowid DESC LIMIT 1", `suggestion:${q.id}`);
    const answer = resolved?.batch
      ? sql.one<{ answer: string }>(
          "SELECT d.answer AS answer FROM event e JOIN decision d ON e.target = 'decision:' || d.id WHERE e.kind = 'decide' AND e.batch = ? ORDER BY e.rowid DESC LIMIT 1",
          resolved.batch,
        )?.answer
      : undefined;
    const no = q.resolved_as === 'wont-fix' || q.resolved_as === 'incorrect' || answer === 'reject';
    for (const a of asked) {
      const taken = !no && resolved?.batch != null && sql.one('SELECT 1 AS y FROM event WHERE batch = ? AND target = ? LIMIT 1', resolved.batch, `entry:${a.row}`) != null;
      if (!taken && (no || answer !== undefined)) out.add(`${a.row}:${a.to}`);
    }
  }
  return out;
}

/**
 * The kernel's kind for a question of answers to choose from, read off its own list rather than spelled here. The type
 * holds it to the kind whose body carries `options`, so a list reordered in the kernel is a compile error and not a
 * question of the wrong kind.
 */
const CHOOSE: Extract<BodyKind, keyof { options: unknown }> = BODY_KINDS[0];

/**
 * The question for one list's things left in a finished project: three answers, two of which write. "Retire them" moves
 * each to a finished state its list lets it move to from where it is, with what that move needs filled, both as the list
 * declares them; "Keep them for every project" clears where they apply, which widens them and so is only ever his
 * answer, and "Leave them" writes nothing. A list with no finished state has no "Retire them", and is asked the other two.
 *
 * THE STATE IS THE LIST'S OWN. It was the one whose name held "retir", or the last finished one, with nothing else in
 * the patch: Learnings close as `superseded` or `reverted` and only with a why, so the yes could never land. Each row is
 * moved by its own state's way out, and a row with none is left out of the move.
 */
function strandedAsk(nameOf: (id: string) => string, g: Gathered, left: readonly ScopeRow[], names: ScopeListName) {
  const [retire, keep, leave] = strandedAnswers(left.length);
  const them = left.length === 1 ? 'it' : 'them';
  const because = `Nothing live works in the project ${them === 'it' ? 'it is' : 'they are'} in any more.`;
  const at = (r: ScopeRow) => ({ at: nameOf(r.id), version: g.rows.get(r.id)!.version });
  const closing = left.flatMap((r) => {
    const patch = closeOf(g.decl, g.rows.get(r.id)!, because);
    return patch === null ? [] : [{ ...at(r), patch }];
  });
  /* AND THE ANSWER SAYS THE STATE IT MOVES TO, in the list's own word (SG290): "Retire it" over a learning that moves to
     superseded asked for a state learnings do not have. "Retire" stays for a list whose finished state is retired. */
  const to = g.decl.state === undefined ? [] : [...new Set(closing.map((c) => String(c.patch[g.decl.state!])))];
  const closeLabel = to.length === 1 && !/^retired?$/iu.test(to[0]!) ? `Mark ${them} ${stateWord(g.decl, to[0]!)}` : retire;
  const options = [
    ...(closing.length === 0 ? [] : [{ id: 'retire', label: closeLabel, because, patches: closing }]),
    { id: 'every', label: keep, because: `${them === 'it' ? 'It is' : 'They are'} still needed, so every project's sessions are handed ${them}.`, patches: left.map((r) => ({ ...at(r), patch: { [g.field.id]: null } })) },
    { id: 'leave', label: leave, because: `Nothing changes, and ${them === 'it' ? 'it stays' : 'they stay'} with the finished project.` },
  ];
  const line = strandedLine(left.length, names);
  return { question: `${line} What should happen to ${them}?`, body_kind: CHOOSE, body: { options }, cause: strandedCause(g.list) };
}

/** The sentence a list she cannot read, or one with no scope field, is refused in: the same for both, naming neither. */
const NO_SUCH_LIST = 'No list you can read by that name says where its things apply. Leave register out to read every one.';

/** The sentence anybody but a person signed in is refused in: an agent proposes one move with `propose`. */
const PERSON_ONLY = 'Open this from the app; only a person puts the moves of every list to Decide. An agent proposes one move with propose.';

export function methods(deps: RecordDeps) {
  const { scoped, guard, clock, kernel, sql, no, tail } = deps;

  /** The one list asked for, or `null` for every one, or a refusal when it is not a list she reads with a scope field. */
  const onlyOf = (args: { register?: unknown } | undefined, ctx: CallContext): Result<string | null> => {
    const r = args?.register;
    if (r === undefined || r === null) return { ok: true, value: null };
    const decl = typeof r === 'string' ? kernel.register(r) : undefined;
    if (typeof r !== 'string' || decl === undefined || scopeFieldIn(decl) === undefined || deps.readable(ctx, r) !== null)
      return no('REGISTER_UNKNOWN', NO_SUCH_LIST, { at: 'register' });
    return { ok: true, value: r };
  };

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

    /**
     * `{ register? }`: where the things of each list with no scope belong, as `{ lists }`, each list
     * `{ list, name, count, line, rows, truncated, stranded, strandedLine }`, its rows `{ at, title, project, reasons }`,
     * at most 200. READ+, held to the lists the caller may read, and it changes nothing.
     */
    async scopeProposals(args: { register?: unknown } | undefined, ctx: CallContext): Promise<Result<ScopeAsks>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const only = onlyOf(args, ctx);
      if (!only.ok) return only as Result<never>;
      const found = scopeGather(deps, ctx, clock.now(), only.value, (list, field) => declinedIn(deps, list, field));
      if (found === null) return { ok: true, value: { lists: [] } };
      const lists = found.lists.map((g): ScopeAsk => {
        const names = namesOf(g.decl);
        return {
          list: g.list,
          name: g.decl.name,
          count: g.proposals.length,
          line: proposalLine(g.proposals.length, names),
          rows: g.proposals.slice(0, SCOPE_ASK_MOST).map((p) => ({
            at: kernel.nameOf(p.row),
            title: titleOf(g.decl, g.rows.get(p.row)!),
            project: found.projects.get(p.project)?.name ?? '',
            reasons: p.reasons,
          })),
          truncated: g.proposals.length > SCOPE_ASK_MOST,
          stranded: g.stranded.length,
          strandedLine: strandedLine(g.stranded.length, names),
        };
      });
      return { ok: true, value: { lists } };
    },

    /**
     * `{ register? }`: put each list's moves to Decide as one question, signed by the caller, and its things left in a
     * finished project as one question of three answers. Answers `{ asked }`, one a question filed or found waiting.
     * DATA, a person's press only, and nothing moves until she answers.
     */
    async proposeScopes(args: { register?: unknown } | undefined, ctx: CallContext): Promise<Result<ScopesAsked>> {
      if (ctx.principal.kind !== 'person') return { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: PERSON_ONLY, at: 'principal' } };
      const stop = guard(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const only = onlyOf(args, ctx);
      if (!only.ok) return only as Result<never>;
      const found = scopeGather(deps, ctx, clock.now(), only.value, (list, field) => declinedIn(deps, list, field));
      const asked: ScopeAsked[] = [];
      const by = ctx.principal.id;
      /** What one filing answered, as a line of `asked`, or nothing when he answered this already and nothing new is in it. */
      const heard = (g: Gathered, out: ReturnType<typeof kernel.propose>, said: string, rows: number): Result<null> => {
        if (!out.ok) return out as Result<never>;
        if (out.value.answered !== undefined) return { ok: true, value: null };
        const held = out.value.joined === true ? sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.value.id) : null;
        const count = held ? ((JSON.parse(held.body) as { rows?: unknown[]; options?: { patches?: unknown[] }[] }).rows?.length ?? rows) : rows;
        asked.push({ list: g.list, name: g.decl.name, question: out.value.id, said: kernel.question(out.value.id) ?? said, rows: count, opened: out.value.joined !== true });
        return { ok: true, value: null };
      };
      for (const g of found?.lists ?? []) {
        if (guard(ctx, 'propose', g.list) !== null) continue;
        const names = namesOf(g.decl);
        const moves = g.proposals.slice(0, SCOPE_ASK_MOST);
        if (moves.length > 0) {
          const said = proposalLine(moves.length, names);
          const body = {
            register: g.list,
            rows: moves.map((p) => ({ at: kernel.nameOf(p.row), version: g.rows.get(p.row)!.version, patch: { [g.field.id]: p.project } })),
            why: moves.map((p) => ({ text: `${titleOf(g.decl, g.rows.get(p.row)!)}: ${p.reasons.join('. ')}.`, at: kernel.nameOf(p.row) })),
          };
          const done = heard(g, kernel.propose({ question: said, body_kind: 'rowset', body, cause: scopeCause(g.list) }, by), said, moves.length);
          if (!done.ok) return done as Result<never>;
        }
        const left = g.stranded.slice(0, SCOPE_ASK_MOST);
        if (left.length > 0) {
          const done = heard(g, kernel.propose(strandedAsk(kernel.nameOf, g, left, names), by), strandedLine(left.length, names), left.length);
          if (!done.ok) return done as Result<never>;
        }
      }
      return tail({ ok: true as const, value: { asked } });
    },
  };
}
