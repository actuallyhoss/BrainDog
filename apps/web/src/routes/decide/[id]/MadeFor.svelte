<!--
  An add-on an agent made, put to the person on Decide: who made it, that BrainDog has not reviewed it, and each script
  it carries, whole and folded, since the script is what runs. Drawn over the plan (`Arranged`) for a `pack` question
  whose body carries the file (`packages/mcp/src/act.ts`, installPack with a doc).
-->
<script lang="ts">
  import { hostsOf, madeWords, scriptsOf } from '$lib/market/made-here.ts';

  let { doc, by }: { doc: unknown; by: string } = $props();

  const scripts = $derived(scriptsOf(doc));
  const hosts = $derived(hostsOf(scripts.flatMap((s) => s.egress)));
</script>

<section class="made-for" aria-label={madeWords.madeFor(by)}>
  <p class="mf-head"><span class="pill-badge" data-tone="warn">{madeWords.notReviewed}</span><span class="mf-who">{madeWords.madeFor(by)}</span></p>
  <p class="mf-line">{madeWords.madeForLine}{#if hosts.length > 0}{' '}{madeWords.calls(hosts)}{/if}</p>
  {#each scripts as s, i (i)}
    <details class="mf-fold">
      <summary>{madeWords.script(s.title)}</summary>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre class="mf-source" tabindex="0">{s.source}</pre>
    </details>
  {/each}
</section>

<style>
  .made-for {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-4);
    padding: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
  }

  .mf-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
  }

  .mf-who {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
  }

  .mf-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .mf-fold {
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .mf-fold > summary {
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .mf-fold > summary {
      min-block-size: var(--tap);
    }
  }

  .mf-source {
    margin: var(--sp-2) 0 0;
    padding: var(--sp-3);
    overflow: auto;
    max-block-size: 50vh;
    background: var(--tile);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: 1.5;
    white-space: pre;
  }

  .mf-source:focus-visible {
    outline: 2px solid var(--focus-ring, var(--focus));
    outline-offset: 0;
  }
</style>
