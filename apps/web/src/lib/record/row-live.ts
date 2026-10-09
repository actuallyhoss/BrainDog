/**
 * One row on `/r/<register>/<seq>`, read from the record.
 *
 * A ROUTE-ONLY MODULE, like `history-live.ts`: the client carries the route table as a value.
 *
 * EVERY REFUSAL IS THE RECORD'S OWN SENTENCE. `UNREACHABLE` and `UNAUTHORIZED` with no slug used to draw the
 * sample's row of the address's number, another business's row; there is no sample now. A row the
 * record does not hold is `entry: null`, and the LIST's declaration is learned
 * even then, because the screen that says the row is not there has to name the list it is not in.
 *
 * THE DECLARATION IS THE SEED'S COPY, as it is for the list (`remote.ts` says why and what pins it).
 * The answer is turned into the app's `Entry` by `entryOf`, so every helper the page already calls
 * (`display`, `readableFields`, `toneOf`) reads a live row the way it reads a sample one.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { REGISTERS } from './held.ts';
import { identitiesOf, seenIn } from './names.ts';
import { entryOf, learn, namesOf, refMapOf, targetsOf, type Names, type RecordRow, type RefMap } from './remote.ts';
import type { DocValues } from './row-values.ts';
import type { Entry } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * `names` IS WHAT THE RECORD CALLS THE ROWS THIS ONE POINTS AT, and it travels with the row because
 * the page draws every field through `display`: without it a live `ref` was drawn as the sample's
 * row of the same number, which is another record's name under this record's field.
 */
export type Got =
  | { from: 'live'; entry: Entry | null; names: Names; person?: Person; folded?: number; docs?: Docs }
  | { from: 'refused'; fix: string };

/**
 * `docs` IS WHAT EACH OF THE ROW'S DOCUMENTS READS, by field (PGS-B03): the values its `{{path}}`s hold with the row as
 * the entry they sit on, and the paths that name nothing. The record answers it when `get` is asked `values: true`, and
 * the screen draws each document with `resolverOf` over its own (`row-values.ts`). On every read of a row that is there,
 * empty where no document holds a path, so a `Got` without it is a write's answer, which carries the row alone.
 */
export type Docs = Record<string, DocValues>;

/** The row's documents' values off a `get` answered with `values: true`, empty where it carried none. */
function docsOf(row: RecordRow | null): Docs {
  const docs = row === null ? undefined : (row as RecordRow & { docs?: unknown }).docs;
  return docs !== null && typeof docs === 'object' && !Array.isArray(docs) ? (docs as Docs) : {};
}

/**
 * WHO A PERSON'S OR AN ORGANISATION'S ROW SAYS THEY ARE, beyond its fields, in words a person reads: where they were
 * met (`seen`, from the `met` lines, `names.ts` `seenIn`), the organisation they belong to by its name, whether the row
 * is the record's own person (`self`), and on that row alone the addresses and handles it is known by.
 *
 * `folded` ON `Got` IS THE NUMBER THAT WAS ASKED FOR when it named a row merged into another: the answer is the kept
 * row, and the page moves its address to the kept row's number rather than draw the folded one.
 */
export type Person = {
  seen: string[];
  org: { register: string; seq: number; name: string } | null;
  self: boolean;
  identities: string[];
};

/** The fields a person's or an organisation's list keeps who they are in, each where the list has one. */
type PersonParts = { met?: string; merged_into?: string; org?: string; self?: string; email?: string; keys?: string; handles?: string; aliases?: string };

/**
 * THE PARTS OF A LIST THAT KEEPS PEOPLE OR ORGANISATIONS, by the role it declares (`meets:` on People, `org:` on
 * Organisations, `roles.ts` in the kernel) and else by the parts' own names, as the kernel reads a list older than the
 * key. A part is taken only where the list has a field of the right kind, so a `self` that is text is no marker.
 * `null` for any other list, which costs nothing more than it did.
 */
function partsOf(register: string): PersonParts | null {
  const decl = REGISTERS[register];
  if (!decl) return null;
  const role: Readonly<Record<string, unknown>> | undefined = [decl.meets, decl.org].find((r) => r !== null && typeof r === 'object' && !Array.isArray(r));
  const field = (part: keyof PersonParts, fits: (f: { type: string; of?: string; to?: string }) => boolean): string | undefined => {
    const id = typeof role?.[part] === 'string' ? (role[part] as string) : part;
    const f = decl.fields.find((x) => x.id === id) as { type: string; of?: string; to?: string } | undefined;
    return f && fits(f) ? id : undefined;
  };
  const textList = (f: { type: string; of?: string }) => f.type === 'list' && (f.of === undefined || f.of === 'text');
  const parts: PersonParts = {};
  const set = (part: keyof PersonParts, id: string | undefined) => {
    if (id !== undefined) parts[part] = id;
  };
  set('met', field('met', textList));
  set('merged_into', field('merged_into', (f) => f.type === 'ref' && f.to === register));
  set('org', field('org', (f) => f.type === 'ref' && typeof f.to === 'string' && f.to !== register));
  set('self', field('self', (f) => f.type === 'bool'));
  set('email', field('email', (f) => f.type === 'email' || f.type === 'text'));
  set('keys', field('keys', textList));
  set('handles', field('handles', textList));
  set('aliases', field('aliases', textList));
  return role !== undefined || parts.met !== undefined || parts.merged_into !== undefined ? parts : null;
}

/** A row id a ref holds, or `null`: an empty ref and anything that is not one are no row. */
const idIn = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** How many merges are followed from the row asked for to the one kept. A merge points at a live row, so one is usual. */
const FOLDS_MOST = 8;

/** The person facts for one row, from its own fields and the names its refs were walked for. */
function personOf(parts: PersonParts, fields: Record<string, unknown>, refs: ReadonlyMap<string, RefMap>, register: string): Person {
  const at = (part: keyof PersonParts): unknown => (parts[part] === undefined ? undefined : fields[parts[part]!]);
  const self = at('self') === true;
  const org = ((): Person['org'] => {
    const id = idIn(at('org'));
    const to = parts.org === undefined ? undefined : (REGISTERS[register]?.fields.find((f) => f.id === parts.org) as { to?: string } | undefined)?.to;
    const map = to === undefined ? undefined : refs.get(to);
    const seq = id === null ? undefined : map?.seqOf.get(id);
    const name = seq === undefined ? undefined : map?.titleOf.get(seq);
    /* AN ORGANISATION THE WALK DID NOT NAME IS LEFT OUT, never drawn as the id the ref holds. */
    return to !== undefined && seq !== undefined && name !== undefined && name.trim() !== '' ? { register: to, seq, name } : null;
  })();
  return {
    seen: seenIn(Array.isArray(at('met')) ? (at('met') as unknown[]) : []),
    org,
    self,
    identities: self ? identitiesOf({ email: at('email'), keys: at('keys'), handles: at('handles'), aliases: at('aliases') }) : [],
  };
}

function missed(out: object): Got {
  if (!('refusal' in out)) return { from: 'refused', fix: 'The row changed while it was being read.' };
  return { from: 'refused', fix: (out.refusal as { fix: string }).fix };
}

export type RowReader = {
  read(register: string, seq: number): Promise<Got>;
  /** What the row's documents read now, for a screen whose row a write has just answered without them. */
  docs(register: string, seq: number): Promise<Docs>;
};

/**
 * A row reader for one tab.
 *
 * A REF ARRIVES AS THE TARGET ROW'S ULID, and the page draws it by number, so each register a ref
 * points at is walked once and kept, the way the list keeps its maps. A register this reader may
 * not list is left out, and its refs draw as the id they arrived as rather than as a wrong name.
 */
export function rowReader(base: string, io?: Fetch): RowReader {
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

  return {
    async read(register, seq) {
      /* A PENDING ROW HAS NO NUMBER THE RECORD COULD HOLD, so nothing is asked: the record holds no row for it, and the
         page draws the tab's own row from `pending` instead. */
      if (!Number.isInteger(seq) || seq < 1) return { from: 'live', entry: null, names: new Map() };
      /* WITH THE VALUES ITS DOCUMENTS READ (`values: true`), so a note's `{{blockers.count}}` is answered on this screen
         as it is on the project page. One read, not a second call per document. */
      const got = await client.call<unknown>('get', { register, seq, values: true });
      if (!got.ok) return missed(got);
      /* A USE CASE'S OWN LISTS ARE DECLARED BY THE RECORD ALONE, AND THE ROW'S LIST IS LEARNED WHETHER OR NOT THE ROW IS
         THERE. This `learn` used to sit below the line under it, and a missing row therefore left `REGISTERS[register]`
         empty, which is the one thing the row page reads to name the list. So `/r/courses/9999` on a student record
         answered "There is no list called courses." under a button reading "Back to courses", with `courses` in the rail
         holding rows: the sentence and the button contradicted each other, and the likely reading was that the list had
         been destroyed. `/r/session/9999` was always right ("There is no run #9999.") only because `session` ships in the
         bundle and never needed asking. One schema call, answered once per tab, buys every register that sentence.

         It stays below `get` rather than above it, because a row that IS there needs the declaration just as much and
         pays for it in the same place, and a pending row pays for neither. */
      await learn(client.schema, register, asked);
      /* NO REF WALK FOR A ROW THAT IS NOT THERE: there are no fields to draw, so paging a 400-row target register would
         name refs nobody is going to read.

         COUNTED AGAINST A REAL KERNEL over `node:sqlite`, on the shape it was found on (a `Courses` list with one `ref` field,
         a `Teachers` list holding 400 rows), at the foot of `row-live.test.ts`:

             a row that is there     get, schema courses, schema teachers, list teachers    400 rows back
             a row that is not       get, schema courses                                      0 rows back

         So this line is worth two of the four calls and the whole 400-row page, on the one read where every one of them
         is spent naming refs the screen has already decided not to draw. Removing it was measured, not assumed: the
         absent row then makes all four calls and carries the 400 rows. */
      const parts = partsOf(register);
      /* A ROW MERGED INTO ANOTHER IS NEVER DRAWN: the kept row is, and `folded` says which number was asked for. Only on
         a list that keeps people or organisations, so every other list's absent row costs what it did. */
      const kept = parts?.merged_into === undefined ? undefined : await keptOf(register, seq, (got.value as RecordRow | null) ?? null, parts.merged_into);
      const row = kept === undefined ? ((got.value as RecordRow | null) ?? null) : kept;
      if (row === null) return { from: 'live', entry: null, names: new Map() };
      /* Each target walked before the row is turned into an `Entry`, so a ref is drawn as the row's name, not `courses#1`. */
      const refs = new Map<string, RefMap>();
      for (const target of targetsOf(register)) {
        const map = await mapOf(target);
        if (map) refs.set(target, map);
      }
      const docs = docsOf(row);
      return {
        from: 'live',
        entry: entryOf(register, row, refs),
        names: namesOf(refs),
        ...(parts === null ? {} : { person: personOf(parts, row.fields, refs, register) }),
        ...(kept !== undefined && kept !== null && kept.seq !== seq ? { folded: seq } : {}),
        docs,
      };
    },

    async docs(register, seq) {
      if (!Number.isInteger(seq) || seq < 1) return {};
      const got = await client.call<unknown>('get', { register, seq, values: true });
      return got.ok ? docsOf((got.value as RecordRow | null) ?? null) : {};
    },
  };

  /** One row of a list by one of the record's own fields, deleted or not, or `null`. */
  async function oneWhere(register: string, field: 'id' | 'seq', is: string | number): Promise<(RecordRow & { deleted_at?: string | null }) | null> {
    const out = await client.list({ register, where: { field, is }, includeDeleted: true, limit: 1 });
    return out.ok ? ((out.value.rows[0] as (RecordRow & { deleted_at?: string | null }) | undefined) ?? null) : null;
  }

  /**
   * THE ROW A FOLDED ONE WAS MERGED INTO, followed to the end: the kept row whole, `null` where the trail ends in no live
   * row (a loop, a row erased since, a merge into a row this reader cannot see), or `undefined` where the row asked for
   * was not merged at all and is drawn, or not, as it was.
   *
   * A MERGE DELETES THE FOLDED ROW (`people.ts` in the kernel), so `get` answers nothing for it and the record's deleted
   * rows are asked for that one number. Its `merged_into` names the kept row by id.
   *
   * A LIVE ROW IS NEVER HIDDEN BY A TRAIL THAT GOES NOWHERE. A merge deletes the row it folds, so a live row still naming
   * another (itself, a row erased since, one this reader cannot see) is a stale field, and the row is drawn as itself.
   */
  async function keptOf(register: string, seq: number, row: RecordRow | null, field: string): Promise<RecordRow | null | undefined> {
    const kept = await trailOf(register, seq, row, field);
    return kept === null && row !== null ? undefined : kept;
  }

  async function trailOf(register: string, seq: number, row: RecordRow | null, field: string): Promise<RecordRow | null | undefined> {
    const at = row ?? (await oneWhere(register, 'seq', seq));
    let next = at === null ? null : idIn(at.fields[field]);
    if (at === null || next === null) return undefined;
    const seen = new Set([at.id]);
    for (let hop = 0; hop < FOLDS_MOST && next !== null; hop++) {
      if (seen.has(next)) return null;
      seen.add(next);
      const kept = await oneWhere(register, 'id', next);
      if (kept === null) return null;
      next = idIn(kept.fields[field]);
      if (next !== null) continue;
      if ((kept.deleted_at ?? null) !== null || kept.seq === null) return null;
      const whole = await client.call<unknown>('get', { register, seq: kept.seq, values: true });
      return whole.ok && whole.value !== null ? (whole.value as RecordRow) : null;
    }
    return null;
  }
}
