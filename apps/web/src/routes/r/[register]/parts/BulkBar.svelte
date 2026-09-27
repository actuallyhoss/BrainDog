<!--
  THE VERBS A SELECTION IS FOR, above the rows they act on and nowhere else.

  The anchor-extend model was implemented, drawn, and consumed by nothing: a selection you can make
  and cannot use is a mode you enter and cannot leave usefully. It appears with the selection and
  goes with it: a permanently visible bulk bar is a row of disabled controls, which tells you a thing
  exists and refuses to say why it will not work.

  THE VERBS BELONG TO THE LIST, NOT TO ONE OF ITS TWO BODIES. Putting the body's branch in the markup
  rather than in the stylesheet once swallowed this into the card arm, so a desktop selection raised
  no bulk bar at all. The page draws it above whichever body is on the screen.

  Every verb is the page's write (`copyIds`, `setPickedState`, `archiveSelected`), and `count` is the
  selection cut to the answer on screen, so what a verb acts on is what the reader is looking at.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import type { RegisterDecl } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    count,
    decl,
    states,
    stateLabel,
    saidInLine,
    copyIds,
    setPickedState,
    archiveSelected,
    onclear,
  }: {
    count: number;
    decl: RegisterDecl | undefined;
    /** The register's own states, so the menu is the vocabulary rather than a list typed here. */
    states: readonly string[];
    /** The register's own name for its state column, so the verb over the menu says what the header says. */
    stateLabel: string;
    saidInLine: (field: string, value: string) => string;
    copyIds: () => void;
    setPickedState: (state: string) => void;
    archiveSelected: () => void;
    onclear: () => void;
  } = $props();
</script>

<!-- It wraps rather than scrolls, so the verbs survive a phone. -->
<div class="picked-bar" role="toolbar" aria-label="{count} {copy.selected}">
  <span class="picked-n num">{count}</span>
  <span class="picked-word">{copy.selected}</span>
  <Button weight="quiet" onclick={() => copyIds()}>
    <Icon name="copy" size="s" />{copy.copyIds}
  </Button>
  {#if states.length}
    <Menu label={copy.setState(stateLabel)}>
      {#snippet trigger()}<span class="picked-verb"><Icon name="edit" size="s" />{copy.setState(stateLabel)}</span>{/snippet}
      {#each states as state}
        <button
          class="mi"
          role="menuitem"
          type="button"
          onclick={() => setPickedState(state)}
        >
          <span class="mi-name">{saidInLine(decl?.state ?? '', state)}</span>
        </button>
      {/each}
    </Menu>
  {/if}
  <Button weight="quiet" onclick={() => archiveSelected()}>
    <Icon name="archive" size="s" />{copy.archiveSelected}
  </Button>
  <button type="button" class="picked-clear" onclick={() => onclear()}>{copy.clear}</button>
</div>

<style>
  .picked-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .picked-word {
    margin-inline-end: var(--sp-2);
  }

  .picked-verb {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .picked-n {
    color: var(--ink);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .picked-clear {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    cursor: pointer;
  }

  /* The menu rows: the same 34px and the same tint-on-hover as every menu row on this screen. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
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
    text-decoration: none;
    cursor: pointer;
  }

  /* 44 UNDER A THUMB, measured at 34 on a phone. `13 §7` is the rule. */
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

  .mi-name {
    flex: 1;
  }
</style>
