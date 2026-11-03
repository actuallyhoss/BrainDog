<!--
  The desk's "Ask or change anything" bar, which opens in place the way the app's does (§47 his notes: "extend on the
  'ask or change anything' instead of being a centered modal"). Pressing it, or ⌘J (Ctrl J off a Mac) while the desk is on screen and
  no field has the keys, widens the bar where it stands and drops the answer under it at the same width, with three
  Ask questions to try. Pick one and it types itself in and answers; under reduced motion it is all there at once.
  Escape or a press outside closes it, and the keys go back to the bar.

  THE TRIES AND THE ANSWER ARE SLASH'S OWN (`../slash/`), the same drawing the home card and the Slash page use. On a
  phone the open bar takes the window's full width, on its own line under the tabs.
-->
<script lang="ts">
  import { tick } from 'svelte';

  import Icon from '../Icon.svelte';
  import { slashDrawing } from '../copy/slash.ts';
  import Answer from '../slash/Answer.svelte';
  import Tries from '../slash/Tries.svelte';
  import { typeInto, type Phase } from '../slash/typing.ts';
  import { ASKS } from '../demo/maya.ts';
  import { DESK } from './words.ts';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let typed = $state('');
  let phase = $state<Phase>('idle');
  let pressed = $state<number | null>(null);
  let box: HTMLDivElement;
  let bar: HTMLButtonElement;
  let stop: () => void = () => {};

  const think = slashDrawing.modes.ask.think;

  async function show(on: boolean, refocus = false): Promise<void> {
    stop();
    typed = '';
    phase = 'idle';
    pressed = null;
    open = on;
    if (on) {
      await tick();
      box.querySelector<HTMLButtonElement>('.desk-drop button')?.focus({ preventScroll: true });
    } else if (refocus) bar.focus({ preventScroll: true });
  }

  function pick(i: number): void {
    stop();
    pressed = i;
    stop = typeInto(ASKS[i]?.q ?? '', (f) => ((typed = f.typed), (phase = f.phase)), { think });
  }

  /** The desk counts as on screen while some of its window is below the page's top bar and above the fold. */
  function onscreen(): boolean {
    const r = (box.closest('[data-desk]') ?? box).getBoundingClientRect();
    return r.bottom > 120 && r.top < innerHeight;
  }

  function keys(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      void show(false, true);
      return;
    }
    /* ⌘J, OR CTRL J OFF A MAC, as the app opens Ask (`TopBar.svelte`). */
    if (e.key.toLowerCase() !== 'j' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || open) return;
    const at = document.activeElement as HTMLElement | null;
    if (at && (/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) || at.isContentEditable)) return;
    if (!onscreen()) return;
    e.preventDefault();
    void show(true);
  }

  function press(e: PointerEvent): void {
    if (!open || box.contains(e.target as Node)) return;
    const inside = box.contains(document.activeElement);
    void show(false, inside);
  }

  $effect(() => () => stop());
</script>

<svelte:document onkeydown={keys} onpointerdown={press} />

<div class="desk-ask" class:open bind:this={box}>
  <button
    type="button"
    class="desk-ask-bar"
    aria-label={DESK.ask.bar}
    aria-expanded={open}
    aria-controls="desk-drop"
    aria-keyshortcuts="Meta+J Control+J"
    bind:this={bar}
    onclick={() => show(!open)}
  >
    <Icon name="search" />
    <span class="txt" class:typed={open}>{open ? typed : DESK.ask.bar}</span>
    <kbd>{DESK.ask.key}</kbd>
  </button>
  {#if open}
    <div class="desk-drop" id="desk-drop">
      <Tries mode="ask" {pressed} onpick={pick} />
      <div class="pal-out" aria-live="polite">
        {#if phase === 'thinking' && think}
          <div class="thinking"><i></i>{think}</div>
        {:else if phase === 'answer' && pressed !== null}
          <Answer mode="ask" at={pressed} />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .desk-ask {
    position: relative;
    margin-inline-start: auto;
    width: 300px;
    flex: none;
    transition: width 0.2s;
  }

  .desk-ask.open {
    width: min(560px, 62%);
    flex: 0 1 auto;
  }

  .desk-ask-bar {
    all: unset;
    box-sizing: border-box;
    cursor: text;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 34px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--g-fill);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    color: var(--muted);
    font: 400 13.5px/1.3 var(--ui);
    transition: box-shadow 0.2s;
  }

  .desk-ask-bar :global(.icon) {
    width: 18px;
    height: 18px;
  }

  .desk-ask-bar:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .open .desk-ask-bar {
    background: var(--tile);
    color: var(--ink);
    border-radius: 17px 17px 0 0;
    box-shadow: inset 0 0 0 1.5px var(--red);
  }

  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  kbd {
    margin-inline-start: auto;
    font: 500 11px/1 var(--mono);
    padding: 3px 5px;
    border-radius: 5px;
    background: var(--tile);
    color: var(--muted);
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  .desk-drop {
    position: absolute;
    z-index: var(--z-raise);
    inset-block-start: 100%;
    inset-inline-start: 0;
    inset-inline-end: 0;
    background: var(--tile);
    border: 1.5px solid var(--red);
    border-block-start: 0;
    border-radius: 0 0 17px 17px;
    box-shadow: var(--elev-popover);
    overflow: hidden;
  }

  .desk-drop :global(.tries) {
    border-inline-end: 0;
    border-block-end: 1px solid var(--rule);
  }

  .pal-out {
    max-height: 300px;
    overflow: auto;
    padding: 14px;
    background: var(--board);
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }

  .pal-out:empty {
    display: none;
  }

  .thinking {
    color: var(--muted);
    font-size: var(--t-app-sm);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 4px;
  }

  .thinking i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--red);
    animation: blink 0.8s steps(2) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.2;
    }
  }

  @media (max-width: 1060px) {
    .desk-ask {
      width: 34px;
    }

    .desk-ask-bar {
      padding: 0 8px;
      justify-content: center;
    }

    .desk-ask:not(.open) .txt,
    .desk-ask:not(.open) kbd {
      display: none;
    }

    .open .desk-ask-bar {
      justify-content: flex-start;
      padding: 0 10px;
    }
  }

  @media (max-width: 760px) {
    .desk-ask.open {
      order: 4;
      width: 100%;
    }
  }

  @media (max-width: 1060px) and (pointer: coarse) {
    .desk-ask:not(.open) {
      width: 44px;
    }
  }

  @media (pointer: coarse) {
    .desk-ask-bar {
      height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .desk-ask,
    .desk-ask-bar {
      transition: none;
    }

    .thinking i {
      animation: none;
    }
  }
</style>
