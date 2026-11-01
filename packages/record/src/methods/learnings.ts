/**
 * What was learned, in the order a session needs it: `learnings` (READ+), AGT-C14 job c, Build 3 ("What an agent learns
 * that a future session would otherwise get wrong becomes a learning").
 *
 * WHAT WAS THERE BEFORE. `context` hands a run twenty of the project's and twenty from everywhere, in the order the
 * rows last changed (`index.ts`, the fading read). So a note whose topic was corrected this morning stood above the
 * method that keeps a run out of a hole, and the twenty-first method of a project was never handed to anybody.
 *
 * THE ORDER, AND IT IS ALL OF THEM IN ONE: the kind the list declares first before the kind it declares second (method
 * before fact, as the add-on writes them), then what applies in the project the caller stands in before what applies
 * everywhere, then the newest first, by the day it was made and then by its number. An edit moves nothing, and
 * neither does confirming one: a confirmation keeps a learning from fading, and that is all it does here.
 *
 * FORTY IN ALL (`LEARNED_SHOWN`), not twenty a place, and `truncated` says when more stand than were answered.
 *
 * WHAT IS NOT A ROW. One the list counts as finished (replaced, or taken back) is not read at all. One neither
 * confirmed nor made in the last ninety days has faded: it is left out and counted in `faded`, exactly as `context`
 * counts it, so the two never disagree about which learnings a run is still held to.
 *
 * ONE ANOTHER REPLACES IS NOT A ROW EITHER (AGT-C14 job b, as a read). A learning names the one it replaces in the field
 * that points at its own list (`replacesField`), and nothing moved the old one, so it was handed beside the lesson that
 * replaced it. `replacedIn` says which a standing learning replaces, down a chain and never round a loop, and those are
 * left out and counted in `replaced`. Nothing is written: the old row keeps its state and is still on the list for a
 * person, and taking the new one back or deleting it hands the old one again. Moving the old row to `superseded` in
 * the same write is the scope's, and his to rule.
 *
 * THE LIST IS FOUND BY WHAT IT DECLARES, never by a name: a list whose rows fade is one with a `confirmed_on` day, and
 * that says where its rows apply. A record with no such list is answered no rows and no refusal. A caller that list is
 * closed to is refused in the sentence `list` would say.
 *
 * NO ID LEAVES HERE. A learning is called what a person calls it (`LN12`), a day is a day, and where it applies is
 * `here` or `everywhere`: the project is the one the caller stands in, which it already knows, and no handle of it.
 *
 * IT READS AND WRITES NOTHING ELSE. No run is opened by asking and nothing is confirmed by being read.
 *
 * ONE LESSON LEARNED TWICE. `learningsTwice` (READ+) says which lessons two projects learned
 * on their own, by the rule in `../learning-promote.ts`, and `promoteLearnings` (DATA, a person's only) puts each to
 * Decide as one question. It is asked when a person asks and never by the night: a matcher may show, and only a press
 * asks. Here and not in the kernel, so no kernel export and no table line was needed.
 */

import type { Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';
import { readSight } from '../sight.ts';
import { fadeDays, fadeOf } from '../agent-lists.ts';
import { PROMOTED_WHY, promotionQuestion, promotionsFor, type Lesson, type Promotion } from '../learning-promote.ts';

/** One learning as a session reads it. `made` and `confirmed_on` are days; `where` is never a project's handle. */
export type Learned = {
  spoken: string;
  lesson: string;
  because: string | null;
  kind: string | null;
  topic: string | null;
  where: 'here' | 'everywhere';
  confirmed_on: string | null;
  made: string;
};

/**
 * What `learnings` answers: the rows in order, whether more stand than were answered, how many have faded, and how many
 * were left out because a learning that stands replaces them.
 */
export type Learnings = { rows: Learned[]; truncated: boolean; faded: number; replaced: number };

/** How many learnings one answer holds when nothing else is asked for, in all and not for each place. */
export const LEARNED_SHOWN = 40;
/** The most `limit` may ask for. */
export const LEARNED_MOST = 200;
/** The most read from one place before the order is made, which is the most the kernel hands of one. */
const READ_MOST = 200;

/**
 * How long a row stands unconfirmed on a list that declares no fade of its own and has the old `confirmed_on` day. A list
 * that declares `fade: { field, after }` fades by that instead (`agent-lists.ts` `fadeOf`).
 */
export const LEARNED_FADE_MS = 90 * 86_400_000;

type Field = { id: string; type?: string; to?: string; retired?: boolean; scope?: unknown; values?: readonly string[] };

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
/** The number in a spoken id, `12` of `LN12`, which is the order two learnings of one day were made in. */
const numberOf = (spoken: string): number => Number(/([0-9]+)$/u.exec(spoken)?.[1] ?? 0);

/** What the order reads of a learning, so the card's slot can be put in it from the short form it holds. */
export type LearnedPlace = Pick<Learned, 'kind' | 'where' | 'made' | 'spoken'>;

/**
 * The order learnings are handed in, as a comparator for `sort`. `kinds` is the kinds in the order the list declares
 * them (`method`, then `fact`), and a kind it does not hold comes after every one it does.
 */
export const learnedOrder = (kinds: readonly string[]) => {
  const rank = (kind: string | null): number => {
    const at = kind === null ? -1 : kinds.indexOf(kind);
    return at === -1 ? kinds.length : at;
  };
  return (a: LearnedPlace, b: LearnedPlace): number =>
    rank(a.kind) - rank(b.kind) ||
    (a.where === b.where ? 0 : a.where === 'here' ? -1 : 1) ||
    (a.made === b.made ? 0 : a.made > b.made ? -1 : 1) ||
    numberOf(b.spoken) - numberOf(a.spoken) ||
    (a.spoken < b.spoken ? -1 : a.spoken > b.spoken ? 1 : 0);
};

/**
 * The field a learning names the one it replaces in: a ref to its own list, by what the list declares and never by a
 * name. `null` when the list declares none, and then nothing is ever replaced.
 */
export const replacesField = (list: string, fields: readonly Field[]): string | null =>
  fields.find((f) => f.type === 'ref' && f.to === list && !f.retired)?.id ?? null;

/**
 * The ids the learnings that stand replace, from `rows`, which are the rows that stand: read open (nothing replaced,
 * taken back or deleted), so a replacement taken back or deleted replaces nothing and hands the old one back.
 *
 * DOWN A CHAIN: C replaces B replaces A, and A and B are both out. The walk starts at each row no other row in `rows`
 * names, which is a lesson nothing has replaced, and follows what it names until a row is not in `rows`.
 *
 * NEVER ROUND A LOOP. A walk stops at an id it has put out already, and a row that names itself names nothing. Two
 * that name each other and nothing else have no start, so neither is out: nobody can say which of them holds.
 */
export function replacedIn(rows: readonly Entry[], field: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!field) return out;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const named = (row: Entry): string | null => {
    const v = row.fields[field];
    return typeof v === 'string' && v !== '' && v !== row.id ? v : null;
  };
  const isNamed = new Set(rows.map(named).filter((id): id is string => id !== null));
  for (const head of rows) {
    if (isNamed.has(head.id)) continue;
    let at = named(head);
    while (at !== null && at !== head.id && !out.has(at)) {
      out.add(at);
      const next = byId.get(at);
      at = next === undefined ? null : named(next);
    }
  }
  return out;
}

/**
 * The learnings one caller is handed at one moment. `null` is a record with no list whose rows fade. The caller's
 * right to read that list is the method's to ask first; the rows a narrowed grant leaves out are left out here.
 */
export function learnedFor(deps: RecordDeps, ctx: CallContext, nowMs: number, limit: number = LEARNED_SHOWN): Learnings {
  const { kernel, readable } = deps;
  const none: Learnings = { rows: [], truncated: false, faded: 0, replaced: 0 };
  const list = fadingList(deps);
  if (list === null) return none;
  const { id, decl } = list;

  /* WHERE THE CALLER STANDS, as `context` resolves it: from the place it sent, or from where its run was. A caller who
     may not read the projects stands nowhere in particular, and is handed what applies everywhere. */
  const hints = ctx.session ?? {};
  const run = ctx.principal.kind === 'token' ? kernel.findRun(hints, ctx.principal.id) : null;
  const place =
    hints.remote || hints.repo || hints.cwd
      ? hints
      : run
        ? { remote: text(run.fields.remote) ?? undefined, repo: text(run.fields.repo) ?? undefined, cwd: text(run.fields.cwd) ?? undefined }
        : {};
  const holder = [...kernel.registers().values()].find((d) => d.scopes !== undefined);
  const home = holder && readable(ctx, holder.id) === null ? (kernel.resolveProject(place).project?.id ?? null) : null;

  /* Finished ones are left out by the kernel, before its limit. A project this list does not apply to is no project. */
  /* A GRANT NARROWED TO SOME ROWS reads those and no others, and nobody reads a row kept private from them: the read is
     held to both in its own query (`sight.inScope`), where each row was asked for again under the rule alone. */
  const sight = readSight(kernel);
  const placed = home === null ? null : sight.inScope(ctx, id, home, { limit: READ_MOST, open: true });
  const got = placed?.ok ? placed : sight.inScope(ctx, id, null, { limit: READ_MOST, open: true });
  if (!got.ok) return none;

  const here = got.value.rows;
  const wide = got.value.inherited;
  /* WHAT A LEARNING THAT STANDS REPLACES is left out, judged across both places and among the rows this caller reads.
     One that has faded still replaces: it says the old one stopped being true, whether or not it is handed itself. */
  const out = replacedIn([...here, ...wide], replacesField(id, decl.fields as readonly Field[]));
  const fade = fadeOf(decl);
  const FADES = fade?.field ?? 'confirmed_on';
  const cutoff = new Date(nowMs - (fade === null ? LEARNED_FADE_MS : fadeDays(fade.after)! * 86_400_000)).toISOString().slice(0, 10);
  let faded = 0;
  let replaced = 0;
  const hidden = new Set(ctx.hides?.[id] ?? []);
  const shown = (field: string): boolean => !hidden.has(field);
  const said = (rows: readonly Entry[], where: Learned['where']): Learned[] =>
    rows.flatMap((row) => {
      if (out.has(row.id)) {
        replaced += 1;
        return [];
      }
      const made = row.created_at.slice(0, 10);
      const confirmed = text(row.fields[FADES]);
      if ((confirmed ?? made) < cutoff) {
        faded += 1;
        return [];
      }
      return [
        {
          spoken: kernel.nameOf(row.id),
          lesson: text(row.fields[decl.title]) ?? '',
          /* A FIELD A SHARE HIDES FROM HER IS SAID AS NOTHING (`hides`), as `get` leaves it out. */
          because: shown('because') ? text(row.fields.because) : null,
          kind: shown('kind') ? text(row.fields.kind) : null,
          topic: shown('topic') ? text(row.fields.topic) : null,
          where,
          confirmed_on: confirmed,
          made,
        },
      ];
    });
  const standing = [...said(here, 'here'), ...said(wide, 'everywhere')].sort(learnedOrder(kindsOf(decl.fields as readonly Field[])));
  /* A place that filled the read may hold more than were read, so the answer says there may be more. */
  const full = Math.max(got.value.rows.length, got.value.inherited.length) >= READ_MOST;
  return { rows: standing.slice(0, limit), truncated: standing.length > limit || full, faded, replaced };
}

/**
 * Rows of a list whose rows fade, in the order the read hands them: for `context`, which cuts each place to its first
 * few and so must cut in this order, or the card's two lessons would be the two last touched and not the two that
 * matter. `where` is the one place every row handed is in.
 */
export function learnedSorted(fields: readonly Field[], rows: readonly Entry[], where: Learned['where'], nameOf: (id: string) => string): Entry[] {
  const order = learnedOrder(kindsOf(fields));
  const place = (row: Entry): LearnedPlace => ({ kind: text(row.fields.kind), where, made: row.created_at.slice(0, 10), spoken: nameOf(row.id) });
  return rows
    .map((row) => ({ row, at: place(row) }))
    .sort((a, b) => order(a.at, b.at))
    .map((p) => p.row);
}

/** The kinds a list declares, in its own order, which is the order they are handed in. None when it declares none. */
const kindsOf = (fields: readonly Field[]): readonly string[] => fields.find((f) => f.id === 'kind' && f.type === 'enum' && !f.retired)?.values ?? [];

/** The first list whose rows fade and that says where they apply, by what it declares and never by its name. */
function fadingList(deps: RecordDeps) {
  for (const [id, decl] of deps.kernel.registers()) {
    const fields = decl.fields as readonly Field[];
    const fades = fadeOf(decl) !== null;
    if (fades && fields.some((f) => f.scope !== undefined && !f.retired)) return { id, decl };
  }
  return null;
}

/* ── one lesson learned twice ─────────────────────────────────────────────────────────────── */

/** One side of a lesson learned twice, as a person reads it: the learning by its spoken id, its words, its project's name. */
export type TwiceSide = { spoken: string; lesson: string; project: string };
/** One lesson learned twice: the older and the newer, the topic they share, and the question it would be put as. */
export type Twice = { older: TwiceSide; newer: TwiceSide; topic: string; question: string; parts: readonly string[] };
/** What `learningsTwice` answers: the pairs, older first, and whether more stand than were answered. */
export type LearnedTwice = { pairs: Twice[]; truncated: boolean };
/**
 * What `promoteLearnings` answers: each question this press filed, by its words (`opened` false when it joined one
 * already waiting), and how many such questions wait on Decide now.
 */
export type Promoted = { asked: { said: string; opened: boolean }[]; open: number };

/** The most pairs one `learningsTwice` answers, and the most of these questions open on Decide at once. */
export const TWICE_SHOWN = 20;
export const TWICE_OPEN_MOST = 5;
/** The most learnings read to find pairs in, the most one kernel read hands. */
const TWICE_READ = 500;
/** What every such question is filed under, then the two rows' ids, so one pair is asked once and a no is kept. */
const TWICE_CAUSE = 'learned-twice#';

type Pair = { promotion: Promotion; rows: [Entry, Entry]; said: Twice };
type Listed = NonNullable<ReturnType<typeof fadingList>>;

/**
 * Every lesson learned twice that this caller may read, older first, each with its question. `null` is a record with
 * no list whose rows fade. Both rows must be ones the caller's grant admits; a project the caller may not read is
 * called "One project" and "another project", never by an id.
 */
function twiceFor(deps: RecordDeps, ctx: CallContext): { list: Listed; pairs: Pair[] } | null {
  const { kernel, readable } = deps;
  const list = fadingList(deps);
  if (list === null) return null;
  const { id, decl } = list;
  const place = (decl.fields as readonly Field[]).find((f) => f.scope !== undefined && !f.retired);
  /* A LEARNING THAT STANDS is one in the state its list starts a row in, which the list declares (`active`). */
  const standing = decl.fields.find((f) => f.id === decl.state)?.default;
  if (place === undefined || typeof standing !== 'string') return { list, pairs: [] };
  const got = kernel.list({ register: id, where: { field: decl.state!, is: standing }, limit: TWICE_READ }, kernel.scope(ctx, id));
  if (!got.ok) return { list, pairs: [] };
  const byId = new Map(got.value.rows.map((row) => [row.id, row]));
  const lessons: Lesson[] = got.value.rows.map((row) => ({
    id: row.id,
    lesson: text(row.fields[decl.title]) ?? '',
    topic: (ctx.hides?.[id] ?? []).includes('topic') ? null : text(row.fields.topic),
    active: row.state === standing,
    made: row.created_at,
    because: (ctx.hides?.[id] ?? []).includes('because') ? null : text(row.fields.because),
  }));
  const projectOf = (l: Lesson): string | null => text(byId.get(l.id)?.fields[place.id]);
  const sight = readSight(kernel);
  const pairs = promotionsFor(lessons, projectOf).map((promotion): Pair => {
    const nameOf = (project: string): string => {
      const row = kernel.get(project);
      const title = row && readable(ctx, row.register) === null && sight.admits(ctx, row) ? kernel.titleOfRow(project) : null;
      return title ?? (project === promotion.olderProject ? 'One project' : 'another project');
    };
    const asked = promotionQuestion(promotion, nameOf);
    const side = (l: Lesson, project: string): TwiceSide => ({ spoken: kernel.nameOf(l.id), lesson: l.lesson, project: nameOf(project) });
    return {
      promotion,
      rows: [byId.get(promotion.older.id)!, byId.get(promotion.newer.id)!],
      said: {
        older: side(promotion.older, promotion.olderProject),
        newer: side(promotion.newer, promotion.newerProject),
        topic: promotion.older.topic ?? '',
        question: asked.question,
        parts: asked.parts,
      },
    };
  });
  return { list, pairs };
}

export function methods(deps: RecordDeps) {
  const { kernel, scoped, readable, clock, no } = deps;

  return {
    /**
     * `{ limit? }`: the learnings that still stand where the caller is, as `{ rows, truncated, faded, replaced }`, the
     * kind the list declares first before the next, the project's before everywhere, newest first. `LEARNED_SHOWN` in
     * all unless `limit` asks for another count. One a standing learning replaces is left out and counted in
     * `replaced`. READ+, refused where the list is closed to the caller, and it changes nothing.
     */
    async learnings(args: { limit?: unknown } | undefined, ctx: CallContext): Promise<Result<Learnings>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const limit = args?.limit ?? LEARNED_SHOWN;
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > LEARNED_MOST)
        return no('VALUE_MALFORMED', `limit is a whole number from 1 to ${LEARNED_MOST}.`, { at: 'limit' });
      const list = fadingList(deps);
      const closed = list === null ? null : readable(ctx, list.id);
      if (closed) return { ok: false, refusal: closed };
      return { ok: true, value: learnedFor(deps, ctx, clock.now(), limit) };
    },

    /**
     * `{}`: each lesson two projects learned on their own, as `{ pairs, truncated }`, older first, at most
     * `TWICE_SHOWN`, each with the question it would be put as. READ+, held to the rows the caller may read, and it
     * changes and asks nothing.
     */
    async learningsTwice(_args: unknown, ctx: CallContext): Promise<Result<LearnedTwice>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const list = fadingList(deps);
      const closed = list === null ? null : readable(ctx, list.id);
      if (closed) return { ok: false, refusal: closed };
      const pairs = twiceFor(deps, ctx)?.pairs ?? [];
      return { ok: true, value: { pairs: pairs.slice(0, TWICE_SHOWN).map((p) => p.said), truncated: pairs.length > TWICE_SHOWN } };
    },

    /**
     * `{}`: one question on Decide for each lesson learned twice, "Kiln and Oxbow.gg learned the same thing. Keep it
     * once, for everywhere?", the four parts of the test under it, signed by the person who pressed. DATA, a person's
     * only: no agent widens a learning, and no night asks this by itself. At most `TWICE_OPEN_MOST` wait at once; a
     * pair asked already, or one he said no to, is never asked again. Accepting one is a rowset Decide writes in one
     * batch, so one Undo takes it back: the older row's project is cleared, and the newer row is marked replaced with
     * the reason `PROMOTED_WHY`. Answers `{ asked, open }`, `asked` each question filed by its words.
     */
    async promoteLearnings(_args: unknown, ctx: CallContext): Promise<Result<Promoted>> {
      const list = fadingList(deps);
      const stop = deps.guard(ctx, 'propose', list?.id);
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person')
        return no('NEEDS_BROWSER_SESSION', 'Only a person keeps a lesson once for everywhere. Open BrainDog and ask from there.', { at: 'principal' });
      const found = twiceFor(deps, ctx);
      const openNow = (): number =>
        Number(deps.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND substr(cause, 1, ?) = ?", TWICE_CAUSE.length, TWICE_CAUSE)?.n ?? 0);
      if (found === null || found.pairs.length === 0) return { ok: true, value: { asked: [], open: openNow() } };
      const { decl } = found.list;
      const state = decl.fields.find((f) => f.id === decl.state);
      const place = (decl.fields as readonly Field[]).find((f) => f.scope !== undefined && !f.retired)!;

      const asked: Promoted['asked'] = [];
      for (const { promotion, rows, said } of found.pairs) {
        if (openNow() >= TWICE_OPEN_MOST) break;
        const cause = `${TWICE_CAUSE}${promotion.older.id}#${promotion.newer.id}`;
        /* ASKED ONCE, AND A NO IS KEPT: any question under this cause, open or answered, means this pair was asked. */
        if (deps.sql.one('SELECT 1 AS y FROM suggestion WHERE cause = ?', cause) != null) continue;
        /* THE NEWER ROW IS REPLACED, the first finished state its list lets a standing row move to, and with the
           reason the move requires, both as the list declares them. */
        const from = rows[1].state ?? '';
        const move = state?.transitions?.[from];
        const to = decl.done?.find((d) => move?.to.includes(d));
        const reason = move?.requires?.[0];
        if (to === undefined || decl.state === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot mark a learning replaced, so a lesson learned twice is not asked about.');
        const filed = kernel.propose(
          {
            question: said.question,
            body_kind: 'rowset',
            body: {
              register: found.list.id,
              rows: [
                { at: said.older.spoken, version: rows[0].version, patch: { [place.id]: null } },
                { at: said.newer.spoken, version: rows[1].version, patch: { [decl.state]: to, ...(reason ? { [reason]: PROMOTED_WHY } : {}) } },
              ],
              context: said.parts.join('\n'),
            },
            cause,
          },
          ctx.principal.id,
        );
        if (!filed.ok) return deps.tail(filed as Result<never>);
        if (filed.value.answered === undefined) asked.push({ said: said.question, opened: filed.value.joined === undefined });
      }
      return deps.tail({ ok: true as const, value: { asked, open: openNow() } });
    },
  };
}
