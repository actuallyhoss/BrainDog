<!--
  The bell, on the desk's bar and the phone's head alike: a dot when something happened, never a count, and its menu is
  what happened, with Activity at its foot. What was asked is Needs you's, not the bell's.

  SENT LEADS IT: what was handed to an agent and is still in flight (`send/SentTray.svelte`), fetched the first time the
  bell opens so none of it is on a screen's first load, and read only while the menu is open.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { happened } from './alerts.ts';
  import Icon from '../ui/Icon.svelte';
  import Menu from '../ui/Menu.svelte';
  import { frame } from './frame.svelte.ts';
  import type SentTrayView from '../send/SentTray.svelte';

  let { phone = false }: { phone?: boolean } = $props();

  const words = {
    arrivals: 'Arrivals',
    fresh: 'Something new arrived',
    none: 'Nothing new since you last looked',
    activity: 'All in Activity',
  } as const;

  const told = $derived(happened(frame.news));

  let open = $state(false);
  let SentTray = $state<typeof SentTrayView | null>(null);
  $effect(() => {
    if (open && SentTray === null) void import('../send/SentTray.svelte').then((m) => (SentTray = m.default));
  });
</script>

<div class="bell" data-phone={phone ? '' : undefined}>
  <Menu label={words.arrivals} align="end" bind:open>
    {#snippet trigger()}
      <span class="bell-face">
        <Icon name="bell" size={phone ? 'l' : 'm'} />
        {#if told.length > 0}<span class="bell-dot" aria-hidden="true"></span>{/if}
        <span class="sr-only">{told.length > 0 ? `${words.arrivals}. ${words.fresh}` : words.arrivals}</span>
      </span>
    {/snippet}
    {#if open && SentTray}<SentTray />{/if}
    {#each told.slice(0, 6) as n, i (i)}
      <a class="bell-mi bell-news" role="menuitem" href={at(n.href)}><span class="mi-name">{n.text}</span></a>
    {:else}
      <span class="bell-mi" role="menuitem" aria-disabled="true">{words.none}</span>
    {/each}
    <hr />
    <a class="bell-mi" role="menuitem" href={at('/audit')}><Icon name="activity" size="s" />{words.activity}</a>
  </Menu>
</div>

<style>
  .bell {
    flex: none;
  }

  /* THE RING FOLLOWS ITS SQUARE. */
  .bell :global(.menu-trigger) {
    border-radius: var(--r-ctl);
  }

  .bell-face {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    color: var(--ink-3);
  }

  .bell[data-phone] .bell-face {
    inline-size: var(--tap);
    block-size: var(--tap);
    color: var(--ink);
  }

  /* A DOT, NEVER A COUNT: something arrived, in the ink, cut out of the bell's ground by a ring of the nav. */
  .bell-dot {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-end: 6px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--ink);
    box-shadow: 0 0 0 2px var(--nav);
  }

  .bell[data-phone] .bell-dot {
    inset-block-start: 11px;
    inset-inline-end: 11px;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .bell-mi {
    color: var(--ink-2);
    text-decoration: none;
    cursor: pointer;
  }

  .bell-mi:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .bell-mi :global(.icon) {
    color: var(--ink-3);
  }

  /* AN ARRIVAL IS ONE LINE, its end cut. */
  .bell-news {
    max-inline-size: 360px;
  }

  .bell-news .mi-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
