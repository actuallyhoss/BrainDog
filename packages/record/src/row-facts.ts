/**
 * What tells two rows of one name apart: the row's own day and its amount, read off its declaration.
 *
 * THE FIRST `day` FIELD THE LIST DECLARES AND ITS FIRST `money` FIELD THAT HOLDS ONE. `apple1104` saw three "iOS contractor"
 * rows look identical on 3 Nov because `search` sent a title and nothing else. A row with no day of its own says when it
 * last changed. An amount is never said to a caller amounts are hidden from.
 */

type Field = { id: string; type: string; retired?: boolean | undefined };

/** The two facts, as a search hit and a name carry them. Either may be absent. */
export type RowFacts = { on?: string; amount?: { amount: number; currency: string } };

const held = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { currency?: unknown }).currency === 'string';

export function rowFacts(decl: { fields: readonly Field[] } | undefined | null, fields: Readonly<Record<string, unknown>>, updatedAt: string | undefined, amountsHidden: boolean): RowFacts {
  const out: RowFacts = {};
  if (decl) {
    for (const f of decl.fields) {
      if (f.retired === true) continue;
      const v = fields[f.id];
      if (f.type === 'day' && out.on === undefined && typeof v === 'string' && v !== '') out.on = v.slice(0, 10);
      if (f.type === 'money' && out.amount === undefined && !amountsHidden && held(v)) out.amount = { amount: v.amount, currency: v.currency };
    }
  }
  if (out.on === undefined && typeof updatedAt === 'string' && updatedAt !== '') out.on = updatedAt.slice(0, 10);
  return out;
}
