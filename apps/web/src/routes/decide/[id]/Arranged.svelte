<!--
  A proposal that arranges this BrainDog (`arranged.ts`), drawn as one story: why, what it calls out, the packs,
  what will appear, the words that change, and any other setting.

  THE CALLS OUT ARE NEVER FOLDED. They are the one part of an arrangement that reaches outside the record and
  costs egress, and accepting approves them, so the queue draws them as whole as the gate does, with a glyph in
  the warning ink and the host in ink. Everything else folds to one counted line on the queue (`compact`).
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Proposed from './Proposed.svelte';
  import type { Arranged } from './arranged.ts';

  let { arranged, compact = false }: { arranged: Arranged; compact?: boolean } = $props();

  const folded = new Set(['appears', 'words', 'settings', 'rows']);
</script>

<div class="arr" data-compact={compact ? '' : undefined}>
  <!-- ON THE QUEUE THE LEAD CARRIES THE COUNT, and it comes first: what it does, then why, then what it calls out. -->
  {#if compact}
    <p class="arr-summary">{arranged.summary ? copy.arrangeLeadSummary(arranged.lead, arranged.summary) : arranged.lead}</p>
  {:else}
    <p class="arr-lead">{arranged.lead}</p>
  {/if}
  {#each arranged.parts as p (p.part)}
    {#if p.part === 'why'}
      <section class="arr-part" aria-label={copy.arrangeWhy}>
        {#if !compact}<h3 class="arr-h">{copy.arrangeWhy}</h3>{/if}
        <ul class="arr-lines arr-why">
          {#each p.lines as line, i (i)}
            <li>{line.text}{#if line.at}<span class="arr-at">{line.at}</span>{/if}</li>
          {/each}
        </ul>
      </section>
    {:else if p.part === 'calls'}
      <section class="arr-part arr-calls" aria-label={copy.arrangeCalls}>
        <h3 class="arr-h arr-calls-h"><Icon name="globe" size="s" />{copy.arrangeCalls}</h3>
        <ul class="arr-lines">
          {#each p.calls as call, i (i)}
            <li class="arr-call">
              {#if call.host}<span class="arr-host">{call.host}</span>{/if}
              <span class="arr-detail">{call.detail}</span>
            </li>
          {/each}
        </ul>
        <p class="arr-note">{copy.arrangeCallsNote}</p>
      </section>
    {:else if p.part === 'packs'}
      <section class="arr-part" aria-label={copy.arrangePacks}>
        {#if !compact}<h3 class="arr-h">{copy.arrangePacks}</h3>{/if}
        <ul class="arr-lines">
          {#each p.lines as line, i (i)}<li>{line}</li>{/each}
        </ul>
      </section>
    {:else if !(compact && folded.has(p.part))}
      {#if p.part === 'appears'}
        <section class="arr-part" aria-label={copy.proposalWillAppear}>
          <h3 class="arr-h">{copy.proposalWillAppear}</h3>
          <Proposed proposed={{ appears: p.appears, samples: null }} />
          {#if p.examples > 0}<p class="arr-note">{copy.arrangeExamples(p.examples)}</p>{/if}
        </section>
      {:else if p.part === 'words'}
        <section class="arr-part" aria-label={copy.arrangeWords}>
          <h3 class="arr-h">{copy.arrangeWords}</h3>
          <ul class="arr-lines">
            {#each p.lines as line, i (i)}<li>{line}</li>{/each}
          </ul>
        </section>
      {:else if p.part === 'rows'}
        <section class="arr-part" aria-label={copy.arrangeRows}>
          <h3 class="arr-h">{copy.arrangeRows}</h3>
          {#each p.lists as l (l.name)}
            <h4 class="arr-h">{l.name}</h4>
            <ul class="arr-lines">
              {#each l.lines as line, i (i)}<li>{line}</li>{/each}
            </ul>
          {/each}
          <p class="arr-note">{copy.arrangeRowsNote}</p>
        </section>
      {:else if p.part === 'settings'}
        <section class="arr-part" aria-label={copy.arrangeSettings}>
          <h3 class="arr-h">{copy.arrangeSettings}</h3>
          <ul class="arr-lines">
            {#each p.lines as line, i (i)}<li>{line}</li>{/each}
          </ul>
        </section>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .arr {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .arr[data-compact] {
    gap: var(--sp-3);
  }

  .arr-lead {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .arr-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .arr-h {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .arr-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  /* THE REASONS ARE THE PROPOSER'S OWN WORDS, so they read as prose, each on its line. */
  .arr-why li {
    color: var(--ink);
  }

  .arr-at {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  /* THE ONE PART THAT LEAVES THE RECORD: the warning glyph leads its heading, and the heading is in ink. */
  .arr-calls-h {
    color: var(--ink);
    font-size: var(--t-ui);
  }

  .arr-calls-h :global(.icon) {
    color: var(--warn);
  }

  .arr-call {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
  }

  .arr-host {
    color: var(--ink);
    font-family: var(--font-id);
    font-weight: 400;
  }

  .arr-detail {
    color: var(--ink2);
  }

  .arr-note,
  .arr-summary {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .arr-summary {
    font-size: var(--t-ui);
    color: var(--ink2);
  }
</style>
