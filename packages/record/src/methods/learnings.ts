/**
 * What was learned, in the order a session needs it: `learnings` (READ+), AGT-C14 job c, Build 3 ("What an agent learns
 * that a future session would otherwise get wrong becomes a learning", D0.55).
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
 * THE LIST IS FOUND BY WHAT IT DECLARES, never by a name: a list whose rows fade is one with a `confirmed_on` day, and
 * that says where its rows apply. A record with no such list is answered no rows and no refusal. A caller that list is
 * closed to is refused in the sentence `list` would say.
 *
 * NO ID LEAVES HERE. A learning is called what a person calls it (`LN12`), a day is a day, and where it applies is
 * `here` or `everywhere`: the project is the one the caller stands in, which it already knows, and no handle of it.
 *
 * IT READS AND WRITES NOTHING ELSE. No run is opened by asking and nothing is confirmed by being read.
 */

import type { Result } from '@braindog/ports';
import { whereFor } from '@braindog/kernel';
import type { Entry } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

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

/** What `learnings` answers: the rows in order, whether more stand than were answered, and how many have faded. */
export type Learnings = { rows: Learned[]; truncated: boolean; faded: number };

/** How many learnings one answer holds when nothing else is asked for, in all and not for each place. */
export const LEARNED_SHOWN = 40;
/** The most `limit` may ask for. */
export const LEARNED_MOST = 200;
/** The most read from one place before the order is made, which is the most the kernel hands of one. */
const READ_MOST = 200;

/** The field that makes a list one whose rows fade, and how long a row stands unconfirmed (`FADES` in `index.ts`). */
const FADES = 'confirmed_on';
export const LEARNED_FADE_MS = 90 * 86_400_000;

type Field = { id: string; type?: string; retired?: boolean; scope?: unknown; values?: readonly string[] };

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
 * The learnings one caller is handed at one moment. `null` is a record with no list whose rows fade. The caller's
 * right to read that list is the method's to ask first; the rows a narrowed grant leaves out are left out here.
 */
export function learnedFor(deps: RecordDeps, ctx: CallContext, nowMs: number, limit: number = LEARNED_SHOWN): Learnings {
  const { kernel, readable } = deps;
  const none: Learnings = { rows: [], truncated: false, faded: 0 };
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
  const placed = home === null ? null : kernel.inScope(id, home, { limit: READ_MOST, open: true });
  const got = placed?.ok ? placed : kernel.inScope(id, null, { limit: READ_MOST, open: true });
  if (!got.ok) return none;

  /* A GRANT NARROWED TO SOME ROWS reads those and no others: each row is asked for again under the caller's own rule. */
  const rule = whereFor(ctx.wheres, id);
  const admitted = (row: Entry): boolean => {
    if (rule === undefined || row.seq === null || row.seq === undefined) return true;
    const found = kernel.list({ register: id, where: { field: 'seq', is: row.seq }, limit: 1 }, rule);
    return found.ok && found.value.rows.length > 0;
  };

  const cutoff = new Date(nowMs - LEARNED_FADE_MS).toISOString().slice(0, 10);
  let faded = 0;
  const said = (rows: readonly Entry[], where: Learned['where']): Learned[] =>
    rows.filter(admitted).flatMap((row) => {
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
          because: text(row.fields.because),
          kind: text(row.fields.kind),
          topic: text(row.fields.topic),
          where,
          confirmed_on: confirmed,
          made,
        },
      ];
    });
  const standing = [...said(got.value.rows, 'here'), ...said(got.value.inherited, 'everywhere')].sort(learnedOrder(kindsOf(decl.fields as readonly Field[])));
  /* A place that filled the read may hold more than were read, so the answer says there may be more. */
  const full = Math.max(got.value.rows.length, got.value.inherited.length) >= READ_MOST;
  return { rows: standing.slice(0, limit), truncated: standing.length > limit || full, faded };
}

/**
 * Rows of a list whose rows fade, in the order the read hands them: for `context`, which cuts each place to its first
 * few and so must cut in this order, or the card's two lessons would be the two last touched and not the two that
 * matter (AGT-C14). `where` is the one place every row handed is in.
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
    const fades = fields.some((f) => f.id === FADES && f.type === 'day' && !f.retired);
    if (fades && fields.some((f) => f.scope !== undefined && !f.retired)) return { id, decl };
  }
  return null;
}

export function methods(deps: RecordDeps) {
  const { scoped, readable, clock, no } = deps;

  return {
    /**
     * `{ limit? }`: the learnings that still stand where the caller is, as `{ rows, truncated, faded }`, the kind the
     * list declares first before the next, the project's before everywhere, newest first. `LEARNED_SHOWN` in all unless
     * `limit` asks for another count. READ+, refused where the list is closed to the caller, and it changes nothing.
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
  };
}
