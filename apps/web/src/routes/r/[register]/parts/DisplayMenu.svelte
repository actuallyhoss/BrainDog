<!--
  Display options: what YOU see, never what the record says. `v`, and the Display button at the end
  of the bar.

  Two things live here, the order and the columns, and neither is a filter. The order is in the
  address, so the page writes it (`sortBy`, `unsort`); which columns are hidden is a view preference
  kept per list and per reader in the cookie, so the page keeps that too (`hide`, `showAll`). This
  file draws both and holds nothing.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { columnsFor } from '$lib/record/api.ts';
  import type { RegisterDecl } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { wayOf } from './list.ts';

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
    hide,
    showAll,
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
    hide: (field: string, off: boolean) => void;
    showAll: () => void;
  } = $props();
</script>

<Sheet bind:open title={copy.display}>
  <p class="display-note">{copy.displayNote}</p>
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
    -->
    {#if canSort}
      <fieldset class="filter-group">
        <legend class="filter-legend">{copy.sortedBy}</legend>
        <div class="filter-values">
          {#each sortable as c}
            {@const on = sort?.field === c.field}
            {@const way = wayOf(c.field, decl)}
            <button
              type="button"
              class="filter-value"
              data-on={on ? '' : undefined}
              aria-pressed={on ? 'true' : 'false'}
              onclick={() => sortBy(c.field)}
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
        {#each columnsFor(register) as c}
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
    <Button weight="primary" onclick={() => (open = false)}><Icon name="check" size="s" />{copy.done}</Button>
    {#if hidden.size > 0}
      <Button weight="bare" onclick={() => showAll()}>{copy.showAll}</Button>
    {/if}
    <!-- A SORT YOU CANNOT UNDO IS A TRAP. The only other way back to the register's own order was
         Clear filters, which also throws away the search and every chip. -->
    {#if sort}
      <Button weight="bare" onclick={() => unsort()}>{copy.rowOrder}</Button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .display-note {
    margin-block-end: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
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

  /* 44 UNDER A THUMB, AND IT WAS MEASURED AT 390 AND FOUND SHORT. `.filter-value` is 358x34 and is
     the only way to sort a list or hide a column on a phone. It has never been measured by
     `layout.mjs`, because it lives inside a sheet the gate does not open, and the gate is right that
     a page at rest is what it measures. `13 §7` is the rule. */
  @media (pointer: coarse) {
    .filter-value {
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

  .locked {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 640px) {
    .columns-group {
      display: none;
    }
  }
</style>
