<!--
  "Add a step": the menu of step kinds, grouped as §6 names them, Check, Change, Ask, Call out, Wait.

  A MENU AND NOT A SHEET, for `Menu.svelte`'s reason: it is a short list of verbs about the gap you pressed, and it
  belongs beside that gap. Choosing one adds a blank card there and opens the inspector on it, so the sheet is the
  second thing somebody sees and never the first.

  THE GROUP HEADINGS ARE `role="none"`, so the menu's roving focus walks the verbs and skips the words over them, and a
  screen reader hears each verb once with its group as the list's structure rather than as a stop.

  THE TRIGGER IS A CIRCLE ON THE CONNECTOR in the column, `compact`, and a labelled button under an empty arm. Both are
  44px under a thumb: touch has no hover to reveal a control that only shows on hover, so these are always drawn.
-->
<script lang="ts">
  import Menu from '$lib/ui/Menu.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { STEP_GROUPS, VERB_LABELS, words, type Verb } from './flow.ts';

  let { label = words.addStep, compact = false, onpick }: { label?: string; compact?: boolean; onpick: (verb: Verb) => void } = $props();

  let open = $state(false);
</script>

<div class="step-menu" data-compact={compact ? '' : undefined}>
  <Menu {label} bind:open>
    {#snippet trigger()}
      <span class="add">
        <Icon name="plus" size="s" />
        <span class={compact ? 'vh' : undefined}>{label}</span>
      </span>
    {/snippet}
    {#each STEP_GROUPS as group (group.label)}
      <p class="group" role="none">{group.label}</p>
      {#each group.verbs as verb (verb)}
        <button type="button" class="mi" role="menuitem" onclick={() => onpick(verb)}>{VERB_LABELS[verb]}</button>
      {/each}
    {/each}
  </Menu>
</div>

<style>
  .step-menu {
    display: flex;
    justify-content: center;
  }

  .add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    border: 1px dashed var(--line);
    border-radius: var(--r-pill);
    background: var(--s1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .step-menu[data-compact] .add {
    inline-size: var(--ctl-h-sm);
    padding: 0;
    border-style: solid;
  }

  .add:hover {
    border-color: var(--edge);
    color: var(--ink);
  }

  /* 44 UNDER A THUMB, as every target in this app is (`13 §7`), and the circle stays a circle. */
  @media (pointer: coarse) {
    .add {
      min-block-size: var(--tap);
    }

    .step-menu[data-compact] .add {
      inline-size: var(--tap);
    }
  }

  /* THE WORDS ARE THERE ON THE CIRCLE TOO, for a screen reader: an icon alone would name the button nothing. */
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .group {
    margin: var(--sp-2) var(--sp-3) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .group:first-child {
    margin-block-start: var(--sp-1);
  }

  .mi {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }
</style>
