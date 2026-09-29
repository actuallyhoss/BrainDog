/**
 * A saved view on `/v/<key>`, read from the record, and only from the record.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * WHERE A SAVED VIEW ACTUALLY LIVES, WHICH TWO COMMENTS IN THIS DIRECTORY STILL GET WRONG.
 * `views.ts` says "the kernel still refuses one" and `rows-write.ts` says a named predicate is
 * `REGISTER_UNBUILT`, so both route a saved view through a page declaration. Measured against the
 * tree they describe: the kernel has a `view` table (`packages/kernel/src/index.ts`, `VIEW_SELECT`),
 * the record routes `views`, `view`, `saveView` and `retireView` (`packages/record/src/index.ts`),
 * and `@braindog/client` types all four. A view is a first-class row on the record now, and this
 * file reads it there. The page declarations `rows-write.ts` writes are a SECOND store, and the
 * screens disagreeing about which one holds a view is the thing to fix next.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` are refusals like any other, said in their own words. They
 * answered with the sample until it was removed, and the route drew the seeded studio's view of
 * the same key over rows from the in-browser fixture. `VIEW_UNKNOWN` is a view this record does not hold, carrying the addresses it does
 * hold, so the answer ends the search instead of starting one. THAT SENTENCE WAS HALF TRUE UNTIL
 * `everyAddress` BELOW: the record builds `allowed` from `kernel.views(register)`, which is
 * `WHERE register = ?` (`packages/kernel/src/index.ts`), so a key naming a register with no views at
 * all carried nothing, and `/v/[view]` printed "This record has no saved views yet." over a record
 * holding several. Any other refusal is the record's own sentence, and that INCLUDES the read of the
 * rows: a view whose filter names a field the register has since dropped is refused by `list`, and
 * the record's sentence about that field is the only thing on the screen that can explain a view
 * that used to work.
 *
 * `<register>.<id>` IS THE ADDRESS, split at the last dot, because that is the shape every link to a
 * view already has (`obligations.overdue`) and the shape the record's key is in: a view belongs to
 * one register, and `VIEW_ID` in the kernel is lower case with no dot in it.
 *
 * THE DECLARATION IS THE SEED'S COPY, as it is for the row and the list (`remote.ts` says why), and
 * the rows come back through `entryOf`, so a live row reaches the route in the shape the list's own
 * helpers already read.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { DOM_CAP, PAGE } from './api.ts';
import { REGISTERS } from './held.ts';
import {
  entryOf,
  learn,
  namesOf,
  refMapOf,
  targetsOf,
  treeOf,
  type Names,
  type RecordRow,
  type RefMap,
  type Tree,
} from './remote.ts';
import type { Entry, Filter } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/** A refusal as the record sends one, and only the keys read here. */
type Said = { code: string; fix: string; allowed?: readonly string[] };

/**
 * One saved view as this route draws it.
 *
 * `filters` IS `null` WHERE THE PREDICATE IS NOT SOMETHING THE CHIPS CAN SAY, and the route then
 * prints no sentence rather than a shorter one. The route's own header already records what that
 * costs: a view called Overdue printed "state is open or part, and due is before today" over a list
 * filtered on state alone, so 28 rows were drawn under the word and 24 of them were not overdue. A
 * printed predicate that is not the predicate is worse than none, because it is checkable and wrong.
 *
 * AND THE REFUSED SET IS TEN TESTS WIDE, not the four it is easy to name. `@braindog/where`
 * declares twenty operators (`OPERATORS`, `index.ts:39`) and `clauseOf` below reads ten, so on
 * top of `any` and `none` groups and a hop through `via`, every one of `gt`, `gte`, `lt`, `lte`,
 * `between`, `contains`, `matches`, `starts`, `ends` and `near` comes back `null`
 * and takes the whole Filter line with it. That is the safe direction and it is not a small set:
 * `copy.filterClause` would write `Cost is 100` for `{ field: 'cost', gt: 100 }`, a clause that
 * reads as an equality over a bound, which is the Overdue failure again in one leaf.
 */
export type LiveView = {
  key: string;
  register: string;
  name: string;
  /** What was in the search box when the view was saved, and `''` for nothing. */
  search: string;
  /** The sort the view was saved under, in the shape `list` takes. */
  order: { field: string; dir: 'asc' | 'desc' }[];
  /** The columns kept, in the order they were kept. Empty is the register's own default. */
  columns: string[];
  filters: Filter[] | null;
};

/**
 * What the route drew from.
 *
 * `missing` CARRIES THE RECORD'S SENTENCE AND THE RECORD'S ADDRESSES, and the route lists nothing
 * else: it once listed the seeded studio's two views under "There is no saved view called x", which
 * answered the question with two links that open somebody else's list.
 */
export type Viewed =
  | { from: 'live'; view: LiveView; entries: Entry[]; matched: number; total: number; names: Names }
  | { from: 'missing'; said: string; addresses: string[] }
  | { from: 'refused'; fix: string; register?: string };

export const liveWords = {
  changed: 'The saved view changed while it was being read.',
  /* A KEY WITH NO DOT IN IT NAMES NO REGISTER, and a view belongs to one: there is nothing for the
     record to look under. Said in the same form as the record's own `VIEW_UNKNOWN` sentence. */
  noAddress: (key: string): string => `There is no saved view called ${key}.`,
  /* THE RECORD ANSWERED THE VIEW AND WOULD NOT DESCRIBE THE LIST IT FILTERS, and said nothing about
     why. Used only where `schema` came back `ok` with no fields on it; a refusal carries the
     record's own sentence and that is preferred over this one. */
  noList: (register: string): string => `${register} is not a list this record describes, so the view over it cannot be drawn.`,
} as const;

/** `<register>.<id>`, split at the last dot, or nothing when the key names no register. */
export function addressOf(key: string): { register: string; id: string } | null {
  const at = key.lastIndexOf('.');
  if (at < 1 || at === key.length - 1) return null;
  return { register: key.slice(0, at), id: key.slice(at + 1) };
}

/** A leaf's value as the chips carry one: text, or a list of text. Anything else is not a chip. */
function valuesOf(v: unknown): string[] | null {
  const one = (x: unknown): string | null => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : null);
  if (Array.isArray(v)) {
    const said = v.map(one);
    return said.every((x): x is string => x !== null) ? said : null;
  }
  const single = one(v);
  return single === null ? null : [single];
}

/**
 * One leaf of the record's predicate as one of this app's chips, or nothing.
 *
 * THE OPERATORS ARE THE ONES THE CHIPS CAN RUN, and every one of them is checked against the
 * printer beside it. `copy.filterClause` knows `before`, `after`, `has`, `lacks`, `not-in` and
 * everything-else-is-`is`, so a `contains` leaf handed to it would be printed as "Note is invoice" —
 * a clause that reads as an equality over a substring test. `empty` and `present` become the words
 * the register's own filter grammar uses for them (`where.ts`: "points at is empty", "points at is
 * set"), so the sentence a live view prints is one a person could type back.
 *
 * `has` AND `lacks` ARE READ HERE AND PRINTED THERE, AND THE PRINTER WAS THE HALF OWED UNTIL
 * `03d2ccc3`. A view whose filter is `{ field: 'repos', has: 'portage' }` answered `null`, which takes
 * the whole Filter line with it, so the view drew its rows under no sentence at all and its chips
 * reached neither `whereOf` nor `treeOf`. `whereOf` spells both words and the mock answers them, so
 * the chips RUN; and `copy.filterClause` has a `has || lacks` arm of its own, so the line above a
 * live view now reads `Repositories has portage` rather than `Repositories is portage`, which is the
 * equality the record refuses by name. This paragraph said the debt was open for as long as it took
 * an audit to read the two files side by side, which is the cost of a measured note nobody revisits.
 * `filter-clause.test.ts` round-trips every clause that printer writes back through `compile`.
 */
function clauseOf(leaf: Record<string, unknown>): Filter | null {
  const field = typeof leaf.field === 'string' ? leaf.field : '';
  /* `via` WALKS A REF BEFORE IT TESTS, and a chip has no hop in it: the field named is on another
     register, so labelling it against this one would print the wrong column's name. */
  if (field === '' || leaf.via !== undefined) return null;
  if (leaf.empty === true) return { field, op: 'is', values: ['empty'] };
  if (leaf.present === true) return { field, op: 'is', values: ['set'] };
  const ops: readonly (readonly [string, string])[] = [
    ['is', 'is'],
    ['in', 'in'],
    ['not', 'not-in'],
    ['not_in', 'not-in'],
    ['before', 'before'],
    ['after', 'after'],
    /* THE RECORD'S OWN TWO WORDS, unchanged on the way through, because `where.ts` took them from
       the record rather than translating them: there is nothing here for either side to swap. */
    ['has', 'has'],
    ['lacks', 'lacks'],
  ];
  for (const [key, op] of ops) {
    if (!(key in leaf)) continue;
    const values = valuesOf(leaf[key]);
    return values === null ? null : { field, op, values };
  }
  return null;
}

/**
 * The record's predicate as this app's chips, or `null` for a shape they cannot say.
 *
 * ONLY A FLAT `all` OF LEAVES, because that is what the chip row means: every chip narrows, and
 * they are read as one conjunction. An `any` or a `none` group is a different question, and
 * flattening it would print a sentence that claims the view filters on more than it does.
 */
export function clausesOf(node: unknown): Filter[] | null {
  if (node === null || typeof node !== 'object') return null;
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.all)) {
    const out: Filter[] = [];
    for (const child of n.all) {
      const said = clausesOf(child);
      if (said === null) return null;
      out.push(...said);
    }
    return out;
  }
  if ('any' in n || 'none' in n) return null;
  const one = clauseOf(n);
  return one === null ? null : [one];
}

/**
 * The columns this view kept, as the register's own columns, with the spoken id last.
 *
 * A NAME THE REGISTER NO LONGER DECLARES IS DROPPED RATHER THAN DRAWN EMPTY: the kernel holds a
 * view's columns to the register's fields at the moment it is saved, and a field retired afterwards
 * would otherwise be a column of blanks with nothing on screen saying why. A view that kept nothing
 * the register still declares falls back to the register's own columns, which is what `columns: []`
 * already means to the record.
 */
export function keptColumns<C extends { field: string }>(all: readonly C[], kept: readonly string[]): C[] {
  const ordered = kept.length === 0 ? [...all] : kept.map((f) => all.find((c) => c.field === f)).filter((c): c is C => c !== undefined);
  const columns = ordered.length === 0 ? [...all] : ordered;
  return [...columns.filter((c) => c.field !== 'seq'), ...columns.filter((c) => c.field === 'seq')];
}

function missed(out: object, register?: string): Viewed {
  if (!('refusal' in out)) return { from: 'refused', fix: liveWords.changed, ...(register === undefined ? {} : { register }) };
  const refusal = out.refusal as Said;
  if (refusal.code === 'VIEW_UNKNOWN')
    return { from: 'missing', said: refusal.fix, addresses: (refusal.allowed ?? []).map((id) => `${register ?? ''}.${id}`) };
  return { from: 'refused', fix: refusal.fix, ...(register === undefined ? {} : { register }) };
}

export type ViewReader = {
  /** One saved view and its rows. `extra` and `q` are the rest of the URL, ANDed on, never replacing. */
  read(key: string, extra?: readonly Filter[], q?: string): Promise<Viewed>;
};

/**
 * A view reader for one tab.
 *
 * A REF ARRIVES AS THE TARGET ROW'S ULID and every cell is drawn by the register's own helpers, so
 * each register this one's refs point at is walked once and kept, the way `row-live.ts` keeps its
 * maps. A register this reader may not list is left out, and its refs draw as the id they arrived as
 * rather than as a wrong name.
 */
export function viewReader(base: string, io?: Fetch): ViewReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();
  const asked = new Map<string, Promise<void>>();

  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    await learn(client.schema, register, asked);
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out = await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return null;
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
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

  type Walked = { ok: true; value: { rows: RecordRow[]; matched: number } } | { ok: false; refusal: Said };

  /**
   * The view's rows, up to the cap this route draws.
   *
   * THE SAME CAP THE REGISTER APPLIES, and the same reason: `13 §4.3` sends a person here when a
   * register gets big, so this is the one surface where a five-thousand-row answer would be
   * assembled whole. The record's own page is 200, so the walk stops at `DOM_CAP` rather than at
   * the end of the list, and `matched` is the whole answer's size whatever was drawn.
   */
  async function walk(register: string, where: Tree | undefined, order: LiveView['order']): Promise<Walked> {
    const rows: RecordRow[] = [];
    let matched = 0;
    let cursor: string | null = null;
    do {
      const out = await client.list({
        register,
        limit: PAGE,
        ...(where === undefined ? {} : { where }),
        ...(order.length === 0 ? {} : { order }),
        ...(cursor === null ? {} : { cursor }),
      });
      /* A READ CANNOT CONFLICT, so the only `ok: false` a `list` answers with is a refusal. The
         client's `Result` carries the write shape too, and narrowing on the key rather than
         asserting is what keeps a conflict from being read as a refusal with no `fix` on it.

         AND THE UNREACHABLE ARM SAYS `INTERNAL` RATHER THAN A CODE OF ITS OWN. It said `CONFLICT`,
         which is not a code anything else in this product raises: the record's conflict is
         `VERSION_STALE`, and `CONFLICT` was a fifth invented code against the `refusals` gate's
         budget of four, which is how CI went red on the first push in two days. `INTERNAL` is the
         one the host already reserves for a state that cannot be reached and is deliberately not in
         `30 §6`'s registry, which is exactly what this arm is. */
      if (!out.ok) return { ok: false, refusal: 'refusal' in out ? (out.refusal as Said) : { code: 'INTERNAL', fix: liveWords.changed } };
      rows.push(...(out.value.rows as RecordRow[]));
      matched = out.value.matched;
      cursor = out.value.cursor;
    } while (cursor !== null && rows.length < DOM_CAP);
    return { ok: true, value: { rows, matched } };
  }

  /**
   * Every saved view this record holds, as addresses, or none where it would not say.
   *
   * THE SECOND READ THAT MAKES A MISS USEFUL. `VIEW_UNKNOWN` carries one register's views, so a key
   * naming a register that holds none carries an empty set, and `/v/[view]` turns an empty set into
   * "This record has no saved views yet." on a record with two of them. A refused second read leaves
   * the addresses empty rather than replacing the record's sentence: the reader came for the first
   * sentence and it is still the true one.
   */
  async function everyAddress(): Promise<string[]> {
    const all = await client.views();
    return all.ok ? all.value.map((v) => `${v.register}.${v.id}`) : [];
  }

  return {
    async read(key, extra = [], q = '') {
      const at = addressOf(key);
      if (at === null) {
        /* NO REGISTER IN THE KEY, so there is nothing to ask `view` for. The record is still asked
           what it does hold, because the addresses are the answer a person came for. */
        const all = await client.views();
        if (!all.ok) return missed(all);
        return { from: 'missing', said: liveWords.noAddress(key), addresses: all.value.map((v) => `${v.register}.${v.id}`) };
      }
      const got = await client.view(at);
      if (!got.ok) {
        const said = missed(got, at.register);
        /* AND A MISS THAT NAMED NOBODY IS ASKED AGAIN, ONCE. The record's own sentence stays; only
           the half that lists addresses is filled in, and only where that register answered with
           none. A register that does hold views has already answered the question. */
        return said.from === 'missing' && said.addresses.length === 0 ? { ...said, addresses: await everyAddress() } : said;
      }
      const saved = got.value;

      /* A USE CASE'S OWN LISTS ARE DECLARED BY THE RECORD ALONE: the view's list first, so its
         columns and its refs are known, and each register it points at before a row is drawn. */
      await learn(client.schema, saved.register, asked);

      /**
       * AND THE DECLARATION IS PART OF THE ANSWER HERE, WHICH IT IS NOT FOR A REF.
       *
       * `learn` swallows a refusal on purpose: a ref map for a list this key may not read is better
       * absent than fatal, and the ref then draws as the id it arrived as. The view's OWN register
       * is different, because the columns, the field labels and the name in the header all come
       * from it. A live view over a register the record would not declare therefore came back
       * `from: 'live'` with nothing to draw it with, and the route fell past every state it has
       * into its 404: "There is no saved view called shipments.lapsing", over the seeded studio's two
       * view names, on a record that had just answered with the view. Both halves of that screen were
       * wrong, and the second is the fictional studio on a real record.
       *
       * The record is asked once more, on this path only, because `learn` keeps no sentence and the
       * record's own is the only one that can explain it. No register goes into the answer: the
       * route's refusal offers `Open <register>` from it, and the only spelling available here is a
       * raw id nobody has a word for.
       */
      if (!REGISTERS[saved.register]) {
        const said = await client.schema(saved.register);
        return said.ok ? { from: 'refused', fix: liveWords.noList(saved.register) } : missed(said);
      }

      const refs = await refsFor(saved.register);

      /**
       * THE VIEW'S PREDICATE, ITS OWN SEARCH, AND THE URL'S CLAUSES, ANDED.
       *
       * `19 §1` says the saved view IS the predicate and the URL is its serialisation, so an extra
       * clause in the URL is a narrower question about the same list and the answer is the narrower
       * list. The view's own `search:` is the third narrowing, and it is the one that was only ever
       * stored: nothing read it back, so a view saved with a word in the box reopened over the whole
       * predicate without it.
       */
      const nodes = [
        saved.filter as Tree | null,
        treeOf(saved.register, [], saved.search ?? '', refs) ?? null,
        treeOf(saved.register, extra, q, refs) ?? null,
      ].filter((n): n is Tree => n !== null);
      const where = nodes.length === 0 ? undefined : nodes.length === 1 ? nodes[0] : { all: nodes };

      /* THE WHOLE LIST'S SIZE IS A SECOND READ, because the two nothings depend on it: a list nobody
         has typed into is `no-data-yet` and a predicate that matched none of thirty-eight is
         `no-results`, and `matched` under a filter cannot tell them apart. It is refused rather than
         guessed at, because a header reading `0 of 0` over a register holding rows is a wrong figure
         and not a missing one. */
      const [page, whole] = await Promise.all([walk(saved.register, where, saved.order), client.list({ register: saved.register, limit: 1 })]);
      if (!page.ok) return missed(page, saved.register);
      if (!whole.ok) return missed(whole, saved.register);

      return {
        from: 'live',
        view: {
          key,
          register: saved.register,
          name: saved.name,
          search: saved.search ?? '',
          order: saved.order,
          columns: saved.columns,
          filters: saved.filter === null ? [] : clausesOf(saved.filter),
        },
        entries: page.value.rows.map((row) => entryOf(saved.register, row, refs)),
        matched: page.value.matched,
        total: whole.value.matched,
        names: namesOf(refs),
      };
    },
  };
}
