<!--
  LOADING, THEN THE CONTENT, AS ONE CHANGE (ui pass, 1 Nov): the skeleton and the answer share one place (one grid
  cell), so the answer fades up over `--d-swap` while the skeleton fades out over `--d-exit`, and nothing under them
  jumps for the frame they overlap. The box then takes the answer's height over `--d-rows`, so a skeleton shorter or
  taller than the answer does not snap the page either.

    <Crossfade ready={rows !== null}>
      {#snippet waiting()}<Waiting rows={4} />{/snippet}
      <Rows {rows} />
    </Crossfade>

  An answer already there when the part first draws is simply there (no fade on a reload or a cached screen), nor in a
  screen's first second, and under reduced motion the swap is at once.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { TransitionConfig } from 'svelte/transition';
  import { calm, ms, still } from './index.ts';

  let { ready, waiting, children }: { ready: boolean; waiting?: Snippet; children: Snippet } = $props();

  let box = $state<HTMLElement>();
  /* ONCE THE ANSWER HAS BEEN IN, IT STAYS (ui-perfect, 3 Nov): a read that goes out again (a poll, a pull) never fades the
     skeleton back over content that was there. */
  let had = $state(false);
  $effect.pre(() => {
    if (ready) had = true;
  });
  const showing = $derived(ready || had);
  /* WHETHER THIS PART HAS DRAWN ONCE: an answer that is there on the first draw does not fade in. */
  let drawn = false;
  $effect(() => {
    drawn = true;
  });

  const quiet = (): boolean => !drawn || calm() || still();

  const up = (_node: Element): TransitionConfig => (quiet() ? { duration: 0 } : { duration: ms('--d-swap', 160), css: (t) => `opacity:${t}` });
  const down = (_node: Element): TransitionConfig => (quiet() ? { duration: 0 } : { duration: ms('--d-exit', 90), css: (t) => `opacity:${t}` });

  /* THE BOX'S HEIGHT, PLAYED from the skeleton's to the answer's once the swap is drawn (FLIP on the height alone). */
  let before = 0;
  $effect.pre(() => {
    void ready;
    before = box?.offsetHeight ?? 0;
  });
  $effect(() => {
    void ready;
    const el = box;
    if (!el || quiet() || before === 0 || typeof el.animate !== 'function') return;
    const after = el.offsetHeight;
    if (Math.abs(after - before) < 2) return;
    el.animate({ blockSize: [`${before}px`, `${after}px`], overflow: ['clip', 'clip'] }, { duration: ms('--d-rows', 180), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  });
</script>

<div class="crossfade" bind:this={box} aria-busy={showing ? undefined : 'true'}>
  {#if showing}
    <div class="cf-layer" in:up>{@render children()}</div>
  {:else if waiting}
    <div class="cf-layer" out:down>{@render waiting()}</div>
  {/if}
</div>

<style>
  .crossfade {
    display: grid;
    min-inline-size: 0;
  }

  .cf-layer {
    grid-area: 1 / 1;
    min-inline-size: 0;
  }
</style>
