<!--
  One control, three weights, and every one of them a pill (design D-2: the pill is the shape of
  what you press).

  Primary is an ink pill with ground text, the one filled control on a screen. Quiet, the default,
  is the secondary: a pill drawn by its `--edge` border with nothing inside. Bare is text in `--ink2`
  with no border, and a wash when a mouse points at it. `tone` colours the label; a destructive primary
  (`weight="primary" tone="bad"`) is the one filled in `--danger-fill`, and it belongs only inside
  the confirm that does the destroying. No accent anywhere: it lives on the mark, the record tile,
  /start, /signin and text selection (design D-1).

  The invisible hit box is `.tap`: targets are designed at 44 x 44 CSS px on BOTH axes, counting
  `::before`, because a chevron drawn as a 20px glyph inside a 44px box is a 20px target if the
  pseudo-element is what takes the pointer (13 §7).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { at } from '../at.ts';

  let {
    weight = 'quiet',
    href,
    type = 'button',
    tone,
    disabled,
    onclick,
    children,
    ...rest
  }: {
    weight?: 'primary' | 'quiet' | 'bare' | undefined;
    href?: string | undefined;
    type?: 'button' | 'submit' | undefined;
    tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
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
  href={to}
  type={href ? undefined : type}
  disabled={href ? undefined : disabled}
  {onclick}
  {...rest}
>
  {@render children()}
</svelte:element>

<style>
  /* THE LABEL IS THE CONTROL SIZE: 14 under a mouse, 16 under a thumb (design DSN-2). It was 13,
     a step under the field beside it, which made every verb read as a caption. The pill needs more
     room at its ends than a rectangle did, or the label sits in the curve. */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: transparent;
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    /* OPACITY AND TRANSFORM TOO. The press in `controls.css` dims and scales a button, and with
       neither property listed here both snapped: the press arrived and left in one frame. */
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out),
      opacity var(--d-state) var(--ease-out),
      transform var(--d-state) var(--ease-out);
  }

  .btn:active:not(:disabled) {
    background: var(--hold-wash);
  }

  /* Ink on the ground colour, the one filled control on a screen. */
  .btn[data-weight='primary'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .btn[data-weight='primary']:active:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .btn[data-weight='bare'] {
    background: none;
    border-color: transparent;
    color: var(--ink2);
  }

  /* THE LABEL SAYS THE INTENT, ON EVERY WEIGHT. A destructive verb is `--danger` text at rest
     (design §6.4), where it was `--ink2` until it was pointed at, so a phone, which has no pointing,
     never saw it. */
  .btn[data-intent] {
    color: var(--tone);
  }

  /* A PRIMARY KEEPS ITS GROUND LABEL WHATEVER ITS INTENT, and only destruction fills in its own
     colour. `--bg` rather than the accent's white on the danger fill, because the ground is dark in
     the dark scheme and light in the light one. The theme holds `--danger-fill` at 3:1 against the
     ground as a fill (check D), which is a floor for a shape and not for a label, so the label's
     own 4.5:1 is owed a measurement whenever the palette is regenerated.

     HOVER AND PRESS STEP TOWARD THE INK AND NEVER TOWARD THE GROUND. The label IS the ground, so a
     fill mixed toward `--bg` walks toward its own label and loses contrast at the moment somebody
     is about to press it; toward `--ink` it gains in both schemes. */
  .btn[data-weight='primary'][data-intent] {
    color: var(--bg);
  }

  .btn[data-weight='primary'][data-intent='bad'] {
    background: var(--danger-fill);
    border-color: var(--danger-fill);
  }

  .btn[data-weight='primary'][data-intent='bad']:active:not(:disabled) {
    background: color-mix(in srgb, var(--danger-fill) 88%, var(--ink));
    border-color: color-mix(in srgb, var(--danger-fill) 88%, var(--ink));
  }

  /* HOVER ONLY WHERE THERE IS ONE. A phone reports `:hover` on the last thing tapped and keeps it,
     so a button answered a tap by staying washed after the finger had gone.

     `:active` IS LEFT OUT because this block comes after the press rule above, and under a mouse a
     pressed button is also a hovered one: without it the lighter hover wash won on source order and
     a quiet button showed no held wash while it was pressed. */
  @media (hover: hover) and (pointer: fine) {
    .btn:hover:not(:disabled):not(:active) {
      background: var(--hover-wash);
    }

    .btn[data-weight='primary']:hover:not(:disabled) {
      background: var(--primary-hover);
      border-color: var(--primary-hover);
    }

    .btn[data-weight='primary'][data-intent='bad']:hover:not(:disabled) {
      background: color-mix(in srgb, var(--danger-fill) 88%, var(--ink));
      border-color: color-mix(in srgb, var(--danger-fill) 88%, var(--ink));
    }

    .btn[data-weight='bare']:hover:not(:disabled) {
      color: var(--ink);
    }

    .btn[data-weight='bare'][data-intent]:hover:not(:disabled) {
      background: var(--tone-wash);
      color: var(--tone);
    }
  }

  .btn[data-weight='bare'][data-intent]:focus-visible {
    background: var(--tone-wash);
  }

  /* A disabled control loses the fill as well as the label, so a disabled primary does not read as live. */
  .btn:disabled {
    background: transparent;
    border-color: var(--line);
    color: var(--dim);
    cursor: not-allowed;
  }

  .btn[data-weight='primary']:disabled {
    background: var(--s2);
    border-color: var(--line);
    color: var(--dim);
  }

  /* A DISABLED GHOST STAYS A GHOST. The rule above gave it a box, so on People the one Remove you
     cannot press (your own) was the only one drawn as a button, and the loudest control in its
     row. It keeps the dim label and nothing else. */
  .btn[data-weight='bare']:disabled {
    background: none;
    border-color: transparent;
  }

  @media (pointer: coarse) {
    .btn {
      font-size: var(--t-md);
    }
  }
</style>
