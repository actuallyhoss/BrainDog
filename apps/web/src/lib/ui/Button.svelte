<!--
  One control, three weights, and every one of them a rectangle (and INK, the neutral strong fill: `--ink` with
  `--tile` words, for a suggested answer where the screen's one red is spent elsewhere).

  PRIMARY is the red fill with white words, one per screen: `--red-fill` at rest, `--red-fill-hover` under the pointer,
  `--red-fill-press` while it is held, and `--on-red` (white) on all three, in light and in dark. QUIET, the default, is
  the secondary: `--tile` on the board and `--tile-2` on a tile, a sheet or a panel, with ink words. BARE is the
  tertiary, words in `--ink-2` that take the hover fill when pointed at. GLASS is kept as a name for the toolbar's
  callers and draws as QUIET: there is no glass.

  Radius `--r-ctl` (8), `--ctl-h` tall (32, and 44 under a thumb), the label at `--fs-ctl` 14 medium. `sm` is 28 with 8
  of padding, for a row's verbs and a heading's.

  A PRESS IS A FILL, NOTHING MOVES. The fill changes over `--d-press`; a button never scales or slides.

  A DELETE THAT IS READY (`tone="bad"` on a primary) wears the primary's look with a 16px bin before its words, so the
  armed form of a destructive verb is told from the screen's ordinary primary by its glyph and its words, never by a
  second red. On any other weight `tone` colours nothing: it reaches the element as `data-intent`, so a gate or a test
  can read what the verb is.

  A PRIMARY IS NEVER DISABLED FOR A MISSING FIELD: the press focuses the field and says why (first-run F16). `disabled`
  is for a control that truly cannot act right now, a save already on its way, and draws `--tile-2` with `--ink-3`.

  `kbd` draws the key cap inside the button at its trailing edge (Geist Mono 12, an 18px cap), so the fast path is
  printed on the slow one. It is hidden from a screen reader, which already has the verb.

  The invisible hit box is `.tap`: targets are 44 x 44 CSS px on BOTH axes, counting `::before` (13 §7).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { at } from '../at.ts';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';

  let {
    weight = 'quiet',
    href,
    type = 'button',
    tone,
    size = 'm',
    kbd,
    disabled,
    onclick,
    children,
    ...rest
  }: {
    weight?: 'primary' | 'ink' | 'quiet' | 'bare' | 'glass' | undefined;
    href?: string | undefined;
    type?: 'button' | 'submit' | undefined;
    tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
    /** `m` is `--ctl-h` (32, 44 under a thumb); `sm` is `--btn-h-sm` (28) for a row's verbs and a heading's. */
    size?: 'm' | 'sm' | undefined;
    /** The key that does the same thing, in the table's spelling (`⌘K`, `e`); `Kbd` says it for this platform. */
    kbd?: string | undefined;
    disabled?: boolean | undefined;
    onclick?: ((e: MouseEvent) => void) | undefined;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  /* THE ONE PLACE A BUTTON'S ADDRESS IS PUT UNDER THE APP. About forty screens hand this `href="/decide"` or a row's
     `/r/<list>/<seq>`, which inside a record would leave it for the record the session is on.
     `at` leaves an address it has already rendered, a query and another origin as they came. */
  const to = $derived(href ? at(href) : href);

  /* The armed delete: the primary's fill and the bin, so it is not mistaken for the screen's ordinary primary. */
  const armed = $derived(weight === 'primary' && tone === 'bad');
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  class="btn tap"
  data-weight={weight}
  data-intent={tone}
  data-size={size === 'sm' ? 'sm' : undefined}
  href={to}
  type={href ? undefined : type}
  disabled={href ? undefined : disabled}
  {onclick}
  {...rest}
>
  {#if armed}<Icon name="trash" size="m" />{/if}{@render children()}{#if kbd}<span class="btn-kbd" aria-hidden="true"><Kbd keys={kbd} /></span>{/if}
</svelte:element>

<style>
  /* A RECTANGLE TOLD BY ITS FILL: no border on any weight, radius 8, the label at 14 medium. On the board a quiet
     button is the tile's colour, so it reads as a control and not a hole. */
  .btn {
    --btn-fill: var(--tile);

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--btn-fill);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 20px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    /* COLOUR ONLY. A press and a hover are fills; nothing about a button moves. */
    transition:
      background var(--d-press) var(--ease-out),
      color var(--d-press) var(--ease-out);
  }

  /* ON A TILE, A SHEET OR A PANEL the quiet fill is a step under the surface, `--tile-2`, so it still reads as a thing
     to press on white. */
  :global(:is(.tile, .sheet, dialog, .menu, [data-surface='tile'], .block-slot)) .btn {
    --btn-fill: var(--tile-2);
  }

  .btn[data-size='sm'] {
    min-block-size: var(--btn-h-sm);
    padding: 0 var(--sp-2);
  }

  /* A KEY CAP ASKS FOR A LITTLE LESS ROOM AT ITS END, so the cap sits in the corner the way the label sits in the other. */
  .btn:is(:hover, :focus-visible):has(.btn-kbd) {
    padding-inline-end: var(--sp-2);
  }

  /* THE CAP SHOWS ON HOVER OR FOCUS ONLY: a key hint is for the person reaching for it, not chrome at rest. */
  .btn:not(:hover, :focus-visible) > .btn-kbd {
    display: none;
  }

  /* THE PRESS: a step deeper than the fill, while it is held. */
  .btn:active:not(:disabled) {
    background: color-mix(in oklab, var(--ink) 8%, var(--btn-fill));
  }

  /* THE RED FILL, the one filled control on a screen, with white words in both schemes. */
  .btn[data-weight='primary'] {
    --btn-fill: var(--red-fill);

    background: var(--btn-fill);
    color: var(--on-red);
  }

  .btn[data-weight='primary']:active:not(:disabled) {
    background: var(--red-fill-press, var(--red-fill-hover));
  }

  /* INK, THE NEUTRAL STRONG BUTTON: a suggested answer on a screen whose one red is spent elsewhere. */
  .btn[data-weight='ink'] {
    --btn-fill: var(--ink);

    background: var(--btn-fill);
    color: var(--tile);
  }

  .btn[data-weight='ink']:active:not(:disabled) {
    background: color-mix(in oklab, var(--ink) 78%, var(--tile));
  }

  .btn[data-weight='bare'] {
    background: none;
    color: var(--ink-2);
  }

  .btn[data-weight='bare']:active:not(:disabled) {
    background: var(--tile-2);
    color: var(--ink);
  }

  /* HOVER ONLY WHERE THERE IS ONE. A phone reports `:hover` on the last thing tapped and keeps it.

     `:active` IS LEFT OUT because this block comes after the press rule above, and under a mouse a pressed button is
     also a hovered one. */
  @media (hover: hover) and (pointer: fine) {
    .btn:hover:not(:disabled):not(:active) {
      background: var(--hover);
    }

    .btn[data-weight='primary']:hover:not(:disabled):not(:active) {
      background: var(--red-fill-hover);
    }

    .btn[data-weight='ink']:hover:not(:disabled):not(:active) {
      background: color-mix(in oklab, var(--ink) 86%, var(--tile));
    }

    .btn[data-weight='bare']:hover:not(:disabled):not(:active) {
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* THE CAP. `Kbd` draws the `--tile-2` cap; on the red fill it takes a tint of the white label instead, or a light
     cap on a red button would be the loudest thing in it. */
  .btn-kbd {
    display: inline-flex;
    flex: none;
  }

  .btn[data-weight='primary'] :global(.kbd) {
    background: color-mix(in srgb, var(--on-red) 20%, transparent);
    color: var(--on-red);
  }

  /* A DISABLED CONTROL loses the fill as well as the label, so a disabled primary does not read as live. */
  .btn:disabled {
    color: var(--ink-3);
    cursor: not-allowed;
  }

  .btn:is([data-weight='primary'], [data-weight='ink']):disabled {
    background: var(--tile-2);
    color: var(--ink-3);
  }

  /* AND ITS KEY CAP GOES QUIET WITH IT: the white cap on the grey fill was a cap nobody could see. */
  .btn[data-weight='primary']:disabled :global(.kbd) {
    background: var(--hover);
    color: var(--ink-3);
  }

  .btn[data-weight='bare']:disabled {
    background: none;
  }

  /* 15 UNDER A THUMB, a step up from the mouse's 14, on the 44px control. */
  @media (pointer: coarse) {
    .btn {
      font-size: var(--fs-body);
    }

    .btn[data-size='sm'] {
      padding: 0 var(--sp-3);
      font-size: var(--fs-ctl);
    }
  }

  @media (forced-colors: active) {
    .btn {
      border: 1px solid ButtonText;
    }
  }
</style>
