<!--
  ONE WIDGET WHILE THE BOARD IS EDITED (the widgets plan of 29 October, §5.1 to §5.3, §5.8): a cover over the whole
  widget that takes the drag, so nothing inside it is pressed by accident, a remove dot at its top right and a resize
  corner at its bottom right. The cover is the widget's control for a keyboard and a screen reader: Enter picks it up,
  arrows move it, Shift and arrows resize it, Delete hides it, Esc puts it back. Drawn inside the widget's own frame, so
  it moves wherever the widget does.
-->
<script lang="ts">
  import { SIZE_WORDS } from 'braindog-render';

  import Icon from '$lib/ui/Icon.svelte';
  import { boardWords, type BoardModel } from './board.svelte.ts';

  let { model, key }: { model: BoardModel; key: string } = $props();

  const name = $derived(model.nameOf(key));
  const size = $derived(model.sizeNow(key));
  const at = $derived(model.keys.indexOf(key) + 1);
  const resizable = $derived(model.sizesFor(key).length > 1);
  const fixed = $derived(key === 'needs-you' || key === 'late');

  function down(e: PointerEvent) {
    const node = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-board-key]');
    if (node) model.startDrag(key, e, node);
  }

  function resize(e: PointerEvent) {
    const node = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-board-key]');
    if (node) model.startResize(key, e, node);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="edit" data-edit-cover data-held={model.held === key ? '' : undefined}>
  <button
    type="button"
    class="cover"
    data-board-cover
    aria-roledescription={boardWords.widget}
    aria-label="{name}, {SIZE_WORDS[size].toLowerCase()}, {at} of {model.keys.length}"
    aria-describedby="board-hint"
    aria-pressed={model.held === key}
    onpointerdown={down}
    onkeydown={(e) => model.keyOn(key, e)}
    oncontextmenu={(e) => e.preventDefault()}
  ></button>
  {#if !fixed}
    <button type="button" class="dot tap" aria-label={boardWords.remove(name)} onclick={() => model.hide(key)} onpointerdown={(e) => e.stopPropagation()}>
      <Icon name="x" size="s" />
    </button>
  {:else}
    <!-- NO REMOVE DOT, AND IT SAYS WHY (T11): Needs you and Late cannot be hidden. A quiet lock in the dot's place, its
         reason on hover and to a screen reader. -->
    <span class="dot pinned" role="img" aria-label={boardWords.alwaysOn} title={boardWords.alwaysOn}><Icon name="lock" size="s" /></span>
  {/if}
  {#if model.tapped === key && resizable && !model.inspects}
    <div class="sizes" role="group" aria-label="{boardWords.size}, {name}">
      {#each model.sizesFor(key) as s (s)}
        <button type="button" class="size" aria-pressed={s === size} onpointerdown={(e) => e.stopPropagation()} onclick={() => model.sizeTo(key, s)}>
          <span class="pic" data-pic={s} aria-hidden="true"></span>{SIZE_WORDS[s]}
        </button>
      {/each}
    </div>
  {/if}
  {#if resizable}
    <span class="corner" role="presentation" title={boardWords.resize(name)} onpointerdown={resize}></span>
  {/if}
</div>

<style>
  .edit {
    position: absolute;
    inset: 0;
    z-index: calc(var(--z-raise) + 2);
    border-radius: inherit;
    pointer-events: none;
  }

  /* THE OUTLINE, THIN, AND THE HELD ONE LIFTED: nothing else changes, so entering the mode moves nothing. */
  .edit::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid var(--rule-strong, var(--rule));
    border-radius: inherit;
    pointer-events: none;
  }

  .cover {
    position: absolute;
    inset: 0;
    display: block;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: grab;
    touch-action: none;
    pointer-events: auto;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .cover:active {
    cursor: grabbing;
  }

  .cover:focus-visible {
    outline: 2px solid var(--focus, var(--red));
    outline-offset: -2px;
  }

  .edit[data-held] .cover {
    background: color-mix(in oklab, var(--tile) 10%, transparent);
  }

  /* AT THE TOP LEFT, over the tile's glyph, so it covers none of the tile's own links ("All agents →" is at the right). */
  /* ON THE FRAME'S CORNER, HALF OUTSIDE IT (recheck 15): clear of the tile's icon at the top-left and of its "All …" link
     at the top-right. The frame lets it out while editing (`Board.svelte`). */
  .dot {
    position: absolute;
    inset-block-start: -10px;
    inset-inline-start: -10px;
    z-index: calc(var(--z-raise) + 3);
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    padding: 0;
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    cursor: pointer;
    pointer-events: auto;
  }

  @media (pointer: coarse) {
    .dot {
      inset-block-start: -12px;
      inset-inline-start: -12px;
      inline-size: 36px;
      block-size: 36px;
    }
  }

  .dot:hover {
    background: var(--tile-2);
  }

  .dot.pinned {
    border-color: var(--rule);
    background: var(--tile);
    color: var(--ink-3);
    cursor: help;
  }

  /* ENTERING EDIT, THE HANDLES COME IN (the board is about to change, so say so): the dot and the corner fade up from
     a step smaller over 160ms, once, as the mode opens. Never on a widget's own redraw: the cover is drawn only while
     editing. Reduced motion keeps the fade alone (`skin/a11y.css`). */
  .dot,
  .corner {
    transition:
      opacity 160ms var(--ease-out),
      transform 160ms var(--ease-out);
  }

  @starting-style {
    .dot,
    .corner {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  .sizes {
    position: absolute;
    inset-inline: var(--sp-2);
    inset-block-end: var(--sp-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    padding: var(--sp-1);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pop);
    background: var(--tile-2);
    pointer-events: auto;
  }

  .size {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 32px;
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .size {
      min-block-size: var(--tap, 44px);
    }
  }

  .size[aria-pressed='true'] {
    background: var(--tile);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  /* EACH SIZE AS ITS LITTLE PICTURE: a cell, two across, two down, four, a whole row. */
  .pic {
    display: inline-block;
    border: 1.5px solid currentColor;
    border-radius: 2px;
  }

  .pic[data-pic='small'] {
    inline-size: 8px;
    block-size: 8px;
  }

  .pic[data-pic='wide'] {
    inline-size: 16px;
    block-size: 8px;
  }

  .pic[data-pic='tall'] {
    inline-size: 8px;
    block-size: 16px;
  }

  .pic[data-pic='large'] {
    inline-size: 16px;
    block-size: 16px;
  }

  .pic[data-pic='full'] {
    inline-size: 24px;
    block-size: 8px;
  }

  .corner {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    inline-size: 28px;
    block-size: 28px;
    cursor: nwse-resize;
    touch-action: none;
    pointer-events: auto;
  }

  .corner::after {
    content: '';
    position: absolute;
    inset-block-end: 7px;
    inset-inline-end: 7px;
    inline-size: 12px;
    block-size: 12px;
    border-block-end: 2px solid var(--ink-2);
    border-inline-end: 2px solid var(--ink-2);
    border-end-end-radius: 4px;
  }

  @media (pointer: coarse) {
    /* A CORNER IS TOO SMALL FOR A THUMB (§5.3): the sizes are the list's, and the corner is only drawn large. */
    .corner {
      inline-size: 44px;
      block-size: 44px;
    }
  }
</style>
