<!--
  Each import, and his answer to whether all of it is his own (untrusted text drops the run to Ask).
  It sits in the trust tile under the two lines no rung reaches, and `TrustRows.svelte` loads it only when the
  record holds an import, so nothing of it reaches a screen that has none.

  ONE SENTENCE AN IMPORT, TWO PRESSES while he has not said: "It is mine" and "Treat it as outside text". Once he has,
  the line says what he chose and one "Change" opens the two again. Nothing is chosen for him and nothing asks by itself.

  REREAD AFTER THE PRESS, not patched in place, so the line says what the record now holds. A press that did not land
  shows the record's sentence beside it.
-->
<script lang="ts">
  import { adoptImport, importLine, importLists, words, type ImportRow, type ImportsClient } from './imports.ts';
  import Button from './Button.svelte';

  let { imports, client, reread }: { imports: ImportRow[]; client: () => ImportsClient; reread: () => Promise<void> } = $props();

  /** The import whose press is on its way, so it is not sent twice. */
  let pressing = $state<string | null>(null);
  /** The record's sentence for a press that did not land, beside the import it was for. */
  let failed = $state<{ run: string; fix: string } | null>(null);
  /** The imports he pressed "Change" on, which show the two answers again until one lands. */
  let reopened = $state<string[]>([]);

  const now = Date.now();
  const open = (r: ImportRow): boolean => r.adopted === null || reopened.includes(r.run);

  async function answer(r: ImportRow, yes: boolean): Promise<void> {
    if (pressing !== null) return;
    pressing = r.run;
    failed = null;
    const out = await adoptImport(client(), r.run, yes);
    if (out.ok) {
      await reread();
      reopened = reopened.filter((run) => run !== r.run);
    } else failed = { run: r.run, fix: out.fix };
    pressing = null;
  }
</script>

<section class="import-ask" aria-label={words.title}>
  <h3 class="import-head">{words.title}</h3>
  <ul class="import-lines">
    {#each imports as r (r.run)}
      {@const said = importLine(open(r) ? { ...r, adopted: null } : r, now)}
      <li class="import-line">
        <div class="import-text">
          <span class="import-said">{said}</span>
          {#if r.lists.length > 0}
            <!-- `dir="auto"`: the lists are named as he named them, in whatever script he chose. -->
            <span class="import-lists" dir="auto">{importLists(r)}</span>
          {/if}
          {#if failed?.run === r.run}
            <span class="import-lists" role="status" dir="auto">{failed.fix}</span>
          {/if}
        </div>
        <div class="import-presses">
          {#if open(r)}
            <Button size="sm" disabled={pressing !== null} aria-label={`${words.mine}: ${said}`} onclick={() => void answer(r, true)}>{words.mine}</Button>
            <Button size="sm" disabled={pressing !== null} aria-label={`${words.outside}: ${said}`} onclick={() => void answer(r, false)}>{words.outside}</Button>
          {:else}
            <Button size="sm" disabled={pressing !== null} aria-label={`${words.change}: ${said}`} onclick={() => (reopened = [...reopened, r.run])}>{words.change}</Button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  /* UNDER THE FLOORS, on the tile's own fill: a quiet heading, then one line an import with a hairline between two. */
  .import-ask {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
  }

  .import-head {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(22px * var(--type, 1));
  }

  .import-lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE PRESSES SIT AT THE LINE'S END, and wrap under the words when a narrow screen has no room for both. */
  .import-line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-3);
    align-items: center;
    justify-content: space-between;
    min-block-size: var(--row-h);
    padding-block: var(--sp-2);
  }

  .import-line + .import-line {
    border-block-start: 1px solid var(--rule);
  }

  .import-text {
    display: grid;
    flex: 1 1 16rem;
    gap: 2px;
    min-inline-size: 0;
  }

  .import-said {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .import-lists {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .import-presses {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
