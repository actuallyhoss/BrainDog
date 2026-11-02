/**
 * What the quick-add sheet reads from the record and writes to it. A route-only module: it carries the client, so it
 * is loaded when the sheet is, never with a page.
 *
 * READS: the declarations the tab already asked beside `boot`, the ledger's accounts and categories, its newest lines
 * (whom money usually goes to, and which categories were used last), and the rates.
 *
 * WRITES: one line is the record's ordinary `create`, and its way back is an archive at the version it answered, as the
 * palette's own add is. Two lines or more (a split, or the two legs of a move) are one `capture`, kept all or none
 * under one batch, and the way back takes the batch back.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { REGISTERS } from '../record/held.ts';
import { learn, type RecordRow } from '../record/remote.ts';
import { ledgerAmong, ledgerFrom, type Ledger } from './ledger.ts';
import type { Line, Option, Past } from './quick.ts';
import { ratesFrom, ratesListOf, type Rate } from './rates.ts';

/** What a row with no name is called in the sheet. */
const UNNAMED = 'No name';

const rowsOf = (v: unknown): RecordRow[] => ((v as { rows?: unknown } | null)?.rows as RecordRow[] | undefined) ?? [];

/** The lists a tab may hold declarations for, less the kernel's own. */
type Listed = { id: string; kernel?: true };

/** Every non-kernel list's declaration this tab holds, asked once (they arrive with `boot`, so asking costs nothing). */
export async function declarations(base: string, lists: readonly Listed[]) {
  const client = createClient({ base });
  const ids = lists.filter((l) => l.kernel !== true).map((l) => l.id);
  const asked = new Map<string, Promise<void>>();
  await Promise.all(ids.map((id) => learn((r) => client.schema(r), id, asked).catch(() => undefined)));
  /* A LIST STILL NOT DECLARED IS ASKED ONCE MORE, ON ITS OWN (final polish, 2 Nov). Another screen's ask of the same list,
     made after this one (the shell's on a first open), is the one `learn` keeps, so this ask came back with nothing filled
     and the statement import said there was no ledger on a record that holds one. */
  const missing = ids.filter((id) => REGISTERS[id] === undefined);
  if (missing.length > 0) await Promise.all(missing.map((id) => learn((r) => client.schema(r), id, new Map()).catch(() => undefined)));
  return ids.map((id) => REGISTERS[id]).filter((d) => d !== undefined);
}

/** The ledger of the record at `base`, or `null` where it keeps none. */
export async function findLedger(base: string, lists: readonly Listed[]): Promise<Ledger | null> {
  return ledgerAmong(await declarations(base, lists));
}

/** What the sheet draws from: the open accounts, the categories, the newest lines, and the rates. */
export type Held = { accounts: Option[]; categories: Option[]; past: Past[]; rates: Rate[] };

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const idOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const open = (row: RecordRow, state: string | null, done: readonly string[]): boolean => !state || !done.includes(text(row.fields[state]));

/** The rows of one list, newest first where an order is named, at most `limit`. */
async function list(client: ReturnType<typeof createClient>, register: string, limit: number, order?: { field: string; dir: 'asc' | 'desc' }) {
  const got = await client.list({ register, limit, ...(order ? { order: [order] } : {}) });
  return got.ok ? rowsOf(got.value) : [];
}

/** A list of categories as the sheet offers them, by name, the closed ones left out. */
function categoriesOf(rows: readonly RecordRow[], c: NonNullable<Ledger['category']>): Option[] {
  return rows
    .filter((r) => open(r, c.state, c.done))
    .map((r) => ({
      id: r.id,
      name: text(r.fields[c.title]) || UNNAMED,
      icon: c.icon ? idOf(r.fields[c.icon]) : null,
      colour: c.colour ? idOf(r.fields[c.colour]) : null,
      way: c.way ? idOf(r.fields[c.way.field]) : null,
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** What a line's split is drawn and edited with: the field its parts are cut by, the categories, and the two ways. */
export type SplitHeld = { by: string; categories: Option[]; way: Ledger['way']; either: readonly string[] };

/**
 * The categories a line of `register` may be split across, or `null` where the list keeps no parts or no category. Its
 * declaration and the lists it links to are learnt first, so a line opened straight from a link is read the same.
 */
export async function readSplit(base: string, register: string): Promise<SplitHeld | null> {
  const client = createClient({ base });
  const asked = new Map<string, Promise<void>>();
  await learn((r) => client.schema(r), register, asked).catch(() => undefined);
  const decl = REGISTERS[register];
  if (!decl) return null;
  const linked = [...new Set(decl.fields.flatMap((f) => (f.type === 'ref' && typeof f.to === 'string' ? [f.to] : [])))];
  await Promise.all(linked.map((id) => learn((r) => client.schema(r), id, asked).catch(() => undefined)));
  const l = ledgerFrom(decl, new Map(Object.entries(REGISTERS)));
  if (!l?.category || !l.parts) return null;
  const rows = await list(client, l.category.list, 300);
  return { by: l.category.field, categories: categoriesOf(rows, l.category), way: l.way, either: l.category.way?.either ?? [] };
}

/** Everything the sheet reads, at once. A list that will not answer is read as empty, and the sheet says so. */
export async function readHeld(base: string, l: Ledger, lists: readonly Listed[]): Promise<Held> {
  const client = createClient({ base });
  const ratesAt = ratesListOf(await declarations(base, lists));
  const [accountRows, categoryRows, lineRows, rateRows] = await Promise.all([
    list(client, l.account.list, 200),
    l.category ? list(client, l.category.list, 300) : Promise.resolve([]),
    list(client, l.list, 400, { field: l.day, dir: 'desc' }),
    ratesAt ? list(client, ratesAt.list, 200) : Promise.resolve([]),
  ]);
  const a = l.account;
  const accounts: Option[] = accountRows
    .filter((r) => open(r, a.state, a.done))
    .map((r) => {
      const money = a.money ? (r.fields[a.money] as { currency?: unknown } | null) : null;
      return { id: r.id, name: text(r.fields[a.title]) || UNNAMED, currency: typeof money?.currency === 'string' ? money.currency : null, kind: a.kind ? idOf(r.fields[a.kind]) : null };
    });
  const c = l.category;
  const categories: Option[] = c ? categoriesOf(categoryRows, c) : [];
  const past: Past[] = lineRows.map((r) => {
    const way = text(r.fields[l.way.field]);
    return {
      title: text(r.fields[l.title]),
      category: c ? idOf(r.fields[c.field]) : null,
      account: idOf(r.fields[a.field]),
      way: way === l.way.out ? 'out' : way === l.way.in ? 'in' : null,
      day: text(r.fields[l.day]),
      move: l.mark ? r.fields[l.mark] === true : false,
    };
  });
  return { accounts, categories, past, rates: ratesAt ? ratesFrom(rateRows.map((r) => r.fields), ratesAt.fields) : [] };
}

/** The record's rates, from the list that declares it holds them; none where no list does. */
export async function readRates(base: string, lists: readonly Listed[]): Promise<Rate[]> {
  const at = ratesListOf(await declarations(base, lists));
  if (!at) return [];
  return ratesFrom((await list(createClient({ base }), at.list, 200)).map((r) => r.fields), at.fields);
}

/** What a write answered: how to take it back, or the record's sentence. */
export type Wrote = { ok: true; back: () => Promise<{ ok: boolean; fix?: string }> } | { ok: false; fix: string };

type Refused = { ok: false; refusal?: { code?: string; fix?: string } };
const fixOf = (out: unknown): string => {
  const r = (out as Refused).refusal;
  return r?.code === 'UNREACHABLE' || !r?.fix ? copy.writeNotReached : r.fix;
};

/** Write the lines: one through `create`, more through one `capture`. */
export async function writeLines(base: string, l: Ledger, lines: readonly Line[]): Promise<Wrote> {
  const client = createClient({ base });
  if (lines.length === 1) {
    const out = await client.create({ register: l.list, fields: lines[0]! });
    if (!out.ok) return { ok: false, fix: fixOf(out) };
    const row = out.value as RecordRow;
    return {
      ok: true,
      back: async () => {
        if (row.seq === null) return { ok: false, fix: copy.writeNotReached };
        const undone = await client.update({ register: l.list, seq: row.seq, patch: { deleted_at: new Date().toISOString() }, version: row.version });
        return undone.ok ? { ok: true } : { ok: false, fix: fixOf(undone) };
      },
    };
  }
  const out = await client.capture({ rows: lines.map((fields) => ({ register: l.list, fields })) });
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  const batch = (out.value as { batch?: unknown }).batch;
  return {
    ok: true,
    back: async () => {
      if (typeof batch !== 'string') return { ok: false, fix: copy.writeNotReached };
      const { undoChange } = await import('../record/undo-write.ts');
      const u = await undoChange(base, batch);
      return u.from === 'undone' ? { ok: true } : { ok: false, fix: u.fix };
    },
  };
}

/** What Money's chips are drawn from: each category's own glyph and colour, and each account's type, by name. */
export type Looks = { categories: { name: string; icon: string | null; colour: string | null; income: boolean }[]; accounts: { name: string; kind: string | null }[] };

/** The categories and accounts of the record's ledger, by name, for the chips; nothing where it keeps no ledger. */
export async function readLooks(base: string, lists: readonly Listed[]): Promise<Looks> {
  const l = await findLedger(base, lists);
  if (!l) return { categories: [], accounts: [] };
  const client = createClient({ base });
  const [accountRows, categoryRows] = await Promise.all([list(client, l.account.list, 200), l.category ? list(client, l.category.list, 300) : Promise.resolve([])]);
  const c = l.category;
  /* MONEY THAT COMES IN IS SAID BY THE CATEGORY'S OWN WAY, which draws an unnamed kind of pay as earnings (`glyphByName`). */
  const categories = c ? categoriesOf(categoryRows, c).map((o) => ({ name: o.name, icon: o.icon ?? null, colour: o.colour ?? null, income: c.way !== null && o.way === c.way.in })) : [];
  const accounts = accountRows.map((r) => ({ name: text(r.fields[l.account.title]) || UNNAMED, kind: l.account.kind ? idOf(r.fields[l.account.kind]) : null }));
  return { categories, accounts };
}
