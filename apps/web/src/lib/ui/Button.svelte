<!--
  One control, three weights.

  Every filled control carries a 1px `edge` border. That is not decoration: SC 1.4.11 asks for 3:1
  on a component's visual boundary, and an accent fill cannot be guaranteed 3:1 against every
  surface in every installed theme. The border makes the boundary legal by construction, so the
  theme generator does not have to constrain the accent's lightness to make it so.

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
    border-color: color-mix(in srgb, var(--accent) 72%, var(--sunk));
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
  }

  .btn[data-weight='primary']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 90%, var(--sunk));
    border-color: color-mix(in srgb, var(--accent) 58%, var(--sunk));
  }

  .btn[data-weight='primary']:active:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 82%, var(--sunk));
    box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
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
     comes out as one bare and one boxed, which reads as two different kinds of thing. */
  .btn[data-weight='bare'][data-intent] {
    border-color: transparent;
  }

  .btn[data-weight='bare'][data-intent]:hover:not(:disabled) {
    background: color-mix(in srgb, var(--tone) 12%, transparent);
  }

  .btn:disabled {
    color: var(--dim);
    cursor: not-allowed;
  }
</style>
