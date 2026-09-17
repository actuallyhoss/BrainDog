/** Cut down to the one method body this gate reads, which is correct: the seeded defect is in `report.ts`. */

function api(kernel: Kernel) {
  const guard = (ctx: CallContext, need: Need, register?: string): Refusal | null => null;
  const reportBudget = (token: string, rows: number): number | null => null;

  return {
    async report(args: unknown, ctx: CallContext) {
      const stop = guard(ctx, 'append', 'points');
      if (stop) return { ok: false as const, refusal: stop };
      if (reportBudget('t', 1) !== null) return { ok: false as const };
      return kernel.create('points', args);
    },
  };
}
