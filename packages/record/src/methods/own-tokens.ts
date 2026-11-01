/**
 * A colleague's own agent: `createOwnToken`, `ownTokens` and `revokeOwnToken`, DATA (`docs/20-COLLABORATION.md` §2,
 * tier 0).
 *
 * WHY A MEMBER MINTS AT ALL. `createToken` is the owner's, and an "Adds only" colleague cannot even open the app,
 * because every screen reads first; an agent adding rows through MCP is the one way in their level was made for. So any
 * person on the record may hold tokens of their own, and only of their own.
 *
 * CAPPED BY THEIR OWN LEVELS AT EVERY CALL, NOT AT MINT. A token writes as the person who minted it and the record asks
 * `token.scope ∩ their levels` on each call (`allows` in `index.ts`), so a level taken away tomorrow is taken from their
 * agent in the same instant, and a Reads colleague's write token reads. The scope asked for here is a ceiling, never a
 * grant.
 *
 * A PERSON, IN A BROWSER, AND NEVER A TOKEN. A token minting tokens is a credential that outlives its own revocation,
 * and a request carrying no credential (a self-host in open mode) is refused for `createToken`'s reason: a bearer works
 * from anywhere. Minting also needs a sign-in proved in the last fifteen minutes (`FRESH`); listing and revoking do not,
 * because refusing a revoke to a stale session would keep an agent running that its person is trying to stop.
 */

import type { Minted, Scope, TokenNarrow, TokenRow } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { FRESH, type CallContext } from '../index.ts';
import { JOB_PREFIX, REPORT_PREFIX } from '../report.ts';
import type { RecordDeps } from './index.ts';

/**
 * How many live tokens one person may hold of their own. A ceiling on what a colleague can mint, because each is a
 * bearer that works from anywhere until it ends, and a list longer than this is one nobody reviews.
 */
export const OWN_TOKENS_MOST = 20;

/** A token's name, as the owner's list and the member's own show it. */
export const OWN_TOKEN_NAME_MOST = 80;

/**
 * What a member may ask for. No `reach`: what a token opens beyond its scope is the owner's to hand out. `narrow` holds
 * the key to less than its person (lists, a project, a condition, rows, or one of their own shares), within their reach.
 */
export type CreateOwnTokenArgs = { name?: string; scope?: Scope; days?: number; narrow?: TokenNarrow };

/**
 * Why a key's narrowing names something outside the minter's own reach, or `null` (sharing plan 2.9). Its shape is the
 * kernel's to check (`createToken`); this is the part only the record knows: each list it names is one the minter
 * reads here, and a share it names is one of the minter's own, live. A narrowing is ANDed into what its person sees and
 * so can only take away, but a key narrowed to a list its person cannot see is a key that silently reaches nothing.
 */
export function narrowBeyond(
  deps: Pick<RecordDeps, 'kernel' | 'sql' | 'readable'>,
  ctx: CallContext,
  person: string,
  narrow: unknown,
): Refusal | null {
  if (narrow === undefined) return null;
  if (narrow === null || typeof narrow !== 'object' || Array.isArray(narrow))
    return { code: 'VALUE_MALFORMED', fix: 'A key is narrowed to lists, a project, a condition, rows or a share.', at: 'narrow' };
  const n = narrow as Record<string, unknown>;
  if (typeof n.share === 'string') {
    const held = deps.sql.one(
      `SELECT 1 AS hit FROM share WHERE id = ? AND revoked_at IS NULL AND effect = 'allow'
         AND ((who_kind = 'person' AND who = ?) OR (who_kind = 'group' AND who IN (SELECT group_id FROM share_group_member WHERE person_id = ?)))`,
      n.share,
      person,
      person,
    );
    return held ? null : { code: 'OUT_OF_BOUNDS', fix: `${n.share} is not a share you hold, so a key cannot be narrowed to it.`, at: 'narrow.share' };
  }
  const lists = [...(Array.isArray(n.lists) ? n.lists : []), ...(n.list === undefined ? [] : [n.list])];
  for (const list of lists) {
    if (typeof list !== 'string') continue;
    if (!deps.kernel.register(list)) return { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${list} to narrow a key to.`, at: 'narrow' };
    const stop = deps.readable(ctx, list);
    if (stop) return { code: stop.code, fix: `You cannot read ${list}, so a key of yours cannot be narrowed to it.`, at: 'narrow' };
  }
  return null;
}

const SCOPES: readonly Scope[] = ['read', 'propose', 'write'];

export function methods(deps: RecordDeps) {
  const { kernel, scoped, no, tail, clock } = deps;

  /**
   * The person asking, or why they may not. Every one of the three asks this after its guard: the guard says the caller
   * may do something on the record, and this says the caller is a person with a credential of their own.
   */
  const personOf = (ctx: CallContext): { id: string } | Refusal => {
    const p = ctx.principal;
    if (p.kind !== 'person' || ctx.operation !== undefined)
      return { code: 'NEEDS_BROWSER_SESSION', fix: 'Your own agent keys are made and listed from the app, signed in as you. Nothing was changed.', at: 'principal' };
    if (ctx.credentialed === false)
      return {
        code: 'NEEDS_BROWSER_SESSION',
        fix: 'A key works from anywhere, so making one needs a credential. Start this BrainDog with BRAINDOG_SERVER_KEY and send that key, or open this from the app.',
        at: 'principal',
      };
    return { id: p.id };
  };

  /** Whether a token still counts against the ceiling: not revoked and not past its end. */
  const live = (t: TokenRow, nowIso: string): boolean =>
    t.revoked_at === null && t.ended_by === undefined && (t.expires_at === null || t.expires_at > nowIso);

  /**
   * This person's tokens, newest first, never a hash or a bearer.
   *
   * WITHOUT THE OPERATOR'S CUT-OFF, because a method file is not handed it (`RecordDeps`): a token the cut-off ended is
   * refused at every call all the same (`verifyToken`), and only the owner's list says why.
   */
  const mine = (person: string): TokenRow[] => kernel.listTokens().filter((t) => t.person_id === person);

  return {
    /**
     * Mint a token for the caller's own agent, shown once. DATA: any person on the record, whatever their level, since
     * the token can never do more than they can.
     */
    async createOwnToken(args: CreateOwnTokenArgs, ctx: CallContext): Promise<Result<Minted>> {
      /* READ OR PROPOSE, EITHER ONE: the ladder's two lowest rungs, and "Adds only" reaches the second and not the first.
         Somebody holding only named lists passes when any grant reaches one. */
      const stop = scoped(ctx, 'read') && scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const who = personOf(ctx);
      if ('code' in who) return { ok: false, refusal: who };
      if (ctx.provedAt !== undefined && clock.now() - ctx.provedAt > FRESH)
        return { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to make a key. Nothing was made.', at: 'proof' } };

      const scope = args?.scope ?? 'write';
      if (!SCOPES.includes(scope))
        return no('ENUM_VALUE_UNKNOWN', `${String(scope)} is not a scope a key can hold.`, { at: 'scope', allowed: SCOPES });
      const name = typeof args?.name === 'string' ? args.name.trim() : '';
      if (args?.name !== undefined && typeof args.name !== 'string')
        return no('VALUE_MALFORMED', 'A key is named in text.', { at: 'name' });
      if (name.length > OWN_TOKEN_NAME_MOST)
        return no('OUT_OF_BOUNDS', `A key's name is at most ${OWN_TOKEN_NAME_MOST} characters.`, { at: 'name' });
      /* A REPORT KEY IS MADE BY `createReportKey` ONLY, and its label is its binding (`report.ts`). */
      if (name.startsWith(REPORT_PREFIX))
        return no('VALUE_MALFORMED', `A name that begins ${REPORT_PREFIX} belongs to a report key. Choose another name.`, { at: 'name' });
      /* NOR A JOB'S BEARER (`claimJob`), whose label is its job and which the plan's count and the agents list pass over. */
      if (name.startsWith(JOB_PREFIX))
        return no('VALUE_MALFORMED', `A name that begins ${JOB_PREFIX} belongs to a job's own key. Choose another name.`, { at: 'name' });

      const beyond = narrowBeyond(deps, ctx, who.id, args?.narrow);
      if (beyond) return { ok: false, refusal: beyond };

      const nowIso = new Date(clock.now()).toISOString();
      if (mine(who.id).filter((t) => live(t, nowIso)).length >= OWN_TOKENS_MOST)
        return no('OUT_OF_BOUNDS', `You hold ${OWN_TOKENS_MOST} working keys already. Revoke one you no longer use, then make this one.`, { at: 'scope' });

      /* THE ARGUMENTS ARE BUILT HERE, NEVER PASSED THROUGH, so no `reach` a caller slipped in reaches the kernel. */
      return tail(
        await kernel.createToken(who.id, {
          scope,
          ...(name === '' ? {} : { label: name }),
          ...(args?.days === undefined ? {} : { days: args.days }),
          ...(args?.narrow === undefined ? {} : { narrow: args.narrow }),
        }),
      );
    },

    /** The caller's own tokens, newest first, revoked ones included so a list can say what stopped. DATA. */
    async ownTokens(_args: unknown, ctx: CallContext): Promise<Result<TokenRow[]>> {
      const stop = scoped(ctx, 'read') && scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const who = personOf(ctx);
      if ('code' in who) return { ok: false, refusal: who };
      return ok(mine(who.id));
    },

    /**
     * Revoke one of the caller's own tokens. DATA. Another person's token is answered as one that is not there, so the
     * refusal says nothing about whose it is; the owner revokes any with `revokeToken`.
     */
    async revokeOwnToken(args: { id: string }, ctx: CallContext): Promise<Result<TokenRow>> {
      const stop = scoped(ctx, 'read') && scoped(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const who = personOf(ctx);
      if ('code' in who) return { ok: false, refusal: who };
      if (typeof args?.id !== 'string' || args.id === '') return no('REQUIRED_MISSING', 'Which key?', { at: 'id' });
      if (!mine(who.id).some((t) => t.id === args.id)) return no('OUT_OF_BOUNDS', `You hold no key called ${args.id}.`, { at: 'id' });
      return tail(kernel.revokeToken(who.id, args.id));
    },
  };
}
