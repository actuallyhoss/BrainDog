/**
 * The record, for the one screen that reads it: `/r/[register]`.
 *
 * A ROUTE-ONLY MODULE, AND THE BUNDLE IS WHY. `@braindog/client` carries the route table as a value,
 * so anything that imports this file carries the table too. Only the register route does, which puts
 * both in that route's chunk and leaves the entry chunk where it was. `call.ts` next door is already
 * reachable from the root error page, so it could not be the home for this.
 *
 * NO RUNES. What the screen holds is the screen's; this file holds what one tab has learnt about the
 * record: the answer to `boot`, each register's declaration, and the ULID-to-number maps, each kept
 * only once it has come back ok.
 */

import { createClient, type Boot } from '@braindog/client';

import { heldBy, list, NOW, PAGE, REGISTERS, sortRows } from '../record/api.ts';
import { readBoot, type Booted } from '../record/boot-live.ts';
import { entryOf, namesOf, orderOf, refMapOf, targetsOf, treeOf, type Names, type RecordRow, type RefMap } from '../record/remote.ts';
import type { Entry, Filter, RegisterDecl } from '../record/schema.ts';
import { closed, opened } from '../ui/screen.svelte.ts';

export type { Boot };

/** A refusal as this screen reads one. The record's own shape, and only the keys drawn from it. */
export type Refusal = { code: string; fix: string; allowed?: readonly string[] | undefined };

/** An answer: a value, or a refusal. A conflict cannot reach a read, and is read as a refusal. */
export type Said<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/** What the list is asked: the chips, the box and the order, exactly as the address carries them. */
export type Ask = {
  filters: readonly Filter[];
  q: string;
  sort?: { field: string; dir: 'asc' | 'desc' } | undefined;
};

/**
 * One page of the answer, and where the next one starts. `matched` is the whole answer's size.
 *
 * `names` IS WHAT THIS RECORD CALLS THE ROWS THESE ONES POINT AT, and `null` is the sample saying it
 * has none to give: the screen then draws a ref the way it always did, out of the sample's own rows.
 */
export type Answer = { entries: Entry[]; matched: number; cursor: string | null; names: Names | null };

/** Where this tab's list comes from. One code path on the screen, whichever this is. */
export type Source = {
  /** True while this tab is drawing the in-browser sample. See `open`. */
  sample: boolean;
  boot(): Promise<Said<Boot>>;
  schema(register: string): Promise<Said<RegisterDecl>>;
  page(register: string, ask: Ask, cursor: string | null): Promise<Said<Answer>>;
  /** How many rows answer, and nothing else: the pills' counts. */
  count(register: string, ask: Ask): Promise<Said<number>>;
};

/**
 * A call the screen is waiting on, bracketed by its readiness counters.
 *
 * THE BRACKET GOES ROUND A WHOLE SEQUENCE, NOT ROUND EACH REQUEST. `data-screen` appears the moment
 * nothing is out, so a screen that closed `schema` before it opened `list` would say `ready` for the
 * one frame between them, over a page with no rows on it, which is the exact frame a gate measures.
 *
 * `work` DRAWS WHAT CAME BACK AND ANSWERS WHETHER IT WAS THE ANSWER, and `false` records a refusal.
 * The screen number comes back from `opened()`, so an answer that lands after a navigation is not
 * counted against the next screen.
 */
export async function read(work: () => Promise<boolean>): Promise<void> {
  const at = opened();
  let ok = false;
  try {
    ok = await work();
  } finally {
    closed(ok, at);
  }
}

/** The client's three-armed `Result`, as the two arms a read can have. */
function said<T>(r: { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown }): Said<T> {
  if (r.ok) return r;
  return 'refusal' in r
    ? { ok: false, refusal: r.refusal }
    : { ok: false, refusal: { code: 'VERSION_STALE', fix: 'The row changed while it was being read.' } };
}

/**
 * The record over HTTP, from this page's own origin, with no token: `50 §1`, the app never holds one.
 *
 * IT PAGES IN THE RECORD'S ORDER, newest first, with the record's keyset cursor. A SORTED LIST PAGES
 * TOO: the record hands back a `~` cursor that belongs to the order it was asked, and refuses it under
 * any other, so the next page is asked with the same cursor and the same order, and its rows are drawn
 * in the order they came.
 *
 * AND A SORTED ANSWER THAT IS WHOLE ON ITS FIRST PAGE IS ORDERED HERE, the way this screen has always
 * ordered it. The record orders the stored value, so a ref sorts by its ULID and text by its bytes;
 * `sortRows` orders what the cell shows, by name and in the reader's collation. When the page holds
 * every row there is nothing the second order can get wrong. When it does not, re-sorting one page
 * would disagree with the pages either side of it, so the record's order is the one drawn.
 */
function remote(client: ReturnType<typeof createClient>, booted: Boot): Source {
  const declared = new Map<string, RegisterDecl>();
  const maps = new Map<string, RefMap>();

  /** One register's rows by ULID, walked to the end of its cursor. Kept once whole. */
  async function refMap(register: string): Promise<Said<RefMap>> {
    const kept = maps.get(register);
    if (kept) return { ok: true, value: kept };
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out: Said<{ rows: unknown[]; cursor: string | null }> = said(
        await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) }),
      );
      if (!out.ok) return out;
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return { ok: true, value: map };
  }

  async function refsFor(register: string): Promise<Said<Map<string, RefMap>>> {
    const out = new Map<string, RefMap>();
    for (const target of targetsOf(register)) {
      const map = await refMap(target);
      if (!map.ok) return map;
      out.set(target, map.value);
    }
    return { ok: true, value: out };
  }

  async function ask(register: string, a: Ask, cursor: string | null, limit: number): Promise<Said<Answer>> {
    const refs = await refsFor(register);
    if (!refs.ok) return refs;
    const where = treeOf(register, a.filters, a.q, refs.value);
    const order = orderOf(a.sort);
    const out = said(
      await client.list({
        register,
        limit,
        ...(where === undefined ? {} : { where }),
        ...(cursor === null ? {} : { cursor }),
        ...(order === undefined ? {} : { order }),
      }),
    );
    if (!out.ok) return out;
    const rows = out.value.rows as RecordRow[];
    let entries = rows.map((r) => entryOf(register, r, refs.value));
    if (a.sort && out.value.cursor === null && entries.length === out.value.matched)
      entries = sortRows(register, entries, a.sort.field, a.sort.dir);
    return { ok: true, value: { entries, matched: out.value.matched, cursor: out.value.cursor, names: namesOf(refs.value) } };
  }

  return {
    sample: false,
    boot: async () => ({ ok: true, value: booted }),
    async schema(register) {
      const kept = declared.get(register);
      if (kept) return { ok: true, value: kept };
      const out = said(await client.schema(register));
      if (!out.ok) return out;
      const decl = out.value as RegisterDecl;
      declared.set(register, decl);
      return { ok: true, value: decl };
    },
    page: (register, a, cursor) => ask(register, a, cursor, PAGE),
    async count(register, a) {
      /* ONE ROW, BECAUSE ONLY THE COUNT IS READ. `matched` is the whole answer's size whatever the
         page holds, and a page of one is the smallest the record will send. */
      const out = await ask(register, { filters: a.filters, q: a.q }, null, 1);
      return out.ok ? { ok: true, value: out.value.matched } : out;
    },
  };
}

/** Every call answering the one refusal `boot` gave, so the screen draws it rather than guessing. */
const refusing = (refusal: Refusal): Source => {
  const no = async <T>(): Promise<Said<T>> => ({ ok: false, refusal });
  return { sample: false, boot: no, schema: no, page: no, count: no };
};

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   THE SAMPLE, WHEN THERE IS NO RECORD TO READ. TEMPORARY, AND THIS IS THE ONE PLACE IT IS DECIDED.

   DELETE THIS BLOCK, `SAMPLE_WHEN` AND THE ONE LINE IN `open` THAT READS IT once the demo record is
   provisioned and the Worker's `DEMO_RECORD` is set, which is the day
   `curl -s https://app.brain.dog/api/boot` with no Authorization answers `"ok":true`. From then on a
   record that does not answer is a refusal on this screen like any other.

   UNTIL THEN THE PUBLIC DEMO MUST NOT BREAK. A static host answers `/api/boot` with its SPA
   fallback, which the client reads as `UNREACHABLE`, and the Worker with no `DEMO_RECORD` answers
   `UNAUTHORIZED`. Either one means there is no record this tab can read, so the list draws the
   in-browser sample it drew before, every other screen draws the same sample, and the screen says
   so in the sample bar's words rather than drawing an error.

   IT IS A SECOND IMPLEMENTATION ON THE ONE SCREEN MEANT TO BE EVIDENCE, and that is why it is
   fenced here rather than threaded through the route: the route has one code path, which is
   `Source`, and does not know which one it was handed except to say so.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

const ok = <T>(value: T): Said<T> => ({ ok: true, value });

const SAMPLE: Source = {
  sample: true,
  boot: async () =>
    ok({
      registers: Object.values(REGISTERS).map((r) => ({ id: r.id, name: r.name, count: heldBy(r.id) })),
      now: new Date(NOW).toISOString(),
    }),
  schema: async (register) => {
    const decl = REGISTERS[register];
    return decl
      ? ok(decl)
      : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.`, allowed: Object.keys(REGISTERS) } };
  },
  page: async (register, a, cursor) => {
    const out = list(register, {
      filters: [...a.filters],
      q: a.q,
      ...(a.sort ? { sort: a.sort } : {}),
      limit: PAGE,
      ...(cursor === null ? {} : { cursor }),
    });
    return ok({ entries: out.entries, matched: out.matched, cursor: out.cursor, names: null });
  },
  count: async (register, a) => ok(list(register, { filters: [...a.filters], q: a.q }).matched),
};

/* ───────────────────────────────────── end of the sample ───────────────────────────────────── */

/** The source this tab reads, beside the answer it was built from. See `open`. */
let chosen: { from: Promise<Booted>; source: Promise<Source> } | null = null;

/**
 * Which source this tab reads, taken from the shell's own answer to `boot`.
 *
 * THERE IS SOMETHING WORTH KEEPING HERE, WHICH IS WHY THIS IS A MEMO AT ALL. `remote` walks a
 * register to the end of its cursor to learn what the refs on a list point at, and keeps each
 * declaration it has read; rebuilding it per call would pay for every row of the target list again
 * on every page, count and filter. So the source is held.
 *
 * IT WAS HELD FOR THE WHOLE LIFE OF THE TAB, AND THAT IS THE BUG THIS SHAPE FIXES. `forget()` drops
 * `boot-live.ts`'s kept answer after a write, and could not reach this one: a tab that read the
 * sample once went on drawing the sample on `/r/<register>` for as long as it was open, even after
 * the record had become reachable. That is the same disagreement `/start` had, standing still
 * instead of arriving.
 *
 * KEYING THE MEMO ON THE ANSWER ITSELF IS WHAT PUTS IT RIGHT, rather than a second thing for
 * `forget()` to remember. `readBoot` hands back the same promise while its answer is kept and a new
 * one once it has been forgotten or refused, so this rebuilds exactly when the shell re-asks and
 * never otherwise. Nothing has to be cleared from anywhere else, which matters because the three
 * writers that call `forget()` do it from screens that may never have loaded this module.
 */
export function open(): Promise<Source> {
  /* THE SHELL'S OWN ANSWER, not a second probe. The layout asked `boot` before this screen drew, and
     `boot-live.ts` kept it for the tab under the same two refusals that mean there is no record. */
  const from = readBoot(location.origin);
  if (chosen?.from !== from) {
    chosen = {
      from,
      source: (async (): Promise<Source> => {
        const booted = await from;
        if (booted.from === 'live') return remote(createClient({ base: location.origin }), booted.boot);
        if (booted.from === 'sample') return SAMPLE;
        /* A refusal is not kept by `readBoot` either, so the next screen asks the record again and
           lands here with a different promise in hand. */
        return refusing({ code: booted.code, fix: booted.fix });
      })(),
    };
  }
  return chosen.source;
}
