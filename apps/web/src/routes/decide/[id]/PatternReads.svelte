<!--
  A pattern question's messages as its rule reads them (`pattern-reads.ts`), drawn under the rule on Decide: at most
  three short blocks, one a message, each saying who it is from and then every field the rule fills with its value;
  then how many more like them wait, and what all that waits comes to when the record could read all of it.

  LOADED ONLY FOR A PATTERN. `Proposed.svelte` imports this with `import()` when the question carries one, so a page,
  a list or an automation on Decide loads nothing new.

  A FIELD THE RULE MISSES IS SAID, NOT DROPPED: a rule that finds the amount in two of three is the one a yes should
  stop at. A question whose messages cannot be read draws nothing here, and the rule and the builder's link above
  are what it was before.

  WHAT ACCEPT DOES, SAID UNDER THE MESSAGES, muted and in the same block: how many it files with one Undo and how many
  keep waiting, from the rehearsal the messages were read with. ONCE THE QUESTION IS RESOLVED (`resolved`), the record's
  own closing note (`said`, "Filed 4 with this pattern. ...") stands in place of the messages, as the record wrote it,
  and nothing is read again.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import type { PatternAsked } from './proposed.ts';
  import { closedSaid, patternReads, words, type PatternReads } from './pattern-reads.ts';

  let { pattern, resolved = false, said }: { pattern: PatternAsked; resolved?: boolean; said?: unknown } = $props();

  const closed = $derived(closedSaid(said, resolved));

  /* ONE ANSWER PER QUESTION: a question changed under the screen drops the reads it was waiting on. */
  let reads = $state<PatternReads | null | undefined>(undefined);

  $effect(() => {
    const asked = pattern;
    let current = true;
    reads = undefined;
    if (resolved) return;
    void patternReads(apiBase(), asked)
      .then((r) => {
        if (current) reads = r;
      })
      .catch(() => {
        if (current) reads = null;
      });
    return () => {
      current = false;
    };
  });
</script>

{#if resolved}
  {#if closed !== null}<p class="reads-note reads-closed" role="status">{closed}</p>{/if}
{:else if reads === undefined}
  <p class="reads-note reads-wait" role="status">{words.reading}</p>
{:else if reads !== null && reads.rows.length}
  <section class="reads" aria-label={words.group}>
    <ul class="reads-list">
      {#each reads.rows as row, i (i)}
        <li class="read">
          <p class="read-from">{row.from ?? words.noSender}</p>
          {#if row.fields.length}
            <dl class="read-fields">
              {#each row.fields as f, j (j)}
                <dt>{f.field}</dt>
                {#if f.value === ''}
                  <dd class="read-missed">{words.missed}</dd>
                {:else}
                  <dd>{f.value}</dd>
                {/if}
              {/each}
            </dl>
          {/if}
        </li>
      {/each}
    </ul>
    {#if reads.waiting > 0}<p class="reads-note">{words.more(reads.waiting)}</p>{/if}
    {#if reads.total !== null}<p class="reads-note num">{words.total(reads.total)}</p>{/if}
    {#if reads.accept !== null}<p class="reads-note reads-accept">{reads.accept}</p>{/if}
  </section>
{/if}

<style>
  .reads {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    min-inline-size: 0;
  }

  .reads-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A MESSAGE IS A FLAT BLOCK INSIDE THE CARD, a control's fill on the tile: no border, no shadow (DIRECTION 39). */
  .read {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-3);
    border-radius: var(--r-md);
    background: var(--field);
    min-inline-size: 0;
  }

  .read-from {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  /* The same two tracks as the rule's lines above: the field's name as wide as a short label, then its value. */
  .read-fields {
    display: grid;
    grid-template-columns: minmax(8ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    font-size: var(--t-ui);
    line-height: var(--lh-body);
  }

  .read-fields dt {
    color: var(--dim);
  }

  .read-fields dd {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .read-fields dd.read-missed {
    color: var(--dim);
    font-style: italic;
  }

  .reads-note.reads-wait,
  .reads-note.reads-closed {
    margin-block-start: var(--sp-3);
  }

  /* The record's closing note is the news on a resolved question, so it reads a shade stronger than the counts. */
  .reads-note.reads-closed {
    color: var(--ink2);
  }

  /* What Accept does sits a step below the counts, as the last thing read before the press. */
  .reads-note.reads-accept {
    margin-block-start: var(--sp-1);
  }

  .reads-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-ui);
  }
</style>
