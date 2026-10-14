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

/** The cause his press files the fold under, so one list holds at most one open fold. */
export const foldCause = (register: string): string => `tidy#same#${register}`;

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
     * `{ register }`: one question on Decide that folds everything the list holds twice, "3 skills are here twice. Keep
     * the oldest of each?", signed by the person who pressed. Accepting it writes the kernel's plan in one batch, so one
     * Undo brings every row back. Answers `{ question }`, and the one already waiting when it is pressed again. DATA, a
     * person's only, and nothing is folded until the question is answered.
     */
    async askFoldTwice(args: { register?: unknown } | undefined, ctx: CallContext): Promise<Result<FoldAsked>> {
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

      const groups = groupsOf(register);
      if (groups.length === 0) return no('ALREADY_KNOWN', `Nothing in ${name} is here twice, so nothing was asked.`, { at: 'register' });
      /* A FOLD IS OF THE WHOLE LIST, so somebody whose grant leaves out a row of it is not the one to ask for it: the rows
         they cannot read are never named, and nothing is filed. */
      const admitted = admittedBy(ctx, register);
      const unseen = groups.some((g) => [g.keep, ...g.others].some((id) => {
        const seq = seqOf(id, register);
        return seq !== null && !admitted(seq);
      }));
      if (unseen)
        return no('FORBIDDEN', `Some of what is here twice in ${name} is outside what you can see, so folding it is for somebody who sees all of ${name}.`, { at: 'register' });

      const writes = writesOf(same.sameFoldPlan(register), new Date(clock.now()).toISOString());
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
          cause: foldCause(register),
          again: 'You asked again from the list.',
        },
        { actor: ctx.principal.id },
      );
      if (!filed.ok) return filed as Result<never>;
      return tail({ ok: true as const, value: { question: filed.value.id } });
    },
  };
}
