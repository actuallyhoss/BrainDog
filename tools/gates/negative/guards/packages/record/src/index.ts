/**
 * Cut down to the four method bodies this gate reads.
 *
 * THE SEEDED DEFECT IS `members`: routed ADMIN, guarded `guard(ctx, 'read')`. It is the real one,
 * kept verbatim, because a fixture that invents a shape proves the gate can find the shape it
 * invented. The other three are correct, so the count is one and the distinction is asserted.
 */

function api(kernel: Kernel) {
  const guard = (ctx: CallContext, need: Need, register?: string): Refusal | null => null;
  const scoped = (ctx: CallContext, need: Need): Refusal | null => null;
  const keychain = (ctx: CallContext): Refusal | null => null;
  const admin = (ctx: CallContext): Refusal | null => null;

  return {
    async boot(ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok({ registers: [] });
    },

    async list(args: { register: string }, ctx: CallContext) {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.list(args);
    },

    async listGrants(ctx: CallContext) {
      const stop = keychain(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.grants());
    },

    /** Everybody on it, with what they hold and where. A read: a colleague list is not a secret. */
    async members(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.members());
    },
  };
}
