<!--
  Whether Slash looks once a day on its own (`slashDaily`, `loop/research-spark.md` S15).

  ONE SENTENCE AND ONE SWITCH, on /slash and in Settings. The sentence says what on and off mean and when Slash last looked;
  the switch is the owner's, in a browser. On a record the caller does not own, or on the sample, nothing is drawn: there is
  no choice to offer.

  `daily` is handed in where the page has already read Slash; otherwise it is read here.
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { dailySaid, readSlash, setDaily, words, type Daily, type SlashClient } from '$lib/record/slash.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';

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
  <Section title={words.dailyTitle}>
    <div class="slash-daily">
      <p class="slash-daily-said" id="slash-daily-said">{dailySaid(shown)}</p>
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
    </div>
    {#if link}<a class="slash-daily-link tap" href={at('/slash')}>{words.dailyMore}</a>{/if}
  </Section>
{/if}

<style>
  /* THE SENTENCE AND ITS SWITCH ON ONE LINE, as every switch in Settings sits. */
  .slash-daily {
    display: grid;
    grid-template-columns: minmax(0, var(--measure)) auto;
    align-items: start;
    justify-content: start;
    gap: var(--sp-6);
  }

  .slash-daily-said {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .slash-daily :global(.switch) {
    margin-block-start: calc((1em * var(--lh-body) - var(--ctl-h)) / 2);
  }

  .slash-daily-link {
    display: inline-block;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-underline-offset: 3px;
  }
</style>
