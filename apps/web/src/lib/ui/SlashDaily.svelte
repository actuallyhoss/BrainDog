<!--
  Whether Slash looks once a day on its own (`slashDaily`, `loop/research-spark.md` S15).

  ONE SENTENCE AND ONE SWITCH, on /slash and in Settings. The sentence says what on and off mean and when Slash last looked;
  the switch is the owner's, in a browser. On a record the caller does not own, or on the sample, nothing is drawn: there is
  no choice to offer.

  A TILE WITH NO FIGURE (SYSTEM §6, SCREENS "Slash"): it holds a control and what it means, not a number, so it has no
  chart. The switch sits at the end of the tile's heading, where a tile's own control goes, and the sentence is the body.

  `daily` is handed in where the page has already read Slash; otherwise it is read here.
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { dailySaid, readSlash, setDaily, words, type Daily, type SlashClient } from '$lib/record/slash.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';

  let { daily = null, link = false }: { daily?: Daily | null; link?: boolean } = $props();

  let client: SlashClient | null = null;
  let read = $state<Daily | null>(null);
  let busy = $state(false);
  const shown = $derived(read ?? daily);

  onMount(() => {
    if (!page.data.live) return;
    client = createClient({ base: apiBase() }) as unknown as SlashClient;
    if (daily === null)
      void readSlash(client).then((out) => {
        if (out.ok && out.reading.daily) read = out.reading.daily;
      });
  });

  async function flip() {
    if (!client || !shown || busy) return;
    busy = true;
    try {
      const out = await setDaily(client, !shown.on);
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'bad' });
        return;
      }
      read = out.daily;
      toasts.push(out.said);
    } finally {
      busy = false;
    }
  }
</script>

{#if shown}
  <Tile icon="clock" title={words.dailyTitle} data-part="slash-daily">
    {#snippet actions()}
      <button
        type="button"
        class="switch"
        role="switch"
        aria-checked={shown.on}
        aria-label={words.dailySwitch}
        aria-describedby="slash-daily-said"
        disabled={busy}
        onclick={flip}><span class="switch-track"></span></button
      >
    {/snippet}
    <p class="slash-daily-said" id="slash-daily-said">{dailySaid(shown)}</p>
    {#if link}<a class="slash-daily-link tap" href={at('/slash')}>{words.dailyMore}<Icon name="arrow" size="s" /></a>{/if}
  </Tile>
{/if}

<style>
  /* THE SENTENCE IS THE TILE'S BODY, at the body size in the second ink, kept to the measure. */
  .slash-daily-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* THE WAY ON, a link word with its arrow, as a tile's heading draws one (SYSTEM §6). */
  .slash-daily-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .slash-daily-link:hover {
      color: var(--ink);
    }
  }
</style>
