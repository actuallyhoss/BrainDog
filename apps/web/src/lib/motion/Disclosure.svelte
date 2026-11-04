<!--
  A SECTION THAT OPENS BY ITS HEIGHT (ui pass, 1 Nov): a button that says what is inside, and the part under it, which
  grows from nothing to its own height over `--d-rows` on the way in and closes over `--d-exit` on the way out. For a
  section a page keeps shut until asked ("More", "Advanced", the settings of one item), where a native `<details>`
  will not do (the summary has to hold a button of its own, or the open state is the page's). A plain `<details>` gets
  the same motion from `motion.css` and needs nothing from here.

    <Disclosure label="Advanced" bind:open>
      …what opens…
    </Disclosure>

    <Disclosure bind:open>
      {#snippet summary()}<span>Keys</span><span class="num">4</span>{/snippet}
      …what opens…
    </Disclosure>

  HOW: the part sits in a one-row grid whose row goes from `0fr` to `1fr`, so the height is the content's own and
  nothing is measured. Shut, the part is `inert` and hidden from a reader once it has closed. Under reduced motion it
  opens and shuts at once. The button is a real button with `aria-expanded` and `aria-controls`, 44 tall on a phone.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../ui/Icon.svelte';

  let {
    open = $bindable(false),
    label,
    summary,
    children,
    id,
    class: cls = '',
    ontoggle,
  }: {
    /** Whether it is open; bindable. */
    open?: boolean;
    /** The button's words, where `summary` is not given. */
    label?: string;
    /** What the button holds, in place of `label`: the words and anything quiet beside them (a count). */
    summary?: Snippet;
    children: Snippet;
    /** The part's id, for `aria-controls`; one is made where none is given. */
    id?: string;
    class?: string;
    /** Told after each press, with the new state. */
    ontoggle?: (open: boolean) => void;
  } = $props();

  const own = `dis-${Math.random().toString(36).slice(2, 9)}`;
  const partId = $derived(id ?? own);

  function toggle(): void {
    open = !open;
    ontoggle?.(open);
  }
</script>

<div class="disclosure {cls}" data-open={open ? '' : undefined}>
  <button type="button" class="dis-button tap" aria-expanded={open} aria-controls={partId} onclick={toggle}>
    <span class="dis-chevron" aria-hidden="true"><Icon name="chevron" size="s" /></span>
    <span class="dis-summary">{#if summary}{@render summary()}{:else}{label}{/if}</span>
  </button>
  <div class="dis-part" id={partId} inert={!open} aria-hidden={!open}>
    <div class="dis-inner">{@render children()}</div>
  </div>
</div>

<style>
  .disclosure {
    display: grid;
    min-inline-size: 0;
  }

  .dis-button {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-align: start;
    cursor: pointer;
  }

  .dis-summary {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .dis-chevron {
    display: inline-grid;
    flex: none;
    place-items: center;
    color: var(--ink-3);
    transition: rotate var(--d-rows) var(--ease-out);
  }

  .disclosure[data-open] > .dis-button .dis-chevron {
    rotate: 90deg;
  }

  :global([dir='rtl']) .dis-chevron {
    scale: -1 1;
  }

  /* THE PART: a row that goes from nothing to its content's height. Shutting is quicker than opening and accelerates
     away; the content fades with it, so a half-shut part never shows cut-off words at full strength. */
  .dis-part {
    display: grid;
    grid-template-rows: 0fr;
    overflow: clip;
    opacity: 0;
    transition:
      grid-template-rows var(--d-exit) var(--ease-in),
      opacity var(--d-exit) var(--ease-in);
  }

  .disclosure[data-open] > .dis-part {
    grid-template-rows: 1fr;
    opacity: 1;
    transition:
      grid-template-rows var(--d-rows) var(--ease-out),
      opacity var(--d-rows) var(--ease-out);
  }

  /* 4px of room at each side, taken back by the margin, so a focus ring inside is not cut by the clip. */
  .dis-inner {
    min-block-size: 0;
    margin-inline: calc(-1 * var(--sp-1));
    padding: var(--sp-2) 4px 4px;
  }

  @media (width < 900px) {
    .dis-button {
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dis-part,
    .disclosure[data-open] > .dis-part,
    .dis-chevron {
      transition: none;
    }
  }
</style>
