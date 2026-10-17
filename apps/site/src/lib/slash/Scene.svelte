<!--
  The home card's scene: the app's top bar over its tiles, faded, and Slash's bar opened on top of them with "/", the
  question typed in, Ask, Find and Make, and the drop under it holding the tries and the answer, with the keys and the
  mode's note at its foot. The prototype's `.scene` (site.html ~:296-345, ~:628-647, ~:1248-1268).

  THE FIRST ASK ANSWERS ITSELF when the card comes into view, so the card is never empty. The prerendered HTML already
  holds that question and its answer, so a reader with scripting off, or one who asked for less motion, has the
  finished picture; with motion allowed the bar empties on load and types the question in once it is seen. Choosing a
  mode types that mode's first try; choosing a try types it.

  Every name and figure is the made-up record's (`demo/maya.ts`); the words are `copy/slash.ts`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Mark from '../Mark.svelte';
  import Tries from './Tries.svelte';
  import Answer from './Answer.svelte';
  import { reducedMotion, typeInto, type Phase } from './typing.ts';
  import { ASKS, FINDS, FOUNDER, MAKES } from '../demo/maya.ts';
  import { slashDrawing as w, type Mode } from '../copy/slash.ts';

  const MODES: readonly Mode[] = ['ask', 'find', 'make'];
  const QUESTIONS: Record<Mode, readonly string[]> = {
    ask: ASKS.map((a) => a.q),
    find: FINDS.map((f) => f.q),
    make: MAKES.map((m) => m.q),
  };

  let mode: Mode = $state('ask');
  let pressed: number | null = $state(0);
  let typed = $state(QUESTIONS.ask[0] ?? '');
  let phase: Phase = $state('answer');
  let stop = () => {};
  let scene: HTMLDivElement | undefined = $state();

  const words = $derived(w.modes[mode]);

  function pick(i: number) {
    stop();
    pressed = i;
    stop = typeInto(QUESTIONS[mode][i] ?? '', (f) => ((typed = f.typed), (phase = f.phase)), { think: words.think });
  }

  function choose(m: Mode) {
    if (m === mode) return;
    mode = m;
    pick(0);
  }

  function tabKeys(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length]!;
    choose(next);
    scene?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  }

  onMount(() => {
    if (reducedMotion() || !scene) return () => stop();
    typed = '';
    phase = 'idle';
    pressed = null;
    let seen: IntersectionObserver | null = null;
    try {
      seen = new IntersectionObserver(
        (es) => {
          if (!es[0]?.isIntersecting) return;
          if (phase === 'idle') pick(0);
          seen?.disconnect();
        },
        { threshold: 0.35 },
      );
      seen.observe(scene);
    } catch {
      pick(0);
    }
    return () => {
      seen?.disconnect();
      stop();
    };
  });
</script>

<div class="scene" bind:this={scene}>
  <div class="scene-top">
    <span class="who"><Mark height={18} /><span>BrainDog</span></span>
    <span class="face" style:--h={FOUNDER.hue} aria-hidden="true">{FOUNDER.initials}</span>
  </div>
  <div class="scene-main">
    <div class="tiles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="pal">
      <div class="pal-in">
        <span class="sl" aria-hidden="true">/</span>
        <span class="txt">
          <span class="typed">{typed}</span><span class="caret" aria-hidden="true"></span>
          {#if !typed}<span class="ph">{words.empty}</span>{/if}
        </span>
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <span class="modes" role="tablist" aria-label={w.modesLabel} tabindex="-1" onkeydown={tabKeys}>
          {#each MODES as m (m)}
            <button
              type="button"
              role="tab"
              id="slash-tab-{m}"
              data-mode={m}
              aria-selected={mode === m}
              aria-controls="slash-drop"
              tabindex={mode === m ? 0 : -1}
              onclick={() => choose(m)}>{w.modes[m].tab}</button
            >
          {/each}
        </span>
      </div>
      <div class="pal-drop" id="slash-drop" role="tabpanel" aria-labelledby="slash-tab-{mode}">
        <div class="pal-body">
          <div class="side"><Tries {mode} {pressed} onpick={pick} /></div>
          <div class="pal-out" aria-busy={phase !== 'answer'}>
            {#if phase === 'thinking' && words.think}
              <div class="thinking"><i></i>{words.think}</div>
            {:else if phase === 'answer' && pressed !== null}
              {#key `${mode}:${pressed}`}<Answer {mode} at={pressed} />{/key}
            {/if}
          </div>
        </div>
        <div class="pal-foot">
          <span class="k-hide"><kbd class="k">↑</kbd><kbd class="k">↓</kbd>{w.move}</span>
          <span class="k-hide"><kbd class="k">↵</kbd>{words.enter}</span>
          <span class="r">{words.note}</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .scene { max-width: 1000px; margin: 0 auto; border-radius: 22px; background: var(--board); box-shadow: inset 0 0 0 1px var(--rule); overflow: hidden; color: var(--ink); }
  .scene-top { display: flex; align-items: center; gap: 14px; height: 58px; padding: 0 16px; background: var(--tile); border-bottom: 1px solid var(--rule); }
  .who { display: flex; align-items: center; gap: 8px; font: 600 14px/1 var(--head); letter-spacing: -0.01em; white-space: nowrap; }
  .face {
    margin-left: auto; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; flex: none;
    font: 600 10.5px/1 var(--ui); background: hsl(var(--h) 45% 88%); color: hsl(var(--h) 45% 28%);
  }
  :global(:root[data-theme='dark']) .face { background: hsl(var(--h) 25% 24%); color: hsl(var(--h) 55% 82%); }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .face { background: hsl(var(--h) 25% 24%); color: hsl(var(--h) 55% 82%); }
  }
  .scene-main { position: relative; min-height: 520px; padding: 16px; }
  .tiles { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; opacity: 0.55; }
  .tiles i { display: block; height: 120px; border-radius: 14px; background: var(--tile); }
  .tiles i:nth-child(1) { grid-column: span 8; height: 170px; }
  .tiles i:nth-child(2) { grid-column: span 4; height: 170px; }
  .tiles i:nth-child(n + 3) { grid-column: span 3; }
  .pal { position: absolute; top: -48px; right: 60px; width: min(700px, calc(100% - 76px)); z-index: 2; }
  .pal-in { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 6px 0 14px; border-radius: 11px 11px 0 0; background: var(--tile); box-shadow: inset 0 0 0 1.5px var(--red); font-size: 15px; }
  .sl { font: 600 16px/1 var(--head); color: var(--red); flex: none; }
  .txt { flex: 1; min-width: 0; display: flex; align-items: center; overflow: hidden; }
  .typed { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ph { color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .caret { width: 1.5px; height: 18px; background: var(--red); animation: blink 1s steps(2) infinite; flex: none; margin-left: 1px; }
  @keyframes blink { 50% { opacity: 0; } }
  .modes { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--soft); flex: none; }
  .modes button { all: unset; cursor: pointer; padding: 6px 11px; border-radius: 6px; font: 500 13px/1 var(--ui); color: var(--muted); }
  .modes button:hover { color: var(--ink); }
  .modes button[aria-selected='true'] { background: var(--tile); color: var(--ink); box-shadow: 0 1px 2px var(--shadow-lift), inset 0 0 0 1px var(--rule); }
  .modes button:focus-visible { outline: 2px solid var(--red); }
  .pal-drop { background: var(--tile); border: 1.5px solid var(--red); border-top: 0; border-radius: 0 0 16px 16px; box-shadow: 0 30px 60px -24px var(--shadow-pop); overflow: hidden; }
  .pal-body { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); min-height: 380px; border-top: 1px solid var(--rule); }
  .side { border-right: 1px solid var(--rule); }
  .pal-out { padding: 14px; background: var(--board); display: grid; gap: 10px; align-content: start; min-width: 0; }
  .pal-out > :global(*) { animation: rise 0.4s ease both; }
  .pal-out > :global(:nth-child(2)) { animation-delay: 0.08s; }
  .pal-out > :global(:nth-child(3)) { animation-delay: 0.16s; }
  .pal-out > :global(:nth-child(4)) { animation-delay: 0.24s; }
  .pal-out > :global(:nth-child(5)) { animation-delay: 0.32s; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .thinking { color: var(--muted); font-size: 13.5px; display: flex; align-items: center; gap: 8px; padding: 14px 4px; }
  .thinking i { width: 6px; height: 6px; border-radius: 50%; background: var(--red); animation: blink 0.8s steps(2) infinite; }
  .pal-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 10px 14px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--muted); }
  .r { margin-left: auto; }
  .k { display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px; margin-right: 4px; border-radius: 5px; background: var(--soft); box-shadow: inset 0 0 0 1px var(--rule); font: 500 11px/1 var(--mono); color: var(--ink2); }
  @media (pointer: coarse) {
    .modes button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
  }
  @media (max-width: 1060px) {
    .pal { right: 16px; width: calc(100% - 32px); }
    .tiles i:nth-child(n + 3) { grid-column: span 6; }
  }
  @media (max-width: 760px) {
    .scene-top { height: 52px; }
    .who > span { display: none; }
    .scene-main { min-height: 0; padding: 10px; }
    .tiles { display: none; }
    .pal { position: relative; top: auto; right: auto; width: 100%; margin-top: -48px; }
    .pal-in { flex-wrap: wrap; height: auto; padding: 8px 8px 8px 12px; row-gap: 8px; }
    .txt { min-height: 26px; }
    .modes { order: 3; width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); }
    .modes button { text-align: center; }
    .pal-body { grid-template-columns: 1fr; min-height: 0; }
    .side { border-right: 0; border-bottom: 1px solid var(--rule); }
    .pal-out { padding: 10px; }
    .k-hide { display: none; }
    .r { margin-left: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .caret, .thinking i, .pal-out > :global(*) { animation: none; }
  }
</style>
