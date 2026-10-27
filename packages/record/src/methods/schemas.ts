/**
 * Many lists' declarations in one read: `schemas` (READ+), what `schema` answers for each list asked, in one round trip.
 *
 * WHY IT IS HERE. Today needs every list's declaration before it can ask its page (its week and its people are found by
 * what the lists declare, never by their names), and a tab asked `schema` once a list: twenty-five asks on the seed,
 * which a browser sends six at a time, so the first open of Today waited five round trips before it could ask its page
 * (1.6 s at 140 ms a trip). One read answers them all.
 *
 * EACH LIST IS HELD EXACTLY AS `schema` HOLDS IT. The caller is asked whether they may read at all first (`scoped`), and
 * then each list by itself through the same `guard(ctx, 'read', list)` that `schema` asks, so a list the caller may not
 * read is answered with that refusal and nothing of it, and one that is not there says so. Nothing here is wider than
 * asking `schema` once a list: no list is named that was not asked for, and a refusal carries no list of the others.
 *
 * THE INSTALLED KINDS ONCE. `schema` carries every installed pack kind beside each list (`blocks`), the same for every
 * list; here they are said once, and the client puts them beside each list as `schema` would have.
 *
 * AT MOST `SCHEMAS_MOST` LISTS A CALL, each named once. OR EVERY LIST THE CALLER READS (`every: true`), which are the
 * lists `boot` names them, by the same `guard(ctx, 'read', list)`: asked beside `boot` as a screen first opens, so
 * nothing waits for `boot` to say which lists there are before their declarations are asked. A list they may not read
 * is left out unsaid there, as `boot` leaves it out.
 */

import type { Refusal, Result } from '@braindog/ports';
import type { KindSpec } from 'braindog-render';
import type { RegisterDecl } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The most lists one call may name. */
export const SCHEMAS_MOST = 100;

/** An installed pack kind as `schema` carries it. */
export type InstalledKind = KindSpec & { title: string; purpose: string };

/** What `schemas` answers: each list asked, by its id, as `schema` answers it, or the refusal `schema` would give. */
export type SchemasAnswer = {
  lists: Record<string, RegisterDecl>;
  refused: Record<string, Refusal>;
  blocks: Record<string, InstalledKind>;
};

export function methods(deps: RecordDeps) {
  const { kernel, guard, scoped, no } = deps;
  return {
    async schemas(args: { registers?: unknown; every?: unknown }, ctx: CallContext): Promise<Result<SchemasAnswer>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* EVERY LIST THE CALLER READS, the lists `boot` names them and by the same check, so it is asked beside `boot` and
         not after it. A list they may not read is left out unsaid, as `boot` leaves it out. */
      if (args?.every !== undefined) {
        if (args.every !== true) return no('VALUE_MALFORMED', 'Ask for every list with true, or name the lists.', { at: 'every' });
        if (args.registers !== undefined) return no('VALUE_MALFORMED', 'Ask for every list, or name the lists, and not both.', { at: 'every' });
        const lists: Record<string, RegisterDecl> = {};
        for (const [id, decl] of kernel.registers()) if (guard(ctx, 'read', id) === null) lists[id] = decl;
        return { ok: true, value: { lists, refused: {}, blocks: Object.keys(lists).length > 0 ? kinds() : {} } };
      }
      const asked = args?.registers;
      if (!Array.isArray(asked) || asked.length === 0) return no('REQUIRED_MISSING', 'Name the lists to describe, as a list.', { at: 'registers' });
      if (asked.some((r) => typeof r !== 'string' || r === '')) return no('VALUE_MALFORMED', 'Name each list as text.', { at: 'registers' });
      const ids = [...new Set(asked as string[])];
      if (ids.length > SCHEMAS_MOST) return no('OUT_OF_BOUNDS', `Name at most ${SCHEMAS_MOST} lists at once.`, { at: 'registers' });
      const lists: Record<string, RegisterDecl> = {};
      const refused: Record<string, Refusal> = {};
      for (const id of ids) {
        const held = guard(ctx, 'read', id);
        if (held) {
          refused[id] = held;
          continue;
        }
        const decl = kernel.register(id);
        if (!decl) {
          refused[id] = { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${id}.`, at: 'registers' };
          continue;
        }
        lists[id] = decl;
      }
      /* THE KINDS ONLY FOR A CALLER ANSWERED AT LEAST ONE LIST, as `schema` carries them only beside a list. */
      return { ok: true, value: { lists, refused, blocks: Object.keys(lists).length > 0 ? kinds() : {} } };
    },
  };

  /** Every installed pack kind, as `schema` carries them beside a list. */
  function kinds(): Record<string, InstalledKind> {
    const blocks: Record<string, InstalledKind> = {};
    for (const d of kernel.declarations()) {
      if (!d.id.startsWith('block.')) continue;
      const { block, note, ...rest } = JSON.parse(d.body) as Record<string, unknown>;
      blocks[d.id] = rest as InstalledKind;
    }
    return blocks;
  }
}
