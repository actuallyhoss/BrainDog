<!--
  "Agents' suggestions wait apart" (Settings > Agents): one switch row, the owner's, in a tile of its own. What it means
  is `apart.ts`; the record keeps it as the owner's `decide.agents_apart` through `setPref`, which refuses anybody but
  an owner in a browser. On until he turns it off.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import { APART_PREF, apartOnIn, apartSaid, apartWords as words } from './apart.ts';

  let { prefs }: { prefs?: Record<string, unknown> | undefined } = $props();

  /** What the last press kept, over what `boot` answered. */
  let kept = $state<boolean | null>(null);
  let busy = $state(false);
  let refusal = $state('');
  const on = $derived(kept ?? apartOnIn(prefs));

  async function flip(): Promise<void> {
    if (busy) return;
    const was = on;
    busy = true;
    refusal = '';
    kept = !was;
    const out = await createClient({ base: apiBase() })
      .setPref(APART_PREF, !was)
      .catch(() => null);
    busy = false;
    if (out?.ok) return;
    kept = was;
    refusal = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }
</script>

<Tile icon="decide" title={words.tile} data-part="apart">
  <div class="switch-row">
    <div class="switch-row-words">
      <span class="switch-row-title">{words.title}</span>
      <p class="switch-row-line" id="apart-said">{apartSaid(on)}</p>
    </div>
    <button type="button" class="switch" role="switch" aria-checked={on} aria-label={words.title} aria-describedby="apart-said" disabled={busy} onclick={() => void flip()}
      ><span class="switch-track"></span></button
    >
  </div>
  {#if refusal}<p class="apart-refused" role="status">{refusal}</p>{/if}
</Tile>

<style>
  .apart-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }
</style>
