<!--
  "Let agents do everything without asking" (Settings > Agents): one switch row, the owner's, first in the Answering
  tile. What it means is `bypass.ts`; the record keeps it as the owner's `agents.bypass` through `setPref`, which refuses
  anybody but an owner signed in to the app, and asks for a recent sign-in to turn it on. Off until he turns it on.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { BYPASS_PREF, bypassOn, bypassSaid, bypassWords as words } from './bypass.ts';

  let { prefs }: { prefs?: Record<string, unknown> | undefined } = $props();

  /** What the last press kept, over what `boot` answered. */
  let kept = $state<boolean | null>(null);
  let busy = $state(false);
  let refusal = $state('');
  const on = $derived(kept ?? bypassOn(prefs));

  async function flip(): Promise<void> {
    if (busy) return;
    const was = on;
    busy = true;
    refusal = '';
    kept = !was;
    const out = await createClient({ base: apiBase() })
      .setPref(BYPASS_PREF, was ? 'off' : 'on')
      .catch(() => null);
    busy = false;
    if (out?.ok) return;
    kept = was;
    refusal = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }
</script>

<div class="answer-switch" id="bypass" data-part="bypass">
  <div class="switch-row">
    <div class="switch-row-words">
      <span class="switch-row-title">{words.title}</span>
      <p class="switch-row-line" id="bypass-said">{bypassSaid(on)}</p>
      <p class="switch-row-line" id="bypass-still">{words.still}</p>
    </div>
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={on}
      aria-label={words.title}
      aria-describedby="bypass-said bypass-still"
      disabled={busy}
      onclick={() => void flip()}><span class="switch-track"></span></button
    >
  </div>
  {#if refusal}<p class="bypass-refused" role="status">{refusal}</p>{/if}
</div>

<style>
  .bypass-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }
</style>
