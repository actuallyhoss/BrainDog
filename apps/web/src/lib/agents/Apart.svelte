<!--
  "Agents' suggestions wait apart" (Settings > Agents): one switch row, the owner's, in Settings > Agents' Answering tile. What it means
  is `apart.ts`; the record keeps it as the owner's `decide.agents_apart` through `setPref`, which refuses anybody but
  an owner in a browser. On until he turns it off.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { TONES } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { handOver } from '$lib/motion/open.ts';
  import { APART_PREF, apartOnIn, apartSaid, apartWords as words } from './apart.ts';

  let { prefs }: { prefs?: Record<string, unknown> | undefined } = $props();

  /** What the last press kept, over what `boot` answered. */
  let kept = $state<boolean | null>(null);
  let busy = $state(false);
  let refusal = $state('');
  const on = $derived(kept ?? apartOnIn(prefs));

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
      .setPref(APART_PREF, !was)
      .catch(() => null);
    busy = false;
    if (out?.ok) return;
    kept = was;
    refusal = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }
</script>

<div class="answer-switch" data-part="apart">
  <div class="switch-row">
    <div class="switch-row-words">
      <span class="switch-row-title">{words.title}</span>
      {#key on}<p class="switch-row-line" in:said id="apart-said">{apartSaid(on)}</p>{/key}
    </div>
    <button type="button" class="switch" role="switch" aria-checked={on} aria-label={words.title} aria-describedby="apart-said" aria-busy={busy} onclick={() => void flip()}
      ><span class="switch-track"></span></button
    >
  </div>
  {#if refusal}<p class="apart-refused" role="status" in:handOver><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</p>{/if}
</div>

<style>
  /* WHAT A REFUSED PRESS SAID: the mark in red and the record's own sentence, until the next press. */
  .apart-refused {
    margin: 0;
    max-inline-size: 75ch;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .apart-refused > span {
    color: var(--red);
  }
</style>
