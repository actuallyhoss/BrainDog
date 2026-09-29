<!--
  A quantity typed where it is drawn: the number in one box and the unit it counts beside it.

  ONE STRING IN AND OUT, the number, a space and the unit (`field-draft.ts` `quantityLine`), because both screens keep
  whatever is being typed as one string and save it through `patchOf`, which puts `{ value, unit }` back together.
  The two halves are this box's own while it is open: it is drawn afresh each time a field opens, so it reads the
  string once, and every change writes the whole line back.

  THE UNIT IS CHOSEN FROM THE ONES THE FIELD KNOWS (`unitsOf`): the row's own, the field's declared one, its
  default's. One is printed beside the box, as a money's currency is; two or more are a menu; none is a second box,
  because a quantity in a unit nobody chose is a number of something, and the save refuses it until one is typed.

  `fit` is where it sits. `field` is the row page: 16px text as in every input there, a 44px box under a thumb, and
  a basis that fills the line on a phone and leaves room for Save beside it on a wide screen. `cell` is a row of the
  grid, where it takes the cell's box and none of its own, as the grid's other editors do.
-->
<script lang="ts">
  import { quantityLine, quantityParts } from '$lib/record/field-draft.ts';

  let {
    value = $bindable(''),
    units,
    label,
    fit = 'field',
    autofocus = false,
    onkeydown,
    onfocusout,
    onclick,
  }: {
    value?: string;
    units: readonly string[];
    /** The field's name, which the number box is announced by. */
    label: string;
    fit?: 'field' | 'cell';
    autofocus?: boolean;
    onkeydown?: ((e: KeyboardEvent) => void) | undefined;
    onfocusout?: ((e: FocusEvent) => void) | undefined;
    onclick?: ((e: MouseEvent) => void) | undefined;
  } = $props();

  /* THIS BOX'S WORDS, said only by it. */
  const words = {
    unitOf: (field: string) => `Unit of ${field.toLowerCase()}`,
    unitHint: 'Unit',
  } as const;

  /* READ ONCE, AS THE BOX OPENS, and Svelte is right that only the first value is captured: that is the requirement.
     Re-reading the line while somebody types into it would split `2.` back into halves on every key. A number with no
     unit yet opens on the first unit the field knows, the one `patchOf` would write it in. */
  // svelte-ignore state_referenced_locally
  const opened = quantityParts(value);
  let number = $state(opened.number);
  // svelte-ignore state_referenced_locally
  let unit = $state(opened.unit !== '' ? opened.unit : (units[0] ?? ''));

  /* THE UNIT THE ROW HOLDS STAYS ON OFFER even where the field no longer names it, or the menu would open on nothing. */
  const offered = $derived(unit === '' || units.includes(unit) ? units : [unit, ...units]);

  const write = () => {
    value = quantityLine(number, unit);
  };
</script>

<span class="quantity" data-fit={fit}>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="quantity-number"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    aria-label={label}
    {autofocus}
    value={number}
    oninput={(e) => {
      number = e.currentTarget.value;
      write();
    }}
    {onkeydown}
    {onfocusout}
    {onclick}
  />
  {#if offered.length === 1 && unit === offered[0]}
    <span class="quantity-unit">{unit}</span>
  {:else if offered.length > 0}
    <select
      class="quantity-pick"
      aria-label={words.unitOf(label)}
      value={unit}
      onchange={(e) => {
        unit = e.currentTarget.value;
        write();
      }}
      {onkeydown}
      {onfocusout}
      {onclick}
    >
      {#each offered as u (u)}<option value={u}>{u}</option>{/each}
    </select>
  {:else}
    <input
      class="quantity-typed"
      type="text"
      autocomplete="off"
      aria-label={words.unitOf(label)}
      placeholder={words.unitHint}
      value={unit}
      oninput={(e) => {
        unit = e.currentTarget.value;
        write();
      }}
      {onkeydown}
      {onfocusout}
      {onclick}
    />
  {/if}
</span>

<style>
  .quantity {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* A BASIS AND NOT A WIDTH: on a phone the row page's editor is narrower than the box and its two buttons, so the box
     takes the whole line and the buttons wrap under it; on a wide screen they share one. */
  .quantity[data-fit='field'] {
    flex: 1 1 16rem;
  }

  .quantity-number,
  .quantity-typed,
  .quantity-pick {
    min-inline-size: 0;
    color: var(--ink);
    font: inherit;
  }

  .quantity-number {
    flex: 1 1 8ch;
    font-variant-numeric: tabular-nums;
  }

  .quantity-typed {
    flex: 0 1 10ch;
  }

  .quantity-pick {
    flex: none;
  }

  .quantity-unit {
    flex: none;
    color: var(--ink2);
  }

  /* THE ROW PAGE'S BOX, the shape its other editors take: 16px at every width, because a phone zooms the page when a
     smaller one takes focus, and 44px under a thumb. */
  .quantity[data-fit='field'] .quantity-number,
  .quantity[data-fit='field'] .quantity-typed,
  .quantity[data-fit='field'] .quantity-pick {
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    /* THE COLOUR AND NOT THE SHORTHAND, so the menu keeps the chevron `controls.css` draws in its image. */
    background-color: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    font-size: var(--t-md);
  }

  .quantity[data-fit='field'] .quantity-unit {
    font-size: var(--t-sm);
  }

  /* THE GRID'S BOX IS THE CELL, so it grows the row by nothing while somebody types in it. */
  .quantity[data-fit='cell'] .quantity-number,
  .quantity[data-fit='cell'] .quantity-typed,
  .quantity[data-fit='cell'] .quantity-pick {
    padding: 0 var(--sp-1);
    background-color: var(--s1);
    border: 1px solid var(--ink2);
    border-radius: var(--r-sm);
    font-size: var(--t-ui);
  }

  .quantity[data-fit='cell'] .quantity-unit {
    font-size: var(--t-ui);
  }
</style>
