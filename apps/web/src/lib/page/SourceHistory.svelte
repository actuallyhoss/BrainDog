<!--
  A page's history, in the source view: every version of the page's text the record keeps, newest first, each said as
  who changed it and how long ago, and each with Put back and Save as a file.

  IT DRAWS AND IT ASKS, AND THAT IS ALL. The versions are handed in and the two verbs are handed out by the version's
  number: this reads nothing from the record and knows nothing of the box above it, so the source view decides what Put
  back writes and what Save writes, as it does for its own two buttons. The lines are worded in `source-history.ts`,
  which Node tests.

  THE PAGE AS IT IS NOW HAS NO PUT BACK: there is nothing to put back to. It says "On the page now" in words, and keeps
  its Save.

  ONE TILE, AND A LIST INSIDE IT (DIRECTION 39). A line is the who and when on the left and its verbs on the right, and
  under a narrow screen the verbs wrap under the words instead of squeezing them.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import { historyWords, versionLines, type PageVersion } from './source-history.ts';

  let {
    versions,
    onputback,
    onsave,
    busy = null,
    disabled = false,
    me = null,
    names,
    now,
  }: {
    versions: readonly PageVersion[];
    /** Put the page back to this version. */
    onputback: (version: number) => void;
    /** Save this version's text as a file. */
    onsave: (version: number) => void;
    /** The version being put back now, which says so on its button; every other verb waits meanwhile. */
    busy?: number | null | undefined;
    /** Whether the verbs wait, as while the source view is applying. */
    disabled?: boolean | undefined;
    /** The reader's id, so their own changes read "You". */
    me?: string | null | undefined;
    /** The people the caller holds a name for, by id. */
    names?: ReadonlyMap<string, string> | undefined;
    /** The clock the distances are told from; the caller's, where it keeps one, so two lists on a screen agree. */
    now?: number | undefined;
  } = $props();

  const uid = $props.id();
  const lines = $derived(versionLines(versions, now ?? Date.now(), me ?? null, names ?? new Map()));
  const waits = $derived(disabled || busy !== null);
</script>

{#if lines.length > 0}
  <section class="history" aria-labelledby="{uid}-title">
    <header class="history-head">
      <h2 class="history-title" id="{uid}-title">{historyWords.title}</h2>
      <p class="history-summary">{historyWords.summary(lines.length)}</p>
    </header>
    <ol class="history-lines">
      {#each lines as line (line.version)}
        <li class="history-line">
          <p class="history-said">
            <span>{line.said}</span>
            {#if line.state}
              <span class="history-state">{line.state}</span>
            {/if}
          </p>
          <div class="history-verbs">
            {#if line.putBack}
              <Button weight="quiet" size="sm" disabled={waits} aria-label={line.putBack} onclick={() => onputback(line.version)}>
                {busy === line.version ? historyWords.puttingBack : historyWords.putBack}
              </Button>
            {/if}
            <Button weight="quiet" size="sm" disabled={waits} aria-label={line.save} onclick={() => onsave(line.version)}>
              {historyWords.save}
            </Button>
          </div>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  /* A TILE: flat, opaque, no border, no shadow, the board's radius. */
  .history {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--tile-r);
  }

  .history-head {
    display: grid;
    gap: var(--sp-1);
  }

  .history-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .history-summary {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .history-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE WORDS TAKE THE ROOM AND THE VERBS KEEP THEIR SIZE; on a phone the verbs drop under the words. */
  .history-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    min-inline-size: 0;
    padding-block: var(--sp-2);
  }

  .history-line + .history-line {
    border-block-start: 1px solid var(--line);
  }

  .history-said {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    overflow-wrap: anywhere;
  }

  /* SAID IN WORDS, AND QUIET: which line is the page now is a fact, not a warning, so it takes no colour. */
  .history-state {
    color: var(--ink2);
  }

  .history-verbs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
