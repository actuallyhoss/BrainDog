<!--
  Below 900px the sidebar becomes a tab bar. Not a shrunken desktop.

  The declared nav CANNOT be a tab bar: it varies in length and the user reorders it. So the tab bar
  carries the SPINE and a sheet carries the data — Home · Decide · Inbox · More — with the palette as
  a header button rather than a fifth tab. A command surface in a tab slot looks like another place
  to go (19 §3).

  Safe-area insets are paid exactly once, on the fixed elements only. Paying twice is a real, easy bug.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';

  let { open = 0, inbox = 0, onmore }: { open?: number; inbox?: number; onmore?: () => void } = $props();

  const here = (href: string) => page.url.pathname === href;
</script>

<nav class="tabs" aria-label="Record">
  <a class="tab tap" href="/" aria-current={here('/') ? 'page' : undefined}>
    <Icon name="home" size="l" /><span>{copy.home}</span>
  </a>
  <a class="tab tap" href="/decide" aria-current={here('/decide') ? 'page' : undefined}>
    <span class="badge-slot">
      <Icon name="decide" size="l" />
      {#if open}<span class="badge" data-intent="warn">{open}</span>{/if}
    </span>
    <span>{copy.decide}</span>
  </a>
  <a class="tab tap" href="/inbox" aria-current={here('/inbox') ? 'page' : undefined}>
    <span class="badge-slot">
      <Icon name="inbox" size="l" />
      {#if inbox}<span class="badge">{inbox}</span>{/if}
    </span>
    <span>{copy.inbox}</span>
  </a>
  <button type="button" class="tab tap" onclick={onmore}>
    <Icon name="more" size="l" /><span>{copy.more}</span>
  </button>
</nav>

<style>
  .tabs {
    position: fixed;
    inset-block-end: 0;
    inset-inline: 0;
    z-index: var(--z-sheet);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: var(--sunk);
    border-block-start: 1px solid var(--line);
    padding-block-end: env(safe-area-inset-bottom);
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN AND THIS WAS DRAWN ON TOP OF IT: four dead targets
     over the keys somebody is using, and `--z-sheet` puts them above the sheet being typed into.
     There is no length that means "not on screen", which is why this reads the attribute rather
     than `--kb`: `a11y/keyboard.ts` sets `data-kb` for exactly the readers that have to disappear
     rather than move. */
  :global(html[data-kb]) .tabs {
    display: none;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-block-size: var(--tab-h);
    padding: var(--sp-1);
    border: 0;
    background: none;
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .tab[aria-current='page'] {
    color: var(--ink);
    box-shadow: inset 0 2px 0 0 var(--accent);
  }

  .badge-slot {
    position: relative;
  }

  .badge {
    position: absolute;
    inset-block-start: -5px;
    inset-inline-start: 11px;
    min-inline-size: 16px;
    padding: 0 4px;
    background: var(--tone-fill, var(--edge));
    border-radius: var(--r-pill);
    color: var(--accent-ink);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    text-align: center;
  }
</style>
