<!--
  A day typed where it is drawn, in the record's words for a day (MOD-22).

  THE BROWSER'S DATE CONTROL SPOKE ITS OWN FORMAT: `mm/dd/yyyy` on a machine set to American English, beside a cell
  that says the same day as `3 Sep 2026` (design SYS-15). So this is a text box that opens on the record's words
  (`field-draft.ts` `dayLine`) and reads back what is typed (`dayFrom`): a day, a month by name and a year, or the
  stored form pasted from elsewhere.

  THE VALUE IT HANDS BACK IS THE STORED FORM WHEN WHAT IS TYPED READS AS A DAY, and the typing as it is when it does
  not, so the screen's one string stays the value `draftOf` opened it on until the day changes, and a box left alone
  is not a write. What does not read is refused on the save by `wrongValue`, under the box, before anything is sent.

  `fit` is where it sits: `field` on the row page, 16px and 44px under a thumb as its other editors are, and `cell`
  in a row of the grid, in the cell's own box.
-->
<script lang="ts">
  import { dayFrom, dayLine } from '$lib/record/field-draft.ts';

  let {
    value = $bindable(),
    label,
    id,
    required = false,
    fit = 'field',
    autofocus = false,
    onkeydown,
    onfocusout,
    onclick,
  }: {
    /* WITH NO FALLBACK, because Svelte refuses `bind:value={undefined}` on a prop that has one, and the new-row sheet
       binds a day nobody has typed yet, which is an absent key in its `typed` and not an empty string. */
    value?: string | undefined;
    /** The field's name, which the box is announced by. */
    label: string;
    /** For a form whose visible `<label for>` names this box, as the new-row sheet's do. */
    id?: string | undefined;
    /* THE ATTRIBUTE AND NOT ONLY THE WORD, as the new-row sheet gives every box a required field holds, so the browser
       and a screen reader are told the rule the label says. */
    required?: boolean | undefined;
    fit?: 'field' | 'cell';
    autofocus?: boolean;
    onkeydown?: ((e: KeyboardEvent) => void) | undefined;
    onfocusout?: ((e: FocusEvent) => void) | undefined;
    onclick?: ((e: MouseEvent) => void) | undefined;
  } = $props();

  /* A DAY THE BOX SHOWS WHILE IT IS EMPTY, as an example of the form it reads and not as its label. */
  const words = { example: '3 Sep 2026' } as const;

  /* READ ONCE, AS THE BOX OPENS, and Svelte is right that only the first value is captured: that is the requirement.
     Rewriting the text from the value on every key would turn `3 september 2026` into `3 Sep 2026` under the caret the
     moment it became a day. */
  // svelte-ignore state_referenced_locally
  let text = $state(dayLine(value ?? ''));
</script>

<!-- svelte-ignore a11y_autofocus -->
<input
  class="day"
  {id}
  {required}
  data-fit={fit}
  type="text"
  autocomplete="off"
  aria-label={label}
  placeholder={words.example}
  {autofocus}
  value={text}
  oninput={(e) => {
    text = e.currentTarget.value;
    value = dayFrom(text) ?? text;
  }}
  {onkeydown}
  {onfocusout}
  {onclick}
/>

<style>
  .day {
    min-inline-size: 0;
    background-color: var(--s1);
    color: var(--ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  /* ROOM FOR `30 September 2026` AND NO MORE, and the whole line on a phone once the buttons beside it wrap. The width
     is for a form that stacks its boxes rather than setting them in a row, as the new-row sheet does: there the box
     is the line's whole width, as every box in that sheet is, and in a row the basis decides and the width is unused. */
  .day[data-fit='field'] {
    flex: 1 1 18ch;
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    border: 0;
    border-radius: var(--r-md);
    font-size: var(--t-md);
  }

  /* THE GRID'S BOX IS THE CELL, so it grows the row by nothing while somebody types in it. */
  .day[data-fit='cell'] {
    inline-size: 100%;
    padding: 0 var(--sp-1);
    border: 1px solid var(--ink2);
    border-radius: var(--r-sm);
    font-size: var(--t-ui);
  }
</style>
