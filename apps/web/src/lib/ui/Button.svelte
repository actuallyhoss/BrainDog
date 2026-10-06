<!--
  One control, three weights, and every one of them a rectangle (DIRECTION §39).

  PRIMARY is the working accent's fill with `--on-action` for its label, one per screen. QUIET, the default, is the
  secondary: the quiet `--field` fill with ink words, the same on a tile and on the board. BARE is the tertiary, words in
  `--ink2` that take the wash when pointed at. GLASS is kept as a name for the toolbar's callers and draws as QUIET:
  there is no glass any more.

  Radius `--r-ctl` (8), `--btn-h` tall (32, 40 under a thumb with the 44 hit box `.tap` adds), 14 medium.

  THERE IS NO RED FILL. `tone` still reaches the element as `data-intent`, so a gate or a test can read what the verb
  is, but it colours nothing: a destructive verb says what it costs in its words ("Accept, can't be undone easily"), and
  red means "late" or "needs you" and nothing else.

  `kbd` draws the key cap inside the button at its trailing edge (Geist Mono 12, an 18px cap), so the fast path is
  printed on the slow one. It is hidden from a screen reader, which already has the verb.

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
    /** `m` is `--btn-h` (32, 40 under a thumb); `sm` is `--btn-h-sm` (28) for a row's verbs and a heading's. */
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
  /* A RECTANGLE TOLD BY ITS FILL: no border on any weight, radius 8, the label at 14 medium. */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: var(--field);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 20px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    /* OPACITY AND TRANSFORM TOO. The press in `controls.css` dims and scales a button, and with neither property listed
       here both snapped. */
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out),
      opacity var(--d-state) var(--ease-out),
      transform var(--d-state) var(--ease-out);
  }

  .btn[data-size='sm'] {
    min-block-size: var(--btn-h-sm);
    padding: 0 10px;
    font-size: var(--fs-meta);
  }

  /* A KEY CAP ASKS FOR A LITTLE LESS ROOM AT ITS END, so the cap sits in the corner the way the label sits in the other. */
  .btn:is(:hover, :focus-visible):has(.btn-kbd) {
    padding-inline-end: var(--sp-2);
  }

  /* THE CAP SHOWS ON HOVER OR FOCUS ONLY (DIRECTION 35): a key hint is for the person reaching for it, not chrome at rest. */
  .btn:not(:hover, :focus-visible) > .btn-kbd {
    display: none;
  }

  .btn:active:not(:disabled) {
    background: var(--field-hover);
  }

  /* THE ACCENT'S FILL, the one filled control on a screen. */
  .btn[data-weight='primary'] {
    background: var(--action);
    color: var(--on-action);
  }

  .btn[data-weight='primary']:active:not(:disabled) {
    background: var(--action-hover);
  }

  .btn[data-weight='bare'] {
    background: none;
    color: var(--ink2);
  }

  /* HOVER ONLY WHERE THERE IS ONE. A phone reports `:hover` on the last thing tapped and keeps it.

     `:active` IS LEFT OUT because this block comes after the press rule above, and under a mouse a pressed button is
     also a hovered one. */
  @media (hover: hover) and (pointer: fine) {
    .btn:hover:not(:disabled):not(:active) {
      background: var(--field-hover);
    }

    .btn[data-weight='primary']:hover:not(:disabled) {
      background: var(--action-hover);
    }

    .btn[data-weight='bare']:hover:not(:disabled):not(:active) {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* THE CAP. `Kbd` draws the `--field` cap; on the accent fill it takes a tint of the label instead, or a light cap on
     a blue button would be the loudest thing in it. */
  .btn-kbd {
    display: inline-flex;
    flex: none;
  }

  .btn[data-weight='primary'] :global(.kbd) {
    background: color-mix(in srgb, var(--on-action) 20%, transparent);
    color: var(--on-action);
  }

  /* A disabled control loses the fill as well as the label, so a disabled primary does not read as live. */
  .btn:disabled {
    color: var(--dim);
    cursor: not-allowed;
  }

  .btn[data-weight='primary']:disabled {
    background: var(--field);
    color: var(--dim);
  }

  /* AND ITS KEY CAP GOES QUIET WITH IT: the on-accent cap on the grey fill was a cap nobody could see. */
  .btn[data-weight='primary']:disabled :global(.kbd) {
    background: var(--hover-wash);
    color: var(--dim);
  }

  .btn[data-weight='bare']:disabled {
    background: none;
  }

  /* 15 UNDER A THUMB, a step up from the mouse's 14, on the 40px drawing inside the 44 hit box. */
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
