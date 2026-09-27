/** Cut down to the one method body in this file; the other two are under methods/. */
function api(kernel: Kernel) {
  const scoped = (ctx: CallContext, need: Need): Refusal | null => null;

  return {
    async boot(ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok({ registers: [] });
    },
  };
}
