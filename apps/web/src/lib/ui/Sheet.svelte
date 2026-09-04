<!--
  A `<dialog>`: a 480px drawer above 900px, a sheet on a phone.

  Its body is `88dvh − var(--kb)`, where `--kb` is the virtual keyboard's height read from
  `visualViewport`, so the active field is not underneath the keyboard. `lockScroll` is a counter,
  and Esc closes ONE layer per press and stops rather than falling through (19 §4).

  Open is longer than close, always: a panel opens in 280ms and closes in 160ms. Opening is
  something you watch; closing is something you have already decided about (13 §9).
-->
<script lang="ts">
  import { copy } from '../copy.ts';
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
    open?: boolean | undefined;
    title: string;
    subtitle?: string | undefined;
    id?: string | undefined;
    /** For a caller whose open state is derived from something else — a peeked row's seq, say. */
    onclose?: (() => void) | undefined;
    children: Snippet;
    footer?: Snippet | undefined;
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

  /**
   * Click the backdrop to close.
   *
   * A modal `<dialog>` does not do this on its own, and the absence reads as the app being stuck:
   * the surface behind is visibly dimmed and visibly inert, so the first thing anybody tries is
   * clicking it, and nothing happening is the only feedback they get. Esc has always worked, which
   * is exactly why this went unnoticed by whoever wrote it.
   *
   * The test is GEOMETRY, not `e.target === el`. A click on the dialog's own padding also targets
   * the dialog, so identity would close the panel when somebody clicks the gap beside its title.
   * `e.detail > 0` keeps real pointer clicks only: activating a button with the keyboard dispatches
   * a click whose coordinates are (0, 0), which is outside every rect on screen.
   */
  function onbackdrop(e: MouseEvent) {
    if (!el || e.detail === 0) return;
    const r = el.getBoundingClientRect();
    const outside =
      e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) close();
  }

</script>

<dialog bind:this={el} class="sheet" onclick={onbackdrop} oncancel={(e) => (e.preventDefault(), close())} onclose={close}>
  <header class="sheet-head">
    <div>
      <h2 class="sheet-title">
        {title}
        {#if id}<span class="sheet-id">{id}</span>{/if}
      </h2>
      {#if subtitle}<p class="sheet-sub">{subtitle}</p>{/if}
    </div>
    <button type="button" class="sheet-close tap" onclick={close} aria-label={copy.close}>
      <Icon name="close" size="m" />
    </button>
  </header>

  <!-- `tabindex="0"` because this is the scrolling box, and a scrolling box that a keyboard cannot
       reach is content a keyboard cannot read. The sheet that proved it was the KEYMAP: forty
       bindings, all of them text and `kbd`, not one focusable node in the whole panel — so the one
       surface in the product whose entire subject is the keyboard could not be scrolled with one.
       Sheets that are full of fields never showed the bug, because their fields carry the focus
       that scrolls the box for free. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="sheet-body" tabindex="0">{@render children()}</div>

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
    /* EXPLICIT, because `inset-block: 0` is not enough. The UA stylesheet gives `<dialog>` a
       `height: fit-content`, which beats the stretch the two insets ask for — so the drawer was
       hanging from the top-right corner at the height of whatever was in it, ending mid-page with
       the table still visible underneath. A drawer that covers a corner is a popover in the wrong
       place.

       BOTH properties, and the second one is not redundant. The UA also sets
       `max-height: calc(100% - 6px - 2em)`, which clamps a 900px viewport to 864 and leaves a
       36-pixel strip of the page showing under the drawer — measured, not guessed. */
    block-size: 100dvh;
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

  /* NO `opacity: 0` IN THE START STATE, and this is a failure-mode decision rather than a taste one.
     
     Measured: `getAnimations()` on this dialog reported `playState: running` with an unresolved
     start time for up to 900ms after `showModal()` — a CSS animation stays pending until its first
     rendered frame, and a dialog entering the top layer with forty rows of content inside it can
     wait a while for one. With `opacity: 0` in the `from`, that pause is a second of nothing where
     the reader asked for a panel.
     
     A stalled slide is a panel 24px to the right of where it belongs. A stalled fade is no panel.
     Whatever the start state is, it has to be a state somebody could read. */
  @keyframes slide-in {
    from {
      transform: translateX(24px);
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
      }
    }
  }
</style>
