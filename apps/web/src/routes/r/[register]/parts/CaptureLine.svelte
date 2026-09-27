<!--
  CAPTURE, FIRST ON THE PAGE: add a row by typing its name and pressing Enter.

  IT WAS A MODAL BEHIND A BUTTON, asking for every declared field. The add is the most frequent
  write a person makes to a list and it was the most expensive one on this screen: a press, a
  dialog, a form, a submit, a dismissal. This is a press and a return key.

  THE SUBMIT CONTROL IS INSIDE THE FIELD AND ONLY EXISTS ONCE THERE IS SOMETHING TO ADD, which
  is the one place a button of this kind is not clutter: it appears exactly when it can do
  something, so it is never a control a reader has to learn to ignore.

  `form` AND `type="submit"` RATHER THAN A KEYDOWN HANDLER, because Enter in a single-field form
  is the platform's own behaviour and a phone's keyboard prints "Go" for it without being asked.

  ABOVE THE SEARCH AND THE FILTERS, because it is the one thing here that does not act on the
  rows below it. AND NOTHING UNDER IT: a sentence sat there on every visit saying what a new row
  would still be missing or take from the filter. The row says what it is missing once it
  exists, in its cells and its receipt; said in advance, over the list, it was the screen
  explaining itself.

  THE LINE IS THE PAGE'S. `value` is bound to the page's `capture`, because the page empties it when
  the question changes and puts the typing back when the record refuses it; `captureRow` is the
  page's write, and this file only draws the line.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';

  let { one, value = $bindable(''), captureRow }: { one: string; value?: string; captureRow: () => void } = $props();
</script>

<form
  class="capture"
  onsubmit={(e) => {
    e.preventDefault();
    captureRow();
  }}
>
  <label class="capture-label" for="capture">{copy.captureIn(one)}</label>
  <div class="capture-field">
    <Icon name="plus" size="m" />
    <input
      id="capture"
      class="capture-input"
      type="text"
      autocomplete="off"
      bind:value
      placeholder={copy.captureIn(one)}
    />
    <!-- Present only once there is something to add. -->
    {#if value.trim()}<button type="submit" class="capture-go">{copy.captureAdd}</button>{/if}
  </div>
</form>

<style>
  /* ONE LINE, AND IT LOOKS LIKE ONE. The label is for a screen reader and for nobody else: the
     field's own placeholder says the same words, and a visible label above a single-field form
     turns one line into three. */
  .capture {
    margin: 0;
  }

  .capture-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ONE FRIENDLY FIELD: a rounded line on the first raised surface with a plus at its head, which
     is the shape "add" has in every list a person has used. */
  /* ONE HEIGHT FOR THE WHOLE HEAD (DESIGN-SYSTEM APPENDIX C8). This was 47px over a 34px search and
     32px filters, three sizes of box in two rows; it is `--ctl-h` now, 32 under a mouse and 44 under
     a thumb, with the radius every control has. */
  .capture-field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3) var(--sp-1);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .capture-field:hover {
    border-color: var(--edge);
  }

  /* THE RING IS ON THE BOX AND NOT ON THE INPUT, because the submit control is inside the box: a
     ring around the text alone would draw a line between the field and its own button. It is the
     same move `/search` makes for the same reason. */
  /* The ring itself is `controls.css`'s, shared with every field. */

  .capture-input {
    flex: 1;
    align-self: stretch;
    /* OVER THE BOX'S TWO BORDERS, so the field a thumb presses is the box's full `--ctl-h` and not 42px inside it. The
       input draws nothing of its own, so nothing moves. */
    margin-block: -1px;
    min-inline-size: 0;
    padding-block: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .capture-input:focus-visible {
    /* focus-ok: the caret indicates focus, and `.capture-field:focus-within` above carries the
       state change for the box the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  .capture-go {
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--r-sm);
    color: var(--bg);
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  /* 48x24 MEASURED AT 390, on the primary write action of the register. It is drawn only once
     there is something to add, which is why no gate has ever measured it: the scan runs over a
     page at rest and this button does not exist then. */
  @media (pointer: coarse) {
    .capture-go {
      min-block-size: var(--tap);
    }
  }
</style>
