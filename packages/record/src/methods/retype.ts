/**
 * A field retyped or narrowed over the rows its list holds, the record's half: `previewRetype`, READ+, and
 * `retypeField`, DATA (`21 §5`).
 *
 * THE PREVIEW WRITES NOTHING AND THE PRESS FILES ONE CHANGE. `previewRetype` answers what `retypePlan` reads over the
 * live rows: how many convert, each one that does not with the answers it may take, and a few converted values.
 * `retypeField` files the same ask as one `change` body, `{ retype: ... }` or `{ narrow: ... }`, and only once every
 * failing row has its answer, so the owner is never asked to accept a change that would leave a row behind.
 *
 * AN OWNER'S LANDS AT ONCE AND ANYBODY ELSE'S WAITS ON DECIDE: removing, retyping or narrowing a field still waits for
 * his press in Decide. The group and guard follow `propose`, the nearest governed write: DATA, and a caller who may
 * propose on the list may file one. When the caller is an owner in a browser the record answers the question in the
 * next call with the owner's own accept, as `field-write.ts` does for an addition, so the change is in the queue's
 * history either way and History reads one decision behind it.
 *
 * LANDING IS `landRetype`, EXPORTED, because an owner's press in Decide lands the same way: the kernel's `decide` hands
 * back `retype` in place of `install` (`govern.ts`), and the record's `decide` calls this with it. Landing stages the
 * list's next version through the pack path's staged install and writes it and every answered row in one transaction
 * (`packages/kernel/src/api/retype.ts`); anything that will not land reopens the question with the sentence why.
 */

import type { Result } from '@braindog/ports';
import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Ask = Parameters<Kernel['retypePlan']>[0];
type Plan = ReturnType<Kernel['retypePlan']>;
type Landed = ReturnType<Kernel['retypeLand']>;

/** What `retypeField` answers: landed now, with the decision behind it, or filed and waiting on Decide. */
export type Retyped =
  | { from: 'landed'; suggestion: string; decision: string | null; wrote: number; version: number }
  | { from: 'filed'; suggestion: string };

const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** The ask a call or a filed body carries, or `null` when there is none to read. */
function askIn(args: unknown): Ask | null {
  if (!isMap(args) || typeof args.register !== 'string' || typeof args.field !== 'string' || !isMap(args.as)) return null;
  return {
    register: args.register,
    field: args.field,
    as: args.as as Ask['as'],
    ...(isMap(args.answers) ? { answers: args.answers as NonNullable<Ask['answers']> } : {}),
  };
}

/**
 * Land an accepted retype: the list's next version and every answered row, or nothing and the question reopened.
 *
 * FOR `retypeField` AND FOR THE RECORD'S `decide`, which hands this the `retype` the kernel's `decide` answered with. The
 * version the press merged onto is asked again here and inside the landing's own transaction, so a change that reached
 * the list in between is a question put back rather than a body that erases it.
 */
export async function landRetype(
  kernel: Kernel,
  retype: { to: Record<string, unknown>; expect?: { id: string; version: number } },
  actor: string,
  suggestion: string,
): Promise<Landed> {
  /* ONLY EVER HANDED A FAILURE, and it answers as the landing would, so every refusal below reads as one. */
  const back = (out: Result<unknown>): Landed => {
    kernel.reopen(suggestion, 'refusal' in out ? out.refusal.fix : 'The list changed after this was accepted. Look at the conversion again.');
    return out as Landed;
  };
  const ask = askIn(retype.to.retype ?? retype.to.narrow);
  if (ask === null) return back({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'This change carries no field to convert.', at: 'body.to' } });
  const landing = kernel.retypeLanding(ask);
  if (!landing.ok) return back(landing as Landed);
  if (retype.expect !== undefined && retype.expect.version !== landing.value.version)
    return back({
      ok: false,
      refusal: { code: 'PLAN_STALE', fix: `${ask.register} changed after this was accepted and is at version ${String(landing.value.version)} now. Look at the conversion again.`, at: 'register' },
    });
  const staged = await kernel.stageInstall([landing.value.decl as never]);
  if (!staged.ok) return back(staged as Landed);
  const landed = kernel.retypeLand(landing.value, staged.value, { actor, suggestion });
  return landed.ok ? landed : back(landed);
}

export function methods(deps: RecordDeps) {
  const { kernel, guard, admin, tail } = deps;

  /** Who a change is signed by: the person, or the person a token was minted for (`actorOf` in `index.ts`). */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  return {
    /**
     * What changing one field would do over its list's live rows: `{ register, field, as, answers? }`, answered with the
     * rows that convert, each that does not and the answers it may take, and a sample. READ+, on the list itself, since
     * the answer names its rows. It writes nothing.
     */
    async previewRetype(args: unknown, ctx: CallContext): Promise<Plan> {
      const stop = guard(ctx, 'read', isMap(args) && typeof args.register === 'string' ? args.register : undefined);
      if (stop) return { ok: false, refusal: stop };
      const ask = askIn(args);
      if (ask === null)
        return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'Say the list, the field and what it becomes: {"register":"<list>","field":"<field>","as":{"type":"<type>"}}.', at: 'as' } };
      /* THE PLAN READS EVERY LIVE ROW, so it is answered only to somebody shown all of the list: a member held to some
         rows, kept off a field, or kept from a colleague's private rows was handed their titles and values in `sample`. */
      const owner = ctx.principal.kind === 'person' && ctx.principal.level === 'owner';
      if (!owner && (kernel.scope(ctx, ask.register) !== undefined || (ctx.hides?.[ask.register]?.length ?? 0) > 0))
        return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can see only part of this list, so only an owner can see what changing this field would do.', at: 'register' } };
      return kernel.retypePlan(ask);
    },

    /**
     * File one field's retype or narrowing, `{ register, field, as, answers, question? }`, once every failing row has its
     * answer; land it at once when the caller is an owner in a browser, and leave it on Decide for anybody else. DATA,
     * held to the list as `propose` holds a rowset to its list.
     */
    async retypeField(args: unknown, ctx: CallContext): Promise<Result<Retyped>> {
      const stop = guard(ctx, 'propose', isMap(args) && typeof args.register === 'string' ? args.register : undefined);
      if (stop) return { ok: false, refusal: stop };
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const ask = askIn(args);
      if (ask === null)
        return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'Say the list, the field and what it becomes: {"register":"<list>","field":"<field>","as":{"type":"<type>"}}.', at: 'as' } };

      /* THE SAME ONE WHO MAY SEE THE PREVIEW (`previewRetype`). The answer here counts the rows that do not convert, so a
         member who could only add, or was held to some rows, told a value's existence by guessing it in `as.values`. */
      const whole = ctx.principal.kind === 'person' && ctx.principal.level === 'owner';
      if (!whole && (deps.readable(ctx, ask.register) !== null || kernel.scope(ctx, ask.register) !== undefined || (ctx.hides?.[ask.register]?.length ?? 0) > 0))
        return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can see only part of this list, so only an owner can change this field.', at: 'register' } };

      /* EVERY ROW ANSWERED AND THE LIST LINTED BEFORE ANYTHING IS FILED. The kernel files a retype without `review`,
         which would count the rows the way the install does, so the lint the install runs is asked here instead. */
      const landing = kernel.retypeLanding(ask);
      if (!landing.ok) return landing as Result<never>;
      const lint = kernel.lint([landing.value.decl as never]);
      if (lint) return { ok: false, refusal: lint };

      const plan = kernel.retypePlan(ask);
      const op = plan.ok ? plan.value.op : 'retype';
      const said = isMap(args) && typeof args.question === 'string' && args.question.trim() !== '' ? args.question.trim().slice(0, 280) : null;
      const question =
        said ?? (plan.ok && op === 'retype' ? `Change ${ask.field} on ${ask.register} from ${plan.value.from} to ${plan.value.to}?` : `Change what ${ask.field} on ${ask.register} takes?`);
      const actor = actorOf(ctx);
      const filed = kernel.propose(
        { question, body_kind: 'change', body: { declaration_id: `register.${ask.register}`, to: { [op]: ask } } },
        actor,
      );
      if (!filed.ok) return filed as Result<never>;
      const suggestion = filed.value.id;

      /* ONLY AN OWNER IN A BROWSER ANSWERS HIS OWN, and never a token: a retype rewrites rows everybody reads. */
      if (admin(ctx, 'change a field over its rows') !== null) return tail({ ok: true, value: { from: 'filed', suggestion } } as Result<Retyped>);
      const decided = kernel.decide(suggestion, { decide: { option: 'accept', reason: landing.value.said } }, actor);
      if (!decided.ok) return tail(decided as Result<never>);
      const retype = decided.value.retype;
      if (retype === undefined) return tail({ ok: true, value: { from: 'filed', suggestion } } as Result<Retyped>);
      const landed = await landRetype(kernel, retype, actor, suggestion);
      if (!landed.ok) return tail(landed as Result<never>);
      return tail({
        ok: true,
        value: { from: 'landed', suggestion, decision: decided.value.decision, wrote: landed.value.wrote, version: landed.value.version },
      } as Result<Retyped>);
    },
  };
}
