/**
 * Every name on the record, in one read: `names` (READ+), which the search field keeps on the device so a name typed
 * is on screen before anything is asked (find1104, 4 Nov).
 *
 * WHY. A search that goes to the record waits its turn on the record's one thread. On his record on 3 and 4 Nov the
 * answer took 60 to 100 ms when the thread was free and 5 to 8 s when it was not, and nothing a device asks can tell
 * which. What the device holds answers in a millisecond whichever it is, and the record's own answer still comes behind it.
 *
 * ONLY FOR A CALLER WHO READS EVERY LIST, WHOLE. Anybody else gets `whole: false` and no rows, and searches the record
 * as before: a grant's `where`, a hidden field, a hidden amount and a private row are all things this read would have
 * to answer one row at a time, and that is what it is here to avoid. The owner's private rows are his own to see, and
 * somebody else's kept private are left out in the query, as a search leaves them out.
 *
 * A TITLE, A DAY AND AN AMOUNT, AND NOTHING ELSE: what a search hit already says. Never a row's other fields.
 *
 * AT MOST `NAMES_PER_LIST` OF A LIST, the ones changed last, so 2,842 readings do not weigh more than every other row
 * on the record together. Older rows of such a list are still found by the record's own search.
 */

import { ok, type Result } from '@braindog/ports';
import { viewerOfRead } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import { rowFacts, type RowFacts } from '../row-facts.ts';
import type { RecordDeps } from './index.ts';

export const NAMES_PER_LIST = 1000;

/** One name: the row's number in its list, its title, then what tells it apart when the record could say. */
export type NameRow = [seq: number, title: string, on?: string, minor?: number, currency?: string];
export type NameList = { id: string; name: string; icon: string | null; rows: NameRow[] };
export type Names = { whole: boolean; lists: NameList[] };

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, sight } = deps;
  return {
    async names(_args: Record<string, unknown>, ctx: CallContext): Promise<Result<Names>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      if (deps.readsEveryList?.(ctx) !== true || sight.amountsHidden(ctx) || Object.keys(ctx.wheres ?? {}).length > 0 || Object.keys(ctx.hides ?? {}).length > 0) return ok({ whole: false, lists: [] });
      const viewer = viewerOfRead(ctx);
      const lists: NameList[] = [];
      for (const [id, decl] of kernel.registers()) {
        const title = decl.title;
        if (!title || decl.series === true) continue;
        const read = sql.all<{ seq: number | null; fields: string; updated_at: string }>(
          `SELECT seq, fields, updated_at FROM entry
            WHERE register = ? AND deleted_at IS NULL${viewer === undefined ? '' : ' AND id NOT IN (SELECT entry_id FROM entry_private WHERE person_id <> ?)'}
            ORDER BY updated_at DESC LIMIT ?`,
          id,
          ...(viewer === undefined ? [] : [viewer]),
          NAMES_PER_LIST,
        );
        const rows: NameRow[] = [];
        for (const r of read) {
          if (r.seq === null) continue;
          const fields = JSON.parse(r.fields) as Record<string, unknown>;
          const said = fields[title];
          if (typeof said !== 'string' || said === '') continue;
          const facts: RowFacts = rowFacts(decl, fields, r.updated_at, false);
          rows.push(facts.amount ? [r.seq, said, facts.on ?? '', facts.amount.amount, facts.amount.currency] : facts.on ? [r.seq, said, facts.on] : [r.seq, said]);
        }
        if (rows.length > 0) lists.push({ id, name: decl.name, icon: (decl as { icon?: string | null }).icon ?? null, rows });
      }
      return ok({ whole: true, lists });
    },
  };
}
