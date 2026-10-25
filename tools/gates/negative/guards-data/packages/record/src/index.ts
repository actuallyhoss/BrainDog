/**
 * Cut down to the six method bodies this gate reads.
 *
 * THE SEEDED DEFECT IS `create`: routed DATA, guarded `admin(ctx)`. It is the shape the real defect
 * had, one direction along. `members` was routed ADMIN and guarded `guard()`, and the reason nobody
 * saw it is that thirteen neighbours in the same file called `admin` and one did not; a body copied
 * the other way puts `admin` on the record's only write path, where it refuses every token and takes
 * the eight MCP tools with it. That one is loud in use and silent in review, because a ceiling that
 * is too HIGH reads as care.
 *
 * THE OTHER FIVE ARE CORRECT, AND FOUR OF THEM ARE THE POINT. `search` is DATA and register-blind,
 * so it calls `scoped`; `list` is DATA and names a register, so it calls `guard`; `boot` is READ+
 * and calls `scoped`; `version` is READ+ and calls `guard`. Both groups therefore appear here under
 * both guards, which is what makes a count of one an assertion that the two share one list rather
 * than an assertion that the gate went red about something.
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

    async version(ctx: CallContext) {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.version());
    },

    /** Across every register the caller can see, which is why it is scoped and names none. */
    async search(args: { q: string }, ctx: CallContext) {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.search(args);
    },

    async list(args: { register: string }, ctx: CallContext) {
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.list(args);
    },

    /** Add a row. The record allocates its number. */
    async create(args: { register: string; body: unknown }, ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return kernel.create(args);
    },

    async members(ctx: CallContext) {
      const stop = admin(ctx);
      if (stop) return { ok: false as const, refusal: stop };
      return ok(kernel.members());
    },
  };
}
