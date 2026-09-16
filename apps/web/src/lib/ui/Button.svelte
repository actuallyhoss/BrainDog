<!--
  One control, three weights.

  Primary is an ink fill, quiet is a raised surface with a hairline, bare is a ghost. No accent:
  the accent is kept for focus, selection, prose links and checked controls (DESIGN-BRIEF 4.1).

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
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    /* Never a pill; the pill is for count and status tags. */
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-sm);
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

  .btn:hover:not(:disabled) {
    background: var(--s2);
  }

  .btn:active:not(:disabled) {
    background: var(--s3);
  }

  /* Ink on the ground colour, the one filled control on a screen. */
  .btn[data-weight='primary'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .btn[data-weight='primary']:hover:not(:disabled),
  .btn[data-weight='primary']:active:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .btn[data-weight='bare'] {
    background: none;
    border-color: transparent;
    color: var(--ink2);
  }

  .btn[data-weight='bare']:hover:not(:disabled) {
    background: var(--s2);
    color: var(--ink);
  }

  .btn[data-intent] {
    color: var(--tone);
  }

  /* A bare control with an intent stays ink2 at rest; the intent arrives as a wash on hover and
     focus, where the reader is actually about to press it. */
  .btn[data-weight='bare'][data-intent] {
    color: var(--ink2);
  }

  .btn[data-weight='bare'][data-intent]:hover:not(:disabled),
  .btn[data-weight='bare'][data-intent]:focus-visible {
    background: var(--tone-wash);
  }

  /* A disabled control loses the fill as well as the label, so a disabled primary does not read as live. */
  .btn:disabled {
    background: var(--s1);
    border-color: var(--line);
    color: var(--dim);
    cursor: not-allowed;
  }

  /* A DISABLED GHOST STAYS A GHOST. The rule above gave it a box, so on People the one Remove you
     cannot press (your own) was the only one drawn as a button, and the loudest control in its
     row. It keeps the dim label and nothing else. */
  .btn[data-weight='bare']:disabled {
    background: none;
    border-color: transparent;
  }
</style>
