/**
 * The record's time zone, the record's half: `setZone`, ADMIN (MC2).
 *
 * THE OWNER MOVES IT AND EVERY MEMBER COUNTS "TODAY" IN IT. The zone is the record's, not a person's: every late bill,
 * every due day and every summary's hour is counted in it, so it is changed only by an owner in a browser, in
 * Settings > Notifications beside the quiet hours it already says it reads them in. Everybody reads it in `boot`'s
 * `zone`, so no reader is added here.
 *
 * WHAT IS KEPT AND HOW IT IS LOGGED IS THE KERNEL'S (`kernel/src/api/zone.ts`): `record.tz`, and an `edit` event.
 */

import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Zone = ReturnType<Kernel['setZone']>;

export function methods(deps: RecordDeps) {
  const { kernel, admin, tail } = deps;

  /** Who a change is signed by: the person, or the person a token was minted for (`actorOf` in `index.ts`). */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  return {
    /** Set the record's time zone: `{ tz: 'Africa/Cairo' }`. ADMIN, an owner in a browser, as every record setting is. */
    async setZone(args: { tz?: unknown } | undefined, ctx: CallContext): Promise<Zone> {
      const stop = admin(ctx, 'change the time zone');
      if (stop) return { ok: false, refusal: stop };
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      return tail(kernel.setZone(args ?? {}, actorOf(ctx)));
    },
  };
}
