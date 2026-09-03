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
  import type { Column, TableRow } from '../types.ts';

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
  const chunks = $derived.by(() => {
    const out: TableRow[][] = [];
    for (let i = 0; i < rows.length; i += chunk) out.push(rows.slice(i, i + chunk));
    return out;
  });

  /** Roving tabindex: exactly one cell is reachable by Tab, every other is -1. */
  const isFocused = (r: number, c: number) => focus?.row === r && focus?.col === c;
  const tabIndex = (r: number, c: number) =>
    focus ? (isFocused(r, c) ? 0 : -1) : r === 0 && c === 0 ? 0 : -1;

  const ariaSort = (field: string) =>
    sort?.field === field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
</script>

<!-- A labelled region with tabindex 0, so a keyboard user can scroll the grid itself. The linter is
     right in general and wrong here: a scrollable region MUST be focusable or a keyboard user cannot
     reach the scrollbar, and the APG grid pattern requires exactly this wrapper. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-region" role="region" tabindex="0" aria-label={label ?? 'Rows'}>
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
          aria-sort={ariaSort(column.field)}
          data-align={column.align ?? 'start'}
        >
          {#if onsort}
            <button type="button" class="th-sort tap" onclick={() => onsort(column.field)}>{column.label}</button>
          {:else}{column.label}{/if}
        </span>
      {/each}
    </div>

    {#each chunks as group, g}
      <!-- contain-intrinsic-size is set from the row height so the scrollbar is honest before the
           rows in this group have ever been laid out. Every box is reserved: CLS <= 0.02. -->
      <div
        class="rowgroup"
        role="rowgroup"
        style="contain-intrinsic-size: auto calc({group.length} * var(--row-h))"
      >
        {#each group as row, i}
          {@const index = g * chunk + i}
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

    {#if cap !== undefined && rows.length >= cap}
      <!-- The way past the cap is a filter or an export, never a virtualised scroll: virtualisation
           breaks find-in-page, breaks the scrollbar as a position cue, and only HIDES the measured
           wall, which is DOM construction (13 §4.3). -->
      <p class="cap-line" role="status">
        Showing {cap.toLocaleString('en')} of {total.toLocaleString('en')} — narrow the filter or export.
      </p>
    {:else if onmore}
      <div class="sentinel" aria-hidden="true"></div>
    {/if}
  </div>
</div>
