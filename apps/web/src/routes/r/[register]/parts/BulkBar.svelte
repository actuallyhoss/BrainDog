<!--
  THE VERBS A SELECTION IS FOR, above the rows they act on and nowhere else.

  The anchor-extend model was implemented, drawn, and consumed by nothing: a selection you can make
  and cannot use is a mode you enter and cannot leave usefully. It appears with the selection and
  goes with it: a permanently visible bulk bar is a row of disabled controls, which tells you a thing
  exists and refuses to say why it will not work.

  THE VERBS BELONG TO THE LIST, NOT TO ONE OF ITS TWO BODIES. Putting the body's branch in the markup
  rather than in the stylesheet once swallowed this into the card arm, so a desktop selection raised
  no bulk bar at all. The page draws it whichever body is on the screen.

  IT FLOATS: a bar at the bottom centre of the window, over the list, with the count, the verbs and Esc to let go. It
  is the tile's colour with a hairline and the second level's shadow, a rectangle and no glass (DIRECTION 39). Its
  surface is on a pseudo-element, which keeps the bar itself free of anything that would place the state menu inside
  it rather than on the window. The verbs in it are
  the quiet buttons.

  Every verb is the page's write (`copyIds`, `setPickedState`, `archiveSelected`), and `count` is the
  selection cut to the answer on screen, so what a verb acts on is what the reader is looking at.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import type { RegisterDecl } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';

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
    /** Absent for a caller whose level cannot change the list, and Archive is then not on the bar. */
    archiveSelected?: (() => void) | undefined;
    onclear: () => void;
  } = $props();
</script>

<!-- It wraps rather than scrolls, so the verbs survive a phone. `data-fixed` because it is placed on the window, which
     the shell's rail slide has to know so it does not carry the bar along with the work (`+layout.svelte`). -->
<div class="picked-bar" data-fixed role="toolbar" aria-label="{count} {copy.selected}">
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
  {#if archiveSelected}
    <Button weight="quiet" onclick={() => archiveSelected?.()}>
      <Icon name="archive" size="s" />{copy.archiveSelected}
    </Button>
  {/if}
  <button type="button" class="picked-clear tap" aria-label={copy.clear} title={copy.clear} onclick={() => onclear()}>
    <Icon name="close" size="s" /><span class="picked-esc" aria-hidden="true"><Kbd keys="Esc" /></span>
  </button>
</div>

<style>
  /* THE FLOATING BAR: bottom centre, 12 above the window's edge twice over, and above the phone's tab bar there. The
     surface is the `::before`, so the state menu inside it places itself on the window. */
  .picked-bar {
    position: fixed;
    inset-inline: 0;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--inset) * 2);
    z-index: var(--z-sheet);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px;
    inline-size: fit-content;
    max-inline-size: calc(100vw - 2 * var(--inset));
    margin-inline: auto;
    padding: 6px 6px 6px var(--sp-4);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
    animation: picked-in var(--d-enter) var(--ease-out);
  }

  .picked-bar::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--tile);
    box-shadow: 0 0 0 1px var(--rule), var(--e2);
    pointer-events: none;
  }

  @keyframes picked-in {
    from {
      transform: translateY(12px);
    }
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
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* LET GO: a close with the Esc cap beside the glyph, the key that does the same. */
  .picked-clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2) 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font: inherit;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .picked-clear:hover {
      background: var(--field);
      color: var(--ink);
    }
  }

  .picked-esc {
    display: inline-flex;
  }

  /* The menu rows: 32 tall with the same wash on hover as every menu row. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
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

    .picked-esc {
      display: none;
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

  /* NO RAIL BELOW 900PX, AND THE FLOATING TAB BAR OWNS THE BOTTOM EDGE, so the pill stands over it and over the toast
     that sits on it. */
  @media (width < 900px) {
    .picked-bar {
      inset-block-end: calc(var(--tabbar) + var(--inset) * 3 + var(--tap));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picked-bar {
      animation-name: picked-fade;
    }
  }

  @keyframes picked-fade {
    from {
      opacity: 0.6;
    }
  }

  @media (forced-colors: active) {
    .picked-bar::before {
      border: 1px solid CanvasText;
    }
  }
</style>
