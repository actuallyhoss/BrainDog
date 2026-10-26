<!--
  "Agents may answer when you tell them" (Settings > Agents): one switch row, the owner's, in a tile of its own. What it
  means is `on-word.ts`; the record keeps it as the owner's `agents.answer_on_word` through `setPref`, which refuses
  anybody but an owner in a browser. On until he turns it off.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import { ON_WORD_PREF, onWordOn, onWordSaid, onWordWords as words } from './on-word.ts';

  let { prefs }: { prefs?: Record<string, unknown> | undefined } = $props();

  /** What the last press kept, over what `boot` answered. */
  let kept = $state<boolean | null>(null);
  let busy = $state(false);
  let refusal = $state('');
  const on = $derived(kept ?? onWordOn(prefs));

  async function flip(): Promise<void> {
    if (busy) return;
    const was = on;
    busy = true;
    refusal = '';
    kept = !was;
    const out = await createClient({ base: apiBase() })
      .setPref(ON_WORD_PREF, !was)
      .catch(() => null);
    busy = false;
    if (out?.ok) return;
    kept = was;
    refusal = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }
</script>

<Tile icon="session" title={words.tile} data-part="on-word">
  <div class="switch-row">
    <div class="switch-row-words">
      <span class="switch-row-title">{words.title}</span>
      <p class="switch-row-line" id="on-word-said">{onWordSaid(on)}</p>
    </div>
    <button type="button" class="switch" role="switch" aria-checked={on} aria-label={words.title} aria-describedby="on-word-said" disabled={busy} onclick={() => void flip()}
      ><span class="switch-track"></span></button
    >
  </div>
  {#if refusal}<p class="on-word-refused" role="status">{refusal}</p>{/if}
</Tile>

<style>
  .on-word-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }
</style>
