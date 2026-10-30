/**
 * Every import made into the record, and the owner's word on each ("Untrusted text (mail, bank texts,
 * imports, other people's rows, add-on descriptions) drops the run to Ask").
 *
 * WHAT AN IMPORT IS AND WHAT IT BROUGHT IN IS THE LADDER'S (`ladder.ts`, `importsFound`): a run `braindog import` wrote
 * as, told apart by its client id as the kernel's `makerOf` tells it, and the rows its run created, by list.
 *
 * `imports`, READ+, THE OWNER'S AND THE WHOLE RECORD'S, held exactly as `trust` is: it names every list an import wrote
 * into, so a caller held to part of the record would learn of the rest, and a colleague would learn what the owner
 * carried over from another tool. Everyone else is refused in the same two sentences `trust` refuses in.
 *
 * `importAdopt`, ADMIN, THE OWNER'S PRESS: "It is mine", or "Treat it as outside text". A person in a browser, never a
 * token, as `trustTakeBack` is, since an agent that could vouch for what it reads would be marked by nothing. It files
 * no question and moves no rung: the owner says it once, by his own press, and it is kept.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { ladder, type FoundImport } from '../ladder.ts';
import type { RecordDeps } from './index.ts';

export type { FoundImport };
export type Imports = { imports: FoundImport[] };

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, admin, no, clock } = deps;
  const read = ladder({ sql, kernel, now: () => clock.now() });

  /** The owner over the whole record, as `trust.ts` holds it: a person at owner level, or such a person's grant, and every list. */
  const whole = (ctx: CallContext): boolean => {
    const p = ctx.principal;
    if (p.kind === 'system') return true;
    if (p.kind !== 'person' && p.kind !== 'token') return false;
    return p.level === 'owner' && (ctx.registers === undefined || ctx.registers === '*');
  };

  /** Whether the caller is held to part of the record, so the refusal says the fix that is theirs. */
  const part = (ctx: CallContext): boolean => !(ctx.registers === undefined || ctx.registers === '*');

  return {
    /** Every import made into this record, newest first: its run, when, what it brought into each list, and what the owner said of it. READ+, the owner's. */
    async imports(_args: unknown, ctx: CallContext): Promise<Result<Imports>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (!whole(ctx)) {
        return part(ctx)
          ? no('FORBIDDEN', 'What was imported is about all of this BrainDog, and this caller is held to part of it.', { at: 'principal' })
          : no('FORBIDDEN', 'What was imported is for the owner of this BrainDog to read, so nothing was read.', { at: 'principal' });
      }
      return { ok: true, value: { imports: read.importsFound() } };
    },

    /**
     * Say one import is the owner's own (`yes: true`) or outside text (`yes: false`). Answers that import as `imports`
     * says it after. ADMIN, the owner in a browser over the whole record. Pressing it again says it again.
     */
    async importAdopt(args: { run?: unknown; yes?: unknown } | undefined, ctx: CallContext): Promise<Result<FoundImport>> {
      const stop = admin(ctx, 'say whether an import is your own');
      if (stop) return { ok: false, refusal: stop };
      if (part(ctx)) return no('FORBIDDEN', 'What was imported is about all of this BrainDog, and this caller is held to part of it.', { at: 'principal' });
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = Object.keys(said).find((k) => k !== 'run' && k !== 'yes');
      if (extra !== undefined) return { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: `${extra} is not something this call takes. It takes run and yes.`, at: extra, allowed: ['run', 'yes'] } };
      if (typeof said.run !== 'string' || said.run.trim() === '') return no('REQUIRED_MISSING', 'Say which import, by the run Settings shows for it, such as S12.', { at: 'run' });
      if (typeof said.yes !== 'boolean') return no('REQUIRED_MISSING', 'yes is true when the import is your own, and false to treat it as outside text.', { at: 'yes' });
      const run = said.run.trim().toUpperCase();
      if (!read.importsFound().some((i) => i.run === run) && !read.importActors().includes(run)) return no('VALUE_MALFORMED', `No import here is ${said.run.trim()}. Nothing was changed.`, { at: 'run' });
      read.adopt(run, said.yes, ctx.principal.id);
      const after = read.importsFound().find((i) => i.run === run) ?? { run, at: '', lists: [], rows: 0, adopted: said.yes };
      return { ok: true, value: after };
    },
  };
}
