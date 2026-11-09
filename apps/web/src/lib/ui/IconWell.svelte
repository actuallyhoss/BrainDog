<!--
  A WHAT, as a square: an icon (or a project's letter) in its well. Round is a who
  (`Face`); square is a what, and this is the one square.

  FIVE SIZES, each with its one icon size: `m` 28 (a tile's heading, icon 18), `l` 32 (a row, icon 16), `card` 40 (a
  project card, icon 20), and `xl` 56 on a project's hero (icon 28, radius 16), 48 on a phone (icon 24). Radius 8 up to
  40, 12 at 48, 16 at 56.

  NEUTRAL BY DEFAULT: `--tile-2` with the icon in `--ink-2`. A PROJECT passes its `slot` (`slotOf` in `face.ts`), and the
  well is the slot's tint with the glyph in the slot's colour; `slot="here"` takes the `--ph` and `--ph-tint` a project's
  page sets round it.

  A TONE IS A MEANING, NEVER DECORATION, and only on a ROW that means it: `late` (also `danger`, and `action` for a
  question waiting on him) is `--red-tint` with a `--red` icon; `good` (also `earn` and `live`) is `--good-tint` with
  `--good`; `warn` is `--warn-tint` with `--warn`. `ink` is the chosen form, an ink well with the icon in the tile's
  colour. A tile's heading never passes a tone (`Tile` drops it).

  A PICTURE, WHERE THE ROW HOLDS ONE (`picture`, a hash): a project's logo fills the well in the well's own shape, over
  its slot's tint while it loads, so nothing moves when it arrives; a picture that will not load gives the glyph or the
  letter back. `change`, handed only by a screen whose reader may write the row, makes the well the picture changer's
  button (`PictureChange.svelte`, loaded the first time one is handed): hovered it shows a camera, and a press or a
  double press opens the changer.

  Decorative: the words beside a well say what it means, so the well is hidden from assistive tech.
-->
<script lang="ts">
  import { changer } from '$lib/picture/changer.svelte.ts';
  import { pictureSrc, type PictureTarget } from '$lib/picture/picture.ts';
  import type { Slot } from './face.ts';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  let {
    name,
    letter,
    size = 'm',
    tone,
    slot,
    picture,
    change,
  }: {
    /** The glyph; when there is none, `letter` is drawn instead. */
    name?: IconName | undefined;
    /** A project's or a thing's letter, where its mark names no glyph. */
    letter?: string | undefined;
    size?: 'm' | 'l' | 'card' | 'xl';
    tone?: 'ink' | 'action' | 'danger' | 'late' | 'earn' | 'good' | 'live' | 'warn' | undefined;
    /** A project's category slot, or `here` for the project whose page this is. */
    slot?: Slot | 'here' | undefined;
    /** The row's picture, by hash, drawn in place of the glyph or the letter. */
    picture?: string | null | undefined;
    /** The row the well may change the picture of, handed only where the reader may write it. */
    change?: PictureTarget | null | undefined;
  } = $props();

  /* The old tone names say the same three meanings. */
  const MEANS = { action: 'late', danger: 'late', late: 'late', earn: 'good', good: 'good', live: 'good', warn: 'warn', ink: 'ink' } as const;
  const means = $derived(tone ? MEANS[tone] : undefined);

  /* THE PICTURE THAT WOULD NOT LOAD, so the well draws its glyph again rather than a broken image. */
  let failed = $state<string | null>(null);
  const shown = $derived(picture && picture !== failed ? picture : null);
  /* THE SIZE IT IS DRAWN AT, for the image's own width and height, so the browser lays it before it arrives. */
  const PX = { m: 28, l: 32, card: 40, xl: 56 } as const;
  /* A WELL THAT MAY BE CHANGED LOADS THE HOVER, once for every well (`changer.svelte.ts`). */
  $effect(() => {
    if (change) changer.want();
  });
</script>

{#snippet well()}<span class="well" data-size={size} data-tone={tone} data-means={means} data-slot={slot} data-picture={shown ? '' : undefined} aria-hidden="true"
    >{#if shown}<img class="well-picture" src={pictureSrc(shown)} alt="" width={PX[size]} height={PX[size]} loading="lazy" decoding="async" onerror={() => (failed = shown)} />{:else if name}<Icon {name} size="l" />{:else if letter}<span class="well-letter">{letter}</span>{/if}</span
  >{/snippet}

{#if change && changer.component}{@const Changer = changer.component}<Changer target={change} big={size === 'xl'}>{@render well()}</Changer>{:else}{@render well()}{/if}

<style>
  .well {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--well);
    block-size: var(--well);
    /* A CIRCLE (ops: circles and capsules, 3 Nov). */
    border-radius: var(--r-pill);
    background: var(--soft-fill);
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  /* 18 IN THE HEADING'S 28, between the named `--icon-m` (16) and `--icon-l` (20). The attribute is in the selector so
     this outranks `Icon`'s own size rule without leaning on source order. */
  .well :global(.icon[data-size]) {
    inline-size: 18px;
    block-size: 18px;
  }

  /* 32, A ROW'S: the icon at 16. */
  .well[data-size='l'] {
    inline-size: var(--well-l);
    block-size: var(--well-l);
    font-size: var(--fs-body);
  }

  .well[data-size='l'] :global(.icon[data-size]) {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }

  /* 40, A CARD'S: the icon at 20. */
  .well[data-size='card'] {
    inline-size: 40px;
    block-size: 40px;
    font-size: var(--fs-head);
  }

  .well[data-size='card'] :global(.icon[data-size]) {
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
  }

  /* 56, A HERO'S, at a tile's corner and the icon at 28; 48 on a phone, at the pop's corner and 24. */
  .well[data-size='xl'] {
    inline-size: 56px;
    block-size: 56px;
    border-radius: var(--r-tile);
    font-size: var(--fs-figure);
  }

  .well[data-size='xl'] :global(.icon[data-size]) {
    inline-size: 28px;
    block-size: 28px;
  }

  @media (width < 640px) {
    .well[data-size='xl'] {
      inline-size: 48px;
      block-size: 48px;
      border-radius: var(--r-pop);
    }

    .well[data-size='xl'] :global(.icon[data-size]) {
      inline-size: var(--icon-xl);
      block-size: var(--icon-xl);
    }
  }

  /* THE TONES: a soft tint and the meaning's own colour on it, each pair 4.5:1 in both schemes. */
  .well[data-means='late'] {
    background: var(--red-tint);
    color: var(--red);
  }

  .well[data-means='good'] {
    background: var(--good-tint, color-mix(in srgb, var(--good) 12%, var(--tile)));
    color: var(--good);
  }

  .well[data-means='warn'] {
    background: var(--warn-tint);
    color: var(--warn);
  }

  .well[data-means='ink'] {
    background: var(--ink);
    color: var(--tile);
  }

  /* A PROJECT'S SLOT: its tint under its colour. Each pair is solved in the theme to 4.5:1 in light and dark. */
  .well[data-slot] {
    background: var(--ph-tint);
    color: var(--ph);
  }

  .well[data-slot='blue'] {
    --ph: var(--cat-blue, var(--info));
    --ph-tint: var(--cat-blue-tint, var(--tile-2));
  }

  .well[data-slot='violet'] {
    --ph: var(--cat-violet, var(--info));
    --ph-tint: var(--cat-violet-tint, var(--tile-2));
  }

  .well[data-slot='pink'] {
    --ph: var(--cat-pink, var(--ink-2));
    --ph-tint: var(--cat-pink-tint, var(--tile-2));
  }

  .well[data-slot='teal'] {
    --ph: var(--cat-teal, var(--good));
    --ph-tint: var(--cat-teal-tint, var(--tile-2));
  }

  .well[data-slot='sky'] {
    --ph: var(--cat-sky, var(--info));
    --ph-tint: var(--cat-sky-tint, var(--tile-2));
  }

  .well[data-slot='yellow'] {
    --ph: var(--cat-yellow, var(--warn));
    --ph-tint: var(--cat-yellow-tint, var(--tile-2));
  }

  .well[data-slot='lime'] {
    --ph: var(--cat-lime, var(--good));
    --ph-tint: var(--cat-lime-tint, var(--tile-2));
  }

  .well[data-slot='slate'] {
    --ph: var(--cat-slate, var(--ink-3));
    --ph-tint: var(--cat-slate-tint, var(--tile-2));
  }

  .well-letter {
    font-variant-numeric: tabular-nums;
  }

  /* A PICTURE FILLS THE WELL in its own shape, over the slot's tint while it loads. */
  .well[data-picture] {
    overflow: hidden;
  }

  .well-picture {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  /* Forced colours drop the fill, so the chosen well keeps an edge to be told from the rest by. */
  @media (forced-colors: active) {
    .well[data-means='ink'] {
      outline: 1px solid CanvasText;
      outline-offset: -1px;
    }
  }
</style>
