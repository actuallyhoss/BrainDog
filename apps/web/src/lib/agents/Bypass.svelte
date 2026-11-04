<!--
  "Let agents do everything without asking" (Settings > Agents): one switch row, the owner's, first in the Answering
  tile. What it means is `bypass.ts`; the record keeps it as the owner's `agents.bypass` through `setPref`, which refuses
  anybody but an owner signed in to the app, and asks for a recent sign-in to turn it on. Off until he turns it on.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { TONES } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { handOver } from '$lib/motion/open.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { BYPASS_PREF, bypassOn, bypassSaid, bypassWords as words } from './bypass.ts';

  let { prefs }: { prefs?: Record<string, unknown> | undefined } = $props();

  /** What the last press kept, over what `boot` answered. */
  let kept = $state<boolean | null>(null);
  let busy = $state(false);
  let refusal = $state('');
  const on = $derived(kept ?? bypassOn(prefs));

  /* THE LINE HANDS OVER ONLY ON A PRESS. Keyed on `on`, it also swapped when the live shell's prefs landed over the
     local copy's, a fade on load nobody asked for: the blink on the settings page. A plain swap there. */
  let pressed = false;
  const said = (node: Element) => (pressed ? handOver(node) : { duration: 0 });

  async function flip(): Promise<void> {
    if (busy) return;
    const was = on;
    pressed = true;
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
      {#key on}<p class="switch-row-line" in:said id="bypass-said">{bypassSaid(on)}</p>{/key}
      <!-- WHAT STILL NEEDS HIM, ONE PRESS AWAY (G15), AS A LIST (UI pass, 3 Nov): five things, a lock each, then the one
           line on colleagues' agents. -->
      <details class="bypass-more">
        <summary class="tap">{words.more}</summary>
        <div class="bypass-still" id="bypass-still">
          <ul class="still-list">
            {#each words.stillList as thing (thing)}
              <li><Icon name="lock" size="s" />{thing}</li>
            {/each}
          </ul>
          <p class="switch-row-line">{words.colleagues}</p>
        </div>
      </details>
    </div>
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={on}
      aria-label={words.title}
      aria-describedby="bypass-said bypass-still"
      aria-busy={busy}
      onclick={() => void flip()}><span class="switch-track"></span></button
    >
  </div>
  {#if refusal}<p class="bypass-refused" role="status" in:handOver><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</p>{/if}
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
    line-height: calc(18px * var(--type, 1));
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

  .bypass-still {
    display: grid;
    gap: var(--sp-2);
    padding-block-start: var(--sp-2);
  }

  .still-list {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .still-list > li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .still-list :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  /* WHAT A REFUSED PRESS SAID: the mark in red and the record's own sentence, under the row it belongs to, until the
     next press. */
  .bypass-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .bypass-refused > span {
    color: var(--red);
  }
</style>
