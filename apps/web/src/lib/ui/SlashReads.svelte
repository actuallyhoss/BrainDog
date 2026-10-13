<!--
  Whether Slash reads on its own, and what a model is sent when it does (`slashReads`, ENG-A09).

  ONE PARAGRAPH AND ONE SWITCH, in Settings beside the daily look. The paragraph says what on and off mean, what is sent
  (the fields a job needs), to whom, and what never is; the switch is the owner's, in a browser. For anyone the record
  refuses, on the sample, and on a host built before the call, nothing is drawn: there is no choice to offer.

  A TILE WITH NO FIGURE, as `SlashDaily` is: a control and what it means. The switch sits at the end of the tile's
  heading, where a tile's own control goes, and the paragraph is the body.

  TO WHOM IS READ FROM THE HOST: whether it has a model (`page.data.slash`) and how Slash is run on this record
  (`slashStatus`). The words and the rules are `slash-reads.ts`, which the tests hold.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { SlashClient } from '$lib/record/slash.ts';
  import { hostOf, readReads, readsSaid, setReads, words, type Reads } from '$lib/record/slash-reads.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';

  let client: SlashClient | null = null;
  let read = $state<Reads | null>(null);
  let tier = $state<string | null>(null);
  let busy = $state(false);

  /* A CONSTANT, SO THE HEADING'S SNIPPET KEEPS THE `{#if shown}` AROUND IT, as `SlashDaily` has it. */
  const shown = $derived(read);
  const modelHere = $derived(page.data.slash === true);
  const host = $derived(hostOf(modelHere, tier));

  onMount(() => {
    if (!page.data.live) return;
    const made = createClient({ base: apiBase() });
    client = made as unknown as SlashClient;
    void readReads(client).then((out) => {
      if (out.ok) read = out.reads;
    });
    /* A REFUSAL OR A HOST WITHOUT THE READ LEAVES THE SENTENCE POINTING AT THE SETTING ABOVE, never at a guess. */
    if (page.data.slash === true)
      void made
        .slashStatus()
        .then((out) => {
          if (out.ok) tier = out.value.tier;
        })
        .catch(() => {});
  });

  async function flip() {
    if (!client || !shown || busy) return;
    busy = true;
    try {
      const out = await setReads(client, !shown.on);
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'bad' });
        return;
      }
      read = out.reads;
      toasts.push(out.said);
    } finally {
      busy = false;
    }
  }
</script>

{#if shown}
  <Tile icon="eye" title={words.title} data-part="slash-reads">
    {#snippet actions()}
      <button
        type="button"
        class="switch"
        role="switch"
        aria-checked={shown.on}
        aria-label={words.switch}
        aria-describedby="slash-reads-said"
        disabled={busy}
        onclick={flip}><span class="switch-track"></span></button
      >
    {/snippet}
    <p class="slash-reads-said" id="slash-reads-said">{readsSaid(shown, host)}</p>
  </Tile>
{/if}

<style>
  /* THE PARAGRAPH IS THE TILE'S BODY, at the body size in the second ink, kept to the measure. */
  .slash-reads-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 22px;
  }

  /* A RECTANGLE SWITCH. The shared switch (`controls.css`) rounds its track and thumb fully; here both take a
     rectangle's corners, the thumb two under the track's so the gap between them stays even. Colour, size, travel and
     the right-to-left turn are the shared ones. */
  .switch-track {
    border-radius: 6px;
  }

  .switch-track::after {
    border-radius: 4px;
  }
</style>
