/**
 * What points at one row on `/r/<register>/<seq>`, read from the record.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * THE RECORD HAD NO REVERSE INDEX, so this screen drew the sample's backlinks and nothing else. It
 * did not need one: the inverse of every `ref` is already stated once, on the field that declares
 * `to:`, and `backlinks` on the record walks exactly those declarations. Nothing was added to the
 * data model.
 *
 * GROUPED BY THE FIELD THAT POINTS, not by the register, which is the shape the sample's own
 * `backlinks()` answers and the shape this page already draws: two fields of one register can point
 * at the same place and mean different things, and collapsing them loses which.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` with no slug used to mean "draw
 * the sample's backlinks", which were another business's rows pointing at the row in the address; there is no sample
 * now.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { columnsFor, iconFor, labelOf, toRows, type Backlink } from './api.ts';
import { REGISTERS } from './held.ts';
import { entryOf, learn, namesOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import { rowsOf as tabRows, walkRows } from '../data/ref-rows.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * One page of what points here.
 *
 * `cursor` IS THE RECORD'S OWN, and it walks ACROSS the relations rather than within one: a
 * relation whose rows are all drawn carries the walk into the next, so a row named by two fields of
 * two lists pages through both without the screen knowing how many relations there are.
 */
export type Linked = { from: 'live'; groups: Backlink[]; cursor: string | null } | { from: 'refused'; fix: string };

export type LinkReader = {
  read(register: string, seq: number, cursor?: string): Promise<Linked>;
  /** What points at `register#seq`, from a `backlinks` answer the record already gave (a project page's shape). */
  answered(value: BacklinksValue, seq: number): Promise<Linked>;
};

/** A `backlinks` answer, as much of it as the groups are drawn from. */
export type BacklinksValue = { from: { register: string; field: string; rows: unknown[]; matched: number }[]; cursor: string | null };

/** Enough to fill the sections a row's page draws, and a `cursor` when there is more. */
export const LINKS_PAGE = 24;

function missed(out: object): Linked {
  if (!('refusal' in out)) return { from: 'refused', fix: 'The row changed while it was being read.' };
  return { from: 'refused', fix: (out.refusal as { fix: string }).fix };
}

/**
 * A backlinks reader for one tab.
 *
 * A REF ARRIVES AS THE TARGET ROW'S ULID and every column here is drawn by the register's own
 * helpers, so each register a pointing list refs is walked once and kept, the way `row-live.ts`
 * keeps its maps. A register this reader may not list is left out, and its refs draw as the id they
 * arrived as rather than as a wrong name.
 */
export function linkReader(base: string, io?: Fetch, clock: () => number = Date.now): LinkReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();
  const asked = new Map<string, Promise<void>>();

  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    await learn(client.schema, register, asked);
    /* THE TAB'S WALK (`ref-rows.ts`), which the page beside this panel walked already to name its own refs (scope
       2026-10-24 A21): this walked every list again for itself. A reader handed a fetch of its own walks for itself. */
    const rows = io ? await walkRows(client, register) : await tabRows(client, base, register);
    if (rows === null) return null;
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return map;
  }

  async function refsFor(register: string): Promise<Map<string, RefMap>> {
    const refs = new Map<string, RefMap>();
    for (const target of targetsOf(register)) {
      const map = await mapOf(target);
      if (map) refs.set(target, map);
    }
    return refs;
  }

  /** The groups of a `backlinks` answer, each list's rows named by this record. */
  async function answered(value: BacklinksValue, seq: number): Promise<Linked> {
    /* THE RECORD'S CLOCK where the page hands it (`recordNow`): a bill due 7 Oct on a record whose today is 3 Sep is not
       late, whatever day this browser says it is. */
    const now = clock();
    const groups: Backlink[] = [];
    for (const g of value.from) {
      /* A LIST THIS BUILD DOES NOT SHIP IS ASKED FOR FIRST: a use case's own lists are declared by the record alone. */
      await learn(client.schema, g.register, asked);
      const r = REGISTERS[g.register];
      const f = r?.fields.find((x) => x.id === g.field);
      /* A LIST NEITHER THIS BUILD NOR THE RECORD WILL DECLARE IS LEFT OUT rather than drawn with its id
         for a name: a heading reading `service_events` over columns nothing here can label is worse
         than the section being absent. */
      if (!r || !f) continue;
      const refs = await refsFor(g.register);
      const rows = (g.rows as RecordRow[]).map((row) => entryOf(g.register, row, refs));
      /* The pointing field is dropped from the columns: every row in this list has the same value
         for it, which is the row you are already looking at. */
      const all = columnsFor(g.register).filter((c) => c.field !== g.field);
      /* AND AN AMOUNT STAYS AMONG THE THREE: a list that declares its table puts its figure last (the Ledger's Date,
         Payee, Account, Category, Amount), and the first three of it drew a payment with no sum. */
      const figure = all.find((c) => c.truncate === 'never');
      const first = all.slice(0, 3);
      const columns = figure === undefined || first.includes(figure) ? first : [...first.slice(0, 2), figure];
      groups.push({
        register: g.register,
        name: r.name,
        label: labelOf(f),
        icon: iconFor(r.icon, 'rows'),
        total: g.matched,
        /* NAMED BY THIS RECORD. A pointing row's own refs are drawn from the titles that walk
           collected, never from the sample's rows of the same numbers. */
        rows: toRows(g.register, rows, columns, now, namesOf(refs)),
        columns,
        href: `/r/${g.register}?f=${g.field}:is:${seq}`,
        raw: (g.rows as RecordRow[]).map((row) => row.fields),
      });
    }
    return { from: 'live', groups, cursor: value.cursor };
  }

  return {
    async read(register, seq, cursor) {
      /* A PENDING ROW HAS NO NUMBER THE RECORD COULD HOLD, so nothing is asked, and nothing on the record can point at it. */
      if (!Number.isInteger(seq) || seq < 1) return { from: 'live', groups: [], cursor: null };
      const out = await client.backlinks({ register, seq, limit: LINKS_PAGE, ...(cursor === undefined ? {} : { cursor }) });
      if (!out.ok) return missed(out);
      return answered(out.value as BacklinksValue, seq);
    },
    answered,
  };
}
