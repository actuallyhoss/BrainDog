<!--
  A group as a tile: a white surface on the board, the heading at `--t-group` with its count in the quiet ink and the
  actions at the right, and the rows inside it.

  INSIDE A TILE OR A SHEET IT IS ONLY THE HEADING AND ITS ROWS, because a tile never holds a tile.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
    children,
    aside,
  }: { title: string; count?: number; children: Snippet; aside?: Snippet } = $props();
</script>

<section class="section" data-surface="tile">
  <div class="section-head">
    <h2 class="section-title">
      {title}
      <!--
        A ZERO IS NOT A COUNT, and the test was `count !== undefined`, which zero passes.

        So a new record read `Passkeys 0` over "No passkey yet.", `Connectors 0` over "Nothing feeds
        this record yet.", `What is kept 0` over "No backup yet." and `Installed 0` over "No packs
        installed." The same fact twice, once in the schema's register and once in the reader's, and
        the number is the half that says nothing: a count is here to save somebody counting rows,
        and there are no rows to count. The sentence below is the one that names what would be here
        and what puts it there, so it is the one that stays.
      -->
      {#if count}<span class="section-count num">{count}</span>{/if}
    </h2>
    {#if aside}<div class="section-aside">{@render aside()}</div>{/if}
  </div>
  {@render children()}
</section>

<style>
  .section {
    min-inline-size: 0;
    padding: var(--sp-4) 12px 12px;
    background: var(--bg);
    border-radius: var(--r-lg);
  }

  :global(:is(.tile, .sheet)) .section {
    padding: 0;
    background: none;
    border-radius: 0;
    box-shadow: none;
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--ctl-h);
    margin-block-end: var(--sp-1);
    padding-inline: var(--sp-2);
  }

  :global(:is(.tile, .sheet)) .section-head {
    padding-inline: 0;
  }

  /* `--t-group`, 17 on 24 at 600: a group heading ranks under the page title and over every row title (15 at 500), so
     the three steps read as three levels without a rule or a colour doing it. */
  .section-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .section-count {
    color: var(--dim);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .section-aside {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }
</style>
