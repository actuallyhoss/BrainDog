<!--
  Where it was seen: the places the record met the row a page is about, newest first, in the record's own words.

  UNDER A SECTION THAT DECLARES `panel: seen` (`panel-of.ts`), on a person's, an organisation's or a project's page:
  "3 Oct · Notes: Spoke to Sara at Northbank about the renewal", eight lines at most, then "and N more", and the
  thing's other names in one sentence under them (`seen.ts`). What waits on the owner about it is a line too ("Waiting
  on you: ...").

  A QUIET LIST, NOT A TILE: the section above it is the tile and says the heading, so this draws lines in the board's
  text colours and nothing more. Seen nowhere, it says so in one muted line, so the tile is never a heading over
  nothing. Nothing is drawn while it reads or on a refusal.

  IT ONLY READS, so it is drawn on a page that does not write as well. A HOST PANEL loaded by `import()` from
  `BlockSlot.svelte` only, so neither this nor its styles reach the entry chunk.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { readSeen, seenLines, type Seen } from './seen.ts';

  let { register, seq, now, ondrew }: { register: string; seq: number; now: number; ondrew?: (drew: boolean) => void } = $props();

  let found = $state<Seen | null>(null);
  const shown = $derived(seenLines(found, now));

  async function load(row: { register: string; seq: number }) {
    const client = createClient({ base: apiBase() });
    const out = await readSeen((name, args) => client.call(name, args), row);
    /* AN ANSWER FOR A ROW THE PAGE HAS LEFT is dropped, so one page never lists another's places. */
    if (row.register === register && row.seq === seq) { found = out; ondrew?.(out !== null); }
  }

  $effect(() => {
    const row = { register, seq };
    untrack(() => {
      found = null;
      void load(row);
    });
  });
</script>

{#if shown.lines.length > 0}
  <div class="seen">
    <ul class="seen-list" aria-label={found?.name ? `Where ${found.name} was seen` : 'Where it was seen'}>
      {#each shown.lines as line, n (n)}
        <li class="seen-line">{line}</li>
      {/each}
    </ul>
    {#if shown.more}<p class="seen-more">{shown.more}</p>{/if}
    {#if shown.also}<p class="seen-also">{shown.also}</p>{/if}
  </div>
{:else if shown.none}
  <p class="seen-none">{shown.none}</p>
{/if}

<style>
  .seen {
    margin-block-start: var(--sp-2);
  }

  .seen-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE PLACE A LINE, wrapping on a phone rather than scrolling sideways. */
  .seen-line {
    min-width: 0;
    padding-block: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  /* SEEN NOWHERE: one quiet line under the heading, in the board's muted text. */
  .seen-none {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .seen-more,
  .seen-also {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }
</style>
