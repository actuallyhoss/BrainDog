/**
 * Cut down to three readers of one row each.
 *
 * THE SEEDED DEFECT IS `peekRow`: it answers whatever `kernel.get` finds, with no sight check and no reason, which is
 * the shape every G2 to G5 gap had (`briefing`'s `inScope`, `backlinks`, `metric`, a search's count). `seenRow` asks
 * the sight module and `ownedRow` the owner's gate, so the count is one and the distinction is asserted.
 */

export function api(kernel: Kernel, sight: Sight) {
  const admin = (ctx: CallContext): Refusal | null => null;

  return {
    async seenRow(args: { id: string }, ctx: CallContext) {
      const row = kernel.get(args.id);
      return row !== null && sight.admits(ctx, row) ? row : null;
    },

    async ownedRow(args: { id: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return null;
      return kernel.get(args.id);
    },

    async peekRow(args: { id: string }, ctx: CallContext) {
      return kernel.get(args.id);
    },
  };
}
