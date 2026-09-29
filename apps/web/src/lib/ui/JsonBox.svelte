<!--
  Structured data typed where it is drawn.

  WRITTEN OUT, IN THE FACE THIS PRODUCT KEEPS FOR WHAT A PERSON WRITES AS CODE (`--font-id`). The
  box opens on the value two spaces to a level (`field-draft.ts` `draftOf`), so its shape is on screen, and it keeps
  every line break it is given. Nothing is checked while it is typed, because every value is invalid halfway through
  being written: the save asks `wrongValue`, which refuses what does not read before anything is sent, and the
  sentence lands where each screen puts a refusal.

  `fit` is where it sits. `field` is the row page: the whole width of the line at every size, 16px text as in every
  input there, and as many lines as the value holds up to a screenful. `cell` is a row of the grid: one line in the
  cell's own box, where Enter is a new line and the grid's ⌘Enter saves, as a document's cell does.
-->
<script lang="ts">
  let {
    value = $bindable(''),
    label,
    fit = 'field',
    autofocus = false,
    onkeydown,
    onfocusout,
    onclick,
  }: {
    value?: string;
    /** The field's name, which the box is announced by. */
    label: string;
    fit?: 'field' | 'cell';
    autofocus?: boolean;
    onkeydown?: ((e: KeyboardEvent) => void) | undefined;
    onfocusout?: ((e: FocusEvent) => void) | undefined;
    onclick?: ((e: MouseEvent) => void) | undefined;
  } = $props();

  /* AS TALL AS WHAT IT HOLDS, from three lines to sixteen: a short value is not lost in a tall empty box, and a long
     one scrolls inside the box rather than pushing the row's other facts off the screen. */
  const FEWEST = 3;
  const MOST = 16;
  const lines = $derived(fit === 'cell' ? 1 : Math.min(Math.max(value.split('\n').length, FEWEST), MOST));
</script>

<!-- svelte-ignore a11y_autofocus -->
<textarea
  class="json"
  data-fit={fit}
  rows={lines}
  dir="ltr"
  spellcheck="false"
  autocapitalize="off"
  autocomplete="off"
  aria-label={label}
  {autofocus}
  bind:value
  {onkeydown}
  {onfocusout}
  {onclick}
></textarea>

<style>
  .json {
    inline-size: 100%;
    min-inline-size: 0;
    background-color: var(--s1);
    color: var(--ink);
    font-family: var(--font-id);
    tab-size: 2;
  }

  /* THE WHOLE LINE, on a phone and on a wide screen alike: structured data wraps badly in half a line, so the row
     page's Save and Cancel go under it rather than beside it. */
  .json[data-fit='field'] {
    flex: 1 1 100%;
    min-block-size: max(40px, var(--ctl-h));
    padding: var(--sp-2) var(--sp-3);
    border: 0;
    border-radius: var(--r-md);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    resize: vertical;
  }

  /* THE GRID'S BOX IS THE CELL, so it grows the row by nothing while somebody types in it. */
  .json[data-fit='cell'] {
    padding: 0 var(--sp-1);
    border: 1px solid var(--ink2);
    border-radius: var(--r-sm);
    font-size: var(--t-ui);
    resize: none;
  }
</style>
