<!--
  A page's filter strip: one group a field, a segmented control where it has a few values and chips where it has more,
  "All" first (`../src/filters.ts`). Not a block: a host draws it above a declared page that names `filters:`, from the
  record's answer, and reads the page again with the choice. `filtersHTML` in `../src/html.ts` is its twin, and
  `src/parity.test.ts` holds the two equal.

  THE CHOICES ARE BUTTONS ONLY WHERE THE HOST CAN ACT ON THEM, the rule `Queue` keeps for its options: with no
  `onfilter` the strip is words saying what the page is narrowed to, the one it chose marked `data-on`. A pressed choice
  pressed again lets it go, which is "All".

  THE REST WAIT BEHIND ONE CONTROL, a native select that says how many there are, because a strip of every project is a
  chip cloud and a select is the one control every platform already draws well for a long list.
-->
<script lang="ts">
  import { FILTERS_ALL, filtersMore, filtersPlan, type Filter, type FilterPlan, type OnFilter } from '../src/filters.ts';
  import { slotOf } from '../src/slot.ts';

  let {
    filters,
    chosen = {},
    onfilter,
  }: {
    filters: readonly Filter[];
    /** What the page is narrowed to now, by field, as the host keeps it. */
    chosen?: Readonly<Record<string, string>>;
    onfilter?: OnFilter | undefined;
  } = $props();

  const plans = $derived(filtersPlan(filters, chosen));

  /* BY POSITION AND NOT BY VALUE, because the record's "No project" is the value `''`, which is also what the select's
     own first line says: read by value, that one could never be chosen from the fold. */
  function more(p: FilterPlan, e: Event) {
    const select = e.currentTarget as HTMLSelectElement;
    const picked = p.rest[select.selectedIndex - 1];
    select.selectedIndex = 0;
    if (picked) onfilter?.(p.field, picked.value);
  }
</script>

{#if plans.length}
  <div class="filters">
    {#each plans as p}
      <div class="filters-group" role="group" aria-label={p.label} data-control={p.control} data-field={p.field}>
        {#if onfilter}
          <button type="button" class="filters-choice" aria-pressed={p.all} onclick={() => onfilter?.(p.field, null)}>{FILTERS_ALL}</button>
          {#each p.shown as v}
            <button type="button" class="filters-choice" aria-pressed={v.on} onclick={() => onfilter?.(p.field, v.on ? null : v.value)}
              >{#if v.hue !== null}<span class="filters-dot" style="--hue: {v.hue}" aria-hidden="true" data-slot={slotOf(v.hue)}></span>{/if}{v.label}{#if v.count !== null}<span class="filters-count num">{v.count}</span>{/if}</button
            >
          {/each}
          {#if p.rest.length}
            <select class="filters-more" aria-label={p.label} onchange={(e) => more(p, e)}>
              <option value="">{filtersMore(p.rest.length)}</option>
              {#each p.rest as v}<option value={v.value}>{v.label}</option>{/each}
            </select>
          {/if}
        {:else}
          <span class="filters-choice" data-on={p.all ? '' : undefined}>{FILTERS_ALL}</span>
          {#each p.shown as v}
            <span class="filters-choice" data-on={v.on ? '' : undefined}
              >{#if v.hue !== null}<span class="filters-dot" style="--hue: {v.hue}" aria-hidden="true" data-slot={slotOf(v.hue)}></span>{/if}{v.label}{#if v.count !== null}<span class="filters-count num">{v.count}</span>{/if}</span
            >
          {/each}
          {#if p.rest.length}<span class="filters-more">{filtersMore(p.rest.length)}</span>{/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}
