/**
 * THE SEEDED DEFECT IS `triage`: routed DATA from routes/, guarded `admin(ctx)` here. `usedBy` beside it is correct, so a
 * count of one proves the gate reads this folder and tells the two apart.
 */
export function methods(deps: RecordDeps) {
  const { scoped, admin } = deps;
  return {
    async usedBy(args: { spoken: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok({ runs: [] });
    },

    async triage(args: { arrival: string }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return ok(null);
    },
  };
}
