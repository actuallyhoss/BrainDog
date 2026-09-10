<!--
  A section heading, and an optional action beside it.

  The container below it draws the boundary, so the heading does not need a rule to say where the
  group begins — two devices doing one job is the cheapest kind of clutter to remove.
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

<section class="section">
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
  .section-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-3);
  }

  /* A HEADING THAT READS AS ONE, and it was body text. At the body size in `--ink2` weight 500, "What
     needs you" was the size of the rows under it, so a screen of three sections read as one list.
     Twenty pixels at 600 in ink is what the reference product gives a section, and the count sits
     beside it on the same baseline in the body face, not the identifier one. */
  .section-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.018em;
  }

  .section-count {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }

  .section-aside {
    margin-inline-start: auto;
  }
</style>
