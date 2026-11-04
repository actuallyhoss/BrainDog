<!--
  Whether Slash looks once a day on its own (`slashDaily`).

  ONE SENTENCE AND ONE SWITCH, on /slash and in Settings. The sentence says what on and off mean and when Slash last looked;
  the switch is the owner's, in a browser. On a record the caller does not own, or on the sample, nothing is drawn: there is
  no choice to offer.

  A TILE WITH NO FIGURE: it holds a control and what it means, not a number, so it has no
  chart. The switch sits at the end of the tile's heading, where a tile's own control goes, and the sentence is the body.

  `daily` is handed in where the page has already read Slash; otherwise it is read here.

  AND THE BRAKE IN ONE LINE UNDER THE SENTENCE, muted, when his answers have made Slash ask less
  (`slash-brake.ts`); off, or not read, nothing. Read where Slash is, on a live record and never the sample. Words only:
  nothing here lifts it.
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { dailySaid, readSlash, setDaily, words, type Daily, type SlashClient } from '$lib/record/slash.ts';
  import { brakeLine, readBrake } from '$lib/record/slash-brake.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';

  /* `row`: one switch row inside Settings' Slash tile (UI pass 20 Oct, agents F21) rather than a tile of its own. */
  let { daily = null, link = false, row = false }: { daily?: Daily | null; link?: boolean; row?: boolean } = $props();

  let client: SlashClient | null = null;
  let read = $state<Daily | null>(null);
  let busy = $state(false);
  let braked = $state<string | null>(null);
  const shown = $derived(read ?? daily);

  onMount(() => {
    if (!page.data.live) return;
    client = createClient({ base: apiBase() }) as unknown as SlashClient;
    if (daily === null)
      void readSlash(client).then((out) => {
        if (out.ok && out.reading.daily) read = out.reading.daily;
      });
    void readBrake(client).then((brake) => (braked = brakeLine(brake)));
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

{#snippet toggle(on: boolean)}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={on}
    aria-label={words.dailySwitch}
    aria-describedby="slash-daily-said"
    disabled={busy}
    onclick={flip}><span class="switch-track"></span></button
  >
{/snippet}

{#snippet body(on: Daily)}
  <p class={row ? 'switch-row-line' : 'slash-daily-said'} id="slash-daily-said">{dailySaid(on)}</p>
  {#if braked}<p class="slash-daily-brake" data-part="slash-brake">{braked}</p>{/if}
  {#if link}<a class="slash-daily-link tap" href={at('/slash?history')}>{words.dailyMore}<Icon name="arrow" size="s" /></a>{/if}
{/snippet}

{#if shown}
  {#if row}
    <!-- ONE SWITCH ROW (`settings.css` `.switch-row`): the title and the sentence, the switch at the tile's end. -->
    <div class="switch-row" data-part="slash-daily">
      <div class="switch-row-words">
        <span class="switch-row-title">{words.dailyTitle}</span>
        {@render body(shown)}
      </div>
      {@render toggle(shown.on)}
    </div>
  {:else}
    <Tile icon="clock" title={words.dailyTitle} data-part="slash-daily">
      {#snippet actions()}{@render toggle(shown.on)}{/snippet}
      {@render body(shown)}
    </Tile>
  {/if}
{/if}

<style>
  /* THE SENTENCE IS THE TILE'S BODY, at the body size in the second ink, kept to the measure. */
  .slash-daily-said {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
  }

  /* THE BRAKE'S LINE, under the sentence and quieter than it: the dim ink, the same size, the same measure. */
  .slash-daily-brake {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
  }

  /* THE WAY ON, a link word with its arrow, as a tile's heading draws one. */
  .slash-daily-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
