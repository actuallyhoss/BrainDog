/**
 * Cut down to the one method body this gate reads.
 *
 * THE SEEDED DEFECT: `report` is guarded as its group says and spends no budget, which is the method as it was before
 * September 17th, when a report key could send a hundred rows a call as often as it liked.
 */

function api(kernel: Kernel) {
  const guard = (ctx: CallContext, need: Need, register?: string): Refusal | null => null;

  return {
    async report(args: unknown, ctx: CallContext) {
      const stop = guard(ctx, 'append', 'points');
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.create('points', args);
    },
  };
}
