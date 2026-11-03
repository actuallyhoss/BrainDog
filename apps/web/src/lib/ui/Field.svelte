<!--
  ONE FIELD: its label, the control, and one line under it.

  The line is the field's help, or, when the record refused what was typed, the record's own sentence in the danger
  words with a mark beside it, and the control's edge in the danger colour while it is wrong. An error replaces the
  help, never sits beside it. `field.ts` decides which; this draws it.

  THE CONTROL IS THE CALLER'S, passed as `children`, because a text box, a choice of four and a day are different
  controls and one field around them all. It is handed what it must carry (`describedBy`, `invalid`, `labelId`) so a
  screen reader hears the line when the control is reached, and hears a refusal when it lands (`role="alert"`).

  `group` is for a control that is not one element, a radiogroup: there is nothing for `for` to point at, so the
  label has none and the control names itself by `labelId`.

  ITS CSS IS HERE and nowhere in an entry sheet: this is drawn inside the row form, which a sheet loads.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { fieldLine } from './field.ts';

  type Control = { describedBy: string | undefined; invalid: boolean; labelId: string };

  let {
    id,
    label,
    help,
    error,
    marked,
    group = false,
    children,
  }: {
    /** The control's id. The label's and the line's are derived from it. */
    id: string;
    label: string;
    help?: string | null | undefined;
    /** The record's sentence for this field, or this form's own when it can already see the value is wrong. */
    error?: string | null | undefined;
    /** A muted word beside the label, such as the one that says the field must be filled. */
    marked?: string | undefined;
    group?: boolean;
    children: Snippet<[Control]>;
  } = $props();

  const line = $derived(fieldLine({ id, help, error }));
  const labelId = $derived(`${id}-label`);
</script>

<div class="one-field">
  <label class="one-label" id={labelId} for={group ? undefined : id}>
    {label}
    {#if marked}<span class="one-marked">{marked}</span>{/if}
  </label>
  <div class="one-control" data-invalid={line?.invalid ? '' : undefined}>
    {@render children({ describedBy: line?.describedBy, invalid: line?.invalid ?? false, labelId })}
  </div>
  {#if line?.tone === 'danger'}
    <p class="one-line" data-tone="danger" id={line.lineId} role="alert">
      <Icon name="alert" size="s" />
      <span>{line.text}</span>
    </p>
  {:else if line}
    <p class="one-line" id={line.lineId}>{line.text}</p>
  {/if}
</div>

<style>
  .one-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .one-label {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .one-marked {
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: 400;
  }

  /* THE CONTROL STRETCHES to the field's width whatever it is, a box, a select or a track. */
  .one-control {
    display: flex;
    flex-direction: column;
    border-radius: var(--r-field);
  }

  /* THE DANGER EDGE, round the control's own corners and just outside it, so the focus ring (2px further out) still
     shows on a field that is wrong. An outline, not a border or a shadow: the tile stays flat. */
  .one-control[data-invalid] {
    outline: 2px solid var(--red);
    outline-offset: 0;
  }

  /* BODY SIZE, the help muted and the refusal in the red solved for words. The mark is there so the colour is never
     the only thing that says it. */
  .one-line {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 1.45;
  }

  .one-line[data-tone='danger'] {
    color: var(--red);
  }

  .one-line[data-tone='danger'] :global(svg) {
    flex: none;
    margin-block-start: 0.2em;
  }
</style>
