<!--
  Accepted unchanged, on the Agents page (`panel: kept`): the one number the agent side is judged by, one row an
  agent. Each row is its name and the share of its suggestions you took as filed over the last 90 days, the counts
  under it; pressed, it opens the agent's detail, the same share by kind of change.

  FROM THE RECORD'S OWN ANSWER (`trust`, each agent's `kept`), read as Settings > Agents reads it (`readTrust`), and
  said by `$lib/record/kept.ts`. The owner's alone, as `trust` is; for anyone else, and with nothing answered yet, the
  tile is left out whole.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient, type TrustStanding } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { readTrust } from '$lib/record/trust.ts';
  import { keptRows, keptWords } from '$lib/record/kept.ts';

  let { owner = false }: { owner?: boolean } = $props();

  let standing = $state.raw<TrustStanding | null>(null);
  let read = $state(false);

  onMount(() => {
    if (!owner) {
      read = true;
      return;
    }
    void readTrust(createClient({ base: apiBase() })).then((out) => {
      standing = out;
      read = true;
    });
  });

  const rows = $derived(keptRows(standing));
</script>

{#if !read || rows.length === 0}
  <!-- NOTHING ANSWERED, NOT THE OWNER, OR NOT READ YET: the tile is left out whole (`BlockSlot.svelte`'s rule). -->
  <span data-seen-none hidden aria-busy={!read ? 'true' : undefined}></span>
{:else}
  <ul class="kept">
    {#each rows as r (r.agent)}
      <li class="kept-agent">
        <details>
          <summary>
            <span class="kept-name" dir="auto">{r.label}</span>
            <span class="kept-num" aria-hidden={r.pct === null ? 'true' : undefined}>{r.pct ?? '–'}</span>
            <span class="kept-counts">{r.counts}</span>
          </summary>
          {#if r.kinds.length > 0}
            <p class="kept-head">{keptWords.byKind}</p>
            <ul class="kept-kinds">
              {#each r.kinds as k (k.label)}
                <li class="kept-kind">
                  <span class="kept-kind-label" dir="auto">{k.label}</span>
                  <span class="kept-kind-num">{k.pct ?? ''}</span>
                  <span class="kept-kind-counts">{k.counts}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </details>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .kept,
  .kept-kinds {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kept-agent + .kept-agent {
    border-block-start: 1px solid var(--rule);
  }

  /* THE NAME, THE NUMBER AT THE END, AND THE COUNTS UNDER THE NAME: two columns, wrapping on a phone. */
  summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px var(--sp-3);
    align-items: baseline;
    min-block-size: var(--row-h);
    padding-block: var(--sp-2);
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .kept-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .kept-num {
    grid-row: span 2;
    color: var(--ink);
    font-size: var(--fs-figure);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 1;
    text-align: end;
  }

  .kept-counts,
  .kept-kind-counts,
  .kept-head {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .kept-head {
    margin: 0 0 var(--sp-1);
  }

  details[open] {
    padding-block-end: var(--sp-3);
  }

  .kept-kind {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 var(--sp-3);
    padding-block: var(--sp-1);
  }

  .kept-kind-label {
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .kept-kind-num {
    grid-row: span 2;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }
</style>
