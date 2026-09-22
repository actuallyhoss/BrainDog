<!--
  Below 900px the sidebar becomes a tab bar. Not a shrunken desktop.

  The declared nav CANNOT be a tab bar: it varies in length and the user reorders it. So the tab bar
  carries the SPINE and a sheet carries the data — Home · Decide · Inbox · More — with the palette as
  a header button rather than a fifth tab. A command surface in a tab slot looks like another place
  to go (19 §3).

  Safe-area insets are paid exactly once, on the fixed elements only. Paying twice is a real, easy bug.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { said } from '../voice.svelte.ts';
  import Icon from './Icon.svelte';

  let { open = 0, inbox = 0, onmore }: { open?: number; inbox?: number; onmore?: () => void } = $props();

  /* COMPARED INSIDE THE RECORD. `page.url` is the address as it came, `/app/acme/decide`, and these links are written
     `/decide`, so the comparison reads the address with the base and the slug taken off (`lib/at.ts`). */
  const here = (href: string) => inside(page.url.pathname) === href;
</script>

<nav class="tabs" aria-label="Record">
  <a class="tab tap" href={at('/')} aria-current={here('/') ? 'page' : undefined}>
    <Icon name="home" size="l" /><span>{said('home')}</span>
  </a>
  <a class="tab tap" href={at('/decide')} aria-current={here('/decide') ? 'page' : undefined}>
    <span class="badge-slot">
      <Icon name="decide" size="l" />
      {#if open}<span class="badge" data-intent="warn">{open}</span>{/if}
    </span>
    <span>{said('decide')}</span>
  </a>
  <a class="tab tap" href={at('/inbox')} aria-current={here('/inbox') ? 'page' : undefined}>
    <span class="badge-slot">
      <Icon name="inbox" size="l" />
      {#if inbox}<span class="badge">{inbox}</span>{/if}
    </span>
    <span>{said('inbox')}</span>
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

  /* Ink and an ink bar, so here is a shape as well as a shade, with no accent. */
  .tab[aria-current='page'] {
    color: var(--ink);
    box-shadow: inset 0 2px 0 0 var(--ink);
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
    /* A count, not a filled chip: the intent is the text colour on the bar's own ground. */
    background: var(--sunk);
    border-radius: var(--r-pill);
    color: var(--tone, var(--ink2));
    font-weight: 500;
    /* THE SCALE'S SMALLEST STEP, NOT A NUMBER. This was `10px`, which the type scale does not
       have and `52 §5.2`'s second rule forbids; it survived because that rule is not implemented
       (see `loop/finding-css-rules.md`). `--t-xs` is 12px, so the badge is 2px larger here, which
       is the correct direction for a count on a phone. */
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    text-align: center;
  }
</style>
