<!--
  A terminal with an agent at work, drawn on the app's tokens (the redo of 2 November): the tile's second fill, the
  app's mono, the session's words in ink, the folder and the counts in the second ink, its headings in 600 and the
  line that went well in the good green.

  EVERY LINE IS THERE FROM THE FIRST DRAW. It used to empty itself and play the lines in one by one over three seconds
  when it came into view, which kept a reader waiting on words that were already in the page; motion never delays
  reading, so the session is simply shown. No <pre>: the lines are the agent's words, and the connect page counts its
  own code blocks.
-->
<script lang="ts">
  import type { TERM } from '../demo/maya.ts';
  import { DESK } from './words.ts';

  let { lines }: { lines: typeof TERM } = $props();
</script>

<div class="term" role="group" aria-label={DESK.agents.terminal}>
  {#each lines as line, i (i)}
    <div class="line" data-tone={line.tone || undefined}>{line.text || ' '}</div>
  {/each}
</div>

<style>
  .term {
    padding: 16px 18px;
    border-radius: var(--r-pop);
    background: var(--tile-2);
    color: var(--ink);
    font: 400 var(--t-site-13-5) / 1.7 var(--font-mono);
    overflow-wrap: anywhere;
  }

  .line {
    white-space: pre-wrap;
  }

  .line[data-tone='dim'] {
    color: var(--ink-2);
  }

  .line[data-tone='bold'],
  .line[data-tone='white'] {
    font-weight: 600;
  }

  .line[data-tone='good'] {
    color: var(--good);
  }

  @media (max-width: 760px) {
    .term {
      padding: 14px;
      font-size: var(--t-site-12-5);
    }
  }
</style>
