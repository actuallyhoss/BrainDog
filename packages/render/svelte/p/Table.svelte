<!--
  `table` — real columns, a header, per-column alignment. Kinds: `comparison`, and the page-only
  `table`. It is also the register grid's body, which makes it the one primitive with behaviour.

  NOT a `<table>`. Measured in Chrome 151 at 8 columns, `<table>` layout scales superlinearly —
  26.9 / 59.6 / 149 / 318 / 790 ms across 500 / 1k / 2k / 5k / 10k rows — and `content-visibility`
  does not work on table rows, by spec and by measurement: size containment has no effect on an
  internal table box, and 5,000 `<tr>` with `content-visibility: auto` moved layout from 318 ms to
  337 ms. Grid with chunked CV takes the same 5,000 rows to 0.6 ms of layout (22 §4).

  Which forces the key coupling, and it is the best sentence in that research: because we need
  `content-visibility`, COLUMN WIDTHS MUST BE DECLARED, NOT CONTENT-DERIVED. `subgrid` would be the
  obvious alignment fix and is incompatible with it — a row with both reports computed
  `grid-template-columns: none`. So there is ONE `--cols` track list on the grid root and both the
  header and the body rows read it. The reason the fast path exists is that pages are declared.

  Per-row `content-visibility` is a trap: it fixes layout and produced 17 of 89 frames over 16.7 ms
  during scroll, versus 0 of 89 for chunked. Chunk at ~100 rows.

  A `role="grid"` and not a `role="table"` for two reasons: a grid is composite, so only one of its
  focusable elements is in the page tab sequence — at 500 rows by 8 columns that is the difference
  between one tab stop and four thousand — and a composite widget flips a screen reader out of
  browse mode, which is the only thing that makes bare single-letter row verbs legal under WCAG
  2.1.4 (19 §4).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chunkRows, type Column, type TableRow } from '../types.ts';

  let {
    columns,
    rows,
    total = -1,
    cap,
    label,
    sort,
    focus = $bindable(),
    selected,
    chunk = 100,
    onactivate,
    onsort,
    onmore,
    cellSnippet,
  }: {
    columns: readonly Column[];
    rows: readonly TableRow[];
    /** `aria-rowcount`. -1 while a filtered total is unknown, which is the honest answer. */
    total?: number | undefined;
    cap?: number | undefined;
    label?: string | undefined;
    sort?: { field: string; dir: 'asc' | 'desc' } | undefined;
    focus?: { row: number; col: number } | undefined;
    selected?: Set<string> | undefined;
    chunk?: number | undefined;
    onactivate?: ((row: TableRow) => void) | undefined;
    onsort?: ((field: string) => void) | undefined;
    onmore?: (() => void) | undefined;
    cellSnippet?: Snippet<[TableRow, Column, string | null]> | undefined;
  } = $props();

  const tracks = $derived(columns.map((c) => c.width).join(' '));
  /* One function for the groups AND the step they are counted in, because `aria-rowindex` is
     `group * step + i` and the two disagreeing is a table that announces a different row than the
     one on screen. It is also where `chunk={0}` stops being an endless loop during render. */
  const grouped = $derived(chunkRows(rows, chunk));

  /** Roving tabindex: exactly one cell is reachable by Tab, every other is -1. */
  const isFocused = (r: number, c: number) => focus?.row === r && focus?.col === c;
  const tabIndex = (r: number, c: number) =>
    focus ? (isFocused(r, c) ? 0 : -1) : r === 0 && c === 0 ? 0 : -1;

  const ariaSort = (field: string) =>
    sort?.field === field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
</script>

<!-- A labelled, focusable scroll container. `tabindex="0"` is the part that matters and the linter
     is right in general and wrong here: a scrollable region MUST be focusable or a keyboard user
     cannot reach the scrollbar, and the APG grid pattern requires exactly this wrapper.

     `group` AND NOT `region`, which it used to be. `region` is a landmark, and a host that wraps
     each block in its own labelled `<section>` — which is a landmark too, and correctly so — then
     has two landmarks with identical roles and identical names nested one inside the other. A
     screen-reader user gets the same destination twice in the landmark list and no way to tell
     which is which. `group` keeps the accessible name on focus, keeps the scrolling, and stops
     claiming to be a place you can navigate to, which the section above it already is. -->
<!--
  ROWS BECOME CARDS BELOW 640px, WHICH IS `13 §10`'s RULE AND NOT A NEW ONE. "A 500-row table: the
  scroll wrapper survives, but the default view is the card list; the table is an explicit choice."
  A register has had this since it was written, through its declared `mobile:` fields. A table
  rendered from a page block never did — so `/p/money` on a phone showed `3 Sep 2…`, `Legal review,
  Fe…`, `GBP −19,100.00` spilling into the column beside it, and the Balance column, which is the
  entire reason the block exists, off the right edge behind a scrollbar.

  EVERY COLUMN, LABELLED. A register's card can pick three fields because its declaration names
  them; a block table has columns and no such declaration, so guessing which three matter would be
  guessing. The first column leads the card and the rest are label and value — nothing hidden,
  nothing cut, and no horizontal scroll on the surface `13 §10` says is for reading.
-->
{#snippet card(row: TableRow)}
  <span class="table-card-lead">{row.cells[0]}</span>
  {#each columns.slice(1) as column, i}
    {#if row.cells[i + 1]}
      <span class="table-card-pair">
        <span class="table-card-label">{column.label}</span>
        <span class="table-card-value">{row.cells[i + 1]}</span>
      </span>
    {/if}
  {/each}
{/snippet}

<ul class="table-cards">
  {#each rows as row (row.key)}
    <li>
      <!-- AN ANCHOR OR A BUTTON, never a `div` with a click handler. A row that has somewhere to go
           is a link and gets the browser's whole contract — middle-click, copy the address, the
           status bar; one that is only activated is a button. Both carry a role without being told
           one, which a `svelte:element` with an `onclick` does not. -->
      {#if row.href}
        <a class="table-card" href={row.href} data-intent={row.tone}>
          {@render card(row)}
        </a>
      {:else}
        <button type="button" class="table-card" data-intent={row.tone} onclick={() => onactivate?.(row)}>
          {@render card(row)}
        </button>
      {/if}
    </li>
  {/each}
</ul>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-region" role="group" tabindex="0" aria-label={label ?? 'Rows'}>
  <div
    class="table"
    role="grid"
    aria-rowcount={total}
    aria-colcount={columns.length}
    style="--cols:{tracks}"
  >
    <div class="tr th-row" role="row" aria-rowindex="1">
      {#each columns as column}
        <span
          class="th"
          role="columnheader"
          aria-sort={column.hideLabel ? undefined : ariaSort(column.field)}
          data-align={column.align ?? 'start'}
        >
          {#if column.hideLabel}
            <span class="th-name">{column.label}</span>
          {:else if onsort}
            <button type="button" class="th-sort tap" onclick={() => onsort(column.field)}>{column.label}</button>
          {:else}{column.label}{/if}
        </span>
      {/each}
    </div>

    {#each grouped.groups as group, g}
      <!-- contain-intrinsic-size is set from the row height so the scrollbar is honest before the
           rows in this group have ever been laid out. Every box is reserved: CLS <= 0.02. -->
      <div
        class="rowgroup"
        role="rowgroup"
        style="contain-intrinsic-size: auto calc({group.length} * var(--row-h))"
      >
        {#each group as row, i}
          {@const index = g * grouped.step + i}
          <div
            class="tr"
            role="row"
            aria-rowindex={index + 2}
            aria-selected={selected ? selected.has(row.key) : undefined}
            data-intent={row.tone}
            data-focused={focus?.row === index ? '' : undefined}
          >
            {#each columns as column, c}
              {@const value = row.cells[c] ?? null}
              <span
                class="td"
                role="gridcell"
                tabindex={tabIndex(index, c)}
                data-align={column.align ?? 'start'}
                data-truncate={column.truncate ?? 'end'}
                onclick={() => onactivate?.(row)}
                onkeydown={(e) => e.key === 'Enter' && onactivate?.(row)}
              >
                {#if cellSnippet}{@render cellSnippet(row, column, value)}
                {:else if value === null}<span class="missing">—</span>
                {:else}{value}{/if}
              </span>
            {/each}
          </div>
        {/each}
      </div>
    {/each}

    {#if onmore && !(cap !== undefined && rows.length >= cap)}
      <div class="sentinel" aria-hidden="true"></div>
    {/if}
  </div>
</div>

{#if cap !== undefined && rows.length >= cap}
  <!-- The way past the cap is a filter or an export, never a virtualised scroll: virtualisation
       breaks find-in-page, breaks the scrollbar as a position cue, and only HIDES the measured wall,
       which is DOM construction (13 §4.3).

       OUTSIDE THE SCROLLER, AND OUTSIDE THE GRID. Two reasons, and both were bugs. It sat inside
       `.table-region`, which is `display: none` below 640px now that rows become cards — so the one
       line telling a phone it was looking at 2,000 of 4,181 rows was the line the phone could not
       see. And it was a `<p>` among the rows of a `role="grid"`, where the only permitted children
       are rows and rowgroups; a screen reader walking the grid met a paragraph. -->
  <p class="cap-line" role="status">
    Showing {cap.toLocaleString('en')} of {total.toLocaleString('en')} — narrow the filter or export.
  </p>
{/if}
