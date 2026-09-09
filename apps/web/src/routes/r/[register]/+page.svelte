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
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MISSING, type Tone } from 'braindog-render';
  import { Table } from 'braindog-render/svelte';
  import { declaredValue } from '$lib/record/where.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import * as pref from '$lib/pref.ts';
  import { silenced } from '$lib/a11y/keys.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { columnsFor, dirOf, display, DOM_CAP, entry, heldBy, iconFor, identityOf, inheritedFrom, labelOf, list, noticed, NOW, PAGE, PAGES, readableFields, REGISTERS, toRows, unansweredBy, type Filter, whereOf } from '$lib/record/api.ts';
  import { searchable } from '$lib/record/find.ts';
  import type { Entry, Fields } from '$lib/record/schema.ts';
  import { saidPlainly } from '$lib/record/blocks.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Empty from '$lib/ui/Empty.svelte';
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


  const id = $derived(page.params.register ?? '');
  const decl = $derived(REGISTERS[id]);

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
  const columns = $derived([
    { field: 'select', label: copy.select, hideLabel: true, width: '3ch', align: 'start' as const, truncate: 'never' as const },
    ...columnsFor(id).filter((c) => !hidden.has(c.field)),
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
  /* The answer this page set belongs to. A cursor from a different question is not a cursor. */
  let asked = $state('');

  const question = $derived(JSON.stringify([id, filters, q, sort ?? null]));

  $effect(() => {
    const now = question;
    if (now === asked) return;
    asked = now;
    const first = list(id, { filters, q, ...(sort ? { sort } : {}), limit: PAGE });
    pages = [first.entries];
    cursor = first.cursor;
    /* AND THE RECEIPTS GO WITH THE ANSWER THEY WERE ABOUT. A chip saying `archived` beside a row
       the reader has just filtered TO is a chip about a different screen: the receipt exists to
       hold a row in place through one action, not to follow it around the product. */
    receipts = new Map();
  });

  /**
   * The next page, or nothing.
   *
   * IT STOPS AT THE CAP, WHICH IS WHAT MAKES THE CAP THE END OF A SEQUENCE rather than a slice. The
   * guard is here rather than in `Table`: an earlier version relied on `Table` swapping its sentinel
   * for the cap line, which is a count of the rows it was HANDED and therefore wrong the moment a
   * row is archived — the sentinel stayed, advertising more that this function then refused.
   *
   * A STALE CURSOR STARTS OVER. `list` answers `stale` when the row a cursor names is no longer in
   * the answer, which means the question moved under the reader — and the honest response is the
   * first page of the new answer, not an empty page that reads as the end of the list.
   */
  function more() {
    if (cursor === null) return;
    if (loaded >= DOM_CAP) return;
    const next = list(id, { filters, q, ...(sort ? { sort } : {}), limit: PAGE, cursor });
    if (next.stale) {
      /* AND IT KEEPS THE NEW CURSOR. Starting over used to set `cursor = null`, which says *this is
         the whole answer* — so the head dropped its `+` and its "of N", the sentinel disappeared,
         and the grid sat on two hundred rows claiming two thousand six hundred. The recovery
         produced exactly the failure `stale` exists to prevent, one step later. */
      const first = list(id, { filters, q, ...(sort ? { sort } : {}), limit: PAGE });
      pages = [first.entries];
      cursor = first.cursor;
      return;
    }
    pages = [...pages, next.entries];
    cursor = next.cursor;
  }


  /**
   * The whole answer's SIZE, which is not the same as the rows in hand.
   *
   * `list` with no `limit` walks the same filter, so this costs what the old code cost and buys the
   * two counts every surface on this screen reads: how many rows matched, and how many the register
   * holds. The real record answers both from `index` without walking anything, which is the point of
   * separating them here rather than counting `pages`.
   */
  const found = $derived(list(id, { filters, q, ...(sort ? { sort } : {}) }));
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
    ...found,
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
    entries: [...pending.of(id), ...pages.flat()].map((e) => {
      const patch = edits.get(e.seq);
      return patch ? { ...e, fields: { ...e.fields, ...patch } } : e;
    }),
    matched: found.entries.length + pending.of(id).length,
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
   * WHAT THE HEAD COUNTS AGAINST: the answer while filtering, the list otherwise.
   *
   * Unfiltered the two are the same number, so this changes nothing on the ordinary screen. Filtered
   * they are not, and the head and the cap line have to be talking about the same denominator or one
   * of them is wrong wherever they are both visible — which is exactly at the cap, the one place the
   * cap line exists for.
   */
  const denominator = $derived(filters.length || q ? result.matched : result.total);

  /**
   * AND WHAT IS ACTUALLY DRAWN, WHICH IS NEITHER OF THE OTHER TWO.
   *
   * `more()` stops once `loaded` reaches the cap, and a page is two hundred rows, so it overshoots:
   * eleven pages minus three archived rows is 2,197 loaded while the grid slices to 2,000. Reporting
   * `loaded` put "2,197" in the head and "Showing 2,197 of 2,611" in the cap line over two thousand
   * rows — two numbers describing rows nobody can see. The head and the line both count the grid.
   */
  const drawn = $derived(Math.min(loaded, DOM_CAP));

  /** Whether the reader is looking at all of it. Everything honest on this screen turns on it. */
  const whole = $derived(cursor === null);

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
  const settled = $derived(whole || drawn >= DOM_CAP);
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
  const rows = $derived(toRows(id, result.entries.slice(0, DOM_CAP), columns));

  /**
   * WHAT A READER CAN ORDER THE LIST BY, and what each direction is CALLED.
   *
   * `columns[0]` is the selection box — not a field, ordering nothing — so the sort list is
   * everything after it. It offered "Select" as a sort key for exactly as long as it took to look.
   *
   * And the direction is named in the field's own terms. A column header can get away with an arrow
   * because the arrow sits on the thing it orders; a chip in a sheet is read on its own, and
   * "Due ↑ lowest first" is a sentence about a date that nobody says. `19 §9`'s rule is that the
   * product speaks the reader's words, and the reader's word for an ascending day is *oldest*.
   */
  const sortable = $derived(columns.slice(1));

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
    receipt(seq, { mark: copy.markArchived, undo: () => clearReceipt(seq) });
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
  function addTypedRow() {
    if (problems.length > 0 || !decl) return;
    const named = display(id, decl.title, taken[decl.title]) ?? '';
    const seq = pending.add(id, taken);
    receipt(seq, { mark: copy.markNotWritten, intent: 'warn', undo: () => pending.drop(id, seq) });
    closeCreate();
    toasts.push(copy.notWritten(`${decl.one} ${named}`.trim()), { intent: 'warn' });
  }

  function captureRow() {
    const said = capture.trim();
    if (!said) return;
    /* NEGATIVE SEQUENCES, so a draft can never collide with a row the record has. The spoken id is
       what every other thing on this screen addresses a row by, and two rows answering to
       `obligations#7` is the one collision that would make the receipt point at the wrong row. */
    const title = decl?.title;
    if (!title) return;
    /* THE SAME PLACE THE FIRST-RUN SCREEN PUTS ITS ROW. A row typed here and a row typed on `/start`
       are the same kind of thing, waiting on the same missing write path, and holding one of them
       in this component and the other in a module would be two answers to one question: the second
       screen to need it would have found the wrong one. */
    const seq = pending.add(id, { ...inherited, [title]: said });
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
      intent: 'warn',
      undo: () => {
        pending.drop(id, seq);
        clearReceipt(seq);
      },
    });
    capture = '';
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
  const EDITABLE = new Set(['text', 'enum', 'day', 'int', 'decimal', 'pct']);

  let editing = $state<{ seq: number; field: string } | null>(null);
  let editValue = $state('');



  const fieldOf = (field: string) => decl?.fields.find((f) => f.id === field);
  const editableHere = (field: string) => EDITABLE.has(fieldOf(field)?.type ?? '');

  function openEditor(seq: number, field: string) {
    if (!editableHere(field)) return;
    const now = entry(id, seq)?.fields[field] ?? edits.get(seq)?.[field];
    editing = { seq, field };
    editValue = now === null || now === undefined ? '' : String(now);
  }

  function commitEdit() {
    const at = editing;
    if (!at) return;
    editing = null;
    const was = entry(id, at.seq)?.fields[at.field];
    const said = editValue.trim();
    /* NOTHING CHANGED IS NOT AN EDIT. A receipt for a value somebody looked at and left alone is a
       row wearing `Not saved` for no reason, and after three of those the chip stops being read. */
    if (said === (was === null || was === undefined ? '' : String(was))) return;

    const next = new Map(edits);
    next.set(at.seq, { ...(next.get(at.seq) ?? {}), [at.field]: said === '' ? null : said });
    edits = next;
    receipt(at.seq, {
      mark: copy.markNotWritten,
      intent: 'warn',
      undo: () => {
        const back = new Map(edits);
        const patch = { ...(back.get(at.seq) ?? {}) };
        delete patch[at.field];
        if (Object.keys(patch).length === 0) back.delete(at.seq);
        else back.set(at.seq, patch);
        edits = back;
        clearReceipt(at.seq);
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
     that says what the row IS. It was 1 when the id was the leading column. */
  let focus = $state({ row: 0, col: 2 });
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
  const peeked = $derived.by(() => {
    const said = Number(page.url.searchParams.get('row'));
    return Number.isInteger(said) && said > 0 ? said : null;
  });

  const peek = (seq: number | null) =>
    setParam((p) => {
      if (seq === null) p.delete('row');
      else p.set('row', String(seq));
    });

  const peekedEntry = $derived(peeked === null ? undefined : entry(id, peeked));

  /** Only INDEXED fields are offered, in declaration order, at most eight. A filter on an unindexed
      field is a promise the storage cannot keep at 5,000 rows. */
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
   */
  const ENOUGH_TO_SIFT = 8;

  const filterable = $derived((decl?.fields ?? []).filter((f) => f.index).slice(0, 8));

  /** The moment `19 §6` describes: the register, with their one row in it. */
  const arriving = $derived(page.url.searchParams.has('first'));

  /**
   * WHETHER THIS LIST IS BIG ENOUGH TO NEED SIFTING THROUGH.
   *
   * `result.total` AND NOT `result.matched`, because the question is about the list and not about
   * what is on screen: filtering thirty-eight rows down to one must not remove the control that got
   * you there. The two differ exactly when somebody is already sifting.
   */
  const siftable = $derived(!arriving && result.total >= ENOUGH_TO_SIFT);

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
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;

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
    if (mod && e.key.toLowerCase() === 'a') {
      /* All LOADED, never all matching. A select-all reaching rows the DOM has never held is a
         count you cannot verify by looking — the same argument as 13 §4.3's 2,000-row cap, from the
         other side. */
      e.preventDefault();
      selected = new Set(result.entries.slice(0, DOM_CAP).map((r) => r.seq));
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      toasts.push(copy.notWritten('The filter would be saved as a named view on this register'), { intent: 'warn' });
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
        archive(row.seq);
        focus = { ...focus, row: Math.min(focus.row, result.entries.length - 2) };
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
    } else if (e.key === 'x' || e.key === 'X') {
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
      toasts.push(copy.copied(`${picked.length} ${picked.length === 1 ? 'id' : 'ids'}`));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }

  function archiveSelected() {
    const seqs = picked.map((e) => e.seq);
    const next = new Map(receipts);
    for (const seq of seqs) next.set(seq, { mark: copy.markArchived });
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
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(decl?.name)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !decl}
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
      body={copy.theseExist('Lists', Object.values(REGISTERS).map((r) => r.name))}
    >
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <!-- `define="list"`: `19 §6`'s clause, on the first list this person ever opens and never again.
       The rail has said LISTS on every screen since the day it was written and nothing has ever said
       what one is — and this heading is where somebody is looking at a list rather than at the word
       for it, which is what "in the sentence that needs it" means. -->
  <PageHead icon={iconFor(decl.icon, 'rows')}
    title={decl.name}
    count={whole ? result.matched : drawn}
    atLeast={!whole && drawn < DOM_CAP}
    total={denominator}
    define="list"
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
      <Button weight="primary" onclick={() => (createOpen = true)}><Icon name="plus" size="s" />{copy.newRow} {decl.one}</Button>
    {/snippet}
  </PageHead>

  <div class="page">
    <!-- THE BAR APPEARS WHEN THERE IS SOMETHING TO SIFT. Below eight rows it was a search box, six
         chips and a keyboard strip standing over a list you could already read — and on the first
         run it stood over the one row somebody had just typed. -->
    <!-- AND ON THE RUN SCREEN TWO IS ABOUT, IT COMES FIRST. -->
    {#if arriving}
      <!-- ON THE ARRIVAL ITSELF, THE ONLY LIST WITH ANYTHING IN IT IS THIS ONE.

           `?first=1` is a claim about the moment: somebody has just written their first row and been
           sent here. `19 §6` calls this screen "the register, with their one row in it" — so on a
           genuine first run `held` is one register, and it is this one. Passing the seeded record's
           eight would describe a record that person does not have. -->
      <Second held={[id]} register={id} first />
    {/if}

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
              {value.replace(/_/g, ' ')}
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
      <Button weight="bare" onclick={() => (displayOpen = true)}>
        <Icon name="settings" size="s" />{copy.display}
      </Button>

      <!-- FOUR ROW VERBS OVER NOTHING TO ACT ON. Filtering to zero kept the strip, so a screen whose
           whole message is "38 rows, none matching" also offered to move, peek, open and archive a
           row that is not there. -->
      {#if result.entries.length > 0}
        <span class="bar-hint">
          <Kbd keys="j  k" /> move <Kbd keys="p" /> peek <Kbd keys="↵" /> open <Kbd keys="⌫" /> archive
        </span>
      {/if}
    </div>
    {/if}

    <!--
      WHERE THE FIELDS THAT ARE NOT CHIPS ARE FILTERED. It lived inside the drawer and came out with
      it, which is where it always belonged: the search box it names is on the line above.

      AND ONE OF THE TWO SENTENCES WAS FALSE. "Due sorts on the column" named one field, and every
      column on this table sorts — clicking `Amount` gives `?sort=amount:asc` and
      `aria-sort="ascending"`. So the product explained its own interface, in a drawer, incorrectly.
      Sorting is a fact about the table and the table already says it: eight headers, each a button.
    -->
    {#if siftable && searched.length > 0}<p class="bar-note">{copy.filterBySearch(searched)}</p>{/if}

    <!-- WHAT THE RECORD NOTICED, ON THE SCREEN IT IS ABOUT.

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
               rejection, in every product a person has used before this one. The CODE stays, in
               the quiet strip below, because the sentence is for the person and the code is for
               whoever they ask for help: showing only the friendly half leaves that person nothing
               to search for. -->
          <strong>{seen.n} saves</strong> to
          <!-- A NAME AND NOT A LINK. The writes were REFUSED, so there are no rows to filter to and
               nowhere in this build that shows a field's own declaration; a link that went to a
               filter matching nothing would be worse than the plain word. -->
          {#if seen.field}<em class="seen-field">{seen.field.label}</em>{:else}this register{/if}
          were rejected over {seen.days} days: {seen.fix}.
          <!-- NO `title`. It carried `seen.why` — the same fact as the sentence beside it, in the
               schema's spelling, in an attribute no touch device shows and no keyboard reaches. Two
               tellings of one thing, one of them unreachable. -->
          <span class="seen-code">{seen.code} · {seen.window}</span>
        </p>
        <Button
          weight="quiet"
          onclick={() => toasts.push(copy.notWritten(`${seen?.field?.label ?? id} would be raised as a question on /decide, with the ${seen?.n} refused writes attached`), { intent: 'warn' })}
        >{copy.raiseIt}</Button>
      </aside>
    {/if}

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
          <input
            id="capture"
            class="capture-input"
            type="text"
            autocomplete="off"
            bind:value={capture}
            placeholder={copy.captureIn(decl.one)}
            aria-describedby="capture-why"
          />
          <!-- Present only once there is something to add. -->
          {#if capture.trim()}<button type="submit" class="capture-go">{copy.captureAdd}</button>{/if}
        </div>
        <p class="capture-why" id="capture-why">
          {#if unanswered.length > 0}
            {copy.captureNeeds(unanswered.map((f) => f.label.toLowerCase()).join(', '))}
          {:else if Object.keys(inherited).length > 0}
            {copy.captureInherits(
              Object.keys(inherited)
                .map((f) => (decl.fields.find((x) => x.id === f)?.label ?? f).toLowerCase())
                .join(' and '),
            )}
          {:else}
            {copy.captureHint}
          {/if}
        </p>
      </form>
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
        title={emptyKind === 'no-results'
          ? `${result.total} rows, none matching:`
          : emptyKind === 'cleared'
            ? 'Nothing outstanding.'
            : `Nothing in ${decl.name} yet.`}
        query={emptyKind === 'no-results' ? [q, saidPlainly(id, whereOf(filters))].filter(Boolean).join(' · ') : undefined}
        body={emptyKind === 'no-data-yet'
          ? `${decl.name} holds ${decl.holds}.`
          : emptyKind === 'no-results' && q
            ? copy.searchesOnly(searched)
            : undefined}
        agentPrompt={emptyKind === 'no-data-yet'
          ? `read my record, then add every ${decl.one} you find`
          : undefined}
      >
        {#snippet actions()}
          {#if emptyKind === 'no-results'}
            <Button href="/r/{id}">{copy.clearFilters}</Button>
          {:else if emptyKind === 'no-data-yet'}
            <Button weight="primary" onclick={() => (createOpen = true)}>{copy.addOne}</Button>
            <Button onclick={() => toasts.push(copy.notWritten('One example row would be added, marked `example`'), { intent: 'warn' })}>{copy.showExample}</Button>
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
                  onclick={() =>
                    toasts.push(copy.notWritten(`${picked.length} rows would be set to ${state.replace(/_/g, ' ')}`), {
                      intent: 'warn',
                    })}
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
      <RowCards register={id} entries={result.entries.slice(0, DOM_CAP)} picked={selected}>
        {#snippet action(e)}
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
            <Icon name="more" size="s" />
          </button>
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
      {#if !whole && loaded < DOM_CAP}
        <div class="sentinel" aria-hidden="true"></div>
      {/if}
      {:else}
      <div class="table-slot">
        <!-- ONE ROW HAS NOTHING TO SORT. `onsort` is optional and the table draws a plain label
             without it, so eight header buttons over a single row — each announcing
             `aria-sort="none"` — become eight headings. -->
        <Table
          {columns}
          {rows}
          total={rowCount}
          cap={DOM_CAP}
          {...whole ? {} : { onmore: more }}
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
            {@const ident = identityOf(id, column.field, entry(id, seq)?.fields[column.field])}
            {#if column.field === 'select'}
              <button
                type="button"
                class="pick"
                tabindex="-1"
                data-on={selected.has(seq) ? '' : undefined}
                aria-label="{selected.has(seq) ? copy.deselect : copy.select} {display(id, decl.title, entry(id, seq)?.fields[decl.title]) ?? `#${seq}`}"
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
                  onblur={commitEdit}
                  onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') editing = null;
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
                  onblur={commitEdit}
                  onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitEdit();
                    else if (e.key === 'Escape') editing = null;
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
              {@const name = display(id, decl.title, entry(id, seq)?.fields[decl.title]) ?? `#${seq}`}
              {#if said}
                <span class="said">
                  <Chip label={said.mark} tone={said.intent} />
                  {#if said.undo}
                    <button
                      type="button"
                      class="verb"
                      tabindex="-1"
                      aria-label={copy.undoRowOf(name)}
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
                    class="verb icon"
                    tabindex="-1"
                    aria-label={copy.archiveRow(name)}
                    onclick={(e) => {
                      e.stopPropagation();
                      archive(seq);
                    }}><Icon name="archive" size="s" /></button>
                  <button
                    type="button"
                    class="verb icon"
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
            {:else if value === null}
              <span class="missing">—</span>
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
              <span class="cell-said">{value}<button
                  type="button"
                  class="cell-pen"
                  tabindex="-1"
                  aria-label={copy.editValue(labelOf(fieldOf(column.field)!))}
                  onclick={(e) => {
                    e.stopPropagation();
                    openEditor(seq, column.field);
                  }}
                ><Icon name="edit" size="s" /></button></span>
            {:else}{value}{/if}
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
      {#if loaded >= DOM_CAP}
        <CapLine shown={drawn} total={result.matched} />
      {/if}
      </div>
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
    <Second held={Object.keys(REGISTERS).filter((r) => heldBy(r) > 0)} register={id} first={false} />
  {/if}

  <!-- Peek: a drawer, with the list still visible, for triage. It needs a VISIBLE affordance —
       Linear's own docs admit the flaw that Peek can only be launched with the keyboard shortcut,
       and users do not press `?` to discover what they do not know exists (19 §4). -->
  <Sheet
    open={peeked !== null}
    title={String(peekedEntry?.fields[decl.title] ?? '')}
    id="#{peeked ?? ''}"
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
          <dd dir={dirOf(id, f.id)}>{display(id, f.id, peekedEntry.fields[f.id]) ?? MISSING}</dd>
        {/each}
      </dl>
    {/if}
    {#snippet footer()}
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

      <fieldset class="filter-group">
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
      <button class="mi" role="menuitem" type="button" onclick={() => peek(seq)}>
        <Icon name="eye" size="s" />
        <span class="mi-name">{copy.peek}</span><Kbd keys="p" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => void copyId(seq)}>
        <Icon name="copy" size="s" />
        <span class="mi-name">{copy.copyId}</span><Kbd keys="y" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => void copyLink(seq)}>
        <Icon name="link" size="s" />
        <span class="mi-name">{copy.copyLink}</span><Kbd keys="⇧Y" />
      </button>
      <!-- AND THE ONE VERB THAT UNLOCKS THE OTHER FOUR. Selection was `x` alone, so the bulk bar —
           copy ids, set state, archive them — could not be reached at all without a keyboard. One
           row selected is enough to make it appear, and the bar takes it from there. -->
      <button class="mi" role="menuitem" type="button" onclick={() => toggleSelect(seq, false)}>
        <Icon name="check" size="s" />
        <span class="mi-name">{selected.has(seq) ? copy.deselect : copy.select}</span><Kbd keys="x" />
      </button>
      <!-- THE REGISTER'S OWN STATES, WHICH THIS MENU DID NOT CARRY.
           Five verbs, and the one a person reaches for most on a list of obligations was not among
           them: the only way to move a row's state was to select it and use the bulk bar, which is
           three presses to change one row. The values come from the declaration rather than from a
           list typed here, so a pack that adds a state gets a menu item.

           NOT THE STATE IT IS ALREADY IN. An item that sets a row to where it already is does
           nothing and looks like it did something, and `19 §6`'s rule for a control that cannot act
           is that it is absent rather than greyed. -->
      {#if states.length > 0}
        <hr class="mi-rule" />
        {#each states.filter((v) => v !== entry(id, seq)?.fields[decl.state ?? '']) as state}
          <button class="mi" role="menuitem" type="button" onclick={() => setRowState(seq, state)}>
            <Icon name="check" size="s" />
            <span class="mi-name">{copy.setTo(state.replace(/_/g, ' '))}</span>
          </button>
        {/each}
      {/if}
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
      <Button
        weight="primary"
        disabled={problems.length > 0}
        aria-describedby={problems.length > 0 ? 'new-row-why' : undefined}
        onclick={addTypedRow}
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
    padding: var(--sp-4) var(--sp-6) var(--sp-9);
  }

  /* A NOTE READS AS A NOTE. One hairline, the page's own paper, no intent colour and no fill: it
     sits above the grid the way a margin annotation sits beside a paragraph. The code is set in the
     id face at the smallest size so an operator can find it and a bookkeeper's eye skips it. */
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
    border: 1px solid var(--line);
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

  .seen-said strong { color: var(--ink); font-weight: 600; }
  .seen-field { color: var(--ink); font-style: normal; font-weight: 600; }

  .seen-code {
    margin-inline-start: var(--sp-2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    color: var(--dim);
    white-space: nowrap;
  }

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

  .mi:hover,
  .mi:focus-visible {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
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
    .card-more {
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--ctl-h);
      flex: none;
      padding: 0;
      background: none;
      border: 0;
      border-inline-start: 1px solid var(--line);
      color: var(--dim);
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
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--r-md);
    color: var(--accent-text);
    font-size: var(--t-ui);
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
    font-weight: 700;
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

  .cell-said {
    display: inline-flex;
    gap: var(--sp-2);
    align-items: center;
    min-inline-size: 0;
  }

  /* PRESENT IN THE TREE AND INVISIBLE UNTIL IT IS WANTED. `opacity` and not `display: none`, because
     a control removed from the box changes the cell's width the moment a pointer enters it, and a
     column that reflows under the cursor is a column you cannot click accurately. */
  .cell-pen {
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

  /* ── capture, and the verbs on the row ────────────────────────────────── */

  /* ONE LINE, AND IT LOOKS LIKE ONE. The label is for a screen reader and for nobody else: the
     field's own placeholder says the same words, and a visible label above a single-field form
     turns one line into three. */
  .capture {
    margin: 0 0 var(--sp-4);
  }

  .capture-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .capture-field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-inline: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
  }

  /* THE RING IS ON THE BOX AND NOT ON THE INPUT, because the submit control is inside the box: a
     ring around the text alone would draw a line between the field and its own button. It is the
     same move `/search` makes for the same reason. */
  .capture-field:focus-within {
    border-color: var(--accent);
  }

  .capture-input {
    flex: 1;
    min-inline-size: 0;
    padding-block: var(--sp-3);
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
  }

  .capture-go {
    padding: 2px var(--sp-3);
    background: var(--accent);
    border: 1px solid var(--accent-edge);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .capture-why {
    margin: var(--sp-2) 0 0;
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
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
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-xs);
    cursor: pointer;
  }

  .verb.icon {
    display: grid;
    place-items: center;
    padding: 2px;
    opacity: 0.45;
  }

  .verb:hover,
  .verb:focus-visible {
    border-color: var(--edge);
    color: var(--ink);
    opacity: 1;
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

  .bar-hint {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
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
    font-weight: 600;
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

  .filter-value:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
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

  .bar-note {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .peek dt {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .peek dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }


  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    /* Only ONE rule belongs in this block, and thirty lines of `.mi` and `.picked` were pasted in
       beside it — identical to the top-level ones, at the wrong indentation, re-declaring what was
       already true. Dead weight in the bundle, and a media query that lies about what it changes. */
  .bar-hint {
      display: none;
    }
  }

  @media (width < 640px) {
    .table-slot {
      display: none;
    }

  }
</style>
