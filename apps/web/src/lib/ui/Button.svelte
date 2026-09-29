<!--
  One control, four weights, and every one of them a pill.

  PRIMARY is an ink pill with the tile's colour for its label, one per screen. QUIET, the default, is the secondary: a
  `--s1` pill inside a tile, sheet or panel body, and the `--hover-wash` pill on the ground. BARE is words in `--ink2`
  that take the wash when pointed at. GLASS is the toolbar's pill, frosted over the ground, and is for chrome only.

  THERE IS NO BLUE AND NO RED FILL. `tone` still reaches the element as `data-intent`, so a gate or a test can read what
  the verb is, but it colours nothing: a destructive verb is its words in ink, asking for a confirm, and red means
  "needs you" and nothing else.

  `kbd` draws the key cap inside the pill at its trailing edge (Geist Mono 12, an 18px cap), so the fast path is printed
  on the slow one. It is hidden from a screen reader, which already has the verb.

  The invisible hit box is `.tap`: targets are 44 x 44 CSS px on BOTH axes, counting `::before` (13 §7).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { at } from '../at.ts';
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
    weight?: 'primary' | 'quiet' | 'bare' | 'glass' | undefined;
    href?: string | undefined;
    type?: 'button' | 'submit' | undefined;
    tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
    /** `m` is `--ctl-h` (36, 44 under a thumb); `sm` is `--ctl-h-sm` (28) for a row's verbs and a heading's. */
    size?: 'm' | 'sm' | undefined;
    /** The key that does the same thing, in the table's spelling (`⌘K`, `e`); `Kbd` says it for this platform. */
    kbd?: string | undefined;
    disabled?: boolean | undefined;
    onclick?: ((e: MouseEvent) => void) | undefined;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  /* THE ONE PLACE A BUTTON'S ADDRESS IS PUT UNDER THE APP. About forty screens hand this `href="/decide"` or a row's
     `/r/<list>/<seq>`, which since the move to `brain.dog/app` is outside the app and would load the marketing site.
     `at` leaves an address it has already rendered, a query and another origin as they came. */
  const to = $derived(href ? at(href) : href);
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
  {@render children()}{#if kbd}<span class="btn-kbd" aria-hidden="true"><Kbd keys={kbd} /></span>{/if}
</svelte:element>

<style>
  /* THE LABEL IS THE CONTROL SIZE: 14 under a mouse, 16 under a thumb. No border on any weight: a pill is
     told by its fill, and the old `--edge` ring round every quiet button is the admin-console look this replaces. */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: 20px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    /* OPACITY AND TRANSFORM TOO. The press in `controls.css` dims and scales a button, and with neither property listed
       here both snapped. */
    transition:
      background var(--d-state) var(--ease-out),
      box-shadow var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out),
      opacity var(--d-state) var(--ease-out),
      transform var(--d-state) var(--ease-out);
  }

  .btn[data-size='sm'] {
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    font-size: var(--t-sm);
  }

  /* A KEY CAP ASKS FOR A LITTLE LESS ROOM AT ITS END, so the cap sits in the curve the way the label sits in the other. */
  .btn:has(.btn-kbd) {
    padding-inline-end: var(--sp-2);
  }

  .btn:active:not(:disabled) {
    background: var(--hold-wash);
  }

  /* QUIET INSIDE A TILE, A SHEET OR THE PANEL'S BODY IS THE `--s1` PILL: the wash is ink over whatever is under it,
     which on white reads as a stain rather than a control. */
  :global(:is(.tile, .sheet, [data-surface='tile'])) .btn[data-weight='quiet'] {
    background: var(--s1);
  }

  /* Ink with the tile's colour for its label, the one filled control on a screen. */
  .btn[data-weight='primary'] {
    background: var(--ink);
    color: var(--on-ink);
  }

  .btn[data-weight='primary']:active:not(:disabled) {
    background: var(--primary-hover);
  }

  .btn[data-weight='bare'] {
    background: none;
    color: var(--ink2);
  }

  /* GLASS, FOR THE TOOLBAR AND NOTHING ELSE: the frosted fill, its blur, and the hairline pair. Glass never sits on
     glass, so a caller inside a menu or the palette uses `bare`. */
  .btn[data-weight='glass'] {
    background: var(--glass);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-edge);
  }

  .btn[data-weight='glass']:active:not(:disabled) {
    background: var(--glass-strong);
  }

  /* HOVER ONLY WHERE THERE IS ONE. A phone reports `:hover` on the last thing tapped and keeps it.

     `:active` IS LEFT OUT because this block comes after the press rule above, and under a mouse a pressed button is
     also a hovered one. */
  @media (hover: hover) and (pointer: fine) {
    .btn:hover:not(:disabled):not(:active) {
      background: var(--hold-wash);
    }

    :global(:is(.tile, .sheet, [data-surface='tile'])) .btn[data-weight='quiet']:hover:not(:disabled):not(:active) {
      background: var(--s2);
    }

    .btn[data-weight='primary']:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    .btn[data-weight='bare']:hover:not(:disabled):not(:active) {
      background: var(--hover-wash);
      color: var(--ink);
    }

    .btn[data-weight='glass']:hover:not(:disabled):not(:active) {
      background: var(--glass-strong);
    }
  }

  /* THE CAP. `Kbd` draws the `--s1` cap; on the ink pill it takes a tint of the label instead, or a light cap on a
     dark pill would be the loudest thing in the button. */
  .btn-kbd {
    display: inline-flex;
    flex: none;
  }

  .btn[data-weight='primary'] :global(.kbd) {
    background: color-mix(in srgb, var(--on-ink) 18%, transparent);
    color: var(--on-ink);
  }

  /* A disabled control loses the fill as well as the label, so a disabled primary does not read as live. */
  .btn:disabled {
    color: var(--dim);
    cursor: not-allowed;
  }

  .btn[data-weight='primary']:disabled {
    background: var(--s2);
    color: var(--dim);
  }

  /* AND ITS KEY CAP GOES QUIET WITH IT: the on-ink cap on the grey fill was a cap nobody could see. */
  .btn[data-weight='primary']:disabled :global(.kbd) {
    background: var(--hover-wash);
    color: var(--dim);
  }

  .btn[data-weight='bare']:disabled {
    background: none;
  }

  @media (pointer: coarse) {
    .btn {
      font-size: var(--t-md);
    }
  }

  @media (forced-colors: active) {
    .btn {
      border: 1px solid ButtonText;
    }
  }
</style>
