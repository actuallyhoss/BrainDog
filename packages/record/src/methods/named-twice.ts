/**
 * What else may be on the record twice: `namedTwice` (READ+), the organisations and projects the kernel finds of one
 * name, each with its one sentence, and `askNamedSame` (DATA), his press that puts one of them to Decide.
 *
 * BEFORE THIS THE KERNEL FOUND THEM AND NOBODY WAS TOLD. `pairsFor` reads two organisations or two projects of one
 * name, and a name seen beside the one row it reads as, ranked, each with a sentence (`evidenceOf`), and nothing called
 * it. Two people have `heldTwice` and the folds the record made are listed by `matched`; organisations and projects held
 * twice were shown to nobody.
 *
 * A NAME PROPOSES AND NEVER DECIDES. So nothing here folds by itself, by day or by night: the read shows, and only a
 * person's press files a question, signed by that person. Accepting it writes the fold in one batch, so one Undo puts
 * the two back. The question carries the pair's own hash under `pair`, which is what the kernel reads a pair as settled
 * by (`settledIn`), so once asked, answered or undone, the pair is never offered again.
 *
 * ONE QUESTION A PAIR, AND ONE FOLD: the row named second is pointed at the first, which is the older and is kept. What
 * else points at the folded one follows the fold's chain as the kernel reads it (`foldEnd`); moving those is not this.
 *
 * A PAIR IS PRESSED ONLY WHERE THERE IS SOMETHING TO FOLD. Both sides must be rows, and the list must say what a row is
 * folded into. A name that was only seen has no row to point, and a list of projects that declares no such field cannot
 * be folded until it does, which is a change to that list and its owner's call. Both are shown, and read `can: false`.
 *
 * NAMES, NEVER IDS. Each side by what it is called and its number in its list. Somebody a list is closed to, or whose
 * grant leaves either row out, is not told of the pair at all.
 */

import type { Result } from '@braindog/ports';
import { PAIRS_MOST, entityLists, evidenceOf, pairsFor, whereFor, type Pair } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How many pairs one answer holds at most, and what `limit` may ask for. */
export const NAMED_MOST = 20;

/** One side of a pair as anybody may read it: what it is called, its list, and its number there (none for a name seen). */
export type NamedSide = { name: string; register: string; seq: number | null };

/** One pair as `namedTwice` answers it. `pair` is the handle a press names it by. */
export type NamedPair = {
  pair: string;
  kind: Pair['kind'];
  how: Pair['how'];
  a: NamedSide & { seq: number };
  b: NamedSide;
  evidence: string;
  score: number;
  can: boolean;
};

/** What `namedTwice` answers. */
export type NamedTwice = { pairs: NamedPair[] };

/** What `askNamedSame` answers: the question on Decide, filed now or already waiting. */
export type NamedAsked = { question: string };

/** The sentence a token's press is refused in, as `askFoldTwice` says it: folding is a person's own press. */
const PERSONS = 'Folding what is here twice changes many things at once, and only a person decides that, signed in. Open the list in the app.';

/** The handle of a pair, as `pairsFor` names one: eight hex characters. */
const HANDLE = /^[0-9a-f]{8}$/u;

/** A pair as this file holds it while it is read: the kernel's pair, both rows by id, and why it cannot be pressed. */
type Held = { pair: Pair; register: string; a: { id: string; seq: number }; b: { id: string; seq: number } | null; field?: string; why?: string };

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, scoped, readable, no, tail, clock } = deps;

  const rowOf = (id: string | undefined, register: string) =>
    id === undefined ? undefined : sql.one<{ seq: number | null }>('SELECT seq FROM entry WHERE id = ? AND register = ? AND deleted_at IS NULL', id, register);

  /** The field a list says a row was folded into, read off the record's lists as the kernel reads them. */
  const foldFieldOf = (register: string): string | undefined => {
    const list = entityLists(kernel.registers().values() as Parameters<typeof entityLists>[0]).find((l) => l.register === register);
    return list === undefined ? undefined : (list.fields as { merged_into?: string }).merged_into;
  };

  /** What a list calls one of its own, for a question: its `one`, or its name. */
  const oneOf = (register: string): string => {
    const decl = kernel.register(register) as { name?: unknown; one?: unknown } | undefined;
    return typeof decl?.one === 'string' && decl.one !== '' ? decl.one : String(decl?.name ?? register).toLowerCase();
  };
  const listName = (register: string): string => String((kernel.register(register) as { name?: unknown } | undefined)?.name ?? register);

  /** Every pair offered now, best first, with what each handle stands for. Nothing is filtered for a caller here. */
  const pairsOffered = (): Held[] => {
    const found = pairsFor(sql, clock.now(), PAIRS_MOST);
    const out: Held[] = [];
    for (const pair of found.pairs) {
      const [x, y] = [found.rows[pair.a.h], found.rows[pair.b.h]];
      if (x === undefined || y === undefined) continue;
      const a = rowOf(x.id, x.register);
      if (typeof a?.seq !== 'number') continue;
      const b = y.id === undefined ? null : rowOf(y.id, y.register);
      if (b !== null && typeof b?.seq !== 'number') continue;
      const field = foldFieldOf(x.register);
      const why =
        b === null
          ? `${pair.b.name} is a name that was seen, not one of the ${listName(x.register).toLowerCase()}, so there is nothing to fold. Add it, or leave it.`
          : field === undefined
            ? `${listName(x.register)} does not say what one is folded into, so two of them cannot be folded yet.`
            : undefined;
      out.push({
        pair,
        register: x.register,
        a: { id: x.id!, seq: a.seq },
        b: b === null ? null : { id: y.id!, seq: b.seq as number },
        ...(field === undefined ? {} : { field }),
        ...(why === undefined ? {} : { why }),
      });
    }
    return out;
  };

  /* SOMETHING A NARROWED GRANT LEAVES OUT IS NOT THERE FOR THIS CALLER, read as `matched` reads it: the row again by its
     own number under the grant's rule. A grant that is whole admits everything. */
  const admitted = (ctx: CallContext, register: string, seq: number): boolean => {
    const rule = whereFor(ctx.wheres, register);
    if (rule === undefined) return true;
    const found = kernel.list({ register, where: { field: 'seq', is: seq }, limit: 1 }, rule);
    return found.ok && found.value.rows.length > 0;
  };

  /** The pairs this caller may be told of: both lists readable, and both rows inside the grant. */
  const seenBy = (ctx: CallContext): Held[] =>
    pairsOffered().filter(
      (h) => readable(ctx, h.register) === null && admitted(ctx, h.register, h.a.seq) && (h.b === null || admitted(ctx, h.register, h.b.seq)),
    );

  const causeOf = (hash: string): string => `named-twice#${hash}`;

  /**
   * The question already open for a pair, with its list. A pair asked about is settled, so `pairsFor` no longer offers
   * it, and a second press is answered with this one.
   */
  const waitingFor = (hash: string): { id: string; register: string } | undefined => {
    const open = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE cause = ? AND status = 'open' LIMIT 1", causeOf(hash));
    if (open === undefined) return undefined;
    try {
      const register = (JSON.parse(open.body) as { register?: unknown }).register;
      return typeof register === 'string' ? { id: open.id, register } : undefined;
    } catch {
      return undefined;
    }
  };

  /** The register of the pair a press names, for its guard, or `undefined` when no pair of that handle is offered. */
  const registerOf = (args: { pair?: unknown } | undefined): string | undefined => {
    if (typeof args?.pair !== 'string' || !HANDLE.test(args.pair)) return undefined;
    const hash = args.pair;
    return waitingFor(hash)?.register ?? pairsOffered().find((h) => h.pair.hash === hash)?.register;
  };

  return {
    /**
     * `{ limit? }`: the organisations and projects that may be on the record twice, best first, `NAMED_MOST` at most,
     * each with its sentence and whether a press can fold it. READ+, and it changes nothing.
     */
    async namedTwice(args: { limit?: unknown } | undefined, ctx: CallContext): Promise<Result<NamedTwice>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const limit = args?.limit ?? NAMED_MOST;
      if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > NAMED_MOST)
        return no('VALUE_MALFORMED', `limit is a whole number from 1 to ${NAMED_MOST}.`, { at: 'limit' });
      const pairs = seenBy(ctx)
        .slice(0, limit)
        .map(
          (h): NamedPair => ({
            pair: h.pair.hash,
            kind: h.pair.kind,
            how: h.pair.how,
            a: { name: h.pair.a.name, register: h.register, seq: h.a.seq },
            b: { name: h.pair.b.name, register: h.register, seq: h.b?.seq ?? null },
            evidence: evidenceOf(h.pair),
            score: h.pair.score,
            can: h.why === undefined,
          }),
        );
      return { ok: true, value: { pairs } };
    },

    /**
     * `{ pair }`: one question on Decide, "Are A and B one organisation?", signed by the person who pressed. Accepting it
     * folds the second into the first in one batch, so one Undo puts them back. Answers `{ question }`, and the one
     * already waiting when it is pressed again. DATA, a person's only, and nothing is folded until it is answered.
     */
    async askNamedSame(args: { pair?: unknown } | undefined, ctx: CallContext): Promise<Result<NamedAsked>> {
      const stop = guard(ctx, 'write', registerOf(args));
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person') return no('NEEDS_BROWSER_SESSION', PERSONS, { at: 'principal' });
      const asked = args?.pair;
      if (typeof asked !== 'string' || !HANDLE.test(asked))
        return no('VALUE_MALFORMED', 'Say which pair: pair is the one the list of what may be here twice gave.', { at: 'pair' });
      /* PRESSED AGAIN, the question already waiting is the answer, and nothing is filed twice. */
      const waiting = waitingFor(asked);
      if (waiting !== undefined && readable(ctx, waiting.register) === null) return tail({ ok: true as const, value: { question: waiting.id } });
      const held = seenBy(ctx).find((h) => h.pair.hash === asked);
      if (held === undefined) return no('VALUE_MALFORMED', 'That pair is no longer offered. Read the list again.', { at: 'pair' });
      if (held.why !== undefined || held.b === null || held.field === undefined) return no('VALUE_MALFORMED', held.why ?? 'There is nothing to fold.', { at: 'pair' });

      /* THE ONE FOLDED IS READ NOW, at its version, so a change before the answer is the house conflict, never overwritten. */
      const folded = kernel.get(held.b.id);
      if (folded === null) return no('VALUE_MALFORMED', 'That pair is no longer offered. Read the list again.', { at: 'pair' });
      /* SIGNED BY THE PERSON WHO PRESSED, never by the record. One still open is answered as it is. */
      const filed = kernel.propose(
        {
          question: `Are ${held.pair.a.name} and ${held.pair.b.name} one ${oneOf(held.register)}?`,
          body_kind: 'rowset',
          body: {
            register: held.register,
            pair: held.pair.hash,
            rows: [{ at: kernel.nameOf(held.b.id), version: folded.version, patch: { [held.field]: kernel.nameOf(held.a.id) } }],
          },
          cause: causeOf(held.pair.hash),
          again: 'You asked again from the list.',
        },
        { actor: ctx.principal.id },
      );
      if (!filed.ok) return filed as Result<never>;
      return tail({ ok: true as const, value: { question: filed.value.id } });
    },
  };
}
