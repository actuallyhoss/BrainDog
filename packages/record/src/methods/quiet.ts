/**
 * The record's quiet hours, the record's half: `quietHours`, READ+, and `setQuietHours`, ADMIN (`09 §5` rule 3,
 * `loop/finish/contracts.md` §12.1, decisions C74).
 *
 * THE OWNER CHANGES THE WINDOW AND EVERY MEMBER READS IT. The window is the record's, not a person's: the digest is one
 * schedule row for the whole record, so whoever it holds back, it holds back for everybody, and a member who can see
 * when their summary will arrive is told the truth about it without being able to move it. Settings > Notifications
 * draws both, the controls for an owner and the sentence alone for anybody else.
 *
 * WHAT IS KEPT AND HOW IT IS LOGGED IS THE KERNEL'S (`kernel/src/api/quiet.ts`): one column, `record.quiet`, and an
 * `edit` event on the record for every change.
 */

import type { Kernel } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Quiet = ReturnType<Kernel['quietHours']>;

export function methods(deps: RecordDeps) {
  const { kernel, admin, scoped, tail } = deps;

  /** Who a change is signed by: the person, or the person a token was minted for (`actorOf` in `index.ts`). */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  return {
    /** The record's quiet hours: what the owner set (or `null` for the default), the window that applies and its zone. READ+. */
    async quietHours(_args: unknown, ctx: CallContext): Promise<Quiet> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      return kernel.quietHours();
    },

    /**
     * Set the record's quiet hours: `{ quiet: { from: 'HH:MM', to: 'HH:MM' } }`, `{ quiet: 'off' }`, or
     * `{ quiet: null }` to put 22:00 to 08:00 back. ADMIN, an owner in a browser, as every record setting is.
     */
    async setQuietHours(args: { quiet?: unknown } | undefined, ctx: CallContext): Promise<Quiet> {
      const stop = admin(ctx, 'change the quiet hours');
      if (stop) return { ok: false, refusal: stop };
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      return tail(kernel.setQuietHours(args ?? {}, actorOf(ctx)));
    },
  };
}
