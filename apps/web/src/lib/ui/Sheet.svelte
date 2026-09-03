<!--
  A `<dialog>`: a 480px drawer above 900px, a sheet on a phone.

  Its body is `88dvh − var(--kb)`, where `--kb` is the virtual keyboard's height read from
  `visualViewport`, so the active field is not underneath the keyboard. `lockScroll` is a counter,
  and Esc closes ONE layer per press and stops rather than falling through (19 §4).

  Open is longer than close, always: a panel opens in 280ms and closes in 160ms. Opening is
  something you watch; closing is something you have already decided about (13 §9).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { overlays } from '../a11y/keys.svelte.ts';
  import Icon from './Icon.svelte';

  let {
    open = $bindable(false),
    title,
    subtitle,
    id,
    onclose,
    children,
    footer,
  }: {
    open?: boolean;
    title: string;
    subtitle?: string;
    id?: string;
    /** For a caller whose open state is derived from something else — a peeked row's seq, say. */
    onclose?: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let el = $state<HTMLDialogElement>();

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      overlays.open();
    } else if (!open && el.open) {
      el.close();
      overlays.close();
    }
  });

  function close() {
    open = false;
    onclose?.();
  }
</script>

<dialog bind:this={el} class="sheet" oncancel={(e) => (e.preventDefault(), close())} onclose={close}>
  <header class="sheet-head">
    <div>
      <h2 class="sheet-title">
        {title}
        {#if id}<span class="sheet-id">{id}</span>{/if}
      </h2>
      {#if subtitle}<p class="sheet-sub">{subtitle}</p>{/if}
    </div>
    <button type="button" class="sheet-close tap" onclick={close} aria-label="Close">
      <Icon name="close" size="m" />
    </button>
  </header>

  <div class="sheet-body">{@render children()}</div>

  {#if footer}<footer class="sheet-foot">{@render footer()}</footer>{/if}
</dialog>

<style>
  .sheet {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    inset-inline-start: auto;
    z-index: var(--z-sheet);
    display: flex;
    flex-direction: column;
    inline-size: min(480px, 100vw);
    max-block-size: 100dvh;
    margin: 0;
    padding: 0;
    background: var(--s1);
    border: 0;
    border-inline-start: 1px solid var(--edge);
    color: var(--ink);
    box-shadow: var(--e3);
  }

  .sheet:not([open]) {
    display: none;
  }

  .sheet::backdrop {
    background: color-mix(in srgb, black 46%, transparent);
  }

  .sheet[open] {
    animation: slide-in var(--d-enter) var(--ease-spring);
  }

  @keyframes slide-in {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }

  .sheet-head {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-4) var(--sp-3);
    border-block-end: 1px solid var(--line);
  }

  .sheet-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--t-lg);
    letter-spacing: -0.02em;
  }

  .sheet-id {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .sheet-sub {
    margin-block-start: 2px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .sheet-close {
    margin-inline-start: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .sheet-close:hover {
    border-color: var(--line);
    color: var(--ink);
  }

  .sheet-body {
    flex: 1;
    padding: var(--sp-4);
    overflow-y: auto;
  }

  .sheet-foot {
    display: flex;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  @media (width < 640px) {
    .sheet {
      inset-block-start: auto;
      inset-inline: 0;
      inline-size: 100vw;
      block-size: calc(88dvh - var(--kb));
      border-inline-start: 0;
      border-block-start: 1px solid var(--edge);
      border-start-start-radius: var(--r-lg);
      border-start-end-radius: var(--r-lg);
      padding-block-end: env(safe-area-inset-bottom);
    }

    .sheet[open] {
      animation: rise var(--d-enter) var(--ease-spring);
    }

    @keyframes rise {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
  }
</style>
