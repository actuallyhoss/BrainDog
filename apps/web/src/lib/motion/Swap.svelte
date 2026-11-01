<!--
  ONE VIEW HANDING OVER TO THE NEXT IN PLACE (ui pass, 1 Nov): what a tab, a segmented choice or a step shows, changing
  without a route change. The old view fades out over `--d-exit` and the new one fades up with a 4px rise over
  `--d-swap`, both in one grid cell so nothing under them jumps: the same motion a page change makes (`app.css`
  `page-in`), so a view switched in place reads like a page opened.

    <Swap key={view}>
      {#if view === 'table'}<Table />{:else}<Cards />{/if}
    </Swap>

  A route change needs none of this: the shell already cross-fades the work (`AppFrame.svelte`, a view transition, with
  `transitionTo` below for a change a screen makes itself). Still on the first draw and in a screen's first second,
  and under reduced motion the view simply changes.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { TransitionConfig } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { calm, ms, still } from './index.ts';

  let { key, children }: { key: unknown; children: Snippet } = $props();

  const quiet = (): boolean => calm() || still();
  const up = (_node: Element): TransitionConfig =>
    quiet() ? { duration: 0 } : { delay: ms('--d-exit', 90) / 2, duration: ms('--d-swap', 160), easing: cubicOut, css: (t, u) => `opacity:${t};transform:translateY(${(u * 4).toFixed(2)}px)` };
  const down = (_node: Element): TransitionConfig => (quiet() ? { duration: 0 } : { duration: ms('--d-exit', 90), css: (t) => `opacity:${t}` });
</script>

<div class="swap">
  {#key key}
    <div class="swap-layer" in:up out:down>{@render children()}</div>
  {/key}
</div>

<style>
  .swap {
    display: grid;
    min-inline-size: 0;
  }

  .swap-layer {
    grid-area: 1 / 1;
    min-inline-size: 0;
  }
</style>
