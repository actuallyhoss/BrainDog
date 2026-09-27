/** THE SEEDED DEFECT IS `boot`, written here and in index.ts: the record's spread keeps one of the two. */
export function methods(deps: RecordDeps) {
  const { scoped } = deps;
  return {
    async boot(ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok({ registers: [] });
    },
  };
}
