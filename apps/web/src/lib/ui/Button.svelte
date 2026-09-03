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
    weight?: 'primary' | 'quiet' | 'bare';
    href?: string;
    type?: 'button' | 'submit';
    tone?: 'good' | 'warn' | 'bad' | 'info';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
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
    background: var(--s2);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .btn:hover:not(:disabled) {
    background: var(--s3);
  }

  .btn:active:not(:disabled) {
    transition-duration: var(--d-press);
    background: var(--s1);
  }

  .btn[data-weight='primary'] {
    background: var(--accent);
    border-color: var(--edge);
    color: var(--accent-ink);
  }

  .btn[data-weight='primary']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 88%, var(--ink));
  }

  .btn[data-weight='bare'] {
    background: none;
    border-color: transparent;
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
