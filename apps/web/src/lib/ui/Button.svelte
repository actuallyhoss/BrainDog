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
    /* A PILL. A 6px corner made every control a cell in a form; a capsule is the shape of one thing
       you can press, and it is the shape the reference product gives every action it has. */
    border-radius: var(--r-pill);
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

  /* The primary control is the ACCENT, and it used to be the mark's red. A red primary on every
     screen read as an alarm; the logo keeps the red and the one filled control on a screen takes
     the indigo, which says "this is the thing to press" without saying "something is wrong". */
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
    background: var(--hover-wash);
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

  /* AND IT ARRIVES AS THE WASH, NOT AS THE LABEL. This rule set `color: var(--tone)` on top of its
     own `--tone-wash`, which is the same hue at 12%: a colour asked to be read against a dilution
     of itself. Measured, `danger` on `--tone-wash`: 4.10:1 over `--bg` in light, 3.83 over
     `--sunk`, 3.82 over `--s3` in dark, against a body floor of 4.5. A bare button lands on
     whatever surface its screen uses, so all five of them count.

     The tint is not a weaker version of the same message, it is the other channel. `Chip.svelte`
     hit the identical pair an hour ago and `blocks.css:1030` before that, and both answered by
     keeping the surface and dropping the ink. `--ink2` here measures 5.98 at its worst across the
     four palettes; `--tone` with the wash removed would be 4.51, which is check G's floor plus
     0.01 and not a margin worth shipping a red word for. */
  .btn[data-weight='bare'][data-intent]:hover:not(:disabled),
  .btn[data-weight='bare'][data-intent]:focus-visible {
    background: var(--tone-wash);
  }

  /**
   * A DISABLED CONTROL LOSES THE FILL, not just the label.
   *
   * IT ONLY DIMMED THE TEXT, so a disabled `primary` kept the accent fill, the loudest thing on
   * any screen in this product — and wore grey letters on it. Two costs, and the second is the
   * serious one: `--dim` on `--accent` is about 2.2:1, under half of `23 §6`'s floor, so the label
   * of the one control somebody is looking for was the least readable text on the screen. It also
   * read as live, which is the whole of what a disabled state is for.
   *
   * `background` AND `box-shadow` BOTH, because the primary weight sets an inset edge as well as a
   * fill and leaving it behind draws a lit rim around an inert control.
   */
  .btn:disabled {
    background: var(--s1);
    /* `--edge` IS THE STRONG BOUNDARY — 3:1 against the worst surface, solved to be SEEN. Using it
       here gave the disabled control a darker outline than an enabled secondary has (`--line`, at
       1.55:1), so the dead button was the more prominent of the two. `--line` is the quiet one, and
       quiet is the whole point. */
    border-color: var(--line);
    box-shadow: none;
    color: var(--dim);
    cursor: not-allowed;
  }
</style>
