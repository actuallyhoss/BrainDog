<!--
  A register: one typed collection, all of it.

  The grid is CSS grid with DECLARED column tracks, not a `<table>`, and that is a measured decision
  rather than a taste one. At 8 columns in Chrome 151, `<table>` layout scales superlinearly —
  26.9 / 59.6 / 149 / 318 / 790 ms across 500 / 1k / 2k / 5k / 10k rows — and `content-visibility`
  does not work on table rows, by spec and by measurement. Grid with chunked CV takes 5,000 rows to
  0.6 ms of layout (22 §4).

  No virtualisation at any size. Rows arrive in keyset pages into chunks, the DOM caps at 2,000 with
  a visible cap line, and the way past it is a filter or an export. Virtualisation breaks
  find-in-page, breaks the scrollbar as a position cue, and only HIDES the measured wall, which is
  DOM construction (13 §4.3).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { onDestroy, tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MISSING, symbolFigure, type Tone } from 'braindog-render';
  import { Table } from 'braindog-render/svelte';
  import { declaredValue } from '$lib/record/where.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import * as pref from '$lib/pref.ts';
  import { covered, silenced, typing as isTyping } from '$lib/a11y/keys.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { columnsFor, dirOf, display, DOM_CAP, iconFor, identityFor, identityOf, inheritedFrom, labelOf, noticed, PAGES, readableFields, toRows, unansweredBy, type Filter, whereOf } from '$lib/record/api.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import { joinNames, type Names } from '$lib/record/remote.ts';
  import { open, read, type Boot, type Refusal } from '$lib/data/record.ts';
  import { searchable } from '$lib/record/find.ts';
  import type { Entry, Fields, RegisterDecl } from '$lib/record/schema.ts';
  import { saidPlainly } from '$lib/record/blocks.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import RowCards from '$lib/ui/RowCards.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { CapLine } from 'braindog-render/svelte';
  import Second from '$lib/ui/Second.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import * as pending from '$lib/record/pending.svelte.ts';
  import { capturedFields, holdInPlace, rowWriter, type Held, type RowWriter, type Wrote } from '$lib/record/rows-write.ts';


  const id = $derived(page.params.register ?? '');

  /**
   * WHAT THE RECORD SAID: `boot` for the whole record, `schema` for this register, and a refusal
   * when it said no.
   *
   * THE DECLARATION IS HELD WITH THE REGISTER IT IS FOR. The component is reused across the
   * `[register]` parameter, so the address moves before the answer does; a declaration kept beside
   * its own register id is how the screen tells "the new list has not arrived" from "this is the
   * list", and draws the first as loading rather than as the old list under the new name.
   */
  let booted = $state<Boot | null>(null);
  let declared = $state<{ register: string; decl: RegisterDecl } | null>(null);
  let refusal = $state<Refusal | null>(null);
  const decl = $derived(declared?.register === id ? declared.decl : undefined);

  /**
   * THE RECORD'S INSTANT, which every tone and date band on this screen is measured from. It is the
   * record's and not the reader's: the seed is dated relative to one day, and a reader dating it
   * against their own clock would put every band some number of days out with nothing saying so.
   */
  const now = $derived(booted ? Date.parse(booted.now) : Date.now());

  /** Whether this list is the in-browser sample, because there is no record to read. See `open`. */
  let sample = $state(false);

  /* WHAT THE RECORD HAS NOTICED ABOUT THIS REGISTER, if anything crossed a threshold. It is derived
     from the register alone — not from the filters — because a pattern in thirty days of refusals
     is not a property of the rows currently on screen. */
  const seen = $derived(noticed(id));

  /* URL state: filters and the query define WHICH ROWS YOU ARE LOOKING AT, so they must be
     shareable. View options are about your eyes rather than the data and live in the cookie. */
  const q = $derived(page.url.searchParams.get('q') ?? '');
  const sortParam = $derived(page.url.searchParams.get('sort'));
  const sort = $derived.by(() => {
    const [field, dir] = (sortParam ?? '').split(':');
    return field ? { field, dir: (dir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' } : undefined;
  });
  const filters = $derived.by((): Filter[] =>
    page.url.searchParams.getAll('f').map((raw) => {
      const [field = '', op = 'is', values = ''] = raw.split(':');
      return { field, op, values: values.split(',') };
    }),
  );

  /* The columns actually drawn: the register's projection minus whatever the reader has hidden. */
  let createOpen = $state(false);

  /**
   * A LINK CAN ASK FOR THE FORM: `/r/obligations?new=1`.
   *
   * `19 §6` gives `no-data-yet` one action and it is **Add one**, and the surface where that state
   * is most often true is not this one — it is a declared page whose block draws a list nobody has
   * put anything in yet. A block cannot open a sheet that lives in another route, so the address
   * carries the intent and this reads it.
   *
   * IT IS IN THE URL AND NOT IN COMPONENT STATE because it arrives from outside the component;
   * `19 §5`'s rule is about where a fact belongs, and "somebody asked for the form" is a fact about
   * the request. Closing clears it, or the effect would reopen the sheet the moment it shut.
   */
  $effect(() => {
    if (page.url.searchParams.get('new') === '1') createOpen = true;
  });

  const closeCreate = () => {
    createOpen = false;
    if (page.url.searchParams.has('new')) setParam((p) => p.delete('new'));
  };
  /* WHAT THE FORM WOULD REFUSE, held here so the BUTTON can be disabled by it. Asking the form on
     click could only ever answer after the press. */
  let problems = $state<string[]>([]);
  /** What the sheet's form holds, so the submit can put the row somewhere rather than describing it. */
  let taken = $state<Fields>({});
  let displayOpen = $state(false);
  let bindOpen = $state(false);

  /**
   * Which columns this register shows, and it is PER REGISTER and PER READER.
   *
   * 50 §5.2 names it `prefs.columns[register]` — a view preference, not a declaration. The
   * difference matters: `columns:` on a page block is what everyone sees and travels in a pack;
   * this is what YOU see on the grid, and it never leaves your device. Two people looking at the
   * same register may want different columns and neither is editing the record.
   *
   * The title column is not offerable. A register whose title is hidden is a list of ids.
   */
  let hidden = $state(new Set<string>());

  /* SEEDED FROM THE COOKIE AND WRITTEN BACK TO IT. This was client state with no store behind it,
     so unticking a column and reloading put it back — on a screen whose search, filters and sort all
     survive in the URL, which is precisely why a reader expects this to. The effect is keyed on the
     register, so walking between two registers loads each one's own answer. */
  $effect(() => {
    hidden = new Set(pref.read().columns?.[id] ?? []);
  });

  /** Every column back, and the register's entry out of the cookie rather than emptied in it. */
  function showAll() {
    hidden = new Set();
    const all = { ...pref.read().columns };
    delete all[id];
    pref.write({ columns: all });
  }

  function hide(field: string, off: boolean) {
    const next = new Set(hidden);
    if (off) next.add(field);
    else next.delete(field);
    hidden = next;
    const all = { ...pref.read().columns };
    if (next.size === 0) delete all[id];
    else all[id] = [...next];
    pref.write({ columns: all });
  }

/**
   * A LEADING COLUMN FOR THE SELECTION, and it is a column rather than a decoration on the id.
   *
   * The selection model was keyboard-only: `x`, `⇧x`, `⌘a`, `Esc` and nothing else — no way to pick
   * a row with a mouse or a finger at all, on the one screen that is a list of rows. It could not
   * go inside the `#` cell, which is 9ch wide because the spoken id is what that column is FOR and
   * it truncates in the middle; a checkbox in front of it would take the prefix.
   *
   * The control is `tabindex="-1"` on purpose. A grid is a composite widget with exactly one tab
   * stop — at 500 rows a focusable control per row is 500 tab stops — so the keyboard path stays
   * `x`, which the `?` sheet already advertises, and the pointer path is this.
   */
  /**
   * WHAT JUST HAPPENED TO A ROW, DRAWN WHERE THE ROW WAS.
   *
   * IT WAS A SET OF ARCHIVED SEQUENCES AND THE ROW LEFT THE SCREEN. That is the single change with
   * the most evidence behind it in `loop/REWORK.md`: of eighty-five human writes over thirteen days
   * in the record this product is modelled on, **thirteen reversed the write immediately before
   * them, and twelve of those landed inside five seconds**, across four different verbs. They had
   * one cause. The row vanished, so the only way to check you had hit the right one was to do the
   * opposite and look.
   *
   * A ROW IN THIS MAP IS DRAWN WHERE IT ALREADY WAS, whatever its state now is, wearing a chip that
   * says what happened and offering the inverse. It stays until the QUESTION changes, because the
   * next question is a new screen and a receipt for a row that is no longer in the answer is a row
   * the reader did not ask for.
   *
   * A DESTRUCTIVE ACTION IS UNDONE, NEVER CONFIRMED. A confirmation dialog asks its question before
   * anything has happened, when the reader knows the least they ever will about it, and the answer
   * is always yes, which is why people stop reading them. The receipt gives back the one thing a
   * dialog cannot: the row, named in the past tense, still where it was.
   */
  type Receipt = {
    /** One or two words in the past tense. `Archived`, `Restored`, `Undone`. */
    mark: string;
    /* `Tone` FROM THE RENDERER, not a fifth vocabulary written here. `13 §5.1` is that meaning may
       not live in styling alone, and `Chip` enforces it: there is no way to draw a tone in this
       app without its glyph, so the word and the glyph carry the meaning and the hue agrees. */
    intent?: Tone | undefined;
    /**
     * THE SAME FACT IN THE WIDTH THE GRID HAS, and it is absent for most receipts because most of
     * them already fit.
     *
     * The `act` column is `11ch` and `truncate: 'never'`, sized for two icon verbs or for
     * `Put back` beside a two-word mark. `markNeeds` is a sentence: on obligations it reads
     * "Needs which way, amount, due, status" and came out of the cell as "Needs whic", clipped,
     * immediately after the most common write in the product.
     *
     * IT IS NOT A TRUNCATION, IT IS A DIFFERENT SENTENCE FOR A SURFACE THAT ALREADY SAYS THE REST.
     * The grid draws every declared field as a column and an unfilled one as an em dash, so which
     * fields a row still wants is on the row four times over. The card draws three `mobile:`
     * fields and cannot say it, which is why the card gets the long form and this one does not.
     */
    short?: string | undefined;
    /** The inverse. Absent when there is nothing to put back, which a receipt still records. */
    undo?: () => void;
  };
  let receipts = $state(new Map<number, Receipt>());

  /**
   * What has been changed on this screen and not written.
   *
   * ONE PATCH PER ROW, applied over the answer. The record is not behind this screen yet, so an
   * edit that vanished on the next keystroke would be a control that does nothing; an edit that
   * claimed to be saved would be worse. The value the reader typed is what the row shows, the row
   * wears `Not saved`, and `Put back` drops the patch: the same receipt every other verb on this
   * screen leaves, because it is the same promise.
   */
  let edits = $state(new Map<number, Fields>());

  /**
   * WHERE A ROW WAS WHEN SOMEBODY ACTED ON IT, so that is where it stays.
   *
   * THE RECEIPT IS HALF THE PROMISE AND THIS IS THE OTHER HALF. A chip saying `Archived` is worth nothing on a row
   * that has jumped three screens away by the time it is drawn: the record answers in its own order, newest write
   * first, so every write this screen makes is a write that moves its row. `holdInPlace` pins it, and `rows-write.ts`
   * carries the argument and the tests.
   *
   * THE FIRST HOLD WINS. Two writes to one row are one row held once, at the place the reader found it, not walked
   * one index further each time somebody touches it.
   */
  let held = $state(new Map<number, Held>());

  const hold = (seq: number) => {
    if (held.has(seq)) return;
    const at = result.entries.findIndex((e) => e.seq === seq);
    const entry = result.entries[at];
    if (at < 0 || !entry) return;
    held = new Map(held).set(seq, { at, entry });
  };

  const receipt = (seq: number, r: Receipt) => {
    receipts = new Map(receipts).set(seq, r);
  };
  /**
   * What this row is wearing, which is not always something that happened on this screen.
   *
   * A PENDING ROW CARRIES ITS MARK WHETHER OR NOT ANYBODY IS STILL LOOKING AT THE PRESS THAT MADE
   * IT. `receipts` is cleared whenever the question changes, because a chip saying `archived` beside
   * a row somebody has just filtered TO is a chip about a different screen. A row that has not been
   * written is not like that: it is unwritten on every screen, for as long as the tab is open, and
   * the one place it is drawn is the one place that has to say so. A person who typed a row on the
   * first run, went to the list, filtered it, and found their row wearing nothing would have been
   * told it was saved by the absence of the sentence saying it was not.
   *
   * NEGATIVE SEQUENCES ARE THE TEST, because that is what `pending` mints and what nothing else in
   * the record can be.
   */
  const receiptFor = (seq: number): Receipt | undefined =>
    receipts.get(seq) ??
    (seq < 0 ? { mark: copy.markNotWritten, intent: 'warn' as const, undo: () => pending.drop(id, seq) } : undefined);

  const clearReceipt = (seq: number) => {
    const next = new Map(receipts);
    next.delete(seq);
    receipts = next;
  };

  /**
   * THE ANSWER, ONE PAGE AT A TIME — `13 §4.3`, and the mechanism that was missing.
   *
   * The spec's three parts are rowgroups of 100, **200-row keyset pages**, and a 2,000-row cap with
   * a visible line. Two were built. The pages were not, so `DOM_CAP` was not the end of a sequence,
   * it was a substitute for one: every row was materialised, filtered, sorted and then thrown away
   * past two thousand.
   *
   * `pages` IS AN ACCUMULATOR AND `cursor` IS WHERE THE NEXT ONE STARTS. Both reset when the
   * QUESTION changes — the register, the filters, the search, the order — because a cursor is a
   * position in one answer and means nothing in another. `50 §5.2` step 5 says exactly that: with a
   * non-null cursor, changing the order refetches page 1.
   *
   * THE EFFECT READS ITS OWN DEPENDENCIES DELIBERATELY. `id`, `filters`, `q` and `sort` are touched
   * before anything else so Svelte re-runs this when any of them moves, and nothing else in the body
   * can quietly add a dependency that resets the list mid-scroll.
   */
  let pages = $state<Entry[][]>([]);
  let cursor = $state<string | null>(null);
  /** The whole answer's size, as the record counted it. The rows in hand are `pages`. */
  let matched = $state(0);
  /**
   * WHAT THIS RECORD CALLS THE ROWS THESE ONES POINT AT, and `null` where the sample drew the list.
   *
   * A `ref` is stored as another row's id and drawn as that row's NAME, and the only names this
   * screen had were the built-in sample's — so a live list printed the sample's row for every
   * number, which is a different record's name under this record's column. The walk that turns the
   * stored id into a number already reads every row of the target list, so the name comes with it.
   */
  let named = $state<Names | null>(null);
  /* The answer this page set belongs to. A cursor from a different question is not a cursor. */
  let asked = $state('');
  /** A question is out, the first page or the next one. `aria-busy` reads it. */
  let busy = $state(false);
  /** A next page is out. `more()` asks once however often the sentinel comes into view. */
  let fetching = false;
  /** How many rows hold each pill's value, as the record counted them. `facets` adds this tab's. */
  let counted = $state(new Map<string, Map<string, number>>());

  /** The rows the record returned, by number: what a cell, the editor and the menu look a row up in. */
  const bySeq = $derived(new Map(pages.flat().map((e) => [e.seq, e] as const)));
  const rowAt = (seq: number): Entry | undefined => bySeq.get(seq);

  const question = $derived(JSON.stringify([id, filters, q, sort ?? null]));

  $effect(() => {
    const said = question;
    if (said === asked) return;
    asked = said;
    /* A DIFFERENT REGISTER IS A DIFFERENT SCREEN, so what the last one drew goes now rather than when
       the answer lands, and the screen draws loading in between. The same register keeps its rows
       until the new answer replaces them, so a pressed chip does not blank the list under it. */
    if (declared?.register !== id) {
      pages = [];
      cursor = null;
      matched = 0;
      named = null;
      counted = new Map();
    }
    refusal = null;
    void ask(said, id, filters, q, sort);
    /* AND THE RECEIPTS GO WITH THE ANSWER THEY WERE ABOUT. A chip saying `archived` beside a row
       the reader has just filtered TO is a chip about a different screen: the receipt exists to
       hold a row in place through one action, not to follow it around the product.

       AND SO DOES EVERYTHING ELSE THIS SCREEN HOLDS ABOUT ONE ROW. SvelteKit reuses this component
       across the `[register]` parameter, so `edits` was keyed on a bare sequence and survived a
       walk from one register to another: an unwritten change to `obligations#3` was drawn over
       `tasks#3`, on a row it was never about, wearing no receipt because the receipts had been
       cleared. `capture` kept a half-typed row in the box of a different list, and `editing`
       pointed at a cell that no longer exists. The question changing is the moment all four stop
       being about anything. */
    receipts = new Map();
    edits = new Map();
    /* AND THE HOLDS GO WITH THE RECEIPTS THEY BELONG TO. A hold is a position in ONE answer: keeping it across a
       new question would pin a row to an index in a list it is not in, which is the receipt's own argument one
       layer down. The flash goes for the same reason — a row marked as just added, on a screen somebody has
       just filtered to, is a mark about a different screen. */
    held = new Map();
    fresh = new Map();
    capture = '';
    editing = null;
  });

  /**
   * The next page, or nothing.
   *
   * IT STOPS AT THE CAP, WHICH IS WHAT MAKES THE CAP THE END OF A SEQUENCE rather than a slice. The
   * guard is here rather than in `Table`: an earlier version relied on `Table` swapping its sentinel
   * for the cap line, which is a count of the rows it was HANDED and therefore wrong the moment a
   * row is archived — the sentinel stayed, advertising more that this function then refused.
   *
   * THE RECORD'S CURSOR IS A POSITION IN ITS OWN ORDER, `updated_at` and `id`, so a row changed after
   * page one was fetched moves to the head of the list rather than breaking the walk: it is missed by
   * the walk, not repeated in it, and there is no stale cursor to recover from. The mock's `stale`
   * answer, and the branch here that started over on it, went with the mock.
   *
   * AN ANSWER FOR A QUESTION THAT HAS MOVED ON IS DROPPED. The reader filtered while this page was
   * out, and appending it would put rows from one answer under the head of another.
   */
  async function more() {
    if (cursor === null || fetching) return;
    if (loaded >= DOM_CAP) return;
    const said = asked;
    const from = cursor;
    const register = id;
    const chips = filters;
    const text = q;
    const order = sort;
    fetching = true;
    busy = true;
    await read(async () => {
      const next = await (await open()).page(register, { filters: chips, q: text, sort: order }, from);
      if (asked !== said) return true;
      if (!next.ok) return refuse(next.refusal);
      pages = [...pages, next.value.entries];
      /* A LATER PAGE MAY NAME ROWS THE FIRST ONE DID NOT, and it must not take away the names the
         rows already on screen are drawn with. The two are added together, newest last. */
      named = next.value.names === null ? named : joinNames(named, next.value.names);
      cursor = next.value.cursor;
      return true;
    });
    fetching = false;
    if (asked === said) busy = false;
  }

  /**
   * Ask the record this screen's question, and draw the answer whole.
   *
   * ONE BRACKET ROUND ALL OF IT: the declaration, the first page and the pills' counts land
   * together or the screen has not settled. `data-screen` appears the moment nothing is out, and a
   * screen that closed one call before it opened the next would say `ready` for a frame over a list
   * with nothing in it, which is the frame a gate measures.
   *
   * THE PILLS ARE COUNTED ONLY WHILE THE BAR IS DRAWN, one `limit: 1` list per value of an indexed
   * enum field, because a count nobody can see is a request nobody needed. The bar's own test is
   * repeated here from the answer, because the screen has not got the answer yet.
   *
   * AND AN ANSWER FOR A QUESTION THAT HAS MOVED ON IS DROPPED, whole, which is why the state is
   * written at the end rather than as each part arrives.
   */
  async function ask(said: string, register: string, chips: Filter[], text: string, order: typeof sort): Promise<void> {
    busy = true;
    await read(async () => {
      const src = await open();
      const [b, s] = await Promise.all([src.boot(), src.schema(register)]);
      if (asked !== said) return true;
      sample = src.sample;
      if (!b.ok) return refuse(b.refusal);
      booted = b.value;
      if (!s.ok) return refuse(s.refusal);
      const size = b.value.registers.find((r) => r.id === register)?.count ?? 0;
      const bar = size >= ENOUGH_TO_SIFT || text !== '' || chips.length > 0;
      const [answer, facets] = await Promise.all([
        src.page(register, { filters: chips, q: text, sort: order }, null),
        bar ? countAll(register, s.value, chips, text) : Promise.resolve(new Map<string, Map<string, number>>()),
      ]);
      if (asked !== said) return true;
      if (!answer.ok) return refuse(answer.refusal);
      declared = { register, decl: s.value };
      pages = [answer.value.entries];
      named = answer.value.names;
      cursor = answer.value.cursor;
      matched = answer.value.matched;
      counted = facets;
      return true;
    });
    if (asked === said) busy = false;
  }

  /** A refusal, drawn instead of the list. `false`, because that is what `read` records. */
  const refuse = (said: Refusal): false => {
    refusal = said;
    return false;
  };

  /**
   * How many rows hold each value of each pill, under every other chip and the search: the list's
   * own question, with that one field's chip replaced by the value.
   */
  async function countAll(register: string, d: RegisterDecl, chips: Filter[], text: string): Promise<Map<string, Map<string, number>>> {
    const src = await open();
    const out = new Map<string, Map<string, number>>();
    await Promise.all(
      filterableOf(d.fields)
        .filter((f) => f.type === 'enum')
        .flatMap((f) =>
          (f.values ?? []).map(async (value) => {
            const n = await src.count(register, {
              filters: [...chips.filter((x) => x.field !== f.id), { field: f.id, op: 'in', values: [value] }],
              q: text,
            });
            const per = out.get(f.id) ?? new Map<string, number>();
            per.set(value, n.ok ? n.value : 0);
            out.set(f.id, per);
          }),
        ),
    );
    return out;
  }


  /**
   * The whole answer's SIZE, which is not the same as the rows in hand.
   *
   * THE RECORD ANSWERS BOTH COUNTS WITHOUT HANDING OVER THE ROWS: `matched` comes back with every
   * page, and what the register holds comes from `boot`. The mock walked the whole filter a second
   * time to learn them, which is what the two numbers every surface on this screen reads cost.
   */
  const total = $derived(booted?.registers.find((r) => r.id === id)?.count ?? 0);
  /**
   * `total` IS WHAT THE LIST HOLDS, AND ARCHIVING HERE HOLDS NOTHING.
   *
   * I made this `found.total - archived.size` one iteration ago, to settle a sweep's finding that
   * the header read "37 of 38" while the empty state read "38 rows, none matching". Both were
   * true and the change was wrong twice over: the rail kept reading 38 from the record, so the two
   * numbers for one list disagreed across the screen; and once `count === total` the head drops its
   * "of N" span entirely, so the header stopped admitting it was showing a subset at all.
   *
   * Archive is page-local state that writes nothing — the record does still hold 38 — so `total` is
   * 38 and says so. What the sweep actually found is one level down and is in the backlog: a
   * destructive control in a mock-up that hides rows the record still has.
   *
   * A FILTER IS A DIFFERENT MATTER, and it is what `asked` below is for. `50 §5.2` step 6 makes the
   * head's denominator the ANSWER's size while filtering — *"`Matches n of N` is exact when
   * `cursor === null`, else `200+ of N`"* — and the head was counting against the register's size in
   * every state. At the cap under `?q=a` it read *2,000 of 2,614* three inches above a cap line
   * reading *Showing 2,000 of 2,545*, which is two answers to one question on one screen. Each
   * number was defensible alone and the pair was not.
   */
  const result = $derived({
    total,
    /* THE ROWS IN HAND, not the whole answer. `matched` is the answer's SIZE — what the head counts
       against, and what "38 rows, none matching" is about. What the head PRINTS while paging is
       `drawn`, the rows actually on screen; the two were conflated and the head over-reported. */
    /* AND A ROW THAT JUST CHANGED IS STILL HERE. This filtered archived rows OUT, so the row left
       the screen the instant it was touched and the reader's only way to check they had hit the
       right one was to do the opposite and look. `receipts` is what keeps it: the row is drawn
       where it was, wearing what happened to it, until the question changes. */
    /* AND WHAT HAS BEEN EDITED HERE IS WHAT THE ROW SHOWS. A cell that took a value and then drew
       the old one is a control that reports success and does nothing, which is the shape this
       repository hunts. The patch is over the answer rather than in it: `pages` still holds what
       the record returned, so `Put back` is dropping a key rather than reversing an arithmetic. */
    /* AND A ROW SOMEBODY HAS JUST ACTED ON IS WHERE THEY LEFT IT. `holdInPlace` pins each held row to the index it
       was read at and brings back one the answer has since dropped — the reopened row that no longer matches the
       chip it was found under. The hold is released when the question changes, with the receipt it belongs to. */
    entries: holdInPlace(
      [...pending.of(id, sample), ...pages.flat()],
      held,
    ).map((e) => {
      const patch = edits.get(e.seq);
      return patch ? { ...e, fields: { ...e.fields, ...patch } } : e;
    }),
    matched: matched + pending.of(id, sample).length,
    names: named,
  });

  /**
   * THE ROW THE READER JUST MADE, MARKED FOR A MOMENT SO THE EYE CAN FIND IT.
   *
   * IT IS CLEARED IN `$effect.pre` AND THAT IS THE WHOLE TRICK. A mark cleared in an ordinary `$effect` is cleared
   * AFTER the list has drawn, which marks the list dirty and draws it a second time — and the second draw rebuilds
   * the marked cell, cancelling the animation it had just started. The row flashed for a frame and settled, which
   * reads as a rendering fault rather than as an answer. Cleared before the draw, each pass either has the mark or
   * does not, and the one that has it keeps it for the whole of its animation.
   *
   * IT SITS BELOW `result` BECAUSE IT READS IT. `$effect.pre` runs during the first render pass, and `const` in the
   * same scope is not hoisted, so declared any higher this reads `result` before it exists and every register screen
   * throws on first paint. Neither the typechecker nor the tests can see that; only the compiled output can.
   *
   * A MARK FOR A ROW THAT IS NO LONGER IN THE ANSWER GOES WITH IT, so nothing accumulates across a question.
   */
  const FRESH_MS = 2_000;
  let fresh = $state(new Map<number, number>());

  $effect.pre(() => {
    const drawn = result.entries;
    untrack(() => {
      if (fresh.size === 0) return;
      const at = Date.now();
      const keep = new Map([...fresh].filter(([seq, put]) => at - put < FRESH_MS && drawn.some((e) => e.seq === seq)));
      if (keep.size !== fresh.size) fresh = keep;
    });
  });

  /**
   * THE ROWS IN HAND, WHICH IS NOT THE ROWS FETCHED.
   *
   * This summed the raw pages, archived rows included, while `Table` counts what it actually draws —
   * so archiving three rows on page one left `more()` stopping at 2,000 fetched while the grid held
   * 1,997. `Table`'s cap never fired, the cap line vanished, the head over-reported by three, and
   * the sentinel went on advertising more that `more()` refused to fetch. One number, counted the
   * way the screen counts it.
   */
  const loaded = $derived(result.entries.length);

  /**
   * HOW MANY ROWS MAKE SIFTING WORTH OFFERING.
   *
   * A CONTROL THAT ACTS ON A SET IS NOISE UNTIL THE SET IS BIGGER THAN THE SCREEN. Measured on this
   * page at 390px with one row: the row's top was 445px into an 844px viewport — the row 5% of the
   * screen, the chrome 53% — and 45 of the 71 focusable controls in `<main>` were there whether the
   * list held one row or thirty-eight. Searching a list you can see all of is slower than reading
   * it, and filtering it is slower still.
   *
   * EIGHT, BECAUSE THAT IS WHAT FITS. A phone shows about eight card rows at once, so below it
   * everything the person owns is already in front of them and there is nothing to find. It is the
   * one number here and it is tied to a screen rather than to a taste.
   *
   * IT IS DECLARED HERE, ABOVE THE COLUMNS, BECAUSE THE COLUMNS ASK IT. It used to sit four hundred
   * lines further down beside the bar it gates, which was fine while the bar was the only thing that
   * asked: the picker column and the select-all were unconditional, so half of the answer to "is
   * this list big enough to act on in bulk" was drawn and half was not.
   */
  const ENOUGH_TO_SIFT = 8;

  /** The moment `19 §6` describes: the register, with their one row in it. */
  const arriving = $derived(page.url.searchParams.has('first'));

  const siftable = $derived(!arriving && result.total >= ENOUGH_TO_SIFT);

  /**
   * AND THE PICKER IS NOT ON THE SCREEN UNTIL THERE IS A SET TO BUILD.
   *
   * `USABILITY.md`'s second question is whether the product grows as the record grows, and its
   * example is exactly this: *"a control that is meaningless at n=1 should not be on the screen at
   * n=1"*. Everything the bulk bar offers over one row — copy the id, set the state, archive it —
   * is already on that row's own menu, so at one row the picker is a column of chrome whose only
   * outcome is a toolbar that says `1 selected` above a list of one.
   *
   * THE SAME THRESHOLD THE BAR ABOVE IT USES, because they are one feature. `siftable` was already
   * gating the search and filter bar; the picker
   * and the select-all were left unconditional, so half of the answer to "is this list big enough
   * to act on in bulk" was drawn and half was not.
   */
  /* The register's own projection, with its state marked as the column that carries the row's
     tone, so `⊘ open` reads as one thing rather than a mark in one column and a word in another. */
  const projected = $derived(
    columnsFor(id, decl)
      .filter((c) => !hidden.has(c.field))
      .map((c) => (c.field === decl?.state ? { ...c, tone: true } : c)),
  );

  const columns = $derived([
    ...(siftable
      ? [{ field: 'select', label: copy.select, hideLabel: true, width: '3ch', align: 'start' as const, truncate: 'never' as const }]
      : []),
    ...projected.filter((c) => c.field !== 'seq'),
    /* THE SPOKEN ID ENDS THE ROW, quiet, where a list keeps what you look up rather than read. It
       led the row, so every line opened on a number; the project's mark that shared its cell now
       sits in front of the title, where colour saying which project is read. */
    ...projected.filter((c) => c.field === 'seq'),
    /**
     * THE VERBS, AND THE RECEIPT, IN THE ROW.
     *
     * EVERY FREQUENT VERB WAS BEHIND A MODAL. The editing path was `Sheet` wrapping `RowForm`,
     * opened from the register page, and in the record this product is modelled on **61% of what a
     * person does to a row could not be done where the row is drawn** before the equivalent change
     * was made there. That one choice is most of what makes this screen read as enterprise
     * software: the list is a place you look things up from and go somewhere else to act.
     *
     * ONE COLUMN, TWO STATES. A row that has just been acted on shows what happened and the way
     * back; every other row shows the verbs. They cannot both be true of one row, so they share a
     * cell rather than competing for the width of two.
     *
     * `hideLabel`, because the header of a column of controls is not a heading, and `truncate:
     * 'never'`, because a truncated verb is a different verb.
     */
    { field: 'act', label: copy.rowActions, hideLabel: true, width: '11ch', align: 'end' as const, truncate: 'never' as const },
  ]);

  /**
   * WHAT THE HEAD COUNTS AGAINST: the answer while filtering, the list otherwise.
   *
   * Unfiltered the two are the same number, so this changes nothing on the ordinary screen. Filtered
   * they are not, and the head and the cap line have to be talking about the same denominator or one
   * of them is wrong wherever they are both visible — which is exactly at the cap, the one place the
   * cap line exists for.
   */
  /* AND THE PENDING ROWS ARE IN IT, because they are in the numerator. `drawn` counts what the list
     draws, which includes a row somebody has just typed, while `result.total` is the record's count
     and does not: so every successful add printed a numerator larger than its denominator, "39 of
     38" on Money after a first row and "15 of 14" on Tasks after one capture. A person who has just
     added something is the last reader who should be shown arithmetic that looks broken. */
  const denominator = $derived(filters.length || q ? result.matched : result.total + pending.of(id, sample).length);

  /**
   * AND WHAT IS ACTUALLY DRAWN, WHICH IS NEITHER OF THE OTHER TWO.
   *
   * `more()` stops once `loaded` reaches the cap, and a page is two hundred rows, so it overshoots:
   * eleven pages minus three archived rows is 2,197 loaded while the grid slices to 2,000. Reporting
   * `loaded` put "2,197" in the head and "Showing 2,197 of 2,611" in the cap line over two thousand
   * rows — two numbers describing rows nobody can see. The head and the line both count the grid.
   */
  const drawn = $derived(Math.min(loaded, DOM_CAP));

  /**
   * A SORTED LIST THE RECORD STOPPED, which is the one list with no next page that is not whole.
   * The record will not page an `order`, so a sorted answer is its first page with `cursor: null`,
   * and fewer rows in hand than it matched is how the screen knows the list stopped rather than
   * ended. It is drawn like the cap: the count is exact and the cap line says what is missing.
   */
  const fetched = $derived(pages.reduce((n, p) => n + p.length, 0));
  const truncated = $derived(cursor === null && fetched < matched);

  /** Whether the reader is looking at all of it. Everything honest on this screen turns on it. */
  const whole = $derived(cursor === null && !truncated);

  /**
   * `aria-rowcount`, which `50 §5.2` step 4 gives three states and this screen gave one.
   *
   * *"`N` from `index` when unfiltered, `-1` while filtered and paging, the exact count once
   * `cursor` is null."* `-1` is the ARIA spelling of *I do not know yet*, and it is the honest
   * answer for a filtered list still being paged: the total is knowable only by finishing the walk,
   * and a screen reader told "row 12 of 38" while the grid is still fetching has been told a number
   * that may move under it.
   */
  /**
   * `-1` MEANS *STILL FETCHING*, WHICH THE CAP IS NOT.
   *
   * `50 §5.2` step 4 scopes it precisely: *"`-1` while filtered **and paging**"*. At the cap the
   * walk has stopped and the count is known, so `-1` there tells a screen reader the total is
   * unknowable when the line beside it prints the number. `settled` is the honest test: the answer
   * is whole, or the grid has reached the cap and will not grow.
   *
   * And `matched` rather than `total` on the other branch: archiving here is page-local and the
   * record still holds every row, but `aria-rowcount` describes THIS GRID, which has stopped drawing
   * the archived ones. It read 2,614 over 2,611 rows.
   */
  const settled = $derived(whole || truncated || drawn >= DOM_CAP);
  const rowCount = $derived(settled ? result.matched : filters.length || q ? -1 : result.matched);

  /**
   * THE SENTINEL, AND THE OBSERVER `50 §5.2` STEP 4 SPECIFIES.
   *
   * `Table` has declared an `onmore` prop and rendered a `<div class="sentinel">` since it was
   * written, and across `apps` and `packages` there was not one call site and not one
   * `IntersectionObserver` — a mechanism with its middle removed. This is the middle.
   *
   * IT WATCHES WHATEVER BODY IS ON THE SCREEN. The grid and the card list are one at a time now, so
   * the observer re-attaches when the body changes rather than holding a node that has been
   * unmounted; `body` is the element that wraps both, and the effect re-runs when it moves.
   *
   * `rootMargin` FETCHES BEFORE THE READER ARRIVES. A page that starts loading when the sentinel is
   * already visible is a page that stutters at every boundary; 600px is about two screens of rows at
   * this row height.
   */
  let body = $state<HTMLElement | undefined>(undefined);

  $effect(() => {
    /**
     * EVERY REASON THE SENTINEL COULD HAVE MOVED, READ ON PURPOSE.
     *
     * The only reactive read here was `body`, which is bound to the wrapper holding BOTH bodies and
     * therefore never changes — so this effect ran exactly once, for the life of the page, holding
     * whichever node existed at mount.
     *
     * Two ways that broke, both measured and both permanent. Navigating `/r/obligations` →
     * `/r/services` (16 rows, no sentinel) → back reuses the component across the `[register]` param:
     * the observed node left the document, a new sentinel was built, nobody watched it, and the
     * reader sat on 200 of 2,614 under a head reading `200+` with a sentinel that did nothing.
     * Crossing 640px did the same thing, in both directions, because the two bodies are separate
     * elements now.
     *
     * `id`, `whole`, `loaded` and `rowsAsCards()` are the four facts that decide whether a sentinel
     * exists and which element it is. Reading them makes the subscription follow it.
     */
    void id;
    void whole;
    void loaded;
    void rowsAsCards();
    const el = body?.querySelector('.sentinel');
    if (!el) return;
    /* THE ROOT IS THE APP'S SCROLLER, NOT THE VIEWPORT. `+layout.svelte` makes `#main` "the ONE
       scroll container" so the rail never moves and the window shows one scrollbar — which means
       the window never scrolls, the sentinel never enters the viewport, and an observer with the
       default root fires exactly once, at load, and never again. Measured: page one drew and eight
       scrolls to the bottom added nothing. */
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && more(), {
      root: body?.closest('#main') ?? null,
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  });
  /* NAMED BY WHICHEVER RECORD DREW THEM. `result.names` is the record's own title for every row a
     ref on this list points at, and `null` is the sample, which names them out of its own rows. */
  const rows = $derived(toRows(id, result.entries.slice(0, DOM_CAP), columns, now, result.names ?? undefined));

  /**
   * WHAT A READER CAN ORDER THE LIST BY, and what each direction is CALLED.
   *
   * THE SELECTION BOX IS NOT A FIELD and orders nothing, so it is not in the list. It offered
   * "Select" as a sort key for exactly as long as it took to look.
   *
   * BY NAME AND NOT BY INDEX. This was `columns.slice(1)`, which is the picker's position rather
   * than the picker, and the picker is drawn only once the list is long enough to act on in bulk:
   * below that, `slice(1)` silently dropped the spoken id from the sort list instead.
   *
   * And the direction is named in the field's own terms. A column header can get away with an arrow
   * because the arrow sits on the thing it orders; a chip in a sheet is read on its own, and
   * "Due ↑ lowest first" is a sentence about a date that nobody says. `19 §9`'s rule is that the
   * product speaks the reader's words, and the reader's word for an ascending day is *oldest*.
   */
  /* `act` IS A COLUMN OF CONTROLS, NOT OF VALUES, and Display on a phone offered to sort by it:
     "Sorted by" listed seven options and the last was `What you can do here`, which is the label of
     the row-actions column. There is nothing in it to put in an order. */
  const sortable = $derived(columns.filter((c) => c.field !== 'select' && c.field !== 'act'));

  const wayOf = (field: string): readonly [string, string] => {
    if (field === 'seq') return [copy.firstAdded, copy.lastAdded];
    const type = decl?.fields.find((f) => f.id === field)?.type;
    if (type === 'day' || type === 'instant') return [copy.oldestFirst, copy.newestFirst];
    if (type === 'money' || type === 'int' || type === 'decimal' || type === 'duration')
      return [copy.lowestFirst, copy.highestFirst];
    return [copy.aToZ, copy.zToA];
  };

  /**
   * Archive one row: no dialog, and the row does not move.
   *
   * THE TOAST IS NOT THE RECEIPT. It was, and a toast is at the wrong end of the screen from the
   * thing it is about, gone in ten seconds, and stacked three deep after three archives. The chip
   * is ON THE ROW, next to what the row says, for as long as the reader is looking at this answer.
   * The toast stays for the archive done from the keyboard with the row off screen.
   */
  function archive(seq: number) {
    if (!sample && seq > 0) {
      void archiveOnRecord([seq], `${id}#${seq}`);
      return;
    }
    /* `warn`, LIKE EVERY OTHER RECEIPT ON THIS SCREEN. This was the one drawn with no tone, beside
       four that pass one, and it says `Archived` over a row nothing happened to: the toast beside
       it says "would be archived. Nothing was saved yet." Same fact, two registers. */
    receipt(seq, { mark: copy.markArchived, intent: 'warn', undo: () => clearReceipt(seq) });
    toasts.push(copy.archived(`${id}#${seq}`), { undo: () => clearReceipt(seq) });
  }

  /* ── capture: one line, first on the page, with no decisions attached ────── */

  /**
   * ADD A ROW BY TYPING ITS NAME AND PRESSING ENTER.
   *
   * THE ONLY WAY IN WAS A MODAL ASKING FOR EVERY DECLARED FIELD, up front. In the record this
   * product is modelled on, twenty-five of eighty-five writes over thirteen days were adds, and the
   * add used to be the fifth thing down the page at roughly y=1400 of a 3416px document. Moving it
   * to one line at the top, with the submit control inside the field and only present once there is
   * something to add, is the change that made those twenty-five cheap.
   *
   * WHAT IT DOES NOT ASK. Everything the filter already says. Looking at `?f=state:is:open` means
   * the answer to "what state" is on screen, and asking again is asking a person to repeat
   * themselves to a machine that heard them. Everything else is left unset for an agent or a person
   * to fill in later, which is what a record with a shape is for.
   */
  let capture = $state('');

  /**
   * What the filter answers on the reader's behalf, and what it cannot.
   *
   * BOTH LIVE IN `record/api.ts` AND NOT HERE. They are the piece of this screen that can write a
   * WRONG VALUE rather than an ugly one: the URL carries the readable form of a value and the record
   * stores the declared one, so an inheritance that reconciled the two spellings loosely would put
   * a reader's prose in a field and nothing would say so. That is a thing to have a test for, and a
   * `$derived` inside a component is not reachable from one.
   */
  const inherited = $derived(inheritedFrom(id, filters));
  const unanswered = $derived(unansweredBy(id, inherited));

  /**
   * The row the sheet was filled in with.
   *
   * IT CLOSED THE SHEET AND SAID `Nothing was saved yet.` AFTER THE SHEET WAS GONE, with no mention
   * of what would have been written. A friction pass called it out as the one write control in the
   * app using the bare string where forty others use the descriptive one, and it is the most
   * expensive control on the screen to reach: a press, a dialog, a form, a submit.
   *
   * THE SAME PLACE THE CAPTURE LINE AND THE FIRST-RUN SCREEN PUT A ROW. Three surfaces in this
   * product take a row from a person and none of them can write one yet; holding the answer in
   * three different ways would be three things to change on the day one of them can.
   */
  /* ── writes, when the list is a live record ───────────────────────────────── */

  /**
   * ON A LIVE RECORD EVERY GESTURE BELOW WRITES, and on the sample each says `notWritten` as before.
   *
   * THE ROW THE RECORD HANDS BACK IS DRAWN WHERE THE OLD ONE WAS. A changed row that jumped to where
   * its new state sorts is the row the reader has to go and find again; a new row goes at the top.
   * An answer for a question the screen has left is not drawn, and a refusal is still said.
   */
  let writer: RowWriter | null = null;
  const writes = (): RowWriter => (writer ??= rowWriter(location.origin));
  /** The sheet's add is out, so a second press does not send a second row. */
  let writing = $state(false);

  function landRow(entry: Entry) {
    pages = pages.map((p) => p.map((e) => (e.seq === entry.seq ? entry : e)));
  }

  /**
   * THE NEW ROW, AT THE TOP, WEARING A MARK, AND ON THE SCREEN.
   *
   * CLOSING THE LOOP IS THREE THINGS AND THE LINE DID ONE. A row was appended to the answer and the reader was left
   * to find it: on a filtered list, or one scrolled down, the only evidence that the most common write in the
   * product had worked was a count changing somewhere above the fold. The mark says which row is new, the receipt
   * says what happened to it, and the scroll happens ONLY when the row is not already in front of them.
   *
   * `filled` IS SAID ON THE ROW AND IN THE TOAST, because a field this screen answered on somebody's behalf is a
   * fact nobody told it. The chip takes the long form where there is room for it and `Added` where there is not.
   */
  function addLanded(entry: Entry, filled: readonly string[] = [], mark?: string) {
    pages = [[entry, ...(pages[0] ?? [])], ...pages.slice(1)];
    matched += 1;
    if (booted) booted = { ...booted, registers: booted.registers.map((r) => (r.id === id ? { ...r, count: r.count + 1 } : r)) };
    receipt(entry.seq, {
      mark: mark ?? (filled.length > 0 ? copy.markAddedFilled(filled) : copy.writeMarkAdded),
      short: copy.writeMarkAdded,
      intent: 'good',
    });
    fresh = new Map(fresh).set(entry.seq, Date.now());
    void showRow(entry.seq);
  }

  /**
   * BRING THE ROW INTO VIEW, AND ONLY IF IT IS NOT ALREADY THERE.
   *
   * AN UNCONDITIONAL `scrollIntoView` MOVES THE PAGE UNDER SOMEBODY WHO CAN ALREADY SEE THE ROW, which is the
   * gesture every list that does it is disliked for: the reader typed one line, the row appeared where they were
   * looking, and the screen jumped anyway. `block: 'nearest'` does nothing when the element is inside the
   * scroller, so the test is whether it is inside `#main`'s box at all.
   *
   * THE ROW IS FOUND BY ITS OWN MARK rather than by an index into the body, because the two bodies number their
   * rows differently and the mark is on whichever one is drawn.
   */
  async function showRow(seq: number) {
    await tick();
    const el = body?.querySelector(`[data-fresh="${seq}"]`)?.closest('.tr, .card-line');
    const scroller = body?.closest('#main');
    if (!el || !scroller) return;
    const row = el.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (row.top >= box.top && row.bottom <= box.bottom) return;
    el.scrollIntoView({ block: 'nearest' });
  }

  /** A write that did not land: the row as it now stands, when there is one, and the record's sentence. */
  function missed(was: string, out: Exclude<Wrote, { ok: true }>) {
    if (asked === was && out.why === 'conflict' && out.entry) landRow(out.entry);
    toasts.push(out.fix, { intent: 'warn' });
  }

  function setPatch(seq: number, field: string, value: Fields[string]) {
    edits = new Map(edits).set(seq, { ...(edits.get(seq) ?? {}), [field]: value });
  }

  function dropPatch(seq: number, field: string) {
    const next = new Map(edits);
    const left = { ...(next.get(seq) ?? {}) };
    delete left[field];
    if (Object.keys(left).length === 0) next.delete(seq);
    else next.set(seq, left);
    edits = next;
  }

  function addTypedRow() {
    if (problems.length > 0 || !decl) return;
    /* THE SHEET STAYS OPEN UNTIL THE RECORD HAS THE ROW, so a refusal leaves everything typed where it was. */
    if (!sample) {
      if (writing) return;
      writing = true;
      const was = asked;
      void writes()
        .create(id, taken)
        .then((out) => {
          writing = false;
          if (!out.ok) return missed(was, out);
          if (asked === was) addLanded(out.entry);
          closeCreate();
        });
      return;
    }
    const named = display(id, decl.title, taken[decl.title]) ?? '';
    const seq = pending.add(id, taken, sample);
    receipt(seq, { mark: copy.markNotWritten, intent: 'warn', undo: () => pending.drop(id, seq) });
    closeCreate();
    /* THE NAME, NOT THE NOUN AND THE NAME. `${decl.one} ${named}` read "item Deposit for the print
       run, but nothing was saved yet": the register's singular in front of a title that is already
       a noun phrase. The noun is only worth saying when the row has no name to say instead. */
    toasts.push(copy.notWritten(named || decl.one), { intent: 'warn' });
  }

  function captureRow() {
    const said = capture.trim();
    if (!said) return;
    /* NEGATIVE SEQUENCES, so a draft can never collide with a row the record has. The spoken id is
       what every other thing on this screen addresses a row by, and two rows answering to
       `obligations#7` is the one collision that would make the receipt point at the wrong row. */
    const title = decl?.title;
    if (!title) return;
    /* ON A LIVE RECORD THE LINE EMPTIES AT ONCE, and what was typed goes back into it if the record says no. */
    if (!sample) {
      capture = '';
      void createRow(said, (back) => {
        /* WHAT WAS TYPED GOES BACK IN THE BOX, and only if nothing else has been typed since. Overwriting a
           second line somebody has already started would lose the newer one to report the older. */
        if (capture === '') capture = back;
      });
      return;
    }
    /* THE SAME PLACE THE FIRST-RUN SCREEN PUTS ITS ROW. A row typed here and a row typed on `/start`
       are the same kind of thing, waiting on the same missing write path, and holding one of them
       in this component and the other in a module would be two answers to one question: the second
       screen to need it would have found the wrong one. */
    const seq = pending.add(id, { ...inherited, [title]: said }, sample);
    /**
     * THE ROW IS ADDED EVEN WHEN THE REGISTER WANTS MORE, and the chip says what it wants.
     *
     * THE FIRST VERSION BOUNCED TO THE FULL FORM instead, which is the modal this line exists to
     * replace arriving one keystroke later. Obligations require a direction, an amount, a due date
     * and a state beyond the title, so on the register a person opens most often the fast path
     * never ran once.
     *
     * IT IS LINEAR'S GRACE WINDOW, WHICH `loop/REWORK.md` NAMES AS THE HIGHEST-VALUE SINGLE STEAL
     * for this product: a row is allowed to be incomplete for the minutes right after it is
     * captured, because the alternative is that the thing in somebody's head has to survive a form
     * before it can be written down. The row is here, it is named, and what it still needs is on
     * it, so the form is a place to go rather than a gate to pass.
     */
    receipt(seq, {
      mark: unanswered.length > 0 ? copy.markNeeds(unanswered.map((f) => f.label.toLowerCase()).join(', ')) : copy.markNotWritten,
      short: copy.markNotWritten,
      intent: 'warn',
      undo: () => {
        pending.drop(id, seq);
        clearReceipt(seq);
      },
    });
    /**
     * AND IT SAYS THE ROW IS NOT SAVED, WHICH THE CHIP ABOVE CANNOT ALWAYS SAY.
     *
     * The mark is `markNeeds` OR `markNotWritten`, one or the other, and the argument for that is
     * good: what a row still needs is the actionable half and a chip has room for one sentence.
     * The cost is that the register a person opens most often wants four fields beyond the title,
     * so on that register the fast path ALWAYS takes the `markNeeds` branch and the words "not
     * saved" are never printed anywhere at all. `pending.svelte.ts`'s own header calls that the
     * failure it exists to prevent: "a row that comes back tomorrow looking saved is worse than
     * one that is honestly gone."
     *
     * `addTypedRow` twenty lines above, which is the same act through the full form, has always
     * pushed this toast. The capture line pushed nothing, so the cheapest write in the product
     * was also the only one that answered a person with silence.
     */
    toasts.push(copy.notWritten(said), { intent: 'warn' });
    capture = '';
  }

  /**
   * ONE TYPED LINE, WRITTEN AS A ROW THE RECORD WILL TAKE.
   *
   * THE INFERENCE IS `capturedFields` AND IT IS NOT HERE. What the address already answers and what the
   * declaration still requires are the piece of this screen that can write a WRONG value rather than an ugly one,
   * so it lives in a module with tests rather than in a component nothing can reach.
   *
   * A REFUSAL PUTS THE TYPING BACK. The record's own sentence says what it wanted, and the words are in the box
   * again rather than gone — which is the difference between a control that failed and a control that ate
   * something. `onBack` is the caller's, because the capture line and the example button put it in different
   * places.
   */
  async function createRow(said: string, onBack: (back: string) => void, mark?: string) {
    const was = asked;
    const { fields, filled } = capturedFields(id, said, filters, now, result.entries);
    const out = await writes().create(id, fields);
    if (!out.ok) {
      missed(was, out);
      onBack(said);
      return;
    }
    if (asked !== was) return;
    addLanded(out.entry, filled, mark);
    /* AND THE FILLED FIELDS ARE SAID ONCE, WHERE THEY ARE LOOKING. The chip carries it on the row for as long as
       the answer is up; this is for the reader whose eye is on the line they just typed in. */
    if (filled.length > 0) toasts.push(copy.captureFilled(filled));
  }

  /**
   * The empty state's offer, made good: one real row, named as an example.
   *
   * ON THE SAMPLE IT SAYS WHAT IT WOULD HAVE DONE, exactly as it always has — there is no record behind that
   * screen and `notWritten` is the honest answer. On a live record it writes, through the same path as the
   * capture line, so an example row and a typed row are the same kind of thing and are put back the same way.
   */
  function addExample() {
    if (sample || !decl) {
      toasts.push(copy.notWritten(copy.exampleWouldBeAdded), { intent: 'warn' });
      return;
    }
    void createRow(copy.exampleTitle(decl.one.toLowerCase()), () => {}, copy.markExample).then(() => {
      if (!sample && decl) toasts.push(copy.exampleAdded(decl.one.toLowerCase()));
    });
  }

  /**
   * Move one row's state, from the row.
   *
   * IT TOOK THREE PRESSES AND A BULK BAR. The only way to change one row's state was to select it,
   * reach the bar that appears when something is selected, and use the menu there. The state is the
   * verb a person reaches for most on a list of obligations, and it was the one the row menu did
   * not carry.
   *
   * THE RECEIPT IS THE ANSWER AND THE TOAST IS THE BACKUP, the same way `archive` works: the chip
   * is on the row, beside what the row says, and the toast is for the reader whose row has scrolled
   * away. Nothing is written until the record is behind this screen, and the chip says which state
   * it would be rather than claiming the move happened.
   */
  function setRowState(seq: number, state: string) {
    const said = state.replace(/_/g, ' ');
    const field = decl?.state;
    if (!sample && seq > 0 && field) {
      const was = asked;
      hold(seq);
      receipt(seq, { mark: copy.writeMarkSaving, intent: 'warn' });
      void writes()
        .update(id, seq, { [field]: state }, rowAt(seq)?.version)
        .then((out) => {
          if (asked === was) clearReceipt(seq);
          if (!out.ok) return missed(was, out);
          if (asked !== was) return;
          landRow(out.entry);
          receipt(seq, { mark: said, intent: 'good' });
        });
      return;
    }
    receipt(seq, { mark: said, intent: 'warn', undo: () => clearReceipt(seq) });
    toasts.push(copy.notWritten(`${id}#${seq} would be set to ${said}`), { intent: 'warn' });
  }

  /* ── editing a value where it is drawn ───────────────────────────────────── */

  /**
   * CHANGING A VALUE YOU ARE LOOKING AT COST A FULL ROUTE CHANGE.
   *
   * A friction pass measured the path: click a cell, land on a read-only detail page, press *Edit
   * the row*, get a toast. In-place editing was advertised on the `?` sheet as `e`, was reachable
   * only from the keyboard, was announced nowhere on screen, and answered the press with a sentence
   * saying what it would have done. It is eighth of the ten things that cost a person the most,
   * and it is the one a person does most often after reading.
   *
   * THE CELL IS THE EDITOR. Not a drawer over the list, not a form on another screen: the value is
   * already drawn in a box of exactly the right width, and the cheapest possible edit is that box
   * becoming writable where it sits. Enter commits, Escape cancels, and the caret is put in it.
   *
   * FOUR TYPES AND NOT ALL OF THEM, said out loud rather than half-built. `text`, `enum`, `day` and
   * the plain numbers are one value in one box and are editable here. A `money` is an amount AND a
   * currency and a `ref` is a row in another register: both are two decisions, and a cell that took
   * one of the two would write half a value. Those open the row, which is where the second decision
   * has somewhere to go.
   *
   * WHICH IS WHICH IS DRAWN AND NOT EXPLAINED. The pencil appears on an editable cell and on no
   * other, so the answer is in front of the reader at the moment they are looking at that cell. A
   * sentence under the grid listing four type names would be a legend about a mechanism, read once
   * and never again, for a question the cell can answer itself.
   */
  /* `pct` WAS IN THIS SET AND IS NOT A TYPE. `FieldType` is text, document, money, day, instant,
     int, decimal, enum, bool, ref, secret and duration; a percentage is a `decimal` with a format on
     it. The entry matched nothing, so it neither added a type nor took one away, which is exactly
     why it sat here unread: a set with a word in it that no field can ever carry reads as a
     decision somebody made and is not one. */
  const EDITABLE = new Set(['text', 'enum', 'day', 'int', 'decimal']);

  let editing = $state<{ seq: number; field: string } | null>(null);
  let editValue = $state('');

  /**
   * ESCAPE HAPPENED, SO THE BLUR THAT FOLLOWS IT IS NOT A COMMIT.
   *
   * It is a plain `let` and not `$state`, deliberately: nothing draws it, it is written and read inside one pair
   * of events, and a reactive read would be a dependency on a value that is always false by the time anything
   * could look at it. `commitEdit` puts it down as it reads it.
   */
  let cancelled = false;



  const fieldOf = (field: string) => decl?.fields.find((f) => f.id === field);
  const editableHere = (field: string) => EDITABLE.has(fieldOf(field)?.type ?? '');

  /** Why a cell is not the editor, in the reader's words rather than as a type name. */
  const notEditableBecause = (field: string): string =>
    copy.cellWhy[fieldOf(field)?.type ?? ''] ?? copy.cellWhyElse;

  /**
   * THE VALUE THE READER IS LOOKING AT, which is not the value the record holds.
   *
   * The grid draws `pending` rows and the record's rows with `edits` patched over the top, and the
   * editor read `entry()` alone. Three things followed from that one line, all of them silent:
   *
   * A SECOND EDIT OF THE SAME CELL OPENED ON THE ORIGINAL. Change a title, press `e` on it again,
   * and the box holds what the record still says rather than what the row on screen says. Anybody
   * who then pressed Enter without retyping had quietly reverted their own change.
   *
   * A PENDING ROW OPENED EMPTY. `entry()` reads `ROWS` and a row somebody typed into the capture
   * line is not in `ROWS`, so every cell of the row they had just created offered a blank box.
   *
   * AND TYPING THE RECORD'S VALUE BACK WAS READ AS "nothing changed". `commitEdit` compared against
   * the record too, so undoing an edit BY HAND returned early with the patch still in the map: the
   * cell went on showing the edited value, and the row went on wearing `Not saved` for a change the
   * person had just typed away.
   */
  const shownValue = (seq: number, field: string): unknown => {
    const patch = edits.get(seq);
    if (patch && Object.hasOwn(patch, field)) return patch[field];
    const held = rowAt(seq) ?? pending.of(id, sample).find((r) => r.seq === seq);
    return held?.fields[field];
  };

  const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

  function openEditor(seq: number, field: string) {
    if (!editableHere(field)) {
      /* A BOUND KEY DOES NOT ANSWER WITH SILENCE. `19 §4`'s sheet advertises `e` for the grid with
         no condition on it, and `money` and `ref` are deliberately not editable here because each is
         two decisions and a cell that took one of them would write half a value. That argument is
         sound and it was never said out loud: the press did nothing, drew nothing and reported
         nothing, on the two types where a person is most likely to try. */
      const f = fieldOf(field);
      /* AND A COLUMN THAT IS NOT A FIELD STILL ANSWERS. The picker and the row's verbs carry no
         declaration, so `fieldOf` is undefined for them and this returned in silence: a printed key
         doing nothing, which is the drift `19 §4` exists to prevent. It became reachable the day
         clicking a cell started moving the caret to that cell. */
      toasts.push(f ? copy.cellOpensRow(labelOf(f), notEditableBecause(field)) : copy.cellNoValue, { intent: 'warn' });
      return;
    }
    editing = { seq, field };
    editValue = asText(shownValue(seq, field));
  }

  /**
   * FOCUS LEFT THE FIELD — AND THE EDITOR CLOSES ONLY IF IT LEFT THE ROW.
   *
   * `relatedTarget` IS WHERE FOCUS WENT, and it is the whole of the test. A row carries the cell being edited, the
   * pencil of every other editable cell, the picker and two or three verbs, and every one of them is inside the
   * thing the reader is working on: treating a move between them as "finished" is the editor closing under the
   * gesture that was reaching for it.
   *
   * A NULL `relatedTarget` IS A COMMIT, not an exception. Focus going nowhere at all — the window losing it, a
   * click on the page's own background — is a person who has stopped editing, and holding the cell open in that
   * state is a control the reader has walked away from and cannot see.
   */
  function leftTheRow(e: FocusEvent) {
    const to = e.relatedTarget;
    const row = (e.currentTarget as HTMLElement).closest('.tr, .card-line');
    if (row && to instanceof Node && row.contains(to)) return;
    commitEdit();
  }

  function commitEdit() {
    const at = editing;
    if (!at) return;
    /**
     * ESCAPE CANCELS, AND THE BLUR THAT FOLLOWS IT MUST NOT COMMIT.
     *
     * THIS IS A BUG NO SCREENSHOT CAN HOLD. Closing the editor takes the element out of the document, which fires
     * `focusout` on the way — so a cancel and a commit arrive in that order, one gesture, and the value somebody
     * pressed Escape to throw away was written by the event that clearing it caused. The flag is read once and
     * put down, so it cancels exactly the blur its own Escape produced and never the next edit's.
     */
    if (cancelled) {
      cancelled = false;
      editing = null;
      return;
    }
    editing = null;
    const said = editValue.trim();
    /* NOTHING CHANGED IS NOT AN EDIT. A receipt for a value somebody looked at and left alone is a
       row wearing `Not saved` for no reason, and after three of those the chip stops being read. */
    if (said === asText(shownValue(at.seq, at.field))) return;

    /* ON A LIVE RECORD THE CELL SHOWS WHAT WAS TYPED WHILE IT SAVES. A refused value goes back into the
       cell's editor, so it is corrected rather than typed again; a conflict draws the row as it now
       stands first, so the retry is against the latest version. */
    if (!sample && at.seq > 0) {
      const was = asked;
      const value = said === '' ? null : said;
      hold(at.seq);
      setPatch(at.seq, at.field, value);
      receipt(at.seq, { mark: copy.writeMarkSaving, intent: 'warn' });
      void writes()
        .update(id, at.seq, { [at.field]: value }, rowAt(at.seq)?.version)
        .then((out) => {
          if (asked !== was) {
            if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
            return;
          }
          dropPatch(at.seq, at.field);
          clearReceipt(at.seq);
          if (out.ok) {
            landRow(out.entry);
            receipt(at.seq, { mark: copy.writeMarkSaved, intent: 'good' });
            return;
          }
          missed(was, out);
          if (editing === null) {
            editing = at;
            editValue = said;
          }
        });
      return;
    }

    /* AND TYPING THE ORIGINAL BACK IS NOT AN EDIT EITHER, IT IS AN UNDO. The comparison above is
       against what is on screen, so this one is against what the record holds: reaching the record's
       own value by hand drops the patch and takes the receipt with it, rather than recording a
       change from a value to itself. */
    const held = rowAt(at.seq);
    const next = new Map(edits);
    const patch = { ...(next.get(at.seq) ?? {}) };
    if (held && said === asText(held.fields[at.field])) {
      delete patch[at.field];
      if (Object.keys(patch).length === 0) next.delete(at.seq);
      else next.set(at.seq, patch);
      edits = next;
      if (!next.has(at.seq)) clearReceipt(at.seq);
      return;
    }

    next.set(at.seq, { ...patch, [at.field]: said === '' ? null : said });
    edits = next;
    receipt(at.seq, {
      mark: copy.markNotWritten,
      intent: 'warn',
      undo: () => {
        const back = new Map(edits);
        const left = { ...(back.get(at.seq) ?? {}) };
        delete left[at.field];
        if (Object.keys(left).length === 0) back.delete(at.seq);
        else back.set(at.seq, left);
        edits = back;
        /* AND ONLY WHEN THERE IS NOTHING LEFT TO REPORT. Undoing one cell of a row that has two
           unsaved cells on it cleared the row's whole receipt, so the second change stayed in the
           map and on the screen with nothing marking it: an unsaved value wearing the record's
           face, which is the one thing the receipt exists to prevent. */
        if (!back.has(at.seq)) clearReceipt(at.seq);
      },
    });
    toasts.push(copy.notWritten(`${id}#${at.seq} ${labelOf(fieldOf(at.field)!) .toLowerCase()} would be ${said || 'cleared'}`), {
      intent: 'warn',
    });
  }

  const copyId = (seq: number) => clipboard.putSpoken(id, seq);

  /**
   * The LINK, not the id. `⇧Y` has been on the `?` sheet since the registry was written and was
   * bound nowhere: `e.key` for shift-Y is `'Y'`, so the `'y'` branch never saw it and the sheet was
   * advertising a key that did nothing. A cheat sheet is only a cheat sheet if it is true.
   *
   * Two outcomes, same as `copyId`, and the toast says which — the clipboard is absent over plain
   * HTTP and in a sandboxed frame.
   */
  const copyLink = (seq: number) => clipboard.putLink(id, seq);

  /* Column 2, not 1: 0 is the picker and 1 is the spoken id, so the caret starts on the first cell
     that says what the row IS. It was 1 when the id was the leading column.

     AND THE PICKER IS NOT ALWAYS THERE. It is drawn only once the list is big enough to act on in
     bulk, so on a short list the same cell is one column to the left. A caret that starts on the id
     rather than on the title is a smaller mistake than one that starts past the end, which is why
     this clamps rather than counting: `columns` is the list on screen and it is the only thing that
     knows how long it is. */
  let focus = $state({ row: 0, col: 2 });

  /* THE CARET IS KEPT INSIDE THE COLUMNS THERE ARE. Arrowing already clamps, and the starting
     column did not: a register with two columns and no picker put the caret past the end of every
     row, where `columns[focus.col]` is `undefined` and `e` and `Enter` both did nothing. It moves
     only when it has to, so a reader who has arrowed somewhere keeps their place. */
  $effect(() => {
    const last = columns.length - 1;
    if (focus.col > last) focus = { ...focus, col: Math.max(0, last) };
  });
  /**
   * THE PEEKED ROW IS IN THE URL, and the comment above used to say it was not.
   *
   * `19 §5`'s table puts *open drawers* in component state and this file read the peek as one of
   * those. It is not: `19 §2` names it in its own row — "Entry peek | `/r/obligations?row=7` — a
   * 480px drawer, list still visible, for triage" — and `§5` gives *Focused row* the same
   * `?row=7`, with the note that deep-linking a paged list needs a stable key and never an index.
   *
   * WHAT IT COST WAS TWO THINGS A PERSON DOES CONSTANTLY. Copying the URL out of a peek sent a
   * colleague the whole list rather than the row being discussed, and Back — the gesture every
   * person on earth uses to close a thing that opened over what they were reading — left the
   * register entirely.
   *
   * THE KEY IS `seq`, WHICH IS THE STABLE ONE. `focus.row` is an index into whatever is on screen
   * and moves when a filter does; `#7` is `#7` under every sort this list has.
   */
  /* AND A ZERO IS THE ONLY NUMBER THAT IS NOT A ROW. This read `said > 0`, which was right on the
     day it was written and wrong the day `pending` started minting NEGATIVE sequences for rows
     somebody has typed and the record has not been given. Pressing `p` on an unwritten row wrote
     `?row=-1` into the URL, made a real history entry, and opened nothing; the row menu's Peek item
     was equally dead, and the `?` sheet advertises the key with no condition on it. The detail
     route learnt about pending rows and this drawer did not, so `/r/obligations/-1` opened and `p`
     on the same row did nothing at all. */
  const peeked = $derived.by(() => {
    const said = Number(page.url.searchParams.get('row'));
    return Number.isInteger(said) && said !== 0 ? said : null;
  });

  const peek = (seq: number | null) =>
    setParam((p) => {
      if (seq === null) p.delete('row');
      else p.set('row', String(seq));
    });

  const peekedEntry = $derived(
    peeked === null ? undefined : (rowAt(peeked) ?? pending.of(id, sample).find((r) => r.seq === peeked)),
  );

  /** Only INDEXED fields are offered, in declaration order, at most eight. A filter on an unindexed
      field is a promise the storage cannot keep at 5,000 rows. */

  const filterable = $derived(filterableOf(decl?.fields ?? []));

  /** The offer itself, read by the bar and by the pills' counts, so the two are one list. */
  function filterableOf(fields: RegisterDecl['fields']): RegisterDecl['fields'] {
    return fields.filter((f) => f.index).slice(0, 8);
  }

  /**
   * HOW MANY ROWS HOLD EACH PILL'S VALUE, printed quietly beside its word.
   *
   * A facet count: the rows holding the value under every OTHER filter and the search, so a pill
   * says what it holds whether or not its own field is filtered yet. The record counts them, one
   * `limit: 1` list per value, while the bar is on screen (`ask`). Rows typed here and edits made
   * here are added on top, because the list below draws them and the record has not been told.
   *
   * AN EDIT MOVES ITS ROW FROM ONE PILL TO ANOTHER, and only a row in hand can have been edited.
   * Every row in hand answers the whole question, so it answers the pill's question too, and moving
   * its count from the value the record holds to the one typed here is exact.
   */
  const facets = $derived.by(() => {
    const out = new Map<string, Map<string, number>>();
    const bump = (n: Map<string, number>, v: unknown, by: number) => {
      const key = String(v ?? '');
      n.set(key, (n.get(key) ?? 0) + by);
    };
    for (const [field, held] of counted) {
      const n = new Map(held);
      for (const e of pending.of(id, sample)) bump(n, e.fields[field], 1);
      for (const e of pages.flat()) {
        const patch = edits.get(e.seq);
        if (!patch || !Object.hasOwn(patch, field)) continue;
        bump(n, e.fields[field], -1);
        bump(n, patch[field], 1);
      }
      out.set(field, n);
    }
    return out;
  });


  /**
   * WHETHER THIS LIST IS BIG ENOUGH TO NEED SIFTING THROUGH.
   *
   * `result.total` AND NOT `result.matched`, because the question is about the list and not about
   * what is on screen: filtering thirty-eight rows down to one must not remove the control that got
   * you there. The two differ exactly when somebody is already sifting.
   */

  /**
   * THE FIELDS THE BOX ACTUALLY MATCHES, READ FROM THE DECLARATION.
   *
   * This derived them from `filterable` — indexed, non-enum, non-numeric — which is a different set
   * from `search: true`, and after the box became the `matches` operator it was a set with almost
   * nothing in common. Measured on the shipped seed, the note under the box read *"Party and Project
   * are matched by the search box"* on `obligations`, where the only searchable field is `what`, and
   * *"Project and Track"* on `tasks`, where it is also `what` alone. Typing a project name found
   * nothing under a sentence promising it would.
   *
   * A sentence explaining the interface is against the house rule to begin with; one that explains
   * it wrongly teaches somebody the product is smaller than it is — which is the argument its own
   * sibling was deleted for.
   */
  const searched = $derived(searchable(id).map(labelOf));

  const kindOf = (f: { type: string }): 'search' | 'sort' =>
    f.type === 'money' || f.type === 'int' || f.type === 'decimal' || f.type === 'day' || f.type === 'instant'
      ? 'sort'
      : 'search';

  function setParam(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(page.url.searchParams);
    mutate(next);
    goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  }

  /**
   * TYPING IS NOT NAVIGATING, and this box was pushing a history entry per keystroke.
   *
   * `19 §5` says it in as many words: *"`pushState` for discrete intent so Back undoes a filter,
   * **throttled `replaceState` for typing**"*. Pressing a chip is intent — you decided to narrow
   * the list and Back should undo that decision. Typing `overdue` is one decision spelled over seven
   * keystrokes, and it left seven entries, so Back became a character-by-character rewind of
   * something nobody thinks of as navigation.
   *
   * THE THROTTLE ALSO PAYS FOR ITSELF ON THE OTHER SIDE. Every keystroke re-ran `applyFilters`,
   * which formatted every field of every row through `display()`; at five thousand rows that was
   * seven full scans for one word. The scan is the register's declared `search:` fields now
   * (`find.ts`) — one or two per row instead of every one — which is both the faster answer and the
   * one `34 §6` says the box gives.
   *
   * AND THE TIMER IS CANCELLED WHEN THE PAGE GOES. It was not, so a `goto` fired 150 ms after you
   * had already clicked away, on whatever route you had arrived at: typing `rent` and clicking a nav
   * link inside the throttle landed you on **`/inbox?q=rent`**, and clicking on from there gave
   * `/r/services?q=rent` — a list filtered by a word typed into a different one, showing its empty
   * state. A pending write to a URL is only ever about the page that scheduled it.
   */
  let typing: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(typing));

  function setQuery(value: string) {
    clearTimeout(typing);
    typing = setTimeout(() => {
      const next = new URLSearchParams(page.url.searchParams);
      if (value) next.set('q', value);
      else next.delete('q');
      goto(`?${next}`, { replaceState: true, noScroll: true, keepFocus: true });
    }, 150);
  }

/**
   * A value is SELECTED when the filter includes it, and a `not-in` filter includes nothing.
   *
   * The test used to be `values.includes(value)` with no regard for the operator, so the URL a
   * declared metric hands the reader — `?f=state:not-in:cancelled`, the one that opens "Cost per
   * year" — drew `cancelled` as the value being shown. Fifteen live rows on screen, and the control
   * above them saying the one word none of them held.
   */
  const isOn = (field: string, value: string): boolean => {
    const f = filters.find((x) => x.field === field);
    if (!f) return false;
    /* A SEGMENT SAYS WHAT YOU ARE LOOKING AT, so under a `not-in` filter it is on when the value is
       NOT excluded — which is what the grid underneath it shows. Reading `values.includes` for both
       operators drew `cancelled` as the selected state on the one URL a metric tile hands the
       reader, with fifteen live rows under it and not one cancelled. */
    /* COMPARED AS THE FIELD DECLARES IT, so a link written before there was one canonical spelling
       still lights the control it named. Every URL this build writes carries the declared value; a
       bookmark from before does not, and a bookmark is exactly the thing that outlives a fix. */
    const held = f.values.map((v) => declaredValue(id, field, v));
    const want = declaredValue(id, field, value);
    return f.op === 'not-in' ? !held.includes(want) : held.includes(want);
  };

  /**
   * Toggling KEEPS THE OPERATOR. It always wrote `:in:`, so one press on a neighbouring segment of a
   * `not-in` filter turned exclusion into inclusion and pulled the excluded rows back in — silently,
   * and in the direction that adds rows to a figure somebody had just clicked through to check.
   */
  const toggleFilter = (field: string, value: string) =>
    setParam((p) => {
      const existing = p.getAll('f').filter((v) => !v.startsWith(`${field}:`));
      const at = filters.find((f) => f.field === field);
      const op = at?.op ?? 'in';
      const current = at?.values ?? [];
      const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      p.delete('f');
      for (const v of existing) p.append('f', v);
      if (values.length) p.append('f', `${field}:${op}:${values.join(',')}`);
    });

  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    /* THE ONE TEST FOR WHETHER SOMEBODY IS TYPING, rather than a narrower copy of it. This read
       INPUT and TEXTAREA only, so a bare key fired over an open select and inside a contenteditable
       block, both of which `keys.svelte.ts` has always covered.

       IMPORTED UNDER A SECOND NAME BECAUSE THIS FILE ALREADY HAS A `typing`, and it is a debounce
       handle for the query field rather than anything about fields being focused. Aliasing here is
       smaller than renaming a local in a file this size that other work may be sitting in. */
    if (isTyping()) return;

    /* THE CHORDS COME FIRST, and the blanket `if (modifier) return` above them was eating four of
       them: `⌘Home`, `⌘End`, `⌘a`, `⌥V` and `⌥B` were all registered in the keymap, printed on `?`,
       and dropped one line into the handler. A guard written to protect the BARE letters was
       protecting them from keys that are not bare. */
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Home') {
      e.preventDefault();
      focus = { row: 0, col: focus.col };
      return;
    }
    if (mod && e.key === 'End') {
      e.preventDefault();
      focus = { row: rows.length - 1, col: focus.col };
      return;
    }
    if (mod && e.key.toLowerCase() === 'a' && siftable) {
      /* All LOADED, never all matching. A select-all reaching rows the DOM has never held is a
         count you cannot verify by looking — the same argument as 13 §4.3's 2,000-row cap, from the
         other side. */
      e.preventDefault();
      selected = new Set(result.entries.slice(0, DOM_CAP).map((r) => r.seq));
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      if (sample) toasts.push(copy.notWritten(copy.viewWouldBeSaved), { intent: 'warn' });
      else void saveView();
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'b') {
      /* IT OPENS THE BINDER, which is 204 lines that nothing could reach. The chord already holds
         the register and the filters — which is everything the binder needs — and it answered with
         a toast describing what it would do instead of doing the readable half of it. The sentence
         it builds, its destination picker and its "a page cannot read a register it did not
         declare" rule were all written and none of them had ever been on a screen. */
      e.preventDefault();
      bindOpen = true;
      return;
    }
    if (e.shiftKey && e.key === 'Y') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        void copyLink(row.seq);
      }
      return;
    }
    if (e.shiftKey && e.key === 'F10') {
      e.preventDefault();
      openRowMenu();
      return;
    }
    if (e.key === 'ContextMenu') {
      e.preventDefault();
      openRowMenu();
      return;
    }
    if (mod || e.altKey) return;
    /* THE BARE NAMESPACE, AND THE SWITCH THAT TURNS IT OFF. Everything above this line is a chord or
       a named key and keeps working; everything below is a single character and does not. The arrows
       are below it and survive, because an arrow is not a character shortcut. */
    if (silenced(e)) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      focus = { ...focus, row: Math.min(focus.row + 1, rows.length - 1) };
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      focus = { ...focus, row: Math.max(focus.row - 1, 0) };
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus = { ...focus, col: Math.min(focus.col + 1, columns.length - 1) };
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus = { ...focus, col: Math.max(focus.col - 1, 0) };
    } else if (e.key === 'p') {
      e.preventDefault();
      peek(result.entries[focus.row]?.seq ?? null);
    } else if (e.key === 'Enter') {
      const row = result.entries[focus.row];
      if (row) goto(`/r/${id}/${row.seq}`);
    } else if (e.key === 'v') {
      e.preventDefault();
      displayOpen = true;
    } else if (e.key === 'y') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        void copyId(row.seq);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        /* AND THE CARET STAYS ON THE ROW, which is where the person is looking. This walked it up
           one with `Math.min(focus.row, length - 2)`, left over from when archiving took the row off
           the screen and something had to happen to a caret pointing past the end. `archive()`
           writes a receipt and removes nothing, on purpose: the row is drawn where it was, wearing
           what happened to it, so the reader can check they hit the right one. The only press the
           old line could ever change was one on the LAST row, which jumped the caret to the
           second-to-last for no reason a person could see. */
        archive(row.seq);
      }
    } else if (e.key === 'Home') {
      /* Bare `Home`/`End` are ROW ends; with the modifier they are REGISTER ends. The distinction is
         the whole reason both exist — a grid where Home jumps to row one is a grid where you cannot
         get back to the first column without arrowing across it. */
      e.preventDefault();
      focus = { ...focus, col: 0 };
    } else if (e.key === 'End') {
      e.preventDefault();
      focus = { ...focus, col: columns.length - 1 };
    } else if (e.key === 'n') {
      e.preventDefault();
      createOpen = true;
    } else if (e.key === 'o') {
      /* The RELATED register: the one the focused cell points at. A `ref` cell knows its target, so
         `o` follows it; on any other cell there is nothing related and nothing happens. */
      const field = columns[focus.col]?.field;
      const to = field ? decl?.fields.find((f) => f.id === field)?.to : undefined;
      if (to) {
        e.preventDefault();
        void goto(`/r/${to}`);
      }
    } else if ((e.key === 'x' || e.key === 'X') && siftable) {
      /* `X` and not `x` when shift is down — `e.key` carries the SHIFTED character, so a check for
         the lowercase letter alone silently drops every `⇧x`. */
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        toggleSelect(row.seq, e.shiftKey);
      }
    } else if (e.key === 'Escape' && selected.size > 0) {
      e.preventDefault();
      selected = new Set();
    } else if (e.key === 'e' || e.key === 'F2') {
      /* THE KEY WAS ON THE `?` SHEET AND ANSWERED WITH A SENTENCE about what it would have done.
         The cell under the caret is the one that opens: `focus.col` is where the grid's own caret
         is, which is what the reader is looking at, and going to any other cell would be the
         product choosing for them. */
      e.preventDefault();
      const row = result.entries[focus.row];
      const field = columns[focus.col]?.field;
      if (row && field) openEditor(row.seq, field);
    }
  }

  /**
   * Selection, and it is CLIENT STATE that never leaves.
   *
   * `x` toggles, `⇧x` extends from the last one touched, `⌘a` takes everything loaded, `Esc` clears.
   * The anchor is the last SIMPLE toggle rather than the last change, which is what makes a run of
   * `⇧x` presses extend the same range instead of walking it.
   */
  let selected = $state(new Set<number>());
  let anchor = 0;

  /**
   * ⇧F10 and the context-menu key — AND, ON A PHONE, THE ⋯ ON A CARD.
   *
   * The rect is taken at open and not tracked: a menu that follows a scrolling row is a menu that
   * walks away from the pointer.
   *
   * `menuRow` READ `result.entries[focus.row]`, which is the row the KEYBOARD is on. That is the
   * same row on a keyboard and no row at all on a phone, where `focus.row` is 0 and nothing has
   * moved it — so a card menu would have offered Peek, Copy and Archive for whichever row happened
   * to be first. The menu is about a row, so it holds the row.
   */
  let menuAt = $state<{ x: number; y: number; height: number } | null>(null);
  let menuSeq = $state<number | null>(null);
  const menuOpen = $derived(menuAt !== null);
  const menuRow = $derived(result.entries.find((e) => e.seq === menuSeq));

  function openRowMenu() {
    /* WHICHEVER BODY IS ON THE SCREEN. This looked for `.tr` alone, and once the card list and the
       grid stopped both being built, `⇧F10` found nothing below 640px and the row menu stopped
       opening at all — the a11y gate's own scenario caught it. It had never really worked there
       either: a `display: none` row still matches a selector and reports a zero rect, so the menu
       used to open in the top-left corner of the window rather than beside the row. */
    const el =
      document.querySelectorAll('.rowgroup .tr')[focus.row] ??
      document.querySelectorAll('.cards > li')[focus.row];
    if (!el) return;
    const r = el.getBoundingClientRect();
    menuAt = { x: r.x + 24, y: r.y, height: r.height };
    menuSeq = result.entries[focus.row]?.seq ?? null;
  }

  /** The same menu, opened by touch from the card's own trailing control. */
  function openCardMenu(seq: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    menuAt = { x: r.x, y: r.y, height: r.height };
    menuSeq = seq;
  }

  /** The Table speaks in row KEYS (`register#seq`), which is the id a row is addressed by. */
  const selectedKeys = $derived(new Set([...selected].map((seq) => `${id}#${seq}`)));

  function toggleSelect(seq: number, extend: boolean) {
    const at = result.entries.findIndex((r) => r.seq === seq);
    if (extend) {
      const [from, to] = anchor <= at ? [anchor, at] : [at, anchor];
      const next = new Set(selected);
      for (const row of result.entries.slice(from, to + 1)) next.add(row.seq);
      selected = next;
      return;
    }
    anchor = at;
    const next = new Set(selected);
    if (next.has(seq)) next.delete(seq);
    else next.add(seq);
    selected = next;
  }

  /* ── the verbs a selection is FOR ──────────────────────────────────────────
     The anchor-extend model was implemented, drawn, and consumed by nothing: a selection you can
     make and cannot use is a mode you enter and cannot leave usefully. Three verbs, and the first
     of them is the one that actually works here — a mock has no write path, and the rule for that
     is the app's own: say what it would have done, once, in the toast. */

  /**
   * THE SELECTION, CUT TO THE ANSWER ON SCREEN.
   *
   * `selected` is a set of numbers and nothing pruned it when the filter or the query changed, so a
   * reader could tick five rows, search, see two ticks and a toolbar saying five, press Archive, and
   * archive three rows they could not see. Every verb and every count reads this, not the set: what
   * a bulk action acts on is what the reader is looking at.
   */
  const picked = $derived(result.entries.filter((e) => selected.has(e.seq)));

  async function copyIds() {
    const text = picked.map((e) => `${id}#${e.seq}`).join(' ');
    try {
      await navigator.clipboard.writeText(text);
      toasts.push(copy.copied(`${picked.length} ${picked.length === 1 ? 'number' : 'numbers'}`));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }

  /**
   * Move every selected row's state: one change per row, then one sentence for all of them.
   *
   * ONE AT A TIME, so a refusal on the third row is the record's answer about that row and not one of
   * eight racing answers. The toast says how many landed and, when one did not, the first reason.
   */
  async function setPickedState(state: string) {
    const said = state.replace(/_/g, ' ');
    const field = decl?.state;
    if (sample || !field) {
      toasts.push(copy.notWritten(`${picked.length} rows would be set to ${said}`), { intent: 'warn' });
      return;
    }
    const was = asked;
    const total = picked.length;
    const rows = picked.filter((e) => e.seq > 0);
    let landedCount = 0;
    let first: string | null = null;
    for (const e of rows) receipt(e.seq, { mark: copy.writeMarkSaving, intent: 'warn' });
    for (const e of rows) {
      const out = await writes().update(id, e.seq, { [field]: state }, e.version);
      if (out.ok) landedCount += 1;
      else first ??= out.fix;
      if (asked !== was) continue;
      clearReceipt(e.seq);
      if (out.ok) {
        landRow(out.entry);
        receipt(e.seq, { mark: said, intent: 'good' });
      } else if (out.why === 'conflict' && out.entry) landRow(out.entry);
    }
    const line = copy.writeBulk(landedCount, total, said);
    toasts.push(first ? `${line} ${first}` : line, landedCount === total ? {} : { intent: 'warn' });
  }

  /**
   * Archive rows on the record, one at a time, and give each one back from where it is drawn.
   *
   * THE ROW STAYS WHERE IT WAS, wearing `Archived` and `Put back`, the receipt the sample has always drawn; the record
   * leaves it out of the next read. Put back and the toast's undo are the same write the other way: `deleted_at` null,
   * at the version the archive answered with. No dialog, because an undo says what happened and a dialog asks first.
   */
  async function archiveOnRecord(seqs: readonly number[], named: string) {
    const was = asked;
    const landed: Entry[] = [];
    let first: string | null = null;
    for (const seq of seqs) hold(seq);
    for (const seq of seqs) receipt(seq, { mark: copy.writeMarkSaving, intent: 'warn' });
    for (const seq of seqs) {
      const out = await writes().archive(id, seq, rowAt(seq)?.version);
      if (out.ok) landed.push(out.entry);
      else first ??= out.fix;
      if (asked !== was) continue;
      clearReceipt(seq);
      if (out.ok) {
        const row = out.entry;
        landRow(row);
        receipt(seq, { mark: copy.markArchived, undo: () => void restoreOnRecord([row]) });
      } else if (out.why === 'conflict' && out.entry) landRow(out.entry);
    }
    if (landed.length === 0) {
      toasts.push(first ?? copy.writeNotReached, { intent: 'warn' });
      return;
    }
    const line = landed.length === seqs.length ? copy.writeArchived(named) : copy.writeArchivedSome(landed.length, seqs.length);
    toasts.push(first ? `${line} ${first}` : line, { undo: () => void restoreOnRecord(landed), ...(first ? { intent: 'warn' as const } : {}) });
  }

  /**
   * `⌥V` on a live record: what is on screen, saved as a page under Views, and that page opened.
   *
   * NO NAMING DIALOG. The address already says which rows these are, so the name is the list and its filter in the
   * list's own words, and the toast's undo retires the page and comes back here. See `viewPage` for why it is a page.
   */
  async function saveView() {
    if (!decl) return;
    if (filters.length === 0 && q === '') {
      toasts.push(copy.viewNeedsFilter, { intent: 'warn' });
      return;
    }
    const clauses = filters.map((f) => {
      const field = decl.fields.find((d) => d.id === f.field);
      return copy.filterClause(field ? labelOf(field) : f.field, f.values.map((v) => v.replace(/_/g, ' ')), f.op);
    });
    const title = copy.viewTitle(decl.name, copy.filterReads(q ? [...clauses, `"${q}"`] : clauses));
    const back = `${page.url.pathname}${page.url.search}`;
    const drawn = columns.map((c) => c.field).filter((f) => f !== 'select' && f !== 'act' && f !== 'seq');
    const out = await writes().saveView(id, title, { filters, q, sort }, drawn);
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    await goto(`/p/${out.slug}`);
    toasts.push(copy.viewSaved(title), {
      undo: () =>
        void writes()
          .dropView(out.id)
          .then((gone) => {
            if (gone.ok) void goto(back);
            else toasts.push(gone.fix, { intent: 'warn' });
          }),
    });
  }

  /** Put archived rows back. A row this screen has read since is sent at the version it now holds. */
  async function restoreOnRecord(rows: readonly Entry[]) {
    const was = asked;
    let first: string | null = null;
    for (const e of rows) {
      const out = await writes().restore(id, e.seq, rowAt(e.seq)?.version ?? e.version);
      if (!out.ok) first ??= out.fix;
      if (asked !== was) continue;
      if (out.ok) {
        landRow(out.entry);
        receipt(e.seq, { mark: copy.writeMarkRestored, intent: 'good' });
      } else if (out.why === 'conflict' && out.entry) landRow(out.entry);
    }
    if (first) toasts.push(first, { intent: 'warn' });
  }

  function archiveSelected() {
    const seqs = picked.map((e) => e.seq);
    if (!sample && seqs.every((seq) => seq > 0)) {
      selected = new Set();
      void archiveOnRecord(seqs, `${seqs.length} ${(seqs.length === 1 ? decl?.one : decl?.name)?.toLowerCase() ?? 'rows'}`);
      return;
    }
    /* AND EACH ROW GETS ITS OWN `Put back`, WHICH THE BULK PATH DID NOT GIVE IT. Archiving one row
       writes a receipt carrying an undo, so the row keeps a way back for as long as it is drawn.
       Archiving eight wrote eight receipts with no undo on any of them and put the only way back in
       a toast that expires after ten seconds: same verb, same rows, one of the two reversible after
       a pause. The toast keeps its own undo for all of them at once, which is the thing a person
       reaches for immediately; the row keeps the one they find later. */
    const next = new Map(receipts);
    for (const seq of seqs)
      next.set(seq, { mark: copy.markArchived, intent: 'warn' as const, undo: () => clearReceipt(seq) });
    receipts = next;
    selected = new Set();
    /* ONE ROW IS NOT "1 obligations". The register declares both spellings — `name` for the list
       and `one` for a row of it — and this read only the first, so every single-row bulk archive
       said the plural. The keyboard path next door has always said `obligations#1`. */
    toasts.push(
      copy.archived(
        `${seqs.length} ${(seqs.length === 1 ? decl?.one : decl?.name)?.toLowerCase() ?? 'rows'}`,
      ),
      {
        undo: () => {
          const back = new Map(receipts);
          for (const seq of seqs) back.delete(seq);
          receipts = back;
          selected = new Set(seqs);
        },
      },
    );
  }

  /** The register's own states, so the menu is the vocabulary rather than a list typed here. */
  const states = $derived(decl?.fields.find((f) => f.id === decl.state)?.values ?? []);
  /* AND ITS OWN NAME FOR THE COLUMN, so the verb over the menu says what the header says. */
  const stateLabel = $derived.by(() => {
    const f = decl?.fields.find((x) => x.id === decl.state);
    return f ? labelOf(f) : 'state';
  });

  const emptyKind = $derived(
    result.total === 0 ? 'no-data-yet' : q || filters.length ? 'no-results' : 'cleared',
  );

  /**
   * THIS SCREEN FETCHES, AND SAYS WHAT IT DREW ONCE IT HAS.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. `ask` and `more` bracket their reads with the screen's
   * counters, so while a question is out there is no attribute whatever this line says. `Empty` says
   * `empty` or `refused` for the states it draws, and this is the claim for the rest.
   */
  $effect(() => drew('ready'));

  /* WHETHER ANY ROW IN HAND HAS A PROJECT'S MARK. When one does, every title keeps the mark's slot,
     so a row with no project starts where its marked neighbours do (DESIGN-SYSTEM appendix C3). */
  const anyMark = $derived(
    bySeq.size > 0 && [...bySeq.values()].some((e) => identityFor(id, e.fields, result.names ?? undefined) !== null),
  );
</script>

<svelte:head><title>{titleOf(decl?.name)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if refusal && refusal.code !== 'REGISTER_UNKNOWN'}
  <!-- THE RECORD SAID NO, AND ITS SENTENCE IS THE BODY, verbatim (`13 §6`). What the record wrote
       is the most specific thing anybody can say about why this list is not here, and a sentence
       rewritten here would be a guess about it. -->
  <div class="page">
    <Empty kind="error" heading title={copy.screenFailed} body={refusal.fix}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if !decl && !refusal}
  <!-- LOADING. The answer is a round trip away, and a placeholder list would be rows that are not
       there, so it is bars with no words in them, after 300ms (`Waiting.svelte`). `aria-busy` says
       the region is on its way, and `data-screen` stays off until it has arrived. -->
  <div aria-busy="true"><Waiting head rows={8} /></div>
{:else if !decl}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty
      kind="error"
      heading
      title={copy.noSuch('list', id)}
      body={copy.theseExist('Lists', (booted?.registers ?? []).map((r) => r.name))}
    >
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(decl.icon, 'rows')}
    title={decl.name}
    count={whole ? result.matched : drawn}
    atLeast={!whole && !truncated && drawn < DOM_CAP}
    total={denominator}
  >
    <!--
      THE FILTER DRAWER IS GONE, AND THE CHIPS ARE THE FILTER.

      It rendered `filterable.filter((f) => f.type === 'enum')` — the SAME expression as the
      segmented controls in the toolbar — as checkboxes, behind a scrim, over the identical six
      controls still visible underneath it. The bar wraps, so the chips are never hidden at any
      width: the drawer was duplication everywhere, always, and pressing Filter took a person to a
      second copy of what they were already looking at.

      A drawer earns its place when there are more fields than fit. At six there is nothing to fit.
    -->
    {#snippet actions()}
      <!-- ON A PHONE THE FIELD IS THE WAY IN, AND THIS GOES. The capture field and this button both
           started a row, one under the other, and on a phone the button took a line of its own over
           the field that does the same thing in fewer presses. It stays while the field is hidden
           (`?first`), and on a laptop, where it opens the whole form and sits beside the title. -->
      <span class="new-row" data-alone={arriving ? '' : undefined}>
        <Button weight="primary" onclick={() => (createOpen = true)}><Icon name="plus" size="s" />{copy.newRow} {decl.one}</Button>
      </span>
    {/snippet}
  </PageHead>

  <div class="page" aria-busy={busy ? 'true' : undefined}>
    <!-- THE SAMPLE SAYS SO, in the sample bar's own sentence and no louder. There is no record for
         this tab to read, so these rows are the in-browser sample every other screen draws; that is
         where they came from, not something that went wrong. See `open` in `lib/data/record.ts`,
         which is also where this stops being reachable. -->
    <!-- AND ONLY ONCE THE SAMPLE BAR HAS BEEN PUT AWAY. While the bar stands at the top of the panel
         this printed its first sentence a second time, forty pixels under it. -->
    {#if sample && pref.read().sampleSaid === true}<p class="sample-note">{copy.sampleWhat}</p>{/if}
    <!--
      CAPTURE, FIRST ON THE PAGE.

      IT WAS A MODAL BEHIND A BUTTON, asking for every declared field. The add is the most frequent
      write a person makes to a list and it was the most expensive one on this screen: a press, a
      dialog, a form, a submit, a dismissal. This is a press and a return key.

      THE SUBMIT CONTROL IS INSIDE THE FIELD AND ONLY EXISTS ONCE THERE IS SOMETHING TO ADD, which
      is the one place a button of this kind is not clutter: it appears exactly when it can do
      something, so it is never a control a reader has to learn to ignore.

      `form` AND `type="submit"` RATHER THAN A KEYDOWN HANDLER, because Enter in a single-field form
      is the platform's own behaviour and a phone's keyboard prints "Go" for it without being asked.

      ABOVE THE SEARCH AND THE FILTERS, because it is the one thing here that does not act on the
      rows below it. AND NOTHING UNDER IT: a sentence sat there on every visit saying what a new row
      would still be missing or take from the filter. The row says what it is missing once it
      exists, in its cells and its receipt; said in advance, over the list, it was the screen
      explaining itself.
    -->
    {#if !arriving}
      <form
        class="capture"
        onsubmit={(e) => {
          e.preventDefault();
          captureRow();
        }}
      >
        <label class="capture-label" for="capture">{copy.captureIn(decl.one)}</label>
        <div class="capture-field">
          <Icon name="plus" size="m" />
          <input
            id="capture"
            class="capture-input"
            type="text"
            autocomplete="off"
            bind:value={capture}
            placeholder={copy.captureIn(decl.one)}
          />
          <!-- Present only once there is something to add. -->
          {#if capture.trim()}<button type="submit" class="capture-go">{copy.captureAdd}</button>{/if}
        </div>
      </form>
    {/if}

    <!-- THE BAR APPEARS WHEN THERE IS SOMETHING TO SIFT. Below eight rows it was a search box, six
         chips and a keyboard strip standing over a list you could already read — and on the first
         run it stood over the one row somebody had just typed. -->
    {#if siftable || q || filters.length}
    <div class="bar">
      <label class="field">
        <Icon name="search" size="s" />
        <!-- A NAME, NOT A PLACEHOLDER. The input sits in a `<label>` whose only other child is an
             `aria-hidden` icon, so its accessible name came from the placeholder alone — which
             disappears the moment somebody types, taking the name with it. Every search box in the
             product had the same shape. -->
        <input
          class="field-input"
          type="search"
          aria-label={copy.searchIn(decl.name)}
          placeholder="Search {decl.name.toLowerCase()}"
          value={q}
          oninput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      </label>

      <!-- EVERYTHING AFTER THE SEARCH BOX, IN ONE BOX, so a phone can scroll the chips without
           scrolling the search away. On a laptop this is `display: contents` and the bar is the
           single row it always was. -->
      <div class="bar-rest">
      {#each filterable.filter((f) => f.type === 'enum') as f}
        <div class="segmented" role="group" aria-label={labelOf(f)}>
          {#each f.values ?? [] as value}
            {@const on = isOn(f.id, value)}
            <!-- `aria-pressed`, BECAUSE THE STATE WAS ONLY A COLOUR. A raised white segment says
                 "this filter is on" to whoever can see it and nothing at all to anybody else — and
                 which filters are on is the whole of what the grid underneath is showing. `data-on`
                 is the style hook; this is the fact. `RowForm`'s own segmented control has carried it
                 since it was written, so the two were a pair that had drifted. -->
            <button
              type="button"
              class="segment"
              data-on={on ? '' : undefined}
              aria-pressed={on ? 'true' : 'false'}
              onclick={() => toggleFilter(f.id, value)}
            >
              <span class="segment-word">{copy.valueWord(value)}</span>
              <span class="segment-n">{facets.get(f.id)?.get(value) ?? 0}</span>
            </button>
          {/each}
        </div>
      {/each}

      {#if q || filters.length}
        <Button weight="bare" href="/r/{id}"><Icon name="close" size="s" />{copy.clearFilters}</Button>
      {/if}

      <!-- DISPLAY WAS A KEY AND NOTHING ELSE. `v` opens this sheet, the keymap sheet prints it, and
           on a phone neither of those is reachable — so which columns you see and, now, what the
           list is sorted by were both unreachable on the device where the table that carries them
           is `display: none`. `19 §4` makes the key an accelerator OVER a visible control; there was
           no control to accelerate.

           IT IS IN THE BAR, which appears at eight rows. Below that there is nothing to sort and
           nothing worth hiding, and the bar's own comment already argues why standing a strip of
           controls over a list you can read at a glance is worse than not having them. -->
      <!-- AT THE END OF THE BAR, where a keyboard strip used to stand. It printed four bindings
           to every visitor on every visit, `j k` move, `p` peek, Enter open and archive: a screen
           explaining its own interface to people who had not asked. The bindings are untouched.
           The `?` sheet lists them by reading the registry, and the row menu prints each verb's
           key beside it, which is where somebody learning them is already looking. -->
      <span class="bar-end">
        <Button weight="bare" onclick={() => (displayOpen = true)}>
          <Icon name="settings" size="s" />{copy.display}
        </Button>
      </span>
      </div>
    </div>
    {/if}

    {#if rows.length === 0}
      <!-- THE QUERY IS QUOTED VERBATIM, in its own line and in the id face, rather than folded into
           the title as a curly-quoted fragment of a sentence. That is where a predicate stops being
           checkable: a reader cannot tell a filter they typed from one the app built. `Empty` has
           had the prop and the styling for it since it was written and no call site passed it.

           AND BOTH HALVES OF IT, because both narrowed the list. It read `q || whereOf(filters)`,
           which dropped every active chip the moment a search term existed: at `?q=zzz&f=state:in:paid`
           the `paid` chip reads `aria-pressed="true"` on screen and the sentence underneath said
           "38 rows, none matching: zzz". Half a query quoted verbatim is the same failure the
           paragraph above describes, committed by the line below it.

           VERBATIM IS THE READER'S WORDS, NOT THE COLUMN'S. `whereOf` builds the sentence the
           evaluator reads, so it spells the stored value — `direction is owed_to_me` — and the chip
           the reader actually pressed says "owed to me". Quoting the storage would show them a
           filter they never set. The typed search term passes through exactly as typed, because
           that one IS their words. -->
      <Empty
        kind={emptyKind}
        glyph={emptyKind === 'no-data-yet' ? iconFor(decl.icon, 'rows') : undefined}
        title={emptyKind === 'no-results'
          ? `${result.total} rows, none matching:`
          : emptyKind === 'cleared'
            ? 'Nothing outstanding.'
            : `Nothing in ${decl.name} yet.`}
        query={emptyKind === 'no-results' ? [q, saidPlainly(id, whereOf(filters))].filter(Boolean).join(' · ') : undefined}
        body={emptyKind === 'no-data-yet'
          ? decl.holds ? `${decl.name} holds ${decl.holds}.` : undefined
          : emptyKind === 'no-results' && q
            ? copy.searchesOnly(searched)
            : undefined}
      >
        {#snippet actions()}
          {#if emptyKind === 'no-results'}
            <Button href="/r/{id}">{copy.clearFilters}</Button>
          {:else if emptyKind === 'no-data-yet'}
            <!-- NO "Add the first row" HERE ANY MORE. The capture line sits directly above and the New
                 button beside the title, so an empty list drew three ways to add a row and two filled
                 buttons. The one offer only this state can make is the example. -->
            <!-- ON A LIVE RECORD IT ADDS THE EXAMPLE ROW, through the same `create` and the same inference the
                 capture line uses: an empty list offering to show you what a row looks like, and answering with a
                 sentence about what it would have done, is the defect this phase exists to remove. It is a REAL
                 row, named as an example and wearing `Put back`, so nobody has to wonder which of these they
                 typed. On the sample it says `notWritten` exactly as it always has. -->
            <Button onclick={addExample}>{copy.showExample}</Button>
          {/if}
        {/snippet}
      </Empty>
    {:else}
      <!-- Below 640px the default body is CARDS over the register's three declared `mobile:` fields,
           and the table is one `v` away. A saved view is the same list with a different predicate and
           had only the table, so the two behaved differently on one device — which is what made this
           a component rather than markup.

           ONE BODY AT A TIME, AND NOW IN THE DOM RATHER THAN ONLY IN THE STYLESHEET. Both bodies
           were built at every width and one was hidden: at 2,614 rows this document held 4,001 rows
           and 102,681 nodes — two thousand of them cards no pixel was showing — and took eight
           seconds to settle. `13 §4.3` caps the DOM at 2,000 and it was being paid twice, once
           invisibly. `05 §6`'s rule is that a width query never changes a control's SIZE; which of
           two bodies exists is layout, which is exactly what width decides. -->
      <!-- THE VERBS BELONG TO THE LIST, NOT TO ONE OF ITS TWO BODIES. Putting the branch in the
           markup rather than in the stylesheet swallowed this into the card arm, so a desktop
           selection raised no bulk bar at all — which is the whole reason the branch had to be
           measured rather than assumed. It sits above the rows it acts on in both. -->
      {#if picked.length > 0}
        <div class="picked-bar" role="toolbar" aria-label="{picked.length} {copy.selected}">
          <span class="picked-n num">{picked.length}</span>
          <span class="picked-word">{copy.selected}</span>
          <Button weight="quiet" onclick={() => void copyIds()}>
            <Icon name="copy" size="s" />{copy.copyIds}
          </Button>
          {#if states.length}
            <Menu label={copy.setState(stateLabel)}>
              {#snippet trigger()}<span class="picked-verb"><Icon name="edit" size="s" />{copy.setState(stateLabel)}</span>{/snippet}
              {#each states as state}
                <button
                  class="mi"
                  role="menuitem"
                  type="button"
                  onclick={() => void setPickedState(state)}
                >
                  <span class="mi-name">{state.replace(/_/g, ' ')}</span>
                </button>
              {/each}
            </Menu>
          {/if}
          <Button weight="quiet" onclick={archiveSelected}>
            <Icon name="archive" size="s" />{copy.archiveSelected}
          </Button>
          <button type="button" class="picked-clear" onclick={() => (selected = new Set())}>{copy.clear}</button>
        </div>
      {/if}

      <div class="body-slot" bind:this={body}>
      {#if rowsAsCards()}
      <RowCards register={id} entries={result.entries.slice(0, DOM_CAP)} {now} names={result.names ?? undefined} picked={selected}>
        {#snippet action(e)}
          <!--
            THE RECEIPT, ON THE ARM THAT IS THE ONLY ONE A PHONE EVER SEES.

            `receiptFor` has been drawn by the grid since it was written, under a paragraph
            arguing that a pending row "is unwritten on every screen, for as long as the tab is
            open, and the one place it is drawn is the one place that has to say so". Below 640px
            the grid is `display: none` and the cards are the one place, and they drew none of it.

            Measured: type a row into the capture line on a phone and press Enter. The row appears
            at the top of the list wearing `#-1` and nothing else. No chip, no `Put back`, and no
            sentence anywhere saying the thing you just typed has not been kept. The module that
            mints it says in its own header that a row which "comes back tomorrow looking saved is
            worse than one that is honestly gone", and on a phone it looked saved immediately.

            The same `Chip` and the same `undo` the grid renders, so there is one receipt and not
            a touch copy of one.
          -->
          <!-- THE ROW'S VERBS, REACHABLE BY THUMB. Every one of them existed and every one was a
               key: peek `p`, copy `y`, copy link `⇧Y`, archive `⌫`, select `x`. On the device
               with no keyboard that made a register a list you could read and open and nothing
               else — eight capabilities, none of them reachable. It opens the SAME `RowMenu` the
               keyboard opens, so there is one set of verbs rather than a touch copy of them, and
               each item still prints the key that replaces it. -->
          <button
            type="button"
            class="card-more"
            aria-label="{copy.rowMenu} #{e.seq}"
            onclick={(ev) => openCardMenu(e.seq, ev.currentTarget)}
          >
            <!-- `m`, AND IT WAS `s`: a 12px box of a 24-unit path at `stroke-width: 1.6`, so each dot
                 was 0.8 CSS pixels in `--dim`, on the only touch route to a row's eight verbs. In both
                 schemes the column read as an empty cell beside the card. -->
            <Icon name="more" size="m" />
          </button>
        {/snippet}
        {#snippet note(e)}
          {@const said = receiptFor(e.seq)}
          {#if said}
            {@const name = display(id, decl.title, e.fields[decl.title]) ?? copy.thisRow}
            <Chip label={said.mark} tone={said.intent} />
            {#if said.undo}
              <button
                type="button"
                class="card-undo tap"
                aria-label={copy.undoRowOf(name)}
                onmousedown={(ev) => ev.preventDefault()}
                onclick={(ev) => {
                  ev.stopPropagation();
                  said.undo?.();
                }}>{copy.undoRow}</button>
            {/if}
          {/if}
        {/snippet}
      </RowCards>

      <!-- THE VERBS, above the rows they act on and nowhere else. It appears with the selection and
           goes with it: a permanently visible bulk bar is a row of disabled controls, which tells
           you a thing exists and refuses to say why it will not work. -->

      <!-- AND THE CAP LINE COMES WITH THE BODY. `Table` draws its own outside the grid, so the
           phone could see it while the table was merely hidden; with the table gone from the
           document, the card list has to say it. -->

      <!-- The card list's own sentinel, for the reason `Table` has one: with the grid absent from
           the document there is nothing else for the observer to watch, and a phone would stop at
           page one with no way to ask for page two. -->
      <!-- A SENTINEL MEANS "THERE MAY BE MORE". A list whose answer arrived in one page has none,
           and neither does one at the cap — the line above says why it stopped. `Table` takes the
           same signal as the absence of `onmore`. -->
      {#if cursor !== null && loaded < DOM_CAP}
        <div class="sentinel" aria-hidden="true"></div>
      {/if}
      {:else}
      <div class="table-slot" data-picking={selected.size > 0 ? '' : undefined}>
        <!--
          THE THING THE ROW BELONGS TO, IN FRONT OF WHAT THE ROW IS.

          `columnsFor` caps the default projection at ten and `thing` is not in Money's, so the
          desktop grid of the first list in the rail was thirty-eight rows of grey with no way at all
          to see which project any of them was about. The mark went into `#`, the one column every
          projection has; `#` ends the row now, and the mark came with the title instead, because
          colour saying which project is read where the eye starts.

          The mark is a shape before it is a colour, which is `13 §5.1` met by the mark itself, and
          the label is the project's NAME because a screen reader told "black diamond" has been told
          the shape and not the thing.
        -->
        {#snippet ownMark(seq: number)}
          {@const own = identityFor(id, rowAt(seq)?.fields ?? {}, result.names ?? undefined)}
          <!-- THE MARK ON A ROW THAT HAS JUST ARRIVED, and it is drawn whether or not the register has an
               identity: `ownMark` renders on every title cell and the project's glyph only on some, so hanging
               this off that one would have marked new rows on Money and on nothing else. It is `aria-hidden`
               because the row already says what happened to it in words, in the chip one cell over — this is
               for the eye finding the row, and a second announcement of the same fact is noise. `showRow`
               finds the row by this attribute, so what is scrolled to and what is marked cannot disagree. -->
          {#if fresh.has(seq)}<span class="fresh" data-fresh={seq} aria-hidden="true"></span>{/if}
          {#if own}<span
              class="row-mark thing-glyph"
              data-shape={own.mark}
              style={own.retired ? undefined : `--hue:${own.hue}`}
              data-retired={own.retired ? '' : undefined}
              role="img"
              aria-label={own.name}></span>{:else if anyMark}<span class="thing-glyph" data-shape="" aria-hidden="true"></span>{/if}
        {/snippet}
        <!-- ONE ROW HAS NOTHING TO SORT. `onsort` is optional and the table draws a plain label
             without it, so eight header buttons over a single row — each announcing
             `aria-sort="none"` — become eight headings. -->
        <Table
          {columns}
          {rows}
          total={rowCount}
          cap={DOM_CAP}
          {...cursor === null ? {} : { onmore: more }}
          label={decl.name}
          {sort}
          selected={selectedKeys}
          bind:focus
          onactivate={(row) => goto(`/r/${id}/${row.key.split('#')[1]}`)}
          {...result.entries.length < 2
            ? {}
            : {
                onsort: (field: string) =>
                  setParam((p) => p.set('sort', `${field}:${sort?.field === field && sort.dir === 'asc' ? 'desc' : 'asc'}`)),
              }}
        >
          {#snippet cellSnippet(row, column, value)}
            {@const seq = Number(row.key.split('#')[1])}
            {@const ident = identityOf(id, column.field, rowAt(seq)?.fields[column.field], result.names ?? undefined)}
            {@const isTitle = column.field === decl.title}
            {@const isEnum = fieldOf(column.field)?.type === 'enum'}
            {#if column.field === 'select'}
              <button
                type="button"
                class="pick tap"
                tabindex="-1"
                data-on={selected.has(seq) ? '' : undefined}
                aria-label="{selected.has(seq) ? copy.deselect : copy.select} {display(id, decl.title, rowAt(seq)?.fields[decl.title]) ?? `#${seq}`}"
                onclick={(e) => {
                  /* The cell activates the row. Without this, picking one opened it. */
                  e.stopPropagation();
                  toggleSelect(seq, e.shiftKey);
                }}
              >
                {#if selected.has(seq)}<Icon name="check" size="s" />{/if}
              </button>
            {:else if editing?.seq === seq && editing.field === column.field}
              <!--
                THE CELL BECOMES THE EDITOR, in the box the value is already drawn in.

                `autofocus` IS RIGHT HERE AND WRONG ALMOST EVERYWHERE ELSE. The rule against it is
                about a caret moving on page load, before the reader has decided anything; this
                element exists only because they just asked for it, and an editor that opens without
                the caret in it is an editor that costs a second gesture to use.

                ENTER COMMITS AND ESCAPE CANCELS, and blurring commits too: a person who clicks away
                has finished with the cell, and throwing their typing away for it is the behaviour
                every spreadsheet taught them not to expect. `stopPropagation` on the keys, or the
                grid's own handler reads them as navigation and the caret leaves mid-word.

                IT COMMITS ON LEAVING THE ROW, NOT ON LEAVING THE FIELD, and the difference is a bug no screenshot
                can hold. `blur` fires when focus moves anywhere at all, including to the row's own verbs one cell
                over — so pressing `Put back` beside a cell you were editing committed the edit on the way to
                undoing it, and clicking the pencil of the next cell along wrote the first before opening the
                second. `focusout` carries where focus WENT, so focus landing inside the same row leaves the
                editor open and everything else commits, which is the rule a person already holds: you have
                finished with a row when you leave the row.
              -->
              {@const f = fieldOf(column.field)}
              {#if f?.type === 'enum'}
                <!-- svelte-ignore a11y_autofocus -->
                <select
                  class="cell-edit"
                  autofocus
                  bind:value={editValue}
                  onclick={(e) => e.stopPropagation()}
                  onchange={commitEdit}
                  onfocusout={leftTheRow}
                  onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                      cancelled = true;
                      editing = null;
                    }
                  }}
                >
                  {#each f.values ?? [] as v}<option value={v}>{v.replace(/_/g, ' ')}</option>{/each}
                </select>
              {:else}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="cell-edit"
                  autofocus
                  type={f?.type === 'day' ? 'date' : f?.type === 'text' ? 'text' : 'number'}
                  bind:value={editValue}
                  onclick={(e) => e.stopPropagation()}
                  onfocusout={leftTheRow}
                  onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitEdit();
                    else if (e.key === 'Escape') {
                      cancelled = true;
                      editing = null;
                    }
                  }}
                />
              {/if}
            {:else if column.field === 'act'}
              <!--
                THE ROW'S OWN VERBS, AND ITS RECEIPT, IN THE CELL THE ROW ALREADY HAS.

                `tabindex="-1"` ON EVERY CONTROL, like the picker two cells over and for the same
                reason: a grid is a composite widget with exactly one tab stop, so at five hundred
                rows a focusable control per row is fifteen hundred tab stops. The keyboard path is
                the one the `?` sheet already advertises and this is the pointer path.

                `stopPropagation` ON EVERY ONE, because the cell activates the row: without it,
                archiving a row opened it on the way out.
              -->
              {@const said = receiptFor(seq)}
              {@const name = display(id, decl.title, rowAt(seq)?.fields[decl.title]) ?? `#${seq}`}
              {#if said}
                <span class="said">
                  <Chip label={said.short ?? said.mark} tone={said.intent} />
                  {#if said.undo}
                    <!-- IT REFUSES FOCUS ON MOUSEDOWN, which is the third of the three rules and the one that
                         reads as superstition until it is measured. A press is mousedown, then focus, then
                         mouseup, then click — so the focus that a press moves happens BEFORE the click it is
                         part of. Undoing an edit from a cell you were typing in therefore committed that edit
                         first, from the focusout the press itself caused, and the undo then put back a value
                         that had just been overwritten by the gesture meant to discard it. Preventing the
                         default on mousedown keeps focus where it is; the click still fires. -->
                    <button
                      type="button"
                      class="verb"
                      tabindex="-1"
                      aria-label={copy.undoRowOf(name)}
                      onmousedown={(e) => e.preventDefault()}
                      onclick={(e) => {
                        e.stopPropagation();
                        said.undo?.();
                      }}>{copy.undoRow}</button>
                  {/if}
                </span>
              {:else}
                <span class="verbs">
                  <button
                    type="button"
                    class="verb icon tap"
                    tabindex="-1"
                    aria-label={copy.archiveRow(name)}
                    onmousedown={(e) => e.preventDefault()}
                    onclick={(e) => {
                      e.stopPropagation();
                      archive(seq);
                    }}><Icon name="archive" size="s" /></button>
                  <button
                    type="button"
                    class="verb icon tap"
                    tabindex="-1"
                    aria-label={copy.moreOn(name)}
                    onclick={(e) => {
                      e.stopPropagation();
                      openCardMenu(seq, e.currentTarget);
                    }}><Icon name="more" size="s" /></button>
                </span>
              {/if}
            {:else if ident}
              <IdentityMark identity={ident} />
            {:else if column.field === 'seq'}
              <!--
                A ROW THAT HAS NO ID PRINTS NO ID, and it used to print `#-1`.

                `pending` mints a NEGATIVE sequence so a row somebody typed can never collide with
                one the record has, which is right and is argued for in that module's header. What
                was never decided is what the column shows: `toRows` writes `#${seq}` for every
                row, so the sentinel went straight to the screen. `#-1` is not a spoken id, it is
                an implementation detail with a minus sign in front of it, and the column it
                appears in is the one whose whole job is to give a person something they can say
                out loud. The receipt beside it already says what the row is.
              -->{#if seq >= 0}<span class="row-seq">{value}</span>{/if}
            {:else if value === null}
              <!-- AN EMPTY CELL DRAWS NOTHING. A dash in every gap was a column of marks that meant
                   nothing; only a title says so, because a row with no name needs words to be found. -->
              {#if isTitle}{@render ownMark(seq)}<span class="missing">Not set</span>{/if}
            {:else if editableHere(column.field)}
              <!--
                THE POINTER PATH, AND IT WAS KEYBOARD ONLY. `e` has been on the `?` sheet since the
                grid was written, so the capability existed for anybody who already knew it was
                there, which is nobody on their first afternoon.

                THE PENCIL IS A BUTTON AND NOT A DOUBLE CLICK. A double click is what a spreadsheet
                taught everybody and it is invisible: nothing on the screen says the gesture exists,
                and a single click on this cell already means what it means everywhere else here,
                open the row. Two meanings on one target would make the list dangerous to browse.
                A control that is drawn is a control somebody finds.

                IT APPEARS ON HOVER AND ON KEYBOARD FOCUS AND TAKES NO SPACE OTHERWISE. A permanent
                glyph in every cell of every row is a column of noise over the data somebody came to
                read, and a capability that says so nowhere is a capability nobody uses.

                `tabindex="-1"`, LIKE THE PICKER TWO CELLS OVER. A grid is a composite widget with
                exactly one tab stop; at five hundred rows and eight editable columns a focusable
                control per cell is four thousand tab stops. The keyboard path is `e`, which the `?`
                sheet has advertised since the grid was written.
              -->
              <span class="cell-said">{#if isTitle}{@render ownMark(seq)}{/if}{#if isEnum}<span class="enum">{copy.valueWord(value)}</span>{:else}{symbolFigure(value) ?? value}{/if}<button
                  type="button"
                  class="cell-pen"
                  tabindex="-1"
                  aria-label={copy.editValue(labelOf(fieldOf(column.field)!))}
                  onclick={(e) => {
                    e.stopPropagation();
                    openEditor(seq, column.field);
                  }}
                ><Icon name="edit" size="s" /></button></span>
            {:else}{#if isTitle}{@render ownMark(seq)}{/if}{#if isEnum}<span class="enum">{copy.valueWord(value)}</span>{:else}{symbolFigure(value) ?? value}{/if}{/if}
          {/snippet}
        </Table>
      </div>
      {/if}

      <!--
        ONE CAP LINE, FOR WHICHEVER BODY IS DRAWING.

        `Table` used to draw its own from its `total` prop, which is `aria-rowcount` — and
        `aria-rowcount` is deliberately `-1` while a filtered list is still paging, so `2000 < -1`
        was false and **the line vanished in exactly the state it was written for**: filter the list,
        scroll to the cap, and the sentence telling you to narrow or export was gone. The card body
        drew its own from a different number, so the two bodies disagreed about whether the list was
        capped.

        Out here it belongs to the LIST rather than to a body, and it reads the one number that is
        always the answer's size. `Table` keeps `cap` for the sentinel, which is the other half of
        what that prop is for.
      -->
      <!-- AND A SORTED LIST THE RECORD STOPPED says so the same way: the rows it drew, of the rows
           it matched, and what to do about the rest. -->
      {#if loaded >= DOM_CAP || truncated}
        <CapLine shown={drawn} total={result.matched} />
      {/if}
      </div>
    {/if}

    <!--
      THE ARRIVAL'S SECOND LIST, UNDER THE ROW IT FOLLOWS, AND IT USED TO COME FIRST.

      The comment that stood over it read "AND ON THE RUN SCREEN TWO IS ABOUT, IT COMES FIRST", and
      what that produced was measured: after a first row from `/start`, `?first=1` drew this panel,
      its heading, a paragraph and four cards for other lists ABOVE the bar and the list, and the
      person's own row landed at y 944 on an 844px screen whose usable area ends at 788 above the tab
      bar. `19 §6` calls this screen "the register, with their one row in it", and the one row was
      the one thing on it they could not see. The panel is the second step, so it sits after the
      first; the note below moved under the rows for the same reason and says so.

      ON THE ARRIVAL ITSELF, THE ONLY LIST WITH ANYTHING IN IT IS THIS ONE. `?first=1` is a claim
      about the moment: somebody has just written their first row and been sent here, so on a
      genuine first run `held` is one register, and it is this one. Passing the seeded record's
      eight would describe a record that person does not have.
    -->
    {#if arriving}
      <!-- AND THE LISTS IT ALREADY HAS WITH ROWS IN THEM. A list added on the way to this one (Services
           brings Projects) was offered again as a card for something already done. -->
      <Second held={[id, ...(page.data.index?.registers ?? []).map((r: { id: string }) => r.id)]} register={id} first />
    {/if}

    <!-- AND UNDER THE ROWS, NOT OVER THEM.

         Measured on the built app at 390px: the sample bar, the header, the filter bar, its note,
         this and the capture line put the first row at 865px of an 844px viewport, so somebody
         opening their list of money saw no rows at all without scrolling. This note is 152px of
         that, and it is the one piece of it that is not about the rows: its own paragraph below
         says it is not an alarm, that nothing is broken and nothing is urgent, and that it is
         addressed to whoever maintains the declaration rather than to whoever came to look at
         their invoices. A thing that is not urgent does not go above the thing a person came for.

         UNDER THE ROWS AND NOT BEHIND A WIDTH, because `13 §10` is that a phone shows a DECLARED
         subset rather than a media-queried one, and because the argument holds at every width: it
         was 152px over the rows on a desktop too.

         WHAT THE RECORD NOTICED, ON THE SCREEN IT IS ABOUT.

         The observe loop is the most careful mechanism in this product — nine signals, four
         detectors whose counts come from the rule of three, a dispersion requirement on every one
         because a burst is not a pattern — and none of it had ever reached a person. It went here
         and not on a findings page because `write.refused` carries `<register>.<field>:<code>`,
         which IS this screen: the grid somebody keeps being refused at.

         IT IS A NOTE, NOT AN ALARM. Nothing is broken and nothing is urgent; a thing has been
         happening for weeks and the record is the only one that counted. `role="note"` and no
         intent colour, because the day it looks like an error is the day it gets dismissed
         unread. -->
    <!-- AND NOT ON SOMEBODY'S FIRST MINUTE. This reports a pattern over thirty days on a register
         that has been written to repeatedly — it is addressed to whoever maintains the declaration,
         and it was the largest thing on the screen a person landed on after typing their first row,
         reading "12 writes to Direction were refused … ENUM_VALUE_UNKNOWN · 30d". -->
    <!-- AND NOT OVER AN EMPTY RESULT EITHER. It is a note about a register somebody writes to, and
         a screen showing no rows is not the moment to read it. -->
    {#if seen && !arriving && result.entries.length > 0}
      <aside class="seen" role="note">
        <Icon name="observe" size="s" />
        <p class="seen-said">
          <!-- `saves` AND `rejected`, WHICH WERE `writes` AND `refused`. Both are this product's own
               words for the mechanism, and this banner sits on the front of the busiest list in the
               product: a friction pass counted it as three tax words in one sentence, met by
               somebody who came to look at their invoices. A write is a save and a refusal is a
               rejection, in every product a person has used before this one. The error code that
               followed the sentence is gone too: the sentence already says what was rejected. -->
          <strong>{seen.n} saves</strong> to
          <!-- A NAME AND NOT A LINK. The writes were REFUSED, so there are no rows to filter to and
               nowhere in this build that shows a field's own declaration; a link that went to a
               filter matching nothing would be worse than the plain word. -->
          {#if seen.field}<em class="seen-field">{seen.field.label}</em>{:else}{copy.thisList}{/if}
          were rejected over {seen.days} days: {seen.fix}.
        </p>
        <Button
          weight="quiet"
          onclick={() =>
            /* `rejected saves` AND NOT `refused writes`. The banner three lines up deliberately says
               the first pair, because a friction pass counted the second as two tax words on the
               front of the busiest list in the product, and this toast kept saying the old ones: one
               screen, one gesture apart, two vocabularies for the same fact. */
            toasts.push(
              copy.notWritten(
                `${seen?.field?.label ?? id} would be raised as a question on /decide, with the ${seen?.n} rejected saves attached`,
              ),
              { intent: 'warn' },
            )}
        >{copy.raiseIt}</Button>
      </aside>
    {/if}
  </div>

  <!-- SCREEN 2 OF THE FIRST RUN, inline under the register they just made (19 §6). It shows itself
       only while the record holds exactly one register with something in it, so nothing has to
       remember a dismissal and nothing can get stuck showing it.

       IT IS ABOVE THE TABLE ON THE RUN IT IS ABOUT. `19 §6` calls screen two "the register, with
       their one row in it, and the second choice offered inline" — and rendering it after the table
       put it below however many rows the register holds, which on any record with history is a
       scroll away from the row it is talking about. -->
  {#if !arriving}
    <!-- AND OFF IT, THE CONDITION IS THE RECORD'S OWN SHAPE: registers that HOLD something. It was
         `Object.keys(REGISTERS)` — every register declared, whether or not a row had ever been
         written to it — which is the count that made this unreachable. -->
    <Second held={(booted?.registers ?? []).filter((r) => r.count > 0).map((r) => r.id)} register={id} first={false} />
  {/if}

  <!-- Peek: a drawer, with the list still visible, for triage. It needs a VISIBLE affordance —
       Linear's own docs admit the flaw that Peek can only be launched with the keyboard shortcut,
       and users do not press `?` to discover what they do not know exists (19 §4). -->
  <Sheet
    open={peeked !== null}
    title={String(peekedEntry?.fields[decl.title] ?? '')}
    id={peeked !== null && peeked > 0 ? `#${peeked}` : undefined}
    onclose={() => peek(null)}
  >
    {#if peekedEntry}
      <!-- FORMATTED, through the same `display` every other surface goes through.

           This drew `peekedEntry.fields[f.id]` straight out of the row, which is how the drawer
           came to show `amount 480000`, `party 1` and `due 2026-07-27` beside a table showing
           `GBP 4,800.00`, `Halden Type Co` and `27 Jul 2026` for the same row. Money in minor units
           on a screen a person reads is the one formatting bug this product cannot ship, and a
           `ref` rendered as the integer it is stored as is a row nobody can identify.

           Labels go through `labelOf` for the same reason: the drawer was printing raw field ids. -->
      <dl class="peek">
        {#each readableFields(id) as f}
          <dt>{labelOf(f)}</dt>
          <dd dir={dirOf(id, f.id)}>{display(id, f.id, peekedEntry.fields[f.id], now, result.names ?? undefined) ?? MISSING}</dd>
        {/each}
      </dl>
    {/if}
    {#snippet footer()}
      <!-- AN UNWRITTEN ROW SAYS SO HERE TOO, and it does not get a number. `#-1` is the sequence
           `pending` hands out to keep it from colliding with a real row; it is machinery, and the
           header printed it. The row itself opens, because the detail route now finds it. -->
      {#if peeked !== null && peeked < 0}
        <Chip label={copy.markNotWritten} tone="warn" />
      {/if}
      <Button weight="primary" href="/r/{id}/{peeked}"><Icon name="external" size="s" />{copy.openRow}</Button>
      <Button weight="bare" onclick={() => peek(null)}><Icon name="close" size="s" />{copy.close}</Button>
    {/snippet}
  </Sheet>

  <!-- Put this filter on a page as a block. `⌥B`, and it was a toast until now.

       `predicate` is written into a declaration and `says` is read by a person, so they are the same
       filter in two spellings — `direction is owed_to_me` and "direction is owed to me". This handed
       the machine's to both. -->
  <BindBlock
    bind:open={bindOpen}
    register={id}
    predicate={whereOf(filters) || q || copy.everything}
    says={saidPlainly(id, whereOf(filters)) || (q ? `matching “${q}”` : copy.everything)}
    onbind={(toPage, kind) =>
      toasts.push(
        copy.notWritten(
          `A ${(copy.kindNames[kind] ?? kind).toLowerCase()} would be added to ${PAGES[toPage]?.title ?? toPage}, reading ${decl.name.toLowerCase()}`,
        ),
        { intent: 'warn' },
      )}
  />

  <!-- Display options: what YOU see, never what the record says. `v`. -->
  <Sheet bind:open={displayOpen} title={copy.display}>
    <p class="display-note">{copy.displayNote}</p>
    <div class="filter-groups">
      <!--
        SORT LIVED ON THE COLUMN HEADERS AND THE COLUMNS ARE GONE BELOW 640px.

        Every header on this table is a sort button announcing `aria-sort`, which is the right place
        for it and is why the drawer's old "Due sorts on the column" sentence was deleted rather than
        corrected. But a card list has no headers, so on a phone the whole capability went with them:
        thirty-eight obligations in whatever order the record returned, with no way to ask for the
        oldest.

        SAME PARAMETER, SAME TOGGLE. It writes `?sort=<field>:<dir>` and flips direction on the field
        already sorted, exactly as `onsort` does — so a sort set here and a sort set by clicking a
        header are the same fact, and the URL still carries it (`19 §5`: which rows you are looking
        at, and in what order, is shareable).

        Two rows or fewer and there is nothing to order, which is the same test the table applies
        before it wires `onsort` at all.
      -->
      {#if result.entries.length > 1}
        <fieldset class="filter-group">
          <legend class="filter-legend">{copy.sortedBy}</legend>
          <div class="filter-values">
            {#each sortable as c}
              {@const on = sort?.field === c.field}
              {@const way = wayOf(c.field)}
              <button
                type="button"
                class="filter-value"
                data-on={on ? '' : undefined}
                aria-pressed={on ? 'true' : 'false'}
                onclick={() =>
                  setParam((p) => p.set('sort', `${c.field}:${on && sort?.dir === 'asc' ? 'desc' : 'asc'}`))}
              >
                <!-- THE ARROW IS THE DIRECTION AND THE BOX IS THE STATE. A pressed chip that does
                     not say which way it went is half an answer, and `13 §5.1` will not let the
                     raised background carry it alone. -->
                <span class="filter-box" aria-hidden="true">{on ? (sort?.dir === 'asc' ? '↑' : '↓') : ''}</span>
                {c.label}
                {#if on}<span class="locked">{sort?.dir === 'asc' ? way[0] : way[1]}</span>{/if}
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}

      <!-- NOT ON A PHONE. Below 640px the register draws cards, and a card shows the declaration's
           `mobile:` fields rather than the columns chosen here, so this section toggled six columns
           that were not drawn: fifteen controls in a sheet whose one useful act on a phone is
           choosing a sort. -->
      <fieldset class="filter-group columns-group">
        <legend class="filter-legend">{copy.columns}</legend>
        <div class="filter-values">
          {#each columnsFor(id) as c}
            {@const locked = c.field === 'seq' || c.field === decl.title}
            <button
              type="button"
              class="filter-value"
              data-on={!hidden.has(c.field) ? '' : undefined}
              aria-pressed={!hidden.has(c.field) ? 'true' : 'false'}
              disabled={locked}
              onclick={() => hide(c.field, !hidden.has(c.field))}
            >
              <span class="filter-box" aria-hidden="true">{hidden.has(c.field) ? '' : '✓'}</span>
              {c.label}
              {#if locked}<span class="locked">{copy.always}</span>{/if}
            </button>
          {/each}
        </div>
      </fieldset>
    </div>

    {#snippet footer()}
      <Button weight="primary" onclick={() => (displayOpen = false)}><Icon name="check" size="s" />{copy.done}</Button>
      {#if hidden.size > 0}
        <Button weight="bare" onclick={() => showAll()}>{copy.showAll}</Button>
      {/if}
      <!-- A SORT YOU CANNOT UNDO IS A TRAP. The only other way back to the register's own order was
           Clear filters, which also throws away the search and every chip. -->
      {#if sort}
        <Button weight="bare" onclick={() => setParam((p) => p.delete('sort'))}>{copy.rowOrder}</Button>
      {/if}
    {/snippet}
  </Sheet>

  <!-- The filter drawer. The bar above holds the enum filters because they are the ones worth a
       permanent control; everything else declared `indexed:` lives here, so the bar stays one line
       on a register with eight filterable fields.

       ONLY INDEXED FIELDS ARE OFFERED. A filter on an unindexed field is a promise the storage
       cannot keep at five thousand rows, and a control that gets slower the more rows you have is a
       control that breaks exactly when the register becomes worth filtering. -->
  <RowMenu
    open={menuOpen}
    at={menuAt}
    label={copy.rowMenu}
    onclose={() => (menuAt = null)}
  >
    {#if menuRow}
      {@const seq = menuRow.seq}
      <!-- A glyph per verb. The rail's menu has always had them and this one never did, so four
           rows of identical grey text carried the whole distinction between opening a row and
           throwing it away. -->
      <a class="mi" role="menuitem" href="/r/{id}/{seq}">
        <Icon name="external" size="s" />
        <span class="mi-name">{copy.openRow}</span><Kbd keys="↵" />
      </a>
      <!-- THE REGISTER'S OWN STATES, WHICH THIS MENU DID NOT CARRY.
           Five verbs, and the one a person reaches for most on a list of obligations was not among
           them: the only way to move a row's state was to select it and use the bulk bar, which is
           three presses to change one row. The values come from the declaration rather than from a
           list typed here, so a pack that adds a state gets a menu item.

           NOT THE STATE IT IS ALREADY IN. An item that sets a row to where it already is does
           nothing and looks like it did something, and `19 §6`'s rule for a control that cannot act
           is that it is absent rather than greyed.

           AND THEY COME SECOND, RIGHT AFTER OPEN. They were items six to eight, under Peek, Copy
           id, Copy link and Select, so the verbs that change an invoice were below the tab bar on an
           844px phone when the menu opened from the first card, while two developer verbs sat above
           them. The copy verbs now come last, before Archive, which keeps its own rule. -->
      {#if states.length > 0}
        <hr class="mi-rule" />
        {#each states.filter((v) => v !== rowAt(seq)?.fields[decl.state ?? '']) as state}
          <button class="mi" role="menuitem" type="button" onclick={() => setRowState(seq, state)}>
            <Icon name="check" size="s" />
            <span class="mi-name">{copy.setTo(state.replace(/_/g, ' '))}</span>
          </button>
        {/each}
        <hr class="mi-rule" />
      {/if}
      <button class="mi" role="menuitem" type="button" onclick={() => peek(seq)}>
        <Icon name="eye" size="s" />
        <span class="mi-name">{copy.peek}</span><Kbd keys="p" />
      </button>
      <!-- AND THE ONE VERB THAT UNLOCKS THE OTHER FOUR. Selection was `x` alone, so the bulk bar —
           copy ids, set state, archive them — could not be reached at all without a keyboard. One
           row selected is enough to make it appear, and the bar takes it from there. -->
      <button class="mi" role="menuitem" type="button" onclick={() => toggleSelect(seq, false)}>
        <Icon name="check" size="s" />
        <span class="mi-name">{selected.has(seq) ? copy.deselect : copy.select}</span><Kbd keys="x" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => void copyId(seq)}>
        <Icon name="copy" size="s" />
        <span class="mi-name">{copy.copyId}</span><Kbd keys="y" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => void copyLink(seq)}>
        <Icon name="link" size="s" />
        <span class="mi-name">{copy.copyLink}</span><Kbd keys="⇧Y" />
      </button>
      <hr class="mi-rule" />
      <button class="mi" role="menuitem" type="button" onclick={() => archive(seq)}>
        <Icon name="archive" size="s" />
        <span class="mi-name">{copy.archive}</span><Kbd keys="⌫" />
      </button>
    {/if}
  </RowMenu>

  <!-- The new-row drawer. Every control in it comes from the register's own field declarations —
       see RowForm — so a pack that adds a field gets a form field, and nobody writes a second copy
       of the schema in markup. -->
  <Sheet bind:open={createOpen} onclose={closeCreate} title="{copy.newRow} {decl.one}">
    <!-- No `autofocus` here: `Sheet` puts the caret in the first field after `showModal()`, which is
         the only moment it can, and it does it for every sheet that carries one. -->
    <!--
      `form` HERE, AND NOT INSIDE `RowForm`. The control that decides what a row IS belongs to the
      screen that owns the row, and the screen that owns it is the one that can put it somewhere.
      `RowForm` used to be a `<form>` with `preventDefault` on submit, which swallowed Enter in
      every field of every new-row sheet in the product: the one key a person presses when they have
      finished typing, answered by nothing at all.
    -->
    <form
      id="new-row"
      onsubmit={(e) => {
        e.preventDefault();
        addTypedRow();
      }}
    >
      <RowForm register={id} bind:problems bind:taken />
    </form>
    {#snippet footer()}
      <!-- A DISABLED CONTROL SAYS WHY IT IS DISABLED, which is `/decide`'s answer to the same
           question and was not this one's. The button was live with every required field empty and
           answered the press with "nothing was written" — true of every submit here, and silent
           about the actual reason. `aria-describedby` points at the sentence so the greying is not
           the only cue. -->
      {#if problems.length > 0}<p class="drawer-why" id="new-row-why">{problems[0]}</p>{/if}
      <!-- `type="submit"` AND `form`, WHICH IS WHAT MAKES ENTER WORK. `Button` defaults to
           `type="button"`, and this control lives in the Sheet's footer snippet, outside the form
           it submits: a form whose only submit control is elsewhere and unassociated has no submit
           button at all, and a browser refuses implicit submission on a form with more than one
           text field. Obligations draws four. So `RowForm` ceasing to swallow Enter bought nothing
           on this screen until the button said which form it belongs to.

           AND NO `onclick`, WHICH ADDED THE ROW TWICE. It carried `onclick={addTypedRow}` as well,
           so one press ran the handler and then submitted `#new-row`, whose `onsubmit` runs the
           same handler: two rows, `#-1` and `#-2`, and two identical toasts. Enter did it too, by
           firing a click at the default button. The submit path is the one that has to exist for
           Enter, so it is the only one. -->
      <Button
        weight="primary"
        type="submit"
        form="new-row"
        disabled={problems.length > 0 || writing}
        aria-describedby={problems.length > 0 ? 'new-row-why' : undefined}
      >
        {copy.addRow} {decl.one}
      </Button>
      <Button weight="bare" onclick={() => (createOpen = false)}>{copy.close}</Button>
    {/snippet}
  </Sheet>

{/if}

<style>
  /* The same sentence-under-a-dead-button treatment `/decide` uses, and the same colour: this is a
     rule the register declared, not an error the person made. */
  .drawer-why {
    /* Its own line above the buttons, not a third column beside them. */
    flex-basis: 100%;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* The sample bar's sentence, in the dim ink a note takes: it says where the rows came from. */
  .sample-note {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  /* A NOTE READS AS A NOTE. One hairline, the page's own paper, no intent colour and no fill: it
     sits above the grid the way a margin annotation sits beside a paragraph. */
  .seen {
    display: flex;
    /* IT WRAPS, because at 320px a sentence and a button do not fit on one line and the button was
       the thing that left the window — pushed eleven pixels past the edge, where the last thing a
       person can do about a refusal sits half off the screen. `align-items: center` is right for one
       line and wrong for two, so the wrapped case aligns to the start. */
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
  }

  .seen-said {
    /* `flex: 1` ALONE DOES NOT LET IT SHRINK. A flex child's floor is its content, so a long
       sentence held the row at its own width and the button went over the side rather than under.

       AND 16ch WAS A FLOOR IT COULD SIT AT. At 390px the sentence took 141px beside a fixed-width
       button and wrapped into eight ragged lines, 182px tall, above the first row — `13 §6` calls
       the refusal the main teaching surface and this was the least readable text on the screen.
       32ch is wider than the row can give it on a phone, so the button wraps to its own line and
       the sentence gets the width; on a desktop there is room for both and nothing changes. */
    flex: 1 1 32ch;
    min-inline-size: 0;
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .seen-said strong { color: var(--ink); font-weight: 500; }
  .seen-field { color: var(--ink); font-style: normal; font-weight: 500; }

  /* THE SAME WRAP `/audit` TOOK, in a commit whose comment names the measurement — "Five of those
     in one unwrapping track reached 335px inside a 320px screen". The register's bar has the
     identical shape and was not fixed with it: at 320 `dropped` ran off the edge of `/r/tasks` and
     the app panel scrolled sideways by 30px. */
  .bar {
    flex-wrap: wrap;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* NOT A BOX ABOVE 640px. The chips, Clear and Display are children of the bar exactly as they
     were before the phone needed them grouped; `contents` removes the wrapper from layout. */
  .bar-rest {
    display: contents;
  }

  /**
   * THE FILTERS ARE PILLS: one rounded track on a raised surface, and the chosen value a lighter pill
   * in it with its word in ink. `controls.css` asks for the state to be a SHAPE and not a shade, and
   * this keeps that, drawn round rather than as a box of boxes. Scoped to this screen, so every other
   * segmented control keeps the shared rule.
   *
   * THE COUNT SITS BESIDE THE WORD AND QUIETER THAN IT, so a pill says what it holds before it is
   * pressed. The weight does not change when a pill is chosen, so the bar does not shift under the
   * pointer. Sentence case is the stylesheet's, on the first letter, so the word stays the one the
   * record stores and the empty state quotes.
   */
  .segmented {
    background: var(--s1);
    border-radius: var(--r-sm);
  }

  .segment {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-weight: 500;
  }

  /* 44 under a thumb is `--ctl-h`'s; under a mouse the pill sits inside a track the height of the
     search box beside it. */
  @media (pointer: fine) {
    .segment {
      min-block-size: calc(var(--ctl-h) - 6px);
    }
  }

  .segment[data-on] {
    background: var(--s3);
    color: var(--ink);
    font-weight: 500;
  }

  .segment-word,
  .enum {
    display: inline-block;
  }

  .segment-word::first-letter,
  .enum::first-letter {
    text-transform: uppercase;
  }

  .segment-n {
    color: var(--dim);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  /* The search box is a pill too, so the bar is one family of shapes. */
  .bar > .field {
    background: var(--s1);
    border-radius: var(--r-sm);
  }

  /* Display ends the bar: it changes how the list looks, not what it holds. */
  .bar-end {
    margin-inline-start: auto;
  }

  /* The menu rows: the same 34px, the same tint-on-hover, and each printing the key it stands in
     for — so using the menu teaches the key that replaces it. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* THE MENU IS A KEYBOARD CHEAT SHEET ON A DEVICE WITH NO KEYBOARD. Six of its nine items printed a
     chip, `Enter`, `p`, `y`, `Shift+Y`, `x` and the delete glyph, to somebody holding a phone.
     `/start` hid its digit badges under a coarse pointer for exactly this reason in the thirtieth
     pass and the same rule was never applied here. The bindings are untouched; what goes is the
     advertisement to a reader who cannot press them. */
  @media (pointer: coarse) {
    .mi :global(kbd) {
      display: none;
    }
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
  }

  .mi-rule {
    margin: 4px 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* Above the rows it acts on, and only while there is a selection: a permanently visible bulk bar
     is a row of disabled controls, which tells you a thing exists and refuses to say why it will
     not work. It wraps rather than scrolls, so the verbs survive a phone. */
  /**
   * THE CARD'S TRAILING CONTROL, which exists only where the cards do.
   *
   * `--ctl-h` for the width and the card's own 56px for the height, so the target is the full height
   * of the row it acts on rather than a 44px button with dead edges above and below it. `13 §10`:
   * the card IS the row on this device, and half a row that does nothing when tapped is worse than
   * no control.
   */
  @media (width < 640px) {
    /* THE `Put back` BESIDE A RECEIPT ON A CARD. `.verb` is the grid's, sized for a row 34px tall
     and a fine pointer; this one is under a thumb, so it takes `--tap` from `.tap` and reads as a
     word rather than as an icon. */
  .card-undo {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .card-more {
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--ctl-h);
      flex: none;
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--r-md);
      /* `--ink2`, and it was `--dim`: the one touch route to a row's eight verbs, drawn in the
         quietest ink the palette has, read as an empty cell beside every card. */
      color: var(--ink2);
      cursor: pointer;
    }

    .card-more:hover {
      background: var(--s2);
      color: var(--ink);
    }
  }

  @media (width >= 640px) {
    .card-more {
      display: none;
    }
  }

  .picked-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .picked-word {
    margin-inline-end: var(--sp-2);
  }

  .picked-verb {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .picked-n {
    color: var(--ink);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* The pointer's way in. It is `tabindex="-1"` — a grid has one tab stop — so it never takes focus
     and never needs a focus ring; the keyboard path is `x`, which the `?` sheet advertises. */
  /* ── editing a value where it is drawn ────────────────────────────────── */

  /* THE EDITOR IS THE CELL, so it takes the cell's box and none of its own. A control that grew the
     row would push every row below it down the instant somebody started typing, which is the one
     thing a list must not do while a person is reading it. */
  .cell-edit {
    inline-size: 100%;
    min-inline-size: 0;
    padding: 0 2px;
    background: var(--s1);
    border: 1px solid var(--accent);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  /**
   * THE CELL IS THE BOX, AND THE PENCIL FLOATS OVER IT.
   *
   * This was an `inline-flex` holding the value and the pencil side by side, and the pencil is
   * invisible at rest rather than absent, so it took width the whole time. `.td` truncates with an
   * ellipsis, the flex row was wider than the column, and every editable cell on the busiest list
   * in the product painted a stray `..` after a value that fitted perfectly well: thirty-eight rows
   * times four editable columns, all day, on the screen a person spends the most time on. Nobody
   * saw it because two dim dots at 55% ink read as part of the typeface.
   *
   * OUT OF FLOW, AND THE ROOM FOR IT IS MADE ONLY WHILE IT IS THERE. Three arrangements and each
   * costs something: in flow costs every cell a pencil's width of its own text, for ever; out of
   * flow with the room always reserved costs the same width the same way, and turned `owed to me`
   * into `owed to ...` on every row; out of flow with the room made on hover costs an ellipsis on
   * ONE cell while a pointer is on it. The paragraph below argues against reflowing the COLUMN
   * under the cursor, which none of these does: the column is a grid track and its width is set by
   * the header.
   */
  /* THE THING'S HUE, AND IT IS NOT A LITERAL. `oklch(L C h)` where `h` is the row's frozen accent
     and `L`/`C` are the theme's two mark constants, generated per scheme and solved so every hue
     clears 3:1 on every surface. A retired thing keeps its mark and loses its claim on a hue, so
     `--hue` is withheld AND `--dim` is set: an unset `--hue` makes the `oklch()` invalid, and an
     invalid declaration is a dropped one, which would leave the mark the same ink as the id. */
  .row-mark {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .row-mark[data-retired] {
    color: var(--dim);
  }

  /* The spoken id at the end of the row, quiet, in the face that says it is an identifier. */
  .row-seq {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .cell-said {
    position: relative;
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The room, made when the pencil appears and not before. */
  :global(.td):hover .cell-said,
  :global(.td):focus-within .cell-said {
    padding-inline-end: var(--sp-4);
  }

  /* PRESENT IN THE TREE AND INVISIBLE UNTIL IT IS WANTED. `opacity` and not `display: none`, because
     a control removed from the box changes the cell's width the moment a pointer enters it, and a
     column that reflows under the cursor is a column you cannot click accurately. */
  .cell-pen {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    display: grid;
    flex: none;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink2);
    opacity: 0;
    cursor: pointer;
    transition: opacity var(--d-state) var(--ease-out);
  }

  /* `:global(.td)`, BECAUSE THE CELL IS DRAWN BY `Table` AND NOT BY THIS FILE. Svelte scopes a
     selector to the component that wrote it, so `.td:hover .cell-pen` matched nothing and compiled
     to an unused rule: the pencil was in the tree, at zero opacity, for ever. The child half stays
     scoped, which is what keeps this from reaching any other cell in the product. */
  :global(.td):hover .cell-pen,
  :global(.td):focus-within .cell-pen,
  .cell-pen:focus-visible {
    opacity: 0.55;
  }

  .cell-pen:hover,
  .cell-pen:focus-visible {
    color: var(--ink);
    opacity: 1;
  }

  /* A 44px HIT BOX UNDER A THUMB, ONLY ONCE THE PENCIL IS SHOWING. Measured at 768 on a tablet it
     was 12px wide. Always on, the box would lie invisibly over the cell's words and turn a tap on
     the row into an edit, so it arrives with the pencil: when the cell holds focus. */
  @media (pointer: coarse) {
    :global(.td):focus-within .cell-pen::before {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap)) / 2));
    }
  }

  /**
   * THE ROW THAT JUST ARRIVED, MARKED FOR A MOMENT.
   *
   * A BAR AT THE HEAD OF THE ROW AND NOT A WASH OVER IT. A tinted row competes with the row's own tone, which is
   * the declared deadline state and means something; this is a rule in the accent, in the gutter where nothing
   * else is drawn, so the two cannot be confused. It fades rather than blinks: the point is to be findable for
   * the second somebody's eye takes to arrive, not to demand attention it has already got.
   *
   * IT ANIMATES ONCE BECAUSE IT IS MOUNTED ONCE. `fresh` is cleared in `$effect.pre`, before the list redraws, so
   * the element exists for one continuous stretch rather than being rebuilt mid-animation — which is the failure
   * the map's own comment records.
   */
  .fresh {
    display: inline-block;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: var(--sp-2);
    background: var(--info-fill);
    border-radius: var(--r-pill);
    vertical-align: middle;
    animation: fresh-in var(--d-enter) var(--ease-out);
  }

  @keyframes fresh-in {
    from {
      opacity: 0;
      transform: scaleY(0.4);
    }
  }

  /* UNDER `prefers-reduced-motion` THE MARK STAYS AND THE MOVEMENT GOES. It is the thing that says which row is
     new, so deleting it would take the answer with the animation. */
  @media (prefers-reduced-motion: reduce) {
    .fresh {
      animation: none;
    }
  }

  /* ── capture, and the verbs on the row ────────────────────────────────── */

  /* ONE LINE, AND IT LOOKS LIKE ONE. The label is for a screen reader and for nobody else: the
     field's own placeholder says the same words, and a visible label above a single-field form
     turns one line into three. */
  .capture {
    margin: 0;
  }

  .new-row {
    display: contents;
  }

  @media (width < 640px) {
    .new-row:not([data-alone]) {
      display: none;
    }
  }

  .capture-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ONE FRIENDLY FIELD: a rounded line on the first raised surface with a plus at its head, which
     is the shape "add" has in every list a person has used. */
  /* ONE HEIGHT FOR THE WHOLE HEAD (DESIGN-SYSTEM APPENDIX C8). This was 47px over a 34px search and
     32px filters, three sizes of box in two rows; it is `--ctl-h` now, 32 under a mouse and 44 under
     a thumb, with the radius every control has. */
  .capture-field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3) var(--sp-1);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .capture-field:hover {
    border-color: var(--edge);
  }

  /* THE RING IS ON THE BOX AND NOT ON THE INPUT, because the submit control is inside the box: a
     ring around the text alone would draw a line between the field and its own button. It is the
     same move `/search` makes for the same reason. */
  /* The ring itself is `controls.css`'s, shared with every field. */

  .capture-input {
    flex: 1;
    align-self: stretch;
    min-inline-size: 0;
    padding-block: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .capture-input:focus-visible {
    /* focus-ok: the caret indicates focus, and `.capture-field:focus-within` above carries the
       state change for the box the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  .capture-go {
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--r-sm);
    color: var(--bg);
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  /* 48x24 MEASURED AT 390, on the primary write action of the register. It is drawn only once
     there is something to add, which is why no gate has ever measured it: the scan runs over a
     page at rest and this button does not exist then. */
  @media (pointer: coarse) {
    .capture-go {
      min-block-size: var(--tap);
    }
  }

  /* THE VERBS ARE QUIET UNTIL THE ROW IS. A column of controls at full contrast on every row of a
     list is a column that competes with the data for the reader's eye, and the data is what they
     came for. They come up on hover and on keyboard focus, and they are always in the accessibility
     tree, so nothing is hidden from anybody who is not using a pointer. */
  .verbs,
  .said {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    justify-content: flex-end;
  }

  .verb {
    padding: 1px var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-xs);
    cursor: pointer;
  }

  .verb.icon {
    display: grid;
    place-items: center;
    padding: var(--sp-1);
    color: var(--dim);
  }

  .verb:hover,
  .verb:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* UNDER A MOUSE THEY ARE NOT THERE UNTIL THE ROW IS, which the comment over `.verbs` has always
     said and no rule ever did. They come up with the row's hover, the keyboard caret and focus
     inside the row. Only where there is a hover: a finger has none, so a touch screen keeps them
     drawn, and a phone has the card's menu. The keyboard's route never went through them; they are
     `tabindex="-1"` and every verb is a key the `?` sheet lists. The picker goes the same way while
     nothing is selected, and comes back on every row once something is. */
  @media (hover: hover) and (pointer: fine) {
    .verbs,
    .table-slot:not([data-picking]) .pick:not([data-on]) {
      transition: opacity var(--d-state) var(--ease-out);
    }

    :global(.tr:not(:hover, :focus-within, [data-focused])) .verbs,
    .table-slot:not([data-picking]) :global(.tr:not(:hover, :focus-within, [data-focused]) .pick:not([data-on])) {
      opacity: 0;
    }
  }

  .pick {
    display: grid;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    padding: 0;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    cursor: pointer;
  }

  .pick[data-on] {
    background: var(--accent);
    border-color: var(--accent-edge);
  }

  .picked-clear {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    cursor: pointer;
  }

  .peek {
    display: grid;
    grid-template-columns: minmax(0, 12ch) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .filter-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .filter-group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .filter-legend {
    margin-block-end: var(--sp-2);
    padding: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .filter-values {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A full-width row, not a chip. Eight values in a wrapped chip cloud is a shape you have to scan;
     a column of rows with the boxes aligned is a shape you can run your eye down. */
  .filter-value {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 34px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* 44 UNDER A THUMB, AND BOTH OF THESE WERE MEASURED AT 390 AND FOUND SHORT. `.filter-value` is
     358x34 and is the only way to sort a list or hide a column on a phone; `.mi` is 34. Neither
     has ever been measured by `layout.mjs`, because both live inside a sheet the gate does not
     open, and the gate is right that a page at rest is what it measures. `13 §7` is the rule. */
  @media (pointer: coarse) {
    .filter-value,
    .mi {
      min-block-size: var(--tap);
    }
  }

  .filter-value:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .filter-value[data-on] {
    color: var(--ink);
    font-weight: 500;
  }

  .filter-box {
    display: grid;
    place-items: center;
    inline-size: 17px;
    block-size: 17px;
    flex: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    font-size: var(--t-xs);
    line-height: 1;
  }

  .filter-value[data-on] .filter-box {
    background: var(--accent);
    border-color: var(--accent);
  }

  .display-note {
    margin-block-end: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .locked {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .peek dt {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .peek dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }


  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  @media (width < 640px) {
    .columns-group {
      display: none;
    }

    .table-slot {
      display: none;
    }

    /**
     * THE BAR STOPS WRAPPING AND STARTS SCROLLING, because wrapping put the first row of the list
     * below the fold on every phone in the product.
     *
     * Measured at 390 by 844, `/r/obligations` drew, in order: a note card, the heading, the
     * subtitle, the count, New item, the search box, two chip groups, Display, one sentence about
     * what the search box searches, the capture field, and one sentence about what a row may be
     * missing. Eleven things. The first invoice began at 700px and the reader had to scroll to
     * learn the screen had any rows on it at all.
     *
     * `flex-wrap: wrap` is right on a laptop, where the bar is one line and the wrap is the
     * safety net. On a phone every child is close to the full width, so wrap is not a safety net,
     * it is the layout: five rows of controls standing over the thing they control. A row of chips
     * that scrolls sideways is what a phone does with a filter bar, it costs one row instead of
     * five, and nothing is hidden, which is the difference between this and a drawer.
     *
     * The panel itself must not scroll sideways: `min-inline-size: 0` on the flex child is what
     * keeps the overflow inside the bar. Without it the bar sizes to its content and takes the app
     * with it, which is the 30px sideways scroll the comment above `.bar` records fixing once.
     */
    /**
     * AND THEN THE SEARCH BOX SCROLLED WITH THE CHIPS, WHICH IS WHY IT HAS A LINE OF ITS OWN NOW.
     *
     * The first version of this made the whole bar one sideways scroller and gave the search box a
     * floor. The floor was on the wrapper, so the input measured 62px and read `Searcl`; moving it
     * to the input gave 96px and `Search mor`. A floor cannot win, because the placeholder is
     * "Search" plus the register's own name and `Search services` is longer than `Search money`.
     * And the comment that gave the box its floor said it was "the one thing that never scrolls out
     * of reach", which was true only while nobody scrolled.
     *
     * So the search box takes the bar's first line at full width and the chips, Clear and Display
     * share a second line that is the only thing that scrolls. Two lines instead of the five that
     * wrapping gave, and the search box is always the whole width of the phone.
     */
    .bar {
      flex-wrap: wrap;
      min-inline-size: 0;
    }

    .bar > .field {
      flex: 1 1 100%;
    }

    .bar-rest {
      display: flex;
      flex: 1 1 100%;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--sp-2);
      min-inline-size: 0;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      /* Room for the shadow of the last chip, and a scroll that ends flush rather than clipped. */
      padding-block-end: var(--sp-1);
    }

    .bar-rest::-webkit-scrollbar {
      display: none;
    }

    .bar-rest > * {
      flex: 0 0 auto;
    }
  }
</style>
