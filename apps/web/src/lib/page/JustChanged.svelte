<!--
  Just changed: the rows touched from this page in the last ten minutes, the latest first, each with what happened to it.

  NOTHING YOU TOUCH DISAPPEARS. A task ticked off a block that leaves done ones out, re-dated out of Today or deleted is
  still here, wearing what happened, so checking you hit the right one never means doing the opposite to look. Work held
  this by hand; a declared page holds it in its host (`row-host.svelte.ts`), because no declared kind can know what the
  reader just did. Not drawn while it holds nothing, and it empties itself.

  A LINE IS THE ROW: its words open it in the panel where the page still has it, and a deleted one carries Put back.
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import type { RowHost } from './row-host.svelte.ts';
  import { justNow, words } from './row-verbs.ts';

  let { host }: { host: RowHost } = $props();

  /* THE CLOCK THE LIST EMPTIES ITSELF BY, every thirty seconds while anything is in it. */
  $effect(() => {
    if (host.touched.size === 0) return;
    const t = setInterval(() => host.tickClock(), 30_000);
    return () => clearInterval(t);
  });

  /** At most five lines: this is a way back to what was just done, not a second list. */
  const lines = $derived(justNow(host.touched, host.clock).slice(0, 5));
</script>

{#if lines.length > 0}
  <div class="just">
    <Tile icon="history" title={words.just} aria-live="polite">
      <ul class="just-lines">
        {#each lines as l (l.key)}
          <li class="just-line" data-gone={l.touch.gone ? '' : undefined}>
            {#if !l.touch.gone && host.entry(l.row)}
              <button type="button" class="just-what" onclick={() => host.open(l.row)}>{l.touch.title}</button>
            {:else}
              <span class="just-what">{l.touch.title}</span>
            {/if}
            <span class="just-mark">{l.touch.mark}</span>
            {#if l.touch.gone && host.writable(l.row)}
              <button type="button" class="just-back tap" onclick={() => host.putBack(l.row)}>{words.putBack}</button>
            {/if}
          </li>
        {/each}
      </ul>
    </Tile>
  </div>
{/if}

<style>
  /* THE PAGE'S FIRST ROW, full width, so it reads as what you just did before what the page holds. */
  .just {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  .just-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .just-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--ctl-h);
    border-block-start: 1px solid var(--line-soft);
  }

  .just-line:first-child {
    border-block-start: 0;
  }

  .just-what {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button.just-what {
    cursor: pointer;
  }

  button.just-what:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* A DELETED ROW IS STRUCK THROUGH, a shape and not only a shade. */
  .just-line[data-gone] .just-what {
    color: var(--dim);
    text-decoration: line-through;
  }

  .just-mark {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .just-back {
    flex: none;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
</style>
