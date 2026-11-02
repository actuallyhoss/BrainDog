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

import { PAGE, REGISTERS, sortRows } from '../record/api.ts';
import { readBoot, type Booted } from '../record/boot-live.ts';
import { declOf, entryOf, learn, namesOf, orderOf, refMapOf, targetsOf, unreadRefs, whereFor, withoutUnread, type Names, type RecordRow, type RefMap } from '../record/remote.ts';
import type { Entry, Filter, RegisterDecl } from '../record/schema.ts';
import { closed, opened } from '../ui/screen.svelte.ts';
import { labels, relabel } from '../voice.ts';
import { apiBase } from '../at.ts';
import { rowsSaid } from './ref-rows.ts';

export type { Boot };

/** A refusal as this screen reads one. The record's own shape, and only the keys drawn from it. */
export type Refusal = { code: string; fix: string; allowed?: readonly string[] | undefined };

/** An answer: a value, or a refusal. A conflict cannot reach a read, and is read as a refusal. */
export type Said<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/**
 * What the list is asked: the chips, the box and the order, exactly as the address carries them.
 *
 * `join` IS THE ADDRESS WORD `join=any` (`joinOf` in `api.ts`): the chips joined by "or" rather than
 * "and". Absent is "and", which is every address written before the word existed. `whereFor` reads it
 * into the `where` the record is asked, so one link opens one set of rows for whoever opens it.
 */
export type Ask = {
  filters: readonly Filter[];
  q: string;
  sort?: { field: string; dir: 'asc' | 'desc' } | undefined;
  join?: 'any' | undefined;
};

/**
 * One page of the answer, and where the next one starts. `matched` is the whole answer's size.
 *
 * `names` IS WHAT THIS RECORD CALLS THE ROWS THESE ONES POINT AT, read in the same walk that turns a
 * stored id into a number. It was `null` where the in-browser sample drew the list out of its own rows;
 * the sample is gone, so every answer carries the record's names.
 */
export type Answer = { entries: Entry[]; matched: number; cursor: string | null; names: Names };

/** Where this tab's list comes from. One code path on the screen, whichever this is. */
export type Source = {
  boot(): Promise<Said<Boot>>;
  schema(register: string): Promise<Said<RegisterDecl>>;
  page(register: string, ask: Ask, cursor: string | null): Promise<Said<Answer>>;
  /** How many rows answer, and nothing else. */
  count(register: string, ask: Ask): Promise<Said<number>>;
  /**
   * How many of the answer's entries hold each of `values` in the field `by`: one pill strip's counts, in one request.
   * `ask` is the list's question without that field's own chip, which is what a pill's count is counted under. ITS
   * CHIPS ARE READ AS "and" WHATEVER `join` SAYS: a count by value is a count inside one set of entries, and a screen
   * whose chips are joined by "or" hands over the search alone (`countAll` on the list screen).
   */
  counts(register: string, ask: Ask, by: string, values: readonly string[]): Promise<Said<Map<string, number>>>;
};

/** The record's `countBy`, as much of its answer as a pill reads. */
export type Counter = (args: { register: string; by: string; where?: unknown }) => Promise<
  { ok: true; value: unknown } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown }
>;

/**
 * One field's counts for a strip of pills, from ONE question where the record answers it.
 *
 * A STRIP OF PILLS ASKED ONCE A PILL. Each count was its own `list` with `limit: 1`, read for its `matched`, so a list
 * with a dozen values sent a dozen requests before the screen settled. The record's `countBy` answers every value of a
 * field under one `where`, and the answer is the list's own count, so a pill that says 12 opens a list that says 12.
 *
 * A HOST THAT HAS NO SUCH METHOD IS COUNTED THE OLD WAY, a pill at a time through `one`: `counter` is absent when the
 * client this build carries does not name it, a host a version behind refuses it `ROUTE_UNKNOWN`, and a host built
 * over a record without the method refuses it `NOT_IN_THIS_BUILD`. Any other refusal is the record's answer about this
 * question and is handed back as it came.
 *
 * EVERY VALUE ASKED FOR IS ANSWERED, WITH 0 ONLY WHERE NOTHING HOLDS IT. The record lists the values it found, and a
 * pill with no entries still prints its number; but it lists only its fifty most common and says the rest as `more`,
 * and a walk that stopped early says `capped`, with counts that are then only what it reached. So a 0 is written only
 * when the answer was whole. With `more`, a value asked for and not listed is asked on its own through `one`, the
 * list's own count; with `capped`, every value is, since none of the counts can be trusted to open a list that size.
 * A value that is not text (an empty field's `null`) has no pill.
 */
export async function countsOf(
  counter: Counter | undefined,
  one: (value: string) => Promise<Said<number>>,
  register: string,
  where: unknown,
  by: string,
  values: readonly string[],
): Promise<Said<Map<string, number>> & { absent?: true }> {
  const out = new Map<string, number>(values.map((v) => [v, 0]));
  /** Each of `asked` counted on its own, into `out`; the first refusal, or nothing. */
  const singly = async (asked: readonly string[]): Promise<Exclude<Said<number>, { ok: true }> | undefined> => {
    const each = await Promise.all(asked.map(async (v) => [v, await one(v)] as const));
    for (const [v, n] of each) {
      if (!n.ok) return n;
      out.set(v, n.value);
    }
    return undefined;
  };
  if (counter) {
    const got = said(await counter({ register, by, ...(where === undefined ? {} : { where }) }));
    if (got.ok) {
      const answer = got.value as { counts?: { value: unknown; n: number }[]; more?: unknown; capped?: unknown } | null;
      const listed = new Set<string>();
      if (answer?.capped !== true)
        for (const c of answer?.counts ?? [])
          if (typeof c.value === 'string' && out.has(c.value)) {
            out.set(c.value, c.n);
            listed.add(c.value);
          }
      /* WHOLE: every value not listed is held by nothing. Otherwise the ones not listed are asked one at a time. */
      const unsaid = answer?.capped === true || answer?.more !== undefined ? values.filter((v) => !listed.has(v)) : [];
      const refused = await singly(unsaid);
      return refused ?? { ok: true, value: out };
    }
    if (got.refusal.code !== 'ROUTE_UNKNOWN' && got.refusal.code !== 'NOT_IN_THIS_BUILD') return got;
  }
  const refused = await singly(values);
  if (refused) return refused;
  /* `absent` SAYS THE HOST REFUSED THE METHOD, so its caller stops asking it for the life of the tab's source. */
  return { ok: true, value: out, ...(counter ? { absent: true as const } : {}) };
}

/** A bar's counts: each field the record counted, and the refusal of any it would not. */
export type Tally = { counts: Map<string, Map<string, number>>; withheld: Refusal | null };

/**
 * Every field's answer from `counts`, as a strip of pills draws it.
 *
 * A REFUSED COUNT IS NOT A COUNT OF NOUGHT. A field the record would not count was filled with a 0 for each of its
 * values, so a person the record does not count for read "Open 0, Paid 0" over a list that opened full. A count
 * nobody can trust is worse than none: a refused field has NO entry here, which a pill reads as no number at all, and
 * the first refusal is handed on as `withheld` so the screen can say in a line why the numbers are missing.
 */
export function tally(answers: readonly (readonly [field: string, said: Said<Map<string, number>>])[]): Tally {
  const out: Tally = { counts: new Map(), withheld: null };
  for (const [field, said] of answers) {
    if (said.ok) out.counts.set(field, said.value);
    else out.withheld ??= said.refusal;
  }
  return out;
}

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

/**
 * A `where` as the list route carries it: a tree as itself, and a sentence as the JSON text of the sentence.
 *
 * THE ROUTE DECODES `where` AS JSON (`takes` in `packages/host/src/index.ts`), because a tree has to survive a query
 * string, and the client writes a string into the address as the characters it holds. So `state is open`, sent bare,
 * would reach the route as text that does not parse and be refused `VALUE_MALFORMED` before the record saw a sentence
 * it reads. Handed to the client as an object whose JSON is the string, the sentence goes out as `"state is open"` in
 * an address and as a string in a body, and the route decodes the one string the record's `list` takes
 * (`Predicate | string`).
 */
const carried = (where: string | Record<string, unknown>): unknown => (typeof where === 'string' ? { toJSON: () => where } : where);

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
 * ordered it. The record orders the stored value, so a ref sorts by its ULID; `sortRows` orders what the
 * cell shows, by name. Text, money and an enum's labels follow one rule in both. When the page holds
 * every row there is nothing the second order can get wrong. When it does not, re-sorting one page
 * would disagree with the pages either side of it, so the record's order is the one drawn.
 */
function remote(client: ReturnType<typeof createClient>, booted: Boot): Source {
  const declared = new Map<string, RegisterDecl>();
  const maps = new Map<string, Promise<Said<RefMap>>>();
  const asked = new Map<string, Promise<void>>();
  /* ONE `schema` PER LIST FOR THE LIFE OF THIS SOURCE, whichever of the screen and the ref walk asks first. */
  const answers = new Map<string, ReturnType<typeof client.schema>>();
  const schemaOf = (register: string): ReturnType<typeof client.schema> => {
    let out = answers.get(register);
    if (!out) answers.set(register, (out = client.schema(register)));
    return out;
  };

  /** One register's rows by ULID, walked to the end of its cursor. Kept once whole.
      THE WALK ITSELF IS KEPT, NOT ONLY ITS ANSWER: every cell of a list asks for the same map while the first walk is
      still out, and each used to start its own. A refusal is dropped so the next ask tries again. */
  function refMap(register: string): Promise<Said<RefMap>> {
    let kept = maps.get(register);
    if (!kept) {
      maps.set(register, (kept = walk(register)));
      /* ONLY WHILE IT IS OUT (audit 31 Oct n, AN18): the tab's walk keeps itself and asks again after a write this tab
         sent, and a map kept here past it named a person the Orders box had just made "Unnamed person" on every read
         of the list until the page was opened again. A map is made once per walk (`mapsOf`). */
      void kept.finally(() => maps.delete(register));
    }
    return kept;
  }

  /** Each walk's map, by the walk's own rows: a walk the tab kept answers the map made of it. */
  const mapsOf = new WeakMap<readonly RecordRow[], RefMap>();

  async function walk(register: string): Promise<Said<RefMap>> {
    /* A LIST THIS BUILD DOES NOT SHIP IS DECLARED FIRST, or `refMapOf` finds no title to name its rows by and every ref
       into it is drawn as `club_books#2`. */
    await learn(schemaOf, register, asked);
    /* THE TAB'S WALK (`ref-rows.ts`), which every other reader shares, and the record's refusal where it would not. */
    const out = await rowsSaid(client, apiBase(), register);
    if (!out.ok) return out;
    let map = mapsOf.get(out.rows);
    if (map === undefined) mapsOf.set(out.rows, (map = refMapOf(register, out.rows)));
    return { ok: true, value: map };
  }

  /**
   * WHAT IS FINISHED GOES TO THE FOOT WHERE NOBODY CHOSE AN ORDER (pages pass, 2 Nov): a retired skill stood first on
   * Skills and a superseded learning second on Learnings, over the ones in use. The rows in a state the list declares
   * done (`done`) keep their order among themselves, after every other row. Only over a whole list, since one page of
   * many cannot know what the next one holds; a sort somebody picked is never touched.
   */
  function doneLast(register: string, entries: Entry[]): Entry[] {
    const decl = REGISTERS[register];
    const state = decl?.state;
    const done = new Set(decl?.done ?? []);
    if (!state || done.size === 0) return entries;
    const isDone = (e: Entry): boolean => typeof e.fields[state] === 'string' && done.has(e.fields[state] as string);
    return entries.some(isDone) ? [...entries.filter((e) => !isDone(e)), ...entries.filter(isDone)] : entries;
  }

  async function refsFor(register: string): Promise<Said<Map<string, RefMap>>> {
    const out = new Map<string, RefMap>();
    /* THE LIST'S OWN DECLARATION FIRST (pages pass, 2 Nov): `targetsOf` reads the fields this tab has learnt, and on a
       first open of a list this build does not ship (an add-on's Skills) it had learnt none, so no list was walked, the
       answer named nothing and every project in "Where it applies" was drawn as "A project". */
    await learn(schemaOf, register, asked);
    for (const target of targetsOf(register)) {
      const map = await refMap(target);
      /* A LIST THIS PERSON MAY NOT READ IS NO NAMES, NOT NO LIST. A guest shared Kiln's tasks is refused People, which
         a task's owner points at, and that refusal drew "This screen did not load" over the tasks she was shared. Its
         refs are left out of the entry (`withoutUnread`), never drawn as the ids they arrive as. */
      if (!map.ok && map.refusal.code === 'FORBIDDEN') continue;
      if (!map.ok) return map;
      out.set(target, map.value);
    }
    return { ok: true, value: out };
  }

  async function ask(register: string, a: Ask, cursor: string | null, limit: number): Promise<Said<Answer>> {
    const refs = await refsFor(register);
    if (!refs.ok) return refs;
    /* THE CHIPS AS THEIR SENTENCE, which the record parses, or the tree when the box holds words (`whereFor`). */
    const where = whereFor(register, a.filters, a.q, refs.value, a.join);
    const order = orderOf(a.sort);
    const out = said(
      await client.list({
        register,
        limit,
        ...(where === undefined ? {} : { where: carried(where) }),
        ...(cursor === null ? {} : { cursor }),
        ...(order === undefined ? {} : { order }),
      }),
    );
    if (!out.ok) return out;
    const rows = out.value.rows as RecordRow[];
    const unread = unreadRefs(register, refs.value);
    let entries = rows.map((r) => withoutUnread(entryOf(register, r, refs.value), unread));
    const names = namesOf(refs.value);
    if (a.sort && out.value.cursor === null && entries.length === out.value.matched)
      entries = sortRows(register, entries, a.sort.field, a.sort.dir, names);
    else if (!a.sort && out.value.cursor === null && entries.length === out.value.matched) entries = doneLast(register, entries);
    return { ok: true, value: { entries, matched: out.value.matched, cursor: out.value.cursor, names } };
  }

  /* ONE ROW, BECAUSE ONLY THE COUNT IS READ. `matched` is the whole answer's size whatever the
     page holds, and a page of one is the smallest the record will send. */
  async function count(register: string, a: Ask): Promise<Said<number>> {
    const out = await ask(register, { filters: a.filters, q: a.q, join: a.join }, null, 1);
    return out.ok ? { ok: true, value: out.value.matched } : out;
  }

  /* `countBy` WHERE THIS BUILD'S CLIENT NAMES IT, read off the client and not assumed: the route and the client's
     method are the host's and the client's to add, and until both are in, the pills are counted one at a time. */
  let counter = (client as unknown as { countBy?: Counter }).countBy;

  return {
    boot: async () => ({ ok: true, value: booted }),
    /* THE RECORD'S OWN WORDS OVER THE DECLARATION'S: a use case's labels for this list,
       its fields and its states, drawn at every read so a label changed at `/packs` shows on the next boot. */
    async schema(register) {
      const kept = declared.get(register);
      if (kept) return { ok: true, value: relabel(kept, labels()) };
      /* AND KEPT IN `REGISTERS` THROUGH `learn`, because every cell is formatted through `display` and RowForm draws
         `readableFields`, and both read the list from there. A use case's list drew a datapoint's When as the raw instant,
         and this once skipped any list the build ships, so a list screen opened first in a tab drew the bundle's RowForm
         with no field added at run time on it (`field-added.test.ts`).

         `learn` IS WHAT SENDS THE QUESTION, BEFORE ANYTHING IS AWAITED, so its ticket is taken when the question goes out.
         This awaited the answer first and called `learn` after, which handed it the cached, older promise under a newer
         ticket: a question sent before an add and answered after it outranked the add's own and put Projects back without
         the added field, and the next boot kept that. `schemaOf` then
         hands back the promise `learn` just sent, so the list is still asked once. */
      const learnt = learn(schemaOf, register, asked);
      const out = said(await schemaOf(register));
      await learnt;
      if (!out.ok) return out;
      const decl = declOf(out.value as RegisterDecl);
      declared.set(register, decl);
      return { ok: true, value: relabel(decl, labels()) };
    },
    page: (register, a, cursor) => ask(register, a, cursor, PAGE),
    count,
    async counts(register, a, by, values) {
      const refs = await refsFor(register);
      if (!refs.ok) return refs;
      /* THE LIST'S OWN `where`, built by the one function the list is asked through, so the two cannot disagree. */
      const where = whereFor(register, a.filters, a.q, refs.value);
      const one = (value: string) => count(register, { filters: [...a.filters, { field: by, op: 'in', values: [value] }], q: a.q });
      const out = await countsOf(counter, one, register, where === undefined ? undefined : carried(where), by, values);
      if (out.ok && out.absent) counter = undefined;
      return out.ok ? { ok: true, value: out.value } : out;
    },
  };
}

/** Every call answering the one refusal `boot` gave, so the screen draws it rather than guessing. */
const refusing = (refusal: Refusal): Source => {
  const no = async <T>(): Promise<Said<T>> => ({ ok: false, refusal });
  return { boot: no, schema: no, page: no, count: no, counts: no };
};

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
  const from = readBoot(apiBase());
  if (chosen?.from !== from) {
    chosen = {
      from,
      source: (async (): Promise<Source> => {
        const booted = await from;
        if (booted.from === 'live') return remote(createClient({ base: apiBase() }), booted.boot);
        /* A refusal is not kept by `readBoot` either, so the next screen asks the record again and
           lands here with a different promise in hand. */
        return refusing({ code: booted.code, fix: booted.fix });
      })(),
    };
  }
  return chosen.source;
}
