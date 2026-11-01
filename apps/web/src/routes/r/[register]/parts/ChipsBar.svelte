<!--
  THE TOOLBAR'S START (money F7): the search box, 240 to 360 wide and 36 tall; the quick
  filter, one segmented control of the slices a list is looked at by, with their counts ("All 38 · Late 4 · Due soon 2 ·
  Paid 10"); one Filter button that opens every field and the query builder in the sheet; and each filter that is on,
  as a rectangle (radius 8, never a pill) that a press takes off. On a phone: the search box and the Filter square, and
  the sheet starts with a Late toggle and leaves out every value that holds nothing.

  The bar over the list: the search box, the filters as segments, menus or one phone button, the list
  clauses a segment cannot draw, Clear and Save as a view. And the phone's filter sheet, which is the
  same filters behind the one button. Display is the toolbar's now, beside the view switch.

  IT IS THE START OF THE LIST'S TOOLBAR, INSIDE THE LIST'S TILE: the search box is a field, a field with
  three or more values is one rectangle that opens a menu, and two are a segmented control. Every control is a
  rectangle in the field's fill; a filter with a value chosen in it takes the accent's tint. No glass, and no pills.

  THE BAR APPEARS WHEN THERE IS SOMETHING TO SIFT, which is `shown`, the page's answer. Below eight
  rows it was a search box, six chips and a keyboard strip standing over a list you could already
  read, and on the first run it stood over the one row somebody had just typed.

  THE FILTER DRAWER IS GONE, AND THE CHIPS ARE THE FILTER. It rendered the same enum fields as the
  segmented controls in the toolbar, as checkboxes, behind a scrim, over the identical controls
  still visible underneath it. The bar wraps, so the chips are never hidden at any width. A drawer
  earns its place when there are more fields than fit, and on a phone that is what the sheet below
  is for.

  EVERYTHING IS THE PAGE'S BUT WHETHER THE SHEET IS OPEN. Which filters are on lives in the address,
  and the page reads it and writes it (`isOn`, `toggleFilter`, `dropFilter`, `setQuery`); the counts
  are the page's `facets`; `saveView` is the page's write. The sheet's open state is kept here
  because nothing but this bar opens it or reads it.

  THE SHEET HOLDS THE QUERY BUILDER, the one editor of a filter in this app, at every width:
  from 640 it opens from the bar's Filter control beside the pills, and below it from the one Filter
  button, under the pills' own values. The builder edits the address's chips as rows and writes them
  back when the sheet closes, so typing a value is not a navigation per key. The address is a flat
  "and" of chips (`chipsOf`), so the builder is offered depth 1 and the operators a chip spells
  (`ADDRESS_OPS`), and a chip it cannot draw is kept in the address exactly as it was.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { labelOf } from '$lib/record/api.ts';
  import type { FieldDecl } from '$lib/record/schema.ts';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ViewsMenu from './ViewsMenu.svelte';
  import type { Quick } from './list.ts';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Predicate } from '@braindog/where';
  import { apiBase } from '$lib/at.ts';
  import { open } from '$lib/data/record.ts';
  import { chipsOf, type Filter } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import QueryBuilder from '$lib/query/QueryBuilder.svelte';
  import { ADDRESS_OPS, fromChips, fromWhere, offered, toChips, toWhere, type Counted } from '$lib/query/tree.ts';
  import { describeWith, slashAnswers } from '$lib/query/slash.ts';

  let {
    shown,
    register,
    name,
    q,
    filtered,
    savable = true,
    enums,
    chips,
    quick = [],
    quickAt = null,
    setQuick,
    facets,
    isOn,
    toggleFilter,
    dropFilter,
    setQuery,
    saveView,
    shareView,
  }: {
    /** Whether the list is big enough to sift, or is being sifted already. */
    shown: boolean;
    register: string;
    /** The list's own name, which the search box names itself by. */
    name: string;
    q: string;
    /** A search or a filter is on. */
    filtered: boolean;
    /** Whether what narrows the list is something a view can keep. Save view is drawn only when it is; Clear stays. */
    savable?: boolean;
    /** Every declared enum field a reader can sift on. */
    enums: readonly FieldDecl[];
    /** Each filter that is on and is not the quick slice's own, as the rectangle that takes it off: its words and its place. */
    chips: readonly { at: number; said: string }[];
    /** The list's quick slices, and which one the address is on (`quickOf`, `quickOn`). Empty where the list has none. */
    quick?: readonly Quick[];
    quickAt?: Quick['key'] | null;
    setQuick?: ((key: Quick['key']) => void) | undefined;
    facets: ReadonlyMap<string, ReadonlyMap<string, number>>;
    isOn: (field: string, value: string) => boolean;
    toggleFilter: (field: string, value: string) => void;
    dropFilter: (at: number) => void;
    setQuery: (value: string) => void;
    saveView: () => void;
    /** "Share this view", for an owner or an Admin; absent for anybody else. */
    shareView?: (() => void) | undefined;
  } = $props();

  /* The phone's filter sheet: every enum field and Clear, behind one button beside the search box. */
  let filterOpen = $state(false);

  /* This part's own words: the phone's Filter button, named with what is chosen in it. */
  const words = { filterOn: (chosen: string): string => `${copy.filter}: ${chosen}` } as const;

  /* ── the query builder in the sheet ─────────────────────────────────────── */

  /**
   * THE FIELDS A CONDITION MAY NAME, as the record last declared this list. `REGISTERS` is filled by the page's own
   * `schema` read before the bar is drawn, and it is not a rune, so it is read again whenever the sheet opens.
   */
  const fields = $derived.by(() => (void filterOpen, offered(REGISTERS[register]?.fields ?? [])));
  /** The address's chips, as rows, and the chips the rows cannot draw, which go back into the address untouched. */
  const drawn = $derived(fromChips(chipsOf(page.url.searchParams), fields));
  const value = $derived(toWhere(drawn.root, register, fields));
  /** Whether the phone's one Filter button and its sheet stand in for the bar's controls. */
  const sheeted = $derived(rowsAsCards() && (enums.length > 0 || fields.length > 0));
  /** Whether the Filter button and its sheet are there at all: a field to filter by, or a question to ask. */
  const filterable = $derived(enums.length > 0 || fields.length > 0);
  /** A value the sheet offers: one that holds something, or one that is already chosen (money F8). */
  const offeredValue = (f: FieldDecl, value: string): boolean => !facets.has(f.id) || (facets.get(f.id)?.get(value) ?? 0) > 0 || isOn(f.id, value);
  const late = $derived(quick.find((x) => x.key === 'late'));

  /**
   * THE BUILDER'S TREE, HELD UNTIL THE SHEET CLOSES, beside the address it was written over. A pill pressed in the
   * meantime moves the address, and a draft written over an address that has since moved is not applied over it.
   */
  let draft = $state<{ at: string; where: Predicate | undefined } | null>(null);

  /** A tree as the address's chips, with the undrawn ones kept, or `null` where the address cannot say it. */
  function chipsFor(where: Predicate | undefined): Filter[] | null {
    const rows = fromWhere(where, fields);
    const chips = rows ? toChips(rows, fields) : null;
    return chips ? [...chips, ...drawn.kept] : null;
  }

  /** The draft into the address, as one history entry, so Back undoes the whole of what the sheet changed. */
  async function apply(): Promise<void> {
    const held = draft;
    draft = null;
    if (!held || held.at !== page.url.search) return;
    const chips = chipsFor(held.where);
    if (!chips) return;
    const next = new URLSearchParams(page.url.searchParams);
    next.delete('f');
    for (const c of chips) next.append('f', `${c.field}:${c.op}:${c.values.join(',')}`);
    await goto(`?${next}`, { noScroll: true, keepFocus: true });
  }

  let wasOpen = false;
  $effect(() => {
    const now = filterOpen;
    if (wasOpen && !now) untrack(() => void apply());
    if (!wasOpen && now) total = null;
    wasOpen = now;
  });

  /** The list's own size, asked once each time the sheet opens: the "of N" under the builder. */
  let total: Promise<number | null> | null = null;

  /** "Matches n of N": the record's own count for this list, the search box and the builder's filter. */
  async function counted(where: Predicate | undefined): Promise<Counted | null> {
    const chips = chipsFor(where);
    if (!chips) return null;
    const src = await open();
    total ??= src.count(register, { filters: [], q: '' }).then((out) => (out.ok ? out.value : null));
    const [n, of] = await Promise.all([src.count(register, { filters: chips, q }), total]);
    return n.ok && of !== null ? { n: n.value, of } : null;
  }

  /* SLASH DRAFTS ONLY WHERE A MODEL IS BEHIND IT ON THIS HOST, and the control is absent everywhere else. */
  const describe = $derived(slashAnswers(page.data) ? describeWith(apiBase(), name) : undefined);
</script>

{#if shown}
<div class="bar">
  <label class="field">
    <Icon name="search" size="s" />
    <!-- A NAME, NOT A PLACEHOLDER. The input sits in a `<label>` whose only other child is an
         `aria-hidden` icon, so its accessible name came from the placeholder alone, which
         disappears the moment somebody types, taking the name with it. Every search box in the
         product had the same shape. -->
    <input
      class="field-input"
      type="search"
      aria-label={copy.searchIn(name)}
      placeholder="Search {name.toLowerCase()}"
      value={q}
      oninput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  <!-- THE QUICK FILTER, from 640: the list's slices with their counts, one chosen. A thumb has the sheet's Late toggle. -->
  {#if quick.length > 0 && setQuick && !rowsAsCards()}
    <Segmented class="quick-track" role="group" aria-label={copy.filter}>
      {#each quick as slice (slice.key)}
        <button
          type="button"
          class="segment"
          data-on={quickAt === slice.key ? '' : undefined}
          aria-pressed={quickAt === slice.key ? 'true' : 'false'}
          onclick={() => setQuick?.(slice.key)}
        >
          <span class="segment-word">{slice.label}</span>
          {#if slice.count !== null}<span class="segment-n num">{slice.count}</span>{/if}
        </button>
      {/each}
    </Segmented>
  {/if}

  <!--
    ONE FILTER BUTTON. Which way, Status and Category were three menus and a builder beside them, eight controls over the
    rows; they are one sheet now, the fields' values first and the builder under them. On a phone it is a 44px square
    with how many values are on beside the glyph, so the bar is one row: search and Filter.
  -->
  {#if filterable}
    {@const chosen = enums.flatMap((f) => (f.values ?? []).filter((value) => isOn(f.id, value)).map((value) => valueSaid(f, value)))}
    <button
      type="button"
      class="sift sift-build tap"
      class:sift-sheet={sheeted}
      data-on={sheeted && chosen.length ? '' : undefined}
      aria-haspopup="dialog"
      aria-label={sheeted && chosen.length ? words.filterOn(chosen.join(', ')) : copy.filter}
      onclick={() => (filterOpen = true)}
    >
      <Icon name="filter" size={sheeted ? 'm' : 's'} />{#if !sheeted}<span class="sift-name">{copy.filter}</span>{/if}
      {#if sheeted && chosen.length}<span class="sift-count num" aria-hidden="true">{chosen.length}</span>{/if}
    </button>
  {/if}

  <!-- EACH FILTER THAT IS ON, AS A RECTANGLE A PRESS TAKES OFF: its field, how it compares and what. The quick slice's
       own chips are the segment above and are not drawn twice. -->
  {#each chips as c (c.at)}
    <button type="button" class="sift listed tap" data-on aria-label="{copy.clear} {c.said}" onclick={() => dropFilter(c.at)}>
      <span class="sift-chosen">{c.said}</span>
      <Icon name="close" size="s" />
    </button>
  {/each}

  {#if filtered && !sheeted && chips.length > 1}
    <span class="bar-clear"><Button weight="bare" href="/r/{register}"><Icon name="close" size="s" />{copy.clearFilters}</Button></span>
  {/if}
</div>
{/if}

<!-- The filter sheet. On a phone it opens with the same fields and values as the bar's menus, as the
     Display sheet's rows, each with its count, and Clear beside Done so undoing every filter is in the
     same place as setting one. At every width the query builder follows, over the same address. -->
{#if filterable}
  <Sheet bind:open={filterOpen} title={copy.filter}>
    <!-- LATE FIRST, ON A PHONE (money F8): the one slice a thumb is most often after, as a toggle at the head of the sheet. -->
    {#if filterOpen && rowsAsCards() && late && setQuick}
      <button
        type="button"
        class="filter-value filter-late"
        data-on={quickAt === 'late' ? '' : undefined}
        aria-pressed={quickAt === 'late' ? 'true' : 'false'}
        onclick={() => setQuick?.(quickAt === 'late' ? 'all' : 'late')}
      >
        <span class="filter-box" aria-hidden="true">{#if quickAt === 'late'}<Icon name="check" size="s" />{/if}</span>
        {late.label}
        {#if late.count !== null}<span class="filter-n">{late.count}</span>{/if}
      </button>
    {/if}
    <!-- THE VALUES ARE DRAWN WHILE THE SHEET IS OPEN AND NOT BEFORE. A closed sheet held two dozen hidden
         `.filter-value` buttons ahead of the Display sheet's in the document, so the first one anything found on the page
         was one nobody could see. -->
    {#if filterOpen && enums.length}
    <div class="filter-groups">
      {#each enums as f}
        <fieldset class="filter-group">
          <legend class="filter-legend">{labelOf(f)}</legend>
          <div class="filter-values">
            {#each (f.values ?? []).filter((value) => offeredValue(f, value)) as value}
              {@const on = isOn(f.id, value)}
              <button
                type="button"
                class="filter-value"
                data-on={on ? '' : undefined}
                aria-pressed={on ? 'true' : 'false'}
                onclick={() => toggleFilter(f.id, value)}
              >
                <span class="filter-box" aria-hidden="true">{#if on}<Icon name="check" size="s" />{/if}</span>
                {valueSaid(f, value)}
                {#if facets.has(f.id)}<span class="filter-n">{facets.get(f.id)?.get(value) ?? 0}</span>{/if}
              </button>
            {/each}
          </div>
        </fieldset>
      {/each}
    </div>
    {/if}

    {#if fields.length}
      <div class="filter-build">
        <QueryBuilder
          {value}
          {fields}
          {register}
          depth={1}
          ops={ADDRESS_OPS}
          count={counted}
          {describe}
          onchange={(where) => (draft = { at: page.url.search, where })}
        />
      </div>
    {/if}

    {#snippet footer()}
      <Button weight="primary" onclick={() => (filterOpen = false)}><Icon name="check" size="s" />{copy.done}</Button>
      {#if filtered}
        <Button weight="bare" href="/r/{register}"><Icon name="close" size="s" />{copy.clearFilters}</Button>
      {/if}
      {#if filtered && savable}
        <!-- The sheet closes first so the toast and the page it opens are not behind it, and the builder's rows reach
             the address before the view is saved from it. -->
        <ViewsMenu
          saveView={() => {
            filterOpen = false;
            void apply().then(saveView);
          }}
          shareView={shareView
            ? () => {
                filterOpen = false;
                void apply().then(shareView);
              }
            : undefined}
        />
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  /* ONE ROW THAT WRAPS rather than running past a narrow tile: at 320 a filter left on ran off the edge of `/r/tasks`
     and the panel scrolled sideways by 30px (the wrap `/audit` took). */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE SEARCH BOX IS A FIELD (`controls.css`), 240 to 360 wide and 36 tall (money F7), so the quick filter beside it
     keeps its room. */
  .bar > .field {
    flex: 1 1 240px;
    min-inline-size: 240px;
    max-inline-size: 360px;
    min-block-size: 36px;
  }

  @media (pointer: coarse) {
    .bar > .field {
      min-block-size: var(--tap);
    }
  }

  /* THE QUICK FILTER'S SEGMENTS: the slice's word, and its count quieter beside it. */
  .segment {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .segment-n {
    color: var(--ink-3);
    font-weight: var(--fw-regular, 400);
    font-variant-numeric: tabular-nums;
  }

  /* FILTER AND EACH FILTER THAT IS ON: rectangles the toolbar's height in the quiet fill, radius 8, never a pill. */
  .sift {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (pointer: coarse) {
    .sift {
      min-block-size: var(--tap);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .sift:not([data-on]):hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* A FILTER THAT IS ON IS INK ON THE WELL, edged by the field's hairline, as every filter strip draws its choice (Look
     B: red is never "chosen"), and its cross takes it off. */
  .sift[data-on] {
    background: var(--tile-2);
    box-shadow: inset 0 0 0 1px var(--rule-strong);
    color: var(--ink);
  }

  .sift-chosen {
    min-inline-size: 0;
    overflow: hidden;
    color: inherit;
    font-weight: var(--fw-semi);
    text-overflow: ellipsis;
  }

  .listed {
    min-inline-size: 0;
    max-inline-size: 100%;
    padding-inline-end: var(--sp-2);
  }

  /* THE PHONE'S ONE FILTER CONTROL IS A 44px SQUARE with the glyph and, when values are on, how many. */
  .sift-sheet {
    justify-content: center;
    gap: var(--sp-1);
    min-inline-size: var(--tap);
    padding: 0 var(--sp-2);
  }

  .sift-count {
    color: inherit;
    font-size: var(--fs-meta);
  }

  /* THE SHEET: the Late toggle, then each field's values as rows with their boxes in one column, then the builder. */
  .filter-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .filter-late + .filter-groups {
    margin-block-start: var(--sp-4);
  }

  .filter-groups + .filter-build {
    margin-block-start: var(--sp-5);
  }

  .filter-group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .filter-legend {
    margin-block-end: var(--sp-2);
    padding: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .filter-values {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A FULL-WIDTH ROW, NOT A CHIP: a column of rows with the boxes aligned is a shape the eye runs down. */
  .filter-value {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 36px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* 44 UNDER A THUMB (`13 §7`). */
  @media (pointer: coarse) {
    .filter-value {
      min-block-size: var(--tap);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .filter-value:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .filter-value[data-on] {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .filter-n {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  /* THE SAME BOX AS THE LIST'S PICKER: 16, radius 4, 1.5px of the second ink, the button red with a white check. */
  .filter-box {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    border: 1.5px solid var(--ink-2);
    border-radius: var(--r-xs);
    color: var(--on-red);
  }

  .filter-box :global(svg) {
    inline-size: 12px;
    block-size: 12px;
  }

  .filter-value[data-on] .filter-box {
    background: var(--red-fill);
    border-color: var(--red-fill);
  }

  @media (width < 640px) {
    /**
     * ONE ROW OF 44px CONTROLS: THE SEARCH BOX AND FILTER (`1fr 44px`, money F8). A filter that is on wraps under the
     * row, and only while there is one. `min-inline-size: 0` keeps the bar inside the panel.
     */
    .bar {
      min-inline-size: 0;
    }

    .bar > .field {
      flex: 1 1 0;
      min-inline-size: 0;
      max-inline-size: none;
    }

    .listed,
    .bar-clear {
      order: 1;
      min-inline-size: 0;
    }
  }
</style>
