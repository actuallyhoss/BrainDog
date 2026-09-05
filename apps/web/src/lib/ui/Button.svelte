<!--
  One control, three weights.

  Every filled control carries a 1px border, and it is not decoration: SC 1.4.11 asks for 3:1 on a
  component's visual boundary, and an accent fill cannot be guaranteed it — measured on the house
  palette, `accent` is 2.88:1 against `s3` in dark and `accent-press` is 1.88:1.

  That border used to be drawn here as `color-mix(in srgb, var(--accent) 72%, var(--sunk))`, which
  made the boundary the failing part: 1.91:1 against `s3` in dark at rest and 1.33:1 on hover. The
  theme now solves `--accent-edge` against the worst surface in the accent's own hue, and check D
  holds it to the same floor as `edge`. It is legal by construction rather than by assertion.

  The invisible hit box is `.tap`: targets are designed at 44 x 44 CSS px on BOTH axes, counting
  `::before`, because a chevron drawn as a 20px glyph inside a 44px box is a 20px target if the
  pseudo-element is what takes the pointer (13 §7).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

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
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  class="btn tap"
  data-weight={weight}
  data-intent={tone}
  {href}
  type={href ? undefined : type}
  disabled={href ? undefined : disabled}
  {onclick}
  {...rest}
>
  {@render children()}
</svelte:element>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    /* One pixel of shade under the bottom edge — not a drop shadow, which would put the control on
       a different plane from the flat cards around it, but enough that a button reads as a thing
       you press rather than as a rectangle with a border. It inverts on :active, which is the whole
       reason it is worth a line: the control visibly goes down. */
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--ink) 12%, transparent);
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .btn:hover:not(:disabled) {
    background: var(--s2);
    border-color: var(--edge);
  }

  .btn:active:not(:disabled) {
    transition-duration: var(--d-press);
    background: var(--s1);
    box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--ink) 12%, transparent);
  }

  /* The primary control is the MARK'S OWN COLOUR. There is no second brand red and no tint of it:
     the one loud thing on a screen is the thing the product is called. */
  .btn[data-weight='primary'] {
    background: var(--accent);
    border-color: var(--accent-edge);
    box-shadow: inset 0 -1px 0 0 var(--accent-edge);
    color: var(--accent-ink);
  }

  /* THE THEME SOLVES THESE, this file does not mix them. Mixing the accent with `--sunk` is one
     formula that does opposite things in the two schemes — `sunk` is a pale surface in light and a
     dark one in dark — so it lightened the button under its white label in light and darkened it in
     dark. Measured: 4.16 against the label in light, which is a control failing AA at the moment
     somebody is about to press it, in one scheme only. `--accent-hover` and `--accent-press` step
     away from the label in whichever direction that is, and are checked when they are generated. */
  .btn[data-weight='primary']:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn[data-weight='primary']:active:not(:disabled) {
    background: var(--accent-press);
    box-shadow: inset 0 1px 0 0 var(--accent-edge);
  }

  .btn[data-weight='bare'] {
    background: none;
    border-color: transparent;
    box-shadow: none;
    color: var(--ink2);
  }

  .btn[data-weight='bare']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .btn[data-intent] {
    color: var(--tone);
    border-color: color-mix(in srgb, var(--tone) 50%, var(--edge));
  }

  /* A bare control stays bare when it carries an intent. Otherwise a pair of adjacent bare buttons
     comes out as one bare and one boxed, which reads as two different kinds of thing.

     AND IT STAYS QUIET UNTIL IT IS TOUCHED. A destructive bare action is a link — "Uninstall",
     "Archive", "Remove" — and there are usually several on a screen at once: five pack cards put
     five red words in a grid, which is a colour-noise problem rather than a safety one, because
     nobody is about to click any of them. Red belongs on the CONFIRMATION, which is a filled button
     and keeps its colour throughout. Here the intent arrives on hover and focus, at the moment the
     control is actually the subject of attention. */
  .btn[data-weight='bare'][data-intent] {
    border-color: transparent;
    color: var(--ink2);
  }

  .btn[data-weight='bare'][data-intent]:hover:not(:disabled),
  .btn[data-weight='bare'][data-intent]:focus-visible {
    background: color-mix(in srgb, var(--tone) 12%, transparent);
    color: var(--tone);
  }

  .btn:disabled {
    color: var(--dim);
    cursor: not-allowed;
  }
</style>
