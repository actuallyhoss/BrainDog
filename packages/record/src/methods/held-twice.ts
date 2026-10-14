/**
 * What may be on the record twice: `heldTwice` (READ+), the rows behind the built-in figure `held-twice` and behind a
 * list that says what makes two of its rows the same (`same:`), and `askFoldTwice` (DATA), his press that folds them.
 *
 * BEFORE THIS THE NOTE SAID A NUMBER AND THE LIST COULD NOT SHOW WHO. The page says "People who may be on this record
 * twice: 4" and sends the reader to everybody by name to look for them. The kernel already knows which people the count
 * is about (`peopleTwiceIdsIn`, read from the database alone, as the figure is), and nothing handed them to a caller.
 *
 * AND A LIST THAT SAYS WHAT MAKES TWO OF ITS ROWS THE SAME IS ANSWERED THE SAME WAY (AGT-C13). Skills of one name in one
 * project are one skill, and the kernel's `clashes` names the groups that hold one key. Every row of such a group is
 * answered, the one kept and the others, so the list narrowed to them shows each pair whole.
 *
 * IT ANSWERS NUMBERS, NEVER WHAT THE RECORD CALLS A ROW INSIDE: each one's number in the list, lowest first, so a list
 * is narrowed to them as it is narrowed to any other pick. `heldTwice` reads, asks nothing and merges nothing; asking
 * whether two people are one is `sameOne`, and the merge is made on Decide.
 *
 * NOTHING, NEVER AN EMPTY ANSWER, WHERE NOTHING WAS LOOKED FOR, as the kernel's reader has it: a record that keeps no
 * people, a list that is neither where it keeps them nor says what makes two rows the same, and a kernel that cannot
 * look yet. Nothing held twice is an empty answer.
 *
 * WHICH LIST HOLDS THE PEOPLE IS THE KERNEL'S TO SAY (`meetsList`), so no list is named here. A caller whose grant is
 * narrowed to some of the rows is answered only those, each read again under the grant's own rule.
 *
 * READ THROUGH A LOCAL SHAPE of the kernel's two verbs over such a list (`sameClashes` and `sameFoldPlan`, `same.ts`), so
 * a kernel built before them answers nothing for the list and `NOT_IN_THIS_BUILD` for the press. Nothing in this file
 * runs on a clock: the fold is asked only when a person presses, never by the night.
 */

import type { Result } from '@braindog/ports';
import { peopleTwiceIdsIn, whereFor } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What `heldTwice` answers: the numbers of the rows that may be held twice, or `null` where nothing was looked for. */
export type HeldTwice = { seqs: number[] } | null;

/** What `askFoldTwice` answers: the question on Decide that folds them, filed now or already waiting. */
export type FoldAsked = { question: string };

/** What a list says makes two of its rows the same, as the kernel's declaration check holds it (`same:`). */
export type SameDecl = { fields: readonly string[]; within?: string; fold?: 'text' | 'exact'; keep?: 'oldest' | 'latest' | 'sealed' };

/** One key more than one live row holds: the row kept and the others, by row id (the kernel's `SameGroup`). */
export type Clash = { key: string; keep: string; others: readonly string[] };

/**
 * One write of a fold as the question carries it: a row of a list by its id, the fields it changes, and the version it
 * was read at once the press reads it. A delete is the patch `deleted_at`, as every rowset says one.
 */
export type FoldWrite = { register: string; at: string; version?: number; patch: Record<string, unknown> };

/** The kernel's two verbs over a list that declares `same:`, by the list's id. Both read and write nothing. */
export type SameReaders = {
  sameClashes?: ((register: string) => readonly Clash[]) | undefined;
  sameFoldPlan?: ((register: string) => unknown) | undefined;
};

/** A list's `same:`, or `undefined` when it declares none. */
export const sameOf = (decl: unknown): SameDecl | undefined => {
  const same = (decl as { same?: unknown } | undefined)?.same;
  return same !== null && typeof same === 'object' && Array.isArray((same as SameDecl).fields) ? (same as SameDecl) : undefined;
};

/**
 * The writes of a plan, whatever the kernel wraps them in: a list of writes, `{ writes }`, or a list of groups each
 * carrying its `writes` (`FoldGroup`). A write names its row by `at` or `id`, and changes a `patch` or is a `delete`,
 * which `at` is the instant of. Anything else is not a write and is not read as one.
 */
export function writesOf(plan: unknown, at: string): FoldWrite[] {
  const items: unknown[] = Array.isArray(plan) ? plan : Array.isArray((plan as { writes?: unknown })?.writes) ? (plan as { writes: unknown[] }).writes : [];
  const out: FoldWrite[] = [];
  for (const item of items) {
    const w = item as Record<string, unknown> | null;
    if (w === null || typeof w !== 'object') continue;
    if (Array.isArray(w.writes)) {
      out.push(...writesOf(w.writes, at));
      continue;
    }
    const row = typeof w.at === 'string' ? w.at : typeof w.id === 'string' ? w.id : undefined;
    const patch = w.delete === true ? { deleted_at: at } : w.patch;
    if (typeof w.register !== 'string' || row === undefined || patch === null || typeof patch !== 'object' || Array.isArray(patch)) continue;
    out.push({ register: w.register, at: row, ...(typeof w.version === 'number' ? { version: w.version } : {}), patch: patch as Record<string, unknown> });
  }
  return out;
}

/** The words a fold's question keeps one by, from the list's `keep`. */
const KEPT: Readonly<Record<NonNullable<SameDecl['keep']>, string>> = { oldest: 'the oldest', latest: 'the newest', sealed: 'the one with the sealed value' };

/**
 * The question his press files: "3 skills are here twice. Keep the oldest of each?" `n` is how many things are held more
 * than once, the list said by its own name for one and for many.
 */
export function foldQuestion(decl: { name?: unknown; one?: unknown } | undefined, same: SameDecl, n: number): string {
  const many = typeof decl?.name === 'string' && decl.name.trim() !== '' ? decl.name.trim() : 'rows';
  const one = typeof decl?.one === 'string' && decl.one.trim() !== '' ? decl.one.trim() : many;
  const kept = KEPT[same.keep ?? 'oldest'] ?? KEPT.oldest;
  const each = same.keep === 'sealed' ? ' in each' : ' of each';
  return n === 1
    ? `One ${one.toLowerCase()} is here twice. Keep ${kept}?`
    : `${n} ${many.toLowerCase()} are here twice. Keep ${kept}${each}?`;
}

/**
 * The cause his press files the fold under, so one list holds at most one open fold of the whole of it. A fold of some
 * groups only is filed under the list and the rows kept of those groups, sorted, so a press for other groups is its own
 * question and a press for the same ones again answers the one waiting. A cause is at most 200 characters, so a pick
 * too long to spell is filed under a fingerprint of the same sorted rows instead, two runs of 32-bit FNV-1a.
 */
export function foldCause(register: string, keeps?: readonly string[]): string {
  const whole = `tidy#same#${register}`;
  if (keeps === undefined || keeps.length === 0) return whole;
  const sorted = [...keeps].sort().join('.');
  if (whole.length + 1 + sorted.length <= CAUSE_MOST) return `${whole}#${sorted}`;
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return `${whole}#${String(keeps.length)}.${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** The longest cause the record files a question under. */
const CAUSE_MOST = 200;

/** A field of a list that links to the list itself, as the kernel's plan reads one (`same.ts` `linksInto`). */
type LinkField = { id: string; type?: unknown; of?: unknown; to?: unknown; retired?: unknown; derived?: unknown };

/** The fields of `decl` that link into `register`: a ref, or a list of refs, live and typed in. */
export const linksIn = (decl: unknown, register: string): string[] =>
  ((decl as { fields?: unknown } | undefined)?.fields as LinkField[] | undefined ?? [])
    .filter((f) => f !== null && typeof f === 'object' && f.retired !== true && f.derived !== true && f.to === register && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')))
    .map((f) => f.id);

/**
 * THE WRITES THAT FOLD SOME GROUPS ONLY, out of the plan for the whole list (AGT-D04): he picked two skills that are
 * one, and only their group is folded. Read from the writes, never from which group carries them, because the plan
 * writes a row pointing into two groups once, under the first group that names it.
 *
 * Each row folded away is kept only for a group picked. Each link moved is kept only for the links it moves into a
 * group picked, recomputed from the row as it is now (`fieldsOf`), so a link into a group left alone stays as it was.
 * And a row the plan would have folded away, left alone now, has its own links into a group picked moved too
 * (`links`, the list's fields that link to it), since the plan never writes the links of a row it folds. Links first,
 * so no write folds away a row another still points at.
 */
export function pickedWrites(
  writes: readonly FoldWrite[],
  groups: readonly Clash[],
  picked: readonly Clash[],
  register: string,
  links: readonly string[],
  fieldsOf: (id: string) => Readonly<Record<string, unknown>> | undefined,
): FoldWrite[] {
  const into = new Map<string, string>();
  for (const g of picked) for (const o of g.others) into.set(o, g.keep);
  const away = new Set(groups.flatMap((g) => g.others));
  const moved = (v: unknown): unknown => {
    if (typeof v === 'string') return into.get(v);
    if (!Array.isArray(v) || !v.some((x) => typeof x === 'string' && into.has(x))) return undefined;
    return [...new Set(v.map((x) => (typeof x === 'string' ? (into.get(x) ?? x) : x)).filter((x): x is string => typeof x === 'string'))];
  };
  const patchOf = (held: Readonly<Record<string, unknown>>, fields: Iterable<string>): Record<string, unknown> | null => {
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const to = moved(held[f]);
      if (to !== undefined) patch[f] = to;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const linked: FoldWrite[] = [];
  const folds: FoldWrite[] = [];
  for (const w of writes) {
    if (away.has(w.at)) {
      if (into.has(w.at)) folds.push(w);
      continue;
    }
    const patch = patchOf(fieldsOf(w.at) ?? {}, Object.keys(w.patch));
    if (patch !== null) linked.push({ ...w, patch });
  }
  for (const id of away) {
    if (into.has(id)) continue;
    const held = fieldsOf(id);
    const patch = held === undefined ? null : patchOf(held, links);
    if (patch !== null) linked.push({ register, at: id, patch });
  }
  return [...linked, ...folds];
}

/** At most how many picked a press names, so one call never reads the whole record a row at a time. */
const PICK_MOST = 1000;

/** The sentence a token's press is refused in: folding is a person's own press, as putting a list back is. */
const PERSONS = 'Folding what is here twice changes many things at once, and only a person decides that, signed in. Open the list in the app.';

/**
 * `readers` stands in for the kernel's two verbs, handed in only by a test over a kernel built before them. Absent, they
 * are the kernel's own.
 */
export function methods(deps: RecordDeps, readers?: SameReaders) {
  const { kernel, sql, guard, named, no, tail, clock } = deps;
  const verbs = kernel as unknown as SameReaders;
  const same: SameReaders = readers ?? { sameClashes: verbs.sameClashes, sameFoldPlan: verbs.sameFoldPlan };

  /* SOMETHING A NARROWED GRANT LEAVES OUT IS NOT THERE FOR THIS CALLER, read as `sameOne` reads it: the row again by its
     own number under the grant's rule. A grant that is whole admits everything. */
  const admittedBy = (ctx: CallContext, register: string) => {
    const rule = whereFor(ctx.wheres, register);
    return (seq: number): boolean => {
      if (rule === undefined) return true;
      const found = kernel.list({ register, where: { field: 'seq', is: seq }, limit: 1 }, rule);
      return found.ok && found.value.rows.length > 0;
    };
  };

  /** A live row's number in its list, or `null` when it is gone or not of that list. */
  const seqOf = (id: string, register: string): number | null =>
    sql.one<{ seq: number | null }>('SELECT seq FROM entry WHERE id = ? AND register = ? AND deleted_at IS NULL', id, register)?.seq ?? null;

  /** The groups of a list held more than once, each with somebody beside the one kept. */
  const groupsOf = (register: string): readonly Clash[] => (same.sameClashes?.(register) ?? []).filter((g) => g.others.length > 0);

  /** A list's opening checks, shared by the read and the press: named at all, as text, and a list of this record. */
  const listOf = (args: { register?: unknown } | undefined): Result<string> => {
    const unnamed = named(args);
    if (unnamed) return { ok: false, refusal: unnamed };
    const register = String(args?.register);
    if (!kernel.register(register)) return no('REGISTER_UNKNOWN', `There is no list called ${register}.`, { at: 'register' });
    return { ok: true, value: register };
  };

  return {
    /**
     * `{ register }`: the rows of that list that may be on the record twice, as `{ seqs }`, their numbers in the list,
     * lowest first. For the people, who may be one person; for a list that says what makes two rows the same, every row
     * of a group with another. `null` when the list is neither. READ+, and it changes nothing.
     */
    async heldTwice(args: { register?: unknown } | undefined, ctx: CallContext): Promise<Result<HeldTwice>> {
      const stop = guard(ctx, 'read', typeof args?.register === 'string' ? args.register : undefined);
      if (stop) return { ok: false, refusal: stop };
      const listed = listOf(args);
      if (!listed.ok) return listed as Result<never>;
      const register = listed.value;
      const admitted = admittedBy(ctx, register);
      const seqs = new Set<number>();

      if (kernel.meetsList()?.register === register) {
        const ids = peopleTwiceIdsIn(sql);
        if (ids === null) return { ok: true, value: null };
        for (const id of ids) {
          const seq = seqOf(id, register);
          if (typeof seq === 'number') seqs.add(seq);
        }
      } else {
        if (sameOf(kernel.register(register)) === undefined || same.sameClashes === undefined) return { ok: true, value: null };
        for (const g of groupsOf(register))
          for (const id of [g.keep, ...g.others]) {
            const seq = seqOf(id, register);
            if (typeof seq === 'number') seqs.add(seq);
          }
      }
      return { ok: true, value: { seqs: [...seqs].filter(admitted).sort((a, b) => a - b) } };
    },

    /**
     * `{ register, rows? }`: one question on Decide that folds everything the list holds twice, "3 skills are here twice.
     * Keep the oldest of each?", signed by the person who pressed. Accepting it writes the kernel's plan in one batch, so
     * one Undo brings every row back. Answers `{ question }`, and the one already waiting when it is pressed again. DATA,
     * a person's only, and nothing is folded until the question is answered.
     *
     * WITH `rows`, THE ONES HE PICKED (each by its number in the list, its handle or its id), only the groups holding one
     * of them are asked about and folded. None of them held twice is refused at `rows`. A fold of the whole list already
     * waiting holds them, so it is the one answered, never a second question over the same things.
     */
    async askFoldTwice(args: { register?: unknown; rows?: unknown } | undefined, ctx: CallContext): Promise<Result<FoldAsked>> {
      const stop = guard(ctx, 'write', typeof args?.register === 'string' ? args.register : undefined);
      if (stop) return { ok: false, refusal: stop };
      const listed = listOf(args);
      if (!listed.ok) return listed as Result<never>;
      const register = listed.value;
      if (ctx.principal.kind !== 'person') return no('NEEDS_BROWSER_SESSION', PERSONS, { at: 'principal' });
      const decl = kernel.register(register);
      const name = decl?.name ?? register;
      const rule = sameOf(decl);
      if (rule === undefined)
        return no('VALUE_MALFORMED', `${name} does not say what makes two of them the same, so nothing in it is folded as one.`, { at: 'register' });
      if (same.sameClashes === undefined || same.sameFoldPlan === undefined)
        return no('NOT_IN_THIS_BUILD', `This BrainDog cannot fold what is here twice in ${name} yet. It arrives with the next update.`);
      const many = String(name).toLowerCase();
      const asked = args?.rows;
      const handle = (r: unknown): boolean =>
        (typeof r === 'number' && Number.isInteger(r) && r > 0) || (typeof r === 'string' && r !== '' && r.length <= 80 && !/\s/u.test(r));
      if (asked !== undefined && (!Array.isArray(asked) || asked.length === 0 || asked.length > PICK_MOST || !asked.every(handle)))
        return no('VALUE_MALFORMED', `Say which ${many} to fold: rows is a list of the ones picked, each by its number in the list.`, { at: 'rows' });

      const all = groupsOf(register);
      if (all.length === 0) return no('ALREADY_KNOWN', `Nothing in ${name} is here twice, so nothing was asked.`, { at: 'register' });
      /* THE GROUPS HE PICKED FROM: each one picked read as the record names it, and a group kept when its kept row or
         one of its others is among them. Something gone, or of another list, is simply not among them. */
      let groups = all;
      if (Array.isArray(asked)) {
        const ids = new Set<string>();
        for (const r of asked as (string | number)[]) {
          const row = kernel.get(typeof r === 'number' || /^\d+$/u.test(r) ? `${register}#${String(r)}` : r);
          if (row !== null && row.register === register) ids.add(row.id);
        }
        groups = all.filter((g) => [g.keep, ...g.others].some((id) => ids.has(id)));
        if (groups.length === 0)
          return no('VALUE_MALFORMED', `None of the ${many} picked is here twice, so nothing was asked. Pick the ones the list shows as here twice.`, { at: 'rows' });
      }
      const some = groups.length < all.length;
      /* A FOLD OF THE WHOLE LIST ALREADY WAITING HOLDS THESE TOO, so it is the question answered, never a second one
         asking to fold the same things. */
      if (some) {
        const waiting = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE cause = ? AND status = 'open' LIMIT 1", foldCause(register));
        if (waiting) return tail({ ok: true as const, value: { question: waiting.id } });
      }
      /* A FOLD IS OF EVERY ROW IT NAMES, so somebody whose grant leaves out one of them is not the one to ask for it: the
         rows they cannot read are never named, and nothing is filed. */
      const admitted = admittedBy(ctx, register);
      const unseen = groups.some((g) => [g.keep, ...g.others].some((id) => {
        const seq = seqOf(id, register);
        return seq !== null && !admitted(seq);
      }));
      if (unseen)
        return no('FORBIDDEN', `Some of what is here twice in ${name} is outside what you can see, so folding it is for somebody who sees all of ${name}.`, { at: 'register' });

      const planned = writesOf(same.sameFoldPlan(register), new Date(clock.now()).toISOString());
      const writes = some ? pickedWrites(planned, all, groups, register, linksIn(decl, register), (id) => kernel.get(id)?.fields) : planned;
      /* A LINK HELD IN ANOTHER LIST MOVES IN THE SAME QUESTION: its row names its own list (`register`), and whoever
         pressed must be one who may write there too, since accepting writes it as the fold's own change. */
      for (const there of new Set(writes.filter((w) => w.register !== register).map((w) => w.register))) {
        const barred = guard(ctx, 'write', there);
        if (barred) return { ok: false, refusal: barred };
      }
      if (writes.length === 0) return no('ALREADY_KNOWN', `Nothing in ${name} is here twice, so nothing was asked.`, { at: 'register' });
      /* ONE WRITE A ROW, at the version it is read at now, so a row changed before the press is answered as the house
         conflict and never overwritten. The kernel writes each row once; two for one row are put in one patch here. */
      const rows = new Map<string, { at: string; version: number; patch: Record<string, unknown>; register?: string }>();
      for (const w of writes) {
        const row = kernel.get(w.at);
        if (row === null) return no('ROW_UNKNOWN', `Something in ${name} changed while this was read. Press again.`, { at: 'register' });
        const had = rows.get(row.id);
        rows.set(row.id, {
          at: kernel.nameOf(row.id),
          version: had?.version ?? w.version ?? row.version,
          patch: { ...had?.patch, ...w.patch },
          ...(row.register === register ? {} : { register: row.register }),
        });
      }

      /* SIGNED BY THE PERSON WHO PRESSED, never by the record: the night computes and shows, and only this press asks. A
         fold he declined before is asked again, since pressing is asking again; one still open is answered as it is. */
      const filed = kernel.propose(
        {
          question: foldQuestion(decl as { name?: unknown; one?: unknown }, rule, groups.length),
          body_kind: 'rowset',
          body: { register, rows: [...rows.values()] },
          cause: foldCause(register, some ? groups.map((g) => g.keep) : undefined),
          again: 'You asked again from the list.',
        },
        { actor: ctx.principal.id },
      );
      if (!filed.ok) return filed as Result<never>;
      return tail({ ok: true as const, value: { question: filed.value.id } });
    },
  };
}
