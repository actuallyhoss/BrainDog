<!--
  What accepting a `change` or a `pattern` would put on the screen (`proposed.ts`): each page, list,
  rule or look by its name, with the facts that say where it lands and what it shows. The accent of a
  look is drawn as a swatch beside its code, because a colour is judged by eye and not by its number.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import type { Proposed } from './proposed.ts';

  let { proposed }: { proposed: Proposed } = $props();
</script>

<ul class="appears">
  {#each proposed.appears as a, i (i)}
    <li class="appear">
      <p class="appear-head">
        <span class="appear-kind">{a.kind}</span>
        <span class="appear-title">{a.title}</span>
      </p>
      {#if a.lines.length}
        <dl class="appear-lines">
          {#each a.lines as line (line.label)}
            <dt>{line.label}</dt>
            <dd>
              {#if a.accent && line.value === a.accent}<span class="swatch" style:background={a.accent} aria-hidden="true"></span>{/if}
              {line.value}
            </dd>
          {/each}
        </dl>
      {/if}
    </li>
  {/each}
</ul>
{#if proposed.samples !== null}<p class="appear-note">{copy.proposalSamples(proposed.samples)}</p>{/if}

<style>
  .appears {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .appear {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .appear-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--t-ui);
  }

  .appear-kind {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .appear-title {
    color: var(--ink);
    font-weight: 500;
  }

  /* The same two tracks as a changed field: the fact's name as wide as a short label, then the fact. */
  .appear-lines {
    display: grid;
    grid-template-columns: minmax(8ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    font-size: var(--t-ui);
  }

  .appear-lines dt {
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: var(--lh-body);
  }

  .appear-lines dd {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .swatch {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .appear-note {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
