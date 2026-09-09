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
  import { rowsAsCards } from '../cards.svelte.ts';
  import type { Snippet } from 'svelte';
  import { TONES } from '../../src/index.ts';
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

  /**
   * DOES ANY ROW CARRY A TONE? If none does, no row pays for the gutter one would sit in.
   *
   * `13 §5.1` is unambiguous: "Colour never carries meaning alone. The glyph is part of the intent
   * token, not a choice at the call site — a component cannot render `warn` without its glyph
   * because there is no API that lets it." Six primitives keep it. THIS ONE DID NOT. A toned row got
   * a two-pixel bar down its leading edge and nothing else: measured on `/r/obligations`, 16 rows
   * carrying an intent and 0 elements with a name for it, so an overdue invoice and a paid one were
   * the same row to a screen reader and the same row to anybody who does not see red.
   *
   * It is the primitive that carries most of the record — the register grid, every `table` block,
   * and the phone cards — which is why it is the one that mattered.
   */
  const toned = $derived(rows.some((r) => r.tone));

  /**
   * THE FIRST COLUMN THAT CARRIES A VALUE, which is not always the first column.
   *
   * The register grid leads with the row picker — a column whose cells are a checkbox and whose
   * `hideLabel` says exactly that. Putting the mark there sat it on top of the checkbox: a glyph
   * qualifying a control instead of a row. `hideLabel` is already the declaration for "this column
   * is a control, not a value", so it is the one this reads.
   */
  const lead = $derived(Math.max(0, columns.findIndex((c) => !c.hideLabel)));

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
  <span class="table-card-lead">
    {#if row.tone}
      <span class="td-glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
    {/if}
    {row.cells[0]}
  </span>
  {#each columns.slice(1) as column, i}
    {#if row.cells[i + 1]}
      <span class="table-card-pair">
        <span class="table-card-label">{column.label}</span>
        <span class="table-card-value">{row.cells[i + 1]}</span>
      </span>
    {/if}
  {/each}
{/snippet}

<!--
  ONE BODY AT A TIME, IN THE DOCUMENT AND NOT ONLY IN THE STYLESHEET.

  `blocks.css` hides whichever of these two does not belong at the current width, which builds both
  and shows one. Measured on a desktop register of 2,614 rows: the hidden `.table-cards` subtree was
  **54,786 nodes of the 83,871 under `#main` — 65% of the document**, none of it on the screen, and
  `13 §4.3`'s cap on the DOM was therefore being paid twice at every width.

  The stylesheet rules stay as the safety net they should always have been: a host that renders this
  without the branch gets one body rather than two stacked on each other.
-->
{#if rowsAsCards()}
<ul class="table-cards">
  {#each rows as row (row.key)}
    <li>
      <!-- AN ANCHOR OR A BUTTON, never a `div` with a click handler. A row that has somewhere to go
           is a link and gets the browser's whole contract — middle-click, copy the address, the
           status bar; one that is only activated is a button. Both carry a role without being told
           one, which a `svelte:element` with an `onclick` does not.

           AND NEITHER, WHEN THERE IS NOTHING TO ACTIVATE. `onactivate` is supplied by two call
           sites — the register grid and a saved view — and a declared page passes none, so every
           hrefless row on `/p/*` became a focusable, pressable no-op. Measured on `/p/money` at
           390: the opening-balance card, "What is liquid today", sitting among nine siblings that
           all navigate, is a button that does nothing when pressed. At 1440 the same row is a
           `div[role=row]` with `cursor: auto` and makes no promise at all, which is what this
           branch now matches. A row that cannot be activated is not a control. -->
      {#if row.href}
        <a class="table-card" href={row.href} data-intent={row.tone}>
          {@render card(row)}
        </a>
      {:else if onactivate}
        <button type="button" class="table-card" data-intent={row.tone} onclick={() => onactivate(row)}>
          {@render card(row)}
        </button>
      {:else}
        <div class="table-card" data-intent={row.tone}>
          {@render card(row)}
        </div>
      {/if}
    </li>
  {/each}

  <!-- THE PHONE PAGES TOO, and this sentinel was deleted while the grid's was kept.

       It was added the day paging was built and removed the next, as collateral in a change about
       the CAP LINE — so `Table`'s own surviving comment (*"`cap` stays here, because its other job
       is deciding whether there is a sentinel to observe"*) was true of one body out of two. Not
       reachable from this repository today, because the one route that pages branches on
       `rowsAsCards()` itself and never asks this component for cards; reachable by the first caller
       that passes `onmore` and is read on a phone, which gets a list that stops at page one with
       nothing on screen saying so. That is the exact bug the deleted line was written for. -->
  {#if onmore && !(cap !== undefined && rows.length >= cap)}
    <li class="sentinel" aria-hidden="true"></li>
  {/if}
</ul>
{:else}
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-region" role="group" tabindex="0" aria-label={label ?? 'Rows'}>
  <div
    class="table"
    role="grid"
    data-toned={toned ? '' : undefined}
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
              <!--
                THE HANDLERS ARE THERE ONLY WHERE THERE IS SOMETHING TO ACTIVATE, and they used to be
                unconditional. The card branch above records the same defect and fixes its own half:
                `onactivate` is supplied by two call sites, the register grid and a saved view, and a
                declared page passes none, so every cell of every table on `/p/*` carried a click
                handler and an Enter handler that called nothing. A cell that answers a press by
                doing nothing is indistinguishable from a broken one, which is the rule this whole
                product is built on.

                THE ROVING `tabindex` STAYS EITHER WAY, and that is not an inconsistency. It is what
                makes a grid navigable for READING: a composite widget with one tab stop, arrow keys
                inside it, and a caret a screen reader can follow along a row. A table you cannot put
                the caret in is a table a keyboard cannot read, which is a bigger loss than a cell
                that is focusable and has nothing to do.

                `data-acts` IS FOR THE POINTER. Without it the cursor is the only thing left saying a
                cell can be pressed, and it was saying it everywhere.
              -->
              <span
                class="td"
                role="gridcell"
                tabindex={tabIndex(index, c)}
                data-align={column.align ?? 'start'}
                data-truncate={column.truncate ?? 'end'}
                data-lead={c === lead ? '' : undefined}
                data-acts={onactivate ? '' : undefined}
                onclick={onactivate ? () => onactivate(row) : undefined}
                onkeydown={onactivate ? (e) => e.key === 'Enter' && onactivate(row) : undefined}
              >
                <!-- IN THE FIRST CELL, AND AT ITS HEAD.

                     Inside a cell because the only children `role="row"` admits are cells: a glyph
                     hung on the row itself is a stray node in the accessibility tree, which is the
                     same mistake the cap line was making one element up.

                     In the FIRST cell because that is where `List` puts it and says why — "a tone
                     belongs to the thing it qualifies, and five hundred pixels away it belongs to
                     nothing" — and at its head because the rest of that cell truncates. A glyph
                     after the text is a glyph the ellipsis eats on exactly the narrow rows that
                     needed it. It also lands on the same edge as the colour bar, so the two channels
                     say one thing in one place.

                     THE GUTTER IS RESERVED FOR THE COLUMN, NOT FOR THE ROW. Otherwise the toned rows
                     indent and the column's left edge goes ragged, which reads as five different
                     columns rather than one column with five marks in it. -->
                {#if c === lead && row.tone}
                  <span class="td-glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
                {/if}
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

{/if}

<!-- THE CAP LINE IS THE HOST'S, NOT THIS COMPONENT'S.

     The way past the cap is a filter or an export, never a virtualised scroll: virtualisation breaks
     find-in-page, breaks the scrollbar as a position cue, and only HIDES the measured wall, which is
     DOM construction (13 §4.3). This component used to draw that sentence from its own `total`
     prop — which is `aria-rowcount`, and `aria-rowcount` is deliberately `-1` while a filtered list
     is still paging, so `2000 < -1` was false and the line disappeared in exactly the state it was
     written for. A cap line is about the LIST; the host has the answer's real size and draws one for
     whichever body it rendered. `cap` stays here, because its other job is deciding whether there is
     a sentinel to observe. -->
