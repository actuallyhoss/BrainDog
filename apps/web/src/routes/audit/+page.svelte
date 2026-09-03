<!--
  Every write, by whom, against which version.

  Of four comparable products surveyed, three ship a MUTABLE history: one has a "Clear revision
  history" button whose result cannot be retrieved, one lets authors delete published updates, and
  one never claims append-only. This one is append-only BY CONSTRUCTION, because there is one write
  path — not because a policy says so (20 §9).

  Which is why there is no delete control on this screen and no filter that can hide a row. A
  history you can edit is a history, and a history you cannot is a record.
-->
<script lang="ts">
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { AUDIT, NOW } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
</script>

<PageHead
  title={copy.audit}
  count={AUDIT.length}
/>

<div class="page">
  <ul class="ledger">
    {#each AUDIT as e}
      <li>
        <div class="line line-short">
          <span class="seq">{e.by}</span>
          <span class="line-main">
            <span class="line-title"><span class="kind">{e.kind}</span> {e.target}</span>
          </span>
          <span class="line-amount note">{e.note}</span>
          <span class="line-when">{relative(e.at.slice(0, 10), NOW)}</span>
        </div>
      </li>
    {/each}
  </ul>
  <p class="foot">
    Version {AUDIT[0]?.version.toLocaleString('en')} · the record's monotonic counter is
    <code>MAX(event.rowid)</code>, so the log and the version are the same fact.
  </p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .ledger :global(.line) {
    grid-template-columns: 10ch minmax(0, 22ch) minmax(0, 1fr) 9ch;
  }

  .kind {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .note {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .foot {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .foot code {
    padding: 1px 5px;
    background: var(--sunk);
    border-radius: 3px;
    font-family: var(--font-id);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
