<!--
  Under a question on Decide, two quiet verbs: "Ask Slash", which explains it and compares its answers, the answer drawn
  under the card as it streams (Quick); and "Hand it off", which opens the send sheet on Auto with the question attached.
  What came back stays under the card as its strip.
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { askSlash, busy, forRef } from './convos.svelte.ts';
  import { openSheet } from './open.ts';
  import SendStrip from './SendStrip.svelte';
  import { refs, sendWords } from './send.ts';

  let { id, title }: { id: string; title: string } = $props();

  const ref = $derived(refs.question(id));
  const asking = $derived(forRef(ref).some((c) => c.via === 'slash' && busy(c)));

  function explain() {
    if (asking) return;
    askSlash({ refs: [ref], message: sendWords.explain, mode: 'quick', attach: [ref] });
  }

  function handOff(e: MouseEvent) {
    void openSheet({ kind: 'decide', attach: [{ ref, label: title }], preset: 'auto', anchor: e.currentTarget instanceof Element ? e.currentTarget : null, fallback: sendWords.explain });
  }
</script>

<div class="da">
  <div class="da-verbs">
    <button type="button" class="da-btn tap" disabled={asking} aria-busy={asking} onclick={explain}><Icon name="slash" size="s" />{sendWords.askSlash}</button>
    <button type="button" class="da-btn tap" aria-haspopup="dialog" onclick={handOff}><Icon name="arrow" size="s" />{sendWords.handOff}</button>
  </div>
  <SendStrip {ref} kind="decide" label={title} />
</div>

<style>
  .da {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .da-verbs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .da-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .da-btn :global(.icon) {
    color: var(--ink-3);
  }

  .da-btn:disabled {
    color: var(--ink-3);
    cursor: progress;
  }

  @media (hover: hover) and (pointer: fine) {
    .da-btn:hover:not(:disabled) {
      background: var(--hover);
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .da-btn {
      min-block-size: var(--tap);
    }
  }
</style>
