<!--
  A mark or a face that may be changed where it is drawn (his word of 4 and 9 November): hovering it lays a quiet
  camera over it, and a press, a double press or a picture dropped on it opens the changer (`PictureSheet.svelte`).

  ONLY WHERE THE READER MAY WRITE THE ROW. The screen that draws the row decides and hands a `target`; without one,
  `Face`, `IconWell` and the rest draw what they always drew and nothing about them is a button.

  A BUTTON, WITH THE ROW'S NAME, so a keyboard reaches it and a screen reader hears "Change the picture of FanPad"
  where the picture itself is hidden. On a phone, where nothing hovers, the camera sits small at its corner.

  DOUBLE PRESS IS THIS ONE'S. The rest of the app opens a row's editor on a double press; on a picture it opens the
  changer and goes no further, so the row under it does not open its editor too.

  THE CHANGER IS LOADED THE FIRST TIME IT IS ASKED FOR, never as the screen draws, and kept for the next.

  A LIST THAT KEEPS NO PICTURE YET (a record whose add-on has not taken its update) changes its glyph alone: a pencil in
  place of the camera, "Change the mark", and no picture taken from a drop.
-->
<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { pictureFieldOf, type PictureTarget } from './picture.ts';
  import { pictureIn } from './dropped.ts';
  import { CHANGE_WORDS } from './change-words.ts';

  let {
    target,
    children,
    big = false,
  }: {
    target: PictureTarget;
    children: Snippet;
    /** A hero's or a head's mark: the hover says "Change" under the camera, where a small one shows the camera alone. */
    big?: boolean | undefined;
  } = $props();

  type Changer = Component<{ open: boolean; target: PictureTarget; file: File | null; onclose: () => void }>;
  let Sheet = $state.raw<Changer | null>(null);
  let open = $state(false);
  /* A PICTURE DROPPED ON THE MARK, which the changer opens on, cut and ready. */
  let dropped = $state.raw<File | null>(null);
  let over = $state(false);
  let said = $state('');
  let button = $state<HTMLButtonElement | null>(null);

  async function show(file: File | null = null) {
    said = '';
    dropped = file;
    if (!Sheet) {
      try {
        Sheet = (await import('./PictureSheet.svelte')).default as unknown as Changer;
      } catch {
        said = CHANGE_WORDS.unloaded;
        return;
      }
    }
    open = true;
  }

  function closed() {
    open = false;
    dropped = null;
    button?.focus();
  }

  /* THE SCRIM TAKES THE SHAPE OF WHAT IT COVERS: the mark's own corner, read from it once it is drawn and again as it is
     hovered, since a project's well is round in a card and a rounded square at the head of its page. */
  let corner = $state<string | null>(null);
  const shapeOf = (): void => {
    const drawn = button?.firstElementChild;
    if (drawn instanceof HTMLElement) corner = getComputedStyle(drawn).borderRadius || null;
  };
  $effect(() => {
    if (button) shapeOf();
  });

  /* WHETHER ITS LIST KEEPS A PICTURE, or only a mark. */
  const pictured = $derived(pictureFieldOf(target.register) !== null);
  const label = $derived(pictured ? CHANGE_WORDS.changeOf(target.name) : CHANGE_WORDS.markOf(target.name));
  const carries = (e: DragEvent): boolean => pictured && Array.from(e.dataTransfer?.types ?? []).includes('Files');
</script>

<button
  bind:this={button}
  type="button"
  class="pc"
  data-round={target.round ? '' : undefined}
  data-big={big ? '' : undefined}
  data-over={over ? '' : undefined}
  style:border-radius={corner}
  onpointerenter={shapeOf}
  aria-label={label}
  aria-haspopup="dialog"
  title={label}
  onclick={(e) => {
    e.stopPropagation();
    if (!open) void show();
  }}
  ondblclick={(e) => {
    /* THE DOUBLE PRESS IS THE PICTURE'S: the row under it does not open its editor as well. */
    e.preventDefault();
    e.stopPropagation();
    if (!open) void show();
  }}
  ondragenter={(e) => {
    if (!carries(e)) return;
    e.preventDefault();
    over = true;
  }}
  ondragover={(e) => {
    if (!carries(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    over = false;
    const file = pictured ? pictureIn(e.dataTransfer) : null;
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    void show(file);
  }}
>
  {@render children()}
  <span class="pc-over" aria-hidden="true"><Icon name={pictured ? 'camera' : 'edit'} size={big ? 'm' : 's'} />{#if big}<span class="pc-word">{CHANGE_WORDS.change}</span>{/if}</span>
</button>
{#if said}<span class="pc-said" role="status">{said}</span>{/if}
{#if Sheet}
  {@const Changer = Sheet}
  <Changer {open} {target} file={dropped} onclose={closed} />
{/if}

<style>
  /* THE MARK AS IT IS, A BUTTON ONLY IN WHAT IT DOES: no fill, no border, its own size and shape. */
  .pc {
    position: relative;
    display: inline-grid;
    flex: none;
    place-items: center;
    padding: 0;
    margin: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: inherit;
    font: inherit;
    line-height: 0;
    cursor: pointer;
    /* ABOVE A CARD'S STRETCHED LINK, so a press on the mark changes it rather than opening the project. */
    z-index: 1;
  }

  .pc[data-round] {
    border-radius: var(--r-round);
  }

  .pc:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* THE CAMERA, quiet: the mark dimmed under a scrim of its own shape, the glyph in the tile's colour over it. */
  .pc-over {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 2px;
    border-radius: inherit;
    background: color-mix(in srgb, var(--ink) 52%, transparent);
    color: var(--tile);
    opacity: 0;
    transition: opacity var(--d-swap) var(--ease-standard);
    pointer-events: none;
  }

  .pc-word {
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  .pc:focus-visible .pc-over,
  .pc[data-over] .pc-over {
    opacity: 1;
  }

  @media (hover: hover) and (pointer: fine) {
    .pc:hover .pc-over {
      opacity: 1;
    }
  }

  /* NOTHING HOVERS UNDER A THUMB: the camera sits small on the mark's end corner instead, and the whole mark is the press. */
  @media (hover: none), (pointer: coarse) {
    .pc-over {
      inset: auto -4px -4px auto;
      inline-size: 18px;
      block-size: 18px;
      border-radius: var(--r-round);
      background: var(--ink);
      box-shadow: 0 0 0 2px var(--tile);
      opacity: 1;
    }

    .pc-over :global(.icon[data-size]) {
      inline-size: 11px;
      block-size: 11px;
    }

    .pc-word {
      display: none;
    }
  }

  .pc-said {
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  @media (prefers-reduced-motion: reduce) {
    .pc-over {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .pc-over {
      background: Canvas;
      color: CanvasText;
    }
  }
</style>
