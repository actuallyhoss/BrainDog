<!--
  What every agent is told, as one tile on Agents, under the runs (today F19: it left Today,
  where it sat below the fold with no icon, for the page of the agents it is told to). The heading in the tile's own
  head with its icon, then each lesson that stands with its because, in the order a session reads them when it starts,
  and one foot line for what the record left out.

  A LESSON USED TO BE TOLD ONLY TO AGENTS. The record hands every session what was learned before it begins, and no
  screen said what that was. Here the record says it, in its own words and its own order.

  A TILE AND NEVER A QUESTION. Nothing here asks, confirms or replaces, and there is nothing to press: the record has
  no page of its own for these yet, so the tile links nowhere. At nought the tile is gone.

  THE LESSON STAYS IN INK, its because and the foot in the quieter colour, all at the row's own size (15).
-->
<script lang="ts">
  import Tile from '../ui/Tile.svelte';

  /* THE TILE'S SHAPE IS SAID HERE, not imported: the module's path spells a list an add-on declares (core-names), and
     the shape is the module's `LessonsTile`, which the screen passes in whole. */
  type Lessons = { heading: string; lines: { lesson: string; because: string | null }[]; foot: string };

  let { tile }: { tile: Lessons } = $props();
</script>

<Tile icon="skill" title={tile.heading} count={tile.lines.length} data-lessons="">
  <ol class="n-list">
    {#each tile.lines as line, i (i)}
      <li class="n-line">
        <span class="n-lesson" dir="auto">{line.lesson}</span>
        {#if line.because}<span class="n-because" dir="auto">Because: {line.because}</span>{/if}
      </li>
    {/each}
  </ol>
  {#if tile.foot}<p class="n-foot">{tile.foot[0]!.toUpperCase() + tile.foot.slice(1)}.</p>{/if}
</Tile>

<style>
  .n-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .n-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .n-line {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) 0;
    overflow-wrap: anywhere;
  }

  .n-lesson {
    color: var(--ink);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
  }

  .n-because,
  .n-foot {
    color: var(--ink-3);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
  }

  .n-foot {
    margin: 0;
  }
</style>
