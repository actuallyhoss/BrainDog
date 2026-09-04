<!--
  The toast stack, bottom-LEFT.

  Not bottom-right, and not centred. The launcher owns the bottom-right corner of every screen, and
  a toast that lands on top of it covers the one control that is on every surface; a centred toast
  covers the work. Bottom-left is the corner with nothing in it, on the side the eye returns to
  after reading a row.

  ONE live region for the whole stack, and it is `polite`. `role="alert"` for "archived
  obligations#4" interrupts whatever a screen-reader user was reading in order to tell them about
  something they just did (13 §7).
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import { toasts } from './toast.svelte.ts';

  /** The newest is nearest the corner, so the stack grows away from the thumb rather than under it. */
  const stack = $derived([...toasts.items].reverse());
</script>

<div
  class="stack"
  role="status"
  aria-live="polite"
  aria-label={copy.toasts}
  onmouseenter={() => toasts.hold()}
  onmouseleave={() => toasts.release()}
  onfocusin={() => toasts.hold()}
  onfocusout={() => toasts.release()}
>
  {#each stack as toast (toast.id)}
    <div class="toast" data-intent={toast.intent}>
      {#if toast.intent}<span class="dot" aria-hidden="true"></span>{/if}
      <span class="text">{toast.text}</span>
      {#if toast.undo}
        <button type="button" class="undo" onclick={() => toasts.run(toast.id)}>{copy.undo}</button>
      {/if}
      <button type="button" class="close" onclick={() => toasts.dismiss(toast.id)} aria-label={copy.close}>
        <Icon name="close" size="s" />
      </button>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    inset-block-end: var(--sp-5);
    inset-inline-start: calc(var(--rail) + var(--sp-5));
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: min(420px, calc(100vw - var(--sp-6)));
    pointer-events: none;
  }

  .stack > :global(*) {
    pointer-events: auto;
  }

  /* A toast is over the page, so it is one of the two things in the product allowed a shadow. It
     takes the RAISED surface and a full-strength edge rather than the accent: a report of something
     that already happened is not an alert, and the stack is often three deep. */
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
    color: var(--ink);
    font-size: var(--t-ui);
    animation: toast-in var(--d-enter) var(--ease-spring);
  }

  /* No `opacity: 0` in a start state — see Sheet.svelte. A toast that never fades in is still a
     toast; a toast stuck at zero opacity is a report nobody got. */
  @keyframes toast-in {
    from {
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }

  .dot {
    inline-size: 8px;
    block-size: 8px;
    flex: none;
    border-radius: 999px;
    background: var(--tone-fill, var(--edge));
  }

  .text {
    flex: 1;
    min-inline-size: 0;
  }

  /* The undo is the LOUD thing in the toast, because it is the only thing in it that does anything.
     A row of two grey links, one of which gives you your data back, weights them the same. */
  .undo {
    flex: none;
    min-block-size: 28px;
    padding: 0 var(--sp-3);
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--accent-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .undo:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: var(--accent);
  }

  .close {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    flex: none;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .close:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  /* No rail below 900px, and the tab bar owns the bottom edge. */
  @media (width < 900px) {
    .stack {
      inset-inline: var(--sp-3);
      inset-block-end: calc(56px + var(--sp-3));
      max-inline-size: none;
    }
  }
</style>
