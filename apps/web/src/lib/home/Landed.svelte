<!--
  What landed: what arrived since the reader last looked, a line each (Today as the desk).

  WHEN, WHO, WHAT, AND WHERE IT WAS FILED, as the prototype's Arrivals draw them: the name in the heavier weight, its
  note after it in the quiet ink, and the list at the right with a tick. The lines are Home's own read of `whatsNew`, the
  same read the read mark is stamped from, so what is drawn here is what the mark will say was seen.

  A LINE THAT ARRIVES WHILE THE READER LOOKS is washed in `--arrived-wash` and the wash fades (Home reads the record
  again when it moves). Under reduced motion it holds and goes in one step. NOTHING IS DRAWN FOR NOTHING.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { freshOf, type Landed } from './landed.ts';

  let { rows }: { rows: readonly Landed[] } = $props();

  const words = { title: 'What landed', all: 'Activity' } as const;

  /* The keys drawn before this read: a line not among them came while the reader looked. `null` until the first read. */
  let before: ReadonlySet<string> | null = null;
  const fresh = $derived.by(() => {
    const now = freshOf(before, rows);
    before = new Set(rows.map((r) => r.key));
    return now;
  });
</script>

{#if rows.length > 0}
  <Tile icon="activity" title={words.title} count={rows.length} href="/audit" hrefLabel={words.all} data-landed>
    <ul class="stream">
      {#each rows as r (r.key)}
        <li class="l-row" data-arrived={fresh.has(r.key) ? '' : undefined}>
          <span class="l-at num">{r.at}</span>
          <span class="l-face"><Face name={r.who} kind={r.kind} run={r.run} size="s" /></span>
          <span class="l-what" dir="auto">
            {#if r.href}<a class="l-name" href={at(r.href)}>{r.name}</a>{:else}<b class="l-name">{r.name}</b>{/if}
            {#if r.note}<span class="l-note">{r.note}</span>{/if}
            <span class="l-who">{r.who}</span>
          </span>
          {#if r.to}<span class="l-to"><Icon name="check" size="s" />{r.to}</span>{/if}
        </li>
      {/each}
    </ul>
  </Tile>
{/if}

<style>
  .stream {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .l-row {
    display: grid;
    grid-template-columns: 4.5rem auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) 0;
    border-radius: var(--r-md);
    font-size: var(--t-base);
  }

  .l-row + .l-row {
    border-block-start: 1px solid var(--rule);
  }

  .l-row[data-arrived] {
    animation: landed 1.5s var(--ease-out);
  }

  @keyframes landed {
    from {
      background-color: var(--arrived-wash);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .l-row[data-arrived] {
      animation: landed 1.5s step-end;
    }
  }

  .l-at {
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  .l-what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .l-name {
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
  }

  /* A finger needs the full target the layout gate measures. */
  @media (pointer: coarse) {
    .l-name {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  .l-note,
  .l-who {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .l-to {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  /* ON A PHONE the list moves under the line, and the time and the list share a second line, so nothing is cut. */
  @media (width < 640px) {
    .l-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'face what what'
        '. at to';
      row-gap: 2px;
    }

    .l-face {
      grid-area: face;
    }

    .l-what {
      grid-area: what;
    }

    .l-at {
      grid-area: at;
    }

    .l-to {
      grid-area: to;
    }
  }
</style>
