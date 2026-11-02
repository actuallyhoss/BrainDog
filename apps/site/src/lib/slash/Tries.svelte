<!--
  The three things to try in one of Slash's modes, the prototype's `.tries` (site.html ~:323-330, ~:1231): "Try
  asking", "Try finding" or "Try making" over the made-up record's questions (`demo/maya.ts`). The one being answered
  is pressed and shows its Enter key. Up and Down move between them, and wrap.

  `onpick` is the caller's: the home card types the question in, the desk's bar does the same. With scripting off the
  buttons are drawn and do nothing, and the first question's answer is already beside them.
-->
<script lang="ts">
  import Glyph from './Glyph.svelte';
  import { ASKS, FINDS, MAKES } from '../demo/maya.ts';
  import { slashDrawing, type Mode } from '../copy/slash.ts';
  import type { IconName } from '../icons.ts';

  let { mode, pressed, onpick }: { mode: Mode; pressed: number | null; onpick: (i: number) => void } = $props();

  const GLYPH: Record<Mode, IconName> = { ask: 'help', find: 'search', make: 'file' };
  const QUESTIONS: Record<Mode, readonly string[]> = {
    ask: ASKS.map((a) => a.q),
    find: FINDS.map((f) => f.q),
    make: MAKES.map((m) => m.q),
  };

  const words = $derived(slashDrawing.modes[mode]);
  const questions = $derived(QUESTIONS[mode]);

  let list: HTMLDivElement | undefined = $state();

  function keys(e: KeyboardEvent) {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step || !list) return;
    const buttons = [...list.querySelectorAll('button')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="tries" bind:this={list} onkeydown={keys} role="group" aria-label={words.tries}>
  <p class="lab" aria-hidden="true">{words.tries}</p>
  {#each questions as q, i (q)}
    <button type="button" aria-pressed={pressed === i} onclick={() => onpick(i)}>
      <span class="g"><Glyph name={GLYPH[mode]} size={15} /></span>
      <span>{q}</span>
      <kbd class="k" aria-hidden="true">↵</kbd>
    </button>
  {/each}
</div>

<style>
  .tries {
    display: grid;
    align-content: start;
    gap: 2px;
  }
  .lab {
    margin: 0;
    padding: 0 10px 6px;
    font: 500 var(--t-site-13) / 1 var(--font-ui);
    color: var(--ink-3);
  }
  button {
    /* NOT `all: unset`, which would take the a11y layer's focus ring with it. */
    appearance: none;
    margin: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: var(--r-ctl);
    font-size: var(--t-site-15);
    line-height: 1.35;
    color: var(--ink-2);
  }
  button[aria-pressed='true'] {
    background: var(--tile-2);
    color: var(--ink);
  }
  /* Hover only where there is one: a tap would leave a second question looking chosen. */
  @media (hover: hover) {
    button:hover {
      background: var(--tile-2);
      color: var(--ink);
    }
  }
  .g {
    display: inline-flex;
    color: var(--ink-3);
  }
  .k {
    display: inline-grid;
    place-items: center;
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    margin-inline-start: auto;
    border-radius: var(--r-xs);
    background: var(--tile);
    font: 500 11px/1 var(--font-mono);
    color: var(--ink-2);
    visibility: hidden;
  }
  button[aria-pressed='true'] .k {
    visibility: visible;
  }
  @media (pointer: coarse) {
    button {
      min-height: 44px;
      box-sizing: border-box;
    }
  }
</style>
