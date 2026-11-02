<!--
  Display options: what YOU see, never what the record says. `v`, and the Display button at the end
  of the bar.

  The order, the board's lanes and the columns live here, and none is a filter. The order and the
  lanes are in the address, so the page writes them (`sortBy`, `unsort`, `setLane`); which columns
  are hidden is a view preference kept per list and per reader in the cookie, so the page keeps that
  too (`hide`, `showAll`). The last line keeps all of it as this person's default for the list
  (`keep`, `forget`). This file draws them and holds nothing.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { columnsFor, labelOf } from '$lib/record/api.ts';
  import type { FieldDecl, RegisterDecl } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { wayOf, type ListDefault } from './list.ts';

  let {
    open = $bindable(false),
    register,
    decl,
    sortable,
    canSort,
    sort,
    hidden,
    sortBy,
    unsort,
    lateFirst = false,
    hide,
    showAll,
    board,
    lanes,
    lane,
    setLane,
    kept,
    isDefault,
    keep,
    forget,
  }: {
    open?: boolean;
    register: string;
    decl: RegisterDecl;
    /** The columns an order can be taken from: every drawn column but the picker and the verbs. */
    sortable: readonly { field: string; label: string }[];
    /** More than one row in hand, so there is something to order. */
    canSort: boolean;
    sort: { field: string; dir: 'asc' | 'desc' } | undefined;
    hidden: ReadonlySet<string>;
    sortBy: (field: string) => void;
    unsort: () => void;
    /** Whether the list's own order is late first: it has a deadline, so what is late leads (`lateFirst` in `list.ts`). */
    lateFirst?: boolean;
    hide: (field: string, off: boolean) => void;
    showAll: () => void;
    /** The list is drawn as a board, so which field its lanes are is a choice to offer. */
    board: boolean;
    /** The choice fields a board can be laid out by (`laneChoicesOf`). */
    lanes: readonly FieldDecl[];
    lane: string | undefined;
    setLane: (field: string) => void;
    /** Whether this person has a default kept for the list, and whether the list is drawn that way now. */
    kept: ListDefault | null;
    isDefault: boolean;
    keep: () => void;
    forget: () => void;
  } = $props();

  /* This part's own words: the order things were added in as one of the choices, and the direction's group. */
  const words = {
    rowOrder: 'Order added',
    lateFirst: 'Late first',
    direction: 'Direction',
    lanes: 'Lanes by',
    keep: 'Keep as my default',
    forget: 'Forget',
    isKept: 'Your default on this device',
  } as const;
</script>

<Sheet bind:open title={copy.display}>
  <div class="filter-groups">
    <!--
      SORT LIVED ON THE COLUMN HEADERS AND THE COLUMNS ARE GONE BELOW 640px.

      Every header on the table is a sort button announcing `aria-sort`, which is the right place
      for it and is why the drawer's old "Due sorts on the column" sentence was deleted rather than
      corrected. But a card list has no headers, so on a phone the whole capability went with them:
      thirty-eight obligations in whatever order the record returned, with no way to ask for the
      oldest.

      SAME PARAMETER, SAME TOGGLE. `sortBy` writes `?sort=<field>:<dir>` and flips direction on the
      field already sorted, exactly as a header press does, so a sort set here and a sort set by
      clicking a header are the same fact, and the URL still carries it (`19 §5`: which rows you are
      looking at, and in what order, is shareable).

      Two rows or fewer and there is nothing to order, which is the same test the table applies
      before it wires `onsort` at all.

      ONE CHOICE IS A RADIO GROUP, WITH THE CURRENT ORDER CHECKED. It was a column
      of toggle chips, drawn as checkboxes, for a choice that has one answer, and nothing was checked
      while the list was in its own order. The list's own order is the first radio; choosing a field
      orders by it from the start, and the direction is a pair of segments under the group, each named
      in the field's own words ("oldest first"), which press the same toggle a header does.
    -->
    {#if canSort}
      {@const way = sort ? wayOf(sort.field, decl) : undefined}
      <fieldset class="filter-group">
        <legend class="filter-legend">{copy.sortedBy}</legend>
        <div class="filter-values">
          <label class="filter-value" data-on={sort ? undefined : ''}>
            <input type="radio" name="display-sort" checked={!sort} onchange={() => unsort()} />
            {lateFirst ? words.lateFirst : words.rowOrder}
          </label>
          {#each sortable as c (c.field)}
            {@const on = sort?.field === c.field}
            <label class="filter-value" data-on={on ? '' : undefined}>
              <input type="radio" name="display-sort" value={c.field} checked={on} onchange={() => sortBy(c.field)} />
              {c.label}
            </label>
          {/each}
        </div>
      </fieldset>
      {#if sort && way}
        {@const current = sort}
        <Segmented class="sort-way" role="group" aria-label={words.direction}>
          <button
            type="button"
            class="segment"
            data-on={current.dir === 'asc' ? '' : undefined}
            aria-pressed={current.dir === 'asc' ? 'true' : 'false'}
            onclick={() => {
              if (current.dir !== 'asc') sortBy(current.field);
            }}>{way[0]}</button
          >
          <button
            type="button"
            class="segment"
            data-on={current.dir === 'desc' ? '' : undefined}
            aria-pressed={current.dir === 'desc' ? 'true' : 'false'}
            onclick={() => {
              if (current.dir !== 'desc') sortBy(current.field);
            }}>{way[1]}</button
          >
        </Segmented>
      {/if}
    {/if}

    <!-- WHICH FIELD THE BOARD'S LANES ARE, offered only while it is a board and there is more than one to choose.
         Not on a phone either, which draws cards whatever the address says. -->
    {#if board && lanes.length > 1}
      <fieldset class="filter-group lanes-group">
        <legend class="filter-legend">{words.lanes}</legend>
        <div class="filter-values">
          {#each lanes as f (f.id)}
            {@const on = (lane ?? lanes[0]?.id) === f.id}
            <label class="filter-value" data-on={on ? '' : undefined}>
              <input type="radio" name="display-lane" value={f.id} checked={on} onchange={() => setLane(f.id)} />
              {labelOf(f)}
            </label>
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
        <!-- THE NUMBER IS OFFERED AND OFF: it is the one column the page draws only once it is in `hidden`, so
             its box reads the set the other way round, and the same press toggles it. -->
        {#each columnsFor(register, decl, true) as c}
          {@const locked = c.field === decl.title}
          {@const on = c.field === 'seq' ? hidden.has('seq') : !hidden.has(c.field)}
          <button
            type="button"
            class="filter-value"
            data-on={on ? '' : undefined}
            aria-pressed={on ? 'true' : 'false'}
            disabled={locked}
            onclick={() => hide(c.field, !hidden.has(c.field))}
          >
            <span class="filter-box" aria-hidden="true">{on ? '✓' : ''}</span>
            {c.label}
            {#if locked}<span class="locked">{copy.always}</span>{/if}
          </button>
        {/each}
      </div>
    </fieldset>

    <!-- ONE LINE TO KEEP IT, AND IT SAYS WHERE IT IS KEPT. A list opened with nothing in its address opens the way it
         was kept; Clear still goes back to the list's own order. While the list is drawn as kept, the line says so
         and the press becomes Forget. -->
    <div class="keep">
      {#if isDefault}
        <p class="keep-line"><Icon name="check" size="s" />{words.isKept}</p>
        <Button weight="bare" onclick={() => forget()}>{words.forget}</Button>
      {:else}
        <Button weight="quiet" onclick={() => keep()}>{words.keep}</Button>
        {#if kept}<Button weight="bare" onclick={() => forget()}>{words.forget}</Button>{/if}
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <Button weight="primary" onclick={() => (open = false)}><Icon name="check" size="s" />{copy.done}</Button>
    {#if [...hidden].some((f) => f !== 'seq')}
      <Button weight="bare" onclick={() => showAll()}>{copy.showAll}</Button>
    {/if}
    <!-- A SORT YOU CANNOT UNDO IS A TRAP, and the way back to the list's own order is the first radio
         in the group above, where it is one of the choices rather than a button after them. -->
  {/snippet}
</Sheet>

<style>
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
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    min-block-size: 36px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* 44 UNDER A THUMB, AND IT WAS MEASURED AT 390 AND FOUND SHORT. `.filter-value` is 358x34 and is
     the only way to sort a list or hide a column on a phone. It has never been measured by
     `layout.mjs`, because it lives inside a sheet the gate does not open, and the gate is right that
     a page at rest is what it measures. `13 §7` is the rule. */
  @media (pointer: coarse) {
    .filter-value {
      min-block-size: var(--tap);
    }
  }

  /* THE RADIO TAKES THE CHECKBOX'S BOX, so the sort and the columns share one edge for their marks and their words. */
  .filter-value input[type='radio'] {
    flex: none;
    inline-size: 17px;
    block-size: 17px;
    margin: 0;
  }

  .filter-value:hover {
    background: var(--hover);
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
    border: 1px solid var(--switch-off);
    border-radius: var(--r-xs);
    color: var(--on-mark);
    font-size: var(--fs-cap);
    line-height: 1;
  }

  .filter-value[data-on] .filter-box {
    background: var(--on);
    border-color: var(--on);
    color: var(--on-mark);
  }

  .locked {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  /* The direction sits under the choice it qualifies, as its own short track. The track is `Segmented`'s own element,
     so the rule reaches it by this part's name. */
  :global(.sort-way) {
    align-self: start;
    margin-block-start: calc(-1 * var(--sp-3));
  }

  /* The default is its own short line under the choices it keeps, set off by a hairline. */
  .keep {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .keep-line {
    display: inline-flex;
    flex: 1 1 16rem;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  @media (width < 640px) {
    .columns-group,
    .lanes-group {
      display: none;
    }
  }
</style>
