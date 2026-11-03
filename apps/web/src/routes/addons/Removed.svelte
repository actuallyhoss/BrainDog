<!--
  REMOVED, AND THE WAY BACK: under the installed add-ons, each one uninstalled inside the record's thirty
  days, when it went, what of it stays and in which lists, and one "Put back".

  LOADED ONLY WHEN THERE IS SOMETHING TO SAY: the page imports this file once `packsRemoved` has answered rows, so a
  record with nothing removed fetches none of it. Its styles are its own for the same reason.

  PUT BACK IS THE PAGE'S OWN PLAN-THEN-INSTALL (`onputback`): a module this build ships is planned and installed here,
  and anything else opens its own page, where its file is verified and its plan read. What the record says when it
  will not is said on the row, in its words.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { FRESH, PUT_BACK, binnedSaid, removedLines, versionSaid, type Removed, type Way } from './removed.ts';

  let {
    rows,
    now,
    wayOf,
    nameOf,
    held = false,
    onputback,
  }: {
    rows: readonly Removed[];
    now: number;
    wayOf: (r: Removed) => Way;
    /** The name the screen gives an add-on, for one the record could not title. */
    nameOf: (id: string) => string;
    /** True while the page is busy with another add-on, so no two writes race. */
    held?: boolean;
    /** Brings one back. Answers the line to say on its row, or `null` once it is back. */
    onputback: (r: Removed, name: string) => Promise<string | null>;
  } = $props();

  const lines = $derived(removedLines(rows, now));
  let going = $state<string | null>(null);
  let said = $state<Record<string, string>>({});

  async function putBack(r: Removed, name: string) {
    if (going !== null || held) return;
    going = r.id;
    said = { ...said, [r.id]: '' };
    try {
      const line = await onputback(r, name);
      said = { ...said, [r.id]: line ?? '' };
    } finally {
      going = null;
    }
  }
</script>

<Tile icon="archive" class="section" data-surface="tile" title={PUT_BACK.title} count={rows.length || undefined}>
  <div class="section-body">
    <ul class="ledger removed">
      {#each rows as r, i (r.id)}
        {@const l = lines[i]}
        {@const name = r.title || nameOf(r.id)}
        {@const way = wayOf(r)}
        {@const version = versionSaid(r.version, way.newest)}
        <li>
          <div class="line gone">
            <span class="gone-main">
              <span class="line-title gone-name">{name}</span>
              <span class="line-detail gone-line">{l?.when}. {l?.stayed}</span>
              {#if r.binned}<span class="line-detail gone-line">{binnedSaid(r.binned)}</span>{/if}
              {#if version}<span class="line-detail gone-line">{version}</span>{/if}
              {#if !r.back}<span class="line-detail gone-line">{FRESH}</span>{/if}
            </span>
            {#if way.kind === 'here'}
              <Button size="sm" disabled={held || going !== null} aria-busy={going === r.id} aria-label={PUT_BACK.label(name)} onclick={() => void putBack(r, name)}>
                {going === r.id ? PUT_BACK.going : PUT_BACK.idle}
              </Button>
            {:else}
              <Button size="sm" href={at(way.href)} aria-label={PUT_BACK.label(name)}>{PUT_BACK.idle}</Button>
            {/if}
            {#if said[r.id]}<p class="gone-said" role="status">{said[r.id]}</p>{/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>
</Tile>

<style>
  /* THE SAME ROW AS AN INSTALLED ONE, less the well and the switch: the words, then the one press on the edge. */
  .gone {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    min-block-size: var(--row-h-2);
  }

  .gone-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-block: var(--sp-1);
  }

  .gone-name {
    color: var(--ink-2);
  }

  /* THE WHOLE SENTENCE, wrapped at 390 rather than cut, at body size. */
  .gone-line {
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    white-space: normal;
  }

  .gone-said {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  @media (pointer: coarse) {
    .gone {
      min-block-size: 60px;
    }
  }
</style>
