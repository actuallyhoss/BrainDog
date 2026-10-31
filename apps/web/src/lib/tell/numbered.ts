/**
 * "INVOICE 1042 PAID" ON A RECORD THAT HOLDS INVOICE 1042: the open bill, invoice or order a line names by its number, and
 * the press that marks it paid.
 *
 * ASKED ONLY ONCE A LINE NAMES ONE. Today never reads every open bill for a sentence nobody typed: Tell's card asks here
 * when the words say "order 57", "invoice 1042" or "bill #12" and "paid", and reads the line again with what comes back
 * (`TellOptions.open`). An entry is known by the number it is kept under, or by a name that starts with its list's word
 * and that number ("Invoice 1042"), never by a count inside its name ("3 vanilla jars"). Only lists that keep bills,
 * invoices or orders are asked (`markKind`), never the Ledger. `tellRead` says which one is offered, and offers nothing
 * when it is not one.
 *
 * THE PRESS IS THE ENTRY'S OWN MARK PAID: only its state moves, to the paid state its list declares, written at the
 * version just read, and the receipt's Undo is the record's own batch, with the fields as they were read put back where
 * the record has none (`putBackOf`, as Today's late lines do).
 *
 * LOADED ON THE FIRST SUCH LINE, never with Today.
 */

import { createClient } from '@braindog/client';

import type { Change } from '../data/optimistic.ts';
import { putBackOf } from '../record/field-write.ts';
import { REGISTERS } from '../record/held.ts';
import type { Fields } from '../record/schema.ts';
import { markKind, namedAs, type Open, type TellChange, type TellList } from './read.ts';

/** The most entries one list is asked for by the number in their name, before the ones whose name starts with it are kept:
    "13 mugs" and "Order 23" hold a 3 too, so five could leave the one out (RQ1). */
const MOST = 25;

type Row = { seq?: unknown; fields?: Record<string, unknown> };
const rowsOf = (v: unknown): Row[] => ((v as { rows?: unknown } | null)?.rows as Row[] | undefined) ?? [];

/** The open entries of the lists that keep a bill, an invoice or an order paid, known by `n`: kept under it, or named by it. */
export async function openNumbered(base: string, lists: readonly TellList[], n: number): Promise<Open[]> {
  const client = createClient({ base });
  const out: Open[] = [];
  const said = String(n);
  await Promise.all(
    lists.map(async (l) => {
      const kind = markKind(l);
      if (!l.state || kind === null) return;
      const state = l.state;
      const done = l.done ?? [];
      const open = (fields: Record<string, unknown> | undefined): boolean => !done.includes(String(fields?.[state] ?? ''));
      const named = (fields: Record<string, unknown> | undefined): string => {
        const t = fields?.[l.title];
        return typeof t === 'string' ? t : '';
      };
      const [byName, bySeq] = await Promise.all([
        client
          .list({ register: l.id, where: { all: [{ field: state, not_in: [...done] }, { field: l.title, contains: said }] } as never, limit: MOST, fields: [l.title, state], short: true })
          .catch(() => null),
        client.get(l.id, n).catch(() => null),
      ]);
      const seen = new Set<number>();
      for (const r of byName?.ok ? rowsOf(byName.value) : []) {
        if (typeof r.seq !== 'number' || !open(r.fields) || !namedAs(named(r.fields), kind, said)) continue;
        seen.add(r.seq);
        out.push({ register: l.id, seq: r.seq, name: named(r.fields) });
      }
      const one = bySeq?.ok ? (bySeq.value as Row | null) : null;
      if (one && open(one.fields) && !seen.has(n)) out.push({ register: l.id, seq: n, name: named(one.fields) });
    }),
  );
  return out;
}

type Landed = { version: number; batch?: string };

/** The press that marks `c`'s entry paid, and its way back: `send` and `undo` for the card's `run`. */
export function markPress(base: string, c: TellChange, raced: string, again: () => void): Pick<Change<Landed>, 'send' | 'undo'> {
  const client = createClient({ base });
  const patch: Fields = { [c.field]: c.line };
  let before: Fields = {};
  return {
    send: async () => {
      const got = await client.get(c.register, c.seq);
      const row = got.ok ? (got.value as { fields?: Fields; version?: number } | null) : null;
      if (!row?.fields || typeof row.version !== 'number') return { ok: false as const, fix: raced };
      before = { ...row.fields };
      /* NO LONGER OPEN, it is not written, and it is said in words with no Undo (RQ5): paid on its own page since the card
         asked, or written off, which a press must never turn into paid. */
      const now = String(row.fields[c.field] ?? '');
      if (now === c.line) return { ok: false as const, fix: c.shut?.paid ?? raced };
      if ((c.shut?.states ?? []).includes(now)) return { ok: false as const, fix: c.shut?.other ?? raced };
      const out = await client.update({ register: c.register, seq: c.seq, patch, version: row.version });
      if (!out.ok) return { ok: false as const, fix: 'refusal' in out ? out.refusal.fix : raced };
      const landed = out.value as { version?: number; batch?: string };
      return { ok: true as const, value: { ...landed, version: typeof landed.version === 'number' ? landed.version : row.version + 1 } };
    },
    undo: (value) => ({
      apply: () => {},
      revert: () => {},
      send: async () => {
        const out = await client.update({ register: c.register, seq: c.seq, patch: putBackOf(before, patch, REGISTERS[c.register]), version: value.version });
        if (!out.ok) return { ok: false as const, fix: 'refusal' in out ? out.refusal.fix : raced };
        return { ok: true as const, value: null };
      },
      settle: () => again(),
    }),
  };
}
