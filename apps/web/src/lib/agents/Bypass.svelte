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
      <!-- WHAT STILL NEEDS HIM, ONE PRESS AWAY (G15): the second paragraph that stood under the switch on every visit. -->
      <details class="bypass-more">
        <summary class="tap">{words.more}</summary>
        <p class="switch-row-line" id="bypass-still">{words.still}</p>
      </details>
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
  .bypass-more {
    margin: 0;
  }

  .bypass-more > summary {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 18px;
    list-style: none;
    cursor: pointer;
  }

  .bypass-more > summary::-webkit-details-marker {
    display: none;
  }

  /* A SMALL CARET THAT TURNS when it opens, ink-3, after the words. */
  .bypass-more > summary::after {
    inline-size: 6px;
    block-size: 6px;
    border-block-end: 1.5px solid currentColor;
    border-inline-end: 1.5px solid currentColor;
    content: '';
    transform: translateY(-2px) rotate(45deg);
    transition: transform var(--d-state) var(--ease-out);
  }

  .bypass-more[open] > summary::after {
    transform: translateY(1px) rotate(-135deg);
  }

  @media (hover: hover) and (pointer: fine) {
    .bypass-more > summary:hover {
      color: var(--ink);
    }
  }

  .bypass-more > summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    border-radius: var(--r-xs);
  }

  .bypass-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }
</style>
