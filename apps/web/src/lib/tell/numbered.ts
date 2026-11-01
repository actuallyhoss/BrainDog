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
 *
 * AND BY ITS NAME OR WHOSE IT IS (audit 1 Nov, AP6): "Rent paid", "Salma's order is paid" and "Rent 12,000 just paid"
 * found nothing, and the last added a second 12,000 while Rent stayed due. A line that says "paid" and no number asks
 * here for the open entries of those same lists (`openToMark`), each with the day it is due, what it comes to, who it is
 * linked to and which way its money goes, so the reader can match "Rent" or "Salma's order" and say which it marks.
 */

import { createClient } from '@braindog/client';

import type { Change } from '../data/optimistic.ts';
import { putBackOf } from '../record/field-write.ts';
import { REGISTERS } from '../record/held.ts';
import { isMoney, type Fields } from '../record/schema.ts';
import { PEOPLE } from '../who.ts';
import { markKind, namedAs, type Open, type TellChange, type TellList } from './read.ts';

/** The most entries one list is asked for by the number in their name, before the ones whose name starts with it are kept:
    "13 mugs" and "Order 23" hold a 3 too, so five could leave the one out (RQ1). */
const MOST = 25;

type Row = { id?: unknown; seq?: unknown; fields?: Record<string, unknown> };
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

/** The fields an open entry is said by beside its name: the day it is due, what it comes to, who, and which way. */
function partsOf(l: TellList) {
  const live = l.fields.filter((f) => f.retired !== true);
  const due = live.find((f) => f.type === 'day' && f.deadline === true);
  /* WHAT IT COMES TO, never what is paid of it so far: a required amount, else one called its total or amount. */
  const amount = live.find((f) => f.type === 'money' && f.required === true) ?? live.find((f) => f.type === 'money' && /total|amount|price/iu.test(`${f.id} ${f.label ?? ''}`));
  const by = live.find((f) => f.type === 'ref' && f.to === PEOPLE);
  const way = live.find((f) => f.type === 'enum' && f.values?.includes('owed_to_me') === true && f.values.includes('owed_by_me'));
  return { due, amount, by, way };
}

/** The most open entries one list is asked for when a line says "paid" with no number: the soonest due first. */
const MOST_OPEN = 40;

/**
 * THE OPEN ENTRIES A LINE THAT SAYS "PAID" COULD MEAN (AP6): every open bill, invoice and order, the soonest due first,
 * with who each is linked to by name where People lets this reader see them. Asked once a line says "paid", never with
 * Today.
 */
export async function openToMark(base: string, lists: readonly TellList[]): Promise<Open[]> {
  const client = createClient({ base });
  const out: Open[] = [];
  /* Whose each is, by the People entry its link names: by its number where the link says one, else by its id. */
  const byId = new Map<string, Open[]>();
  await Promise.all(
    lists.map(async (l) => {
      const kind = markKind(l);
      if (!l.state || kind === null) return;
      const state = l.state;
      const done = l.done ?? [];
      const { due, amount, by, way } = partsOf(l);
      const fields = [l.title, state, ...[due, amount, by, way].flatMap((f) => (f ? [f.id] : []))];
      const got = await client
        .list({ register: l.id, where: { field: state, not_in: [...done] } as never, limit: MOST_OPEN, fields, short: true, ...(due ? { order: [{ field: due.id, dir: 'asc' as const }] } : {}) })
        .catch(() => null);
      for (const r of got?.ok ? rowsOf(got.value) : []) {
        const f = r.fields ?? {};
        if (typeof r.seq !== 'number' || done.includes(String(f[state] ?? ''))) continue;
        const title = f[l.title];
        const e: Open = { register: l.id, seq: r.seq, name: typeof title === 'string' ? title : '' };
        const day = due ? f[due.id] : undefined;
        if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(day)) e.due = day.slice(0, 10);
        const sum = amount ? f[amount.id] : undefined;
        if (isMoney(sum)) e.amount = { amount: sum.amount, currency: sum.currency };
        if (kind === 'order') e.toMe = true;
        else if (way && (f[way.id] === 'owed_to_me' || f[way.id] === 'owed_by_me')) e.toMe = f[way.id] === 'owed_to_me';
        const link = by ? f[by.id] : undefined;
        const n = typeof link === 'number' ? link : typeof link === 'string' ? /^(?:[a-z][a-z0-9_]*#)?(\d+)$/u.exec(link.trim())?.[1] : undefined;
        if (n !== undefined) e.by = { seq: Number(n), name: '' };
        else if (typeof link === 'string' && link.trim() !== '') byId.set(link.trim(), [...(byId.get(link.trim()) ?? []), e]);
        out.push(e);
      }
    }),
  );
  const ids = [...byId.keys()];
  const people = lists.find((l) => l.id === PEOPLE);
  if (ids.length > 0 && people) {
    const got = await client
      .list({ register: PEOPLE, where: { field: 'id', in: ids } as never, limit: ids.length, fields: [people.title], short: true })
      .catch(() => null);
    for (const r of got?.ok ? rowsOf(got.value) : []) {
      const name = r.fields?.[people.title];
      if (typeof r.id !== 'string' || typeof r.seq !== 'number') continue;
      for (const e of byId.get(r.id) ?? []) e.by = { seq: r.seq, name: typeof name === 'string' ? name : '' };
    }
  }
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
