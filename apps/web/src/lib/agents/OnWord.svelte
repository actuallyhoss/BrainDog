<!--
  "Agents may answer when you tell them" (Settings > Agents): one switch row, the owner's, in Settings > Agents' Answering tile. What it
  means is `on-word.ts`; the record keeps it as the owner's `agents.answer_on_word` through `setPref`, which refuses
  anybody but an owner in a browser. On until he turns it off.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { TONES } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { handOver } from '$lib/motion/open.ts';
  import { ON_WORD_PREF, onWordOn, onWordSaid, onWordWords as words } from './on-word.ts';

  let { prefs }: { prefs?: Record<string, unknown> | undefined } = $props();

  /** What the last press kept, over what `boot` answered. */
  let kept = $state<boolean | null>(null);
  let busy = $state(false);
  let refusal = $state('');
  const on = $derived(kept ?? onWordOn(prefs));

  /* THE LINE HANDS OVER ONLY ON A PRESS, never when the live shell's prefs land over the local copy's (a fade on
     load, the blink on the settings page). */
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
      .setPref(ON_WORD_PREF, !was)
      .catch(() => null);
    busy = false;
    if (out?.ok) return;
    kept = was;
    refusal = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }
</script>

<div class="answer-switch" data-part="on-word">
  <div class="switch-row">
    <div class="switch-row-words">
      <span class="switch-row-title">{words.title}</span>
      {#key on}<p class="switch-row-line" in:said id="on-word-said">{onWordSaid(on)}</p>{/key}
    </div>
    <button type="button" class="switch" role="switch" aria-checked={on} aria-label={words.title} aria-describedby="on-word-said" aria-busy={busy} onclick={() => void flip()}
      ><span class="switch-track"></span></button
    >
  </div>
  {#if refusal}<p class="on-word-refused" role="status" in:handOver><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</p>{/if}
</div>

<style>
  /* WHAT A REFUSED PRESS SAID: the mark in red and the record's own sentence, until the next press. */
  .on-word-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .on-word-refused > span {
    color: var(--red);
  }
</style>
