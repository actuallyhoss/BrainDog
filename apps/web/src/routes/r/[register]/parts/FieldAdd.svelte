<!--
  The new-row drawer: a row added with every declared field in front of the reader, where the
  capture line takes the title alone. `n`, and the New button beside the list's title.

  Every control in it comes from the register's own field declarations (see `RowForm`), so a pack
  that adds a field gets a form field, and nobody writes a second copy of the schema in markup.

  THE ADD IS THE PAGE'S. What the form holds (`taken`) and what it would refuse (`problems`) are
  bound to the page's state, because the page writes the row (`addTypedRow`) and a link can ask for
  the form (`?new=1`), which the page reads and `closeCreate` clears.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import type { Fields } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';

  let {
    open = $bindable(false),
    register,
    one,
    problems = $bindable([]),
    taken = $bindable({}),
    writing,
    addTypedRow,
    closeCreate,
  }: {
    open?: boolean;
    register: string;
    /** What one row of this list is called. */
    one: string;
    problems?: string[];
    taken?: Fields;
    /** The add is out, so the button stays down until the record answers. */
    writing: boolean;
    addTypedRow: () => void;
    closeCreate: () => void;
  } = $props();
</script>

<Sheet bind:open onclose={closeCreate} title="{said('new_row')} {one}">
  <!-- No `autofocus` here: `Sheet` puts the caret in the first field after `showModal()`, which is
       the only moment it can, and it does it for every sheet that carries one. -->
  <!--
    `form` HERE, AND NOT INSIDE `RowForm`. The control that decides what a row IS belongs to the
    screen that owns the row, and the screen that owns it is the one that can put it somewhere.
    `RowForm` used to be a `<form>` with `preventDefault` on submit, which swallowed Enter in
    every field of every new-row sheet in the product: the one key a person presses when they have
    finished typing, answered by nothing at all.
  -->
  <form
    id="new-row"
    onsubmit={(e) => {
      e.preventDefault();
      addTypedRow();
    }}
  >
    <RowForm {register} bind:problems bind:taken />
  </form>
  {#snippet footer()}
    <!-- A DISABLED CONTROL SAYS WHY IT IS DISABLED, which is `/decide`'s answer to the same
         question and was not this one's. The button was live with every required field empty and
         answered the press with "nothing was written", true of every submit here, and silent
         about the actual reason. `aria-describedby` points at the sentence so the greying is not
         the only cue. -->
    {#if problems.length > 0}<p class="drawer-why" id="new-row-why">{problems[0]}</p>{/if}
    <!-- `type="submit"` AND `form`, WHICH IS WHAT MAKES ENTER WORK. `Button` defaults to
         `type="button"`, and this control lives in the Sheet's footer snippet, outside the form
         it submits: a form whose only submit control is elsewhere and unassociated has no submit
         button at all, and a browser refuses implicit submission on a form with more than one
         text field. Obligations draws four. So `RowForm` ceasing to swallow Enter bought nothing
         on this screen until the button said which form it belongs to.

         AND NO `onclick`, WHICH ADDED THE ROW TWICE. It carried `onclick={addTypedRow}` as well,
         so one press ran the handler and then submitted `#new-row`, whose `onsubmit` runs the
         same handler: two rows and two identical toasts. Enter did it too, by firing a click at
         the default button. The submit path is the one that has to exist for Enter, so it is the
         only one. -->
    <Button
      weight="primary"
      type="submit"
      form="new-row"
      disabled={problems.length > 0 || writing}
      aria-describedby={problems.length > 0 ? 'new-row-why' : undefined}
    >
      {said('add_row')} {one}
    </Button>
    <Button weight="bare" onclick={() => (open = false)}>{copy.close}</Button>
  {/snippet}
</Sheet>

<style>
  /* The same sentence-under-a-dead-button treatment `/decide` uses, and the same colour: this is a
     rule the register declared, not an error the person made. */
  .drawer-why {
    /* Its own line above the buttons, not a third column beside them. */
    flex-basis: 100%;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
  }
</style>
